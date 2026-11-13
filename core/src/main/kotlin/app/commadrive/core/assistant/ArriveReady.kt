package app.commadrive.core.assistant

import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * ARRIVE READY v0 — "이 주차장에 세우면 약속 시간에 방문을 마칠 수 있나" (arrive-ready.ts 의 거울).
 *
 * 세 단계: 1. 방문 가능성(약속 − 지금 − 소요 시간 − 사용자 여유, 범위) 2. 주차 적합성(위치 · 운영 · 빈자리 표시와 갱신 시각) 3. 행동 결정(하나 + 가른 기준 + 불확실성).
 * 만들어 내지 않는 것: 도보 시간 · 도착 시점의 빈자리 · 지각 시각. 근거가 없으면 '판단 불가'가 정상 결과다.
 * 가설값(측정 전): 빈자리 신선 20분 · 반경 800m · 여유 기준 10분 · 소요 시간 불확실성 15%(최소 5분) · 빈자리 넉넉 10면 · 먼 거리 400m.
 */
data class GeoPoint(val lat: Double, val lon: Double)

data class ArriveGoal(
    /** 약속 시각(epoch ms) — 사용자 입력만. 일정 앱 연동은 [미구현] */
    val appointmentAt: Long?,
    val placeName: String,
    val place: GeoPoint?,
    /** 주차 후 방문까지 여유(분) — 사용자가 정한다. 도보 시간을 계산하지 않는다 */
    val bufferMin: Int?,
    val confirmedByUser: Boolean,
)

enum class ParkingKind { OFF_STREET, ON_STREET, OTHER }
data class Hours(val begin: String, val end: String)
data class ParkingFact(
    val id: String,
    val name: String,
    val address: String,
    val kind: ParkingKind,
    val point: GeoPoint?,
    val spreadM: Int?,
    val total: Int?,
    val occupied: Int?,
    /** 총 면수 − 현재 대수. 연계가 없거나 값이 이상하면 null — 추측하지 않는다 */
    val free: Int?,
    val updatedAt: Long?,
    val linked: Boolean,
    val weekday: Hours?,
    val weekend: Hours?,
    val holiday: Hours?,
    val basicFeeWon: Int?,
    val basicFeeMinutes: Int?,
    val liveApi: Boolean,
    val retrievedAt: Long,
)

enum class SpaceShown { SPACES_SHOWN, FULL_SHOWN, UNKNOWN }
data class SpaceFact(val shown: SpaceShown, val freshness: FactFreshness, val ageMin: Double?)
data class TripEstimate(val parkingId: String, val seconds: Int?, val meters: Int?, val retrievedAt: Long, val fromNavi: Boolean)
enum class Feasibility { ENOUGH, TIGHT, AT_RISK, UNKNOWN }
data class Slack(val low: Int, val high: Int)
data class ArriveCandidate(
    val parking: ParkingFact,
    val space: SpaceFact,
    val distanceM: Int,
    val etaSec: Int?,
    val slack: Slack?,
    val feasibility: Feasibility,
    /** 확정 추천에서 뺀 이유(확인 필요) — null 이면 추천 가능 */
    val problem: String?,
)
/** '정보를 못 받음'과 '맞는 후보가 없음'을 섞지 않는다 (arrive-ready.ts ArriveDecisionKind 설명) */
enum class ArriveDecisionKind { NEEDS_INPUT, RECOMMEND, RECOMMEND_WITH_CHECK, NO_FIT, DATA_STALE, DATA_FAILED }
data class Excluded(val id: String, val name: String, val reason: String)
data class ArriveDecision(
    val kind: ArriveDecisionKind,
    val headline: String,
    val missing: List<String>,
    val top: ArriveCandidate?,
    /** 순위는 앞서지만 방문지에서 멀어 확인이 필요한 후보 — 차로는 더 빠르다 */
    val fasterButFar: ArriveCandidate?,
    /** 맞는 후보가 없을 때 가장 빨리 닿는 후보 */
    val fastest: ArriveCandidate?,
    val alternatives: List<ArriveCandidate>,
    val needsCheck: List<ArriveCandidate>,
    val excluded: List<Excluded>,
)
/** feedOk · feedReason — 주차 정보 조회 결과. 실패면 후보가 없다고 하지 않고 '확인하지 못했어요' */
data class ArriveInput(val goal: ArriveGoal, val now: Long, val parkings: List<ParkingFact>, val trips: List<TripEstimate>, val feedOk: Boolean = true, val feedReason: String? = null)

