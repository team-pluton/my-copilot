"use client";

import { Printer } from "lucide-react";

/** 기획서를 PDF 로 — 브라우저 인쇄. globals.css 의 @media print 가 목차·내비를 숨기고 흰 배경으로 바꾼다 */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="no-print border-line hover:bg-surface inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors">
      <Printer className="size-4" /> PDF 로 저장 (인쇄)
    </button>
  );
}
