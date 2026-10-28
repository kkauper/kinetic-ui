# Decisions

What was chosen, what was rejected and why, and the known limits. Each entry is short on purpose: the code is the detail, this file is the reasoning.

## Architecture

### Headless core, thin bindings
**Chosen:** `@kinetic-ui/core` holds both models (motion and form) as plain TypeScript stores. `@kinetic-ui/react` is a handful of hooks of a few lines each over `useSyncExternalStore`.
**Why:** the brief is a model that any UI can consume. Keeping React out of the core makes the store contract (`getState`, `subscribe`) the product and React just one consumer. The README shows Vue and Svelte wrappers in a few lines to prove the point.
**Rejected:** a React context/provider library. It would tie the model to one framework and hide the contract behind components.

### Core compiles without DOM types
**Chosen:** `packages/core/tsconfig.json` uses `lib: ["ES2022"]` and `types: []`. Anything platform-specific (storage, `devicemotion`, the element that receives `data-motion`, timers) comes in through small structural interfaces defined in core (`KeyValueStorage`, `MotionEventTarget`, `Scheduler`, `{ setAttribute }`).
**Why:** "no React or DOM imports" is enforced by the compiler instead of by review. It also makes everything testable in Node with fakes.
**Cost:** a few structural casts of `globalThis` for default timers and the default accelerometer environment.

### One store shape for everything
Form model, motion store and the Show-full policy all implement `ReadableStore<T>` (`getState`, `subscribe`). Snapshots are immutable and **keep the same reference when nothing changed**, which `useSyncExternalStore` requires and which avoids needless re-renders in any framework. No-op actions (back at step 0, deferring an already deferred field, repeating the same validation error) do not emit; unit tests pin this.

### Components never touch sensors
Product UI (`FullForm`, `Stepper`, field renderers) only reads `useMotion(store).state`. Sources are created in `apps/demo/src/stores.ts` and only the `demo-controls/` folder (the stand-in for "input devices and tooling") switches them. Moving mode reaches CSS through `bindMotionAttribute`, which sets `<html data-motion="still|moving">`.

## Motion model

### Cadence heuristic plus hysteresis (demo-grade)
**Chosen:** acceleration magnitude, minus a slow moving average (gravity), lightly smoothed; a step is a rising crossing of a threshold with a refractory period; cadence is 1000 / median step interval over a 4 s window. Walking is cadence within 1.5–2.5 steps/s. A pure reducer (`stepMachine`) commits a change only after the opposite condition has held for `enterMovingAfterMs` (5 s) or `exitMovingAfterMs` (10 s).
**Why:** cheap, explainable, runs on any phone browser, and the slow exit means a pause at a traffic light does not flip the UI back and forth. The asymmetric timing biases towards the full form: simplifying late is cheaper than simplifying wrongly.
**Rejected:** native activity recognition (Core Motion, Activity Recognition API). Not reachable from a web page and out of scope by brief. ML classifiers: overkill for a prototype and hard to explain.
**Measured (synthetic 1.8 steps/s walk in Chromium):** still → moving after 7.1 s (cadence window warm-up plus 5 s), moving → still 11.2 s after walking stopped.
**Tuning:** every constant lives in `packages/core/src/motion/config.ts`. Use the debug overlay on a phone.

### Sources are adapters
`MotionSource` has `start(emit)` (may be async) and `stop()`. Shipped: manual toggle, simulator (seeded, deterministic, also used by tests) and accelerometer. Sources that already know the state (the manual toggle) emit `state` samples, which **bypass hysteresis**: an explicit user statement should act immediately, and running it through the cadence estimator would decay it back to still after 10 s.

### Clock rule
Samples are stamped with the store's clock (`Date.now()` by default), never with `event.timeStamp`, which has a different origin. The store, estimator and sources must share one clock; it is injectable for tests.

### Accelerometer and the iOS permission
**Chosen:** an explicit "Walking mode" button. `DeviceMotionEvent.requestPermission()` (iOS 13+, and present in newer Chrome) only succeeds during a user gesture, so the path click → `setSource` → `start` → `source.start` → `requestPermission()` has **no `await` before the permission call**. This was verified in Playwright (`navigator.userActivation.isActive` was true inside the call).
**Failure modes, each with a visible message:** insecure context (sensors need HTTPS), API missing, permission denied, no data within 3 s (desktop browsers expose the API but never fire it).
**Rejected:** starting sensors on page load. It is impossible on iOS and would be a surprising permission prompt elsewhere.

