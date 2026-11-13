/**
 * Journey Memory — "이번 이동"을 기억하는 곳, 그리고 **프로필 사이의 벽**.
 *
 * 두 가지를 나눈다 (지시서 6절):
 *  · 이번 이동에만 유효한 것(JourneyMemory) — 준비 완료 · 공조 결정 · 고른 경유지 · 하차 확인 · 마지막 제안.
 *    새 이동이 시작되면 **비운다.** 지난 이동의 확인 결과를 새 이동에 자동으로 적용하지 않는다.
 *  · 프로필에 영구 저장하는 것(ProfileVault) — 프로필 설정 · 이동 기록 · 거절 학습. **프로필마다 따로** 둔다.
 *    공용 차량에서 업무 프로필로 바꿨을 때 가족 이동 기록이나 가족 프로필의 거절 기록이 보이거나 섞이면 안 된다.
 *
 * 위치 이력은 어디에도 저장하지 않는다. core/assistant/Memory.kt 의 거울(Android 이식 때 옮겼다, 2026-10-26).
 */
import type { SuggestionHistory, SuggestionType } from "./planner";
import type { ProfileMode } from "./profile";
import type { PrepareItemKey } from "./prepare";
import { EMPTY_LEARNING, type LearningState } from "./learning";
import type { SoloCabin } from "./situation";
import { DEMO_DRIVERS, type Driver, type DriverId } from "./situation";

export type ClimateDecision = { decision: "APPLIED" | "KEPT"; valueC: number };

export type JourneyMemory = {
  /** 이동 번호 — 같은 프로필의 여러 이동을 구분한다 */
  tripId: number;
  profile: ProfileMode;
  /** 출발 준비를 마쳤다고 사용자가 확인했나 — 마쳤으면 다시 요구하지 않는다 */
  prepareDone: boolean;
  /** 출발 준비물 중 확인한 것 */
  packed: string[];
  /** 공조를 맞췄는지(적용) 지금 값을 유지하기로 했는지 — 같은 변경을 다시 묻지 않는 근거 */
  climate: ClimateDecision | null;
  /** 사용자가 고른 경유지 — 다른 곳을 함부로 다시 권하지 않는다 */
  waypointIds: string[];
  /** 구간마다 하차 확인한 항목 */
  finishChecked: Record<number, string[]>;
  /** 마지막으로 앞에 보여 준 제안 */
  lastShown: SuggestionType | null;
  /** 출발 준비에서 이번에는 건너뛴 항목 — 완료가 아니다 */
  skipped: PrepareItemKey[];
};

export const newMemory = (tripId: number, profile: ProfileMode): JourneyMemory => ({
  tripId, profile, prepareDone: false, packed: [], climate: null, waypointIds: [], finishChecked: {}, lastShown: null, skipped: [],
});

export type MemoryEvent =
  | { kind: "PACKED"; items: string[] }
  | { kind: "PREPARE_DONE" }
  | { kind: "CLIMATE"; decision: ClimateDecision["decision"]; valueC: number }
  | { kind: "WAYPOINT"; id: string }
  | { kind: "FINISH_CHECKED"; leg: number; items: string[] }
  | { kind: "SHOWN"; type: SuggestionType | null }
  | { kind: "SKIP_PREPARE"; key: PrepareItemKey };

export function remember(m: JourneyMemory, e: MemoryEvent): JourneyMemory {
  switch (e.kind) {
    case "PACKED": return { ...m, packed: e.items };
    case "PREPARE_DONE": return { ...m, prepareDone: true };
    case "CLIMATE": return { ...m, climate: { decision: e.decision, valueC: e.valueC } };
    case "WAYPOINT": return m.waypointIds.includes(e.id) ? m : { ...m, waypointIds: [...m.waypointIds, e.id] };
    case "FINISH_CHECKED": return { ...m, finishChecked: { ...m.finishChecked, [e.leg]: e.items } };
    case "SHOWN": return m.lastShown === e.type ? m : { ...m, lastShown: e.type };
    case "SKIP_PREPARE": return m.skipped.includes(e.key) ? m : { ...m, skipped: [...m.skipped, e.key] };
  }
}

/**
 * 출발 준비 요약 — 완료 n · 확인 필요 m.
 * 공조: 맞추지 않는 프로필(SKIP)은 세지 않고, 같으면(SAME) 완료, 다르면 결정(적용·유지)했을 때 완료, 읽을 수 없으면(UNREADABLE) 확인 필요.
 */
export function prepareSummary(m: JourneyMemory, packingTotal: number, climate: "SKIP" | "SAME" | "DIFFERENT" | "UNREADABLE", energyOk: boolean | null) {
  const items = [
    ...(climate === "SKIP" ? [] : [climate === "SAME" || (climate === "DIFFERENT" && m.climate !== null)]),
    ...(packingTotal > 0 ? [m.packed.length >= packingTotal] : []),
    ...(energyOk === null ? [] : [energyOk || m.waypointIds.length > 0]),
  ];
  return { done: items.filter(Boolean).length, needs: items.filter((x) => !x).length };
}

