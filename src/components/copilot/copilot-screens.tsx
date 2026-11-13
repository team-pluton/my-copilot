"use client";

import { useState } from "react";
import { AlertTriangle, BatteryCharging, Check, ChevronDown, ChevronRight, ClipboardCheck, DoorClosed, DoorOpen, Lock, Mic, Minus, Plus, RotateCcw, Snowflake, Sparkles, Trash2, Zap } from "lucide-react";
import { ENERGY_STATUS_LABEL, type EnergyView } from "@/lib/assistant/energy-view";
import type { EnergyOption } from "@/lib/assistant/options";
import { PREPARE_STATE_LABEL, type PrepareItemKey, type PrepareItemState, type PrepareStatus } from "@/lib/assistant/prepare";
import type { DriveLine } from "@/lib/assistant/drive";
import type { WaitMode } from "@/lib/assistant/wait";
import type { Rejudge } from "@/lib/assistant/notify";
import type { ActionState } from "@/lib/assistant/actions";
import type { GateResult } from "@/lib/assistant/gate";
import type { JourneyPhase } from "@/lib/assistant/journey";
import type { Activity, JourneyMemory } from "@/lib/assistant/memory";
import { HELD_REASON_LABEL, type Evidence, type EvidenceKind, type PlanAudit, type Suggestion, type SuggestionType } from "@/lib/assistant/planner";

/** 집계 줄에 쓰는 짧은 이름 — 제안 제목은 상황마다 달라서 종류 이름을 쓴다 */
const SUGGESTION_SHORT: Record<SuggestionType, string> = {
  PROFILE_PREPARATION: "공조 맞추기", ENERGY_DECISION: "충전 판단", BREAK_PLANNING: "휴식 계획", ARRIVAL_PREPARATION: "도착 준비", CHECKLIST_REMINDER: "하차 확인", NEXT_LEG: "귀가 확인",
};
import { CONTEXT_LABEL, CONTEXT_MODES, CONTEXTS, PROFILE_MODES, PROFILE_PRESETS, type ProfileMode, type UserProfile } from "@/lib/assistant/profile";
import { CABIN_RESULT_LABEL, type CabinPlan, type CabinSettled } from "@/lib/assistant/cabin";
import { LEARNING_CAVEAT, type LearnCandidate } from "@/lib/assistant/learning";
import type { Driver, DriverId } from "@/lib/assistant/situation";
import { handoffButton, type HandoffState } from "@/lib/assistant/route-handoff";
import { PASSENGER_LABEL, type PassengerType } from "@/lib/core/model";
import { cn } from "@/lib/utils";
import { Card, CarButton, CarIconButton, Eyebrow, icon, u } from "../demo/car-ui";
import type { Orientation } from "../demo/pleos-shell";
import { AppHeader, Screen, Split } from "../demo/screens";

const PROFILE_PRESETS_GUEST_NAME = PROFILE_PRESETS.GUEST.name;

/**
 * MY CO-PILOT 앱 창 화면 — **표시만** 한다. 판단은 src/lib/assistant(순수 로직), 상태는 CopilotSimulator.
 * 쉼표 DRIVE 화면(screens.tsx)과 같은 위계 규칙: 큰 것 하나 · 보조 정보 · 주요 행동 하나.
 * 에너지·후보·주행 중 화면은 쉼표 DRIVE 것을 그대로 쓴다 — 여기 없는 이유다.
 */
export type CopilotScreenId = "home" | "detail" | "profile" | "prepare" | "energy" | "stops" | "finish" | "history";

export const COPILOT_SCREENS: { id: CopilotScreenId; title: string; hint: string }[] = [
  { id: "home", title: "A 메인", hint: "한 화면 — 선택 → 준비 → 조용히 → 도착" },
  { id: "detail", title: "A 자세히", hint: "근거 · 출처 · 추천함 · 상세 화면들" },
  { id: "profile", title: "B 프로필", hint: "혼자·업무·가족·동승자 · 수동 선택" },
  { id: "prepare", title: "C 출발 준비 (상세)", hint: "공조 단건 흐름 · 준비물" },
  { id: "energy", title: "D 에너지", hint: "쉼표 DRIVE 엔진 그대로" },
  { id: "stops", title: "D 후보", hint: "동승자 조건 경유지" },
  { id: "finish", title: "F 하차", hint: "체크리스트 · 도어 상태" },
  { id: "history", title: "G 기록", hint: "이동 기록 (위치 저장 안 함)" },
];

export const PHASE_LABEL: Record<JourneyPhase, string> = {
  NOT_STARTED: "탑승 전",
  PREPARING: "출발 준비",
  DRIVING: "이동 중",
  APPROACHING: "곧 도착",
  PARKED: "주차",
  FINISHING: "하차 준비",
  WAITING: "대기 중 · 귀가 남음",
  COMPLETED: "이동 완료",
};

const ACTION_LABEL: Record<string, string> = {
  SET_CLIMATE: "설정 확인",
  SUGGEST_CHARGE_STOP: "에너지 보기",
  CONFIRM_FINISH: "하차 준비 시작",
  PREPARE_NEXT_LEG: "귀가 일정 확인",
};

/** Mission 머리(V5 지시서 8절) — 최상단: 이동 목적과 단계 · 복귀 유지 · 대기의 출처. 차량 상태는 아래로 내려간다 */
export type HomeMission = { headline: string; returnLine: string | null; waitLine: string | null };

/* ───────── A 홈 — 한 화면(ONE SCREEN UX, 오너 지시 2026-10-28) ───────── */

/**
 * 메인 화면 하나가 여정 단계를 따라 모습을 바꾼다. 기능 메뉴(PREPARE / ASSIST / ENERGY / FINISH)는 화면 뒤의 엔진 이름이지 탭이 아니다.
 *  · 탑승 전     — "오늘은 누구와 함께 가시나요?" 혼자 · 가족 · 동승자 (지난번 선택은 한 번의 탭으로 그대로)
 *  · 출발 준비   — 저장 취향과 차량 설정을 비교한 짧은 결과 + 승인 **하나** + 준비물(있을 때만) + 에너지 한 줄(있을 때만)
 *  · 주행 중     — 한 줄 화면(CopilotDrivingScreen) — 여기 아니다
 *  · 도착·대기   — 중간 방문이면 귀가 유지, 최종이면 하차 확인
 * 상세(근거 · 출처 · 에너지 계산 · 프로필 · 기록)는 "자세히" 한 버튼 뒤에 둔다 — 숨기는 게 아니라 평상시 정보 밀도를 줄이는 것이다.
 * 글자는 공식 body(28px) 이상, 보조 글은 label-m(24px) 이상.
 */
export type HomeStatus = { vehicleLabel: string; tripLabel: string };

export type HomeChooser = {
  names: Record<ProfileMode, string>;
  /** 지난번 선택 — 있으면 맨 위에 "지난번처럼"으로. 공용 차량을 생각해 자동 적용은 하지 않고 한 번의 탭으로 */
  remembered: ProfileMode | null;
  /** 운전자(수동) — 공식 운전자 인식 API 가 없다. 고르지 않으면 운전석 설정은 유지 */
  drivers: Driver[]; driver: DriverId | null; rememberedDriver: DriverId | null;
  onDriver: (id: DriverId | null) => void;
  onChoose: (m: ProfileMode) => void;
};

/** 출발 준비 카드에 넣을 것 — 실내 취향 비교(승인 하나) · 준비물 · 에너지 한 줄 */
export type HomePrepare = {
  cabin: CabinPlan;
  /** 일괄 적용의 진행 — 승인 뒤 결과가 올 때까지 PENDING, 결과는 항목마다 */
  batch: { phase: "IDLE" | "PENDING" | "DONE" | "KEPT"; settled: CabinSettled | null; message: string | null };
  onApply: () => void; onKeep: () => void;
  packing: { items: string[]; packed: string[]; skipped: boolean; onToggle: (i: string) => void; onPackAll: () => void; onSkip: () => void };
  /** 에너지 한 줄(EV 특화) — 판단이 없거나 지원 안 하면 null */
  energyLine: { text: string; tone: "ok" | "warn" | "muted" } | null;
  /** 남은 확인이 없다 — 준비 끝 */
  ready: boolean;
  /** "아빠 · 가족 · 여행" — DRIVER × OCCUPANCY × JOURNEY 한 줄 */
  situation: string;
  /** 운전석 위치 메모 — 차량 운전자 프로필이 한다는 것을 사람에게 */
  seatMemo: string;
  /** 학습 후보 — 충분한 근거가 있을 때 하나만, 한 번만 */
  candidate: LearnCandidate | null;
  onAccept: (c: LearnCandidate) => void; onDecline: (c: LearnCandidate) => void;
};

