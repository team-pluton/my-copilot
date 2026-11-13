package app.commadrive.copilot.adapter

import android.car.Car
import android.car.VehiclePropertyIds
import android.car.drivingstate.CarUxRestrictionsManager
import android.car.hardware.CarPropertyValue
import android.car.hardware.property.CarPropertyManager
import android.content.Context
import app.commadrive.core.assistant.Gear
import app.commadrive.core.assistant.JourneySignalSource
import app.commadrive.core.assistant.JourneySignals
import app.commadrive.core.assistant.SignalMapping

/**
 * 여정 신호를 실제 차에서 읽는다 — **전부 AAOS Car API (Standard First)**.
 * 기어도 AAOS 다: Pleos Vehicle SDK 2.3.2 가 registerGearSelection 을 deprecated 로 두고 "Google GEAR_SELECTION property 를 쓰라"고
 * 적어 두었다 (컴파일 경고, 2026-10-26 — research 11절). 그래서 Pleos 기어로 물러나지 않는다.
 *
 *  · 주행 화면 제한: CarUxRestrictionsManager.isRequiresDistractionOptimization — 우리 추정이 아니라 플랫폼 값
 *  · 속도: PERF_VEHICLE_SPEED (m/s) · 기어: GEAR_SELECTION · 주차 브레이크: PARKING_BRAKE_ON
 *    (Pleos Vehicle Brake 는 페달 상태만 준다 — research 11절)
 *  · 남은 거리: NaviHelper(PleosNavigationProvider) 값을 밖에서 넣어 준다 — 같은 서비스에 두 번 붙지 않으려고
 *
 * 권한(앱 매니페스트에 넣어야 하는 것): android.car.permission.CAR_SPEED · CAR_POWERTRAIN.
 * 권한이 없거나 차종이 지원하지 않으면 그 값은 null/UNKNOWN 이다 — 여정 단계는 모르면 바꾸지 않는다(journey 규칙).
 *
 * ⚠️ 컴파일만 확인했다(2026-10-26). 콜백이 실제로 오는지는 에뮬레이터에서 확인 전이다.
 */
class AaosJourneySignalSource(
    private val context: Context,
    private val remainingKm: () -> Double?,
) : JourneySignalSource {
    private var car: Car? = null
    private var ux: CarUxRestrictionsManager? = null
    private var props: CarPropertyManager? = null
    private var onChange: ((JourneySignals) -> Unit)? = null

    @Volatile private var gear: Gear = Gear.UNKNOWN
    @Volatile private var parkingBrake: Boolean? = null
    @Volatile private var speedKmh: Double? = null
    @Volatile private var uxRestricted: Boolean? = null

    private fun emit() = onChange?.invoke(JourneySignals(gear, parkingBrake, speedKmh, uxRestricted, remainingKm()))

    private val propCallback = object : CarPropertyManager.CarPropertyEventCallback {
        override fun onChangeEvent(value: CarPropertyValue<*>) {
            when (value.propertyId) {
                VehiclePropertyIds.PERF_VEHICLE_SPEED -> speedKmh = SignalMapping.kmhFromMps(value.value as? Float)
                VehiclePropertyIds.GEAR_SELECTION -> gear = SignalMapping.gearFromAaos(value.value as? Int)
                VehiclePropertyIds.PARKING_BRAKE_ON -> parkingBrake = value.value as? Boolean
            }
            emit()
        }

        override fun onErrorEvent(propertyId: Int, zone: Int) {
            // 모르면 모른다고 넘긴다 — 마지막 값을 붙들고 있지 않는다
            when (propertyId) {
                VehiclePropertyIds.PERF_VEHICLE_SPEED -> speedKmh = null
                VehiclePropertyIds.GEAR_SELECTION -> gear = Gear.UNKNOWN
                VehiclePropertyIds.PARKING_BRAKE_ON -> parkingBrake = null
            }
            emit()
        }
    }

    private val uxListener = CarUxRestrictionsManager.OnUxRestrictionsChangedListener { r ->
        uxRestricted = r?.isRequiresDistractionOptimization
        emit()
    }

    override fun start(onChange: (JourneySignals) -> Unit) {
        this.onChange = onChange
        val c = Car.createCar(context) ?: run { emit(); return }
        car = c
        ux = (c.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as? CarUxRestrictionsManager)?.also { m ->
            uxRestricted = runCatching { m.currentCarUxRestrictions?.isRequiresDistractionOptimization }.getOrNull()
            runCatching { m.registerListener(uxListener) }
        }
        props = (c.getCarManager(Car.PROPERTY_SERVICE) as? CarPropertyManager)?.also { m ->
            subscribe(m, VehiclePropertyIds.PERF_VEHICLE_SPEED, CarPropertyManager.SENSOR_RATE_NORMAL)
            subscribe(m, VehiclePropertyIds.GEAR_SELECTION, CarPropertyManager.SENSOR_RATE_ONCHANGE)
            subscribe(m, VehiclePropertyIds.PARKING_BRAKE_ON, CarPropertyManager.SENSOR_RATE_ONCHANGE)
        }
        emit()
    }

    /** 권한이 없으면 SecurityException — 실패로 치고 그 값은 모름으로 둔다 */
    private fun subscribe(m: CarPropertyManager, id: Int, rate: Float): Boolean =
        runCatching { m.registerCallback(propCallback, id, rate) }.getOrDefault(false)

    override fun stop() {
        runCatching { props?.unregisterCallback(propCallback) }
        runCatching { ux?.unregisterListener() }
        runCatching { car?.disconnect() }
        car = null; ux = null; props = null; onChange = null
    }
}
