package co.kauper.kineticui.demo

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.kauper.kineticui.compose.KineticMotionProvider
import co.kauper.kineticui.compose.LocalKineticMetrics
import co.kauper.kineticui.compose.LocalMotionState
import uniffi.kinetic.MotionState

@Composable
fun DemoApp(graph: DemoGraph) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) darkColorScheme() else lightColorScheme()) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            // Everything below reads the motion state from CompositionLocals, not from the store.
            KineticMotionProvider(graph.motion) { Shell(graph) }
        }
    }
}

@Composable
private fun Shell(graph: DemoGraph) {
    val state = LocalMotionState.current
    val metrics = LocalKineticMetrics.current
    val showFull by graph.motion.showFullState.collectAsStateWithLifecycle()

    Column(Modifier.fillMaxSize().statusBarsPadding().imePadding()) {
        DemoControls(graph)
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("Kinetic UI", style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
            if (state == MotionState.MOVING) {
                Button(onClick = { graph.motion.showFull() }, modifier = Modifier.heightIn(min = metrics.targetMin)) {
                    Text("Show full form")
                }
            } else {
                Text("Full form", style = MaterialTheme.typography.labelLarge)
            }
        }
        if (showFull.suppressed) {
            Surface(color = MaterialTheme.colorScheme.secondaryContainer, modifier = Modifier.fillMaxWidth()) {
                Row(
                    Modifier.padding(horizontal = 16.dp).semantics { liveRegion = LiveRegionMode.Polite },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Simplified mode is off for this session.", modifier = Modifier.weight(1f))
                    TextButton(
                        onClick = { graph.motion.resetShowFullSession() },
                        modifier = Modifier.heightIn(min = metrics.targetMin),
                    ) { Text("Turn back on") }
                }
            }
        }
        Box(Modifier.weight(1f)) {
            if (state == MotionState.MOVING) {
                StepperScreen(graph.form, onReviewFullForm = { graph.motion.showFull() })
            } else {
                FullFormScreen(graph.form, Modifier.navigationBarsPadding())
            }
        }
    }
}
