/**
 * Mode-change transition helpers (View Transitions API, same-document).
 * Pure DOM utilities: the React side lives in pages/Demo.tsx.
 */

/** The one element that morphs between the full form and the stepper. */
export const ACTIVE_FIELD_NAME = 'k-active-field';

type StartViewTransition = (update: () => void | Promise<void>) => { finished: Promise<void> };

export function viewTransitionsSupported(): boolean {
  return typeof document !== 'undefined' && typeof (document as { startViewTransition?: unknown }).startViewTransition === 'function';
}

export function startViewTransition(update: () => void): { finished: Promise<void> } {
  const start = (document as unknown as { startViewTransition: StartViewTransition }).startViewTransition;
  return start.call(document, update);
}

/** Where a field block lives in each presentation. */
export type Surface = 'full' | 'step';
const SURFACE_SELECTOR: Record<Surface, string> = {
  full: '.k-main .k-stack [data-field-id]',
  step: '.k-main .k-stepper [data-field-id]',
};

/** Gives `view-transition-name: k-active-field` to the field's block on one surface, and to nothing else. */
export function nameActiveField(surface: Surface, fieldId: string | null): void {
  clearActiveFieldName();
  if (fieldId === null) return;
  const el = [...document.querySelectorAll<HTMLElement>(SURFACE_SELECTOR[surface])].find(
    (node) => node.getAttribute('data-field-id') === fieldId,
  );
  if (el) el.style.setProperty('view-transition-name', ACTIVE_FIELD_NAME);
}

export function clearActiveFieldName(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-field-id]')) {
    el.style.removeProperty('view-transition-name');
  }
}

/** True while the browser still counts the current event as a user gesture (iOS keyboard rule). */
export function inUserGesture(): boolean {
  return (navigator as { userActivation?: { isActive: boolean } }).userActivation?.isActive === true;
}
