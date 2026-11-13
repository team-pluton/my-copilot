package app.commadrive.core.assistant

import app.commadrive.core.EnergyEstimator
import app.commadrive.core.EnergyPlan
import app.commadrive.core.Verdict

/**
 * 에너지 숫자의 **의미**를 나눈다 — `src/lib/assistant/energy-view.ts` 의 거울.
 *
 * 쉼표 DRIVE 엔진의 arrivalPct 는 "모자라면 음수"인 계산값이다. 화면에 그대로 쓰면 "−27%" 가 되어 배터리가 음수로 읽힌다.
 * 현재 잔량 · 예상 도착 잔량(0 미만은 0) · 추가 필요량(%p, 용량을 알면 kWh) · 상태를 나눠서 내보낸다. 엔진 값은 바꾸지 않는다.
 */
enum class EnergyStatus(val label: String) { OK("충분"), CAUTION("주의"), SHORT("부족"), UNKNOWN("계산 불가") }

data class EnergyView(
    val status: EnergyStatus,
    val currentSocPct: Int?,
    val arrivalSocPct: Int?,
    val depletesBeforeArrival: Boolean,
    val requiredPctPoints: Int,
    val requiredRange: Pair<Int, Int>?,
    val requiredKwh: Double?,
    /** 한 번 충전으로 더할 수 있는 양(배터리 한 통 = 100%p)보다 더 필요한가 */
    val exceedsFullCharge: Boolean,
    val headline: String,
    val detail: String,
)

/** 무엇을 기준으로 "충분"한가 — 편도/왕복 · 고른 충전 경유지를 포함한 계획인가 (energy-view.ts EnergyContext) */
data class EnergyContext(val roundTrip: Boolean = false, val viaWaypoint: Boolean = false, val minReservePct: Double? = null)

object EnergyViews {
    private fun r0(x: Double) = Math.round(x).toInt()
    private fun r1(x: Double) = Math.round(x * 10) / 10.0
    private fun clampPct(x: Double) = r0(x.coerceIn(0.0, 100.0))

    fun of(plan: EnergyPlan?, currentSocPct: Double?, batteryKwh: Double?, ctx: EnergyContext = EnergyContext()): EnergyView {
        if (plan == null || currentSocPct == null) {
            return EnergyView(
                EnergyStatus.UNKNOWN, currentSocPct?.let { clampPct(it) }, null, false, 0, null, null, false,
                "최신 차량 정보가 없어 계획을 확인할 수 없어요", "차량 값을 받지 못해 추정하지 않습니다",
            )
        }
        val status = when (EnergyEstimator.verdictOf(plan)) {
            Verdict.SHORT -> EnergyStatus.SHORT
            Verdict.TIGHT -> EnergyStatus.CAUTION
            Verdict.OK -> EnergyStatus.OK
        }
        val required = r0(maxOf(plan.shortfallPct, 0.0))
        val hi = r0(maxOf(plan.shortfallRange.second, 0.0))
        val range = if (hi > 0) r0(maxOf(plan.shortfallRange.first, 0.0)) to hi else null
        val kwh = if (batteryKwh != null && required > 0) r1(required * batteryKwh / 100) else null
        // 충전은 가는 길에 배터리가 줄어든 뒤 하므로 "지금 잔량에서 완충"이 기준이 아니다 — 한 번에 더할 수 있는 최대는 한 통(100%p)
        val exceeds = required > 100
        // 비관 추정에서 모자라면(CAUTION·SHORT) 머리말에 "충분"·"예상돼요"를 쓰지 않는다
        val headline = when {
            status == EnergyStatus.SHORT -> "충전 계획이 필요해요"
            status == EnergyStatus.CAUTION -> if (required > 0) "충전 없이는 모자랄 수 있어요" else "현재 조건에서는 충분할 수 있지만 여유가 크지 않아요"
            ctx.viaWaypoint -> "선택한 충전 경유지를 포함하면 계획을 마칠 수 있을 것으로 예상돼요"
            ctx.roundTrip -> "충전 없이 왕복할 수 있을 것으로 예상돼요"
            else -> "충전 없이 도착할 수 있을 것으로 예상돼요"
        }
        val reserve = ctx.minReservePct?.let { " · 최소 잔량 ${r0(it)}% 남기고 비관 추정까지" } ?: ""
        val detail = when {
            status == EnergyStatus.OK -> "${if (ctx.roundTrip) "귀가 후" else "도착"} 예상 잔량 약 ${r0(maxOf(plan.arrivalPct, 0.0))}%$reserve (추정)"
            required > 0 -> "예상 추가 필요량 약 ${required}%p" + (range?.let { " (추정 ${it.first}~${it.second}%p)" } ?: "") + (if (exceeds) " · 완충해도 모자랄 수 있음" else "")
            else -> "평균으로는 충분하지만 추정 범위에서 최대 약 ${hi}%p 모자랄 수 있음"
        }
        return EnergyView(status, clampPct(currentSocPct), clampPct(plan.arrivalPct), plan.arrivalPct < 0, required, range, kwh, exceeds, headline, detail)
    }
}
