//! Runs the language-neutral fixtures in `packages/spec/fixtures` against the
//! Rust core. This mirrors `packages/core/src/conformance.test.ts` case for
//! case: if the two ever disagree about a fixture, one of them is wrong.
//!
//! Each fixture file is one `#[test]`. Cases do not stop at the first failure:
//! every failing case is collected and reported together.

use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

use kinetic_core::form::{
    AnswerValue, FormModel, MemoryPersistence, PersistedForm, define_schema, email_domain_completions, normalize_email,
    suggest_email_domain,
};
use kinetic_core::motion::{
    ActivityKind, CadenceEstimator, MotionConfig, MotionConfigPatch, MotionEngine, Sample, initial_machine,
    is_walking_activity, is_walking_cadence, step_machine,
};
use serde::Deserialize;
use serde_json::{Map, Value};

fn spec_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packages/spec")
}

fn load(file: &str) -> Value {
    let path = spec_dir().join("fixtures").join(file);
    let text = fs::read_to_string(&path).unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));
    let value: Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{file} is not JSON: {e}"));
    assert_eq!(value["version"], 1, "{file}: unsupported fixture version");
    value
}

fn parse<T: for<'de> Deserialize<'de>>(value: &Value) -> Vec<T> {
    serde_json::from_value(value.clone()).unwrap_or_else(|e| panic!("fixture shape: {e}"))
}

/// JSON equality that treats `5000` and `5000.0` as equal.
fn json_eq(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| json_eq(p, q)),
        (Value::Object(x), Value::Object(y)) => {
            x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| json_eq(v, w)))
        }
        _ => a == b,
    }
}

/// Every key listed in `expect` must equal the same key of `actual` (like `toMatchObject`).
fn check_subset(failures: &mut Vec<String>, case: &str, at: &str, expect: &Map<String, Value>, actual: &Value) {
    for (key, want) in expect {
        let got = actual.get(key).unwrap_or(&Value::Null);
        if !json_eq(want, got) {
            failures.push(format!("{case} [{at}]: {key}: expected {want}, got {got}"));
        }
    }
}

fn finish(file: &str, total: usize, failures: &[String]) {
    println!("{file}: {total} cases, {} failed", failures.len());
    assert!(
        failures.is_empty(),
        "{} failing in {file}:\n  {}",
        failures.len(),
        failures.join("\n  ")
    );
}

