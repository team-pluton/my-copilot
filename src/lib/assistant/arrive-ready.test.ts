import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arriveBudgetLine, arriveCaveats, arrivePlanStatus, arriveTradeoff, arriveDecisiveReason, decideArrive, fasterButFarNote, feasibilityOf, goalMissing, isOpenAt, joinParking,
  normalizeParking, parseSeoulTime, slackOf, spaceFact, tripProblem, type ArriveGoal, type ArriveInput, type TripEstimate,
} from "./arrive-ready";

// 2026-11-11(수) 14:00 KST · 약속 15:00 · 광화문 고객사 — ArriveReadyTest.kt 와 같은 값
const NOW = Date.UTC(2026, 10, 11, 5, 0, 0);
const MIN = 60_000;
const goal: ArriveGoal = { appointmentAt: NOW + 60 * MIN, place: { name: "광화문 고객사", point: { lat: 37.572, lon: 126.9769 } }, bufferMin: 10, confirmedByUser: true };

const kst = (ms: number) => { const d = new Date(ms + 9 * 3_600_000).toISOString(); return `${d.slice(0, 10)} ${d.slice(11, 19)}`; };
const rt = (id: string, name: string, o: Record<string, string> = {}): Record<string, string> => ({
  PKLT_CD: id, PKLT_NM: name, ADDR: "종로구", PKLT_TYPE: "NW", PRK_STTS_YN: "1", TPKCT: "100", NOW_PRK_VHCL_CNT: "50",
  NOW_PRK_VHCL_UPDT_TM: kst(NOW - 5 * MIN), WD_OPER_BGNG_TM: "0000", WD_OPER_END_TM: "2400", WE_OPER_BGNG_TM: "0000", WE_OPER_END_TM: "2400",
  LHLDY_OPER_BGNG_TM: "0000", LHLDY_OPER_END_TM: "2400", BSC_PRK_CRG: "430", BSC_PRK_HR: "5", ...o,
});
const info = (id: string, lat: number, lon: number) => ({ PKLT_CD: id, LAT: String(lat), LOT: String(lon) });
const trip = (id: string, min: number | null, km: number | null = 6): TripEstimate => ({ parkingId: id, seconds: min === null ? null : min * 60, meters: km === null ? null : km * 1000, retrievedAt: NOW, source: "NAVI" });

const REALTIME = [
  rt("A", "세종로 공영주차장", { TPKCT: "1260", NOW_PRK_VHCL_CNT: "626" }),
  rt("B", "광화문 노상", { PKLT_TYPE: "NS", TPKCT: "20", NOW_PRK_VHCL_CNT: "20" }),
  rt("C", "종묘 주차장"),
  rt("D", "미연계 주차장", { PRK_STTS_YN: "0" }),
  rt("E", "좌표 없는 주차장"),
  rt("F", "오래된 주차장", { NOW_PRK_VHCL_UPDT_TM: kst(NOW - 180 * MIN) }),
  rt("G", "오후 1시 마감 주차장", { WD_OPER_BGNG_TM: "0900", WD_OPER_END_TM: "1300" }),
  rt("H", "작은 공영주차장", { TPKCT: "30", NOW_PRK_VHCL_CNT: "25" }),
];
const INFO = [info("A", 37.5734, 126.9759), info("B", 37.5718, 126.9772), info("B", 37.5722, 126.9775), info("C", 37.5713, 126.9943), info("D", 37.5725, 126.9765),
  { PKLT_CD: "E", LAT: "0", LOT: "0" }, info("F", 37.5716, 126.9762), info("G", 37.5726, 126.977), info("H", 37.5723, 126.9768)];
const TRIPS = ["A", "B", "C", "D", "E", "F", "G", "H"].map((id) => trip(id, 25));
const input = (o: Partial<ArriveInput> = {}): ArriveInput => ({ goal, now: NOW, parkings: joinParking(REALTIME, INFO, NOW, "LIVE_API"), trips: TRIPS, ...o });

