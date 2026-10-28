import { createEmitter } from '../store';
import type { ReadableStore } from '../store';
import type { MotionStore } from './store';

export interface ShowFullState {
  /** User asked for the full form during the current moving episode. */
  active: boolean;
  taps: number;
  /** Moving mode suppressed for the rest of the session. */
  suppressed: boolean;
}

export interface ShowFullPolicy extends ReadableStore<ShowFullState> {
  showFull(): void;
  resetSession(): void;
  dispose(): void;
}

/**
 * Escape hatch for false positives. Each "Show full" tap forces the still UI;
 * the force is released once the user really stops, so the next walk can switch
 * to moving again. After `suppressAfterTaps` taps moving mode stays off.
 * A "session" is the lifetime of this object: the app decides how long that is
 * (create one per page load, per tab, or call `resetSession()`).
 */
export function createShowFullPolicy(
  store: MotionStore,
  options: { suppressAfterTaps?: number } = {},
): ShowFullPolicy {
  const suppressAfterTaps = options.suppressAfterTaps ?? 3;
  const emitter = createEmitter();
  let state: ShowFullState = { active: false, taps: 0, suppressed: false };

  const set = (next: ShowFullState) => {
    if (next.active === state.active && next.taps === state.taps && next.suppressed === state.suppressed) return;
    state = next;
    emitter.emit();
  };

  const unsubscribe = store.subscribe(() => {
    if (state.active && !state.suppressed && store.getState().detected === 'still') {
      store.force(null);
      set({ ...state, active: false });
    }
  });

  return {
    getState: () => state,
    subscribe: emitter.subscribe,

    showFull() {
      const taps = state.taps + 1;
      store.force('still');
      set({ active: true, taps, suppressed: taps >= suppressAfterTaps });
    },

    resetSession() {
      set({ active: false, taps: 0, suppressed: false });
      store.force(null);
    },

    dispose: unsubscribe,
  };
}
