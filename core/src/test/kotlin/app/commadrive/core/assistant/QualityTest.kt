package app.commadrive.core.assistant

import app.commadrive.core.BreakPhase
import app.commadrive.core.EnergyEstimator
import app.commadrive.core.EnergyPlan
import app.commadrive.core.Fixtures
import app.commadrive.core.TripMode
import app.commadrive.core.TripPlan
import app.commadrive.core.Verdict
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * 품질 개선(docs/my-copilot/CHECKLIST.md) — `src/lib/assistant/quality.test.ts` 와 **같은 입력·같은 기대값**이다 (거울).
 */
class QualityTest {
    // ── P0-1 에너지 숫자의 의미 ───────────────────────────
    private val family = EnergyEstimator.estimate(Fixtures.plan, Fixtures.vehicle)
    private fun row(v: EnergyView) = listOf(v.status, v.currentSocPct, v.arrivalSocPct, v.depletesBeforeArrival, v.requiredPctPoints, v.requiredRange, v.requiredKwh, v.headline, v.detail)

    @Test fun `거울 - 부족하면 '−27%' 대신 추가 필요량 47%p 를 쓰고, 도착 잔량은 0 아래로 내려가지 않는다`() {
        assertTrue(family.arrivalPct < 0)
        assertEquals(listOf(EnergyStatus.SHORT, 68, 0, true, 47, 36 to 58, 36.2, "충전 계획이 필요해요", "예상 추가 필요량 약 47%p (추정 36~58%p)"), row(EnergyViews.of(family, 68.0, 77.0)))
    }

    @Test fun `거울 - 배터리 0% 면 추가 필요량이 100%p 를 넘어 '완충해도 모자랄 수 있음'을 붙인다`() {
        val v = EnergyViews.of(EnergyEstimator.estimate(Fixtures.plan, Fixtures.vehicle.copy(batteryPct = 0.0)), 0.0, 77.0)
        assertEquals(listOf<Any?>(0, 115, true, "예상 추가 필요량 약 115%p (추정 104~126%p) · 완충해도 모자랄 수 있음"), listOf(v.currentSocPct, v.requiredPctPoints, v.exceedsFullCharge, v.detail))
    }

    @Test fun `거울 - 배터리 100% · 짧은 길이면 충분하고 추가 필요량은 0, 범위도 없다`() {
        val v = EnergyViews.of(EnergyEstimator.estimate(Fixtures.plan.copy(routeKm = 100.0), Fixtures.vehicle.copy(batteryPct = 100.0)), 100.0, 77.0)
        assertEquals(listOf<Any?>(EnergyStatus.OK, 0, null, null, "도착 예상 잔량 약 75% (추정)"), listOf(v.status, v.requiredPctPoints, v.requiredRange, v.requiredKwh, v.detail))
    }

    @Test fun `거울 - 평균으로는 충분한데 추정 범위가 최소 잔량을 넘나들면 '주의' 이고 최대 부족분만 적는다`() {
        val v = EnergyViews.of(family.copy(shortfallPct = -1.0, shortfallRange = -3.0 to 2.0, arrivalPct = 21.0), 60.0, 77.0)
        assertEquals(listOf<Any?>(EnergyStatus.CAUTION, 0, 0 to 2, "평균으로는 충분하지만 추정 범위에서 최대 약 2%p 모자랄 수 있음"), listOf(v.status, v.requiredPctPoints, v.requiredRange, v.detail))
    }

    @Test fun `거울 - 추가 필요량이 딱 0 이고 범위도 넘지 않으면 충분이다`() {
        val v = EnergyViews.of(family.copy(shortfallPct = 0.0, shortfallRange = -2.0 to 0.0, arrivalPct = 20.0), 60.0, 77.0)
        assertEquals(listOf<Any?>(EnergyStatus.OK, 0, null), listOf(v.status, v.requiredPctPoints, v.requiredRange))
    }

