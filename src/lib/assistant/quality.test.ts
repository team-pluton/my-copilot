import { test } from "node:test";
import assert from "node:assert/strict";
import { estimate, rejudge } from "../core/energy";
import { DEFAULT_PLAN, DEFAULT_VEHICLE } from "../core/mock";
import { energyView } from "./energy-view";
import { decideNotification, INITIAL_NOTIFICATION, notificationMessage, shouldResurface, type NotificationState } from "./notify";
import { INITIAL_JOURNEY, nextJourney, withLegs, type JourneySignals, type JourneyState } from "./journey";
import { legRemainingKm, legsOf, remainingPlan } from "./trip";
import { energySignalOf, newTrip, plan, recordDismissed, recordKept, type PlannerInput } from "./planner";
import { idleAction, reduceAction, type ActionEvent, type ActionState } from "./actions";
import { activityOf, emptyVault, newMemory, prepareSummary, recordActivity, remember, setHistory, startTrip, wipeProfile, type MemoryEvent } from "./memory";
import { planFor, PROFILE_PRESETS, TRIP_PRESETS } from "./profile";

/**
 * 품질 개선(docs/my-copilot/CHECKLIST.md) — core/ 의 QualityTest.kt 와 **같은 입력·같은 기대값**이다 (거울).
 * 테스트 이름은 사용자가 겪던 문제를 어떻게 막는지의 문장이다.
 */

// ── P0-1 에너지 숫자의 의미 ───────────────────────────
const family = estimate(DEFAULT_PLAN, DEFAULT_VEHICLE);

test("거울 - 부족하면 '−27%' 대신 추가 필요량 47%p 를 쓰고, 도착 잔량은 0 아래로 내려가지 않는다", () => {
  const v = energyView(family, 68, 77);
  assert.equal(family.arrivalPct < 0, true); // 엔진 값은 그대로 음수다 — 읽는 법만 바꾼다
  assert.deepEqual(
    [v.status, v.currentSocPct, v.arrivalSocPct, v.depletesBeforeArrival, v.requiredPctPoints, v.requiredRange, v.requiredKwh, v.headline, v.detail],
    ["SHORT", 68, 0, true, 47, [36, 58], 36.2, "충전 계획이 필요해요", "예상 추가 필요량 약 47%p (추정 36~58%p)"],
  );
});

test("거울 - 배터리 0% 면 추가 필요량이 100%p 를 넘어 '완충해도 모자랄 수 있음'을 붙인다", () => {
  const v = energyView(estimate(DEFAULT_PLAN, { ...DEFAULT_VEHICLE, batteryPct: 0 }), 0, 77);
  assert.deepEqual([v.currentSocPct, v.requiredPctPoints, v.exceedsFullCharge, v.detail], [0, 115, true, "예상 추가 필요량 약 115%p (추정 104~126%p) · 완충해도 모자랄 수 있음"]);
});

test("거울 - 배터리 100% · 짧은 길이면 충분하고 추가 필요량은 0, 범위도 없다", () => {
  const v = energyView(estimate({ ...DEFAULT_PLAN, routeKm: 100 }, { ...DEFAULT_VEHICLE, batteryPct: 100 }), 100, 77);
  assert.deepEqual([v.status, v.requiredPctPoints, v.requiredRange, v.requiredKwh, v.detail], ["OK", 0, null, null, "도착 예상 잔량 약 75% (추정)"]);
});

test("거울 - 평균으로는 충분한데 추정 범위가 최소 잔량을 넘나들면 '주의' 이고 최대 부족분만 적는다", () => {
  const v = energyView({ ...family, shortfallPct: -1, shortfallRange: [-3, 2], arrivalPct: 21 }, 60, 77);
  assert.deepEqual([v.status, v.requiredPctPoints, v.requiredRange, v.detail], ["CAUTION", 0, [0, 2], "평균으로는 충분하지만 추정 범위에서 최대 약 2%p 모자랄 수 있음"]);
});

test("거울 - 추가 필요량이 딱 0 이고 범위도 넘지 않으면 충분이다", () => {
  const v = energyView({ ...family, shortfallPct: 0, shortfallRange: [-2, 0], arrivalPct: 20 }, 60, 77);
  assert.deepEqual([v.status, v.requiredPctPoints, v.requiredRange], ["OK", 0, null]);
});

