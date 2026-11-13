/**
 * V6 통합 판단 — 차량 · 충전 인프라 · 경로 · 일행 조건을 **결정 하나**로. core/assistant/IntegratedDecision.kt 의 거울.
 *
 * 기존 엔진을 대체하지 않는다: 에너지는 estimate · pctPerKm · reachableState · chargeMinutes, 일행 조건은 needsOf 를 그대로 부른다.
 * rank() 를 쓰지 않는 이유 — rank 는 우회 거리를 모르면 후보를 버리고 시설을 '있음/없음'으로만 본다. 실제 데이터에는 우회 정보가 없고 '미확인' 시설이 많다.
 *
 * 순서가 곧 규칙이다: 필수 조건이 먼저고, 실패한 필수 조건은 다른 점수로 상쇄되지 않는다.
 * 우회: NaviHelper 에서 경로 좌표를 얻지 못했다(AAR 2026-11-04). 확인된 값이 없으면 숫자를 쓰지 않는다 — 직선거리로 대신하지 않는다.
 */
import { chargeMinutes, DRIVE_UNCERTAINTY, estimate, pctPerKm } from "../core/energy";
import { FEASIBILITY_DEFAULTS, reachableState, type ReachableState } from "../core/engine";
import { AMENITY_LABEL, needsOf, type Amenity, type RestStop, type TripPlan, type VehicleSnapshot } from "../core/model";
import { assessStation, type ChargerRecord, type Connector, type StationAssessment } from "./charger";
import { ENERGY_POWERTRAINS, type Powertrain } from "./freshness";
import { EVIDENCE_LABEL, type Availability, type Evidence, type Fact, type VehicleEnergy } from "./journey-fact";

/**
 * 지금 상태가 도착 때까지 의미 있는 거리(km, 가정 · 약 30분). 3시간 뒤에 닿을 곳이 지금 '충전 중'인 것은 도착 때의 빈자리를 말해 주지 않는다 —
 * 그래서 먼 곳은 '충전 중'만으로 순위를 내리지 않고, 곧 닿을 곳이 전부 충전 중일 때만 뒤로 보낸다. 점검·운영 중지는 거리와 무관하게 제외한다.
 */
export const STATUS_MEANINGFUL_KM = 40;

export type FacilityState = "CONFIRMED" | "ABSENT" | "UNKNOWN";
export type FacilityFact = { state: FacilityState; evidence: Evidence; source: string };

export type CorridorStop = {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
  /** 출발지 기준 경로상 위치(km). 측정값이 아니라 목록 값 — routeKmEvidence 로 구분 */
  routeKm: number;
  routeKmEvidence: Evidence;
  stationIds: string[];
  facilities: Partial<Record<Amenity, FacilityFact>>;
  /** 확인된 경우에만. 없으면 화면에 숫자를 쓰지 않는다(정책 2) */
  detourMinutes: number | null;
};

export type ChargerFeed = {
  availability: Availability;
  errorReason: string | null;
  records: ChargerRecord[];
};

export type DecisionInput = {
  powertrain: Powertrain;
  vehicle: Fact<VehicleEnergy>;
  /** 공조·외기온 등 에너지 추정 입력. SOC·용량은 vehicle 값으로 덮어 쓴다 */
  snapshot: VehicleSnapshot;
  plan: TripPlan;
  traveledKm: number;
  connector: Connector;
  stops: CorridorStop[];
  chargers: ChargerFeed;
  now: number;
  rejectedStopIds?: string[];
};

export type Candidate = {
  stopId: string;
  name: string;
  lat: number | null;
  lon: number | null;
  routeKm: number;
  routeKmEvidence: Evidence;
  reach: ReachableState;
  /** 거기 닿을 때 잔량 추정 범위(%) — 비관 · 낙관 */
  arrivalSocRange: [number, number];
  /** 80% 까지 충전 뒤 목적지 도착 시 남는 여유 추정(%). 대기·최소 잔량을 뺀 값 */
  marginAfterChargePct: number;
  /** 출력을 알 때만 — '언제 다시 출발'의 근거. 항상 추정 */
  chargeMinutes: number | null;
  station: StationAssessment;
  /** 곧 닿는데 규격 맞는 충전기가 모두 충전 중으로 표시 */
  busyNearby: boolean;
  familyConfirmed: Amenity[];
  familyUnknown: Amenity[];
  detourMinutes: number | null;
  reasons: string[];
};

