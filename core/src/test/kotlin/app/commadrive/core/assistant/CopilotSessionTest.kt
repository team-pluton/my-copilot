package app.commadrive.core.assistant

import app.commadrive.core.Fixtures
import app.commadrive.core.PassengerType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Android 앱이 쓰는 세션이 **웹 시연에서 본 장면과 같은 판단**을 내는가 — 시나리오 A·G·H·I·J·F 를 같은 입력으로 돌린다.
 * 기대값은 /copilot 을 헤드리스 Chrome 으로 눌러 본 결과(클릭 지도 109장면, 2026-10-26)와 같다.
 * 휴게소는 mock.ts DEMO_STOPS 와 같은 Fixtures.demoStops.
 */
class CopilotSessionTest {
    private val session = CopilotSession(Fixtures.demoStops)
    private fun run(vararg intents: Intent, from: SessionState = SessionState()) = intents.fold(from, session::reduce)
    private fun top(s: SessionState) = session.view(s).suggestions.top?.type
    private fun phase(s: SessionState) = "${s.journey.phase}/${s.journey.leg}"

    // ── 2차 개선(CHECKLIST-2) — 웹 /copilot 헤드리스 결과와 같은 값 ──
    @Test fun `E 미팅 연장은 차를 두고 다녀오면 영향 없음, 차 안 대기로 바꾸면 부족과 선택지`() {
        var s = run(Intent.Choose(ProfileMode.WORK), Intent.SetBattery(45.0), Intent.StartPrepare)
        assertEquals(WaitMode.AWAY, s.waitMode)
        s = run(Intent.Drive, Intent.ChangeWait(120), Intent.ClearToast, from = s)
        assertNull(s.toast) // 바뀌지 않은 것은 알리지 않는다
        s = run(Intent.JumpTo(37.8), Intent.Park, from = s)
        assertEquals(EnergyStatus.OK, session.view(s).energyView.status)
        s = run(Intent.SetWaitMode(WaitMode.IN_CAR), from = s)
        assertEquals("차 안에서 기다림 · 공조 사용 가정 · 판단이 바뀌었습니다: 충분 → 부족 · 예상 추가 필요량 약 2%p (추정 1~3%p)", s.toast)
        val v = session.view(s)
        assertEquals(listOf(EnergyOptionKey.AS_IS to EnergyStatus.SHORT, EnergyOptionKey.WAIT_AWAY to EnergyStatus.OK, EnergyOptionKey.WAIT_SHORTER to EnergyStatus.CAUTION), v.options.map { it.key to it.status })
        assertEquals("차 안 대기가 약 145분을 넘으면 충전이 필요해집니다 (추정 범위 기준) · 지금 계획 210분", v.waitLimit)
    }

    @Test fun `실제 주행 신호 — CarUxRestrictions 가 제한이면 한 줄 화면, 모르면 단계를 바꾸지 않는다`() {
        var s = run(Intent.Choose(ProfileMode.FAMILY), Intent.StartPrepare)
        s = run(Intent.LiveSignals(JourneySignals(Gear.DRIVE, false, 42.0, true, null)), from = s)
        val v = session.view(s)
        assertEquals(true to JourneyPhase.DRIVING, v.restricted to s.journey.phase)
        assertEquals(400.0, v.signals.remainingKm) // 남은 거리는 세션 값(내비 연결 전)
        // 모의 조작(주차)은 실제 신호를 덮지 않는다
        s = run(Intent.Park, from = s)
        assertEquals(true, session.view(s).restricted)
        // 신호를 모르면(기어 UNKNOWN · 속도 null · 제한 null) 단계를 바꾸지 않는다
        s = run(Intent.LiveSignals(JourneySignals(Gear.UNKNOWN, null, null, null, null)), from = s)
        assertEquals(JourneyPhase.DRIVING, s.journey.phase)
    }

    @Test fun `실제 차량 값이 오면 같은 재판단 규칙으로 알린다`() {
        var s = run(Intent.Choose(ProfileMode.WORK), Intent.StartPrepare, Intent.ClearToast)
        s = run(Intent.LiveVehicle(Profiles.DEMO_VEHICLE.copy(batteryPct = 30.0)), from = s)
        assertEquals(true, s.car.vehicleLive)
        assertTrue(s.toast!!.startsWith("판단이 바뀌었습니다: 충분 →"), s.toast)
    }

    @Test fun `대기 유형은 주행 중에 바꿀 수 없다`() {
        val s = run(Intent.Choose(ProfileMode.WORK), Intent.StartPrepare, Intent.Drive, Intent.SetWaitMode(WaitMode.IN_CAR))
        assertEquals(WaitMode.AWAY to "주행 중에는 바꿀 수 없습니다 · 정차한 뒤 바꿔 주세요", s.waitMode to s.toast)
    }

    @Test fun `H 고객사 대기 — 차는 주차, 사람은 방문 중 · 기록에 단계 코드 이름이 없다`() {
        var s = run(Intent.Choose(ProfileMode.WORK), Intent.SetHvac(21.0), Intent.StartPrepare, Intent.Drive, Intent.JumpTo(37.8), Intent.Park)
        s = run(Intent.StartFinish, Intent.SetChecked(s.profile.finishChecklist), Intent.Complete, from = s)
        val st = session.view(s).status
        assertEquals(VehicleStatus.PARKED to TripStatus.VISITING, st.vehicle to st.trip)
        assertEquals("귀가 38km 남음 · 배터리 59%", session.view(s).situation)
        val texts = Memory.activityOf(s.vault, ProfileMode.WORK).map { it.text }
        assertTrue(texts.any { it == "이동 중 → 곧 도착" }, texts.toString())
        assertTrue(texts.none { it.contains("APPROACHING") || it.contains("PARKED") })
    }

    @Test fun `C 공조 권한이 없으면 출발 준비는 직접 확인, 홈 제안에서 공조를 뺀다`() {
        val s = run(Intent.Choose(ProfileMode.FAMILY), Intent.SetCar(CarState(permClimate = false)), Intent.StartPrepare)
        val v = session.view(s)
        assertEquals(PrepareItemState.UNSUPPORTED, v.prepare.items[0].state)
        assertEquals("출발 전에 준비물·충전 계획 두 가지를 확인해 주세요 · 공조는 차량에서 직접 확인해 주세요", v.prepare.summary)
        assertTrue(v.suggestions.companions.none { it.type == SuggestionType.PROFILE_PREPARATION } && v.suggestions.top?.type != SuggestionType.PROFILE_PREPARATION)
    }