test("거울 - 계획이나 현재 잔량을 모르면 '계산 불가' — 추정하지 않는다", () => {
  assert.deepEqual([energyView(null, 68, 77).status, energyView(null, 68, 77).currentSocPct], ["UNKNOWN", 68]);
  assert.deepEqual([energyView(family, null, 77).status, energyView(family, null, 77).headline], ["UNKNOWN", "최신 차량 정보가 없어 계획을 확인할 수 없어요"]);
});

test("거울 - 배터리 용량을 확인하지 못했으면 kWh 를 적지 않는다", () => {
  assert.equal(energyView(family, 68, null).requiredKwh, null);
});

// ── P0-2 누적 재판단 알림 ─────────────────────────────
const work = planFor(PROFILE_PRESETS.WORK);
const workAt = (battery: number, wait: number) => estimate({ ...work, waitMinutesAfterArrival: wait }, { ...TRIP_PRESETS.WORK.vehicle, batteryPct: battery });
const run = (battery: number, waits: number[]) => {
  let s: NotificationState = INITIAL_NOTIFICATION;
  return waits.map((w) => { const d = decideNotification(s, workAt(battery, w)); s = d.state; return [d.reason, notificationMessage(d, battery)]; });
};

test("거울 - 30분씩 나빠져도 직전 값과만 비교하면 끝까지 조용하다 (고치기 전 동작)", () => {
  const plans = [150, 180, 210, 240].map((w) => workAt(40, w));
  assert.deepEqual(plans.slice(1).map((p, i) => rejudge(plans[i], p)), [null, null, null]);
});

test("거울 - 마지막으로 알린 판단과 비교하면 누적 +4%p 에서 알린다", () => {
  assert.deepEqual(run(40, [150, 180, 210, 240]), [
    ["BASELINE", null],
    ["NONE", null],
    ["NONE", null],
    ["CUMULATIVE", "재판단 · 추가 필요량 약 4%p → 8%p (+4%p)"],
  ]);
});

test("거울 - 등급이 바뀌면 변화량이 작아도 바로 알리고, 문구에 음수 범위를 쓰지 않는다", () => {
  assert.deepEqual(run(45, [90, 120, 150]), [
    ["BASELINE", null],
    ["NONE", null],
    ["TIER_CHANGE", "판단이 바뀌었습니다: 충분 → 주의 · 평균으로는 충분하지만 추정 범위에서 최대 약 1%p 모자랄 수 있음"],
  ]);
});

test("거울 - 좋아지는 쪽도 알리지만 에너지 제안을 다시 꺼내지는 않는다", () => {
  let s: NotificationState = INITIAL_NOTIFICATION;
  s = decideNotification(s, workAt(48, 210)).state;
  const d = decideNotification(s, workAt(48, 90));
  assert.deepEqual([d.reason, notificationMessage(d, 48), shouldResurface(d)], ["TIER_CHANGE", "판단이 바뀌었습니다: 주의 → 충분 · 도착 예상 잔량 약 27% (추정)", false]);
});

test("거울 - 나빠지는 쪽으로 알렸으면 에너지 제안을 다시 꺼낸다 (공조 거절 학습으로 묻지 않는다)", () => {
  let s: NotificationState = INITIAL_NOTIFICATION;
  for (const w of [150, 180, 210]) s = decideNotification(s, workAt(40, w)).state;
  assert.equal(shouldResurface(decideNotification(s, workAt(40, 240))), true);
});

// ── P0-3 제안 우선순위 계층 ─────────────────────────
const at = (phase: JourneyState["phase"], atDestination = false): JourneyState => ({ ...INITIAL_JOURNEY, phase, atDestination });
const base: PlannerInput = {
  journey: at("PREPARING"), restricted: false, now: 1_000_000, energy: energySignalOf(DEFAULT_PLAN, DEFAULT_VEHICLE), breakPhase: "CRUISING",
  climate: { currentC: 25, targetC: 23 }, checklistPending: 3, proactive: true, history: {},
  context: { profileName: "가족 이동", batteryPct: 68, waitMinutes: 40, minReservePct: 20, tripMinutes: 0, breakIntervalMinutes: 90, remainingKm: 400 },
};
const tight = { verdict: "TIGHT" as const, message: "여유가 빠듯합니다" };
const types = (xs: { type: string }[]) => xs.map((x) => x.type);

test("거울 - '주의'(아슬아슬)이면 출발 준비(공조)가 먼저고, 에너지는 함께 할 일로 옆에 둔다 — 점수는 에너지가 더 높아도", () => {
  const r = plan({ ...base, energy: tight });
  assert.deepEqual([r.top?.type, r.top?.priority, types(r.companions), r.companions[0].priority], ["PROFILE_PREPARATION", 90, ["ENERGY_DECISION"], 93]);
});

