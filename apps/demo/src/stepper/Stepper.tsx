import { useEffect, useLayoutEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { Badge, Button, Heading } from '@radix-ui/themes';
import { useFormModel } from '@kinetic-ui/react';
import { FieldRenderer } from '../fields/FieldRenderer';
import { focusField, focusStepperControl } from '../fields/focusField';
import { normalizeEmailAnswers } from '../fields/normalize';
import { keepFocus } from '../ui/keepFocus';
import { useUiSize } from '../ui/useUiSize';
import { formModel as model, showFull } from '../stores';
import { useSwipeBack } from './useSwipeBack';

/** Delay so the user sees their selection before an unambiguous tap advances. */
const AUTO_ADVANCE_MS = 300;

/**
 * One question at a time, built for thumbs: everything sits in the lower part
 * of the screen (spacer on top, then question, field, thumb bar), so the input
 * is right above the bar and the keyboard moves nothing.
 */
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

  // New step: focus the step's control. The control's label is the question, so a screen reader
  // announces it; "Question n of N" comes from the live region.
  // Platform limit: iOS opens the keyboard only for focus() inside a user gesture. A tap that
  // starts moving mode or presses Back/Next qualifies; a sensor-triggered switch or the 300 ms
  // auto-advance does not (iOS focuses the control without a keyboard until the user taps it).
  // Android Chrome may show the keyboard anyway. Text steps keep the SAME input element, so focus
  // and the keyboard survive from one text step to the next.
  useLayoutEffect(() => {
    clearAdvance();
    let retry = 0;
    if (isDone) headingRef.current?.focus();
    else {
      focusStepperControl();
      // Radix Slider hides its thumb until its own layout effect has measured it: try once more
      // on the next frame if nothing inside the stepper took focus.
      if (!document.activeElement?.closest('.k-stepper')) retry = requestAnimationFrame(focusStepperControl);
    }
    return () => {
      cancelAnimationFrame(retry);
      clearAdvance();
    };
  }, [step, isDone]);

  const swipe = useSwipeBack(() => model.back());

  function next() {
    clearAdvance();
    normalizeEmailAnswers(model);
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

  const textLike = field?.kind === 'text';

  return (
    <form className="k-stepper" onSubmit={onSubmit} noValidate {...swipe}>
      <div className="k-stepper__spacer" aria-hidden="true" />

      <div className="k-stepper__group">
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
          <Heading as="h2" ref={headingRef} tabIndex={isDone ? -1 : undefined} className="k-stepper__heading">
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
              // One key for all text-like steps: React keeps the same <input> (and its focus).
              key={textLike ? 'stepper-text-input' : field.id}
              field={field}
              value={state.answers[field.id]}
              error={state.errors[field.id]}
              onChange={onChange}
              presentation="step"
            />
          )}
        </div>
      </div>

      <div className="k-thumb-bar">
        <Button
          type="button"
          variant="soft"
          color="gray"
          size={buttonSize}
          disabled={step === 0}
          {...keepFocus}
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
              <Button type="button" variant="outline" size={buttonSize} {...keepFocus} onClick={defer}>
                Later
              </Button>
            ) : null}
            <Button type="submit" size={buttonSize} {...keepFocus}>
              Next
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
