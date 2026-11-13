// MY CO-PILOT — 최상위 제품 원칙 기준 점검 덱 (2026-11-11). 화면은 에뮬레이터 실측(E27·E28) 앱 창 자른 것
const pptxgen = require("pptxgenjs");
const { applyTheme } = require(process.env.PPTX_SKILL + "/scripts/apply_theme.js");
const OUT = process.argv[2] || "principles.pptx";
const IMG = __dirname + "/svc4/";

const THEME = {
  name: "MY CO-PILOT",
  headFontFace: "Malgun Gothic",
  bodyFontFace: "Malgun Gothic",
  colors: {
    dk1: "0E1A24", lt1: "FFFFFF", dk2: "33424F", lt2: "EEF2F6",
    accent1: "00A37A", accent2: "FF7A45", accent3: "3D5A80", accent4: "9DB4C0", accent5: "E0A21B", accent6: "8A94A0",
    hlink: "00A37A", folHlink: "3D5A80",
  },
};
const HEX = THEME.colors;
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "MY CO-PILOT — 제품 원칙 기준 점검";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

pres.defineSlideMaster({
  title: "TITLE_DARK",
  background: { color: HEX.dk1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 1.7, w: 11.7, h: 1.6, fontSize: 40, bold: true, color: C.background1, valign: "bottom" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.5, w: 11.7, h: 2.8, fontSize: 18, color: C.accent1, valign: "top" }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: HEX.lt2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.25, w: 10.6, h: 0.65, fontSize: 24, bold: true, color: C.text1, valign: "middle" }, text: "" } },
    { text: { text: "MY CO-PILOT · 제품 원칙 기준 점검 · 2026-11-11", options: { x: 0.5, y: 7.1, w: 6, h: 0.28, fontSize: 9, color: C.accent6 } } },
  ],
  slideNumber: { x: 12.3, y: 7.05, w: 0.55, h: 0.36, fontSize: 9, color: HEX.accent6, align: "right" },
});

const T = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, fontSize: 12, color: C.text1, valign: "top", ...o });
const box = (s, x, y, w, h, fill, name, line) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: fill }, line: { color: line || fill, width: line ? 1.25 : 0.75 }, objectName: name });
const bullets = (arr, o = {}) => arr.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < arr.length - 1, paraSpaceAfter: 4, ...o } }));
const tag = (s, t) => T(s, t, { x: 10.9, y: 0.4, w: 1.95, h: 0.35, fontSize: 10, color: C.accent3, align: "right", bold: true });
const H = (t) => ({ text: t, options: { bold: true, color: HEX.lt1, fill: { color: HEX.dk1 }, fontSize: 10.5 } });
function table(s, rows, colW, y = 1.1, fs = 10, rowH = 0.42, name = "table", x = 0.5) {
  const body = rows.map((r, i) => i === 0 ? r : r.map((c) => (typeof c === "object" ? c : { text: c, options: { fontSize: fs, color: HEX.dk1, fill: { color: i % 2 ? "FFFFFF" : "F6F8FA" } } })));
  s.addTable(body, { x, y, w: colW.reduce((a, b) => a + b, 0), colW, border: { type: "solid", pt: 0.5, color: "D5DCE3" }, rowH, valign: "middle", margin: 0.05, objectName: name });
}
const cell = (t, color, bold) => ({ text: t, options: { fontSize: 10, color: color || HEX.dk1, bold: !!bold, fill: { color: "FFFFFF" } } });

/** 실증 화면 — 위에 에뮬레이터 캡처 1~3장, 아래 세 칸: 원칙 기여 · 운전자의 일 · 근거와 한계 */
function proof({ section, title, shots, principles, work, evidence }) {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
  s.addText(title, { placeholder: "title" });
  tag(s, section);
  const n = shots.length, gap = 0.2, h = n === 3 ? 2.75 : 3.0, w = h * 1100 / 780;
  const total = n * w + (n - 1) * gap, x0 = 0.5 + (12.3 - total) / 2;
  shots.forEach(([f, cap], i) => {
    const x = x0 + i * (w + gap);
    s.addImage({ path: IMG + f + ".jpg", x, y: 1.0, w, h, altText: cap, objectName: "shot-" + f });
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.0, w, h, fill: { type: "none" }, line: { color: "C9D2DB", width: 0.75 }, objectName: "frame-" + f });
    T(s, cap, { x, y: 1.0 + h + 0.05, w, h: 0.3, fontSize: 9.5, color: C.text2, align: "center" });
  });
  const y = 1.0 + h + 0.45, ch = 6.95 - y, cw = 3.98;
  [["원칙 기여", principles, HEX.accent1], ["줄어든 운전자의 일", work, HEX.accent3], ["근거 · 한계", evidence, HEX.accent2]].forEach(([head, items, col], i) => {
    const x = 0.5 + i * (cw + 0.18);
    box(s, x, y, cw, ch, HEX.lt1, "col-" + i);
    T(s, head, { x: x + 0.18, y: y + 0.12, w: cw - 0.36, h: 0.3, fontSize: 12, bold: true, color: col });
    T(s, bullets(items), { x: x + 0.18, y: y + 0.48, w: cw - 0.36, h: ch - 0.58, fontSize: 10.5, color: C.text1 });
  });
  return s;
}

