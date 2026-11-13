/**
 * 원탭 다음 이동 — 귀가 목적지를 내비에 넘기는 요청의 상태. core/assistant/RouteHandoff.kt 의 거울 (V5, 2026-11-03).
 *
 * 근거(실물 SDK NaviHelper 3.0.5, javap 2026-11-03): `requestRoute(RouteInfo)` · `getDestinationInfo()` → `onDestinationInfo` ·
 * `getBookmarkInfo()` → `onBookmarkInfo`(BookmarkType.HOME) · 콜백 `onRouteStarted` · `onRoutingCompleted` · `onDestinationChanged` · `onError(NaviErrorCode)` ·
 * 권한 `pleos.car.permission.NAVI_ROUTE_SEARCH`(@RequiresPermission).
 *
 * 지키는 것:
 *  1. **없는 주소를 만들지 않는다** — 집은 사용자가 내비에 저장한 HOME 즐겨찾기만. 없으면 NO_HOME → 지금처럼 "직접 설정"
 *  2. **기존 경로를 말없이 바꾸지 않는다** — 내비에 다른 목적지가 있으면 CONFIRM_REPLACE 로 무엇이 바뀌는지 보여 주고 한 번 더 승인
 *  3. **요청 성공 ≠ 설정 완료** — 목적지를 다시 읽어 집과 맞아야 VERIFIED. 응답이 없으면 UNKNOWN_OUTCOME(모름) — 다시 읽기 전 재전송 안 함
 *  4. 늦게 온 콜백은 그 요청의 것일 때만 반영한다(actions.ts 와 같은 규칙)
 * 순수 리듀서다. SDK 호출·타이머는 어댑터(차량용 앱 PleosNaviRoute · 웹 모의)가 하고 결과만 이벤트로 넣는다.
 */

export type NaviPlace = { name: string; lat: number; lon: number; poiId: string | null };

export type HandoffPhase = "IDLE" | "LOOKING" | "NO_HOME" | "CONFIRM_REPLACE" | "PENDING" | "VERIFIED" | "FAILED" | "UNKNOWN_OUTCOME";

export type HandoffState = {
  phase: HandoffPhase;
  requestId: number | null;
  home: NaviPlace | null;
  /** 요청 전에 내비에 있던 목적지 — 교체 확인과 결과 문장에 */
  current: NaviPlace | null;
  /** onRouteStarted / onRoutingCompleted 를 받았나 — 그것만으로 완료가 아니다 */
  routed: boolean;
  message: string | null;
  /** 모의 내비(웹 시뮬레이터·폰)인가 — 결과 문장에 '(모의)'를 단다. 실제 내비 확인과 섞지 않는다(정책 4) */
  mock: boolean;
};

export const IDLE_HANDOFF: HandoffState = { phase: "IDLE", requestId: null, home: null, current: null, routed: false, message: null, mock: false };

export type NaviError = "CAUSE_LOW_BATTERY" | "CAUSE_SEARCH_ROUTE_OVER_DISTANCE" | "CAUSE_SEARCH_ROUTE" | "CAUSE_SEARCH_ROUTE_TOO_SHORT_DISTANCE" | "CAUSE_SEARCH_TRIP" | "PERMISSION" | "UNAVAILABLE";
export const NAVI_ERROR_LABEL: Record<NaviError, string> = {
  CAUSE_LOW_BATTERY: "배터리가 부족해 내비가 경로를 만들지 않았습니다",
  CAUSE_SEARCH_ROUTE_OVER_DISTANCE: "거리가 너무 멀어 경로를 찾지 못했습니다",
  CAUSE_SEARCH_ROUTE: "내비가 경로를 찾지 못했습니다",
  CAUSE_SEARCH_ROUTE_TOO_SHORT_DISTANCE: "이미 집 근처라 경로를 만들지 않았습니다",
  CAUSE_SEARCH_TRIP: "내비가 경로를 찾지 못했습니다",
  PERMISSION: "내비 경로 권한이 없습니다",
  UNAVAILABLE: "내비게이션에 연결하지 못했습니다",
};

export type HandoffEvent =
  /** 사용자가 "집으로 안내 시작"을 눌렀다 — 즐겨찾기·현재 목적지를 읽기 시작 */
  | { type: "START"; requestId: number; mock?: boolean }
  /** 읽은 결과 — home: 내비의 HOME 즐겨찾기(없으면 null) · current: 지금 내비 목적지(경로 없으면 null) */
  | { type: "LOOKUP"; requestId: number; home: NaviPlace | null; current: NaviPlace | null }
  | { type: "CONFIRM_REPLACE"; requestId: number }
  | { type: "CANCEL" }
  | { type: "ROUTE_STARTED"; requestId: number }
  /** 목적지를 다시 읽은 값 — 이것이 집과 맞아야 완료 */
  | { type: "DESTINATION_READ"; requestId: number; place: NaviPlace | null }
  | { type: "ERROR"; requestId: number; error: NaviError }
  | { type: "TIMEOUT"; requestId: number }
  /** 주행이 시작됐거나 이동이 끝났다 — 열려 있던 확인은 무효 */
  | { type: "INVALIDATE"; reason: string };

/** 같은 곳인가 — POI id 가 같거나 100m 안. 좌표 순서는 (lat, lon) */
export const SAME_PLACE_M = 100;
export function samePlace(a: NaviPlace, b: NaviPlace): boolean {
  if (a.poiId && b.poiId && a.poiId === b.poiId) return true;
  const dy = (a.lat - b.lat) * 111_000;
  const dx = (a.lon - b.lon) * 111_000 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy) <= SAME_PLACE_M;
}

