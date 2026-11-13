package app.commadrive.copilot

import ai.pleos.playground.vehicle.Vehicle
import android.content.Context
import android.content.pm.PackageManager
import app.commadrive.app.CarLink
import app.commadrive.app.Link
import app.commadrive.copilot.adapter.AaosJourneySignalSource
import app.commadrive.copilot.adapter.PleosCabinControl
import app.commadrive.copilot.adapter.PleosCabinStateSource
import app.commadrive.copilot.adapter.PleosNaviRoute
import app.commadrive.copilot.adapter.PleosNaviWaypoint
import app.commadrive.core.VehicleSnapshot
import app.commadrive.core.assistant.CabinControl
import app.commadrive.core.assistant.CabinState
import app.commadrive.core.assistant.JourneySignals
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

/**
 * 실제 차량 연결 — Pleos Connect(AAOS) 차량·에뮬레이터에서만 실제 신호를 넣고, 아니면 아무것도 넣지 않는다(모의 그대로).
 *
 *  · 주행 신호: AAOS Car API(CarUxRestrictions · 속도 · 기어 · 주차 브레이크) — copilot-adapters 의 AaosJourneySignalSource 를 소스 그대로.
 *    `android.car` 는 차량에만 있는 라이브러리라 **Automotive 기능이 있는 기기에서만** 클래스를 건드린다(폰에서는 로드조차 안 한다).
 *  · 배터리·효율: 출품 앱의 CarLink(Pleos Vehicle SDK, 안 되면 4초 뒤 시연 모드) 그대로.
 *  · 공조 설정 온도·도어: copilot-adapters 의 PleosCabinStateSource(읽기만). 출품 앱의 CarLink 는 Vehicle 인스턴스를 내놓지 않고
 *    출품본은 손대지 않으므로(오너 규칙) 여기서 **두 번째 Vehicle** 을 initialize 한다 — SDK 는 앱 안에서 인스턴스를 여럿 허용했다(에뮬레이터 2026-10-29).
 *
 *  · 공조 온도·시트 **제어**: copilot-adapters 의 PleosCabinControl — 같은 Vehicle 로. 승인 뒤에만 부른다(CopilotViewModel.applyCabin · confirmClimate).
 *
 * Pleos Connect Emulator v2.1.0 에서 확인(2026-10-29): 주행 신호 콜백 · EvBattery SOC 콜백 · NaviHelper 3.0.4 연결 · 공조 설정 온도 조회·변경 콜백.
 */
