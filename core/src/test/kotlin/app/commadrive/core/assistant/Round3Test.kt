package app.commadrive.core.assistant

import app.commadrive.core.Fixtures
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** 3차 개선(CHECKLIST-3) — `src/lib/assistant/round3.test.ts` 와 같은 입력·같은 기대값 (거울) + 세션 수준 검증 */
class Round3Test {
    private val family = Profiles.planFor(Profiles.PRESETS.getValue(ProfileMode.FAMILY))
    private val work = Profiles.planFor(Profiles.PRESETS.getValue(ProfileMode.WORK))
    private val v = Profiles.DEMO_VEHICLE

    // ── P0-3 "충분"의 기준 ──
    @Test fun `비관 추정에서 모자라면 예상돼요(충분)라고 말하지 않는다 — 120 조합`() {
        var checked = 0
        for ((plan, roundTrip) in listOf(family to false, work to true, work.copy(waitMinutesAfterArrival = 300) to true)) {
            for (mode in WaitMode.entries) {
                for (b in 5..100 step 5) {
                    val e = Wait.energyFor(plan, v.copy(batteryPct = b.toDouble()), mode)
                    val view = EnergyViews.of(e, b.toDouble(), null, EnergyContext(roundTrip = roundTrip, minReservePct = plan.minReservePct))
                    val pessimisticShort = e.shortfallRange.second > 0
                    assertEquals(!pessimisticShort, view.headline.endsWith("예상돼요"), "${plan.destinationName} $mode $b% → ${view.headline}")
                    if (pessimisticShort) assertNotEquals(EnergyStatus.OK, view.status)
                    checked++
                }
            }
        }
        assertEquals(120, checked)
    }

    @Test fun `충분의 문맥 — 편도 · 왕복 · 경유지 포함 · 최소 잔량 기준`() {
        val solo = Profiles.planFor(Profiles.PRESETS.getValue(ProfileMode.SOLO))
        val v1 = EnergyViews.of(Wait.energyFor(solo, v, WaitMode.IN_CAR), 68.0, null, EnergyContext(minReservePct = 15.0))
        assertEquals("충전 없이 도착할 수 있을 것으로 예상돼요" to "도착 예상 잔량 약 62% · 최소 잔량 15% 남기고 비관 추정까지 (추정)", v1.headline to v1.detail)
        val v2 = EnergyViews.of(Wait.energyFor(work, v, WaitMode.AWAY), 68.0, null, EnergyContext(roundTrip = true, minReservePct = 20.0))
        assertEquals("충전 없이 왕복할 수 있을 것으로 예상돼요" to "귀가 후 예상 잔량 약 50% · 최소 잔량 20% 남기고 비관 추정까지 (추정)", v2.headline to v2.detail)
        val via = Options.planViaStop(family, v, WaitMode.IN_CAR, 250.0).first
        assertEquals("선택한 충전 경유지를 포함하면 계획을 마칠 수 있을 것으로 예상돼요", EnergyViews.of(via, 68.0, null, EnergyContext(viaWaypoint = true)).headline)
        assertEquals("최신 차량 정보가 없어 계획을 확인할 수 없어요", EnergyViews.of(null, null, null).headline)
    }

    @Test fun `여유 문구는 필요 → 모자랄 수 → 여유 크지 않음 → 왕복 가능 순서로 바뀐다`() {
        val seen = LinkedHashMap<String, Int>()
        for (b in 20..60) {
            val e = Wait.energyFor(work.copy(waitMinutesAfterArrival = 210), v.copy(batteryPct = b.toDouble()), WaitMode.IN_CAR)
            seen.putIfAbsent(EnergyViews.of(e, b.toDouble(), null, EnergyContext(roundTrip = true)).headline, b)
        }
        assertEquals(
            listOf("충전 계획이 필요해요" to 20, "충전 없이는 모자랄 수 있어요" to 45, "현재 조건에서는 충분할 수 있지만 여유가 크지 않아요" to 47, "충전 없이 왕복할 수 있을 것으로 예상돼요" to 49),
            seen.entries.map { it.key to it.value },
        )
    }

    // ── P0-4 건너뜀 ≠ 완료 ──
    private val base = PrepareInput(ClimateState.DIFFERENT, 25.0, 23.0, null, null, 3, 0, EnergyStatus.OK, false)

