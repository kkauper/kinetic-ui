import type { SyntheticEvent } from 'react';

const prevent = (event: SyntheticEvent) => event.preventDefault();

/**
 * Spread on buttons that must not take focus from a text input on pointer
 * input (taps and clicks), so the phone keyboard stays open. Keyboard users
 * can still Tab to the button and press Enter or Space: preventDefault on
 * pointerdown/mousedown only stops the focus change, not the click.
 */
export const keepFocus = {
  onPointerDown: prevent,
  onMouseDown: prevent,
};
