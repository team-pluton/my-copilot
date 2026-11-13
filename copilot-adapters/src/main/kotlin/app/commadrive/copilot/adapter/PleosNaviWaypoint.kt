package app.commadrive.copilot.adapter

import ai.pleos.playground.navi.constants.NaviErrorCode
import ai.pleos.playground.navi.constants.WaypointCmdType
import ai.pleos.playground.navi.constants.WaypointIndex
import ai.pleos.playground.navi.data.DestinationInfo
import ai.pleos.playground.navi.data.RequestWaypointInfo
import ai.pleos.playground.navi.data.RouteStateInfo
import ai.pleos.playground.navi.data.TripInfo
import ai.pleos.playground.navi.data.TripRequest
import ai.pleos.playground.navi.data.WaypointChangedInfo
import ai.pleos.playground.navi.data.WaypointInfo
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import android.content.Context
import android.util.Log
import app.commadrive.core.assistant.NaviError
import app.commadrive.core.assistant.NaviPlace

/**
 * V6 — 승인 후 경유지 요청. 판단은 core 의 WaypointHandoff 가 하고 여기서는 읽고 보내고 콜백을 넘긴다.
 * 근거(실물 SDK NaviHelper 3.0.5, javap 2026-11-04): addWaypoint · removeWaypoint · getWaypointInfo → onWayPointInfo · onWaypointChanged(index, cmdType, routeStartInfo) ·
 * getRouteStateInfo → onRouteStateInfo · requestTrip → onTripInfo. RequestWaypointInfo(lat, lon, poiName, index, poiId, address, poiSubId, poiProvider).
 *
 * ⚠️ `RouteStateInfo.isRouting` 은 **안내 중이어도 false** 였다(에뮬레이터 2026-11-04, E24) — 경로 여부는 목적지 재조회까지 함께 본다. 목적지가 있으면 경로가 있는 것이다.
 * 경로 여부나 경유지 목록 중 하나라도 못 읽으면 routing=null — 부르는 쪽이 **보내지 않는다**. 기존 경유지를 모른 채 슬롯을 고를 수 없다.
 */
class PleosNaviWaypoint(context: Context) {
    private val navi = NaviHelper(context)

    interface Events {
        fun onAck()
        fun onWaypoints(list: List<NaviPlace>)
        fun onError(error: NaviError)
    }

    @Volatile private var events: Events? = null
    @Volatile private var pendingLookup: ((Boolean?, List<NaviPlace>) -> Unit)? = null
    @Volatile private var lkRouting: Boolean? = null
    @Volatile private var lkList: List<NaviPlace>? = null
    @Volatile private var lkDestSeen = false
    @Volatile private var lkHasDest = false
    @Volatile private var pendingAdd: RequestWaypointInfo? = null
    @Volatile private var onTrip: ((TripInfo) -> Unit)? = null

    private val listener = object : NaviHelperEventListener {
        override fun onRouteStateInfo(info: RouteStateInfo) { Log.d(TAG, "routeState routing=${info.isRouting} remainCharge=${info.remainDestinationChargingInt} waypointCharge=${info.remainWaypointChargingInt}"); lkRouting = info.isRouting; finishIfReady() }
        override fun onDestinationInfo(info: DestinationInfo) {
            lkHasDest = !(info.latitude == 0.0 && info.longitude == 0.0) && !info.name.isNullOrBlank()
            lkDestSeen = true
            Log.d(TAG, "destination name=${info.name} has=$lkHasDest")
            finishIfReady()
        }
        override fun onWayPointInfo(list: List<WaypointInfo>) {
            val places = list.map { NaviPlace(it.name, it.latitude, it.longitude, it.poiId.takeIf { id -> id.isNotBlank() }) }
            Log.d(TAG, "waypoints $places")
            lkList = places
            finishIfReady()
            events?.onWaypoints(places)
        }
        override fun onWaypointChanged(info: WaypointChangedInfo) {
            Log.d(TAG, "waypointChanged index=${info.index} cmd=${info.cmdType}")
            if (info.cmdType == WaypointCmdType.REMOVE) { pendingAdd?.let { pendingAdd = null; navi.addWaypoint(it) }; return }
            events?.onAck()
            navi.getWaypointInfo()
        }
        override fun onTripInfo(info: TripInfo) { Log.d(TAG, "trip distance=${info.distance} eta=${info.eta} socAtDest=${info.estimatedSocAtDest} energy=${info.energyConsumption} points=${info.summary.routePoints}"); onTrip?.invoke(info) }
        override fun onError(code: NaviErrorCode) { Log.d(TAG, "error $code"); events?.onError(runCatching { NaviError.valueOf(code.name) }.getOrDefault(NaviError.CAUSE_SEARCH_ROUTE)) }
    }

