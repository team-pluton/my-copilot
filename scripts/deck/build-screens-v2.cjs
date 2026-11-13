// MY CO-PILOT 전체 화면 점검 덱 2차 — 2차 리뷰 반영본 폰 캡처 34장 + 변경 전/후 + 화면별 요약 · 에뮬레이터에서 볼 것
const pptxgen = require("pptxgenjs");
const { applyTheme } = require(process.env.PPTX_SKILL + "/scripts/apply_theme.js");
const OUT = process.argv[2] || "screens.pptx";
const IMG = __dirname + "/svc2/";

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
pres.title = "MY CO-PILOT — 전체 화면 점검";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

pres.defineSlideMaster({
  title: "TITLE_DARK",
  background: { color: HEX.dk1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 2.0, w: 11.7, h: 1.4, fontSize: 48, bold: true, color: C.background1, valign: "bottom" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.6, w: 11.7, h: 2.4, fontSize: 18, color: C.accent1, valign: "top" }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "SCREEN",
  background: { color: HEX.lt2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.25, w: 10.6, h: 0.65, fontSize: 24, bold: true, color: C.text1, valign: "middle" }, text: "" } },
    { text: { text: "MY CO-PILOT · 전체 화면 점검 2차 · 2026-11-11", options: { x: 0.5, y: 7.1, w: 6, h: 0.28, fontSize: 9, color: C.accent6 } } },
  ],
  slideNumber: { x: 12.3, y: 7.05, w: 0.55, h: 0.36, fontSize: 9, color: HEX.accent6, align: "right" },
});

const T = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, fontSize: 12, color: C.text1, valign: "top", ...o });
const box = (s, x, y, w, h, fill, name) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: fill }, line: { color: fill }, objectName: name });
const bullets = (arr, o = {}) => arr.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < arr.length - 1, paraSpaceAfter: 4, ...o } }));

/** 화면 슬라이드 — 왼쪽 캡처(세로 1~3장), 오른쪽 요약 · 에뮬레이터에서 볼 것 · 근거 */
function screen({ section, title, shots, summary, check, tag }) {
  const s = pres.addSlide({ masterName: "SCREEN", sectionTitle: section });
  s.addText(title, { placeholder: "title" });
  T(s, section, { x: 11.2, y: 0.38, w: 1.65, h: 0.4, fontSize: 10, color: C.accent3, align: "right", bold: true });
  const n = shots.length;
  const h = n === 3 ? 5.55 : 5.65, w = h * 720 / 1433, gap = 0.18, y = 1.05;
  shots.forEach(([f, cap], i) => {
    const x = 0.5 + i * (w + gap);
    s.addImage({ path: IMG + f + ".jpg", x, y, w, h, altText: cap, objectName: "shot-" + f });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { type: "none" }, line: { color: "C9D2DB", width: 0.75 }, objectName: "frame-" + f });
    T(s, cap, { x, y: y + h + 0.06, w, h: 0.4, fontSize: 9.5, color: C.text2, align: "center" });
  });
  const tx = 0.5 + n * (w + gap) + 0.2, tw = 12.83 - tx;
  T(s, "요약", { x: tx, y: 1.05, w: tw, h: 0.3, fontSize: 12, bold: true, color: C.accent1 });
  const sumH = Math.min(2.75, 0.3 + summary.join("").length * (n === 3 ? 0.0105 : 0.0068) + summary.length * 0.2);
  T(s, bullets(summary), { x: tx, y: 1.4, w: tw, h: sumH, fontSize: n === 3 ? 11 : 12, color: C.text1 });
  const cy = 1.4 + sumH + 0.15, ch = 6.55 - cy;
  box(s, tx - 0.12, cy, tw + 0.24, ch, HEX.lt1, "check-card");
  T(s, "에뮬레이터에서 볼 것", { x: tx, y: cy + 0.12, w: tw, h: 0.3, fontSize: 11.5, bold: true, color: C.accent3 });
  T(s, check.map((t, i) => ({ text: "☐  " + t, options: { breakLine: i < check.length - 1, paraSpaceAfter: 5 } })), { x: tx, y: cy + 0.47, w: tw, h: ch - 0.55, fontSize: n === 3 ? 10 : 10.5, color: C.text1 });
  T(s, tag, { x: tx, y: 6.62, w: tw, h: 0.4, fontSize: 9, color: C.accent6, italic: true });
  return s;
}

