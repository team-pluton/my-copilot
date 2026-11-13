# MY CO-PILOT 통합 — 영향도 보고 (Phase 0) · Phase 1 결과

> 작성 2026-10-26. 입력: 오너가 붙여 넣은 "MY CO-PILOT × COMMA DRIVE 통합 개발 명세 v1.0"(이하 **통합안**).
> 통합안 16절의 Phase 0(진단) 산출물이다. 이름·정체성·제출 범위는 **아직 바꾸지 않았다** — 통합안도 같은 말을 한다(1.1 · 맺음말).

---

## 1. 출발점 (2026-10-26, 바꾸기 전)

| 항목 | 상태 |
|---|---|
| git | master, 작업 트리 깨끗 (CLAUDE.md 경로 수정만) · 원격 private |
| TS 테스트 | `npm test` **25/25** |
| Kotlin 테스트 | `core/` `gradle test` **34/34** |
| 산출물 | 접수양식 02 작성본(DOCX, form-content.json) · release APK · 웹 시연(/demo·/proposal) · 실기기 영상 48초 · 기획서 PDF |
| 마감 | 1차 접수 **11/15** (20일) · 설명회 **10/28** (2일) |

## 2. 보존 목록 — 이번 작업에서 손대지 않은 것

- `src/lib/core/*` 에너지·추천·휴식 엔진과 거울 테스트 — **mock.ts 주석 한 줄**만 고쳤다(아래 4절 사실 정정)
- `core/` 기존 Kotlin 파일 전부 · `adapters/` 전부 · `android/` 앱 코드 전부
- `src/components/demo/*` 셸·화면·조작판 · `/demo` · 소개 페이지
- `/proposal` — **API 표 한 줄**만 고쳤다(4절 사실 정정). 구성·문장은 그대로
- `docs/submission/*` · `apk/` · `public/` 캡처·영상·PDF

## 3. 기존 결정과 부딪히는 것 — 오너가 정할 것

통합안은 기존 원칙(보존·Mock 구분·안전 우선·범용 챗봇 아님)을 대부분 그대로 이어받는다. 그래도 아래 넷은 **기록된 결정을 뒤집거나 일정에 걸린다.**

1. **HANDOFF v3.1 "제외 유지: AI 비서"** (2026-10-25). 통합안은 정체성을 "개인화된 차량 비서"로 올린다. 외부 평가 2("사용 빈도가 제한적")에 대한 다른 답이지만, 전날 내린 결정을 바꾸는 것이다.
2. **CLAUDE.md 정책 5 · 경쟁 분석 결론 "우리는 판단만 한다."** PREPARE(공조 맞추기)·FINISH(체크리스트)는 판단을 넘어 **실행·관리**다.
   경쟁 분석의 차별화 세 축(도착 후 에너지 · 동승자 조건 · 충전=휴식)에 새 기능이 **더하는 축이 없다.** 출발 전 공조는 마이현대 원격 공조·차량 프로필과
   겹칠 가능성이 크다 — `research/HYUNDAI_COMPETITIVE_ANALYSIS.md` 에 이 비교가 없다(미확인). 통합안 2.3 도 "검증된 차이만 쓴다"고 했으니 비교부터 해야 한다.
3. **차량 특화성.** 하차 체크리스트는 차량 데이터를 거의 쓰지 않는다(도어 상태 정도). 공조 맞추기는 `CONTROL_CAR_CLIMATE` 가 서드파티에 허용될 때만 "실행"이다 — 미확인(설명회 질문 10).
4. **제출물 재작업.** 이름·정체성을 바꾸면 접수양식 02 · 기획서 · 소개 · APK · 영상 · PDF 를 전부 다시 만든다. 20일 안에 가능하지만, 지금 완성된 것을 흔든다.

**결정 (2026-10-26, 오너).** 아래 권고대로 간다 — 1차 출품은 쉼표 DRIVE v3.1, MY CO-PILOT 은 v4 확장으로 병행(취소 아님). "AI 비서 제외"는 범용 LLM 챗봇·독립 음성 비서를 뜻하고, 규칙 기반 상황 판단·제안은 허용한다. 오너가 비교할 수 있게 `/copilot` 을 별도 시연으로 만든다(출품 화면 `/demo` 는 그대로).

