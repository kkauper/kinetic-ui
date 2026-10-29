//! UniFFI layer over `kinetic-core`: the Swift and Kotlin packages are
//! generated from this crate, the way `@kinetic-ui/react` is a thin layer over
//! the TypeScript core.
//!
//! What lives here and not in the core: FFI-friendly mirrors of the core types
//! (`uniffi` cannot derive on foreign types), a mutex around each engine or
//! model so objects are `Send + Sync`, and observer lists.
//!
//! # Listeners and locking
//!
//! `subscribe` registers a [`ChangeListener`]. After a mutating call changed
//! something, the object releases its state lock first, then copies the listener
//! list and releases that lock too, and only then calls `on_change`. A listener
//! may therefore call back into the same object (`snapshot()`, `state()`, even
//! another mutating method) without deadlocking. A listener that mutates the
//! object triggers further notifications, so it should be idempotent.

// UniFFI exports take owned arguments (`String`, records); that is the FFI contract, not a smell.
#![allow(clippy::needless_pass_by_value)]

use std::collections::HashMap;
use std::fmt;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError, Weak};

use kinetic_core::form as core_form;
use kinetic_core::motion as core_motion;

uniffi::setup_scaffolding!("kinetic");

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

// ---------------------------------------------------------------------------
// Errors

/// Errors surfaced to Swift and Kotlin.
#[derive(Debug, uniffi::Error)]
pub enum KineticError {
    /// The form schema JSON was rejected; `reason` says why.
    InvalidSchema {
        /// Human-readable reason, the same text the TypeScript core throws.
        /// Not called `message`: that clashes with `Throwable.message` in the generated Kotlin.
        reason: String,
    },
    /// An action named a field the schema does not have.
    UnknownField {
        /// The offending id.
        id: String,
    },
}

impl fmt::Display for KineticError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            KineticError::InvalidSchema { reason } => f.write_str(reason),
            KineticError::UnknownField { id } => write!(f, "Unknown field \"{id}\"."),
        }
    }
}

impl std::error::Error for KineticError {}

impl From<core_form::SchemaError> for KineticError {
    fn from(e: core_form::SchemaError) -> Self {
        KineticError::InvalidSchema { reason: e.to_string() }
    }
}

impl From<core_form::FormError> for KineticError {
    fn from(e: core_form::FormError) -> Self {
        match e {
            core_form::FormError::UnknownField(id) => KineticError::UnknownField { id },
        }
    }
}

// ---------------------------------------------------------------------------
// Observers

/// Implemented by the app; called after the observed object changed.
#[uniffi::export(foreign)]
pub trait ChangeListener: Send + Sync {
    /// Something changed; read the new `snapshot()` / `state()`.
    fn on_change(&self);
}

#[derive(Default)]
struct Registry {
    inner: Mutex<RegistryInner>,
}

#[derive(Default)]
struct RegistryInner {
    next_id: u64,
    listeners: Vec<(u64, Arc<dyn ChangeListener>)>,
}

impl Registry {
    fn add(self: &Arc<Self>, listener: Arc<dyn ChangeListener>) -> Arc<Subscription> {
        let mut inner = lock(&self.inner);
        inner.next_id += 1;
        let id = inner.next_id;
        inner.listeners.push((id, listener));
        Arc::new(Subscription {
            registry: Arc::downgrade(self),
            id,
        })
    }

    /// Calls every listener with no lock held (the list is copied first).
    fn notify(&self) {
        let listeners: Vec<Arc<dyn ChangeListener>> =
            lock(&self.inner).listeners.iter().map(|(_, l)| Arc::clone(l)).collect();
        for listener in listeners {
            listener.on_change();
        }
    }
}

/// Handle returned by `subscribe`; call `cancel()` to stop notifications.
/// Dropping the handle does not cancel.
#[derive(uniffi::Object)]
pub struct Subscription {
    registry: Weak<Registry>,
    id: u64,
}

#[uniffi::export]
impl Subscription {
    /// Removes the listener. Safe to call more than once.
    pub fn cancel(&self) {
        if let Some(registry) = self.registry.upgrade() {
            lock(&registry.inner).listeners.retain(|(id, _)| *id != self.id);
        }
    }
}

// ---------------------------------------------------------------------------
// Motion types

