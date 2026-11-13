# Pleos Connect Emulator 실행 런북 — 다른 PC 에서 바로 하기 위한 순서 (2026-10-27)

오너 우선순위 2번(출품본 보호 다음). **2026-10-29 정정: 이 PC 에서 돈다** — 설치·실행 명령과 E1~E19 결과는 `EMULATOR-RESULT-2026-10-29.md`. 아래 표는 그 결과로 채운 것과 아직 남은 것을 같이 둔다.
GPU 최소 사양(RTX 3060 Laptop)은 문서상 요구이고 실행 차단 조건이 아니었다(에뮬레이터 자체 검사 통과). 병목은 호스트 메모리.

## 0. 가져갈 것

| 무엇 | 어디 |
|---|---|
| MY CO-PILOT 실험 APK | `android/copilot/build/outputs/apk/debug/copilot-debug.apk` (applicationId `app.commadrive.copilot`, 출품 앱과 나란히 설치됨) — 없으면 `cd android && ./gradlew :copilot:assembleDebug` |
| 출품 APK(같이 확인) | `apk/CommaDrive_쉼표DRIVE_release.apk` |
| 저장소 전체 | 로그·캡처를 커밋하려면 |
| adb | `%TMPDIR%/tools/platform-tools/` 또는 Android Studio 의 platform-tools |
| 이 문서 + `docs/10-briefing.md`(질문표) | 설명회에서 같이 본다 |

## 1. 환경 (공식 문서에서 확인한 것 — research 8·9절)

- Pleos Connect Emulator **v2.1.0** · 에뮬레이터 이미지 **API 34** · minSdk 28 · Gradle 8.0+ · Android Studio.
- 설치 명령 이름은 `configure-pleos-connect-emulator` (그래픽 사양 검사 포함). **설치 절차 전문은 미확인** — Playground 문서를 따른다.
- **Virtual Console** 에 Energy(Remaining Range · Battery Energy kWh · **Battery SOC %** · Capacity kWh · Charge …) · Climate(HVAC Power/Auto · Fan · **Target Temperature**) · Motion(**Gear P/R/N/D** · Brake · Odometer) 카드가 있다. 외기온 카드는 목록에서 못 봤다.
- 폼 팩터 테스트: AVD + Host Display Bridge + FormFactorConsole, 포트 8095/8096 (가상 DISPLAY2).

## 2. 설치 · 실행

```
adb devices                              # 에뮬레이터가 보여야 한다
adb install -r copilot-debug.apk
adb shell am start -n app.commadrive.copilot/.CopilotActivity    # 매니페스트: app.commadrive.copilot.CopilotActivity
adb logcat --pid=$(adb shell pidof app.commadrive.copilot)        # 앱 프로세스 로그만 (별도 Log 태그를 두지 않았다 — 크래시는 AndroidRuntime)
```

앱이 뜨면 **앱 창 안**만 우리 것이다(셸·GNB·내비는 시스템). 세로 840×1184 로 시작하는지, 창을 가로 1700 으로 늘리면 오른쪽 열이 생기는지 본다.

## 3. 확인 항목 — 하나씩 ✅/❌ 와 값을 적는다

