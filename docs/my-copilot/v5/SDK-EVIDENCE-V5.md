# SDK EVIDENCE V5 — 문서 · 컴파일 · 모의 · 에뮬레이터 구분 (2026-11-03)

증거 등급(`FIT-2026-10-28.md` 와 같다): **[문서]** 공식 문서·javap 로 존재 확인 · **[컴파일]** 실물 SDK jar 로 컴파일 통과 · **[모의]** 웹 시뮬레이터·모의 차량 · **[에뮬]** Pleos Connect Emulator v2.1.0 에서 실제 콜백을 봄 · **[실차]** 없음(0건).
Mission 은 기존 신호 위에서 계산한다. 새 증거는 복원(E22)과 원탭 다음 이동(E23, NaviHelper `requestRoute`)이다.

| Mission 단계 · 기능 | 쓰는 신호·API | 등급 | 근거 |
|---|---|---|---|
| MISSION_SELECTED(운전자 · 탑승 조합 · 목적) | 없음 — 사용자 수동 | — | 공개 SDK 에 운전자 프로필·디지털 키 API 없음 [문서 javap 2026-10-28] |
| PREPARE 실내 비교 · 승인 하나 | HVAC get/set · Seat get/set · `CONTROL_CAR_*` | [에뮬] | set → 콜백 → 재조회 · 셸 공조 바 동기(E10·E19·E21, 2026-10-29) · `CONTROL_*` normal 등급 · 실차·App Market 미확인 |
| PREPARE 에너지(EV 특화) | EvBattery SOC · `INFO_EV_BATTERY_CAPACITY` | [에뮬] | SOC % 콜백 · 용량 Wh(77400) · 효율 콜백은 **안 옴** |
| EN_ROUTE 단계 전이 · 한 줄 화면 | AAOS `GEAR_SELECTION` · PARKING_BRAKE · CarUxRestrictions | [에뮬] 기어 / [모의] UX | 기어 D/P 콜백으로 화면 전환(E4) · CarUxRestrictions 켜짐은 콘솔 카드 없음(E6 미확인) · `CAR_SPEED` 이미지에 정의 없음 |
| EN_ROUTE 경유지 | NaviHelper `addWaypoint` · `onWaypointChanged` | [컴파일] + [에뮬 ⚠️] | 목적지 없으면 콜백 없이 내비 검색 화면(E11, 출품 앱) · 목적지 있을 때 ADD 콜백 미확인 |
| ARRIVED_AT_STOP 도착 판정 | 기어 P + NaviHelper 남은 거리 ≤ 0.5km | [에뮬] 기어 / [모의] 거리 | 남은 거리는 세션 계산(내비 연결 전) — `remainDistance` 배선은 HANDOFF 남은 일 |
| WAITING / VISITING 대기 에너지 | 쉼표 DRIVE estimate(대기 소비) · `v.hvacOn` | [모의] | 공조 ON/OFF 실값은 `getHvacPowerState` 경로 미구현 |
| NEXT_LEG 귀가 일정 확인 제안 · 수락 | 없음 — 세션 상태만 | [에뮬] 화면(E22-08·09) | 확인만으로는 내비를 건드리지 않는다 |
| NEXT_LEG **집으로 안내 시작**(사용자 한 번 탭) | NaviHelper `getBookmarkInfo(HOME)` · `requestRoute` · `onRouteStarted` · `getDestinationInfo` | **[에뮬] ✅ E23** | 저장된 집만 · 콜백 뒤 목적지 재조회로 확인 · 교체 확인·응답 없음은 단위 테스트만 |
| RETURNING 귀가 구간 | 기어 콜백(MOVING) → leg+1 | [에뮬] 기어 | 위와 같음 |
| COMPLETED 하차 확인 | Door 조회(표시만) | [에뮬] | 4문 위치 · 잠금은 합친 영역(E17) |
| **복원(재시작)** | SharedPreferences JSON(`MissionStore`) + `CopilotSession.restore` | **[에뮬] ✅ E22** | 강제 종료 뒤 재실행 · 에뮬레이터 재부팅 뒤 둘 다 같은 Mission |
| 복원 — 웹 | localStorage `copilot.v5.mission` | [모의] | 시나리오 P 7단계 · 새로고침 |

## E22 — 차량용 앱 복원 (Pleos Connect Emulator, 2026-11-03)

