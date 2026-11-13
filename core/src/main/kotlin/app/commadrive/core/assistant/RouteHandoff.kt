package app.commadrive.core.assistant

import kotlin.math.cos
import kotlin.math.hypot

/**
 * 원탭 다음 이동 — 귀가 목적지를 내비에 넘기는 요청의 상태. `src/lib/assistant/route-handoff.ts` 의 거울 (V5, 2026-11-03).
 *
 * 근거(실물 SDK NaviHelper 3.0.5, javap 2026-11-03): `requestRoute(RouteInfo)` · `getDestinationInfo()` → `onDestinationInfo` ·
 * `getBookmarkInfo()` → `onBookmarkInfo`(BookmarkType.HOME) · `onRouteStarted` · `onRoutingCompleted` · `onDestinationChanged` · `onError(NaviErrorCode)` ·
 * 권한 `pleos.car.permission.NAVI_ROUTE_SEARCH`.
 * 지키는 것: 없는 주소를 만들지 않음(HOME 즐겨찾기만) · 기존 경로는 교체 확인 뒤에만 · 목적지를 다시 읽어 맞아야 VERIFIED · 늦은 콜백은 그 요청의 것만.
 */
data class NaviPlace(val name: String, val lat: Double, val lon: Double, val poiId: String?)

enum class HandoffPhase { IDLE, LOOKING, NO_HOME, CONFIRM_REPLACE, PENDING, VERIFIED, FAILED, UNKNOWN_OUTCOME }

data class HandoffState(
    val phase: HandoffPhase = HandoffPhase.IDLE,
    val requestId: Int? = null,
    val home: NaviPlace? = null,
    val current: NaviPlace? = null,
    val routed: Boolean = false,
    val message: String? = null,
    /** 모의 내비(폰·JVM)인가 — 결과 문장에 '(모의)'. 실제 내비 확인과 섞지 않는다 */
    val mock: Boolean = false,
)

enum class NaviError(val label: String) {
    CAUSE_LOW_BATTERY("배터리가 부족해 내비가 경로를 만들지 않았습니다"),
    CAUSE_SEARCH_ROUTE_OVER_DISTANCE("거리가 너무 멀어 경로를 찾지 못했습니다"),
    CAUSE_SEARCH_ROUTE("내비가 경로를 찾지 못했습니다"),
    CAUSE_SEARCH_ROUTE_TOO_SHORT_DISTANCE("이미 집 근처라 경로를 만들지 않았습니다"),
    CAUSE_SEARCH_TRIP("내비가 경로를 찾지 못했습니다"),
    PERMISSION("내비 경로 권한이 없습니다"),
    UNAVAILABLE("내비게이션에 연결하지 못했습니다"),
}

sealed interface HandoffEvent {
    data class Start(val requestId: Int, val mock: Boolean = false) : HandoffEvent
    data class Lookup(val requestId: Int, val home: NaviPlace?, val current: NaviPlace?) : HandoffEvent
    data class ConfirmReplace(val requestId: Int) : HandoffEvent
    data object Cancel : HandoffEvent
    data class RouteStarted(val requestId: Int) : HandoffEvent
    data class DestinationRead(val requestId: Int, val place: NaviPlace?) : HandoffEvent
    data class Error(val requestId: Int, val error: NaviError) : HandoffEvent
    data class Timeout(val requestId: Int) : HandoffEvent
    data class Invalidate(val reason: String) : HandoffEvent
}

object RouteHandoff {
    const val SAME_PLACE_M = 100.0

    /**
     * 내비에 저장된 '집'이 어디인지 — 에뮬레이터의 집 즐겨찾기가 '강남역 2호선'이라 "집이라더니 강남역?"으로 읽혔다(demo v1 리뷰 2026-11-11).
     * 앱은 집을 정하지 않는다 — 내비 즐겨찾기 이름을 그대로 옮길 뿐. 이름이 비었거나 '집'으로 시작하면(모의 '집 (시연 데이터)' 포함) 덧붙이지 않는다
     */
    fun savedHome(home: NaviPlace?): String = home?.name?.trim()?.takeIf { it.isNotEmpty() && !it.startsWith("집") }?.let { " · 내비에 저장된 집: $it" } ?: ""

    fun samePlace(a: NaviPlace, b: NaviPlace): Boolean {
        if (a.poiId != null && b.poiId != null && a.poiId.isNotEmpty() && a.poiId == b.poiId) return true
        val dy = (a.lat - b.lat) * 111_000
        val dx = (a.lon - b.lon) * 111_000 * cos(Math.toRadians(a.lat))
        return hypot(dx, dy) <= SAME_PLACE_M
    }

    /** 실제 장소인가 — (0, 0)·범위 밖은 빈 자리. 에뮬레이터 내비는 집을 등록하지 않아도 HOME 즐겨찾기를 (0, 0)으로 돌려줬다(2026-11-03, 보냈더니 Invalid Parameter) */
    fun validPlace(p: NaviPlace?): Boolean =
        p != null && p.lat.isFinite() && p.lon.isFinite() && kotlin.math.abs(p.lat) <= 90 && kotlin.math.abs(p.lon) <= 180 && !(kotlin.math.abs(p.lat) < 1e-6 && kotlin.math.abs(p.lon) < 1e-6)

