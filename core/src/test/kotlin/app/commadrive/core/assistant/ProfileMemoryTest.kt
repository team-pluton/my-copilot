package app.commadrive.core.assistant

import app.commadrive.core.EnergyEstimator
import app.commadrive.core.PassengerType
import kotlin.test.Test
import kotlin.test.assertEquals

/** profile.ts · memory.ts 의 거울 — `quality.test.ts` 의 같은 이름 테스트와 같은 기대값 */
class ProfileMemoryTest {
    @Test fun `하차 항목은 프로필 이름이 아니라 고른 동승자가 정한다`() {
        assertEquals(listOf("휴대전화", "지갑·소지품", "차량 내 준비물", "다음 일정 확인", "아이 준비물", "아이 가방", "유모차"), Profiles.finishItemsFor(ProfileMode.FAMILY, setOf(PassengerType.CHILD)))
        assertEquals(true, "반려동물 이동 용품" in Profiles.finishItemsFor(ProfileMode.FAMILY, setOf(PassengerType.PET)))
        assertEquals(false to true, ("다음 일정 확인" in Profiles.finishItemsFor(ProfileMode.WORK, emptySet())) to ("다음 일정 메모" in Profiles.finishItemsFor(ProfileMode.WORK, emptySet())))
    }

    @Test fun `가족 프로필 여정은 쉼표 DRIVE 기본 시나리오와 같은 판단(약 47% 부족)을 낸다`() {
        assertEquals(47.0, EnergyEstimator.estimate(Profiles.planFor(Profiles.PRESETS.getValue(ProfileMode.FAMILY)), Profiles.DEMO_VEHICLE).shortfallPct)
    }

    @Test fun `업무 왕복 + 90분 대기 · 혼자 출근은 충전이 필요 없다`() {
        for (m in listOf(ProfileMode.WORK, ProfileMode.SOLO)) {
            assertEquals(null, SuggestionPlanner.energySignalOf(Profiles.planFor(Profiles.PRESETS.getValue(m)), Profiles.DEMO_VEHICLE), m.name)
        }
    }

    @Test fun `새 이동은 지난 이동의 준비·공조·경유지·하차 확인을 가져오지 않는다`() {
        var (v, m) = Memory.startTrip(Memory.emptyVault(), ProfileMode.FAMILY)
        for (e in listOf(MemoryEvent.Packed(listOf("아이 간식·물")), MemoryEvent.PrepareDone, MemoryEvent.Climate(ClimateDecisionKind.KEPT, 25.0), MemoryEvent.Waypoint("gimcheon"), MemoryEvent.FinishChecked(0, listOf("휴대전화")))) m = Memory.remember(m, e)
        assertEquals(listOf<Any?>(1, true, ClimateDecision(ClimateDecisionKind.KEPT, 25.0), listOf("gimcheon")), listOf(m.tripId, m.prepareDone, m.climate, m.waypointIds))
        assertEquals(Memory.newMemory(2, ProfileMode.FAMILY), Memory.startTrip(v, ProfileMode.FAMILY).second)
    }

    @Test fun `프로필을 바꾸면 다른 프로필의 이동 기록과 거절 학습이 보이지 않는다 · 삭제는 그 프로필만`() {
        var v = Memory.recordActivity(Memory.emptyVault(), ProfileMode.FAMILY, Activity("08:00", ActivityKind.PREPARE, "가족", 1))
        v = Memory.recordActivity(v, ProfileMode.WORK, Activity("09:00", ActivityKind.PREPARE, "업무", 1))
        v = Memory.setHistory(v, ProfileMode.FAMILY, SuggestionPlanner.recordDismissed(emptyMap(), SuggestionType.PROFILE_PREPARATION, 0))
        assertEquals(emptyMap(), v.history.getValue(ProfileMode.WORK))
        v = Memory.wipeProfile(v, ProfileMode.FAMILY)
        assertEquals(0 to 1, Memory.activityOf(v, ProfileMode.FAMILY).size to Memory.activityOf(v, ProfileMode.WORK).size)
    }

    @Test fun `출발 준비 요약 — 공조 결정·준비물·에너지 계획 중 끝난 것과 남은 것을 센다`() {
        var m = Memory.newMemory(1, ProfileMode.FAMILY)
        assertEquals(0 to 3, Memory.prepareSummary(m, 3, ClimateState.DIFFERENT, false))
        m = Memory.remember(Memory.remember(m, MemoryEvent.Climate(ClimateDecisionKind.APPLIED, 23.0)), MemoryEvent.Packed(listOf("a", "b", "c")))
        assertEquals(2 to 1, Memory.prepareSummary(m, 3, ClimateState.DIFFERENT, false))
        m = Memory.remember(m, MemoryEvent.Waypoint("gimcheon"))
        assertEquals(3 to 0, Memory.prepareSummary(m, 3, ClimateState.DIFFERENT, false))
        assertEquals(1 to 0, Memory.prepareSummary(Memory.newMemory(1, ProfileMode.SOLO), 0, ClimateState.SKIP, true))
        assertEquals(1 to 1, Memory.prepareSummary(Memory.newMemory(1, ProfileMode.SOLO), 0, ClimateState.UNREADABLE, true))
    }
}
