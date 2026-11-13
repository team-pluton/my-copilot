package app.commadrive.core.assistant

import app.commadrive.core.DriveMode
import app.commadrive.core.PassengerType
import app.commadrive.core.TripMode
import app.commadrive.core.TripPlan
import app.commadrive.core.VehicleSnapshot

/**
 * 사용자 프로필 — `src/lib/assistant/profile.ts` 의 거울 (Android 이식 때 옮겼다, 2026-10-26).
 * 사용자가 직접 고른다. 누가 탔는지 추정하지 않는다. 동승자는 수동 설정이다 (CLAUDE.md 정책 6).
 */
/** GUEST = "프로필 없이 시작" — 개인 선호가 없는 상태. 고르는 프로필이 아니고 기록을 남기지 않는다(profile.ts 와 같다) */
/** PICKUP = 픽업·마중 후 귀가(V5 Mission C, 2026-11-02) — 가족 맥락의 둘째 조합. 픽업 장소는 중간 목적지, 집이 끝이다 */
enum class ProfileMode { SOLO, FAMILY, WORK, PICKUP, COMPANION, GUEST }

/** 탑승 조합 — 첫 화면의 선택 셋: 혼자 · 가족 · 동승자. 맥락 안에 자주 쓰는 조합(프로필)을 둔다 (profile.ts Context) */
enum class Context(val label: String) { SOLO("혼자"), FAMILY("가족"), COMPANION("동승자") }

data class UserProfile(
    val mode: ProfileMode,
    val name: String,
    /** 저장한 공조 온도(°C). null = 맞추지 않는다 */
    val targetC: Double?,
    val proactive: Boolean,
    val voice: Boolean,
    val passengers: Set<PassengerType>,
    val packing: List<String>,
    val finishChecklist: List<String>,
    val requireAllChecked: Boolean,
    val minReservePct: Double,
    /** 탑승 조합별 실내 취향(Personal Cabin Memory) — null 은 차량 현재 설정 유지. 공조 온도는 targetC (Profiles.cabinPrefsOf) */
    val cabin: CabinPrefs = CabinPrefs.NONE,
)

object Profiles {
    private val COMMON_FINISH = listOf("휴대전화", "지갑·소지품", "차량 내 준비물", "다음 일정 확인")

    /** 동승자에서 하차 항목을 만든다 — 프로필 이름이 아니라 실제로 고른 동승자가 정한다 */
    fun finishItemsFor(mode: ProfileMode, passengers: Set<PassengerType>): List<String> {
        val items = COMMON_FINISH.toMutableList()
        if (PassengerType.CHILD in passengers) items += listOf("아이 준비물", "아이 가방", "유모차")
        if (PassengerType.PET in passengers) items += "반려동물 이동 용품"
        if (mode == ProfileMode.WORK) {
            val i = items.indexOf("다음 일정 확인")
            items.removeAt(i)
            items.addAll(i, listOf("노트북", "업무 자료", "방문 목적 확인", "다음 일정 메모"))
        }
        // 픽업·마중 — 픽업 장소에서는 보통 내리지 않는다(차 안 대기). 집에 도착해 내릴 때 아이 짐만 더 본다
        if (mode == ProfileMode.PICKUP) return COMMON_FINISH + "아이 가방"
        return items
    }

    /** 시연 프리셋의 실내 취향 — 오너 시안(2026-10-28). 전부 시연 데이터. 실제 사용자는 비어 있는(유지) 상태에서 시작한다 (profile.ts PROFILE_PRESETS) */
    val PRESETS: Map<ProfileMode, UserProfile> = mapOf(
        // 혼자 출퇴근 — 하차 체크리스트는 기본으로 비워 둔다. 묻지 않는 것이 기본이다
        ProfileMode.SOLO to UserProfile(ProfileMode.SOLO, "혼자 이동", 22.0, true, true, emptySet(), emptyList(), emptyList(), false, 15.0,
            CabinPrefs(lighting = Lighting.CALM, music = "나만의 드라이브 플레이리스트", guidance = Guidance.QUIET)),
        ProfileMode.FAMILY to UserProfile(
            ProfileMode.FAMILY, "가족 이동", 23.0, true, true, setOf(PassengerType.CHILD, PassengerType.PET),
            listOf("아이 간식·물", "기저귀 가방", "반려견 목줄·배변봉투"), finishItemsFor(ProfileMode.FAMILY, setOf(PassengerType.CHILD, PassengerType.PET)), true, 20.0,
            CabinPrefs(hvacOn = true, lighting = Lighting.BRIGHT, music = "아이들과 듣는 노래", guidance = Guidance.NORMAL),
        ),
        ProfileMode.WORK to UserProfile(
            ProfileMode.WORK, "업무 이동", 21.0, true, false, emptySet(),
            listOf("노트북·충전기", "출입증", "발표 자료"), finishItemsFor(ProfileMode.WORK, emptySet()), false, 20.0,
            CabinPrefs(guidance = Guidance.QUIET),
        ),
        // 픽업·마중 후 귀가(V5 Mission C) — 가는 길은 혼자, 돌아오는 길은 아이와. 시연 데이터 (profile.ts PICKUP)
        ProfileMode.PICKUP to UserProfile(
            ProfileMode.PICKUP, "아이 픽업 후 귀가", 23.0, true, true, setOf(PassengerType.CHILD),
            emptyList(), finishItemsFor(ProfileMode.PICKUP, setOf(PassengerType.CHILD)), false, 15.0,
            CabinPrefs(hvacOn = true, music = "아이들과 듣는 노래", guidance = Guidance.NORMAL),
        ),
        // 동승자 맥락의 시연 조합 "아내와 둘이"
        ProfileMode.COMPANION to UserProfile(ProfileMode.COMPANION, "아내와 둘이", 23.0, true, true, emptySet(), emptyList(), COMMON_FINISH, false, 15.0,
            CabinPrefs(lighting = Lighting.CALM, music = "둘이 듣는 플레이리스트", guidance = Guidance.NORMAL)),
        ProfileMode.GUEST to UserProfile(ProfileMode.GUEST, "기본 (프로필 없음)", null, true, true, emptySet(), emptyList(), emptyList(), false, 20.0),
    )

