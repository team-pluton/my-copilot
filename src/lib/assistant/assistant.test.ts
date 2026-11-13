import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PLAN, DEFAULT_VEHICLE } from "../core/mock";
import { checkAction, settleControl, type GateContext } from "./gate";
import { INITIAL_JOURNEY, isRestricted, motionOf, nextJourney, restoreJourney, type JourneySignals, type JourneyState } from "./journey";
import { canFinish, climateGapOf, finishItemsFor, planFor, PROFILE_PRESETS, TRIP_PRESETS } from "./profile";
import { energySignalOf, newTrip, plan, recordAccepted, recordDismissed, type PlannerInput } from "./planner";

/**
 * MY CO-PILOT 상황 판단 — core/ 의 AssistantTest.kt 와 **같은 입력·같은 기대값**이다 (거울).
 * 테스트 이름은 규칙 문장이다. 실행: `npm test`.
 */
const sig = (o: Partial<JourneySignals> = {}): JourneySignals => ({ gear: "DRIVE", parkingBrake: false, speedKmh: 0, uxRestricted: null, remainingKm: 50, ...o });
const at = (phase: JourneyState["phase"], atDestination = false): JourneyState => ({ phase, atDestination, confidence: "CONFIRMED", leg: 0, legs: 1 });
const moving = (o: Partial<JourneySignals> = {}) => sig({ speedKmh: 80, uxRestricted: true, ...o });
const parked = (o: Partial<JourneySignals> = {}) => sig({ gear: "PARK", uxRestricted: false, ...o });

// ── 여정 단계 ───────────────────────────────────────────

test("속도 0 만으로는 주차라고 하지 않는다 — P 단은 확정, 주차 브레이크+정지는 추정", () => {
  assert.deepEqual(motionOf(sig()), { kind: "STOPPED", confidence: "CONFIRMED" });
  assert.deepEqual(motionOf(sig({ gear: "PARK" })), { kind: "PARKED", confidence: "CONFIRMED" });
  assert.deepEqual(motionOf(sig({ gear: "UNKNOWN", parkingBrake: true })), { kind: "PARKED", confidence: "INFERRED" });
  assert.deepEqual(motionOf(sig({ gear: "UNKNOWN", speedKmh: null })), { kind: "UNKNOWN", confidence: "UNKNOWN" });
});

test("출발 준비 중에 차가 움직이면 주행이 된다", () => {
  const s = nextJourney(INITIAL_JOURNEY, parked(), "START_PREPARE");
  assert.equal(s.phase, "PREPARING");
  assert.equal(nextJourney(s, moving()).phase, "DRIVING");
});

test("신호대기(정지)는 단계를 바꾸지 않는다", () => {
  assert.equal(nextJourney(at("DRIVING"), sig()).phase, "DRIVING");
});

test("목적지 3km 안이면 곧 도착 — 4km 로 멀어져도 유지, 5km 를 넘어야 주행으로 돌아간다", () => {
  const a = nextJourney(at("DRIVING"), moving({ remainingKm: 2.5 }));
  assert.equal(a.phase, "APPROACHING");
  assert.equal(nextJourney(a, moving({ remainingKm: 4 })).phase, "APPROACHING");
  assert.equal(nextJourney(a, moving({ remainingKm: 6 })).phase, "DRIVING");
});

test("목적지가 아닌 곳의 주차는 중간 정차, 0.5km 안의 주차는 도착이다", () => {
  assert.deepEqual(nextJourney(at("DRIVING"), parked({ remainingKm: 120 })), at("PARKED", false));
  assert.deepEqual(nextJourney(at("APPROACHING"), parked({ remainingKm: 0.3 })), at("PARKED", true));
});

test("도착해 주차해도 하차 화면으로 저절로 넘어가지 않는다 — 사용자가 시작해야 한다", () => {
  const p = at("PARKED", true);
  assert.equal(nextJourney(p, parked({ remainingKm: 0.1 })).phase, "PARKED");
  assert.equal(nextJourney(p, parked(), "START_FINISH").phase, "FINISHING");
});

