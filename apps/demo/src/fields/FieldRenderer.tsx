import type { FieldSchema } from '@kinetic-ui/core';
import { ChoiceField } from './ChoiceField';
import { EmailField } from './EmailField';
import { SliderField } from './SliderField';
import { TextInputField } from './TextInputField';
import { ToggleField } from './ToggleField';
import type { FieldProps } from './types';

/** Picks the renderer for a field's kind. */
export function FieldRenderer(props: FieldProps<FieldSchema>) {
  const { field } = props;
  switch (field.kind) {
    case 'text':
      if (field.format === 'email') return <EmailField {...props} field={field} />;
      return <TextInputField {...props} field={field} />;
    case 'choice':
      return <ChoiceField {...props} field={field} />;
    case 'toggle':
      return <ToggleField {...props} field={field} />;
    case 'slider':
      return <SliderField {...props} field={field} />;
  }
}
