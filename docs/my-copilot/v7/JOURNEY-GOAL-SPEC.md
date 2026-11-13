# Journey Goal — 모델 명세 (V7 설계 · 2026-11-10 · 코드 미구현)

> "무엇을 달성해야 하는가"를 중심으로 판단하는 상태. **새 모델을 따로 만들지 않고 V5 `Mission` 을 감싸 합성한다**(오너 지시 2절 — 중복 필드 금지).
> 거울 규칙: 구현하면 `src/lib/assistant/goal.ts` ↔ `core/.../assistant/Goal.kt` 한 쌍으로, 공통 계약은 `contracts/v7/goal-*.tsv`. **1차 제출 전에는 구현하지 않는다.**

## 왜 Mission 을 감싸나

`Mission`(`core/.../assistant/Mission.kt`, `src/lib/assistant/mission.ts`)은 이미 목적(`missionType` — `WORK_VISIT_RETURN`·`PICKUP_RETURN`·`FAMILY_TRIP` …) · 운전자 · 탑승 조합 · 목적지 · 단계(`phase`) · 귀가 계획 · 내비 반영 확인(`naviRouteVerified`)을 갖고, 상태에서 **계산**된다.
Mission 에 없는 것은 셋뿐이다 — **성공 조건(시간 약속 · 제약)**, **계획과 대안**, **실행 증거의 목록**. Journey Goal 은 이 셋만 더한다.

## 필드

| 필드 | 출처 | 비고 |
|---|---|---|
| `goalId` | `mission.missionId` 재사용 | 같은 이동이면 같은 id |
| `goalType` | `mission.missionType` → `GoalType` 매핑 | `ARRIVE_BY`(시간 약속 방문) · `PICKUP_RETURN` · `REACH_WITH_STOPS`(EV 장거리) |
| `destination` | `mission.destination` + 확인된 좌표 `Fact<GeoPoint>` | 좌표를 모르면 null — 이름만으로 추측 안 함 |
| `requiredArrivalAt` | **사용자 입력만** `Fact<Instant>`(evidence USER) | 없으면 null → 시간 판단 자체를 하지 않는다. 일정 앱 자동 연동은 [미구현] |
| `driverId` · `passengers` | `mission.driverId` · `mission.occupancy` | 수동 설정. 자동 감지라고 말하지 않는다 |
| `vehicleCapabilities` | `VehicleCapability`(Freshness.kt) | 동력원 ≠ Capability ≠ Availability (기존 규칙) |
| `constraints` | 아래 표 | 필수(hard) / 선호(soft) 구분 |
| `confirmedExternalSources` | `List<FactMeta>` | 이번 판단에 실제로 쓴 출처만 — 표시와 감사(audit)용 |
| `currentPlan` | `GoalPlan?` | 승인된 계획. 승인 전엔 null |
| `alternativePlans` | `List<GoalPlan>` | 최대 2 (주행 중 비교 금지 — 정차 중만 보임) |
| `approvedActions` | `List<ApprovedAction>` | 사용자 승인 기록(무엇을 · 언제) |
| `executionEvidence` | `List<ExecutionEvidence>` | 요청 → 콜백 → 재조회 결과. `VERIFIED` 일 때만 "적용 확인" |
| `status` | `GoalStatus` | 아래 |
| `updatedAt` | 계산 시각 | |

### constraints

| 종류 | 예 | hard/soft | 근거가 없으면 |
|---|---|---|---|
| `ARRIVE_BY` | 15:00 까지 방문 | hard | 시간 판단 안 함 ("약속 시간을 알려 주시면 확인해요") |
| `PARK_NEAR` | 방문지 주변 주차 | hard(ARRIVE_BY 일 때) | 주차 후보 없음 → "확인된 주차 정보 없음" |
| `BUFFER_MIN` | 주차 후 방문까지 여유 N분 | soft · **사용자 확인값** | 도보 시간을 계산하지 않는다 — 사용자가 정한 여유만 쓴다 |
| `ENERGY_RESERVE` | 도착 잔량 하한 | hard(EV) | 기존 에너지 규칙(범위 · 추정) |
| `PASSENGER_NEEDS` | 아이·반려동물 시설 | soft | 시설 미확인은 "확인 안 됨"으로 |

## GoalPlan

```
GoalPlan(
  planId, kind: ARRIVE_DIRECT | PARK_THEN_VISIT | STOP_THEN_CONTINUE | RETURN_HOME,
  steps: List<PlanStep>,            // 예: [주차장 P 를 목적지로] / [경유지 S]
  feasibility: FEASIBLE | AT_RISK | INFEASIBLE | UNKNOWN,
  reasons: List<String>,            // 사람이 읽는 근거 (값마다 출처 등급)
  slackMin: IntRange?,              // 약속 시간 - (출발 + 내비 남은 시간 + 사용자 여유) — 셋 다 있을 때만, 범위로
  facts: List<FactMeta>,
)
```

- `feasibility = UNKNOWN` 이 정상 결과다. ETA 근거(NaviHelper)가 없거나, 약속 시간이 없거나, 주차 정보가 오래되면 UNKNOWN — **"늦을 것"이라고 말하지 않는다.**
- `slackMin` 은 범위다. 내비 남은 시간은 내비가 주는 값 그대로 쓰고 우리가 보정하지 않는다.

## GoalStatus

`DRAFT`(목표만) → `PLANNED`(추천 계산됨) → `APPROVED`(승인) → `EXECUTING`(SDK 요청) → `VERIFIED`(재조회 확인) / `NOT_VERIFIED`(콜백·재조회 불일치 — 다시 시도 안내) → `IN_PROGRESS` → `ACHIEVED` · `CANCELLED`.
Mission 의 `phase` 는 그대로 이동 단계를 맡는다(도착 ≠ 완료 규칙 유지). `GoalStatus` 는 **계획의 상태**만 맡는다 — 두 축을 섞지 않는다.

## 정책

- 시간·목적지가 없으면 미확인으로 둔다. 자동 추측 · 확정 금지.
- 모든 계획 변경은 승인 뒤에만. 승인된 계획이 깨져도 **자동으로 바꾸지 않고** RECOVERY 가 제안한다.
- 복원은 확인된 상태만(V5 규칙). 실행 증거 없는 "적용 완료" 표시 금지.

## 테스트 계약(구현 시)

`contracts/v7/goal-feasibility.tsv` — 입력(약속 시간 유무 · 남은 시간 유무 · 주차 신선도 · 여유) → 기대 `feasibility` · 금지 문구. 최소 사례: 약속 없음 → UNKNOWN · 남은 시간 없음 → UNKNOWN · 주차 STALE → 후보 제외 · 셋 다 있음 → 범위로 FEASIBLE/AT_RISK.
