/**
 * ARRIVE READY v0 — "이 주차장에 세우면 약속 시간에 방문을 마칠 수 있나" (ArriveReady.kt 의 거울).
 *
 * 세 단계를 나눠 판단한다(제품원칙점검 평가 2026-11-11):
 *  1. 방문 가능성 — 약속 − 지금 − 주차장까지 소요 시간(내비) − 주차 후 여유(사용자가 정함) 를 **범위**로
 *  2. 주차 적합성 — 위치 · 운영시간 · 빈자리 표시와 그 갱신 시각(Gate D)
 *  3. 행동 결정 — 추천 하나 + 순위를 처음 가른 기준 하나 + 남은 불확실성
 *
 * 만들어 내지 않는 것: 도보 시간 · 도착 시점의 빈자리 · 지각 시각. 근거가 없으면 '판단 불가'가 정상 결과다.
 * 데이터: 서울 열린데이터광장 GetParkingInfo(실시간) + GetParkInfo(좌표) [실 API, Gate A] · 소요 시간 NaviHelper requestTrip [에뮬, Gate B].
 * 가설값(측정 전 — 바꿀 수 있다): 빈자리 신선 20분 · 반경 800m · 여유 기준 10분 · 소요 시간 불확실성 15%(최소 5분) · 빈자리 넉넉 10면.
 */
import { ageMinutes } from "./journey-fact";

export type GeoPoint = { lat: number; lon: number };

// ── 1. 목표(사용자 확인값) ─────────────────────────────────
export type ArriveGoal = {
  /** 약속 시각(epoch ms) — 사용자 입력만. 일정 앱 연동은 [미구현] */
  appointmentAt: number | null;
  place: { name: string; point: GeoPoint | null };
  /** 주차 후 방문까지 여유(분) — 사용자가 정한다. 도보 시간을 계산하지 않는다 */
  bufferMin: number | null;
  confirmedByUser: boolean;
};

export function goalMissing(g: ArriveGoal, now: number): string[] {
  const out: string[] = [];
  if (g.appointmentAt === null) out.push("약속 시각");
  else if (g.appointmentAt <= now) out.push("약속 시각(이미 지남)");
  if (!g.place.point) out.push("방문 장소 위치");
  if (g.bufferMin === null || g.bufferMin < 0) out.push("주차 후 여유");
  if (!g.confirmedByUser) out.push("약속 확인");
  return out;
}

// ── 2. 주차 데이터 정규화(서울 시영) ─────────────────────────
export type ParkingKind = "OFF_STREET" | "ON_STREET" | "OTHER";
export type Hours = { begin: string; end: string } | null;
export type ParkingFact = {
  id: string;
  name: string;
  address: string;
  kind: ParkingKind;
  /** 정보 API 좌표의 중심 — 없으면 null(후보에서 뺀다). 노상은 여러 구간이라 중심 + 퍼짐 */
  point: GeoPoint | null;
  spreadM: number | null;
  total: number | null;
  occupied: number | null;
  /** 총 면수 − 현재 대수. 연계가 없거나 값이 이상하면 null — 추측하지 않는다 */
  free: number | null;
  updatedAt: number | null;
  linked: boolean;
  hours: { weekday: Hours; weekend: Hours; holiday: Hours };
  basicFee: { won: number; minutes: number } | null;
  evidence: "LIVE_API" | "MOCK";
  retrievedAt: number;
};

const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const HHMM = /^\d{4}$/;
const hours = (b: string | undefined, e: string | undefined): Hours => (b && e && HHMM.test(b) && HHMM.test(e) ? { begin: b, end: e } : null);

/** "2026-11-11 18:16:43"(한국 시간) → epoch ms. 형식이 다르면 null */
export function parseSeoulTime(s: string | undefined): number | null {
  const m = s?.trim().match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number);
  const t = Date.UTC(y, mo - 1, d, h - 9, mi, se);
  return Number.isFinite(t) ? t : null;
}

/** 서울 범위 밖 · 0 좌표는 좌표가 아니다 */
const SEOUL = { latMin: 37.41, latMax: 37.72, lonMin: 126.76, lonMax: 127.19 };
export function validSeoulPoint(lat: number | null, lon: number | null): GeoPoint | null {
  if (lat === null || lon === null) return null;
  return lat >= SEOUL.latMin && lat <= SEOUL.latMax && lon >= SEOUL.lonMin && lon <= SEOUL.lonMax ? { lat, lon } : null;
}

