"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * 사이트 상단 내비게이션 — **지금 어느 페이지인지**가 한눈에 보여야 한다.
 * 심사위원이 기획서와 시연 사이를 오가는 자리라, 현재 위치를 색과 밑줄로 두 번 표시한다.
 */
const ITEMS = [
  { href: "/", label: "소개" },
  { href: "/proposal/", label: "기획서" },
  { href: "/demo/", label: "시연" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="border-line bg-bg/80 no-print sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-bold tracking-tight">쉼표 DRIVE</span>
          <span className="text-muted hidden text-xs sm:inline">COMMA DRIVE</span>
        </Link>

        <nav aria-label="사이트" className="flex items-center gap-1">
          {ITEMS.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href.replace(/\/$/, ""));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "text-text" : "text-muted hover:text-text",
                )}
              >
                {item.label}
                {active && (
                  <span className="bg-accent absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
