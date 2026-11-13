package app.commadrive.adapter

import ai.pleos.playground.navi.constants.NaviErrorCode
import ai.pleos.playground.navi.constants.WaypointCmdType
import ai.pleos.playground.navi.constants.WaypointIndex
import ai.pleos.playground.navi.data.DestinationInfo
import ai.pleos.playground.navi.data.RequestWaypointInfo
import ai.pleos.playground.navi.data.RouteStateInfo
import ai.pleos.playground.navi.data.TripInfo
import ai.pleos.playground.navi.data.WaypointArrivedInfo
import ai.pleos.playground.navi.data.WaypointChangedInfo
import ai.pleos.playground.navi.data.WaypointInfo
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import android.content.Context
import app.commadrive.core.GeoPoint
import app.commadrive.core.NavResult
import app.commadrive.core.NavigationProvider
import app.commadrive.core.RestStop
import app.commadrive.core.SdkUnits
import app.commadrive.core.TripRoute
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/**
 * NavigationProvider 를 **실제 NaviHelper v3.0.5** 로 구현한다. 시그니처는 공식 저장소의 AAR 에서 javap 로 읽었다(2026-10-25).
 *
 * 원칙 (CLAUDE.md 정책 1):
 *  - 요청 성공 ≠ 추가됨. `onWaypointChanged(cmdType = ADD, index = 우리가 요청한 슬롯)` 이 와야 Added 다.
 *  - 슬롯은 FIRST · SECOND 두 개. 차 있으면 기존 경유지를 지우지 않고 SlotFull 을 돌려준다.
 *  - 10초 안에 콜백이 없으면 Unavailable — 경로는 건드리지 않는다.
 *
 * 문서에 없던 것(실물에서 확인): RouteStateInfo.remainDestinationChargingInt · remainWaypointChargingInt,
 * TripInfo.estimatedSocAtDest — **내비가 도착 시 잔량을 이미 예측한다.** 우리는 그 값을 주행 구간의 기준으로 쓰고,
 * 그 뒤(도착 후 대기·귀가·동승자 조건·재판단)를 더한다. 단위(%)는 에뮬레이터에서 확인해야 한다.
 */
class PleosNavigationProvider(context: Context) : NavigationProvider {
    private val navi = NaviHelper(context)

    @Volatile private var routeState: RouteStateInfo? = null
    @Volatile private var waypoints: List<WaypointInfo> = emptyList()
    @Volatile private var destination: DestinationInfo? = null
    @Volatile private var trip: TripInfo? = null

    /** 경유지 도착 — 도착 화면(06)과 재계산을 부른다 */
    var onWaypointArrived: ((name: String, index: WaypointIndex) -> Unit)? = null

    private val stateListener = object : NaviHelperEventListener {
        override fun onRouteStateInfo(info: RouteStateInfo) { routeState = info }
        override fun onWayPointInfo(list: List<WaypointInfo>) { waypoints = list }
        override fun onDestinationInfo(info: DestinationInfo) { destination = info }
        override fun onTripInfo(info: TripInfo) { trip = info }
        override fun onWayPointArrived(info: WaypointArrivedInfo) { onWaypointArrived?.invoke(info.name, info.index) }
        override fun onWaypointChanged(info: WaypointChangedInfo) { navi.getWaypointInfo() } // 슬롯 수를 다시 읽는다
    }

    fun start(onReady: () -> Unit = {}, onFail: (Throwable) -> Unit = {}) {
        navi.initialize({
            navi.addListener(stateListener)
            navi.getRouteStateInfo(); navi.getWaypointInfo(); navi.getDestinationInfo()
            onReady()
        }, onFail)
    }

    /** 목적지·경로·경유지를 다시 읽는다 — 시작 때 한 번만 읽으면 사용자가 나중에 잡은 목적지를 모른다(v6 에뮬레이터 관찰) */
    fun refresh() {
        navi.getRouteStateInfo(); navi.getWaypointInfo(); navi.getDestinationInfo()
    }

    /**
     * 내비에 목적지가 잡혀 있는가. `isRouting` 은 안내 중에도 false 였다(research 16절) — 목적지 값으로 본다.
     * 목적지 없이 addWaypoint 를 보내면 콜백 없이 내비 검색 화면이 뜬다(RESULT §7, E11).
     */
    val hasDestination: Boolean
        get() = destination?.let { SdkUnits.remainingKm(it.remainDistance, it.latitude, it.longitude) } != null

    fun stop() {
        navi.removeListener(stateListener)
        navi.release()
    }

    /** 내비가 예측한 목적지 도착 잔량(%). 경로가 없거나 범위를 벗어나면 null → 우리 추정을 쓴다 */
    fun naviArrivalSocPct(): Int? = routeState?.takeIf { it.isRouting }?.remainDestinationChargingInt?.takeIf { it in 0..100 }

    /** 경유지별 도착 잔량(%) — 우리 후보의 "도착 시 약 N%" 를 내비 값으로 바꿀 수 있다 */
    fun naviWaypointSocPct(): List<Int> = routeState?.remainWaypointChargingInt.orEmpty()

    override suspend fun currentTrip(): TripRoute? {
        val d = destination ?: return null
        // remainDistance 는 m. 목적지가 없으면 0m · (0,0) 이 온다(에뮬레이터 RESULT §7-4) — 그때는 경로 없음(null).
        // 0km 를 여정 거리로 쓰면 "주행 0% · 충분"이 된다.
        val km = SdkUnits.remainingKm(d.remainDistance, d.latitude, d.longitude) ?: return null
        return TripRoute(GeoPoint(d.latitude, d.longitude), km, waypoints.size)
    }

    override suspend fun addStop(stop: RestStop): NavResult {
        val used = waypoints.size
        if (used >= 2) return NavResult.SlotFull(used)
        val index = if (used == 0) WaypointIndex.FIRST else WaypointIndex.SECOND
        return withTimeoutOrNull(CALLBACK_TIMEOUT_MS) {
            suspendCancellableCoroutine { cont ->
                val listener = object : NaviHelperEventListener {
                    override fun onWaypointChanged(info: WaypointChangedInfo) {
                        if (info.cmdType == WaypointCmdType.ADD && info.index == index && cont.isActive) {
                            navi.removeListener(this); cont.resume(NavResult.Added)
                        }
                    }
                    override fun onError(code: NaviErrorCode) {
                        if (cont.isActive) { navi.removeListener(this); cont.resume(NavResult.Failed(code.name)) }
                    }
                }
                navi.addListener(listener)
                cont.invokeOnCancellation { navi.removeListener(listener) }
                navi.addWaypoint(
                    RequestWaypointInfo(
                        latitude = stop.location.lat,
                        longitude = stop.location.lon,
                        poiName = stop.name,
                        waypointIndex = index,
                        // 실물 SDK 에서 필수 인자(문서 예시엔 없었다 — 컴파일러가 잡았다). 우리 데이터의 id·이름을 그대로 넘긴다
                        poiId = stop.id,
                        address = stop.name,
                        poiSubId = "",
                    ),
                )
            }
        } ?: NavResult.Unavailable
    }

    private companion object {
        const val CALLBACK_TIMEOUT_MS = 10_000L
    }
}
