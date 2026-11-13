# 충전소 API 연동 — 한국환경공단 전기자동차 충전소 정보

[data.go.kr/data/15076352](https://www.data.go.kr/data/15076352/openapi.do) · 확인 2026-11-04 · 무료 · 제1유형(출처 표시) · XML/REST.

## 연결 상태

| 항목 | 상태 |
|---|---|
| 엔드포인트 존재 | ✅ 키 없이 호출해 `401 SERVICE_KEY_IS_NULL` 수신 (`getChargerInfo` · `getChargerStatus`) |
| 프록시 → 앱 | ✅ 에뮬레이터 앱이 `adb reverse` 로 프록시 응답 수신 |
| **실제 충전기 데이터** | ❌ **수신 안 함 — API 키 없음.** 오너 계정의 활용 신청이 필요하다 |
| 코드표(stat·chgerType) | ❌ 공식 페이지에 없음. 활용 가이드와 대조 전(`CODE_TABLE_VERIFIED = false`) |
| 호출 한도 | 오너 지시서의 개발계정 1,000 인용. 내가 페이지에서 직접 보지는 못했다 |

## 필드 대응

| 표준 | API | 처리 |
|---|---|---|
| stationId · chargerId | `statId` · `chgerId` | 없으면 행을 버린다 |
| stationName · address · operator | `statNm` · `addr` · `busiNm` | |
| latitude · longitude | `lat` · `lng` | 범위 밖·0 은 null |
| connectorType | `chgerType` | 표에 없으면 null(모름). 빈 목록(안 맞음)과 다르다 |
| outputKw | `powerType` | "급속(100kWh동시)"에서 숫자만. 없으면 null |
| availabilityStatus | `stat` | 표에 없으면 UNKNOWN |
| statusUpdatedAt | `statUpdDt` | **상태가 바뀐 일시**(KST). 조회 시각이 아니다 |
| retrievedAt | 프록시 | 받은 시각 |
| availableHours | `useTime` | |
| accessRestrictions | `note` | 별도 제한 필드가 없다. 제한 낱말이 있으면 '확인 필요' |
| parkingFreeInfo | `parkingFree` | Y/N/없음(현장 확인) |
| source · evidenceType | 고정 · 프록시 | LIVE_API / CACHED |

미지원으로 둔 것: 대기 인원 · 예약 · 정확한 요금.

## 호출 방식

공식 명세에서 **상태 오퍼레이션은 최근 `period`(1~10)분 안에 바뀐 것만** 준다. 그래서:

1. 전체 상태는 정보 오퍼레이션 — 지역(`zcode`)별, 페이지 끝까지, 6시간 캐시
2. 그 사이 변화는 상태 오퍼레이션 10분 증분 — 5분 캐시, 더 오래된 값으로 덮지 않음
3. 호출 예산 하루 800(기본, 한도 아래로) — 넘으면 부르지 않고 저장값으로 답한다

응답은 두 형식이다: 정상 `<response>` 와 게이트웨이 거절 `<OpenAPI_ServiceResponse>`. 거절을 빈 결과로 읽으면 "충전기 없음"이 되므로 구별한다. 일부 페이지만 성공하면 저장하지 않는다 — 빠진 충전소가 '없는 것'이 되기 때문이다.

## 연결표

`docs/data/corridor-stations.tsv` 는 **비어 있다**. 키를 받으면 `--draft-mapping` 으로 초안을 출력하고(휴게소 이름 + 방향이 모두 맞는 것만), 사람이 위치와 방향을 확인해 옮긴다. 비어 있는 동안 앱은 추천하지 않는다.

## 키를 받은 뒤 할 일

1. 활용 가이드로 코드표 대조 → `CODE_TABLE_VERIFIED`
2. 연결표 작성
3. 72시간 수집: 조회 실패율 · 상태 변화 빈도 · 통신 이상 비율 · 몇 곳 현장 대조
4. 그 결과로 DATA-FRESHNESS-POLICY 의 기준값 조정
