export type FieldKind = 'text' | 'choice' | 'toggle' | 'slider';

interface FieldBase {
  id: string;
  label: string;
  /** Optional helper text shown under the label. */
  hint?: string;
  required?: boolean;
  /** May be postponed to "questions for later" in the stepper. */
  deferrable?: boolean;
}

export interface TextFieldSchema extends FieldBase {
  kind: 'text';
  format?: 'email' | 'plain';
  autocomplete?: string;
}

export interface ChoiceFieldSchema extends FieldBase {
  kind: 'choice';
  options: { value: string; label: string }[];
}

export interface ToggleFieldSchema extends FieldBase {
  kind: 'toggle';
}

export interface SliderFieldSchema extends FieldBase {
  kind: 'slider';
  min: number;
  max: number;
  step: number;
  /** Labels for ends/steps, keyed by value. */
  valueLabels?: Record<string, string>;
  defaultValue?: number;
}

export type FieldSchema =
  | TextFieldSchema
  | ChoiceFieldSchema
  | ToggleFieldSchema
  | SliderFieldSchema;

export interface FormSchema {
  id: string;
  version: number;
  title: string;
  fields: FieldSchema[];
}

export type AnswerValue = string | boolean | number;
export type Answers = Record<string, AnswerValue | undefined>;

const FIELD_KINDS: readonly FieldKind[] = ['text', 'choice', 'toggle', 'slider'];

/**
 * Light runtime check for a schema loaded from JSON. Throws on the first
 * problem found; on success returns the input typed as `FormSchema`.
 */
export function defineSchema(json: unknown): FormSchema {
  const schema = json as FormSchema;
  if (!schema || !Array.isArray(schema.fields)) {
    throw new Error('Schema must be an object with a "fields" array.');
  }
  const seen = new Set<string>();
  for (const field of schema.fields) {
    const id = field?.id;
    if (typeof id !== 'string' || id === '') throw new Error('Every field needs a string "id".');
    if (seen.has(id)) throw new Error(`Duplicate field id "${id}".`);
    seen.add(id);
    if (!FIELD_KINDS.includes(field.kind)) {
      throw new Error(`Field "${id}" has unknown kind "${String(field.kind)}".`);
    }
    if (field.required && field.deferrable) {
      throw new Error(`Field "${id}" cannot be both required and deferrable.`);
    }
    if (field.kind === 'choice' && !(Array.isArray(field.options) && field.options.length >= 2)) {
      throw new Error(`Choice field "${id}" needs at least 2 options.`);
    }
    if (field.kind === 'slider' && !(field.min < field.max)) {
      throw new Error(`Slider field "${id}" needs min < max.`);
    }
  }
  return schema;
}
