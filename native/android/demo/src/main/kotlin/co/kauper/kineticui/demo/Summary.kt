package co.kauper.kineticui.demo

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import co.kauper.kineticui.compose.LocalKineticMetrics
import uniffi.kinetic.AnswerValue
import uniffi.kinetic.FieldKind
import uniffi.kinetic.FieldSchema

/** The answer as the user would say it; null when there is none. */
fun formatAnswer(field: FieldSchema, answers: Map<String, AnswerValue>): String? {
    val value = answers[field.id] ?: return null
    val kind = field.kind
    return when {
        value is AnswerValue.Text && value.value.isEmpty() -> null
        kind is FieldKind.Choice && value is AnswerValue.Text -> kind.options.firstOrNull { it.value == value.value }?.label ?: value.value
        value is AnswerValue.Bool -> if (value.value) "Yes" else "No"
        kind is FieldKind.Slider && value is AnswerValue.Number -> kind.valueLabels[numberKey(value.value)] ?: numberKey(value.value)
        value is AnswerValue.Text -> value.value
        value is AnswerValue.Number -> numberKey(value.value)
        else -> null
    }
}

/** "3" for 3.0, as the schema's `valueLabels` keys are written. */
fun numberKey(value: Double): String = if (value % 1.0 == 0.0) value.toLong().toString() else value.toString()

/**
 * Read-only review: deferred questions first ("Answer now"), then every other question with its
 * answer ("Not answered" muted) and a small "Change" pill that jumps to that single question.
 */
@Composable
fun Summary(
    fields: List<FieldSchema>,
    answers: Map<String, AnswerValue>,
    pending: List<String>,
    onGoTo: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val metrics = LocalKineticMetrics.current
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(metrics.gap)) {
        if (pending.isNotEmpty()) {
            Column {
                Text(
                    "Questions for later",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(bottom = 4.dp).semantics { heading() },
                )
                pending.forEach { id ->
                    val index = fields.indexOfFirst { it.id == id }
                    if (index < 0) return@forEach
                    val label = fields[index].label
                    SummaryRow(
                        action = "Answer now",
                        actionDescription = "Answer now: $label",
                        onAction = { onGoTo(index) },
                    ) {
                        Text(label, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        }
        Column(Modifier.semantics { contentDescription = "Your answers" }) {
            fields.forEachIndexed { index, field ->
                if (field.id in pending) return@forEachIndexed
                val text = formatAnswer(field, answers)
                SummaryRow(
                    action = "Change",
                    actionDescription = "Change: ${field.label}",
                    onAction = { onGoTo(index) },
                ) {
                    Text(field.label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        text ?: "Not answered",
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (text == null) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }
    }
}

@Composable
private fun SummaryRow(
    action: String,
    actionDescription: String,
    onAction: () -> Unit,
    content: @Composable () -> Unit,
) {
    Column {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(Modifier.weight(1f)) { content() }
            PillButton(
                text = action,
                onClick = onAction,
                size = PillSize.Small,
                variant = PillVariant.Tonal,
                modifier = Modifier.semantics { contentDescription = actionDescription },
            )
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}
