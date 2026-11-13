import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VEHICLE } from "../core/mock";
import { availability, energyBasisOf, ENERGY_POWERTRAINS, freshnessOf, readiness, missingLine, POWERTRAINS, REQUIRED_SIGNALS, SIGNAL_LINK, type Freshness, type SignalKind } from "./freshness";
import { motionOf } from "./journey";
import { changedInputs, decideNotification, INITIAL_NOTIFICATION, rejudgeCause, rejudgeNote, type RejudgeInputs } from "./notify";
import { planFor, PROFILE_PRESETS } from "./profile";
import { energyFor } from "./wait";

/**
 * 입력별 유효성 · 재판단 원인 — core/ 의 ValidityTest.kt 와 같은 입력·같은 기대값 (거울).
 * 외부 평가 7(2026-10-27) A·B: 연결이 하나가 아니라 배터리만 돌아온 상태를 표현해야 하고, 기능별 필수 입력만 검사한다 ·
 * 여러 값이 함께 바뀐 재판단에 원인을 하나로 쓰지 않는다.
 */
const all = (f: Freshness): Record<SignalKind, Freshness> => ({ GEAR: f, UX: f, SPEED: f, SOC: f, HVAC: f, DOOR: f, ROUTE: f, PROFILE: "FRESH" });

test("기능별 필수 입력만 검사한다 — 도어가 모름이어도 에너지 판단은 되고, 배터리가 끊기기 전 값이면 보류한다", () => {
  assert.deepEqual(readiness("ENERGY", { ...all("FRESH"), DOOR: "UNKNOWN", HVAC: "STALE" }), { ok: true, missing: [] });
  assert.deepEqual(readiness("ENERGY", { ...all("FRESH"), SOC: "STALE" }), { ok: false, missing: ["SOC"] });
  assert.equal(missingLine(readiness("ENERGY", { ...all("FRESH"), SOC: "UNKNOWN" })), "부족한 정보: 배터리");
  // 주행 제한은 기어·주행 제한 둘 다 — 배터리만 돌아온 부분 복구에서는 보류(보수적)
  assert.deepEqual(readiness("DRIVE_RESTRICTION", { ...all("UNKNOWN"), SOC: "FRESH" }), { ok: false, missing: ["GEAR", "UX"] });
  assert.deepEqual(readiness("CLIMATE_PREPARE", { ...all("UNKNOWN"), SOC: "FRESH" }).missing, ["HVAC"]);
  assert.deepEqual(readiness("FINISH", all("UNKNOWN")), { ok: true, missing: [] });
  // 비어 있는 맵 = 전부 모름
  assert.equal(readiness("ENERGY", {}).ok, false);
  // 필수 목록이 연결을 가로지른다 — 에너지는 ENERGY 연결, 주행 제한은 DRIVE 연결
  assert.deepEqual(REQUIRED_SIGNALS.ENERGY.map((k) => SIGNAL_LINK[k]), ["ENERGY"]);
  assert.deepEqual(REQUIRED_SIGNALS.DRIVE_RESTRICTION.map((k) => SIGNAL_LINK[k]), ["DRIVE", "DRIVE"]);
});

test("재판단 원인 — 하나면 그것, 여럿이면 하나로 단정하지 않는다", () => {
  assert.deepEqual(rejudgeCause(["WAIT_MODE"]), { text: "대기 유형 변경 · 대기 중 공조 소비 차이", single: true });
  assert.deepEqual(rejudgeCause(["BATTERY"]), { text: "배터리 잔량 변경 · 지금 보유 에너지 차이", single: true });
  assert.deepEqual(rejudgeCause(["DISTANCE", "OUTSIDE_TEMP", "HVAC"]), { text: "여러 값이 함께 바뀜(남은 거리 · 외기온 · 공조 ON/OFF) — 원인을 하나로 말하지 않음", single: false });
  assert.equal(rejudgeCause(["BATTERY", "BATTERY"]).single, true);
  assert.equal(rejudgeCause([]).single, true);
});

