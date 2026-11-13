// MY CO-PILOT 1차 시안 덱 — pptxgenjs 구조형(테마 · 레이아웃 · 플레이스홀더 · 섹션)
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const md = require("react-icons/md");
const { applyTheme } = require(process.env.PPTX_SKILL + "/scripts/apply_theme.js");

const OUT = process.argv[2] || "MY-CO-PILOT_1차시안.pptx";
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
pres.title = "MY CO-PILOT — 1차 시안";
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
    { text: { text: "현대자동차그룹 차량용 앱 개발 공모전 2026 · Pleos Connect · 1차 시안", options: { x: 0.8, y: 6.55, w: 11.5, h: 0.4, fontSize: 12, color: C.accent4 } } },
  ],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: HEX.lt1 },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.4, w: 12.1, h: 0.85, fontSize: 30, bold: true, color: C.text1, valign: "middle" }, text: "" } },
    { text: { text: "MY CO-PILOT · 1차 시안", options: { x: 0.6, y: 7.0, w: 5, h: 0.3, fontSize: 10, color: C.accent6 } } },
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
const BADGE = { 에뮬: C.accent1, "실 API": C.accent3, 시연: C.accent5, 미구현: C.accent6 };
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

(async () => {
  // 1. 표지
  pres.addSection({ title: "시작" });
  let s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "시작" });
  s.addText("MY CO-PILOT", { placeholder: "title" });
  s.addText("여러 서비스의 정보를 연결하고, 운전자에게 필요한 다음 행동을\n하나의 결정으로 제안하는 지능형 차량용 통합 어시스턴트", { placeholder: "body" });
  await iconDot(s, 0.8, 1.15, 0.9, "MdDirectionsCar", C.accent1, "cover-icon");
  s.addNotes("MY CO-PILOT 은 차 안의 여러 서비스를 하나의 결정으로 묶는 운전자 보조 앱입니다. 오늘은 '운전자가 무엇을 덜 하게 되는가'에 집중해 말씀드리겠습니다.");

  // 2. 문제
  pres.addSection({ title: "문제" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "문제" });
  s.addText("기능은 충분합니다. 연결이 운전자 몫으로 남아 있습니다", { placeholder: "title" });
  const tools = [
    ["MdNavigation", "내비게이션", "목적지와 경로를 압니다"],
    ["MdEventSeat", "차량 설정", "시트와 공조를 압니다"],
    ["MdEvStation", "충전 앱", "충전기를 압니다"],
    ["MdPhoneIphone", "휴대폰", "일정을 압니다"],
  ];
  for (let i = 0; i < tools.length; i++) {
    const x = 0.6 + i * 3.08;
    card(s, x, 1.55, 2.85, 2.0, "tool-" + i);
    await iconDot(s, x + 0.3, 1.8, 0.7, tools[i][0], C.accent3, "tool-icon-" + i);
    T(s, tools[i][1], { x: x + 0.3, y: 2.65, w: 2.3, h: 0.4, fontSize: 18, bold: true });
    T(s, tools[i][2], { x: x + 0.3, y: 3.05, w: 2.4, h: 0.4, fontSize: 14, color: C.text2 });
  }
  s.addShape(pres.shapes.DOWN_ARROW, { x: 6.27, y: 3.75, w: 0.8, h: 0.6, fill: { color: C.accent2 }, line: { color: C.accent2 }, objectName: "arrow-down" });
  card(s, 0.6, 4.55, 12.1, 2.1, "pain-card", C.background2);
  await iconDot(s, 0.95, 4.95, 0.9, "MdPsychology", C.accent2, "pain-icon");
  T(s, "이어 붙이는 일은 운전자가 머릿속으로 합니다", { x: 2.15, y: 4.85, w: 10.2, h: 0.5, fontSize: 20, bold: true });
  T(s, "아이를 데리러 갈 때도 — 차량 설정에서 시트와 공조를 따로 맞추고, 내비에 학원을 넣고, 기다리는 동안 귀가 경로를 다시 찾아 설정합니다. 학원에 도착해도 이동은 끝나지 않았는데, 내비의 안내는 거기서 끝납니다.",
    { x: 2.15, y: 5.4, w: 10.2, h: 1.1, fontSize: 15, color: C.text2 });
  s.addNotes("현대차의 기능이 부족한 것이 아닙니다. 각각 잘 동작합니다. 다만 하나의 이동을 끝내려면 운전자가 그 기능들을 순서대로 이어 붙여야 합니다.");

  // 3. 차 안이라서
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "문제" });
  s.addText("차 안이라서 더 어렵습니다", { placeholder: "title" });
  const why = [
    ["MdDoNotTouch", "주행 중에는 조작이 제한됩니다", "Pleos Connect 는 주행 중 화면을 제한합니다. 여러 앱을 비교하는 일은 정차 중 짧은 시간에 끝나야 합니다.", C.accent2],
    ["MdTimer", "정차 시간은 짧습니다", "신호 대기, 주차 직후, 아이를 기다리는 몇 분. 그 사이에 여러 화면을 오가기는 어렵습니다.", C.accent5],
    ["MdSensors", "필요한 정보는 이미 차 안에 있습니다", "배터리 · 공조 · 시트 · 도어 상태와 내비 목적지 · 경유지를 앱이 직접 읽고, 승인받아 설정할 수 있습니다.", C.accent1],
  ];
  for (let i = 0; i < why.length; i++) {
    const x = 0.6 + i * 4.1;
    card(s, x, 1.6, 3.85, 4.9, "why-" + i);
    await iconDot(s, x + 0.35, 1.95, 1.0, why[i][0], why[i][3], "why-icon-" + i);
    T(s, why[i][1], { x: x + 0.35, y: 3.2, w: 3.2, h: 1.0, fontSize: 20, bold: true });
    T(s, why[i][2], { x: x + 0.35, y: 4.3, w: 3.2, h: 2.0, fontSize: 15, color: C.text2 });
  }
  s.addNotes("차 안이라는 조건이 문제를 키웁니다. 동시에, 해결에 필요한 정보와 실행 수단도 이미 차 안에 있습니다. 그래서 차량 앱이어야 합니다.");

  // 4. 우리의 답
  pres.addSection({ title: "해법" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "해법" });
  s.addText("MY CO-PILOT 의 답 — 결정 하나, 승인 하나", { placeholder: "title" });
  const flow = [
    ["MdManageSearch", "상황 이해", "누구와 · 어디로 · 왜\n차량 상태와 함께"],
    ["MdLightbulb", "결정 하나", "비교는 앱이 하고\n결과 하나만"],
    ["MdTouchApp", "승인 한 번", "바꾸기 전에\n반드시 묻습니다"],
    ["MdPlayCircle", "실행", "내비 · 차량 기능으로"],
    ["MdVerified", "다시 읽어 확인", "요청이 아니라\n반영을 확인"],
  ];
  for (let i = 0; i < flow.length; i++) {
    const x = 0.6 + i * 2.48;
    await iconDot(s, x + 0.55, 1.6, 1.05, flow[i][0], i === 2 ? C.accent2 : C.accent1, "flow-icon-" + i);
    T(s, flow[i][1], { x, y: 2.85, w: 2.15, h: 0.45, fontSize: 18, bold: true, align: "center" });
    T(s, flow[i][2], { x, y: 3.3, w: 2.15, h: 0.9, fontSize: 13, color: C.text2, align: "center" });
    if (i < flow.length - 1) s.addShape(pres.shapes.RIGHT_ARROW, { x: x + 1.95, y: 1.95, w: 0.45, h: 0.35, fill: { color: C.accent4 }, line: { color: C.accent4 }, objectName: "flow-arrow-" + i });
  }
  const axes = [
    ["Multi-Service Integration", "떨어진 서비스의 정보를 하나의 이동 판단에 씁니다. 앱을 띄워 주는 런처가 아닙니다."],
    ["Context-Aware Assistance", "운전자 × 탑승 조합 × 이동 목적으로 상황을 이해하고, 지금 필요한 행동 하나만 고릅니다."],
    ["One-Action Execution", "승인하면 실행하고 결과를 다시 읽어 확인합니다. 못 하는 것은 직접 하도록 안내합니다."],
  ];
  for (let i = 0; i < axes.length; i++) {
    const x = 0.6 + i * 4.1;
    card(s, x, 4.5, 3.85, 2.15, "axis-" + i);
    T(s, axes[i][0], { x: x + 0.3, y: 4.7, w: 3.3, h: 0.45, fontSize: 16, bold: true, color: C.accent3 });
    T(s, axes[i][1], { x: x + 0.3, y: 5.2, w: 3.3, h: 1.3, fontSize: 14, color: C.text2 });
  }
  s.addNotes("핵심은 다섯 단계입니다. 상황을 이해하고, 결정 하나를 만들고, 승인을 한 번 받고, 실행하고, 실제로 반영됐는지 다시 읽어 확인합니다. 아래 세 축이 이 흐름을 받칩니다.");

  // 5. 고객 편의 6가지
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "해법" });
  s.addText("운전자의 수고를 덜기 위해 지킨 여섯 가지", { placeholder: "title" });
  const six = [
    ["MdLooksOne", "한 번 고르면 다시 묻지 않습니다", "목적과 함께 탄 사람을 한 번 고르면 실내 준비 · 대기 · 귀가 안내가 그 선택을 다시 씁니다."],
    ["MdDifference", "다른 것만 묻습니다", "저장된 취향과 지금 차량 설정을 앱이 비교해, 바꿀 것만 승인 하나로 묶습니다."],
    ["MdFilterAlt", "비교는 앱이, 결과는 하나", "여러 앱에서 찾아보던 정보를 앱이 거르고, 추천 하나와 대안 둘만 보여 줍니다."],
    ["MdHistory", "도착해도 다음 일정을 기억합니다", "학원에 도착해도 귀가가 남아 있습니다. 앱이 꺼졌다 켜져도 이어집니다."],
    ["MdFactCheck", "실행하고 다시 확인합니다", "\"요청함\"이 아니라 \"반영됨\"을 차량과 내비에서 다시 읽어 보여 줍니다."],
    ["MdHelpOutline", "모르면 모른다고 말합니다", "확인되지 않은 값은 숫자로 쓰지 않습니다. 추정은 늘 범위와 \"추정\"으로."],
  ];
  for (let i = 0; i < six.length; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.6 + col * 4.1, y = 1.55 + row * 2.6;
    card(s, x, y, 3.85, 2.35, "care-" + i);
    await iconDot(s, x + 0.3, y + 0.3, 0.75, six[i][0], C.accent1, "care-icon-" + i);
    T(s, six[i][1], { x: x + 1.2, y: y + 0.3, w: 2.45, h: 0.8, fontSize: 16, bold: true, valign: "middle" });
    T(s, six[i][2], { x: x + 0.3, y: y + 1.2, w: 3.3, h: 1.05, fontSize: 13, color: C.text2 });
  }
  s.addNotes("기능 하나하나를 '운전자가 무엇을 덜 하게 되나'로 설계했습니다. 다시 묻지 않고, 다른 것만 묻고, 비교는 앱이 하고, 다음 일정을 기억하고, 실행 결과를 확인하고, 모르면 모른다고 말합니다.");

  // 6. 시나리오 1 비교
  pres.addSection({ title: "실증 1 · 픽업" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "실증 1 · 픽업" });
  s.addText("실증 ① 아이 픽업 후 귀가 — 모든 동력원", { placeholder: "title" });
  badge(s, 11.75, 0.67, "에뮬");
  card(s, 0.6, 1.5, 5.7, 5.2, "before-card", C.background2);
  T(s, "지금 운전자가 하는 일", { x: 0.95, y: 1.75, w: 5.0, h: 0.5, fontSize: 18, bold: true, color: C.accent2 });
  T(s, [
    { text: "차량 설정 앱을 열어 시트 열선과 공조를 따로 맞춤", options: { bullet: true, breakLine: true } },
    { text: "내비에 학원을 목적지로 입력", options: { bullet: true, breakLine: true } },
    { text: "도착하면 내비 안내는 끝 — 귀가는 기억해야 함", options: { bullet: true, breakLine: true } },
    { text: "기다리는 동안 집 경로를 다시 찾아 설정", options: { bullet: true, breakLine: true } },
    { text: "설정이 실제로 바뀌었는지 직접 확인", options: { bullet: true } },
  ], { x: 0.95, y: 2.35, w: 5.0, h: 3.2, fontSize: 15, color: C.text2, paraSpaceAfter: 10 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.95, y: 5.65, w: 5.0, h: 0.75, rectRadius: 0.1, fill: { color: C.background1 }, line: { color: C.background1 }, objectName: "before-sum" });
  T(s, "앱 두 개를 오가며, 확인까지 운전자 몫", { x: 1.15, y: 5.65, w: 4.6, h: 0.75, fontSize: 15, bold: true, color: C.accent2, valign: "middle" });
  s.addShape(pres.shapes.RIGHT_ARROW, { x: 6.45, y: 3.75, w: 0.5, h: 0.6, fill: { color: C.accent4 }, line: { color: C.accent4 }, objectName: "compare-arrow" });
  card(s, 7.1, 1.5, 5.6, 5.2, "after-card", C.background2);
  T(s, "MY CO-PILOT 과 함께", { x: 7.45, y: 1.75, w: 5.0, h: 0.5, fontSize: 18, bold: true, color: C.accent1 });
  const after = [
    ["1", "\"가족 · 아이 픽업 후 귀가\" 한 번 선택"],
    ["2", "지금 설정과 다른 것만 — 승인 한 번 → 적용 확인"],
    ["3", "학원 도착 뒤에도 귀가 일정을 기억"],
    ["4", "\"집으로 안내 시작\" 한 번 → 내비 목적지 재확인"],
  ];
  for (let i = 0; i < after.length; i++) {
    const y = 2.4 + i * 1.02;
    s.addShape(pres.shapes.OVAL, { x: 7.45, y, w: 0.5, h: 0.5, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: "step-dot-" + i });
    T(s, after[i][0], { x: 7.45, y, w: 0.5, h: 0.5, fontSize: 15, bold: true, color: C.background1, align: "center", valign: "middle" });
    T(s, after[i][1], { x: 8.15, y: y - 0.05, w: 4.3, h: 0.85, fontSize: 15, valign: "middle" });
  }
  s.addNotes("왼쪽은 지금 운전자가 하는 일, 오른쪽은 MY CO-PILOT 과 함께 할 때입니다. 운전자가 하는 일은 고르고 승인하는 것뿐입니다. 이 흐름은 Pleos Connect 에뮬레이터에서 실제로 동작을 확인했습니다. 조작이 몇 회 줄었는지는 아직 측정 전이라 숫자로 말하지 않습니다.");

  // 7. 시나리오 1 화면
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "실증 1 · 픽업" });
  s.addText("실제 화면 — Pleos Connect Emulator 에서 동작", { placeholder: "title" });
  badge(s, 11.75, 0.67, "에뮬");
  const shots = [
    ["s-prepare.png", 1010, 1150, "① 다른 것만, 승인 한 번"],
    ["s-applied.png", 1010, 1000, "② 다시 읽어 \"적용 확인\""],
    ["s-wait.png", 1010, 1210, "③ 도착 뒤에도 귀가 기억"],
    ["s-route.png", 1010, 1000, "④ 귀가 안내 → 목적지 확인"],
  ];
  for (let i = 0; i < shots.length; i++) {
    const bx = 0.6 + i * 3.08, boxW = 2.85, boxH = 4.3;
    const f = fit(shots[i][1], shots[i][2], boxW, boxH);
    shot(s, shots[i][0], bx + (boxW - f.w) / 2, 1.5, f.w, f.h, "shot-" + i);
    T(s, shots[i][3], { x: bx, y: 5.1, w: boxW, h: 0.4, fontSize: 14, bold: true });
  }
  card(s, 0.6, 5.7, 12.1, 0.7, "did-band", C.background2);
  T(s, [{ text: "이 흐름에서 운전자가 한 일 — ", options: { bold: true, color: C.accent1 } }, { text: "목적 선택 · 승인 · \"집으로 안내 시작\". 비교와 확인은 앱이 합니다." }],
    { x: 0.9, y: 5.7, w: 11.6, h: 0.7, fontSize: 15, valign: "middle" });
  T(s, "Pleos Connect Emulator v2.1.0 실측 · 열선 설정 · Mission 복원(강제 종료·재부팅) · 내비 경로 요청 확인. 도착 전환은 모의 주행(이 에뮬레이터에 속도 신호 없음).",
    { x: 0.6, y: 6.5, w: 12.1, h: 0.4, fontSize: 11, color: C.accent6 });
  s.addNotes("모두 에뮬레이터에서 찍은 실제 화면입니다. 열선 설정은 요청 후 차량 값을 다시 읽어 확인했고, 귀가 안내는 내비 목적지를 다시 읽어 확인했습니다. 에뮬레이터에 속도 신호가 없어 도착 전환은 모의 주행으로 재현했다는 점을 함께 밝힙니다.");

  // 8. 시나리오 2
  pres.addSection({ title: "실증 2 · 장거리" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "실증 2 · 장거리" });
  s.addText("실증 ② 가족 장거리 — 첫 외부 서비스 통합", { placeholder: "title" });
  const ev = [
    ["MdBatteryChargingFull", "\"서야 하나\"를 먼저", "도착 후 차 안에서 기다리는 시간까지 센 에너지로 판단합니다. 필요 없으면 충전소를 찾지도 않습니다."],
    ["MdEvStation", "실시간 충전기 상태로 하나", "공공 충전소 상태 · 도달 가능성 · 아이와 반려동물 조건을 함께 걸러 추천 하나, 대안 둘."],
    ["MdAddLocationAlt", "승인하면 경유지로", "내비 경유지에 넣고 목록을 다시 읽어 확인합니다. 칸이 차 있으면 지우지 않고 묻습니다."],
  ];
  for (let i = 0; i < ev.length; i++) {
    const y = 1.55 + i * 1.45;
    await iconDot(s, 0.6, y, 0.8, ev[i][0], C.accent1, "ev-icon-" + i);
    T(s, ev[i][1], { x: 1.6, y: y - 0.05, w: 5.4, h: 0.45, fontSize: 17, bold: true });
    T(s, ev[i][2], { x: 1.6, y: y + 0.4, w: 5.4, h: 0.95, fontSize: 13, color: C.text2 });
  }
  card(s, 0.6, 5.7, 6.4, 0.75, "ev-stat", C.background2);
  T(s, "8곳 · 77대", { x: 0.85, y: 5.7, w: 2.0, h: 0.75, fontSize: 24, bold: true, color: C.accent3, valign: "middle" });
  T(s, "경부선 부산 방향 휴게소 충전기의 실시간 상태를 공공 API 로 수신", { x: 2.9, y: 5.7, w: 3.95, h: 0.75, fontSize: 12, color: C.text2, valign: "middle" });
  T(s, "배터리 · 내비 · 경유지는 에뮬레이터 실측, 충전기 상태는 공공 API 실호출. 휴게소 시설과 화면 속 충전기 값은 시연 데이터.",
    { x: 0.6, y: 6.5, w: 6.4, h: 0.45, fontSize: 10, color: C.accent6 });
  { const f = fit(1010, 1210, 4.6, 4.7); shot(s, "s-ev.png", 7.55 + (4.6 - f.w) / 2 + 0.25, 1.5, f.w, f.h, "shot-ev"); }
  badge(s, 8.45, 6.4, "에뮬", 0.95); badge(s, 9.55, 6.4, "실 API", 1.05); badge(s, 10.75, 6.4, "시연", 0.95);
  s.addNotes("두 번째 실증은 전기차 장거리입니다. 충전 판단이 제품의 중심은 아니고, 외부 서비스를 통합하는 첫 사례입니다. 공공 충전소 API 로 경부선 부산 방향 8곳, 충전기 77대의 실시간 상태를 받는 것까지 확인했고, 앱 화면까지 이어지는 흐름은 확인 중입니다. 화면 속 충전기 값은 시연 데이터입니다.");

  // 9. 안심 설계
  pres.addSection({ title: "신뢰" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "신뢰" });
  s.addText("맡겨도 안심되도록 — 편의는 신뢰에서 나옵니다", { placeholder: "title" });
  const trust = [
    ["MdBlock", "경로와 목적지를 스스로 바꾸지 않습니다", "모든 실행은 운전자의 승인 뒤에만 합니다."],
    ["MdLayers", "기존 경유지를 지우지 않습니다", "두 칸이 다 차 있으면 어느 칸을 바꿀지 묻습니다."],
    ["MdRecordVoiceOver", "주행 중에는 한 줄과 음성만", "비교 · 설정 · 승인은 정차 중에만 합니다."],
    ["MdStraighten", "추정은 범위로 말합니다", "에너지는 늘 범위와 \"추정\". 공식 주행가능거리처럼 보이지 않게."],
    ["MdLabel", "실제와 시연을 늘 구분해 보여 줍니다", "화면의 값마다 차량 정보인지 시연 데이터인지 표시합니다."],
  ];
  for (let i = 0; i < trust.length; i++) {
    const y = 1.5 + i * 1.03;
    card(s, 0.6, y, 12.1, 0.88, "trust-" + i, C.background2);
    await iconDot(s, 0.8, y + 0.12, 0.64, trust[i][0], C.accent3, "trust-icon-" + i);
    T(s, trust[i][1], { x: 1.7, y, w: 5.6, h: 0.88, fontSize: 16, bold: true, valign: "middle" });
    T(s, trust[i][2], { x: 7.4, y, w: 5.1, h: 0.88, fontSize: 14, color: C.text2, valign: "middle" });
  }
  s.addNotes("운전자가 결정을 맡기려면 먼저 믿을 수 있어야 합니다. 그래서 스스로 바꾸지 않고, 지우지 않고, 주행 중에는 방해하지 않고, 추정은 범위로, 실제와 시연은 늘 구분해 보여 줍니다.");

  // 10. 기존 기능과의 관계
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "신뢰" });
  s.addText("기존 기능을 대체하지 않고, 엮습니다", { placeholder: "title" });
  card(s, 0.6, 1.6, 12.1, 1.5, "layer-top", C.accent1);
  T(s, "MY CO-PILOT — 이번 이동에 맞는 순서와 조합으로 엮고, 실행 결과까지 확인하는 층", { x: 0.95, y: 1.6, w: 11.4, h: 1.5, fontSize: 20, bold: true, color: C.background1, valign: "middle" });
  const base = [
    ["MdNavigation", "기본 내비", "경로 · 경유지"],
    ["MdTune", "차량 설정", "시트 프리셋 · 사전 공조"],
    ["MdMic", "Gleo AI", "부르면 대화로 답함"],
    ["MdCloudQueue", "외부 서비스", "충전 · (날씨 · 주차 · 일정)"],
  ];
  for (let i = 0; i < base.length; i++) {
    const x = 0.6 + i * 3.08;
    s.addShape(pres.shapes.UP_ARROW, { x: x + 1.2, y: 3.25, w: 0.45, h: 0.55, fill: { color: C.accent4 }, line: { color: C.accent4 }, objectName: "up-" + i });
    card(s, x, 3.95, 2.85, 1.55, "base-" + i);
    await iconDot(s, x + 0.25, 4.15, 0.6, base[i][0], C.accent3, "base-icon-" + i);
    T(s, base[i][1], { x: x + 1.0, y: 4.15, w: 1.75, h: 0.6, fontSize: 16, bold: true, valign: "middle" });
    T(s, base[i][2], { x: x + 0.25, y: 4.85, w: 2.45, h: 0.55, fontSize: 12, color: C.text2 });
  }
  card(s, 0.6, 5.8, 12.1, 0.9, "nots", C.background2);
  T(s, "만들지 않는 것 — 자체 지도 · 턴바이턴 내비 · 범용 장소 검색 · 범용 챗봇. 공식 데이터는 판단의 입력으로만 씁니다.", { x: 0.95, y: 5.8, w: 11.5, h: 0.9, fontSize: 15, valign: "middle" });
  s.addNotes("현대차는 이미 좋은 도구를 갖고 있습니다. MY CO-PILOT 은 그 위에서 이번 이동에 맞게 순서를 정하고 조합하는 층입니다. 검색 화면이나 지도, 범용 챗봇은 만들지 않습니다. 괄호 안의 날씨 · 주차 · 일정은 아직 연동 전입니다.");

  // 11. 모든 차량
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "신뢰" });
  s.addText("전기차가 아니어도 매일 쓰는 이유", { placeholder: "title" });
  card(s, 0.6, 1.55, 7.2, 5.1, "common-card", C.background2);
  await iconDot(s, 0.9, 1.8, 0.75, "MdDirectionsCar", C.accent1, "common-icon");
  T(s, "모든 동력원 — 공통 기능", { x: 1.85, y: 1.8, w: 5.6, h: 0.75, fontSize: 19, bold: true, valign: "middle" });
  T(s, [
    { text: "함께 탄 사람에 맞춘 실내 준비(공조 · 시트)", options: { bullet: true, breakLine: true } },
    { text: "이동 목적 기억 — 도착 뒤에도 남은 일정 유지", options: { bullet: true, breakLine: true } },
    { text: "원탭 귀가 안내와 반영 확인", options: { bullet: true, breakLine: true } },
    { text: "출발 준비 · 하차 확인", options: { bullet: true, breakLine: true } },
    { text: "제안 하나 · 주행 중 한 줄", options: { bullet: true } },
  ], { x: 0.9, y: 2.8, w: 6.6, h: 3.7, fontSize: 17, color: C.text2, paraSpaceAfter: 16 });
  card(s, 8.1, 1.55, 4.6, 5.1, "ev-card", C.background2);
  await iconDot(s, 8.4, 1.8, 0.75, "MdBolt", C.accent5, "evmod-icon");
  T(s, "전기차에서만 켜지는 모듈", { x: 9.35, y: 1.8, w: 3.2, h: 0.75, fontSize: 17, bold: true, valign: "middle" });
  T(s, [
    { text: "도착 후 대기까지 센 에너지 판단", options: { bullet: true, breakLine: true } },
    { text: "충전 결정과 경유지 연결", options: { bullet: true } },
  ], { x: 8.4, y: 2.8, w: 4.0, h: 1.6, fontSize: 15, color: C.text2, paraSpaceAfter: 10 });
  T(s, "내연기관 · 하이브리드의 연료 판단은 차량 연료 데이터를 확인한 뒤 더합니다. 지금은 지원한다고 말하지 않습니다.", { x: 8.4, y: 4.7, w: 4.0, h: 1.7, fontSize: 13, color: C.accent6 });
  s.addNotes("MY CO-PILOT 의 기본 기능은 동력원과 무관합니다. 전기차 에너지 판단은 전기차에서만 켜지는 모듈입니다. 연료 계산은 아직 지원하지 않으며, 그렇게 분명히 말합니다. 에뮬레이터 실측은 전기차 이미지에서 했습니다.");

  // 12. 무엇이 동작하나
  pres.addSection({ title: "현황과 다음" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "현황과 다음" });
  s.addText("무엇이 실제로 동작하는가", { placeholder: "title" });
  const ev2 = [
    ["배터리 잔량 · 용량 수신(단위 정규화)", "에뮬"],
    ["공조 온도 · 시트 열선/통풍 설정 → 다시 읽어 확인", "에뮬"],
    ["반복된 조정을 저장할지 한 번만 제안", "에뮬"],
    ["픽업 Mission · 앱 재시작 뒤 복원", "에뮬"],
    ["내비 귀가 안내 · 경유지 추가 → 재확인", "에뮬"],
    ["공공 충전소 실시간 상태(8곳 · 77대)", "실 API"],
    ["휴게소 가족 시설 정보", "시연"],
    ["일정 · 주차 · 장소 · 날씨 · 주유", "미구현"],
  ];
  for (let i = 0; i < ev2.length; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * 6.15, y = 1.55 + row * 1.2;
    card(s, x, y, 5.95, 1.0, "ev2-" + i, C.background2);
    badge(s, x + 0.25, y + 0.34, ev2[i][1], 1.05);
    T(s, ev2[i][0], { x: x + 1.5, y, w: 4.3, h: 1.0, fontSize: 14, valign: "middle" });
  }
  T(s, "자동 테스트 469개(판단 엔진 Kotlin 260 · 같은 규칙의 TypeScript 209) — 두 언어가 같은 입력에 같은 답을 내는지 공통 사례로 검사합니다.",
    { x: 0.6, y: 6.4, w: 12.1, h: 0.45, fontSize: 12, color: C.accent6 });
  s.addNotes("주장마다 증거 등급을 붙였습니다. 초록은 에뮬레이터 실측, 파랑은 외부 API 실호출, 노랑은 시연 데이터, 회색은 아직 구현하지 않은 것입니다.");

  // 13. 다음 단계
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "현황과 다음" });
  s.addText("다음 단계 — 서비스를 하나씩 더 엮습니다", { placeholder: "title" });
  const road = [
    ["1차 · 11월", "플랫폼 정의와 실증 두 장면", "픽업(동력원 무관) · 전기차 장거리(첫 외부 서비스)", C.accent1],
    ["PT · 12월", "통합 시나리오 실연", "에뮬레이터에서 처음부터 끝까지 · 픽업 + 날씨 · 교통으로 출발 시점을 바꾸는 연결 하나", C.accent3],
    ["다음 핵심", "업무 일정 + 주차 + 내비", "방문 시각과 목적지에 맞춘 출발 계획 · 공식 데이터와 접근 권한 확인 뒤", C.accent2],
  ];
  s.addShape(pres.shapes.LINE, { x: 1.05, y: 2.35, w: 11.2, h: 0, line: { color: HEX.accent4, width: 3 }, objectName: "timeline" });
  for (let i = 0; i < road.length; i++) {
    const x = 0.6 + i * 4.1;
    s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: 2.1, w: 0.5, h: 0.5, fill: { color: road[i][3] }, line: { color: road[i][3] }, objectName: "milestone-" + i });
    T(s, road[i][0], { x, y: 1.5, w: 3.8, h: 0.45, fontSize: 15, bold: true, color: road[i][3] });
    card(s, x, 2.95, 3.85, 2.75, "road-" + i, C.background2);
    T(s, road[i][1], { x: x + 0.3, y: 3.2, w: 3.3, h: 0.9, fontSize: 18, bold: true });
    T(s, road[i][2], { x: x + 0.3, y: 4.15, w: 3.3, h: 1.45, fontSize: 14, color: C.text2 });
  }
  card(s, 0.6, 5.95, 12.1, 0.8, "road-rule", C.background2);
  await iconDot(s, 0.8, 6.05, 0.6, "MdRule", C.accent3, "road-rule-icon");
  T(s, "원칙 — 공식 공급자와 접근 권한을 확인한 데이터만 연결합니다. 정보를 하나 더 띄우는 것이 아니라, 운전자의 결정을 실제로 바꾸는 연결만 만듭니다.", { x: 1.65, y: 5.95, w: 10.85, h: 0.8, fontSize: 14, valign: "middle" });
  s.addNotes("1차에서는 플랫폼과 실증 두 장면을, PT 에서는 에뮬레이터에서 통합 시나리오를 처음부터 끝까지 보여 드립니다. 그다음 핵심 서비스는 업무 일정 · 주차 · 내비를 묶는 것입니다. 외부 데이터는 공식 공급자와 권한을 확인한 뒤에만 연결합니다. 날씨 정보를 하나 더 띄우는 것은 목표가 아니고, 픽업 결정을 실제로 바꾸는 연결이어야 합니다.");

  // 14. 마무리
  pres.addSection({ title: "마무리" });
  s = pres.addSlide({ masterName: "CLOSING_DARK", sectionTitle: "마무리" });
  s.addText("운전자는 고르고 승인만.\n연결과 확인은 MY CO-PILOT 이 합니다", { placeholder: "title" });
  s.addText("여러 서비스의 정보를 연결해, 다음 행동을 하나의 결정으로", { placeholder: "body" });
  s.addNotes("정리하면, 운전자는 고르고 승인만 하고, 서비스 사이를 잇는 일과 결과 확인은 MY CO-PILOT 이 맡습니다. 감사합니다.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("written", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
