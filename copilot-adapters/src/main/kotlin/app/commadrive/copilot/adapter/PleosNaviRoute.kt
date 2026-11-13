package app.commadrive.copilot.adapter

import ai.pleos.playground.navi.constants.NaviErrorCode
import ai.pleos.playground.navi.constants.BookmarkType
import ai.pleos.playground.navi.constants.RouteOption
import ai.pleos.playground.navi.data.BookmarkInfo
import ai.pleos.playground.navi.data.DestinationInfo
import ai.pleos.playground.navi.data.RouteInfo
import ai.pleos.playground.navi.data.RouteStartInfo
import ai.pleos.playground.navi.data.RouteStateInfo
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import android.content.Context
import app.commadrive.core.assistant.NaviError
import app.commadrive.core.assistant.NaviPlace

/**
 * 원탭 다음 이동 — 내비 **경로 요청**. 이 모듈에서 내비 경로를 바꾸는 호출(requestRoute)을 하는 유일한 파일(verifyReadOnly 가 이 파일만 예외로 둔다).
 *
 * 근거(실물 SDK NaviHelper 3.0.5, javap 2026-11-03): `requestRoute(RouteInfo)` @RequiresPermission(NAVI_ROUTE_SEARCH) · `getBookmarkInfo()` → `onBookmarkInfo(List<BookmarkInfo>)`
 * (BookmarkType.HOME) · `getDestinationInfo()` → `onDestinationInfo` · `getRouteStateInfo()` → `onRouteStateInfo(isRouting)` · `onRouteStarted` · `onRoutingCompleted` ·
 * `onDestinationChanged` · `onError(NaviErrorCode)`. 좌표는 (lat, lon) 순서(research 8절).
 *
 * 하는 일은 셋뿐이다 — 판단은 core 의 RouteHandoff 가 한다:
 *  · [lookup]: 집 즐겨찾기 · 지금 경로 여부 · 지금 목적지를 읽어 돌려준다. 경로 여부를 못 읽으면 routingKnown=false — 부르는 쪽은 **보내지 않는다**(모르면 기존 경로를 덮을 수 있다)
 *  · [requestHome]: lookup 에서 받은 **그 즐겨찾기 그대로** requestRoute — 좌표·이름을 지어내지 않는다
 *  · 결과 콜백을 그대로 넘기고, 경로가 바뀌었다는 신호가 오면 목적지를 다시 읽는다(완료 판정은 다시 읽은 목적지로)
 */
class PleosNaviRoute(context: Context) {
    private val navi = NaviHelper(context)
    @Volatile private var homeBookmark: BookmarkInfo? = null

    data class Lookup(val home: NaviPlace?, val current: NaviPlace?, val routingKnown: Boolean)

    interface Events {
        fun onRouteStarted()
        fun onDestination(place: NaviPlace?)
        fun onError(error: NaviError)
    }

    @Volatile private var events: Events? = null
    @Volatile private var pendingLookup: ((Lookup) -> Unit)? = null
    @Volatile private var lkHome: Boolean = false
    @Volatile private var lkRouting: Boolean? = null
    @Volatile private var lkDest: DestinationInfo? = null
    @Volatile private var lkDestSeen = false

    private val listener = object : NaviHelperEventListener {
        override fun onBookmarkInfo(list: List<BookmarkInfo>) {
            homeBookmark = list.firstOrNull { it.category == BookmarkType.HOME }
            lkHome = true; finishLookupIfReady()
        }
        override fun onRouteStateInfo(info: RouteStateInfo) { lkRouting = info.isRouting; finishLookupIfReady() }
        override fun onDestinationInfo(info: DestinationInfo) {
            if (pendingLookup != null) { lkDest = info; lkDestSeen = true; finishLookupIfReady() }
            events?.onDestination(placeOf(info))
        }
        override fun onRouteStarted(info: RouteStartInfo) { events?.onRouteStarted(); navi.getDestinationInfo() }
        override fun onRoutingCompleted() { events?.onRouteStarted(); navi.getDestinationInfo() }
        override fun onDestinationChanged() { navi.getDestinationInfo() }
        override fun onError(code: NaviErrorCode) { events?.onError(errorOf(code)) }
    }

