# Pleos Connect Emulator 실행 결과 — 이 PC 에서 (2026-10-29, 오너 지시 "V22 정합성 수정 결과" 4절)

> 오너 지시: "GPU 미달"을 반복하지 말고 공식 최소 사양·현재 GPU·가상화·그래픽 가속을 비교해 **정확한 원인**을 확인하고, 이 PC 에서 되는지 아닌지 가르라. 되면 런북 E1~E19, 첫 실증 목표는 **HVAC 상태 조회**.
> 결론부터: **이 PC 에서 Pleos Connect Emulator v2.1.0 이 실행됐고, MY CO-PILOT 이 실제 Vehicle SDK 콜백으로 공조 설정 온도를 읽어 '아빠 + 가족' 준비 카드에 반영했다.** "GPU 미달"은 실행을 막는 원인이 아니었다. 아래는 전부 이 PC 에서 직접 실행해 얻은 것이고, 못 한 것은 못 했다고 적었다.

## 1. 사양 비교 — 공식 최소 사양 vs 이 PC

| 항목 | 공식 요구(출처) | 이 PC(실측) | 판정 |
|---|---|---|---|
| GPU | **최소** RTX 3060 Laptop 6GB / RX 6600M 8GB · 권장 RTX 4060/5060 Laptop 8GB (`document.pleos.ai …/configure-pleos-connect-emulator`, 2026-10-29 확인 — 이 페이지는 **GPU 만** 적는다. CPU·RAM·OS·가상화 요구는 없음) | GeForce **GTX 1660 SUPER 6GB** · 드라이버 560.94 · Vulkan 1.3.280 | 공개 사양표 기준 CUDA 코어 1,408 vs 3,840(RTX 3060 Laptop), FP32 약 5.0 vs 약 10.9 TFLOPS(부스트 클럭 계산값), **메모리 대역폭 336 GB/s 와 VRAM 6GB 는 같다**. 에뮬레이터의 자체 검사 `hasSufficientHwGpu` 는 **통과**("Hardware GPU requirements to run avd are passed") — 호스트 GPU(Vulkan·GLES host) 렌더링으로 부팅·조작 가능. 느리지만 막히지 않는다 |
| CPU 가속 | Android Emulator 공통: Windows 에서 Hyper-V 가 켜져 있으면 **WHPX** 필요 | i5-10400F 6C/12T · Hyper-V 하이퍼바이저 **동작 중**(Docker Desktop·WSL2 Ubuntu 설치) · `emulator -accel-check` → **"WHPX(10.0.19045) is installed and usable"** | 통과. WMI 의 `VirtualizationFirmwareEnabled=False` 는 하이퍼바이저가 돌 때 나오는 표시라 VT-x 꺼짐이 아니다 |
| RAM | (공식 없음) AVD 권장 4GB(설치 안내) · 이미지 기본값 8GB | 16GB 물리 · **작업 중 여유 0.6~3GB**(Chrome 3.1GB · VS Code 2.9GB · Gradle 데몬 1.8GB) | **실질 병목**. 앱이 한 번 ANR(입력 응답 5초 초과)로 꺼졌고 게스트 load average 39(4 vCPU). 에뮬레이터 돌릴 때는 Chrome·VS Code 를 줄이고 Gradle 데몬을 끈다 |
| 디스크 | 이미지 zip 4.09GB → 설치 **19GB** + AVD | C: 21GB 여유 → **D: 에 설치**(`<tools>/android-sdk` · AVD 는 `<tools>/avd`) | 통과 |
| OS | Android Studio 최신(설치 안내) | Windows 10 Pro 19045 · Android Studio **없음** — `sdkmanager`/`avdmanager`/`emulator` 명령줄만 | **Android Studio 없이 됐다** |

**실행 차단의 진짜 원인**: 없었다. 2026-10-24 에 문서의 GPU 최소 사양만 보고 "미달이라 못 돌린다"고 적었고 실행을 시도하지 않았다. 추가로 이 PC 에는 다른 프로젝트(`D:/dev/android-sdk`, `k-saju`)가 2026-10-07 에 API 35 에뮬레이터를 이미 부팅한 기록(`~/.android/avd/ksaju_qa.avd/bootcompleted.ini`)이 있었다.
**하드웨어 교체·다른 PC 필요 여부**: 실행·검증에는 **필요 없다**. 쾌적한 시연(PT)에는 메모리 여유가 큰 PC 가 낫다.

## 2. 설치 — Android Studio 없이 (재현 명령)

1. 시스템 이미지 저장소(공식 설치 안내의 Windows/Linux XML, **로그인 없이 공개**): `~/.android/repositories.cfg` 에
   `src00=https\://nexus-playground.pleos.ai/repository/raw-releases/connect-avd/2.x/crp-sys-img.xml`
