package app.commadrive.core.assistant

import app.commadrive.core.Amenity
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * MVP 구간 — `src/lib/assistant/corridor.ts` 의 거울(원본 docs/data/rest-stops.csv, 계약 테스트로 맞춘다). 왜 미리 고른 목록인지·시설 근거 등급은 그쪽 주석.
 * MOCK_ 은 시연 데이터 — 좌표는 근사, 충전소 ID 는 지어낸 값이다. 실제 값과 합치지 않는다.
 */
object Corridor {
    data class Row(val id: String, val name: String, val routeKm: Double)

    /** 경부선 부산 방향 — 서울 방향에만 있는 신탄진·경산·언양은 뺐다(도로공사 자료 대조 2026-11-10, corridor.ts 주석) */
    val ROWS = listOf(
        Row("giheung", "기흥휴게소", 35.0), Row("anseong", "안성휴게소", 70.0), Row("cheonan", "천안휴게소", 95.0), Row("oksan", "옥산휴게소", 125.0),
        Row("jukam", "죽암휴게소", 150.0), Row("hwanggan", "황간휴게소", 220.0), Row("gimcheon", "김천휴게소", 250.0), Row("chilgok", "칠곡휴게소", 290.0),
    )

    private val curated = FacilityFact(FacilityState.CONFIRMED, DataEvidence.CURATED, "docs/data/rest-stops.csv · 시설 유형")

    /** 실제 경로용 — 충전소 연결은 검수된 표에서만 온다 */
    fun stops(mapping: Map<String, List<String>>): List<CorridorStop> = ROWS.map { r ->
        CorridorStop(r.id, r.name, null, null, r.routeKm, DataEvidence.CURATED, mapping[r.id] ?: emptyList(), mapOf(Amenity.RESTROOM to curated, Amenity.PARKING to curated))
    }

    private fun mock(vararg a: Amenity) = a.associateWith { FacilityFact(FacilityState.CONFIRMED, DataEvidence.MOCK, "시연 데이터") }

    val MOCK_STOPS = listOf(
        CorridorStop("jukam", "죽암휴게소", 36.4867, 127.5012, 150.0, DataEvidence.MOCK, listOf("MOCK0001"), mock(Amenity.RESTROOM, Amenity.PARKING, Amenity.RESTAURANT)),
        CorridorStop("geumgang", "금강휴게소", 36.2793, 127.6720, 165.0, DataEvidence.MOCK, listOf("MOCK0002"), mock(Amenity.RESTROOM, Amenity.PARKING, Amenity.RESTAURANT, Amenity.BABY_CARE)),
        CorridorStop("hwanggan", "황간휴게소", 36.2211, 127.9245, 220.0, DataEvidence.MOCK, listOf("MOCK0003"), mock(Amenity.RESTROOM, Amenity.PARKING, Amenity.RESTAURANT, Amenity.BABY_CARE, Amenity.PET_AREA)),
        CorridorStop("gimcheon", "김천휴게소", 36.0912, 128.1398, 250.0, DataEvidence.MOCK, listOf("MOCK0004"), mock(Amenity.RESTROOM, Amenity.PARKING)),
    )

    private val STAMP = DateTimeFormatter.ofPattern("yyyyMMddHHmmss").withZone(ZoneOffset.ofHours(9))

    /** 공식 명세의 필드 이름 그대로인 시연 행 — 실제 응답과 같은 길을 지나게 */
    fun mockChargerRows(now: Long, overrides: Map<String, Map<String, String>> = emptyMap()): List<Map<String, String?>> {
        val stamp = STAMP.format(Instant.ofEpochMilli(now - 20 * 60_000))
        fun row(statId: String, chgerId: String, statNm: String, stat: String, power: String): Map<String, String?> = mapOf<String, String?>(
            "statId" to statId, "chgerId" to chgerId, "statNm" to statNm, "stat" to stat, "chgerType" to "04", "powerType" to power, "statUpdDt" to stamp, "busiNm" to "시연 운영사", "useTime" to "24시간 이용가능",
        ) + (overrides["$statId/$chgerId"] ?: emptyMap())
        return listOf(
            row("MOCK0001", "01", "죽암휴게소 충전소(시연)", "2", "급속(100kW)"),
            row("MOCK0002", "01", "금강휴게소 충전소(시연)", "3", "급속(200kW)"),
            row("MOCK0002", "02", "금강휴게소 충전소(시연)", "2", "급속(200kW)"),
            row("MOCK0003", "01", "황간휴게소 충전소(시연)", "2", "급속(100kW)"),
            row("MOCK0003", "02", "황간휴게소 충전소(시연)", "2", "급속(100kW)"),
            row("MOCK0004", "01", "김천휴게소 충전소(시연)", "2", "급속(350kW)"),
        )
    }
}
