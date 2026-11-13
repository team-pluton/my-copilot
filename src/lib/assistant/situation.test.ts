import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_CABIN_PREFS, planCabin, type CabinSupport } from "./cabin";
import { accept, candidates, changeSubject, decline, EMPTY_LEARNING, LEARN_MIN_TRIPS, learnKey, observe, realEvidence, storeCandidate, withPref, type LearnCtx } from "./learning";
import { emptyVault, migrateVault, rememberDriver } from "./memory";
import { climateGapOf, climateGapOfTarget, PROFILE_PRESETS } from "./profile";
import { combinedPrefs, DEMO_DRIVERS, DRIVER_RECOGNITION, seatMemoLine, situationLabel, CABIN_OWNER, soloKey } from "./situation";

/**
 * DRIVER × OCCUPANCY × JOURNEY · 학습 후보 — core/ 의 SituationTest.kt 와 같은 입력·같은 기대값 (거울). 오너 후속 지시 2026-10-28.
 */
const ok = { supported: true, controllable: true };
const support: CabinSupport = { HVAC_TEMP: ok, HVAC_POWER: ok, SEAT_VENT: ok, SEAT_HEAT: ok, STEERING_HEAT: { supported: null, controllable: null }, LIGHTING: { supported: null, controllable: null } };
const now = { hvacTempC: 25, hvacOn: true, seatVent: false, seatHeat: false, steeringHeat: false, lighting: null };
const dad = DEMO_DRIVERS.dad, mom = DEMO_DRIVERS.mom;

test("아빠 + 가족 / 엄마 + 가족 — 운전석은 운전자마다 다르고, 가족의 공조·음악은 같다", () => {
  const fam = PROFILE_PRESETS.FAMILY;
  const a = combinedPrefs(fam, dad), m = combinedPrefs(fam, mom);
  assert.equal(a.hvacTempC, m.hvacTempC); assert.equal(a.music, m.music); assert.equal(a.lighting, m.lighting); assert.equal(a.guidance, m.guidance);
  assert.deepEqual([a.seatVent, a.seatHeat, a.steeringHeat], [true, null, null]);
  assert.deepEqual([m.seatVent, m.seatHeat, m.steeringHeat], [null, true, true]);
  assert.deepEqual(planCabin(a, now, support, false, "가족").toApply, ["HVAC_TEMP", "SEAT_VENT"]);
  assert.deepEqual(planCabin(m, now, support, false, "가족").toApply, ["HVAC_TEMP", "SEAT_HEAT"]); // 핸들 열선은 지원 확인 전 → 직접
  assert.equal(situationLabel(fam, dad), "아빠 · 가족 · 여행");
  assert.equal(situationLabel(PROFILE_PRESETS.WORK, mom), "엄마 · 혼자 · 업무 방문");
  assert.equal(situationLabel(PROFILE_PRESETS.COMPANION, dad), "아빠 · 부부 · 외출");
});

test("운전자 미확인이면 운전석 항목은 유지 — 이전 운전자의 시트 설정을 적용하지 않는다 · 인식은 수동", () => {
  const p = combinedPrefs(PROFILE_PRESETS.SOLO, null);
  assert.deepEqual([p.seatVent, p.seatHeat, p.steeringHeat], [null, null, null]);
  assert.equal(p.hvacTempC, 22);
  assert.equal(situationLabel(PROFILE_PRESETS.SOLO, null), "운전자 미확인 · 혼자 · 출퇴근");
  assert.equal(seatMemoLine(null), "운전자 미확인 · 운전석 설정은 차량 프로필 그대로");
  assert.equal(seatMemoLine(dad), "아빠 · 운전석 메모리 1 (차량 운전자 프로필 · 앱은 바꾸지 않음)");
  assert.equal(DRIVER_RECOGNITION, "MANUAL");
  assert.equal(CABIN_OWNER.SEAT_VENT, "DRIVER"); assert.equal(CABIN_OWNER.MUSIC, "OCCUPANCY");
  assert.equal(rememberDriver(emptyVault(), "mom").lastDriver, "mom");
  assert.equal(migrateVault({}).drivers.dad.name, "아빠");
});

