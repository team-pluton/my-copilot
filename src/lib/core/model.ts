/**
 * 도메인 모델 v2 — core/ 의 Kotlin 과 **같은 모양**이어야 한다 (거울 규칙).
 *
 * v1 은 "휴식 장소"만 알았다. v2 는 **충전 정차 = 휴식**이라, 장소에 충전기 정보가
 * 붙고, "언제 서나"를 시간이 아니라 **에너지**가 먼저 정한다. 그래도 v1 의 엔진
 * (필수 시설 배제 → 점수 → 이유 설명)은 그대로 축 2 로 산다.
 */

export type GeoPoint = { lat: number; lon: number };

export type Amenity =
  | "RESTROOM"
  | "PARKING"
  | "RESTAURANT"
  | "CAFE"
  | "BABY_CARE"
  | "PET_AREA"
  | "EV_CHARGER";

export const AMENITY_LABEL: Record<Amenity, string> = {
  RESTROOM: "화장실",
  PARKING: "주차장",
  RESTAURANT: "음식점",
  CAFE: "카페",
  BABY_CARE: "유아 편의시설",
  PET_AREA: "반려동물 구역",
  EV_CHARGER: "전기차 충전",
};

export const ALL_AMENITIES = Object.keys(AMENITY_LABEL) as Amenity[];

/**
 * 동승자 — **수동 설정이다.** 자동 감지라고 표현하지 않는다 (CLAUDE.md 정책 6).
 *
 * 동승자마다 "꼭 있어야 하는 것"과 "있으면 좋은 것"을 나눈다. 꼭 있어야 하는 것은
 * 후보에서 **배제** 조건이고, 있으면 좋은 것은 점수와 **미충족 설명**에 쓴다.
 * 이 둘을 안 나누면 "반려견 산책 구역 없음"을 이유로 유일한 급속충전소가
 * 빠지는 식으로 추천이 비어 버린다.
 */
export type PassengerType = "CHILD" | "SENIOR" | "PET";

export const PASSENGER_LABEL: Record<PassengerType, { name: string; hint: string }> = {
  CHILD: { name: "어린이", hint: "화장실 필수 · 유아 편의시설 선호" },
  SENIOR: { name: "어르신", hint: "화장실 필수 · 음식점 선호" },
  PET: { name: "반려동물", hint: "산책 구역 선호" },
};

export const PASSENGER_NEEDS: Record<PassengerType, { required: Amenity[]; preferred: Amenity[] }> = {
  CHILD: { required: ["RESTROOM"], preferred: ["BABY_CARE", "RESTAURANT"] },
  SENIOR: { required: ["RESTROOM"], preferred: ["RESTAURANT", "CAFE"] },
  PET: { required: [], preferred: ["PET_AREA", "PARKING"] },
};

/** 동승자 묶음 → 필수(합집합)·선호(합집합, 필수 제외). 운전자 몫(화장실·주차)은 늘 깔린다 */
export function needsOf(passengers: PassengerType[]): { required: Amenity[]; preferred: Amenity[] } {
  const required = new Set<Amenity>(["RESTROOM", "PARKING"]);
  const preferred = new Set<Amenity>();
  for (const p of passengers) {
    PASSENGER_NEEDS[p].required.forEach((a) => required.add(a));
    PASSENGER_NEEDS[p].preferred.forEach((a) => preferred.add(a));
  }
  required.forEach((a) => preferred.delete(a));
  return { required: [...required], preferred: [...preferred] };
}

export type DataConfidence = "VERIFIED" | "UNKNOWN";

export type RestStop = {
  id: string;
  name: string;
  location: GeoPoint;
  /** 출발지로부터 경로상 거리(km). 에너지 계산과 "어디쯤에서 서나"에 쓴다 */
  routeKm: number;
  amenities: Amenity[];
  /** 경로 이탈 **거리**(km). 시간이 아니다 */
  detourKm: number | null;
  /** 재계산으로 실제 우회 **시간**을 얻었을 때만. null 이면 "추가 N분"을 적지 않는다 */
  detourMinutes: number | null;
  /** 충전기 최대 출력(kW). null = 충전 불가 */
  chargerKw: number | null;
  chargerStalls: number | null;
  confidence: DataConfidence;
  openingHours: string | null;
  dataSource: string;
};

/** 여정 — 사용자가 정차 중에 넣는 것 */
/**
 * 사용 목적 — 같은 에너지 엔진을 차량 이용의 여러 순간에 쓴다 (v3 방향, 2026-10-25).
 *  · JOURNEY 장거리 여행: 편도 + 도착 후 대기 → 충전·휴식 경유지
 *  · WAIT    픽업·마중: 가서 기다렸다 돌아오기(왕복) → 충전이 필요한가 · 공조 켜고 몇 분까지
 *  · STAY    캠핑·차박: 목적지 체류 + 귀가 잔량 → **설계 단계**(외부 전력은 사용자 입력·검증 데이터일 때만)
 */
export type TripMode = "JOURNEY" | "WAIT" | "STAY";

export type TripPlan = {
  destinationName: string;
  routeKm: number;
  /** 사용 목적. 없으면 JOURNEY */
  mode?: TripMode;
  /** 돌아오는 길(km). 0/없음 = 편도. 왕복이면 대기는 가는 길과 오는 길 사이에 있다 */
  returnKm?: number;
  /**
   * 내비가 예측한 목적지 도착 잔량(%) — NaviHelper RouteStateInfo.remainDestinationChargingInt (실물 SDK 에서 확인).
   * 있으면 가는 길 소비를 우리 모델 대신 이 값으로 잡고, 오는 길은 같은 비율로 보정한다. 없으면 우리 추정.
   */
  naviArrivalSocPct?: number;
  /** 도착 후 차 안에서 기다릴 시간(분) — 축 1 의 핵심 입력 */
  waitMinutesAfterArrival: number;
  /** 도착 시 남겨 둘 최소 잔량(%) */
  minReservePct: number;
  passengers: PassengerType[];
  /** 휴식 간격(분) — 충전이 필요 없어도 이 간격이면 쉬자고 권한다 */
  breakIntervalMinutes: number;
};

/**
 * 차량 스냅샷 — Vehicle SDK(EvBattery·HVAC·Odometer·DrivingMode) + AAOS(속도·외기온)에서
 * 읽어 올 값. 시연에서는 조작판이 넣는다.
 */
export type VehicleSnapshot = {
  batteryPct: number;
  batteryKwh: number;
  /** EvBattery 효율. 없으면 null → 차종 기본값 사용 */
  efficiencyKwhPer100km: number | null;
  hvacOn: boolean;
  outsideTempC: number;
  driveMode: "ECO" | "NORMAL" | "SPORT";
  /** 정차 후 지난 주행 시간(분) — Odometer 트립 시간 */
  tripMinutes: number;
  speedKmh: number;
  tireWarning: boolean;
};

export type RankedRestStop = {
  stop: RestStop;
  score: number;
  /** 왜 추천했는지 — 화면에 그대로 */
  reason: string;
  /** 있으면 좋은데 없는 것 — **미충족을 숨기지 않는다** */
  unmet: Amenity[];
};

export type DrivingState = "PARKED" | "MOVING" | "UNKNOWN";

export type NavResult =
  | { kind: "ADDED" }
  | { kind: "SLOT_FULL"; currentCount: number }
  | { kind: "UNAVAILABLE" }
  | { kind: "FAILED"; reason: string };
