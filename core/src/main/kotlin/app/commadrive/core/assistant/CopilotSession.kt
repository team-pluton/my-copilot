package app.commadrive.core.assistant

import app.commadrive.core.BreakScheduler
import app.commadrive.core.EnergyEstimator
import app.commadrive.core.EnergyPlan
import app.commadrive.core.Feasibility
import app.commadrive.core.RankInput
import app.commadrive.core.RankedRestStop
import app.commadrive.core.RecommendationEngine
import app.commadrive.core.RestStop
import app.commadrive.core.TripMode
import app.commadrive.core.TripPlan
import app.commadrive.core.Verdict
import app.commadrive.core.VehicleSnapshot

/**
 * MY CO-PILOT 세션 — 웹 시연(`src/components/copilot/copilot-sim.tsx`)의 판단 흐름을 순수 Kotlin 으로 옮긴 것.
 * Android 앱(`android/copilot`)은 이 상태를 그리기만 한다. SDK·타이머·모의 차량 응답은 앱이 [Intent] 로 넣는다.
 *
 * 왜 core 에 두나: 화면 없이 JVM 테스트로 "웹에서 본 장면이 앱에서도 같은 판단을 내는가"를 증명하려고.
 * 판단 규칙은 전부 이미 거울로 검증된 것들(journey · trip · planner · notify · actions · memory · energy-view)을 부를 뿐이다.
 * 시나리오는 웹과 같은 입력·같은 기대 결과로 CopilotSessionTest 가 고정한다.
 */
enum class UxMode { AUTO, RESTRICTED, UNRESTRICTED, UNKNOWN }

/** 연결 하나의 상태 — 끊긴 시각을 남겨 "언제 값인지"를 화면에 적는다 */
data class LinkState(val live: Boolean = true, val lostAt: String? = null) {
    companion object { val ALL_LIVE: Map<LinkKind, LinkState> = LinkKind.entries.associateWith { LinkState() } }
}
/** 시연의 신호 상태 — 내비 경로만 "받은 적 없음" */
val DEFAULT_STATUS: Map<SignalKind, SignalStatus> = SignalKind.entries.associateWith { if (it == SignalKind.ROUTE) SignalStatus.NONE else SignalStatus.OK }

/** 모의 차량 — 실제 앱에서는 copilot-adapters 가 채운다. 못 읽는 값은 링크 끊김·조회 불가로 표현한다 */
data class CarState(
    val gear: Gear = Gear.PARK,
    val parkingBrake: Boolean? = true,
    val speedKmh: Double = 0.0,
    val uxMode: UxMode = UxMode.AUTO,
    /**
     * 연결은 셋이다(Freshness.kt LinkKind): 주행 신호 AAOS · 배터리 Pleos EvBattery · 공조·도어 Pleos HVAC·Door.
     * 하나가 돌아왔다고 나머지가 유효한 것이 아니다 — 기능마다 필수 입력(Feature.required)만 검사한다(외부 평가 7 A).
     */
    val links: Map<LinkKind, LinkState> = LinkState.ALL_LIVE,
    /** 신호 자체의 상태 — 연결과 별개(외부 평가 8 ①). 실제 앱은 콜백이 오면 OK, `VehicleListener.onFailed` 면 ERROR. 내비 경로는 NaviHelper 연결 전이라 NONE */
    val signalStatus: Map<SignalKind, SignalStatus> = DEFAULT_STATUS,
    /** 동력원 — 전체 차량 대상(오너 결정 2026-10-28). 에너지 판단만 EV 에서 되고 다른 동력원은 그 기능만 끄고 이유를 적는다. 실제 앱의 판별 방법은 미확인 → 어댑터가 넣기 전까지 시연값 EV */
    val powertrain: Powertrain = Powertrain.EV,
    val hvacC: Double = 25.0,
    val hvacReadable: Boolean = true,
    val doorReadable: Boolean = true,
    val doorOpen: Boolean = false,
    val doorLocked: Boolean = false,
    /** 운전석 통풍·열선을 읽었나 — 실차(LiveCabin)에서 못 읽으면 false → 비교에서 "지금 값을 읽지 못함". 모의는 늘 읽힌 것으로 */
    val seatReadable: Boolean = true,
    val capHvac: Boolean? = true,
    val permClimate: Boolean? = true,
    /** 시트 제어 권한(CONTROL_CAR_SEATS) — 서드파티 허용 여부는 공조와 같이 미확인. 시연 기본값 true */
    val permSeat: Boolean? = true,
    /** 시트·조명 — Vehicle SDK Seat·Light 가 줄 값(모의). 조명은 조회 자체가 미확인이라 기본 "모름" */
    val seatVent: Boolean = false,
    val seatHeat: Boolean = false,
    val steeringHeat: Boolean = false,
    val lighting: Lighting? = null,
    val permNavi: Boolean? = true,
    val naviConnected: Boolean = true,
    /**
     * 실제 차량의 주행 신호(AAOS CarUxRestrictions · 속도 · 기어 · 주차 브레이크) — Pleos 차량·에뮬레이터에서 어댑터가 넣는다.
     * null 이면 위의 모의 값(gear·speedKmh·uxMode)을 쓴다. 실제 신호가 있으면 **모의 값으로 덮지 않는다**(정책 4).
     */
    val aaos: JourneySignals? = null,
    /** 배터리·효율이 실제 Pleos Vehicle SDK 값인가 — 화면 출처 표시용 */
    val vehicleLive: Boolean = false,
    /** 공조·도어가 실제 Pleos HVAC·Door 콜백 값인가(PleosCabinStateSource) — 화면 출처 표시용. 에뮬레이터에서 처음 붙임 2026-10-29 */
    val cabinLive: Boolean = false,
) {
    /** 전부 연결됐나 — "차량 데이터 연결" 스위치·배지 */
    val linkLive: Boolean get() = links.values.all { it.live }
    fun live(k: LinkKind) = links.getValue(k).live
    fun lostAt(k: LinkKind) = links.getValue(k).lostAt
    /** 가장 먼저 끊긴 시각 — 배지용 */
    val lostAt: String? get() = links.values.filter { !it.live }.mapNotNull { it.lostAt }.minOrNull()
}

data class SessionState(
    val chosen: Boolean = false,
    val mode: ProfileMode = ProfileMode.FAMILY,
    val profiles: Map<ProfileMode, UserProfile> = Profiles.PRESETS,
    val vault: ProfileVault = Memory.emptyVault(),
    val memory: JourneyMemory = Memory.newMemory(0, ProfileMode.FAMILY),
    val plan: TripPlan = Profiles.planFor(Profiles.PRESETS.getValue(ProfileMode.FAMILY)),
    val vehicle: VehicleSnapshot = Profiles.DEMO_VEHICLE,
    val car: CarState = CarState(),
    val journey: JourneyState = JourneyState.INITIAL,
    /** 이번 구간에서 달린 거리 */
    val traveledKm: Double = 0.0,
    val waitedMin: Int = 0,
    /** 시연 시계(분, 08:00 부터) — 벽시계를 쓰지 않는다 */
    val simMin: Int = 0,
    val notif: NotificationState = NotificationState.INITIAL,
    val action: ActionState = ActionState.idle(ControlSource.MOCK),
    val waypoints: List<RestStop> = emptyList(),
    val chargedAt: List<String> = emptyList(),
    /** 마지막으로 사람에게 보여 줄 짧은 알림 — 앱이 띄우고 ClearToast 로 지운다 */
    val toast: String? = null,
    val nextRequestId: Int = 1,
    /** 대기 유형 — 사용자가 알려 주는 사실. 기본값은 프로필이 정한다(Profiles.defaultWaitModeOf) */
    val waitMode: WaitMode = Profiles.defaultWaitModeOf(ProfileMode.FAMILY),
    /** 마지막 재판단(전 → 후 → 원인) — 토스트가 지나간 뒤에도 에너지 탭에 남긴다. 새 이동이면 비운다 */
    val rejudge: Rejudge? = null,
    /** 배터리 연결이 끊길 때 찍어 둔 에너지 입력 — 복구 때 비교해 원인을 적는다(여럿이면 하나로 말하지 않는다) */
    val atLoss: RejudgeInputs? = null,
    /** 실내 일괄 적용(Smart Cabin Prepare) — 승인 하나로 보내고 항목마다 결과를 따로 받는다. 결과 전에는 '적용 완료'라 하지 않는다 */
    val cabinBatch: CabinBatch = CabinBatch(),
    /** 운전자(수동) — 공식 운전자 인식 API 없음. null = 미확인 → 운전석 취향은 쓰지 않는다 (Situation.kt) */
    val driver: String? = null,
    // ── Mission(V5, 2026-11-02) — Mission 자체는 상태에서 계산한다(Missions.of). 따로 드는 값은 셋
    /** 귀가 구간 준비를 사용자가 확인했나(NEXT_LEG 수락) — 구간이 바뀌면 다시 false. 내비 목적지는 바꾸지 않는다 */
    val nextLegReady: Boolean = false,
    /** 대기 시간의 출처 — 저장된 계획 / 이번에 직접 확인 / 없음. 추정하지 않는다 */
    val waitSource: WaitSource = WaitSource.SAVED,
    /** 귀가 구간을 남긴 채 사용자가 끝냈나 — Mission 상태 CANCELLED */
    val endedEarly: Boolean = false,
    /** Mission 시작(출발 준비) 시각 — 시연 시계 */
    val missionStartedAt: String? = null,
    /** 원탭 다음 이동 — 귀가 목적지를 내비에 넘기는 요청(RouteHandoff). 앱이 NaviHelper 결과를 이벤트로 넣는다. 복원하지 않는다(다시 읽기 전 모름) */
    val handoff: HandoffState = HandoffState(),
) {
    val driverOrNull: Driver? get() = driver?.let { vault.drivers[it] }
    val profile get() = profiles.getValue(mode)
    val history get() = vault.history.getValue(mode)
    val clock get() = "%02d:%02d".format(8 + simMin / 60, simMin % 60)
    val legTotalKm get() = if (journey.leg == 0) plan.routeKm else plan.returnKm
    val legDestination get() = if (journey.leg == 0) plan.destinationName else Trip.RETURN_DESTINATION
}

enum class CabinBatchPhase { IDLE, PENDING, DONE, KEPT }
/** targets: 항목마다 차량에 보낼 값(공조 °C Double · 시트 Boolean) — 세션이 정하고 앱은 그대로 보낸다 */
data class CabinBatch(val phase: CabinBatchPhase = CabinBatchPhase.IDLE, val requestId: Int? = null, val keys: List<CabinKey> = emptyList(), val settled: CabinSettled? = null, val message: String? = null, val targets: Map<CabinKey, Any> = emptyMap())

