package co.kauper.kineticui.demo

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.BorderStroke
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.kauper.kineticui.ActivityTransitionSource
import co.kauper.kineticui.MotionSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import uniffi.kinetic.MotionState

/**
 * Switches the motion source. This is the only code (with the debug sheet) that touches sources.
 * Created by [rememberSourceActions] because the walking-mode permission needs an activity result launcher.
 */
@Stable
class SourceActions internal constructor(
    private val graph: DemoGraph,
    private val scope: CoroutineScope,
    private val hasPermission: () -> Boolean,
    private val requestPermission: () -> Unit,
) {
    /** A problem that did not come from the store (a denied permission). */
    var permissionMessage by mutableStateOf<String?>(null)
        internal set

    private fun useSource(source: MotionSource) {
        permissionMessage = null
        scope.launch { graph.motion.setSource(source) }
    }

    fun backToManual() {
        graph.manualSource.set(MotionState.STILL)
        useSource(graph.manualSource)
    }

    fun setSimulateWalking(on: Boolean) {
        graph.manualSource.set(if (on) MotionState.MOVING else MotionState.STILL)
        if (graph.motion.sourceId.value != graph.manualSource.id || graph.motion.error.value != null) useSource(graph.manualSource)
        permissionMessage = null
    }

    fun toggleWalkingMode() {
        when {
            graph.motion.sourceId.value == graph.transitionSource.id -> backToManual()
            hasPermission() -> useSource(graph.transitionSource)
            else -> requestPermission()
        }
    }

    internal fun walkingModeGranted() = useSource(graph.transitionSource)

    fun toggleAccelerometer() {
        if (graph.motion.sourceId.value == graph.accelerometerSource.id) backToManual() else useSource(graph.accelerometerSource)
    }

    fun useSimulator(cadence: Double) {
        graph.simulatedSource.cadence = cadence
        useSource(graph.simulatedSource)
    }
}

@Composable
fun rememberSourceActions(graph: DemoGraph): SourceActions {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val holder = remember { arrayOfNulls<SourceActions>(1) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            holder[0]?.walkingModeGranted()
        } else {
            holder[0]?.permissionMessage = "Walking mode needs the activity recognition permission."
        }
    }
    return remember(graph) {
        SourceActions(
            graph = graph,
            scope = scope,
            hasPermission = { ActivityTransitionSource.hasPermission(context) },
            requestPermission = {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    launcher.launch(Manifest.permission.ACTIVITY_RECOGNITION)
                } else {
                    holder[0]?.walkingModeGranted()
                }
            },
        ).also { holder[0] = it }
    }
}

/**
 * Stands in for input devices, as pill tags in a horizontally scrolling row. Tooling, not product
 * UI: fixed small sizes instead of the motion-dependent ones.
 */
@Composable
fun DemoControls(graph: DemoGraph, actions: SourceActions, modifier: Modifier = Modifier) {
    val motion = graph.motion
    val sourceId by motion.sourceId.collectAsStateWithLifecycle()
    val running by motion.running.collectAsStateWithLifecycle()
    val error by motion.error.collectAsStateWithLifecycle()
    val snapshot by motion.snapshot.collectAsStateWithLifecycle()
    val manualState by graph.manualSource.state.collectAsStateWithLifecycle()

    val manualOn = sourceId == graph.manualSource.id && manualState == MotionState.MOVING
    val walkingOn = sourceId == graph.transitionSource.id && running
    val status = when {
        walkingOn -> "Walking mode on: ${snapshot.activity?.name?.lowercase() ?: "waiting for the first activity"}. Detection latency varies by device."
        sourceId == graph.accelerometerSource.id && running ->
            "Accelerometer on: ${snapshot.detected.name.lowercase()}. Switches after about 5 s."
        sourceId == graph.simulatedSource.id && running ->
            "Simulated steps on: ${snapshot.detected.name.lowercase()}. Switches after about 5 s."
        else -> ""
    }

    // A dismissed notice stays dismissed until the error text changes or clears.
    val problem = actions.permissionMessage ?: error
    var dismissed by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(problem) { if (problem == null) dismissed = null }
    val notice = problem?.takeIf { it != dismissed }?.let(::noticeForError)

    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PillTag("Simulate walking", selected = manualOn, onClick = { actions.setSimulateWalking(!manualOn) })
            PillTag(if (walkingOn) "Walking mode on" else "Walking mode", selected = walkingOn, onClick = actions::toggleWalkingMode)
            // Opens the sheet: a plain button, not a toggle.
            PillTag("Debug", onClick = graph.debugUi::open)
        }
        Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
            if (status.isNotEmpty()) Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (notice != null) {
            Notice(
                icon = WarningIcon,
                tint = MaterialTheme.colorScheme.error,
                title = notice.title,
                body = notice.body,
                actionLabel = if (notice.offerSimulate) "Use Simulate walking instead" else null,
                onAction = { actions.setSimulateWalking(true) },
                onDismiss = { dismissed = problem },
                alert = true,
            )
        }
    }
}

/**
 * A notification card: icon in a tinted circle, title and body, an optional action pill and a
 * dismiss button. Errors are assertive live regions, information is polite.
 */
@Composable
fun Notice(
    icon: ImageVector,
    tint: androidx.compose.ui.graphics.Color,
    title: String,
    body: String?,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: () -> Unit = {},
    onDismiss: (() -> Unit)? = null,
    alert: Boolean = false,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .semantics { liveRegion = if (alert) LiveRegionMode.Assertive else LiveRegionMode.Polite },
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.medium,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(Modifier.padding(start = 14.dp, top = 12.dp, bottom = 12.dp, end = 4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Surface(shape = CircleShape, color = tint.copy(alpha = 0.18f), contentColor = tint, modifier = Modifier.size(32.dp)) {
                Icon(icon, contentDescription = null, modifier = Modifier.padding(7.dp))
            }
            Column(Modifier.weight(1f).padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.semantics { heading() })
                if (body != null) Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (actionLabel != null) {
                    PillButton(actionLabel, onClick = onAction, size = PillSize.Small, variant = PillVariant.Tonal, modifier = Modifier.padding(top = 6.dp))
                }
            }
            if (onDismiss != null) {
                IconButton(onClick = onDismiss) {
                    Icon(CloseIcon, contentDescription = "Dismiss", modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}
