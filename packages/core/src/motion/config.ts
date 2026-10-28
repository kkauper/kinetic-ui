// Tune these on a real phone with the debug overlay.

export interface MotionConfig {
  /** Cadence band (steps per second) treated as walking. */
  minCadence: number;
  maxCadence: number;
  /** Sustained walking needed before switching to moving. */
  enterMovingAfterMs: number;
  /** Sustained non-walking needed before switching back to still. */
  exitMovingAfterMs: number;
  /** Window of recent steps used to estimate cadence. */
  cadenceWindowMs: number;
  /** Minimum number of steps in the window before cadence is reported. */
  minStepsForCadence: number;
  /** Acceleration above the running baseline (m/s^2) that counts as a step peak. */
  stepThreshold: number;
  /** Refractory period between steps (caps detectable cadence at ~1000/ms). */
  minStepIntervalMs: number;
  /** How often the store re-evaluates time-based transitions while running. */
  tickIntervalMs: number;
}

export const DEFAULT_MOTION_CONFIG: MotionConfig = {
  minCadence: 1.5,
  maxCadence: 2.5,
  enterMovingAfterMs: 5000,
  exitMovingAfterMs: 10000,
  cadenceWindowMs: 4000,
  minStepsForCadence: 4,
  stepThreshold: 1.2,
  minStepIntervalMs: 250,
  tickIntervalMs: 500,
};
