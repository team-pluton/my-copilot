package app.commadrive.copilot

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.commadrive.app.ui.Badge
import app.commadrive.app.ui.CarButton
import app.commadrive.app.ui.CarCard
import app.commadrive.app.ui.Chip
import app.commadrive.app.ui.EnergyBar
import app.commadrive.app.ui.KeyValue
import app.commadrive.app.ui.LocalP
import app.commadrive.app.ui.PleosTheme
import app.commadrive.app.ui.T
import app.commadrive.app.ui.ToastHost
import app.commadrive.app.ui.Tone
import app.commadrive.app.ui.px
import app.commadrive.core.PassengerType
import app.commadrive.core.RecommendationEngine
import app.commadrive.core.assistant.ActionPhase
import app.commadrive.core.assistant.ClimateDecisionKind
import app.commadrive.core.assistant.ClimateState
import app.commadrive.core.assistant.EnergyStatus
import app.commadrive.core.assistant.Learning
import app.commadrive.core.assistant.Powertrain
import app.commadrive.core.assistant.CabinBatchPhase
import app.commadrive.core.assistant.CabinDecision
import app.commadrive.core.assistant.Context
import app.commadrive.core.assistant.Guidance
import app.commadrive.core.assistant.Lighting
import app.commadrive.core.assistant.Situation
import app.commadrive.core.assistant.Evidence
import app.commadrive.core.assistant.EvidenceKind
import app.commadrive.core.assistant.Gear
import app.commadrive.core.assistant.Intent
import app.commadrive.core.assistant.JourneyPhase
import app.commadrive.core.assistant.Memory
import app.commadrive.core.assistant.Missions
import app.commadrive.core.assistant.HandoffEvent
import app.commadrive.core.assistant.HandoffPhase
import app.commadrive.core.assistant.RouteHandoff
import app.commadrive.core.assistant.WaitSource
import app.commadrive.core.assistant.ProfileMode
import app.commadrive.core.assistant.Suggestion
import app.commadrive.core.assistant.SuggestionStatus
import app.commadrive.core.assistant.UxMode
import app.commadrive.core.assistant.SessionState
import app.commadrive.core.assistant.SourceOrigin
import app.commadrive.core.assistant.PrepareItemKey
import app.commadrive.core.assistant.DriveLevel
import app.commadrive.core.assistant.Freshness
import app.commadrive.core.assistant.LinkKind
import app.commadrive.core.assistant.SignalStatus
import app.commadrive.core.assistant.SuggestionType
import app.commadrive.core.assistant.Fresh
import app.commadrive.core.assistant.SignalKind
import app.commadrive.core.assistant.Profiles
import app.commadrive.core.assistant.SuggestionTier
import app.commadrive.core.assistant.EnergyOptionAction
import app.commadrive.core.assistant.PrepareItemState
import app.commadrive.core.assistant.WaitMode
import kotlin.math.roundToInt

/**
 * MY CO-PILOT 화면 — 웹 /copilot 의 앱 창과 같은 구성. **표시만** 한다(판단은 CopilotSession).
 * 세로가 기본(공식 840dp 창 기준), 넓으면 같은 비율로 키운다. 주행 제한이 켜지면 어느 탭이든 한 줄 화면.
 * 앱 창에 시스템 상단바·하단 탭을 그리지 않는다 — 탭은 내용 위의 칩 줄이다.
 */
private val ACTION_LABEL = mapOf("SET_CLIMATE" to "설정 확인", "SUGGEST_CHARGE_STOP" to "에너지 보기", "CONFIRM_FINISH" to "하차 준비 시작", "PREPARE_NEXT_LEG" to "귀가 일정 확인")
/** 근거 종류 이름 — 차량 값은 실제 신호가 들어왔을 때만 "차량 정보", 아니면 "시연 데이터" */
private fun evidenceLabel(k: EvidenceKind, real: Boolean) = when (k) { EvidenceKind.VEHICLE -> if (real) "차량 정보" else "시연 데이터"; EvidenceKind.USER -> "직접 설정"; EvidenceKind.ESTIMATE -> "추정"; EvidenceKind.RULE -> "판단 규칙" }
private fun SessionState.anyReal() = car.aaos != null || car.vehicleLive
/**
 * 제안 근거의 '차량 정보'는 그 제안이 쓰는 신호가 실제일 때만(E28 D2, 2026-11-11 에뮬레이터: 배터리는 실제·기어는 모의 주행인데 주차 근거가 '차량 정보'로 보였다).
 * 충전 판단 = 배터리 · 공조 = 실내 연결 · 주차·도착·휴식 = AAOS 주행 신호(모의 주행이면 끊긴다)
 */
private fun SessionState.realFor(t: SuggestionType) = when (t) {
    SuggestionType.ENERGY_DECISION -> car.vehicleLive
    SuggestionType.PROFILE_PREPARATION -> car.live(LinkKind.CABIN)
    SuggestionType.CHECKLIST_REMINDER, SuggestionType.ARRIVAL_PREPARATION, SuggestionType.BREAK_PLANNING -> car.aaos != null
    SuggestionType.NEXT_LEG -> false
}

@Composable
fun CopilotRoot(vm: CopilotViewModel) {
    val dark = isSystemInDarkTheme()
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wide = maxWidth > maxHeight * 1.15f && maxWidth >= 720.dp
        val u = (maxWidth.value / if (wide) 1700f else 840f).coerceIn(0.42f, 1.3f)
        PleosTheme(u, dark) {
            val p = LocalP.current
            var panel by rememberSaveable { mutableStateOf(false) }
            BackHandler(enabled = panel || vm.tab != Tab.HOME || vm.more) { if (panel) panel = false else { vm.tab = Tab.HOME; vm.more = false } }
            Box(Modifier.fillMaxSize().background(p.bg).safeDrawingPadding()) {
                Column(Modifier.fillMaxSize().padding(horizontal = px(40), vertical = px(28))) {
                    Header(vm, onPanel = { panel = true })
                    Spacer(Modifier.height(px(16)))
                    if (!vm.view.restricted && vm.state.chosen && (vm.more || vm.tab != Tab.HOME)) TabRow(vm)
                    Spacer(Modifier.height(px(16)))
                    // 가로(1700dp) 창 = 확장 정보 자리 — 오른쪽 열에 판단 근거·출처·제안 규칙(Pleos: 세로에 핵심, 가로에 확장)
                    val side = wide && !vm.view.restricted && vm.state.chosen && vm.tab != Tab.DETAIL
                    Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(px(24))) {
                    Column(Modifier.weight(1.4f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(px(20))) {
                        when {
                            vm.view.restricted -> DriveScreen(vm)
                            !vm.state.chosen -> ChooseScreen(vm)
                            else -> when (vm.tab) {
                                Tab.HOME -> HomeScreen(vm)
                                Tab.DETAIL -> DetailScreen(vm)
                                Tab.PREPARE -> PrepareScreen(vm)
                                Tab.ENERGY -> EnergyScreen(vm)
                                Tab.STOPS -> StopsScreen(vm)
                                Tab.FINISH -> FinishScreen(vm)
                                Tab.HISTORY -> HistoryScreen(vm)
                                Tab.PROFILE -> ProfileScreen(vm)
                            }
                        }
                    }
                    if (side) Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(px(20))) { DetailScreen(vm, back = false) }
                    }
                }
                // 바닥의 주요 버튼을 덮지 않게 버튼 한 줄 높이만큼 띄운다(웹 /copilot 과 같은 자리)
                ToastHost(vm.state.toast, onDone = { vm.send(Intent.ClearToast) }, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = px(144)))
                if (panel) ControlSheet(vm, onClose = { panel = false })
            }
        }
    }
}

@Composable
private fun Header(vm: CopilotViewModel, onPanel: () -> Unit) {
    val p = LocalP.current
    val s = vm.state
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(px(16))) {
        // 세로 창(두 창 배치)에서 출처 배지가 폭을 먼저 가져가 제목이 "MY / CO-PI / LOT" 로 꺾였다(E27-15) — 제목은 한 줄로 두고 배지가 남은 폭에서 줄을 바꾼다
        Column {
            Text("MY CO-PILOT", style = T.titleS, maxLines = 1, softWrap = false)
            Text(if (s.chosen) "${s.profile.name}${if (vm.view.restricted) " · 주행 중 · 한 줄 화면" else ""}" else "시작", style = T.labelM.copy(color = p.text3))
        }
        // 무엇이 차량 정보이고 무엇이 시연 데이터인지 섞어 말하지 않는다 — SDK 이름은 개발용 조작판에만
        val badge = when {
            !s.car.linkLive -> if (s.car.links.values.any { it.live }) "일부 차량 연결 끊김" else "차량 연결 끊김"
            else -> {
                val live = listOfNotNull("주행".takeIf { s.car.aaos != null }, "배터리".takeIf { s.car.vehicleLive }, (if (s.car.seatReadable) "공조·시트·도어" else "공조·도어").takeIf { s.car.cabinLive })
                if (live.isEmpty()) "시연 데이터" else "${live.joinToString("·")} 차량 정보 · 그 밖은 시연 데이터"
            }
        }
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) { Badge(badge, if (s.car.linkLive) p.warn else p.negative) }
        // 차량(Automotive) 기기의 배포 빌드에서는 운전자 앞에 모의 조작판을 두지 않는다 — 폰·JVM 시연과 디버그 빌드에서만
        if (!vm.automotive || vm.debuggable) CarButton("개발용", onPanel, large = false)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TabRow(vm: CopilotViewModel) {
    // 한 줄 — 세로 창(840dp)에서 탭이 두 줄을 차지하면 본문이 밀린다. 넘치면 옆으로 민다
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(px(10))) {
        Tab.entries.forEach { t -> Chip(t.label, vm.tab == t, { vm.tab = t }) }
    }
}