// ── 1. 표지 ───────────────────────────────────────────
pres.addSection({ title: "개요" });
{
  const s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "개요" });
  s.addText("MY CO-PILOT 전체 화면 점검 · 2차", { placeholder: "title" });
  s.addText([
    { text: "화면점검 2차 리뷰 반영본 — 바뀐 것은 변경 전/후로, 나머지는 흐름 순서대로", options: { breakLine: true } },
    { text: "빌드: 브랜치 ux-review-2026-11-11 (커밋 e38f216) · 테스트 TS 212 · Kotlin 263 · release 빌드 성공", options: { breakLine: true, fontSize: 14, color: C.accent4 } },
    { text: "촬영: 연결된 폰(SM-G991N)의 모의 데이터 모드 34장 — Pleos 에뮬레이터 화면이 아니다", options: { fontSize: 14, color: C.accent5 } },
  ], { placeholder: "body" });
}

// ── 2. 흐름 지도 ──────────────────────────────────────
{
  const s = pres.addSlide({ masterName: "SCREEN", sectionTitle: "개요" });
  s.addText("한눈에 — 두 시나리오, 여섯 단계", { placeholder: "title" });
  const steps = [
    ["시작", "운전자 고르면\n그 사람의 지난번처럼", "7"],
    ["출발 준비", "취향 vs 차량 설정\n다른 것만 승인 하나", "8~11"],
    ["주행 중", "한 줄 + 음성만\n비교·설정 없음", "13"],
    ["도착·대기", "기다리기가 기본\n귀가 일정 기억", "14~15"],
    ["귀가", "집으로 안내 시작\n목적지 재조회 확인", "16~17"],
    ["하차·완료", "체크리스트\n이동 마침", "18"],
  ];
  const w = 1.95, gap = 0.12;
  steps.forEach(([h, d, pg], i) => {
    const x = 0.5 + i * (w + gap);
    const dark = i === 0;
    box(s, x, 1.25, w, 1.95, dark ? HEX.accent1 : HEX.lt1, "step-" + i);
    T(s, h, { x: x + 0.15, y: 1.38, w: w - 0.3, h: 0.4, fontSize: 15, bold: true, color: dark ? C.background1 : C.text1 });
    T(s, d, { x: x + 0.15, y: 1.85, w: w - 0.3, h: 0.85, fontSize: 11, color: dark ? C.background1 : C.text2 });
    T(s, "슬라이드 " + pg, { x: x + 0.15, y: 2.82, w: w - 0.3, h: 0.28, fontSize: 9, color: dark ? C.background1 : C.accent6 });
  });
  T(s, "시나리오 1 — 아이 픽업 후 귀가 (모든 동력원 · V5 Mission)  ·  시나리오 2 — 가족 장거리 서울→부산 (EV 특화 · V6 충전 판단, 슬라이드 19~21)", { x: 0.5, y: 3.4, w: 12.3, h: 0.35, fontSize: 12, bold: true, color: C.accent3 });
  box(s, 0.5, 3.95, 6.0, 2.85, HEX.lt1, "legend");
  T(s, "이 덱의 화면이 보여 주는 것과 아닌 것", { x: 0.7, y: 4.1, w: 5.6, h: 0.3, fontSize: 12.5, bold: true });
  T(s, bullets([
    "폰은 차량 신호가 없어 배터리·공조·기어가 전부 시연 데이터다(우상단 배지 '시연 데이터')",
    "내비 경로·경유지 결과는 '(모의)' — 실제 NaviHelper 콜백이 아니다",
    "주행·도착은 개발용 조작판으로 넘긴 것(에뮬레이터에도 속도 신호가 없다)",
    "충전소는 조작판의 '시연 데이터' — 실제 공공 API(프록시)가 아니다",
  ]), { x: 0.7, y: 4.5, w: 5.6, h: 2.2, fontSize: 11, color: C.text2 });
  box(s, 6.8, 3.95, 6.0, 2.85, HEX.lt1, "emu");
  T(s, "에뮬레이터에서 같은 흐름을 볼 때 달라져야 하는 것", { x: 7.0, y: 4.1, w: 5.6, h: 0.3, fontSize: 12.5, bold: true, color: C.accent1 });
  T(s, bullets([
    "배지가 '배터리·공조·시트·도어 차량 정보 · 그 밖은 시연 데이터'로 [에뮬]",
    "집으로 안내 → 실제 내비가 경로 시작, 목적지 재조회 '내비가 확인함' + '내비에 저장된 집: …'",
    "경유지로 추가 → 내비 경유지 목록 재조회로 확인(콜백 7~9초 걸린 기록 있음, E27)",
    "충전소: 프록시(--demo) 켜고 '실제 프록시'로 — 조회 시각이 실제 시각",
  ]), { x: 7.0, y: 4.5, w: 5.6, h: 2.2, fontSize: 11, color: C.text2 });
}

