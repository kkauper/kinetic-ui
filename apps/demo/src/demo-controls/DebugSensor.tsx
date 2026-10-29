import { useEffect, useState, useSyncExternalStore } from 'react';
import { motionStore } from '../stores';
import { Pill } from '../ui/Pill';
import { copyText } from '../ui/copyText';
import { RECORD_MS, traceRecorder } from './traceRecorder';

const fixed = (n: number) => n.toFixed(2);

/** Live estimator internals and the 20 s trace recorder. Debug-only: relies on the store's unstable diagnostics. */
export function DebugSensor() {
  const [diagnostics, setDiagnostics] = useState(() => motionStore.getDiagnostics());
  useEffect(() => {
    const timer = setInterval(() => setDiagnostics(motionStore.getDiagnostics()), 200);
    return () => clearInterval(timer);
  }, []);

  const recorder = useSyncExternalStore(traceRecorder.subscribe, traceRecorder.getState);
  const [feedback, setFeedback] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [sizeKb, setSizeKb] = useState(0);

  // Polite announcement at start and end (not every second).
  const status = recorder.status;
  useEffect(() => {
    if (status === 'recording') setAnnouncement(`Recording ${RECORD_MS / 1000} seconds. Keep walking.`);
    if (status === 'done') {
      setAnnouncement(`Recording finished, ${traceRecorder.getState().samples} samples.`);
      setSizeKb(Math.round((traceRecorder.json()?.length ?? 0) / 100) / 10);
    }
  }, [status]);

  const rows: [string, string][] = [
    ['sample rate', `${diagnostics.sampleRateHz.toFixed(0)} Hz`],
    ['signal', `${fixed(diagnostics.signal)} m/s²`],
    ['envelope', `${fixed(diagnostics.envelope)} m/s²`],
    ['threshold', `${fixed(diagnostics.threshold)} m/s²`],
    ['steps in window', String(diagnostics.stepsInWindow)],
    ['interval regularity', `${fixed(diagnostics.intervalCv)} (steady below 0.30)`],
  ];

  const recording = recorder.status === 'recording';
  const done = recorder.status === 'done';

  async function copy() {
    const json = traceRecorder.json();
    if (!json) return;
    setFeedback((await copyText(json)) ? 'Trace copied.' : 'Copy failed. Use Download trace instead.');
  }

  function download() {
    const json = traceRecorder.json();
    if (!json) return;
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `kinetic-trace-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback('Trace downloaded.');
  }

  return (
    <section className="k-sheet__section" aria-labelledby="debug-sensor-heading">
      <h3 id="debug-sensor-heading" className="k-sheet__heading">Sensor</h3>
      <dl className="k-debug__list">
        {rows.map(([name, value]) => (
          <div key={name} className="k-debug__row">
            <dt>{name}</dt>
            <dd data-debug={`sensor-${name}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="k-debug-tools__buttons">
        <Pill
          type="button"
          size="3"
          variant="soft"
          disabled={recording}
          onClick={() => {
            setFeedback('');
            traceRecorder.start();
          }}
        >
          {recording ? `Recording… ${recorder.remainingS} s` : 'Record 20 s'}
        </Pill>
        {done && recorder.samples > 0 && (
          <>
            <Pill type="button" size="3" variant="soft" color="gray" onClick={() => void copy()}>
              Copy trace
            </Pill>
            <Pill type="button" size="3" variant="soft" color="gray" onClick={download}>
              Download trace
            </Pill>
          </>
        )}
      </div>
      {(recording || done) && (
        <div className="k-demo-controls__status" data-debug="trace-info">
          {recording
            ? `${recorder.samples} samples so far`
            : recorder.samples > 0
              ? `${recorder.samples} samples, ${sizeKb} KB`
              : 'No samples received. Start walking mode (or the simulator) first, then record again.'}
        </div>
      )}
      <div className="k-sr-only" role="status" aria-live="polite">
        {announcement}
        {feedback ? ` ${feedback}` : ''}
      </div>
      {feedback && <div className="k-demo-controls__status" aria-hidden="true">{feedback}</div>}
    </section>
  );
}
