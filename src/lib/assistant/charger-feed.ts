/**
 * 충전소 API 의 입구 — XML 파싱 · 페이지 처리 · 캐시 · 호출 한도. 프록시(scripts/charger-proxy/server.ts)만 쓴다. 앱에는 키도 이 코드도 들어가지 않는다.
 *
 * 응답 형식은 둘이다(실측 2026-11-04, 키 없이 호출해 받은 401):
 *  · 정상: <response><header><resultCode/>…</header><body><items><item>…</item></items><totalCount/></body></response>(공식 명세)
 *  · 게이트웨이 거절: <OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE_KEY_IS_NULL</errMsg><returnReasonCode>20</returnReasonCode>…
 * 둘을 합치면 '빈 결과'와 '거절'을 구별하지 못한다 — 빈 결과를 "충전기 없음"으로 판단하면 틀린다.
 */

export type RawItem = Record<string, string>;
export type ParsedFeed =
  | { ok: true; totalCount: number; pageNo: number; numOfRows: number; items: RawItem[] }
  | { ok: false; code: string; message: string };

const unescapeXml = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? unescapeXml(m[1]) : null;
};

/** 항목은 한 단계 태그뿐이라(공식 명세) 범용 파서를 들이지 않는다. 형식이 달라지면 ok:false 로 멈춘다 — 조용히 빈 목록을 돌려주지 않는다 */
export function parseFeed(xml: string): ParsedFeed {
  if (xml.includes("<OpenAPI_ServiceResponse")) {
    return { ok: false, code: tag(xml, "returnReasonCode") ?? "GATEWAY", message: tag(xml, "errMsg") ?? "게이트웨이 거절" };
  }
  const code = tag(xml, "resultCode");
  if (code == null) return { ok: false, code: "PARSE", message: "응답 형식을 알 수 없어요" };
  if (code !== "00") return { ok: false, code, message: tag(xml, "resultMsg") ?? "API 오류" };
  const items: RawItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item: RawItem = {};
    for (const f of m[1].matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)) item[f[1]] = unescapeXml(f[2]);
    items.push(item);
  }
  return {
    ok: true, items,
    totalCount: Number(tag(xml, "totalCount") ?? items.length) || 0,
    pageNo: Number(tag(xml, "pageNo") ?? 1) || 1,
    numOfRows: Number(tag(xml, "numOfRows") ?? items.length) || items.length,
  };
}

export const ENDPOINT = "https://apis.data.go.kr/B552584/EvCharger";
export type Operation = "getChargerInfo" | "getChargerStatus";

/** 키는 호출 직전에만 붙인다. 로그에는 keyless 쪽만 남긴다 */
export function buildUrl(op: Operation, params: Record<string, string | number>) {
  const query = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
  return { keyless: `${ENDPOINT}/${op}?${query}`, withKey: (key: string) => `${ENDPOINT}/${op}?ServiceKey=${key}&${query}` };
}

/** 페이지 수 — 명세상 한 페이지 최대 9999. totalCount 가 더 크면 다음 페이지를 부른다 */
export const pagesNeeded = (totalCount: number, numOfRows: number) => (numOfRows > 0 ? Math.max(Math.ceil(totalCount / numOfRows), 1) : 1);

/** 하루 호출 예산. 개발계정 한도(1,000, 오너 지시서 인용 · 가이드 대조 전)보다 낮게 잡고, 넘으면 부르지 않고 저장값으로 답한다 */
export class DailyBudget {
  private day = "";
  used = 0;
  constructor(readonly limit: number, private readonly today: () => string) {}
  private roll() { const d = this.today(); if (d !== this.day) { this.day = d; this.used = 0; } }
  tryUse(): boolean { this.roll(); if (this.used >= this.limit) return false; this.used += 1; return true; }
  remaining(): number { this.roll(); return Math.max(this.limit - this.used, 0); }
}

export type CacheEntry<T> = { value: T; at: number };
export class TtlCache<T> {
  private readonly map = new Map<string, CacheEntry<T>>();
  constructor(private readonly ttlMs: number) {}
  fresh(key: string, now: number): CacheEntry<T> | null { const e = this.map.get(key); return e && now - e.at <= this.ttlMs ? e : null; }
  /** 오래됐어도 꺼낸다 — API 가 죽었을 때 '저장값'으로 표시해서 쓰려고. 판단은 받은 시각으로 신뢰를 낮춘다 */
  any(key: string): CacheEntry<T> | null { return this.map.get(key) ?? null; }
  put(key: string, value: T, now: number) { this.map.set(key, { value, at: now }); }
}

/** 프록시 → 앱 응답 — items 는 API 필드 그대로. 정규화는 앱 쪽 거울 코드가 해서 웹·차량이 같은 값을 본다 */
export type ProxyResponse = {
  availability: "OK" | "FAILED" | "NOT_CONNECTED";
  evidence: "LIVE_API" | "CACHED" | "UNKNOWN";
  retrievedAt: number | null;
  errorReason: string | null;
  mapping: Record<string, string[]>;
  mappingReviewed: boolean;
  items: RawItem[];
};

/** 잘못된 연결을 만들 바엔 비운다: 이름에 휴게소 이름과 방향이 **둘 다** 있고 반대 방향 말이 없을 때만 초안으로 올린다. 사람이 검수해 corridor-stations.tsv 에 적는다 */
export function matchStationDraft(stopName: string, direction: string, items: RawItem[]): { statId: string; statNm: string }[] {
  const stem = stopName.replace(/휴게소$/, "");
  const opposite = direction === "부산" ? ["서울", "상행"] : ["부산", "하행"];
  const seen = new Map<string, string>();
  for (const it of items) {
    const n = it.statNm ?? "";
    if (!n.includes(stem) || !n.includes("휴게소")) continue;
    if (!(n.includes(direction) || (direction === "부산" && n.includes("하행")))) continue;
    if (opposite.some((w) => n.includes(w))) continue;
    if (it.statId) seen.set(it.statId, n);
  }
  return [...seen].map(([statId, statNm]) => ({ statId, statNm }));
}
