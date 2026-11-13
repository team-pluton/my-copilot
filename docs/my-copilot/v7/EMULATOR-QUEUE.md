# 에뮬레이터 작업 대기열 (2026-11-10 정리)

> **2026-11-10 저녁 1차 실행 결과 → `docs/android/emulator/E27-2026-11-10.md`**: Q1 · Q2 · Q4 · Q5 · Q7 · Q8 · Q9 완료(✅) · **Q3 1차 편집본 `docs/video/MY-CO-PILOT_demo_v1.mp4`(2분 31초)**. Q10 · Q13 · Q14 도 완료. **남은 것은 Q6(주행 신호 없음 — 실차 필요) · Q11(onFailed 유발 조건 없음) · Q12(주행 제한 콘솔 카드 없음)** — 에뮬레이터로는 재현 수단이 없다.

> 오너 지시(2026-11-10): 에뮬레이터 작업은 **한데 모아 두고**, PC 메모리를 비운 날 한 번에 진행한다.
> 흩어져 있던 항목(HANDOFF · ARRIVE-READY-FEASIBILITY · 런북)을 여기로 모았다. 끝나면 결과를 원래 문서에 적고 이 줄을 지운다.
> 런북 상세: `../EMULATOR-RUNBOOK.md` · 결과 기록 형식: `docs/android/emulator/E26-2026-11-09.md` 처럼 `E27-…` 로.

## 0. 시작 전 준비 (매번)

| 단계 | 명령 · 확인 |
|---|---|
| 메모리 | 커밋 여유 **4,096MB 이상** 필요(11-09 실패 때 2,810MB). 다른 프로젝트 `next dev`(campsite · campsite-c2 · semoduck) · Chrome · 남은 Gradle/java 종료. PowerShell: `Get-CimInstance Win32_OperatingSystem` 의 FreeVirtualMemory |
| 에뮬레이터 | `<tools>/android-sdk/emulator/emulator -avd pleos_connect_v210` (AVD `<tools>/avd`) · 부팅 약 104초 |
| adb | `<tools>/android-sdk/platform-tools/adb.exe` · **항상 `-s emulator-5554`**(폰 R3CR114AR8H 도 붙어 있다 — 부팅 확인을 폰에서 읽은 적 있음) |
| 콘솔 | `adb -s emulator-5554 forward tcp:8088 tcp:8088` → `http://127.0.0.1:8088/` · 명령줄 쓰기는 1초마다 `POST /browser/session?client=cli` 하트비트 필요(없으면 `emulator_inactive`) |
| 충전소 프록시 | `npx tsx scripts/charger-proxy/server.ts --demo` (8787, `.env` 의 `recharge_key` · 켜지면 미리 받기 7초 · `--demo` 는 4분마다 상태 갱신 2시간) → `adb -s emulator-5554 reverse tcp:8787 tcp:8787`. 다시 켤 때는 포트를 잡은 node 를 먼저 끈다 |
| 앱 | **Git Bash 에서는 `MSYS_NO_PATHCONV=1`**(아니면 `/sdcard` 경로가 바뀐다) · 앱은 user 10 — `pm clear --user 10` · 창 전환은 셸 아이콘으로(`am start` 반복은 창이 쌓인다) · `adb -s emulator-5554 install -r apk/플루톤_MY-CO-PILOT_release.apk` (SHA-256 `8d61383b…`, 2026-11-12 E30 연결 실패 문구 수정본) |
| 내비 | 집이 등록돼 있는지 확인(미등록이면 HOME (0,0) → Invalid Parameter, E23-01). **내비 앱을 `pm disable` 하지 않는다**(홈 무한 크래시) |

## 1. 🔴 1차 제출용 (11/15 전 — 우선)

