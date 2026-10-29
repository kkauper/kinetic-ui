package co.kauper.kineticui.demo

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.kauper.kineticui.FormStore
import co.kauper.kineticui.compose.LocalKineticMetrics

/** The complete form: every field, in schema order. */
@Composable
fun FullFormScreen(form: FormStore, modifier: Modifier = Modifier) {
    val state by form.state.collectAsStateWithLifecycle()
    val metrics = LocalKineticMetrics.current
    var submitted by remember { mutableStateOf(false) }
    val pending = form.pendingDeferred()
    val requesters = remember { form.fields.associate { it.id to FocusRequester() } }

    fun submit() {
        normalizeEmailAnswers(form)
        if (form.validateAll()) {
            submitted = true
            return
        }
        submitted = false
        val firstInvalid = form.fields.firstOrNull { form.state.value.errors.containsKey(it.id) }
        firstInvalid?.let { runCatching { requesters.getValue(it.id).requestFocus() } }
    }

    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = metrics.gap),
        verticalArrangement = Arrangement.spacedBy(metrics.fieldGap),
    ) {
        Text(form.title, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
        form.fields.forEach { field ->
            FieldItem(
                field = field,
                value = state.answers[field.id],
                error = state.errors[field.id],
                presentation = Presentation.Full,
                onChange = {
                    submitted = false
                    form.setAnswer(field.id, it)
                },
                focusRequester = requesters.getValue(field.id),
                labelAddon = if (field.id in pending) {
                    { AssistChip(onClick = {}, enabled = false, label = { Text("Saved for later") }) }
                } else {
                    null
                },
            )
        }
        Button(onClick = ::submit, modifier = Modifier.heightIn(min = metrics.targetMin)) { Text("Create account") }
        Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }, verticalArrangement = Arrangement.spacedBy(metrics.gap)) {
            if (submitted) {
                Text("Account created (demo: nothing was sent)", color = MaterialTheme.colorScheme.primary)
                OutlinedButton(
                    onClick = {
                        form.reset()
                        submitted = false
                    },
                    modifier = Modifier.fillMaxWidth().heightIn(min = metrics.targetMin),
                ) { Text("Start over") }
            }
        }
    }
}
