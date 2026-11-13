package app.commadrive.copilot.adapter

import ai.pleos.playground.vehicle.Vehicle
import ai.pleos.playground.vehicle.api.model.area.DoorArea
import ai.pleos.playground.vehicle.api.model.area.SeatArea
import ai.pleos.playground.vehicle.api.model.capability.AreaBounds
import ai.pleos.playground.vehicle.api.model.capability.CapabilityConfig
import ai.pleos.playground.vehicle.constant.area.DoorValue
import ai.pleos.playground.vehicle.constant.area.SeatValue
import ai.pleos.playground.vehicle.constant.unit.TemperatureUnit
import ai.pleos.playground.vehicle.listener.DoorLockStateListener
import ai.pleos.playground.vehicle.listener.DoorPositionListener
import ai.pleos.playground.vehicle.listener.HvacSeatTemperatureListener
import ai.pleos.playground.vehicle.listener.HvacSeatVentilationListener
import ai.pleos.playground.vehicle.listener.HvacTemperatureValueListener
import app.commadrive.core.assistant.CabinState
import app.commadrive.core.assistant.CabinStateSource
import app.commadrive.core.assistant.SignalMapping

/**
 * 실내 상태를 **읽기만** 한다 — 출발 준비(공조 비교)·하차(도어 상태)의 입력. Pleos Vehicle SDK 2.3.2.
 *
 *  · 공조: 운전석 **설정 온도** getHvacTemperature(CELSIUS) — 실내 현재 온도(getHvacTemperatureCurrent)가 아니다.
 *    프로필의 저장 온도와 비교하는 것은 설정값이기 때문이다. 권한 CAR_CLIMATE.
 *  · 도어: 1·2열 문 위치 + 잠금. 권한 CAR_DOORS. 열림 판정 규칙은 SignalMapping.doorOpen (닫힘 = 범위 최솟값, 가정).
 *    잠금은 **4문을 합친 영역**으로 묻는다 — 에뮬레이터(2026-10-29)에서 운전석 하나(0x1)는 "area not supported" 였고 콜백은 영역 0x55 로 왔다.
 *  · 시트: 운전석 통풍·열선 **단계**(Int). 권한 CAR_SEATS. 켬/끔 해석은 SignalMapping.seatOn.
 *
 * ⚠️ 이 파일은 set…(제어)을 부르지 않는다 — 빌드의 verifyReadOnly 가 막는다. 제어는 PleosCabinControl 한 파일에만.
 * 에뮬레이터에서 공조 설정 온도 콜백 확인 2026-10-29(EMULATOR-RESULT §3 E10). 시트는 E19.
 */
class PleosCabinStateSource(
    /** 이미 initialize() 한 Vehicle — 쉼표 DRIVE 의 PleosVehicleStateProvider 와 같은 인스턴스를 나눠 쓴다 */
    private val vehicle: Vehicle,
) : CabinStateSource {
    private val driverSeat = SeatArea(SeatValue.ROW_1_LEFT)
    private val allDoors = DoorArea(DoorValue.ROW_1_LEFT, DoorValue.ROW_1_RIGHT, DoorValue.ROW_2_LEFT, DoorValue.ROW_2_RIGHT)
    private val doors = listOf(DoorValue.ROW_1_LEFT, DoorValue.ROW_1_RIGHT, DoorValue.ROW_2_LEFT, DoorValue.ROW_2_RIGHT).map { DoorArea(it) }

    @Volatile private var hvacSetC: Double? = null
    @Volatile private var locked: Boolean? = null
    @Volatile private var closedValue: Int? = null
    @Volatile private var ventLevel: Int? = null
    @Volatile private var heatLevel: Int? = null
    private val positions = HashMap<DoorArea, Int?>()
    private var onChange: ((CabinState) -> Unit)? = null

    private fun emit() = onChange?.invoke(CabinState(hvacSetC, SignalMapping.doorOpen(doors.map { positions[it] }, closedValue), locked, ventLevel, heatLevel))

    /** 콜백 인자 둘의 단위 순서를 문서로 확인하지 못했다 — 값을 믿지 않고 CELSIUS 로 다시 읽는다 */
    private val hvacListener = object : HvacTemperatureValueListener {
        override fun onHvacTemperatureUpdated(a: Float?, b: Float?) = readHvac()
        override fun onFailed(e: Exception) { hvacSetC = null; emit() }
    }
    private val lockListener = object : DoorLockStateListener {
        override fun onDoorLockStateUpdated(value: Boolean?) { locked = value; emit() }
        override fun onFailed(e: Exception) { locked = null; emit() }
    }
    private val ventListener = object : HvacSeatVentilationListener {
        override fun onHvacSeatVentilationUpdated(value: Int?) { ventLevel = value; emit() }
        override fun onFailed(e: Exception) { ventLevel = null; emit() }
    }
    private val heatListener = object : HvacSeatTemperatureListener {
        override fun onHvacSeatTemperatureUpdated(value: Int?) { heatLevel = value; emit() }
        override fun onFailed(e: Exception) { heatLevel = null; emit() }
    }
    private val positionListeners = doors.associateWith { area ->
        object : DoorPositionListener {
            override fun onPositionUpdated(value: Int?) { positions[area] = value; emit() }
            override fun onFailed(e: Exception) { positions[area] = null; emit() }
        }
    }

    private fun readHvac() = vehicle.getHVAC().getHvacTemperature(driverSeat, TemperatureUnit.CELSIUS,
        { hvacSetC = it?.toDouble(); emit() }, { hvacSetC = null; emit() })

    override fun start(onChange: (CabinState) -> Unit) {
        this.onChange = onChange
        runCatching { readHvac(); vehicle.getHVAC().registerHvacTemperature(driverSeat, hvacListener) }
        runCatching {
            val door = vehicle.getDoor()
            // CapabilityConfig 를 함께 주는 새 API (Map 만 주는 것은 deprecated). 접근 종류(AccessType)는 읽기만 하므로 보지 않는다
            door.checkDoorPositionCapabilities({ _: CapabilityConfig, bounds: Map<DoorArea, AreaBounds<Int>> ->
                closedValue = doors.firstNotNullOfOrNull { bounds[it]?.minValue }
                emit()
            }, { closedValue = null; emit() })
            doors.forEach { area -> door.registerDoorPosition(area, positionListeners.getValue(area)) }
            door.getDoorLockState(allDoors, { locked = it; emit() }, { locked = null; emit() })
            door.registerDoorLockState(allDoors, lockListener)
        }
        runCatching {
            val seat = vehicle.getSeat()
            seat.getHvacSeatVentilationState(driverSeat, { ventLevel = it; emit() }, { ventLevel = null; emit() })
            seat.getHvacSeatTemperature(driverSeat, { heatLevel = it; emit() }, { heatLevel = null; emit() })
            seat.registerHvacSeatVentilation(driverSeat, ventListener)
            seat.registerHvacSeatTemperature(driverSeat, heatListener)
        }
        emit()
    }

    override fun stop() {
        runCatching { vehicle.getHVAC().unregisterHvacTemperature(driverSeat, hvacListener) }
        runCatching {
            val door = vehicle.getDoor()
            doors.forEach { area -> door.unregisterDoorPosition(area, positionListeners.getValue(area)) }
            door.unregisterDoorLockState(allDoors, lockListener)
        }
        runCatching {
            val seat = vehicle.getSeat()
            seat.unregisterHvacSeatVentilation(driverSeat, ventListener)
            seat.unregisterHvacSeatTemperature(driverSeat, heatListener)
        }
        onChange = null
    }
}
