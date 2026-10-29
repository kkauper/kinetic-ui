package co.kauper.kineticui.demo

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import co.kauper.kineticui.compose.LocalKineticMetrics
import co.kauper.kineticui.compose.LocalMotionState
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import ui.kinetic.tokens.KineticTokens
import uniffi.kinetic.AnswerValue
import uniffi.kinetic.EmailCompletion
import uniffi.kinetic.FieldKind
import uniffi.kinetic.FieldSchema
import uniffi.kinetic.MotionState
import uniffi.kinetic.TextFormat
import uniffi.kinetic.emailDomainCompletions
import uniffi.kinetic.suggestEmailDomain

/** Where a field is shown: in the complete form, or alone in the stepper. */
enum class Presentation { Full, Step }

/** The typo suggestion appears after a pause in typing, or immediately when the field loses focus. */
private const val SUGGEST_DELAY_MS = 500L

/**
 * One question, rendered by kind. Shared by the full form and the stepper; only [presentation]
 * differs. In the stepper the visible question is the step heading, so the label is not repeated.
 * Sizes come from `LocalKineticMetrics` and so follow the motion state.
 *
 * [focusRequester] points at the main control, so the screen can move focus to it (first invalid
 * field, a failed Next).
 */
@Composable
fun FieldItem(
    field: FieldSchema,
    value: AnswerValue?,
    error: String?,
    presentation: Presentation,
    onChange: (AnswerValue?) -> Unit,
    focusRequester: FocusRequester,
    modifier: Modifier = Modifier,
    onImeNext: (() -> Unit)? = null,
    labelAddon: (@Composable () -> Unit)? = null,
    savedForLater: Boolean = false,
) {
    val metrics = LocalKineticMetrics.current
    val kind = field.kind
    val accent = MaterialTheme.colorScheme.primary
    Column(
        modifier.savedForLaterBar(savedForLater, accent),
        verticalArrangement = Arrangement.spacedBy(metrics.gap / 2),
    ) {
        if (labelAddon != null) labelAddon()
        // Text fields and the full-form switch carry their own label.
        val ownsLabel = kind is FieldKind.Text || (kind is FieldKind.Toggle && presentation == Presentation.Full)
        if (presentation == Presentation.Full && !ownsLabel) {
            Text(field.label, style = MaterialTheme.typography.titleMedium)
        }
        field.hint?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }

        when (kind) {
            is FieldKind.Text -> TextInput(field, kind, value, error, onChange, focusRequester, onImeNext)
            is FieldKind.Choice -> OptionCards(
                options = kind.options.map { it.value to it.label },
                selected = (value as? AnswerValue.Text)?.value,
                groupLabel = field.label,
                focusRequester = focusRequester,
                onSelect = { onChange(AnswerValue.Text(it)) },
            )
            is FieldKind.Toggle -> ToggleInput(field, value, presentation, onChange, focusRequester)
            is FieldKind.Slider -> SliderInput(field, kind, value, presentation, onChange, focusRequester)
        }

        // The text field shows its own error as supporting text.
        if (error != null && kind !is FieldKind.Text) {
            Text(
                error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
    }
}

@OptIn(ExperimentalComposeUiApi::class, ExperimentalLayoutApi::class)
@Composable
private fun TextInput(
    field: FieldSchema,
    kind: FieldKind.Text,
    value: AnswerValue?,
    error: String?,
    onChange: (AnswerValue?) -> Unit,
    focusRequester: FocusRequester,
    onImeNext: (() -> Unit)?,
) {
    val metrics = LocalKineticMetrics.current
    val text = (value as? AnswerValue.Text)?.value ?: ""
    val isEmail = kind.format == TextFormat.EMAIL
    fun set(next: String) = onChange(if (next.isEmpty()) null else AnswerValue.Text(next))

    // Typo suggestion: only once typing has paused (or on blur), never while the user is mid-word.
    var settled by remember { mutableStateOf(text) }
    LaunchedEffect(text) {
        delay(SUGGEST_DELAY_MS)
        settled = text
    }
    var hadFocus by remember(field.id) { mutableStateOf(false) }

    val keyboardOptions = if (isEmail) {
        KeyboardOptions(
            keyboardType = KeyboardType.Email,
            autoCorrectEnabled = false,
            capitalization = KeyboardCapitalization.None,
            imeAction = ImeAction.Next,
        )
    } else {
        KeyboardOptions(
            capitalization = if (kind.autocomplete == "given-name") KeyboardCapitalization.Words else KeyboardCapitalization.Sentences,
            imeAction = ImeAction.Next,
        )
    }

    OutlinedTextField(
        value = text,
        onValueChange = ::set,
        label = { Text(field.label) },
        singleLine = true,
        colors = kineticTextFieldColors(),
        isError = error != null,
        supportingText = error?.let { message -> { Text(message) } },
        keyboardOptions = keyboardOptions,
        keyboardActions = if (onImeNext != null) KeyboardActions(onNext = { onImeNext() }) else KeyboardActions.Default,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = metrics.targetMin)
            .focusRequester(focusRequester)
            .onFocusChanged { focus ->
                if (focus.isFocused) {
                    hadFocus = true
                } else if (hadFocus && isEmail) {
                    val normalized = uniffi.kinetic.normalizeEmail(text)
                    if (normalized != text) set(normalized)
                    settled = normalized
                }
            }
            .semantics { contentTypeFor(kind.autocomplete)?.let { contentType = it } },
    )

    if (isEmail) {
        val completions = emailDomainCompletions(text)
        if (completions.isNotEmpty()) {
            // Buttons do not take focus on touch, so the field keeps focus and the keyboard stays open.
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                completions.forEach { completion ->
                    PillButton(
                        text = "@${completion.domain}",
                        onClick = { set(completion.email) },
                        size = PillSize.Small,
                        variant = PillVariant.Tonal,
                        modifier = Modifier.semantics { contentDescription = "Complete email address with @${completion.domain}" },
                    )
                }
            }
        }
        val suggestion: EmailCompletion? = if (settled == text) suggestEmailDomain(text) else null
        // Announced politely when it appears; it never blocks submitting.
        Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (suggestion != null) {
                Text("Did you mean ${suggestion.email}?")
                Row {
                    PillButton("Use ${suggestion.domain}", onClick = { set(suggestion.email) }, variant = PillVariant.Tonal)
                }
            }
        }
    }
}

