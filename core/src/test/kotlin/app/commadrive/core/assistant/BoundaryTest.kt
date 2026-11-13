package app.commadrive.core.assistant

import app.commadrive.core.EnergyEstimator
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * 에너지 의사결정의 **경계 조건** — `src/lib/assistant/boundary.test.ts` 와 같은 입력·같은 기대값 (거울).
 * 외부 평가(2026-10-27, docs/my-copilot/REVIEW-2026-10-27.md P0-3): 도착·왕복·대기·충전 후 상태의 단위 및 경계 조건.
 */
class BoundaryTest {
    private val family = Profiles.planFor(Profiles.PRESETS.getValue(ProfileMode.FAMILY))
    private val work = Profiles.planFor(Profiles.PRESETS.getValue(ProfileMode.WORK))
    private val v = Profiles.DEMO_VEHICLE // 68% · 77kWh · 공조 ON · 6°C
    private val wv = v.copy(batteryPct = 55.0, outsideTempC = 1.0) // mock.ts WAIT_VEHICLE
    private val here = family.copy(routeKm = 0.0, waitMinutesAfterArrival = 0)

    private fun status(plan: app.commadrive.core.TripPlan, car: app.commadrive.core.VehicleSnapshot, mode: WaitMode) =
        EnergyViews.of(Wait.energyFor(plan, car, mode), car.batteryPct, null).status

    @Test fun `거리 0 · 대기 0 — 도착 잔량은 지금 잔량, 최소 잔량과 같으면 충분, 1% 아래면 부족`() {
        for (soc in listOf(20.0, 50.0, 100.0)) {
            val view = EnergyViews.of(Wait.energyFor(here, v.copy(batteryPct = soc), WaitMode.IN_CAR), soc, 77.0, EnergyContext(minReservePct = 20.0))
            assertEquals(soc.toInt(), view.arrivalSocPct)
            assertEquals(0, view.requiredPctPoints)
            assertEquals(EnergyStatus.OK, view.status)
        }
        val atReserve = Wait.energyFor(here, v.copy(batteryPct = 20.0), WaitMode.IN_CAR)
        assertEquals(Triple(0.0, 0.0 to 0.0, false), Triple(atReserve.shortfallPct, atReserve.shortfallRange, atReserve.needsCharge))
        assertEquals(EnergyStatus.OK, EnergyViews.of(atReserve, 20.0, null).status)
        val below = EnergyViews.of(Wait.energyFor(here, v.copy(batteryPct = 19.0), WaitMode.IN_CAR), 19.0, null)
        assertEquals(EnergyStatus.SHORT, below.status)
        assertEquals(1, below.requiredPctPoints)
    }

    @Test fun `잔량 0~100% 밖의 값은 잘린다 · 음수 도착 잔량은 0 + 도착 전 소진`() {
        val e = Wait.energyFor(family, v, WaitMode.IN_CAR)
        assertEquals(100, EnergyViews.of(e, 120.0, null).currentSocPct)
        assertEquals(0, EnergyViews.of(e, -5.0, null).currentSocPct)
        val short = Wait.energyFor(family, v.copy(batteryPct = 30.0), WaitMode.IN_CAR)
        assertTrue(short.arrivalPct < 0)
        val view = EnergyViews.of(short, 30.0, null)
        assertEquals(Triple(0, true, EnergyStatus.SHORT), Triple(view.arrivalSocPct, view.depletesBeforeArrival, view.status))
        assertEquals(false, EnergyViews.of(Wait.energyFor(here, v, WaitMode.IN_CAR), 68.0, null).depletesBeforeArrival)
    }

    @Test fun `완충으로도 모자란 거리 · kWh 는 용량을 알 때만 · 모자라지 않으면 kWh 없음`() {
        val far = EnergyViews.of(Wait.energyFor(family.copy(routeKm = 3000.0), v, WaitMode.IN_CAR), 68.0, 77.0)
        assertTrue(far.requiredPctPoints > 100)
        assertTrue(far.exceedsFullCharge)
        assertTrue("완충해도 모자랄 수 있음" in far.detail)
        assertEquals(Math.round(far.requiredPctPoints * 77.0 / 100 * 10) / 10.0, far.requiredKwh)
        val near = EnergyViews.of(Wait.energyFor(family, v, WaitMode.IN_CAR), 68.0, 77.0)
        assertEquals(false, near.exceedsFullCharge)
        assertEquals(Math.round(near.requiredPctPoints * 77.0 / 100 * 10) / 10.0, near.requiredKwh)
        assertNull(EnergyViews.of(Wait.energyFor(family, v, WaitMode.IN_CAR), 68.0, null).requiredKwh)
        assertNull(EnergyViews.of(Wait.energyFor(here, v, WaitMode.IN_CAR), 68.0, 77.0).requiredKwh)
    }

