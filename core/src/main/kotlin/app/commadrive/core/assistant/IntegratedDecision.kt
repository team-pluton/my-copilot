package app.commadrive.core.assistant

import app.commadrive.core.Amenity
import app.commadrive.core.DataConfidence
import app.commadrive.core.EnergyEstimator
import app.commadrive.core.Feasibility
import app.commadrive.core.GeoPoint
import app.commadrive.core.RankInput
import app.commadrive.core.ReachableState
import app.commadrive.core.RecommendationEngine
import app.commadrive.core.RestStop
import app.commadrive.core.TripPlan
import app.commadrive.core.VehicleSnapshot
import app.commadrive.core.needsOf

/**
 * V6 통합 판단 — `src/lib/assistant/integrated-decision.ts` 의 거울. 왜 이 순서인지·왜 rank() 를 쓰지 않는지는 그쪽 주석.
 * 차량 · 충전 인프라 · 경로 · 일행 조건을 결정 하나로. 필수 조건이 먼저고 다른 점수로 상쇄되지 않는다.
 */
enum class FacilityState { CONFIRMED, ABSENT, UNKNOWN }
data class FacilityFact(val state: FacilityState, val evidence: DataEvidence, val source: String)

data class CorridorStop(
    val id: String,
    val name: String,
    val lat: Double?,
    val lon: Double?,
    val routeKm: Double,
    val routeKmEvidence: DataEvidence,
    val stationIds: List<String>,
    val facilities: Map<Amenity, FacilityFact>,
    val detourMinutes: Int? = null,
)

data class ChargerFeed(val availability: FactAvailability, val errorReason: String?, val records: List<ChargerRecord>)

data class DecisionInput(
    val powertrain: Powertrain,
    val vehicle: Fact<VehicleEnergy>,
    val snapshot: VehicleSnapshot,
    val plan: TripPlan,
    val traveledKm: Double,
    val connector: Connector,
    val stops: List<CorridorStop>,
    val chargers: ChargerFeed,
    val now: Long,
    val rejectedStopIds: List<String> = emptyList(),
)

data class StopCandidate(
    val stopId: String,
    val name: String,
    val lat: Double?,
    val lon: Double?,
    val routeKm: Double,
    val routeKmEvidence: DataEvidence,
    val reach: ReachableState,
    val arrivalSocRange: Pair<Double, Double>,
    val marginAfterChargePct: Double,
    val chargeMinutes: Int?,
    val station: StationAssessment,
    val busyNearby: Boolean,
    val familyConfirmed: List<Amenity>,
    val familyUnknown: List<Amenity>,
    val detourMinutes: Int?,
    val reasons: List<String>,
)

enum class DecisionKind { NOT_APPLICABLE, CANNOT_JUDGE, NO_CHARGE_NEEDED, RECOMMEND, NO_RELIABLE }
data class ExcludedStop(val stopId: String, val name: String, val reason: String)

data class JourneyDecision(
    val kind: DecisionKind,
    val headline: String,
    val detail: String,
    val shortfallPct: Double? = null,
    val shortfallRange: Pair<Double, Double>? = null,
    val top: StopCandidate? = null,
    val alternatives: List<StopCandidate> = emptyList(),
    val needsCheck: List<StopCandidate> = emptyList(),
    val excluded: List<ExcludedStop> = emptyList(),
    val usedChargerData: Boolean = false,
)

data class ReplanNotice(val changed: Boolean, val message: String?)
sealed interface DecisionSurface {
    data object Full : DecisionSurface
    data class OneLine(val line: String) : DecisionSurface
}

