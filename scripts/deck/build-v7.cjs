// MY CO-PILOT 2차 시안 덱(V7 · Journey OS) — pptxgenjs 구조형(테마 · 레이아웃 · 플레이스홀더 · 섹션)
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const md = require("react-icons/md");
const { applyTheme } = require(process.env.PPTX_SKILL + "/scripts/apply_theme.js");

const OUT = process.argv[2] || "MY-CO-PILOT_2차시안_JourneyOS.pptx";
const IMG = __dirname + "/img/";

const THEME = {
  name: "MY CO-PILOT",
  headFontFace: "Malgun Gothic",
  bodyFontFace: "Malgun Gothic",
  colors: {
    dk1: "0E1A24", lt1: "FFFFFF", dk2: "33424F", lt2: "EDF6F2",
    accent1: "00A37A", accent2: "FF7A45", accent3: "3D5A80", accent4: "9DB4C0", accent5: "E0A21B", accent6: "8A94A0",
    hlink: "00A37A", folHlink: "3D5A80",
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.title = "MY CO-PILOT — Journey OS (2차 시안)";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

// ── 아이콘 ─────────────────────────────────────────────
async function icon(name, color = "#FFFFFF", size = 256) {
  const Comp = md[name];
  if (!Comp) throw new Error("아이콘 없음: " + name);
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

// ── 레이아웃 ───────────────────────────────────────────
pres.defineSlideMaster({
  title: "TITLE_DARK",
  background: { color: HEX.dk1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 2.3, w: 11.7, h: 1.4, fontSize: 54, bold: true, color: C.background1, valign: "bottom" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.85, w: 11.0, h: 1.3, fontSize: 22, color: C.accent1, valign: "top" }, text: "" } },
    { text: { text: "현대자동차그룹 차량용 앱 개발 공모전 2026 · Pleos Connect · 2차 시안 (V7)", options: { x: 0.8, y: 6.55, w: 11.5, h: 0.4, fontSize: 12, color: C.accent4 } } },
  ],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: HEX.lt1 },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.4, w: 12.1, h: 0.85, fontSize: 30, bold: true, color: C.text1, valign: "middle" }, text: "" } },
    { text: { text: "MY CO-PILOT — Journey OS · 2차 시안", options: { x: 0.6, y: 7.0, w: 5, h: 0.3, fontSize: 10, color: C.accent6 } } },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: HEX.accent6, align: "right" },
});
pres.defineSlideMaster({
  title: "CLOSING_DARK",
  background: { color: HEX.dk1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 2.0, w: 11.7, h: 2.0, fontSize: 36, bold: true, color: C.background1, valign: "bottom" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 4.2, w: 11.7, h: 1.4, fontSize: 20, color: C.accent1, valign: "top" }, text: "" } },
  ],
});

// ── 공통 부품 ──────────────────────────────────────────
const T = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, fontSize: 14, color: C.text1, valign: "top", ...o });
function card(s, x, y, w, h, name, fill = C.background2) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: fill }, objectName: name });
}
async function iconDot(s, x, y, d, name, fill = C.accent1, objectName = "icon") {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill }, objectName: objectName + "-bg" });
  const pad = d * 0.22;
  s.addImage({ data: await icon(name), x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad, objectName });
}
const BADGE = { 에뮬: C.accent1, "실 API": C.accent3, 시연: C.accent5, 미구현: C.accent6, 설계: C.text2, 계획: C.accent2, "개발 중": C.accent2 };
function badge(s, x, y, label, w = 0.95) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.32, rectRadius: 0.16, fill: { color: BADGE[label] }, line: { color: BADGE[label] }, objectName: "badge-" + label });
  T(s, label, { x, y, w, h: 0.32, fontSize: 11, bold: true, color: C.background1, align: "center", valign: "middle" });
}
function shot(s, file, x, y, w, h, name) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x - 0.05, y: y - 0.05, w: w + 0.1, h: h + 0.1, rectRadius: 0.08, fill: { color: C.background1 }, line: { color: HEX.accent4, width: 1 }, objectName: name + "-frame" });
  s.addImage({ path: IMG + file, x, y, w, h, objectName: name, altText: name });
}
// 비율 유지해 상자 안에 맞춘다
function fit(wpx, hpx, boxW, boxH) { const r = Math.min(boxW / wpx, boxH / hpx); return { w: wpx * r, h: hpx * r }; }
// 상태 꼬리표 — 배지 여러 개를 오른쪽 끝에서 왼쪽으로 늘어놓는다
function badgesRight(s, right, y, labels) {
  let x = right;
  for (const l of [...labels].reverse()) { const w = l.length > 2 ? 1.05 : 0.95; x -= w; badge(s, x, y, l, w); x -= 0.1; }
}
const FOOT = (s, text, y = 6.5, h = 0.4) => T(s, text, { x: 0.6, y, w: 12.1, h, fontSize: 11, color: C.accent6 });

