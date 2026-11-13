package app.commadrive.core.assistant

/**
 * Personal Memory 학습 후보 — `src/lib/assistant/learning.ts` 의 거울 (오너 후속 지시 2026-10-28 4 · 정확성 보정 2026-10-29).
 * VEHICLE/MOCK 출처만 기록(APP·NONE 제외) · 운전자 미확인이면 기록 안 함 · 다른 이동 3번 반복해야 후보 · 한 번만 묻고 거절한 값은 다시 안 물음 · 주인(운전자/탑승 조합)에게 저장.
 *
 * 정확성 보정: 변경 주체는 SDK 콜백에 없다 → 운전석 항목은 **혼자 탈 때만** 운전자에게(가족·부부 중의 시트 변경은 기록하지 않음) ·
 * 귀속 키는 주인마다 다르다(운전자 항목 = 운전자별, 가족·부부 공조 = 조합별, 혼자 공조 = 운전자 × 혼자) ·
 * MOCK(시연 조작판·개발 패널) 과 VEHICLE(실차 콜백) 은 증거 등급으로 분리해 섞이지 않는다 · 조건별(계절·외기온) 취향은 학습하지 않는다.
 */
enum class ObservationSource { VEHICLE, MOCK, APP, NONE }
/** 변경 주체 — SDK 콜백에는 없다. 혼자라고 선언한 이동에서는 운전자로 **추정**(확정 아님) · 저장은 사용자 확인 뒤 */
enum class ChangeSubject { DRIVER_ASSUMED, UNKNOWN }
data class LearnCtx(val driver: String?, val mode: ProfileMode)
data class Seen(val value: Any, val trips: List<Int>, val evidence: ObservationSource = ObservationSource.MOCK)
data class LearningState(
    val seen: Map<String, Map<CabinKey, Seen>> = emptyMap(),
    val declined: Map<String, Map<CabinKey, List<Any>>> = emptyMap(),
)
data class LearnCandidate(val key: CabinKey, val value: Any, val trips: Int, val owner: PrefOwner, val evidence: ObservationSource, val line: String)
data class RealEvidence(val records: Int, val trips: Int)

object Learning {
    const val MIN_TRIPS = 3
    /** 학습 대상 — 차에서 돌릴 수 있고 앱이 읽을 수 있는 것. 음악·조명은 관찰 경로 미확인 */
    val LEARNABLE = listOf(CabinKey.HVAC_TEMP, CabinKey.HVAC_POWER, CabinKey.SEAT_VENT, CabinKey.SEAT_HEAT, CabinKey.STEERING_HEAT)
    private val RECORDED = setOf(ObservationSource.VEHICLE, ObservationSource.MOCK)

    /** 변경 주체 — 사용자가 "혼자"라고 선언한 이동에서만 운전자로 본다 */
    fun changeSubject(c: LearnCtx) = if (c.driver != null && Situation.OCCUPANCY_OF[c.mode] == Occupancy.SOLO) ChangeSubject.DRIVER_ASSUMED else ChangeSubject.UNKNOWN

    /** 귀속 키 — 운전자 항목 `D|운전자` · 가족/부부 조합 항목 `O|모드` · 혼자 조합 항목 `O|모드|운전자` */
    fun key(c: LearnCtx, key: CabinKey): String = when {
        Situation.CABIN_OWNER.getValue(key) == PrefOwner.DRIVER -> "D|${c.driver ?: "-"}"
        Situation.OCCUPANCY_OF[c.mode] == Occupancy.SOLO -> "O|${c.mode}|${c.driver ?: "-"}"
        else -> "O|${c.mode}"
    }