// ── 프로필 선택 ─────────────────────────────────────
@Composable
private fun ChooseScreen(vm: CopilotViewModel) {
    val p = LocalP.current
    val s = vm.state
    // 질문 하나 — 혼자 · 가족 · 동승자. 맥락 버튼 하나로 바로 출발 준비(비교)가 시작된다(One Choice, Ready to Drive). 둘째 조합은 작은 칩, 지난번 조합은 맨 위에
    CarCard(tint = p.surface) {
        Text("탑승", style = T.labelM.copy(color = p.text3))
        Text("오늘은 누구와 함께 가시나요?", style = T.titleL)
        s.vault.lastMode?.let { m -> CarButton("지난번처럼 · ${s.vault.lastDriver?.let { s.vault.drivers[it]?.name + " · " } ?: ""}${s.profiles.getValue(m).name}", { vm.send(Intent.SetDriver(s.vault.lastDriver)); vm.send(Intent.ChooseAndPrepare(m)) }, Modifier.fillMaxWidth(), tone = Tone.POSITIVE) }
        // 운전자는 사용자가 고른다 — 공개 SDK 에 운전자 프로필·디지털 키 API 가 없다. 고르지 않으면 운전석 설정은 유지
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(px(10))) {
            Text("운전자", style = T.labelM.copy(color = p.text3))
            Situation.DEMO_DRIVER_IDS.forEach { id -> val d = s.vault.drivers[id] ?: return@forEach; Chip(d.name, s.driver == id, { vm.send(Intent.SetDriver(if (s.driver == id) null else id)) }) }
            Text(if (s.driver != null) "운전석 취향 적용" else "미확인 · 운전석은 차량 프로필 그대로", style = T.labelM.copy(color = p.text3))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
            Context.entries.forEach { c -> CarButton(c.label, { vm.send(Intent.ChooseAndPrepare(Profiles.CONTEXT_MODES.getValue(c)[0])) }, Modifier.weight(1f)) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(px(10))) {
            Context.entries.forEach { c -> Profiles.CONTEXT_MODES.getValue(c).drop(1).forEach { m -> CarButton("${c.label} · ${s.profiles.getValue(m).name}", { vm.send(Intent.ChooseAndPrepare(m)) }, large = false) } }
        }
        Text("동승자는 자동으로 알아내지 않습니다 — 고른 것만 씁니다. 고르면 저장된 취향과 지금 차량 설정을 비교해 다른 것만 제안합니다.", style = T.labelM.copy(color = p.text3))
        Text("프로필 없이 시작", style = T.labelM.copy(color = p.text3), modifier = Modifier.clickable { vm.send(Intent.ChooseAndPrepare(ProfileMode.GUEST)) }.padding(vertical = px(10)))
    }
}

// ── A 홈 ───────────────────────────────────────────
/**
 * 운전자용 홈(2차 P0-1) — 상태 두 줄(차량 · 여정을 따로) · 지금 상황 · 제안 하나 + 버튼 하나 · 함께 준비할 것 ≤2.
 * 근거·추천함·제안 규칙은 "자세히" 탭으로. 웹 HomeScreen 과 같은 구성이다.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HomeScreen(vm: CopilotViewModel) {
    val p = LocalP.current
    val s = vm.state
    val v = vm.view
    val top = v.suggestions.top
    val phase = s.journey.phase
    val notStarted = phase == JourneyPhase.NOT_STARTED || phase == JourneyPhase.COMPLETED
    val guest = s.mode == ProfileMode.GUEST
    val waiting = phase == JourneyPhase.WAITING
    val preparing = phase == JourneyPhase.PREPARING
    // 화면 위계(V5 지시서 8절): 최상단 Mission 목적·단계(복귀 유지 · 대기의 출처) → 중앙 다음 행동 하나 → 하단 차량 상태 요약. 웹 HomeScreen 과 같은 구성
    val mission = v.mission
    if (mission != null) {
        Text(Missions.headline(mission), style = T.titleM)
        Missions.returnLine(mission)?.let { Text(it, style = T.bodyM.copy(color = p.text2)) }
        val waitLine = when {
            mission.wait.minutes > 0 -> "도착 후 대기 ${mission.wait.minutes}분 · ${mission.wait.source.label}"
            mission.wait.source == WaitSource.NONE -> "대기 계획 ${WaitSource.NONE.label}"
            else -> null
        }
        waitLine?.let { Text(it, style = T.labelM.copy(color = p.text3)) }
    } else Text(v.situation, style = T.titleS)
    // V6 통합 판단 — 장거리 여정에서만. 진입할 때 한 번 판단하고 주차 상태가 바뀌면 다시 본다(주행 중 조작은 없다)
    val parked = !v.restricted && s.car.gear == Gear.PARK
    val longJourney = !notStarted && s.plan.mode == app.commadrive.core.TripMode.JOURNEY && s.plan.routeKm >= 100
    if (longJourney) {
        // s.car.vehicleLive — 첫 판단이 차량 콜백보다 먼저 돌면 배터리 근거가 '시연 데이터'로 남았다(에뮬레이터 E27-08). 실제 값이 들어오면 다시 판단한다
        androidx.compose.runtime.LaunchedEffect(phase, parked, s.vehicle.batteryPct.roundToInt(), s.car.vehicleLive) { vm.decisions.refresh() }
        if (parked) DecisionCard(vm.decisions, parked) else DecisionOneLine(vm.decisions, parked)
    }
    if (waiting) CarCard(tint = p.surface) {
        Text("${s.plan.destinationName.removeSuffix(" (왕복)")} ${v.status.trip.label}", style = T.titleM)
        Text("${s.waitedMin}분 지남 · 귀가 ${s.plan.returnKm.roundToInt()}km 남음 · ${v.energyView.headline}", style = T.bodyM.copy(color = p.text2))
        WaitModePicker(s.waitMode, enabled = !v.restricted) { vm.send(Intent.SetWaitMode(it)) }
        Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
            CarButton("잠시 내리기", { vm.send(Intent.StartFinish); vm.tab = Tab.FINISH }, Modifier.weight(1f), large = false)
            CarButton("여정 끝내기", { vm.send(Intent.EndTrip) }, Modifier.weight(1f), large = false)
        }
        // 원탭 다음 이동 — 귀가 일정을 확인한 뒤에만. 확인 전 '설정됨'이라 하지 않는다(목적지를 다시 읽어 맞아야 확인됨)
        if (v.canRouteHome) RouteHomeBlock(vm)
    }
    v.atWaypoint?.let { wp ->
        CarCard(tint = p.surface) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${wp.name} · 충전 중", style = T.bodyM, modifier = Modifier.weight(1f))
                CarButton("80% 충전 완료 (시연)", { vm.send(Intent.Charge) }, tone = Tone.POSITIVE, large = false)
            }
        }
    }
    // 출발 준비 중 — 위험 제안(충전 부족)은 맨 위 하나, 그 아래 준비 카드(실내 비교 · 승인 하나 · 준비물 · 에너지 한 줄)
    if (preparing) {
        // V6 카드가 같은 판단(충전)을 이미 말하고 있으면 한 번만 보인다 — 한 화면에 판단 하나
        // 판단을 받는 중(pending)이어도 V6 카드가 이 자리다 — 다른 엔진의 '충전 계획이 필요해요'를 따로 띄우지 않는다(E28 D7)
        val saidByDecision = longJourney && parked && (vm.decisions.decision != null || vm.decisions.pending) && top?.type == SuggestionType.ENERGY_DECISION
        if (top != null && top.tier == SuggestionTier.RISK && !saidByDecision) SuggestionBlock(vm, top)
        PrepareCard(vm)
    }
    // 대기·충전 카드가 있고 제안이 없으면 그 카드가 이 자리다 — 빈 제안 카드를 또 두지 않는다
    if (!preparing && !((waiting || v.atWaypoint != null) && top == null)) CarCard(tint = p.surface) {
        when {
            notStarted -> {
                Text(if (phase == JourneyPhase.COMPLETED) "이동을 마쳤습니다" else if (guest) "출발 준비를 할까요?" else "${s.profile.name} · 저장된 취향으로 준비할까요?", style = T.titleL)
                Text(
                    when {
                        phase == JourneyPhase.COMPLETED && guest -> "탑승 조합을 고르면 다음에는 공조·시트·준비물·하차 확인까지 함께 챙깁니다."
                        phase == JourneyPhase.COMPLETED -> "다음 이동도 같은 조합이면 한 번의 탭으로 준비합니다."
                        guest -> "개인 취향 없이 내비 경로로 충전이 필요한지만 봅니다."
                        else -> "온도·시트·음악·안내 방식을 지금 차량 설정과 비교해 다른 것만 제안합니다."
                    }, style = T.bodyM.copy(color = p.text2),
                )
            }
            top != null -> {
                Text(top.title, style = T.titleL)
                Text(top.explanation, style = T.bodyM.copy(color = p.text2))
                Text("왜 이 제안인가요? ›", style = T.labelM.copy(color = p.text3), modifier = Modifier.clickable { vm.tab = Tab.DETAIL }.padding(vertical = px(10)))
            }
            else -> {
                Text("지금은 드릴 제안이 없습니다", style = T.titleL)
                Text("문제가 없으면 조용히 있습니다. 상황이 바뀌면 하나만 골라 알려 드립니다.", style = T.bodyM.copy(color = p.text2))
            }
        }
    }
    when {
        notStarted -> CarButton(if (phase == JourneyPhase.COMPLETED && guest) "새 이동 (프로필 없이)" else if (phase == JourneyPhase.COMPLETED) "${s.profile.name}으로 다시 준비" else "준비 시작", { vm.send(Intent.StartPrepare) }, Modifier.fillMaxWidth(), tone = Tone.POSITIVE)
        !preparing && top != null -> {
            CarButton(top.action?.let { ACTION_LABEL[it.name] } ?: "확인", { primary(vm, top) }, Modifier.fillMaxWidth(), tone = Tone.POSITIVE)
            CarButton("이번에는 건너뛰기", { vm.send(Intent.Dismiss(top.type)); vm.send(Intent.ClearToast) }, Modifier.fillMaxWidth(), large = false)
            Text(top.ifSkipped, style = T.labelM.copy(color = p.text3), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
    }
    if (v.canFinishQuietly) CarButton("이동 마치기", { vm.send(Intent.EndTrip) }, Modifier.fillMaxWidth(), tone = Tone.POSITIVE)
    if ((v.canStartWait || v.canEndTrip) && !waiting) Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
        if (v.canStartWait) CarButton("내리지 않고 기다리기", { vm.send(Intent.StartWait) }, Modifier.weight(1f), large = false)
        if (v.canEndTrip) CarButton("여정 끝내기", { vm.send(Intent.EndTrip) }, Modifier.weight(1f), large = false)
    }
    if (!preparing && v.suggestions.companions.isNotEmpty()) {
        Text("함께 준비할 것", style = T.labelM.copy(color = p.text3))
        v.suggestions.companions.forEach { c ->
            CarCard(pad = 24, tint = p.surface) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(c.title, style = T.bodyM, modifier = Modifier.weight(1f))
                    CarButton(when (c.action?.name) { "SET_CLIMATE" -> "맞추기"; "PREPARE_NEXT_LEG" -> "확인"; else -> "보기" }, { primary(vm, c) }, large = false)
                }
            }
        }
    }
    // 하단 — 차량 상태와 여정 상태(따로) · 지금 상황 한 줄
    FlowRow(horizontalArrangement = Arrangement.spacedBy(px(10)), verticalArrangement = Arrangement.spacedBy(px(10))) {
        StatusPill("차량", v.status.vehicle.label)
        StatusPill("여정", v.status.trip.label)
        Text(if (s.anyReal()) "차량 정보 + 시연 데이터" else "시연 데이터", style = T.labelM.copy(color = p.text3))
    }
    if (mission != null) Text(v.situation, style = T.bodyM.copy(color = p.text2))
}

@Composable
private fun RouteHomeBlock(vm: CopilotViewModel) {
    val p = LocalP.current
    val h = vm.state.handoff
    h.message?.let { Text(it, style = T.bodyM.copy(color = if (h.phase == HandoffPhase.FAILED || h.phase == HandoffPhase.NO_HOME) p.negative else if (h.phase == HandoffPhase.VERIFIED) p.positive else p.text2)) }
    when (h.phase) {
        HandoffPhase.LOOKING -> Text("내비 즐겨찾기와 지금 경로를 확인하는 중", style = T.labelM.copy(color = p.text3))
        HandoffPhase.PENDING, HandoffPhase.UNKNOWN_OUTCOME -> Text("내비에 경로를 요청했어요 · 목적지를 다시 읽어 확인하는 중", style = T.labelM.copy(color = p.text3))
        HandoffPhase.CONFIRM_REPLACE -> Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
            CarButton("집 경로로 바꾸기", { vm.confirmRouteReplace() }, Modifier.weight(1f), tone = Tone.POSITIVE, large = false)
            CarButton("기존 경로 유지", { vm.send(Intent.Handoff(HandoffEvent.Cancel)) }, Modifier.weight(1f), large = false)
        }
        else -> RouteHandoff.button(h)?.let { CarButton(it, { vm.startRouteHome() }, Modifier.fillMaxWidth(), tone = Tone.POSITIVE) }
    }
}

@Composable
private fun SuggestionBlock(vm: CopilotViewModel, top: Suggestion) {
    val p = LocalP.current
    CarCard(tint = p.surface) {
        Text(top.title, style = T.titleL)
        Text(top.explanation, style = T.bodyM.copy(color = p.text2))
        Text("왜 이 제안인가요? ›", style = T.labelM.copy(color = p.text3), modifier = Modifier.clickable { vm.tab = Tab.DETAIL }.padding(vertical = px(10)))
    }
    CarButton(top.action?.let { ACTION_LABEL[it.name] } ?: "확인", { primary(vm, top) }, Modifier.fillMaxWidth(), tone = Tone.POSITIVE)
    CarButton("이번에는 건너뛰기", { vm.send(Intent.Dismiss(top.type)); vm.send(Intent.ClearToast) }, Modifier.fillMaxWidth(), large = false)
    Text(top.ifSkipped, style = T.labelM.copy(color = p.text3), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
}

/**
 * 출발 준비 카드(ONE SCREEN) — 짧은 결과 한 문장 → 달라서 바꿀 것(승인 하나) → 차량에서 직접 볼 것 → 준비물(있을 때만) → 에너지 한 줄.
 * 전부 맞으면 "확인했어요" 한 줄로 끝난다. 제어 결과는 항목마다, 확인 전에는 '적용 완료'라 하지 않는다. 웹 PrepareCard 와 같은 구성
 */
