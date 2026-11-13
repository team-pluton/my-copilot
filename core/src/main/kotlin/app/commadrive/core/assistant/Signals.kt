package app.commadrive.core.assistant

import kotlin.math.abs

/**
 * 차량 신호의 경계 — MY CO-PILOT 의 여정 단계·하차 화면이 읽는 값. 구현은 `copilot-adapters/`(실제 SDK) 와 시연(모의).
 *
 * **읽기 전용이다.** 여기에는 차량을 바꾸는 메서드가 없다. 제어는 Cabin.kt 의 CabinControl 로 **따로** 둔다 —
 * 에뮬레이터에서 CONTROL_* 권한이 서드파티에 허용되는 것(protectionLevel normal)을 확인한 2026-10-29 뒤에 만들었다. 실차는 미확인.
 */
interface JourneySignalSource {
    /** 값이 바뀔 때마다 부른다. 못 읽은 값은 null/UNKNOWN 으로 넘긴다 — 마지막 값을 현재 값인 척 넘기지 않는다 */
    fun start(onChange: (JourneySignals) -> Unit)
    fun stop()
}

/**
 * 하차·출발 준비 화면이 보여 줄 실내 상태. 차종이 지원하지 않거나 권한이 없으면 null.
 * 시트는 운전석 **단계값**(Pleos Seat getHvacSeatVentilationState / getHvacSeatTemperature, Int)을 그대로 — 켬/끔 해석은 SignalMapping.seatOn
 */
data class CabinState(val hvacSetC: Double?, val doorOpen: Boolean?, val doorLocked: Boolean?, val seatVentLevel: Int? = null, val seatHeatLevel: Int? = null)

interface CabinStateSource {
    fun start(onChange: (CabinState) -> Unit)
    fun stop()
}

/**
 * 원시 차량 값 → 여정 신호. 어댑터는 SDK 를 부르기만 하고, **해석은 여기서** 한다 — 차량 없이 테스트하려고.
 * core 는 Android 를 모르므로 AAOS 상수 값을 옮겨 적는다 (android.car.VehicleGear, javap 2026-10-26).
 */
object SignalMapping {
    const val AAOS_GEAR_UNKNOWN = 0
    const val AAOS_GEAR_NEUTRAL = 1
    const val AAOS_GEAR_REVERSE = 2
    const val AAOS_GEAR_PARK = 4
    const val AAOS_GEAR_DRIVE = 8
    /** GEAR_1(16) 이상은 수동 단수 — 앞으로 가는 기어다 */
    const val AAOS_GEAR_1 = 16

    fun gearFromAaos(value: Int?): Gear = when {
        value == null || value == AAOS_GEAR_UNKNOWN -> Gear.UNKNOWN
        value == AAOS_GEAR_PARK -> Gear.PARK
        value == AAOS_GEAR_REVERSE -> Gear.REVERSE
        value == AAOS_GEAR_NEUTRAL -> Gear.NEUTRAL
        value == AAOS_GEAR_DRIVE || value >= AAOS_GEAR_1 -> Gear.DRIVE
        else -> Gear.UNKNOWN
    }

    /** AAOS PERF_VEHICLE_SPEED 는 **m/s** 다. 후진은 음수로 올 수 있어 속력으로 바꾼다 */
    fun kmhFromMps(mps: Float?): Double? = mps?.let { Math.round(abs(it) * 3.6 * 10) / 10.0 }

    /**
     * 도어 위치 → 열림. 닫힘 값은 차종 범위(checkDoorPositionCapabilities 의 최솟값)로 정한다 —
     * AAOS DOOR_POS 정의(최솟값 = 닫힘)를 Pleos 도 따른다고 **가정**한다. 에뮬레이터에서 확인 전.
     * 하나라도 열렸으면 열림, 모두 닫힘을 확인했을 때만 닫힘, 그 밖에는 모른다(null).
     */
    fun doorOpen(positions: List<Int?>, closedValue: Int?): Boolean? {
        if (closedValue == null || positions.isEmpty()) return null
        if (positions.any { it != null && it > closedValue }) return true
        return if (positions.all { it != null }) false else null
    }

    /**
     * 시트 단계 → 켬/끔. AAOS HVAC_SEAT_TEMPERATURE 정의(음수 = 냉방/통풍 · 0 = 끔 · 양수 = 열선)와 HVAC_SEAT_VENTILATION(0 = 끔 · 양수 = 바람 세기)을 따른다.
     * 에뮬레이터 실측(2026-10-29, E19): Virtual Console 의 Seat Temperature V2 → `getHvacSeatTemperature` = **-2**, `getHvacSeatVentilationState` = 0.
     * 그래서 통풍은 두 값 중 하나라도 — 통풍 단계 > 0 **또는** 시트 온도 < 0. 둘 다 못 읽으면 null.
     */
    fun seatVentOn(ventLevel: Int?, heatLevel: Int?): Boolean? = when {
        ventLevel == null && heatLevel == null -> null
        else -> (ventLevel ?: 0) > 0 || (heatLevel ?: 0) < 0
    }
    fun seatHeatOn(heatLevel: Int?): Boolean? = heatLevel?.let { it > 0 }
    /** 켬 요청에 보낼 단계 — 가장 낮은 1단. 끔은 0 */
    const val SEAT_LEVEL_ON = 1
    const val SEAT_LEVEL_OFF = 0
}
