package app.commadrive.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import app.commadrive.core.EnergyPlan
import app.commadrive.core.Verdict
import kotlinx.coroutines.delay
import kotlin.math.max
import kotlin.math.roundToInt

enum class Tone { BASIC, FILLED, POSITIVE }

/**
 * Basic button — 공식 규격: Large 96 · Medium 80 높이, radius 28, 가로 여백 40/32 (research 7.5절).
 * Loading 이면 스피너만 남고 누를 수 없다(공식 상태표).
 */
@Composable
fun CarButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tone: Tone = Tone.BASIC,
    large: Boolean = true,
    loading: Boolean = false,
    enabled: Boolean = true,
) {
    val p = LocalP.current
    val src = remember { MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    val bg = when (tone) {
        Tone.BASIC -> if (pressed) p.btnPressed else p.btn
        Tone.FILLED -> p.filled
        Tone.POSITIVE -> p.positive
    }
    val fg = when (tone) {
        Tone.BASIC -> p.text
        Tone.FILLED -> p.filledText
        Tone.POSITIVE -> Color.White
    }
    val off = !enabled || loading
    Box(
        modifier
            .heightIn(min = px(if (large) 96 else 80))
            .clip(RoundedCornerShape(px(28)))
            .background(if (!enabled) bg.copy(alpha = 0.4f) else bg)
            .clickable(interactionSource = src, indication = null, enabled = !off, role = Role.Button, onClick = onClick)
            .padding(horizontal = px(if (large) 40 else 32), vertical = px(12)),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(px(40)), color = fg, strokeWidth = px(4))
        } else {
            Text(text, style = (if (large) T.bodyL else T.bodyM).copy(fontWeight = FontWeight.SemiBold, color = fg), textAlign = TextAlign.Center)
        }
    }
}

/** Card — surface_basic 위 radius 24, padding 32. 창 배경과 한 단계 차이 */
@Composable
fun CarCard(modifier: Modifier = Modifier, pad: Int = 32, tint: Color? = null, content: @Composable ColumnScope.() -> Unit) {
    val p = LocalP.current
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(px(24)))
            .background(tint ?: p.surfaceHigh.copy(alpha = if (p.dark) 0.6f else 1f))
            .padding(px(pad)),
        verticalArrangement = Arrangement.spacedBy(px(16)),
        content = content,
    )
}

/** 선택 칩 — 프리셋·토글 (주행 중 키보드 입력을 쓰지 않는다: 텍스트 입력 최소, 프리셋 우선) */
@Composable
fun Chip(text: String, on: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val p = LocalP.current
    Box(
        modifier
            .heightIn(min = px(72))
            .clip(RoundedCornerShape(px(36)))
            .background(if (on) p.positive.copy(alpha = 0.18f) else p.btn)
            .border(px(2), if (on) p.positive else Color.Transparent, RoundedCornerShape(px(36)))
            .clickable(enabled = enabled, role = Role.Checkbox, onClick = onClick)
            .padding(horizontal = px(32), vertical = px(10)),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = T.bodyM.copy(fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal, color = if (enabled) p.text else p.text4))
    }
}

/** 작은 표식 — 연결 상태·"추정"·"가상" 처럼 숨기지 않을 사실을 붙인다 */
@Composable
fun Badge(text: String, color: Color, modifier: Modifier = Modifier) {
    Row(
        modifier.clip(RoundedCornerShape(px(12))).background(color.copy(alpha = 0.16f)).padding(horizontal = px(16), vertical = px(6)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(px(8)),
    ) {
        Box(Modifier.size(px(12)).clip(CircleShape).background(color))
        Text(text, style = T.labelM.copy(color = LocalP.current.text2))
    }
}

@Composable
fun verdictColor(v: Verdict): Color {
    val p = LocalP.current
    return when (v) { Verdict.OK -> p.active; Verdict.TIGHT -> p.warn; Verdict.SHORT -> p.negative }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, sub: String? = null) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(px(4))) {
        Text(text, style = T.titleS)
        if (sub != null) Text(sub, style = T.bodyS.copy(color = LocalP.current.text3))
    }
}

