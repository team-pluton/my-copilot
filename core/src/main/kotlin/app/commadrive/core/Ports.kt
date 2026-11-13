package app.commadrive.core

/**
 * 바깥 세계와의 경계 — **Pleos SDK 는 전부 이 뒤에 숨는다.**
 *
 * 이유가 셋이다:
 *  1. SDK 접근이 늦어지거나 막혀도 앱과 테스트가 멈추지 않는다 (Mock 으로 돈다)
 *  2. 추천 엔진·에너지 추정을 차량 없이 단위 테스트할 수 있다
 *  3. SDK 의 시그니처가 바뀌어도 고칠 곳이 구현체 한 곳이다 — 실제로 2026-10-19 SDK 릴리즈에서
 *     NaviHelper 좌표 인자 순서(lon,lat → lat,lon)와 `totalDistance → remainDistance` 가 바뀌었다
 *
 * ⚠️ 여기 적힌 것은 **우리가 정한 인터페이스**이지 Pleos SDK 의 명세가 아니다.
 * 실제 메서드 이름·반환형은 공식 문서로 확인한 뒤 구현체에서 맞춘다 (research/PLEOS_PLATFORM.md).
 *
 * ⚠️ 시연에서 **Mock 과 실제 연동을 섞어 말하지 않는다.**
 */

/** 내비게이션에서 읽어 온 현재 경로 (NaviHelper DestinationInfo.remainDistance/remainTime 에 대응) */
data class TripRoute(
    val destination: GeoPoint?,
    val remainingKm: Double?,
    val waypointCount: Int,
)

interface VehicleStateProvider {
    /** 권한이 없거나 차량이 지원하지 않으면 `UNKNOWN` 이다 — 그때는 수동 타이머로 간다 */
    suspend fun drivingState(): DrivingState

    /**
     * 에너지 추정에 쓰는 스냅샷. Vehicle SDK v2.3.2 기준 대응:
     * `registerEvBatteryStateOfCharge`(잔량) · `getCurrentEvEfficiency`(효율) · HVAC · DrivingMode · Odometer.
     * 속도는 Vehicle SDK 가 아니라 AAOS Car API 다 (`VehicleSpeedListener` 는 같은 릴리즈에서 삭제됐다).
     * 지원하지 않는 항목은 null 로 두고 화면이 사용자 입력으로 메운다.
     */
    suspend fun snapshot(): VehicleSnapshot?
}

interface LocationProvider {
    /** 현재 위치. **못 받으면 null 이다.** 마지막 위치를 현재 위치인 척 돌려주지 않는다 */
    suspend fun currentLocation(): GeoPoint?
}

interface NavigationProvider {
    suspend fun currentTrip(): TripRoute?

    /**
     * 경유지 추가를 **요청**한다. 실제 경로 변경은 내비게이션이 하고, 우리는 콜백(`onWaypointChanged`)으로
     * 결과를 확인할 뿐이다 — 자동으로 경로를 바꾸지 않는다. 슬롯은 2개(`WaypointIndex.FIRST/SECOND`).
     */
    suspend fun addStop(stop: RestStop): NavResult
}

interface RestStopRepository {
    suspend fun findCandidates(location: GeoPoint, route: TripRoute?, plan: TripPlan): List<RestStop>
}
