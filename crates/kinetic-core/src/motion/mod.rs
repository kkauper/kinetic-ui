//! Motion detection: from raw samples to a stable `still` / `moving` state.
//!
//! Data flows `Sample` -> [`CadenceEstimator`] (or an OS activity class) ->
//! [`step_machine`] (hysteresis) -> [`MotionSnapshot`]. [`MotionEngine`] wires
//! the pieces together; [`ShowFullPolicy`] is the user's escape hatch.

pub mod cadence;
pub mod config;
pub mod engine;
pub mod machine;
pub mod show_full;
pub mod types;

pub use cadence::CadenceEstimator;
pub use config::{MotionConfig, MotionConfigPatch};
pub use engine::MotionEngine;
pub use machine::{MachineState, initial_machine, is_walking_activity, is_walking_cadence, step_machine};
pub use show_full::{ShowFullPolicy, ShowFullState};
pub use types::{ActivityKind, MotionSnapshot, MotionState, Sample};