sealed interface Intent {
    data class Choose(val mode: ProfileMode) : Intent
    /** 탑승 조합을 고르면 바로 출발 준비(비교)가 시작된다 — 선택 한 번이 곧 준비(One Choice, Ready to Drive) */
    data class ChooseAndPrepare(val mode: ProfileMode) : Intent
    /** 실내 설정 일괄 적용 — 승인 하나. 보내기 직전 Safety Gate 를 항목 종류마다 다시 돌린다 */
    data object ApplyCabin : Intent
    /** 차량 콜백·재조회 결과 — 항목마다. 요청 번호가 다르면 무시. source 는 모의/실차를 결과 문장에 그대로 단다(정책 4) */
    data class CabinResults(val requestId: Int, val outcomes: Map<CabinKey, CabinOutcome>, val source: ControlSource = ControlSource.MOCK) : Intent
    /** "지금 그대로" — 이번 이동에서는 실내 설정을 다시 묻지 않는다 */
    data object KeepCabin : Intent
    /** 준비물 한 번에 */
    data object PackAll : Intent
    /** 운전자 고르기 — 사용자가 직접. null = 미확인 */
    data class SetDriver(val id: String?) : Intent
    /** 학습 후보 저장 / 이번엔 아니요 */
    data class AcceptLearning(val key: CabinKey) : Intent
    data class DeclineLearning(val key: CabinKey, val value: Any) : Intent
    data object StartPrepare : Intent
    data object Drive : Intent
    data object Stop : Intent
    data object Park : Intent
    /** 1분 주행(80km/h) — 경유지·목적지·배터리 소진 지점에서 멈춘다 */
    data object Tick : Intent
    data class JumpTo(val km: Double) : Intent
    data class AdvanceClock(val minutes: Int) : Intent
    data class ChangeWait(val deltaMinutes: Int) : Intent
    data class SetBattery(val pct: Double) : Intent
    data object Winter : Intent
    data class SetHvac(val c: Double) : Intent
    /** 연결 셋을 한꺼번에 — 시나리오 J. 부분 복구는 [SetLinkOf] */
    data class SetLink(val live: Boolean) : Intent
    data class SetLinkOf(val kinds: List<LinkKind>, val live: Boolean) : Intent
    /** 신호 상태 — 조회 실패(onFailed)·받은 적 없음. 연결은 그대로 */
    data class SetSignalStatus(val kind: SignalKind, val status: SignalStatus) : Intent
    data class SetPowertrain(val powertrain: Powertrain) : Intent
    data class SetCar(val car: CarState) : Intent
    data object RequestClimate : Intent
    /** 확인 버튼 — 실행 직전 다시 검사하고 보낸다. 결과는 [ClimateEvent] 로 온다 */
    data object ConfirmClimate : Intent
    data class ClimateEvent(val event: ActionEvent, val appliedC: Double? = null) : Intent
    data object KeepClimate : Intent
    data class Dismiss(val type: SuggestionType) : Intent
    data class Accept(val type: SuggestionType) : Intent
    data class Reactivate(val type: SuggestionType) : Intent
    data class AddWaypointResult(val stop: RestStop, val added: Boolean, val reason: String?) : Intent
    data object Charge : Intent
    data class SetPacked(val items: List<String>) : Intent
    data object FinishPrepare : Intent
    data object StartFinish : Intent
    data class SetChecked(val items: List<String>) : Intent
    data object Complete : Intent
    data object StartWait : Intent
    data object EndTrip : Intent
    data object ClearToast : Intent
    /** 대기 유형 바꾸기 — 정차 중에만. 바꾸면 마지막으로 알린 판단과 비교해 재판단 */
    data class SetWaitMode(val mode: WaitMode) : Intent
    /** 실제 주행 신호 — AaosJourneySignalSource 콜백. 남은 거리는 세션이 계산한 값으로 채운다 */
    data class LiveSignals(val signals: JourneySignals) : Intent
    /** 실제 차량 값(Pleos Vehicle SDK) — 재판단 규칙 그대로 */
    data class LiveVehicle(val vehicle: VehicleSnapshot) : Intent
    /** 실제 실내 상태(Pleos HVAC·Door 콜백, PleosCabinStateSource) — 못 읽은 값은 null → 조회 실패로 적는다. 학습 관찰 출처 VEHICLE */
    data class LiveCabin(val cabin: CabinState) : Intent
    /** 출발 준비 항목 이번에는 건너뛰기 — 남은 일에서 빠지지만 확인 완료가 아니다 */
    data class SkipPrepare(val key: PrepareItemKey) : Intent
    /** 지금 프로필 고치기 — 정차 중에만. 출발 전이면 동승자·최소 잔량이 이번 계획에도 바로 들어간다 */
    data class EditProfile(val profile: UserProfile) : Intent
    /** 지금 프로필의 설정·기록만 지운다 — 다른 사람(프로필)의 것은 그대로 */
    data object WipeProfile : Intent
    /** 귀가 구간 준비 확인(V5 NEXT_LEG 수락) — 주차한 채 방문·대기 중에만. "준비됨" 표시뿐, NaviHelper 는 부르지 않는다 */
    data object ReadyNextLeg : Intent
    /** "집으로 안내 시작" — 귀가 일정을 확인한 뒤, 주차한 채로만. 즐겨찾기·현재 목적지를 읽는 것부터(Safety Gate REQUEST_ROUTE) */
    data class StartRouteHome(val mock: Boolean = false) : Intent
    /** NaviHelper 결과 · 교체 확인 · 취소 — 요청 번호가 다르면 리듀서가 무시한다 */
    data class Handoff(val event: HandoffEvent) : Intent
}

/** 화면이 그릴 것 — 상태에서 계산한다(따로 들고 있지 않는다) */
data class SessionView(
    val signals: JourneySignals,
    val motion: Motion,
    val restricted: Boolean,
    val remainingKm: Double,
    val remainPlan: TripPlan,
    val energy: EnergyPlan,
    val energyView: EnergyView,
    val suggestions: PlanResult,
    val climateState: ClimateState,
    /** 출발 준비 — 항목별 상태와 한 문장(Prepare.kt) */
    val prepare: PrepareStatus,
    /** 차량 상태와 여정 상태 — 따로(Wait.kt) */
    val status: Status,
    /** 판단 뒤 선택지 — 주의·부족일 때만(Options.kt) */
    val options: List<EnergyOption>,
    /** 이 구간에 남은 대기(분) · 차 안 대기 한계 한 줄 */
    val waitLeft: Int,
    val waitLimit: String?,
    /** 차종 미지원 · 권한 없음 — 앱이 바꿀 수 없는 공조 */
    val climateCantChange: String?,
    /** 주행 중 화면 한 줄(Drive.kt) */
    val drive: DriveLine,
    val ranked: List<RankedRestStop>,
    val nextWaypoint: RestStop?,
    val atWaypoint: RestStop?,
    val situation: String,
    val canStartWait: Boolean,
    val canEndTrip: Boolean,
    val canFinishQuietly: Boolean,
    /** 하차 체크리스트에서 확인하지 않은 항목 안내 — 완료를 막지 않는다(Profiles.finishNote). 다 확인했으면 null */
    val finishNote: String?,
    val checked: List<String>,
    val climateGate: GateResult,
    /** 에너지 판단을 하지 않는 이유 — 이 차량에서 안 되는 기능("내연기관 연료 계산은 아직 지원하지 않음 …") 또는 필수 입력 부족("부족한 정보: 배터리"). 없으면 null */
    val energyMissing: String?,
    /** 이 차량에서 에너지 판단이 되는가(동력원 → 지원 → 권한) — 공통 기능은 이와 무관 */
    val energyAvailability: Availability,
    /** 마지막 재판단 — 배터리 연결이 살아 있을 때만 보여 준다 */
    val rejudge: Rejudge?,
    /** 근거 등급 — 입력 계획 기반 / 내비 경로 기반 / 경로 없음 / 배터리 없음 */
    val energyBasis: EnergyBasis,
    /** 실내 비교(Smart Cabin Prepare) — 저장 취향 vs 지금 차량 설정. 같은 건 안 건드리고 지원·권한·신선도를 항목마다 본다 */
    val cabin: CabinPlan,
    /** 남은 확인이 없다 — 출발 준비 끝. 실내 적용 후보가 남았거나 보내는 중이면 아니다 */
    val prepareReady: Boolean,
    /** 탑승 조합 이름 — 혼자 · 가족 · 동승자 · 프로필 없이 */
    val contextLabel: String,
    /** "아빠 · 가족 · 여행" — DRIVER × OCCUPANCY × JOURNEY (situation 은 "어디까지 얼마나" 한 줄이라 이름을 따로) */
    val whoLabel: String,
    val seatMemo: String,
    /** 학습 후보 — 충분한 근거가 있을 때 하나만, 한 번만 */
    val candidate: LearnCandidate?,
    /** Mission(V5) — 이동 목적·단계·남은 구간·복귀. 고르기 전(이동 번호 0)은 null */
    val mission: Mission?,
    /** "집으로 안내 시작"을 보일 때 — 귀가 일정을 확인했고(NEXT_LEG_READY) 대기 중이며 귀가 구간이 남았을 때 */
    val canRouteHome: Boolean = false,
)

class CopilotSession(private val stops: List<RestStop>) {
    private val engine = RecommendationEngine()

    companion object {
        /** 기록·화면에 쓰는 여정 단계 이름 — 코드 이름(APPROACHING 등)을 사람에게 보이지 않는다. 웹 PHASE_LABEL 과 같다 */
        val PHASE_LABEL = mapOf(
            JourneyPhase.NOT_STARTED to "탑승 전", JourneyPhase.PREPARING to "출발 준비", JourneyPhase.DRIVING to "이동 중", JourneyPhase.APPROACHING to "곧 도착",
            JourneyPhase.PARKED to "주차", JourneyPhase.FINISHING to "하차 준비", JourneyPhase.WAITING to "대기 중 · 귀가 남음", JourneyPhase.COMPLETED to "이동 완료",
        )
    }

    // ── 계산 ─────────────────────────────────────────
    private fun signalsOf(s: SessionState, remainingKm: Double): JourneySignals {
        val c = s.car
        if (!c.live(LinkKind.DRIVE)) return JourneySignals(Gear.UNKNOWN, null, null, null, remainingKm)
        c.aaos?.let { return it.copy(remainingKm = remainingKm) }
        // AUTO: P 가 아니면 제한 — 실제 기준은 차종·DO 선언마다 다르다(설명회 질문 1). 보수적인 쪽
        val ux = when (c.uxMode) { UxMode.AUTO -> c.gear != Gear.PARK; UxMode.RESTRICTED -> true; UxMode.UNRESTRICTED -> false; UxMode.UNKNOWN -> null }
        return JourneySignals(c.gear, c.parkingBrake, c.speedKmh, ux, remainingKm)
    }

