#!/usr/bin/env bash
# Builds the native Rust library for Android and regenerates the Kotlin bindings.
#
# Prerequisites:
#   - Android NDK, with ANDROID_NDK_HOME pointing at it (Android Studio: SDK Manager > SDK Tools > NDK)
#   - cargo-ndk:          cargo install cargo-ndk
#   - Rust Android targets: rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
#
# Outputs:
#   - native/android/kinetic/src/main/jniLibs/{arm64-v8a,armeabi-v7a,x86_64}/libkinetic_ffi.so
#     (git-ignored; the Gradle build packages them into the AAR/APK)
#   - native/generated/kotlin/uniffi/kinetic/kinetic.kt (committed; via scripts/generate-bindings.sh)
#
# Then build the app with: cd native/android && ./gradlew :demo:assembleDebug
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

fail() {
  echo "error: $1" >&2
  exit 1
}

command -v cargo >/dev/null 2>&1 || fail "cargo not found. Install Rust from https://rustup.rs."

if [ -z "${ANDROID_NDK_HOME:-}" ]; then
  fail "ANDROID_NDK_HOME is not set. Install the NDK (Android Studio: SDK Manager > SDK Tools > NDK (Side by side)) and point ANDROID_NDK_HOME at it."
fi
[ -d "$ANDROID_NDK_HOME" ] || fail "ANDROID_NDK_HOME ($ANDROID_NDK_HOME) is not a directory."

cargo ndk --version >/dev/null 2>&1 || fail "cargo-ndk not found. Install it with: cargo install cargo-ndk"

targets=(aarch64-linux-android armv7-linux-androideabi x86_64-linux-android)
if command -v rustup >/dev/null 2>&1; then
  installed="$(rustup target list --installed)"
  for target in "${targets[@]}"; do
    grep -qx "$target" <<<"$installed" || fail "Rust target $target is missing. Run: rustup target add ${targets[*]}"
  done
fi

jni_libs="native/android/kinetic/src/main/jniLibs"
rm -rf "$jni_libs"
mkdir -p "$jni_libs"

# cargo-ndk maps the Rust targets to the ABI folders Android expects.
cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -o "$jni_libs" build -p kinetic-ffi --release

# Regenerate the Kotlin from the host build (the API is identical on every target).
scripts/generate-bindings.sh

echo "Android libraries:"
find "$jni_libs" -name '*.so' -exec ls -l {} +