test("거울 - '부족' 판단은 세 번 거절해도 추천함으로 미루지 않는다 (쿨다운만 지킨다)", () => {
  let h = {};
  for (let k = 0; k < 3; k++) h = recordDismissed(h, "ENERGY_DECISION", 0);
  const r = plan({ ...base, climate: null, history: h, now: 3_600_000 });
  assert.deepEqual([r.top?.type, r.top?.status], ["ENERGY_DECISION", "NEW"]);
});

test("거울 - 문제가 없는 날에는 아무것도 제안하지 않는다", () => {
  const r = plan({ ...base, energy: null, climate: { currentC: 23, targetC: 23 } });
  assert.deepEqual([r.top, r.companions, r.inbox], [null, [], []]);
});

test("거울 - 제안마다 건너뛰면 어떻게 되는지 적는다", () => {
  const r = plan(base);
  assert.equal(r.top?.ifSkipped, "건너뛰어도 10분 뒤 다시 확인합니다. 부족 판단은 거절해도 추천함으로 미루지 않습니다.");
  assert.equal(r.companions[0].ifSkipped, "건너뛰면 지금 온도를 그대로 두고, 이번 이동에서는 다시 묻지 않습니다.");
});

test("거울 - 공조를 '그대로 두기'로 건너뛰면 쿨다운이 지나도 이번 이동에서는 다시 묻지 않고, 새 이동에서는 묻는다", () => {
  const h = recordKept({}, "PROFILE_PREPARATION", base.now);
  const later = { ...base, energy: null, history: h, now: base.now + 3_600_000 };
  assert.equal(plan(later).top, null);
  assert.equal(plan({ ...later, history: newTrip(h) }).top?.type, "PROFILE_PREPARATION");
});

test("거울 - 주행 중에는 함께 할 일을 보여 주지 않는다 (한 줄 화면)", () => {
  const r = plan({ ...base, journey: at("DRIVING"), restricted: true, energy: tight, climate: null, breakPhase: "SUGGEST" });
  assert.deepEqual([r.top?.type, r.companions.length, types(r.inbox)], ["BREAK_PLANNING", 0, ["ENERGY_DECISION"]]);
});

// ── P0-4 왕복 여정 ─────────────────────────────────
const sig = (o: Partial<JourneySignals> = {}): JourneySignals => ({ gear: "DRIVE", parkingBrake: false, speedKmh: 0, uxRestricted: null, remainingKm: 30, ...o });
const parked = (km = 30) => sig({ gear: "PARK", parkingBrake: true, uxRestricted: false, remainingKm: km });
const moving = (km = 30) => sig({ speedKmh: 60, uxRestricted: true, remainingKm: km });
const legView = (j: JourneyState) => `${j.phase}/${j.leg}`;

test("거울 - 편도 여정은 지금까지와 같다: 목적지 하차 확인 → 완료 (회귀)", () => {
  let j = withLegs(nextJourney(INITIAL_JOURNEY, parked(), "START_PREPARE"), 1);
  for (const s of [moving(), parked(0.2)]) j = nextJourney(j, s);
  j = nextJourney(nextJourney(j, parked(0.2), "START_FINISH"), parked(0.2), "FINISH_DONE");
  assert.equal(legView(j), "COMPLETED/0");
});

test("거울 - 왕복이면 고객사 하차 확인을 마쳐도 여정은 끝나지 않고 '대기 중 · 귀가 남음'이 된다", () => {
  let j = withLegs(nextJourney(INITIAL_JOURNEY, parked(), "START_PREPARE"), 2);
  for (const s of [moving(), parked(0.2)]) j = nextJourney(j, s);
  const seen = [legView(j)];
  j = nextJourney(j, parked(0.2), "START_FINISH"); seen.push(legView(j));
  j = nextJourney(j, parked(0.2), "FINISH_DONE"); seen.push(legView(j));
  j = nextJourney(j, moving(0)); seen.push(legView(j)); // 고객사를 떠난다 — 남은 거리 0 은 지난 구간 값이라 '곧 도착'으로 보지 않는다
  j = nextJourney(j, moving(38)); seen.push(legView(j));
  j = nextJourney(j, parked(0.1)); seen.push(legView(j));
  j = nextJourney(nextJourney(j, parked(0.1), "START_FINISH"), parked(0.1), "FINISH_DONE"); seen.push(legView(j));
  assert.deepEqual(seen, ["PARKED/0", "FINISHING/0", "WAITING/0", "DRIVING/1", "DRIVING/1", "PARKED/1", "COMPLETED/1"]);
});