    private fun pos(s: SessionState) = LegPosition(s.journey.leg, s.traveledKm, s.waitedMin)
    private fun remaining(s: SessionState) = Trip.legRemainingKm(s.plan, pos(s))
    private fun remainPlan(s: SessionState) = Trip.remainingPlan(s.plan, pos(s))
    private fun energyOf(s: SessionState) = Wait.energyFor(remainPlan(s), s.vehicle, s.waitMode)
    private fun lostMin(l: LinkState) = l.lostAt?.let { it.take(2).toInt() * 60 + it.takeLast(2).toInt() - 8 * 60 }
    /** 신호별 신선도 — 어느 연결로 오는 값인지에 따라(Freshness.kt). 조회 불가(공조·도어)는 연결과 무관하게 모름 */
    fun freshMap(s: SessionState): Map<SignalKind, Freshness> = SignalKind.entries.associateWith { k ->
        if (k == SignalKind.PROFILE) return@associateWith Freshness.FRESH
        val st = s.car.signalStatus.getValue(k)
        // 내비 경로는 차량 연결과 다른 길(NaviHelper) — 상태만으로 정한다
        val lk = Fresh.linkOf(k) ?: return@associateWith Fresh.of(k, s.simMin, s.simMin, true, st)
        val readable = when (k) { SignalKind.HVAC -> s.car.hvacReadable; SignalKind.DOOR -> s.car.doorReadable; else -> true }
        if (!readable) Freshness.UNKNOWN else s.car.links.getValue(lk).let { Fresh.of(k, if (it.live) s.simMin else lostMin(it), s.simMin, it.live, st) }
    }
    /** 에너지 판단의 필수 입력(배터리)이 신선한가 — 아니면 보류. 주행 신호가 끊겨도 배터리가 살아 있으면 판단한다(그 반대도) */
    fun energyReady(s: SessionState) = Fresh.readiness(Feature.ENERGY, freshMap(s))
    /** 근거 등급 — 시연은 늘 "입력 계획 기반"(내비 경로 없음). 경로가 없으면 판단하지 않는다 */
    fun energyBasis(s: SessionState) = Fresh.energyBasisOf(freshMap(s), s.legTotalKm > 0)
    /** 이 차량에서 에너지 판단이 되는가 — 동력원(EV 만) → 지원 → 권한. 안 되면 에너지만 끄고 공통 기능은 그대로 */
    fun energyAvailability(s: SessionState) = Fresh.availability(Feature.ENERGY, VehicleCapability(s.car.powertrain))
    private fun energyUsable(s: SessionState) = energyAvailability(s).ok && s.car.live(LinkKind.ENERGY) && energyReady(s).ok && energyBasis(s) != EnergyBasis.NO_ROUTE
    private fun liveSoc(s: SessionState) = if (energyUsable(s)) s.vehicle.batteryPct else null
    /** 재판단 원인 비교에 쓰는 입력 묶음 */
    private fun inputsOf(s: SessionState) = RejudgeInputs(s.vehicle.batteryPct, s.vehicle.outsideTempC, s.vehicle.hvacOn, remaining(s), remainPlan(s).waitMinutesAfterArrival, s.waitMode)

    private fun gateCtx(s: SessionState, signals: JourneySignals) = GateContext(
        uxRestricted = signals.uxRestricted, motion = Journey.motionOf(signals),
        capabilities = mapOf(Capability.HVAC_TEMPERATURE to s.car.capHvac, Capability.NAVI_WAYPOINT to true, Capability.SEAT_POSITION to true),
        permissions = mapOf(Permission.CONTROL_CAR_CLIMATE to s.car.permClimate, Permission.NAVI_ROUTE_SEARCH to s.car.permNavi, Permission.CONTROL_CAR_SEATS to s.car.permSeat),
        inFlight = buildSet { if (s.action.phase == ActionPhase.PENDING) add(ActionType.SET_CLIMATE) },
    )

    private fun nextWaypoint(s: SessionState) = if (s.journey.leg != 0) null else s.waypoints.filter { it.routeKm > s.traveledKm - 0.01 }.minByOrNull { it.routeKm }

    fun view(s: SessionState): SessionView {
        val remainingKm = remaining(s)
        val signals = signalsOf(s, remainingKm)
        val motion = Journey.motionOf(signals)
        val restricted = Journey.isRestricted(signals)
        val rp = remainPlan(s)
        val energy = Wait.energyFor(rp, s.vehicle, s.waitMode)
        val verdict = EnergyEstimator.verdictOf(energy)
        val isWait = s.plan.mode == TripMode.WAIT
        val p = s.profile
        // 공조 목표는 프로필 targetC 가 아니라 합친 취향(운전자 × 혼자 soloCabin 포함) — 일괄 적용과 단건 제안·출발 준비가 같은 값을 봐야 한다(에뮬레이터 E20 에서 어긋남 발견, 2026-10-29)
        val targetC = prefsOf(s).hvacTempC
        // 화면이 말하는 판단 — 가는 길에 고른 경유지가 있으면 그곳에서 80% 충전한 계획으로 다시 판단(고른 사실만으로 "충분"이라 하지 않는다)
        val viaStop = nextWaypoint(s)
        val shown = viaStop?.let { Options.planViaStop(rp, s.vehicle, s.waitMode, maxOf(it.routeKm - s.traveledKm, 0.0)).first } ?: energy
        val ev = EnergyViews.of(if (energyUsable(s)) shown else null, liveSoc(s), s.vehicle.batteryKwh,
            EnergyContext(roundTrip = s.journey.leg == 0 && s.plan.returnKm > 0, viaWaypoint = viaStop != null, minReservePct = s.plan.minReservePct))
        val energySignal = if (!energyUsable(s) || verdict == Verdict.OK || s.waypoints.isNotEmpty()) null else EnergySignal(
            verdict, "${if (isWait) (if (s.journey.leg == 0) "대기·귀가까지" else "집까지") else if (s.plan.waitMinutesAfterArrival > 0) "도착 후 ${s.plan.waitMinutesAfterArrival}분 대기까지" else "${s.legDestination}까지"} 세면 ${EnergyViews.of(energy, s.vehicle.batteryPct, null).detail}.",
        )
        val checked = s.memory.finishChecked[s.journey.leg].orEmpty()
        val climateGate = SafetyGate.check(ActionType.SET_CLIMATE, gateCtx(s, signals), true)
        // 바꾸자고 해 놓고 못 바꾸지 않게 — 미지원·권한 없음이면 출발 준비는 "직접 확인", 제안에서는 뺀다
        val cantChange = climateGate.block?.takeIf { it == GateBlock.UNSUPPORTED || it == GateBlock.NO_PERMISSION }?.message
        val suggestions = SuggestionPlanner.plan(PlannerInput(
            journey = s.journey, restricted = restricted, now = s.simMin * 60_000L, energy = energySignal,
            breakPhase = BreakScheduler.phaseOf(s.plan, s.vehicle),
            climate = if (cantChange != null) null else Profiles.climateGapOf(targetC, if (s.car.hvacReadable && s.car.live(LinkKind.CABIN)) s.car.hvacC else null),
            checklistPending = p.finishChecklist.count { it !in checked }, proactive = p.proactive, history = s.history,
            context = PlannerContext(p.name, liveSoc(s), rp.waitMinutesAfterArrival, s.plan.minReservePct, s.vehicle.tripMinutes, s.plan.breakIntervalMinutes, remainingKm),
            // 탑승 조합의 안내 빈도 — "최소 안내"면 주의 등급은 추천함으로(위험은 그대로)
            quiet = p.cabin.guidance == Guidance.QUIET,
            mission = MissionHint(s.nextLegReady, if (s.plan.returnKm > 0) Trip.RETURN_DESTINATION else null, s.waitedMin, s.plan.waitMinutesAfterArrival),
        ))
        val cabin = cabinPlan(s, restricted)
        val climateState = when {
            targetC == null -> ClimateState.SKIP
            !s.car.hvacReadable || !s.car.live(LinkKind.CABIN) -> ClimateState.UNREADABLE
            kotlin.math.abs(s.car.hvacC - targetC) < 1 -> ClimateState.SAME
            else -> ClimateState.DIFFERENT
        }
        val rankInput = RankInput(s.plan, s.traveledKm, energy.needsCharge, s.vehicle.tripMinutes, Feasibility.of(s.vehicle, energy.waitPct, s.plan.minReservePct))
        val nw = nextWaypoint(s)
        val atWp = nw?.takeIf { s.traveledKm >= it.routeKm - 0.01 && motion.kind == MotionKind.PARKED }
        val j = s.journey
        val parkedAtDest = j.phase == JourneyPhase.PARKED && j.atDestination
        val situation = when {
            j.phase == JourneyPhase.NOT_STARTED -> "${s.legDestination}까지 ${Math.round(s.legTotalKm)}km${if (j.legs > 1 || isWait) " · 왕복" else ""}"
            j.phase == JourneyPhase.COMPLETED -> "이동 #${s.memory.tripId} 마침"
            j.phase == JourneyPhase.WAITING -> "귀가 ${fmt(s.plan.returnKm)}km 남음 · 배터리 ${Math.round(s.vehicle.batteryPct)}%"
            // 주차 + 남은 거리 0.5km 안은 '근처 정차'까지 — 내비 도착 이벤트를 쓰지 않으니 도착은 사용자가 확인한다(화면점검 2차 리뷰). 하차를 시작했으면 도착
            j.atDestination && j.phase == JourneyPhase.PARKED -> "${s.legDestination} 근처 정차 · 배터리 ${Math.round(s.vehicle.batteryPct)}%"
            j.atDestination && j.phase == JourneyPhase.FINISHING -> "${s.legDestination} 도착 · 배터리 ${Math.round(s.vehicle.batteryPct)}%"
            else -> "${s.legDestination}까지 ${Math.round(remainingKm)}km${if (j.leg == 0 && rp.waitMinutesAfterArrival > 0) " · 도착 후 ${rp.waitMinutesAfterArrival}분 대기" else ""} · 배터리 ${Math.round(s.vehicle.batteryPct)}%"
        }
        val prepare = Prepare.status(PrepareInput(
            climateState, if (s.car.hvacReadable && s.car.live(LinkKind.CABIN)) s.car.hvacC else null, targetC, s.memory.climate, cantChange,
            p.packing.size, p.packing.count { it in s.memory.packed },
            ev.status, viaStop != null, s.memory.skipped,
        ))
        val ranked = if (isWait) emptyList() else engine.rank(stops, rankInput)
        // 1위 후보는 가는 길에 슬롯이 남았을 때만 선택지가 된다
        val top = ranked.firstOrNull()?.stop?.takeIf { j.leg == 0 && s.waypoints.size < 2 }
        val options = if (!energyUsable(s)) emptyList()
            else Options.energyOptions(rp, s.vehicle, s.waitMode, top?.let { ChargeCandidate(it.name, maxOf(it.routeKm - s.traveledKm, 0.0)) })
        val waitLeft = if (j.leg == 0) rp.waitMinutesAfterArrival else 0
        val waitLimit = if (energyUsable(s) && waitLeft > 0) Options.waitLimitLine(Options.maxWaitWithoutCharge(rp, s.vehicle, s.waitMode), waitLeft) else null
        return SessionView(
            signals, motion, restricted, remainingKm, rp, energy, ev, suggestions, climateState,
            prepare, Wait.statusOf(j, motion, s.waitMode), options, waitLeft, waitLimit, cantChange,
            Drive.line(ev, energyUsable(s), nw?.let { DriveStop(it.name, Math.round(maxOf(it.routeKm - s.traveledKm, 0.0)).toInt()) }, if (isWait) "귀가" else "도착"),
            ranked, nw, atWp, situation,
            canStartWait = parkedAtDest && !j.isLastLeg,
            canEndTrip = j.phase == JourneyPhase.WAITING || (parkedAtDest && !j.isLastLeg),
            canFinishQuietly = parkedAtDest && j.isLastLeg && p.finishChecklist.isEmpty(),
            finishNote = Profiles.finishNote(p, checked),
            checked = checked,
            climateGate = climateGate,
            energyMissing = energyAvailability(s).line ?: if (energyBasis(s) == EnergyBasis.NO_ROUTE) EnergyBasis.NO_ROUTE.label else energyReady(s).line,
            energyAvailability = energyAvailability(s),
            rejudge = if (energyUsable(s)) s.rejudge else null,
            energyBasis = energyBasis(s),
            cabin = cabin,
            prepareReady = prepare.ready && (s.cabinBatch.phase != CabinBatchPhase.IDLE || cabin.toApply.isEmpty()) && s.cabinBatch.phase != CabinBatchPhase.PENDING,
            contextLabel = contextLabel(s),
            whoLabel = Situation.label(p, s.driverOrNull),
            seatMemo = Situation.seatMemoLine(s.driverOrNull),
            candidate = if (s.chosen && j.phase == JourneyPhase.PREPARING) Learning.candidates(s.vault.learning, LearnCtx(s.driver, s.mode), prefsOf(s), contextLabel(s)).firstOrNull() else null,
            mission = mission(s),
            canRouteHome = j.phase == JourneyPhase.WAITING && s.nextLegReady && s.plan.returnKm > 0,
        )
    }

