package co.kauper.kineticui.compose

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.kauper.kineticui.MotionStore
import ui.kinetic.tokens.KineticTokens
import uniffi.kinetic.MotionSnapshot
import uniffi.kinetic.MotionState

/** The effective motion state (`state` of the snapshot: forced, else detected). */
val LocalMotionState = compositionLocalOf { MotionState.STILL }

/** The latest full snapshot, for debug UI. Prefer [LocalMotionState] for layout decisions. */
val LocalMotionSnapshot = compositionLocalOf<MotionSnapshot?> { null }

/** Sizes for the current motion state, from the shared design tokens. */
val LocalKineticMetrics = compositionLocalOf { KineticMetrics.forState(MotionState.STILL) }

/**
 * The values that change between the full and the simplified UI. They come from
 * `packages/spec` (`KineticTokens`), the same tokens that drive the web demo's CSS.
 */
data class KineticMetrics(
    /** Minimum touch target size. */
    val targetMin: Dp,
    /** Gap between related elements. */
    val gap: Dp,
    /** Gap between fields. */
    val fieldGap: Dp,
    /** Font size of the question text. */
    val fontQuestion: TextUnit,
    /** Padding around the bottom action bar. */
    val thumbZonePad: Dp,
) {
    companion object {
        fun forState(state: MotionState): KineticMetrics = when (state) {
            MotionState.STILL -> KineticMetrics(
                targetMin = KineticTokens.Still.targetMin,
                gap = KineticTokens.Still.gap,
                fieldGap = KineticTokens.Still.fieldGap,
                fontQuestion = KineticTokens.Still.fontQuestion,
                thumbZonePad = KineticTokens.Still.thumbZonePad,
            )
            MotionState.MOVING -> KineticMetrics(
                targetMin = KineticTokens.Moving.targetMin,
                gap = KineticTokens.Moving.gap,
                fieldGap = KineticTokens.Moving.fieldGap,
                fontQuestion = KineticTokens.Moving.fontQuestion,
                thumbZonePad = KineticTokens.Moving.thumbZonePad,
            )
        }
    }
}

/**
 * Collects [store] (lifecycle-aware: nothing is collected while the app is in the background) and
 * provides [LocalMotionState], [LocalMotionSnapshot] and [LocalKineticMetrics] to [content].
 */
@Composable
fun KineticMotionProvider(store: MotionStore, content: @Composable () -> Unit) {
    val snapshot by store.snapshot.collectAsStateWithLifecycle()
    val state = snapshot.state
    val metrics = remember(state) { KineticMetrics.forState(state) }
    CompositionLocalProvider(
        LocalMotionState provides state,
        LocalMotionSnapshot provides snapshot,
        LocalKineticMetrics provides metrics,
        content = content,
    )
}