test("끊길 때 찍어 둔 입력과 복구 때 입력의 차이 — J 시나리오(60km 더 달림 · 외기 −7°C · 히터)는 넷이 함께 바뀐다", () => {
  const before: RejudgeInputs = { batteryPct: 60, outsideTempC: 6, hvacOn: false, remainingKm: 300, waitMinutes: 40, waitMode: "IN_CAR" };
  const after: RejudgeInputs = { ...before, batteryPct: 49, outsideTempC: -7, hvacOn: true, remainingKm: 240 };
  assert.deepEqual(changedInputs(before, after), ["BATTERY", "DISTANCE", "OUTSIDE_TEMP", "HVAC"]);
  assert.deepEqual(changedInputs(before, before), []);
  // 0.5 미만의 흔들림은 변화로 보지 않는다(반올림 잡음)
  assert.deepEqual(changedInputs(before, { ...before, batteryPct: 60.3, remainingKm: 300.2 }), []);
});

test("재판단 메모 — 대표 1 의 '차 안에서 기다리기로': 전 50% → 후 44%, 원인은 대기 유형 하나", () => {
  // 고객사에 도착한 상태(가는 길 38km 를 달려 59%), 대기 150분 · 귀가 38km
  const work = planFor(PROFILE_PRESETS.WORK);
  const atClient = { ...work, routeKm: 0, waitMinutesAfterArrival: 150 };
  const v = { ...DEFAULT_VEHICLE, batteryPct: 59 };
  const base = decideNotification(INITIAL_NOTIFICATION, energyFor(atClient, v, "AWAY")).state;
  const d = decideNotification(base, energyFor(atClient, v, "IN_CAR"));
  const note = rejudgeNote(d, v.batteryPct, "차를 두고 다녀옴", "차 안에서 기다림 · 공조 사용 가정", rejudgeCause(["WAIT_MODE"]), "08:28");
  assert.deepEqual(note, { fromLabel: "차를 두고 다녀옴", fromPct: 50, toLabel: "차 안에서 기다림 · 공조 사용 가정", toPct: 44, why: "대기 유형 변경 · 대기 중 공조 소비 차이", single: true, clock: "08:28" });
  // 알릴 만한 변화가 아니면 메모도 없다(3%p 미만)
  const small = decideNotification(base, energyFor(atClient, { ...v, batteryPct: 58 }, "AWAY"));
  assert.equal(rejudgeNote(small, 58, "a", "b", rejudgeCause(["BATTERY"]), "08:30"), null);
});

test("연결 · 신호 유효성 · 판단 가능성은 따로다 — 연결이 살아 있어도 조회 실패(onFailed)·받은 적 없음이면 모름 (외부 평가 8 ①)", () => {
  assert.equal(freshnessOf("SOC", 100, 100, true, "OK"), "FRESH");
  assert.equal(freshnessOf("SOC", 100, 100, true, "ERROR"), "UNKNOWN");
  assert.equal(freshnessOf("SOC", 100, 100, true, "NONE"), "UNKNOWN");
  assert.equal(freshnessOf("GEAR", 100, 100, true, "ERROR"), "UNKNOWN");
  assert.equal(freshnessOf("PROFILE", null, 0, false, "ERROR"), "FRESH");
  // 연결은 살아 있는데 배터리만 조회 실패 → 에너지는 보류, 주행 제한은 그대로 판단
  const f = { ...all("FRESH"), SOC: freshnessOf("SOC", 100, 100, true, "ERROR") };
  assert.deepEqual(readiness("ENERGY", f), { ok: false, missing: ["SOC"] });
  assert.equal(readiness("DRIVE_RESTRICTION", f).ok, true);
});

test("에너지 근거 등급 — 내비 경로 기반 · 입력 계획 기반 · 경로 없음 · 배터리 없음을 같은 정확도처럼 보이지 않는다 (외부 평가 8 ②)", () => {
  assert.equal(energyBasisOf(all("FRESH"), true), "NAVI_ROUTE");
  assert.equal(energyBasisOf({ ...all("FRESH"), ROUTE: "UNKNOWN" }, true), "USER_PLAN");
  assert.equal(energyBasisOf({ ...all("FRESH"), ROUTE: "STALE" }, true), "USER_PLAN"); // 오래된 내비 경로는 내비 기반이라 하지 않는다
  assert.equal(energyBasisOf({ ...all("FRESH"), ROUTE: "UNKNOWN" }, false), "NO_ROUTE");
  assert.equal(energyBasisOf({ ...all("FRESH"), SOC: "STALE" }, true), "NO_BATTERY");
  assert.equal(energyBasisOf({ ...all("FRESH"), SOC: "UNKNOWN", ROUTE: "FRESH" }, true), "NO_BATTERY"); // 배터리가 먼저다
});

