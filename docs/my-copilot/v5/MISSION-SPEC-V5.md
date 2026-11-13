# MISSION SPEC V5 — Journey Mission 유형 · 상태 · 데이터 · 예외 정책 (2026-11-02)

코드: `src/lib/assistant/mission.ts` ↔ `core/.../assistant/Mission.kt`(거울) · 세션 `CopilotSession.kt` · 테스트 `mission.test.ts` ↔ `MissionTest.kt`.

## 1. 원칙 — Mission 은 상태에서 계산한다

Mission 은 새 엔진이 아니라 **이미 있는 엔진에 공통된 목표와 진행 상태를 전달하는 최소 상태 객체**다(지시서 3절). 그래서 값 대부분을 따로 저장하지 않고 `missionOf(상태)` 로 계산한다. 따로 드는 값은 셋뿐이다:

| 값 | 뜻 | 바뀌는 때 |
|---|---|---|
| `nextLegReady` | 귀가 구간 준비를 사용자가 확인했나 | NEXT_LEG 수락 → true · 구간이 바뀌면(차가 출발) false |
| `waitSource` | 대기 시간의 출처 — SAVED(저장된 계획) · USER(직접 확인·변경) · NONE(없음) | 고를 때 SAVED(프로필 없이는 NONE) · 대기 시간·유형을 바꾸면 USER |
| `endedEarly` | 귀가 구간을 남긴 채 사용자가 끝냈나 | END_TRIP 이 마지막 구간이 아닐 때 |

## 2. 유형

| MissionType | 프로필 | 구간 | 대기(저장된 계획) | 비고 |
|---|---|---|---|---|
| SOLO_COMMUTE 혼자 출퇴근 | SOLO | 편도 24km | 0 | 제안 없음이 정상 |
| WORK_VISIT_RETURN 업무 방문 후 복귀 | WORK | 왕복 38+38km | 90분 · 차를 두고(AWAY) | 대표 1 · 귀가 일정 확인 제안 |
| FAMILY_TRIP 가족 이동·여행 | FAMILY | 편도 400km | 40분 · 차 안 | 대표 2 · 에너지 부족 → 경유지. **편도 그대로**(수치 보존) |
| PICKUP_RETURN 픽업 후 귀가 | **PICKUP(신규)** | 왕복 12+12km | 20분 · 차 안 | Mission C · 복원 시연 |
| OUTING 동승 외출 | COMPANION | 편도 18km | 0 | 기존 프리셋 — 지우지 않는다 |
| (없음) | GUEST | 편도 400km | 0 · NONE | 프로필 없이 — 유형·복귀 없음 |

프리셋 값은 전부 **시연 데이터**다. 실제 사용자는 저장된 기록이 없으면 "지난번처럼"이 뜨지 않는다 — 존재하지 않는 방문지·가족 구성을 추정하지 않는다.

## 3. 데이터(지시서 3절 필수 항목 ↔ 구현)

| 지시서 | 구현 | 출처 |
|---|---|---|
| missionId | `모드#이동번호` | Journey Memory tripId(프로필별) |
| missionType | 위 표 | 프로필 |
| driverId / UNKNOWN | `driverId: string \| null` | 사용자 수동 선택(공식 인식 API 없음) |
| occupancyType | OCCUPANCY_OF[프로필] | situation.ts |
| destination · 확인된 경유지 | plan.destinationName · 내비 콜백으로 추가된 waypointIds | TripPlan · AddWaypointResult |
| tripPurpose | JOURNEY_OF[프로필] (COMMUTE·BUSINESS·TRIP·OUTING·**PICKUP**) | situation.ts |
| optionalReturnDestination | plan.returnKm > 0 이면 "집 (귀가)", 아니면 null | TripPlan |
| confirmedWaitMinutes | `wait: { minutes, source }` | plan.waitMinutesAfterArrival + waitSource |
| currentPhase | `missionPhaseOf(journey, waitMode, nextLegReady)` | 아래 4절 |
| remainingLegs | legs − leg (완료면 0) | JourneyState |
| capabilityAvailability | `capability.energy` (EV 특화 기능의 가용성) | freshness.ts availability |
| createdAt / updatedAt | 출발 준비 시각 / 시연 시계 | SessionState.missionStartedAt · clock |
| status | ACTIVE · COMPLETED · CANCELLED(귀가 남긴 채 종료) · PAUSED(**미사용** — 연결 끊김은 판단 보류로 따로 표현) | |

## 4. 수명 주기 — 여정 단계와의 대응

```
여정(journey)                 Mission                           비고
NOT_STARTED               →  MISSION_SELECTED                   고른 뒤 준비 전
PREPARING                 →  PREPARE                            비교 · 승인 하나 · 준비물 · 에너지
DRIVING / APPROACHING     →  EN_ROUTE (leg 0) / RETURNING (leg 1)
PARKED · atDestination=false → EN_ROUTE / RETURNING             중간 정차(휴게소·충전소)는 이동 중의 일
PARKED/FINISHING · atDestination → ARRIVED_AT_STOP               finalStop = 마지막 구간이면 true
WAITING                   →  WAITING(차 안) / VISITING(차 밖) / NEXT_LEG_READY "귀가 확인 · 내비 미설정"(귀가 일정 확인 뒤 — 내비 목적지 설정 아님)
COMPLETED                 →  COMPLETED
```

