import { test } from "node:test";
import assert from "node:assert/strict";
import { arriveDecisiveReason, arrivePlanStatus, decideArrive, joinParking, type ArriveGoal, type ArriveInput, type TripEstimate } from "./arrive-ready";
import {
  ARRIVE_RULE_VERSION, IDLE_ARRIVE, approvalOf, arriveRestorable, arriveSavable, arriveStoreKey, arriveStepLabel, goalKeyOf, reduceArrive, restoreArrive, revalidate, shouldSendArrive,
  type ArriveHandoffEvent, type ArriveHandoffState,
} from "./arrive-handoff";

// ArriveHandoffTest.kt 와 같은 값 — 세종로 · 동국제강 실측(2026-11-11)으로 승인 → 재검증 → 내비 → 재조회
const NOW = Date.UTC(2026, 10, 11, 5, 0, 0);
const MIN = 60_000;
const kst = (ms: number) => { const d = new Date(ms + 9 * 3_600_000).toISOString(); return `${d.slice(0, 10)} ${d.slice(11, 19)}`; };
const rt = (id: string, name: string, total: string, now: string) => ({
  PKLT_CD: id, PKLT_NM: name, ADDR: "종로구", PKLT_TYPE: "NW", PRK_STTS_YN: "1", TPKCT: total, NOW_PRK_VHCL_CNT: now,
  NOW_PRK_VHCL_UPDT_TM: kst(NOW - 5 * MIN), WD_OPER_BGNG_TM: "0000", WD_OPER_END_TM: "2400", WE_OPER_BGNG_TM: "0000", WE_OPER_END_TM: "2400",
  LHLDY_OPER_BGNG_TM: "0000", LHLDY_OPER_END_TM: "2400", BSC_PRK_CRG: "430", BSC_PRK_HR: "5",
});
const INFO = [{ PKLT_CD: "171721", LAT: "37.573403", LOT: "126.975884" }, { PKLT_CD: "1425816", LAT: "37.567337", LOT: "126.983435" }];
const TRIPS: TripEstimate[] = [{ parkingId: "171721", seconds: 3882, meters: 23432, retrievedAt: NOW, source: "NAVI" }, { parkingId: "1425816", seconds: 3377, meters: 22039, retrievedAt: NOW, source: "NAVI" }];
const goal: ArriveGoal = { appointmentAt: NOW + 90 * MIN, place: { name: "광화문 고객사", point: { lat: 37.572, lon: 126.9769 } }, bufferMin: 10, confirmedByUser: true };
const input = (sejongNow = "579", o: Partial<ArriveInput> = {}): ArriveInput =>
  ({ goal, now: NOW, parkings: joinParking([rt("171721", "세종로 공영주차장(시)", "1260", sejongNow), rt("1425816", "동국제강 공영주차장(시)", "13", "3")], INFO, NOW, "LIVE_API"), trips: TRIPS, ...o });
const KEY = goalKeyOf(goal.appointmentAt, goal.place.point, goal.bufferMin);
const SEJONG = { name: "세종로 공영주차장(시)", lat: 37.573403, lon: 126.975884, poiId: null };
const run = (s: ArriveHandoffState, ...es: ArriveHandoffEvent[]) => es.reduce(reduceArrive, s);

test("승인 때 후보 ID · 좌표 · 정보 시각 · 판단 버전 · 목표를 고정한다", () => {
  const d = decideArrive(input());
  const a = approvalOf(d.top!, KEY, NOW);
  assert.deepEqual(a, { parkingId: "171721", name: "세종로 공영주차장(시)", point: { lat: 37.573403, lon: 126.975884 }, dataAt: NOW - 5 * MIN, ruleVersion: ARRIVE_RULE_VERSION, goalKey: KEY, approvedAt: NOW });
});

