import { Button, Callout, Switch } from '@radix-ui/themes';
import { useMotion } from '@kinetic-ui/react';
import { accelerometerSource, manualSource, motionStore } from '../stores';
import { useUiSize } from '../ui/useUiSize';
import { useSource } from './useSource';

function sensorUnavailableReason(): string | null {
  if (typeof window === 'undefined') return null;
  if (!window.isSecureContext) return 'Needs HTTPS, so it will likely fail here.';
  if (!('DeviceMotionEvent' in window)) return "This browser doesn't expose device motion.";
  return null;
}

/**
 * Stands in for input devices (a manual switch, the phone's motion sensor).
 * It is the only place that touches motion sources; UI components just read
 * the motion state.
 */
export function DemoControls() {
  const { controlSize, buttonSize } = useUiSize();
  const snapshot = useMotion(motionStore);
  const sensorActive = snapshot.source === accelerometerSource.id;
  const sensorRunning = sensorActive && snapshot.running;
  const starting = sensorActive && !snapshot.running && !snapshot.error;
  const manualWalking = !sensorActive && manualSource.get() === 'moving';
  const unavailable = sensorUnavailableReason();

  function toggleManual(checked: boolean) {
    manualSource.set(checked ? 'moving' : 'still');
    if (sensorActive) void useSource(manualSource);
  }

  function toggleSensor() {
    if (sensorRunning) {
      manualSource.set('still');
      void useSource(manualSource);
    } else {
      void useSource(accelerometerSource);
    }
  }

  let status = '';
  if (starting) status = 'Waiting for motion data…';
  else if (sensorRunning) {
    status = `Walking mode on — ${snapshot.detected === 'moving' ? 'Moving' : 'Still'}. Switches after about 5 s of walking.`;
  }

  return (
    <section className="k-demo-controls" aria-labelledby="demo-controls-title">
      <h2 id="demo-controls-title" className="k-demo-controls__title">
        Demo controls
      </h2>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 'var(--k-target-min)' }}>
        <Switch size={controlSize} checked={manualWalking} onCheckedChange={toggleManual} />
        Simulate walking
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
        <Button
          variant="outline"
          size={buttonSize}
          onClick={toggleSensor}
          aria-describedby="walking-mode-help"
        >
          {sensorRunning ? 'Stop walking mode' : 'Walking mode'}
        </Button>
        <span id="walking-mode-help" className="k-field__hint">
          Uses your phone&apos;s motion sensor to detect walking.
          {unavailable ? ` ${unavailable}` : ''}
        </span>
        <div aria-live="polite">{status}</div>
        {snapshot.error ? (
          <Callout.Root color="red" role="alert">
            <Callout.Text>{snapshot.error}</Callout.Text>
          </Callout.Root>
        ) : null}
      </div>
    </section>
  );
}
