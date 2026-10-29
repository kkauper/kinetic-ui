//! The step-by-step form model: same actions and semantics as the TypeScript core.

use std::collections::BTreeMap;
use std::fmt;

use serde::Serialize;

use super::persistence::{FormPersistence, PersistedForm};
use super::schema::{AnswerValue, Answers, FieldSchema, FormSchema};
use super::validation::{is_answered, validate_all as validate_all_fields, validate_field};

/// Everything a UI needs to render the current step.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormState {
    /// Answers by field id.
    pub answers: Answers,
    /// Index into the fields for the stepper. Equal to the field count means "all done / review".
    pub current_step: usize,
    /// Field ids postponed via `defer`, in deferral order.
    pub deferred: Vec<String>,
    /// Validation errors by field id. Only set by `next` / `validate_all`, cleared by `set_answer` for that field.
    pub errors: BTreeMap<String, String>,
}

/// An action referred to a field the schema does not have.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FormError {
    /// No field with this id.
    UnknownField(String),
}

impl fmt::Display for FormError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FormError::UnknownField(id) => write!(f, "Unknown field \"{id}\"."),
        }
    }
}

impl std::error::Error for FormError {}

/// A form being filled in, one question at a time.
///
/// Return values follow the TypeScript API: `next`, `defer` and `validate_all`
/// return their outcome; `set_answer`, `back`, `go_to`, `jump_to_first_unanswered`
/// and `reset` return whether the state changed. [`revision`](Self::revision)
/// counts state changes of any action, which is what a wrapper compares to
/// decide whether to notify observers. "Changed" is judged by value.
pub struct FormModel {
    schema: FormSchema,
    persistence: Option<Box<dyn FormPersistence>>,
    state: FormState,
    revision: u64,
}

impl fmt::Debug for FormModel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("FormModel")
            .field("schema", &self.schema.id)
            .field("state", &self.state)
            .finish_non_exhaustive()
    }
}

impl FormModel {
    /// A model without persistence, at step 0.
    pub fn new(schema: FormSchema) -> Self {
        Self::build(schema, None)
    }

    /// A model that restores from, and saves answers to, `persistence`.
    /// Stored data of another schema id or version, and entries for fields the
    /// schema does not have, are dropped; the step resumes at the first
    /// question that is neither answered nor deferred.
    pub fn with_persistence(schema: FormSchema, persistence: Box<dyn FormPersistence>) -> Self {
        Self::build(schema, Some(persistence))
    }

    fn build(schema: FormSchema, persistence: Option<Box<dyn FormPersistence>>) -> Self {
        let mut model = Self {
            schema,
            persistence,
            state: FormState::default(),
            revision: 0,
        };
        model.state = model.restore();
        model
    }

    /// The schema.
    pub fn schema(&self) -> &FormSchema {
        &self.schema
    }

    /// The current state.
    pub fn state(&self) -> &FormState {
        &self.state
    }

    /// Number of state changes so far.
    pub fn revision(&self) -> u64 {
        self.revision
    }

    fn field(&self, id: &str) -> Option<&FieldSchema> {
        self.schema.fields.iter().find(|f| f.id == id)
    }

    fn require_field(&self, id: &str) -> Result<&FieldSchema, FormError> {
        self.field(id).ok_or_else(|| FormError::UnknownField(id.to_string()))
    }

    fn first_unanswered_step(&self, answers: &Answers, deferred: &[String]) -> usize {
        self.schema
            .fields
            .iter()
            .position(|f| !is_answered(f, answers.get(&f.id)) && !deferred.contains(&f.id))
            .unwrap_or(self.schema.fields.len())
    }

    fn restore(&self) -> FormState {
        let Some(stored) = self.persistence.as_ref().and_then(|p| p.load()) else {
            return FormState::default();
        };
        if stored.schema_id != self.schema.id || stored.schema_version != self.schema.version {
            return FormState::default();
        }
        let answers: Answers = stored
            .answers
            .into_iter()
            .filter(|(id, _)| self.field(id).is_some())
            .collect();
        let deferred: Vec<String> = stored
            .deferred
            .into_iter()
            .filter(|id| self.field(id).is_some_and(|f| !is_answered(f, answers.get(id))))
            .collect();
        let current_step = self.first_unanswered_step(&answers, &deferred);
        FormState {
            answers,
            current_step,
            deferred,
            errors: BTreeMap::new(),
        }
    }

    /// Replaces the state; saves when answers or deferred ids changed and `persist` is set.
    /// Returns whether anything changed.
    fn update(&mut self, next: FormState, persist: bool) -> bool {
        if next == self.state {
            return false;
        }
        let changed_data = next.answers != self.state.answers || next.deferred != self.state.deferred;
        self.state = next;
        self.revision += 1;
        if persist
            && changed_data
            && let Some(p) = &self.persistence
        {
            p.save(&PersistedForm {
                schema_id: self.schema.id.clone(),
                schema_version: self.schema.version,
                answers: self.state.answers.clone(),
                deferred: self.state.deferred.clone(),
            });
        }
        true
    }

    fn clamp_step(&self, step: i64) -> usize {
        usize::try_from(step.max(0)).map_or(0, |s| s.min(self.schema.fields.len()))
    }

    fn with_step(&self, step: i64) -> FormState {
        FormState {
            current_step: self.clamp_step(step),
            ..self.state.clone()
        }
    }

    fn step_i64(&self) -> i64 {
        i64::try_from(self.state.current_step).unwrap_or(i64::MAX)
    }

