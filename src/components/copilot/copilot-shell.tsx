"use client";

import { Bell, Bluetooth, Fan, ChevronLeft, ChevronRight, Grid2x2, Mic, Navigation, Search, Signal, User, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { icon, u } from "../demo/car-ui";
import { WINDOW_PRESETS, type Orientation, type ShellTheme, type ViewMode, type WindowPreset } from "../demo/pleos-shell";
import { RoadScene } from "./car-graphics";

/**
 * MY CO-PILOT 시연용 **시스템 셸** — demo/pleos-shell 과 치수·구성이 같고, 드라이빙뷰 차로 그림만
 * car-graphics 의 RoadScene(원근 점선 · 차 실루엣)으로 바꿨다. 출품 시연(/demo)의 셸은 1차 제출
 * 그대로 두려고 고치지 않고 갈라 놓았다 — 셸 치수를 바꿀 일이 생기면 둘을 같이 고친다.
 */
export function CopilotShell({
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
          <RoadScene speedKmh={speedKmh} />
          <div className="flex items-end justify-between">
            <div className="t-label-m text-p-text3 flex flex-col" style={{ gap: u(4) }}>
              <span>외기 <span className="text-p-text2 tabular-nums">{outsideTempC}°C</span></span>
              <span className="tabular-nums">10,592 km</span>
            </div>
            <span className="t-label-m text-p-text3">Driving view · 시스템 영역 · <strong className="text-p-text2">모의 그림</strong></span>
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
