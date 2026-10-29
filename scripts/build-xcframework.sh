#!/usr/bin/env bash
# Builds native/apple/KineticFFI.xcframework (the Rust core as a static library
# for iOS device, iOS simulator and macOS) and refreshes the generated Swift
# bindings in native/apple/Sources/KineticBindings.
#
# Prerequisites (macOS only):
#   - Xcode with command line tools (xcodebuild, lipo); Xcode 16+ for Swift 6
#   - Rust via rustup, plus the Apple targets:
#       rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios \
#                         aarch64-apple-darwin x86_64-apple-darwin
#     (this script adds missing ones itself)
#
# Produces (git-ignored): native/apple/KineticFFI.xcframework
# Updates (committed):    native/apple/Sources/KineticBindings/kinetic.swift,
#                         native/apple/Sources/KineticUI/KineticTokens.swift (copy of packages/spec/generated)
# Run time: about 3-6 minutes cold (five release builds), seconds when cached.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: build-xcframework.sh needs macOS (xcodebuild and lipo are Apple tools)." >&2
  echo "       On Linux you can still regenerate the bindings with scripts/generate-bindings.sh." >&2
  exit 1
fi
for tool in cargo rustup xcodebuild lipo; do
  command -v "$tool" >/dev/null || { echo "error: '$tool' not found in PATH." >&2; exit 1; }
done

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
apple="native/apple"
work="target/xcframework"
targets=(aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios aarch64-apple-darwin x86_64-apple-darwin)

rustup target add "${targets[@]}"

# 1. Static libraries, one per target.
for target in "${targets[@]}"; do
  echo "==> cargo build ($target)"
  cargo build -p kinetic-ffi --release --target "$target"
done
lib() { echo "target/$1/release/libkinetic_ffi.a"; }

# 2. Fat libraries for the two slices that cover two architectures.
rm -rf "$work"
mkdir -p "$work/ios" "$work/sim" "$work/macos"
cp "$(lib aarch64-apple-ios)" "$work/ios/libkinetic_ffi.a"
lipo -create "$(lib aarch64-apple-ios-sim)" "$(lib x86_64-apple-ios)" -output "$work/sim/libkinetic_ffi.a"
lipo -create "$(lib aarch64-apple-darwin)" "$(lib x86_64-apple-darwin)" -output "$work/macos/libkinetic_ffi.a"

# 3. Swift bindings from the host build (scripts/generate-bindings.sh also
#    regenerates Kotlin; here only Swift is needed).
host_lib="target/release/libkinetic_ffi.dylib"
cargo build -p kinetic-ffi --release --features cli
gen="$work/swift"
rm -rf "$gen"
cargo run --release --features cli -p kinetic-ffi --bin uniffi-bindgen -- \
  generate --no-format --language swift --out-dir "$gen" "$host_lib"
cp "$gen/kinetic.swift" "$apple/Sources/KineticBindings/kinetic.swift"
# Design tokens come from packages/spec (npm run tokens there); KineticMetrics.swift builds on them.
cp packages/spec/generated/KineticTokens.swift "$apple/Sources/KineticUI/KineticTokens.swift"

# 4. Headers: a static-library XCFramework carries a plain module map (not a
#    `framework module`). The generated one lists `use "Darwin"`, which is not
#    needed and breaks on some SDKs, so we write our own.
for slice in ios sim macos; do
  mkdir -p "$work/$slice/Headers"
  cp "$gen/kineticFFI.h" "$work/$slice/Headers/kineticFFI.h"
  cat > "$work/$slice/Headers/module.modulemap" <<'MODULEMAP'
module kineticFFI {
    header "kineticFFI.h"
    export *
}
MODULEMAP
done

# 5. The XCFramework.
out="$apple/KineticFFI.xcframework"
rm -rf "$out"
xcodebuild -create-xcframework \
  -library "$work/ios/libkinetic_ffi.a"   -headers "$work/ios/Headers" \
  -library "$work/sim/libkinetic_ffi.a"   -headers "$work/sim/Headers" \
  -library "$work/macos/libkinetic_ffi.a" -headers "$work/macos/Headers" \
  -output "$out"

echo "Built $out"
echo "Next: (cd $apple && swift test)   then   (cd $apple/Demo && xcodegen)"
