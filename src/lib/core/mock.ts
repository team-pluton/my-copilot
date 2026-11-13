import type { DrivingState, NavResult, RestStop, TripPlan, VehicleSnapshot } from "./model";

/**
 * 시연용 데이터와 모의 어댑터 — **전부 가상이다.**
 *
 * 장소 이름은 경부고속도로(부산 방향) 실제 휴게소에서 빌렸지만 충전기 kW·시설·
 * 반려동물 구역·우회 거리는 시연을 위해 적은 값이고 **검증하지 않았다.** 화면에
 * "시연용 가상 데이터"를 늘 띄운다 (CLAUDE.md 정책 4). 실데이터 15~30곳은 HANDOFF.
 *
 * 왜 서울→부산 한 경로만인가: 전국은 데이터 라이선스·정확도·비용이 전부 걸린다.
 * 시연은 **하나의 경로를 끝까지 설득력 있게** 보여 주는 쪽이 낫다.
 */
export const DEMO_ROUTE = {
  from: "서울",
  to: "부산",
  totalKm: 400,
  /** 시연 재생에서 1분 = 이만큼 전진 (평균 80km/h) */
  kmPerMinute: 80 / 60,
};

export const DEFAULT_PLAN: TripPlan = {
  destinationName: "부산",
  routeKm: DEMO_ROUTE.totalKm,
  mode: "JOURNEY",
  returnKm: 0,
  waitMinutesAfterArrival: 40,
  minReservePct: 20,
  passengers: ["CHILD", "PET"],
  breakIntervalMinutes: 90,
};

/**
 * 두 번째 시연 시나리오 — 픽업·마중(WAIT). 같은 엔진, 다른 순간.
 * 집 → 인천공항 52km, 60분 기다렸다 같은 길로 귀가. 초겨울 1°C, 배터리 55%. 수치는 가상.
 */
export const WAIT_PLAN: TripPlan = {
  destinationName: "인천공항 (마중)",
  routeKm: 52,
  returnKm: 52,
  mode: "WAIT",
  waitMinutesAfterArrival: 60,
  minReservePct: 20,
  passengers: [],
  breakIntervalMinutes: 120,
};

export const DEFAULT_VEHICLE: VehicleSnapshot = {
  batteryPct: 68,
  batteryKwh: 77,
  efficiencyKwhPer100km: null, // 차종 기본값을 쓰게 — 에뮬레이터 값이 오면 채운다
  hvacOn: true,
  outsideTempC: 6,
  driveMode: "NORMAL",
  tripMinutes: 0,
  speedKmh: 0,
  tireWarning: false,
};

export const WAIT_VEHICLE: VehicleSnapshot = { ...DEFAULT_VEHICLE, batteryPct: 55, outsideTempC: 1 };

const S = (
  id: string,
  name: string,
  routeKm: number,
  amenities: RestStop["amenities"],
  chargerKw: number | null,
  extra: Partial<RestStop> = {},
): RestStop => ({
  id,
  name,
  location: { lat: 0, lon: 0 },
  routeKm,
  amenities,
  detourKm: 0.5,
  detourMinutes: null,
  chargerKw,
  chargerStalls: chargerKw ? 4 : null,
  confidence: "VERIFIED",
  openingHours: "24시간",
  dataSource: "demo",
  ...extra,
});

/** 서울 → 부산, 경로상 거리순 */
export const DEMO_STOPS: RestStop[] = [
  S("giheung", "기흥휴게소", 35, ["RESTROOM", "PARKING", "RESTAURANT", "EV_CHARGER"], 100),
  S("anseong", "안성휴게소", 70, ["RESTROOM", "PARKING", "RESTAURANT", "CAFE", "BABY_CARE", "PET_AREA", "EV_CHARGER"], 200, { detourKm: 0.3, detourMinutes: 2 }),
  S("cheonan", "천안휴게소", 95, ["RESTROOM", "PARKING", "RESTAURANT", "BABY_CARE", "EV_CHARGER"], 100, { detourKm: 0.6 }),
  S("oksan", "옥산휴게소", 125, ["RESTROOM", "PARKING", "RESTAURANT", "CAFE", "EV_CHARGER"], 350, { detourKm: 0.4 }),
  // 시연 데이터는 가상이다. 참고로 실제 죽암 반려견 놀이터는 **서울방향**에 있다(정책브리핑 2021-12-03 · 더팩트 "죽암(서울)") —
  // 이 시연 경로(부산방향)에서는 확인되지 않았다. 실데이터로 바꿀 때 이 행의 PET_AREA 를 그대로 옮기지 않는다(docs/data/rest-stops.csv).
  S("jukam", "죽암휴게소", 150, ["RESTROOM", "PARKING", "RESTAURANT", "PET_AREA"], null, { confidence: "UNKNOWN", openingHours: null }),
  S("geumgang", "금강휴게소", 165, ["RESTROOM", "PARKING", "RESTAURANT", "CAFE", "PET_AREA", "EV_CHARGER"], 200, { detourKm: 0.4 }),
  S("hwanggan", "황간휴게소", 220, ["RESTROOM", "PARKING", "RESTAURANT", "EV_CHARGER"], 50, { detourKm: 0.5 }),
  S("gimcheon", "김천휴게소", 250, ["RESTROOM", "PARKING", "RESTAURANT", "CAFE", "BABY_CARE", "PET_AREA", "EV_CHARGER"], 350, { detourKm: 0.3, detourMinutes: 2 }),
  S("chilgok", "칠곡휴게소", 290, ["RESTROOM", "PARKING", "RESTAURANT", "EV_CHARGER"], 100, { detourKm: 0.7 }),
  S("geoncheon", "건천휴게소", 330, ["RESTROOM", "PARKING", "RESTAURANT", "CAFE", "EV_CHARGER"], 200, { detourKm: 0.5 }),
  S("eonyang", "언양휴게소", 370, ["RESTROOM", "PARKING", "CAFE", "EV_CHARGER"], 100, { detourKm: 0.5, confidence: "UNKNOWN", openingHours: null }),
  // ── 걸러지는 것을 보여 주기 위한 후보 ──
  S("offroute", "안성 시내 대형 카페 (충전기 있음)", 72, ["RESTROOM", "PARKING", "CAFE", "PET_AREA", "EV_CHARGER"], 50, { detourKm: 7.5, confidence: "UNKNOWN", openingHours: null }),
  S("unknown-detour", "천안 IC 밖 충전소", 97, ["RESTROOM", "PARKING", "EV_CHARGER"], 200, { detourKm: null, confidence: "UNKNOWN", openingHours: null }),
];

/**
 * 모의 내비 — 경유지 슬롯 2개는 **공식 문서로 확인된 값**이다
 * (`WaypointIndex.FIRST/SECOND`, research/PLEOS_PLATFORM.md 2절).
 * 꽉 찼을 때 기존 경유지를 **지우지 않고** 알려 주는 동작을 여기서 시연한다.
 */
export const WAYPOINT_SLOTS = 2;

export function mockAddStop(currentWaypoints: number, available = true): NavResult {
  if (!available) return { kind: "UNAVAILABLE" };
  if (currentWaypoints >= WAYPOINT_SLOTS) return { kind: "SLOT_FULL", currentCount: currentWaypoints };
  return { kind: "ADDED" };
}

/** 속도로만 본다. 실제 판정은 기어(P)·주차 브레이크(AAOS)까지 본다 — src/lib/assistant/journey.ts motionOf */
export function drivingStateOf(speedKmh: number): DrivingState {
  return speedKmh > 5 ? "MOVING" : "PARKED";
}
