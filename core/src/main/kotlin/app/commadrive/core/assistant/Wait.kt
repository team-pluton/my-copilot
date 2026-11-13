package app.commadrive.core.assistant

import app.commadrive.core.EnergyEstimator
import app.commadrive.core.EnergyPlan
import app.commadrive.core.TripPlan
import app.commadrive.core.VehicleSnapshot

/**
 * 대기 유형 · 차량 상태와 여정 상태 — `src/lib/assistant/wait.ts` 의 거울.
 * 차를 두고 다녀오는 대기는 대기 소비 0 으로 쉼표 DRIVE estimate 를 다시 부른다(새 계산 없음).
 * PARKED 는 차의 상태, "방문 중"은 사람의 상태 — 둘을 따로 돌려준다.
 */
enum class WaitMode(val label: String) { IN_CAR("차 안에서 기다림 · 공조 사용 가정"), AWAY("차를 두고 다녀옴") }

enum class VehicleStatus(val label: String) { MOVING("주행 중"), STOPPED("정지"), PARKED("주차"), UNKNOWN("확인 못 함") }

enum class TripStatus(val label: String) {
    NOT_STARTED("출발 전"), PREPARING("출발 준비"), DRIVING("이동 중"), APPROACHING("곧 도착"), STOPOVER("중간 정차"),
    ARRIVED("목적지 근처"), FINISHING("하차 준비"), STEPPED_OUT("잠시 내림"), WAITING_IN_CAR("차 안에서 대기"), VISITING("방문 중"),
    RETURNING("귀가 중"), COMPLETED("이동 완료"),
}

data class Status(val vehicle: VehicleStatus, val trip: TripStatus)

object Wait {
    fun energyFor(plan: TripPlan, v: VehicleSnapshot, mode: WaitMode): EnergyPlan {
        if (mode == WaitMode.IN_CAR || plan.waitMinutesAfterArrival == 0) return EnergyEstimator.estimate(plan, v)
        val r = EnergyEstimator.estimate(plan.copy(waitMinutesAfterArrival = 0), v)
        return r.copy(assumptions = r.assumptions.map { if (it.startsWith("도착 후 대기")) "도착 후 대기 ${plan.waitMinutesAfterArrival}분 · 차를 두고 밖에서 → 주차 중 공조 미사용 가정 (대기 중 다른 소비는 계산에 없음)" else it })
    }

    fun statusOf(j: JourneyState, motion: Motion, mode: WaitMode): Status {
        val vehicle = VehicleStatus.valueOf(motion.kind.name)
        val trip = when (j.phase) {
            JourneyPhase.NOT_STARTED -> TripStatus.NOT_STARTED
            JourneyPhase.PREPARING -> TripStatus.PREPARING
            JourneyPhase.DRIVING -> if (j.leg > 0) TripStatus.RETURNING else TripStatus.DRIVING
            JourneyPhase.APPROACHING -> TripStatus.APPROACHING
            JourneyPhase.PARKED -> if (j.atDestination) TripStatus.ARRIVED else TripStatus.STOPOVER
            JourneyPhase.FINISHING -> if (j.atDestination) TripStatus.FINISHING else TripStatus.STEPPED_OUT
            JourneyPhase.WAITING -> if (mode == WaitMode.AWAY) TripStatus.VISITING else TripStatus.WAITING_IN_CAR
            JourneyPhase.COMPLETED -> TripStatus.COMPLETED
        }
        return Status(vehicle, trip)
    }
}