object ArriveReady {
    const val PARKING_FRESH_MIN = 20.0
    const val PARKING_AGING_MIN = 120.0
    const val ETA_UNCERTAINTY_RATIO = 0.15
    const val ETA_UNCERTAINTY_MIN = 5.0
    const val ENOUGH_SLACK_MIN = 10
    const val MAX_WALK_M = 800
    const val PLENTY_SPACES = 10
    const val FAR_WALK_M = 400

    private val KST = ZoneOffset.ofHours(9)
    private val HHMM_FMT = DateTimeFormatter.ofPattern("HH:mm").withZone(KST)
    private fun hhmm(ms: Long) = HHMM_FMT.format(Instant.ofEpochMilli(ms))

    fun goalMissing(g: ArriveGoal, now: Long): List<String> = buildList {
        when {
            g.appointmentAt == null -> add("약속 시각")
            g.appointmentAt <= now -> add("약속 시각(이미 지남)")
        }
        if (g.place == null) add("방문 장소 위치")
        if (g.bufferMin == null || g.bufferMin < 0) add("주차 후 여유")
        if (!g.confirmedByUser) add("약속 확인")
    }

    // ── 주차 정규화 ──
    private fun num(v: String?): Double? = v?.trim()?.takeIf { it.isNotEmpty() }?.toDoubleOrNull()?.takeIf { it.isFinite() }
    private val HHMM_RE = Regex("""^\d{4}$""")
    private fun hours(b: String?, e: String?): Hours? = if (b != null && e != null && HHMM_RE.matches(b) && HHMM_RE.matches(e)) Hours(b, e) else null
    private val SEOUL_TIME = Regex("""^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$""")

    /** "2026-11-11 18:16:43"(한국 시간) → epoch ms */
    fun parseSeoulTime(s: String?): Long? {
        val m = s?.trim()?.let { SEOUL_TIME.matchEntire(it) } ?: return null
        val v = m.groupValues.drop(1).map { it.toInt() }
        return runCatching { LocalDateTime.of(v[0], v[1], v[2], v[3], v[4], v[5]).toInstant(KST).toEpochMilli() }.getOrNull()
    }

    fun validSeoulPoint(lat: Double?, lon: Double?): GeoPoint? =
        if (lat == null || lon == null) null else if (lat in 37.41..37.72 && lon in 126.76..127.19) GeoPoint(lat, lon) else null

    fun distanceM(a: GeoPoint, b: GeoPoint): Double {
        val r = 6_371_000.0; val rad = Math.PI / 180
        val dLat = (b.lat - a.lat) * rad; val dLon = (b.lon - a.lon) * rad
        val h = sin(dLat / 2).pow(2) + cos(a.lat * rad) * cos(b.lat * rad) * sin(dLon / 2).pow(2)
        return 2 * r * asin(sqrt(h))
    }

    fun normalizeParking(rt: Map<String, String>, info: List<Map<String, String>>, retrievedAt: Long, liveApi: Boolean): ParkingFact? {
        val id = rt["PKLT_CD"]?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val name = rt["PKLT_NM"]?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val pts = info.mapNotNull { validSeoulPoint(num(it["LAT"]), num(it["LOT"])) }
        val point = if (pts.isEmpty()) null else GeoPoint(pts.sumOf { it.lat } / pts.size, pts.sumOf { it.lon } / pts.size)
        val spreadM = point?.let { c -> Math.round(pts.maxOf { distanceM(c, it) }).toInt() }
        val linked = rt["PRK_STTS_YN"]?.trim() == "1"
        val total = num(rt["TPKCT"])?.toInt(); val occupied = num(rt["NOW_PRK_VHCL_CNT"])?.toInt()
        val free = if (linked && total != null && occupied != null && total > 0 && occupied >= 0 && occupied <= total) total - occupied else null
        val type = rt["PKLT_TYPE"]?.trim()
        val fee = num(rt["BSC_PRK_CRG"])?.toInt(); val feeMin = num(rt["BSC_PRK_HR"])?.toInt()
        val feeOk = fee != null && feeMin != null && feeMin > 0
        return ParkingFact(
            id, name, rt["ADDR"]?.trim() ?: "",
            when (type) { "NW" -> ParkingKind.OFF_STREET; "NS" -> ParkingKind.ON_STREET; else -> ParkingKind.OTHER },
            point, spreadM, total, occupied, free,
            if (linked) parseSeoulTime(rt["NOW_PRK_VHCL_UPDT_TM"]) else null, linked,
            hours(rt["WD_OPER_BGNG_TM"], rt["WD_OPER_END_TM"]), hours(rt["WE_OPER_BGNG_TM"], rt["WE_OPER_END_TM"]), hours(rt["LHLDY_OPER_BGNG_TM"], rt["LHLDY_OPER_END_TM"]),
            if (feeOk) fee else null, if (feeOk) feeMin else null, liveApi, retrievedAt,
        )
    }

