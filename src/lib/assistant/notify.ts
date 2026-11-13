/**
 * 에너지 재판단 알림 정책 — core/assistant/NotificationPolicy.kt 의 거울.
 *
 * 쉼표 DRIVE 의 `rejudge(prev, next)` 는 그대로 쓴다. 바꾸는 것은 **prev 에 무엇을 넣느냐** 하나다.
 * 직전 계산을 넣으면 30분씩 나빠질 때 매번 3%p 미만이라 끝까지 조용하다(QUALITY_AUDIT 2).
 * 그래서 **마지막으로 사람에게 알린 판단**을 기준으로 잡는다 — 누적 변화가 문턱을 넘는 순간 알린다.
 *
 * 화면의 숫자는 늘 최신 계산(`latest`)이다. 알림만 이 정책을 따른다.
 */
import { rejudge, verdictOf, type EnergyPlan, type Rejudgement, type Verdict } from "../core/energy";
import { energyView } from "./energy-view";

export type NotificationState = {
  /** 마지막으로 계산한 것 — 화면은 이것을 그린다 */
  latest: EnergyPlan | null;
  /** 마지막으로 사람에게 알린 판단 — 다음 알림의 비교 기준 */
  lastNotified: EnergyPlan | null;
  /** 사람이 확인(눌러서 닫음)한 판단 — 같은 경고를 되풀이하지 않는 근거 */
  lastAcknowledged: EnergyPlan | null;
};

export const INITIAL_NOTIFICATION: NotificationState = { latest: null, lastNotified: null, lastAcknowledged: null };

/** BASELINE 첫 계산(기준만 잡는다 — 첫 판단은 홈 카드가 보여 준다) · TIER_CHANGE 등급이 바뀜 · CUMULATIVE 같은 등급에서 누적 변화가 문턱 이상 */
export type NotificationReason = "BASELINE" | "TIER_CHANGE" | "CUMULATIVE" | "NONE";

export type NotificationDecision = {
  state: NotificationState;
  notify: Rejudgement | null;
  reason: NotificationReason;
  risk: Verdict;
  /** 비교 기준이었던 판단(마지막으로 알린 것) — 문구에 "어디서 어디로"를 쓰려고 */
  previous: EnergyPlan | null;
};

export const NOTIFY_THRESHOLD_PCT = 3;

export function decideNotification(s: NotificationState, latest: EnergyPlan, threshold = NOTIFY_THRESHOLD_PCT): NotificationDecision {
  const risk = verdictOf(latest);
  const previous = s.lastNotified;
  if (previous === null) return { state: { ...s, latest, lastNotified: latest }, notify: null, reason: "BASELINE", risk, previous };
  const r = rejudge(previous, latest, threshold);
  if (r === null) return { state: { ...s, latest }, notify: null, reason: "NONE", risk, previous };
  return { state: { ...s, latest, lastNotified: latest }, notify: r, reason: r.from !== r.to ? "TIER_CHANGE" : "CUMULATIVE", risk, previous };
}

const TIER_LABEL: Record<Verdict, string> = { OK: "충분", TIGHT: "주의", SHORT: "부족" };

/**
 * MY CO-PILOT 알림 문구 — 엔진 문구(rejudge.message)는 부족분을 "%" 로 쓰고 음수 범위("추정 -3~1%")가 나올 수 있어,
 * 사람에게 보이는 문구는 energyView 를 거쳐 **%p 와 0 이상**으로 만든다. 엔진 문구는 출품작 것이라 그대로 둔다.
 */
export function notificationMessage(d: NotificationDecision, currentSocPct: number): string | null {
  if (!d.notify || !d.previous || !d.state.latest) return null;
  const now = energyView(d.state.latest, currentSocPct, null);
  if (d.reason === "TIER_CHANGE") return `판단이 바뀌었습니다: ${TIER_LABEL[d.notify.from]} → ${TIER_LABEL[d.notify.to]} · ${now.detail}`;
  if (d.notify.to === "OK") {
    return `재판단 · 도착 예상 잔량 약 ${Math.round(Math.max(d.previous.arrivalPct, 0))}% → ${now.arrivalSocPct}%`;
  }
  const a = Math.round(Math.max(d.previous.shortfallPct, 0)), b = now.requiredPctPoints;
  return `재판단 · 추가 필요량 약 ${a}%p → ${b}%p (${b - a > 0 ? "+" : ""}${b - a}%p)`;
}

export const acknowledge = (s: NotificationState): NotificationState => ({ ...s, lastAcknowledged: s.lastNotified });

