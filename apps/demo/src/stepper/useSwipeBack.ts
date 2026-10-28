import { useRef } from 'react';
import type { PointerEvent } from 'react';

const MIN_DISTANCE = 60;
const IGNORE = 'input, textarea, select, [role="slider"], .rt-SliderRoot';

/**
 * Horizontal swipe right (> 60px, mostly horizontal) calls `onBack`. Gestures
 * starting in inputs or sliders are ignored. Spread the result on a container
 * that has `touch-action: pan-y`, so the browser keeps scrolling vertically
 * but does not cancel horizontal pointer streams.
 */
export function useSwipeBack(onBack: () => void) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);

  return {
    onPointerDown(event: PointerEvent) {
      const target = event.target as Element;
      start.current = target.closest(IGNORE)
        ? null
        : { x: event.clientX, y: event.clientY, id: event.pointerId };
    },
    onPointerUp(event: PointerEvent) {
      const origin = start.current;
      start.current = null;
      if (!origin || origin.id !== event.pointerId) return;
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (dx > MIN_DISTANCE && Math.abs(dx) > 2 * Math.abs(dy)) onBack();
    },
    onPointerCancel() {
      start.current = null;
    },
  };
}
