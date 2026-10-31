//! The motion engine: cadence estimator, hysteresis and Show-full policy
//! behind one deterministic, clock-free API.

use super::cadence::CadenceEstimator;
use super::config::{MotionConfig, MotionConfigPatch};
use super::machine::{MachineState, initial_machine, is_walking_activity, is_walking_cadence, step_machine};
use super::show_full::{ShowFullPolicy, ShowFullState};
use super::types::{ActivityKind, MotionSnapshot, MotionState, Sample};

/// The Rust counterpart of the TypeScript motion store, minus sources and
/// timers. The platform drives it:
///
/// * [`push_sample`](Self::push_sample) for every sensor reading,
/// * [`tick`](Self::tick) on a timer so time-based transitions fire,
/// * [`force`](Self::force), [`configure`](Self::configure),
///   [`reset`](Self::reset) and the Show-full methods for user and app actions.
///
/// Every mutating method returns `true` when the [`MotionSnapshot`] (or, for
/// the Show-full methods, the policy state) changed, so a wrapper knows when to
/// notify its observers. Times are `f64` milliseconds on one clock chosen by the
/// platform; samples carry their own timestamp, which is also "now" for that call.
#[derive(Debug, Clone)]
pub struct MotionEngine {
    config: MotionConfig,
    estimator: CadenceEstimator,
    machine: MachineState,
    forced: Option<MotionState>,
    /// True once a `State` sample arrived, which bypasses the estimator.
    explicit: bool,
    /// Latest OS activity sample; while set, it (not the cadence) decides "walking".
    last_activity: Option<(ActivityKind, f64)>,
    show_full: ShowFullPolicy,
    snapshot: MotionSnapshot,
}

impl MotionEngine {
    /// A `still` engine created at `now` ms.
    pub fn new(config: MotionConfig, now: f64) -> Self {
        let config = config.bounded();
        let machine = initial_machine(now);
        Self {
            config,
            estimator: CadenceEstimator::new(),
            machine,
            forced: None,
            explicit: false,
            last_activity: None,
            show_full: ShowFullPolicy::default(),
            snapshot: MotionSnapshot {
                state: MotionState::Still,
                detected: MotionState::Still,
                forced: None,
                cadence: 0.0,
                entered_at: machine.entered_at,
                pending: None,
                pending_since: None,
                activity: None,
            },
        }
    }

    /// Replaces the number of Show-full taps after which moving mode stays off (default 3).
    #[must_use]
    pub fn with_suppress_after_taps(mut self, taps: u32) -> Self {
        self.show_full = ShowFullPolicy::new(taps);
        self
    }

    /// The current snapshot.
    pub fn snapshot(&self) -> &MotionSnapshot {
        &self.snapshot
    }

    /// The current config.
    pub fn config(&self) -> &MotionConfig {
        &self.config
    }

    /// Feeds one sensor reading. `State` samples bypass hysteresis; `Activity`
    /// and `Acceleration` samples go through the machine.
    pub fn push_sample(&mut self, sample: Sample) -> bool {
        // NaN or infinite numbers would poison the estimator's averages: ignore the sample.
        let finite = sample.t().is_finite()
            && match sample {
                Sample::Acceleration { x, y, z, .. } => x.is_finite() && y.is_finite() && z.is_finite(),
                _ => true,
            };
        if !finite {
            return false;
        }
        let now = sample.t();
        match sample {
            Sample::State { state, .. } => {
                self.explicit = true;
                self.last_activity = None;
                self.estimator.reset();
                self.machine = if state == self.machine.state {
                    MachineState {
                        pending: None,
                        pending_since: None,
                        progress_ms: 0.0,
                        progress_at: None,
                        ..self.machine
                    }
                } else {
                    MachineState {
                        state,
                        entered_at: now,
                        pending: None,
                        pending_since: None,
                        progress_ms: 0.0,
                        progress_at: None,
                    }
                };
                self.publish(now)
            }
            Sample::Activity {
                activity, confidence, ..
            } => {
                self.explicit = false;
                self.estimator.reset();
                self.last_activity = Some((activity, confidence));
                self.evaluate(now)
            }
            Sample::Acceleration { t, x, y, z } => {
                self.explicit = false;
                self.last_activity = None;
                self.estimator.push(t, x, y, z, &self.config);
                self.evaluate(now)
            }
        }
    }

    /// Re-evaluates time-based transitions. Call on a timer; see
    /// [`MotionConfig::tick_interval_ms`].
    pub fn tick(&mut self, now: f64) -> bool {
        self.evaluate(now)
    }

    /// Overrides the detected state (`None` removes the override). An active
    /// Show-full force is released by the policy, not by this call.
    pub fn force(&mut self, state: Option<MotionState>, now: f64) -> bool {
        self.forced = state;
        self.publish(now)
    }

    /// Merges `patch` into the config and re-evaluates. For live tuning.
    pub fn configure(&mut self, patch: &MotionConfigPatch, now: f64) -> bool {
        self.config = self.config.patched(patch);
        self.evaluate(now)
    }

    /// Forgets detection state, like stopping the TypeScript store: estimator
    /// and hysteresis restart from `still` at `now`. A force and the Show-full
    /// session survive, as they do in TypeScript.
    pub fn reset(&mut self, now: f64) -> bool {
        self.estimator.reset();
        self.machine = initial_machine(now);
        self.explicit = false;
        self.last_activity = None;
        self.publish(now)
    }