test("하차하지 않고 다시 출발하면 주행으로 돌아간다", () => {
  assert.equal(nextJourney(at("FINISHING", true), moving()).phase, "DRIVING");
  assert.equal(nextJourney(at("PARKED"), moving()).phase, "DRIVING");
});

test("여정은 사용자가 끝내거나 취소할 때만 완료된다", () => {
  assert.equal(nextJourney(at("PREPARING"), parked(), "CANCEL_TRIP").phase, "COMPLETED");
  assert.equal(nextJourney(at("FINISHING", true), parked(), "FINISH_DONE").phase, "COMPLETED");
  assert.equal(nextJourney(at("DRIVING"), moving(), "FINISH_DONE").phase, "DRIVING");
});

test("중간 정차에서 하차 확인을 마치면 주차로 돌아간다 — 여정을 끝내지 않는다", () => {
  const j = nextJourney(nextJourney(at("PARKED"), parked(), "START_FINISH"), parked(), "FINISH_DONE");
  assert.equal(j.phase, "PARKED");
  assert.equal(j.atDestination, false);
});

test("움직임을 모르면 단계를 바꾸지 않는다", () => {
  assert.equal(nextJourney(at("DRIVING"), sig({ gear: "UNKNOWN", speedKmh: null })).phase, "DRIVING");
});

test("앱을 다시 켜면 저장한 단계보다 지금 차 상태를 믿는다", () => {
  assert.equal(restoreJourney(at("DRIVING"), parked()).phase, "PARKED");
  assert.equal(restoreJourney(at("FINISHING", true), moving()).phase, "DRIVING");
});

test("주행 제한을 모르면 주차가 아닌 한 제한한다", () => {
  assert.equal(isRestricted(sig({ uxRestricted: null })), true);
  assert.equal(isRestricted(parked({ uxRestricted: null })), false);
  assert.equal(isRestricted(sig({ uxRestricted: false })), false);
});

// ── Safety Gate ─────────────────────────────────────────

const ready: GateContext = {
  uxRestricted: false,
  motion: { kind: "PARKED", confidence: "CONFIRMED" },
  capabilities: { HVAC_TEMPERATURE: true, NAVI_WAYPOINT: true, SEAT_POSITION: true },
  permissions: { CONTROL_CAR_CLIMATE: true, NAVI_ROUTE_SEARCH: true, CONTROL_CAR_SEATS: true },
  inFlight: [],
};
const driving: GateContext = { ...ready, uxRestricted: true, motion: { kind: "MOVING", confidence: "CONFIRMED" } };
const blockOf = (r: ReturnType<typeof checkAction>) => (r.allowed ? "ALLOWED" : r.block);

test("주차 중 · 지원 · 권한 · 확인이 모두 있어야 공조를 바꾼다", () => {
  assert.equal(blockOf(checkAction("SET_CLIMATE", ready, true)), "ALLOWED");
});

test("주행 중에는 공조 변경을 막는다 — 주행 제한이 풀려도 바퀴가 구르면 막는다", () => {
  assert.equal(blockOf(checkAction("SET_CLIMATE", driving, true)), "DRIVING_BLOCKED");
  assert.equal(blockOf(checkAction("SET_CLIMATE", { ...driving, uxRestricted: false }, true)), "DRIVING_BLOCKED");
});

test("차량 지원·권한을 모르면 없는 것으로 본다 (fail closed)", () => {
  assert.equal(blockOf(checkAction("SET_CLIMATE", { ...ready, capabilities: { HVAC_TEMPERATURE: null } }, true)), "UNSUPPORTED");
  assert.equal(blockOf(checkAction("SET_CLIMATE", { ...ready, permissions: {} }, true)), "NO_PERMISSION");
  assert.equal(blockOf(checkAction("SET_CLIMATE", { ...ready, permissions: { CONTROL_CAR_CLIMATE: false } }, true)), "NO_PERMISSION");
});

