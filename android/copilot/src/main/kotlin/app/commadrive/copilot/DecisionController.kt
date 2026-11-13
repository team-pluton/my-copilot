package app.commadrive.copilot

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.commadrive.copilot.adapter.PleosNaviWaypoint
import app.commadrive.core.assistant.ChargerData
import app.commadrive.core.assistant.ChargerFeed
import app.commadrive.core.assistant.Connector
import app.commadrive.core.assistant.Corridor
import app.commadrive.core.assistant.CorridorStop
import app.commadrive.core.assistant.DataEvidence
import app.commadrive.core.assistant.DecisionInput
import app.commadrive.core.assistant.Fact
import app.commadrive.core.assistant.FactAvailability
import app.commadrive.core.assistant.IntegratedDecision
import app.commadrive.core.assistant.JourneyDecision
import app.commadrive.core.assistant.JourneyFact
import app.commadrive.core.assistant.NaviError
import app.commadrive.core.assistant.NaviPlace
import app.commadrive.core.assistant.SessionState
import app.commadrive.core.assistant.StopCandidate
import app.commadrive.core.assistant.VehicleEnergy
import app.commadrive.core.assistant.VehicleEnergyRaw
import app.commadrive.core.assistant.WaypointEvent
import app.commadrive.core.assistant.WaypointHandoff
import app.commadrive.core.assistant.WaypointPhase
import app.commadrive.core.assistant.WaypointState
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * V6 통합 판단의 시간·연결 쪽 — 판단은 core 의 IntegratedDecision 이 한다. 기존 세션을 건드리지 않으므로 충전소 API 가 죽어도 Mission 은 그대로다.
 * 차량(AAOS)에서는 실제 프록시 · 실제 내비를 쓰고, 폰·JVM 또는 개발용 전환 때만 시연 데이터를 쓴다. 시연이면 근거 줄과 결과 문장에 그렇게 적힌다.
 */
