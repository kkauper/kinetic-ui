/** DOM ids derived from a field id, shared by the frame and the controls. */
export function fieldIds(fieldId: string) {
  const base = `field-${fieldId}`;
  return {
    control: base,
    label: `${base}-label`,
    hint: `${base}-hint`,
    error: `${base}-error`,
  };
}

/** Space-separated `aria-describedby` for a field, or undefined if nothing to describe. */
export function describedBy(fieldId: string, hasHint: boolean, hasError: boolean): string | undefined {
  const ids = fieldIds(fieldId);
  const parts = [hasHint ? ids.hint : '', hasError ? ids.error : ''].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}