2. `sdkmanager --sdk_root=<tools>/android-sdk "emulator" "system-images;android-34;pleos_car_emulator;x86_64"` (에뮬레이터 37.2.12 · 이미지 revision 2 · 42dot SDK License 동의가 뜬다)
3. 이미지가 **기기 프로필을 같이 준다**(`devices.xml`: "Pleos Connect v2.1.0", 2560×1440 · 160dpi · android-automotive): `avdmanager create avd -n pleos_connect_v210 -k "system-images;android-34;pleos_car_emulator;x86_64" -d Pleos_Connect_v2_0`
4. `config.ini`: `hw.ramSize=4096` · `hw.gpu.mode=host` · `fastboot.forceColdBoot=yes`(공식: 콜드 부트 아니면 VHAL 사용 불가) · `hw.cpu.ncore=4`
5. `emulator -avd pleos_connect_v210 -gpu host -no-snapshot -no-boot-anim` → `sys.boot_completed=1` 까지 **104초**. 빌드 `Pleos/crp_avd/crp_avd_x86_64:14/RELEASE.release_connect_v2.1.0` · `android.hardware.type.automotive=true` · `wm size 2560x1440` · density 160
6. Virtual Console: `adb forward tcp:8088 tcp:8088` → `http://127.0.0.1:8088/`(HTTP 200, 제목 "Pleos Connect Virtual Console")

스크립트: 세션 scratchpad `pleos-emu.sh`(create · start · wait · adb). 저장소에는 두지 않았다(경로가 이 PC 전용).

## 3. 런북 결과 (E1~E19) — 실행한 것만 ✅/❌, 안 한 것은 "미실행"

