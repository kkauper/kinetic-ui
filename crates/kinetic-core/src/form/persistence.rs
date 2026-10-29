//! Persisting answers between sessions.
//!
//! The JSON written by [`PersistedForm`] has the same shape as the TypeScript
//! core's, so an export from the web and native storage are interchangeable.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use super::schema::Answers;

/// What is stored: the answers and deferred ids of one schema version.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedForm {
    /// Id of the schema the answers belong to.
    pub schema_id: String,
    /// Version of that schema.
    pub schema_version: u32,
    /// Answers by field id. On load, entries that are not a string, bool or
    /// number (for example JSON `null`) are skipped, like unanswered fields.
    #[serde(deserialize_with = "lenient_answers")]
    pub answers: Answers,
    /// Ids postponed via `defer`, in deferral order.
    pub deferred: Vec<String>,
}

fn lenient_answers<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Answers, D::Error> {
    let raw = std::collections::BTreeMap::<String, serde_json::Value>::deserialize(d)?;
    Ok(raw
        .into_iter()
        .filter_map(|(k, v)| serde_json::from_value(v).ok().map(|v| (k, v)))
        .collect())
}

impl PersistedForm {
    /// Parses stored JSON; malformed or wrongly shaped data yields `None`
    /// (storage can be corrupted, and "nothing stored" is always safe).
    pub fn from_json(json: &str) -> Option<Self> {
        serde_json::from_str(json).ok()
    }

    /// The JSON to store.
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).expect("a PersistedForm always serialises")
    }
}

/// Where a [`FormModel`](super::FormModel) keeps its data. Implementations
/// should swallow their own I/O failures: a form still works without storage.
pub trait FormPersistence: Send + Sync {
    /// The stored data, if any.
    fn load(&self) -> Option<PersistedForm>;
    /// Stores `data`, replacing what was there.
    fn save(&self, data: &PersistedForm);
    /// Removes stored data.
    fn clear(&self);
}

/// In-memory persistence, useful for tests and as a no-storage fallback.
#[derive(Debug, Default)]
pub struct MemoryPersistence {
    stored: Mutex<Option<PersistedForm>>,
}

impl MemoryPersistence {
    /// Starts with `initial` already stored.
    pub fn new(initial: Option<PersistedForm>) -> Self {
        Self {
            stored: Mutex::new(initial),
        }
    }
}

impl FormPersistence for MemoryPersistence {
    fn load(&self) -> Option<PersistedForm> {
        self.stored
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    fn save(&self, data: &PersistedForm) {
        *self.stored.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = Some(data.clone());
    }

    fn clear(&self) {
        *self.stored.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_shape_matches_typescript() {
        let json = r#"{"schemaId":"signup","schemaVersion":1,"answers":{"email":"a@b.co","frequency":2},"deferred":["firstName"]}"#;
        let form = PersistedForm::from_json(json).unwrap();
        assert_eq!(form.to_json(), json);
    }

    #[test]
    fn null_answers_are_skipped_not_fatal() {
        let form = PersistedForm::from_json(
            r#"{"schemaId":"s","schemaVersion":1,"answers":{"a":"x","b":null,"c":[1]},"deferred":[]}"#,
        )
        .unwrap();
        assert_eq!(form.answers.len(), 1);
    }

    #[test]
    fn malformed_json_is_ignored() {
        assert!(PersistedForm::from_json("{").is_none());
        assert!(PersistedForm::from_json(r#"{"schemaId":1}"#).is_none());
    }
}