// ── 3~6. 2차에서 바뀐 것 ───────────────────────────────
pres.addSection({ title: "2차 변경" });
{
  const s = pres.addSlide({ masterName: "SCREEN", sectionTitle: "2차 변경" });
  s.addText("2차 리뷰 — 코드를 확인한 결과와 한 일", { placeholder: "title" });
  const H = (t) => ({ text: t, options: { bold: true, color: HEX.lt1, fill: { color: HEX.dk1 }, fontSize: 11 } });
  const rows = [
    [H("리뷰 지적"), H("코드를 보니"), H("한 일"), H("슬라이드")],
    ["'지난번처럼'이 다른 운전자·게스트에게 보이나", "보였다 — 기기에 하나만 저장, B 가 A 의 이동을 봤다", "운전자별 저장 · 운전자 미선택·프로필 없이는 안 보임 · 누르면 새 이동", "4 · 7"],
    ["충전 판단 아래 공조 승인 버튼이 또 있다", "맞다 — 주 행동 버튼 5개가 한 화면", "경유지 정하기 전엔 실내 카드를 한 줄로 접음 · 확인 뒤 다시 펼침", "5 · 20"],
    ["후보 탭 삭제", "쉼표 DRIVE 점수 목록 — 결정 카드와 겹침", "탭 삭제 · 대안은 결정 카드 '다른 후보 비교 ▼'", "6"],
    ["P 기어만으로 도착 확정 금지", "이미 지킴 — P + 남은 거리 0.5km 안일 때만 도착", "남은 거리 모름 + P = 중간 정차 테스트 고정(TS·Kotlin)", "14"],
    ["집 확인은 이름 말고 좌표·식별자로", "이미 그렇다 — poiId 일치 또는 100m 안", "변경 없음", "16"],
    ["내비 요청·반영·Mission 상태 혼동", "섞이지 않는다 — 경로 단계와 귀가 확인은 따로", "6단계 상태 분리는 11/15 뒤", "16"],
    ["release 조작판 숨김 ≠ 모의 주입 차단", "맞다 — 숨김만", "빌드 변형 분리 11/15 뒤(별도 검증 항목)", "12"],
  ];
  const body = rows.map((r, i) => i === 0 ? r : r.map((c) => ({ text: c, options: { fontSize: 10.5, color: HEX.dk1, fill: { color: i % 2 ? "FFFFFF" : "F6F8FA" } } })));
  s.addTable(body, { x: 0.5, y: 1.1, w: 12.3, colW: [3.0, 3.9, 4.4, 1.0], border: { type: "solid", pt: 0.5, color: "D5DCE3" }, rowH: 0.6, valign: "middle", margin: 0.06, objectName: "review2" });
  T(s, "11/15 뒤: 대기 중 재질문 정책 · 하차 체크리스트 필수/선택 분리 · 귀가 Mission 6단계 · 추천 이유 3단 · 공조 일부 실패 표시 · 조작 수 측정", { x: 0.5, y: 6.45, w: 12.3, h: 0.45, fontSize: 10.5, color: C.text2 });
}
screen({
  section: "2차 변경", title: "변경 전/후 ① — '지난번처럼'은 고른 운전자의 것만",
  shots: [["v1-24-choose-last", "변경 전 · 누가 타든 지난 이동"], ["24-choose-nodriver", "변경 후 · 운전자 미선택"], ["24b-choose-dad", "아빠 선택 → 아빠의 지난 이동"]],
  summary: [
    "전: 기기에 마지막 이동 하나 — 가족 차에서 다음 사람에게 앞 사람의 이동 목적이 떴다",
    "후: 운전자를 고르기 전에는 안 보인다. 고르면 그 운전자의 지난 이동만",
    "프로필 없이·운전자 미확인 이동은 기억하지 않는다",
    "누르면 새 이동 — 지난 상태를 되살리지 않고 차량 값·충전소를 다시 읽는다",
  ],
  check: ["아빠로 이동 → 앱 재시작 → 엄마 선택 시 '지난번처럼' 없음", "'프로필 없이 시작' 뒤 재시작해도 기록 없음", "반복 사용은 2탭(운전자 + 지난번처럼) — 운전자 인식 API 없음의 비용"],
  tag: "근거: lastModeBy · lastTripFor (TS↔Kotlin 테스트) · 저장 키 mode.<운전자>",
});
screen({
  section: "2차 변경", title: "변경 전/후 ② — 한 화면에 주 행동 하나",
  shots: [["26-family-decision", "변경 후 · 실내 카드 한 줄로 접힘"], ["29b-cabin-back", "경유지 확인 뒤 · 실내 카드 다시"]],
  summary: [
    "전: 출발 준비 화면에 '경유지로 추가 · 이곳 말고 · 다시 확인 · 2개 한 번에 적용 · 지금 그대로'가 함께 — 무엇부터 할지 사용자가 판단",
    "후: 충전 경유지가 안 정해졌으면 '실내 설정 2개가 저장 취향과 달라요 · 충전 경유지를 정한 뒤 맞춰요' 한 줄",
    "'지금 맞추기 ▼'로 바로 펼칠 수 있다 — 막지 않는다",
    "경유지가 확인되면 원래 실내 카드(승인 하나)로 돌아온다",
  ],
  check: ["실제 경유지 콜백(7~9초) 동안 실내 카드가 접힌 채인가", "'이곳 말고'로 후보가 없어지면 실내 카드가 펼쳐지는가"],
  tag: "근거: 화면 [폰 · 시연 데이터] · CopilotScreens.kt PrepareCard(deferCabin)",
});
screen({
  section: "2차 변경", title: "변경 전/후 ③ — 후보 탭 삭제",
  shots: [["v1-08-tab-stops", "변경 전 · 후보 탭(픽업은 비어 있음)"], ["07-tab-energy", "변경 후 · 탭 줄에 후보 없음"]],
  summary: [
    "후보 탭은 쉼표 DRIVE 시절 점수 목록 — 픽업(왕복 12km)에서는 비고, 장거리에서는 결정 카드와 같은 내용",
    "충전 대안은 결정 카드의 '다른 후보 비교 ▼'(후보마다 '추천과 다른 점')",
    "에너지 화면의 '후보 보기'는 '충전 판단 보기'(홈)로",
    "탭: 홈 · 자세히 · 출발 준비 · 에너지 · 하차 · 기록 · 프로필 — 리뷰의 '지금 이동 / 기록 / 설정' 3구조는 11/15 뒤",
  ],
  check: ["에너지 탭 '충전 판단 보기'가 홈 결정 카드로 가는가", "휴식 계획 제안이 홈으로 가는가"],
  tag: "근거: Tab enum · 화면 [폰 · 시연 데이터]",
});

