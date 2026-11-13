/**
 * 제안 엔진 — "지금 이 사람에게 꺼낼 것 **하나**". core/assistant/SuggestionPlanner.kt 의 거울.
 *
 * 메뉴를 늘어놓지 않는다. 상황(여정 단계)·에너지 판단·사용자 선호에서 후보를 만들고, Safety Gate 로 거른 뒤
 * 점수가 가장 높은 하나만 앞에 낸다. 나머지는 추천함(inbox)에 둔다 — 지우지 않는다.
 *
 * 에너지 판단은 **쉼표 DRIVE 엔진 그대로**다(energy.ts estimate·verdictOf). 여기서 다시 계산하거나 고치지 않는다.
 */
import { estimate, verdictOf, type Verdict } from "../core/energy";
import type { TripPlan, VehicleSnapshot } from "../core/model";
import type { BreakPhase } from "../core/scheduler";
import { allowedWhileDriving, ACTION_POLICY, type ActionType } from "./gate";
import type { JourneyState } from "./journey";

export type SuggestionType =
  | "PROFILE_PREPARATION"
  | "ENERGY_DECISION"
  | "BREAK_PLANNING"
  | "ARRIVAL_PREPARATION"
  | "CHECKLIST_REMINDER"
  /** 귀가 구간 준비(V5 Mission) — 중간 목적지에서 방문·대기 중일 때 "귀가 일정을 확인할까요?" 한 번 (확인 = 기억 표시 · 내비 목적지 설정 아님) */
  | "NEXT_LEG";

export type SuggestionStatus = "NEW" | "DEFERRED";

/**
 * 위험 등급 — 점수 하나로 위험과 일상 준비를 겨루게 하지 않는다(QUALITY_AUDIT 1). V5 지시서 9절의 우선순위를 등급으로 둔다:
 *  · RISK     지금 안 하면 이동이 틀어질 수 있는 것 — 에너지 '부족' (지시서 1·3)
 *  · DECISION 지금 이동을 계속하기 위해 필요한 명확한 결정 — 귀가 구간 준비 (지시서 2)
 *  · PHASE    지금 여정 단계에서 할 일 — 출발 준비 · 휴식 · 도착 안내 · 하차 (지시서 4·5)
 *  · ADVISORY 알아 두면 좋은 것 — 에너지 '주의' (지시서 6)
 * 순서는 등급 → 점수. 등급 안에서만 점수로 고른다. 안전 경고를 앱이 임의로 진단하지 않는다 — RISK 는 에너지 판정뿐이다.
 */
export type SuggestionTier = "RISK" | "DECISION" | "PHASE" | "ADVISORY";
const TIER_RANK: Record<SuggestionTier, number> = { RISK: 0, DECISION: 1, PHASE: 2, ADVISORY: 3 };

export type Suggestion = {
  type: SuggestionType;
  title: string;
  explanation: string;
  /** 누르면 일어나는 일. null = 알려 주기만 한다 */
  action: ActionType | null;
  priority: number;
  allowedWhileDriving: boolean;
  confirmationRequired: boolean;
  status: SuggestionStatus;
  /** 왜 지금 이 제안인가 — 화면에 그대로. 종류를 섞지 않는다 */
  evidence: Evidence[];
  tier: SuggestionTier;
  /** 건너뛰면 어떻게 되나 — 사람이 "건너뛰기"를 누르기 전에 알 수 있게 */
  ifSkipped: string;
};

/**
 * 판단 근거의 종류 — **차량이 알려 준 값 · 사용자가 정한 값 · 우리 추정 · 판단 규칙**을 나눈다.
 * 섞으면 추정이 사실처럼 읽힌다 (CLAUDE.md 정책 2). 차량 값이 모의인지 실제인지는 화면이 함께 적는다.
 */
export type EvidenceKind = "VEHICLE" | "USER" | "ESTIMATE" | "RULE";
export type Evidence = { kind: EvidenceKind; text: string };

/** 근거 문장에 넣을 값들 — 판단에는 쓰지 않는다. 설명만 한다 */
export type PlannerContext = {
  profileName: string;
  batteryPct: number | null;
  waitMinutes: number;
  minReservePct: number;
  tripMinutes: number | null;
  breakIntervalMinutes: number;
  remainingKm: number | null;
};

/**
 * 점수 가중치 — **초기 설계값**이다 (스펙 6.3). 사용자 테스트로 바꾼다.
 * 상황 관련성 40 · 중요도 25 · 시점 적합성 20 · 새로움 15.
 */
export const PLANNER_WEIGHTS = { relevance: 0.4, importance: 0.25, timing: 0.2, novelty: 0.15 } as const;

