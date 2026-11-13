# Goal Decision Engine — 판단 단계 (V7 설계 · 2026-11-10)

> 서비스마다 엔진을 따로 만들지 않는다(오너 지시 7절). V6 `IntegratedDecision`(충전)이 이미 이 단계를 밟는다 — V7 은 그 단계를 **목표 종류와 무관한 골격**으로 꺼내고, 충전·주차는 "후보 공급 + 필수 조건" 만 갈아 끼운다.

## 11 단계와 지금 있는 부품

| # | 단계 | 지금 부품 (구현됨) | V7 에서 |
|---|---|---|---|
| 1 | 이동 목표 확인 | `Mission.of` · `Situation`(DRIVER×OCCUPANCY×JOURNEY) | `JourneyGoal` 로 감싼다 |
| 2 | 필수 제약 추출 | 에너지 하한 · 동승자 조건(`IntegratedDecision`) | `constraints`(ARRIVE_BY · PARK_NEAR · BUFFER_MIN …) |
| 3 | 차량·내비 데이터 조회 | `VehicleEnergyRaw` · `SdkUnits` 정규화 · `PleosNavigationProvider.refresh` | `requestTrip` 후보 시간(Gate B) |
| 4 | 외부 서비스 수집 | `ChargerFeed`(`FactMeta`) | `ParkingProvider` |
| 5 | 필수 조건 위반 후보 제거 | `ExcludedStop(reason)` — 상태 미확인 · 도달 불가 · 규격 불일치 | 좌표 없음 · 운영시간 밖 · 실시간 STALE(대수만 숨김) |
| 6 | 남은 후보 비교 | `StopCandidate` 점수(이유 문장 포함) | 주차: 시간 여유 범위 > 신선한 여유 대수 > 요금 규칙(동점일 때만) |
| 7 | 추천 하나 + 대안 | `JourneyDecision`(RECOMMEND · 대안 ≤2) · `DecisionSurface`(주행 중 OneLine) | 그대로 |
| 8 | 사용자 승인 | `SafetyGate` · 승인 카드 | 그대로 |
| 9 | 공식 SDK 로 실행 | `CabinControl` · `RouteHandoff`(requestRoute) · `WaypointHandoff`(addWaypoint · 슬롯 교체 묻기) | 주차장을 목적지 또는 경유지로(Gate C) |
| 10 | 콜백 · 재조회로 확인 | `HandoffEvent` VERIFIED / 재조회 | 그대로 → `executionEvidence` |
| 11 | 목표 상태 갱신 | `Mission.naviRouteVerified` · Journey Memory | `GoalStatus` |

## 결과의 종류 (V6 `DecisionKind` 를 일반화)

| 결과 | 뜻 | 화면 |
|---|---|---|
| `NOT_APPLICABLE` | 이 목표에 해당 없음(예: 비EV 의 에너지) | 안 보임 |
| `CANNOT_JUDGE` | 필수 입력 없음(약속 시간 · 남은 시간 · 좌표) | "판단할 정보가 부족해요" + 무엇이 없는지 + 직접 할 수 있는 일 |
| `ON_TRACK` (충전: `NO_CHARGE_NEEDED`) | 지금 계획으로 충분 | 조용히 한 줄 |
| `RECOMMEND` | 추천 하나 + 대안 | 승인 카드 |
| `NO_RELIABLE` | 후보는 있으나 믿을 만한 것이 없음 | "믿을 만한 정보가 없어요" — 숫자 없이 |

## RECOVERY — 다시 판단할 때

V6 `ReplanNotice(changed, message)` + `NotificationPolicy` 가 골격이다.
- 다시 계산하는 계기: 승인된 계획의 근거 중 하나가 바뀜(주차 대수 STALE→FRESH 변화 · 충전기 상태 변화 · 내비 남은 시간이 크게 늘어 여유 범위가 0 을 넘나듦 · 목적지가 사용자에 의해 바뀜).
- 알리는 조건: **결과가 달라질 때만**(추천이 바뀌거나 계획이 AT_RISK/INFEASIBLE 로). 값이 조금 변했다고 알리지 않는다.
- 문장: 확인된 사실만. "문제가 생겼어요"가 아니라 "P1 주차장 정보가 14:20 이후 갱신되지 않았어요".
- 자동 변경 금지 — 새 계획은 다시 승인.

## "최적"이라는 말

확인 가능한 후보와 실제 데이터의 범위 안에서만 쓴다. 화면 문구는 "지금 확인된 후보 중"으로 시작한다.

## 테스트

기존: TS 209 · Kotlin 260 (충전 판단 · 게이트 · Mission · 계약 사례). V7 구현 시 `contracts/v7/` 에 목표별 사례를 더하고 양쪽에서 같은 답을 확인한다(거울 규칙).