/** − 값 + 스테퍼. 숫자 키패드를 띄우지 않는다 */
@Composable
fun Stepper(label: String, value: String, onMinus: () -> Unit, onPlus: () -> Unit) {
    val p = LocalP.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(px(16))) {
        Text(label, style = T.bodyM.copy(color = p.text2), modifier = Modifier.weight(1f))
        CarButton("−", onMinus, large = false, modifier = Modifier.widthIn(min = px(96)))
        Text(value, style = T.titleS, modifier = Modifier.widthIn(min = px(140)), textAlign = TextAlign.Center)
        CarButton("+", onPlus, large = false, modifier = Modifier.widthIn(min = px(96)))
    }
}

/**
 * 에너지 막대 — 지금 배터리(눈금) 위에 쓸 곳을 차례로 쌓는다: 가는 길 · 오는 길 · 대기 · 남겨 둘 최소 잔량.
 * 배터리 눈금을 넘는 부분이 곧 부족분이다. 주행 몫은 범위(±)의 비관 끝을 옅게 덧그린다 — 한 점처럼 보이지 않게.
 */
@Composable
fun EnergyBar(e: EnergyPlan, batteryPct: Double, modifier: Modifier = Modifier) {
    val p = LocalP.current
    val parts = listOf(
        e.outboundPct to p.positive,
        e.returnPct to p.auto,
        e.waitPct to p.warn,
        e.reservePct to p.text4,
    )
    val need = e.drivePct + e.waitPct + e.reservePct
    val scale = max(100.0, max(need, e.driveRange.second + e.waitPct + e.reservePct)).toFloat()
    val radius = px(16)
    Canvas(modifier.fillMaxWidth().height(px(56))) {
        val r = CornerRadius(radius.toPx(), radius.toPx())
        drawRoundRect(p.surfaceAccent, cornerRadius = r)
        var x = 0f
        for ((pct, c) in parts) {
            val w = (pct.toFloat() / scale) * size.width
            if (w > 0f) drawRect(c, topLeft = Offset(x, 0f), size = Size(w, size.height))
            x += w
        }
        // 주행 범위의 비관 끝 — 옅게
        val extra = ((e.driveRange.second - e.drivePct).toFloat() / scale) * size.width
        if (extra > 0f) drawRect(p.negative.copy(alpha = 0.25f), topLeft = Offset(x, 0f), size = Size(extra, size.height))
        // 지금 배터리 눈금
        val bx = (batteryPct.toFloat() / scale) * size.width
        drawRect(p.text, topLeft = Offset(bx - 3f, -6f), size = Size(6f, size.height + 12f))
    }
}

@Composable
fun Legend(items: List<Pair<String, Color>>) {
    Row(horizontalArrangement = Arrangement.spacedBy(px(24))) {
        for ((t, c) in items) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(px(8))) {
                Box(Modifier.size(px(16)).clip(RoundedCornerShape(px(4))).background(c))
                Text(t, style = T.labelM.copy(color = LocalP.current.text3))
            }
        }
    }
}

/** Toast — 화면 아래, 최대 792, 3.5초 뒤 사라진다 (공식 Toast 규격) */
@Composable
fun ToastHost(text: String?, onDone: () -> Unit, modifier: Modifier = Modifier) {
    val p = LocalP.current
    LaunchedEffect(text) {
        if (text != null) { delay(3_500); onDone() }
    }
    AnimatedVisibility(text != null, modifier = modifier, enter = fadeIn(), exit = fadeOut()) {
        Box(
            Modifier
                .padding(bottom = px(24))
                .widthIn(max = px(792))
                .clip(RoundedCornerShape(px(24)))
                .background(p.popup)
                .border(px(1), p.line, RoundedCornerShape(px(24)))
                .padding(horizontal = px(40), vertical = px(24)),
        ) {
            Text(text ?: "", style = T.bodyM, textAlign = TextAlign.Center)
        }
    }
}

@Composable
fun KeyValue(k: String, v: String, modifier: Modifier = Modifier, strong: Boolean = false) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(k, style = T.bodyS.copy(color = LocalP.current.text3))
        Spacer(Modifier.size(px(16)))
        Text(v, style = (if (strong) T.bodyM.copy(fontWeight = FontWeight.SemiBold) else T.bodyS), textAlign = TextAlign.End)
    }
}

@Composable
fun RowScope.Grow() = Spacer(Modifier.weight(1f))

fun pct(n: Double) = "${n.roundToInt()}%"