/** 거절한 제안은 이 시간 동안 다시 띄우지 않는다 */
export const DISMISS_COOLDOWN_MS = 10 * 60_000;
/** 보여 준 지 이 시간 안이면 "새롭지 않다" */
export const SHOWN_RECENT_MS = 5 * 60_000;
/** 같은 제안을 이만큼 연달아 거절하면 먼저 띄우지 않고 추천함에만 둔다 (규칙 기반 학습, 스펙 3.4) */
export const DISMISS_STREAK_LIMIT = 3;
/** 주행 중에는 이 중요도 이상만 앞에 낸다. 나머지는 정차할 때까지 보류 */
export const DRIVING_MIN_IMPORTANCE = 0.7;
/** 공조 설정 차이가 이보다 작으면 제안하지 않는다(°C) */
export const CLIMATE_GAP_MIN_C = 1;
/** 주요 제안 옆에 함께 보여 줄 할 일 — 많으면 "하나만 제안" 이 무너진다 */
export const MAX_COMPANIONS = 2;

export type SuggestionRecord = { dismissStreak: number; lastShownAt: number | null; lastDismissedAt: number | null; doneThisTrip: boolean };
export type SuggestionHistory = Partial<Record<SuggestionType, SuggestionRecord>>;

const EMPTY_RECORD: SuggestionRecord = { dismissStreak: 0, lastShownAt: null, lastDismissedAt: null, doneThisTrip: false };
const rec = (h: SuggestionHistory, t: SuggestionType) => h[t] ?? EMPTY_RECORD;

export const recordShown = (h: SuggestionHistory, t: SuggestionType, now: number): SuggestionHistory => ({ ...h, [t]: { ...rec(h, t), lastShownAt: now } });
export const recordDismissed = (h: SuggestionHistory, t: SuggestionType, now: number): SuggestionHistory =>
  ({ ...h, [t]: { ...rec(h, t), dismissStreak: rec(h, t).dismissStreak + 1, lastDismissedAt: now } });
export const recordAccepted = (h: SuggestionHistory, t: SuggestionType): SuggestionHistory => ({ ...h, [t]: { ...rec(h, t), dismissStreak: 0, doneThisTrip: true } });
/**
 * "지금 그대로 둘게요" — 거절로 배우되(연속 거절 +1) **이번 이동에서는 다시 묻지 않는다.**
 * 공조처럼 사용자가 값을 정한 것을 10분마다 다시 묻는 것은 비서가 아니라 잔소리다.
 */
export const recordKept = (h: SuggestionHistory, t: SuggestionType, now: number): SuggestionHistory =>
  ({ ...h, [t]: { ...rec(h, t), dismissStreak: rec(h, t).dismissStreak + 1, lastDismissedAt: now, doneThisTrip: true } });
/** 사용자가 추천함에서 다시 켠다 — 연속 거절을 지운다 */
export const reactivate = (h: SuggestionHistory, t: SuggestionType): SuggestionHistory => ({ ...h, [t]: { ...rec(h, t), dismissStreak: 0, lastDismissedAt: null } });
/** 새 여정 — "이번 여정에서 했음"만 지운다. 거절 학습은 남긴다 */
export const newTrip = (h: SuggestionHistory): SuggestionHistory =>
  Object.fromEntries(Object.entries(h).map(([k, r]) => [k, { ...r, doneThisTrip: false }])) as SuggestionHistory;

export type EnergySignal = { verdict: Verdict; message: string };

/** 쉼표 DRIVE 엔진의 판정을 제안 입력으로. 충분(OK)이면 꺼낼 것이 없다 */
export function energySignalOf(plan: TripPlan, v: VehicleSnapshot): EnergySignal | null {
  const e = estimate(plan, v);
  const verdict = verdictOf(e);
  return verdict === "OK" ? null : { verdict, message: e.message };
}

export type PlannerInput = {
  journey: JourneyState;
  /** isRestricted(signals) — 주행 중 화면 규칙 */
  restricted: boolean;
  /** 시연 시계(ms). 브라우저 시계를 쓰지 않는다 — 시나리오를 똑같이 다시 돌리려고 */
  now: number;
  energy: EnergySignal | null;
  breakPhase: BreakPhase | null;
  /** 프로필에 저장한 온도와 지금 차의 온도. 차가 못 알려 주면 null */
  climate: { currentC: number; targetC: number } | null;
  /** 하차 체크리스트에서 아직 확인하지 않은 항목 수 */
  checklistPending: number;
  /** 사용자가 "먼저 제안" 을 껐으면 false — 전부 추천함으로 간다 */
  proactive: boolean;
  /** 탑승 조합의 안내 빈도가 "최소 안내"면 true — 주의(ADVISORY) 등급은 앞에 띄우지 않고 추천함으로. 위험·단계 할 일은 그대로 (cabin.ts Guidance) */
  quiet?: boolean;
  /** Mission 힌트(V5) — 복귀 목적지가 있고 아직 귀가 구간을 준비하지 않았으면 대기 중에 한 번 묻는다. 없으면 묻지 않는다(없는 목적지를 만들지 않는다) */
  mission?: { nextLegReady: boolean; returnDestination: string | null };
  history: SuggestionHistory;
  context: PlannerContext;
};

