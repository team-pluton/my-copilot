/**
 * 구간별 남은 에너지 계획 — core/assistant/Trip.kt 의 거울.
 *
 * 쉼표 DRIVE 엔진(estimate)은 "남은 계획"을 받으면 그대로 센다. 여기서는 **지금 어느 구간 어디쯤인가**로 남은 계획을 만든다.
 *  · 가는 길: 남은 가는 길 + 남은 대기 + 돌아오는 길 전부 — 목적지에 도착해도 귀로 예산은 남는다
 *  · 돌아오는 길: 남은 돌아오는 길만 — 대기는 끝났다
 * 편도(JOURNEY)는 가는 길 하나라 지금까지와 같다(회귀 테스트).
 */
import type { TripPlan } from "../core/model";

export const RETURN_DESTINATION = "집 (귀가)";

/** 왕복이면 2구간 */
export const legsOf = (plan: TripPlan) => ((plan.returnKm ?? 0) > 0 ? 2 : 1);

export type LegPosition = {
  leg: number;
  /** 이 구간에서 달린 거리(km) */
  traveledInLegKm: number;
  /** 목적지에서 이미 기다린 시간(분) */
  waitedMinutes: number;
};

export function remainingPlan(plan: TripPlan, pos: LegPosition): TripPlan {
  if (pos.leg === 0) {
    return {
      ...plan,
      routeKm: Math.max(plan.routeKm - pos.traveledInLegKm, 0),
      waitMinutesAfterArrival: Math.max(plan.waitMinutesAfterArrival - pos.waitedMinutes, 0),
    };
  }
  // 내비 도착 잔량 예측은 가는 길 목적지 기준이라 귀가 구간에는 쓰지 않는다
  const { naviArrivalSocPct: _drop, ...rest } = plan;
  void _drop;
  return { ...rest, destinationName: RETURN_DESTINATION, routeKm: Math.max((plan.returnKm ?? 0) - pos.traveledInLegKm, 0), returnKm: 0, waitMinutesAfterArrival: 0 };
}

/** 이 구간의 목적지까지 남은 거리 — NaviHelper remainDistance 자리(시연은 계산) */
export function legRemainingKm(plan: TripPlan, pos: LegPosition): number {
  return Math.max((pos.leg === 0 ? plan.routeKm : plan.returnKm ?? 0) - pos.traveledInLegKm, 0);
}