// ── 1. 표지 ───────────────────────────────────────────
pres.addSection({ title: "원칙" });
{
  const s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "원칙" });
  s.addText("여러 앱을 오가던 운전자의 일을,\n하나의 지능형 이동 경험으로.", { placeholder: "title" });
  s.addText([
    { text: "MY CO-PILOT — 최상위 제품 원칙(2026-11-11) 기준으로 지금 제품을 다시 본다", options: { breakLine: true } },
    { text: "순서: 철학이 살아 있나 → 운전자의 일이 줄었나 → 현대차 기본 기능과 구분되나 → 그다음 UI·안전", options: { breakLine: true, fontSize: 14, color: C.accent4 } },
    { text: "화면: Pleos Connect Emulator 실측(E27·E28) · 브랜치 ux-review-2026-11-11 · 제출본(copilot-submit)과 다를 수 있음", options: { fontSize: 13, color: C.accent5 } },
  ], { placeholder: "body" });
}

// ── 2. 여섯 철학 ──────────────────────────────────────
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "원칙" });
  s.addText("절대 유지할 여섯 가지 철학 — 01·04 가 존재 이유", { placeholder: "title" });
  const P = [
    ["01", "Multi-Service Integration", "여러 앱·서비스의 정보를 실제로 연결한다", true],
    ["02", "Context-Aware Intelligence", "운전자·동승자·차량·목적·일정에 맞춰 판단한다", false],
    ["03", "Goal-Oriented Assistance", "도착이 아니라 사용자가 하려는 실제 일을 돕는다", false],
    ["04", "Minimum Driver Effort", "검색·앱 전환·비교·입력을 최소화한다", true],
    ["05", "One Decision, Verified Execution", "선택 하나 → 승인 → 실행 → 결과 확인", false],
    ["06", "Trust & Driving Safety", "모르는 것은 단정하지 않고, 안전과 통제권을 지킨다", false],
  ];
  const w = 3.95, h = 2.55;
  P.forEach(([n, name, d, core], i) => {
    const x = 0.5 + (i % 3) * (w + 0.22), y = 1.15 + Math.floor(i / 3) * (h + 0.22);
    box(s, x, y, w, h, core ? HEX.accent1 : HEX.lt1, "p-" + n);
    T(s, n, { x: x + 0.25, y: y + 0.22, w: 1, h: 0.6, fontSize: 30, bold: true, color: core ? C.background1 : C.accent1 });
    T(s, name, { x: x + 0.25, y: y + 0.95, w: w - 0.5, h: 0.45, fontSize: 15, bold: true, color: core ? C.background1 : C.text1 });
    T(s, d, { x: x + 0.25, y: y + 1.5, w: w - 0.5, h: 0.9, fontSize: 12, color: core ? C.background1 : C.text2 });
  });
  T(s, "신규 기능과 UX 변경은 이 중 어디에 기여하는지 먼저 설명한다 — 설명되지 않으면 우선순위를 올리지 않는다(변경 통제)", { x: 0.5, y: 6.65, w: 12.3, h: 0.35, fontSize: 11, color: C.text2 });
}