export type DecisionKind = "NOT_APPLICABLE" | "CANNOT_JUDGE" | "NO_CHARGE_NEEDED" | "RECOMMEND" | "NO_RELIABLE";
export type Decision = {
  kind: DecisionKind;
  headline: string;
  detail: string;
  /** 부족분 추정(%)과 범위 — 에너지 판단이 있었을 때만 */
  shortfallPct: number | null;
  shortfallRange: [number, number] | null;
  top: Candidate | null;
  /** 추천과 같은 기준을 통과한 대안. 최대 2 */
  alternatives: Candidate[];
  /** 정보가 부족해 동등하게 다루지 않는 후보 */
  needsCheck: Candidate[];
  excluded: { stopId: string; name: string; reason: string }[];
  /** 충전소 API 를 불렀는가 — 충전이 필요 없으면 부르지 않는다 */
  usedChargerData: boolean;
};

const empty = (kind: DecisionKind, headline: string, detail: string): Decision => ({
  kind, headline, detail, shortfallPct: null, shortfallRange: null, top: null, alternatives: [], needsCheck: [], excluded: [], usedChargerData: false,
});

const fmtShort = (p: number, r: [number, number]) => `약 ${Math.round(p)}%p(${Math.round(r[0])}~${Math.round(r[1])}%p) 부족 추정`;
const facility = (s: CorridorStop, a: Amenity): FacilityState => s.facilities[a]?.state ?? "UNKNOWN";

/** 차량 입력을 뺀 에너지 계획 — 충전소 조회가 필요한지 먼저 묻는 자리에서도 같은 값을 쓴다 */
function energyOf(input: DecisionInput) {
  const v = input.vehicle.value!;
  const snapshot: VehicleSnapshot = { ...input.snapshot, batteryPct: v.socPct, batteryKwh: v.capacityKwh };
  const remainingKm = Math.max(input.plan.routeKm - input.traveledKm, 0);
  return { snapshot, plan: estimate({ ...input.plan, routeKm: remainingKm }, snapshot) };
}

/** 충전소 API 를 부를 이유가 있나. 충전이 필요 없으면 호출량도, 화면도 쓰지 않는다 */
export function needsChargerLookup(input: Pick<DecisionInput, "powertrain" | "vehicle" | "snapshot" | "plan" | "traveledKm">): boolean {
  if (!ENERGY_POWERTRAINS.includes(input.powertrain) || input.vehicle.value == null) return false;
  return energyOf(input as DecisionInput).plan.needsCharge;
}

/**
 * 권할 곳이 없을 때 — 원인을 섞지 않는다(평가 2026-11-11, 공통 정보 실패 상태): 연결 실패 ≠ 오래된 정보 ≠ 조건 미충족 ≠ 정상 조회 후 후보 없음.
 * 연결 실패를 '없다'로 말하면 실제로 후보가 없는 것처럼 읽힌다 (IntegratedDecision.noReliableHeadline)
 */
export function noReliableHeadline(feedFailed: boolean, checkReasons: string[], excludedReasons: string[] = []): string {
  if (feedFailed) return "충전소 정보를 확인하지 못했어요";
  if (checkReasons.length && checkReasons.every((r) => r.includes("오래"))) return "충전소 상태를 다시 확인해야 해요";
  if (checkReasons.length) return "지금 조건에서는 충전소를 추천하기 어려워요";
  if (excludedReasons.length && excludedReasons.every((r) => r === UNREACHABLE_REASON)) return "현재 배터리로 도달 가능한 후보가 확인되지 않았어요";
  return "현재 조건에 맞는 충전소를 찾지 못했어요";
}
const UNREACHABLE_REASON = "지금 배터리로 닿지 못할 수 있어요";

