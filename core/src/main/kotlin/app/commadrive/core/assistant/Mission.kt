package app.commadrive.core.assistant

import app.commadrive.core.TripPlan

/**
 * Journey Mission — "하나의 이동 목적"을 끝까지 관리하는 최소 상태 객체 (V5 지시서 3·4절, 2026-11-02). `src/lib/assistant/mission.ts` 의 거울.
 *
 * 새 엔진이 아니다. 여정 구간(Journey.kt) · 계획(TripPlan.returnKm) · 상황(Situation.kt) · Journey Memory 위에 공통된 목표와 진행 상태를 얹는다.
 * Mission 은 상태에서 **계산**한다(of). 따로 드는 값은 셋 — nextLegReady · waitSource · endedEarly (SessionState).
 * 정책(지시서 4절): 중간 목적지 도착 ≠ 완료 · 귀가 계획 보존 · 대기 시간은 입력·저장값만 · 확인된 상태만 복원 · 내비 목적지는 앱이 바꾸지 않음.
 */
enum class MissionType(val label: String) { SOLO_COMMUTE("혼자 출퇴근"), WORK_VISIT_RETURN("업무 방문 후 복귀"), FAMILY_TRIP("가족 이동·여행"), PICKUP_RETURN("픽업 후 귀가"), OUTING("동승 외출") }

/** 수명 주기 — 모든 Mission 이 모든 상태를 거치지 않는다. 편도는 ARRIVED_AT_STOP(최종) → COMPLETED */
enum class MissionPhase(val label: String) {
    MISSION_SELECTED("선택됨"), PREPARE("출발 준비"), EN_ROUTE("이동 중"), ARRIVED_AT_STOP("도착"), WAITING("차 안에서 대기"), VISITING("방문 중"),
    NEXT_LEG_READY("귀가 확인 · 내비 미설정"), RETURNING("귀가 중"), COMPLETED("완료"),
}
enum class MissionStatus { ACTIVE, PAUSED, COMPLETED, CANCELLED }
/** 대기 시간의 출처 — SAVED 저장된 계획 · USER 직접 확인·변경 · NONE 없음(프로필 없이) → 대기 소비는 계산에 없다 */
enum class WaitSource(val label: String) { SAVED("저장된 계획"), USER("직접 확인"), NONE("미확인 · 대기 소비는 계산에 없음") }

data class MissionWait(val minutes: Int, val source: WaitSource)
data class MissionCapability(val energy: Boolean)

data class Mission(
    /** `모드#이동번호` */
    val missionId: String,
    val missionType: MissionType?,
    /** null = 운전자 미확인 */
    val driverId: String?,
    val occupancy: Occupancy?,
    val tripPurpose: JourneyKind?,
    val destination: String,
    val waypointIds: List<String>,
    /** 복귀 목적지 — 저장된 왕복 계획일 때만 */
    val returnDestination: String?,
    val wait: MissionWait,
    val phase: MissionPhase,
    val remainingLegs: Int,
    val finalStop: Boolean,
    val status: MissionStatus,
    val capability: MissionCapability,
    val createdAt: String?,
    val updatedAt: String,
    /** 내비 목적지가 집으로 설정된 것을 목적지를 다시 읽어 확인했나(RouteHandoff VERIFIED) */
    val naviRouteVerified: Boolean = false,
    /** 그 확인이 모의 내비에서 온 것인가 */
    val naviRouteMock: Boolean = false,
)

data class MissionInput(
    val mode: ProfileMode, val tripId: Int, val driver: String?, val plan: TripPlan, val journey: JourneyState, val waitMode: WaitMode,
    val nextLegReady: Boolean, val waitSource: WaitSource, val endedEarly: Boolean, val energyAvailable: Boolean, val clock: String, val createdAt: String?,
    val waypointIds: List<String>,
    val naviRouteVerified: Boolean = false,
    val naviRouteMock: Boolean = false,
)

/**
 * 복원 스냅샷 — 확인된 것만(선택·계획·구간·기억·경유지·대기 유형·귀가 준비). 진행 중 제어 요청·알림 기준·위치는 담지 않는다.
 * 차량 값(배터리·주행 시간)은 모의 차량일 때만 의미가 있다 — 실제 차량에서는 콜백이 덮는다.
 */
data class MissionSnapshot(
    val version: Int = 1,
    val mode: ProfileMode, val driver: String?, val chosen: Boolean,
    val plan: TripPlan, val journey: JourneyState, val traveledKm: Double, val waitedMin: Int, val simMin: Int,
    val waitMode: WaitMode, val waitSource: WaitSource, val nextLegReady: Boolean, val endedEarly: Boolean, val missionStartedAt: String?,
    val memory: JourneyMemory, val waypointIds: List<String>, val chargedAt: List<String>,
    val batteryPct: Double, val tripMinutes: Int, val savedAt: String,
)