const km1 = (km: number) => Math.round(km * 10) / 10;
/** "집 (귀가)" → "집" — 카드 한 줄에서 괄호 설명을 뺀다 */
const placeName = (d: string) => d.replace(/\s*\(.*\)$/, "");

type Candidate = Omit<Suggestion, "priority" | "status" | "allowedWhileDriving" | "confirmationRequired"> & {
  relevance: number;
  importance: number;
  timing: number;
};

function candidates(i: PlannerInput): Candidate[] {
  const { phase, atDestination } = i.journey;
  const x = i.context;
  const out: Candidate[] = [];
  if (phase === "PREPARING" && i.climate && Math.abs(i.climate.targetC - i.climate.currentC) >= CLIMATE_GAP_MIN_C) {
    out.push({
      type: "PROFILE_PREPARATION", action: "SET_CLIMATE", relevance: 1, importance: 0.6, timing: 1, tier: "PHASE",
      ifSkipped: "건너뛰면 지금 온도를 그대로 두고, 이번 이동에서는 다시 묻지 않습니다.",
      title: `저장한 온도 ${i.climate.targetC}°C 로 맞출까요?`,
      explanation: `지금 차량은 ${i.climate.currentC}°C 입니다. 바꾸기 전에 한 번 더 묻습니다.`,
      evidence: [
        { kind: "USER", text: `${x.profileName} 프로필 저장 온도 ${i.climate.targetC}°C` },
        { kind: "VEHICLE", text: `지금 공조 설정 ${i.climate.currentC}°C` },
        { kind: "RULE", text: `차이 ${km1(Math.abs(i.climate.targetC - i.climate.currentC))}°C — ${CLIMATE_GAP_MIN_C}°C 이상이면 제안` },
      ],
    });
  }
  // 마지막 구간의 목적지에서만 에너지 제안을 거둔다 — 중간 목적지(왕복)에서는 귀로 에너지가 남아 있다
  const finalArrival = atDestination && i.journey.leg >= i.journey.legs - 1;
  if (i.energy && phase !== "FINISHING" && phase !== "COMPLETED" && phase !== "NOT_STARTED" && !(phase === "PARKED" && finalArrival)) {
    out.push({
      type: "ENERGY_DECISION", action: "SUGGEST_CHARGE_STOP", relevance: 1, importance: i.energy.verdict === "SHORT" ? 1 : 0.7,
      tier: i.energy.verdict === "SHORT" ? "RISK" : "ADVISORY",
      ifSkipped: i.energy.verdict === "SHORT" ? "건너뛰어도 10분 뒤 다시 확인합니다. 부족 판단은 거절해도 추천함으로 미루지 않습니다." : "건너뛰면 10분 뒤 다시 확인합니다.",
      timing: phase === "PREPARING" || phase === "PARKED" ? 1 : 0.8,
      title: i.energy.verdict === "SHORT" ? "충전 계획이 필요해요" : "에너지 여유가 크지 않아요",
      explanation: i.energy.message,
      evidence: [
        ...(x.batteryPct !== null ? [{ kind: "VEHICLE" as const, text: `배터리 ${Math.round(x.batteryPct)}%` }] : []),
        { kind: "USER", text: `도착 후 대기 ${x.waitMinutes}분 · 최소 잔량 ${x.minReservePct}%` },
        { kind: "ESTIMATE", text: i.energy.message },
        { kind: "RULE", text: i.energy.verdict === "SHORT" ? "판정 '부족' — 추정 범위 전체가 최소 잔량에 못 미침" : "판정 '아슬아슬' — 추정 범위 일부가 최소 잔량에 못 미침" },
      ],
    });
  }
  // 곧 도착이면 휴식을 권하지 않는다 — 3km 앞에서 "쉬어 가자"는 말은 도착하면 쉰다는 것보다 못하다
  if (i.breakPhase === "SUGGEST" && phase === "DRIVING") {
    out.push({
      type: "BREAK_PLANNING", action: "SUGGEST_CHARGE_STOP", relevance: 0.8, importance: 0.7, timing: 1, tier: "PHASE",
      ifSkipped: "건너뛰면 10분 뒤 다시 알려 드립니다.",
      title: "쉬어 갈 때가 됐어요", explanation: "정한 휴식 간격이 지났습니다. 다음 정차 후보를 보여 드릴게요.",
      evidence: [
        ...(x.tripMinutes !== null ? [{ kind: "VEHICLE" as const, text: `쉬지 않고 ${x.tripMinutes}분 주행` }] : []),
        { kind: "USER", text: `휴식 간격 ${x.breakIntervalMinutes}분` },
      ],
    });
  }
  if (phase === "APPROACHING" && i.checklistPending > 0) {
    out.push({
      type: "ARRIVAL_PREPARATION", action: null, relevance: 0.9, importance: 0.4, timing: 1, tier: "PHASE",
      ifSkipped: "알림만 드립니다. 도착해 주차하면 하차 준비를 다시 묻습니다.",
      title: "곧 도착합니다", explanation: `내리기 전에 챙길 것 ${i.checklistPending}개가 있습니다.`,
      evidence: [
        ...(x.remainingKm !== null ? [{ kind: "ESTIMATE" as const, text: `목적지까지 ${km1(x.remainingKm)}km (이동 계획 기준)` }] : []),
        { kind: "USER", text: `하차 체크리스트 미확인 ${i.checklistPending}개` },
      ],
    });
  }
  // 방문·대기 중(귀가 구간 남음) — 귀가 일정을 한 번 확인한다. 내비 목적지는 앱이 바꾸지 않고, 차가 출발하면 어차피 귀가 구간이 된다(journey). 수락은 "준비됨" 표시다
  if (phase === "WAITING" && i.mission && !i.mission.nextLegReady && i.mission.returnDestination) {
    out.push({
      type: "NEXT_LEG", action: "PREPARE_NEXT_LEG", relevance: 1, importance: 0.75, timing: 1, tier: "DECISION",
      ifSkipped: "건너뛰면 10분 뒤 다시 묻습니다. 차가 출발하면 귀가 구간으로 넘어갑니다.",
      // 차량 화면에서 한눈에 — 제목은 짧게, 줄마다 하나(오너 2026-11-03). 마지막 줄이 주의: 귀가 일정 확인 ≠ 내비 목적지 설정
      title: "방문을 마치셨나요?",
      explanation: `귀가 일정이 남아 있어요.\n다음 이동: ${placeName(i.mission.returnDestination)}으로\n내비게이션 목적지는 직접 설정해야 합니다.`,
      evidence: [
        { kind: "USER", text: `저장된 복귀 목적지 ${i.mission.returnDestination}` },
        { kind: "RULE", text: "중간 목적지 도착은 구간의 끝 · 여정(Mission)은 끝나지 않음" },
      ],
    });
  }
  // 확인할 하차 항목이 없으면 묻지 않는다 — 혼자 출퇴근하는 날 "하차 준비할까요?"는 방해다
  if (phase === "PARKED" && atDestination && i.checklistPending > 0) {
    out.push({
      type: "CHECKLIST_REMINDER", action: "CONFIRM_FINISH", relevance: 1, importance: 0.8, timing: 1, tier: "PHASE",
      ifSkipped: "건너뛰면 10분 뒤 다시 묻습니다.",
      title: "하차 준비를 시작할까요?",
      explanation: "준비물을 하나씩 확인합니다. 차량 내부는 직접 확인해 주세요.",
      evidence: [
        { kind: "VEHICLE", text: i.journey.confidence === "CONFIRMED" ? "기어 P(주차) · 목적지 0.5km 안(이동 계획 기준)" : "주차 브레이크와 정지로 추정한 주차 · 목적지 0.5km 안(이동 계획 기준)" },
        { kind: "RULE", text: "주차해도 하차 화면을 저절로 열지 않고 먼저 묻습니다" },
      ],
    });
  }
  return out;
}