**권고(당시).** 1차 제출(11/15)은 **쉼표 DRIVE 그대로** 내고, 통합안은 "확장 로드맵" 한 절로 넣는다. 그 사이 Phase 1(상황 판단·Safety Gate)은 지금 앱에도
쓸모가 있어 먼저 만들었다 — 주행 중 제한·경유지 추가 확인·재시작 복원은 쉼표 DRIVE 자체의 약점이었다. PREPARE·FINISH 화면은 **10/28 설명회에서
CONTROL_* 권한 답을 들은 뒤** 범위를 정한다. 반대로 전면 통합을 택하면 4번 재작업 일정을 HANDOFF 에 먼저 박는다.

## 4. 통합안의 사실 주장 — 확인 결과

| 통합안 주장 | 결과 | 근거 |
|---|---|---|
| Vehicle SDK 에 Door·HVAC·Light·Seat 조회·**제어** 도메인이 있다 | **확인** — 조회·제어 권한이 따로 있다(`CAR_CLIMATE`/`CONTROL_CAR_CLIMATE` 등) | 실물 jar javap, research 11절 |
| 차종별 Capability 검사·비동기 결과 확인이 필요하다 | **확인** — `check…Capabilities` · set 은 `onSuccess(영역, 적용 값)` 콜백 | research 3·11절 |
| CarUxRestrictions 로 주행 중 UI 를 제한해야 한다 | **확인** | research 5절 |
| 주행 상태는 AAOS Car API (Standard First) | **확인** — 단 기어는 Vehicle SDK 에도 있다(어느 쪽인지 설명회 질문 11) | research 3·11절 |
| (기존 문서) Vehicle Brake 로 주차 브레이크를 읽는다 | **틀림 — 정정함.** Brake 는 페달 상태만. 주차 브레이크는 AAOS `PARKING_BRAKE_ON` | research 3·11절 · 기획서 6절 표 · mock.ts 주석 |
| Gleo Interface App Schema 는 액션 함수 **최대 3개** | **미확인(전해 들음)** — research 에는 "LLM SDK 종료 · Gleo Interface 로 대체"까지만 | 설명회 질문 12 |
| ADAS SDK | 별도 SDK 아님 — Connect SDK 는 Vehicle·NaviHelper·STT·TTS·FusedLocation(+종료된 LLM). ADAS 는 에뮬레이터 콘솔 분류 | research 1·8절 |

## 5. 통합안 구조를 이 저장소에 맞춘 배치

통합안 12.2 의 `src/features/*` · `src/adapters/*` 는 만들지 않았다 — 이미 같은 역할의 자리가 있고, 새 폴더를 두면 거울 규칙이 깨진다.

| 통합안 | 이 저장소 | 이유 |
|---|---|---|
| `src/lib/assistant/{context,planner,policy,state-machine,actions}.ts` | `src/lib/assistant/{journey,gate,planner}.ts` | context+state-machine = journey, policy+actions = gate. 파일이 적을수록 Kotlin 거울이 맞는다 |
| (없음) Kotlin 은 "기존 유지" | `core/src/main/kotlin/app/commadrive/core/assistant/{Journey,SafetyGate,SuggestionPlanner}.kt` | 앱이 `core/` 를 **소스 그대로** 컴파일한다 — 웹에서 보인 판단을 차에서도 같은 규칙으로 내야 한다 |
| `src/adapters/vehicle/*` | 기존 `adapters/`(Kotlin, 실물 SDK) + `core/Ports.kt` | 실물 SDK 연결은 이미 거기서 컴파일된다 |
| `PassengerPreference{ADULT,CHILD,SENIOR,PET}` | 기존 `PassengerType` + `needsOf()` | 이미 필수/선호 시설을 나눈다. ADULT 는 운전자 몫(화장실·주차)으로 늘 깔린다 |
| `energyReservePercent` | 기존 `TripPlan.minReservePct` | 같은 값 |
| 7.4 디바운스·변경 최소값 | 기존 `rejudge` 3%p 임계 | 이미 있다 |
| 7.5 보수적 "한 번 충전으로 완료" | 기존 `ReachableState.ONE_STOP_LIKELY` | 이미 있다 |
| 13절 매핑 상태(DOCUMENTED … VEHICLE_VERIFIED) | 기획서 6절 "확인 상태" 열 | 같은 일을 한다. 기획서를 고칠 때 이 단계명으로 맞춘다 |