    @Test fun `대기 0분이면 차 안과 차 밖이 같다 · 공조 OFF 면 대기 소비 0 · 최대 대기는 공조 ON 에만`() {
        val noWait = work.copy(waitMinutesAfterArrival = 0)
        assertEquals(Wait.energyFor(noWait, v, WaitMode.AWAY), Wait.energyFor(noWait, v, WaitMode.IN_CAR))
        val off = v.copy(hvacOn = false)
        val long = work.copy(waitMinutesAfterArrival = 300)
        val inCar = Wait.energyFor(long, off, WaitMode.IN_CAR)
        assertEquals(0.0, inCar.waitPct)
        assertNull(inCar.maxWaitMinutes)
        assertTrue(inCar.assumptions.any { "공조 OFF → 대기 소비 0" in it })
        assertEquals(Wait.energyFor(long, off, WaitMode.AWAY).shortfallPct, inCar.shortfallPct)
        val on = Wait.energyFor(long, v, WaitMode.IN_CAR)
        assertTrue(on.waitPct > 0)
        assertTrue((on.maxWaitMinutes ?: -1) >= 0)
    }

    @Test fun `경유지 충전 — 남은 거리보다 먼 경유지는 거리 0 · 충전 후 잔량은 80 아래로 안 내려가고 더 높으면 그대로 · 내비 예측은 버린다`() {
        val (beyond, beyondSoc) = Options.planViaStop(family, v, WaitMode.IN_CAR, 1000.0)
        assertEquals(0.0, beyond.drivePct)
        assertEquals(80.0, beyondSoc)
        assertEquals(95.0, Options.planViaStop(family, v.copy(batteryPct = 95.0), WaitMode.IN_CAR, 0.0).second)
        for (km in listOf(0.0, 50.0, 250.0, 400.0, 1000.0)) assertTrue(Options.planViaStop(family, v, WaitMode.IN_CAR, km).second >= 80.0, "$km km")
        val withNavi = Options.planViaStop(family.copy(naviArrivalSocPct = 10.0), v, WaitMode.IN_CAR, 250.0).first
        assertTrue(withNavi.assumptions.none { "내비" in it })
        assertEquals(Options.planViaStop(family, v, WaitMode.IN_CAR, 250.0).first, withNavi)
    }

    @Test fun `대기 한계 — 5분 단위 · 한계는 충분, 한 칸 더는 아님 · 차 밖 null · 대기 없이도 모자라면 -1 · 10시간 넘으면 600`() {
        val limit = Options.maxWaitWithoutCharge(work, wv, WaitMode.IN_CAR)!!
        assertEquals(0, limit % Options.WAIT_STEP_MIN)
        assertTrue(limit in 1 until Options.WAIT_SEARCH_MAX_MIN)
        assertEquals(EnergyStatus.OK, status(work.copy(waitMinutesAfterArrival = limit), wv, WaitMode.IN_CAR))
        assertNotEquals(EnergyStatus.OK, status(work.copy(waitMinutesAfterArrival = limit + Options.WAIT_STEP_MIN), wv, WaitMode.IN_CAR))
        assertNull(Options.maxWaitWithoutCharge(work, wv, WaitMode.AWAY))
        assertEquals(Options.WAIT_SEARCH_MAX_MIN, Options.maxWaitWithoutCharge(work, v, WaitMode.IN_CAR))
        assertEquals(-1, Options.maxWaitWithoutCharge(work, v.copy(batteryPct = 5.0), WaitMode.IN_CAR))
        assertEquals(Options.WAIT_SEARCH_MAX_MIN, Options.maxWaitWithoutCharge(work.copy(routeKm = 0.0, returnKm = 0.0), v.copy(batteryPct = 100.0, outsideTempC = 20.0), WaitMode.IN_CAR))
    }

    @Test fun `왕복 — 오는 길 = 가는 길이면 주행 소비 두 배 · 편도보다 도착 잔량 낮음 · 최대 대기는 왕복 뒤 기준`() {
        val oneWay = EnergyEstimator.estimate(work.copy(returnKm = 0.0), v)
        val round = EnergyEstimator.estimate(work, v)
        assertEquals(round.outboundPct, round.returnPct)
        assertTrue(abs(round.drivePct - 2 * oneWay.drivePct) <= 0.2) // 소수 1자리 반올림끼리
        assertTrue(round.arrivalPct < oneWay.arrivalPct)
        assertTrue(round.maxWaitMinutes!! < oneWay.maxWaitMinutes!!)
        assertTrue(round.assumptions.any { it.startsWith("왕복: 가는 길 38km + 오는 길 38km") })
    }

