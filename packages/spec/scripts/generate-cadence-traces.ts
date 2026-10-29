// Regenerates fixtures/cadence-traces.json from core's synthetic walking generator.
// Run: npm run fixtures -w @kinetic-ui/spec (Node >= 22.6, no extra dependency).
// The committed traces are the reference data; other implementations must agree
// with them. This script only documents how they were made.
import { writeFileSync } from 'node:fs';
import { createCadenceEstimator } from '../../core/src/motion/cadence.ts';
import { DEFAULT_MOTION_CONFIG } from '../../core/src/motion/config.ts';
import { generateWalkingSamples } from '../../core/src/motion/sources/simulator.ts';

const DEFAULT_RATE_HZ = 50;
const DURATION_MS = 8000;
const TOLERANCE = 0.15;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

interface TraceSpec {
  name: string;
  cadence: number;
  seed: number;
  noise?: number;
  /** Peak vertical swing (m/s^2); the generator default is 3 (phone in a pocket), a hand-held phone sees 0.5 to 1. */
  amplitude?: number;
  /** Replace the periodic swing with bumps at random intervals (hand jitter), height = `amplitude`. */
  jitter?: boolean;
  sampleRateHz?: number;
  durationMs?: number;
  /** Times (ms) at which the reference cadence is recorded; `end` is the last sample. */
  at: (end: number) => number[];
}

/** Same PRNG as the simulator (not exported there). */
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

/** Still phone plus Gaussian-shaped bumps (sigma 60 ms) at random 150 to 1550 ms intervals: irregular, not periodic. */
function generateJitterSamples(opts: { amplitude: number; noise: number; durationMs: number; sampleRateHz: number; seed: number }) {
  const random = mulberry32(opts.seed);
  const bumps: number[] = [];
  for (let t = 300; t < opts.durationMs; t += 150 + random() * 1400) bumps.push(t);
  const count = Math.floor((opts.durationMs / 1000) * opts.sampleRateHz);
  const samples: { kind: 'acceleration'; t: number; x: number; y: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / opts.sampleRateHz) * 1000;
    let bump = 0;
    for (const b of bumps) bump += opts.amplitude * Math.exp(-(((t - b) / 60) ** 2));
    samples.push({
      kind: 'acceleration',
      t,
      x: (random() - 0.5) * opts.noise,
      y: (random() - 0.5) * opts.noise,
      z: 9.81 + bump + (random() - 0.5) * opts.noise,
    });
  }
  return samples;
}

const specs: TraceSpec[] = [
  { name: 'still phone with noise reports no cadence (60 Hz)', cadence: 0, seed: 7, noise: 0.6, sampleRateHz: 60, at: (end) => [end] },
  { name: '1.4 steps/s slow walk is just below the band (50 Hz)', cadence: 1.4, seed: 4, at: (end) => [5000, end] },
  {
    name: '1.8 steps/s walk: warming up, then in band, then silent after the samples stop (50 Hz)',
    cadence: 1.8,
    seed: 1,
    at: (end) => [1000, 4000, end, end + 3000],
  },
  { name: '1.8 steps/s walk at iOS rate (60 Hz)', cadence: 1.8, seed: 5, sampleRateHz: 60, at: (end) => [5000, end] },
  { name: '2.4 steps/s brisk walk stays in the band (60 Hz)', cadence: 2.4, seed: 2, sampleRateHz: 60, at: (end) => [5000, end] },
  { name: '4 steps/s shaking is above the band (50 Hz)', cadence: 4, seed: 3, at: (end) => [5000, end] },
  { name: '4 steps/s shaking is above the band (60 Hz)', cadence: 4, seed: 6, sampleRateHz: 60, at: (end) => [5000, end] },
  // Hand-held phone (reading the form while walking): small bounce. The old fixed threshold of 1.2 reported 0 for all of these.
  { name: 'hand-held 1.8 steps/s, amplitude 0.6, noise 0.2 (60 Hz)', cadence: 1.8, seed: 11, amplitude: 0.6, noise: 0.2, sampleRateHz: 60, durationMs: 6000, at: (end) => [5000, end] },
  { name: 'hand-held 1.8 steps/s, amplitude 1.0, noise 0.2 (60 Hz)', cadence: 1.8, seed: 12, amplitude: 1.0, noise: 0.2, sampleRateHz: 60, durationMs: 6000, at: (end) => [5000, end] },
  { name: 'hand-held 1.5 steps/s, amplitude 0.6, noise 0.2 stays in the band (60 Hz)', cadence: 1.5, seed: 13, amplitude: 0.6, noise: 0.2, sampleRateHz: 60, durationMs: 6000, at: (end) => [5000, end] },
  { name: 'hand-held 1.8 steps/s, amplitude 0.6, noisy (0.3) (50 Hz)', cadence: 1.8, seed: 14, amplitude: 0.6, noise: 0.3, durationMs: 6000, at: (end) => [5000, end] },
  { name: 'hand-held 2.4 steps/s, amplitude 0.8, noise 0.2 (60 Hz)', cadence: 2.4, seed: 15, amplitude: 0.8, noise: 0.2, sampleRateHz: 60, durationMs: 6000, at: (end) => [5000, end] },
  { name: 'still hand-held phone with noise 0.3 reports no cadence (60 Hz)', cadence: 0, seed: 16, noise: 0.3, sampleRateHz: 60, durationMs: 6000, at: (end) => [end] },
  { name: 'irregular jitter bursts (random intervals, height 1.0) report no cadence (60 Hz)', cadence: 0, jitter: true, seed: 1, amplitude: 1.0, noise: 0.3, sampleRateHz: 60, durationMs: 6000, at: (end) => [5000, end] },
  { name: 'irregular jitter bursts (random intervals, height 3.0) report no cadence (50 Hz)', cadence: 0, jitter: true, seed: 4, amplitude: 3.0, noise: 0.3, durationMs: 6000, at: (end) => [5000, end] },
  { name: '4 steps/s shake at amplitude 3 stays above the band (60 Hz)', cadence: 4, seed: 17, amplitude: 3, noise: 0.3, sampleRateHz: 60, durationMs: 6000, at: (end) => [5000, end] },
];