@OptIn(ExperimentalComposeUiApi::class)
private fun contentTypeFor(autocomplete: String?): ContentType? = when (autocomplete) {
    "email" -> ContentType.EmailAddress
    "given-name" -> ContentType.PersonFirstName
    else -> null
}

/**
 * Large selectable cards, one radio group: a choice field, or Yes/No for a toggle in the stepper.
 * `selectable(role = RadioButton)` inside `selectableGroup()` is what TalkBack needs to announce
 * "1 of 4" and to treat the cards as one control.
 */
@Composable
private fun OptionCards(
    options: List<Pair<String, String>>,
    selected: String?,
    groupLabel: String,
    focusRequester: FocusRequester,
    onSelect: (String) -> Unit,
) {
    val metrics = LocalKineticMetrics.current
    val colors = MaterialTheme.colorScheme
    // Focus goes to the chosen card, or the first one when nothing is chosen yet.
    val focusIndex = options.indexOfFirst { it.first == selected }.coerceAtLeast(0)
    Column(
        Modifier
            .fillMaxWidth()
            .selectableGroup()
            .semantics { contentDescription = groupLabel },
        verticalArrangement = Arrangement.spacedBy(metrics.gap / 2),
    ) {
        options.forEachIndexed { index, (value, label) ->
            val isSelected = value == selected
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = if (isSelected) colors.secondaryContainer else colors.surface,
                // Unselected: the control outline (3:1). Selected: accent border and a check, never color alone.
                border = BorderStroke(if (isSelected) 2.dp else 1.dp, if (isSelected) colors.primary else colors.outline),
            ) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        // focusable(): clickable items are not focus targets in touch mode, but the step must be able to move focus here.
                        .then(if (index == focusIndex) Modifier.focusRequester(focusRequester).focusable() else Modifier)
                        .selectable(selected = isSelected, onClick = { onSelect(value) }, role = Role.RadioButton)
                        .heightIn(min = metrics.targetMin)
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                    if (isSelected) {
                        Spacer(Modifier.width(12.dp))
                        Icon(CheckIcon, contentDescription = null, tint = colors.primary, modifier = Modifier.size(24.dp))
                    }
                }
            }
        }
    }
}

