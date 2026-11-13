import { test } from "node:test";
import assert from "node:assert/strict";
import { CABIN_NOW_UNKNOWN, NO_CABIN_PREFS, planCabin, settleCabin, withMemory, type CabinNow, type CabinPrefs, type CabinSupport } from "./cabin";
import { newMemory, migrateVault, rememberMode, emptyVault } from "./memory";
import { cabinPrefsOf, migrateProfile, migrateProfiles, PROFILE_PRESETS, CONTEXT_OF, CONTEXT_MODES } from "./profile";

/**
 * Smart Cabin Prepare · Personal Cabin Memory — core/ 의 CabinTest.kt 와 같은 입력·같은 기대값 (거울).
 * 오너 지시(2026-10-28) 3절: 같은 설정은 안 건드림 · 지원 안 되는 항목 때문에 전체가 실패하지 않음 · 제어 가능한 것만 승인 하나로 ·
 * 적용 결과는 항목마다 독립 · 확인 전에는 '적용 완료'라 하지 않음 · 취향 없으면 유지 · 음악은 기억만.
 */
const prefs: CabinPrefs = { ...NO_CABIN_PREFS, hvacTempC: 22, seatVent: true, lighting: "CALM", music: "나만의 드라이브 플레이리스트", guidance: "QUIET" };
const now: CabinNow = { hvacTempC: 25, hvacOn: true, seatVent: false, seatHeat: false, steeringHeat: false, lighting: null };
const ok = { supported: true, controllable: true };
const support: CabinSupport = { HVAC_TEMP: ok, HVAC_POWER: ok, SEAT_VENT: ok, SEAT_HEAT: ok, STEERING_HEAT: { supported: true, controllable: null }, LIGHTING: { supported: null, controllable: null } };

test("모드 선택 뒤 비교 — 다른 것만 적용 후보, 취향 없는 항목은 유지, 조명은 값을 못 읽어 직접, 음악은 기억만", () => {
  const p = planCabin(prefs, now, support, false, "혼자");
  const d = Object.fromEntries(p.items.map((x) => [x.key, x.decision]));
  assert.deepEqual(d, { HVAC_TEMP: "APPLY", HVAC_POWER: "NO_PREF", SEAT_VENT: "APPLY", SEAT_HEAT: "NO_PREF", STEERING_HEAT: "NO_PREF", LIGHTING: "UNKNOWN_STATE", MUSIC: "REMEMBER_ONLY" });
  assert.deepEqual(p.toApply, ["HVAC_TEMP", "SEAT_VENT"]);
  assert.deepEqual(p.manual, ["LIGHTING"]);
  assert.equal(p.nothingToDo, false);
  assert.equal(p.summary, "저장된 취향과 비교해 변경할 설정이 2개 있습니다 · 실내 조명은 차량에서 직접");
  assert.equal(p.items[0].line, "공조 온도 25°C → 22°C");
  assert.equal(p.items[6].line, "음악 · 나만의 드라이브 플레이리스트 기억 · 자동 재생은 연동 확인 전 · 듣던 음악 그대로");
});

test("이미 맞는 설정은 변경 요청을 만들지 않는다 — 전부 맞으면 묻지 않는다(완료 기준 3·6)", () => {
  const p = planCabin({ ...prefs, lighting: null, music: null }, { ...now, hvacTempC: 22.4, seatVent: true }, support, false, "혼자");
  assert.deepEqual(p.toApply, []);
  assert.equal(p.nothingToDo, true);
  assert.equal(p.summary, "혼자 이동 준비를 확인했어요 · 저장한 취향과 모두 맞습니다");
  assert.equal(p.items[0].line, "공조 온도 22°C · 이미 맞음");
});

test("저장 취향이 없으면 임의 취향을 만들지 않는다 — 차량 설정 그대로", () => {
  const p = planCabin(NO_CABIN_PREFS, now, support, false, "가족");
  assert.equal(p.items.every((x) => x.decision === "NO_PREF" || x.key === "MUSIC"), true);
  assert.equal(p.items[6].decision, "NO_PREF");
  assert.equal(p.nothingToDo, true);
  assert.equal(p.summary, "가족 이동 · 저장한 취향이 없어 지금 설정 그대로 갑니다");
});

test("지원하지 않거나 권한이 없는 항목은 그 항목만 빠진다 — 전체 준비가 실패하지 않는다", () => {
  const p = planCabin(prefs, now, { ...support, SEAT_VENT: { supported: false, controllable: null } }, false, "혼자");
  assert.equal(p.items[2].decision, "UNSUPPORTED");
  assert.deepEqual(p.toApply, ["HVAC_TEMP"]);
  const q = planCabin(prefs, now, { ...support, HVAC_TEMP: { supported: true, controllable: false } }, false, "혼자");
  assert.equal(q.items[0].decision, "NO_PERMISSION");
  assert.equal(q.items[0].line, "공조 온도 25°C → 22°C · 제어 권한 없음 · 차량에서 직접");
  assert.deepEqual(q.toApply, ["SEAT_VENT"]);
  // 지원 여부를 모르면(null) 제어하지 않는다 — "지원 확인 전"
  const r = planCabin({ ...NO_CABIN_PREFS, steeringHeat: true }, { ...now, steeringHeat: false }, support, false, "혼자");
  assert.equal(r.items[4].decision, "NO_PERMISSION");
  assert.match(r.items[4].line, /제어 권한 없음|지원 확인 전/);
});

