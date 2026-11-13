package app.commadrive.core

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * 추천 엔진 v2 — "어디서 서나"를 정한다. "서야 하나"는 EnergyEstimator 가 먼저 정한다.
 * `src/lib/core/engine.ts` 의 거울.
 *
 * 규칙 기반이다. AI 를 쓰지 않는 이유는 셋이다:
 *  1. 왜 그 장소를 골랐는지 **설명할 수 있어야** 한다 (화면에도 띄우고 심사에서도 답해야 한다)
 *  2. 학습시킬 데이터가 없다 — 시연 경로 하나의 후보 15~30곳이 전부다
 *  3. 규칙은 **단위 테스트로 증명**된다. 그 테스트가 곧 "작동한다"는 근거다
 *
 *     Score(p) = Σ(wᵢ · sᵢ(p)) / Σwᵢ   (각 sᵢ 는 0~100)
 */
object Weights {
    /** 경로에서 멀어질수록 쓸모가 급격히 준다 */
    const val DETOUR = 35
    /** 선호 시설을 얼마나 덮나 (필수는 이미 배제 조건) */
    const val AMENITY = 25
    /** 충전 속도 — 충전이 필요할 때만 켜진다 */
    const val CHARGER = 20
    /** 휴식 간격에 맞는 위치인가 */
    const val TIMING = 10
    /** 정보를 믿을 수 있나 — 작지만 0 이 아니다 */
    const val CONFIDENCE = 10
}

/**
 * 에너지 적합성 — "거기까지 갈 수 있나", "거기서 충전하면 끝까지 가나".
 * 급속은 80% 부터 느려지고, 후보에 닿을 때 8% 는 남겨 둔다 (10→80 충전이 가장 효율적인 구간).
 */
data class Feasibility(
    val batteryPct: Double,
    /** 1km 당 소비 % — EnergyEstimator.pctPerKm */
    val pctPerKm: Double,
    /** 도착 시 남겨야 하는 것 = 대기 소비 + 최소 잔량 (%) */
    val needAtArrivalPct: Double,
    val chargeTargetPct: Double = CHARGE_TARGET_PCT,
    val safetyPct: Double = SAFETY_PCT,
) {
    companion object {
        const val CHARGE_TARGET_PCT = 80.0
        const val SAFETY_PCT = 8.0

        /** 화면·시연이 같은 값을 넘기게 — 대기 소비는 EnergyEstimator 가 센 것을 그대로 받는다 */
        fun of(v: VehicleSnapshot, waitPct: Double, minReservePct: Double) =
            Feasibility(v.batteryPct, EnergyEstimator.pctPerKm(v), waitPct + minReservePct)
    }
}

/** UNREACHABLE: 거기까지 못 간다 · ONE_STOP: 거기서 충전하면 끝까지 간다 · MORE_STOPS: 가긴 가지만 한 번 더 서야 한다 */
/**
 * ONE_STOP 보수적 추정(주행 +12%)으로도 끝까지 · ONE_STOP_LIKELY 평균으로는 가지만 보수적으로는 모자랄 수 있음
 * MORE_STOPS 한 번 더 서야 함 · UNREACHABLE 지금 배터리로 못 감. engine.ts 의 거울
 */
enum class ReachableState { UNREACHABLE, ONE_STOP, ONE_STOP_LIKELY, MORE_STOPS }

private fun ReachableState.isOneStop() = this == ReachableState.ONE_STOP || this == ReachableState.ONE_STOP_LIKELY

data class RankInput(
    val plan: TripPlan,
    /** 출발지로부터 지금까지 온 경로상 거리(km) — 뒤에 있는 후보는 뺀다 */
    val traveledKm: Double,
    /** EnergyEstimator 가 정한 것 — true 면 충전기 없는 곳은 후보가 아니다 */
    val needsCharge: Boolean,
    /** 마지막 휴식 이후 주행 시간(분) — 타이밍 점수 */
    val tripMinutes: Int,
    /** 없으면(혼자 테스트할 때 등) 시설·거리만으로 고른다 */
    val feasibility: Feasibility? = null,
)

data class ScoreBreakdown(
    val detour: Int,
    val amenity: Int,
    val charger: Int,
    val timing: Int,
    val confidence: Int,
    val total: Int,
    /** 충전 불필요 여정에서는 CHARGER 가중치를 빼고 평균한다 */
    val chargerCounted: Boolean,
)

