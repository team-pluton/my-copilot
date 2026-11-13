import { DRIVE_UNCERTAINTY, pctPerKm } from "./energy";
import { AMENITY_LABEL, needsOf, type Amenity, type RankedRestStop, type RestStop, type TripPlan, type VehicleSnapshot } from "./model";

/**
 * 추천 엔진 v2 — "어디서 서나"를 정한다. "서야 하나"는 energy.ts 가 먼저 정한다.
 *
 * v1 의 뼈대(필수 시설 배제 → 가중 점수 → 이유 설명)에 둘이 더 붙었다:
 *  · **충전기 축** — 충전이 필요한 여정이면 kW 가 점수에 들어가고, 충전기 없는 곳은 배제
 *  · **미충족 설명** — 있으면 좋은데 없는 것을 숨기지 않고 적는다
 *
 * 규칙 기반인 이유는 v1 과 같다 — 설명할 수 있어야 하고, 테스트로 증명돼야 한다.
 *
 *     Score(p) = Σ(wᵢ · sᵢ(p)) / Σwᵢ   (각 sᵢ 는 0~100)
 */
export const WEIGHTS = {
  /** 경로에서 멀어질수록 쓸모가 급격히 준다 */
  DETOUR: 35,
  /** 선호 시설을 얼마나 덮나 (필수는 이미 배제 조건) */
  AMENITY: 25,
  /** 충전 속도 — 충전이 필요할 때만 켜진다 */
  CHARGER: 20,
  /** 휴식 간격에 맞는 위치인가 */
  TIMING: 10,
  /** 정보를 믿을 수 있나 — 작지만 0 이 아니다 */
  CONFIDENCE: 10,
} as const;

const MAX_DETOUR_KM = 10;
/** 급속충전 상한으로 보는 값 — 이 이상이면 100점 */
const FAST_CHARGER_KW = 200;

export type RankInput = {
  plan: TripPlan;
  /** 출발지로부터 지금까지 온 경로상 거리(km) — 뒤에 있는 후보는 뺀다 */
  traveledKm: number;
  /** energy.ts 가 정한 것 — true 면 충전기 없는 곳은 후보가 아니다 */
  needsCharge: boolean;
  /** 마지막 휴식 이후 주행 시간(분) — 타이밍 점수 */
  tripMinutes: number;
  /**
   * 에너지 적합성 — 있으면 "거기까지 갈 수 있나", "거기서 충전하면 끝까지 가나"를 본다.
   * 없으면(혼자 테스트할 때 등) 시설·거리만으로 고른다.
   */
  feasibility?: Feasibility;
};

/** 급속은 80% 부터 느려지고, 후보에 닿을 때 8% 는 남겨 둔다 (10→80 충전이 가장 효율적인 구간) */
export const FEASIBILITY_DEFAULTS = { chargeTargetPct: 80, safetyPct: 8 } as const;

/** 화면·시연이 같은 값을 넘기게 — 대기 소비는 energy.ts 가 센 것을 그대로 받는다 */
export function feasibilityFor(v: VehicleSnapshot, waitPct: number, minReservePct: number): Feasibility {
  return { batteryPct: v.batteryPct, pctPerKm: pctPerKm(v), needAtArrivalPct: waitPct + minReservePct, ...FEASIBILITY_DEFAULTS };
}

export type Feasibility = {
  batteryPct: number;
  /** 1km 당 소비 % — energy.ts 의 pctPerKm() */
  pctPerKm: number;
  /** 도착 시 남겨야 하는 것 = 대기 소비 + 최소 잔량 (%) */
  needAtArrivalPct: number;
  /** 충전 정차에서 채우는 목표 (%) — 급속은 80% 에서 느려지므로 */
  chargeTargetPct: number;
  /** 후보까지 가는 데 남겨 둘 여유 (%) */
  safetyPct: number;
};

