package app.commadrive.app

import android.content.Context
import app.commadrive.adapter.PleosNavigationProvider
import app.commadrive.adapter.PleosVehicleStateProvider
import app.commadrive.core.VehicleSnapshot
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * 차량·내비 연결 — **실제 Pleos SDK 에 먼저 붙어 보고, 안 되면 시연 모드로 물러난다.**
 *
 * 둘을 따로 본다. 차량은 붙었는데 내비는 안 붙는 경우가 있고(권한·서비스 버전), 그때 한쪽을 모의로
 * 채우면서 "연결됨"이라고 말하면 Mock 과 실제를 섞어 말하는 것이 된다(CLAUDE.md 정책 4). 화면은 두 상태를 각각 띄운다.
 *
 * 일반 폰처럼 Pleos 서비스가 없는 기기에서는 바인딩이 조용히 실패하거나 예외를 던진다 — 어느 쪽이든
 * [TIMEOUT_MS] 안에 첫 값이 오지 않으면 DEMO 다. 앱이 멈추지 않는 것이 먼저다.
 */
enum class Link(val label: String) { CONNECTING("연결 중"), LIVE("연결됨"), DEMO("시연 모드") }

class CarLink(private val context: Context, private val scope: CoroutineScope) {
    private val _vehicle = MutableStateFlow(Link.CONNECTING)
    private val _navi = MutableStateFlow(Link.CONNECTING)
    private val _snapshot = MutableStateFlow<VehicleSnapshot?>(null)

    val vehicleLink: StateFlow<Link> = _vehicle
    val naviLink: StateFlow<Link> = _navi
    /** 실제 차량 값. DEMO 면 늘 null — 시연 값은 ViewModel 이 따로 들고 있다 */
    val snapshot: StateFlow<VehicleSnapshot?> = _snapshot

    private var vehicle: PleosVehicleStateProvider? = null
    private var pendingNavi: PleosNavigationProvider? = null
    var navi: PleosNavigationProvider? = null
        private set

    fun start() {
        scope.launch {
            runCatching {
                val p = PleosVehicleStateProvider(context)
                p.onChange = {
                    scope.launch {
                        val snap = runCatching { p.snapshot() }.getOrNull()
                        if (snap != null && _vehicle.value != Link.DEMO) {
                            _snapshot.value = snap
                            _vehicle.value = Link.LIVE
                        }
                    }
                }
                p.start()
                vehicle = p
            }.onFailure { _vehicle.value = Link.DEMO }
            delay(TIMEOUT_MS)
            if (_vehicle.value == Link.CONNECTING) {
                _vehicle.value = Link.DEMO
                runCatching { vehicle?.stop() }
                vehicle = null
            }
        }
        scope.launch {
            runCatching {
                val n = PleosNavigationProvider(context)
                pendingNavi = n
                n.start(
                    onReady = { if (_navi.value != Link.DEMO) { navi = n; _navi.value = Link.LIVE } },
                    onFail = { _navi.value = Link.DEMO },
                )
            }.onFailure { _navi.value = Link.DEMO }
            delay(TIMEOUT_MS)
            if (_navi.value == Link.CONNECTING) {
                _navi.value = Link.DEMO
                // 서비스가 없는 기기에서 SDK 가 계속 재연결을 시도한다(실기기 로그) — 시연 모드로 정했으면 놓아 준다
                runCatching { pendingNavi?.stop() }
            }
            pendingNavi = null
        }
    }

    fun stop() {
        runCatching { vehicle?.stop() }
        runCatching { navi?.stop() }
    }

    private companion object {
        /**
         * 부하 걸린 에뮬레이터에서 Vehicle 바인딩이 6초 걸려 4초 제한에 DEMO 로 물러났다(RESULT E3).
         * 기다리는 동안에도 화면은 시연 값으로 돌고 배지가 "연결 중"이라 멈추지 않는다 — 넉넉히 둔다.
         */
        const val TIMEOUT_MS = 10_000L
    }
}