/// `still` or `moving`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum MotionState {
    /// Not walking: show the full UI.
    Still,
    /// Walking: show the simplified UI.
    Moving,
}

/// Activity classes reported by OS classifiers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum ActivityKind {
    /// Not moving.
    Stationary,
    /// Walking.
    Walking,
    /// Running.
    Running,
    /// Cycling.
    Cycling,
    /// In a vehicle.
    Automotive,
    /// Unclassified.
    Unknown,
}

/// One sensor reading; `t` is milliseconds on the app's monotonic clock.
#[derive(Debug, Clone, Copy, PartialEq, uniffi::Enum)]
pub enum Sample {
    /// Raw acceleration in m/s^2 including gravity.
    Acceleration {
        /// Timestamp in ms.
        t: f64,
        /// X axis.
        x: f64,
        /// Y axis.
        y: f64,
        /// Z axis.
        z: f64,
    },
    /// An explicit state (bypasses hysteresis).
    State {
        /// Timestamp in ms.
        t: f64,
        /// The state.
        state: MotionState,
    },
    /// An OS activity classification.
    Activity {
        /// Timestamp in ms.
        t: f64,
        /// The activity.
        activity: ActivityKind,
        /// Confidence 0..1.
        confidence: f64,
    },
}

/// All tunable constants. See the core's `MotionConfig` for the meaning of each.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct MotionConfig {
    /// Lower cadence edge (steps/s) counted as walking.
    pub min_cadence: f64,
    /// Upper cadence edge (steps/s) counted as walking.
    pub max_cadence: f64,
    /// Activities counted as walking.
    pub moving_activities: Vec<ActivityKind>,
    /// Minimum activity confidence.
    pub min_activity_confidence: f64,
    /// Walking needed before switching to moving, in ms.
    pub enter_moving_after_ms: f64,
    /// Non-walking needed before switching back, in ms.
    pub exit_moving_after_ms: f64,
    /// Window of recent steps, in ms.
    pub cadence_window_ms: f64,
    /// Steps needed in the window to report a cadence.
    pub min_steps_for_cadence: u32,
    /// Peak height over the baseline that counts as a step, in m/s^2.
    pub step_threshold: f64,
    /// Refractory period between steps, in ms.
    pub min_step_interval_ms: f64,
    /// Time constant of the step-signal low-pass, in ms.
    pub signal_smoothing_ms: f64,
    /// Time constant of the gravity baseline, in ms.
    pub baseline_ms: f64,
    /// How often the app should call `tick`, in ms (advisory).
    pub tick_interval_ms: f64,
}

/// Immutable view of the engine.
#[derive(Debug, Clone, Copy, PartialEq, uniffi::Record)]
pub struct MotionSnapshot {
    /// Effective state: `forced` if set, else `detected`.
    pub state: MotionState,
    /// State chosen by the detector.
    pub detected: MotionState,
    /// Override, if any.
    pub forced: Option<MotionState>,
    /// Steps per second, rounded to 0.1.
    pub cadence: f64,
    /// When `state` last changed, in ms.
    pub entered_at: f64,
    /// State the detector leans toward but has not committed to.
    pub pending: Option<MotionState>,
    /// When `pending` started, in ms.
    pub pending_since: Option<f64>,
    /// Latest OS activity class, if the latest input was an activity sample.
    pub activity: Option<ActivityKind>,
}

/// State of the "Show full form" escape hatch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Record)]
pub struct ShowFullState {
    /// The user asked for the full form during the current moving episode.
    pub active: bool,
    /// Taps in this session.
    pub taps: u32,
    /// Moving mode is off for the rest of the session.
    pub suppressed: bool,
}

macro_rules! mirror_enum {
    ($ffi:ident <-> $core:path { $($variant:ident),+ }) => {
        impl From<$core> for $ffi {
            fn from(v: $core) -> Self {
                match v { $(<$core>::$variant => $ffi::$variant),+ }
            }
        }
        impl From<$ffi> for $core {
            fn from(v: $ffi) -> Self {
                match v { $($ffi::$variant => <$core>::$variant),+ }
            }
        }
    };
}

mirror_enum!(MotionState <-> core_motion::MotionState { Still, Moving });
mirror_enum!(ActivityKind <-> core_motion::ActivityKind { Stationary, Walking, Running, Cycling, Automotive, Unknown });

