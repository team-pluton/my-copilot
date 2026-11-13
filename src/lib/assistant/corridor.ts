/**
 * MVP 구간 — 경부선 부산 방향 휴게소. core/assistant/Corridor.kt 의 거울(원본 docs/data/rest-stops.csv, 계약 테스트로 맞춘다).
 *
 * 왜 미리 고른 목록인가: NaviHelper 에서 경로 좌표를 얻지 못해(AAR 2026-11-04) "경로 주변 충전소"를 일반 계산할 수 없다. 직선거리로 대신하지 않는다.
 * 시설 근거 등급을 나눈다:
 *  · 화장실·주차: 고속도로 휴게소의 시설 유형으로 본 수기 목록(CURATED)
 *  · 그 밖: 목록의 표시는 미검증이라 있어도 '미확인' — 유아·반려 시설을 충족이라고 말하지 않는다(죽암 방향 착오 전례)
 * 도로공사 휴게소 API 가 붙으면 이 등급이 바뀐다(키 필요).
 *
 * 시연 데이터는 MOCK_ 로 시작하는 것뿐이고 실제 값과 합치지 않는다. 좌표는 근사, 충전소 ID 는 지어낸 값이다.
 */
import type { Amenity } from "../core/model";
import type { CorridorStop, FacilityFact } from "./integrated-decision";

export const CORRIDOR_ZCODES = ["11", "41", "44", "43", "30", "47", "27", "48", "31", "26"];

// 경부선 **부산 방향** 휴게소. 2026-11-10 도로공사 "휴게소 전기차 수소차 충전소 현황"(data.go.kr 15085543, 2026-07-31)으로 대조해
// 서울 방향에만 있는 신탄진·경산·언양을 뺐다. 그 자료의 부산 방향 망향·금강·추풍령·평사·건천·통도사는 경로상 거리(km) 근거를 갖춘 뒤 더한다.
export const CORRIDOR_ROWS: { id: string; name: string; routeKm: number }[] = [
  { id: "giheung", name: "기흥휴게소", routeKm: 35 },
  { id: "anseong", name: "안성휴게소", routeKm: 70 },
  { id: "cheonan", name: "천안휴게소", routeKm: 95 },
  { id: "oksan", name: "옥산휴게소", routeKm: 125 },
  { id: "jukam", name: "죽암휴게소", routeKm: 150 },
  { id: "hwanggan", name: "황간휴게소", routeKm: 220 },
  { id: "gimcheon", name: "김천휴게소", routeKm: 250 },
  { id: "chilgok", name: "칠곡휴게소", routeKm: 290 },
];

const CURATED_SOURCE = "docs/data/rest-stops.csv · 시설 유형";
const curated = (): FacilityFact => ({ state: "CONFIRMED", evidence: "CURATED", source: CURATED_SOURCE });

/** 실제 경로용 — 충전소 연결은 검수된 표(corridor-stations.tsv)에서만 온다. 좌표는 충전기 API 값이 올 때까지 없다 */
export function corridorStops(mapping: Record<string, string[]>): CorridorStop[] {
  return CORRIDOR_ROWS.map((r) => ({
    id: r.id, name: r.name, lat: null, lon: null, routeKm: r.routeKm, routeKmEvidence: "CURATED",
    stationIds: mapping[r.id] ?? [],
    facilities: { RESTROOM: curated(), PARKING: curated() },
    detourMinutes: null,
  }));
}

const mockFact = (state: FacilityFact["state"]): FacilityFact => ({ state, evidence: "MOCK", source: "시연 데이터" });
const mockFacilities = (confirmed: Amenity[]): Partial<Record<Amenity, FacilityFact>> =>
  Object.fromEntries(confirmed.map((a) => [a, mockFact("CONFIRMED")])) as Partial<Record<Amenity, FacilityFact>>;

export const MOCK_STOPS: CorridorStop[] = [
  { id: "jukam", name: "죽암휴게소", lat: 36.4867, lon: 127.5012, routeKm: 150, routeKmEvidence: "MOCK", stationIds: ["MOCK0001"], facilities: mockFacilities(["RESTROOM", "PARKING", "RESTAURANT"]), detourMinutes: null },
  { id: "geumgang", name: "금강휴게소", lat: 36.2793, lon: 127.6720, routeKm: 165, routeKmEvidence: "MOCK", stationIds: ["MOCK0002"], facilities: mockFacilities(["RESTROOM", "PARKING", "RESTAURANT", "BABY_CARE"]), detourMinutes: null },
  { id: "hwanggan", name: "황간휴게소", lat: 36.2211, lon: 127.9245, routeKm: 220, routeKmEvidence: "MOCK", stationIds: ["MOCK0003"], facilities: mockFacilities(["RESTROOM", "PARKING", "RESTAURANT", "BABY_CARE", "PET_AREA"]), detourMinutes: null },
  { id: "gimcheon", name: "김천휴게소", lat: 36.0912, lon: 128.1398, routeKm: 250, routeKmEvidence: "MOCK", stationIds: ["MOCK0004"], facilities: mockFacilities(["RESTROOM", "PARKING"]), detourMinutes: null },
];

/** 공식 명세의 필드 이름 그대로인 시연 행 — 정규화·판단이 실제 응답과 같은 길을 지나게 */
export function mockChargerRows(now: number, overrides: Record<string, Partial<Record<string, string>>> = {}): Record<string, string | undefined>[] {
  const stamp = (msAgo: number) => {
    const d = new Date(now - msAgo + 9 * 3_600_000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  };
  const row = (statId: string, chgerId: string, statNm: string, stat: string, power: string, type = "04"): Record<string, string | undefined> => ({
    statId, chgerId, statNm, stat, chgerType: type, powerType: power, statUpdDt: stamp(20 * 60_000), busiNm: "시연 운영사", useTime: "24시간 이용가능",
    ...overrides[`${statId}/${chgerId}`],
  });
  return [
    row("MOCK0001", "01", "죽암휴게소 충전소(시연)", "2", "급속(100kW)"),
    row("MOCK0002", "01", "금강휴게소 충전소(시연)", "3", "급속(200kW)"),
    row("MOCK0002", "02", "금강휴게소 충전소(시연)", "2", "급속(200kW)"),
    row("MOCK0003", "01", "황간휴게소 충전소(시연)", "2", "급속(100kW)"),
    row("MOCK0003", "02", "황간휴게소 충전소(시연)", "2", "급속(100kW)"),
    row("MOCK0004", "01", "김천휴게소 충전소(시연)", "2", "급속(350kW)"),
  ];
}
