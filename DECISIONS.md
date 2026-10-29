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
**Chosen:** acceleration magnitude, minus a slow moving average (gravity), lightly smoothed; a step is a rising crossing of a threshold with a refractory period; cadence is 1000 / median step interval over a 4 s window. Both averages use time constants (about 1 s for gravity, 55 ms for the step signal) and the refractory period is 200 ms, so results do not depend on the sample rate (phones deliver 50-100 Hz); with a fixed 0.3 coefficient and a 250 ms refractory period, a 4 steps/s shake sampled at 50 Hz was read as 2 steps/s, inside the walking band. Walking is cadence within 1.5–2.5 steps/s. A pure reducer (`stepMachine`) commits a change only after the opposite condition has held for `enterMovingAfterMs` (5 s) or `exitMovingAfterMs` (10 s).
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

### Activity samples from native classifiers
**Chosen:** a third sample kind, `activity` (`stationary | walking | running | cycling | automotive | unknown` plus a 0..1 confidence), for the OS classifiers on iOS (Core Motion) and Android (Activity Recognition). It goes through the same hysteresis as cadence, because OS classifiers flicker too. Only `walking` with confidence >= 0.5 counts as walking by default (`movingActivities`, `minActivityConfidence`). iOS low/medium/high maps to 0.33/0.67/1; Android transitions have no confidence and report 1.
**Why running and vehicles are not walking:** same reasoning as the cadence band. The full form is the safe direction when the user is running or riding.
**Not on the web:** there is no browser source for it; it exists so the model is the same on every platform.

### Live tuning
`store.configure(partial)` replaces the immutable config and re-evaluates; the cadence estimator reads the current config through a getter. The debug tools use it for the cadence band (session-only, nothing persisted).

## Shared spec and conformance

**Chosen:** `packages/spec` holds language-neutral JSON: the form schema, fixtures for the reducer, the walking classifier, the cadence estimator (generated accelerometer traces with expected cadence and a tolerance), the store (fake clock, no raw sensor data), the form model and the email helpers. `core/src/conformance.test.ts` runs every case against the TypeScript implementation; the Rust core and the Swift and Kotlin packages will run the same files. Test cases double as documentation of the behavior.
**Why:** parity across languages is only real if it is tested; a prose spec drifts. The cadence traces are committed data, so implementations do not need to reproduce the TypeScript generator's PRNG.
**Cost:** fixtures are a second place to update when behavior changes on purpose. Unit tests stay for the TypeScript-specific contracts (same snapshot reference, no emit on no-ops).

### Design tokens from one source
**Chosen:** `kinetic.tokens.json` in the DTCG format, built by Style Dictionary 5 into CSS, Swift and Kotlin (committed outputs). Custom formats keep the output short and scoped (`:root` plus `[data-motion='moving']`).
**Note:** the question font size is now `18px` / `24px` instead of `1.125rem` / `1.5rem`, because tokens are unit-agnostic numbers shared with native platforms (where they become pt, dp and sp).

## Rust core and native bindings

### One Rust core for Swift and Kotlin, driven by platform time
**Chosen:** `crates/kinetic-core` (pure Rust, `serde` only) implements both models; `crates/kinetic-ffi` exposes it to Swift and Kotlin with UniFFI (proc-macro mode, bindings generated by `scripts/generate-bindings.sh` and committed under `native/generated`). The web keeps `@kinetic-ui/core`.
**Why:** the logic (cadence estimator, hysteresis, form semantics, exact error messages) is the part that must not drift between platforms; the platform glue (sensors, timers, storage, UI) is the part that must be native. A Rust core gives one implementation behind idiomatic generated Swift and Kotlin APIs.
**Time belongs to the platform:** the core has no clock, thread or timer. The app calls `push_sample` for each sensor reading and `tick(now)` on its own timer, with times in milliseconds. That keeps the core deterministic and testable with fixtures, avoids a runtime inside a mobile library, and lets each platform use its own sensor and scheduling APIs (Core Motion, `SensorManager`, `Timer`, coroutines).
**Parity:** the Rust core and the TypeScript core run the same JSON fixtures in `packages/spec` (`crates/kinetic-core/tests/conformance.rs` mirrors `conformance.test.ts`); Swift and Kotlin run them through the generated bindings later.
**Rejected:**
- *Kotlin Multiplatform:* the Swift API of a KMP library is shaped by Kotlin/Objective-C interop, and the toolchain is heavy for a model this small.
- *Rust compiled to WASM for the web:* the brief asks for plain TypeScript, and WASM adds async initialisation and a binary to ship. The TypeScript core stays; fixtures keep it honest.
- *Hand-porting to Swift and Kotlin separately:* three implementations to keep in sync, with the fixtures as the only safety net.

### Show-full policy lives in the engine
In TypeScript the policy subscribes to the store. The Rust engine has no subscriptions, so it owns the policy state and consults it after each snapshot change (release the force once the detected state is `still`). The `motion-store.json` fixtures pass unchanged. The FFI layer adds the observer list.

### Listeners run outside the lock
`MotionEngine` and `FormModel` in `kinetic-ffi` hold their state in a `Mutex` (UniFFI objects are `Send + Sync`). After a change they release it, copy the listener list, release that lock too, and only then call `on_change`. A listener can call `snapshot()` or a mutating method without deadlocking; the cost is that a listener may observe a state newer than the change that woke it. Pinned by a re-entrant listener test.