    @Test fun `G 혼자 출근 — 다 준비됐으면 묻지 않는다`() {
        val s = run(Intent.Choose(ProfileMode.SOLO), Intent.SetHvac(22.0), Intent.StartPrepare)
        val v = session.view(s)
        assertEquals(true to "출발 준비가 끝났습니다 · 바로 출발하셔도 됩니다", v.prepare.ready to v.prepare.summary)
        assertNull(v.suggestions.top)
    }

    @Test fun `K 프로필 없이 시작 — 에너지 판단부터, 기록은 남기지 않는다`() {
        val s = run(Intent.Choose(ProfileMode.GUEST), Intent.StartPrepare)
        val v = session.view(s)
        assertEquals(SuggestionType.ENERGY_DECISION, v.suggestions.top?.type)
        assertEquals("출발 전에 충전 계획 한 가지를 확인해 주세요", v.prepare.summary)
        assertTrue(v.suggestions.top!!.explanation.startsWith("부산까지 세면"), v.suggestions.top!!.explanation)
        assertEquals(emptyList(), Memory.activityOf(s.vault, ProfileMode.GUEST))
    }

    @Test fun `휴게소에서 잠시 내렸다 오면 여정은 이어지고, 목적지 하차는 처음부터 다시 확인한다`() {
        var s = run(Intent.Choose(ProfileMode.FAMILY), Intent.StartPrepare)
        s = run(Intent.AddWaypointResult(session.view(s).ranked.first().stop, true, null), Intent.Drive, Intent.JumpTo(400.0), Intent.Park, from = s)
        s = run(Intent.StartFinish, Intent.SetChecked(s.profile.finishChecklist), Intent.Complete, from = s)
        assertEquals("PARKED/0" to false, phase(s) to s.journey.atDestination)
        assertEquals("하차 확인 완료 · 부산까지 이어서 갑니다", s.toast)
        s = run(Intent.Charge, Intent.Drive, Intent.JumpTo(399.8), Intent.Park, Intent.StartFinish, from = s)
        assertEquals("FINISHING/0" to emptyList<String>(), phase(s) to session.view(s).checked)
    }

    @Test fun `처음에는 프로필을 고르게 하고, 고르기 전에는 출발 준비를 시작하지 않는다`() {
        val s = run(Intent.StartPrepare)
        assertEquals("NOT_STARTED/0" to "먼저 프로필을 골라 주세요", phase(s) to s.toast)
    }

    @Test fun `A 가족 이동 — 충전 판단(위험)이 주요, 공조는 함께 할 일 · 공조 적용 · 경유지 · 충전 · 도착 · 하차 · 완료`() {
        var s = run(Intent.Choose(ProfileMode.FAMILY), Intent.StartPrepare)
        val v = session.view(s)
        assertEquals(SuggestionType.ENERGY_DECISION, v.suggestions.top?.type)
        assertEquals(listOf(SuggestionType.PROFILE_PREPARATION), v.suggestions.companions.map { it.type })
        assertEquals("충전 계획이 필요해요" to "예상 추가 필요량 약 47%p (추정 36~58%p)", v.energyView.headline to v.energyView.detail)
        // 공조 — 확인 → 보냄 → 콜백(모의 차량이 23°C 로 적용)
        s = run(Intent.RequestClimate, Intent.ConfirmClimate, from = s)
        s = run(Intent.ClimateEvent(ActionEvent.Callback(s.action.requestId!!, 23.0), appliedC = 23.0), from = s)
        assertEquals(ActionPhase.VERIFIED_SUCCESS to "시연 값으로 23 적용", s.action.phase to s.action.message)
        // 1위 후보를 경유지로
        val first = session.view(s).ranked.first().stop
        assertEquals("김천휴게소", first.name)
        s = run(Intent.AddWaypointResult(first, true, null), from = s)
        assertNull(top(s))
        // 주행 → 경유지에서 멈춤 → 주차 → 충전 → 재출발 → 도착
        s = run(Intent.Drive, Intent.JumpTo(400.0), Intent.Park, from = s)
        assertEquals("PARKED/0" to "김천휴게소", phase(s) to session.view(s).atWaypoint?.name)
        s = run(Intent.Charge, Intent.Drive, Intent.JumpTo(399.8), Intent.Park, from = s)
        assertEquals("PARKED/0" to true, phase(s) to s.journey.atDestination)
        assertEquals(SuggestionType.CHECKLIST_REMINDER, top(s))
        s = run(Intent.StartFinish, Intent.SetChecked(s.profile.finishChecklist), Intent.Complete, from = s)
        assertEquals("COMPLETED/0" to "이동을 마쳤습니다", phase(s) to s.toast)
        assertTrue(Memory.activityOf(s.vault, ProfileMode.FAMILY).first().text.contains("최종 하차 확인 완료"))
    }

    @Test fun `H 업무 왕복 — 고객사 하차 뒤 대기 중 · 귀가 구간 · 집에서 최종 하차해야 완료`() {
        var s = run(Intent.Choose(ProfileMode.WORK), Intent.SetHvac(21.0), Intent.StartPrepare, Intent.Drive, Intent.JumpTo(37.8), Intent.Park)
        assertEquals(listOf<Any?>("PARKED/0", true, true), listOf(phase(s), session.view(s).canStartWait, session.view(s).canEndTrip))
        s = run(Intent.StartFinish, Intent.SetChecked(s.profile.finishChecklist), Intent.Complete, from = s)
        assertEquals("WAITING/0" to "하차 확인 완료 · 귀가 38km 가 남아 있습니다", phase(s) to s.toast)
        s = run(Intent.AdvanceClock(30), from = s)
        assertEquals(60, session.view(s).remainPlan.waitMinutesAfterArrival)
        assertTrue(session.view(s).energy.returnPct > 0) // 귀로 예산 유지
        s = run(Intent.Drive, from = s)
        assertEquals("DRIVING/1" to 38.0, phase(s) to session.view(s).remainingKm)
        s = run(Intent.JumpTo(37.8), Intent.Park, from = s)
        assertEquals(SuggestionType.CHECKLIST_REMINDER, top(s)) // 최종 도착에서 다시 묻는다
        s = run(Intent.StartFinish, Intent.SetChecked(s.profile.finishChecklist), Intent.Complete, from = s)
        assertEquals("COMPLETED/1", phase(s))
    }

    @Test fun `G 출퇴근 — 처음부터 끝까지 아무것도 제안하지 않고, 도착하면 이동 마치기만 있다`() {
        var s = run(Intent.Choose(ProfileMode.SOLO), Intent.SetHvac(22.0), Intent.StartPrepare)
        assertNull(top(s))
        s = run(Intent.Drive, from = s)
        assertEquals("충전 없이 도착할 수 있을 것으로 예상돼요", session.view(s).energyView.headline)
        s = run(Intent.JumpTo(23.8), Intent.Park, from = s)
        assertEquals(null to true, top(s) to session.view(s).canFinishQuietly)
        assertEquals("COMPLETED/0", phase(run(Intent.EndTrip, from = s)))
    }

