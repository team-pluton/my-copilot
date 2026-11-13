/**
 * 여정 단계 — MY CO-PILOT 상황 판단의 뼈대. core/assistant/Journey.kt 와 **같은 규칙**이다 (거울).
 *
 * 쉼표 DRIVE 엔진은 "충전하러 서야 하나"를 판단했다. 이 층은 그 앞뒤 — **지금이 출발 전인가, 달리는 중인가,
 * 도착했나** — 를 판단해 어떤 제안을 꺼낼지 정한다. SDK 를 직접 부르지 않는다: 어댑터가 읽은 값을 받아
 * 다음 단계를 돌려줄 뿐이라 차량 없이 테스트된다 (docs/my-copilot/MIGRATION.md).
 */

export type JourneyPhase =
  | "NOT_STARTED"
  | "PREPARING"
  | "DRIVING"
  | "APPROACHING"
  | "PARKED"
  | "FINISHING"
  /** 중간 목적지에서 대기 중 — 귀가 구간이 남아 있다(왕복). 여정은 끝나지 않았다 */
  | "WAITING"
  | "COMPLETED";

/** CONFIRMED = 차량이 직접 알려 준 값 · INFERRED = 여러 신호를 조합한 추정 · UNKNOWN = 판단 불가 */
export type Confidence = "CONFIRMED" | "INFERRED" | "UNKNOWN";

export type Gear = "PARK" | "REVERSE" | "NEUTRAL" | "DRIVE" | "UNKNOWN";

/**
 * 어댑터가 넘겨 주는 차량 신호. 못 읽은 값은 null 이다 — 마지막 값을 현재 값인 척 넣지 않는다.
 *  · gear: Vehicle SDK Gear(getCurrentGearSelectionState, CAR_DRIVE) 또는 AAOS GEAR_SELECTION
 *  · parkingBrake: AAOS PARKING_BRAKE_ON — Vehicle SDK Brake 는 **페달** 상태만 준다 (실물 jar, 2026-10-26)
 *  · uxRestricted: AAOS CarUxRestrictions — 주행 중 화면 제한은 우리 추정이 아니라 이 값이 정한다
 *  · remainingKm: NaviHelper DestinationInfo.remainDistance
 */
export type JourneySignals = {
  gear: Gear;
  parkingBrake: boolean | null;
  speedKmh: number | null;
  uxRestricted: boolean | null;
  remainingKm: number | null;
};

export type Motion = { kind: "MOVING" | "STOPPED" | "PARKED" | "UNKNOWN"; confidence: Confidence };

/** 목적지까지 이만큼 남으면 "곧 도착" — 도착 준비 제안을 미리 꺼내 둘 시간 */
export const APPROACH_KM = 3;
/** 다시 멀어졌다고 볼 거리. 경계에서 단계가 깜빡이지 않게 간격을 둔다 */
export const APPROACH_EXIT_KM = 5;
/** 이 안에서 주차하면 목적지 도착으로 본다. 그 밖의 주차는 중간 정차다 */
export const ARRIVE_KM = 0.5;

/**
 * 움직임 판정. **속도 0 만으로 주차라고 하지 않는다** — 신호대기도 0 이다.
 * P 단은 차가 알려 준 주차(CONFIRMED), 주차 브레이크 + 정지는 추정(INFERRED), 둘 다 없으면 그냥 정지다.
 */
/** 이 속도를 넘으면 "달린다" — 센서 잡음(0~3km/h)은 정지로 본다 */
export const CONFLICT_SPEED_KMH = 3;