    @Test fun `거울 - 계획이나 현재 잔량을 모르면 '계산 불가' — 추정하지 않는다`() {
        assertEquals(EnergyStatus.UNKNOWN to 68, EnergyViews.of(null, 68.0, 77.0).let { it.status to it.currentSocPct })
        assertEquals(EnergyStatus.UNKNOWN to "최신 차량 정보가 없어 계획을 확인할 수 없어요", EnergyViews.of(family, null, 77.0).let { it.status to it.headline })
    }

    @Test fun `거울 - 배터리 용량을 확인하지 못했으면 kWh 를 적지 않는다`() {
        assertNull(EnergyViews.of(family, 68.0, null).requiredKwh)
    }

    // ── P0-2 누적 재판단 알림 ─────────────────────────────
    private fun workAt(battery: Double, wait: Int): EnergyPlan = EnergyEstimator.estimate(
        TripPlan("판교 고객사 (왕복)", 38.0, wait, 20.0, emptySet(), 120, TripMode.WAIT, 38.0),
        Fixtures.vehicle.copy(batteryPct = battery),
    )
    private fun run(battery: Double, waits: List<Int>): List<Pair<NotificationReason, String?>> {
        var s = NotificationState.INITIAL
        return waits.map { w -> NotificationPolicy.decide(s, workAt(battery, w)).also { s = it.state }.let { it.reason to NotificationPolicy.message(it, battery) } }
    }

    @Test fun `거울 - 30분씩 나빠져도 직전 값과만 비교하면 끝까지 조용하다 (고치기 전 동작)`() {
        val plans = listOf(150, 180, 210, 240).map { workAt(40.0, it) }
        assertEquals(listOf(null, null, null), plans.zipWithNext { a, b -> EnergyEstimator.rejudge(a, b) })
    }

    @Test fun `거울 - 마지막으로 알린 판단과 비교하면 누적 +4%p 에서 알린다`() {
        assertEquals(listOf(
            NotificationReason.BASELINE to null,
            NotificationReason.NONE to null,
            NotificationReason.NONE to null,
            NotificationReason.CUMULATIVE to "재판단 · 추가 필요량 약 4%p → 8%p (+4%p)",
        ), run(40.0, listOf(150, 180, 210, 240)))
    }

    @Test fun `거울 - 등급이 바뀌면 변화량이 작아도 바로 알리고, 문구에 음수 범위를 쓰지 않는다`() {
        assertEquals(listOf(
            NotificationReason.BASELINE to null,
            NotificationReason.NONE to null,
            NotificationReason.TIER_CHANGE to "판단이 바뀌었습니다: 충분 → 주의 · 평균으로는 충분하지만 추정 범위에서 최대 약 1%p 모자랄 수 있음",
        ), run(45.0, listOf(90, 120, 150)))
    }

    @Test fun `거울 - 좋아지는 쪽도 알리지만 에너지 제안을 다시 꺼내지는 않는다`() {
        val s = NotificationPolicy.decide(NotificationState.INITIAL, workAt(48.0, 210)).state
        val d = NotificationPolicy.decide(s, workAt(48.0, 90))
        assertEquals(listOf<Any?>(NotificationReason.TIER_CHANGE, "판단이 바뀌었습니다: 주의 → 충분 · 도착 예상 잔량 약 27% (추정)", false), listOf(d.reason, NotificationPolicy.message(d, 48.0), NotificationPolicy.shouldResurface(d)))
    }

    @Test fun `거울 - 나빠지는 쪽으로 알렸으면 에너지 제안을 다시 꺼낸다 (공조 거절 학습으로 묻지 않는다)`() {
        var s = NotificationState.INITIAL
        for (w in listOf(150, 180, 210)) s = NotificationPolicy.decide(s, workAt(40.0, w)).state
        assertTrue(NotificationPolicy.shouldResurface(NotificationPolicy.decide(s, workAt(40.0, 240))))
    }

