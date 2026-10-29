import { forwardRef } from 'react';

/**
 * A focusable but invisible input. iOS opens the keyboard only for focus() inside a user gesture,
 * and a view transition updates the DOM asynchronously. So the tap handler focuses this proxy
 * synchronously (the keyboard opens), and once the real input exists focus moves to it
 * programmatically, which keeps the keyboard open. Not display:none (unfocusable), 16px font
 * (no iOS zoom), hidden from assistive technology and the tab order.
 */
export const KeyboardProxy = forwardRef<HTMLInputElement>(function KeyboardProxy(_props, ref) {
  return <input ref={ref} className="k-kbd-proxy" aria-hidden="true" tabIndex={-1} readOnly={false} autoComplete="off" />;
});
