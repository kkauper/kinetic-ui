import { useState } from 'react';
import { Button, Callout, Switch } from '@radix-ui/themes';
import { useMotion } from '@kinetic-ui/react';
import { accelerometerSource, manualSource, motionStore } from '../stores';
import { DebugOverlay, readDebugPreference, writeDebugPreference } from './DebugOverlay';
import { DebugTools } from './DebugTools';
import { switchSource } from './switchSource';

function sensorUnavailableReason(): string | null {
  if (typeof window === 'undefined') return null;
  if (!window.isSecureContext) return 'Walking mode needs HTTPS, so it will likely fail here.';
  if (!('DeviceMotionEvent' in window)) return "This browser doesn't expose device motion.";
  return null;
}

/**
 * Stands in for input devices (a manual switch, the phone's motion sensor).
 * It is tooling, not product UI: it keeps fixed small Radix sizes instead of
 * the motion-dependent ones, and it is the only place (with the debug tools)
 * that touches motion sources.
 */
export function DemoControls() {
  const snapshot = useMotion(motionStore);
  const sensorActive = snapshot.source === accelerometerSource.id;
  const sensorRunning = sensorActive && snapshot.running;
  const starting = sensorActive && !snapshot.running && !snapshot.error;
  const manualWalking = !sensorActive && snapshot.source === manualSource.id && manualSource.get() === 'moving';
  const [debug, setDebug] = useState(readDebugPreference);
  const unavailable = sensorUnavailableReason();

  function toggleManual(checked: boolean) {
    manualSource.set(checked ? 'moving' : 'still');
    if (snapshot.source !== manualSource.id) void switchSource(manualSource);
  }

  function toggleSensor() {
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
    status = `Walking mode on: ${snapshot.detected === 'moving' ? 'moving' : 'still'}. Switches after ~5 s.`;
  }

  return (
    <section className="k-demo-controls" aria-label="Demo controls">
      <div className="k-demo-controls__row">
        <label className="k-demo-controls__switch">
          <Switch size="1" checked={manualWalking} onCheckedChange={toggleManual} />
          Simulate walking
        </label>
        <Button variant="outline" size="1" onClick={toggleSensor} aria-describedby="walking-mode-help">
          {sensorRunning ? 'Stop walking mode' : 'Walking mode'}
        </Button>
        <Button
          variant="outline"
          color="gray"
          size="1"
          aria-pressed={debug}
          onClick={() => {
            setDebug(!debug);
            writeDebugPreference(!debug);
          }}
        >
          Debug
        </Button>
      </div>
      <span id="walking-mode-help" className={unavailable ? 'k-field__hint' : 'k-sr-only'}>
        Uses your phone&apos;s motion sensor to detect walking. {unavailable ?? ''}
      </span>
      <div aria-live="polite" className="k-demo-controls__status">
        {status}
      </div>
      {snapshot.error ? (
        <Callout.Root color="red" role="alert" size="1">
          <Callout.Text>{snapshot.error}</Callout.Text>
        </Callout.Root>
      ) : null}
      {debug ? <DebugTools /> : null}
      {debug ? <DebugOverlay /> : null}
    </section>
  );
}