/** 후보를 걸러 점수를 매기고 **상위 N개만** — 기본 3. 많을수록 운전자가 화면을 오래 본다 */
export function rank(candidates: RestStop[], input: RankInput, limit = 3): RankedRestStop[] {
  const needs = needsOf(input.plan.passengers);
  let pool = candidates.filter((s) => survivesHardFilter(s, input, needs.required));
  /*
   * 충전이 필요한 여정이면 **갈 수 있는 곳**만 남기고, 그중 **거기서 충전하면 끝까지 가는 곳**이
   * 하나라도 있으면 그것만 남긴다. 시설 점수가 좋다고 70km 앞에서 세우면 남은 330km 를 또
   * 못 간다 — 사람은 "한 번만 서고 싶다". 하나도 없을 때만 갈 수 있는 곳 전부로 돌아간다.
   */
  if (input.needsCharge && input.feasibility) {
    const reachable = pool.filter((s) => reachableState(s, input) !== "UNREACHABLE");
    const oneStop = reachable.filter((s) => { const st = reachableState(s, input); return st === "ONE_STOP" || st === "ONE_STOP_LIKELY"; });
    pool = oneStop.length ? oneStop : reachable;
  }
  return pool
    .map((s) => score(s, input, needs))
    .sort((a, b) => b.score - a.score || a.stop.name.localeCompare(b.stop.name, "ko"))
    .slice(0, limit);
}

/**
 * 점수를 매길 가치조차 없는 후보를 먼저 버린다.
 * 필수 시설과 충전기는 **가중치로 깎지 않고 배제한다** — "화장실 필수"인 가족에게
 * 화장실 없는 곳을 1위로 올리면 점수가 아무리 정교해도 그 추천은 틀렸다.
 */
function survivesHardFilter(stop: RestStop, input: RankInput, required: Amenity[]): boolean {
  if (stop.routeKm <= input.traveledKm) return false; // 이미 지나왔다
  if (!required.every((a) => stop.amenities.includes(a))) return false;
  if (input.needsCharge && (stop.chargerKw == null || stop.chargerKw <= 0)) return false;
  if (stop.detourKm == null) return false; // 얼마나 벗어나는지 모르면 추천하지 않는다
  return stop.detourKm <= MAX_DETOUR_KM;
}

export type Exclusion = { stop: RestStop; reason: string };

/**
 * **왜 빠졌나** — 추천 목록에 없는 후보마다 첫 번째 탈락 이유. 화면이 "제외 N곳 · 왜" 로 보여 준다.
 * 추천 이유만 보여 주면 "안성은 왜 없지?" 에 답할 수 없다 — 빠진 이유가 보여야 규칙을 믿는다.
 * 순서는 survivesHardFilter · rank 의 검사 순서와 같다 (한 후보에 이유 하나).
 */
export function excluded(candidates: RestStop[], input: RankInput): Exclusion[] {
  const needs = needsOf(input.plan.passengers);
  const survivors = candidates.filter((s) => survivesHardFilter(s, input, needs.required));
  const oneStopExists = input.needsCharge && !!input.feasibility && survivors.some((s) => { const st = reachableState(s, input); return st === "ONE_STOP" || st === "ONE_STOP_LIKELY"; });
  const out: Exclusion[] = [];
  for (const stop of candidates) {
    if (stop.routeKm <= input.traveledKm) continue; // 지나온 곳은 설명할 가치가 없다
    const missing = needs.required.filter((a) => !stop.amenities.includes(a));
    if (missing.length) { out.push({ stop, reason: `필수 시설 없음: ${missing.map((a) => AMENITY_LABEL[a]).join(", ")}` }); continue; }
    if (input.needsCharge && (stop.chargerKw == null || stop.chargerKw <= 0)) { out.push({ stop, reason: "충전기 없음(또는 미확인)" }); continue; }
    if (stop.detourKm == null) { out.push({ stop, reason: "경로 이탈 거리 미상" }); continue; }
    if (stop.detourKm > MAX_DETOUR_KM) { out.push({ stop, reason: `경로에서 ${fmtKm(stop.detourKm)}km 이탈 (${MAX_DETOUR_KM}km 초과)` }); continue; }
    if (input.needsCharge && input.feasibility) {
      const state = reachableState(stop, input);
      if (state === "UNREACHABLE") { out.push({ stop, reason: "지금 배터리로 못 감" }); continue; }
      if (state === "MORE_STOPS" && oneStopExists) { out.push({ stop, reason: "충전해도 한 번 더 서야 함" }); continue; }
    }
  }
  return out;
}

