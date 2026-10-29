<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="packages/spec/brand/logo-on-dark.svg">
  <img src="packages/spec/brand/logo-on-light.svg" alt="Kinetic UI logo" width="96">
</picture>

# Kinetic UI

A headless model that simplifies your UI when the user is moving.

[![CI](https://github.com/kkauper/kinetic-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/kkauper/kinetic-ui/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/kkauper/kinetic-ui?style=flat)](https://github.com/kkauper/kinetic-ui/releases)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-0090ff?style=flat)](LICENSE)
[![TypeScript 7.0](https://img.shields.io/badge/TypeScript-7.0-0090ff?style=flat&logo=typescript&logoColor=white)](packages/core)
[![Rust 1.99](https://img.shields.io/badge/Rust-1.99-0090ff?style=flat&logo=rust&logoColor=white)](crates/kinetic-core)
[![Swift 6](https://img.shields.io/badge/Swift-6-0090ff?style=flat&logo=swift&logoColor=white)](native/apple/README.md)
[![Kotlin 2.4](https://img.shields.io/badge/Kotlin-2.4-0090ff?style=flat&logo=kotlin&logoColor=white)](native/android/README.md)
[![Platforms: Web, iOS 17+, Android 8+](https://img.shields.io/badge/platforms-Web%20%C2%B7%20iOS%2017%2B%20%C2%B7%20Android%208%2B-0090ff?style=flat)](#native-ios-and-android)
[![Accessibility: WCAG 2.2 AA targeted](https://img.shields.io/badge/a11y-WCAG%202.2%20AA%20targeted-0090ff?style=flat)](#accessibility)
[![Live demo: kineticui.kauper.co](https://img.shields.io/badge/demo-kineticui.kauper.co-0090ff?style=flat)](https://kineticui.kauper.co)

</div>

Kinetic UI runs on the web (TypeScript), iOS (Swift) and Android (Kotlin). On the web it detects walking from the phone's accelerometer: a step cadence inside a min/max band counts as walking. On iOS and Android it can use the OS activity classifier instead (Core Motion, Activity Recognition). All platforms use the same hysteresis and the same "Show full form" escape hatch. When the user starts walking, a signup form switches from a full form to a one-question-at-a-time stepper with larger targets. When they stop, the full form returns. Answers survive every switch. This is a prototype; the design choices, rejected options and known limits are written down in [DECISIONS.md](DECISIONS.md).

Live demo: https://kineticui.kauper.co (works on a phone over HTTPS).

## How it works

```
 packages/spec   form schema + JSON conformance fixtures + design tokens
        |
        +--> TypeScript core (packages/core) --> React hooks, data-motion attribute
        |      web: plain TS, no WebAssembly
        |
        '--> Rust core (crates/kinetic-core) --> kinetic-ffi (UniFFI)
               |                                   |
               |                  generated Swift  |  generated Kotlin
               |                  thin stores      |  thin stores
               '--> SwiftUI environment            '--> Compose CompositionLocals

 inside each core:
 sources                    motion store                         consumers
 -------                    ------------                         ---------
 manual toggle   --.        cadence estimate or activity     .-> UI bindings (hooks, environment, locals)
 simulator       ---+--->   + hysteresis  -> still | moving  +-> data-motion attribute on <html> (web)
 accelerometer   --'        + force override                 '-> any framework (getState/subscribe)
 OS activity     --'

 form model: one JSON schema -> answers, current step, deferred, errors
                             -> full form  |  stepper
```

One behaviour spec, two implementations. The web keeps its TypeScript core because it is plain TS with no WebAssembly download, and it stays easy to read and debug. Native uses the Rust core through UniFFI-generated Swift and Kotlin bindings. Parity is not promised, it is tested: both cores run the same JSON fixtures in CI.

- Components never touch sensors. They read the motion store; only the demo controls pick a source.
- Moving mode is a CSS token set on `[data-motion='moving']`: bigger targets, fewer elements, same layout positions.
- Walking means a cadence inside the band (1.5 to 2.5 steps/s by default). Below the minimum or above the maximum is not walking, so the full form shows.
- The detector enters moving after about 3 s of walking and leaves it after about 10 s of not walking. Progress is leaky: a brief interruption (a dropped-sample gap, one irregular window) takes back twice its length instead of restarting the countdown, while a real stop still cancels it.
- "Show full form" is always available while moving. It is the escape hatch for false positives.
- Questions marked `deferrable` can be postponed with "Later" and are collected for the end.
- Every answer is saved to the form model and to `localStorage` as soon as it changes.

## Packages

| Package | What it is |
| --- | --- |
| `@kinetic-ui/core` | Headless TypeScript. Motion (sources, cadence, hysteresis, Show-full policy) and form (schema, model, persistence). No framework or DOM types. |
| `@kinetic-ui/react` | Hooks over `useSyncExternalStore`: `useStore`, `useMotion`, `useFormModel`, `useShowFull`, `useMotionAttribute`. |
| `@kinetic-ui/spec` | Language-neutral data: the form schema, JSON conformance fixtures every implementation runs, and design tokens generated into CSS, Swift and Kotlin. |
| `crates/kinetic-core` | The Rust core: motion engine (cadence, activity classification, hysteresis), form model, Show-full policy. Deterministic, no clock or threads of its own. |
| `crates/kinetic-ffi` | UniFFI wrapper over the Rust core. Generates the Swift and Kotlin bindings. |
| `native/apple` | Swift package `KineticUI` (sources, `MotionStore`, `FormStore`, SwiftUI environment) and a SwiftUI demo app. |
| `native/android` | Kotlin library (sources, stores, Compose bindings) and a Jetpack Compose demo app. |
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

## Native (iOS and Android)

SwiftUI:

```swift
import KineticUI

let motion = MotionStore(source: ActivitySource())
let form = FormStore() // sign-up schema, answers persist in UserDefaults

ContentView()
    .kineticMotion(motion)

struct ContentView: View {
    @Environment(\.motionState) private var motionState // .still or .moving
    var body: some View { /* stepper when .moving, full form when .still */ }
}
```

Compose:

```kotlin
val store = MotionStore(source = ActivityTransitionSource(context))
val form = FormStore(storage = SharedPreferencesFormStorage(context))

KineticMotionProvider(store) {
    val state = LocalMotionState.current // MotionState.STILL or MOVING
    // stepper when MOVING, full form when STILL
}
```

The demos show the full wiring, including switching sources.

How motion maps:

- iOS: `CMMotionActivity` becomes an activity sample. Confidence low, medium and high becomes 0.33, 0.67 and 1.
- Android: Activity Recognition transitions become activity samples with confidence 1.0.
- Walking counts. Running, cycling and vehicle do not. Change this with `movingActivities`.

Permissions: iOS needs `NSMotionUsageDescription` and the user's Motion & Fitness permission. Android needs the runtime permission `ACTIVITY_RECOGNITION`.

### Build and run

Full steps are in [native/apple/README.md](native/apple/README.md) and [native/android/README.md](native/android/README.md).

```sh
# iOS (macOS, Xcode 16+)
scripts/build-xcframework.sh
cd native/apple && swift test
cd Demo && xcodegen && open KineticDemo.xcodeproj

# Android (NDK and cargo-ndk installed)
scripts/build-android.sh
cd native/android && ./gradlew :demo:installDebug
```

Activity recognition needs a real device. In the iOS Simulator and the Android emulator, use the manual switch or the simulated step source.

## Run locally

Requires Node `^20.19.0 || >=22.12.0` (Vite 8).

```sh
npm install
npm run dev        # Vite with --host, so a phone on the same Wi-Fi can reach it
npm test           # vitest
npm run typecheck
npm run build
```

Rust and native tests (the Rust version is pinned by `rust-toolchain.toml`):

```sh
cargo test --workspace
cargo build -p kinetic-ffi --release
cd native/android && ./gradlew :bindings-test:test
```

Motion sensors need HTTPS, so use the live demo to try walking detection on a phone. Locally, the "Simulate walking" tag and the simulated step source in the debug sheet work without sensors.

## Try it on a phone

1. Open https://kineticui.kauper.co on your phone. Motion sensors only work over HTTPS, and iOS asks for permission on a tap.
2. iPhone (Safari): tap "Walking mode", allow "Motion & Orientation Access", then walk at a normal pace for 5 to 8 s. The stepper appears. Stop for about 10 s and the full form returns.
   If you tapped "Don't allow", iOS usually remembers it for the site. Close the tab and reopen it, or clear the site's data (usually Settings, Apps, Safari, Advanced, Website Data). Menus move between iOS versions.
3. Android (Chrome): tap "Walking mode" (a permission prompt may or may not appear, depending on the Chrome version), then walk.
4. Without a phone: on a computer the "Simulate walking" tag flips the mode by hand (a phone shows "Walking mode" instead; the Debug sheet's Input section has both on any device), and the debug sheet includes a simulated step source with a cadence slider.

### Tuning

Tap the "Debug" tag in the demo controls to open the debug sheet (or add `?debug` to the URL to show the status pill on load). The sheet shows the state, whether it is detected or forced, the source, the cadence against the walking band, time in state and any pending transition, followed by the tools. The walking band (min and max cadence) can be changed live: anything below the minimum or above the maximum counts as not walking and shows the full form. "Keep readout on screen" leaves a one-line status pill on the page after the sheet is closed; tap it to reopen the sheet.

The defaults live in `packages/core/src/motion/config.ts`:

| Constant | Default | Adjust when |
| --- | --- | --- |
| `minCadence` / `maxCadence` | 1.5 / 2.5 steps/s | Your walking pace sits outside the band shown in the overlay. |
| `stepThreshold` | 0.3 m/s² | The floor of the adaptive step threshold (the threshold itself follows how hard the phone moves, see below). Cadence stays 0 while walking: lower it. Phantom steps while holding still: raise it. |
| `enterMovingAfterMs` | 3000 | The UI simplifies too eagerly: raise it. Takes a while to react: lower it. Also adjustable in the debug sheet (Enter after / Leave after). |
| `exitMovingAfterMs` | 10000 | The full form returns too slowly or too quickly at stops. |
| `cadenceWindowMs` / `minStepsForCadence` | 4000 / 4 | Cadence reacts too slowly or is too jumpy. |
| `minStepIntervalMs` | 200 | Double-counted steps. It also caps detection at 5 steps/s. |

Native platforms use the same constants: `MotionConfig` in Rust has the same defaults. `movingActivities` and `minActivityConfidence` apply to activity samples (OS classifiers), not to cadence.

The step threshold adapts: it is the larger of `stepThreshold` and 0.8 times the recent mean of the step signal, so a phone held in the hand (vertical bounce of only 0.3 to 1 m/s²) is measured as well as one in a pocket. Cadence is only reported while the step intervals are regular (coefficient of variation up to 0.25, after counting an interval of about 2 or 3 times the usual one as 2 or 3 missed steps); irregular jitter shows 0. The 0.8 ratio, the 2 s envelope, the 0.25 limit and the 25 % folding tolerance are constants in `cadence.ts` and `cadence.rs` for now and become config fields with the next FFI change.

#### Recording a trace from a phone

If cadence is wrong on your phone, send us the raw data: open the debug sheet, start walking mode (or the accelerometer), and look at the Sensor section (sample rate, signal, envelope, threshold, steps in window, interval regularity). Walk normally holding the phone as you would to read the form, tap "Record 20 s" and keep walking until it finishes. Then tap "Copy trace" (or "Download trace", which saves `kinetic-trace-<timestamp>.json`) and send us the JSON. The recording also contains `events`, the app's own decisions at 10 Hz as `[t, cadence, walking 0/1, state s/m, progress ms]`, so we can see why a switch was slow. The Sensor section also shows a switch timeline (first step, first walking, countdown restarts, switch to moving, all in seconds since the source started). You can put a note such as "walking, phone in right hand, reading" into the `note` field first. The trace holds only acceleration samples `[t_ms, x, y, z]`, the user agent and the sample rate. Recorded traces become fixtures: `node packages/spec/scripts/add-recorded-trace.ts <trace.json> "<generic name>" <known cadence> <tolerance>` adds one to `packages/spec/fixtures/cadence-recorded.json`, which both the TypeScript and Rust conformance suites run.

If the stepper never appears, check the cadence in the overlay first. If it is inside the band, wait out `enterMovingAfterMs`.

## Accessibility

Covered:

- Real labels, or `aria-labelledby` for groups. Errors are linked with `aria-describedby` and `aria-invalid`.
- On a step change in the stepper, focus moves to the step's control (the input, the first choice, the slider thumb). Text steps reuse one input element, so the phone keyboard stays open from question to question; the control's label is the question. Back, Later and Next do not take focus on tap.
- Progress ("Question 2 of 5") is announced through an `aria-live="polite"` region.
- Visible `:focus-visible` outlines.
- `prefers-reduced-motion` disables transitions.
- Touch targets are at least 56 px while moving.
- iOS: VoiceOver focus moves to the question heading on each step (`AccessibilityFocusState`). Dynamic Type is respected, and animations stop with Reduce Motion.
- Android: TalkBack focus moves to the question heading through a focus requester, and progress is announced in a polite live region. Font scale and display size are respected.

Not covered: this is not a full audit. It was checked with keyboard and Playwright's accessibility snapshot, not with VoiceOver or TalkBack on the web, and the native screen readers have not been tested on devices yet. See [DECISIONS.md](DECISIONS.md).

## Releases

Release builds are on the [GitHub Releases page](https://github.com/kkauper/kinetic-ui/releases). Each release has:

| Asset | What it is |
|---|---|
| `KineticFFI.xcframework.zip` | The Rust core as an XCFramework for iOS device, iOS Simulator and macOS. |
| `KineticFFI.xcframework.zip.checksum` | The SwiftPM checksum of that zip. |
| `kinetic-android-<version>.aar` | The Android library: generated Kotlin bindings, sources, stores, Compose bindings and the native library for arm64-v8a, armeabi-v7a and x86_64. |
| `kinetic-ui-demo-web.zip` | The built web demo (static files). |

**Swift.** Declare the XCFramework as a remote binary target in your package. The release notes list the exact URL and checksum:

```swift
.binaryTarget(
    name: "KineticFFI",
    url: "https://github.com/kkauper/kinetic-ui/releases/download/v0.1.0/KineticFFI.xcframework.zip",
    checksum: "<contents of KineticFFI.xcframework.zip.checksum>"
)
```

The Swift sources (`KineticBindings`, `KineticUI`) are in [native/apple/Sources](native/apple/Sources) and depend on a target named `KineticFFI`. In this repository the package points at a local XCFramework built by `scripts/build-xcframework.sh`.

**Android.** Download the AAR into your module (for example `app/libs/`) and add it as a file dependency:

```kotlin
dependencies {
    implementation(files("libs/kinetic-android-0.1.0.aar"))

    // A file dependency brings no transitive dependencies, so add what the library needs.
    // JNA must be the Android (@aar) artifact because it carries the native dispatcher.
    implementation("net.java.dev.jna:jna:5.19.1@aar")
    // Also required: kotlinx-coroutines-android, androidx.core:core-ktx, androidx.lifecycle:lifecycle-runtime-compose,
    // play-services-location (Activity Recognition), and Compose UI, foundation and Material 3.
    // Versions are in native/android/gradle/libs.versions.toml.
}
```

## Versioning

Kinetic UI follows [Semantic Versioning](https://semver.org/). While the version is 0.x, the API may change between minor releases. The version is set in one place per ecosystem (the `package.json` files, the Cargo workspace, the Android and iOS demos) and kept in sync; the release workflow refuses to publish a tag that does not match. Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## Project layout

```
packages/
  core/    headless TS: motion/ (sources, cadence, machine, store, config), form/ (schema, model, persistence)
  react/   hooks over the store contract
  spec/    schemas, conformance fixtures, DTCG tokens + generated CSS/Swift/Kotlin
apps/
  demo/    Vite + React + Radix Themes; stores.ts wires the singletons, demo-controls/ owns the sources
crates/
  kinetic-core/  Rust motion engine and form model
  kinetic-ffi/   UniFFI exports for Swift and Kotlin
native/
  apple/         Swift package KineticUI + SwiftUI demo
  android/       Kotlin library + Compose demo
  generated/     UniFFI-generated Swift and Kotlin (do not edit)
scripts/                       build the XCFramework and Android libraries, regenerate bindings
rust-toolchain.toml            pinned Rust version
.github/workflows/ci.yml       tests, typecheck and build on push and PR (web, Rust, Kotlin bindings, Apple)
.github/workflows/release.yml  builds the release assets and publishes a GitHub release for a version tag
DECISIONS.md                   design record
```

## Limits

- The step detector is demo-grade. It can misread a phone in a swinging bag, running, stairs, vehicles and slow walking below 1.5 steps/s.
- Browsers stop motion events in background tabs, so the UI decays to the full form.
- The iOS and Android demos have not yet been tried on physical devices (Core Motion/Activity Recognition delivery, VoiceOver/TalkBack, real keyboards). Both demos are built in CI (iOS Simulator build; Android debug build, lint and a Robolectric UI test), but neither runs on a device or emulator there.
- No backend or auth; "Create account" only validates.

More in [DECISIONS.md](DECISIONS.md#known-limits).

## Privacy

The demo is a playground: it has no backend and collects nothing. The sign-up form sends nothing anywhere. Your answers and the debug preferences are saved only in your browser's localStorage on your own device (`kinetic-ui:signup`, `kinetic-ui:debug-readout`), and motion sensor data is processed in the browser and never sent. There are no cookies, no analytics, no tracking and no third-party requests (the font is self-hosted). The site is hosted on Cloudflare, which processes technical connection data (such as the IP address) to deliver pages. Details: https://kineticui.kauper.co/privacy. Contact: [privacy@kauper.co](mailto:privacy@kauper.co).

## License

Copyright 2026 Kai Kauper. Licensed under the [Apache License, Version 2.0](LICENSE). See [NOTICE](NOTICE).
