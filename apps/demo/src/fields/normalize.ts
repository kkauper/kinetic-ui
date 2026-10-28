import { normalizeEmail } from '@kinetic-ui/core';
import type { FormModel } from '@kinetic-ui/core';

/** Cleans every email-format text answer (stray spaces, domain case) before validation. */
export function normalizeEmailAnswers(model: FormModel): void {
  for (const field of model.schema.fields) {
    if (field.kind !== 'text' || field.format !== 'email') continue;
    const value = model.getState().answers[field.id];
    if (typeof value !== 'string') continue;
    const normalized = normalizeEmail(value);
    if (normalized !== value) model.setAnswer(field.id, normalized === '' ? undefined : normalized);
  }
}
