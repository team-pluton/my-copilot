package app.commadrive.adapter

import ai.pleos.playground.vehicle.Vehicle
import ai.pleos.playground.vehicle.listener.EvBatteryEfficiencyListener
import ai.pleos.playground.vehicle.listener.EvBatteryStateOfChargeListener
import android.content.Context
import app.commadrive.core.DriveMode
import app.commadrive.core.DrivingState
import app.commadrive.core.SdkUnits
import app.commadrive.core.VehicleSnapshot
import app.commadrive.core.VehicleStateProvider

/**
 * VehicleStateProvider 를 **실제 Vehicle SDK v2.3.2** 로 구현한다. 시그니처는 공식 AAR 에서 javap 로 읽었다(2026-10-25).
 *
 * 구독(register…)으로 값이 바뀔 때마다 onChange 를 부른다 → 앱이 EnergyEstimator.rejudge 로 **실시간 재판단**한다.
 *  - 잔량: EvBattery.registerEvBatteryStateOfCharge (Int %)
 *  - 효율: EvBattery.registerCurrentEvEfficiency (Float — 단위 미확인, km/kWh 로 가정하고 kWh/100km 로 바꾼다)
 *  - 용량: EvBattery.getEvBatteryCapacity (Float — 에뮬레이터 실측 **Wh**(77400). SdkUnits.capacityKwh 가 Wh/kWh 를 가린다)
 * 공조·외기·속도·기어는 별도(HVAC 도메인 · AAOS CarPropertyManager) — 이 파일은 축 ① 의 핵심 셋만 다룬다.
 * 차종마다 지원이 다르므로 실제 앱은 check…Capabilities 로 먼저 확인하고, 없으면 사용자 입력으로 메운다(기획서 6절 폴백 표).
 */
class PleosVehicleStateProvider(context: Context) : VehicleStateProvider {
    private val vehicle = Vehicle(context)

    @Volatile private var socPct: Int? = null
    @Volatile private var efficiencyRaw: Float? = null
    @Volatile private var capacityKwh: Float? = null

    /** 값이 바뀌었다 — 앱은 여기서 rejudge 를 돌린다 */
    var onChange: (() -> Unit)? = null

    private val socListener = object : EvBatteryStateOfChargeListener {
        override fun onEvBatteryStateOfChargeUpdated(value: Int?) { socPct = value; onChange?.invoke() }
        // VehicleListener 공통 — 실물에서 확인(문서 예시엔 없었다). 실패하면 값을 비워 "직접 입력" 폴백으로
        override fun onFailed(e: Exception) { socPct = null; onChange?.invoke() }
    }
    private val efficiencyListener = object : EvBatteryEfficiencyListener {
        override fun onEvBatteryEfficiencyUpdated(value: Float?) { efficiencyRaw = value; onChange?.invoke() }
        override fun onFailed(e: Exception) { efficiencyRaw = null } // 효율이 없으면 차종 기본값
    }

    fun start() {
        vehicle.initialize()
        val ev = vehicle.getEvBattery()
        ev.registerEvBatteryStateOfCharge(socListener)
        ev.registerCurrentEvEfficiency(efficiencyListener)
        // deprecated(컴파일 경고): SDK 는 AAOS INFO_EV_BATTERY_CAPACITY 를 쓰라고 한다 — Android 앱 모듈에서 CarPropertyManager 로 바꾼다
        @Suppress("DEPRECATION")
        ev.getEvBatteryCapacity({ capacityKwh = it }, { /* 지원 안 함 → 차종 기본값 */ })
    }

    fun stop() {
        val ev = vehicle.getEvBattery()
        ev.unregisterEvBatteryStateOfCharge(socListener)
        ev.unregisterCurrentEvEfficiency(efficiencyListener)
        vehicle.release()
    }

    /** 속도·기어는 AAOS 로 읽는다 (Standard First) — 여기서는 모른다고 말한다 */
    override suspend fun drivingState(): DrivingState = DrivingState.UNKNOWN

    override suspend fun snapshot(): VehicleSnapshot? {
        val soc = socPct ?: return null
        return VehicleSnapshot(
            batteryPct = soc.toDouble(),
            // 에뮬레이터는 Wh(77400)로 준다(research 12절) — kWh 로 읽으면 400km 도 "충분"이 된다. 단위는 SdkUnits 가 가린다
            batteryKwh = SdkUnits.capacityKwh(capacityKwh?.toDouble()) ?: DEFAULT_CAPACITY_KWH,
            efficiencyKwhPer100km = efficiencyRaw?.toDouble()?.takeIf { it > 0 }?.let { 100.0 / it },
            hvacOn = true, // HVAC 도메인 연결 전까지 보수적으로 켜짐 가정 (화면에 "공조 ON 가정" 표시)
            outsideTempC = 10.0, // AAOS ENV_OUTSIDE_TEMPERATURE 연결 전까지 — "외기온 미확인"
            driveMode = DriveMode.NORMAL,
            tripMinutes = 0,
            speedKmh = 0.0,
            tireWarning = false,
        )
    }

    private companion object {
        const val DEFAULT_CAPACITY_KWH = 77.0
    }
}
