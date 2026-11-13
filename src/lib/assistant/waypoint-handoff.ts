/**
 * 승인 후 경유지 요청의 상태 — core/assistant/WaypointHandoff.kt 의 거울. route-handoff.ts 와 같은 원칙(V6, 2026-11-04).
 *
 * 근거: NaviHelper `addWaypoint(RequestWaypointInfo)` · `removeWaypoint(WaypointIndex)` · `getWaypointInfo()` → `onWayPointInfo` · `onWaypointChanged(index, cmdType, …)` · `onError`.
 *
 * 지키는 것:
 *  1. 경로가 없으면 보내지 않는다 — 목적지 없는 addWaypoint 는 콜백 없이 내비 검색 화면을 띄웠다(E11, 2026-10-29)
 *  2. 슬롯 2개가 차면 **사용자가 고른 칸만** 교체한다. 자동으로 지우지 않는다
 *  3. 콜백만으로 완료가 아니다 — 경유지 목록을 다시 읽어 그 장소가 있어야 VERIFIED, 지키기로 한 기존 경유지가 사라졌으면 그것도 알린다
 *  4. 응답이 없으면 모른다고 말하고, 다시 읽기 전에 재전송하지 않는다
 */
import { NAVI_ERROR_LABEL, samePlace, validPlace, type NaviError, type NaviPlace } from "./route-handoff";

export const WAYPOINT_SLOTS = 2;

/**
 * 경유지가 같은가 — 에뮬레이터의 getWaypointInfo 는 이름만 주고 좌표를 (0, 0)으로 줬다(2026-11-04, E24).
 * 좌표로만 비교하면 실제로 들어간 경유지를 '없다'고 하고, (0, 0)끼리는 전부 같은 곳이 된다. 좌표가 비었으면 이름으로 본다
 */
export function sameWaypoint(a: NaviPlace, b: NaviPlace): boolean {
  if (a.poiId && b.poiId && a.poiId === b.poiId) return true;
  return validPlace(a) && validPlace(b) ? samePlace(a, b) : a.name === b.name;
}

export type WaypointPhase = "IDLE" | "LOOKING" | "NO_ROUTE" | "SLOTS_FULL" | "PENDING" | "VERIFIED" | "FAILED" | "UNKNOWN_OUTCOME";

export type WaypointState = {
  phase: WaypointPhase;
  requestId: number | null;
  target: NaviPlace | null;
  existing: NaviPlace[];
  /** 교체하기로 고른 칸. null = 빈 칸에 추가 */
  replaceIndex: number | null;
  acked: boolean;
  message: string | null;
  mock: boolean;
};

export const IDLE_WAYPOINT: WaypointState = { phase: "IDLE", requestId: null, target: null, existing: [], replaceIndex: null, acked: false, message: null, mock: false };

export type WaypointEvent =
  | { type: "START"; requestId: number; target: NaviPlace; mock?: boolean }
  /** routing null = 경로 여부를 못 읽음 */
  | { type: "LOOKUP"; requestId: number; routing: boolean | null; waypoints: NaviPlace[] }
  | { type: "CHOOSE_REPLACE"; requestId: number; index: number }
  | { type: "CANCEL" }
  | { type: "ACK"; requestId: number }
  | { type: "WAYPOINTS_READ"; requestId: number; waypoints: NaviPlace[] }
  | { type: "ERROR"; requestId: number; error: NaviError }
  | { type: "TIMEOUT"; requestId: number }
  /** 여러 번 다시 읽어도 목록에 없다 — 실패라고 단정하지 않고 사람에게 넘긴다 */
  | { type: "GIVE_UP"; requestId: number }
  | { type: "INVALIDATE"; reason: string };

export const shouldSendWaypoint = (s: WaypointState) => s.phase === "PENDING" && !s.acked;