test("목표 — 약속 시각 · 위치 · 여유 · 확인이 없으면 판단하지 않고 무엇이 필요한지 말한다", () => {
  assert.deepEqual(goalMissing({ appointmentAt: null, place: { name: "x", point: null }, bufferMin: null, confirmedByUser: false }, NOW), ["약속 시각", "방문 장소 위치", "주차 후 여유", "약속 확인"]);
  assert.deepEqual(goalMissing({ ...goal, appointmentAt: NOW - MIN }, NOW), ["약속 시각(이미 지남)"]);
  const d = decideArrive(input({ goal: { ...goal, bufferMin: null } }));
  assert.equal(d.kind, "NEEDS_INPUT");
  assert.equal(d.headline, "주차 후 여유을(를) 알려 주시면 주차와 도착을 함께 볼게요");
});

test("주차 정규화 — 실시간 + 정보(좌표)를 주차장 코드로 결합 · 빈자리 = 면수 − 현재 대수 · 시각은 한국 시간", () => {
  const ps = joinParking(REALTIME, INFO, NOW, "LIVE_API");
  assert.equal(ps.length, 8);
  const a = ps.find((p) => p.id === "A")!;
  assert.deepEqual([a.free, a.kind, a.updatedAt, a.basicFee], [634, "OFF_STREET", NOW - 5 * MIN, { won: 430, minutes: 5 }]);
  assert.deepEqual(a.point, { lat: 37.5734, lon: 126.9759 });
  const b = ps.find((p) => p.id === "B")!;
  assert.equal(b.kind, "ON_STREET");
  assert.ok((b.spreadM ?? 0) > 0 && (b.spreadM ?? 0) < 100); // 노상 두 구간의 중심에서 퍼짐
  assert.equal(ps.find((p) => p.id === "D")!.free, null); // 미연계면 대수를 쓰지 않는다
  assert.equal(ps.find((p) => p.id === "E")!.point, null); // 0 좌표는 좌표가 아니다
  assert.equal(parseSeoulTime("2026-11-11 18:16:43"), Date.UTC(2026, 10, 11, 9, 16, 43));
  assert.equal(parseSeoulTime("2026/11/11"), null);
  assert.equal(normalizeParking({ PKLT_NM: "코드 없음" }, [], NOW, "LIVE_API"), null);
  // 현재 대수가 면수보다 크면 이상값 — 빈자리를 만들지 않는다
  assert.equal(normalizeParking(rt("X", "이상", { TPKCT: "10", NOW_PRK_VHCL_CNT: "12" }), [], NOW, "LIVE_API")!.free, null);
});

test("빈자리 표시 — 20분 안의 연계 값만 판단에 쓴다(Gate D) · 그 밖은 모름", () => {
  const p = normalizeParking(rt("A", "a"), [], NOW, "LIVE_API")!;
  assert.deepEqual(spaceFact(p, NOW), { shown: "SPACES_SHOWN", freshness: "FRESH", ageMin: 5 });
  assert.equal(spaceFact(p, NOW + 20 * MIN).shown, "UNKNOWN"); // 25분
  assert.equal(spaceFact(p, NOW + 20 * MIN).freshness, "AGING");
  assert.equal(spaceFact(p, NOW + 200 * MIN).freshness, "STALE");
  assert.equal(spaceFact(normalizeParking(rt("F", "f", { NOW_PRK_VHCL_CNT: "100" }), [], NOW, "LIVE_API")!, NOW).shown, "FULL_SHOWN");
});