    private fun same(k: CabinKey, a: Any, b: Any) = if (k == CabinKey.HVAC_TEMP) kotlin.math.abs((a as Double) - (b as Double)) <= Cabin.HVAC_TOLERANCE_C else a == b
    /** 상태 서술 — 누가 바꿨다고 말하지 않는다 */
    private fun stateOf(k: CabinKey, v: Any) = when (k) { CabinKey.HVAC_TEMP -> "${Math.round(v as Double)}°C였어요"; CabinKey.LIGHTING -> "${(v as Lighting).label}이었어요"; else -> if (v as Boolean) "켜져 있었어요" else "꺼져 있었어요" }
    private fun iGa(w: String): String { val c = w.last().code - 0xac00; return if (c in 0 until 11172 && c % 28 != 0) "이" else "가" }
    private fun prefOf(p: CabinPrefs, k: CabinKey): Any? = when (k) {
        CabinKey.HVAC_TEMP -> p.hvacTempC; CabinKey.HVAC_POWER -> p.hvacOn; CabinKey.SEAT_VENT -> p.seatVent; CabinKey.SEAT_HEAT -> p.seatHeat
        CabinKey.STEERING_HEAT -> p.steeringHeat; CabinKey.LIGHTING -> p.lighting; CabinKey.MUSIC -> null
    }

    /**
     * 기록하지 않는 경우: 출처 APP/NONE · 운전자 미확인 · 이동 번호 없음 · 학습 대상 아님 · 운전석 항목인데 변경 주체를 모름(혼자 아님) · MOCK 이 VEHICLE 기록을 덮으려 함.
     * 증거 등급이 바뀌거나 값이 다르면 처음부터 다시 센다.
     */
    fun observe(st: LearningState, ctx: LearnCtx, key: CabinKey, value: Any, tripId: Int, source: ObservationSource): LearningState {
        if (source !in RECORDED || ctx.driver == null || tripId <= 0 || key !in LEARNABLE) return st
        if (Situation.CABIN_OWNER.getValue(key) == PrefOwner.DRIVER && changeSubject(ctx) != ChangeSubject.DRIVER_ASSUMED) return st
        val ck = key(ctx, key)
        val cur = st.seen[ck]?.get(key)
        if (cur != null && cur.evidence == ObservationSource.VEHICLE && source == ObservationSource.MOCK) return st
        val fresh = cur == null || cur.evidence != source || !same(key, cur.value, value)
        val next = if (fresh) Seen(value, listOf(tripId), source) else Seen(cur!!.value, if (tripId in cur.trips) cur.trips else cur.trips + tripId, source)
        return st.copy(seen = st.seen + (ck to (st.seen[ck].orEmpty() + (key to next))))
    }

    /** 묻기에 충분한 근거가 있는 후보 — 반복 ≥ MIN_TRIPS · 지금 취향과 다름 · 거절한 값 아님. MOCK 후보는 "시연 데이터 · " 를 앞에 단다 */
    fun candidates(st: LearningState, ctx: LearnCtx, current: CabinPrefs, situation: String): List<LearnCandidate> = LEARNABLE.mapNotNull { key ->
        val ck = key(ctx, key)
        val s = st.seen[ck]?.get(key) ?: return@mapNotNull null
        if (s.trips.size < MIN_TRIPS) return@mapNotNull null
        val pref = prefOf(current, key)
        if (pref != null && same(key, pref, s.value)) return@mapNotNull null
        if (st.declined[ck]?.get(key).orEmpty().any { same(key, it, s.value) }) return@mapNotNull null
        val owner = Situation.CABIN_OWNER.getValue(key)
        val head = if (s.evidence == ObservationSource.MOCK) "시연 데이터 · " else ""
        LearnCandidate(key, s.value, s.trips.size, owner, s.evidence, "${head}최근 ${s.trips.size}번 이동에서 ${situation}일 때 ${key.label}${iGa(key.label)} ${stateOf(key, s.value)} — ${owner.label} 취향으로 저장할까요?")
    }

    /** 실환경 학습 증거 집계 — VEHICLE 기록만(보고용) */
    fun realEvidence(st: LearningState): RealEvidence {
        val v = st.seen.values.flatMap { it.values }.filter { it.evidence == ObservationSource.VEHICLE }
        return RealEvidence(v.size, v.sumOf { it.trips.size })
    }