impl From<Sample> for core_motion::Sample {
    fn from(s: Sample) -> Self {
        match s {
            Sample::Acceleration { t, x, y, z } => Self::Acceleration { t, x, y, z },
            Sample::State { t, state } => Self::State { t, state: state.into() },
            Sample::Activity {
                t,
                activity,
                confidence,
            } => Self::Activity {
                t,
                activity: activity.into(),
                confidence,
            },
        }
    }
}

impl From<core_motion::MotionConfig> for MotionConfig {
    fn from(c: core_motion::MotionConfig) -> Self {
        Self {
            min_cadence: c.min_cadence,
            max_cadence: c.max_cadence,
            moving_activities: c.moving_activities.into_iter().map(Into::into).collect(),
            min_activity_confidence: c.min_activity_confidence,
            enter_moving_after_ms: c.enter_moving_after_ms,
            exit_moving_after_ms: c.exit_moving_after_ms,
            cadence_window_ms: c.cadence_window_ms,
            min_steps_for_cadence: c.min_steps_for_cadence,
            step_threshold: c.step_threshold,
            min_step_interval_ms: c.min_step_interval_ms,
            signal_smoothing_ms: c.signal_smoothing_ms,
            baseline_ms: c.baseline_ms,
            tick_interval_ms: c.tick_interval_ms,
        }
    }
}

impl From<MotionConfig> for core_motion::MotionConfig {
    fn from(c: MotionConfig) -> Self {
        Self {
            min_cadence: c.min_cadence,
            max_cadence: c.max_cadence,
            moving_activities: c.moving_activities.into_iter().map(Into::into).collect(),
            min_activity_confidence: c.min_activity_confidence,
            enter_moving_after_ms: c.enter_moving_after_ms,
            exit_moving_after_ms: c.exit_moving_after_ms,
            cadence_window_ms: c.cadence_window_ms,
            min_steps_for_cadence: c.min_steps_for_cadence,
            step_threshold: c.step_threshold,
            min_step_interval_ms: c.min_step_interval_ms,
            signal_smoothing_ms: c.signal_smoothing_ms,
            baseline_ms: c.baseline_ms,
            tick_interval_ms: c.tick_interval_ms,
        }
    }
}

impl From<core_motion::MotionSnapshot> for MotionSnapshot {
    fn from(s: core_motion::MotionSnapshot) -> Self {
        Self {
            state: s.state.into(),
            detected: s.detected.into(),
            forced: s.forced.map(Into::into),
            cadence: s.cadence,
            entered_at: s.entered_at,
            pending: s.pending.map(Into::into),
            pending_since: s.pending_since,
            activity: s.activity.map(Into::into),
        }
    }
}

impl From<core_motion::ShowFullState> for ShowFullState {
    fn from(s: core_motion::ShowFullState) -> Self {
        Self {
            active: s.active,
            taps: s.taps,
            suppressed: s.suppressed,
        }
    }
}

/// The default [`MotionConfig`] (the same numbers as the TypeScript core).
#[uniffi::export]
pub fn default_config() -> MotionConfig {
    core_motion::MotionConfig::default().into()
}

// ---------------------------------------------------------------------------
// MotionEngine

/// The motion model. The app owns sensors and timers: feed it `push_sample`
/// and call `tick` periodically (see `MotionConfig.tick_interval_ms`); read
/// `snapshot()` or `subscribe` for changes. All times are milliseconds on one
/// clock of the app's choosing.
#[derive(uniffi::Object)]
pub struct MotionEngine {
    inner: Mutex<core_motion::MotionEngine>,
    registry: Arc<Registry>,
}

impl MotionEngine {
    /// Runs `f` under the lock, then notifies listeners (lock released) if it reports a change.
    fn mutate(&self, f: impl FnOnce(&mut core_motion::MotionEngine) -> bool) {
        let changed = f(&mut lock(&self.inner));
        if changed {
            self.registry.notify();
        }
    }
}