| # | 무엇 | 결과 | 증거 |
|---|---|---|---|
| E1 | 앱 설치·실행·크래시 없음 | ✅ 설치 Success(출품 APK 도 나란히) · 시작 화면 · 크래시 0 · **ANR 1회**(10분 뒤, 호스트 메모리 0.6GB 여유 시점, 트레이스는 `libdebuggerd_client: timeout` 으로 잘려 앱 원인 단정 불가) | `captures/emulator/E01-start-screen.png` · `am_anr` 22:01:43 |
| E2 | 주행 신호 실제 수신(AAOS) | ✅ 배지 "주행 신호 차량 정보" · 기어 P 차량 정보. **`CAR_SPEED` 는 설치 시 거부**(`granted=false`, `PERF_VEHICLE_SPEED not in carPropertyConfig`) → `pm grant --user 10` 으로 줄 수는 있다(에뮬레이터 한정). `CAR_POWERTRAIN` 은 허용 | logcat `CarPropertyManager` · dumpsys package |
| E3 | 배터리 실제 수신(Pleos Vehicle) | ⚠️ **콜백은 온다**(`onChangeEvent EV_BATTERY_SOC value=100`, 콘솔 40 으로 바꾸면 `value=40`) 그런데 배지에 "배터리"가 안 켜진 이유 둘: ① `VehicleBridge` 가 snapshot 만 모아 첫 값을 CONNECTING 중에 놓침 → **고쳤다**(snapshot+link combine) ② 출품 앱 `CarLink` 의 **4초 타임아웃** — 부하가 걸린 에뮬레이터에서 Vehicle 서비스 바인딩이 6초 걸려 DEMO 로 물러났다. CarLink 는 출품본(`android/app`)이라 **손대지 않았다** → 오너 판단 | logcat 22:13:18 initialize → 22:13:24 첫 콜백 |
| E4 | 기어 P→D 로 화면 전환 | ⚠️ 콘솔 `POST /vehicle/gear?gear=Drive` 로 시스템 `GEAR_SELECTION` 이 8(DRIVE)로 바뀌는 것은 확인(셸 클러스터 D). 그 순간 앱은 ANR 로 꺼져 있어 **앱 화면 전환은 미확인** | `E04-shell-gear-D-hvac24.png` · logcat `[GAA] onChangeEvent(GEAR_SELECTION) >> 8` |
| E5 | 속도 0↔80 | ❌ 미실행 — Virtual Console 에 **속도 카드가 없다**(ADAS Cruise Target Speed 뿐, 공식 가이드) · `CAR_SPEED` 거부 | virtual-console-guide |
| E6 | CarUxRestrictions 콜백 | ⚠️ 주행 제한 "꺼짐 · 차량 정보"로 읽힘. 콘솔에 제한 카드 없음 → 켜짐은 미확인 | 화면 값의 출처 |
| E7 | SOC 변경 → 재판단 | ⚠️ 콘솔 `POST /vehicle/ev-battery?field=soc&value=40` → SDK 콜백 40 수신. 재판단 화면은 E3 ② 때문에 시연값(68%)에 머물러 **미확인** | logcat |
| E8 | SOC 단위 | ✅ **% 그대로**(콘솔 40 ↔ 콜백 40). 용량 `INFO_EV_BATTERY_CAPACITY` 는 **77400.0 = Wh**(콘솔 77.4 kWh) — 어댑터는 kWh 로 가정하고 `>10` 검사를 통과시켜 **77,400 kWh 로 읽는다** → 변환(÷1000) 필요. `adapters/` 는 출품본이라 미수정 — 오너 판단 | logcat `getProperty_onResult INFO_EV_BATTERY_CAPACITY 77400.0` |
| E9 | 효율 `getCurrentEvEfficiency` | ❌ 콜백 없음(`getCapabilityConfig TRIP_EV_EFFICIENCY` 요청 뒤 값 없음, `hasPropertyIdCount: 0`) — 단위 미확인 그대로 | logcat |
| **E10** | **HVAC 설정 온도 읽기** | ✅ **첫 실증 목표 달성.** `getHvacTemperature(ROW_1_LEFT, CELSIUS)` → `getProperty_onResult HVAC_TEMPERATURE_SET areaId 1 value 24.0`(콘솔 24.0 과 일치) · 조수석(area 4) 22.0 · 콘솔에서 23 으로 바꾸면 `onChangeEvent … value=23.0` 콜백 → 앱이 **'아빠 · 가족 · 여행' 준비 카드를 "공조 24→23 · 통풍시트 끔→켬 (2개)"에서 "통풍시트 (1개)"로** 갱신. 배지 "주행·공조·도어 차량 정보 · 그 밖은 시연 데이터". 권한 `CAR_CLIMATE` 설치 시 허용 | `E10-dad-family-hvac24-to-23.png` · `E10-after-console-23.png` |
| E11 | 출품 앱 NaviHelper addWaypoint | ❌ 미실행(시간) — NaviHelper 서비스 연결·버전 **3.0.4** 는 확인 | logcat `getServiceVersion = 3.0.4` |
| E12 | `remainDestinationChargingInt` 단위 | ❌ 미실행 | |
| E13 | 창 크기 바꿔도 상태 유지 | ❌ 미실행(이번 이미지는 앱 창이 가로 한 창) | |
| E14 | 백그라운드 → 복귀 | ❌ 미실행 | |
| E15 | TTS | ✅ Pleos TTS ON_DEVICE 서비스 연결 · `updateLocale ko_KR`(발화 청취는 안 함) | logcat `[GAAS][SDK]` |
| E16 | 부분 연결 | ❌ 미실행 | |
| E17 | 조회 실패 onFailed | ✅ 한 건 관찰: `getDoorLockState(ROW_1_LEFT)` → `onFailed IllegalArgumentException: area ID 0x1 not supported for DOOR_LOCK`(지원 영역 0x55·0x10000000). 도어 **위치**는 4문 전부 0(닫힘) 수신 · 잠금 콜백은 영역 85 로 옴 → 어댑터의 잠금 조회 영역 수정 필요(copilot-adapters, 미수정) | logcat |
| E18 | 동력원·연료 | ❌ 미실행. 콘솔에 **Fuel 카드 없음**(가이드 확인) | virtual-console-guide |
| E19 | 시트·조명 조회·제어 | ❌ 미실행(어댑터 없음). 콘솔 카드는 **있다**: Seat Temperature 운전석/조수석 V3·V2·V1·Off·H1·H2·H3(`HVAC_SEAT_TEMPERATURE`) · Steering Wheel Heat Off/Low/Medium/High(`HVAC_STEERING_WHEEL_HEAT`) · Ambient Brightness 0~100% · Ambient Color 4색 · Seat Occupancy → 다음 단계 | virtual-console-guide · `/vehicle/catalog` |

**오너 지시 순서 대비(1차 시점 — ③④⑤ 는 2차 §6 에서 ✅)**: ① 에뮬레이터 환경 ✅ ② HVAC 실제 조회 ✅ ③ Seat 조회 ❌(1차 미실행 — 어댑터 없음) ④ 제어 권한 검증 ❌(1차 미실행 — set 을 부르지 않는 정책 그대로, `CONTROL_*` 선언도 안 함) ⑤ 일괄 적용 실증 ❌(1차) ⑥ 취향 학습 연결 ⚠️ — **코드는 연결됐다**(`Intent.LiveCabin` → `observe(…, VEHICLE)`, Kotlin 테스트로 `realEvidence = 1건` 고정) 그러나 에뮬레이터에서 3번 이동을 반복해 후보 카드가 뜨는 것까지는 **미확인**.

## 4. 코드 변경 (출품본 변경 0 · 새 기능·화면 없음)