    @Test fun `I 프로필 전환 — 준비 중 업무로 바꾸면 업무 기록만, 출발한 뒤에는 바꿀 수 없다`() {
        var s = run(Intent.Choose(ProfileMode.FAMILY), Intent.StartPrepare, Intent.SetPacked(listOf("아이 간식·물")), Intent.KeepClimate)
        s = run(Intent.Choose(ProfileMode.WORK), from = s)
        assertEquals(listOf<Any?>(ProfileMode.WORK, emptyList<String>(), null), listOf(s.mode, s.memory.packed, s.memory.climate))
        assertEquals(1, Memory.activityOf(s.vault, ProfileMode.WORK).size)
        assertTrue(Memory.activityOf(s.vault, ProfileMode.FAMILY).none { it.text.contains("업무") })
        s = run(Intent.Drive, Intent.Choose(ProfileMode.FAMILY), from = s)
        assertEquals(ProfileMode.WORK to "이동 중에는 프로필을 바꿀 수 없습니다 · 여정을 끝낸 뒤 바꿔 주세요", s.mode to s.toast)
    }

    @Test fun `J 연결 끊김 — 끊긴 동안 판단하지 않고, 복구되면 끊기기 전 판단과 비교해 알린다`() {
        var s = run(Intent.Choose(ProfileMode.FAMILY), Intent.StartPrepare, Intent.Drive, Intent.SetLink(false))
        val lost = session.view(s)
        assertEquals(listOf<Any?>(EnergyStatus.UNKNOWN, null, true), listOf(lost.energyView.status, lost.suggestions.top, lost.restricted))
        s = run(Intent.Stop, Intent.JumpTo(60.0), Intent.SetCar(s.car.copy(speedKmh = 0.0)), from = s)
        s = s.copy(vehicle = s.vehicle.copy(outsideTempC = -7.0, hvacOn = true))
        s = run(Intent.Park, from = s)
        assertEquals("DRIVING/0", phase(s)) // 주차해도 모르면 단계를 바꾸지 않는다
        s = run(Intent.SetLink(true), from = s)
        assertEquals("PARKED/0", phase(s))
        assertTrue(s.toast!!.startsWith("연결이 돌아왔습니다 · 재판단 · 추가 필요량 약 47%p →"), s.toast)
    }

    @Test fun `F 응답 없음 — 모름 → 다시 읽어 그대로면 실패, 재시도는 그다음에만`() {
        var s = run(Intent.Choose(ProfileMode.FAMILY), Intent.StartPrepare, Intent.RequestClimate, Intent.ConfirmClimate)
        val id = s.action.requestId!!
        s = run(Intent.ClimateEvent(ActionEvent.Timeout(id)), from = s)
        assertEquals(ActionPhase.UNKNOWN_OUTCOME to false, s.action.phase to s.action.canRetry)
        s = run(Intent.ClimateEvent(ActionEvent.Readback(id, 25.0)), from = s)
        assertEquals(ActionPhase.FAILED to true, s.action.phase to s.action.canRetry)
        assertEquals(25.0, s.car.hvacC)
    }

    @Test fun `확인 카드를 연 채 출발하면 승인이 무효가 된다`() {
        val s = run(Intent.Choose(ProfileMode.FAMILY), Intent.StartPrepare, Intent.RequestClimate, Intent.Drive)
        assertEquals(ActionPhase.IDLE to "주행이 시작돼 공조 변경 확인을 취소했습니다. 정차한 뒤 다시 확인해 주세요.", s.action.phase to s.action.message)
    }

    @Test fun `누적 재판단 — 대기 +30분 세 번째에 알린다`() {
        var s = run(Intent.Choose(ProfileMode.FAMILY), Intent.StartPrepare, Intent.ClearToast, Intent.ChangeWait(30), Intent.ChangeWait(30))
        assertNull(s.toast)
        s = run(Intent.ChangeWait(30), from = s)
        assertEquals("재판단 · 추가 필요량 약 47%p → 51%p (+4%p)", s.toast)
    }

    @Test fun `배터리가 바닥나는 지점에서 멈춘다 — 0% 로 수백 km 를 가지 않는다`() {
        val s = run(Intent.Choose(ProfileMode.FAMILY), Intent.StartPrepare, Intent.Drive, Intent.JumpTo(400.0))
        assertTrue(s.traveledKm < 300 && s.vehicle.batteryPct < 0.5, "${s.traveledKm} / ${s.vehicle.batteryPct}")
        assertEquals("배터리가 바닥나는 지점에서 멈췄습니다 (모의) · 충전 경유지를 먼저 넣으세요", s.toast)
    }

    // ── UX 점검 D9 — 차량용 앱의 프로필 편집 ──
    @Test fun `프로필 편집은 정차 중에만, 출발 전이면 이번 계획에도 동승자가 들어간다`() {
        val s = run(Intent.Choose(ProfileMode.SOLO))
        val edited = s.profile.copy(passengers = setOf(PassengerType.CHILD), finishChecklist = s.profile.finishChecklist + "우산")
        val n = run(Intent.EditProfile(edited), from = s)
        assertEquals(setOf(PassengerType.CHILD), n.plan.passengers)
        assertTrue("우산" in n.profile.finishChecklist)
        val driving = run(Intent.StartPrepare, Intent.Drive, Intent.JumpTo(5.0), Intent.ClearToast, from = s)
        val blocked = run(Intent.EditProfile(edited), from = driving)
        assertEquals(driving.profile, blocked.profile)
        assertTrue(blocked.toast != null)
    }

    @Test fun `프로필 지우기는 지금 프로필만, 프로필 없이는 지울 것이 없다`() {
        val s = run(Intent.Choose(ProfileMode.SOLO))
        val other = s.profiles.getValue(ProfileMode.FAMILY).copy(targetC = 25.0)
        val edited = run(Intent.EditProfile(s.profile.copy(targetC = 19.0)), from = s.copy(profiles = s.profiles + (ProfileMode.FAMILY to other)))
        val wiped = run(Intent.WipeProfile, from = edited)
        assertEquals(Profiles.PRESETS.getValue(ProfileMode.SOLO), wiped.profile)
        assertEquals(25.0, wiped.profiles.getValue(ProfileMode.FAMILY).targetC)
        val guest = run(Intent.Choose(ProfileMode.GUEST))
        assertEquals(guest.profiles, run(Intent.WipeProfile, from = guest).profiles)
    }

