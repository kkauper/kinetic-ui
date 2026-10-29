# @kinetic-ui/spec

Language-neutral data that defines Kinetic UI behavior. Every implementation (TypeScript today; Rust, Swift and Kotlin next) runs the same fixtures, so parity is tested instead of promised. No runtime code lives here except two scripts.

| Folder | What |
| --- | --- |
| `schemas/` | The form schema (`signup.schema.json`). |
| `fixtures/` | JSON test cases, run by `packages/core/src/conformance.test.ts` and by every other implementation. |
| `tokens/` | Design tokens in DTCG format (`kinetic.tokens.json`): `still` and `moving` groups. |
| `generated/` | Committed outputs of the token build: `tokens.css`, `KineticTokens.swift`, `KineticTokens.kt`. |
| `scripts/` | `build-tokens.mjs` (Style Dictionary) and `generate-cadence-traces.ts`. |

## Fixture format

Every file is `{ "$comment", "version": 1, "cases": [...] }` (`email.json` has three lists instead of `cases`). Times are in ms, all values plain JSON, every case has a `name`. Config overrides are partial: missing keys use the defaults in `packages/core/src/motion/config.ts` (band 1.5-2.5 steps/s, enter after 5000 ms, exit after 10000 ms, `movingActivities` `["walking"]`, `minActivityConfidence` 0.5).

- **motion-machine.json**: the pure hysteresis reducer. `{ name, config?, steps: [{ t, walking, expect?: { state, pending, enteredAt?, pendingSince? } }] }`. Start from a machine that is `still` since t 0; apply the steps in order; check `expect` after a step.
- **motion-classify.json**: `{ name, config?, input: { cadence } | { activity, confidence }, walking }`. Whether one input counts as walking. Band edges are inclusive.
- **cadence-traces.json**: `{ name, sampleRateHz, samples: [[t, x, y, z]], expect: [{ t, cadence, tolerance }] }`. Push the samples in order (m/s^2 including gravity), read the cadence at each `expect.t` (after the samples up to `t`; later times after all samples) and compare within `tolerance` steps/s.
- **motion-store.json**: `{ name, config?, showFull?, events: [{ t, do, ..., expect? }] }`. A store at t 0 with a source that never emits by itself and a scheduler whose tick runs only on a `tick` event. Per event set the clock to `t`, then `sample` (`{ kind: 'state', state }` or `{ kind: 'activity', activity, confidence }`, `t` added by the harness), `tick`, `force` (`state`: `still`, `moving` or `null`), `showFull` or `resetSession` (these two need `showFull: true`, which attaches a Show-full policy with default options). `expect` may hold `state`, `detected`, `forced`, `pending`, `activity` (snapshot) and `showFull: { active, taps, suppressed }`; only listed keys are checked.
- **form.json**: `{ name, schema, stored?, actions: [{ do, ..., expect? }] }` on the schema named by `schema` (`signup`), with in-memory persistence preloaded with `stored`. Actions: `setAnswer` (`id`, `value`; `null` removes the answer), `next`, `back`, `goTo` (`step`), `defer` (`id?`), `jumpToFirstUnanswered`, `validateAll`, `reset`. `expect` may hold `answers`, `currentStep`, `deferred` (exact), `errorIds` (a set), `errors` (id to exact message) and `returned` (result of `next`, `defer`, `validateAll`).
- **email.json**: `normalize`, `completions` (default quick domains) and `suggestions` (default common domains), each a list of `{ input, output }`.

## Regenerating

- `npm run fixtures -w @kinetic-ui/spec` rewrites `cadence-traces.json` from the TypeScript core's synthetic walk generator (Node 22.6+, no extra dependency). The committed traces are the reference; the script only records how they were made. The other fixtures are written by hand.
- `npm run tokens -w @kinetic-ui/spec` rebuilds `generated/` from the tokens with Style Dictionary 5 (DTCG: `usesDtcg: true`, `$value` / `$type`). Outputs carry a "do not edit" header; a second run produces no diff.