export function HomeScreen({
  profile, phase, chooser, status, situation, prepare, top, companions, inboxCount, orientation, atWaypoint, trip, guestDone, mission,
  onPrimary, onDismiss, onStartPrepare, onCharge, onGo, onStartWait, onEndTrip, onStartFinish, onSetWaitMode, side, decision,
}: {
  profile: UserProfile; phase: JourneyPhase;
  chooser: HomeChooser | null;
  status: HomeStatus;
  /** Mission 머리 — 고른 뒤(이동 번호 있음)에만 */
  mission: HomeMission | null;
  /** 지금 상황 한 줄 (예: "부산까지 400km · 도착 후 40분 대기") */
  situation: string;
  /** 출발 준비 중일 때의 카드 재료 */
  prepare: HomePrepare | null;
  top: Suggestion | null; companions: Suggestion[]; inboxCount: number; orientation: Orientation;
  atWaypoint: string | null;
  onPrimary: (s: Suggestion) => void; onDismiss: (s: Suggestion) => void;
  onStartPrepare: () => void; onCharge: () => void; onGo: (s: CopilotScreenId) => void;
  trip: {
    canStartWait: boolean; canEndTrip: boolean; canFinishQuietly: boolean;
    waiting: { title: string; line: string; mode: WaitMode } | null;
    /** 원탭 다음 이동 — 귀가 일정을 확인한 뒤에만(null 이면 숨김). 확인 전 '설정됨'이라 하지 않는다 */
    route: { state: HandoffState; onStart: () => void; onConfirmReplace: () => void; onCancel: () => void } | null;
  };
  guestDone: boolean;
  onStartWait: () => void; onEndTrip: () => void; onStartFinish: () => void; onSetWaitMode: (m: WaitMode) => void;
  side?: React.ReactNode;
  /** V6 통합 판단 카드 — 없으면 V5 화면 그대로 */
  decision?: React.ReactNode;
}) {
  const notStarted = phase === "NOT_STARTED" || phase === "COMPLETED";
  if (chooser) return <ChooserScreen chooser={chooser} orientation={orientation} />;
  const preparing = phase === "PREPARING" && prepare;
  // 화면 위계(V5 지시서 8절): 최상단 Mission 목적·단계 → 중앙 다음 행동 하나 → 하단 차량 상태 요약. 출발 준비 중에는 준비 카드가 주인공, 위험 제안(충전 부족)은 그 위에 하나만
  const main = (
    <>
      {mission ? (
        <div className="flex flex-col" style={{ gap: u(6) }} aria-label="Mission">
          <p className="t-title-m">{mission.headline}</p>
          {mission.returnLine && <p className="t-body-m text-p-text2">{mission.returnLine}</p>}
          {mission.waitLine && <p className="t-label-m text-p-text3">{mission.waitLine}</p>}
        </div>
      ) : <p className="t-title-s">{situation}</p>}
      {decision}
      {trip.waiting && (
        <Card tone="high" className="flex flex-col" style={{ gap: u(16) }}>
          <p className="t-title-m">{trip.waiting.title}</p>
          <p className="t-body-m text-p-text2">{trip.waiting.line}</p>
          <WaitModePicker mode={trip.waiting.mode} onChange={onSetWaitMode} />
          <div className="grid grid-cols-2" style={{ gap: u(12) }}>
            <CarButton size="medium" onClick={onStartFinish}>잠시 내리기</CarButton>
            <CarButton size="medium" onClick={onEndTrip}>여정 끝내기</CarButton>
          </div>
          {trip.route && <RouteHome r={trip.route} />}
        </Card>
      )}
      {atWaypoint && (
        <Card tone="high" className="flex items-center justify-between" style={{ gap: u(16) }}>
          <p className="t-body-m flex items-center" style={{ gap: u(10) }}><Zap style={icon(30)} className="text-p-charging shrink-0" /> {atWaypoint} · 충전 중</p>
          <CarButton size="medium" tone="positive" onClick={onCharge}>80% 충전 완료</CarButton>
        </Card>
      )}
      {/* 위험 등급 제안(에너지 부족)은 준비 중에도 맨 위 — 그 밖의 제안은 준비 카드 뒤 */}
      {top && top.tier === "RISK" && <SuggestionCard top={top} onPrimary={onPrimary} onDismiss={onDismiss} onGo={onGo} />}
      {preparing && <PrepareCard profile={profile} p={prepare} />}
      {!preparing && !((trip.waiting || atWaypoint) && !top) && (
        notStarted ? (
          <Card className="flex flex-col" style={{ gap: u(14) }}>
            <p className="t-title-l">{phase === "COMPLETED" ? "이동을 마쳤습니다" : profile.mode === "GUEST" ? "출발 준비를 할까요?" : `${profile.name} · 저장된 취향으로 준비할까요?`}</p>
            <p className="t-body-m text-p-text2">{phase === "COMPLETED"
              ? guestDone ? "탑승 조합을 고르면 다음에는 공조·시트·준비물·하차 확인까지 함께 챙깁니다." : "다음 이동도 같은 조합이면 한 번의 탭으로 준비합니다."
              : profile.mode === "GUEST" ? "개인 취향 없이 내비 경로로 충전이 필요한지만 봅니다." : "온도·시트·음악·안내 방식을 지금 차량 설정과 비교해 다른 것만 제안합니다."}</p>
          </Card>
        ) : top && top.tier !== "RISK" ? <SuggestionCard top={top} onPrimary={onPrimary} onDismiss={onDismiss} onGo={onGo} /> : !top && !trip.waiting && !atWaypoint ? (
          <Card className="flex flex-col" style={{ gap: u(14) }}>
            <p className="t-title-l">지금은 드릴 제안이 없습니다</p>
            <p className="t-body-m text-p-text2">문제가 없으면 조용히 있습니다. 상황이 바뀌면 하나만 골라 알려 드립니다.</p>
          </Card>
        ) : null
      )}
      {notStarted && <CarButton tone="positive" block onClick={onStartPrepare}><Sparkles style={icon(34)} /> {phase === "COMPLETED" ? (guestDone ? "새 이동 (프로필 없이)" : `${profile.name}으로 다시 준비`) : "준비 시작"}</CarButton>}
      {trip.canFinishQuietly && <CarButton tone="positive" block onClick={onEndTrip}><Check style={icon(32)} /> 이동 마치기</CarButton>}
      {(trip.canStartWait || trip.canEndTrip) && !trip.waiting && (
        <div className="grid grid-cols-2" style={{ gap: u(12) }}>
          {trip.canStartWait && <CarButton size="medium" onClick={onStartWait}>내리지 않고 기다리기</CarButton>}
          {trip.canEndTrip && <CarButton size="medium" onClick={onEndTrip}>여정 끝내기</CarButton>}
        </div>
      )}
      {/* 함께 할 일 — 준비 중에는 준비 카드가 다 품는다 */}
      {!preparing && companions.length > 0 && (
        <div className="flex flex-col" style={{ gap: u(10) }}>
          <Eyebrow>함께 준비할 것</Eyebrow>
          {companions.map((s) => (
            <Card key={s.type} pad={20} className="flex items-center justify-between" style={{ gap: u(16) }}>
              <span className="t-body-m min-w-0">{s.title}</span>
              <CarButton size="medium" onClick={() => onPrimary(s)}>{s.action ? COMPANION_LABEL[s.action] ?? "보기" : "확인"}</CarButton>
            </Card>
          ))}
        </div>
      )}
      {/* 하단 — 차량 상태와 여정 상태(따로) · 지금 상황 한 줄. 필요한 요약만 */}
      <div className="flex flex-col" style={{ gap: u(8) }}>
        <div className="flex flex-wrap items-center" style={{ gap: u(10) }}>
          <Pill label="차량" value={status.vehicleLabel} />
          <Pill label="여정" value={status.tripLabel} />
          <span className="t-label-m text-p-text3">시연 데이터</span>
        </div>
        {mission && <p className="t-body-m text-p-text2">{situation}</p>}
      </div>
      {/* 상세는 한 버튼 뒤 — 근거 · 출처 · 에너지 계산 · 프로필 · 기록 */}
      <button type="button" onClick={() => onGo("detail")} className="t-label-m text-p-text3 flex items-center justify-center self-center" style={{ gap: u(6), minHeight: u(56) }}>
        자세히{inboxCount > 0 ? ` · 추천함 ${inboxCount}` : ""} <ChevronRight style={icon(24)} />
      </button>
    </>
  );
  return (
    <Screen>
      <AppHeader title="MY CO-PILOT" sub={profile.name} />
      <Split orientation={orientation} main={main} side={side} />
    </Screen>
  );
}