test("확인하기 전에는 실행하지 않고, 확인한 뒤 차가 출발했으면 다시 막는다", () => {
  assert.equal(blockOf(checkAction("SET_CLIMATE", ready, false)), "NEEDS_CONFIRMATION");
  assert.equal(blockOf(checkAction("SET_CLIMATE", driving, true)), "DRIVING_BLOCKED");
});

test("좌석은 정차가 아니라 주차여야 바꾼다", () => {
  const stopped: GateContext = { ...ready, motion: { kind: "STOPPED", confidence: "CONFIRMED" } };
  assert.equal(blockOf(checkAction("SET_SEAT", stopped, true)), "NEEDS_PARKED");
});

test("같은 요청을 두 번 보내지 않는다", () => {
  assert.equal(blockOf(checkAction("SET_CLIMATE", { ...ready, inFlight: ["SET_CLIMATE"] }, true)), "DUPLICATE");
});

test("주행 중에도 충전 경유지 제안과 (확인한) 경유지 추가는 된다 · 프로필 불러오기는 정차 후로 미룬다", () => {
  assert.equal(blockOf(checkAction("SUGGEST_CHARGE_STOP", driving, false)), "ALLOWED");
  assert.equal(blockOf(checkAction("ADD_WAYPOINT", driving, true)), "ALLOWED");
  assert.equal(blockOf(checkAction("LOAD_PROFILE", driving, true)), "DRIVING_DEFERRED");
});

test("응답이 없거나 값이 다르면 성공이라고 하지 않는다 · 시연 성공은 시연이라고 적는다", () => {
  assert.equal(settleControl(23, { kind: "TIMEOUT" }, 25, "VEHICLE").status, "TIMEOUT");
  assert.equal(settleControl(23, { kind: "CALLBACK", value: 23 }, 25, "VEHICLE").status, "FAILED");
  assert.equal(settleControl(23, { kind: "ERROR", reason: "권한 없음" }, null, "VEHICLE").status, "FAILED");
  const mock = settleControl(23, { kind: "CALLBACK", value: 23 }, null, "MOCK");
  assert.deepEqual([mock.status, mock.source, mock.message], ["SUCCESS", "MOCK", "시연 값으로 23 적용"]);
});

// ── 제안 엔진 ───────────────────────────────────────────

const energy = energySignalOf(DEFAULT_PLAN, DEFAULT_VEHICLE);
const base: PlannerInput = {
  journey: at("PREPARING"), restricted: false, now: 1_000_000, energy, breakPhase: "CRUISING",
  climate: { currentC: 25, targetC: 23 }, checklistPending: 3, proactive: true, history: {},
  context: { profileName: "가족 이동", batteryPct: 68, waitMinutes: 40, minReservePct: 20, tripMinutes: 0, breakIntervalMinutes: 90, remainingKm: 400 },
};

test("거울 - 충전 제안의 근거는 차량 값 · 내 설정 · 추정 · 규칙으로 나뉜다", () => {
  assert.deepEqual(plan(base).top?.evidence, [
    { kind: "VEHICLE", text: "배터리 68%" },
    { kind: "USER", text: "도착 후 대기 40분 · 최소 잔량 20%" },
    { kind: "ESTIMATE", text: "도착 후 40분 대기까지 하려면 약 47% 가 모자랍니다 (추정 36~58%). 경로상 한 번 충전을 권합니다." },
    { kind: "RULE", text: "판정 '부족' — 추정 범위 전체가 최소 잔량에 못 미침" },
  ]);
});

test("거울 - 공조 제안의 근거는 저장 온도(내 설정)와 지금 설정(차량 값)을 따로 적는다", () => {
  assert.deepEqual(plan(base).companions[0].evidence, [
    { kind: "USER", text: "가족 이동 프로필 저장 온도 23°C" },
    { kind: "VEHICLE", text: "지금 공조 설정 25°C" },
    { kind: "RULE", text: "차이 2°C — 1°C 이상이면 제안" },
  ]);
});

