# 아이디어 10개와 접목 판단

> 2026-10-24. 외부 자료의 TOP 10 을 기록으로 남기고, **무엇을 접목하고 무엇을
> 버렸는지**를 공식 문서(`PLEOS_PLATFORM.md`)에 비추어 적는다.
> 오너 지시: *"전부 넣으라는 게 아니고 접목 가능한 기술로 좋은 결과물을 낼 수 있게 구성."*

## 10개 (원문 요약)

| # | 아이디어 | 핵심 기술 | 난도 | 우리 판단 |
|---|---|---|---|---|
| 1 | CAR TWIN — 차량 디지털 트윈·예측 | Vehicle + 3D + 예측 | 3 | **시각 요소만 접목** — 상태 패널. 3D 필수 아님 |
| 2 | FLOW OS — 상황 인지 에이전트 | LLM + Vehicle + Navi + 음성 | 4 | **설명 문장만 접목** — 규칙 기반. Gleo AI 와 겹침 |
| 3 | SAFE ARRIVAL — 도착지 위험 안내 | Navi + 공간 데이터 | 4 | 보류 — 안전 판단으로 오해될 위험 |
| 4 | **ENERGY ORCHESTRA** — EV 에너지 계획 | EvBattery + HVAC + Navi | 3 | **핵심으로 채택** |
| 5 | CABIN DNA — 탑승자별 실내 환경 | HVAC/Seat/Light 제어 | 3 | 버림 — 제어 권한 전제, 마이현대와 중복 |
| 6 | ROAD LENS — 공간 AI 지도 | 3D 지도 + PostGIS | 4 | 버림 — 지도는 내비가 한다 |
| 7 | VOICE MESH — 복합 음성 명령 | STT + LLM + Navi | 3 | 버림 — Gleo AI 영역. 단 **"충전 + 식당"** 예시는 v2 시나리오 그대로 |
| 8 | PARKING MEMORY — 주차 위치 기억 | 위치 + 수동 기록 | 2 | 버림 — 폰 연동 설계가 별개 과제 |
| 9 | TRIP STORY — 여행 일지 생성 | STT + LLM | 2 | 버림 — 동승자 녹음 동의 문제 |
| 10 | CAR GUARDIAN — 상태 변화 탐지 | Vehicle 시계열 | 4 | 버림 — 고장 예측으로 읽힐 위험 |

## 왜 4번(ENERGY)을 중심에 두고 1·2 는 요소만 가져왔나

**플랫폼이 허락하는 자리가 거기다.** 확인된 사실 하나가 결정적이었다 —
App Category 문서의 Mobility Services 주행 중 제한적 허용 예시에
*"Finding EV charging stations and setting them as waypoints"* 가 **명시**돼 있다.
우리 핵심 동작이 플랫폼 정책의 예시 문장 그대로라는 뜻이다. 다른 아이디어는
이런 근거가 없다.

**SDK 표면이 넓게 쓰인다.** EvBattery · HVAC · Odometer · DrivingMode (Vehicle) +
속도/기어 (AAOS Car API) + NaviHelper 경유지 + TTS. 심사 기준 "기술 활용성" 에
직접 걸린다. CAR TWIN 은 상태 **표시**에 그치면 마이현대와 겹치고, 3D 는
Kotlin 이식 때 큰 짐(Filament/SceneView)이 된다 — 그래서 **시각 요소만**.

**기존 쉼표 DRIVE 가 버려지지 않는다.** EV 충전은 20~40분 걸린다 — **그 정차가 곧
휴식**이다. "언제 서야 하나"는 에너지가 정하고, "어디서 서나"는 동승자 조건이
정한다. v1 의 추천 엔진(필수 시설 배제 → 점수 → 이유 설명)과 Kotlin `core/` 가
그대로 **축 2** 가 된다.

**FLOW OS 의 가치는 "먼저 제안한다"인데, 그건 LLM 없이도 된다.**
"도착 후 40분 대기까지 하려면 12% 가 모자랍니다" 는 규칙으로 만드는 문장이고,
그래야 심사에서 "왜 그렇게 말했나"에 답할 수 있다. LLM SDK 는 **나중에** 설명문을
다듬는 데 쓸 수 있는 선택지로 남긴다.

## 버린 것들의 공통점

- **제어 권한을 전제**로 한다 (CABIN DNA) — 사전 승인 없이는 시연조차 어렵다
- **안전·진단 판단으로 읽힌다** (SAFE ARRIVAL, CAR GUARDIAN) — "홍보하지 말라"는
  단서가 붙는 순간 심사에서 설명 비용이 커진다
- **Gleo AI·내비가 이미 하는 일** (ROAD LENS, VOICE MESH 범용부) — 경쟁 분석의
  결론과 정면충돌
- **별도 과제가 딸려 온다** (PARKING MEMORY 의 폰 연동, TRIP STORY 의 동의)

## 접목 결과 → `docs/01-product.md`
