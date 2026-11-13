/**
 * Personal Cabin Memory · Smart Cabin Prepare — core/assistant/Cabin.kt 의 거울 (오너 지시 2026-10-28 "Simple & Proactive UX").
 *
 * 무엇이 다른가(오너 조사 2026-10-28): 운전자별 프로필 · 원격 공조 · 열선·통풍시트 기억은 **현대차가 이미 제공**한다(마이현대·블루링크·차량 프로필).
 * 그래서 "설정을 기억한다"는 가치가 아니다. 여기서 하는 것은 **탑승 조합**(혼자 · 가족 · 동승자)이라는 생활 맥락 하나로
 * 실내 환경 + 안내 방식 + 여정(출발 준비 → 방문 → 귀가 → 하차)을 **함께** 준비하는 것이다. 차량 프로필이 이미 맞춰 둔 설정은 "이미 맞음"으로 건드리지 않는다.
 *
 * 규칙(오너 지시 3절):
 *  1. 저장 취향이 없는 항목(null)은 차량 현재 설정을 **유지**한다 — 임의 취향을 만들어 적용하지 않는다
 *  2. 지원 여부(checkXXXCapabilities) · 제어 권한 · 데이터 신선도를 항목마다 따로 본다 — 지원되지 않는 항목 때문에 전체가 실패하지 않는다
 *  3. 이미 같은 설정은 건드리지 않는다
 *  4. 실제 제어가 허용된 항목만 적용 후보 → 하나의 승인으로 묶는다 · 주행 중이면 묶지 않는다(Safety Gate)
 *  5. 적용 뒤 차량 상태를 다시 조회해 항목마다 **독립적으로** 성공·거절·불일치·확인 못 함을 기록한다 — 확인 전에는 '적용 완료'라 하지 않는다
 *  6. 음악은 **취향만 기억**한다 — 다른 앱의 플레이리스트를 고르고 재생하는 연동은 미확인이라 만들지 않고, 듣던 음악을 끄지도 않는다
 * 자동 **판단**(비교)은 늘 하고, 자동 **제어**는 하지 않는다 — 제어는 권한 · 사용자 승인 · 운행 상태를 다 만족해야 한다.
 */
import type { JourneyMemory } from "./memory";

export type CabinKey = "HVAC_TEMP" | "HVAC_POWER" | "SEAT_VENT" | "SEAT_HEAT" | "STEERING_HEAT" | "LIGHTING" | "MUSIC";
export const CABIN_KEYS: CabinKey[] = ["HVAC_TEMP", "HVAC_POWER", "SEAT_VENT", "SEAT_HEAT", "STEERING_HEAT", "LIGHTING", "MUSIC"];
export const CABIN_LABEL: Record<CabinKey, string> = {
  HVAC_TEMP: "공조 온도", HVAC_POWER: "공조", SEAT_VENT: "통풍시트", SEAT_HEAT: "열선시트", STEERING_HEAT: "핸들 열선", LIGHTING: "실내 조명", MUSIC: "음악",
};

export type Lighting = "CALM" | "BRIGHT";
export const LIGHTING_LABEL: Record<Lighting, string> = { CALM: "차분한 조명", BRIGHT: "밝은 조명" };
export type Guidance = "QUIET" | "NORMAL";
export const GUIDANCE_LABEL: Record<Guidance, string> = { QUIET: "최소 안내", NORMAL: "일반 안내" };

/**
 * 탑승 조합별 저장 취향 — **null = 차량 현재 설정 유지**(기본값). 처음부터 다 채우라고 하지 않는다.
 * 공조 온도는 UserProfile.targetC 를 그대로 쓴다(엔진·테스트가 그 값을 본다 — 두 곳에 두지 않는다). cabinPrefsOf 가 합친다.
 */
