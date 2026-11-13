# V5 Phase 0 — 코드·문서 현황: 이미 있는 것과 새로 만든 것 (2026-11-02)

> V5 지시서(오너, 2026-11-02) 14절 Phase 0. 기존 코드를 재작성하지 않고 재사용 가능한 엔진부터 확인한 결과다.
> 기준 커밋: `stable-2026-11-02`(태그) · 브랜치 `copilot-v5`. 출품본(쉼표 DRIVE v3.1)은 건드리지 않는다.

## 1. 지시서의 요구 ↔ 기존 구현

| 지시서 요구 | 이미 있었다(재사용) | 없어서 만들었다(V5) |
|---|---|---|
| 3절 Journey Mission 객체(missionId·type·driver·occupancy·destination·waypoints·purpose·return·wait·phase·remainingLegs·capability·status) | 조각으로 흩어져 있었다 — 프로필(ProfileMode) · 계획(TripPlan.returnKm·waitMinutes) · 여정 구간(JourneyState.leg/legs) · 상황(DRIVER×OCCUPANCY×JOURNEY) · Journey Memory(tripId) · 가용성(availability) | **`mission.ts` ↔ `Mission.kt`**: 상태에서 **계산**하는 `missionOf`. 따로 드는 값은 셋(nextLegReady · waitSource · endedEarly) + 시작 시각 |
| 3절 유형 A~D | SOLO(출퇴근) · WORK(업무 방문 왕복) · FAMILY(여행) · COMPANION(외출) | **PICKUP 프로필**(픽업 후 귀가 · 왕복 · 차 안 대기 20분 · 어린이 조건) — 가족 맥락의 둘째 칩. COMPANION 은 OUTING 으로 남긴다(지우지 않는다) |
| 4절 수명 주기 MISSION_SELECTED → … → COMPLETED | 여정 단계 NOT_STARTED → PREPARING → DRIVING/APPROACHING → PARKED → FINISHING → **WAITING** → COMPLETED, 구간(leg) 둘 | `missionPhaseOf` 매핑(중간 정차는 EN_ROUTE 안) · **NEXT_LEG_READY** 상태 |
| 4절 1 중간 목적지 도착 ≠ 완료 | journey.ts: FINISH_DONE 이 마지막 구간이 아니면 WAITING · 떠나면 leg+1 | 변경 없음 |
| 4절 2 귀가 계획 보존 | plan.returnKm · Trip.remainingPlan(가는 길이면 귀로까지) | Mission.returnDestination 로 이름을 붙임 |
| 4절 3 대기 시간을 추정하지 않음 | waitMinutesAfterArrival 은 늘 사용자/프리셋 값 | **waitSource**(SAVED/USER/NONE) — 화면에 "저장된 계획 / 직접 확인 / 미확인"으로 적는다 |
| 4절 4 도착 후 HVAC 켜짐을 가정하지 않음 | WaitMode IN_CAR 는 "공조 사용 **가정**"이라고 쓴다 · AWAY 는 대기 소비 0 | 변경 없음 |
| 4절 5 신호 끊김은 관련 판단만 제한 | freshness.ts readiness · 연결 셋 | 변경 없음 |
| 4절 6 재시작·백그라운드 복귀 복원 | **없었다**(웹은 프로필·vault 만 저장, 차량용 앱은 저장 없음) — HANDOFF "이번 이동 저장" 미완 | **MissionSnapshot** + 웹 localStorage(초기값 복원) + 차량용 앱 `MissionStore`(SharedPreferences JSON) + `CopilotSession.snapshot/restore`(여정 단계는 지금 차 신호로 재판단 · 진행 중 제어 요청은 복원 안 함) |
| 4절 7 완료는 근거·사용자 확인으로만 | Complete 는 FINISHING + 게이트 + 체크리스트 | 변경 없음 |
| 4절 8 내비 목적지·경유지 자동 변경 금지 | 정책 1 · addWaypoint 는 콜백 확인 | **NEXT_LEG 수락은 "귀가 확인" 표시뿐(2026-11-03 문구 개정: "준비됨"은 쓰지 않는다)** — NaviHelper 를 부르지 않는다(테스트로 고정) |
| 6절 방문 뒤 복귀 제안 | 없었다 — 차가 출발하면 journey 가 귀가 구간으로 넘길 뿐 | **NEXT_LEG 제안**(결정 등급 · 한 번 · 대기 중에만) + `ReadyNextLeg` 인텐트 + 액션 `PREPARE_NEXT_LEG`(주차·확인 필요) |
| 9절 제안 우선순위 6단계 | 등급 RISK → PHASE → ADVISORY | **DECISION** 등급을 RISK 와 PHASE 사이에(지시서 2 "이동을 계속하기 위한 결정") |
| 8절 화면 위계(최상단 Mission → 중앙 다음 행동 → 하단 차량 상태) | 상단에 차량·여정 칩 + 상황 한 줄, 그 아래 제안/준비 카드 | **Mission 머리줄**(목적 · 단계 · 복귀 유지 · 대기 출처)을 맨 위로, 차량 상태 칩·상황 줄은 맨 아래로(웹·차량용 앱 둘 다) |
| 5절 가족 여행 Step 1~6 | 운전자 수동 · 취향 비교 → 승인 하나 → 항목별 결과 · 동승자 조건 후보 · EV 만 에너지 · 경유지 콜백 · (왕복이면) 귀가 유지 — **전부 있었다**(2026-10-28~29) | 변경 없음. 가족 프리셋은 편도(서울→부산) 그대로 — 수치(47% 부족 등)를 지키려고 |
| 7절 픽업 Step | 없었다 | PICKUP 프리셋 + 시나리오 P(웹) |
| 13절 테스트 성공 기준 14 | 1~6 · 9~14 는 기존 테스트가 이미 고정 | 7·8(중간 도착 ≠ 완료 · 귀가 유지)을 **Mission 이름으로** 다시 고정 — `mission.test.ts` ↔ `MissionTest.kt` |

## 2. 재사용한 엔진(삭제·재작성 없음)

Context Engine(journey · situation · freshness) · Journey Memory(memory) · Suggestion Planner(planner) · Safety Gate(gate) · Personal Cabin Memory(cabin) · Learning Engine(learning) · EV Energy Engine(`src/lib/core/energy` — 출품본, 변경 없음).

## 3. 바꾼 파일

- TS: `mission.ts`(신규) · `profile.ts`(PICKUP) · `situation.ts`(PICKUP · JourneyKind.PICKUP) · `memory.ts`(MODES) · `gate.ts`(PREPARE_NEXT_LEG) · `planner.ts`(DECISION · NEXT_LEG · mission 힌트) · `copilot-sim.tsx`(복원 · 귀가 준비 · 시나리오 P) · `copilot-screens.tsx`(Mission 머리줄)
- Kotlin core: `Mission.kt`(신규) · `Profile.kt` · `Situation.kt` · `SafetyGate.kt` · `SuggestionPlanner.kt` · `CopilotSession.kt`(상태 셋 · ReadyNextLeg · snapshot/restore · view.mission)
- 차량용 앱: `MissionStore.kt`(신규) · `CopilotViewModel.kt`(저장·복원) · `CopilotScreens.kt`(머리줄 · 귀가 준비 · 조작판 복원)
- 테스트: `mission.test.ts`(8) ↔ `MissionTest.kt`(11) · `cabin.test.ts`/`CabinTest.kt`(가족 맥락 둘째 칩) · `Round3Test.kt`(대표 1 에 귀가 준비 한 번)
