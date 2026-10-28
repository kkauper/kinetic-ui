import type { MotionSource } from '@kinetic-ui/core';
import { motionStore } from '../stores';

/**
 * Switches the motion store to `source` and starts it. Call it directly from a
 * click handler with no `await` before it: iOS only grants motion permission
 * during the user gesture, and `start()` reaches the source synchronously.
 * Failures are shown from `snapshot.error`, so the rejection is swallowed.
 */
export function switchSource(source: MotionSource): Promise<void> {
  void motionStore.setSource(source).catch(() => undefined);
  return motionStore.start().catch(() => undefined);
}