    /** Mission 은 상태에서 계산한다 — 화면·제안·복원이 같은 이름으로 말하게 */
    fun mission(s: SessionState): Mission? = Missions.of(MissionInput(
        s.mode, s.memory.tripId, s.driver, s.plan, s.journey, s.waitMode, s.nextLegReady, s.waitSource, s.endedEarly,
        energyAvailability(s).ok, s.clock, s.missionStartedAt, s.waypoints.map { it.id }, s.handoff.phase == HandoffPhase.VERIFIED, s.handoff.mock,
    ))

    /** 복원 스냅샷 — 확인된 것만(Mission.kt). 진행 중 제어 요청·알림 기준은 담지 않는다 */
    fun snapshot(s: SessionState) = MissionSnapshot(
        mode = s.mode, driver = s.driver, chosen = s.chosen, plan = s.plan, journey = s.journey, traveledKm = s.traveledKm, waitedMin = s.waitedMin, simMin = s.simMin,
        waitMode = s.waitMode, waitSource = s.waitSource, nextLegReady = s.nextLegReady, endedEarly = s.endedEarly, missionStartedAt = s.missionStartedAt,
        memory = s.memory, waypointIds = s.waypoints.map { it.id }, chargedAt = s.chargedAt, batteryPct = s.vehicle.batteryPct, tripMinutes = s.vehicle.tripMinutes, savedAt = s.clock,
    )

    /**
     * 재시작·백그라운드 복귀 — 확인된 Mission 상태를 되살린다(지시서 4절 6). 저장소(프로필·vault)는 호출자가 base 에 넣어 준다.
     * 여정 단계는 저장값을 그대로 믿지 않고 지금 차 신호로 다시 판단한다(Journey.restore = next). 열려 있던 확인·보내던 요청은 복원하지 않는다 — 결과를 모르는 명령을 다시 보내지 않는다.
     * 경유지는 id 로 다시 찾는다(좌표·시설은 저장하지 않는다). 모의 차량의 배터리·주행 시간은 되살리되, 실제 차량이면 콜백이 덮는다.
     */
    fun restore(snap: MissionSnapshot, base: SessionState = SessionState()): SessionState {
        if (!Missions.restorable(snap)) return base
        val restored = base.copy(
            chosen = true, mode = snap.mode, driver = snap.driver, plan = snap.plan, journey = snap.journey, traveledKm = snap.traveledKm, waitedMin = snap.waitedMin, simMin = snap.simMin,
            waitMode = snap.waitMode, waitSource = snap.waitSource, nextLegReady = snap.nextLegReady, endedEarly = snap.endedEarly, missionStartedAt = snap.missionStartedAt,
            memory = snap.memory, waypoints = stops.filter { it.id in snap.waypointIds }, chargedAt = snap.chargedAt,
            vehicle = base.vehicle.copy(batteryPct = snap.batteryPct, tripMinutes = snap.tripMinutes),
            notif = NotificationState.INITIAL, rejudge = null, atLoss = null, action = ActionState.idle(ControlSource.MOCK), cabinBatch = CabinBatch(), toast = null,
        ).log(ActivityKind.STATE, "앱을 다시 열어 이동 #${snap.memory.tripId} 를 이어서 — ${snap.savedAt} 에 저장한 상태 · 진행 중이던 제어 요청은 복원하지 않음")
        return settle(restored, restored).say("이동 #${snap.memory.tripId} 를 이어서 합니다 · ${snap.savedAt} 저장")
    }

    /** DRIVER × OCCUPANCY × JOURNEY 를 합친 비교 입력 — 운전자 미확인이면 운전석은 유지 */
    private fun prefsOf(s: SessionState) = Situation.combinedPrefs(s.profile, s.driverOrNull, soloOf(s))
    /** 혼자 조합의 운전자별 공조(학습·승인한 것) — 없으면 프리셋 */
    private fun soloOf(s: SessionState): SoloCabin? = s.driver?.let { s.vault.soloCabin[Situation.soloKey(it, s.mode)] }

    /** 차량 상태 변화의 학습 관찰 — 출처(VEHICLE 실차 콜백 / MOCK 모의)를 그대로 넘긴다. 앱이 적용한 값(APP)은 기록되지 않는다. 운전석 항목은 혼자 탈 때만(Learning 규칙 6) */
    private fun SessionState.observe(key: CabinKey, value: Any, source: ObservationSource) =
        copy(vault = vault.copy(learning = Learning.observe(vault.learning, LearnCtx(driver, mode), key, value, memory.tripId, source)))

    private fun contextLabel(s: SessionState) = Profiles.CONTEXT_OF[s.mode]?.label ?: "프로필 없이"

    /**
     * 실내 비교(cabin.ts planCabin 과 같은 입력) — 공조·도어 연결이 끊기면 지금 값을 모른다 → 적용 후보가 되지 않는다.
     * 이번 이동에서 이미 결정한 공조는 다시 묻지 않는다(Journey Memory).
     */
    fun cabinPlan(s: SessionState, restricted: Boolean): CabinPlan {
        val c = s.car
        val live = c.live(LinkKind.CABIN)
        val now = if (live) CabinNow(if (c.hvacReadable) c.hvacC else null, s.vehicle.hvacOn, c.seatVent.takeIf { c.seatReadable }, c.seatHeat.takeIf { c.seatReadable }, c.steeringHeat, c.lighting) else CabinNow.UNKNOWN
        val support: CabinSupport = mapOf(
            CabinKey.HVAC_TEMP to CabinSupportItem(c.capHvac, c.permClimate), CabinKey.HVAC_POWER to CabinSupportItem(c.capHvac, c.permClimate),
            CabinKey.SEAT_VENT to CabinSupportItem(true, c.permSeat), CabinKey.SEAT_HEAT to CabinSupportItem(true, c.permSeat),
            CabinKey.STEERING_HEAT to CabinSupportItem(null, null), CabinKey.LIGHTING to CabinSupportItem(null, null),
        )
        return Cabin.withMemory(Cabin.plan(prefsOf(s), now, support, restricted, contextLabel(s)), s.memory)
    }

    // ── 행동 ─────────────────────────────────────────
    /** 프로필 없이 시작(GUEST)은 기록을 남기지 않는다 — 누구의 이동인지 모르는 기록이다 */
    private fun SessionState.log(kind: ActivityKind, text: String, tripId: Int = memory.tripId, who: ProfileMode = mode) =
        if (who == ProfileMode.GUEST) this else copy(vault = Memory.recordActivity(vault, who, Activity(clock, kind, text, tripId)))
    private fun SessionState.history(f: (Map<SuggestionType, SuggestionRecord>) -> Map<SuggestionType, SuggestionRecord>) =
        copy(vault = Memory.setHistory(vault, mode, f(history)))
    private fun SessionState.mem(e: MemoryEvent) = copy(memory = Memory.remember(memory, e))
    private fun SessionState.say(t: String) = copy(toast = t)
    private fun SessionState.resurfaceEnergy() = history { h ->
        val re = SuggestionPlanner.reactivate(h, SuggestionType.ENERGY_DECISION)
        re + (SuggestionType.ENERGY_DECISION to re.getValue(SuggestionType.ENERGY_DECISION).copy(doneThisTrip = false))
    }

    /** 갈 수 있는 끝 — 다음 경유지 · 구간 목적지 · 배터리가 바닥나는 지점 중 가장 가까운 곳 */
    private fun limitOf(s: SessionState): Pair<Double, Boolean> {
        val emptyAt = s.traveledKm + s.vehicle.batteryPct / EnergyEstimator.pctPerKm(s.vehicle)
        val stopAt = minOf(nextWaypoint(s)?.routeKm ?: s.legTotalKm, s.legTotalKm)
        return if (emptyAt < stopAt) emptyAt to true else stopAt to false
    }