test("운영시간 — 평일 · 주말 · 자정 넘는 운영 · 시간 없음은 모름", () => {
  const p = normalizeParking(rt("G", "g", { WD_OPER_BGNG_TM: "0900", WD_OPER_END_TM: "1300", WE_OPER_BGNG_TM: "2200", WE_OPER_END_TM: "0600" }), [], NOW, "LIVE_API")!;
  assert.equal(isOpenAt(p, NOW - 2 * 60 * MIN), true); // 수 12:00
  assert.equal(isOpenAt(p, NOW), false); // 수 14:00
  const sat23 = Date.UTC(2026, 10, 14, 14, 0, 0); // 토 23:00 KST
  assert.equal(isOpenAt(p, sat23), true);
  assert.equal(isOpenAt(p, sat23 - 10 * 60 * MIN), false); // 토 13:00
  assert.equal(isOpenAt(normalizeParking(rt("N", "n", { WD_OPER_BGNG_TM: "", WD_OPER_END_TM: "" }), [], NOW, "LIVE_API")!, NOW), null);
});

test("소요 시간 — 없거나 0 이거나 거리와 맞지 않으면 판단에 쓰지 않는다", () => {
  assert.equal(tripProblem(undefined), "내비 소요 시간을 받지 못했어요");
  assert.equal(tripProblem(trip("A", 0)), "내비 소요 시간이 0으로 왔어요");
  assert.equal(tripProblem(trip("A", 1, 10)), "내비 소요 시간이 거리와 맞지 않아요"); // 시속 600km
  assert.equal(tripProblem(trip("A", 25, 6)), null);
  assert.equal(tripProblem(trip("A", 25, null)), null);
});

test("방문 가능성 — 남는 시간을 범위로: 여유 / 빠듯 / 맞추기 어려움 / 판단 불가", () => {
  assert.deepEqual(slackOf(goal, NOW, 25 * 60), { low: 20, high: 25 });
  assert.equal(feasibilityOf(slackOf(goal, NOW, 25 * 60)), "ENOUGH");
  assert.deepEqual(slackOf(goal, NOW, 45 * 60), { low: -2, high: 5 });
  assert.equal(feasibilityOf(slackOf(goal, NOW, 45 * 60)), "TIGHT");
  assert.equal(feasibilityOf(slackOf(goal, NOW, 55 * 60)), "AT_RISK");
  assert.equal(feasibilityOf(slackOf(goal, NOW, null)), "UNKNOWN");
});

test("결정 — 위치·운영·빈자리·소요 시간을 다 본 뒤 하나 · 순위를 가른 기준 · 남은 불확실성", () => {
  const i = input();
  const d = decideArrive(i);
  assert.equal(d.kind, "RECOMMEND");
  assert.equal(d.top?.parking.id, "A");
  assert.equal(d.headline, "세종로 공영주차장에 세우면 약속 시간에 맞출 수 있어 보여요");
  assert.deepEqual(d.alternatives.map((c) => c.parking.id), ["H"]);
  assert.equal(d.fasterButFar, null);
  assert.deepEqual(d.needsCheck.map((c) => [c.parking.id, c.problem]), [
    ["F", "빈자리 정보가 오래됐어요"], ["B", "만차로 표시돼 있어요(13:55 기준)"], ["D", "빈자리 정보가 없어요"],
  ]); // 확인 필요도 같은 순위 기준(여유 → 빈자리 표시 → 남는 시간 → 거리)
  assert.deepEqual(d.excluded.map((e) => [e.id, e.reason]), [["C", "방문지에서 800m 밖"], ["E", "위치를 몰라요"], ["G", "도착 예정 시각에 운영하지 않아요"]]);
  assert.equal(arriveDecisiveReason(d.top!, d.alternatives[0]), "표시된 빈자리가 10면 이상이에요(작은 공영주차장은 5면)");
  assert.equal(arriveBudgetLine(i, d.top), "약속 15:00 − 지금 14:00 − 주차장까지 약 25분(내비) − 주차 후 여유 10분(직접 설정) → 약 20~25분 남음 · 추정");
  assert.deepEqual(arriveCaveats(d.top!, 10), ["빈자리 634면 표시 · 13:55 기준 — 도착할 때도 있는지는 몰라요", "소요 시간은 내비 예상 그대로 · 실시간 교통 반영 여부는 확인 전", "주차장 위치는 대표 좌표 — 진입구와 다를 수 있어요"]);
});

