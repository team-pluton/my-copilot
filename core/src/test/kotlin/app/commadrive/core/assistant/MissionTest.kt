package app.commadrive.core.assistant

import app.commadrive.core.EnergyEstimator
import app.commadrive.core.Fixtures
import app.commadrive.core.PassengerType
import app.commadrive.core.TripMode
import app.commadrive.core.Verdict
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * V5 Journey Mission (2026-11-02) — `src/lib/assistant/mission.test.ts` 와 **같은 입력·같은 기대값**이다 (거울).
 * 뒤의 세션 테스트는 픽업 Mission 전체(선택 → 픽업 장소 도착 ≠ 완료 → 대기 중 귀가 제안 → 수락은 내비를 바꾸지 않음 → 귀가 구간 → 집 도착 완료)와 복원을 고정한다.
 */
class MissionTest {
    private fun j(phase: JourneyPhase, atDestination: Boolean = false, leg: Int = 0, legs: Int = 1) = JourneyState(phase, atDestination, Confidence.CONFIRMED, leg, legs)
    private val pickup = Profiles.planFor(Profiles.PRESETS.getValue(ProfileMode.PICKUP))
    private val base = MissionInput(ProfileMode.PICKUP, 3, "dad", pickup, j(JourneyPhase.PREPARING, legs = 2), WaitMode.IN_CAR, false, WaitSource.SAVED, false, true, "08:10", "08:00", emptyList())

    @Test fun `Mission 단계 — 여정 단계·구간·대기 유형·귀가 준비에서 계산한다`() {
        assertEquals(MissionPhase.MISSION_SELECTED, Missions.phaseOf(j(JourneyPhase.NOT_STARTED), WaitMode.IN_CAR, false))
        assertEquals(MissionPhase.PREPARE, Missions.phaseOf(j(JourneyPhase.PREPARING), WaitMode.IN_CAR, false))
        assertEquals(MissionPhase.EN_ROUTE, Missions.phaseOf(j(JourneyPhase.DRIVING, legs = 2), WaitMode.IN_CAR, false))
        assertEquals(MissionPhase.EN_ROUTE, Missions.phaseOf(j(JourneyPhase.PARKED, false, legs = 2), WaitMode.IN_CAR, false))
        assertEquals(MissionPhase.ARRIVED_AT_STOP, Missions.phaseOf(j(JourneyPhase.PARKED, true, legs = 2), WaitMode.IN_CAR, false))
        assertEquals(MissionPhase.WAITING, Missions.phaseOf(j(JourneyPhase.WAITING, true, legs = 2), WaitMode.IN_CAR, false))
        assertEquals(MissionPhase.VISITING, Missions.phaseOf(j(JourneyPhase.WAITING, true, legs = 2), WaitMode.AWAY, false))
        assertEquals(MissionPhase.NEXT_LEG_READY, Missions.phaseOf(j(JourneyPhase.WAITING, true, legs = 2), WaitMode.AWAY, true))
        assertEquals(MissionPhase.RETURNING, Missions.phaseOf(j(JourneyPhase.DRIVING, leg = 1, legs = 2), WaitMode.IN_CAR, false))
        assertEquals(MissionPhase.COMPLETED, Missions.phaseOf(j(JourneyPhase.COMPLETED, leg = 1, legs = 2), WaitMode.IN_CAR, false))
    }

