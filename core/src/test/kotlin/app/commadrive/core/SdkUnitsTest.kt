package app.commadrive.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** 에뮬레이터에서 실제로 받은 값으로 정규화 규칙을 고정한다 (SdkUnits 주석의 E8 · E25 · RESULT §7-4) */
class SdkUnitsTest {
    @Test fun `에뮬레이터 용량 77400 은 Wh 라 77_4 kWh 다`() {
        assertEquals(77.4, SdkUnits.capacityKwh(77400.0)!!, 1e-9)
    }

    @Test fun `kWh 로 온 용량은 그대로 둔다`() {
        assertEquals(77.4, SdkUnits.capacityKwh(77.4)!!, 1e-9)
    }

    @Test fun `범위 밖이거나 없는 용량은 null 이라 차종 기본값을 쓴다`() {
        assertNull(SdkUnits.capacityKwh(null))
        assertNull(SdkUnits.capacityKwh(0.0))
        assertNull(SdkUnits.capacityKwh(5.0))
        assertNull(SdkUnits.capacityKwh(500.0))
        assertNull(SdkUnits.capacityKwh(Double.NaN))
    }

    @Test fun `Wh 를 kWh 로 읽었으면 400km 가 충분했을 것 - 정규화하면 충분하지 않다`() {
        fun plan() = TripPlan(
            destinationName = "부산", routeKm = 400.0, waitMinutesAfterArrival = 0, minReservePct = 10.0,
            passengers = emptySet(), breakIntervalMinutes = 120,
        )
        val raw = 77400.0
        fun car(kwh: Double) = VehicleSnapshot(
            batteryPct = 40.0, batteryKwh = kwh, efficiencyKwhPer100km = null, hvacOn = true, outsideTempC = 10.0,
            driveMode = DriveMode.NORMAL, tripMinutes = 0, speedKmh = 0.0, tireWarning = false,
        )
        assertTrue(!EnergyEstimator.estimate(plan(), car(raw)).needsCharge, "틀린 단위는 충분처럼 보인다")
        assertTrue(EnergyEstimator.estimate(plan(), car(SdkUnits.capacityKwh(raw)!!)).needsCharge, "고친 단위는 충전이 필요하다")
    }

    @Test fun `목적지 없음 신호는 남은 거리 null 이다`() {
        assertNull(SdkUnits.remainingKm(0, 37.5, 127.0))
        assertNull(SdkUnits.remainingKm(120_000, 0.0, 0.0))
        assertNull(SdkUnits.remainingKm(null, 37.5, 127.0))
        assertNull(SdkUnits.remainingKm(-1, 37.5, 127.0))
    }

    @Test fun `목적지가 있으면 m 를 km 로`() {
        assertEquals(325.0, SdkUnits.remainingKm(325_000, 35.1, 129.0)!!, 1e-9)
    }
}