    private fun moveTo(s: SessionState, km: Double): SessionState {
        val (limit, empty) = limitOf(s)
        val target = minOf(km, limit)
        val d = maxOf(target - s.traveledKm, 0.0)
        val minutes = Math.round(d / 80 * 60).toInt()
        var n = s.copy(
            traveledKm = target, simMin = s.simMin + minutes,
            // 실제 배터리 값을 받고 있으면 모의 주행이 덮지 않는다 — 정책 4(E28: 모의 400km 뒤 '7% · 차량 정보'로 보였다. 실제 차량 값은 100%)
            vehicle = s.vehicle.copy(batteryPct = if (s.car.vehicleLive) s.vehicle.batteryPct else maxOf(s.vehicle.batteryPct - d * EnergyEstimator.pctPerKm(s.vehicle), 0.0), tripMinutes = s.vehicle.tripMinutes + minutes),
        )
        if (target >= limit - 1e-9 && km >= limit) {
            n = n.copy(car = n.car.copy(speedKmh = 0.0))
            if (empty) n = n.say("배터리가 바닥나는 지점에서 멈췄습니다 (모의) · 충전 경유지를 먼저 넣으세요")
        }
        return n
    }

    /** 재판단 카드의 원인은 호출자가 말하는 것이 아니라 **전후 입력을 비교**해 뽑는다 — 둘 이상 바뀌었으면 하나로 말하지 않는다(외부 평가 7 B) */
    private fun replan(s: SessionState, nextPlan: TripPlan, nextV: VehicleSnapshot, why: String): SessionState {
        val base = if (s.notif.lastNotified != null) s.notif else NotificationPolicy.decide(s.notif, energyOf(s)).state
        val moved = s.copy(plan = nextPlan, vehicle = nextV)
        val d = NotificationPolicy.decide(base, energyOf(moved))
        var n = moved.copy(notif = d.state)
        val msg = NotificationPolicy.message(d, nextV.batteryPct) ?: return n
        val cause = NotificationPolicy.cause(NotificationPolicy.changedInputs(inputsOf(s), inputsOf(moved)))
        n = n.copy(rejudge = NotificationPolicy.note(d, nextV.batteryPct, "바꾸기 전", "바꾼 뒤", cause, n.clock) ?: n.rejudge)
        n = n.say(msg).log(ActivityKind.ENERGY, "$why · $msg")
        return if (NotificationPolicy.shouldResurface(d)) n.resurfaceEnergy() else n
    }

    private fun tripSummary(s: SessionState) =
        "준비 ${if (s.memory.prepareDone) "완료" else "확인 안 함"} · 공조 ${s.memory.climate?.let { if (it.decision == ClimateDecisionKind.APPLIED) "${fmt(it.valueC)}°C 적용(모의)" else "${fmt(it.valueC)}°C 유지" } ?: "결정 없음"} · 충전 정차 ${s.chargedAt.size}회"

    fun reduce(s: SessionState, i: Intent): SessionState = settle(s, apply(s, i))

    private fun apply(s: SessionState, i: Intent): SessionState = when (i) {
        is Intent.Choose -> choose(s, i.mode)
        is Intent.ChooseAndPrepare -> chooseAndPrepare(s, i.mode)
        Intent.ApplyCabin -> applyCabin(s)
        is Intent.CabinResults -> cabinResults(s, i.requestId, i.outcomes, i.source)
        // "지금 그대로" — 공조 유지 결정(Journey Memory)과 같은 규칙으로 이번 이동에서는 다시 묻지 않는다
        Intent.KeepCabin -> keepClimate(s.copy(cabinBatch = CabinBatch(CabinBatchPhase.KEPT)))
        Intent.PackAll -> s.mem(MemoryEvent.Packed(s.profile.packing)).log(ActivityKind.PREPARE, "준비물 ${s.profile.packing.size}개 모두 챙김 (사용자 확인)")
        is Intent.SetDriver -> s.copy(driver = i.id, vault = Memory.rememberDriver(s.vault, i.id), cabinBatch = CabinBatch())
        is Intent.AcceptLearning -> acceptLearning(s, i.key)
        is Intent.DeclineLearning -> s.copy(vault = s.vault.copy(learning = Learning.decline(s.vault.learning, LearnCtx(s.driver, s.mode), i.key, i.value)))
            .log(ActivityKind.PREPARE, "취향 후보 거절 · ${i.key.label} — 이 값은 다시 묻지 않음")
        Intent.StartPrepare -> startPrepare(s)
        Intent.Drive -> s.copy(car = s.car.copy(gear = Gear.DRIVE, parkingBrake = false, speedKmh = 80.0))
        Intent.Stop -> s.copy(car = s.car.copy(speedKmh = 0.0))
        Intent.Park -> s.copy(car = s.car.copy(speedKmh = 0.0, gear = Gear.PARK, parkingBrake = true))
        Intent.Tick -> if (s.car.speedKmh <= 0) s else moveTo(s, s.traveledKm + 80.0 / 60.0)
        is Intent.JumpTo -> moveTo(s, i.km)
        is Intent.AdvanceClock -> s.copy(simMin = s.simMin + i.minutes, waitedMin = s.waitedMin + if (s.journey.phase == JourneyPhase.WAITING) i.minutes else 0)
        // 대기 시간을 사용자가 바꾸면 그 값은 "직접 확인"이 된다(Mission wait.source)
        is Intent.ChangeWait -> replan(s, s.plan.copy(waitMinutesAfterArrival = maxOf(s.plan.waitMinutesAfterArrival + i.deltaMinutes, 0)), s.vehicle, "도착 후 대기 ${if (i.deltaMinutes > 0) "+" else "−"}${kotlin.math.abs(i.deltaMinutes)}분").copy(waitSource = WaitSource.USER)
        is Intent.SetBattery -> replan(s, s.plan, s.vehicle.copy(batteryPct = i.pct), "배터리 변경")
        Intent.Winter -> replan(s, s.plan, s.vehicle.copy(outsideTempC = -7.0, hvacOn = true), "겨울 −7° · 히터")
        // 개발 패널·모의 차량의 공조·시트 변경 = "차에서 누군가 돌린 것을 콜백이 알려 준 상황"을 연기한다 → 출처 MOCK 으로 관찰(실차 증거로 집계되지 않는다).
        // 실차 콜백(VEHICLE)은 Intent.LiveCabin(PleosCabinStateSource → liveCabin)으로 들어온다 — 에뮬레이터에서 처음 확인 2026-10-29 · 시트 단계는 E19
        is Intent.SetHvac -> s.copy(car = s.car.copy(hvacC = i.c)).observe(CabinKey.HVAC_TEMP, i.c, ObservationSource.MOCK)
        is Intent.SetLink -> setLinks(s, LinkKind.entries, i.live)
        is Intent.SetLinkOf -> setLinks(s, i.kinds, i.live)
        is Intent.SetSignalStatus -> s.copy(car = s.car.copy(signalStatus = s.car.signalStatus + (i.kind to i.status)))
        is Intent.SetPowertrain -> s.copy(car = s.car.copy(powertrain = i.powertrain))
        is Intent.SetCar -> {
            var n = s.copy(car = i.car)
            if (i.car.seatVent != s.car.seatVent) n = n.observe(CabinKey.SEAT_VENT, i.car.seatVent, ObservationSource.MOCK)
            if (i.car.seatHeat != s.car.seatHeat) n = n.observe(CabinKey.SEAT_HEAT, i.car.seatHeat, ObservationSource.MOCK)
            if (i.car.steeringHeat != s.car.steeringHeat) n = n.observe(CabinKey.STEERING_HEAT, i.car.steeringHeat, ObservationSource.MOCK)
            n
        }
        Intent.RequestClimate -> {
            val g = SafetyGate.check(ActionType.SET_CLIMATE, gateCtx(s, signalsOf(s, remaining(s))), false)
            if (!g.allowed && g.block != GateBlock.NEEDS_CONFIRMATION) s.say(g.block!!.message) else s.copy(action = Actions.reduce(s.action, ActionEvent.Open))
        }
        Intent.ConfirmClimate -> confirmClimate(s)
        is Intent.ClimateEvent -> {
            var n = s.copy(action = Actions.reduce(s.action, i.event))
            if (i.appliedC != null) n = n.copy(car = n.car.copy(hvacC = i.appliedC))
            if (n.action.phase == ActionPhase.VERIFIED_SUCCESS && s.action.phase != ActionPhase.VERIFIED_SUCCESS) {
                n = n.history { SuggestionPlanner.recordAccepted(it, SuggestionType.PROFILE_PREPARATION) }
                    .mem(MemoryEvent.Climate(ClimateDecisionKind.APPLIED, n.action.target ?: n.car.hvacC))
                    .log(ActivityKind.PREPARE, "공조 요청 #${n.action.requestId} · ${n.action.message}")
            }
            n
        }
        Intent.KeepClimate -> keepClimate(s.copy(action = Actions.reduce(s.action, ActionEvent.Cancel)))
        // 홈에서 공조를 건너뛰면 "그대로 두기로 함"(확인 완료)이 아니라 "이번에는 건너뜀". 이번 이동에서 다시 묻지는 않는다
        is Intent.Dismiss -> if (i.type == SuggestionType.PROFILE_PREPARATION) skipPrepare(s.history { SuggestionPlanner.recordKept(it, SuggestionType.PROFILE_PREPARATION, s.simMin * 60_000L) }, PrepareItemKey.CLIMATE)
            else s.history { SuggestionPlanner.recordDismissed(it, i.type, s.simMin * 60_000L) }
        is Intent.Accept -> s.history { SuggestionPlanner.recordAccepted(it, i.type) }
        is Intent.Reactivate -> s.history { SuggestionPlanner.reactivate(it, i.type) }
        is Intent.AddWaypointResult -> if (!i.added) s.say(i.reason ?: "경유지를 넣지 못했습니다") else s.copy(waypoints = s.waypoints + i.stop)
            .history { SuggestionPlanner.recordAccepted(it, SuggestionType.ENERGY_DECISION) }.mem(MemoryEvent.Waypoint(i.stop.id))
            .say("${i.stop.name} 경유지 추가됨 · 내비가 확인함 (시연 데이터)").log(ActivityKind.WAYPOINT, "${i.stop.name} 경유지 추가 (사용자 선택)")
        Intent.Charge -> {
            val v = view(s)
            val wp = v.atWaypoint ?: return s
            val before = Math.round(s.vehicle.batteryPct)
            s.copy(
                vehicle = s.vehicle.copy(batteryPct = maxOf(Feasibility.CHARGE_TARGET_PCT, s.vehicle.batteryPct), tripMinutes = 0),
                waypoints = s.waypoints - wp, chargedAt = s.chargedAt + wp.name, traveledKm = s.traveledKm + 0.1,
            ).log(ActivityKind.ENERGY, "${wp.name} 충전 $before→${maxOf(80, before.toInt())}% (모의)")
        }
        is Intent.SetPacked -> s.mem(MemoryEvent.Packed(i.items))
        Intent.FinishPrepare -> {
            val pr = view(s).prepare
            s.mem(MemoryEvent.PrepareDone).log(ActivityKind.PREPARE, "출발 준비 마침 · 완료 ${pr.done} · 할 일 ${pr.needs} · 건너뜀 ${pr.skipped} · 지원 안 함 ${pr.unsupported}")
                .say(if (pr.needs > 0) "출발 준비를 마쳤습니다 · 확인 필요 ${pr.needs}개가 남아 있습니다" else "출발 준비를 마쳤습니다")
        }
        Intent.StartFinish -> {
            val n = Journey.next(s.journey, signalsOf(s, remaining(s)), JourneyEvent.START_FINISH)
            if (n.phase == JourneyPhase.FINISHING) s.copy(journey = n).history { SuggestionPlanner.recordAccepted(it, SuggestionType.CHECKLIST_REMINDER) }
            else s.say("주차한 뒤에 하차 준비를 시작할 수 있습니다")
        }
        is Intent.SetChecked -> s.mem(MemoryEvent.FinishChecked(s.journey.leg, i.items))
        Intent.Complete -> complete(s)
        Intent.StartWait -> {
            val n = Journey.next(s.journey, signalsOf(s, remaining(s)), JourneyEvent.START_WAIT)
            if (n.phase == JourneyPhase.WAITING) s.copy(journey = n).log(ActivityKind.STATE, "${s.plan.destinationName} 도착 · 사용자 확인 · 대기 시작 · 귀가 ${fmt(s.plan.returnKm)}km 남음") else s
        }
        Intent.EndTrip -> {
            val n = Journey.next(s.journey, signalsOf(s, remaining(s)), JourneyEvent.END_TRIP)
            // 귀가 구간을 남긴 채 끝내면 Mission 은 완료가 아니라 중단(CANCELLED)이다 — 기록에도 그렇게 남는다
            if (n.phase == JourneyPhase.COMPLETED) s.copy(journey = n, endedEarly = !s.journey.isLastLeg).log(ActivityKind.FINISH, "이동 #${s.memory.tripId} 종료 (사용자 선택${if (!s.journey.isLastLeg) " · 귀가 구간 남은 채로" else ""}) · ${tripSummary(s)}").say("여정을 마쳤습니다") else s
        }
        Intent.ReadyNextLeg -> readyNextLeg(s)
        is Intent.StartRouteHome -> startRouteHome(s, i.mock)
        is Intent.Handoff -> handoffEvent(s, i.event)
        Intent.ClearToast -> s.copy(toast = null)
        is Intent.SetWaitMode -> setWaitMode(s, i.mode)
        is Intent.SkipPrepare -> skipPrepare(s, i.key)
        is Intent.EditProfile -> editProfile(s, i.profile)
        Intent.WipeProfile -> if (s.mode == ProfileMode.GUEST) s else s.copy(profiles = s.profiles + (s.mode to Profiles.PRESETS.getValue(s.mode)), vault = Memory.wipeProfile(s.vault, s.mode))
            .say("${s.profile.name} 프로필의 설정과 기록을 지웠습니다 · 다른 프로필은 그대로")
        is Intent.LiveSignals -> s.copy(car = s.car.copy(aaos = i.signals, speedKmh = i.signals.speedKmh ?: 0.0, signalStatus = s.car.signalStatus + listOf(SignalKind.GEAR, SignalKind.UX, SignalKind.SPEED).associateWith { SignalStatus.OK }))
        is Intent.LiveVehicle -> replan(s.copy(car = s.car.copy(vehicleLive = true, signalStatus = s.car.signalStatus + (SignalKind.SOC to SignalStatus.OK))), s.plan, i.vehicle.copy(tripMinutes = s.vehicle.tripMinutes), "차량 값 갱신")
        is Intent.LiveCabin -> liveCabin(s, i.cabin)
    }

