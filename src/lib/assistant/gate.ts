/**
 * Safety & Permission Gate — 제안과 실제 차량 동작 사이에 **반드시** 끼는 검사. core/assistant/SafetyGate.kt 의 거울.
 *
 * 원칙은 하나다: **모르면 막는다(fail closed).** 주행 제한을 모르면 주행 중으로, 차량 지원을 모르면 미지원으로,
 * 권한을 모르면 거부로 본다. 차량 제어에서 "정보가 없으니 일단 허용"은 사고의 출발점이다.
 *
 * 권한 이름은 실물 SDK 의 @RequiresPermission 에서 읽은 것이다 (Vehicle 2.3.2 · NaviHelper 3.0.5, javap, 2026-10-26).
 * 조회와 제어 권한이 **따로** 있다 — CAR_CLIMATE(읽기) / CONTROL_CAR_CLIMATE(쓰기). 서드파티 앱에 CONTROL_* 이
 * 실제로 허용되는지는 미확인이다 (docs/10-briefing.md).
 */
import type { Motion } from "./journey";

export type ActionType =
  | "LOAD_PROFILE"
  | "SET_CLIMATE"
  | "SET_SEAT"
  | "SET_LIGHT"
  | "CHECK_ENERGY"
  | "SUGGEST_CHARGE_STOP"
  | "ADD_WAYPOINT"
  | "EDIT_CHECKLIST"
  | "CONFIRM_FINISH"
  /** 귀가 구간 준비(V5 Mission) — 사용자 확인으로 다음 구간을 "준비됨"으로 표시만 한다. 내비 목적지는 앱이 바꾸지 않는다(정책 1) */
  | "PREPARE_NEXT_LEG"
  /** 원탭 다음 이동(V5, 2026-11-03) — 내비에 저장된 집으로 경로 요청(NaviHelper.requestRoute). 기존 경로가 있으면 교체 확인을 한 번 더 받는다(route-handoff.ts) */
  | "REQUEST_ROUTE";

export type Permission =
  | "CAR_CLIMATE"
  | "CONTROL_CAR_CLIMATE"
  | "CONTROL_CAR_SEATS"
  | "CONTROL_CAR_LIGHTS"
  | "CAR_ENERGY"
  | "NAVI_ROUTE_SEARCH";

/** 차종마다 다르다 — Vehicle SDK 의 checkXXXCapabilities 결과 */
export type Capability = "HVAC_TEMPERATURE" | "SEAT_POSITION" | "LIGHT_CABIN" | "EV_BATTERY" | "NAVI_WAYPOINT";

/**
 * 주행 중 — ALLOW 그대로 · DEFER 정차 후로 미룸 · BLOCK 막음.
 * 공조·좌석·조명은 주행 중 BLOCK 이다. 차가 허용하더라도 우리 앱이 운전 중에 차 설정을 바꾸자고 하지 않는다.
 */
type WhileDriving = "ALLOW" | "DEFER" | "BLOCK";

export type ActionPolicy = {
  confirmation: boolean;
  whileDriving: WhileDriving;
  requiresParked: boolean;
  capability: Capability | null;
  permission: Permission | null;
};

export const ACTION_POLICY: Record<ActionType, ActionPolicy> = {
  LOAD_PROFILE: { confirmation: true, whileDriving: "DEFER", requiresParked: false, capability: null, permission: null },
  SET_CLIMATE: { confirmation: true, whileDriving: "BLOCK", requiresParked: false, capability: "HVAC_TEMPERATURE", permission: "CONTROL_CAR_CLIMATE" },
  SET_SEAT: { confirmation: true, whileDriving: "BLOCK", requiresParked: true, capability: "SEAT_POSITION", permission: "CONTROL_CAR_SEATS" },
  SET_LIGHT: { confirmation: true, whileDriving: "BLOCK", requiresParked: true, capability: "LIGHT_CABIN", permission: "CONTROL_CAR_LIGHTS" },
  CHECK_ENERGY: { confirmation: false, whileDriving: "ALLOW", requiresParked: false, capability: null, permission: null },
  // 주행 중 "EV 충전소 찾기 + 경유지 설정" 은 Mobility Services 허용 예시에 명시돼 있다 (research 5절). 실제 범위는 DO 선언에 따른다.
  SUGGEST_CHARGE_STOP: { confirmation: false, whileDriving: "ALLOW", requiresParked: false, capability: null, permission: null },
  ADD_WAYPOINT: { confirmation: true, whileDriving: "ALLOW", requiresParked: false, capability: "NAVI_WAYPOINT", permission: "NAVI_ROUTE_SEARCH" },
  EDIT_CHECKLIST: { confirmation: false, whileDriving: "BLOCK", requiresParked: false, capability: null, permission: null },
  CONFIRM_FINISH: { confirmation: true, whileDriving: "BLOCK", requiresParked: true, capability: null, permission: null },
  // 주차한 채 방문·대기 중에만 — 차량에는 아무것도 보내지 않으므로 지원·권한 검사는 없다
  PREPARE_NEXT_LEG: { confirmation: true, whileDriving: "BLOCK", requiresParked: true, capability: null, permission: null },
  // 주차한 채 — 경로를 바꾸는 요청이라 주행 중에는 막는다(DO 범위가 확인되기 전 보수적으로). 권한은 실물 SDK @RequiresPermission 그대로
  REQUEST_ROUTE: { confirmation: true, whileDriving: "BLOCK", requiresParked: true, capability: null, permission: "NAVI_ROUTE_SEARCH" },
};

