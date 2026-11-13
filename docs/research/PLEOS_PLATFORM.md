# Pleos Connect 플랫폼 — 공식 문서로 확인한 것

> 확인일 **2026-10-24**. 출처는 전부 `document.pleos.ai` (SSR 되는 `/docs/` 페이지를
> 직접 받아 읽었다). 여기 적힌 것만 "확인됨"이고, 나머지는 전부 미확인이다.
> 문서가 *"플랫폼 버전·양산 차량에 따라 다를 수 있다"* 고 스스로 밝히므로
> 설명회(10/28)와 에뮬레이터에서 다시 맞춘다.

## 1. 문서 규모와 구조

사이트맵 **4,317 URL**. `api-reference` 2,272 · `docs` 2,023.
Connect SDK 는 여섯이다 (Dokka 페이지 수):

| SDK | 페이지 | 비고 |
|---|---:|---|
| Vehicle | 1,179 | 도메인 19개 (아래) |
| NaviHelper | 497 | v3.0.5 |
| SpeechToText | 74 | |
| TextToSpeech | 64 | |
| FusedLocation | 52 | 차량별 상이 — `isSupported` 로 확인 |
| **LLM** | 45 | 존재한다. 내용 미확인 |

개발자 가이드 순서: Create Project & Request SDK Access → Set up → **Planning & Design** → Develop → Test → Register.
SDK 는 Maven `https://nexus-playground.pleos.ai/repository/maven-releases/` (샘플 저장소 서술 — 미확인).
에뮬레이터는 **VHAL 제공**, 최소 API 28.

## 2. NaviHelper SDK — 우리 핵심 연동 (확인됨)

출처: `/docs/pleos-only/connect-sdk-pleos/NaviHelper/{intro,destinations,waypoint-settings,routes,event-listeners,declaring-permissions,error-handling,initialization-and-release}`

- 패키지 `ai.pleos.playground.navi.helper.NaviHelper`. 순서: 생성 → `initialize()` → `addListener()` → API → `removeListener()` / `release()`.
- 기능: 목적지 설정·확인·취소, 경로 옵션 변경·재탐색, **경유지 추가·조회·삭제**, 경유지 포함 경로 요청, 이벤트 수신, 내비 화면 요청.
- **"You can specify up to two waypoints, distinguished by `WaypointIndex.FIRST` and `WaypointIndex.SECOND`."** → 슬롯 2개는 **확인된 사실**이다.
  `addWaypoint(RequestWaypointInfo)` · `removeWaypoint(index)` · `removeWaypoint(WaypointIndex.ALL)` · `getWaypointInfo()` → `onWayPointInfo()`.
- 목적지: `requestRoute(RouteInfo(lat, lon, poiName, poiId, address, routeOption))` · `getDestinationInfo()` → `onDestinationInfo` · `cancelRoute()`.
- 경로: `changeRouteOption(RouteOption.HIGHWAY …)` · `requestReRoute()`. *"활성 경로가 있을 때만 요청."*
- 콜백: `onRouteStarted` `onRoutingCompleted` `onRouteCancelled` `onReRouteEnded` `onRouteOptionChanged` · `onDestinationChanged` **`onDestinationArrived`** `onWaypointChanged` **`onWayPointArrived`** · `onBookmarkInfo` `onRecentDestinationInfo` **`onCurrentLocationInfo`** `onDestinationInfo` `onWayPointInfo` · `onError(NaviErrorCode)`.
- **"A successful call to `requestRoute()` does not mean the route search is complete. Confirm the final result in event callbacks."** → 우리 설계(요청 ≠ 성공, 콜백으로 확인)와 정확히 같다.
- 권한: `pleos.car.permission.NAVI_ROUTE`(get*Info, requestTrip) · **`NAVI_ROUTE_SEARCH`**(requestRoute, requestRouteWithWaypoints, cancelRoute, requestReRoute, **addWaypoint, removeWaypoint**, changeRouteOption) · `NAVI_CUSTOM_MAP`(requestNavigationScreen).
- 오류: `CAUSE_LOW_BATTERY` · `CAUSE_SEARCH_ROUTE_OVER_DISTANCE` · `CAUSE_SEARCH_ROUTE_TOO_SHORT_DISTANCE` · `CAUSE_SEARCH_ROUTE`.
- 호환성: **"Fully compatible only for vehicles equipped with navigation."**

## 3. Vehicle SDK — 도메인 19개 (확인됨)

출처: `/docs/pleos-only/connect-sdk-pleos/Vehicle/intro`, `api-compatibility-availability`

진입점 `Vehicle` → `getXxx()` 로 도메인 객체를 얻는다. 직접 생성하지 않는다.

| 도메인 | 무엇을 | v2 에서 쓰나 |
|---|---|---|
| **EvBattery** | 충전 상태·에너지 효율 | ✅ 핵심 |
| **HVAC** | 온도·풍량·습도 조회/제어 | ✅ 대기 소비 추정 |
| **Odometer** | 총 주행·**트립 거리·시간**·단위 | ✅ 주행 시간 (타이머 대체) |
| **DrivingMode** | 드라이브 모드·크루즈 | ✅ 효율 보정 |
| Brake | 브레이크 **페달** 상태만 (실물 jar 2026-10-26 — 주차 브레이크는 없다. AAOS `PARKING_BRAKE_ON`) | 쓰지 않는다 |
| Gear | 기어 선택 `getCurrentGearSelectionState`·`registerGearSelection` (`CAR_DRIVE`, 실물 jar) | ✅ 주차(P) 판정 — AAOS 와 둘 중 무엇을 쓸지 설명회 |
| Fuel | 연비 4종 + **연료 잔량 `getFuelPercent`(Int)** · `CAR_ENERGY` (실물 jar javap 2026-10-28, 11절) | MY CO-PILOT 전체 차량 대상의 입력 후보 — 실제 수신 미검증 · 연료 소비 모델 없음 → 아직 안 쓴다 |
| Safety | 차량 경고 | 표시만 |
| Tire | 타이어 상태 | 표시만 |
| CarInfo · Display · Door · Light · Seat · SideMirror · Steeringwheel · Toll · TurnSignal · Window · Wiper | — | 안 쓴다 |

- **"API support may vary depending on the vehicle model. Use the `checkXXXCapabilities` API for each domain."** → 모델명으로 분기하지 말고 capability 로 확인.
- **AAOS 정렬 원칙(Standard First)**: *"Speed, gear status, outside temperature, fuel level → AAOS Car API."* Pleos SDK 는 제조사 특화 기능만. → **속도·기어는 `CarPropertyManager` 로 읽는다.** 주행/정차 판정의 1차 신호가 여기다.

## 4. 화면 레이아웃 (확인됨) — v1 프레임을 폐기한 이유

출처: `/docs/connect/guide/docs-design/getting-started/layout`, `/docs/pleos-only/vehicle-app-planning-guide/app-structure-screen-model`

- 화면 = **Status bar**(주행 상태·Gleo AI·검색·시계·네트워크·마이크·알림·프로필) + **Driving view**(텔테일·속도·차량 상태, **운전자 쪽 고정, 앱이 숨기거나 끌 수 없다**) + **GNB**(앱 라이브러리·즐겨찾기·공조) + **Application window**.
- 앱 창은 **1개 또는 2개**. *"except landscape-only games, **all apps should be designed to adjust appropriately to both landscape and portrait**."*
- **portrait** = 창 하나(둘이 떠 있을 때의 기본). **landscape** = 한 앱이 두 창을 차지. *"portrait 에서 핵심 기능과 주요 정보, landscape 에서 확장 정보."*
- `screenOrientation` 미지정 → portrait 기본 + 창 1개. `landscape` 지정 → 창 2개 사용 가능.
- 시스템 UI(상태바·앱 라이브러리·공조 패널·키보드)가 **앱 위에** 겹친다.
- 디스플레이 종류: **Connect-S**(17 / 14.6 / 12.9인치) · **Connect-W**(와이드, 상태에 따라 세로 확장 = W-Extended) · **Connect-WF**(워터폴, 저해상도).
- 앱은 자주 백그라운드로 간다(분할·창 이동·다른 앱·주행 조건). *"사라졌다고 종료된 것이 아니다."* 포그라운드 복귀 시 상태 복원 + 창 크기에 맞게 재구성. 백그라운드에서는 타이머·폴링·네트워크 최소화.