// ── 7. 시작 ─────────────────────────────────────────
pres.addSection({ title: "시작" });
screen({
  section: "시작", title: "첫 화면 — 어떤 이동을 준비할까요?",
  shots: [["01-choose-first", "처음 실행"], ["24c-choose-mom", "엄마 선택 · 기록 없음"], ["25-choose-others", "다른 이동 고르기 ›"]],
  summary: [
    "질문 하나: '어떤 이동을 준비할까요?' — 운전자 칩이 맨 위, 이동 버튼은 '이름 · 목적지'",
    "운전자를 고르면 그 사람의 지난 이동만 큰 버튼으로(슬라이드 4)",
    "운전자·동승자는 추정하지 않는다 — 안 고르면 운전석은 차량 설정 그대로",
  ],
  check: ["세로 창(840dp)에서 이동 버튼 5개가 잘리지 않는가", "'프로필 없이 시작'이 운전자 선택도 풀고 기록을 남기지 않는가"],
  tag: "근거: 화면 [폰 · 시연 데이터]",
});

// ── 8~11. 출발 준비 ────────────────────────────────────
pres.addSection({ title: "출발 준비" });
screen({
  section: "출발 준비", title: "출발 준비 — 다른 것만, 승인 하나",
  shots: [["02-prepare", "취향 vs 지금 차량 설정"], ["03-prepare-applied", "적용 뒤 · 항목마다 결과"]],
  summary: [
    "Mission 머리줄: 픽업 후 귀가 · 귀가 일정 기억 · 도착 후 대기 20분(저장된 계획)",
    "아빠를 고르면 운전석 취향(통풍시트)까지 비교 — 다른 것 2개만, 승인 하나",
    "결과는 항목마다(공조 · 통풍시트). 폰은 모의라 '적용(모의)'",
  ],
  check: ["공조 set 뒤 콜백·재조회로 '적용 확인'이 뜨는가(모의 표시 없이)", "일부만 성공하면 항목별로 성공/실패가 갈리는가(2차 리뷰 테스트 목록)", "Virtual Console 공조 값이 같이 바뀌는가"],
  tag: "근거: 공조·시트 set → 콜백 재조회는 E14·E27 [에뮬] 기록 있음",
});
screen({
  section: "출발 준비", title: "자세히 — 근거는 펼쳐서",
  shots: [["04-detail", "값의 출처"], ["05-detail-diag", "판단 진단 펼침"]],
  summary: [
    "값의 출처: 값마다 어디서·언제 받은 값인지(폰은 전부 시연 데이터 · 08:00 = 시연 시계)",
    "검토·앞에 띄움 집계와 제안 규칙은 '판단 진단'으로 접었다 — 운전자 할 일이 아니라서",
  ],
  check: ["배터리 줄이 '차량 정보 · 실제 시각'으로 바뀌는가", "시연 시계(08:00)와 상단 시계 혼재 — 11/15 뒤 과제"],
  tag: "근거: 화면 [폰 · 시연 데이터]",
});
screen({
  section: "출발 준비", title: "출발 준비 · 에너지 탭",
  shots: [["06-tab-prepare", "출발 준비 탭"], ["07-tab-energy", "에너지 탭"]],
  summary: [
    "출발 준비 탭: 공조·충전 계획을 항목별 상태로(확인 완료 · 확인 필요)",
    "에너지 탭: 귀가 후 예상 잔량 · 최소 잔량 · 범위 막대 · '어떻게 계산했나 · 전부 가정값'",
    "대기 방식(차를 두고 다녀옴 / 차 안에서 기다림)이 계산을 바꾼다 — 사용자가 알려 주는 사실",
  ],
  check: ["'지금 배터리'가 차량 정보로, 콘솔 SOC 를 바꾸면 재판단(E27-14)", "가정값 펼침에 '제조사 공식 주행가능거리가 아닙니다'"],
  tag: "근거: 에너지 추정은 가정값 기반 [추정] · 배터리 값만 [에뮬]",
});
screen({
  section: "출발 준비", title: "기록 · 프로필 탭",
  shots: [["09-tab-history", "기록"], ["10-tab-profile", "프로필"]],
  summary: [
    "기록: 이 프로필의 이동 기록만 · 위치 이력 없음",
    "프로필: 정차 중에만 편집 · 동승자는 수동 설정 · '하차 체크리스트 전부 확인해야 완료' 스위치",
  ],
  check: ["주행 중에 탭이 숨는가(DO · 한 줄 화면)", "체크리스트 필수 스위치 — 2차 리뷰가 재검토 요청(11/15 뒤)"],
  tag: "근거: 화면 [폰 · 시연 데이터]",
});
pres.addSection({ title: "개발용" });
screen({
  section: "개발용", title: "개발용 조작판 — 운전자 화면이 아니다",
  shots: [["11-dev-panel", "개발용 조작판"]],
  summary: [
    "차량·내비가 넣어 줄 값을 사람이 대신 넣는 자리: 주행·도착·주차, 충전 데이터, 주행 제한, 연결 끊김, 동력원, 배터리·대기 변경, Mission 복원",
    "정책: Automotive 기기의 release 빌드에서는 '개발용' 버튼을 그리지 않는다(폰·디버그 빌드에서만)",
    "2차 리뷰: 버튼 숨김과 모의 주입 차단은 별개 검증 — 주입 코드는 release 에 남아 있다(빌드 변형 분리 11/15 뒤)",
  ],
  check: ["release APK 를 에뮬레이터에 깔았을 때 '개발용' 버튼이 보이는가 — 보이면 FEATURE_AUTOMOTIVE 판별부터", "모의 주행이 필요하면 debug 빌드로 점검"],
  tag: "근거: 코드 CopilotScreens.kt Header — !automotive || debuggable 일 때만 표시",
});