    @Test fun `J 부분 복구 — 배터리만 돌아오면 에너지는 다시 판단하고(원인 여럿), 주행 신호가 없으면 단계는 그대로다`() {
        var s = run(Intent.Choose(ProfileMode.FAMILY), Intent.StartPrepare, Intent.Drive, Intent.SetLink(false))
        s = run(Intent.Stop, Intent.JumpTo(60.0), Intent.SetCar(s.car.copy(speedKmh = 0.0)), from = s)
        s = s.copy(vehicle = s.vehicle.copy(outsideTempC = -7.0, hvacOn = true))
        s = run(Intent.Park, Intent.ClearToast, from = s)
        s = run(Intent.SetLinkOf(listOf(LinkKind.ENERGY), true), from = s)
        val v = session.view(s)
        assertEquals("DRIVING/0", phase(s)) // 기어를 모르니 단계는 그대로(보수적)
        assertNotEquals(EnergyStatus.UNKNOWN, v.energyView.status) // 배터리는 있으니 판단한다
        assertNull(v.energyMissing)
        assertEquals(false, v.rejudge!!.single)
        assertTrue(v.rejudge!!.why.startsWith("여러 값이 함께 바뀜("), v.rejudge!!.why)
        assertTrue(s.toast!!.startsWith("배터리 연결이 돌아왔습니다 · 재판단"), s.toast)
        assertTrue(s.toast!!.contains("아직 끊김: 주행 신호"), s.toast)
        // 반대로 주행 신호만 돌아오면 — 단계는 바뀌지만 에너지는 보류하고 무엇이 모자란지 말한다
        var t = run(Intent.Choose(ProfileMode.FAMILY), Intent.StartPrepare, Intent.Drive, Intent.SetLink(false))
        t = run(Intent.Park, Intent.SetLinkOf(listOf(LinkKind.DRIVE), true), from = t)
        val tv = session.view(t)
        assertEquals("PARKED/0", phase(t))
        assertEquals(EnergyStatus.UNKNOWN to "부족한 정보: 배터리", tv.energyView.status to tv.energyMissing)
        assertNull(tv.rejudge)
        assertEquals("주행 신호(기어·속도·주행 제한) 연결이 돌아왔습니다", t.toast)
    }

    @Test fun `재판단 메모 — 원인은 전후 입력 비교로 (대기 유형은 하나 · 배터리·외기온이 함께 오면 여럿 · 새 이동이면 비운다)`() {
        var s = run(Intent.Choose(ProfileMode.WORK), Intent.SetHvac(21.0), Intent.StartPrepare, Intent.Drive, Intent.Tick, Intent.JumpTo(37.8), Intent.Park)
        s = run(Intent.StartFinish, Intent.SetChecked(s.profile.finishChecklist), Intent.Complete, Intent.ChangeWait(60), Intent.SetWaitMode(WaitMode.IN_CAR), from = s)
        val r = session.view(s).rejudge!!
        assertEquals(listOf("차를 두고 다녀옴", 50, "차 안에서 기다림 · 공조 사용 가정", 44, true), listOf(r.fromLabel, r.fromPct, r.toLabel, r.toPct, r.single))
        assertEquals("대기 유형 변경 · 대기 중 공조 소비 차이", r.why)
        // 실제 차량 값 갱신으로 배터리와 외기온이 한 번에 바뀐다 — 호출자가 뭐라 하든 전후 비교가 원인이다
        s = run(Intent.LiveVehicle(s.vehicle.copy(batteryPct = 40.0, outsideTempC = -7.0)), from = s)
        val w = session.view(s).rejudge!!
        assertEquals(false to "여러 값이 함께 바뀜(배터리 잔량 · 외기온) — 원인을 하나로 말하지 않음", w.single to w.why)
        assertEquals("바꾸기 전" to "바꾼 뒤", w.fromLabel to w.toLabel)
        s = run(Intent.Choose(ProfileMode.FAMILY), from = s.copy(journey = s.journey.copy(phase = JourneyPhase.COMPLETED)))
        assertNull(session.view(s).rejudge)
    }

    @Test fun `배터리 조회 실패(onFailed) — 연결은 살아 있어도 에너지는 보류하고, 주행 신호·공조는 그대로 쓴다`() {
        var s = run(Intent.Choose(ProfileMode.FAMILY), Intent.StartPrepare, Intent.SetSignalStatus(SignalKind.SOC, SignalStatus.ERROR))
        val v = session.view(s)
        assertTrue(s.car.linkLive)
        assertEquals(EnergyStatus.UNKNOWN to "부족한 정보: 배터리", v.energyView.status to v.energyMissing)
        assertEquals(EnergyBasis.NO_BATTERY, v.energyBasis)
        assertEquals(JourneyPhase.PREPARING, s.journey.phase)
        assertTrue(v.suggestions.top?.type != SuggestionType.ENERGY_DECISION)
        // 실제 배터리 콜백이 오면 그 신호는 다시 정상 — 근거 등급은 입력 계획 기반(내비 경로 없음)
        s = run(Intent.LiveVehicle(s.vehicle), from = s)
        val w = session.view(s)
        assertEquals(SignalStatus.OK, s.car.signalStatus.getValue(SignalKind.SOC))
        assertEquals(EnergyBasis.USER_PLAN, w.energyBasis)
        assertNull(w.energyMissing)
    }

    @Test fun `내연기관 차량 — 에너지 판단만 끄고 이유를 적는다, 출발 준비·주행 제한·하차는 그대로 (전체 차량 대상)`() {
        var s = run(Intent.Choose(ProfileMode.FAMILY), Intent.SetBattery(20.0), Intent.SetPowertrain(Powertrain.ICE), Intent.StartPrepare)
        var v = session.view(s)
        assertEquals(Availability(false, UnavailableReason.POWERTRAIN, "내연기관 연료 계산은 아직 지원하지 않음 · 공식 SDK 데이터 확인 전"), v.energyAvailability)
        assertEquals(EnergyStatus.UNKNOWN to v.energyAvailability.line, v.energyView.status to v.energyMissing)
        assertTrue(v.options.isEmpty())
        assertNull(v.rejudge)
        // 공통 기능은 그대로 — 출발 준비 제안이 나오고, 배터리 20% 여도 충전 제안은 없다
        assertEquals(JourneyPhase.PREPARING, s.journey.phase)
        assertTrue(v.suggestions.top != null && v.suggestions.top?.type != SuggestionType.ENERGY_DECISION)
        s = run(Intent.Drive, Intent.JumpTo(30.0), from = s)
        v = session.view(s)
        assertEquals(JourneyPhase.DRIVING, s.journey.phase)
        assertTrue(v.suggestions.top?.type != SuggestionType.ENERGY_DECISION)
        // EV 로 돌리면 같은 20% 에서 충전 제안이 돌아온다 — 엔진은 그대로다
        s = run(Intent.SetPowertrain(Powertrain.EV), from = s)
        assertEquals(SuggestionType.ENERGY_DECISION, top(s))
        assertNull(session.view(s).energyMissing)
    }