/** UNREACHABLE: 거기까지 못 간다 · ONE_STOP: 거기서 충전하면 끝까지 간다 · MORE_STOPS: 가긴 가지만 한 번 더 서야 한다 */
/**
 * ONE_STOP: 보수적 추정(주행 +12%)으로도 거기서 80% 충전하면 끝까지 간다
 * ONE_STOP_LIKELY: 평균 추정으로는 가지만 보수적으로는 모자랄 수 있다 → "추가 충전 가능성" 을 적는다
 * MORE_STOPS: 평균으로도 한 번 더 서야 한다 · UNREACHABLE: 지금 배터리로 거기까지 못 간다
 * "한 번만 충전하면 끝까지" 는 약속이 아니라 추정이다 — 불확실하면 그렇다고 말한다.
 */
export type ReachableState = "UNREACHABLE" | "ONE_STOP" | "ONE_STOP_LIKELY" | "MORE_STOPS";

export function reachableState(stop: RestStop, input: RankInput): ReachableState {
  const f = input.feasibility;
  if (!f) return "ONE_STOP";
  const toStop = (stop.routeKm - input.traveledKm) * f.pctPerKm;
  if (toStop > f.batteryPct - f.safetyPct) return "UNREACHABLE";
  const restKm = input.plan.routeKm - stop.routeKm;
  const after = restKm * f.pctPerKm + f.needAtArrivalPct;
  if (after > f.chargeTargetPct) return "MORE_STOPS";
  const afterPessimistic = restKm * f.pctPerKm * (1 + DRIVE_UNCERTAINTY) + f.needAtArrivalPct;
  return afterPessimistic <= f.chargeTargetPct ? "ONE_STOP" : "ONE_STOP_LIKELY";
}

export type ScoreBreakdown = {
  detour: number;
  amenity: number;
  charger: number;
  timing: number;
  confidence: number;
  total: number;
  /** 충전 불필요 여정에서는 CHARGER 가중치를 빼고 평균한다 */
  chargerCounted: boolean;
};

export function breakdown(stop: RestStop, input: RankInput): ScoreBreakdown {
  const needs = needsOf(input.plan.passengers);
  const detour = detourScore(stop);
  const amenity = amenityScore(stop, needs.preferred);
  const charger = chargerScore(stop);
  const timing = timingScore(stop, input);
  const confidence = confidenceScore(stop);

  const chargerCounted = input.needsCharge;
  const wSum = WEIGHTS.DETOUR + WEIGHTS.AMENITY + (chargerCounted ? WEIGHTS.CHARGER : 0) + WEIGHTS.TIMING + WEIGHTS.CONFIDENCE;
  const total = Math.floor(
    (WEIGHTS.DETOUR * detour +
      WEIGHTS.AMENITY * amenity +
      (chargerCounted ? WEIGHTS.CHARGER * charger : 0) +
      WEIGHTS.TIMING * timing +
      WEIGHTS.CONFIDENCE * confidence) / wSum,
  );
  return { detour, amenity, charger, timing, confidence, total, chargerCounted };
}

function score(stop: RestStop, input: RankInput, needs: { required: Amenity[]; preferred: Amenity[] }): RankedRestStop {
  const unmet = needs.preferred.filter((a) => !stop.amenities.includes(a));
  return {
    stop,
    score: breakdown(stop, input).total,
    reason: explain(stop, input, needs),
    unmet,
  };
}

/** 0km → 100, MAX_DETOUR_KM → 0. 선형 */
function detourScore(stop: RestStop): number {
  if (stop.detourKm == null) return 0;
  return Math.floor((1 - Math.min(Math.max(stop.detourKm / MAX_DETOUR_KM, 0), 1)) * 100);
}

