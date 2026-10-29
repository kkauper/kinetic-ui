//! Form schema types (the JSON shape of `packages/spec/schemas`) and its checks.

use std::collections::BTreeMap;
use std::fmt;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A value a user can give: text, a toggle or a slider position.
///
/// Serialises untagged (`"a"`, `true`, `3`). Whole numbers are written without
/// a fraction so the JSON equals what the TypeScript core writes.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum AnswerValue {
    /// Text or the value of a chosen option.
    Text(String),
    /// A toggle.
    Bool(bool),
    /// A slider position.
    Number(f64),
}

impl Serialize for AnswerValue {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            AnswerValue::Text(s) => serializer.serialize_str(s),
            AnswerValue::Bool(b) => serializer.serialize_bool(*b),
            // 2^53: the largest range in which every integer is exact in an f64 (and in JS).
            AnswerValue::Number(n) if n.fract() == 0.0 && n.abs() < 9_007_199_254_740_992.0 => {
                serializer.serialize_i64(*n as i64)
            }
            AnswerValue::Number(n) => serializer.serialize_f64(*n),
        }
    }
}

/// Answers by field id. Sorted, so serialised output is deterministic.
pub type Answers = BTreeMap<String, AnswerValue>;

/// How a text field is interpreted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextFormat {
    /// Validated and normalised as an email address.
    Email,
    /// Free text.
    Plain,
}

/// One option of a choice field.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChoiceOption {
    /// Stored as the answer.
    pub value: String,
    /// Shown to the user.
    pub label: String,
}

/// The kind-specific part of a field.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FieldKind {
    /// Free or email text.
    #[serde(rename_all = "camelCase")]
    Text {
        /// Interpretation of the text; plain when absent.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        format: Option<TextFormat>,
        /// HTML/OS autocomplete hint.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        autocomplete: Option<String>,
    },
    /// One of several options.
    #[serde(rename_all = "camelCase")]
    Choice {
        /// At least two options.
        options: Vec<ChoiceOption>,
    },
    /// On or off.
    Toggle,
    /// A number in `min..=max`.
    #[serde(rename_all = "camelCase")]
    Slider {
        /// Lowest value; below `max`.
        min: f64,
        /// Highest value.
        max: f64,
        /// Increment.
        step: f64,
        /// Labels for ends/steps, keyed by value.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        value_labels: Option<BTreeMap<String, String>>,
        /// Value shown before the user answers.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        default_value: Option<f64>,
    },
}

/// One question of a form.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldSchema {
    /// Unique id, the key of its answer.
    pub id: String,
    /// Question text.
    pub label: String,
    /// Optional helper text shown under the label.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    /// Must be answered before `next` succeeds.
    #[serde(default)]
    pub required: bool,
    /// May be postponed to "questions for later" in the stepper.
    #[serde(default)]
    pub deferrable: bool,
    /// What kind of question this is.
    #[serde(flatten)]
    pub kind: FieldKind,
}

/// A whole form.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormSchema {
    /// Id stored with persisted answers.
    pub id: String,
    /// Bump when fields change incompatibly; stored answers of other versions are ignored.
    pub version: u32,
    /// Heading.
    pub title: String,
    /// Questions in order.
    pub fields: Vec<FieldSchema>,
}

/// Why a schema was rejected.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SchemaError {
    /// Not JSON, or not shaped like a [`FormSchema`] (a missing title, a wrong type).
    Malformed(String),
    /// A rule of [`define_schema`] failed; the message is the one TypeScript throws.
    Invalid(String),
}

impl fmt::Display for SchemaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SchemaError::Malformed(m) => write!(f, "Malformed schema: {m}"),
            SchemaError::Invalid(m) => f.write_str(m),
        }
    }
}

impl std::error::Error for SchemaError {}

const FIELD_KINDS: [&str; 4] = ["text", "choice", "toggle", "slider"];

fn invalid<T>(message: String) -> Result<T, SchemaError> {
    Err(SchemaError::Invalid(message))
}

/// JavaScript truthiness of an optional JSON value.
fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

