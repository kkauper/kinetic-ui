package co.kauper.kineticui.demo

import co.kauper.kineticui.FormStore
import uniffi.kinetic.AnswerValue
import uniffi.kinetic.FieldKind
import uniffi.kinetic.TextFormat
import uniffi.kinetic.normalizeEmail

/** Trims and lowercases the domain of every email answer. Run before validation (Next, submit). */
fun normalizeEmailAnswers(form: FormStore) {
    val answers = form.state.value.answers
    for (field in form.fields) {
        val kind = field.kind
        if (kind !is FieldKind.Text || kind.format != TextFormat.EMAIL) continue
        val value = (answers[field.id] as? AnswerValue.Text)?.value ?: continue
        val normalized = normalizeEmail(value)
        if (normalized != value) form.setAnswer(field.id, if (normalized.isEmpty()) null else AnswerValue.Text(normalized))
    }
}
