package app.commadrive.copilot

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.commadrive.app.DemoData
import app.commadrive.app.Speaker
import app.commadrive.core.RestStop
import app.commadrive.core.assistant.ActionEvent
import app.commadrive.core.assistant.ActionPhase
import app.commadrive.core.assistant.CabinBatchPhase
import app.commadrive.core.assistant.CabinKey
import app.commadrive.core.assistant.CabinOutcome
import app.commadrive.core.assistant.ControlSource
import app.commadrive.core.assistant.CopilotSession
import app.commadrive.core.assistant.DriveLevel
import app.commadrive.core.assistant.HandoffEvent
import app.commadrive.core.assistant.HandoffPhase
import app.commadrive.core.assistant.NaviError
import app.commadrive.core.assistant.NaviPlace
import app.commadrive.core.assistant.RouteHandoff
import app.commadrive.copilot.adapter.PleosNaviRoute
import kotlinx.coroutines.CompletableDeferred
import app.commadrive.core.assistant.JourneyFact
import app.commadrive.core.assistant.Intent
import app.commadrive.core.assistant.SessionState
import app.commadrive.core.assistant.SessionView
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume
import kotlin.math.abs

/**
 * 화면과 세션 사이 — 판단은 [CopilotSession](core, JVM 테스트로 고정)이 하고, 여기서는 **시간과 차량 연결**만 다룬다:
 *  · Pleos 차량·에뮬레이터: [VehicleBridge] 가 실제 주행 신호(AAOS)·배터리(Pleos Vehicle)를 넣는다 — 그때는 모의 주행을 돌리지 않는다
 *  · 그 밖(폰·JVM): 모의 주행 재생(1분 = 0.4초) · 모의 공조 응답(웹 시연과 같은 6갈래) · 경유지 응답. 화면에 늘 "모의"라고 적는다
 *  · 창이 보이지 않으면(다른 앱이 앞에 옴 · 창 이동) 모의 타이머와 음성을 멈춘다 — Pleos: "백그라운드에서는 타이머·폴링 최소화"
 */
enum class ControlMode(val label: String) { SUCCESS("성공"), PARTIAL("일부만 성공"), ERROR("거절"), TIMEOUT("응답 없음"), LATE("늦게 적용"), MISMATCH("값 불일치"), UNREADABLE("읽기 불가") }

enum class Tab(val label: String) { HOME("홈"), DETAIL("자세히"), PREPARE("출발 준비"), ENERGY("에너지"), STOPS("후보"), FINISH("하차"), HISTORY("기록"), PROFILE("프로필") }

class CopilotViewModel(app: Application) : AndroidViewModel(app) {
    private val session = CopilotSession(DemoData.stops)
    private val speaker = Speaker(app)

    var state by mutableStateOf(SessionState())
        private set
    var view: SessionView by mutableStateOf(session.view(state))
        private set
    var tab by mutableStateOf(Tab.HOME)
    /** "자세히"를 눌렀을 때만 탭 줄을 보인다 — 메인은 한 화면(ONE SCREEN UX) */
    var more by mutableStateOf(false)
    var controlMode by mutableStateOf(ControlMode.SUCCESS)
    var addingId by mutableStateOf<String?>(null)
        private set
    val voiceEngine get() = speaker.engineLabel

