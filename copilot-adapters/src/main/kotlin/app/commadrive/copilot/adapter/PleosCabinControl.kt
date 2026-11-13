package app.commadrive.copilot.adapter

import ai.pleos.playground.vehicle.Vehicle
import ai.pleos.playground.vehicle.api.model.area.SeatArea
import ai.pleos.playground.vehicle.constant.area.SeatValue
import ai.pleos.playground.vehicle.constant.unit.TemperatureUnit
import app.commadrive.core.assistant.CabinControl
import app.commadrive.core.assistant.SignalMapping

/**
 * 실내 **제어** — 이 모듈에서 set 을 부르는 유일한 파일(빌드의 verifyReadOnly 가 이 파일만 예외로 둔다).
 *
 * 만든 근거(2026-10-29, Pleos Connect Emulator v2.1.0): `pm list permissions -f` 에서 CONTROL_CAR_CLIMATE · CONTROL_CAR_SEATS 가
 * **protectionLevel normal** — 매니페스트 선언만으로 설치 시 허용된다. 실차·App Market 심사에서도 그런지는 미확인(설명회 질문 10).
 *
 *  · 공조 설정 온도: HVAC.setHvacTemperature(운전석, °C) · CONTROL_CAR_CLIMATE. 콜백 인자는 차량이 적용한 값.
 *  · 시트 통풍·열선: Seat.setHvacSeatVentilation / setHvacSeatTemperature(운전석, 단계) · CONTROL_CAR_SEATS. 켬 = 1단(가정), 끔 = 0.
 *
 * 부르는 쪽(앱)은 승인 뒤에만 부르고, 결과를 항목마다 세션에 넣는다(Intent.CabinResults · ClimateEvent). 재조회는 PleosCabinStateSource 의 리스너가 한다.
 */
class PleosCabinControl(private val vehicle: Vehicle) : CabinControl {
    private val driverSeat = SeatArea(SeatValue.ROW_1_LEFT)
    private fun reason(e: Exception) = e.message ?: e.javaClass.simpleName

    override fun setHvacTempC(c: Double, onApplied: (Double) -> Unit, onError: (String) -> Unit) {
        runCatching {
            vehicle.getHVAC().setHvacTemperature(driverSeat, c.toFloat(), TemperatureUnit.CELSIUS,
                { _, v -> if (v != null) onApplied(v.toDouble()) else onError("적용 값 없음") }, { onError(reason(it)) })
        }.onFailure { onError(it.message ?: "호출 실패") }
    }

    override fun setSeatVent(on: Boolean, onApplied: (Int) -> Unit, onError: (String) -> Unit) {
        runCatching {
            vehicle.getSeat().setHvacSeatVentilation(driverSeat, if (on) SignalMapping.SEAT_LEVEL_ON else SignalMapping.SEAT_LEVEL_OFF,
                { _, v -> if (v != null) onApplied(v) else onError("적용 값 없음") }, { onError(reason(it)) })
        }.onFailure { onError(it.message ?: "호출 실패") }
    }

    override fun setSeatHeat(on: Boolean, onApplied: (Int) -> Unit, onError: (String) -> Unit) {
        runCatching {
            vehicle.getSeat().setHvacSeatTemperature(driverSeat, if (on) SignalMapping.SEAT_LEVEL_ON else SignalMapping.SEAT_LEVEL_OFF,
                { _, v -> if (v != null) onApplied(v) else onError("적용 값 없음") }, { onError(reason(it)) })
        }.onFailure { onError(it.message ?: "호출 실패") }
    }
}
