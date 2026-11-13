package app.commadrive.core.assistant

/** 승인 후 경유지 요청의 상태 — `src/lib/assistant/waypoint-handoff.ts` 의 거울. 지키는 것은 그쪽 주석(경로 없으면 안 보냄 · 자동 삭제 없음 · 재조회로 확인 · 응답 없으면 재전송 안 함) */
enum class WaypointPhase { IDLE, LOOKING, NO_ROUTE, SLOTS_FULL, PENDING, VERIFIED, FAILED, UNKNOWN_OUTCOME }

data class WaypointState(
    val phase: WaypointPhase = WaypointPhase.IDLE,
    val requestId: Int? = null,
    val target: NaviPlace? = null,
    val existing: List<NaviPlace> = emptyList(),
    val replaceIndex: Int? = null,
    val acked: Boolean = false,
    val message: String? = null,
    val mock: Boolean = false,
)

sealed interface WaypointEvent {
    data class Start(val requestId: Int, val target: NaviPlace, val mock: Boolean = false) : WaypointEvent
    data class Lookup(val requestId: Int, val routing: Boolean?, val waypoints: List<NaviPlace>) : WaypointEvent
    data class ChooseReplace(val requestId: Int, val index: Int) : WaypointEvent
    data object Cancel : WaypointEvent
    data class Ack(val requestId: Int) : WaypointEvent
    data class WaypointsRead(val requestId: Int, val waypoints: List<NaviPlace>) : WaypointEvent
    data class Error(val requestId: Int, val error: NaviError) : WaypointEvent
    data class Timeout(val requestId: Int) : WaypointEvent
    data class GiveUp(val requestId: Int) : WaypointEvent
    data class Invalidate(val reason: String) : WaypointEvent
}

object WaypointHandoff {
    const val SLOTS = 2
    fun shouldSend(s: WaypointState) = s.phase == WaypointPhase.PENDING && !s.acked

