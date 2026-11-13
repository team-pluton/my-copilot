import type { Metadata } from "next";
import Link from "next/link";
import { CopilotEntry } from "@/components/copilot/copilot-entry";

export const metadata: Metadata = { title: "MY CO-PILOT (실험)", robots: { index: false } };

/**
 * MY CO-PILOT 실험 시연 — 쉼표 DRIVE 시연(/demo)과 비교하려고 따로 둔 화면이다 (오너 지시 2026-10-26).
 * 출품작이 아니다. 사이트 메뉴에 걸지 않는다 — 1차 출품은 쉼표 DRIVE v3.1 이다 (HANDOFF · docs/my-copilot/MIGRATION.md).
 */
export default function CopilotPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-warn text-xs font-semibold">실험 · v4 확장 검토용 · 출품작 아님</p>
        <h1 className="text-2xl font-bold tracking-tight">MY CO-PILOT — 출발 준비부터 하차까지</h1>
        <p className="text-muted text-sm leading-relaxed">
          쉼표 DRIVE 의 에너지 판단 엔진을 그대로 품고, 그 앞뒤에 <strong className="text-text">출발 준비 · 상황 제안 · 하차 확인</strong>을 얹은 실험입니다.
          제안은 늘 하나만, 차량 설정 변경은 확인과 Safety Gate 를 거쳐서만 합니다. 위 시나리오 A~F 를 순서대로 눌러 보세요.
          비교 대상: <Link href="/demo" className="text-accent underline">쉼표 DRIVE 시연</Link>.
        </p>
      </header>
      <CopilotEntry />
    </div>
  );
}