#[uniffi::export]
impl MotionEngine {
    /// A `still` engine created at `now_ms`.
    #[uniffi::constructor]
    pub fn new(config: MotionConfig, now_ms: f64) -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(core_motion::MotionEngine::new(config.into(), now_ms)),
            registry: Arc::default(),
        })
    }

    /// Feeds one sensor reading; its timestamp is "now" for this call.
    pub fn push_sample(&self, sample: Sample) {
        self.mutate(|e| e.push_sample(sample.into()));
    }

    /// Re-evaluates time-based transitions. Call on a timer.
    pub fn tick(&self, now_ms: f64) {
        self.mutate(|e| e.tick(now_ms));
    }

    /// Overrides the detected state (`None` removes the override).
    pub fn force(&self, state: Option<MotionState>, now_ms: f64) {
        self.mutate(|e| e.force(state.map(Into::into), now_ms));
    }

    /// Replaces the config and re-evaluates. Read `config()`, change what you need, pass it back.
    pub fn configure(&self, config: MotionConfig, now_ms: f64) {
        let patch = core_motion::MotionConfig::from(config).into();
        self.mutate(|e| e.configure(&patch, now_ms));
    }

    /// Forgets detection state; starts over as `still` at `now_ms`.
    pub fn reset(&self, now_ms: f64) {
        self.mutate(|e| e.reset(now_ms));
    }

    /// The current snapshot.
    pub fn snapshot(&self) -> MotionSnapshot {
        (*lock(&self.inner).snapshot()).into()
    }

    /// The current config.
    pub fn config(&self) -> MotionConfig {
        lock(&self.inner).config().clone().into()
    }

    /// The user tapped "Show full form".
    pub fn show_full(&self, now_ms: f64) {
        self.mutate(|e| e.show_full(now_ms));
    }

    /// Starts a new Show-full session.
    pub fn reset_show_full_session(&self, now_ms: f64) {
        self.mutate(|e| e.reset_show_full_session(now_ms));
    }

    /// State of the Show-full policy.
    pub fn show_full_state(&self) -> ShowFullState {
        lock(&self.inner).show_full_state().into()
    }

    /// Calls `listener.on_change()` after every change (outside any lock).
    pub fn subscribe(&self, listener: Arc<dyn ChangeListener>) -> Arc<Subscription> {
        self.registry.add(listener)
    }
}

// ---------------------------------------------------------------------------
// Form types

/// An answer: text (also the value of a chosen option), a toggle or a number.
#[derive(Debug, Clone, PartialEq, uniffi::Enum)]
pub enum AnswerValue {
    /// Text or an option value.
    Text {
        /// The text.
        value: String,
    },
    /// A toggle.
    Bool {
        /// On or off.
        value: bool,
    },
    /// A slider position.
    Number {
        /// The number.
        value: f64,
    },
}

/// How a text field is interpreted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum TextFormat {
    /// An email address.
    Email,
    /// Free text.
    Plain,
}

/// One option of a choice field.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct ChoiceOption {
    /// Stored as the answer.
    pub value: String,
    /// Shown to the user.
    pub label: String,
}

/// Kind-specific data of a field, for rendering.
#[derive(Debug, Clone, PartialEq, uniffi::Enum)]
pub enum FieldKind {
    /// Free or email text.
    Text {
        /// Interpretation; `None` means plain.
        format: Option<TextFormat>,
        /// OS autocomplete hint.
        autocomplete: Option<String>,
    },
    /// One of several options.
    Choice {
        /// The options, at least two.
        options: Vec<ChoiceOption>,
    },
    /// On or off.
    Toggle,
    /// A number in a range.
    Slider {
        /// Lowest value.
        min: f64,
        /// Highest value.
        max: f64,
        /// Increment.
        step: f64,
        /// Labels keyed by value as text (for example "0").
        value_labels: HashMap<String, String>,
        /// Initial position, if any.
        default_value: Option<f64>,
    },
}

/// One question of the form.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct FieldSchema {
    /// Unique id, the key of its answer.
    pub id: String,
    /// Question text.
    pub label: String,
    /// Helper text.
    pub hint: Option<String>,
    /// Must be answered before `next` succeeds.
    pub required: bool,
    /// May be postponed.
    pub deferrable: bool,
    /// What kind of question this is.
    pub kind: FieldKind,
}

/// What a UI needs to render the current step.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct FormState {
    /// Answers by field id.
    pub answers: HashMap<String, AnswerValue>,
    /// Index of the current field; equal to the field count on the review step.
    pub current_step: u32,
    /// Postponed field ids, in deferral order.
    pub deferred: Vec<String>,
    /// Validation errors by field id.
    pub errors: HashMap<String, String>,
}