test("신호가 서로 어긋나면 단계를 단정하지 않는다 — P 인데 달린다 · 주차 브레이크인데 달린다 → 모름 (외부 평가 8 ③)", () => {
  const sig = (o: Partial<Parameters<typeof motionOf>[0]>) => motionOf({ gear: "DRIVE", parkingBrake: false, speedKmh: 0, uxRestricted: null, remainingKm: 50, ...o });
  assert.deepEqual(sig({ gear: "PARK", speedKmh: 40 }), { kind: "UNKNOWN", confidence: "UNKNOWN" });
  assert.deepEqual(sig({ parkingBrake: true, speedKmh: 40 }), { kind: "UNKNOWN", confidence: "UNKNOWN" });
  // 잡음(3km/h 이하)은 어긋남이 아니다 · 속도를 모르면 기어를 믿는다
  assert.deepEqual(sig({ gear: "PARK", speedKmh: 2 }), { kind: "PARKED", confidence: "CONFIRMED" });
  assert.deepEqual(sig({ gear: "PARK", speedKmh: null }), { kind: "PARKED", confidence: "CONFIRMED" });
  assert.deepEqual(sig({ gear: "DRIVE", speedKmh: 40 }), { kind: "MOVING", confidence: "CONFIRMED" });
});

test("동력원별 가용성 — 전체 차량 대상이지만 에너지 판단은 EV 만, 나머지는 끄고 이유를 적는다 · 공통 기능은 그대로 (오너 결정 2026-10-28)", () => {
  assert.deepEqual(availability("ENERGY", { powertrain: "EV" }), { ok: true, reason: null, line: null });
  assert.deepEqual(availability("ENERGY", { powertrain: "ICE" }), { ok: false, reason: "POWERTRAIN", line: "내연기관 연료 계산은 아직 지원하지 않음 · 공식 SDK 데이터 확인 전" });
  assert.equal(availability("ENERGY", { powertrain: "PHEV" }).line, "플러그인 하이브리드 연료 계산은 아직 지원하지 않음 · 공식 SDK 데이터 확인 전"); // 배터리가 있어도 EV 엔진을 쓰지 않는다
  assert.equal(availability("ENERGY", { powertrain: "HEV" }).reason, "POWERTRAIN");
  assert.deepEqual(availability("ENERGY", { powertrain: "UNKNOWN" }), { ok: false, reason: "POWERTRAIN", line: "에너지 판단 보류 · 차량 유형 확인 전" });
  // 공통 기능은 동력원과 무관
  for (const p of POWERTRAINS) for (const f of ["CLIMATE_PREPARE", "DRIVE_RESTRICTION", "FINISH"] as const) assert.equal(availability(f, { powertrain: p }).ok, true, `${p} ${f}`);
  // 차량 지원·권한 — 그 기능만, 이유 순서는 동력원 → 지원 → 권한
  assert.deepEqual(availability("CLIMATE_PREPARE", { powertrain: "ICE", supported: { CLIMATE_PREPARE: false } }), { ok: false, reason: "NOT_SUPPORTED", line: "출발 준비 공조 · 이 차량이 지원하지 않는 기능" });
  assert.deepEqual(availability("ENERGY", { powertrain: "EV", granted: { ENERGY: false } }), { ok: false, reason: "NO_PERMISSION", line: "에너지 판단 · 차량 데이터 권한 없음" });
  assert.equal(availability("ENERGY", { powertrain: "ICE", granted: { ENERGY: false } }).reason, "POWERTRAIN");
  assert.equal(availability("ENERGY", { powertrain: "EV", supported: { ENERGY: false }, granted: { ENERGY: false } }).reason, "NOT_SUPPORTED");
  assert.deepEqual(ENERGY_POWERTRAINS, ["EV"]);
});
