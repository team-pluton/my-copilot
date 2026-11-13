package app.commadrive.core.assistant

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Smart Cabin Prepare · Personal Cabin Memory — `src/lib/assistant/cabin.test.ts` 와 같은 입력·같은 기대값 (거울). 오너 지시 2026-10-28 */
class CabinTest {
    private val prefs = CabinPrefs(hvacTempC = 22.0, seatVent = true, lighting = Lighting.CALM, music = "나만의 드라이브 플레이리스트", guidance = Guidance.QUIET)
    private val now = CabinNow(25.0, true, false, false, false, null)
    private val ok = CabinSupportItem(true, true)
    private val support: CabinSupport = mapOf(
        CabinKey.HVAC_TEMP to ok, CabinKey.HVAC_POWER to ok, CabinKey.SEAT_VENT to ok, CabinKey.SEAT_HEAT to ok,
        CabinKey.STEERING_HEAT to CabinSupportItem(true, null), CabinKey.LIGHTING to CabinSupportItem(null, null),
    )
    private fun decisions(p: CabinPlan) = p.items.associate { it.key to it.decision }

    @Test fun `모드 선택 뒤 비교 — 다른 것만 적용 후보, 취향 없는 항목은 유지, 조명은 값을 못 읽어 직접, 음악은 기억만`() {
        val p = Cabin.plan(prefs, now, support, false, "혼자")
        assertEquals(mapOf(
            CabinKey.HVAC_TEMP to CabinDecision.APPLY, CabinKey.HVAC_POWER to CabinDecision.NO_PREF, CabinKey.SEAT_VENT to CabinDecision.APPLY, CabinKey.SEAT_HEAT to CabinDecision.NO_PREF,
            CabinKey.STEERING_HEAT to CabinDecision.NO_PREF, CabinKey.LIGHTING to CabinDecision.UNKNOWN_STATE, CabinKey.MUSIC to CabinDecision.REMEMBER_ONLY,
        ), decisions(p))
        assertEquals(listOf(CabinKey.HVAC_TEMP, CabinKey.SEAT_VENT), p.toApply)
        assertEquals(listOf(CabinKey.LIGHTING), p.manual)
        assertEquals(false, p.nothingToDo)
        assertEquals("저장된 취향과 비교해 변경할 설정이 2개 있습니다 · 실내 조명은 차량에서 직접", p.summary)
        assertEquals("공조 온도 25°C → 22°C", p.items[0].line)
        assertEquals("음악 · 나만의 드라이브 플레이리스트 기억 · 자동 재생은 연동 확인 전 · 듣던 음악 그대로", p.items[6].line)
    }

    @Test fun `이미 맞는 설정은 변경 요청을 만들지 않는다 — 전부 맞으면 묻지 않는다`() {
        val p = Cabin.plan(prefs.copy(lighting = null, music = null), now.copy(hvacTempC = 22.4, seatVent = true), support, false, "혼자")
        assertEquals(emptyList(), p.toApply)
        assertEquals(true, p.nothingToDo)
        assertEquals("혼자 이동 준비를 확인했어요 · 저장한 취향과 모두 맞습니다", p.summary)
        assertEquals("공조 온도 22°C · 이미 맞음", p.items[0].line)
    }

    @Test fun `저장 취향이 없으면 임의 취향을 만들지 않는다 — 차량 설정 그대로`() {
        val p = Cabin.plan(CabinPrefs.NONE, now, support, false, "가족")
        assertTrue(p.items.all { it.decision == CabinDecision.NO_PREF })
        assertEquals(true, p.nothingToDo)
        assertEquals("가족 이동 · 저장한 취향이 없어 지금 설정 그대로 갑니다", p.summary)
    }