// ── 3. 정직한 현황 ────────────────────────────────────
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "원칙" });
  s.addText("지금 실제로 통합된 것 — 비EV 외부 서비스 통합은 0개", { placeholder: "title" });
  const ok = (t) => cell(t, "00805F", true), no = (t) => cell(t, "C2410C", true), mid = (t) => cell(t, "33424F");
  table(s, [
    [H("묶음"), H("외부 데이터"), H("판단에 쓰나"), H("앱 전환이 줄어드나"), H("승인→실행→확인"), H("조건이 바뀌면 다시")],
    [cell("배터리 + 공공 충전소 API + 내비 (EV)", HEX.dk1, true), ok("있음 [실 API] 77기"), ok("에너지 예산 · 순위"), ok("충전 앱 · 지도 대신"), ok("경유지 추가 → 재조회 [에뮬]"), ok("SOC · 상태 갱신 [에뮬]")],
    [cell("픽업 Mission + 차량 설정 + 내비 귀가", HEX.dk1, true), no("없음 (앱 안 정보)"), ok("대기 계획 · 귀가"), mid("일부 — 내비 검색 대신 '집으로'"), ok("requestRoute → 재조회 [에뮬]"), mid("대기 계획만")],
    [cell("일정 + 주차 + 내비 (ARRIVE READY)", HEX.dk1, true), mid("주차 [실 API] · 일정 없음 → 입력"), no("미구현"), no("—"), mid("관문 C 통과 (코드 없음)"), no("—")],
  ], [3.0, 2.0, 1.75, 2.05, 1.9, 1.6], 1.15, 10, 0.62, "status");
  box(s, 0.5, 4.2, 12.3, 2.45, HEX.lt1, "verdict");
  T(s, "판정", { x: 0.7, y: 4.32, w: 3, h: 0.3, fontSize: 13, bold: true, color: C.accent2 });
  T(s, bullets([
    "외부 서비스 정보가 판단을 바꾸는 사례는 EV 충전 하나 — 이대로면 'EV 충전 추천 앱'으로 줄어든다(막을 실패 2번)",
    "픽업·귀가는 Mission 과 내비를 잇지만 외부 서비스가 없다 — 핵심 기준(서비스 두 개 이상 결합)에 못 미친다",
    "세 차례 화면 수정은 기반(차량 제어 · 승인 · 실행 확인 · 신뢰)을 다졌다 — 이제 UI 가 아니라 비EV 통합으로 간다",
  ]), { x: 0.7, y: 4.72, w: 11.9, h: 1.85, fontSize: 12 });
}

// ── 4. Journey OS 구조 ────────────────────────────────
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "원칙" });
  s.addText("Journey OS — 여섯 계층과 지금 코드", { placeholder: "title" });
  table(s, [
    [H("계층"), H("역할"), H("지금 있는 것"), H("상태")],
    ["Journey Goal Engine", "사용자의 실제 이동 목표", "V5 Mission(픽업·대기·귀가) · Journey Goal 스펙", { text: "부분 · 목표 유형 하나", options: { fontSize: 10, color: "B45309", fill: { color: "FFFFFF" } } }],
    ["Context Engine", "차량 · 운전자 · 동승자 · 이동 상태", "situation · journey · cabin (TS ↔ Kotlin)", { text: "있음 [에뮬]", options: { fontSize: 10, color: "00805F", fill: { color: "F6F8FA" } } }],
    ["Service Integration Layer", "내비 · 충전 · 주차 · 일정", "NaviHelper [에뮬] · 충전소 프록시 [실 API] · 주차 관문만 · 일정 없음", { text: "충전만 연결", options: { fontSize: 10, color: "C2410C", fill: { color: "FFFFFF" } } }],
    ["Decision Engine", "필수조건 · 비교 · 추천", "V6 IntegratedDecision(예산 줄 · 순위를 가른 기준)", { text: "있음 — EV 한정", options: { fontSize: 10, color: "B45309", fill: { color: "F6F8FA" } } }],
    ["Action & Verification", "승인 · 실행 · 재조회", "WaypointHandoff · RouteHandoff · Cabin settle", { text: "있음 [에뮬]", options: { fontSize: 10, color: "00805F", fill: { color: "FFFFFF" } } }],
    ["Safety & Trust", "주행 제한 · 권한 · 최신성 · 오류", "SafetyGate · 신선도 · 출처 표시(E28 에서 7건 보정)", { text: "있음 [에뮬]", options: { fontSize: 10, color: "00805F", fill: { color: "F6F8FA" } } }],
  ], [2.6, 2.7, 5.0, 2.0], 1.15, 10.5, 0.62, "layers");
  T(s, "EV 에너지 판단 · 공조·시트 개인화는 이 플랫폼 아래의 전문 모듈이다. 비어 있는 곳은 Service Integration(주차·일정)과 Goal Engine(목표 유형) — ARRIVE READY 가 채운다", { x: 0.5, y: 5.75, w: 12.3, h: 0.7, fontSize: 12, color: C.text2 });
}