/**
 * Full form: a Switch. Stepper: a Yes/No pair, because a tiny switch that auto-advances on tap is
 * ambiguous (did the user mean to flip it back?). The stored value is a boolean either way.
 */
@Composable
private fun ToggleInput(
    field: FieldSchema,
    value: AnswerValue?,
    presentation: Presentation,
    onChange: (AnswerValue?) -> Unit,
    focusRequester: FocusRequester,
) {
    val metrics = LocalKineticMetrics.current
    val checked = (value as? AnswerValue.Bool)?.value
    if (presentation == Presentation.Step) {
        OptionCards(
            options = listOf("yes" to "Yes", "no" to "No"),
            selected = checked?.let { if (it) "yes" else "no" },
            groupLabel = field.label,
            focusRequester = focusRequester,
            onSelect = { onChange(AnswerValue.Bool(it == "yes")) },
        )
    } else {
        Row(
            Modifier
                .fillMaxWidth()
                .focusRequester(focusRequester)
                .focusable()
                .toggleable(value = checked == true, role = Role.Switch, onValueChange = { onChange(AnswerValue.Bool(it)) })
                .heightIn(min = metrics.targetMin),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(field.label, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            Switch(checked = checked == true, onCheckedChange = null, colors = kineticSwitchColors())
        }
    }
}

/**
 * A slider with named positions. Until the user touches it, the default is only displayed, not
 * stored: pressing Next in the stepper confirms it (otherwise the minimum could not be chosen).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SliderInput(
    field: FieldSchema,
    kind: FieldKind.Slider,
    value: AnswerValue?,
    presentation: Presentation,
    onChange: (AnswerValue?) -> Unit,
    focusRequester: FocusRequester,
) {
    val metrics = LocalKineticMetrics.current
    val moving = LocalMotionState.current == MotionState.MOVING
    val answered = value is AnswerValue.Number
    val shown = (value as? AnswerValue.Number)?.value ?: (kind.defaultValue ?: kind.min)
    val key = if (shown % 1.0 == 0.0) shown.toLong().toString() else shown.toString()
    val valueLabel = kind.valueLabels[key] ?: key
    val steps = (((kind.max - kind.min) / kind.step).roundToInt() - 1).coerceAtLeast(0)
    val thumb = if (moving) KineticTokens.Moving.sliderThumb else 20.dp
    val interaction = remember { MutableInteractionSource() }

    // The visible label repeats what the slider announces, so it is hidden from accessibility.
    Text(
        text = valueLabel + if (answered) "" else if (presentation == Presentation.Step) " (press Next to confirm)" else " (not set yet)",
        style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.clearAndSetSemantics {},
    )
    Slider(
        value = shown.toFloat(),
        onValueChange = { onChange(AnswerValue.Number(it.toDouble())) },
        valueRange = kind.min.toFloat()..kind.max.toFloat(),
        steps = steps,
        colors = kineticSliderColors(),
        interactionSource = interaction,
        thumb = { SliderDefaults.Thumb(interactionSource = interaction, colors = kineticSliderColors(), thumbSize = DpSize(thumb, thumb)) },
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = metrics.targetMin)
            .focusRequester(focusRequester)
            .focusable()
            .semantics {
                contentDescription = field.label
                stateDescription = if (answered) valueLabel else "$valueLabel, not set yet"
            },
    )
}

/** "Saved for later" marker: a 3 dp accent bar in the start margin, outside the content edge, so nothing shifts. */
private fun Modifier.savedForLaterBar(on: Boolean, color: Color): Modifier =
    if (!on) this else drawBehind {
        val width = 3.dp.toPx()
        val x = if (layoutDirection == LayoutDirection.Ltr) -12.dp.toPx() else size.width + 12.dp.toPx() - width
        drawRoundRect(color, topLeft = Offset(x, 0f), size = Size(width, size.height), cornerRadius = CornerRadius(2.dp.toPx()))
    }

/** The text half of the marker (the bar alone would be color only). */
@Composable
fun SavedForLaterBadge() {
    Surface(shape = CircleShape, color = MaterialTheme.colorScheme.secondaryContainer, contentColor = MaterialTheme.colorScheme.onSecondaryContainer) {
        Text("Saved for later", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 10.dp, vertical = 2.dp))
    }
}