/**
 * 왜 앞에 띄우지 않았나 — "필요할 때만 제안한다"를 검증 가능하게(외부 평가 6 ③: 검토 수 · 표시 수 · 억제와 이유).
 * DONE_THIS_TRIP 이번 여정에서 이미 함 · COOLDOWN 거절 직후 · DRIVING 주행 중 보류 · DISMISSED 연속 거절 · PROACTIVE_OFF "먼저 제안" 끔
 */
export type HeldReason = "DONE_THIS_TRIP" | "COOLDOWN" | "DRIVING" | "DISMISSED" | "PROACTIVE_OFF" | "QUIET";
export const HELD_REASON_LABEL: Record<HeldReason, string> = {
  DONE_THIS_TRIP: "이번 이동에서 이미 함", COOLDOWN: "방금 거절해 10분 쉼", DRIVING: "주행 중이라 정차까지", DISMISSED: "3번 연속 거절", PROACTIVE_OFF: "'먼저 제안' 꺼짐", QUIET: "최소 안내 · 주의 등급은 추천함으로",
};
export type PlanAudit = {
  /** 이번 판단에서 후보로 검토한 제안 수 */
  reviewed: number;
  /** 앞에 띄운 수(주요 1 + 함께 할 일) */
  shown: number;
  /** 띄우지 않은 것과 이유 — 추천함에 있는 것(DEFERRED)과 후보에서 뺀 것(doneThisTrip·쿨다운) 모두 */
  held: { type: SuggestionType; reason: HeldReason }[];
};

