/**
 * Personal Memory 학습 후보 — core/assistant/Learning.kt 의 거울 (오너 후속 지시 2026-10-28 4 · 정확성 보정 2026-10-29).
 *
 * "저장된 선호를 불러오는 앱"에서 "입력 없이 기억이 쌓이는 앱"으로. 규칙:
 *  1. **실제로 관찰 가능한 차량 상태 변화**만 후보로 기록한다 — 출처가 VEHICLE(실차 콜백) 또는 MOCK(시연 조작판·모의 차량). 받은 적 없음(NONE)·앱이 스스로 바꾼 것(APP)은 기록하지 않는다
 *  2. 운전자 미확인(driver null)이면 기록하지 않는다 — 누구의 이동인지 선언되지 않은 상태
 *  3. 일회성 변경은 영구 취향이 되지 않는다 — 같은 주인 아래에서 **다른 이동 LEARN_MIN_TRIPS 번** 같은 값이 반복될 때만 후보
 *  4. 후보가 되면 **한 번** 묻는다(저장 / 이번엔 아니요). 거절한 (항목, 값)은 다시 묻지 않는다. 다른 값이 반복되면 새 후보가 될 수 있다
 *  5. 저장하면 그 항목의 주인(운전자 / 탑승 조합)에게 들어간다 — CABIN_OWNER
 *
 * 정확성 보정(오너 검토 2026-10-29):
 *  6. **변경 주체는 SDK 가 알려 주지 않는다.** 상태 변경 콜백은 "값이 바뀌었다"일 뿐 운전자가 바꿨다는 증거가 아니다(조수석이 공조를 돌릴 수 있다).
 *     그래서 운전석 항목(주인 DRIVER)은 **혼자 탈 때만** 기록한다 — 사용자가 "혼자"라고 선언했을 때 운전자가 바꿨다고 **추정**한다(확정 아님, 저장은 사용자 확인 뒤).
 *     가족·부부 탑승 중의 시트 변경은 운전자 취향으로 **자동 귀속하지 않는다**(기록하지 않음).
 *     공조·전원(주인 OCCUPANCY)은 누가 돌렸든 "그 탑승 조합에서 쓰인 값"이므로 조합 아래에 기록하고, 저장은 여전히 사용자 확인 뒤.
 *  7. **귀속 키가 주인마다 다르다** — 운전자 항목은 운전자별(조합 무관: 아빠의 통풍시트는 어느 조합에서도 아빠 것) ·
 *     가족·부부 조합 항목은 조합별(운전자 무관: 아빠가 운전하든 엄마가 운전하든 가족 공조는 가족 것) ·
 *     혼자 조합 항목은 운전자 × 혼자(혼자는 공유 그룹이 아니다) — 저장도 같은 키로 vault.soloCabin(운전자별)에 한다. 프로필 targetC 에 쓰면 다른 운전자의 혼자 이동에 섞인다(정합성 보정 2026-10-29)
 *  8. **모의는 실차 증거가 아니다.** 관찰마다 증거 등급(evidence)을 남긴다 — VEHICLE 과 MOCK 은 섞이지 않는다(MOCK 은 VEHICLE 기록을 덮지 못하고, VEHICLE 이 오면 MOCK 기록은 버린다).
 *     MOCK 후보는 문장 앞에 "시연 데이터 · "를 달고, realEvidence() 집계에서 빠진다.
 *  9. 계절·외기온 등 **조건별 취향은 학습하지 않는다** — 3번 반복한 값은 "그 조합의 최근 값"일 뿐 모든 날씨·상황의 취향이 아니다. 문장도 그렇게만 말한다("…였어요").
 */
import { CABIN_LABEL, HVAC_TOLERANCE_C, LIGHTING_LABEL, type CabinKey, type CabinPrefs, type Lighting } from "./cabin";
import type { ProfileMode } from "./profile";
import type { UserProfile } from "./profile";
import { CABIN_OWNER, OCCUPANCY_OF, type Driver, type DriverId, type PrefOwner, type SoloCabin } from "./situation";