    // ── P0-3 제안 우선순위 계층 ─────────────────────────
    private fun at(phase: JourneyPhase, atDestination: Boolean = false) = JourneyState(phase, atDestination, Confidence.CONFIRMED)
    private val base = PlannerInput(
        journey = at(JourneyPhase.PREPARING), restricted = false, now = 1_000_000L, energy = SuggestionPlanner.energySignalOf(Fixtures.plan, Fixtures.vehicle),
        breakPhase = BreakPhase.CRUISING, climate = ClimateGap(25.0, 23.0), checklistPending = 3, proactive = true, history = emptyMap(),
        context = PlannerContext("가족 이동", 68.0, 40, 20.0, 0, 90, 400.0),
    )
    private val tight = EnergySignal(Verdict.TIGHT, "여유가 빠듯합니다")

    @Test fun `거울 - '주의'(아슬아슬)이면 출발 준비(공조)가 먼저고, 에너지는 함께 할 일로 옆에 둔다 — 점수는 에너지가 더 높아도`() {
        val r = SuggestionPlanner.plan(base.copy(energy = tight))
        assertEquals(listOf<Any?>(SuggestionType.PROFILE_PREPARATION, 90, listOf(SuggestionType.ENERGY_DECISION), 93), listOf(r.top?.type, r.top?.priority, r.companions.map { it.type }, r.companions[0].priority))
    }

    @Test fun `거울 - '부족' 판단은 세 번 거절해도 추천함으로 미루지 않는다 (쿨다운만 지킨다)`() {
        var h = emptyMap<SuggestionType, SuggestionRecord>()
        repeat(3) { h = SuggestionPlanner.recordDismissed(h, SuggestionType.ENERGY_DECISION, 0) }
        val r = SuggestionPlanner.plan(base.copy(climate = null, history = h, now = 3_600_000))
        assertEquals(SuggestionType.ENERGY_DECISION to SuggestionStatus.NEW, r.top?.type to r.top?.status)
    }

    @Test fun `거울 - 문제가 없는 날에는 아무것도 제안하지 않는다`() {
        val r = SuggestionPlanner.plan(base.copy(energy = null, climate = ClimateGap(23.0, 23.0)))
        assertEquals(Triple(null, emptyList<Suggestion>(), emptyList<Suggestion>()), Triple(r.top, r.companions, r.inbox))
    }

    @Test fun `거울 - 제안마다 건너뛰면 어떻게 되는지 적는다`() {
        val r = SuggestionPlanner.plan(base)
        assertEquals("건너뛰어도 10분 뒤 다시 확인합니다. 부족 판단은 거절해도 추천함으로 미루지 않습니다.", r.top?.ifSkipped)
        assertEquals("건너뛰면 지금 온도를 그대로 두고, 이번 이동에서는 다시 묻지 않습니다.", r.companions[0].ifSkipped)
    }

    @Test fun `거울 - 공조를 '그대로 두기'로 건너뛰면 쿨다운이 지나도 이번 이동에서는 다시 묻지 않고, 새 이동에서는 묻는다`() {
        val h = SuggestionPlanner.recordKept(emptyMap(), SuggestionType.PROFILE_PREPARATION, base.now)
        val later = base.copy(energy = null, history = h, now = base.now + 3_600_000)
        assertNull(SuggestionPlanner.plan(later).top)
        assertEquals(SuggestionType.PROFILE_PREPARATION, SuggestionPlanner.plan(later.copy(history = SuggestionPlanner.newTrip(h))).top?.type)
    }

    @Test fun `거울 - 주행 중에는 함께 할 일을 보여 주지 않는다 (한 줄 화면)`() {
        val r = SuggestionPlanner.plan(base.copy(journey = at(JourneyPhase.DRIVING), restricted = true, energy = tight, climate = null, breakPhase = BreakPhase.SUGGEST))
        assertEquals(listOf<Any?>(SuggestionType.BREAK_PLANNING, 0, listOf(SuggestionType.ENERGY_DECISION)), listOf(r.top?.type, r.companions.size, r.inbox.map { it.type }))
    }

