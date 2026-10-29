import { useMotion, useShowFull } from '@kinetic-ui/react';
import { PinnedReadout } from '../demo-controls/DebugOverlay';
import { DemoControls } from '../demo-controls/DemoControls';
import { Notice } from '../demo-controls/Notice';
import { FullForm } from '../FullForm';
import { usePageFocus } from '../route/usePageFocus';
import { Stepper } from '../stepper/Stepper';
import { motionStore, showFull } from '../stores';
import { Pill } from '../ui/Pill';
import { useUiSize } from '../ui/useUiSize';

/** The sign-up flow: full form when still, one question at a time when moving. */
export function Demo() {
  const mode = useMotion(motionStore).state;
  const { suppressed } = useShowFull(showFull);
  const { buttonSize } = useUiSize();
  const h1 = usePageFocus<HTMLHeadingElement>('Sign-up demo · Kinetic UI');

  return (
    <main className="k-page">
      <h1 ref={h1} tabIndex={-1} className="k-sr-only">
        Kinetic UI sign-up demo
      </h1>
      <DemoControls />
      {/* Same place in both modes: the label in still mode becomes the escape hatch in moving mode. */}
      <div className="k-modebar">
        {mode === 'moving' ? (
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
      <div className="k-main">{mode === 'moving' ? <Stepper /> : <FullForm />}</div>
      {mode === 'moving' ? null : <PinnedReadout placement="page" />}
    </main>
  );
}