// ── 13. 주행 ──────────────────────────────────────────
pres.addSection({ title: "주행" });
screen({
  section: "주행", title: "주행 중 — 한 줄 상태와 음성만",
  shots: [["12-driving", "픽업 가는 길"], ["30-family-driving", "장거리 · 충전 계획 필요"]],
  summary: [
    "주행 중에는 탭·버튼·비교가 없다. 한 줄 상태 + '설정·비교는 정차 후에'",
    "문제가 없으면 작게, 확인할 것이 있으면 짧게(충전 계획이 필요해요 · 정차한 뒤 선택지)",
    "음성은 확인할 것이 있을 때만",
  ],
  check: ["에뮬레이터는 속도 신호가 없어 모의 주행으로만 진입(E22)", "음성 안내(TTS ON_DEVICE)가 같은 문장을 반복하지 않는가"],
  tag: "근거: 한 줄 화면 [폰 · 모의 주행] · 실제 UX 제한 신호는 실차 필요",
});

// ── 14~18. 도착·대기·귀가·하차 ─────────────────────────
pres.addSection({ title: "도착·귀가" });
screen({
  section: "도착·귀가", title: "학원 도착 — P 만으로 도착이라 하지 않는다",
  shots: [["13-driving-near", "목적지 3km 앞"], ["14-arrive-stop", "중간 목적지 도착"]],
  summary: [
    "도착 판정: P(또는 주차 브레이크+정지) 그리고 남은 거리 0.5km 안. 남은 거리를 모르면 '중간 정차'(2차 리뷰 — 테스트 고정)",
    "귀가가 남은 이동이면 '학원에 도착했어요 · 귀가 일정은 그대로 기억합니다'",
    "주요 행동 2개: 기다리기 시작(기본) · 내리기 전 확인. '여정 일찍 끝내기'는 작은 링크",
  ],
  check: ["주행 도중 임의 P → '중간 정차'로 남고 도착 카드가 안 뜨는가", "남은 거리는 에뮬레이터에서도 모의 주행 거리 — 배지 '시연 데이터'"],
  tag: "근거: Journey.next · AssistantTest / assistant.test (TS·Kotlin)",
});
screen({
  section: "도착·귀가", title: "대기 — 방문을 마치셨나요? (한 번만)",
  shots: [["15-waiting", "대기 + 귀가 확인 제안"], ["16-nextleg-ready", "귀가 일정 확인 뒤"]],
  summary: [
    "대기 카드: 지난 시간 · 귀가 거리 · 에너지 한 줄 · 대기 방식 선택",
    "귀가 확인 설명은 '집으로 안내 시작'을 가리킨다. 확인 뒤 머리줄: 귀가 확인 · 경로 요청 전",
    "2차 리뷰: 건너뛰면 10분 뒤 다시 묻는 규칙 → '계속 기다리기'면 대기 예정 시간까지 묻지 않기(11/15 뒤)",
  ],
  check: ["'귀가 일정 확인'이 내비 경로를 바꾸지 않는가", "건너뛰기 후 재질문 간격 — 지금은 10분"],
  tag: "근거: Mission 규칙 TS·Kotlin 테스트 · 화면 [폰 · 시연 데이터]",
});
screen({
  section: "도착·귀가", title: "집으로 안내 — 확인될 때까지 '됐다'고 말하지 않는다",
  shots: [["17-route-home", "요청 → 재조회 확인(모의)"], ["18-end-confirm", "여정 일찍 끝내기 → 확인"]],
  summary: [
    "요청 → 목적지 다시 읽기 → 저장된 집과 poiId 일치 또는 100m 안이면 '확인됨'. 응답이 없으면 '설정됐는지 모릅니다'",
    "실제 내비면 '내비에 저장된 집: …'을 붙인다(시연 집 이름이면 생략)",
    "내비가 실패해도 귀가 확인(Mission)은 남는다 — 경로 상태와 따로",
  ],
  check: ["requestRoute → onRouteStarted → 목적지 재조회 → '내비가 확인함 · 내비에 저장된 집: …'", "안내 중 경로가 있을 때 교체 확인이 먼저(E27 Q9)", "집 미등록이면 보내지 않고 안내(HOME (0,0))"],
  tag: "근거: requestRoute HOME [에뮬] 2026-11-03 · 이번 캡처는 폰 모의",
});
screen({
  section: "도착·귀가", title: "잠시 내리기 · 대기로 돌아오기",
  shots: [["19-finish-stopover", "중간 하차 체크리스트"], ["20-wait-after-finish", "확인 뒤 대기"]],
  summary: [
    "체크리스트는 사용자의 확인 기록 — 차 안이 비었다는 판정이 아니다",
    "도어 상태는 읽을 수 있을 때만, '차량 안을 대신 확인한 것이 아닙니다'",
    "확인을 마치면 대기로 돌아오고 귀가 경로 상태는 유지",
  ],
  check: ["도어 위치·잠금이 실제 값으로(콘솔 도어 카드)", "중간 하차에서 체크를 다 안 해도 돌아갈 수 있어야 하는가 — 2차 리뷰 검토 항목"],
  tag: "근거: 도어 조회 [에뮬] 기록 · 체크리스트는 사용자 입력",
});
screen({
  section: "도착·귀가", title: "귀가 도착 → 하차 → 이동 마침",
  shots: [["21-arrive-home", "마지막 목적지 도착"], ["22-finish-final", "하차 준비 0/5"], ["23-completed", "5/5 · 이동 마침"]],
  summary: [
    "마지막 구간에서는 '하차 준비를 시작할까요?'가 맞는 질문",
    "지금은 5개 모두 체크해야 마친다(프로필 스위치) — 2차 리뷰: 필수 확인 / 선택 점검으로 나누기(11/15 뒤)",
    "완료 뒤 '새 이동 준비' — 다음 실행 때 같은 운전자를 고르면 '지난번처럼'",
  ],
  check: ["완료 뒤 앱을 다시 켜면 Mission 이 복원되지 않는가", "기록 탭에 이번 이동이 남는가"],
  tag: "근거: 화면 [폰 · 시연 데이터]",
});