@Composable
private fun PrepareCard(vm: CopilotViewModel) {
    val p = LocalP.current
    val s = vm.state
    val v = vm.view
    val cabin = v.cabin
    val b = s.cabinBatch
    val show = cabin.items.filter { it.decision != CabinDecision.NO_PREF && !(it.decision == CabinDecision.SAME && b.phase == CabinBatchPhase.IDLE && cabin.toApply.isNotEmpty()) }
    v.candidate?.let { c ->
        CarCard(tint = p.surface) {
            Text("기억할까요 · 차량 상태 변화를 관찰한 것", style = T.labelM.copy(color = p.text3))
            Text(c.line, style = T.bodyM)
            Text(Learning.CAVEAT, style = T.labelM.copy(color = p.text3))
            Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
                CarButton("저장", { vm.send(Intent.AcceptLearning(c.key)) }, Modifier.weight(1f), tone = Tone.POSITIVE, large = false)
                CarButton("이번엔 아니요", { vm.send(Intent.DeclineLearning(c.key, c.value)) }, Modifier.weight(1f), large = false)
            }
        }
    }
    CarCard(tint = p.surface) {
        Text(v.whoLabel, style = T.labelM.copy(color = p.text3))
        Text((if (v.prepareReady) "✓ " else "") + when (b.phase) { CabinBatchPhase.DONE -> b.settled?.summary ?: cabin.summary; CabinBatchPhase.KEPT -> "지금 설정 그대로 갑니다"; else -> cabin.summary }, style = T.titleL)
        if (b.phase == CabinBatchPhase.DONE && b.settled != null) b.settled!!.results.forEach { r -> Text("· ${r.line} · ${r.status.label}", style = T.bodyM.copy(color = if (r.status.name == "APPLIED") p.active else p.negative)) }
        else show.forEach { Text("· ${it.line}", style = T.bodyM.copy(color = when (it.decision) { CabinDecision.APPLY -> p.text; CabinDecision.SAME -> p.active; CabinDecision.NO_PREF, CabinDecision.UNSUPPORTED -> p.text3; else -> p.text2 })) }
        b.message?.let { Text(it, style = T.bodyM.copy(color = p.negative)) }
        if (b.phase == CabinBatchPhase.IDLE && cabin.toApply.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
            CarButton("${cabin.toApply.size}개 한 번에 적용", { vm.applyCabin() }, Modifier.weight(1f), tone = Tone.POSITIVE)
            CarButton("지금 그대로", { vm.send(Intent.KeepCabin) }, Modifier.weight(1f))
        }
        if (b.phase == CabinBatchPhase.PENDING) CarButton("차량에 적용 중 · 결과를 다시 읽습니다", {}, Modifier.fillMaxWidth(), loading = true, enabled = false)
        Text(v.seatMemo, style = T.labelM.copy(color = p.text3))
    }
    if (s.profile.packing.isNotEmpty()) CarCard(tint = p.surface) {
        val left = s.profile.packing.filter { it !in s.memory.packed }
        Row { Text("준비물 · ${s.memory.packed.size}/${s.profile.packing.size}", style = T.labelM.copy(color = p.text3), modifier = Modifier.weight(1f)); if (left.isEmpty()) Text("모두 챙김", style = T.labelM.copy(color = p.active, fontWeight = FontWeight.SemiBold)) }
        CheckRows(s.profile.packing, s.memory.packed) { vm.send(Intent.SetPacked(it)) }
        if (left.isNotEmpty() && PrepareItemKey.PACKING !in s.memory.skipped) Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
            CarButton("모두 챙겼어요", { vm.send(Intent.PackAll) }, Modifier.weight(1f), tone = Tone.POSITIVE, large = false)
            CarButton("이번에는 건너뛰기", { vm.send(Intent.SkipPrepare(PrepareItemKey.PACKING)) }, Modifier.weight(1f), large = false)
        }
    }
    val energy = v.prepare.items[2]
    if (energy.state != PrepareItemState.NOT_APPLICABLE) Text("⚡ ${energy.line}", style = T.bodyM.copy(color = when (energy.state) { PrepareItemState.DONE -> p.active; PrepareItemState.NEEDS_CHECK -> p.text; else -> p.text3 }))
    if (v.prepareReady) Text("✓ 출발하세요 — 출발하면 한 줄 화면으로 바뀝니다", style = T.bodyM.copy(color = p.active), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    Text(if (s.profile.cabin.guidance == Guidance.QUIET) "최소 안내 · 주행 중에는 위험한 것만 말합니다" else "일반 안내", style = T.labelM.copy(color = p.text3), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    Text("자세히 ›", style = T.labelM.copy(color = p.text3), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().clickable { vm.more = true; vm.tab = Tab.DETAIL }.padding(vertical = px(10)))
}

@Composable
private fun StatusPill(label: String, value: String) {
    val p = LocalP.current
    Row(Modifier.clip(RoundedCornerShape(px(40))).background(p.surfaceHigh).padding(horizontal = px(16), vertical = px(6)), horizontalArrangement = Arrangement.spacedBy(px(8))) {
        Text(label, style = T.labelM.copy(color = p.text3))
        Text(value, style = T.labelM.copy(fontWeight = FontWeight.SemiBold))
    }
}

/** 대기 유형 — 사용자가 알려 주는 사실. 차 안이면 공조가 대기 시간만큼 배터리를 쓴다 */
@Composable
private fun WaitModePicker(mode: WaitMode, enabled: Boolean, onChange: (WaitMode) -> Unit) {
    val p = LocalP.current
    Row(horizontalArrangement = Arrangement.spacedBy(px(10))) {
        listOf(WaitMode.AWAY to "주차 중 공조 미사용 가정", WaitMode.IN_CAR to "공조 사용 가정 · 배터리를 씀").forEach { (m, hint) ->
            val on = mode == m
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(px(24))).background(if (on) p.filled else p.btn)
                    .clickable(enabled = enabled) { onChange(m) }.padding(horizontal = px(20), vertical = px(14)),
            ) {
                Text(if (m == WaitMode.AWAY) "차를 두고 다녀옴" else "차 안에서 기다림", style = T.bodyM.copy(fontWeight = FontWeight.SemiBold, color = if (on) p.filledText else p.text))
                Text(hint, style = T.labelM.copy(color = if (on) p.filledText.copy(alpha = 0.8f) else p.text3))
            }
        }
    }
}

