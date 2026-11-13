"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 앱 창 안에서 쓰는 **공식 컴포넌트 흉내** — Basic button · Icon button · Toast · Card.
 * 규격은 research/PLEOS_PLATFORM.md 7.5절. 치수는 전부 car-px(--u) 다.
 *
 * 왜 Tailwind 크기 유틸을 안 쓰나: `p-4` 는 16px 고정이라 셸을 작게 띄우면 글자보다
 * 여백이 커진다. 모든 치수가 창 폭에 비례해야 공식 비율이 유지된다.
 */
export const u = (n: number) => `calc(${n} * var(--u))`;

/* ───────── Basic button ─────────
 * Primary = basic(연한 면·본문색 글자), Secondary = filled(짙은 면·반전 글자) — 공식 Hierarchy.
 * positive 는 informative_positive 면 — 공식 계층엔 없지만 "주요 행동 하나"를 세우려고 둔다.
 * Loading 이면 스피너만 남고 제어 불가(공식 상태표). */
export type ButtonTone = "basic" | "filled" | "positive";
export type ButtonSize = "large" | "medium";

export function CarButton({
  children, onClick, tone = "basic", size = "large", loading = false, disabled = false, className, block = false,
}: {
  children: React.ReactNode; onClick?: () => void; tone?: ButtonTone; size?: ButtonSize;
  loading?: boolean; disabled?: boolean; className?: string; block?: boolean;
}) {
  const h = size === "large" ? 96 : 80;
  const off = disabled || loading;
  return (
    <button
      type="button"
      onClick={off ? undefined : onClick}
      aria-disabled={off || undefined}
      aria-busy={loading || undefined}
      className={cn(
        "t-strong relative inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-[background-color,transform] duration-150 active:scale-[0.985]",
        size === "large" ? "t-body-l" : "t-body-m",
        tone === "basic" && "bg-p-btn text-p-text active:bg-p-btn-pressed",
        tone === "filled" && "bg-p-filled text-p-filled-text",
        tone === "positive" && "bg-p-positive text-white",
        disabled && "bg-transparent text-p-text4 ring-inset ring-p-line ring-[length:calc(2*var(--u))]",
        block && "w-full",
        className,
      )}
      style={{ height: u(h), paddingInline: u(size === "large" ? 40 : 32), borderRadius: u(28), gap: u(12) }}
    >
      <span className={cn("inline-flex items-center", loading && "invisible")} style={{ gap: u(12) }}>{children}</span>
      {loading && <Loader2 className="spin absolute" style={{ width: u(40), height: u(40) }} aria-label="처리 중" />}
    </button>
  );
}

/** Icon button — Style Basic(정사각 라운드 면), Size L 96 · M 80 · S 64 */
export function CarIconButton({ children, onClick, label, size = "medium", active = false, className }: {
  children: React.ReactNode; onClick?: () => void; label: string; size?: "large" | "medium" | "small"; active?: boolean; className?: string;
}) {
  const s = size === "large" ? 96 : size === "medium" ? 80 : 64;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active || undefined}
      className={cn("inline-flex shrink-0 items-center justify-center transition-colors active:scale-[0.97]", active ? "bg-p-filled text-p-filled-text" : "bg-p-btn text-p-text active:bg-p-btn-pressed", className)}
      style={{ width: u(s), height: u(s), borderRadius: u(20) }}
    >
      {children}
    </button>
  );
}

/** 아이콘 크기 보조 — lucide 는 px 를 받으므로 car-px 로 바꿔 준다 */
export const icon = (n: number) => ({ width: u(n), height: u(n) });

/** Card — surface_basic 위에 radius 24, padding 32. 셸 창 배경(background_primary)과 한 단계 차이 */
export function Card({ children, className, pad = 32, tone = "basic", style }: {
  children: React.ReactNode; className?: string; pad?: number; tone?: "basic" | "high" | "low"; style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(tone === "basic" ? "bg-p-surface" : tone === "high" ? "bg-p-surface-high" : "bg-p-surface-low", className)}
      style={{ borderRadius: u(24), padding: u(pad), ...style }}
    >
      {children}
    </div>
  );
}

/* ───────── Toast ─────────
 * 앱 패널 하단 중앙 · side 24 · bottom 24 · 최대 폭 792 · 글자 최대 712 · 내부 40/24.
 * 색은 짙은 면(surface_high 급)에 흰 글자 — 공식 그림이 그렇다. 3초 뒤 사라진다. */
export type ToastData = { id: number; text: string; tone?: "neutral" | "positive" | "negative" };

export function Toast({ toast }: { toast: ToastData | null }) {
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      className="toast-in sh-2 t-body-m t-strong pointer-events-none absolute left-1/2 text-white"
      style={{
        bottom: u(24), maxWidth: `min(${u(792)}, calc(100% - ${u(48)}))`, paddingInline: u(40), paddingBlock: u(24), borderRadius: u(24),
        background: toast.tone === "positive" ? "var(--p-positive)" : toast.tone === "negative" ? "var(--p-negative)" : "#313236",
      }}
    >
      <span className="block text-center" style={{ maxWidth: u(712) }}>{toast.text}</span>
    </div>
  );
}

/** 토스트 상태 — 띄우면 3초 뒤 스스로 걷힌다 */
export function useToast() {
  const [toast, setToast] = useState<ToastData | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);
  const show = (text: string, tone: ToastData["tone"] = "neutral") => setToast({ id: ++seq.current, text, tone });
  return { toast, show, clear: () => setToast(null) };
}

/** 숫자가 바뀔 때 짧게 굴러가게 — 상태 화면의 큰 숫자 하나에만 쓴다 */
export function useTween(target: number, ms = 360) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min((t - start) / ms, 1);
      const e = 1 - (1 - k) * (1 - k);
      const next = a + (target - a) * e;
      setValue(next);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/** 라벨 한 줄 (text_tertiary · Label M) */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("t-label-m text-p-text3", className)}>{children}</p>;
}

/** 가로 막대 — 에너지·점수. 폭 전환에 트랜지션 */
export function Bar({ segments, height = 24, className }: { segments: { pct: number; color: string; label?: string }[]; height?: number; className?: string }) {
  return (
    <div className={cn("bg-p-surface-high flex overflow-hidden", className)} style={{ height: u(height), borderRadius: u(height / 2) }}>
      {segments.map((s, i) => (
        <div key={i} title={s.label} className="transition-[width] duration-500 ease-out" style={{ width: `${Math.max(s.pct, 0)}%`, background: s.color }} />
      ))}
    </div>
  );
}