    fun start(onReady: () -> Unit = {}, onFail: (Throwable) -> Unit = {}) { navi.initialize({ navi.addListener(listener); onReady() }, onFail) }
    fun stop() { runCatching { navi.removeListener(listener) }; runCatching { navi.release() } }

    fun lookup(onResult: (routing: Boolean?, waypoints: List<NaviPlace>) -> Unit) {
        lkRouting = null; lkList = null; lkDestSeen = false; lkHasDest = false
        pendingLookup = onResult
        navi.getRouteStateInfo(); navi.getDestinationInfo(); navi.getWaypointInfo()
    }

    private fun finishIfReady() {
        val cb = pendingLookup ?: return
        val state = lkRouting ?: return
        if (!state && !lkDestSeen) return // isRouting=false 만으로는 경로가 없다고 하지 않는다
        val routing = state || lkHasDest
        // 경로가 없으면 목록은 볼 필요가 없다(경유지 추가 자체를 하지 않는다)
        if (!routing) { pendingLookup = null; cb(false, emptyList()); return }
        val list = lkList ?: return
        pendingLookup = null
        cb(true, list)
    }

    /** 시간 안에 못 받았다 — 경로 여부나 목록을 모르면 null. 빈 목록으로 추측하지 않는다 */
    fun finishLookupNow() { pendingLookup?.let { cb -> pendingLookup = null; val l = lkList; val known = lkRouting == true || lkDestSeen; val routing = lkRouting == true || lkHasDest; if (!known) cb(null, emptyList()) else if (!routing) cb(false, emptyList()) else if (l != null) cb(true, l) else cb(null, emptyList()) } }

    /** existingCount 칸 뒤에 추가하거나, 사용자가 고른 칸을 교체한다(그 칸만 지운 뒤 콜백을 받고 추가) */
    fun add(target: NaviPlace, existingCount: Int, replaceIndex: Int?, events: Events): Boolean {
        this.events = events
        return runCatching {
            val index = indexOf(replaceIndex ?: existingCount)
            val info = RequestWaypointInfo(target.lat, target.lon, target.name, index, target.poiId ?: "", "", "", "")
            if (replaceIndex != null) { pendingAdd = info; navi.removeWaypoint(index) } else navi.addWaypoint(info)
        }.onFailure { Log.d(TAG, "add failed $it") }.isSuccess
    }

    fun reread(events: Events) { this.events = events; navi.getWaypointInfo() }
    fun detach() { events = null }

    /** 후보까지의 내비 계산을 읽는다. 지금은 로그로 근거만 모은다(G4) — 값의 단위를 확인하기 전에는 판단에 넣지 않는다 */
    fun probeTrip(target: NaviPlace, result: (TripInfo) -> Unit = {}) {
        onTrip = result
        runCatching { navi.requestTrip(TripRequest(target.lat, target.lon, target.poiId ?: "", target.name, "")) }.onFailure { Log.d(TAG, "trip failed $it") }
    }

    private fun indexOf(i: Int) = if (i <= 0) WaypointIndex.FIRST else WaypointIndex.SECOND

    private companion object { const val TAG = "CoPilotV6" }
}