test("학습 후보 — 다른 이동 3번 같은 값이어야 묻는다 · 일회성은 아니다 · 한 번만 · 거절한 값은 다시 안 묻는다", () => {
  const ctx: LearnCtx = { driver: "dad", mode: "SOLO" };
  const cur = combinedPrefs(PROFILE_PRESETS.SOLO, dad); // 22°C
  let st = observe(EMPTY_LEARNING, ctx, "HVAC_TEMP", 24, 1, "VEHICLE");
  assert.deepEqual(candidates(st, ctx, cur, "혼자"), []); // 일회성
  st = observe(st, ctx, "HVAC_TEMP", 24, 1, "VEHICLE"); // 같은 이동은 두 번 세지 않는다
  st = observe(st, ctx, "HVAC_TEMP", 24, 2, "VEHICLE");
  assert.deepEqual(candidates(st, ctx, cur, "혼자"), []);
  st = observe(st, ctx, "HVAC_TEMP", 24.3, 3, "VEHICLE"); // 0.5°C 안은 같은 값
  const c = candidates(st, ctx, cur, "혼자");
  assert.equal(c.length, 1);
  assert.equal(c[0].trips, LEARN_MIN_TRIPS);
  assert.equal(c[0].line, "최근 3번 이동에서 혼자일 때 공조 온도가 24°C였어요 — 탑승 조합 취향으로 저장할까요?");
  // 값이 흔들리면 처음부터 — 25 로 바꾸면 후보가 사라진다
  const wobble = observe(st, ctx, "HVAC_TEMP", 25, 4, "VEHICLE");
  assert.deepEqual(candidates(wobble, ctx, cur, "혼자"), []);
  // 저장 → 취향이 되고 기록은 비운다 · 같은 값이라 더 묻지 않는다
  const saved = withPref(cur, "HVAC_TEMP", c[0].value);
  assert.equal(saved.hvacTempC, 24);
  assert.deepEqual(candidates(accept(st, ctx, "HVAC_TEMP"), ctx, saved, "혼자"), []);
  // 거절 → 그 값은 다시 안 묻는다. 다른 값이 3번이면 새 후보
  let d = decline(st, ctx, "HVAC_TEMP", 24);
  for (const t of [5, 6, 7]) d = observe(d, ctx, "HVAC_TEMP", 24, t, "VEHICLE");
  assert.deepEqual(candidates(d, ctx, cur, "혼자"), []);
  for (const t of [8, 9, 10]) d = observe(d, ctx, "HVAC_TEMP", 20, t, "VEHICLE");
  assert.equal(candidates(d, ctx, cur, "혼자")[0]?.value, 20);
});

test("학습하지 않는 것 — 받은 적 없음 · 앱이 스스로 바꾼 값 · 운전자 미확인 · 이동 번호 없음 · 음악/조명", () => {
  const ctx: LearnCtx = { driver: "dad", mode: "SOLO" };
  let st = EMPTY_LEARNING;
  for (const t of [1, 2, 3]) { st = observe(st, ctx, "SEAT_VENT", true, t, "APP"); st = observe(st, ctx, "SEAT_VENT", true, t, "NONE"); }
  assert.deepEqual(st, EMPTY_LEARNING);
  for (const t of [1, 2, 3]) st = observe(st, { driver: null, mode: "SOLO" }, "SEAT_VENT", true, t, "VEHICLE");
  assert.deepEqual(st, EMPTY_LEARNING);
  assert.deepEqual(observe(st, ctx, "SEAT_VENT", true, 0, "VEHICLE"), EMPTY_LEARNING);
  for (const t of [1, 2, 3]) st = observe(st, ctx, "LIGHTING", "CALM", t, "VEHICLE");
  assert.deepEqual(st, EMPTY_LEARNING);
  // 운전자 취향(시트)은 운전자에게, 탑승 조합(공조)은 조합에게 — 주인이 다르다
  let s2 = EMPTY_LEARNING;
  for (const t of [1, 2, 3]) s2 = observe(s2, ctx, "SEAT_HEAT", true, t, "VEHICLE");
  const c = candidates(s2, ctx, { ...NO_CABIN_PREFS, hvacTempC: 22 }, "혼자");
  assert.equal(c[0].owner, "DRIVER");
  assert.equal(withPref(dad.prefs, "SEAT_HEAT", true).seatHeat, true);
  // 엄마 × 혼자는 아빠 × 혼자와 다른 기록이다
  assert.deepEqual(candidates(s2, { driver: "mom", mode: "SOLO" }, NO_CABIN_PREFS, "혼자"), []);
});

