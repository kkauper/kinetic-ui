//! Step counter: acceleration samples in, steps per second out.

use super::config::MotionConfig;

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

/// Demo-grade step counter. The acceleration magnitude has gravity removed by
/// subtracting a slow moving average (the baseline), then is lightly smoothed.
/// Both averages use time constants, so the result does not depend on the
/// sample rate (phones deliver 50-100 Hz).
///
/// A step is a rising crossing of `step_threshold` at least
/// `min_step_interval_ms` after the previous step; the detector re-arms only
/// once the signal drops below zero, so one bounce counts once. Cadence is
/// 1000 / the median interval between steps in the recent window, and is 0
/// when there are too few steps or the last step is overdue (the rhythm
/// stopped).
///
/// The config is passed on every call so live tuning takes effect immediately.
#[derive(Debug, Clone)]
pub struct CadenceEstimator {
    baseline: Option<f64>,
    signal: f64,
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
        if self.signal < 0.0 {
            self.armed = true;
        } else if self.armed && self.signal >= config.step_threshold {
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
        let intervals: Vec<f64> = self.steps.windows(2).map(|w| w[1] - w[0]).collect();
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
}
