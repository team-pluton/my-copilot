package app.commadrive.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import app.commadrive.app.AppViewModel
import app.commadrive.app.DemoData
import app.commadrive.app.Link
import app.commadrive.app.Step
import app.commadrive.core.EnergyEstimator
import app.commadrive.core.PassengerType
import app.commadrive.core.RankedRestStop
import app.commadrive.core.RecommendationEngine
import app.commadrive.core.TripMode
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * 앱 창 하나 — **상단바·하단 탭을 그리지 않는다.** 그건 Pleos 시스템 셸의 것이다(CLAUDE.md "셸과 앱 창을 분리한다").
 *
 * 세로가 기본이고 핵심 흐름은 세로에서 끝난다. 창이 가로로 넓어지면 오른쪽에 확장 정보
 * (차량 값 · 시연 조작판 · 재판단 기록)가 열린다 — 공식 "세로 기본, 가로 확장".
 */
@Composable
fun AppRoot(vm: AppViewModel) {
    val dark = isSystemInDarkTheme()
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wide = maxWidth > maxHeight * 1.15f && maxWidth >= 720.dp
        // 공식 창 폭(세로 840 · 가로 1700)에서 1 — 그보다 좁으면 같은 비율로 줄인다
        val u = (maxWidth.value / if (wide) 1700f else 840f).coerceIn(0.42f, 1.3f)
        PleosTheme(u, dark) {
            val p = LocalP.current
            var panel by rememberSaveable { mutableStateOf(false) }
            BackHandler(enabled = vm.step != Step.PLAN || panel) {
                if (panel) panel = false else vm.step = when (vm.step) {
                    Step.STOPS -> Step.JUDGE
                    Step.DRIVE -> Step.JUDGE
                    else -> Step.PLAN
                }
            }
            Box(Modifier.fillMaxSize().background(p.bg).safeDrawingPadding()) {
                if (wide) {
                    Row(Modifier.fillMaxSize().padding(px(32)), horizontalArrangement = Arrangement.spacedBy(px(32))) {
                        Column(Modifier.weight(1.25f).fillMaxHeight()) { MainColumn(vm, wide = true, onPanel = null) }
                        Column(
                            Modifier.weight(1f).fillMaxHeight().verticalScroll(rememberScrollState()),
                            verticalArrangement = Arrangement.spacedBy(px(24)),
                        ) { SidePanel(vm) }
                    }
                } else {
                    Column(Modifier.fillMaxSize().padding(horizontal = px(40), vertical = px(32))) {
                        MainColumn(vm, wide = false, onPanel = { panel = true })
                    }
                    if (panel) PanelSheet(onClose = { panel = false }) { SidePanel(vm) }
                }
                ToastHost(vm.toast, onDone = { vm.toast = null }, modifier = Modifier.align(Alignment.BottomCenter))
                vm.notice?.let { NoticeDialog(it) { vm.notice = null } }
            }
        }
    }
}

@Composable
private fun ColumnScope.MainColumn(vm: AppViewModel, wide: Boolean, onPanel: (() -> Unit)?) {
    StatusStrip(vm, onPanel)
    Spacer(Modifier.height(px(24)))
    Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(px(24))) {
        when (vm.step) {
            Step.PLAN -> PlanStep(vm)
            Step.JUDGE -> JudgeStep(vm)
            Step.STOPS -> StopsStep(vm, wide)
            Step.DRIVE -> DriveStep(vm)
        }
        Spacer(Modifier.height(px(8)))
    }
    Spacer(Modifier.height(px(24)))
    Footer(vm)
}