    fun joinParking(realtime: List<Map<String, String>>, info: List<Map<String, String>>, retrievedAt: Long, liveApi: Boolean): List<ParkingFact> {
        val byCode = info.groupBy { it["PKLT_CD"]?.trim() ?: "" }
        val seen = mutableSetOf<String>()
        return realtime.mapNotNull { r -> normalizeParking(r, byCode[r["PKLT_CD"]?.trim() ?: ""].orEmpty(), retrievedAt, liveApi)?.takeIf { seen.add(it.id) } }
    }

    /** 빈자리 표시를 판단에 쓸 수 있나 — 20분 안의 연계 값만(Gate D) */
    fun spaceFact(p: ParkingFact, now: Long): SpaceFact {
        if (!p.linked || p.free == null || p.updatedAt == null) return SpaceFact(SpaceShown.UNKNOWN, FactFreshness.UNKNOWN, null)
        val age = JourneyFact.ageMinutes(p.updatedAt, now) ?: return SpaceFact(SpaceShown.UNKNOWN, FactFreshness.UNKNOWN, null)
        return when {
            age > PARKING_AGING_MIN -> SpaceFact(SpaceShown.UNKNOWN, FactFreshness.STALE, age)
            age > PARKING_FRESH_MIN -> SpaceFact(SpaceShown.UNKNOWN, FactFreshness.AGING, age)
            else -> SpaceFact(if (p.free > 0) SpaceShown.SPACES_SHOWN else SpaceShown.FULL_SHOWN, FactFreshness.FRESH, age)
        }
    }

    /** 토·일은 주말 시간, 그 밖은 평일 시간(공휴일은 이 데이터로 알 수 없어 평일로 — 한계). 시간이 없으면 null */
    fun isOpenAt(p: ParkingFact, at: Long): Boolean? {
        val t = Instant.ofEpochMilli(at).atOffset(KST)
        val weekend = t.dayOfWeek.value >= 6
        val h = (if (weekend) p.weekend else p.weekday) ?: return null
        fun toMin(s: String) = s.substring(0, 2).toInt() * 60 + s.substring(2).toInt()
        val b = toMin(h.begin); val e = toMin(h.end); val m = t.hour * 60 + t.minute
        if (b == e || (b == 0 && e >= 1440)) return true
        return if (b < e) m in b until e else m >= b || m < e
    }

    fun tripProblem(t: TripEstimate?): String? {
        if (t?.seconds == null) return "내비 소요 시간을 받지 못했어요"
        if (t.seconds <= 0) return "내비 소요 시간이 0으로 왔어요"
        if (t.meters != null && t.meters > 2_000) {
            val kmh = (t.meters / 1000.0) / (t.seconds / 3600.0)
            if (kmh > 150 || kmh < 3) return "내비 소요 시간이 거리와 맞지 않아요"
        }
        return null
    }

    fun slackOf(goal: ArriveGoal, now: Long, etaSec: Int?): Slack? {
        if (goal.appointmentAt == null || goal.bufferMin == null || etaSec == null) return null
        val eta = etaSec / 60.0
        val high = (goal.appointmentAt - now) / 60_000.0 - eta - goal.bufferMin
        val low = high - max(ETA_UNCERTAINTY_MIN, eta * ETA_UNCERTAINTY_RATIO)
        return Slack(Math.round(low).toInt(), Math.round(high).toInt())
    }
    fun feasibilityOf(s: Slack?): Feasibility = when {
        s == null -> Feasibility.UNKNOWN
        s.low >= ENOUGH_SLACK_MIN -> Feasibility.ENOUGH
        s.high >= 0 -> Feasibility.TIGHT
        else -> Feasibility.AT_RISK
    }

