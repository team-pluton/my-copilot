/**
 * Journey Mission — "하나의 이동 목적"을 끝까지 관리하는 최소 상태 객체 (V5 지시서 3·4절, 2026-11-02). core/assistant/Mission.kt 의 거울.
 *
 * 새 엔진이 아니다. 이미 있는 것 — 여정 구간(journey.ts: 편도 1·왕복 2, 중간 목적지 도착 ≠ 완료, WAITING) · 계획(TripPlan.returnKm) ·
 * 상황(situation.ts DRIVER × OCCUPANCY × JOURNEY) · Journey Memory — 위에 **공통된 목표와 진행 상태**를 얹어 화면·제안·복원이 같은 이름으로 말하게 한다.
 * 그래서 Mission 은 상태에서 **계산**한다(missionOf). 따로 들고 있는 값은 셋뿐이다: nextLegReady(귀가 구간 준비 확인) · waitSource(대기 시간의 출처) · endedEarly(귀가 남긴 채 종료).
 *
 * 정책(지시서 4절):
 *  1. 중간 목적지 도착을 Mission 완료로 처리하지 않는다 — journey 가 이미 그렇다(WAITING)
 *  2. 귀가 계획은 방문 중에도 보존 — plan.returnKm · returnDestination
 *  3. 대기 시간은 사용자 입력·저장된 계획만 — waitSource 가 NONE 이면 "미확인"이라고 쓴다. 추정하지 않는다
 *  6. 재시작·백그라운드 복귀에 확인된 상태를 복원 — MissionSnapshot(확인된 것만: 진행 중 제어 요청은 복원하지 않는다)
 *  8. 내비 목적지·경유지는 사용자 동의 없이 바꾸지 않는다 — NEXT_LEG 수락은 "준비됨" 표시일 뿐 NaviHelper 를 부르지 않는다
 */
import type { TripPlan } from "../core/model";
import { isLastLeg, type JourneyState } from "./journey";
import type { JourneyMemory } from "./memory";
import type { ProfileMode } from "./profile";
import { JOURNEY_OF, OCCUPANCY_OF, type DriverId, type JourneyKind, type Occupancy } from "./situation";
import { RETURN_DESTINATION } from "./trip";
import type { WaitMode } from "./wait";

/** 지원하는 Mission 유형(지시서 A~D) + 기존 동승자 프리셋(OUTING, 지우지 않는다) */
export type MissionType = "SOLO_COMMUTE" | "WORK_VISIT_RETURN" | "FAMILY_TRIP" | "PICKUP_RETURN" | "OUTING";
export const MISSION_OF: Record<ProfileMode, MissionType | null> = { SOLO: "SOLO_COMMUTE", WORK: "WORK_VISIT_RETURN", FAMILY: "FAMILY_TRIP", PICKUP: "PICKUP_RETURN", COMPANION: "OUTING", GUEST: null };
export const MISSION_LABEL: Record<MissionType, string> = { SOLO_COMMUTE: "혼자 출퇴근", WORK_VISIT_RETURN: "업무 방문 후 복귀", FAMILY_TRIP: "가족 이동·여행", PICKUP_RETURN: "픽업 후 귀가", OUTING: "동승 외출" };

/**
 * Mission 수명 주기(지시서 4절). 모든 Mission 이 모든 상태를 거치지 않는다 — 편도는 ARRIVED_AT_STOP(최종) → COMPLETED.
 * 기존 PREPARE·ASSIST·ENERGY·FINISH 는 엔진 이름이지 사용자에게 보이는 단계가 아니다.
 */