export function decide(input: DecisionInput): Decision {
  // A. 판단할 자격 — EV 전용 계산을 다른 동력원에 쓰지 않고, 입력이 없으면 답을 만들지 않는다
  if (!ENERGY_POWERTRAINS.includes(input.powertrain)) return empty("NOT_APPLICABLE", "이 차량은 충전 판단 대상이 아니에요", "충전 판단은 전기차 특화 기능이에요. 동력원이 확인되면 다시 볼게요");
  if (input.vehicle.value == null) return empty("CANNOT_JUDGE", "지금은 충전 계획을 말할 수 없어요", input.vehicle.meta.reliabilityReason || "차량 정보를 받지 못했어요");

  const { snapshot, plan: energy } = energyOf(input);
  const base = { shortfallPct: energy.shortfallPct, shortfallRange: energy.shortfallRange };
  if (!energy.needsCharge) return { ...empty("NO_CHARGE_NEEDED", "충전 없이 갈 수 있을 것으로 추정돼요", energy.message), ...base };

  // B~H. 후보마다 필수 조건 → 정보 신뢰 순으로 나눈다
  const needs = needsOf(input.plan.passengers);
  const perKm = pctPerKm(snapshot);
  const needAtArrival = energy.waitPct + input.plan.minReservePct;
  const { chargeTargetPct, safetyPct } = FEASIBILITY_DEFAULTS;
  const feasibility = { batteryPct: snapshot.batteryPct, pctPerKm: perKm, needAtArrivalPct: needAtArrival, chargeTargetPct, safetyPct };
  const rankInput = { plan: input.plan, traveledKm: input.traveledKm, needsCharge: true, tripMinutes: 0, feasibility };

  const excluded: Decision["excluded"] = [];
  const usable: Candidate[] = [];
  const needsCheck: Candidate[] = [];
  for (const s of input.stops) {
    if (s.routeKm <= input.traveledKm) continue;
    if (input.rejectedStopIds?.includes(s.id)) { excluded.push({ stopId: s.id, name: s.name, reason: "이번 이동에서 선택하지 않기로 했어요" }); continue; }

    const toStop = (s.routeKm - input.traveledKm) * perKm;
    const reach = reachableState({ routeKm: s.routeKm } as RestStop, rankInput);
    // 평균 추정만이 아니라 비관 추정으로도 닿아야 한다 — 못 닿으면 여정이 멈추는 항목이라 다른 점수로 상쇄하지 않는다
    const lo = snapshot.batteryPct - toStop * (1 + DRIVE_UNCERTAINTY);
    const hi = snapshot.batteryPct - toStop * (1 - DRIVE_UNCERTAINTY);
    if (reach === "UNREACHABLE" || lo < safetyPct) { excluded.push({ stopId: s.id, name: s.name, reason: UNREACHABLE_REASON }); continue; }

    const absent = needs.required.filter((a) => facility(s, a) === "ABSENT");
    if (absent.length) { excluded.push({ stopId: s.id, name: s.name, reason: `필수 시설 없음: ${absent.map((a) => AMENITY_LABEL[a]).join(", ")}` }); continue; }

    const station = input.chargers.availability === "OK"
      ? assessStation(input.chargers.records, s.stationIds, input.connector, input.now)
      : assessFailed(s.stationIds, input.chargers);
    if (station.verdict === "EXCLUDED") { excluded.push({ stopId: s.id, name: s.name, reason: station.reason }); continue; }

    const requiredUnknown = needs.required.filter((a) => facility(s, a) === "UNKNOWN");
    const wanted = [...needs.required, ...needs.preferred];
    const candidate: Candidate = {
      stopId: s.id, name: s.name, lat: s.lat, lon: s.lon, routeKm: s.routeKm, routeKmEvidence: s.routeKmEvidence, reach,
      arrivalSocRange: [lo, hi],
      marginAfterChargePct: chargeTargetPct - (input.plan.routeKm - s.routeKm) * perKm - needAtArrival,
      chargeMinutes: station.maxKw != null ? chargeMinutes(Math.max(hi, 0), chargeTargetPct, snapshot.batteryKwh, Math.round(station.maxKw)) : null,
      station,
      busyNearby: s.routeKm - input.traveledKm <= STATUS_MEANINGFUL_KM && station.availableCount === 0 && station.chargingCount > 0,
      familyConfirmed: wanted.filter((a) => facility(s, a) === "CONFIRMED"),
      familyUnknown: wanted.filter((a) => facility(s, a) === "UNKNOWN"),
      detourMinutes: s.detourMinutes,
      reasons: [],
    };
    if (requiredUnknown.length) {
      candidate.reasons = [`필수 시설 미확인: ${requiredUnknown.map((a) => AMENITY_LABEL[a]).join(", ")}`];
      needsCheck.push(candidate);
    } else if (station.verdict === "NEEDS_CHECK") {
      candidate.reasons = [station.reason];
      needsCheck.push(candidate);
    } else usable.push(candidate);
  }

  // 한 번에 끝나는 곳이 있으면 한 번 더 서야 하는 곳은 추천하지 않는다(rank 와 같은 원칙)
  const oneStop = usable.filter((c) => c.reach !== "MORE_STOPS");
  const pool = oneStop.length ? oneStop : usable;
  for (const c of usable) if (oneStop.length && c.reach === "MORE_STOPS") excluded.push({ stopId: c.stopId, name: c.name, reason: "충전해도 한 번 더 서야 해요" });
  const ordered = pool.slice().sort(compareCandidates);
  const check = needsCheck.slice().sort(compareCandidates);
  ordered.forEach((c) => { c.reasons = reasonsOf(c); });

  const common = { ...base, usedChargerData: true, excluded };
  if (!ordered.length) {
    const failed = input.chargers.availability !== "OK";
    return {
      ...common, kind: "NO_RELIABLE",
      headline: noReliableHeadline(failed, check.map((c) => c.reasons[0] ?? ""), excluded.map((e) => e.reason)),
      detail: failed ? `충전소 상태를 받지 못했어요 · 도착 후 대기까지 세면 ${fmtShort(energy.shortfallPct, energy.shortfallRange)}` : check.length ? "후보는 있지만 확인이 더 필요해요 · 내비게이션에서 직접 확인해 주세요" : "닿을 수 있는 후보를 찾지 못했어요 · 내비게이션에서 직접 확인해 주세요",
      top: null, alternatives: [], needsCheck: check.slice(0, 3),
    };
  }
  const top = ordered[0];
  return {
    ...common, kind: "RECOMMEND",
    headline: `${top.name}에서 충전하며 쉬어 가세요`,
    detail: `도착 후 대기까지 세면 ${fmtShort(energy.shortfallPct, energy.shortfallRange)}`,
    top, alternatives: ordered.slice(1, 3), needsCheck: check.slice(0, 2),
  };
}

