/**
 * 상황 = DRIVER × OCCUPANCY × JOURNEY — core/assistant/Situation.kt 의 거울 (오너 후속 지시 2026-10-28 1~3).
 *
 * 세 맥락은 **따로** 기억하고 한 화면에서 **합친다**(설정 화면 셋을 만들지 않는다):
 *  · DRIVER(운전자)   — 운전석 통풍·열선 · 핸들 열선 · (시트 위치·미러는 **차량 운전자 프로필 우선**, 앱은 메모만)
 *  · OCCUPANCY(탑승 조합) — 공조 온도·ON/OFF · 음악 · 실내 조명 · 동승자 휴식 조건(프로필의 passengers)
 *  · JOURNEY(이동 목적) — 안내 빈도 · 여정 기억 · 필요한 제안(프로필의 plan · guidance)
 * 아빠가 가족과 여행할 때와 엄마가 가족과 여행할 때는 운전석 취향이 다르고, 가족이 듣는 음악·휴식 취향은 같다.
 *
 * 운전자 인식: 공개 Pleos Vehicle SDK(v2.3.2, javap 2026-10-28)에 운전자 프로필·디지털 키·사용자 계정 API 가 **없다** → 자동 인식은 미지원.
 * 운전자는 사용자가 고른다. 고르지 않으면(미확인) 운전석 항목은 **유지**(이전 운전자의 시트 설정을 적용하지 않는다).
 * 성별·이름으로 좌석·온도를 추측하지 않는다 — 시연 운전자(아빠·엄마)의 값은 오너 예시의 시연 데이터일 뿐이다.
 */
import type { CabinKey, CabinPrefs } from "./cabin";
import { NO_CABIN_PREFS } from "./cabin";
import type { ProfileMode, UserProfile } from "./profile";

export type DriverId = string;
export type DriverPrefs = {
  seatVent: boolean | null;
  seatHeat: boolean | null;
  steeringHeat: boolean | null;
  /** 시트 위치·미러 — 차량 운전자 프로필(메모리 버튼)이 한다. 앱은 어느 메모리인지 **기억만**, 바꾸지 않는다(안전 검증 별도) */
  seatMemo: string | null;
};
export const NO_DRIVER_PREFS: DriverPrefs = { seatVent: null, seatHeat: null, steeringHeat: null, seatMemo: null };
export type Driver = { id: DriverId; name: string; prefs: DriverPrefs };

/**
 * 혼자 탈 때의 공조(운전자별) — 혼자는 공유 그룹이 아니라서, 혼자 조합에서 학습한 공조 취향은 운전자마다 따로 둔다(정합성 보정 2026-10-29).
 * 프리셋(프로필 targetC)은 그대로 기본값이고, 이 칸이 있으면 그 운전자의 혼자 이동에서만 덮는다. 키는 learnKey 와 같은 `운전자|모드`
 */
export type SoloCabin = { hvacTempC: number | null; hvacOn: boolean | null };
export const soloKey = (driver: DriverId, mode: ProfileMode) => `${driver}|${mode}`;

/** 시연 운전자 둘 — 시연 데이터. 값은 성별이 아니라 "저장된 취향"이 다르다는 것을 보여 주기 위한 예시 */
export const DEMO_DRIVERS: Record<DriverId, Driver> = {
  dad: { id: "dad", name: "아빠", prefs: { seatVent: true, seatHeat: null, steeringHeat: null, seatMemo: "운전석 메모리 1" } },
  mom: { id: "mom", name: "엄마", prefs: { seatVent: null, seatHeat: true, steeringHeat: true, seatMemo: "운전석 메모리 2" } },
};
export const DEMO_DRIVER_IDS: DriverId[] = ["dad", "mom"];

/** 운전자 인식 방식 — 공식 API 가 확인되기 전에는 늘 수동 */
export type DriverRecognition = "MANUAL" | "VEHICLE_PROFILE" | "DIGITAL_KEY";
export const DRIVER_RECOGNITION: DriverRecognition = "MANUAL";

