import { useEffect, useState } from 'react';
import { Button, TextField } from '@radix-ui/themes';
import { emailDomainCompletions, normalizeEmail, suggestEmailDomain } from '@kinetic-ui/core';
import type { TextFieldSchema } from '@kinetic-ui/core';
import { useUiSize } from '../ui/useUiSize';
import { FieldFrame } from './FieldFrame';
import { describedBy, fieldIds } from './ids';
import type { FieldProps } from './types';

const SUGGEST_DELAY_MS = 500;

/** Email input with the right keyboard, one-tap domain chips and a typo suggestion. */
export function EmailField({ field, value, error, onChange, presentation, labelAddon, className }: FieldProps<TextFieldSchema>) {
  const { controlSize } = useUiSize();
  const ids = fieldIds(field.id);
  const text = typeof value === 'string' ? value : '';
  const set = (next: string) => onChange(next === '' ? undefined : next);

  // The typo suggestion appears after a pause in typing, or immediately on blur.
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(text), SUGGEST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  const suggestion = settled === text ? suggestEmailDomain(text) : null;
  const completions = emailDomainCompletions(text);

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
        type="email"
        inputMode="email"
        autoComplete={field.autocomplete ?? 'email'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint={presentation === 'step' ? 'next' : undefined}
        id={ids.control}
        size={controlSize}
        value={text}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(field.id, Boolean(field.hint), Boolean(error))}
        onChange={(event) => set(event.target.value)}
        onBlur={() => {
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
              onPointerDown={(event) => event.preventDefault()}
              onMouseDown={(event) => event.preventDefault()}
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
            <Button type="button" variant="soft" size={controlSize} onClick={() => set(suggestion.email)}>
              Use {suggestion.domain}
            </Button>
          </span>
        ) : null}
      </div>
    </FieldFrame>
  );
}
