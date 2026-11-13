import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VEHICLE, WAIT_VEHICLE } from "../core/mock";
import { estimate } from "../core/energy";
import { planFor, PROFILE_PRESETS } from "./profile";
import { energyView } from "./energy-view";
import { energyFor, type WaitMode } from "./wait";
import { energyOptions, maxWaitWithoutCharge, planViaStop, WAIT_SEARCH_MAX_MIN, WAIT_STEP_MIN } from "./options";

/**
 * 에너지 의사결정의 **경계 조건** — core/ 의 BoundaryTest.kt 와 같은 입력·같은 기대값 (거울).
 *
 * 외부 평가(2026-10-27, docs/my-copilot/REVIEW-2026-10-27.md P0-3): "도착·왕복·대기·충전 후 상태의 단위 및 경계 조건 테스트".
 * 시나리오 테스트는 대표 입력만 지나간다. 여기는 끝값을 찍는다 — 거리 0 · 잔량이 정확히 최소 잔량 · 0%/100% 밖의 잔량 ·
 * 완충으로도 모자란 거리 · 공조 OFF · 대기 0 · 경유지가 남은 거리보다 먼 경우 · 내비 예측이 잔량보다 큰 경우.
 */
const family = planFor(PROFILE_PRESETS.FAMILY); // 서울→부산 400km · 대기 40분 · 최소 20%
const work = planFor(PROFILE_PRESETS.WORK); // 판교 왕복 38+38 · 대기 90분 · 최소 20%
const v = DEFAULT_VEHICLE; // 68% · 77kWh · 공조 ON · 6°C
const wv = WAIT_VEHICLE; // 55% · 1°C — 대기가 판정을 가르는 조건(experience 테스트와 같은 차)
const here = { ...family, routeKm: 0, waitMinutesAfterArrival: 0 };

test("거리 0 · 대기 0 — 도착 잔량은 지금 잔량 그대로, 잔량이 최소 잔량과 같으면 충분(모자람 0), 1% 아래면 부족", () => {
  for (const soc of [20, 50, 100]) {
    const view = energyView(energyFor(here, { ...v, batteryPct: soc }, "IN_CAR"), soc, 77, { minReservePct: 20 });
    assert.equal(view.arrivalSocPct, soc);
    assert.equal(view.requiredPctPoints, 0);
    assert.equal(view.status, "OK");
  }
  // 최소 잔량 경계: 20% 는 충분(= 0 모자람 · 범위 [0,0]) · 19% 는 범위 끝까지 모자라므로 부족
  const atReserve = energyFor(here, { ...v, batteryPct: 20 }, "IN_CAR");
  assert.deepEqual([atReserve.shortfallPct, atReserve.shortfallRange, atReserve.needsCharge], [0, [0, 0], false]);
  assert.equal(energyView(atReserve, 20, null).status, "OK");
  const below = energyFor(here, { ...v, batteryPct: 19 }, "IN_CAR");
  assert.equal(energyView(below, 19, null).status, "SHORT");
  assert.equal(energyView(below, 19, null).requiredPctPoints, 1);
});

test("잔량 0~100% 밖의 값은 화면에서 잘린다 · 음수 도착 잔량은 0 + '도착 전 소진'", () => {
  const e = energyFor(family, v, "IN_CAR");
  assert.equal(energyView(e, 120, null).currentSocPct, 100);
  assert.equal(energyView(e, -5, null).currentSocPct, 0);
  // 68% 로 400km 는 모자란다 — 엔진 arrivalPct 는 음수, 화면은 0 과 깃발
  const short = energyFor(family, { ...v, batteryPct: 30 }, "IN_CAR");
  assert.ok(short.arrivalPct < 0);
  const view = energyView(short, 30, null);
  assert.deepEqual([view.arrivalSocPct, view.depletesBeforeArrival, view.status], [0, true, "SHORT"]);
  // 모자라지 않으면 깃발 없음
  assert.equal(energyView(energyFor(here, v, "IN_CAR"), 68, null).depletesBeforeArrival, false);
});

test("완충(100%p)으로도 모자란 거리는 '완충해도 모자랄 수 있음' · kWh 는 용량을 알 때만 · 모자라지 않으면 kWh 없음", () => {
  const far = energyView(energyFor({ ...family, routeKm: 3000 }, v, "IN_CAR"), 68, 77);
  assert.ok(far.requiredPctPoints > 100);
  assert.equal(far.exceedsFullCharge, true);
  assert.match(far.detail, /완충해도 모자랄 수 있음/);
  // 단위: %p × 용량 ÷ 100 = kWh (소수 1자리)
  assert.equal(far.requiredKwh, Math.round(far.requiredPctPoints * 77 / 100 * 10) / 10);
  const near = energyView(energyFor(family, v, "IN_CAR"), 68, 77);
  assert.equal(near.exceedsFullCharge, false);
  assert.equal(near.requiredKwh, Math.round(near.requiredPctPoints * 77 / 100 * 10) / 10);
  assert.equal(energyView(energyFor(family, v, "IN_CAR"), 68, null).requiredKwh, null);
  assert.equal(energyView(energyFor(here, v, "IN_CAR"), 68, 77).requiredKwh, null);
});