    /**
     * 실제 실내 값 — 값이 오면 그 신호는 OK, null 이면 ERROR(조회 실패·권한 없음)로 적고 **모의 값으로 덮지 않는다**(정책 4).
     * 공조 설정 온도는 학습 관찰(출처 VEHICLE)로도 넘긴다 — 이 앱은 set 을 부르지 않으므로 여기 오는 변화는 전부 차에서 바뀐 것이다.
     * 누가 바꿨는지는 여전히 모른다(Learning 규칙 — 운전석 항목은 혼자 탈 때만, 주체는 추정).
     */
    /**
     * 실차 콜백은 **누가 바꿨는지 모른다**(Learning 규칙). 앱이 방금 적용한 값(JourneyMemory 의 APPLIED 공조 · 이번 일괄 적용 결과)과 같은 값이 돌아오면
     * 출처를 APP 으로 — 기록되지 않는다. 운전자가 다른 값으로 바꾸면 VEHICLE.
     */
    private fun liveCabin(s: SessionState, c: CabinState): SessionState {
        val hvac = c.hvacSetC
        val vent = SignalMapping.seatVentOn(c.seatVentLevel, c.seatHeatLevel)
        val heat = SignalMapping.seatHeatOn(c.seatHeatLevel)
        val status = s.car.signalStatus + mapOf(
            SignalKind.HVAC to (if (hvac != null) SignalStatus.OK else SignalStatus.ERROR),
            SignalKind.DOOR to (if (c.doorOpen != null) SignalStatus.OK else SignalStatus.ERROR),
        )
        val car = s.car.copy(
            cabinLive = true, signalStatus = status,
            hvacC = hvac ?: s.car.hvacC, hvacReadable = hvac != null,
            doorReadable = c.doorOpen != null, doorOpen = c.doorOpen ?: s.car.doorOpen, doorLocked = c.doorLocked ?: s.car.doorLocked,
            seatReadable = vent != null && heat != null, seatVent = vent ?: s.car.seatVent, seatHeat = heat ?: s.car.seatHeat,
        )
        var n = s.copy(car = car)
        val appliedC = s.memory.climate?.takeIf { it.decision == ClimateDecisionKind.APPLIED }?.valueC
        val applied = s.cabinBatch.settled?.applied.orEmpty()
        fun src(same: Boolean) = if (same) ObservationSource.APP else ObservationSource.VEHICLE
        if (hvac != null) n = n.observe(CabinKey.HVAC_TEMP, hvac, src(appliedC != null && kotlin.math.abs(appliedC - hvac) <= Cabin.HVAC_TOLERANCE_C))
        if (vent != null && vent != s.car.seatVent) n = n.observe(CabinKey.SEAT_VENT, vent, src(false))
        if (heat != null && heat != s.car.seatHeat) n = n.observe(CabinKey.SEAT_HEAT, heat, src(false))
        // 시트는 일괄 적용 결과가 이미 car.seatVent/seatHeat 를 바꿔 두므로, 같은 값의 재조회는 위 조건에서 걸러진다(앱이 바꾼 값은 관찰하지 않음)
        return n
    }

    /**
     * 원탭 다음 이동 — 귀가 일정을 확인한 뒤(NEXT_LEG_READY) 주차한 채로만. 실행 직전 Safety Gate(REQUEST_ROUTE: 주차 · 확인 · NAVI_ROUTE_SEARCH).
     * 여기서는 상태만 LOOKING 으로 — 내비 즐겨찾기·현재 목적지를 읽고 requestRoute 를 부르는 것은 앱(어댑터)이 하고 결과를 Intent.Handoff 로 넣는다.
     */
    private fun startRouteHome(s: SessionState, mock: Boolean): SessionState {
        if (s.journey.phase != JourneyPhase.WAITING || !s.nextLegReady || s.plan.returnKm <= 0) return s
        val g = SafetyGate.check(ActionType.REQUEST_ROUTE, gateCtx(s, signalsOf(s, remaining(s))), true)
        if (!g.allowed) return s.say(g.block!!.message)
        val id = s.nextRequestId
        val next = RouteHandoff.reduce(s.handoff, HandoffEvent.Start(id, mock))
        if (next === s.handoff) return s
        return s.copy(handoff = next, nextRequestId = id + 1).log(ActivityKind.WAYPOINT, "집으로 안내 요청 #$id · 내비 즐겨찾기·현재 목적지 확인부터 (사용자 선택${if (mock) " · 모의 내비" else ""})")
    }

    /** 결과 — 완료(목적지를 다시 읽어 확인)·실패·교체 확인만 기록과 알림에 남긴다. 늦은 콜백은 리듀서가 거른다 */
    private fun handoffEvent(s: SessionState, e: HandoffEvent): SessionState {
        val next = RouteHandoff.reduce(s.handoff, e)
        if (next == s.handoff) return s
        var n = s.copy(handoff = next)
        if (next.phase != s.handoff.phase) {
            val msg = next.message
            when (next.phase) {
                HandoffPhase.VERIFIED -> n = n.log(ActivityKind.WAYPOINT, "내비 목적지 집으로 확인 · ${msg ?: ""} (목적지를 다시 읽어 확인)")
                HandoffPhase.FAILED, HandoffPhase.NO_HOME, HandoffPhase.UNKNOWN_OUTCOME, HandoffPhase.CONFIRM_REPLACE -> n = n.log(ActivityKind.WAYPOINT, "집으로 안내 · ${msg ?: next.phase.name}")
                else -> {}
            }
            if (msg != null) n = n.say(msg)
        }
        return n
    }

    private fun skipPrepare(s: SessionState, k: PrepareItemKey) = s.mem(MemoryEvent.SkipPrepare(k)).log(ActivityKind.PREPARE, "${k.label} 이번에는 건너뜀 (확인 완료 아님)")