export type MissionPhase = "MISSION_SELECTED" | "PREPARE" | "EN_ROUTE" | "ARRIVED_AT_STOP" | "WAITING" | "VISITING" | "NEXT_LEG_READY" | "RETURNING" | "COMPLETED";
export const MISSION_PHASE_LABEL: Record<MissionPhase, string> = {
  MISSION_SELECTED: "선택됨", PREPARE: "출발 준비", EN_ROUTE: "이동 중", ARRIVED_AT_STOP: "목적지 근처", WAITING: "차 안에서 대기", VISITING: "방문 중",
  NEXT_LEG_READY: "귀가 확인 · 경로 요청 전", RETURNING: "귀가 중", COMPLETED: "완료",
};
export type MissionStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
/** 대기 시간의 출처 — SAVED 저장된 계획(프리셋·지난 이동) · USER 이번에 직접 확인·변경 · NONE 없음(프로필 없이) → 대기 소비는 계산에 없다 */
export type WaitSource = "SAVED" | "USER" | "NONE";
export const WAIT_SOURCE_LABEL: Record<WaitSource, string> = { SAVED: "저장된 계획", USER: "직접 확인", NONE: "미확인 · 대기 소비는 계산에 없음" };

export type Mission = {
  /** `모드#이동번호` — 프로필별 이동 번호라 프로필을 붙여야 유일하다 */
  missionId: string;
  missionType: MissionType | null;
  /** null = 운전자 미확인(UNKNOWN) — 운전석 항목은 유지 */
  driverId: DriverId | null;
  occupancy: Occupancy | null;
  tripPurpose: JourneyKind | null;
  destination: string;
  /** 확인된 경유지(내비 콜백으로 추가된 것만) */
  waypointIds: string[];
  /** 복귀 목적지 — 저장된 왕복 계획일 때만. 없으면 null(만들지 않는다) */
  returnDestination: string | null;
  wait: { minutes: number; source: WaitSource };
  phase: MissionPhase;
  /** 지금 구간 포함 남은 구간 수 — 완료면 0 */
  remainingLegs: number;
  /** 최종 목적지인가(편도의 도착 · 왕복의 귀가 도착) */
  finalStop: boolean;
  status: MissionStatus;
  /** 기능 가용성 — 에너지 판단(EV 특화)이 이 차량에서 되는가. 공통 기능은 늘 된다 */
  capability: { energy: boolean };
  createdAt: string | null;
  /** 내비 목적지가 집으로 설정된 것을 **목적지를 다시 읽어** 확인했나(route-handoff VERIFIED). 앱이 모르면 false — '설정됨'이라 쓰지 않는다 */
  naviRouteVerified: boolean;
  /** 그 확인이 모의 내비에서 온 것인가 */
  naviRouteMock: boolean;
  updatedAt: string;
};

export type MissionInput = {
  mode: ProfileMode; tripId: number; driver: DriverId | null; plan: TripPlan; journey: JourneyState; waitMode: WaitMode;
  nextLegReady: boolean; waitSource: WaitSource; endedEarly: boolean; energyAvailable: boolean; clock: string; createdAt: string | null;
  waypointIds: string[];
  naviRouteVerified?: boolean;
  naviRouteMock?: boolean;
};

/** 여정 단계 → Mission 단계. 중간 정차(휴게소·충전소)는 EN_ROUTE 안의 일이다 */
export function missionPhaseOf(j: JourneyState, waitMode: WaitMode, nextLegReady: boolean): MissionPhase {
  switch (j.phase) {
    case "NOT_STARTED": return "MISSION_SELECTED";
    case "PREPARING": return "PREPARE";
    case "DRIVING": case "APPROACHING": return j.leg > 0 ? "RETURNING" : "EN_ROUTE";
    case "PARKED": case "FINISHING": return j.atDestination ? "ARRIVED_AT_STOP" : j.leg > 0 ? "RETURNING" : "EN_ROUTE";
    case "WAITING": return nextLegReady ? "NEXT_LEG_READY" : waitMode === "AWAY" ? "VISITING" : "WAITING";
    case "COMPLETED": return "COMPLETED";
  }
}

export const remainingLegsOf = (j: JourneyState) => (j.phase === "COMPLETED" ? 0 : j.legs - j.leg);

