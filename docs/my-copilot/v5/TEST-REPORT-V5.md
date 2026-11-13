# TEST REPORT V5 — TypeScript/Kotlin 회귀 및 신규 테스트 (2026-11-02~03)

| 묶음 | 명령 | 결과 |
|---|---|---|
| TS 거울(core + assistant) | `npm test` | **172 / 172** (V4 164 + 신규 8) |
| Kotlin core | `gradle test --no-daemon`(core/) | **223 / 223** (V4 212 + 신규 11) |
| 타입·린트·웹 빌드 | `npx tsc --noEmit` · `npm run lint` · `npm run build` | 통과 |
| 차량용 앱 빌드 | `./gradlew :copilot:assembleDebug` | 통과 — `copilot-debug.apk` 50.8MB |
| 출품본 | `apk/` · `src/lib/core` · `android/app` · `adapters` | **변경 0** |

## 신규 테스트 — `mission.test.ts`(8) ↔ `MissionTest.kt`(11, 세션 4개 포함) · 같은 입력·같은 기대값

| 지시서 15절 성공 기준 | 테스트 |
|---|---|
| 7 중간 목적지 도착이 Mission 완료로 처리되지 않는다 | "픽업 후 귀가: … 중간 목적지 도착은 완료가 아니다" · 세션 "픽업 Mission — 픽업 장소 도착은 완료가 아니다 …" (ARRIVED_AT_STOP · finalStop false · ACTIVE) |
| 8 확인된 귀가 일정은 방문 중에도 유지 | returnDestination "집 (귀가)" · remainingLegs 2 · returnLine "귀가 … 유지 · 방문 뒤에도 끝나지 않음" |
| 9 데이터가 없으면 추론·성공 표시 안 함 | 복귀 목적지 없음 → NEXT_LEG 제안 없음 · GUEST → 유형·복귀 없음 · 대기 NONE |
| 4·8 내비 목적지 자동 변경 금지 | 세션: ReadyNextLeg 뒤 `plan` 동일 · `waypoints` 비어 있음 |
| 6 승인 + Safety Gate | PREPARE_NEXT_LEG: 주차·확인 때만 허용 · 주행 중 DRIVING_BLOCKED · 확인 전 NEEDS_CONFIRMATION · 세션: 주행 중 ReadyNextLeg 무시 |
| 11 주행 중 조작 요구 없음 | NEXT_LEG allowedWhileDriving false → 주행 중 보류 |
| 우선순위(지시서 9절) | SHORT(위험) > NEXT_LEG(결정) > TIGHT(주의) |
| 재시작 복원(4절 6) | restorable 경계(진행 중만) · 세션: 스냅샷 → 복원 → 같은 Mission · CONFIRMING 요청은 IDLE 로 · 저장은 대기 중인데 차가 달리면 귀가 구간 · 끝난 이동은 복원 안 함 |
| 상태 | 귀가 남긴 채 종료 → CANCELLED · 다시 고르면 ACTIVE · 구간 바뀌면 nextLegReady 초기화 |
| 대기 출처 | SAVED → ChangeWait/SetWaitMode → USER · GUEST → NONE |
| 픽업 프리셋 | 왕복 2구간 · 차 안 20분 · 어린이 · 기본 차량 충분(OK) · 하차 항목에 "아이 가방" |

## 바뀐 기존 테스트(이유를 적는다)

- `cabin.test.ts` / `CabinTest.kt` — 가족 맥락의 둘째 칩이 PICKUP(맥락 셋은 그대로).
- `Round3Test.kt` 대표 1 — 앱이 먼저 묻는 것이 "하차 확인 두 번"에서 **"하차 확인 두 번 + 귀가 일정 확인 한 번"**으로. V5 의 의도된 변화(목적지 도착 뒤에도 Mission 이 남아 있음을 앱이 기억). `DEMO-60S.md` 의 "두 번뿐" 문장은 V5 통합 시 고친다(1차 출품 자료는 V3.1 이라 그대로).

## 기준 3·4(운전자 설정 격리 · 가족 공통 선호)·5(같으면 변경 요청 없음)·10(EV 아닌 차량 공통 기능)·12(SDK 성공·실패 표시)·13(회귀)·14(출품본 불변)

V4 테스트가 이미 고정(SituationTest · CabinTest · 가용성 · ValidityTest) — 전부 통과. 14 는 git 으로 확인(출품본 경로 diff 0).

## 2026-11-03 문구 개정 뒤 재실행

"귀가 준비됨" → "귀가 확인 · 내비 미설정" 등(UX-FLOW 6절). 거울 기대값을 같이 바꾸고 다시 돌렸다: TS **172/172** · Kotlin **223/223** · tsc · eslint 통과. 판단 규칙·테스트 수 변화 없음.

## 하지 않은 것

- 블라인드 사용성 평가(평가자 필요) — 숫자 없음.
- 실차 — 없음. 에뮬레이터 결과는 `SDK-EVIDENCE-V5.md`.
