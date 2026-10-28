import { RadioCards } from '@radix-ui/themes';
import type { ChoiceFieldSchema } from '@kinetic-ui/core';
import { useUiSize } from '../ui/useUiSize';
import { FieldFrame } from './FieldFrame';
import { describedBy, fieldIds } from './ids';
import type { FieldProps } from './types';

/** Radix RadioCards is a radio group: arrow keys move between options. */
export function ChoiceField({ field, value, error, onChange, presentation, labelAddon, className }: FieldProps<ChoiceFieldSchema>) {
  const { controlSize } = useUiSize();
  const ids = fieldIds(field.id);
  return (
    <FieldFrame field={field} error={error} presentation={presentation} labelAddon={labelAddon} className={className}>
      <RadioCards.Root
        id={ids.control}
        size={controlSize}
        columns={presentation === 'step' ? '1' : '2'}
        value={typeof value === 'string' ? value : ''}
        onValueChange={(next) => onChange(next)}
        aria-labelledby={ids.label}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(field.id, Boolean(field.hint), Boolean(error))}
      >
        {field.options.map((option) => (
          <RadioCards.Item key={option.value} value={option.value}>
            {option.label}
          </RadioCards.Item>
        ))}
      </RadioCards.Root>
    </FieldFrame>
  );
}
