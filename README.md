# Kinetic UI

A headless model that simplifies your UI when the user is moving.

Kinetic UI detects walking from the phone's accelerometer. When the user starts walking, a signup form switches from a full form to a one-question-at-a-time stepper with larger targets. When they stop, the full form returns. Answers survive every switch. This is a prototype; the design choices, rejected options and known limits are written down in [DECISIONS.md](DECISIONS.md).

Live demo: https://kineticui.kauper.co (works on a phone over HTTPS).

## How it works

```
 sources                    motion store                         consumers
 -------                    ------------                         ---------
 manual toggle   --.        cadence estimate                 .-> React hook (useMotion)
 simulator       ---+--->   + hysteresis  -> still | moving  +-> data-motion attribute on <html>
 accelerometer   --'        + force override                 '-> any framework (getState/subscribe)

 form model: one JSON schema -> answers, current step, deferred, errors
                             -> full form  |  stepper
```

- Components never touch sensors. They read the motion store; only the demo controls pick a source.
- Moving mode is a CSS token set on `[data-motion='moving']`: bigger targets, fewer elements, same layout positions.
- The detector enters moving after about 5 s of walking and leaves it after about 10 s of not walking.
- "Show full form" is always available while moving. It is the escape hatch for false positives.
- Questions marked `deferrable` can be postponed with "Later" and are collected for the end.
- Every answer is saved to the form model and to `localStorage` as soon as it changes.

## Packages

| Package | What it is |
| --- | --- |
| `@kinetic-ui/core` | Headless TypeScript. Motion (sources, cadence, hysteresis, Show-full policy) and form (schema, model, persistence). No framework or DOM types. |
| `@kinetic-ui/react` | Hooks over `useSyncExternalStore`: `useStore`, `useMotion`, `useFormModel`, `useShowFull`, `useMotionAttribute`. |
| `@kinetic-ui/spec` | Language-neutral data: the form schema, JSON conformance fixtures every implementation runs, and design tokens generated into CSS, Swift and Kotlin. |
| `apps/demo` | The demo: Vite, React and Radix Themes. |

The packages live in this repository and are not published to npm.

## The store contract

Everything observable in core implements one interface:

```ts
interface ReadableStore<T> {
  getState(): T;
  subscribe(listener: () => void): () => void; // returns unsubscribe
}
```

Snapshots are immutable and keep the same reference when nothing changed. The motion store adds:

```ts
interface MotionStore extends ReadableStore<MotionSnapshot> {
  start(): Promise<void>;                        // rejects and sets snapshot.error if the source cannot start
  stop(): void;
  force(state: 'still' | 'moving' | null): void; // override detection; null removes it
  setSource(source: MotionSource | null): Promise<void>;
}
```

`MotionSnapshot.state` is the effective state (`forced ?? detected`). Plain TypeScript:

```ts
import {
  bindMotionAttribute,
  createAccelerometerSource,
  createMotionStore,
} from '@kinetic-ui/core';

const motion = createMotionStore({ source: createAccelerometerSource() });

motion.subscribe(() => console.log(motion.getState().state)); // 'still' | 'moving'
bindMotionAttribute(motion, document.documentElement);       // sets <html data-motion>

// On iOS this must run inside a tap handler (permission prompt).
button.addEventListener('click', () => motion.start().catch(() => {}));
```

React:

```tsx
import { createFormModel, createMotionStore, signupSchema } from '@kinetic-ui/core';
import { useFormModel, useMotion } from '@kinetic-ui/react';

const motion = createMotionStore();
const form = createFormModel(signupSchema);

function Signup() {
  const { state } = useMotion(motion);
  const { answers, currentStep } = useFormModel(form);
  return state === 'moving' ? <Stepper step={currentStep} /> : <FullForm answers={answers} />;
}
```

`Stepper` and `FullForm` are your own components; the demo's are in `apps/demo/src`.

## Other frameworks

A binding is a few lines because the contract is only `getState` and `subscribe`. These are sketches, not part of the repo.

Vue 3 composable (`shallowRef` keeps the snapshot as-is, `onScopeDispose` unsubscribes):

```ts
import { shallowRef, onScopeDispose } from 'vue';
import type { ReadableStore } from '@kinetic-ui/core';

export function useStore<T>(store: ReadableStore<T>) {
  const state = shallowRef(store.getState());
  const unsubscribe = store.subscribe(() => {
    state.value = store.getState();
  });
  onScopeDispose(unsubscribe);
  return state;
}
```