private fun primary(vm: CopilotViewModel, s: Suggestion) {
    when (s.action?.name) {
        "SET_CLIMATE" -> vm.tab = Tab.PREPARE
        "SUGGEST_CHARGE_STOP" -> vm.tab = if (s.type.name == "BREAK_PLANNING") Tab.STOPS else Tab.ENERGY
        "CONFIRM_FINISH" -> { vm.send(Intent.StartFinish); vm.tab = Tab.FINISH }
        // 귀가 구간 준비(V5) — "준비됨" 표시뿐. 내비 목적지는 앱이 바꾸지 않는다
        "PREPARE_NEXT_LEG" -> vm.send(Intent.ReadyNextLeg)
        else -> vm.send(Intent.Accept(s.type))
    }
}

@Composable
private fun EvidenceList(items: List<Evidence>, real: Boolean) {
    val p = LocalP.current
    Column(verticalArrangement = Arrangement.spacedBy(px(8))) {
        items.forEach { e ->
            Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
                val tone = when (e.kind) { EvidenceKind.VEHICLE -> p.positive; EvidenceKind.USER -> p.active; EvidenceKind.ESTIMATE -> p.auto; EvidenceKind.RULE -> p.text3 }
                Text(evidenceLabel(e.kind, real), style = T.labelM.copy(color = tone, fontWeight = FontWeight.SemiBold), modifier = Modifier.padding(end = px(4)))
                Text(e.text, style = T.labelM.copy(color = p.text2), modifier = Modifier.weight(1f))
            }
        }
    }
}

// ── A 자세히 — 왜 이 제안인가 · 데이터 출처 · 추천함 · 제안 규칙 ─────────────
@Composable
private fun DetailScreen(vm: CopilotViewModel, back: Boolean = true) {
    val p = LocalP.current
    val s = vm.state
    val v = vm.view
    val top = v.suggestions.top
    CarCard {
        Text("지금 제안", style = T.labelM.copy(color = p.text3))
        if (top != null) {
            Text(top.title, style = T.titleM)
            Text(top.explanation, style = T.bodyM.copy(color = p.text2))
            EvidenceList(top.evidence, s.realFor(top.type))
            Text("건너뛰면 · ${top.ifSkipped}", style = T.labelM.copy(color = p.text3))
        } else Text("지금은 제안이 없습니다.", style = T.bodyM.copy(color = p.text2))
    }
    CarCard {
        Text("값의 출처", style = T.labelM.copy(color = p.text3))
        // 값마다 언제 받은 값인지 — 어느 연결로 오는 값인지에 따라. 끊기기 전 값은 보여 주되 판단에 쓰지 않는다(Freshness.kt)
        fun row(label: String, kind: SignalKind, value: String, readable: Boolean = true, real: Boolean = false): Triple<String, String, Pair<String?, Boolean>> {
            val lk = Fresh.linkOf(kind)!!
            val live = s.car.live(lk)
            val lost = s.car.lostAt(lk)
            val readAt = if (live) s.simMin else lost?.let { it.take(2).toInt() * 60 + it.takeLast(2).toInt() - 8 * 60 }
            val st = s.car.signalStatus.getValue(kind)
            val f = if (readable) Fresh.of(kind, readAt, s.simMin, live, st) else Freshness.UNKNOWN
            val line = if (st != SignalStatus.OK && live) st.label else Fresh.sourceLine(f, if (live) s.clock else lost, if (real) SourceOrigin.VEHICLE else SourceOrigin.DEMO)
            return Triple(label, if (f == Freshness.UNKNOWN) "모름" else value, line to Fresh.usable(f))
        }
        val sources = listOf(
            row("배터리", SignalKind.SOC, "${s.vehicle.batteryPct.roundToInt()}%", real = s.car.vehicleLive),
            row("공조 설정 온도", SignalKind.HVAC, "${s.car.hvacC.roundToInt()}°C", s.car.hvacReadable, real = s.car.cabinLive),
            row("기어", SignalKind.GEAR, mapOf(Gear.PARK to "P", Gear.DRIVE to "D", Gear.REVERSE to "R", Gear.NEUTRAL to "N", Gear.UNKNOWN to "모름").getValue(v.signals.gear), real = s.car.aaos != null),
            row("주행 제한", SignalKind.UX, v.signals.uxRestricted?.let { if (it) "켜짐" else "꺼짐" } ?: "모름", real = s.car.aaos != null),
        )
        sources.forEach { (label, value, rest) ->
            Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
                Text(label, style = T.labelM.copy(color = p.text3))
                Text("$value${rest.first?.let { " · $it" } ?: ""}", style = T.labelM.copy(color = if (rest.second) p.text else p.text3), textAlign = TextAlign.End, modifier = Modifier.weight(1f))
            }
        }
        KeyValue("내 설정", if (s.mode == ProfileMode.GUEST) "없음 (프로필 없이)" else "${s.profile.name} · 직접 설정")
    }
    // "필요할 때만 제안한다"를 보이게 — 지금 판단 기준(이번 이동 누적이 아니다). 웹 DetailScreen 과 같은 줄
    CarCard(pad = 24) {
        val a = v.suggestions.audit
        Text("지금 판단의 집계", style = T.labelM.copy(color = p.text3))
        Text("검토 ${a.reviewed} · 앞에 띄움 ${a.shown} · 띄우지 않음 ${a.held.size}", style = T.bodyM)
        a.held.forEach { h -> Text("· ${SUGGESTION_SHORT.getValue(h.type)} — ${h.reason.label}", style = T.labelM.copy(color = p.text2)) }
    }
    val inbox = v.suggestions.inbox
    if (inbox.isNotEmpty()) CarCard(pad = 24) {
        Text("추천함 ${inbox.size} · 지금 앞에 띄우지 않은 것", style = T.labelM.copy(color = p.text2))
        inbox.forEach { x ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(x.title, style = T.labelM.copy(color = p.text2), modifier = Modifier.weight(1f))
                if (x.status == SuggestionStatus.DEFERRED) Text("다시 켜기", style = T.labelM.copy(color = p.positive), modifier = Modifier.clickable { vm.send(Intent.Reactivate(x.type)) }.padding(px(10)))
                else Text("정차하면", style = T.labelM.copy(color = p.text3))
            }
        }
    }
    CarCard(pad = 24, tint = p.surfaceHigh) {
        Text("제안은 이렇게 고릅니다", style = T.labelM.copy(color = p.text3))
        listOf(
            "주행 중 금지·권한 없음·미지원은 먼저 뺍니다", "위험(에너지 부족) → 지금 단계의 할 일 → 참고 순서",
            "거절하면 10분 쉬고, 3번 연속이면 추천함으로 (에너지 부족은 예외)", "주행 중에는 중요한 것 하나만, 나머지는 정차할 때까지", "문제가 없으면 아무것도 제안하지 않습니다",
        ).forEach { Text("· $it", style = T.labelM.copy(color = p.text2)) }
    }
    if (back) CarButton("홈으로", { vm.tab = Tab.HOME }, Modifier.fillMaxWidth())
}

