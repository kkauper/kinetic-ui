//! Kinetic UI core: a headless, deterministic model that simplifies a UI while
//! the user walks, plus a step-by-step form model.
//!
//! This crate is the Rust counterpart of `@kinetic-ui/core` (TypeScript). Both
//! implementations run the same language-neutral fixtures in `packages/spec`,
//! so behaviour is tested for parity instead of being promised.
//!
//! # The platform drives time
//!
//! There are no clocks, threads, timers or sensors in here. Native platforms
//! own the sensors and the timers; the core is a pure state machine that
//! receives samples and timestamps and answers with a snapshot:
//!
//! * call [`motion::MotionEngine::push_sample`] for every sensor reading,
//!   stamped with the platform's monotonic clock in milliseconds;
//! * call [`motion::MotionEngine::tick`] on a timer (see
//!   [`motion::MotionConfig::tick_interval_ms`]) so time-based transitions such
//!   as "walked for 5 s" fire even when no new sample arrives.
//!
//! Every method that depends on time takes it as an `f64` number of
//! milliseconds. Given the same inputs the engine always produces the same
//! outputs, which is what makes the fixture-based conformance tests possible.
//!
//! # Modules
//!
//! * [`motion`]: cadence estimator, hysteresis machine, Show-full policy and
//!   the [`motion::MotionEngine`] that combines them.
//! * [`form`]: schema, validation, [`form::FormModel`], persistence and email
//!   helpers.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub mod form;
pub mod motion;
