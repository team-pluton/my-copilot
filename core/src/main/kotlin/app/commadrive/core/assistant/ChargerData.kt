package app.commadrive.core.assistant

import java.time.DateTimeException
import java.time.LocalDateTime
import java.time.ZoneOffset

/**
 * 충전기 데이터 정규화 · 충전소 평가 — `src/lib/assistant/charger.ts` 의 거울. 근거와 이유는 그쪽 주석.
 * 코드표(stat·chgerType)는 OpenAPI 활용가이드 v1.25 부록과 대조했다(2026-11-10, [CODE_TABLE_VERIFIED]) — 0·6(예약중)·9 는 UNKNOWN, chgerType 11(버스전용)은 빈 목록. 표에 없으면 UNKNOWN/null. 근거는 charger.ts 주석.
 */
enum class ChargerStatus { AVAILABLE, CHARGING, OUT_OF_SERVICE, MAINTENANCE, COMM_ERROR, UNKNOWN }
enum class Connector { DC_COMBO, DC_CHADEMO, AC3, AC_SLOW, NACS }
enum class StationVerdict { USABLE, NEEDS_CHECK, EXCLUDED }

data class ChargerRecord(
    val stationId: String,
    val chargerId: String,
    val stationName: String,
    val latitude: Double?,
    val longitude: Double?,
    val address: String?,
    val operator: String?,
    /** null = 표에 없는 코드(모름). 빈 목록이 아니다 */
    val connectors: List<Connector>?,
    val outputKw: Double?,
    val availabilityStatus: ChargerStatus,
    val statusUpdatedAt: Long?,
    val retrievedAt: Long,
    val availableHours: String?,
    val accessRestrictions: String?,
    val parkingFree: Boolean?,
    val source: String,
    val evidenceType: DataEvidence,
) { val key get() = "$stationId/$chargerId" }

data class StationAssessment(
    val stationIds: List<String>,
    val verdict: StationVerdict,
    val reason: String,
    val compatibleCount: Int = 0,
    val availableCount: Int = 0,
    val chargingCount: Int = 0,
    val maxKw: Double? = null,
    val freshness: FactFreshness,
    val retrievedAt: Long?,
    val statusChangedAt: Long? = null,
    val evidence: DataEvidence,
    val restriction: String? = null,
)

object ChargerData {
    const val CODE_TABLE_VERIFIED = true
    const val CHARGER_SOURCE = "한국환경공단 전기자동차 충전소 정보"
    const val UNCHANGED_SUSPECT_HOURS = 72L

    private val STAT = mapOf("1" to ChargerStatus.COMM_ERROR, "2" to ChargerStatus.AVAILABLE, "3" to ChargerStatus.CHARGING, "4" to ChargerStatus.OUT_OF_SERVICE, "5" to ChargerStatus.MAINTENANCE, "9" to ChargerStatus.UNKNOWN)
    fun statusOf(stat: String?): ChargerStatus = stat?.trim()?.let { STAT[it] } ?: ChargerStatus.UNKNOWN

    private val TYPE = mapOf(
        "01" to listOf(Connector.DC_CHADEMO), "02" to listOf(Connector.AC_SLOW), "03" to listOf(Connector.DC_CHADEMO, Connector.AC3),
        "04" to listOf(Connector.DC_COMBO), "05" to listOf(Connector.DC_CHADEMO, Connector.DC_COMBO), "06" to listOf(Connector.DC_CHADEMO, Connector.AC3, Connector.DC_COMBO),
        "07" to listOf(Connector.AC3), "08" to listOf(Connector.DC_COMBO), "09" to listOf(Connector.NACS), "10" to listOf(Connector.DC_COMBO, Connector.NACS),
        "11" to emptyList(), // DC콤보2(버스전용) — 승용차 규격 아님
    )
    fun connectorsOf(t: String?): List<Connector>? = t?.trim()?.let { TYPE[it] }

    private val KW = Regex("""(\d+(?:\.\d+)?)\s*k[wW]""")
    fun outputKwOf(powerType: String?): Double? = powerType?.let { KW.find(it) }?.groupValues?.get(1)?.toDoubleOrNull()?.takeIf { it > 0 }

    private val DIGITS14 = Regex("""^\d{14}$""")
    /** yyyyMMddHHmmss(한국 시간) → epoch ms. 없는 날짜·형식 오류는 null */
    fun parseKst(s: String?): Long? {
        val t = s?.trim() ?: return null
        if (!DIGITS14.matches(t)) return null
        fun n(a: Int, b: Int) = t.substring(a, b).toInt()
        return try {
            LocalDateTime.of(n(0, 4), n(4, 6), n(6, 8), n(8, 10), n(10, 12), n(12, 14)).toInstant(ZoneOffset.ofHours(9)).toEpochMilli()
        } catch (_: DateTimeException) { null }
    }

    private fun blank(v: String?) = v?.trim()?.ifEmpty { null }
    private fun coord(v: String?, max: Double): Double? = blank(v)?.toDoubleOrNull()?.takeIf { it.isFinite() && kotlin.math.abs(it) <= max && kotlin.math.abs(it) > 1e-6 }

    /** 필수 식별자가 없는 행은 버린다 */
    fun normalize(raw: Map<String, String?>, retrievedAt: Long, evidence: DataEvidence, source: String = CHARGER_SOURCE): ChargerRecord? {
        val stationId = blank(raw["statId"]) ?: return null
        val chargerId = blank(raw["chgerId"]) ?: return null
        val pf = blank(raw["parkingFree"])?.uppercase()
        return ChargerRecord(
            stationId, chargerId, blank(raw["statNm"]) ?: stationId,
            coord(raw["lat"], 90.0), coord(raw["lng"], 180.0), blank(raw["addr"]), blank(raw["busiNm"]),
            connectorsOf(raw["chgerType"]), outputKwOf(raw["powerType"]), statusOf(raw["stat"]), parseKst(raw["statUpdDt"]),
            retrievedAt, blank(raw["useTime"]), blank(raw["note"]), if (pf == "Y") true else if (pf == "N") false else null, source, evidence,
        )
    }