/// A completed email address for a domain.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct EmailCompletion {
    /// The domain.
    pub domain: String,
    /// The full address.
    pub email: String,
}

impl From<core_form::AnswerValue> for AnswerValue {
    fn from(v: core_form::AnswerValue) -> Self {
        match v {
            core_form::AnswerValue::Text(value) => Self::Text { value },
            core_form::AnswerValue::Bool(value) => Self::Bool { value },
            core_form::AnswerValue::Number(value) => Self::Number { value },
        }
    }
}

impl From<AnswerValue> for core_form::AnswerValue {
    fn from(v: AnswerValue) -> Self {
        match v {
            AnswerValue::Text { value } => Self::Text(value),
            AnswerValue::Bool { value } => Self::Bool(value),
            AnswerValue::Number { value } => Self::Number(value),
        }
    }
}

impl From<core_form::FieldSchema> for FieldSchema {
    fn from(f: core_form::FieldSchema) -> Self {
        let kind = match f.kind {
            core_form::FieldKind::Text { format, autocomplete } => FieldKind::Text {
                format: format.map(|f| match f {
                    core_form::TextFormat::Email => TextFormat::Email,
                    core_form::TextFormat::Plain => TextFormat::Plain,
                }),
                autocomplete,
            },
            core_form::FieldKind::Choice { options } => FieldKind::Choice {
                options: options
                    .into_iter()
                    .map(|o| ChoiceOption {
                        value: o.value,
                        label: o.label,
                    })
                    .collect(),
            },
            core_form::FieldKind::Toggle => FieldKind::Toggle,
            core_form::FieldKind::Slider {
                min,
                max,
                step,
                value_labels,
                default_value,
            } => FieldKind::Slider {
                min,
                max,
                step,
                value_labels: value_labels.unwrap_or_default().into_iter().collect(),
                default_value,
            },
        };
        Self {
            id: f.id,
            label: f.label,
            hint: f.hint,
            required: f.required,
            deferrable: f.deferrable,
            kind,
        }
    }
}

impl From<&core_form::FormState> for FormState {
    fn from(s: &core_form::FormState) -> Self {
        Self {
            answers: s.answers.iter().map(|(k, v)| (k.clone(), v.clone().into())).collect(),
            current_step: u32::try_from(s.current_step).unwrap_or(u32::MAX),
            deferred: s.deferred.clone(),
            errors: s.errors.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        }
    }
}

impl From<core_form::EmailCompletion> for EmailCompletion {
    fn from(c: core_form::EmailCompletion) -> Self {
        Self {
            domain: c.domain,
            email: c.email,
        }
    }
}

// ---------------------------------------------------------------------------
// FormModel

/// Where the app keeps answers between launches. The model only exchanges
/// JSON strings with it (the same JSON the web core writes); failures should
/// be swallowed by the implementation, and malformed JSON is ignored on load.
#[uniffi::export(foreign)]
pub trait FormStorage: Send + Sync {
    /// The stored JSON, if any.
    fn load(&self) -> Option<String>;
    /// Stores `json`, replacing what was there.
    fn save(&self, json: String);
    /// Removes stored data.
    fn clear(&self);
}

struct StorageAdapter(Arc<dyn FormStorage>);

impl core_form::FormPersistence for StorageAdapter {
    fn load(&self) -> Option<core_form::PersistedForm> {
        self.0
            .load()
            .and_then(|json| core_form::PersistedForm::from_json(&json))
    }

    fn save(&self, data: &core_form::PersistedForm) {
        self.0.save(data.to_json());
    }

    fn clear(&self) {
        self.0.clear();
    }
}

/// The step-by-step form model.
#[derive(uniffi::Object)]
pub struct FormModel {
    inner: Mutex<core_form::FormModel>,
    registry: Arc<Registry>,
}

impl FormModel {
    /// Runs `f` under the lock; notifies listeners (lock released) if the state revision moved.
    fn mutate<R>(&self, f: impl FnOnce(&mut core_form::FormModel) -> R) -> R {
        let (result, changed) = {
            let mut model = lock(&self.inner);
            let before = model.revision();
            let result = f(&mut model);
            (result, model.revision() != before)
        };
        if changed {
            self.registry.notify();
        }
        result
    }
}

