package app.commadrive.core.assistant

import app.commadrive.core.BreakPhase
import app.commadrive.core.Fixtures
import app.commadrive.core.Verdict
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * MY CO-PILOT 상황 판단 — `src/lib/assistant/assistant.test.ts` 와 **같은 입력·같은 기대값**이다 (거울).
 * 테스트 이름은 규칙 문장이다.
 */
class AssistantTest {
    private fun sig(
        gear: Gear = Gear.DRIVE, parkingBrake: Boolean? = false, speedKmh: Double? = 0.0, uxRestricted: Boolean? = null, remainingKm: Double? = 50.0,
    ) = JourneySignals(gear, parkingBrake, speedKmh, uxRestricted, remainingKm)
    private fun at(phase: JourneyPhase, atDestination: Boolean = false) = JourneyState(phase, atDestination, Confidence.CONFIRMED)
    private fun moving(remainingKm: Double? = 50.0) = sig(speedKmh = 80.0, uxRestricted = true, remainingKm = remainingKm)
    private fun parked(remainingKm: Double? = 50.0) = sig(gear = Gear.PARK, uxRestricted = false, remainingKm = remainingKm)

    // ── 여정 단계 ───────────────────────────────────────────

    @Test fun `속도 0 만으로는 주차라고 하지 않는다 — P 단은 확정, 주차 브레이크+정지는 추정`() {
        assertEquals(Motion(MotionKind.STOPPED, Confidence.CONFIRMED), Journey.motionOf(sig()))
        assertEquals(Motion(MotionKind.PARKED, Confidence.CONFIRMED), Journey.motionOf(sig(gear = Gear.PARK)))
        assertEquals(Motion(MotionKind.PARKED, Confidence.INFERRED), Journey.motionOf(sig(gear = Gear.UNKNOWN, parkingBrake = true)))
        assertEquals(Motion(MotionKind.UNKNOWN, Confidence.UNKNOWN), Journey.motionOf(sig(gear = Gear.UNKNOWN, speedKmh = null)))
    }

    @Test fun `출발 준비 중에 차가 움직이면 주행이 된다`() {
        val s = Journey.next(JourneyState.INITIAL, parked(), JourneyEvent.START_PREPARE)
        assertEquals(JourneyPhase.PREPARING, s.phase)
        assertEquals(JourneyPhase.DRIVING, Journey.next(s, moving()).phase)
    }

    @Test fun `신호대기(정지)는 단계를 바꾸지 않는다`() {
        assertEquals(JourneyPhase.DRIVING, Journey.next(at(JourneyPhase.DRIVING), sig()).phase)
    }

    @Test fun `목적지 3km 안이면 곧 도착 — 4km 로 멀어져도 유지, 5km 를 넘어야 주행으로 돌아간다`() {
        val a = Journey.next(at(JourneyPhase.DRIVING), moving(2.5))
        assertEquals(JourneyPhase.APPROACHING, a.phase)
        assertEquals(JourneyPhase.APPROACHING, Journey.next(a, moving(4.0)).phase)
        assertEquals(JourneyPhase.DRIVING, Journey.next(a, moving(6.0)).phase)
    }

    @Test fun `목적지가 아닌 곳의 주차는 중간 정차, 0_5km 안의 주차는 도착이다`() {
        assertEquals(at(JourneyPhase.PARKED, false), Journey.next(at(JourneyPhase.DRIVING), parked(120.0)))
        assertEquals(at(JourneyPhase.PARKED, true), Journey.next(at(JourneyPhase.APPROACHING), parked(0.3)))
    }

    @Test fun `도착해 주차해도 하차 화면으로 저절로 넘어가지 않는다 — 사용자가 시작해야 한다`() {
        val p = at(JourneyPhase.PARKED, true)
        assertEquals(JourneyPhase.PARKED, Journey.next(p, parked(0.1)).phase)
        assertEquals(JourneyPhase.FINISHING, Journey.next(p, parked(), JourneyEvent.START_FINISH).phase)
    }

