import type { ReadableStore } from '../store';
import { createEmitter } from '../store';
import type { FormPersistence } from './persistence';
import type { AnswerValue, Answers, FieldSchema, FormSchema } from './schema';
import { isAnswered, validateAll as validateAllFields, validateField } from './validation';

export interface FormState {
  answers: Answers;
  /** Index into schema.fields for the stepper. === fields.length means "all done / review". */
  currentStep: number;
  /** Field ids postponed via defer(), in deferral order. */
  deferred: string[];
  /** Validation errors by field id. Only set by next()/validateAll(), cleared on setAnswer for that field. */
  errors: Record<string, string>;
}

export interface FormModel extends ReadableStore<FormState> {
  readonly schema: FormSchema;
  /** Stores (or with `undefined`, removes) an answer and saves immediately. */
  setAnswer(id: string, value: AnswerValue | undefined): void;
  /** Validates the current field; on success advances and returns true. */
  next(): boolean;
  back(): void;
  /** Clamps to [0, fields.length]. */
  goTo(step: number): void;
  /** Postpones a deferrable field (default: current). Returns false if not deferrable. */
  defer(id?: string): boolean;
  /** Moves to the first field that is neither answered nor deferred, or to "done". */
  jumpToFirstUnanswered(): void;
  /** Full-form validation; sets all errors and returns true if there are none. */
  validateAll(): boolean;
  /** Clears answers, deferred, errors and stored data, and returns to step 0. */
  reset(): void;
  isAnswered(id: string): boolean;
  /** Deferred ids that are still unanswered. */
  pendingDeferred(): string[];
}

export interface FormModelOptions {
  persistence?: FormPersistence;
}

const EMPTY_STATE: FormState = { answers: {}, currentStep: 0, deferred: [], errors: {} };

export function createFormModel(schema: FormSchema, options: FormModelOptions = {}): FormModel {
  const { persistence } = options;
  const { fields } = schema;
  const emitter = createEmitter();

  const fieldAt = (id: string): FieldSchema | undefined => fields.find((f) => f.id === id);
  const requireField = (id: string): FieldSchema => {
    const field = fieldAt(id);
    if (!field) throw new Error(`Unknown field "${id}".`);
    return field;
  };
  const answered = (answers: Answers, field: FieldSchema) => isAnswered(field, answers[field.id]);

  function firstUnansweredStep(answers: Answers, deferred: string[]): number {
    const index = fields.findIndex((f) => !answered(answers, f) && !deferred.includes(f.id));
    return index === -1 ? fields.length : index;
  }

  function restore(): FormState {
    const stored = persistence?.load();
    if (!stored || stored.schemaId !== schema.id || stored.schemaVersion !== schema.version) {
      return EMPTY_STATE;
    }
    const answers: Answers = {};
    for (const [id, value] of Object.entries(stored.answers)) {
      if (fieldAt(id) && value !== undefined) answers[id] = value;
    }
    const deferred = stored.deferred.filter((id) => {
      const field = fieldAt(id);
      return field !== undefined && !answered(answers, field);
    });
    return { answers, deferred, errors: {}, currentStep: firstUnansweredStep(answers, deferred) };
  }

  let state: FormState = restore();

  function update(next: FormState, persist = false): void {
    if (next === state) return;
    const changedData = next.answers !== state.answers || next.deferred !== state.deferred;
    state = next;
    if (persist && changedData) {
      persistence?.save({
        schemaId: schema.id,
        schemaVersion: schema.version,
        answers: next.answers,
        deferred: next.deferred,
      });
    }
    emitter.emit();
  }

  const withStep = (step: number): FormState => {
    const clamped = Math.min(Math.max(step, 0), fields.length);
    return clamped === state.currentStep ? state : { ...state, currentStep: clamped };
  };

  const withoutError = (errors: Record<string, string>, id: string) => {
    if (!(id in errors)) return errors;
    const { [id]: _removed, ...rest } = errors;
    return rest;
  };

  return {
    schema,
    getState: () => state,
    subscribe: emitter.subscribe,

    setAnswer(id, value) {
      const field = requireField(id);
      if (state.answers[id] === value) return;
      const answers = { ...state.answers };
      if (value === undefined) delete answers[id];
      else answers[id] = value;
      const deferred =
        isAnswered(field, value) && state.deferred.includes(id)
          ? state.deferred.filter((d) => d !== id)
          : state.deferred;
      update({ ...state, answers, deferred, errors: withoutError(state.errors, id) }, true);
    },

    next() {
      const field = fields[state.currentStep];
      if (!field) return true;
      const error = validateField(field, state.answers[field.id]);
      if (error) {
        if (state.errors[field.id] === error) return false;
        update({ ...state, errors: { ...state.errors, [field.id]: error } });
        return false;
      }
      update({ ...withStep(state.currentStep + 1), errors: withoutError(state.errors, field.id) });
      return true;
    },

    back() {
      update(withStep(state.currentStep - 1));
    },

    goTo(step) {
      update(withStep(step));
    },

    defer(id) {
      const field = id === undefined ? fields[state.currentStep] : fieldAt(id);
      if (!field?.deferrable) return false;
      const deferred = state.deferred.includes(field.id) ? state.deferred : [...state.deferred, field.id];
      const errors = withoutError(state.errors, field.id);
      const isCurrent = fields[state.currentStep]?.id === field.id;
      const currentStep = isCurrent ? state.currentStep + 1 : state.currentStep;
      if (deferred === state.deferred && errors === state.errors && currentStep === state.currentStep) {
        return true;
      }
      update({ ...state, deferred, errors, currentStep }, true);
      return true;
    },

    jumpToFirstUnanswered() {
      update(withStep(firstUnansweredStep(state.answers, state.deferred)));
    },

    validateAll() {
      const errors = validateAllFields(schema, state.answers);
      const unchanged =
        Object.keys(errors).length === Object.keys(state.errors).length &&
        Object.entries(errors).every(([id, message]) => state.errors[id] === message);
      if (!unchanged) update({ ...state, errors });
      return Object.keys(errors).length === 0;
    },

    reset() {
      persistence?.clear();
      update(state === EMPTY_STATE ? state : EMPTY_STATE);
    },

    isAnswered: (id) => answered(state.answers, requireField(id)),
    pendingDeferred: () => state.deferred.filter((id) => !answered(state.answers, requireField(id))),
  };
}
