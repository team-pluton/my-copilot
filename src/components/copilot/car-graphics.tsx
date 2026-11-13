"use client";

import { useEffect, useId, useState } from "react";

/**
 * MY CO-PILOT 시연 무대의 **그림** — 드라이빙뷰 차로 장면과 옆 창 내비 지도.
 *
 * 둘 다 시스템(차량 OS · 내비 앱)이 그리는 자리라 Kotlin 으로 가지 않는다. 출품 시연(/demo)의
 * 단순한 그림(demo/pleos-shell · demo/nav-mock)은 1차 제출 그대로 두고, 여기서만 다듬었다.
 * 지도처럼 보이되 지도가 아니다 — 블록·강·공원은 가상의 배경이고 좌표도 가상이다(CLAUDE.md 정책 5).
 */

/* ───────── 드라이빙뷰 · 차로 장면 ─────────
 * 소실점 하나짜리 원근. 화면 y = HORIZON + F / z (z = 카메라에서의 거리, 바닥 y=560 이 z=1).
 * 점선은 z 로 놓아 멀수록 짧고 가늘다 — 일정 간격 dasharray 로는 원근이 안 산다.
 */
const VW = 728, VH = 560, CX = 364, HORIZON = -60, F = VH - HORIZON;
const LANES = [40, 256, 472, 688]; // 바닥(z=1)에서의 차로 경계 x — 3차로, 가운데가 내 차로
const yAt = (z: number) => HORIZON + F / z;
const xAt = (xb: number, z: number) => CX + (xb - CX) / z;

/** 주행 중이면 차로 점선이 다가온다 — 속도에 비례. 움직임 줄이기 설정이면 멈춘 그림 */
function useRoadPhase(speedKmh: number) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (speedKmh <= 0) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(t - last, 64) / 1000; last = t;
      setPhase((p) => (p + dt * speedKmh * 0.012) % DASH_PERIOD);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speedKmh]);
  return phase;
}

const DASH_LEN = 0.32, DASH_PERIOD = 0.8, Z_NEAR = 0.92, Z_FAR = 12;

function dashQuads(xb: number, phase: number) {
  const quads: string[] = [];
  for (let z0 = Z_NEAR - phase; z0 < Z_FAR; z0 += DASH_PERIOD) {
    const a = Math.max(z0, Z_NEAR), b = z0 + DASH_LEN;
    if (b <= Z_NEAR) continue;
    const w = (z: number) => 4.5 / z;
    const [ya, yb] = [yAt(a), yAt(b)];
    const [xa, xbb] = [xAt(xb, a), xAt(xb, b)];
    quads.push(`M ${xa - w(a)} ${ya} L ${xa + w(a)} ${ya} L ${xbb + w(b)} ${yb} L ${xbb - w(b)} ${yb} Z`);
  }
  return quads.join(" ");
}

function quad(xl: number, xr: number, zNear: number, zFar: number) {
  return `M ${xAt(xl, zNear)} ${yAt(zNear)} L ${xAt(xr, zNear)} ${yAt(zNear)} L ${xAt(xr, zFar)} ${yAt(zFar)} L ${xAt(xl, zFar)} ${yAt(zFar)} Z`;
}

