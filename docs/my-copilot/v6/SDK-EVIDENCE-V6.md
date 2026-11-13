# SDK 증거 V6

등급: **[문서]** · **[AAR]** 클래스 확인 · **[컴파일]** · **[에뮬]** 실행 관찰 · **[실차]** 0건 · **[MOCK]** 시연 데이터.
캡처: `docs/my-copilot/captures/emulator/E24-*` · `E25-*`. 날짜 2026-11-04.

| 사실 | 등급 | 값 |
|---|---|---|
| 용량 원시값 단위 | [에뮬] | 어댑터 경유 77400 — Wh 로 판단 |
| `remainDestinationChargingInt` 단위 | [에뮬] 1회 | 75,580 · 75,589 — Wh 로 보임 |
| `isRouting` | [에뮬] | 안내 중에도 false |
| `getDestinationInfo` | [에뮬] | 안내 중 이름 반환 · 없으면 빈 이름 |
| `addWaypoint` · 빈 poiId | [에뮬] | 내비 경로에 반영 |
| `getWaypointInfo` | [에뮬] | 이름만, 좌표 (0, 0) · 반영까지 지연 |
| `onWaypointChanged(ADD)` | [에뮬] 일부 | 1회 수신(약 12초 뒤), 다른 시도엔 없음 |
| `removeWaypoint(index)` → add | [에뮬] | 고른 칸만 교체 |
| `TripRequest` 순서 | [AAR] [에뮬] | lat, lon, poiId, poiName, poiSubId |
| `requestTrip` → `TripInfo` | [에뮬] | 192,949m · 9,421초 · 64% · 27,436 · 경로 변화 없음 |
| `RoutePointInfo` | [에뮬] | ratioOnRoute · poiType · pointType · settingType 수신 |
| INTERNET · NAVI_ROUTE* | [에뮬] | granted |
| `adb reverse` → 앱 HTTP | [에뮬] | 프록시 응답 수신 |
| 공공 API 엔드포인트 | 실호출 | 키 없이 401 `SERVICE_KEY_IS_NULL` |
| 공공 API 데이터 | ❌ | 키 없음 |

## 출품 앱 관찰 (코드 변경 없음)

| 관찰 | 캡처 |
|---|---|
| 배터리 용량 "77400 kWh" | E25-01 |
| 주행 0% · "충분" · 도착 100% | E25-02 |

`PleosNavigationProvider` 는 `takeIf { it in 0..100 }` 로 Wh 값을 걸러 낸다. 그래서 내비 잔량을 잘못 쓰지는 않지만, 이 경로로 내비 예측이 쓰이지도 않는다(코드 판독).

## 정정한 기존 기록

research 15절의 `TripRequest` 인자 순서를 정정했다. 설계 문서(`one-decision/DESIGN-2026-11-04.md`)의 "`requestTrip` 실행 미확인"은 이 문서가 대체한다.