    // ── Simple & Proactive UX (오너 지시 2026-10-28) — 혼자 / 가족 / 동승자 × 처음 · 반복 · 취향 없음 · 차량 정보 없음 · 권한 거부 · 주행 중 · 일부 실패 ──
    private val combos = listOf(ProfileMode.SOLO, ProfileMode.FAMILY, ProfileMode.COMPANION)
    /** 시연 차량(공조 25°C · 시트 끔)과 저장 취향이 다른 상태에서 운전자(아빠)와 한 조합을 고른다 — 선택 한 번이 곧 준비 */
    private fun pick(m: ProfileMode, car: CarState = CarState(), driver: String? = "dad") = run(Intent.SetCar(car), Intent.SetDriver(driver), Intent.ChooseAndPrepare(m))

    @Test fun `선택 한 번이 곧 준비 — 고르면 비교가 끝나 있고, 다른 설정만 승인 하나로 묶인다`() {
        for (m in combos) {
            val s = pick(m)
            val v = session.view(s)
            assertEquals(JourneyPhase.PREPARING, s.journey.phase, "$m")
            assertEquals(m, s.vault.lastMode, "$m 지난번 선택 기억")
            assertTrue(v.cabin.toApply.isNotEmpty(), "$m 적용 후보")
            assertTrue(v.cabin.items.none { it.decision == CabinDecision.SAME && it.key == CabinKey.HVAC_TEMP }, "$m 공조는 다르다")
            assertEquals(CabinDecision.REMEMBER_ONLY, v.cabin.items.first { it.key == CabinKey.MUSIC }.decision, "$m 음악은 기억만")
            assertEquals(CabinBatchPhase.IDLE, s.cabinBatch.phase)
        }
        // 아빠(통풍시트) × 혼자: 22°C + 통풍시트 → 2개, 조명은 값 모름 → 직접. 아빠 × 가족: 23°C + 통풍시트 → 2개(공조 켬은 이미 켬). 엄마 × 가족: 23°C + 열선시트(핸들 열선은 미지원 → 직접)
        assertEquals(listOf(CabinKey.HVAC_TEMP, CabinKey.SEAT_VENT), session.view(pick(ProfileMode.SOLO)).cabin.toApply)
        assertEquals(listOf(CabinKey.HVAC_TEMP, CabinKey.SEAT_VENT), session.view(pick(ProfileMode.FAMILY)).cabin.toApply)
        assertEquals(listOf(CabinKey.HVAC_TEMP, CabinKey.SEAT_HEAT), session.view(pick(ProfileMode.FAMILY, driver = "mom")).cabin.toApply)
        assertEquals("아빠 · 가족 · 여행", session.view(pick(ProfileMode.FAMILY)).whoLabel)
        assertEquals("엄마 · 가족 · 여행", session.view(pick(ProfileMode.FAMILY, driver = "mom")).whoLabel)
        // 운전자 미확인 — 운전석은 유지, 공조만
        assertEquals(listOf(CabinKey.HVAC_TEMP), session.view(pick(ProfileMode.COMPANION, driver = null)).cabin.toApply)
        assertEquals("운전자 미확인 · 부부 · 외출", session.view(pick(ProfileMode.COMPANION, driver = null)).whoLabel)
        assertEquals("저장된 취향과 비교해 변경할 설정이 2개 있습니다 · 실내 조명은 차량에서 직접", session.view(pick(ProfileMode.SOLO)).cabin.summary)
    }

    @Test fun `이미 맞으면 아무것도 묻지 않는다 — 혼자 출근, 22°C · 통풍시트 켬 · 준비물 없음 → 바로 출발`() {
        val s = pick(ProfileMode.SOLO, CarState(hvacC = 22.0, seatVent = true, lighting = Lighting.CALM))
        val v = session.view(s)
        assertEquals(emptyList(), v.cabin.toApply)
        assertEquals(true, v.cabin.nothingToDo)
        assertEquals(true, v.prepareReady)
        assertEquals("혼자 이동 준비를 확인했어요 · 저장한 취향과 모두 맞습니다", v.cabin.summary)
        // 최소 안내(혼자) — 주의 등급은 앞에 띄우지 않는다. 출근 24km 는 충분이라 애초에 제안이 없다
        assertNull(v.suggestions.top)
    }

    @Test fun `승인 하나로 적용 — 결과는 항목마다, 성공한 것만 차량 값에 반영, 일부 실패면 나머지는 그대로`() {
        var s = run(Intent.ApplyCabin, from = pick(ProfileMode.SOLO))
        assertEquals(CabinBatchPhase.PENDING, s.cabinBatch.phase)
        val id = s.cabinBatch.requestId!!
        // 지난 요청 번호의 결과는 무시
        assertEquals(s, run(Intent.CabinResults(id + 7, mapOf(CabinKey.HVAC_TEMP to CabinOutcome.Callback(true))), from = s))
        s = run(Intent.CabinResults(id, mapOf(CabinKey.HVAC_TEMP to CabinOutcome.Callback(true), CabinKey.SEAT_VENT to CabinOutcome.Error("이 항목은 차량이 거절했습니다"))), from = s)
        assertEquals(CabinBatchPhase.DONE, s.cabinBatch.phase)
        assertEquals("2개 중 1개 적용(모의) · 1개 거절", s.cabinBatch.settled!!.summary)
        assertEquals(22.0, s.car.hvacC)
        assertEquals(false, s.car.seatVent) // 거절된 항목은 바뀌지 않는다
        assertEquals(ClimateDecisionKind.APPLIED, s.memory.climate?.decision)
        assertEquals(true, session.view(s).prepareReady)
        // 전부 성공 — 엄마 × 부부: 공조 + 열선시트
        var t = run(Intent.ApplyCabin, from = pick(ProfileMode.COMPANION, driver = "mom"))
        t = run(Intent.CabinResults(t.cabinBatch.requestId!!, mapOf(CabinKey.HVAC_TEMP to CabinOutcome.Callback(true), CabinKey.SEAT_HEAT to CabinOutcome.Callback(true))), from = t)
        assertEquals(true, t.cabinBatch.settled!!.allApplied)
        assertEquals(true, t.car.seatHeat)
        assertEquals(23.0, t.car.hvacC)
    }

    @Test fun `응답이 없으면 적용 완료라 하지 않는다 — 확인 못 함`() {
        var s = run(Intent.ApplyCabin, from = pick(ProfileMode.FAMILY))
        s = run(Intent.CabinResults(s.cabinBatch.requestId!!, emptyMap()), from = s)
        assertEquals(listOf(CabinResultStatus.UNVERIFIED, CabinResultStatus.UNVERIFIED), s.cabinBatch.settled!!.results.map { it.status }) // 공조 + 아빠 통풍시트
        assertEquals(25.0, s.car.hvacC)
        assertNull(s.memory.climate)
        assertEquals(false, session.view(s).prepareReady)
    }

