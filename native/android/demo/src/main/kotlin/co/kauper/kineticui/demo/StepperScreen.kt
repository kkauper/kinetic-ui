package co.kauper.kineticui.demo

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.focusable
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
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

/** Amber, for the "for later" chip (Radix amber-3 / amber-11 in dark). */
private val AmberTint = Color(0xFF302008)
private val AmberText = Color(0xFFFFCA16)

/**
 * One question at a time, built for thumbs. Everything sits in the lower part of the screen (a
 * spacer on top, then progress, question, field, and the bottom bar), so the input is right above the
 * bar and the keyboard moves nothing. The bar uses `imePadding()` and the window resizes
 * (`adjustResize`), so it always sits directly above the keyboard.
 *
 * Every step change moves focus to the step's control. Text steps share ONE text field (same
 * position in the composition, no `key(field.id)`), so focus and the keyboard survive from one
 * text step to the next. After the last question a read-only [Summary] replaces the stepper body.
 *
 * [header] (demo controls, mode bar) scrolls with the content, so it gives way when the keyboard is up.
 */
@OptIn(ExperimentalLayoutApi::class, ExperimentalFoundationApi::class)
@Composable
fun StepperScreen(graph: DemoGraph, header: @Composable () -> Unit, modifier: Modifier = Modifier) {
    val form = graph.form
    val state by form.state.collectAsStateWithLifecycle()
    val metrics = LocalKineticMetrics.current
    val fields = form.fields
    val step = state.currentStep.toInt()
    val field = fields.getOrNull(step)
    val isDone = field == null
    val pending = form.pendingDeferred()
    val answeredCount = fields.count { state.answers.containsKey(it.id) && form.isAnswered(it.id) }

    var created by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val keyboard = LocalSoftwareKeyboardController.current
    val headingFocus = remember { FocusRequester() }
    val controlFocus = remember { FocusRequester() }
    val headingBring = remember { BringIntoViewRequester() }
    val controlBring = remember { BringIntoViewRequester() }
    // The pending auto-advance; a holder, because a plain local would reset on every recomposition.
    val advanceJob = remember { arrayOfNulls<Job>(1) }
    fun cancelAdvance() {
        advanceJob[0]?.cancel()
        advanceJob[0] = null
    }

    // Entering moving mode: resume at the first question that still needs an answer.
    LaunchedEffect(Unit) { form.jumpToFirstUnanswered() }

    // New step: focus the step's control (TalkBack lands on it and reads its label; "Question n of N"
    // comes from the live region). Text steps also show the keyboard; the summary focuses its heading.
    LaunchedEffect(step, isDone, created) {
        cancelAdvance()
        val target = form.fields.getOrNull(step)
        val requester = if (target == null) headingFocus else controlFocus
        // The control may not be attached in the very first frame: try once more on the next one.
        if (!runCatching { requester.requestFocus() }.getOrDefault(false)) {
            withFrameNanos { }
            runCatching { requester.requestFocus() }
        }
        if (target?.kind is FieldKind.Text) keyboard?.show() else keyboard?.hide()
        // WCAG 2.4.11: a focused element must not be hidden. The bottom-anchored scroll pins to the end
        // when its height changes, so wait for that layout, then scroll the focus target into view
        // (on the summary: the heading, i.e. the top of the summary).
        withFrameNanos { }
        withFrameNanos { }
        runCatching { (if (target == null) headingBring else controlBring).bringIntoView() }
    }

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

    fun back() {
        cancelAdvance()
        form.back()
    }

    fun createAccount() {
        normalizeEmailAnswers(form)
        if (form.validateAll()) {
            created = true
            return
        }
        // Back to the first invalid question; the step effect focuses its field.
        val errors = form.state.value.errors
        val index = form.fields.indexOfFirst { errors.containsKey(it.id) }
        if (index >= 0) form.goTo(index)
    }

    val canDefer = field?.deferrable == true && !form.isAnswered(field.id)
    val scroll = rememberScrollState()
    // Bottom anchored: whenever the scrollable height changes (new step, keyboard), stay at the end.
    LaunchedEffect(scroll) { snapshotFlow { scroll.maxValue }.collect { scroll.scrollTo(it) } }

    Column(
        modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                // Drags that start on a text field or slider are consumed by it and never reach this detector.
                val threshold = SWIPE_BACK_DISTANCE.toPx()
                var total = 0f
                detectHorizontalDragGestures(
                    onDragStart = { total = 0f },
                    onDragCancel = { total = 0f },
                    onDragEnd = {
                        if (total > threshold && !created) back()
                        total = 0f
                    },
                    onHorizontalDrag = { _, amount -> total += amount },
                )
            },
    ) {
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(scroll)
                    .heightIn(min = maxHeight)
                    .padding(horizontal = 16.dp),
            ) {
                header()
                Spacer(Modifier.weight(1f))
                Column(
                    Modifier.padding(top = metrics.gap, bottom = metrics.gap),
                    verticalArrangement = Arrangement.spacedBy(metrics.fieldGap),
                ) {
                    FlowRow(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                        itemVerticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            when {
                                !isDone -> "Question ${step + 1} of ${fields.size}"
                                created -> "Account created"
                                else -> "Review: $answeredCount of ${fields.size} answered"
                            },
                            style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                        )
                        if (pending.isNotEmpty() && !isDone) {
                            Surface(
                                onClick = { form.goTo(fields.size) },
                                shape = CircleShape,
                                color = AmberTint,
                                contentColor = AmberText,
                                border = BorderStroke(1.dp, AmberText.copy(alpha = 0.5f)),
                            ) {
                                Text(
                                    laterLabel(pending.size),
                                    style = MaterialTheme.typography.labelLarge,
                                    modifier = Modifier.heightIn(min = 32.dp).padding(horizontal = 12.dp, vertical = 6.dp),
                                )
                            }
                        }
                        PinnedReadout(graph)
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(metrics.gap)) {
                        Text(
                            when {
                                !isDone -> field.label
                                created -> "Account created (demo — nothing was sent)"
                                else -> "Review your answers"
                            },
                            style = MaterialTheme.typography.headlineSmall.copy(fontSize = metrics.fontQuestion),
                            modifier = Modifier
                                .then(if (isDone) Modifier.bringIntoViewRequester(headingBring).focusRequester(headingFocus).focusable() else Modifier)
                                .semantics { heading() },
                        )
                        if (field != null) {
                            // No key(field.id): consecutive text steps keep this field's identity, focus and keyboard.
                            FieldItem(
                                modifier = Modifier.bringIntoViewRequester(controlBring),
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
                        } else if (created) {
                            Row {
                                PillButton(
                                    "Start over",
                                    onClick = {
                                        form.reset()
                                        form.jumpToFirstUnanswered()
                                        created = false
                                    },
                                    variant = PillVariant.Tonal,
                                )
                            }
                        } else {
                            Summary(fields, state.answers, pending, onGoTo = { form.goTo(it) })
                        }
                    }
                }
            }
        }

        if (!(isDone && created)) {
            Column(Modifier.fillMaxWidth().imePadding().navigationBarsPadding()) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                if (isDone) {
                    Column(
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = metrics.thumbZonePad),
                        verticalArrangement = Arrangement.spacedBy(metrics.gap / 2),
                    ) {
                        PillButton("Back", onClick = ::back, size = PillSize.Small, variant = PillVariant.Tonal)
                        PillButton("Create account", onClick = ::createAccount, size = PillSize.Large, modifier = Modifier.fillMaxWidth())
                    }
                } else {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = metrics.thumbZonePad),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(metrics.gap / 2),
                    ) {
                        PillButton("Back", onClick = ::back, enabled = step > 0, variant = PillVariant.Tonal)
                        Spacer(Modifier.weight(1f))
                        if (canDefer) PillButton("Later", onClick = ::later, variant = PillVariant.Outlined)
                        PillButton("Next", onClick = ::next)
                    }
                }
            }
        }
    }
}

private fun laterLabel(count: Int) = "$count ${if (count == 1) "question" else "questions"} for later"