| 파일 | 무엇 | 왜 |
|---|---|---|
| `core/…/CopilotSession.kt` | `Intent.LiveCabin(CabinState)` · `CarState.cabinLive` · `liveCabin()`: 값이 오면 HVAC/DOOR 신호 OK, null 이면 ERROR, 모의 값으로 덮지 않음, HVAC 설정 온도는 `observe(VEHICLE)` | 실제 실내 값이 들어올 자리가 없었다. TS 에는 `LiveVehicle`·`LiveSignals` 와 같이 **거울 없음**(실차 입력은 Kotlin 전용 — PARITY) |
| `android/copilot/…/VehicleBridge.kt` | 두 번째 `Vehicle` 을 initialize 해 `PleosCabinStateSource` 연결 · snapshot+link combine | CarLink(출품본)는 Vehicle 인스턴스를 내놓지 않는다 · E3 ① |
| `android/copilot/AndroidManifest.xml` | `CAR_CLIMATE` · `CAR_DOORS` 조회 권한 | 설치 시 허용됨(dumpsys) |
| `android/copilot/…/CopilotScreens.kt` | 배지에 "공조·도어" · 값의 출처 공조 행 `real = cabinLive` | 차량 정보와 시연 데이터를 섞어 말하지 않기(정책 4) — 처음 캡처에서 배지는 "공조 차량 정보"인데 출처 표는 "시연 데이터"였다 |
| `core/…/CopilotSessionTest.kt` | "실차 실내 값 — LiveCabin …" | 위 규칙 고정 |

## 5. Virtual Console 을 명령줄로 조작하는 법 (공식 가이드 + 페이지 소스에서 읽은 것, 2026-10-29)

- 웹 페이지가 1초마다 `POST /browser/session?client=<id>` 하트비트를 보내야 `emulator_active` 가 되고, 그전엔 쓰기가 `503 {"error":"emulator_inactive"}` 다. 브라우저 없이 쓰려면 같은 POST 를 루프로 보낸다.
- 카탈로그 `GET /vehicle/catalog`(도메인 8 · 기능 63) · 상태 `GET /vehicle/state`.
- 쓰기: `POST /vehicle/hvac?driver_temp=23`(16~30, 0.5 단위) · `driver_seat=-3..3` · `power=true` · `POST /vehicle/gear?gear=Drive` · `POST /vehicle/ev-battery?field=soc&value=40` · `POST /vehicle/steering-wheel-heat?level=2` · `POST /vehicle/seat?...`(착석).
- 비공식(페이지 소스 추론)이라 버전이 바뀌면 깨질 수 있다. 시연은 브라우저 UI 로.

## 6. 2차 실행(같은 날 16:50~17:30) — ③ 시트 조회 · ④ 제어 권한 · ⑤ 제어 요청→콜백→재조회 · E4

오너 지시(V22 4절 4)의 순서대로. 전부 **Pleos Connect Emulator v2.1.0 에서 실제로 본 것**이고, 실차는 여전히 0건이다.

### 6-1. ④ 제어 권한 — 에뮬레이터 기준 서드파티 허용

`adb shell pm list permissions -f` 로 정의를 읽었다(`perms.txt`, 6,178줄).

| 권한 | 정의 패키지 | protectionLevel |
|---|---|---|
| `pleos.car.permission.CAR_CLIMATE` · `CAR_SEATS` · `CAR_DOORS` · `CAR_LIGHTS` · `CAR_ENERGY` · `CAR_INFO` · `CAR_SAFETY` · `CAR_WINDOWS` · `CAR_MIRRORS` · `CAR_DRIVE` · `CAR_TOLL` | `ai.pleos.playground.service.vehicle` | **normal** |
| `pleos.car.permission.CONTROL_CAR_CLIMATE` · `CONTROL_CAR_SEATS` · `CONTROL_CAR_DOORS` · `CONTROL_CAR_LIGHTS` · `CONTROL_CAR_ENERGY` · `CONTROL_CAR_WINDOWS` · `CONTROL_CAR_MIRRORS` · `CONTROL_CAR_SAFETY` · `CONTROL_CAR_INFO` · `CONTROL_CAR_TOLL` · `CONTROL_CAR_DRIVE` | 같음 | **normal** |
| `NAVI_ROUTE` · `NAVI_ROUTE_SEARCH` · `NAVI_NOTIFY` · `TTS_SERVICE` · `STT_SERVICE` · `LLM_SERVICE` · `ADAS_*`(조회) | navi · caas · adas | normal |
| `PRIVATE_CAR_*` | vehicle | normal |
| `CONTROL_ADAS_PARKING` · `HID_*` · `CAR_PIN_*` · Wi-Fi 계열 | — | signature\|privileged |
| `FUSED_LOCATION` | location.fused | dangerous |
| AAOS `android.car.permission.CAR_POWERTRAIN` | `com.android.car.updatable` | normal |
| AAOS `android.car.permission.CAR_SPEED` | **목록에 없음**(이 이미지에 정의돼 있지 않다) | — |

