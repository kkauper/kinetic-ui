import { useEffect, useState } from 'react';
import { Button, TextField } from '@radix-ui/themes';
import { emailDomainCompletions, normalizeEmail, suggestEmailDomain } from '@kinetic-ui/core';
import type { TextFieldSchema } from '@kinetic-ui/core';
import { useUiSize } from '../ui/useUiSize';
import { keepFocus } from '../ui/keepFocus';
import { FieldFrame } from './FieldFrame';
import { describedBy, fieldIds } from './ids';
import type { FieldProps } from './types';

const SUGGEST_DELAY_MS = 500;

/**
 * Every text-like field (plain text and email) is ONE component with ONE input
 * element. The stepper gives consecutive text steps the same React key, so the
 * `<input>` survives from step to step with only its props (id, type,
 * inputMode, autoComplete, value, label association) updated in place. Focus
 * never leaves it, so the phone keyboard stays open instead of closing and
 * reopening. Keep the element tree identical for both formats.
 */
export function TextInputField({ field, value, error, onChange, presentation, labelAddon, className }: FieldProps<TextFieldSchema>) {
  const { controlSize } = useUiSize();
  const ids = fieldIds(field.id);
  const isEmail = field.format === 'email';
  const text = typeof value === 'string' ? value : '';
  const set = (next: string) => onChange(next === '' ? undefined : next);

  // Email only: the typo suggestion appears after a pause in typing, or immediately on blur.
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    if (!isEmail) return;
    const timer = setTimeout(() => setSettled(text), SUGGEST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, isEmail]);
  const suggestion = isEmail && settled === text ? suggestEmailDomain(text) : null;
  const completions = isEmail ? emailDomainCompletions(text) : [];

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
        type={isEmail ? 'email' : 'text'}
        inputMode={isEmail ? 'email' : undefined}
        autoComplete={isEmail ? (field.autocomplete ?? 'email') : field.autocomplete}
        autoCapitalize={isEmail ? 'none' : undefined}
        autoCorrect={isEmail ? 'off' : undefined}
        spellCheck={isEmail ? false : undefined}
        enterKeyHint={presentation === 'step' ? 'next' : undefined}
        id={ids.control}
        name={field.id}
        size={controlSize}
        value={text}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(field.id, Boolean(field.hint), Boolean(error))}
        onChange={(event) => set(event.target.value)}
        onBlur={() => {
          if (!isEmail) return;
          const normalized = normalizeEmail(text);
          if (normalized !== text) set(normalized);
          setSettled(normalized);
        }}
      />
      {completions.length > 0 ? (
        <div role="group" aria-label="Complete email address" className="k-chips">
          {completions.map((completion) => (
            <Button
              key={completion.domain}
              type="button"
              variant="soft"
              size="1"
              className="k-chip"
              // Keep focus in the input so the keyboard does not close and reopen.
              {...keepFocus}
              onClick={() => set(completion.email)}
            >
              @{completion.domain}
            </Button>
          ))}
        </div>
      ) : null}
      <div aria-live="polite">
        {suggestion ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            Did you mean {suggestion.email}?
            <Button type="button" variant="soft" size={controlSize} {...keepFocus} onClick={() => set(suggestion.email)}>
              Use {suggestion.domain}
            </Button>
          </span>
        ) : null}
      </div>
    </FieldFrame>
  );
}
