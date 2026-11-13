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

내용 원칙: 증거 등급([에뮬] · [실 API] · [시연] · [개발 중] · [미구현])을 화면에 붙인다 — [개발 중]은 ARRIVE READY 판단 엔진처럼 개발 브랜치에서 구현 · 실데이터 검증했지만 출품 APK 에 없는 것(2026-11-12) · 측정 전 숫자(조작 N회 감소 등)를 쓰지 않는다 ·
시연 데이터의 '신탄진' 방향 오류가 보이는 캡처(E24-04 · E24-07)는 쓰지 않는다.
