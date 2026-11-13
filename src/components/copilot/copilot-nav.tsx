"use client";

import { ArrowUp, Flag, Layers3, Zap } from "lucide-react";
import { icon, u } from "../demo/car-ui";
import { NavMap } from "./car-graphics";

/**
 * 옆 창 **내비게이션 앱 모의** — demo/nav-mock 과 카드·수치가 같고 지도 그림만 NavMap(시가지 배경 ·
 * 부드러운 경로 · 진행 방향 화살표 · 경유지 이름표)으로 바꿨다. 출품 시연은 그대로 둔다.
 * 우리 앱은 지도를 그리지 않는다(CLAUDE.md 정책 5) — 이건 시스템 내비 자리를 흉내 낸 무대다.
 */
export function CopilotNav({ traveledKm, routeKm, waypoints, destination, speedKmh, clock }: {
  traveledKm: number; routeKm: number;
  waypoints: { name: string; routeKm: number }[];
  destination: string; speedKmh: number; clock: string;
}) {
  const progress = Math.min(Math.max(traveledKm / routeKm, 0), 1);
  const remainingKm = Math.max(routeKm - traveledKm, 0);
  const etaMin = speedKmh > 0 ? Math.round(remainingKm / speedKmh * 60) : Math.round(remainingKm / 80 * 60);
  const nextWp = waypoints.filter((w) => w.routeKm > traveledKm).sort((a, b) => a.routeKm - b.routeKm)[0];

  return (
    <div className="relative h-full overflow-hidden">
      <NavMap progress={progress} destination={destination}
        waypoints={waypoints.map((w) => ({ name: w.name, t: w.routeKm / routeKm, passed: w.routeKm <= traveledKm }))} />

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
      {/* 지도가 실제처럼 보일수록 "지도 API 를 붙였다"로 오해받는다 — 가짜 지도라고 지도 위에 적는다(정책 4) */}
      <MockBadge style={{ right: u(24), top: u(120) }}>모의 지도 · 시연용</MockBadge>

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
        <p className="t-label-m text-p-text3" style={{ marginTop: u(12) }}>Pleos 내비게이션 자리 · 시스템 앱을 흉내 낸 <strong className="text-p-text2">모의 화면</strong> · 실제 경로·지도·검색은 내비가 한다</p>
      </div>
    </div>
  );
}

/** 무대 위 "이건 가짜다" 표식 — 셸 전체가 Mock 인 것을 화면마다 적는다 */
export function MockBadge({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span className="t-label-m text-p-text2 bg-p-surface sh-1 absolute flex items-center" style={{ height: u(44), paddingInline: u(16), borderRadius: u(12), gap: u(8), ...style }}>
      <span className="bg-p-negative inline-block rounded-full" style={{ width: u(10), height: u(10) }} aria-hidden />{children}
    </span>
  );
}

function addMinutes(clock: string, min: number) {
  const [h, m] = clock.split(":").map(Number);
  const t = h * 60 + m + min;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