const traces = specs.map((spec) => {
  const rate = spec.sampleRateHz ?? DEFAULT_RATE_HZ;
  const samples: [number, number, number, number][] = [];
  const generated = spec.jitter
    ? generateJitterSamples({
        amplitude: spec.amplitude ?? 1,
        noise: spec.noise ?? 0.3,
        durationMs: spec.durationMs ?? DURATION_MS,
        sampleRateHz: rate,
        seed: spec.seed,
      })
    : generateWalkingSamples({
        cadence: spec.cadence,
        durationMs: spec.durationMs ?? DURATION_MS,
        sampleRateHz: rate,
        seed: spec.seed,
        noise: spec.noise,
        amplitude: spec.amplitude,
      });
  for (const s of generated) {
    if (s.kind === 'acceleration') samples.push([round3(s.t), round3(s.x), round3(s.y), round3(s.z)]);
  }
  const end = samples[samples.length - 1]![0];
  const checkpoints = spec.at(end);
  // Reference cadence: feed the rounded samples, read at each checkpoint in time order.
  const estimator = createCadenceEstimator(DEFAULT_MOTION_CONFIG);
  const expect: { t: number; cadence: number; tolerance: number }[] = [];
  let next = 0;
  const sorted = [...checkpoints].sort((a, b) => a - b);
  for (const [t, x, y, z] of samples) {
    estimator.push({ t, x, y, z });
    while (next < sorted.length && sorted[next]! <= t) {
      const cadence = estimator.cadence(sorted[next]!);
      expect.push({ t: sorted[next]!, cadence, tolerance: cadence === 0 ? 0 : TOLERANCE });
      next++;
    }
  }
  for (; next < sorted.length; next++) {
    const cadence = estimator.cadence(sorted[next]!);
    expect.push({ t: sorted[next]!, cadence, tolerance: cadence === 0 ? 0 : TOLERANCE });
  }
  return { name: spec.name, sampleRateHz: rate, samples, expect };
});

const lines = [
  '{',
  '  "$comment": "Accelerometer traces (m/s^2 incl. gravity; samples are [t_ms, x, y, z]) with the reference cadence (steps/s) the estimator reports at given times, run with the default config. Feed samples in order, then read cadence(t) for each expect entry (t <= last sample: after pushing the samples up to t; later: after all samples). Generated by scripts/generate-cadence-traces.ts; the committed data is the reference.",',
  '  "version": 1,',
  '  "cases": [',
];
traces.forEach((trace, i) => {
  lines.push('    {');
  lines.push(`      "name": ${JSON.stringify(trace.name)},`);
  lines.push(`      "sampleRateHz": ${trace.sampleRateHz},`);
  lines.push('      "samples": [');
  trace.samples.forEach((s, j) => lines.push(`        ${JSON.stringify(s)}${j < trace.samples.length - 1 ? ',' : ''}`));
  lines.push('      ],');
  lines.push('      "expect": [');
  trace.expect.forEach((e, j) => lines.push(`        ${JSON.stringify(e)}${j < trace.expect.length - 1 ? ',' : ''}`));
  lines.push('      ]');
  lines.push(`    }${i < traces.length - 1 ? ',' : ''}`);
});
lines.push('  ]', '}', '');

writeFileSync(new URL('../fixtures/cadence-traces.json', import.meta.url), lines.join('\n'));