    @Test fun `지원하지 않거나 권한이 없는 항목은 그 항목만 빠진다 — 전체 준비가 실패하지 않는다`() {
        val p = Cabin.plan(prefs, now, support + (CabinKey.SEAT_VENT to CabinSupportItem(false, null)), false, "혼자")
        assertEquals(CabinDecision.UNSUPPORTED, p.items[2].decision)
        assertEquals(listOf(CabinKey.HVAC_TEMP), p.toApply)
        val q = Cabin.plan(prefs, now, support + (CabinKey.HVAC_TEMP to CabinSupportItem(true, false)), false, "혼자")
        assertEquals(CabinDecision.NO_PERMISSION, q.items[0].decision)
        assertEquals("공조 온도 25°C → 22°C · 제어 권한 없음 · 차량에서 직접", q.items[0].line)
        assertEquals(listOf(CabinKey.SEAT_VENT), q.toApply)
        val r = Cabin.plan(CabinPrefs(steeringHeat = true), now.copy(steeringHeat = false), support, false, "혼자")
        assertEquals(CabinDecision.NO_PERMISSION, r.items[4].decision)
    }

    @Test fun `차량 정보를 못 읽으면 적용된 것으로 단정하지 않는다 — 값 모름은 직접 확인`() {
        val p = Cabin.plan(prefs, CabinNow.UNKNOWN, support, false, "혼자")
        assertEquals(emptyList(), p.toApply)
        assertEquals(listOf(CabinKey.HVAC_TEMP, CabinKey.SEAT_VENT, CabinKey.LIGHTING), p.manual)
        assertEquals("앱에서 바꿀 수 있는 설정은 없습니다 · 공조 온도·통풍시트·실내 조명은 차량에서 직접", p.summary)
    }

    @Test fun `주행 중에는 묶지 않는다 — 정차하면 제안`() {
        val p = Cabin.plan(prefs, now, support, true, "혼자")
        assertEquals(emptyList(), p.toApply)
        assertEquals(CabinDecision.RESTRICTED, p.items[0].decision)
        assertEquals("정차하면 2개를 맞추자고 제안합니다 · 실내 조명은 차량에서 직접", p.summary)
    }

    @Test fun `일괄 적용 결과는 항목마다 독립 — 일부 실패해도 성공한 것만 적용 확인, 응답 없음은 확인 못 함`() {
        val s = Cabin.settle(listOf(CabinKey.HVAC_TEMP, CabinKey.SEAT_VENT), mapOf(CabinKey.HVAC_TEMP to CabinOutcome.Callback(true), CabinKey.SEAT_VENT to CabinOutcome.Error("차량이 요청을 거절했습니다")), ControlSource.MOCK)
        assertEquals(listOf(CabinKey.HVAC_TEMP), s.applied)
        assertEquals(false, s.allApplied)
        assertEquals("2개 중 1개 적용(모의) · 1개 거절", s.summary)
        assertEquals(listOf(CabinResultStatus.APPLIED, CabinResultStatus.REJECTED), s.results.map { it.status })
        val t = Cabin.settle(listOf(CabinKey.HVAC_TEMP, CabinKey.SEAT_VENT), mapOf(CabinKey.HVAC_TEMP to CabinOutcome.Timeout), ControlSource.VEHICLE)
        assertEquals(listOf(CabinResultStatus.UNVERIFIED, CabinResultStatus.UNVERIFIED), t.results.map { it.status })
        assertEquals("2개 중 0개 적용 · 2개 확인 못 함", t.summary)
        assertEquals(CabinResultStatus.MISMATCH, Cabin.settle(listOf(CabinKey.HVAC_TEMP), mapOf(CabinKey.HVAC_TEMP to CabinOutcome.Callback(false)), ControlSource.MOCK).results[0].status)
        val all = Cabin.settle(listOf(CabinKey.HVAC_TEMP, CabinKey.SEAT_VENT), mapOf(CabinKey.HVAC_TEMP to CabinOutcome.Callback(true), CabinKey.SEAT_VENT to CabinOutcome.Callback(true)), ControlSource.MOCK)
        assertEquals(true, all.allApplied)
        assertEquals("2개 중 2개 적용(모의)", all.summary)
    }

