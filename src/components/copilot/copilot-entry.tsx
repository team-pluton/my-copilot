"use client";

import dynamic from "next/dynamic";

/**
 * 브라우저에서만 그린다 — 프로필·기록을 localStorage 에서 첫 렌더에 읽기 때문이다.
 * 서버(정적 export)에서 그리면 저장된 값과 첫 화면이 달라 hydration 이 어긋난다.
 */
export const CopilotEntry = dynamic(() => import("./copilot-sim"), {
  ssr: false,
  loading: () => <p className="text-muted text-sm">시연 불러오는 중…</p>,
});