// ── 5. 주력 경험 넷 ───────────────────────────────────
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "원칙" });
  s.addText("사용자가 해결하려는 일 — 넷, 하나의 엔진(탭이 아니다)", { placeholder: "title" });
  const E = [
    ["1", "ARRIVE READY", "약속에 맞춰 방문하기", "일정 · 목적지 · 이동 시간 · 주차를 이어 실제로 방문할 수 있는 계획", "미구현 · 관문 A·B·C 통과", HEX.accent2],
    ["2", "JOURNEY RECOVERY", "계획이 틀어졌을 때", "외부 조건이 바뀌면 앱을 다시 열지 않고 대안", "충전·배터리 [에뮬] · 주차·교통 미구현", HEX.accent5],
    ["3", "FAMILY JOURNEY", "가족 이동을 끊김 없이", "픽업 · 대기 · 귀가를 하나의 Mission 으로", "구현 [에뮬 E28] · 외부 연동 없음", HEX.accent3],
    ["4", "ENERGY & STOP", "충전과 휴식을 하나로", "EV 에너지 + 실제 충전소 상태 + 동승자 → 경유지", "V6 [실 API]·[에뮬] · EV 전문 모듈", HEX.accent1],
  ];
  const w = 2.95;
  E.forEach(([n, name, sub, d, st, col], i) => {
    const x = 0.5 + i * (w + 0.17), y = 1.15;
    box(s, x, y, w, 5.3, HEX.lt1, "e-" + n, col);
    T(s, n, { x: x + 0.22, y: y + 0.2, w: 0.6, h: 0.6, fontSize: 28, bold: true, color: col });
    T(s, name, { x: x + 0.22, y: y + 0.95, w: w - 0.44, h: 0.4, fontSize: 15, bold: true });
    T(s, sub, { x: x + 0.22, y: y + 1.4, w: w - 0.44, h: 0.35, fontSize: 12, color: C.text2 });
    T(s, d, { x: x + 0.22, y: y + 1.95, w: w - 0.44, h: 1.6, fontSize: 12 });
    T(s, st, { x: x + 0.22, y: y + 4.2, w: w - 0.44, h: 0.9, fontSize: 11, bold: true, color: col });
  });
  T(s, "가장 큰 차별화 = ARRIVE READY → JOURNEY RECOVERY 연결: 이동 중 주차·도착 조건이 틀어져도 주차 앱을 다시 열고 목적지를 다시 입력하지 않게", { x: 0.5, y: 6.6, w: 12.3, h: 0.35, fontSize: 11.5, bold: true, color: C.accent3 });
}

// ── 6~9. 실증 ─────────────────────────────────────────
pres.addSection({ title: "실증" });
proof({
  section: "실증", title: "ENERGY & STOP — 유일한 실제 외부 서비스 통합",
  shots: [["E28-12-live-recommend-chilgok", "공공 충전소 API → 추천 하나"], ["E27-04-navi-waypoint-included", "승인 → 내비 경로에 경유지"], ["E28-13-waypoint-verified-same-activity", "목록 재조회로 반영 확인"]],
  principles: ["01 배터리 · 공공 충전소 상태 · 내비 경유지를 하나의 판단으로", "05 경유지로 추가 → 콜백·재조회로 확인", "06 '빈 충전기 N기 표시 · 조회 시각 · 현장 대기 인원은 모름'"],
  work: ["충전 앱에서 휴게소별 상태 찾기", "남은 거리·대기 후 잔량 머릿속 계산", "내비에 경유지 직접 입력", "→ 추천 확인 + 승인 1탭"],
  evidence: ["[실 API] 충전기 77기(매핑 휴게소 8곳) · [에뮬] ADD 콜백 7~9초", "EV 에서만 켜진다 — 비EV 운전자에게는 없는 가치", "실시간 교통·실제 우회 시간은 모른다(추가 N분 안 씀)"],
});
proof({
  section: "실증", title: "JOURNEY RECOVERY — 상황이 바뀌면 다시 판단",
  shots: [["E27-06-stale-status-no-recommend", "상태가 오래됨 → 권하지 않음"], ["E27-07-recheck-decision-changed", "새 상태 → 판단이 바뀜"], ["E27-14-soc40-recovery", "배터리 40% → 닿지 못함 · 대안"]],
  principles: ["01·05 외부 상태와 차량 값이 바뀌면 같은 엔진이 다시 판단", "06 오래된 정보로 확정 추천하지 않는다", "결과가 달라질 때만 알린다"],
  work: ["충전소 앱을 다시 열어 새 상태 확인", "남은 배터리로 닿는지 다시 계산", "→ '판단이 바뀌었어요 · 대신 ○○' 한 줄"],
  evidence: ["[에뮬] Virtual Console SOC 40% · [실 API] 상태 갱신", "지금은 충전 조건만 — 주차 대수·소요 시간 변화는 미구현", "ARRIVE READY 와 이어질 때 차별화가 커진다"],
});
proof({
  section: "실증", title: "FAMILY JOURNEY — 픽업 · 대기 · 귀가를 하나의 Mission 으로",
  shots: [["E28-05-reask-after-20min", "대기 계획대로 한 번만 묻기"], ["E28-06-home-route-verified", "실제 내비 귀가 경로 확인"], ["E28-09-history-unchecked", "하차 기록 · '확인 안 함'"]],
  principles: ["03 도착이 끝이 아니다 — 귀가까지 기억", "04 10분마다 묻지 않고 대기 계획대로(3→2번)", "05 '집으로 안내 시작' → 목적지 재조회 확인"],
  work: ["학원 앞에서 내비에 집을 다시 찾아 입력", "기다리는 동안 반복 알림 끄기", "→ 귀가 확인 + 안내 시작 2탭"],
  evidence: ["[에뮬 E28] requestRoute → onRouteStarted 8.4초 → poiId 일치", "외부 서비스가 없다 — 일정·교통이 붙어야 핵심 기준 충족", "도착은 '근처 정차' + 사용자 확인(0.5km · 내비 도착 이벤트 안 씀)"],
});
proof({
  section: "실증", title: "보조 기능 — 핵심 경험을 받치는 자리",
  shots: [["E28-02-seat-vent-applied-vehicle", "실제 통풍시트 set → 콜백 확인"], ["E28-10-dad-last-trip", "운전자별 '지난번처럼'"], ["E28-08-finish-2of5", "체크리스트는 기록, 완료 조건 아님"]],
  principles: ["02 운전자·탑승 조합에 맞춘 실내 준비", "05 항목마다 적용 확인", "06 앞 운전자의 이동을 다음 사람에게 보이지 않음"],
  work: ["차량 설정 메뉴를 열어 하나씩 맞추기", "지난 이동을 다시 고르기", "→ 다른 것만 승인 1탭"],
  evidence: ["[에뮬] HVAC_SEAT_VENTILATION 콜백", "핵심 상품으로 내세우지 않는다 — 차량 설정 앱이 되면 실패(막을 실패 1)", "재이용 준비는 2→3탭으로 늘었다(운전자 격리 비용)"],
});

