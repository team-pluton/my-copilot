import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VEHICLE } from "../core/mock";
import { verdictOf } from "../core/energy";
import { checkAction } from "./gate";
import { INITIAL_JOURNEY, type JourneyState } from "./journey";
import { newMemory } from "./memory";
import { MISSION_LABEL, missionHeadline, missionOf, missionPhaseOf, missionReturnLine, restorable, type MissionInput, type MissionSnapshot } from "./mission";
import { plan as planSuggestions, type PlannerInput } from "./planner";
import { defaultWaitModeOf, finishItemsFor, planFor, PROFILE_PRESETS } from "./profile";
import { legsOf } from "./trip";
import { energyFor } from "./wait";

/**
 * V5 Journey Mission (2026-11-02) — core/ 의 MissionTest.kt 와 **같은 입력·같은 기대값**이다 (거울).
 * 지시서 4절 정책: 중간 목적지 도착 ≠ 완료 · 귀가 계획 보존 · 대기 시간은 입력·저장값만 · 확인된 것만 복원 · 내비 목적지는 앱이 바꾸지 않음.
 */
const j = (p: Partial<JourneyState>): JourneyState => ({ ...INITIAL_JOURNEY, ...p });
const pickup = planFor(PROFILE_PRESETS.PICKUP);
const base: MissionInput = {
  mode: "PICKUP", tripId: 3, driver: "dad", plan: pickup, journey: j({ phase: "PREPARING", legs: 2 }), waitMode: "IN_CAR",
  nextLegReady: false, waitSource: "SAVED", endedEarly: false, energyAvailable: true, clock: "08:10", createdAt: "08:00", waypointIds: [],
};

test("Mission 단계 — 여정 단계·구간·대기 유형·귀가 준비에서 계산한다 (중간 정차는 이동 중)", () => {
  assert.equal(missionPhaseOf(j({ phase: "NOT_STARTED" }), "IN_CAR", false), "MISSION_SELECTED");
  assert.equal(missionPhaseOf(j({ phase: "PREPARING" }), "IN_CAR", false), "PREPARE");
  assert.equal(missionPhaseOf(j({ phase: "DRIVING", legs: 2 }), "IN_CAR", false), "EN_ROUTE");
  assert.equal(missionPhaseOf(j({ phase: "PARKED", atDestination: false, legs: 2 }), "IN_CAR", false), "EN_ROUTE");
  assert.equal(missionPhaseOf(j({ phase: "PARKED", atDestination: true, legs: 2 }), "IN_CAR", false), "ARRIVED_AT_STOP");
  assert.equal(missionPhaseOf(j({ phase: "WAITING", atDestination: true, legs: 2 }), "IN_CAR", false), "WAITING");
  assert.equal(missionPhaseOf(j({ phase: "WAITING", atDestination: true, legs: 2 }), "AWAY", false), "VISITING");
  assert.equal(missionPhaseOf(j({ phase: "WAITING", atDestination: true, legs: 2 }), "AWAY", true), "NEXT_LEG_READY");
  assert.equal(missionPhaseOf(j({ phase: "DRIVING", leg: 1, legs: 2 }), "IN_CAR", false), "RETURNING");
  assert.equal(missionPhaseOf(j({ phase: "COMPLETED", leg: 1, legs: 2 }), "IN_CAR", false), "COMPLETED");
});

test("Mission — 픽업 후 귀가: 복귀 목적지는 저장된 왕복 계획에서, 중간 목적지 도착은 완료가 아니다", () => {
  const m = missionOf(base)!;
  assert.deepEqual([m.missionId, m.missionType, m.occupancy, m.tripPurpose, m.returnDestination, m.remainingLegs, m.status], ["PICKUP#3", "PICKUP_RETURN", "FAMILY", "PICKUP", "집 (귀가)", 2, "ACTIVE"]);
  assert.deepEqual(m.wait, { minutes: 20, source: "SAVED" });
  assert.equal(missionHeadline(m), "픽업 후 귀가 · 출발 준비");
  assert.equal(missionReturnLine(m), "귀가 집 (귀가) 일정 기억 중 · 방문 뒤에도 끝나지 않음");
  const arrived = missionOf({ ...base, journey: j({ phase: "PARKED", atDestination: true, legs: 2 }) })!;
  assert.deepEqual([arrived.phase, arrived.finalStop, arrived.status, arrived.remainingLegs], ["ARRIVED_AT_STOP", false, "ACTIVE", 2]);
  const ready = missionOf({ ...base, journey: j({ phase: "WAITING", atDestination: true, legs: 2 }), nextLegReady: true })!;
  assert.equal(missionReturnLine(ready), "귀가 일정은 기억하고 있어요 · 이동을 시작하려면 내비게이션에서 집 (귀가)를 목적지로 설정해 주세요");
  const home = missionOf({ ...base, journey: j({ phase: "PARKED", atDestination: true, leg: 1, legs: 2 }) })!;
  assert.deepEqual([home.phase, home.finalStop, home.remainingLegs, missionReturnLine(home)], ["ARRIVED_AT_STOP", true, 1, null]);
});

test("Mission — 귀가를 남긴 채 끝내면 중단(CANCELLED), 마지막 구간까지 마치면 완료 · 프로필 없이는 유형 없음 · 고르기 전은 null", () => {
  assert.equal(missionOf({ ...base, journey: j({ phase: "COMPLETED", legs: 2 }), endedEarly: true })!.status, "CANCELLED");
  assert.equal(missionOf({ ...base, journey: j({ phase: "COMPLETED", leg: 1, legs: 2 }) })!.status, "COMPLETED");
  const guest = missionOf({ ...base, mode: "GUEST", plan: planFor(PROFILE_PRESETS.GUEST), waitSource: "NONE" })!;
  assert.deepEqual([guest.missionType, guest.returnDestination, guest.wait.source], [null, null, "NONE"]);
  assert.equal(missionOf({ ...base, tripId: 0 }), null);
  assert.equal(MISSION_LABEL.WORK_VISIT_RETURN, "업무 방문 후 복귀");
});