// ── 연결 상태 — Mock 과 실제를 섞어 말하지 않는다 (정책 4) ─────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StatusStrip(vm: AppViewModel, onPanel: (() -> Unit)?) {
    val p = LocalP.current
    FlowRow(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(px(12)),
        verticalArrangement = Arrangement.spacedBy(px(8)),
    ) {
        Text("쉼표 DRIVE", style = T.titleS, modifier = Modifier.padding(end = px(8)))
        Badge(linkText("차량", vm.vehicleLink, "Vehicle SDK"), linkColor(vm.vehicleLink))
        Badge(linkText("내비", vm.naviLink, "NaviHelper"), linkColor(vm.naviLink))
        if (vm.plan.mode == TripMode.JOURNEY) Badge("후보: 시연용 가상 데이터", p.text4)
        if (onPanel != null) {
            Text(
                "조작판 · 기록",
                style = T.labelM.copy(color = p.positive, fontWeight = FontWeight.SemiBold),
                modifier = Modifier.clip(RoundedCornerShape(px(12))).clickable(onClick = onPanel).padding(horizontal = px(16), vertical = px(6)),
            )
        }
    }
}

private fun linkText(what: String, l: Link, sdk: String) = when (l) {
    Link.CONNECTING -> "$what 연결 중"
    Link.LIVE -> "$what 연결됨 · $sdk"
    Link.DEMO -> "$what: 시연 값 ($sdk 없음)"
}

@Composable
private fun linkColor(l: Link): Color {
    val p = LocalP.current
    return when (l) { Link.CONNECTING -> p.text4; Link.LIVE -> p.active; Link.DEMO -> p.warn }
}

// ── 01 여정 — 정차 중 입력. 키보드 없이 프리셋·칩·스테퍼만 ─────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PlanStep(vm: AppViewModel) {
    val p = LocalP.current
    val plan = vm.plan
    Text("오늘 차를 어떻게 쓰나요", style = T.headlineS)
    Text("같은 판단을 이동의 여러 순간에 씁니다 — 지금 배터리로 이후 일정까지 되는가.", style = T.bodyM.copy(color = p.text3))
    ModeCard("장거리 여행", "도착 후 대기까지 세고, 서야 한다면 동승자 모두에게 맞는 곳을 고릅니다", plan.mode == TripMode.JOURNEY) { vm.chooseMode(TripMode.JOURNEY) }
    ModeCard("픽업 · 마중", "가서 기다렸다 돌아오기까지 — 충전하지 않아도 되는지, 공조 켜고 얼마나 기다려도 되는지", plan.mode == TripMode.WAIT) { vm.chooseMode(TripMode.WAIT) }
    ModeCard("캠핑 · 차박", "설계 단계 — 본선 이후 결정 (기획서 3-1절)", false, enabled = false) {}

    CarCard {
        SectionTitle("여정", sub = routeLine(vm))
        if (plan.mode == TripMode.JOURNEY) {
            Text("동승자 — 직접 고릅니다 (자동 감지 아님)", style = T.bodyS.copy(color = p.text3))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(px(12)), verticalArrangement = Arrangement.spacedBy(px(12))) {
                for (t in PassengerType.entries) Chip(t.label, t in plan.passengers, { vm.togglePassenger(t) })
            }
        }
        Stepper("도착 후 차에서 기다림", "${plan.waitMinutesAfterArrival}분", { vm.setWait(plan.waitMinutesAfterArrival - 10) }, { vm.setWait(plan.waitMinutesAfterArrival + 10) })
        Stepper("남겨 둘 최소 잔량", pct(plan.minReservePct), { vm.setReserve(plan.minReservePct - 5) }, { vm.setReserve(plan.minReservePct + 5) })
        Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
            Chip("편도", plan.returnKm <= 0.0, { vm.setRoundTrip(false) })
            Chip("왕복 (같은 길로 귀가)", plan.returnKm > 0.0, { vm.setRoundTrip(true) })
        }
    }
}

private fun routeLine(vm: AppViewModel): String {
    val plan = vm.plan
    val remain = vm.naviRemainKm
    if (remain != null && plan.mode == TripMode.JOURNEY) return "내비 목적지까지 ${remain.roundToInt()}km (NaviHelper)"
    return if (plan.mode == TripMode.WAIT) "집 → ${plan.destinationName} ${plan.routeKm.roundToInt()}km · 시연 경로"
    else "${DemoData.ROUTE_FROM} → ${DemoData.ROUTE_TO} ${plan.routeKm.roundToInt()}km · 시연 경로" + if (plan.returnKm > 0) " · 왕복" else ""
}

