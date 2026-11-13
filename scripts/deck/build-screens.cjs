// MY CO-PILOT 전체 화면 점검 덱 — 폰 캡처 31장 + 화면별 요약 · 에뮬레이터에서 볼 것
const pptxgen = require("pptxgenjs");
const { applyTheme } = require(process.env.PPTX_SKILL + "/scripts/apply_theme.js");
const OUT = process.argv[2] || "screens.pptx";
const IMG = __dirname + "/svc/";

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
    { text: { text: "MY CO-PILOT · 전체 화면 점검 · 2026-11-11", options: { x: 0.5, y: 7.1, w: 6, h: 0.28, fontSize: 9, color: C.accent6 } } },
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
  s.addText("MY CO-PILOT 전체 화면 점검", { placeholder: "title" });
  s.addText([
    { text: "앱 화면 31장을 흐름 순서대로 — 화면마다 요약과 에뮬레이터에서 볼 것", options: { breakLine: true } },
    { text: "빌드: 브랜치 ux-review-2026-11-11 (커밋 2e5d4e7) · demo v1 리뷰 반영본", options: { breakLine: true, fontSize: 14, color: C.accent4 } },
    { text: "촬영: 연결된 폰(SM-G991N)의 모의 데이터 모드 — Pleos 에뮬레이터 화면이 아니다", options: { fontSize: 14, color: C.accent5 } },
  ], { placeholder: "body" });
}