    private enum class Key { FEASIBILITY, SPACES, SLACK, DISTANCE }
    private fun keyOf(k: Key, c: ArriveCandidate): Long = when (k) {
        Key.FEASIBILITY -> c.feasibility.ordinal.toLong()
        Key.SPACES -> if ((c.parking.free ?: 0) >= PLENTY_SPACES) 0 else 1
        Key.SLACK -> -(c.slack?.high ?: -9999).toLong()
        Key.DISTANCE -> Math.round(c.distanceM / 50.0)
    }
    private val CMP = Comparator<ArriveCandidate> { a, b ->
        for (k in Key.entries) { val d = keyOf(k, a).compareTo(keyOf(k, b)); if (d != 0) return@Comparator d }
        a.parking.id.compareTo(b.parking.id)
    }

    fun decide(i: ArriveInput): ArriveDecision {
        val missing = goalMissing(i.goal, i.now)
        fun empty(kind: ArriveDecisionKind, headline: String, needsCheck: List<ArriveCandidate> = emptyList(), excluded: List<Excluded> = emptyList(), fastest: ArriveCandidate? = null) =
            ArriveDecision(kind, headline, emptyList(), null, null, fastest, emptyList(), needsCheck, excluded)
        if (missing.isNotEmpty()) return empty(ArriveDecisionKind.NEEDS_INPUT, "${missing.joinToString(" · ")}을(를) 알려 주시면 주차와 도착을 함께 볼게요").copy(missing = missing)
        if (!i.feedOk) return empty(ArriveDecisionKind.DATA_FAILED, "주차장 정보를 확인하지 못했어요${i.feedReason?.let { " · $it" } ?: ""}")
        val dest = i.goal.place!!
        val trips = i.trips.associateBy { it.parkingId }
        val excluded = mutableListOf<Excluded>()
        val cands = mutableListOf<ArriveCandidate>()
        for (p in i.parkings) {
            val pt = p.point ?: run { excluded += Excluded(p.id, p.name, "위치를 몰라요"); null } ?: continue
            val d = distanceM(pt, dest)
            if (d > MAX_WALK_M) { excluded += Excluded(p.id, p.name, "방문지에서 ${MAX_WALK_M}m 밖"); continue }
            val t = trips[p.id]
            val tp = tripProblem(t)
            val etaSec = if (tp != null) null else t!!.seconds
            val arriveAt = etaSec?.let { i.now + it * 1000L }
            if (arriveAt != null && isOpenAt(p, arriveAt) == false) { excluded += Excluded(p.id, p.name, "도착 예정 시각에 운영하지 않아요"); continue }
            val space = spaceFact(p, i.now)
            val slack = slackOf(i.goal, i.now, etaSec)
            val feas = feasibilityOf(slack)
            val problem = tp ?: when {
                space.shown == SpaceShown.FULL_SHOWN -> "만차로 표시돼 있어요(${hhmm(p.updatedAt!!)} 기준)"
                space.shown == SpaceShown.UNKNOWN -> if (space.freshness == FactFreshness.UNKNOWN) "빈자리 정보가 없어요" else "빈자리 정보가 오래됐어요"
                feas == Feasibility.AT_RISK -> "이 주차장으로는 약속 시간을 맞추기 어려울 수 있어요"
                isOpenAt(p, arriveAt!!) == null -> "운영시간을 확인하지 못했어요"
                else -> null
            }
            cands += ArriveCandidate(p, space, Math.round(d).toInt(), etaSec, slack, feas, problem)
        }
        val ok = cands.filter { it.problem == null }.sortedWith(CMP)
        val needsCheck = cands.filter { it.problem != null }.sortedWith(CMP)
        if (ok.isEmpty()) {
            if (cands.isEmpty()) return empty(ArriveDecisionKind.NO_FIT, "방문지 ${MAX_WALK_M}m 안에서 확인된 주차장이 없어요", needsCheck, excluded)
            if (cands.all { it.etaSec == null }) return empty(ArriveDecisionKind.DATA_FAILED, "내비 소요 시간을 받지 못해 판단을 보류해요", needsCheck, excluded)
            if (cands.all { it.space.shown == SpaceShown.UNKNOWN }) return empty(ArriveDecisionKind.DATA_STALE, "주차장 빈자리 정보를 최신으로 확인해야 해요", needsCheck, excluded)
            val fastest = cands.filter { it.etaSec != null }.minByOrNull { it.etaSec!! }
            return empty(ArriveDecisionKind.NO_FIT, "확인된 주차장 중 약속 시간에 맞춰 방문할 여유가 있는 후보를 찾지 못했어요", needsCheck, excluded, fastest)
        }
        // 방문지 가까운(400m 안) 후보가 먼저 — 차로 빠른 것만으로 방문 목표에 맞다고 확정하지 않는다
        val near = ok.filter { it.distanceM < FAR_WALK_M }
        val far = ok.filter { it.distanceM >= FAR_WALK_M }
        if (near.isNotEmpty()) {
            val top = near.first()
            val fasterButFar = far.firstOrNull()?.takeIf { CMP.compare(it, top) < 0 }
            val alternatives = (near.drop(1) + far.filter { it !== fasterButFar }).sortedWith(CMP).take(2)
            val headline = if (top.feasibility == Feasibility.ENOUGH) "${top.parking.name}에 세우면 약속 시간에 맞출 수 있어 보여요" else "${top.parking.name}이(가) 가장 낫지만 빠듯해요"
            return ArriveDecision(ArriveDecisionKind.RECOMMEND, headline, emptyList(), top, fasterButFar, null, alternatives, needsCheck, excluded)
        }
        val top = far.first()
        return ArriveDecision(ArriveDecisionKind.RECOMMEND_WITH_CHECK, "${top.parking.name}이(가) 가장 낫지만 방문지까지 직선 약 ${Math.round(top.distanceM / 10.0) * 10}m — 걸어가는 시간 확인이 필요해요",
            emptyList(), top, null, null, far.drop(1).take(2), needsCheck, excluded)
    }

