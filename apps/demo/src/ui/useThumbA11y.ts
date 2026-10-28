import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Radix Themes forwards aria props to the slider ROOT, but the element with
 * role="slider" is the inner Thumb, which gets no name and no aria-valuetext.
 * This hook sets them on the thumb after each render (Radix does not render
 * these attributes itself, so it never overwrites them).
 */
export function useThumbA11y(
  rootRef: RefObject<HTMLElement | null>,
  attrs: Record<string, string | undefined>,
): void {
  useLayoutEffect(() => {
    const thumb = rootRef.current?.querySelector<HTMLElement>('[role="slider"]');
    if (!thumb) return;
    for (const [name, value] of Object.entries(attrs)) {
      if (value === undefined) thumb.removeAttribute(name);
      else thumb.setAttribute(name, value);
    }
  });
}
