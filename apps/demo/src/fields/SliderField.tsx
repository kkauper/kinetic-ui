import { useRef } from 'react';
import { Slider } from '@radix-ui/themes';
import type { SliderFieldSchema } from '@kinetic-ui/core';
import { useThumbA11y } from '../ui/useThumbA11y';
import { useUiSize } from '../ui/useUiSize';
import { FieldFrame } from './FieldFrame';
import { describedBy, fieldIds } from './ids';
import type { FieldProps } from './types';

export function SliderField({ field, value, error, onChange, presentation, labelAddon, className }: FieldProps<SliderFieldSchema>) {
  const { controlSize } = useUiSize();
  const ids = fieldIds(field.id);
  const rootRef = useRef<HTMLSpanElement>(null);
  const answered = typeof value === 'number';
  // Display only: the default is shown but not stored until the user interacts.
  const shown = answered ? value : (field.defaultValue ?? field.min);
  const valueLabel = field.valueLabels?.[String(shown)] ?? String(shown);

  useThumbA11y(rootRef, {
    'aria-labelledby': ids.label,
    'aria-valuetext': answered ? valueLabel : `${valueLabel}, not set yet`,
    'aria-describedby': describedBy(field.id, Boolean(field.hint), Boolean(error)),
    'aria-invalid': error ? 'true' : undefined,
  });

  return (
    <FieldFrame field={field} error={error} presentation={presentation} labelAddon={labelAddon} className={className}>
      <div className="k-field__value" aria-hidden="true">
        {valueLabel}
        {answered ? '' : presentation === 'step' ? ' — press Next to confirm' : ' (not set yet)'}
      </div>
      <Slider
        ref={rootRef}
        id={ids.control}
        size={controlSize}
        min={field.min}
        max={field.max}
        step={field.step}
        value={[shown]}
        onValueChange={([next]) => onChange(next)}
        onValueCommit={([next]) => onChange(next)}
      />
    </FieldFrame>
  );
}