| # | 무엇 | 어떻게 | 기대 | 결과 |
|---|---|---|---|---|
| E1 | 앱 설치·실행·크래시 없음 | 2절 | 홈(프로필 선택) 화면 | |
| E2 | **주행 신호 실제 수신**(AAOS) | 홈 상단 배지 | "주행 신호 차량 정보 · 그 밖은 시연 데이터" (기기 아니면 "시연 데이터") | |
| E3 | **배터리 실제 수신**(Pleos Vehicle) | 배지 | "주행·배터리 차량 정보 · …" 또는 "배터리 차량 정보 · …" | ✅ 2차(2026-10-29 17:23) "배터리 100% · 차량 정보" · 재판단 토스트. 1차에서는 CarLink 4초 타임아웃에 걸려 DEMO(부하 의존) |
| E4 | 기어 P → D 로 한 줄 화면 전환 | Virtual Console Motion · Gear | 주행 중 한 줄 화면 + 음성, 설정 화면 사라짐 | ✅ 2026-10-29 2차 — D: "주행 중 · 한 줄 화면 / 도착까지 에너지 문제 없음 · 추정", P: 준비 카드 복귀(RESULT §6-4) |
| E5 | 속도 0 ↔ 80 | Console | D·0km/h 는 주행과 같게(정지 ≠ 주차) | |
| E6 | **CarUxRestrictions 콜백** | Console 에 해당 카드가 있으면 토글, 없으면 기어·속도로 | 제한 켜짐에서 편집·공조·하차 확인 막힘 | |
| E7 | SOC 변경 → 재판단 | Console Energy · Battery SOC 68 → 40 | 에너지 화면 판정 변화 · 기록에 재판단 | |
| E8 | **SOC 단위** | Console 값과 화면 "지금 배터리" 비교 | % 그대로인가 | |
| E9 | 효율값 `getCurrentEvEfficiency` | 출품 앱 또는 로그 | 단위(kWh/100km? km/kWh?) · 값이 오는가 | |
| E10 | HVAC Target Temperature **읽기** | Console Climate 바꾸고 출발 준비 화면 | (아직 미이식 — 이식 전엔 "시연 데이터"가 정상) | |
| E11 | 출품 앱: NaviHelper `addWaypoint` → `onWaypointChanged(ADD)` | 출품 APK 로 경유지 추가 | 콜백 수신 · 내비에 마커 | ⚠️ 2026-10-29 3차 — `addWaypoint` 호출됨 · 내비가 검색 화면으로 앞에 나옴 · 목적지가 없어 10초 안 콜백 없음 → "내비게이션에 연결하지 못했어요"(경로 그대로). 목적지 설정 뒤 재실행 필요(RESULT §7-4) |
| E12 | 출품 앱: `remainDestinationChargingInt` 단위 | 내비 목적지 설정 뒤 로그 | % 인가 | |
| E13 | 창 크기 바꿔도 상태 유지 | 세로 ↔ 가로 | 이동 중 상태 그대로 | |
| E14 | 백그라운드 → 복귀 | 다른 앱 띄웠다 돌아오기 | 모의 타이머·음성 멈췄다 재개 | ✅ 2026-10-29 3차 — AppGrid 띄웠다 복귀, 프로세스·화면 유지(RESULT §7-3). 프로세스 종료 뒤는 미검증 |
| E15 | TTS | 주행 중 한 줄 | Pleos TTS 가 말하는가(안 되면 Android TTS 로 물러나는가) | |
| E17 | **조회 실패**(외부 평가 8) | 권한을 뺀 채 설치하거나 Vehicle 서비스가 거부하게 | `VehicleListener.onFailed` 가 오는가 · 그때 배지·에너지 탭이 "조회 실패"/"부족한 정보: 배터리"인가(배선은 onFailed 조건 확인 뒤, HANDOFF) | |
| E19 | **시트·조명 조회·제어**(UX 개편 2026-10-28) | Virtual Console 에 Seat/Light 카드가 있나 · `Vehicle.getSeat()` 통풍/열선 조회 · `setHvacSeatVentilation` 등이 서드파티 권한(`CONTROL_CAR_SEATS`)으로 되나 · Light 조회 범위 | 되면 값·단위·콜백을 적고 준비 카드의 시트 적용을 모의에서 실제로. 안 되면 시트는 "차량에서 직접"으로 남는다(지금 화면과 같다) | ✅ 2026-10-29 2차 — 시트 온도 Int(음수 통풍·양수 열선·0 끔) · 통풍 Int(0/양수) · 변경 콜백 옴 · `CONTROL_CAR_SEATS` normal → 통풍 set 콜백 1 · 재조회 1(RESULT §6-2·6-3). **열선 set ✅ 3차**(`setSeatHeat(true) applied=1` · 재조회 1 · 콘솔 Heating, RESULT §7-2). 조명은 미실행 |
| E20 | **학습 후보 재현**(취향 학습 2026-10-28) | 아빠·혼자 이동 3번 + 각 이동에서 실내 콜백 | 4번째에 후보 카드(시연 데이터 머리말 없음) → 저장 → "이미 맞음" | ✅ 2026-10-29 3차 — RESULT §7-1(한계: 이동 번호는 준비 중 재선택으로 올림 · 관찰 값은 앱이 2차에 올린 23°C). 단건 공조 제안이 프로필 targetC 를 보던 결함 발견·수정 |
| E22 | **Mission 복원**(V5 지시서 4절 6, 2026-11-02) | 픽업 Mission → 학원 도착(P) → 내리지 않고 기다리기 → 귀가 일정 확인 → `am force-stop app.commadrive.copilot` → 재실행 | 홈이 "픽업 후 귀가 · 귀가 준비됨 · 귀가 집 (귀가) 유지"로 돌아옴 · 토스트 "이동 #n 를 이어서" · 기록 한 줄 · 진행 중이던 제어 요청은 복원 안 됨 || ✅ 2026-11-03 — 강제 종료(PID 6772→24161)·재부팅 둘 다 같은 Mission 복원 · 기어 D 만으로는 단계 전이 없음(속도 신호 없음) → 개발용 "실제 주행 신호 → 모의" 스위치로 도착 재현 (SDK-EVIDENCE-V5 E22) |
| E23 | **원탭 다음 이동**(NaviHelper requestRoute, 2026-11-03) | 픽업 Mission 차 안 대기 → 귀가 일정 확인 → "집으로 안내 시작" (① 내비에 집 미등록 ② 집 등록 뒤) | ① "내비에 집이 저장돼 있지 않아요" · requestRoute 안 보냄 ② 내비 경로 시작 · 앱 "귀가 경로 확인됨 · 내비가 확인함" | ✅ 2026-11-03 — ① 처음엔 (0,0) 집을 보내 Invalid Parameter(결함) → `validPlace` 로 수정 ② `onRouteStarted` → 목적지 재조회 같은 poiId → 확인됨 (SDK-EVIDENCE-V5 E23). 기존 경로 교체 확인은 미실행 |
| E18 | **동력원·연료 데이터**(오너 결정 2026-10-28) | Virtual Console 에 Fuel 카드가 있나 · `Vehicle.getFuel().getFuelPercent`(`CAR_ENERGY`, javap 확인)와 `checkFuelPercentCapabilities`·`checkEvBatteryCapabilities` 가 EV 프로필에서 무엇을 돌려주나 | 값·단위(%)·capability 결과를 적는다. capability 로 동력원이 갈리면 `CarState.powertrain` 어댑터의 근거. 안 오면 그대로 — 에너지 판단은 EV 특화 기능, 다른 동력원은 "지원 안 함 · 확인 전" | |
| E16 | **부분 연결**(외부 평가 7) | Pleos Vehicle 서비스만 끊기거나 AAOS 콜백만 멈추는 상황을 만들 수 있으면 | 배지 "일부 차량 연결 끊김" · 배터리 쪽 끊김 → 에너지 탭 "부족한 정보: 배터리" · 주행 쪽만 끊김 → 에너지는 그대로 판단, 단계는 보수적. 못 만들면 "재현 불가" | |