@Composable
private fun ModeCard(title: String, body: String, on: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    val p = LocalP.current
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(px(24)))
            .background(if (on) p.positive.copy(alpha = 0.14f) else p.surfaceHigh.copy(alpha = if (p.dark) 0.6f else 1f))
            .border(px(3), if (on) p.positive else Color.Transparent, RoundedCornerShape(px(24)))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(px(32)),
        verticalArrangement = Arrangement.spacedBy(px(8)),
    ) {
        Text(title, style = T.titleM.copy(color = if (enabled) p.text else p.text4))
        Text(body, style = T.bodyS.copy(color = if (enabled) p.text3 else p.text4))
    }
}

// ── 03 판단 — 큰 답 하나 · 범위 · 만약에 · 가정 ─────────────────────────────

@Composable
private fun JudgeStep(vm: AppViewModel) {
    val p = LocalP.current
    val e = vm.energy
    val v = vm.vehicle
    val verdict = vm.verdict
    var showAssumptions by rememberSaveable { mutableStateOf(false) }

    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(px(16))) {
        Box(Modifier.size(px(28)).clip(CircleShape).background(verdictColor(verdict)))
        Text(verdict.label, style = T.headlineM.copy(color = verdictColor(verdict)))
        Badge("추정 · 공식 주행가능거리 아님", p.text4)
    }
    Text(e.message, style = T.bodyL)
    if (vm.plan.mode == TripMode.WAIT) {
        val m = e.maxWaitMinutes
        Text(
            if (m == null) "공조를 끄면 대기 소비는 0 으로 셉니다" else "공조 켜고 최대 약 ${if (m >= 120) "${m / 60}시간 ${m % 60}분" else "${m}분"} 기다려도 됩니다 (보수적)",
            style = T.titleS.copy(color = p.active),
        )
    }

    CarCard {
        SectionTitle("에너지 계획", sub = "지금 배터리 ${pct(v.batteryPct)} · 눈금을 넘는 만큼이 부족분")
        EnergyBar(e, v.batteryPct)
        Legend(buildList {
            add("가는 길" to p.positive)
            if (e.returnPct > 0) add("오는 길" to p.auto)
            add("대기" to p.warn)
            add("최소 잔량" to p.text4)
        })
        KeyValue("주행" + if (e.returnPct > 0) " (가는 길 ${pct(e.outboundPct)} + 오는 길 ${pct(e.returnPct)})" else "", "${pct(e.drivePct)} (추정 ${pct(e.driveRange.first)}~${pct(e.driveRange.second)})")
        KeyValue("도착 후 대기 ${vm.remainingPlan.waitMinutesAfterArrival}분", pct(e.waitPct))
        KeyValue("남겨 둘 최소 잔량", pct(e.reservePct))
        KeyValue(if (e.returnPct > 0) "귀가 시 예상 잔량" else "도착 예상 잔량 (대기 포함)", if (e.arrivalPct < 0) "${pct(e.arrivalPct)} (충전 없이는 모자람)" else pct(e.arrivalPct), strong = true)
        if (e.shortfallPct > 0) KeyValue("부족분", "약 ${pct(e.shortfallPct)} (추정 ${pct(max(e.shortfallRange.first, 0.0))}~${pct(e.shortfallRange.second)})", strong = true)
        vm.naviArrivalSoc?.let { KeyValue("내비 도착 잔량 예측", "$it% — 가는 길 기준값 (NaviHelper)") }
    }

    CarCard {
        SectionTitle("만약에 — 선택 비교", sub = "선택이 이후 일정에 어떻게 닿는지 같은 엔진으로 다시 셉니다")
        for (w in vm.whatIf) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(px(16))) {
                Text(w.label, style = T.bodyM, modifier = Modifier.weight(1f))
                Text(w.verdict.label, style = T.bodyM.copy(color = verdictColor(w.verdict), fontWeight = FontWeight.SemiBold))
                Text(pct(w.arrivalPct), style = T.bodyS.copy(color = p.text3), modifier = Modifier.width(px(110)))
            }
        }
        Text("오른쪽 숫자는 " + if (vm.plan.mode == TripMode.WAIT) "귀가 시 예상 잔량" else "도착 예상 잔량(대기 포함)", style = T.labelM.copy(color = p.text4))
    }

    CarCard {
        Row(Modifier.fillMaxWidth().clickable { showAssumptions = !showAssumptions }, verticalAlignment = Alignment.CenterVertically) {
            SectionTitle("어떻게 계산했나", modifier = Modifier.weight(1f))
            Text(if (showAssumptions) "접기" else "펼치기", style = T.bodyS.copy(color = p.positive))
        }
        if (showAssumptions) for (a in e.assumptions) Text("· $a", style = T.bodyS.copy(color = p.text2))
    }
}