// ── 2. 흐름 지도 ──────────────────────────────────────
{
  const s = pres.addSlide({ masterName: "SCREEN", sectionTitle: "개요" });
  s.addText("한눈에 — 두 시나리오, 여섯 단계", { placeholder: "title" });
  const steps = [
    ["시작", "어떤 이동을 준비할까요?\n지난번처럼 원탭", "3"],
    ["출발 준비", "취향 vs 차량 설정\n다른 것만 승인 하나", "4~7"],
    ["주행 중", "한 줄 + 음성만\n비교·설정 없음", "9"],
    ["도착·대기", "기다리기가 기본\n귀가 일정 기억", "10~11"],
    ["귀가", "집으로 안내 시작\n목적지 재조회 확인", "12~13"],
    ["하차·완료", "체크리스트\n이동 마침", "14"],
  ];
  const w = 1.95, gap = 0.12;
  steps.forEach(([h, d, pg], i) => {
    const x = 0.5 + i * (w + gap);
    box(s, x, 1.25, w, 1.95, i === 3 || i === 4 ? HEX.accent1 : HEX.lt1, "step-" + i);
    const dark = i === 3 || i === 4;
    T(s, h, { x: x + 0.15, y: 1.38, w: w - 0.3, h: 0.4, fontSize: 15, bold: true, color: dark ? C.background1 : C.text1 });
    T(s, d, { x: x + 0.15, y: 1.85, w: w - 0.3, h: 0.85, fontSize: 11, color: dark ? C.background1 : C.text2 });
    T(s, "슬라이드 " + pg, { x: x + 0.15, y: 2.82, w: w - 0.3, h: 0.28, fontSize: 9, color: dark ? C.background1 : C.accent6 });
  });
  T(s, "시나리오 1 — 아이 픽업 후 귀가 (모든 동력원 · V5 Mission)  ·  시나리오 2 — 가족 장거리 서울→부산 (EV 특화 · V6 충전 판단, 슬라이드 15~17)", { x: 0.5, y: 3.4, w: 12.3, h: 0.35, fontSize: 12, bold: true, color: C.accent3 });
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

// ── 3~4. 시작 ─────────────────────────────────────────
pres.addSection({ title: "시작" });
screen({
  section: "시작", title: "첫 화면 — 어떤 이동을 준비할까요?",
  shots: [["01-choose-first", "처음 실행"], ["24-choose-last", "두 번째부터 · 지난번처럼"], ["25-choose-others", "다른 이동 고르기 ›"]],
  summary: [
    "운전자·탑승 조합·목적을 한 화면에 섞던 질문을 '이동' 하나로",
    "이동 버튼은 '이름 · 목적지' — 예: 아이 픽업 후 귀가 · 학원",
    "두 번째부터는 큰 버튼 하나(지난번 이동·운전자). 나머지는 펼쳐야 보인다",
    "운전자·동승자는 추정하지 않는다 — 안 고르면 운전석은 차량 설정 그대로",
  ],
  check: ["앱을 끄고 다시 켜도 '지난번처럼'이 남는가(이번에 저장 추가)", "세로 창(840dp)에서 이동 버튼 5개가 잘리지 않는가", "'프로필 없이 시작'이 기록을 남기지 않는가"],
  tag: "근거: 화면 배치 [폰 · 시연 데이터] · 마지막 선택 저장은 SharedPreferences(이 기기에만)",
});

// ── 5~8. 출발 준비 ────────────────────────────────────
pres.addSection({ title: "출발 준비" });
screen({
  section: "출발 준비", title: "출발 준비 — 다른 것만, 승인 하나",
  shots: [["02-prepare", "취향 vs 지금 차량 설정"], ["03-prepare-applied", "적용 뒤 · 다시 읽어 확인"]],
  summary: [
    "Mission 머리줄: 픽업 후 귀가 · 귀가 일정 기억 · 도착 후 대기 20분(저장된 계획)",
    "저장된 취향과 지금 차량 값을 비교해 다른 것만 보인다(공조 25→23°C). 음악은 기억만, 자동 재생 없음",
    "'1개 한 번에 적용' → 결과는 항목마다. 폰은 모의라 '적용(모의)'",
    "에너지 한 줄: 충전 없이 충분합니다(추정)",
  ],
  check: ["공조 set 뒤 콜백·재조회로 '적용 확인'이 뜨는가(모의 표시 없이)", "Virtual Console 공조 값이 같이 바뀌는가", "배지에 '공조·시트·도어 차량 정보'"],
  tag: "근거: 공조·시트 set → 콜백 재조회는 E14·E27 [에뮬] 기록 있음",
});
screen({
  section: "출발 준비", title: "자세히 — 근거는 펼쳐서",
  shots: [["04-detail", "값의 출처"], ["05-detail-diag", "판단 진단 펼침"]],
  summary: [
    "제안이 있으면 '지금 제안' + 근거(차량 정보·직접 설정·추정·판단 규칙)를 따로 표시",
    "값의 출처: 값마다 어디서·언제 받은 값인지(폰은 전부 시연 데이터 · 08:00 = 시연 시계)",
    "검토·앞에 띄움 집계와 제안 규칙은 '판단 진단'으로 접었다 — 운전자 할 일이 아니라서",
  ],
  check: ["배터리 줄이 '차량 정보 · 실제 시각'으로 바뀌는가", "시연 시계(08:00)와 상단 시계가 다른 게 남아 있는가 — 리뷰 ④, 11/15 뒤 과제", "공조 '모름 · 조회 실패' 같은 기술 문구가 보이는 조건"],
  tag: "근거: 화면 [폰 · 시연 데이터] — 시각 혼재는 미해결로 기록(UX-REVIEW 문서)",
});
screen({
  section: "출발 준비", title: "출발 준비 · 에너지 탭",
  shots: [["06-tab-prepare", "출발 준비 탭"], ["07-tab-energy", "에너지 탭"]],
  summary: [
    "출발 준비 탭: 공조·준비물·충전 계획을 항목별 상태로(확인 완료 · 확인 필요 · 건너뜀)",
    "에너지 탭: 귀가 후 예상 잔량 62% · 최소 잔량 15% · 범위 막대 · '어떻게 계산했나 · 전부 가정값'",
    "대기 방식(차를 두고 다녀옴 / 차 안에서 기다림)이 계산을 바꾼다 — 사용자가 알려 주는 사실",
  ],
  check: ["'지금 배터리'가 차량 정보로, 콘솔 SOC 를 바꾸면 재판단(E27-14 기록)", "가정값 펼침에 '제조사 공식 주행가능거리가 아닙니다'"],
  tag: "근거: 에너지 추정은 가정값 기반 [추정] · 배터리 값만 [에뮬]",
});
screen({
  section: "출발 준비", title: "후보 · 기록 · 프로필 탭",
  shots: [["08-tab-stops", "후보 (픽업은 비어 있음)"], ["09-tab-history", "기록"], ["10-tab-profile", "프로필"]],
  summary: [
    "후보 탭: 픽업(왕복 12km)은 충전이 필요 없어 비어 있다. 이 탭은 쉼표 DRIVE 점수식 목록 — V6 결정 카드와 겹친다(정리 후보)",
    "기록: 이 프로필의 이동 기록만 · 위치 이력 없음",
    "프로필: 정차 중에만 편집 · 동승자는 수동 설정",
  ],
  check: ["주행 중에 탭이 숨는가(DO · 한 줄 화면)", "후보 탭을 남길지 — 결정 카드와 중복(오너 판단)"],
  tag: "근거: 화면 [폰 · 시연 데이터]",
});
pres.addSection({ title: "개발용" });
screen({
  section: "개발용", title: "개발용 조작판 — 운전자 화면이 아니다",
  shots: [["11-dev-panel", "개발용 조작판"]],
  summary: [
    "차량·내비가 넣어 줄 값을 사람이 대신 넣는 자리: 주행·도착·주차, 충전 데이터(실제 프록시/시연), 주행 제한, 연결 끊김, 동력원, 시트·조명, 배터리·대기 변경, Mission 복원",
    "정책: Automotive 기기의 release 빌드에서는 '개발용' 버튼을 그리지 않는다(폰·디버그 빌드에서만)",
    "남은 일: 버튼만 숨기고 모의 주입 코드는 release 에 남아 있다 → 빌드 변형 분리는 11/15 뒤",
  ],
  check: ["release APK 를 에뮬레이터에 깔았을 때 '개발용' 버튼이 보이는가 — 보이면 FEATURE_AUTOMOTIVE 판별부터 확인", "모의 주행이 필요하면 debug 빌드로 점검", "'실제 주행 신호 → 모의(개발용)' 칩이 에뮬레이터에서만 나오는가"],
  tag: "근거: 코드 CopilotScreens.kt Header — !automotive || debuggable 일 때만 표시",
});

// ── 10. 주행 ──────────────────────────────────────────
pres.addSection({ title: "주행" });
screen({
  section: "주행", title: "주행 중 — 한 줄 상태와 음성만",
  shots: [["12-driving", "픽업 가는 길"], ["30-family-driving", "장거리 · 충전 계획 필요"]],
  summary: [
    "주행 중에는 탭·버튼·비교가 없다. 한 줄 상태 + '설정·비교는 정차 후에'",
    "문제가 없으면 작게(귀가까지 에너지 문제 없음 · 추정), 확인할 것이 있으면 짧게(충전 계획이 필요해요 · 정차한 뒤 선택지)",
    "장거리에서 충전 후보 이름은 한 줄로만: 충전·휴식 후보 황간휴게소 · 정차 후 확인",
  ],
  check: ["에뮬레이터는 속도 신호가 없어 모의 주행으로만 진입(E22)", "주행 제한 콘솔 카드가 없다 — Q12, 재현 불가로 기록됨", "음성 안내(TTS ON_DEVICE)가 확인할 것이 있을 때만 나오는가"],
  tag: "근거: 한 줄 화면 [폰 · 모의 주행] · 실제 UX 제한 신호는 실차 필요",
});

// ── 11~15. 도착·대기·귀가·하차 ─────────────────────────
pres.addSection({ title: "도착·귀가" });
screen({
  section: "도착·귀가", title: "학원 도착 — 기다리기가 기본",
  shots: [["14-arrive-stop", "중간 목적지 도착"]],
  summary: [
    "P 에 섰다고 '내린다'고 가정하지 않는다. 귀가가 남은 이동이면 '학원에 도착했어요 · 귀가 일정은 그대로 기억합니다'",
    "주요 행동 2개: 기다리기 시작(기본) · 내리기 전 확인(보조). '여정 일찍 끝내기'는 작은 링크",
    "이전 화면은 버튼 4개(하차 준비 시작 · 이번에는 건너뛰기 · 내리지 않고 기다리기 · 여정 끝내기)",
  ],
  check: ["기어 P 콜백 직후 이 카드로 바뀌는가(모의 주행 끄고 실제 기어)", "가로 창 오른쪽 열이 같은 문장을 되풀이하지 않는가"],
  tag: "근거: 화면 [폰 · 시연 데이터] — demo v1 리뷰 P1 반영",
});
screen({
  section: "도착·귀가", title: "대기 — 방문을 마치셨나요? (한 번만)",
  shots: [["15-waiting", "대기 + 귀가 확인 제안"], ["16-nextleg-ready", "귀가 일정 확인 뒤"]],
  summary: [
    "대기 카드: 지난 시간 · 귀가 거리 · 에너지 한 줄 · 대기 방식 선택",
    "귀가 확인을 한 번만 묻는다. 설명은 이제 '집으로 안내 시작'을 가리킨다(전에는 '직접 설정하라'면서 버튼을 보여 모순)",
    "확인 뒤 머리줄: 귀가 확인 · 경로 요청 전 — 경로는 아직 그대로",
  ],
  check: ["'귀가 일정 확인'이 내비 경로를 바꾸지 않는가(목적지 재조회로 그대로)", "건너뛰면 10분 뒤 다시 묻는가(시계 +10분)"],
  tag: "근거: Mission 규칙 TS·Kotlin 테스트 · 화면 [폰 · 시연 데이터]",
});
screen({
  section: "도착·귀가", title: "집으로 안내 — 확인될 때까지 '됐다'고 말하지 않는다",
  shots: [["17-route-home", "요청 → 재조회 확인(모의)"], ["18-end-confirm", "여정 일찍 끝내기 → 확인"]],
  summary: [
    "단계: 즐겨찾기·경로 확인 중 → 요청 → 목적지 다시 읽기 → 집과 같으면 '확인됨'. 응답이 없으면 '설정됐는지 모릅니다'",
    "기존 경로가 있으면 묻는다(집 경로로 바꾸기 / 기존 경로 유지)",
    "실제 내비면 '내비에 저장된 집: 강남역 2호선'을 붙인다 — 영상의 '집이라더니 강남역?' 해소",
    "조기 종료는 한 번 더 묻는다: 귀가 일정까지 함께 끝납니다",
  ],
  check: ["requestRoute → onRouteStarted → 목적지 재조회 → '내비가 확인함 · 내비에 저장된 집: …'", "안내 중 경로가 있을 때 교체 확인이 먼저 뜨는가(E27 Q9)", "집 미등록이면 보내지 않고 안내(HOME (0,0))"],
  tag: "근거: requestRoute HOME [에뮬] 2026-11-03 · 이번 문구는 폰 모의 — 에뮬 재확인 필요",
});
screen({
  section: "도착·귀가", title: "잠시 내리기 · 대기로 돌아오기",
  shots: [["19-finish-stopover", "중간 하차 체크리스트"], ["20-wait-after-finish", "확인 뒤 대기 · 경로 확인됨(모의)"]],
  summary: [
    "중간 하차: '귀가가 남아 있습니다' — 체크리스트는 사용자의 확인 기록이지 차 안이 비었다는 판정이 아니다",
    "도어 상태는 읽을 수 있을 때만, '차량 안을 대신 확인한 것이 아닙니다'",
    "확인을 마치면 대기로 돌아오고 귀가 경로 상태는 유지",
  ],
  check: ["도어 위치·잠금이 실제 값으로(콘솔 도어 카드) — 잠금은 4문 합친 영역(E-2차)", "체크 전부 해야 마칠 수 있는 설정이 지켜지는가"],
  tag: "근거: 도어 조회 [에뮬] 기록 · 체크리스트는 사용자 입력",
});
screen({
  section: "도착·귀가", title: "귀가 도착 → 하차 → 이동 마침",
  shots: [["21-arrive-home", "마지막 목적지 도착"], ["22-finish-final", "하차 준비"], ["23-completed", "5/5 · 이동 마침"]],
  summary: [
    "마지막 구간에서는 '하차 준비를 시작할까요?'가 맞는 질문 — 이번엔 귀가가 남지 않았다",
    "체크리스트 5개 확인 → 이동 마치기 → '새 이동 준비'",
    "다음 실행 때 첫 화면에 '지난번처럼 · 아이 픽업 후 귀가'(슬라이드 3)",
  ],
  check: ["완료 뒤 앱을 다시 켜면 Mission 이 복원되지 않는가(완료는 복원 대상 아님)", "기록 탭에 이번 이동이 남는가"],
  tag: "근거: 화면 [폰 · 시연 데이터]",
});

// ── 16~18. 가족 장거리 ────────────────────────────────
pres.addSection({ title: "장거리 충전" });
screen({
  section: "장거리 충전", title: "가족 장거리 — 이번 여정의 결정",
  shots: [["26-family-decision", "결정 카드 기본"], ["27-decision-evidence", "근거 자세히 펼침"]],
  summary: [
    "왜 충전이 필요한가: 지금 배터리 68% - 남은 주행 82~105% - 도착 후 대기 2% - 최소 잔량 20% → 약 47%p 부족 · 추정 (판단 계산값 그대로)",
    "왜 이곳인가: 순위를 처음 가른 기준 하나 — '충전 후 목적지까지 여유가 금강휴게소보다 커요'",
    "충전기: '빈 충전기 2기 표시 · 조회 시각 · 현장 대기 인원은 알 수 없어요' ('9대 대기' 오해 해소)",
    "근거(시설 확인/미확인 · 우회 영향 · 출처 등급)는 펼침",
  ],
  check: ["프록시 '실제 프록시'로 — 조회 시각이 실제 시각, 근거 줄 '충전기 실 API'", "배터리가 차량 정보일 때 예산 줄 첫 값이 콘솔 SOC 와 같은가", "콘솔 SOC 40% → 판단이 바뀌면 '판단이 바뀌었어요 · …'(E27-14)"],
  tag: "근거: 공공 충전소 [실 API]는 프록시를 켤 때만 · 이 캡처는 시연 충전 데이터",
});
screen({
  section: "장거리 충전", title: "다른 후보 비교 · 경유지로 추가",
  shots: [["28-decision-alts", "다른 후보 1곳 비교"], ["29-waypoint-result", "경유지 추가(모의) 뒤"]],
  summary: [
    "다른 후보는 펼침. 후보마다 '추천과 다른 점'을 한 줄로",
    "승인 전에는 내비를 바꾸지 않는다. 경유지 칸이 차면 기존 것을 지우지 않고 어느 칸을 바꿀지 묻는다",
    "추가 뒤 '지금 내비 경유지: 황간휴게소' — 이미 있는 곳은 버튼 대신 '경유지에 있음'",
  ],
  check: ["addWaypoint → onWaypointChanged(ADD) 7~9초 → 목록 재조회 '내비가 확인함'", "경유지 2개가 찬 상태에서 교체 질문", "'이곳 말고' 뒤 다음 후보로 바뀌고 이유가 붙는가"],
  tag: "근거: 경유지 ADD 콜백 [에뮬] E27 · 이 캡처는 모의 내비",
});
{
  const s = pres.addSlide({ masterName: "SCREEN", sectionTitle: "장거리 충전" });
  s.addText("가로 창 — 오른쪽 열은 근거만", { placeholder: "title" });
  T(s, "장거리 충전", { x: 11.2, y: 0.38, w: 1.65, h: 0.4, fontSize: 10, color: C.accent3, align: "right", bold: true });
  s.addImage({ path: IMG + "31-landscape.jpg", x: 0.5, y: 1.05, w: 8.4, h: 8.4 * 570 / 1272, altText: "가로 화면", objectName: "shot-landscape" });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.05, w: 8.4, h: 8.4 * 570 / 1272, fill: { type: "none" }, line: { color: "C9D2DB", width: 0.75 }, objectName: "frame-landscape" });
  T(s, "폰을 가로로 돌린 화면 — Pleos 가로 앱 창(1700dp)과 비율이 같지는 않다", { x: 0.5, y: 4.9, w: 8.4, h: 0.3, fontSize: 9.5, color: C.text2, align: "center" });
  T(s, "요약", { x: 9.25, y: 1.05, w: 3.6, h: 0.3, fontSize: 12, bold: true, color: C.accent1 });
  T(s, bullets([
    "Pleos: 세로가 기본, 가로는 확장 정보 자리",
    "왼쪽 = 홈(결정 카드), 오른쪽 = 왜 이 제안인가(근거 등급) · 값의 출처",
    "전에는 오른쪽이 '지금 제안' 제목·설명을 한 번 더 썼다 → 근거만",
  ]), { x: 9.25, y: 1.4, w: 3.6, h: 2.2, fontSize: 11.5 });
  box(s, 9.13, 3.75, 3.84, 2.75, HEX.lt1, "check-card");
  T(s, "에뮬레이터에서 볼 것", { x: 9.25, y: 3.87, w: 3.6, h: 0.3, fontSize: 11.5, bold: true, color: C.accent3 });
  T(s, [
    { text: "☐  두 창 배치(왼쪽 Driving view + 오른쪽 앱)에서 세로 창으로 뜨는가(E27 Q14)", options: { breakLine: true, paraSpaceAfter: 5 } },
    { text: "☐  앱 창만 가로로 넓힐 때 오른쪽 열이 생기는가", options: { breakLine: true, paraSpaceAfter: 5 } },
    { text: "☐  제목 'MY CO-PILOT'이 꺾이지 않는가(D5 수정)" },
  ], { x: 9.25, y: 4.22, w: 3.6, h: 2.2, fontSize: 10.5 });
  T(s, "근거: 화면 [폰 · 시연 데이터]", { x: 9.25, y: 6.62, w: 3.6, h: 0.3, fontSize: 9, color: C.accent6, italic: true });
}

