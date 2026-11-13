/**
 * 대기 유형 · 차량 상태와 여정 상태 — core/assistant/Wait.kt 의 거울.
 *
 * 대기는 두 가지다(검토 H): 차 안에서 공조를 켜고 기다리는 것(마중·아이 재우기)과, 차를 두고 밖에서 볼일을 보는 것(미팅).
 * 쉼표 DRIVE 엔진의 `waitMinutesAfterArrival` 은 "차 안에서 기다릴 시간"이라 앞의 것만 센다 — 차를 두고 다녀오면 대기 소비는 0 이다.
 * 새 계산은 만들지 않는다: 차 밖 대기면 대기 시간을 0 으로 둔 계획으로 `estimate` 를 다시 부르고, 가정 줄만 바꿔 적는다.
 *
 * 그리고 **차량 상태**(신호에서: 주행·정지·주차·모름)와 **여정 상태**(사용자의 이동: 방문 중·잠시 내림·귀가 중 …)를 나눈다(검토 ⑤).
 * PARKED 는 차의 상태이고, "고객사 방문 중"은 사람의 상태다. 화면은 둘을 섞지 않는다.
 */
import { estimate, type EnergyPlan } from "../core/energy";
import type { TripPlan, VehicleSnapshot } from "../core/model";
import type { JourneyState, Motion } from "./journey";

export type WaitMode = "IN_CAR" | "AWAY";

export const WAIT_MODE_LABEL: Record<WaitMode, string> = { IN_CAR: "차 안에서 기다림 · 공조 사용 가정", AWAY: "차를 두고 다녀옴" };

/** 대기 유형을 반영한 에너지 추정 — 쉼표 DRIVE estimate 를 조건만 바꿔 부른다 */
export function energyFor(plan: TripPlan, v: VehicleSnapshot, mode: WaitMode): EnergyPlan {
  if (mode === "IN_CAR" || plan.waitMinutesAfterArrival === 0) return estimate(plan, v);
  const r = estimate({ ...plan, waitMinutesAfterArrival: 0 }, v);
  return {
    ...r,
    assumptions: r.assumptions.map((a) => (a.startsWith("도착 후 대기") ? `도착 후 대기 ${plan.waitMinutesAfterArrival}분 · 차를 두고 밖에서 → 주차 중 공조 미사용 가정 (대기 중 다른 소비는 계산에 없음)` : a)),
  };
}

export type VehicleStatus = "MOVING" | "STOPPED" | "PARKED" | "UNKNOWN";
export type TripStatus =
  | "NOT_STARTED" | "PREPARING" | "DRIVING" | "APPROACHING" | "STOPOVER" | "ARRIVED"
  | "FINISHING" | "STEPPED_OUT" | "WAITING_IN_CAR" | "VISITING" | "RETURNING" | "COMPLETED";

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = { MOVING: "주행 중", STOPPED: "정지", PARKED: "주차", UNKNOWN: "확인 못 함" };
export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  NOT_STARTED: "출발 전", PREPARING: "출발 준비", DRIVING: "이동 중", APPROACHING: "곧 도착", STOPOVER: "중간 정차",
  ARRIVED: "도착", FINISHING: "하차 준비", STEPPED_OUT: "잠시 내림", WAITING_IN_CAR: "차 안에서 대기", VISITING: "방문 중",
  RETURNING: "귀가 중", COMPLETED: "이동 완료",
};

export type Status = { vehicle: VehicleStatus; trip: TripStatus; vehicleLabel: string; tripLabel: string };

export function statusOf(j: JourneyState, motion: Motion, mode: WaitMode): Status {
  const vehicle: VehicleStatus = motion.kind;
  const trip: TripStatus = (() => {
    switch (j.phase) {
      case "NOT_STARTED": return "NOT_STARTED";
      case "PREPARING": return "PREPARING";
      case "DRIVING": return j.leg > 0 ? "RETURNING" : "DRIVING";
      case "APPROACHING": return "APPROACHING";
      case "PARKED": return j.atDestination ? "ARRIVED" : "STOPOVER";
      case "FINISHING": return j.atDestination ? "FINISHING" : "STEPPED_OUT";
      case "WAITING": return mode === "AWAY" ? "VISITING" : "WAITING_IN_CAR";
      case "COMPLETED": return "COMPLETED";
    }
  })();
  return { vehicle, trip, vehicleLabel: VEHICLE_STATUS_LABEL[vehicle], tripLabel: TRIP_STATUS_LABEL[trip] };
}