    /// Current Show-full policy state.
    pub fn show_full_state(&self) -> ShowFullState {
        self.show_full.state()
    }

    /// The user tapped "Show full form": force the still UI until the user
    /// really stops (detected `still`), or for good after enough taps.
    pub fn show_full(&mut self, now: f64) -> bool {
        // Force first, then record the tap: the policy is not "active" while the
        // force is applied, exactly like the TypeScript policy.
        let before = self.show_full.state();
        let changed = self.force(Some(MotionState::Still), now);
        self.show_full.tap();
        changed || before != self.show_full.state()
    }

    /// Starts a new Show-full session (taps and suppression cleared) and drops the force.
    pub fn reset_show_full_session(&mut self, now: f64) -> bool {
        let before = self.show_full.state();
        self.show_full.reset_session();
        let changed = self.force(None, now);
        changed || before != self.show_full.state()
    }

    fn evaluate(&mut self, now: f64) -> bool {
        if !self.explicit {
            let walking = match self.last_activity {
                Some((activity, confidence)) => is_walking_activity(activity, confidence, &self.config),
                None => is_walking_cadence(self.estimator.cadence(now, &self.config), &self.config),
            };
            self.machine = step_machine(&self.machine, now, walking, &self.config);
        }
        self.publish(now)
    }

    /// Rebuilds the snapshot; when it changed, lets the Show-full policy release
    /// its force. Returns whether the snapshot changed.
    fn publish(&mut self, now: f64) -> bool {
        let changed = self.rebuild(now);
        if changed && self.show_full.should_release(self.snapshot.detected) {
            self.forced = None;
            self.rebuild(now);
            self.show_full.release();
        }
        changed
    }

    fn rebuild(&mut self, now: f64) -> bool {
        let state = self.forced.unwrap_or(self.machine.state);
        let passive = self.explicit || self.last_activity.is_some();
        let next = MotionSnapshot {
            state,
            detected: self.machine.state,
            forced: self.forced,
            cadence: if passive {
                0.0
            } else {
                self.estimator.cadence(now, &self.config)
            },
            entered_at: if state == self.snapshot.state {
                self.snapshot.entered_at
            } else {
                now
            },
            pending: self.machine.pending,
            pending_since: self.machine.pending_since,
            activity: if self.explicit {
                None
            } else {
                self.last_activity.map(|(a, _)| a)
            },
        };
        if next == self.snapshot {
            return false;
        }
        self.snapshot = next;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn activity(t: f64, activity: ActivityKind) -> Sample {
        Sample::Activity {
            t,
            activity,
            confidence: 1.0,
        }
    }

    #[test]
    fn ignores_non_finite_samples() {
        let mut e = MotionEngine::new(MotionConfig::default(), 0.0);
        for (t, x, y, z) in [
            (f64::NAN, 0.0, 0.0, 9.8),
            (1.0, f64::INFINITY, 0.0, 9.8),
            (1.0, 0.0, f64::NEG_INFINITY, 9.8),
            (f64::INFINITY, 0.0, 0.0, f64::NAN),
        ] {
            assert!(!e.push_sample(Sample::Acceleration { t, x, y, z }));
        }
        assert!(!e.push_sample(activity(f64::NAN, ActivityKind::Walking)));
        assert_eq!(e.snapshot().state, MotionState::Still);
        assert_eq!(e.snapshot().cadence, 0.0);
        // The estimator was never touched: a later sample behaves like the first one.
        let mut fresh = MotionEngine::new(MotionConfig::default(), 0.0);
        let s = Sample::Acceleration {
            t: 5.0,
            x: 0.0,
            y: 0.0,
            z: 9.8,
        };
        assert_eq!(e.push_sample(s), fresh.push_sample(s));
        assert_eq!(e.snapshot(), fresh.snapshot());
    }

    #[test]
    fn new_bounds_the_config() {
        let config = MotionConfig {
            min_step_interval_ms: 0.0,
            ..MotionConfig::default()
        };
        assert_eq!(MotionEngine::new(config, 0.0).config().min_step_interval_ms, 1.0);
    }

    #[test]
    fn reports_whether_the_snapshot_changed() {
        let mut e = MotionEngine::new(MotionConfig::default(), 0.0);
        assert!(e.push_sample(activity(0.0, ActivityKind::Walking)));
        assert!(!e.tick(1000.0));
        assert!(e.tick(5000.0));
        assert_eq!(e.snapshot().state, MotionState::Moving);
    }

    #[test]
    fn force_survives_reset_but_detection_restarts() {
        let mut e = MotionEngine::new(MotionConfig::default(), 0.0);
        e.push_sample(Sample::State {
            t: 10.0,
            state: MotionState::Moving,
        });
        e.force(Some(MotionState::Still), 20.0);
        e.reset(30.0);
        let s = e.snapshot();
        assert_eq!(
            (s.state, s.detected, s.forced),
            (MotionState::Still, MotionState::Still, Some(MotionState::Still))
        );
    }

    #[test]
    fn show_full_is_released_when_the_user_stops() {
        let mut e = MotionEngine::new(MotionConfig::default(), 0.0);
        e.push_sample(Sample::State {
            t: 0.0,
            state: MotionState::Moving,
        });
        e.show_full(1.0);
        assert_eq!(e.snapshot().state, MotionState::Still);
        e.push_sample(Sample::State {
            t: 2.0,
            state: MotionState::Still,
        });
        assert_eq!(e.snapshot().forced, None);
        assert!(!e.show_full_state().active);
    }
}
