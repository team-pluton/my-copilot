# V6 통합 구조 — ONE JOURNEY · ONE DECISION

브랜치 `copilot-v6`(기준점 태그 `v6-base-2026-11-04`). 쉼표 DRIVE v3.1 출품 경로는 고치지 않았다. 푸시하지 않았다.

## 무엇을 연결했나

```
Pleos Vehicle SDK ──▶ normalizeVehicle ─┐
                                        │
개발 PC 프록시(키 보관·캐시·예산) ──▶ normalizeCharger ─┼─▶ decide() ─▶ 결정 카드 ─승인─▶ NaviHelper addWaypoint
  ▲ 공공 충전소 API                      │      ▲                                   │
Pleos NaviHelper(목적지·경유지) ─────────┘      │                                   ▼
수기 구간 목록 · 가족 선호 ─────────────────────┘                      목록 재조회로 확인 (WaypointHandoff)
```

| 층 | TS | Kotlin | 하는 일 |
|---|---|---|---|
| 사실 메타 | `journey-fact.ts` | `JourneyFact.kt` | 근거 등급 · 신선도 · 단위 변환(용량은 여기 한 곳) |
| 충전기 | `charger.ts` | `ChargerData.kt` | 명세 필드 정규화 · 충전소 평가 |
| 입구 | `charger-feed.ts` · `scripts/charger-proxy/server.ts` | — | XML · 페이지 · 캐시 · 호출 예산. 앱에 키가 없다 |
| 구간 | `corridor.ts` | `Corridor.kt` | 경부선 부산 방향 8곳(2026-11-10 도로공사 자료 대조) · 시연 데이터 분리 |
| 판단 | `integrated-decision.ts` | `IntegratedDecision.kt` | 필수 조건 → 비교 → 결정 하나 → 재판단 |
| 실행 확인 | `waypoint-handoff.ts` | `WaypointHandoff.kt` | 승인 후 요청 · 재조회 · 슬롯 보호 |
| 어댑터 | — | `PleosNaviWaypoint.kt` · `ChargerClient.kt` · `DecisionController.kt` | SDK · 프록시 · 시간 |
| 화면 | `decision-card.tsx` · 시나리오 V | `DecisionCard.kt` | 한 화면 카드 · 주행 중 한 줄 |

공통 계약 파일: `contracts/v6/*.tsv` — TS 와 Kotlin 이 같은 파일을 읽어 같은 답을 내는지 검사한다.

## 설계 결정

- **기존 엔진을 대체하지 않는다.** `estimate` · `pctPerKm` · `reachableState` · `chargeMinutes` · `needsOf` 를 그대로 부른다. `rank()` 는 쓰지 않는다 — 우회 거리를 모르면 후보를 버리고 시설을 있음/없음으로만 보는데, 실제 데이터는 우회 값이 없고 '미확인'이 많다.
- **세션과 분리한다.** `DecisionController` 는 `CopilotSession` 을 건드리지 않는다. 충전소 API 가 죽어도 Mission 은 그대로다.
- **프록시는 개발 PC 에서만.** 공개 배포 금지 조건 때문이다. 127.0.0.1 만 듣고 `adb reverse` 로 연결한다. 평문 HTTP 도 127.0.0.1 만 허용한다(`res/xml/network_security.xml`).

## 실행

```
DATA_GO_KR_KEY_FILE=<저장소 밖 파일> node node_modules/tsx/dist/cli.mjs scripts/charger-proxy/server.ts
adb -s emulator-5554 reverse tcp:8787 tcp:8787
... server.ts --draft-mapping   # 휴게소-충전소 연결 초안 출력 → 사람이 확인해 docs/data/corridor-stations.tsv 에 옮긴다
```

JDK·adb 위치가 바뀌었다: `<tools>/jdk17` · `<tools>/android-sdk/platform-tools/adb.exe`(임시 폴더의 것이 정리돼 옮겼다).