/** 탑승 전 — 질문 하나. 맥락 셋 중 하나를 고르면 바로 출발 준비(비교)가 시작된다. 지난번 조합은 맨 위에 */
function ChooserScreen({ chooser, orientation }: { chooser: HomeChooser; orientation: Orientation }) {
  // 맥락 버튼 하나로 바로 간다(맥락의 첫 조합). 둘째 조합(업무일 등)은 작은 칩 — 처음은 간단히, 반복은 더 편하게
  const extra = CONTEXTS.flatMap((c) => CONTEXT_MODES[c].slice(1).map((m) => ({ c, m })));
  return (
    <Screen>
      <AppHeader title="MY CO-PILOT" sub="시작" />
      <Split orientation={orientation} main={
        <Card className="flex flex-1 flex-col justify-center" style={{ gap: u(20) }}>
          <Eyebrow>탑승</Eyebrow>
          <p className="t-title-l">오늘은 누구와 함께 가시나요?</p>
          {chooser.remembered && (
            <CarButton tone="positive" block onClick={() => { chooser.onDriver(chooser.rememberedDriver); chooser.onChoose(chooser.remembered!); }}>
              <Sparkles style={icon(32)} /> 지난번처럼 · {chooser.rememberedDriver ? `${chooser.drivers.find((d) => d.id === chooser.rememberedDriver)?.name ?? ""} · ` : ""}{chooser.names[chooser.remembered]}
            </CarButton>
          )}
          {/* 운전자는 사용자가 고른다 — 공개 SDK 에 운전자 프로필·디지털 키 API 가 없다(javap). 고르지 않으면 운전석 설정은 유지 */}
          <div className="flex flex-wrap items-center" style={{ gap: u(10) }} role="radiogroup" aria-label="운전자">
            <span className="t-label-m text-p-text3">운전자</span>
            {chooser.drivers.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={chooser.driver === d.id} onClick={() => chooser.onDriver(chooser.driver === d.id ? null : d.id)}
                className={cn("t-body-m t-strong", chooser.driver === d.id ? "bg-p-filled text-p-filled-text" : "bg-p-btn text-p-text")} style={{ minHeight: u(64), padding: `${u(8)} ${u(24)}`, borderRadius: u(20) }}>{d.name}</button>
            ))}
            <span className="t-label-m text-p-text3">{chooser.driver ? "운전석 취향 적용" : "미확인 · 운전석은 차량 프로필 그대로"}</span>
          </div>
          <div className="grid grid-cols-3" style={{ gap: u(12) }}>
            {CONTEXTS.map((c) => <CarButton key={c} block onClick={() => chooser.onChoose(CONTEXT_MODES[c][0])}>{CONTEXT_LABEL[c]}</CarButton>)}
          </div>
          {extra.length > 0 && (
            <div className="flex flex-wrap items-center" style={{ gap: u(10) }}>
              {extra.map(({ c, m }) => <CarButton key={m} size="medium" onClick={() => chooser.onChoose(m)}>{CONTEXT_LABEL[c]} · {chooser.names[m]}</CarButton>)}
            </div>
          )}
          <p className="t-label-m text-p-text3">동승자는 자동으로 알아내지 않습니다 — 고른 것만 씁니다. 고르면 저장된 취향과 지금 차량 설정을 비교해 다른 것만 제안합니다.</p>
          <button type="button" onClick={() => chooser.onChoose("GUEST")} className="t-label-m text-p-text3 self-center" style={{ minHeight: u(48) }}>프로필 없이 시작</button>
        </Card>
      } />
    </Screen>
  );
}

/** 원탭 다음 이동 — 차량용 앱 RouteHomeBlock 과 같은 구성. 결과 문장은 리듀서(route-handoff.ts)가 정한다 */
function RouteHome({ r }: { r: NonNullable<Parameters<typeof HomeScreen>[0]["trip"]["route"]> }) {
  const h = r.state;
  const tone = h.phase === "FAILED" || h.phase === "NO_HOME" ? "text-p-negative" : h.phase === "VERIFIED" ? "text-p-active" : "text-p-text2";
  const button = handoffButton(h);
  return (
    <div className="flex flex-col" style={{ gap: u(10) }}>
      {h.message && <p className={cn("t-body-m", tone)}>{h.message}</p>}
      {h.phase === "LOOKING" && <p className="t-label-m text-p-text3">내비 즐겨찾기와 지금 경로를 확인하는 중</p>}
      {(h.phase === "PENDING" || h.phase === "UNKNOWN_OUTCOME") && <p className="t-label-m text-p-text3">내비에 경로를 요청했어요 · 목적지를 다시 읽어 확인하는 중</p>}
      {h.phase === "CONFIRM_REPLACE" ? (
        <div className="grid grid-cols-2" style={{ gap: u(12) }}>
          <CarButton size="medium" tone="positive" onClick={r.onConfirmReplace}>집 경로로 바꾸기</CarButton>
          <CarButton size="medium" onClick={r.onCancel}>기존 경로 유지</CarButton>
        </div>
      ) : button && <CarButton tone="positive" block onClick={r.onStart}>{button}</CarButton>}
    </div>
  );
}

function SuggestionCard({ top, onPrimary, onDismiss, onGo }: { top: Suggestion; onPrimary: (s: Suggestion) => void; onDismiss: (s: Suggestion) => void; onGo: (s: CopilotScreenId) => void }) {
  return (
    <>
      <Card className="flex flex-col" style={{ gap: u(14) }}>
        <p className="t-title-l">{top.title}</p>
        <p className="t-body-m text-p-text2 whitespace-pre-line">{top.explanation}</p>
        <button type="button" onClick={() => onGo("detail")} className="t-label-m text-p-text3 flex items-center self-start" style={{ gap: u(6), minHeight: u(48) }}>
          왜 이 제안인가요? <ChevronRight style={icon(24)} />
        </button>
      </Card>
      <div className="flex flex-col" style={{ gap: u(10) }}>
        <CarButton tone="positive" block onClick={() => onPrimary(top)}>{top.action ? ACTION_LABEL[top.action] : "확인"}</CarButton>
        <CarButton block size="medium" onClick={() => onDismiss(top)}>이번에는 건너뛰기</CarButton>
        <p className="t-label-m text-p-text3 text-center">{top.ifSkipped}</p>
      </div>
    </>
  );
}

const DECISION_TONE: Record<string, string> = { APPLY: "text-p-text", SAME: "text-p-active", REMEMBER_ONLY: "text-p-text2", NO_PREF: "text-p-text3", UNSUPPORTED: "text-p-text3", NO_PERMISSION: "text-p-text2", UNKNOWN_STATE: "text-p-text2", RESTRICTED: "text-p-text2" };

/**
 * 출발 준비 카드 — 짧은 결과 한 문장 → 달라서 바꿀 것(승인 하나) → 차량에서 직접 볼 것 → 준비물(있을 때만) → 에너지 한 줄(EV).
 * 전부 맞으면 "확인했어요" 한 줄로 끝난다 — 버튼을 누르라고 하지 않는다. 제어 결과는 항목마다, 확인 전에는 '적용 완료'라 하지 않는다.
 */
function PrepareCard({ profile, p }: { profile: UserProfile; p: HomePrepare }) {
  const { cabin, batch, packing } = p;
  const show = cabin.items.filter((x) => x.decision !== "NO_PREF" && !(x.decision === "SAME" && batch.phase === "IDLE" && cabin.toApply.length > 0));
  const packLeft = packing.items.filter((i) => !packing.packed.includes(i));
  return (
    <>
      {p.candidate && (
        <Card tone="high" className="flex flex-col" style={{ gap: u(12) }} aria-label="취향 후보">
          <Eyebrow>기억할까요 · 차량 상태 변화를 관찰한 것</Eyebrow>
          <p className="t-body-m">{p.candidate.line}</p>
          <p className="t-label-m text-p-text3">{LEARNING_CAVEAT}</p>
          <div className="grid grid-cols-2" style={{ gap: u(12) }}>
            <CarButton size="medium" tone="positive" onClick={() => p.onAccept(p.candidate!)}>저장</CarButton>
            <CarButton size="medium" onClick={() => p.onDecline(p.candidate!)}>이번엔 아니요</CarButton>
          </div>
        </Card>
      )}
      <Card className="flex flex-col" style={{ gap: u(14) }}>
        <Eyebrow>{p.situation}</Eyebrow>
        <p className="t-title-l flex items-center" style={{ gap: u(12) }}>{p.ready && <Check style={icon(40)} className="text-p-active" />} {batch.phase === "DONE" && batch.settled ? batch.settled.summary : batch.phase === "KEPT" ? "지금 설정 그대로 갑니다" : cabin.summary}</p>
        {batch.phase === "DONE" && batch.settled ? (
          <ul className="t-body-m flex flex-col" style={{ gap: u(6) }}>
            {batch.settled.results.map((r) => <li key={r.key} className={r.status === "APPLIED" ? "text-p-active" : "text-p-negative"}>· {r.line} <span className="t-label-m text-p-text3">{CABIN_RESULT_LABEL[r.status]}</span></li>)}
          </ul>
        ) : show.length > 0 && (
          <ul className="t-body-m flex flex-col" style={{ gap: u(6) }}>
            {show.map((x) => <li key={x.key} className={DECISION_TONE[x.decision]}>· {x.line}</li>)}
          </ul>
        )}
        {batch.message && <p className="t-body-m text-p-negative flex items-start" style={{ gap: u(8) }}><AlertTriangle style={icon(28)} className="mt-[calc(2*var(--u))] shrink-0" /><span>{batch.message}</span></p>}
        {batch.phase === "IDLE" && cabin.toApply.length > 0 && (
          <div className="grid grid-cols-2" style={{ gap: u(12) }}>
            <CarButton tone="positive" onClick={p.onApply}>{cabin.toApply.length}개 한 번에 적용</CarButton>
            <CarButton onClick={p.onKeep}>지금 그대로</CarButton>
          </div>
        )}
        {batch.phase === "PENDING" && <CarButton block loading disabled>차량에 적용 중 · 결과를 다시 읽습니다</CarButton>}
        <p className="t-label-m text-p-text3">{p.seatMemo}</p>
      </Card>
      {packing.items.length > 0 && (
        <Card className="flex flex-col" style={{ gap: u(12) }}>
          <div className="flex items-center justify-between"><Eyebrow>준비물 · {packing.packed.length}/{packing.items.length}</Eyebrow>{packLeft.length === 0 ? <span className="t-label-m t-strong text-p-active">모두 챙김</span> : packing.skipped ? <span className="t-label-m text-p-text2">이번에는 건너뜀</span> : null}</div>
          <ChecklistItems items={packing.items} checked={packing.packed} onToggle={packing.onToggle} />
          {packLeft.length > 0 && !packing.skipped && (
            <div className="grid grid-cols-2" style={{ gap: u(12) }}>
              <CarButton size="medium" tone="positive" onClick={packing.onPackAll}><Check style={icon(28)} /> 모두 챙겼어요</CarButton>
              <CarButton size="medium" onClick={packing.onSkip}>이번에는 건너뛰기</CarButton>
            </div>
          )}
        </Card>
      )}
      {p.energyLine && (
        <p className={cn("t-body-m flex items-center", p.energyLine.tone === "ok" ? "text-p-active" : p.energyLine.tone === "warn" ? "text-p-text" : "text-p-text3")} style={{ gap: u(10) }}>
          <BatteryCharging style={icon(28)} className="shrink-0" /> {p.energyLine.text}
        </p>
      )}
      {p.ready && <p className="t-body-m text-p-active flex items-center justify-center text-center" style={{ gap: u(8) }}><Check style={icon(30)} /> 출발하세요 — 출발하면 한 줄 화면으로 바뀝니다</p>}
      <p className="t-label-m text-p-text3 text-center">{profile.cabin.guidance === "QUIET" ? "최소 안내 · 주행 중에는 위험한 것만 말합니다" : "일반 안내"}</p>
    </>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="t-label-m bg-p-surface-high flex items-center" style={{ gap: u(8), padding: `${u(6)} ${u(16)}`, borderRadius: u(40) }}>
      <span className="text-p-text3">{label}</span><span className="t-strong">{value}</span>
    </span>
  );
}