#[uniffi::export]
impl FormModel {
    /// Builds a model from schema JSON (for example [`signup_schema_json`]),
    /// restoring from `storage` when given.
    #[uniffi::constructor]
    pub fn new(schema_json: String, storage: Option<Arc<dyn FormStorage>>) -> Result<Arc<Self>, KineticError> {
        let schema = core_form::define_schema(&schema_json)?;
        let model = match storage {
            Some(s) => core_form::FormModel::with_persistence(schema, Box::new(StorageAdapter(s))),
            None => core_form::FormModel::new(schema),
        };
        Ok(Arc::new(Self {
            inner: Mutex::new(model),
            registry: Arc::default(),
        }))
    }

    /// The form's title.
    pub fn title(&self) -> String {
        lock(&self.inner).schema().title.clone()
    }

    /// The questions in order, for rendering.
    pub fn fields(&self) -> Vec<FieldSchema> {
        lock(&self.inner)
            .schema()
            .fields
            .iter()
            .cloned()
            .map(Into::into)
            .collect()
    }

    /// The current state.
    pub fn state(&self) -> FormState {
        FormState::from(lock(&self.inner).state())
    }

    /// Stores (or with `None`, removes) an answer and saves it.
    pub fn set_answer(&self, id: String, value: Option<AnswerValue>) -> Result<(), KineticError> {
        self.mutate(|m| m.set_answer(&id, value.map(Into::into)))
            .map(|_| ())
            .map_err(Into::into)
    }

    /// Validates the current field; on success advances and returns `true`.
    pub fn next(&self) -> bool {
        self.mutate(core_form::FormModel::next)
    }

    /// One step back.
    pub fn back(&self) {
        self.mutate(core_form::FormModel::back);
    }

    /// Jumps to a step, clamped to the valid range.
    pub fn go_to(&self, step: i32) {
        self.mutate(|m| m.go_to(i64::from(step)));
    }

    /// Postpones a deferrable field (default: the current one).
    pub fn defer(&self, id: Option<String>) -> bool {
        self.mutate(|m| m.defer(id.as_deref()))
    }

    /// Moves to the first field that is neither answered nor deferred.
    pub fn jump_to_first_unanswered(&self) {
        self.mutate(core_form::FormModel::jump_to_first_unanswered);
    }

    /// Validates every field; `true` if there are no errors.
    pub fn validate_all(&self) -> bool {
        self.mutate(core_form::FormModel::validate_all)
    }

    /// Clears answers and stored data and returns to the first step.
    pub fn reset(&self) {
        self.mutate(core_form::FormModel::reset);
    }

    /// Whether the field has an answer that counts.
    pub fn is_answered(&self, id: String) -> Result<bool, KineticError> {
        lock(&self.inner).is_answered(&id).map_err(Into::into)
    }

    /// Deferred ids that are still unanswered.
    pub fn pending_deferred(&self) -> Vec<String> {
        lock(&self.inner).pending_deferred()
    }

    /// Calls `listener.on_change()` after every change (outside any lock).
    pub fn subscribe(&self, listener: Arc<dyn ChangeListener>) -> Arc<Subscription> {
        self.registry.add(listener)
    }
}

// ---------------------------------------------------------------------------
// Free functions

/// The sign-up form schema from `packages/spec`, the same file the web demo uses.
#[uniffi::export]
pub fn signup_schema_json() -> String {
    include_str!("../../../packages/spec/schemas/signup.schema.json").to_string()
}

/// Removes whitespace and lowercases the domain of an email address.
#[uniffi::export]
pub fn normalize_email(value: String) -> String {
    core_form::normalize_email(&value)
}

/// One-tap domain completions for a partially typed address.
#[uniffi::export]
pub fn email_domain_completions(value: String) -> Vec<EmailCompletion> {
    core_form::email_domain_completions(&value)
        .into_iter()
        .map(Into::into)
        .collect()
}

/// A corrected address for a probable domain typo, if any.
#[uniffi::export]
pub fn suggest_email_domain(value: String) -> Option<EmailCompletion> {
    core_form::suggest_email_domain(&value).map(Into::into)
}