export function motionOf(s: JourneySignals): Motion {
  // 신호끼리 어긋나면(P 인데 달린다 · 주차 브레이크인데 달린다) 어느 쪽도 믿지 않는다 — 단계를 바꾸지 않는다(외부 평가 8 ③). 복구 직후 섞인 값이 그렇다
  if (s.speedKmh !== null && s.speedKmh > CONFLICT_SPEED_KMH && (s.gear === "PARK" || s.parkingBrake === true)) return { kind: "UNKNOWN", confidence: "UNKNOWN" };
  if (s.gear === "PARK") return { kind: "PARKED", confidence: "CONFIRMED" };
  if (s.speedKmh === null) {
    return s.uxRestricted ? { kind: "MOVING", confidence: "INFERRED" } : { kind: "UNKNOWN", confidence: "UNKNOWN" };
  }
  if (s.speedKmh > 0) return { kind: "MOVING", confidence: "CONFIRMED" };
  if (s.parkingBrake === true) return { kind: "PARKED", confidence: "INFERRED" };
  return { kind: "STOPPED", confidence: s.gear === "UNKNOWN" ? "INFERRED" : "CONFIRMED" };
}

/** 사용자가 직접 하는 것 — 차가 대신 정하지 않는 전이는 전부 여기로만 들어온다 */
export type JourneyEvent =
  | "START_PREPARE"
  | "CANCEL_TRIP"
  | "DESTINATION_CHANGED"
  | "START_FINISH"
  | "FINISH_DONE"
  /** 중간 목적지에 주차한 채 기다리기 시작 (하차 확인 없이) */
  | "START_WAIT"
  /** 여정 전체 종료 — 귀가 구간이 남아 있어도 사용자가 끝낼 수 있다 */
  | "END_TRIP";

/**
 * 여정 = 구간(leg)들. 편도는 1구간, 왕복(업무·마중)은 가는 길 + 돌아오는 길 2구간.
 * 중간 목적지 도착은 **그 구간의 끝**이지 여정의 끝이 아니다 (QUALITY_AUDIT 4).
 */
export type JourneyState = {
  phase: JourneyPhase;
  /** PARKED 일 때 (이 구간의) 목적지 도착인가(true) 중간 정차인가(false) */
  atDestination: boolean;
  confidence: Confidence;
  /** 지금 구간 (0 = 가는 길) */
  leg: number;
  /** 전체 구간 수 — 편도 1 · 왕복 2 */
  legs: number;
};

export const INITIAL_JOURNEY: JourneyState = { phase: "NOT_STARTED", atDestination: false, confidence: "CONFIRMED", leg: 0, legs: 1 };

/** 여정의 구간 수를 정한다 — 출발 준비 때 여정(편도/왕복)에 맞춰 한 번 */
export const withLegs = (s: JourneyState, legs: number): JourneyState => ({ ...s, legs: Math.max(1, legs), leg: Math.min(s.leg, Math.max(1, legs) - 1) });

export const isLastLeg = (s: JourneyState) => s.leg >= s.legs - 1;

const near = (km: number | null, limit: number) => km !== null && km <= limit;

/**
 * 다음 단계. 사용자 이벤트가 있으면 그것을 먼저, 없으면 차량 신호로 판단한다.
 *
 * 지키는 것:
 *  · 주차했다고 하차 화면으로 넘어가지 않는다 — PARKED → FINISHING 은 사용자의 START_FINISH 로만 (스펙 8.1)
 *  · 목적지에 가까워졌다고 여행을 끝내지 않는다 — COMPLETED 는 (마지막 구간의) FINISH_DONE · END_TRIP · CANCEL_TRIP 으로만
 *  · **중간 목적지 하차는 여정의 끝이 아니다** — 귀가 구간이 남았으면 FINISH_DONE 은 WAITING 으로
 *  · 중간 목적지를 떠나 움직이면 다음 구간(귀가)이 된다
 *  · 움직임을 모르면(UNKNOWN) 단계를 바꾸지 않는다 — 모르는 것을 아는 척 넘기지 않는다
 */
