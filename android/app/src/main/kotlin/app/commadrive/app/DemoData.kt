package app.commadrive.app

import app.commadrive.core.Amenity
import app.commadrive.core.Amenity.BABY_CARE
import app.commadrive.core.Amenity.CAFE
import app.commadrive.core.Amenity.EV_CHARGER
import app.commadrive.core.Amenity.PARKING
import app.commadrive.core.Amenity.PET_AREA
import app.commadrive.core.Amenity.RESTAURANT
import app.commadrive.core.Amenity.RESTROOM
import app.commadrive.core.DataConfidence
import app.commadrive.core.DriveMode
import app.commadrive.core.GeoPoint
import app.commadrive.core.PassengerType
import app.commadrive.core.RestStop
import app.commadrive.core.TripMode
import app.commadrive.core.TripPlan
import app.commadrive.core.VehicleSnapshot

/**
 * 시연 데이터 — `src/lib/core/mock.ts` 의 거울. **장소 이름 외에는 전부 가상이다.**
 *
 * 충전기 kW·시설·우회 거리는 시연을 위해 적은 값이고 검증하지 않았다. 화면에 "시연용 가상 데이터"를 늘 띄운다.
 * 웹 시연과 같은 값이어야 같은 판단(김천 88 · 금강 82 · 황간 56, 부족 약 47%)이 나온다 — 한쪽만 고치지 않는다.
 *
 * 좌표만은 실제 값이다: OpenStreetMap(Nominatim, 2026-10-25)에서 **부산방향 표기가 있는 것**을 쓰고,
 * 방향 표기가 없던 곳은 주석에 적었다. 못 찾은 곳은 [UNKNOWN_LOCATION] — 내비에 엉뚱한 좌표를 넘기지 않으려고
 * 그 후보는 경유지 추가를 거절한다(AppViewModel.addWaypoint).
 */
object DemoData {
    val UNKNOWN_LOCATION = GeoPoint(0.0, 0.0)

    fun hasLocation(stop: RestStop) = stop.location != UNKNOWN_LOCATION

    const val ROUTE_FROM = "서울"
    const val ROUTE_TO = "부산"
    const val ROUTE_KM = 400.0

    /** 시연 재생에서 1분 = 이만큼 전진 (평균 80km/h) — mock.ts DEMO_ROUTE.kmPerMinute */
    const val KM_PER_MINUTE = 80.0 / 60.0

    val journeyPlan = TripPlan(
        destinationName = ROUTE_TO,
        routeKm = ROUTE_KM,
        waitMinutesAfterArrival = 40,
        minReservePct = 20.0,
        passengers = setOf(PassengerType.CHILD, PassengerType.PET),
        breakIntervalMinutes = 90,
        mode = TripMode.JOURNEY,
        returnKm = 0.0,
    )

    /** 픽업·마중 — 집 → 인천공항 52km, 60분 기다렸다 같은 길로 귀가 */
    val waitPlan = TripPlan(
        destinationName = "인천공항 (마중)",
        routeKm = 52.0,
        waitMinutesAfterArrival = 60,
        minReservePct = 20.0,
        passengers = emptySet(),
        breakIntervalMinutes = 120,
        mode = TripMode.WAIT,
        returnKm = 52.0,
    )

    val journeyVehicle = VehicleSnapshot(
        batteryPct = 68.0,
        batteryKwh = 77.0,
        efficiencyKwhPer100km = null,
        hvacOn = true,
        outsideTempC = 6.0,
        driveMode = DriveMode.NORMAL,
        tripMinutes = 0,
        speedKmh = 0.0,
        tireWarning = false,
    )

    val waitVehicle = journeyVehicle.copy(batteryPct = 55.0, outsideTempC = 1.0)

    /** "실주행 효율 반영" — 겨울 고속 주행에서 흔히 보는 값을 가정 (웹 시연과 같은 18.4) */
    const val REAL_EFFICIENCY_KWH_PER_100KM = 18.4

    private fun s(
        id: String,
        name: String,
        routeKm: Double,
        amenities: Set<Amenity>,
        chargerKw: Int?,
        location: GeoPoint = UNKNOWN_LOCATION,
        detourKm: Double? = 0.5,
        detourMinutes: Int? = null,
        confidence: DataConfidence = DataConfidence.VERIFIED,
        openingHours: String? = "24시간",
    ) = RestStop(
        id = id,
        name = name,
        location = location,
        routeKm = routeKm,
        amenities = amenities,
        detourKm = detourKm,
        detourMinutes = detourMinutes,
        chargerKw = chargerKw,
        chargerStalls = if (chargerKw != null) 4 else null,
        confidence = confidence,
        openingHours = openingHours,
        dataSource = "demo",
    )