    val CONTEXT_OF: Map<ProfileMode, Context?> = mapOf(ProfileMode.SOLO to Context.SOLO, ProfileMode.WORK to Context.SOLO, ProfileMode.FAMILY to Context.FAMILY, ProfileMode.PICKUP to Context.FAMILY, ProfileMode.COMPANION to Context.COMPANION, ProfileMode.GUEST to null)
    /** 맥락의 첫 프로필이 기본값 */
    val CONTEXT_MODES: Map<Context, List<ProfileMode>> = mapOf(Context.SOLO to listOf(ProfileMode.SOLO, ProfileMode.WORK), Context.FAMILY to listOf(ProfileMode.FAMILY, ProfileMode.PICKUP), Context.COMPANION to listOf(ProfileMode.COMPANION))

    /** 비교에 쓰는 취향 묶음 — 공조 온도를 한 곳(targetC)에서 가져온다 */
    fun cabinPrefsOf(p: UserProfile) = p.cabin.copy(hvacTempC = p.targetC)

    /** mock.ts DEFAULT_VEHICLE 과 같다 — 68% · 77kWh · 공조 ON · 6°C (가상) */
    val DEMO_VEHICLE = VehicleSnapshot(68.0, 77.0, null, true, 6.0, DriveMode.NORMAL, 0, 0.0, false)

    /** 시연 여정 — profile.ts TRIP_PRESETS 와 같다. 가족 = 쉼표 DRIVE 기본 시나리오(서울→부산) · 업무 = 고객사 왕복 + 90분 · 혼자 = 출근 24km */
    val TRIPS: Map<ProfileMode, TripPlan> = mapOf(
        ProfileMode.SOLO to TripPlan("회사 (출근)", 24.0, 0, 15.0, emptySet(), 90),
        ProfileMode.FAMILY to TripPlan("부산", 400.0, 40, 20.0, setOf(PassengerType.CHILD, PassengerType.PET), 90),
        ProfileMode.WORK to TripPlan("판교 고객사 (왕복)", 38.0, 90, 20.0, emptySet(), 120, TripMode.WAIT, 38.0),
        // 픽업·마중 — 학원 왕복 + 차 안에서 20분 대기(WAIT). 수치는 가상
        ProfileMode.PICKUP to TripPlan("학원 (픽업 · 왕복)", 12.0, 20, 15.0, setOf(PassengerType.CHILD), 90, TripMode.WAIT, 12.0),
        ProfileMode.COMPANION to TripPlan("저녁 외식 (강남)", 18.0, 0, 15.0, emptySet(), 90),
        ProfileMode.GUEST to TripPlan("부산", 400.0, 0, 20.0, emptySet(), 90),
    )

    /** 고를 수 있는 프로필 */
    val SELECTABLE = listOf(ProfileMode.SOLO, ProfileMode.WORK, ProfileMode.FAMILY, ProfileMode.PICKUP, ProfileMode.COMPANION)

    /** 대기 유형 기본값 — 업무(미팅)는 차를 두고, 그 밖은 차 안에서. 사용자가 바꾼다 */
    fun defaultWaitModeOf(mode: ProfileMode) = if (mode == ProfileMode.WORK) WaitMode.AWAY else WaitMode.IN_CAR

    /** 프로필과 여정을 합친다 — 동승자·최소 잔량은 프로필이 정한다 */
    fun planFor(p: UserProfile): TripPlan = TRIPS.getValue(p.mode).copy(passengers = p.passengers, minReservePct = p.minReservePct)

    /** 공조 비교 — 차가 지금 온도를 못 알려 주거나 저장값이 없으면 비교하지 않는다 */
    fun climateGapOf(p: UserProfile, currentC: Double?): ClimateGap? = climateGapOf(p.targetC, currentC)
    /** 목표는 합친 취향(Situation.combinedPrefs)의 공조 온도 — 프로필 targetC 만 보면 운전자별 혼자 공조(soloCabin)를 놓친다 */
    fun climateGapOf(targetC: Double?, currentC: Double?): ClimateGap? = if (targetC == null || currentC == null) null else ClimateGap(currentC, targetC)

    /** 하차 완료 가능 여부 — 전부 확인이 필요한 프로필이면 남은 항목이 없어야 한다 */
    fun canFinish(p: UserProfile, checked: Collection<String>) = !p.requireAllChecked || p.finishChecklist.all { it in checked }
}