    @Test fun `하차하지 않고 다시 출발하면 주행으로 돌아간다`() {
        assertEquals(JourneyPhase.DRIVING, Journey.next(at(JourneyPhase.FINISHING, true), moving()).phase)
        assertEquals(JourneyPhase.DRIVING, Journey.next(at(JourneyPhase.PARKED), moving()).phase)
    }

    @Test fun `중간 정차에서 하차 확인을 마치면 주차로 돌아간다 — 여정을 끝내지 않는다`() {
        val j = Journey.next(Journey.next(at(JourneyPhase.PARKED), parked(), JourneyEvent.START_FINISH), parked(), JourneyEvent.FINISH_DONE)
        assertEquals(JourneyPhase.PARKED, j.phase)
        assertEquals(false, j.atDestination)
    }

    @Test fun `여정은 사용자가 끝내거나 취소할 때만 완료된다`() {
        assertEquals(JourneyPhase.COMPLETED, Journey.next(at(JourneyPhase.PREPARING), parked(), JourneyEvent.CANCEL_TRIP).phase)
        assertEquals(JourneyPhase.COMPLETED, Journey.next(at(JourneyPhase.FINISHING, true), parked(), JourneyEvent.FINISH_DONE).phase)
        assertEquals(JourneyPhase.DRIVING, Journey.next(at(JourneyPhase.DRIVING), moving(), JourneyEvent.FINISH_DONE).phase)
    }

    @Test fun `움직임을 모르면 단계를 바꾸지 않는다`() {
        assertEquals(JourneyPhase.DRIVING, Journey.next(at(JourneyPhase.DRIVING), sig(gear = Gear.UNKNOWN, speedKmh = null)).phase)
    }

    @Test fun `앱을 다시 켜면 저장한 단계보다 지금 차 상태를 믿는다`() {
        assertEquals(JourneyPhase.PARKED, Journey.restore(at(JourneyPhase.DRIVING), parked()).phase)
        assertEquals(JourneyPhase.DRIVING, Journey.restore(at(JourneyPhase.FINISHING, true), moving()).phase)
    }

    @Test fun `주행 제한을 모르면 주차가 아닌 한 제한한다`() {
        assertTrue(Journey.isRestricted(sig(uxRestricted = null)))
        assertEquals(false, Journey.isRestricted(sig(gear = Gear.PARK, uxRestricted = null)))
        assertEquals(false, Journey.isRestricted(sig(uxRestricted = false)))
    }

    // ── Safety Gate ─────────────────────────────────────────

    private val ready = GateContext(
        uxRestricted = false,
        motion = Motion(MotionKind.PARKED, Confidence.CONFIRMED),
        capabilities = mapOf(Capability.HVAC_TEMPERATURE to true, Capability.NAVI_WAYPOINT to true, Capability.SEAT_POSITION to true),
        permissions = mapOf(Permission.CONTROL_CAR_CLIMATE to true, Permission.NAVI_ROUTE_SEARCH to true, Permission.CONTROL_CAR_SEATS to true),
        inFlight = emptySet(),
    )
    private val driving = ready.copy(uxRestricted = true, motion = Motion(MotionKind.MOVING, Confidence.CONFIRMED))
    private fun blockOf(r: GateResult) = r.block?.name ?: "ALLOWED"

    @Test fun `주차 중 · 지원 · 권한 · 확인이 모두 있어야 공조를 바꾼다`() {
        assertEquals("ALLOWED", blockOf(SafetyGate.check(ActionType.SET_CLIMATE, ready, true)))
    }

    @Test fun `주행 중에는 공조 변경을 막는다 — 주행 제한이 풀려도 바퀴가 구르면 막는다`() {
        assertEquals("DRIVING_BLOCKED", blockOf(SafetyGate.check(ActionType.SET_CLIMATE, driving, true)))
        assertEquals("DRIVING_BLOCKED", blockOf(SafetyGate.check(ActionType.SET_CLIMATE, driving.copy(uxRestricted = false), true)))
    }

