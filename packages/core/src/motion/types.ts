export type MotionState = 'still' | 'moving';

export type MotionSample =
  /** Raw acceleration in m/s^2 including gravity; `t` is in ms on the store clock. */
  | { kind: 'acceleration'; t: number; x: number; y: number; z: number }
  /** For sources that already know the state (e.g. a manual toggle). */
  | { kind: 'state'; t: number; state: MotionState };

export interface MotionSource {
  /** Stable id shown in the debug overlay, e.g. 'manual' | 'simulator' | 'accelerometer'. */
  readonly id: string;
  /** Begin emitting. May be async (e.g. iOS permission). Reject if it cannot start. */
  start(emit: (sample: MotionSample) => void): void | Promise<void>;
  stop(): void;
}

/** Structural subset of the global timer functions, so core needs no DOM types. */
export interface Scheduler {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface MotionSnapshot {
  /** Effective state: `forced ?? detected`. This is what UIs consume. */
  state: MotionState;
  detected: MotionState;
  forced: MotionState | null;
  /** Estimated steps per second, rounded to 0.1; 0 when no rhythm. */
  cadence: number;
  /** Timestamp (ms, store clock) when `state` last changed. Time in state = now - enteredAt. */
  enteredAt: number;
  /** State the detector is leaning toward but has not committed to (hysteresis), or null. */
  pending: MotionState | null;
  pendingSince: number | null;
  /** Id of the active source, or null. */
  source: string | null;
  running: boolean;
  /** Last start() failure message (e.g. permission denied), else null. */
  error: string | null;
}
