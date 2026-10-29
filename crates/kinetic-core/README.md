# kinetic-core

The Rust implementation of the Kinetic UI model: motion detection (cadence estimator, hysteresis, "Show full form" policy) and the step-by-step form model. It is the engine behind the Swift and Kotlin packages (through `kinetic-ffi`); the web keeps its TypeScript core, `@kinetic-ui/core`.

**A deterministic engine, not a framework.** There are no clocks, threads, timers or sensors in this crate. The platform owns them and drives the engine: `push_sample(sample)` for every sensor reading, `tick(now)` on a timer, times as `f64` milliseconds on one clock. The same inputs always give the same snapshot, which is what makes the shared fixtures possible. Dependencies: `serde` and `serde_json` only.

```rust
use kinetic_core::motion::{MotionConfig, MotionEngine, Sample, ActivityKind};

let mut engine = MotionEngine::new(MotionConfig::default(), 0.0);
engine.push_sample(Sample::Activity { t: 0.0, activity: ActivityKind::Walking, confidence: 1.0 });
engine.tick(5000.0); // walking for 5 s: the snapshot is now `Moving`
assert_eq!(engine.snapshot().state, kinetic_core::motion::MotionState::Moving);
```

## Test

```sh
cargo test -p kinetic-core
```

`tests/conformance.rs` runs every file in `packages/spec/fixtures` (one `#[test]` per file, all failing cases reported together). It mirrors `packages/core/src/conformance.test.ts`; both implementations passing the same data is the parity guarantee.

## Layout

- `motion/`: `config`, `types`, `cadence` (step counter), `machine` (pure hysteresis reducer), `show_full` (policy state), `engine` (wires them together).
- `form/`: `schema` (`define_schema`), `validation`, `model` (`FormModel`), `persistence` (`FormPersistence` trait, in-memory impl, same JSON as the web), `email`.

The Show-full policy is plain state that the engine owns and consults after each snapshot change, instead of subscribing to it as in TypeScript; observable behaviour is identical.