test("결정 — 빈자리가 많아도 약속을 맞추기 어려우면 권하지 않는다 · 여유가 먼저", () => {
  const trips = TRIPS.map((t) => (t.parkingId === "A" ? trip("A", 55) : t));
  const d = decideArrive(input({ trips }));
  assert.equal(d.top?.parking.id, "H");
  assert.equal(d.needsCheck.find((c) => c.parking.id === "A")?.problem, "이 주차장으로는 약속 시간을 맞추기 어려울 수 있어요");
  // 둘 다 빠듯하면 빈자리 기준으로, 둘 다 같으면 남는 시간으로
  const tight = TRIPS.map((t) => (t.parkingId === "A" ? trip("A", 45) : t.parkingId === "H" ? trip("H", 40) : t));
  const d2 = decideArrive(input({ trips: tight }));
  assert.equal(d2.headline, "세종로 공영주차장이(가) 가장 낫지만 빠듯해요");
});

test("불확실성 — 방문지에서 400m 이상이면 거리를 드러낸다(도보 시간은 계산하지 않음)", () => {
  const far = joinParking([rt("Z", "먼 주차장")], [info("Z", 37.5785, 126.9769)], NOW, "LIVE_API"); // 북쪽 약 720m
  const d = decideArrive(input({ parkings: far, trips: [trip("Z", 25)] }));
  assert.equal(d.kind, "RECOMMEND_WITH_CHECK");
  assert.equal(d.headline, "먼 주차장이(가) 가장 낫지만 방문지까지 직선 약 720m — 걸어가는 시간 확인이 필요해요");
  assert.equal(d.top?.parking.id, "Z");
  assert.equal(arriveCaveats(d.top!, 10)[2], "방문지까지 직선 약 720m — 걸어가는 시간이 여유 10분 안에 드는지 확인해 주세요");
});

test("실패 상태 — 정보를 못 받음 · 오래됨 · 맞는 후보 없음을 섞지 않는다(연결 실패를 '없다'로 말하지 않음)", () => {
  const failed = decideArrive(input({ feed: { ok: false, reason: "프록시에 연결하지 못했어요" } }));
  assert.equal(failed.kind, "DATA_FAILED");
  assert.equal(failed.headline, "주차장 정보를 확인하지 못했어요 · 프록시에 연결하지 못했어요");
  const stale = decideArrive(input({ parkings: joinParking([rt("S", "오래됨", { NOW_PRK_VHCL_UPDT_TM: kst(NOW - 180 * MIN) })], [info("S", 37.5723, 126.9768)], NOW, "LIVE_API"), trips: [trip("S", 25)] }));
  assert.deepEqual([stale.kind, stale.headline], ["DATA_STALE", "주차장 빈자리 정보를 최신으로 확인해야 해요"]);
  const none = decideArrive(input({ parkings: joinParking([rt("C", "종묘 주차장")], [info("C", 37.5713, 126.9943)], NOW, "LIVE_API") }));
  assert.deepEqual([none.kind, none.headline], ["NO_FIT", "방문지 800m 안에서 확인된 주차장이 없어요"]);
});

test("결정 — 소요 시간을 하나도 못 받으면 판단을 보류한다", () => {
  const d = decideArrive(input({ trips: [] }));
  assert.equal(d.kind, "DATA_FAILED");
  assert.equal(d.headline, "내비 소요 시간을 받지 못해 판단을 보류해요");
  assert.equal(d.top, null);
  assert.ok(d.needsCheck.every((c) => c.problem !== null));
  assert.equal(d.needsCheck.find((c) => c.parking.id === "A")?.problem, "내비 소요 시간을 받지 못했어요");
});

