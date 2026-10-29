//! Runs the UniFFI binding generator: `cargo run --features cli --bin uniffi-bindgen -- generate ...`.
fn main() {
    uniffi::uniffi_bindgen_main();
}
