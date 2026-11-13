import type { TripPlan, VehicleSnapshot } from "./model";

/**
 * 에너지 추정 — 축 1 의 심장. **도착한 뒤 차에서 쓸 에너지까지** 센다.
 *
 * 내비와 충전소 검색은 "도착"까지만 본다. 도착해서 40분 차 안에서 기다리면
 * (아이가 자고 있다든지) 공조가 돌고, 그 몫은 아무도 미리 안 센다. 그래서
 * 주행 소비 · 대기 소비 · 최소 잔량을 **따로** 세고 합친다.
 *
 * ⚠️ **항상 범위(±)와 함께 돌려준다.** 제조사 공식 주행가능거리처럼 보이게 하지
 * 않는다 (CLAUDE.md 정책 2). 숫자 하나만 보여 주면 틀렸을 때 신뢰가 통째로 깎인다.
 *
 * 규칙은 단순하다 — 복잡한 모델은 설명할 수 없고, 설명할 수 없으면 심사에서 답할 수 없다.
 *
 *     주행 소비(%) = 거리 × 기준 소비율(kWh/km) × 보정(주행모드·외기온·공조) ÷ 배터리 용량
 *     대기 소비(%) = 대기 시간 × 공조 분당 소비 ÷ 배터리 용량
 *     부족분       = 주행 + 대기 + 최소 잔량 − 현재 잔량
 */

/** 차종 기본 소비율 — EvBattery 효율값이 없을 때만 쓴다 (가정, 중형 EV 기준) */
const DEFAULT_KWH_PER_100KM = 16;

/** 공조가 켜져 있을 때 정차 중 분당 소비(kWh). 가정값 — 외기온으로 보정한다 */
const HVAC_KWH_PER_MIN_BASE = 0.025;

/** 추정의 불확실성 — 주행 소비의 ±12%. 가정값 (보정 전까지) */
export const DRIVE_UNCERTAINTY = 0.12;

/** 내비 도착 잔량 예측을 쓸 때의 오차 — 가정 ±5%. 실차·에뮬레이터 비교로 보정한다 */
export const NAVI_UNCERTAINTY = 0.05;

export type EnergyPlan = {
  /** 주행 전체(가는 길 + 오는 길) */
  drivePct: number;
  /** 가는 길 · 오는 길 — 편도면 returnPct = 0 */
  outboundPct: number;
  returnPct: number;
  /**
   * 공조를 켠 채 **최대 몇 분까지** 기다려도 되나 — 보수적 추정(주행 범위의 비관 끝) 기준.
   * 공조를 끄면 null (대기 소비가 0). WAIT 모드의 핵심 출력이다.
   */
  maxWaitMinutes: number | null;
  driveRange: [number, number];
  waitPct: number;
  reservePct: number;
  /** 양수면 모자란다 */
  shortfallPct: number;
  shortfallRange: [number, number];
  needsCharge: boolean;
  /** 도착 시 예상 잔량(대기 포함). 모자라면 음수일 수 있다 */
  arrivalPct: number;
  /** 가정을 글로 — 화면의 "어떻게 계산했나" 패널이 그대로 쓴다 */
  assumptions: string[];
  /** 사람에게 보여 줄 한 문장 (FLOW OS 의 "먼저 제안한다"를 규칙으로) */
  message: string;
};

/** 보정 계수 — 전부 가정값. 방향은 상식과 맞고 크기는 보수적으로 */
function factors(v: VehicleSnapshot) {
  const perKm = (v.efficiencyKwhPer100km ?? DEFAULT_KWH_PER_100KM) / 100;
  const modeFactor = v.driveMode === "ECO" ? 0.93 : v.driveMode === "SPORT" ? 1.12 : 1.0;
  const tempFactor = v.outsideTempC <= 0 ? 1.2 : v.outsideTempC <= 10 ? 1.08 : v.outsideTempC >= 30 ? 1.06 : 1.0;
  const hvacDriveFactor = v.hvacOn ? 1.04 : 1.0;
  return { perKm, modeFactor, tempFactor, hvacDriveFactor };
}