object IntegratedDecision {
    /** 권할 곳이 없을 때 — 원인을 섞지 않는다: 연결 실패 ≠ 오래된 정보 ≠ 조건 미충족 ≠ 정상 조회 후 후보 없음 (integrated-decision.ts noReliableHeadline) */
    fun noReliableHeadline(feedFailed: Boolean, checkReasons: List<String>, excludedReasons: List<String> = emptyList()): String = when {
        feedFailed -> "충전소 정보를 확인하지 못했어요"
        checkReasons.isNotEmpty() && checkReasons.all { it.contains("오래") } -> "충전소 상태를 다시 확인해야 해요"
        checkReasons.isNotEmpty() -> "지금 조건에서는 충전소를 추천하기 어려워요"
        excludedReasons.isNotEmpty() && excludedReasons.all { it == UNREACHABLE_REASON } -> "현재 배터리로 도달 가능한 후보가 확인되지 않았어요"
        else -> "현재 조건에 맞는 충전소를 찾지 못했어요"
    }
    private const val UNREACHABLE_REASON = "지금 배터리로 닿지 못할 수 있어요"

    const val STATUS_MEANINGFUL_KM = 40.0
    private val engine = RecommendationEngine()

    /** JS Math.round 와 같게 — 화면 숫자가 두 앱에서 달라지지 않게 */
    private fun fmtShort(p: Double, r: Pair<Double, Double>) = "약 ${Math.round(p)}%p(${Math.round(r.first)}~${Math.round(r.second)}%p) 부족 추정"
    private fun facility(s: CorridorStop, a: Amenity) = s.facilities[a]?.state ?: FacilityState.UNKNOWN

    private fun energyOf(powerInput: DecisionInput): Pair<VehicleSnapshot, app.commadrive.core.EnergyPlan> {
        val v = powerInput.vehicle.value!!
        val snapshot = powerInput.snapshot.copy(batteryPct = v.socPct, batteryKwh = v.capacityKwh)
        val remainingKm = maxOf(powerInput.plan.routeKm - powerInput.traveledKm, 0.0)
        return snapshot to EnergyEstimator.estimate(powerInput.plan.copy(routeKm = remainingKm), snapshot)
    }

    fun needsChargerLookup(input: DecisionInput): Boolean {
        if (input.powertrain !in Fresh.ENERGY_POWERTRAINS || input.vehicle.value == null) return false
        return energyOf(input).second.needsCharge
    }