## 6. Phase 1 — 이번에 만든 것

전부 **순수 함수**다. SDK 를 부르지 않고, 기존 화면에 아직 연결하지 않았다(Phase 3·5).

- **journey** — 여정 7단계 상태 기계. 속도 0 ≠ 주차(P 단은 확정, 주차 브레이크+정지는 추정), 곧 도착 3km/해제 5km(깜빡임 방지),
  0.5km 안 주차 = 도착·밖 = 중간 정차, **주차해도 하차 화면으로 자동 전환하지 않음**, 완료는 사용자만, 모르면 단계 유지, 재시작 시 차 상태 우선.
- **gate** — Safety Gate. 순서: 주행 제한 → 차량 지원 → 권한 → 차량 상태 → 확인 → 중복. **모르면 막는다.** CarUx 가 풀려도 바퀴가 구르면 차 설정 변경 차단.
  확인 후 실행 직전 재검사. 제어 결과는 콜백 값·재조회 값이 목표와 맞아야 SUCCESS, TIMEOUT·불일치는 성공이 아니다, Mock 성공은 `source: MOCK` 으로 표시.
- **planner** — 제안 하나 고르기. 가중치 40/25/20/15(초기값). 에너지 판단은 **기존 `estimate`·`verdictOf` 그대로** 받는다.
  거절 10분 쿨다운, 3회 연속 거절 → 추천함, 이번 여정에서 한 것 재제안 안 함, 주행 중 덜 중요한 것은 정차까지 보류, "먼저 제안" 끄면 전부 추천함.

테스트: TS `src/lib/assistant/assistant.test.ts` 28개 · Kotlin `core/src/test/.../assistant/AssistantTest.kt` 28개(같은 이름·같은 기대값).
결과: TS **53/53**(기존 25 + 28) · Kotlin **62/62**(기존 34 + 28) · `tsc` · `lint` 통과 · Android 앱 `compileReleaseKotlin` 통과.

## 7. Mock 과 실제의 구분 (지금)

| 것 | 상태 |
|---|---|
| journey·gate·planner | **구현** — 순수 로직, 화면 미연결 |
| 공조·좌석·조명 제어 | **SDK 에 API 있음(문서·jar)** · 권한 허용 미확인 · 앱 미연결 → 시연에 넣으면 Mock 표시 필수 |
| 도어 상태 | **SDK 에 API 있음** · 앱 미연결 |
| CarUxRestrictions · 기어 | 문서 확인 · 어댑터 미구현 |
| 기존 쉼표 DRIVE 연동(EvBattery·NaviHelper·TTS) | 앱에 연결 · 에뮬레이터 실행 전 (변함없음) |

## 8. 비교용 웹 시연 `/copilot` — 2026-10-26 (Phase 2~5 웹 범위)

오너 지시("쉼표 DRIVE 는 그대로 두고 지시서대로 만들어 결과물로 비교")로 **별도 경로**에 만들었다. `/demo`·소개·기획서·APK 는 그대로다. 사이트 메뉴에 걸지 않았고 배포하지 않았다.

