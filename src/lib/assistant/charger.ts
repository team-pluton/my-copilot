/**
 * 충전기 데이터 정규화 · 충전소 평가 — 한국환경공단 전기자동차 충전소 정보(data.go.kr 15076352). core/assistant/ChargerData.kt 의 거울.
 *
 * 공식 명세에서 확인(2026-11-04): 정보 오퍼레이션 statNm·statId·chgerId·chgerType·addr·lat·lng·useTime·busiId·busiNm·stat·statUpdDt·powerType·zcode·parkingFree·note ·
 * 상태 오퍼레이션 busiId·statId·chgerId·stat·statUpdDt + 요청 변수 period(1~10분).
 *  · 상태 오퍼레이션은 **최근 period 분 안에 바뀐 것만** 준다 → 전체 상태는 정보 오퍼레이션, 그 뒤 증분을 합친다
 *  · statUpdDt 는 **상태가 바뀐 일시**다 → 오래됐다고 곧 못 믿을 값은 아니다. 조회 시각(retrievedAt)과 따로 본다
 *
 * 코드표는 **OpenAPI 활용가이드 v1.25 부록**(data.go.kr 15076352 참고문서, 2026-11-10 대조)과 맞췄다(CODE_TABLE_VERIFIED).
 *  · stat: 0 알수없음 · 1 통신이상 · 2 충전대기 · 3 충전중 · 4 운영중지 · 5 점검중 · 6 예약중 · 9 상태미확인
 *    → 0·6·9 는 UNKNOWN(확인 필요). 예약중을 '사용 가능'으로 보지 않는다 — 지금 쓸 수 있다는 근거가 아니다.
 *  · chgerType 11 은 DC콤보2(**버스전용**) → 승용차와 맞는 규격 없음(빈 배열, '모름'이 아니라 '안 맞음').
 * 표에 없는 코드는 UNKNOWN/null — 추측으로 사용 가능이나 규격 일치로 만들지 않는다.
 */
import type { Evidence, Freshness } from "./journey-fact";
import { freshnessOf } from "./journey-fact";

export const CODE_TABLE_VERIFIED = true;

export type ChargerStatus = "AVAILABLE" | "CHARGING" | "OUT_OF_SERVICE" | "MAINTENANCE" | "COMM_ERROR" | "UNKNOWN";
const STAT: Record<string, ChargerStatus> = { "1": "COMM_ERROR", "2": "AVAILABLE", "3": "CHARGING", "4": "OUT_OF_SERVICE", "5": "MAINTENANCE", "9": "UNKNOWN" };
export const statusOf = (stat: string | undefined): ChargerStatus => (stat != null && STAT[stat.trim()]) || "UNKNOWN";

export type Connector = "DC_COMBO" | "DC_CHADEMO" | "AC3" | "AC_SLOW" | "NACS";
const TYPE: Record<string, Connector[]> = {
  "01": ["DC_CHADEMO"], "02": ["AC_SLOW"], "03": ["DC_CHADEMO", "AC3"], "04": ["DC_COMBO"], "05": ["DC_CHADEMO", "DC_COMBO"],
  "06": ["DC_CHADEMO", "AC3", "DC_COMBO"], "07": ["AC3"], "08": ["DC_COMBO"], "09": ["NACS"], "10": ["DC_COMBO", "NACS"],
  "11": [], // DC콤보2(버스전용) — 승용차 규격 아님
};
/** null = 표에 없는 코드(모름). 빈 배열이 아니다 — '모름'과 '안 맞음'을 합치지 않는다 */
export const connectorsOf = (t: string | undefined): Connector[] | null => (t != null && TYPE[t.trim()]) || null;

/** "급속(100kWh동시)" 처럼 온다. 명세가 kWh 로 적지만 뜻은 출력이다. 숫자가 없으면 null — 만들지 않는다 */
export function outputKwOf(powerType: string | undefined): number | null {
  const m = powerType?.match(/(\d+(?:\.\d+)?)\s*k[wW]/);
  if (!m) return null;
  const kw = Number(m[1]);
  return Number.isFinite(kw) && kw > 0 ? kw : null;
}

/** yyyyMMddHHmmss(한국 시간) → epoch ms. 형식이 다르거나 없는 날짜면 null */
export function parseKst(s: string | undefined): number | null {
  if (!s) return null;
  const t = s.trim();
  if (!/^\d{14}$/.test(t)) return null;
  const n = (a: number, b: number) => Number(t.slice(a, b));
  const [y, mo, d, h, mi, se] = [n(0, 4), n(4, 6), n(6, 8), n(8, 10), n(10, 12), n(12, 14)];
  const ms = Date.UTC(y, mo - 1, d, h - 9, mi, se);
  const back = new Date(ms + 9 * 3_600_000);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || back.getUTCHours() !== h || back.getUTCMinutes() !== mi || back.getUTCSeconds() !== se) return null;
  return ms;
}