    @Test fun `차량 지원·권한을 모르면 없는 것으로 본다 (fail closed)`() {
        assertEquals("UNSUPPORTED", blockOf(SafetyGate.check(ActionType.SET_CLIMATE, ready.copy(capabilities = mapOf(Capability.HVAC_TEMPERATURE to null)), true)))
        assertEquals("NO_PERMISSION", blockOf(SafetyGate.check(ActionType.SET_CLIMATE, ready.copy(permissions = emptyMap()), true)))
        assertEquals("NO_PERMISSION", blockOf(SafetyGate.check(ActionType.SET_CLIMATE, ready.copy(permissions = mapOf(Permission.CONTROL_CAR_CLIMATE to false)), true)))
    }

    @Test fun `확인하기 전에는 실행하지 않고, 확인한 뒤 차가 출발했으면 다시 막는다`() {
        assertEquals("NEEDS_CONFIRMATION", blockOf(SafetyGate.check(ActionType.SET_CLIMATE, ready, false)))
        assertEquals("DRIVING_BLOCKED", blockOf(SafetyGate.check(ActionType.SET_CLIMATE, driving, true)))
    }

    @Test fun `좌석은 정차가 아니라 주차여야 바꾼다`() {
        val stopped = ready.copy(motion = Motion(MotionKind.STOPPED, Confidence.CONFIRMED))
        assertEquals("NEEDS_PARKED", blockOf(SafetyGate.check(ActionType.SET_SEAT, stopped, true)))
    }

    @Test fun `같은 요청을 두 번 보내지 않는다`() {
        assertEquals("DUPLICATE", blockOf(SafetyGate.check(ActionType.SET_CLIMATE, ready.copy(inFlight = setOf(ActionType.SET_CLIMATE)), true)))
    }

    @Test fun `주행 중에도 충전 경유지 제안과 (확인한) 경유지 추가는 된다 · 프로필 불러오기는 정차 후로 미룬다`() {
        assertEquals("ALLOWED", blockOf(SafetyGate.check(ActionType.SUGGEST_CHARGE_STOP, driving, false)))
        assertEquals("ALLOWED", blockOf(SafetyGate.check(ActionType.ADD_WAYPOINT, driving, true)))
        assertEquals("DRIVING_DEFERRED", blockOf(SafetyGate.check(ActionType.LOAD_PROFILE, driving, true)))
    }

    @Test fun `응답이 없거나 값이 다르면 성공이라고 하지 않는다 · 시연 성공은 시연이라고 적는다`() {
        assertEquals(ControlStatus.TIMEOUT, SafetyGate.settle(23.0, ControlOutcome.Timeout, 25.0, ControlSource.VEHICLE).status)
        assertEquals(ControlStatus.FAILED, SafetyGate.settle(23.0, ControlOutcome.Callback(23.0), 25.0, ControlSource.VEHICLE).status)
        assertEquals(ControlStatus.FAILED, SafetyGate.settle(23.0, ControlOutcome.Error("권한 없음"), null, ControlSource.VEHICLE).status)
        val mock = SafetyGate.settle(23.0, ControlOutcome.Callback(23.0), null, ControlSource.MOCK)
        assertEquals(Triple(ControlStatus.SUCCESS, ControlSource.MOCK, "시연 값으로 23 적용"), Triple(mock.status, mock.source, mock.message))
    }

    // ── 제안 엔진 ───────────────────────────────────────────

    private val energy = SuggestionPlanner.energySignalOf(Fixtures.plan, Fixtures.vehicle)
    private val base = PlannerInput(
        journey = at(JourneyPhase.PREPARING), restricted = false, now = 1_000_000L, energy = energy, breakPhase = BreakPhase.CRUISING,
        climate = ClimateGap(25.0, 23.0), checklistPending = 3, proactive = true, history = emptyMap(),
        context = PlannerContext("가족 이동", 68.0, 40, 20.0, 0, 90, 400.0),
    )