/**
 * 재판단의 **원인** — 비교 전후에 무엇이 바뀌었나(외부 평가 7 B). 하나만 바뀌었으면 그것이 원인이고,
 * 여럿이 함께 바뀌었으면 원인을 하나로 단정하지 않는다("대기 유형 변경으로 −6%p"라고 쓰면 설명이 틀린다).
 */
export type ChangedInput = "WAIT_MODE" | "WAIT_MINUTES" | "BATTERY" | "DISTANCE" | "OUTSIDE_TEMP" | "HVAC";
export const CHANGED_LABEL: Record<ChangedInput, string> = {
  WAIT_MODE: "대기 유형", WAIT_MINUTES: "대기 시간", BATTERY: "배터리 잔량", DISTANCE: "남은 거리", OUTSIDE_TEMP: "외기온", HVAC: "공조 ON/OFF",
};
/** 단일 변경일 때 "무엇의 차이"인가 */
const SINGLE_EFFECT: Record<ChangedInput, string> = {
  WAIT_MODE: "대기 중 공조 소비", WAIT_MINUTES: "대기 중 공조 소비", BATTERY: "지금 보유 에너지", DISTANCE: "주행 소비", OUTSIDE_TEMP: "공조·주행 소비", HVAC: "공조 소비",
};
export type RejudgeCause = { text: string; single: boolean };
export function rejudgeCause(changed: ChangedInput[]): RejudgeCause {
  const uniq = [...new Set(changed)];
  if (uniq.length === 0) return { text: "입력 변화 없음 · 같은 조건으로 다시 계산", single: true };
  if (uniq.length === 1) return { text: `${CHANGED_LABEL[uniq[0]]} 변경 · ${SINGLE_EFFECT[uniq[0]]} 차이`, single: true };
  return { text: `여러 값이 함께 바뀜(${uniq.map((c) => CHANGED_LABEL[c]).join(" · ")}) — 원인을 하나로 말하지 않음`, single: false };
}

/** 비교에 쓰는 입력 묶음 — 끊길 때 찍어 두고 복구 때 비교한다 */
export type RejudgeInputs = { batteryPct: number; outsideTempC: number; hvacOn: boolean; remainingKm: number; waitMinutes: number; waitMode: string };
export function changedInputs(a: RejudgeInputs, b: RejudgeInputs): ChangedInput[] {
  const out: ChangedInput[] = [];
  if (a.waitMode !== b.waitMode) out.push("WAIT_MODE");
  if (a.waitMinutes !== b.waitMinutes) out.push("WAIT_MINUTES");
  if (Math.abs(a.batteryPct - b.batteryPct) >= 0.5) out.push("BATTERY");
  if (Math.abs(a.remainingKm - b.remainingKm) >= 0.5) out.push("DISTANCE");
  if (Math.abs(a.outsideTempC - b.outsideTempC) >= 0.5) out.push("OUTSIDE_TEMP");
  if (a.hvacOn !== b.hvacOn) out.push("HVAC");
  return out;
}

/** 에너지 화면에 남기는 마지막 재판단 — 전 → 후 → 원인. 값은 그때 잔량 기준 화면 값(energyView)이라 알림 문장과 같은 숫자다 */
export type Rejudge = { fromLabel: string; fromPct: number; toLabel: string; toPct: number; why: string; single: boolean; clock: string };
export function rejudgeNote(d: NotificationDecision, currentSocPct: number, fromLabel: string, toLabel: string, cause: RejudgeCause, clock: string): Rejudge | null {
  if (!d.notify || !d.previous || !d.state.latest) return null;
  const from = energyView(d.previous, currentSocPct, null).arrivalSocPct, to = energyView(d.state.latest, currentSocPct, null).arrivalSocPct;
  if (from === null || to === null) return null;
  return { fromLabel, fromPct: from, toLabel, toPct: to, why: cause.text, single: cause.single, clock };
}

const RANK: Record<Verdict, number> = { OK: 0, TIGHT: 1, SHORT: 2 };

/**
 * 나빠지는 쪽으로 알렸으면 에너지 제안을 다시 꺼낸다 — **공조 제안의 거절 학습(쿨다운·3회 연속)으로 에너지 경고를 묻어 두지 않는다.**
 * 같은 등급에서 누적으로 나빠진 것도 포함한다. 좋아지는 쪽은 다시 꺼내지 않는다(알림만).
 */
export function shouldResurface(d: NotificationDecision): boolean {
  if (!d.notify) return false;
  return RANK[d.notify.to] > RANK[d.notify.from] || (d.notify.to !== "OK" && d.notify.delta > 0);
}
