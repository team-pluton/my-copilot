package app.commadrive.core

/**
 * 도메인 모델 v2 — **Android 에 의존하지 않는다.** `src/lib/core/model.ts` 와 같은 모양이다 (거울 규칙).
 *
 * 추천 엔진이 이 앱의 차별화 그 자체인데 Android 에 묶여 있으면 차량·에뮬레이터
 * 없이는 한 줄도 검증할 수 없다. 순수 Kotlin 으로 떼어 두면 JVM 단위 테스트로
 * 규칙을 증명할 수 있고, 그 테스트가 곧 "추천이 실제로 작동한다"는 근거가 된다.
 *
 * v1 은 "휴식 장소"만 알았다. v2 는 **충전 정차 = 휴식**이라, 장소에 충전기 정보가
 * 붙고, "언제 서나"를 시간이 아니라 **에너지**가 먼저 정한다.
 */

/** 위경도 한 점 */
data class GeoPoint(val lat: Double, val lon: Double)

enum class Amenity(val label: String) {
    RESTROOM("화장실"),
    PARKING("주차장"),
    RESTAURANT("음식점"),
    CAFE("카페"),
    BABY_CARE("유아 편의시설"),
    PET_AREA("반려동물 구역"),
    EV_CHARGER("전기차 충전"),
}

/**
 * 동승자 — **수동 설정이다.** 자동 감지라고 표현하지 않는다 (CLAUDE.md 정책 6).
 *
 * 동승자마다 "꼭 있어야 하는 것"(배제 조건)과 "있으면 좋은 것"(점수·미충족 설명)을 나눈다.
 * 안 나누면 "반려견 산책 구역 없음"을 이유로 유일한 급속충전소가 빠지는 식으로 추천이 비어 버린다.
 */
enum class PassengerType(val label: String, val required: Set<Amenity>, val preferred: Set<Amenity>) {
    CHILD("어린이", setOf(Amenity.RESTROOM), setOf(Amenity.BABY_CARE, Amenity.RESTAURANT)),
    SENIOR("어르신", setOf(Amenity.RESTROOM), setOf(Amenity.RESTAURANT, Amenity.CAFE)),
    PET("반려동물", emptySet(), setOf(Amenity.PET_AREA, Amenity.PARKING)),
}

data class Needs(val required: Set<Amenity>, val preferred: Set<Amenity>)

/** 동승자 묶음 → 필수(합집합)·선호(합집합, 필수 제외). 운전자 몫(화장실·주차)은 늘 깔린다 */
fun needsOf(passengers: Collection<PassengerType>): Needs {
    val required = linkedSetOf(Amenity.RESTROOM, Amenity.PARKING)
    val preferred = linkedSetOf<Amenity>()
    for (p in passengers) {
        required += p.required
        preferred += p.preferred
    }
    preferred -= required
    return Needs(required, preferred)
}

/**
 * 장소 정보를 얼마나 믿을 수 있나. `UNKNOWN` 을 따로 둔 이유: 모르는 것을 아는 척하지 않기 위해서다.
 */
enum class DataConfidence { VERIFIED, UNKNOWN }

data class RestStop(
    val id: String,
    val name: String,
    val location: GeoPoint,
    /** 출발지로부터 경로상 거리(km). 에너지 계산과 "어디쯤에서 서나"에 쓴다 */
    val routeKm: Double,
    val amenities: Set<Amenity>,
    /** 경로 이탈 **거리**(km). 시간이 아니다 */
    val detourKm: Double?,
    /** 재계산으로 실제 우회 **시간**을 얻었을 때만. null 이면 "추가 N분"을 적지 않는다 */
    val detourMinutes: Int?,
    /** 충전기 최대 출력(kW). null = 충전 불가 */
    val chargerKw: Int?,
    val chargerStalls: Int?,
    val confidence: DataConfidence,
    val openingHours: String? = null,
    val dataSource: String,
)

/**
 * 사용 목적 — 같은 에너지 엔진을 차량 이용의 여러 순간에 쓴다. model.ts TripMode 의 거울.
 * JOURNEY 장거리 여행 · WAIT 픽업·마중(왕복 + 대기) · STAY 캠핑·차박(설계 단계)
 */
enum class TripMode { JOURNEY, WAIT, STAY }

/** 여정 — 사용자가 정차 중에 넣는 것 */
data class TripPlan(
    val destinationName: String,
    val routeKm: Double,
    /** 도착 후 차 안에서 기다릴 시간(분) — 축 1 의 핵심 입력 */
    val waitMinutesAfterArrival: Int,
    /** 도착 시 남겨 둘 최소 잔량(%) */
    val minReservePct: Double,
    val passengers: Set<PassengerType>,
    /** 휴식 간격(분) — 충전이 필요 없어도 이 간격이면 쉬자고 권한다 */
    val breakIntervalMinutes: Int,
    val mode: TripMode = TripMode.JOURNEY,
    /** 돌아오는 길(km). 0 = 편도. 왕복이면 대기는 가는 길과 오는 길 사이 */
    val returnKm: Double = 0.0,
    /** 내비 예측 목적지 도착 잔량(%) — NaviHelper RouteStateInfo.remainDestinationChargingInt. model.ts 의 거울 */
    val naviArrivalSocPct: Double? = null,
) {
    init {
        require(breakIntervalMinutes in 30..120) { "휴식 간격은 30~120분 (받은 값: $breakIntervalMinutes)" }
        require(waitMinutesAfterArrival >= 0)
        require(minReservePct in 0.0..100.0)
    }
}

enum class DriveMode { ECO, NORMAL, SPORT }

/**
 * 차량 스냅샷 — Vehicle SDK(EvBattery·HVAC·Odometer·DrivingMode) + AAOS(속도·외기온)에서
 * 읽어 올 값. 시연에서는 조작판이 넣는다.
 */
data class VehicleSnapshot(
    val batteryPct: Double,
    val batteryKwh: Double,
    /** EvBattery 효율(`getCurrentEvEfficiency`). 없으면 null → 차종 기본값 사용 */
    val efficiencyKwhPer100km: Double?,
    val hvacOn: Boolean,
    val outsideTempC: Double,
    val driveMode: DriveMode,
    /** 정차 후 지난 주행 시간(분) — Odometer 트립 시간 */
    val tripMinutes: Int,
    val speedKmh: Double,
    val tireWarning: Boolean,
)

/** 점수가 매겨진 후보. `reason` 은 화면에 그대로, `unmet` 은 **미충족을 숨기지 않는다** */
data class RankedRestStop(
    val stop: RestStop,
    val score: Int,
    val reason: String,
    val unmet: List<Amenity>,
)

/** 차량이 지금 달리는지 서 있는지 */
enum class DrivingState { PARKED, MOVING, UNKNOWN }

/** 경유지 추가 요청의 결과. 성공을 **낙관하지 않는다** */
sealed interface NavResult {
    data object Added : NavResult

    /** 경유지 슬롯이 꽉 찼다 — 기존 경유지를 지우지 말고 사용자에게 묻는다 */
    data class SlotFull(val currentCount: Int) : NavResult

    /** 내비게이션에 연결하지 못했다 — 기존 경로는 그대로 둔다 */
    data object Unavailable : NavResult

    data class Failed(val reason: String) : NavResult
}