test("거울 - 고객사에서 내리지 않고 기다릴 수도 있고, 귀가가 남아 있어도 사용자가 여정을 끝낼 수 있다", () => {
  let j = withLegs(nextJourney(INITIAL_JOURNEY, parked(), "START_PREPARE"), 2);
  for (const s of [moving(), parked(0.2)]) j = nextJourney(j, s);
  const waiting = nextJourney(j, parked(0.2), "START_WAIT");
  assert.equal(legView(waiting), "WAITING/0");
  assert.equal(legView(nextJourney(waiting, parked(0.2), "END_TRIP")), "COMPLETED/0");
  assert.equal(legView(nextJourney(waiting, parked(0.2), "START_FINISH")), "FINISHING/0"); // 대기 중 잠시 하차
});

test("거울 - 중간 정차(목적지 아님)에서는 대기를 시작할 수 없고, 마지막 구간에서는 START_WAIT 이 아무 일도 하지 않는다", () => {
  let j = withLegs(nextJourney(INITIAL_JOURNEY, parked(), "START_PREPARE"), 2);
  for (const s of [moving(), parked(20)]) j = nextJourney(j, s);
  assert.equal(legView(nextJourney(j, parked(20), "START_WAIT")), "PARKED/0");
  const last = { ...j, leg: 1, atDestination: true };
  assert.equal(legView(nextJourney(last, parked(0.1), "START_WAIT")), "PARKED/1");
});

const workPlan = planFor(PROFILE_PRESETS.WORK);

test("거울 - 왕복 계획은 2구간, 편도는 1구간", () => {
  assert.deepEqual([legsOf(workPlan), legsOf(DEFAULT_PLAN)], [2, 1]);
});

test("거울 - 편도의 남은 계획은 지금까지와 같다 (회귀)", () => {
  assert.deepEqual(remainingPlan(DEFAULT_PLAN, { leg: 0, traveledInLegKm: 100, waitedMinutes: 0 }), { ...DEFAULT_PLAN, routeKm: 300 });
});

test("거울 - 고객사에 도착해도 귀로 에너지 예산은 그대로 남는다 · 기다린 만큼만 대기가 줄어든다", () => {
  const atArrival = remainingPlan(workPlan, { leg: 0, traveledInLegKm: 38, waitedMinutes: 30 });
  assert.deepEqual([atArrival.routeKm, atArrival.returnKm, atArrival.waitMinutesAfterArrival], [0, 38, 60]);
  const full = estimate(workPlan, TRIP_PRESETS.WORK.vehicle);
  assert.equal(estimate(atArrival, TRIP_PRESETS.WORK.vehicle).returnPct, full.returnPct);
});

test("거울 - 귀가 구간의 남은 계획은 돌아오는 길뿐이다", () => {
  const back = remainingPlan(workPlan, { leg: 1, traveledInLegKm: 10, waitedMinutes: 90 });
  assert.deepEqual([back.destinationName, back.routeKm, back.returnKm, back.waitMinutesAfterArrival], ["집 (귀가)", 28, 0, 0]);
  assert.deepEqual([legRemainingKm(workPlan, { leg: 0, traveledInLegKm: 20, waitedMinutes: 0 }), legRemainingKm(workPlan, { leg: 1, traveledInLegKm: 10, waitedMinutes: 0 })], [18, 28]);
});

test("거울 - 왕복의 고객사에 주차하면 귀로 에너지 제안은 남고, 최종 도착에서만 거둔다", () => {
  const short = { verdict: "SHORT" as const, message: "귀가까지 모자랍니다" };
  const mid = plan({ ...base, journey: { ...at("PARKED", true), legs: 2, leg: 0 }, energy: short, climate: null });
  const fin = plan({ ...base, journey: { ...at("PARKED", true), legs: 2, leg: 1 }, energy: short, climate: null });
  assert.deepEqual([mid.top?.type, fin.top?.type], ["ENERGY_DECISION", "CHECKLIST_REMINDER"]);
  assert.equal(fin.companions.length + fin.inbox.length, 0);
});

