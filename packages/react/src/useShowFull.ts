import type { ShowFullPolicy, ShowFullState } from '@kinetic-ui/core';
import { useStore } from './useStore';

/** Current state of the "Show full form" escape hatch. */
export function useShowFull(policy: ShowFullPolicy): ShowFullState {
  return useStore(policy);
}
