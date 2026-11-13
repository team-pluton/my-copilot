/**
 * 데이터 신선도 · 출처 — core/assistant/Freshness.kt 의 거울.
 *
 * 1차는 "연결 끊김" 하나로 모든 값을 모름으로 돌렸다. 값마다 믿을 수 있는 시간이 다르다(검토 J):
 *  · 기어·주행 제한·속도 — 안전에 바로 쓰인다. 끊기는 순간 모름(유효 기간 0)
 *  · 배터리 — 천천히 변하지만 판단의 근거라, 끊긴 뒤 10분까지는 "끊기기 전 값"으로 **보여 주되 판단에는 쓰지 않는다**
 *  · 공조·도어 — 사람이 바꿀 수 있다. 10분까지 보여 주기만
 *  · 프로필 선호 — 사용자가 정한 것이라 기한이 없다
 * FRESH 만 판단에 쓴다. STALE 은 "언제 값인지"와 함께 보여 준다. UNKNOWN 은 보여 주지 않는다.
 * 시간 단위는 시연 시계의 분이다(실제 앱은 콜백 시각).
 */
export type SignalKind = "GEAR" | "UX" | "SPEED" | "SOC" | "HVAC" | "DOOR" | "ROUTE" | "PROFILE";
export type Freshness = "FRESH" | "STALE" | "UNKNOWN";

/** 끊긴 뒤 보여 줄 수 있는 시간(분). null = 기한 없음 */
export const MAX_AGE_MIN: Record<SignalKind, number | null> = { GEAR: 0, UX: 0, SPEED: 0, SOC: 10, HVAC: 10, DOOR: 10, ROUTE: 0, PROFILE: null };

export const SIGNAL_LABEL: Record<SignalKind, string> = {
  GEAR: "기어", UX: "주행 제한", SPEED: "속도", SOC: "배터리", HVAC: "공조 온도", DOOR: "도어", ROUTE: "내비 경로", PROFILE: "내 설정",
};

/**
 * 신호 자체의 상태 — **연결과 별개**(외부 평가 8 ①): 연결이 살아 있어도 그 값만 못 받았거나(NONE) 조회가 실패했을(ERROR, `VehicleListener.onFailed`) 수 있다.
 * 세 가지를 따로 본다 — 연결(LinkKind.live) · 신호 유효성(SignalStatus + 수신 시각) · 판단 가능성(readiness).
 * "연결은 살아 있는데 값이 오래됐다"는 시각으로 재지 않는다: AAOS·Pleos 콜백은 **값이 바뀔 때만** 오므로 주차 중 10분 전 기어 값은 여전히 맞다.
 * 오래됨은 어댑터가 ERROR/NONE 으로 말하거나 연결이 끊긴 뒤의 경과 시간(MAX_AGE_MIN)으로만 판단한다.
 */
export type SignalStatus = "OK" | "NONE" | "ERROR";
export const STATUS_LABEL: Record<SignalStatus, string> = { OK: "정상", NONE: "받은 적 없음", ERROR: "조회 실패" };

/**
 * @param readAtMin 마지막으로 값을 받은 시각(분). 받은 적 없으면 null
 * @param live 지금 값이 들어오고 있나(연결·조회 가능)
 * @param status 어댑터가 말하는 신호 상태 — OK 가 아니면 연결과 무관하게 모름
 */
export function freshnessOf(kind: SignalKind, readAtMin: number | null, nowMin: number, live: boolean, status: SignalStatus = "OK"): Freshness {
  if (kind === "PROFILE") return "FRESH";
  if (status !== "OK") return "UNKNOWN";
  if (readAtMin === null) return "UNKNOWN";
  if (live) return "FRESH";
  const max = MAX_AGE_MIN[kind] ?? 0;
  return max > 0 && nowMin - readAtMin <= max ? "STALE" : "UNKNOWN";
}

/** 판단에 쓸 수 있나 — 신선한 값만 */
export const usable = (f: Freshness) => f === "FRESH";

/**
 * 연결은 하나가 아니다(외부 평가 5·7, 2026-10-27). 실제 앱에서 주행 신호는 AAOS Car API, 배터리는 Pleos Vehicle SDK(EvBattery),
 * 공조·도어는 Pleos Vehicle SDK(HVAC·Door)로 **따로** 온다 — 하나가 돌아왔다고 나머지가 유효한 것이 아니다.
 * 시연의 "차량 데이터 연결" 스위치는 셋을 한꺼번에 끊고 잇는다(시나리오 J). 부분 복구는 개발자 조작판에서.
 */