/** 대기 유형 — 사용자가 알려 주는 사실이다. 차 안이면 공조가 대기 시간만큼 배터리를 쓴다 */
export function WaitModePicker({ mode, onChange, disabled = false }: { mode: WaitMode; onChange: (m: WaitMode) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-2" style={{ gap: u(10) }} role="radiogroup" aria-label="대기 유형">
      {(["AWAY", "IN_CAR"] as const).map((m) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={disabled} onClick={() => onChange(m)}
          className={cn("t-body-m t-strong disabled:opacity-40", mode === m ? "bg-p-filled text-p-filled-text" : "bg-p-btn text-p-text")}
          style={{ minHeight: u(80), padding: `${u(12)} ${u(20)}`, borderRadius: u(24) }}>
          {m === "AWAY" ? "차를 두고 다녀옴" : "차 안에서 기다림"}
          <span className={cn("t-label-m block font-normal", mode === m ? "opacity-80" : "text-p-text3")}>{m === "AWAY" ? "주차 중 공조 미사용 가정" : "공조 사용 가정 · 배터리를 씀"}</span>
        </button>
      ))}
    </div>
  );
}

const COMPANION_LABEL: Record<string, string> = { SET_CLIMATE: "맞추기", SUGGEST_CHARGE_STOP: "보기", CONFIRM_FINISH: "시작", PREPARE_NEXT_LEG: "확인" };

/* ───────── 상세 — 왜 이 제안인가 · 데이터 출처 · 추천함 · 제안 규칙 ───────── */

export type SourceRow = { label: string; value: string; line: string | null; usable: boolean };

/** 가로(확장 앱 창) 홈 오른쪽 열 — 판단 근거와 값의 출처. 본문을 늘리는 대신 확장 정보를 놓는다 */
export function DetailSide({ top, sources }: { top: Suggestion | null; sources: SourceRow[] }) {
  return (
    <>
      <Card className="flex flex-col" style={{ gap: u(12) }}>
        <Eyebrow>왜 이 제안인가</Eyebrow>
        {top ? <><p className="t-body-m t-strong">{top.title}</p><EvidenceList items={top.evidence} /></> : <p className="t-body-m text-p-text2">지금은 제안이 없습니다.</p>}
      </Card>
      <Card className="flex flex-col" style={{ gap: u(10) }}>
        <Eyebrow>값의 출처</Eyebrow>
        {sources.map((s) => (
          <div key={s.label} className="t-label-m flex items-baseline justify-between" style={{ gap: u(12) }}>
            <span className="text-p-text3 shrink-0">{s.label}</span>
            <span className={cn("min-w-0 text-right", s.usable ? "text-p-text" : "text-p-text3")}>{s.value}{s.line ? ` · ${s.line}` : ""}</span>
          </div>
        ))}
      </Card>
    </>
  );
}

export function DetailScreen({ top, inbox, sources, audit, orientation, onReactivate, onBack, onGo }: {
  top: Suggestion | null; inbox: Suggestion[]; sources: SourceRow[];
  /** 이번 판단의 집계 — 검토 · 앞에 띄움 · 띄우지 않은 이유. "필요할 때만 제안한다"를 보이게 */
  audit: PlanAudit; orientation: Orientation;
  onReactivate: (s: Suggestion) => void; onBack: () => void;
  /** 상세 화면들로 — 메인 화면에는 이 길이 없다(한 화면) */
  onGo: (s: CopilotScreenId) => void;
}) {
  const heldLines = audit.held.map((h) => `${SUGGESTION_SHORT[h.type]} — ${HELD_REASON_LABEL[h.reason]}`);
  const rules = (
    <Card tone="high">
      <Eyebrow>지금 판단의 집계</Eyebrow>
      <p className="t-body-m" style={{ marginTop: u(8) }}>검토 {audit.reviewed} · 앞에 띄움 {audit.shown} · 띄우지 않음 {audit.held.length}</p>
      {heldLines.length > 0 && (
        <ul className="t-label-m text-p-text2 flex flex-col" style={{ marginTop: u(6), gap: u(4) }}>
          {heldLines.map((l) => <li key={l}>· {l}</li>)}
        </ul>
      )}
      <div style={{ marginTop: u(16) }}><Eyebrow>제안은 이렇게 고릅니다</Eyebrow></div>
      <ul className="t-label-m text-p-text2 flex flex-col" style={{ marginTop: u(12), gap: u(8) }}>
        <li>· 주행 중 금지·권한 없음·미지원은 먼저 뺍니다</li>
        <li>· 위험(에너지 부족) → 지금 단계의 할 일 → 참고 순서</li>
        <li>· 거절하면 10분 쉬고, 3번 연속이면 추천함으로 (에너지 부족은 예외)</li>
        <li>· 주행 중에는 중요한 것 하나만, 나머지는 정차할 때까지</li>
        <li>· 문제가 없으면 아무것도 제안하지 않습니다</li>
      </ul>
    </Card>
  );
  return (
    <Screen>
      <AppHeader title="자세히" sub="판단 근거 · 출처" />
      <Split
        orientation={orientation}
        main={
          <>
            <div className="grid grid-cols-5" style={{ gap: u(10) }}>
              {([["prepare", "출발 준비"], ["energy", "에너지"], ["stops", "후보"], ["profile", "프로필"], ["history", "기록"]] as const).map(([id, label]) => (
                <CarButton key={id} size="medium" onClick={() => onGo(id)}>{label}</CarButton>
              ))}
            </div>
            <Card className="flex flex-col" style={{ gap: u(14) }}>
              <Eyebrow>지금 제안</Eyebrow>
              {top ? (
                <>
                  <p className="t-title-m">{top.title}</p>
                  <p className="t-body-m text-p-text2 whitespace-pre-line">{top.explanation}</p>
                  <EvidenceList items={top.evidence} />
                  <p className="t-label-m text-p-text3">건너뛰면 · {top.ifSkipped}</p>
                </>
              ) : <p className="t-body-m text-p-text2">지금은 제안이 없습니다.</p>}
            </Card>
            <Card className="flex flex-col" style={{ gap: u(10) }}>
              <Eyebrow>값의 출처</Eyebrow>
              {sources.map((s) => (
                <div key={s.label} className="t-label-m flex items-baseline justify-between" style={{ gap: u(12) }}>
                  <span className="text-p-text3 shrink-0">{s.label}</span>
                  <span className={cn("min-w-0 text-right", s.usable ? "text-p-text" : "text-p-text3")}>{s.value}{s.line ? ` · ${s.line}` : ""}</span>
                </div>
              ))}
            </Card>
            {inbox.length > 0 && (
              <Card tone="low" className="flex flex-col" style={{ gap: u(10) }}>
                <Eyebrow>추천함 {inbox.length} · 지금 앞에 띄우지 않은 것</Eyebrow>
                {inbox.map((s) => (
                  <div key={s.type} className="t-label-m flex items-center justify-between" style={{ gap: u(12), minHeight: u(48) }}>
                    <span className="text-p-text2 min-w-0">{s.title}</span>
                    {s.status === "DEFERRED"
                      ? <button type="button" onClick={() => onReactivate(s)} className="text-p-positive shrink-0" style={{ minHeight: u(48) }}>다시 켜기</button>
                      : <span className="text-p-text3 shrink-0">정차하면</span>}
                  </div>
                ))}
              </Card>
            )}
            {orientation === "portrait" && rules}
          </>
        }
        side={rules}
        footer={<CarButton block onClick={onBack}>홈으로</CarButton>}
      />
    </Screen>
  );
}

/**
 * "왜 지금?" — 근거를 종류별로. 차량 값에는 늘 출처(모의/실제)를 붙인다.
 * 추정과 사실이 같은 줄에 섞이면 추정이 사실처럼 읽힌다 (CLAUDE.md 정책 2).
 */
// 제품 화면의 출처는 넷뿐 — 웹 시뮬레이터의 차량 값은 늘 시연 데이터다(차량용 앱은 실제 신호가 오면 "차량 정보")
const EVIDENCE_LABEL: Record<EvidenceKind, string> = { VEHICLE: "시연 데이터", USER: "직접 설정", ESTIMATE: "추정", RULE: "판단 규칙" };
const EVIDENCE_TONE: Record<EvidenceKind, string> = {
  VEHICLE: "text-p-positive", USER: "text-p-active", ESTIMATE: "text-p-auto", RULE: "text-p-text3",
};

