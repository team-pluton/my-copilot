/**
 * V6 Unified Journey Data — 서로 다른 서비스의 값이 판단으로 들어가기 전에 지나는 경계. core/assistant/JourneyFact.kt 의 거울.
 *
 * 왜 값마다 메타를 붙이나: 차량 콜백 · 공공 API · 시연 데이터가 한 카드에 섞이면 사용자는 어느 것이 사실인지 모른다(정책 4).
 * 판단 코드는 값이 어디서 왔는지가 아니라 **믿을 만한지**만 보고, 화면은 출처를 그대로 보여 준다.
 *
 * 표준 단위: 에너지 kWh · 출력 kW · 거리 km · 시간 분 · SOC % · 위치 (lat, lon).
 */

export type Evidence = "VEHICLE" | "LIVE_API" | "CACHED" | "CURATED" | "MOCK" | "UNKNOWN";
export const EVIDENCE_LABEL: Record<Evidence, string> = {
  VEHICLE: "차량 정보",
  LIVE_API: "공공 API 조회",
  CACHED: "공공 API 저장값",
  CURATED: "수기 목록",
  MOCK: "시연 데이터",
  UNKNOWN: "미확인",
};

export type Freshness = "FRESH" | "AGING" | "STALE" | "UNKNOWN";
export type Availability = "OK" | "DENIED" | "NOT_CONNECTED" | "FAILED" | "NOT_SUPPORTED";

export type FactMeta = {
  source: string;
  /** 우리가 받은 시각(epoch ms) */
  retrievedAt: number | null;
  /** 원천이 말한 시각(epoch ms). 충전기는 '상태가 바뀐 일시'다 — 조회 시각과 뜻이 다르다 */
  originalUpdatedAt: number | null;
  evidence: Evidence;
  freshness: Freshness;
  reliabilityReason: string;
  availability: Availability;
  errorReason: string | null;
};

export type Fact<T> = { value: T | null; meta: FactMeta };

/** 받은 지 얼마나 됐나 — 기준은 가설이다. G1 수집 결과로 다시 맞춘다(DATA-FRESHNESS-POLICY.md) */
export const FRESH_MINUTES = 10;
export const AGING_MINUTES = 30;
/**
 * 시계 오차 보정 한도 — 조회 시각(서버·프록시 시계)이 '지금'(차량 시계)보다 이만큼까지 **앞서 있으면** 나이를 0 으로 본다.
 * E28(2026-11-11): 프록시 PC 가 차량보다 2초 빨라 방금 받은 충전소 상태가 전부 '오래됐어요'가 됐다.
 * **신선도 기준은 늘리지 않는다** — 미래로 찍힌 값만 보정하고, 과거 값의 나이는 그대로 잰다. 더 앞서면 시계를 믿지 않는다 (JourneyFact.kt)
 */
export const CLOCK_SKEW_MINUTES = 5;
/** 받은 지 몇 분인가 — 시계 오차 보정만 한다. 한도를 넘게 미래면 null(모름) */
export function ageMinutes(retrievedAt: number, now: number): number | null {
  const min = (now - retrievedAt) / 60_000;
  return min < -CLOCK_SKEW_MINUTES ? null : Math.max(min, 0);
}
export function freshnessOf(retrievedAt: number | null, now: number): Freshness {
  if (retrievedAt == null) return "UNKNOWN";
  const min = ageMinutes(retrievedAt, now);
  if (min === null) return "UNKNOWN"; // 시계가 크게 어긋난 값은 믿지 않는다
  if (min <= FRESH_MINUTES) return "FRESH";
  return min <= AGING_MINUTES ? "AGING" : "STALE";
}

// ── 차량 ────────────────────────────────────────────────
export const MIN_CAPACITY_KWH = 10;
export const MAX_CAPACITY_KWH = 250;

/**
 * 용량 단위 변환의 **유일한** 자리. 에뮬레이터는 Wh(77400)로 줬고(2026-10-29) 출품 어댑터는 kWh 를 가정한다 —
 * 어느 쪽이 오든 표준(kWh)으로 맞추고, 어느 단위로도 말이 안 되는 값은 버린다. 값을 지어내지 않으려고 기본 용량으로 대신하지 않는다.
 */
export function capacityToKwh(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw >= MIN_CAPACITY_KWH && raw <= MAX_CAPACITY_KWH) return raw;
  if (raw >= MIN_CAPACITY_KWH * 1000 && raw <= MAX_CAPACITY_KWH * 1000) return raw / 1000;
  return null;
}

export type VehicleEnergy = { socPct: number; capacityKwh: number };
export type VehicleEnergyRaw = {
  socPct: number | null;
  capacityRaw: number | null;
  /** 값을 받은 시각 — 연결이 끊겨도 값은 남아 있을 수 있어 나이를 따로 본다 */
  readAt: number | null;
  evidence: Evidence;
  availability: Availability;
};

/** 차량 값은 콜백으로 계속 오므로 5분이 지나면 끊긴 것으로 본다(가정) */
export const VEHICLE_STALE_MINUTES = 5;

export function normalizeVehicle(r: VehicleEnergyRaw, now: number): Fact<VehicleEnergy> {
  const meta = (over: Partial<FactMeta>): FactMeta => ({
    source: r.evidence === "VEHICLE" ? "Pleos Vehicle SDK" : "시연 차량",
    retrievedAt: r.readAt, originalUpdatedAt: r.readAt, evidence: r.evidence, freshness: "UNKNOWN",
    reliabilityReason: "", availability: r.availability, errorReason: null, ...over,
  });
  if (r.availability !== "OK") return { value: null, meta: meta({ reliabilityReason: "차량 정보를 받지 못했어요", errorReason: r.availability }) };
  const socOk = r.socPct != null && Number.isFinite(r.socPct) && r.socPct >= 0 && r.socPct <= 100;
  if (!socOk) return { value: null, meta: meta({ availability: "FAILED", reliabilityReason: "배터리 값이 범위를 벗어났어요", errorReason: `SOC ${r.socPct}` }) };
  const kwh = capacityToKwh(r.capacityRaw);
  if (kwh == null) return { value: null, meta: meta({ availability: "FAILED", reliabilityReason: "배터리 용량을 확인하지 못했어요", errorReason: `용량 ${r.capacityRaw}` }) };
  if (r.readAt == null) return { value: null, meta: meta({ reliabilityReason: "언제 받은 값인지 몰라요", errorReason: "읽은 시각 없음" }) };
  const ageMin = (now - r.readAt) / 60_000;
  if (ageMin < 0 || ageMin > VEHICLE_STALE_MINUTES) {
    return { value: null, meta: meta({ freshness: "STALE", reliabilityReason: "배터리 값이 오래됐어요", errorReason: `${Math.round(ageMin)}분 전 값` }) };
  }
  return { value: { socPct: r.socPct as number, capacityKwh: kwh }, meta: meta({ freshness: "FRESH", reliabilityReason: "차량에서 방금 받은 값" }) };
}
