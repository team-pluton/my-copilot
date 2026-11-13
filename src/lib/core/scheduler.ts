import type { TripPlan, VehicleSnapshot } from "./model";

/**
 * 휴식 시점 — core/BreakScheduler.kt 의 TS 거울.
 *
 * v2 에서 "서야 하나"의 1차 판단은 에너지(energy.ts)가 하고, 이건 **충전이 필요
 * 없어도 쉬어야 할 때**를 잡는다. 둘 중 먼저 오는 쪽이 정차를 부른다.
 * 화면이 직접 분을 비교하지 않게 한 값으로 돌려준다 — 비교가 흩어지면 대시보드·
 * 주행중 모드·음성 안내가 서로 다른 시점에 다른 말을 한다.
 */
export type BreakPhase = "CRUISING" | "PREFETCH" | "READY" | "SUGGEST";

export const PHASE_LABEL: Record<BreakPhase, string> = {
  CRUISING: "주행 중",
  PREFETCH: "후보 미리 탐색",
  READY: "안내 준비",
  SUGGEST: "휴식 권장",
};

/** 간격 대비 비율 — 분을 상수로 박으면 30분 간격을 고른 사람에겐 이미 지난 시점이 된다 */
const PREFETCH_RATIO = 0.75;
const READY_RATIO = 0.92;

export function phaseOf(plan: TripPlan, v: VehicleSnapshot): BreakPhase {
  const ratio = v.tripMinutes / plan.breakIntervalMinutes;
  if (ratio >= 1) return "SUGGEST";
  if (ratio >= READY_RATIO) return "READY";
  if (ratio >= PREFETCH_RATIO) return "PREFETCH";
  return "CRUISING";
}

export function minutesUntilBreak(plan: TripPlan, v: VehicleSnapshot): number {
  return Math.max(plan.breakIntervalMinutes - v.tripMinutes, 0);
}

/** "나중에" — 간격의 1/4 뒤 (90분이면 22분). 무시하고 계속 띄우면 앱을 끈다 */
export function snoozeMinutes(plan: TripPlan): number {
  return Math.max(Math.floor(plan.breakIntervalMinutes / 4), 5);
}