    // ── P0-4 왕복 여정 ─────────────────────────────────
    private fun sig(gear: Gear = Gear.DRIVE, brake: Boolean? = false, speed: Double? = 0.0, ux: Boolean? = null, km: Double? = 30.0) = JourneySignals(gear, brake, speed, ux, km)
    private fun parked(km: Double = 30.0) = sig(Gear.PARK, true, 0.0, false, km)
    private fun moving(km: Double = 30.0) = sig(speed = 60.0, ux = true, km = km)
    private fun legView(j: JourneyState) = "${j.phase}/${j.leg}"
    private fun prepared(legs: Int) = Journey.next(JourneyState.INITIAL, parked(), JourneyEvent.START_PREPARE).withLegs(legs)

    @Test fun `거울 - 편도 여정은 지금까지와 같다 - 목적지 하차 확인 → 완료 (회귀)`() {
        var j = prepared(1)
        for (s in listOf(moving(), parked(0.2))) j = Journey.next(j, s)
        j = Journey.next(Journey.next(j, parked(0.2), JourneyEvent.START_FINISH), parked(0.2), JourneyEvent.FINISH_DONE)
        assertEquals("COMPLETED/0", legView(j))
    }

    @Test fun `거울 - 왕복이면 고객사 하차 확인을 마쳐도 여정은 끝나지 않고 '대기 중 · 귀가 남음'이 된다`() {
        var j = prepared(2)
        for (s in listOf(moving(), parked(0.2))) j = Journey.next(j, s)
        val seen = mutableListOf(legView(j))
        j = Journey.next(j, parked(0.2), JourneyEvent.START_FINISH); seen += legView(j)
        j = Journey.next(j, parked(0.2), JourneyEvent.FINISH_DONE); seen += legView(j)
        j = Journey.next(j, moving(0.0)); seen += legView(j)
        j = Journey.next(j, moving(38.0)); seen += legView(j)
        j = Journey.next(j, parked(0.1)); seen += legView(j)
        j = Journey.next(Journey.next(j, parked(0.1), JourneyEvent.START_FINISH), parked(0.1), JourneyEvent.FINISH_DONE); seen += legView(j)
        assertEquals(listOf("PARKED/0", "FINISHING/0", "WAITING/0", "DRIVING/1", "DRIVING/1", "PARKED/1", "COMPLETED/1"), seen)
    }

    @Test fun `거울 - 고객사에서 내리지 않고 기다릴 수도 있고, 귀가가 남아 있어도 사용자가 여정을 끝낼 수 있다`() {
        var j = prepared(2)
        for (s in listOf(moving(), parked(0.2))) j = Journey.next(j, s)
        val waiting = Journey.next(j, parked(0.2), JourneyEvent.START_WAIT)
        assertEquals("WAITING/0", legView(waiting))
        assertEquals("COMPLETED/0", legView(Journey.next(waiting, parked(0.2), JourneyEvent.END_TRIP)))
        assertEquals("FINISHING/0", legView(Journey.next(waiting, parked(0.2), JourneyEvent.START_FINISH)))
    }

    @Test fun `거울 - 중간 정차(목적지 아님)에서는 대기를 시작할 수 없고, 마지막 구간에서는 START_WAIT 이 아무 일도 하지 않는다`() {
        var j = prepared(2)
        for (s in listOf(moving(), parked(20.0))) j = Journey.next(j, s)
        assertEquals("PARKED/0", legView(Journey.next(j, parked(20.0), JourneyEvent.START_WAIT)))
        assertEquals("PARKED/1", legView(Journey.next(j.copy(leg = 1, atDestination = true), parked(0.1), JourneyEvent.START_WAIT)))
    }

    private val workPlan = TripPlan("판교 고객사 (왕복)", 38.0, 90, 20.0, emptySet(), 120, TripMode.WAIT, 38.0)