절차: `copilot-debug.apk`(V5) 설치 → 픽업 Mission 선택 → 출발 → 학원 도착(P) → 내리지 않고 기다리기 → "돌아갈 준비를 할까요?" 확인 → `am force-stop app.commadrive.copilot` → 재실행 → 홈이 "픽업 후 귀가 · 귀가 준비됨 · 귀가 집 (귀가) 유지"로 돌아오는가 · 기록에 "앱을 다시 열어 이동 #1 를 이어서" · 토스트.

결과(2026-11-03, 캡처 `captures/emulator/E22-01`~`E22-11`): **✅ 복원 확인 — 두 가지 경로로.**

| 단계 | 본 것 | 캡처 |
|---|---|---|
| 선택 | 시작 화면에 "가족 · 아이 픽업 후 귀가" 칩 · 운전자 엄마 | E22-01 |
| 출발 준비 | 최상단 Mission 머리줄 "픽업 후 귀가 · 출발 준비 / 귀가 집 (귀가) 유지 · 방문 뒤에도 끝나지 않음 / 도착 후 대기 20분 · 저장된 계획" | E22-02 |
| 승인 하나 | 열선시트 끔 → 켬 → "1개 중 1개 적용 · 열선시트 · 적용됨 · 적용 확인"(실제 Seat set 콜백, 모의 표기 없음) | E22-03 |
| 기어 D | 콘솔 `gear=Drive` → 앱 "주행 중 · 한 줄 화면 · 귀가까지 에너지 문제 없음 · 추정" | E22-04 |
| 에뮬레이터 재부팅 뒤 | 콜드 부트 → 앱을 다시 띄우자 **같은 Mission(픽업 후 귀가 · 출발 준비)로 시작** — 프로세스·기기 재시작을 넘어 복원 | E22-06 |
| 학원 도착 | (아래 한계로 모의 주행) 주차 → "픽업 후 귀가 · **도착**" · "귀가 … 유지" — 완료 아님 · 하차 준비 / 내리지 않고 기다리기 / 여정 끝내기 | E22-07 |
| 차 안 대기 | "픽업 후 귀가 · 차 안에서 대기" · 제안 "집 (귀가)로 돌아갈 준비를 할까요?"(결정 등급 · 근거: 저장된 복귀 목적지 · 판단 규칙) | E22-08 |
| 귀가 준비 확인 | "픽업 후 귀가 · **귀가 준비됨** / 귀가 준비됨 · 집 (귀가) · 내비 목적지는 직접 설정" · 제안 없음(한 번만) · 내비 화면 변화 없음 | E22-09 |
| **강제 종료 → 재실행** | `am force-stop` 으로 PID 6772 종료 → 재실행 PID 24161 → **"귀가 준비됨 · 차 안에서 대기 · 귀가 12km 남음"** 그대로 | E22-10 |

> **재촬영(2026-11-03 오후, 문구 개정 빌드)**: E22-07~10 을 새 빌드로 다시 찍어 **옛 문구 캡처를 덮어썼다**(저장소에 옛 문구 화면 없음). E22-11 = 에뮬레이터 재부팅 뒤 새 문구로 복원된 화면.
> 새 화면: 07 "픽업 후 귀가 · 도착 / 귀가 집 (귀가) 일정 기억 중" · 08 카드 "방문을 마치셨나요? / 귀가 일정이 남아 있어요. / 다음 이동: 집으로 / 내비게이션 목적지는 직접 설정해야 합니다." + [귀가 일정 확인] · 09 "귀가 확인 · 내비 미설정 / 이동을 시작하려면 내비게이션에서 집 (귀가)를 목적지로 설정해 주세요" · 10 강제 종료(PID 8095 → 24747) 뒤 같은 화면.
> 재실행 직후 기어·차량 칩이 "모름 · 확인 못 함"으로 보인다 — 실제 주행 신호가 아직 오지 않은 상태를 그대로 적은 것이다(복원은 Mission 만, 차량 값은 지금 신호로).

**증거 등급을 섞지 않는다**: [에뮬] 실제 = 열선 set·콜백·재조회 · Mission 복원(강제 종료·재부팅) · 기어 D 한 줄 화면 / [모의 주행] = 학원 도착·귀가 출발 전환(개발용 스위치). 속도 신호가 없는 이 이미지에서 주행 자동 인식에 성공했다고 말하지 않는다.