// ── 회귀: 2026-11-11 18:36 광화문 실측(서울 시영 실시간 + 에뮬레이터 requestTrip) — ArriveReadyTest.kt 와 같은 값 ──
test("회귀 — 세종로(180m · 681면 · 64.7분) vs 동국제강(775m · 10면 · 56.3분): 차로 빠른 것만으로 방문 목표에 맞다고 확정하지 않는다", () => {
  const ps = joinParking(
    [rt("171721", "세종로 공영주차장(시)", { TPKCT: "1260", NOW_PRK_VHCL_CNT: "579" }), rt("1425816", "동국제강 공영주차장(시)", { TPKCT: "13", NOW_PRK_VHCL_CNT: "3" })],
    [info("171721", 37.573403, 126.975884), info("1425816", 37.567337, 126.983435)], NOW, "LIVE_API");
  const trips: TripEstimate[] = [{ parkingId: "171721", seconds: 3882, meters: 23432, retrievedAt: NOW, source: "NAVI" }, { parkingId: "1425816", seconds: 3377, meters: 22039, retrievedAt: NOW, source: "NAVI" }];
  const g90 = { ...goal, appointmentAt: NOW + 90 * MIN };
  const d = decideArrive({ goal: g90, now: NOW, parkings: ps, trips });
  assert.equal(d.kind, "RECOMMEND");
  assert.equal(d.top?.parking.id, "171721");
  assert.equal(d.headline, "세종로 공영주차장(시)이(가) 가장 낫지만 빠듯해요");
  assert.equal(d.fasterButFar?.parking.id, "1425816");
  assert.equal(fasterButFarNote(d.top!, d.fasterButFar!, 10), "동국제강 공영주차장(시)은(는) 차로 약 8분 빠르지만 방문지까지 직선 약 780m — 걸어가는 시간이 여유 10분 안에 드는지 확인이 필요해요");
  assert.equal(arriveTradeoff(d.top!, d.fasterButFar!), "세종로 공영주차장(시)은(는) 방문지와 가깝지만(약 180m) 남는 시간이 6~15분이고, 동국제강 공영주차장(시)은(는) 차로 약 8분 빠르지만 방문지까지 약 780m라 주차 후 이동을 확인해야 해요");
  // 60분 뒤 약속 — 둘 다 맞추기 어렵다: '없다'가 아니라 '맞는 후보를 못 찾음' + 가장 빠른 후보
  const d60 = decideArrive({ goal: { ...goal, appointmentAt: NOW + 60 * MIN }, now: NOW, parkings: ps, trips });
  assert.equal(d60.kind, "NO_FIT");
  assert.equal(d60.headline, "확인된 주차장 중 약속 시간에 맞춰 방문할 여유가 있는 후보를 찾지 못했어요");
  assert.equal(d60.fastest?.parking.id, "1425816");
});