/** 관찰 출처 — VEHICLE 실차 콜백 · MOCK 시연 조작판/모의 차량(차량용 앱의 개발 패널·웹 시뮬레이터) · APP 앱이 보낸 set 의 결과 · NONE 받은 적 없음 */
export type ObservationSource = "VEHICLE" | "MOCK" | "APP" | "NONE";
/** 증거 등급 — 기록으로 남는 출처 둘. 실환경 학습 증거는 VEHICLE 만 */
export type Evidence = "VEHICLE" | "MOCK";
export type LearnValue = number | boolean | Lighting;
export type LearnCtx = { driver: DriverId | null; mode: ProfileMode };
export type Seen = { value: LearnValue; trips: number[]; evidence: Evidence };
export type LearningState = {
  /** 귀속 키(learnKey) → 항목 → 마지막으로 본 값 · 그 값을 본 이동 번호들 · 증거 등급 */
  seen: Record<string, Partial<Record<CabinKey, Seen>>>;
  /** 귀속 키 → 항목 → 거절한 값들 */
  declined: Record<string, Partial<Record<CabinKey, LearnValue[]>>>;
};
export const EMPTY_LEARNING: LearningState = { seen: {}, declined: {} };
export const LEARN_MIN_TRIPS = 3;
/** 학습 대상 — 차에서 돌릴 수 있고 앱이 읽을 수 있는 것. 음악·조명은 관찰 경로가 미확인이라 뺀다 */
export const LEARNABLE: CabinKey[] = ["HVAC_TEMP", "HVAC_POWER", "SEAT_VENT", "SEAT_HEAT", "STEERING_HEAT"];

/**
 * 변경 주체 — SDK 콜백에는 없다. 사용자가 "혼자"라고 선언한 이동에서는 운전자로 **추정**한다(DRIVER_ASSUMED) — 확정이 아니다(동승자 없이도 다른 사람이 바꿀 수 있다).
 * 그래서 후보 문장은 관찰한 값만 말하고, 영구 취향은 사용자가 "저장"을 눌러야 된다(오너 검토 2026-10-29 ②)
 */
export type ChangeSubject = "DRIVER_ASSUMED" | "UNKNOWN";
export const changeSubject = (c: LearnCtx): ChangeSubject => (c.driver !== null && OCCUPANCY_OF[c.mode] === "SOLO" ? "DRIVER_ASSUMED" : "UNKNOWN");

/**
 * 귀속 키 — 항목의 주인에 따라 다르다(규칙 7).
 *  DRIVER 항목 → `D|<운전자>` · 가족/부부 조합 항목 → `O|<모드>` · 혼자 조합 항목 → `O|<모드>|<운전자>`
 */
export function learnKey(c: LearnCtx, key: CabinKey): string {
  if (CABIN_OWNER[key] === "DRIVER") return `D|${c.driver ?? "-"}`;
  return OCCUPANCY_OF[c.mode] === "SOLO" ? `O|${c.mode}|${c.driver ?? "-"}` : `O|${c.mode}`;
}
/** @deprecated 옛 키(운전자|모드) — 저장소에 남은 기록은 읽히지 않을 뿐 해롭지 않다 */
export const ctxKey = (c: LearnCtx) => `${c.driver ?? "-"}|${c.mode}`;

const same = (k: CabinKey, a: LearnValue, b: LearnValue) => (k === "HVAC_TEMP" ? Math.abs(Number(a) - Number(b)) <= HVAC_TOLERANCE_C : a === b);
/** 상태 서술 — "24°C였어요" · "켜져 있었어요". 누가 바꿨다고 말하지 않는다(규칙 6·9) */
const stateOf = (k: CabinKey, v: LearnValue) => (k === "HVAC_TEMP" ? `${Math.round(Number(v))}°C였어요` : k === "LIGHTING" ? `${LIGHTING_LABEL[v as Lighting]}이었어요` : v ? "켜져 있었어요" : "꺼져 있었어요");
const iGa = (w: string) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 !== 0 ? "이" : "가"; };
const evidenceOf = (s: Seen): Evidence => s.evidence ?? "MOCK"; // 옛 저장소(evidence 없음)는 전부 시뮬레이터가 만든 것

/**
 * 차량 상태가 바뀐 것을 본다. 같은 값이면 이동 번호만 더하고, 다른 값이면 처음부터 다시 센다(흔들리는 값은 후보가 안 된다).
 * 기록하지 않는 경우: 출처가 APP/NONE · 운전자 미확인 · 이동 번호 없음(0) · 학습 대상 아님 · 운전석 항목인데 변경 주체를 모름(혼자 아님) · MOCK 이 VEHICLE 기록을 덮으려 함
 */