function EvidenceList({ items }: { items: Evidence[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col" style={{ gap: u(8) }}>
      {items.map((e) => (
        <li key={`${e.kind}-${e.text}`} className="t-label-m flex items-baseline" style={{ gap: u(12) }}>
          <span className={cn("t-strong shrink-0 whitespace-nowrap", EVIDENCE_TONE[e.kind])} style={{ minWidth: u(150) }}>{EVIDENCE_LABEL[e.kind]}</span>
          <span className="text-p-text2 min-w-0">{e.text}</span>
        </li>
      ))}
    </ul>
  );
}

/* ───────── B 프로필 ───────── */

const MODE_ORDER = PROFILE_MODES;
const PASSENGERS: PassengerType[] = ["CHILD", "SENIOR", "PET"];

export function ProfileScreen({ profiles, mode, orientation, onSelect, onChange, onReset, onEditChecklist }: {
  profiles: Record<ProfileMode, UserProfile>; mode: ProfileMode; orientation: Orientation;
  onSelect: (m: ProfileMode) => void; onChange: (p: UserProfile) => void; onReset: () => void;
  /** 하차 체크리스트 고치기 — 세션 게이트(EDIT_CHECKLIST)를 거친다 */
  onEditChecklist: (items: string[]) => void;
}) {
  const p = profiles[mode];
  const lists = (
    <Card className={orientation === "landscape" ? "flex-1" : undefined}>
      <Eyebrow>출발 준비물</Eyebrow>
      <ul className="t-label-m text-p-text2 flex flex-col" style={{ marginTop: u(10), gap: u(6) }}>{p.packing.length ? p.packing.map((i) => <li key={i}>· {i}</li>) : <li>없음</li>}</ul>
      <Eyebrow className="mt-[calc(24*var(--u))]">하차 체크리스트 · {p.finishChecklist.length}개</Eyebrow>
      <ChecklistEditor items={p.finishChecklist} onChange={onEditChecklist} />
    </Card>
  );
  const setTarget = (d: number) => onChange({ ...p, targetC: Math.min(Math.max((p.targetC ?? 22) + d, 16), 30) });
  const togglePassenger = (t: PassengerType) => onChange({ ...p, passengers: p.passengers.includes(t) ? p.passengers.filter((x) => x !== t) : [...p.passengers, t] });
  return (
    <Screen>
      <AppHeader title="내 프로필" sub="정차 중에만 편집" />
      <Split
        orientation={orientation}
        main={
          <>
            <div className="grid grid-cols-3" style={{ gap: u(12) }}>
              {MODE_ORDER.map((m) => (
                <button key={m} type="button" onClick={() => onSelect(m)} aria-pressed={mode === m}
                  className={cn("t-body-m t-strong text-left", mode === m ? "bg-p-filled text-p-filled-text" : "bg-p-btn text-p-text")}
                  style={{ padding: `${u(20)} ${u(24)}`, borderRadius: u(24) }}>
                  {profiles[m].name}
                </button>
              ))}
            </div>
            <Card>
              <Eyebrow>저장한 공조 온도</Eyebrow>
              <div className="flex items-center justify-between" style={{ marginTop: u(12) }}>
                <CarIconButton label="1도 낮추기" onClick={() => setTarget(-1)}><Minus style={icon(32)} /></CarIconButton>
                <p className="t-headline-l tabular-nums">{p.targetC ?? "—"}<span className="t-title-s text-p-text3">°C</span></p>
                <CarIconButton label="1도 올리기" onClick={() => setTarget(1)}><Plus style={icon(32)} /></CarIconButton>
              </div>
              <ToggleRow label="출발할 때 맞추자고 제안" on={p.targetC !== null} onChange={(on) => onChange({ ...p, targetC: on ? 22 : null })} />
            </Card>
            <Card>
              <Eyebrow>동승자 · 수동 설정 (자동 감지 아님)</Eyebrow>
              <div className="flex flex-wrap" style={{ marginTop: u(12), gap: u(12) }}>
                {PASSENGERS.map((t) => (
                  <button key={t} type="button" onClick={() => togglePassenger(t)} aria-pressed={p.passengers.includes(t)}
                    className={cn("t-label-m t-strong", p.passengers.includes(t) ? "bg-p-positive text-white" : "bg-p-btn text-p-text")}
                    style={{ padding: `${u(14)} ${u(24)}`, borderRadius: u(40) }}>{PASSENGER_LABEL[t].name}</button>
                ))}
              </div>
              <p className="t-label-m text-p-text3" style={{ marginTop: u(10) }}>충전 경유지의 필수·선호 시설과 하차 체크리스트가 여기서 정해집니다</p>
            </Card>
            <Card>
              <Eyebrow>안내</Eyebrow>
              {([["먼저 제안", "proactive"], ["음성 안내", "voice"], ["하차 체크리스트 전부 확인해야 완료", "requireAllChecked"]] as const).map(([label, k]) => (
                <ToggleRow key={k} label={label} on={p[k]} onChange={(on) => onChange({ ...p, [k]: on })} />
              ))}
            </Card>
            {orientation === "portrait" && lists}
          </>
        }
        side={
          <>
            {lists}
            <ResetButton onReset={onReset} />
          </>
        }
        footer={orientation === "portrait" ? <ResetButton onReset={onReset} /> : undefined}
      />
    </Screen>
  );
}

/** 켜기/끄기 — 줄 전체가 터치 영역(≥80). 브라우저 체크박스는 차량 UI 부품이 아니고 작다 */
function ToggleRow({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="t-body-s flex w-full items-center justify-between text-left" style={{ minHeight: u(80), gap: u(16) }}>
      <span className="min-w-0">{label}</span>
      <span className={cn("relative shrink-0 transition-colors", on ? "bg-p-positive" : "bg-p-btn")} style={{ width: u(88), height: u(48), borderRadius: u(24) }}>
        <span className="absolute bg-white transition-all" style={{ top: u(6), left: on ? u(46) : u(6), width: u(36), height: u(36), borderRadius: "50%" }} />
      </span>
    </button>
  );
}

/** 하차 체크리스트 편집 — 프로필 화면에서만. 지우기는 여기서만 있다(하차 화면에서 체크하려다 지우지 않게) */
function ChecklistEditor({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => { const t = draft.trim(); if (t && !items.includes(t)) onChange([...items, t]); setDraft(""); };
  return (
    <>
      <ul className="flex flex-col" style={{ marginTop: u(10), gap: u(4) }}>
        {items.map((i) => (
          <li key={i} className="t-body-s flex items-center justify-between" style={{ minHeight: u(64), gap: u(12) }}>
            <span className="min-w-0 truncate">{i}</span>
            <CarIconButton label={`${i} 지우기`} onClick={() => onChange(items.filter((x) => x !== i))}><Trash2 style={icon(28)} /></CarIconButton>
          </li>
        ))}
      </ul>
      <form className="flex" style={{ marginTop: u(12), gap: u(12) }} onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="항목 추가" aria-label="하차 체크리스트 항목 추가"
          className="t-body-s bg-p-btn text-p-text placeholder:text-p-text4 min-w-0 flex-1 outline-none" style={{ height: u(80), padding: `0 ${u(24)}`, borderRadius: u(20) }} />
        <CarButton size="medium" onClick={add}><Plus style={icon(28)} /></CarButton>
      </form>
    </>
  );
}

/** 되돌릴 수 없는 삭제 — 첫 누름은 확인을 연다. 둘째 누름에서만 지운다(취소 가능) */
function ResetButton({ onReset }: { onReset: () => void }) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <div className="grid grid-cols-2" style={{ gap: u(12) }}>
      <CarButton size="medium" onClick={() => setArmed(false)}>취소</CarButton>
      <CarButton size="medium" tone="filled" onClick={() => { setArmed(false); onReset(); }}><Trash2 style={icon(28)} /> 이 프로필만 지우기</CarButton>
    </div>
  ) : <CarButton block size="medium" onClick={() => setArmed(true)}><Trash2 style={icon(28)} /> 개인 설정·기록 삭제</CarButton>;
}

/* ───────── C 출발 준비 — 설정 화면이 아니라 "출발 준비 결과" ───────── */

/**
 * 출발 준비 = 공조 · 준비물 · 에너지 계획을 **하나의 준비 과정**으로(2차 P0-2). 맨 위는 한 문장이다:
 * "출발 준비에서 두 가지는 확인됐고, 충전 계획 한 가지만 남았습니다". 항목마다 끝남 · 할 일 · 직접 확인(앱이 확인 못 함).
 * 남은 일이 없으면 "출발 준비 완료"를 누르라고 하지 않는다. 차량 제어가 막히면 대체 행동을 적는다.
 * 공조 요청의 상태는 actions.ts 리듀서 그대로다(결과 모름 · 재조회 · 늦은 콜백).
 */
export type ClimateState = "SKIP" | "SAME" | "DIFFERENT" | "UNREADABLE";

const PREP_STATE_TONE: Record<PrepareItemState, string> = { DONE: "text-p-active", NEEDS_CHECK: "text-p-text", SKIPPED: "text-p-text2", UNSUPPORTED: "text-p-text3", NOT_APPLICABLE: "text-p-text3" };

