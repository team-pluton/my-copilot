/**
 * 충전소 API 프록시 — 키 보관 · 캐시 · 호출 제한. 공개 배포하지 않는다(개발 PC 전용, 127.0.0.1 만 듣는다).
 * 에뮬레이터: `adb reverse tcp:8787 tcp:8787` 뒤 앱이 http://127.0.0.1:8787 로 온다.
 *
 * 실행: node node_modules/tsx/dist/cli.mjs scripts/charger-proxy/server.ts
 * 키: 환경변수 DATA_GO_KR_KEY · DATA_GO_KR_KEY_FILE(저장소 밖 파일) · 없으면 루트 .env 의 recharge_key(gitignore). 로그에 찍지 않는다.
 * 초안: ... server.ts --draft-mapping  → 후보 표를 출력만 한다. 사람이 확인해 docs/data/corridor-stations.tsv 에 옮긴다.
 *
 * 왜 이렇게 부르나: 상태 오퍼레이션은 최근 period 분 안에 바뀐 것만 준다(공식 명세). 전체 상태는 정보 오퍼레이션으로 받고(6시간), 그 사이는 증분으로 합친다(5분).
 * 키가 없거나 API 가 거절하면 그 사실을 그대로 돌려준다. 가짜 값으로 메우지 않는다.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildUrl, DailyBudget, matchStationDraft, pagesNeeded, parseFeed, TtlCache, type Operation, type ProxyResponse, type RawItem } from "../../src/lib/assistant/charger-feed";
import { CORRIDOR_ZCODES, CORRIDOR_ROWS } from "../../src/lib/assistant/corridor";

const PORT = Number(process.env.CHARGER_PROXY_PORT ?? 8787);
const INFO_TTL_MS = 6 * 3_600_000;
const STATUS_TTL_MS = 5 * 60_000;
// 9999 행 한 페이지가 큰 지역(서울·경기)에서 15초를 넘었다(2026-11-09 첫 실호출) — 넉넉히
const TIMEOUT_MS = 60_000;
const NUM_OF_ROWS = 9999;

function loadKey(): string | null {
  const v = process.env.DATA_GO_KR_KEY?.trim();
  if (v) return v;
  const f = process.env.DATA_GO_KR_KEY_FILE;
  if (f) { try { return readFileSync(f, "utf8").trim() || null; } catch { return null; } }
  // 저장소 루트 .env 의 recharge_key (gitignore — 2026-11-09 오너가 여기 둠). 인코딩 키 그대로 쓴다(buildUrl 이 다시 인코딩하지 않는다)
  try {
    const line = readFileSync(resolve(".env"), "utf8").split(/\r?\n/).find((l) => l.startsWith("recharge_key="));
    return line?.slice("recharge_key=".length).trim() || null;
  } catch { return null; }
}
const key = loadKey();
const budget = new DailyBudget(Number(process.env.CHARGER_PROXY_DAILY ?? 800), () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10));
const info = new TtlCache<RawItem[]>(INFO_TTL_MS);
const status = new TtlCache<RawItem[]>(STATUS_TTL_MS);

async function call(op: Operation, params: Record<string, string | number>): Promise<{ ok: true; total: number; items: RawItem[] } | { ok: false; reason: string }> {
  if (!key) return { ok: false, reason: "API 키 없음" };
  if (!budget.tryUse()) return { ok: false, reason: "오늘 호출 예산 소진" };
  const url = buildUrl(op, params);
  console.log(new Date().toISOString(), "GET", url.keyless);
  try {
    const res = await fetch(url.withKey(key), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const parsed = parseFeed(await res.text());
    if (!parsed.ok) return { ok: false, reason: `${parsed.code} ${parsed.message}` };
    return { ok: true, total: parsed.totalCount, items: parsed.items };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.name : "네트워크 오류" };
  }
}

// 경로 조회는 휴게소가 있는 시·군만 받는다(zscode, 2026-11-09 실호출로 확인) — 시도 전체(경기 약 15만 행)는 게이트웨이 SERVICETIMEOUT 이 났고 호출도 40회 가까이 들었다.
// 시·군 7곳이면 9회 안팎. 연결표(corridor-stations.tsv)에 휴게소를 더하면 여기에도 그 시·군을 더한다. 초안(--draft-mapping)은 시도 전체를 그대로 본다.
const CORRIDOR_AREAS: { zcode: string; zscode: string; name: string }[] = [
  { zcode: "41", zscode: "41460", name: "용인시(기흥)" }, { zcode: "41", zscode: "41550", name: "안성시" },
  { zcode: "44", zscode: "44130", name: "천안시(천안호두)" }, { zcode: "43", zscode: "43110", name: "청주시(옥산·죽암)" },
  { zcode: "43", zscode: "43740", name: "영동군(황간)" }, { zcode: "47", zscode: "47150", name: "김천시" }, { zcode: "47", zscode: "47850", name: "칠곡군" },
];

async function infoFor(zcode: string, zscode?: string): Promise<{ items: RawItem[]; at: number; cached: boolean } | { reason: string; items?: undefined }> {
  const now = Date.now();
  const area = zscode ? `${zcode}/${zscode}` : zcode;
  const extra: Record<string, string> = zscode ? { zcode, zscode } : { zcode };
  const hit = info.fresh(area, now);
  if (hit) return { items: hit.value, at: hit.at, cached: true };
  const first = await call("getChargerInfo", { pageNo: 1, numOfRows: NUM_OF_ROWS, ...extra });
  if (!first.ok) { const old = info.any(area); return old ? { items: old.value, at: old.at, cached: true } : { reason: first.reason }; }
  const items = [...first.items];
  for (let p = 2; p <= pagesNeeded(first.total, NUM_OF_ROWS); p += 1) {
    const page = await call("getChargerInfo", { pageNo: p, numOfRows: NUM_OF_ROWS, ...extra });
    if (!page.ok) { const old = info.any(area); return old ? { items: old.value, at: old.at, cached: true } : { reason: page.reason }; } // 일부만 저장하면 빠진 충전소가 '없는 것'이 된다
    for (const it of page.items) items.push(it);
  }
  info.put(area, items, now);
  return { items, at: now, cached: false };
}

async function statusDelta(): Promise<{ items: RawItem[]; at: number; cached: boolean } | null> {
  const now = Date.now();
  const hit = status.fresh("all", now);
  if (hit) return { items: hit.value, at: hit.at, cached: true };
  // 전국 증분이 5분에 9,919건이었다(2026-11-09 실호출) — 10분이면 한 페이지(9999)를 넘으므로 끝까지 받는다. 일부만 받으면 그 뒤 상태 변화를 놓친다
  const res = await call("getChargerStatus", { pageNo: 1, numOfRows: NUM_OF_ROWS, period: 10 });
  if (!res.ok) return null;
  const items: RawItem[] = [...res.items];
  for (let p = 2; p <= pagesNeeded(res.total, NUM_OF_ROWS); p += 1) {
    const page = await call("getChargerStatus", { pageNo: p, numOfRows: NUM_OF_ROWS, period: 10 });
    if (!page.ok) return null;
    for (const it of page.items) items.push(it);
  }
  status.put("all", items, now);
  return { items, at: now, cached: false };
}

function loadMapping(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const lines = readFileSync(resolve("docs/data/corridor-stations.tsv"), "utf8").split(/\r?\n/).slice(1);
  for (const l of lines) {
    const [stop, stat] = l.split("\t");
    if (stop && stat) (out[stop] ??= []).push(stat);
  }
  return out;
}

async function corridor(): Promise<ProxyResponse> {
  const mapping = loadMapping();
  const wanted = new Set(Object.values(mapping).flat());
  const reviewed = wanted.size > 0;
  if (!key) return { availability: "NOT_CONNECTED", evidence: "UNKNOWN", retrievedAt: null, errorReason: "API 키 없음", mapping, mappingReviewed: reviewed, items: [] };
  if (!reviewed) return { availability: "FAILED", evidence: "UNKNOWN", retrievedAt: null, errorReason: "휴게소-충전소 연결표가 비어 있어요", mapping, mappingReviewed: false, items: [] };
  const merged = new Map<string, RawItem>();
  let oldest = Date.now();
  let anyCached = false;
  for (const a of CORRIDOR_AREAS) {
    const r = await infoFor(a.zcode, a.zscode);
    if (r.items == null) return { availability: "FAILED", evidence: "UNKNOWN", retrievedAt: null, errorReason: r.reason, mapping, mappingReviewed: reviewed, items: [] };
    oldest = Math.min(oldest, r.at);
    anyCached ||= r.cached;
    for (const it of r.items) if (wanted.has(it.statId)) merged.set(`${it.statId}/${it.chgerId}`, it);
  }
  // 증분은 정보 값 위에 올린다. 실패해도 정보 값은 쓸 수 있다 — 받은 시각이 그대로라 앱이 신뢰를 낮춘다
  const delta = await statusDelta();
  if (delta) {
    for (const d of delta.items) {
      const k = `${d.statId}/${d.chgerId}`;
      const cur = merged.get(k);
      if (cur && (d.statUpdDt ?? "") >= (cur.statUpdDt ?? "")) merged.set(k, { ...cur, stat: d.stat, statUpdDt: d.statUpdDt });
    }
  }
  const at = delta ? Math.max(oldest, delta.at) : oldest;
  return { availability: "OK", evidence: anyCached || delta?.cached || !delta ? "CACHED" : "LIVE_API", retrievedAt: at, errorReason: delta ? null : "상태 증분을 받지 못했어요", mapping, mappingReviewed: reviewed, items: [...merged.values()] };
}

async function draftMapping() {
  if (!key) { console.error("API 키가 없어 초안을 만들 수 없습니다."); process.exitCode = 1; return; }
  const all: RawItem[] = [];
  // push(...items) 는 수만 행에서 스택을 넘는다(2026-11-09 첫 실호출) — 하나씩 넣는다
  for (const z of CORRIDOR_ZCODES) {
    const r = await infoFor(z);
    if (r.items) { for (const it of r.items) all.push(it); } else console.error(z, r.reason);
  }
  console.log("stop_id\tstat_id\tstat_name\tchecked_on\tnote");
  for (const row of CORRIDOR_ROWS) for (const m of matchStationDraft(row.name, "부산", all)) console.log(`${row.id}\t${m.statId}\t${m.statNm}\t\t초안 — 위치·방향 확인 전`);
}

if (process.argv.includes("--draft-mapping")) {
  void draftMapping();
} else {
  const send = (res: import("node:http").ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "http://localhost:3008" });
    res.end(JSON.stringify(body));
  };
  createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    if (req.method !== "GET") return send(res, 405, { error: "GET 만" });
    if (path === "/health") return send(res, 200, { ok: true, keyConfigured: key != null, budgetRemaining: budget.remaining(), mappedStops: Object.keys(loadMapping()).length });
    if (path === "/v1/corridor") return send(res, 200, await corridor());
    return send(res, 404, { error: "없는 경로" });
  }).listen(PORT, "127.0.0.1", () => {
    console.log(`charger-proxy http://127.0.0.1:${PORT} · 키 ${key ? "있음" : "없음 — 조회는 NOT_CONNECTED 로 답합니다"}`);
    if (!key) return;
    // 첫 조회는 시·군 7곳 충전기 정보를 받느라 20초를 넘겨 앱이 '연결하지 못했어요' 로 끝났다(에뮬레이터 E27 D4) — 켜자마자 한 번 받아 둔다
    const warm = async (why: string) => { const t = Date.now(); const r = await corridor(); console.log(`${why}: ${r.availability} · 충전기 ${r.items.length}기 · ${Date.now() - t}ms`); };
    void warm("미리 받기");
    // --demo: 시연 중 상태가 '오래됨'(5분)으로 넘어가지 않게 4분마다 상태만 새로 받는다. 호출 예산(하루 800) 때문에 기본은 끈다 · 2시간 뒤 멈춘다
    if (process.argv.includes("--demo")) {
      const until = Date.now() + 2 * 3_600_000;
      const timer = setInterval(() => { if (Date.now() > until) { clearInterval(timer); console.log("--demo 갱신 종료(2시간)"); return; } void warm("상태 갱신"); }, 4 * 60_000);
    }
  });
}