test("다시 판단(JOURNEY RECOVERY) — 결과가 의미 있게 달라질 때만 알리고, 경로는 바꾸지 않고 제안만", async () => {
  const { arriveRecovery } = await import("./arrive-ready");
  const before = decideArrive(input());
  assert.equal(before.top?.parking.id, "A");
  // 아무것도 안 보냈으면 알리지 않는다
  assert.equal(arriveRecovery(before, null).notify, false);
  // 대수만 조금 바뀜(634 → 600) — 조용히
  const small = decideArrive(input({ parkings: joinParking(REALTIME.map((r) => (r.PKLT_CD === "A" ? { ...r, NOW_PRK_VHCL_CNT: "660" } : r)), INFO, NOW, "LIVE_API") }));
  assert.deepEqual(arriveRecovery(small, "A"), { notify: false, reason: null, suggestion: null });
  // 보낸 곳이 만차 표시로 바뀜 — 알리고 대안 하나
  const full = decideArrive(input({ parkings: joinParking(REALTIME.map((r) => (r.PKLT_CD === "A" ? { ...r, NOW_PRK_VHCL_CNT: "1260" } : r)), INFO, NOW, "LIVE_API") }));
  const r = arriveRecovery(full, "A");
  assert.equal(r.notify, true);
  assert.equal(r.reason, "안내 중인 주차장 · 만차로 표시돼 있어요(13:55 기준)");
  assert.equal(r.suggestion?.parking.id, "H");
  // 정보가 끊기면 — '없다'가 아니라 확인 못 함
  const failed = decideArrive(input({ feed: { ok: false, reason: null } }));
  assert.equal(arriveRecovery(failed, "A").reason, "주차장 정보를 확인하지 못했어요 · 안내 중인 경로는 그대로예요");
  // 보낸 곳은 괜찮은데 다른 곳이 여유 등급이 좋아짐 — 알림(바꿀지는 사용자)
  const tight = decideArrive(input({ trips: TRIPS.map((t) => (t.parkingId === "H" ? trip("H", 45) : t)) }));
  assert.equal(tight.top?.parking.id, "A");
  const routedH = arriveRecovery(tight, "H");
  assert.equal(routedH.notify, true);
  assert.equal(routedH.reason, "세종로 공영주차장이(가) 약속까지 여유가 더 있어요 · 지금 안내 중인 곳도 쓸 수 있어요");
});

test("400m 는 확인 필요 수준을 나누는 임시 경계 — 390m 와 410m 후보가 둘 다 화면에 남는다(절대 기준 아님)", () => {
  const dest = goal.place.point!;
  const north = (m: number) => ({ lat: dest.lat + m / 111_000, lon: dest.lon });
  const ps = joinParking([rt("N390", "390m 주차장"), rt("N410", "410m 주차장")],
    [info("N390", north(390).lat, north(390).lon), info("N410", north(410).lat, north(410).lon)], NOW, "LIVE_API");
  // 410m 쪽이 차로 10분 빠르다 — 여유 등급이 한 단계 높다
  const d = decideArrive({ goal: { ...goal, appointmentAt: NOW + 50 * MIN }, now: NOW, parkings: ps, trips: [trip("N390", 30), trip("N410", 20)] });
  assert.equal(d.kind, "RECOMMEND");
  assert.equal(d.top?.parking.id, "N390");
  assert.equal(d.fasterButFar?.parking.id, "N410");
  assert.ok(arriveTradeoff(d.top!, d.fasterButFar!).includes("차로 약 10분 빠르지만"));
  // 같은 소요 시간이면 먼 후보는 가까운 후보를 앞서지 않는다 — 대안으로 남는다(사라지지 않는다)
  const same = decideArrive({ goal: { ...goal, appointmentAt: NOW + 50 * MIN }, now: NOW, parkings: ps, trips: [trip("N390", 20), trip("N410", 20)] });
  assert.equal(same.top?.parking.id, "N390");
  assert.equal(same.fasterButFar, null);
  assert.deepEqual(same.alternatives.map((c) => c.parking.id), ["N410"]);
});

