package co.kauper.kineticui.demo

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.kauper.kineticui.SystemNow
import java.util.Locale
import kotlinx.coroutines.delay
import uniffi.kinetic.MotionSnapshot
import uniffi.kinetic.MotionState

private fun seconds(ms: Double) = String.format(Locale.ROOT, "%.1f", maxOf(ms, 0.0) / 1000)

/** Bottom sheet with the live readout and the tuning tools. The Debug tag and the status pill open it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DebugSheet(graph: DemoGraph, actions: SourceActions) {
    if (!graph.debugUi.isOpen) return
    ModalBottomSheet(
        onDismissRequest = graph.debugUi::close,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            Modifier
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Text("Debug", style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
            Section("Live readout") {
                Readout(graph)
                val pinned = graph.debugUi.pinned
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .toggleable(value = pinned, role = Role.Switch, onValueChange = graph.debugUi::pin),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Text("Keep readout on screen", modifier = Modifier.weight(1f))
                    Switch(checked = pinned, onCheckedChange = null, colors = kineticSwitchColors())
                }
            }
            Section("Simulator") {
                var cadence by remember { mutableFloatStateOf(graph.simulatedSource.cadence.toFloat()) }
                val label = String.format(Locale.ROOT, "%.1f", cadence)
                Text("Simulated steps: $label per second")
                Slider(
                    value = cadence,
                    onValueChange = {
                        cadence = it
                        graph.simulatedSource.cadence = it.toDouble()
                    },
                    valueRange = 0f..3f,
                    steps = 29,
                    colors = kineticSliderColors(),
                    modifier = Modifier.semantics {
                        contentDescription = "Simulated steps per second"
                        stateDescription = "$label steps per second"
                    },
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PillButton("Use simulator", onClick = { actions.useSimulator(cadence.toDouble()) }, variant = PillVariant.Tonal)
                    PillButton("Use accelerometer", onClick = actions::toggleAccelerometer, variant = PillVariant.Tonal)
                }
            }
            Section("Walking band (steps per second)") {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    BandInput(graph, isMin = true, label = "Min cadence", modifier = Modifier.weight(1f))
                    BandInput(graph, isMin = false, label = "Max cadence", modifier = Modifier.weight(1f))
                }
            }
            Section("Reset") {
                @OptIn(ExperimentalLayoutApi::class)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PillButton("Reset Show-full session", onClick = graph.motion::resetShowFullSession, variant = PillVariant.Tonal)
                    PillButton("Clear saved answers", onClick = graph.form::reset, variant = PillVariant.Outlined)
                }
            }
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        content()
    }
}

/** One cadence-band bound. Invalid input (not a number, min >= max) stays in the field but is not applied. */
@Composable
private fun BandInput(graph: DemoGraph, isMin: Boolean, label: String, modifier: Modifier = Modifier) {
    val config = graph.motion.config
    var text by remember { mutableStateOf((if (isMin) config.minCadence else config.maxCadence).toString()) }
    fun parse(input: String): Double? {
        val value = input.toDoubleOrNull()?.takeIf { it.isFinite() } ?: return null
        val c = graph.motion.config
        return if (if (isMin) value < c.maxCadence else value > c.minCadence) value else null
    }
    val invalid = parse(text) == null
    OutlinedTextField(
        value = text,
        onValueChange = { input ->
            text = input
            parse(input)?.let { value ->
                graph.motion.configure { if (isMin) it.copy(minCadence = value) else it.copy(maxCadence = value) }
            }
        },
        label = { Text(label) },
        singleLine = true,
        isError = invalid,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        colors = kineticTextFieldColors(),
        modifier = modifier,
    )
}

/**
 * Live rows of the motion store. Deliberately not a live region (it updates several times per
 * second), so a screen reader reads it on demand instead of being flooded.
 */
