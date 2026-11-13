package app.commadrive.core.assistant

/**
 * V6 Unified Journey Data — `src/lib/assistant/journey-fact.ts` 의 거울. 왜 값마다 메타를 붙이는지는 그쪽 주석.
 * 이름이 다른 것: TS Evidence → [DataEvidence], Freshness → [FactFreshness], Availability → [FactAvailability](이 패키지에 같은 이름의 다른 타입이 있다).
 */
enum class DataEvidence(val label: String) {
    VEHICLE("차량 정보"), LIVE_API("공공 API 조회"), CACHED("공공 API 저장값"), CURATED("수기 목록"), MOCK("시연 데이터"), UNKNOWN("미확인"),
}
enum class FactFreshness { FRESH, AGING, STALE, UNKNOWN }
enum class FactAvailability { OK, DENIED, NOT_CONNECTED, FAILED, NOT_SUPPORTED }

data class FactMeta(
    val source: String,
    val retrievedAt: Long?,
    val originalUpdatedAt: Long?,
    val evidence: DataEvidence,
    val freshness: FactFreshness,
    val reliabilityReason: String,
    val availability: FactAvailability,
    val errorReason: String?,
)
data class Fact<T>(val value: T?, val meta: FactMeta)

data class VehicleEnergy(val socPct: Double, val capacityKwh: Double)
data class VehicleEnergyRaw(val socPct: Double?, val capacityRaw: Double?, val readAt: Long?, val evidence: DataEvidence, val availability: FactAvailability)

object JourneyFact {
    const val FRESH_MINUTES = 10.0
    const val AGING_MINUTES = 30.0
    const val MIN_CAPACITY_KWH = 10.0
    const val MAX_CAPACITY_KWH = 250.0
    const val VEHICLE_STALE_MINUTES = 5.0

    /**
     * 시계 오차 보정 한도 — 조회 시각(서버·프록시 시계)이 '지금'(차량 시계)보다 이만큼까지 **앞서 있으면** 나이를 0 으로 본다.
     * E28(2026-11-11): 프록시 PC 가 차량보다 2초 빨라 방금 받은 충전소 상태가 전부 '오래됐어요'가 됐다.
     * **신선도 기준은 늘리지 않는다** — 미래로 찍힌 값만 보정하고, 과거 값의 나이는 그대로 잰다(오래된 정보가 새 정보가 되지 않는다). 더 앞서면 시계를 믿지 않는다 (journey-fact.ts)
     */
    const val CLOCK_SKEW_MINUTES = 5.0

    /** 받은 지 몇 분인가 — 시계 오차 보정만 한다. 한도를 넘게 미래면 null(모름) */
    fun ageMinutes(retrievedAt: Long, now: Long): Double? {
        val min = (now - retrievedAt) / 60_000.0
        return if (min < -CLOCK_SKEW_MINUTES) null else maxOf(min, 0.0)
    }

    fun freshnessOf(retrievedAt: Long?, now: Long): FactFreshness {
        if (retrievedAt == null) return FactFreshness.UNKNOWN
        val min = ageMinutes(retrievedAt, now) ?: return FactFreshness.UNKNOWN
        return when {
            min <= FRESH_MINUTES -> FactFreshness.FRESH
            min <= AGING_MINUTES -> FactFreshness.AGING
            else -> FactFreshness.STALE
        }
    }

    /** 용량 단위 변환의 유일한 자리 — 에뮬레이터는 Wh(77400), 출품 어댑터는 kWh 가정. 말이 안 되면 null(기본값으로 대신하지 않는다) */
    fun capacityToKwh(raw: Double?): Double? {
        if (raw == null || !raw.isFinite()) return null
        if (raw in MIN_CAPACITY_KWH..MAX_CAPACITY_KWH) return raw
        if (raw in MIN_CAPACITY_KWH * 1000..MAX_CAPACITY_KWH * 1000) return raw / 1000
        return null
    }

    fun normalizeVehicle(r: VehicleEnergyRaw, now: Long): Fact<VehicleEnergy> {
        fun meta(freshness: FactFreshness = FactFreshness.UNKNOWN, reason: String = "", availability: FactAvailability = r.availability, error: String? = null) = FactMeta(
            if (r.evidence == DataEvidence.VEHICLE) "Pleos Vehicle SDK" else "시연 차량", r.readAt, r.readAt, r.evidence, freshness, reason, availability, error,
        )
        if (r.availability != FactAvailability.OK) return Fact(null, meta(reason = "차량 정보를 받지 못했어요", error = r.availability.name))
        val soc = r.socPct
        if (soc == null || !soc.isFinite() || soc < 0 || soc > 100) return Fact(null, meta(availability = FactAvailability.FAILED, reason = "배터리 값이 범위를 벗어났어요", error = "SOC $soc"))
        val kwh = capacityToKwh(r.capacityRaw) ?: return Fact(null, meta(availability = FactAvailability.FAILED, reason = "배터리 용량을 확인하지 못했어요", error = "용량 ${r.capacityRaw}"))
        val readAt = r.readAt ?: return Fact(null, meta(reason = "언제 받은 값인지 몰라요", error = "읽은 시각 없음"))
        val ageMin = (now - readAt) / 60_000.0
        if (ageMin < 0 || ageMin > VEHICLE_STALE_MINUTES) return Fact(null, meta(FactFreshness.STALE, "배터리 값이 오래됐어요", error = "${Math.round(ageMin)}분 전 값"))
        return Fact(VehicleEnergy(soc, kwh), meta(FactFreshness.FRESH, "차량에서 방금 받은 값"))
    }
}