// ── 19~21. 가족 장거리 ────────────────────────────────
pres.addSection({ title: "장거리 충전" });
screen({
  section: "장거리 충전", title: "가족 장거리 — 이번 여정의 결정",
  shots: [["26-family-decision", "결정 카드 + 접힌 실내 카드"], ["27-decision-evidence", "근거 자세히 펼침"]],
  summary: [
    "왜 충전이 필요한가: 지금 배터리 68% - 남은 주행 82~105% - 도착 후 대기 2% - 최소 잔량 20% → 약 47%p 부족 · 추정",
    "왜 이곳인가: 순위를 처음 가른 기준 하나 — '충전 후 목적지까지 여유가 금강휴게소보다 커요'",
    "충전기: '빈 충전기 2기 표시 · 조회 시각 · 현장 대기 인원은 알 수 없어요'",
    "도달 불가·커넥터 불일치·정보 부족 후보는 '확인 필요'로 빠진다 — 같은 기준으로 권하지 않음",
  ],
  check: ["프록시 '실제 프록시'로 — 조회 시각이 실제 시각", "배터리가 차량 정보일 때 예산 줄 첫 값이 콘솔 SOC 와 같은가", "콘솔 SOC 40% → '판단이 바뀌었어요 · …'(E27-14)"],
  tag: "근거: 공공 충전소 [실 API]는 프록시를 켤 때만 · 이 캡처는 시연 충전 데이터",
});
screen({
  section: "장거리 충전", title: "다른 후보 비교 · 경유지로 추가",
  shots: [["28-decision-alts", "다른 후보 1곳 비교"], ["29-waypoint-result", "경유지 추가(모의) 뒤"], ["29b-cabin-back", "그 아래 실내 카드 복귀"]],
  summary: [
    "다른 후보는 펼침. 후보마다 '추천과 다른 점' 한 줄",
    "승인 전에는 내비를 바꾸지 않는다. 경유지 칸이 차면 지우지 않고 어느 칸을 바꿀지 묻는다",
    "추가 뒤 '지금 내비 경유지: 황간휴게소' — 그다음 실내 설정 승인(한 번에 하나)",
  ],
  check: ["addWaypoint → onWaypointChanged(ADD) 7~9초 → 목록 재조회 '내비가 확인함'", "경유지 2개가 찬 상태에서 교체 질문", "'이곳 말고' 뒤 다음 후보의 이유 한 줄(3단 이유는 11/15 뒤)"],
  tag: "근거: 경유지 ADD 콜백 [에뮬] E27 · 이 캡처는 모의 내비",
});
{
  const s = pres.addSlide({ masterName: "SCREEN", sectionTitle: "장거리 충전" });
  s.addText("가로 창 — 오른쪽 열은 근거만", { placeholder: "title" });
  T(s, "장거리 충전", { x: 11.2, y: 0.38, w: 1.65, h: 0.4, fontSize: 10, color: C.accent3, align: "right", bold: true });
  s.addImage({ path: IMG + "31-landscape.jpg", x: 0.5, y: 1.05, w: 8.4, h: 8.4 * 570 / 1272, altText: "가로 화면", objectName: "shot-landscape" });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.05, w: 8.4, h: 8.4 * 570 / 1272, fill: { type: "none" }, line: { color: "C9D2DB", width: 0.75 }, objectName: "frame-landscape" });
  T(s, "폰을 가로로 돌린 화면 — Pleos 가로 앱 창과 비율이 같지는 않다", { x: 0.5, y: 4.9, w: 8.4, h: 0.3, fontSize: 9.5, color: C.text2, align: "center" });
  T(s, "요약", { x: 9.25, y: 1.05, w: 3.6, h: 0.3, fontSize: 12, bold: true, color: C.accent1 });
  T(s, bullets([
    "Pleos: 세로가 기본, 가로는 확장 정보 자리",
    "왼쪽 = 홈(결정 카드), 오른쪽 = 왜 이 제안인가(근거) · 값의 출처",
    "오른쪽이 제목·설명을 되풀이하지 않는다",
  ]), { x: 9.25, y: 1.4, w: 3.6, h: 2.2, fontSize: 11.5 });
  box(s, 9.13, 3.75, 3.84, 2.75, HEX.lt1, "check-card");
  T(s, "에뮬레이터에서 볼 것", { x: 9.25, y: 3.87, w: 3.6, h: 0.3, fontSize: 11.5, bold: true, color: C.accent3 });
  T(s, [
    { text: "☐  두 창 배치에서 세로 창으로 뜨는가(E27 Q14)", options: { breakLine: true, paraSpaceAfter: 5 } },
    { text: "☐  실제 창 크기·스크롤·터치 영역(2차 리뷰)", options: { breakLine: true, paraSpaceAfter: 5 } },
    { text: "☐  제목 'MY CO-PILOT'이 꺾이지 않는가" },
  ], { x: 9.25, y: 4.22, w: 3.6, h: 2.2, fontSize: 10.5 });
  T(s, "근거: 화면 [폰 · 시연 데이터]", { x: 9.25, y: 6.62, w: 3.6, h: 0.3, fontSize: 9, color: C.accent6, italic: true });
}