    fun dedupe(rows: List<ChargerRecord>): List<ChargerRecord> {
        val out = LinkedHashMap<String, ChargerRecord>()
        for (r in rows) {
            val cur = out[r.key]
            if (cur == null || (r.statusUpdatedAt ?: -1) >= (cur.statusUpdatedAt ?: -1)) out[r.key] = r
        }
        return out.values.toList()
    }

    fun applyStatusDelta(rows: List<ChargerRecord>, deltas: List<Map<String, String?>>, retrievedAt: Long, evidence: DataEvidence): List<ChargerRecord> {
        val byKey = HashMap<String, Map<String, String?>>()
        for (d in deltas) { val s = d["statId"]?.trim(); val c = d["chgerId"]?.trim(); if (!s.isNullOrEmpty() && !c.isNullOrEmpty()) byKey["$s/$c"] = d }
        return rows.map { r ->
            val d = byKey[r.key] ?: return@map r.copy(retrievedAt = retrievedAt, evidenceType = evidence)
            val at = parseKst(d["statUpdDt"])
            if (at != null && r.statusUpdatedAt != null && at < r.statusUpdatedAt) return@map r.copy(retrievedAt = retrievedAt, evidenceType = evidence)
            r.copy(availabilityStatus = statusOf(d["stat"]), statusUpdatedAt = at ?: r.statusUpdatedAt, retrievedAt = retrievedAt, evidenceType = evidence)
        }
    }

    private val RESTRICTION_WORDS = Regex("불가|폐쇄|공사|중단|고장|입주민|관계자|직원|전용|제한")

    fun assess(records: List<ChargerRecord>, stationIds: List<String>, connector: Connector, now: Long): StationAssessment {
        val mine = records.filter { it.stationId in stationIds }
        if (mine.isEmpty()) return StationAssessment(stationIds, StationVerdict.NEEDS_CHECK, if (stationIds.isNotEmpty()) "이 충전소의 정보를 받지 못했어요" else "연결된 충전소 정보가 없어요", freshness = FactFreshness.UNKNOWN, retrievedAt = null, evidence = DataEvidence.UNKNOWN)

        val retrievedAt = mine.minOf { it.retrievedAt }
        val freshness = JourneyFact.freshnessOf(retrievedAt, now)
        val evidence = when {
            mine.any { it.evidenceType == DataEvidence.MOCK } -> DataEvidence.MOCK
            mine.any { it.evidenceType == DataEvidence.CACHED } -> DataEvidence.CACHED
            else -> mine.first().evidenceType
        }
        val restriction = mine.mapNotNull { it.accessRestrictions }.firstOrNull { RESTRICTION_WORDS.containsMatchIn(it) }
        val known = mine.filter { it.connectors != null }
        val compatible = known.filter { connector in it.connectors!! }
        if (known.size == mine.size && compatible.isEmpty()) return StationAssessment(stationIds, StationVerdict.EXCLUDED, "차량과 맞는 충전 규격이 없어요", freshness = freshness, retrievedAt = retrievedAt, evidence = evidence, restriction = restriction)

        val pool = compatible.ifEmpty { mine }
        val available = pool.filter { it.availabilityStatus == ChargerStatus.AVAILABLE }
        val charging = pool.filter { it.availabilityStatus == ChargerStatus.CHARGING }
        val dead = pool.filter { it.availabilityStatus == ChargerStatus.OUT_OF_SERVICE || it.availabilityStatus == ChargerStatus.MAINTENANCE }
        fun facts(verdict: StationVerdict, reason: String) = StationAssessment(
            stationIds, verdict, reason, compatible.size, available.size, charging.size, pool.mapNotNull { it.outputKw }.maxOrNull(), freshness, retrievedAt, pool.mapNotNull { it.statusUpdatedAt }.maxOrNull(), evidence, restriction,
        )
        if (dead.size == pool.size) return facts(StationVerdict.EXCLUDED, "충전기가 모두 점검·운영 중지로 표시돼 있어요")
        if (compatible.isEmpty()) return facts(StationVerdict.NEEDS_CHECK, "충전 규격을 확인하지 못했어요")
        if (restriction != null) return facts(StationVerdict.NEEDS_CHECK, "안내문 확인 필요: $restriction")
        if (freshness == FactFreshness.STALE || freshness == FactFreshness.UNKNOWN) return facts(StationVerdict.NEEDS_CHECK, "상태 정보를 받은 지 오래됐어요")
        if (available.isEmpty() && charging.isEmpty()) return facts(StationVerdict.NEEDS_CHECK, "충전기 상태를 확인할 수 없어요")
        val suspect = { r: ChargerRecord -> r.statusUpdatedAt == null || now - r.statusUpdatedAt > UNCHANGED_SUSPECT_HOURS * 3_600_000 }
        if (available.isNotEmpty() && charging.isEmpty() && available.all(suspect)) return facts(StationVerdict.NEEDS_CHECK, "상태가 ${UNCHANGED_SUSPECT_HOURS}시간 넘게 바뀌지 않았어요")
        return facts(StationVerdict.USABLE, if (available.isNotEmpty()) "조회 시각 기준 ${available.size}대 대기 표시" else "조회 시각 기준 ${charging.size}대 모두 충전 중 표시")
    }
}