test("픽업 프리셋 — 왕복 2구간 · 차 안 대기 20분 · 아이 조건 · 기본 차량이면 충전 없이 충분", () => {
  assert.deepEqual([pickup.mode, legsOf(pickup), pickup.routeKm, pickup.returnKm, pickup.waitMinutesAfterArrival, pickup.passengers], ["WAIT", 2, 12, 12, 20, ["CHILD"]]);
  assert.equal(defaultWaitModeOf("PICKUP"), "IN_CAR");
  assert.deepEqual(finishItemsFor("PICKUP", ["CHILD"]), ["휴대전화", "지갑·소지품", "차량 내 준비물", "다음 일정 확인", "아이 가방"]);
  assert.equal(verdictOf(energyFor(pickup, DEFAULT_VEHICLE, "IN_CAR")), "OK");
});

const plannerBase: PlannerInput = {
  journey: j({ phase: "WAITING", atDestination: true, legs: 2 }), restricted: false, now: 0, energy: null, breakPhase: null, climate: null,
  checklistPending: 0, proactive: true, history: {}, mission: { nextLegReady: false, returnDestination: "집 (귀가)" },
  context: { profileName: "아이 픽업 후 귀가", batteryPct: 60, waitMinutes: 20, minReservePct: 15, tripMinutes: 10, breakIntervalMinutes: 90, remainingKm: 0 },
};

test("귀가 제안 — 대기 중에 한 번 묻는다(결정 등급) · 준비됐거나 복귀 목적지가 없으면 묻지 않는다", () => {
  const r = planSuggestions(plannerBase);
  assert.equal(r.top?.type, "NEXT_LEG");
  assert.deepEqual([r.top?.tier, r.top?.action, r.top?.confirmationRequired, r.top?.allowedWhileDriving], ["DECISION", "PREPARE_NEXT_LEG", true, false]);
  assert.equal(r.top?.title, "방문을 마치셨나요?");
  assert.equal(r.top?.explanation, "귀가 일정이 남아 있어요.\n다음 이동: 집으로\n내비게이션 목적지는 직접 설정해야 합니다.");
  assert.equal(planSuggestions({ ...plannerBase, mission: { nextLegReady: true, returnDestination: "집 (귀가)" } }).top, null);
  assert.equal(planSuggestions({ ...plannerBase, mission: { nextLegReady: false, returnDestination: null } }).top, null);
  // 도착해 주차한 순간(하차 전)에는 묻지 않는다 — 먼저 내린다
  assert.equal(planSuggestions({ ...plannerBase, journey: j({ phase: "PARKED", atDestination: true, legs: 2 }) }).top, null);
});

test("귀가 제안 — 에너지 '부족'(위험)이 있으면 그것이 먼저, 결정은 둘째 · '주의'보다는 결정이 먼저", () => {
  const short = planSuggestions({ ...plannerBase, energy: { verdict: "SHORT", message: "집까지 세면 약 5%p 모자람" } });
  assert.deepEqual(short.top?.type, "ENERGY_DECISION");
  assert.equal(short.companions[0]?.type, "NEXT_LEG");
  const tight = planSuggestions({ ...plannerBase, energy: { verdict: "TIGHT", message: "여유가 크지 않음" } });
  assert.deepEqual([tight.top?.type, tight.companions[0]?.type], ["NEXT_LEG", "ENERGY_DECISION"]);
});

test("귀가 준비 액션 — 주차한 채 확인했을 때만 · 주행 중·확인 전은 막힌다 · 차량 지원·권한은 보지 않는다", () => {
  const parked = { uxRestricted: false, motion: { kind: "PARKED" as const, confidence: "CONFIRMED" as const }, capabilities: {}, permissions: {}, inFlight: [] };
  assert.deepEqual(checkAction("PREPARE_NEXT_LEG", parked, true), { allowed: true });
  assert.equal((checkAction("PREPARE_NEXT_LEG", parked, false) as { block: string }).block, "NEEDS_CONFIRMATION");
  assert.equal((checkAction("PREPARE_NEXT_LEG", { ...parked, motion: { kind: "MOVING", confidence: "CONFIRMED" } }, true) as { block: string }).block, "DRIVING_BLOCKED");
});

test("복원 — 진행 중(출발 준비 이후 · 완료 전)인 스냅샷만 되살린다", () => {
  const snap: MissionSnapshot = {
    version: 1, mode: "PICKUP", driver: "dad", chosen: true, plan: pickup, journey: j({ phase: "WAITING", atDestination: true, legs: 2 }), traveledKm: 12, waitedMin: 5, simMin: 20,
    waitMode: "IN_CAR", waitSource: "SAVED", nextLegReady: false, endedEarly: false, missionStartedAt: "08:00", memory: newMemory(3, "PICKUP"), waypointIds: [], chargedAt: [],
    batteryPct: 60, tripMinutes: 9, savedAt: "08:20",
  };
  assert.equal(restorable(snap), true);
  assert.equal(restorable({ ...snap, journey: j({ phase: "COMPLETED" }) }), false);
  assert.equal(restorable({ ...snap, journey: j({ phase: "NOT_STARTED" }) }), false);
  assert.equal(restorable({ ...snap, chosen: false }), false);
  assert.equal(restorable(null), false);
});
