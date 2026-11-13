# 차량 데이터 계약

| 입력 | 출처 | 표준 단위 | 실제 받은 값 (에뮬레이터 2026-11-04) |
|---|---|---|---|
| SOC | EvBattery 콜백 | % | 100 |
| 배터리 용량 | `getEvBatteryCapacity` (출품 어댑터 경유) | kWh | 원시 **77400** → 77.4 |
| 동력원 | 공개 SDK 에 필드 없음 | — | 세션 기본 EV. **확인값이 아니다** |
| 공조 | 조회 가능 경로 일부 | — | 판단은 기존 스냅숏 값(공조 켬 가정) |
| 충전 규격 | SDK 에서 못 읽음 | — | DC 콤보 **가정** |

## 단위 변환은 한 곳

`capacityToKwh`(`journey-fact.ts` ↔ `JourneyFact.kt`): 10~250 은 kWh, 10,000~250,000 은 Wh 로 보고 1000 으로 나눈다. 둘 다 아니면 `null` 이고 판단은 `CANNOT_JUDGE` 다. 기본 용량으로 대신하지 않는다.

## 값의 구분

| 구분 | 어디 |
|---|---|
| SDK 원시 값 | 로그 `vehicle soc=… rawCapacity=…` |
| 정규화 값 | `Fact<VehicleEnergy>.value` |
| 추정 값 | 도착 잔량 범위 · 부족분 · 충전 시간. 화면에 "추정" |
| 미수신 | `value = null` + `availability` · `errorReason` |

읽은 지 5분이 넘은 값(가정)은 오래된 것으로 보고 판단하지 않는다.

## 동력원

`ENERGY_POWERTRAINS`(EV) 밖이면 `NOT_APPLICABLE`. PHEV·HEV·ICE·UNKNOWN 모두 계산도, 충전소 조회도 하지 않는다(T16). 차량 앱의 동력원 기본값은 아직 사용자·개발 설정이다. capability 로 판별하는 일은 남아 있다.

## 차량 앱에 적용한 것

`CopilotViewModel` 이 `LiveVehicle` 을 넣기 전에 용량을 정규화한다. 이 변환 전에는 V5 엔진도 77400 을 kWh 로 써서 "제안 없음"이었고, 변환 뒤 "약 15%p 부족"으로 바뀌었다(`E24-04` → `E24-05`).

## ⚠️ 출품 앱에 같은 결함이 있다 (고치지 않음)

`adapters/.../PleosVehicleStateProvider.kt` 의 `takeIf { it > 10 }` 는 77400 을 통과시킨다. 출품 앱을 에뮬레이터에서 실행하니 "배터리 용량 77400 kWh", 400km 주행 소비 0%, **"충분"** 으로 나왔다(`E25-01` · `E25-02`). 오너 결정이 필요하다 — TEST-RESULT-V6 위험 1.