/**
 * 실제 장소인가 — 좌표가 (0, 0)이거나 범위를 벗어나면 **빈 자리**다. 에뮬레이터의 내비는 집을 등록하지 않아도 HOME 즐겨찾기를 (0, 0)으로 돌려줬다
 * (2026-11-03 — 그대로 보냈더니 내비가 "경로 탐색 오류 - Invalid Parameter"). 빈 자리는 집이 없는 것으로 본다
 */
export const validPlace = (p: NaviPlace | null): p is NaviPlace =>
  p !== null && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && !(Math.abs(p.lat) < 1e-6 && Math.abs(p.lon) < 1e-6);

/** 다음에 내비로 보낼 것이 있나 — 어댑터가 이 상태를 보고 requestRoute 를 부른다(PENDING 이고 아직 보내지 않았을 때) */
export const shouldSend = (s: HandoffState) => s.phase === "PENDING" && !s.routed;

export function reduceHandoff(s: HandoffState, e: HandoffEvent): HandoffState {
  const mine = (id: number) => id === s.requestId;
  switch (e.type) {
    case "START":
      // 보내는 중·결과를 모르는 중에는 다시 시작하지 않는다(중복 경로 요청 방지)
      if (s.phase === "LOOKING" || s.phase === "PENDING" || s.phase === "UNKNOWN_OUTCOME") return s;
      return { ...IDLE_HANDOFF, phase: "LOOKING", requestId: e.requestId, mock: e.mock ?? false };
    case "LOOKUP": {
      if (!mine(e.requestId) || s.phase !== "LOOKING") return s;
      if (!validPlace(e.home)) return { ...s, phase: "NO_HOME", current: e.current, message: "내비에 집이 저장돼 있지 않아요 · 내비게이션에서 집을 등록하거나 목적지를 직접 설정해 주세요" };
      if (e.current && samePlace(e.current, e.home)) return { ...s, phase: "VERIFIED", home: e.home, current: e.current, message: "이미 집으로 안내 중이에요" };
      if (e.current) return { ...s, phase: "CONFIRM_REPLACE", home: e.home, current: e.current, message: `지금 안내 중인 ${e.current.name} 경로가 집 경로로 바뀌어요` };
      return { ...s, phase: "PENDING", home: e.home, current: null, message: null };
    }
    case "CONFIRM_REPLACE":
      return mine(e.requestId) && s.phase === "CONFIRM_REPLACE" ? { ...s, phase: "PENDING", message: null } : s;
    case "CANCEL":
      return s.phase === "CONFIRM_REPLACE" || s.phase === "NO_HOME" || s.phase === "VERIFIED" || s.phase === "FAILED"
        ? { ...IDLE_HANDOFF, message: s.phase === "CONFIRM_REPLACE" ? "기존 경로를 그대로 둡니다" : null } : s;
    case "ROUTE_STARTED":
      return mine(e.requestId) && (s.phase === "PENDING" || s.phase === "UNKNOWN_OUTCOME") ? { ...s, routed: true } : s;
    case "DESTINATION_READ": {
      if (!mine(e.requestId) || (s.phase !== "PENDING" && s.phase !== "UNKNOWN_OUTCOME") || !s.home) return s;
      if (e.place && samePlace(e.place, s.home)) return { ...s, phase: "VERIFIED", routed: true, message: s.phase === "UNKNOWN_OUTCOME" ? "응답은 늦었지만 내비 목적지가 집으로 바뀌어 있어요" : s.mock ? "시연 내비에 집을 목적지로 설정했어요 (모의)" : "내비 목적지를 집으로 설정했어요 · 내비가 확인함" };
      // 아직 경로 콜백 전이면 기다린다 — 요청 직후 읽은 값은 지난 목적지일 수 있다
      if (!s.routed && s.phase === "PENDING") return s;
      return { ...s, phase: "FAILED", message: e.place ? `내비 목적지가 집이 아니에요(${e.place.name}) · 내비게이션에서 확인해 주세요` : "내비 목적지를 확인하지 못했어요 · 내비게이션에서 직접 확인해 주세요" };
    }
    case "ERROR":
      return mine(e.requestId) && (s.phase === "LOOKING" || s.phase === "PENDING" || s.phase === "UNKNOWN_OUTCOME")
        ? { ...s, phase: "FAILED", message: `${NAVI_ERROR_LABEL[e.error]} · 기존 경로는 그대로입니다` } : s;
    case "TIMEOUT":
      if (!mine(e.requestId)) return s;
      if (s.phase === "LOOKING") return { ...s, phase: "FAILED", message: `${NAVI_ERROR_LABEL.UNAVAILABLE} · 기존 경로는 그대로입니다` };
      return s.phase === "PENDING" ? { ...s, phase: "UNKNOWN_OUTCOME", message: "내비 응답이 없어 설정됐는지 모릅니다 · 목적지를 다시 읽는 중 — 그전에는 다시 보내지 않습니다" } : s;
    case "INVALIDATE":
      return s.phase === "CONFIRM_REPLACE" || s.phase === "NO_HOME" ? { ...IDLE_HANDOFF, message: e.reason } : s;
  }
}

/** 버튼 문구 — 상태마다 하나. null 이면 버튼 없음 */
export function handoffButton(s: HandoffState): string | null {
  switch (s.phase) {
    case "IDLE": case "FAILED": return "집으로 안내 시작";
    case "CONFIRM_REPLACE": return "집 경로로 바꾸기";
    default: return null;
  }
}