    @Test fun `차량 정보 미수신 · 권한 거부 · 주행 중 — 제어하지 않고 이유를 적는다, 공통 기능은 그대로`() {
        // 공조·도어 연결 끊김 → 지금 값을 모름 → 적용 후보 없음, 직접 확인
        var s = run(Intent.SetLinkOf(listOf(LinkKind.CABIN), false), from = pick(ProfileMode.SOLO))
        var v = session.view(s)
        assertEquals(emptyList(), v.cabin.toApply)
        assertEquals(listOf(CabinKey.HVAC_TEMP, CabinKey.SEAT_VENT, CabinKey.LIGHTING), v.cabin.manual)
        assertEquals(JourneyPhase.PREPARING, s.journey.phase)
        // 권한 거부(공조 · 시트) → 그 항목만 "차량에서 직접"
        s = pick(ProfileMode.SOLO, CarState(permClimate = false, permSeat = null))
        v = session.view(s)
        assertEquals(emptyList(), v.cabin.toApply)
        assertEquals(CabinDecision.NO_PERMISSION, v.cabin.items.first { it.key == CabinKey.HVAC_TEMP }.decision)
        assertEquals(CabinDecision.NO_PERMISSION, v.cabin.items.first { it.key == CabinKey.SEAT_VENT }.decision)
        assertEquals(s, run(Intent.ApplyCabin, from = s)) // 보낼 것이 없다
        // 주행 중 — 정차하면 제안. 실행 직전 재검사도 막는다
        s = run(Intent.Drive, from = pick(ProfileMode.SOLO))
        v = session.view(s)
        assertEquals(CabinDecision.RESTRICTED, v.cabin.items.first { it.key == CabinKey.HVAC_TEMP }.decision)
        assertEquals(emptyList(), v.cabin.toApply)
    }

    @Test fun `반복 이용 — 지난번 조합을 기억하고, 저장 취향을 다시 입력하지 않는다 · 프로필 없이는 기억하지 않는다`() {
        var s = pick(ProfileMode.COMPANION)
        s = run(Intent.Drive, Intent.JumpTo(18.0), Intent.Park, Intent.EndTrip, from = s)
        assertEquals(JourneyPhase.COMPLETED, s.journey.phase)
        assertEquals(ProfileMode.COMPANION, s.vault.lastMode)
        val again = run(Intent.ChooseAndPrepare(ProfileMode.COMPANION), from = s)
        assertEquals(JourneyPhase.PREPARING, again.journey.phase)
        assertEquals(2, again.memory.tripId)
        assertEquals("둘이 듣는 플레이리스트", again.profile.cabin.music)
        val guest = run(Intent.ChooseAndPrepare(ProfileMode.GUEST), from = s)
        assertEquals(ProfileMode.COMPANION, guest.vault.lastMode)
        assertEquals(true, session.view(guest).cabin.nothingToDo)
    }

    @Test fun `지금 그대로 — 이번 이동에서는 실내 설정을 다시 묻지 않는다 · 준비물은 한 번에`() {
        var s = run(Intent.KeepCabin, from = pick(ProfileMode.FAMILY))
        assertEquals(CabinBatchPhase.KEPT, s.cabinBatch.phase)
        assertEquals(ClimateDecisionKind.KEPT, s.memory.climate?.decision)
        assertEquals(CabinDecision.SAME, session.view(s).cabin.items.first { it.key == CabinKey.HVAC_TEMP }.decision)
        s = run(Intent.PackAll, from = s)
        assertEquals(Profiles.PRESETS.getValue(ProfileMode.FAMILY).packing, s.memory.packed)
        assertEquals(true, session.view(s).prepareReady || session.view(s).prepare.items[2].state == PrepareItemState.NEEDS_CHECK) // 가족 장거리는 충전 계획이 남을 수 있다
    }

    @Test fun `취향 학습 — 아빠 × 혼자에서 3번 24°C 로 돌리면 한 번 묻고, 저장하면 다음 이동부터 비교에 쓴다 · 거절은 다시 안 묻는다 · 엄마에게 섞이지 않는다`() {
        var s = pick(ProfileMode.SOLO)
        fun trip(st: SessionState, c: Double): SessionState = run(Intent.SetHvac(c), Intent.Drive, Intent.JumpTo(24.0), Intent.Park, Intent.EndTrip, Intent.ChooseAndPrepare(ProfileMode.SOLO), from = st)
        s = trip(s, 24.0)
        assertNull(session.view(s).candidate) // 일회성
        s = trip(s, 24.0)
        assertNull(session.view(s).candidate)
        s = trip(s, 24.0)
        val c = session.view(s).candidate!!
        assertEquals(CabinKey.HVAC_TEMP, c.key)
        assertEquals("시연 데이터 · 최근 3번 이동에서 혼자일 때 공조 온도가 24°C였어요 — 탑승 조합 취향으로 저장할까요?", c.line) // 개발 패널의 변화는 MOCK — 실차 증거가 아니라고 문장에 적는다
        assertEquals(ObservationSource.MOCK, c.evidence); assertEquals(RealEvidence(0, 0), Learning.realEvidence(s.vault.learning))
        // 저장 → 혼자 조합은 운전자별 soloCabin(아빠|SOLO) 에 24, 프로필 targetC(운전자 공유)는 22 그대로. 다음 비교에서 24°C 는 "이미 맞음"
        val saved = run(Intent.AcceptLearning(CabinKey.HVAC_TEMP), from = s)
        assertEquals(22.0, saved.profile.targetC)
        assertEquals(SoloCabin(hvacTempC = 24.0), saved.vault.soloCabin[Situation.soloKey("dad", ProfileMode.SOLO)])
        assertNull(session.view(saved).candidate)
        assertEquals(CabinDecision.SAME, session.view(run(Intent.SetHvac(24.0), from = saved)).cabin.items.first { it.key == CabinKey.HVAC_TEMP }.decision)
        // 단건 공조 제안·출발 준비·확인도 같은 목표(24)를 본다 — 프로필 targetC(22)를 보면 한 화면에서 "이미 맞음"과 "22°C 로 맞출까요?"가 같이 뜬다(에뮬레이터 E20 에서 발견)
        val at24 = session.view(run(Intent.SetHvac(24.0), from = saved))
        assertEquals(ClimateState.SAME, at24.climateState); assertFalse(at24.suggestions.top?.title?.startsWith("저장한 온도") == true)
        val at22 = run(Intent.SetHvac(22.0), from = saved)
        assertEquals("저장한 온도 24°C 로 맞출까요?", session.view(at22).suggestions.top?.title)
        assertEquals(24.0, run(Intent.RequestClimate, Intent.ConfirmClimate, from = at22).action.target)
        // 거절 → 같은 값은 다시 묻지 않는다
        var d = run(Intent.DeclineLearning(CabinKey.HVAC_TEMP, c.value), from = s)
        assertNull(session.view(d).candidate)
        for (i in 1..3) d = trip(d, 24.0)
        assertNull(session.view(d).candidate)
        // 엄마로 바꾸면 아빠의 관찰도, 아빠가 승인한 24°C 도 섞이지 않는다 — 엄마 혼자는 프리셋 22°C 로 비교 · 앱이 적용한 값은 관찰하지 않는다
        val m = run(Intent.SetDriver("mom"), from = s)
        assertNull(session.view(m).candidate)
        val mm = run(Intent.SetDriver("mom"), Intent.SetHvac(22.0), from = saved)
        assertEquals(CabinDecision.SAME, session.view(mm).cabin.items.first { it.key == CabinKey.HVAC_TEMP }.decision)
        assertEquals(CabinDecision.APPLY, session.view(run(Intent.SetDriver("dad"), from = mm)).cabin.items.first { it.key == CabinKey.HVAC_TEMP }.decision) // 아빠는 24 가 취향이라 22 는 바꿀 것
        var a = pick(ProfileMode.SOLO)
        for (i in 1..3) {
            a = run(Intent.ApplyCabin, from = a)
            // 첫 이동에서 앱이 22°C·통풍시트를 적용한 뒤에는 이미 맞아 보낼 것이 없다 — 어느 쪽도 관찰(학습)되지 않는다
            if (a.cabinBatch.phase == CabinBatchPhase.PENDING) a = run(Intent.CabinResults(a.cabinBatch.requestId!!, a.cabinBatch.keys.associateWith { CabinOutcome.Callback(true) }), from = a)
            a = run(Intent.Drive, Intent.JumpTo(24.0), Intent.Park, Intent.EndTrip, Intent.ChooseAndPrepare(ProfileMode.SOLO), from = a)
        }
        assertNull(session.view(a).candidate)
    }