test("대기 0분이면 차 안/차 밖은 같은 계산 · 공조 OFF 면 차 안 300분도 대기 소비 0 · 최대 대기 시간은 공조 ON 에만 있다", () => {
  const noWait = { ...work, waitMinutesAfterArrival: 0 };
  assert.deepEqual(energyFor(noWait, v, "IN_CAR"), energyFor(noWait, v, "AWAY"));
  const off = { ...v, hvacOn: false };
  const long = { ...work, waitMinutesAfterArrival: 300 };
  const inCar = energyFor(long, off, "IN_CAR");
  assert.equal(inCar.waitPct, 0);
  assert.equal(inCar.maxWaitMinutes, null);
  assert.ok(inCar.assumptions.some((a) => a.includes("공조 OFF → 대기 소비 0")));
  assert.equal(inCar.shortfallPct, energyFor(long, off, "AWAY").shortfallPct);
  const on = energyFor(long, v, "IN_CAR");
  assert.ok(on.waitPct > 0);
  assert.equal(typeof on.maxWaitMinutes, "number");
  assert.ok((on.maxWaitMinutes as number) >= 0);
});

test("경유지 충전 — 남은 거리보다 먼 경유지는 남은 거리 0 · 충전 후 잔량은 80% 아래로 내려가지 않고 더 높으면 그대로 · 내비 예측은 버린다", () => {
  const beyond = planViaStop(family, v, "IN_CAR", 1000);
  assert.equal(beyond.energy.drivePct, 0);
  assert.equal(beyond.soc, 80);
  const atStart = planViaStop(family, { ...v, batteryPct: 95 }, "IN_CAR", 0);
  assert.equal(atStart.soc, 95);
  for (const km of [0, 50, 250, 400, 1000]) {
    assert.ok(planViaStop(family, v, "IN_CAR", km).soc >= 80, `${km}km`);
  }
  const withNavi = planViaStop({ ...family, naviArrivalSocPct: 10 }, v, "IN_CAR", 250);
  assert.ok(!withNavi.energy.assumptions.some((a) => a.includes("내비")));
  assert.deepEqual(withNavi.energy, planViaStop(family, v, "IN_CAR", 250).energy);
});

test("대기 한계 — 5분 단위 · 한계에서는 충분, 한 칸 더 기다리면 아님 · 차 밖은 null · 대기 없이도 모자라면 -1 · 10시간 넘으면 600", () => {
  const limit = maxWaitWithoutCharge(work, wv, "IN_CAR") as number;
  assert.equal(limit % WAIT_STEP_MIN, 0);
  assert.ok(limit > 0 && limit < WAIT_SEARCH_MAX_MIN);
  const status = (w: number) => energyView(energyFor({ ...work, waitMinutesAfterArrival: w }, wv, "IN_CAR"), 55, null).status;
  assert.equal(status(limit), "OK");
  assert.notEqual(status(limit + WAIT_STEP_MIN), "OK");
  assert.equal(maxWaitWithoutCharge(work, wv, "AWAY"), null);
  // 68% · 6°C 면 10시간을 넘긴다 — 상한에서 멈춘다
  assert.equal(maxWaitWithoutCharge(work, v, "IN_CAR"), WAIT_SEARCH_MAX_MIN);
  assert.equal(maxWaitWithoutCharge(work, { ...v, batteryPct: 5 }, "IN_CAR"), -1);
  assert.equal(maxWaitWithoutCharge({ ...work, routeKm: 0, returnKm: 0 }, { ...v, batteryPct: 100, outsideTempC: 20 }, "IN_CAR"), WAIT_SEARCH_MAX_MIN);
});

test("왕복 — 오는 길 = 가는 길이면 주행 소비는 두 배(가는 길 = 오는 길) · 편도보다 도착 잔량이 낮다 · 최대 대기는 왕복 뒤 기준", () => {
  const oneWay = estimate({ ...work, returnKm: 0 }, v);
  const round = estimate(work, v);
  assert.equal(round.returnPct, round.outboundPct);
  // 소수 1자리로 반올림한 값끼리라 0.1 차이는 난다
  assert.ok(Math.abs(round.drivePct - 2 * oneWay.drivePct) <= 0.2);
  assert.ok(round.arrivalPct < oneWay.arrivalPct);
  assert.ok((round.maxWaitMinutes as number) < (oneWay.maxWaitMinutes as number));
  assert.ok(round.assumptions.some((a) => a.startsWith("왕복: 가는 길 38km + 오는 길 38km")));
});

