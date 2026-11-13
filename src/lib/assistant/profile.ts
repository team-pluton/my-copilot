/**
 * 사용자 프로필 — MY CO-PILOT 개인화의 전부다. **사용자가 직접 고른다** (통합안 3.3).
 * 얼굴·음성·스마트폰으로 누가 탔는지 추정하지 않는다. 동승자도 수동 설정이다 (CLAUDE.md 정책 6).
 *
 * 동승자 조건은 쉼표 DRIVE 의 PassengerType·needsOf 를 그대로 쓴다 — 통합안의 PassengerPreference 를
 * 새로 두면 추천 엔진과 다른 말을 하게 된다. 최소 잔량은 TripPlan.minReservePct 와 같은 값이다.
 *
 * core/assistant/Profile.kt 의 거울 — Android 이식 때 옮겼다(2026-10-26). 시연 여정 프리셋도 같은 값이다.
 */
import { DEFAULT_PLAN, DEFAULT_VEHICLE } from "../core/mock";
import type { PassengerType, TripPlan, VehicleSnapshot } from "../core/model";
import type { WaitMode } from "./wait";
import { NO_CABIN_PREFS, type CabinPrefs } from "./cabin";

/**
 * GUEST = "프로필 없이 시작"(2차 P1-1). 첫 탑승에서 프로필·공조·동승자를 다 묻지 않고 에너지 판단 하나부터 보여 준다.
 * "혼자 이동"이라고 추정하지 않는다 — 개인 선호가 **없는** 상태다. 기록을 남기지 않는다(시뮬레이터·세션이 막는다).
 */
/** PICKUP = 픽업·마중 후 귀가(V5 Mission C, 2026-11-02) — 가족 맥락의 둘째 조합. 중간 목적지(픽업 장소)는 여정의 끝이 아니다 */
export type ProfileMode = "SOLO" | "FAMILY" | "WORK" | "PICKUP" | "COMPANION" | "GUEST";

/** 고를 수 있는 프로필 — GUEST 는 고르는 프로필이 아니라 "고르지 않음"이다 */
export const PROFILE_MODES: ProfileMode[] = ["SOLO", "WORK", "FAMILY", "PICKUP", "COMPANION"];

/**
 * 탑승 조합 — 첫 화면의 선택 셋(오너 지시 2026-10-28 "One Choice"): **혼자 · 가족 · 동승자**. 세 개의 설정 페이지가 아니라 세 개의 생활 맥락이다.
 * 맥락 안에 자주 쓰는 조합(프로필)을 둔다 — 혼자: 평소 · 업무일, 동승자: 아내와 둘이(시연 프리셋). 처음은 간단히, 반복은 더 편하게.
 * 동승자는 자동 감지하지 않는다 — 사용자가 고른 것만 쓴다(정책 6).
 */
export type Context = "SOLO" | "FAMILY" | "COMPANION";
export const CONTEXTS: Context[] = ["SOLO", "FAMILY", "COMPANION"];
export const CONTEXT_LABEL: Record<Context, string> = { SOLO: "혼자", FAMILY: "가족", COMPANION: "동승자" };
export const CONTEXT_OF: Record<ProfileMode, Context | null> = { SOLO: "SOLO", WORK: "SOLO", FAMILY: "FAMILY", PICKUP: "FAMILY", COMPANION: "COMPANION", GUEST: null };
/** 맥락의 첫 프로필이 기본값 — 맥락 버튼 하나로 바로 간다. 둘째부터는 작은 칩 */
export const CONTEXT_MODES: Record<Context, ProfileMode[]> = { SOLO: ["SOLO", "WORK"], FAMILY: ["FAMILY", "PICKUP"], COMPANION: ["COMPANION"] };

export type UserProfile = {
  mode: ProfileMode;
  name: string;
  /** 저장한 공조 온도(°C). null = 맞추지 않는다 */
  targetC: number | null;
  /** "먼저 제안" — 끄면 제안은 추천함에만 쌓인다 */
  proactive: boolean;
  voice: boolean;
  passengers: PassengerType[];
  /** 출발 전에 챙길 것 */
  packing: string[];
  /** 내리기 전에 확인할 것 — 사용자가 고칠 수 있다 */
  finishChecklist: string[];
  /** 체크리스트를 전부 확인해야 완료할 수 있나 */
  requireAllChecked: boolean;
  minReservePct: number;
  /** 탑승 조합별 실내 취향(Personal Cabin Memory) — null 은 차량 현재 설정 유지. 공조 온도는 targetC (cabinPrefsOf 가 합친다) */
  cabin: CabinPrefs;
};

/** 비교에 쓰는 취향 묶음 — 공조 온도를 한 곳(targetC)에서 가져온다 */
export const cabinPrefsOf = (p: UserProfile): CabinPrefs => ({ ...p.cabin, hvacTempC: p.targetC });

