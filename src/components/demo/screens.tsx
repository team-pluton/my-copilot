"use client";

import { useState } from "react";
import { AlertTriangle, BatteryCharging, Check, ChevronDown, ChevronRight, Mic, Route, SearchX, Volume2, Zap } from "lucide-react";
import { VERDICT_LABEL, type EnergyPlan, type WhatIfResult } from "@/lib/core/energy";
import { unmetLabel, type Exclusion } from "@/lib/core/engine";
import {
  AMENITY_LABEL, PASSENGER_LABEL, needsOf,
  type PassengerType, type RankedRestStop, type RestStop, type TripMode, type TripPlan, type VehicleSnapshot,
} from "@/lib/core/model";
import { PHASE_LABEL, type BreakPhase } from "@/lib/core/scheduler";
import { cn } from "@/lib/utils";
import { Bar, Card, CarButton, Eyebrow, icon, u, useTween } from "./car-ui";
import type { Orientation } from "./pleos-shell";

/**
 * 앱 창 안의 여섯 화면 — **표시만** 한다. 판단은 Simulator 가 들고 있다.
 *
 * 위계 규칙(오너 지적 2026-10-24 반영): 화면마다 **큰 것 하나**(숫자 또는 제목) ·
 * 보조 정보 · **행동 버튼 하나**(positive). 두 번째 행동은 basic 으로 한 단계 낮춘다.
 * 치수는 car-px(--u). 세로 창 840×1184 가 기준이고, 가로(1700)에서는 오른쪽 열이 열린다.
 * 상단바·하단 탭은 그리지 않는다 — 그건 시스템(셸) 것이다.
 */
export type ScreenId = 1 | 2 | 3 | 4 | 5 | 6;

export const SCREENS: { id: ScreenId; title: string; hint: string }[] = [
  { id: 1, title: "상태", hint: "도착 예상 잔량 하나 · 다음 할 일 한 줄" },
  { id: 2, title: "여정", hint: "목적지 · 도착 후 대기 · 최소 잔량 · 동승자" },
  { id: 3, title: "에너지 계획", hint: "주행 / 대기 / 최소 → 부족분과 제안" },
  { id: 4, title: "후보", hint: "충전·휴식 후보 3곳 · 점수 · 미충족" },
  { id: 5, title: "주행 중", hint: "한 줄 + 음성 (DO)" },
  { id: 6, title: "도착·재계산", hint: "기록 · 남은 구간 재계산" },
];

/* ───────── 공통 ───────── */

export function AppHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between" style={{ padding: `${u(36)} ${u(32)} 0`, gap: u(16) }}>
      <h2 className="t-title-s truncate">{title}</h2>
      {sub && <span className="t-label-m text-p-text3 shrink-0">{sub}</span>}
    </div>
  );
}

/** 세로: 한 열. 가로: 오른쪽 42% 열이 열린다 */
export function Split({ orientation, main, side, footer }: { orientation: Orientation; main: React.ReactNode; side?: React.ReactNode; footer?: React.ReactNode }) {
  const landscape = orientation === "landscape";
  return (
    <>
      <div className={cn("flex min-h-0 flex-1", landscape ? "flex-row" : "flex-col")} style={{ gap: u(24), padding: `${u(24)} ${u(32)} ${footer ? 0 : u(32)}` }}>
        {/* 12.9" 세로(628×855) 처럼 낮은 창에서는 본문이 넘친다 — 잘리지 않고 스크롤 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto" style={{ gap: u(24) }}>{main}</div>
        {landscape && side && <div className="flex min-w-0 flex-col overflow-y-auto" style={{ width: "42%", gap: u(24) }}>{side}</div>}
      </div>
      {/* 주요 행동 버튼은 스크롤 밖 바닥에 — 본문이 길어도 버튼이 잘리지 않는다 */}
      {footer && <div className="shrink-0" style={{ padding: `${u(16)} ${u(32)} ${u(32)}` }}>{footer}</div>}
    </>
  );
}

export function Screen({ children }: { children: React.ReactNode }) {
  return <div className="screen-in flex h-full flex-col">{children}</div>;
}