    @Test fun `내비 도착 예측 — 가는 길 = 잔량 − 예측 · 예측이 잔량보다 크면 0 · 오차는 ±5%`() {
        val navi = EnergyEstimator.estimate(family.copy(naviArrivalSocPct = 50.0), v)
        assertEquals(18.0, navi.outboundPct)
        assertTrue(abs((navi.driveRange.second - navi.driveRange.first) - navi.drivePct * 0.1) < 0.01)
        val over = EnergyEstimator.estimate(family.copy(naviArrivalSocPct = 90.0), v)
        assertEquals(0.0, over.outboundPct)
        assertEquals(0.0, over.drivePct)
        val model = EnergyEstimator.estimate(family, v)
        assertTrue(model.driveRange.second - model.driveRange.first > navi.driveRange.second - navi.driveRange.first)
    }

    @Test fun `최소 잔량 100% — 잔량 100 거리 0 은 충분, 99 는 부족 · 최소 잔량 0 이면 잔량 0 거리 0 도 충분`() {
        val all = here.copy(minReservePct = 100.0)
        assertEquals(EnergyStatus.OK, status(all, v.copy(batteryPct = 100.0), WaitMode.IN_CAR))
        assertEquals(EnergyStatus.SHORT, status(all, v.copy(batteryPct = 99.0), WaitMode.IN_CAR))
        assertEquals(EnergyStatus.OK, status(here.copy(minReservePct = 0.0), v.copy(batteryPct = 0.0), WaitMode.IN_CAR))
    }

    @Test fun `잔량이 늘면 판정은 나빠지지 않는다 — 5~100% · 편도와 왕복 · 대기 유형`() {
        val rank = mapOf(EnergyStatus.SHORT to 0, EnergyStatus.CAUTION to 1, EnergyStatus.OK to 2, EnergyStatus.UNKNOWN to -1)
        for (plan in listOf(family, work, work.copy(waitMinutesAfterArrival = 300))) {
            for (mode in WaitMode.entries) {
                var prev = -1
                for (b in 5..100) {
                    val r = rank.getValue(status(plan, v.copy(batteryPct = b.toDouble()), mode))
                    assertTrue(r >= prev, "${plan.destinationName} $mode $b%")
                    prev = r
                }
            }
        }
    }

    @Test fun `선택지 — 충분이면 없음 · 그대로는 기준 판정 · 30분 줄이기는 대기 30분 이상 · 차 밖 대기는 공조 ON 에만`() {
        assertEquals(emptyList(), Options.energyOptions(work, v, WaitMode.IN_CAR, null))
        val long = work.copy(waitMinutesAfterArrival = 210)
        val low = v.copy(batteryPct = 45.0)
        val opts = Options.energyOptions(long, low, WaitMode.IN_CAR, null)
        assertEquals(EnergyOptionKey.AS_IS, opts[0].key)
        assertEquals(status(long, low, WaitMode.IN_CAR), opts[0].status)
        assertNotEquals(EnergyStatus.OK, opts[0].status)
        assertEquals(listOf(EnergyOptionKey.AS_IS, EnergyOptionKey.WAIT_AWAY, EnergyOptionKey.WAIT_SHORTER), opts.map { it.key })
        val short = family.copy(waitMinutesAfterArrival = 20)
        assertEquals(listOf(EnergyOptionKey.AS_IS), Options.energyOptions(short, v.copy(hvacOn = false), WaitMode.IN_CAR, null).map { it.key })
        assertEquals(listOf(EnergyOptionKey.AS_IS, EnergyOptionKey.CHARGE_AT), Options.energyOptions(short, v, WaitMode.AWAY, ChargeCandidate("김천휴게소", 250.0)).map { it.key })
    }

    @Test fun `차 안·차 밖 대기의 차이는 대기 소비뿐 — 주행·왕복 소비는 같고, 공조 OFF 면 둘이 같다 (외부 평가 6 ②)`() {
        val p = work.copy(waitMinutesAfterArrival = 150)
        val away = Wait.energyFor(p, v, WaitMode.AWAY)
        val inCar = Wait.energyFor(p, v, WaitMode.IN_CAR)
        assertEquals(Triple(away.drivePct, away.outboundPct, away.returnPct), Triple(inCar.drivePct, inCar.outboundPct, inCar.returnPct))
        assertEquals(0.0, away.waitPct)
        assertTrue(inCar.waitPct > 0)
        assertTrue(abs(away.arrivalPct - inCar.arrivalPct - inCar.waitPct) < 0.15, "도착 잔량 차이 = 차 안 대기 소비 (소수 1자리 반올림)")
        val off = v.copy(hvacOn = false)
        assertEquals(Wait.energyFor(p, off, WaitMode.AWAY).arrivalPct, Wait.energyFor(p, off, WaitMode.IN_CAR).arrivalPct)
    }
}