// ── 프로필별 저장소 ─────────────────────────────────

export type ActivityKind = "PREPARE" | "ENERGY" | "WAYPOINT" | "FINISH" | "STATE";
export type Activity = { clock: string; kind: ActivityKind; text: string; tripId: number };

export type ProfileVault = {
  activity: Record<ProfileMode, Activity[]>;
  history: Record<ProfileMode, SuggestionHistory>;
  /** 프로필마다 다음 이동 번호 */
  nextTripId: Record<ProfileMode, number>;
  /**
   * 마지막으로 고른 탑승 조합 — 다음 이용에서 선택 화면을 건너뛰고 "지난번처럼"으로 바로 준비한다(오너 지시 1절).
   * 프로필 없이(GUEST) 간 이동은 기억하지 않는다. 바꾸는 길은 늘 한 번의 탭으로 남겨 둔다
   */
  lastMode: ProfileMode | null;
  /** 마지막 운전자 — "지난번처럼 · 아빠 · 업무 이동". 자동 적용은 하지 않는다(공식 운전자 인식 전) */
  lastDriver: DriverId | null;
  /** 운전자별 취향(운전석) — 탑승 조합과 따로 */
  drivers: Record<DriverId, Driver>;
  /** 학습 후보(관찰 기록 · 거절) */
  learning: LearningState;
  /** 혼자 탈 때의 공조(운전자별) — 키 `운전자|모드`. 혼자 조합에서 학습·승인한 공조는 여기로(프로필 targetC 는 운전자 공유라 섞인다 — 정합성 보정 2026-10-29) */
  soloCabin: Record<string, SoloCabin>;
};

const MODES: ProfileMode[] = ["SOLO", "FAMILY", "WORK", "PICKUP", "COMPANION", "GUEST"];
const each = <T,>(f: () => T) => Object.fromEntries(MODES.map((k) => [k, f()])) as Record<ProfileMode, T>;

export const emptyVault = (): ProfileVault => ({ activity: each(() => []), history: each(() => ({})), nextTripId: each(() => 1), lastMode: null, lastDriver: null, drivers: DEMO_DRIVERS, learning: EMPTY_LEARNING, soloCabin: {} });

/** 옛 저장소(COMPANION 칸 · lastMode 없음)를 지금 모양으로 — 기록·거절 학습을 버리지 않는다 */
export function migrateVault(raw: Partial<ProfileVault> | null | undefined): ProfileVault {
  const e = emptyVault();
  if (!raw) return e;
  return {
    activity: { ...e.activity, ...(raw.activity ?? {}) }, history: { ...e.history, ...(raw.history ?? {}) }, nextTripId: { ...e.nextTripId, ...(raw.nextTripId ?? {}) },
    lastMode: raw.lastMode ?? null, lastDriver: raw.lastDriver ?? null,
    drivers: { ...e.drivers, ...(raw.drivers ?? {}) }, learning: { seen: { ...(raw.learning?.seen ?? {}) }, declined: { ...(raw.learning?.declined ?? {}) } },
    soloCabin: { ...(raw.soloCabin ?? {}) },
  };
}

export const rememberMode = (v: ProfileVault, m: ProfileMode): ProfileVault => (m === "GUEST" ? v : { ...v, lastMode: m });
export const rememberDriver = (v: ProfileVault, d: DriverId | null): ProfileVault => ({ ...v, lastDriver: d });

export const ACTIVITY_LIMIT = 40;

export function recordActivity(v: ProfileVault, mode: ProfileMode, a: Activity): ProfileVault {
  return { ...v, activity: { ...v.activity, [mode]: [a, ...v.activity[mode]].slice(0, ACTIVITY_LIMIT) } };
}

/** 그 프로필의 기록만 — 다른 프로필의 것은 보이지 않는다 */
export const activityOf = (v: ProfileVault, mode: ProfileMode) => v.activity[mode];

export const setHistory = (v: ProfileVault, mode: ProfileMode, h: SuggestionHistory): ProfileVault => ({ ...v, history: { ...v.history, [mode]: h } });

/** 새 이동 — 이동 번호를 하나 올리고, 이번 이동 기억은 비운 것을 돌려준다 */
export function startTrip(v: ProfileVault, mode: ProfileMode): { vault: ProfileVault; memory: JourneyMemory } {
  const id = v.nextTripId[mode];
  return { vault: { ...v, nextTripId: { ...v.nextTripId, [mode]: id + 1 } }, memory: newMemory(id, mode) };
}

/** 그 프로필의 기록과 거절 학습만 지운다 — 다른 프로필은 그대로 */
export function wipeProfile(v: ProfileVault, mode: ProfileMode): ProfileVault {
  return { ...v, activity: { ...v.activity, [mode]: [] }, history: { ...v.history, [mode]: {} } };
}