### UniFFI licence
UniFFI is MPL-2.0: file-level copyleft that applies to changes to UniFFI's own files. Using it unmodified as a dependency is compatible with this Apache-2.0 project. The generated bindings are our output, not UniFFI source.

### Apple: static XCFramework, MainActor stores, Core Motion sources
**Packaging:** `scripts/build-xcframework.sh` builds `kinetic-ffi` for five Apple targets, merges the simulator and macOS slices with `lipo`, and wraps the three static libraries in `KineticFFI.xcframework` (a plain module map, not a `framework module`). The generated `kinetic.swift` and the token file are committed so the package reads without a build; the XCFramework is git-ignored. *Rejected: cargo-swift* (one more tool to install and pin for about 30 lines of script) and *committing the binary* (large, unreviewable diffs).
**Stores:** `MotionStore` and `FormStore` are `@MainActor @Observable`. The engine's listener fires on whatever thread pushed a sample, so it hops to the main actor to refresh the published snapshot; the store's own calls refresh synchronously. Sources are `Sendable` classes that emit from private queues; a generation counter drops samples and `start()` results from superseded starts. The generated module stays in Swift 5 mode, everything we wrote is Swift 6.
**Activity mapping:** `CMMotionActivity` has independent Bools, so the source picks one class by priority (automotive > cycling > running > walking > stationary > unknown) and maps confidence low/medium/high to 0.33/0.67/1.0, matching the TypeScript doc comment; with the default threshold of 0.5 a `low` reading never counts as walking. The mapping is a pure function so it is tested without a device. `CMPedometer` cadence would be a possible future source (steps per second, no classifier) but the engine already derives cadence from acceleration, so it is not used.
**Accelerometer source kept:** it runs the same heuristic as the web demo (parity, comparable debug numbers) and is the fallback where activity data is unavailable or denied. `ActivitySource` is the default on a real iPhone: the motion coprocessor classifies walking at much lower power than 50 Hz sampling.
**Demo project:** XcodeGen (`project.yml`) generates the Xcode project. *Rejected: a committed hand-written `.xcodeproj`* (unreviewable diffs, merge conflicts).
**Verification:** on Linux (Swift 6.4.1 via swiftly, the Rust library linked through a throwaway system-library target) the bindings, all platform-neutral `KineticUI` code and its Swift Testing suite compile and pass. Not verifiable without a Mac: the XCFramework script, the Core Motion sources, the SwiftUI environment code and the whole demo app.

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
- The `--k-*` variables (target size, gaps, question type size, thumb-zone padding, slider track and thumb) are generated from `packages/spec/tokens/kinetic.tokens.json` into `generated/tokens.css` and swapped under `[data-motion='moving']`; `apps/demo/src/tokens.css` only uses them. Targets are at least 56 px in moving mode (measured: Back/Next 56 px).
- Radix levers are mapped in one place (`ui/useUiSize.ts`): Theme `scaling` 100% → 110% and component `size` 2 → 3.
- No per-component overrides scattered across files.

### Radix overrides (deliberate, documented)
1. **Slider thumb size.** Radix's largest Slider thumb is about 14 px (`--slider-thumb-size: calc(var(--slider-track-size) + var(--space-1))`). Too small to hit while walking. Override, scoped to moving mode: `[data-motion='moving'] .rt-SliderRoot { --slider-track-size: var(--k-slider-track); --slider-thumb-size: var(--k-slider-thumb); }` (12 px and 32 px, from the tokens). The thumb's `::before` hit area is 3× the thumb, so 96 px. Uses Radix's own variables, so it survives minor upgrades, but relies on the internal class name `.rt-SliderRoot`.
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
Cloudflare Workers with static assets, at `kineticui.kauper.co`, deployed by Cloudflare's Git integration (Workers Builds): every push to `main` deploys, other branches get preview URLs. Why: a custom subdomain on the owner's own domain, whose DNS zone is already on Cloudflare (so the domain and certificate are one step), a free tier that covers static assets, and Git-connected deploys with preview URLs per branch. Cloudflare's docs say to start new projects on Workers, so Pages was not used. Vite `base` is `/` because the site sits at the subdomain root. GitHub Actions (`ci.yml`) still runs tests, typecheck and build on every push and PR. Rejected: GitHub Pages (the first setup): it works, but a custom domain needs a separate DNS record outside the zone's provider, there are no branch previews, and the project path would need the `/kinetic-ui/` base.

## Known limits
- The step detector is demo-grade. It will misread a phone in a swinging bag, running (over the band), stairs, vehicles (bumpy roads can land in the band), and slow walkers below 1.5 steps/s. The asymmetric hysteresis and the Show-full escape hatch exist because of this.
- Background tabs: browsers stop `devicemotion` when the page is hidden; the UI decays to still after the exit time.
- Only the first moving episode after a Show-full tap is suppressed until the user stops; a user who never stops walking stays in the full form, which is the safe direction.
- "Session" for Show-full suppression is the page lifetime, not `sessionStorage`. A reload re-enables moving mode.
- No real backend or auth; "Create account" only validates.
- Not a full accessibility audit; tested with keyboard and Playwright's accessibility snapshot, not with VoiceOver/TalkBack on devices.
- Conformance fixtures (`packages/spec`) and unit tests cover the motion state machine, cadence estimator, motion store, Show-full policy, form model and email helpers. UI behaviour was verified with scripted Playwright runs, which are not committed as a test suite.
- npm: the unscoped name `kinetic-ui` belongs to an unrelated, abandoned 2021 package; the `@kinetic-ui` scope is unclaimed. The packages here are private workspace packages and are not published.