test("내비 도착 예측 — 가는 길 소비 = 잔량 − 예측 · 예측이 잔량보다 크면 0 으로 자른다 · 오차는 ±5% 로 좁아진다", () => {
  const navi = estimate({ ...family, naviArrivalSocPct: 50 }, v);
  assert.equal(navi.outboundPct, 18);
  assert.ok(Math.abs((navi.driveRange[1] - navi.driveRange[0]) - navi.drivePct * 0.1) < 0.01);
  const over = estimate({ ...family, naviArrivalSocPct: 90 }, v);
  assert.equal(over.outboundPct, 0);
  assert.equal(over.drivePct, 0);
  const model = estimate(family, v);
  assert.ok(model.driveRange[1] - model.driveRange[0] > navi.driveRange[1] - navi.driveRange[0]);
});

test("최소 잔량 100% — 잔량 100 에 거리 0 이면 충분, 99 면 부족 · 최소 잔량 0 이면 잔량 0 에 거리 0 도 충분", () => {
  const all = { ...here, minReservePct: 100 };
  assert.equal(energyView(energyFor(all, { ...v, batteryPct: 100 }, "IN_CAR"), 100, null).status, "OK");
  assert.equal(energyView(energyFor(all, { ...v, batteryPct: 99 }, "IN_CAR"), 99, null).status, "SHORT");
  const none = { ...here, minReservePct: 0 };
  assert.equal(energyView(energyFor(none, { ...v, batteryPct: 0 }, "IN_CAR"), 0, null).status, "OK");
});

test("잔량이 늘면 판정은 나빠지지 않는다 — 5~100% · 편도/왕복 · 대기 유형", () => {
  const rank = { SHORT: 0, CAUTION: 1, OK: 2, UNKNOWN: -1 } as const;
  for (const plan of [family, work, { ...work, waitMinutesAfterArrival: 300 }]) {
    for (const mode of ["IN_CAR", "AWAY"] as WaitMode[]) {
      let prev = -1;
      for (let b = 5; b <= 100; b++) {
        const r = rank[energyView(energyFor(plan, { ...v, batteryPct: b }, mode), b, null).status];
        assert.ok(r >= prev, `${plan.destinationName} ${mode} ${b}%`);
        prev = r;
      }
    }
  }
});

test("선택지 — 충분이면 없음 · '그대로'는 기준 판정과 같다 · 30분 줄이기는 대기 30분 이상에만 · 차 밖 대기는 공조 ON 에만", () => {
  assert.deepEqual(energyOptions({ plan: work, v, waitMode: "IN_CAR", charge: null }), []);
  const long = { ...work, waitMinutesAfterArrival: 210 };
  const low = { ...v, batteryPct: 45 }; // experience 테스트의 "업무 대기 210분(차 안)은 주의" 조건
  const opts = energyOptions({ plan: long, v: low, waitMode: "IN_CAR", charge: null });
  assert.equal(opts[0].key, "AS_IS");
  assert.equal(opts[0].status, energyView(energyFor(long, low, "IN_CAR"), 45, null).status);
  assert.notEqual(opts[0].status, "OK");
  assert.deepEqual(opts.map((o) => o.key), ["AS_IS", "WAIT_AWAY", "WAIT_SHORTER"]);
  const short = { ...family, waitMinutesAfterArrival: 20 };
  assert.deepEqual(energyOptions({ plan: short, v: { ...v, hvacOn: false }, waitMode: "IN_CAR", charge: null }).map((o) => o.key), ["AS_IS"]);
  assert.deepEqual(energyOptions({ plan: short, v, waitMode: "AWAY", charge: { name: "김천휴게소", kmFromHere: 250 } }).map((o) => o.key), ["AS_IS", "CHARGE_AT"]);
});

test("차 안/차 밖 대기의 차이는 대기 소비뿐 — 주행·왕복 소비는 같고, 공조 OFF 면 둘이 같다 (외부 평가 6 ②)", () => {
  // 대표 1 의 '차 안에서 기다리기로' 장면과 같은 입력: 업무 왕복 · 대기 150분(90+60) · 공조 ON
  const p = { ...work, waitMinutesAfterArrival: 150 };
  const away = energyFor(p, v, "AWAY");
  const inCar = energyFor(p, v, "IN_CAR");
  assert.deepEqual([away.drivePct, away.outboundPct, away.returnPct], [inCar.drivePct, inCar.outboundPct, inCar.returnPct]);
  assert.equal(away.waitPct, 0);
  assert.ok(inCar.waitPct > 0);
  assert.ok(Math.abs(away.arrivalPct - inCar.arrivalPct - inCar.waitPct) < 0.15, "도착 잔량 차이 = 차 안 대기 소비 (소수 1자리 반올림)");
  // 공조가 꺼져 있으면 차 안 대기도 소비 0 → 두 추정이 같다
  const off = { ...v, hvacOn: false };
  assert.equal(energyFor(p, off, "IN_CAR").arrivalPct, energyFor(p, off, "AWAY").arrivalPct);
});
