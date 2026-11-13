import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VEHICLE } from "../core/mock";
import { planFor, PROFILE_PRESETS } from "./profile";
import { prepareStatus, type PrepareInput } from "./prepare";
import { energyFor, statusOf } from "./wait";
import { energyView } from "./energy-view";
import { energyOptions, maxWaitWithoutCharge, waitLimitLine } from "./options";
import { freshnessOf, sourceLine } from "./freshness";
import { INITIAL_JOURNEY, type JourneyState, type Motion } from "./journey";

/**
 * 2차 개선(docs/my-copilot/CHECKLIST-2.md) — core/ 의 ExperienceTest.kt 와 **같은 입력·같은 기대값**이다 (거울).
 */

// ── P0-2 출발 준비 ───────────────────────────────
const base: PrepareInput = {
  climate: "DIFFERENT", currentC: 25, targetC: 23, climateDecision: null, climateBlocked: null,
  packingTotal: 3, packedCount: 0, energy: "SHORT", waypointChosen: false, skipped: [],
};

test("출발 준비 — 끝난 것과 남은 것을 한 문장으로: 공조·준비물은 끝났고 충전 계획 하나만 남음", () => {
  const s = prepareStatus({ ...base, climateDecision: { decision: "APPLIED", valueC: 23 }, packedCount: 3 });
  assert.equal(s.summary, "출발 준비에서 두 가지는 확인됐고, 충전 계획 한 가지만 남았습니다");
  assert.deepEqual([s.done, s.needs, s.unsupported, s.ready], [2, 1, 0, false]);
});

test("출발 준비 — 다 끝났으면 완료 버튼을 요구하지 않는다(ready)", () => {
  const s = prepareStatus({ ...base, climate: "SAME", packedCount: 3, energy: "OK" });
  assert.equal(s.ready, true);
  assert.equal(s.summary, "출발 준비가 끝났습니다 · 바로 출발하셔도 됩니다");
});

test("출발 준비 — 권한이 없어 바꿀 수 없는 공조는 남은 일이 아니라 '직접 확인'이다", () => {
  const s = prepareStatus({ ...base, climateBlocked: "공조 제어 권한이 없습니다", packedCount: 3, energy: "OK" });
  assert.deepEqual([s.items[0].state, s.needs, s.unsupported, s.ready], ["UNSUPPORTED", 0, 1, true]);
  assert.equal(s.summary, "확인할 수 있는 준비는 끝났습니다 · 공조는 차량에서 직접 확인해 주세요");
});

test("출발 준비 — 차량 값을 모르면 에너지는 판단하지 않고 '직접 확인'으로 둔다", () => {
  const s = prepareStatus({ ...base, climate: "SKIP", packingTotal: 0, energy: "UNKNOWN" });
  assert.deepEqual(s.items.map((x) => x.state), ["NOT_APPLICABLE", "NOT_APPLICABLE", "UNSUPPORTED"]);
  assert.equal(s.ready, true);
  assert.equal(s.summary, "확인할 수 있는 준비는 끝났습니다 · 충전 계획은 차량에서 직접 확인해 주세요");
});

test("출발 준비 — 아무것도 안 했으면 남은 것만 말한다 · 경유지를 정했으면 에너지는 끝", () => {
  assert.equal(prepareStatus(base).summary, "출발 전에 공조·준비물·충전 계획 세 가지를 확인해 주세요");
  // 경유지를 골랐다는 사실만으로는 끝이 아니다 — 그 경유지를 포함한 판정이 충분이어야 확인 완료
  assert.equal(prepareStatus({ ...base, waypointChosen: true, energy: "OK" }).items[2].state, "DONE");
  assert.deepEqual(prepareStatus({ ...base, waypointChosen: true }).items[2], { key: "ENERGY", state: "NEEDS_CHECK", line: "선택한 경유지만으로는 여유가 크지 않아요" });
  assert.equal(prepareStatus({ ...base, climate: "SKIP", packingTotal: 0, energy: "OK" }).summary, "출발 준비가 끝났습니다 · 바로 출발하셔도 됩니다");
});

// ── P0-3 대기 유형 · 상태 분리 ─────────────────────
const work = planFor(PROFILE_PRESETS.WORK);
const low = { ...DEFAULT_VEHICLE, batteryPct: 45 };
const long = { ...work, waitMinutesAfterArrival: 210 };

test("대기 유형 — 미팅이 길어져도 차를 두고 다녀오면 에너지는 그대로, 차 안에서 기다리면 주의", () => {
  assert.equal(energyView(energyFor(long, low, "AWAY"), 45, null).status, "OK");
  assert.equal(energyView(energyFor(long, low, "IN_CAR"), 45, null).status, "CAUTION");
  assert.equal(energyView(energyFor(long, low, "AWAY"), 45, null).detail, energyView(energyFor(work, low, "AWAY"), 45, null).detail);
  assert.ok(energyFor(long, low, "AWAY").assumptions.includes("도착 후 대기 210분 · 차를 두고 밖에서 → 주차 중 공조 미사용 가정 (대기 중 다른 소비는 계산에 없음)"));
});