test("실행 직전 다시 검증 — 목표 · 규칙 · 정보 실패 · 조건 미충족 · 위치 변경이면 보내지 않는다", () => {
  const a = approvalOf(decideArrive(input()).top!, KEY, NOW);
  assert.equal(revalidate(a, decideArrive(input()), KEY, ARRIVE_RULE_VERSION), null);
  assert.equal(revalidate(a, decideArrive(input()), goalKeyOf(goal.appointmentAt! + 30 * MIN, goal.place.point, 10), ARRIVE_RULE_VERSION), "약속이나 방문지가 바뀌었어요 · 다시 판단한 결과를 확인해 주세요");
  assert.equal(revalidate(a, decideArrive(input()), KEY, "arrive-v9"), "판단 규칙이 바뀌었어요 · 다시 판단한 결과를 확인해 주세요");
  assert.equal(revalidate(a, decideArrive(input("579", { feed: { ok: false, reason: "프록시에 연결하지 못했어요" } })), KEY, ARRIVE_RULE_VERSION), "주차장 정보를 확인하지 못했어요 · 프록시에 연결하지 못했어요");
  assert.equal(revalidate(a, decideArrive(input("1260")), KEY, ARRIVE_RULE_VERSION), "승인한 세종로 공영주차장(시)이(가) 지금은 조건을 맞추지 못해요 · 만차로 표시돼 있어요(13:55 기준)");
  // 1순위가 바뀌어도, 승인한 곳이 여전히 조건을 맞추면 그대로 보낸다(대안을 고른 경우 포함)
  const far = approvalOf(decideArrive(input()).fasterButFar!, KEY, NOW);
  assert.equal(revalidate(far, decideArrive(input()), KEY, ARRIVE_RULE_VERSION), null);
  const moved = { ...a, point: { lat: a.point.lat + 0.002, lon: a.point.lon } };
  assert.equal(revalidate(moved, decideArrive(input()), KEY, ARRIVE_RULE_VERSION), "주차장 위치 정보가 바뀌었어요 · 다시 확인해 주세요");
});

test("승인 → 재검증 → 내비 목적지 없음 → 요청 → 콜백 → 재조회 같은 곳 = 경로 설정됨(주차 · 방문 완료 아님)", () => {
  const d = decideArrive(input());
  let s = run(IDLE_ARRIVE, { type: "APPROVE", requestId: 1, approval: approvalOf(d.top!, KEY, NOW) });
  assert.equal(s.phase, "REVALIDATING");
  assert.equal(arriveStepLabel(s), "실행 전에 주차 정보와 소요 시간을 다시 확인하는 중");
  // 진행 중 두 번째 승인은 무시 — 같은 요청을 두 번 보내지 않는다
  assert.equal(reduceArrive(s, { type: "APPROVE", requestId: 2, approval: approvalOf(d.top!, KEY, NOW) }).requestId, 1);
  s = run(s, { type: "REVALIDATED", requestId: 1, fresh: d, goalKey: KEY, ruleVersion: ARRIVE_RULE_VERSION }, { type: "LOOKUP", requestId: 1, current: null, known: true });
  assert.equal(s.phase, "PENDING");
  assert.ok(shouldSendArrive(s));
  // 요청 직후 읽은 지난 목적지는 실패가 아니다 — 경로 콜백 전이면 기다린다
  s = run(s, { type: "DESTINATION_READ", requestId: 1, place: { name: "강남역", lat: 37.4979, lon: 127.0276, poiId: "x" } });
  assert.equal(s.phase, "PENDING");
  s = run(s, { type: "ROUTE_STARTED", requestId: 1 });
  assert.equal(shouldSendArrive(s), false);
  // 늦게 온 다른 요청의 콜백은 무시
  assert.equal(reduceArrive(s, { type: "DESTINATION_READ", requestId: 9, place: SEJONG }).phase, "PENDING");
  s = run(s, { type: "DESTINATION_READ", requestId: 1, place: { ...SEJONG, lat: SEJONG.lat + 0.0003 } });
  assert.equal(s.phase, "ROUTE_SET");
  assert.equal(s.message, "내비 목적지를 세종로 공영주차장(시)(으)로 설정했어요 · 내비가 확인함 · 주차 · 방문은 아직 기록하지 않아요");
});

test("기존 목적지가 있으면 묻는다 — 거절하면 그대로 · 승인해야 보낸다 · 이미 같은 곳이면 보내지 않는다", () => {
  const d = decideArrive(input());
  const a = approvalOf(d.top!, KEY, NOW);
  const looking = run(IDLE_ARRIVE, { type: "APPROVE", requestId: 1, approval: a }, { type: "REVALIDATED", requestId: 1, fresh: d, goalKey: KEY, ruleVersion: ARRIVE_RULE_VERSION });
  const ask = reduceArrive(looking, { type: "LOOKUP", requestId: 1, current: { name: "광화문 고객사", lat: 37.572, lon: 126.9769, poiId: "p1" }, known: true });
  assert.equal(ask.phase, "CONFIRM_REPLACE");
  assert.equal(ask.message, "지금 안내 중인 광화문 고객사 경로가 세종로 공영주차장(시) 경로로 바뀌어요");
  assert.equal(shouldSendArrive(ask), false);
  assert.deepEqual(reduceArrive(ask, { type: "CANCEL" }), { ...IDLE_ARRIVE, message: "기존 경로를 그대로 둡니다" });
  assert.equal(reduceArrive(ask, { type: "CONFIRM_REPLACE", requestId: 1 }).phase, "PENDING");
  const already = reduceArrive(looking, { type: "LOOKUP", requestId: 1, current: SEJONG, known: true });
  assert.equal(already.phase, "ROUTE_SET");
  // 내비 상태를 못 읽으면 보내지 않는다 — 모르는 경로를 덮지 않는다
  assert.equal(reduceArrive(looking, { type: "LOOKUP", requestId: 1, current: null, known: false }).phase, "FAILED");
});