export type LinkKind = "DRIVE" | "ENERGY" | "CABIN";
export const LINK_KINDS: LinkKind[] = ["DRIVE", "ENERGY", "CABIN"];
export const LINK_LABEL: Record<LinkKind, string> = { DRIVE: "주행 신호(기어·속도·주행 제한)", ENERGY: "배터리", CABIN: "공조·도어" };
/** 신호가 어느 연결로 오나 — 내 설정은 연결이 아니다 */
/** 내비 경로(ROUTE)는 NaviHelper 가 주는 값이라 차량 연결 셋과 다른 길로 온다 — 시연에는 없어 상태가 NONE 이다 */
export const SIGNAL_LINK: Record<SignalKind, LinkKind | null> = { GEAR: "DRIVE", UX: "DRIVE", SPEED: "DRIVE", SOC: "ENERGY", HVAC: "CABIN", DOOR: "CABIN", ROUTE: null, PROFILE: null };

/**
 * 기능별 **필수 입력** — 이것만 검사한다. 모든 기능에 모든 신호가 필요한 건 아니다(평가 7 A):
 *  · 에너지 판단: 배터리 잔량. 공조 ON/OFF·외기온은 가정값으로도 계산된다(참고 입력 — 없으면 가정이라고 적는다)
 *  · 출발 준비 공조 비교: 공조 설정 온도
 *  · 주행 제한: 기어 · 주행 제한 플래그(속도는 보조)
 *  · 하차 확인: 없음 — 도어는 조회 가능한 값만 보여 주고 사람이 직접 확인한다
 * 내비 경로(ROUTE)는 에너지의 필수 입력이 아니라 **근거의 등급**을 가른다(energyBasisOf): 내비 경로 기반 · 입력 계획 기반 · 경로 없음.
 */
export type Feature = "ENERGY" | "CLIMATE_PREPARE" | "DRIVE_RESTRICTION" | "FINISH";
export const REQUIRED_SIGNALS: Record<Feature, SignalKind[]> = { ENERGY: ["SOC"], CLIMATE_PREPARE: ["HVAC"], DRIVE_RESTRICTION: ["GEAR", "UX"], FINISH: [] };
export type Readiness = { ok: boolean; missing: SignalKind[] };

/** 필수 입력이 전부 신선한가. 아니면 판단을 **보류**하고 부족한 신호를 돌려준다 — 하나라도 STALE/UNKNOWN 이면 재판단하지 않는다 */
export function readiness(feature: Feature, fresh: Partial<Record<SignalKind, Freshness>>): Readiness {
  const missing = REQUIRED_SIGNALS[feature].filter((k) => !usable(fresh[k] ?? "UNKNOWN"));
  return { ok: missing.length === 0, missing };
}
export const missingLine = (r: Readiness) => (r.ok ? null : `부족한 정보: ${r.missing.map((k) => SIGNAL_LABEL[k]).join(" · ")}`);

/**
 * 에너지 추정의 **근거 등급**(외부 평가 8 ②) — 입력 계획 기반과 실제 내비 경로 기반을 같은 정확도처럼 보이지 않게 한다.
 *  NAVI_ROUTE 배터리·내비 경로 모두 유효 → 현재 경로 기반 · USER_PLAN 배터리 유효 + 사용자가 입력한 계획 → 입력 계획 기반 ·
 *  NO_ROUTE 배터리는 유효하지만 경로가 없음 → 목적지·경로 정보 필요 · NO_BATTERY 배터리 값이 오래됐거나 없음 → 판단 보류
 */
export type EnergyBasis = "NAVI_ROUTE" | "USER_PLAN" | "NO_ROUTE" | "NO_BATTERY";
export const ENERGY_BASIS_LABEL: Record<EnergyBasis, string> = {
  NAVI_ROUTE: "내비 경로 기반 추정", USER_PLAN: "입력 계획 기반 추정 · 내비 경로 아님", NO_ROUTE: "목적지·경로 정보 필요", NO_BATTERY: "판단 보류 · 배터리 값 없음",
};
export function energyBasisOf(fresh: Partial<Record<SignalKind, Freshness>>, hasUserRoute: boolean): EnergyBasis {
  if (!readiness("ENERGY", fresh).ok) return "NO_BATTERY";
  if (usable(fresh.ROUTE ?? "UNKNOWN")) return "NAVI_ROUTE";
  return hasUserRoute ? "USER_PLAN" : "NO_ROUTE";
}