    /** 어댑터가 이 상태를 보고 requestRoute 를 부른다 */
    fun shouldSend(s: HandoffState) = s.phase == HandoffPhase.PENDING && !s.routed

    private val IDLE = HandoffState()

    fun reduce(s: HandoffState, e: HandoffEvent): HandoffState {
        fun mine(id: Int) = id == s.requestId
        return when (e) {
            is HandoffEvent.Start ->
                if (s.phase == HandoffPhase.LOOKING || s.phase == HandoffPhase.PENDING || s.phase == HandoffPhase.UNKNOWN_OUTCOME) s
                else IDLE.copy(phase = HandoffPhase.LOOKING, requestId = e.requestId, mock = e.mock)
            is HandoffEvent.Lookup -> when {
                !mine(e.requestId) || s.phase != HandoffPhase.LOOKING -> s
                e.home == null || !validPlace(e.home) -> s.copy(phase = HandoffPhase.NO_HOME, current = e.current, message = "내비에 집이 저장돼 있지 않아요 · 내비게이션에서 집을 등록하거나 목적지를 직접 설정해 주세요")
                e.current != null && samePlace(e.current, e.home) -> s.copy(phase = HandoffPhase.VERIFIED, home = e.home, current = e.current, message = "이미 집으로 안내 중이에요${savedHome(e.home)}")
                e.current != null -> s.copy(phase = HandoffPhase.CONFIRM_REPLACE, home = e.home, current = e.current, message = "지금 안내 중인 ${e.current.name} 경로가 집 경로로 바뀌어요${savedHome(e.home)}")
                else -> s.copy(phase = HandoffPhase.PENDING, home = e.home, current = null, message = null)
            }
            is HandoffEvent.ConfirmReplace -> if (mine(e.requestId) && s.phase == HandoffPhase.CONFIRM_REPLACE) s.copy(phase = HandoffPhase.PENDING, message = null) else s
            HandoffEvent.Cancel -> when (s.phase) {
                HandoffPhase.CONFIRM_REPLACE -> IDLE.copy(message = "기존 경로를 그대로 둡니다")
                HandoffPhase.NO_HOME, HandoffPhase.VERIFIED, HandoffPhase.FAILED -> IDLE
                else -> s
            }
            is HandoffEvent.RouteStarted -> if (mine(e.requestId) && (s.phase == HandoffPhase.PENDING || s.phase == HandoffPhase.UNKNOWN_OUTCOME)) s.copy(routed = true) else s
            is HandoffEvent.DestinationRead -> {
                val home = s.home
                when {
                    !mine(e.requestId) || (s.phase != HandoffPhase.PENDING && s.phase != HandoffPhase.UNKNOWN_OUTCOME) || home == null -> s
                    e.place != null && samePlace(e.place, home) -> s.copy(phase = HandoffPhase.VERIFIED, routed = true,
                        message = (if (s.phase == HandoffPhase.UNKNOWN_OUTCOME) "응답은 늦었지만 내비 목적지가 집으로 바뀌어 있어요" else if (s.mock) "시연 내비에 집을 목적지로 설정했어요 (모의)" else "내비 목적지를 집으로 설정했어요 · 내비가 확인함") + savedHome(home))
                    // 아직 경로 콜백 전이면 기다린다 — 요청 직후 읽은 값은 지난 목적지일 수 있다
                    !s.routed && s.phase == HandoffPhase.PENDING -> s
                    else -> s.copy(phase = HandoffPhase.FAILED,
                        message = if (e.place != null) "내비 목적지가 집이 아니에요(${e.place.name}) · 내비게이션에서 확인해 주세요" else "내비 목적지를 확인하지 못했어요 · 내비게이션에서 직접 확인해 주세요")
                }
            }
            is HandoffEvent.Error ->
                if (mine(e.requestId) && (s.phase == HandoffPhase.LOOKING || s.phase == HandoffPhase.PENDING || s.phase == HandoffPhase.UNKNOWN_OUTCOME))
                    s.copy(phase = HandoffPhase.FAILED, message = "${e.error.label} · 기존 경로는 그대로입니다") else s
            is HandoffEvent.Timeout -> when {
                !mine(e.requestId) -> s
                s.phase == HandoffPhase.LOOKING -> s.copy(phase = HandoffPhase.FAILED, message = "${NaviError.UNAVAILABLE.label} · 기존 경로는 그대로입니다")
                s.phase == HandoffPhase.PENDING -> s.copy(phase = HandoffPhase.UNKNOWN_OUTCOME, message = "내비 응답이 없어 설정됐는지 모릅니다 · 목적지를 다시 읽는 중 — 그전에는 다시 보내지 않습니다")
                else -> s
            }
            is HandoffEvent.Invalidate -> if (s.phase == HandoffPhase.CONFIRM_REPLACE || s.phase == HandoffPhase.NO_HOME) IDLE.copy(message = e.reason) else s
        }
    }

    fun button(s: HandoffState): String? = when (s.phase) {
        HandoffPhase.IDLE, HandoffPhase.FAILED -> "집으로 안내 시작"
        HandoffPhase.CONFIRM_REPLACE -> "집 경로로 바꾸기"
        else -> null
    }
}
