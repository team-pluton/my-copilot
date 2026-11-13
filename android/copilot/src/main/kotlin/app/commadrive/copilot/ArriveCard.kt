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
import app.commadrive.app.ui.Chip
import app.commadrive.app.ui.LocalP
import app.commadrive.app.ui.T
import app.commadrive.app.ui.Tone
import app.commadrive.app.ui.px
import app.commadrive.core.assistant.ArriveCandidate
import app.commadrive.core.assistant.ArriveDecisionKind
import app.commadrive.core.assistant.ArriveHandoff
import app.commadrive.core.assistant.ArrivePhase
import app.commadrive.core.assistant.ArriveReady
import app.commadrive.core.assistant.PlanChange
import app.commadrive.core.assistant.planStatus
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * ARRIVE READY — '지금 이동'의 Journey Goal 카드(새 탭이 아니다, 오너 2026-11-12).
 * 사용자는 약속과 방문지만 확인한다 → 코파일럿이 주차 · 내비 데이터를 비교해 **추천 하나** → 승인 → 내비 반영 확인.
 * 쓰지 않는 말: '주차 가능' · '도착 보장' · '주차 완료' · '방문 완료'. 경로 설정은 경로 설정일 뿐이다.
 * 주행 중(restricted)에는 이 카드를 그리지 않는다 — 화면이 한 줄 상태만 보인다(Safety Gate).
 */
private val CLOCK = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("Asia/Seoul"))
private fun hhmm(at: Long?) = at?.let { CLOCK.format(Instant.ofEpochMilli(it)) } ?: "—"