function assessFailed(stationIds: string[], feed: ChargerFeed): StationAssessment {
  return {
    stationIds, verdict: "NEEDS_CHECK", reason: feed.errorReason ? `충전소 상태 조회 실패: ${feed.errorReason}` : "충전소 상태를 받지 못했어요",
    compatibleCount: 0, availableCount: 0, chargingCount: 0, maxKw: null, freshness: "UNKNOWN", retrievedAt: null, statusChangedAt: null, evidence: "UNKNOWN", restriction: null,
  };
}

const REACH_RANK: Record<ReachableState, number> = { ONE_STOP: 0, ONE_STOP_LIKELY: 1, MORE_STOPS: 2, UNREACHABLE: 3 };
const FRESH_RANK = { FRESH: 0, AGING: 1, STALE: 2, UNKNOWN: 3 } as const;

/** 점수 합산이 아니라 사전식 비교 — 뒤 기준이 앞 기준을 뒤집지 못하게. 왜 이 순서인지 사람이 설명할 수 있어야 한다 */
export function compareCandidates(a: Candidate, b: Candidate): number {
  return Number(a.busyNearby) - Number(b.busyNearby)
    || REACH_RANK[a.reach] - REACH_RANK[b.reach]
    || Number(b.station.availableCount > 0) - Number(a.station.availableCount > 0)
    || FRESH_RANK[a.station.freshness] - FRESH_RANK[b.station.freshness]
    || b.familyConfirmed.length - a.familyConfirmed.length
    || (b.station.maxKw ?? -1) - (a.station.maxKw ?? -1)
    || b.station.availableCount - a.station.availableCount
    || a.routeKm - b.routeKm
    || (a.stopId < b.stopId ? -1 : a.stopId > b.stopId ? 1 : 0);
}