    @Test fun `귀속 — 가족 탑승 중 개발 패널로 시트를 바꿔도 운전자 취향 후보가 되지 않는다 · 가족 공조는 아빠·엄마 운전을 합쳐 가족 후보`() {
        fun trip(st: SessionState, m: ProfileMode, vararg before: Intent): SessionState = run(*before, Intent.Drive, Intent.JumpTo(24.0), Intent.Park, Intent.EndTrip, Intent.ChooseAndPrepare(m), from = st)
        var s = pick(ProfileMode.FAMILY)
        for (i in 1..3) s = trip(s, ProfileMode.FAMILY, Intent.SetCar(s.car.copy(seatHeat = true)), Intent.SetCar(s.car.copy(seatHeat = false)))
        assertNull(session.view(s).candidate) // 누가 켰는지 모른다 → 아빠에게 귀속하지 않음
        var f = pick(ProfileMode.FAMILY)
        f = trip(f, ProfileMode.FAMILY, Intent.SetHvac(24.0)); f = trip(f, ProfileMode.FAMILY, Intent.SetHvac(24.0))
        f = run(Intent.SetDriver("mom"), from = f); f = trip(f, ProfileMode.FAMILY, Intent.SetHvac(24.0))
        val c = session.view(f).candidate!!
        assertEquals(CabinKey.HVAC_TEMP, c.key); assertEquals(PrefOwner.OCCUPANCY, c.owner)
        assertEquals("시연 데이터 · 최근 3번 이동에서 가족일 때 공조 온도가 24°C였어요 — 탑승 조합 취향으로 저장할까요?", c.line)
        val saved = run(Intent.AcceptLearning(CabinKey.HVAC_TEMP), from = f)
        assertEquals(24.0, saved.profiles.getValue(ProfileMode.FAMILY).targetC) // 가족 프로필(조합)에 저장 — 엄마·아빠 운전자 취향은 그대로
        assertEquals(Situation.DEMO_DRIVERS.getValue("mom").prefs, saved.vault.drivers.getValue("mom").prefs)
    }

    @Test fun `대표 시연 A·B·C — 세션에서 같은 엔진으로 재현 · 아빠+가족 2개 · 엄마+가족 2개(공조 같음) · 적용 뒤 다음 가족 여행은 바꿀 것 없음`() {
        val a = pick(ProfileMode.FAMILY)
        assertEquals(listOf(CabinKey.HVAC_TEMP, CabinKey.SEAT_VENT), session.view(a).cabin.toApply)
        val b = pick(ProfileMode.FAMILY, driver = "mom")
        assertEquals(listOf(CabinKey.HVAC_TEMP, CabinKey.SEAT_HEAT), session.view(b).cabin.toApply)
        assertEquals(session.view(a).cabin.items.first { it.key == CabinKey.HVAC_TEMP }.line, session.view(b).cabin.items.first { it.key == CabinKey.HVAC_TEMP }.line)
        // C. A 를 승인 하나로 적용(모의 성공) → 이동을 마치고 다음 가족 여행 → 비교할 것이 없어 바로 준비 확인(준비물만 남는다)
        var c = run(Intent.ApplyCabin, from = a)
        c = run(Intent.CabinResults(c.cabinBatch.requestId!!, c.cabinBatch.keys.associateWith { CabinOutcome.Callback(true) }), from = c)
        c = run(Intent.Drive, Intent.JumpTo(24.0), Intent.Park, Intent.EndTrip, Intent.ChooseAndPrepare(ProfileMode.FAMILY), from = c)
        val v1 = session.view(c)
        assertEquals(emptyList(), v1.cabin.toApply) // 조명 값을 못 읽는 차 — "차량에서 직접"만 남고 승인은 없다
        assertEquals("앱에서 바꿀 수 있는 설정은 없습니다 · 실내 조명은 차량에서 직접", v1.cabin.summary)
        c = run(Intent.SetCar(c.car.copy(lighting = Lighting.BRIGHT)), from = c) // 조명도 이미 밝음이면
        val v = session.view(c)
        assertEquals(emptyList(), v.cabin.toApply); assertEquals(true, v.cabin.nothingToDo)
        assertEquals("가족 이동 준비를 확인했어요 · 저장한 취향과 모두 맞습니다", v.cabin.summary)
        assertEquals(CabinBatchPhase.IDLE, c.cabinBatch.phase)
        val packed = session.view(run(Intent.PackAll, from = c))
        assertEquals(true, packed.prepareReady || packed.prepare.items[2].state == PrepareItemState.NEEDS_CHECK)
    }

