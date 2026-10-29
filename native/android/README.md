# Kinetic UI for Android

A Kotlin library and a Jetpack Compose demo on top of the Rust core (`crates/kinetic-core`, exposed by `crates/kinetic-ffi` through UniFFI). The model that decides "the user is walking, simplify the UI" and the step-by-step form model are the same code that runs on iOS; this folder is the Android half: sensors, timers, storage and UI.

```
native/android
  kinetic/        Android library (co.kauper.kineticui): sources, stores, Compose bindings
  demo/           Compose app (co.kauper.kineticui.demo), same UX as the web demo
  bindings-test/  plain Kotlin/JVM tests of the generated bindings; needs no Android SDK
```

## Requirements

- JDK 17 or newer (Android Studio's bundled JDK works).
- Android Studio (current stable) or the Android SDK command-line tools, with platform 37 and build tools.
- Rust (`rustup`) for the native library.
- To run on a device or emulator: the Android NDK, `cargo install cargo-ndk`, and the Rust targets
  `rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android`.

## Build and run

```sh
# 1. Native library for the three ABIs, into kinetic/src/main/jniLibs (git-ignored).
#    Also regenerates the Kotlin bindings. Fails early with a clear message if a prerequisite is missing.
export ANDROID_NDK_HOME=/path/to/ndk
scripts/build-android.sh

# 2. The app
cd native/android
./gradlew :demo:installDebug      # or open native/android in Android Studio
```

`:kinetic` and `:demo` are part of the build only when an Android SDK is configured (`sdk.dir` in `local.properties`, or `ANDROID_HOME` / `ANDROID_SDK_ROOT`). Without one, only `:bindings-test` exists, so it builds anywhere.

Without `jniLibs` the APK still builds but crashes at startup (`UnsatisfiedLinkError: kinetic_ffi`).

## Tests

```sh
cargo build -p kinetic-ffi --release           # host library
cd native/android
./gradlew :bindings-test:test                  # generated Kotlin vs. the real Rust library, on the JVM
./gradlew :kinetic:testDebugUnitTest           # needs the Android SDK; the Activity Transition mapping
```

`:bindings-test` compiles the generated `uniffi.kinetic` sources plus the library's platform-neutral code (`MotionStore`, the manual and simulated sources) and runs them with JUnit 5 against `target/release/libkinetic_ffi.so` (`.dylib` on macOS), passed as `-Duniffi.component.kinetic.libraryOverride`. It covers the engine, the form model, foreign `ChangeListener` / `FormStorage` implementations, re-entrant listeners and the store's start/stop/generation logic. CI runs it as the `kotlin-bindings` job.

## Architecture

```
Rust: MotionEngine, FormModel          (deterministic, no clock, no threads)
  ^ push_sample / tick(now)            generated Kotlin (uniffi.kinetic), JNA
MotionSource  --Sample-->  MotionStore  --StateFlow-->  KineticMotionProvider  --CompositionLocal-->  your UI
FormModel     <------------ FormStore  --StateFlow-->  screens
```

- **Sources** (`MotionSource`): translate a platform signal into engine samples, stamped with a shared clock (`Now`).
- **`MotionStore`**: owns a `MotionEngine`, ticks it every `config.tickIntervalMs` while running, exposes `snapshot`, `showFullState`, `sourceId`, `running` and `error` as `StateFlow`s. `start()` and `setSource()` return `false` and set `error` instead of throwing when a source cannot start.
- **`FormStore`**: the Rust `FormModel` plus a `StateFlow<FormState>`; `SharedPreferencesFormStorage` keeps the answers under `kinetic-ui:signup`, the same JSON the web demo writes to `localStorage`.
- **Compose**: `KineticMotionProvider(store) { ... }` provides `LocalMotionState` (`STILL` or `MOVING`) and `LocalKineticMetrics` (target size, gaps, question font size, thumb-zone padding), built from the design tokens in `packages/spec`. Screens read those and never talk to sensors.

### Sources and what the engine receives

| Source | Android API | Engine sample | Notes |
| --- | --- | --- | --- |
| `ManualSource` | none (a switch) | `State` | Immediate, bypasses hysteresis. |
| `SimulatedWalkSource` | none | `Acceleration` at 50 Hz | Synthetic steps for an emulator; exercises the real step detector. |
| `AccelerometerSource` | `SensorManager`, `TYPE_ACCELEROMETER`, `SENSOR_DELAY_GAME` | `Acceleration` (m/s^2, gravity included) | No permission, no Play services. The fallback. |
| `ActivityTransitionSource` | Play services Activity Recognition Transition API | `Activity` | See below. |

Activity Transition mapping (transitions have no confidence, so `1.0`): `WALKING` to Walking, `RUNNING` to Running, `ON_BICYCLE` to Cycling, `IN_VEHICLE` to Automotive, `STILL` to Stationary. An EXIT of the current activity with no ENTER of another in the same delivery reports Unknown. Latency varies by device; expect seconds.

### Permissions

- `android.permission.ACTIVITY_RECOGNITION` is a runtime permission on Android 10+. The library declares it; the **app asks for it** (the demo uses `rememberLauncherForActivityResult(RequestPermission())`) and `ActivityTransitionSource` throws a user-facing `KineticSourceException` if it is missing.
- `com.google.android.gms.permission.ACTIVITY_RECOGNITION` covers Android 9 and older (install-time).
- The accelerometer needs none.

## The demo

Same screens and behaviour as the web demo. The full form shows every field; when motion says "moving", the stepper shows one question at a time with a bottom Back / Later / Next bar, larger targets and a bigger question. "Show full form" in the top bar overrides it for the current walk; after repeated taps a banner offers "Turn back on".

Things to try:

1. Flip **Simulate walking**: the stepper appears immediately. Flip it off: the full form returns.
2. **Simulated steps** (emulator): the real step detector runs on synthetic data; it switches after about 5 s. Open **Debug** to watch cadence, pending state and time in state.
3. **Use accelerometer** on a phone: walk with it in your hand or a front pocket.
4. **Walking mode** on a phone with Google Play services: grants the permission, then follows the OS activity classifier (slower to react, much cheaper in power).
5. In the stepper: choice cards and Yes/No advance by themselves after 300 ms; Next confirms the slider's displayed value; "Later" postpones a question; swipe right goes back.
6. Turn on TalkBack: focus lands on the question heading after each step, and "Question n of N" is announced.

Accessibility choices: the choice cards are one `selectableGroup` of `Role.RadioButton` items, the slider announces its named position through `stateDescription`, the email field uses the email keyboard with autocorrect and capitalisation off, and all sizes are `dp`/`sp` so large font and display scale are respected. The demo adds no animations of its own (the screen switch is immediate), so there is nothing to reduce beyond what the system animator scale already controls in Material components.

## Notes

- `kinetic/build.gradle.kts` adds `../../generated/kotlin` and `packages/spec/generated` as source directories: the generated code is compiled in place, never copied. Regenerate with `scripts/generate-bindings.sh` (or `scripts/build-android.sh`).
- AGP 9 compiles Kotlin itself ("built-in Kotlin"), so only the Compose compiler plugin is applied next to the Android plugins.
- Not verified without a device: Transition API delivery, the permission flow, sensor behaviour, TalkBack and the UI at runtime. See DECISIONS.md, "Android".