// ── 04 후보 — 상위 3곳 · 이유 · 미충족을 숨기지 않는다 · 왜 빠졌나 ───────────────

@Composable
private fun StopsStep(vm: AppViewModel, wide: Boolean) {
    val p = LocalP.current
    var showExcluded by rememberSaveable { mutableStateOf(false) }
    val needsCharge = vm.energy.needsCharge
    Text(if (needsCharge) "충전하며 쉬어 갈 곳" else "쉬어 갈 곳", style = T.headlineS)
    Text(
        if (needsCharge) "갈 수 있는 곳 중, 거기서 80% 까지 채우면 끝까지 가는 곳만 남깁니다 · 상위 3곳" else "충전은 필요 없습니다 · 동승자 조건과 휴식 간격으로 고릅니다",
        style = T.bodyM.copy(color = p.text3),
    )
    val ranked = vm.ranked
    if (ranked.isEmpty()) {
        CarCard { Text("조건에 맞는 곳이 없습니다. 아래 '왜 빠졌나'에서 이유를 확인하세요.", style = T.bodyM) }
    }
    ranked.forEachIndexed { i, r -> StopCard(vm, i + 1, r, wide) }

    val ex = vm.excluded
    if (ex.isNotEmpty()) {
        CarCard {
            Row(Modifier.fillMaxWidth().clickable { showExcluded = !showExcluded }, verticalAlignment = Alignment.CenterVertically) {
                SectionTitle("제외 ${ex.size}곳 — 왜 빠졌나", modifier = Modifier.weight(1f))
                Text(if (showExcluded) "접기" else "펼치기", style = T.bodyS.copy(color = p.positive))
            }
            if (showExcluded) for (x in ex) KeyValue(x.stop.name, x.reason)
        }
    }
}

@Composable
private fun StopCard(vm: AppViewModel, rank: Int, r: RankedRestStop, wide: Boolean) {
    val p = LocalP.current
    val s = r.stop
    val isSel = vm.selected?.id == s.id
    CarCard(tint = if (isSel) p.positive.copy(alpha = 0.14f) else null) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(px(16))) {
            Text("$rank", style = T.titleL.copy(color = p.positive))
            Column(Modifier.weight(1f)) {
                Text(s.name, style = T.titleM)
                Text(
                    listOfNotNull(
                        s.chargerKw?.let { "급속 ${it}kW" },
                        vm.chargeMinutesOf(s)?.let { "80%까지 약 ${it}분" },
                        if (vm.energy.needsCharge) "도착 시 약 ${pct(vm.atStopPct(s))}" else null,
                    ).joinToString(" · "),
                    style = T.bodyS.copy(color = p.text3),
                )
            }
            Text("${r.score}", style = T.headlineS)
        }
        Text(r.reason, style = T.bodyS.copy(color = p.text2))
        Text(RecommendationEngine.unmetLabel(r.unmet), style = T.bodyS.copy(color = if (r.unmet.isEmpty()) p.active else p.warn))
        if (wide) ScoreBars(vm, r)
        if (isSel) {
            Badge("경유지로 추가됨", p.active)
        } else {
            CarButton("경유지로 추가", { vm.addWaypoint(s) }, tone = if (rank == 1) Tone.POSITIVE else Tone.BASIC, loading = vm.adding, modifier = Modifier.fillMaxWidth())
        }
    }
}

