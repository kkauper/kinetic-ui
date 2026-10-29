const FOCUSABLE = 'input, button, [role="slider"], [role="radio"], [role="switch"]';

/** Focuses the primary control of a field. Used for the first invalid field and on every stepper step. */
export function focusField(fieldId: string, options?: FocusOptions): void {
  const root = document.querySelector<HTMLElement>(`[data-field-id="${CSS.escape(fieldId)}"]`);
  if (!root) return;
  // Radix Slider renders a hidden form <input> next to its thumb; skip anything not rendered.
  const controls = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
  // In a radio group only the checked (or first) item is in the tab order.
  const target = controls.find((el) => el.tabIndex >= 0 && !el.hasAttribute('disabled')) ?? controls[0];
  target?.focus(options);
}

/** Focuses the control of whichever field the stepper currently shows (no-op on the done step). */
export function focusStepperControl(): void {
  const root = document.querySelector<HTMLElement>('.k-stepper [data-field-id]');
  const id = root?.getAttribute('data-field-id');
  if (id) focusField(id);
}