test("거울 - 화면을 바꾸지 않아도 차량 상태가 바뀌면 제안이 바뀐다 (타임라인)", () => {
  let j = nextJourney(INITIAL_JOURNEY, parked(), "START_PREPARE");
  let h = {};
  const step = (s: JourneySignals, over: Partial<PlannerInput> = {}) => {
    j = nextJourney(j, s);
    const r = plan({ ...base, journey: j, restricted: isRestricted(s), history: h, ...over });
    return [j.phase, r.top?.type ?? null, r.companions.map((x) => x.type).join(","), r.inbox.map((x) => `${x.type}:${x.status}`).join(",")];
  };
  const seen = [step(parked())];
  h = recordAccepted(h, "ENERGY_DECISION"); // 사용자가 경유지를 넣었다
  seen.push(step(parked()));
  seen.push(step(parked(), { climate: { currentC: 23, targetC: 23 } })); // 공조 패널에서 직접 맞췄다
  seen.push(step(moving(), { climate: { currentC: 23, targetC: 23 }, breakPhase: "SUGGEST" })); // 출발 · 90분 주행
  seen.push(step(moving({ remainingKm: 2.5 }), { climate: { currentC: 23, targetC: 23 }, breakPhase: "SUGGEST" })); // 목적지 3km 앞
  seen.push(step(parked({ remainingKm: 0.2 }), { climate: { currentC: 23, targetC: 23 }, breakPhase: "SUGGEST" })); // 도착 주차
  assert.deepEqual(seen, [
    ["PREPARING", "ENERGY_DECISION", "PROFILE_PREPARATION", ""],
    ["PREPARING", "PROFILE_PREPARATION", "", ""],
    ["PREPARING", null, "", ""],
    ["DRIVING", "BREAK_PLANNING", "", ""],
    ["APPROACHING", null, "", "ARRIVAL_PREPARATION:DEFERRED"],
    ["PARKED", "CHECKLIST_REMINDER", "", ""],
  ]);
});

test("거울 - 기본 시나리오의 에너지 판단은 쉼표 DRIVE 엔진 문장 그대로다", () => {
  assert.equal(energy?.verdict, "SHORT");
  assert.equal(energy?.message, "도착 후 40분 대기까지 하려면 약 47% 가 모자랍니다 (추정 36~58%). 경로상 한 번 충전을 권합니다.");
});

test("거울 - 부족하면 충전 판단(위험)이 주요 제안이고, 공조 맞추기(90)는 함께 할 일로 옆에 나온다", () => {
  const r = plan(base);
  assert.deepEqual([r.top?.type, r.top?.priority, r.top?.tier], ["ENERGY_DECISION", 100, "RISK"]);
  assert.deepEqual(r.companions.map((s) => [s.type, s.priority, s.tier]), [["PROFILE_PREPARATION", 90, "PHASE"]]);
  assert.equal(r.inbox.length, 0);
  assert.equal(r.companions[0].confirmationRequired, true);
});

test("공조 차이가 1°C 미만이면 제안하지 않는다", () => {
  const r = plan({ ...base, energy: null, climate: { currentC: 23.5, targetC: 23 } });
  assert.equal(r.top, null);
});

test("거울 - 주행 중 충전 판단은 96 · 덜 중요한 도착 안내는 정차까지 보류한다", () => {
  const r = plan({ ...base, journey: at("APPROACHING"), restricted: true });
  assert.deepEqual([r.top?.type, r.top?.priority], ["ENERGY_DECISION", 96]);
  assert.deepEqual(r.inbox.map((s) => [s.type, s.priority, s.status]), [["ARRIVAL_PREPARATION", 81, "DEFERRED"]]);
});

test("휴식 간격이 지나도 곧 도착이면 쉬어 가자고 하지 않는다", () => {
  const driving = plan({ ...base, journey: at("DRIVING"), restricted: true, energy: null, breakPhase: "SUGGEST" });
  assert.equal(driving.top?.type, "BREAK_PLANNING");
  const near = plan({ ...base, journey: at("APPROACHING"), restricted: true, energy: null, breakPhase: "SUGGEST" });
  assert.equal(near.top, null);
});

