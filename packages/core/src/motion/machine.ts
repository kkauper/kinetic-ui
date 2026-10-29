import type { MotionConfig } from './config';
import type { ActivityKind, MotionState } from './types';

export interface MachineState {
  state: MotionState;
  enteredAt: number;
  /** State we are leaning toward but have not committed to yet. */
  pending: MotionState | null;
  /** When the lean started from zero progress. */
  pendingSince: number | null;
  /** Leaky progress (ms) toward `pending`; commits at the enter / exit delay. 0 without a pending change. */
  progressMs: number;
  /** Time of the last step that touched `progressMs`; null without a pending change. */
  progressAt: number | null;
}

/**
 * A miss (input that argues against the pending change) takes this many ms of progress back per ms
 * it lasts. A hit adds 1 per ms. 2 means walking must be seen about two thirds of the time to get
 * there, so one irregular window or a dropped-sample gap costs a little, while a real stop (a few
 * seconds in a row) still cancels a lean. Module constant, not a `MotionConfig` field, so the FFI
 * stays unchanged; it becomes a config field with the next FFI change.
 */
export const DECAY_RATIO = 2;

export function initialMachine(now: number): MachineState {
  return { state: 'still', enteredAt: now, pending: null, pendingSince: null, progressMs: 0, progressAt: null };
}

/** Whether a cadence lies in the walking band (inclusive). */
export function isWalkingCadence(cadence: number, config: MotionConfig): boolean {
  return cadence >= config.minCadence && cadence <= config.maxCadence;
}

/** Whether an OS activity classification counts as walking (confident enough and listed). */
export function isWalkingActivity(activity: ActivityKind, confidence: number, config: MotionConfig): boolean {
  return confidence >= config.minActivityConfidence && config.movingActivities.includes(activity);
}

/**
 * Pure hysteresis step with a leaky accumulator: while the input argues for the other state,
 * progress grows by the time since the last step; while it argues for the current state, progress
 * shrinks by `DECAY_RATIO` times that time (and the lean is dropped at zero). The change is
 * committed when progress reaches the configured delay. Returns the same reference when nothing
 * changed.
 */
export function stepMachine(
  m: MachineState,
  input: { now: number; walking: boolean },
  config: MotionConfig,
): MachineState {
  const target: MotionState = input.walking ? 'moving' : 'still';
  const dt = m.progressAt === null ? 0 : Math.max(input.now - m.progressAt, 0);
  if (target === m.state) {
    if (m.pending === null) return m;
    const progressMs = m.progressMs - dt * DECAY_RATIO;
    if (progressMs <= 0) return { ...m, pending: null, pendingSince: null, progressMs: 0, progressAt: null };
    return { ...m, progressMs, progressAt: input.now };
  }
  if (m.pending !== target || m.pendingSince === null) {
    return { ...m, pending: target, pendingSince: input.now, progressMs: 0, progressAt: input.now };
  }
  const progressMs = m.progressMs + dt;
  const needed = target === 'moving' ? config.enterMovingAfterMs : config.exitMovingAfterMs;
  if (progressMs >= needed) {
    return { state: target, enteredAt: input.now, pending: null, pendingSince: null, progressMs: 0, progressAt: null };
  }
  return { ...m, progressMs, progressAt: input.now };
}