object Missions {
    val OF: Map<ProfileMode, MissionType?> = mapOf(
        ProfileMode.SOLO to MissionType.SOLO_COMMUTE, ProfileMode.WORK to MissionType.WORK_VISIT_RETURN, ProfileMode.FAMILY to MissionType.FAMILY_TRIP,
        ProfileMode.PICKUP to MissionType.PICKUP_RETURN, ProfileMode.COMPANION to MissionType.OUTING, ProfileMode.GUEST to null,
    )

    /** 여정 단계 → Mission 단계. 중간 정차(휴게소·충전소)는 EN_ROUTE 안의 일이다 */
    fun phaseOf(j: JourneyState, waitMode: WaitMode, nextLegReady: Boolean): MissionPhase = when (j.phase) {
        JourneyPhase.NOT_STARTED -> MissionPhase.MISSION_SELECTED
        JourneyPhase.PREPARING -> MissionPhase.PREPARE
        JourneyPhase.DRIVING, JourneyPhase.APPROACHING -> if (j.leg > 0) MissionPhase.RETURNING else MissionPhase.EN_ROUTE
        JourneyPhase.PARKED, JourneyPhase.FINISHING -> if (j.atDestination) MissionPhase.ARRIVED_AT_STOP else if (j.leg > 0) MissionPhase.RETURNING else MissionPhase.EN_ROUTE
        JourneyPhase.WAITING -> if (nextLegReady) MissionPhase.NEXT_LEG_READY else if (waitMode == WaitMode.AWAY) MissionPhase.VISITING else MissionPhase.WAITING
        JourneyPhase.COMPLETED -> MissionPhase.COMPLETED
    }

    fun remainingLegsOf(j: JourneyState) = if (j.phase == JourneyPhase.COMPLETED) 0 else j.legs - j.leg

    /** 상태에서 Mission 을 계산한다. 이동 번호가 없으면(아직 고르지 않음) null */
    fun of(i: MissionInput): Mission? {
        if (i.tripId <= 0) return null
        val j = i.journey
        val ret = if (i.plan.returnKm > 0) Trip.RETURN_DESTINATION else null
        val status = if (j.phase == JourneyPhase.COMPLETED) (if (i.endedEarly) MissionStatus.CANCELLED else MissionStatus.COMPLETED) else MissionStatus.ACTIVE
        return Mission(
            "${i.mode}#${i.tripId}", OF[i.mode], i.driver, Situation.OCCUPANCY_OF[i.mode], Situation.JOURNEY_OF[i.mode],
            i.plan.destinationName, i.waypointIds, ret, MissionWait(i.plan.waitMinutesAfterArrival, i.waitSource),
            phaseOf(j, i.waitMode, i.nextLegReady), remainingLegsOf(j), j.atDestination && j.isLastLeg, status, MissionCapability(i.energyAvailable), i.createdAt, i.clock, i.naviRouteVerified, i.naviRouteMock,
        )
    }

    /** 화면 머리 — "가족 이동·여행 · 이동 중" */
    fun headline(m: Mission) = "${m.missionType?.label ?: "프로필 없이"} · ${if (m.phase == MissionPhase.NEXT_LEG_READY && m.naviRouteVerified) (if (m.naviRouteMock) "귀가 경로 확인됨 (모의)" else "귀가 경로 확인됨") else m.phase.label}"

    /** 복귀 줄 — 귀가 구간이 남아 있을 때만. 없는 복귀를 적지 않는다 */
    fun returnLine(m: Mission): String? {
        if (m.returnDestination == null || m.status != MissionStatus.ACTIVE || m.remainingLegs < 2) return null
        if (m.phase == MissionPhase.NEXT_LEG_READY && m.naviRouteVerified) return if (m.naviRouteMock) "시연 내비 목적지: ${m.returnDestination} (모의)" else "내비 목적지: ${m.returnDestination} · 내비가 확인함"
        return if (m.phase == MissionPhase.NEXT_LEG_READY) "귀가 일정은 기억하고 있어요 · 이동을 시작하려면 내비게이션에서 ${m.returnDestination}를 목적지로 설정해 주세요" else "귀가 ${m.returnDestination} 일정 기억 중 · 방문 뒤에도 끝나지 않음"
    }

    /** 복원할 가치가 있나 — 진행 중이고 출발 준비 이후인 것만 */
    fun restorable(s: MissionSnapshot?): Boolean =
        s != null && s.version == 1 && s.chosen && s.journey.phase != JourneyPhase.NOT_STARTED && s.journey.phase != JourneyPhase.COMPLETED
}