test("차량 정보를 못 읽으면 적용된 것으로 단정하지 않는다 — 값 모름은 직접 확인", () => {
  const p = planCabin(prefs, CABIN_NOW_UNKNOWN, support, false, "혼자");
  assert.deepEqual(p.toApply, []);
  assert.deepEqual(p.manual, ["HVAC_TEMP", "SEAT_VENT", "LIGHTING"]);
  assert.equal(p.summary, "앱에서 바꿀 수 있는 설정은 없습니다 · 공조 온도·통풍시트·실내 조명은 차량에서 직접");
});

test("주행 중에는 묶지 않는다 — 정차하면 제안", () => {
  const p = planCabin(prefs, now, support, true, "혼자");
  assert.deepEqual(p.toApply, []);
  assert.equal(p.items[0].decision, "RESTRICTED");
  assert.equal(p.summary, "정차하면 2개를 맞추자고 제안합니다 · 실내 조명은 차량에서 직접");
});

test("일괄 적용 결과는 항목마다 독립 — 일부 실패해도 성공한 것만 적용 확인, 응답 없음은 확인 못 함", () => {
  const s = settleCabin(["HVAC_TEMP", "SEAT_VENT"], { HVAC_TEMP: { kind: "CALLBACK", matched: true }, SEAT_VENT: { kind: "ERROR", reason: "차량이 요청을 거절했습니다" } }, "MOCK");
  assert.deepEqual(s.applied, ["HVAC_TEMP"]);
  assert.equal(s.allApplied, false);
  assert.equal(s.summary, "2개 중 1개 적용(모의) · 1개 거절");
  assert.deepEqual(s.results.map((r) => r.status), ["APPLIED", "REJECTED"]);
  const t = settleCabin(["HVAC_TEMP", "SEAT_VENT"], { HVAC_TEMP: { kind: "TIMEOUT" } }, "VEHICLE");
  assert.deepEqual(t.results.map((r) => r.status), ["UNVERIFIED", "UNVERIFIED"]);
  assert.equal(t.summary, "2개 중 0개 적용 · 2개 확인 못 함");
  const m = settleCabin(["HVAC_TEMP"], { HVAC_TEMP: { kind: "CALLBACK", matched: false } }, "MOCK");
  assert.equal(m.results[0].status, "MISMATCH");
  const all = settleCabin(["HVAC_TEMP", "SEAT_VENT"], { HVAC_TEMP: { kind: "CALLBACK", matched: true }, SEAT_VENT: { kind: "CALLBACK", matched: true } }, "MOCK");
  assert.equal(all.allApplied, true);
  assert.equal(all.summary, "2개 중 2개 적용(모의)");
});

test("이번 이동에서 공조를 이미 결정했으면 다시 묻지 않는다 — Journey Memory 가 근거", () => {
  const m = { ...newMemory(1, "SOLO"), climate: { decision: "KEPT" as const, valueC: 25 } };
  const p = withMemory(planCabin(prefs, now, support, false, "혼자"), m);
  assert.equal(p.items[0].decision, "SAME");
  assert.equal(p.items[0].line, "공조 온도 25°C · 이번 이동에서는 그대로 두기로 함");
  assert.deepEqual(p.toApply, ["SEAT_VENT"]);
  assert.equal(p.summary, "저장된 취향과 비교해 변경할 설정이 1개 있습니다");
});

test("프로필 호환 — 옛 저장소(실내 취향 · 동승자 칸 없음)를 버리지 않고, 없는 취향은 유지(null)로 둔다", () => {
  const old = { mode: "WORK" as const, name: "내 업무", targetC: 20, packing: ["사원증"] };
  const p = migrateProfile(old);
  assert.equal(p.name, "내 업무");
  assert.equal(p.targetC, 20);
  assert.deepEqual(p.packing, ["사원증"]);
  assert.deepEqual(p.cabin, NO_CABIN_PREFS);
  assert.deepEqual(cabinPrefsOf(p), { ...NO_CABIN_PREFS, hvacTempC: 20 });
  const all = migrateProfiles({ WORK: old });
  assert.equal(all.WORK.name, "내 업무");
  assert.deepEqual(all.COMPANION, PROFILE_PRESETS.COMPANION);
  assert.equal(all.SOLO.cabin.lighting, "CALM"); // 운전석(통풍)은 운전자 취향이라 조합 프리셋에 없다
  const v = migrateVault({ activity: { SOLO: [{ clock: "08:00", kind: "STATE", text: "x", tripId: 1 }] } as never });
  assert.equal(v.activity.SOLO.length, 1);
  assert.deepEqual(v.activity.COMPANION, []);
  assert.equal(v.nextTripId.COMPANION, 1);
  assert.equal(v.lastMode, null);
  assert.equal(rememberMode(emptyVault(), "GUEST").lastMode, null);
  assert.equal(rememberMode(emptyVault(), "COMPANION").lastMode, "COMPANION");
});

test("탑승 조합 셋 — 혼자(평소·업무일) · 가족 · 동승자(아내와 둘이). 프로필 없이는 맥락이 아니다", () => {
  // 가족 맥락의 둘째 조합 = 픽업 후 귀가(V5 Mission C, 2026-11-02)
  assert.deepEqual(CONTEXT_MODES, { SOLO: ["SOLO", "WORK"], FAMILY: ["FAMILY", "PICKUP"], COMPANION: ["COMPANION"] });
  assert.equal(CONTEXT_OF.WORK, "SOLO");
  assert.equal(CONTEXT_OF.GUEST, null);
  assert.equal(PROFILE_PRESETS.COMPANION.passengers.length, 0);
  assert.equal(PROFILE_PRESETS.SOLO.cabin.guidance, "QUIET");
});