export type CabinPrefs = {
  hvacTempC: number | null;
  hvacOn: boolean | null;
  seatVent: boolean | null;
  seatHeat: boolean | null;
  steeringHeat: boolean | null;
  lighting: Lighting | null;
  /** 음악 취향 — 플레이리스트 이름 같은 **기억**. 자동 재생은 연동 미확인 */
  music: string | null;
  guidance: Guidance;
};
export const NO_CABIN_PREFS: CabinPrefs = { hvacTempC: null, hvacOn: null, seatVent: null, seatHeat: null, steeringHeat: null, lighting: null, music: null, guidance: "NORMAL" };

/** 차량이 알려 준 지금 상태 — null = 읽지 못함(지원 안 함 · 연결 끊김 · 조회 실패) */
export type CabinNow = {
  hvacTempC: number | null;
  hvacOn: boolean | null;
  seatVent: boolean | null;
  seatHeat: boolean | null;
  steeringHeat: boolean | null;
  lighting: Lighting | null;
};
export const CABIN_NOW_UNKNOWN: CabinNow = { hvacTempC: null, hvacOn: null, seatVent: null, seatHeat: null, steeringHeat: null, lighting: null };

/** 항목별 차량 지원(checkXXXCapabilities) · 제어 권한(CONTROL_*). null = 모름 → 제어하지 않는다 */
export type CabinSupport = Partial<Record<CabinKey, { supported: boolean | null; controllable: boolean | null }>>;

/**
 * 항목 하나의 결정:
 *  NO_PREF 저장 취향 없음(유지) · SAME 이미 같음 · APPLY 적용 후보(승인 하나로 묶임) ·
 *  UNSUPPORTED 이 차량이 지원하지 않음 · NO_PERMISSION 제어 권한 없음·미확인 · UNKNOWN_STATE 지금 값을 읽지 못함 ·
 *  RESTRICTED 주행 중이라 지금은 안 함 · REMEMBER_ONLY 기억만(음악)
 */
export type CabinDecision = "NO_PREF" | "SAME" | "APPLY" | "UNSUPPORTED" | "NO_PERMISSION" | "UNKNOWN_STATE" | "RESTRICTED" | "REMEMBER_ONLY";
export type CabinItem = { key: CabinKey; decision: CabinDecision; target: string | null; current: string | null; line: string };
export type CabinPlan = {
  items: CabinItem[];
  /** 하나의 승인으로 적용할 항목 */
  toApply: CabinKey[];
  /** 사용자가 차량에서 직접 봐야 하는 항목(지원 안 함 · 권한 없음 · 값 모름) */
  manual: CabinKey[];
  /** 아무것도 할 게 없다 — 묻지 않는다 */
  nothingToDo: boolean;
  summary: string;
};

/**
 * 기능 상태 — 실제 SDK 지원 여부로 셋을 나눈다(오너 후속 지시 2026-10-28 5). 공식 지원·실동작 확인 = AVAILABLE · 문서만 확인 = NEEDS_VERIFICATION ·
 * 연동 미확인 = REMEMBER_ONLY(취향만 기억) 또는 UNSUPPORTED. 실물 jar javap(2026-10-28, research 11절) 기준 — AVAILABLE(실차 확인)은 아직 0건.
 * EMULATOR_VERIFIED 는 Pleos Connect Emulator 에서 조회·제어·재조회를 실제로 본 항목에만(2026-10-29, EMULATOR-RESULT §6) — 실차와 같다고 말하지 않는다.
 * 비공개 API(음악 앱 · 블루링크)는 우회하지 않는다.
 */