    fun decide(input: DecisionInput): JourneyDecision {
        if (input.powertrain !in Fresh.ENERGY_POWERTRAINS) return JourneyDecision(DecisionKind.NOT_APPLICABLE, "이 차량은 충전 판단 대상이 아니에요", "충전 판단은 전기차 특화 기능이에요. 동력원이 확인되면 다시 볼게요")
        if (input.vehicle.value == null) return JourneyDecision(DecisionKind.CANNOT_JUDGE, "지금은 충전 계획을 말할 수 없어요", input.vehicle.meta.reliabilityReason.ifEmpty { "차량 정보를 받지 못했어요" })

        val (snapshot, energy) = energyOf(input)
        if (!energy.needsCharge) return JourneyDecision(DecisionKind.NO_CHARGE_NEEDED, "충전 없이 갈 수 있을 것으로 추정돼요", energy.message, energy.shortfallPct, energy.shortfallRange)

        val needs = needsOf(input.plan.passengers)
        val perKm = EnergyEstimator.pctPerKm(snapshot)
        val needAtArrival = energy.waitPct + input.plan.minReservePct
        val target = Feasibility.CHARGE_TARGET_PCT
        val safety = Feasibility.SAFETY_PCT
        val rankInput = RankInput(input.plan, input.traveledKm, true, 0, Feasibility(snapshot.batteryPct, perKm, needAtArrival))

        val excluded = mutableListOf<ExcludedStop>()
        val usable = mutableListOf<StopCandidate>()
        val check = mutableListOf<StopCandidate>()
        for (s in input.stops) {
            if (s.routeKm <= input.traveledKm) continue
            if (s.id in input.rejectedStopIds) { excluded += ExcludedStop(s.id, s.name, "이번 이동에서 선택하지 않기로 했어요"); continue }

            val toStop = (s.routeKm - input.traveledKm) * perKm
            val reach = engine.reachableState(RestStop(s.id, s.name, GeoPoint(0.0, 0.0), s.routeKm, emptySet(), null, null, null, null, DataConfidence.UNKNOWN, null, ""), rankInput)
            val lo = snapshot.batteryPct - toStop * (1 + EnergyEstimator.DRIVE_UNCERTAINTY)
            val hi = snapshot.batteryPct - toStop * (1 - EnergyEstimator.DRIVE_UNCERTAINTY)
            if (reach == ReachableState.UNREACHABLE || lo < safety) { excluded += ExcludedStop(s.id, s.name, UNREACHABLE_REASON); continue }

            val absent = needs.required.filter { facility(s, it) == FacilityState.ABSENT }
            if (absent.isNotEmpty()) { excluded += ExcludedStop(s.id, s.name, "필수 시설 없음: ${absent.joinToString(", ") { it.label }}"); continue }

            val station = if (input.chargers.availability == FactAvailability.OK) ChargerData.assess(input.chargers.records, s.stationIds, input.connector, input.now) else assessFailed(s.stationIds, input.chargers)
            if (station.verdict == StationVerdict.EXCLUDED) { excluded += ExcludedStop(s.id, s.name, station.reason); continue }

            val requiredUnknown = needs.required.filter { facility(s, it) == FacilityState.UNKNOWN }
            val wanted = needs.required + needs.preferred
            val base = StopCandidate(
                s.id, s.name, s.lat, s.lon, s.routeKm, s.routeKmEvidence, reach, lo to hi,
                target - (input.plan.routeKm - s.routeKm) * perKm - needAtArrival,
                station.maxKw?.let { EnergyEstimator.chargeMinutes(maxOf(hi, 0.0), target, snapshot.batteryKwh, Math.round(it).toInt()) },
                station,
                s.routeKm - input.traveledKm <= STATUS_MEANINGFUL_KM && station.availableCount == 0 && station.chargingCount > 0,
                wanted.filter { facility(s, it) == FacilityState.CONFIRMED }, wanted.filter { facility(s, it) == FacilityState.UNKNOWN },
                s.detourMinutes, emptyList(),
            )
            when {
                requiredUnknown.isNotEmpty() -> check += base.copy(reasons = listOf("필수 시설 미확인: ${requiredUnknown.joinToString(", ") { it.label }}"))
                station.verdict == StationVerdict.NEEDS_CHECK -> check += base.copy(reasons = listOf(station.reason))
                else -> usable += base
            }
        }

        val oneStop = usable.filter { it.reach != ReachableState.MORE_STOPS }
        val pool = oneStop.ifEmpty { usable }
        if (oneStop.isNotEmpty()) usable.filter { it.reach == ReachableState.MORE_STOPS }.forEach { excluded += ExcludedStop(it.stopId, it.name, "충전해도 한 번 더 서야 해요") }
        val ordered = pool.sortedWith(CANDIDATE_ORDER).map { it.copy(reasons = reasonsOf(it)) }
        val checked = check.sortedWith(CANDIDATE_ORDER)

        if (ordered.isEmpty()) {
            val failed = input.chargers.availability != FactAvailability.OK
            return JourneyDecision(
                DecisionKind.NO_RELIABLE, noReliableHeadline(failed, checked.map { it.reasons.firstOrNull() ?: "" }, excluded.map { it.reason }),
                when {
                    failed -> "충전소 상태를 받지 못했어요 · 도착 후 대기까지 세면 ${fmtShort(energy.shortfallPct, energy.shortfallRange)}"
                    checked.isNotEmpty() -> "후보는 있지만 확인이 더 필요해요 · 내비게이션에서 직접 확인해 주세요"
                    else -> "닿을 수 있는 후보를 찾지 못했어요 · 내비게이션에서 직접 확인해 주세요"
                },
                energy.shortfallPct, energy.shortfallRange, needsCheck = checked.take(3), excluded = excluded, usedChargerData = true,
            )
        }
        val top = ordered.first()
        return JourneyDecision(
            DecisionKind.RECOMMEND, "${top.name}에서 충전하며 쉬어 가세요",
            "도착 후 대기까지 세면 ${fmtShort(energy.shortfallPct, energy.shortfallRange)}",
            energy.shortfallPct, energy.shortfallRange, top, ordered.drop(1).take(2), checked.take(2), excluded, true,
        )
    }