    @Test fun `거울 - 왕복 계획은 2구간, 편도는 1구간`() {
        assertEquals(2 to 1, Trip.legsOf(workPlan) to Trip.legsOf(Fixtures.plan))
    }

    @Test fun `거울 - 편도의 남은 계획은 지금까지와 같다 (회귀)`() {
        assertEquals(Fixtures.plan.copy(routeKm = 300.0), Trip.remainingPlan(Fixtures.plan, LegPosition(0, 100.0, 0)))
    }

    @Test fun `거울 - 고객사에 도착해도 귀로 에너지 예산은 그대로 남는다 · 기다린 만큼만 대기가 줄어든다`() {
        val atArrival = Trip.remainingPlan(workPlan, LegPosition(0, 38.0, 30))
        assertEquals(Triple(0.0, 38.0, 60), Triple(atArrival.routeKm, atArrival.returnKm, atArrival.waitMinutesAfterArrival))
        assertEquals(EnergyEstimator.estimate(workPlan, Fixtures.vehicle).returnPct, EnergyEstimator.estimate(atArrival, Fixtures.vehicle).returnPct)
    }

    @Test fun `거울 - 귀가 구간의 남은 계획은 돌아오는 길뿐이다`() {
        val back = Trip.remainingPlan(workPlan, LegPosition(1, 10.0, 90))
        assertEquals(listOf<Any>("집 (귀가)", 28.0, 0.0, 0), listOf(back.destinationName, back.routeKm, back.returnKm, back.waitMinutesAfterArrival))
        assertEquals(18.0 to 28.0, Trip.legRemainingKm(workPlan, LegPosition(0, 20.0, 0)) to Trip.legRemainingKm(workPlan, LegPosition(1, 10.0, 0)))
    }

    @Test fun `거울 - 왕복의 고객사에 주차하면 귀로 에너지 제안은 남고, 최종 도착에서만 거둔다`() {
        val short = EnergySignal(Verdict.SHORT, "귀가까지 모자랍니다")
        val mid = SuggestionPlanner.plan(base.copy(journey = at(JourneyPhase.PARKED, true).copy(legs = 2, leg = 0), energy = short, climate = null))
        val fin = SuggestionPlanner.plan(base.copy(journey = at(JourneyPhase.PARKED, true).copy(legs = 2, leg = 1), energy = short, climate = null))
        assertEquals(SuggestionType.ENERGY_DECISION to SuggestionType.CHECKLIST_REMINDER, mid.top?.type to fin.top?.type)
        assertEquals(0, fin.companions.size + fin.inbox.size)
    }

    // ── P1-6 액션 상태 (요청 ID · 결과 모름 · 늦은 콜백) ─────────────
    private fun runA(events: List<ActionEvent>, s: ActionState = ActionState.idle(ControlSource.MOCK)) = events.fold(s, Actions::reduce)
    private fun view(s: ActionState) = listOf<Any?>(s.phase, s.canRetry, s.message)

    @Test fun `거울 - 확인 → 보냄 → 콜백 값이 목표와 같으면 검증된 성공`() {
        assertEquals(listOf<Any?>(ActionPhase.VERIFIED_SUCCESS, true, "시연 값으로 23 적용"), view(runA(listOf(ActionEvent.Open, ActionEvent.Send(1, 23.0), ActionEvent.Callback(1, 23.0)))))
    }

    @Test fun `거울 - 응답이 없으면 실패가 아니라 '모름' 이고, 다시 읽기 전에는 재시도할 수 없다`() {
        val s = runA(listOf(ActionEvent.Open, ActionEvent.Send(1, 23.0), ActionEvent.Timeout(1)))
        assertEquals(ActionPhase.UNKNOWN_OUTCOME to false, s.phase to s.canRetry)
        assertEquals(s, Actions.reduce(s, ActionEvent.Open))
    }

