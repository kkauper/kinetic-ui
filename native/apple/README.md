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
- A **real iPhone** for activity recognition. The Simulator has no motion coprocessor; use "Simulate walking" or the debug sheet's "Use simulator" there.

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

## Privacy

The demo app processes motion and activity data on the device only, stores answers in `UserDefaults` on the device, sends nothing and has no analytics. See https://kineticui.kauper.co/privacy.

## Permissions

Motion data needs `NSMotionUsageDescription` in Info.plist (the demo's `project.yml` sets it). The prompt appears the first time `ActivitySource` starts; the source waits for the answer, so a refusal becomes an error message instead of silence. Denied or restricted access (Settings > Privacy & Security > Motion & Fitness, Screen Time) is shown as a notification card (same wording as the web demo) that offers "Use Simulate walking instead"; the debug sheet still has "Use accelerometer". `CMMotionManager` (accelerometer source) needs no permission.

## Demo notes

Behaviour matches the web demo (see `DECISIONS.md`, UI and accessibility sections):

- **Summary, not "Review full form".** After the last question the stepper shows "Review your answers" (`SummaryView`): "Questions for later" with "Answer now", then every question with its formatted answer ("Not answered" muted) and a "Change" pill (accessibility label "Change: <question>") that opens that one question; Next returns to the summary. A full-width large "Create account" pill sits in the bottom bar with a small "Back" pill above it. Create account normalizes the email and validates everything; the first invalid question opens with its field focused. VoiceOver hears "Review: n of N answered". The still-mode full form keeps editable fields and the same large pill.
- **Focus and keyboard.** Every text-like question goes through one `TextField` with a stable identity (the stepper never keys it by field id); its prompt, keyboard type, content type and capitalization change in place. It owns a `@FocusState` that is set when it appears and on each step change, and buttons do not take focus in SwiftUI, so Back/Next/Later leave the keyboard open from the email step to the name step. Return is Next (`.submitLabel(.next)` + `.onSubmit`). Choice, Yes/No and slider steps move VoiceOver focus to the control (`@AccessibilityFocusState`), the summary to its heading. This can only be fully verified on a device.
- **One thumb.** The stepper content is bottom-anchored (a `GeometryReader` + `ScrollView` whose content is at least as tall as the screen and aligned to the bottom, so short content sits low and the summary scrolls). Progress, the "n for later" chip and the debug status pill form one row above the question; Back / Later / Next are a bottom `safeAreaInset`, which SwiftUI keeps above the keyboard. The full form flows top to bottom.
- **Look.** Dark only (`preferredColorScheme(.dark)`), Radix slate/blue values in `Theme.swift`: background #111113, surface #212225, text #edeef0 / #b0b4ba, accent #0090ff with dark text #111113 on accent buttons (5.78:1; white would be 3.26:1) and #696e77 boundaries (3.68:1) on text fields, unselected cards, the switch (off), the slider track and soft/outline buttons. All buttons are capsules (`PillButtonStyle`: small / regular / large, prominent / soft / outline / caution); inputs and cards use an 8 pt radius. A selected card has an accent border and a check mark. The switch and slider are drawn by hand to show their boundary; the slider is announced as the system slider (`accessibilityRepresentation`).
- **Demo controls** are pill tags (Simulate walking, Walking mode, Debug). Debug opens a bottom sheet (medium and large detents) with the live readout, "Keep readout on screen", simulated steps, the walking band and the resets; the pinned readout is one opaque status pill in the layout that opens the same sheet. Source errors are notification cards.
- **Font.** Hanken Grotesk (SIL OFL 1.1, variable `HankenGrotesk[wght].ttf` from https://github.com/google/fonts/tree/main/ofl/hankengrotesk, shared source in `packages/spec/brand/fonts/`) is copied to `Demo/KineticDemo/Fonts/` and registered through `UIAppFonts`; nothing is downloaded at runtime. `KineticFont` uses `Font.custom(_, size:, relativeTo:)` plus `.weight`, so Dynamic Type still scales it. Monospace stays the system face. Licence text: `Demo/KineticDemo/Fonts/OFL.txt`.
- Sizes come from `KineticMetrics` (generated tokens). The question font uses the token as a floor and scales with Dynamic Type (`@ScaledMetric`). Animations are off when Reduce Motion is on.
- Validation errors take accessibility focus on submit / Next. The step announces "Question n of N".
- No `Binding(get:set:)` anywhere in the demo: Xcode 26.6 / Swift 6.3 crashes in IRGen on it for the x86_64 simulator slice. Controls use `@State` mirrors with `onChange` in both directions.
- The generated `Info.plist` under `Demo/KineticDemo/` is written by XcodeGen.