test("실패 · 미확인을 나눈다 — 오류는 실패, 응답 없음은 미확인(다시 보내지 않고 다시 읽음), 재검증 실패는 보내지 않음", () => {
  const d = decideArrive(input());
  const a = approvalOf(d.top!, KEY, NOW);
  const pending = run(IDLE_ARRIVE, { type: "APPROVE", requestId: 1, approval: a }, { type: "REVALIDATED", requestId: 1, fresh: d, goalKey: KEY, ruleVersion: ARRIVE_RULE_VERSION }, { type: "LOOKUP", requestId: 1, current: null, known: true });
  const err = reduceArrive(pending, { type: "ERROR", requestId: 1, error: "CAUSE_SEARCH_ROUTE" });
  assert.equal(err.phase, "FAILED");
  assert.equal(err.message, "내비가 경로를 찾지 못했습니다 · 기존 경로는 그대로입니다");
  const unknown = reduceArrive(pending, { type: "TIMEOUT", requestId: 1 });
  assert.equal(unknown.phase, "UNKNOWN_OUTCOME");
  assert.equal(shouldSendArrive(unknown), false);
  assert.equal(arriveStepLabel(unknown), "응답 없음 · 결과 미확인");
  // 미확인 중에도 새 승인은 받지 않는다(중복 요청 방지)
  assert.equal(reduceArrive(unknown, { type: "APPROVE", requestId: 2, approval: a }).requestId, 1);
  const late = reduceArrive(unknown, { type: "DESTINATION_READ", requestId: 1, place: SEJONG });
  assert.equal(late.phase, "ROUTE_SET");
  assert.ok(late.message!.startsWith("응답은 늦었지만 내비 목적지가 세종로 공영주차장(시)(으)로 바뀌어 있어요"));
  const blocked = run(IDLE_ARRIVE, { type: "APPROVE", requestId: 3, approval: a }, { type: "REVALIDATED", requestId: 3, fresh: decideArrive(input("1260")), goalKey: KEY, ruleVersion: ARRIVE_RULE_VERSION });
  assert.equal(blocked.phase, "BLOCKED");
  assert.equal(blocked.message, "승인한 세종로 공영주차장(시)이(가) 지금은 조건을 맞추지 못해요 · 만차로 표시돼 있어요(13:55 기준) · 내비에는 보내지 않았어요");
  assert.equal(reduceArrive(blocked, { type: "CANCEL" }), IDLE_ARRIVE);
});

test("E32-22 — 대안(동국제강)으로 바꾼 뒤 1순위가 세종로여도 안내 중인 곳이 유효하면 '유지'가 주 문장 · 세종로는 다른 적합 후보", () => {
  const d = decideArrive(input());
  assert.equal(d.top?.parking.id, "171721");
  const st = arrivePlanStatus(d, "1425816", "동국제강 공영주차장(시)");
  assert.deepEqual([st.change, st.headline, st.best?.parking.id, st.routed?.parking.id, st.recovery.notify],
    ["KEEP", "지금 경로를 유지해도 괜찮아 보여요", "171721", "1425816", false]);
  // 가까운 후보 우선으로 앞선 세종로를 여유가 더 큰 동국제강과 비교해 '약 -N분 많아요'를 만들지 않는다
  assert.equal(arriveDecisiveReason(d.top!, d.fasterButFar!), null);
});

const DONG = { name: "동국제강 공영주차장(시)", lat: 37.567337, lon: 126.983435, poiId: null };
const routeSet = (): ArriveHandoffState => {
  const a = approvalOf(decideArrive(input()).top!, KEY, NOW);
  return run(IDLE_ARRIVE, { type: "APPROVE", requestId: 1, approval: a }, { type: "REVALIDATED", requestId: 1, fresh: decideArrive(input()), goalKey: KEY, ruleVersion: ARRIVE_RULE_VERSION },
    { type: "LOOKUP", requestId: 1, current: null, known: true }, { type: "ROUTE_STARTED", requestId: 1 }, { type: "DESTINATION_READ", requestId: 1, place: SEJONG });
};