/**
 * 저장돼 있던 프로필을 지금 모양으로 — 옛 저장소(cabin 없음 · COMPANION 없음)의 설정·기록을 버리지 않는다(오너 지시 2절).
 * 없는 칸은 프리셋으로 채우고, 실내 취향이 없으면 "유지"(null)로 둔다 — 임의 취향을 만들지 않는다.
 */
export function migrateProfile(raw: Partial<UserProfile> & { mode: ProfileMode }): UserProfile {
  const base = PROFILE_PRESETS[raw.mode] ?? PROFILE_PRESETS.GUEST;
  return { ...base, ...raw, cabin: { ...NO_CABIN_PREFS, ...(raw.cabin ?? {}) } };
}
export function migrateProfiles(raw: Partial<Record<ProfileMode, Partial<UserProfile> & { mode: ProfileMode }>> | null | undefined): Record<ProfileMode, UserProfile> {
  const out = { ...PROFILE_PRESETS };
  for (const m of Object.keys(PROFILE_PRESETS) as ProfileMode[]) if (raw?.[m]) out[m] = migrateProfile({ ...raw[m]!, mode: m });
  return out;
}

const COMMON_FINISH = ["휴대전화", "지갑·소지품", "차량 내 준비물", "다음 일정 확인"];

/** 동승자에서 하차 항목을 만든다 — 프로필 이름이 아니라 실제로 고른 동승자가 정한다 */
export function finishItemsFor(mode: ProfileMode, passengers: PassengerType[]): string[] {
  const items = [...COMMON_FINISH];
  if (passengers.includes("CHILD")) items.push("아이 준비물", "아이 가방", "유모차");
  if (passengers.includes("PET")) items.push("반려동물 이동 용품");
  if (mode === "WORK") items.splice(items.indexOf("다음 일정 확인"), 1, "노트북", "업무 자료", "방문 목적 확인", "다음 일정 메모");
  // 픽업·마중 — 픽업 장소에서는 보통 내리지 않는다(차 안 대기). 집에 도착해 내릴 때 아이 짐만 더 본다
  if (mode === "PICKUP") return [...COMMON_FINISH, "아이 가방"];
  return items;
}

/**
 * 시연 프리셋의 실내 취향 — 오너 시안(2026-10-28): 혼자 = 22°C · 통풍시트 · 나만의 플레이리스트 · 차분한 조명 · 최소 안내.
 * 전부 **시연 데이터**다. 실제 사용자는 비어 있는(유지) 상태에서 시작한다(migrateProfile). 음악은 기억만 — 자동 재생 연동은 미확인.
 */
export const PROFILE_PRESETS: Record<ProfileMode, UserProfile> = {
  SOLO: {
    // 혼자 출퇴근 — 준비물·하차 체크리스트는 기본으로 비워 둔다(필요하면 사용자가 추가). 묻지 않는 것이 기본이다
    mode: "SOLO", name: "혼자 이동", targetC: 22, proactive: true, voice: true, passengers: [],
    packing: [], finishChecklist: [], requireAllChecked: false, minReservePct: 15,
    // 운전석(통풍·열선)은 운전자 취향이다(situation.ts) — 탑승 조합 프리셋에는 두지 않는다
    cabin: { ...NO_CABIN_PREFS, lighting: "CALM", music: "나만의 드라이브 플레이리스트", guidance: "QUIET" },
  },
  FAMILY: {
    mode: "FAMILY", name: "가족 이동", targetC: 23, proactive: true, voice: true, passengers: ["CHILD", "PET"],
    packing: ["아이 간식·물", "기저귀 가방", "반려견 목줄·배변봉투"], finishChecklist: finishItemsFor("FAMILY", ["CHILD", "PET"]),
    requireAllChecked: true, minReservePct: 20,
    cabin: { ...NO_CABIN_PREFS, hvacOn: true, lighting: "BRIGHT", music: "아이들과 듣는 노래", guidance: "NORMAL" },
  },
  WORK: {
    mode: "WORK", name: "업무 이동", targetC: 21, proactive: true, voice: false, passengers: [],
    packing: ["노트북·충전기", "출입증", "발표 자료"], finishChecklist: finishItemsFor("WORK", []), requireAllChecked: false, minReservePct: 20,
    cabin: { ...NO_CABIN_PREFS, guidance: "QUIET" },
  },
  PICKUP: {
    // 픽업·마중 후 귀가(V5 Mission C) — 가는 길은 혼자, 돌아오는 길은 아이와. 동승자 조건(어린이)은 후보·하차 항목에 쓴다. 시연 데이터
    mode: "PICKUP", name: "아이 픽업 후 귀가", targetC: 23, proactive: true, voice: true, passengers: ["CHILD"],
    packing: [], finishChecklist: finishItemsFor("PICKUP", ["CHILD"]), requireAllChecked: false, minReservePct: 15,
    cabin: { ...NO_CABIN_PREFS, hvacOn: true, music: "아이들과 듣는 노래", guidance: "NORMAL" },
  },
  COMPANION: {
    // 동승자 맥락의 시연 조합 "아내와 둘이" — 아이·반려동물 없음 · 준비물 없음 · 둘이 듣는 음악
    mode: "COMPANION", name: "아내와 둘이", targetC: 23, proactive: true, voice: true, passengers: [],
    packing: [], finishChecklist: [...COMMON_FINISH], requireAllChecked: false, minReservePct: 15,
    cabin: { ...NO_CABIN_PREFS, lighting: "CALM", music: "둘이 듣는 플레이리스트", guidance: "NORMAL" },
  },
  GUEST: {
    mode: "GUEST", name: "기본 (프로필 없음)", targetC: null, proactive: true, voice: true, passengers: [],
    packing: [], finishChecklist: [], requireAllChecked: false, minReservePct: 20, cabin: NO_CABIN_PREFS,
  },
};