// ── 10~11. 신뢰 ───────────────────────────────────────
pres.addSection({ title: "신뢰" });
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "신뢰" });
  s.addText("E28 — 폰에서는 안 보이던 결함 7건 (06 Trust & Driving Safety)", { placeholder: "title" });
  table(s, [
    [H("#"), H("결함"), H("왜 원칙 위반인가"), H("대응 · 재확인")],
    ["D4", "내비가 창을 가져간 뒤 셸 아이콘으로 돌아오면 화면이 쌓여 '경로 확인됨'이 '요청 전'으로", "05 실행 확인 결과를 사용자가 잃는다 — 시연에서 그대로 보인다", "singleTask · 같은 화면 · 상태 유지 ✅"],
    ["D6", "방금 받은 충전소 상태를 전부 '오래됐어요' → 권할 곳 없음", "01 실제 데이터를 받고도 판단에 못 쓴다(PC 시계 2초 앞섬)", "5분 이내 시계 차이 허용 · 칠곡 추천 ✅"],
    ["D2", "모의 기어인데 주차 근거가 '차량 정보'", "06 · 정책 4 — 모의와 실제를 섞어 말함", "제안별 신호로 출처 판정 ✅"],
    ["D8", "모의 주행 뒤 배터리 '7% · 차량 정보'(실제 100%)", "06 · 정책 4", "실제 값 받는 중이면 모의가 덮지 않음 ✅"],
    ["D5", "실제 도어 값을 '시연 데이터'로", "06 출처 표시 틀림", "cabinLive 면 '차량 정보' ✅"],
    ["D1·D3", "'근처 정차'인데 칩은 '도착' · 앱이 센 거리를 '(내비)'", "06 단정 · 출처 과장", "'목적지 근처' · '(이동 계획 기준)' 추정"],
    ["D7", "앱 켠 직후 첫 충전소 조회 30초 실패(다시 확인은 성공)", "그 사이 예전 엔진 카드가 보임", "원인 미확인 · '판단 중' 표시 필요"],
  ], [0.75, 4.4, 4.0, 3.15], 1.1, 10, 0.66, "defects");
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "신뢰" });
  s.addText("수정 전 / 후 — 실행 확인을 잃지 않고, 실제 데이터를 버리지 않는다", { placeholder: "title" });
  const pairs = [["E28-07-D4-stacked-activity-lost-state", "D4 전 · '경로 요청 전'으로 보임"], ["E28-13-waypoint-verified-same-activity", "D4 후 · 돌아와도 '경유지에 있어요'"], ["E28-11-D6-stale-by-clock-skew", "D6 전 · 최신 데이터가 '오래됐어요'"], ["E28-12-live-recommend-chilgok", "D6 후 · 빈 충전기 13기 · 칠곡 추천"]];
  const h = 2.6, w = h * 1100 / 780;
  pairs.forEach(([f, cap], i) => {
    const x = 0.5 + (i % 2) * (w + 0.3) + 1.6, y = 1.0 + Math.floor(i / 2) * (h + 0.45);
    s.addImage({ path: IMG + f + ".jpg", x, y, w, h, altText: cap, objectName: "ba-" + i });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { type: "none" }, line: { color: i % 2 ? HEX.accent1 : HEX.accent2, width: 1.5 }, objectName: "baf-" + i });
    T(s, cap, { x, y: y + h + 0.04, w, h: 0.3, fontSize: 10, color: C.text2, align: "center" });
  });
}

