import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useMotion, useShowFull } from '@kinetic-ui/react';
import { PinnedReadout } from '../demo-controls/DebugOverlay';
import { DemoControls } from '../demo-controls/DemoControls';
import { Notice } from '../demo-controls/Notice';
import { focusField, focusStepperControl } from '../fields/focusField';
import { FullForm } from '../FullForm';
import { Header } from '../layout/Header';
import { usePageFocus } from '../route/usePageFocus';
import { Stepper } from '../stepper/Stepper';
import { formModel, motionStore, showFull } from '../stores';
import { KeyboardProxy } from '../ui/KeyboardProxy';
import { Pill } from '../ui/Pill';
import { useUiSize } from '../ui/useUiSize';
import {
  clearActiveFieldName,
  inUserGesture,
  nameActiveField,
  startViewTransition,
  viewTransitionsSupported,
} from '../ui/viewTransition';

type Mode = 'still' | 'moving';

const ANNOUNCEMENT: Record<Mode, string> = {
  moving: 'Simplified for walking: one question at a time',
  still: 'Full form',
};

/** The sign-up flow: full form when still, one question at a time when moving. */
export function Demo() {
  const mode: Mode = useMotion(motionStore).state === 'moving' ? 'moving' : 'still';
  const { suppressed } = useShowFull(showFull);
  const { buttonSize } = useUiSize();
  const h1 = usePageFocus<HTMLHeadingElement>('Sign-up demo · Kinetic UI');

  // `shown` is the mode on screen. It follows `mode` through a view transition when the browser
  // has them, so the old UI stays up until the browser has captured it.
  const [shown, setShown] = useState<Mode>(mode);
  const shownRef = useRef<Mode>(mode);
  const target = useRef<Mode>(mode);
  const proxy = useRef<HTMLInputElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const firstRun = useRef(true);

  const commit = (next: Mode) => {
    shownRef.current = next;
    flushSync(() => setShown(next));
  };

  useLayoutEffect(() => {
    target.current = mode;
    if (firstRun.current) {
      firstRun.current = false; // No animation and no announcement on load.
      return;
    }
    if (mode === shownRef.current) return;

    const toMoving = mode === 'moving';
    // Entering moving mode resumes at the first open question (the Stepper repeats this on mount).
    if (toMoving) formModel.jumpToFirstUnanswered();
    const { fields } = formModel.schema;
    const field = fields[formModel.getState().currentStep];
    const fieldId = field?.id ?? null;

    if (document.visibilityState !== 'visible' || !viewTransitionsSupported()) {
      // Instant switch. Inside the tap handler's flushSync this renders the stepper synchronously,
      // so the caller can focus its control within the gesture.
      shownRef.current = mode;
      setShown(mode);
      return;
    }

    // iOS gesture path: open the keyboard now, move focus to the real input once it exists.
    if (toMoving && field?.kind === 'text' && inUserGesture() && proxy.current) {
      proxy.current.inputMode = field.format === 'email' ? 'email' : 'text';
      proxy.current.focus({ preventScroll: true });
    }

    nameActiveField(toMoving ? 'full' : 'step', fieldId);
    const transition = startViewTransition(() => {
      commit(target.current);
      const settled = target.current;
      nameActiveField(settled === 'moving' ? 'step' : 'full', fieldId);
      if (settled === 'moving') {
        if (!document.activeElement?.closest('.k-stepper')) {
          if (fieldId !== null) focusField(fieldId, { preventScroll: true });
          else focusStepperControl();
        }
      } else if (fieldId !== null) {
        focusField(fieldId, { preventScroll: true });
      } else {
        const heading = document.querySelector<HTMLElement>('.k-main form h2');
        heading?.setAttribute('tabindex', '-1');
        heading?.focus({ preventScroll: true });
      }
      if (document.activeElement === proxy.current) proxy.current?.blur();
    });
    const cleanup = () => {
      clearActiveFieldName();
      if (document.activeElement === proxy.current) proxy.current?.blur();
    };
    transition.finished.then(cleanup, cleanup);
  }, [mode]);

  // Announce once per change, immediately (the animation must not delay it).
  const announced = useRef<Mode>(mode);
  useEffect(() => {
    if (announced.current === mode) return;
    announced.current = mode;
    setAnnouncement(ANNOUNCEMENT[mode]);
  }, [mode]);

  return (
    <>
      <Header />
      <main className="k-page">
        <h1 ref={h1} tabIndex={-1} className="k-sr-only">
          Kinetic UI sign-up demo
        </h1>
        <DemoControls />
        <div role="status" className="k-sr-only">
          {announcement}
        </div>
        {/* Same place in both modes: the label in still mode becomes the escape hatch in moving mode. */}
        <div className="k-modebar">
          {shown === 'moving' ? (
            <>
              <span className="k-modebar__label">Simplified</span>
              <Pill variant="soft" size={buttonSize} onClick={() => showFull.showFull()}>
                Show full form
              </Pill>
            </>
          ) : (
            <span className="k-modebar__label">Full form</span>
          )}
        </div>
        {suppressed ? (
          <Notice
            kind="info"
            title="Simplified mode is off for this session"
            action={{ label: 'Turn back on', onClick: () => showFull.resetSession() }}
          />
        ) : null}
        <div className="k-main">{shown === 'moving' ? <Stepper /> : <FullForm />}</div>
        {shown === 'moving' ? null : <PinnedReadout placement="page" />}
        <KeyboardProxy ref={proxy} />
      </main>
    </>
  );
}
