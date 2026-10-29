package co.kauper.kineticui.demo

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * The gyroscope from packages/spec/brand/logo.svg on its 24-unit grid, stroke 1.5 at 24 dp (the
 * launcher icon is the same geometry scaled x3). Tint it with `Icon(tint = ...)`.
 */
val LogoMark: ImageVector = ImageVector.Builder(
    name = "KineticLogo",
    defaultWidth = 24.dp,
    defaultHeight = 24.dp,
    viewportWidth = 24f,
    viewportHeight = 24f,
).apply {
    listOf(
        "M4.5,12a7.5,7.5 0 1,0 15,0a7.5,7.5 0 1,0 -15,0",
        "M2,12A10,3.6 0 0 1 22,12",
        "M22,12A10,3.6 0 0 1 2,12",
        "M12,2V13M12,18.2V22",
    ).forEach { data ->
        addPath(
            pathData = addPathNodes(data),
            stroke = SolidColor(Color.Black),
            strokeLineWidth = 1.5f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        )
    }
}.build()

private fun strokeIcon(name: String, width: Float, vararg paths: String): ImageVector =
    ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
        paths.forEach { data ->
            addPath(
                pathData = addPathNodes(data),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = width,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
    }.build()

/** The same small icons as the web demo (24-unit grid, stroked); no icon library needed. */
val CheckIcon: ImageVector = strokeIcon("Check", 2.4f, "M5,12.5l4.5,4.5L19,7")
val CloseIcon: ImageVector = strokeIcon("Close", 2.4f, "M6,6l12,12M18,6L6,18")
val WarningIcon: ImageVector = strokeIcon("Warning", 2f, "M12,3L2.5,20h19L12,3Z", "M12,10v4.5M12,17.5v0.01")
val InfoIcon: ImageVector = strokeIcon("Info", 2f, "M12,2.5a9.5,9.5 0 1,0 0.001,0Z", "M12,11v5.5M12,7.5v0.01")

/** GitHub mark (16-unit grid, filled), the same path as the web header. */
val GitHubMark: ImageVector = ImageVector.Builder(
    name = "GitHub",
    defaultWidth = 18.dp,
    defaultHeight = 18.dp,
    viewportWidth = 16f,
    viewportHeight = 16f,
).apply {
    addPath(
        pathData = addPathNodes(
            "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z",
        ),
        fill = SolidColor(Color.Black),
    )
}.build()

/**
 * Hollow ring when off, filled disc with a check when on: the state is never conveyed by color alone.
 */
@Composable
fun TagStateIcon(on: Boolean, ring: Color, check: Color, modifier: Modifier = Modifier) {
    Canvas(modifier.size(18.dp)) {
        val s = size.width / 24f
        if (on) {
            drawCircle(ring, radius = 10f * s)
            val tick = androidx.compose.ui.graphics.Path().apply {
                moveTo(7.5f * s, 12.5f * s)
                lineTo(10.5f * s, 15.5f * s)
                lineTo(16.5f * s, 9f * s)
            }
            drawPath(tick, check, style = Stroke(width = 2.6f * s, cap = StrokeCap.Round, join = StrokeJoin.Round))
        } else {
            drawCircle(ring, radius = 9f * s, center = Offset(12f * s, 12f * s), style = Stroke(width = 2f * s))
        }
    }
}
