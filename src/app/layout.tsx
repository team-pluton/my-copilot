import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3008"),
  title: {
    default: "쉼표 DRIVE — 앞으로 무엇을 할 수 있는지 알려주는 차량용 이동 판단 서비스",
    template: "%s · 쉼표 DRIVE",
  },
  description:
    "도착 후 차에서 쓸 에너지까지 세어 충전하러 서야 하는지 먼저 판단하고, 동승자 조건에 맞는 충전·휴식 장소를 차량 내비게이션 경유지로 넘기는 Pleos Connect 앱. 현대자동차그룹 차량용 앱 개발 공모전 2026 출품작.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "쉼표 DRIVE",
    description: "충전이 필요한지 먼저 판단하는 EV 이동 플래너 — 장거리 여행 · 픽업·마중 · Pleos Connect",
    images: ["/og.png"],
  },
};

/**
 * 폰트는 next/font 대신 Google Fonts 링크로 싣는다. next/font 에 묶인 Asta Sans 메타데이터가
 * latin 서브셋만 알고 있어 한글이 빠진다 — Google 의 css2 는 한글을 120개 조각으로 쪼개
 * unicode-range 로 내려 주므로 링크가 더 가볍고 정확하다.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- app/layout.tsx 는 모든 페이지에 적용된다. pages 전용 경고 */}
        <link href="https://fonts.googleapis.com/css2?family=Asta+Sans:wght@300..800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-dvh">
        <SiteNav />
        <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">{children}</main>
        <footer className="text-muted no-print mx-auto max-w-6xl px-4 pb-8 text-xs sm:px-6">
          현대자동차그룹 차량용 앱 개발 공모전 2026 출품 준비작 · 화면의 장소·시간은
          시연용 가상 데이터이며 실제 Pleos SDK 연동이 아닙니다.
        </footer>
      </body>
    </html>
  );
}
