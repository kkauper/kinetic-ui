package co.kauper.kineticui.demo

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import co.kauper.kineticui.compose.LocalKineticMetrics

enum class PillSize { Small, Regular, Large }

enum class PillVariant {
    /** Accent fill; the primary action of a screen. */
    Filled,

    /** Slate fill with the control outline: secondary actions (Back, Change). */
    Tonal,

    /** Outline only: optional actions (Later). */
    Outlined,
}

/**
 * The only button of the demo. M3's Button with the pill shape fixed; inputs and cards keep the
 * theme's 8 dp corners. Regular and Large follow the motion state's target size (`LocalKineticMetrics`);
 * Small is the compact pill inside lists (M3 still gives it a 48 dp touch area).
 *
 * Button does not take focus on touch, so tapping it never moves focus away from a text field
 * (and the keyboard stays open).
 */
@Composable
fun PillButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: PillSize = PillSize.Regular,
    variant: PillVariant = PillVariant.Filled,
    enabled: Boolean = true,
) {
    val metrics = LocalKineticMetrics.current
    val colors = MaterialTheme.colorScheme
    val minHeight = when (size) {
        PillSize.Small -> 32.dp
        PillSize.Regular -> metrics.targetMin
        PillSize.Large -> maxOf(metrics.targetMin, 56.dp)
    }
    val padding = when (size) {
        PillSize.Small -> PaddingValues(horizontal = 14.dp, vertical = 4.dp)
        PillSize.Regular -> PaddingValues(horizontal = 20.dp, vertical = 8.dp)
        PillSize.Large -> PaddingValues(horizontal = 28.dp, vertical = 12.dp)
    }
    val style: TextStyle = if (size == PillSize.Large) MaterialTheme.typography.titleMedium else MaterialTheme.typography.labelLarge
    val buttonColors = when (variant) {
        PillVariant.Filled -> ButtonDefaults.buttonColors(
            containerColor = colors.primary,
            contentColor = colors.onPrimary,
            disabledContainerColor = colors.onSurface.copy(alpha = 0.12f),
            disabledContentColor = colors.onSurface.copy(alpha = 0.38f),
        )
        PillVariant.Tonal -> ButtonDefaults.buttonColors(
            containerColor = colors.surface,
            contentColor = colors.onSurface,
            disabledContainerColor = Color.Transparent,
            disabledContentColor = colors.onSurface.copy(alpha = 0.38f),
        )
        PillVariant.Outlined -> ButtonDefaults.buttonColors(
            containerColor = Color.Transparent,
            contentColor = colors.primary,
            disabledContainerColor = Color.Transparent,
            disabledContentColor = colors.onSurface.copy(alpha = 0.38f),
        )
    }
    // Disabled controls are exempt from the 3:1 boundary rule: a faint outline is enough.
    val border = when (variant) {
        PillVariant.Filled -> null
        else -> BorderStroke(1.dp, if (enabled) colors.outline else colors.outlineVariant)
    }
    Button(
        onClick = onClick,
        modifier = modifier.heightIn(min = minHeight),
        enabled = enabled,
        shape = CircleShape,
        colors = buttonColors,
        elevation = null,
        border = border,
        contentPadding = padding,
    ) {
        Text(text, style = style)
    }
}

/**
 * A demo-control tag: a pill toggle ([selected] non-null, shown by a ring or check icon plus the
 * accent tint, never by color alone) or a plain pill button ([selected] null). Fixed 44 dp tall:
 * tooling does not follow the motion state.
 */
@Composable
fun PillTag(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    selected: Boolean? = null,
) {
    val colors = MaterialTheme.colorScheme
    val on = selected == true
    Surface(
        onClick = onClick,
        modifier = modifier.then(if (selected != null) Modifier.semantics { this.selected = on } else Modifier),
        shape = CircleShape,
        color = if (on) colors.secondaryContainer else colors.surface,
        contentColor = if (on) colors.onSecondaryContainer else colors.onSurface,
        border = BorderStroke(1.dp, if (on) colors.primary else colors.outline),
    ) {
        Row(
            Modifier.heightIn(min = 44.dp).padding(start = if (selected != null) 12.dp else 18.dp, end = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (selected != null) {
                TagStateIcon(
                    on = on,
                    ring = if (on) colors.onSecondaryContainer else colors.onSurface,
                    check = if (on) colors.secondaryContainer else colors.surface,
                )
            }
            Text(text, style = MaterialTheme.typography.labelLarge)
        }
    }
}