    fun reduce(s: WaypointState, e: WaypointEvent): WaypointState {
        fun mine(id: Int) = id == s.requestId
        return when (e) {
            is WaypointEvent.Start ->
                if (s.phase == WaypointPhase.LOOKING || s.phase == WaypointPhase.PENDING || s.phase == WaypointPhase.UNKNOWN_OUTCOME) s
                else WaypointState(WaypointPhase.LOOKING, e.requestId, e.target, mock = e.mock)
            is WaypointEvent.Lookup -> {
                val target = s.target
                when {
                    !mine(e.requestId) || s.phase != WaypointPhase.LOOKING || target == null -> s
                    e.routing == null -> s.copy(phase = WaypointPhase.FAILED, message = "내비 경로 상태를 읽지 못해 보내지 않았어요")
                    !e.routing -> s.copy(phase = WaypointPhase.NO_ROUTE, message = "내비에 목적지가 없어요 · 목적지를 먼저 설정해 주세요")
                    e.waypoints.any { sameWaypoint(it, target) } -> s.copy(phase = WaypointPhase.VERIFIED, existing = e.waypoints, message = "이미 경유지에 있어요: ${target.name}")
                    e.waypoints.size >= SLOTS -> s.copy(phase = WaypointPhase.SLOTS_FULL, existing = e.waypoints, message = "경유지 칸이 모두 찼어요 · 바꿀 칸을 고르거나 그대로 두세요")
                    else -> s.copy(phase = WaypointPhase.PENDING, existing = e.waypoints, message = null)
                }
            }
            is WaypointEvent.ChooseReplace ->
                if (mine(e.requestId) && s.phase == WaypointPhase.SLOTS_FULL && e.index in s.existing.indices) s.copy(phase = WaypointPhase.PENDING, replaceIndex = e.index, message = null) else s
            WaypointEvent.Cancel ->
                if (s.phase == WaypointPhase.SLOTS_FULL || s.phase == WaypointPhase.NO_ROUTE || s.phase == WaypointPhase.VERIFIED || s.phase == WaypointPhase.FAILED)
                    WaypointState(message = if (s.phase == WaypointPhase.SLOTS_FULL) "기존 경유지를 그대로 둡니다" else null) else s
            is WaypointEvent.Ack ->
                if (mine(e.requestId) && (s.phase == WaypointPhase.PENDING || s.phase == WaypointPhase.UNKNOWN_OUTCOME)) s.copy(acked = true) else s
            is WaypointEvent.WaypointsRead -> {
                val target = s.target
                if (!mine(e.requestId) || (s.phase != WaypointPhase.PENDING && s.phase != WaypointPhase.UNKNOWN_OUTCOME) || target == null) return s
                if (e.waypoints.any { sameWaypoint(it, target) }) {
                    val keep = s.existing.filterIndexed { i, _ -> i != s.replaceIndex }
                    val lost = keep.filter { k -> e.waypoints.none { sameWaypoint(it, k) } }
                    val late = s.phase == WaypointPhase.UNKNOWN_OUTCOME
                    return s.copy(phase = WaypointPhase.VERIFIED, acked = true, message = when {
                        lost.isNotEmpty() -> "추가됐어요: ${target.name} · 목록에 없는 기존 경유지: ${lost.joinToString(", ") { it.name }} · 내비게이션에서 확인해 주세요"
                        late -> "응답은 늦었지만 경유지에 있어요: ${target.name}"
                        s.mock -> "시연 내비 경유지에 추가했어요 (모의): ${target.name}"
                        else -> "경유지에 추가했어요: ${target.name} · 내비가 확인함"
                    })
                }
                // 콜백이 없으면 목록이 비어도 모른다(E24) — 실패라 하면 중복 추가로 이어진다
                if (!s.acked) return s
                s.copy(phase = WaypointPhase.FAILED, message = "경유지 목록에서 찾지 못했어요: ${target.name} · 내비게이션에서 확인해 주세요")
            }
            is WaypointEvent.Error ->
                if (mine(e.requestId) && (s.phase == WaypointPhase.LOOKING || s.phase == WaypointPhase.PENDING || s.phase == WaypointPhase.UNKNOWN_OUTCOME)) s.copy(phase = WaypointPhase.FAILED, message = "${e.error.label} · 기존 경로는 그대로입니다") else s
            is WaypointEvent.Timeout -> when {
                !mine(e.requestId) -> s
                s.phase == WaypointPhase.LOOKING -> s.copy(phase = WaypointPhase.FAILED, message = "${NaviError.UNAVAILABLE.label} · 보내지 않았어요")
                s.phase == WaypointPhase.PENDING -> s.copy(phase = WaypointPhase.UNKNOWN_OUTCOME, message = "내비 응답이 없어 추가됐는지 모릅니다 · 목록을 다시 읽는 중 — 그전에는 다시 보내지 않습니다")
                else -> s
            }
            is WaypointEvent.GiveUp ->
                if (mine(e.requestId) && (s.phase == WaypointPhase.UNKNOWN_OUTCOME || s.phase == WaypointPhase.PENDING)) s.copy(phase = WaypointPhase.FAILED, message = "추가됐는지 확인하지 못했어요: ${s.target?.name ?: ""} · 내비게이션에서 확인해 주세요 · 다시 보내지 않았어요") else s
            is WaypointEvent.Invalidate ->
                if (s.phase == WaypointPhase.SLOTS_FULL || s.phase == WaypointPhase.NO_ROUTE) WaypointState(message = e.reason) else s
        }
    }

    /** getWaypointInfo 는 이름만 주고 좌표가 (0, 0)이었다(E24). 좌표가 비었으면 이름으로 본다 */
    fun sameWaypoint(a: NaviPlace, b: NaviPlace): Boolean {
        if (!a.poiId.isNullOrEmpty() && a.poiId == b.poiId) return true
        return if (RouteHandoff.validPlace(a) && RouteHandoff.validPlace(b)) RouteHandoff.samePlace(a, b) else a.name == b.name
    }
}