    /**
     * 귀가 구간 준비(V5 NEXT_LEG) — 방문·대기 중(WAITING)에 주차한 채로만. Safety Gate 를 실행 직전에 다시 돌린다.
     * 하는 일은 "준비됨" 표시와 기록뿐이다 — 내비 목적지·경유지는 사용자 동의 없이 바꾸지 않는다(지시서 4절 8). 차가 출발하면 journey 가 귀가 구간으로 넘긴다
     */
    private fun readyNextLeg(s: SessionState): SessionState {
        if (s.journey.phase != JourneyPhase.WAITING || s.plan.returnKm <= 0) return s
        val g = SafetyGate.check(ActionType.PREPARE_NEXT_LEG, gateCtx(s, signalsOf(s, remaining(s))), true)
        if (!g.allowed) return s.say(g.block!!.message)
        return s.copy(nextLegReady = true).history { SuggestionPlanner.recordAccepted(it, SuggestionType.NEXT_LEG) }
            .log(ActivityKind.STATE, "귀가 일정 확인 · ${Trip.RETURN_DESTINATION} ${fmt(s.plan.returnKm)}km · 내비 목적지 미설정 (앱이 설정하지 않음)")
            .say("귀가 일정을 확인했어요 · 내비 경로는 아직 그대로예요 — '집으로 안내 시작'을 누르면 내비에 집 경로를 요청하고, 목적지를 다시 읽어 확인합니다")
    }

    /** 대기 유형 — 정차 중에만. 바꾸면 쉼표 DRIVE 재판단과 같은 규칙(마지막으로 알린 판단과 비교) */
    private fun setWaitMode(s: SessionState, m: WaitMode): SessionState {
        if (m == s.waitMode) return s
        if (Journey.isRestricted(signalsOf(s, remaining(s)))) return s.say("주행 중에는 바꿀 수 없습니다 · 정차한 뒤 바꿔 주세요")
        val base = if (s.notif.lastNotified != null) s.notif else NotificationPolicy.decide(s.notif, energyOf(s)).state
        val moved = s.copy(waitMode = m)
        val d = NotificationPolicy.decide(base, energyOf(moved))
        val msg = NotificationPolicy.message(d, s.vehicle.batteryPct)
        val note = NotificationPolicy.note(d, s.vehicle.batteryPct, s.waitMode.label, m.label, NotificationPolicy.cause(listOf(ChangedInput.WAIT_MODE)), s.clock)
        var n = moved.copy(notif = d.state, rejudge = note ?: s.rejudge, waitSource = WaitSource.USER).log(ActivityKind.ENERGY, "대기 유형 → ${m.label}${msg?.let { " · $it" } ?: ""}")
            .say(if (msg != null) "${m.label} · $msg" else "${m.label} · 에너지 판단은 그대로입니다")
        if (NotificationPolicy.shouldResurface(d)) n = n.resurfaceEnergy()
        return n
    }

    /**
     * 신호가 바뀌었으면 여정 단계를 넘긴다(웹의 렌더 중 "이전 값과 다르면"과 같은 일). 다음 구간이면 거리는 0 부터,
     * 하차 준비 제안을 다시 묻게. 주행이 시작됐으면 열린 확인은 무효. 마지막으로 보여 준 제안을 기억.
     */
    private fun settle(before: SessionState, s0: SessionState): SessionState {
        var s = s0
        val next = Journey.next(s.journey, signalsOf(s, remaining(s)))
        if (next != s.journey) {
            val legChanged = next.leg != s.journey.leg
            val note = "${PHASE_LABEL.getValue(s.journey.phase)} → ${PHASE_LABEL.getValue(next.phase)}${if (next.phase == JourneyPhase.PARKED) (if (next.atDestination) " · 목적지" else " · 중간 정차") else ""}${if (legChanged) " · 귀가 구간 시작" else ""}"
            s = s.copy(journey = next)
            if (next.phase != before.journey.phase || legChanged) s = s.log(ActivityKind.STATE, note)
            // 다음 구간 — 거리는 0 부터 · 하차 준비를 다시 묻게 · 귀가 준비 확인은 그 구간의 것이었다
            if (legChanged) s = s.copy(traveledKm = 0.0, nextLegReady = false).history { it + (SuggestionType.CHECKLIST_REMINDER to SuggestionRecord()) }
        }
        val v = view(s)
        if (v.restricted && (s.handoff.phase == HandoffPhase.CONFIRM_REPLACE || s.handoff.phase == HandoffPhase.NO_HOME)) {
            s = s.copy(handoff = RouteHandoff.reduce(s.handoff, HandoffEvent.Invalidate("주행이 시작돼 경로 교체 확인을 취소했습니다 · 기존 경로는 그대로입니다")))
        }
        if (v.restricted && s.action.phase == ActionPhase.CONFIRMING) {
            s = s.copy(action = Actions.reduce(s.action, ActionEvent.Invalidate("주행이 시작돼 공조 변경 확인을 취소했습니다. 정차한 뒤 다시 확인해 주세요.")))
        }
        if (s.memory.tripId > 0 && s.memory.lastShown != v.suggestions.top?.type) s = s.mem(MemoryEvent.Shown(v.suggestions.top?.type))
        return s
    }

    private fun choose(s: SessionState, m: ProfileMode): SessionState {
        val p = s.journey.phase
        // 이동 중인지를 먼저 본다 — 주행 제한보다 "왜 안 되나"가 분명한 이유다
        if (p != JourneyPhase.NOT_STARTED && p != JourneyPhase.PREPARING && p != JourneyPhase.COMPLETED) return s.say("이동 중에는 프로필을 바꿀 수 없습니다 · 여정을 끝낸 뒤 바꿔 주세요")
        val g = SafetyGate.check(ActionType.LOAD_PROFILE, gateCtx(s, signalsOf(s, remaining(s))), true)
        if (!g.allowed) return s.say(g.block!!.message)
        val plan = Profiles.planFor(s.profiles.getValue(m))
        // 대기 시간의 출처 — 프로필의 저장된 계획(SAVED). 프로필 없이(GUEST)는 대기 계획이 없다(NONE) — 추정하지 않는다
        var n = s.copy(mode = m, chosen = true, plan = plan, waitMode = Profiles.defaultWaitModeOf(m), waypoints = emptyList(), chargedAt = emptyList(), notif = NotificationState.INITIAL, rejudge = null, atLoss = null, action = ActionState.idle(ControlSource.MOCK), cabinBatch = CabinBatch(),
            waitSource = if (m == ProfileMode.GUEST) WaitSource.NONE else WaitSource.SAVED, nextLegReady = false, endedEarly = false, handoff = HandoffState())
        n = if (p == JourneyPhase.PREPARING) {
            val (vault, memory) = Memory.startTrip(n.vault, m)
            n.copy(vault = Memory.rememberMode(vault, m, n.driver), memory = memory, journey = s.journey.copy(leg = 0).withLegs(Trip.legsOf(plan)))
                .log(ActivityKind.PREPARE, "이동 #${memory.tripId} · ${s.profiles.getValue(m).name} 프로필로 바꿔 출발 준비", memory.tripId, m)
        } else n.copy(memory = Memory.newMemory(0, m))
        return n.say("${s.profiles.getValue(m).name} 프로필을 불러왔습니다")
    }

    /** 웹 changeProfile·editChecklist 와 같은 규칙 — 주행 중 막음(EDIT_CHECKLIST 게이트) · 프로필 없이는 고칠 것이 없다 */
    private fun editProfile(s: SessionState, p: UserProfile): SessionState {
        if (s.mode == ProfileMode.GUEST || p.mode != s.mode) return s
        val g = SafetyGate.check(ActionType.EDIT_CHECKLIST, gateCtx(s, signalsOf(s, remaining(s))), true)
        if (!g.allowed) return s.say(g.block!!.message)
        val n = s.copy(profiles = s.profiles + (p.mode to p))
        return if (s.traveledKm == 0.0) n.copy(plan = n.plan.copy(passengers = p.passengers, minReservePct = p.minReservePct)) else n
    }

    private fun startPrepare(s: SessionState): SessionState {
        if (!s.chosen) return s.say("먼저 프로필을 골라 주세요")
        val completed = s.journey.phase == JourneyPhase.COMPLETED
        val plan = if (completed) Profiles.planFor(s.profile) else s.plan
        var n = if (completed) s.copy(
            vault = Memory.setHistory(s.vault, s.mode, SuggestionPlanner.newTrip(s.history)), waypoints = emptyList(), chargedAt = emptyList(),
            notif = NotificationState.INITIAL, rejudge = null, atLoss = null, traveledKm = 0.0, waitedMin = 0, plan = plan, action = ActionState.idle(ControlSource.MOCK),
        ) else s
        val next = Journey.next(n.journey, signalsOf(n, remaining(n)), JourneyEvent.START_PREPARE)
        if (next.phase != JourneyPhase.PREPARING) return s
        val (vault, memory) = Memory.startTrip(n.vault, n.mode)
        n = n.copy(vault = Memory.rememberMode(vault, n.mode, n.driver), memory = memory, journey = next.withLegs(Trip.legsOf(plan)), cabinBatch = CabinBatch(),
            nextLegReady = false, endedEarly = false, missionStartedAt = n.clock, handoff = HandoffState())
        return n.log(ActivityKind.PREPARE, "이동 #${memory.tripId} · ${n.profile.name} 프로필로 출발 준비 시작${if (Trip.legsOf(plan) > 1) " · 왕복" else ""}", memory.tripId)
    }

    /** 고르면 바로 준비 — 탑승 전·이동 완료에서. 이미 준비 중이면 조합만 바꾼다(choose) */
    private fun chooseAndPrepare(s: SessionState, m: ProfileMode): SessionState {
        val p = s.journey.phase
        if (p != JourneyPhase.NOT_STARTED && p != JourneyPhase.COMPLETED) return choose(s, m)
        val chosen = choose(s, m)
        if (!chosen.chosen || chosen.mode != m) return chosen
        return startPrepare(chosen.copy(toast = null))
    }

    /** 승인 하나로 적용 후보를 전부 보낸다 — 보내기 직전 항목 종류마다 Safety Gate 를 다시 돌린다 */
    private fun applyCabin(s: SessionState): SessionState {
        val v = view(s)
        val keys = v.cabin.toApply
        if (keys.isEmpty() || s.cabinBatch.phase == CabinBatchPhase.PENDING) return s
        val ctx = gateCtx(s, v.signals)
        val needsHvac = keys.any { it == CabinKey.HVAC_TEMP || it == CabinKey.HVAC_POWER }
        val needsSeat = keys.any { it == CabinKey.SEAT_VENT || it == CabinKey.SEAT_HEAT }
        val blocked = listOfNotNull(
            if (needsHvac) SafetyGate.check(ActionType.SET_CLIMATE, ctx, true).takeIf { !it.allowed } else null,
            if (needsSeat) SafetyGate.check(ActionType.SET_SEAT, ctx, true).takeIf { !it.allowed } else null,
        ).firstOrNull()
        if (blocked != null) return s.copy(cabinBatch = CabinBatch(message = "실행 직전 재검사에서 막혔습니다 · ${blocked.block!!.message}"))
            .log(ActivityKind.PREPARE, "실내 일괄 적용 차단(실행 직전 재검사) — ${blocked.block.message}")
        val id = s.nextRequestId
        val p = prefsOf(s)
        val targets: Map<CabinKey, Any> = keys.mapNotNull { k ->
            when (k) { CabinKey.HVAC_TEMP -> p.hvacTempC; CabinKey.HVAC_POWER -> p.hvacOn; CabinKey.SEAT_VENT -> p.seatVent; CabinKey.SEAT_HEAT -> p.seatHeat; else -> null }?.let { k to it }
        }.toMap()
        return s.copy(cabinBatch = CabinBatch(CabinBatchPhase.PENDING, id, keys, targets = targets), nextRequestId = id + 1)
            .log(ActivityKind.PREPARE, "실내 일괄 적용 요청 #$id · ${keys.joinToString("·") { it.label }} (${if (s.car.cabinLive) "차량" else "모의"})")
    }

