// ARRIVE READY 2단계 — 서울 시영 주차 실데이터를 엔진의 정규화(src/lib/assistant/arrive-ready.ts)에 그대로 넣어 본다.
// 키는 .env 의 seoul_key(출력하지 않음). 실행: npx tsx scripts/parking-probe/normalize.ts [위도 경도]
// 출력: 정규화 통계 + 목적지 800m 안 후보(내비 소요 시간 확인용 JSON: scratch 경로는 인자로)
import { readFileSync, writeFileSync } from "node:fs";
import { distanceM, joinParking, MAX_WALK_M, spaceFact, isOpenAt, type GeoPoint } from "../../src/lib/assistant/arrive-ready";

const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
const key = env.seoul_key;
if (!key) throw new Error("seoul_key 없음");

async function all(svc: string): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  for (let start = 1; ; start += 1000) {
    const res = await fetch(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/${svc}/${start}/${start + 999}/`);
    const body = (await res.json())[svc];
    if (!body?.row) break;
    rows.push(...body.row.map((r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "")]))));
    if (rows.length >= Number(body.list_total_count)) break;
  }
  return rows;
}

async function main() {
const [lat, lon, out] = [Number(process.argv[2] ?? 37.572), Number(process.argv[3] ?? 126.9769), process.argv[4]];
const dest: GeoPoint = { lat, lon };
const t0 = Date.now();
const [rt, info] = [await all("GetParkingInfo"), await all("GetParkInfo")];
const now = Date.now();
const ps = joinParking(rt, info, now, "LIVE_API");
const count = (f: (x: (typeof ps)[number]) => boolean) => ps.filter(f).length;
const sp = ps.map((p) => ({ p, s: spaceFact(p, now) }));
console.log(`받음: 실시간 ${rt.length} · 정보 ${info.length} · ${Date.now() - t0}ms`);
console.log(`정규화: ${ps.length}곳 · 좌표 있음 ${count((p) => p.point !== null)} · 연계 ${count((p) => p.linked)} · 빈자리 계산 ${count((p) => p.free !== null)}`);
console.log(`빈자리 표시(20분 안): 있음 ${sp.filter((x) => x.s.shown === "SPACES_SHOWN").length} · 만차 ${sp.filter((x) => x.s.shown === "FULL_SHOWN").length} · 모름 ${sp.filter((x) => x.s.shown === "UNKNOWN").length}(AGING ${sp.filter((x) => x.s.freshness === "AGING").length} · STALE ${sp.filter((x) => x.s.freshness === "STALE").length} · 연계 없음 ${sp.filter((x) => x.s.freshness === "UNKNOWN").length})`);
console.log(`판단에 바로 쓸 곳(좌표 + 20분 안 대수): ${sp.filter((x) => x.p.point && x.s.freshness === "FRESH").length}`);
console.log(`노상 위치 범위 300m 이상: ${count((p) => p.kind === "ON_STREET" && (p.spreadM ?? 0) >= 300)} · 운영시간 모름(지금): ${count((p) => isOpenAt(p, now) === null)}`);
const near = sp.filter((x) => x.p.point && distanceM(x.p.point, dest) <= MAX_WALK_M).map((x) => ({
  id: x.p.id, name: x.p.name, lat: +x.p.point!.lat.toFixed(6), lon: +x.p.point!.lon.toFixed(6), distanceM: Math.round(distanceM(x.p.point!, dest)),
  free: x.p.free, total: x.p.total, shown: x.s.shown, ageMin: x.s.ageMin === null ? null : Math.round(x.s.ageMin), kind: x.p.kind, open: isOpenAt(x.p, now),
})).sort((a, b) => a.distanceM - b.distanceM);
console.log(`목적지(${lat}, ${lon}) ${MAX_WALK_M}m 안: ${near.length}곳`);
for (const n of near) console.log(`  ${n.distanceM}m · ${n.name} · ${n.kind} · ${n.shown} ${n.free ?? "-"}/${n.total ?? "-"} · ${n.ageMin ?? "-"}분 전 · 운영 ${n.open}`);
if (out) writeFileSync(out, JSON.stringify({ dest, at: now, near }, null, 1));
}
main();