// ── P1-1 Journey Memory · 프로필 격리 (웹 화면 상태 모델 — Kotlin 거울은 앱 이식 때) ─────
test("새 이동은 지난 이동의 준비·공조·경유지·하차 확인을 가져오지 않는다", () => {
  let v = emptyVault();
  const first = startTrip(v, "FAMILY"); v = first.vault;
  let m = first.memory;
  for (const e of [{ kind: "PACKED", items: ["아이 간식·물"] }, { kind: "PREPARE_DONE" }, { kind: "CLIMATE", decision: "KEPT", valueC: 25 }, { kind: "WAYPOINT", id: "gimcheon" }, { kind: "FINISH_CHECKED", leg: 0, items: ["휴대전화"] }] as MemoryEvent[]) m = remember(m, e);
  assert.deepEqual([m.tripId, m.prepareDone, m.climate, m.waypointIds], [1, true, { decision: "KEPT", valueC: 25 }, ["gimcheon"]]);
  const second = startTrip(v, "FAMILY");
  assert.deepEqual(second.memory, newMemory(2, "FAMILY"));
});

test("프로필을 바꾸면 다른 프로필의 이동 기록과 거절 학습이 보이지 않는다", () => {
  let v = emptyVault();
  v = recordActivity(v, "FAMILY", { clock: "08:00", kind: "PREPARE", text: "가족 이동 출발 준비", tripId: 1 });
  v = setHistory(v, "FAMILY", recordDismissed({}, "PROFILE_PREPARATION", 0));
  assert.deepEqual([activityOf(v, "WORK"), v.history.WORK], [[], {}]);
  assert.equal(activityOf(v, "FAMILY").length, 1);
});

test("개인 기록 삭제는 그 프로필만 지운다", () => {
  let v = emptyVault();
  v = recordActivity(v, "FAMILY", { clock: "08:00", kind: "PREPARE", text: "가족", tripId: 1 });
  v = recordActivity(v, "WORK", { clock: "09:00", kind: "PREPARE", text: "업무", tripId: 1 });
  v = wipeProfile(v, "FAMILY");
  assert.deepEqual([activityOf(v, "FAMILY").length, activityOf(v, "WORK").length], [0, 1]);
});

test("출발 준비 요약 — 공조 결정·준비물·에너지 계획 중 끝난 것과 남은 것을 센다", () => {
  let m = newMemory(1, "FAMILY");
  assert.deepEqual(prepareSummary(m, 3, "DIFFERENT", false), { done: 0, needs: 3 });
  m = remember(remember(m, { kind: "CLIMATE", decision: "APPLIED", valueC: 23 }), { kind: "PACKED", items: ["a", "b", "c"] });
  assert.deepEqual(prepareSummary(m, 3, "DIFFERENT", false), { done: 2, needs: 1 });
  m = remember(m, { kind: "WAYPOINT", id: "gimcheon" }); // 부족해도 경유지를 골랐으면 에너지 계획은 된 것
  assert.deepEqual(prepareSummary(m, 3, "DIFFERENT", false), { done: 3, needs: 0 });
  assert.deepEqual(prepareSummary(newMemory(1, "SOLO"), 0, "SKIP", true), { done: 1, needs: 0 });
  assert.deepEqual(prepareSummary(newMemory(1, "SOLO"), 0, "UNREADABLE", true), { done: 1, needs: 1 }); // 읽을 수 없으면 직접 확인이 남는다
});

// ── P1-6 액션 상태 (요청 ID · 결과 모름 · 늦은 콜백) ─────────────
const runA = (events: ActionEvent[], s: ActionState = idleAction("MOCK")) => events.reduce(reduceAction, s);
const view = (s: ActionState) => [s.phase, s.canRetry, s.message];

test("거울 - 확인 → 보냄 → 콜백 값이 목표와 같으면 검증된 성공", () => {
  assert.deepEqual(view(runA([{ type: "OPEN" }, { type: "SEND", requestId: 1, target: 23 }, { type: "CALLBACK", requestId: 1, value: 23 }])), ["VERIFIED_SUCCESS", true, "시연 값으로 23 적용"]);
});

test("거울 - 응답이 없으면 실패가 아니라 '모름' 이고, 다시 읽기 전에는 재시도할 수 없다", () => {
  const s = runA([{ type: "OPEN" }, { type: "SEND", requestId: 1, target: 23 }, { type: "TIMEOUT", requestId: 1 }]);
  assert.deepEqual([s.phase, s.canRetry], ["UNKNOWN_OUTCOME", false]);
  assert.equal(reduceAction(s, { type: "OPEN" }), s); // 다시 열리지 않는다 — 중복 명령 방지
});