/** null = 모른다. 모르면 없는 것으로 친다 */
export type GateContext = {
  uxRestricted: boolean | null;
  motion: Motion;
  capabilities: Partial<Record<Capability, boolean | null>>;
  permissions: Partial<Record<Permission, boolean | null>>;
  /** 이미 실행 중인 액션 — 같은 것을 두 번 보내지 않는다 */
  inFlight: ActionType[];
};

export type GateBlock =
  | "DRIVING_BLOCKED"
  | "DRIVING_DEFERRED"
  | "UNSUPPORTED"
  | "NO_PERMISSION"
  | "NEEDS_PARKED"
  | "NEEDS_CONFIRMATION"
  | "DUPLICATE";

export type GateResult = { allowed: true } | { allowed: false; block: GateBlock; message: string };

const BLOCK_MESSAGE: Record<GateBlock, string> = {
  DRIVING_BLOCKED: "주행 중에는 할 수 없습니다.",
  DRIVING_DEFERRED: "정차하면 다시 알려 드릴게요.",
  UNSUPPORTED: "이 차량에서는 앱에서 지원하지 않는 기능입니다.",
  NO_PERMISSION: "이 기능을 쓸 권한이 없습니다.",
  NEEDS_PARKED: "주차한 뒤에 할 수 있습니다.",
  NEEDS_CONFIRMATION: "확인이 필요합니다.",
  DUPLICATE: "이미 요청 중입니다.",
};

const block = (b: GateBlock): GateResult => ({ allowed: false, block: b, message: BLOCK_MESSAGE[b] });

/**
 * 검사 순서는 스펙 9.2 를 따른다: 주행 제한 → 차량 지원 → 권한 → 차량 상태 → 사용자 확인 → 중복.
 * (앱 카테고리·국가별 제한은 플랫폼이 DO 선언으로 거른다 — 앱이 따로 알 수 있는 값이 없다.)
 *
 * **확인 버튼을 누른 뒤 실행 직전에 한 번 더 부른다.** 확인하는 사이 차가 출발했으면 그때 막혀야 한다.
 */
export function checkAction(type: ActionType, ctx: GateContext, confirmed: boolean): GateResult {
  const p = ACTION_POLICY[type];
  // CarUxRestrictions 가 풀어 줘도 바퀴가 굴러가는 중(또는 모름)이면 주행으로 본다 — 둘 중 보수적인 쪽
  const rolling = ctx.motion.kind === "MOVING" || ctx.motion.kind === "UNKNOWN";
  const restricted = (ctx.uxRestricted ?? ctx.motion.kind !== "PARKED") || rolling;
  if (restricted && p.whileDriving === "BLOCK") return block("DRIVING_BLOCKED");
  if (restricted && p.whileDriving === "DEFER") return block("DRIVING_DEFERRED");
  if (p.capability && ctx.capabilities[p.capability] !== true) return block("UNSUPPORTED");
  if (p.permission && ctx.permissions[p.permission] !== true) return block("NO_PERMISSION");
  if (p.requiresParked && ctx.motion.kind !== "PARKED") return block("NEEDS_PARKED");
  if (p.confirmation && !confirmed) return block("NEEDS_CONFIRMATION");
  if (ctx.inFlight.includes(type)) return block("DUPLICATE");
  return { allowed: true };
}

/** 이 액션을 주행 중 화면에 꺼내도 되나 — 제안 엔진이 후보를 거를 때 쓴다 */
export const allowedWhileDriving = (type: ActionType) => ACTION_POLICY[type].whileDriving === "ALLOW";

/**
 * 차량 제어 결과 — **요청이 받아들여진 것과 차에 실제로 반영된 것을 나눈다.**
 * SDK set 콜백이 돌려준 값, 가능하면 다시 읽은 값까지 목표와 맞아야 SUCCESS 다.
 * source 를 늘 달고 다닌다 — Mock 성공을 실제 차량 성공처럼 보여 주지 않는다 (CLAUDE.md 정책 4).
 */
export type ControlStatus = "IDLE" | "CONFIRMING" | "PENDING" | "SUCCESS" | "FAILED" | "UNSUPPORTED" | "TIMEOUT";
export type ControlSource = "MOCK" | "VEHICLE";

export type ControlOutcome =
  | { kind: "CALLBACK"; value: number }
  | { kind: "ERROR"; reason: string }
  | { kind: "TIMEOUT" };

export type ControlResult = { status: ControlStatus; source: ControlSource; applied: number | null; message: string };

/** 공조 설정 온도는 0.5°C 단위로 움직인다 — 그보다 작은 차이는 같은 값으로 본다 */
export const CONTROL_TOLERANCE = 0.25;

export function settleControl(target: number, outcome: ControlOutcome, readback: number | null, source: ControlSource): ControlResult {
  if (outcome.kind === "TIMEOUT") return { status: "TIMEOUT", source, applied: readback, message: "차량 응답이 없어 적용하지 않았습니다. 다시 시도할 수 있습니다." };
  if (outcome.kind === "ERROR") return { status: "FAILED", source, applied: readback, message: `적용하지 못했습니다: ${outcome.reason}` };
  const actual = readback ?? outcome.value;
  if (Math.abs(actual - target) > CONTROL_TOLERANCE) {
    return { status: "FAILED", source, applied: actual, message: `요청한 값과 차량 값이 다릅니다 (요청 ${target} · 현재 ${actual}).` };
  }
  return { status: "SUCCESS", source, applied: actual, message: source === "MOCK" ? `시연 값으로 ${target} 적용` : `${target} 적용됨` };
}