    @Test fun `Mission — 픽업 후 귀가 복귀 목적지는 저장된 왕복 계획에서, 중간 목적지 도착은 완료가 아니다`() {
        val m = Missions.of(base)!!
        assertEquals(listOf("PICKUP#3", MissionType.PICKUP_RETURN, Occupancy.FAMILY, JourneyKind.PICKUP, "집 (귀가)", 2, MissionStatus.ACTIVE),
            listOf(m.missionId, m.missionType, m.occupancy, m.tripPurpose, m.returnDestination, m.remainingLegs, m.status))
        assertEquals(MissionWait(20, WaitSource.SAVED), m.wait)
        assertEquals("픽업 후 귀가 · 출발 준비", Missions.headline(m))
        assertEquals("귀가 집 (귀가) 일정 기억 중 · 방문 뒤에도 끝나지 않음", Missions.returnLine(m))
        val arrived = Missions.of(base.copy(journey = j(JourneyPhase.PARKED, true, legs = 2)))!!
        assertEquals(listOf(MissionPhase.ARRIVED_AT_STOP, false, MissionStatus.ACTIVE, 2), listOf(arrived.phase, arrived.finalStop, arrived.status, arrived.remainingLegs))
        val ready = Missions.of(base.copy(journey = j(JourneyPhase.WAITING, true, legs = 2), nextLegReady = true))!!
        assertEquals("귀가 일정은 기억하고 있어요 · 내비 경로는 아직 그대로예요 — '집으로 안내 시작'으로 요청할 수 있어요", Missions.returnLine(ready))
        val home = Missions.of(base.copy(journey = j(JourneyPhase.PARKED, true, leg = 1, legs = 2)))!!
        assertEquals(listOf(MissionPhase.ARRIVED_AT_STOP, true, 1, null), listOf(home.phase, home.finalStop, home.remainingLegs, Missions.returnLine(home)))
    }

    @Test fun `Mission — 귀가를 남긴 채 끝내면 중단, 마지막 구간까지 마치면 완료 · 프로필 없이는 유형 없음 · 고르기 전은 null`() {
        assertEquals(MissionStatus.CANCELLED, Missions.of(base.copy(journey = j(JourneyPhase.COMPLETED, legs = 2), endedEarly = true))!!.status)
        assertEquals(MissionStatus.COMPLETED, Missions.of(base.copy(journey = j(JourneyPhase.COMPLETED, leg = 1, legs = 2)))!!.status)
        val guest = Missions.of(base.copy(mode = ProfileMode.GUEST, plan = Profiles.planFor(Profiles.PRESETS.getValue(ProfileMode.GUEST)), waitSource = WaitSource.NONE))!!
        assertEquals(listOf(null, null, WaitSource.NONE), listOf(guest.missionType, guest.returnDestination, guest.wait.source))
        assertNull(Missions.of(base.copy(tripId = 0)))
        assertEquals("업무 방문 후 복귀", MissionType.WORK_VISIT_RETURN.label)
    }

    @Test fun `픽업 프리셋 — 왕복 2구간 · 차 안 대기 20분 · 아이 조건 · 기본 차량이면 충전 없이 충분`() {
        assertEquals(listOf(TripMode.WAIT, 2, 12.0, 12.0, 20, setOf(PassengerType.CHILD)), listOf(pickup.mode, Trip.legsOf(pickup), pickup.routeKm, pickup.returnKm, pickup.waitMinutesAfterArrival, pickup.passengers))
        assertEquals(WaitMode.IN_CAR, Profiles.defaultWaitModeOf(ProfileMode.PICKUP))
        assertEquals(listOf("휴대전화", "지갑·소지품", "차량 내 준비물", "다음 일정 확인", "아이 가방"), Profiles.finishItemsFor(ProfileMode.PICKUP, setOf(PassengerType.CHILD)))
        assertEquals(Verdict.OK, EnergyEstimator.verdictOf(Wait.energyFor(pickup, Profiles.DEMO_VEHICLE, WaitMode.IN_CAR)))
    }

    private val plannerBase = PlannerInput(
        j(JourneyPhase.WAITING, true, legs = 2), false, 0L, null, null, null, 0, true, emptyMap(),
        PlannerContext("아이 픽업 후 귀가", 60.0, 20, 15.0, 10, 90, 0.0), mission = MissionHint(false, "집 (귀가)"),
    )