export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const r = 6_371_000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** 실시간 한 행 + 같은 주차장 코드의 정보 행들 → ParkingFact. 코드·이름이 없으면 null */
export function normalizeParking(rt: Record<string, string>, info: Record<string, string>[], retrievedAt: number, evidence: "LIVE_API" | "MOCK"): ParkingFact | null {
  const id = rt.PKLT_CD?.trim(), name = rt.PKLT_NM?.trim();
  if (!id || !name) return null;
  const pts = info.map((r) => validSeoulPoint(num(r.LAT), num(r.LOT))).filter((p): p is GeoPoint => p !== null);
  const point = pts.length ? { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lon: pts.reduce((a, p) => a + p.lon, 0) / pts.length } : null;
  const spreadM = point && pts.length ? Math.round(Math.max(...pts.map((p) => distanceM(point, p)))) : null;
  const linked = rt.PRK_STTS_YN?.trim() === "1";
  const total = num(rt.TPKCT), occupied = num(rt.NOW_PRK_VHCL_CNT);
  const free = linked && total !== null && occupied !== null && total > 0 && occupied >= 0 && occupied <= total ? total - occupied : null;
  const type = rt.PKLT_TYPE?.trim();
  const fee = num(rt.BSC_PRK_CRG), feeMin = num(rt.BSC_PRK_HR);
  return {
    id, name, address: rt.ADDR?.trim() ?? "",
    kind: type === "NW" ? "OFF_STREET" : type === "NS" ? "ON_STREET" : "OTHER",
    point, spreadM, total, occupied, free,
    updatedAt: linked ? parseSeoulTime(rt.NOW_PRK_VHCL_UPDT_TM) : null,
    linked,
    hours: { weekday: hours(rt.WD_OPER_BGNG_TM, rt.WD_OPER_END_TM), weekend: hours(rt.WE_OPER_BGNG_TM, rt.WE_OPER_END_TM), holiday: hours(rt.LHLDY_OPER_BGNG_TM, rt.LHLDY_OPER_END_TM) },
    basicFee: fee !== null && feeMin !== null && feeMin > 0 ? { won: fee, minutes: feeMin } : null,
    evidence, retrievedAt,
  };
}

/** 실시간 행 전체 + 정보 행 전체 → 주차장 목록(코드로 결합) */
export function joinParking(realtime: Record<string, string>[], info: Record<string, string>[], retrievedAt: number, evidence: "LIVE_API" | "MOCK"): ParkingFact[] {
  const byCode = new Map<string, Record<string, string>[]>();
  for (const r of info) { const k = r.PKLT_CD?.trim(); if (k) byCode.set(k, [...(byCode.get(k) ?? []), r]); }
  const seen = new Set<string>();
  const out: ParkingFact[] = [];
  for (const r of realtime) {
    const p = normalizeParking(r, byCode.get(r.PKLT_CD?.trim() ?? "") ?? [], retrievedAt, evidence);
    if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
  }
  return out;
}

