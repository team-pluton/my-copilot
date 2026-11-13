package app.commadrive.core.assistant

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * 입력별 유효성 · 재판단 원인 — `src/lib/assistant/validity.test.ts` 와 같은 입력·같은 기대값 (거울).
 * 외부 평가 7(2026-10-27) A·B.
 */
class ValidityTest {
    private fun all(f: Freshness) = SignalKind.entries.associateWith { if (it == SignalKind.PROFILE) Freshness.FRESH else f }

    @Test fun `기능별 필수 입력만 검사한다 — 도어가 모름이어도 에너지 판단은 되고, 배터리가 끊기기 전 값이면 보류한다`() {
        assertEquals(Readiness(true, emptyList()), Fresh.readiness(Feature.ENERGY, all(Freshness.FRESH) + mapOf(SignalKind.DOOR to Freshness.UNKNOWN, SignalKind.HVAC to Freshness.STALE)))
        assertEquals(Readiness(false, listOf(SignalKind.SOC)), Fresh.readiness(Feature.ENERGY, all(Freshness.FRESH) + (SignalKind.SOC to Freshness.STALE)))
        assertEquals("부족한 정보: 배터리", Fresh.readiness(Feature.ENERGY, all(Freshness.FRESH) + (SignalKind.SOC to Freshness.UNKNOWN)).line)
        assertEquals(Readiness(false, listOf(SignalKind.GEAR, SignalKind.UX)), Fresh.readiness(Feature.DRIVE_RESTRICTION, all(Freshness.UNKNOWN) + (SignalKind.SOC to Freshness.FRESH)))
        assertEquals(listOf(SignalKind.HVAC), Fresh.readiness(Feature.CLIMATE_PREPARE, all(Freshness.UNKNOWN) + (SignalKind.SOC to Freshness.FRESH)).missing)
        assertEquals(Readiness(true, emptyList()), Fresh.readiness(Feature.FINISH, all(Freshness.UNKNOWN)))
        assertEquals(false, Fresh.readiness(Feature.ENERGY, emptyMap()).ok)
        assertEquals(listOf(LinkKind.ENERGY), Feature.ENERGY.required.map { Fresh.linkOf(it) })
        assertEquals(listOf(LinkKind.DRIVE, LinkKind.DRIVE), Feature.DRIVE_RESTRICTION.required.map { Fresh.linkOf(it) })
    }

    @Test fun `재판단 원인 — 하나면 그것, 여럿이면 하나로 단정하지 않는다`() {
        assertEquals(RejudgeCause("대기 유형 변경 · 대기 중 공조 소비 차이", true), NotificationPolicy.cause(listOf(ChangedInput.WAIT_MODE)))
        assertEquals(RejudgeCause("배터리 잔량 변경 · 지금 보유 에너지 차이", true), NotificationPolicy.cause(listOf(ChangedInput.BATTERY)))
        assertEquals(
            RejudgeCause("여러 값이 함께 바뀜(남은 거리 · 외기온 · 공조 ON/OFF) — 원인을 하나로 말하지 않음", false),
            NotificationPolicy.cause(listOf(ChangedInput.DISTANCE, ChangedInput.OUTSIDE_TEMP, ChangedInput.HVAC)),
        )
        assertEquals(true, NotificationPolicy.cause(listOf(ChangedInput.BATTERY, ChangedInput.BATTERY)).single)
        assertEquals(true, NotificationPolicy.cause(emptyList()).single)
    }

    @Test fun `끊길 때 찍어 둔 입력과 복구 때 입력의 차이 — J 시나리오는 넷이 함께 바뀐다`() {
        val before = RejudgeInputs(60.0, 6.0, false, 300.0, 40, WaitMode.IN_CAR)
        val after = before.copy(batteryPct = 49.0, outsideTempC = -7.0, hvacOn = true, remainingKm = 240.0)
        assertEquals(listOf(ChangedInput.BATTERY, ChangedInput.DISTANCE, ChangedInput.OUTSIDE_TEMP, ChangedInput.HVAC), NotificationPolicy.changedInputs(before, after))
        assertEquals(emptyList(), NotificationPolicy.changedInputs(before, before))
        assertEquals(emptyList(), NotificationPolicy.changedInputs(before, before.copy(batteryPct = 60.3, remainingKm = 300.2)))
    }