    @Test fun `귀가 제안 — 대기 중에 한 번 묻는다(결정 등급) · 준비됐거나 복귀 목적지가 없으면 묻지 않는다`() {
        val r = SuggestionPlanner.plan(plannerBase)
        assertEquals(SuggestionType.NEXT_LEG, r.top?.type)
        assertEquals(listOf(SuggestionTier.DECISION, ActionType.PREPARE_NEXT_LEG, true, false), listOf(r.top?.tier, r.top?.action, r.top?.confirmationRequired, r.top?.allowedWhileDriving))
        assertEquals("방문을 마치셨나요?", r.top?.title)
        assertEquals("귀가 일정이 남아 있어요.\n다음 이동: 집으로\n확인하면 '집으로 안내 시작'으로 내비에 경로를 요청할 수 있어요 — 그전에는 경로를 바꾸지 않아요.", r.top?.explanation)
        assertNull(SuggestionPlanner.plan(plannerBase.copy(mission = MissionHint(true, "집 (귀가)"))).top)
        assertNull(SuggestionPlanner.plan(plannerBase.copy(mission = MissionHint(false, null))).top)
        assertNull(SuggestionPlanner.plan(plannerBase.copy(journey = j(JourneyPhase.PARKED, true, legs = 2))).top)
    }

    @Test fun `귀가 제안 — 에너지 부족이 먼저, 결정은 둘째 · 주의보다는 결정이 먼저`() {
        val short = SuggestionPlanner.plan(plannerBase.copy(energy = EnergySignal(Verdict.SHORT, "집까지 세면 약 5%p 모자람")))
        assertEquals(SuggestionType.ENERGY_DECISION to SuggestionType.NEXT_LEG, short.top?.type to short.companions[0].type)
        val tight = SuggestionPlanner.plan(plannerBase.copy(energy = EnergySignal(Verdict.TIGHT, "여유가 크지 않음")))
        assertEquals(SuggestionType.NEXT_LEG to SuggestionType.ENERGY_DECISION, tight.top?.type to tight.companions[0].type)
    }

    @Test fun `귀가 준비 액션 — 주차한 채 확인했을 때만 · 주행 중·확인 전은 막힌다`() {
        val parked = GateContext(false, Motion(MotionKind.PARKED, Confidence.CONFIRMED), emptyMap(), emptyMap(), emptySet())
        assertTrue(SafetyGate.check(ActionType.PREPARE_NEXT_LEG, parked, true).allowed)
        assertEquals(GateBlock.NEEDS_CONFIRMATION, SafetyGate.check(ActionType.PREPARE_NEXT_LEG, parked, false).block)
        assertEquals(GateBlock.DRIVING_BLOCKED, SafetyGate.check(ActionType.PREPARE_NEXT_LEG, parked.copy(motion = Motion(MotionKind.MOVING, Confidence.CONFIRMED)), true).block)
    }

    // ── 세션: 픽업 Mission 전체 ──────────────────────────
    private val session = CopilotSession(Fixtures.demoStops)
    private fun run(vararg intents: Intent, from: SessionState = SessionState()) = intents.fold(from, session::reduce)

