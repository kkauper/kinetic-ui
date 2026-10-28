import type { MotionSnapshot, MotionStore } from '@kinetic-ui/core';
import { useStore } from './useStore';

/** Current motion snapshot; `.state` is the effective `'still' | 'moving'`. */
export function useMotion(store: MotionStore): MotionSnapshot {
  return useStore(store);
}