// ── 주차 적합성(Gate D) ───────────────────────────────────
export const PARKING_FRESH_MIN = 20;
export const PARKING_AGING_MIN = 120;
export type SpaceShown = "SPACES_SHOWN" | "FULL_SHOWN" | "UNKNOWN";
export type SpaceFact = { shown: SpaceShown; freshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN"; ageMin: number | null };

/** 빈자리 표시를 판단에 쓸 수 있나 — 20분 안의 연계 값만. 그 밖은 '모름'(대수를 판단에 쓰지 않는다) */
export function spaceFact(p: ParkingFact, now: number): SpaceFact {
  if (!p.linked || p.free === null || p.updatedAt === null) return { shown: "UNKNOWN", freshness: "UNKNOWN", ageMin: null };
  const age = ageMinutes(p.updatedAt, now);
  if (age === null) return { shown: "UNKNOWN", freshness: "UNKNOWN", ageMin: null };
  if (age > PARKING_AGING_MIN) return { shown: "UNKNOWN", freshness: "STALE", ageMin: age };
  if (age > PARKING_FRESH_MIN) return { shown: "UNKNOWN", freshness: "AGING", ageMin: age };
  return { shown: p.free > 0 ? "SPACES_SHOWN" : "FULL_SHOWN", freshness: "FRESH", ageMin: age };
}

const KST = 9 * 3_600_000;
const hhmm = (ms: number) => new Date(ms + KST).toISOString().slice(11, 16);
const minuteOfDay = (ms: number) => { const d = new Date(ms + KST); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(2));

/**
 * 그 시각에 운영하나 — 토·일은 주말 시간, 그 밖은 평일 시간. 공휴일은 이 데이터로 알 수 없어 평일로 본다(한계).
 * 시간이 없으면 null(모름). 자정을 넘는 운영(예: 2200~0600)도 다룬다
 */
export function isOpenAt(p: ParkingFact, at: number): boolean | null {
  const dow = new Date(at + KST).getUTCDay();
  const h = dow === 0 || dow === 6 ? p.hours.weekend : p.hours.weekday;
  if (!h) return null;
  const b = toMin(h.begin), e = toMin(h.end), m = minuteOfDay(at);
  if (b === e || (b === 0 && e >= 1440)) return true;
  return b < e ? m >= b && m < e : m >= b || m < e;
}

// ── 소요 시간(내비 requestTrip) ───────────────────────────
export type TripEstimate = { parkingId: string; seconds: number | null; meters: number | null; retrievedAt: number; source: "NAVI" | "MOCK" };

/** 판단에 쓸 수 있는 소요 시간인가 — 없거나 0 이거나 거리와 맞지 않으면 쓰지 않는다 */
export function tripProblem(t: TripEstimate | undefined): string | null {
  if (!t || t.seconds === null) return "내비 소요 시간을 받지 못했어요";
  if (t.seconds <= 0) return "내비 소요 시간이 0으로 왔어요";
  if (t.meters !== null && t.meters > 2_000) {
    const kmh = (t.meters / 1000) / (t.seconds / 3600);
    if (kmh > 150 || kmh < 3) return "내비 소요 시간이 거리와 맞지 않아요";
  }
  return null;
}

// ── 1. 방문 가능성 ────────────────────────────────────────
/** 내비 소요 시간은 그대로 쓴다(보정하지 않음). 교통 반영 여부를 몰라 분류에만 불확실성 폭을 둔다 — 가설 */
export const ETA_UNCERTAINTY = { ratio: 0.15, minMinutes: 5 };
export const ENOUGH_SLACK_MIN = 10;
export type Feasibility = "ENOUGH" | "TIGHT" | "AT_RISK" | "UNKNOWN";
export type Slack = { low: number; high: number };

/** 남는 시간(분)의 범위 — high = 약속 − 지금 − 소요 − 여유, low = high − 불확실성 폭 */
export function slackOf(goal: ArriveGoal, now: number, etaSec: number | null): Slack | null {
  if (goal.appointmentAt === null || goal.bufferMin === null || etaSec === null) return null;
  const eta = etaSec / 60;
  const high = (goal.appointmentAt - now) / 60_000 - eta - goal.bufferMin;
  const low = high - Math.max(ETA_UNCERTAINTY.minMinutes, eta * ETA_UNCERTAINTY.ratio);
  return { low: Math.round(low), high: Math.round(high) };
}
export function feasibilityOf(s: Slack | null): Feasibility {
  if (!s) return "UNKNOWN";
  if (s.low >= ENOUGH_SLACK_MIN) return "ENOUGH";
  if (s.high >= 0) return "TIGHT";
  return "AT_RISK";
}

// ── 3. 행동 결정 ──────────────────────────────────────────
export const MAX_WALK_M = 800;
export const PLENTY_SPACES = 10;

export type ArriveCandidate = {
  parking: ParkingFact;
  space: SpaceFact;
  distanceM: number;
  etaSec: number | null;
  slack: Slack | null;
  feasibility: Feasibility;
  /** 확정 추천에서 뺀 이유(확인 필요) — null 이면 추천 가능 */
  problem: string | null;
};
/**
 * 결과 종류 — '정보를 못 받음'과 '맞는 후보가 없음'을 섞지 않는다(평가 2026-11-11: 연결 실패를 '없다'로 말하면 잘못 읽힌다).
 *  RECOMMEND            확인된 조건으로 하나(방문지 400m 안)
 *  RECOMMEND_WITH_CHECK 가장 나은 후보가 방문지에서 멀다 — 걸어가는 시간이 여유 안에 드는지 사용자가 확인해야 한다
 *  NO_FIT               정상 조회했지만 약속에 맞는 후보가 없다(가장 빠른 후보는 보여 준다)
 *  DATA_STALE           주차 빈자리 정보가 오래됐거나 없다 — 최신 상태를 확인해야 한다
 *  DATA_FAILED          주차 정보 또는 내비 소요 시간을 받지 못했다
 *  NEEDS_INPUT          약속 · 위치 · 여유 · 확인이 없다
 */
export type ArriveDecisionKind = "NEEDS_INPUT" | "RECOMMEND" | "RECOMMEND_WITH_CHECK" | "NO_FIT" | "DATA_STALE" | "DATA_FAILED";
export type ArriveDecision = {
  kind: ArriveDecisionKind;
  headline: string;
  missing: string[];
  top: ArriveCandidate | null;
  /** 추천보다 순위는 앞서지만 방문지에서 멀어 확인이 필요한 후보 — 차로는 더 빠르다(세종로·동국제강 사례) */
  fasterButFar: ArriveCandidate | null;
  /** 맞는 후보가 없을 때 가장 빨리 닿는 후보 — 사용자가 직접 확인하거나 약속을 조정하도록 */
  fastest: ArriveCandidate | null;
  alternatives: ArriveCandidate[];
  needsCheck: ArriveCandidate[];
  excluded: { id: string; name: string; reason: string }[];
};
/** feed — 주차 정보 조회 결과. 실패면 후보가 없다고 하지 않고 '확인하지 못했어요' */
export type ArriveInput = { goal: ArriveGoal; now: number; parkings: ParkingFact[]; trips: TripEstimate[]; feed?: { ok: boolean; reason: string | null } };

const feasRank: Record<Feasibility, number> = { ENOUGH: 0, TIGHT: 1, AT_RISK: 2, UNKNOWN: 3 };
/** 사전식 순위 — 앞 기준이 같을 때만 다음을 본다. 어느 기준에서 갈렸는지 그대로 말한다(decisiveReason) */
const KEYS: { id: string; of: (c: ArriveCandidate) => number }[] = [
  { id: "FEASIBILITY", of: (c) => feasRank[c.feasibility] },
  { id: "SPACES", of: (c) => ((c.parking.free ?? 0) >= PLENTY_SPACES ? 0 : 1) },
  { id: "SLACK", of: (c) => -(c.slack?.high ?? -9999) },
  { id: "DISTANCE", of: (c) => Math.round(c.distanceM / 50) },
];
const compare = (a: ArriveCandidate, b: ArriveCandidate) => {
  for (const k of KEYS) { const d = k.of(a) - k.of(b); if (d !== 0) return d; }
  return a.parking.id < b.parking.id ? -1 : a.parking.id > b.parking.id ? 1 : 0;
};

export function decideArrive(i: ArriveInput): ArriveDecision {
  const missing = goalMissing(i.goal, i.now);
  const empty = { top: null, fasterButFar: null, fastest: null, alternatives: [], needsCheck: [], excluded: [] };
  if (missing.length) return { kind: "NEEDS_INPUT", headline: `${missing.join(" · ")}을(를) 알려 주시면 주차와 도착을 함께 볼게요`, missing, ...empty };
  if (i.feed && !i.feed.ok) return { kind: "DATA_FAILED", headline: `주차장 정보를 확인하지 못했어요${i.feed.reason ? ` · ${i.feed.reason}` : ""}`, missing: [], ...empty };
  const dest = i.goal.place.point!;
  const trips = new Map(i.trips.map((t) => [t.parkingId, t]));
  const excluded: ArriveDecision["excluded"] = [];
  const cands: ArriveCandidate[] = [];
  for (const p of i.parkings) {
    if (!p.point) { excluded.push({ id: p.id, name: p.name, reason: "위치를 몰라요" }); continue; }
    const d = distanceM(p.point, dest);
    if (d > MAX_WALK_M) { excluded.push({ id: p.id, name: p.name, reason: `방문지에서 ${MAX_WALK_M}m 밖` }); continue; }
    const t = trips.get(p.id);
    const tp = tripProblem(t);
    const etaSec = tp ? null : t!.seconds;
    const arriveAt = etaSec === null ? null : i.now + etaSec * 1000;
    if (arriveAt !== null && isOpenAt(p, arriveAt) === false) { excluded.push({ id: p.id, name: p.name, reason: "도착 예정 시각에 운영하지 않아요" }); continue; }
    const space = spaceFact(p, i.now);
    const slack = slackOf(i.goal, i.now, etaSec);
    const feasibility = feasibilityOf(slack);
    const problem = tp
      ?? (space.shown === "FULL_SHOWN" ? `만차로 표시돼 있어요(${hhmm(p.updatedAt!)} 기준)`
        : space.shown === "UNKNOWN" ? (space.freshness === "UNKNOWN" ? "빈자리 정보가 없어요" : "빈자리 정보가 오래됐어요")
        : feasibility === "AT_RISK" ? "이 주차장으로는 약속 시간을 맞추기 어려울 수 있어요"
        : isOpenAt(p, arriveAt!) === null ? "운영시간을 확인하지 못했어요" : null);
    cands.push({ parking: p, space, distanceM: Math.round(d), etaSec, slack, feasibility, problem });
  }
  const ok = cands.filter((c) => c.problem === null).sort(compare);
  const needsCheck = cands.filter((c) => c.problem !== null).sort(compare);
  const base = { missing: [], needsCheck, excluded };
  if (!ok.length) {
    if (!cands.length) return { ...base, ...empty, needsCheck, excluded, kind: "NO_FIT", headline: `방문지 ${MAX_WALK_M}m 안에서 확인된 주차장이 없어요` };
    if (cands.every((c) => c.etaSec === null)) return { ...base, ...empty, needsCheck, excluded, kind: "DATA_FAILED", headline: "내비 소요 시간을 받지 못해 판단을 보류해요" };
    if (cands.every((c) => c.space.shown === "UNKNOWN")) return { ...base, ...empty, needsCheck, excluded, kind: "DATA_STALE", headline: "주차장 빈자리 정보를 최신으로 확인해야 해요" };
    const fastest = [...cands].filter((c) => c.etaSec !== null).sort((a, b) => a.etaSec! - b.etaSec!)[0] ?? null;
    return { ...base, ...empty, needsCheck, excluded, fastest, kind: "NO_FIT", headline: "확인된 주차장 중 약속 시간에 맞춰 방문할 여유가 있는 후보를 찾지 못했어요" };
  }
  // 방문지 가까운(400m 안) 후보가 먼저 — 차로 빠른 것만으로 방문 목표에 맞다고 확정하지 않는다. 먼 후보가 순위상 앞서면 '확인 필요'로 따로 보인다
  const near = ok.filter((c) => c.distanceM < FAR_WALK_M);
  const far = ok.filter((c) => c.distanceM >= FAR_WALK_M);
  if (near.length) {
    const top = near[0];
    const fasterButFar = far.length && compare(far[0], top) < 0 ? far[0] : null;
    const alternatives = [...near.slice(1), ...far.filter((c) => c !== fasterButFar)].sort(compare).slice(0, 2);
    const headline = top.feasibility === "ENOUGH" ? `${top.parking.name}에 세우면 약속 시간에 맞출 수 있어 보여요` : `${top.parking.name}이(가) 가장 낫지만 빠듯해요`;
    return { ...base, kind: "RECOMMEND", headline, top, fasterButFar, fastest: null, alternatives };
  }
  const top = far[0];
  return {
    ...base, kind: "RECOMMEND_WITH_CHECK", top, fasterButFar: null, fastest: null, alternatives: far.slice(1, 3),
    headline: `${top.parking.name}이(가) 가장 낫지만 방문지까지 직선 약 ${Math.round(top.distanceM / 10) * 10}m — 걸어가는 시간 확인이 필요해요`,
  };
}

/** 차로는 더 빠르지만 먼 후보를 왜 1순위로 두지 않았는지 — 도보 시간은 계산하지 않는다 */
export function fasterButFarNote(top: ArriveCandidate, f: ArriveCandidate, bufferMin: number): string {
  const faster = top.etaSec !== null && f.etaSec !== null ? Math.round((top.etaSec - f.etaSec) / 60) : null;
  return `${f.parking.name}은(는) ${faster !== null && faster > 0 ? `차로 약 ${faster}분 빠르지만` : "약속 여유는 더 있지만"} 방문지까지 직선 약 ${Math.round(f.distanceM / 10) * 10}m — 걸어가는 시간이 여유 ${bufferMin}분 안에 드는지 확인이 필요해요`;
}

/**
 * 가까운 추천과 차로 빠른 먼 후보의 맞교환을 한 문장으로(오너 2026-11-12) — 거리 기준이 아니라 사용자가 고를 사실을 말한다:
 * "가까운 곳은 차량 이동 여유가 적고, 먼 곳은 차로 빠르지만 주차 후 이동을 더 확인해야 한다". 도보 시간 · 도착 때 빈자리는 만들지 않는다
 */
export function arriveTradeoff(top: ArriveCandidate, far: ArriveCandidate): string {
  const left = (c: ArriveCandidate) => (c.slack ? `${Math.max(c.slack.low, 0)}~${c.slack.high}분` : "확인 전");
  const faster = top.etaSec !== null && far.etaSec !== null ? Math.round((top.etaSec - far.etaSec) / 60) : null;
  const m = (c: ArriveCandidate) => `약 ${Math.round(c.distanceM / 10) * 10}m`;
  return `${top.parking.name}은(는) 방문지와 가깝지만(${m(top)}) 남는 시간이 ${left(top)}이고, ${far.parking.name}은(는) ${faster !== null && faster > 0 ? `차로 약 ${faster}분 빠르지만` : "여유는 더 있지만"} 방문지까지 ${m(far)}라 주차 후 이동을 확인해야 해요`;
}

/** 약속 − 지금 − 소요 − 여유 = 남는 시간. 판단 계산값 그대로(화면이 새로 계산하지 않는다) */
export function arriveBudgetLine(i: ArriveInput, c: ArriveCandidate | null): string | null {
  if (!c || !c.slack || c.etaSec === null || i.goal.appointmentAt === null || i.goal.bufferMin === null) return null;
  const s = c.slack;
  const left = s.high < 0 ? `약 ${-s.high}~${-s.low}분 모자람` : s.low < 0 ? `약 0~${s.high}분 남음` : `약 ${s.low}~${s.high}분 남음`;
  return `약속 ${hhmm(i.goal.appointmentAt)} − 지금 ${hhmm(i.now)} − 주차장까지 약 ${Math.round(c.etaSec / 60)}분(내비) − 주차 후 여유 ${i.goal.bufferMin}분(직접 설정) → ${left} · 추정`;
}

/** 추천과 대안을 처음 가른 기준 하나 — 이름순으로만 갈렸으면 null */
export function arriveDecisiveReason(top: ArriveCandidate, other: ArriveCandidate): string | null {
  for (const k of KEYS) {
    if (k.of(top) === k.of(other)) continue;
    // 앞선 쪽이 이 기준에서 실제로 나을 때만 이유로 말한다 — 가까운 후보 우선 규칙으로 앞선 경우 '약 -6분 많아요' 같은 문장을 만들지 않는다(E32 보완 2회차)
    if (k.of(top) > k.of(other)) return null;
    switch (k.id) {
      case "FEASIBILITY": return `약속까지 여유가 ${other.parking.name}보다 커요`;
      case "SPACES": return `표시된 빈자리가 ${PLENTY_SPACES}면 이상이에요(${other.parking.name}은 ${other.parking.free ?? 0}면)`;
      case "SLACK": return `도착 후 남는 시간이 ${other.parking.name}보다 약 ${(top.slack?.high ?? 0) - (other.slack?.high ?? 0)}분 많아요`;
      case "DISTANCE": return `방문지에 ${other.parking.name}보다 약 ${Math.round((other.distanceM - top.distanceM) / 10) * 10}m 가까워요`;
    }
  }
  return null;
}

/**
 * 방문지까지 이만큼 떨어지면 걷는 시간이 여유 안에 드는지 사용자에게 묻는다 — 도보 시간은 계산하지 않는다(가설값).
 * **방문 가능 여부의 절대 기준이 아니다**(오너 2026-11-12) — '확인 필요 수준'을 나누는 임시 경계. 390m 와 410m 는 둘 다 화면에 남는다(경계 회귀 테스트)
 */
export const FAR_WALK_M = 400;

/**
 * 이 추천에 남은 불확실성 — 화면에 늘 붙인다.
 * 실데이터(2026-11-11): 775m 떨어진 곳이 소요 시간 8분 차이로 180m 곳보다 앞섰다 — 순위는 그대로 두되 거리를 숨기지 않는다
 */
export function arriveCaveats(c: ArriveCandidate, bufferMin: number): string[] {
  const out = [`빈자리 ${c.parking.free}면 표시 · ${c.parking.updatedAt !== null ? hhmm(c.parking.updatedAt) : "—"} 기준 — 도착할 때도 있는지는 몰라요`];
  out.push("소요 시간은 내비 예상 그대로 · 실시간 교통 반영 여부는 확인 전");
  if (c.distanceM >= FAR_WALK_M) out.push(`방문지까지 직선 약 ${Math.round(c.distanceM / 10) * 10}m — 걸어가는 시간이 여유 ${bufferMin}분 안에 드는지 확인해 주세요`);
  if (c.parking.kind === "ON_STREET" && (c.parking.spreadM ?? 0) >= 300) out.push("노상 주차장이라 위치 범위가 넓어요 — 진입 위치를 확인해 주세요");
  else out.push("주차장 위치는 대표 좌표 — 진입구와 다를 수 있어요");
  return out;
}

// ── 7. 다시 판단(JOURNEY RECOVERY) ─────────────────────────
/**
 * 이미 승인해 내비에 보낸 주차장(routedId)이 있을 때, 새 판단을 알릴지 — **결과가 의미 있게 달라질 때만**(ArriveReady.recovery 거울).
 *  · 보낸 주차장이 더 이상 확정 추천 조건을 못 맞춘다(만차 표시 · 운영 종료 · 약속 맞추기 어려움 · 정보 끊김) → 알리고, 대안이 있으면 하나
 *  · 보낸 주차장은 괜찮은데 다른 곳이 여유 등급이 한 단계 이상 좋아졌다 → 알림(바꿀지는 사용자)
 *  · 대수·소요 시간이 조금 바뀐 것만으로는 알리지 않는다
 * 경로를 스스로 바꾸지 않는다 — 제안만. 주행 중이면 화면 쪽에서 정차까지 미룬다(Safety Gate)
 */
export type ArriveRecovery = { notify: boolean; reason: string | null; suggestion: ArriveCandidate | null };
export function arriveRecovery(next: ArriveDecision, routedId: string | null): ArriveRecovery {
  const quiet = { notify: false, reason: null, suggestion: null };
  if (!routedId) return quiet;
  const routed = [next.top, next.fasterButFar, ...next.alternatives].find((c) => c?.parking.id === routedId) ?? null;
  const routedProblem = next.needsCheck.find((c) => c.parking.id === routedId)?.problem
    ?? next.excluded.find((e) => e.id === routedId)?.reason
    ?? (next.kind === "DATA_FAILED" || next.kind === "DATA_STALE" ? next.headline : null);
  const better = next.top && next.top.parking.id !== routedId ? next.top : null;
  if (!routed && routedProblem) {
    // 정보를 못 받은 것을 '바뀌었다'고 말하지 않는다(D7 과 같은 종류) — 조회 실패는 실패로, 경로는 그대로라고
    const dataOnly = !next.needsCheck.some((c) => c.parking.id === routedId) && !next.excluded.some((e) => e.id === routedId);
    return { notify: true, reason: dataOnly ? `${routedProblem} · 안내 중인 경로는 그대로예요` : `안내 중인 주차장 · ${routedProblem}`, suggestion: better };
  }
  if (routed && better && feasRank[better.feasibility] < feasRank[routed.feasibility]) {
    return { notify: true, reason: `${better.parking.name}이(가) 약속까지 여유가 더 있어요 · 지금 안내 중인 곳도 쓸 수 있어요`, suggestion: better };
  }
  return quiet;
}

/**
 * 실행 중인 계획 기준의 판단(오너 2026-11-13, E32-22) — `ArriveReady.planStatus` 의 거울.
 * 세 가지를 섞지 않는다: **지금 정보로 고르면 가장 나은 후보**(best) · **사용자가 승인해 내비에서 확인된 계획**(routed) · **그 계획을 바꿀 필요**(change).
 * 경로가 이미 설정됐으면 화면의 주 문장은 change 로 만든다 — 1순위가 바뀐 것만으로 바꾸라고 하거나 다시 승인을 받지 않는다.
 * '유지해도 괜찮다'는 안내 중인 곳이 이번 판단에서 **추천 가능 후보로 확인됐을 때만** 쓴다. 정보가 없으면 '판단할 정보가 부족해요'.
 * 판단 규칙(decideArrive · arriveRecovery)은 그대로 — 표시 계층만 나눈다.
 */
export type PlanChange = "NO_PLAN" | "KEEP" | "KEEP_TIGHT" | "SUGGEST_CHANGE" | "ROUTED_PROBLEM" | "CANNOT_JUDGE";
export type ArrivePlanStatus = {
  change: PlanChange;
  headline: string;
  detail: string | null;
  /** 안내 중인 주차장이 이번 판단에서 추천 가능으로 남았으면 그 후보 */
  routed: ArriveCandidate | null;
  /** 안내 중인 곳과 다른, 지금 정보의 1순위 — 상세에서 '다른 적합 후보'로만 */
  best: ArriveCandidate | null;
  recovery: ArriveRecovery;
};

export function arrivePlanStatus(next: ArriveDecision, routedId: string | null, routedName: string | null): ArrivePlanStatus {
  const recovery = arriveRecovery(next, routedId);
  if (!routedId) return { change: "NO_PLAN", headline: next.headline, detail: null, routed: null, best: next.top, recovery };
  const name = routedName ?? "안내 중인 주차장";
  const routed = [next.top, next.fasterButFar, ...next.alternatives].find((c) => c?.parking.id === routedId) ?? null;
  const best = next.top && next.top.parking.id !== routedId ? next.top : null;
  const inData = next.needsCheck.some((c) => c.parking.id === routedId) || next.excluded.some((e) => e.id === routedId);
  const dataProblem = next.kind === "DATA_FAILED" || next.kind === "DATA_STALE";
  const base = { routed, best, recovery };
  if (!routed && !inData) {
    return { ...base, change: "CANNOT_JUDGE", headline: "지금은 판단할 정보가 부족해요 · 안내 중인 경로는 그대로예요",
      detail: dataProblem ? next.headline : `안내 중인 ${name}을(를) 이번 정보에서 확인하지 못했어요` };
  }
  // 안내 중인 곳의 빈자리 · 소요 시간을 모르는 것은 '문제가 생겼다'가 아니라 '판단할 정보가 부족하다'
  const routedCheck = next.needsCheck.find((c) => c.parking.id === routedId);
  if (!routed && routedCheck && (routedCheck.space.shown === "UNKNOWN" || routedCheck.etaSec === null)) {
    return { ...base, change: "CANNOT_JUDGE", headline: "지금은 판단할 정보가 부족해요 · 안내 중인 경로는 그대로예요", detail: `${name} · ${routedCheck.problem}` };
  }
  if (recovery.notify && recovery.suggestion) {
    return { ...base, change: "SUGGEST_CHANGE", headline: routed ? "지금 경로도 쓸 수 있지만 바꾸면 여유가 더 있어요" : "안내 중인 주차장을 바꾸는 것이 좋아 보여요", detail: recovery.reason };
  }
  if (!routed) return { ...base, change: "ROUTED_PROBLEM", headline: "안내 중인 주차장에 문제가 있지만 바꿀 만한 후보를 찾지 못했어요", detail: recovery.reason };
  const tight = routed.feasibility !== "ENOUGH";
  return { ...base, change: tight ? "KEEP_TIGHT" : "KEEP",
    headline: tight ? "지금 경로로 갈 수 있지만 빠듯해요" : "지금 경로를 유지해도 괜찮아 보여요",
    detail: `안내 중 · ${name} · 지금 확인된 정보로는 경로를 바꿀 이유가 없어요` };
}
