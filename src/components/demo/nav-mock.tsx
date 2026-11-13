"use client";

import { ArrowUp, Flag, Layers3, Zap } from "lucide-react";
import { icon, u } from "./car-ui";

/**
 * 옆 창의 **내비게이션 앱 모의** — 지도 타일 없이 경로선 · 현재 위치 · 경유지 마커만 그린다.
 *
 * 우리 앱은 지도를 그리지 않는다(CLAUDE.md 정책 5). 이 창은 "내비는 저쪽, 우리는 경유지만
 * 넘긴다"는 경계를 보여 주는 자리라, 우리 앱이 경유지를 추가하면 **여기에 마커가 생기는 것**이
 * 시연의 핵심 장면이다. 빈 상자였을 때는 그 장면이 없었다.
 *
 * 좌표는 가상이다. 서울(아래)→부산(위)으로 가는 선을 적당히 굽혔다.
 */
export function NavMock({ traveledKm, routeKm, waypoints, destination, speedKmh, clock }: {
  traveledKm: number; routeKm: number;
  waypoints: { name: string; routeKm: number }[];
  destination: string; speedKmh: number; clock: string;
}) {
  const progress = Math.min(Math.max(traveledKm / routeKm, 0), 1);
  const here = pointAt(progress);
  const remainingKm = Math.max(routeKm - traveledKm, 0);
  const etaMin = speedKmh > 0 ? Math.round(remainingKm / speedKmh * 60) : Math.round(remainingKm / 80 * 60);
  const nextWp = waypoints.filter((w) => w.routeKm > traveledKm).sort((a, b) => a.routeKm - b.routeKm)[0];

  return (
    <div className="relative h-full overflow-hidden">
      <svg viewBox="0 0 840 1184" className="absolute inset-0 h-full w-full" aria-hidden>
        {/* 배경 도로망 — 흐리게. 지도처럼 보이되 지도가 아니다 */}
        <g stroke="var(--p-surface-accent)" strokeWidth="6" fill="none" opacity="0.7">
          <path d="M -20 300 C 200 280, 400 360, 860 320" />
          <path d="M -20 620 C 260 560, 520 700, 860 640" />
          <path d="M -20 900 C 220 940, 480 860, 860 930" />
          <path d="M 180 -20 C 140 300, 260 700, 160 1200" />
          <path d="M 640 -20 C 700 400, 560 800, 700 1200" />
        </g>
        <g stroke="var(--p-surface-accent)" strokeWidth="3" fill="none" opacity="0.5">
          <path d="M -20 450 L 860 480" /><path d="M -20 760 L 860 740" /><path d="M 420 -20 L 400 1200" />
        </g>
        {/* 경로 — 남은 구간은 선명, 지난 구간은 흐리게 */}
        <path d={ROUTE_D} stroke="var(--p-positive)" strokeWidth="22" strokeLinecap="round" fill="none" opacity="0.18" />
        <path d={ROUTE_D} stroke="var(--p-positive)" strokeWidth="14" strokeLinecap="round" fill="none" pathLength={1} strokeDasharray={`${1 - progress} 1`} strokeDashoffset={-progress} />
        <path d={ROUTE_D} stroke="var(--p-text4)" strokeWidth="14" strokeLinecap="round" fill="none" pathLength={1} strokeDasharray={`${progress} 1`} />
        {/* 경유지 */}
        {waypoints.map((w) => {
          const p = pointAt(w.routeKm / routeKm);
          const passed = w.routeKm <= traveledKm;
          return (
            <g key={w.name} transform={`translate(${p.x} ${p.y})`} opacity={passed ? 0.45 : 1}>
              <circle r="30" fill="var(--p-bg)" stroke="var(--p-charging)" strokeWidth="8" />
              <path d="M 4 -14 L -8 2 L 1 2 L -4 14 L 8 -2 L -1 -2 Z" fill="var(--p-charging)" />
            </g>
          );
        })}
        {/* 목적지 */}
        <g transform={`translate(${END.x} ${END.y})`}>
          <circle r="26" fill="var(--p-text)" />
          <circle r="10" fill="var(--p-bg)" />
        </g>
        {/* 현재 위치 */}
        <g transform={`translate(${here.x} ${here.y})`}>
          <circle r="44" fill="var(--p-positive)" opacity="0.2" className="pulse-dot" />
          <circle r="22" fill="var(--p-positive)" stroke="var(--p-bg)" strokeWidth="6" />
        </g>
      </svg>

      {/* 다음 안내 카드 */}
      <div className="bg-p-surface sh-2 absolute flex items-center" style={{ left: u(24), top: u(24), right: u(120), padding: u(20), borderRadius: u(20), gap: u(20) }}>
        <span className="bg-p-positive flex items-center justify-center text-white" style={{ width: u(72), height: u(72), borderRadius: u(18) }}><ArrowUp style={icon(44)} /></span>
        <div className="min-w-0">
          <p className="t-title-s truncate tabular-nums">{nextWp ? `${Math.max(Math.round(nextWp.routeKm - traveledKm), 0)}km` : `${Math.round(remainingKm)}km`} <span className="t-body-s text-p-text3 font-normal">직진</span></p>
          <p className="t-label-m text-p-text3 flex items-center truncate" style={{ gap: u(8) }}>
            {nextWp ? <><Zap style={icon(20)} className="text-p-charging" /> {nextWp.name} 경유</> : <><Flag style={icon(20)} /> {destination}</>}
          </p>
        </div>
      </div>
      <span className="bg-p-surface sh-1 text-p-text2 absolute flex items-center justify-center" style={{ right: u(24), top: u(24), width: u(72), height: u(72), borderRadius: u(18) }} aria-hidden><Layers3 style={icon(32)} /></span>

      {/* 도착 정보 카드 */}
      <div className="bg-p-surface sh-2 absolute" style={{ left: u(24), right: u(24), bottom: u(24), padding: `${u(20)} ${u(24)}`, borderRadius: u(20) }}>
        <div className="flex items-baseline justify-between">
          <p className="t-title-s tabular-nums">{addMinutes(clock, etaMin)} <span className="t-label-m text-p-text3 font-normal">도착</span></p>
          <p className="t-body-s text-p-text2 tabular-nums">{etaMin}분 · {Math.round(remainingKm)}km</p>
        </div>
        <div className="bg-p-surface-high relative overflow-hidden" style={{ height: u(8), borderRadius: u(4), marginTop: u(16) }}>
          <div className="bg-p-positive h-full transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
          {waypoints.map((w) => <span key={w.name} className="bg-p-charging absolute top-0 h-full" style={{ left: `${(w.routeKm / routeKm) * 100}%`, width: u(6) }} />)}
        </div>
        <p className="t-label-s text-p-text4" style={{ marginTop: u(12) }}>Pleos 내비게이션 · 시스템 앱 (모의) · 경로·지도·검색은 여기서</p>
      </div>
    </div>
  );
}