    @Test fun `건너뛴 것은 남은 일에서 빠지지만 확인 완료로 세지 않는다`() {
        val s = Prepare.status(base.copy(packedCount = 3, skipped = listOf(PrepareItemKey.CLIMATE)))
        assertEquals(listOf(PrepareItemState.SKIPPED, PrepareItemState.DONE, PrepareItemState.DONE), s.items.map { it.state })
        assertEquals(listOf(2, 0, 1), listOf(s.done, s.needs, s.skipped))
        assertEquals("남은 확인은 없습니다 · 공조는 이번에는 건너뛰었습니다", s.summary)
        assertEquals(PrepareItemState.DONE, Prepare.status(base.copy(packedCount = 3, skipped = listOf(PrepareItemKey.PACKING))).items[1].state)
        assertEquals(PrepareItemState.DONE, Prepare.status(base.copy(climateDecision = ClimateDecision(ClimateDecisionKind.KEPT, 25.0))).items[0].state)
    }

    // ── P0-2 주행 중 ──
    @Test fun `주행 중 — 조용 · 확인 필요 · 모름`() {
        val ok = EnergyViews.of(Wait.energyFor(work, v, WaitMode.AWAY), 68.0, null, EnergyContext(roundTrip = true))
        val short = EnergyViews.of(Wait.energyFor(family, v, WaitMode.IN_CAR), 68.0, null)
        assertEquals(DriveLine(DriveLevel.QUIET, "귀가까지 에너지 문제 없음 · 추정", null, null), Drive.line(ok, true, null, "귀가"))
        assertEquals("다음 충전 경유지 · 김천휴게소", Drive.line(ok, true, DriveStop("김천휴게소", 246), "도착").title)
        assertEquals(DriveLine(DriveLevel.ATTENTION, "충전 계획이 필요해요", "정차한 뒤 선택지를 볼 수 있어요", null), Drive.line(short, true, null, "도착"))
        assertEquals(DriveLevel.UNKNOWN to "차량 정보 확인 중", Drive.line(ok, false, null, "도착").let { it.level to it.title })
    }

    // ── 세션 ──
    private val session = CopilotSession(Fixtures.demoStops)
    private fun run(vararg intents: Intent, from: SessionState = SessionState()) = intents.fold(from, session::reduce)

    // V5(2026-11-02): 방문 중 "귀가 일정을 확인할까요?"(NEXT_LEG, 결정 등급)가 한 번 더 — 목적지에 도착해도 Mission 이 남아 있음을 앱이 기억한다는 장면
    @Test fun `대표 1 업무일 하루 — 앱이 먼저 묻는 것은 하차 확인 두 번과 귀가 준비 한 번, 주행 중은 늘 조용`() {
        val asked = mutableListOf<SuggestionType>()
        val driveLevels = mutableSetOf<DriveLevel>()
        var s = SessionState()
        var shown: SuggestionType? = null
        fun step(vararg i: Intent) {
            s = run(*i, from = s)
            val view = session.view(s)
            // 앞에 새로 뜬 제안만 센다 — 같은 제안이 계속 떠 있는 것은 한 번
            val top = view.suggestions.top?.type
            if (top != null && top != shown) asked += top
            shown = top
            if (view.restricted) driveLevels += view.drive.level
        }
        step(Intent.Choose(ProfileMode.WORK), Intent.SetHvac(21.0), Intent.StartPrepare)
        assertEquals("출발 준비에서 두 가지는 확인됐고, 준비물 한 가지만 남았습니다", session.view(s).prepare.summary)
        step(Intent.SetPacked(s.profile.packing))
        assertEquals(true to "출발 준비가 끝났습니다 · 바로 출발하셔도 됩니다", session.view(s).prepare.let { it.ready to it.summary })
        step(Intent.Drive); step(Intent.Tick); step(Intent.JumpTo(37.8), Intent.Park)
        step(Intent.StartFinish, Intent.SetChecked(s.profile.finishChecklist), Intent.Complete)
        assertEquals(TripStatus.VISITING, session.view(s).status.trip)
        step(Intent.ClearToast, Intent.ChangeWait(60))
        assertNull(s.toast) // 차를 두고 다녀오는 대기 — 바뀌지 않은 것은 알리지 않는다
        step(Intent.Drive); step(Intent.Tick); step(Intent.JumpTo(37.8), Intent.Park)
        step(Intent.StartFinish, Intent.SetChecked(s.profile.finishChecklist), Intent.Complete)
        assertEquals(JourneyPhase.COMPLETED, s.journey.phase)
        assertEquals(listOf(SuggestionType.CHECKLIST_REMINDER, SuggestionType.NEXT_LEG, SuggestionType.CHECKLIST_REMINDER), asked)
        assertEquals(setOf(DriveLevel.QUIET), driveLevels)
    }

