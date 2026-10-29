//! Step counter: acceleration samples in, steps per second out.

use super::config::MotionConfig;

/// Time constant (ms) of the average of |signal| that sizes the step threshold. About three steps
/// of a slow walk, so one weak step does not move it much but a change of grip is followed in
/// seconds. A module constant, not a `MotionConfig` field, so the FFI and the generated
/// Swift/Kotlin stay unchanged; it becomes a config field with the next FFI change.
const ENVELOPE_MS: f64 = 2000.0;

/// The step threshold is `max(step_threshold, ENVELOPE_RATIO * envelope)`. The envelope is the mean
/// of |signal|, about 0.5 to 0.6 of the peak height of a smoothed bounce, so 0.8 puts the
/// threshold at roughly 40 to 50 % of a typical peak. Becomes a config field with the next FFI change.
const ENVELOPE_RATIO: f64 = 0.8;

/// Real walking is periodic. When the coefficient of variation (stdev / mean) of the step
/// intervals in the window is above this, the "steps" are hand jitter or noise and the cadence is 0.
/// Becomes a config field with the next FFI change.
const MAX_INTERVAL_CV: f64 = 0.25;

/// Missed-step folding. A dropped run of samples (iOS lost 470 ms once in a real trace) or a soft
/// step leaves one interval at about 2 (or 3) times the usual one, which on its own would fail the
/// regularity check. An interval within `FOLD_TOLERANCE` of k times the median (k = 2 or 3) is
/// counted as k intervals of length interval / k. Becomes a config field with the next FFI change.
const FOLD_TOLERANCE: f64 = 0.25;

/// Splits intervals that are about 2 or 3 times the median into that many equal ones (see `FOLD_TOLERANCE`).
fn fold_missed_steps(intervals: &[f64]) -> Vec<f64> {
    if intervals.is_empty() {
        return Vec::new();
    }
    let typical = median(intervals);
    if typical <= 0.0 {
        return intervals.to_vec();
    }
    let mut folded = Vec::with_capacity(intervals.len());
    for &interval in intervals {
        // `round` differs from JS `Math.round` only for negative halves; the ratio is > 0.
        let k = (interval / typical).round();
        if (k == 2.0 || k == 3.0) && (interval - k * typical).abs() <= FOLD_TOLERANCE * k * typical {
            for _ in 0..k as usize {
                folded.push(interval / k);
            }
        } else {
            folded.push(interval);
        }
    }
    folded
}

/// Smoothing coefficient of an exponential average with time constant `tau` over a step of `dt` ms.
fn alpha_for(dt: f64, tau: f64) -> f64 {
    if dt <= 0.0 { 0.0 } else { 1.0 - (-dt / tau).exp() }
}

fn median(values: &[f64]) -> f64 {
    let mut sorted = values.to_vec();
    sorted.sort_by(f64::total_cmp);
    let mid = sorted.len() / 2;
    if sorted.len() % 2 == 1 {
        sorted[mid]
    } else {
        f64::midpoint(sorted[mid - 1], sorted[mid])
    }
}

/// Coefficient of variation (population stdev / mean) of the intervals; 0 with fewer than two.
fn interval_cv(intervals: &[f64]) -> f64 {
    if intervals.len() < 2 {
        return 0.0;
    }
    let n = intervals.len() as f64;
    let mean = intervals.iter().sum::<f64>() / n;
    if mean <= 0.0 {
        return 0.0;
    }
    let variance = intervals.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n;
    variance.sqrt() / mean
}

/// Demo-grade step counter. The acceleration magnitude has gravity removed by
/// subtracting a slow moving average (the baseline), then is lightly smoothed.
/// Both averages use time constants, so the result does not depend on the
/// sample rate (phones deliver 50-100 Hz).
///
/// A step is a rising crossing of the threshold at least
/// `min_step_interval_ms` after the previous step; the detector re-arms only
/// once the signal drops below zero, so one bounce counts once. The threshold
/// adapts to how hard the phone moves: `max(step_threshold, ENVELOPE_RATIO *
/// envelope)`, where `step_threshold` is the floor (noise level) and the
/// envelope is the recent mean |signal|. A phone held in the hand bounces far
/// less than one in a pocket, so a fixed threshold never fired there.
/// Cadence is 1000 / the median interval between steps in the recent window.
/// It is 0 when there are too few steps, when the last step is overdue (the
/// rhythm stopped), or when the intervals are irregular (coefficient of
/// variation above `MAX_INTERVAL_CV`, after missed-step folding): a lower threshold lets jitter produce
/// steps, but only walking is periodic.
///
/// The web core also has a debug-only `diagnostics()`; it is deliberately not
/// mirrored here (web-only, no shared fixtures).
///
/// The config is passed on every call so live tuning takes effect immediately.
#[derive(Debug, Clone)]
pub struct CadenceEstimator {
    baseline: Option<f64>,
    signal: f64,
    envelope: f64,
    armed: bool,
    last_t: Option<f64>,
    steps: Vec<f64>,
}

impl Default for CadenceEstimator {
    fn default() -> Self {
        Self::new()
    }
}

impl CadenceEstimator {
    /// A fresh estimator with no history.
    pub fn new() -> Self {
        Self {
            baseline: None,
            signal: 0.0,
            envelope: 0.0,
            armed: true,
            last_t: None,
            steps: Vec::new(),
        }
    }

    fn prune(&mut self, now: f64, config: &MotionConfig) {
        self.steps.retain(|&t| now - t <= config.cadence_window_ms);
    }

