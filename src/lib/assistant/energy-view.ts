/**
 * 에너지 숫자의 **의미**를 나눈다 — core/assistant/EnergyView.kt 의 거울.
 *
 * 쉼표 DRIVE 엔진의 `arrivalPct` 는 "도착 시 예상 잔량(대기 포함), 모자라면 음수"인 계산값이다. 그대로 화면에 크게 쓰면
 * "−27%" 가 되고, 사람은 배터리가 음수라고 읽는다(QUALITY_AUDIT 3). 그래서 화면에 나가는 값은 전부 여기를 거친다:
 *  · 현재 잔량(SOC) — 0~100 %
 *  · 예상 도착 잔량 — 0 아래로 내려가지 않는다. 대신 "도착 전 소진 예상"을 따로 든다
 *  · 추가 필요량 — 최소 잔량까지 모자란 양, **%p**(배터리 용량 대비 퍼센트포인트). 용량을 알면 kWh 도
 *  · 상태 — 충분 / 주의 / 부족 / 계산 불가
 * 엔진 값은 바꾸지 않는다. 읽는 방법만 정한다.
 */
import { verdictOf, type EnergyPlan } from "../core/energy";

export type EnergyStatus = "OK" | "CAUTION" | "SHORT" | "UNKNOWN";

export const ENERGY_STATUS_LABEL: Record<EnergyStatus, string> = { OK: "충분", CAUTION: "주의", SHORT: "부족", UNKNOWN: "계산 불가" };

export type EnergyView = {
  status: EnergyStatus;
  /** 지금 배터리 잔량(%). 모르면 null */
  currentSocPct: number | null;
  /** 예상 도착 잔량(%) — 0 미만은 0 으로. 모르면 null */
  arrivalSocPct: number | null;
  /** 대기·귀가까지 다 쓰기 전에 배터리가 바닥날 것으로 추정되는가 */
  depletesBeforeArrival: boolean;
  /** 최소 잔량까지 더 필요한 양(%p) — 모자라지 않으면 0 */
  requiredPctPoints: number;
  /** 추가 필요량의 추정 범위(%p). 범위 끝까지 모자라지 않으면 null */
  requiredRange: [number, number] | null;
  /** 추가 필요량(kWh) — 배터리 용량을 확인했을 때만 */
  requiredKwh: number | null;
  /** 한 번 충전으로 더할 수 있는 양(배터리 한 통 = 100%p)보다 더 필요한가 — 충전 한 번으로 끝나지 않을 수 있다 */
  exceedsFullCharge: boolean;
  /** 의미가 먼저 — 주행 화면의 큰 글씨 */
  headline: string;
  /** 숫자는 보조 — 단위를 붙여서 */
  detail: string;
};

const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * 무엇을 기준으로 "충분"한가(3차 P0-3) — 편도인지 왕복인지, 고른 충전 경유지를 포함한 계획인지.
 * 판정은 엔진의 verdictOf 그대로다: OK 는 **비관 추정(범위 끝)까지** 최소 잔량을 남긴다는 뜻이다.
 */
export type EnergyContext = { roundTrip?: boolean; viaWaypoint?: boolean; minReservePct?: number };

export function energyView(plan: EnergyPlan | null, currentSocPct: number | null, batteryKwh: number | null, ctx: EnergyContext = {}): EnergyView {
  if (plan === null || currentSocPct === null) {
    return {
      status: "UNKNOWN", currentSocPct: currentSocPct === null ? null : clampPct(currentSocPct), arrivalSocPct: null, depletesBeforeArrival: false,
      requiredPctPoints: 0, requiredRange: null, requiredKwh: null, exceedsFullCharge: false,
      headline: "최신 차량 정보가 없어 계획을 확인할 수 없어요", detail: "차량 값을 받지 못해 추정하지 않습니다",
    };
  }
  const v = verdictOf(plan);
  const status: EnergyStatus = v === "SHORT" ? "SHORT" : v === "TIGHT" ? "CAUTION" : "OK";
  const required = r0(Math.max(plan.shortfallPct, 0));
  const hi = r0(Math.max(plan.shortfallRange[1], 0));
  const range: [number, number] | null = hi > 0 ? [r0(Math.max(plan.shortfallRange[0], 0)), hi] : null;
  const kwh = batteryKwh !== null && required > 0 ? r1((required * batteryKwh) / 100) : null;
  // 충전은 가는 길에 배터리가 줄어든 뒤 하므로 "지금 잔량에서 완충"이 기준이 아니다 — 한 번에 더할 수 있는 최대는 한 통(100%p)
  const exceeds = required > 100;
  // 비관 추정에서 모자라면(CAUTION·SHORT) 머리말에 "충분"·"예상돼요"를 쓰지 않는다 — 평균값만 보고 안심시키지 않는다
  const headline = status === "SHORT" ? "충전 계획이 필요해요"
    : status === "CAUTION" ? (required > 0 ? "충전 없이는 모자랄 수 있어요" : "현재 조건에서는 충분할 수 있지만 여유가 크지 않아요")
    : ctx.viaWaypoint ? "선택한 충전 경유지를 포함하면 계획을 마칠 수 있을 것으로 예상돼요"
    : ctx.roundTrip ? "충전 없이 왕복할 수 있을 것으로 예상돼요"
    : "충전 없이 도착할 수 있을 것으로 예상돼요";
  const reserve = ctx.minReservePct !== undefined ? ` · 최소 잔량 ${r0(ctx.minReservePct)}% 남기고 비관 추정까지` : "";
  const detail = status === "OK"
    ? `${ctx.roundTrip ? "귀가 후" : "도착"} 예상 잔량 약 ${r0(Math.max(plan.arrivalPct, 0))}%${reserve} (추정)`
    : required > 0
      ? `예상 추가 필요량 약 ${required}%p${range ? ` (추정 ${range[0]}~${range[1]}%p)` : ""}${exceeds ? " · 완충해도 모자랄 수 있음" : ""}`
      : `평균으로는 충분하지만 추정 범위에서 최대 약 ${hi}%p 모자랄 수 있음`;
  return {
    status, currentSocPct: clampPct(currentSocPct), arrivalSocPct: clampPct(plan.arrivalPct), depletesBeforeArrival: plan.arrivalPct < 0,
    requiredPctPoints: required, requiredRange: range, requiredKwh: kwh, exceedsFullCharge: exceeds, headline, detail,
  };
}

function clampPct(x: number) {
  return r0(Math.min(Math.max(x, 0), 100));
}
