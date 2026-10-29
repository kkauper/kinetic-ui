#!/usr/bin/env bash
# Builds kinetic-ffi for the host and generates the Swift and Kotlin bindings
# into native/generated/{swift,kotlin}. Outputs are committed; rerun after any
# change to the exported API in crates/kinetic-ffi.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

case "$(uname -s)" in
  Darwin) lib="target/release/libkinetic_ffi.dylib" ;;
  Linux) lib="target/release/libkinetic_ffi.so" ;;
  *) echo "unsupported host: $(uname -s)" >&2; exit 1 ;;
esac

# Same feature set as the bindgen runs below, so the library is compiled once.
# Do not strip the library: UniFFI reads its metadata from the symbols.
# --no-format keeps the output independent of which formatters are installed.
cargo build -p kinetic-ffi --release --features cli

for language in swift kotlin; do
  out="native/generated/$language"
  rm -rf "$out"
  mkdir -p "$out"
  cargo run --release --features cli -p kinetic-ffi --bin uniffi-bindgen -- \
    generate --no-format --language "$language" --out-dir "$out" "$lib"
done

echo "Generated bindings:"
find native/generated -type f ! -name README.md -exec wc -c {} +