    @Test fun `픽업 Mission — 픽업 장소 도착은 완료가 아니다 · 대기 중 귀가 제안 · 수락은 내비를 바꾸지 않는다 · 출발하면 귀가 구간 · 집 도착으로 완료`() {
        var s = run(Intent.Choose(ProfileMode.PICKUP), Intent.StartPrepare)
        var m = session.view(s).mission!!
        assertEquals(listOf(MissionType.PICKUP_RETURN, MissionPhase.PREPARE, 2, "집 (귀가)", WaitSource.SAVED, "08:00"), listOf(m.missionType, m.phase, m.remainingLegs, m.returnDestination, m.wait.source, m.createdAt))
        s = run(Intent.Drive, Intent.JumpTo(11.8), Intent.Park, from = s)
        m = session.view(s).mission!!
        assertEquals(MissionPhase.ARRIVED_AT_STOP to false, m.phase to m.finalStop)
        assertEquals(MissionStatus.ACTIVE, m.status) // 중간 목적지 도착은 완료가 아니다
        s = run(Intent.StartWait, Intent.ClearToast, from = s)
        val v = session.view(s)
        assertEquals(MissionPhase.WAITING, v.mission!!.phase)
        assertEquals(SuggestionType.NEXT_LEG, v.suggestions.top?.type)
        val planBefore = s.plan
        s = run(Intent.ReadyNextLeg, from = s)
        assertEquals(MissionPhase.NEXT_LEG_READY, session.view(s).mission!!.phase)
        assertEquals(planBefore, s.plan) // 내비 목적지·계획은 앱이 바꾸지 않는다
        assertTrue(s.waypoints.isEmpty())
        assertEquals("귀가 일정을 확인했어요 · 내비 경로는 아직 그대로예요 — '집으로 안내 시작'을 누르면 내비에 집 경로를 요청하고, 목적지를 다시 읽어 확인합니다", s.toast)
        assertNull(session.view(s).suggestions.top) // 한 번만 묻는다
        s = run(Intent.Drive, from = s)
        m = session.view(s).mission!!
        assertEquals(listOf(MissionPhase.RETURNING, 1, false), listOf(m.phase, m.remainingLegs, s.nextLegReady)) // 구간이 바뀌면 준비 확인은 그 구간의 것
        s = run(Intent.JumpTo(11.8), Intent.Park, from = s)
        m = session.view(s).mission!!
        assertEquals(MissionPhase.ARRIVED_AT_STOP to true, m.phase to m.finalStop)
        s = run(Intent.StartFinish, Intent.SetChecked(s.profile.finishChecklist), Intent.Complete, from = s)
        m = session.view(s).mission!!
        assertEquals(listOf(MissionPhase.COMPLETED, MissionStatus.COMPLETED, 0), listOf(m.phase, m.status, m.remainingLegs))
    }

    @Test fun `귀가 준비는 대기 중에만 · 주행 중이면 막힌다 · 귀가를 남긴 채 끝내면 CANCELLED`() {
        var s = run(Intent.Choose(ProfileMode.WORK), Intent.StartPrepare, Intent.Drive, Intent.ReadyNextLeg)
        assertFalse(s.nextLegReady)
        s = run(Intent.JumpTo(37.8), Intent.Park, Intent.StartWait, Intent.EndTrip, from = s)
        assertEquals(MissionStatus.CANCELLED, session.view(s).mission!!.status)
        // 다시 고르면 중단 표시는 지워진다
        assertEquals(MissionStatus.ACTIVE, session.view(run(Intent.ChooseAndPrepare(ProfileMode.WORK), from = s)).mission!!.status)
    }

    @Test fun `대기 시간의 출처 — 저장된 계획 → 직접 바꾸면 직접 확인 · 프로필 없이는 없음`() {
        val s = run(Intent.Choose(ProfileMode.WORK), Intent.StartPrepare)
        assertEquals(WaitSource.SAVED, session.view(s).mission!!.wait.source)
        assertEquals(WaitSource.USER, session.view(run(Intent.ChangeWait(30), from = s)).mission!!.wait.source)
        assertEquals(WaitSource.USER, session.view(run(Intent.SetWaitMode(WaitMode.IN_CAR), from = s)).mission!!.wait.source)
        assertEquals(WaitSource.NONE, session.view(run(Intent.Choose(ProfileMode.GUEST), Intent.StartPrepare)).mission!!.wait.source)
    }

