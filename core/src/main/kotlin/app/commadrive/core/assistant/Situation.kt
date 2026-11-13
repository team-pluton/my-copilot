package app.commadrive.core.assistant

/**
 * 상황 = DRIVER × OCCUPANCY × JOURNEY — `src/lib/assistant/situation.ts` 의 거울 (오너 후속 지시 2026-10-28).
 * 운전자(운전석 통풍·열선·핸들 열선, 시트 위치는 차량 프로필 우선·메모만) · 탑승 조합(공조·음악·조명·동승자) · 이동 목적(안내 빈도·여정) — 따로 기억하고 한 화면에서 합친다.
 * 운전자 인식: 공개 SDK 에 운전자 프로필·디지털 키 API 없음(javap 2026-10-28) → 수동. 미확인이면 운전석 항목은 유지. 성별로 추측하지 않는다.
 */
data class DriverPrefs(val seatVent: Boolean? = null, val seatHeat: Boolean? = null, val steeringHeat: Boolean? = null, val seatMemo: String? = null) {
    companion object { val NONE = DriverPrefs() }
}
data class Driver(val id: String, val name: String, val prefs: DriverPrefs)
/** 혼자 탈 때의 공조(운전자별) — 혼자 조합에서 학습한 공조는 운전자마다 따로(situation.ts SoloCabin). 키 `운전자|모드` = Learning.key */
data class SoloCabin(val hvacTempC: Double? = null, val hvacOn: Boolean? = null)

enum class DriverRecognition { MANUAL, VEHICLE_PROFILE, DIGITAL_KEY }
enum class Occupancy(val label: String) { SOLO("혼자"), COUPLE("부부"), FAMILY("가족"), WORK_COMPANION("업무 동승") }
enum class JourneyKind(val label: String) { COMMUTE("출퇴근"), BUSINESS("업무 방문"), TRIP("여행"), OUTING("외출"), PICKUP("픽업·마중") }
enum class PrefOwner(val label: String) { DRIVER("운전자"), OCCUPANCY("탑승 조합"), JOURNEY("이동 목적") }

object Situation {
    /** 시연 운전자 둘 — 시연 데이터. 성별이 아니라 "저장된 취향"이 다르다는 예시 */
    val DEMO_DRIVERS: Map<String, Driver> = mapOf(
        "dad" to Driver("dad", "아빠", DriverPrefs(seatVent = true, seatMemo = "운전석 메모리 1")),
        "mom" to Driver("mom", "엄마", DriverPrefs(seatHeat = true, steeringHeat = true, seatMemo = "운전석 메모리 2")),
    )
    val DEMO_DRIVER_IDS = listOf("dad", "mom")
    val RECOGNITION = DriverRecognition.MANUAL

    // 픽업은 가족 맥락이다 — 돌아오는 길에 아이가 탄다. 공조·음악 취향은 가족 조합의 것 (situation.ts)
    val OCCUPANCY_OF: Map<ProfileMode, Occupancy?> = mapOf(ProfileMode.SOLO to Occupancy.SOLO, ProfileMode.WORK to Occupancy.SOLO, ProfileMode.FAMILY to Occupancy.FAMILY, ProfileMode.PICKUP to Occupancy.FAMILY, ProfileMode.COMPANION to Occupancy.COUPLE, ProfileMode.GUEST to null)
    val JOURNEY_OF: Map<ProfileMode, JourneyKind?> = mapOf(ProfileMode.SOLO to JourneyKind.COMMUTE, ProfileMode.WORK to JourneyKind.BUSINESS, ProfileMode.FAMILY to JourneyKind.TRIP, ProfileMode.PICKUP to JourneyKind.PICKUP, ProfileMode.COMPANION to JourneyKind.OUTING, ProfileMode.GUEST to null)
    val CABIN_OWNER: Map<CabinKey, PrefOwner> = mapOf(
        CabinKey.HVAC_TEMP to PrefOwner.OCCUPANCY, CabinKey.HVAC_POWER to PrefOwner.OCCUPANCY, CabinKey.SEAT_VENT to PrefOwner.DRIVER, CabinKey.SEAT_HEAT to PrefOwner.DRIVER,
        CabinKey.STEERING_HEAT to PrefOwner.DRIVER, CabinKey.LIGHTING to PrefOwner.OCCUPANCY, CabinKey.MUSIC to PrefOwner.OCCUPANCY,
    )

    fun soloKey(driver: String, mode: ProfileMode) = "$driver|$mode"

    /** 세 맥락을 합쳐 비교 입력을 만든다 — 운전자 미확인이면 운전석 항목은 null(유지). 혼자 조합 + 운전자 확인이면 그 운전자의 혼자 공조(solo)가 프리셋을 덮는다 */
    fun combinedPrefs(profile: UserProfile, driver: Driver?, solo: SoloCabin? = null): CabinPrefs {
        // 프로필 없이(GUEST) = 개인 선호 없음 — 운전자 취향도 쓰지 않는다
        val d = if (driver != null && profile.mode != ProfileMode.GUEST) driver.prefs else DriverPrefs.NONE
        val so = if (driver != null && OCCUPANCY_OF[profile.mode] == Occupancy.SOLO) solo else null
        return CabinPrefs(so?.hvacTempC ?: profile.targetC, so?.hvacOn ?: profile.cabin.hvacOn, d.seatVent, d.seatHeat, d.steeringHeat, profile.cabin.lighting, profile.cabin.music, profile.cabin.guidance)
    }

    /** "아빠 · 가족 · 여행" — 운전자 미확인이면 "운전자 미확인" */
    fun label(profile: UserProfile, driver: Driver?): String = listOfNotNull(
        driver?.name ?: "운전자 미확인", OCCUPANCY_OF[profile.mode]?.label ?: "프로필 없이", JOURNEY_OF[profile.mode]?.label,
    ).joinToString(" · ")

    fun seatMemoLine(driver: Driver?) = when {
        driver == null -> "운전자 미확인 · 운전석 설정은 차량 프로필 그대로"
        driver.prefs.seatMemo != null -> "${driver.name} · ${driver.prefs.seatMemo} (차량 운전자 프로필 · 앱은 바꾸지 않음)"
        else -> "${driver.name} · 운전석 위치 메모 없음"
    }
}