export type SdkStatus = "AVAILABLE" | "EMULATOR_VERIFIED" | "NEEDS_VERIFICATION" | "REMEMBER_ONLY" | "UNSUPPORTED";
export const SDK_STATUS_LABEL: Record<SdkStatus, string> = { AVAILABLE: "사용 가능", EMULATOR_VERIFIED: "에뮬레이터 확인", NEEDS_VERIFICATION: "개발 검증 필요", REMEMBER_ONLY: "선호 기억", UNSUPPORTED: "미지원" };
export const CABIN_SDK_STATUS: Record<CabinKey, { status: SdkStatus; basis: string }> = {
  HVAC_TEMP: { status: "EMULATOR_VERIFIED", basis: "HVAC get/set · CAR_CLIMATE / CONTROL_CAR_CLIMATE — 에뮬레이터에서 조회 콜백 · set 콜백(적용 값) · 재조회 · 셸 공조 바 변화 확인(2026-10-29) · 실차 미확인" },
  HVAC_POWER: { status: "NEEDS_VERIFICATION", basis: "HVAC power set 존재(javap) · 실동작 미확인" },
  SEAT_VENT: { status: "EMULATOR_VERIFIED", basis: "Seat getHvacSeatVentilationState / setHvacSeatVentilation · CAR_SEATS / CONTROL_CAR_SEATS(에뮬레이터에서 normal 등급) — set 콜백 1 · 재조회 1 확인(2026-10-29) · 실차 미확인" },
  SEAT_HEAT: { status: "EMULATOR_VERIFIED", basis: "Seat getHvacSeatTemperature / setHvacSeatTemperature · CAR_SEATS / CONTROL_CAR_SEATS — 조회·변경 콜백·set(1) → 콜백 → 재조회를 에뮬레이터에서 확인(2026-10-29 3차 · 음수 통풍·양수 열선) · 실차·App Market 미확인" },
  STEERING_HEAT: { status: "UNSUPPORTED", basis: "Vehicle SDK v2.3.2 에 핸들 열선 API 없음(javap) — 취향만 기억" },
  LIGHTING: { status: "NEEDS_VERIFICATION", basis: "Light cabinLightSwitch/State get·set · CAR_LIGHTS / CONTROL_CAR_LIGHTS (javap) · '차분한/밝은 조명' 같은 분위기 값은 없다(스위치 뿐) · 실동작 미확인" },
  MUSIC: { status: "REMEMBER_ONLY", basis: "Vehicle SDK 에 미디어 API 없음 · 미디어 앱 플레이리스트 선택·재생 공식 경로 미확인 — 플레이어 안 만듦 · 듣던 음악 안 끔" },
};

export const HVAC_TOLERANCE_C = 0.5;
/** 은/는 — 마지막 글자 받침으로 고른다(prepare.ts 와 같은 규칙) */
const eunNeun = (w: string) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 !== 0 ? "은" : "는"; };
const onOff = (b: boolean) => (b ? "켬" : "끔");
const fmt = (key: CabinKey, v: number | boolean | string | null): string | null =>
  v === null ? null : key === "HVAC_TEMP" ? `${Math.round(Number(v))}°C` : key === "LIGHTING" ? LIGHTING_LABEL[v as Lighting] : key === "MUSIC" ? String(v) : onOff(Boolean(v));

function prefOf(p: CabinPrefs, k: CabinKey): number | boolean | string | null {
  switch (k) {
    case "HVAC_TEMP": return p.hvacTempC; case "HVAC_POWER": return p.hvacOn; case "SEAT_VENT": return p.seatVent; case "SEAT_HEAT": return p.seatHeat;
    case "STEERING_HEAT": return p.steeringHeat; case "LIGHTING": return p.lighting; case "MUSIC": return p.music;
  }
}
function nowOf(n: CabinNow, k: CabinKey): number | boolean | string | null {
  switch (k) {
    case "HVAC_TEMP": return n.hvacTempC; case "HVAC_POWER": return n.hvacOn; case "SEAT_VENT": return n.seatVent; case "SEAT_HEAT": return n.seatHeat;
    case "STEERING_HEAT": return n.steeringHeat; case "LIGHTING": return n.lighting; case "MUSIC": return null;
  }
}
const same = (k: CabinKey, a: number | boolean | string, b: number | boolean | string) => (k === "HVAC_TEMP" ? Math.abs(Number(a) - Number(b)) <= HVAC_TOLERANCE_C : a === b);

