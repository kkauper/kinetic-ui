import { useSyncExternalStore } from 'react';
import type { ReadableStore } from '@kinetic-ui/core';

/** Subscribes a component to any core store (the store contract is framework-agnostic). */
export function useStore<T>(store: ReadableStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
