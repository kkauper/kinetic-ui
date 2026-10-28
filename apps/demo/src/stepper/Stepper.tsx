import { useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { Badge, Button, Heading } from '@radix-ui/themes';
import { useFormModel } from '@kinetic-ui/react';
import { FieldRenderer } from '../fields/FieldRenderer';
import { focusField } from '../fields/focusField';
import { useUiSize } from '../ui/useUiSize';
import { formModel as model, showFull } from '../stores';
import { useSwipeBack } from './useSwipeBack';

/** Delay so the user sees their selection before an unambiguous tap advances. */
const AUTO_ADVANCE_MS = 300;

/** One question at a time, built for thumbs: bottom bar, big targets, no surprise keyboards. */
export function Stepper() {
  const state = useFormModel(model);
  const { buttonSize } = useUiSize();
  const { fields } = model.schema;
  const step = state.currentStep;
  const field = fields[step];
  const isDone = field === undefined;
  const pending = model.pendingDeferred();

  const headingRef = useRef<HTMLHeadingElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAdvance = () => {
    if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
  };

  // Entering moving mode: resume at the first question that still needs an answer.
  useEffect(() => {
    model.jumpToFirstUnanswered();
  }, []);

  // New step: move focus to the heading, not the input (which would pop up the keyboard).
  useEffect(() => {
    clearAdvance();
    headingRef.current?.focus();
    return clearAdvance;
  }, [step]);

  const swipe = useSwipeBack(() => model.back());

  function next() {
    clearAdvance();
    // An unanswered slider shows a value; pressing Next confirms it explicitly.
    if (field?.kind === 'slider' && !model.isAnswered(field.id)) {
      model.setAnswer(field.id, field.defaultValue ?? field.min);
    }
    if (model.next()) model.jumpToFirstUnanswered();
    else if (field) focusField(field.id);
  }

  function defer() {
    clearAdvance();
    if (model.defer()) model.jumpToFirstUnanswered();
  }

  function onChange(value: Parameters<typeof model.setAnswer>[1]) {
    if (!field) return;
    model.setAnswer(field.id, value);
    if (field.kind === 'choice' || field.kind === 'toggle') {
      clearAdvance();
      advanceTimer.current = setTimeout(next, AUTO_ADVANCE_MS);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault(); // Enter in the text field = Next.
    if (!isDone) next();
  }

  const canDefer = field?.deferrable === true && !model.isAnswered(field.id);

  return (
    <form className="k-stepper" onSubmit={onSubmit} noValidate {...swipe}>
      <div className="k-stepper__header">
        <div aria-live="polite">
          {isDone ? 'All questions visited' : `Question ${step + 1} of ${fields.length}`}
        </div>
        {pending.length > 0 ? (
          <Badge asChild size="3" color="amber">
            <button type="button" onClick={() => model.goTo(fields.length)}>
              {pending.length} {pending.length === 1 ? 'question' : 'questions'} for later
            </button>
          </Badge>
        ) : null}
      </div>

      <div className="k-stepper__body">
        <Heading as="h2" ref={headingRef} tabIndex={-1} className="k-stepper__heading">
          {isDone ? "That's everything for now" : field.label}
        </Heading>

        {isDone ? (
          <>
            {pending.length > 0 ? (
              <section aria-labelledby="later-heading">
                <h3 id="later-heading">
                  {pending.length} {pending.length === 1 ? 'question' : 'questions'} for later
                </h3>
                <ul className="k-later-list">
                  {pending.map((id) => {
                    const index = fields.findIndex((f) => f.id === id);
                    return (
                      <li key={id}>
                        <Button type="button" variant="soft" size={buttonSize} onClick={() => model.goTo(index)}>
                          {fields[index]?.label}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            <div>
              <Button type="button" variant="outline" size={buttonSize} onClick={() => showFull.showFull()}>
                Review full form
              </Button>
            </div>
          </>
        ) : (
          <FieldRenderer
            key={field.id}
            field={field}
            value={state.answers[field.id]}
            error={state.errors[field.id]}
            onChange={onChange}
            presentation="step"
          />
        )}
      </div>

      <div className="k-thumb-bar">
        <Button
          type="button"
          variant="soft"
          color="gray"
          size={buttonSize}
          disabled={step === 0}
          onClick={() => {
            clearAdvance();
            model.back();
          }}
        >
          Back
        </Button>
        {isDone ? null : (
          <div className="k-thumb-bar__end">
            {canDefer ? (
              <Button type="button" variant="outline" size={buttonSize} onClick={defer}>
                Later
              </Button>
            ) : null}
            <Button type="submit" size={buttonSize}>
              Next
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
