"use client";

import { Bell, Bluetooth, Fan, ChevronLeft, ChevronRight, Grid2x2, Mic, Navigation, Search, Signal, User, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { icon, u } from "./car-ui";

/**
 * Pleos Connect **시스템 셸** — Connect-S 17" (2560×1440) 를 공식 px 그대로 그린다
 * (research/PLEOS_PLATFORM.md 7.1절: 상태바 96 · 드라이빙뷰 840 · 앱 창 1700×1184 또는 840×1184 ×2,
 * 사이 20 · GNB 160). 모든 치수는 car-px(--u) 라 어떤 폭으로 띄워도 비율이 같다.
 *
 * 이건 **무대**다. 차량 OS 가 그리는 영역이라 여기 있는 어떤 것도 Kotlin 으로 가지 않는다.
 * 심사위원이 "앱은 이 창 하나만 받는다"를 눈으로 보게 하는 것이 목적이다.
 *
 * orientation:
 *  · "portrait"  — 앱 창 **둘**(1:1). 우리 앱은 왼쪽(primary) 세로 창, 오른쪽은 내비 (기본)
 *  · "landscape" — 우리 앱이 창을 **확장**해 1700 폭을 쓴다 (2:0)
 *
 * viewMode "window" 는 셸 없이 **앱 창만** 띄운다 — 폰처럼 좁은 화면에서 2560 셸을 다 그리면
 * 글자가 읽히지 않아서다. 그때 --u 는 창 폭(840/1700) 기준으로 다시 잡힌다 (globals.css).
 */
export type Orientation = "portrait" | "landscape";
export type ShellTheme = "light" | "dark";
export type ViewMode = "shell" | "window";

/**
 * 공식 폼 팩터 프리셋의 **앱 창 dp** (research/PLEOS_PLATFORM.md 7.1절, FormFactorConsole 그림에서 확인).
 * 17" 는 1dp = 1px. 14.6"(200DPI) 와 12.9" 는 창 모양이 달라 같은 화면이 다르게 접힌다 — 공식 폼 팩터 테스트가 보는 것이 그것이다.
 */
export const WINDOW_PRESETS = {
  "s17-portrait": { label: "17\" 세로", w: 840, h: 1184, orientation: "portrait" as const },
  "s17-landscape": { label: "17\" 가로", w: 1700, h: 1184, orientation: "landscape" as const },
  "s146-landscape": { label: "14.6\" 가로", w: 1360, h: 948, orientation: "landscape" as const },
  "s129-portrait": { label: "12.9\" 세로", w: 628, h: 855, orientation: "portrait" as const },
} as const;
export type WindowPreset = keyof typeof WINDOW_PRESETS;

export function PleosShell({
  orientation, theme, viewMode = "shell", windowPreset, speedKmh, gear, batteryPct, rangeKm, outsideTempC, clock, children, neighbor,
}: {
  orientation: Orientation; theme: ShellTheme; viewMode?: ViewMode;
  /** 앱 창만 볼 때의 폼 팩터. 없으면 17" 와 orientation 으로 정한다 */
  windowPreset?: WindowPreset;
  speedKmh: number; gear: "P" | "D"; batteryPct: number; rangeKm: number; outsideTempC: number; clock: string;
  /** 우리 앱 창 */
  children: React.ReactNode;
  /** portrait 일 때 옆에 떠 있는 내비 앱 */
  neighbor: React.ReactNode;
}) {
  if (viewMode === "window") {
    const p = WINDOW_PRESETS[windowPreset ?? (orientation === "portrait" ? "s17-portrait" : "s17-landscape")];
    return (
      <div
        className="pleos pleos-window-only bg-p-bg relative overflow-hidden"
        data-theme={theme}
        data-orientation={p.orientation}
        // 1 car-px(dp) = 창 폭 ÷ 프리셋 폭. 글자·여백은 dp 로 고정이라 좁은 창에서는 더 빽빽하게 접힌다 — 그게 폼 팩터 테스트다
        style={{ aspectRatio: `${p.w} / ${p.h}`, borderRadius: u(24), ["--u" as string]: `calc(100cqw / ${p.w})` }}
      >
        <div className="relative flex h-full flex-col">{children}</div>
      </div>
    );
  }

  return (
    // 베젤 — 공식 그림의 20px 짙은 테두리. --u 는 안쪽(2560) 기준이어야 하므로 밖에 둔다
    <div className="bg-[#131417] shadow-2xl" style={{ padding: "0.78125%", borderRadius: "1.6%" }}>
      <div className="pleos bg-p-bg2 relative overflow-hidden" data-theme={theme} style={{ aspectRatio: "2560 / 1440", borderRadius: u(24) }}>
        {/* ── Status bar · 96 */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between" style={{ height: u(96), paddingInline: u(40) }}>
          <div className="flex items-center" style={{ gap: u(40) }}>
            <span className="t-label-m flex tracking-[0.3em]" style={{ gap: u(4) }}>
              {(["P", "R", "N", "D"] as const).map((g) => (
                <span key={g} className={cn(g === gear ? "bg-p-text text-p-bg2 t-strong" : "text-p-text4")} style={{ padding: `0 ${u(8)}`, borderRadius: u(6) }}>{g}</span>
              ))}
            </span>
            <span className="t-label-m text-p-text2 flex items-center" style={{ gap: u(12) }}>
              <span className="tabular-nums">{rangeKm}km</span>
              <BatteryGlyph pct={batteryPct} />
            </span>
          </div>
          <div className="text-p-text2 flex items-center" style={{ gap: u(36) }}>
            <User style={icon(28)} /><Search style={icon(28)} /><Volume2 style={icon(28)} /><Bell style={icon(28)} /><Signal style={icon(28)} /><Mic style={icon(28)} />
            <span className="t-body-s t-strong text-p-text tabular-nums">{clock}</span>
          </div>
        </div>

        {/* ── Driving view · 840 × 1184 — 운전자 쪽 고정. 앱이 숨기거나 끌 수 없다 */}
        <div className="absolute flex flex-col justify-between" style={{ left: 0, top: u(96), width: u(840), height: u(1184), padding: `${u(24)} ${u(56)} ${u(32)}` }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="tabular-nums" style={{ fontSize: u(120), lineHeight: u(120), fontWeight: 800, letterSpacing: "-0.03em" }}>{speedKmh}</p>
              <p className="t-label-m text-p-text3" style={{ marginTop: u(4) }}>km/h</p>
            </div>
            <div className="flex flex-col items-center" style={{ gap: u(8), marginTop: u(16) }}>
              <span className="t-body-m t-strong text-p-text flex items-center justify-center rounded-full" style={{ width: u(80), height: u(80), border: `${u(8)} solid var(--p-negative)` }}>100</span>
              <span className="t-label-s text-p-text3">제한</span>
            </div>
          </div>
          <RoadGraphic moving={speedKmh > 0} />
          <div className="flex items-end justify-between">
            <div className="t-label-m text-p-text3 flex flex-col" style={{ gap: u(4) }}>
              <span>외기 <span className="text-p-text2 tabular-nums">{outsideTempC}°C</span></span>
              <span className="tabular-nums">10,592 km</span>
            </div>
            <span className="t-label-s text-p-text4">Driving view · 시스템</span>
          </div>
        </div>

        {/* ── Application window(s) · y 96, h 1184 */}
        {orientation === "portrait" ? (
          <>
            <AppWindow left={840} width={840}>{children}</AppWindow>
            <AppWindow left={1700} width={840}>{neighbor}</AppWindow>
            {/* 두 창 사이 윈도 바 — 드래그로 위치·크기 바꾸는 손잡이 */}
            <div className="bg-p-text4 absolute" style={{ left: u(1686), top: u(96 + 592 - 60), width: u(8), height: u(120), borderRadius: u(4) }} />
          </>
        ) : (
          <>
            <AppWindow left={840} width={1700}>{children}</AppWindow>
            <div className="bg-p-text4 absolute" style={{ left: u(2546), top: u(96 + 592 - 60), width: u(8), height: u(120), borderRadius: u(4) }} />
          </>
        )}

        {/* ── GNB · 160 — 앱 라이브러리 · 즐겨찾는 앱 · 공조. 시스템 */}
        <div className="text-p-text2 absolute inset-x-0 bottom-0 flex items-center justify-between" style={{ height: u(160), paddingInline: u(56) }}>
          <ClimateCluster side="left" />
          <div className="flex items-center" style={{ gap: u(44) }}>
            <AppIcon color="#0082ff" label="내비게이션" active={orientation === "portrait"}><Navigation style={icon(44)} /></AppIcon>
            <AppIcon color="#7c3aed" label="미디어"><Volume2 style={icon(44)} /></AppIcon>
            <AppIcon color="#0ea5e9" label="앱 마켓"><Grid2x2 style={icon(44)} /></AppIcon>
            <AppIcon color="#1d1e21" label="쉼표 DRIVE" active ring><CommaMark size={48} /></AppIcon>
            <AppIcon color="#22c55e" label="메시지"><Bluetooth style={icon(44)} /></AppIcon>
            <span className="bg-p-btn text-p-text flex items-center justify-center" style={{ width: u(84), height: u(84), borderRadius: u(22) }} aria-label="앱 라이브러리"><Grid2x2 style={icon(40)} /></span>
          </div>
          <ClimateCluster side="right" />
        </div>
      </div>
    </div>
  );
}

function AppWindow({ left, width, children }: { left: number; width: number; children: React.ReactNode }) {
  return (
    <div className="bg-p-bg absolute overflow-hidden" style={{ left: u(left), top: u(96), width: u(width), height: u(1184), borderRadius: u(24) }}>
      <div className="relative flex h-full flex-col">{children}</div>
    </div>
  );
}

/** 우리 앱 아이콘 — 쉼표. public/favicon.svg 와 같은 모양 (이름이 바뀌면 둘을 같이 고친다) */
function CommaMark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 64 64" style={{ width: u(size), height: u(size) }} aria-hidden>
      <path d="M22 46c6-3 10-9 10-16a9 9 0 1 0-9 9" fill="none" stroke="#0082ff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="44" cy="20" r="5" fill="#00e074" />
    </svg>
  );
}

function AppIcon({ children, color, label, active = false, ring = false }: { children: React.ReactNode; color: string; label: string; active?: boolean; ring?: boolean }) {
  return (
    <span className="relative flex flex-col items-center" aria-label={label} title={label}>
      <span className={cn("flex items-center justify-center text-white", ring && "outline-p-text outline-offset-[calc(4*var(--u))] outline-[length:calc(3*var(--u))]")} style={{ width: u(84), height: u(84), borderRadius: u(22), background: color }}>{children}</span>
      {active && <span className="bg-p-text absolute" style={{ bottom: u(-16), width: u(10), height: u(10), borderRadius: "50%" }} />}
    </span>
  );
}

function ClimateCluster({ side }: { side: "left" | "right" }) {
  return (
    <div className="flex items-center" style={{ gap: u(28) }}>
      {side === "left" && <Fan style={icon(36)} />}
      <ChevronLeft style={icon(32)} className="text-p-text3" />
      <span className="flex flex-col items-center">
        <span className="t-body-m t-strong text-p-text tabular-nums">20.0</span>
        <span className="t-label-s text-p-text3">AUTO</span>
      </span>
      <ChevronRight style={icon(32)} className="text-p-text3" />
      {side === "right" && <Fan style={icon(36)} />}
    </div>
  );
}

function BatteryGlyph({ pct }: { pct: number }) {
  return (
    <span className="relative inline-flex items-center" style={{ width: u(52), height: u(26), border: `${u(3)} solid var(--p-text3)`, borderRadius: u(7), padding: u(3) }} aria-label={`배터리 ${pct}%`}>
      <span className="h-full rounded-[1px] transition-[width] duration-500" style={{ width: `${pct}%`, background: pct <= 20 ? "var(--p-negative)" : "var(--p-charging)" }} />
      <span className="bg-p-text3 absolute" style={{ right: u(-9), top: "30%", width: u(5), height: "40%", borderRadius: u(2) }} />
    </span>
  );
}

/** 드라이빙뷰의 차로 그림 — 공식 화면의 "내 차 + 차로" 모티프를 단순화. 지도는 아니다 */
function RoadGraphic({ moving }: { moving: boolean }) {
  return (
    <svg viewBox="0 0 728 560" className="w-full" style={{ height: u(560) }} aria-hidden>
      <defs>
        <linearGradient id="lane" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--p-positive)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--p-positive)" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {/* 차로 경계 — 원근 */}
      <path d="M 250 40 L 60 560" stroke="var(--p-text4)" strokeWidth="3" fill="none" />
      <path d="M 478 40 L 668 560" stroke="var(--p-text4)" strokeWidth="3" fill="none" />
      <path d="M 326 40 L 240 560" stroke="var(--p-text4)" strokeWidth="3" strokeDasharray="28 36" fill="none" />
      <path d="M 402 40 L 488 560" stroke="var(--p-text4)" strokeWidth="3" strokeDasharray="28 36" fill="none" />
      {/* 내 차로 하이라이트 */}
      <path d="M 326 40 L 402 40 L 488 560 L 240 560 Z" fill="url(#lane)" />
      {/* 앞차 둘 */}
      <rect x="300" y="150" width="66" height="44" rx="10" fill="var(--p-surface-accent)" />
      <rect x="440" y="210" width="80" height="54" rx="12" fill="var(--p-surface-accent)" />
      {/* 내 차 */}
      <rect x="306" y="400" width="116" height="140" rx="24" fill="var(--p-text)" />
      <rect x="322" y="420" width="84" height="40" rx="12" fill="var(--p-bg2)" opacity="0.5" />
      {moving && <circle cx="364" cy="380" r="6" className="pulse-dot" fill="var(--p-positive)" />}
    </svg>
  );
}
