import type { Answers, FieldSchema } from '@kinetic-ui/core';
import { Pill } from '../ui/Pill';

/** The answer as the user would say it; undefined when there is none. */
export function formatAnswer(field: FieldSchema, answers: Answers): string | undefined {
  const value = answers[field.id];
  if (value === undefined || value === '') return undefined;
  switch (field.kind) {
    case 'choice':
      return field.options.find((o) => o.value === value)?.label ?? String(value);
    case 'toggle':
      return value === true ? 'Yes' : 'No';
    case 'slider':
      return field.valueLabels?.[String(value)] ?? String(value);
    default:
      return String(value);
  }
}

interface SummaryProps {
  fields: FieldSchema[];
  answers: Answers;
  /** Ids of deferred questions that still have no answer. */
  pending: string[];
  onChange: (index: number) => void;
}

/** Read-only review: deferred questions first, then every other question with its answer and a Change button. */
export function Summary({ fields, answers, pending, onChange }: SummaryProps) {
  const rows = fields.map((field, index) => ({ field, index })).filter(({ field }) => !pending.includes(field.id));
  return (
    <>
      {pending.length > 0 ? (
        <section aria-labelledby="later-heading" className="k-summary__later">
          <h3 id="later-heading" className="k-summary__group">
            Questions for later
          </h3>
          <ul className="k-later-list">
            {pending.map((id) => {
              const index = fields.findIndex((f) => f.id === id);
              const label = fields[index]?.label ?? id;
              return (
                <li key={id} className="k-summary__row">
                  <span className="k-summary__question">{label}</span>
                  <Pill type="button" variant="soft" size="2" className="k-summary__button" aria-label={`Answer now: ${label}`} onClick={() => onChange(index)}>
                    Answer now
                  </Pill>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <dl className="k-summary" aria-label="Your answers">
        {rows.map(({ field, index }) => {
          const text = formatAnswer(field, answers);
          return (
            <div key={field.id} className="k-summary__row">
              <dt className="k-summary__question">{field.label}</dt>
              <dd className={text === undefined ? 'k-summary__answer k-summary__answer--empty' : 'k-summary__answer'}>
                {text ?? 'Not answered'}
              </dd>
              <dd className="k-summary__action">
                <Pill type="button" variant="soft" size="2" className="k-summary__button" aria-label={`Change: ${field.label}`} onClick={() => onChange(index)}>
                  Change
                </Pill>
              </dd>
            </div>
          );
        })}
      </dl>
    </>
  );
}
