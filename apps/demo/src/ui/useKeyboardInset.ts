import { useEffect } from 'react';

/**
 * Publishes the height of the on-screen keyboard as `--k-keyboard-inset` on
 * <html>. Chrome on Android resizes the layout viewport (see the viewport
 * meta), so the value stays 0 there. iOS Safari keeps the layout viewport and
 * shrinks only `visualViewport`; the difference is the keyboard. The thumb bar
 * uses the variable to stay right above the keyboard.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const root = document.documentElement;
    if (!vv) return; // Old browsers: no inset, the layout simply stays as is.

    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty('--k-keyboard-inset', `${Math.round(inset)}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--k-keyboard-inset');
    };
  }, []);
}