export type PlanResult = {
  /** 지금 가장 먼저 할 것 하나 */
  top: Suggestion | null;
  /** 함께 할 일 — 최대 MAX_COMPANIONS. 주행 중에는 없다(한 줄 화면) */
  companions: Suggestion[];
  /** 앞에 띄우지 않은 것 — 지우지 않는다 */
  inbox: Suggestion[];
  audit: PlanAudit;
};

/**
 * 고른다. 순서 (지시서 4절의 계층):
 *  1. 자격 — 이번 여정에서 이미 한 것, 거절 직후(쿨다운)인 것은 뺀다
 *  2. 주행 중이면 주행 중에 못 하는 것·덜 중요한 것은 보류(DEFERRED) — 정차하면 다시 올라온다
 *  3. 사용자 선호 — 연달아 거절한 것(위험 등급은 제외), "먼저 제안" 을 끈 경우는 추천함으로
 *  4. 위험 등급 → 점수 순으로 하나, 그다음 함께 할 일 최대 2개
 * 문제가 없는 날에는 아무것도 내지 않는다 — 그게 정상이다.
 */
export function plan(i: PlannerInput): PlanResult {
  const scored: Suggestion[] = [];
  const held: PlanAudit["held"] = [];
  let reviewed = 0;
  for (const { relevance, importance, timing, ...rest } of candidates(i)) {
    reviewed++;
    const r = rec(i.history, rest.type);
    if (r.doneThisTrip) { held.push({ type: rest.type, reason: "DONE_THIS_TRIP" }); continue; }
    if (r.lastDismissedAt !== null && i.now - r.lastDismissedAt < DISMISS_COOLDOWN_MS) { held.push({ type: rest.type, reason: "COOLDOWN" }); continue; }
    const novelty = r.lastShownAt !== null && i.now - r.lastShownAt < SHOWN_RECENT_MS ? 0 : 1;
    const w = PLANNER_WEIGHTS;
    const priority = Math.round((w.relevance * relevance + w.importance * importance + w.timing * timing + w.novelty * novelty) * 100);
    const whileDriving = rest.action === null || allowedWhileDriving(rest.action);
    // 이유는 검사 순서대로 하나만 적는다 — 주행 중 보류가 먼저, 그다음 거절 학습, 그다음 설정
    const reason: HeldReason | null =
      i.restricted && (!whileDriving || importance < DRIVING_MIN_IMPORTANCE) ? "DRIVING"
      : r.dismissStreak >= DISMISS_STREAK_LIMIT && rest.tier !== "RISK" ? "DISMISSED"
      : !i.proactive ? "PROACTIVE_OFF"
      : i.quiet && rest.tier === "ADVISORY" ? "QUIET" : null;
    if (reason !== null) held.push({ type: rest.type, reason });
    scored.push({
      ...rest, priority, allowedWhileDriving: whileDriving,
      confirmationRequired: rest.action !== null && ACTION_POLICY[rest.action].confirmation,
      status: reason !== null ? "DEFERRED" : "NEW",
    });
  }
  scored.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || b.priority - a.priority);
  const top = scored.find((s) => s.status === "NEW") ?? null;
  const companions = i.restricted ? [] : scored.filter((s) => s !== top && s.status === "NEW").slice(0, MAX_COMPANIONS);
  const inbox = scored.filter((s) => s !== top && !companions.includes(s));
  // NEW 인데 자리가 없어 추천함으로 간 것(함께 할 일 한도 초과)은 억제가 아니라 "자리 없음" — 이유 목록에 넣지 않는다
  return { top, companions, inbox, audit: { reviewed, shown: (top ? 1 : 0) + companions.length, held } };
}
