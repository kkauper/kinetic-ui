import { useEffect, useState } from 'react';
import { useMotion, useShowFull } from '@kinetic-ui/react';
import { motionStore, showFull } from '../stores';
import { debugUi, useDebugUi } from './debugUi';

const seconds = (ms: number) => (Math.max(ms, 0) / 1000).toFixed(1);

/**
 * Live rows of the motion store. Not a live region (it updates several times
 * per second), so screen readers read it on demand instead of being flooded.
 */
export function Readout() {
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
    ['activity', snapshot.activity ?? '—'],
    ['cadence', `${snapshot.cadence.toFixed(1)} (${config.minCadence}–${config.maxCadence})`],
    ['in state', `${seconds(now - snapshot.enteredAt)}s`],
    ['pending', pending],
    ['error', snapshot.error ?? '—'],
    ['show-full', `${taps}${suppressed ? ' off' : ''}`],
  ];

  return (
    <dl className="k-debug__list">
      {rows.map(([name, value]) => (
        <div key={name} className="k-debug__row">
          <dt>{name}</dt>
          <dd data-debug={name}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatPill(snapshot: ReturnType<typeof motionStore.getState>, now: number): string {
  const { pending, pendingSince } = snapshot;
  const parts = [snapshot.state, `${snapshot.cadence.toFixed(1)} steps/s`, `${Math.floor(Math.max(now - snapshot.enteredAt, 0) / 1000)} s`];
  if (pending !== null && pendingSince !== null) parts.push(`→ ${pending} ${seconds(now - pendingSince)} s`);
  return parts.join(' · ');
}

/**
 * Compact one-line status pill. It is in the page flow (a sticky row at the end
 * of the full form, a row right above the thumb bar in the stepper), so it can
 * never cover a field, and the space it needs is part of the layout. A button
 * that opens the debug sheet; not a live region. Errors are not shown here
 * (they have their own Notice).
 */
export function PinnedReadout({ placement }: { placement: 'page' | 'stepper' }) {
  const snapshot = useMotion(motionStore);
  const ui = useDebugUi();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  if (!ui.shown || !ui.pinned) return null;
  const moving = snapshot.state === 'moving';
  return (
    <div className={`k-pillrow k-pillrow--${placement}`}>
      <button
        type="button"
        className="k-readout-pill"
        aria-haspopup="dialog"
        onClick={(event) => debugUi.open(event.currentTarget)}
      >
        <svg aria-hidden="true" focusable="false" width="10" height="10" viewBox="0 0 10 10">
          {moving ? <circle cx="5" cy="5" r="5" fill="currentColor" /> : <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="2" />}
        </svg>
        <span className="k-readout-pill__text">{formatPill(snapshot, now)}</span>
        <span className="k-sr-only">Open debug</span>
      </button>
    </div>
  );
}