// ── C 출발 준비 ─────────────────────────────────────
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PrepareScreen(vm: CopilotViewModel) {
    val p = LocalP.current
    val s = vm.state
    val v = vm.view
    val a = s.action
    val target = s.profile.targetC
    val pr = v.prepare
    val (climate, packing, energy) = pr.items
    Text(pr.summary, style = T.titleS)
    if (climate.state != PrepareItemState.NOT_APPLICABLE) CarCard(tint = p.surface) {
        Row { Text("공조", style = T.labelM.copy(color = p.text3), modifier = Modifier.weight(1f)); PrepStateLabel(climate.state) }
        Text(climate.line, style = T.bodyM.copy(fontWeight = FontWeight.SemiBold, color = when (climate.state) { PrepareItemState.DONE -> p.active; PrepareItemState.UNSUPPORTED -> p.text2; else -> p.text }))
        if (a.message != null && (a.phase == ActionPhase.FAILED || a.phase == ActionPhase.UNKNOWN_OUTCOME || a.phase == ActionPhase.IDLE)) {
            Text(a.message!! + if (a.phase != ActionPhase.IDLE) " · 모의" else "", style = T.bodyM.copy(color = p.negative))
        }
        val blocked = v.climateGate.block?.takeIf { it.name != "NEEDS_CONFIRMATION" } != null
        if (a.phase == ActionPhase.CONFIRMING) {
            Text("차량 공조를 ${s.car.hvacC.roundToInt()}°C → ${target?.roundToInt()}°C 로 바꿉니다", style = T.bodyM)
            Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
                CarButton("${target?.roundToInt()}°C 적용", { vm.confirmClimate() }, Modifier.weight(1f), tone = Tone.POSITIVE)
                CarButton("지금 그대로 두기", { vm.send(Intent.KeepClimate) }, Modifier.weight(1f))
            }
        } else if (climate.state == PrepareItemState.NEEDS_CHECK && !blocked) Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
            CarButton(if (a.phase == ActionPhase.FAILED) "다시 시도" else "${target?.roundToInt()}°C 로 맞추기", { vm.send(Intent.RequestClimate) }, Modifier.weight(1f),
                tone = Tone.POSITIVE, loading = a.phase == ActionPhase.PENDING, enabled = !(a.phase == ActionPhase.UNKNOWN_OUTCOME && !a.canRetry))
            CarButton("지금 그대로 두기", { vm.send(Intent.KeepClimate) }, Modifier.weight(1f), enabled = a.phase != ActionPhase.PENDING)
        }
    }
    if (packing.state != PrepareItemState.NOT_APPLICABLE) CarCard(tint = p.surface) {
        Row { Text("준비물 · ${s.memory.packed.size}/${s.profile.packing.size}", style = T.labelM.copy(color = p.text3), modifier = Modifier.weight(1f)); PrepStateLabel(packing.state) }
        CheckRows(s.profile.packing, s.memory.packed) { vm.send(Intent.SetPacked(it)) }
        if (packing.state == PrepareItemState.NEEDS_CHECK) SkipLink { vm.send(Intent.SkipPrepare(PrepareItemKey.PACKING)) }
    }
    CarCard(tint = p.surface) {
        Row { Text("충전 계획 · 추정", style = T.labelM.copy(color = p.text3), modifier = Modifier.weight(1f)); PrepStateLabel(energy.state) }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(energy.line, style = T.bodyM.copy(fontWeight = FontWeight.SemiBold), modifier = Modifier.weight(1f))
            CarButton("보기", { vm.tab = Tab.ENERGY }, large = false)
        }
        if (energy.state == PrepareItemState.NEEDS_CHECK) SkipLink { vm.send(Intent.SkipPrepare(PrepareItemKey.ENERGY)) }
    }
    if (s.memory.prepareDone || pr.ready) Text(if (pr.ready) "✓ 바로 출발하셔도 됩니다 · 출발하면 한 줄 화면으로 바뀝니다" else "출발 준비를 마쳤습니다 · 출발하면 한 줄 화면으로 바뀝니다", style = T.bodyM.copy(color = p.active))
    else CarButton("확인 필요 ${pr.needs}개를 두고 출발 준비 마치기", { vm.send(Intent.FinishPrepare) }, Modifier.fillMaxWidth())
}

/** 체크 줄 — 출발 준비물·하차 확인이 같은 모양(웹과 같다). 줄 전체가 터치 영역(≥80), 지우기는 프로필 탭에서만 */
@Composable
private fun CheckRows(items: List<String>, checked: List<String>, onChange: (List<String>) -> Unit) {
    val p = LocalP.current
    Column {
        items.forEach { item ->
            val on = item in checked
            Row(
                Modifier.fillMaxWidth().heightIn(min = px(80)).clickable(role = Role.Checkbox) { onChange(if (on) checked - item else checked + item) },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(px(16)),
            ) {
                Box(Modifier.size(px(48)).clip(RoundedCornerShape(px(12))).background(if (on) p.positive else p.btn), contentAlignment = Alignment.Center) {
                    if (on) Text("✓", style = T.bodyM.copy(color = androidx.compose.ui.graphics.Color.White, fontWeight = FontWeight.SemiBold))
                }
                Text(item, style = T.bodyS.copy(color = if (on) p.text3 else p.text, textDecoration = if (on) androidx.compose.ui.text.style.TextDecoration.LineThrough else null))
            }
        }
    }
}

/** 이번에는 건너뛰기 — 작은 글자 버튼(완료처럼 보이지 않게). 터치 영역은 넉넉히 */
@Composable
private fun SkipLink(onClick: () -> Unit) {
    Text("이번에는 건너뛰기", style = T.labelM.copy(color = LocalP.current.text3), modifier = Modifier.clickable(onClick = onClick).padding(vertical = px(14)))
}

@Composable
private fun PrepStateLabel(st: PrepareItemState) {
    val p = LocalP.current
    val c = when (st) { PrepareItemState.DONE -> p.active; PrepareItemState.NEEDS_CHECK -> p.text; PrepareItemState.SKIPPED -> p.text2; else -> p.text3 }
    val t = st.label
    Text(t, style = T.labelM.copy(color = c, fontWeight = FontWeight.SemiBold))
}

// ── D 에너지 · 후보 ─────────────────────────────────
/** 판정 · 그다음 무엇을 할 수 있나(2차 P0-4) — 전부 쉼표 DRIVE estimate 를 조건만 바꿔 다시 부른 값. 자동으로 바꾸지 않는다 */
@Composable
private fun EnergyScreen(vm: CopilotViewModel) {
    val p = LocalP.current
    val v = vm.view
    var how by remember { mutableStateOf(false) }
    Text("에너지 · ${v.energyBasis.label} · 범위 포함", style = T.titleS)
    CarCard(tint = p.surface) {
        Text(v.energyView.headline, style = T.titleL.copy(color = statusColor(v.energyView.status)))
        Text(v.energyView.detail + (v.energyMissing?.let { " · $it" } ?: ""), style = T.bodyM.copy(color = p.text2))
        EnergyBar(v.energy, vm.state.vehicle.batteryPct)
        KeyValue(if (vm.state.car.vehicleLive) "지금 배터리 · 차량 정보" else "지금 배터리 · 시연 데이터", "${v.energyView.currentSocPct ?: "—"}%")
        KeyValue("예상 도착 잔량", "${v.energyView.arrivalSocPct ?: "—"}%${if (v.energyView.depletesBeforeArrival) " · 도착 전 소진 예상" else ""}")
    }
    // 마지막 재판단 — 전 → 후 → 원인(웹 RejudgeCard 와 같은 구성). 원인이 하나가 아니면 그렇게 쓴다
    v.rejudge?.let { r ->
        CarCard(tint = p.surfaceHigh) {
            Text("재판단 ${r.clock} · 귀가 후 예상 잔량 · 추정", style = T.labelM.copy(color = p.text3))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(px(12))) {
                Column(Modifier.weight(1f)) { Text(r.fromLabel, style = T.labelM.copy(color = p.text3)); Text("${r.fromPct}%", style = T.titleM) }
                Text("→", style = T.titleM.copy(color = p.text3))
                Column(Modifier.weight(1f)) { Text(r.toLabel, style = T.labelM.copy(color = p.text3)); Text("${r.toPct}%", style = T.titleM.copy(color = if (r.toPct < r.fromPct) p.negative else p.positive)) }
            }
            val delta = r.toPct - r.fromPct
            Text("${if (r.single) "원인" else "원인 여럿"} · ${r.why} · 합계 ${if (delta > 0) "+" else ""}$delta%p", style = T.bodyS.copy(color = if (r.single) p.text2 else p.warn))
        }
    }
    if (v.waitLeft > 0) CarCard(tint = p.surface) {
        Text("도착 후 대기 ${v.waitLeft}분 · 어떻게 기다리나요?", style = T.labelM.copy(color = p.text3))
        WaitModePicker(vm.state.waitMode, enabled = !v.restricted) { vm.send(Intent.SetWaitMode(it)) }
        v.waitLimit?.let { Text(it, style = T.bodyM.copy(color = p.text2)) }
    }
    if (v.options.isNotEmpty()) {
        Text("이렇게 하면 · 추정", style = T.labelM.copy(color = p.text3))
        v.options.forEach { o ->
            CarCard(pad = 24, tint = if (o.improves) p.surfaceHigh else p.surface) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("${o.label} · ${o.status.label}", style = T.bodyM.copy(fontWeight = FontWeight.SemiBold))
                        Text(o.detail, style = T.bodyS.copy(color = p.text2))
                        o.note?.let { Text(it, style = T.bodyS.copy(color = p.text3)) }
                    }
                    when (o.action) {
                        EnergyOptionAction.SET_WAIT_AWAY -> CarButton("이렇게 기다림", { vm.send(Intent.SetWaitMode(WaitMode.AWAY)) }, large = false)
                        EnergyOptionAction.SHOW_STOPS -> CarButton("후보 보기", { vm.tab = Tab.STOPS }, tone = Tone.POSITIVE, large = false)
                        null -> {}
                    }
                }
            }
        }
    }
    CarCard(pad = 24) {
        Text(if (how) "어떻게 계산했나 · 전부 가정값 ▲" else "어떻게 계산했나 · 전부 가정값 ▼", style = T.labelM.copy(color = p.text3), modifier = Modifier.clickable { how = !how }.padding(vertical = px(8)))
        if (how) {
            v.energy.assumptions.forEach { Text("· $it", style = T.bodyS.copy(color = p.text2)) }
            Text("제조사 공식 주행가능거리가 아닙니다.", style = T.bodyS.copy(color = p.negative))
        }
    }
    if (vm.state.plan.mode.name != "WAIT") CarButton("충전·휴식 후보 보기", { vm.tab = Tab.STOPS }, Modifier.fillMaxWidth(), tone = Tone.POSITIVE)
}

