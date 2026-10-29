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
./gradlew :demo:testDebugUnitTest              # needs the Android SDK and the host library; the stepper flow (Robolectric)
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

Same screens and behaviour as the web demo, dark only. The full form shows every field top to bottom; when motion says "moving", the stepper shows one question at a time, anchored to the bottom of the screen, with a Back / Later / Next bar that sits right above the keyboard. After the last question a read-only summary ("Review your answers") lists every answer with a "Change" pill; "Create account" validates everything and jumps to the first invalid question. "Show full form" overrides the stepper for the current walk; after repeated taps a notice offers "Turn back on".

Top bar: the gyroscope logo, "Kinetic UI" and a GitHub pill. Below it the demo controls are pill tags: **Simulate walking**, **Walking mode** (Activity Recognition, asks for the permission) and **Debug**, which opens a bottom sheet with the live readout, "Keep readout on screen" (remembered in SharedPreferences), the step simulator, the accelerometer, the walking band, and the resets. With the readout pinned, one status pill (`still 1.8 steps/s 20 s`, plus the pending switch) shows in the layout and opens the sheet. Source errors appear as a notice card with "Use Simulate walking instead".

Things to try:

1. Flip **Simulate walking**: the stepper appears and the email field has focus with the keyboard open. Flip it off: the full form returns.
2. Type an email and press Next (the button or the keyboard's action): the same field stays focused and the keyboard stays open for "First name".
3. Choice cards and Yes/No advance by themselves after 300 ms; Next confirms the slider's displayed value; "Later" postpones a question (shown as "N for later" and first in the summary); swipe right goes back.
4. **Debug**, then **Use simulator** (emulator): the real step detector runs on synthetic data and switches after about 5 s. **Use accelerometer** does the same with the phone's sensor; **Walking mode** follows the OS activity classifier on a phone with Google Play services (slower to react, much cheaper in power).
5. Turn on TalkBack: focus lands on each step's control, "Question n of N" and "Review: n of N answered" are announced.

Accessibility and layout choices: the choice cards are one `selectableGroup` of `Role.RadioButton` items with an accent border and a check when selected; the slider announces its named position through `stateDescription`; the email field uses the email keyboard with autocorrect and capitalisation off; the bottom bar uses `imePadding()` (window resize mode `adjustResize`, edge to edge); every button is a pill and non-text boundaries use slate-9 (3.68:1); all sizes are `dp`/`sp`, so large font and display scale are respected. The demo adds no animations of its own.

Font: Hanken Grotesk, bundled (`demo/src/main/res/font/hanken_grotesk.ttf`, copied from `packages/spec/brand/fonts`), SIL Open Font License 1.1 (`packages/spec/brand/fonts/OFL.txt`). No runtime download. The demo's UI test (`./gradlew :demo:testDebugUnitTest`, Robolectric) needs the host Rust library (`cargo build -p kinetic-ffi --release`); set `ROBOLECTRIC_DEPENDENCY_DIR` to a folder with Robolectric's `android-all` jars if the test JVM cannot reach Maven Central.

## Notes

- `kinetic/build.gradle.kts` adds `../../generated/kotlin` and `packages/spec/generated` as source directories: the generated code is compiled in place, never copied. Regenerate with `scripts/generate-bindings.sh` (or `scripts/build-android.sh`).
- AGP 9 compiles Kotlin itself ("built-in Kotlin"), so only the Compose compiler plugin is applied next to the Android plugins.
- Not verified without a device: Transition API delivery, the permission flow, sensor behaviour, TalkBack and the UI at runtime. See DECISIONS.md, "Android".