| 지시서 | 구현 | 비고 |
|---|---|---|
| 프로필 SOLO/FAMILY/WORK (3절) | `src/lib/assistant/profile.ts` — 공조 온도·동승자(수동)·준비물·하차 항목·전부 확인 여부·최소 잔량 | 프로필 편집·기록만 localStorage, 위치는 저장 안 함. **Kotlin 거울 없음**(화면 데이터) |
| SCREEN A 홈 — 제안 하나 | `HomeScreen` — 제안 하나 + 이유 + 주요/보조 행동, 추천함(다시 켜기) | planner 그대로 |
| SCREEN B 프로필 | `ProfileScreen` — 주행 중엔 한 줄 화면으로 바뀌어 편집 불가 | |
| SCREEN C 출발 준비 | `PrepareScreen` — 비교 → 확인 → 실행 직전 재검사 → 콜백·재조회 확인. 막히면 이유를 버튼 자리에 | 성공은 늘 **모의** 표시 |
| SCREEN D 에너지 | 쉼표 DRIVE `EnergyScreen`·`CandidatesScreen` **그대로** | 엔진·수치 동일 (테스트로 고정) |
| SCREEN E 주행 중 | 쉼표 DRIVE `DrivingScreen` 그대로(제목만 prop) | CarUx 제한이면 어떤 화면이든 이것 |
| SCREEN F 하차 | `FinishScreen` — 편집 가능 체크리스트, 조회 가능한 도어 상태만, "직접 확인" 문구, 센서 판정 아님 명시 | 8.4 절대 표현 금지 지킴 |
| SCREEN G 기록 | `HistoryScreen` | |
| 시뮬레이터 컨트롤 (11.2) | 기어·주차 브레이크·CarUx(자동/제한/해제/모름)·공조 현재값·조회 가능·차종 지원·제어 권한·제어 결과(성공/거절/응답 없음/값 불일치)·도어·내비 권한·먼저 제안 | 시연 시계는 브라우저 시계와 분리 |
| 시나리오 A~F (11.4) | 단계별 투어 — 같은 핸들러를 누른다 | 헤드리스 Chrome 으로 전부 끝까지, 콘솔 오류 0 |

돌려 보다 찾은 판단 오류 1건을 엔진에서 고쳤다: **목적지 3km 앞에서 휴식을 권했다** → 곧 도착 단계에서는 휴식 제안을 내지 않는다(TS·Kotlin 거울 + 테스트).

## 9. 실제 차량 비서로서의 검증 — 2026-10-26 (오너 지시: 기능 추가보다 검증)

| 지시 | 한 것 | 근거 |
|---|---|---|
| 1. 상황 인지 동작 점검 | 홈에 머문 채 조작판만 바꿔 제안이 바뀌는지 — 헤드리스 Chrome 8단계 (공조 23→26°C, 거절 후 쿨다운, 주행·주차) · 순수 로직 **타임라인 테스트**(여정 단계 + 제안 엔진을 이어 6장면) TS·Kotlin 거울 | 콘솔 오류 0. 찾은 결함 1: 진행 슬라이더로 **배터리 0% 로 390km** 를 갈 수 있었다 → 바닥나는 지점에서 멈추게 고침 |
| 2. 판단 근거 표시 | 제안마다 `evidence` — **차량 값(모의 표시) · 내 설정 · 추정 · 판단 규칙** 네 종류로 나눔. 홈의 "왜 지금?" | 근거 문장 거울 테스트 2개 |
| 3. 실제 차량 API 연결 준비 | `copilot-adapters/` (출품 APK 미포함) — `AaosJourneySignalSource`(CarUx·속도·기어·주차 브레이크) · `PleosCabinStateSource`(HVAC 설정 온도·시트 통풍/열선·도어 위치·잠금) · `PleosCabinControl`(공조 온도·통풍·열선 set — 2026-10-29 에뮬레이터 `CONTROL_*` 권한 확인 뒤 추가). 해석 규칙은 `core/assistant/Signals.kt` `SignalMapping` + 테스트 | 실물 jar + android.car.jar 컴파일 통과. **읽기 전용 검사**(`PleosCabinControl.kt` 밖에 set 호출이 있으면 빌드 실패). 2026-10-29 Pleos Connect Emulator 에서 조회·제어 콜백 실행 확인(`EMULATOR-RESULT-2026-10-29.md`) · 실차 전 |
| 4. 제품 비교 자료 | `COMPARISON.md` — 7개 항목 · 공식 기준 연결 · 1/3/5점 기준 · 확인된 사실 나란히 · 블라인드 절차 · 기록지 | 결론 없음 |

