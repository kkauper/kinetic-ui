package co.kauper.kineticui.demo

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Dark-only, matching the web demo (Radix slate + blue, dark). The values are the Radix steps the
 * web theme resolves to, so both demos share one palette.
 *
 * Contrast (WCAG): onPrimary is the page color, not white: #111113 on #0090ff is 5.78:1, white
 * would be 3.26:1. `outline` (slate-9) is 3.68:1 against the background, above the 3:1 that
 * non-text boundaries (text fields, unselected cards, switch track, slider track, outlined and
 * tonal buttons) need.
 */
object KineticColors {
    val Background = Color(0xFF111113) // slate-1
    val Surface = Color(0xFF212225) // slate-3
    val SurfaceHigh = Color(0xFF272A2D) // slate-4
    val OnSurface = Color(0xFFEDEEF0) // slate-12
    val OnSurfaceVariant = Color(0xFFB0B4BA) // slate-11
    val Primary = Color(0xFF0090FF) // blue-9
    val OnPrimary = Background
    val AccentTint = Color(0xFF0D2847) // blue-3
    val OnAccentTint = Color(0xFFC2E6FF) // blue-12
    val Outline = Color(0xFF696E77) // slate-9
    val OutlineVariant = Color(0xFF363A3F) // slate-6
    val Error = Color(0xFFFF9592) // red-11: text on the dark background needs >= 4.5:1
    val ErrorTint = Color(0xFF3B1219)
}

val KineticColorScheme = darkColorScheme(
    primary = KineticColors.Primary,
    onPrimary = KineticColors.OnPrimary,
    primaryContainer = KineticColors.AccentTint,
    onPrimaryContainer = KineticColors.OnAccentTint,
    secondary = KineticColors.Primary,
    onSecondary = KineticColors.OnPrimary,
    secondaryContainer = KineticColors.AccentTint,
    onSecondaryContainer = KineticColors.OnAccentTint,
    tertiary = KineticColors.Primary,
    onTertiary = KineticColors.OnPrimary,
    background = KineticColors.Background,
    onBackground = KineticColors.OnSurface,
    surface = KineticColors.Surface,
    onSurface = KineticColors.OnSurface,
    surfaceVariant = KineticColors.SurfaceHigh,
    onSurfaceVariant = KineticColors.OnSurfaceVariant,
    surfaceTint = KineticColors.Surface,
    surfaceDim = KineticColors.Background,
    surfaceBright = KineticColors.SurfaceHigh,
    surfaceContainerLowest = KineticColors.Background,
    surfaceContainerLow = KineticColors.Surface,
    surfaceContainer = KineticColors.Surface,
    surfaceContainerHigh = KineticColors.Surface,
    surfaceContainerHighest = KineticColors.SurfaceHigh,
    outline = KineticColors.Outline,
    outlineVariant = KineticColors.OutlineVariant,
    error = KineticColors.Error,
    onError = KineticColors.OnPrimary,
    errorContainer = KineticColors.ErrorTint,
    onErrorContainer = KineticColors.Error,
    scrim = Color.Black,
)

/**
 * Hanken Grotesk, bundled (res/font/hanken_grotesk.ttf, OFL, see packages/spec/brand/fonts): one
 * variable font, one entry per weight. Variable fonts need API 26+, which is the app's minSdk.
 */
val HankenGrotesk = FontFamily(
    listOf(400, 500, 600, 700).map { weight ->
        Font(
            R.font.hanken_grotesk,
            weight = FontWeight(weight),
            variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
        )
    },
)

private fun TextStyle.hanken() = copy(fontFamily = HankenGrotesk)

private fun Typography.withHanken() = copy(
    displayLarge = displayLarge.hanken(),
    displayMedium = displayMedium.hanken(),
    displaySmall = displaySmall.hanken(),
    headlineLarge = headlineLarge.hanken(),
    headlineMedium = headlineMedium.hanken(),
    headlineSmall = headlineSmall.hanken(),
    titleLarge = titleLarge.hanken(),
    titleMedium = titleMedium.hanken(),
    titleSmall = titleSmall.hanken(),
    bodyLarge = bodyLarge.hanken(),
    bodyMedium = bodyMedium.hanken(),
    bodySmall = bodySmall.hanken(),
    labelLarge = labelLarge.hanken(),
    labelMedium = labelMedium.hanken(),
    labelSmall = labelSmall.hanken(),
)

/** Inputs and cards keep 8 dp corners; every button is a pill (see [PillButton]). */
val KineticShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(8.dp),
    large = RoundedCornerShape(8.dp),
    extraLarge = RoundedCornerShape(8.dp),
)

@Composable
fun KineticTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = KineticColorScheme,
        typography = Typography().withHanken(),
        shapes = KineticShapes,
        content = content,
    )
}

/** Switch whose off track is the control outline (3:1 against the background). */
@Composable
fun kineticSwitchColors() = androidx.compose.material3.SwitchDefaults.colors(
    checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
    checkedTrackColor = MaterialTheme.colorScheme.primary,
    checkedBorderColor = MaterialTheme.colorScheme.primary,
    uncheckedThumbColor = MaterialTheme.colorScheme.onSurface,
    uncheckedTrackColor = MaterialTheme.colorScheme.outline,
    uncheckedBorderColor = MaterialTheme.colorScheme.outline,
)

/** Slider whose inactive track is the control outline. */
@Composable
fun kineticSliderColors() = androidx.compose.material3.SliderDefaults.colors(
    thumbColor = MaterialTheme.colorScheme.primary,
    activeTrackColor = MaterialTheme.colorScheme.primary,
    inactiveTrackColor = MaterialTheme.colorScheme.outline,
    activeTickColor = MaterialTheme.colorScheme.onPrimary,
    inactiveTickColor = MaterialTheme.colorScheme.background,
)

/** Text field colors: the outline is the control boundary (3:1), the focused one is the accent. */
@Composable
fun kineticTextFieldColors() = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
    unfocusedBorderColor = MaterialTheme.colorScheme.outline,
    focusedBorderColor = MaterialTheme.colorScheme.primary,
    unfocusedLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
    unfocusedContainerColor = MaterialTheme.colorScheme.background,
    focusedContainerColor = MaterialTheme.colorScheme.background,
    errorContainerColor = MaterialTheme.colorScheme.background,
)
