"use client";

import { evidenceLine, canPickStop, type Candidate, type Decision } from "@/lib/assistant/integrated-decision";
import type { Fact, VehicleEnergy } from "@/lib/assistant/journey-fact";
import type { WaypointState } from "@/lib/assistant/waypoint-handoff";
import { CarButton, Card, u } from "@/components/demo/car-ui";

/** V6 한 화면 카드 — 차량용 앱 DecisionCard 와 같은 구성. 웹은 시연 데이터뿐이고 근거 줄에 그렇게 적힌다. '사용 가능'·'보장'이라 쓰지 않는다 */
const clock = (at: number | null) => at == null ? "—" : new Date(at + 9 * 3_600_000).toISOString().slice(11, 16);
const energyLine = (c: Candidate) =>
  `도착 잔량 ${Math.round(c.arrivalSocRange[0])}~${Math.round(c.arrivalSocRange[1])}% 추정 · 80%까지 충전 후 여유 ${Math.round(c.marginAfterChargePct)}%p 추정${c.chargeMinutes != null ? ` · 충전 약 ${c.chargeMinutes}분 추정` : ""}`;

export function DecisionCard({ decision: d, vehicle, notice, waypoint: w, parked, onAdd, onReject }: {
  decision: Decision; vehicle: Fact<VehicleEnergy>; notice: string | null; waypoint: WaypointState; parked: boolean;
  onAdd: (c: Candidate) => void; onReject: (c: Candidate) => void;
}) {
  const idle = w.phase === "IDLE" || w.phase === "FAILED";
  return (
    <Card tone="high" className="flex flex-col" style={{ gap: u(10) }}>
      <p className="t-label-m text-p-text3">이번 여정의 결정</p>
      <p className="t-title-m">{d.headline}</p>
      <p className="t-body-m text-p-text2">{d.detail}</p>
      {notice && <p className="t-body-m text-p-negative">판단이 바뀌었어요 · {notice}</p>}
      {d.top && (
        <>
          {d.top.reasons.map((r) => <p key={r} className="t-body-s text-p-text2">· {r}</p>)}
          <p className="t-body-s text-p-text2">{energyLine(d.top)}</p>
          <p className="t-label-m text-p-text3">우회 영향: {d.top.detourMinutes != null ? `약 ${d.top.detourMinutes}분` : "확인되지 않음"} · 상태 조회 {clock(d.top.station.retrievedAt)} · 상태 변화 {clock(d.top.station.statusChangedAt)}</p>
          <p className="t-label-m text-p-text3">{evidenceLine(d.top, vehicle)}</p>
          {w.message && <p className={`t-body-m ${w.phase === "VERIFIED" ? "text-p-active" : "text-p-negative"}`}>{w.message}</p>}
          {idle && (
            <div className="grid grid-cols-2" style={{ gap: u(12) }}>
              <CarButton size="medium" tone="positive" disabled={!canPickStop(d, d.top.stopId, parked)} onClick={() => onAdd(d.top!)}>경유지로 추가</CarButton>
              <CarButton size="medium" onClick={() => onReject(d.top!)}>이곳 말고</CarButton>
            </div>
          )}
        </>
      )}
      {d.alternatives.length > 0 && <p className="t-label-m text-p-text3">대안</p>}
      {d.alternatives.map((c) => <p key={c.stopId} className="t-label-m text-p-text2">{c.name} · {c.station.reason} · {energyLine(c)}</p>)}
      {d.needsCheck.length > 0 && <p className="t-label-m text-p-text3">확인 필요</p>}
      {d.needsCheck.map((c) => <p key={c.stopId} className="t-label-m text-p-text3">{c.name} · {c.reasons[0] ?? ""}</p>)}
    </Card>
  );
}