// ── 22~23. 점검표 · 남은 것 ───────────────────────────
pres.addSection({ title: "점검" });
{
  const s = pres.addSlide({ masterName: "SCREEN", sectionTitle: "점검" });
  s.addText("에뮬레이터 점검 순서 — 메모리 여유 4GB 확인 뒤", { placeholder: "title" });
  const H = (t) => ({ text: t, options: { bold: true, color: HEX.lt1, fill: { color: HEX.dk1 }, fontSize: 11 } });
  const rows = [
    [H("#"), H("할 일"), H("확인할 것"), H("슬라이드")],
    ["1", "에뮬레이터 부팅(약 104초) · 콘솔 8088", "Chrome·VS Code 줄이기, Gradle 데몬 중지", "—"],
    ["2", "충전소 프록시 --demo → adb reverse 8787", "켜질 때 미리 받기 · 4분마다 상태 갱신", "19"],
    ["3", "새 APK 설치(pm clear --user 10)", "android/copilot/build/outputs/apk/release/copilot-release.apk — apk/ 제출본과 다름", "—"],
    ["4", "운전자 없이 첫 화면 → 아빠 선택 → 아이 픽업", "'지난번처럼' 운전자별 · 공조 set 재조회", "4 · 7 · 8"],
    ["5", "모의 주행 → 중간 임의 P → 학원 도착 → 기다리기", "임의 P 는 중간 정차 · 도착 버튼 2개", "14 · 15"],
    ["6", "귀가 확인 → 집으로 안내 시작", "'내비가 확인함 · 내비에 저장된 집'", "16"],
    ["7", "가족 이동 → 결정 카드 → 경유지로 추가", "실내 카드 접힘 → 확인 뒤 복귀 · 경유지 재조회", "5 · 19 · 20"],
    ["8", "앱 재시작 → 엄마 선택 · SOC 40% · 두 창 배치", "지난번처럼 없음 · 재판단 · 세로 창", "4 · 19 · 21"],
  ];
  const body = rows.map((r, i) => i === 0 ? r : r.map((c) => ({ text: c, options: { fontSize: 10.5, color: HEX.dk1, fill: { color: i % 2 ? "FFFFFF" : "F6F8FA" } } })));
  s.addTable(body, { x: 0.5, y: 1.1, w: 12.3, colW: [0.45, 4.3, 6.05, 1.5], border: { type: "solid", pt: 0.5, color: "D5DCE3" }, rowH: 0.52, valign: "middle", margin: 0.06, objectName: "checklist" });
  T(s, "준비 명령은 docs/my-copilot/v7/EMULATOR-QUEUE.md '0. 시작 전 준비'. 결과는 E28 문서로 남기고 캡처를 docs/android/emulator 에.", { x: 0.5, y: 6.55, w: 12.3, h: 0.35, fontSize: 10.5, color: C.text2 });
}
{
  const s = pres.addSlide({ masterName: "SCREEN", sectionTitle: "점검" });
  s.addText("2차에서 확인한 것 · 아직 남은 것", { placeholder: "title" });
  box(s, 0.5, 1.1, 6.05, 5.5, HEX.lt1, "found");
  T(s, "이번에 고치고 확인한 것 (커밋 e38f216)", { x: 0.7, y: 1.25, w: 5.7, h: 0.35, fontSize: 13, bold: true, color: C.accent1 });
  T(s, bullets([
    "'지난번처럼' 운전자별 저장 — 다른 운전자·게스트에게 앞 사람 이동 노출을 막음",
    "후보 탭 삭제 — 충전 대안은 결정 카드 펼침으로",
    "충전 경유지 결정 전에는 실내 승인 카드를 한 줄로 — 한 화면에 주 행동 하나",
    "P + 남은 거리 모름 = 중간 정차 테스트 고정(이미 지키던 규칙)",
    "테스트: TS 212 · Kotlin 263 · release 빌드 · 폰 34장 재촬영",
  ]), { x: 0.7, y: 1.7, w: 5.7, h: 4.7, fontSize: 12, color: C.text1 });
  box(s, 6.8, 1.1, 6.05, 5.5, HEX.lt1, "left");
  T(s, "아직 남은 것", { x: 7.0, y: 1.25, w: 5.7, h: 0.35, fontSize: 13, bold: true, color: C.accent2 });
  T(s, bullets([
    "에뮬레이터 재확인 전 — 이 덱은 전부 폰 모의(슬라이드 22 순서)",
    "제출 브랜치(copilot-submit)에 넣을지 결정 — 영상 v1 은 옛 화면",
    "11/15 뒤: 대기 재질문 정책 · 체크리스트 필수/선택 · 귀가 Mission 6단계 · 추천 이유 3단",
    "11/15 뒤: release 모의 주입 차단 · 시계 분리 · 실패 문구 두 층 · 조작 수 측정",
    "다음 개편 기준: 기능별 탭이 아니라 '지금 이동 목표 + 다음 행동 하나' — ARRIVE READY 는 탭이 아니라 카드로",
  ]), { x: 7.0, y: 1.7, w: 5.7, h: 4.7, fontSize: 12, color: C.text1 });
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("ok", OUT);
})();