export function nextJourney(state: JourneyState, signals: JourneySignals, event?: JourneyEvent): JourneyState {
  const { phase } = state;
  if (event) {
    switch (event) {
      case "START_PREPARE":
        return phase === "NOT_STARTED" || phase === "COMPLETED" ? { ...state, phase: "PREPARING", atDestination: false, confidence: "CONFIRMED", leg: 0 } : state;
      case "CANCEL_TRIP":
        return phase === "PREPARING" ? { ...state, phase: "COMPLETED", atDestination: false, confidence: "CONFIRMED" } : state;
      case "DESTINATION_CHANGED":
        return phase === "APPROACHING" ? { ...state, phase: "DRIVING" } : phase === "PARKED" ? { ...state, atDestination: false } : state;
      case "START_FINISH":
        // 대기 중에 잠시 내리는 것도 하차 확인이다 — 끝나면 다시 대기로 돌아온다
        return phase === "PARKED" || phase === "WAITING" ? { ...state, phase: "FINISHING", confidence: "CONFIRMED" } : state;
      case "FINISH_DONE":
        if (phase !== "FINISHING") return state;
        // 중간 정차(휴게소·충전소)에서 내렸다 오는 것은 구간의 끝이 아니다 — 주차로 돌아가 이어서 간다
        if (!state.atDestination) return { ...state, phase: "PARKED", confidence: "CONFIRMED" };
        return isLastLeg(state)
          ? { ...state, phase: "COMPLETED", atDestination: true, confidence: "CONFIRMED" }
          : { ...state, phase: "WAITING", atDestination: true, confidence: "CONFIRMED" };
      case "START_WAIT":
        return phase === "PARKED" && state.atDestination && !isLastLeg(state) ? { ...state, phase: "WAITING", confidence: "CONFIRMED" } : state;
      case "END_TRIP":
        return phase === "PARKED" || phase === "WAITING" || phase === "FINISHING" ? { ...state, phase: "COMPLETED", confidence: "CONFIRMED" } : state;
    }
  }

  const m = motionOf(signals);
  if (m.kind === "UNKNOWN" || phase === "NOT_STARTED" || phase === "COMPLETED") return state;

  if (m.kind === "MOVING") {
    // 중간 목적지를 떠나면 다음 구간 — 이때 들어온 남은 거리는 지난 구간 값일 수 있어 '곧 도착'을 판단하지 않는다
    const leaving = state.atDestination && (phase === "PARKED" || phase === "FINISHING" || phase === "WAITING") && !isLastLeg(state);
    if (leaving) return { ...state, phase: "DRIVING", atDestination: false, confidence: m.confidence, leg: state.leg + 1 };
    const approaching = phase === "APPROACHING" ? !(signals.remainingKm !== null && signals.remainingKm > APPROACH_EXIT_KM) : near(signals.remainingKm, APPROACH_KM);
    return { ...state, phase: approaching ? "APPROACHING" : "DRIVING", atDestination: false, confidence: m.confidence };
  }

  if (m.kind === "PARKED" && (phase === "DRIVING" || phase === "APPROACHING")) {
    return { ...state, phase: "PARKED", atDestination: near(signals.remainingKm, ARRIVE_KM), confidence: m.confidence };
  }
  // STOPPED(신호대기·정체)는 단계를 바꾸지 않는다. PREPARING·PARKED·FINISHING 에서 정지는 그대로다.
  return state;
}

/**
 * 앱을 다시 켰을 때 — 저장해 둔 단계와 지금 차 상태가 어긋나면 지금 차를 믿는다.
 * 하차 중이었는데 차가 달리고 있으면 DRIVING, 달리던 중이었는데 주차돼 있으면 PARKED.
 * 규칙은 nextJourney 와 같다 — 따로 두면 재시작 때만 다른 판단을 하게 된다.
 */
export function restoreJourney(saved: JourneyState, signals: JourneySignals): JourneyState {
  return nextJourney(saved, signals);
}

/** 주행 중 화면 규칙을 적용해야 하나 — CarUxRestrictions 가 있으면 그것, 모르면 **제한하는 쪽** */
export function isRestricted(signals: JourneySignals): boolean {
  if (signals.uxRestricted !== null) return signals.uxRestricted;
  const m = motionOf(signals);
  return m.kind !== "PARKED";
}
