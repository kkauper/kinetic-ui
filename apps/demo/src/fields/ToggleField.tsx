import { RadioCards, Switch } from '@radix-ui/themes';
import type { ToggleFieldSchema } from '@kinetic-ui/core';
import { useUiSize } from '../ui/useUiSize';
import { FieldFrame } from './FieldFrame';
import { describedBy, fieldIds } from './ids';
import type { FieldProps } from './types';

/**
 * Full form: a Switch. Stepper: a Yes/No pair, because a tiny switch that
 * auto-advances on tap is ambiguous. The stored value is a boolean either way.
 */
export function ToggleField({ field, value, error, onChange, presentation, labelAddon, className }: FieldProps<ToggleFieldSchema>) {
  const { controlSize } = useUiSize();
  const ids = fieldIds(field.id);
  const describedby = describedBy(field.id, Boolean(field.hint), Boolean(error));

  if (presentation === 'step') {
    return (
      <FieldFrame field={field} error={error} presentation={presentation} labelAddon={labelAddon} className={className}>
        <RadioCards.Root
          id={ids.control}
          size={controlSize}
          columns="2"
          value={typeof value === 'boolean' ? (value ? 'yes' : 'no') : ''}
          onValueChange={(next) => onChange(next === 'yes')}
          aria-labelledby={ids.label}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedby}
        >
          <RadioCards.Item value="yes">Yes</RadioCards.Item>
          <RadioCards.Item value="no">No</RadioCards.Item>
        </RadioCards.Root>
      </FieldFrame>
    );
  }

  return (
    <FieldFrame
      field={field}
      error={error}
      presentation={presentation}
      labelAddon={labelAddon}
      className={className}
      labelFor={ids.control}
    >
      <Switch
        id={ids.control}
        size={controlSize}
        checked={value === true}
        onCheckedChange={onChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedby}
      />
    </FieldFrame>
  );
}
