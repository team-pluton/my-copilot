package app.commadrive.core.assistant

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * 원시 차량 값 해석 — Android 전용이라 TS 거울이 없다(웹 시연은 모의 신호를 바로 만든다).
 * 상수는 android.car.jar(API 34)·Pleos Vehicle 2.3.2 jar 를 javap 로 읽은 값이다 (2026-10-26).
 */
class SignalMappingTest {
    @Test fun `AAOS 기어 값을 여정 기어로 — 수동 단수(16 이상)는 전진, 모르는 값은 UNKNOWN`() {
        assertEquals(Gear.PARK, SignalMapping.gearFromAaos(4))
        assertEquals(Gear.DRIVE, SignalMapping.gearFromAaos(8))
        assertEquals(Gear.DRIVE, SignalMapping.gearFromAaos(32))
        assertEquals(Gear.REVERSE, SignalMapping.gearFromAaos(2))
        assertEquals(Gear.NEUTRAL, SignalMapping.gearFromAaos(1))
        assertEquals(Gear.UNKNOWN, SignalMapping.gearFromAaos(0))
        assertEquals(Gear.UNKNOWN, SignalMapping.gearFromAaos(null))
    }

    @Test fun `AAOS 속도는 m-s 라 km-h 로 바꾸고, 후진 음수는 속력으로`() {
        assertEquals(80.0, SignalMapping.kmhFromMps(22.2222f))
        assertEquals(18.0, SignalMapping.kmhFromMps(-5f))
        assertNull(SignalMapping.kmhFromMps(null))
    }

    @Test fun `도어는 하나라도 열렸으면 열림, 모두 닫힘을 확인해야 닫힘, 나머지는 모른다`() {
        assertEquals(true, SignalMapping.doorOpen(listOf(0, 40, null), 0))
        assertEquals(false, SignalMapping.doorOpen(listOf(0, 0, 0, 0), 0))
        assertNull(SignalMapping.doorOpen(listOf(0, null), 0))
        assertNull(SignalMapping.doorOpen(listOf(0, 0), null))
        assertNull(SignalMapping.doorOpen(emptyList(), 0))
    }

    @Test fun `해석한 신호는 여정 단계 규칙에 그대로 들어간다 — P 단 + 0km-h 는 확정 주차`() {
        val s = JourneySignals(SignalMapping.gearFromAaos(4), parkingBrake = true, speedKmh = SignalMapping.kmhFromMps(0f), uxRestricted = false, remainingKm = 0.2)
        assertEquals(Motion(MotionKind.PARKED, Confidence.CONFIRMED), Journey.motionOf(s))
    }
}
