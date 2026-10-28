export type Listener = () => void;

/** Minimal observable store, shaped for React's `useSyncExternalStore`. */
export interface ReadableStore<T> {
  getState(): T;
  subscribe(listener: Listener): () => void;
}

/** Tiny listener registry: `subscribe` returns an unsubscribe function. */
export function createEmitter(): { emit(): void; subscribe(listener: Listener): () => void } {
  const listeners = new Set<Listener>();
  return {
    emit() {
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