test("실행 중인 계획 기준 — 유지 · 빠듯하지만 유지 · 바꾸기 제안 · 대안 없음 · 판단 불가를 나눈다(1순위가 바뀐 것만으로 바꾸라고 하지 않는다)", () => {
  const base = decideArrive(input());
  // 경로가 없으면 판단 문장 그대로
  assert.deepEqual([arrivePlanStatus(base, null, null).change, arrivePlanStatus(base, null, null).headline], ["NO_PLAN", base.headline]);
  // 안내 중인 곳(H)이 추천 가능으로 남고 결과가 같다 — 유지 · 1순위(A)는 '다른 적합 후보'로만
  assert.equal(base.top?.parking.id, "A");
  const keep = arrivePlanStatus(base, "H", "작은 공영주차장");
  assert.deepEqual([keep.change, keep.headline, keep.detail, keep.routed?.parking.id, keep.best?.parking.id],
    ["KEEP", "지금 경로를 유지해도 괜찮아 보여요", "안내 중 · 작은 공영주차장 · 지금 확인된 정보로는 경로를 바꿀 이유가 없어요", "H", "A"]);
  assert.equal(keep.recovery.notify, false);
  // 안내 중인 곳이 만차 표시 — 바꾸기 제안(사용자가 승인해야)
  const full = decideArrive(input({ parkings: joinParking(REALTIME.map((r) => (r.PKLT_CD === "A" ? { ...r, NOW_PRK_VHCL_CNT: "1260" } : r)), INFO, NOW, "LIVE_API") }));
  const sw = arrivePlanStatus(full, "A", "세종로 공영주차장");
  assert.deepEqual([sw.change, sw.headline, sw.detail, sw.routed, sw.recovery.suggestion?.parking.id],
    ["SUGGEST_CHANGE", "안내 중인 주차장을 바꾸는 것이 좋아 보여요", "안내 중인 주차장 · 만차로 표시돼 있어요(13:55 기준)", null, "H"]);
  // 안내 중인 곳은 괜찮지만 다른 곳 여유 등급이 더 좋다 — 부드러운 제안
  const tight = decideArrive(input({ trips: TRIPS.map((t) => (t.parkingId === "H" ? trip("H", 45) : t)) }));
  assert.equal(arrivePlanStatus(tight, "H", "작은 공영주차장").headline, "지금 경로도 쓸 수 있지만 바꾸면 여유가 더 있어요");
  // 만차인데 갈 만한 다른 곳이 없다 — 문제는 말하되 바꿀 곳을 지어내지 않는다
  const onlyA = decideArrive(input({ parkings: joinParking([{ ...REALTIME[0], NOW_PRK_VHCL_CNT: "1260" }], INFO, NOW, "LIVE_API") }));
  const none = arrivePlanStatus(onlyA, "A", "세종로 공영주차장");
  assert.deepEqual([none.change, none.recovery.suggestion], ["ROUTED_PROBLEM", null]);
  // 모두 빠듯 — 안내 중인 곳도 빠듯하면 '괜찮다'고 하지 않는다
  const allTight = decideArrive(input({ trips: TRIPS.map((t) => trip(t.parkingId, 45)) }));
  assert.equal(arrivePlanStatus(allTight, "A", "세종로 공영주차장").change, "KEEP_TIGHT");
  assert.equal(arrivePlanStatus(allTight, "A", "세종로 공영주차장").headline, "지금 경로로 갈 수 있지만 빠듯해요");
  // 정보가 끊김 · 안내 중인 곳의 빈자리가 오래됨 · 안내 중인 곳이 결과에 없음 — 판단 불가(유지해도 된다고 단정하지 않는다)
  const failed = arrivePlanStatus(decideArrive(input({ feed: { ok: false, reason: null } })), "A", "세종로 공영주차장");
  assert.deepEqual([failed.change, failed.headline, failed.detail], ["CANNOT_JUDGE", "지금은 판단할 정보가 부족해요 · 안내 중인 경로는 그대로예요", "주차장 정보를 확인하지 못했어요"]);
  const stale = decideArrive(input({ parkings: joinParking(REALTIME.map((r) => (r.PKLT_CD === "A" ? { ...r, NOW_PRK_VHCL_UPDT_TM: kst(NOW - 180 * MIN) } : r)), INFO, NOW, "LIVE_API") }));
  assert.deepEqual([arrivePlanStatus(stale, "A", "세종로 공영주차장").change, arrivePlanStatus(stale, "A", "세종로 공영주차장").detail], ["CANNOT_JUDGE", "세종로 공영주차장 · 빈자리 정보가 오래됐어요"]);
  assert.equal(arrivePlanStatus(base, "Z", "사라진 주차장").detail, "안내 중인 사라진 주차장을(를) 이번 정보에서 확인하지 못했어요");
});
