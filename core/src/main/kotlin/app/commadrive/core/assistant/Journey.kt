package app.commadrive.core.assistant

/**
 * 여정 단계 — MY CO-PILOT 상황 판단의 뼈대. `src/lib/assistant/journey.ts` 의 거울.
 *
 * 쉼표 DRIVE 엔진은 "충전하러 서야 하나"를 판단했다. 이 층은 그 앞뒤 — **지금이 출발 전인가, 달리는 중인가,
 * 도착했나** — 를 판단해 어떤 제안을 꺼낼지 정한다. SDK 를 직접 부르지 않는다: 어댑터가 읽은 값을 받아
 * 다음 단계를 돌려줄 뿐이라 차량 없이 테스트된다 (docs/my-copilot/MIGRATION.md).
 */
/** WAITING: 중간 목적지에서 대기 중 — 귀가 구간이 남아 있다(왕복). 여정은 끝나지 않았다 */
enum class JourneyPhase { NOT_STARTED, PREPARING, DRIVING, APPROACHING, PARKED, FINISHING, WAITING, COMPLETED }

/** CONFIRMED = 차량이 직접 알려 준 값 · INFERRED = 여러 신호를 조합한 추정 · UNKNOWN = 판단 불가 */
enum class Confidence { CONFIRMED, INFERRED, UNKNOWN }

enum class Gear { PARK, REVERSE, NEUTRAL, DRIVE, UNKNOWN }

/**
 * 어댑터가 넘겨 주는 차량 신호. 못 읽은 값은 null 이다 — 마지막 값을 현재 값인 척 넣지 않는다.
 *  · gear: Vehicle SDK Gear(getCurrentGearSelectionState, CAR_DRIVE) 또는 AAOS GEAR_SELECTION
 *  · parkingBrake: AAOS PARKING_BRAKE_ON — Vehicle SDK Brake 는 **페달** 상태만 준다 (실물 jar, 2026-10-26)
 *  · uxRestricted: AAOS CarUxRestrictions — 주행 중 화면 제한은 우리 추정이 아니라 이 값이 정한다
 *  · remainingKm: NaviHelper DestinationInfo.remainDistance
 */
data class JourneySignals(
    val gear: Gear,
    val parkingBrake: Boolean?,
    val speedKmh: Double?,
    val uxRestricted: Boolean?,
    val remainingKm: Double?,
)

enum class MotionKind { MOVING, STOPPED, PARKED, UNKNOWN }
data class Motion(val kind: MotionKind, val confidence: Confidence)

/** 사용자가 직접 하는 것 — START_WAIT 중간 목적지에서 대기 시작 · END_TRIP 여정 전체 종료(귀가가 남아 있어도) */
enum class JourneyEvent { START_PREPARE, CANCEL_TRIP, DESTINATION_CHANGED, START_FINISH, FINISH_DONE, START_WAIT, END_TRIP }

/**
 * 여정 = 구간(leg)들. 편도 1구간 · 왕복 2구간. 중간 목적지 도착은 그 구간의 끝이지 여정의 끝이 아니다.
 * atDestination: PARKED 일 때 (이 구간의) 목적지 도착인가 · leg: 지금 구간(0 = 가는 길) · legs: 전체 구간 수
 */
data class JourneyState(
    val phase: JourneyPhase,
    val atDestination: Boolean,
    val confidence: Confidence,
    val leg: Int = 0,
    val legs: Int = 1,
) {
    val isLastLeg get() = leg >= legs - 1

    /** 여정의 구간 수를 정한다 — 출발 준비 때 한 번 */
    fun withLegs(n: Int) = copy(legs = maxOf(1, n), leg = minOf(leg, maxOf(1, n) - 1))

    companion object {
        val INITIAL = JourneyState(JourneyPhase.NOT_STARTED, false, Confidence.CONFIRMED)
    }
}

