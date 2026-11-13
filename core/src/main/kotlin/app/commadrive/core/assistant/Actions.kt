package app.commadrive.core.assistant

import kotlin.math.abs

/**
 * 차량 제어 요청의 상태 — `src/lib/assistant/actions.ts` 의 거울.
 * 타임아웃 = 결과를 모름(재조회 전 재시도 금지) · 늦은 콜백은 그 요청의 것만 · 주행 시작 시 열린 확인은 무효.
 */
enum class ActionPhase { IDLE, CONFIRMING, PENDING, VERIFIED_SUCCESS, FAILED, UNKNOWN_OUTCOME }

data class ActionState(
    val phase: ActionPhase,
    val requestId: Int?,
    val target: Double?,
    val applied: Double?,
    val message: String?,
    val canRetry: Boolean,
    val source: ControlSource,
) {
    companion object { fun idle(source: ControlSource) = ActionState(ActionPhase.IDLE, null, null, null, null, true, source) }
}

sealed interface ActionEvent {
    data object Open : ActionEvent
    data object Cancel : ActionEvent
    data class Send(val requestId: Int, val target: Double) : ActionEvent
    data class Callback(val requestId: Int, val value: Double) : ActionEvent
    data class Error(val requestId: Int, val reason: String) : ActionEvent
    data class Timeout(val requestId: Int) : ActionEvent
    data class Readback(val requestId: Int, val value: Double?) : ActionEvent
    data class Invalidate(val reason: String) : ActionEvent
}

object Actions {
    private fun same(a: Double, b: Double) = abs(a - b) <= SafetyGate.CONTROL_TOLERANCE

    fun reduce(s: ActionState, e: ActionEvent): ActionState = when (e) {
        ActionEvent.Open ->
            if (s.phase == ActionPhase.PENDING || s.phase == ActionPhase.CONFIRMING || (s.phase == ActionPhase.UNKNOWN_OUTCOME && !s.canRetry)) s
            else s.copy(phase = ActionPhase.CONFIRMING, message = null)
        ActionEvent.Cancel -> if (s.phase == ActionPhase.CONFIRMING) s.copy(phase = ActionPhase.IDLE, message = null) else s
        is ActionEvent.Send ->
            if (s.phase == ActionPhase.CONFIRMING) s.copy(phase = ActionPhase.PENDING, requestId = e.requestId, target = e.target, applied = null, message = null, canRetry = false) else s
        is ActionEvent.Callback -> {
            val t = s.target
            if (e.requestId != s.requestId || (s.phase != ActionPhase.PENDING && s.phase != ActionPhase.UNKNOWN_OUTCOME) || t == null) s
            else if (!same(e.value, t)) s.copy(phase = ActionPhase.FAILED, applied = e.value, canRetry = true, message = "요청한 값과 차량 값이 다릅니다 (요청 ${fmt(t)} · 현재 ${fmt(e.value)}).")
            else {
                val what = if (s.source == ControlSource.MOCK) "시연 값으로 ${fmt(t)} 적용" else "${fmt(t)} 적용됨"
                s.copy(phase = ActionPhase.VERIFIED_SUCCESS, applied = e.value, canRetry = true, message = if (s.phase == ActionPhase.UNKNOWN_OUTCOME) "$what — 응답이 늦게 왔습니다" else what)
            }
        }
        is ActionEvent.Error ->
            if (e.requestId == s.requestId && s.phase == ActionPhase.PENDING) s.copy(phase = ActionPhase.FAILED, canRetry = true, message = "적용하지 못했습니다: ${e.reason}") else s
        is ActionEvent.Timeout ->
            if (e.requestId == s.requestId && s.phase == ActionPhase.PENDING)
                s.copy(phase = ActionPhase.UNKNOWN_OUTCOME, canRetry = false, message = "응답이 없어 적용됐는지 모릅니다. 실제 값을 다시 읽는 중입니다 — 그전에는 다시 보내지 않습니다.")
            else s
        is ActionEvent.Readback -> {
            val t = s.target
            val v = e.value
            when {
                e.requestId != s.requestId || s.phase != ActionPhase.UNKNOWN_OUTCOME || t == null -> s
                v == null -> s.copy(message = "값을 다시 읽을 수 없어 결과를 확정하지 못했습니다. 공조 패널에서 직접 확인해 주세요 — 중복 명령을 막으려고 다시 보내지 않습니다.")
                same(v, t) -> s.copy(phase = ActionPhase.VERIFIED_SUCCESS, applied = v, canRetry = true, message = "응답은 없었지만 다시 읽어 보니 ${fmt(v)} 로 바뀌어 있습니다")
                else -> s.copy(phase = ActionPhase.FAILED, applied = v, canRetry = true, message = "적용되지 않았습니다 (지금 ${fmt(v)}). 다시 시도할 수 있습니다.")
            }
        }
        is ActionEvent.Invalidate -> if (s.phase == ActionPhase.CONFIRMING) s.copy(phase = ActionPhase.IDLE, message = e.reason) else s
    }
}
