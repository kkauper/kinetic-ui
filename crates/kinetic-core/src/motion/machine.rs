//! The hysteresis reducer: a pure function from (state, input) to state.

use serde::{Deserialize, Serialize};

use super::config::MotionConfig;
use super::types::{ActivityKind, MotionState};

/// Detector state with hysteresis bookkeeping.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineState {
    /// Committed state.
    pub state: MotionState,
    /// When `state` was committed, in ms.
    pub entered_at: f64,
    /// State we are leaning toward but have not committed to yet.
    pub pending: Option<MotionState>,
    /// When the lean started from zero progress, in ms.
    pub pending_since: Option<f64>,
    /// Leaky progress (ms) toward `pending`; commits at the enter / exit delay. 0 without a pending change.
    pub progress_ms: f64,
    /// Time of the last step that touched `progress_ms`; `None` without a pending change.
    pub progress_at: Option<f64>,
}

/// A miss (input that argues against the pending change) takes this many ms of progress back per
/// ms it lasts. A hit adds 1 per ms. 2 means walking must be seen about two thirds of the time to
/// get there, so one irregular window or a dropped-sample gap costs a little, while a real stop (a
/// few seconds in a row) still cancels a lean. A constant, not a `MotionConfig` field, so the FFI
/// stays unchanged; it becomes a config field with the next FFI change.
pub const DECAY_RATIO: f64 = 2.0;

/// A machine that is `still` since `now`.
pub fn initial_machine(now: f64) -> MachineState {
    MachineState {
        state: MotionState::Still,
        entered_at: now,
        pending: None,
        pending_since: None,
        progress_ms: 0.0,
        progress_at: None,
    }
}

/// Whether a cadence lies in the walking band (inclusive).
pub fn is_walking_cadence(cadence: f64, config: &MotionConfig) -> bool {
    cadence >= config.min_cadence && cadence <= config.max_cadence
}

/// Whether an OS activity classification counts as walking (confident enough and listed).
pub fn is_walking_activity(activity: ActivityKind, confidence: f64, config: &MotionConfig) -> bool {
    confidence >= config.min_activity_confidence && config.moving_activities.contains(&activity)
}

/// Pure hysteresis step with a leaky accumulator: while the input argues for the other state,
/// progress grows by the time since the last step; while it argues for the current state, progress
/// shrinks by `DECAY_RATIO` times that time (and the lean is dropped at zero). The change is
/// committed when progress reaches the configured delay.
pub fn step_machine(m: &MachineState, now: f64, walking: bool, config: &MotionConfig) -> MachineState {
    let target = if walking {
        MotionState::Moving
    } else {
        MotionState::Still
    };
    let dt = m.progress_at.map_or(0.0, |at| (now - at).max(0.0));
    if target == m.state {
        if m.pending.is_none() {
            return *m;
        }
        let progress_ms = m.progress_ms - dt * DECAY_RATIO;
        if progress_ms <= 0.0 {
            return MachineState {
                pending: None,
                pending_since: None,
                progress_ms: 0.0,
                progress_at: None,
                ..*m
            };
        }
        return MachineState {
            progress_ms,
            progress_at: Some(now),
            ..*m
        };
    }
    if m.pending != Some(target) || m.pending_since.is_none() {
        return MachineState {
            pending: Some(target),
            pending_since: Some(now),
            progress_ms: 0.0,
            progress_at: Some(now),
            ..*m
        };
    }
    let progress_ms = m.progress_ms + dt;
    let needed = match target {
        MotionState::Moving => config.enter_moving_after_ms,
        MotionState::Still => config.exit_moving_after_ms,
    };
    if progress_ms >= needed {
        MachineState {
            state: target,
            entered_at: now,
            pending: None,
            pending_since: None,
            progress_ms: 0.0,
            progress_at: None,
        }
    } else {
        MachineState {
            progress_ms,
            progress_at: Some(now),
            ..*m
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commits_only_after_the_enter_delay() {
        let config = MotionConfig::default();
        let m = step_machine(&initial_machine(0.0), 0.0, true, &config);
        assert_eq!(m.pending, Some(MotionState::Moving));
        let enter = config.enter_moving_after_ms;
        assert_eq!(step_machine(&m, enter - 1.0, true, &config).state, MotionState::Still);
        assert_eq!(step_machine(&m, enter, true, &config).state, MotionState::Moving);
    }

    #[test]
    fn a_long_miss_cancels_the_lean() {
        let config = MotionConfig::default();
        let m = step_machine(&initial_machine(0.0), 0.0, true, &config);
        let back = step_machine(&m, 3000.0, false, &config);
        assert_eq!(back.pending, None);
        let again = step_machine(&back, 4000.0, true, &config);
        assert_eq!(again.pending_since, Some(4000.0));
    }

    #[test]
    fn a_brief_miss_only_costs_its_decay() {
        let config = MotionConfig::default();
        let m = step_machine(&initial_machine(0.0), 0.0, true, &config);
        let m = step_machine(&m, 2000.0, true, &config);
        assert_eq!(m.progress_ms, 2000.0);
        let m = step_machine(&m, 2300.0, false, &config);
        assert_eq!(m.pending, Some(MotionState::Moving));
        assert_eq!(m.progress_ms, 2000.0 - 300.0 * DECAY_RATIO);
        assert_eq!(m.pending_since, Some(0.0));
    }
}
