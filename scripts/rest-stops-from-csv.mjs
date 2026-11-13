#!/usr/bin/env node
/**
 * docs/data/rest-stops.csv → src/lib/core/rest-stops.generated.ts
 *
 * 오너가 ex.co.kr·data.ex.co.kr 에서 확인한 값을 CSV 에 적으면, 이 스크립트가 시연 데이터(TS)로 바꾼다.
 * 규칙:
 *  - 시설 칸은 1 이면 있음, 비면 없음. restroom·parking 이 비면 그 행은 경고하고 넣지 않는다 (필수 시설 없는 휴게소는 없다).
 *  - charger_kw 가 비면 충전 불가(null) 로 둔다 — "모르면 없는 것으로" 가 추천에선 안전하다.
 *  - confidence 는 VERIFIED/UNKNOWN. source 와 checked_on 이 둘 다 있어야 VERIFIED 로 받는다. 아니면 UNKNOWN 으로 내린다.
 *  - detour_min 은 재계산으로 얻은 값만. 모르면 비운다 (화면에 "추가 N분"을 적지 않는다).
 *
 * 실행: node scripts/rest-stops-from-csv.mjs  → 생성 파일을 mock.ts 가 import 하도록 바꾸는 것은 사람이 한다 (HANDOFF).
 */
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../docs/data/rest-stops.csv", import.meta.url), "utf8").replace(/^﻿/, "");
const rows = parseCsv(src);
const [head, ...body] = rows;
const col = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
const need = ["id", "name", "route_km", "restroom", "parking", "charger_kw", "detour_km", "confidence", "source", "checked_on"];
for (const n of need) if (!(n in col)) throw new Error(`CSV 에 ${n} 열이 없다`);

const out = [];
for (const r of body) {
  if (!r.length || !r[col.id]) continue;
  const get = (k) => (r[col[k]] ?? "").trim();
  const flag = (k) => get(k) === "1";
  if (!flag("restroom") || !flag("parking")) { console.warn(`건너뜀 ${get("id")}: 화장실·주차장 없음`); continue; }
  const amenities = ["RESTROOM", "PARKING"];
  if (flag("restaurant")) amenities.push("RESTAURANT");
  if (flag("cafe")) amenities.push("CAFE");
  if (flag("baby_care")) amenities.push("BABY_CARE");
  if (flag("pet_area")) amenities.push("PET_AREA");
  const kw = get("charger_kw") ? Number(get("charger_kw")) : null;
  if (kw) amenities.push("EV_CHARGER");
  const verified = get("confidence") === "VERIFIED" && get("source") && get("checked_on");
  if (get("confidence") === "VERIFIED" && !verified) console.warn(`${get("id")}: source·checked_on 없이 VERIFIED → UNKNOWN 으로 내림`);
  out.push({
    id: get("id"), name: get("name"), location: { lat: 0, lon: 0 }, routeKm: Number(get("route_km")), amenities,
    detourKm: get("detour_km") ? Number(get("detour_km")) : null,
    detourMinutes: get("detour_min") ? Number(get("detour_min")) : null,
    chargerKw: kw, chargerStalls: get("charger_stalls") ? Number(get("charger_stalls")) : null,
    confidence: verified ? "VERIFIED" : "UNKNOWN", openingHours: null,
    dataSource: get("source") ? `${get("source")} (${get("checked_on")})` : "미확인",
  });
}
out.sort((a, b) => a.routeKm - b.routeKm);
const ts = `// 자동 생성 — docs/data/rest-stops.csv 에서 scripts/rest-stops-from-csv.mjs 가 만든다. 손으로 고치지 말 것.
import type { RestStop } from "./model";

export const REST_STOPS: RestStop[] = ${JSON.stringify(out, null, 2)};
`;
writeFileSync(new URL("../src/lib/core/rest-stops.generated.ts", import.meta.url), ts);
console.log(`생성: ${out.length}곳 → src/lib/core/rest-stops.generated.ts (VERIFIED ${out.filter((s) => s.confidence === "VERIFIED").length})`);

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
