import type { MotionConfig } from './config';

/** Internal estimator values for the debug sheet. Unstable: debug use only, not part of the cross-platform contract. */
export interface CadenceDiagnostics {
  /** Smoothed estimate of the incoming sample rate (Hz); 0 before two samples. */
  sampleRateHz: number;
  /** Smoothed acceleration above the baseline (m/s^2). */
  signal: number;
  /** Average |signal| (m/s^2) over roughly `ENVELOPE_MS`. */
  envelope: number;
  /** The step threshold in use right now (m/s^2). */
  threshold: number;
  /** Steps currently inside the cadence window. */
  stepsInWindow: number;
  /** Coefficient of variation (stdev / mean) of the step intervals in the window; 0 with fewer than two intervals. */
  intervalCv: number;
  /** Time of the first step since the last reset; null before it. */
  firstStepAt: number | null;
}

export interface CadenceEstimator {
  push(sample: { t: number; x: number; y: number; z: number }): void;
  /** Steps per second, rounded to 0.1; 0 when there is no steady rhythm. */
  cadence(now: number): number;
  /**
   * Debug snapshot of the internals. Web-only and deliberately not mirrored in the Rust core: it is
   * not part of the shared behaviour, so it has no fixtures and may change without notice.
   */
  diagnostics(): CadenceDiagnostics;
  reset(): void;
}

/**
 * Time constant (ms) of the average of |signal| that sizes the step threshold. About three steps
 * of a slow walk, so one weak step does not move it much but a change of grip is followed in seconds.
 * Module constant, not a `MotionConfig` field, so the FFI and the generated Swift/Kotlin stay
 * unchanged; it becomes a config field with the next FFI change.
 */
const ENVELOPE_MS = 2000;

/**
 * The step threshold is `max(stepThreshold, ENVELOPE_RATIO * envelope)`. The envelope is the mean of
 * |signal|, about 0.5 to 0.6 of the peak height of a smoothed bounce, so 0.8 puts the threshold at
 * roughly 40 to 50 % of a typical peak: low enough to catch weaker steps, high enough to skip the
 * small wiggles between them. Becomes a config field with the next FFI change.
 */
const ENVELOPE_RATIO = 0.8;

/**
 * Real walking is periodic. When the coefficient of variation (stdev / mean) of the step intervals
 * in the window is above this, the "steps" are hand jitter or noise and the cadence is 0.
 * Becomes a config field with the next FFI change.
 */
const MAX_INTERVAL_CV = 0.25;

/**
 * Missed-step folding. A dropped run of samples (iOS lost 470 ms once in a real trace) or a soft
 * step leaves one interval at about 2 (or 3) times the usual one, which on its own would fail the
 * regularity check. An interval within `FOLD_TOLERANCE` of k times the median (k = 2 or 3) is
 * counted as k intervals of length interval / k. Becomes a config field with the next FFI change.
 */
const FOLD_TOLERANCE = 0.25;

/** Time constant (ms) of the smoothed sample interval behind `sampleRateHz` (diagnostics only). */
const RATE_MS = 1000;

/** Smoothing coefficient of an exponential average with time constant `tau` over a step of `dt` ms. */
const alphaFor = (dt: number, tau: number) => (dt <= 0 ? 0 : 1 - Math.exp(-dt / tau));