    /** 차로는 더 빠르지만 먼 후보를 왜 1순위로 두지 않았는지 — 도보 시간은 계산하지 않는다 */
    fun fasterButFarNote(top: ArriveCandidate, f: ArriveCandidate, bufferMin: Int): String {
        val faster = if (top.etaSec != null && f.etaSec != null) Math.round((top.etaSec - f.etaSec) / 60.0).toInt() else null
        return "${f.parking.name}은(는) ${if (faster != null && faster > 0) "차로 약 ${faster}분 빠르지만" else "약속 여유는 더 있지만"} 방문지까지 직선 약 ${Math.round(f.distanceM / 10.0) * 10}m — 걸어가는 시간이 여유 ${bufferMin}분 안에 드는지 확인이 필요해요"
    }

    /** 가까운 추천과 차로 빠른 먼 후보의 맞교환을 한 문장으로(오너 2026-11-12) — 도보 시간 · 도착 때 빈자리는 만들지 않는다 (arrive-ready.ts arriveTradeoff) */
    fun tradeoff(top: ArriveCandidate, far: ArriveCandidate): String {
        fun left(c: ArriveCandidate) = c.slack?.let { "${maxOf(it.low, 0)}~${it.high}분" } ?: "확인 전"
        fun m(c: ArriveCandidate) = "약 ${Math.round(c.distanceM / 10.0) * 10}m"
        val faster = if (top.etaSec != null && far.etaSec != null) Math.round((top.etaSec - far.etaSec) / 60.0).toInt() else null
        return "${top.parking.name}은(는) 방문지와 가깝지만(${m(top)}) 남는 시간이 ${left(top)}이고, ${far.parking.name}은(는) ${if (faster != null && faster > 0) "차로 약 ${faster}분 빠르지만" else "여유는 더 있지만"} 방문지까지 ${m(far)}라 주차 후 이동을 확인해야 해요"
    }

