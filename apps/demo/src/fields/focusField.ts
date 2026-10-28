
const FOCUSABLE = 'input, button, [role="slider"], [role="radio"], [role="switch"]';

/** Focuses the primary control of a field. Used for the first invalid field. */
export function focusField(fieldId: string): void {
  const root = document.querySelector<HTMLElement>(`[data-field-id="${CSS.escape(fieldId)}"]`);
  if (!root) return;
  const controls = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
  // In a radio group only the checked (or first) item is in the tab order.
  const target = controls.find((el) => el.tabIndex >= 0 && !el.hasAttribute('disabled')) ?? controls[0];
  target?.focus();
}