/** 상태에서 Mission 을 계산한다. 이동 번호가 없으면(아직 고르지 않음) null */
export function missionOf(i: MissionInput): Mission | null {
  if (i.tripId <= 0) return null;
  const j = i.journey;
  const returnDestination = (i.plan.returnKm ?? 0) > 0 ? RETURN_DESTINATION : null;
  const status: MissionStatus = j.phase === "COMPLETED" ? (i.endedEarly ? "CANCELLED" : "COMPLETED") : "ACTIVE";
  return {
    missionId: `${i.mode}#${i.tripId}`, missionType: MISSION_OF[i.mode], driverId: i.driver, occupancy: OCCUPANCY_OF[i.mode], tripPurpose: JOURNEY_OF[i.mode],
    destination: i.plan.destinationName, waypointIds: i.waypointIds, returnDestination,
    wait: { minutes: i.plan.waitMinutesAfterArrival, source: i.waitSource },
    phase: missionPhaseOf(j, i.waitMode, i.nextLegReady), remainingLegs: remainingLegsOf(j),
    finalStop: j.atDestination && isLastLeg(j), status, capability: { energy: i.energyAvailable }, createdAt: i.createdAt, updatedAt: i.clock,
    naviRouteVerified: i.naviRouteVerified ?? false, naviRouteMock: i.naviRouteMock ?? false,
  };
}

/** 화면 머리 — "가족 이동·여행 · 이동 중" / 복귀가 남았으면 "귀가 유지" */
export function missionHeadline(m: Mission): string {
  const type = m.missionType ? MISSION_LABEL[m.missionType] : "프로필 없이";
  return `${type} · ${m.phase === "NEXT_LEG_READY" && m.naviRouteVerified ? (m.naviRouteMock ? "귀가 경로 확인됨 (모의)" : "귀가 경로 확인됨") : MISSION_PHASE_LABEL[m.phase]}`;
}
/** 복귀 줄 — 귀가 구간이 남아 있을 때만. 없는 복귀를 적지 않는다 */
export function missionReturnLine(m: Mission): string | null {
  if (!m.returnDestination || m.status !== "ACTIVE" || m.remainingLegs < 2) return null;
  if (m.phase === "NEXT_LEG_READY" && m.naviRouteVerified) return m.naviRouteMock ? `시연 내비 목적지: ${m.returnDestination} (모의)` : `내비 목적지: ${m.returnDestination} · 내비가 확인함`;
  return m.phase === "NEXT_LEG_READY" ? `귀가 일정은 기억하고 있어요 · 내비 경로는 아직 그대로예요 — '집으로 안내 시작'으로 요청할 수 있어요` : `귀가 ${m.returnDestination} 일정 기억 중 · 방문 뒤에도 끝나지 않음`;
}

// ── 복원 ────────────────────────────────────────────
/**
 * 재시작·백그라운드 복귀용 스냅샷 — **확인된 것만** 담는다: 선택·계획·구간·기억·경유지·대기 유형·귀가 준비.
 * 담지 않는 것: 진행 중 제어 요청(결과를 모르는 명령을 다시 보내지 않는다 — 재조회가 먼저) · 알림 기준(복원 뒤 지금 값으로 다시 잡는다) · 위치 이력(어디에도 저장 안 함).
 * 차량 값(배터리·주행 시간)은 모의 차량일 때만 의미가 있다 — 실제 차량에서는 콜백이 덮는다.
 */
export type MissionSnapshot = {
  version: 1;
  mode: ProfileMode; driver: DriverId | null; chosen: boolean;
  plan: TripPlan; journey: JourneyState; traveledKm: number; waitedMin: number; simMin: number;
  waitMode: WaitMode; waitSource: WaitSource; nextLegReady: boolean; endedEarly: boolean; missionStartedAt: string | null;
  memory: JourneyMemory; waypointIds: string[]; chargedAt: string[];
  batteryPct: number; tripMinutes: number; savedAt: string;
};

/** 복원할 가치가 있나 — 진행 중(ACTIVE)이고 출발 준비 이후인 것만. 끝난 이동·고르기 전은 새로 시작한다 */
export function restorable(s: MissionSnapshot | null | undefined): s is MissionSnapshot {
  if (!s || s.version !== 1 || !s.chosen) return false;
  return s.journey.phase !== "NOT_STARTED" && s.journey.phase !== "COMPLETED";
}