→ **v1 의 16:9 단일 전체화면은 틀렸다.** 우리가 그릴 것은 시스템 셸 안의 **앱 창** 하나이고, 세로가 기본이다.

## 5. 주행 제한 — DO 를 선언하지 않으면 주행 중 사용 불가 (확인됨)

출처: `/docs/pleos-only/vehicle-app-planning-guide/driving-restiction-policy`, `app-category`, `driver-distraction-guideline`

- 제한은 **속도·기어·브레이크 신호 + 지역 규정**으로 걸린다.
- **"If the app does not declare Distraction Optimization (DO): Parking → Allowed, Drive → Not allowed."**
  → 주행 중 화면을 내려면 **DO 선언**이 전제이고, 그러면 `CarUxRestrictions` 플래그를 지켜야 한다:
  `NO_KEYBOARD(8)` `NO_DIALPAD(1)` `NO_FILTERING(2)` `NO_SETUP(64)` `NO_VIDEO(16)` `LIMIT_CONTENT(32)` `LIMIT_STRING_LENGTH`.
  (키보드·검색/필터·설정·영상이 주행 중 막힌다. 지역별 표가 따로 있다 — 북미·유럽·기타.)
- 앱 카테고리: Maps/Navigation · **Mobility Services** · Lifestyle · Entertainment · Business · Music/Audio · Kids · Social.
  **Mobility Services 의 주행 중 제한적 허용 예시에 명시된 것**:
  *"Finding EV charging stations and setting them as waypoints"* · *"Immediate information based on the current location"* · *"Checking the locations of parking lots accessible while driving"*.
  → **v2 가 이 카테고리의 허용 범위 안에 정확히 들어간다.** 이게 v2 를 고른 가장 큰 플랫폼 근거다.
- 운전자 주의 분산 원칙: 영상·애니메이션 최소 · 첫 화면에 자주 쓰는 기능 · 드롭다운/다단 메뉴 지양 · **텍스트 입력 최소 — 프리셋·최근 항목·음성 우선** · 큰 터치 타깃·고대비·최소 텍스트.
  → 우리 "프리셋 모드 → 조건 → 후보 3개" 구조가 이 원칙 그대로다.

## 6. 아직 못 본 것 (다음에 확인)

- Vehicle 도메인별 **메서드 시그니처**와 capability 확인 코드 (Dokka — JS 렌더라 curl 로 안 읽힌다. 에뮬레이터 + Android Studio 에서 본다)
- LLM SDK 가 무엇을 하는지
- DO 선언 **절차**(매니페스트? 마켓 심사?) — 설명회 질문
- App Market 등록·심사 흐름

## 7. 디자인 시스템 — 토큰·타이포·창 px (확인됨 2026-10-24)

출처: `/docs/connect/guide/docs-design/foundations/{colors,typography,shadow,animation}`,
`components/{actions/basic-button,actions/icon-button,toast,indicator}`, `getting-started/{layout,window}`,
`Introduction/theme`. **값은 전부 그림(PNG/SVG) 안에만 있다** — 본문에는 토큰 이름 목록뿐이라
그림을 내려받아 읽었고, 창 px 는 레이아웃 SVG 의 사각형 좌표를 재서 얻었다
(`pleos_connect_deisgnguide_displaylayout_03.svg`, Connect-W 가 1:1 px 로 그려져 있어 기준이 됐다).

### 7.1 창 치수 — Connect-S 17" (기본값) = **2560 × 1440**

| 영역 | px | 비고 |
|---|---|---|
| 화면 | 2560 × 1440 | 16:9. 14.6"·12.9" 도 16:9 (레이아웃 동일, 밀도만 다름) |
| Status bar | 높이 **96** | 상단 전체 폭. 시계는 오른쪽 |
| Driving view | 폭 **840** | 왼쪽. 앱 창과 사이 여백 없음 (840 에 포함) |
| App window (landscape, 1개) | **1700 × 1184** · x=840 y=96 | 오른쪽 여백 20 |
| App window (portrait, 2개) | **840 × 1184** ×2 · 사이 **20** | x=840, 1700 |
| GNB | 높이 **160** | 아이콘 84×84, 간격 44 |
| 창 모서리 | ≈ 24 | 그림에서 어림 (명시 없음) |

→ 세로 창은 **840:1184 ≈ 0.709** (약 5:7), 가로 창은 **1700:1184 ≈ 1.436**.

**공식 확인(폼 팩터 테스트 가이드 `/docs/pleos-only/app-test-guide/form-factor-test-guide`, FormFactorConsole 프리셋 그림):**

| 프리셋 | DPI | 화면 px | 앱 창 (dp) |
|---|---|---|---|
| Connect-S 17" (기본) | 160 | 2560 × 1440 | 세로 **840 × 1184** (1dp = 1px) |
| Connect-S 14.6" | 200 | 2048 × 1152 | 가로 1360 × 948 dp = 1700 × 1185 px |
| Connect-S 12.9" | 160 | 1920 × 1080 | 세로 628 × 855 |
| Connect-WS 24.6" | 160 | 3840 × 850 | — |
| Connect-WE 24.6" | 160 | 3840 × 1440 | — |
| Connect-WF 18.7" | 200 | 3072 × 816 | — |

위에서 SVG 좌표로 잰 840×1184 가 공식 프리셋의 dp 값과 **정확히 같다.** 14.6" 은 DPI 가 200 이라
px 는 다르지만 dp 레이아웃은 같은 비율로 축소된다(1700×1185px). 시연 셸은 17" 기준이 맞다.

창 정책(`window`): 2개 실행 시 1:1, 1개면 2:0(기본 1:1). 새 앱은 **이전 앱과 같은 orientation** 으로
뜬다 — 가로 앱이 떠 있으면 새 앱도 가로, 세로 둘이면 primary 자리에 세로. 사라진 앱은 종료가 아니다.
내비는 종료 불가(기본 앱). 3핑거 스와이프/윈도 바로 위치·크기 변경.

### 7.2 색 — Basic(그레이스케일 11단계)

| 토큰 | Light | Dark |
|---|---|---|
| basic_00 | #FFFFFF | #131417 |
| basic_50 | #F7F8FA | #1D1E21 |
| basic_100 | #EDEEF2 | #313236 |
| basic_200 | #E0E1E6 | #44464E |
| basic_300 | #C7C9CE | #686A72 |
| basic_400 | #A4A8AE | #A4A8AE |
| basic_500 | #686A72 | #C7C9CE |
| basic_600 | #44464E | #E0E1E6 |
| basic_700 | #313236 | #EDEEF2 |
| basic_800 | #1D1E21 | #F7F8FA |
| basic_900 | #131417 | #FFFFFF |

Alpha: `basic_alpha_light_{50,100,200,300,400,500}` = Light 테마에선 **#131417** 5/10/20/30/40/50%,
Dark 테마에선 **#FFFFFF** 같은 %. `basic_alpha_dark_*` 는 반대(Light=#FFFFFF, Dark=#131417).
Static(테마 무관): `static_light_{100..400}` = #FFFFFF 100/84/64/32% · `static_dark_{100..400}` = #131417 100/84/64/32%.

### 7.3 색 — System (의미 토큰 → Basic 매핑)

