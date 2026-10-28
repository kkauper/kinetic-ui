import type { MotionSample, MotionSource, Scheduler } from '../types';

const GRAVITY = 9.81;

/** Small deterministic PRNG, so generated samples are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface WalkingSampleOptions {
  /** Steps per second; 0 produces a still phone (gravity plus noise). */
  cadence: number;
  durationMs: number;
  startAt?: number;
  /** Default 50. */
  sampleRateHz?: number;
  /** Peak vertical swing in m/s^2. Default 3. */
  amplitude?: number;
  /** Uniform noise amplitude in m/s^2. Default 0.3. */
  noise?: number;
  seed?: number;
}

/** Generates deterministic synthetic accelerometer samples for a given cadence. */
export function generateWalkingSamples(opts: WalkingSampleOptions): MotionSample[] {
  const { cadence, durationMs, startAt = 0, sampleRateHz = 50, amplitude = 3, noise = 0.3, seed = 1 } = opts;
  const random = mulberry32(seed);
  const count = Math.floor((durationMs / 1000) * sampleRateHz);
  const samples: MotionSample[] = [];
  for (let i = 0; i < count; i++) {
    const seconds = i / sampleRateHz;
    const swing = cadence > 0 ? amplitude * Math.sin(2 * Math.PI * cadence * seconds) : 0;
    samples.push({
      kind: 'acceleration',
      t: startAt + seconds * 1000,
      x: (random() - 0.5) * noise,
      y: (random() - 0.5) * noise,
      z: GRAVITY + swing + (random() - 0.5) * noise,
    });
  }
  return samples;
}

export type SimulatorSource = MotionSource & { setCadence(stepsPerSecond: number): void };

/** Emits synthetic samples on a timer, for desktop testing. */
export function createSimulatorSource(
  opts: { cadence?: number; sampleRateHz?: number; scheduler?: Scheduler; now?: () => number } = {},
): SimulatorSource {
  const rate = opts.sampleRateHz ?? 50;
  const now = opts.now ?? (() => Date.now());
  const scheduler: Scheduler = opts.scheduler ?? {
    setInterval: (fn, ms) => (globalThis as unknown as { setInterval(f: () => void, m: number): unknown }).setInterval(fn, ms),
    clearInterval: (h) => (globalThis as unknown as { clearInterval(h: unknown): void }).clearInterval(h),
  };
  const random = mulberry32(1);
  let cadence = opts.cadence ?? 0;
  let phase = 0;
  let timer: unknown = null;

  return {
    id: 'simulator',
    start(emit) {
      if (timer !== null) return;
      timer = scheduler.setInterval(() => {
        phase += (2 * Math.PI * cadence) / rate;
        const swing = cadence > 0 ? 3 * Math.sin(phase) : 0;
        emit({
          kind: 'acceleration',
          t: now(),
          x: (random() - 0.5) * 0.3,
          y: (random() - 0.5) * 0.3,
          z: GRAVITY + swing + (random() - 0.5) * 0.3,
        });
      }, 1000 / rate);
    },
    stop() {
      if (timer !== null) scheduler.clearInterval(timer);
      timer = null;
    },
    setCadence(stepsPerSecond) {
      cadence = stepsPerSecond;
    },
  };
}
