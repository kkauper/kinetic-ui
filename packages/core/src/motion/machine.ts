import type { MotionConfig } from './config';
import type { ActivityKind, MotionState } from './types';

export interface MachineState {
  state: MotionState;
  enteredAt: number;
  /** State we are leaning toward but have not committed to yet. */
  pending: MotionState | null;
  pendingSince: number | null;
}

export function initialMachine(now: number): MachineState {
  return { state: 'still', enteredAt: now, pending: null, pendingSince: null };
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
 * Pure hysteresis step: a change of state is committed only after the opposite
 * condition has held continuously for the configured time. Returns the same
 * reference when nothing changed.
 */
export function stepMachine(
  m: MachineState,
  input: { now: number; walking: boolean },
  config: MotionConfig,
): MachineState {
  const target: MotionState = input.walking ? 'moving' : 'still';
  if (target === m.state) {
    return m.pending === null ? m : { ...m, pending: null, pendingSince: null };
  }
  if (m.pending !== target || m.pendingSince === null) {
    return { ...m, pending: target, pendingSince: input.now };
  }
  const needed = target === 'moving' ? config.enterMovingAfterMs : config.exitMovingAfterMs;
  if (input.now - m.pendingSince >= needed) {
    return { state: target, enteredAt: input.now, pending: null, pendingSince: null };
  }
  return m;
}