@Composable
private fun statusColor(s: EnergyStatus) = when (s) {
    EnergyStatus.OK -> LocalP.current.active
    EnergyStatus.SHORT -> LocalP.current.negative
    EnergyStatus.CAUTION -> LocalP.current.text
    EnergyStatus.UNKNOWN -> LocalP.current.text3
}

@Composable
private fun StopsScreen(vm: CopilotViewModel) {
    val p = LocalP.current
    val v = vm.view
    Text("충전·휴식 후보 · 경유지 ${vm.state.waypoints.size}/2", style = T.titleS)
    if (v.ranked.isEmpty()) CarCard(tint = p.surface) { Text("조건에 맞는 후보가 없습니다", style = T.bodyS) }
    v.ranked.forEach { r ->
        CarCard(tint = p.surface) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(r.stop.name, style = T.titleS, modifier = Modifier.weight(1f))
                Text("${r.score}", style = T.titleS.copy(color = p.positive))
            }
            Text(r.reason, style = T.bodyS.copy(color = p.text2))
            Text(RecommendationEngine.unmetLabel(r.unmet), style = T.labelM.copy(color = if (r.unmet.isEmpty()) p.active else p.warn))
            val added = vm.state.waypoints.any { it.id == r.stop.id }
            CarButton(if (added) "경유지로 추가됨" else "경유지로 추가", { vm.addWaypoint(r.stop) }, tone = if (added) Tone.BASIC else Tone.POSITIVE, large = false,
                loading = vm.addingId == r.stop.id, enabled = !added)
        }
    }
    Text("시연용 가상 데이터 · 경로는 내비가 바꾸고 우리는 콜백으로 확인합니다", style = T.labelM.copy(color = p.text4))
}

// ── E 주행 중 — 의미가 먼저, 버튼 없음 ───────────────────
/**
 * 주행 중 — 세션의 Drive.line 세 단계(3차 P0-2). 문제가 없으면 작은 한 줄, 확인할 것은 짧게, 모르면 모른다고만.
 * 빨강·경고 아이콘을 쓰지 않는다(제조사 안전 경고처럼 보이지 않게). 큰 숫자는 경유지까지 거리뿐. 음성은 확인할 것이 있을 때만.
 */
@Composable
private fun DriveScreen(vm: CopilotViewModel) {
    val p = LocalP.current
    val s = vm.state
    val d = vm.view.drive
    Column(Modifier.fillMaxWidth().padding(top = px(120)), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(px(16))) {
        val stop = d.stop
        if (stop != null) {
            Text(d.title.takeIf { d.level == DriveLevel.QUIET } ?: "다음 충전 경유지 · ${stop.name}", style = T.labelM.copy(color = p.text3))
            Text("${stop.km}km", style = T.display)
            if (d.level == DriveLevel.ATTENTION) Text(d.title, style = T.titleM)
        } else Text(d.title, style = if (d.level == DriveLevel.QUIET) T.titleS.copy(color = p.text2) else T.titleL.copy(color = if (d.level == DriveLevel.UNKNOWN) p.text3 else p.text), textAlign = TextAlign.Center)
        d.sub?.let { Text(it, style = T.bodyM.copy(color = p.text2), textAlign = TextAlign.Center) }
        DecisionOneLine(vm.decisions, parked = false)
        Text("설정·비교는 정차 후에 · 배터리 ${vm.view.energyView.currentSocPct ?: "—"}% · ${if (s.car.vehicleLive) "차량 정보" else "시연 데이터"}", style = T.labelM.copy(color = p.text4))
        val top = vm.view.suggestions.top
        if (d.level == DriveLevel.ATTENTION && top != null && s.profile.voice) CarCard(pad = 24) {
            Text("🔊 “${top.title}. ${top.explanation}”", style = T.bodyS.copy(color = p.text2))
        }
    }
}

// ── F 하차 ─────────────────────────────────────────
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FinishScreen(vm: CopilotViewModel) {
    val p = LocalP.current
    val s = vm.state
    val v = vm.view
    val finalLeg = s.journey.isLastLeg
    val stopover = !s.journey.atDestination && s.journey.phase == JourneyPhase.FINISHING
    val items = s.profile.finishChecklist
    Text(if (stopover) "잠시 내리기 · 중간 정차, 여정은 이어집니다" else if (finalLeg) "하차 준비" else "중간 하차 · 귀가가 남아 있습니다", style = T.titleS)
    CarCard(tint = p.surface) {
        Text("내리기 전에 · ${v.checked.count { it in items }}/${items.size}", style = T.labelM.copy(color = p.text3))
        Text("차량 내부와 준비물을 직접 확인해 주세요", style = T.titleM)
        CheckRows(items, v.checked) { vm.send(Intent.SetChecked(it)) }
        Text("체크리스트는 사용자의 확인 기록입니다 — 차 안에 사람·반려동물이 없다는 판정이 아닙니다. 항목은 프로필 탭에서 바꿉니다.", style = T.labelM.copy(color = p.text3))
    }
    CarCard(pad = 24) {
        // 출처는 값이 어디서 왔는지대로 — 실제 실내 콜백(cabinLive)이면 '차량 정보'(E28 D5: 에뮬레이터 실제 도어 값이 '시연 데이터'로 보였다)
        Text("도어 상태${if (s.car.doorReadable && s.car.live(LinkKind.CABIN)) " · ${if (s.car.cabinLive) "차량 정보" else "시연 데이터"} · ${s.clock}" else ""}", style = T.labelM.copy(color = p.text3))
        if (s.car.doorReadable && s.car.live(LinkKind.CABIN)) {
            KeyValue("도어", if (s.car.doorOpen) "열림" else "닫힘", strong = true)
            KeyValue("잠금", if (s.car.doorLocked) "잠김" else "안 잠김")
            Text("차량 안을 대신 확인한 것이 아닙니다.", style = T.labelM.copy(color = p.text3))
        } else Text("이 차량에서는 앱이 도어 상태를 읽을 수 없습니다.", style = T.bodyS)
    }
    when (s.journey.phase) {
        JourneyPhase.FINISHING -> CarButton("${if (v.checked.count { it in items } >= items.size) "확인 완료" else "${v.checked.count { it in items }}/${items.size} 확인하고"} · ${if (stopover) "이어서 가기" else if (finalLeg) "이동 마치기" else "대기 시작 (귀가 남음)"}", { vm.send(Intent.Complete); if (stopover || !finalLeg) vm.tab = Tab.HOME },
            Modifier.fillMaxWidth(), tone = Tone.POSITIVE, enabled = v.canFinish)
        JourneyPhase.COMPLETED -> CarButton("새 이동 준비", { vm.send(Intent.StartPrepare); vm.tab = Tab.HOME }, Modifier.fillMaxWidth())
        else -> Text("주차한 뒤 홈에서 하차 준비를 시작하면 확인할 수 있습니다", style = T.bodyS.copy(color = p.text3))
    }
    if (!v.canFinish && s.journey.phase == JourneyPhase.FINISHING) Text("모든 항목을 확인해야 마칠 수 있습니다 (프로필 설정)", style = T.labelM.copy(color = p.negative))
}

