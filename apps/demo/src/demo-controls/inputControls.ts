import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { useMotion } from '@kinetic-ui/react';
import { focusStepperControl } from '../fields/focusField';
import { accelerometerSource, formModel, manualSource, motionStore } from '../stores';
import { useMotionCapability } from '../ui/useMotionCapability';
import { switchSource } from './switchSource';

/**
 * Walking mode failed and the user chose "Use Simulate walking instead": from then on the
 * Simulate walking tag stays in the row for the rest of the session (page lifetime), so the
 * user can switch it off again even on a phone, where it is normally hidden.
 */
let simulateRevealed = false;
const listeners = new Set<() => void>();

export function revealSimulate(): void {
  if (simulateRevealed) return;
  simulateRevealed = true;
  for (const listener of listeners) listener();
}

function subscribeRevealed(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Which input tags the row shows: capable devices Walking mode, all others Simulate walking. */
export function useVisibleInputs(): { showWalking: boolean; showSimulate: boolean } {
  const canSense = useMotionCapability();
  const revealed = useSyncExternalStore(subscribeRevealed, () => simulateRevealed, () => false);
  return { showWalking: canSense, showSimulate: !canSense || revealed };
}

/** Current state of the two input devices. */
export function useInputState() {
  const snapshot = useMotion(motionStore);
  const sensorActive = snapshot.source === accelerometerSource.id;
  return {
    snapshot,
    sensorRunning: sensorActive && snapshot.running,
    starting: sensorActive && !snapshot.running && !snapshot.error,
    manualWalking: !sensorActive && snapshot.source === manualSource.id && manualSource.get() === 'moving',
  };
}

function applyManual(on: boolean): void {
  manualSource.set(on ? 'moving' : 'still');
  if (motionStore.getState().source !== manualSource.id) void switchSource(manualSource);
}

/**
 * Simulate walking on or off. From a tap on the tag, entering moving mode renders the stepper
 * synchronously and focuses its first control inside the gesture (iOS opens the keyboard only
 * then). Inside the debug sheet (`focusStepper: false`) focus stays in the dialog.
 */
export function setManualWalking(on: boolean, options: { focusStepper: boolean }): void {
  if (!on) return applyManual(false);
  if (!options.focusStepper) return applyManual(true);
  formModel.jumpToFirstUnanswered();
  flushSync(() => applyManual(true));
  focusStepperControl();
}

/** Walking mode on or off. Synchronous, no await: the iOS motion permission needs the user gesture. */
export function toggleSensor(running: boolean): void {
  if (running) {
    manualSource.set('still');
    void switchSource(manualSource);
  } else {
    void switchSource(accelerometerSource);
  }
}