| # | 작업 | 통과 기준 | 결과 적을 곳 |
|---|---|---|---|
| Q1 ✅ | **실데이터 리허설** — 장거리 여정에서 결정 카드가 `LIVE_API` 로 뜨는가 | 카드 출처가 "공공 API 조회" · 받은 시각 표시 · 시연 데이터(금강 · 죽암 · 황간 · 김천 MOCK)가 아닌 실 휴게소 | HANDOFF · `v6/TEST-RESULT-V6.md` |
| Q2 ✅ | 경유지 승인 → `addWaypoint` → **목록 재조회 확인** · `onWaypointChanged(ADD)` 오는지(G2) | 앱이 "반영 확인" · 콜백 유무 기록(안 와도 재조회로 확인되면 통과) | `v6/SDK-EVIDENCE-V6.md` |
| Q3 ✅ | **시연 영상 녹화** — V7 서사: ① 픽업 Mission(동력원 무관) → ② ENERGY & STOP(실 API) → ③ ARRIVE READY 는 **목업 · 로드맵 한 장**(영상에서 동작하는 척 안 함) | 구간마다 자막 [에뮬]·[실 API]·[시연]·[미구현] · 대본 `v7/DEMO-VIDEO-V7.md` | `docs/08-submission.md` 영상 칸 |

## 2. ARRIVE READY 관문 (PT 준비 — 새 코드 없이 출품 APK 의 "requestTrip 시험" 버튼)

| # | 작업 | 통과 기준 |
|---|---|---|
| Q4 ✅ | Gate B — **목적지 없음** 상태에서 `requestTrip(주차장 좌표)` | 응답(거리 · 초) 또는 오류 코드 기록. 안 오면 ARRIVE READY 에 "먼저 목적지를 내비에" 단계 |
| Q5 ✅ | Gate B — 가까운 좌표 2~3개 **연속 호출** | 각각 응답 · 간격 · 섞이지 않는가(`onTripInfo` 에 어느 요청 답인지 표시가 없으면 순차 호출로) |
| Q6 | Gate B — `remainTime` 단위 · 갱신 주기 | 초/분 · 몇 초마다 |
| Q7 ✅ | **Gate C — 임의 좌표(서울 시영 주차장, 예: 세종로 공영주차장 37.5734, 126.9759)로 `requestRoute`** | `onRouteStarted` → `getDestinationInfo` 같은 장소. 안 되면 `addWaypoint` 대체 확인 · poiId 없이 되는가 |
| Q8 ✅ | B3 — 일정 제공자 유무 `adb -s emulator-5554 shell content query --uri content://com.android.calendar/calendars` | 있음/없음 기록(`../B-RESEARCH-2026-11-10.md`) |

Q7 은 시험 버튼이 없다 — 집 경로(`RouteHandoff`)만 있다. 버튼이 필요하면 **v7 브랜치에서 개발용 칩 하나**만 더한다(출품 APK 는 건드리지 않는다).

## 3. 남은 런북 (여유 있을 때)

| # | 작업 | 출처 |
|---|---|---|
| Q9 ✅ | 기존 경로가 있을 때 귀가 안내 교체 확인(CONFIRM_REPLACE) · 응답 없음 경로 | HANDOFF V5 (E23 남은 것) |
| Q10 ✅ | Virtual Console 로 SOC 변경 → 재판단 기록이 쌓이는가 (CarLink 타임아웃) | E7 · HANDOFF |
| Q11 | `VehicleListener.onFailed` 가 오는 조건 → 세션 `SignalStatus.ERROR` 배선 판단 | 런북 E17 |
| Q12 | CarUxRestrictions 켜짐 재현 방법(콘솔 카드 없음) · HVAC 전원 set(`setHvacPower`) | E6 · research |
| Q13 ✅(research 12절 — 콘솔에 연료 카드 없음 · 동력원 필드 없음, 실측 불가) | Fuel 카드 · 동력원 판별(`checkFuelPercentCapabilities`) | 설명회 질문 13 |
| Q14 ✅ | 폼 팩터(17" · 14.6" · 12.9" × 세로/가로) — 앱 창 크기 | PT 준비 |

## 순서 권고

메모리를 비운 날 한 번 부팅으로: **0 → Q1 → Q2 → Q4~Q7 → Q3(녹화는 마지막, 앞에서 확인된 장면만)** → 시간이 남으면 Q8 이후.
