package app.commadrive.core.assistant

import kotlin.math.abs

/**
 * Safety & Permission Gate — 제안과 실제 차량 동작 사이에 **반드시** 끼는 검사. `src/lib/assistant/gate.ts` 의 거울.
 *
 * 원칙은 하나다: **모르면 막는다(fail closed).** 주행 제한을 모르면 주행 중으로, 차량 지원을 모르면 미지원으로,
 * 권한을 모르면 거부로 본다. 차량 제어에서 "정보가 없으니 일단 허용"은 사고의 출발점이다.
 *
 * 권한 이름은 실물 SDK 의 @RequiresPermission 에서 읽은 것이다 (Vehicle 2.3.2 · NaviHelper 3.0.5, javap, 2026-10-26).
 * 조회와 제어 권한이 **따로** 있다 — CAR_CLIMATE(읽기) / CONTROL_CAR_CLIMATE(쓰기). 서드파티 앱에 CONTROL_* 이
 * 실제로 허용되는지는 미확인이다 (docs/10-briefing.md).
 */
/** PREPARE_NEXT_LEG: 귀가 구간 준비(V5 Mission) — 사용자 확인으로 "준비됨" 표시만. 내비 목적지는 앱이 바꾸지 않는다(정책 1) */
enum class ActionType { LOAD_PROFILE, SET_CLIMATE, SET_SEAT, SET_LIGHT, CHECK_ENERGY, SUGGEST_CHARGE_STOP, ADD_WAYPOINT, EDIT_CHECKLIST, CONFIRM_FINISH, PREPARE_NEXT_LEG,
    /** 원탭 다음 이동(V5, 2026-11-03) — 내비에 저장된 집으로 경로 요청. 기존 경로가 있으면 교체 확인을 한 번 더 (RouteHandoff.kt) */
    REQUEST_ROUTE }

/** 실제 권한 문자열은 `pleos.car.permission.` + 이름 */
enum class Permission { CAR_CLIMATE, CONTROL_CAR_CLIMATE, CONTROL_CAR_SEATS, CONTROL_CAR_LIGHTS, CAR_ENERGY, NAVI_ROUTE_SEARCH }

/** 차종마다 다르다 — Vehicle SDK 의 checkXXXCapabilities 결과 */
enum class Capability { HVAC_TEMPERATURE, SEAT_POSITION, LIGHT_CABIN, EV_BATTERY, NAVI_WAYPOINT }

/**
 * 주행 중 — ALLOW 그대로 · DEFER 정차 후로 미룸 · BLOCK 막음.
 * 공조·좌석·조명은 주행 중 BLOCK 이다. 차가 허용하더라도 우리 앱이 운전 중에 차 설정을 바꾸자고 하지 않는다.
 */
enum class WhileDriving { ALLOW, DEFER, BLOCK }

data class ActionPolicy(
    val confirmation: Boolean,
    val whileDriving: WhileDriving,
    val requiresParked: Boolean,
    val capability: Capability?,
    val permission: Permission?,
)

/** null = 모른다. 모르면 없는 것으로 친다 */
data class GateContext(
    val uxRestricted: Boolean?,
    val motion: Motion,
    val capabilities: Map<Capability, Boolean?>,
    val permissions: Map<Permission, Boolean?>,
    /** 이미 실행 중인 액션 — 같은 것을 두 번 보내지 않는다 */
    val inFlight: Set<ActionType>,
)

enum class GateBlock(val message: String) {
    DRIVING_BLOCKED("주행 중에는 할 수 없습니다."),
    DRIVING_DEFERRED("정차하면 다시 알려 드릴게요."),
    UNSUPPORTED("이 차량에서는 앱에서 지원하지 않는 기능입니다."),
    NO_PERMISSION("이 기능을 쓸 권한이 없습니다."),
    NEEDS_PARKED("주차한 뒤에 할 수 있습니다."),
    NEEDS_CONFIRMATION("확인이 필요합니다."),
    DUPLICATE("이미 요청 중입니다."),
}

/** block == null 이면 허용 */
data class GateResult(val block: GateBlock?) {
    val allowed get() = block == null
}

/**
 * 차량 제어 결과 — **요청이 받아들여진 것과 차에 실제로 반영된 것을 나눈다.**
 * source 를 늘 달고 다닌다 — Mock 성공을 실제 차량 성공처럼 보여 주지 않는다 (CLAUDE.md 정책 4).
 */
enum class ControlStatus { IDLE, CONFIRMING, PENDING, SUCCESS, FAILED, UNSUPPORTED, TIMEOUT }
enum class ControlSource { MOCK, VEHICLE }

sealed interface ControlOutcome {
    data class Callback(val value: Double) : ControlOutcome
    data class Error(val reason: String) : ControlOutcome
    data object Timeout : ControlOutcome
}

data class ControlResult(val status: ControlStatus, val source: ControlSource, val applied: Double?, val message: String)