function decide(k: CabinKey, prefs: CabinPrefs, now: CabinNow, support: CabinSupport, driving: boolean): CabinItem {
  const label = CABIN_LABEL[k];
  const pref = prefOf(prefs, k);
  const target = fmt(k, pref);
  if (pref === null) return { key: k, decision: "NO_PREF", target: null, current: fmt(k, nowOf(now, k)), line: `${label} · 저장한 취향 없음 · 지금 설정 유지` };
  if (k === "MUSIC") return { key: k, decision: "REMEMBER_ONLY", target, current: null, line: `${label} · ${target} 기억 · 자동 재생은 연동 확인 전 · 듣던 음악 그대로` };
  const sup = support[k] ?? { supported: null, controllable: null };
  if (sup.supported === false) return { key: k, decision: "UNSUPPORTED", target, current: null, line: `${label} · 이 차량은 지원하지 않음` };
  const cur = nowOf(now, k);
  const current = fmt(k, cur);
  if (cur === null) return { key: k, decision: "UNKNOWN_STATE", target, current: null, line: `${label} · 지금 값을 읽지 못함 · 차량에서 직접 확인` };
  if (same(k, pref, cur)) return { key: k, decision: "SAME", target, current, line: `${label} ${current} · 이미 맞음` };
  if (sup.supported !== true || sup.controllable !== true) {
    return { key: k, decision: "NO_PERMISSION", target, current, line: `${label} ${current} → ${target} · ${sup.supported !== true ? "지원 확인 전" : "제어 권한 없음"} · 차량에서 직접` };
  }
  if (driving) return { key: k, decision: "RESTRICTED", target, current, line: `${label} ${current} → ${target} · 정차하면 제안` };
  return { key: k, decision: "APPLY", target, current, line: `${label} ${current} → ${target}` };
}

/**
 * 모드 선택 뒤 코파일럿이 하는 비교 — 자동 판단. 적용(제어)은 승인 뒤 settle 로.
 * @param driving 주행 중(Safety Gate 가 공조·시트 변경을 막는 상태)
 */
export function planCabin(prefs: CabinPrefs, now: CabinNow, support: CabinSupport, driving: boolean, modeName: string): CabinPlan {
  const items = CABIN_KEYS.map((k) => decide(k, prefs, now, support, driving));
  const toApply = items.filter((x) => x.decision === "APPLY").map((x) => x.key);
  const manual = items.filter((x) => x.decision === "UNSUPPORTED" || x.decision === "NO_PERMISSION" || x.decision === "UNKNOWN_STATE").map((x) => x.key);
  const restricted = items.filter((x) => x.decision === "RESTRICTED").length;
  const withPref = items.filter((x) => x.decision !== "NO_PREF").length;
  const nothingToDo = toApply.length === 0 && manual.length === 0 && restricted === 0;
  const manualNames = manual.map((k) => CABIN_LABEL[k]).join("·");
  const tail = manual.length > 0 ? ` · ${manualNames}${eunNeun(manualNames)} 차량에서 직접` : "";
  const summary = withPref === 0
    ? `${modeName} 이동 · 저장한 취향이 없어 지금 설정 그대로 갑니다`
    : nothingToDo
      ? `${modeName} 이동 준비를 확인했어요 · 저장한 취향과 모두 맞습니다`
      : toApply.length > 0
        ? `저장된 취향과 비교해 변경할 설정이 ${toApply.length}개 있습니다${tail}`
        : restricted > 0
          ? `정차하면 ${restricted}개를 맞추자고 제안합니다${tail}`
          : `앱에서 바꿀 수 있는 설정은 없습니다${tail}`;
  return { items, toApply, manual, nothingToDo, summary };
}

// ── 일괄 적용의 결과 — 항목마다 독립 ─────────────────
export type CabinOutcome = { kind: "CALLBACK"; matched: boolean } | { kind: "ERROR"; reason: string } | { kind: "TIMEOUT" };
export type CabinResultStatus = "APPLIED" | "REJECTED" | "MISMATCH" | "UNVERIFIED";
export const CABIN_RESULT_LABEL: Record<CabinResultStatus, string> = { APPLIED: "적용 확인", REJECTED: "거절", MISMATCH: "값 불일치", UNVERIFIED: "확인 못 함" };
export type CabinResult = { key: CabinKey; status: CabinResultStatus; line: string };
export type CabinSettled = { results: CabinResult[]; applied: CabinKey[]; summary: string; allApplied: boolean };