    fun start(onReady: () -> Unit = {}, onFail: (Throwable) -> Unit = {}) {
        navi.initialize({ navi.addListener(listener); onReady() }, onFail)
    }

    fun stop() { runCatching { navi.removeListener(listener) }; runCatching { navi.release() } }

    /** 집 즐겨찾기 · 경로 여부 · 목적지를 한 번에 읽는다. 셋 중 즐겨찾기와 경로 여부는 꼭 와야 하고, 경로 중이면 목적지도 기다린다(시간 제한은 부르는 쪽) */
    fun lookup(onResult: (Lookup) -> Unit) {
        lkHome = false; lkRouting = null; lkDest = null; lkDestSeen = false
        pendingLookup = onResult
        navi.getBookmarkInfo(); navi.getRouteStateInfo(); navi.getDestinationInfo()
    }

    /** 시간 안에 다 못 받았을 때 부르는 쪽이 지금까지 받은 것으로 끝낸다 — 경로 여부를 모르면 routingKnown=false */
    fun finishLookupNow() { pendingLookup?.let { cb -> pendingLookup = null; cb(snapshot()) } }

    private fun finishLookupIfReady() {
        val cb = pendingLookup ?: return
        lkRouting ?: return
        if (!lkHome) return
        if (!lkDestSeen) return // isRouting 은 안내 중에도 false 였다(E24) — 기존 경로 판단은 목적지까지 읽고 한다. 안 오면 부르는 쪽 시간 제한으로 끝낸다
        pendingLookup = null
        cb(snapshot())
    }

    private fun snapshot(): Lookup {
        val routing = lkRouting
        val home = if (lkHome) homeBookmark?.let { NaviPlace(it.name?.ifBlank { null } ?: "집", it.latitude, it.longitude, it.poiId?.takeIf { id -> id.isNotBlank() }) } else null
        val dest = lkDest?.let { placeOf(it) }
        // 경로 중인데 목적지를 못 읽었다 — 모르는 경로를 덮지 않도록 "지금 경로"로 교체 확인을 받게 한다
        val current = dest ?: if (routing == true) NaviPlace("지금 경로", 0.0, 0.0, null) else null
        return Lookup(home, current, routingKnown = routing != null && lkHome && lkDestSeen)
    }

    /** lookup 에서 받은 집 즐겨찾기 그대로 경로 요청 — 없으면 보내지 않는다 */
    fun requestHome(events: Events): Boolean {
        val b = homeBookmark ?: return false
        this.events = events
        return runCatching {
            navi.requestRoute(RouteInfo(b.latitude, b.longitude, b.displayLatitude, b.displayLongitude, b.name ?: "집", b.poiId ?: "", b.address ?: "", b.poiSubId ?: "", RouteOption.RECOMMENDED, b.poiProvider ?: "", false))
        }.isSuccess
    }

    /** 응답이 없을 때 — 목적지를 다시 읽어 결과를 확정한다(재전송하지 않는다) */
    fun reread(events: Events) { this.events = events; navi.getDestinationInfo() }

    fun detach() { events = null }

    private fun placeOf(d: DestinationInfo): NaviPlace? =
        if ((d.latitude == 0.0 && d.longitude == 0.0) || d.name.isNullOrBlank()) null else NaviPlace(d.name ?: "", d.latitude, d.longitude, d.poiId?.takeIf { it.isNotBlank() })

    private fun errorOf(c: NaviErrorCode): NaviError = runCatching { NaviError.valueOf(c.name) }.getOrDefault(NaviError.CAUSE_SEARCH_ROUTE)
}
