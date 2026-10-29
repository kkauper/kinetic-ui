import { useEffect, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { TagState } from '../layout/icons';
import { DebugSheet } from './DebugSheet';
import { debugUi, useDebugUi } from './debugUi';
import { revealSimulate, setManualWalking, toggleSensor, useInputState, useVisibleInputs } from './inputControls';
import { Notice } from './Notice';
import { noticeForError } from './notices';

interface TagProps {
  pressed: boolean;
  onClick: () => void;
  describedBy?: string;
  buttonRef?: Ref<HTMLButtonElement>;
  children: ReactNode;
}

/** A pill toggle. State is shown by a ring/check icon and the accent tint, never by color alone. */
function Tag({ pressed, onClick, describedBy, buttonRef, children }: TagProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="k-tag"
      aria-pressed={pressed}
      aria-describedby={describedBy}
      onClick={onClick}
    >
      <TagState on={pressed} />
      {children}
    </button>
  );
}

/**
 * Stands in for input devices (a manual toggle, the phone's motion sensor).
 * It is tooling, not product UI: it keeps its own small, fixed sizes instead of
 * the motion-dependent ones, and it is the only place (with the debug tools)
 * that touches motion sources.
 *
 * Which input tag shows depends on the device (see `useMotionCapability`): a phone gets
 * Walking mode, every other device Simulate walking. Debug has both in its Input section.
 */
export function DemoControls() {
  const { snapshot, sensorRunning, starting, manualWalking } = useInputState();
  const { showWalking, showSimulate } = useVisibleInputs();
  const { isOpen: debugOpen } = useDebugUi();
  const firstTag = useRef<HTMLButtonElement>(null);

  // A dismissed notice stays dismissed until the error text changes or clears.
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (snapshot.error === null) setDismissed(null);
  }, [snapshot.error]);
  const notice = snapshot.error !== null && snapshot.error !== dismissed ? noticeForError(snapshot.error) : null;

  let status = '';
  if (starting) status = 'Waiting for motion data…';
  else if (sensorRunning) {
    status = `Walking mode on — ${snapshot.detected === 'moving' ? 'moving' : 'still'}. Switches after about 3 s.`;
  }

  return (
    <section className="k-demo-controls" aria-label="Demo controls">
      {/*
        role="group", not role="toolbar": a toolbar promises arrow-key navigation between its
        items, which we do not implement. Two or three ordinary buttons reachable with Tab is the
        simpler, correct pattern. The row scrolls sideways on narrow screens; its buttons are
        focusable, so keyboard users can reach every tag and the browser scrolls it into view.
      */}
      <div className="k-tags" role="group" aria-label="Demo controls">
        {showSimulate ? (
          <Tag
            buttonRef={showWalking ? undefined : firstTag}
            pressed={manualWalking}
            onClick={() => setManualWalking(!manualWalking, { focusStepper: true })}
          >
            Simulate walking
          </Tag>
        ) : null}
        {showWalking ? (
          <Tag
            buttonRef={firstTag}
            pressed={sensorRunning}
            onClick={() => toggleSensor(sensorRunning)}
            describedBy="walking-mode-help"
          >
            {sensorRunning ? 'Walking mode on' : 'Walking mode'}
          </Tag>
        ) : null}
        {/* Opens the debug sheet: a plain button (not a toggle), so no aria-pressed. */}
        <button
          type="button"
          className="k-tag k-tag--plain"
          aria-haspopup="dialog"
          aria-expanded={debugOpen}
          onClick={(event) => debugUi.open(event.currentTarget)}
        >
          Debug
        </button>
      </div>
      {showWalking ? (
        <span id="walking-mode-help" className="k-sr-only">
          Uses your phone&apos;s motion sensor to detect walking.
        </span>
      ) : null}
      <div aria-live="polite" className="k-demo-controls__status">
        {status}
      </div>
      {notice ? (
        <Notice
          kind={notice.kind}
          title={notice.title}
          action={
            notice.offerSimulate
              ? {
                  label: 'Use Simulate walking instead',
                  onClick: () => {
                    // Keep the Simulate walking tag from now on, so the user can switch it off again.
                    revealSimulate();
                    setManualWalking(true, { focusStepper: true });
                  },
                }
              : undefined
          }
          onDismiss={() => {
            setDismissed(snapshot.error);
            firstTag.current?.focus();
          }}
        >
          {notice.body}
        </Notice>
      ) : null}
      <DebugSheet />
    </section>
  );
}
