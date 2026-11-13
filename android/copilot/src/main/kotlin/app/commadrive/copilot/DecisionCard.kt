package app.commadrive.copilot

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import app.commadrive.app.ui.CarButton
import app.commadrive.app.ui.CarCard
import app.commadrive.app.ui.LocalP
import app.commadrive.app.ui.T
import app.commadrive.app.ui.Tone
import app.commadrive.app.ui.px
import app.commadrive.core.assistant.DecisionKind
import app.commadrive.core.assistant.IntegratedDecision
import app.commadrive.core.assistant.StopCandidate
import app.commadrive.core.assistant.WaypointPhase
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

/**
 * V6 한 화면 카드 — 판단 하나 + 이유 + 근거. 정차 중에만 고를 수 있다. 주행 중에는 [DecisionOneLine] 한 줄뿐이다.
 * 세 층(demo v1 리뷰 2026-11-11): ① 왜 충전이 필요한가(에너지 예산) · 어디서 · 왜 이곳인가(순위를 가른 기준 하나) · 승인
 * ② 근거 자세히(펼침) ③ 다른 후보 비교(펼침). 운전자에게는 결과를, 근거는 펼쳐서.
 * '사용 가능' · '확정' · '보장' 이라고 쓰지 않는다. 충전기는 "빈 충전기 N기 표시"까지 — 상태 코드 '충전대기'를 줄 서는 '대기'로 읽지 않게, 현장 대기 인원은 모른다고 쓴다.
 */
private val CLOCK = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("Asia/Seoul"))
private fun fmt(at: Long?) = at?.let { CLOCK.format(Instant.ofEpochMilli(it)) } ?: "—"

@Composable
fun DecisionCard(c: DecisionController, parked: Boolean) {
    val p = LocalP.current
    // 이번 이동의 판단을 받기 전(E28 D7) — 이전 추천을 보이지 않고, 고를 버튼도 없다
    if (c.pending) {
        CarCard(tint = p.surface) {
            Text("이번 여정의 결정", style = T.labelM.copy(color = p.text3))
            Text("충전소 정보를 확인하는 중이에요", style = T.titleM)
            Text("지금 차량 상태와 이번 이동 조건으로 후보를 다시 판단하고 있어요 · 확인이 끝나기 전에는 경유지를 고르지 않아요", style = T.bodyM.copy(color = p.text2))
        }
        return
    }
    val d = c.decision ?: return
    var more by remember { mutableStateOf(false) }
    var alts by remember { mutableStateOf(false) }
    CarCard(tint = p.surface) {
        Text("이번 여정의 결정", style = T.labelM.copy(color = p.text3))
        Text(d.headline, style = T.titleM)
        // 왜 충전이 필요한가 — "100%인데 왜?"에 판단 계산값 그대로 답한다. 예산이 없으면(판단 불가 등) 엔진 문장
        Text(IntegratedDecision.budgetLine(d) ?: d.detail, style = T.bodyM.copy(color = p.text2))
        c.replan?.let { Text("판단이 바뀌었어요 · $it", style = T.bodyM.copy(color = p.negative)) }
        d.top?.let { top ->
            val why = d.alternatives.firstOrNull()?.let { IntegratedDecision.decisiveReason(top, it) } ?: top.reasons.firstOrNull()
            why?.let { Text("왜 이곳인가요 · $it", style = T.bodyM) }
            Text("${top.name} 도착 때 잔량 ${top.arrivalSocRange.first.roundToInt()}~${top.arrivalSocRange.second.roundToInt()}% 추정", style = T.titleS)
            Text("${top.station.reason} · 조회 ${fmt(top.station.retrievedAt)} · 현장 대기 인원은 알 수 없어요", style = T.labelM.copy(color = p.text3))
            if (top.familyUnknown.isNotEmpty()) Text("미확인 시설: ${top.familyUnknown.joinToString(", ") { it.label }} · 충족했다고 보지 않았어요", style = T.labelM.copy(color = p.text3))
            if (top.lat == null || top.lon == null) Text("위치를 받지 못해 경유지로 보낼 수 없어요", style = T.labelM.copy(color = p.negative))
            c.naviWaypoints?.takeIf { it.isNotEmpty() }?.let { list -> Text("지금 내비 경유지: ${list.joinToString(" · ") { it.name }}", style = T.labelM.copy(color = p.text3)) }
            WaypointBlock(c, top, parked)
            Text(if (more) "근거 자세히 ▲" else "근거 자세히 ▼", style = T.labelM.copy(color = p.text3), modifier = Modifier.clickable { more = !more }.padding(vertical = px(8)))
            if (more) {
                top.reasons.forEach { Text("· $it", style = T.bodyS.copy(color = p.text2)) }
                Text(energyLine(top), style = T.bodyS.copy(color = p.text2))
                Text("우회 영향: ${top.detourMinutes?.let { "약 ${it}분" } ?: "확인되지 않음"} · 상태 변화 ${fmt(top.station.statusChangedAt)}", style = T.labelM.copy(color = p.text3))
                c.vehicleFact?.let { Text(IntegratedDecision.evidenceLine(top, it), style = T.labelM.copy(color = p.text3)) }
            }
        }
        if (d.alternatives.isNotEmpty() || d.needsCheck.isNotEmpty()) {
            val n = d.alternatives.size + d.needsCheck.size
            Text(if (alts) "다른 후보 ${n}곳 비교 ▲" else "다른 후보 ${n}곳 비교 ▼", style = T.labelM.copy(color = p.text2), modifier = Modifier.clickable { alts = !alts }.padding(vertical = px(8)))
        }
        if (alts) {
            d.alternatives.forEach { alt ->
                Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
                    Column(Modifier.weight(1f)) {
                        Text(alt.name, style = T.bodyM)
                        d.top?.let { IntegratedDecision.decisiveReason(it, alt) }?.let { Text("추천과 다른 점 · $it", style = T.labelM.copy(color = p.text2)) }
                        Text("${alt.station.reason} · ${energyLine(alt)}", style = T.labelM.copy(color = p.text3))
                    }
                    if (c.alreadyOnRoute(alt)) Text("경유지에 있음", style = T.labelM.copy(color = p.positive))
                    else if (c.waypoint.phase == WaypointPhase.IDLE || c.waypoint.phase == WaypointPhase.VERIFIED) CarButton("이곳으로", { c.addWaypoint(alt, parked) }, enabled = c.canPick(alt, parked), large = false)
                }
            }
            if (d.needsCheck.isNotEmpty()) {
                Text("확인 필요 · 같은 기준으로 권하지 않아요", style = T.labelM.copy(color = p.text3))
                d.needsCheck.forEach { Text("${it.name} · ${it.reasons.firstOrNull() ?: ""}", style = T.labelM.copy(color = p.text3)) }
            }
        }
        if (d.kind == DecisionKind.NO_RELIABLE || d.kind == DecisionKind.RECOMMEND) CarButton(if (c.loading) "확인하는 중" else "다시 확인", { c.refresh() }, Modifier.fillMaxWidth(), enabled = !c.loading && parked, large = false)
    }
}