test("거울 - 목적지에 주차하면 하차 준비(95)를 묻고 충전 판단은 꺼내지 않는다", () => {
  const r = plan({ ...base, journey: at("PARKED", true) });
  assert.deepEqual([r.top?.type, r.top?.priority, r.top?.action], ["CHECKLIST_REMINDER", 95, "CONFIRM_FINISH"]);
  assert.equal(r.inbox.length, 0);
  assert.match(r.top!.explanation, /직접 확인/);
});

test("거절한 제안은 10분 동안 다시 띄우지 않는다", () => {
  const h = recordDismissed({}, "ENERGY_DECISION", base.now);
  assert.equal(plan({ ...base, history: h, now: base.now + 9 * 60_000 }).top?.type, "PROFILE_PREPARATION");
  assert.equal(plan({ ...base, history: h, now: base.now + 11 * 60_000 }).top?.type, "ENERGY_DECISION");
});

test("세 번 연달아 거절하면 먼저 띄우지 않고 추천함에만 둔다", () => {
  let h = {};
  for (let k = 0; k < 3; k++) h = recordDismissed(h, "PROFILE_PREPARATION", 0);
  const r = plan({ ...base, energy: null, history: h, now: 3_600_000 });
  assert.equal(r.top, null);
  assert.deepEqual(r.inbox.map((s) => [s.type, s.status]), [["PROFILE_PREPARATION", "DEFERRED"]]);
});

test("이번 여정에서 이미 한 것은 다시 제안하지 않고, 새 여정에서는 다시 묻는다", () => {
  const h = recordAccepted({}, "ENERGY_DECISION");
  assert.equal(plan({ ...base, history: h }).top?.type, "PROFILE_PREPARATION");
  assert.equal(plan({ ...base, history: newTrip(h) }).top?.type, "ENERGY_DECISION");
});

test("'먼저 제안' 을 끄면 아무것도 앞에 띄우지 않는다", () => {
  const r = plan({ ...base, proactive: false });
  assert.equal(r.top, null);
  assert.equal(r.inbox.every((s) => s.status === "DEFERRED"), true);
});

// ── 프로필 (웹 시연 전용 — Kotlin 거울 없음) ─────────────────

test("하차 항목은 프로필 이름이 아니라 고른 동승자가 정한다", () => {
  assert.deepEqual(finishItemsFor("FAMILY", ["CHILD"]), ["휴대전화", "지갑·소지품", "차량 내 준비물", "다음 일정 확인", "아이 준비물", "아이 가방", "유모차"]);
  assert.equal(finishItemsFor("FAMILY", ["PET"]).includes("반려동물 이동 용품"), true);
  assert.equal(finishItemsFor("WORK", []).includes("다음 일정 확인"), false);
  assert.equal(finishItemsFor("WORK", []).includes("다음 일정 메모"), true);
});

test("가족 프로필 여정은 쉼표 DRIVE 기본 시나리오와 같은 판단(약 47% 부족)을 낸다", () => {
  assert.equal(energySignalOf(planFor(PROFILE_PRESETS.FAMILY), TRIP_PRESETS.FAMILY.vehicle)?.message, energy?.message);
});

test("업무 왕복 + 90분 대기는 충전이 필요 없다", () => {
  assert.equal(energySignalOf(planFor(PROFILE_PRESETS.WORK), TRIP_PRESETS.WORK.vehicle), null);
});

test("저장 온도나 차량 온도를 모르면 공조를 비교하지 않는다", () => {
  assert.equal(climateGapOf(PROFILE_PRESETS.FAMILY, null), null);
  assert.equal(climateGapOf({ ...PROFILE_PRESETS.FAMILY, targetC: null }, 25), null);
  assert.deepEqual(climateGapOf(PROFILE_PRESETS.FAMILY, 25), { currentC: 25, targetC: 23 });
});

test("가족 프로필은 체크리스트를 전부 확인해야 하차를 완료한다", () => {
  const p = PROFILE_PRESETS.FAMILY;
  assert.equal(canFinish(p, p.finishChecklist.slice(1)), false);
  assert.equal(canFinish(p, p.finishChecklist), true);
  assert.equal(canFinish(PROFILE_PRESETS.WORK, []), true);
});