test("경로 설정 뒤 운전자가 내비에서 목적지를 바꾸면 존중한다 — 읽지 못한 것은 바뀐 것이 아니다 · 이전 계획을 다시 적용하지 않는다", () => {
  const s = routeSet();
  assert.equal(s.phase, "ROUTE_SET");
  assert.equal(run(s, { type: "NAVI_CHANGED", place: SEJONG, known: true }), s);
  assert.equal(run(s, { type: "NAVI_CHANGED", place: null, known: false }), s);
  const o = run(s, { type: "NAVI_CHANGED", place: DONG, known: true });
  assert.deepEqual([o.phase, o.routed, o.message], ["OVERRIDDEN", false, "내비 목적지가 동국제강 공영주차장(시)(으)로 바뀌어 있어요 · 앱이 보낸 경로가 아니라 이전 계획을 다시 적용하지 않아요"]);
  assert.equal(run(s, { type: "NAVI_CHANGED", place: null, known: true }).message, "내비 안내가 끝났거나 목적지가 없어요 · 이전 계획을 다시 적용하지 않아요");
  assert.equal(run(o, { type: "CANCEL" }), IDLE_ARRIVE);
  // 실행 중에는 이 이벤트로 상태가 바뀌지 않는다
  const pending = run(IDLE_ARRIVE, { type: "APPROVE", requestId: 2, approval: s.approval! });
  assert.equal(run(pending, { type: "NAVI_CHANGED", place: DONG, known: true }), pending);
});

test("재시작 뒤 복원 — 내비를 다시 읽어 같을 때만 '경로 설정됨' · 읽지 못했거나 다르면 반영됐다고 말하지 않고 다시 보내지 않는다", () => {
  const a = routeSet().approval!;
  const ok = restoreArrive(a, SEJONG, true);
  assert.deepEqual([ok.phase, ok.routed, ok.approval, ok.requestId], ["ROUTE_SET", true, a, null]);
  assert.equal(ok.message, "앱을 다시 열어 내비 목적지를 다시 읽었어요 · 세종로 공영주차장(시)(으)로 안내 중 · 주차 · 방문은 아직 기록하지 않아요");
  const unknown = restoreArrive(a, null, false);
  assert.deepEqual([unknown.phase, unknown.approval], ["IDLE", null]);
  assert.equal(unknown.message, "이전에 승인한 세종로 공영주차장(시) 경로가 지금 내비에 있는지 읽지 못했어요 · 확인 전이라 설정됨으로 보지 않아요");
  assert.equal(restoreArrive(a, DONG, true).message, "이전에 승인한 세종로 공영주차장(시) 경로가 지금 내비 목적지와 달라요 · 다시 적용하지 않아요");
  assert.equal(restoreArrive(a, null, true).phase, "IDLE");
  assert.equal(restoreArrive(a, SEJONG, true, "arrive-v9").message, "판단 규칙이 바뀌어 이전 승인은 쓰지 않아요 · 다시 판단해 주세요");
  assert.equal(shouldSendArrive(restoreArrive(a, null, true)), false);
});

test("저장 · 복원의 주인 — 운전자 · 이동별로 나누고 게스트는 저장하지 않는다 · 미확인은 미확인끼리만 · 약속이 지나면 버린다", () => {
  const mom = { driver: "mom", mode: "WORK" as const }, dad = { driver: "dad", mode: "WORK" as const };
  const unknown = { driver: null, mode: "WORK" as const }, guest = { driver: null, mode: "GUEST" as const };
  assert.equal(arriveSavable(guest), false);
  assert.equal(arriveSavable(mom), true);
  assert.notEqual(arriveStoreKey(mom), arriveStoreKey(dad));
  assert.equal(arriveStoreKey(unknown), "goal.-.WORK");
  assert.equal(arriveRestorable(mom, NOW + MIN, mom, NOW), true);
  assert.equal(arriveRestorable(mom, NOW + MIN, dad, NOW), false); // 다른 운전자의 목표가 보이지 않는다
  assert.equal(arriveRestorable(mom, NOW + MIN, unknown, NOW), false); // 확인된 운전자 기록을 미확인 상태에서 꺼내지 않는다
  assert.equal(arriveRestorable(unknown, NOW + MIN, unknown, NOW), true);
  assert.equal(arriveRestorable(mom, NOW + MIN, { driver: "mom", mode: "PICKUP" }, NOW), false); // 다른 이동
  assert.equal(arriveRestorable(guest, NOW + MIN, guest, NOW), false);
  assert.equal(arriveRestorable(mom, NOW - MIN, mom, NOW), false); // 약속이 지났다
});