/** 선호 시설 커버율. 선호가 없으면(혼자) 시설 가짓수로, 상한을 둔다 */
function amenityScore(stop: RestStop, preferred: Amenity[]): number {
  if (preferred.length === 0) return Math.min(Math.floor((stop.amenities.length * 100) / 6), 100);
  const matched = preferred.filter((a) => stop.amenities.includes(a)).length;
  return Math.floor((matched * 100) / preferred.length);
}

/** kW 를 FAST_CHARGER_KW 기준 선형. 충전기 없으면 0 (충전 필요 여정에선 어차피 배제됨) */
function chargerScore(stop: RestStop): number {
  if (stop.chargerKw == null) return 0;
  return Math.floor(Math.min(stop.chargerKw / FAST_CHARGER_KW, 1) * 100);
}

/**
 * 이 후보에 **도착할 즈음**이 쉴 때인가. 후보까지 남은 거리를 시간으로 바꿔
 * (평균 80km/h 가정) 지금 주행 시간에 더한 뒤 휴식 간격과 견준다.
 * 간격 근처면 100, 너무 이르거나(간격의 절반 전) 한참 늦으면 깎는다.
 */
function timingScore(stop: RestStop, input: RankInput): number {
  const minutesToStop = ((stop.routeKm - input.traveledKm) / 80) * 60;
  const atArrival = input.tripMinutes + minutesToStop;
  const target = input.plan.breakIntervalMinutes;
  const gap = Math.abs(atArrival - target);
  const half = Math.max(target / 2, 1);
  return Math.floor((1 - Math.min(gap / half, 1)) * 100);
}

function confidenceScore(stop: RestStop): number {
  return stop.confidence === "VERIFIED" ? 100 : 40;
}

/** 화면에 그대로 띄울 이유. "내비 휴게소 검색과 뭐가 다르냐"에 답하는 자리 */
function explain(stop: RestStop, input: RankInput, needs: { required: Amenity[]; preferred: Amenity[] }): string {
  const parts: string[] = [];
  const req = needs.required.length;
  if (req) parts.push(`필수 시설 ${req}개 모두 충족`);
  if (needs.preferred.length) {
    const matched = needs.preferred.filter((a) => stop.amenities.includes(a)).length;
    parts.push(`선호 ${needs.preferred.length}개 중 ${matched}개`);
  }
  if (input.needsCharge && stop.chargerKw != null) parts.push(`급속 ${stop.chargerKw}kW`);
  if (input.needsCharge && input.feasibility) {
    const f = input.feasibility;
    const used = (stop.routeKm - input.traveledKm) * f.pctPerKm;
    const atStop = Math.max(Math.round(f.batteryPct - used), 0);
    const atStopPess = Math.max(Math.round(f.batteryPct - used * (1 + DRIVE_UNCERTAINTY)), 0);
    // 보수적으로 닿을 때 여유(8%)보다 적으면 그 숫자도 같이 적는다 — 1위라도 숨기지 않는다
    parts.push(atStopPess < f.safetyPct ? `도착 시 약 ${atStop}%(보수적 ${atStopPess}%)` : `도착 시 약 ${atStop}%`);
    const st = reachableState(stop, input);
    parts.push(st === "ONE_STOP" ? "보수적으로도 한 번 충전으로 도착" : st === "ONE_STOP_LIKELY" ? "한 번 충전 예상 · 추가 충전 가능성" : "충전해도 한 번 더 서야 함");
  }
  if (stop.detourKm != null) parts.push(`경로에서 ${fmtKm(stop.detourKm)}km`);
  // 우회 '시간'은 재계산에 성공했을 때만 (CLAUDE.md 정책 2)
  if (stop.detourMinutes != null) parts.push(`추가 ${stop.detourMinutes}분`);
  if (stop.confidence === "UNKNOWN") parts.push("정보 미확인");
  return parts.join(" · ");
}

export function unmetLabel(unmet: Amenity[]): string {
  return unmet.length ? `${unmet.map((a) => AMENITY_LABEL[a]).join(", ")} 없음` : "선호 시설 모두 있음";
}

function fmtKm(v: number): string {
  return v < 10 ? (Math.floor(v * 10) / 10).toString() : Math.floor(v).toString();
}
