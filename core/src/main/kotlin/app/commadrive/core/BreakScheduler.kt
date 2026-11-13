package app.commadrive.core

/**
 * 휴식 시점 — "지금 무엇을 해야 하나"를 한 값으로 돌려준다. `src/lib/core/scheduler.ts` 의 거울.
 *
 * v2 에서 "서야 하나"의 1차 판단은 EnergyEstimator 가 하고, 이건 **충전이 필요 없어도 쉬어야 할 때**를
 * 잡는다. 둘 중 먼저 오는 쪽이 정차를 부른다. 화면이 직접 분(分)을 비교하지 않게 한 값으로 돌려준다 —
 * 비교가 흩어지면 대시보드·주행중 모드·음성 안내가 서로 다른 시점에 다른 말을 한다.
 */
enum class BreakPhase(val label: String) {
    /** 아직 멀었다 — 평소 대시보드 */
    CRUISING("주행 중"),
    /** 곧이다 — 후보를 미리 찾아 둔다 (화면은 조용히) */
    PREFETCH("후보 미리 탐색"),
    /** 안내 직전 — 추천 카드를 준비한다 */
    READY("안내 준비"),
    /** 지금 권한다 — 음성 중심 */
    SUGGEST("휴식 권장"),
}

object BreakScheduler {
    /** 간격 대비 비율 — 분을 상수로 박으면 30분 간격을 고른 사람에겐 이미 지난 시점이 된다 */
    private const val PREFETCH_RATIO = 0.75
    private const val READY_RATIO = 0.92

    fun phaseOf(plan: TripPlan, v: VehicleSnapshot): BreakPhase {
        val ratio = v.tripMinutes.toDouble() / plan.breakIntervalMinutes
        return when {
            ratio >= 1.0 -> BreakPhase.SUGGEST
            ratio >= READY_RATIO -> BreakPhase.READY
            ratio >= PREFETCH_RATIO -> BreakPhase.PREFETCH
            else -> BreakPhase.CRUISING
        }
    }

    /** 다음 휴식까지 남은 분. 이미 지났으면 0 */
    fun minutesUntilBreak(plan: TripPlan, v: VehicleSnapshot): Int =
        (plan.breakIntervalMinutes - v.tripMinutes).coerceAtLeast(0)

    /** "나중에" — 간격의 1/4 뒤 (90분이면 22분). 무시하고 계속 띄우면 앱을 끈다 */
    fun snoozeMinutes(plan: TripPlan): Int = (plan.breakIntervalMinutes / 4).coerceAtLeast(5)
}
