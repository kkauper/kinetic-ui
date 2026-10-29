//! Email helpers: whitespace cleanup, one-tap domain completions and typo suggestions.

use super::is_js_whitespace;

/// Domains offered as one-tap chips while typing an address.
pub const QUICK_EMAIL_DOMAINS: &[&str] = &["gmail.com", "icloud.com", "outlook.com"];

/// Domains used to spot typos like "gmial.com".
pub const COMMON_EMAIL_DOMAINS: &[&str] = &[
    "gmail.com",
    "icloud.com",
    "outlook.com",
    "hotmail.com",
    "yahoo.com",
    "me.com",
    "live.com",
    "gmx.de",
    "web.de",
    "proton.me",
];

/// A full address built from the typed local part and a known domain.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EmailCompletion {
    /// The domain, e.g. `gmail.com`.
    pub domain: String,
    /// The completed address, e.g. `ada@gmail.com`.
    pub email: String,
}

/// Removes all whitespace (emails cannot contain any, e.g. a space autocorrect
/// inserted after "@") and lowercases the domain; the local part keeps its case.
pub fn normalize_email(value: &str) -> String {
    let compact: String = value.chars().filter(|&c| !is_js_whitespace(c)).collect();
    match compact.rfind('@') {
        None => compact,
        Some(at) => format!("{}{}", &compact[..=at], compact[at + 1..].to_lowercase()),
    }
}

/// [`email_domain_completions_in`] with [`QUICK_EMAIL_DOMAINS`].
pub fn email_domain_completions(value: &str) -> Vec<EmailCompletion> {
    email_domain_completions_in(value, QUICK_EMAIL_DOMAINS)
}

/// Domains that could finish what the user typed: all of them before an "@",
/// the ones starting with the typed fragment after it (never an exact match).
pub fn email_domain_completions_in(value: &str, domains: &[&str]) -> Vec<EmailCompletion> {
    let text = normalize_email(value);
    let at = text.find('@');
    let local = at.map_or(text.as_str(), |i| &text[..i]);
    if local.is_empty() {
        return Vec::new();
    }
    let fragment = at.map_or("", |i| &text[i + 1..]);
    domains
        .iter()
        .filter(|d| d.starts_with(fragment) && **d != fragment)
        .map(|d| EmailCompletion {
            domain: (*d).to_string(),
            email: format!("{local}@{d}"),
        })
        .collect()
}

/// Edit distance (optimal string alignment, i.e. restricted Damerau-Levenshtein)
/// where swapping two adjacent characters counts as one edit. Works on UTF-16
/// code units like the TypeScript original.
fn edit_distance(a: &str, b: &str) -> usize {
    let a: Vec<u16> = a.encode_utf16().collect();
    let b: Vec<u16> = b.encode_utf16().collect();
    let mut d = vec![vec![0usize; b.len() + 1]; a.len() + 1];
    for (i, row) in d.iter_mut().enumerate() {
        row[0] = i;
    }
    for (j, cell) in d[0].iter_mut().enumerate() {
        *cell = j;
    }
    for i in 1..=a.len() {
        for j in 1..=b.len() {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            let mut best = (d[i - 1][j] + 1).min(d[i][j - 1] + 1).min(d[i - 1][j - 1] + cost);
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                best = best.min(d[i - 2][j - 2] + 1);
            }
            d[i][j] = best;
        }
    }
    d[a.len()][b.len()]
}

/// [`suggest_email_domain_in`] with [`COMMON_EMAIL_DOMAINS`].
pub fn suggest_email_domain(value: &str) -> Option<EmailCompletion> {
    suggest_email_domain_in(value, COMMON_EMAIL_DOMAINS)
}

/// Suggests a known domain for a probable typo (distance <= 2). Only for
/// complete-looking domains (containing a dot) that are not already known;
/// ties go to the first domain in the list.
pub fn suggest_email_domain_in(value: &str, domains: &[&str]) -> Option<EmailCompletion> {
    let text = normalize_email(value);
    let at = text.rfind('@').filter(|&i| i >= 1)?;
    let domain = &text[at + 1..];
    if !domain.contains('.') || domains.contains(&domain) {
        return None;
    }
    let mut best: Option<(&str, usize)> = None;
    for candidate in domains {
        let distance = edit_distance(domain, candidate);
        if distance <= 2 && best.is_none_or(|(_, d)| distance < d) {
            best = Some((candidate, distance));
        }
    }
    best.map(|(d, _)| EmailCompletion {
        domain: d.to_string(),
        email: format!("{}@{d}", &text[..at]),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transposition_costs_one_edit() {
        assert_eq!(edit_distance("gmial.com", "gmail.com"), 1);
        assert_eq!(edit_distance("ca", "abc"), 3); // OSA, not full Damerau-Levenshtein (which gives 2)
    }

    #[test]
    fn ties_go_to_the_first_domain() {
        let s = suggest_email_domain_in("a@xx.com", &["ab.com", "ac.com"]).unwrap();
        assert_eq!(s.domain, "ab.com");
    }
}
