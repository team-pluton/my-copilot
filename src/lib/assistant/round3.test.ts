import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VEHICLE } from "../core/mock";
import { planFor, PROFILE_PRESETS } from "./profile";
import { energyView } from "./energy-view";
import { energyFor, type WaitMode } from "./wait";
import { planViaStop } from "./options";
import { prepareStatus, type PrepareInput } from "./prepare";
import { driveLine } from "./drive";

/**
 * 3차 개선(docs/my-copilot/CHECKLIST-3.md) — core/ 의 Round3Test.kt 와 같은 입력·같은 기대값 (거울).
 */

// ── P0-3 "충분"의 기준 ─────────────────────────────
const family = planFor(PROFILE_PRESETS.FAMILY);
const work = planFor(PROFILE_PRESETS.WORK);

test("비관 추정에서 모자라면 '예상돼요'(충분)라고 말하지 않는다 — 배터리 5~100% · 편도/왕복 · 대기 유형 전부", () => {
  let checked = 0;
  for (const [plan, roundTrip] of [[family, false], [work, true], [{ ...work, waitMinutesAfterArrival: 300 }, true]] as const) {
    for (const mode of ["IN_CAR", "AWAY"] as WaitMode[]) {
      for (let b = 5; b <= 100; b += 5) {
        const e = energyFor(plan, { ...DEFAULT_VEHICLE, batteryPct: b }, mode);
        const v = energyView(e, b, null, { roundTrip, minReservePct: plan.minReservePct });
        const pessimisticShort = e.shortfallRange[1] > 0;
        assert.equal(v.headline.endsWith("예상돼요"), !pessimisticShort, `${plan.destinationName} ${mode} ${b}% → ${v.headline}`);
        if (pessimisticShort) assert.notEqual(v.status, "OK");
        checked++;
      }
    }
  }
  assert.equal(checked, 120);
});

test("충분의 문맥 — 편도 도착 · 왕복 · 고른 경유지 포함 · 최소 잔량 기준을 보조 줄에", () => {
  const solo = planFor(PROFILE_PRESETS.SOLO);
  const v1 = energyView(energyFor(solo, DEFAULT_VEHICLE, "IN_CAR"), 68, null, { minReservePct: 15 });
  assert.deepEqual([v1.headline, v1.detail], ["충전 없이 도착할 수 있을 것으로 예상돼요", "도착 예상 잔량 약 62% · 최소 잔량 15% 남기고 비관 추정까지 (추정)"]);
  const v2 = energyView(energyFor(work, DEFAULT_VEHICLE, "AWAY"), 68, null, { roundTrip: true, minReservePct: 20 });
  assert.deepEqual([v2.headline, v2.detail], ["충전 없이 왕복할 수 있을 것으로 예상돼요", "귀가 후 예상 잔량 약 50% · 최소 잔량 20% 남기고 비관 추정까지 (추정)"]);
  const via = planViaStop(family, DEFAULT_VEHICLE, "IN_CAR", 250);
  assert.equal(energyView(via.energy, 68, null, { viaWaypoint: true }).headline, "선택한 충전 경유지를 포함하면 계획을 마칠 수 있을 것으로 예상돼요");
  assert.equal(energyView(null, null, null).headline, "최신 차량 정보가 없어 계획을 확인할 수 없어요");
});

test("평균은 되고 비관은 모자라면 '여유가 크지 않아요', 평균도 모자라면 '충전 없이는 모자랄 수 있어요', 범위 전부 모자라면 '충전 계획이 필요해요'", () => {
  const seen = new Map<string, number>();
  for (let b = 20; b <= 60; b += 1) {
    const e = energyFor({ ...work, waitMinutesAfterArrival: 210 }, { ...DEFAULT_VEHICLE, batteryPct: b }, "IN_CAR");
    const v = energyView(e, b, null, { roundTrip: true });
    if (!seen.has(v.headline)) seen.set(v.headline, b);
  }
  assert.deepEqual([...seen.entries()], [
    ["충전 계획이 필요해요", 20], ["충전 없이는 모자랄 수 있어요", 45], ["현재 조건에서는 충분할 수 있지만 여유가 크지 않아요", 47], ["충전 없이 왕복할 수 있을 것으로 예상돼요", 49],
  ]);
});

// ── P0-4 건너뜀은 완료가 아니다 ───────────────────────
const base: PrepareInput = {
  climate: "DIFFERENT", currentC: 25, targetC: 23, climateDecision: null, climateBlocked: null,
  packingTotal: 3, packedCount: 0, energy: "OK", waypointChosen: false, skipped: [],
};

test("출발 준비 — 건너뛴 것은 남은 일에서 빠지지만 확인 완료로 세지 않는다", () => {
  const s = prepareStatus({ ...base, packedCount: 3, skipped: ["CLIMATE"] });
  assert.deepEqual(s.items.map((x) => x.state), ["SKIPPED", "DONE", "DONE"]);
  assert.deepEqual([s.done, s.needs, s.skipped, s.ready], [2, 0, 1, true]);
  assert.equal(s.summary, "남은 확인은 없습니다 · 공조는 이번에는 건너뛰었습니다");
});

test("출발 준비 — 준비물을 다 챙겼으면 건너뛰기를 눌렀어도 확인 완료 · 사용자가 정한 '그대로 두기'는 확인 완료", () => {
  assert.equal(prepareStatus({ ...base, packedCount: 3, skipped: ["PACKING"] }).items[1].state, "DONE");
  assert.equal(prepareStatus({ ...base, climateDecision: { decision: "KEPT", valueC: 25 } }).items[0].state, "DONE");
  assert.deepEqual(prepareStatus({ ...base, energy: "SHORT", skipped: ["ENERGY"] }).items[2], { key: "ENERGY", state: "SKIPPED", line: "이번에는 건너뛰었습니다 · 충전 계획 없이 출발" });
});

// ── P0-2 주행 중 세 단계 ───────────────────────────
const ok = energyView(energyFor(work, DEFAULT_VEHICLE, "AWAY"), 68, null, { roundTrip: true });
const short = energyView(energyFor(family, DEFAULT_VEHICLE, "IN_CAR"), 68, null);

test("주행 중 — 문제 없으면 조용히, 확인할 것은 짧게, 모르면 지난 판단을 되풀이하지 않는다", () => {
  assert.deepEqual(driveLine(ok, true, null, "귀가"), { level: "QUIET", title: "귀가까지 에너지 문제 없음 · 추정", sub: null, stop: null });
  assert.deepEqual(driveLine(ok, true, { name: "김천휴게소", km: 246 }, "도착").title, "다음 충전 경유지 · 김천휴게소");
  assert.deepEqual(driveLine(short, true, null, "도착"), { level: "ATTENTION", title: "충전 계획이 필요해요", sub: "정차한 뒤 선택지를 볼 수 있어요", stop: null });
  assert.equal(driveLine(ok, false, null, "도착").level, "UNKNOWN");
  assert.equal(driveLine(ok, false, null, "도착").title, "차량 정보 확인 중");
});
