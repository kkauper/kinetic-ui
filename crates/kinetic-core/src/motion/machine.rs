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
    /// When the lean started, in ms.
    pub pending_since: Option<f64>,
}

/// A machine that is `still` since `now`.
pub fn initial_machine(now: f64) -> MachineState {
    MachineState {
        state: MotionState::Still,
        entered_at: now,
        pending: None,
        pending_since: None,
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

/// Pure hysteresis step: a change of state is committed only after the
/// opposite condition has held continuously for the configured time.
pub fn step_machine(m: &MachineState, now: f64, walking: bool, config: &MotionConfig) -> MachineState {
    let target = if walking {
        MotionState::Moving
    } else {
        MotionState::Still
    };
    if target == m.state {
        return MachineState {
            pending: None,
            pending_since: None,
            ..*m
        };
    }
    let since = match (m.pending, m.pending_since) {
        (Some(p), Some(since)) if p == target => since,
        _ => {
            return MachineState {
                pending: Some(target),
                pending_since: Some(now),
                ..*m
            };
        }
    };
    let needed = match target {
        MotionState::Moving => config.enter_moving_after_ms,
        MotionState::Still => config.exit_moving_after_ms,
    };
    if now - since >= needed {
        MachineState {
            state: target,
            entered_at: now,
            pending: None,
            pending_since: None,
        }
    } else {
        *m
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
        assert_eq!(step_machine(&m, 4999.0, true, &config).state, MotionState::Still);
        assert_eq!(step_machine(&m, 5000.0, true, &config).state, MotionState::Moving);
    }

    #[test]
    fn interrupted_lean_restarts_the_clock() {
        let config = MotionConfig::default();
        let m = step_machine(&initial_machine(0.0), 0.0, true, &config);
        let back = step_machine(&m, 3000.0, false, &config);
        assert_eq!(back.pending, None);
        let again = step_machine(&back, 4000.0, true, &config);
        assert_eq!(again.pending_since, Some(4000.0));
    }
}