test("상태 분리 — 차는 '주차', 사람은 '방문 중' 또는 '차 안에서 대기'", () => {
  const waiting: JourneyState = { ...INITIAL_JOURNEY, phase: "WAITING", atDestination: true, legs: 2 };
  const parked: Motion = { kind: "PARKED", confidence: "CONFIRMED" };
  assert.deepEqual([statusOf(waiting, parked, "AWAY").vehicleLabel, statusOf(waiting, parked, "AWAY").tripLabel], ["주차", "방문 중"]);
  assert.equal(statusOf(waiting, parked, "IN_CAR").tripLabel, "차 안에서 대기");
  assert.equal(statusOf({ ...waiting, phase: "PARKED", atDestination: false }, parked, "AWAY").tripLabel, "중간 정차");
  assert.equal(statusOf({ ...waiting, phase: "FINISHING", atDestination: false }, parked, "AWAY").tripLabel, "잠시 내림");
  assert.equal(statusOf({ ...waiting, phase: "DRIVING", leg: 1 }, { kind: "MOVING", confidence: "CONFIRMED" }, "AWAY").tripLabel, "귀가 중");
});

// ── P0-4 판단 뒤 선택지 ────────────────────────────
test("선택지 — 충분이면 선택지를 내지 않는다", () => {
  assert.deepEqual(energyOptions({ plan: work, v: low, waitMode: "IN_CAR", charge: null }), []);
});

test("선택지 — 업무 대기 210분(차 안): 그대로는 주의, 차를 두고 다녀오면 충분, 30분 줄여도 주의", () => {
  const o = energyOptions({ plan: long, v: low, waitMode: "IN_CAR", charge: null });
  assert.deepEqual(o.map((x) => [x.key, x.status, x.improves]), [["AS_IS", "CAUTION", false], ["WAIT_AWAY", "OK", true], ["WAIT_SHORTER", "CAUTION", false]]);
  assert.deepEqual(o.map((x) => x.action), [null, "SET_WAIT_AWAY", null]);
  assert.equal(o[2].note, "일정은 앱이 바꾸지 않습니다");
});

test("선택지 — 가족 서울→부산: 김천에서 80% 충전하면 충분, 대기만 바꿔서는 부족", () => {
  const o = energyOptions({ plan: planFor(PROFILE_PRESETS.FAMILY), v: DEFAULT_VEHICLE, waitMode: "IN_CAR", charge: { name: "김천휴게소", kmFromHere: 250 } });
  assert.deepEqual(o.map((x) => [x.key, x.status]), [["AS_IS", "SHORT"], ["WAIT_AWAY", "SHORT"], ["WAIT_SHORTER", "SHORT"], ["CHARGE_AT", "OK"]]);
  assert.equal(o[3].label, "김천휴게소에서 80%까지 충전하면");
  assert.equal(o[3].detail, "도착 예상 잔량 약 43% (추정)");
});

test("대기 한계 — 차 안 대기는 약 120분까지 · 차 밖 대기는 시간과 무관 · 대기 없이도 모자라면 말하지 않는다", () => {
  assert.equal(maxWaitWithoutCharge(long, low, "IN_CAR"), 120);
  assert.equal(waitLimitLine(120, 210), "차 안 대기가 약 120분을 넘으면 충전이 필요해집니다 (추정 범위 기준) · 지금 계획 210분");
  assert.equal(waitLimitLine(120, 90), "차 안 대기는 앞으로 약 120분까지 충전 없이 됩니다 (추정 범위 기준)");
  assert.equal(maxWaitWithoutCharge(long, low, "AWAY"), null);
  assert.equal(maxWaitWithoutCharge(planFor(PROFILE_PRESETS.FAMILY), DEFAULT_VEHICLE, "IN_CAR"), -1);
  assert.equal(waitLimitLine(-1, 40), null);
});

// ── P1-2 신선도 ──────────────────────────────────
test("신선도 — 기어는 끊기는 순간 모름, 배터리는 10분까지 '끊기기 전 값'으로 보여 주되 판단에는 안 씀, 프로필은 기한 없음", () => {
  assert.equal(freshnessOf("GEAR", 100, 100, false), "UNKNOWN");
  assert.equal(freshnessOf("SOC", 100, 100, true), "FRESH");
  assert.equal(freshnessOf("SOC", 100, 110, false), "STALE");
  assert.equal(freshnessOf("SOC", 100, 111, false), "UNKNOWN");
  assert.equal(freshnessOf("SOC", null, 0, true), "UNKNOWN");
  assert.equal(freshnessOf("PROFILE", null, 999, false), "FRESH");
  assert.equal(sourceLine("FRESH", "11:08", "DEMO"), "시연 데이터 · 11:08");
  assert.equal(sourceLine("STALE", "11:08", "VEHICLE"), "끊기기 전 값 · 11:08 · 판단에 쓰지 않음");
  assert.equal(sourceLine("UNKNOWN", "11:08", "VEHICLE"), null);
});
