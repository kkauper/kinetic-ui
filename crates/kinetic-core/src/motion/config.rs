//! Tunable constants of the motion model. Tune them on a real phone.

use serde::{Deserialize, Serialize};

use super::types::ActivityKind;

/// Every tunable constant of the motion model. Defaults match the TypeScript core.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionConfig {
    /// Lower edge (inclusive) of the cadence band, in steps per second, treated as walking.
    pub min_cadence: f64,
    /// Upper edge (inclusive) of the cadence band.
    pub max_cadence: f64,
    /// Activity classes treated as walking. Running is left out like in the
    /// cadence band: the full form is safer while running or in a vehicle.
    pub moving_activities: Vec<ActivityKind>,
    /// Activity samples below this confidence (0..1) do not count as walking.
    pub min_activity_confidence: f64,
    /// Sustained walking needed before switching to moving.
    pub enter_moving_after_ms: f64,
    /// Sustained non-walking needed before switching back to still.
    pub exit_moving_after_ms: f64,
    /// Window of recent steps used to estimate cadence.
    pub cadence_window_ms: f64,
    /// Minimum number of steps in the window before cadence is reported.
    pub min_steps_for_cadence: u32,
    /// Floor (m/s^2) of the adaptive step threshold: the signal above the running baseline
    /// must exceed max(this, a share of the recent peak height) to count as a step.
    /// Hand-held walking bounces only about 0.3 to 1 m/s^2.
    pub step_threshold: f64,
    /// Refractory period between steps. Must sit clearly below the period of
    /// the fastest rhythm to measure.
    pub min_step_interval_ms: f64,
    /// Time constant of the low-pass on the step signal (sample-rate independent).
    pub signal_smoothing_ms: f64,
    /// Time constant of the slow average that removes gravity (about 1 s).
    pub baseline_ms: f64,
    /// Advisory: how often the platform should call `tick`. The engine itself
    /// has no timer and does not read this.
    pub tick_interval_ms: f64,
}

impl Default for MotionConfig {
    fn default() -> Self {
        Self {
            min_cadence: 1.5,
            max_cadence: 2.5,
            moving_activities: vec![ActivityKind::Walking],
            min_activity_confidence: 0.5,
            enter_moving_after_ms: 3000.0,
            exit_moving_after_ms: 10000.0,
            cadence_window_ms: 4000.0,
            min_steps_for_cadence: 4,
            step_threshold: 0.3,
            min_step_interval_ms: 200.0,
            signal_smoothing_ms: 55.0,
            baseline_ms: 1000.0,
            tick_interval_ms: 500.0,
        }
    }
}

/// A partial [`MotionConfig`]: absent keys keep their current value. This is
/// the shape of the `config` overrides in the spec fixtures.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MotionConfigPatch {
    /// See [`MotionConfig::min_cadence`].
    pub min_cadence: Option<f64>,
    /// See [`MotionConfig::max_cadence`].
    pub max_cadence: Option<f64>,
    /// See [`MotionConfig::moving_activities`].
    pub moving_activities: Option<Vec<ActivityKind>>,
    /// See [`MotionConfig::min_activity_confidence`].
    pub min_activity_confidence: Option<f64>,
    /// See [`MotionConfig::enter_moving_after_ms`].
    pub enter_moving_after_ms: Option<f64>,
    /// See [`MotionConfig::exit_moving_after_ms`].
    pub exit_moving_after_ms: Option<f64>,
    /// See [`MotionConfig::cadence_window_ms`].
    pub cadence_window_ms: Option<f64>,
    /// See [`MotionConfig::min_steps_for_cadence`].
    pub min_steps_for_cadence: Option<u32>,
    /// See [`MotionConfig::step_threshold`].
    pub step_threshold: Option<f64>,
    /// See [`MotionConfig::min_step_interval_ms`].
    pub min_step_interval_ms: Option<f64>,
    /// See [`MotionConfig::signal_smoothing_ms`].
    pub signal_smoothing_ms: Option<f64>,
    /// See [`MotionConfig::baseline_ms`].
    pub baseline_ms: Option<f64>,
    /// See [`MotionConfig::tick_interval_ms`].
    pub tick_interval_ms: Option<f64>,
}

impl MotionConfig {
    /// A copy of this config with every key present in `patch` replaced.
    #[must_use]
    pub fn patched(&self, patch: &MotionConfigPatch) -> Self {
        let p = patch.clone();
        Self {
            min_cadence: p.min_cadence.unwrap_or(self.min_cadence),
            max_cadence: p.max_cadence.unwrap_or(self.max_cadence),
            moving_activities: p.moving_activities.unwrap_or_else(|| self.moving_activities.clone()),
            min_activity_confidence: p.min_activity_confidence.unwrap_or(self.min_activity_confidence),
            enter_moving_after_ms: p.enter_moving_after_ms.unwrap_or(self.enter_moving_after_ms),
            exit_moving_after_ms: p.exit_moving_after_ms.unwrap_or(self.exit_moving_after_ms),
            cadence_window_ms: p.cadence_window_ms.unwrap_or(self.cadence_window_ms),
            min_steps_for_cadence: p.min_steps_for_cadence.unwrap_or(self.min_steps_for_cadence),
            step_threshold: p.step_threshold.unwrap_or(self.step_threshold),
            min_step_interval_ms: p.min_step_interval_ms.unwrap_or(self.min_step_interval_ms),
            signal_smoothing_ms: p.signal_smoothing_ms.unwrap_or(self.signal_smoothing_ms),
            baseline_ms: p.baseline_ms.unwrap_or(self.baseline_ms),
            tick_interval_ms: p.tick_interval_ms.unwrap_or(self.tick_interval_ms),
        }
    }
}

impl From<MotionConfig> for MotionConfigPatch {
    /// A patch that replaces every key.
    fn from(c: MotionConfig) -> Self {
        Self {
            min_cadence: Some(c.min_cadence),
            max_cadence: Some(c.max_cadence),
            moving_activities: Some(c.moving_activities),
            min_activity_confidence: Some(c.min_activity_confidence),
            enter_moving_after_ms: Some(c.enter_moving_after_ms),
            exit_moving_after_ms: Some(c.exit_moving_after_ms),
            cadence_window_ms: Some(c.cadence_window_ms),
            min_steps_for_cadence: Some(c.min_steps_for_cadence),
            step_threshold: Some(c.step_threshold),
            min_step_interval_ms: Some(c.min_step_interval_ms),
            signal_smoothing_ms: Some(c.signal_smoothing_ms),
            baseline_ms: Some(c.baseline_ms),
            tick_interval_ms: Some(c.tick_interval_ms),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_replaces_only_present_keys() {
        let patch: MotionConfigPatch = serde_json::from_str(r#"{"minCadence": 1.0, "movingActivities": []}"#).unwrap();
        let config = MotionConfig::default().patched(&patch);
        assert_eq!(config.min_cadence, 1.0);
        assert_eq!(config.moving_activities, Vec::<ActivityKind>::new());
        assert_eq!(config.max_cadence, 2.5);
    }

    #[test]
    fn full_patch_round_trips() {
        let config = MotionConfig {
            baseline_ms: 42.0,
            ..MotionConfig::default()
        };
        assert_eq!(MotionConfig::default().patched(&config.clone().into()), config);
    }
}