- 해석: **normal** 이면 매니페스트 선언만으로 설치 시 허용된다 — 에뮬레이터 안에서는 서드파티도 공조·시트를 제어할 수 있다. 실차·App Market 심사가 같은지는 **미확인**(설명회 질문 10 그대로).
- 실제 설치 결과(`dumpsys package app.commadrive.copilot`, user 10): `CAR_SEATS` · `CONTROL_CAR_CLIMATE` · `CONTROL_CAR_SEATS` **granted=true**. `CAR_SPEED` 는 이번 설치(`install -r -g`)에서 granted=true 로 보였다 — 1차(false)와 다르다. 정의가 없는 권한이라 값 자체를 믿지 않고, 속도 콜백 여부는 별도로 본다(E2 는 기어·주행 제한 콜백으로 "주행 차량 정보"가 켜진다).
- 이 결과로 `copilot-adapters` 의 "제어 권한 확인 전에는 제어 경로를 만들지 않는다" 조건이 **에뮬레이터 기준으로** 풀렸다. 제어 코드는 `PleosCabinControl.kt` 한 파일로 두고, `verifyReadOnly` 검사는 그 파일만 예외로 한다(그 밖의 파일에 set 이 들어오면 여전히 빌드 실패).

### 6-2. ③ 시트 조회 (E19) — 단계값 인코딩 실측

| 콘솔 Seat Temperature(driver_seat) | `getHvacSeatTemperature` | `getHvacSeatVentilationState` | 해석(SignalMapping) |
|---|---|---|---|
| V2(-2) | **-2** | 0 | 통풍 켬 |
| V1(-1) | -1 | 0 | 통풍 켬 |
| Off(0) | 0 | 0 | 둘 다 끔 |
| (앱이 `setHvacSeatVentilation(1)`) | 0 | **1** | 통풍 켬 |

- AAOS 정의 그대로다: `HVAC_SEAT_TEMPERATURE` 음수 = 냉방/통풍, 0 = 끔, 양수 = 열선 · `HVAC_SEAT_VENTILATION` 0 = 끔, 양수 = 바람 세기. 콘솔의 Seat Temperature 카드는 **시트 온도 한 축**만 바꾸고, 통풍 속성은 콘솔에 카드가 없다(앱이 통풍 1 을 켜도 콘솔 `seat_temp` 는 0 그대로).
- 변경 콜백(`registerHvacSeatTemperature`)은 온다 — 콘솔 -1 → 0 변경이 `seatHeatLevel=-1 → 0` 으로 들어왔다(01:17:46).
- 도어 잠금: 1차에서 운전석 영역(0x1)이 "area not supported" 였던 것을 **4문 합친 영역**(`DoorArea(ROW_1_LEFT, ROW_1_RIGHT, ROW_2_LEFT, ROW_2_RIGHT)` = 0x55)으로 바꾸자 `doorLocked=true` 가 읽힌다.
- 해석 규칙은 `SignalMapping.seatVentOn(vent, heat)` / `seatHeatOn(heat)` 로 core 에 두고 테스트했다(통풍 = 통풍 단계 > 0 **또는** 시트 온도 < 0).

### 6-3. ⑤ 제어 요청 → 콜백 → 재조회 — 두 장면

**장면 A — 아빠 · 혼자(저장 22°C · 통풍 켬)**, 차량 23°C · 통풍 끔 → 카드 "변경할 설정이 2개 · 공조 온도 23→22 · 통풍시트 끔→켬" → **2개 한 번에 적용**:

```
01:24:24.995 setHvacTempC(22.0) applied=22.0            ← HVAC.setHvacTemperature 콜백(차량이 적용한 값)
01:24:25.045 CabinState(hvacSetC=22.0, …, seatVentLevel=0)   ← registerHvacTemperature 리스너 재조회
01:24:25.262 setSeatVent(true) applied=1                 ← Seat.setHvacSeatVentilation 콜백
01:24:25.272 CabinState(hvacSetC=22.0, …, seatVentLevel=1)   ← registerHvacSeatVentilation 리스너 재조회
```
화면: "✓ 2개 중 2개 적용 · 공조 온도 적용됨 · 적용 확인 · 통풍시트 적용됨 · 적용 확인"(모의 표기 없음) · 값의 출처 "공조 설정 온도 22°C · 차량 정보" · **Pleos 셸의 공조 바가 23.0 → 22.0 으로** 바뀜 · 콘솔 `driver.temp_c` 22.0.

**장면 B(오너가 바란 장면) — 아빠 · 가족(저장 23°C)**, 차량 22°C → "변경할 설정이 1개 · 공조 온도 22→23" → **1개 한 번에 적용**:

```
01:26:06.562 setHvacTempC(23.0) applied=23.0
01:26:06.725 CabinState(hvacSetC=23.0, …, seatVentLevel=1)
```
화면: "1개 중 1개 적용 · 공조 온도 적용됨 · 적용 확인" · 셸 공조 바 23.0 · 콘솔 23.0. 캡처 `captures/emulator/E19-family-before.png` · `E19-family-after.png` · `E19-solo-applied.png`.

