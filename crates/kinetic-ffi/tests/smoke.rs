//! Drives the FFI-layer Rust API (not the generated Swift/Kotlin) end to end.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use kinetic_ffi::{
    ActivityKind, AnswerValue, ChangeListener, FieldKind, FormModel, FormStorage, KineticError, MotionEngine,
    MotionState, Sample, default_config, email_domain_completions, normalize_email, signup_schema_json,
    suggest_email_domain,
};

#[derive(Default)]
struct Counter(AtomicUsize);

impl ChangeListener for Counter {
    fn on_change(&self) {
        self.0.fetch_add(1, Ordering::SeqCst);
    }
}

impl Counter {
    fn count(&self) -> usize {
        self.0.load(Ordering::SeqCst)
    }
}

/// Calls back into the engine from `on_change`; would deadlock if listeners ran under the lock.
struct Reentrant {
    engine: OnceLock<Arc<MotionEngine>>,
    seen: Mutex<Vec<MotionState>>,
}

impl ChangeListener for Reentrant {
    fn on_change(&self) {
        let engine = self.engine.get().expect("engine set");
        self.seen.lock().unwrap().push(engine.snapshot().state);
    }
}

#[derive(Default)]
struct MemoryStorage(Mutex<Option<String>>);

impl FormStorage for MemoryStorage {
    fn load(&self) -> Option<String> {
        self.0.lock().unwrap().clone()
    }
    fn save(&self, json: String) {
        *self.0.lock().unwrap() = Some(json);
    }
    fn clear(&self) {
        *self.0.lock().unwrap() = None;
    }
}

#[allow(clippy::unnecessary_wraps)] // reads better at the call sites
fn text(s: &str) -> Option<AnswerValue> {
    Some(AnswerValue::Text { value: s.to_string() })
}

#[test]
fn engine_walks_from_still_to_moving_and_notifies() {
    let engine = MotionEngine::new(default_config(), 0.0);
    let counter = Arc::new(Counter::default());
    let sub = engine.subscribe(counter.clone());

    engine.push_sample(Sample::Activity {
        t: 0.0,
        activity: ActivityKind::Walking,
        confidence: 1.0,
    });
    assert_eq!(counter.count(), 1); // pending: moving
    engine.tick(1000.0);
    assert_eq!(counter.count(), 1); // nothing observable changed
    engine.tick(5000.0);
    assert_eq!(counter.count(), 2);
    assert_eq!(engine.snapshot().state, MotionState::Moving);

    engine.show_full(5100.0);
    assert_eq!(engine.snapshot().state, MotionState::Still);
    assert!(engine.show_full_state().active);
    assert_eq!(counter.count(), 3);

    sub.cancel();
    sub.cancel(); // idempotent
    engine.force(None, 5200.0);
    assert_eq!(counter.count(), 3);
}

#[test]
fn cancelled_listener_hears_nothing_more() {
    let engine = MotionEngine::new(default_config(), 0.0);
    let counter = Arc::new(Counter::default());
    let sub = engine.subscribe(counter.clone());
    engine.push_sample(Sample::State {
        t: 1.0,
        state: MotionState::Moving,
    });
    sub.cancel();
    engine.push_sample(Sample::State {
        t: 2.0,
        state: MotionState::Still,
    });
    assert_eq!(counter.count(), 1);
}

#[test]
fn listener_may_read_the_engine_without_deadlock() {
    let engine = MotionEngine::new(default_config(), 0.0);
    let listener = Arc::new(Reentrant {
        engine: OnceLock::new(),
        seen: Mutex::default(),
    });
    listener.engine.set(engine.clone()).ok().unwrap();
    let _sub = engine.subscribe(listener.clone());

    engine.push_sample(Sample::State {
        t: 1.0,
        state: MotionState::Moving,
    });
    engine.push_sample(Sample::State {
        t: 2.0,
        state: MotionState::Still,
    });

    assert_eq!(
        *listener.seen.lock().unwrap(),
        [MotionState::Moving, MotionState::Still]
    );
}

#[test]
fn configure_round_trips_through_the_ffi_record() {
    let engine = MotionEngine::new(default_config(), 0.0);
    let mut config = engine.config();
    config.enter_moving_after_ms = 1000.0;
    engine.configure(config, 0.0);
    assert_eq!(engine.config().enter_moving_after_ms, 1000.0);
    assert_eq!(engine.config().moving_activities, [ActivityKind::Walking]);
}

#[test]
fn form_flow_with_storage_and_listener() {
    let storage = Arc::new(MemoryStorage::default());
    let form = FormModel::new(signup_schema_json(), Some(storage.clone())).unwrap();
    let counter = Arc::new(Counter::default());
    let _sub = form.subscribe(counter.clone());

    assert_eq!(form.title(), "Create your account");
    assert_eq!(form.fields().len(), 5);
    assert!(matches!(form.fields()[0].kind, FieldKind::Text { .. }));

    assert!(!form.next()); // email required
    assert_eq!(form.state().errors["email"], "Email is required.");
    form.set_answer("email".into(), text("ada@example.com")).unwrap();
    assert!(form.state().errors.is_empty());
    assert!(form.next());
    assert!(form.defer(None)); // firstName
    assert_eq!(form.state().current_step, 2);
    assert!(counter.count() >= 4);

    // Answers are stored as the web core's JSON.
    let stored = storage.load().unwrap();
    assert!(stored.contains(r#""schemaId":"signup""#) && stored.contains(r#""deferred":["firstName"]"#));

    // A second model resumes where the first stopped.
    let again = FormModel::new(signup_schema_json(), Some(storage.clone())).unwrap();
    assert_eq!(again.state().current_step, 2);
    assert_eq!(again.pending_deferred(), ["firstName"]);

    again.reset();
    assert!(storage.load().is_none());
}

#[test]
fn form_errors_are_typed() {
    let form = FormModel::new(signup_schema_json(), None).unwrap();
    assert!(matches!(
        form.set_answer("nope".into(), None),
        Err(KineticError::UnknownField { .. })
    ));
    assert!(matches!(
        form.is_answered("nope".into()),
        Err(KineticError::UnknownField { .. })
    ));
    assert!(matches!(
        FormModel::new("{}".into(), None),
        Err(KineticError::InvalidSchema { .. })
    ));
}

#[test]
fn malformed_stored_json_is_ignored() {
    let storage = Arc::new(MemoryStorage(Mutex::new(Some("{not json".into()))));
    let form = FormModel::new(signup_schema_json(), Some(storage)).unwrap();
    assert_eq!(form.state().current_step, 0);
}

#[test]
fn email_helpers() {
    assert_eq!(normalize_email(" Ada@Gmail.COM ".into()), "Ada@gmail.com");
    let completions = email_domain_completions("ada@gm".into());
    assert_eq!(completions.len(), 1);
    assert_eq!(completions[0].email, "ada@gmail.com");
    assert_eq!(
        suggest_email_domain("ada@gmial.com".into()).unwrap().email,
        "ada@gmail.com"
    );
}
