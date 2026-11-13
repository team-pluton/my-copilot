# 발표 덱 만들기 (1차 시안)

산출물: `docs/presentation/MY-CO-PILOT_1차시안.pptx` (14장 · 장마다 발표자 노트).

저장소 밖 작업 폴더에서 돌린다(의존성을 프로젝트에 넣지 않는다):

```bash
npm i pptxgenjs sharp react-icons react react-dom          # 작업 폴더에서
node crop.cjs <에뮬레이터 캡처 파일들>   # docs/my-copilot/captures/emulator → img/*-app.png (앱 창만)
node crop2.cjs                         # 슬라이드용 확대 캡처
NODE_PATH=./node_modules PPTX_SKILL=<pptx 스킬 경로> node build.cjs deck.pptx
python qa_render.py deck.pptx qa/s     # LibreOffice 가 없어 직접 그려 글자 넘침을 잰다(맑은 고딕 실제 폭)
```

## 2차 시안 (V7 · Journey OS, 2026-11-10)

산출물: `docs/presentation/MY-CO-PILOT_2차시안_JourneyOS.pptx` (14장 · 발표자 노트) · 간이 미리보기 PDF `MY-CO-PILOT_2차시안_간이미리보기.pdf`.
내용 기준은 `docs/my-copilot/v7/CONTEST-NARRATIVE-V7.md` 의 14장 표. 같은 작업 폴더 · 같은 이미지(`img/s-*.png`)를 쓴다.

```bash
NODE_PATH=./node_modules PPTX_SKILL=<pptx 스킬 경로> node build-v7.cjs deck-v7.pptx
python qa_render.py deck-v7.pptx qa7/s   # 'Slide Number' 넘침 경고는 렌더러 오탐
```

6장(ARRIVE READY 목표 화면)은 목업이다 — "목표 UX · 가상 수치 · 미구현" 꼬리표를 지우지 않는다.

내용 원칙: 증거 등급([에뮬] · [실 API] · [시연] · [미구현])을 화면에 붙인다 · 측정 전 숫자(조작 N회 감소 등)를 쓰지 않는다 ·
시연 데이터의 '신탄진' 방향 오류가 보이는 캡처(E24-04 · E24-07)는 쓰지 않는다.

## 전체 화면 점검 덱 (2026-11-11)

산출물: `docs/presentation/MY-CO-PILOT_화면점검_2026-11-11.pptx` (19장 · 폰 모의 데이터 캡처 31장 · 화면마다 요약 + 에뮬레이터에서 볼 것).
캡처는 연결된 폰에서 uiautomator 로 텍스트를 찾아 누르며 찍었다(앱 화면만 잘라 `svc/*.jpg`). 같은 작업 폴더에서:

```bash
NODE_PATH=./node_modules PPTX_SKILL=<pptx 스킬 경로> node build-screens.cjs screens.pptx
```

### 2차 (화면점검 2차 리뷰 반영, 2026-11-11)

산출물: `docs/presentation/MY-CO-PILOT_화면점검_2차_2026-11-11.pptx` (23장 · 커밋 e38f216 빌드로 폰 34장 재촬영 · 바뀐 것은 변경 전/후 3장).
이미지는 `svc2/*.jpg`(변경 전 비교용은 `v1-` 접두어 — 1차 캡처). 같은 방식으로 `node build-screens-v2.cjs screens-v2.pptx`.

### 3차 (2차 수정본 평가 반영, 2026-11-11)

산출물: `docs/presentation/MY-CO-PILOT_화면점검_3차_2026-11-11.pptx` (27장 · 커밋 fe3385e 빌드로 폰 37장 재촬영 · 3차 변경 전/후 3장 + 2차 변경 4장 유지).
이미지는 `svc3/*.jpg`(비교용 `v1-`·`v2-` 접두어). `make_v3.py` 가 2차 스크립트(`build-screens-v2.cjs` + 본문)를 고쳐 `build-screens-v3.cjs` 를 만든다.

## 제품 원칙 기준 점검 덱 (2026-11-11)

산출물: `docs/presentation/MY-CO-PILOT_제품원칙점검_2026-11-11.pptx` (17장) — `docs/my-copilot/PRODUCT-PRINCIPLES.md` 의 검토 순서(철학 → 운전자의 일 → 기본 기능과 구분 → UI)대로.
화면은 에뮬레이터 실측 E27·E28 캡처의 앱 창만 잘라 `svc4/*.jpg`(1100×780). `node build-principles.cjs principles.pptx`.