    @Test fun `거울 - 충전 제안의 근거는 차량 값 · 내 설정 · 추정 · 규칙으로 나뉜다`() {
        assertEquals(listOf(
            Evidence(EvidenceKind.VEHICLE, "배터리 68%"),
            Evidence(EvidenceKind.USER, "도착 후 대기 40분 · 최소 잔량 20%"),
            Evidence(EvidenceKind.ESTIMATE, "도착 후 40분 대기까지 하려면 약 47% 가 모자랍니다 (추정 36~58%). 경로상 한 번 충전을 권합니다."),
            Evidence(EvidenceKind.RULE, "판정 '부족' — 추정 범위 전체가 최소 잔량에 못 미침"),
        ), SuggestionPlanner.plan(base).top?.evidence)
    }

    @Test fun `거울 - 공조 제안의 근거는 저장 온도(내 설정)와 지금 설정(차량 값)을 따로 적는다`() {
        assertEquals(listOf(
            Evidence(EvidenceKind.USER, "가족 이동 프로필 저장 온도 23°C"),
            Evidence(EvidenceKind.VEHICLE, "지금 공조 설정 25°C"),
            Evidence(EvidenceKind.RULE, "차이 2°C — 1°C 이상이면 제안"),
        ), SuggestionPlanner.plan(base).companions[0].evidence)
    }

    @Test fun `거울 - 화면을 바꾸지 않아도 차량 상태가 바뀌면 제안이 바뀐다 (타임라인)`() {
        var j = Journey.next(JourneyState.INITIAL, parked(), JourneyEvent.START_PREPARE)
        var h = emptyMap<SuggestionType, SuggestionRecord>()
        val same = ClimateGap(23.0, 23.0)
        fun step(s: JourneySignals, input: PlannerInput = base): List<Any?> {
            j = Journey.next(j, s)
            val r = SuggestionPlanner.plan(input.copy(journey = j, restricted = Journey.isRestricted(s), history = h))
            return listOf(j.phase.name, r.top?.type?.name, r.companions.joinToString(",") { it.type.name }, r.inbox.joinToString(",") { "${it.type}:${it.status}" })
        }
        val seen = mutableListOf(step(parked()))
        h = SuggestionPlanner.recordAccepted(h, SuggestionType.ENERGY_DECISION) // 사용자가 경유지를 넣었다
        seen += step(parked())
        seen += step(parked(), base.copy(climate = same)) // 공조 패널에서 직접 맞췄다
        seen += step(moving(), base.copy(climate = same, breakPhase = BreakPhase.SUGGEST)) // 출발 · 90분 주행
        seen += step(moving(2.5), base.copy(climate = same, breakPhase = BreakPhase.SUGGEST)) // 목적지 3km 앞
        seen += step(parked(0.2), base.copy(climate = same, breakPhase = BreakPhase.SUGGEST)) // 도착 주차
        assertEquals<List<List<Any?>>>(listOf(
            listOf("PREPARING", "ENERGY_DECISION", "PROFILE_PREPARATION", ""),
            listOf("PREPARING", "PROFILE_PREPARATION", "", ""),
            listOf("PREPARING", null, "", ""),
            listOf("DRIVING", "BREAK_PLANNING", "", ""),
            listOf("APPROACHING", null, "", "ARRIVAL_PREPARATION:DEFERRED"),
            listOf("PARKED", "CHECKLIST_REMINDER", "", ""),
        ), seen)
    }
    private fun rows(r: PlanResult) = r.inbox.map { Triple(it.type, it.priority, it.status) }

    @Test fun `거울 - 기본 시나리오의 에너지 판단은 쉼표 DRIVE 엔진 문장 그대로다`() {
        assertEquals(Verdict.SHORT, energy?.verdict)
        assertEquals("도착 후 40분 대기까지 하려면 약 47% 가 모자랍니다 (추정 36~58%). 경로상 한 번 충전을 권합니다.", energy?.message)
    }

