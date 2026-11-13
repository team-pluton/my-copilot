/**
 * 에너지 판단 **뒤**의 선택지 — core/assistant/Options.kt 의 거울.
 *
 * "충분 → 주의"라고만 알리면 사용자가 다음 질문을 혼자 풀어야 한다(검토 ④): 그대로 가도 되나? 차를 두고 다녀오면?
 * 대기를 줄이면? 충전하면? 얼마나 더 기다리면 충전이 필요해지나?
 * 답은 새 계산이 아니라 **쉼표 DRIVE 만약에 비교**다 — 조건만 바꿔 `estimate` 를 다시 부르고 판정을 나란히 둔다.
 *
 * 앱은 아무것도 자동으로 바꾸지 않는다(정책 1). 버튼은 앱이 할 수 있는 것에만 단다:
 *  · 대기 유형 바꾸기(사용자가 알려 주는 사실) · 후보 보기(경유지는 사용자가 고른다)
 *  · 대기를 줄이는 것은 사용자의 일정이라 **정보만** 준다.
 */
import { pctPerKm, verdictOf, type EnergyPlan } from "../core/energy";
import type { TripPlan, VehicleSnapshot } from "../core/model";
import { energyView, type EnergyStatus } from "./energy-view";
import { energyFor, type WaitMode } from "./wait";

export type EnergyOptionKey = "AS_IS" | "WAIT_AWAY" | "WAIT_SHORTER" | "CHARGE_AT";
export type EnergyOptionAction = "SET_WAIT_AWAY" | "SHOW_STOPS" | null;

export type EnergyOption = {
  key: EnergyOptionKey;
  label: string;
  status: EnergyStatus;
  /** energyView 문장 — 범위와 "추정"을 이미 담고 있다 */
  detail: string;
  /** 지금 계획보다 판정이 나아지나 */
  improves: boolean;
  action: EnergyOptionAction;
  /** 앱이 할 수 없는 것이면 왜 정보만인지 */
  note: string | null;
};

/** 충전 경유지 한 곳 — 지금 위치에서의 거리 */
export type ChargeCandidate = { name: string; kmFromHere: number };

/** 경유지 충전 목표 — 쉼표 DRIVE 와 같은 80% */
export const CHARGE_TARGET = 80;
/** 대기 한계를 찾을 때 보는 폭 — 5분 단위, 최대 10시간 */
export const WAIT_STEP_MIN = 5;
export const WAIT_SEARCH_MAX_MIN = 600;

const RANK: Record<EnergyStatus, number> = { SHORT: 0, CAUTION: 1, OK: 2, UNKNOWN: -1 };

const statusOf = (e: EnergyPlan): EnergyStatus => {
  const v = verdictOf(e);
  return v === "SHORT" ? "SHORT" : v === "TIGHT" ? "CAUTION" : "OK";
};

export type OptionsInput = {
  /** 지금 구간 기준 남은 계획(trip.remainingPlan) */
  plan: TripPlan;
  v: VehicleSnapshot;
  waitMode: WaitMode;
  /** 1위 후보 — 경유지 슬롯이 남았고 가는 길일 때만 */
  charge: ChargeCandidate | null;
};

/**
 * 충전 경유지에서 80% 까지 충전했다고 보고 남은 길을 다시 센다 — 선택지와 "경유지를 포함한 계획" 판정이 같은 식을 쓴다.
 * 내비 도착 예측은 지금 잔량 기준이라 뺀다. 경유지에 닿을 수 있다는 것은 추천 엔진이 이미 확인했다.
 */
export function planViaStop(plan: TripPlan, v: VehicleSnapshot, waitMode: WaitMode, kmFromHere: number): { energy: EnergyPlan; soc: number } {
  const { naviArrivalSocPct: _drop, ...rest } = plan;
  void _drop;
  const after: TripPlan = { ...rest, routeKm: Math.max(plan.routeKm - kmFromHere, 0) };
  const soc = Math.max(CHARGE_TARGET, v.batteryPct - pctPerKm(v) * kmFromHere);
  return { energy: energyFor(after, { ...v, batteryPct: soc }, waitMode), soc };
}

export function energyOptions(i: OptionsInput): EnergyOption[] {
  const base = energyFor(i.plan, i.v, i.waitMode);
  const baseStatus = statusOf(base);
  if (baseStatus === "OK") return [];
  const opt = (key: EnergyOptionKey, label: string, e: EnergyPlan, soc: number, action: EnergyOptionAction, note: string | null): EnergyOption => {
    const status = statusOf(e);
    return { key, label, status, detail: energyView(e, soc, null).detail, improves: RANK[status] > RANK[baseStatus], action, note };
  };
  const out: EnergyOption[] = [opt("AS_IS", "지금 계획 그대로", base, i.v.batteryPct, null, null)];
  const wait = i.plan.waitMinutesAfterArrival;
  if (i.waitMode === "IN_CAR" && wait > 0 && i.v.hvacOn) {
    out.push(opt("WAIT_AWAY", "차를 두고 밖에서 기다리면", energyFor(i.plan, i.v, "AWAY"), i.v.batteryPct, "SET_WAIT_AWAY", null));
  }
  if (i.waitMode === "IN_CAR" && wait >= 30) {
    out.push(opt("WAIT_SHORTER", "대기를 30분 줄이면", energyFor({ ...i.plan, waitMinutesAfterArrival: wait - 30 }, i.v, "IN_CAR"), i.v.batteryPct, null, "일정은 앱이 바꾸지 않습니다"));
  }
  if (i.charge) {
    const via = planViaStop(i.plan, i.v, i.waitMode, i.charge.kmFromHere);
    out.push(opt("CHARGE_AT", `${i.charge.name}에서 ${CHARGE_TARGET}%까지 충전하면`, via.energy, via.soc, "SHOW_STOPS", null));
  }
  return out;
}

/**
 * 차 안에서 기다릴 수 있는 시간 — 추정 범위 안에서 "충분"이 유지되는 가장 긴 남은 대기(5분 단위).
 * 판정은 범위 기준이라(범위 끝까지 모자라지 않아야 충분) 보수적이다.
 *  · null: 차 밖 대기라 시간과 무관 · -1: 대기가 없어도 이미 충분이 아님 · WAIT_SEARCH_MAX_MIN: 그 이상
 */
export function maxWaitWithoutCharge(plan: TripPlan, v: VehicleSnapshot, mode: WaitMode): number | null {
  if (mode === "AWAY") return null;
  const ok = (w: number) => statusOf(energyFor({ ...plan, waitMinutesAfterArrival: w }, v, "IN_CAR")) === "OK";
  if (!ok(0)) return -1;
  let best = 0;
  for (let w = WAIT_STEP_MIN; w <= WAIT_SEARCH_MAX_MIN; w += WAIT_STEP_MIN) {
    if (!ok(w)) break;
    best = w;
  }
  return best;
}

/** 대기 한계를 한 줄로 */
export function waitLimitLine(limit: number | null, waitNow: number): string | null {
  if (limit === null) return "차를 두고 다녀오면 대기 시간은 에너지에 영향이 없습니다 (가정)";
  if (limit < 0) return null;
  if (limit >= WAIT_SEARCH_MAX_MIN) return "차 안에서 10시간 넘게 기다려도 충분합니다 (추정)";
  return limit >= waitNow
    ? `차 안 대기는 앞으로 약 ${limit}분까지 충전 없이 됩니다 (추정 범위 기준)`
    : `차 안 대기가 약 ${limit}분을 넘으면 충전이 필요해집니다 (추정 범위 기준) · 지금 계획 ${waitNow}분`;
}