| 토큰 | Light | Dark |
|---|---|---|
| background_primary | basic_50 | basic_50 |
| background_secondary | basic_00 | basic_00 |
| background_popup | basic_00 | basic_100 |
| surface_basic | basic_00 | basic_50 |
| surface_low | basic_50 | basic_00 |
| surface_high | basic_100 | basic_100 |
| surface_accent | basic_200 | basic_200 |
| text / icon _primary | static_dark_100 | static_light_100 |
| text / icon _secondary | static_dark_200 (84%) | static_light_200 |
| text / icon _tertiary | static_dark_300 (64%) | static_light_300 |
| text / icon _quaternary | static_dark_400 (32%) | static_light_400 |
| button_basic_enabled / pressed / disabled | alpha_dark_50 / alpha_dark_100 / alpha_light_200 | 같음 |
| button_filled_enabled / pressed / disabled | basic_600 / basic_700 / alpha_dark_50 | basic_600 / basic_500 / alpha_dark_50 |
| button_switch_enabled / pressed / disabled | basic_00 / alpha_light_500 / alpha_light_300 | alpha_dark_200 / 200 / 300 |
| dim_dark_primary / secondary / tertiary | alpha_dark_50 / 100 / 200 | 같음 |
| dim_light_primary / secondary / tertiary | alpha_light_500 / 400 / 300 | 같음 |
| informative_active | #02C265 | #00E074 |
| informative_positive | **#0064FF** | **#0082FF** |
| informative_negative | #FE3D16 | #FF4C28 |
| informative_autonomous_driving | #5A46FA | #6A57FF |
| charging_normal | #00DB25 | #00DB25 |
| charging_deep | #00B975 | #0082FC |
| gearshift_background | basic_900 | basic_100 |

