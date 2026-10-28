import { Button, Callout, Theme } from '@radix-ui/themes';
import { useMotion, useMotionAttribute, useShowFull } from '@kinetic-ui/react';
import { DemoControls } from './demo-controls/DemoControls';
import { FullForm } from './FullForm';
import { Stepper } from './stepper/Stepper';
import { motionStore, showFull } from './stores';
import { useUiSize } from './ui/useUiSize';

function Shell() {
  const mode = useMotion(motionStore).state;
  const { suppressed } = useShowFull(showFull);
  const { buttonSize } = useUiSize();
  useMotionAttribute(motionStore);

  return (
    <div className="k-app">
      <DemoControls />
      <header className="k-appbar">
        <h1 className="k-appbar__title">Kinetic UI</h1>
        {mode === 'moving' ? (
          <Button variant="soft" size={buttonSize} onClick={() => showFull.showFull()}>
            Show full form
          </Button>
        ) : (
          <span>Full form</span>
        )}
      </header>
      {suppressed ? (
        <Callout.Root className="k-callout" role="status">
          <Callout.Text>
            Simplified mode is off for this session.{' '}
            <Button size="1" variant="ghost" onClick={() => showFull.resetSession()}>
              Turn back on
            </Button>
          </Callout.Text>
        </Callout.Root>
      ) : null}
      <main className="k-main">{mode === 'moving' ? <Stepper /> : <FullForm />}</main>
    </div>
  );
}

/** Radix Theme scaling follows the motion state; the mapping lives in useUiSize. */
export function App() {
  const { scaling } = useUiSize();
  return (
    <Theme scaling={scaling}>
      <Shell />
    </Theme>
  );
}