    /// Feeds one acceleration sample (m/s^2 including gravity) taken at `t` ms.
    pub fn push(&mut self, t: f64, x: f64, y: f64, z: f64, config: &MotionConfig) {
        let magnitude = (x * x + y * y + z * z).sqrt();
        let dt = self.last_t.map_or(0.0, |last| t - last);
        self.last_t = Some(t);
        let baseline = match self.baseline {
            None => magnitude,
            Some(b) => b + alpha_for(dt, config.baseline_ms) * (magnitude - b),
        };
        self.baseline = Some(baseline);
        self.signal += alpha_for(dt, config.signal_smoothing_ms) * (magnitude - baseline - self.signal);
        // The threshold is read before this sample moves the envelope, so a peak does not raise its own bar.
        let limit = config.step_threshold.max(ENVELOPE_RATIO * self.envelope);
        self.envelope += alpha_for(dt, ENVELOPE_MS) * (self.signal.abs() - self.envelope);
        if self.signal < 0.0 {
            self.armed = true;
        } else if self.armed && self.signal >= limit {
            self.armed = false;
            if self
                .steps
                .last()
                .is_none_or(|&last| t - last >= config.min_step_interval_ms)
            {
                self.steps.push(t);
            }
        }
        self.prune(t, config);
    }

    /// Steps per second at `now`, rounded to 0.1; 0 when there is no steady rhythm.
    pub fn cadence(&mut self, now: f64, config: &MotionConfig) -> f64 {
        self.prune(now, config);
        if self.steps.len() < config.min_steps_for_cadence as usize {
            return 0.0;
        }
        let raw: Vec<f64> = self.steps.windows(2).map(|w| w[1] - w[0]).collect();
        let intervals = fold_missed_steps(&raw);
        if interval_cv(&intervals) > MAX_INTERVAL_CV {
            return 0.0;
        }
        let typical = median(&intervals);
        let last = self.steps.last().copied().unwrap_or(0.0);
        if typical <= 0.0 || now - last > 2.0 * typical {
            return 0.0;
        }
        // JS `Math.round` rounds halves towards +infinity, `f64::round` away from
        // zero. They differ only for negative halves; this value is always > 0.
        (10000.0 / typical).round() / 10.0
    }

    /// Forgets all history (as if freshly created).
    pub fn reset(&mut self) {
        *self = Self::new();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_samples_means_no_cadence() {
        let mut e = CadenceEstimator::new();
        assert_eq!(e.cadence(1000.0, &MotionConfig::default()), 0.0);
    }

    #[test]
    fn median_of_even_and_odd_lengths() {
        assert_eq!(median(&[3.0, 1.0, 2.0]), 2.0);
        assert_eq!(median(&[4.0, 1.0, 2.0, 3.0]), 2.5);
    }

    #[test]
    fn reset_forgets_steps() {
        let config = MotionConfig::default();
        let mut e = CadenceEstimator::new();
        // 2 Hz bounce around 1 g sampled every 20 ms for 6 s.
        for i in 0..300 {
            let t = f64::from(i) * 20.0;
            let z = 9.81 + 4.0 * (std::f64::consts::TAU * 2.0 * t / 1000.0).sin();
            e.push(t, 0.0, 0.0, z, &config);
        }
        assert!(e.cadence(5980.0, &config) > 0.0);
        e.reset();
        assert_eq!(e.cadence(5980.0, &config), 0.0);
    }

    fn bounce(amplitude: f64, hz: f64, seconds: f64) -> (CadenceEstimator, f64) {
        let config = MotionConfig::default();
        let mut e = CadenceEstimator::new();
        let mut t = 0.0;
        while t <= seconds * 1000.0 {
            let z = 9.81 + amplitude * (std::f64::consts::TAU * hz * t / 1000.0).sin();
            e.push(t, 0.0, 0.0, z, &config);
            t += 1000.0 / 60.0;
        }
        (e, t)
    }

    #[test]
    fn adaptive_threshold_catches_a_hand_held_bounce() {
        // 0.6 m/s^2 is far below the old fixed threshold of 1.2.
        let (mut e, end) = bounce(0.6, 1.8, 8.0);
        let got = e.cadence(end, &MotionConfig::default());
        assert!((got - 1.8).abs() <= 0.15, "got {got}");
    }

    #[test]
    fn irregular_steps_report_no_cadence() {
        let config = MotionConfig::default();
        let mut e = CadenceEstimator::new();
        // Bumps 0.9, 0.3, 1.2, 0.3, 0.9 s apart: enough steps, but not periodic.
        let bumps = [500.0, 1400.0, 1700.0, 2900.0, 3200.0, 4100.0];
        let mut t = 0.0;
        while t <= 4500.0 {
            let z = 9.81
                + bumps
                    .iter()
                    .map(|b| 2.0 * (-((t - b) / 60.0_f64).powi(2)).exp())
                    .sum::<f64>();
            e.push(t, 0.0, 0.0, z, &config);
            t += 20.0;
        }
        assert!(e.steps.len() >= config.min_steps_for_cadence as usize);
        assert!(interval_cv(&fold_missed_steps(&[900.0, 300.0, 1200.0, 300.0, 900.0])) > MAX_INTERVAL_CV);
        assert_eq!(e.cadence(4500.0, &config), 0.0);
    }

    #[test]
    fn interval_cv_of_equal_intervals_is_zero() {
        assert_eq!(interval_cv(&[500.0, 500.0, 500.0]), 0.0);
        assert_eq!(interval_cv(&[500.0]), 0.0);
    }

    #[test]
    fn a_missed_step_is_folded_into_two_intervals() {
        let folded = fold_missed_steps(&[550.0, 560.0, 1110.0, 545.0, 555.0]);
        assert_eq!(folded.len(), 6);
        assert!(interval_cv(&folded) < 0.05);
        // 1.4 times the median is too far from 2 times: left alone.
        assert_eq!(fold_missed_steps(&[500.0, 500.0, 700.0, 500.0]).len(), 4);
    }
}
