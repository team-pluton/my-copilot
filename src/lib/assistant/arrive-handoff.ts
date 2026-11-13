/**
 * ARRIVE READY 실행 — 승인한 주차장을 내비 목적지로 보내고, 다시 읽어 확인한다. `core/.../ArriveHandoff.kt` 의 거울 (2026-11-12).
 *
 * 오너 지시(2026-11-12): 승인한 주차장의 ID · 좌표 · 정보 시각 · 판단 버전을 **고정**하고, 실행 전에 지금 목표 · 필수 조건과 맞는지 **다시 검증**한다.
 * 기존 내비 목적지가 있으면 **사용자 승인 없이 교체하지 않는다**. 요청 · 콜백 · 목적지 재조회 · 실패 · 미확인을 나눈다.
 * 주차장으로 경로가 설정됐다고 **주차 · 방문 완료로 기록하지 않는다**.
 *
 * 근거: 관문 C(E27) — 주차장 좌표를 poiId 없이 requestRoute → 안내 시작 → 목적지 재조회 같은 좌표 · 기존 경로는 내비가 묻지 않고 교체.
 * 집 경로(route-handoff.ts)와 같은 규칙: 늦은 콜백은 그 요청의 것만 · 응답이 없으면 다시 보내지 않고 다시 읽는다 · 100m 안이면 같은 곳.
 */
import { type ArriveDecision, type ArriveCandidate, type GeoPoint } from "./arrive-ready";
import { NAVI_ERROR_LABEL, samePlace, type NaviError, type NaviPlace } from "./route-handoff";
import type { ProfileMode } from "./profile";

/** 판단 규칙 버전 — 승인 때 고정한다. 규칙이 바뀌면 이전 승인으로 실행하지 않는다 */
export const ARRIVE_RULE_VERSION = "arrive-v0.2";

/** 승인 시점에 고정하는 것 — 실행 직전 다시 판단한 결과와 이것을 대조한다 */
export type ArriveApproval = {
  parkingId: string;
  name: string;
  point: GeoPoint;
  /** 승인 때 본 빈자리 정보의 갱신 시각(없으면 null) */
  dataAt: number | null;
  ruleVersion: string;
  /** 약속 시각 · 방문지 · 여유 — 바뀌면 다른 목표다 */
  goalKey: string;
  approvedAt: number;
};

export type ArrivePhase = "IDLE" | "REVALIDATING" | "BLOCKED" | "LOOKING" | "CONFIRM_REPLACE" | "PENDING" | "ROUTE_SET" | "FAILED" | "UNKNOWN_OUTCOME"
  /** 경로 설정 뒤 운전자가 내비에서 목적지를 바꿨거나 안내가 끝남 — 앱의 계획을 다시 적용하지 않는다 */
  | "OVERRIDDEN";

export type ArriveHandoffState = {
  phase: ArrivePhase;
  requestId: number | null;
  approval: ArriveApproval | null;
  current: NaviPlace | null;
  routed: boolean;
  message: string | null;
  mock: boolean;
};
export const IDLE_ARRIVE: ArriveHandoffState = { phase: "IDLE", requestId: null, approval: null, current: null, routed: false, message: null, mock: false };

export type ArriveHandoffEvent =
  | { type: "APPROVE"; requestId: number; approval: ArriveApproval; mock?: boolean }
  | { type: "REVALIDATED"; requestId: number; fresh: ArriveDecision; goalKey: string; ruleVersion: string }
  | { type: "LOOKUP"; requestId: number; current: NaviPlace | null; known: boolean }
  | { type: "CONFIRM_REPLACE"; requestId: number }
  | { type: "CANCEL" }
  | { type: "ROUTE_STARTED"; requestId: number }
  | { type: "DESTINATION_READ"; requestId: number; place: NaviPlace | null }
  | { type: "ERROR"; requestId: number; error: NaviError }
  | { type: "TIMEOUT"; requestId: number }
  /** 경로 설정 뒤 다시 읽은 내비 목적지 — 다시 판단할 때마다 */
  | { type: "NAVI_CHANGED"; place: NaviPlace | null; known: boolean };

