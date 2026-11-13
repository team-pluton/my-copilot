package app.commadrive.core.assistant

/**
 * ARRIVE READY 실행 — 승인한 주차장을 내비 목적지로 보내고 다시 읽어 확인한다. `src/lib/assistant/arrive-handoff.ts` 의 거울 (2026-11-12).
 *
 * 오너 지시(2026-11-12): 승인한 주차장의 ID · 좌표 · 정보 시각 · 판단 버전을 고정 · 실행 전 다시 검증 · 기존 목적지는 묻지 않고 교체하지 않음 ·
 * 요청 · 콜백 · 재조회 · 실패 · 미확인을 나눔 · 경로 설정을 주차 · 방문 완료로 기록하지 않음.
 * 근거: 관문 C(E27) — 좌표만으로 requestRoute → 안내 시작 → 목적지 재조회 같은 좌표 · 내비는 기존 경로를 묻지 않고 교체.
 */
data class ArriveApproval(
    val parkingId: String,
    val name: String,
    val point: GeoPoint,
    /** 승인 때 본 빈자리 정보의 갱신 시각 */
    val dataAt: Long?,
    val ruleVersion: String,
    /** 약속 시각 · 방문지 · 여유 — 바뀌면 다른 목표다 */
    val goalKey: String,
    val approvedAt: Long,
)

enum class ArrivePhase { IDLE, REVALIDATING, BLOCKED, LOOKING, CONFIRM_REPLACE, PENDING, ROUTE_SET, FAILED, UNKNOWN_OUTCOME,
    /** 경로 설정 뒤 운전자가 내비에서 목적지를 바꿨거나 안내가 끝남 — 앱의 계획을 다시 적용하지 않는다 */
    OVERRIDDEN }

data class ArriveHandoffState(
    val phase: ArrivePhase = ArrivePhase.IDLE,
    val requestId: Int? = null,
    val approval: ArriveApproval? = null,
    val current: NaviPlace? = null,
    val routed: Boolean = false,
    val message: String? = null,
    val mock: Boolean = false,
)

sealed interface ArriveHandoffEvent {
    data class Approve(val requestId: Int, val approval: ArriveApproval, val mock: Boolean = false) : ArriveHandoffEvent
    data class Revalidated(val requestId: Int, val fresh: ArriveDecision, val goalKey: String, val ruleVersion: String) : ArriveHandoffEvent
    data class Lookup(val requestId: Int, val current: NaviPlace?, val known: Boolean) : ArriveHandoffEvent
    data class ConfirmReplace(val requestId: Int) : ArriveHandoffEvent
    data object Cancel : ArriveHandoffEvent
    data class RouteStarted(val requestId: Int) : ArriveHandoffEvent
    data class DestinationRead(val requestId: Int, val place: NaviPlace?) : ArriveHandoffEvent
    data class Error(val requestId: Int, val error: NaviError) : ArriveHandoffEvent
    data class Timeout(val requestId: Int) : ArriveHandoffEvent
    /** 경로 설정 뒤 다시 읽은 내비 목적지 — 다시 판단할 때마다 */
    data class NaviChanged(val place: NaviPlace?, val known: Boolean) : ArriveHandoffEvent
}

object ArriveHandoff {
    /** 판단 규칙 버전 — 승인 때 고정한다. 규칙이 바뀌면 이전 승인으로 실행하지 않는다 */
    const val RULE_VERSION = "arrive-v0.2"
    /** 경로 설정 ≠ 주차 완료 ≠ 방문 완료 */
    const val NOT_PARKED_YET = "주차 · 방문은 아직 기록하지 않아요"

    fun goalKeyOf(appointmentAt: Long?, place: GeoPoint?, bufferMin: Int?): String =
        "${appointmentAt ?: "-"}|${place?.let { "%.5f,%.5f".format(java.util.Locale.ROOT, it.lat, it.lon) } ?: "-"}|${bufferMin ?: "-"}"

    fun approvalOf(c: ArriveCandidate, goalKey: String, now: Long) =
        ArriveApproval(c.parking.id, c.parking.name, c.parking.point!!, c.parking.updatedAt, RULE_VERSION, goalKey, now)

    private fun placeOf(a: ArriveApproval) = NaviPlace(a.name, a.point.lat, a.point.lon, null)

    /** 실행 직전 검증 — 승인한 그 주차장이 새 판단에서도 추천 가능으로 남아 있나. 문제면 이유, 괜찮으면 null. 1순위가 바뀐 것만으로는 막지 않는다 */
    fun revalidate(a: ArriveApproval, fresh: ArriveDecision, goalKey: String, ruleVersion: String): String? {
        if (goalKey != a.goalKey) return "약속이나 방문지가 바뀌었어요 · 다시 판단한 결과를 확인해 주세요"
        if (ruleVersion != a.ruleVersion) return "판단 규칙이 바뀌었어요 · 다시 판단한 결과를 확인해 주세요"
        if (fresh.kind == ArriveDecisionKind.DATA_FAILED || fresh.kind == ArriveDecisionKind.DATA_STALE) return fresh.headline
        val still = (listOfNotNull(fresh.top, fresh.fasterButFar) + fresh.alternatives).firstOrNull { it.parking.id == a.parkingId }
        if (still == null) {
            val why = fresh.needsCheck.firstOrNull { it.parking.id == a.parkingId }?.problem ?: fresh.excluded.firstOrNull { it.id == a.parkingId }?.reason ?: "다시 판단한 결과에 없어요"
            return "승인한 ${a.name}이(가) 지금은 조건을 맞추지 못해요 · $why"
        }
        val p = still.parking.point
        if (p == null || !RouteHandoff.samePlace(placeOf(a), NaviPlace(a.name, p.lat, p.lon, null))) return "주차장 위치 정보가 바뀌었어요 · 다시 확인해 주세요"
        return null
    }

