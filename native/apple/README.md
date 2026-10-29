# Kinetic UI for Apple platforms

A Swift package (`KineticUI`) that wraps the Rust core, feeds it from Core Motion, and exposes it to SwiftUI, plus a demo app (`Demo/`) with the same behaviour as the web demo: a full form while you stand still, one thumb-sized question at a time while you walk.

```
Rust core (kinetic-core)          the models: hysteresis, cadence, form rules
  -> kinetic-ffi (UniFFI)         static library, KineticFFI.xcframework
    -> KineticBindings            generated Swift: MotionEngine, FormModel, Sample, ...
      -> KineticUI                MotionSource implementations, MotionStore, FormStore, tokens
        -> SwiftUI environment    \.motionState, \.kineticMetrics   (what views read)
```

Views never see a motion source. They read `motionState` and `kineticMetrics` from the environment, exactly like web components read `data-motion`. Only the app shell (in the demo: `DemoControlsView`) chooses a source.

## Requirements

- macOS with **Xcode 16 or later** (Swift 6 language mode, `@Entry`, `@Observable`). Deployment targets: iOS 17, macOS 14.
- Rust via rustup. The build script adds the targets itself, or by hand:
  `rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios aarch64-apple-darwin x86_64-apple-darwin`
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) for the demo project: `brew install xcodegen`.
- A **real iPhone** for activity recognition. The Simulator has no motion coprocessor; use the manual switch or "Simulated steps" there.

## Build and run

```sh
scripts/build-xcframework.sh          # 3-6 minutes cold: five Rust builds, lipo, xcodebuild -create-xcframework
cd native/apple
swift test                            # runs the Swift Testing suite on macOS
cd Demo
xcodegen                              # generates KineticDemo.xcodeproj (git-ignored)
open KineticDemo.xcodeproj
```

In Xcode select the `KineticDemo` scheme, set your team under Signing & Capabilities (or `DEVELOPMENT_TEAM` in `Demo/project.yml`), and run on a device. Rerun `scripts/build-xcframework.sh` whenever `crates/` changes; it also refreshes the committed `Sources/KineticBindings/kinetic.swift` and `Sources/KineticUI/KineticTokens.swift`.

## Sources and the engine

The engine takes three kinds of `Sample`, all stamped with milliseconds on one clock (`MotionStore.now`, default `systemNow`):

| Source | Samples | Notes |
|---|---|---|
| `ManualSource` | `.state` | A switch. Bypasses hysteresis. No permission. |
| `ActivitySource` | `.activity` | `CMMotionActivityManager`. See the mapping below. Real device only. |
| `AccelerometerSource` | `.acceleration` (50 Hz) | `CMMotionManager` device motion, `(userAcceleration + gravity) * 9.80665` per axis. Same heuristic as the web demo; the fallback when activity data is unavailable. |
| `SimulatedWalkSource` | `.acceleration` (50 Hz) | Sine on z plus gravity at a chosen cadence. For the Simulator and previews. |

**Activity mapping.** `CMMotionActivity` reports several Bools at once, so the source picks one class by priority: automotive > cycling > running > walking > stationary > unknown (a walking passenger on a train is not "walking"). Confidence low / medium / high becomes 0.33 / 0.67 / 1.0. The engine counts an activity as walking from confidence 0.5, so a `low` classification is ignored. The mapping is a pure function (`ActivityMapping`) with tests; the Core Motion wrapper around it is thin.

**`MotionStore`** (`@MainActor @Observable`) owns the engine, one source and the tick loop (`Task.sleep` every `config.tickIntervalMs`). It subscribes to the engine with a `ChangeListener` that hops to the main actor to refresh `snapshot` and `showFullState`. Starts are guarded by a generation counter, so a slow `start()` that was overtaken by `stop()` or `setSource` is dropped. Failures never throw: they set `errorMessage`.

**`FormStore`** wraps `FormModel` and stores answers in `UserDefaults` under `kinetic-ui:signup`, the same JSON as the web's localStorage.

## Permissions

Motion data needs `NSMotionUsageDescription` in Info.plist (the demo's `project.yml` sets it). The prompt appears the first time `ActivitySource` starts; the source waits for the answer, so a refusal becomes an error message instead of silence. Denied or restricted access (Settings > Privacy & Security > Motion & Fitness, Screen Time) is reported with a user-facing message and the demo offers "Use accelerometer". `CMMotionManager` (accelerometer source) needs no permission.

## Demo notes

- Sizes come from `KineticMetrics` (generated tokens). The question font uses the token as a floor and scales with Dynamic Type (`@ScaledMetric`). Animations are off when Reduce Motion is on.
- The stepper moves VoiceOver focus to the question heading on every step; the heading's label starts with "Question n of N". Validation errors take accessibility focus on submit / Next.
- Known limit: the native `Slider` thumb size is not adjustable, so the moving state enlarges the hit area (`minHeight`) rather than the thumb.
- The generated `Info.plist` under `Demo/KineticDemo/` is written by XcodeGen.
