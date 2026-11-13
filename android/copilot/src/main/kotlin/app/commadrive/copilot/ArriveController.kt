package app.commadrive.copilot

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.commadrive.copilot.adapter.PleosNaviRoute
import app.commadrive.core.assistant.ArriveApproval
import app.commadrive.core.assistant.ArriveCandidate
import app.commadrive.core.assistant.ArriveDecision
import app.commadrive.core.assistant.ArriveGoal
import app.commadrive.core.assistant.ArriveHandoff
import app.commadrive.core.assistant.ArriveHandoffEvent
import app.commadrive.core.assistant.ArriveHandoffState
import app.commadrive.core.assistant.ArriveInput
import app.commadrive.core.assistant.ArriveOwner
import app.commadrive.core.assistant.ProfileMode
import app.commadrive.core.assistant.ArrivePhase
import app.commadrive.core.assistant.ArriveReady
import app.commadrive.core.assistant.ArriveRecovery
import app.commadrive.core.assistant.GeoPoint
import app.commadrive.core.assistant.NaviError
import app.commadrive.core.assistant.NaviPlace
import app.commadrive.core.assistant.TripEstimate
import app.commadrive.core.assistant.recovery
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * ARRIVE READY 의 시간 · 연결 쪽 — 판단은 core ArriveReady, 실행 단계는 core ArriveHandoff 가 한다(V6 DecisionController 와 같은 나눔).
 *
 * 하는 일(오너 지시 2026-11-12):
 *  1. 목표 — 약속 시각(1탭 프리셋) · 방문지(내비에 이미 넣은 목적지를 읽거나 시연 위치) · 주차 후 여유. 사용자가 확인해야 판단한다
 *  2. 판단 — 서울 시영 주차(프록시) + 후보마다 내비 requestTrip(한 번에 하나) → ArriveReady.decide
 *  3. 실행 — 승인 때 고정 → 실행 직전 **다시 받아서** 다시 판단 → 대조 → 내비 지금 목적지 확인 → (교체 확인) → requestRoute → 콜백 · 목적지 재조회
 *  4. 다시 판단 — 경로가 설정된 뒤 3분마다(서울 데이터 갱신 주기) 다시 판단하고 **결과가 의미 있게 달라질 때만** 알린다. 경로는 바꾸지 않는다.
 *     주행 중이면 화면이 정차까지 미룬다(Safety Gate — 이 클래스는 알림 내용만 만든다)
 *  5. (2026-11-13 오너) 판단 결과는 세대 번호로 — 늦게 온 이전 결과가 최신 판단을 덮지 않는다 · 다시 판단할 때 내비 목적지도 다시 읽어
 *     운전자가 직접 바꿨으면 존중한다(이전 계획을 다시 적용하지 않음) · 닫은 알림은 같은 이유로 다시 띄우지 않는다 ·
 *     목표와 승인을 저장해 앱이 다시 켜지면 내비를 다시 읽어 같을 때만 되살린다(ArriveStore · ArriveHandoff.restore)
 *
 * 내비가 없는 기기(폰 · JVM)에서는 소요 시간을 지어내지 않는다 — 판단이 '내비 소요 시간을 받지 못해 판단을 보류해요'로 멈춘다.
 */