/* 경로 — 아래(서울)에서 위(부산)로. 점 배열을 선형 보간해 위치를 얻는다 (SVG getPointAtLength 없이) */
const PTS: [number, number][] = [
  [150, 940], [185, 870], [260, 800], [300, 720], [330, 650], [380, 580], [430, 520], [470, 450], [520, 390], [560, 320], [600, 250], [640, 195], [690, 160],
];
const END = { x: PTS[PTS.length - 1][0], y: PTS[PTS.length - 1][1] };
const ROUTE_D = PTS.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
const SEG = PTS.slice(1).map(([x, y], i) => Math.hypot(x - PTS[i][0], y - PTS[i][1]));
const TOTAL = SEG.reduce((a, b) => a + b, 0);

function pointAt(t: number) {
  let d = Math.min(Math.max(t, 0), 1) * TOTAL;
  for (let i = 0; i < SEG.length; i++) {
    if (d <= SEG[i]) {
      const k = SEG[i] === 0 ? 0 : d / SEG[i];
      return { x: PTS[i][0] + (PTS[i + 1][0] - PTS[i][0]) * k, y: PTS[i][1] + (PTS[i + 1][1] - PTS[i][1]) * k };
    }
    d -= SEG[i];
  }
  return END;
}

function addMinutes(clock: string, min: number) {
  const [h, m] = clock.split(":").map(Number);
  const t = h * 60 + m + min;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