## False positives (being wrong is expected)

- **Debounce:** the hysteresis above.
- **Persistent "Show full form" control** in moving mode, always in the same top-bar position. A tap forces the full form until the detector really sees the user stop, so the next walk can simplify again. After 3 taps moving mode is suppressed for the session (page lifetime), with a visible "Turn back on". The policy is headless (`createShowFullPolicy`).
- **Deferred fields:** deferrable questions get "Later" in the stepper, collect under "N questions for later" (always visible as a chip, listed on the done step) and are highlighted "Saved for later" in the full form.
- **Answers survive every switch:** both presentations render the same `FormState`; every answer is saved to the model and to localStorage on change.

## Form

### One schema, two presentations
`signup.schema.json` is the source of truth; `defineSchema` validates it at load (unique ids, known kinds, `required` and `deferrable` are mutually exclusive, because a required field cannot be postponed).
**Stepper rules:**
- Entering moving mode jumps to the first unanswered, non-deferred question; Next and Later also land there, so already-answered questions are skipped. Back is plain step-back, so answers can still be reviewed.
- Auto-advance (300 ms, so the choice is seen) only after unambiguous taps: choice cards and the Yes/No toggle. Text and slider never auto-advance.
- The toggle is a Switch in the full form but two large Yes/No cards in the stepper. A switch that auto-advances is ambiguous (did the user mean to flip it back?) and is a small target.
- The slider's displayed default ("Never") is confirmed by pressing Next, because Radix only reports value changes, so the minimum could not otherwise be chosen.
- Back is a large button in the bottom thumb bar plus a swipe-right gesture (ignored when it starts on an input or slider).
**Reduce, don't rearrange:** the top bar, the field area and the bottom actions keep their positions; moving mode removes content rather than moving it.

### Persistence
`createStoragePersistence(() => window.localStorage, key)`: the storage getter itself, `getItem`, `JSON.parse` and `setItem` are all wrapped in try/catch, because Safari private mode, blocked storage and quota errors throw. Corrupt or mismatched data (different schema id or version) is ignored; the form then renders empty. `currentStep` and errors are not persisted (they are view state).

## UI and Radix Themes

### Radix Themes
**Chosen:** Radix Themes for Slider, Switch, RadioCards, TextField, Button, Badge and Callout. Keyboard and ARIA behavior come from Radix primitives, so the demo concentrates on the motion-specific decisions.
**Rejected:** hand-built controls (re-implementing well-solved accessibility is a poor use of a prototype) and headless primitives alone (more styling work, and visual polish is explicitly secondary).

### Moving mode is a token set
- `apps/demo/src/tokens.css` defines `--k-*` variables (target size, gaps, question type size, thumb-zone padding) and swaps them under `[data-motion='moving']`. Targets are at least 56 px in moving mode (measured: Back/Next 56 px).
- Radix levers are mapped in one place (`ui/useUiSize.ts`): Theme `scaling` 100% → 110% and component `size` 2 → 3.
- No per-component overrides scattered across files.

### Radix overrides (deliberate, documented)
1. **Slider thumb size.** Radix's largest Slider thumb is about 14 px (`--slider-thumb-size: calc(var(--slider-track-size) + var(--space-1))`). Too small to hit while walking. Override, scoped to moving mode: `[data-motion='moving'] .rt-SliderRoot { --slider-track-size: 12px; --slider-thumb-size: 32px; }`. The thumb's `::before` hit area is 3× the thumb, so 96 px. Uses Radix's own variables, so it survives minor upgrades, but relies on the internal class name `.rt-SliderRoot`.
2. **Slider thumb ARIA.** Radix Themes spreads `aria-*` props onto the Slider root, but the element with `role="slider"` is the thumb, which received no accessible name and no `aria-valuetext`. A small layout effect sets `aria-labelledby`, `aria-valuetext` ("Weekly", not "2"), `aria-describedby` and `aria-invalid` on the thumb. Radix never renders these attributes itself, so they are not overwritten.
3. **TextField.** No override needed: `TextField.Root` forwards `type`, `inputMode`, `autoComplete`, `autoCapitalize`, `autoCorrect`, `spellCheck` and `enterKeyHint` to the inner `<input>` (verified in the rendered DOM).

