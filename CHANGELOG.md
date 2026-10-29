# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is 0.x, the API may change between minor releases.

## [0.1.0] - 2026-10-29

First release.

### Added

- Headless TypeScript models (`packages/core`): a motion model that decides "still" or "moving", and a form model with a one-question-at-a-time stepper, answers that survive every switch, and a "Show full form" escape hatch.
- Walking detection from the accelerometer: an adaptive step threshold, a regularity check on step intervals, missed-step folding for dropped sensor events, and leaky hysteresis. It takes about 3 s of walking to enter the moving state and 10 s of stillness to leave it.
- Rust core (`crates/kinetic-core`) with the same motion and form models, and UniFFI bindings (`crates/kinetic-ffi`) that generate Swift and Kotlin.
- React hooks (`packages/react`) over the store contract, and a `data-motion` attribute for styling with plain CSS.
- Swift package `KineticUI` for iOS 17 and macOS 14: Core Motion activity and accelerometer sources, stores, and a SwiftUI environment (`\.motionState`, `\.kineticMetrics`).
- Kotlin library for Android (minSdk 26): Activity Recognition and accelerometer sources, stores, and Compose bindings (`KineticMotionProvider`, `LocalMotionState`, `LocalKineticMetrics`).
- Shared spec (`packages/spec`): form schema, JSON conformance fixtures that run against every implementation (including a real recorded iPhone walk), and DTCG design tokens with generated CSS, Swift and Kotlin.
- Accessibility: labelled controls with linked errors, focus that moves to the current question, polite progress announcements ("Question n of N", "Review: n of N answered"), touch targets of at least 56 px while moving, visible focus outlines, and reduced-motion, Dynamic Type and font-scale support. This is not a full audit.
- Demo apps for web, iOS and Android with the same behaviour, a debug sheet with live readout, and a step simulator for desktops, emulators and the iOS Simulator.
- Release workflow that publishes the XCFramework, the Android AAR and the web demo build as GitHub release assets.
- Apache-2.0 license.

### Notes

- This is a prototype. The step detector is demo-grade, and the iOS and Android demos have not been tried on physical devices yet.
- The packages are private workspace packages and are not published to npm.

### Known limits

See [DECISIONS.md](DECISIONS.md#known-limits) for what this release does not handle, such as a phone in a swinging bag, running, vehicles and walking slower than 1.5 steps/s.

[0.1.0]: https://github.com/kkauper/kinetic-ui/releases/tag/v0.1.0
