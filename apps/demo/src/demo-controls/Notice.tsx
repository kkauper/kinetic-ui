import type { ReactNode } from 'react';
import { CloseIcon, InfoIcon, WarningIcon } from '../layout/icons';

interface NoticeProps {
  kind: 'error' | 'info';
  title: string;
  children?: ReactNode;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}

/**
 * A notification card. Errors are `role="alert"` (announced at once),
 * informational ones `role="status"` (polite). The slide/fade-in lives in CSS
 * behind `prefers-reduced-motion: no-preference`.
 */
export function Notice({ kind, title, children, action, onDismiss }: NoticeProps) {
  return (
    <div className={`k-notice k-notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="k-notice__icon">{kind === 'error' ? <WarningIcon /> : <InfoIcon />}</span>
      <div className="k-notice__content">
        <p className="k-notice__title">{title}</p>
        {children ? <p className="k-notice__body">{children}</p> : null}
        {action ? (
          <button type="button" className="k-pill-button k-notice__action" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>
      {onDismiss ? (
        <button type="button" className="k-icon-button" aria-label="Dismiss" onClick={onDismiss}>
          <CloseIcon />
        </button>
      ) : null}
    </div>
  );
}