/**
 * 시연 여정 — 프로필마다 하나. 가족은 쉼표 DRIVE 기본 시나리오(서울→부산) 그대로라 에너지 판단이 같은 수를 낸다.
 * 업무는 고객사 왕복 + 90분 대기(WAIT 모드). 수치는 가상이다.
 */
export const TRIP_PRESETS: Record<ProfileMode, { plan: TripPlan; vehicle: VehicleSnapshot }> = {
  SOLO: { plan: { ...DEFAULT_PLAN, destinationName: "회사 (출근)", routeKm: 24, waitMinutesAfterArrival: 0, passengers: [], minReservePct: 15 }, vehicle: DEFAULT_VEHICLE },
  FAMILY: { plan: DEFAULT_PLAN, vehicle: DEFAULT_VEHICLE },
  WORK: {
    plan: { destinationName: "판교 고객사 (왕복)", routeKm: 38, returnKm: 38, mode: "WAIT", waitMinutesAfterArrival: 90, minReservePct: 20, passengers: [], breakIntervalMinutes: 120 },
    vehicle: DEFAULT_VEHICLE,
  },
  // 픽업·마중 — 학원 왕복 + 차 안에서 20분 대기(WAIT). 픽업 장소는 중간 목적지, 집이 끝이다. 수치는 가상
  PICKUP: {
    plan: { destinationName: "학원 (픽업 · 왕복)", routeKm: 12, returnKm: 12, mode: "WAIT", waitMinutesAfterArrival: 20, minReservePct: 15, passengers: ["CHILD"], breakIntervalMinutes: 90 },
    vehicle: DEFAULT_VEHICLE,
  },
  COMPANION: { plan: { ...DEFAULT_PLAN, destinationName: "저녁 외식 (강남)", routeKm: 18, waitMinutesAfterArrival: 0, passengers: [], minReservePct: 15 }, vehicle: DEFAULT_VEHICLE },
  // 프로필이 없어도 내비 경로는 있다 — 대기·동승자 없이 쉼표 DRIVE 기본 경로로 에너지 판단만
  GUEST: { plan: { ...DEFAULT_PLAN, waitMinutesAfterArrival: 0, passengers: [] }, vehicle: DEFAULT_VEHICLE },
};

/**
 * 대기 유형 기본값 — 업무(미팅)는 차를 두고 다녀오고, 그 밖(마중·아이 재우기)은 차 안에서 기다린다고 본다.
 * 기본값일 뿐이다. 사용자가 대기 카드에서 바꾼다.
 */
export const defaultWaitModeOf = (mode: ProfileMode): WaitMode => (mode === "WORK" ? "AWAY" : "IN_CAR");

/** 프로필과 여정을 합친다 — 동승자·최소 잔량은 프로필이 정한다 */
export function planFor(p: UserProfile): TripPlan {
  return { ...TRIP_PRESETS[p.mode].plan, passengers: p.passengers, minReservePct: p.minReservePct };
}

/** 공조 비교 — 차가 지금 온도를 못 알려 주거나 저장값이 없으면 비교하지 않는다 */
export function climateGapOf(p: UserProfile, currentC: number | null): { currentC: number; targetC: number } | null {
  return climateGapOfTarget(p.targetC, currentC);
}
/** 목표는 합친 취향(combinedPrefs)의 공조 온도 — 프로필 targetC 만 보면 운전자별 혼자 공조(soloCabin)를 놓친다(에뮬레이터 E20, 2026-10-29) */
export function climateGapOfTarget(targetC: number | null, currentC: number | null): { currentC: number; targetC: number } | null {
  return targetC === null || currentC === null ? null : { currentC, targetC };
}

/** 하차 완료 가능 여부 — 전부 확인이 필요한 프로필이면 남은 항목이 없어야 한다 */
export function canFinish(p: UserProfile, checked: string[]): boolean {
  return !p.requireAllChecked || p.finishChecklist.every((i) => checked.includes(i));
}