export type ChargerRecord = {
  stationId: string;
  chargerId: string;
  stationName: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  operator: string | null;
  connectors: Connector[] | null;
  outputKw: number | null;
  availabilityStatus: ChargerStatus;
  statusUpdatedAt: number | null;
  retrievedAt: number;
  availableHours: string | null;
  /** 명세의 note(이용 제한·주차요금 안내) 원문. 별도 제한 필드가 없다 */
  accessRestrictions: string | null;
  /** Y 무료 · N 유료 · 값 없음 = 현장 확인 */
  parkingFree: boolean | null;
  source: string;
  evidenceType: Evidence;
};

export const CHARGER_SOURCE = "한국환경공단 전기자동차 충전소 정보";
const blank = (v: string | undefined) => { const t = v?.trim(); return t ? t : null; };
const coord = (v: string | undefined, max: number) => {
  const t = blank(v);
  if (t == null) return null;
  const n = Number(t);
  return Number.isFinite(n) && Math.abs(n) <= max && Math.abs(n) > 1e-6 ? n : null;
};

/** 필수 식별자(statId·chgerId)가 없는 행은 버린다 — 어느 충전기인지 모르는 상태는 어디에도 쓸 수 없다 */
export function normalizeCharger(raw: Record<string, string | undefined>, retrievedAt: number, evidence: Evidence, source = CHARGER_SOURCE): ChargerRecord | null {
  const stationId = blank(raw.statId);
  const chargerId = blank(raw.chgerId);
  if (!stationId || !chargerId) return null;
  const pf = blank(raw.parkingFree)?.toUpperCase();
  return {
    stationId, chargerId,
    stationName: blank(raw.statNm) ?? stationId,
    latitude: coord(raw.lat, 90), longitude: coord(raw.lng, 180),
    address: blank(raw.addr), operator: blank(raw.busiNm),
    connectors: connectorsOf(raw.chgerType),
    outputKw: outputKwOf(raw.powerType),
    availabilityStatus: statusOf(raw.stat),
    statusUpdatedAt: parseKst(raw.statUpdDt),
    retrievedAt,
    availableHours: blank(raw.useTime),
    accessRestrictions: blank(raw.note),
    parkingFree: pf === "Y" ? true : pf === "N" ? false : null,
    source, evidenceType: evidence,
  };
}

export const chargerKey = (r: { stationId: string; chargerId: string }) => `${r.stationId}/${r.chargerId}`;

/** 같은 충전기가 여러 번 오면(페이지 경계 등) 상태가 더 최근인 것 하나만. 다른 충전소의 같은 chgerId 와 섞이지 않게 항상 쌍으로 묶는다 */
export function dedupeChargers(rows: ChargerRecord[]): ChargerRecord[] {
  const out = new Map<string, ChargerRecord>();
  for (const r of rows) {
    const k = chargerKey(r);
    const cur = out.get(k);
    if (!cur || (r.statusUpdatedAt ?? -1) >= (cur.statusUpdatedAt ?? -1)) out.set(k, r);
  }
  return [...out.values()];
}

/** 상태 오퍼레이션의 증분을 합친다 — 더 오래된 변화로 덮지 않고, 모르는 충전기를 새로 만들지 않는다 */
export function applyStatusDelta(rows: ChargerRecord[], deltas: Record<string, string | undefined>[], retrievedAt: number, evidence: Evidence): ChargerRecord[] {
  const byKey = new Map<string, Record<string, string | undefined>>();
  for (const d of deltas) if (d.statId && d.chgerId) byKey.set(`${d.statId.trim()}/${d.chgerId.trim()}`, d);
  return rows.map((r) => {
    const d = byKey.get(chargerKey(r));
    if (!d) return { ...r, retrievedAt, evidenceType: evidence };
    const at = parseKst(d.statUpdDt);
    if (at != null && r.statusUpdatedAt != null && at < r.statusUpdatedAt) return { ...r, retrievedAt, evidenceType: evidence };
    return { ...r, availabilityStatus: statusOf(d.stat), statusUpdatedAt: at ?? r.statusUpdatedAt, retrievedAt, evidenceType: evidence };
  });
}

/** 사용 가능 표시가 이만큼 안 바뀌면 고장·통신 문제를 의심한다. 가설 — G1 수집으로 맞춘다 */
export const UNCHANGED_SUSPECT_HOURS = 72;
/** note 원문에 이 말이 있으면 사람이 읽어야 한다. 뜻을 앱이 단정하지 않고 '확인 필요'로 둔다 */
const RESTRICTION_WORDS = /불가|폐쇄|공사|중단|고장|입주민|관계자|직원|전용|제한/;

