package app.commadrive.core.assistant

import app.commadrive.core.TripPlan

/**
 * 구간별 남은 에너지 계획 — `src/lib/assistant/trip.ts` 의 거울.
 * 가는 길: 남은 가는 길 + 남은 대기 + 돌아오는 길 전부(목적지에 도착해도 귀로 예산은 남는다) · 돌아오는 길: 남은 돌아오는 길만.
 */
data class LegPosition(val leg: Int, val traveledInLegKm: Double, val waitedMinutes: Int)

object Trip {
    const val RETURN_DESTINATION = "집 (귀가)"

    fun legsOf(plan: TripPlan) = if (plan.returnKm > 0) 2 else 1

    fun remainingPlan(plan: TripPlan, pos: LegPosition): TripPlan =
        if (pos.leg == 0) plan.copy(
            routeKm = maxOf(plan.routeKm - pos.traveledInLegKm, 0.0),
            waitMinutesAfterArrival = maxOf(plan.waitMinutesAfterArrival - pos.waitedMinutes, 0),
        )
        // 내비 도착 잔량 예측은 가는 길 목적지 기준이라 귀가 구간에는 쓰지 않는다
        else plan.copy(
            destinationName = RETURN_DESTINATION, routeKm = maxOf(plan.returnKm - pos.traveledInLegKm, 0.0),
            returnKm = 0.0, waitMinutesAfterArrival = 0, naviArrivalSocPct = null,
        )

    fun legRemainingKm(plan: TripPlan, pos: LegPosition) = maxOf((if (pos.leg == 0) plan.routeKm else plan.returnKm) - pos.traveledInLegKm, 0.0)
}