/** 185 → "3시간 5분", 92 → "92분" */
function fmtMinutes(m: number) {
  if (m < 120) return `${m}분`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}시간 ${r}분` : `${h}시간`;
}

/** 왕복이면 막대를 가는 길 · 대기 · 오는 길 · 최소 로 나눈다 — 대기가 두 길 사이에 있다는 것이 보이게 */
function energySegments(energy: EnergyPlan) {
  return energy.returnPct > 0
    ? [
        { k: "가는 길", n: energy.outboundPct, c: "var(--p-positive)" },
        { k: "대기", n: energy.waitPct, c: "var(--p-auto)" },
        { k: "오는 길", n: energy.returnPct, c: "color-mix(in srgb, var(--p-positive) 55%, transparent)" },
        { k: "최소 잔량", n: energy.reservePct, c: "var(--p-text4)" },
      ]
    : [
        { k: "주행", n: energy.drivePct, c: "var(--p-positive)" },
        { k: "대기", n: energy.waitPct, c: "var(--p-auto)" },
        { k: "최소 잔량", n: energy.reservePct, c: "var(--p-text4)" },
      ];
}

/* ───────── 01 상태 ───────── */

export function StatusScreen({ plan, v, energy, phase, orientation, onGo, lastRejudge }: { plan: TripPlan; v: VehicleSnapshot; energy: EnergyPlan; phase: BreakPhase; orientation: Orientation; onGo: (s: ScreenId) => void; lastRejudge?: string }) {
  const warn = energy.needsCharge;
  /*
   * 큰 숫자 하나: 충분하면 **도착 예상 잔량**, 모자라면 **부족분**. 모자랄 때 도착 잔량을
   * 그대로 쓰면 "-38%" 같은 물리적으로 없는 수가 뜬다 — 사람은 "얼마나 모자란가"를 묻는다.
   */
  const hero = useTween(Math.round(warn ? energy.shortfallPct : energy.arrivalPct));
  const roundTrip = (plan.returnKm ?? 0) > 0;
  return (
    <Screen>
      <AppHeader title="쉼표 DRIVE" sub={`${plan.destinationName} · ${PHASE_LABEL[phase]}`} />
      <Split
        orientation={orientation}
        main={
          <>
            <Card className="flex flex-1 flex-col justify-between">
              <Eyebrow>{roundTrip
                ? (warn ? "출발 전에 충전이 필요합니다 · 왕복·대기 포함 부족분" : `귀가 시 예상 잔량 · 대기 ${plan.waitMinutesAfterArrival}분 포함`)
                : (warn ? "도착 전에 충전이 필요합니다 · 대기 포함 부족분" : `도착 예상 잔량 · 대기 ${plan.waitMinutesAfterArrival}분 포함`)}</Eyebrow>
              <div className="flex items-baseline" style={{ gap: u(8) }}>
                {warn && <span className="t-headline-s text-p-negative">약</span>}
                <span className={cn("t-display tabular-nums", warn ? "text-p-negative" : "text-p-active")}>{Math.round(hero)}</span>
                <span className="t-headline-s text-p-text3">%</span>
                {warn && <span className="t-headline-s text-p-negative">부족</span>}
              </div>
              <div>
                <Bar height={16} segments={energySegments(energy).map((s) => ({ pct: Math.min(s.n, 100), color: s.c, label: s.k }))} />
                <p className="t-body-s text-p-text2" style={{ marginTop: u(20) }}>{energy.message}</p>
                {lastRejudge && <p className="t-label-m text-p-positive" style={{ marginTop: u(10) }}>↻ {lastRejudge}</p>}
                {roundTrip && energy.maxWaitMinutes != null && (
                  // WAIT 의 핵심 출력 — "얼마나 기다려도 되나". 보수적 추정이라 그대로 믿어도 덜 위험한 쪽
                  <p className={cn("t-body-s t-strong", energy.maxWaitMinutes > 0 ? "text-p-text" : "text-p-negative")} style={{ marginTop: u(12) }}>
                    {energy.maxWaitMinutes > 0 ? `공조 켜고 최대 약 ${fmtMinutes(energy.maxWaitMinutes)}까지 기다려도 됩니다` : "공조를 켜고 기다릴 여유가 없습니다"}
                    <span className="t-label-m text-p-text3 font-normal"> · 보수적 추정</span>
                  </p>
                )}
              </div>
            </Card>
            <CarButton tone="positive" block onClick={() => onGo(warn && !roundTrip ? 4 : 3)}>
              {warn && !roundTrip ? <><BatteryCharging style={icon(36)} /> 충전·휴식 후보 보기</> : <><Zap style={icon(36)} /> 에너지 계획 보기</>}
            </CarButton>
            <CarButton block onClick={() => onGo(2)}>여정 설정 <ChevronRight style={icon(32)} /></CarButton>
            {/* 충전이 필요 없을 때 — 경고를 되풀이하지 않고, 쉬고 싶을 때만 휴식 후보를 연다 */}
            {!warn && !roundTrip && <CarButton size="medium" block onClick={() => onGo(4)}>쉬어 갈 곳만 보기</CarButton>}
          </>
        }
        side={<VehiclePanel v={v} />}
      />
    </Screen>
  );
}

/** 차량 상태 패널 — Vehicle SDK 값. 3D 는 아니다 (Kotlin 이식 부담) */
function VehiclePanel({ v }: { v: VehicleSnapshot }) {
  const rows: [string, string, boolean?][] = [
    ["배터리", `${Math.round(v.batteryPct)}% · ${v.batteryKwh}kWh`],
    ["공조", v.hvacOn ? "켜짐" : "꺼짐"],
    ["주행 모드", v.driveMode],
    ["외기온", `${v.outsideTempC}°C`],
    ["타이어", v.tireWarning ? "경고" : "정상", v.tireWarning],
  ];
  return (
    <Card className="flex-1">
      <Eyebrow>차량 상태 · Vehicle SDK</Eyebrow>
      <dl className="t-body-s flex flex-col" style={{ marginTop: u(20), gap: u(16) }}>
        {rows.map(([k, val, bad]) => (
          <div key={k} className="flex justify-between"><dt className="text-p-text3">{k}</dt><dd className={cn("t-strong tabular-nums", bad && "text-p-negative")}>{val}</dd></div>
        ))}
      </dl>
    </Card>
  );
}

/* ───────── 02 여정 ───────── */

const MODES: { id: TripMode; label: string; hint: string; ready: boolean }[] = [
  { id: "JOURNEY", label: "장거리 여행", hint: "충전과 휴식", ready: true },
  { id: "WAIT", label: "픽업·마중", hint: "도착 후 대기·귀가", ready: true },
  { id: "STAY", label: "캠핑·차박", hint: "설계 단계", ready: false },
];

export function TripScreen({ plan, onChange, orientation, energy, onMode }: { plan: TripPlan; onChange: (p: TripPlan) => void; orientation: Orientation; energy?: EnergyPlan; onMode?: (m: TripMode) => void }) {
  const mode = plan.mode ?? "JOURNEY";
  const roundTrip = (plan.returnKm ?? 0) > 0;
  const toggle = (p: PassengerType) =>
    onChange({ ...plan, passengers: plan.passengers.includes(p) ? plan.passengers.filter((x) => x !== p) : [...plan.passengers, p] });
  const needs = needsOf(plan.passengers);
  const needsCard = (
    <Card tone="high" className="t-body-s">
      <Eyebrow>이 조합이 요구하는 것</Eyebrow>
      <p className="t-strong" style={{ marginTop: u(12) }}>필수 <span className="text-p-text3 font-normal">— 없으면 제외</span></p>
      <p className="text-p-text2">{needs.required.map((a) => AMENITY_LABEL[a]).join(" · ")}</p>
      <p className="t-strong" style={{ marginTop: u(12) }}>선호 <span className="text-p-text3 font-normal">— 점수 · 미충족 표시</span></p>
      <p className="text-p-text2">{needs.preferred.length ? needs.preferred.map((a) => AMENITY_LABEL[a]).join(" · ") : "없음"}</p>
    </Card>
  );
  return (
    <Screen>
      <AppHeader title="여정" sub="정차 중에만 설정" />
      <Split
        orientation={orientation}
        main={
          <>
            {/* 같은 엔진, 다른 순간 — 목적을 고르면 계산 범위와 추천 행동이 바뀐다 */}
            <Card>
              <Eyebrow>오늘 차를 어떻게 쓰나요</Eyebrow>
              <div className="grid grid-cols-3" style={{ gap: u(12), marginTop: u(12) }}>
                {MODES.map((m) => (
                  <button key={m.id} type="button" disabled={!m.ready} onClick={() => onMode?.(m.id)} aria-pressed={mode === m.id}
                    className={cn("flex flex-col items-center justify-center transition-colors", mode === m.id ? "bg-p-filled text-p-filled-text" : m.ready ? "bg-p-btn text-p-text" : "bg-transparent text-p-text4 ring-inset ring-p-line ring-[length:calc(2*var(--u))]")}
                    style={{ height: u(96), borderRadius: u(24), gap: u(2) }}>
                    <span className="t-body-s t-strong">{m.label}</span>
                    <span className={cn("t-label-s", mode === m.id ? "opacity-80" : "text-p-text3")}>{m.hint}</span>
                  </button>
                ))}
              </div>
            </Card>
            <Card>
              <div className="flex items-start justify-between" style={{ gap: u(16) }}>
                <div className="min-w-0">
                  <Eyebrow>목적지</Eyebrow>
                  <p className="t-title-m truncate" style={{ marginTop: u(4) }}>{plan.destinationName} <span className="t-body-s text-p-text3 font-normal">· {plan.routeKm}km{roundTrip ? ` + 귀가 ${plan.returnKm}km` : ""}</span></p>
                </div>
                <button type="button" onClick={() => onChange({ ...plan, returnKm: roundTrip ? 0 : plan.routeKm })} aria-pressed={roundTrip}
                  className={cn("t-label-m t-strong shrink-0", roundTrip ? "bg-p-filled text-p-filled-text" : "bg-p-btn text-p-text")} style={{ height: u(64), paddingInline: u(24), borderRadius: u(18) }}>
                  {roundTrip ? "왕복" : "편도"}
                </button>
              </div>
            </Card>
            <SliderCard label="도착 후 차 안에서 대기" value={`${plan.waitMinutesAfterArrival}분`} min={0} max={120} step={10} current={plan.waitMinutesAfterArrival} onChange={(n) => onChange({ ...plan, waitMinutesAfterArrival: n })} />
            <SliderCard label="도착 시 최소 잔량" value={`${plan.minReservePct}%`} min={10} max={40} step={5} current={plan.minReservePct} onChange={(n) => onChange({ ...plan, minReservePct: n })} />
            <Card>
              <Eyebrow>동승자 · 수동 설정</Eyebrow>
              <div className="grid grid-cols-3" style={{ gap: u(16), marginTop: u(16) }}>
                {(Object.keys(PASSENGER_LABEL) as PassengerType[]).map((p) => {
                  const on = plan.passengers.includes(p);
                  return (
                    <button key={p} type="button" onClick={() => toggle(p)} aria-pressed={on}
                      className={cn("t-body-m t-strong flex items-center justify-center transition-colors", on ? "bg-p-filled text-p-filled-text" : "bg-p-btn text-p-text")}
                      style={{ height: u(80), borderRadius: u(24), gap: u(8) }}>
                      {on && <Check style={icon(28)} />}{PASSENGER_LABEL[p].name}
                    </button>
                  );
                })}
              </div>
            </Card>
            {orientation === "portrait" && needsCard}
          </>
        }
        side={needsCard}
        footer={energy && (
          // 슬라이더를 움직이는 동안 결과가 바로 바뀐다 — "대기 20분 더 넣으면 얼마나 모자라나" 를 그 자리에서
          <div className="bg-p-surface-high flex items-baseline justify-between" style={{ padding: `${u(16)} ${u(24)}`, borderRadius: u(20), gap: u(16) }}>
            <span className="t-label-m text-p-text3">이 설정으로</span>
            <span className={cn("t-title-s tabular-nums", energy.needsCharge ? "text-p-negative" : "text-p-active")}>
              {energy.needsCharge
                ? (roundTrip ? `약 ${Math.round(energy.shortfallPct)}% 부족 · 출발 전 충전` : `약 ${Math.round(energy.shortfallPct)}% 부족 · 충전 1회`)
                : `${roundTrip ? "귀가" : "도착"} 잔량 약 ${Math.round(energy.arrivalPct)}% · 충전 불필요`}
            </span>
          </div>
        )}
      />
    </Screen>
  );
}

function SliderCard({ label, value, min, max, step, current, onChange }: { label: string; value: string; min: number; max: number; step: number; current: number; onChange: (n: number) => void }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between"><Eyebrow>{label}</Eyebrow><p className="t-title-m tabular-nums">{value}</p></div>
      <input type="range" min={min} max={max} step={step} value={current} onChange={(e) => onChange(Number(e.target.value))}
        className="block w-full" style={{ accentColor: "var(--p-positive)", height: u(40), marginTop: u(8) }} aria-label={label} />
    </Card>
  );
}

/* ───────── 03 에너지 계획 ───────── */

/** "무엇이 바뀌면 얼마나 달라지나" — 부족분(%) 의 변화량. 시뮬레이터가 estimate 를 조건만 바꿔 다시 돌려 만든다 */
export type Sensitivity = { label: string; deltaPct: number }[];

export function EnergyScreen({ v, energy, orientation, onGo, sensitivity, whatIf }: { v: VehicleSnapshot; energy: EnergyPlan; orientation: Orientation; onGo: (s: ScreenId) => void; sensitivity?: Sensitivity; whatIf?: WhatIfResult[] }) {
  const segs: { k: string; n: number; c: string }[] = energySegments(energy);
  const roundTrip = energy.returnPct > 0;
  const total = Math.max(segs.reduce((a, s) => a + s.n, 0), v.batteryPct);
  const assumptions = (
    <Card tone="high" className="flex-1">
      <Eyebrow>어떻게 계산했나 · 전부 가정값</Eyebrow>
      <ul className="t-label-m text-p-text2 flex flex-col" style={{ marginTop: u(12), gap: u(8) }}>{energy.assumptions.map((a) => <li key={a}>· {a}</li>)}</ul>
      {sensitivity && sensitivity.length > 0 && (
        <>
          <Eyebrow className="mt-[calc(20*var(--u))]">무엇이 바뀌면 — 부족분 변화</Eyebrow>
          <ul className="t-label-m text-p-text2 flex flex-col" style={{ marginTop: u(8), gap: u(6) }}>
            {sensitivity.map((s) => (
              <li key={s.label} className="flex justify-between"><span>{s.label}</span><span className={cn("tabular-nums", s.deltaPct > 0 ? "text-p-negative" : s.deltaPct < 0 ? "text-p-active" : "text-p-text3")}>{s.deltaPct > 0 ? "+" : ""}{Math.round(s.deltaPct)}%p</span></li>
            ))}
          </ul>
        </>
      )}
      <p className="t-label-s text-p-text3" style={{ marginTop: u(14) }}>오차가 커지는 때: 영하 10°C 이하 · 100km/h 이상 고속(모델에 속도 항이 없다) · 탑승 인원·적재 · 비·맞바람</p>
      <p className="t-label-m text-p-negative flex items-start" style={{ marginTop: u(12), gap: u(8) }}><AlertTriangle style={icon(22)} className="shrink-0" /> 제조사 공식 주행가능거리가 아닙니다.</p>
    </Card>
  );
  return (
    <Screen>
      <AppHeader title="에너지 계획" sub="추정 · 범위 포함" />
      <Split
        orientation={orientation}
        main={
          <>
            <Card>
              <div className="flex items-baseline justify-between">
                <Eyebrow>현재 잔량 {Math.round(v.batteryPct)}% 기준</Eyebrow>
                <p className={cn("t-title-m tabular-nums", energy.needsCharge ? "text-p-negative" : "text-p-active")}>{energy.needsCharge ? `약 ${Math.round(energy.shortfallPct)}% 부족` : "충분"}</p>
              </div>
              <div style={{ marginTop: u(20) }}>
                <Bar height={32} segments={segs.map((s) => ({ pct: (s.n / total) * 100, color: s.c, label: s.k }))} />
                {/* 현재 잔량 눈금 */}
                <div className="relative" style={{ height: u(28) }}>
                  <span className="t-label-s text-p-text3 absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${Math.min((v.batteryPct / total) * 100, 86)}%`, top: u(4) }}>▲ 현재 {Math.round(v.batteryPct)}%</span>
                </div>
              </div>
              <div className="t-label-m text-p-text2 flex flex-wrap" style={{ gap: `${u(8)} ${u(24)}` }}>
                {segs.map((s) => <span key={s.k} className="flex items-center" style={{ gap: u(8) }}><span style={{ width: u(14), height: u(14), borderRadius: "50%", background: s.c }} />{s.k} {Math.round(s.n)}% <span className="text-p-text3">≈{Math.round((s.n / 100) * v.batteryKwh)}kWh</span></span>)}
              </div>
              <p className="t-label-m text-p-text3" style={{ marginTop: u(8) }}>주행 추정 범위 {Math.round(energy.driveRange[0])}~{Math.round(energy.driveRange[1])}%</p>
            </Card>
            <Card><p className="t-body-m text-p-text2">{energy.message}</p></Card>
            {whatIf && whatIf.length > 1 && (
              // 만약에 — 선택지를 나란히. 판정 칩 + 도착(귀가) 잔량 또는 부족분
              <Card pad={24}>
                <Eyebrow>만약에 — 선택 비교</Eyebrow>
                <ul className="flex flex-col" style={{ marginTop: u(12), gap: u(10) }}>
                  {whatIf.map((w) => (
                    <li key={w.label} className="t-body-s flex items-center justify-between" style={{ gap: u(12) }}>
                      <span className="min-w-0 truncate">{w.label}</span>
                      <span className="flex shrink-0 items-center" style={{ gap: u(10) }}>
                        <span className="t-label-m tabular-nums text-p-text2">{w.shortfallPct > 0 ? `약 ${Math.round(w.shortfallPct)}% 부족` : `${roundTrip ? "귀가" : "도착"} 약 ${Math.round(w.arrivalPct)}%`}</span>
                        <span className={cn("t-label-s t-strong", w.verdict === "OK" ? "text-p-active" : w.verdict === "TIGHT" ? "text-p-auto" : "text-p-negative")} style={{ padding: `${u(4)} ${u(10)}`, borderRadius: u(8), background: "var(--p-surface-high)" }}>{VERDICT_LABEL[w.verdict]}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {orientation === "portrait" && assumptions}
          </>
        }
        side={assumptions}
        footer={roundTrip
          ? <CarButton tone="positive" block onClick={() => onGo(1)}>상태로 <ChevronRight style={icon(32)} /></CarButton>
          : <CarButton tone="positive" block onClick={() => onGo(4)}><Route style={icon(36)} /> {energy.needsCharge ? "충전·휴식 후보 보기" : "휴식 후보 보기"}</CarButton>}
      />
    </Screen>
  );
}

/* ───────── 04 후보 ───────── */

export function CandidatesScreen({ ranked, needsCharge, onAddStop, addingId, waypoints, slots, orientation, breakdownOf, selectedId, emptyText, chargeMinutesOf, excluded = [] }: {
  ranked: RankedRestStop[]; needsCharge: boolean; onAddStop: (s: RestStop) => void; addingId: string | null; emptyText?: string;
  /** 거기 닿았을 때 잔량에서 80% 까지 몇 분 — 충전 불필요 여정이면 안 보여 준다 */
  chargeMinutesOf?: (s: RestStop) => number | null;
  /** 빠진 후보와 이유 — "안성은 왜 없지?" 에 답한다 */
  excluded?: Exclusion[];
  waypoints: number; slots: number; orientation: Orientation; selectedId: string | null;
  breakdownOf: (s: RestStop) => { label: string; value: number; weight: number }[];
}) {
  const top = ranked[0];
  const [showExcluded, setShowExcluded] = useState(false);
  const excludedPanel = excluded.length > 0 && (
    <Card tone="high" pad={24}>
      <button type="button" onClick={() => setShowExcluded((x) => !x)} aria-expanded={showExcluded} className="t-label-m text-p-text2 flex w-full items-center justify-between">
        <span>제외 {excluded.length}곳 — 왜 빠졌나</span>
        <ChevronDown style={icon(24)} className={cn("transition-transform", showExcluded && "rotate-180")} />
      </button>
      {(showExcluded || orientation === "landscape") && (
        <ul className="t-label-m flex flex-col" style={{ marginTop: u(12), gap: u(6) }}>
          {excluded.map((e) => (
            <li key={e.stop.id} className="flex justify-between" style={{ gap: u(12) }}><span className="text-p-text2 truncate">{e.stop.name}</span><span className="text-p-text3 shrink-0">{e.reason}</span></li>
          ))}
        </ul>
      )}
    </Card>
  );
  return (
    <Screen>
      <AppHeader title={needsCharge ? "충전 · 휴식 후보" : "휴식 후보"} sub={`경유지 ${waypoints}/${slots}`} />
      <Split
        orientation={orientation}
        main={
          ranked.length === 0 ? (
            <Card className="flex flex-1 flex-col items-center justify-center text-center" tone="high">
              <SearchX style={icon(72)} className="text-p-text4" />
              <p className="t-body-m t-strong" style={{ marginTop: u(20) }}>{emptyText ?? "조건에 맞는 후보가 없습니다"}</p>
              <p className="t-body-s text-p-text3" style={{ marginTop: u(8) }}>{emptyText ? "쉬고 싶으면 여정의 휴식 간격을 줄이세요." : "동승자 조건이나 최소 잔량을 조정해 보세요."}</p>
            </Card>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" style={{ gap: u(16) }}>
              {ranked.map((r, i) => {
                const chosen = selectedId === r.stop.id;
                return (
                  <Card key={r.stop.id} pad={24} className={cn(i === 0 && "outline outline-p-positive outline-[length:calc(3*var(--u))] -outline-offset-[calc(3*var(--u))]")}>
                    <div className="flex items-start justify-between" style={{ gap: u(16) }}>
                      <div className="min-w-0">
                        <p className="t-body-l t-strong flex items-center truncate" style={{ gap: u(10) }}>
                          <span className={cn("t-label-s t-strong inline-flex items-center justify-center", i === 0 ? "bg-p-positive text-white" : "bg-p-surface-high text-p-text2")} style={{ width: u(32), height: u(32), borderRadius: u(10) }}>{i + 1}</span>
                          <span className="truncate">{r.stop.name}</span>
                        </p>
                        <p className="t-label-m text-p-text2" style={{ marginTop: u(6) }}>{r.reason}</p>
                        <p className={cn("t-label-m", r.unmet.length ? "text-p-negative" : "text-p-active")} style={{ marginTop: u(4) }}>{unmetLabel(r.unmet)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="t-title-m tabular-nums">{r.score}</p>
                        <p className="t-label-s text-p-text4">점</p>
                        {needsCharge && chargeMinutesOf && chargeMinutesOf(r.stop) != null && (
                          <p className="t-label-s text-p-text3 tabular-nums" style={{ marginTop: u(8) }}>충전 ≈{chargeMinutesOf(r.stop)}분</p>
                        )}
                      </div>
                    </div>
                    <div style={{ marginTop: u(16) }}>
                      {chosen ? (
                        <CarButton size="medium" block disabled><Check style={icon(28)} /> 경유지에 있음</CarButton>
                      ) : (
                        <CarButton size="medium" block tone={i === 0 ? "positive" : "basic"} loading={addingId === r.stop.id} onClick={() => onAddStop(r.stop)}><Route style={icon(28)} /> 경유지로 추가</CarButton>
                      )}
                    </div>
                  </Card>
                );
              })}
              {orientation === "portrait" && excludedPanel}
            </div>
          )
        }
        side={
          top ? (
            <>
            <Card className="flex-1">
              <Eyebrow>1위 점수 구성 · {top.stop.name}</Eyebrow>
              <div className="flex flex-col" style={{ marginTop: u(16), gap: u(16) }}>
                {breakdownOf(top.stop).map((b) => (
                  <div key={b.label}>
                    <div className="t-label-m flex justify-between"><span>{b.label} <span className="text-p-text3">×{b.weight}</span></span><span className="tabular-nums">{b.value}</span></div>
                    <Bar height={10} className="mt-[calc(6*var(--u))]" segments={[{ pct: b.value, color: "var(--p-positive)" }]} />
                  </div>
                ))}
              </div>
              <p className="t-label-s text-p-text4" style={{ marginTop: u(16) }}>경로 이탈은 거리로만 센다 · 미확인 정보는 감점</p>
            </Card>
            {excludedPanel}
            </>
          ) : <Card className="t-body-s text-p-text3 flex-1">후보가 없습니다.</Card>
        }
      />
    </Screen>
  );
}

/* ───────── 05 주행 중 (DO) ───────── */

/**
 * 음성 문구를 브라우저 TTS 로 들려 준다 — **시연용**이다. 실제 앱은 Pleos TextToSpeech SDK(v3.3.1) 가 읽는다.
 * 자동 재생은 브라우저가 막으므로 버튼으로만. ko-KR 음성이 없으면 기본 음성으로라도 읽는다.
 */
function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const s = window.speechSynthesis;
  s.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = "ko-KR";
  utt.rate = 1.0;
  const ko = s.getVoices().find((v) => v.lang.toLowerCase().startsWith("ko"));
  if (ko) utt.voice = ko;
  s.speak(utt);
}

export function DrivingScreen({ nextStop, kmToNext, arrivalPct, voice, arrivalLabel = "도착 예상 잔량", title = "쉼표 DRIVE" }: { nextStop: RestStop | null; kmToNext: number | null; arrivalPct: number; voice: string | null; arrivalLabel?: string; title?: string }) {
  const pct = useTween(Math.round(arrivalPct));
  return (
    <Screen>
      <AppHeader title={title} sub="주행 중 · DO" />
      <div className="flex flex-1 flex-col items-center justify-center text-center" style={{ padding: u(32), gap: u(12) }}>
        {nextStop ? (
          <>
            <Eyebrow>다음 충전·휴식 경유지</Eyebrow>
            <p className="t-title-l">{nextStop.name}</p>
            <p className="t-display tabular-nums">{kmToNext}<span className="t-headline-s text-p-text3" style={{ marginLeft: u(8) }}>km</span></p>
          </>
        ) : (
          <>
            <Eyebrow>{arrivalLabel}</Eyebrow>
            <p className="t-display tabular-nums">{Math.round(pct)}<span className="t-headline-s text-p-text3" style={{ marginLeft: u(8) }}>%</span></p>
          </>
        )}
        <p className="t-label-m text-p-text4" style={{ marginTop: u(16) }}>설정·비교는 정차 후에</p>
      </div>
      {voice && (
        <div className="bg-p-surface-high t-body-s flex items-center" style={{ margin: `0 ${u(32)} ${u(32)}`, padding: `${u(20)} ${u(24)}`, borderRadius: u(20), gap: u(16) }}>
          <span className="bg-p-positive flex shrink-0 items-center justify-center text-white" style={{ width: u(56), height: u(56), borderRadius: "50%" }}><Mic style={icon(28)} /></span>
          <span className="text-p-text2 min-w-0 flex-1 text-left">&ldquo;{voice}&rdquo;</span>
          <button type="button" onClick={() => speak(voice)} aria-label="음성으로 듣기 (브라우저 TTS, 시연용)" title="브라우저 TTS 로 듣기 — 실제 앱은 TextToSpeech SDK"
            className="bg-p-btn text-p-text active:bg-p-btn-pressed flex shrink-0 items-center justify-center" style={{ width: u(64), height: u(64), borderRadius: u(18) }}>
            <Volume2 style={icon(30)} />
          </button>
        </div>
      )}
    </Screen>
  );
}

/* ───────── 06 도착·재계산 ───────── */

export type StopLog = { stopName: string; batteryBefore: number; batteryAfter: number; minutes: number };

export function ArrivedScreen({ log, remainingKm, energy, orientation, onResume, current, chargeMin }: { log: StopLog[]; remainingKm: number; energy: EnergyPlan; orientation: Orientation; onResume: () => void; current: RestStop | null; chargeMin?: number | null }) {
  return (
    <Screen>
      <AppHeader title="경유지 도착" sub="onWayPointArrived" />
      <Split
        orientation={orientation}
        main={
          <>
            <Card>
              <Eyebrow>이번 정차</Eyebrow>
              <p className="t-title-m" style={{ marginTop: u(4) }}>{current?.name ?? log[log.length - 1]?.stopName ?? "—"}</p>
              {current?.chargerKw && <p className="t-body-s text-p-text2 flex items-center" style={{ gap: u(8), marginTop: u(6) }}><Zap style={icon(24)} className="text-p-charging" /> {current.chargerKw}kW · 80% 까지 약 {chargeMin ?? "—"}분 (추정) · 그동안 쉽니다</p>}
            </Card>
            <Card className="flex-1">
              <Eyebrow>{current?.chargerKw ? "80% 충전 후 " : ""}남은 구간 재계산 · {remainingKm}km</Eyebrow>
              <p className={cn("t-headline-l tabular-nums", energy.needsCharge ? "text-p-negative" : "text-p-active")} style={{ marginTop: u(8) }}>
                {energy.needsCharge ? <>약 {Math.round(energy.shortfallPct)}<span className="t-title-s text-p-text3">%</span> 부족</> : <>{Math.round(energy.arrivalPct)}<span className="t-title-s text-p-text3">%</span></>}
              </p>
              <p className="t-body-s text-p-text2" style={{ marginTop: u(8) }}>{energy.message}</p>
            </Card>
            <CarButton tone="positive" block onClick={onResume}>충전 완료 · 주행 재개 <ChevronRight style={icon(32)} /></CarButton>
          </>
        }
        side={
          <Card className="flex-1 t-body-s">
            <Eyebrow>오늘 정차 {log.length}회</Eyebrow>
            {log.length === 0 ? <p className="text-p-text3" style={{ marginTop: u(12) }}>아직 없음</p> : (
              <ul className="flex flex-col" style={{ marginTop: u(12), gap: u(8) }}>{log.map((l, i) => <li key={i} className="flex justify-between"><span>{l.stopName}</span><span className="text-p-text3 tabular-nums">{l.batteryBefore}→{l.batteryAfter}% · {l.minutes}분</span></li>)}</ul>
            )}
          </Card>
        }
      />
    </Screen>
  );
}
