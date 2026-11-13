"use client";

import { useEffect, useMemo, useState } from "react";
import { chargeMinutes, estimate, pctPerKm } from "@/lib/core/energy";
import { excluded, feasibilityFor, rank } from "@/lib/core/engine";
import { DEFAULT_PLAN, DEFAULT_VEHICLE, DEMO_STOPS, WAIT_PLAN, WAIT_VEHICLE } from "@/lib/core/mock";
import { phaseOf } from "@/lib/core/scheduler";
import { Toast } from "@/components/demo/car-ui";
import { NavMock } from "@/components/demo/nav-mock";
import { PleosShell } from "@/components/demo/pleos-shell";
import { ArrivedScreen, CandidatesScreen, DrivingScreen, EnergyScreen, StatusScreen, type ScreenId } from "@/components/demo/screens";

/**
 * 소개 페이지의 **살아 있는 미리보기** — 시연의 핵심 장면 8개를 자동으로 돈다.
 * 조작은 못 한다(pointer-events 없음). 손대고 싶으면 시연 페이지로.
 *
 * 시뮬레이터와 같은 코어(estimate · rank)를 쓰므로 숫자가 시연과 어긋나지 않는다.
 */
/** wait: 픽업·마중(WAIT) 시나리오 장면 — "같은 엔진, 다른 순간" */
type Step = { screen: ScreenId; km: number; playing?: boolean; waypoint?: boolean; toast?: string; charged?: boolean; wait?: boolean };

const STEPS: Step[] = [
  { screen: 1, km: 0 },
  { screen: 3, km: 0 },
  { screen: 4, km: 0 },
  { screen: 4, km: 0, waypoint: true, toast: "경유지 추가됨 · onWaypointChanged" },
  { screen: 5, km: 40, playing: true, waypoint: true },
  { screen: 5, km: 120, playing: true, waypoint: true },
  { screen: 6, km: -1, waypoint: true }, // -1 = 경유지 위치
  { screen: 1, km: -1, charged: true },
  { screen: 1, km: 0, wait: true },
  { screen: 3, km: 0, wait: true },
];
const STEP_MS = 2600;

export function ShellPreview() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % STEPS.length), STEP_MS);
    return () => clearInterval(id);
  }, []);
  const step = STEPS[i];

  const plan = step.wait ? WAIT_PLAN : DEFAULT_PLAN;
  const base = step.wait ? WAIT_VEHICLE : DEFAULT_VEHICLE;
  // 출발 시점의 1위 후보 — 주행 내내 같은 곳을 향한다
  const chosen = useMemo(() => {
    const e0 = estimate(plan, base);
    return rank(DEMO_STOPS, { plan, traveledKm: 0, needsCharge: e0.needsCharge, tripMinutes: 0, feasibility: feasibilityFor(base, e0.waitPct, plan.minReservePct) })[0]?.stop ?? null;
  }, [plan, base]);

  const km = step.km < 0 ? (chosen?.routeKm ?? 0) : step.km;
  const v = { ...base, speedKmh: step.playing ? 80 : 0, tripMinutes: Math.round((km / 80) * 60), batteryPct: step.charged ? 80 : Math.max(base.batteryPct - km * pctPerKm(base), 0) };
  const remainingKm = Math.max(plan.routeKm - km, 0);
  const energy = estimate({ ...plan, routeKm: remainingKm }, v);
  const ranked = rank(DEMO_STOPS, { plan, traveledKm: km, needsCharge: energy.needsCharge, tripMinutes: v.tripMinutes, feasibility: feasibilityFor(v, energy.waitPct, plan.minReservePct) });
  const waypoints = step.waypoint && chosen ? [{ name: chosen.name, routeKm: chosen.routeKm }] : [];
  const clock = `${String(8 + Math.floor(v.tripMinutes / 60)).padStart(2, "0")}:${String(v.tripMinutes % 60).padStart(2, "0")}`;
  const noop = () => {};
  const energyAfter = chosen ? estimate({ ...plan, routeKm: plan.routeKm - chosen.routeKm }, { ...v, batteryPct: 80 }) : energy;

  return (
    <div className="pointer-events-none select-none" aria-label="시연 자동 재생 미리보기">
      <PleosShell orientation="portrait" theme="dark" speedKmh={v.speedKmh} gear={step.playing ? "D" : "P"} batteryPct={Math.round(v.batteryPct)} rangeKm={Math.round(v.batteryPct / pctPerKm(v))} outsideTempC={v.outsideTempC} clock={clock}
        neighbor={<NavMock traveledKm={km} routeKm={plan.routeKm} waypoints={waypoints} destination={plan.destinationName} speedKmh={v.speedKmh} clock={clock} />}>
        {step.screen === 1 && <StatusScreen plan={plan} v={v} energy={energy} phase={phaseOf(plan, v)} orientation="portrait" onGo={noop} />}
        {step.screen === 3 && <EnergyScreen v={v} energy={energy} orientation="portrait" onGo={noop} />}
        {step.screen === 4 && <CandidatesScreen ranked={ranked} needsCharge={energy.needsCharge} onAddStop={noop} addingId={null} waypoints={waypoints.length} slots={2} orientation="portrait" breakdownOf={() => []} excluded={excluded(DEMO_STOPS, { plan, traveledKm: km, needsCharge: energy.needsCharge, tripMinutes: v.tripMinutes, feasibility: feasibilityFor(v, energy.waitPct, plan.minReservePct) })} selectedId={step.waypoint && chosen ? chosen.id : null} />}
        {step.screen === 5 && <DrivingScreen nextStop={chosen} kmToNext={chosen ? Math.max(Math.round(chosen.routeKm - km), 0) : null} arrivalPct={energy.arrivalPct} voice={chosen && chosen.routeKm - km <= 50 ? `${chosen.name} 가 ${Math.round(chosen.routeKm - km)}km 앞입니다.` : null} />}
        {step.screen === 6 && <ArrivedScreen log={[]} remainingKm={Math.round(remainingKm)} energy={energyAfter} orientation="portrait" onResume={noop} current={chosen} chargeMin={chosen?.chargerKw ? chargeMinutes(v.batteryPct, 80, v.batteryKwh, chosen.chargerKw) : null} />}
        <Toast toast={step.toast ? { id: i, text: `${chosen?.name ?? ""} ${step.toast}`, tone: "positive" } : null} />
      </PleosShell>
    </div>
  );
}
