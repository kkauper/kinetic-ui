//! Field validation with the user-facing messages of the TypeScript core.

use std::collections::BTreeMap;

use super::is_js_whitespace;
use super::schema::{AnswerValue, Answers, FieldKind, FieldSchema, FormSchema, TextFormat};

/// `String.prototype.trim` semantics.
fn js_trim(s: &str) -> &str {
    s.trim_matches(is_js_whitespace)
}

/// Whether `value` counts as an answer for this field kind.
pub fn is_answered(field: &FieldSchema, value: Option<&AnswerValue>) -> bool {
    match (&field.kind, value) {
        (FieldKind::Text { .. }, Some(AnswerValue::Text(s))) => !js_trim(s).is_empty(),
        (FieldKind::Choice { .. }, Some(AnswerValue::Text(s))) => !s.is_empty(),
        (FieldKind::Toggle, Some(AnswerValue::Bool(_))) | (FieldKind::Slider { .. }, Some(AnswerValue::Number(_))) => {
            true
        }
        _ => false,
    }
}

/// Mirrors `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` without a regex engine: one `@`, no
/// whitespace, a non-empty local part, and a domain with a dot that is not its
/// first character and is followed by at least two UTF-16 code units.
fn is_email(s: &str) -> bool {
    if s.chars().any(is_js_whitespace) {
        return false;
    }
    let mut parts = s.split('@');
    let (Some(local), Some(domain), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    if local.is_empty() {
        return false;
    }
    // The first dot after at least one character leaves the longest tail to satisfy `{2,}`.
    let Some((dot, _)) = domain.char_indices().skip(1).find(|&(_, c)| c == '.') else {
        return false;
    };
    domain[dot + 1..].chars().map(char::len_utf16).sum::<usize>() >= 2
}

/// Returns a user-facing error message, or `None` if the value is acceptable.
pub fn validate_field(field: &FieldSchema, value: Option<&AnswerValue>) -> Option<String> {
    if field.required && !is_answered(field, value) {
        return Some(format!("{} is required.", field.label));
    }
    if let (
        FieldKind::Text {
            format: Some(TextFormat::Email),
            ..
        },
        Some(AnswerValue::Text(s)),
    ) = (&field.kind, value)
    {
        let trimmed = js_trim(s);
        if !trimmed.is_empty() && !is_email(trimmed) {
            return Some("Enter a valid email address, like name@example.com.".to_string());
        }
    }
    None
}

/// Validates every field; the result contains only the failing ids.
pub fn validate_all(schema: &FormSchema, answers: &Answers) -> BTreeMap<String, String> {
    schema
        .fields
        .iter()
        .filter_map(|f| validate_field(f, answers.get(&f.id)).map(|e| (f.id.clone(), e)))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_pattern_edge_cases() {
        for ok in ["a@b.co", "a@b.c.d", "a@b..cd", "a.b@sub.example.com"] {
            assert!(is_email(ok), "{ok}");
        }
        for bad in [
            "a@b",
            "a@b.c",
            "@b.com",
            "a@@b.com",
            "a@.com",
            "a@.co",
            "a b@c.com",
            "plain",
        ] {
            assert!(!is_email(bad), "{bad}");
        }
    }

    #[test]
    fn js_trim_strips_bom_but_not_nel() {
        assert_eq!(js_trim("\u{feff} x \u{85}"), "x \u{85}");
    }
}