private fun energyLine(c: StopCandidate) =
    "도착 잔량 ${c.arrivalSocRange.first.roundToInt()}~${c.arrivalSocRange.second.roundToInt()}% 추정 · 80%까지 충전 후 여유 ${c.marginAfterChargePct.roundToInt()}%p 추정" + (c.chargeMinutes?.let { " · 충전 약 ${it}분 추정" } ?: "")

@Composable
private fun WaypointBlock(c: DecisionController, top: StopCandidate, parked: Boolean) {
    val p = LocalP.current
    val w = c.waypoint
    w.message?.let { Text(it, style = T.bodyM.copy(color = if (w.phase == WaypointPhase.FAILED || w.phase == WaypointPhase.NO_ROUTE || w.phase == WaypointPhase.SLOTS_FULL) p.negative else p.positive)) }
    when (w.phase) {
        WaypointPhase.LOOKING -> Text("내비 경로와 경유지 칸을 확인하는 중", style = T.labelM.copy(color = p.text3))
        WaypointPhase.PENDING, WaypointPhase.UNKNOWN_OUTCOME -> Text("내비에 경유지를 요청했어요 · 목록을 다시 읽어 확인하는 중", style = T.labelM.copy(color = p.text3))
        WaypointPhase.SLOTS_FULL -> {
            w.existing.forEachIndexed { i, place -> CarButton("${i + 1}번 칸(${place.name}) 바꾸기", { c.chooseReplace(i) }, Modifier.fillMaxWidth(), large = false) }
            CarButton("기존 경유지 유지", { c.cancelWaypoint() }, Modifier.fillMaxWidth(), large = false)
        }
        WaypointPhase.VERIFIED -> {}
        else -> if (c.alreadyOnRoute(top)) Text("${top.name}은(는) 이미 내비 경유지에 있어요", style = T.bodyM.copy(color = p.positive)) else Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
            CarButton("경유지로 추가", { c.addWaypoint(top, parked) }, Modifier.weight(1f), enabled = c.canPick(top, parked), tone = Tone.POSITIVE, large = false)
            CarButton("이곳 말고", { c.reject(top.stopId) }, Modifier.weight(1f), large = false)
        }
    }
}

@Composable
fun DecisionOneLine(c: DecisionController, parked: Boolean) {
    val d = c.decision ?: return
    val s = IntegratedDecision.surface(d, parked)
    if (s is app.commadrive.core.assistant.DecisionSurface.OneLine) Text(s.line, style = T.bodyM.copy(color = LocalP.current.text2))
}