/**
 * 1km 달릴 때 쓰는 배터리 %. 추천 엔진이 "거기까지 갈 수 있나 · 거기서 충전하면 끝까지 가나"를
 * 셀 때 쓴다 — 같은 보정을 두 군데서 따로 계산하면 두 화면이 다른 말을 한다.
 */
export function pctPerKm(v: VehicleSnapshot): number {
  const f = factors(v);
  return (f.perKm * f.modeFactor * f.tempFactor * f.hvacDriveFactor / v.batteryKwh) * 100;
}

export function estimate(plan: TripPlan, v: VehicleSnapshot): EnergyPlan {
  const { perKm, modeFactor, tempFactor, hvacDriveFactor } = factors(v);

  const returnKm = plan.returnKm ?? 0;
  const kmToPct = (km: number) => ((km * perKm * modeFactor * tempFactor * hvacDriveFactor) / v.batteryKwh) * 100;
  // 내비 도착 잔량이 있으면 가는 길은 그 값, 오는 길은 내비/모델 비율로 보정. 오차도 좁힌다(가정 ±5%)
  const navi = plan.naviArrivalSocPct;
  const modelOutbound = kmToPct(plan.routeKm);
  const outboundPct = navi != null ? Math.max(v.batteryPct - navi, 0) : modelOutbound;
  const calib = navi != null && modelOutbound > 0 ? outboundPct / modelOutbound : 1;
  const returnPctRaw = kmToPct(returnKm) * calib;
  const drivePct = outboundPct + returnPctRaw;
  const uncertainty = navi != null ? NAVI_UNCERTAINTY : DRIVE_UNCERTAINTY;
  const driveRange: [number, number] = [drivePct * (1 - uncertainty), drivePct * (1 + uncertainty)];

  const hvacTempFactor = v.outsideTempC <= 0 ? 1.6 : v.outsideTempC <= 10 ? 1.3 : v.outsideTempC >= 30 ? 1.4 : 1.0;
  const waitKwh = v.hvacOn ? plan.waitMinutesAfterArrival * HVAC_KWH_PER_MIN_BASE * hvacTempFactor : 0;
  const waitPct = (waitKwh / v.batteryKwh) * 100;

  const reservePct = plan.minReservePct;
  const shortfallPct = drivePct + waitPct + reservePct - v.batteryPct;
  const shortfallRange: [number, number] = [
    driveRange[0] + waitPct + reservePct - v.batteryPct,
    driveRange[1] + waitPct + reservePct - v.batteryPct,
  ];
  const arrivalPct = v.batteryPct - drivePct - waitPct;

  // 범위의 **낙관적인 끝**이 0 을 넘으면 확실히 모자라고, 비관적인 끝만 넘으면 "아슬아슬"
  const needsCharge = shortfallRange[1] > 0;

  // 공조 켜고 기다릴 수 있는 시간 — 비관 끝 기준. 주행만으로 이미 모자라면 0
  const waitPctPerMin = v.hvacOn ? ((HVAC_KWH_PER_MIN_BASE * hvacTempFactor) / v.batteryKwh) * 100 : 0;
  const maxWaitMinutes = waitPctPerMin > 0 ? Math.max(Math.floor((v.batteryPct - driveRange[1] - reservePct) / waitPctPerMin), 0) : null;

  const assumptions = [
    `기준 소비 ${(perKm * 100).toFixed(1)} kWh/100km ${v.efficiencyKwhPer100km != null ? "(차량 효율값)" : "(차종 기본값 · 가정)"}`,
    `주행모드 ${v.driveMode} ×${modeFactor} · 외기온 ${v.outsideTempC}°C ×${tempFactor}${v.hvacOn ? ` · 공조 ON ×${hvacDriveFactor}` : ""}`,
    v.hvacOn
      ? `도착 후 대기 ${plan.waitMinutesAfterArrival}분 · 공조 분당 ${(HVAC_KWH_PER_MIN_BASE * hvacTempFactor).toFixed(3)} kWh (가정)`
      : `도착 후 대기 ${plan.waitMinutesAfterArrival}분 · 공조 OFF → 대기 소비 0`,
    `추정 오차 ±${Math.round(DRIVE_UNCERTAINTY * 100)}% (보정 전)`,
  ];
  if (returnKm > 0) assumptions.splice(1, 0, `왕복: 가는 길 ${plan.routeKm}km + 오는 길 ${returnKm}km · 대기는 그 사이`);
  if (navi != null) {
    assumptions[0] = `가는 길: 내비 도착 잔량 예측 ${navi}% 기준 (NaviHelper)${returnKm > 0 ? ` · 오는 길은 같은 비율(×${calib.toFixed(2)})로 보정` : ""}`;
    assumptions[assumptions.length - 1] = `추정 오차 ±${Math.round(NAVI_UNCERTAINTY * 100)}% (내비 예측 기준 · 가정)`;
  }

  const message = buildMessage(plan, shortfallPct, shortfallRange, arrivalPct);

  return {
    drivePct: r1(drivePct),
    outboundPct: r1(outboundPct),
    returnPct: r1(returnPctRaw),
    maxWaitMinutes,
    driveRange: [r1(driveRange[0]), r1(driveRange[1])],
    waitPct: r1(waitPct),
    reservePct,
    shortfallPct: r1(shortfallPct),
    shortfallRange: [r1(shortfallRange[0]), r1(shortfallRange[1])],
    needsCharge,
    arrivalPct: r1(arrivalPct),
    assumptions,
    message,
  };
}