@Composable
fun ArriveGoalCard(c: ArriveController, devTools: Boolean) {
    val p = LocalP.current
    val h = c.handoff
    CarCard(tint = p.surface) {
        Text("이번 이동의 목표", style = T.labelM.copy(color = p.text3))
        // 1. 목표 — 약속과 방문지만 확인한다
        if (!c.confirmed || c.decision == null && !c.loading) {
            Text("약속 시간에 맞춰 주차하고 방문하기", style = T.titleM)
            Text("방문지", style = T.labelM.copy(color = p.text3))
            Text(c.place?.let { it.name + if (c.placeFromNavi) " · 내비 목적지에서 읽음" else "" } ?: "아직 정하지 않았어요", style = T.bodyM)
            Row(horizontalArrangement = Arrangement.spacedBy(px(10))) {
                CarButton("내비 목적지 쓰기", { c.readNaviDestination() }, large = false)
                CarButton("시연 위치(광화문)", { c.useDemoPlace() }, large = false)
            }
            c.placeNote?.let { Text(it, style = T.labelM.copy(color = p.text3)) }
            Text("약속 시각${c.appointmentAt?.let { " · ${hhmm(it)}" } ?: ""}", style = T.labelM.copy(color = p.text3))
            Row(horizontalArrangement = Arrangement.spacedBy(px(10))) {
                listOf(60, 75, 90, 120).forEach { m -> Chip("${m}분 뒤", c.appointmentAt != null && kotlin.math.abs(c.appointmentAt!! - roundTo5(System.currentTimeMillis() + m * 60_000L)) < 60_000L, { c.setAppointmentIn(m) }) }
            }
            Text("주차 후 방문까지 여유(직접 설정 · 걷는 시간은 계산하지 않아요)", style = T.labelM.copy(color = p.text3))
            Row(horizontalArrangement = Arrangement.spacedBy(px(10))) {
                listOf(5, 10, 15).forEach { m -> Chip("${m}분", c.bufferMin == m, { c.setBuffer(m) }) }
            }
            CarButton(if (c.loading) "확인하는 중" else "이 목표로 주차와 시간을 볼게요", { c.confirmAndDecide() }, Modifier.fillMaxWidth(),
                enabled = c.place != null && c.appointmentAt != null && !c.loading, tone = Tone.POSITIVE, large = false)
            Text("일정 앱 연동은 하지 않았어요 — 약속은 직접 확인한 값만 씁니다", style = T.labelM.copy(color = p.text3))
            return@CarCard
        }
        Text("${hhmm(c.appointmentAt)} 약속 · ${c.place?.name ?: ""} · 여유 ${c.bufferMin}분", style = T.bodyM.copy(color = p.text2))
        c.restoreNote?.let { Text(it, style = T.labelM.copy(color = p.text3)) }
        if (c.loading && c.decision == null) { Text("주차 정보와 내비 소요 시간을 비교하는 중이에요", style = T.titleM); return@CarCard }
        val d = c.decision ?: return@CarCard
        val i = c.input
        // 2. 판단 하나 — 경로가 이미 설정됐으면 '지금 가장 나은 후보'가 아니라 '지금 계획을 바꿀 필요가 있나'가 주 문장(오너 2026-11-13, E32-22)
        val a = h.approval
        val plan = if (h.phase == ArrivePhase.ROUTE_SET && a != null) ArriveReady.planStatus(d, a.parkingId, a.name) else null
        Text(plan?.headline ?: d.headline, style = T.titleM)
        plan?.detail?.let { Text(it, style = T.bodyM.copy(color = p.text2)) }
        if (c.mockFullFor != null) Text("시연 데이터 포함 · ${c.mockFullFor} 만차로 바꿈(개발용)", style = T.labelM.copy(color = p.negative))
        // 최종 방문지와 지금 내비 목적지는 다른 것 — 주차장으로 경로를 바꿔도 방문 목표는 그대로다
        if (plan != null && a != null) Text("최종 방문지 ${c.place?.name ?: "—"} · 지금 내비 목적지 ${a.name}", style = T.labelM.copy(color = p.text3))
        val top = d.top
        val subject = if (plan != null) plan.routed else top
        if (subject != null && i != null) {
            ArriveReady.budgetLine(i, subject)?.let { Text(it, style = T.bodyM.copy(color = p.text2)) }
            if (plan == null) {
                val why = d.fasterButFar?.let { ArriveReady.tradeoff(subject, it) } ?: d.alternatives.firstOrNull()?.let { ArriveReady.decisiveReason(subject, it) }
                why?.let { Text("왜 이곳인가요 · $it", style = T.bodyM) }
            }
            Text("${subject.parking.name} · 방문지까지 직선 약 ${Math.round(subject.distanceM / 10.0) * 10}m · 빈자리 ${subject.parking.free ?: "—"}면 표시(${hhmm(subject.parking.updatedAt)} 기준)", style = T.titleS)
            ArriveReady.caveats(subject, c.bufferMin).forEach { Text("· $it", style = T.labelM.copy(color = p.text3)) }
            // 지금 정보의 1순위가 안내 중인 곳과 달라도 바꾸라고 하지 않는다 — 상세 한 줄로만
            if (plan != null && (plan.change == PlanChange.KEEP || plan.change == PlanChange.KEEP_TIGHT)) plan.best?.let { b ->
                Text("다른 적합 후보 · ${b.parking.name} · 방문지까지 직선 약 ${Math.round(b.distanceM / 10.0) * 10}m · 약 ${Math.round((b.etaSec ?: 0) / 60.0)}분(내비) — 지금 경로를 바꾸지 않아도 돼요", style = T.labelM.copy(color = p.text2))
            }
            HandoffBlock(c, if (plan == null) subject else null)
        } else {
            d.fastest?.let { Text("가장 빨리 닿는 곳: ${it.parking.name} · 약 ${(it.etaSec ?: 0) / 60}분(내비) — ${it.problem ?: ""}", style = T.bodyM.copy(color = p.text2)) }
            d.needsCheck.take(3).forEach { Text("${it.parking.name} · ${it.problem}", style = T.labelM.copy(color = p.text3)) }
            // 추천이 없을 때 '왜 없는지'를 숨기지 않는다 — 운영 시간 외 · 위치 미상 같은 제외 이유(거리 밖은 너무 많아 뺀다)
            d.excluded.filter { it.reason != "방문지에서 ${ArriveReady.MAX_WALK_M}m 밖" }.take(3).forEach { Text("제외 · ${it.name} · ${it.reason}", style = T.labelM.copy(color = p.text3)) }
            // 이미 내비에 보낸 경로는 지금 추천이 없어도 그대로 보여 준다 — 앱이 경로를 바꾸지 않았다는 사실도 함께
            if (h.phase != ArrivePhase.IDLE) HandoffBlock(c, null)
        }
        // 3. 다른 후보 · 확인 필요 — 펼침
        var alts by remember { mutableStateOf(false) }
        val others = listOfNotNull(d.fasterButFar) + d.alternatives
        if (top != null && (others.isNotEmpty() || d.needsCheck.isNotEmpty())) {
            Text(if (alts) "다른 후보 비교 ▲" else "다른 후보 ${others.size + d.needsCheck.size}곳 비교 ▼", style = T.labelM.copy(color = p.text2), modifier = Modifier.clickable { alts = !alts }.padding(vertical = px(8)))
            if (alts) {
                others.forEach { o ->
                    Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
                        Column(Modifier.weight(1f)) {
                            Text(o.parking.name, style = T.bodyM)
                            Text((if (o == d.fasterButFar && i != null) ArriveReady.fasterButFarNote(top, o, c.bufferMin) else ArriveReady.decisiveReason(top, o)?.let { "추천과 다른 점 · $it" } ?: "") , style = T.labelM.copy(color = p.text2))
                            Text("약 ${(o.etaSec ?: 0) / 60}분(내비) · ${Math.round(o.distanceM / 10.0) * 10}m · 빈자리 ${o.parking.free ?: "—"}면 표시", style = T.labelM.copy(color = p.text3))
                        }
                        if (h.phase == ArrivePhase.IDLE) CarButton("이곳으로", { c.approve(o) }, large = false)
                    }
                }
                if (d.needsCheck.isNotEmpty()) {
                    Text("확인 필요 · 같은 기준으로 권하지 않아요", style = T.labelM.copy(color = p.text3))
                    d.needsCheck.forEach { Text("${it.parking.name} · ${it.problem}", style = T.labelM.copy(color = p.text3)) }
                }
                d.excluded.filter { it.reason != "방문지에서 ${ArriveReady.MAX_WALK_M}m 밖" }.forEach { Text("제외 · ${it.name} · ${it.reason}", style = T.labelM.copy(color = p.text3)) }
            }
        }
        // 4. 경로 설정 뒤 다시 판단 — 의미 있게 달라질 때만. 경로를 바꾸지 않는다
        c.notice?.let { n ->
            if (plan == null) Text("다시 판단 · ${n.reason}", style = T.bodyM.copy(color = p.negative))
            Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
                n.suggestion?.let { s -> CarButton("${s.parking.name}(으)로 바꾸기", { c.acceptSuggestion() }, Modifier.weight(1f), tone = Tone.POSITIVE, large = false) }
                CarButton("지금 경로 유지", { c.dismissNotice() }, Modifier.weight(1f), large = false)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(px(10))) {
            val busy = h.phase in setOf(ArrivePhase.REVALIDATING, ArrivePhase.LOOKING, ArrivePhase.PENDING, ArrivePhase.UNKNOWN_OUTCOME)
            CarButton(if (c.loading) "확인하는 중" else "다시 확인", { if (h.phase == ArrivePhase.ROUTE_SET) c.recheckNow() else c.refresh() }, Modifier.weight(1f), enabled = !c.loading && !busy, large = false)
            if (h.phase == ArrivePhase.IDLE) CarButton("목표 바꾸기", { c.editGoal() }, Modifier.weight(1f), large = false)
        }
        // 조회에 실패한 시각을 '확인'이라고 쓰지 않는다 — 실패면 '시도'
        c.lastCheckedAt?.let {
            // 앱이 조회한 시각과 원본 주차 정보가 갱신된 시각은 다르다 — 둘을 나눠 쓴다
            val src = (plan?.routed ?: top)?.parking?.updatedAt?.let { u -> " (주차 정보 ${hhmm(u)} 갱신)" } ?: ""
            val line = if (d.kind == ArriveDecisionKind.DATA_FAILED) "마지막 시도 ${hhmm(it)} · 정보를 다 받지 못했어요 · 다시 확인을 눌러 주세요"
                else "마지막 확인 ${hhmm(it)}$src · 서울 시영 주차 정보(공공 API) · 소요 시간은 내비 예상"
            Text(line, style = T.labelM.copy(color = p.text3))
        }
        if (devTools && h.phase == ArrivePhase.ROUTE_SET) CarButton(if (c.mockFullFor == null) "개발용 · 보낸 주차장을 만차로(시연)" else "개발용 · 실데이터로 되돌리기", { c.toggleMockFull() }, Modifier.fillMaxWidth(), large = false)
    }
}