    @Test fun `거울 - 부족하면 충전 판단(위험)이 주요 제안이고, 공조 맞추기(90)는 함께 할 일로 옆에 나온다`() {
        val r = SuggestionPlanner.plan(base)
        assertEquals(Triple(SuggestionType.ENERGY_DECISION, 100, SuggestionTier.RISK), Triple(r.top?.type, r.top?.priority, r.top?.tier))
        assertEquals(listOf(Triple(SuggestionType.PROFILE_PREPARATION, 90, SuggestionTier.PHASE)), r.companions.map { Triple(it.type, it.priority, it.tier) })
        assertEquals(0, r.inbox.size)
        assertTrue(r.companions[0].confirmationRequired)
    }

    @Test fun `공조 차이가 1°C 미만이면 제안하지 않는다`() {
        assertNull(SuggestionPlanner.plan(base.copy(energy = null, climate = ClimateGap(23.5, 23.0))).top)
    }

    @Test fun `거울 - 주행 중 충전 판단은 96 · 덜 중요한 도착 안내는 정차까지 보류한다`() {
        val r = SuggestionPlanner.plan(base.copy(journey = at(JourneyPhase.APPROACHING), restricted = true))
        assertEquals(SuggestionType.ENERGY_DECISION to 96, r.top?.type to r.top?.priority)
        assertEquals(listOf(Triple(SuggestionType.ARRIVAL_PREPARATION, 81, SuggestionStatus.DEFERRED)), rows(r))
    }

    @Test fun `휴식 간격이 지나도 곧 도착이면 쉬어 가자고 하지 않는다`() {
        val driving = SuggestionPlanner.plan(base.copy(journey = at(JourneyPhase.DRIVING), restricted = true, energy = null, breakPhase = BreakPhase.SUGGEST))
        assertEquals(SuggestionType.BREAK_PLANNING, driving.top?.type)
        val near = SuggestionPlanner.plan(base.copy(journey = at(JourneyPhase.APPROACHING), restricted = true, energy = null, breakPhase = BreakPhase.SUGGEST))
        assertNull(near.top)
    }

    @Test fun `거울 - 목적지에 주차하면 하차 준비(95)를 묻고 충전 판단은 꺼내지 않는다`() {
        val r = SuggestionPlanner.plan(base.copy(journey = at(JourneyPhase.PARKED, true)))
        assertEquals(Triple(SuggestionType.CHECKLIST_REMINDER, 95, ActionType.CONFIRM_FINISH), Triple(r.top?.type, r.top?.priority, r.top?.action))
        assertEquals(0, r.inbox.size)
        assertTrue(r.top!!.explanation.contains("직접 확인"))
    }

    @Test fun `거절한 제안은 10분 동안 다시 띄우지 않는다`() {
        val h = SuggestionPlanner.recordDismissed(emptyMap(), SuggestionType.ENERGY_DECISION, base.now)
        assertEquals(SuggestionType.PROFILE_PREPARATION, SuggestionPlanner.plan(base.copy(history = h, now = base.now + 9 * 60_000)).top?.type)
        assertEquals(SuggestionType.ENERGY_DECISION, SuggestionPlanner.plan(base.copy(history = h, now = base.now + 11 * 60_000)).top?.type)
    }

    @Test fun `세 번 연달아 거절하면 먼저 띄우지 않고 추천함에만 둔다`() {
        var h = emptyMap<SuggestionType, SuggestionRecord>()
        repeat(3) { h = SuggestionPlanner.recordDismissed(h, SuggestionType.PROFILE_PREPARATION, 0) }
        val r = SuggestionPlanner.plan(base.copy(energy = null, history = h, now = 3_600_000))
        assertNull(r.top)
        assertEquals(listOf(SuggestionType.PROFILE_PREPARATION to SuggestionStatus.DEFERRED), r.inbox.map { it.type to it.status })
    }

    @Test fun `이번 여정에서 이미 한 것은 다시 제안하지 않고, 새 여정에서는 다시 묻는다`() {
        val h = SuggestionPlanner.recordAccepted(emptyMap(), SuggestionType.ENERGY_DECISION)
        assertEquals(SuggestionType.PROFILE_PREPARATION, SuggestionPlanner.plan(base.copy(history = h)).top?.type)
        assertEquals(SuggestionType.ENERGY_DECISION, SuggestionPlanner.plan(base.copy(history = SuggestionPlanner.newTrip(h))).top?.type)
    }

