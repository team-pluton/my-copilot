package app.commadrive.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.commadrive.app.R

/**
 * Pleos 디자인 토큰 — 웹 시연 `src/app/globals.css` 의 `--p-*` 와 같은 값 (research/PLEOS_PLATFORM.md 7절).
 *
 * 공식 치수는 Connect-S 17"(160DPI, 1dp = 1px) 기준 px 이다. 세로 앱 창 840dp 에서 그 값을 그대로 쓰고,
 * 창이 좁으면(14.6"·12.9"·폰) 같은 비율로 줄인다 — 웹의 `--u` 와 같은 생각이다. 고정 dp 를 쓰면 작은 창에서
 * 글자보다 여백이 커져 공식 비율이 무너진다.
 */
@Immutable
data class PleosColors(
    val bg: Color, val bg2: Color, val popup: Color,
    val surface: Color, val surfaceLow: Color, val surfaceHigh: Color, val surfaceAccent: Color,
    val text: Color, val text2: Color, val text3: Color, val text4: Color,
    val btn: Color, val btnPressed: Color, val filled: Color, val filledText: Color,
    val positive: Color, val negative: Color, val active: Color, val charging: Color, val auto: Color,
    val line: Color,
    /** 공식 경고색이 없다 — 웹 시연과 같은 우리 값 */
    val warn: Color,
    val dark: Boolean,
)

private val white = Color(0xFFFFFFFF)
private val ink = Color(0xFF131417)

val DarkColors = PleosColors(
    bg = Color(0xFF1D1E21), bg2 = Color(0xFF131417), popup = Color(0xFF313236),
    surface = Color(0xFF1D1E21), surfaceLow = Color(0xFF131417), surfaceHigh = Color(0xFF313236), surfaceAccent = Color(0xFF44464E),
    text = white, text2 = white.copy(alpha = 0.84f), text3 = white.copy(alpha = 0.64f), text4 = white.copy(alpha = 0.32f),
    btn = Color(0xFF313236), btnPressed = Color(0xFF44464E), filled = Color(0xFFE0E1E6), filledText = ink,
    positive = Color(0xFF0082FF), negative = Color(0xFFFF4C28), active = Color(0xFF00E074), charging = Color(0xFF00DB25), auto = Color(0xFF6A57FF),
    line = white.copy(alpha = 0.1f), warn = Color(0xFFF5B83D), dark = true,
)

val LightColors = PleosColors(
    bg = Color(0xFFF7F8FA), bg2 = white, popup = white,
    surface = white, surfaceLow = Color(0xFFF7F8FA), surfaceHigh = Color(0xFFEDEEF2), surfaceAccent = Color(0xFFE0E1E6),
    text = ink, text2 = ink.copy(alpha = 0.84f), text3 = ink.copy(alpha = 0.64f), text4 = ink.copy(alpha = 0.32f),
    btn = Color(0xFFEDEEF2), btnPressed = Color(0xFFE0E1E6), filled = Color(0xFF44464E), filledText = white,
    positive = Color(0xFF0064FF), negative = Color(0xFFFE3D16), active = Color(0xFF02C265), charging = Color(0xFF00DB25), auto = Color(0xFF5A46FA),
    line = ink.copy(alpha = 0.1f), warn = Color(0xFFB7791F), dark = false,
)

/** car-px → dp 배율. 세로 840 / 가로 1700 창에서 1 */
val LocalU = staticCompositionLocalOf { 1f }
val LocalP = staticCompositionLocalOf { DarkColors }

@Composable @ReadOnlyComposable
fun px(n: Number): Dp = (n.toFloat() * LocalU.current).dp

@Composable @ReadOnlyComposable
fun fs(n: Number): TextUnit = (n.toFloat() * LocalU.current).sp

@OptIn(ExperimentalTextApi::class)
private fun asta(weight: Int) = Font(
    R.font.asta_sans,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

/** Asta Sans — Pleos 공식 서체(OFL). 가변 폰트 하나에서 굵기를 뽑는다 */
val Asta = FontFamily(asta(400), asta(600), asta(700), asta(800))

/** 공식 타이포 계층 (2560 기준 px / 행간) — globals.css .t-* 와 같은 값 */
object T {
    @Composable @ReadOnlyComposable private fun s(size: Int, line: Int, weight: Int, tracking: Float = 0f) =
        TextStyle(fontFamily = Asta, fontSize = fs(size), lineHeight = fs(line), fontWeight = FontWeight(weight), letterSpacing = tracking.em, color = LocalP.current.text)

    val headlineM @Composable @ReadOnlyComposable get() = s(56, 72, 800, -0.01f)
    val headlineS @Composable @ReadOnlyComposable get() = s(48, 64, 700, -0.01f)
    val titleL @Composable @ReadOnlyComposable get() = s(40, 52, 700)
    val titleM @Composable @ReadOnlyComposable get() = s(36, 44, 700)
    val titleS @Composable @ReadOnlyComposable get() = s(32, 40, 700)
    val bodyL @Composable @ReadOnlyComposable get() = s(30, 38, 400)
    val bodyM @Composable @ReadOnlyComposable get() = s(28, 36, 400)
    val bodyS @Composable @ReadOnlyComposable get() = s(26, 34, 400)
    val labelM @Composable @ReadOnlyComposable get() = s(24, 28, 400)
    val display @Composable @ReadOnlyComposable get() = s(136, 136, 800, -0.03f)
}

@Composable
fun PleosTheme(u: Float, dark: Boolean, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalU provides u, LocalP provides if (dark) DarkColors else LightColors, content = content)
}