export function goalKeyOf(appointmentAt: number | null, place: GeoPoint | null, bufferMin: number | null): string {
  return `${appointmentAt ?? "-"}|${place ? `${place.lat.toFixed(5)},${place.lon.toFixed(5)}` : "-"}|${bufferMin ?? "-"}`;
}

export function approvalOf(c: ArriveCandidate, goalKey: string, now: number): ArriveApproval {
  return { parkingId: c.parking.id, name: c.parking.name, point: c.parking.point!, dataAt: c.parking.updatedAt, ruleVersion: ARRIVE_RULE_VERSION, goalKey, approvedAt: now };
}

const placeOf = (a: ArriveApproval): NaviPlace => ({ name: a.name, lat: a.point.lat, lon: a.point.lon, poiId: null });

/**
 * 실행 직전 검증 — 승인한 그 주차장이 새 판단에서도 '추천 가능'으로 남아 있나. 문제면 이유(보내지 않는다), 괜찮으면 null.
 * 새 판단의 1순위가 바뀐 것만으로는 막지 않는다 — 사용자가 고른 곳이 여전히 조건을 맞추면 그대로 보낸다(대안을 승인한 경우 포함)
 */
export function revalidate(a: ArriveApproval, fresh: ArriveDecision, goalKey: string, ruleVersion: string): string | null {
  if (goalKey !== a.goalKey) return "약속이나 방문지가 바뀌었어요 · 다시 판단한 결과를 확인해 주세요";
  if (ruleVersion !== a.ruleVersion) return "판단 규칙이 바뀌었어요 · 다시 판단한 결과를 확인해 주세요";
  if (fresh.kind === "DATA_FAILED" || fresh.kind === "DATA_STALE") return fresh.headline;
  const still = [fresh.top, fresh.fasterButFar, ...fresh.alternatives].find((c) => c?.parking.id === a.parkingId) ?? null;
  if (!still) {
    const why = fresh.needsCheck.find((c) => c.parking.id === a.parkingId)?.problem ?? fresh.excluded.find((e) => e.id === a.parkingId)?.reason ?? "다시 판단한 결과에 없어요";
    return `승인한 ${a.name}이(가) 지금은 조건을 맞추지 못해요 · ${why}`;
  }
  if (!still.parking.point || !samePlace(placeOf(a), { name: a.name, lat: still.parking.point.lat, lon: still.parking.point.lon, poiId: null })) return "주차장 위치 정보가 바뀌었어요 · 다시 확인해 주세요";
  return null;
}

export const shouldSendArrive = (s: ArriveHandoffState) => s.phase === "PENDING" && !s.routed;

/** 경로 설정 ≠ 주차 완료 ≠ 방문 완료 — 결과 문장에 늘 붙인다 */
export const NOT_PARKED_YET = "주차 · 방문은 아직 기록하지 않아요";

