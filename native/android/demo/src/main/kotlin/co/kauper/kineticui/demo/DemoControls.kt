package co.kauper.kineticui.demo

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.kauper.kineticui.ActivityTransitionSource
import co.kauper.kineticui.MotionSource
import co.kauper.kineticui.SystemNow
import java.util.Locale
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import uniffi.kinetic.MotionState

/**
 * Stands in for input devices. This is tooling, not product UI: it keeps fixed small sizes instead
 * of the motion-dependent ones, and it is the only place (with the readout) that touches sources.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DemoControls(graph: DemoGraph) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val motion = graph.motion
    val sourceId by motion.sourceId.collectAsStateWithLifecycle()
    val running by motion.running.collectAsStateWithLifecycle()
    val error by motion.error.collectAsStateWithLifecycle()
    val snapshot by motion.snapshot.collectAsStateWithLifecycle()
    val manualState by graph.manualSource.state.collectAsStateWithLifecycle()
    var debug by rememberSaveable { mutableStateOf(false) }
    var permissionMessage by rememberSaveable { mutableStateOf<String?>(null) }

    fun useSource(source: MotionSource) {
        permissionMessage = null
        scope.launch { motion.setSource(source) }
    }

    fun backToManual() {
        graph.manualSource.set(MotionState.STILL)
        useSource(graph.manualSource)
    }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            useSource(graph.transitionSource)
        } else {
            permissionMessage = "Walking mode needs the activity recognition permission. Allow it, or use the accelerometer."
        }
    }

    fun toggleWalkingMode() {
        if (sourceId == graph.transitionSource.id) {
            backToManual()
        } else if (ActivityTransitionSource.hasPermission(context)) {
            useSource(graph.transitionSource)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            permissionLauncher.launch(Manifest.permission.ACTIVITY_RECOGNITION)
        }
    }

    val manualOn = sourceId == graph.manualSource.id && manualState == MotionState.MOVING
    val status = when {
        sourceId == graph.transitionSource.id && running ->
            "Walking mode on: ${snapshot.activity?.name?.lowercase() ?: "waiting for the first activity"}. Detection latency varies by device."
        sourceId == graph.accelerometerSource.id && running ->
            "Accelerometer on: ${snapshot.detected.name.lowercase()}. Switches after about 5 s."
        sourceId == graph.simulatedSource.id && running ->
            "Simulated steps on: ${snapshot.detected.name.lowercase()}. Switches after about 5 s."
        else -> ""
    }

    Surface(color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
                itemVerticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    Modifier.toggleable(
                        value = manualOn,
                        role = Role.Switch,
                        onValueChange = { on ->
                            graph.manualSource.set(if (on) MotionState.MOVING else MotionState.STILL)
                            if (sourceId != graph.manualSource.id) useSource(graph.manualSource)
                        },
                    ),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Switch(checked = manualOn, onCheckedChange = null)
                    Text("Simulate walking", style = MaterialTheme.typography.labelLarge)
                }
                OutlinedButton(onClick = ::toggleWalkingMode) {
                    Text(if (sourceId == graph.transitionSource.id) "Stop walking mode" else "Walking mode")
                }
                OutlinedButton(
                    onClick = {
                        if (sourceId == graph.accelerometerSource.id) backToManual() else useSource(graph.accelerometerSource)
                    },
                ) { Text(if (sourceId == graph.accelerometerSource.id) "Stop accelerometer" else "Use accelerometer") }
                OutlinedButton(
                    onClick = {
                        if (sourceId == graph.simulatedSource.id) backToManual() else useSource(graph.simulatedSource)
                    },
                ) { Text(if (sourceId == graph.simulatedSource.id) "Stop simulated steps" else "Simulated steps") }
                FilterChip(selected = debug, onClick = { debug = !debug }, label = { Text("Debug") })
            }
            Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
                if (status.isNotEmpty()) Text(status, style = MaterialTheme.typography.bodySmall)
            }
            val problem = permissionMessage ?: error
            if (problem != null) {
                Text(
                    problem,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                )
            }
            if (debug) DebugReadout(graph)
        }
    }
}

private fun seconds(ms: Double) = String.format(Locale.ROOT, "%.1f", maxOf(ms, 0.0) / 1000)

/**
 * Read-only live view of the motion store. Deliberately not a live region (it updates several times
 * per second). The clock tick only re-renders "time in state".
 */
@Composable
private fun DebugReadout(graph: DemoGraph) {
    val snapshot by graph.motion.snapshot.collectAsStateWithLifecycle()
    val showFull by graph.motion.showFullState.collectAsStateWithLifecycle()
    val sourceId by graph.motion.sourceId.collectAsStateWithLifecycle()
    val running by graph.motion.running.collectAsStateWithLifecycle()
    val error by graph.motion.error.collectAsStateWithLifecycle()
    val config = graph.motion.config
    val now by produceState(SystemNow.ms()) {
        while (true) {
            value = SystemNow.ms()
            delay(200)
        }
    }

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
    Column {
        rows.forEach { (name, value) ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(name, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(end = 4.dp))
                Text(value, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
