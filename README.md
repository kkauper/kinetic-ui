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
| `apps/demo` | The demo: Vite, React and Radix Themes. |

These are private workspace packages. They are not published to npm.

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

## Deploy

The demo is a static site served by Cloudflare Workers (static assets) at https://kineticui.kauper.co. Cloudflare builds it from the GitHub repo. Every push to `main` deploys. Other branches get their own preview URL (shown under the Worker's Previews in the dashboard). GitHub Actions (`.github/workflows/ci.yml`) runs tests, typecheck and build on every push to `main` and on pull requests; it does not deploy.

One-time setup:

1. In the Cloudflare dashboard, go to Workers & Pages, Create application, and pick the GitHub repo. Name the Worker `kinetic-ui` (it must match `name` in `wrangler.jsonc`).
2. Set the build command to `npm run build` and the deploy command to `npx wrangler deploy`. Leave the root directory at `/` (the repo root).
3. Save and deploy. The Node version defaults to a current one; to pin it, set `NODE_VERSION` under Settings, Build, or add a `.node-version` file.
4. Attach the domain: Worker, Settings, Domains & Routes, Add, Custom Domain, `kineticui.kauper.co`. The `kauper.co` zone must be on Cloudflare; Cloudflare then creates the DNS record and certificate.

Manual deploy from a machine logged in with `npx wrangler login`: `npm run deploy`.

## Test on a real phone

1. Motion sensors only work over HTTPS, and iOS asks for permission on a tap. The easiest path is the deployed demo at https://kineticui.kauper.co. To host your own copy, see [Deploy](#deploy).
2. iPhone (Safari): open the URL, tap "Walking mode", allow "Motion & Orientation Access", then walk at a normal pace for 5 to 8 s. The stepper appears. Stop for about 10 s and the full form returns.
   If you tapped "Don't allow", iOS usually remembers it for the site. Close the tab and reopen it, or clear the site's data (usually Settings, Apps, Safari, Advanced, Website Data). Menus move between iOS versions.
3. Android (Chrome): open the URL, tap "Walking mode" (a permission prompt may or may not appear, depending on the Chrome version), then walk.
4. Local changes on a phone: HTTPS is required for sensors, so either deploy or use a tunnel. Cloudflare quick tunnels need no account:
   ```sh
   npm run dev
   npx cloudflared tunnel --url http://localhost:5173
   ```
   Open the printed `https://<random>.trycloudflare.com` URL. Vite blocks unknown Host headers by default, so `apps/demo/vite.config.ts` sets `server.allowedHosts: ['.trycloudflare.com']`. The manual "Simulate walking" switch needs no sensor and works over plain HTTP on the LAN.
5. Tuning: open the debug overlay with the "Debug" toggle in the demo controls, or add `?debug` to the URL. It shows state, detected or forced, source, cadence against the walking band, time in state and any pending transition. The constants are in `packages/core/src/motion/config.ts`:

   | Constant | Default | Adjust when |
   | --- | --- | --- |
   | `minCadence` / `maxCadence` | 1.5 / 2.5 steps/s | Your walking pace sits outside the band shown in the overlay. |
   | `stepThreshold` | 1.2 m/s^2 | Stepper never appears and cadence stays 0: lower it. Phantom steps while holding still: raise it. |
   | `enterMovingAfterMs` | 5000 | UI flips too eagerly: raise it. |
   | `exitMovingAfterMs` | 10000 | Full form returns too slowly or too quickly at stops. |
   | `cadenceWindowMs` / `minStepsForCadence` | 4000 / 4 | Cadence reacts too slowly or is too jumpy. |
   | `minStepIntervalMs` | 250 | Double-counted steps. |

   If the stepper never appears, check the cadence in the overlay first. If it is inside the band but nothing happens, wait out `enterMovingAfterMs`.
6. Desktop: the debug tools include a simulated step source with a cadence slider, so switching can be tried without a phone.

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
apps/
  demo/    Vite + React + Radix Themes; stores.ts wires the singletons, demo-controls/ owns the sources
.github/workflows/ci.yml       tests, typecheck and build on push and PR
wrangler.jsonc                 Cloudflare Workers static assets config
DECISIONS.md                   design record
```

## Limits

- The step detector is demo-grade. It can misread a phone in a swinging bag, running, stairs, vehicles and slow walking below 1.5 steps/s.
- Browsers stop motion events in background tabs, so the UI decays to the full form.
- No backend or auth; "Create account" only validates.

More in [DECISIONS.md](DECISIONS.md#known-limits).

## License

Copyright 2026 Kai Kauper. Licensed under the [Apache License, Version 2.0](LICENSE). See [NOTICE](NOTICE).