object SafetyGate {
    val POLICY: Map<ActionType, ActionPolicy> = mapOf(
        ActionType.LOAD_PROFILE to ActionPolicy(true, WhileDriving.DEFER, false, null, null),
        ActionType.SET_CLIMATE to ActionPolicy(true, WhileDriving.BLOCK, false, Capability.HVAC_TEMPERATURE, Permission.CONTROL_CAR_CLIMATE),
        ActionType.SET_SEAT to ActionPolicy(true, WhileDriving.BLOCK, true, Capability.SEAT_POSITION, Permission.CONTROL_CAR_SEATS),
        ActionType.SET_LIGHT to ActionPolicy(true, WhileDriving.BLOCK, true, Capability.LIGHT_CABIN, Permission.CONTROL_CAR_LIGHTS),
        ActionType.CHECK_ENERGY to ActionPolicy(false, WhileDriving.ALLOW, false, null, null),
        // 주행 중 "EV 충전소 찾기 + 경유지 설정" 은 Mobility Services 허용 예시에 명시돼 있다 (research 5절). 실제 범위는 DO 선언에 따른다.
        ActionType.SUGGEST_CHARGE_STOP to ActionPolicy(false, WhileDriving.ALLOW, false, null, null),
        ActionType.ADD_WAYPOINT to ActionPolicy(true, WhileDriving.ALLOW, false, Capability.NAVI_WAYPOINT, Permission.NAVI_ROUTE_SEARCH),
        ActionType.EDIT_CHECKLIST to ActionPolicy(false, WhileDriving.BLOCK, false, null, null),
        ActionType.CONFIRM_FINISH to ActionPolicy(true, WhileDriving.BLOCK, true, null, null),
        // 주차한 채 방문·대기 중에만 — 차량에는 아무것도 보내지 않으므로 지원·권한 검사는 없다
        ActionType.PREPARE_NEXT_LEG to ActionPolicy(true, WhileDriving.BLOCK, true, null, null),
        // 주차한 채 — 경로를 바꾸는 요청이라 주행 중에는 막는다. 권한은 실물 SDK @RequiresPermission 그대로
        ActionType.REQUEST_ROUTE to ActionPolicy(true, WhileDriving.BLOCK, true, null, Permission.NAVI_ROUTE_SEARCH),
    )

    /**
     * 검사 순서는 스펙 9.2 를 따른다: 주행 제한 → 차량 지원 → 권한 → 차량 상태 → 사용자 확인 → 중복.
     * (앱 카테고리·국가별 제한은 플랫폼이 DO 선언으로 거른다 — 앱이 따로 알 수 있는 값이 없다.)
     *
     * **확인 버튼을 누른 뒤 실행 직전에 한 번 더 부른다.** 확인하는 사이 차가 출발했으면 그때 막혀야 한다.
     */
    fun check(type: ActionType, ctx: GateContext, confirmed: Boolean): GateResult {
        val p = POLICY.getValue(type)
        // CarUxRestrictions 가 풀어 줘도 바퀴가 굴러가는 중(또는 모름)이면 주행으로 본다 — 둘 중 보수적인 쪽
        val restricted = (ctx.uxRestricted ?: (ctx.motion.kind != MotionKind.PARKED)) ||
            ctx.motion.kind == MotionKind.MOVING || ctx.motion.kind == MotionKind.UNKNOWN
        val block = when {
            restricted && p.whileDriving == WhileDriving.BLOCK -> GateBlock.DRIVING_BLOCKED
            restricted && p.whileDriving == WhileDriving.DEFER -> GateBlock.DRIVING_DEFERRED
            p.capability != null && ctx.capabilities[p.capability] != true -> GateBlock.UNSUPPORTED
            p.permission != null && ctx.permissions[p.permission] != true -> GateBlock.NO_PERMISSION
            p.requiresParked && ctx.motion.kind != MotionKind.PARKED -> GateBlock.NEEDS_PARKED
            p.confirmation && !confirmed -> GateBlock.NEEDS_CONFIRMATION
            type in ctx.inFlight -> GateBlock.DUPLICATE
            else -> null
        }
        return GateResult(block)
    }

    /** 이 액션을 주행 중 화면에 꺼내도 되나 — 제안 엔진이 후보를 거를 때 쓴다 */
    fun allowedWhileDriving(type: ActionType) = POLICY.getValue(type).whileDriving == WhileDriving.ALLOW

    /** 공조 설정 온도는 0.5°C 단위로 움직인다 — 그보다 작은 차이는 같은 값으로 본다 */
    const val CONTROL_TOLERANCE = 0.25

    /** SDK set 콜백이 돌려준 값, 가능하면 다시 읽은 값까지 목표와 맞아야 SUCCESS 다 */
    fun settle(target: Double, outcome: ControlOutcome, readback: Double?, source: ControlSource): ControlResult = when (outcome) {
        ControlOutcome.Timeout -> ControlResult(ControlStatus.TIMEOUT, source, readback, "차량 응답이 없어 적용하지 않았습니다. 다시 시도할 수 있습니다.")
        is ControlOutcome.Error -> ControlResult(ControlStatus.FAILED, source, readback, "적용하지 못했습니다: ${outcome.reason}")
        is ControlOutcome.Callback -> {
            val actual = readback ?: outcome.value
            if (abs(actual - target) > CONTROL_TOLERANCE) {
                ControlResult(ControlStatus.FAILED, source, actual, "요청한 값과 차량 값이 다릅니다 (요청 ${fmt(target)} · 현재 ${fmt(actual)}).")
            } else {
                ControlResult(ControlStatus.SUCCESS, source, actual, if (source == ControlSource.MOCK) "시연 값으로 ${fmt(target)} 적용" else "${fmt(target)} 적용됨")
            }
        }
    }
}

/** TS 의 숫자 출력과 맞춘다 — 23.0 이 아니라 23. 화면 문장이 양쪽에서 같아야 한다 */
internal fun fmt(x: Double) = if (x == Math.floor(x)) x.toLong().toString() else x.toString()