// ── G 기록 ─────────────────────────────────────────
@Composable
private fun HistoryScreen(vm: CopilotViewModel) {
    val p = LocalP.current
    val s = vm.state
    val entries = Memory.activityOf(s.vault, s.mode)
    Text("이동 기록 · ${s.profile.name} · ${entries.size}건 · 이 기기에만", style = T.titleS)
    if (s.memory.tripId > 0) CarCard {
        Text("이번 이동 #${s.memory.tripId}에서 기억하는 것", style = T.labelM.copy(color = p.text3))
        KeyValue("출발 준비", if (s.memory.prepareDone) "마침" else "아직")
        KeyValue("준비물 확인", "${s.memory.packed.size}개")
        KeyValue("공조", s.memory.climate?.let { if (it.decision == ClimateDecisionKind.APPLIED) "${it.valueC.roundToInt()}°C 로 맞춤 (시연 데이터)" else "${it.valueC.roundToInt()}°C 그대로 두기로 함" } ?: "아직 정하지 않음")
        KeyValue("고른 경유지", if (s.memory.waypointIds.isEmpty()) "없음" else "${s.memory.waypointIds.size}곳")
        Text("새 이동을 시작하면 비웁니다 — 지난 이동의 확인 결과를 다음 이동에 자동으로 쓰지 않습니다.", style = T.labelM.copy(color = p.text3))
    }
    if (entries.isEmpty()) CarCard { Text("아직 기록이 없습니다.", style = T.bodyS) }
    entries.forEach { e ->
        CarCard(pad = 20) {
            Row(horizontalArrangement = Arrangement.spacedBy(px(16))) {
                Text(e.clock, style = T.labelM.copy(color = p.text3))
                Text(e.text, style = T.labelM, modifier = Modifier.weight(1f))
                Text("#${e.tripId}", style = T.labelM.copy(color = p.text4))
            }
        }
    }
    Text("이 프로필의 기록만 보입니다. 위치 이력은 저장하지 않습니다.", style = T.labelM.copy(color = p.text3))
}

// ── H 프로필 — 정차 중에만 편집(웹 ProfileScreen 과 같은 구성). 고치면 세션 게이트(EDIT_CHECKLIST)를 거친다 ──
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProfileScreen(vm: CopilotViewModel) {
    val p = LocalP.current
    val s = vm.state
    val pr = s.profile
    fun edit(next: app.commadrive.core.assistant.UserProfile) = vm.send(Intent.EditProfile(next))
    Text("내 프로필 · 정차 중에만 편집", style = T.titleS)
    Row(horizontalArrangement = Arrangement.spacedBy(px(10))) {
        Profiles.SELECTABLE.forEach { m -> Chip(s.profiles.getValue(m).name, s.mode == m, { vm.send(Intent.Choose(m)) }, Modifier.weight(1f)) }
    }
    if (s.mode == ProfileMode.GUEST) {
        CarCard(tint = p.surface) { Text("프로필 없이 시작했습니다 · 고칠 개인 설정이 없습니다", style = T.bodyM.copy(color = p.text2)) }
        return
    }
    CarCard(tint = p.surface) {
        Text("저장한 공조 온도", style = T.labelM.copy(color = p.text3))
        Row(verticalAlignment = Alignment.CenterVertically) {
            CarButton("−", { edit(pr.copy(targetC = ((pr.targetC ?: 22.0) - 1).coerceIn(16.0, 30.0))) }, large = false)
            Text("${pr.targetC?.roundToInt() ?: "—"}°C", style = T.titleL, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            CarButton("+", { edit(pr.copy(targetC = ((pr.targetC ?: 22.0) + 1).coerceIn(16.0, 30.0))) }, large = false)
        }
        ToggleRow("출발할 때 맞추자고 제안", pr.targetC != null) { edit(pr.copy(targetC = if (it) 22.0 else null)) }
    }
    CarCard(tint = p.surface) {
        Text("동승자 · 수동 설정 (자동 감지 아님)", style = T.labelM.copy(color = p.text3))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(px(10)), verticalArrangement = Arrangement.spacedBy(px(10))) {
            PassengerType.entries.forEach { t -> Chip(t.label, t in pr.passengers, { edit(pr.copy(passengers = if (t in pr.passengers) pr.passengers - t else pr.passengers + t)) }) }
        }
        Text("충전 경유지의 필수·선호 시설과 하차 체크리스트가 여기서 정해집니다", style = T.labelM.copy(color = p.text3))
    }
    CarCard(tint = p.surface) {
        Text("안내", style = T.labelM.copy(color = p.text3))
        ToggleRow("먼저 제안", pr.proactive) { edit(pr.copy(proactive = it)) }
        ToggleRow("음성 안내", pr.voice) { edit(pr.copy(voice = it)) }
        ToggleRow("하차 체크리스트 전부 확인해야 완료", pr.requireAllChecked) { edit(pr.copy(requireAllChecked = it)) }
    }
    CarCard(tint = p.surface) {
        Text("출발 준비물", style = T.labelM.copy(color = p.text3))
        Text(if (pr.packing.isEmpty()) "없음" else pr.packing.joinToString(" · "), style = T.bodyS.copy(color = p.text2))
        Text("하차 체크리스트 · ${pr.finishChecklist.size}개", style = T.labelM.copy(color = p.text3), modifier = Modifier.padding(top = px(12)))
        pr.finishChecklist.forEach { item ->
            Row(Modifier.fillMaxWidth().heightIn(min = px(64)), verticalAlignment = Alignment.CenterVertically) {
                Text(item, style = T.bodyS, modifier = Modifier.weight(1f))
                CarButton("지우기", { edit(pr.copy(finishChecklist = pr.finishChecklist - item)) }, large = false)
            }
        }
        var draft by rememberSaveable { mutableStateOf("") }
        val add = { val t = draft.trim(); if (t.isNotEmpty() && t !in pr.finishChecklist) edit(pr.copy(finishChecklist = pr.finishChecklist + t)); draft = "" }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(px(12))) {
            Box(Modifier.weight(1f).height(px(80)).clip(RoundedCornerShape(px(20))).background(p.btn).padding(horizontal = px(24)), contentAlignment = Alignment.CenterStart) {
                if (draft.isEmpty()) Text("항목 추가", style = T.bodyS.copy(color = p.text4))
                BasicTextField(draft, { draft = it }, singleLine = true, textStyle = T.bodyS.copy(color = p.text), cursorBrush = SolidColor(p.text), modifier = Modifier.fillMaxWidth())
            }
            CarButton("추가", add, large = false)
        }
    }
    // 되돌릴 수 없는 삭제 — 첫 누름은 확인을 연다(웹 ResetButton 과 같다)
    var armed by remember { mutableStateOf(false) }
    if (armed) Row(horizontalArrangement = Arrangement.spacedBy(px(12))) {
        CarButton("취소", { armed = false }, Modifier.weight(1f), large = false)
        CarButton("이 프로필만 지우기", { armed = false; vm.send(Intent.WipeProfile) }, Modifier.weight(1f), large = false, tone = Tone.FILLED)
    } else CarButton("개인 설정·기록 삭제", { armed = true }, Modifier.fillMaxWidth(), large = false)
}

/** 켜기/끄기 — 줄 전체가 터치 영역(≥80) */
@Composable
private fun ToggleRow(label: String, on: Boolean, onChange: (Boolean) -> Unit) {
    val p = LocalP.current
    Row(Modifier.fillMaxWidth().heightIn(min = px(80)).clickable(role = Role.Switch) { onChange(!on) }, verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = T.bodyS, modifier = Modifier.weight(1f))
        Box(Modifier.size(px(88), px(48)).clip(RoundedCornerShape(px(24))).background(if (on) p.positive else p.btn).padding(px(6)), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
            Box(Modifier.size(px(36)).clip(CircleShape).background(androidx.compose.ui.graphics.Color.White))
        }
    }
}

