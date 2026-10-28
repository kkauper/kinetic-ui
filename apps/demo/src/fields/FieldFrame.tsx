import type { ReactNode } from 'react';
import type { FieldSchema } from '@kinetic-ui/core';
import { fieldIds } from './ids';
import type { Presentation } from './types';

interface FieldFrameProps {
  field: FieldSchema;
  error: string | undefined;
  presentation: Presentation;
  labelAddon?: ReactNode;
  /** Native `<label for>` when the control is an input/button; a plain element otherwise. */
  labelFor?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Label, hint, control and error with the ids that tie them together.
 * In the stepper the visible question is the step heading, so the label is
 * visually hidden but still names the control.
 */
export function FieldFrame({ field, error, presentation, labelAddon, labelFor, className, children }: FieldFrameProps) {
  const ids = fieldIds(field.id);
  const labelClass = presentation === 'step' ? 'k-sr-only' : undefined;
  return (
    <div className={['k-field', className].filter(Boolean).join(' ')} data-field-id={field.id}>
      <div className="k-field__label-row">
        {labelFor ? (
          <label id={ids.label} htmlFor={labelFor} className={labelClass}>
            {field.label}
          </label>
        ) : (
          <span id={ids.label} className={labelClass}>
            {field.label}
          </span>
        )}
        {labelAddon}
      </div>
      {field.hint ? (
        <div id={ids.hint} className="k-field__hint">
          {field.hint}
        </div>
      ) : null}
      {children}
      {error ? (
        <div id={ids.error} className="k-field__error">
          {error}
        </div>
      ) : null}
    </div>
  );
}