    @Test fun `하차 준비를 시작하지 않았으면 완료를 받지 않는다 — 목적지에서 "이어서 갑니다"라고 하지 않는다`() {
        val s = run(Intent.Choose(ProfileMode.SOLO), Intent.StartPrepare, Intent.Drive, Intent.JumpTo(23.8), Intent.Park, Intent.ClearToast, Intent.Complete)
        assertEquals(JourneyPhase.PARKED to true, s.journey.phase to s.journey.atDestination)
        assertNull(s.toast)
    }

    @Test fun `건너뛰기는 확인 완료가 아니다 — 홈에서 공조를 건너뛰면 이번에는 건너뜀`() {
        var s = run(Intent.Choose(ProfileMode.WORK), Intent.StartPrepare)
        assertEquals(SuggestionType.PROFILE_PREPARATION, session.view(s).suggestions.top?.type)
        s = run(Intent.Dismiss(SuggestionType.PROFILE_PREPARATION), from = s)
        assertEquals(PrepareItemState.SKIPPED, session.view(s).prepare.items[0].state)
        assertNull(s.memory.climate) // "그대로 두기로 함"으로 기록하지 않는다
        assertNull(session.view(s).suggestions.top) // 이번 이동에서 다시 묻지 않는다
    }

    @Test fun `경유지를 골라도 그 계획이 충분해야 충전 계획이 확인 완료 · 화면은 경유지 포함 기준으로 말한다`() {
        var s = run(Intent.Choose(ProfileMode.FAMILY), Intent.StartPrepare)
        assertEquals(PrepareItemState.NEEDS_CHECK, session.view(s).prepare.items[2].state)
        s = run(Intent.AddWaypointResult(session.view(s).ranked.first().stop, true, null), from = s)
        val v = session.view(s)
        assertEquals(PrepareItemState.DONE to "선택한 충전 경유지를 포함하면 충분합니다 (추정)", v.prepare.items[2].let { it.state to it.line })
        assertEquals("선택한 충전 경유지를 포함하면 계획을 마칠 수 있을 것으로 예상돼요", v.energyView.headline)
    }

    @Test fun `안전 규칙 — 주행 제한 모름은 제한 · 확인 뒤 출발하면 실행 안 함 · 끊김 중 판단 안 함 · 응답 없음은 성공 아님`() {
        // 주행 제한을 모르고 차가 P 가 아니면 제한으로 본다
        var s = run(Intent.Choose(ProfileMode.FAMILY), Intent.StartPrepare, Intent.SetCar(CarState(uxMode = UxMode.UNKNOWN, gear = Gear.DRIVE, parkingBrake = false)))
        assertTrue(session.view(s).restricted)
        assertEquals(false, session.view(s).climateGate.allowed)
        // 확인 카드를 연 뒤 출발하면 확인은 무효 — 확인 버튼을 눌러도 보내지 않는다
        s = run(Intent.Choose(ProfileMode.FAMILY), Intent.StartPrepare, Intent.RequestClimate)
        assertEquals(ActionPhase.CONFIRMING, s.action.phase)
        s = run(Intent.Drive, Intent.ConfirmClimate, from = s)
        assertNotEquals(ActionPhase.PENDING, s.action.phase)
        assertNull(s.action.requestId)
        // 끊긴 동안은 판단하지 않는다 — 에너지 · 주행 화면 · 제안 모두
        s = run(Intent.SetLink(false), from = s)
        val lost = session.view(s)
        assertEquals(EnergyStatus.UNKNOWN to DriveLevel.UNKNOWN, lost.energyView.status to lost.drive.level)
        assertTrue(lost.suggestions.top?.type != SuggestionType.ENERGY_DECISION)
        // 응답이 없으면 성공으로 보이지 않는다
        s = run(Intent.Choose(ProfileMode.FAMILY), Intent.StartPrepare, Intent.RequestClimate, Intent.ConfirmClimate)
        s = run(Intent.ClimateEvent(ActionEvent.Timeout(s.action.requestId!!)), from = s)
        assertEquals(ActionPhase.UNKNOWN_OUTCOME, s.action.phase)
        assertEquals(PrepareItemState.NEEDS_CHECK, session.view(s).prepare.items[0].state)
    }
}
