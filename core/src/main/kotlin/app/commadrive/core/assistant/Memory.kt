package app.commadrive.core.assistant

/**
 * Journey Memory · 프로필 저장소 — `src/lib/assistant/memory.ts` 의 거울 (Android 이식 때 옮겼다, 2026-10-26).
 * 이번 이동에만 유효한 것(JourneyMemory)은 새 이동에서 비우고, 기록·거절 학습(ProfileVault)은 프로필마다 따로 둔다.
 * 위치 이력은 어디에도 저장하지 않는다.
 */
enum class ClimateDecisionKind { APPLIED, KEPT }
data class ClimateDecision(val decision: ClimateDecisionKind, val valueC: Double)

data class JourneyMemory(
    val tripId: Int,
    val profile: ProfileMode,
    val prepareDone: Boolean = false,
    val packed: List<String> = emptyList(),
    val climate: ClimateDecision? = null,
    val waypointIds: List<String> = emptyList(),
    val finishChecked: Map<Int, List<String>> = emptyMap(),
    val lastShown: SuggestionType? = null,
    /** 출발 준비에서 이번에는 건너뛴 항목 — 완료가 아니다 */
    val skipped: List<PrepareItemKey> = emptyList(),
)

sealed interface MemoryEvent {
    data class Packed(val items: List<String>) : MemoryEvent
    data object PrepareDone : MemoryEvent
    data class Climate(val decision: ClimateDecisionKind, val valueC: Double) : MemoryEvent
    data class Waypoint(val id: String) : MemoryEvent
    data class FinishChecked(val leg: Int, val items: List<String>) : MemoryEvent
    data class Shown(val type: SuggestionType?) : MemoryEvent
    data class SkipPrepare(val key: PrepareItemKey) : MemoryEvent
}

/** 공조 상태 — 맞추지 않음 · 같음 · 다름 · 읽을 수 없음 */
enum class ClimateState { SKIP, SAME, DIFFERENT, UNREADABLE }

enum class ActivityKind { PREPARE, ENERGY, WAYPOINT, FINISH, STATE }
data class Activity(val clock: String, val kind: ActivityKind, val text: String, val tripId: Int)

data class ProfileVault(
    val activity: Map<ProfileMode, List<Activity>>,
    val history: Map<ProfileMode, Map<SuggestionType, SuggestionRecord>>,
    val nextTripId: Map<ProfileMode, Int>,
    /** 마지막으로 고른 탑승 조합 — 다음 이용에서 "지난번처럼"으로 바로 준비. 프로필 없이(GUEST)는 기억하지 않는다 (memory.ts lastMode) */
    val lastMode: ProfileMode? = null,
    /** 마지막 운전자 — 자동 적용은 하지 않는다(공식 운전자 인식 전) */
    val lastDriver: String? = null,
    /** 운전자별 취향(운전석) — 탑승 조합과 따로 (memory.ts drivers) */
    val drivers: Map<String, Driver> = Situation.DEMO_DRIVERS,
    /** 학습 후보(관찰 기록 · 거절) */
    val learning: LearningState = LearningState(),
    /** 혼자 탈 때의 공조(운전자별) — 키 `운전자|모드`(memory.ts soloCabin). 혼자 조합에서 승인한 공조는 여기로 — 프로필 targetC 는 운전자 공유라 섞인다 */
    val soloCabin: Map<String, SoloCabin> = emptyMap(),
)

object Memory {
    fun newMemory(tripId: Int, profile: ProfileMode) = JourneyMemory(tripId, profile)

    fun remember(m: JourneyMemory, e: MemoryEvent): JourneyMemory = when (e) {
        is MemoryEvent.Packed -> m.copy(packed = e.items)
        MemoryEvent.PrepareDone -> m.copy(prepareDone = true)
        is MemoryEvent.Climate -> m.copy(climate = ClimateDecision(e.decision, e.valueC))
        is MemoryEvent.Waypoint -> if (e.id in m.waypointIds) m else m.copy(waypointIds = m.waypointIds + e.id)
        is MemoryEvent.FinishChecked -> m.copy(finishChecked = m.finishChecked + (e.leg to e.items))
        is MemoryEvent.Shown -> if (m.lastShown == e.type) m else m.copy(lastShown = e.type)
        is MemoryEvent.SkipPrepare -> if (e.key in m.skipped) m else m.copy(skipped = m.skipped + e.key)
    }

    /** 출발 준비 요약 — 완료 n · 확인 필요 m (memory.ts prepareSummary 의 거울) */
    fun prepareSummary(m: JourneyMemory, packingTotal: Int, climate: ClimateState, energyOk: Boolean?): Pair<Int, Int> {
        val items = buildList {
            if (climate != ClimateState.SKIP) add(climate == ClimateState.SAME || (climate == ClimateState.DIFFERENT && m.climate != null))
            if (packingTotal > 0) add(m.packed.size >= packingTotal)
            if (energyOk != null) add(energyOk || m.waypointIds.isNotEmpty())
        }
        return items.count { it } to items.count { !it }
    }

    const val ACTIVITY_LIMIT = 40

    fun emptyVault() = ProfileVault(
        ProfileMode.entries.associateWith { emptyList() }, ProfileMode.entries.associateWith { emptyMap() }, ProfileMode.entries.associateWith { 1 },
    )

    fun recordActivity(v: ProfileVault, mode: ProfileMode, a: Activity) =
        v.copy(activity = v.activity + (mode to (listOf(a) + v.activity.getValue(mode)).take(ACTIVITY_LIMIT)))

    /** 그 프로필의 기록만 — 다른 프로필의 것은 보이지 않는다 */
    fun activityOf(v: ProfileVault, mode: ProfileMode) = v.activity.getValue(mode)

    fun setHistory(v: ProfileVault, mode: ProfileMode, h: Map<SuggestionType, SuggestionRecord>) = v.copy(history = v.history + (mode to h))

    /** 새 이동 — 이동 번호를 하나 올리고, 비운 이번 이동 기억을 돌려준다 */
    fun startTrip(v: ProfileVault, mode: ProfileMode): Pair<ProfileVault, JourneyMemory> {
        val id = v.nextTripId.getValue(mode)
        return v.copy(nextTripId = v.nextTripId + (mode to id + 1)) to newMemory(id, mode)
    }

    fun rememberMode(v: ProfileVault, m: ProfileMode) = if (m == ProfileMode.GUEST) v else v.copy(lastMode = m)
    fun rememberDriver(v: ProfileVault, d: String?) = v.copy(lastDriver = d)

    /** 그 프로필의 기록과 거절 학습만 지운다 */
    fun wipeProfile(v: ProfileVault, mode: ProfileMode) = v.copy(activity = v.activity + (mode to emptyList()), history = v.history + (mode to emptyMap()))
}
