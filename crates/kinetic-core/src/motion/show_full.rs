//! Escape hatch for false positives: "Show full form".
//!
//! The policy is plain state with no reference to the engine. The engine owns
//! one and consults it after every snapshot change (see
//! [`MotionEngine::show_full`](super::MotionEngine::show_full)). In TypeScript
//! the policy subscribes to the store; here the engine plays that role, which
//! keeps ownership simple and the behaviour identical.

use serde::{Deserialize, Serialize};

use super::types::MotionState;

/// Observable state of the policy.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowFullState {
    /// User asked for the full form during the current moving episode.
    pub active: bool,
    /// Taps in this session.
    pub taps: u32,
    /// Moving mode suppressed for the rest of the session.
    pub suppressed: bool,
}

/// Each "Show full" tap forces the still UI; the force is released once the
/// user really stops, so the next walk can switch to moving again. After
/// `suppress_after_taps` taps moving mode stays off. A "session" is the
/// lifetime of this value, or until [`reset_session`](Self::reset_session).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShowFullPolicy {
    state: ShowFullState,
    suppress_after_taps: u32,
}

impl Default for ShowFullPolicy {
    fn default() -> Self {
        Self::new(3)
    }
}

impl ShowFullPolicy {
    /// A policy that suppresses moving mode after `suppress_after_taps` taps (default 3).
    pub fn new(suppress_after_taps: u32) -> Self {
        Self {
            state: ShowFullState::default(),
            suppress_after_taps,
        }
    }

    /// Current state.
    pub fn state(&self) -> ShowFullState {
        self.state
    }

    /// Records a tap: active, one more tap, and suppressed from the threshold on.
    pub fn tap(&mut self) {
        let taps = self.state.taps + 1;
        self.state = ShowFullState {
            active: true,
            taps,
            suppressed: taps >= self.suppress_after_taps,
        };
    }

    /// Forgets taps and suppression.
    pub fn reset_session(&mut self) {
        self.state = ShowFullState::default();
    }

    /// Whether the force should be released now, given the detected state.
    pub fn should_release(&self, detected: MotionState) -> bool {
        self.state.active && !self.state.suppressed && detected == MotionState::Still
    }

    /// Marks the force as released.
    pub fn release(&mut self) {
        self.state.active = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn third_tap_suppresses_and_never_releases() {
        let mut p = ShowFullPolicy::default();
        p.tap();
        p.tap();
        assert!(!p.state().suppressed);
        p.tap();
        assert!(p.state().suppressed);
        assert!(!p.should_release(MotionState::Still));
    }

    #[test]
    fn releases_only_when_detected_still() {
        let mut p = ShowFullPolicy::default();
        p.tap();
        assert!(!p.should_release(MotionState::Moving));
        assert!(p.should_release(MotionState::Still));
        p.release();
        assert!(!p.should_release(MotionState::Still));
    }
}