    /** 항목마다 독립 — 성공한 것만 차량 값에 반영하고 '적용 확인'. 지난 요청의 결과는 무시 */
    private fun cabinResults(s: SessionState, requestId: Int, outcomes: Map<CabinKey, CabinOutcome>, source: ControlSource): SessionState {
        val b = s.cabinBatch
        if (b.phase != CabinBatchPhase.PENDING || b.requestId != requestId) return s
        val settled = Cabin.settle(b.keys, outcomes, source)
        val p = prefsOf(s)
        var n = s
        val target = p.hvacTempC
        if (CabinKey.HVAC_TEMP in settled.applied && target != null) {
            n = n.copy(car = n.car.copy(hvacC = target)).mem(MemoryEvent.Climate(ClimateDecisionKind.APPLIED, target))
                .history { SuggestionPlanner.recordAccepted(it, SuggestionType.PROFILE_PREPARATION) }
        }
        if (CabinKey.HVAC_POWER in settled.applied && p.hvacOn != null) n = n.copy(vehicle = n.vehicle.copy(hvacOn = p.hvacOn))
        if (CabinKey.SEAT_VENT in settled.applied && p.seatVent != null) n = n.copy(car = n.car.copy(seatVent = p.seatVent))
        if (CabinKey.SEAT_HEAT in settled.applied && p.seatHeat != null) n = n.copy(car = n.car.copy(seatHeat = p.seatHeat))
        return n.copy(cabinBatch = b.copy(phase = CabinBatchPhase.DONE, settled = settled))
            .log(ActivityKind.PREPARE, "실내 일괄 적용 결과 #$requestId · ${settled.summary} · ${settled.results.joinToString(" / ") { it.line }}")
            .say(settled.summary)
    }

    private fun confirmClimate(s: SessionState): SessionState {
        val target = prefsOf(s).hvacTempC ?: return s // 합친 취향 — 일괄 적용과 같은 목표
        val g = SafetyGate.check(ActionType.SET_CLIMATE, gateCtx(s, signalsOf(s, remaining(s))), true)
        if (!g.allowed) {
            return s.copy(action = Actions.reduce(s.action, ActionEvent.Invalidate("확인하는 사이 상태가 바뀌어 실행하지 않았습니다 · ${g.block!!.message}")))
                .log(ActivityKind.PREPARE, "공조 변경 차단(실행 직전 재검사) — ${g.block.message}")
        }
        val id = s.nextRequestId
        return s.copy(action = Actions.reduce(s.action, ActionEvent.Send(id, target)), nextRequestId = id + 1)
    }

    /** 학습 후보 저장 — 주인(운전자 / 탑승 조합)에게. 공조 온도는 프로필 targetC(엔진이 보는 값) */
    private fun acceptLearning(s: SessionState, key: CabinKey): SessionState {
        val ctx = LearnCtx(s.driver, s.mode)
        val c = Learning.candidates(s.vault.learning, ctx, prefsOf(s), contextLabel(s)).firstOrNull { it.key == key } ?: return s
        // 저장 자리는 귀속 키와 같은 곳(Learning.store) — 운전자 prefs / 혼자 조합은 운전자별 soloCabin / 가족·부부는 프로필
        val d = s.driver
        val st = Learning.store(c, ctx, s.profile, s.driverOrNull, soloOf(s))
        var n = s.copy(profiles = s.profiles + (s.mode to st.profile))
        if (st.driver != null && d != null) n = n.copy(vault = n.vault.copy(drivers = n.vault.drivers + (d to st.driver)))
        if (st.solo != null && d != null) n = n.copy(vault = n.vault.copy(soloCabin = n.vault.soloCabin + (Situation.soloKey(d, s.mode) to st.solo)))
        return n.copy(vault = n.vault.copy(learning = Learning.accept(n.vault.learning, ctx, key)))
            .log(ActivityKind.PREPARE, "취향 저장 · ${c.line.substringBefore(" — ")} (${if (c.owner == PrefOwner.DRIVER) s.driverOrNull?.name ?: "운전자" else s.profile.name})")
            .say("취향으로 저장했습니다 · 다음 이동부터 비교에 씁니다")
    }

    private fun keepClimate(s: SessionState) = s.history { SuggestionPlanner.recordKept(it, SuggestionType.PROFILE_PREPARATION, s.simMin * 60_000L) }
        .mem(MemoryEvent.Climate(ClimateDecisionKind.KEPT, s.car.hvacC)).log(ActivityKind.PREPARE, "공조 ${fmt(s.car.hvacC)}°C 유지 — 이번 이동에서는 다시 묻지 않음")

    private fun complete(s: SessionState): SessionState {
        val v = view(s)
        val g = SafetyGate.check(ActionType.CONFIRM_FINISH, gateCtx(s, v.signals), true)
        // 하차 준비 중일 때만 — 그 밖에서 받으면 FINISH_DONE 이 단계를 바꾸지 않아 "중간 정차"로 잘못 읽힌다
        if (s.journey.phase != JourneyPhase.FINISHING || !g.allowed) return s
        val after = Journey.next(s.journey, v.signals, JourneyEvent.FINISH_DONE)
        val n = v.checked.count { it in s.profile.finishChecklist }
        // 확인하지 않은 항목은 이름까지 '확인 안 함'으로 남긴다 — 다 확인한 것처럼 기록하지 않는다
        val left = s.profile.finishChecklist.filter { it !in v.checked }.takeIf { it.isNotEmpty() }?.let { " · 확인 안 함: ${it.joinToString(", ")}" } ?: ""
        val mid = after.phase == JourneyPhase.WAITING
        // 휴게소에서 확인한 것을 목적지 하차에 그대로 쓰지 않는다 — 이 구간의 확인을 비운다
        if (after.phase == JourneyPhase.PARKED) return s.copy(journey = after).mem(MemoryEvent.FinishChecked(s.journey.leg, emptyList()))
            .log(ActivityKind.FINISH, "중간 정차 하차 확인 완료 · 사용자 확인 $n/${s.profile.finishChecklist.size}$left (센서 판정 아님) · ${s.legDestination}까지 이어서")
            .say("하차 확인 완료 · ${s.legDestination}까지 이어서 갑니다")
        return s.copy(journey = after)
            .log(ActivityKind.FINISH, "${if (mid) "중간 하차" else "최종 하차"} 확인 완료 · 사용자 확인 $n/${s.profile.finishChecklist.size}$left (센서 판정 아님)${if (mid) " · 귀가 남음" else " · 이동 #${s.memory.tripId} 완료 · ${tripSummary(s)}"}")
            .say(if (mid) "하차 확인 완료 · 귀가 ${fmt(s.plan.returnKm)}km 가 남아 있습니다" else "이동을 마쳤습니다")
    }

    /**
     * 연결 끊김/복구 — 연결별. 배터리 연결의 복구만 재판단이다(에너지의 필수 입력). 끊길 때 기준 판단과 입력을 찍어 두고,
     * 복구되면 그 기준과 비교해 바뀐 것을 알리고 원인을 적는다 — 여럿이 함께 바뀌었으면 하나로 말하지 않는다.
     * 주행 신호·공조 연결의 복구는 재판단이 아니다. 아직 끊긴 연결이 있으면 그렇다고 말한다.
     */
    private fun setLinks(s: SessionState, kinds: List<LinkKind>, live: Boolean): SessionState {
        val changing = kinds.filter { s.car.live(it) != live }
        if (changing.isEmpty()) return s
        val links = s.car.links + changing.associateWith { if (live) LinkState() else LinkState(false, s.clock) }
        val names = changing.joinToString(" · ") { it.label }
        if (!live) {
            var n = s.copy(car = s.car.copy(links = links))
            if (LinkKind.ENERGY in changing) {
                val notif = if (s.notif.lastNotified != null) s.notif else NotificationPolicy.decide(s.notif, energyOf(s)).state
                n = n.copy(notif = notif, atLoss = inputsOf(s))
            }
            return n.log(ActivityKind.STATE, "차량 데이터 연결 끊김 — $names · 끊긴 동안 그 값으로 판단하지 않음")
        }
        val restored = s.copy(car = s.car.copy(links = links))
        if (LinkKind.ENERGY !in changing) return restored.log(ActivityKind.STATE, "차량 데이터 연결 복구 — $names").say("$names 연결이 돌아왔습니다")
        val d = NotificationPolicy.decide(restored.notif, energyOf(restored))
        val msg = NotificationPolicy.message(d, restored.vehicle.batteryPct)
        val cause = NotificationPolicy.cause(s.atLoss?.let { NotificationPolicy.changedInputs(it, inputsOf(restored)) } ?: emptyList())
        val stillLost = LinkKind.entries.filter { !links.getValue(it).live }
        val partial = if (stillLost.isEmpty()) "" else " · 아직 끊김: ${stillLost.joinToString(" · ") { it.label }}"
        val head = if (changing.size == LinkKind.entries.size) "연결이 돌아왔습니다" else "$names 연결이 돌아왔습니다"
        var n = restored.copy(notif = d.state, atLoss = null, rejudge = NotificationPolicy.note(d, restored.vehicle.batteryPct, "끊기기 전", "복구 뒤", cause, restored.clock) ?: restored.rejudge)
            .log(ActivityKind.STATE, "차량 데이터 연결 복구 — $names (${s.car.lostAt(LinkKind.ENERGY) ?: "?"} 부터 끊김)${msg?.let { " · $it · ${cause.text}" } ?: ""}$partial")
            .say(if (msg != null) "$head · $msg$partial" else "$head · 지금 값으로 다시 판단했습니다$partial")
        if (NotificationPolicy.shouldResurface(d)) n = n.resurfaceEnergy()
        return n
    }
}