class RecommendationEngine(
    /** 이보다 멀리 벗어나는 후보는 점수를 매기기 전에 버린다 */
    private val maxDetourKm: Double = 10.0,
    /** 급속충전 상한으로 보는 값 — 이 이상이면 100점 */
    private val fastChargerKw: Int = 200,
) {

    /** 후보를 걸러 점수를 매기고 **상위 N개만** — 기본 3. 많을수록 운전자가 화면을 오래 본다 */
    fun rank(candidates: List<RestStop>, input: RankInput, limit: Int = 3): List<RankedRestStop> {
        val needs = needsOf(input.plan.passengers)
        var pool = candidates.filter { survivesHardFilter(it, input, needs.required) }
        /*
         * 충전이 필요한 여정이면 **갈 수 있는 곳**만 남기고, 그중 **거기서 충전하면 끝까지 가는 곳**이
         * 하나라도 있으면 그것만 남긴다. 시설 점수가 좋다고 70km 앞에서 세우면 남은 330km 를 또
         * 못 간다 — 사람은 "한 번만 서고 싶다". 하나도 없을 때만 갈 수 있는 곳 전부로 돌아간다.
         */
        if (input.needsCharge && input.feasibility != null) {
            val reachable = pool.filter { reachableState(it, input) != ReachableState.UNREACHABLE }
            val oneStop = reachable.filter { reachableState(it, input).isOneStop() }
            pool = oneStop.ifEmpty { reachable }
        }
        return pool
            .map { score(it, input, needs) }
            .sortedWith(compareByDescending<RankedRestStop> { it.score }.thenBy { it.stop.name })
            .take(limit)
    }

    data class Exclusion(val stop: RestStop, val reason: String)

    /** **왜 빠졌나** — 추천 목록에 없는 후보마다 첫 번째 탈락 이유. engine.ts excluded() 의 거울 */
    fun excluded(candidates: List<RestStop>, input: RankInput): List<Exclusion> {
        val needs = needsOf(input.plan.passengers)
        val survivors = candidates.filter { survivesHardFilter(it, input, needs.required) }
        val oneStopExists = input.needsCharge && input.feasibility != null && survivors.any { reachableState(it, input).isOneStop() }
        val out = mutableListOf<Exclusion>()
        for (stop in candidates) {
            if (stop.routeKm <= input.traveledKm) continue
            val missing = needs.required.filter { it !in stop.amenities }
            if (missing.isNotEmpty()) { out += Exclusion(stop, "필수 시설 없음: " + missing.joinToString(", ") { it.label }); continue }
            if (input.needsCharge && (stop.chargerKw == null || stop.chargerKw <= 0)) { out += Exclusion(stop, "충전기 없음(또는 미확인)"); continue }
            val detour = stop.detourKm
            if (detour == null) { out += Exclusion(stop, "경로 이탈 거리 미상"); continue }
            if (detour > maxDetourKm) { out += Exclusion(stop, "경로에서 " + fmtKm(detour) + "km 이탈 (" + maxDetourKm.toInt() + "km 초과)"); continue }
            if (input.needsCharge && input.feasibility != null) {
                when (reachableState(stop, input)) {
                    ReachableState.UNREACHABLE -> { out += Exclusion(stop, "지금 배터리로 못 감"); continue }
                    ReachableState.MORE_STOPS -> if (oneStopExists) { out += Exclusion(stop, "충전해도 한 번 더 서야 함"); continue }
                    ReachableState.ONE_STOP, ReachableState.ONE_STOP_LIKELY -> {}
                }
            }
        }
        return out
    }

    fun reachableState(stop: RestStop, input: RankInput): ReachableState {
        val f = input.feasibility ?: return ReachableState.ONE_STOP
        val toStop = (stop.routeKm - input.traveledKm) * f.pctPerKm
        if (toStop > f.batteryPct - f.safetyPct) return ReachableState.UNREACHABLE
        val restKm = input.plan.routeKm - stop.routeKm
        val after = restKm * f.pctPerKm + f.needAtArrivalPct
        if (after > f.chargeTargetPct) return ReachableState.MORE_STOPS
        val afterPessimistic = restKm * f.pctPerKm * (1 + EnergyEstimator.DRIVE_UNCERTAINTY) + f.needAtArrivalPct
        return if (afterPessimistic <= f.chargeTargetPct) ReachableState.ONE_STOP else ReachableState.ONE_STOP_LIKELY
    }

    /**
     * 점수를 매길 가치조차 없는 후보를 먼저 버린다.
     * 필수 시설과 충전기는 **가중치로 깎지 않고 배제한다** — "화장실 필수"인 가족에게
     * 화장실 없는 곳을 1위로 올리면 점수가 아무리 정교해도 그 추천은 틀렸다.
     */
    private fun survivesHardFilter(stop: RestStop, input: RankInput, required: Set<Amenity>): Boolean {
        if (stop.routeKm <= input.traveledKm) return false // 이미 지나왔다
        if (!stop.amenities.containsAll(required)) return false
        if (input.needsCharge && (stop.chargerKw == null || stop.chargerKw <= 0)) return false
        val detour = stop.detourKm ?: return false // 얼마나 벗어나는지 모르면 추천하지 않는다
        return detour <= maxDetourKm
    }

    fun breakdown(stop: RestStop, input: RankInput): ScoreBreakdown {
        val needs = needsOf(input.plan.passengers)
        val detour = detourScore(stop)
        val amenity = amenityScore(stop, needs.preferred)
        val charger = chargerScore(stop)
        val timing = timingScore(stop, input)
        val confidence = confidenceScore(stop)

        val chargerCounted = input.needsCharge
        val wSum = Weights.DETOUR + Weights.AMENITY + (if (chargerCounted) Weights.CHARGER else 0) + Weights.TIMING + Weights.CONFIDENCE
        val total = floor(
            (Weights.DETOUR * detour +
                Weights.AMENITY * amenity +
                (if (chargerCounted) Weights.CHARGER * charger else 0) +
                Weights.TIMING * timing +
                Weights.CONFIDENCE * confidence).toDouble() / wSum,
        ).toInt()
        return ScoreBreakdown(detour, amenity, charger, timing, confidence, total, chargerCounted)
    }

    private fun score(stop: RestStop, input: RankInput, needs: Needs): RankedRestStop {
        val unmet = needs.preferred.filter { it !in stop.amenities }
        return RankedRestStop(stop, breakdown(stop, input).total, explain(stop, input, needs), unmet)
    }

    /** 0km → 100, maxDetourKm → 0. 선형 */
    private fun detourScore(stop: RestStop): Int {
        val d = stop.detourKm ?: return 0
        return floor((1 - (d / maxDetourKm).coerceIn(0.0, 1.0)) * 100).toInt()
    }

    /** 선호 시설 커버율. 선호가 없으면(혼자) 시설 가짓수로, 상한을 둔다 */
    private fun amenityScore(stop: RestStop, preferred: Set<Amenity>): Int {
        if (preferred.isEmpty()) return minOf(stop.amenities.size * 100 / 6, 100)
        val matched = preferred.count { it in stop.amenities }
        return matched * 100 / preferred.size
    }

    /** kW 를 fastChargerKw 기준 선형. 충전기 없으면 0 (충전 필요 여정에선 어차피 배제됨) */
    private fun chargerScore(stop: RestStop): Int {
        val kw = stop.chargerKw ?: return 0
        return floor(minOf(kw.toDouble() / fastChargerKw, 1.0) * 100).toInt()
    }

    /**
     * 이 후보에 **도착할 즈음**이 쉴 때인가. 후보까지 남은 거리를 시간으로 바꿔(평균 80km/h 가정)
     * 지금 주행 시간에 더한 뒤 휴식 간격과 견준다. 간격 근처면 100, 멀면 깎는다.
     */
    private fun timingScore(stop: RestStop, input: RankInput): Int {
        val minutesToStop = (stop.routeKm - input.traveledKm) / 80.0 * 60.0
        val atArrival = input.tripMinutes + minutesToStop
        val target = input.plan.breakIntervalMinutes.toDouble()
        val gap = abs(atArrival - target)
        val half = max(target / 2.0, 1.0)
        return floor((1 - (gap / half).coerceIn(0.0, 1.0)) * 100).toInt()
    }

    private fun confidenceScore(stop: RestStop): Int =
        when (stop.confidence) { DataConfidence.VERIFIED -> 100; DataConfidence.UNKNOWN -> 40 }

    /** 화면에 그대로 띄울 이유. "내비 휴게소 검색과 뭐가 다르냐"에 답하는 자리 */
    private fun explain(stop: RestStop, input: RankInput, needs: Needs): String {
        val parts = mutableListOf<String>()
        if (needs.required.isNotEmpty()) parts += "필수 시설 ${needs.required.size}개 모두 충족"
        if (needs.preferred.isNotEmpty()) {
            val matched = needs.preferred.count { it in stop.amenities }
            parts += "선호 ${needs.preferred.size}개 중 ${matched}개"
        }
        if (input.needsCharge && stop.chargerKw != null) parts += "급속 ${stop.chargerKw}kW"
        input.feasibility?.takeIf { input.needsCharge }?.let { f ->
            val used = (stop.routeKm - input.traveledKm) * f.pctPerKm
            val atStop = max((f.batteryPct - used).roundToInt(), 0)
            val atStopPess = max((f.batteryPct - used * (1 + EnergyEstimator.DRIVE_UNCERTAINTY)).roundToInt(), 0)
            parts += if (atStopPess < f.safetyPct) "도착 시 약 ${atStop}%(보수적 ${atStopPess}%)" else "도착 시 약 ${atStop}%"
            parts += when (reachableState(stop, input)) {
                ReachableState.ONE_STOP -> "보수적으로도 한 번 충전으로 도착"
                ReachableState.ONE_STOP_LIKELY -> "한 번 충전 예상 · 추가 충전 가능성"
                else -> "충전해도 한 번 더 서야 함"
            }
        }
        stop.detourKm?.let { parts += "경로에서 ${fmtKm(it)}km" }
        // 우회 '시간'은 재계산에 성공했을 때만 (CLAUDE.md 정책 2)
        stop.detourMinutes?.let { parts += "추가 ${it}분" }
        if (stop.confidence == DataConfidence.UNKNOWN) parts += "정보 미확인"
        return parts.joinToString(" · ")
    }

    private fun fmtKm(v: Double): String =
        if (v < 10) (floor(v * 10) / 10).toString().removeSuffix(".0") else floor(v).toInt().toString()

    companion object {
        fun unmetLabel(unmet: List<Amenity>): String =
            if (unmet.isEmpty()) "선호 시설 모두 있음" else unmet.joinToString(", ") { it.label } + " 없음"
    }
}