// ── 12~14. ARRIVE READY ───────────────────────────────
pres.addSection({ title: "ARRIVE READY" });
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "ARRIVE READY" });
  s.addText("ARRIVE READY — 데이터는 확인됐다, 코드는 없다", { placeholder: "title" });
  s.addImage({ path: IMG + "E27-01-gateC-parking-destination.jpg", x: 0.5, y: 1.05, w: 5.0, h: 5.0 * 780 / 1100, altText: "관문 C", objectName: "gateC" });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.05, w: 5.0, h: 5.0 * 780 / 1100, fill: { type: "none" }, line: { color: "C9D2DB", width: 0.75 }, objectName: "gateC-f" });
  T(s, "관문 C [에뮬 E27] · 주차장 좌표로 requestRoute(poiId 없이) → 7.9초 뒤 경로 시작 · 목적지 재조회 같은 좌표 · 내비 44분 23km", { x: 0.5, y: 4.65, w: 5.0, h: 0.6, fontSize: 10, color: C.text2 });
  table(s, [
    [H("관문"), H("질문"), H("결과")],
    ["A", "주차 위치·운영·잔여를 받나", "통과 [실 API] — 서울 시영 실시간 105곳(20분 이내 대수 + 좌표)"],
    ["B", "판단에 쓸 소요 시간을 받나", "통과 [에뮬] — requestTrip 목적지 없이도 · 경로 변경 없이 0.2~0.4초"],
    ["C", "주차장 승인 → 내비 반영 → 확인", "통과 [에뮬] — 왼쪽 화면"],
    ["D", "오래된·틀린 데이터에 확정 추천 안 하나", "설계 — 신선도 규칙 테스트 남음"],
    ["E", "기존 방식보다 일이 주나", "미실시 — 측정 전 수치 안 씀"],
    ["—", "일정", "차량에 일정 제공자 없음 → 사용자 입력('일정 앱 연동'이라 하지 않음)"],
  ], [0.6, 2.6, 3.8], 1.05, 10, 0.55, "gates", 5.8);
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "ARRIVE READY" });
  s.addText("ARRIVE READY 승인 문서 A~J — 핵심 기능 기준을 넘는가", { placeholder: "title" });
  table(s, [
    [H(""), H("답")],
    ["A 원래 하던 일", "약속 확인 → 근처 주차장 검색 → 빈자리·운영시간·요금 비교 → 주차장까지 시간 확인 → 제시간에 되는지 계산 → 내비에 입력"],
    ["B 오가는 앱", "3~4개 — 일정(메시지) · 지도/주차 앱 · 내비(시간 확인 + 목적지 입력) · 비교는 사람 머리로"],
    ["C 데이터", "약속: 사용자 입력 · 주차: 서울 시영 실시간 105곳 [실 API] · 소요 시간: requestTrip [에뮬] · 실행: requestRoute [에뮬]"],
    ["D 결합 판단", "후보마다 (약속 − 지금 − 소요 − 사용자 여유)를 범위로 → 여유 / 빠듯 / 판단 불가 · 빈자리 신선도 · 운영시간"],
    ["E 달라지는 행동", "어느 주차장으로 보낼지 · 지금 출발해야 하는지 · 빠듯하면 '약속 조정이 필요할 수 있어요'(지각 시각을 만들지 않음)"],
    ["F 조작", "약속 입력(프리셋 1탭) → 추천 확인 → 승인 1탭 (기존 경로가 있으면 교체 확인 1탭)"],
    ["G 실행·확인", "requestRoute → onRouteStarted → 목적지 재조회 같은 좌표면 '내비가 확인함'"],
    ["H 실패", "STALE → 대수 안 씀 · 좌표 없음 → 제외 · ETA 없음 → 판단 불가 · 응답 없음 → 재조회 · 서울 시영 밖 → 범위 밖"],
    ["I 비EV", "동력원 무관 — EV 면 ENERGY & STOP 이 같은 목표에 붙는다"],
    ["J 반복", "업무 방문 · 병원 · 학원 · 약속 — 시간이 정해진 방문은 일상"],
  ], [1.9, 10.4], 1.05, 10, 0.5, "aj");
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "ARRIVE READY" });
  s.addText("ARRIVE READY v0 — 약속 하나로 주차·도착·내비를 잇는다 [미구현]", { placeholder: "title" });
  const steps = [
    ["약속 입력", "시각 · 장소\n(프리셋 1탭)", "사용자", HEX.accent6],
    ["주차 후보", "서울 시영 실시간\n대수 · 갱신 시각 · 운영", "[실 API]", HEX.accent1],
    ["소요 시간", "후보마다\nrequestTrip", "[에뮬]", HEX.accent3],
    ["판단 하나", "여유 범위 · 신선도\n순위를 가른 기준", "[미구현]", HEX.accent2],
    ["승인 → 실행", "requestRoute\n→ 목적지 재조회", "[에뮬]", HEX.accent3],
    ["다시 판단", "대수 · 소요 시간 변화\n→ 대안 하나", "[미구현]", HEX.accent2],
  ];
  const w = 1.92;
  steps.forEach(([h, d, ev, col], i) => {
    const x = 0.5 + i * (w + 0.16), y = 1.35;
    box(s, x, y, w, 2.3, HEX.lt1, "f-" + i, col);
    T(s, h, { x: x + 0.15, y: y + 0.2, w: w - 0.3, h: 0.4, fontSize: 14, bold: true, color: col });
    T(s, d, { x: x + 0.15, y: y + 0.75, w: w - 0.3, h: 0.9, fontSize: 11, color: C.text2 });
    T(s, ev, { x: x + 0.15, y: y + 1.8, w: w - 0.3, h: 0.3, fontSize: 10.5, bold: true, color: col });
    if (i < steps.length - 1) T(s, "›", { x: x + w - 0.02, y: y + 0.85, w: 0.2, h: 0.4, fontSize: 20, bold: true, color: C.accent6, align: "center" });
  });
  box(s, 0.5, 4.0, 6.05, 2.65, HEX.lt1, "fit");
  T(s, "다섯 기준에 맞춘 것", { x: 0.7, y: 4.12, w: 5.7, h: 0.3, fontSize: 12.5, bold: true, color: C.accent1 });
  T(s, bullets(["① 외부 데이터 실제 확보 — 주차 [실 API]", "② 차량·내비와 함께 판단 — 소요 시간 + 대수 + 운영시간", "③ 다른 앱을 열 일이 준다 — 지도·주차 앱·내비 검색 대신", "④ 승인하면 실제 반영 — requestRoute + 재조회", "⑤ 조건이 바뀌면 다시 — 결과가 달라질 때만"]), { x: 0.7, y: 4.5, w: 5.7, h: 2.1, fontSize: 11 });
  box(s, 6.75, 4.0, 6.05, 2.65, HEX.lt1, "not");
  T(s, "만들지 않는 것", { x: 6.95, y: 4.12, w: 5.7, h: 0.3, fontSize: 12.5, bold: true, color: C.accent2 });
  T(s, bullets(["주차장 검색 화면 · 지도 · 일정 앱", "걸어가는 시간 · 빈자리 예측 · 지각 시각(근거 없음 — 여유는 사용자가 정한다)", "서울 시영 밖 주차장(범위 밖이라고 쓴다)", "새 탭 — '지금 이동'의 목표 카드로"]), { x: 6.95, y: 4.5, w: 5.7, h: 2.1, fontSize: 11 });
}

