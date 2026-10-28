import type { ReactNode } from 'react';
import type { AnswerValue, FieldSchema } from '@kinetic-ui/core';

export type Presentation = 'full' | 'step';

export interface FieldProps<F extends FieldSchema> {
  field: F;
  value: AnswerValue | undefined;
  error: string | undefined;
  onChange: (value: AnswerValue | undefined) => void;
  presentation: Presentation;
  /** Extra content rendered next to the label (e.g. a "Saved for later" badge). */
  labelAddon?: ReactNode;
  className?: string;
}