test("프로필 없이(GUEST)는 개인 선호가 없다 — 운전자를 골랐어도 운전석 취향을 쓰지 않는다", () => {
  const p = combinedPrefs(PROFILE_PRESETS.GUEST, dad);
  assert.deepEqual([p.seatVent, p.seatHeat, p.steeringHeat, p.hvacTempC], [null, null, null, null]);
});

test("귀속 — 변경 주체는 SDK 가 모른다: 운전석 항목은 혼자 탈 때만 운전자에게 · 가족 공조는 운전자와 무관하게 가족에게 · 혼자 공조는 운전자 × 혼자", () => {
  const dadFam: LearnCtx = { driver: "dad", mode: "FAMILY" }, momFam: LearnCtx = { driver: "mom", mode: "FAMILY" }, dadSolo: LearnCtx = { driver: "dad", mode: "SOLO" };
  assert.equal(changeSubject(dadSolo), "DRIVER_ASSUMED"); // 추정 — 확정 아님 assert.equal(changeSubject(dadFam), "UNKNOWN"); assert.equal(changeSubject({ driver: null, mode: "SOLO" }), "UNKNOWN");
  assert.equal(learnKey(dadFam, "SEAT_VENT"), "D|dad"); assert.equal(learnKey(dadFam, "HVAC_TEMP"), "O|FAMILY"); assert.equal(learnKey(momFam, "HVAC_TEMP"), "O|FAMILY"); assert.equal(learnKey(dadSolo, "HVAC_TEMP"), "O|SOLO|dad");
  // 엄마가 운전하고 아빠가 조수석에서 열선시트를 켰을 수 있다 — 가족 탑승 중의 운전석 변경은 운전자 취향으로 귀속하지 않는다(기록 없음)
  let st = EMPTY_LEARNING;
  for (const t of [1, 2, 3]) st = observe(st, momFam, "SEAT_HEAT", true, t, "VEHICLE");
  assert.deepEqual(st, EMPTY_LEARNING);
  // 가족 공조는 누가 돌렸든 "가족 이동에서 쓰인 값" — 아빠가 운전한 두 번 + 엄마가 운전한 한 번이 같은 가족 기록이다. 저장은 사용자 확인 뒤(후보)
  st = observe(st, dadFam, "HVAC_TEMP", 24, 1, "VEHICLE"); st = observe(st, dadFam, "HVAC_TEMP", 24, 2, "VEHICLE"); st = observe(st, momFam, "HVAC_TEMP", 24, 3, "VEHICLE");
  const fam = combinedPrefs(PROFILE_PRESETS.FAMILY, mom);
  const c = candidates(st, momFam, fam, "가족");
  assert.equal(c.length, 1); assert.equal(c[0].owner, "OCCUPANCY"); assert.equal(c[0].evidence, "VEHICLE");
  assert.equal(c[0].line, "최근 3번 이동에서 가족일 때 공조 온도가 24°C였어요 — 탑승 조합 취향으로 저장할까요?");
  // 혼자 공조는 운전자 × 혼자 — 아빠의 혼자 기록이 엄마의 혼자에 나타나지 않는다
  let so = EMPTY_LEARNING;
  for (const t of [1, 2, 3]) so = observe(so, dadSolo, "HVAC_TEMP", 24, t, "VEHICLE");
  assert.equal(candidates(so, dadSolo, combinedPrefs(PROFILE_PRESETS.SOLO, dad), "혼자").length, 1);
  assert.deepEqual(candidates(so, { driver: "mom", mode: "SOLO" }, combinedPrefs(PROFILE_PRESETS.SOLO, mom), "혼자"), []);
  // 혼자 탈 때의 운전석 변경은 운전자에게 — 저장하면 어느 조합에서도 아빠 것
  let dr = EMPTY_LEARNING;
  for (const t of [1, 2, 3]) dr = observe(dr, dadSolo, "SEAT_HEAT", true, t, "VEHICLE");
  assert.equal(candidates(dr, dadFam, combinedPrefs(PROFILE_PRESETS.FAMILY, dad), "가족")[0]?.line, "최근 3번 이동에서 가족일 때 열선시트가 켜져 있었어요 — 운전자 취향으로 저장할까요?");
});

