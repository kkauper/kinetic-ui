# kinetic-ffi

A thin [UniFFI](https://mozilla.github.io/uniffi-rs/) layer over `kinetic-core`, the way `@kinetic-ui/react` is a thin layer over the TypeScript core. It adds only what a foreign language needs: FFI-friendly records and enums, a mutex per object, and change listeners. Swift and Kotlin bindings are generated from it.

Namespace: `kinetic` (`uniffi::setup_scaffolding!("kinetic")`), so Swift gets a `kinetic` module and Kotlin the package `uniffi.kinetic`. Exported: `MotionEngine`, `FormModel`, the `ChangeListener` and `FormStorage` callback traits (implemented in Swift/Kotlin), `default_config()`, `signup_schema_json()` and the email helpers.

Listeners are called after a change with no internal lock held, so `on_change` may read (`snapshot()`, `state()`) or even mutate the object without deadlocking.

## Test

```sh
cargo test -p kinetic-ffi
```

`tests/smoke.rs` drives both objects through this crate's Rust API, including a re-entrant listener.

## Generate the bindings

```sh
scripts/generate-bindings.sh
```

Builds the host cdylib in release mode and writes Swift and Kotlin sources to `native/generated/{swift,kotlin}` (committed). Run it after changing the exported API. The generator is the `uniffi-bindgen` binary of this crate (feature `cli`). Packaging for iOS and Android targets (xcframework, `.so` per ABI) is a separate step.
