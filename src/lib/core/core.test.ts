import { test } from "node:test";
import assert from "node:assert/strict";
import { chargeMinutes, chargePctInMinutes, compareOptions, estimate, pctPerKm, rejudge } from "./energy";
import { breakdown, excluded, feasibilityFor, rank, reachableState } from "./engine";
import { DEFAULT_PLAN, DEFAULT_VEHICLE, DEMO_STOPS, WAIT_PLAN, WAIT_VEHICLE } from "./mock";
import { phaseOf } from "./scheduler";

/**
 * TS 쪽 거울 테스트 — core/ 의 Kotlin 테스트(RecommendationEngineTest.kt)와 **같은 입력·같은 기대값**이다.
 * 한쪽을 고치면 양쪽을 다시 맞춘다. 실행: `npm test` (tsx --test, 의존성 없음).
 *
 * 테스트 이름은 규칙 문장이다 — 통과 목록이 곧 "추천이 왜 그렇게 동작하는가"의 설명이 된다.
 */
const plan = DEFAULT_PLAN;
const v = DEFAULT_VEHICLE;
const input = (vehicle = v, traveledKm = 0) => {
  const e = estimate({ ...plan, routeKm: plan.routeKm - traveledKm }, vehicle);
  return { plan, traveledKm, needsCharge: e.needsCharge, tripMinutes: vehicle.tripMinutes, feasibility: feasibilityFor(vehicle, e.waitPct, plan.minReservePct) };
};
const stop = (id: string) => DEMO_STOPS.find((s) => s.id === id)!;

test("거울 - 기본 시나리오는 약 47% 부족이고 범위는 36~58 이다", () => {
  const e = estimate(plan, v);
  assert.equal(e.drivePct, 93.4);
  assert.deepEqual(e.driveRange, [82.2, 104.6]);
  assert.equal(e.waitPct, 1.7);
  assert.equal(e.shortfallPct, 47);
  assert.deepEqual(e.shortfallRange, [35.8, 58.2]);
  assert.equal(e.needsCharge, true);
  assert.equal(e.message, "도착 후 40분 대기까지 하려면 약 47% 가 모자랍니다 (추정 36~58%). 경로상 한 번 충전을 권합니다.");
});

test("거울 - 1km 당 소비율은 0.2334% 다", () => {
  assert.equal(Math.round(pctPerKm(v) * 10000) / 10000, 0.2334);
});

test("저온 -7°C 히터 최대는 상온 대비 약 20% 를 더 쓴다 — 환경부 인증 평균 -21% 와 같은 방향·크기", () => {
  const mild = pctPerKm({ ...v, outsideTempC: 20, hvacOn: false });
  const cold = pctPerKm({ ...v, outsideTempC: -7, hvacOn: true });
  const rangeLoss = 1 - mild / cold; // 같은 배터리로 가는 거리의 감소율
  assert.ok(rangeLoss > 0.18 && rangeLoss < 0.23, `실제 ${rangeLoss}`);
});

test("거울 - 80% 로 150km 는 충전 없이 충분하고 도착 잔량은 약 43% 다", () => {
  const e = estimate({ ...plan, routeKm: 150 }, { ...v, batteryPct: 80 });
  assert.equal(e.needsCharge, false);
  assert.equal(e.arrivalPct, 43.3);
});

test("범위의 비관적인 끝만 0 을 넘으면 아슬아슬이라고 말한다", () => {
  const e = estimate({ ...plan, routeKm: 330, waitMinutesAfterArrival: 0 }, { ...v, batteryPct: 95, hvacOn: false, outsideTempC: 20 });
  assert.equal(e.needsCharge, true);
  assert.equal(e.shortfallPct, -6.4);
  assert.match(e.message, /아슬아슬/);
});

test("거울 - 기본 시나리오 후보는 김천 88 · 금강 82 · 황간 56 이다", () => {
  const r = rank(DEMO_STOPS, input());
  assert.deepEqual(r.map((x) => x.stop.id), ["gimcheon", "geumgang", "hwanggan"]);
  assert.deepEqual(r.map((x) => x.score), [88, 82, 56]);
  assert.equal(r[0].reason, "필수 시설 2개 모두 충족 · 선호 3개 중 3개 · 급속 350kW · 도착 시 약 10%(보수적 3%) · 보수적으로도 한 번 충전으로 도착 · 경로에서 0.3km · 추가 2분");
  assert.deepEqual(r[1].unmet, ["BABY_CARE"]);
});

