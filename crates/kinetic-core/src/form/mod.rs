//! Step-by-step form model: schema, validation, persistence and email helpers.

pub mod email;
pub mod model;
pub mod persistence;
pub mod schema;
pub mod validation;

pub use email::{
    COMMON_EMAIL_DOMAINS, EmailCompletion, QUICK_EMAIL_DOMAINS, email_domain_completions, email_domain_completions_in,
    normalize_email, suggest_email_domain, suggest_email_domain_in,
};
pub use model::{FormError, FormModel, FormState};
pub use persistence::{FormPersistence, MemoryPersistence, PersistedForm};
pub use schema::{
    AnswerValue, Answers, ChoiceOption, FieldKind, FieldSchema, FormSchema, SchemaError, TextFormat, define_schema,
};
pub use validation::{is_answered, validate_all, validate_field};

/// JavaScript's `\s` / `String.prototype.trim` whitespace set (not Rust's
/// `char::is_whitespace`, which differs at U+0085 and U+FEFF).
pub(crate) fn is_js_whitespace(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'
    )
}