// ── 19~20. 점검표 · 한계 ───────────────────────────────
pres.addSection({ title: "점검" });
{
  const s = pres.addSlide({ masterName: "SCREEN", sectionTitle: "점검" });
  s.addText("에뮬레이터 점검 순서 — 메모리 여유 4GB 확인 뒤", { placeholder: "title" });
  const H = (t) => ({ text: t, options: { bold: true, color: HEX.lt1, fill: { color: HEX.dk1 }, fontSize: 11 } });
  const rows = [
    [H("#"), H("할 일"), H("확인할 것"), H("관련 슬라이드")],
    ["1", "에뮬레이터 부팅(약 104초) · 콘솔 8088 · 하트비트", "Chrome·VS Code 줄이기, Gradle 데몬 중지", "—"],
    ["2", "충전소 프록시 --demo → adb reverse 8787", "켜질 때 미리 받기 7초 · 4분마다 상태 갱신", "15"],
    ["3", "새 APK 설치(user 10, pm clear --user 10)", "android/copilot/build/outputs/apk/release/copilot-release.apk — apk/ 의 제출본과 다름", "3"],
    ["4", "첫 화면 → 아이 픽업 → 출발 준비 적용", "배지 '차량 정보' · 공조 set 재조회", "3 · 4"],
    ["5", "모의 주행 → 학원 도착 → 기다리기 → 귀가 확인", "버튼 2개 · 문구가 '집으로 안내 시작'을 가리키는지", "10 · 11"],
    ["6", "집으로 안내 시작", "'내비가 확인함 · 내비에 저장된 집: 강남역 2호선'", "12"],
    ["7", "가족 이동 → 결정 카드 → 경유지로 추가", "예산 줄 · 왜 이곳 · 빈 충전기 · 경유지 재조회", "15 · 16"],
    ["8", "콘솔 SOC 40% · 두 창 배치 · 앱 재시작", "재판단 · 세로 창 제목 · 지난번처럼", "15 · 17 · 3"],
  ];
  const body = rows.map((r, i) => i === 0 ? r : r.map((c) => ({ text: c, options: { fontSize: 10.5, color: HEX.dk1, fill: { color: i % 2 ? "FFFFFF" : "F6F8FA" } } })));
  s.addTable(body, { x: 0.5, y: 1.1, w: 12.3, colW: [0.45, 4.1, 5.95, 1.8], border: { type: "solid", pt: 0.5, color: "D5DCE3" }, rowH: 0.52, valign: "middle", margin: 0.06, objectName: "checklist" });
  T(s, "준비 명령은 docs/my-copilot/v7/EMULATOR-QUEUE.md '0. 시작 전 준비'. 결과는 E28 문서로 남기고 캡처를 docs/android/emulator 에.", { x: 0.5, y: 6.55, w: 12.3, h: 0.35, fontSize: 10.5, color: C.text2 });
}
{
  const s = pres.addSlide({ masterName: "SCREEN", sectionTitle: "점검" });
  s.addText("이번 촬영에서 새로 찾은 것 · 아직 남은 것", { placeholder: "title" });
  box(s, 0.5, 1.1, 6.05, 5.5, HEX.lt1, "found");
  T(s, "촬영하면서 찾아 고친 것 (커밋 2e5d4e7)", { x: 0.7, y: 1.25, w: 5.7, h: 0.35, fontSize: 13, bold: true, color: C.accent1 });
  T(s, bullets([
    "'지난번처럼'이 앱을 다시 켜면 사라졌다 — 앱이 진행 중 Mission 만 저장하고 마지막 선택은 저장하지 않았다. 마지막 이동·운전자 둘만 이 기기에 저장하도록",
    "모의 내비의 집 이름 '집 (시연 데이터)'에 '내비에 저장된 집: 집 (시연 데이터)'가 겹쳐 붙었다 — '집'으로 시작하는 이름은 덧붙이지 않도록(TS·Kotlin 테스트 추가)",
    "테스트: TS 211 · Kotlin 262 통과 · release 빌드 성공",
  ]), { x: 0.7, y: 1.7, w: 5.7, h: 4.7, fontSize: 12, color: C.text1 });
  box(s, 6.8, 1.1, 6.05, 5.5, HEX.lt1, "left");
  T(s, "아직 남은 것", { x: 7.0, y: 1.25, w: 5.7, h: 0.35, fontSize: 13, bold: true, color: C.accent2 });
  T(s, bullets([
    "이 덱의 화면은 전부 폰 모의 — 에뮬레이터 재확인 전(슬라이드 18 순서)",
    "후보 탭(쉼표 DRIVE 점수 목록)이 V6 결정 카드와 겹친다 — 남길지 결정",
    "시연 시계(08:00)와 실제 조회 시각이 한 화면에 섞인다",
    "실패 문구를 '할 일 / 상세' 두 층으로",
    "release 에서 모의 주입 코드 분리 · Mission 완료 조건 분리(ARRIVE READY 와 함께)",
    "시연 영상 v1 은 옛 화면 — 브랜치를 제출본에 넣으면 영상과 달라진다",
  ]), { x: 7.0, y: 1.7, w: 5.7, h: 4.7, fontSize: 12, color: C.text1 });
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("ok", OUT);
})();