    fun budgetLine(i: ArriveInput, c: ArriveCandidate?): String? {
        val s = c?.slack ?: return null
        val eta = c.etaSec ?: return null
        val appt = i.goal.appointmentAt ?: return null
        val buffer = i.goal.bufferMin ?: return null
        val left = when {
            s.high < 0 -> "약 ${-s.high}~${-s.low}분 모자람"
            s.low < 0 -> "약 0~${s.high}분 남음"
            else -> "약 ${s.low}~${s.high}분 남음"
        }
        return "약속 ${hhmm(appt)} − 지금 ${hhmm(i.now)} − 주차장까지 약 ${Math.round(eta / 60.0)}분(내비) − 주차 후 여유 ${buffer}분(직접 설정) → $left · 추정"
    }

    fun decisiveReason(top: ArriveCandidate, other: ArriveCandidate): String? {
        for (k in Key.entries) {
            if (keyOf(k, top) == keyOf(k, other)) continue
            // 앞선 쪽이 이 기준에서 실제로 나을 때만 이유로 말한다 — 가까운 후보 우선으로 앞선 경우 '약 -6분 많아요'를 만들지 않는다
            if (keyOf(k, top) > keyOf(k, other)) return null
            return when (k) {
                Key.FEASIBILITY -> "약속까지 여유가 ${other.parking.name}보다 커요"
                Key.SPACES -> "표시된 빈자리가 ${PLENTY_SPACES}면 이상이에요(${other.parking.name}은 ${other.parking.free ?: 0}면)"
                Key.SLACK -> "도착 후 남는 시간이 ${other.parking.name}보다 약 ${(top.slack?.high ?: 0) - (other.slack?.high ?: 0)}분 많아요"
                Key.DISTANCE -> "방문지에 ${other.parking.name}보다 약 ${Math.round((other.distanceM - top.distanceM) / 10.0) * 10}m 가까워요"
            }
        }
        return null
    }

    fun caveats(c: ArriveCandidate, bufferMin: Int): List<String> = buildList {
        add("빈자리 ${c.parking.free}면 표시 · ${c.parking.updatedAt?.let { hhmm(it) } ?: "—"} 기준 — 도착할 때도 있는지는 몰라요")
        add("소요 시간은 내비 예상 그대로 · 실시간 교통 반영 여부는 확인 전")
        if (c.distanceM >= FAR_WALK_M) add("방문지까지 직선 약 ${Math.round(c.distanceM / 10.0) * 10}m — 걸어가는 시간이 여유 ${bufferMin}분 안에 드는지 확인해 주세요")
        if (c.parking.kind == ParkingKind.ON_STREET && (c.parking.spreadM ?: 0) >= 300) add("노상 주차장이라 위치 범위가 넓어요 — 진입 위치를 확인해 주세요")
        else add("주차장 위치는 대표 좌표 — 진입구와 다를 수 있어요")
    }
}

data class ArriveRecovery(val notify: Boolean, val reason: String?, val suggestion: ArriveCandidate?)

/** 이미 승인해 내비에 보낸 주차장이 있을 때 새 판단을 알릴지 — 결과가 의미 있게 달라질 때만. 경로를 스스로 바꾸지 않는다 (arrive-ready.ts arriveRecovery) */
fun ArriveReady.recovery(next: ArriveDecision, routedId: String?): ArriveRecovery {
    val quiet = ArriveRecovery(false, null, null)
    if (routedId == null) return quiet
    val routed = (listOfNotNull(next.top, next.fasterButFar) + next.alternatives).firstOrNull { it.parking.id == routedId }
    val routedProblem = next.needsCheck.firstOrNull { it.parking.id == routedId }?.problem
        ?: next.excluded.firstOrNull { it.id == routedId }?.reason
        ?: next.headline.takeIf { next.kind == ArriveDecisionKind.DATA_FAILED || next.kind == ArriveDecisionKind.DATA_STALE }
    val better = next.top?.takeIf { it.parking.id != routedId }
    if (routed == null && routedProblem != null) {
        // 정보를 못 받은 것을 '바뀌었다'고 말하지 않는다(D7 과 같은 종류) — 조회 실패는 실패로, 경로는 그대로라고
        val dataOnly = next.needsCheck.none { it.parking.id == routedId } && next.excluded.none { it.id == routedId }
        return ArriveRecovery(true, if (dataOnly) "$routedProblem · 안내 중인 경로는 그대로예요" else "안내 중인 주차장 · $routedProblem", better)
    }
    if (routed != null && better != null && better.feasibility.ordinal < routed.feasibility.ordinal)
        return ArriveRecovery(true, "${better.parking.name}이(가) 약속까지 여유가 더 있어요 · 지금 안내 중인 곳도 쓸 수 있어요", better)
    return quiet
}