/** 이번에는 건너뛰기 — 작은 글자 버튼(완료처럼 보이지 않게) */
function SkipLink({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="t-label-m text-p-text3 self-start" style={{ minHeight: u(56) }}>이번에는 건너뛰기</button>;
}

function PrepState({ s }: { s: PrepareItemState }) {
  return <span className={cn("t-label-m t-strong", PREP_STATE_TONE[s])}>{PREPARE_STATE_LABEL[s]}</span>;
}

export function PrepareScreen({
  profile, targetC, currentC, gate, action, packed, status, prepareDone, orientation,
  onRequest, onConfirm, onKeep, onTogglePack, onGoEnergy, onFinish, onSkip,
}: {
  profile: UserProfile;
  /** 합친 취향의 공조 목표(운전자 × 혼자 soloCabin 포함) — 프로필 targetC 가 아니다 */
  targetC: number | null;
  /** 차량이 알려 준 지금 설정 온도. null = 읽지 못함 */
  currentC: number | null;
  /** 확인했다고 가정하고 미리 돌린 Safety Gate — 막히면 이유와 대체 행동을 적는다 */
  gate: GateResult;
  action: ActionState;
  packed: string[];
  status: PrepareStatus; prepareDone: boolean; orientation: Orientation;
  onRequest: () => void; onConfirm: () => void; onKeep: () => void; onTogglePack: (item: string) => void; onGoEnergy: () => void; onFinish: () => void;
  /** 이번에는 건너뛰기 — 완료가 아니다(남은 일에서만 빠진다) */
  onSkip: (k: PrepareItemKey) => void;
}) {
  const target = targetC;
  const ph = action.phase;
  const [climate, packing, energy] = status.items;
  const blocked = !gate.allowed && gate.block !== "NEEDS_CONFIRMATION";
  const showClimateActions = climate.state === "NEEDS_CHECK" && !blocked;
  return (
    <Screen>
      <AppHeader title="출발 준비" sub={prepareDone || status.ready ? "준비 끝" : `확인 필요 ${status.needs}`} />
      <Split
        orientation={orientation}
        main={
          <>
            <p className="t-title-s">{status.summary}</p>
            {/* 1 · 공조 */}
            {climate.state !== "NOT_APPLICABLE" && (
              <Card className="flex flex-col" style={{ gap: u(12) }}>
                <div className="flex items-center justify-between"><Eyebrow>공조</Eyebrow><PrepState s={climate.state} /></div>
                <p className={cn("t-body-m t-strong", climate.state === "DONE" ? "text-p-active" : climate.state === "UNSUPPORTED" ? "text-p-text2" : "text-p-text")}>
                  {climate.line}
                </p>
                {(ph === "FAILED" || ph === "UNKNOWN_OUTCOME" || (ph === "IDLE" && action.message)) && (
                  <p className="t-body-m text-p-negative flex items-start" style={{ gap: u(8) }}>
                    <AlertTriangle style={icon(28)} className="mt-[calc(2*var(--u))] shrink-0" /><span className="min-w-0 flex-1">{action.message}</span>
                    {/* 출처 표시는 차량 결과에만 — 확인 취소 안내는 차량에서 온 값이 아니다 */}
                    {ph !== "IDLE" && <span className="t-label-m text-p-text3 bg-p-surface-high shrink-0 whitespace-nowrap" style={{ padding: `${u(2)} ${u(10)}`, borderRadius: u(8) }}>{action.source === "MOCK" ? "모의" : "차량"}</span>}
                  </p>
                )}
                {ph === "CONFIRMING" ? (
                  <Card tone="high" className="flex flex-col" style={{ gap: u(14) }}>
                    <p className="t-body-m t-strong flex items-center" style={{ gap: u(10) }}><Snowflake style={icon(30)} /> 차량 공조를 {currentC}°C → {target}°C 로 바꿉니다</p>
                    <div className="grid grid-cols-2" style={{ gap: u(12) }}>
                      <CarButton tone="positive" onClick={onConfirm}>{target}°C 적용</CarButton>
                      <CarButton onClick={onKeep}>지금 그대로 두기</CarButton>
                    </div>
                  </Card>
                ) : showClimateActions && (
                  <div className="grid grid-cols-2" style={{ gap: u(12) }}>
                    <CarButton tone="positive" loading={ph === "PENDING"} disabled={ph === "UNKNOWN_OUTCOME" && !action.canRetry} onClick={onRequest}>
                      {ph === "FAILED" ? <><RotateCcw style={icon(30)} /> 다시 시도</> : <>{target}°C 로 맞추기</>}
                    </CarButton>
                    <CarButton onClick={onKeep} disabled={ph === "PENDING"}>지금 그대로 두기</CarButton>
                  </div>
                )}
              </Card>
            )}
            {/* 2 · 준비물 */}
            {packing.state !== "NOT_APPLICABLE" && (
              <Card>
                <div className="flex items-center justify-between"><Eyebrow>준비물 · {packed.length}/{profile.packing.length}</Eyebrow><PrepState s={packing.state} /></div>
                <ChecklistItems items={profile.packing} checked={packed} onToggle={onTogglePack} />
                {packing.state === "NEEDS_CHECK" && <SkipLink onClick={() => onSkip("PACKING")} />}
              </Card>
            )}
            {/* 3 · 충전 계획 — 머리줄(이름 · 상태)은 다른 두 카드와 같은 자리 */}
            <Card className="flex flex-col" style={{ gap: u(12) }}>
              <div className="flex items-center justify-between"><Eyebrow>충전 계획 · 추정</Eyebrow><PrepState s={energy.state} /></div>
              <div className="flex items-center justify-between" style={{ gap: u(16) }}>
                <p className="t-body-m t-strong min-w-0">{energy.line}</p>
                <CarButton size="medium" onClick={onGoEnergy}><BatteryCharging style={icon(28)} /> 보기</CarButton>
              </div>
              {energy.state === "NEEDS_CHECK" && <SkipLink onClick={() => onSkip("ENERGY")} />}
            </Card>
          </>
        }
        side={
          <Card tone="high" className="flex-1">
            <Eyebrow>차량 설정은 이렇게 바꿉니다</Eyebrow>
            <ol className="t-body-s text-p-text2 flex flex-col" style={{ marginTop: u(12), gap: u(10) }}>
              <li>1. 지금 값 조회 (HVAC · CAR_CLIMATE)</li>
              <li>2. 차량 지원 · 제어 권한 확인 (CONTROL_CAR_CLIMATE)</li>
              <li>3. 사용자 확인 — 출발하면 확인은 무효</li>
              <li>4. 실행 직전 다시 검사</li>
              <li>5. 콜백 값이 목표와 맞아야 성공</li>
              <li>6. 응답이 없으면 &lsquo;모름&rsquo; → 실제 값을 다시 읽기 전에는 다시 보내지 않음</li>
            </ol>
            <p className="t-body-s text-p-text3" style={{ marginTop: u(14) }}>서드파티 앱에 제어 권한이 허용되는지는 미확인입니다 (설명회 질문 10). 시연의 성공은 모의 값입니다.</p>
          </Card>
        }
        footer={prepareDone || status.ready
          ? <p className="t-body-m text-p-active flex items-center justify-center text-center" style={{ gap: u(8) }}><Check style={icon(30)} /> {status.ready ? "바로 출발하셔도 됩니다 · 출발하면 한 줄 화면으로 바뀝니다" : "출발 준비를 마쳤습니다 · 출발하면 한 줄 화면으로 바뀝니다"}</p>
          : <CarButton block onClick={onFinish}><ClipboardCheck style={icon(32)} /> 확인 필요 {status.needs}개를 두고 출발 준비 마치기</CarButton>}
      />
    </Screen>
  );
}

/* ───────── D 에너지 — 판정 · 그다음 무엇을 할 수 있나 ───────── */

/**
 * 판정만 보여 주면 "그래서 어떻게 하지?"를 사용자가 혼자 푼다(2차 P0-4). 그래서 주의·부족이면 선택지를 나란히 둔다 —
 * 전부 쉼표 DRIVE estimate 를 조건만 바꿔 다시 부른 값이다(options.ts). 앱은 아무것도 자동으로 바꾸지 않는다:
 * 버튼은 대기 유형 바꾸기(사용자가 알려 주는 사실)와 후보 보기(경유지는 사용자가 고른다)뿐이다.
 */
const ENERGY_TONE: Record<EnergyView["status"], string> = { OK: "text-p-active", CAUTION: "text-p-text", SHORT: "text-p-negative", UNKNOWN: "text-p-text3" };

/**
 * 마지막 재판단 — 전 → 후 → 원인을 한 줄에. "사용자의 다음 행동이 에너지에 어떤 영향을 주는지 계산하고 판단을 갱신한다"가
 * 대표 장면(DEMO-60S 35~48초)이라 토스트가 지나간 뒤에도 에너지 화면에 남긴다. 값은 전부 추정·시연 값이다.
 */
export type { Rejudge };

export function RejudgeCard({ r }: { r: Rejudge }) {
  const delta = r.toPct - r.fromPct;
  return (
    <Card tone="high" className="flex flex-col" style={{ gap: u(10) }} aria-label="마지막 재판단">
      <Eyebrow>재판단 {r.clock} · 귀가 후 예상 잔량 · 추정</Eyebrow>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center" style={{ gap: u(12) }}>
        <div className="min-w-0"><p className="t-label-m text-p-text3">{r.fromLabel}</p><p className="t-title-m">{r.fromPct}%</p></div>
        <ChevronRight style={icon(32)} className="text-p-text3" />
        <div className="min-w-0"><p className="t-label-m text-p-text3">{r.toLabel}</p><p className={cn("t-title-m", delta < 0 ? "text-p-negative" : "text-p-positive")}>{r.toPct}%</p></div>
      </div>
      <p className={cn("t-body-s", r.single ? "text-p-text2" : "text-p-warn")}>{r.single ? "원인" : "원인 여럿"} · {r.why} · 합계 {delta > 0 ? "+" : ""}{Math.round(delta)}%p</p>
    </Card>
  );
}

export function CopilotEnergyScreen({ view, assumptions, options, waitLimit, wait, canPickWait, showStops, orientation, rejudge = null, missing = null, basis = "추정", onSetWaitMode, onShowStops }: {
  view: EnergyView; assumptions: string[]; options: EnergyOption[];
  /** 마지막 재판단(전 → 후 → 원인). 없으면 카드도 없다 */
  rejudge?: Rejudge | null;
  /** 판단을 보류한 이유 — 필수 입력 중 모자란 것("부족한 정보: 배터리"). 연결이 부분만 돌아왔을 때 */
  missing?: string | null;
  /** 근거 등급 — "입력 계획 기반 추정 · 내비 경로 아님" / "내비 경로 기반 추정". 둘을 같은 정확도처럼 보이지 않게 머리에 적는다 */
  basis?: string;
  /** "차 안 대기는 앞으로 약 120분까지 …" */
  waitLimit: string | null;
  /** 대기가 남아 있으면 그 시간과 유형 */
  wait: { minutes: number; mode: WaitMode } | null;
  /** 정차 중이고 대기가 남았을 때만 유형을 바꿀 수 있다 */
  canPickWait: boolean;
  showStops: boolean; orientation: Orientation;
  onSetWaitMode: (m: WaitMode) => void; onShowStops: () => void;
}) {
  const [open, setOpen] = useState(false);
  const how = (
    <Card tone="low" className="flex flex-col" style={{ gap: u(8) }}>
      <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open || orientation === "landscape"} className="t-label-m text-p-text2 flex w-full items-center justify-between" style={{ minHeight: u(48) }}>
        <span>어떻게 계산했나 · 전부 가정값</span><ChevronDown style={icon(24)} className={cn("transition-transform", (open || orientation === "landscape") && "rotate-180")} />
      </button>
      {(open || orientation === "landscape") && (
        <ul className="t-body-s text-p-text2 flex flex-col" style={{ gap: u(8) }}>
          {assumptions.map((a) => <li key={a}>· {a}</li>)}
          <li className="text-p-negative">제조사 공식 주행가능거리가 아닙니다.</li>
        </ul>
      )}
    </Card>
  );
  return (
    <Screen>
      <AppHeader title="에너지" sub={`${basis} · 범위 포함`} />
      <Split
        orientation={orientation}
        main={
          <>
            <Card className="flex flex-col" style={{ gap: u(10) }}>
              <p className={cn("t-title-l", ENERGY_TONE[view.status])}>{view.headline}</p>
              <p className="t-body-m text-p-text2">{view.detail}{missing ? ` · ${missing}` : ""}</p>
              <div className="t-body-s text-p-text2 flex flex-wrap" style={{ gap: u(20), marginTop: u(4) }}>
                <span>지금 배터리 {view.currentSocPct ?? "—"}% · 시연 데이터</span>
                <span>예상 도착 잔량 {view.arrivalSocPct ?? "—"}%{view.depletesBeforeArrival ? " · 도착 전 소진 예상" : ""}</span>
              </div>
            </Card>
            {rejudge && <RejudgeCard r={rejudge} />}
            {wait && (
              <Card className="flex flex-col" style={{ gap: u(12) }}>
                <Eyebrow>도착 후 대기 {wait.minutes}분 · 어떻게 기다리나요?</Eyebrow>
                <WaitModePicker mode={wait.mode} onChange={onSetWaitMode} disabled={!canPickWait} />
                {waitLimit && <p className="t-body-m text-p-text2">{waitLimit}</p>}
                {!canPickWait && <p className="t-label-m text-p-text3">주행 중에는 바꿀 수 없습니다</p>}
              </Card>
            )}
            {options.length > 0 && (
              <div className="flex flex-col" style={{ gap: u(10) }}>
                <Eyebrow>이렇게 하면 · 추정</Eyebrow>
                {options.map((o) => (
                  <Card key={o.key} tone={o.improves ? "high" : "low"} pad={24} className="flex items-center justify-between" style={{ gap: u(16) }}>
                    <div className="min-w-0">
                      <p className="t-body-m t-strong">{o.label} <span className={cn("t-label-m", ENERGY_TONE[o.status])}>· {ENERGY_STATUS_LABEL[o.status]}</span></p>
                      <p className="t-body-s text-p-text2">{o.detail}</p>
                      {o.note && <p className="t-body-s text-p-text3">{o.note}</p>}
                    </div>
                    {o.action === "SET_WAIT_AWAY" && canPickWait && <CarButton size="medium" onClick={() => onSetWaitMode("AWAY")}>이렇게 기다림</CarButton>}
                    {o.action === "SHOW_STOPS" && <CarButton size="medium" tone="positive" onClick={onShowStops}>후보 보기</CarButton>}
                  </Card>
                ))}
              </div>
            )}
            {orientation === "portrait" && how}
          </>
        }
        side={how}
        footer={showStops ? <CarButton tone="positive" block onClick={onShowStops}><BatteryCharging style={icon(32)} /> 충전·휴식 후보 보기</CarButton> : undefined}
      />
    </Screen>
  );
}