- 이번 실행에서는 **배터리도 차량 정보**로 들어왔다(배지 "배터리 100% · 차량 정보" · 재판단 토스트 "부족 → 충분"). 1차의 E3 ①(combine) 수정이 효과를 봤고, CarLink 4초 타임아웃은 부하가 낮을 때는 넘지 않는다.
- 결과 출처는 `Intent.CabinResults(…, ControlSource.VEHICLE)` 로 세션에 들어가 "(모의)" 꼬리표가 붙지 않는다. 재조회로 돌아온 같은 값은 학습 관찰 출처 **APP** 으로 걸러져 실차 증거로 세지 않는다(테스트로 고정).

### 6-4. E4 — 기어 P → D → P

콘솔 `POST /vehicle/gear?gear=Drive` → 앱 "가족 이동 · 주행 중 · 한 줄 화면 / 도착까지 에너지 문제 없음 · 추정 / 설정·비교는 정차 후에 · 배터리 100% · 차량 정보" → `gear=Park` → 준비 카드(적용 결과 유지)로 복귀. 캡처 `E04-gear-D.png` · `E04-gear-P.png`.

### 6-5. 에뮬레이터 운영에서 겪은 것 (시연 때 그대로 겪을 수 있다)

- **콘솔의 HVAC 온도 쓰기가 이번 부팅에서는 VHAL 에 닿지 않았다**: `POST /vehicle/hvac?driver_temp=24/25` 에 콘솔 상태는 잠시 24/25 를 보이다 실제값(23)으로 되돌아오고, SDK·셸 바도 23 그대로. 시트·기어 쓰기는 된다. 1차(24→23 콜백)와 다르며 원인 미확인 — 공조 온도를 바꾸는 확실한 길은 **앱의 set**(위)이었다.
- **SystemUI ANR → 검은 화면**: 호스트 여유 메모리 0.7~1.8GB 상태에서 `com.android.systemui` 가 ANR 로 죽고 창 관리자가 창을 하나도 못 올렸다(screencap 전부 검정). 복구는 `adb emu kill` 후 **콜드 부트 재실행**(131초).
- **내비 앱 재시작 루프**: 재부팅 뒤 `ai.umos.maps.android.navigation.app` 이 "내비게이션을 실행 중입니다" 자리표시자로 계속 재시작하며 앞으로 와서 앱 창을 가렸다(게스트 load 15~25 / 4 vCPU). 테스트 사용자(10)에서 `pm disable-user --user 10 ai.umos.maps.android.navigation.app` · `… ai.umos.ambientai` 로 끄자 앱이 앞에 남았다. 되돌리기: `pm enable --user 10 <pkg>`. **시연 전에 원복할 것**(출품 앱 E11 내비 경유지 확인에는 내비가 필요).
- `adb shell input tap` 이 GNB(셸 하단 바)에는 먹지 않았다(공조 ^ 버튼 · 앱 목록). 앱 창 안의 버튼은 된다.
- uiautomator dump 는 "null root node" — Compose 트리를 못 읽는다. 좌표는 캡처로 잡았다.

### 6-6. 이번에 못 본 것

- ⑥ **학습 후보**가 에뮬레이터에서 3번 이동 뒤 뜨는 장면 — 코드·JVM 테스트까지(`CopilotSessionTest` 실차 재조회 APP 걸러내기 포함). UI 로 3번 이동을 돌릴 시간을 에뮬레이터 안정화에 썼다.
- 열선 **set**(`setHvacSeatTemperature`) — 조회만 봤다. 통풍 set 과 같은 경로라 코드는 있으나 실행은 안 했다.
- HVAC 전원 set · 조명 · 핸들 열선(API 없음) · E11/E12(출품 앱 NaviHelper) · E9 효율 콜백(여전히 안 옴) · 실차.

## 7. 3차 실행(같은 날, 에뮬레이터 시계 06:52~07:14) — ⑥ 학습 후보 · 열선 set · E14 · 출품 앱 E11

캡처는 `captures/emulator/E20-*.png` · `E21-*.png` · `E14-back.png` · `E11-*.png`, 로그는 `E20-logcat-3rd-run.txt` · `E21-logcat-3rd-run.txt` · `E11-logcat-submission-app.txt`.

### 7-1. ⑥ 학습 후보 (E20) — 에뮬레이터 콜백 3번 → 후보 카드 → 저장 → "이미 맞음"

