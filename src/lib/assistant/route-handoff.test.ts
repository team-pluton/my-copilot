import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAction } from "./gate";
import { handoffButton, IDLE_HANDOFF, reduceHandoff, samePlace, shouldSend, type HandoffEvent, type HandoffState, type NaviPlace, savedHome } from "./route-handoff";

/**
 * 원탭 다음 이동(V5, 2026-11-03) — core/ 의 RouteHandoffTest.kt 와 **같은 입력·같은 기대값**이다 (거울).
 * 지키는 것: 없는 주소를 만들지 않음 · 기존 경로는 교체 확인 뒤에만 · 요청 성공 ≠ 설정 완료 · 늦은 콜백은 그 요청의 것만.
 */
const HOME: NaviPlace = { name: "집", lat: 37.4979, lon: 127.0276, poiId: "home-1" };
const ACADEMY: NaviPlace = { name: "학원", lat: 37.51, lon: 127.06, poiId: "poi-9" };
const run = (...es: HandoffEvent[]) => es.reduce<HandoffState>(reduceHandoff, IDLE_HANDOFF);

test("같은 곳 — POI id 가 같거나 100m 안 · 1km 떨어지면 다른 곳", () => {
  assert.equal(samePlace(HOME, { ...HOME, poiId: null, lat: HOME.lat + 0.0005 }), true);
  assert.equal(samePlace(HOME, { ...HOME, poiId: "x", lat: HOME.lat + 0.009 }), false);
  assert.equal(samePlace(HOME, { ...ACADEMY, poiId: "home-1" }), true);
});

test("기본 흐름 — 시작 → 집 즐겨찾기 있고 경로 없음 → 보냄 → 경로 시작 → 목적지를 다시 읽어 집이면 확인됨", () => {
  let s = run({ type: "START", requestId: 1 }, { type: "LOOKUP", requestId: 1, home: HOME, current: null });
  assert.deepEqual([s.phase, shouldSend(s)], ["PENDING", true]);
  s = reduceHandoff(s, { type: "ROUTE_STARTED", requestId: 1 });
  assert.deepEqual([s.phase, shouldSend(s)], ["PENDING", false]); // 경로 콜백만으로는 완료가 아니다
  s = reduceHandoff(s, { type: "DESTINATION_READ", requestId: 1, place: HOME });
  assert.deepEqual([s.phase, s.message], ["VERIFIED", "내비 목적지를 집으로 설정했어요 · 내비가 확인함"]);
  assert.equal(handoffButton(s), null);
});

test("내비에 저장된 집 이름을 그대로 보인다 — 앱이 집을 정하지 않는다 · '집'이면 덧붙이지 않는다", () => {
  const named = { ...HOME, name: "강남역 2호선" };
  let s = run({ type: "START", requestId: 1 }, { type: "LOOKUP", requestId: 1, home: named, current: null });
  s = reduceHandoff(reduceHandoff(s, { type: "ROUTE_STARTED", requestId: 1 }), { type: "DESTINATION_READ", requestId: 1, place: named });
  assert.equal(s.message, "내비 목적지를 집으로 설정했어요 · 내비가 확인함 · 내비에 저장된 집: 강남역 2호선");
  const ask = run({ type: "START", requestId: 2 }, { type: "LOOKUP", requestId: 2, home: named, current: ACADEMY });
  assert.equal(ask.message, `지금 안내 중인 ${ACADEMY.name} 경로가 집 경로로 바뀌어요 · 내비에 저장된 집: 강남역 2호선`);
  assert.equal(savedHome(HOME), "");
  assert.equal(savedHome(null), "");
  assert.equal(savedHome({ ...HOME, name: "집 (시연 데이터)" }), "");
});

test("없는 주소를 만들지 않는다 — 내비에 집 즐겨찾기가 없으면 보내지 않고 직접 설정 안내", () => {
  const s = run({ type: "START", requestId: 1 }, { type: "LOOKUP", requestId: 1, home: null, current: null });
  assert.equal(s.phase, "NO_HOME");
  assert.equal(shouldSend(s), false);
  assert.equal(s.message, "내비에 집이 저장돼 있지 않아요 · 내비게이션에서 집을 등록하거나 목적지를 직접 설정해 주세요");
});

test("빈 즐겨찾기 — 좌표가 (0, 0)인 HOME 은 집이 없는 것 (에뮬레이터 실측 2026-11-03)", () => {
  const s = run({ type: "START", requestId: 1 }, { type: "LOOKUP", requestId: 1, home: { name: "집", lat: 0, lon: 0, poiId: null }, current: null });
  assert.deepEqual([s.phase, shouldSend(s)], ["NO_HOME", false]);
});