/** Splits intervals that are about 2 or 3 times the median into that many equal ones (see `FOLD_TOLERANCE`). */
function foldMissedSteps(intervals: number[]): number[] {
  if (intervals.length === 0) return intervals;
  const typical = median(intervals);
  if (typical <= 0) return intervals;
  const folded: number[] = [];
  for (const interval of intervals) {
    const k = Math.round(interval / typical);
    if ((k === 2 || k === 3) && Math.abs(interval - k * typical) <= FOLD_TOLERANCE * k * typical) {
      for (let i = 0; i < k; i++) folded.push(interval / k);
    } else {
      folded.push(interval);
    }
  }
  return folded;
}

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
 * A step is a rising crossing of the threshold at least `minStepIntervalMs`
 * after the previous step; the detector re-arms only once the signal drops
 * below zero, so one bounce counts once. The threshold adapts to how hard the
 * phone moves: `max(stepThreshold, ENVELOPE_RATIO * envelope)`, where
 * `stepThreshold` is the floor (noise level) and the envelope is the recent
 * mean |signal|. A phone held in the hand bounces far less than one in a
 * pocket, so a fixed threshold never fired there.
 * Cadence is 1000 / the median interval between steps in the recent window. It
 * is 0 when there are too few steps, when the last step is overdue (the
 * rhythm stopped), or when the intervals are irregular (coefficient of
 * variation above `MAX_INTERVAL_CV`): a lower threshold lets jitter produce
 * steps, but only walking is periodic. Pass a getter to follow a config that
 * changes at runtime.
 */
export function createCadenceEstimator(configOrGetter: MotionConfig | (() => MotionConfig)): CadenceEstimator {
  const read = typeof configOrGetter === 'function' ? configOrGetter : () => configOrGetter;
  let baseline: number | null = null;
  let signal = 0;
  let envelope = 0;
  let meanDt = 0;
  let armed = true;
  let lastT: number | null = null;
  let steps: number[] = [];
  let firstStepAt: number | null = null;

  const prune = (now: number) => {
    const { cadenceWindowMs } = read();
    steps = steps.filter((t) => now - t <= cadenceWindowMs);
  };

  const threshold = () => Math.max(read().stepThreshold, ENVELOPE_RATIO * envelope);

  const foldedIntervals = () => foldMissedSteps(steps.slice(1).map((t, i) => t - (steps[i] ?? t)));

  const intervalCv = () => {
    const intervals = foldedIntervals();
    if (intervals.length < 2) return 0;
    const mean = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
    if (mean <= 0) return 0;
    const variance = intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / intervals.length;
    return Math.sqrt(variance) / mean;
  };

  return {
    push({ t, x, y, z }) {
      const config = read();
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const dt = lastT === null ? 0 : t - lastT;
      lastT = t;
      baseline = baseline === null ? magnitude : baseline + alphaFor(dt, config.baselineMs) * (magnitude - baseline);
      signal += alphaFor(dt, config.signalSmoothingMs) * (magnitude - baseline - signal);
      // The threshold is read before this sample moves the envelope, so a peak does not raise its own bar.
      const limit = threshold();
      envelope += alphaFor(dt, ENVELOPE_MS) * (Math.abs(signal) - envelope);
      meanDt = meanDt === 0 ? dt : meanDt + alphaFor(dt, RATE_MS) * (dt - meanDt);
      if (signal < 0) {
        armed = true;
      } else if (armed && signal >= limit) {
        armed = false;
        const last = steps[steps.length - 1];
        if (last === undefined || t - last >= config.minStepIntervalMs) {
          steps.push(t);
          firstStepAt ??= t;
        }
      }
      prune(t);
    },

    cadence(now) {
      prune(now);
      const config = read();
      if (steps.length < config.minStepsForCadence) return 0;
      const intervals = foldedIntervals();
      if (intervalCv() > MAX_INTERVAL_CV) return 0;
      const typical = median(intervals);
      const last = steps[steps.length - 1] ?? 0;
      if (typical <= 0 || now - last > 2 * typical) return 0;
      return Math.round(10000 / typical) / 10;
    },

    diagnostics() {
      return {
        sampleRateHz: meanDt > 0 ? 1000 / meanDt : 0,
        signal,
        envelope,
        threshold: threshold(),
        stepsInWindow: steps.length,
        intervalCv: intervalCv(),
        firstStepAt,
      };
    },

    reset() {
      baseline = null;
      signal = 0;
      envelope = 0;
      meanDt = 0;
      firstStepAt = null;
      armed = true;
      lastT = null;
      steps = [];
    },
  };
}