test("증거 등급 — 모의(MOCK)는 기록되지만 실차 증거가 아니다: 문장에 '시연 데이터' · 집계 0 · VEHICLE 과 섞이지 않는다", () => {
  const ctx: LearnCtx = { driver: "dad", mode: "SOLO" };
  const cur = combinedPrefs(PROFILE_PRESETS.SOLO, dad);
  let st = EMPTY_LEARNING;
  for (const t of [1, 2, 3]) st = observe(st, ctx, "HVAC_TEMP", 24, t, "MOCK");
  const c = candidates(st, ctx, cur, "혼자");
  assert.equal(c[0].evidence, "MOCK");
  assert.equal(c[0].line, "시연 데이터 · 최근 3번 이동에서 혼자일 때 공조 온도가 24°C였어요 — 탑승 조합 취향으로 저장할까요?");
  assert.deepEqual(realEvidence(st), { records: 0, trips: 0 });
  // 실차 콜백이 오면 모의 기록은 버리고 처음부터 — 모의 2번 + 실차 1번은 3번이 아니다
  let mixed = observe(observe(EMPTY_LEARNING, ctx, "HVAC_TEMP", 24, 1, "MOCK"), ctx, "HVAC_TEMP", 24, 2, "MOCK");
  mixed = observe(mixed, ctx, "HVAC_TEMP", 24, 3, "VEHICLE");
  assert.deepEqual(candidates(mixed, ctx, cur, "혼자"), []);
  assert.deepEqual(realEvidence(mixed), { records: 1, trips: 1 });
  // 실차 기록 위에 모의는 올라가지 않는다
  assert.deepEqual(observe(mixed, ctx, "HVAC_TEMP", 24, 4, "MOCK"), mixed);
  // 옛 저장소(evidence 없음)는 시뮬레이터가 만든 것 → MOCK 으로 읽는다
  const legacy = { seen: { "O|SOLO|dad": { HVAC_TEMP: { value: 24, trips: [1, 2, 3] } } }, declined: {} } as unknown as typeof st;
  assert.equal(candidates(legacy, ctx, cur, "혼자")[0]?.evidence, "MOCK");
});

test("대표 시연 A·B·C — 같은 엔진(combinedPrefs → planCabin)으로 재현: 아빠+가족 / 엄마+가족 / 이미 맞는 다음 가족 여행", () => {
  const fam = PROFILE_PRESETS.FAMILY;
  // A. 아빠가 가족과 여행 — 가족 공조 23°C + 아빠 운전석 통풍
  const a = planCabin(combinedPrefs(fam, dad), now, support, false, "가족");
  assert.deepEqual(a.toApply, ["HVAC_TEMP", "SEAT_VENT"]);
  assert.equal(a.summary, "저장된 취향과 비교해 변경할 설정이 2개 있습니다 · 실내 조명은 차량에서 직접");
  // B. 엄마가 같은 가족과 여행 — 가족 공조·휴식 취향은 그대로, 운전석만 열선으로
  const b = planCabin(combinedPrefs(fam, mom), now, support, false, "가족");
  assert.deepEqual(b.toApply, ["HVAC_TEMP", "SEAT_HEAT"]);
  assert.equal(a.items.find((i) => i.key === "HVAC_TEMP")?.line, b.items.find((i) => i.key === "HVAC_TEMP")?.line);
  assert.deepEqual(combinedPrefs(fam, dad).guidance, combinedPrefs(fam, mom).guidance);
  // C. 다음 가족 여행 — A 가 적용된 차(23°C · 통풍시트 켬)에서는 앱이 바꿀 것이 없다. 조명 값을 못 읽으면 그 항목만 "차량에서 직접"으로 남고(준비는 된다),
  //    조명까지 맞으면(밝음) "모두 맞습니다" — 어느 쪽도 묻지 않는다
  const c1 = planCabin(combinedPrefs(fam, dad), { ...now, hvacTempC: 23, seatVent: true }, support, false, "가족");
  assert.deepEqual(c1.toApply, []);
  assert.equal(c1.summary, "앱에서 바꿀 수 있는 설정은 없습니다 · 실내 조명은 차량에서 직접");
  const c2 = planCabin(combinedPrefs(fam, dad), { ...now, hvacTempC: 23, seatVent: true, lighting: "BRIGHT" }, support, false, "가족");
  assert.deepEqual(c2.toApply, []);
  assert.equal(c2.nothingToDo, true);
  assert.equal(c2.summary, "가족 이동 준비를 확인했어요 · 저장한 취향과 모두 맞습니다");
});