function reasonsOf(c: Candidate): string[] {
  const out = [c.reach === "ONE_STOP" ? "충전 후 목적지까지 갈 수 있을 것으로 추정돼요" : c.reach === "ONE_STOP_LIKELY" ? "충전 후 목적지까지 갈 것으로 보이지만 여유가 적어요" : "목적지까지 한 번 더 충전이 필요할 수 있어요"];
  out.push(c.station.reason);
  if (c.familyConfirmed.length) out.push(`확인된 시설: ${c.familyConfirmed.map((a) => AMENITY_LABEL[a]).join(", ")}`);
  if (c.familyUnknown.length) out.push(`미확인: ${c.familyUnknown.map((a) => AMENITY_LABEL[a]).join(", ")}`);
  return out;
}

/** 근거 한 줄 — 어느 값이 어디서 왔는지. 실제와 시연을 섞어 말하지 않는다 */
export function evidenceLine(c: Candidate, vehicle: Fact<VehicleEnergy>): string {
  return `배터리 ${EVIDENCE_LABEL[vehicle.meta.evidence]} · 충전기 ${EVIDENCE_LABEL[c.station.evidence]} · 위치 ${EVIDENCE_LABEL[c.routeKmEvidence]}`;
}

export type ReplanNotice = { changed: boolean; message: string | null };

/**
 * 다시 물을 만한 변화인가 — **선택이 바뀔 때만**. 상태 값이 움직여도 추천이 그대로면 말하지 않는다.
 * 이유는 새 판단이 적은 사실만 옮긴다. 왜 그렇게 됐는지 추측하지 않는다.
 */
export function replanNotice(prev: Decision, next: Decision): ReplanNotice {
  const prevTop = prev.top?.stopId ?? null;
  const nextTop = next.top?.stopId ?? null;
  if (prev.kind === next.kind && prevTop === nextTop) return { changed: false, message: null };
  if (!prev.top) return { changed: prev.kind !== next.kind, message: next.headline };
  const fate = next.excluded.find((x) => x.stopId === prevTop)?.reason
    ?? next.needsCheck.find((c) => c.stopId === prevTop)?.reasons[0];
  const lead = fate ? `${prev.top.name}: ${fate}` : `${prev.top.name}보다 조건이 나은 곳이 있어요`;
  if (next.kind === "RECOMMEND" && next.top) return { changed: true, message: `${lead} · 대신 권하는 곳: ${next.top.name}` };
  return { changed: true, message: `${lead} · ${next.headline}` };
}

export type DecisionSurface = { kind: "FULL" } | { kind: "ONE_LINE"; line: string };

/** 주행 중엔 비교 화면도 버튼도 없다(정책 7). 움직임을 모를 때도 주행으로 본다 */
export function decisionSurface(d: Decision, parked: boolean): DecisionSurface {
  if (parked) return { kind: "FULL" };
  if (d.kind === "RECOMMEND" && d.top) return { kind: "ONE_LINE", line: `충전·휴식 후보 ${d.top.name} · 정차 후 확인` };
  if (d.kind === "NO_RELIABLE") return { kind: "ONE_LINE", line: "충전 계획 확인 필요 · 정차 후 확인" };
  return { kind: "ONE_LINE", line: d.headline };
}

export const canPickStop = (d: Decision, stopId: string, parked: boolean) =>
  parked && (d.top?.stopId === stopId || d.alternatives.some((c) => c.stopId === stopId));