    @Test fun `재판단 메모 — 대표 1 의 차 안에서 기다리기로, 전 50% → 후 44%, 원인은 대기 유형 하나`() {
        val work = Profiles.planFor(Profiles.PRESETS.getValue(ProfileMode.WORK))
        val atClient = work.copy(routeKm = 0.0, waitMinutesAfterArrival = 150)
        val v = Profiles.DEMO_VEHICLE.copy(batteryPct = 59.0)
        val base = NotificationPolicy.decide(NotificationState.INITIAL, Wait.energyFor(atClient, v, WaitMode.AWAY)).state
        val d = NotificationPolicy.decide(base, Wait.energyFor(atClient, v, WaitMode.IN_CAR))
        val note = NotificationPolicy.note(d, v.batteryPct, "차를 두고 다녀옴", "차 안에서 기다림 · 공조 사용 가정", NotificationPolicy.cause(listOf(ChangedInput.WAIT_MODE)), "08:28")
        assertEquals(Rejudge("차를 두고 다녀옴", 50, "차 안에서 기다림 · 공조 사용 가정", 44, "대기 유형 변경 · 대기 중 공조 소비 차이", true, "08:28"), note)
        val small = NotificationPolicy.decide(base, Wait.energyFor(atClient, v.copy(batteryPct = 58.0), WaitMode.AWAY))
        assertNull(NotificationPolicy.note(small, 58.0, "a", "b", NotificationPolicy.cause(listOf(ChangedInput.BATTERY)), "08:30"))
    }

    @Test fun `연결 · 신호 유효성 · 판단 가능성은 따로다 — 연결이 살아 있어도 조회 실패·받은 적 없음이면 모름`() {
        assertEquals(Freshness.FRESH, Fresh.of(SignalKind.SOC, 100, 100, true, SignalStatus.OK))
        assertEquals(Freshness.UNKNOWN, Fresh.of(SignalKind.SOC, 100, 100, true, SignalStatus.ERROR))
        assertEquals(Freshness.UNKNOWN, Fresh.of(SignalKind.SOC, 100, 100, true, SignalStatus.NONE))
        assertEquals(Freshness.UNKNOWN, Fresh.of(SignalKind.GEAR, 100, 100, true, SignalStatus.ERROR))
        assertEquals(Freshness.FRESH, Fresh.of(SignalKind.PROFILE, null, 0, false, SignalStatus.ERROR))
        val f = all(Freshness.FRESH) + (SignalKind.SOC to Fresh.of(SignalKind.SOC, 100, 100, true, SignalStatus.ERROR))
        assertEquals(Readiness(false, listOf(SignalKind.SOC)), Fresh.readiness(Feature.ENERGY, f))
        assertEquals(true, Fresh.readiness(Feature.DRIVE_RESTRICTION, f).ok)
    }

    @Test fun `에너지 근거 등급 — 내비 경로 기반 · 입력 계획 기반 · 경로 없음 · 배터리 없음`() {
        assertEquals(EnergyBasis.NAVI_ROUTE, Fresh.energyBasisOf(all(Freshness.FRESH), true))
        assertEquals(EnergyBasis.USER_PLAN, Fresh.energyBasisOf(all(Freshness.FRESH) + (SignalKind.ROUTE to Freshness.UNKNOWN), true))
        assertEquals(EnergyBasis.USER_PLAN, Fresh.energyBasisOf(all(Freshness.FRESH) + (SignalKind.ROUTE to Freshness.STALE), true))
        assertEquals(EnergyBasis.NO_ROUTE, Fresh.energyBasisOf(all(Freshness.FRESH) + (SignalKind.ROUTE to Freshness.UNKNOWN), false))
        assertEquals(EnergyBasis.NO_BATTERY, Fresh.energyBasisOf(all(Freshness.FRESH) + (SignalKind.SOC to Freshness.STALE), true))
        assertEquals(EnergyBasis.NO_BATTERY, Fresh.energyBasisOf(all(Freshness.FRESH) + mapOf(SignalKind.SOC to Freshness.UNKNOWN, SignalKind.ROUTE to Freshness.FRESH), true))
    }

