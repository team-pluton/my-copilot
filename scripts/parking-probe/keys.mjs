// 서울 열린데이터광장 주차 API 표본 — 필드 이름 확인용. 키는 .env 의 seoul_key 에서 읽고 **출력하지 않는다**.
// 실행: node scripts/parking-probe/keys.mjs
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
const key = env.seoul_key;
if (!key) { console.error("seoul_key 없음"); process.exit(1); }

for (const svc of ["GetParkingInfo", "GetParkInfo"]) {
  const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/${svc}/1/2/`;
  const res = await fetch(url);
  const j = await res.json();
  const body = j[svc] ?? j;
  console.log(`== ${svc} · 전체 ${body.list_total_count ?? "?"}건 · ${body.RESULT?.CODE ?? ""}`);
  const row = body.row?.[0];
  if (row) for (const [k, v] of Object.entries(row)) console.log(`  ${k} = ${String(v).slice(0, 60)}`);
}