| 단계 | 한 것 | 본 것 |
|---|---|---|
| 이동 #1~#3 | 아빠 운전자 · 프로필 탭에서 **혼자 이동** 칩을 고름(준비 중 재선택은 `Memory.startTrip` 으로 새 이동 번호) · 각 이동에서 콘솔 **도어 잠금/열림**을 바꿔 `LiveCabin` 콜백을 일으킴(`CabinState(hvacSetC=23.0, …)` 06:56:59 · 06:57:57 · 06:58:22) | 기록 탭 "이동 #1 ~ #4 · 혼자 이동 프로필로 바꿔 출발 준비" (`E20-trips.png`) |
| 이동 #4 | 혼자 이동을 다시 고름 | 홈에 후보 카드 **"최근 3번 이동에서 혼자일 때 공조 온도가 23°C였어요 — 탑승 조합 취향으로 저장할까요?"** — "시연 데이터 ·" 머리말 **없음**(출처 VEHICLE) · 밑줄 "최근 이동의 값만 봅니다 · 계절·외기온은 고려하지 않음 · 누가 바꿨는지는 SDK 가 알려 주지 않음" (`E20-candidate.png`) |
| 저장 | "저장" 탭 | 준비 카드 "앱에서 바꿀 수 있는 설정은 없습니다 · **공조 온도 23°C · 이미 맞음** · 통풍시트 켬 · 이미 맞음" — 아빠|SOLO 의 `soloCabin` 에 23 이 들어갔다 (`E20-saved.png`) |

한계를 그대로 적는다: ① "3번 이동"은 출발→주행→하차를 돈 것이 아니라 준비 중 조합 재선택으로 번호를 올린 것이다(규칙상 같은 '다른 이동'). ② 콘솔의 HVAC 온도 쓰기가 안 먹어 관찰된 23°C 는 2차에서 **앱이 올린 값**이다 — 다른 이동의 기억이라 코드가 VEHICLE 로 집계했지만, "차에서 누군가 돌린 값"은 아니므로 **실차 증거라 부르지 않는다**(에뮬레이터 콜백).

**발견한 정합성 결함 → 고침**: 저장 뒤에도 오른쪽 "지금 제안" 카드는 **"저장한 온도 22°C 로 맞출까요? · 혼자 이동 프로필 저장 온도 22°C"** 를 띄웠다(`E20-saved.png` 우측) — 단건 공조 흐름(제안·출발 준비 항목·확인)이 프로필 `targetC` 만 보고, 일괄 적용만 합친 취향(`combinedPrefs`, soloCabin 포함)을 봤다. V21 ② 와 같은 종류. `CopilotSession`(`targetC = prefsOf(s).hvacTempC` · `confirmClimate`) 과 TS 거울(`copilot-sim` · `PrepareScreen.targetC` · `climateGapOfTarget`)을 같이 고치고 세션 테스트 "취향 학습"에 고정(저장 뒤 24°C 차량은 SAME · 22°C 차량엔 "저장한 온도 24°C 로 맞출까요?" · ConfirmClimate 목표 24). 고친 빌드를 다시 설치해 같은 절차(가족 적용으로 23°C → 혼자 이동 3번 콜백 → 후보 → 저장)를 반복: 저장 뒤 "지금 제안"은 **"지금은 제안이 없습니다"**, 준비 카드 "공조 온도 23°C · 이미 맞음" (`E20-saved-fixed.png`) — 에뮬레이터에서 재확인했다.

### 7-2. 열선 set (E21) — 엄마·혼자

콘솔 시트 Off(0/0) 에서 엄마 · 혼자 이동 → 준비 카드 "변경할 설정이 1개 · **열선시트 끔 → 켬** · 핸들 열선 끔 → 켬 · 지원 확인 전 · 차량에서 직접" (`E21-mom-solo-before.png`) → "1개 한 번에 적용" → 로그 `setSeatHeat(true) applied=1` → 재조회 `CabinState(… seatHeatLevel=1)` → 화면 "✓ 1개 중 1개 적용 · 열선시트 · 적용됨 · 적용 확인" (`E21-mom-solo-after.png`). 콘솔 `seat_mode: Heating, seat_temp: 1` · Pleos 셸 하단 시트 아이콘이 열선 표시로 바뀜. 이것으로 `setHvacSeatTemperature` 도 에뮬레이터 확인 — `SdkStatus` 의 열선 행도 "에뮬레이터 확인"으로 올릴 근거가 생겼다(코드 반영은 이번 커밋).

### 7-3. E14 — 백그라운드 → 복귀

`ai.umos.applibrary/.AppGridActivity` 를 앞으로 띄웠다가 앱을 다시 앞으로: 프로세스 유지(pid 같음) · 화면·상태 그대로 (`E14-back.png`). 프로세스가 죽는 경우(저장 없음)는 미검증 — HANDOFF "이번 이동 저장" 그대로. Pleos 셸에서 `input keyevent HOME` 은 먹지 않았다(다른 액티비티를 띄워야 한다).

### 7-4. 출품 앱 쉼표 DRIVE (E11 · E3 · E8) — `apk/` 그대로 설치본