(async () => {
  // 1. 표지
  pres.addSection({ title: "시작" });
  let s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "시작" });
  s.addText("MY CO-PILOT — Journey OS", { placeholder: "title" });
  s.addText("목적지를 알려주는 차에서, 목적을 달성하도록 돕는 차로.\n이동 목표를 이해하고, 여러 서비스의 조건을 함께 판단하고, 승인된 행동의 반영까지 확인하는 차량용 코파일럿", { placeholder: "body" });
  await iconDot(s, 0.8, 1.15, 0.9, "MdFlag", C.accent1, "cover-icon");
  s.addNotes("MY CO-PILOT — Journey OS 입니다. 한 문장으로 말씀드리면, 목적지를 알려주는 차에서 목적을 달성하도록 돕는 차로 가는 서비스입니다. Journey OS 는 운영체제를 대체한다는 뜻이 아니라, 운전자의 이동 목표를 관리하는 앱 계층의 이름입니다.");

  // 2. 문제 — 도착 ≠ 성공
  pres.addSection({ title: "문제" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "문제" });
  s.addText("도착했다고 이동이 끝난 것은 아닙니다", { placeholder: "title" });
  T(s, "예: 오후 3시 고객사 미팅 — 이동이 성공하려면", { x: 0.6, y: 1.35, w: 12.1, h: 0.45, fontSize: 17, bold: true, color: C.accent3 });
  const need = [
    ["MdSchedule", "언제 출발하나", "약속 시각과 이동 시간", "휴대폰 일정 · 내비"],
    ["MdLocalParking", "어디에 세우나", "주차장의 운영 · 요금 · 빈자리", "주차 앱 · 지도"],
    ["MdDirectionsWalk", "세우고 늦지 않나", "주차 후 방문 장소까지의 여유", "운전자의 머릿속"],
    ["MdNavigation", "어디로 안내하나", "건물이 아니라 주차장으로", "내비 — 다시 입력"],
  ];
  for (let i = 0; i < need.length; i++) {
    const x = 0.6 + i * 3.08;
    card(s, x, 1.95, 2.85, 2.75, "need-" + i);
    await iconDot(s, x + 0.3, 2.2, 0.7, need[i][0], C.accent3, "need-icon-" + i);
    T(s, need[i][1], { x: x + 0.3, y: 3.0, w: 2.4, h: 0.45, fontSize: 18, bold: true });
    T(s, need[i][2], { x: x + 0.3, y: 3.45, w: 2.4, h: 0.6, fontSize: 13, color: C.text2 });
    T(s, need[i][3], { x: x + 0.3, y: 4.15, w: 2.4, h: 0.4, fontSize: 12, bold: true, color: C.accent2 });
  }
  card(s, 0.6, 4.95, 12.1, 1.45, "pain-card", C.background2);
  await iconDot(s, 0.9, 5.22, 0.9, "MdPsychology", C.accent2, "pain-icon");
  T(s, "내비의 안내는 건물 앞에서 끝납니다. 성공 조건을 잇는 일은 운전자 몫입니다", { x: 2.1, y: 5.1, w: 10.4, h: 0.5, fontSize: 19, bold: true });
  T(s, "아이 픽업(나오는 시각) · 병원 예약(접수 마감)도 같은 구조입니다. 주행 중에는 화면 조작이 제한되고, 정차 중 짧은 시간에 여러 앱을 오가야 합니다.",
    { x: 2.1, y: 5.62, w: 10.4, h: 0.7, fontSize: 14, color: C.text2 });
  s.addNotes("고객사 미팅을 예로 들겠습니다. 이동의 목적은 건물 앞에 도착하는 것이 아니라 약속 시간에 맞춰 실제로 주차하고 방문하는 것입니다. 그런데 출발 시각, 주차장, 주차 후 여유, 안내 목적지를 아는 곳이 모두 다릅니다. 이어 붙이는 일은 운전자가 머릿속으로 하고, 차 안에서는 그게 더 어렵습니다. 픽업과 병원 예약도 같은 구조입니다.");

  // 3. 오해 차단 — 다시 만들지 않는다
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "문제" });
  s.addText("이미 있는 기능은 다시 만들지 않습니다", { placeholder: "title" });
  card(s, 0.6, 1.45, 12.1, 1.25, "layer-top", C.accent1);
  T(s, [{ text: "MY CO-PILOT — ", options: { bold: true } }, { text: "명령을 기다리지 않고 이동 목표의 성공 조건을 관리하고, 승인된 행동의 결과까지 확인하는 층" }],
    { x: 0.95, y: 1.45, w: 11.4, h: 1.25, fontSize: 19, color: C.background1, valign: "middle" });
  const exist = [
    ["MdNavigation", "기본 내비", "경로 · 경유지 · 충전 계획", "경로 정보를 목표 판단의 입력으로 씁니다"],
    ["MdMic", "Gleo AI", "부르면 명령을 이해하고 실행", "부르기 전에 목표 달성 조건을 챙깁니다"],
    ["MdTune", "Pleos ID · 차량 설정", "운전자 개인화 · 시트 프리셋 · 사전 공조", "개인화는 배경 입력 — 가치로 내세우지 않습니다"],
  ];
  for (let i = 0; i < exist.length; i++) {
    const x = 0.6 + i * 4.1;
    s.addShape(pres.shapes.UP_ARROW, { x: x + 1.7, y: 2.82, w: 0.45, h: 0.5, fill: { color: C.accent4 }, line: { color: C.accent4 }, objectName: "up-" + i });
    card(s, x, 3.45, 3.85, 2.3, "exist-" + i);
    await iconDot(s, x + 0.3, 3.68, 0.65, exist[i][0], C.accent3, "exist-icon-" + i);
    T(s, exist[i][1], { x: x + 1.1, y: 3.68, w: 2.6, h: 0.65, fontSize: 17, bold: true, valign: "middle" });
    T(s, exist[i][2], { x: x + 0.3, y: 4.45, w: 3.3, h: 0.5, fontSize: 13, color: C.text2 });
    T(s, exist[i][3], { x: x + 0.3, y: 4.95, w: 3.3, h: 0.7, fontSize: 13, bold: true, color: C.accent1 });
  }
  card(s, 0.6, 5.95, 12.1, 0.55, "nots", C.background2);
  T(s, "만들지 않는 것 — 자체 지도 · 턴바이턴 내비 · 범용 장소 검색 · 범용 챗봇", { x: 0.9, y: 5.95, w: 11.6, h: 0.55, fontSize: 14, bold: true, valign: "middle" });
  FOOT(s, "내비 충전 계획(ChargingPlan)·차량 설정 메뉴는 SDK·에뮬레이터 확인. Gleo AI·Pleos ID 기능 설명은 공식 홈페이지 조사 기준(원문 대조 전).", 6.6, 0.35);
  s.addNotes("가장 먼저 분명히 하겠습니다. 현대차의 기본 내비, Gleo AI, Pleos ID 가 하는 일을 다시 만들지 않습니다. 그 도구들의 정보를 목표 판단의 입력으로 씁니다. Gleo AI 도 맥락을 이해하므로 전혀 겹치지 않는다고 말씀드리지는 않겠습니다. 차이는 명령을 기다리지 않고 목표의 성공 조건을 계속 관리하고, 결과까지 확인한다는 경험에 있습니다.");

  // 4. Journey Goal Engine
  pres.addSection({ title: "해법" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "해법" });
  s.addText("하나의 엔진 — Journey Goal Engine", { placeholder: "title" });
  badgesRight(s, 12.7, 0.67, ["설계"]);
  const rowA = [["MdFlag", "목표 확인"], ["MdRule", "필수 제약 추출"], ["MdStorage", "차량·내비·외부 데이터"], ["MdFilterAlt", "위반 후보 제거"], ["MdLightbulb", "추천 하나 + 대안"]];
  const rowB = [["MdTouchApp", "운전자 승인"], ["MdPlayCircle", "공식 SDK 로 실행"], ["MdVerified", "다시 읽어 확인"], ["MdUpdate", "목표 상태 갱신"]];
  T(s, "판단", { x: 0.6, y: 1.45, w: 2, h: 0.4, fontSize: 15, bold: true, color: C.accent3 });
  for (let i = 0; i < rowA.length; i++) {
    const x = 0.6 + i * 2.48;
    await iconDot(s, x + 0.6, 1.9, 0.9, rowA[i][0], C.accent3, "a-icon-" + i);
    T(s, rowA[i][1], { x, y: 2.9, w: 2.1, h: 0.7, fontSize: 15, bold: true, align: "center" });
    if (i < rowA.length - 1) s.addShape(pres.shapes.RIGHT_ARROW, { x: x + 1.85, y: 2.17, w: 0.45, h: 0.35, fill: { color: C.accent4 }, line: { color: C.accent4 }, objectName: "a-arrow-" + i });
  }
  T(s, "실행", { x: 0.6, y: 3.65, w: 2, h: 0.4, fontSize: 15, bold: true, color: C.accent1 });
  for (let i = 0; i < rowB.length; i++) {
    const x = 0.6 + i * 2.48;
    await iconDot(s, x + 0.6, 4.1, 0.9, rowB[i][0], i === 0 ? C.accent2 : C.accent1, "b-icon-" + i);
    T(s, rowB[i][1], { x, y: 5.1, w: 2.1, h: 0.45, fontSize: 15, bold: true, align: "center" });
    if (i < rowB.length - 1) s.addShape(pres.shapes.RIGHT_ARROW, { x: x + 1.85, y: 4.37, w: 0.45, h: 0.35, fill: { color: C.accent4 }, line: { color: C.accent4 }, objectName: "b-arrow-" + i });
  }
  // 목표 갱신 → 다시 목표 확인으로 돌아가는 고리
  card(s, 10.6, 4.15, 2.1, 0.8, "loop-back", C.background2);
  T(s, "상황이 바뀌면\n처음부터 다시 판단", { x: 10.6, y: 4.15, w: 2.1, h: 0.8, fontSize: 13, bold: true, color: C.accent3, align: "center", valign: "middle" });
  card(s, 0.6, 5.75, 12.1, 0.7, "engine-note", C.background2);
  T(s, [{ text: "부품은 이미 있습니다 — ", options: { bold: true, color: C.accent1 } }, { text: "Mission(목표 기억) · Decision Engine(근거 붙은 판단) · Safety Gate · 승인 → 실행 → 재조회. V7 은 이를 목표 중심으로 묶습니다." }],
    { x: 0.9, y: 5.75, w: 11.6, h: 0.7, fontSize: 14, valign: "middle" });
  s.addNotes("모든 경험은 하나의 엔진으로 움직입니다. 목표를 확인하고, 반드시 지켜야 할 조건을 뽑고, 차량과 내비와 외부 데이터를 모은 뒤, 조건을 어기는 후보를 먼저 빼고 추천 하나와 대안을 냅니다. 운전자가 승인하면 공식 SDK 로 실행하고, 실제로 반영됐는지 다시 읽어 확인한 뒤 목표 상태를 갱신합니다. 엔진의 부품은 이미 구현돼 있고, V7 은 이것을 목표 중심으로 다시 묶는 설계입니다.");

  // 5. 세 가지 경험
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "해법" });
  s.addText("세 가지 경험, 하나의 엔진", { placeholder: "title" });
  const mods = [
    ["MdEventAvailable", "01 ARRIVE READY", "신규 주력 · 모든 동력원", "목적지에 가는 것이 아니라, 방문 준비까지 끝낸다", "약속 시간 · 이동 · 주차 · 최종 방문을 한 번에 판단합니다.", ["개발 중"], C.accent2],
    ["MdSyncProblem", "02 JOURNEY RECOVERY", "모든 동력원", "계획이 달라져도 다시 검색하지 않는다", "의미 있는 변화가 생길 때만 기존 계획을 다시 판단합니다. 불필요한 알림은 보내지 않습니다.", ["에뮬"], C.accent3],
    ["MdEvStation", "03 ENERGY & STOP", "전기차 특화", "충전과 휴식을 따로 계획하지 않는다", "에너지 판단 + 공공 충전소 상태 + 동승자 조건 → 경유지.", ["에뮬", "실 API"], C.accent1],
  ];
  for (let i = 0; i < mods.length; i++) {
    const x = 0.6 + i * 4.1;
    card(s, x, 1.5, 3.85, 4.4, "mod-" + i);
    await iconDot(s, x + 0.3, 1.75, 0.85, mods[i][0], mods[i][6], "mod-icon-" + i);
    badgesRight(s, x + 3.6, 1.95, mods[i][5]);
    T(s, mods[i][1], { x: x + 0.3, y: 2.75, w: 3.3, h: 0.45, fontSize: 18, bold: true, color: mods[i][6] });
    T(s, mods[i][2], { x: x + 0.3, y: 3.2, w: 3.3, h: 0.35, fontSize: 12, bold: true, color: C.accent6 });
    T(s, mods[i][3], { x: x + 0.3, y: 3.6, w: 3.3, h: 0.9, fontSize: 16, bold: true });
    T(s, mods[i][4], { x: x + 0.3, y: 4.55, w: 3.3, h: 1.2, fontSize: 13, color: C.text2 });
  }
  card(s, 0.6, 6.05, 12.1, 0.55, "mod-base", C.background2);
  T(s, "JOURNEY RECOVERY 는 충전소 상태 · 배터리 변화에 대한 재판단을 에뮬레이터 실데이터로 확인 · 안내 중인 주차장 정보 변화 재판단은 개발 브랜치에서 에뮬레이터 확인(만차는 시연 값)입니다.", { x: 0.9, y: 6.05, w: 11.6, h: 0.55, fontSize: 13, color: C.text2, valign: "middle" });
  s.addNotes("엔진 위에 세 가지 경험이 있습니다. 새 주력은 ARRIVE READY 로, 동력원과 무관하게 매주 반복되는 시간 약속 이동을 다룹니다. 데이터 관문 세 개를 통과했고, 개발 브랜치에서는 실제 주차 데이터와 내비 소요 시간으로 추천하고, 승인하면 내비 목적지에 반영한 뒤 다시 읽어 확인하는 데까지 에뮬레이터에서 확인했습니다. 이번 출품 앱에는 넣지 않았습니다. JOURNEY RECOVERY 는 계획이 바뀔 때 다시 판단하는 경험으로, 충전소 상태나 배터리가 바뀌면 추천을 바꾸는 것까지 에뮬레이터 실데이터로 확인했습니다. 안내 중인 주차장이 만차가 되면 대안을 제안하고 두 번 승인해야 바꾸는 것도 개발 브랜치에서 확인했습니다. 만차는 시연 값으로 재현했습니다. ENERGY & STOP 은 전기차에서만 켜지는 모듈이고 에뮬레이터와 공공 API 로 확인했습니다.");

  // 6. ARRIVE READY 목표 UX (목업)
  pres.addSection({ title: "ARRIVE READY" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "ARRIVE READY" });
  s.addText("ARRIVE READY — 목표 화면", { placeholder: "title" });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.55, y: 0.6, w: 4.15, h: 0.5, rectRadius: 0.25, fill: { color: C.accent2 }, line: { color: C.accent2 }, objectName: "mock-label" });
  T(s, "목표 UX · 가상 수치 · 미구현", { x: 8.55, y: 0.6, w: 4.15, h: 0.5, fontSize: 15, bold: true, color: C.background1, align: "center", valign: "middle" });
  // 앱 창(세로 840×1184dp 비율에 가깝게)
  const px0 = 0.9, py0 = 1.4, pw = 3.85, ph = 5.4;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: px0, y: py0, w: pw, h: ph, rectRadius: 0.18, fill: { color: "F4F6F8" }, line: { color: HEX.accent4, width: 1.5, dashType: "dash" }, objectName: "mock-window" });
  T(s, "A  오늘의 이동 목표", { x: px0 + 0.25, y: py0 + 0.2, w: 3.4, h: 0.3, fontSize: 10, bold: true, color: C.accent6 });
  T(s, "오후 3시 고객사 미팅 (예시)", { x: px0 + 0.25, y: py0 + 0.48, w: 3.4, h: 0.4, fontSize: 15, bold: true });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: px0 + 0.2, y: py0 + 1.0, w: pw - 0.4, h: 1.25, rectRadius: 0.1, fill: { color: C.background1 }, line: { color: C.accent2, width: 1.5 }, objectName: "mock-issue" });
  T(s, "B  지금 판단할 문제", { x: px0 + 0.4, y: py0 + 1.08, w: 3.1, h: 0.3, fontSize: 10, bold: true, color: C.accent2 });
  T(s, "주차와 방문 여유를 함께 확인해야 해요", { x: px0 + 0.4, y: py0 + 1.36, w: 3.1, h: 0.8, fontSize: 13, bold: true });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: px0 + 0.2, y: py0 + 2.4, w: pw - 0.4, h: 1.5, rectRadius: 0.1, fill: { color: C.background1 }, line: { color: C.accent1, width: 1.5 }, objectName: "mock-rec" });
  T(s, "C  추천 하나", { x: px0 + 0.4, y: py0 + 2.48, w: 3.1, h: 0.3, fontSize: 10, bold: true, color: C.accent1 });
  T(s, "OO 공영주차장 (가상)", { x: px0 + 0.4, y: py0 + 2.76, w: 3.1, h: 0.35, fontSize: 13, bold: true });
  T(s, "운영 중 · 빈자리 정보 N분 전 기준 · 이유와 출처 표시", { x: px0 + 0.4, y: py0 + 3.1, w: 3.1, h: 0.7, fontSize: 10, color: C.text2 });
  T(s, "D  대안 보기 ›", { x: px0 + 0.4, y: py0 + 4.0, w: 3.1, h: 0.35, fontSize: 11, bold: true, color: C.accent3 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: px0 + 0.2, y: py0 + 4.45, w: pw - 0.4, h: 0.6, rectRadius: 0.3, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: "mock-approve" });
  T(s, "E  이 주차장으로 안내 → 반영 확인", { x: px0 + 0.2, y: py0 + 4.45, w: pw - 0.4, h: 0.6, fontSize: 12, bold: true, color: C.background1, align: "center", valign: "middle" });
  const ann = [
    ["A", "목표가 화면의 중심", "기능을 고르는 것이 아니라 '오늘 해결할 일'을 고릅니다."],
    ["B", "판단할 문제 하나", "정상이면 조용히 있습니다. 근거가 없으면 '판단 불가'라고 말합니다."],
    ["C", "추천 하나 + 이유", "가장 가까운 곳이 아니라 약속 시간 · 운영 · 주차 조건을 먼저 통과한 곳. 갱신 시각과 출처를 함께."],
    ["D", "대안", "조건을 통과한 후보만 비교합니다. 주차장 검색 화면이 아닙니다."],
    ["E", "승인 한 번 → 확인", "승인하면 내비 목적지로 요청하고, 목적지를 다시 읽어 반영을 확인합니다."],
  ];
  for (let i = 0; i < ann.length; i++) {
    const y = 1.45 + i * 1.0;
    s.addShape(pres.shapes.OVAL, { x: 5.3, y, w: 0.5, h: 0.5, fill: { color: C.accent3 }, line: { color: C.accent3 }, objectName: "ann-dot-" + i });
    T(s, ann[i][0], { x: 5.3, y, w: 0.5, h: 0.5, fontSize: 14, bold: true, color: C.background1, align: "center", valign: "middle" });
    T(s, ann[i][1], { x: 6.0, y: y - 0.02, w: 6.7, h: 0.38, fontSize: 15, bold: true });
    T(s, ann[i][2], { x: 6.0, y: y + 0.36, w: 6.7, h: 0.6, fontSize: 12, color: C.text2 });
  }
  FOOT(s, "새로 제안하는 기능의 목표 화면입니다. 실제 주차 데이터나 도착 예상 시각이 들어간 화면이 아니며, 장소 · 수치는 가상입니다.", 6.55, 0.35);
  s.addNotes("새 대표 경험 ARRIVE READY 의 목표 화면입니다. 실제로 구현된 화면이 아니고, 장소와 수치는 가상이라는 점을 먼저 말씀드립니다. 화면 맨 위에는 기능이 아니라 오늘의 이동 목표가 있습니다. 그 아래 지금 판단할 문제 하나, 추천 하나와 이유, 대안, 그리고 승인 버튼입니다. 핵심은 주차장 검색이 아니라, 약속 시간과 이동과 주차 조건을 함께 만족하는 선택을 한 번에 만드는 것입니다.");

  // 7. 실현 가능성
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "ARRIVE READY" });
  s.addText("만들기 전에, 데이터부터 확인했습니다 — A · B · C 통과", { placeholder: "title" });
  const gates = [
    ["Gate A", "주차 데이터", ["실 API"],
      "확인: 서울시 실시간 주차 122곳 전체 수신 — 109곳이 20분 이내 대수 · 좌표는 주차장 코드로 정보 API 와 결합 → 판단에 쓸 수 있는 곳 105곳 (2026-11-10)",
      "모름: 노상 주차장의 대수와 실제 빈자리 차이(빈자리 보장 아님) · 서울 시영 밖(전국 · 민영)은 범위 밖 · 갱신은 약 3분 간격"],
    ["Gate B", "주차장까지 소요 시간", ["에뮬"],
      "확인: 주차장 좌표를 넣으면 거리 · 소요 시간(초)을 경로 변경 없이 주는 requestTrip — 목적지가 없을 때도 · 안내 중에도 3곳 연속 응답 (에뮬레이터 2026-11-10)",
      "모름: 교통 반영이 실시간인가(\"내비 기준 예상\"으로만 씀) · 주차 후 도보 시간(공급원 없음 — 계산하지 않음)"],
    ["Gate C", "승인 → 내비 반영", ["에뮬"],
      "확인: 세종로 공영주차장 좌표로 목적지 요청 → 안내 시작 → 다시 읽어 같은 좌표 · 내비 화면 44분 · 23km (에뮬레이터 2026-11-10)",
      "주의: 내비는 기존 경로를 묻지 않고 바꾼다 → 앱이 먼저 묻는다(자동 변경 금지 원칙)"],
  ];
  for (let i = 0; i < gates.length; i++) {
    const x = 0.6 + i * 4.1;
    card(s, x, 1.45, 3.85, 3.95, "gate-" + i);
    T(s, gates[i][0], { x: x + 0.3, y: 1.62, w: 1.5, h: 0.4, fontSize: 18, bold: true, color: C.accent3 });
    badgesRight(s, x + 3.6, 1.66, gates[i][2]);
    T(s, gates[i][1], { x: x + 0.3, y: 2.05, w: 3.3, h: 0.4, fontSize: 15, bold: true });
    T(s, gates[i][3], { x: x + 0.3, y: 2.55, w: 3.3, h: 1.4, fontSize: 12, color: C.text1 });
    T(s, gates[i][4], { x: x + 0.3, y: 4.0, w: 3.3, h: 1.3, fontSize: 12, color: C.accent2 });
  }
  T(s, "Gate D — 오래되거나 부정확한 데이터로 확정 추천을 하지 않는가 · Gate E — 기존 방식보다 조작 · 결정 부담이 실제로 줄어드는가 (측정 전)",
    { x: 0.6, y: 5.5, w: 12.1, h: 0.4, fontSize: 12, color: C.text2 });
  card(s, 0.6, 5.95, 12.1, 0.75, "stop-rule", C.accent2);
  T(s, "중단 기준 — 도착 시각이나 주차 근거가 없으면 지각 예측을 만들지 않습니다. 그때는 '검증된 주차 후보 선택 → 내비 실행'으로 범위를 줄입니다.",
    { x: 0.9, y: 5.95, w: 11.6, h: 0.75, fontSize: 14, bold: true, color: C.background1, valign: "middle" });
  s.addNotes("ARRIVE READY 를 단정하기 전에 데이터가 있는지부터 확인했습니다. 서울시 공영주차장 실시간 API 는 오늘 실제로 현재 주차 대수와 갱신 시각을 돌려줬습니다. 정식 키로 전체를 받아 보니 122곳 중 109곳이 20분 이내 대수를 주고, 실시간 정보에 없는 좌표는 주차장 코드로 안내 정보와 이어 붙여 105곳의 위치를 얻었습니다. 범위는 서울 시영 주차장이라고 분명히 말씀드립니다. 내비 쪽은 Pleos 에뮬레이터에서 확인했습니다. 주차장 좌표를 넣으면 목적지가 없어도 소요 시간이 오고, 주차장을 목적지로 보내면 안내가 시작되고 다시 읽어 같은 곳임을 확인했습니다. 판단 엔진은 이 데이터로 구현해 검증했지만 화면과 실행 흐름은 아직 개발 중이고, 근거가 모자라면 지각 예측을 억지로 만들지 않습니다.");

  // 8. 기반 ① 픽업
  pres.addSection({ title: "이미 동작하는 기반" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "이미 동작하는 기반" });
  s.addText("기반 ① 목표를 끝까지 기억 — 픽업 후 귀가", { placeholder: "title" });
  badgesRight(s, 12.7, 0.67, ["에뮬"]);
  const shots = [
    ["s-prepare.png", 1010, 1150, "다른 것만, 승인 한 번"],
    ["s-applied.png", 1010, 1000, "다시 읽어 \"적용 확인\""],
    ["s-wait.png", 1010, 1210, "도착해도 귀가를 기억"],
    ["s-route.png", 1010, 1000, "귀가 안내 → 목적지 확인"],
  ];
  for (let i = 0; i < shots.length; i++) {
    const bx = 0.6 + i * 3.08, boxW = 2.85, boxH = 3.9;
    const f = fit(shots[i][1], shots[i][2], boxW, boxH);
    shot(s, shots[i][0], bx + (boxW - f.w) / 2, 1.45, f.w, f.h, "shot-" + i);
    T(s, (i + 1) + ". " + shots[i][3], { x: bx, y: 5.45, w: boxW, h: 0.4, fontSize: 14, bold: true });
  }
  card(s, 0.6, 5.9, 12.1, 0.6, "did-band", C.background2);
  T(s, [{ text: "Journey Goal 의 바탕 — ", options: { bold: true, color: C.accent1 } }, { text: "중간 도착을 완료로 치지 않고, 앱이 꺼졌다 켜져도 목표가 이어집니다. 모든 동력원." }],
    { x: 0.9, y: 5.9, w: 11.6, h: 0.6, fontSize: 14, valign: "middle" });
  FOOT(s, "Pleos Connect Emulator v2.1.0 실측. 도착 전환은 모의 주행(이 에뮬레이터 이미지에 속도 신호 없음).", 6.6, 0.35);
  s.addNotes("이미 동작하는 기반입니다. 아이 픽업 후 귀가에서, 다른 설정만 승인 한 번으로 바꾸고 다시 읽어 확인하며, 학원에 도착해도 귀가라는 목표를 기억하고, 집으로 안내를 한 번에 요청한 뒤 목적지를 다시 읽어 확인합니다. 모두 에뮬레이터에서 찍은 실제 화면입니다. ARRIVE READY 는 이 목표 기억 위에 시간과 주차 조건을 더하는 것입니다.");

  // 9. 기반 ② ENERGY & STOP
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "이미 동작하는 기반" });
  s.addText("기반 ② 여러 서비스를 한 결정으로 — ENERGY & STOP", { placeholder: "title" });
  const ev = [
    ["MdBatteryChargingFull", "\"서야 하나\"를 먼저", "도착 후 차 안 대기까지 센 에너지로 판단. 필요 없으면 충전소를 찾지도 않습니다."],
    ["MdEvStation", "세 가지 정보로 하나", "배터리(차량) + 경로(내비) + 실시간 충전기 상태(공공 API)를 함께 걸러 추천 하나, 대안 둘."],
    ["MdAddLocationAlt", "승인하면 경유지로", "내비 경유지에 넣고 목록을 다시 읽어 확인. 칸이 차 있으면 지우지 않고 묻습니다."],
  ];
  for (let i = 0; i < ev.length; i++) {
    const y = 1.5 + i * 1.4;
    await iconDot(s, 0.6, y, 0.8, ev[i][0], C.accent1, "ev-icon-" + i);
    T(s, ev[i][1], { x: 1.6, y: y - 0.05, w: 5.4, h: 0.45, fontSize: 17, bold: true });
    T(s, ev[i][2], { x: 1.6, y: y + 0.4, w: 5.4, h: 0.9, fontSize: 13, color: C.text2 });
  }
  card(s, 0.6, 5.7, 6.4, 0.75, "ev-stat", C.background2);
  T(s, "8곳 · 77대", { x: 0.85, y: 5.7, w: 2.0, h: 0.75, fontSize: 24, bold: true, color: C.accent3, valign: "middle" });
  T(s, "경부선 부산 방향 휴게소 충전기의 실시간 상태를 공공 API 로 수신", { x: 2.9, y: 5.7, w: 3.95, h: 0.75, fontSize: 12, color: C.text2, valign: "middle" });
  T(s, "전기차에서만 켜지는 모듈. 휴게소 시설과 화면 속 충전기 값은 시연 데이터.", { x: 0.6, y: 6.5, w: 6.4, h: 0.4, fontSize: 10, color: C.accent6 });
  { const f = fit(1010, 1210, 4.6, 4.7); shot(s, "s-ev.png", 7.8 + (4.6 - f.w) / 2, 1.5, f.w, f.h, "shot-ev"); }
  badgesRight(s, 12.4, 6.4, ["에뮬", "실 API", "시연"]);
  s.addNotes("두 번째 기반은 여러 서비스를 하나의 결정으로 묶는 실제 사례입니다. 차량의 배터리, 내비의 경로, 공공 충전소의 실시간 상태를 함께 판단합니다. 전기차에서만 켜지는 모듈이며 제품의 주인공은 아닙니다. 공공 API 로 8곳, 77대의 상태를 받는 것까지 확인했고, 화면 속 충전기 값과 휴게소 시설은 시연 데이터입니다.");

  // 10. 승인 → 실행 → 재조회
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "이미 동작하는 기반" });
  s.addText("승인한 일만, 끝까지 확인합니다", { placeholder: "title" });
  T(s, "요청이 성공해도 완료로 치지 않습니다. 차량과 내비 값을 다시 읽어 반영을 확인합니다.", { x: 0.6, y: 1.35, w: 12.1, h: 0.45, fontSize: 16, color: C.text2 });
  const cols = ["승인한 행동", "공식 SDK 요청", "알림", "다시 읽어 확인"];
  const rows = [
    ["공조 온도 · 시트 열선/통풍", "Vehicle SDK set", "변경 콜백", "값 재조회 = 적용 값"],
    ["집으로 안내 시작", "NaviHelper requestRoute", "경로 시작 콜백", "목적지 재조회 = 같은 장소"],
    ["충전 경유지 추가", "NaviHelper addWaypoint", "경로 반영", "경유지 목록 재조회"],
  ];
  const colX = [0.6, 3.55, 6.5, 8.9];
  const colW = [2.7, 2.7, 2.1, 2.3];
  for (let c = 0; c < cols.length; c++) T(s, cols[c], { x: colX[c] + 0.2, y: 2.0, w: colW[c], h: 0.4, fontSize: 14, bold: true, color: c === 3 ? C.accent1 : C.accent3 });
  for (let r = 0; r < rows.length; r++) {
    const y = 2.5 + r * 1.1;
    card(s, 0.6, y, 12.1, 0.9, "exec-row-" + r, C.background2);
    for (let c = 0; c < rows[r].length; c++) {
      T(s, rows[r][c], { x: colX[c] + 0.2, y, w: colW[c], h: 0.9, fontSize: 13, bold: c === 0 || c === 3, color: c === 3 ? C.accent1 : C.text1, valign: "middle" });
      if (c < 3) s.addShape(pres.shapes.RIGHT_ARROW, { x: colX[c + 1] - 0.15, y: y + 0.32, w: 0.25, h: 0.26, fill: { color: C.accent4 }, line: { color: C.accent4 }, objectName: `exec-arrow-${r}-${c}` });
    }
    badge(s, 11.55, y + 0.29, "에뮬", 0.95);
  }
  card(s, 0.6, 5.85, 12.1, 0.7, "exec-rule", C.background2);
  await iconDot(s, 0.8, 5.93, 0.55, "MdBlock", C.accent2, "exec-rule-icon");
  T(s, "경로와 목적지는 스스로 바꾸지 않습니다 · 기존 경유지는 지우지 않고 묻습니다 · 주행 중에는 한 줄과 음성만", { x: 1.55, y: 5.85, w: 11.0, h: 0.7, fontSize: 14, bold: true, valign: "middle" });
  s.addNotes("가장 확실하게 검증된 강점입니다. 승인한 행동만 공식 SDK 로 요청하고, 성공 응답이 와도 완료로 치지 않습니다. 공조와 시트는 값을 다시 읽고, 귀가 안내는 목적지를 다시 읽고, 경유지는 목록을 다시 읽어 확인합니다. 세 가지 모두 Pleos 에뮬레이터에서 확인했습니다. ARRIVE READY 의 마지막 단계도 같은 방식으로 확인합니다.");

  // 11. 데이터 신뢰
  pres.addSection({ title: "신뢰" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "신뢰" });
  s.addText("불확실한 정보로 확정하지 않습니다", { placeholder: "title" });
  card(s, 0.6, 1.45, 5.3, 5.1, "fact-card", C.background2);
  T(s, "모든 값에 붙는 꼬리표", { x: 0.9, y: 1.65, w: 4.8, h: 0.45, fontSize: 17, bold: true, color: C.accent3 });
  const meta = ["출처(차량 · 내비 · 공공 API · 시연)", "받은 시각", "원본이 갱신된 시각", "신선도(신선 · 오래됨 · 미확인)", "근거 등급", "가용성 · 실패 이유"];
  T(s, meta.map((m, i) => ({ text: m, options: { bullet: true, breakLine: i < meta.length - 1 } })), { x: 0.9, y: 2.3, w: 4.8, h: 3.1, fontSize: 17, color: C.text2, paraSpaceAfter: 12 });
  T(s, "판단 엔진에 구현 · TypeScript · Kotlin 두 벌을 공통 사례로 검사", { x: 0.9, y: 5.55, w: 4.8, h: 0.8, fontSize: 12, color: C.accent6 });
  const rules = [
    ["MdHelpOutline", "근거가 없으면 '판단 불가'", "도착 시각 · 도보 시간 · 빈자리 · 지각 시각을 만들어 내지 않습니다."],
    ["MdUpdate", "오래된 실시간 정보는 실시간이 아니다", "예: 서울 주차 API 가 '통신 점검 중(120분~2일)'으로 표시한 곳은 빈자리 판단에 쓰지 않습니다."],
    ["MdCompareArrows", "충돌하면 임의로 고르지 않는다", "서비스 간 값이 다르면 한쪽을 사실로 채택하지 않고 구분해 보여 줍니다."],
    ["MdKey", "키는 차 안에 두지 않는다", "외부 API 키는 중계 서버가 보관 · 캐시 · 호출 제한을 맡습니다."],
  ];
  for (let i = 0; i < rules.length; i++) {
    const y = 1.45 + i * 1.3;
    await iconDot(s, 6.2, y + 0.1, 0.7, rules[i][0], C.accent3, "rule-icon-" + i);
    T(s, rules[i][1], { x: 7.1, y: y + 0.02, w: 5.6, h: 0.42, fontSize: 16, bold: true });
    T(s, rules[i][2], { x: 7.1, y: y + 0.45, w: 5.6, h: 0.75, fontSize: 13, color: C.text2 });
  }
  s.addNotes("여러 서비스를 엮을수록 틀린 정보가 섞일 위험도 커집니다. 그래서 모든 값에 출처, 받은 시각, 원본 갱신 시각, 신선도, 근거 등급, 가용성을 붙입니다. 근거가 없으면 판단 불가라고 말하고, 통신 점검 중인 주차장 정보는 실시간으로 쓰지 않으며, 서비스끼리 값이 다르면 임의로 고르지 않습니다. 키는 차 안이 아니라 중계 서버에 둡니다.");

  // 12. 증거 등급
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "신뢰" });
  s.addText("무엇이 실제이고 무엇이 계획인가", { placeholder: "title" });
  const ev2 = [
    ["배터리 · 공조 · 시트 수신과 설정 → 재조회 확인", "에뮬"],
    ["픽업 Mission · 귀가 안내 · 앱 재시작 뒤 복원", "에뮬"],
    ["경유지 승인 → 내비 확인 응답 → 재조회 · 상태 · 배터리가 바뀌면 다시 판단", "에뮬"],
    ["공공 충전소 실시간 상태 → 앱의 추천까지(8곳 · 77대)", "실 API"],
    ["서울 시영 주차장 실시간 대수 + 좌표 결합(105곳)", "실 API"],
    ["휴게소 가족 시설 정보 · 주행 · 도착 전환(모의 주행)", "시연"],
    ["ARRIVE READY 추천 → 승인 → 내비 반영 · 재조회 — 개발 브랜치 · 출품 앱 미포함", "개발 중"],
    ["일정 연동 · 날씨 · 주유 · 전국 실시간 주차", "미구현"],
  ];
  for (let i = 0; i < ev2.length; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * 6.15, y = 1.5 + row * 1.15;
    card(s, x, y, 5.95, 0.95, "ev2-" + i, C.background2);
    badge(s, x + 0.25, y + 0.31, ev2[i][1], 1.05);
    T(s, ev2[i][0], { x: x + 1.5, y, w: 4.3, h: 0.95, fontSize: 14, valign: "middle" });
  }
  T(s, "출품 앱 자동 테스트 475개(판단 엔진 Kotlin 264 · 같은 규칙의 TypeScript 211). 사용성 개선 정도는 측정 전이라 숫자로 쓰지 않습니다.",
    { x: 0.6, y: 6.2, w: 12.1, h: 0.5, fontSize: 12, color: C.accent6 });
  s.addNotes("주장마다 증거 등급을 붙였습니다. 초록은 Pleos 에뮬레이터 실측, 파랑은 외부 API 실호출, 노랑은 시연 데이터, 주황은 개발 중, 회색은 아직 구현하지 않은 것입니다. 새 주력인 ARRIVE READY 는 개발 브랜치에서 추천부터 내비 반영 확인까지 에뮬레이터로 확인했지만, 출품 앱에는 아직 넣지 않아 개발 중으로 표시했습니다. 조작이 얼마나 줄었는지는 측정 전이라 숫자로 말하지 않습니다.");

  // 13. 로드맵
  pres.addSection({ title: "다음" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "다음" });
  s.addText("12월 PT 까지 — 관문을 통과한 것만 보여 드립니다", { placeholder: "title" });
  const road = [
    ["11/15 · 1차", "정체성 전환 · 안정 APK", "Journey OS 정의 · 확인된 기반 두 장면 · ARRIVE READY 관문 통과 · 개발 브랜치에서 내비 반영까지 확인", C.accent1],
    ["11/16 ~ 11/26", "ARRIVE READY 합치기", "추천과 안내 중인 경로 구분 · 재시작 뒤 복원 · 출품 앱에 연결", C.accent3],
    ["11/27 ~ 12/2", "Gate D · E", "오래된 데이터 처리 · 기존 방식과 조작 · 결정 부담 비교", C.accent5],
    ["12/3 ~ 4 · PT", "에뮬레이터 실연", "우선: 업무 방문 → 실제 주차 데이터 → 추천 → 승인 → 내비 반영 확인 / 보조: EV 장거리", C.accent2],
  ];
  s.addShape(pres.shapes.LINE, { x: 0.85, y: 2.15, w: 11.6, h: 0, line: { color: HEX.accent4, width: 3 }, objectName: "timeline" });
  for (let i = 0; i < road.length; i++) {
    const x = 0.6 + i * 3.08;
    s.addShape(pres.shapes.OVAL, { x: x + 0.1, y: 1.92, w: 0.46, h: 0.46, fill: { color: road[i][3] }, line: { color: road[i][3] }, objectName: "milestone-" + i });
    T(s, road[i][0], { x, y: 1.35, w: 2.85, h: 0.4, fontSize: 14, bold: true, color: road[i][3] });
    card(s, x, 2.7, 2.85, 3.0, "road-" + i, C.background2);
    T(s, road[i][1], { x: x + 0.25, y: 2.9, w: 2.4, h: 0.8, fontSize: 17, bold: true });
    T(s, road[i][2], { x: x + 0.25, y: 3.8, w: 2.4, h: 1.8, fontSize: 15, color: C.text2 });
  }
  card(s, 0.6, 5.9, 12.1, 0.8, "road-rule", C.background2);
  await iconDot(s, 0.8, 6.0, 0.6, "MdRule", C.accent2, "road-rule-icon");
  T(s, "관문을 통과하지 못하면 미완성 기능을 보여 주지 않습니다 — 범위를 줄이거나 데이터 공급원을 바꾸고, 검증된 통합 경험을 완성도 있게 발표합니다.", { x: 1.65, y: 5.9, w: 10.85, h: 0.8, fontSize: 14, valign: "middle" });
  s.addNotes("일정입니다. 1차에서는 제품 정체성을 바꾸고 안정된 앱을 제출합니다. 개발 브랜치에서 추천부터 내비 반영 확인까지 이어졌으니 11월 하순에는 이를 출품 앱에 합치고 재시작 뒤 복원을 더하며, 12월 초까지 오래된 데이터 처리와 사용 부담을 비교합니다. PT 에서는 업무 방문 시나리오를 에뮬레이터에서 처음부터 끝까지 보여 드리는 것이 목표이고, 관문을 통과하지 못하면 범위를 줄여 검증된 경험만 보여 드리겠습니다.");

  // 14. 마무리
  pres.addSection({ title: "마무리" });
  s = pres.addSlide({ masterName: "CLOSING_DARK", sectionTitle: "마무리" });
  s.addText("이동 목적을\n실제로 달성하게 합니다", { placeholder: "title" });
  s.addText("기능이 많은 앱이 아니라, 적게 판단하고 적게 조작해도 원하는 일을 끝내는 서비스\nMY CO-PILOT · Journey OS", { placeholder: "body" });
  s.addNotes("MY CO-PILOT 은 기능이 많은 앱이 아니라, 운전자가 적게 판단하고 적게 조작해도 원하는 이동을 끝내게 하는 서비스를 목표로 합니다. 감사합니다.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("written", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