    /** 서울 → 부산, 경로상 거리순 — mock.ts DEMO_STOPS 와 같은 순서·같은 값 */
    val stops: List<RestStop> = listOf(
        // 좌표: OSM "기흥휴게소" (방향 표기 없음)
        s("giheung", "기흥휴게소", 35.0, setOf(RESTROOM, PARKING, RESTAURANT, EV_CHARGER), 100, GeoPoint(37.23516, 127.10490)),
        s("anseong", "안성휴게소", 70.0, setOf(RESTROOM, PARKING, RESTAURANT, CAFE, BABY_CARE, PET_AREA, EV_CHARGER), 200, GeoPoint(37.01359, 127.14471), detourKm = 0.3, detourMinutes = 2),
        // 좌표: OSM 에서 경부선 천안휴게소를 찾지 못했다
        s("cheonan", "천안휴게소", 95.0, setOf(RESTROOM, PARKING, RESTAURANT, BABY_CARE, EV_CHARGER), 100, detourKm = 0.6),
        s("oksan", "옥산휴게소", 125.0, setOf(RESTROOM, PARKING, RESTAURANT, CAFE, EV_CHARGER), 350, GeoPoint(36.65660, 127.37100), detourKm = 0.4),
        // 실제 죽암 반려견 놀이터는 서울방향이다(정책브리핑 2021-12-03). 여기 값은 웹 시연과 같은 가상값
        s("jukam", "죽암휴게소", 150.0, setOf(RESTROOM, PARKING, RESTAURANT, PET_AREA), null, GeoPoint(36.48693, 127.42950), confidence = DataConfidence.UNKNOWN, openingHours = null),
        // 좌표: OSM "금강휴게소"(경부고속도로 옥천) — 부산 방향 휴게소(도로공사 15085543). 2026-11-10 신탄진(서울 방향 전용)에서 교체
        s("geumgang", "금강휴게소", 165.0, setOf(RESTROOM, PARKING, RESTAURANT, CAFE, PET_AREA, EV_CHARGER), 200, GeoPoint(36.27926, 127.67195), detourKm = 0.4),
        s("hwanggan", "황간휴게소", 220.0, setOf(RESTROOM, PARKING, RESTAURANT, EV_CHARGER), 50, GeoPoint(36.24896, 127.85314)),
        s("gimcheon", "김천휴게소", 250.0, setOf(RESTROOM, PARKING, RESTAURANT, CAFE, BABY_CARE, PET_AREA, EV_CHARGER), 350, GeoPoint(36.12956, 128.16500), detourKm = 0.3, detourMinutes = 2),
        s("chilgok", "칠곡휴게소", 290.0, setOf(RESTROOM, PARKING, RESTAURANT, EV_CHARGER), 100, GeoPoint(36.01951, 128.42891), detourKm = 0.7),
        // 좌표: OSM "건천휴게소 부산방향"(경부고속도로 경주) — 2026-11-10 경산(서울 방향 전용, 도로공사 15085543)에서 교체
        s("geoncheon", "건천휴게소", 330.0, setOf(RESTROOM, PARKING, RESTAURANT, CAFE, EV_CHARGER), 200, GeoPoint(35.83026, 129.10949)),
        // 좌표: OSM 에는 서울방향만 있었다 — 부산방향 좌표 미확인
        s("eonyang", "언양휴게소", 370.0, setOf(RESTROOM, PARKING, CAFE, EV_CHARGER), 100, confidence = DataConfidence.UNKNOWN, openingHours = null),
        // ── 걸러지는 것을 보여 주기 위한 후보 ──
        s("offroute", "안성 시내 대형 카페 (충전기 있음)", 72.0, setOf(RESTROOM, PARKING, CAFE, PET_AREA, EV_CHARGER), 50, detourKm = 7.5, confidence = DataConfidence.UNKNOWN, openingHours = null),
        s("unknown-detour", "천안 IC 밖 충전소", 97.0, setOf(RESTROOM, PARKING, EV_CHARGER), 200, detourKm = null, confidence = DataConfidence.UNKNOWN, openingHours = null),
    )

    /** 경유지 슬롯 — 공식 문서로 확인된 값 (WaypointIndex.FIRST/SECOND) */
    const val WAYPOINT_SLOTS = 2
}