object Journey {
    /** 목적지까지 이만큼 남으면 "곧 도착" — 도착 준비 제안을 미리 꺼내 둘 시간 */
    const val APPROACH_KM = 3.0
    /** 다시 멀어졌다고 볼 거리. 경계에서 단계가 깜빡이지 않게 간격을 둔다 */
    const val APPROACH_EXIT_KM = 5.0
    /** 이 안에서 주차하면 목적지 도착으로 본다. 그 밖의 주차는 중간 정차다 */
    const val ARRIVE_KM = 0.5

    /**
     * 움직임 판정. **속도 0 만으로 주차라고 하지 않는다** — 신호대기도 0 이다.
     * P 단은 차가 알려 준 주차(CONFIRMED), 주차 브레이크 + 정지는 추정(INFERRED), 둘 다 없으면 그냥 정지다.
     */
    /** 이 속도를 넘으면 "달린다" — 센서 잡음(0~3km/h)은 정지로 본다 (journey.ts CONFLICT_SPEED_KMH) */
    const val CONFLICT_SPEED_KMH = 3.0

    fun motionOf(s: JourneySignals): Motion = when {
        // 신호끼리 어긋나면 어느 쪽도 믿지 않는다 — 단계를 바꾸지 않는다(외부 평가 8 ③)
        s.speedKmh != null && s.speedKmh > CONFLICT_SPEED_KMH && (s.gear == Gear.PARK || s.parkingBrake == true) -> Motion(MotionKind.UNKNOWN, Confidence.UNKNOWN)
        s.gear == Gear.PARK -> Motion(MotionKind.PARKED, Confidence.CONFIRMED)
        s.speedKmh == null ->
            if (s.uxRestricted == true) Motion(MotionKind.MOVING, Confidence.INFERRED) else Motion(MotionKind.UNKNOWN, Confidence.UNKNOWN)
        s.speedKmh > 0 -> Motion(MotionKind.MOVING, Confidence.CONFIRMED)
        s.parkingBrake == true -> Motion(MotionKind.PARKED, Confidence.INFERRED)
        else -> Motion(MotionKind.STOPPED, if (s.gear == Gear.UNKNOWN) Confidence.INFERRED else Confidence.CONFIRMED)
    }

    private fun near(km: Double?, limit: Double) = km != null && km <= limit

