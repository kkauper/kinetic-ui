package co.kauper.kineticui.demo

import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.kauper.kineticui.FormStore
import co.kauper.kineticui.compose.LocalKineticMetrics
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import uniffi.kinetic.AnswerValue
import uniffi.kinetic.FieldKind

/** Delay so the user sees their selection before an unambiguous tap advances. */
private const val AUTO_ADVANCE_MS = 300L

/** A right swipe of at least this distance goes back. */
private val SWIPE_BACK_DISTANCE = 60.dp

/**
 * One question at a time, built for thumbs: the actions sit in a bottom bar (the thumb zone), targets
 * are large, and a step change moves focus to the question heading instead of an input, so the
 * keyboard does not pop up unasked. Moving mode removes content; it does not rearrange it.
 */
@Composable
fun StepperScreen(form: FormStore, onReviewFullForm: () -> Unit, modifier: Modifier = Modifier) {
    val state by form.state.collectAsStateWithLifecycle()
    val metrics = LocalKineticMetrics.current
    val fields = form.fields
    val step = state.currentStep.toInt()
    val field = fields.getOrNull(step)
    val isDone = field == null
    val pending = form.pendingDeferred()

    val scope = rememberCoroutineScope()
    val headingFocus = remember { FocusRequester() }
    val controlFocus = remember { FocusRequester() }
    // The pending auto-advance; a holder, because a plain local would reset on every recomposition.
    val advanceJob = remember { arrayOfNulls<Job>(1) }
    fun cancelAdvance() {
        advanceJob[0]?.cancel()
        advanceJob[0] = null
    }

    // Entering moving mode: resume at the first question that still needs an answer.
    LaunchedEffect(Unit) { form.jumpToFirstUnanswered() }
    // New step: focus the heading (TalkBack then reads the question), not the input.
    LaunchedEffect(step) { runCatching { headingFocus.requestFocus() } }

    fun next() {
        cancelAdvance()
        normalizeEmailAnswers(form)
        val current = form.fields.getOrNull(form.state.value.currentStep.toInt()) ?: return
        val kind = current.kind
        // An unanswered slider shows a value; pressing Next confirms it explicitly.
        if (kind is FieldKind.Slider && !form.isAnswered(current.id)) {
            form.setAnswer(current.id, AnswerValue.Number(kind.defaultValue ?: kind.min))
        }
        if (form.next()) form.jumpToFirstUnanswered() else runCatching { controlFocus.requestFocus() }
    }

    fun later() {
        cancelAdvance()
        if (form.defer()) form.jumpToFirstUnanswered()
    }

    val canDefer = field?.deferrable == true && !form.isAnswered(field.id)

    Scaffold(
        modifier = modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                // Drags that start on a text field or slider are consumed by it and never reach this detector.
                val threshold = SWIPE_BACK_DISTANCE.toPx()
                var total = 0f
                detectHorizontalDragGestures(
                    onDragStart = { total = 0f },
                    onDragCancel = { total = 0f },
                    onDragEnd = {
                        if (total > threshold) {
                            cancelAdvance()
                            form.back()
                        }
                        total = 0f
                    },
                    onHorizontalDrag = { _, amount -> total += amount },
                )
            },
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            Surface(tonalElevation = 3.dp) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(metrics.thumbZonePad),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(metrics.gap / 2, Alignment.End),
                ) {
                    FilledTonalButton(
                        onClick = {
                            cancelAdvance()
                            form.back()
                        },
                        enabled = step > 0,
                        modifier = Modifier.heightIn(min = metrics.targetMin),
                    ) { Text("Back") }
                    Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(metrics.gap / 2, Alignment.End)) {
                        if (!isDone) {
                            if (canDefer) {
                                OutlinedButton(onClick = ::later, modifier = Modifier.heightIn(min = metrics.targetMin)) { Text("Later") }
                            }
                            Button(onClick = ::next, modifier = Modifier.heightIn(min = metrics.targetMin)) { Text("Next") }
                        }
                    }
                }
            }
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = metrics.gap),
            verticalArrangement = Arrangement.spacedBy(metrics.fieldGap),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (isDone) "All questions visited" else "Question ${step + 1} of ${fields.size}",
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier
                        .weight(1f)
                        .semantics { liveRegion = LiveRegionMode.Polite },
                )
                if (pending.isNotEmpty()) {
                    TextButton(
                        onClick = { form.goTo(fields.size) },
                        modifier = Modifier.heightIn(min = metrics.targetMin),
                    ) { Text(laterLabel(pending.size)) }
                }
            }

            Text(
                if (isDone) "That's everything for now" else field.label,
                style = MaterialTheme.typography.headlineSmall.copy(fontSize = metrics.fontQuestion),
                modifier = Modifier
                    .focusRequester(headingFocus)
                    .focusable()
                    .semantics { heading() },
            )

            if (field != null) {
                FieldItem(
                    field = field,
                    value = state.answers[field.id],
                    error = state.errors[field.id],
                    presentation = Presentation.Step,
                    onChange = { value ->
                        form.setAnswer(field.id, value)
                        // Only unambiguous taps advance by themselves; text and slider never do.
                        if (field.kind is FieldKind.Choice || field.kind is FieldKind.Toggle) {
                            cancelAdvance()
                            advanceJob[0] = scope.launch {
                                delay(AUTO_ADVANCE_MS)
                                next()
                            }
                        }
                    },
                    focusRequester = controlFocus,
                    onImeNext = ::next,
                )
            } else {
                if (pending.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(metrics.gap / 2)) {
                        Text(
                            laterLabel(pending.size),
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.semantics { heading() },
                        )
                        pending.forEach { id ->
                            val index = fields.indexOfFirst { it.id == id }
                            FilledTonalButton(
                                onClick = { form.goTo(index) },
                                modifier = Modifier.fillMaxWidth().heightIn(min = metrics.targetMin),
                            ) { Text(fields[index].label) }
                        }
                    }
                }
                OutlinedButton(onClick = onReviewFullForm, modifier = Modifier.heightIn(min = metrics.targetMin)) {
                    Text("Review full form")
                }
            }
        }
    }
}

private fun laterLabel(count: Int) = "$count ${if (count == 1) "question" else "questions"} for later"