/**
 * 동력원 — MY CO-PILOT 은 **전체 차량 대상**이다(오너 결정 2026-10-28). 출발 준비·주행 제한·하차·여정 기억·제안 하나는 동력원과 무관한 공통 기능이고,
 * 에너지 판단만 동력원별로 갈린다. 지금 엔진(src/lib/core/energy)은 EV 배터리만 센다 — 바꾸거나 지우지 않는다.
 * 내연기관·하이브리드의 연료 계산은 **만들지 않고 "지원 안 함 · 확인 전"으로 안내**한다 — SDK 에 `Fuel.getFuelPercent`(CAR_ENERGY)는 있지만(javap 2026-10-28, research 11절)
 * 실차·에뮬레이터에서 값이 오는지 미검증이고 연료 소비 모델이 없다. CarInfo 에 동력원 필드가 없어 판별은 capability 로 해야 할 것 — 그것도 미검증. PHEV 는 배터리가 있어도 연료 구간을 세지 못해 EV 엔진을 그대로 쓰면 틀린다 → EV 엔진을 쓰지 않는다.
 * 동력원(Powertrain) · SDK capability(VehicleCapability.supported/granted) · 기능 가용성(Availability)은 **다른 개념**이다(외부 검토 2026-10-28 ④):
 * EvBattery 가 지원된다는 것만으로 EV 라 판정하지 않는다(PHEV 도 배터리 정보를 준다). 판별 어댑터가 생기기 전까지 추론 코드는 두지 않고, 시연은 EV 를 입력값으로 준다.
 * 동력원이 UNKNOWN 이어도 공통 기능은 제공한다 — availability 가 ENERGY 만 막는다(테스트 "동력원별 가용성").
 */
export type Powertrain = "EV" | "PHEV" | "HEV" | "ICE" | "UNKNOWN";
export const POWERTRAINS: Powertrain[] = ["EV", "PHEV", "HEV", "ICE", "UNKNOWN"];
export const POWERTRAIN_LABEL: Record<Powertrain, string> = { EV: "전기차", PHEV: "플러그인 하이브리드", HEV: "하이브리드", ICE: "내연기관", UNKNOWN: "차량 유형 확인 전" };
/** 에너지 판단을 할 수 있는 동력원 — 엔진이 그 동력원을 셀 수 있을 때만 넣는다 */
export const ENERGY_POWERTRAINS: Powertrain[] = ["EV"];
export const FEATURE_LABEL: Record<Feature, string> = { ENERGY: "에너지 판단", CLIMATE_PREPARE: "출발 준비 공조", DRIVE_RESTRICTION: "주행 제한", FINISH: "하차 확인" };

/**
 * 기능 가용성 — 차량이 지원하지 않거나 권한이 없으면 **그 기능만 끄고 이유를 적는다**. 공통 기능은 계속 쓴다(오너 결정 5).
 * 이유의 순서: 동력원(기능 자체가 이 차량에 없음) → 차량 지원(checkXXXCapabilities) → 권한. 입력 부족(readiness)은 가용한 기능 안에서의 보류라 여기 없다.
 * 출발 준비 공조의 지원·권한은 gate.ts(ACTION_POLICY)가 이미 본다 — 시연은 여기에 동력원만 넣는다.
 */
export type UnavailableReason = "POWERTRAIN" | "NOT_SUPPORTED" | "NO_PERMISSION";
export type VehicleCapability = { powertrain: Powertrain; supported?: Partial<Record<Feature, boolean>>; granted?: Partial<Record<Feature, boolean>> };
export type Availability = { ok: true; reason: null; line: null } | { ok: false; reason: UnavailableReason; line: string };
const AVAILABLE: Availability = { ok: true, reason: null, line: null };
export function availability(feature: Feature, cap: VehicleCapability): Availability {
  if (feature === "ENERGY" && !ENERGY_POWERTRAINS.includes(cap.powertrain)) {
    const line = cap.powertrain === "UNKNOWN" ? "에너지 판단 보류 · 차량 유형 확인 전" : `${POWERTRAIN_LABEL[cap.powertrain]} 연료 계산은 아직 지원하지 않음 · 공식 SDK 데이터 확인 전`;
    return { ok: false, reason: "POWERTRAIN", line };
  }
  if (cap.supported?.[feature] === false) return { ok: false, reason: "NOT_SUPPORTED", line: `${FEATURE_LABEL[feature]} · 이 차량이 지원하지 않는 기능` };
  if (cap.granted?.[feature] === false) return { ok: false, reason: "NO_PERMISSION", line: `${FEATURE_LABEL[feature]} · 차량 데이터 권한 없음` };
  return AVAILABLE;
}

/**
 * 제품 화면의 출처는 넷뿐이다(3차 P1-2): 차량 정보 · 직접 설정 · 추정 · 시연 데이터.
 * SDK 이름 · 권한 · 지원 여부는 개발자 정보에만 둔다.
 */
export type SourceOrigin = "VEHICLE" | "USER" | "ESTIMATE" | "DEMO";
export const ORIGIN_LABEL: Record<SourceOrigin, string> = { VEHICLE: "차량 정보", USER: "직접 설정", ESTIMATE: "추정", DEMO: "시연 데이터" };

/** 출처 줄 — "차량 정보 · 11:08" / "끊기기 전 값 · 11:08 · 판단에 쓰지 않음" */
export function sourceLine(f: Freshness, clock: string | null, origin: SourceOrigin): string | null {
  if (f === "UNKNOWN" || clock === null) return null;
  return f === "FRESH" ? `${ORIGIN_LABEL[origin]} · ${clock}` : `끊기기 전 값 · ${clock} · 판단에 쓰지 않음`;
}
