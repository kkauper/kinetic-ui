import { useEffect, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { flushSync } from 'react-dom';
import { useMotion } from '@kinetic-ui/react';
import { TagState } from '../layout/icons';
import { focusStepperControl } from '../fields/focusField';
import { accelerometerSource, formModel, manualSource, motionStore } from '../stores';
import { DebugSheet } from './DebugSheet';
import { debugUi, useDebugUi } from './debugUi';
import { Notice } from './Notice';
import { noticeForError } from './notices';
import { switchSource } from './switchSource';

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
 */
export function DemoControls() {
  const snapshot = useMotion(motionStore);
  const sensorActive = snapshot.source === accelerometerSource.id;
  const sensorRunning = sensorActive && snapshot.running;
  const starting = sensorActive && !snapshot.running && !snapshot.error;
  const manualWalking = !sensorActive && snapshot.source === manualSource.id && manualSource.get() === 'moving';
  const { isOpen: debugOpen } = useDebugUi();
  const walkingTag = useRef<HTMLButtonElement>(null);

  // A dismissed notice stays dismissed until the error text changes or clears.
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (snapshot.error === null) setDismissed(null);
  }, [snapshot.error]);
  const notice = snapshot.error !== null && snapshot.error !== dismissed ? noticeForError(snapshot.error) : null;

  function toggleManual(on: boolean) {
    const apply = () => {
      manualSource.set(on ? 'moving' : 'still');
      if (snapshot.source !== manualSource.id) void switchSource(manualSource);
    };
    if (!on) return apply();
    // Entering moving mode from a tap: iOS opens the keyboard only for focus() called inside the
    // user gesture. So render the stepper synchronously here and focus its first control now.
    jumpToOpenQuestion();
    flushSync(apply);
    focusStepperControl();
  }

  function toggleSensor() {
    // Synchronous, no await: the iOS motion permission needs the user gesture.
    if (sensorRunning) {
      manualSource.set('still');
      void switchSource(manualSource);
    } else {
      void switchSource(accelerometerSource);
    }
  }

  let status = '';
  if (starting) status = 'Waiting for motion data…';
  else if (sensorRunning) {
    status = `Walking mode on — ${snapshot.detected === 'moving' ? 'moving' : 'still'}. Switches after about 3 s.`;
  }

  return (
    <section className="k-demo-controls" aria-label="Demo controls">
      {/*
        role="group", not role="toolbar": a toolbar promises arrow-key navigation between its
        items, which we do not implement. Three ordinary buttons reachable with Tab is the simpler,
        correct pattern. The row scrolls sideways on narrow screens; its buttons are focusable, so
        keyboard users can reach every tag and the browser scrolls it into view.
      */}
      <div className="k-tags" role="group" aria-label="Demo controls">
        <Tag pressed={manualWalking} onClick={() => toggleManual(!manualWalking)}>
          Simulate walking
        </Tag>
        <Tag buttonRef={walkingTag} pressed={sensorRunning} onClick={toggleSensor} describedBy="walking-mode-help">
          {sensorRunning ? 'Walking mode on' : 'Walking mode'}
        </Tag>
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
      <span id="walking-mode-help" className="k-sr-only">
        Uses your phone&apos;s motion sensor to detect walking.
      </span>
      <div aria-live="polite" className="k-demo-controls__status">
        {status}
      </div>
      {notice ? (
        <Notice
          kind={notice.kind}
          title={notice.title}
          action={
            notice.offerSimulate
              ? { label: 'Use Simulate walking instead', onClick: () => toggleManual(true) }
              : undefined
          }
          onDismiss={() => {
            setDismissed(snapshot.error);
            walkingTag.current?.focus();
          }}
        >
          {notice.body}
        </Notice>
      ) : null}
      <DebugSheet />
    </section>
  );
}

/** Resume at the first open question before the stepper renders (Stepper also does this on mount). */
function jumpToOpenQuestion() {
  formModel.jumpToFirstUnanswered();
}