class ArriveController(
    private val scope: CoroutineScope,
    private val naviOf: () -> PleosNaviRoute?,
    private val restricted: () -> Boolean,
    private val store: ArriveStore? = null,
    /** 지금 이동의 주인(운전자 · 이동 목적) — 저장 키 · 복원 판정에 쓴다 */
    private val ownerOf: () -> ArriveOwner = { ArriveOwner(null, ProfileMode.WORK) },
) {
    /** 시연 방문지 — 서울 광화문 일대(실제 건물이 아니라 좌표만). 화면에 '시연 위치'로 표시한다 */
    val demoPlace = NaviPlace("광화문 고객사 (시연 위치)", 37.572, 126.9769, null)

    var appointmentAt by mutableStateOf<Long?>(null); private set
    var place by mutableStateOf<NaviPlace?>(null); private set
    var placeFromNavi by mutableStateOf(false); private set
    var bufferMin by mutableStateOf(10); private set
    var confirmed by mutableStateOf(false); private set
    var placeNote by mutableStateOf<String?>(null); private set

    var input by mutableStateOf<ArriveInput?>(null); private set
    var decision by mutableStateOf<ArriveDecision?>(null); private set
    var loading by mutableStateOf(false); private set
    var handoff by mutableStateOf(ArriveHandoffState()); private set
    /** 경로 설정 뒤 다시 판단해 알릴 것 — 주행 중에는 화면이 띄우지 않는다 */
    var notice by mutableStateOf<ArriveRecovery?>(null); private set
    var lastCheckedAt by mutableStateOf<Long?>(null); private set
    /** 개발용(폰 · 디버그 빌드만): 보낸 주차장을 만차로 바꿔 다시 판단을 보인다 — 켜면 화면에 '시연 데이터 포함' */
    var mockFullFor by mutableStateOf<String?>(null); private set

    /** 앱을 다시 열어 저장한 목표를 불러왔을 때 한 줄 */
    var restoreNote by mutableStateOf<String?>(null); private set

    private var nextId = 1
    private var watch: Job? = null
    /** 판단 세대 — 목표를 바꾸거나 새로 판단하면 올라간다. 끝났을 때 세대가 다르면 그 결과는 버린다 */
    private var gen = 0
    /** 사용자가 '지금 경로 유지'로 닫은 알림 — 같은 이유면 다시 띄우지 않는다 */
    private var dismissed: String? = null

    /** 앱이 켜진 뒤 Mission 복원이 끝나 운전자 · 이동이 정해지면 한 번 — 그 주인의 기록만 되살린다(다른 운전자 · 게스트 기록은 보지 않는다) */
    fun restoreFor(owner: ArriveOwner) { if (confirmed) return; store?.load(owner, System.currentTimeMillis())?.let { restoreFrom(it) } }

    private val goal get() = ArriveGoal(appointmentAt, place?.name ?: "", place?.let { GeoPoint(it.lat, it.lon) }, bufferMin, confirmed)
    private val goalKey get() = ArriveHandoff.goalKeyOf(appointmentAt, place?.let { GeoPoint(it.lat, it.lon) }, bufferMin)

    /** 목표를 바꾸면 이전 판단 · 확인을 지운다 — 다른 목표의 추천이 남아 승인되지 않게(V6 D7 과 같은 원칙). 실행 중이면 바꾸지 않는다 */
    private fun goalChanged() {
        gen++; confirmed = false; decision = null; input = null; notice = null; dismissed = null; restoreNote = null
        if (handoff.phase in setOf(ArrivePhase.BLOCKED, ArrivePhase.FAILED, ArrivePhase.CONFIRM_REPLACE, ArrivePhase.OVERRIDDEN)) handoff = ArriveHandoff.reduce(handoff, ArriveHandoffEvent.Cancel)
        persist()
    }
    private val executing get() = handoff.phase in setOf(ArrivePhase.REVALIDATING, ArrivePhase.LOOKING, ArrivePhase.PENDING, ArrivePhase.UNKNOWN_OUTCOME)

    /** 목표를 다시 고른다 — 실행 중에는 바꾸지 않는다 */
    fun editGoal() { if (!executing) goalChanged() }
    fun setAppointmentIn(minutes: Int) { if (executing) return; appointmentAt = roundTo5(System.currentTimeMillis() + minutes * 60_000L); goalChanged() }
    fun setBuffer(min: Int) { if (executing) return; bufferMin = min; goalChanged() }
    fun useDemoPlace() { if (executing) return; place = demoPlace; placeFromNavi = false; placeNote = null; goalChanged() }

    /** 내비에 이미 넣은 목적지를 방문지로 — 운전자가 다시 입력하지 않는다. 장소 검색은 만들지 않는다(정책 5) */
    fun readNaviDestination() {
        if (executing) return
        val navi = naviOf() ?: run { placeNote = "내비게이션에 연결하지 못했어요 · 시연 위치를 쓸 수 있어요"; return }
        placeNote = "내비 목적지를 읽는 중"
        scope.launch {
            val got = CompletableDeferred<PleosNaviRoute.Lookup>()
            navi.lookup { got.complete(it) }
            val r = withTimeoutOrNull(5_000) { got.await() } ?: run { navi.finishLookupNow(); got.await() }
            Log.d(TAG, "navi destination $r")
            val cur = r.current?.takeIf { it.lat != 0.0 || it.lon != 0.0 }
            // 읽지 못한 것과 목적지가 없는 것을 섞지 않는다(연결 실패를 '없다'로 말하지 않는다 — E31 에서 내비가 준비 전일 때 발견)
            if (cur == null && !r.routingKnown) { placeNote = "내비게이션 상태를 읽지 못했어요 · 내비가 준비되면 다시 눌러 주세요"; return@launch }
            if (cur == null) { placeNote = "내비에 목적지가 없어요 · 내비게이션에서 목적지를 정하거나 시연 위치를 쓸 수 있어요"; return@launch }
            if (ArriveReady.validSeoulPoint(cur.lat, cur.lon) == null) { placeNote = "${cur.name} — 서울 시영 주차 정보 범위 밖이라 판단하지 못해요"; return@launch }
            place = cur; placeFromNavi = true; placeNote = null; goalChanged()
        }
    }

    /** "이 목표로 볼게요" — 사용자가 약속 · 방문지 · 여유를 확인해야 판단한다(일정 앱에서 가져온 척하지 않는다) */
    fun confirmAndDecide() { if (executing) return; confirmed = true; persist(); refresh() }

    fun refresh() {
        if (loading || !confirmed) return
        loading = true
        scope.launch {
            val (i, d) = runCatching { computeLatest() }.getOrElse { Log.d(TAG, "decide failed $it"); null } ?: run { loading = false; return@launch }
            input = i; decision = d; lastCheckedAt = i.now; loading = false
            Log.d(TAG, "decision ${d.kind} top=${d.top?.parking?.id} far=${d.fasterButFar?.parking?.id} alts=${d.alternatives.map { it.parking.id }} check=${d.needsCheck.map { it.parking.id + ":" + it.problem }}")
        }
    }

    /** 늦게 끝난 이전 판단이 최신 판단을 덮지 않게 — 시작 때의 세대 · 목표가 끝날 때도 같아야 쓴다 */
    private suspend fun computeLatest(): Pair<ArriveInput, ArriveDecision>? {
        val g = ++gen; val key = goalKey
        val r = compute()
        return if (g == gen && key == goalKey) r else { Log.d(TAG, "stale decision dropped gen=$g now=$gen"); null }
    }

    /** 주차 정보를 받고 후보마다 내비 소요 시간을 물어 판단한다. 승인 전 판단과 실행 직전 재검증이 같은 길을 쓴다 */
    private suspend fun compute(): Pair<ArriveInput, ArriveDecision> {
        val g = goal
        val p = g.place
        val now = System.currentTimeMillis()
        if (p == null || ArriveReady.goalMissing(g, now).isNotEmpty()) { val i = ArriveInput(g, now, emptyList(), emptyList()); return i to ArriveReady.decide(i) }
        val feed = ParkingClient.fetch(p.lat, p.lon, ArriveReady.MAX_WALK_M)
        Log.d(TAG, "parking ok=${feed.ok} reason=${feed.reason} realtime=${feed.realtime.size} info=${feed.info.size}")
        val mock = mockFullFor
        val rows = if (mock == null) feed.realtime else feed.realtime.map { if (it["PKLT_CD"] == mock) it + ("NOW_PRK_VHCL_CNT" to (it["TPKCT"] ?: "0")) else it }
        val parkings = ArriveReady.joinParking(rows, feed.info, feed.retrievedAt, liveApi = mock == null)
        val navi = naviOf()
        val trips = mutableListOf<TripEstimate>()
        // 반경 안 · 좌표 있는 후보만 묻는다. onTripInfo 에 요청 표시가 없어 하나씩(앞 답을 받거나 시간 제한 뒤 다음)
        if (feed.ok && navi != null) for (pk in parkings) {
            val pt = pk.point ?: continue
            if (ArriveReady.distanceM(pt, p) > ArriveReady.MAX_WALK_M) continue
            val got = CompletableDeferred<Pair<Int?, Int?>>()
            navi.trip(NaviPlace(pk.name, pt.lat, pt.lon, null)) { s, m -> got.complete(s to m) }
            val r = withTimeoutOrNull(TRIP_TIMEOUT_MS) { got.await() }
            if (r == null) navi.cancelTrip()
            Log.d(TAG, "trip ${pk.id} ${pk.name} -> ${r?.first}s ${r?.second}m")
            trips += TripEstimate(pk.id, r?.first, r?.second, System.currentTimeMillis(), true)
        }
        val i = ArriveInput(g, System.currentTimeMillis(), parkings, trips, feed.ok, feed.reason)
        return i to ArriveReady.decide(i)
    }

    /** 승인 — 이 후보를 고정하고, 다시 받아 대조한 뒤에만 내비로 */
    fun approve(c: ArriveCandidate) {
        if (executing || restricted()) return
        val id = nextId++
        val approval: ArriveApproval = ArriveHandoff.approvalOf(c, goalKey, System.currentTimeMillis())
        handoff = ArriveHandoff.reduce(handoff, ArriveHandoffEvent.Approve(id, approval, mock = naviOf() == null))
        if (handoff.requestId != id) return
        Log.d(TAG, "approve #$id ${approval.parkingId} ${approval.name} ${approval.point} dataAt=${approval.dataAt} rule=${approval.ruleVersion} goal=${approval.goalKey}")
        notice = null; restoreNote = null; watch?.cancel()
        scope.launch {
            val g = ++gen
            val (i, fresh) = runCatching { compute() }.getOrElse { ArriveInput(goal, System.currentTimeMillis(), emptyList(), emptyList(), false, "다시 확인하지 못했어요") .let { it to ArriveReady.decide(it) } }
            if (g == gen) { input = i; decision = fresh; lastCheckedAt = i.now }
            handoff = ArriveHandoff.reduce(handoff, ArriveHandoffEvent.Revalidated(id, fresh, goalKey, ArriveHandoff.RULE_VERSION))
            Log.d(TAG, "revalidated #$id -> ${handoff.phase} ${handoff.message}")
            if (handoff.phase != ArrivePhase.LOOKING) return@launch
            val navi = naviOf()
            if (navi == null) { handoff = ArriveHandoff.reduce(handoff, ArriveHandoffEvent.Lookup(id, null, true)) }
            else {
                val got = CompletableDeferred<PleosNaviRoute.Lookup>()
                navi.lookup { got.complete(it) }
                val r = withTimeoutOrNull(5_000) { got.await() } ?: run { navi.finishLookupNow(); got.await() }
                Log.d(TAG, "lookup #$id $r")
                handoff = ArriveHandoff.reduce(handoff, ArriveHandoffEvent.Lookup(id, r.current, r.routingKnown))
            }
            if (ArriveHandoff.shouldSend(handoff)) send(id)
            afterRouteSet()
        }
    }

    /** 기존 경로가 있을 때 두 번째 승인 */
    fun confirmReplace() {
        val id = handoff.requestId ?: return
        handoff = ArriveHandoff.reduce(handoff, ArriveHandoffEvent.ConfirmReplace(id))
        if (ArriveHandoff.shouldSend(handoff)) scope.launch { send(id); afterRouteSet() }
    }

    fun cancel() { handoff = ArriveHandoff.reduce(handoff, ArriveHandoffEvent.Cancel); if (handoff.phase == ArrivePhase.IDLE) { watch?.cancel(); notice = null; persist() } }

    private suspend fun send(id: Int) {
        val a = handoff.approval ?: return
        val target = NaviPlace(a.name, a.point.lat, a.point.lon, null)
        val navi = naviOf()
        if (navi == null || handoff.mock) {
            delay(700)
            handoff = ArriveHandoff.reduce(handoff, ArriveHandoffEvent.RouteStarted(id))
            handoff = ArriveHandoff.reduce(handoff, ArriveHandoffEvent.DestinationRead(id, target))
            return
        }
        val done = CompletableDeferred<Unit>()
        val events = object : PleosNaviRoute.Events {
            override fun onRouteStarted() { Log.d(TAG, "routeStarted #$id"); scope.launch { handoff = ArriveHandoff.reduce(handoff, ArriveHandoffEvent.RouteStarted(id)) } }
            override fun onDestination(place: NaviPlace?) {
                Log.d(TAG, "destination #$id $place")
                scope.launch { handoff = ArriveHandoff.reduce(handoff, ArriveHandoffEvent.DestinationRead(id, place)); if (handoff.phase == ArrivePhase.ROUTE_SET || handoff.phase == ArrivePhase.FAILED) done.complete(Unit) }
            }
            override fun onError(error: NaviError) { Log.d(TAG, "error #$id $error"); scope.launch { handoff = ArriveHandoff.reduce(handoff, ArriveHandoffEvent.Error(id, error)); done.complete(Unit) } }
        }
        if (!navi.requestPlace(target, events)) { handoff = ArriveHandoff.reduce(handoff, ArriveHandoffEvent.Error(id, NaviError.UNAVAILABLE)); return }
        Log.d(TAG, "requestRoute #$id sent ${target.name} ${target.lat},${target.lon}")
        if (withTimeoutOrNull(ROUTE_TIMEOUT_MS) { done.await() } == null && handoff.requestId == id && handoff.phase == ArrivePhase.PENDING) {
            handoff = ArriveHandoff.reduce(handoff, ArriveHandoffEvent.Timeout(id))
            navi.reread(events)
            withTimeoutOrNull(ROUTE_TIMEOUT_MS) { done.await() }
        }
    }

    /** 경로가 설정되면 — 3분마다 다시 판단(서울 실시간이 약 3분 간격). 결과가 의미 있게 달라질 때만 notice. 경로는 바꾸지 않는다 */
    private fun afterRouteSet() {
        if (handoff.phase != ArrivePhase.ROUTE_SET) return
        persist()
        watch?.cancel()
        watch = scope.launch {
            while (isActive && handoff.phase == ArrivePhase.ROUTE_SET) {
                delay(RECHECK_MS)
                recheckNow()
            }
        }
    }

    /** 지금 다시 확인 — 사용자가 누르거나 주기마다 */
    fun recheckNow() {
        val routed = handoff.approval?.parkingId ?: return
        if (handoff.phase != ArrivePhase.ROUTE_SET || loading) return
        loading = true
        scope.launch {
            val (i, d) = runCatching { computeLatest() }.getOrElse { null } ?: run { loading = false; return@launch }
            input = i; decision = d; lastCheckedAt = i.now; loading = false
            if (respectNaviChange() || handoff.phase != ArrivePhase.ROUTE_SET) return@launch
            val r = ArriveReady.recovery(d, routed)
            Log.d(TAG, "recheck routed=$routed -> ${d.kind} top=${d.top?.parking?.id} notify=${r.notify} ${r.reason}")
            notice = if (r.notify && "$routed|${r.reason}" != dismissed) r else null
        }
    }

    /** 앱 창으로 돌아올 때 — 내비 목적지만 다시 읽는다(주차 · 소요 시간은 묻지 않는다). 다음 3분 확인까지 '안내 중'을 잘못 말하지 않게 */
    fun checkNaviNow() {
        if (handoff.phase != ArrivePhase.ROUTE_SET || loading) return
        scope.launch { respectNaviChange() }
    }

    /**
     * 운전자가 내비에서 목적지를 바꿨으면 존중한다 — 한 번 다르게 읽히면 2초 뒤 다시 읽어 그래도 다를 때만(잠깐 비어 읽히는 경우를 바꿈으로 보지 않는다).
     * 바뀌었으면 true — 이후 다시 판단 · 알림을 멈추고 이전 계획을 다시 적용하지 않는다
     */
    private suspend fun respectNaviChange(): Boolean {
        if (handoff.mock || handoff.phase != ArrivePhase.ROUTE_SET) return false
        val navi = naviOf() ?: return false
        if (ArriveHandoff.reduce(handoff, readNavi(navi)).phase != ArrivePhase.OVERRIDDEN) return false
        delay(2_000)
        handoff = ArriveHandoff.reduce(handoff, readNavi(navi))
        if (handoff.phase != ArrivePhase.OVERRIDDEN) return false
        Log.d(TAG, "navi changed by driver -> ${handoff.current}")
        watch?.cancel(); notice = null; persist()
        return true
    }

    private suspend fun readNavi(navi: PleosNaviRoute): ArriveHandoffEvent.NaviChanged {
        val got = CompletableDeferred<PleosNaviRoute.Lookup>()
        navi.lookup { got.complete(it) }
        val r = withTimeoutOrNull(5_000) { got.await() } ?: run { navi.finishLookupNow(); got.await() }
        return ArriveHandoffEvent.NaviChanged(r.current?.takeIf { it.lat != 0.0 || it.lon != 0.0 }, r.routingKnown)
    }

    /** 확인한 목표 · 내비에서 확인된 승인만 저장한다(판단 결과 · 주차 대수 · 소요 시간은 저장하지 않는다) */
    private fun persist() {
        val st = store ?: return
        val owner = ownerOf()
        val appt = appointmentAt; val pl = place
        if (!confirmed || appt == null || pl == null) { st.save(owner, null); return }
        st.save(owner, ArriveSaved(owner, appt, pl, placeFromNavi, bufferMin, handoff.approval?.takeIf { handoff.phase == ArrivePhase.ROUTE_SET }, System.currentTimeMillis()))
    }

    /** 앱이 다시 켜졌을 때 — 목표는 되살리고, 승인은 내비를 다시 읽어 같을 때만. 주차 · 소요 시간은 새로 받는다 */
    private fun restoreFrom(saved: ArriveSaved) {
        appointmentAt = saved.appointmentAt; place = saved.place; placeFromNavi = saved.placeFromNavi; bufferMin = saved.bufferMin; confirmed = true
        restoreNote = "앱을 다시 열어 확인해 둔 목표를 불러왔어요 · 주차 정보와 소요 시간은 새로 받아요"
        Log.d(TAG, "restore goal ${saved.place.name} appt=${saved.appointmentAt} approval=${saved.approval?.parkingId}")
        scope.launch {
            // 내비 연결은 앱이 켜진 뒤 따로 온다 — 승인이 없어도 소요 시간을 물으려면 기다린다(안 기다리면 '판단 보류'로 시작했다, E32 보완 2회차)
            var navi = naviOf()
            var waited = 0L
            while (navi == null && waited < NAVI_WAIT_MS) { delay(500); waited += 500; navi = naviOf() }
            saved.approval?.let { a ->
                val ev = navi?.let { readNavi(it) }
                handoff = ArriveHandoff.restore(a, ev?.place, ev?.known ?: false)
                Log.d(TAG, "restore handoff -> ${handoff.phase} navi=${ev?.place}")
            }
            refresh()
            afterRouteSet()
            persist()
        }
    }

    /** 다시 판단이 제안한 곳으로 — 다시 승인을 거친다(자동으로 바꾸지 않는다) */
    fun acceptSuggestion() {
        val s = notice?.suggestion ?: return
        notice = null
        handoff = ArriveHandoffState()
        approve(s)
    }
    fun dismissNotice() { notice?.let { n -> handoff.approval?.let { dismissed = "${it.parkingId}|${n.reason}" } }; notice = null }

    /** 개발용 — 보낸 주차장을 만차로(시연 데이터). 다시 끄면 실데이터 */
    fun toggleMockFull() { mockFullFor = if (mockFullFor == null) handoff.approval?.parkingId ?: decision?.top?.parking?.id else null; recheckNow() }

    private fun roundTo5(ms: Long) = (ms + 299_999L) / 300_000L * 300_000L

    private companion object {
        const val TAG = "CoPilotArrive"
        const val TRIP_TIMEOUT_MS = 4_000L
        const val ROUTE_TIMEOUT_MS = 10_000L
        const val RECHECK_MS = 3 * 60_000L
        const val NAVI_WAIT_MS = 15_000L
    }
}