export function observe(st: LearningState, ctx: LearnCtx, key: CabinKey, value: LearnValue, tripId: number, source: ObservationSource): LearningState {
  if ((source !== "VEHICLE" && source !== "MOCK") || ctx.driver === null || tripId <= 0 || !LEARNABLE.includes(key)) return st;
  if (CABIN_OWNER[key] === "DRIVER" && changeSubject(ctx) !== "DRIVER_ASSUMED") return st;
  const ck = learnKey(ctx, key);
  const cur = st.seen[ck]?.[key];
  if (cur && evidenceOf(cur) === "VEHICLE" && source === "MOCK") return st; // 모의가 실차 기록을 더럽히지 않는다
  const fresh = !cur || evidenceOf(cur) !== source || !same(key, cur.value, value); // 증거 등급이 바뀌거나 값이 다르면 처음부터
  const next: Seen = fresh ? { value, trips: [tripId], evidence: source } : { value: cur.value, trips: cur.trips.includes(tripId) ? cur.trips : [...cur.trips, tripId], evidence: source };
  return { ...st, seen: { ...st.seen, [ck]: { ...(st.seen[ck] ?? {}), [key]: next } } };
}

export type LearnCandidate = { key: CabinKey; value: LearnValue; trips: number; owner: PrefOwner; evidence: Evidence; line: string };

function prefOf(p: CabinPrefs, k: CabinKey): LearnValue | null {
  switch (k) {
    case "HVAC_TEMP": return p.hvacTempC; case "HVAC_POWER": return p.hvacOn; case "SEAT_VENT": return p.seatVent; case "SEAT_HEAT": return p.seatHeat;
    case "STEERING_HEAT": return p.steeringHeat; case "LIGHTING": return p.lighting; case "MUSIC": return null;
  }
}

/**
 * 묻기에 충분한 근거가 있는 후보 — 반복 횟수 ≥ LEARN_MIN_TRIPS · 지금 저장 취향과 다름 · 거절한 값이 아님.
 * 한 번에 하나만 묻는다(첫 번째) — "한 번만 확인". 문장은 관찰한 상태만 말한다 — 누가 바꿨다고도, 모든 상황의 취향이라고도 하지 않는다.
 */
export function candidates(st: LearningState, ctx: LearnCtx, current: CabinPrefs, situation: string): LearnCandidate[] {
  const out: LearnCandidate[] = [];
  for (const key of LEARNABLE) {
    const ck = learnKey(ctx, key);
    const s = st.seen[ck]?.[key];
    if (!s || s.trips.length < LEARN_MIN_TRIPS) continue;
    const pref = prefOf(current, key);
    if (pref !== null && same(key, pref, s.value)) continue;
    if ((st.declined[ck]?.[key] ?? []).some((v) => same(key, v, s.value))) continue;
    const owner = CABIN_OWNER[key], ev = evidenceOf(s), label = CABIN_LABEL[key];
    const line = `${ev === "MOCK" ? "시연 데이터 · " : ""}최근 ${s.trips.length}번 이동에서 ${situation}일 때 ${label}${iGa(label)} ${stateOf(key, s.value)} — ${OWNER_LABEL_SHORT[owner]} 취향으로 저장할까요?`;
    out.push({ key, value: s.value, trips: s.trips.length, owner, evidence: ev, line });
  }
  return out;
}
const OWNER_LABEL_SHORT: Record<PrefOwner, string> = { DRIVER: "운전자", OCCUPANCY: "탑승 조합", JOURNEY: "이동 목적" };

/** 실환경 학습 증거 집계 — VEHICLE 기록만 센다(보고용). 시연·모의 기록은 여기 들지 않는다 */
export function realEvidence(st: LearningState): { records: number; trips: number } {
  let records = 0, trips = 0;
  for (const byKey of Object.values(st.seen)) for (const s of Object.values(byKey)) if (s && evidenceOf(s) === "VEHICLE") { records += 1; trips += s.trips.length; }
  return { records, trips };
}

/** 저장 — 관찰 기록을 비운다(이제 취향이 됐다) */
export function accept(st: LearningState, ctx: LearnCtx, key: CabinKey): LearningState {
  const ck = learnKey(ctx, key);
  const { [key]: _drop, ...rest } = st.seen[ck] ?? {};
  void _drop;
  return { ...st, seen: { ...st.seen, [ck]: rest } };
}
/** 이번엔 아니요 — 그 값은 다시 묻지 않는다. 관찰 기록도 비운다 */
export function decline(st: LearningState, ctx: LearnCtx, key: CabinKey, value: LearnValue): LearningState {
  const ck = learnKey(ctx, key);
  const { [key]: _drop, ...rest } = st.seen[ck] ?? {};
  void _drop;
  return { seen: { ...st.seen, [ck]: rest }, declined: { ...st.declined, [ck]: { ...(st.declined[ck] ?? {}), [key]: [...(st.declined[ck]?.[key] ?? []), value] } } };
}