class DecisionController(
    private val scope: CoroutineScope,
    private val naviOf: () -> PleosNaviWaypoint?,
    private val stateOf: () -> SessionState,
    automotive: Boolean,
) {
    var decision by mutableStateOf<JourneyDecision?>(null)
        private set
    var vehicleFact by mutableStateOf<Fact<VehicleEnergy>?>(null)
        private set
    var replan by mutableStateOf<String?>(null)
        private set
    var waypoint by mutableStateOf(WaypointState())
        private set
    var loading by mutableStateOf(false)
        private set
    /** 지금 내비에 들어 있는 경유지(이름) — 판단이 바뀌어도 이미 넣은 곳을 말하려고(E27 D2). null = 못 읽음 */
    var naviWaypoints by mutableStateOf<List<NaviPlace>?>(null)
        private set
    /** 충전 데이터가 시연인가 — 개발용 조작판에서만 바꾼다. 차량 기본은 실제 프록시 */
    var mockChargers by mutableStateOf(!automotive)
        private set
    /** 개발용: 시연 충전기 상태 바꾸기(상태 변화 재판단을 보이려고) */
    var mockOverrides by mutableStateOf<Map<String, Map<String, String>>>(emptyMap())
        private set
    private var rejected = emptyList<String>()
    /**
     * 이 판단이 어느 이동의 것인가(E28 D7) — 이동 번호 · 프로필 · 목적지 · 거리. 바뀌면 이전 판단을 **지운다**:
     * 새 이동에서 지난 이동의 추천이 '지금 판단'처럼 보이거나 승인되지 않게. 거절한 후보도 이번 이동 것만 남긴다
     */
    private var scopeKey: String? = null
    private var vehicleReadAt: Long? = null
    private var nextId = 1
    private var activeEvents: PleosNaviWaypoint.Events? = null

    fun markVehicleRead() { vehicleReadAt = System.currentTimeMillis() }
    /** 데이터 출처를 바꾼 것은 판단 변화가 아니다 — 이전 판단과 비교하지 않는다 */
    fun switchMockChargers(on: Boolean) { mockChargers = on; decision = null; replan = null; refresh() }
    fun switchMockOverride(key: Map<String, Map<String, String>>) { mockOverrides = key; refresh() }

    fun refresh() {
        scope.launch {
            val s = stateOf()
            val key = "${s.memory.tripId}|${s.mode}|${s.plan.destinationName}|${s.plan.routeKm}"
            if (key != scopeKey) { scopeKey = key; decision = null; replan = null; rejected = emptyList() }
            loading = true
            val now = System.currentTimeMillis()
            val live = s.car.vehicleLive
            val vehicle = JourneyFact.normalizeVehicle(
                VehicleEnergyRaw(s.vehicle.batteryPct, s.vehicle.batteryKwh, if (live) vehicleReadAt else now, if (live) DataEvidence.VEHICLE else DataEvidence.MOCK, FactAvailability.OK), now,
            )
            vehicleFact = vehicle
            val base = DecisionInput(s.car.powertrain, vehicle, s.vehicle, s.plan, s.traveledKm, CONNECTOR, emptyList(), ChargerFeed(FactAvailability.NOT_CONNECTED, null, emptyList()), now, rejected)
            val input = if (!IntegratedDecision.needsChargerLookup(base)) base else if (mockChargers) {
                base.copy(stops = Corridor.MOCK_STOPS, chargers = ChargerFeed(FactAvailability.OK, null, Corridor.mockChargerRows(now, mockOverrides).mapNotNull { ChargerData.normalize(it, now, DataEvidence.MOCK) }))
            } else {
                // 첫 조회가 연결 실패면 한 번만 다시(E28 D7: 앱을 켠 직후 첫 조회가 30초 뒤 실패하고 '다시 확인'은 바로 성공 — 원인 미확인). 그래도 실패면 판단 불가로 안전하게
                var r = ChargerClient.fetch()
                if (r.availability == FactAvailability.NOT_CONNECTED || r.availability == FactAvailability.FAILED) {
                    Log.d(TAG, "charger feed retry after ${r.availability} ${r.errorReason}")
                    delay(RETRY_DELAY_MS)
                    r = ChargerClient.fetch()
                }
                Log.d(TAG, "charger feed availability=${r.availability} evidence=${r.evidence} error=${r.errorReason} records=${r.records.size} mappedStops=${r.mapping.size}")
                val at = System.currentTimeMillis()
                base.copy(stops = liveStops(r.mapping, r.records), chargers = ChargerFeed(r.availability, r.errorReason, r.records), now = at)
            }
            val next = IntegratedDecision.decide(input)
            val prev = decision
            Log.d(TAG, "decision ${next.kind} top=${next.top?.stopId} alts=${next.alternatives.map { it.stopId }} check=${next.needsCheck.map { it.stopId }} excluded=${next.excluded.map { it.stopId }} soc=${vehicle.value?.socPct} kwh=${vehicle.value?.capacityKwh} rawKwh=${s.vehicle.batteryKwh}")
            replan = prev?.let { IntegratedDecision.replanNotice(it, next) }?.takeIf { it.changed }?.message
            decision = next
            loading = false
            readNaviWaypoints()
        }
    }

    /** 실제 경로용 — 좌표는 지어내지 않고 그 충전소의 API 값에서 가져온다 */
    private fun liveStops(mapping: Map<String, List<String>>, records: List<app.commadrive.core.assistant.ChargerRecord>): List<CorridorStop> =
        Corridor.stops(mapping).map { stop ->
            val first = records.firstOrNull { it.stationId in stop.stationIds && it.latitude != null && it.longitude != null }
            stop.copy(lat = first?.latitude, lon = first?.longitude)
        }

    fun reject(stopId: String) { rejected = rejected + stopId; refresh() }

    /** 사용자 승인 뒤에만 부른다 — 게이트와 정차 조건은 canPick 로 먼저 확인 */
    /** 다시 판단하는 중에는 고르지 못한다(E28 D7) — 확인이 끝난 판단만 실행 가능 */
    fun canPick(c: StopCandidate, parked: Boolean): Boolean = !loading && decision?.let { IntegratedDecision.canPickStop(it, c.stopId, parked) } == true && c.lat != null && c.lon != null

    /** 이번 이동의 판단을 아직 못 받았다 — 화면은 '확인하는 중'만, 다른 엔진의 충전 카드도 띄우지 않는다(한 화면에 판단 하나) */
    val pending get() = loading && decision == null

    fun addWaypoint(c: StopCandidate, parked: Boolean) {
        if (!canPick(c, parked)) return
        val target = NaviPlace(c.name, c.lat!!, c.lon!!, null)
        val navi = naviOf()
        val id = nextId++
        apply(WaypointEvent.Start(id, target, mock = navi == null))
        if (waypoint.phase != WaypointPhase.LOOKING) return
        scope.launch {
            if (navi == null) {
                delay(300)
                apply(WaypointEvent.Lookup(id, true, emptyList()))
            } else {
                val got = CompletableDeferred<Pair<Boolean?, List<NaviPlace>>>()
                navi.lookup { r, l -> got.complete(r to l) }
                val res = withTimeoutOrNull(LOOKUP_TIMEOUT_MS) { got.await() } ?: run { navi.finishLookupNow(); withTimeoutOrNull(500) { got.await() } }
                Log.d(TAG, "lookup #$id $res")
                apply(WaypointEvent.Lookup(id, res?.first, res?.second ?: emptyList()))
            }
            if (WaypointHandoff.shouldSend(waypoint)) send(id)
        }
    }

    /** 개발용 — requestTrip 이 무엇을 주고 내비를 건드리는지 따로 본다. 경유지 흐름과 섞지 않는다(E24) */
    fun probeTrip() {
        val c = decision?.top ?: return
        val lat = c.lat ?: return
        val lon = c.lon ?: return
        naviOf()?.probeTrip(NaviPlace(c.name, lat, lon, null))
    }

    fun chooseReplace(index: Int) {
        val id = waypoint.requestId ?: return
        apply(WaypointEvent.ChooseReplace(id, index))
        if (WaypointHandoff.shouldSend(waypoint)) scope.launch { send(id) }
    }

    fun cancelWaypoint() = apply(WaypointEvent.Cancel)

    private suspend fun send(id: Int) {
        val navi = naviOf()
        val w = waypoint
        val target = w.target ?: return
        if (navi == null || w.mock) {
            delay(300)
            apply(WaypointEvent.Ack(id))
            apply(WaypointEvent.WaypointsRead(id, w.existing + target))
            return
        }
        val events = object : PleosNaviWaypoint.Events {
            override fun onAck() { Log.d(TAG, "ack #$id"); scope.launch { apply(WaypointEvent.Ack(id)) } }
            override fun onWaypoints(list: List<NaviPlace>) { Log.d(TAG, "read #$id $list"); scope.launch { apply(WaypointEvent.WaypointsRead(id, list)) } }
            override fun onError(error: NaviError) { Log.d(TAG, "error #$id $error"); scope.launch { apply(WaypointEvent.Error(id, error)) } }
        }
        if (!navi.add(target, w.existing.size, w.replaceIndex, events)) { apply(WaypointEvent.Error(id, NaviError.UNAVAILABLE)); return }
        Log.d(TAG, "addWaypoint #$id sent $target")
        activeEvents = events
        delay(SEND_TIMEOUT_MS)
        if (waypoint.requestId == id && waypoint.phase == WaypointPhase.PENDING) apply(WaypointEvent.Timeout(id))
        // 응답이 없으면 다시 읽어 확정한다. 재전송하지 않는다. 내비가 앞에 있는 동안은 응답이 늦었다(E24) — 앱이 앞으로 오면 onForeground 도 읽는다
        repeat(REREAD_TIMES) {
            if (waypoint.requestId != id || waypoint.phase != WaypointPhase.UNKNOWN_OUTCOME) return
            navi.reread(events)
            delay(REREAD_EVERY_MS)
        }
        if (waypoint.requestId == id) apply(WaypointEvent.GiveUp(id))
    }

    /** 경유지 요청이 진행 중이 아닐 때만 읽는다 — 진행 중인 lookup 과 섞이지 않게 */
    private suspend fun readNaviWaypoints() {
        val navi = naviOf() ?: return
        if (waypoint.phase != WaypointPhase.IDLE && waypoint.phase != WaypointPhase.VERIFIED) return
        val got = CompletableDeferred<Pair<Boolean?, List<NaviPlace>>>()
        navi.lookup { r, l -> got.complete(r to l) }
        val res = withTimeoutOrNull(LOOKUP_TIMEOUT_MS) { got.await() } ?: run { navi.finishLookupNow(); withTimeoutOrNull(500) { got.await() } }
        naviWaypoints = if (res?.first == null) null else res.second
    }

    /** 이 후보가 이미 내비 경유지에 있나 — 내비는 좌표를 (0,0)으로 돌려줘서 이름으로 본다(research 16절) */
    fun alreadyOnRoute(c: StopCandidate): Boolean = naviWaypoints?.any { it.name == c.name } == true

    /** 앱 창이 다시 보일 때 — 결과를 모르는 요청이 있으면 다시 읽는다 */
    fun onForeground() {
        val events = activeEvents ?: return
        if (waypoint.phase == WaypointPhase.UNKNOWN_OUTCOME || waypoint.phase == WaypointPhase.PENDING) naviOf()?.reread(events)
    }

    private fun apply(e: WaypointEvent) {
        waypoint = WaypointHandoff.reduce(waypoint, e)
        if (e is WaypointEvent.WaypointsRead) naviWaypoints = e.waypoints
        Log.d(TAG, "waypoint ${waypoint.phase} ${waypoint.message ?: ""}")
    }

    private companion object {
        const val TAG = "CoPilotV6"
        const val RETRY_DELAY_MS = 2_000L
        const val LOOKUP_TIMEOUT_MS = 5_000L
        const val SEND_TIMEOUT_MS = 10_000L
        const val REREAD_TIMES = 12
        const val REREAD_EVERY_MS = 5_000L
        /** SDK 로 충전 규격을 읽지 못했다 — 국내 EV 기본으로 가정(VEHICLE-DATA-CONTRACT.md). 차량별 값이 확인되면 바꾼다 */
        val CONNECTOR = Connector.DC_COMBO
    }
}
