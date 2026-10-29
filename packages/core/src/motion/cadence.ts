import type { MotionConfig } from './config';

export interface CadenceEstimator {
  push(sample: { t: number; x: number; y: number; z: number }): void;
  /** Steps per second, rounded to 0.1; 0 when there is no steady rhythm. */
  cadence(now: number): number;
  reset(): void;
}

/** Smoothing coefficient of an exponential average with time constant `tau` over a step of `dt` ms. */
const alphaFor = (dt: number, tau: number) => (dt <= 0 ? 0 : 1 - Math.exp(-dt / tau));

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Demo-grade step counter. The acceleration magnitude has gravity removed by
 * subtracting a slow moving average (the baseline), then is lightly smoothed.
 * Both averages use time constants, so the result does not depend on the
 * sample rate (phones deliver 50-100 Hz).
 * A step is a rising crossing of `stepThreshold` at least `minStepIntervalMs`
 * after the previous step; the detector re-arms only once the signal drops
 * below zero, so one bounce counts once. Cadence is 1000 / the median interval
 * between steps in the recent window, and is 0 when there are too few steps or
 * the last step is overdue (the rhythm stopped). Pass a getter to follow a
 * config that changes at runtime.
 */
export function createCadenceEstimator(configOrGetter: MotionConfig | (() => MotionConfig)): CadenceEstimator {
  const read = typeof configOrGetter === 'function' ? configOrGetter : () => configOrGetter;
  let baseline: number | null = null;
  let signal = 0;
  let armed = true;
  let lastT: number | null = null;
  let steps: number[] = [];

  const prune = (now: number) => {
    const { cadenceWindowMs } = read();
    steps = steps.filter((t) => now - t <= cadenceWindowMs);
  };

  return {
    push({ t, x, y, z }) {
      const config = read();
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const dt = lastT === null ? 0 : t - lastT;
      lastT = t;
      baseline = baseline === null ? magnitude : baseline + alphaFor(dt, config.baselineMs) * (magnitude - baseline);
      signal += alphaFor(dt, config.signalSmoothingMs) * (magnitude - baseline - signal);
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
      const config = read();
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
      lastT = null;
      steps = [];
    },
  };
}