### Accessibility basics
- Real `<label>`s, or `aria-labelledby` for groups.
- Errors linked with `aria-describedby`, and `aria-invalid` on the control.
- Visible `:focus-visible` outlines.
- On a step change, focus moves to the question heading, not the input, so the phone keyboard does not pop up unasked. Progress ("Question 2 of 5") is in an `aria-live="polite"` region.
- On a failed full-form submit, focus goes to the first invalid control.
- `prefers-reduced-motion` disables transitions. There are no slide animations at all.
- Contrast comes from Radix's default palette.

## Email input
Mobile keyboard (`type="email"`, `inputmode="email"`, `autocomplete="email"`), autocorrect, auto-capitalization and spellcheck off. Domain chips (@gmail.com, @icloud.com, @outlook.com), typo suggestions by edit distance ("gmial.com, did you mean gmail.com?") and whitespace normalization are pure functions in `core/form/email.ts`. The suggestion never blocks submitting: the user may really mean that domain.

Chips use `onPointerDown` → `preventDefault` so the input keeps focus and the phone keyboard does not close and reopen. Normalization runs on blur and again before validation (Next and submit) for every `format: 'email'` field.

## Demo tooling

- **Demo controls are one compact row** (Simulate walking, Walking mode, Debug) at Radix size 1, explicitly opted out of the moving-mode target floor. They stand in for an input device, not product UI, and an earlier version that sat in flow pushed the stepper to the bottom of the phone screen.
- **The debug overlay is a read-only, fixed read-out** (`pointer-events: none`, not a live region because it updates several times per second), placed bottom-left above the thumb bar so it covers neither "Show full form" nor Back/Next. Interactive tools (simulated cadence slider, reset Show-full, clear answers) live in a collapsed "Debug tools" disclosure.
- **The simulator source** makes the hysteresis testable on a desktop without a phone (1.8 steps/s → moving after about 7 s).

## Hosting
Cloudflare Workers with static assets, at `kineticui.kauper.co`, deployed by Cloudflare's Git integration (Workers Builds): every push to `main` deploys, other branches get preview URLs. Why: a custom subdomain on the owner's own domain, hosting that does not depend on the repo being public, a free tier that covers static assets, and Git-connected deploys with previews. Cloudflare's docs say to start new projects on Workers, so Pages was not used. Vite `base` is `/` because the site sits at the subdomain root. GitHub Actions (`ci.yml`) still runs tests, typecheck and build on every push and PR. Rejected: GitHub Pages (the first setup: needs a public repo on the free plan, a separate CNAME setup for a custom domain, and the `/kinetic-ui/` base path).

## Known limits
- The step detector is demo-grade. It will misread a phone in a swinging bag, running (over the band), stairs, vehicles (bumpy roads can land in the band), and slow walkers below 1.5 steps/s. The asymmetric hysteresis and the Show-full escape hatch exist because of this.
- Background tabs: browsers stop `devicemotion` when the page is hidden; the UI decays to still after the exit time.
- Only the first moving episode after a Show-full tap is suppressed until the user stops; a user who never stops walking stays in the full form, which is the safe direction.
- "Session" for Show-full suppression is the page lifetime, not `sessionStorage`. A reload re-enables moving mode.
- No real backend or auth; "Create account" only validates.
- Not a full accessibility audit; tested with keyboard and Playwright's accessibility snapshot, not with VoiceOver/TalkBack on devices.
- Unit tests cover the motion state machine, cadence estimator, motion store, Show-full policy, form model and email helpers. UI behaviour was verified with scripted Playwright runs, which are not committed as a test suite.
- npm: the unscoped name `kinetic-ui` belongs to an unrelated, abandoned 2021 package; the `@kinetic-ui` scope is unclaimed. The packages here are private workspace packages and are not published.
