import { useState } from 'react';
import type { FormEvent } from 'react';
import { Badge, Button, Callout, Heading } from '@radix-ui/themes';
import { useFormModel } from '@kinetic-ui/react';
import { FieldRenderer } from './fields/FieldRenderer';
import { focusField } from './fields/focusField';
import { useUiSize } from './ui/useUiSize';
import { formModel as model } from './stores';

/** The complete form: every field, in schema order. */
export function FullForm() {
  const state = useFormModel(model);
  const { buttonSize } = useUiSize();
  const [submitted, setSubmitted] = useState(false);
  const pending = model.pendingDeferred();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (model.validateAll()) {
      setSubmitted(true);
      return;
    }
    setSubmitted(false);
    const { errors } = model.getState();
    const first = model.schema.fields.find((f) => errors[f.id]);
    if (first) focusField(first.id);
  }

  return (
    <form className="k-stack" onSubmit={onSubmit} noValidate>
      <Heading as="h2" size="5">
        {model.schema.title}
      </Heading>
      {model.schema.fields.map((field) => (
        <FieldRenderer
          key={field.id}
          field={field}
          value={state.answers[field.id]}
          error={state.errors[field.id]}
          presentation="full"
          onChange={(value) => {
            setSubmitted(false);
            model.setAnswer(field.id, value);
          }}
          labelAddon={pending.includes(field.id) ? <Badge color="amber">Saved for later</Badge> : undefined}
          className={pending.includes(field.id) ? 'k-field--deferred' : undefined}
        />
      ))}
      <div>
        <Button type="submit" size={buttonSize}>
          Create account
        </Button>
      </div>
      <div role="status">
        {submitted ? (
          <>
            <Callout.Root color="green" className="k-callout">
              <Callout.Text>Account created (demo — nothing was sent)</Callout.Text>
            </Callout.Root>
            <Button
              type="button"
              variant="soft"
              size={buttonSize}
              onClick={() => {
                model.reset();
                setSubmitted(false);
              }}
            >
              Start over
            </Button>
          </>
        ) : null}
      </div>
    </form>
  );
}