export function RoadScene({ speedKmh }: { speedKmh: number }) {
  const id = useId().replace(/:/g, "");
  const phase = useRoadPhase(speedKmh);
  const moving = speedKmh > 0;
  const laneW = LANES[1] - LANES[0];
  // 앞차 — 내 차로 먼 곳 하나, 오른쪽 차로 가까운 곳 하나. 주행 중에는 천천히 거리가 숨 쉰다
  const breathe = moving ? Math.sin(phase / DASH_PERIOD * Math.PI * 2) * 0.03 : 0;
  const cars = [
    { lane: 2, z: 1.55 + breathe, tone: "far" as const },
    { lane: 1, z: 2.3 - breathe, tone: "far" as const },
  ];
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ height: "calc(560 * var(--u))" }} aria-hidden>
      <defs>
        <linearGradient id={`${id}road`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--p-surface-high)" stopOpacity="0" />
          <stop offset="0.55" stopColor="var(--p-surface-high)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--p-surface-high)" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={`${id}lane`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--p-positive)" stopOpacity="0" />
          <stop offset="0.6" stopColor="var(--p-positive)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--p-positive)" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id={`${id}fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.9" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.35" />
        </linearGradient>
        <mask id={`${id}mask`}><rect width={VW} height={VH} fill={`url(#${id}fade)`} /></mask>
        <filter id={`${id}blur`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
        <filter id={`${id}glow`} x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="3" /></filter>
        <CarDefs id={id} />
      </defs>

      <g mask={`url(#${id}mask)`}>
        {/* 노면 · 내 차로 하이라이트 · 차로 가장자리(밝게) */}
        <path d={quad(LANES[0] - 40, LANES[3] + 40, Z_NEAR, 40)} fill={`url(#${id}road)`} />
        <path d={quad(LANES[1], LANES[2], Z_NEAR, 40)} fill={`url(#${id}lane)`} />
        {[LANES[1], LANES[2]].map((xb) => (
          <path key={`e${xb}`} d={`M ${xAt(xb, Z_NEAR)} ${yAt(Z_NEAR)} L ${xAt(xb, 40)} ${yAt(40)}`} stroke="var(--p-positive)" strokeOpacity="0.35" strokeWidth="2" />
        ))}
        {/* 바깥 실선 — 길가 */}
        {[LANES[0], LANES[3]].map((xb) => (
          <path key={`s${xb}`} d={quad(xb - 5, xb + 5, Z_NEAR, 40)} fill="var(--p-text3)" />
        ))}
        {/* 차로 점선 — 원근으로 놓는다 */}
        <path d={dashQuads(LANES[1], phase) + " " + dashQuads(LANES[2], phase)} fill="var(--p-text2)" />
        {/* 앞차 — 멀수록 흐리고 작다 */}
        {cars.map((c, i) => {
          const cx = xAt(LANES[c.lane - 1] + laneW / 2, c.z);
          const s = 1.24 / c.z;
          return <CarRear key={i} id={id} x={cx} y={yAt(c.z)} scale={s} tone={c.tone} opacity={Math.min(1, 1.6 / c.z + 0.15)} />;
        })}
      </g>

      {/* 앞차와의 거리 띠 — 크루즈 중 내 차로 앞 */}
      {moving && <path d={quad(LANES[1] + 30, LANES[2] - 30, 1.47, 1.5)} fill="var(--p-positive)" opacity="0.7" />}
      {/* 내 차 */}
      <CarRear id={id} x={CX} y={yAt(1.06)} scale={1.18} tone="me" />
    </svg>
  );
}

function CarDefs({ id }: { id: string }) {
  return (
    <>
      <linearGradient id={`${id}shade`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
        <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.28" />
      </linearGradient>
      <linearGradient id={`${id}side`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#000" stopOpacity="0.22" />
        <stop offset="0.18" stopColor="#000" stopOpacity="0" />
        <stop offset="0.82" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.22" />
      </linearGradient>
      <linearGradient id={`${id}glass`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5b6170" />
        <stop offset="0.5" stopColor="#1b1d22" />
        <stop offset="1" stopColor="#0d0e11" />
      </linearGradient>
    </>
  );
}

/** 뒤에서 본 차 — 원점이 바닥 가운데, 폭 100. 내 차는 본문색(테마 반전), 앞차는 면 색 */
const BODY = "M -50 -16 Q -51 -5 -41 -5 L 41 -5 Q 51 -5 50 -16 L 48.5 -44 Q 47.5 -53 39 -55 L -39 -55 Q -47.5 -53 -48.5 -44 Z";
const CABIN = "M -39 -54 L -31 -82 Q -29 -88 -22 -88 L 22 -88 Q 29 -88 31 -82 L 39 -54 Z";
function CarRear({ id, x, y, scale, tone, opacity = 1 }: { id: string; x: number; y: number; scale: number; tone: "me" | "far"; opacity?: number }) {
  const body = tone === "me" ? "var(--p-text)" : "var(--p-surface-accent)";
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity}>
      <ellipse cx="0" cy="-2" rx="58" ry="9" fill="#000" opacity="0.45" filter={`url(#${id}blur)`} />
      <rect x="-47" y="-20" width="17" height="19" rx="5" fill="#0b0c0e" />
      <rect x="30" y="-20" width="17" height="19" rx="5" fill="#0b0c0e" />
      <path d={CABIN} fill={body} />
      <path d={CABIN} fill={`url(#${id}shade)`} />
      <path d="M -32.5 -58 L -25.5 -81.5 Q -24.5 -84 -21 -84 L 21 -84 Q 24.5 -84 25.5 -81.5 L 32.5 -58 Z" fill={`url(#${id}glass)`} />
      <path d="M -22 -81 L 4 -81 L -10 -60 L -29 -60 Z" fill="#fff" opacity="0.07" />
      <path d={BODY} fill={body} />
      <path d={BODY} fill={`url(#${id}shade)`} />
      <path d={BODY} fill={`url(#${id}side)`} />
      {/* 리어 램프 — 가로 한 줄(요즘 EV 모티프). 내 차만 은은하게 번진다 */}
      {tone === "me" && <rect x="-46" y="-47" width="92" height="6" rx="3" fill="#ff3b30" opacity="0.55" filter={`url(#${id}glow)`} />}
      <rect x="-46" y="-46.5" width="92" height="4.5" rx="2.25" fill="#ff3b30" opacity={tone === "me" ? 1 : 0.8} />
      <rect x="-46" y="-46.5" width="92" height="1.5" rx="0.75" fill="#ffb3ad" opacity="0.6" />
      <rect x="-13" y="-31" width="26" height="9" rx="2" fill="var(--p-bg2)" opacity="0.55" />
      <path d="M -44 -12 L 44 -12" stroke="#000" strokeOpacity="0.25" strokeWidth="1.5" />
    </g>
  );
}

/* ───────── 옆 창 · 내비 지도 ─────────
 * 경로는 제어점을 Catmull-Rom 으로 이어 촘촘히 샘플한다 — 같은 점 배열로 선도 긋고 현재 위치도 찾아
 * 마커가 선에서 벗어나지 않는다(getPointAtLength 없이, 정적 내보내기에서도 같은 그림).
 */
// 위(다음 안내)·아래(도착 정보) 카드에 가리지 않는 띠 안에 둔다
const CTRL: [number, number][] = [
  [140, 880], [175, 824], [250, 777], [290, 724], [318, 672], [372, 623], [446, 588], [478, 538], [512, 490], [574, 447], [612, 395], [650, 356], [700, 330],
];
const ROUTE = sampleSpline(CTRL, 24);
const SEGS = ROUTE.slice(1).map(([x, y], i) => Math.hypot(x - ROUTE[i][0], y - ROUTE[i][1]));
const ROUTE_LEN = SEGS.reduce((a, b) => a + b, 0);
const ROUTE_D = ROUTE.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

function sampleSpline(pts: [number, number][], per: number) {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** 경로 비율 t(0~1)의 점과 진행 방향(도, 위가 0) */
export function routePointAt(t: number) {
  let d = Math.min(Math.max(t, 0), 1) * ROUTE_LEN;
  for (let i = 0; i < SEGS.length; i++) {
    if (d <= SEGS[i] || i === SEGS.length - 1) {
      const k = SEGS[i] === 0 ? 0 : Math.min(d / SEGS[i], 1);
      const [ax, ay] = ROUTE[i], [bx, by] = ROUTE[i + 1];
      return { x: ax + (bx - ax) * k, y: ay + (by - ay) * k, deg: Math.atan2(bx - ax, ay - by) * 180 / Math.PI };
    }
    d -= SEGS[i];
  }
  const [x, y] = ROUTE[ROUTE.length - 1];
  return { x, y, deg: 0 };
}

/* 배경 — 가상의 시가지. 고정 시드라 매번 같은 그림 */
const BLOCKS = (() => {
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let gy = -40; gy < 1220; gy += 88) for (let gx = -40; gx < 880; gx += 96) {
    if (rnd() < 0.22) continue;
    const w = 52 + rnd() * 30, h = 44 + rnd() * 28;
    out.push({ x: gx + rnd() * (96 - w), y: gy + rnd() * (88 - h), w, h });
  }
  return out;
})();
const RIVER = "M -40 690 C 120 650, 220 720, 380 690 S 640 600, 880 640";
const PARKS = ["M 560 820 q 70 -30 130 10 q 40 50 -10 100 q -80 30 -130 -20 q -30 -50 10 -90 Z", "M 70 300 q 60 -40 120 0 q 30 50 -20 80 q -70 20 -100 -20 Z"];
const MAJOR = ["M -20 300 C 200 280, 400 360, 860 320", "M -20 900 C 220 940, 480 860, 860 930", "M 180 -20 C 140 300, 260 700, 160 1200", "M 640 -20 C 700 400, 560 800, 700 1200"];
const MINOR = ["M -20 450 L 860 480", "M -20 560 C 300 540, 500 600, 860 560", "M -20 1040 L 860 1010", "M 420 -20 L 400 1200", "M 300 -20 L 260 1200", "M 540 -20 C 520 400, 560 800, 520 1200", "M -20 150 L 860 130", "M 760 -20 L 780 1200"];

export function NavMap({ progress, waypoints, destination }: {
  progress: number;
  waypoints: { name: string; t: number; passed: boolean }[];
  destination: string;
}) {
  const id = useId().replace(/:/g, "");
  const here = routePointAt(progress);
  const end = ROUTE[ROUTE.length - 1];
  // 남은 경로 위 방향 화살표 — 길이 기준 등간격
  const chevrons: { x: number; y: number; deg: number }[] = [];
  for (let t = progress + 0.07; t < 0.97; t += 0.09) chevrons.push(routePointAt(t));

  return (
    <svg viewBox="0 0 840 1184" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={`${id}top`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--p-bg)" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--p-bg)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}bot`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="var(--p-bg)" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--p-bg)" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}sh`} x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000" floodOpacity="0.35" /></filter>
      </defs>

      {/* 시가지 블록 · 공원 · 강 */}
      <g fill="var(--p-surface-high)" opacity="0.4">
        {BLOCKS.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="6" />)}
      </g>
      <g fill="var(--p-active)" opacity="0.1">{PARKS.map((d) => <path key={d} d={d} />)}</g>
      <path d={RIVER} stroke="var(--p-positive)" strokeOpacity="0.14" strokeWidth="64" fill="none" strokeLinecap="round" />
      <path d={RIVER} stroke="var(--p-positive)" strokeOpacity="0.1" strokeWidth="80" fill="none" strokeLinecap="round" />

      {/* 도로 — 작은 길, 큰 길(테두리 + 면) */}
      <g stroke="var(--p-surface-accent)" strokeWidth="5" fill="none" opacity="0.6">{MINOR.map((d) => <path key={d} d={d} />)}</g>
      <g fill="none" strokeLinecap="round">
        {MAJOR.map((d) => <path key={`c${d}`} d={d} stroke="var(--p-bg2)" strokeWidth="18" />)}
        {MAJOR.map((d) => <path key={d} d={d} stroke="var(--p-surface-accent)" strokeWidth="11" />)}
      </g>

      {/* 경로 — 테두리 · 지난 구간(흐림) · 남은 구간(선명) · 윤기 */}
      <path d={ROUTE_D} stroke="var(--p-bg2)" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9" />
      <path d={ROUTE_D} stroke="var(--p-text4)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" fill="none" pathLength={1} strokeDasharray={`${progress} 1`} />
      <path d={ROUTE_D} stroke="var(--p-positive)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" fill="none" pathLength={1} strokeDasharray={`${1 - progress} 1`} strokeDashoffset={-progress} />
      <path d={ROUTE_D} stroke="#fff" strokeOpacity="0.22" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" pathLength={1} strokeDasharray={`${1 - progress} 1`} strokeDashoffset={-progress} transform="translate(-2 -2)" />
      {chevrons.map((c, i) => (
        <path key={i} d="M -6 4 L 0 -3 L 6 4" transform={`translate(${c.x} ${c.y}) rotate(${c.deg})`} stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.85" />
      ))}

      {/* 출발지 */}
      <circle cx={ROUTE[0][0]} cy={ROUTE[0][1]} r="11" fill="var(--p-bg2)" stroke="var(--p-text3)" strokeWidth="5" />

      {/* 경유지 — 충전 마커 + 이름표 */}
      {waypoints.map((w) => {
        const p = routePointAt(w.t);
        const labelW = w.name.length * 25 + 36;
        const left = p.x + labelW + 60 > 830;
        return (
          <g key={w.name} opacity={w.passed ? 0.45 : 1}>
            <g transform={`translate(${p.x + (left ? -44 - labelW : 44)} ${p.y - 24})`} filter={`url(#${id}sh)`}>
              <rect width={labelW} height="48" rx="24" fill="var(--p-surface)" />
              <text x={labelW / 2} y="32" textAnchor="middle" fontSize="24" fontWeight="600" fill="var(--p-text)">{w.name}</text>
            </g>
            <g transform={`translate(${p.x} ${p.y})`} filter={`url(#${id}sh)`}>
              <circle r="30" fill="var(--p-charging)" />
              <circle r="30" fill="none" stroke="var(--p-bg2)" strokeWidth="5" />
              <path d="M 4 -15 L -9 3 L 0 3 L -4 15 L 9 -3 L 0 -3 Z" fill="#fff" />
            </g>
          </g>
        );
      })}

      {/* 목적지 — 핀 + 이름표 */}
      <g transform={`translate(${end[0]} ${end[1]})`} filter={`url(#${id}sh)`}>
        <path d="M 0 0 C -6 -14, -26 -26, -26 -46 A 26 26 0 1 1 26 -46 C 26 -26, 6 -14, 0 0 Z" fill="var(--p-negative)" />
        <circle cy="-46" r="10" fill="#fff" />
        <g transform={`translate(${-(destination.length * 25 + 36) - 34} -70)`}>
          <rect width={destination.length * 25 + 36} height="48" rx="24" fill="var(--p-surface)" />
          <text x={(destination.length * 25 + 36) / 2} y="32" textAnchor="middle" fontSize="24" fontWeight="600" fill="var(--p-text)">{destination}</text>
        </g>
      </g>

      {/* 현재 위치 — 진행 방향 화살표 */}
      <g transform={`translate(${here.x} ${here.y})`}>
        <circle r="40" fill="var(--p-positive)" opacity="0.18" className="pulse-dot" />
        <circle r="30" fill="#fff" filter={`url(#${id}sh)`} />
        <path d="M 0 -19 L 14 15 L 0 9 L -14 15 Z" fill="var(--p-positive)" stroke="var(--p-positive)" strokeWidth="3" strokeLinejoin="round" transform={`rotate(${here.deg})`} />
      </g>

      {/* 카드가 얹히는 위·아래는 흐리게 — 글자가 지도 위에서 읽히게 */}
      <rect width="840" height="260" fill={`url(#${id}top)`} />
      <rect y="904" width="840" height="280" fill={`url(#${id}bot)`} />
    </svg>
  );
}