/**
 * 제안 문장. "먼저 말해 준다"는 FLOW OS 의 가치를 **규칙**으로 만든 것 —
 * 그래야 심사에서 "왜 그렇게 말했나"에 답할 수 있다. LLM 은 나중에 다듬는 데나 쓴다.
 */
function buildMessage(plan: TripPlan, shortfall: number, range: [number, number], arrival: number): string {
  const wait = plan.waitMinutesAfterArrival;
  if ((plan.returnKm ?? 0) > 0) {
    // 왕복 — "충전하지 않아도 된다" 는 결정 자체가 가치다. 모자라면 경로상이 아니라 출발 전 충전을 권한다
    const what = `${wait}분 기다렸다 돌아오기까지`;
    if (range[0] > 0) return `${what} 하려면 약 ${Math.round(shortfall)}% 가 모자랍니다 (추정 ${Math.round(range[0])}~${Math.round(range[1])}%). 출발 전 충전을 권합니다.`;
    if (range[1] > 0) return `${what} 아슬아슬합니다 (추정 ${Math.round(range[0])}~${Math.round(range[1])}%). 출발 전 짧게 충전하면 여유가 생깁니다.`;
    return `현재 배터리로 ${what} 충분합니다 (귀가 시 예상 잔량 약 ${Math.round(arrival)}%). 충전하지 않아도 됩니다.`;
  }
  if (range[0] > 0) {
    return `도착 후 ${wait}분 대기까지 하려면 약 ${Math.round(shortfall)}% 가 모자랍니다 (추정 ${Math.round(range[0])}~${Math.round(range[1])}%). 경로상 한 번 충전을 권합니다.`;
  }
  if (range[1] > 0) {
    return `도착 후 ${wait}분 대기까지 아슬아슬합니다 (추정 ${Math.round(range[0])}~${Math.round(range[1])}%). 쉬어 가는 김에 짧게 충전하면 여유가 생깁니다.`;
  }
  return `현재 배터리로 도착 후 ${wait}분 대기까지 충분합니다 (도착 예상 잔량 약 ${Math.round(arrival)}%). 충전 없이 휴식만 계획합니다.`;
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 차량이 받을 수 있는 최대 충전 출력(kW) — 가정: 800V 급 중형 EV 피크 (E-GMP 급). 충전기가 더 세도 이 위로는 못 받는다 */
export const VEHICLE_MAX_CHARGE_KW = 230;

/**
 * 충전 시간(분) 추정 — "80% 까지 약 N분" 에 쓴다.
 *
 * 급속은 잔량이 오를수록 느려진다(테이퍼). 곡선을 흉내 내지 않고 **평균 출력 비율**로 뭉뚱그린다 —
 * 200kW 이상 0.65, 50~199kW 0.8, 그 아래 0.9. 전부 가정값이고 화면에는 "약" 을 붙인다.
 */
export function chargeMinutes(fromPct: number, toPct: number, batteryKwh: number, chargerKw: number): number {
  if (toPct <= fromPct || chargerKw <= 0) return 0;
  const peak = Math.min(chargerKw, VEHICLE_MAX_CHARGE_KW);
  const taper = chargerKw >= 200 ? 0.65 : chargerKw >= 50 ? 0.8 : 0.9;
  const kwh = ((toPct - fromPct) / 100) * batteryKwh;
  return Math.round((kwh / (peak * taper)) * 60);
}

/** N분 충전하면 몇 %가 차나 — chargeMinutes 의 역. 같은 테이퍼 가정. 100% 를 넘기지 않는다 */
export function chargePctInMinutes(minutes: number, chargerKw: number, batteryKwh: number): number {
  if (minutes <= 0 || chargerKw <= 0) return 0;
  const peak = Math.min(chargerKw, VEHICLE_MAX_CHARGE_KW);
  const taper = chargerKw >= 200 ? 0.65 : chargerKw >= 50 ? 0.8 : 0.9;
  return r1(Math.min(((peak * taper * minutes) / 60 / batteryKwh) * 100, 100));
}

/** 판정 세 단계 — 범위의 낙관 끝이 넘으면 SHORT, 비관 끝만 넘으면 TIGHT, 아니면 OK */
export type Verdict = "OK" | "TIGHT" | "SHORT";
export const VERDICT_LABEL: Record<Verdict, string> = { OK: "충분", TIGHT: "아슬아슬", SHORT: "부족" };
export function verdictOf(p: EnergyPlan): Verdict {
  return p.shortfallRange[0] > 0 ? "SHORT" : p.shortfallRange[1] > 0 ? "TIGHT" : "OK";
}

/**
 * **실시간 재판단** — 차량 값(공조·외기·효율·잔량)이 바뀌어 다시 추정했을 때, 사람에게 알릴 만한 변화인가.
 * 판정이 바뀌었거나 부족분이 threshold(%p) 이상 움직였을 때만 메시지를 낸다 — 매번 알리면 아무도 안 본다.
 * 출발 전에 한 번 계산하고 끝나는 앱과 갈리는 자리다.
 */
export type Rejudgement = { from: Verdict; to: Verdict; delta: number; message: string };
export function rejudge(prev: EnergyPlan, next: EnergyPlan, threshold = 3): Rejudgement | null {
  const from = verdictOf(prev), to = verdictOf(next);
  const delta = r1(next.shortfallPct - prev.shortfallPct);
  if (from === to && Math.abs(delta) < threshold) return null;
  const sign = delta > 0 ? "+" : "";
  const detail = to === "OK"
    ? `예상 잔량 ${Math.round(prev.arrivalPct)}% → ${Math.round(next.arrivalPct)}%`
    : from === "OK"
      ? `이제 약 ${Math.max(Math.round(next.shortfallPct), 0)}% 부족 (추정 ${Math.round(next.shortfallRange[0])}~${Math.round(next.shortfallRange[1])}%)`
      : `부족분 ${Math.round(prev.shortfallPct)}% → ${Math.round(next.shortfallPct)}% (${sign}${Math.round(delta)}%p)`;
  const message = from !== to ? `판단이 바뀌었습니다: ${VERDICT_LABEL[from]} → ${VERDICT_LABEL[to]} · ${detail}` : `재판단 · ${detail}`;
  return { from, to, delta, message };
}

/**
 * **만약에 비교** — 선택지마다 조건을 바꿔 다시 추정하고 결과를 나란히 돌려준다.
 * 경유지 충전은 "시작 잔량에 더하는" 근사다 (그곳에 닿을 수 있다는 것은 추천 엔진이 이미 확인했다).
 */
export type WhatIfOption = { label: string; apply: (p: TripPlan, v: VehicleSnapshot) => [TripPlan, VehicleSnapshot] };
export type WhatIfResult = { label: string; verdict: Verdict; arrivalPct: number; shortfallPct: number };
export function compareOptions(plan: TripPlan, v: VehicleSnapshot, options: WhatIfOption[]): WhatIfResult[] {
  return options.map((o) => {
    const [p, vv] = o.apply(plan, v);
    const r = estimate(p, vv);
    return { label: o.label, verdict: verdictOf(r), arrivalPct: r.arrivalPct, shortfallPct: r.shortfallPct };
  });
}
