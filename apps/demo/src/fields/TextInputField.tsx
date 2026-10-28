import { TextField } from '@radix-ui/themes';
import type { TextFieldSchema } from '@kinetic-ui/core';
import { useUiSize } from '../ui/useUiSize';
import { FieldFrame } from './FieldFrame';
import { describedBy, fieldIds } from './ids';
import type { FieldProps } from './types';

export function TextInputField({ field, value, error, onChange, presentation, labelAddon, className }: FieldProps<TextFieldSchema>) {
  const { controlSize } = useUiSize();
  const ids = fieldIds(field.id);
  return (
    <FieldFrame
      field={field}
      error={error}
      presentation={presentation}
      labelAddon={labelAddon}
      className={className}
      labelFor={ids.control}
    >
      <TextField.Root
        type="text"
        autoComplete={field.autocomplete}
        id={ids.control}
        size={controlSize}
        value={typeof value === 'string' ? value : ''}
        enterKeyHint={presentation === 'step' ? 'next' : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(field.id, Boolean(field.hint), Boolean(error))}
        onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
      />
    </FieldFrame>
  );
}