/** 점수 구성 — 가로 확장에서만 (세로에서는 이유 한 줄이 그 역할을 한다) */
@Composable
private fun ScoreBars(vm: AppViewModel, r: RankedRestStop) {
    val p = LocalP.current
    val b = vm.breakdown(r.stop)
    val rows = buildList {
        add("경로 이탈" to b.detour)
        add("선호 시설" to b.amenity)
        if (b.chargerCounted) add("충전 속도" to b.charger)
        add("휴식 시점" to b.timing)
        add("정보 신뢰" to b.confidence)
    }
    Column(verticalArrangement = Arrangement.spacedBy(px(8))) {
        for ((label, v) in rows) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(px(12))) {
                Text(label, style = T.labelM.copy(color = p.text3), modifier = Modifier.width(px(150)))
                Box(Modifier.weight(1f).height(px(12)).clip(RoundedCornerShape(px(6))).background(p.surfaceAccent)) {
                    Box(Modifier.fillMaxWidth(v / 100f).fillMaxHeight().background(p.positive))
                }
                Text("$v", style = T.labelM, modifier = Modifier.width(px(56)))
            }
        }
    }
}

// ── 05 주행 중 — DO: 한 줄 + 음성. 입력·비교·설정 없음 ───────────────────────

@Composable
private fun DriveStep(vm: AppViewModel) {
    val p = LocalP.current
    val e = vm.energy
    val plan = vm.plan
    val sel = vm.selected
    val headline: String
    val sub: String
    if (plan.mode == TripMode.WAIT) {
        val rp = vm.remainingPlan
        when {
            rp.routeKm > 0 -> { headline = "${plan.destinationName.substringBefore(" (")}까지 ${rp.routeKm.roundToInt()}km"; sub = "귀가 시 예상 잔량 약 ${pct(e.arrivalPct)}" }
            rp.waitMinutesAfterArrival > 0 -> { headline = "기다리는 중 · ${rp.waitMinutesAfterArrival}분 남음"; sub = "공조 켜고 최대 약 ${e.maxWaitMinutes ?: 0}분 (보수적)" }
            rp.returnKm > 0 -> { headline = "귀가까지 ${rp.returnKm.roundToInt()}km"; sub = "귀가 시 예상 잔량 약 ${pct(e.arrivalPct)}" }
            else -> { headline = "귀가했습니다"; sub = "남은 잔량 ${pct(vm.vehicle.batteryPct)}" }
        }
    } else if (sel != null && sel.routeKm > vm.traveledKm) {
        headline = "${sel.name}까지 ${(sel.routeKm - vm.traveledKm).roundToInt()}km"
        sub = "도착 시 약 ${pct(vm.atStopPct(sel))} · 80%까지 약 ${vm.chargeMinutesOf(sel) ?: 0}분"
    } else {
        val left = vm.remainingPlan.routeKm
        headline = if (left > 0) "${plan.destinationName}까지 ${left.roundToInt()}km" else "${plan.destinationName}에 도착했습니다"
        // 음수 잔량을 그대로 보이면 운전자가 읽지 못한다 — "얼마나 모자라나"로 바꿔 말한다
        sub = if (e.arrivalPct < 0) "충전 없이는 약 ${pct(-e.arrivalPct)} 모자랍니다 (대기 포함)" else "도착 예상 잔량 약 ${pct(e.arrivalPct)} (대기 포함)"
    }

    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(px(16))) {
        Box(Modifier.size(px(24)).clip(CircleShape).background(verdictColor(vm.verdict)))
        Text("판단: ${vm.verdict.label}", style = T.titleS.copy(color = verdictColor(vm.verdict)))
    }
    Text(headline, style = T.headlineM)
    Text(sub, style = T.titleS.copy(color = p.text2, fontWeight = FontWeight.Normal))

    vm.voiceLine?.let {
        CarCard(pad = 24) {
            Text("음성 안내", style = T.labelM.copy(color = p.text3))
            Text(it, style = T.bodyM)
        }
    }

    vm.arrivedAt?.let { stop ->
        CarCard(tint = p.active.copy(alpha = 0.14f)) {
            Text("${stop.name} 도착", style = T.titleM)
            Text("80% 까지 약 ${vm.chargeMinutesOf(stop) ?: 0}분 — 그 시간이 쉼표입니다.", style = T.bodyM)
            if (vm.isLiveVehicle) {
                Text("충전으로 잔량이 오르면 차량 값으로 다시 판단합니다.", style = T.bodyS.copy(color = p.text3))
            } else {
                CarButton("충전 완료 (시연)", { vm.finishCharging() }, tone = Tone.POSITIVE, modifier = Modifier.fillMaxWidth())
            }
        }
    }

    vm.log.firstOrNull()?.let {
        Text("↻ ${it.time} ${it.text}", style = T.bodyS.copy(color = if (it.verdictChanged) p.warn else p.text3))
    }
    Text("주행 중에는 한 줄과 음성만 — DO 정책. 비교·설정은 정차 후에.", style = T.labelM.copy(color = p.text4))
}