에뮬레이터에서 본 한계(그대로 적는다):
- **기어 D 만으로는 여정이 "이동 중"으로 넘어가지 않는다.** 이 이미지에는 속도 신호가 없고(`CAR_SPEED` 정의 없음) CarUxRestrictions 는 꺼짐이라, `motionOf` 가 움직임을 "모름"으로 본다(보수적 — 설계대로). 한 줄 화면은 제한 판정(P 아님)으로 뜨지만 단계 전이는 없다. 그래서 학원 도착은 **개발용 조작판의 "실제 주행 신호 → 모의"** 스위치(켜진 동안 AAOS 주행 콜백을 버림, 배터리·공조는 실제 그대로)로 만들었다. 실차(속도 신호 있음)에서는 필요 없을 것 — 미검증.
- 복원 저장값은 앱 전용 저장소(SharedPreferences)라 `run-as` 로 파일을 열어 보지 못했다(디버그 빌드 user 10) — 복원 화면으로만 확인.
- 실차 · App Market 미확인.

## E23 — 원탭 다음 이동: "집으로 안내 시작" → NaviHelper.requestRoute (2026-11-03)

등급을 단계별로 나눈다(오너 지시 10).

| 단계 | 결과 | 근거 |
|---|---|---|
| **문서 확인** | ⚠️ 부분 — 오너가 붙여 준 문서 발췌(`requestRoute`·`getDestinationInfo`·`onDestinationChanged`·`onRoutingCompleted`·`onError`·`NAVI_ROUTE_SEARCH`)뿐. `document.pleos.ai/api-reference/connect-sdk-pleos/NaviHelper/destinations` 는 WebFetch 로 본문이 비어 직접 인용 못 함 | — |
| **AAR 확인** | ✅ NaviHelper 3.0.5 javap — `requestRoute(RouteInfo)` @RequiresPermission `NAVI_ROUTE_SEARCH` · `RouteInfo(lat, lon, displayLat?, displayLon?, poiName, poiId, address, poiSubId, RouteOption, poiProvider, isMobileRequest)` · `getBookmarkInfo()`→`onBookmarkInfo(List<BookmarkInfo>)`(BookmarkType HOME/OFFICE/EV_CHARGING_STATION/DEFAULT, 문자열 nullable) · `getDestinationInfo`·`getRouteStateInfo(isRouting)` · 콜백 `onRouteStarted`·`onRoutingCompleted`·`onDestinationChanged`·`onError(NaviErrorCode)` | research 14절 |
| **컴파일** | ✅ `copilot-adapters`(`PleosNaviRoute.kt`) · `:copilot` APK · `verifyReadOnly` 가 경로 변경 호출을 이 파일·`PleosCabinControl.kt` 밖에서 막음 | — |
| **에뮬레이터 실행** | ✅ 권한 `NAVI_ROUTE_SEARCH` granted=true(normal) · NaviHelper 연결 · 즐겨찾기·경로 상태·목적지 조회 응답 | logcat `CoPilotNavi` |
| **결함 발견 → 수정** | 집을 등록하지 않은 내비가 HOME 즐겨찾기를 **(0, 0)** 으로 돌려줌 → 그대로 보내자 내비가 "경로 탐색 오류 - Invalid Parameter" · `onError(CAUSE_SEARCH_ROUTE)` → 앱 "내비가 경로를 찾지 못했습니다 · 기존 경로는 그대로입니다". `validPlace`(0,0·범위 밖 = 빈 자리 → NO_HOME, TS·Kotlin 거울 + 테스트)로 고침 | E23-01 · E23-02 |
| **실제 목적지 설정 · 콜백 검증** | ✅ 내비에서 시험용 장소(강남역 2호선)를 집으로 등록 → 앱 "집으로 안내 시작" → `requestRoute #1 sent` → **`onRouteStarted`** (8초 뒤) → **`getDestinationInfo` 재조회 = 등록한 집(같은 poiId)** → 앱 "귀가 경로 확인됨 · 내비 목적지: 집 (귀가) · 내비가 확인함". 내비 화면에 실제 경로 안내(24분 · 13km) | E23-03 · E23-04 · E23-05 |
| 미확인 | 기존 경로가 있을 때의 교체 확인(CONFIRM_REPLACE)·`onRoutingCompleted`·`onDestinationChanged` 는 에뮬레이터에서 안 봄(단위 테스트만) · 응답 없음(10초) 경로 · 주행 중 차단은 게이트 테스트만 · 실차 · App Market | — |

규칙: 저장된 집만 쓴다(주소를 만들지 않는다) · 보낸 것만으로 완료라 하지 않는다(콜백 + 목적지 재조회) · 기존 경로가 있으면 무엇이 바뀌는지 묻는다 · 응답이 없으면 다시 보내지 않고 재조회 · 주행 중엔 버튼이 없다(게이트 BLOCK) · 집이 없으면 "직접 설정" 안내 그대로.