주의: button_basic 의 dark 값(alpha_dark_50 = #131417 5%)은 어두운 배경 위에서 거의 보이지 않는다.
공식 Dark 샘플(Genesis 테마)에서도 기본 버튼은 **surface_high 톤**으로 보이므로 시연은 그 톤을 쓴다.
테마는 브랜드별(42dot/Kia/Genesis)로 바뀌지만 **구조와 토큰 이름은 같다.**

### 7.4 타이포 — **Asta Sans** (Google Fonts, 한/영, 300–800)

공식 폰트는 Pretendard 가 아니라 **Asta Sans** 다 (`fonts.google.com/specimen/Asta+Sans`).
최소 12sp, 실제 글자 높이 18px 이상, 캐릭터 강한 서체 지양. 단위는 **2560 화면 기준 px**.

| 계층 | Large | Medium | Small | 굵기 |
|---|---|---|---|---|
| Headline | 60/80 | 56/72 | 48/64 | ExtraBold·Bold |
| Title | 40/52 | 36/44 | 32/40 | ExtraBold·Bold·Regular |
| Body | 30/38 | 28/36 | 26/34 | Strong·Normal |
| Label | — | 24/28 | 20/24 | Normal |

(크기/행간). 시연 셸은 창 폭에 비례하는 단위 `--u`(= 1 car-px)로 이 값을 그대로 쓴다.

### 7.5 그림자 · 컴포넌트 규격

- Shadow L1: 0 6 24 / #000 8%. L2: 0 8 32 16% + 0 2 2 8%. L3: 0 20 40 24% + 0 2 4 20%.
- Animation: Linear(정적 로딩) · Tension(긴 로딩).
- **Basic button**: Root + Label + Prefix/Suffix icon. 상태 Pressed·Disabled·Loading(스피너, 제어 불가).
  Hierarchy **Primary = basic(연한 면)**, **Secondary = filled(짙은 면·흰 글자)**. Size Large·Medium. 모서리 큰 라운드.
- **Icon button**: Style Basic·Plain·Circle, Size L·M·S. Basic 은 정사각 라운드 면.
- **Toast**: 앱 패널 **하단 중앙**, side padding 24 · bottom 24, 전체 max 792 · 글자 max 712,
  내부 padding 좌우 40 · 상하 24, 짙은 면(#313236 급) + 흰 글자, 큰 라운드.
- **Indicator**: Present / Prev·Next 값, Size Wide·Narrow.

## 8. 2026-10-19 릴리즈 노트 · 에뮬레이터 · 그 밖에 확인한 것 (2026-10-24)

출처: `/docs/pleos-only/release-note/{sdk-261015,emulator-261015,playground-261015}`,
`/docs/pleos-only/app-test-guide/{virtual-console-guide,form-factor-test-guide}`.

**Vehicle SDK v2.3.2** — 우리 축 ① 에 직접 닿는다.
- 신규: `getCurrentEvEfficiency`(EV 효율) · `registerEvBatteryStateOfCharge`(잔량 구독) · `checkVINInfoCapabilities` · 모델 `TripStatistics`, `CapabilityConfig`.
  → 에너지 추정의 기준 소비율을 **차량 효율값**으로 바꿀 수 있는 API 가 있다 (`efficiencyKwhPer100km` 자리).
- 삭제: **`VehicleSpeedListener`** (onSpeedUpdated). 속도는 Vehicle SDK 가 아니라 AAOS Car API 로 — "Standard First" 와 일치. 설계 그대로.
- Breaking: `CruiseControl` 상수 교체, `checkHvacFanSpeedCapabilities` 반환형 `AreaBounds<Int>`, `FanDirectionType` 8개로 확장.
- Deprecated: `getCRNInfo` → `getVINInfo`.

**NaviHelper v3.0.5** — Breaking 셋. 어댑터 한 곳에서 흡수한다 (core/Ports.kt 주석).
- `onNavigationStatus` 인자 `RouteDriving → NavigationStatus`
- 데이터 모델 좌표 순서 **`(longitude, latitude) → (latitude, longitude)`** — BookmarkInfo·CurrentLocationInfo·DestinationInfo·RequestWaypointInfo·WaypointInfo 등
- `DestinationInfo/WaypointInfo`: `totalDistance/totalTime → remainDistance/remainTime`

**Pleos Connect Emulator v2.1.0 + Virtual Console** — 설명회 질문 3 의 답이 거의 나왔다.
- Emulation Controls 도메인: Vehicle · Motion(Gear P/R/N/D · Brake · **Odometer**) · ADAS · Convenience · Safety ·
  **Energy(Remaining Range · Battery Energy kWh · Battery SOC % · Capacity kWh · Charge limit/switch/port)** ·
  **Climate(HVAC Power/Auto/Dual · Fan Speed · Target Temperature · Seat Temperature)**.
  → EvBattery·HVAC·Odometer 값을 전부 콘솔에서 바꿀 수 있다. **외기온 카드는 목록에 안 보였다** — 설명회에서 확인.
- 폼 팩터 테스트: AVD + Host Display Bridge(Go 1.22) + FormFactorConsole 로 가상 DISPLAY2 를 만들어 프리셋·방향별 확인. 포트 8095/8096.
- 에뮬레이터 그래픽 **최소 RTX 3060 Laptop 6GB / RX 6600M 8GB** (`configure-pleos-connect-emulator`). 이 PC 는 GTX 1660 SUPER 6GB 라 기준 미달 — 돌아갈지 장담 못 한다.
- 삭제: **LLM SDK 제공 종료**(Gleo Interface 로 대체) · CRN · Bluetooth 동글.

**LLM SDK** — 종료됐으므로 더 볼 것 없음. 남은 API 흔적: `LLM` 클래스 · `Mode { ON_DEVICE, SERVER }` · `LLMContent(role, parts)` · `ModelParameter { MAX_TOKENS, MODEL_NAME, TEMPERATURE }` · `ResultListener.onResponse/onError`. 설명문 다듬기에 쓰지 않는다 — 규칙 문장으로 간다.

**App Market** — 공개 목록 없음. 오너 매뉴얼(`ownersmanual.hyundai.com/ivi/Connect-S/...`)은 "지도/내비게이션 · 모빌리티 서비스 · 엔터테인먼트 등" 카테고리와 **"앱 마켓 앱은 주행 중 사용 불가 — 정차 후 P"** 만 적는다. "18종"·"Make My Day" 는 전해 들은 것으로 남는다.

**2026-10 내비 업데이트(Gleo AI 경로상 장소 검색)** — 웹에서 원문을 찾지 못했다(2025-04 온라인 내비·Knowledge Agent 기사까지만). 전해 들은 것 그대로 두고 설명회에서 묻는다.

## 9. 실물 SDK 에서 확인한 것 (javap · 컴파일러, 2026-10-25)

SDK 는 **누구나 받을 수 있는 공식 공개 Maven 저장소**에 있다: `https://nexus-playground.pleos.ai/repository/maven-releases/`
(좌표는 공식 문서 `/docs/pleos-only/connect-sdk-pleos/Vehicle/project-setup`). `scripts/fetch-pleos-sdk.sh` 가 받아 `.sdk/` 에 푼다.

| 아티팩트 | 최신 | 비고 |
|---|---|---|
| ai.pleos.playground:Vehicle | 2.3.2 | 2.0.3 도 있음 |
| ai.pleos.playground:NaviHelper | 3.0.5 | → navi-data 3.0.4 · navi-aidl 3.0.1 · kotlinx-coroutines-android 1.6.3 |
| ai.pleos.playground:TextToSpeech | 3.3.1 | |
| ai.pleos.playground:FusedLocation | 1.1.3 | |
개발 환경(공식): minSdk 28 · Gradle 8.0+ · Java/Kotlin · 에뮬레이터 이미지 API 34 (Pleos Connect v2.1.0).

**NaviHelper (클래스 `ai.pleos.playground.navi.helper.NaviHelper(Context)`)** — 공개 메서드:
initialize() / initialize(onReady, onFail) · release · addListener/removeListener(NaviHelperEventListener) · requestRoute(RouteInfo) ·
requestRouteWithWaypoints · cancelRoute · **addWaypoint(RequestWaypointInfo)** · **removeWaypoint(WaypointIndex)** · changeRouteOption ·
requestReRoute · getBookmarkInfo · getRecentDestinationInfo · **getRouteStateInfo** · getCurrentLocationInfo · getDestinationInfo ·
**getWaypointInfo** · getTBTInfo · **getChargerOperatorInfo** · requestNavigationScreen · requestTrip(TripRequest).

리스너는 26개 콜백이 전부 default(필요한 것만 구현): onRouteStarted · onRouteEnded · onRoutingCompleted · onReRouteEnded ·
onRouteOptionChanged · onRouteCancelled · **onWaypointChanged(WaypointChangedInfo)** · onDestinationArrived · **onWayPointArrived(WaypointArrivedInfo)** ·
onError(NaviErrorCode) · onCurrentLocationInfo · **onRouteStateInfo** · onDestinationInfo · onWayPointInfo(List<WaypointInfo>) ·
onCurrentRoadSpeedLimit(Int) · onCameraAlert · **onDrivingInfo(DrivingInfo)** · onNavigationStatus · onTBTInfo · **onChargerOperatorInfo(List<ChargerOperator>)** ·
onCautionPointInfo · **onTripInfo(TripInfo)** 등.

데이터:
- `RequestWaypointInfo(latitude, longitude, poiName, waypointIndex, poiId, address, poiSubId, poiProvider=기본값)` — **poiId · address · poiSubId 필수** (문서 예시엔 없었다. 컴파일러가 잡았다)
- `WaypointIndex { FIRST, SECOND, ALL }` · `WaypointChangedInfo(index, cmdType: WaypointCmdType{ADD, REMOVE}, routeStartInfo)` — 추가 확인은 cmdType=ADD + index
- `WaypointArrivedInfo(duration, distance, index, name, address)` · `WaypointInfo(name, address, lat, lon, …, remainDistance, remainTime, poiId, …)`
- `NaviErrorCode { CAUSE_LOW_BATTERY, CAUSE_SEARCH_ROUTE_OVER_DISTANCE, CAUSE_SEARCH_ROUTE, CAUSE_SEARCH_ROUTE_TOO_SHORT_DISTANCE, CAUSE_SEARCH_TRIP }`
- **`RouteStateInfo(…, isRouting, routeOption, remainDestinationChargingInt, remainWaypointChargingInt: List<Int>, trafficStatus)`** — 내비가 목적지·경유지 도착 잔량을 예측한다
- **`DrivingState(name, duration, distance, remainDestinationChargingValue, isChargingStation, isRecommendedChargingStation, maxChargingPower, targetSoc, chargerCount, chargingPlan)`** · **`ChargingPlan(duration, startSoc, endSoc)`** — 내비가 EV 경로의 **충전 계획**(추천 충전소·목표 SOC·충전 시간)을 세운다
- **`TripInfo(distance, eta, estimatedSocAtDest, energyConsumption, summary)`** — requestTrip 결과
- `ChargerOperator(id, name)`

**→ 제품 판단에 주는 의미.** Pleos 내비는 **주행 구간의 도착 잔량 예측과 충전 계획을 이미 한다.** 쉼표 DRIVE 는 그것을 다시 만들지 않는다.
주행 구간은 내비 예측(`remainDestinationChargingInt`)을 기준값으로 쓰고(엔진에 `naviArrivalSocPct` 로 반영, 오차 가정 ±5%),
우리는 그 **뒤** — 도착 후 대기·귀가(왕복) · 동승자 조건 · 실시간 재판단 · 만약에 비교 — 를 더한다. 단위(%)는 에뮬레이터에서 확인.

**Vehicle (`Vehicle(Context)` → getEvBattery · getHVAC · getOdometer · getDrivingMode · getGear · getTire · getFuel …)**
- EvBattery: getEvBatteryStateOfCharge(Int) · **registerEvBatteryStateOfCharge** · getEvBatteryLevel(Float) · getEvBatteryCapacity(Float, **deprecated → AAOS INFO_EV_BATTERY_CAPACITY**) ·
  효율 4종 **Instantaneous · SinceCharge · Cumulative · Current** (get/register, Float — 단위 미확인) · 충전 제한·포트·스위치 set/get · check…Capabilities(CapabilityConfig)
- 모든 리스너가 `VehicleListener.onFailed(Exception)` 을 구현해야 한다 (문서 예시엔 없었다. 컴파일러가 잡았다)
- Odometer: getRangeRemainingDistance · getTripCurrentDrivingTime(Int) · getTripCurrentDrivingDistance(Float) …
- HVAC: check/get/setHvacAuto · HvacPower 등 (좌석 영역별)
- `EvBatteryDisplayUnit { WATT_HOUR, AMPERE_HOURS, KILOWATT_HOUR }`

**컴파일 검증.** `adapters/` 의 PleosNavigationProvider · PleosVehicleStateProvider 가 위 실물 jar + android.jar(API 34) 에 대고
**컴파일 통과**(2026-10-25). 남은 것은 에뮬레이터에서 **실행**해 콜백이 실제로 오는지 보는 것.

## 10. Android 앱으로 확인한 것 (2026-10-25)

출처: 공식 공개 Maven 의 AAR(`AndroidManifest.xml` · `javap -v` 의 `@RequiresPermission`) · 공식 문서 `TextToSpeech/{intro,declaring-permissions,importing-sdk,initialization-and-release}` · 실기기 logcat.

| 확인한 것 | 내용 |
|---|---|
| Vehicle 권한 | `EvBattery` 의 잔량·효율 조회/구독 = `pleos.car.permission.CAR_ENERGY`, 쓰기 = `CONTROL_CAR_ENERGY`, 용량 = `CAR_INFO`. `VEHICLE_BINDING` 은 SDK 매니페스트가 합쳐 넣는다 |
| TextToSpeech | 진입점 `TextToSpeech(context, Mode)` · `initialize(OnInitializeListener)` · `speak(text, Boolean)`. 권한 `pleos.car.permission.TTS_SERVICE`. **ON_DEVICE 는 네트워크·앱 등록 불필요**, HYBRID(기본)·SERVER 는 Playground My Project 자격 증명으로 앱 등록 필요 |
| 서비스 패키지 | SDK 는 `ai.pleos.playground.service.vehicle/.VehicleService`(action `ai.pleos.playground.vehicle.VEHICLE_START`) · `ai.pleos.playground.service.navi/.NaviService`(action `…intent.action.NAVI_START`)에 바인딩한다. 없으면 0.5초 간격 30회 재시도 후 "Connect Service is Failed" |
| 의존성 | NaviHelper 3.0.5 → navi-data · navi-aidl · core-ktx 1.8 · coroutines-android 1.6.3. Vehicle 2.3.2 → vehicle-aidl 1.1.1 · vehicle-data 1.1.11 · kotlin-reflect · gson. TTS 3.3.1 → universal-access 0.6.0 · gson. 모두 minSdk 23 |

일반 폰에서는 바인딩이 실패해 앱이 시연 모드로 물러난다 — 실기기에서 크래시 없이 확인했다. **에뮬레이터에서 실제로 붙는 것은 아직 확인 전이다.**

## 11. 차량 제어 도메인 — 조회와 제어 권한이 나뉜다 (javap, 2026-10-26)

출처: 공식 공개 Maven `ai.pleos.playground:Vehicle:2.3.2` 의 `Vehicle.jar` — `javap -v` 로 각 API 클래스의 `@RequiresPermission` 을 읽었다.
MY CO-PILOT 통합안(출발 준비·하차 지원)이 쓰려는 도메인이다. **SDK 에 메서드가 있다는 것까지가 확인이다** — 서드파티 앱에
`CONTROL_*` 권한이 실제로 허용되는지, 주행 중에 막히는지는 미확인(설명회 질문 10).

| 도메인 | 조회 (권한) | 제어 (권한) |
|---|---|---|
| HVAC | `getHvacTemperature(SeatArea, TemperatureUnit)` 등 · `CAR_CLIMATE` | `setHvacTemperature` · `setHvacPower` · `setHvacAuto` · `setHvacFanSpeed` … (좌석 영역별, 콜백으로 적용 값 반환) · `CONTROL_CAR_CLIMATE` |
| Door | `getDoorLockState` · `getCurrentDoorPosition` · `registerDoorPosition` · `DoorLockStateListener` · `CAR_DOORS` | `setDoorLock` · `setDoorPosition` · `setGloveBoxLock` · `CONTROL_CAR_DOORS` |
| Seat | 위치·각도 `check…Capabilities` · `CAR_SEATS` | `setHvacSeatTemperature` · `setHvacSeatVentilation` 등 · `CONTROL_CAR_SEATS` |
| Light | 상태 조회 · `CAR_LIGHTS` | `setCabinLightSwitch` · `setReadingLightSwitch` · 전조등·안개등 … · `CONTROL_CAR_LIGHTS` |
| Gear | `getCurrentGearSelectionState` · `registerGearSelection` (`VehicleGear`: PARK·DRIVE·REVERSE·NEUTRAL·UNKNOWN·1~9) · `CAR_DRIVE` | — |
| Brake | `getCurrentBrakePedalStatus` · `registerBrakePedalStatus` — **페달만**. 주차 브레이크 API 는 없다 · `CAR_DRIVE` | — |

- 모든 set 은 `(값, onSuccess(영역, 적용 값), onFailed(Exception))` 모양이다 — 요청 결과를 콜백 값으로 확인할 수 있다(`src/lib/assistant/gate.ts` settleControl).
- 기어는 Vehicle SDK 에도 있다. "속도·기어는 AAOS Car API"(Standard First, 3절)와 겹친다 — 어느 쪽을 쓰라는 것인지 설명회에서 묻는다.
- 3절 표의 "Brake = 주차 브레이크"는 틀렸다 — 이 날 고쳤다. 주차 판정은 기어(P) 또는 AAOS `PARKING_BRAKE_ON`.
- **기어는 AAOS 로 읽으라는 것이 SDK 의 답이다.** `Gear.registerGearSelection` 에 `@Deprecated("This API is deprecated, use the Google GEAR_SELECTION property.")` 가 붙어 있다
  (`copilot-adapters/` 컴파일 경고, 2026-10-26). `GearSelectionListener.onSelected` 인자는 널 허용.
- HVAC 은 **설정 온도**(`getHvacTemperature` · `registerHvacTemperature`)와 **실내 현재 온도**(`getHvacTemperatureCurrent`)가 따로다. `HvacTemperatureValueListener.onHvacTemperatureUpdated(Float?, Float?)` 두 인자의 단위 순서는 문서로 확인 못 했다.
- 도어 범위 조회 `checkDoorPositionCapabilities(Map 만 주는 것)` 은 deprecated — `CapabilityConfig` 를 함께 주는 쪽을 쓴다. 위치 값(Int)의 뜻(최솟값 = 닫힘?)은 미확인.
- AAOS(android.car.jar, API 34): `CarUxRestrictions.isRequiresDistractionOptimization` · `VehiclePropertyIds.PERF_VEHICLE_SPEED(m/s)·GEAR_SELECTION·PARKING_BRAKE_ON` · 권한 `android.car.permission.CAR_SPEED`·`CAR_POWERTRAIN`.
- **Fuel · CarInfo (javap 2026-10-28, 같은 `Vehicle-2.3.2.aar`)** — 전체 차량 대상(오너 결정 2026-10-28)의 근거 조사:
  - `Fuel`: `getFuelPercent(Int)` · `checkFuelPercentCapabilities` · 연비 4종 `Instantaneous/SinceCharge/Cumulative/Current`(Float, get/register/check…Capabilities) — 전부 `pleos.car.permission.CAR_ENERGY`(EvBattery 와 같은 권한). **API 는 있다. 실차·에뮬레이터에서 값이 오는지, 단위(%·km/L?)는 미검증.** Virtual Console 에 Fuel 카드가 있는지도 미확인(8절 카드 목록에 없었다).
  - `CarInfo`: `getVINInfo` · `getCRNInfo`(`CAR_INFO`) · `getCapabilityInfo`(**`PRIVATE_CAR_INFO`** — 서드파티용이 아닐 가능성) 뿐. **동력원(EV/HEV/ICE) 필드는 없다** → 동력원 판별은 모델명이 아니라 `checkEvBatteryCapabilities`·`checkFuelPercentCapabilities` 의 capability 로 하는 것이 SDK 원칙("Use the checkXXXCapabilities API")에 맞다 — 미검증 가설.
- **운전자 프로필 · 디지털 키 · Seat · Light (javap 2026-10-28, MY CO-PILOT 개인화 조사)**:
  - Vehicle · NaviHelper · TextToSpeech · aidl/data 전 모듈의 클래스 목록에 profile / digitalkey / driver / account / media **없음** → 운전자 자동 인식·차량 운전자 프로필 읽기는 공개 SDK 로 **불가**. 운전자는 앱에서 수동으로 고른다.
  - `Seat`: `getHvacSeatVentilationState / setHvacSeatVentilation` · `getHvacSeatTemperature / setHvacSeatTemperature`(이름은 2026-10-29 어댑터 컴파일로 정정 — `getSeatVentilation` 이 아니다) · `registerSeatOccupancy`(착석 감지) · 위치 API 다수(ForeAft·Height·Tilt·Lumbar·Headrest…) — 조회 `CAR_SEATS` · 제어 `CONTROL_CAR_SEATS`. 에뮬레이터에서 조회·통풍 set 확인(12절) · 실차·App Market 의 서드파티 제어 허용은 미검증. 착석 감지는 동승자 자동 감지에 **쓰지 않는다**(정책 6).
  - `Light`: `getCabinLightSwitch / setCabinLightSwitch · registerCabinLightState`(`CAR_LIGHTS` / `CONTROL_CAR_LIGHTS`) — **스위치뿐**, 분위기(색·밝기) 값은 없다. 핸들 열선 API 는 없다. 미디어 API 는 없다.
- **Gleo Interface 의 App Schema·"액션 함수 최대 3개"** 는 여기서 확인하지 않았다 — 8절의 "LLM SDK 종료 · Gleo Interface 로 대체" 까지만 확인. 통합안 문구는 전해 들음이다.

## 12. Pleos Connect Emulator 를 이 PC 에서 실행해 확인한 것 (2026-10-29)

출처: 직접 실행(`docs/my-copilot/EMULATOR-RESULT-2026-10-29.md`) + 공식 문서 `https://document.pleos.ai/en/docs/connect/guide/getting-started/application-development/{setup-connect-sdk-emulator,configure-pleos-connect-emulator,use-vehicle-emulator}` · `https://document.pleos.ai/en/docs/pleos-only/app-test-guide/virtual-console-guide`(2026-10-29).

| 확인됨 | 비고 |
|---|---|
| 시스템 이미지는 **공개 저장소**(로그인 없음): `https://nexus-playground.pleos.ai/repository/raw-releases/connect-avd/2.x/crp-sys-img.xml` → 패키지 `system-images;android-34;pleos_car_emulator;x86_64`(revision 2, zip 4.09GB, 설치 19GB, 42dot SDK License) · 기기 프로필 `Pleos Connect v2.1.0`(2560×1440 · 160dpi · android-automotive) 동봉 | Android Studio 없이 `sdkmanager`/`avdmanager` 로 됐다 |
| 공식 요구 사양 페이지는 **GPU 만** 적는다(최소 RTX 3060 Laptop 6GB / RX 6600M 8GB · 권장 RTX 4060/5060 Laptop 8GB). GTX 1660 SUPER 6GB 에서 에뮬레이터 자체 검사 통과 · 부팅 104초 | 8절의 "기준 미달이라 돌아갈지 장담 못 한다"는 **정정** |
| 콜드 부트 필수(퀵 부트면 VHAL 사용 불가) · 기본 언어 한국어 · Bluetooth 동글 미지원 | configure 페이지 |
| 빌드 `Pleos/crp_avd/crp_avd_x86_64:14/RELEASE.release_connect_v2.1.0` · Android 14 · `android.hardware.type.automotive` | |
| Virtual Console = 에뮬레이터 안의 웹 서버(`adb forward tcp:8088 tcp:8088` → `http://127.0.0.1:8088/`) · 페이지 하트비트 `POST /browser/session?client=` 가 있어야 쓰기 가능 · `GET /vehicle/catalog`(8 도메인 63 기능) · `POST /vehicle/hvac?driver_temp=` 등 | REST 는 페이지 소스에서 읽은 비공식 |
| 콘솔 카드: Climate(Target Temperature 16~30 · 0.5 · **Seat Temperature V3~V1/Off/H1~H3** · Fan 0~8 …) · Motion(Gear · Brake · Odometer · Steering Angle · **Steering Wheel Heat Off/Low/Medium/High**) · Energy(SOC % · Capacity kWh · Range m …) · Convenience(Door · **Seat Occupancy** · **Ambient Brightness/Color** · Cabin/Reading Lights …) · ADAS(Cruise Target Speed) | **없음**: 차량 속도 · 외기온 · 연료 · 주행 제한(UX) 카드 |
| 앱에서 받은 값: `EV_BATTERY_SOC` 콜백 **%**(콘솔 40 ↔ 40) · `INFO_EV_BATTERY_CAPACITY` **77400.0 = Wh** · `HVAC_TEMPERATURE_SET` 운전석(area 1) **24.0 °C Float**, 조수석(area 4) 22.0 · 변경 콜백 `onChangeEvent … 23.0` · `DOOR_POS` 4문 0 · `DOOR_LOCK` 콜백 영역 85(0x55) — `getDoorLockState(ROW_1_LEFT)` 는 **onFailed "area 0x1 not supported"** · NaviHelper 서비스 3.0.4 · TTS ON_DEVICE 연결 · `getCurrentEvEfficiency` 콜백 **없음** | 효율·단위는 여전히 미확인 |
| 권한: `CAR_ENERGY`·`CAR_INFO`·`NAVI_ROUTE`·`NAVI_ROUTE_SEARCH`·`TTS_SERVICE`·`CAR_CLIMATE`·`CAR_DOORS` 설치 시 허용 · AAOS `CAR_POWERTRAIN` 허용 · **`CAR_SPEED` 거부**(granted=false, `PERF_VEHICLE_SPEED` 가 CarPropertyConfig 에 없다고 나옴) | `CONTROL_*` 는 선언하지 않아 미확인 |
| **2차 실행(같은 날, RESULT §6)** — `pm list permissions -f`: `pleos.car.permission.CAR_*`·`CONTROL_CAR_*`·`PRIVATE_CAR_*`(vehicle 서비스) · `NAVI_*`·`TTS/STT/LLM_SERVICE`(navi·caas) · `ADAS_*` 조회 전부 **protectionLevel normal** · `CONTROL_ADAS_PARKING`·HID·PIN·Wi-Fi 는 signature\|privileged · `FUSED_LOCATION` dangerous · AAOS `CAR_SPEED` **정의 없음** | 에뮬레이터 이미지 기준. 실차·App Market 심사 미확인(설명회 질문 10) |
| 시트: `getHvacSeatTemperature` Int **음수 = 통풍(V1 → -1, V2 → -2) · 0 = 끔 · 양수 = 열선** · `getHvacSeatVentilationState` Int 0/양수(앱이 1 을 set 하면 1) · `registerHvacSeatTemperature` 변경 콜백 옴 · 콘솔 Seat Temperature 카드는 시트 온도 한 축만(통풍 속성 카드 없음) | AAOS `HVAC_SEAT_TEMPERATURE`/`HVAC_SEAT_VENTILATION` 정의와 같다 |
| 도어 잠금 조회·구독은 **4문 합친 영역**(`DoorArea(ROW_1_LEFT, ROW_1_RIGHT, ROW_2_LEFT, ROW_2_RIGHT)` = 0x55)으로 된다 — 운전석 하나(0x1)는 "area not supported" | |
| 제어: `HVAC.setHvacTemperature(운전석, 22/23, CELSIUS)` → 콜백 `(area, 22.0/23.0)` → 리스너 재조회 같은 값 → **Pleos 셸 하단 공조 바와 Virtual Console 상태가 함께 바뀜** · `Seat.setHvacSeatVentilation(운전석, 1)` → 콜백 1 → 재조회 1 | 서드파티 앱(`CONTROL_CAR_CLIMATE`·`CONTROL_CAR_SEATS` 선언, 설치 시 허용)에서. 열선 set·HVAC 전원 set 미실행 |
| 기어 `POST /vehicle/gear?gear=Drive/Park` → AAOS `GEAR_SELECTION` 콜백으로 앱 화면 전환(E4) | |
| (3차) `Seat.setHvacSeatTemperature(운전석, 1)` → 콜백 1 → 리스너 재조회 1 · 콘솔 `seat_mode: Heating` · 셸 시트 아이콘 열선 표시 — 열선 set 도 에뮬레이터에서 됨 | 실차 · 단계 2·3 |
| (3차) `HVAC` 에 `setHvacPower(SeatArea, Boolean, …)` · `getHvacPowerState` · `registerHvacPowerState(HvacPowerStateListener)` 있음(javap 2026-10-29) | 실행(앱 경로 미구현) |
| (3차) 출품 앱 NaviHelper: 목적지 없는 상태의 `addWaypoint` 는 10초 안에 `onWaypointChanged` 없이 **내비 앱이 검색 화면으로 앞에 나온다**. `getRouteStateInfo` 는 목적지 없을 때 남은 거리 0 | 목적지 있을 때의 ADD 콜백 · `remainDestinationChargingInt` 단위 |
| (3차) 셸 정상 배치: 왼쪽 Driving view(차량 그림 · 0 km/h · P R N D) + 오른쪽 앱 창(가로 한 창) — 내비 앱을 `pm disable` 하면 `ai.umos.homescreen` 이 ActivityNotFoundException 으로 무한 크래시하고 앱 창이 왼쪽 전체로 가는 비정상 배치가 된다 | 세로·분할 창 |
| 운영: 호스트 여유 메모리 1GB 안팎에서 SystemUI ANR → 전체 검은 화면(콜드 부트 재실행으로 복구) · 내비 앱이 자리표시자로 재시작을 반복하며 앱 창을 가림(`pm disable-user --user 10` 로 임시 해결, 시연 전 `pm enable`) · 콘솔 HVAC 온도 쓰기가 2차 부팅에서는 실제값으로 되돌아감(시트·기어 쓰기는 됨) · `input tap` 은 셸 GNB 에 안 먹음 · uiautomator dump 불가(Compose) | 원인 미확인 항목은 그대로 적는다 |

## 13. 에뮬레이터 이미지의 기본 앱 구성 — "현대차 앱은 지금 무엇을 하고 있나" (2026-10-30)

Pleos Connect Emulator v2.1.0 이미지에서 `pm list packages`·`dumpsys package`·`query-activities` 와 화면 캡처로 확인했다
(`docs/my-copilot/captures/emulator/E22-*`). **에뮬레이터 이미지 기준**이다 — 실차 소프트웨어는 더 많거나 다를 수 있다.
마이현대·블루링크 같은 **스마트폰 앱**과 **App Market** 은 이 이미지에 없어 여기서는 확인할 수 없다(폰에도 설치 안 됨).

| 확인됨 | 비고 |
|---|---|
| 패키지 211개 중 비-AOSP 48개: `ai.pleos.*` 25(플랫폼 서비스) · `ai.umos.*` 21(셸·기본 앱) · 우리 앱 2 | `E22-packages-non-aosp.txt` |
| **셸** = `ai.umos.homescreen`(HomeActivity, priv-app) + `ai.umos.drivingview`(왼쪽 Driving view) + `ai.umos.applibrary`(GNB ▦ 를 누르면 뜨는 팝업: **앱 · 공조 · 빠른 설정 · 더 보기** 탭) + `notification` · `systemdialogdispatcher` · `inputmethod` · `theme.connect`/`theme.font.ftdot` | 앱은 이 셸이 주는 창 하나만 받는다(7절과 일치) |
| 앱 라이브러리에 보이는 앱 9개: Connect Mirroring(`phoneprojection` 1.0.204) · FormFactorConsole(`connectwebconsole`, 개발용) · **Gleo AI**(`ambientai` 4.2.0.15) · MY CO-PILOT(실험) · **내비게이션**(`maps.android.navigation.app` = Navi42 **3.3.2**) · 쉼표 DRIVE · 전화(`callandmessage`) · **차량 설정**(`vehiclecontrol` v14) · 카메라(`car.evs`) | 미디어(`mediaapp` 1.0.4236)는 런처 항목 없이 셸 하단 재생 바·GNB 로. `globalsearch`·`semanticsearch` 는 상단 🔍 |
| **차량 설정 앱 메뉴 23개**: 빠른 설정 · 라이트 · 주행 · AD · 잠금 · 시트 · 공조 · 충전 · 내비게이션 · 스케줄 · Gleo AI · 디스플레이 · 개인정보 보호 · 보안 · 사운드 · 프로필 · 편의 기능 · 주행 정보 · 연결 · 앱 · 하이패스 · 일반 설정 · 차량 정보 | `E22-settings-*.png` |
| 빠른 설정: 모든 창문 · 창문 잠금 · 도어 · 차일드락 · 글로브박스 · 충전구 · 디스플레이 밝기 · 사이드 미러 · 운전대 · 전조등(끄기/자동/…) | 차량 평면도에 트렁크·프렁크·충전구·실내등 버튼 |
| 주행: 가속 모드 Comfort/Normal/Sport · 눈·빗길 모드 · 조향 반응 표준/가볍게 · ESC 켜기/Sport/끄기 | 우리 `DrivingMode` 도메인이 읽는 값의 UI |
| **시트**: 시트 위치 · 요추 지지 · 시트 쿠션 탭, 앞뒤 좌석 조절 핸들, **운전자 프리셋 1·2**, 릴랙션 컴포트(운전자/동승석) | 통풍·열선은 여기 없고 셸 하단 바(시트 아이콘)에서 |
| **공조**: 자동 외부 공기 차단(워셔액 분사 · 터널 진입 · 공기 질 저하) · 공조 편의(실내 과열 방지 · 에어컨 자동 건조) | 온도·풍량·A/C 는 셸 하단 공조 바. 에뮬레이터에서 토글은 전부 비활성 |
| **충전**: 주행가능거리(km) · 충전 목표 슬라이더(50% 표시선 · 100% 목표) · 충전 시작 · 커넥터 잠금 해제 · **충전 잔량 표시 km/%** · 완속 충전 전류 | "충전 중단됨" 상태 표시. 에뮬레이터 주행가능거리 0 km |
| **스케줄**: 충전 스케줄 · **사전 공조 스케줄**(둘 다 "없습니다 · 추가") | 출발 전 공조 예약은 차량이 이미 제공 — MY CO-PILOT 은 만들지 않는다 |
| **Gleo AI**: 음성 유형 1~4(내비·시스템 안내에도 적용) · '글레오' 호출어 · 바로 대화 시작 · 연속 대화 · 대화 스타일 정중한/친근한 | 음성 비서 설정은 차량 것 — 정책 5 |
| **편의 기능**: 세차 모드 · 발레 모드 · **캠핑 모드** · 펫 케어 모드 · 이중 주차 모드 · 견인 모드 · 대기 모드 | 쉼표 DRIVE 캠핑·차박 설계는 "차량 캠핑 모드 켜기"를 만들지 말고 **그 모드로 쓸 에너지**만 계산한다 |
| 디스플레이: 테마 그래파이트/팝 · 화면 모드 자동/라이트/다크 · 밝기 | 앱도 라이트·다크 둘 다 따라야 한다 |
| **프로필 · 주행 정보** 는 에뮬레이터에서 **빈 화면** | `service.profile` 1.0.728 은 있으나 UI 가 안 뜸 — 운전자 프로필 구조는 여기서 못 본다 |
| 플랫폼 서비스(앱 SDK 가 바인딩하는 쪽): `playground.service.vehicle` **2.3.22**(VehicleService) · `playground.service.navi` **3.0.4**(NaviService) · `playground.caas`(TTS/STT) · `playground.service.adas` · `sync` · `location.fused` · `service.car`(PleosCarService v14) · `service.profile` · `service.trustagent` · `multimedia.mediabridge` · `gleoai.model.provider` 4.1.21 | LLM 모델 provider 패키지는 남아 있다 — 8절 "LLM SDK 제공 종료"와는 별개(서드파티에 열리지 않는다는 뜻) |
| 기본 앱의 권한: 홈·Driving view·차량 설정은 AAOS `android.car.permission.CONTROL_CAR_*`(DOORS·WINDOWS·SEATS·MIRRORS·ENERGY_PORTS…)와 `READ_ADAS_STATES` 등을 **직접** 요청(시스템 앱). 내비는 `ai.pleos.permission.WRITE_PROPERTY` · `pleos.car.permission.NAVI_NOTIFY`. 차량 설정은 `ai.pleos.profile.permission.ACCESS_PROFILE_SERVICE` · `pleos.car.permission.NAVI_ROUTE` | 서드파티는 `pleos.car.permission.*` 로만 간다(11·12절). `E22-builtin-app-permissions.txt` |

**우리에게 뜻하는 것** — 시트 프리셋 · 사전 공조 스케줄 · 캠핑 모드 · 프로필이 차량 설정 앱에 **이미 있다**. "운전자 프로필·원격 공조 기억은 현대차가 이미 제공"(CLAUDE.md 정책 5)이 에뮬레이터 화면으로 확인된 셈이고, 차별 축은 그대로 **탑승 조합 × 상황 × 여정**이다. 차량 설정 앱이 하는 일(설정 자체)을 앱 안에 다시 그리지 않는다.

## 14. NaviHelper 목적지 설정 — requestRoute (javap + 에뮬레이터, 2026-11-03)

출처: NaviHelper 3.0.5 AAR javap · 오너가 붙여 준 공식 문서 발췌(`https://document.pleos.ai/api-reference/connect-sdk-pleos/NaviHelper/destinations` — WebFetch 로 본문을 못 읽음) · Pleos Connect Emulator v2.1.0(내비 Navi42 3.3.2).

- `requestRoute(RouteInfo)` — @RequiresPermission `pleos.car.permission.NAVI_ROUTE_SEARCH`(에뮬레이터 protectionLevel normal, 설치 시 granted). 같은 클래스에 `requestRouteWithWaypoints` · `cancelRoute`.
- `RouteInfo(lat, lon, displayLat?, displayLon?, poiName, poiId, address, poiSubId, RouteOption, poiProvider, isMobileRequest)`.
- `getBookmarkInfo()` → `onBookmarkInfo(List<BookmarkInfo>)` · `BookmarkType` HOME / OFFICE / EV_CHARGING_STATION / DEFAULT · 문자열 필드 nullable.
- **집을 등록하지 않아도 HOME 즐겨찾기가 (0, 0) 으로 온다**(에뮬레이터). 그대로 requestRoute 하면 내비가 "경로 탐색 오류 - Invalid Parameter" 대화상자 + `onError(CAUSE_SEARCH_ROUTE)`.
- 정상 집으로 보내면 약 8초 뒤 `onRouteStarted` · 이어 `getDestinationInfo` 가 보낸 장소(같은 poiId)를 돌려준다 · 내비는 앞으로 나와 경로 안내를 시작한다.
- 오류 코드 `NaviErrorCode`: CAUSE_LOW_BATTERY · CAUSE_SEARCH_ROUTE_OVER_DISTANCE · CAUSE_SEARCH_ROUTE · CAUSE_SEARCH_ROUTE_TOO_SHORT_DISTANCE · CAUSE_SEARCH_TRIP.
- 미확인: `onRoutingCompleted`·`onDestinationChanged` 가 오는 시점 · 기존 경로 위에서 바꿀 때의 동작 · 실차·App Market 허용.

## 15. NaviHelper 사전 경로 계산 데이터 (navi-data 3.0.4 클래스, 2026-11-04)

출처: Gradle 캐시의 `navi-data-3.0.4` 클래스(필드·javap). 실행 결과는 16절.

- `TripRequest(latitude, longitude, poiId, poiName, poiSubId)` → `TripInfo(distance, eta, estimatedSocAtDest, energyConsumption, summary)`.
- `TripSummary(trafficConditions, routePoints)` · `RoutePointInfo(latitude, longitude, poiName, poiId, ratioOnRoute, poiType, pointType, settingType)`.
- `RoutePointPoiType { NORMAL, EV_CHARGING }` · `RoutePointType { ORIGIN, WAYPOINT, DESTINATION }` · `RoutePointSettingType { AUTO, MANUAL }` — AUTO 는 내비가 넣은 지점으로 추정.
- `RouteWithWaypointsRequest(destination, waypoints)`.
- 경로 전체 좌표 API 는 클래스 이름·문자열 검색으로 찾지 못했다.

## 16. NaviHelper · 차량 값 실행 관찰 (에뮬레이터, 2026-11-04, E24 · E25)

출처: Pleos Connect Emulator v2.1.0 · 내비 Navi42 3.3.2 · logcat `CoPilotV6` · `docs/my-copilot/v6/SDK-EVIDENCE-V6.md`.

- `RouteStateInfo.isRouting` 은 **안내 중에도 false** — 경로 여부는 `getDestinationInfo` 로 본다.
- `remainDestinationChargingInt` 는 75,580 — %가 아니라 Wh 로 보인다(÷ 용량 77,400 = 97.6%, 내비 화면 98%). 1회 관찰.
- `getEvBatteryCapacity` 경로의 용량은 77400 — Wh 로 판단. 어댑터의 kWh 가정과 다르다.
- `addWaypoint` 는 빈 poiId·address 로도 내비 경로에 반영되고 내비가 앞으로 나온다. `getWaypointInfo` 는 이름만 주고 좌표가 (0, 0)이며 반영까지 시간이 걸린다.
- `onWaypointChanged(ADD)` 는 1회 약 12초 뒤 왔고 다른 시도에서는 오지 않았다. `removeWaypoint(index)` 뒤 `addWaypoint` 는 고른 칸만 바꾼다.
- `requestTrip` → `TripInfo`: 192,949m · 9,421초 · 64% · 27,436(Wh 추정). 내비 화면과 일치하고 경로를 바꾸지 않았다.

## 17. NaviHelper 임의 좌표 — requestTrip · requestRoute · 경유지 콜백 (에뮬레이터, 2026-11-10, E27)

출처: Pleos Connect Emulator v2.1.0 · 내비 서비스 3.0.4 · 개발 전용 앱 `android/gateprobe`(NaviHelper 3.0.5) · 출품 APK 1.0.0 · logcat `GateProbe` / `CoPilotV6` · `docs/android/emulator/E27-2026-11-10.md`.

- `requestTrip(TripRequest(lat, lon, "", name, ""))` 는 **내비에 목적지가 없어도** `onTripInfo` 를 준다(세종로 공영주차장 23,432m · `eta=2738`). `eta` 는 **소요 시간(초)** — 경로 설정 후 내비 화면 "44분" 과 맞는다.
- 연속 호출(앞 응답 뒤 다음)은 0.2~0.4초씩 각각 응답. 안내 중에도 응답하고 **목적지를 바꾸지 않는다**(재조회 확인).
- `TripSummary.trafficConditions` 는 구간 비율별 `congestionType`(SLOW · MODERATE · HEAVY · FAST) 목록. 에뮬레이터 새벽 시각에도 HEAVY 가 있어 **실시간 교통인지는 미확인**.
- `requestRoute(RouteInfo(lat, lon, null, null, name, "", "", "", RECOMMENDED, "", false))` — **poiId · 주소 없이** 임의 좌표로 안내가 시작된다. 7.9초 뒤 `onRouteStarted(RouteStartInfo(duration, distance, tollFare, name, remainDestinationChargingValue))` → `getDestinationInfo` 가 같은 좌표 · `remainDistance`(m) · `remainTime`(초).
- 기존 경로가 있을 때 `requestRoute` 는 **확인 없이 교체**한다(중간에 빈 목적지 콜백 1회). 앱이 먼저 사용자에게 묻는 이유(정책 1).
- `addWaypoint` → **`onWaypointChanged(index=FIRST, cmd=ADD)` 가 7.3초 뒤 왔다**(2회 재현, 목적지가 있을 때). 이어 `getWaypointInfo` 에 이름이 들어 있다(좌표는 여전히 (0,0)).
- 일정 제공자 `content://com.android.calendar/calendars` — 이 에뮬레이터 이미지에 **없음**.