    fun shouldSend(s: ArriveHandoffState) = s.phase == ArrivePhase.PENDING && !s.routed

    private val IDLE = ArriveHandoffState()

    fun reduce(s: ArriveHandoffState, e: ArriveHandoffEvent): ArriveHandoffState {
        fun mine(id: Int) = id == s.requestId
        val busy = s.phase == ArrivePhase.REVALIDATING || s.phase == ArrivePhase.LOOKING || s.phase == ArrivePhase.PENDING || s.phase == ArrivePhase.UNKNOWN_OUTCOME
        return when (e) {
            // 진행 중이면 두 번째 승인은 무시 — 같은 요청을 두 번 보내지 않는다
            is ArriveHandoffEvent.Approve -> if (busy) s else IDLE.copy(phase = ArrivePhase.REVALIDATING, requestId = e.requestId, approval = e.approval, mock = e.mock)
            is ArriveHandoffEvent.Revalidated -> {
                val a = s.approval
                if (!mine(e.requestId) || s.phase != ArrivePhase.REVALIDATING || a == null) s
                else revalidate(a, e.fresh, e.goalKey, e.ruleVersion)?.let { s.copy(phase = ArrivePhase.BLOCKED, message = "$it · 내비에는 보내지 않았어요") } ?: s.copy(phase = ArrivePhase.LOOKING)
            }
            is ArriveHandoffEvent.Lookup -> {
                val a = s.approval
                when {
                    !mine(e.requestId) || s.phase != ArrivePhase.LOOKING || a == null -> s
                    !e.known -> s.copy(phase = ArrivePhase.FAILED, message = "내비 상태를 읽지 못해 보내지 않았어요 · 기존 경로는 그대로입니다")
                    e.current != null && RouteHandoff.samePlace(e.current, placeOf(a)) -> s.copy(phase = ArrivePhase.ROUTE_SET, current = e.current, routed = true, message = "이미 ${a.name}(으)로 안내 중이에요 · $NOT_PARKED_YET")
                    e.current != null -> s.copy(phase = ArrivePhase.CONFIRM_REPLACE, current = e.current, message = "지금 안내 중인 ${e.current.name} 경로가 ${a.name} 경로로 바뀌어요")
                    else -> s.copy(phase = ArrivePhase.PENDING, current = null, message = null)
                }
            }
            is ArriveHandoffEvent.ConfirmReplace -> if (mine(e.requestId) && s.phase == ArrivePhase.CONFIRM_REPLACE) s.copy(phase = ArrivePhase.PENDING, message = null) else s
            ArriveHandoffEvent.Cancel -> when (s.phase) {
                ArrivePhase.CONFIRM_REPLACE -> IDLE.copy(message = "기존 경로를 그대로 둡니다")
                ArrivePhase.BLOCKED, ArrivePhase.FAILED, ArrivePhase.ROUTE_SET, ArrivePhase.OVERRIDDEN -> IDLE
                else -> s
            }
            is ArriveHandoffEvent.RouteStarted -> if (mine(e.requestId) && (s.phase == ArrivePhase.PENDING || s.phase == ArrivePhase.UNKNOWN_OUTCOME)) s.copy(routed = true) else s
            is ArriveHandoffEvent.DestinationRead -> {
                val a = s.approval
                when {
                    !mine(e.requestId) || (s.phase != ArrivePhase.PENDING && s.phase != ArrivePhase.UNKNOWN_OUTCOME) || a == null -> s
                    e.place != null && RouteHandoff.samePlace(e.place, placeOf(a)) -> {
                        val head = when {
                            s.phase == ArrivePhase.UNKNOWN_OUTCOME -> "응답은 늦었지만 내비 목적지가 ${a.name}(으)로 바뀌어 있어요"
                            s.mock -> "시연 내비에 ${a.name}을(를) 목적지로 설정했어요 (모의)"
                            else -> "내비 목적지를 ${a.name}(으)로 설정했어요 · 내비가 확인함"
                        }
                        s.copy(phase = ArrivePhase.ROUTE_SET, routed = true, message = "$head · $NOT_PARKED_YET")
                    }
                    // 요청 직후 읽은 값은 지난 목적지일 수 있다 — 경로 콜백 전이면 기다린다
                    !s.routed && s.phase == ArrivePhase.PENDING -> s
                    else -> s.copy(phase = ArrivePhase.FAILED,
                        message = if (e.place != null) "내비 목적지가 ${a.name}이(가) 아니에요(${e.place.name}) · 내비게이션에서 확인해 주세요" else "내비 목적지를 확인하지 못했어요 · 내비게이션에서 직접 확인해 주세요")
                }
            }
            is ArriveHandoffEvent.Error ->
                if (mine(e.requestId) && (s.phase == ArrivePhase.LOOKING || s.phase == ArrivePhase.PENDING || s.phase == ArrivePhase.UNKNOWN_OUTCOME))
                    s.copy(phase = ArrivePhase.FAILED, message = "${e.error.label} · 기존 경로는 그대로입니다") else s
            is ArriveHandoffEvent.Timeout -> when {
                !mine(e.requestId) -> s
                s.phase == ArrivePhase.LOOKING -> s.copy(phase = ArrivePhase.FAILED, message = "${NaviError.UNAVAILABLE.label} · 기존 경로는 그대로입니다")
                s.phase == ArrivePhase.PENDING -> s.copy(phase = ArrivePhase.UNKNOWN_OUTCOME, message = "내비 응답이 없어 설정됐는지 모릅니다 · 목적지를 다시 읽는 중 — 그전에는 다시 보내지 않습니다")
                else -> s
            }
            // 읽지 못한 것은 바뀐 것이 아니다 · 같은 곳이면 그대로
            is ArriveHandoffEvent.NaviChanged -> {
                val a = s.approval
                if (s.phase != ArrivePhase.ROUTE_SET || a == null || !e.known || (e.place != null && RouteHandoff.samePlace(e.place, placeOf(a)))) s
                else s.copy(phase = ArrivePhase.OVERRIDDEN, current = e.place, routed = false,
                    message = if (e.place != null) "내비 목적지가 ${e.place.name}(으)로 바뀌어 있어요 · 앱이 보낸 경로가 아니라 이전 계획을 다시 적용하지 않아요"
                        else "내비 안내가 끝났거나 목적지가 없어요 · 이전 계획을 다시 적용하지 않아요")
            }
        }
    }