export function reduceArrive(s: ArriveHandoffState, e: ArriveHandoffEvent): ArriveHandoffState {
  const mine = (id: number) => id === s.requestId;
  const busy = s.phase === "REVALIDATING" || s.phase === "LOOKING" || s.phase === "PENDING" || s.phase === "UNKNOWN_OUTCOME";
  switch (e.type) {
    case "APPROVE":
      // 진행 중이면 두 번째 승인은 무시 — 같은 요청을 두 번 보내지 않는다
      return busy ? s : { ...IDLE_ARRIVE, phase: "REVALIDATING", requestId: e.requestId, approval: e.approval, mock: e.mock ?? false };
    case "REVALIDATED": {
      if (!mine(e.requestId) || s.phase !== "REVALIDATING" || !s.approval) return s;
      const why = revalidate(s.approval, e.fresh, e.goalKey, e.ruleVersion);
      return why ? { ...s, phase: "BLOCKED", message: `${why} · 내비에는 보내지 않았어요` } : { ...s, phase: "LOOKING" };
    }
    case "LOOKUP": {
      if (!mine(e.requestId) || s.phase !== "LOOKING" || !s.approval) return s;
      if (!e.known) return { ...s, phase: "FAILED", message: "내비 상태를 읽지 못해 보내지 않았어요 · 기존 경로는 그대로입니다" };
      const target = placeOf(s.approval);
      if (e.current && samePlace(e.current, target)) return { ...s, phase: "ROUTE_SET", current: e.current, routed: true, message: `이미 ${s.approval.name}(으)로 안내 중이에요 · ${NOT_PARKED_YET}` };
      if (e.current) return { ...s, phase: "CONFIRM_REPLACE", current: e.current, message: `지금 안내 중인 ${e.current.name} 경로가 ${s.approval.name} 경로로 바뀌어요` };
      return { ...s, phase: "PENDING", current: null, message: null };
    }
    case "CONFIRM_REPLACE":
      return mine(e.requestId) && s.phase === "CONFIRM_REPLACE" ? { ...s, phase: "PENDING", message: null } : s;
    case "CANCEL":
      if (s.phase === "CONFIRM_REPLACE") return { ...IDLE_ARRIVE, message: "기존 경로를 그대로 둡니다" };
      return s.phase === "BLOCKED" || s.phase === "FAILED" || s.phase === "ROUTE_SET" || s.phase === "OVERRIDDEN" ? IDLE_ARRIVE : s;
    case "ROUTE_STARTED":
      return mine(e.requestId) && (s.phase === "PENDING" || s.phase === "UNKNOWN_OUTCOME") ? { ...s, routed: true } : s;
    case "DESTINATION_READ": {
      if (!mine(e.requestId) || (s.phase !== "PENDING" && s.phase !== "UNKNOWN_OUTCOME") || !s.approval) return s;
      if (e.place && samePlace(e.place, placeOf(s.approval))) {
        const head = s.phase === "UNKNOWN_OUTCOME" ? `응답은 늦었지만 내비 목적지가 ${s.approval.name}(으)로 바뀌어 있어요`
          : s.mock ? `시연 내비에 ${s.approval.name}을(를) 목적지로 설정했어요 (모의)` : `내비 목적지를 ${s.approval.name}(으)로 설정했어요 · 내비가 확인함`;
        return { ...s, phase: "ROUTE_SET", routed: true, message: `${head} · ${NOT_PARKED_YET}` };
      }
      // 요청 직후 읽은 값은 지난 목적지일 수 있다 — 경로 콜백 전이면 기다린다
      if (!s.routed && s.phase === "PENDING") return s;
      return { ...s, phase: "FAILED", message: e.place ? `내비 목적지가 ${s.approval.name}이(가) 아니에요(${e.place.name}) · 내비게이션에서 확인해 주세요` : "내비 목적지를 확인하지 못했어요 · 내비게이션에서 직접 확인해 주세요" };
    }
    case "ERROR":
      return mine(e.requestId) && (s.phase === "LOOKING" || s.phase === "PENDING" || s.phase === "UNKNOWN_OUTCOME")
        ? { ...s, phase: "FAILED", message: `${NAVI_ERROR_LABEL[e.error]} · 기존 경로는 그대로입니다` } : s;
    case "TIMEOUT":
      if (!mine(e.requestId)) return s;
      if (s.phase === "LOOKING") return { ...s, phase: "FAILED", message: `${NAVI_ERROR_LABEL.UNAVAILABLE} · 기존 경로는 그대로입니다` };
      if (s.phase === "PENDING") return { ...s, phase: "UNKNOWN_OUTCOME", message: "내비 응답이 없어 설정됐는지 모릅니다 · 목적지를 다시 읽는 중 — 그전에는 다시 보내지 않습니다" };
      return s;
    case "NAVI_CHANGED":
      // 읽지 못한 것은 바뀐 것이 아니다 · 같은 곳이면 그대로
      if (s.phase !== "ROUTE_SET" || !s.approval || !e.known || (e.place && samePlace(e.place, placeOf(s.approval)))) return s;
      return { ...s, phase: "OVERRIDDEN", current: e.place, routed: false,
        message: e.place ? `내비 목적지가 ${e.place.name}(으)로 바뀌어 있어요 · 앱이 보낸 경로가 아니라 이전 계획을 다시 적용하지 않아요`
          : "내비 안내가 끝났거나 목적지가 없어요 · 이전 계획을 다시 적용하지 않아요" };
  }
}