/**
 * 실행 중인 계획 기준의 판단(오너 2026-11-13, E32-22) — arrive-ready.ts arrivePlanStatus 의 거울.
 * 지금 정보의 1순위(best) · 승인해 내비에서 확인된 계획(routed) · 그 계획을 바꿀 필요(change)를 섞지 않는다.
 * '유지해도 괜찮다'는 안내 중인 곳이 이번 판단에서 추천 가능 후보로 확인됐을 때만. 판단 규칙(decide · recovery)은 그대로 — 표시 계층만 나눈다.
 */
enum class PlanChange { NO_PLAN, KEEP, KEEP_TIGHT, SUGGEST_CHANGE, ROUTED_PROBLEM, CANNOT_JUDGE }
data class ArrivePlanStatus(
    val change: PlanChange,
    val headline: String,
    val detail: String?,
    /** 안내 중인 주차장이 이번 판단에서 추천 가능으로 남았으면 그 후보 */
    val routed: ArriveCandidate?,
    /** 안내 중인 곳과 다른, 지금 정보의 1순위 — 상세에서 '다른 적합 후보'로만 */
    val best: ArriveCandidate?,
    val recovery: ArriveRecovery,
)

fun ArriveReady.planStatus(next: ArriveDecision, routedId: String?, routedName: String?): ArrivePlanStatus {
    val recovery = recovery(next, routedId)
    if (routedId == null) return ArrivePlanStatus(PlanChange.NO_PLAN, next.headline, null, null, next.top, recovery)
    val name = routedName ?: "안내 중인 주차장"
    val routed = (listOfNotNull(next.top, next.fasterButFar) + next.alternatives).firstOrNull { it.parking.id == routedId }
    val best = next.top?.takeIf { it.parking.id != routedId }
    val inData = next.needsCheck.any { it.parking.id == routedId } || next.excluded.any { it.id == routedId }
    val dataProblem = next.kind == ArriveDecisionKind.DATA_FAILED || next.kind == ArriveDecisionKind.DATA_STALE
    fun st(c: PlanChange, h: String, d: String?) = ArrivePlanStatus(c, h, d, routed, best, recovery)
    val cannot = "지금은 판단할 정보가 부족해요 · 안내 중인 경로는 그대로예요"
    if (routed == null && !inData) return st(PlanChange.CANNOT_JUDGE, cannot, if (dataProblem) next.headline else "안내 중인 ${name}을(를) 이번 정보에서 확인하지 못했어요")
    // 안내 중인 곳의 빈자리 · 소요 시간을 모르는 것은 '문제가 생겼다'가 아니라 '판단할 정보가 부족하다'
    val routedCheck = next.needsCheck.firstOrNull { it.parking.id == routedId }
    if (routed == null && routedCheck != null && (routedCheck.space.shown == SpaceShown.UNKNOWN || routedCheck.etaSec == null)) return st(PlanChange.CANNOT_JUDGE, cannot, "$name · ${routedCheck.problem}")
    if (recovery.notify && recovery.suggestion != null)
        return st(PlanChange.SUGGEST_CHANGE, if (routed != null) "지금 경로도 쓸 수 있지만 바꾸면 여유가 더 있어요" else "안내 중인 주차장을 바꾸는 것이 좋아 보여요", recovery.reason)
    if (routed == null) return st(PlanChange.ROUTED_PROBLEM, "안내 중인 주차장에 문제가 있지만 바꿀 만한 후보를 찾지 못했어요", recovery.reason)
    val tight = routed.feasibility != Feasibility.ENOUGH
    return st(if (tight) PlanChange.KEEP_TIGHT else PlanChange.KEEP, if (tight) "지금 경로로 갈 수 있지만 빠듯해요" else "지금 경로를 유지해도 괜찮아 보여요",
        "안내 중 · $name · 지금 확인된 정보로는 경로를 바꿀 이유가 없어요")
}
