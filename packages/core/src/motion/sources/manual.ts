import type { MotionSample, MotionSource, MotionState } from '../types';

export type ManualSource = MotionSource & { set(state: MotionState): void; get(): MotionState };

/** A source driven by an explicit toggle; emits its state on start and on every change. */
export function createManualSource(initial: MotionState = 'still'): ManualSource {
  let current = initial;
  let emit: ((sample: MotionSample) => void) | null = null;
  const send = () => emit?.({ kind: 'state', t: Date.now(), state: current });

  return {
    id: 'manual',
    start(onSample) {
      emit = onSample;
      send();
    },
    stop() {
      emit = null;
    },
    set(state) {
      current = state;
      send();
    },
    get: () => current,
  };
}