export type StationVerdict = "USABLE" | "NEEDS_CHECK" | "EXCLUDED";
export type StationAssessment = {
  stationIds: string[];
  verdict: StationVerdict;
  reason: string;
  compatibleCount: number;
  availableCount: number;
  chargingCount: number;
  /** 규격이 맞는 충전기의 최대 출력. 모르면 null */
  maxKw: number | null;
  freshness: Freshness;
  retrievedAt: number | null;
  /** 규격이 맞는 충전기 중 가장 최근 상태 변화 */
  statusChangedAt: number | null;
  evidence: Evidence;
  restriction: string | null;
};

/** 판단의 재료 하나 — 충전소 묶음(한 휴게소에 여러 운영사가 있을 수 있다). stationIds 밖의 행은 보지 않는다 */
export function assessStation(records: ChargerRecord[], stationIds: string[], connector: Connector, now: number): StationAssessment {
  const mine = records.filter((r) => stationIds.includes(r.stationId));
  const base = { stationIds, compatibleCount: 0, availableCount: 0, chargingCount: 0, maxKw: null, statusChangedAt: null, restriction: null } as const;
  if (!mine.length) return { ...base, verdict: "NEEDS_CHECK", reason: stationIds.length ? "이 충전소의 정보를 받지 못했어요" : "연결된 충전소 정보가 없어요", freshness: "UNKNOWN", retrievedAt: null, evidence: "UNKNOWN" };

  const retrievedAt = Math.min(...mine.map((r) => r.retrievedAt));
  const freshness = freshnessOf(retrievedAt, now);
  // 근거 등급은 가장 약한 것으로 — 시연 값이 하나라도 섞이면 시연이라고 말한다
  const evidence: Evidence = mine.some((r) => r.evidenceType === "MOCK") ? "MOCK" : mine.some((r) => r.evidenceType === "CACHED") ? "CACHED" : mine[0].evidenceType;
  const restriction = mine.map((r) => r.accessRestrictions).find((n) => n != null && RESTRICTION_WORDS.test(n)) ?? null;

  const known = mine.filter((r) => r.connectors != null);
  const compatible = known.filter((r) => r.connectors!.includes(connector));
  const common = { stationIds, freshness, retrievedAt, evidence, restriction };
  if (known.length === mine.length && compatible.length === 0) {
    return { ...common, verdict: "EXCLUDED", reason: "차량과 맞는 충전 규격이 없어요", compatibleCount: 0, availableCount: 0, chargingCount: 0, maxKw: null, statusChangedAt: null };
  }
  const pool = compatible.length ? compatible : mine;
  const available = pool.filter((r) => r.availabilityStatus === "AVAILABLE");
  const charging = pool.filter((r) => r.availabilityStatus === "CHARGING");
  const dead = pool.filter((r) => r.availabilityStatus === "OUT_OF_SERVICE" || r.availabilityStatus === "MAINTENANCE");
  const kws = pool.map((r) => r.outputKw).filter((k): k is number => k != null);
  const changes = pool.map((r) => r.statusUpdatedAt).filter((t): t is number => t != null);
  const facts = { ...common, compatibleCount: compatible.length, availableCount: available.length, chargingCount: charging.length, maxKw: kws.length ? Math.max(...kws) : null, statusChangedAt: changes.length ? Math.max(...changes) : null };

  if (dead.length === pool.length) return { ...facts, verdict: "EXCLUDED", reason: "충전기가 모두 점검·운영 중지로 표시돼 있어요" };
  if (compatible.length === 0) return { ...facts, verdict: "NEEDS_CHECK", reason: "충전 규격을 확인하지 못했어요" };
  if (restriction) return { ...facts, verdict: "NEEDS_CHECK", reason: `안내문 확인 필요: ${restriction}` };
  if (freshness === "STALE" || freshness === "UNKNOWN") return { ...facts, verdict: "NEEDS_CHECK", reason: "상태 정보를 받은 지 오래됐어요" };
  if (available.length === 0 && charging.length === 0) return { ...facts, verdict: "NEEDS_CHECK", reason: "충전기 상태를 확인할 수 없어요" };
  const suspect = (r: ChargerRecord) => r.statusUpdatedAt == null || now - r.statusUpdatedAt > UNCHANGED_SUSPECT_HOURS * 3_600_000;
  if (available.length > 0 && charging.length === 0 && available.every(suspect)) {
    return { ...facts, verdict: "NEEDS_CHECK", reason: `상태가 ${UNCHANGED_SUSPECT_HOURS}시간 넘게 바뀌지 않았어요` };
  }
  return { ...facts, verdict: "USABLE", reason: available.length ? `조회 시각 기준 빈 충전기 ${available.length}기 표시` : `조회 시각 기준 ${charging.length}기 모두 충전 중 표시` };
}