    private var ticker: Job? = null
    private var lastSpoken: String? = null
    /** 앱 창이 보이는가 — Activity 의 ON_START/ON_STOP. 창이 둘이어도 보이면 true(멀티 윈도우에서 포커스는 따지지 않는다) */
    private var foreground = true
    private val bridge = VehicleBridge(app, viewModelScope)
    /** 차량(AAOS) 기기인가 — 화면 출처 표시용 */
    val automotive get() = bridge.automotive
    /** 디버그 빌드인가 — 차량에서 개발용 조작판을 보일지 */
    val debuggable = (app.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0

    /** V6 통합 판단 — 세션과 분리해 충전소 API 실패가 Mission 을 건드리지 못하게 */
    val decisions = DecisionController(viewModelScope, { bridge.naviWaypoint }, { state }, bridge.automotive)

    /** 진행 중 Mission 스냅샷(V5) — 프로세스가 죽어도 확인된 상태를 이어서 간다. JVM 테스트(폰·차량 없음)에서는 저장하지 않는다 */
    private val store = if (System.getProperty("copilot.noVehicle") == "true") null else MissionStore(app)

    init {
        // 앱이 켜질 때 한 번 — 진행 중(출발 준비 이후 · 완료 전)이던 Mission 이 있으면 되살린다. 여정 단계는 지금 차 신호로 다시 판단한다(세션 restore)
        store?.load()?.let { snap ->
            state = session.restore(snap, state)
            view = session.view(state)
        }
        // 개발용 모의 주행 스위치(E22) — 켜져 있으면 실제 주행 신호 콜백을 버린다(배터리·공조는 그대로 실제). 운전자 화면에는 없다
        bridge.start(onSignals = { if (!mockDrive) send(Intent.LiveSignals(it)) }, onVehicle = { decisions.markVehicleRead(); android.util.Log.d("CoPilotV6", "vehicle soc=${it.batteryPct} rawCapacity=${it.batteryKwh}"); send(Intent.LiveVehicle(it.copy(batteryKwh = JourneyFact.capacityToKwh(it.batteryKwh) ?: it.batteryKwh))) }, onCabin = { send(Intent.LiveCabin(it)) })
    }

    /**
     * 에뮬레이터 한계(2026-11-03): 속도 신호가 없고(`CAR_SPEED` 정의 없음) CarUxRestrictions 가 꺼짐이라 기어 D 만으로는 움직임을 "모름"으로 본다(보수적) → 여정 단계가 출발 준비에 머문다.
     * 개발용 조작판에서만 실제 주행 신호를 끊고 모의 주행으로 단계를 넘긴다. 실제 신호 콜백은 1초마다 와서 한 번 비우는 것으로는 안 되기에 스위치가 켜진 동안 계속 버린다
     */
    var mockDrive by mutableStateOf(false)
        private set
    fun useMockDrive() { mockDrive = true; send(Intent.SetCar(state.car.copy(aaos = null))) }

    /** 개발용 — 저장한 스냅샷으로 되돌린다(프로세스 종료 없이 복원을 보여 주려고). 없으면 알린다 */
    fun restoreFromStore() {
        val snap = store?.load()
        if (snap == null) { send(Intent.ClearToast); state = state.copy(toast = "복원할 진행 중 이동이 없습니다 · 출발 준비 이후부터 저장됩니다"); view = session.view(state); return }
        state = session.restore(snap, state.copy(car = state.car))
        view = session.view(state)
    }

    fun send(i: Intent) {
        state = session.reduce(state, i)
        view = session.view(state)
        store?.save(session.snapshot(state))
        // 실제 주행 신호가 있으면 모의 주행을 돌리지 않는다 — 실제 차의 움직임을 시연 값으로 덮지 않게
        if (state.car.aaos == null && foreground && state.car.speedKmh > 0 && ticker?.isActive != true) startTicker()
        speakWhileDriving()
    }

    fun setForeground(visible: Boolean) {
        foreground = visible
        if (visible) decisions.onForeground()
        if (!visible) ticker?.cancel() else send(Intent.ClearToast)
    }

    private fun startTicker() {
        ticker = viewModelScope.launch {
            while (foreground && state.car.aaos == null && state.car.speedKmh > 0) { delay(400); send(Intent.Tick) }
        }
    }

    /** 주행 중에는 화면 대신 음성 — 제안이 바뀔 때 한 번만(같은 말을 되풀이하지 않는다) */
    private fun speakWhileDriving() {
        val top = view.suggestions.top
        // 문제가 없으면(QUIET) 주행 중 말하지 않는다 — 확인할 것이 있을 때 한 번
        if (!foreground || !view.restricted || view.drive.level != DriveLevel.ATTENTION || !state.profile.voice || top == null) return
        val line = "${top.title}. ${top.explanation}"
        if (line == lastSpoken) return
        lastSpoken = line
        speaker.say(line)
    }

    /** 실제 실내 제어가 가능한가 — 차량(AAOS)에서 Vehicle 이 붙었고 공조 콜백이 실제로 온 뒤에만. 그 전에는 모의 응답(화면에 "모의") */
    private val liveControl get() = bridge.cabinControl?.takeIf { state.car.cabinLive }

    /** 차량 콜백을 한 번 기다린다 — 4초 안에 안 오면 응답 없음(출품 앱 CarLink 와 같은 시간). 거절은 실패 Result */
    private suspend fun <T> await(call: ((T) -> Unit, (String) -> Unit) -> Unit): Result<T>? =
        withTimeoutOrNull(CONTROL_TIMEOUT_MS) {
            suspendCancellableCoroutine { c ->
                call({ v -> if (c.isActive) c.resume(Result.success(v)) }, { e -> if (c.isActive) c.resume(Result.failure(IllegalStateException(e))) })
            }
        }

    /** 공조 확인 → 세션이 다시 검사하고 보낸다. 실차는 PleosCabinControl 콜백, 모의 차량은 웹 시연과 같은 시간표로 응답한다 */
    fun confirmClimate() {
        send(Intent.ConfirmClimate)
        val id = state.action.requestId ?: return
        if (state.action.phase != ActionPhase.PENDING) return
        val target = state.action.target ?: return
        val before = state.car.hvacC
        val control = liveControl
        if (control != null) {
            viewModelScope.launch {
                val r = await<Double> { ok, err -> control.setHvacTempC(target, ok, err) }
                when {
                    r == null -> send(Intent.ClimateEvent(ActionEvent.Timeout(id)))
                    r.isFailure -> send(Intent.ClimateEvent(ActionEvent.Error(id, r.exceptionOrNull()?.message ?: "차량이 요청을 거절했습니다")))
                    else -> send(Intent.ClimateEvent(ActionEvent.Callback(id, r.getOrThrow()), appliedC = r.getOrThrow()))
                }
            }
            return
        }
        viewModelScope.launch {
            delay(700)
            when (controlMode) {
                ControlMode.SUCCESS, ControlMode.PARTIAL -> send(Intent.ClimateEvent(ActionEvent.Callback(id, target), appliedC = target))
                ControlMode.ERROR -> send(Intent.ClimateEvent(ActionEvent.Error(id, "차량이 요청을 거절했습니다")))
                ControlMode.MISMATCH -> send(Intent.ClimateEvent(ActionEvent.Callback(id, before)))
                else -> {
                    send(Intent.ClimateEvent(ActionEvent.Timeout(id)))
                    if (controlMode == ControlMode.LATE) { delay(300); send(Intent.ClimateEvent(ActionEvent.Callback(id, target), appliedC = target)) }
                    delay(if (controlMode == ControlMode.LATE) 100 else 400)
                    val readback = when (controlMode) { ControlMode.UNREADABLE -> null; ControlMode.LATE -> target; else -> before }
                    send(Intent.ClimateEvent(ActionEvent.Readback(id, readback)))
                }
            }
        }
    }

    /**
     * 실내 일괄 적용 — 세션이 재검사하고 보낸다. 모의 차량은 항목마다 따로 응답한다(PARTIAL = 첫 항목만 성공).
     * 실제 차량(에뮬레이터 2026-10-29)에서는 PleosCabinControl 의 set 콜백이 항목마다 결과를 넣고, 재조회는 PleosCabinStateSource 리스너가 한다.
     * 콜백이 돌려준 값이 요청과 다르면 값 불일치(matched=false). 항목은 차례로 보낸다(동시에 보내면 어느 콜백이 어느 요청인지 섞인다).
     */
    fun applyCabin() {
        send(Intent.ApplyCabin)
        val b = state.cabinBatch
        if (b.phase != CabinBatchPhase.PENDING) return
        val id = b.requestId ?: return
        val control = liveControl
        if (control != null) {
            viewModelScope.launch {
                val outcomes = b.keys.associateWith { k ->
                    val target = b.targets[k]
                    val r: Result<Boolean>? = when {
                        k == CabinKey.HVAC_TEMP && target is Double -> await<Double> { ok, err -> control.setHvacTempC(target, ok, err) }?.map { abs(it - target) <= 0.5 }
                        k == CabinKey.SEAT_VENT && target is Boolean -> await<Int> { ok, err -> control.setSeatVent(target, ok, err) }?.map { (it > 0) == target }
                        k == CabinKey.SEAT_HEAT && target is Boolean -> await<Int> { ok, err -> control.setSeatHeat(target, ok, err) }?.map { (it > 0) == target }
                        else -> Result.failure(IllegalStateException("이 항목은 차량 제어 경로가 없습니다"))
                    }
                    when {
                        r == null -> CabinOutcome.Timeout
                        r.isFailure -> CabinOutcome.Error(r.exceptionOrNull()?.message ?: "차량이 요청을 거절했습니다")
                        else -> CabinOutcome.Callback(r.getOrThrow())
                    }
                }
                send(Intent.CabinResults(id, outcomes, ControlSource.VEHICLE))
            }
            return
        }
        viewModelScope.launch {
            delay(700)
            val outcomes = b.keys.mapIndexed { i, k ->
                k to when (controlMode) {
                    ControlMode.SUCCESS, ControlMode.LATE -> CabinOutcome.Callback(true)
                    ControlMode.ERROR -> CabinOutcome.Error("차량이 요청을 거절했습니다")
                    ControlMode.MISMATCH -> CabinOutcome.Callback(i != 0)
                    ControlMode.PARTIAL -> if (i == 0) CabinOutcome.Callback(true) else CabinOutcome.Error("이 항목은 차량이 거절했습니다")
                    else -> CabinOutcome.Timeout
                }
            }.toMap<CabinKey, CabinOutcome>()
            send(Intent.CabinResults(id, outcomes))
        }
    }

    /** 경유지 추가 — 내비 콜백을 기다리는 모의(0.7초). 좌표를 모르는 후보는 넣지 않는다(출품 앱과 같은 규칙) */
    fun addWaypoint(stop: RestStop) {
        if (addingId != null) return
        if (state.car.permNavi != true) { send(Intent.AddWaypointResult(stop, false, "이 기능을 쓸 권한이 없습니다.")); return }
        addingId = stop.id
        viewModelScope.launch {
            delay(700)
            addingId = null
            val reason = when {
                !state.car.naviConnected -> "내비게이션 연결 안 됨 · 기존 경로를 유지합니다"
                state.waypoints.size >= 2 -> "경유지 2개가 모두 찼습니다 · 기존 경유지는 그대로 둡니다"
                !DemoData.hasLocation(stop) -> "이 후보는 좌표를 확인하지 못해 경유지로 넣지 않습니다"
                else -> null
            }
            send(Intent.AddWaypointResult(stop, reason == null, reason))
        }
    }

    /**
     * 원탭 다음 이동 — "집으로 안내 시작". 세션이 게이트를 돌리고 LOOKING 이 되면, 여기서 내비 즐겨찾기·경로 여부·목적지를 읽어 결과를 넣는다.
     * 실제 내비(차량·에뮬레이터)는 PleosNaviRoute, 그 밖(폰·JVM)은 모의 내비 — 모의는 결과 문장에 '(모의)'가 붙는다(RouteHandoff.mock).
     * 경로 여부를 못 읽으면 보내지 않는다(모르는 기존 경로를 덮지 않으려고). 10초 안에 목적지 확인이 없으면 모름 → 다시 읽기(재전송 안 함).
     */
    fun startRouteHome() {
        val navi = bridge.naviRoute
        send(Intent.StartRouteHome(mock = navi == null))
        val h = state.handoff
        if (h.phase != HandoffPhase.LOOKING) return
        val id = h.requestId ?: return
        viewModelScope.launch {
            if (navi == null) {
                delay(500)
                send(Intent.Handoff(HandoffEvent.Lookup(id, MOCK_HOME, null)))
            } else {
                val got = CompletableDeferred<PleosNaviRoute.Lookup>()
                navi.lookup { r -> got.complete(r) }
                val r = withTimeoutOrNull(LOOKUP_TIMEOUT_MS) { got.await() } ?: run { navi.finishLookupNow(); got.await() }
                android.util.Log.d("CoPilotNavi", "lookup $r")
                send(Intent.Handoff(if (r.routingKnown) HandoffEvent.Lookup(id, r.home, r.current) else HandoffEvent.Error(id, NaviError.UNAVAILABLE)))
            }
            if (RouteHandoff.shouldSend(state.handoff)) sendRoute(id)
        }
    }

    /** 교체 확인 — 기존 경로가 있을 때 두 번째 승인 */
    fun confirmRouteReplace() {
        val id = state.handoff.requestId ?: return
        send(Intent.Handoff(HandoffEvent.ConfirmReplace(id)))
        if (RouteHandoff.shouldSend(state.handoff)) viewModelScope.launch { sendRoute(id) }
    }

    private suspend fun sendRoute(id: Int) {
        val navi = bridge.naviRoute
        if (navi == null || state.handoff.mock) {
            delay(700)
            send(Intent.Handoff(HandoffEvent.RouteStarted(id)))
            send(Intent.Handoff(HandoffEvent.DestinationRead(id, MOCK_HOME)))
            return
        }
        val events = object : PleosNaviRoute.Events {
            override fun onRouteStarted() { android.util.Log.d("CoPilotNavi", "routeStarted #$id"); viewModelScope.launch { send(Intent.Handoff(HandoffEvent.RouteStarted(id))) } }
            override fun onDestination(place: NaviPlace?) { android.util.Log.d("CoPilotNavi", "destination #$id $place"); viewModelScope.launch { send(Intent.Handoff(HandoffEvent.DestinationRead(id, place))) } }
            override fun onError(error: NaviError) { android.util.Log.d("CoPilotNavi", "error #$id $error"); viewModelScope.launch { send(Intent.Handoff(HandoffEvent.Error(id, error))) } }
        }
        if (!navi.requestHome(events)) { send(Intent.Handoff(HandoffEvent.Error(id, NaviError.UNAVAILABLE))); return }
        android.util.Log.d("CoPilotNavi", "requestRoute #$id sent")
        delay(ROUTE_TIMEOUT_MS)
        if (state.handoff.requestId == id && state.handoff.phase == HandoffPhase.PENDING) {
            send(Intent.Handoff(HandoffEvent.Timeout(id)))
            navi.reread(events)
        }
    }

    override fun onCleared() { bridge.stop(); speaker.release() }

    private companion object {
        const val CONTROL_TIMEOUT_MS = 4_000L
        const val LOOKUP_TIMEOUT_MS = 5_000L
        const val ROUTE_TIMEOUT_MS = 10_000L
        /** 모의 내비의 집 즐겨찾기 — 시연 데이터(실제 좌표 아님) */
        val MOCK_HOME = NaviPlace("집 (시연 데이터)", 37.4979, 127.0276, "demo-home")
    }
}
