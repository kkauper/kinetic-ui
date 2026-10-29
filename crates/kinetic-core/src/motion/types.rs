//! Plain data types shared by the motion modules.

use serde::{Deserialize, Serialize};

/// The two UI modes: the full form, or the simplified one while walking.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MotionState {
    /// The user is not walking: show the full UI.
    Still,
    /// The user is walking: show the simplified UI.
    Moving,
}

/// Activity classes reported by OS classifiers (Core Motion, Activity Recognition).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActivityKind {
    /// Not moving.
    Stationary,
    /// On foot, walking.
    Walking,
    /// On foot, running.
    Running,
    /// On a bicycle.
    Cycling,
    /// In a vehicle.
    Automotive,
    /// The classifier could not tell.
    Unknown,
}

/// One input to the engine. `t` is in milliseconds on the platform's clock.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Sample {
    /// Raw acceleration in m/s^2 including gravity.
    Acceleration {
        /// Timestamp in ms.
        t: f64,
        /// X axis.
        x: f64,
        /// Y axis.
        y: f64,
        /// Z axis.
        z: f64,
    },
    /// For sources that already know the state (e.g. a manual toggle). Bypasses hysteresis.
    State {
        /// Timestamp in ms.
        t: f64,
        /// The stated motion state.
        state: MotionState,
    },
    /// Produced by native OS activity classifiers. iOS maps low/medium/high to
    /// 0.33/0.67/1; Android transitions carry no confidence and report 1.
    Activity {
        /// Timestamp in ms.
        t: f64,
        /// The classified activity.
        activity: ActivityKind,
        /// Confidence in 0..1.
        confidence: f64,
    },
}

impl Sample {
    /// The sample's timestamp in ms.
    pub fn t(&self) -> f64 {
        match *self {
            Sample::Acceleration { t, .. } | Sample::State { t, .. } | Sample::Activity { t, .. } => t,
        }
    }
}

/// Immutable view of the engine, replaced only when something observable changed.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionSnapshot {
    /// Effective state: `forced` if set, else `detected`. This is what UIs consume.
    pub state: MotionState,
    /// State chosen by the detector, ignoring any override.
    pub detected: MotionState,
    /// Override set by [`MotionEngine::force`](super::MotionEngine::force).
    pub forced: Option<MotionState>,
    /// Estimated steps per second, rounded to 0.1; 0 when there is no rhythm.
    pub cadence: f64,
    /// Time (ms) when `state` last changed. Time in state = now - `entered_at`.
    pub entered_at: f64,
    /// State the detector leans toward but has not committed to (hysteresis).
    pub pending: Option<MotionState>,
    /// When `pending` started, in ms.
    pub pending_since: Option<f64>,
    /// Latest OS activity class while the latest input is an activity sample.
    pub activity: Option<ActivityKind>,
}