@Composable
private fun HandoffBlock(c: ArriveController, top: ArriveCandidate?) {
    val p = LocalP.current
    val h = c.handoff
    ArriveHandoff.stepLabel(h)?.let { Text(it, style = T.labelM.copy(color = p.text3)) }
    h.message?.let { Text(it, style = T.bodyM.copy(color = if (h.phase == ArrivePhase.FAILED || h.phase == ArrivePhase.BLOCKED) p.negative else p.positive)) }
    when (h.phase) {
        ArrivePhase.IDLE -> if (top != null) Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
            CarButton("${top.parking.name}(으)로 안내", { c.approve(top) }, Modifier.weight(1f), enabled = !c.loading, tone = Tone.POSITIVE, large = false)
        }
        ArrivePhase.CONFIRM_REPLACE -> Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
            CarButton("주차장 경로로 바꾸기", { c.confirmReplace() }, Modifier.weight(1f), tone = Tone.POSITIVE, large = false)
            CarButton("기존 경로 유지", { c.cancel() }, Modifier.weight(1f), large = false)
        }
        ArrivePhase.BLOCKED, ArrivePhase.FAILED, ArrivePhase.OVERRIDDEN -> CarButton("닫기", { c.cancel() }, Modifier.fillMaxWidth(), large = false)
        ArrivePhase.ROUTE_SET -> h.approval?.let { a -> Text("승인한 곳 ${a.name} · 정보 ${hhmm(a.dataAt)} 기준 · 판단 ${a.ruleVersion}", style = T.labelM.copy(color = p.text3)) }
        else -> {}
    }
}

private fun roundTo5(ms: Long) = (ms + 299_999L) / 300_000L * 300_000L