/** 탑승 조합 · 이동 목적 — 프리셋(ProfileMode)에서 읽는다. 선택은 여전히 한 번(맥락 버튼) */
export type Occupancy = "SOLO" | "COUPLE" | "FAMILY" | "WORK_COMPANION";
export type JourneyKind = "COMMUTE" | "BUSINESS" | "TRIP" | "OUTING" | "PICKUP";
export const OCCUPANCY_LABEL: Record<Occupancy, string> = { SOLO: "혼자", COUPLE: "부부", FAMILY: "가족", WORK_COMPANION: "업무 동승" };
export const JOURNEY_LABEL: Record<JourneyKind, string> = { COMMUTE: "출퇴근", BUSINESS: "업무 방문", TRIP: "여행", OUTING: "외출", PICKUP: "픽업·마중" };
// 픽업은 가족 맥락이다 — 돌아오는 길에 아이가 탄다. 공조·음악 취향은 가족 조합의 것
export const OCCUPANCY_OF: Record<ProfileMode, Occupancy | null> = { SOLO: "SOLO", WORK: "SOLO", FAMILY: "FAMILY", PICKUP: "FAMILY", COMPANION: "COUPLE", GUEST: null };
export const JOURNEY_OF: Record<ProfileMode, JourneyKind | null> = { SOLO: "COMMUTE", WORK: "BUSINESS", FAMILY: "TRIP", PICKUP: "PICKUP", COMPANION: "OUTING", GUEST: null };

/** 항목이 어느 맥락의 것인가 — 학습 후보를 어디에 저장할지, 화면에 어느 쪽 취향인지 적을 때 */
export type PrefOwner = "DRIVER" | "OCCUPANCY" | "JOURNEY";
export const CABIN_OWNER: Record<CabinKey, PrefOwner> = {
  HVAC_TEMP: "OCCUPANCY", HVAC_POWER: "OCCUPANCY", SEAT_VENT: "DRIVER", SEAT_HEAT: "DRIVER", STEERING_HEAT: "DRIVER", LIGHTING: "OCCUPANCY", MUSIC: "OCCUPANCY",
};
export const OWNER_LABEL: Record<PrefOwner, string> = { DRIVER: "운전자", OCCUPANCY: "탑승 조합", JOURNEY: "이동 목적" };

/**
 * 세 맥락을 합쳐 비교 입력(CabinPrefs)을 만든다 — 공조·음악·조명은 탑승 조합, 운전석은 운전자, 안내 빈도는 이동 목적(프리셋).
 * 운전자 미확인이면 운전석 항목은 null(유지) — 이전 운전자의 설정을 쓰지 않는다.
 */
export function combinedPrefs(profile: UserProfile, driver: Driver | null, solo: SoloCabin | null = null): CabinPrefs {
  // 프로필 없이(GUEST) = 개인 선호 없음 — 운전자 취향도 쓰지 않는다(누구의 이동인지 기록하지 않는 상태)
  const d = driver && profile.mode !== "GUEST" ? driver.prefs : NO_DRIVER_PREFS;
  // 혼자 조합 + 운전자 확인 + 그 운전자의 혼자 공조가 있으면 프리셋을 덮는다 — 다른 운전자의 혼자 이동에는 닿지 않는다
  const so = driver && OCCUPANCY_OF[profile.mode] === "SOLO" ? solo : null;
  return { ...NO_CABIN_PREFS, hvacTempC: so?.hvacTempC ?? profile.targetC, hvacOn: so?.hvacOn ?? profile.cabin.hvacOn, lighting: profile.cabin.lighting, music: profile.cabin.music, guidance: profile.cabin.guidance,
    seatVent: d.seatVent, seatHeat: d.seatHeat, steeringHeat: d.steeringHeat };
}

/** "아빠 · 가족 · 여행" — 메인 화면 머리줄. 운전자 미확인이면 "운전자 미확인" */
export function situationLabel(profile: UserProfile, driver: Driver | null): string {
  const o = OCCUPANCY_OF[profile.mode], j = JOURNEY_OF[profile.mode];
  const parts = [driver ? driver.name : "운전자 미확인", o ? OCCUPANCY_LABEL[o] : "프로필 없이", j ? JOURNEY_LABEL[j] : null].filter(Boolean);
  return parts.join(" · ");
}

/** 운전석 메모 한 줄 — 차량 운전자 프로필을 우선한다는 것을 사람에게 */
export const seatMemoLine = (driver: Driver | null) =>
  driver === null ? "운전자 미확인 · 운전석 설정은 차량 프로필 그대로" : driver.prefs.seatMemo ? `${driver.name} · ${driver.prefs.seatMemo} (차량 운전자 프로필 · 앱은 바꾸지 않음)` : `${driver.name} · 운전석 위치 메모 없음`;