@Composable
private fun Readout(graph: DemoGraph) {
    val snapshot by graph.motion.snapshot.collectAsStateWithLifecycle()
    val showFull by graph.motion.showFullState.collectAsStateWithLifecycle()
    val sourceId by graph.motion.sourceId.collectAsStateWithLifecycle()
    val running by graph.motion.running.collectAsStateWithLifecycle()
    val error by graph.motion.error.collectAsStateWithLifecycle()
    val config = graph.motion.config
    val now by rememberNow(200)

    val pending = snapshot.pending
    val pendingSince = snapshot.pendingSince
    val pendingText = if (pending != null && pendingSince != null) {
        val needed = if (pending == MotionState.MOVING) config.enterMovingAfterMs else config.exitMovingAfterMs
        "${pending.name.lowercase()} ${seconds(now - pendingSince)}/${seconds(needed)} s"
    } else {
        "-"
    }
    val rows = listOf(
        "state" to snapshot.state.name.lowercase(),
        "detected" to snapshot.detected.name.lowercase(),
        "forced" to (snapshot.forced?.name?.lowercase() ?: "-"),
        "source" to "${sourceId ?: "-"}${if (running) "" else " (off)"}",
        "activity" to (snapshot.activity?.name?.lowercase() ?: "-"),
        "cadence" to "${String.format(Locale.ROOT, "%.1f", snapshot.cadence)} (${config.minCadence}-${config.maxCadence})",
        "in state" to "${seconds(now - snapshot.enteredAt)} s",
        "pending" to pendingText,
        "error" to (error ?: "-"),
        "show-full" to "${showFull.taps}${if (showFull.suppressed) " off" else ""}",
    )
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        rows.forEach { (name, value) ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(name, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.35f))
                Text(value, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(0.65f))
            }
        }
    }
}

/** The clock as state; re-renders every [periodMs]. */
@Composable
private fun rememberNow(periodMs: Long) = produceState(SystemNow.ms()) {
    while (true) {
        value = SystemNow.ms()
        delay(periodMs)
    }
}

private fun formatPill(snapshot: MotionSnapshot, now: Double): String {
    val parts = mutableListOf(
        snapshot.state.name.lowercase(),
        String.format(Locale.ROOT, "%.1f steps/s", snapshot.cadence),
        "${(maxOf(now - snapshot.enteredAt, 0.0) / 1000).toInt()} s",
    )
    val pending = snapshot.pending
    val since = snapshot.pendingSince
    if (pending != null && since != null) parts += "→ ${pending.name.lowercase()} ${seconds(now - since)} s"
    return parts.joinToString(" · ")
}

/**
 * Compact one-line status pill: opaque, in the layout (a row above the question), so it can never
 * cover content. A button that opens the debug sheet; not a live region. Errors have their own Notice.
 */
@Composable
fun PinnedReadout(graph: DemoGraph, modifier: Modifier = Modifier) {
    if (!graph.debugUi.shown || !graph.debugUi.pinned) return
    val snapshot by graph.motion.snapshot.collectAsStateWithLifecycle()
    val now by rememberNow(250)
    val colors = MaterialTheme.colorScheme
    val text = formatPill(snapshot, now)
    val moving = snapshot.state == MotionState.MOVING
    Surface(
        shape = CircleShape,
        color = colors.surface,
        contentColor = colors.onSurface,
        border = androidx.compose.foundation.BorderStroke(1.dp, colors.outline),
        onClick = graph.debugUi::open,
        modifier = modifier.semantics { contentDescription = "Debug readout: $text. Open debug" },
    ) {
        Row(
            Modifier.heightIn(min = 32.dp).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val color = colors.onSurface
            Canvas(Modifier.size(10.dp)) {
                if (moving) drawCircle(color) else drawCircle(color, radius = size.width * 0.4f, center = Offset(size.width / 2, size.height / 2), style = Stroke(2.dp.toPx()))
            }
            Text(text, style = MaterialTheme.typography.labelMedium, maxLines = 1)
        }
    }
}