    @Test fun `복원 — 대기 중 스냅샷을 되살리면 같은 Mission · 열려 있던 확인은 복원하지 않는다 · 끝난 이동은 복원하지 않는다`() {
        var s = run(Intent.Choose(ProfileMode.PICKUP), Intent.StartPrepare, Intent.Drive, Intent.JumpTo(11.8), Intent.Park, Intent.StartWait, Intent.RequestClimate)
        assertEquals(ActionPhase.CONFIRMING, s.action.phase)
        val snap = session.snapshot(s)
        assertTrue(Missions.restorable(snap))
        val r = session.restore(snap, SessionState(profiles = s.profiles, vault = s.vault))
        assertEquals(session.view(s).mission, session.view(r).mission)
        assertEquals(listOf(s.journey, s.traveledKm, s.waitMode, s.memory.tripId, ActionPhase.IDLE), listOf(r.journey, r.traveledKm, r.waitMode, r.memory.tripId, r.action.phase))
        assertEquals("이동 #1 를 이어서 합니다 · ${s.clock} 저장", r.toast)
        assertTrue(Memory.activityOf(r.vault, ProfileMode.PICKUP).first().text.startsWith("앱을 다시 열어 이동 #1 를 이어서"))
        // 복원 뒤 지금 차 신호로 다시 판단한다 — 저장은 대기 중인데 차가 달리고 있으면 귀가 구간
        val moving = session.restore(snap, SessionState(profiles = s.profiles, vault = s.vault, car = CarState(gear = Gear.DRIVE, parkingBrake = false, speedKmh = 40.0)))
        assertEquals(JourneyPhase.DRIVING to 1, moving.journey.phase to moving.journey.leg)
        s = run(Intent.EndTrip, from = s)
        assertFalse(Missions.restorable(session.snapshot(s)))
        assertEquals(SessionState(), session.restore(session.snapshot(s)))
    }

    @Test fun `귀가 재질문 - 계속 기다리기 뒤에는 대기 계획으로, 예정이 지나면 한 번만 다른 질문, 두 번째 거절이나 예정 없음이면 다시 묻지 않음`() {
        fun m(waited: Int, planned: Int = 20) = MissionHint(false, "집 (귀가)", waited, planned)
        assertEquals("계속 기다리시면 대기 예정 20분이 지날 때 한 번만 다시 확인해요. 집으로 출발은 대기 카드에서 언제든 할 수 있어요.", SuggestionPlanner.plan(plannerBase.copy(mission = m(0))).top?.ifSkipped)
        val once = SuggestionPlanner.recordDismissed(emptyMap(), SuggestionType.NEXT_LEG, 0L)
        for (w in listOf(11, 19)) {
            val r = SuggestionPlanner.plan(plannerBase.copy(now = w * 60_000L, history = once, mission = m(w)))
            assertNull(r.top, "${w}분")
            assertEquals(listOf(Held(SuggestionType.NEXT_LEG, HeldReason.KEEP_WAITING)), r.audit.held)
        }
        val again = SuggestionPlanner.plan(plannerBase.copy(now = 20 * 60_000L, history = once, mission = m(20)))
        assertEquals("아직 기다리는 중인가요?", again.top?.title)
        assertEquals("계속 기다리시면 다시 묻지 않아요. 집으로 출발은 대기 카드에서 언제든 할 수 있어요.", again.top?.ifSkipped)
        val twice = SuggestionPlanner.recordDismissed(once, SuggestionType.NEXT_LEG, 20 * 60_000L)
        assertNull(SuggestionPlanner.plan(plannerBase.copy(now = 90 * 60_000L, history = twice, mission = m(90))).top)
        assertNull(SuggestionPlanner.plan(plannerBase.copy(now = 60 * 60_000L, history = once, mission = m(60, 0))).top)
        assertEquals("방문을 마치셨나요?", SuggestionPlanner.plan(plannerBase.copy(now = 200 * 60_000L, history = SuggestionPlanner.newTrip(twice), mission = m(0))).top?.title)
    }

    @Test fun `하차 체크리스트는 완료 조건이 아니다 - 미확인 항목은 이름까지, 확인 안 함으로`() {
        val p = Profiles.PRESETS.getValue(ProfileMode.PICKUP)
        assertEquals("확인하지 않은 항목 2개(다음 일정 확인, 아이 가방) — 마치면 '확인 안 함'으로 기록해요. 앱은 차 안을 대신 확인하지 못해요.", Profiles.finishNote(p, listOf("휴대전화", "지갑·소지품", "차량 내 준비물")))
        assertNull(Profiles.finishNote(p, p.finishChecklist))
        val fam = Profiles.PRESETS.getValue(ProfileMode.FAMILY)
        assertTrue(Profiles.finishNote(fam, emptyList())!!.startsWith("중요 · "))
    }
}