test("단건 공조 제안의 목표는 프로필 targetC 가 아니라 합친 취향 — 아빠 혼자 soloCabin 24°C 면 22°C 차량에 24 를 제안한다(에뮬레이터 E20)", () => {
  const dad = DEMO_DRIVERS.dad;
  const solo = PROFILE_PRESETS.SOLO;
  const prefs = combinedPrefs(solo, dad, { hvacTempC: 24, hvacOn: null });
  assert.deepEqual(climateGapOfTarget(prefs.hvacTempC, 22), { currentC: 22, targetC: 24 });
  assert.deepEqual(climateGapOf(solo, 22), { currentC: 22, targetC: 22 }); // 프로필만 보면 틀린 목표
  assert.deepEqual(climateGapOfTarget(combinedPrefs(solo, null, null).hvacTempC, 22), { currentC: 22, targetC: 22 }); // 운전자 미확인이면 프리셋 22 — 차이 0 은 planner 가 거른다
});

test("혼자 공조 정합성 — 아빠 혼자 24°C · 엄마 혼자 20°C 를 각각 학습·승인해도 서로 섞이지 않는다 · 저장 자리 = 귀속 키(운전자별 soloCabin) · 프로필 targetC 는 그대로", () => {
  const solo = PROFILE_PRESETS.SOLO; // 22°C 프리셋(운전자 공유)
  const dadCtx: LearnCtx = { driver: "dad", mode: "SOLO" }, momCtx: LearnCtx = { driver: "mom", mode: "SOLO" };
  let st = EMPTY_LEARNING;
  for (const t of [1, 2, 3]) st = observe(st, dadCtx, "HVAC_TEMP", 24, t, "VEHICLE");
  for (const t of [4, 5, 6]) st = observe(st, momCtx, "HVAC_TEMP", 20, t, "VEHICLE");
  let vault = migrateVault({});
  // 아빠 승인
  const cd = candidates(st, dadCtx, combinedPrefs(solo, dad, null), "혼자")[0];
  const sd = storeCandidate(cd, dadCtx, solo, dad, null);
  assert.equal(sd.profile, solo); // 프로필은 손대지 않는다
  assert.deepEqual(sd.solo, { hvacTempC: 24, hvacOn: null });
  vault = { ...vault, soloCabin: { ...vault.soloCabin, [soloKey("dad", "SOLO")]: sd.solo! } };
  // 엄마 승인
  const cm = candidates(st, momCtx, combinedPrefs(solo, mom, null), "혼자")[0];
  assert.equal(cm.value, 20);
  const sm = storeCandidate(cm, momCtx, solo, mom, null);
  vault = { ...vault, soloCabin: { ...vault.soloCabin, [soloKey("mom", "SOLO")]: sm.solo! } };
  // 이후 준비 — 각자 자기 값, 운전자 미확인은 프리셋
  assert.equal(combinedPrefs(solo, dad, vault.soloCabin[soloKey("dad", "SOLO")]).hvacTempC, 24);
  assert.equal(combinedPrefs(solo, mom, vault.soloCabin[soloKey("mom", "SOLO")]).hvacTempC, 20);
  assert.equal(combinedPrefs(solo, null, null).hvacTempC, 22);
  // 혼자의 운전자별 공조는 가족 이동에 닿지 않는다(가족은 조합 공유 23°C) — 키 모양이 달라도 명시적으로
  assert.equal(combinedPrefs(PROFILE_PRESETS.FAMILY, dad, vault.soloCabin[soloKey("dad", "SOLO")]).hvacTempC, 23);
  // 저장 뒤 같은 값은 "이미 맞음" → 후보 없음 · 옛 저장소(soloCabin 없음)는 빈 칸으로
  assert.deepEqual(candidates(accept(st, dadCtx, "HVAC_TEMP"), dadCtx, combinedPrefs(solo, dad, sd.solo), "혼자"), []);
  assert.deepEqual(migrateVault({ lastMode: "SOLO" }).soloCabin, {});
  // 가족 공조는 여전히 프로필(조합 공유)에 — 혼자 칸을 건드리지 않는다
  let fam = EMPTY_LEARNING;
  for (const t of [1, 2, 3]) fam = observe(fam, { driver: "dad", mode: "FAMILY" }, "HVAC_TEMP", 24, t, "VEHICLE");
  const cf = candidates(fam, { driver: "dad", mode: "FAMILY" }, combinedPrefs(PROFILE_PRESETS.FAMILY, dad, null), "가족")[0];
  const sf = storeCandidate(cf, { driver: "dad", mode: "FAMILY" }, PROFILE_PRESETS.FAMILY, dad, null);
  assert.equal(sf.profile.targetC, 24); assert.equal(sf.solo, null); assert.equal(sf.driver, dad);
});