/**
 * 후보를 저장할 자리 — 귀속 키(learnKey)와 **같은 곳**에 쓴다(저장·조회 정합성):
 *  · 운전자 항목 → 그 운전자의 prefs(조합 무관)
 *  · 혼자 조합의 공조 → vault.soloCabin[운전자|모드](운전자별) — 프로필 targetC 는 운전자 공유라 여기에 쓰면 섞인다
 *  · 가족·부부 조합의 공조·전원 → 그 프로필(조합 공유)
 * 반환은 바뀐 것만 채운다(바뀌지 않은 칸은 입력 그대로)
 */
export function storeCandidate(c: LearnCandidate, ctx: LearnCtx, profile: UserProfile, driver: Driver | null, solo: SoloCabin | null): { profile: UserProfile; driver: Driver | null; solo: SoloCabin | null } {
  if (c.owner === "DRIVER") return { profile, driver: driver ? { ...driver, prefs: withPref(driver.prefs, c.key, c.value) } : driver, solo };
  if (OCCUPANCY_OF[ctx.mode] === "SOLO" && ctx.driver !== null) {
    const base: SoloCabin = solo ?? { hvacTempC: null, hvacOn: null };
    return { profile, driver, solo: c.key === "HVAC_TEMP" ? { ...base, hvacTempC: Math.round(Number(c.value) * 2) / 2 } : c.key === "HVAC_POWER" ? { ...base, hvacOn: Boolean(c.value) } : base };
  }
  if (c.key === "HVAC_TEMP") return { profile: { ...profile, targetC: Math.round(Number(c.value) * 2) / 2 }, driver, solo };
  return { profile: { ...profile, cabin: withPref(profile.cabin, c.key, c.value) }, driver, solo };
}

/** 저장할 때 취향에 넣는 값 — 주인(운전자/탑승 조합)별로 호출자가 나눠 쓴다 */
export function withPref<T extends Record<string, unknown>>(prefs: T, key: CabinKey, value: LearnValue): T {
  const field: Record<CabinKey, string> = { HVAC_TEMP: "hvacTempC", HVAC_POWER: "hvacOn", SEAT_VENT: "seatVent", SEAT_HEAT: "seatHeat", STEERING_HEAT: "steeringHeat", LIGHTING: "lighting", MUSIC: "music" };
  return { ...prefs, [field[key]]: key === "HVAC_TEMP" ? Math.round(Number(value) * 2) / 2 : value };
}

/** 자동으로 기억할 수 있는 것과 없는 것 — 보고·화면용(오너 지시 9) */
export const MEMORY_SCOPE = {
  auto: ["공조 설정 온도 · 공조 ON/OFF(HVAC 조회가 되는 차)", "운전석 통풍·열선(Seat 조회가 되는 차 — 미검증 · 혼자 탈 때만 운전자에게)", "방문 중·귀가 등 여정 상태(Journey Memory)", "마지막 운전자 · 탑승 조합(사용자가 고른 것)"],
  manual: ["누가 운전하는가(공식 운전자 프로필·디지털 키 API 없음)", "누가 함께 탔는가(동승자 — 자동 감지 안 함)", "누가 설정을 바꿨는가(SDK 콜백에 주체 없음)", "음악 취향(미디어 앱 상태 접근 미확인)", "실내 조명(조회 경로 미확인)", "시트 위치·미러(차량 운전자 프로필이 한다)"],
};

/** 학습이 하지 않는 것 — 화면 한 줄·문서용. 현재 구현이 하는 것보다 많이 주장하지 않기 위해 코드에 둔다(오너 검토 2026-10-29) */
export const LEARNING_LIMITS: readonly string[] = [
  "계절·외기온 등 조건별 취향은 학습하지 않는다 — 3번 반복한 값은 그 조합의 최근 값일 뿐, 모든 날씨·상황의 취향이 아니다",
  "변경 주체는 SDK 가 알려 주지 않는다 — 운전석 항목은 혼자 탈 때만 운전자에게 귀속, 가족·부부 탑승 중의 시트 변경은 기록하지 않는다",
  "혼자 탈 때도 변경 주체는 추정이다(DRIVER_ASSUMED) — 후보는 관찰한 값만 말하고, 저장은 사용자 확인 뒤",
  "시연 조작판·모의 차량의 관찰(MOCK)은 실차 증거로 집계하지 않는다 — 차량 콜백(VEHICLE)만 세며, 에뮬레이터 콜백도 같은 길로 들어오므로 실차 증거라고 주장하지 않는다",
];
/** 후보 카드 밑에 적는 한 줄 */
export const LEARNING_CAVEAT = "최근 이동의 값만 봅니다 · 계절·외기온은 고려하지 않음 · 누가 바꿨는지는 SDK 가 알려 주지 않음";