class VehicleBridge(private val context: Context, private val scope: CoroutineScope) {
    /** 이 기기가 차량(AAOS)인가 — 폰·Robolectric 은 false */
    val automotive: Boolean = context.packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)
    private var journey: Any? = null
    private var cabin: PleosCabinStateSource? = null
    private var cabinVehicle: Vehicle? = null
    /** 실내 제어 — 차량(AAOS)에서 Vehicle 이 붙었을 때만. 폰·JVM 은 null → 모의 응답 */
    var cabinControl: CabinControl? = null
        private set
    /** 원탭 다음 이동 — 차량(AAOS)에서 NaviHelper 가 붙었을 때만. 폰·JVM 은 null → 모의 내비(화면에 '(모의)') */
    var naviRoute: PleosNaviRoute? = null
        private set
    /** V6 경유지 요청 — 차량(AAOS)에서 NaviHelper 가 붙었을 때만. 폰·JVM 은 null → 모의 내비 */
    var naviWaypoint: PleosNaviWaypoint? = null
        private set
    private val carLink = CarLink(context, scope)
    val vehicleLink get() = carLink.vehicleLink

    fun start(onSignals: (JourneySignals) -> Unit, onVehicle: (VehicleSnapshot) -> Unit, onCabin: (CabinState) -> Unit) {
        // 문서용 JVM 화면 캡처(Robolectric)는 서비스 바인딩을 이름 없이 "성공"시켜 Pleos SDK 가 죽는다 — 그때만 연결하지 않는다.
        // 폰에서는 바인딩이 실패하고 CarLink 가 4초 뒤 시연 모드로 물러난다(출품 앱 실기기에서 확인한 경로)
        if (System.getProperty("copilot.noVehicle") == "true") return
        if (automotive) {
            // 콜백은 바인더 스레드에서 온다 — 세션은 메인에서만 바꾼다
            val src = AaosJourneySignalSource(context, remainingKm = { null })
            runCatching { src.start { sig -> scope.launch(Dispatchers.Main) { onSignals(sig) } } }
            journey = src
            runCatching {
                val v = Vehicle(context).also { it.initialize() }
                val c = PleosCabinStateSource(v)
                // 에뮬레이터 검증용 로그 — 시트 단계 인코딩(E19)·재조회 값을 adb logcat 으로 본다
                c.start { state -> android.util.Log.d("CoPilotCabin", state.toString()); scope.launch(Dispatchers.Main) { onCabin(state) } }
                cabinVehicle = v
                cabin = c
                cabinControl = object : CabinControl {
                    val real = PleosCabinControl(v)
                    fun <T> tap(what: String, ok: (T) -> Unit, err: (String) -> Unit): Pair<(T) -> Unit, (String) -> Unit> =
                        Pair({ x: T -> android.util.Log.d("CoPilotCabin", "$what applied=$x"); ok(x) }, { e: String -> android.util.Log.d("CoPilotCabin", "$what error=$e"); err(e) })
                    override fun setHvacTempC(c: Double, onApplied: (Double) -> Unit, onError: (String) -> Unit) { val (a, b) = tap("setHvacTempC($c)", onApplied, onError); real.setHvacTempC(c, a, b) }
                    override fun setSeatVent(on: Boolean, onApplied: (Int) -> Unit, onError: (String) -> Unit) { val (a, b) = tap("setSeatVent($on)", onApplied, onError); real.setSeatVent(on, a, b) }
                    override fun setSeatHeat(on: Boolean, onApplied: (Int) -> Unit, onError: (String) -> Unit) { val (a, b) = tap("setSeatHeat($on)", onApplied, onError); real.setSeatHeat(on, a, b) }
                }
            }
        }
        if (automotive) runCatching {
            val n = PleosNaviRoute(context)
            n.start(onReady = { android.util.Log.d("CoPilotNavi", "NaviHelper ready"); naviRoute = n }, onFail = { android.util.Log.d("CoPilotNavi", "NaviHelper fail $it") })
        }
        if (automotive) runCatching {
            val n = PleosNaviWaypoint(context)
            n.start(onReady = { android.util.Log.d("CoPilotV6", "waypoint NaviHelper ready"); naviWaypoint = n }, onFail = { android.util.Log.d("CoPilotV6", "waypoint NaviHelper fail $it") })
        }
        carLink.start()
        // 에뮬레이터에서 본 것(2026-10-29): CarLink 는 snapshot 을 먼저 놓고 그다음 LIVE 로 바꾼다. snapshot 만 모으면 첫 값은 CONNECTING 중에 지나가고
        // 같은 값의 두 번째 콜백은 StateFlow 가 삼켜 "배터리 차량 정보"가 영영 안 켜졌다 — 둘을 합쳐 본다
        scope.launch {
            combine(carLink.snapshot, carLink.vehicleLink) { snap, link -> snap to link }
                .collect { (snap, link) -> if (snap != null && link == Link.LIVE) onVehicle(snap) }
        }
    }

    fun stop() {
        if (automotive) (journey as? AaosJourneySignalSource)?.let { runCatching { it.stop() } }
        journey = null
        runCatching { cabin?.stop() }
        runCatching { cabinVehicle?.release() }
        cabin = null
        cabinVehicle = null
        cabinControl = null
        runCatching { naviRoute?.stop() }
        naviRoute = null
        runCatching { naviWaypoint?.stop() }
        naviWaypoint = null
        carLink.stop()
    }
}