// ── 바닥 버튼 — 화면마다 주요 행동 하나 ─────────────────────────────────────

@Composable
private fun Footer(vm: AppViewModel) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(px(16))) {
        when (vm.step) {
            Step.PLAN -> CarButton("판단하기", { vm.step = Step.JUDGE; vm.say(vm.spokenVerdict()) }, tone = Tone.POSITIVE, modifier = Modifier.weight(1f))
            Step.JUDGE -> {
                CarButton("여정", { vm.step = Step.PLAN }, modifier = Modifier.width(px(200)))
                if (vm.plan.mode == TripMode.JOURNEY) {
                    CarButton(if (vm.energy.needsCharge) "충전하며 쉬어 갈 곳" else "쉬어 갈 곳만 보기", { vm.step = Step.STOPS }, tone = Tone.POSITIVE, modifier = Modifier.weight(1f))
                    CarButton("출발", { vm.step = Step.DRIVE }, modifier = Modifier.width(px(200)))
                } else {
                    CarButton("출발", { vm.step = Step.DRIVE }, tone = Tone.POSITIVE, modifier = Modifier.weight(1f))
                }
            }
            Step.STOPS -> {
                CarButton("판단", { vm.step = Step.JUDGE }, modifier = Modifier.width(px(200)))
                CarButton("출발 — 주행 중 보기", { vm.step = Step.DRIVE }, tone = if (vm.selected != null) Tone.POSITIVE else Tone.BASIC, modifier = Modifier.weight(1f))
            }
            Step.DRIVE -> {
                CarButton("다시 듣기", { vm.say(vm.voiceLine ?: vm.spokenVerdict()) }, modifier = Modifier.width(px(240)))
                CarButton("정차 — 계획 보기", { vm.step = Step.JUDGE }, modifier = Modifier.weight(1f))
            }
        }
    }
}