모든 Mission 이 모든 상태를 거치지 않는다 — 편도는 ARRIVED_AT_STOP(final) → COMPLETED.

## 5. 정책(지시서 4절) ↔ 어디서 지키나

1. 중간 목적지 도착 ≠ 완료 — `journey.ts` FINISH_DONE: 마지막 구간이 아니면 WAITING. 테스트 "픽업 Mission — 픽업 장소 도착은 완료가 아니다".
2. 귀가 계획 보존 — `Trip.remainingPlan` 이 가는 길에도 귀로 에너지를 센다 · `returnDestination` 유지.
3. 대기 시간은 입력·확인된 데이터만 — 프리셋(저장된 계획) 또는 사용자 변경. **추정 코드 없음**. 프로필 없이는 NONE 으로 표시.
4. 도착 후 HVAC 켜짐 가정 안 함 — IN_CAR 는 "공조 사용 가정"이라 쓰고, 차량이 알려 주면 그 값(`v.hvacOn`).
5. 신호 끊김 — 필수 입력(readiness)만 보류. Mission 은 PAUSED 로 두지 않고 그 판단만 "확인 못 함".
6. 재시작·백그라운드 복귀 — `MissionSnapshot`(6절).
7. 완료는 근거·확인으로만 — Complete 는 FINISHING + Safety Gate + 체크리스트.
8. 내비 목적지·경유지 자동 변경 금지 — NEXT_LEG 수락은 nextLegReady 표시뿐이고, 화면은 "내비 목적지는 아직 설정되지 않았습니다"라고 말한다(오너 결정 2026-11-03 ④), NaviHelper 호출 없음(테스트 "수락은 내비를 바꾸지 않는다": plan·waypoints 불변).

## 6. 복원(MissionSnapshot)

담는 것(확인된 것만): 프로필·운전자·선택 · 계획 · 여정 구간 · 진행 거리·대기 시간·시연 시계 · 대기 유형·출처 · 귀가 준비 · 조기 종료 · Journey Memory · 경유지 id · 충전 기록 · (모의 차량의) 배터리·주행 시간 · 저장 시각.
담지 않는 것: 진행 중 제어 요청(결과를 모르는 명령을 다시 보내지 않는다 — 재조회가 먼저) · 알림 기준(복원 뒤 지금 값으로 다시) · 위치 이력(어디에도 저장 안 함) · 후보의 좌표·시설(id 로 다시 찾는다).

복원 규칙: `restorable` = 고른 뒤 · 출발 준비 이후 · 완료 전. 여정 단계는 저장값을 믿지 않고 **지금 차 신호로 다시 판단**(`Journey.restore` = `next`) — 저장은 대기 중인데 차가 달리면 귀가 구간. 실제 차량에서는 콜백이 모의 값을 덮는다.
저장 위치: 웹 `localStorage copilot.v5.mission` · 차량용 앱 `SharedPreferences copilot.mission`(JSON, `MissionStore.kt`). 손상된 값은 버린다(반쯤 복원하지 않는다).

## 7. 예외

| 상황 | 동작 |
|---|---|
| 복귀 목적지가 없는 Mission(편도) | NEXT_LEG 제안 없음 · returnLine 없음 |
| 대기 중 주행 시작(사용자가 준비 확인 없이 출발) | journey 가 귀가 구간으로 넘김 · nextLegReady 는 false 로(그 구간의 것이었다) |
| 귀가 남긴 채 종료 | status CANCELLED · 기록 "귀가 구간 남은 채로" |
| 프로필 없이(GUEST) | missionType null · 복귀 없음 · 대기 NONE · 기록 없음 |
| 동력원이 EV 가 아님 | capability.energy false → 에너지만 끄고 공통 Mission 기능은 그대로 |
| 내비 경로 없음 | 근거 등급 NO_ROUTE → 에너지 판단 보류(기존) |

## 8. 미구현·보류(과장하지 않는다)

- PAUSED 상태 미사용.
- 픽업 완료 여부 — 사용자 확인(하차·귀가 출발)으로만. 외부 이벤트(출석·제3자 위치) 수집 없음(지시서 7절).
- 복귀 목적지를 내비에 넣는 것 — 공개 NaviHelper 에 목적지 설정 API 가 확인되지 않았다(경유지만). 사용자가 직접 설정한다.
- 복원을 **실제 프로세스 종료**로 확인한 것은 에뮬레이터 런북 E22(`SDK-EVIDENCE-V5.md`)에 적는다 — 그 전에는 JVM 테스트·웹 시뮬레이터 수준이다.