/**
 * 콜백·재조회 결과로 항목마다 상태를 정한다. 결과가 없는 항목은 **확인 못 함**(적용 완료가 아니다).
 * 성공한 항목만 '적용 확인' — 일부가 실패해도 나머지는 그대로 반영한다.
 */
export function settleCabin(toApply: CabinKey[], outcomes: Partial<Record<CabinKey, CabinOutcome>>, source: "MOCK" | "VEHICLE"): CabinSettled {
  const results: CabinResult[] = toApply.map((k) => {
    const o = outcomes[k];
    const label = CABIN_LABEL[k];
    if (!o || o.kind === "TIMEOUT") return { key: k, status: "UNVERIFIED", line: `${label} · 응답 없음 · 값을 다시 읽기 전에는 다시 보내지 않음` };
    if (o.kind === "ERROR") return { key: k, status: "REJECTED", line: `${label} · 차량이 거절: ${o.reason}` };
    if (!o.matched) return { key: k, status: "MISMATCH", line: `${label} · 요청한 값과 차량 값이 다름` };
    return { key: k, status: "APPLIED", line: `${label} · ${source === "MOCK" ? "시연 값으로 적용" : "적용됨"}` };
  });
  const applied = results.filter((r) => r.status === "APPLIED").map((r) => r.key);
  const n = (s: CabinResultStatus) => results.filter((r) => r.status === s).length;
  const parts = [`${toApply.length}개 중 ${applied.length}개 적용${source === "MOCK" ? "(모의)" : ""}`];
  if (n("REJECTED") > 0) parts.push(`${n("REJECTED")}개 거절`);
  if (n("MISMATCH") > 0) parts.push(`${n("MISMATCH")}개 값 불일치`);
  if (n("UNVERIFIED") > 0) parts.push(`${n("UNVERIFIED")}개 확인 못 함`);
  return { results, applied, summary: parts.join(" · "), allApplied: applied.length === toApply.length };
}

/** 이번 이동에서 공조를 이미 결정(적용·유지)했으면 공조 항목은 다시 묻지 않는다 — Journey Memory 가 근거 */
export function withMemory(plan: CabinPlan, m: JourneyMemory): CabinPlan {
  if (!m.climate) return plan;
  const items = plan.items.map((x) => (x.key === "HVAC_TEMP" && x.decision === "APPLY"
    ? { ...x, decision: "SAME" as const, line: m.climate!.decision === "APPLIED" ? `공조 온도 ${Math.round(m.climate!.valueC)}°C · 이번 이동에서 맞춤` : `공조 온도 ${Math.round(m.climate!.valueC)}°C · 이번 이동에서는 그대로 두기로 함` }
    : x));
  const toApply = plan.toApply.filter((k) => k !== "HVAC_TEMP");
  return { ...plan, items, toApply, nothingToDo: toApply.length === 0 && plan.manual.length === 0 && items.every((x) => x.decision !== "RESTRICTED"),
    summary: toApply.length === plan.toApply.length ? plan.summary : toApply.length === 0 && plan.manual.length === 0 ? "저장한 취향과 모두 맞습니다" : `저장된 취향과 비교해 변경할 설정이 ${toApply.length}개 있습니다` };
}

/**
 * 스마트폰 사전 준비(원격시동 · 원격 공조)는 **공개 Pleos Connect SDK 에서 확인되지 않았다** — 마이현대·블루링크가 이미 제공하는 기능이기도 하다.
 * 구현하지 않고 경계만 둔다: 차 안의 앱은 이 인터페이스로 "원격 준비가 가능한가"를 묻고, 없으면 탑승 뒤 준비로 간다. 비공개 API 를 우회하지 않는다.
 */
export type RemotePrepareGateway = {
  /** 공식 경로가 확인되기 전에는 늘 NOT_AVAILABLE */
  availability(): "NOT_AVAILABLE" | "AVAILABLE";
};
export const NO_REMOTE_PREPARE: RemotePrepareGateway = { availability: () => "NOT_AVAILABLE" };