    @Test fun `이번 이동에서 공조를 이미 결정했으면 다시 묻지 않는다 — Journey Memory 가 근거`() {
        val m = Memory.newMemory(1, ProfileMode.SOLO).copy(climate = ClimateDecision(ClimateDecisionKind.KEPT, 25.0))
        val p = Cabin.withMemory(Cabin.plan(prefs, now, support, false, "혼자"), m)
        assertEquals(CabinDecision.SAME, p.items[0].decision)
        assertEquals("공조 온도 25°C · 이번 이동에서는 그대로 두기로 함", p.items[0].line)
        assertEquals(listOf(CabinKey.SEAT_VENT), p.toApply)
        assertEquals("저장된 취향과 비교해 변경할 설정이 1개 있습니다", p.summary)
    }

    @Test fun `프로필 호환 — 실내 취향이 없는 프로필은 유지(null), 마지막 선택은 프로필 없이를 기억하지 않는다`() {
        val old = Profiles.PRESETS.getValue(ProfileMode.WORK).copy(name = "내 업무", targetC = 20.0, cabin = CabinPrefs.NONE)
        assertEquals(CabinPrefs(hvacTempC = 20.0), Profiles.cabinPrefsOf(old))
        assertEquals(Guidance.QUIET, Profiles.PRESETS.getValue(ProfileMode.SOLO).cabin.guidance)
        assertNull(Memory.rememberMode(Memory.emptyVault(), ProfileMode.GUEST).lastMode)
        assertEquals(ProfileMode.COMPANION, Memory.rememberMode(Memory.emptyVault(), ProfileMode.COMPANION).lastMode)
        assertEquals(1, Memory.emptyVault().nextTripId.getValue(ProfileMode.COMPANION))
        assertEquals(mapOf(Context.SOLO to listOf(ProfileMode.SOLO, ProfileMode.WORK), Context.FAMILY to listOf(ProfileMode.FAMILY, ProfileMode.PICKUP), Context.COMPANION to listOf(ProfileMode.COMPANION)), Profiles.CONTEXT_MODES)
        assertEquals(Context.SOLO, Profiles.CONTEXT_OF.getValue(ProfileMode.WORK))
        assertNull(Profiles.CONTEXT_OF.getValue(ProfileMode.GUEST))
    }

    @Test fun `지난번처럼 - 고른 운전자의 지난 이동만, 운전자 미확인·프로필 없이는 기억도 노출도 안 함`() {
        val dad = Memory.rememberMode(Memory.emptyVault(), ProfileMode.PICKUP, "dad")
        assertEquals(ProfileMode.PICKUP, Memory.lastTripFor(dad, "dad"))
        assertNull(Memory.lastTripFor(dad, "mom"))
        assertNull(Memory.lastTripFor(dad, null))
        assertEquals(mapOf("dad" to ProfileMode.PICKUP), Memory.rememberMode(dad, ProfileMode.GUEST, "mom").lastModeBy)
        assertEquals(mapOf("dad" to ProfileMode.PICKUP), Memory.rememberMode(dad, ProfileMode.SOLO, null).lastModeBy)
        val both = Memory.rememberMode(dad, ProfileMode.FAMILY, "mom")
        assertEquals(ProfileMode.PICKUP, Memory.lastTripFor(both, "dad"))
        assertEquals(ProfileMode.FAMILY, Memory.lastTripFor(both, "mom"))
    }

    @Test fun `일괄 적용 부분 실패 - 실차에서 공조는 확인, 통풍시트는 응답 없음이면 항목별로 갈린다`() {
        val part = Cabin.settle(listOf(CabinKey.HVAC_TEMP, CabinKey.SEAT_VENT), mapOf(CabinKey.HVAC_TEMP to CabinOutcome.Callback(true), CabinKey.SEAT_VENT to CabinOutcome.Timeout), ControlSource.VEHICLE)
        assertEquals(listOf(CabinResultStatus.APPLIED, CabinResultStatus.UNVERIFIED), part.results.map { it.status })
        assertEquals(listOf(CabinKey.HVAC_TEMP), part.applied)
        assertEquals(false, part.allApplied)
        assertEquals("2개 중 1개 적용 · 1개 확인 못 함", part.summary)
    }
}