    private fun assessFailed(stationIds: List<String>, feed: ChargerFeed) = StationAssessment(
        stationIds, StationVerdict.NEEDS_CHECK, feed.errorReason?.let { "충전소 상태 조회 실패: $it" } ?: "충전소 상태를 받지 못했어요",
        freshness = FactFreshness.UNKNOWN, retrievedAt = null, evidence = DataEvidence.UNKNOWN,
    )

    private val REACH_RANK = mapOf(ReachableState.ONE_STOP to 0, ReachableState.ONE_STOP_LIKELY to 1, ReachableState.MORE_STOPS to 2, ReachableState.UNREACHABLE to 3)
    /** 점수 합산이 아니라 사전식 — 뒤 기준이 앞 기준을 뒤집지 못한다 */
    val CANDIDATE_ORDER: Comparator<StopCandidate> = compareBy<StopCandidate> { if (it.busyNearby) 1 else 0 }
        .thenBy { REACH_RANK.getValue(it.reach) }
        .thenBy { if (it.station.availableCount > 0) 0 else 1 }
        .thenBy { it.station.freshness.ordinal }
        .thenByDescending { it.familyConfirmed.size }
        .thenByDescending { it.station.maxKw ?: -1.0 }
        .thenByDescending { it.station.availableCount }
        .thenBy { it.routeKm }
        .thenBy { it.stopId }

    private fun reasonsOf(c: StopCandidate): List<String> = buildList {
        add(when (c.reach) {
            ReachableState.ONE_STOP -> "충전 후 목적지까지 갈 수 있을 것으로 추정돼요"
            ReachableState.ONE_STOP_LIKELY -> "충전 후 목적지까지 갈 것으로 보이지만 여유가 적어요"
            else -> "목적지까지 한 번 더 충전이 필요할 수 있어요"
        })
        add(c.station.reason)
        if (c.familyConfirmed.isNotEmpty()) add("확인된 시설: ${c.familyConfirmed.joinToString(", ") { it.label }}")
        if (c.familyUnknown.isNotEmpty()) add("미확인: ${c.familyUnknown.joinToString(", ") { it.label }}")
    }

    fun evidenceLine(c: StopCandidate, vehicle: Fact<VehicleEnergy>) = "배터리 ${vehicle.meta.evidence.label} · 충전기 ${c.station.evidence.label} · 위치 ${c.routeKmEvidence.label}"

    /** 선택이 바뀔 때만 다시 묻는다. 이유는 새 판단이 적은 사실만 옮긴다 */
    fun replanNotice(prev: JourneyDecision, next: JourneyDecision): ReplanNotice {
        val prevTop = prev.top?.stopId
        val nextTop = next.top?.stopId
        if (prev.kind == next.kind && prevTop == nextTop) return ReplanNotice(false, null)
        val before = prev.top ?: return ReplanNotice(prev.kind != next.kind, next.headline)
        val fate = next.excluded.firstOrNull { it.stopId == prevTop }?.reason ?: next.needsCheck.firstOrNull { it.stopId == prevTop }?.reasons?.firstOrNull()
        val lead = if (fate != null) "${before.name}: $fate" else "${before.name}보다 조건이 나은 곳이 있어요"
        if (next.kind == DecisionKind.RECOMMEND && next.top != null) return ReplanNotice(true, "$lead · 대신 권하는 곳: ${next.top.name}")
        return ReplanNotice(true, "$lead · ${next.headline}")
    }

    fun surface(d: JourneyDecision, parked: Boolean): DecisionSurface = when {
        parked -> DecisionSurface.Full
        d.kind == DecisionKind.RECOMMEND && d.top != null -> DecisionSurface.OneLine("충전·휴식 후보 ${d.top.name} · 정차 후 확인")
        d.kind == DecisionKind.NO_RELIABLE -> DecisionSurface.OneLine("충전 계획 확인 필요 · 정차 후 확인")
        else -> DecisionSurface.OneLine(d.headline)
    }

    fun canPickStop(d: JourneyDecision, stopId: String, parked: Boolean) = parked && (d.top?.stopId == stopId || d.alternatives.any { it.stopId == stopId })
}