export function reduceWaypoint(s: WaypointState, e: WaypointEvent): WaypointState {
  const mine = (id: number) => id === s.requestId;
  switch (e.type) {
    case "START":
      if (s.phase === "LOOKING" || s.phase === "PENDING" || s.phase === "UNKNOWN_OUTCOME") return s;
      return { ...IDLE_WAYPOINT, phase: "LOOKING", requestId: e.requestId, target: e.target, mock: e.mock ?? false };
    case "LOOKUP": {
      if (!mine(e.requestId) || s.phase !== "LOOKING" || !s.target) return s;
      if (e.routing == null) return { ...s, phase: "FAILED", message: "내비 경로 상태를 읽지 못해 보내지 않았어요" };
      if (!e.routing) return { ...s, phase: "NO_ROUTE", message: "내비에 목적지가 없어요 · 목적지를 먼저 설정해 주세요" };
      const target = s.target;
      if (e.waypoints.some((w) => sameWaypoint(w, target))) return { ...s, phase: "VERIFIED", existing: e.waypoints, message: `이미 경유지에 있어요: ${target.name}` };
      if (e.waypoints.length >= WAYPOINT_SLOTS) return { ...s, phase: "SLOTS_FULL", existing: e.waypoints, message: "경유지 칸이 모두 찼어요 · 바꿀 칸을 고르거나 그대로 두세요" };
      return { ...s, phase: "PENDING", existing: e.waypoints, message: null };
    }
    case "CHOOSE_REPLACE":
      return mine(e.requestId) && s.phase === "SLOTS_FULL" && e.index >= 0 && e.index < s.existing.length ? { ...s, phase: "PENDING", replaceIndex: e.index, message: null } : s;
    case "CANCEL":
      return s.phase === "SLOTS_FULL" || s.phase === "NO_ROUTE" || s.phase === "VERIFIED" || s.phase === "FAILED"
        ? { ...IDLE_WAYPOINT, message: s.phase === "SLOTS_FULL" ? "기존 경유지를 그대로 둡니다" : null } : s;
    case "ACK":
      return mine(e.requestId) && (s.phase === "PENDING" || s.phase === "UNKNOWN_OUTCOME") ? { ...s, acked: true } : s;
    case "WAYPOINTS_READ": {
      if (!mine(e.requestId) || (s.phase !== "PENDING" && s.phase !== "UNKNOWN_OUTCOME") || !s.target) return s;
      const target = s.target;
      if (e.waypoints.some((w) => sameWaypoint(w, target))) {
        const keep = s.existing.filter((_, i) => i !== s.replaceIndex);
        const lost = keep.filter((k) => !e.waypoints.some((w) => sameWaypoint(w, k)));
        const late = s.phase === "UNKNOWN_OUTCOME";
        if (lost.length) return { ...s, phase: "VERIFIED", acked: true, message: `추가됐어요: ${target.name} · 목록에 없는 기존 경유지: ${lost.map((p) => p.name).join(", ")} · 내비게이션에서 확인해 주세요` };
        return { ...s, phase: "VERIFIED", acked: true, message: late ? `응답은 늦었지만 경유지에 있어요: ${target.name}` : s.mock ? `시연 내비 경유지에 추가했어요 (모의): ${target.name}` : `경유지에 추가했어요: ${target.name} · 내비가 확인함` };
      }
      // 콜백이 없으면 목록이 비어도 모른다 — onWaypointChanged 가 오지 않고 목록이 수십 초 뒤에 채워졌다(E24). 실패라 하면 중복 추가로 이어진다
      if (!s.acked) return s;
      return { ...s, phase: "FAILED", message: `경유지 목록에서 찾지 못했어요: ${target.name} · 내비게이션에서 확인해 주세요` };
    }
    case "ERROR":
      return mine(e.requestId) && (s.phase === "LOOKING" || s.phase === "PENDING" || s.phase === "UNKNOWN_OUTCOME") ? { ...s, phase: "FAILED", message: `${NAVI_ERROR_LABEL[e.error]} · 기존 경로는 그대로입니다` } : s;
    case "TIMEOUT":
      if (!mine(e.requestId)) return s;
      if (s.phase === "LOOKING") return { ...s, phase: "FAILED", message: `${NAVI_ERROR_LABEL.UNAVAILABLE} · 보내지 않았어요` };
      return s.phase === "PENDING" ? { ...s, phase: "UNKNOWN_OUTCOME", message: "내비 응답이 없어 추가됐는지 모릅니다 · 목록을 다시 읽는 중 — 그전에는 다시 보내지 않습니다" } : s;
    case "GIVE_UP":
      return mine(e.requestId) && (s.phase === "UNKNOWN_OUTCOME" || s.phase === "PENDING") ? { ...s, phase: "FAILED", message: `추가됐는지 확인하지 못했어요: ${s.target?.name ?? ""} · 내비게이션에서 확인해 주세요 · 다시 보내지 않았어요` } : s;
    case "INVALIDATE":
      return s.phase === "SLOTS_FULL" || s.phase === "NO_ROUTE" ? { ...IDLE_WAYPOINT, message: e.reason } : s;
  }
}