Svelte (`svelte/store` is still available in Svelte 5; the start function's return value is the cleanup):

```ts
import { readable } from 'svelte/store';
import type { ReadableStore } from '@kinetic-ui/core';

export const toReadable = <T>(store: ReadableStore<T>) =>
  readable(store.getState(), (set) => store.subscribe(() => set(store.getState())));
// In a component: const motion = toReadable(motionStore);  ... {$motion.state}
```

## Run locally

Requires Node `^20.19.0 || >=22.12.0` (Vite 8).

```sh
npm install
npm run dev        # Vite with --host, so a phone on the same Wi-Fi can reach it
npm test           # vitest
npm run typecheck
npm run build
```

Motion sensors need HTTPS, so use the live demo to try walking detection on a phone. Locally, the "Simulate walking" switch and the simulated step source in the debug tools work without sensors.

## Try it on a phone

1. Open https://kineticui.kauper.co on your phone. Motion sensors only work over HTTPS, and iOS asks for permission on a tap.
2. iPhone (Safari): tap "Walking mode", allow "Motion & Orientation Access", then walk at a normal pace for 5 to 8 s. The stepper appears. Stop for about 10 s and the full form returns.
   If you tapped "Don't allow", iOS usually remembers it for the site. Close the tab and reopen it, or clear the site's data (usually Settings, Apps, Safari, Advanced, Website Data). Menus move between iOS versions.
3. Android (Chrome): tap "Walking mode" (a permission prompt may or may not appear, depending on the Chrome version), then walk.
4. Without a phone: the "Simulate walking" switch flips the mode by hand, and the debug tools include a simulated step source with a cadence slider.

### Tuning

Open the debug overlay with the "Debug" toggle in the demo controls, or add `?debug` to the URL. It shows the state, whether it is detected or forced, the source, the cadence against the walking band, time in state and any pending transition. The walking band (min and max cadence) can be changed live under "Debug tools": anything below the minimum or above the maximum counts as not walking and shows the full form.

The defaults live in `packages/core/src/motion/config.ts`:

| Constant | Default | Adjust when |
| --- | --- | --- |
| `minCadence` / `maxCadence` | 1.5 / 2.5 steps/s | Your walking pace sits outside the band shown in the overlay. |
| `stepThreshold` | 1.2 m/s² | Cadence stays 0 while walking: lower it. Phantom steps while holding still: raise it. |
| `enterMovingAfterMs` | 5000 | The UI simplifies too eagerly: raise it. |
| `exitMovingAfterMs` | 10000 | The full form returns too slowly or too quickly at stops. |
| `cadenceWindowMs` / `minStepsForCadence` | 4000 / 4 | Cadence reacts too slowly or is too jumpy. |
| `minStepIntervalMs` | 200 | Double-counted steps. It also caps detection at 5 steps/s. |

If the stepper never appears, check the cadence in the overlay first. If it is inside the band, wait out `enterMovingAfterMs`.

## Accessibility

Covered:

- Real labels, or `aria-labelledby` for groups. Errors are linked with `aria-describedby` and `aria-invalid`.
- On a step change, focus moves to the question heading, so the phone keyboard does not open unasked.
- Progress ("Question 2 of 5") is announced through an `aria-live="polite"` region.
- Visible `:focus-visible` outlines.
- `prefers-reduced-motion` disables transitions.
- Touch targets are at least 56 px while moving.

Not covered: this is not a full audit. It was checked with keyboard and Playwright's accessibility snapshot, not with VoiceOver or TalkBack. See [DECISIONS.md](DECISIONS.md).

## Project layout

```
packages/
  core/    headless TS: motion/ (sources, cadence, machine, store, config), form/ (schema, model, persistence)
  react/   hooks over the store contract
  spec/    schemas, conformance fixtures, DTCG tokens + generated CSS/Swift/Kotlin
apps/
  demo/    Vite + React + Radix Themes; stores.ts wires the singletons, demo-controls/ owns the sources
.github/workflows/ci.yml       tests, typecheck and build on push and PR
DECISIONS.md                   design record
```

## Limits

- The step detector is demo-grade. It can misread a phone in a swinging bag, running, stairs, vehicles and slow walking below 1.5 steps/s.
- Browsers stop motion events in background tabs, so the UI decays to the full form.
- No backend or auth; "Create account" only validates.

More in [DECISIONS.md](DECISIONS.md#known-limits).

## License

Copyright 2026 Kai Kauper. Licensed under the [Apache License, Version 2.0](LICENSE). See [NOTICE](NOTICE).