    /**
     * 앱이 다시 켜졌을 때 — 저장한 승인을 내비 목적지를 다시 읽은 값과 대조한다(오너 2026-11-13, arrive-handoff.ts restoreArrive).
     * 같을 때만 '경로 설정됨'으로 되살린다. 읽지 못했거나 다르면 반영됐다고 말하지 않고 다시 보내지도 않는다. 주차 정보 · 소요 시간은 저장하지 않는다.
     */
    fun restore(saved: ArriveApproval, current: NaviPlace?, known: Boolean, ruleVersion: String = RULE_VERSION): ArriveHandoffState = when {
        saved.ruleVersion != ruleVersion -> IDLE.copy(message = "판단 규칙이 바뀌어 이전 승인은 쓰지 않아요 · 다시 판단해 주세요")
        !known -> IDLE.copy(message = "이전에 승인한 ${saved.name} 경로가 지금 내비에 있는지 읽지 못했어요 · 확인 전이라 설정됨으로 보지 않아요")
        current != null && RouteHandoff.samePlace(current, placeOf(saved)) ->
            IDLE.copy(phase = ArrivePhase.ROUTE_SET, approval = saved, current = current, routed = true, message = "앱을 다시 열어 내비 목적지를 다시 읽었어요 · ${saved.name}(으)로 안내 중 · $NOT_PARKED_YET")
        else -> IDLE.copy(message = "이전에 승인한 ${saved.name} 경로가 지금 내비 목적지와 달라요 · 다시 적용하지 않아요")
    }

    /** 단계를 한 줄로 — 요청 중 · 반영됨 · 실패 · 미확인을 섞지 않는다 */
    fun stepLabel(s: ArriveHandoffState): String? = when (s.phase) {
        ArrivePhase.REVALIDATING -> "실행 전에 주차 정보와 소요 시간을 다시 확인하는 중"
        ArrivePhase.LOOKING -> "내비게이션의 지금 목적지를 확인하는 중"
        ArrivePhase.PENDING -> if (s.routed) "내비가 경로를 시작했어요 · 목적지를 다시 읽는 중" else "내비에 경로를 요청하는 중"
        ArrivePhase.UNKNOWN_OUTCOME -> "응답 없음 · 결과 미확인"
        else -> null
    }
}

/**
 * 누구의 어떤 이동인가 — 저장 · 복원의 주인(오너 2026-11-13, arrive-handoff.ts ArriveOwner).
 * 다른 운전자의 목표 · 승인이 보이지 않게 운전자 · 이동 목적별로 나누고, 프로필 없이(GUEST) 탄 이동은 저장하지 않는다.
 * 운전자 미확인(null)은 미확인끼리만 같다 — 확인된 운전자의 기록을 미확인 상태에서 꺼내지 않는다.
 */
data class ArriveOwner(val driver: String?, val mode: ProfileMode) {
    val savable get() = mode != ProfileMode.GUEST
    val storeKey get() = "goal.${driver ?: "-"}.${mode.name}"
    fun canRestore(saved: ArriveOwner, savedAppointmentAt: Long, now: Long) = savable && saved.savable && saved == this && savedAppointmentAt > now
}