## 4. 결과를 어디에 적나

- 이 표를 채운 복사본을 `docs/my-copilot/EMULATOR-RESULT-<날짜>.md` 로. 캡처는 `scratchpad` 가 아니라 `docs/my-copilot/captures/emulator/` (저장소에 남긴다).
- 사실이 바뀌는 곳: `docs/research/PLEOS_PLATFORM.md` 표(날짜·URL) → `CLAUDE.md` 확인/전해 들음 표 → `PARITY.md` 1절 검증 단계 → `REVIEW-2026-10-27.md` 4절 범위표의 "미검증" 칸.
- E8·E9·E12 단위가 가정과 다르면 **엔진 입력 변환**(어댑터)만 고친다 — 엔진 규칙은 그대로.

## 5. 안 될 때

- 에뮬레이터가 안 뜸: 그래픽 사양. 다른 PC.
- 설치는 되는데 배지가 "시연 데이터": `VehicleBridge` 가 Automotive 기기 판정(`PackageManager.FEATURE_AUTOMOTIVE`)을 통과했는지 logcat. 통과했는데 콜백이 없으면 권한(`CAR_SPEED`·`CAR_POWERTRAIN`·`CAR_ENERGY`) — 설명회 질문 10·11.
- 크래시: `adb logcat -s AndroidRuntime` 전문을 결과 문서에 붙인다.