// ── 조작판 — 실제 앱에 없는 것. 차량·내비가 넣어 줄 값을 사람이 대신 넣는 자리 ─────
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ControlSheet(vm: CopilotViewModel, onClose: () -> Unit) {
    val p = LocalP.current
    val s = vm.state
    Box(Modifier.fillMaxSize().background(p.bg.copy(alpha = 0.7f)).clickable(onClick = onClose)) {
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().clip(RoundedCornerShape(topStart = px(32), topEnd = px(32))).background(p.popup)
                .clickable(enabled = false) {}.verticalScroll(rememberScrollState()).padding(px(32)),
            verticalArrangement = Arrangement.spacedBy(px(18)),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("개발용 조작판 · 모의 차량", style = T.titleS, modifier = Modifier.weight(1f))
                CarButton("닫기", onClose, large = false)
            }
            Text("실제 차에서는 Vehicle SDK·AAOS·NaviHelper 가 넣는 값입니다. 시연 시계 ${s.clock}", style = T.labelM.copy(color = p.text3))
            Section("주행") {
                Chip(if (s.car.speedKmh > 0) "정지" else "주행", s.car.speedKmh > 0, { vm.send(if (s.car.speedKmh > 0) Intent.Stop else Intent.Drive) })
                Chip("P 주차", s.car.gear == Gear.PARK, { vm.send(Intent.Park) })
                Chip("목적지 3km 앞", false, { vm.send(Intent.JumpTo(s.legTotalKm - 2.5)) })
                Chip("목적지 도착", false, { vm.send(Intent.JumpTo(s.legTotalKm - 0.2)) })
                Chip("시계 +10분", false, { vm.send(Intent.AdvanceClock(10)) })
                // 에뮬레이터 한계(E22, 2026-11-03): 속도 신호가 없고(CAR_SPEED 정의 없음) 주행 제한이 꺼짐이라 기어 D 만으로는 움직임을 "모름"으로 본다(보수적) → 여정 단계가 출발 준비에 머문다.
                // 개발용으로만 실제 주행 신호를 끊고 모의 주행으로 단계를 넘긴다 — 다음 AAOS 콜백이 오면 다시 실제 신호가 덮는다. 운전자 화면에는 없다
                if (s.car.aaos != null && !vm.mockDrive) Chip("실제 주행 신호 → 모의(개발용)", false, { vm.useMockDrive() })
                if (vm.mockDrive) Chip("모의 주행 중 (실제 주행 신호 무시)", true, {})
            }
            Section("충전 데이터 (V6)") {
                Chip("실제 프록시", !vm.decisions.mockChargers, { vm.decisions.switchMockChargers(false) })
                Chip("시연 데이터", vm.decisions.mockChargers, { vm.decisions.switchMockChargers(true) })
                Chip("requestTrip 시험", false, { vm.decisions.probeTrip() })
                if (vm.decisions.mockChargers) {
                    Chip("황간 점검으로(시연)", vm.decisions.mockOverrides.isNotEmpty(), { vm.decisions.switchMockOverride(if (vm.decisions.mockOverrides.isEmpty()) mapOf("MOCK0003/01" to mapOf("stat" to "5"), "MOCK0003/02" to mapOf("stat" to "5")) else emptyMap()) })
                }
            }
            Section("주행 제한 (CarUxRestrictions)") {
                UxMode.entries.forEach { m -> Chip(mapOf(UxMode.AUTO to "자동", UxMode.RESTRICTED to "제한", UxMode.UNRESTRICTED to "해제", UxMode.UNKNOWN to "모름").getValue(m), s.car.uxMode == m, { vm.send(Intent.SetCar(s.car.copy(uxMode = m))) }) }
                Chip(if (s.car.linkLive) "차량 연결됨" else "연결 끊김", s.car.linkLive, { vm.send(Intent.SetLink(!s.car.linkLive)) })
            }
            // 연결은 셋 — 부분 복구를 만들어 본다(외부 평가 7 A). 실제 앱: 주행 신호 AAOS · 배터리 Pleos EvBattery · 공조·도어 Pleos HVAC·Door
            Section("연결별 (부분 복구)") {
                LinkKind.entries.forEach { k -> Chip(k.label.substringBefore("("), s.car.live(k), { vm.send(Intent.SetLinkOf(listOf(k), !s.car.live(k))) }) }
                // 연결은 살아 있는데 값만 못 받는 경우(onFailed) — 연결과 신호 유효성은 별개다
                val socErr = s.car.signalStatus.getValue(SignalKind.SOC) == SignalStatus.ERROR
                Chip("배터리 조회 실패", socErr, { vm.send(Intent.SetSignalStatus(SignalKind.SOC, if (socErr) SignalStatus.OK else SignalStatus.ERROR)) })
            }
            // 전체 차량 대상(오너 결정 2026-10-28) — 에너지 판단만 EV, 나머지 동력원은 "지원 안 함 · 확인 전"으로 끄고 공통 기능은 그대로. 실제 판별 방법은 미확인
            Section("동력원 (에너지 판단은 EV 만)") {
                Powertrain.entries.forEach { p -> Chip(p.label, s.car.powertrain == p, { vm.send(Intent.SetPowertrain(p)) }) }
            }
            Section("시트·조명 (Vehicle Seat·Light, 모의)") {
                Chip("통풍시트 ${if (s.car.seatVent) "켬" else "끔"}", s.car.seatVent, { vm.send(Intent.SetCar(s.car.copy(seatVent = !s.car.seatVent))) })
                Chip("열선시트 ${if (s.car.seatHeat) "켬" else "끔"}", s.car.seatHeat, { vm.send(Intent.SetCar(s.car.copy(seatHeat = !s.car.seatHeat))) })
                Chip("조명 ${s.car.lighting?.label ?: "모름"}", s.car.lighting != null, { vm.send(Intent.SetCar(s.car.copy(lighting = when (s.car.lighting) { null -> Lighting.CALM; Lighting.CALM -> Lighting.BRIGHT; Lighting.BRIGHT -> null }))) })
                Chip("시트 제어 권한 ${when (s.car.permSeat) { true -> "있음"; false -> "없음"; null -> "모름" }}", s.car.permSeat == true, { vm.send(Intent.SetCar(s.car.copy(permSeat = when (s.car.permSeat) { true -> false; false -> null; null -> true }))) })
            }
            Section("일정·차량 값 (재판단)") {
                Chip("대기 −30분", false, { vm.send(Intent.ChangeWait(-30)) })
                Chip("대기 +30분", false, { vm.send(Intent.ChangeWait(30)) })
                Chip("배터리 −10%", false, { vm.send(Intent.SetBattery((s.vehicle.batteryPct - 10).coerceAtLeast(5.0))) })
                Chip("배터리 +10%", false, { vm.send(Intent.SetBattery((s.vehicle.batteryPct + 10).coerceAtMost(100.0))) })
                Chip("겨울 −7° · 히터", false, { vm.send(Intent.Winter) })
            }
            Section("공조 ${s.car.hvacC.roundToInt()}°C (Vehicle HVAC)") {
                Chip("−1°C", false, { vm.send(Intent.SetHvac(s.car.hvacC - 1)) })
                Chip("+1°C", false, { vm.send(Intent.SetHvac(s.car.hvacC + 1)) })
                Chip("조회 가능", s.car.hvacReadable, { vm.send(Intent.SetCar(s.car.copy(hvacReadable = !s.car.hvacReadable))) })
                Chip("제어 권한", s.car.permClimate == true, { vm.send(Intent.SetCar(s.car.copy(permClimate = if (s.car.permClimate == true) false else true))) })
            }
            Section("공조 제어 결과 (모의)") { ControlMode.entries.forEach { m -> Chip(m.label, vm.controlMode == m, { vm.controlMode = m }) } }
            Section("도어 · 내비") {
                Chip("도어 조회", s.car.doorReadable, { vm.send(Intent.SetCar(s.car.copy(doorReadable = !s.car.doorReadable))) })
                Chip(if (s.car.doorOpen) "도어 열림" else "도어 닫힘", s.car.doorOpen, { vm.send(Intent.SetCar(s.car.copy(doorOpen = !s.car.doorOpen))) })
                Chip("내비 연결", s.car.naviConnected, { vm.send(Intent.SetCar(s.car.copy(naviConnected = !s.car.naviConnected))) })
            }
            Section("프로필 (정차 중에만)") { ProfileMode.entries.forEach { m -> Chip(s.profiles.getValue(m).name, s.chosen && s.mode == m, { vm.send(Intent.Choose(m)) }) } }
            Section("대기 유형 · ${s.waitMode.label}") { WaitMode.entries.forEach { m -> Chip(m.label, s.waitMode == m, { vm.send(Intent.SetWaitMode(m)) }) } }
            // 재시작 복원(V5 지시서 4절 6) — 저장한 진행 중 Mission 을 되살린다. 실제 검증은 프로세스를 죽이고 다시 띄워서(런북 E22)
            Section("Mission (V5) · ${vm.view.mission?.let { "${Missions.headline(it)} · 남은 구간 ${it.remainingLegs} · ${it.status}" } ?: "없음"}") {
                Chip("앱 재시작 — 저장한 Mission 복원", false, { vm.restoreFromStore(); onClose() })
                if (s.journey.phase == JourneyPhase.WAITING && s.plan.returnKm > 0) Chip("귀가 일정 확인", s.nextLegReady, { vm.send(Intent.ReadyNextLeg) })
            }
            Section("개발자 정보 (운전자 화면에는 없음)") {
                Text("단계 ${s.journey.phase} · 움직임 ${vm.view.motion.kind} · 주행 ${vm.view.drive.level} · 제안 ${vm.view.suggestions.top?.let { "${it.type} ${it.priority}" } ?: "없음"} · 준비 완료 ${vm.view.prepare.done}/확인 ${vm.view.prepare.needs}/건너뜀 ${vm.view.prepare.skipped}/지원 안 함 ${vm.view.prepare.unsupported}", style = T.labelM.copy(color = p.text3))
                Text("Automotive 기기 ${if (vm.automotive) "예" else "아니오"} · AAOS 신호(CarUxRestrictions·속도·기어·주차 브레이크) ${if (s.car.aaos != null) "받는 중" else "없음 → 모의"} · Pleos Vehicle(배터리) ${if (s.car.vehicleLive) "받는 중" else "없음 → 모의"} · 공조 제어 권한 ${s.car.permClimate} · 경유지 권한 ${s.car.permNavi}", style = T.labelM.copy(color = p.text3))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ColumnScope.Section(title: String, content: @Composable () -> Unit) {
    Text(title, style = T.labelM.copy(color = LocalP.current.text3))
    FlowRow(horizontalArrangement = Arrangement.spacedBy(px(10)), verticalArrangement = Arrangement.spacedBy(px(10))) { content() }
}

/** 집계 줄에 쓰는 짧은 이름 — 제안 제목은 상황마다 달라서 종류 이름을 쓴다(웹 SUGGESTION_SHORT 와 같다) */
private val SUGGESTION_SHORT = mapOf(
    SuggestionType.PROFILE_PREPARATION to "공조 맞추기", SuggestionType.ENERGY_DECISION to "충전 판단", SuggestionType.BREAK_PLANNING to "휴식 계획",
    SuggestionType.ARRIVAL_PREPARATION to "도착 준비", SuggestionType.CHECKLIST_REMINDER to "하차 확인", SuggestionType.NEXT_LEG to "귀가 확인",
)