    @Test fun `신호가 서로 어긋나면 단계를 단정하지 않는다 — P 인데 달린다 · 주차 브레이크인데 달린다 → 모름`() {
        fun sig(gear: Gear = Gear.DRIVE, brake: Boolean? = false, speed: Double? = 0.0) = Journey.motionOf(JourneySignals(gear, brake, speed, null, 50.0))
        assertEquals(Motion(MotionKind.UNKNOWN, Confidence.UNKNOWN), sig(gear = Gear.PARK, speed = 40.0))
        assertEquals(Motion(MotionKind.UNKNOWN, Confidence.UNKNOWN), sig(brake = true, speed = 40.0))
        assertEquals(Motion(MotionKind.PARKED, Confidence.CONFIRMED), sig(gear = Gear.PARK, speed = 2.0))
        assertEquals(Motion(MotionKind.PARKED, Confidence.CONFIRMED), sig(gear = Gear.PARK, speed = null))
        assertEquals(Motion(MotionKind.MOVING, Confidence.CONFIRMED), sig(gear = Gear.DRIVE, speed = 40.0))
    }

    @Test fun `동력원별 가용성 — 전체 차량 대상이지만 에너지 판단은 EV 만, 나머지는 끄고 이유를 적는다 · 공통 기능은 그대로`() {
        assertEquals(Availability.OK, Fresh.availability(Feature.ENERGY, VehicleCapability(Powertrain.EV)))
        assertEquals(Availability(false, UnavailableReason.POWERTRAIN, "내연기관 연료 계산은 아직 지원하지 않음 · 공식 SDK 데이터 확인 전"), Fresh.availability(Feature.ENERGY, VehicleCapability(Powertrain.ICE)))
        assertEquals("플러그인 하이브리드 연료 계산은 아직 지원하지 않음 · 공식 SDK 데이터 확인 전", Fresh.availability(Feature.ENERGY, VehicleCapability(Powertrain.PHEV)).line)
        assertEquals(UnavailableReason.POWERTRAIN, Fresh.availability(Feature.ENERGY, VehicleCapability(Powertrain.HEV)).reason)
        assertEquals(Availability(false, UnavailableReason.POWERTRAIN, "에너지 판단 보류 · 차량 유형 확인 전"), Fresh.availability(Feature.ENERGY, VehicleCapability(Powertrain.UNKNOWN)))
        for (p in Powertrain.entries) for (f in listOf(Feature.CLIMATE_PREPARE, Feature.DRIVE_RESTRICTION, Feature.FINISH)) assertEquals(true, Fresh.availability(f, VehicleCapability(p)).ok, "$p $f")
        assertEquals(Availability(false, UnavailableReason.NOT_SUPPORTED, "출발 준비 공조 · 이 차량이 지원하지 않는 기능"), Fresh.availability(Feature.CLIMATE_PREPARE, VehicleCapability(Powertrain.ICE, supported = mapOf(Feature.CLIMATE_PREPARE to false))))
        assertEquals(Availability(false, UnavailableReason.NO_PERMISSION, "에너지 판단 · 차량 데이터 권한 없음"), Fresh.availability(Feature.ENERGY, VehicleCapability(Powertrain.EV, granted = mapOf(Feature.ENERGY to false))))
        assertEquals(UnavailableReason.POWERTRAIN, Fresh.availability(Feature.ENERGY, VehicleCapability(Powertrain.ICE, granted = mapOf(Feature.ENERGY to false))).reason)
        assertEquals(UnavailableReason.NOT_SUPPORTED, Fresh.availability(Feature.ENERGY, VehicleCapability(Powertrain.EV, supported = mapOf(Feature.ENERGY to false), granted = mapOf(Feature.ENERGY to false))).reason)
        assertEquals(listOf(Powertrain.EV), Fresh.ENERGY_POWERTRAINS)
    }
}
