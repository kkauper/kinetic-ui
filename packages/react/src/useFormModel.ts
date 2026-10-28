import type { FormModel, FormState } from '@kinetic-ui/core';
import { useStore } from './useStore';

/** Current form state (answers, step, deferred ids, errors). */
export function useFormModel(model: FormModel): FormState {
  return useStore(model);
}
