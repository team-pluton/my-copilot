package app.commadrive.core.assistant

import app.commadrive.core.EnergyEstimator
import app.commadrive.core.EnergyPlan
import app.commadrive.core.TripPlan
import app.commadrive.core.Verdict
import app.commadrive.core.VehicleSnapshot

/**
 * 에너지 판단 뒤의 선택지 — `src/lib/assistant/options.ts` 의 거울.
 * 쉼표 DRIVE 만약에 비교를 사용자 행동 선택지로 보여 준다. 자동으로 바꾸지 않는다 — 버튼은 대기 유형 바꾸기 · 후보 보기만.
 */
enum class EnergyOptionKey { AS_IS, WAIT_AWAY, WAIT_SHORTER, CHARGE_AT }
enum class EnergyOptionAction { SET_WAIT_AWAY, SHOW_STOPS }

data class EnergyOption(
    val key: EnergyOptionKey,
    val label: String,
    val status: EnergyStatus,
    val detail: String,
    val improves: Boolean,
    val action: EnergyOptionAction?,
    val note: String?,
)

data class ChargeCandidate(val name: String, val kmFromHere: Double)

object Options {
    const val CHARGE_TARGET = 80.0
    const val WAIT_STEP_MIN = 5
    const val WAIT_SEARCH_MAX_MIN = 600

    private val RANK = mapOf(EnergyStatus.SHORT to 0, EnergyStatus.CAUTION to 1, EnergyStatus.OK to 2, EnergyStatus.UNKNOWN to -1)

    private fun statusOf(e: EnergyPlan) = when (EnergyEstimator.verdictOf(e)) {
        Verdict.SHORT -> EnergyStatus.SHORT
        Verdict.TIGHT -> EnergyStatus.CAUTION
        else -> EnergyStatus.OK
    }

    /** 충전 경유지에서 80% 까지 충전했다고 보고 남은 길을 다시 센다 — 선택지와 "경유지를 포함한 계획" 판정이 같은 식 */
    fun planViaStop(plan: TripPlan, v: VehicleSnapshot, waitMode: WaitMode, kmFromHere: Double): Pair<EnergyPlan, Double> {
        val after = plan.copy(routeKm = maxOf(plan.routeKm - kmFromHere, 0.0), naviArrivalSocPct = null)
        val soc = maxOf(CHARGE_TARGET, v.batteryPct - EnergyEstimator.pctPerKm(v) * kmFromHere)
        return Wait.energyFor(after, v.copy(batteryPct = soc), waitMode) to soc
    }

    fun energyOptions(plan: TripPlan, v: VehicleSnapshot, waitMode: WaitMode, charge: ChargeCandidate?): List<EnergyOption> {
        val base = Wait.energyFor(plan, v, waitMode)
        val baseStatus = statusOf(base)
        if (baseStatus == EnergyStatus.OK) return emptyList()
        fun opt(key: EnergyOptionKey, label: String, e: EnergyPlan, soc: Double, action: EnergyOptionAction?, note: String?): EnergyOption {
            val s = statusOf(e)
            return EnergyOption(key, label, s, EnergyViews.of(e, soc, null).detail, RANK.getValue(s) > RANK.getValue(baseStatus), action, note)
        }
        val out = mutableListOf(opt(EnergyOptionKey.AS_IS, "지금 계획 그대로", base, v.batteryPct, null, null))
        val wait = plan.waitMinutesAfterArrival
        if (waitMode == WaitMode.IN_CAR && wait > 0 && v.hvacOn) {
            out += opt(EnergyOptionKey.WAIT_AWAY, "차를 두고 밖에서 기다리면", Wait.energyFor(plan, v, WaitMode.AWAY), v.batteryPct, EnergyOptionAction.SET_WAIT_AWAY, null)
        }
        if (waitMode == WaitMode.IN_CAR && wait >= 30) {
            out += opt(EnergyOptionKey.WAIT_SHORTER, "대기를 30분 줄이면", Wait.energyFor(plan.copy(waitMinutesAfterArrival = wait - 30), v, WaitMode.IN_CAR), v.batteryPct, null, "일정은 앱이 바꾸지 않습니다")
        }
        if (charge != null) {
            val (e, soc) = planViaStop(plan, v, waitMode, charge.kmFromHere)
            out += opt(EnergyOptionKey.CHARGE_AT, "${charge.name}에서 ${CHARGE_TARGET.toInt()}%까지 충전하면", e, soc, EnergyOptionAction.SHOW_STOPS, null)
        }
        return out
    }

    /** 차 안에서 기다릴 수 있는 시간 — null: 차 밖 대기 · -1: 대기 없이도 충분 아님 · 600: 그 이상 */
    fun maxWaitWithoutCharge(plan: TripPlan, v: VehicleSnapshot, mode: WaitMode): Int? {
        if (mode == WaitMode.AWAY) return null
        fun ok(w: Int) = statusOf(Wait.energyFor(plan.copy(waitMinutesAfterArrival = w), v, WaitMode.IN_CAR)) == EnergyStatus.OK
        if (!ok(0)) return -1
        var best = 0
        var w = WAIT_STEP_MIN
        while (w <= WAIT_SEARCH_MAX_MIN) { if (!ok(w)) break; best = w; w += WAIT_STEP_MIN }
        return best
    }

    fun waitLimitLine(limit: Int?, waitNow: Int): String? = when {
        limit == null -> "차를 두고 다녀오면 대기 시간은 에너지에 영향이 없습니다 (가정)"
        limit < 0 -> null
        limit >= WAIT_SEARCH_MAX_MIN -> "차 안에서 10시간 넘게 기다려도 충분합니다 (추정)"
        limit >= waitNow -> "차 안 대기는 앞으로 약 ${limit}분까지 충전 없이 됩니다 (추정 범위 기준)"
        else -> "차 안 대기가 약 ${limit}분을 넘으면 충전이 필요해집니다 (추정 범위 기준) · 지금 계획 ${waitNow}분"
    }
}