| 본 것 | 뜻 |
|---|---|
| 부하가 낮을 때(loadavg 7) 배지 **"차량 연결됨 · Vehicle SDK" · "내비 연결됨 · NaviHelper"** 둘 다 LIVE (`E11-app.png`) · 로그 `onRouteStateInfo/onDestinationInfo/onWayPointInfo` · `EV_BATTERY_SOC = 100` · `INFO_EV_BATTERY_CAPACITY = 77400.0` | 2차의 DEMO 후퇴는 부하 탓이 맞다(E3). 시연 때 호스트를 비워 두면 연결된다 |
| 차량 값 카드 "배터리 용량 **77400 kWh**" | E8 의 Wh/kWh 단위 결함이 **화면에 그대로** 보인다 — 2차 PT 빌드 전에 고쳐야 한다(오너 판단) |
| 내비에 목적지가 없어 "내비 목적지까지 **0km** (NaviHelper)" → 판단하기 → "**충분** · 주행 0% (추정 0%~0%) · 도착 예상 잔량 100% · 안성에서 80%까지 (약 0분)" (`E11-judge.png`) | **출품본 결함(새로 발견)**: 내비 남은 거리 0 을 그대로 여정 거리로 쓴다. 목적지 없음이면 "목적지 없음 · 시연 계획 거리로 판단" 같은 분기가 필요하다. 1차 출품본은 바꾸지 않았다 — 오너 판단 |
| 후보 "안성휴게소 88 · 경유지로 추가" 탭 → 로그 `addWaypoint`(07:13:31) → **내비 앱이 앞으로 나와 검색 화면**("어디로 갈까요?", 현재 위치 수정구 시흥동) → 10초 안에 `onWaypointChanged` **없음** → `removeListener`(07:13:41) → 앱으로 돌아오면 다이얼로그 **"내비게이션에 연결하지 못했어요. 지금 경로는 그대로예요."** (`E11-waypoint.png` · `E11-result.png`) | E11 ⚠️: 요청은 갔고 경로는 바뀌지 않았다(정책 1). 경로(목적지)가 없는 상태의 `addWaypoint` 는 콜백 없이 내비가 검색 화면을 연다 — **목적지를 먼저 잡아야** 진짜 ADD 콜백을 볼 수 있다(E12 와 함께 미실행). 다이얼로그 문구는 "연결 실패"가 아니라 **"응답 없음"** 이 맞다(연결은 돼 있었다) — 문구 수정은 오너 판단 |

### 7-5. 운영 — "내비 재시작 루프"의 진짜 원인

내비 앱을 `pm disable-user` 하면 **홈 화면(`ai.umos.homescreen`)이 `ActivityNotFoundException`(내비 MainActivity 없음)으로 무한 크래시**하고, 그 churn 이 우리 앱 프로세스까지 "remove task" 로 죽였다(3차 첫 실행에서 재현, 로그). 2차의 검은 화면·앱 창 가림 일부도 이 때문이다. `pm enable --user 10 ai.umos.maps.android.navigation.app` · `ai.umos.ambientai` **원복 완료** → 셸이 정상 배치로 돌아왔다: **왼쪽 Driving view(차량·0 km/h·P R N D) + 오른쪽 앱 창**(`E21-shell-layout.png`). 2차 캡처들의 "앱이 화면 왼쪽 전체" 배치는 내비 비활성 상태의 비정상 배치였다 — **내비 앱을 끄지 않는다**(메모리 갱신). SystemUI 검은 화면은 3차에서도 한 번(앱 force-stop·재시작 직후 loadavg 19) — 콜드 부트로 복구, 부팅 뒤 60초는 손대지 않는다.

### 7-6. 이번에도 못 본 것

HVAC 전원 set(SDK 에 `setHvacPower`·`getHvacPowerState`·`registerHvacPowerState` 있음을 javap 로 확인 — 경로 미구현) · E12 도착 잔량 단위(목적지 설정 필요) · E6 주행 제한 켜짐 · E7 SOC 변경 → 재판단 화면 · E13 창 크기 · E16 부분 연결 · 프로세스 종료 뒤 복귀 · 실차.

## 8. 다음 (이 PC 에서 가능)

1. 출품 앱 E11 제대로: 내비에 목적지(부산 등)를 먼저 잡고 `addWaypoint` → `onWaypointChanged(ADD)` · E12 `remainDestinationChargingInt` 단위.
2. E3/E8/내비 0km — **출품본**(`android/app`·`adapters`) 쪽. 오너 결정 뒤 2차 PT 빌드에서.
3. HVAC 전원 set 경로(`CabinControl.setHvacPower`)는 필요해지면 — 시연 프로필의 전원 취향은 null 이라 지금은 쓰이지 않는다.
4. 시연 때: Chrome·VS Code 닫기, Gradle 데몬 중지, AVD RAM 4GB — 부팅 ~2분, 부팅 뒤 60초 대기, 앱 첫 실행 10~30초. **내비 앱을 끄지 않는다.**