// ── 확장 정보 — 차량 값 · 시연 조작판 · 재판단 기록 ───────────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SidePanel(vm: AppViewModel) {
    val p = LocalP.current
    val v = vm.vehicle
    CarCard {
        SectionTitle("차량 값", sub = if (vm.isLiveVehicle) "Pleos Vehicle SDK 에서 읽은 값" else "시연 값 — 차량 대신 조작판이 넣는다")
        KeyValue("배터리 잔량", pct(v.batteryPct), strong = true)
        KeyValue("배터리 용량", "${v.batteryKwh.roundToInt()} kWh")
        KeyValue("소비 효율", v.efficiencyKwhPer100km?.let { "$it kWh/100km " + if (vm.isLiveVehicle) "(차량 값)" else "(시연 값)" } ?: "${EnergyEstimator.DEFAULT_KWH_PER_100KM} kWh/100km (차종 기본값 · 가정)")
        KeyValue("공조", if (v.hvacOn) "켜짐" else "꺼짐" + if (vm.isLiveVehicle) " (가정 — HVAC 연결 전)" else "")
        KeyValue("외기온", "${v.outsideTempC.roundToInt()}°C" + if (vm.isLiveVehicle) " (가정 — AAOS 외기온 연결 전)" else "")
        KeyValue("음성", vm.speaker.engineLabel)
    }

    if (!vm.isLiveVehicle) {
        CarCard {
            SectionTitle("시연 조작판", sub = "앱이 아니라 시연용 — 차량 값이 바뀌면 앱이 다시 판단한다")
            Stepper("배터리", pct(v.batteryPct), { vm.setBattery(v.batteryPct - 5) }, { vm.setBattery(v.batteryPct + 5) })
            Text("외기온", style = T.bodyS.copy(color = p.text3))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(px(12)), verticalArrangement = Arrangement.spacedBy(px(12))) {
                for ((label, c) in listOf("봄 15°" to 15.0, "초겨울 6°" to 6.0, "영하 1°" to 1.0, "한파 −7°" to -7.0, "여름 32°" to 32.0)) {
                    Chip(label, v.outsideTempC == c, { vm.setTemp(c) })
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(px(12)), verticalArrangement = Arrangement.spacedBy(px(12))) {
                Chip("공조 켬", v.hvacOn, { vm.setHvac(!v.hvacOn) })
                Chip("실주행 효율 반영 (${DemoData.REAL_EFFICIENCY_KWH_PER_100KM})", vm.realEfficiency, { vm.useRealEfficiency(!vm.realEfficiency) })
            }
            vm.advanceLabel?.let { CarButton(it, { vm.advance(); if (vm.step != Step.DRIVE) vm.step = Step.DRIVE }, tone = Tone.FILLED, modifier = Modifier.fillMaxWidth()) }
            Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
                CarButton("경유지 슬롯 비우기 (${vm.demoWaypointCount}/${DemoData.WAYPOINT_SLOTS})", { vm.clearDemoWaypoints() }, large = false, modifier = Modifier.weight(1f))
                CarButton("처음부터", { vm.restart(); vm.step = Step.PLAN }, large = false)
            }
        }
    }

    CarCard {
        SectionTitle("재판단 기록", sub = "판정이 바뀌거나 부족분이 3%p 이상 움직일 때만 쌓인다")
        if (vm.log.isEmpty()) Text("아직 없습니다.", style = T.bodyS.copy(color = p.text4))
        for (entry in vm.log.take(12)) {
            Text("${entry.time}  ${entry.text}", style = T.bodyS.copy(color = if (entry.verdictChanged) p.warn else p.text2))
        }
    }
}

@Composable
private fun PanelSheet(onClose: () -> Unit, content: @Composable () -> Unit) {
    val p = LocalP.current
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)).clickable(onClick = onClose)) {
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .heightIn(max = 640.dp)
                .clip(RoundedCornerShape(topStart = px(32), topEnd = px(32)))
                .background(p.bg2)
                .clickable(enabled = false) {}
                .verticalScroll(rememberScrollState())
                .padding(px(32)),
            verticalArrangement = Arrangement.spacedBy(px(24)),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("조작판 · 기록", style = T.titleS, modifier = Modifier.weight(1f))
                CarButton("닫기", onClose, large = false)
            }
            content()
        }
    }
}

@Composable
private fun NoticeDialog(text: String, onClose: () -> Unit) {
    val p = LocalP.current
    Dialog(onDismissRequest = onClose) {
        Column(
            Modifier.clip(RoundedCornerShape(px(32))).background(p.popup).padding(px(40)),
            verticalArrangement = Arrangement.spacedBy(px(32)),
        ) {
            Text(text, style = T.bodyL)
            CarButton("확인", onClose, tone = Tone.FILLED, modifier = Modifier.fillMaxWidth())
        }
    }
}