test("거울 - 1위 점수 구성은 이탈 97 · 시설 100 · 충전 100 · 시점 0 · 신뢰 100 이다", () => {
  assert.deepEqual(breakdown(stop("gimcheon"), input()), { detour: 97, amenity: 100, charger: 100, timing: 0, confidence: 100, total: 88, chargerCounted: true });
});

test("거기서 충전해도 끝까지 못 가는 곳은 시설이 좋아도 빠진다", () => {
  assert.ok(!rank(DEMO_STOPS, input()).some((x) => x.stop.id === "anseong"));
  assert.equal(reachableState(stop("anseong"), input()), "MORE_STOPS");
});

test("지금 배터리로 못 가는 곳은 후보가 아니다", () => {
  assert.equal(reachableState(stop("chilgok"), input()), "UNREACHABLE");
});

test("한 번에 끝까지 가는 곳이 하나도 없으면 갈 수 있는 곳으로 돌아간다", () => {
  const r = rank(DEMO_STOPS, input({ ...v, batteryPct: 30 }));
  assert.ok(r.length > 0);
  assert.ok(r.every((x) => x.stop.routeKm <= 95));
  assert.match(r[0].reason, /충전해도 한 번 더 서야 함/);
});

test("충전이 필요한 여정에서 충전기 없는 곳은 점수와 무관하게 빠진다", () => {
  assert.ok(!rank(DEMO_STOPS, input()).some((x) => x.stop.chargerKw == null));
});

test("경로에서 얼마나 벗어나는지 모르면 추천하지 않는다", () => {
  assert.equal(rank([stop("unknown-detour")], { plan, traveledKm: 0, needsCharge: true, tripMinutes: 0 }).length, 0);
});

test("이미 지나온 곳은 후보가 아니다", () => {
  assert.ok(rank(DEMO_STOPS, input(v, 100)).every((x) => x.stop.routeKm > 100));
});

test("주행 중에는 후보를 셋까지만 보여 준다", () => {
  assert.equal(rank(DEMO_STOPS, { plan, traveledKm: 0, needsCharge: false, tripMinutes: 0 }).length, 3);
});

test("거울 - 90분 간격에서 70분은 미리 탐색 · 85분은 준비 · 95분은 권장이다", () => {
  assert.equal(phaseOf(plan, { ...v, tripMinutes: 70 }), "PREFETCH");
  assert.equal(phaseOf(plan, { ...v, tripMinutes: 85 }), "READY");
  assert.equal(phaseOf(plan, { ...v, tripMinutes: 95 }), "SUGGEST");
});

test("거울 - 충전 시간: 350kW 로 10→80% 는 약 22분, 50kW 는 약 73분 (가정 테이퍼)", () => {
  assert.equal(chargeMinutes(10, 80, 77, 350), 22);
  assert.equal(chargeMinutes(17, 80, 77, 50), 73);
  assert.equal(chargeMinutes(80, 80, 77, 350), 0);
});

test("거울 - 빠진 후보마다 이유가 하나씩 붙는다: 안성은 '한 번 더', 칠곡은 '못 감', 죽암은 '충전기 없음', 천안 IC 밖은 '이탈 거리 미상'", () => {
  const ex = Object.fromEntries(excluded(DEMO_STOPS, input()).map((e) => [e.stop.id, e.reason]));
  assert.equal(ex.anseong, "충전해도 한 번 더 서야 함");
  assert.equal(ex.chilgok, "지금 배터리로 못 감");
  assert.equal(ex.jukam, "충전기 없음(또는 미확인)");
  assert.equal(ex["unknown-detour"], "경로 이탈 거리 미상");
  assert.equal(ex.gimcheon, undefined); // 추천된 곳은 제외 목록에 없다
  assert.equal(Object.keys(ex).length, 10);
});

test("평균으로는 한 번에 가도 보수적으로 모자라면 '추가 충전 가능성' 을 적는다 — 금강", () => {
  assert.equal(reachableState(stop("geumgang"), input()), "ONE_STOP_LIKELY");
  assert.match(rank(DEMO_STOPS, input()).find((x) => x.stop.id === "geumgang")!.reason, /한 번 충전 예상 · 추가 충전 가능성/);
});