test("거울 - 모르는 상태에서 다시 읽은 값이 그대로면 실패(재시도 가능), 바뀌어 있으면 성공", () => {
  const unknown = runA([{ type: "OPEN" }, { type: "SEND", requestId: 1, target: 23 }, { type: "TIMEOUT", requestId: 1 }]);
  assert.deepEqual(view(reduceAction(unknown, { type: "READBACK", requestId: 1, value: 25 })), ["FAILED", true, "적용되지 않았습니다 (지금 25). 다시 시도할 수 있습니다."]);
  assert.deepEqual(view(reduceAction(unknown, { type: "READBACK", requestId: 1, value: 23 })), ["VERIFIED_SUCCESS", true, "응답은 없었지만 다시 읽어 보니 23 로 바뀌어 있습니다"]);
});

test("거울 - 다시 읽을 수도 없으면 결과를 확정하지 않고 재시도도 막는다", () => {
  const s = runA([{ type: "OPEN" }, { type: "SEND", requestId: 1, target: 23 }, { type: "TIMEOUT", requestId: 1 }, { type: "READBACK", requestId: 1, value: null }]);
  assert.deepEqual([s.phase, s.canRetry], ["UNKNOWN_OUTCOME", false]);
});

test("거울 - 타임아웃 뒤 늦게 온 콜백은 그 요청의 것이면 반영한다", () => {
  const s = runA([{ type: "OPEN" }, { type: "SEND", requestId: 1, target: 23 }, { type: "TIMEOUT", requestId: 1 }, { type: "CALLBACK", requestId: 1, value: 23 }]);
  assert.deepEqual(view(s), ["VERIFIED_SUCCESS", true, "시연 값으로 23 적용 — 응답이 늦게 왔습니다"]);
});

test("거울 - 지난 요청의 늦은 콜백은 지금 요청 결과를 덮지 않는다", () => {
  const failed = runA([{ type: "OPEN" }, { type: "SEND", requestId: 1, target: 23 }, { type: "ERROR", requestId: 1, reason: "거절" }]);
  const second = runA([{ type: "OPEN" }, { type: "SEND", requestId: 2, target: 22 }], failed);
  const after = reduceAction(second, { type: "CALLBACK", requestId: 1, value: 23 });
  assert.deepEqual([after.phase, after.requestId, after.target], ["PENDING", 2, 22]);
});

test("거울 - 값이 다르면 실패 · 보내는 중에 다시 열지 않는다", () => {
  const pending = runA([{ type: "OPEN" }, { type: "SEND", requestId: 1, target: 23 }]);
  assert.equal(reduceAction(pending, { type: "OPEN" }), pending);
  assert.deepEqual(view(reduceAction(pending, { type: "CALLBACK", requestId: 1, value: 25 })), ["FAILED", true, "요청한 값과 차량 값이 다릅니다 (요청 23 · 현재 25)."]);
});

test("거울 - 확인 카드를 연 채 출발하면 승인이 무효가 된다 · 이미 보낸 요청은 계속 기다린다", () => {
  assert.deepEqual(view(runA([{ type: "OPEN" }, { type: "INVALIDATE", reason: "주행이 시작돼 확인을 취소했습니다" }])), ["IDLE", true, "주행이 시작돼 확인을 취소했습니다"]);
  assert.equal(runA([{ type: "OPEN" }, { type: "SEND", requestId: 1, target: 23 }, { type: "INVALIDATE", reason: "x" }]).phase, "PENDING");
});

// ── P1-7 G — 아무 제안도 필요 없는 날 ─────────────────
test("거울 - 확인할 하차 항목이 없으면 목적지에 주차해도 하차 준비를 묻지 않는다", () => {
  const r = plan({ ...base, journey: at("PARKED", true), energy: null, climate: null, checklistPending: 0 });
  assert.deepEqual([r.top, r.companions.length, r.inbox.length], [null, 0, 0]);
});

test("혼자 이동(출퇴근) 프로필은 하차 체크리스트가 비어 있고, 출근길은 충전이 필요 없다", () => {
  assert.deepEqual(PROFILE_PRESETS.SOLO.finishChecklist, []);
  assert.equal(energySignalOf(planFor(PROFILE_PRESETS.SOLO), TRIP_PRESETS.SOLO.vehicle), null);
});