    @Test fun `거울 - 모르는 상태에서 다시 읽은 값이 그대로면 실패(재시도 가능), 바뀌어 있으면 성공`() {
        val unknown = runA(listOf(ActionEvent.Open, ActionEvent.Send(1, 23.0), ActionEvent.Timeout(1)))
        assertEquals(listOf<Any?>(ActionPhase.FAILED, true, "적용되지 않았습니다 (지금 25). 다시 시도할 수 있습니다."), view(Actions.reduce(unknown, ActionEvent.Readback(1, 25.0))))
        assertEquals(listOf<Any?>(ActionPhase.VERIFIED_SUCCESS, true, "응답은 없었지만 다시 읽어 보니 23 로 바뀌어 있습니다"), view(Actions.reduce(unknown, ActionEvent.Readback(1, 23.0))))
    }

    @Test fun `거울 - 다시 읽을 수도 없으면 결과를 확정하지 않고 재시도도 막는다`() {
        val s = runA(listOf(ActionEvent.Open, ActionEvent.Send(1, 23.0), ActionEvent.Timeout(1), ActionEvent.Readback(1, null)))
        assertEquals(ActionPhase.UNKNOWN_OUTCOME to false, s.phase to s.canRetry)
    }

    @Test fun `거울 - 타임아웃 뒤 늦게 온 콜백은 그 요청의 것이면 반영한다`() {
        assertEquals(listOf<Any?>(ActionPhase.VERIFIED_SUCCESS, true, "시연 값으로 23 적용 — 응답이 늦게 왔습니다"), view(runA(listOf(ActionEvent.Open, ActionEvent.Send(1, 23.0), ActionEvent.Timeout(1), ActionEvent.Callback(1, 23.0)))))
    }

    @Test fun `거울 - 지난 요청의 늦은 콜백은 지금 요청 결과를 덮지 않는다`() {
        val failed = runA(listOf(ActionEvent.Open, ActionEvent.Send(1, 23.0), ActionEvent.Error(1, "거절")))
        val second = runA(listOf(ActionEvent.Open, ActionEvent.Send(2, 22.0)), failed)
        val after = Actions.reduce(second, ActionEvent.Callback(1, 23.0))
        assertEquals(listOf<Any?>(ActionPhase.PENDING, 2, 22.0), listOf(after.phase, after.requestId, after.target))
    }

    @Test fun `거울 - 값이 다르면 실패 · 보내는 중에 다시 열지 않는다`() {
        val pending = runA(listOf(ActionEvent.Open, ActionEvent.Send(1, 23.0)))
        assertEquals(pending, Actions.reduce(pending, ActionEvent.Open))
        assertEquals(listOf<Any?>(ActionPhase.FAILED, true, "요청한 값과 차량 값이 다릅니다 (요청 23 · 현재 25)."), view(Actions.reduce(pending, ActionEvent.Callback(1, 25.0))))
    }

    @Test fun `거울 - 확인 카드를 연 채 출발하면 승인이 무효가 된다 · 이미 보낸 요청은 계속 기다린다`() {
        assertEquals(listOf<Any?>(ActionPhase.IDLE, true, "주행이 시작돼 확인을 취소했습니다"), view(runA(listOf(ActionEvent.Open, ActionEvent.Invalidate("주행이 시작돼 확인을 취소했습니다")))))
        assertEquals(ActionPhase.PENDING, runA(listOf(ActionEvent.Open, ActionEvent.Send(1, 23.0), ActionEvent.Invalidate("x"))).phase)
    }

    // ── P1-7 G — 아무 제안도 필요 없는 날 ─────────────────
    @Test fun `거울 - 확인할 하차 항목이 없으면 목적지에 주차해도 하차 준비를 묻지 않는다`() {
        val r = SuggestionPlanner.plan(base.copy(journey = at(JourneyPhase.PARKED, true), energy = null, climate = null, checklistPending = 0))
        assertEquals(Triple<Suggestion?, Int, Int>(null, 0, 0), Triple(r.top, r.companions.size, r.inbox.size))
    }
}