fn motion_config(patch: Option<&MotionConfigPatch>) -> MotionConfig {
    patch.map_or_else(MotionConfig::default, |p| MotionConfig::default().patched(p))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MachineCase {
    name: String,
    config: Option<MotionConfigPatch>,
    steps: Vec<MachineStep>,
}

#[derive(Deserialize)]
struct MachineStep {
    t: f64,
    walking: bool,
    expect: Option<Map<String, Value>>,
}

#[test]
fn motion_machine() {
    let cases: Vec<MachineCase> = parse(&load("motion-machine.json")["cases"]);
    let mut failures = Vec::new();
    for c in &cases {
        let config = motion_config(c.config.as_ref());
        let mut machine = initial_machine(0.0);
        for step in &c.steps {
            machine = step_machine(&machine, step.t, step.walking, &config);
            if let Some(expect) = &step.expect {
                let actual = serde_json::to_value(machine).unwrap();
                check_subset(&mut failures, &c.name, &format!("t={}", step.t), expect, &actual);
            }
        }
    }
    finish("motion-machine.json", cases.len(), &failures);
}

#[derive(Deserialize)]
struct ClassifyCase {
    name: String,
    config: Option<MotionConfigPatch>,
    input: ClassifyInput,
    walking: bool,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum ClassifyInput {
    Cadence { cadence: f64 },
    Activity { activity: ActivityKind, confidence: f64 },
}

#[test]
fn motion_classify() {
    let cases: Vec<ClassifyCase> = parse(&load("motion-classify.json")["cases"]);
    let mut failures = Vec::new();
    for c in &cases {
        let config = motion_config(c.config.as_ref());
        let walking = match c.input {
            ClassifyInput::Cadence { cadence } => is_walking_cadence(cadence, &config),
            ClassifyInput::Activity { activity, confidence } => is_walking_activity(activity, confidence, &config),
        };
        if walking != c.walking {
            failures.push(format!("{}: expected walking={}, got {walking}", c.name, c.walking));
        }
    }
    finish("motion-classify.json", cases.len(), &failures);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TraceCase {
    name: String,
    samples: Vec<[f64; 4]>,
    expect: Vec<TraceExpect>,
}

#[derive(Deserialize, Clone, Copy)]
struct TraceExpect {
    t: f64,
    cadence: f64,
    tolerance: f64,
}

#[test]
fn cadence_traces() {
    cadence_file("cadence-traces.json");
}

/// Traces recorded on real phones with the debug sheet.
#[test]
fn cadence_recorded_traces() {
    cadence_file("cadence-recorded.json");
}

fn cadence_file(file: &str) {
    let cases: Vec<TraceCase> = parse(&load(file)["cases"]);
    let config = MotionConfig::default();
    let mut failures = Vec::new();
    for c in &cases {
        let mut estimator = CadenceEstimator::new();
        let mut pending: Vec<TraceExpect> = c.expect.clone();
        pending.sort_by(|a, b| a.t.total_cmp(&b.t));
        let mut pending = pending.into_iter().peekable();
        let mut check = |e: TraceExpect, estimator: &mut CadenceEstimator| {
            let got = estimator.cadence(e.t, &config);
            if (got - e.cadence).abs() > e.tolerance {
                failures.push(format!(
                    "{}: cadence at t={}: expected {} +/- {}, got {got}",
                    c.name, e.t, e.cadence, e.tolerance
                ));
            }
        };
        for &[t, x, y, z] in &c.samples {
            estimator.push(t, x, y, z, &config);
            while let Some(e) = pending.next_if(|e| e.t <= t) {
                check(e, &mut estimator);
            }
        }
        for e in pending {
            check(e, &mut estimator);
        }
    }
    finish(file, cases.len(), &failures);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoreCase {
    name: String,
    config: Option<MotionConfigPatch>,
    #[serde(default)]
    show_full: bool,
    events: Vec<Value>,
}

#[test]
fn motion_store() {
    let cases: Vec<StoreCase> = parse(&load("motion-store.json")["cases"]);
    let mut failures = Vec::new();
    for c in &cases {
        // The fixture's store has a Show-full policy only when `showFull: true`. The
        // engine always owns one, which is inert until `show_full` is called.
        let mut engine = MotionEngine::new(motion_config(c.config.as_ref()), 0.0);
        for event in &c.events {
            let t = event["t"].as_f64().expect("event.t");
            let action = event["do"].as_str().expect("event.do");
            match action {
                "sample" => {
                    let mut sample = event["sample"].clone();
                    sample["t"] = Value::from(t);
                    engine.push_sample(serde_json::from_value::<Sample>(sample).expect("sample shape"));
                }
                "tick" => {
                    engine.tick(t);
                }
                "force" => {
                    let state = serde_json::from_value(event["state"].clone()).expect("force state");
                    engine.force(state, t);
                }
                "showFull" | "resetSession" => {
                    assert!(c.show_full, "{}: {action} needs showFull: true", c.name);
                    if action == "showFull" {
                        engine.show_full(t);
                    } else {
                        engine.reset_show_full_session(t);
                    }
                }
                other => panic!("{}: unknown event {other}", c.name),
            }
            let Some(expect) = event.get("expect").and_then(Value::as_object) else {
                continue;
            };
            let at = format!("t={t} {action}");
            let mut snapshot_expect = expect.clone();
            if let Some(show_full) = snapshot_expect.remove("showFull") {
                let actual = serde_json::to_value(engine.show_full_state()).unwrap();
                let want = show_full.as_object().expect("showFull expectation");
                if want.len() != 3 || !want.iter().all(|(k, v)| actual.get(k).is_some_and(|a| json_eq(a, v))) {
                    failures.push(format!(
                        "{} [{at}]: showFull: expected {show_full}, got {actual}",
                        c.name
                    ));
                }
            }
            let actual = serde_json::to_value(engine.snapshot()).unwrap();
            check_subset(&mut failures, &c.name, &at, &snapshot_expect, &actual);
        }
    }
    finish("motion-store.json", cases.len(), &failures);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FormCase {
    name: String,
    schema: String,
    stored: Option<PersistedForm>,
    actions: Vec<Value>,
}

#[test]
fn form() {
    let cases: Vec<FormCase> = parse(&load("form.json")["cases"]);
    let mut failures = Vec::new();
    for c in &cases {
        let schema_path = spec_dir().join("schemas").join(format!("{}.schema.json", c.schema));
        let schema = define_schema(&fs::read_to_string(schema_path).unwrap()).expect("fixture schema");
        let mut model = FormModel::with_persistence(schema, Box::new(MemoryPersistence::new(c.stored.clone())));
        for (i, action) in c.actions.iter().enumerate() {
            let name = action["do"].as_str().expect("action.do");
            let mut returned = None;
            match name {
                "setAnswer" => {
                    let value: Option<AnswerValue> = serde_json::from_value(action["value"].clone()).unwrap();
                    let id = action["id"].as_str().unwrap();
                    model.set_answer(id, value).unwrap();
                }
                "next" => returned = Some(model.next()),
                "back" => {
                    model.back();
                }
                "goTo" => {
                    model.go_to(action["step"].as_i64().unwrap());
                }
                "defer" => returned = Some(model.defer(action.get("id").and_then(Value::as_str))),
                "jumpToFirstUnanswered" => {
                    model.jump_to_first_unanswered();
                }
                "validateAll" => returned = Some(model.validate_all()),
                "reset" => {
                    model.reset();
                }
                other => panic!("{}: unknown action {other}", c.name),
            }
            let Some(want) = action.get("expect").and_then(Value::as_object) else {
                continue;
            };
            let at = format!("action {i} ({name})");
            let state = model.state();
            let mut fail = |what: &str, want: &Value, got: &Value| {
                failures.push(format!("{} [{at}]: {what}: expected {want}, got {got}", c.name));
            };
            if let Some(w) = want.get("answers") {
                let got = serde_json::to_value(&state.answers).unwrap();
                if !json_eq(w, &got) {
                    fail("answers", w, &got);
                }
            }
            if let Some(w) = want.get("currentStep") {
                let got = Value::from(state.current_step);
                if !json_eq(w, &got) {
                    fail("currentStep", w, &got);
                }
            }
            if let Some(w) = want.get("deferred") {
                let got = serde_json::to_value(&state.deferred).unwrap();
                if !json_eq(w, &got) {
                    fail("deferred", w, &got);
                }
            }
            if let Some(w) = want.get("errorIds") {
                let want_ids: BTreeSet<&str> = w.as_array().unwrap().iter().map(|v| v.as_str().unwrap()).collect();
                let got_ids: BTreeSet<&str> = state.errors.keys().map(String::as_str).collect();
                if want_ids != got_ids {
                    fail("errorIds", w, &serde_json::to_value(&got_ids).unwrap());
                }
            }
            if let Some(w) = want.get("errors") {
                let got = serde_json::to_value(&state.errors).unwrap();
                if !json_eq(w, &got) {
                    fail("errors", w, &got);
                }
            }
            if let Some(w) = want.get("returned") {
                let got = returned.map_or(Value::Null, Value::Bool);
                if !json_eq(w, &got) {
                    fail("returned", w, &got);
                }
            }
        }
    }
    finish("form.json", cases.len(), &failures);
}

#[derive(Deserialize)]
struct EmailIo<T> {
    input: String,
    output: T,
}

#[test]
fn email() {
    let fixture = load("email.json");
    let normalize: Vec<EmailIo<String>> = parse(&fixture["normalize"]);
    let completions: Vec<EmailIo<Vec<String>>> = parse(&fixture["completions"]);
    let suggestions: Vec<EmailIo<Option<String>>> = parse(&fixture["suggestions"]);
    let mut failures = Vec::new();
    for c in &normalize {
        let got = normalize_email(&c.input);
        if got != c.output {
            failures.push(format!("normalize {:?}: expected {:?}, got {got:?}", c.input, c.output));
        }
    }
    for c in &completions {
        let got: Vec<String> = email_domain_completions(&c.input)
            .into_iter()
            .map(|x| x.email)
            .collect();
        if got != c.output {
            failures.push(format!(
                "completions {:?}: expected {:?}, got {got:?}",
                c.input, c.output
            ));
        }
    }
    for c in &suggestions {
        let got = suggest_email_domain(&c.input).map(|x| x.email);
        if got != c.output {
            failures.push(format!(
                "suggestion {:?}: expected {:?}, got {got:?}",
                c.input, c.output
            ));
        }
    }
    finish(
        "email.json",
        normalize.len() + completions.len() + suggestions.len(),
        &failures,
    );
}
