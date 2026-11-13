package app.commadrive.core.assistant

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** 2차 개선(CHECKLIST-2) — `src/lib/assistant/experience.test.ts` 와 같은 입력·같은 기대값 (거울) */
class ExperienceTest {
    private val base = PrepareInput(ClimateState.DIFFERENT, 25.0, 23.0, null, null, 3, 0, EnergyStatus.SHORT, false)

    @Test fun `출발 준비 — 끝난 것과 남은 것을 한 문장으로`() {
        val s = Prepare.status(base.copy(climateDecision = ClimateDecision(ClimateDecisionKind.APPLIED, 23.0), packedCount = 3))
        assertEquals("출발 준비에서 두 가지는 확인됐고, 충전 계획 한 가지만 남았습니다", s.summary)
        assertEquals(listOf(2, 1, 0), listOf(s.done, s.needs, s.unsupported))
        assertEquals(false, s.ready)
    }

    @Test fun `출발 준비 — 다 끝났으면 완료 버튼을 요구하지 않는다`() {
        val s = Prepare.status(base.copy(climate = ClimateState.SAME, packedCount = 3, energy = EnergyStatus.OK))
        assertEquals(true to "출발 준비가 끝났습니다 · 바로 출발하셔도 됩니다", s.ready to s.summary)
    }

    @Test fun `출발 준비 — 권한이 없어 바꿀 수 없는 공조는 남은 일이 아니라 직접 확인`() {
        val s = Prepare.status(base.copy(climateBlocked = "공조 제어 권한이 없습니다", packedCount = 3, energy = EnergyStatus.OK))
        assertEquals(PrepareItemState.UNSUPPORTED, s.items[0].state)
        assertEquals(listOf(0, 1), listOf(s.needs, s.unsupported))
        assertEquals("확인할 수 있는 준비는 끝났습니다 · 공조는 차량에서 직접 확인해 주세요", s.summary)
    }

    @Test fun `출발 준비 — 차량 값을 모르면 에너지는 직접 확인`() {
        val s = Prepare.status(base.copy(climate = ClimateState.SKIP, packingTotal = 0, energy = EnergyStatus.UNKNOWN))
        assertEquals(listOf(PrepareItemState.NOT_APPLICABLE, PrepareItemState.NOT_APPLICABLE, PrepareItemState.UNSUPPORTED), s.items.map { it.state })
        assertEquals("확인할 수 있는 준비는 끝났습니다 · 충전 계획은 차량에서 직접 확인해 주세요", s.summary)
    }

    @Test fun `출발 준비 — 아무것도 안 했으면 남은 것만`() {
        assertEquals("출발 전에 공조·준비물·충전 계획 세 가지를 확인해 주세요", Prepare.status(base).summary)
        assertEquals(PrepareItemState.DONE, Prepare.status(base.copy(waypointChosen = true, energy = EnergyStatus.OK)).items[2].state)
        assertEquals(PrepareItem(PrepareItemKey.ENERGY, PrepareItemState.NEEDS_CHECK, "선택한 경유지만으로는 여유가 크지 않아요"), Prepare.status(base.copy(waypointChosen = true)).items[2])
    }

    private val work = Profiles.planFor(Profiles.PRESETS.getValue(ProfileMode.WORK))
    private val low = Profiles.DEMO_VEHICLE.copy(batteryPct = 45.0)
    private val long = work.copy(waitMinutesAfterArrival = 210)

    @Test fun `대기 유형 — 차를 두고 다녀오면 그대로, 차 안에서 기다리면 주의`() {
        assertEquals(EnergyStatus.OK, EnergyViews.of(Wait.energyFor(long, low, WaitMode.AWAY), 45.0, null).status)
        assertEquals(EnergyStatus.CAUTION, EnergyViews.of(Wait.energyFor(long, low, WaitMode.IN_CAR), 45.0, null).status)
        assertTrue("도착 후 대기 210분 · 차를 두고 밖에서 → 주차 중 공조 미사용 가정 (대기 중 다른 소비는 계산에 없음)" in Wait.energyFor(long, low, WaitMode.AWAY).assumptions)
    }