test("거울 - 공항 마중 왕복 104km · 60분 대기는 충전 없이 충분하고 공조 켜고 최대 185분 (−7°C 면 92분)", () => {
  const e = estimate(WAIT_PLAN, WAIT_VEHICLE);
  assert.equal(e.needsCharge, false);
  assert.equal(e.drivePct, 24.3);
  assert.equal(e.outboundPct, 12.1);
  assert.equal(e.returnPct, 12.1);
  assert.equal(e.arrivalPct, 28.2);
  assert.equal(e.maxWaitMinutes, 185);
  assert.equal(e.message, "현재 배터리로 60분 기다렸다 돌아오기까지 충분합니다 (귀가 시 예상 잔량 약 28%). 충전하지 않아도 됩니다.");
  assert.equal(estimate(WAIT_PLAN, { ...WAIT_VEHICLE, outsideTempC: -7 }).maxWaitMinutes, 92);
  const short = estimate(WAIT_PLAN, { ...WAIT_VEHICLE, batteryPct: 40, outsideTempC: -7 });
  assert.equal(short.needsCharge, true);
  assert.equal(short.maxWaitMinutes, 0);
  assert.match(short.message, /출발 전 충전을 권합니다\.$/);
});

test("실시간 재판단 - 외기 6°C → −7°C 면 '부족분 47% → 58% (+11%p)', 작은 변화(6→5°C)는 알리지 않는다", () => {
  const a = estimate(plan, v);
  assert.equal(rejudge(a, estimate(plan, { ...v, outsideTempC: -7 }))!.message, "재판단 · 부족분 47% → 58% (+11%p)");
  assert.equal(rejudge(a, estimate(plan, { ...v, outsideTempC: 5 })), null);
});

test("실시간 재판단 - 판정이 바뀌면 그렇게 말한다: 공항 마중 55%·1°C → 40%·−7°C 는 '충분 → 부족'", () => {
  const r = rejudge(estimate(WAIT_PLAN, WAIT_VEHICLE), estimate(WAIT_PLAN, { ...WAIT_VEHICLE, batteryPct: 40, outsideTempC: -7 }))!;
  assert.equal(r.from, "OK");
  assert.equal(r.to, "SHORT");
  assert.equal(r.message, "판단이 바뀌었습니다: 충분 → 부족 · 이제 약 10% 부족 (추정 7~13%)");
});

test("만약에 비교 - 김천에서 15분이면 아슬아슬(도착 약 22%), 80% 까지면 충분, 충전 없이면 부족", () => {
  const r = compareOptions(plan, v, [
    { label: "그대로", apply: (p, vv) => [p, vv] },
    { label: "15분", apply: (p, vv) => [p, { ...vv, batteryPct: vv.batteryPct + chargePctInMinutes(15, 350, vv.batteryKwh) }] },
    { label: "80%", apply: (p, vv) => [p, { ...vv, batteryPct: vv.batteryPct + (80 - 10.4) }] },
  ]);
  assert.deepEqual(r.map((x) => x.verdict), ["SHORT", "TIGHT", "OK"]);
  assert.equal(r[1].arrivalPct, 21.5);
});

test("거울 - N분 충전량: 350kW 15분 48.5% · 100kW 15분 26% · 상한 100%", () => {
  assert.equal(chargePctInMinutes(15, 350, 77), 48.5);
  assert.equal(chargePctInMinutes(15, 100, 77), 26);
  assert.equal(chargePctInMinutes(120, 350, 77), 100);
});

test("내비 도착 잔량이 있으면 가는 길은 그 값을 쓰고 오차를 ±5% 로 좁힌다 — 80%·150km·내비 48%", () => {
  const e = estimate({ ...plan, routeKm: 150, naviArrivalSocPct: 48 }, { ...v, batteryPct: 80 });
  assert.equal(e.drivePct, 32);
  assert.deepEqual(e.driveRange, [30.4, 33.6]);
  assert.equal(e.arrivalPct, 46.3);
  assert.equal(e.assumptions[0], "가는 길: 내비 도착 잔량 예측 48% 기준 (NaviHelper)");
});

test("왕복이면 오는 길을 내비/모델 비율로 보정한다 — 공항 마중, 내비 44% → 가는 길 11 · 오는 길 11 · 귀가 30.5%", () => {
  const e = estimate({ ...WAIT_PLAN, naviArrivalSocPct: 44 }, WAIT_VEHICLE);
  assert.equal(e.outboundPct, 11);
  assert.equal(e.returnPct, 11);
  assert.equal(e.arrivalPct, 30.5);
  assert.equal(e.maxWaitMinutes, 281);
});