    /// Stores (or with `None`, removes) an answer and saves immediately.
    /// Clears that field's error and un-defers it once answered. Returns whether the state changed.
    pub fn set_answer(&mut self, id: &str, value: Option<AnswerValue>) -> Result<bool, FormError> {
        let field = self.require_field(id)?;
        if self.state.answers.get(id) == value.as_ref() {
            return Ok(false);
        }
        let answered = is_answered(field, value.as_ref());
        let mut next = self.state.clone();
        match value {
            Some(v) => next.answers.insert(id.to_string(), v),
            None => next.answers.remove(id),
        };
        if answered {
            next.deferred.retain(|d| d != id);
        }
        next.errors.remove(id);
        Ok(self.update(next, true))
    }

    /// Validates the current field; on success advances and returns `true`.
    /// On the review step (past the last field) it just returns `true`.
    #[allow(clippy::should_implement_trait)] // same name as the TypeScript API; not an iterator
    pub fn next(&mut self) -> bool {
        let Some(field) = self.schema.fields.get(self.state.current_step) else {
            return true;
        };
        let id = field.id.clone();
        if let Some(error) = validate_field(field, self.state.answers.get(&id)) {
            if self.state.errors.get(&id) != Some(&error) {
                let mut next = self.state.clone();
                next.errors.insert(id, error);
                self.update(next, false);
            }
            return false;
        }
        let mut next = self.with_step(self.step_i64() + 1);
        next.errors.remove(&id);
        self.update(next, false);
        true
    }

    /// One step back (clamped at 0). Returns whether the state changed.
    pub fn back(&mut self) -> bool {
        let next = self.with_step(self.step_i64() - 1);
        self.update(next, false)
    }

    /// Clamps to `0..=fields.len()`. Returns whether the state changed.
    pub fn go_to(&mut self, step: i64) -> bool {
        let next = self.with_step(step);
        self.update(next, false)
    }

    /// Postpones a deferrable field (default: the current one). Returns `false`
    /// if there is no such field or it is not deferrable.
    pub fn defer(&mut self, id: Option<&str>) -> bool {
        let field = match id {
            None => self.schema.fields.get(self.state.current_step),
            Some(id) => self.field(id),
        };
        let Some(field) = field.filter(|f| f.deferrable) else {
            return false;
        };
        let id = field.id.clone();
        let is_current = self
            .schema
            .fields
            .get(self.state.current_step)
            .is_some_and(|f| f.id == id);
        let mut next = self.state.clone();
        if !next.deferred.contains(&id) {
            next.deferred.push(id.clone());
        }
        next.errors.remove(&id);
        if is_current {
            next.current_step += 1;
        }
        self.update(next, true);
        true
    }

    /// Moves to the first field that is neither answered nor deferred, or to "done".
    pub fn jump_to_first_unanswered(&mut self) -> bool {
        let step = self.first_unanswered_step(&self.state.answers, &self.state.deferred);
        let next = self.with_step(i64::try_from(step).unwrap_or(i64::MAX));
        self.update(next, false)
    }

    /// Full-form validation; sets all errors and returns `true` if there are none.
    pub fn validate_all(&mut self) -> bool {
        let errors = validate_all_fields(&self.schema, &self.state.answers);
        let ok = errors.is_empty();
        if errors != self.state.errors {
            let next = FormState {
                errors,
                ..self.state.clone()
            };
            self.update(next, false);
        }
        ok
    }

    /// Clears answers, deferred, errors and stored data, and returns to step 0.
    pub fn reset(&mut self) -> bool {
        if let Some(p) = &self.persistence {
            p.clear();
        }
        self.update(FormState::default(), false)
    }

    /// Whether the field has an answer that counts for its kind.
    pub fn is_answered(&self, id: &str) -> Result<bool, FormError> {
        let field = self.require_field(id)?;
        Ok(is_answered(field, self.state.answers.get(id)))
    }

    /// Deferred ids that are still unanswered.
    pub fn pending_deferred(&self) -> Vec<String> {
        self.state
            .deferred
            .iter()
            .filter(|id| {
                self.field(id)
                    .is_some_and(|f| !is_answered(f, self.state.answers.get(*id)))
            })
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::form::persistence::MemoryPersistence;
    use crate::form::schema::define_schema;

    const SCHEMA: &str = r#"{"id":"t","version":1,"title":"T","fields":[
        {"id":"a","kind":"text","label":"A","required":true},
        {"id":"b","kind":"text","label":"B","deferrable":true}]}"#;

    struct Shared(std::sync::Arc<MemoryPersistence>);

    impl FormPersistence for Shared {
        fn load(&self) -> Option<PersistedForm> {
            self.0.load()
        }
        fn save(&self, d: &PersistedForm) {
            self.0.save(d);
        }
        fn clear(&self) {
            self.0.clear();
        }
    }

    fn model() -> FormModel {
        FormModel::new(define_schema(SCHEMA).unwrap())
    }

    #[test]
    fn unknown_field_is_an_error() {
        assert_eq!(
            model().set_answer("zzz", None),
            Err(FormError::UnknownField("zzz".into()))
        );
    }

    #[test]
    fn no_op_actions_do_not_change_the_revision() {
        let mut m = model();
        assert!(!m.back());
        assert!(!m.set_answer("a", None).unwrap());
        assert!(!m.next() && m.revision() == 1); // first failure sets the error
        assert!(!m.next() && m.revision() == 1); // repeating it does not
        assert!(!m.defer(Some("a")));
    }

    #[test]
    fn saves_on_answer_and_clears_on_reset() {
        let p = std::sync::Arc::new(MemoryPersistence::default());
        let mut m = FormModel::with_persistence(define_schema(SCHEMA).unwrap(), Box::new(Shared(p.clone())));
        m.set_answer("a", Some(AnswerValue::Text("x".into()))).unwrap();
        assert_eq!(p.load().unwrap().answers.len(), 1);
        m.reset();
        assert!(p.load().is_none());
    }
}
