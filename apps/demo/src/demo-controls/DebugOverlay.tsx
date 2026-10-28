import { useEffect, useState } from 'react';
import { useMotion, useShowFull } from '@kinetic-ui/react';
import { motionStore, showFull } from '../stores';

const STORAGE_KEY = 'kinetic-ui:debug';

/** Debug panel preference: `?debug` in the URL opens it, otherwise the stored toggle (default closed). */
export function readDebugPreference(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('debug')) return true;
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeDebugPreference(open: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
  } catch {
    // Storage unavailable: the toggle just won't be remembered.
  }
}

const seconds = (ms: number) => (Math.max(ms, 0) / 1000).toFixed(1);

/**
 * Read-only live view of the motion store. Deliberately not a live region (it
 * updates several times per second) and `pointer-events: none`, so it never
 * blocks taps.
 */
export function DebugOverlay() {
  const snapshot = useMotion(motionStore);
  const { taps, suppressed } = useShowFull(showFull);
  const { config } = motionStore;

  // Re-render a few times per second so "time in state" advances (store clock is Date.now()).
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);

  const pending = snapshot.pending !== null && snapshot.pendingSince !== null
    ? `${snapshot.pending} ${seconds(now - snapshot.pendingSince)}/${seconds(
        snapshot.pending === 'moving' ? config.enterMovingAfterMs : config.exitMovingAfterMs,
      )}s`
    : '—';

  const rows: [string, string][] = [
    ['state', snapshot.state],
    ['detected', snapshot.detected],
    ['forced', snapshot.forced ?? '—'],
    ['source', `${snapshot.source ?? '—'}${snapshot.running ? '' : ' (off)'}`],
    ['cadence', `${snapshot.cadence.toFixed(1)} (${config.minCadence}–${config.maxCadence})`],
    ['in state', `${seconds(now - snapshot.enteredAt)}s`],
    ['pending', pending],
    ['error', snapshot.error ?? '—'],
    ['show-full', `${taps}${suppressed ? ' off' : ''}`],
  ];

  return (
    <section
      role="region"
      aria-label="Motion debug"
      className="k-debug"
    >
      <dl className="k-debug__list">
        {rows.map(([name, value]) => (
          <div key={name} className="k-debug__row">
            <dt>{name}</dt>
            <dd data-debug={name}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
