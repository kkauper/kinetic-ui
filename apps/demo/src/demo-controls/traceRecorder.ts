import { motionStore } from '../stores';

/** Length of a recording. */
export const RECORD_MS = 20_000;

export interface RecorderState {
  status: 'idle' | 'recording' | 'done';
  /** Seconds left while recording. */
  remainingS: number;
  samples: number;
}

/**
 * Debug-only raw accelerometer recorder, so a real phone's data can be sent back for tuning.
 * Lives outside React so a recording survives closing the sheet. Uses the store's unstable `onSample` tap.
 */
let state: RecorderState = { status: 'idle', remainingS: 0, samples: 0 };
let samples: [number, number, number, number][] = [];
let origin: number | null = null;
let startedAt = 0;
let unsubscribe: (() => void) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function set(next: RecorderState) {
  state = next;
  for (const listener of listeners) listener();
}

function finish() {
  unsubscribe?.();
  unsubscribe = null;
  if (timer !== null) clearInterval(timer);
  timer = null;
  set({ status: 'done', remainingS: 0, samples: samples.length });
}

export const traceRecorder = {
  getState: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  start() {
    if (state.status === 'recording') return;
    samples = [];
    origin = null;
    startedAt = performance.now();
    unsubscribe = motionStore.onSample((sample) => {
      if (sample.kind !== 'acceleration') return;
      origin ??= sample.t;
      samples.push([round3(sample.t - origin), round3(sample.x), round3(sample.y), round3(sample.z)]);
    });
    set({ status: 'recording', remainingS: RECORD_MS / 1000, samples: 0 });
    timer = setInterval(() => {
      const left = RECORD_MS - (performance.now() - startedAt);
      if (left <= 0) return finish();
      set({ status: 'recording', remainingS: Math.ceil(left / 1000), samples: samples.length });
    }, 250);
  },
  /** The recording as JSON text; null before the first one. */
  json(): string | null {
    if (state.status !== 'done') return null;
    const span = (samples[samples.length - 1]?.[0] ?? 0) / 1000;
    const sampleRateHz = span > 0 ? Math.round(((samples.length - 1) / span) * 10) / 10 : 0;
    return JSON.stringify({ device: navigator.userAgent, sampleRateHz, note: '', samples });
  },
};