    /**
     * 다음 단계. 사용자 이벤트가 있으면 그것을 먼저, 없으면 차량 신호로 판단한다.
     *
     * 지키는 것:
     *  · 주차했다고 하차 화면으로 넘어가지 않는다 — PARKED → FINISHING 은 사용자의 START_FINISH 로만 (스펙 8.1)
     *  · 목적지에 가까워졌다고 여행을 끝내지 않는다 — COMPLETED 는 FINISH_DONE 이나 CANCEL_TRIP 으로만
     *  · 움직임을 모르면(UNKNOWN) 단계를 바꾸지 않는다 — 모르는 것을 아는 척 넘기지 않는다
     */
    fun next(state: JourneyState, signals: JourneySignals, event: JourneyEvent? = null): JourneyState {
        val phase = state.phase
        if (event != null) return when (event) {
            JourneyEvent.START_PREPARE ->
                if (phase == JourneyPhase.NOT_STARTED || phase == JourneyPhase.COMPLETED) state.copy(phase = JourneyPhase.PREPARING, atDestination = false, confidence = Confidence.CONFIRMED, leg = 0) else state
            JourneyEvent.CANCEL_TRIP ->
                if (phase == JourneyPhase.PREPARING) state.copy(phase = JourneyPhase.COMPLETED, atDestination = false, confidence = Confidence.CONFIRMED) else state
            JourneyEvent.DESTINATION_CHANGED -> when (phase) {
                JourneyPhase.APPROACHING -> state.copy(phase = JourneyPhase.DRIVING)
                JourneyPhase.PARKED -> state.copy(atDestination = false)
                else -> state
            }
            // 대기 중에 잠시 내리는 것도 하차 확인이다 — 끝나면 다시 대기로 돌아온다
            JourneyEvent.START_FINISH ->
                if (phase == JourneyPhase.PARKED || phase == JourneyPhase.WAITING) state.copy(phase = JourneyPhase.FINISHING, confidence = Confidence.CONFIRMED) else state
            JourneyEvent.FINISH_DONE -> when {
                phase != JourneyPhase.FINISHING -> state
                // 중간 정차(휴게소·충전소)에서 내렸다 오는 것은 구간의 끝이 아니다 — 주차로 돌아가 이어서 간다
                !state.atDestination -> state.copy(phase = JourneyPhase.PARKED, confidence = Confidence.CONFIRMED)
                state.isLastLeg -> state.copy(phase = JourneyPhase.COMPLETED, atDestination = true, confidence = Confidence.CONFIRMED)
                else -> state.copy(phase = JourneyPhase.WAITING, atDestination = true, confidence = Confidence.CONFIRMED)
            }
            JourneyEvent.START_WAIT ->
                if (phase == JourneyPhase.PARKED && state.atDestination && !state.isLastLeg) state.copy(phase = JourneyPhase.WAITING, confidence = Confidence.CONFIRMED) else state
            JourneyEvent.END_TRIP ->
                if (phase == JourneyPhase.PARKED || phase == JourneyPhase.WAITING || phase == JourneyPhase.FINISHING) state.copy(phase = JourneyPhase.COMPLETED, confidence = Confidence.CONFIRMED) else state
        }

        val m = motionOf(signals)
        if (m.kind == MotionKind.UNKNOWN || phase == JourneyPhase.NOT_STARTED || phase == JourneyPhase.COMPLETED) return state

        if (m.kind == MotionKind.MOVING) {
            // 중간 목적지를 떠나면 다음 구간 — 이때 들어온 남은 거리는 지난 구간 값일 수 있어 '곧 도착'을 판단하지 않는다
            val leaving = state.atDestination && !state.isLastLeg &&
                (phase == JourneyPhase.PARKED || phase == JourneyPhase.FINISHING || phase == JourneyPhase.WAITING)
            if (leaving) return state.copy(phase = JourneyPhase.DRIVING, atDestination = false, confidence = m.confidence, leg = state.leg + 1)
            val approaching = if (phase == JourneyPhase.APPROACHING) !(signals.remainingKm != null && signals.remainingKm > APPROACH_EXIT_KM)
            else near(signals.remainingKm, APPROACH_KM)
            return state.copy(phase = if (approaching) JourneyPhase.APPROACHING else JourneyPhase.DRIVING, atDestination = false, confidence = m.confidence)
        }

        if (m.kind == MotionKind.PARKED && (phase == JourneyPhase.DRIVING || phase == JourneyPhase.APPROACHING)) {
            return state.copy(phase = JourneyPhase.PARKED, atDestination = near(signals.remainingKm, ARRIVE_KM), confidence = m.confidence)
        }
        // STOPPED(신호대기·정체)는 단계를 바꾸지 않는다. PREPARING·PARKED·FINISHING 에서 정지는 그대로다.
        return state
    }

    /**
     * 앱을 다시 켰을 때 — 저장해 둔 단계와 지금 차 상태가 어긋나면 지금 차를 믿는다.
     * 규칙은 next 와 같다 — 따로 두면 재시작 때만 다른 판단을 하게 된다.
     */
    fun restore(saved: JourneyState, signals: JourneySignals): JourneyState = next(saved, signals)

    /** 주행 중 화면 규칙을 적용해야 하나 — CarUxRestrictions 가 있으면 그것, 모르면 **제한하는 쪽** */
    fun isRestricted(signals: JourneySignals): Boolean = signals.uxRestricted ?: (motionOf(signals).kind != MotionKind.PARKED)
}