/**
 * 앱이 다시 켜졌을 때 — 저장한 승인을 **내비 목적지를 다시 읽은 값**과 대조한다(오너 2026-11-13).
 * 같을 때만 '경로 설정됨'으로 되살린다. 읽지 못했거나 다르면 반영됐다고 말하지 않고, 이전 계획을 다시 보내지도 않는다.
 * 주차 정보 · 소요 시간은 저장하지 않는다 — 복원 뒤 새로 받는다.
 */
export function restoreArrive(saved: ArriveApproval, current: NaviPlace | null, known: boolean, ruleVersion: string = ARRIVE_RULE_VERSION): ArriveHandoffState {
  if (saved.ruleVersion !== ruleVersion) return { ...IDLE_ARRIVE, message: "판단 규칙이 바뀌어 이전 승인은 쓰지 않아요 · 다시 판단해 주세요" };
  if (!known) return { ...IDLE_ARRIVE, message: `이전에 승인한 ${saved.name} 경로가 지금 내비에 있는지 읽지 못했어요 · 확인 전이라 설정됨으로 보지 않아요` };
  if (current && samePlace(current, placeOf(saved))) {
    return { ...IDLE_ARRIVE, phase: "ROUTE_SET", approval: saved, current, routed: true, message: `앱을 다시 열어 내비 목적지를 다시 읽었어요 · ${saved.name}(으)로 안내 중 · ${NOT_PARKED_YET}` };
  }
  return { ...IDLE_ARRIVE, message: `이전에 승인한 ${saved.name} 경로가 지금 내비 목적지와 달라요 · 다시 적용하지 않아요` };
}

/** 단계를 한 줄로 — 요청 중 · 반영됨 · 실패 · 미확인을 섞지 않는다 */
export function arriveStepLabel(s: ArriveHandoffState): string | null {
  switch (s.phase) {
    case "REVALIDATING": return "실행 전에 주차 정보와 소요 시간을 다시 확인하는 중";
    case "LOOKING": return "내비게이션의 지금 목적지를 확인하는 중";
    case "PENDING": return s.routed ? "내비가 경로를 시작했어요 · 목적지를 다시 읽는 중" : "내비에 경로를 요청하는 중";
    case "UNKNOWN_OUTCOME": return "응답 없음 · 결과 미확인";
    default: return null;
  }
}

/**
 * 누구의 어떤 이동인가 — 저장 · 복원의 주인(오너 2026-11-13). `ArriveHandoff.kt` ArriveOwner 의 거울.
 * 다른 운전자의 목표 · 승인이 보이지 않게 운전자 · 이동 목적별로 나누고, 프로필 없이(GUEST) 탄 이동은 저장하지 않는다.
 * 운전자 미확인(null)은 미확인끼리만 같다 — 확인된 운전자의 기록을 미확인 상태에서 꺼내지 않는다.
 */
export type ArriveOwner = { driver: string | null; mode: ProfileMode };
export const arriveSavable = (o: ArriveOwner) => o.mode !== "GUEST";
export const arriveStoreKey = (o: ArriveOwner) => `goal.${o.driver ?? "-"}.${o.mode}`;
export function arriveRestorable(saved: ArriveOwner, savedAppointmentAt: number, current: ArriveOwner, now: number): boolean {
  return arriveSavable(saved) && arriveSavable(current) && saved.driver === current.driver && saved.mode === current.mode && savedAppointmentAt > now;
}