test("기존 경로 보호 — 다른 목적지가 있으면 교체 확인 · 취소하면 그대로 · 확인해야 보냄 · 이미 집이면 보내지 않음", () => {
  const ask = run({ type: "START", requestId: 1 }, { type: "LOOKUP", requestId: 1, home: HOME, current: ACADEMY });
  assert.deepEqual([ask.phase, shouldSend(ask), ask.message, handoffButton(ask)], ["CONFIRM_REPLACE", false, "지금 안내 중인 학원 경로가 집 경로로 바뀌어요", "집 경로로 바꾸기"]);
  assert.deepEqual([reduceHandoff(ask, { type: "CANCEL" }).phase, reduceHandoff(ask, { type: "CANCEL" }).message], ["IDLE", "기존 경로를 그대로 둡니다"]);
  assert.equal(reduceHandoff(ask, { type: "CONFIRM_REPLACE", requestId: 1 }).phase, "PENDING");
  const already = run({ type: "START", requestId: 1 }, { type: "LOOKUP", requestId: 1, home: HOME, current: { ...HOME, poiId: null } });
  assert.deepEqual([already.phase, already.message], ["VERIFIED", "이미 집으로 안내 중이에요"]);
  // 주행이 시작되면 열린 교체 확인은 무효
  assert.equal(reduceHandoff(ask, { type: "INVALIDATE", reason: "주행 중" }).phase, "IDLE");
});

test("요청 직후 읽은 지난 목적지로 실패 처리하지 않는다 · 경로 콜백 뒤에도 다르면 실패", () => {
  const sent = run({ type: "START", requestId: 1 }, { type: "LOOKUP", requestId: 1, home: HOME, current: null });
  assert.equal(reduceHandoff(sent, { type: "DESTINATION_READ", requestId: 1, place: ACADEMY }).phase, "PENDING");
  const routed = reduceHandoff(sent, { type: "ROUTE_STARTED", requestId: 1 });
  const wrong = reduceHandoff(routed, { type: "DESTINATION_READ", requestId: 1, place: ACADEMY });
  assert.deepEqual([wrong.phase, wrong.message, handoffButton(wrong)], ["FAILED", "내비 목적지가 집이 아니에요(학원) · 내비게이션에서 확인해 주세요", "집으로 안내 시작"]);
});

test("오류·응답 없음 — 오류는 실패(기존 경로 그대로) · 응답 없음은 모름 · 다시 읽어 집이면 늦게라도 확인 · 모르는 동안 다시 시작 안 함", () => {
  const sent = run({ type: "START", requestId: 1 }, { type: "LOOKUP", requestId: 1, home: HOME, current: null });
  const err = reduceHandoff(sent, { type: "ERROR", requestId: 1, error: "CAUSE_SEARCH_ROUTE" });
  assert.deepEqual([err.phase, err.message], ["FAILED", "내비가 경로를 찾지 못했습니다 · 기존 경로는 그대로입니다"]);
  const unk = reduceHandoff(sent, { type: "TIMEOUT", requestId: 1 });
  assert.equal(unk.phase, "UNKNOWN_OUTCOME");
  assert.equal(reduceHandoff(unk, { type: "START", requestId: 2 }), unk);
  const late = reduceHandoff(unk, { type: "DESTINATION_READ", requestId: 1, place: HOME });
  assert.deepEqual([late.phase, late.message], ["VERIFIED", "응답은 늦었지만 내비 목적지가 집으로 바뀌어 있어요"]);
  assert.equal(reduceHandoff(run({ type: "START", requestId: 1 }), { type: "TIMEOUT", requestId: 1 }).phase, "FAILED");
});

test("모의 내비 — 확인돼도 '(모의)'를 단다", () => {
  const s = run({ type: "START", requestId: 1, mock: true }, { type: "LOOKUP", requestId: 1, home: HOME, current: null }, { type: "ROUTE_STARTED", requestId: 1 }, { type: "DESTINATION_READ", requestId: 1, place: HOME });
  assert.deepEqual([s.phase, s.message], ["VERIFIED", "시연 내비에 집을 목적지로 설정했어요 (모의)"]);
});

test("늦은 콜백 — 다른 요청 번호의 결과는 무시한다", () => {
  const sent = run({ type: "START", requestId: 2 }, { type: "LOOKUP", requestId: 2, home: HOME, current: null });
  assert.equal(reduceHandoff(sent, { type: "DESTINATION_READ", requestId: 1, place: HOME }), sent);
  assert.equal(reduceHandoff(sent, { type: "ERROR", requestId: 1, error: "UNAVAILABLE" }), sent);
});

test("게이트 — 경로 요청은 주차·확인·NAVI_ROUTE_SEARCH 권한이 있어야", () => {
  const parked = { uxRestricted: false, motion: { kind: "PARKED" as const, confidence: "CONFIRMED" as const }, capabilities: {}, permissions: { NAVI_ROUTE_SEARCH: true }, inFlight: [] };
  assert.deepEqual(checkAction("REQUEST_ROUTE", parked, true), { allowed: true });
  assert.equal((checkAction("REQUEST_ROUTE", { ...parked, permissions: {} }, true) as { block: string }).block, "NO_PERMISSION");
  assert.equal((checkAction("REQUEST_ROUTE", { ...parked, motion: { kind: "MOVING", confidence: "CONFIRMED" } }, true) as { block: string }).block, "DRIVING_BLOCKED");
});
