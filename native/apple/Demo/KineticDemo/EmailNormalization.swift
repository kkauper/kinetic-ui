import KineticUI

extension FormStore {
    /// Cleans every email-format text answer (stray spaces, domain case) before validation.
    func normalizeEmailAnswers() {
        for field in fields {
            guard case .text(let format, _) = field.kind, format == .email else { continue }
            guard case .text(let value)? = state.answers[field.id] else { continue }
            let normalized = normalizeEmail(value: value)
            if normalized != value {
                setAnswer(field.id, normalized.isEmpty ? nil : .text(value: normalized))
            }
        }
    }
}