// ── 15. 막을 실패 ─────────────────────────────────────
pres.addSection({ title: "점검" });
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "점검" });
  s.addText("막을 실패 — 지금 우리는 어디에 가까운가 (자가 점검)", { placeholder: "title" });
  const hi = (t) => cell(t, "C2410C", true), md = (t) => cell(t, "B45309", true), lo = (t) => cell(t, "00805F", true);
  table(s, [
    [H("실패"), H("위험"), H("지금 근거"), H("대응")],
    [cell("EV 충전 추천 앱으로 축소"), hi("높음"), cell("외부 통합 사례가 EV 충전 하나"), cell("ARRIVE READY 를 첫 비EV 통합으로")],
    [cell("UI 수정이 핵심 기능을 늦춤"), hi("높음"), cell("11/11 하루 화면 수정 3회 · 덱 3개"), cell("화면 다듬기 중단 · P1~P3 로")],
    [cell("차량 설정 앱"), md("중간"), cell("출발 준비(공조·시트)가 첫 화면 카드"), cell("보조로 — '지금 이동' 카드 순서에서 뒤로")],
    [cell("런처 · 대시보드"), md("중간"), cell("기능 탭 7개 · 값의 출처 패널"), cell("'지금 이동 / 이동 기록 / 내 설정'(11/15 뒤)")],
    [cell("입력 반복 · 카드 동시 노출"), md("중간"), cell("재이용 3탭 · 홈에 카드 여럿"), cell("목표 카드 하나 · 운전자 인식 API 확인되면 줄임")],
    [cell("조회 성공을 판단 성공으로 과장"), lo("관리됨"), cell("증거 등급 [실 API]·[에뮬]·[시연]·[미구현]"), cell("'통합 완료'는 실증 기준 8절을 넘을 때만")],
    [cell("없는 실행·연동을 있다고 표시"), lo("관리됨"), cell("재조회 확인 · E28 출처 표시 7건 보정"), cell("일정 연동은 미구현으로 표기 유지")],
    [cell("근거 없는 전 차종 지원"), lo("관리됨"), cell("EV 판단은 EV 만 · 연료 계산 '지원 안 함'"), cell("ARRIVE READY 는 동력원 무관")],
  ], [3.1, 1.0, 4.1, 4.1], 1.1, 10, 0.58, "failures");
}