/// Parses and checks a schema from JSON, with the same rules and messages as
/// `defineSchema` in the TypeScript core. Stops at the first problem.
pub fn define_schema(json: &str) -> Result<FormSchema, SchemaError> {
    let value: Value = serde_json::from_str(json).map_err(|e| SchemaError::Malformed(e.to_string()))?;
    let Some(fields) = value.get("fields").and_then(Value::as_array) else {
        return invalid("Schema must be an object with a \"fields\" array.".into());
    };
    let mut seen = std::collections::HashSet::new();
    for field in fields {
        let id = match field.get("id").and_then(Value::as_str) {
            Some(id) if !id.is_empty() => id,
            _ => return invalid("Every field needs a string \"id\".".into()),
        };
        if !seen.insert(id) {
            return invalid(format!("Duplicate field id \"{id}\"."));
        }
        let kind = field.get("kind");
        let Some(kind_name) = kind.and_then(Value::as_str).filter(|k| FIELD_KINDS.contains(k)) else {
            let shown = match kind {
                None => "undefined".to_string(),
                Some(Value::String(s)) => s.clone(),
                Some(other) => other.to_string(),
            };
            return invalid(format!("Field \"{id}\" has unknown kind \"{shown}\"."));
        };
        if truthy(field.get("required")) && truthy(field.get("deferrable")) {
            return invalid(format!("Field \"{id}\" cannot be both required and deferrable."));
        }
        if kind_name == "choice"
            && field
                .get("options")
                .and_then(Value::as_array)
                .is_none_or(|o| o.len() < 2)
        {
            return invalid(format!("Choice field \"{id}\" needs at least 2 options."));
        }
        if kind_name == "slider" {
            let min = field.get("min").and_then(Value::as_f64);
            let max = field.get("max").and_then(Value::as_f64);
            if !matches!((min, max), (Some(a), Some(b)) if a < b) {
                return invalid(format!("Slider field \"{id}\" needs min < max."));
            }
        }
    }
    serde_json::from_value(value).map_err(|e| SchemaError::Malformed(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn err(json: &str) -> String {
        define_schema(json).unwrap_err().to_string()
    }

    #[test]
    fn rejects_like_define_schema_in_typescript() {
        assert_eq!(err("{}"), "Schema must be an object with a \"fields\" array.");
        assert_eq!(
            err(r#"{"fields":[{"kind":"toggle"}]}"#),
            "Every field needs a string \"id\"."
        );
        assert_eq!(
            err(r#"{"fields":[{"id":"a","kind":"toggle"},{"id":"a","kind":"toggle"}]}"#),
            "Duplicate field id \"a\"."
        );
        assert_eq!(
            err(r#"{"fields":[{"id":"a","kind":"date"}]}"#),
            "Field \"a\" has unknown kind \"date\"."
        );
        assert_eq!(
            err(r#"{"fields":[{"id":"a","kind":"toggle","required":true,"deferrable":true}]}"#),
            "Field \"a\" cannot be both required and deferrable."
        );
        assert_eq!(
            err(r#"{"fields":[{"id":"a","kind":"choice","options":[{"value":"x","label":"X"}]}]}"#),
            "Choice field \"a\" needs at least 2 options."
        );
        assert_eq!(
            err(r#"{"fields":[{"id":"a","kind":"slider","min":1,"max":1,"step":1}]}"#),
            "Slider field \"a\" needs min < max."
        );
    }

    #[test]
    fn whole_numbers_serialise_without_fraction() {
        assert_eq!(serde_json::to_string(&AnswerValue::Number(3.0)).unwrap(), "3");
        assert_eq!(serde_json::to_string(&AnswerValue::Number(0.5)).unwrap(), "0.5");
    }

    #[test]
    fn answer_values_deserialise_untagged() {
        let a: Answers = serde_json::from_str(r#"{"a":"x","b":true,"c":2}"#).unwrap();
        assert_eq!(a["a"], AnswerValue::Text("x".into()));
        assert_eq!(a["b"], AnswerValue::Bool(true));
        assert_eq!(a["c"], AnswerValue::Number(2.0));
    }
}
