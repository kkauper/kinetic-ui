// Adds a trace recorded on a real phone (debug sheet, "Record 20 s") to fixtures/cadence-recorded.json.
// Run: node packages/spec/scripts/add-recorded-trace.ts <trace.json> "<generic case name>" <cadence> <tolerance> [fromMs]
// Expectations are `cadence +/- tolerance` at every full second from `fromMs` (default 4000) and at the last
// sample. The numbers are NOT taken from the estimator: they are the walking pace known from the recording
// (check it first, e.g. by spectrum), so the fixture tests the estimator against reality, not against itself.
// Recorded traces live in their own file so regenerating the synthetic ones never touches them.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [file, name, cadenceArg, toleranceArg, fromArg] = process.argv.slice(2);
if (!file || !name || !cadenceArg || !toleranceArg) throw new Error('usage: add-recorded-trace.ts <trace.json> <name> <cadence> <tolerance> [fromMs]');
// A recording also carries `events` (the app's decisions at ~10 Hz). They are dropped here: the fixture checks the
// estimator against the pace, and decisions made by an older algorithm would go stale.
const trace = JSON.parse(readFileSync(file, 'utf8')) as { sampleRateHz: number; samples: number[][] };
const cadence = Number(cadenceArg);
const tolerance = Number(toleranceArg);
const from = Number(fromArg ?? 4000);
const end = trace.samples[trace.samples.length - 1]![0]!;
const times: number[] = [];
for (let t = from; t <= end; t += 1000) times.push(t);
if (times[times.length - 1] !== end) times.push(end);

const out = new URL('../fixtures/cadence-recorded.json', import.meta.url);
const comment =
  'Accelerometer traces recorded on real phones with the debug sheet (m/s^2 incl. gravity; samples are [t_ms, x, y, z], t relative). Same shape and semantics as cadence-traces.json; the expected cadence is the pace known from the recording, with a tolerance. Added by scripts/add-recorded-trace.ts; never regenerated.';
const doc = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { $comment: comment, version: 1, cases: [] };
doc.cases = doc.cases.filter((c: { name: string }) => c.name !== name);
doc.cases.push({
  name,
  sampleRateHz: trace.sampleRateHz,
  samples: trace.samples,
  expect: times.map((t) => ({ t, cadence, tolerance })),
});

const lines = ['{', `  "$comment": ${JSON.stringify(doc.$comment)},`, '  "version": 1,', '  "cases": ['];
doc.cases.forEach((c: { name: string; sampleRateHz: number; samples: unknown[]; expect: unknown[] }, i: number) => {
  lines.push('    {', `      "name": ${JSON.stringify(c.name)},`, `      "sampleRateHz": ${c.sampleRateHz},`, '      "samples": [');
  c.samples.forEach((s, j) => lines.push(`        ${JSON.stringify(s)}${j < c.samples.length - 1 ? ',' : ''}`));
  lines.push('      ],', '      "expect": [');
  c.expect.forEach((e, j) => lines.push(`        ${JSON.stringify(e)}${j < c.expect.length - 1 ? ',' : ''}`));
  lines.push('      ]', `    }${i < doc.cases.length - 1 ? ',' : ''}`);
});
lines.push('  ]', '}', '');
writeFileSync(out, lines.join('\n'));