// ── 16. 우선순위 · 결정 ───────────────────────────────
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "점검" });
  s.addText("우선순위 P0~P5 · 지금 필요한 오너 결정", { placeholder: "title" });
  table(s, [
    [H("순서"), H("목표"), H("성공 기준"), H("지금")],
    ["P0", "1차 제출본 안정화(11/15)", "서류 · APK · 영상 · 익명성 — 검증된 V6 보호", "제출본 d1ed8c4 · E28 수정은 미반영"],
    ["P1", "ARRIVE READY 데이터 관문", "실제 주차 + 쓸 수 있는 ETA·경로", "A·B·C 통과 · D·E 남음"],
    ["P2", "Journey Goal Engine", "목표 · 제약 · 서비스 데이터 · 실행 결과 통합", "Mission 하나 · 스펙 있음"],
    ["P3", "비EV 통합 시나리오", "일정(입력) · 주차 · 내비 → 판단 → 승인 → 실행", "계획 · A~J 작성"],
    ["P4", "JOURNEY RECOVERY", "조건 변경 시 근거 있는 대안", "충전 조건만"],
    ["P5", "사용성 검증", "앱 전환 · 터치 · 판단 시간 비교", "기준선만(캡처에서 센 값)"],
  ], [0.8, 3.0, 4.6, 3.9], 1.05, 10.5, 0.48, "prio");
  box(s, 0.5, 4.6, 12.3, 2.05, HEX.lt1, "decide", HEX.accent2);
  T(s, "오너 결정", { x: 0.7, y: 4.72, w: 3, h: 0.3, fontSize: 13, bold: true, color: C.accent2 });
  T(s, bullets([
    "P0 — E28 결함 수정(특히 D4 화면 쌓임 · D6 최신 데이터를 '오래됨'으로)을 11/15 제출본에 넣을지: 전부 / 결함 수정만 / 넣지 않음",
    "P3 — ARRIVE READY v0 를 언제 시작할지: 11/15 뒤(원칙대로) / 지금 별도 브랜치(제출 자료에는 '관문 통과·설계'까지만)",
    "제출 양식 02 · PPT · 영상 문구를 원칙에 맞춰 점검 — '통합 사례 = EV 충전 하나 + ARRIVE READY 관문 통과 [미구현]'",
  ]), { x: 0.7, y: 5.1, w: 11.9, h: 1.5, fontSize: 11.5 });
}

// ── 17. 맺음 ──────────────────────────────────────────
{
  const s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "점검" });
  s.addText("기능을 많이 만든 앱이 아니라,\n운전자의 일을 실제로 줄인 앱.", { placeholder: "title" });
  s.addText([
    { text: "앞으로 기능을 더하기 전에 먼저 보고한다 — ① 여섯 철학 중 어디에 ② 사용자의 어떤 일이 사라지나 ③ 검증된 기능·일정에 주는 영향", options: { breakLine: true } },
    { text: "본선 최우선: 실제로 작동하는 비EV 외부 서비스 통합 장면 · 실제 구현·측정·검증된 차별성으로 경쟁한다", options: { fontSize: 14, color: C.accent4 } },
  ], { placeholder: "body" });
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("ok", OUT);
})();
