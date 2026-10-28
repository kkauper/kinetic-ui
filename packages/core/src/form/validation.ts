import type { AnswerValue, Answers, FieldSchema, FormSchema } from './schema';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Whether `value` counts as an answer for this field kind. */
export function isAnswered(field: FieldSchema, value: AnswerValue | undefined): boolean {
  switch (field.kind) {
    case 'text':
      return typeof value === 'string' && value.trim() !== '';
    case 'choice':
      return typeof value === 'string' && value !== '';
    case 'toggle':
      return typeof value === 'boolean';
    case 'slider':
      return typeof value === 'number';
  }
}

/** Returns a user-facing error message, or null if the value is acceptable. */
export function validateField(field: FieldSchema, value: AnswerValue | undefined): string | null {
  if (field.required && !isAnswered(field, value)) return `${field.label} is required.`;
  if (field.kind === 'text' && field.format === 'email' && typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed !== '' && !EMAIL_PATTERN.test(trimmed)) {
      return 'Enter a valid email address, like name@example.com.';
    }
  }
  return null;
}

/** Validates every field; the result contains only the failing ids. */
export function validateAll(schema: FormSchema, answers: Answers): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of schema.fields) {
    const error = validateField(field, answers[field.id]);
    if (error) errors[field.id] = error;
  }
  return errors;
}
