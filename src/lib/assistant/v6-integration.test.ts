/**
 * V6 — 지시서 11절 T01~T18 + TS·Kotlin 공통 계약(contracts/v6/*.tsv). Kotlin 은 V6IntegrationTest.kt 가 같은 파일을 읽는다.
 * 여기의 충전기 값은 전부 시연(MOCK)이다. 실제 API 응답을 검증한 것이 아니다.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DEFAULT_PLAN, DEFAULT_VEHICLE } from "../core/mock";
import type { PassengerType } from "../core/model";
import { applyStatusDelta, assessStation, chargerKey, dedupeChargers, normalizeCharger, parseKst, UNCHANGED_SUSPECT_HOURS, type ChargerRecord } from "./charger";
import { buildUrl, DailyBudget, matchStationDraft, pagesNeeded, parseFeed, TtlCache } from "./charger-feed";
import { CORRIDOR_ROWS, corridorStops, MOCK_STOPS, mockChargerRows } from "./corridor";
import type { Powertrain } from "./freshness";
import { noReliableHeadline, budgetLine, canPickStop, decide, decisionSurface, decisiveReason, evidenceLine, needsChargerLookup, replanNotice, type DecisionInput } from "./integrated-decision";
import { capacityToKwh, freshnessOf, normalizeVehicle } from "./journey-fact";
import { IDLE_WAYPOINT, reduceWaypoint, sameWaypoint, shouldSendWaypoint, type WaypointEvent, type WaypointState } from "./waypoint-handoff";

const NOW = Date.UTC(2026, 10, 4, 3, 0, 0);
const tsv = (name: string) => {
  const [head, ...rows] = readFileSync(`contracts/v6/${name}`, "utf8").split(/\r?\n/).filter((l) => l.length);
  const cols = head.split("\t");
  return rows.map((r) => { const v = r.split("\t"); return Object.fromEntries(cols.map((c, i) => [c, v[i] ?? ""])) as Record<string, string>; });
};

const vehicle = (soc: number | null = 68, cap: number | null = 77400, over: Partial<Parameters<typeof normalizeVehicle>[0]> = {}) =>
  normalizeVehicle({ socPct: soc, capacityRaw: cap, readAt: NOW - 1000, evidence: "VEHICLE", availability: "OK", ...over }, NOW);

const rows = (over: Record<string, Partial<Record<string, string>>> = {}) =>
  mockChargerRows(NOW, over).map((r) => normalizeCharger(r, NOW - 60_000, "MOCK")).filter((r): r is ChargerRecord => r != null);

const input = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  powertrain: "EV", vehicle: vehicle(), snapshot: DEFAULT_VEHICLE, plan: DEFAULT_PLAN, traveledKm: 0, connector: "DC_COMBO",
  stops: MOCK_STOPS, chargers: { availability: "OK", errorReason: null, records: rows() }, now: NOW, ...over,
});

test("T01 차량 값 정규화 — 77,400Wh → 77.4kWh · 이미 kWh 면 그대로 · 말이 안 되면 버린다", () => {
  assert.equal(capacityToKwh(77400), 77.4);
  assert.equal(capacityToKwh(77.4), 77.4);
  assert.equal(capacityToKwh(5), null);
  assert.equal(capacityToKwh(5_000_000), null);
  assert.deepEqual(vehicle().value, { socPct: 68, capacityKwh: 77.4 });
  assert.equal(vehicle(140).value, null);
  assert.equal(vehicle(68, 77400, { readAt: NOW - 3_600_000 }).meta.freshness, "STALE");
  assert.equal(vehicle(68, 77400, { readAt: NOW - 3_600_000 }).value, null);
});

test("T02 · T03 충전이 필요 없으면 추천도, 외부 조회도 없다", () => {
  const i = input({ vehicle: vehicle(100, 200000), plan: { ...DEFAULT_PLAN, routeKm: 100, waitMinutesAfterArrival: 0 } });
  assert.equal(needsChargerLookup(i), false);
  const d = decide(i);
  assert.equal(d.kind, "NO_CHARGE_NEEDED");
  assert.equal(d.top, null);
  assert.equal(d.usedChargerData, false);
  assert.equal(needsChargerLookup(input()), true);
  assert.equal(decide(input()).usedChargerData, true);
});

test("47% 부족 시연값은 기존 엔진 그대로 — 용량 경계만 77.4 로", () => {
  const d = decide(input({ vehicle: vehicle(68, 77000) }));
  assert.equal(Math.round(d.shortfallPct!), 47);
});

test("T04 닿지 못하는 곳은 추천하지 않는다 — 비관 추정 기준", () => {
  const d = decide(input({ vehicle: vehicle(40) }));
  assert.notEqual(d.top?.stopId, "gimcheon");
  assert.ok(d.excluded.some((x) => x.stopId === "gimcheon" && x.reason.includes("닿지 못할")));
  assert.equal(decide(input({ vehicle: vehicle(10) })).kind, "NO_RELIABLE");
});

test("T05 규격이 안 맞으면 제외, 규격을 모르면 제외가 아니라 확인 필요", () => {
  const notMatch = decide(input({ chargers: { availability: "OK", errorReason: null, records: rows({ "MOCK0003/01": { chgerType: "02" }, "MOCK0003/02": { chgerType: "02" } }) } }));
  assert.ok(notMatch.excluded.some((x) => x.stopId === "hwanggan" && x.reason.includes("규격")));
  const unknown = decide(input({ chargers: { availability: "OK", errorReason: null, records: rows({ "MOCK0003/01": { chgerType: "77" }, "MOCK0003/02": { chgerType: "77" } }) } }));
  assert.ok(unknown.needsCheck.some((c) => c.stopId === "hwanggan"));
  assert.notEqual(unknown.top?.stopId, "hwanggan");
});

test("T06 오래된 상태는 불확실 — 받은 지 오래됐거나, 사용 가능 표시가 오래 고정됐을 때", () => {
  const old = mockChargerRows(NOW).map((r) => normalizeCharger(r, NOW - 3_600_000, "CACHED")!).filter(Boolean);
  const a = assessStation(old, ["MOCK0003"], "DC_COMBO", NOW);
  assert.deepEqual([a.verdict, a.freshness], ["NEEDS_CHECK", "STALE"]);
  const d = decide(input({ chargers: { availability: "OK", errorReason: null, records: old } }));
  assert.equal(d.kind, "NO_RELIABLE");
  assert.ok(d.needsCheck.length > 0);

  const stuck = new Date(NOW - (UNCHANGED_SUSPECT_HOURS + 1) * 3_600_000 + 9 * 3_600_000).toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const s = assessStation(rows({ "MOCK0003/01": { statUpdDt: stuck }, "MOCK0003/02": { statUpdDt: stuck } }), ["MOCK0003"], "DC_COMBO", NOW);
  assert.equal(s.verdict, "NEEDS_CHECK");
  // 상태가 바뀐 일시만 오래된 '충전 중' 충전기가 있으면 고장 의심으로 몰지 않는다 — 조회 시각이 최근이기 때문
  assert.equal(freshnessOf(NOW - 60_000, NOW), "FRESH");
  // E28: 조회 시각(PC)이 차량 시계보다 몇 초 앞서도 방금 받은 값 — 5분 넘게 앞서면 믿지 않는다
  assert.equal(freshnessOf(NOW + 2_000, NOW), "FRESH");
  assert.equal(freshnessOf(NOW + 6 * 60_000, NOW), "UNKNOWN");
});

test("T07 충전소·충전기 ID 를 쌍으로 — 같은 chgerId, 다른 충전소가 섞이지 않는다", () => {
  const a = normalizeCharger({ statId: "A", chgerId: "01", stat: "2", chgerType: "04", statUpdDt: "20261104115000" }, NOW, "MOCK")!;
  const b = normalizeCharger({ statId: "B", chgerId: "01", stat: "5", chgerType: "04", statUpdDt: "20261104115000" }, NOW, "MOCK")!;
  assert.equal(dedupeChargers([a, b]).length, 2);
  assert.notEqual(chargerKey(a), chargerKey(b));
  assert.equal(assessStation([a, b], ["A"], "DC_COMBO", NOW).availableCount, 1);
  assert.equal(assessStation([a, b], ["B"], "DC_COMBO", NOW).verdict, "EXCLUDED");
  const merged = applyStatusDelta([a, b], [{ statId: "B", chgerId: "01", stat: "2", statUpdDt: "20261104115500" }], NOW, "LIVE_API");
  assert.deepEqual(merged.map((r) => r.availabilityStatus), ["AVAILABLE", "AVAILABLE"]);
  const older = applyStatusDelta([a], [{ statId: "A", chgerId: "01", stat: "5", statUpdDt: "20261104100000" }], NOW, "LIVE_API");
  assert.equal(older[0].availabilityStatus, "AVAILABLE");
});

test("T08 시설이 확인되지 않으면 '충족'이라 하지 않는다", () => {
  const d = decide(input());
  const top = d.top!;
  assert.ok(top.familyConfirmed.includes("PET_AREA"));
  const real = corridorStops({ hwanggan: ["MOCK0003"], jukam: ["MOCK0002"] });
  const r = decide(input({ stops: real }));
  assert.equal(r.top!.familyUnknown.includes("BABY_CARE"), true);
  assert.equal(r.top!.familyConfirmed.includes("BABY_CARE"), false);
  assert.ok(r.top!.reasons.some((x) => x.startsWith("미확인")));
  const noRestroom = MOCK_STOPS.map((s) => ({ ...s, facilities: { PARKING: s.facilities.PARKING } }));
  const n = decide(input({ stops: noRestroom }));
  assert.equal(n.kind, "NO_RELIABLE");
  assert.ok(n.needsCheck.every((c) => c.reasons[0].includes("필수 시설 미확인")));
});

test("T09 우회 시간을 모르면 숫자가 없다", () => {
  const d = decide(input());
  assert.equal(d.top!.detourMinutes, null);
  assert.ok(![d.headline, d.detail, ...d.top!.reasons].some((s) => /추가 \d+분|우회 \d+/.test(s)));
});

test("T10 API 실패 — 판단은 '믿을 추천 없음'이고 에너지 판단은 유지, 값을 지어내지 않는다", () => {
  const d = decide(input({ chargers: { availability: "FAILED", errorReason: "503", records: [] } }));
  assert.equal(d.kind, "NO_RELIABLE");
  assert.equal(d.top, null);
  assert.equal(Math.round(d.shortfallPct!), Math.round(decide(input()).shortfallPct!));
  assert.ok(d.needsCheck.every((c) => c.station.evidence === "UNKNOWN" && c.station.availableCount === 0));
});

test("결정 근거(demo v1 리뷰) — 에너지 예산은 판단 계산값 그대로 · '왜 이곳'은 순위를 가른 기준 하나 · 충전기 '대기'라 쓰지 않는다", () => {
  const d = decide(input());
  const b = d.budget!;
  assert.equal(b.batteryPct, 68);
  assert.equal(Math.round(b.drivePct + b.waitPct + b.reservePct - b.batteryPct), Math.round(d.shortfallPct!));
  const line = budgetLine(d)!;
  assert.equal(line, "지금 배터리 68% − 남은 주행 82~104% − 도착 후 대기 2% − 최소 잔량 20% → 약 47%p 부족 · 추정"); // Kotlin 과 글자까지 같다
  assert.equal(budgetLine(decide(input({ powertrain: "ICE" }))), null);
  assert.equal(decide(input({ powertrain: "ICE" })).budget, null);
  const ok = decide(input({ vehicle: vehicle(100, 200000), plan: { ...DEFAULT_PLAN, routeKm: 100, waitMinutesAfterArrival: 0 } }));
  assert.match(budgetLine(ok)!, /여유 약 \d+%p · 추정$/);
  const top = d.top!;
  assert.equal(decisiveReason(top, top), null); // 우위가 없으면 만들지 않는다
  assert.deepEqual(d.alternatives.map((a) => decisiveReason(top, a)), ["충전 후 목적지까지 여유가 금강휴게소보다 커요", "충전 후 목적지까지 여유가 죽암휴게소보다 커요"]);
  for (const c of [top, ...d.alternatives, ...d.needsCheck]) assert.ok(!/\d+대 대기/.test(c.station.reason), c.station.reason);
  assert.ok(d.top!.station.reason.includes("빈 충전기") || d.top!.station.reason.includes("모두 충전 중"));
});

const wp = (...es: WaypointEvent[]) => es.reduce<WaypointState>(reduceWaypoint, IDLE_WAYPOINT);
const target = { name: "황간휴게소", lat: 36.2211, lon: 127.9245, poiId: null };
const other = { name: "기존 경유지", lat: 35.1, lon: 129.0, poiId: "x" };
const other2 = { name: "기존 경유지 2", lat: 35.5, lon: 128.5, poiId: "y" };
const START: WaypointEvent = { type: "START", requestId: 1, target };

test("T11 승인 전에는 내비를 바꾸지 않는다 — 경로·슬롯을 읽기 전에는 보낼 상태가 아니다", () => {
  assert.equal(shouldSendWaypoint(IDLE_WAYPOINT), false);
  assert.equal(shouldSendWaypoint(wp(START)), false);
  assert.equal(wp(START, { type: "LOOKUP", requestId: 1, routing: false, waypoints: [] }).phase, "NO_ROUTE");
  assert.equal(wp(START, { type: "LOOKUP", requestId: 1, routing: null, waypoints: [] }).phase, "FAILED");
  assert.equal(shouldSendWaypoint(wp(START, { type: "LOOKUP", requestId: 1, routing: true, waypoints: [] })), true);
});

test("T12 콜백·재조회 없이 성공이라 하지 않는다", () => {
  const sent = wp(START, { type: "LOOKUP", requestId: 1, routing: true, waypoints: [] });
  assert.equal(reduceWaypoint(sent, { type: "ACK", requestId: 1 }).phase, "PENDING");
  assert.equal(reduceWaypoint(sent, { type: "WAYPOINTS_READ", requestId: 1, waypoints: [] }).phase, "PENDING"); // 요청 직후 읽은 지난 목록
  assert.equal(reduceWaypoint(sent, { type: "TIMEOUT", requestId: 1 }).phase, "UNKNOWN_OUTCOME");
  const acked = reduceWaypoint(sent, { type: "ACK", requestId: 1 });
  assert.equal(reduceWaypoint(acked, { type: "WAYPOINTS_READ", requestId: 1, waypoints: [] }).phase, "FAILED");
  const ok = reduceWaypoint(acked, { type: "WAYPOINTS_READ", requestId: 1, waypoints: [target] });
  assert.equal(ok.phase, "VERIFIED");
  assert.match(ok.message!, /내비가 확인함/);
  assert.equal(reduceWaypoint(sent, { type: "ACK", requestId: 9 }).acked, false); // 늦게 온 다른 요청의 콜백
});

test("T12b 에뮬레이터 실측(E24) — 콜백 없음 · 좌표 (0,0) · 늦은 목록", () => {
  const sent = wp(START, { type: "LOOKUP", requestId: 1, routing: true, waypoints: [] });
  const unknown = reduceWaypoint(sent, { type: "TIMEOUT", requestId: 1 });
  assert.equal(reduceWaypoint(unknown, { type: "WAYPOINTS_READ", requestId: 1, waypoints: [] }).phase, "UNKNOWN_OUTCOME");
  const late = reduceWaypoint(unknown, { type: "WAYPOINTS_READ", requestId: 1, waypoints: [{ name: "황간휴게소", lat: 0, lon: 0, poiId: null }] });
  assert.equal(late.phase, "VERIFIED");
  const gaveUp = reduceWaypoint(unknown, { type: "GIVE_UP", requestId: 1 });
  assert.equal(gaveUp.phase, "FAILED");
  assert.match(gaveUp.message!, /다시 보내지 않았어요/);
  const again = wp(START, { type: "LOOKUP", requestId: 1, routing: true, waypoints: [{ name: "황간휴게소", lat: 0, lon: 0, poiId: null }] });
  assert.equal(again.phase, "VERIFIED"); // 이미 들어간 곳을 두 번 보내지 않는다
  assert.equal(sameWaypoint({ name: "A", lat: 0, lon: 0, poiId: null }, { name: "B", lat: 0, lon: 0, poiId: null }), false);
});

test("T13 기존 경유지를 임의로 지우지 않는다 — 꽉 차면 고르게 하고, 지키기로 한 칸이 사라지면 알린다", () => {
  const full = wp(START, { type: "LOOKUP", requestId: 1, routing: true, waypoints: [other, other2] });
  assert.equal(full.phase, "SLOTS_FULL");
  assert.equal(shouldSendWaypoint(full), false);
  assert.match(reduceWaypoint(full, { type: "CANCEL" }).message!, /그대로/);
  const chosen = reduceWaypoint(full, { type: "CHOOSE_REPLACE", requestId: 1, index: 1 });
  assert.equal(chosen.replaceIndex, 1);
  const acked = reduceWaypoint(chosen, { type: "ACK", requestId: 1 });
  const kept = reduceWaypoint(acked, { type: "WAYPOINTS_READ", requestId: 1, waypoints: [other, target] });
  assert.match(kept.message!, /내비가 확인함/);
  const lost = reduceWaypoint(acked, { type: "WAYPOINTS_READ", requestId: 1, waypoints: [target] });
  assert.match(lost.message!, /목록에 없는 기존 경유지: 기존 경유지$|목록에 없는 기존 경유지: 기존 경유지 2?/);
});

test("T14 추천이 그대로면 상태가 움직여도 다시 묻지 않는다 · 바뀌면 이유와 함께", () => {
  const before = decide(input());
  const minor = decide(input({ chargers: { availability: "OK", errorReason: null, records: rows({ "MOCK0003/02": { stat: "3" } }) } }));
  assert.equal(before.top!.stopId, minor.top!.stopId);
  assert.equal(replanNotice(before, minor).changed, false);
  const after = decide(input({ chargers: { availability: "OK", errorReason: null, records: rows({ "MOCK0003/01": { stat: "5" }, "MOCK0003/02": { stat: "5" } }) } }));
  const n = replanNotice(before, after);
  assert.equal(n.changed, true);
  assert.match(n.message!, /황간휴게소: 충전기가 모두 점검/);
  assert.match(n.message!, /금강휴게소/);
});

test("T15 근거 등급이 섞이지 않는다", () => {
  const d = decide(input());
  assert.equal(d.top!.station.evidence, "MOCK");
  assert.match(evidenceLine(d.top!, vehicle()), /배터리 차량 정보 · 충전기 시연 데이터 · 위치 시연 데이터/);
  const mixed = [normalizeCharger({ statId: "A", chgerId: "01", stat: "2", chgerType: "04", statUpdDt: "20261104115000" }, NOW, "LIVE_API")!, normalizeCharger({ statId: "A", chgerId: "02", stat: "2", chgerType: "04", statUpdDt: "20261104115000" }, NOW, "MOCK")!];
  assert.equal(assessStation(mixed, ["A"], "DC_COMBO", NOW).evidence, "MOCK");
  assert.equal(normalizeVehicle({ socPct: 68, capacityRaw: 77400, readAt: NOW, evidence: "MOCK", availability: "OK" }, NOW).meta.source, "시연 차량");
});

test("T16 EV 전용 계산은 다른 동력원·미확인에 쓰지 않는다", () => {
  for (const p of ["PHEV", "HEV", "ICE", "UNKNOWN"] as Powertrain[]) {
    assert.equal(decide(input({ powertrain: p })).kind, "NOT_APPLICABLE");
    assert.equal(needsChargerLookup(input({ powertrain: p })), false);
  }
});

test("T17 주행 중엔 한 줄뿐, 고를 수 없다", () => {
  const d = decide(input());
  assert.deepEqual(decisionSurface(d, true), { kind: "FULL" });
  const s = decisionSurface(d, false);
  assert.equal(s.kind, "ONE_LINE");
  assert.equal(canPickStop(d, d.top!.stopId, false), false);
  assert.equal(canPickStop(d, d.top!.stopId, true), true);
  assert.equal(canPickStop(d, "gimcheon", true), false);
});

test("복구 — 거절 · 목적지 변경 · 일행 변경 · 후보 상태 변화", () => {
  const before = decide(input());
  const rejected = decide(input({ rejectedStopIds: [before.top!.stopId] }));
  assert.notEqual(rejected.top?.stopId, before.top!.stopId);
  assert.equal(replanNotice(before, rejected).changed, true);
  const nearer = decide(input({ plan: { ...DEFAULT_PLAN, routeKm: 100, waitMinutesAfterArrival: 0, destinationName: "대전" } }));
  assert.equal(nearer.kind, "NO_CHARGE_NEEDED");
  assert.equal(replanNotice(before, nearer).changed, true);
  const family = decide(input({ plan: { ...DEFAULT_PLAN, passengers: [] as PassengerType[] } }));
  assert.ok(family.top == null || !family.top.familyUnknown.includes("PET_AREA"));
  const drained = decide(input({ vehicle: vehicle(10) }));
  assert.equal(drained.top, null);
  assert.ok(replanNotice(before, drained).message!.includes("현재 배터리로 도달 가능한 후보가 확인되지 않았어요"));
});

test("권할 곳이 없을 때 원인을 섞지 않는다 — 연결 실패 · 오래됨 · 조건 미충족 · 후보 없음 (평가 2026-11-11)", () => {
  assert.equal(noReliableHeadline(true, []), "충전소 정보를 확인하지 못했어요");
  assert.equal(noReliableHeadline(false, ["상태 정보를 받은 지 오래됐어요", "상태 정보를 받은 지 오래됐어요"]), "충전소 상태를 다시 확인해야 해요");
  assert.equal(noReliableHeadline(false, ["상태 정보를 받은 지 오래됐어요", "충전 규격을 확인하지 못했어요"]), "지금 조건에서는 충전소를 추천하기 어려워요");
  assert.equal(noReliableHeadline(false, []), "현재 조건에 맞는 충전소를 찾지 못했어요");
  assert.equal(noReliableHeadline(false, [], ["지금 배터리로 닿지 못할 수 있어요", "지금 배터리로 닿지 못할 수 있어요"]), "현재 배터리로 도달 가능한 후보가 확인되지 않았어요");
  assert.equal(noReliableHeadline(false, [], ["지금 배터리로 닿지 못할 수 있어요", "필수 시설 없음: 화장실"]), "현재 조건에 맞는 충전소를 찾지 못했어요");
  assert.equal(noReliableHeadline(true, [], ["지금 배터리로 닿지 못할 수 있어요"]), "충전소 정보를 확인하지 못했어요");
});

test("실제 경로 구간 — 연결표가 비면 추천하지 않는다(시연 값으로 메우지 않는다)", () => {
  const d = decide(input({ stops: corridorStops({}), chargers: { availability: "OK", errorReason: null, records: [] } }));
  assert.equal(d.kind, "NO_RELIABLE");
  assert.ok(d.needsCheck.every((c) => c.station.reason === "연결된 충전소 정보가 없어요"));
});

test("프록시 입구 — 정상·거절·형식 오류를 구별한다", () => {
  const denied = `<?xml version="1.0"?><OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE_KEY_IS_NULL</errMsg><returnAuthMsg>서비스 접근거부</returnAuthMsg><returnReasonCode>20</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`;
  assert.deepEqual(parseFeed(denied), { ok: false, code: "20", message: "SERVICE_KEY_IS_NULL" });
  assert.equal(parseFeed("<html>점검</html>").ok, false);
  const ok = parseFeed(`<response><header><resultCode>00</resultCode><resultMsg>OK</resultMsg><totalCount>2</totalCount><pageNo>1</pageNo><numOfRows>10</numOfRows></header><items><item><statId>A</statId><chgerId>01</chgerId><statNm><![CDATA[기흥 &amp; 휴게소]]></statNm></item><item><statId>B</statId><chgerId>01</chgerId><note></note></item></items></response>`);
  assert.equal(ok.ok, true);
  if (ok.ok) { assert.equal(ok.items.length, 2); assert.equal(ok.items[0].statId, "A"); assert.equal(ok.items[0].statNm, "기흥 & 휴게소"); assert.equal(ok.totalCount, 2); }
  assert.equal(parseFeed(`<response><header><resultCode>30</resultCode><resultMsg>SERVICE KEY ERROR</resultMsg></header></response>`).ok, false);
  assert.equal(pagesNeeded(10000, 9999), 2);
  assert.equal(pagesNeeded(0, 9999), 1);
  assert.ok(!buildUrl("getChargerInfo", { pageNo: 1 }).keyless.includes("ServiceKey"));
});

test("프록시 — 예산을 넘으면 부르지 않고, 캐시는 나이를 숨기지 않는다", () => {
  let day = "d1";
  const b = new DailyBudget(2, () => day);
  assert.deepEqual([b.tryUse(), b.tryUse(), b.tryUse()], [true, true, false]);
  day = "d2";
  assert.equal(b.tryUse(), true);
  const c = new TtlCache<number>(1000);
  c.put("k", 1, 0);
  assert.equal(c.fresh("k", 500)?.value, 1);
  assert.equal(c.fresh("k", 5000), null);
  assert.equal(c.any("k")?.at, 0);
});

test("연결표 초안 — 방향이 다르거나 없으면 잇지 않는다", () => {
  const items = [{ statId: "A", statNm: "황간휴게소(부산방향)" }, { statId: "B", statNm: "황간휴게소(서울방향)" }, { statId: "C", statNm: "황간휴게소" }, { statId: "D", statNm: "황간역 주차장(부산)" }];
  assert.deepEqual(matchStationDraft("황간휴게소", "부산", items), [{ statId: "A", statNm: "황간휴게소(부산방향)" }]);
});

test("KST 시각 — 없는 날짜·형식 오류는 null", () => {
  assert.equal(parseKst("20260101120000"), Date.UTC(2026, 0, 1, 3));
  assert.equal(parseKst("20260229120000"), null);
  assert.equal(parseKst("2026-01-01"), null);
  assert.equal(parseKst(undefined), null);
});

test("구간 목록은 원본 CSV 와 같다", () => {
  const csv = readFileSync("docs/data/rest-stops.csv", "utf8").split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(","));
  assert.deepEqual(CORRIDOR_ROWS.map((r) => [r.id, r.name, String(r.routeKm)]), csv.map((c) => [c[0], c[1], c[2]]));
});

test("계약 — 충전기 정규화", () => {
  for (const c of tsv("charger-normalize.tsv")) {
    const r = normalizeCharger({ statId: c.statId, chgerId: c.chgerId, statNm: c.statNm, chgerType: c.chgerType, powerType: c.powerType, stat: c.stat, statUpdDt: c.statUpdDt, lat: c.lat, lng: c.lng, parkingFree: c.parkingFree, note: c.note }, NOW, "MOCK");
    if (c.exp_key === "-") { assert.equal(r, null, c.case); continue; }
    assert.ok(r, c.case);
    assert.equal(chargerKey(r), c.exp_key, c.case);
    assert.equal(r.connectors?.join(",") ?? "?", c.exp_connectors, c.case);
    assert.equal(r.outputKw == null ? "?" : String(r.outputKw), c.exp_kw, c.case);
    assert.equal(r.availabilityStatus, c.exp_status, c.case);
    assert.equal(r.statusUpdatedAt == null ? "?" : String(r.statusUpdatedAt), c.exp_updated_ms, c.case);
    assert.equal(r.latitude == null ? "?" : String(r.latitude), c.exp_lat, c.case);
    assert.equal(r.parkingFree == null ? "?" : String(r.parkingFree), c.exp_parking, c.case);
    assert.equal(r.accessRestrictions ?? "-", c.exp_note, c.case);
  }
});

test("계약 — 통합 판단", () => {
  for (const c of tsv("decision-cases.tsv")) {
    const over: Record<string, Partial<Record<string, string>>> = {};
    if (c.rows !== "-") for (const p of c.rows.split(";")) { const [k, v] = p.split("="); const [stat, type] = v.split(":"); over[k] = type ? { stat, chgerType: type } : { stat }; }
    const d = decide(input({
      powertrain: c.powertrain as Powertrain, vehicle: vehicle(Number(c.soc), Number(c.capacity)),
      plan: { ...DEFAULT_PLAN, passengers: c.passengers === "-" ? [] : (c.passengers.split(",") as PassengerType[]), ...(c.case === "충전-불필요" ? { routeKm: 100, waitMinutesAfterArrival: 0 } : {}) },
      chargers: c.feed === "OK" ? { availability: "OK", errorReason: null, records: rows(over) } : { availability: "FAILED", errorReason: "503", records: [] },
      rejectedStopIds: c.rejected === "-" ? [] : c.rejected.split(","), traveledKm: Number(c.traveled),
    }));
    if (process.env.V6_DUMP) { console.log(c.case, d.kind, d.top?.stopId ?? "-", d.alternatives.map((x) => x.stopId).join(",") || "-", d.needsCheck.map((x) => x.stopId).join(",") || "-", "| excl", d.excluded.map((x) => x.stopId + ":" + x.reason).join("; ")); continue; }
    assert.equal(d.kind, c.exp_kind, c.case);
    assert.equal(d.top?.stopId ?? "-", c.exp_top, c.case);
    assert.equal(d.alternatives.map((x) => x.stopId).join(",") || "-", c.exp_alts, c.case);
    assert.equal(d.needsCheck.map((x) => x.stopId).join(",") || "-", c.exp_check, c.case);
  }
});
