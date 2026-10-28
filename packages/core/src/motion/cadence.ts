import type { MotionConfig } from './config';

export interface CadenceEstimator {
  push(sample: { t: number; x: number; y: number; z: number }): void;
  /** Steps per second, rounded to 0.1; 0 when there is no steady rhythm. */
  cadence(now: number): number;
  reset(): void;
}

const BASELINE_ALPHA = 0.02;
const SIGNAL_ALPHA = 0.3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Demo-grade step counter. The acceleration magnitude has gravity removed by
 * subtracting a slow moving average (the baseline), then is lightly smoothed.
 * A step is a rising crossing of `stepThreshold` at least `minStepIntervalMs`
 * after the previous step; the detector re-arms only once the signal drops
 * below zero, so one bounce counts once. Cadence is 1000 / the median interval
 * between steps in the recent window, and is 0 when there are too few steps or
 * the last step is overdue (the rhythm stopped).
 */
export function createCadenceEstimator(config: MotionConfig): CadenceEstimator {
  let baseline: number | null = null;
  let signal = 0;
  let armed = true;
  let steps: number[] = [];

  const prune = (now: number) => {
    steps = steps.filter((t) => now - t <= config.cadenceWindowMs);
  };

  return {
    push({ t, x, y, z }) {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      baseline = baseline === null ? magnitude : baseline + BASELINE_ALPHA * (magnitude - baseline);
      signal += SIGNAL_ALPHA * (magnitude - baseline - signal);
      if (signal < 0) {
        armed = true;
      } else if (armed && signal >= config.stepThreshold) {
        armed = false;
        const last = steps[steps.length - 1];
        if (last === undefined || t - last >= config.minStepIntervalMs) steps.push(t);
      }
      prune(t);
    },

    cadence(now) {
      prune(now);
      if (steps.length < config.minStepsForCadence) return 0;
      const intervals = steps.slice(1).map((t, i) => t - (steps[i] ?? t));
      const typical = median(intervals);
      const last = steps[steps.length - 1] ?? 0;
      if (typical <= 0 || now - last > 2 * typical) return 0;
      return Math.round(10000 / typical) / 10;
    },

    reset() {
      baseline = null;
      signal = 0;
      armed = true;
      steps = [];
    },
  };
}