    @Test fun `상태 분리 — 차는 주차, 사람은 방문 중`() {
        val waiting = JourneyState(JourneyPhase.WAITING, true, Confidence.CONFIRMED, 0, 2)
        val parked = Motion(MotionKind.PARKED, Confidence.CONFIRMED)
        assertEquals(VehicleStatus.PARKED to TripStatus.VISITING, Wait.statusOf(waiting, parked, WaitMode.AWAY).let { it.vehicle to it.trip })
        assertEquals("차 안에서 대기", Wait.statusOf(waiting, parked, WaitMode.IN_CAR).trip.label)
        assertEquals("중간 정차", Wait.statusOf(waiting.copy(phase = JourneyPhase.PARKED, atDestination = false), parked, WaitMode.AWAY).trip.label)
        assertEquals("잠시 내림", Wait.statusOf(waiting.copy(phase = JourneyPhase.FINISHING, atDestination = false), parked, WaitMode.AWAY).trip.label)
        assertEquals("귀가 중", Wait.statusOf(waiting.copy(phase = JourneyPhase.DRIVING, leg = 1), Motion(MotionKind.MOVING, Confidence.CONFIRMED), WaitMode.AWAY).trip.label)
    }

    @Test fun `선택지 — 충분이면 내지 않고, 업무 대기 210분은 차를 두고 다녀오면 충분`() {
        assertEquals(emptyList(), Options.energyOptions(work, low, WaitMode.IN_CAR, null))
        val o = Options.energyOptions(long, low, WaitMode.IN_CAR, null)
        assertEquals(
            listOf(Triple(EnergyOptionKey.AS_IS, EnergyStatus.CAUTION, false), Triple(EnergyOptionKey.WAIT_AWAY, EnergyStatus.OK, true), Triple(EnergyOptionKey.WAIT_SHORTER, EnergyStatus.CAUTION, false)),
            o.map { Triple(it.key, it.status, it.improves) },
        )
        assertEquals(listOf(null, EnergyOptionAction.SET_WAIT_AWAY, null), o.map { it.action })
    }

    @Test fun `선택지 — 가족 서울→부산은 김천에서 80% 충전하면 충분`() {
        val o = Options.energyOptions(Profiles.planFor(Profiles.PRESETS.getValue(ProfileMode.FAMILY)), Profiles.DEMO_VEHICLE, WaitMode.IN_CAR, ChargeCandidate("김천휴게소", 250.0))
        assertEquals(listOf(EnergyStatus.SHORT, EnergyStatus.SHORT, EnergyStatus.SHORT, EnergyStatus.OK), o.map { it.status })
        assertEquals("김천휴게소에서 80%까지 충전하면" to "도착 예상 잔량 약 43% (추정)", o[3].label to o[3].detail)
    }

    @Test fun `대기 한계 — 차 안은 약 120분까지 · 차 밖은 무관 · 대기 없이도 모자라면 말하지 않음`() {
        assertEquals(120, Options.maxWaitWithoutCharge(long, low, WaitMode.IN_CAR))
        assertEquals("차 안 대기가 약 120분을 넘으면 충전이 필요해집니다 (추정 범위 기준) · 지금 계획 210분", Options.waitLimitLine(120, 210))
        assertNull(Options.maxWaitWithoutCharge(long, low, WaitMode.AWAY))
        assertEquals(-1, Options.maxWaitWithoutCharge(Profiles.planFor(Profiles.PRESETS.getValue(ProfileMode.FAMILY)), Profiles.DEMO_VEHICLE, WaitMode.IN_CAR))
        assertNull(Options.waitLimitLine(-1, 40))
    }

    @Test fun `신선도 — 기어는 즉시 모름, 배터리는 10분까지 끊기기 전 값, 프로필은 기한 없음`() {
        assertEquals(Freshness.UNKNOWN, Fresh.of(SignalKind.GEAR, 100, 100, false))
        assertEquals(Freshness.FRESH, Fresh.of(SignalKind.SOC, 100, 100, true))
        assertEquals(Freshness.STALE, Fresh.of(SignalKind.SOC, 100, 110, false))
        assertEquals(Freshness.UNKNOWN, Fresh.of(SignalKind.SOC, 100, 111, false))
        assertEquals(Freshness.FRESH, Fresh.of(SignalKind.PROFILE, null, 999, false))
        assertEquals("끊기기 전 값 · 11:08 · 판단에 쓰지 않음", Fresh.sourceLine(Freshness.STALE, "11:08", SourceOrigin.VEHICLE))
        assertEquals("시연 데이터 · 11:08", Fresh.sourceLine(Freshness.FRESH, "11:08", SourceOrigin.DEMO))
    }
}