    @Test fun `'먼저 제안' 을 끄면 아무것도 앞에 띄우지 않는다`() {
        val r = SuggestionPlanner.plan(base.copy(proactive = false))
        assertNull(r.top)
        assertTrue(r.inbox.all { it.status == SuggestionStatus.DEFERRED })
    }

    // ── 제안 집계 — "필요할 때만 제안한다"를 검증 가능하게 (외부 평가 6 ③, 2026-10-27) ──
    private fun audit(r: PlanResult) = listOf(r.audit.reviewed, r.audit.shown, r.audit.held.joinToString(",") { "${it.type}:${it.reason}" })

    @Test fun `거울 - 집계 — 검토 수 · 표시 수 · 억제 이유 (이미 함 · 쿨다운 · 주행 중 · 연속 거절 · 먼저 제안 끔)`() {
        assertEquals(listOf(2, 2, ""), audit(SuggestionPlanner.plan(base)))
        assertEquals(listOf(2, 1, "ENERGY_DECISION:DONE_THIS_TRIP"), audit(SuggestionPlanner.plan(base.copy(history = SuggestionPlanner.recordAccepted(emptyMap(), SuggestionType.ENERGY_DECISION)))))
        val dismissed = SuggestionPlanner.recordDismissed(emptyMap(), SuggestionType.PROFILE_PREPARATION, base.now - 60_000)
        assertEquals(listOf(2, 1, "PROFILE_PREPARATION:COOLDOWN"), audit(SuggestionPlanner.plan(base.copy(history = dismissed))))
        assertEquals(listOf(2, 2, ""), audit(SuggestionPlanner.plan(base.copy(history = dismissed, now = base.now + 10 * 60_000))))
        assertEquals(listOf(1, 0, "ARRIVAL_PREPARATION:DRIVING"), audit(SuggestionPlanner.plan(base.copy(journey = at(JourneyPhase.APPROACHING), restricted = true, energy = null, breakPhase = BreakPhase.CRUISING))))
        val streak = mapOf(SuggestionType.PROFILE_PREPARATION to SuggestionRecord(dismissStreak = 3), SuggestionType.ENERGY_DECISION to SuggestionRecord(dismissStreak = 3))
        assertEquals(listOf(2, 1, "PROFILE_PREPARATION:DISMISSED"), audit(SuggestionPlanner.plan(base.copy(history = streak))))
        assertEquals(listOf(2, 0, "PROFILE_PREPARATION:PROACTIVE_OFF,ENERGY_DECISION:PROACTIVE_OFF"), audit(SuggestionPlanner.plan(base.copy(proactive = false))))
        assertEquals(listOf(0, 0, ""), audit(SuggestionPlanner.plan(base.copy(energy = null, climate = ClimateGap(23.0, 23.0), checklistPending = 0))))
    }

    @Test fun `거울 - 최소 안내(탑승 조합의 안내 빈도) — 주의 등급은 추천함으로, 위험·단계 할 일은 그대로`() {
        fun a(r: PlanResult) = listOf(r.audit.shown.toString(), r.audit.held.joinToString(",") { "${it.type}:${it.reason}" })
        val caution = base.copy(energy = EnergySignal(Verdict.TIGHT, "여유가 크지 않음"))
        assertEquals(listOf("1", "ENERGY_DECISION:QUIET"), a(SuggestionPlanner.plan(caution.copy(quiet = true))))
        assertEquals(SuggestionType.PROFILE_PREPARATION, SuggestionPlanner.plan(caution.copy(quiet = true)).top?.type)
        assertEquals(listOf("2", ""), a(SuggestionPlanner.plan(caution.copy(quiet = false))))
        assertEquals(listOf("2", ""), a(SuggestionPlanner.plan(base.copy(quiet = true))))
        assertEquals(SuggestionType.ENERGY_DECISION, SuggestionPlanner.plan(base.copy(quiet = true)).top?.type)
    }
}
