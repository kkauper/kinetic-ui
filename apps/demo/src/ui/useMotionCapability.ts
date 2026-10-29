import { useSyncExternalStore } from 'react';

const COARSE = '(pointer: coarse)';
const NO_HOVER = '(hover: none)';

/**
 * Whether this device can plausibly deliver real motion data. Decided by capability, not by
 * user-agent sniffing (which lies, breaks with iPadOS "desktop" mode and ages badly):
 *
 * - `isSecureContext`: the sensor APIs are blocked on plain http, so Walking mode could never work.
 * - `'DeviceMotionEvent' in window`: necessary but not sufficient. Desktop Chrome exposes the
 *   constructor and still has no sensor, so the event never fires.
 * - `(pointer: coarse)` and `(hover: none)`: a touch-first primary input with no hover is what
 *   phones and tablets report; laptops with a touchscreen keep a fine pointer and hover as primary.
 *
 * The media queries can change (a keyboard or mouse is attached to a tablet), so the hook listens
 * to their change events. It only reports; it never changes motion state.
 */
export function detectMotionCapability(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return (
    window.isSecureContext &&
    'DeviceMotionEvent' in window &&
    window.matchMedia(COARSE).matches &&
    window.matchMedia(NO_HOVER).matches
  );
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const lists = [window.matchMedia(COARSE), window.matchMedia(NO_HOVER)];
  for (const list of lists) list.addEventListener('change', onChange);
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange);
  };
}

/** `true` on a device that can sense walking (see {@link detectMotionCapability}). */
export function useMotionCapability(): boolean {
  return useSyncExternalStore(subscribe, detectMotionCapability, () => false);
}
