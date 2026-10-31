import type { ActivityKind } from './types';

// Tune these on a real phone with the debug overlay.

export interface MotionConfig {
  /** Cadence band (steps per second) treated as walking. */
  minCadence: number;
  maxCadence: number;
  /**
   * Activity classes (from OS classifiers) treated as walking. Running is left
   * out like in the cadence band: the full form is safer while running or in a vehicle.
   */
  movingActivities: ActivityKind[];
  /** Activity samples below this confidence (0..1) do not count as walking. */
  minActivityConfidence: number;
  /** Sustained walking needed before switching to moving. */
  enterMovingAfterMs: number;
  /** Sustained non-walking needed before switching back to still. */
  exitMovingAfterMs: number;
  /** Window of recent steps used to estimate cadence. */
  cadenceWindowMs: number;
  /** Minimum number of steps in the window before cadence is reported. */
  minStepsForCadence: number;
  /**
   * Floor (m/s^2) of the adaptive step threshold: the smoothed acceleration above the running baseline
   * must exceed max(this, a share of the recent peak height) to count as a step. Hand-held walking
   * bounces only about 0.3 to 1 m/s^2.
   */
  stepThreshold: number;
  /** Refractory period between steps (caps detectable cadence at 1000/ms steps/s). Must sit clearly below the period of the fastest rhythm to measure: at 250 a 4 steps/s shake was halved by sample jitter. */
  minStepIntervalMs: number;
  /** Time constant of the low-pass on the step signal; sample-rate independent (about 55 ms matches the old 50 Hz coefficient 0.3). */
  signalSmoothingMs: number;
  /** Time constant of the slow average that removes gravity (about 1 s). */
  baselineMs: number;
  /** How often the store re-evaluates time-based transitions while running. */
  tickIntervalMs: number;
}

export const DEFAULT_MOTION_CONFIG: MotionConfig = {
  minCadence: 1.5,
  maxCadence: 2.5,
  movingActivities: ['walking'],
  minActivityConfidence: 0.5,
  enterMovingAfterMs: 3000,
  exitMovingAfterMs: 10000,
  cadenceWindowMs: 4000,
  minStepsForCadence: 4,
  stepThreshold: 0.3,
  minStepIntervalMs: 200,
  signalSmoothingMs: 55,
  baselineMs: 1000,
  tickIntervalMs: 500,
};

/** Lower bound of `minStepIntervalMs`: a zero interval would let every sample count as a step. */
export const MIN_STEP_INTERVAL_FLOOR_MS = 1;
/** Upper bound of `cadenceWindowMs` (5 minutes): the step history it keeps stays small. */
export const MAX_CADENCE_WINDOW_MS = 300_000;

/**
 * `config` with the values that bound memory kept in range: `minStepIntervalMs` at least 1 ms and
 * `cadenceWindowMs` at most 5 minutes. A non-finite value falls back to the default. Defaults are
 * unchanged. Mirrors `MotionConfig::bounded` in the Rust core.
 */
export function boundMotionConfig(config: MotionConfig): MotionConfig {
  const minStep = Number.isFinite(config.minStepIntervalMs)
    ? Math.max(MIN_STEP_INTERVAL_FLOOR_MS, config.minStepIntervalMs)
    : DEFAULT_MOTION_CONFIG.minStepIntervalMs;
  const window = Number.isFinite(config.cadenceWindowMs)
    ? Math.min(MAX_CADENCE_WINDOW_MS, config.cadenceWindowMs)
    : DEFAULT_MOTION_CONFIG.cadenceWindowMs;
  return { ...config, minStepIntervalMs: minStep, cadenceWindowMs: window };
}