/** 체크 줄 — 출발 준비물·하차 확인이 같은 모양(웹·차량용 앱). 줄 전체가 터치 영역(≥80), 지우기는 프로필 화면에서만 */
function ChecklistItems({ items, checked, onToggle }: { items: string[]; checked: string[]; onToggle: (i: string) => void }) {
  return (
    <ul className="flex flex-col" style={{ marginTop: u(8), gap: u(4) }}>
      {items.map((i) => {
        const on = checked.includes(i);
        return (
          <li key={i}>
            <button type="button" onClick={() => onToggle(i)} role="checkbox" aria-checked={on} className="t-body-s flex w-full min-w-0 items-center text-left" style={{ minHeight: u(80), gap: u(16) }}>
              <span className={cn("flex shrink-0 items-center justify-center", on ? "bg-p-positive text-white" : "bg-p-btn")} style={{ width: u(48), height: u(48), borderRadius: u(12) }}>{on && <Check style={icon(30)} />}</span>
              <span className={cn("truncate", on && "text-p-text3 line-through")}>{i}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ───────── F 하차 ───────── */

/** 도어 값 — 조회 가능 여부 · 값 · **출처와 조회 시각**(오래된 값을 지금 값처럼 보이지 않게) */
export type DoorView = { readable: boolean; open: boolean; locked: boolean; source?: "MOCK" | "VEHICLE"; readAt?: string | null };

/** 하차 버튼 — 다 확인했을 때만 "확인 완료". 덜 확인했으면 몇 개를 확인했는지 그대로 말한다 */
function finishLabel(n: number, total: number, stopover: boolean, finalLeg: boolean) {
  const head = n >= total ? "확인 완료" : `${n}/${total} 확인하고`;
  return `${head} · ${stopover ? "이어서 가기" : finalLeg ? "이동 마치기" : "대기 시작 (귀가 남음)"}`;
}

export function FinishScreen({
  profile, phase, checked, door, summary, canComplete, gateMessage, orientation, finalLeg, stopover = false, onToggle, onComplete, onStart,
}: {
  profile: UserProfile; phase: JourneyPhase; checked: string[]; door: DoorView;
  summary: { km: number; stops: string[]; arrivalPct: number };
  canComplete: boolean; gateMessage: string | null; orientation: Orientation;
  onToggle: (i: string) => void; onComplete: () => void; onStart: () => void;
  /** 마지막 구간인가 — 아니면 '중간 하차'(귀가가 남아 있다) */
  finalLeg: boolean;
  /** 목적지가 아닌 곳(휴게소·충전소)에 주차 — 하차 확인을 마쳐도 여정은 이어진다 */
  stopover?: boolean;
}) {
  const done = phase === "COMPLETED";
  const items = profile.finishChecklist;
  const doorCard = (
    <Card tone="high">
      <Eyebrow>도어 상태{door.readable ? ` · ${door.source === "VEHICLE" ? "차량 정보" : "시연 데이터"}${door.readAt ? ` · ${door.readAt}` : ""}` : ""}</Eyebrow>
      {door.readable ? (
        <>
          <p className="t-body-s text-p-text2" style={{ marginTop: u(10) }}>현재 조회 가능한 도어 상태는 다음과 같습니다. 차량 안을 대신 확인한 것이 아닙니다.</p>
          <dl className="t-body-s flex flex-col" style={{ marginTop: u(12), gap: u(10) }}>
            <div className="flex justify-between"><dt className="text-p-text3 flex items-center" style={{ gap: u(8) }}>{door.open ? <DoorOpen style={icon(26)} /> : <DoorClosed style={icon(26)} />} 도어</dt><dd className={cn("t-strong", door.open && "text-p-negative")}>{door.open ? "열림" : "닫힘"}</dd></div>
            <div className="flex justify-between"><dt className="text-p-text3 flex items-center" style={{ gap: u(8) }}><Lock style={icon(26)} /> 잠금</dt><dd className="t-strong">{door.locked ? "잠김" : "안 잠김"}</dd></div>
          </dl>
        </>
      ) : <p className="t-body-s text-p-text2" style={{ marginTop: u(10) }}>이 차량에서는 앱이 도어 상태를 읽을 수 없습니다.</p>}
    </Card>
  );
  return (
    <Screen>
      <AppHeader title={stopover ? "잠시 내리기" : finalLeg ? "하차 준비" : "중간 하차"} sub={done ? "이동 완료" : stopover ? "중간 정차 · 여정은 이어집니다" : finalLeg ? profile.name : "귀가가 남아 있습니다"} />
      <Split
        orientation={orientation}
        main={
          <>
            <Card className="flex flex-1 flex-col" style={{ gap: u(8) }}>
              <Eyebrow>내리기 전에 · {checked.filter((c) => items.includes(c)).length}/{items.length}</Eyebrow>
              <p className="t-title-m">차량 내부와 준비물을 직접 확인해 주세요</p>
              <ChecklistItems items={items} checked={checked} onToggle={onToggle} />
              <p className="t-label-m text-p-text3" style={{ marginTop: u(12) }}>체크리스트는 사용자의 확인 기록입니다 — 차 안에 사람·반려동물이 없다는 판정이 아닙니다. 항목은 내 프로필에서 바꿉니다.</p>
            </Card>
            {orientation === "portrait" && doorCard}
          </>
        }
        side={
          <>
            {doorCard}
            <Card className="flex-1 t-body-s">
              <Eyebrow>이번 이동</Eyebrow>
              <dl className="flex flex-col" style={{ marginTop: u(12), gap: u(10) }}>
                <div className="flex justify-between"><dt className="text-p-text3">이동 거리</dt><dd className="t-strong tabular-nums">{summary.km}km</dd></div>
                <div className="flex justify-between"><dt className="text-p-text3">충전 정차</dt><dd className="t-strong">{summary.stops.length ? summary.stops.join(" · ") : "없음"}</dd></div>
                <div className="flex justify-between"><dt className="text-p-text3">도착 잔량</dt><dd className="t-strong tabular-nums">{summary.arrivalPct}%</dd></div>
              </dl>
            </Card>
          </>
        }
        footer={done
          ? <CarButton block onClick={onStart}><Sparkles style={icon(32)} /> 새 이동 준비</CarButton>
          : (
            <div className="flex flex-col" style={{ gap: u(10) }}>
              {gateMessage && <p className="t-label-m text-p-negative">{gateMessage}</p>}
              <CarButton tone="positive" block disabled={!canComplete || !!gateMessage} onClick={onComplete}><ClipboardCheck style={icon(32)} /> {finishLabel(profile.finishChecklist.filter((x) => checked.includes(x)).length, profile.finishChecklist.length, stopover, finalLeg)}</CarButton>
            </div>
          )}
      />
    </Screen>
  );
}

/* ───────── E 주행 중 ───────── */

/**
 * MY CO-PILOT 주행 화면 — **의미가 먼저, 숫자는 보조.** 쉼표 DRIVE 의 DrivingScreen 은 도착 예상 잔량을 그대로 크게 써서
 * 모자라면 "−27%" 가 나온다(QUALITY_AUDIT 3). 여기서는 energyView 를 거친 상태 문장을 크게, 추가 필요량(%p)을 작게 쓴다.
 * 버튼은 없다 — 주행 중 조작은 DO 정책 확인 전까지 만들지 않는다. 음성 문구만 칩으로.
 */

/**
 * 주행 중 — driveLine 의 세 단계(3차 P0-2). 문제가 없으면 작은 한 줄, 확인할 것이 있으면 짧게, 모르면 모른다고만.
 * 빨강·경고 아이콘을 쓰지 않는다 — 제조사 안전 경고처럼 보이면 안 된다. 큰 숫자는 경유지까지 거리뿐.
 */
export function CopilotDrivingScreen({ line, voice, socPct, decisionLine }: { line: DriveLine; voice: string | null; socPct: number | null; decisionLine?: string | null }) {
  return (
    <Screen>
      <AppHeader title="MY CO-PILOT" sub="주행 중 · 한 줄 화면" />
      <div className="flex flex-1 flex-col items-center justify-center text-center" style={{ padding: u(32), gap: u(14) }}>
        {decisionLine && <p className="t-body-m text-p-text2">{decisionLine}</p>}
        {line.stop ? (
          <>
            <Eyebrow>{line.title}</Eyebrow>
            <p className="t-display tabular-nums">{line.stop.km}<span className="t-headline-s text-p-text3" style={{ marginLeft: u(8) }}>km</span></p>
            {line.level === "ATTENTION" && <p className="t-title-m">{line.title}</p>}
          </>
        ) : (
          <p className={cn(line.level === "QUIET" ? "t-title-s text-p-text2" : "t-title-l", line.level === "UNKNOWN" && "text-p-text3")}>{line.title}</p>
        )}
        {line.sub && <p className="t-body-m text-p-text2">{line.sub}</p>}
        <p className="t-label-m text-p-text4" style={{ marginTop: u(16) }}>설정·비교는 정차 후에 · 배터리 {socPct ?? "—"}% · 시연 데이터</p>
      </div>
      {voice && line.level === "ATTENTION" && (
        <div className="bg-p-surface-high t-body-s flex items-center" style={{ margin: `0 ${u(32)} ${u(32)}`, padding: `${u(20)} ${u(24)}`, borderRadius: u(20), gap: u(16) }}>
          <span className="bg-p-btn flex shrink-0 items-center justify-center" style={{ width: u(56), height: u(56), borderRadius: "50%" }}><Mic style={icon(28)} /></span>
          <span className="text-p-text2 min-w-0 flex-1 text-left">&ldquo;{voice}&rdquo;</span>
        </div>
      )}
    </Screen>
  );
}

/* ───────── G 기록 ───────── */

const KIND_LABEL: Record<Activity["kind"], string> = { PREPARE: "출발 준비", ENERGY: "에너지", WAYPOINT: "경유지", FINISH: "하차", STATE: "상황" };

/** 기록 — **지금 프로필의 것만.** 위에 "이번 이동에서 기억하는 것" */
export function HistoryScreen({ entries, memory, profileName, legs }: { entries: Activity[]; memory: JourneyMemory | null; profileName: string | null; legs: number }) {
  const climate = memory?.climate ? (memory.climate.decision === "APPLIED" ? `${memory.climate.valueC}°C 로 맞춤 (시연 데이터)` : `${memory.climate.valueC}°C 그대로 두기로 함`) : "아직 정하지 않음";
  const finish = memory ? Array.from({ length: legs }, (_, i) => `${legs > 1 ? (i === 0 ? "고객사 " : "집 ") : ""}${(memory.finishChecked[i] ?? []).length}개`).join(" · ") : "";
  return (
    <Screen>
      <AppHeader title="이동 기록" sub={profileName ? `${profileName} · ${entries.length}건 · 이 기기에만` : "프로필을 고르면 보입니다"} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" style={{ padding: `${u(24)} ${u(32)} ${u(32)}`, gap: u(12) }}>
        {memory && (
          <Card tone="high" className="t-body-s">
            <Eyebrow>이번 이동 #{memory.tripId}에서 기억하는 것</Eyebrow>
            <dl className="flex flex-col" style={{ marginTop: u(12), gap: u(8) }}>
              {([["출발 준비", memory.prepareDone ? "마침" : "아직"], ["준비물 확인", `${memory.packed.length}개`], ["공조", climate],
                ["고른 경유지", memory.waypointIds.length ? `${memory.waypointIds.length}곳` : "없음"], ["하차 확인", finish]] as const).map(([k, val]) => (
                <div key={k} className="flex justify-between" style={{ gap: u(16) }}><dt className="text-p-text3">{k}</dt><dd className="t-strong text-right">{val}</dd></div>
              ))}
            </dl>
            <p className="t-label-m text-p-text3" style={{ marginTop: u(12) }}>새 이동을 시작하면 비웁니다 — 지난 이동의 확인 결과를 다음 이동에 자동으로 쓰지 않습니다.</p>
          </Card>
        )}
        {entries.length === 0
          ? <Card><p className="t-body-s text-p-text2">{profileName === PROFILE_PRESETS_GUEST_NAME ? "프로필 없이 한 이동은 기록하지 않습니다 — 누구의 이동인지 모릅니다." : profileName ? "아직 기록이 없습니다." : "프로필을 고르기 전에는 기록을 보여 주지 않습니다."}</p></Card>
          : entries.map((e, i) => (
            <Card key={i} pad={24} className="t-body-s flex items-baseline" style={{ gap: u(16) }}>
              <span className="t-label-m text-p-text3 shrink-0 tabular-nums">{e.clock}</span>
              <span className="t-label-m text-p-positive shrink-0">{KIND_LABEL[e.kind]}</span>
              <span className="min-w-0">{e.text}</span>
              <span className="t-label-m text-p-text4 ml-auto shrink-0">#{e.tripId}</span>
            </Card>
          ))}
        <p className="t-label-m text-p-text3">이 프로필의 기록만 보입니다. 위치 이력은 저장하지 않습니다. 기록은 이 기기의 브라우저에만 남고, 프로필에서 지울 수 있습니다.</p>
      </div>
    </Screen>
  );
}