// ── 제안 집계 — "필요할 때만 제안한다"를 검증 가능하게 (외부 평가 6 ③, 2026-10-27) ──

test("거울 - 집계: 검토 수 · 표시 수 · 억제 이유 — 이미 함 · 쿨다운 · 주행 중 · 연속 거절 · 먼저 제안 끔", () => {
  const audit = (r: ReturnType<typeof plan>) => [r.audit.reviewed, r.audit.shown, r.audit.held.map((h) => `${h.type}:${h.reason}`).join(",")];
  // 기본: 충전(위험) + 공조 두 후보, 둘 다 앞에
  assert.deepEqual(audit(plan(base)), [2, 2, ""]);
  // 경유지를 넣었다 → 충전은 이번 여정에서 이미 함
  assert.deepEqual(audit(plan({ ...base, history: recordAccepted({}, "ENERGY_DECISION") })), [2, 1, "ENERGY_DECISION:DONE_THIS_TRIP"]);
  // 공조를 방금 거절 → 10분 쉼. 10분 뒤에는 다시 검토한다(재등장)
  const dismissed = recordDismissed({}, "PROFILE_PREPARATION", base.now - 60_000);
  assert.deepEqual(audit(plan({ ...base, history: dismissed })), [2, 1, "PROFILE_PREPARATION:COOLDOWN"]);
  assert.deepEqual(audit(plan({ ...base, history: dismissed, now: base.now + 10 * 60_000 })), [2, 2, ""]);
  // 주행 중 · 목적지 3km 앞 → 도착 준비는 정차까지 보류
  assert.deepEqual(audit(plan({ ...base, journey: at("APPROACHING"), restricted: true, energy: null, breakPhase: "CRUISING" })), [1, 0, "ARRIVAL_PREPARATION:DRIVING"]);
  // 3번 연속 거절 → 추천함(위험 등급은 예외라 충전은 그대로 앞에)
  const streak = { PROFILE_PREPARATION: { dismissStreak: 3, lastShownAt: null, lastDismissedAt: null, doneThisTrip: false }, ENERGY_DECISION: { dismissStreak: 3, lastShownAt: null, lastDismissedAt: null, doneThisTrip: false } };
  assert.deepEqual(audit(plan({ ...base, history: streak })), [2, 1, "PROFILE_PREPARATION:DISMISSED"]);
  // "먼저 제안" 끔 → 전부 추천함
  assert.deepEqual(audit(plan({ ...base, proactive: false })), [2, 0, "PROFILE_PREPARATION:PROACTIVE_OFF,ENERGY_DECISION:PROACTIVE_OFF"]);
  // 문제가 없는 날: 검토할 후보 자체가 없다 — 억제한 것도 없다
  assert.deepEqual(audit(plan({ ...base, energy: null, climate: { currentC: 23, targetC: 23 }, checklistPending: 0 })), [0, 0, ""]);
});

test("거울 - 최소 안내(탑승 조합의 안내 빈도) — 주의 등급은 추천함으로, 위험·단계 할 일은 그대로 (오너 지시 2026-10-28)", () => {
  const audit = (r: ReturnType<typeof plan>) => [r.audit.shown, r.audit.held.map((h) => `${h.type}:${h.reason}`).join(",")];
  const caution = { ...base, energy: { verdict: "TIGHT" as const, message: "여유가 크지 않음" } };
  assert.deepEqual(audit(plan({ ...caution, quiet: true })), [1, "ENERGY_DECISION:QUIET"]);
  assert.equal(plan({ ...caution, quiet: true }).top?.type, "PROFILE_PREPARATION");
  assert.deepEqual(audit(plan({ ...caution, quiet: false })), [2, ""]);
  // 부족(위험)은 최소 안내여도 앞에 띄운다
  assert.deepEqual(audit(plan({ ...base, quiet: true })), [2, ""]);
  assert.equal(plan({ ...base, quiet: true }).top?.type, "ENERGY_DECISION");
});
