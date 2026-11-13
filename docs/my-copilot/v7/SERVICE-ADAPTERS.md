# Unified Service Adapter — 공통 서비스 계약 (V7 설계 · 2026-11-10)

> 새 틀을 만들지 않는다. V6 의 `Fact<T>` + `FactMeta`(`core/.../assistant/JourneyFact.kt` ↔ `src/lib/assistant/journey-fact.ts`)가 이미 오너가 요구한 메타의 대부분이다. 빠진 것(권한)만 더한다.

## 메타 — 요구 항목과 기존 필드

| 오너 요구 | 기존 `FactMeta` | 조치 |
|---|---|---|
| provider | `source` | 그대로 |
| fetchedAt | `retrievedAt` | 그대로 |
| sourceUpdatedAt | `originalUpdatedAt` | 그대로 (주차: `NOW_PRK_VHCL_UPDT_TM` · 충전: `statUpdDt`) |
| freshness | `freshness` (FRESH·AGING·STALE·UNKNOWN) | 그대로 — 기준 시간은 공급자별 표(아래) |
| evidenceLevel | `evidence` (VEHICLE·LIVE_API·CACHED·CURATED·MOCK·UNKNOWN) | 그대로 |
| availability | `availability` (OK·DENIED·NOT_CONNECTED·FAILED·NOT_SUPPORTED) | 그대로 |
| errorReason | `errorReason` | 그대로 |
| permissions | 없음 | **추가 후보** `permission: String?` — 차량 SDK 는 권한 이름(`CAR_ENERGY` 등), 외부 API 는 null(키는 서버) |
| (사람이 읽는 근거) | `reliabilityReason` | 그대로 |

## 어댑터

| 어댑터 | 지금 | 실체 | 상태 |
|---|---|---|---|
| `VehicleProvider` | `VehicleStateProvider` · `CabinStateSource` · `JourneySignalSource` (core) / `PleosVehicleStateProvider` (adapters) | Vehicle SDK 2.3.2 · AAOS Car API | **[에뮬]** |
| `NavigationProvider` | `NavigationProvider`(core `Ports.kt`) / `PleosNavigationProvider` | NaviHelper 3.0.5 — 목적지 · 남은 거리 · 경유지 · `requestRoute` | **[에뮬]** · `requestTrip` 연결은 검토 |
| `ChargingProvider` | `charger-feed.ts` · `ChargerData.kt` + `scripts/charger-proxy` | 한국환경공단 충전소 API(코드표 v1.25 대조 완료) | **[실 API]** (앱 화면 연결은 리허설 전) |
| `ParkingProvider` | 없음 | 서울 열린데이터광장 `GetParkingInfo`(실시간) · `GetParkInfo`(정보) | **[미구현]** · Gate A 부분 통과 |
| `WeatherProvider` | 없음 | 기상청 단기예보(공공데이터포털) [검색] | 후속 · **결정을 바꿀 때만**(아이콘 하나 더 보이기는 목표 아님) |
| `ScheduleProvider` | 없음 | Pleos 공식 경로 미확인 (`../B-RESEARCH-2026-11-10.md`) | 후속 · MVP 는 사용자 입력 |

### ParkingProvider (설계)

```
interface ParkingProvider {
    /** 방문지 주변 후보. 좌표를 모르는 주차장은 돌려주지 않는다(거리 판단 불가). */
    suspend fun near(point: GeoPoint, radiusM: Int): Fact<List<ParkingLot>>
}
data class ParkingLot(
    val id: String,                 // PKLT_CD
    val name: String, val address: String,
    val location: Fact<GeoPoint>,   // 출처: 조인 / 주소 변환 / 수기 검수(CURATED)
    val totalSpaces: Int?,
    val occupied: Fact<Int>?,       // 실시간일 때만. "빈자리 보장 아님"
    val hours: OperatingHours?,     // 평일·주말·공휴일
    val fee: FeeRule?,              // 기본·추가·일 최대 — 판단 근거로만, 요금 비교 화면은 만들지 않는다
)
```

## 규칙

1. **API 키는 클라이언트에 두지 않는다.** 외부 API 는 중계 서버(`scripts/charger-proxy` 확장)가 키 보관 · 캐시 · 호출 제한을 맡는다.
2. **충돌은 숨기지 않는다.** 두 출처가 다르면 한쪽을 사실로 채택하지 않고 "출처마다 다름"으로 판단에서 뺀다.
3. **연결이 안 돼도 기본은 산다.** 외부 서비스가 `NOT_CONNECTED`·`FAILED` 여도 Mission · 차량 기능 · 내비 실행은 그대로다(V6 `CANNOT_JUDGE`/`NO_RELIABLE` 와 같은 방식).
4. **set 호출은 한 곳.** 차량을 바꾸는 호출은 `CabinControl` 한 파일, 내비 쓰기는 `RouteHandoff`·`WaypointHandoff` 만. 나머지 어댑터는 읽기 전용 검사 유지(`copilot-adapters`).
5. **공급자별 신선도 기준**: 차량 신호 `Freshness.kt` `SignalKind.maxAgeMin` · 충전기 `../v6/DATA-FRESHNESS-POLICY.md` · 주차 `ARRIVE-READY-FEASIBILITY.md` Gate D.