새로 확인한 SDK 사실은 research 11절(기어는 AAOS GEAR_SELECTION 을 쓰라는 deprecation 등). 앱 매니페스트에 넣어야 할 권한은 어댑터 주석에 적었다 — 출품 앱은 건드리지 않았다.

## 10. 품질 개선 — 2026-10-26 (76장면 검토 피드백)

조사 `QUALITY_AUDIT.md` → 체크리스트 `CHECKLIST.md` 순서로 P0 4개 · P1 8개를 모두 끝냈다. 새 순수 로직(전부 `src/lib/assistant` ↔ `core/…/assistant` 거울):
`energy-view`(숫자 의미) · `notify`(누적 재판단) · planner 등급·함께 할 일·건너뛰면 · journey 구간·대기 · `trip`(구간별 남은 계획) · `actions`(요청 상태).
웹 전용 화면 상태: `memory`(이번 이동 · 프로필별 저장소), `profile`. 시나리오는 A~J 10개, 클릭 지도 109장면.

## 11. 남은 단계 (통합안 16절 기준)

- **Phase 2 프로필·PREPARE** — 프로필 3개(SOLO/FAMILY/WORK), 로컬 저장, 공조 비교 카드. 설명회 질문 10 의 답 이후.
- **Phase 3 ENERGY 연결** — 시연 화면 위에 "제안 하나" 카드, planner 를 시뮬레이터 상태에 연결.
- **Phase 4 FINISH** — 체크리스트 편집·완료 기록. 문구는 통합안 8.4(절대 표현 금지)를 그대로 지킨다.
- **Phase 5 시뮬레이터** — 기어·도어·권한·제어 성공/실패 조작, 시나리오 A~F, 시연 시계.
- **Phase 7 어댑터** — `CarUxRestrictionsManager`·Gear·HVAC get/set·Door 를 `adapters/` 에, 신호를 `JourneySignals` 로.
- 경쟁 비교 보강 — 마이현대 원격 공조·차량 프로필(3절 2번).

## 12. Pleos Connect 차량용 앱(실험) — 2026-10-26

> 용어: 이 앱은 **Pleos Connect 차량 디스플레이에서 실행되는 차량용 앱**이다. Android Automotive 기반이라 Kotlin·Compose 를 쓸 뿐, 스마트폰 앱이 아니다(오너 정정 2026-10-26). 최종 실행 대상은 Pleos Connect Emulator · 지원 차량이다.

웹 /copilot 과 같은 판단을 차에서 돌리기 위한 첫 이식. 출품 앱은 건드리지 않는다.

| 층 | 무엇 | 확인 |
|---|---|---|
| 판단 | `core/…/assistant/CopilotSession.kt` — 웹 시뮬레이터의 상태 전이(프로필·출발 준비·주행·대기·하차·공조 요청·경유지)를 순수 리듀서로. `Profile.kt`·`Memory.kt` 는 웹 profile·memory 거울 | `CopilotSessionTest`(10) · `ProfileMemoryTest`(6) — 웹 시나리오와 같은 입력·같은 기대값 |
| 앱 | `android/copilot` — `CopilotViewModel`(시간·모의 차량 응답·음성만) + `CopilotScreens`(홈·출발 준비·에너지·후보·하차·기록·주행 한 줄·조작판) | debug·release 빌드 통과. 실기기 미실행(폰 미연결) |
| 분리 | applicationId `app.commadrive.copilot` · 실험 빌드는 debug 키 · `:app` 의 소스·리소스를 **그대로 컴파일**(복사·수정 없음) · APK 는 `apk/` 에 두지 않음 | `:app:assembleRelease` 통과 · 출품 파일 변경 0 |

차량 값은 Automotive 기기가 아니면 전부 모의이고 화면 머리에 "실험 · 차량 값 모의"를 늘 띄운다. `copilot-adapters` 는 `VehicleBridge` 가 Automotive 기기에서만 붙인다(AAOS 신호 · EvBattery · `PleosCabinStateSource` 공조·시트·도어 · `PleosCabinControl` 제어) — 2026-10-29 Pleos Connect Emulator 에서 조회·제어 콜백까지 확인(`EMULATOR-RESULT-2026-10-29.md`).