    @Test fun `실차 실내 값 — LiveCabin 이 오면 공조 온도는 차량 값 · 신호 OK · 학습 관찰은 VEHICLE 증거 · null 이면 조회 실패로 적고 모의 값으로 덮지 않는다`() {
        var s = pick(ProfileMode.SOLO)
        assertTrue(s.memory.tripId > 0)
        s = run(Intent.LiveCabin(CabinState(23.5, false, true)), from = s)
        assertEquals(23.5, s.car.hvacC); assertTrue(s.car.hvacReadable); assertTrue(s.car.doorReadable); assertTrue(s.car.cabinLive); assertTrue(s.car.doorLocked)
        assertEquals(SignalStatus.OK, s.car.signalStatus[SignalKind.HVAC]); assertEquals(SignalStatus.OK, s.car.signalStatus[SignalKind.DOOR])
        assertEquals(RealEvidence(1, 1), Learning.realEvidence(s.vault.learning)) // 실차 콜백만 실환경 증거로 센다
        val lost = run(Intent.LiveCabin(CabinState(null, null, null)), from = s)
        assertEquals(23.5, lost.car.hvacC); assertFalse(lost.car.hvacReadable); assertFalse(lost.car.doorReadable)
        assertEquals(SignalStatus.ERROR, lost.car.signalStatus[SignalKind.HVAC]); assertEquals(SignalStatus.ERROR, lost.car.signalStatus[SignalKind.DOOR])
        assertEquals(RealEvidence(1, 1), Learning.realEvidence(lost.vault.learning)) // 조회 실패는 관찰이 아니다
    }

    @Test fun `실차 시트 단계 — AAOS 정의대로 시트 온도 음수는 통풍 · 양수는 열선 · 0 은 끔 · 둘 다 못 읽으면 비교에서 "지금 값을 읽지 못함"`() {
        var s = pick(ProfileMode.SOLO)
        s = run(Intent.LiveCabin(CabinState(23.5, false, true, seatVentLevel = 0, seatHeatLevel = 2)), from = s)
        assertTrue(s.car.seatReadable); assertFalse(s.car.seatVent); assertTrue(s.car.seatHeat)
        // 에뮬레이터 실측(2026-10-29): 콘솔 Ventilation 2 → 시트 온도 -2 · 통풍 단계 0
        val v2 = run(Intent.LiveCabin(CabinState(23.5, false, true, seatVentLevel = 0, seatHeatLevel = -2)), from = s)
        assertTrue(v2.car.seatReadable); assertTrue(v2.car.seatVent); assertFalse(v2.car.seatHeat)
        val unread = run(Intent.LiveCabin(CabinState(23.5, false, true, seatVentLevel = null, seatHeatLevel = null)), from = s)
        assertFalse(unread.car.seatReadable)
        val vent = session.view(unread).cabin.items.first { it.key == CabinKey.SEAT_VENT }
        if (vent.decision != CabinDecision.NO_PREF) assertEquals(CabinDecision.UNKNOWN_STATE, vent.decision)
        assertEquals(true, SignalMapping.seatVentOn(2, null)); assertEquals(false, SignalMapping.seatVentOn(0, 0)); assertNull(SignalMapping.seatHeatOn(null))
    }

    @Test fun `실차 제어 결과 — 승인 하나의 targets 는 세션이 정하고, VEHICLE 출처 결과는 "(모의)" 없이 적용됨 · 앱이 적용한 값의 재조회는 학습하지 않는다`() {
        var s = pick(ProfileMode.FAMILY)
        s = run(Intent.LiveCabin(CabinState(24.0, false, true, seatVentLevel = 0, seatHeatLevel = 0)), from = s)
        val keys = session.view(s).cabin.toApply
        assertTrue(CabinKey.HVAC_TEMP in keys)
        s = run(Intent.ApplyCabin, from = s)
        assertEquals(CabinBatchPhase.PENDING, s.cabinBatch.phase)
        assertEquals(s.profile.targetC, s.cabinBatch.targets[CabinKey.HVAC_TEMP])
        val id = s.cabinBatch.requestId!!
        val before = Learning.realEvidence(s.vault.learning)
        s = run(Intent.CabinResults(id, keys.associateWith { CabinOutcome.Callback(true) }, ControlSource.VEHICLE), from = s)
        assertEquals(CabinBatchPhase.DONE, s.cabinBatch.phase)
        assertFalse(s.cabinBatch.settled!!.summary.contains("모의"))
        assertTrue(s.cabinBatch.settled!!.results.all { it.line.endsWith("적용됨") })
        // 차량이 같은 값을 다시 알려 줘도(재조회) 앱이 바꾼 값이라 실차 증거로 세지 않는다
        val readback = run(Intent.LiveCabin(CabinState(s.profile.targetC, false, true, seatVentLevel = if (s.car.seatVent) 1 else 0, seatHeatLevel = 0)), from = s)
        assertEquals(before, Learning.realEvidence(readback.vault.learning))
    }

    @Test fun `회귀 — 대표 1 업무일은 그대로 — 공조 21°C 가 맞으면 준비물만 남고, 하루 동안 먼저 묻는 것은 하차 확인 두 번뿐`() {
        var s = pick(ProfileMode.WORK, CarState(hvacC = 21.0, seatVent = true))
        var v = session.view(s)
        assertEquals(emptyList(), v.cabin.toApply)
        assertEquals(emptyList(), v.cabin.items.filter { it.decision == CabinDecision.REMEMBER_ONLY }.map { it.key }) // 업무 조합은 음악 취향을 두지 않았다
        s = run(Intent.PackAll, from = s)
        assertEquals(true, session.view(s).prepareReady)
        s = run(Intent.Drive, Intent.JumpTo(37.8), Intent.Park, from = s)
        assertEquals(SuggestionType.CHECKLIST_REMINDER, top(s))
    }

    @Test fun `실제 배터리를 받는 중이면 모의 주행이 배터리를 줄이지 않는다 - 정책 4 (E28)`() {
        var s = run(Intent.Choose(ProfileMode.WORK), Intent.StartPrepare, Intent.LiveVehicle(Profiles.DEMO_VEHICLE.copy(batteryPct = 100.0)))
        s = run(Intent.Drive, Intent.JumpTo(37.8), Intent.Park, from = s)
        assertEquals(100.0, s.vehicle.batteryPct)
        // 실제 값이 없으면(폰 · 시연) 모의 주행은 그대로 배터리를 쓴다
        var m = run(Intent.Choose(ProfileMode.WORK), Intent.StartPrepare)
        val before = m.vehicle.batteryPct
        m = run(Intent.Drive, Intent.JumpTo(37.8), Intent.Park, from = m)
        assertTrue(m.vehicle.batteryPct < before)
    }
}
