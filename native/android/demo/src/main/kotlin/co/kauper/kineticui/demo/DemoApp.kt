package co.kauper.kineticui.demo

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.kauper.kineticui.compose.KineticMotionProvider
import co.kauper.kineticui.compose.LocalKineticMetrics
import co.kauper.kineticui.compose.LocalMotionState
import uniffi.kinetic.MotionState

const val REPO_URL = "https://github.com/kkauper/kinetic-ui"

@Composable
fun DemoApp(graph: DemoGraph) {
    KineticTheme {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            // Everything below reads the motion state from CompositionLocals, not from the store.
            KineticMotionProvider(graph.motion) { Shell(graph) }
        }
    }
}

@Composable
private fun Shell(graph: DemoGraph) {
    val state = LocalMotionState.current
    val actions = rememberSourceActions(graph)
    // Demo controls and the mode bar scroll with the content, so they give way when the keyboard is up.
    val header: @Composable () -> Unit = { ScreenHeader(graph, actions) }

    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal)),
    ) {
        TopBar()
        Box(Modifier.weight(1f)) {
            if (state == MotionState.MOVING) {
                StepperScreen(graph, header)
            } else {
                FullFormScreen(graph.form, header)
            }
        }
    }
    DebugSheet(graph, actions)
}

/** Wordmark left, GitHub pill right. */
@Composable
private fun TopBar() {
    val uriHandler = LocalUriHandler.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(LogoMark, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(24.dp))
            Text("Kinetic UI", style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
        }
        Surface(
            onClick = { uriHandler.openUri(REPO_URL) },
            shape = CircleShape,
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier.semantics { contentDescription = "Kinetic UI on GitHub (opens in browser)" },
        ) {
            Row(
                Modifier.heightIn(min = 44.dp).padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(GitHubMark, contentDescription = null, modifier = Modifier.size(18.dp))
                Text("GitHub", style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

/** Demo controls, the mode bar and the "Simplified mode is off" notice. */
@Composable
private fun ScreenHeader(graph: DemoGraph, actions: SourceActions) {
    val state = LocalMotionState.current
    val metrics = LocalKineticMetrics.current
    val showFull by graph.motion.showFullState.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        DemoControls(graph, actions)
        // Same place in both modes: the label in still mode becomes the escape hatch in moving mode.
        Row(
            Modifier.fillMaxWidth().heightIn(min = metrics.targetMin),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            if (state == MotionState.MOVING) {
                Text("Simplified", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                PillButton("Show full form", onClick = graph.motion::showFull, variant = PillVariant.Tonal)
            } else {
                Text("Full form", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (showFull.suppressed) {
            Notice(
                icon = InfoIcon,
                tint = MaterialTheme.colorScheme.primary,
                title = "Simplified mode is off for this session",
                body = null,
                actionLabel = "Turn back on",
                onAction = graph.motion::resetShowFullSession,
            )
        }
    }
}