    fun accept(st: LearningState, ctx: LearnCtx, key: CabinKey) = key(ctx, key).let { ck -> st.copy(seen = st.seen + (ck to (st.seen[ck].orEmpty() - key))) }
    fun decline(st: LearningState, ctx: LearnCtx, key: CabinKey, value: Any) = key(ctx, key).let { ck ->
        LearningState(
            seen = st.seen + (ck to (st.seen[ck].orEmpty() - key)),
            declined = st.declined + (ck to (st.declined[ck].orEmpty() + (key to (st.declined[ck]?.get(key).orEmpty() + value)))),
        )
    }

    data class Stored(val profile: UserProfile, val driver: Driver?, val solo: SoloCabin?)
    /** 후보를 저장할 자리 — 귀속 키와 같은 곳(learning.ts storeCandidate): 운전자 항목 → 운전자 prefs · 혼자 조합 공조 → soloCabin(운전자별) · 가족·부부 공조 → 프로필 */
    fun store(c: LearnCandidate, ctx: LearnCtx, profile: UserProfile, driver: Driver?, solo: SoloCabin?): Stored {
        if (c.owner == PrefOwner.DRIVER) return Stored(profile, driver?.copy(prefs = withPref(driver.prefs, c.key, c.value)), solo)
        if (Situation.OCCUPANCY_OF[ctx.mode] == Occupancy.SOLO && ctx.driver != null) {
            val base = solo ?: SoloCabin()
            return Stored(profile, driver, when (c.key) { CabinKey.HVAC_TEMP -> base.copy(hvacTempC = Math.round((c.value as Double) * 2) / 2.0); CabinKey.HVAC_POWER -> base.copy(hvacOn = c.value as Boolean); else -> base })
        }
        if (c.key == CabinKey.HVAC_TEMP) return Stored(profile.copy(targetC = Math.round((c.value as Double) * 2) / 2.0), driver, solo)
        return Stored(profile.copy(cabin = withPref(profile.cabin, c.key, c.value)), driver, solo)
    }

    /** 저장 — 주인별 취향에 넣는다 */
    fun withPref(p: CabinPrefs, key: CabinKey, v: Any): CabinPrefs = when (key) {
        CabinKey.HVAC_TEMP -> p.copy(hvacTempC = Math.round((v as Double) * 2) / 2.0); CabinKey.HVAC_POWER -> p.copy(hvacOn = v as Boolean)
        CabinKey.SEAT_VENT -> p.copy(seatVent = v as Boolean); CabinKey.SEAT_HEAT -> p.copy(seatHeat = v as Boolean); CabinKey.STEERING_HEAT -> p.copy(steeringHeat = v as Boolean)
        CabinKey.LIGHTING -> p.copy(lighting = v as Lighting); CabinKey.MUSIC -> p.copy(music = v as String)
    }
    fun withPref(d: DriverPrefs, key: CabinKey, v: Any): DriverPrefs = when (key) {
        CabinKey.SEAT_VENT -> d.copy(seatVent = v as Boolean); CabinKey.SEAT_HEAT -> d.copy(seatHeat = v as Boolean); CabinKey.STEERING_HEAT -> d.copy(steeringHeat = v as Boolean)
        else -> d
    }

    /** 학습이 하지 않는 것 — learning.ts LEARNING_LIMITS 의 거울 */
    val LIMITS = listOf(
        "계절·외기온 등 조건별 취향은 학습하지 않는다 — 3번 반복한 값은 그 조합의 최근 값일 뿐, 모든 날씨·상황의 취향이 아니다",
        "변경 주체는 SDK 가 알려 주지 않는다 — 운전석 항목은 혼자 탈 때만 운전자에게 귀속, 가족·부부 탑승 중의 시트 변경은 기록하지 않는다",
        "혼자 탈 때도 변경 주체는 추정이다(DRIVER_ASSUMED) — 후보는 관찰한 값만 말하고, 저장은 사용자 확인 뒤",
        "시연 조작판·모의 차량의 관찰(MOCK)은 실차 증거로 집계하지 않는다 — 차량 콜백(VEHICLE)만 세며, 에뮬레이터 콜백도 같은 길로 들어오므로 실차 증거라고 주장하지 않는다",
    )
    const val CAVEAT = "최근 이동의 값만 봅니다 · 계절·외기온은 고려하지 않음 · 누가 바꿨는지는 SDK 가 알려 주지 않음"
}
