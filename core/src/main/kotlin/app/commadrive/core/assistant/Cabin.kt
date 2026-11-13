package app.commadrive.core.assistant

/**
 * Personal Cabin Memory · Smart Cabin Prepare — `src/lib/assistant/cabin.ts` 의 거울 (오너 지시 2026-10-28).
 * 운전자별 프로필·원격 공조·시트 기억은 현대차가 이미 제공한다 — 여기서는 **탑승 조합**(혼자·가족·동승자) 하나로 실내 환경 + 안내 방식 + 여정을 함께 준비한다.
 * 저장 취향 없음(null)은 유지 · 같으면 안 건드림 · 지원·권한·신선도는 항목마다 · 제어 가능한 것만 승인 하나로 · 적용 뒤 재조회해 항목마다 독립 기록 · 음악은 기억만.
 */
enum class CabinKey(val label: String) {
    HVAC_TEMP("공조 온도"), HVAC_POWER("공조"), SEAT_VENT("통풍시트"), SEAT_HEAT("열선시트"), STEERING_HEAT("핸들 열선"), LIGHTING("실내 조명"), MUSIC("음악")
}
enum class Lighting(val label: String) { CALM("차분한 조명"), BRIGHT("밝은 조명") }
enum class Guidance(val label: String) { QUIET("최소 안내"), NORMAL("일반 안내") }

/** 탑승 조합별 저장 취향 — null = 차량 현재 설정 유지. 공조 온도는 UserProfile.targetC 에서 합친다(Profiles.cabinPrefsOf) */
data class CabinPrefs(
    val hvacTempC: Double? = null,
    val hvacOn: Boolean? = null,
    val seatVent: Boolean? = null,
    val seatHeat: Boolean? = null,
    val steeringHeat: Boolean? = null,
    val lighting: Lighting? = null,
    /** 음악 취향 — 기억만. 자동 재생은 연동 미확인 */
    val music: String? = null,
    val guidance: Guidance = Guidance.NORMAL,
) { companion object { val NONE = CabinPrefs() } }

/** 차량이 알려 준 지금 상태 — null = 읽지 못함 */
data class CabinNow(
    val hvacTempC: Double? = null,
    val hvacOn: Boolean? = null,
    val seatVent: Boolean? = null,
    val seatHeat: Boolean? = null,
    val steeringHeat: Boolean? = null,
    val lighting: Lighting? = null,
) { companion object { val UNKNOWN = CabinNow() } }

/** 항목별 차량 지원 · 제어 권한. null = 모름 → 제어하지 않는다 */
data class CabinSupportItem(val supported: Boolean?, val controllable: Boolean?)
typealias CabinSupport = Map<CabinKey, CabinSupportItem>

enum class CabinDecision { NO_PREF, SAME, APPLY, UNSUPPORTED, NO_PERMISSION, UNKNOWN_STATE, RESTRICTED, REMEMBER_ONLY }
data class CabinItem(val key: CabinKey, val decision: CabinDecision, val target: String?, val current: String?, val line: String)
data class CabinPlan(val items: List<CabinItem>, val toApply: List<CabinKey>, val manual: List<CabinKey>, val nothingToDo: Boolean, val summary: String)

sealed interface CabinOutcome {
    data class Callback(val matched: Boolean) : CabinOutcome
    data class Error(val reason: String) : CabinOutcome
    data object Timeout : CabinOutcome
}
enum class CabinResultStatus(val label: String) { APPLIED("적용 확인"), REJECTED("거절"), MISMATCH("값 불일치"), UNVERIFIED("확인 못 함") }
data class CabinResult(val key: CabinKey, val status: CabinResultStatus, val line: String)
data class CabinSettled(val results: List<CabinResult>, val applied: List<CabinKey>, val summary: String, val allApplied: Boolean)

/** 스마트폰 사전 준비 경계 — 공식 경로 확인 전에는 늘 NOT_AVAILABLE. 비공개 API 를 우회하지 않는다 */
/**
 * 실내 제어의 경계 — **승인 하나** 뒤에만 부른다(ApplyCabin · ConfirmClimate). 결과는 항목마다 따로, 콜백이 오기 전에는 '적용 완료'라 하지 않는다.
 * 구현은 copilot-adapters 의 PleosCabinControl(운전석 영역). 에뮬레이터에서 처음 연결 2026-10-29 — CONTROL_CAR_CLIMATE·CONTROL_CAR_SEATS 가
 * protectionLevel normal 로 설치 시 허용되는 것을 확인한 뒤. 실차 허용·실동작은 미확인.
 * 콜백 인자는 차량이 **적용했다고 돌려준 값**(요청값이 아니다) — 요청과 다르면 값 불일치로 적는다.
 */
interface CabinControl {
    fun setHvacTempC(c: Double, onApplied: (Double) -> Unit, onError: (String) -> Unit)
    fun setSeatVent(on: Boolean, onApplied: (Int) -> Unit, onError: (String) -> Unit)
    fun setSeatHeat(on: Boolean, onApplied: (Int) -> Unit, onError: (String) -> Unit)
}

interface RemotePrepareGateway { fun availability(): RemoteAvailability }
enum class RemoteAvailability { NOT_AVAILABLE, AVAILABLE }
object NoRemotePrepare : RemotePrepareGateway { override fun availability() = RemoteAvailability.NOT_AVAILABLE }

/**
 * 기능 상태 — 실제 SDK 지원 여부로 나눈다(cabin.ts SdkStatus). AVAILABLE(실차 확인)은 아직 0건.
 * EMULATOR_VERIFIED 는 Pleos Connect Emulator 에서 조회·제어·재조회를 **실제로 본** 항목에만(2026-10-29, EMULATOR-RESULT §6) — 실차와 같다고 말하지 않는다.
 */
enum class SdkStatus(val label: String) { AVAILABLE("사용 가능"), EMULATOR_VERIFIED("에뮬레이터 확인"), NEEDS_VERIFICATION("개발 검증 필요"), REMEMBER_ONLY("선호 기억"), UNSUPPORTED("미지원") }

object Cabin {
    val SDK_STATUS: Map<CabinKey, SdkStatus> = mapOf(
        CabinKey.HVAC_TEMP to SdkStatus.EMULATOR_VERIFIED, CabinKey.HVAC_POWER to SdkStatus.NEEDS_VERIFICATION, CabinKey.SEAT_VENT to SdkStatus.EMULATOR_VERIFIED,
        CabinKey.SEAT_HEAT to SdkStatus.EMULATOR_VERIFIED, CabinKey.STEERING_HEAT to SdkStatus.UNSUPPORTED, CabinKey.LIGHTING to SdkStatus.NEEDS_VERIFICATION, CabinKey.MUSIC to SdkStatus.REMEMBER_ONLY,
    )
    const val HVAC_TOLERANCE_C = 0.5
    /** 은/는 — 마지막 글자 받침으로(Prepare.kt 와 같은 규칙) */
    private fun eunNeun(w: String): String { val c = w.last().code - 0xac00; return if (c in 0 until 11172 && c % 28 != 0) "은" else "는" }

    private fun fmt(k: CabinKey, v: Any?): String? = when {
        v == null -> null
        k == CabinKey.HVAC_TEMP -> "${Math.round(v as Double)}°C"
        k == CabinKey.LIGHTING -> (v as Lighting).label
        k == CabinKey.MUSIC -> v as String
        else -> if (v as Boolean) "켬" else "끔"
    }
    private fun prefOf(p: CabinPrefs, k: CabinKey): Any? = when (k) {
        CabinKey.HVAC_TEMP -> p.hvacTempC; CabinKey.HVAC_POWER -> p.hvacOn; CabinKey.SEAT_VENT -> p.seatVent; CabinKey.SEAT_HEAT -> p.seatHeat
        CabinKey.STEERING_HEAT -> p.steeringHeat; CabinKey.LIGHTING -> p.lighting; CabinKey.MUSIC -> p.music
    }
    private fun nowOf(n: CabinNow, k: CabinKey): Any? = when (k) {
        CabinKey.HVAC_TEMP -> n.hvacTempC; CabinKey.HVAC_POWER -> n.hvacOn; CabinKey.SEAT_VENT -> n.seatVent; CabinKey.SEAT_HEAT -> n.seatHeat
        CabinKey.STEERING_HEAT -> n.steeringHeat; CabinKey.LIGHTING -> n.lighting; CabinKey.MUSIC -> null
    }
    private fun same(k: CabinKey, a: Any, b: Any) = if (k == CabinKey.HVAC_TEMP) kotlin.math.abs((a as Double) - (b as Double)) <= HVAC_TOLERANCE_C else a == b

    private fun decide(k: CabinKey, prefs: CabinPrefs, now: CabinNow, support: CabinSupport, driving: Boolean): CabinItem {
        val label = k.label
        val pref = prefOf(prefs, k) ?: return CabinItem(k, CabinDecision.NO_PREF, null, fmt(k, nowOf(now, k)), "$label · 저장한 취향 없음 · 지금 설정 유지")
        val target = fmt(k, pref)
        if (k == CabinKey.MUSIC) return CabinItem(k, CabinDecision.REMEMBER_ONLY, target, null, "$label · $target 기억 · 자동 재생은 연동 확인 전 · 듣던 음악 그대로")
        val sup = support[k] ?: CabinSupportItem(null, null)
        if (sup.supported == false) return CabinItem(k, CabinDecision.UNSUPPORTED, target, null, "$label · 이 차량은 지원하지 않음")
        val cur = nowOf(now, k) ?: return CabinItem(k, CabinDecision.UNKNOWN_STATE, target, null, "$label · 지금 값을 읽지 못함 · 차량에서 직접 확인")
        val current = fmt(k, cur)
        if (same(k, pref, cur)) return CabinItem(k, CabinDecision.SAME, target, current, "$label $current · 이미 맞음")
        if (sup.supported != true || sup.controllable != true) {
            return CabinItem(k, CabinDecision.NO_PERMISSION, target, current, "$label $current → $target · ${if (sup.supported != true) "지원 확인 전" else "제어 권한 없음"} · 차량에서 직접")
        }
        if (driving) return CabinItem(k, CabinDecision.RESTRICTED, target, current, "$label $current → $target · 정차하면 제안")
        return CabinItem(k, CabinDecision.APPLY, target, current, "$label $current → $target")
    }

    fun plan(prefs: CabinPrefs, now: CabinNow, support: CabinSupport, driving: Boolean, modeName: String): CabinPlan {
        val items = CabinKey.entries.map { decide(it, prefs, now, support, driving) }
        val toApply = items.filter { it.decision == CabinDecision.APPLY }.map { it.key }
        val manual = items.filter { it.decision == CabinDecision.UNSUPPORTED || it.decision == CabinDecision.NO_PERMISSION || it.decision == CabinDecision.UNKNOWN_STATE }.map { it.key }
        val restricted = items.count { it.decision == CabinDecision.RESTRICTED }
        val withPref = items.count { it.decision != CabinDecision.NO_PREF }
        val nothingToDo = toApply.isEmpty() && manual.isEmpty() && restricted == 0
        val manualNames = manual.joinToString("·") { it.label }
        val tail = if (manual.isEmpty()) "" else " · $manualNames${eunNeun(manualNames)} 차량에서 직접"
        val summary = when {
            withPref == 0 -> "$modeName 이동 · 저장한 취향이 없어 지금 설정 그대로 갑니다"
            nothingToDo -> "$modeName 이동 준비를 확인했어요 · 저장한 취향과 모두 맞습니다"
            toApply.isNotEmpty() -> "저장된 취향과 비교해 변경할 설정이 ${toApply.size}개 있습니다$tail"
            restricted > 0 -> "정차하면 ${restricted}개를 맞추자고 제안합니다$tail"
            else -> "앱에서 바꿀 수 있는 설정은 없습니다$tail"
        }
        return CabinPlan(items, toApply, manual, nothingToDo, summary)
    }

    /** 콜백·재조회 결과로 항목마다 상태를 정한다. 결과가 없는 항목은 확인 못 함 — 적용 완료가 아니다 */
    fun settle(toApply: List<CabinKey>, outcomes: Map<CabinKey, CabinOutcome>, source: ControlSource): CabinSettled {
        val results = toApply.map { k ->
            when (val o = outcomes[k]) {
                null, CabinOutcome.Timeout -> CabinResult(k, CabinResultStatus.UNVERIFIED, "${k.label} · 응답 없음 · 값을 다시 읽기 전에는 다시 보내지 않음")
                is CabinOutcome.Error -> CabinResult(k, CabinResultStatus.REJECTED, "${k.label} · 차량이 거절: ${o.reason}")
                is CabinOutcome.Callback -> if (!o.matched) CabinResult(k, CabinResultStatus.MISMATCH, "${k.label} · 요청한 값과 차량 값이 다름")
                    else CabinResult(k, CabinResultStatus.APPLIED, "${k.label} · ${if (source == ControlSource.MOCK) "시연 값으로 적용" else "적용됨"}")
            }
        }
        val applied = results.filter { it.status == CabinResultStatus.APPLIED }.map { it.key }
        fun n(s: CabinResultStatus) = results.count { it.status == s }
        val parts = mutableListOf("${toApply.size}개 중 ${applied.size}개 적용${if (source == ControlSource.MOCK) "(모의)" else ""}")
        if (n(CabinResultStatus.REJECTED) > 0) parts += "${n(CabinResultStatus.REJECTED)}개 거절"
        if (n(CabinResultStatus.MISMATCH) > 0) parts += "${n(CabinResultStatus.MISMATCH)}개 값 불일치"
        if (n(CabinResultStatus.UNVERIFIED) > 0) parts += "${n(CabinResultStatus.UNVERIFIED)}개 확인 못 함"
        return CabinSettled(results, applied, parts.joinToString(" · "), applied.size == toApply.size)
    }

    /** 이번 이동에서 공조를 이미 결정(적용·유지)했으면 공조 항목은 다시 묻지 않는다 */
    fun withMemory(plan: CabinPlan, m: JourneyMemory): CabinPlan {
        val c = m.climate ?: return plan
        val items = plan.items.map {
            if (it.key == CabinKey.HVAC_TEMP && it.decision == CabinDecision.APPLY) it.copy(
                decision = CabinDecision.SAME,
                line = if (c.decision == ClimateDecisionKind.APPLIED) "공조 온도 ${Math.round(c.valueC)}°C · 이번 이동에서 맞춤" else "공조 온도 ${Math.round(c.valueC)}°C · 이번 이동에서는 그대로 두기로 함",
            ) else it
        }
        val toApply = plan.toApply.filter { it != CabinKey.HVAC_TEMP }
        val summary = when {
            toApply.size == plan.toApply.size -> plan.summary
            toApply.isEmpty() && plan.manual.isEmpty() -> "저장한 취향과 모두 맞습니다"
            else -> "저장된 취향과 비교해 변경할 설정이 ${toApply.size}개 있습니다"
        }
        return plan.copy(items = items, toApply = toApply, nothingToDo = toApply.isEmpty() && plan.manual.isEmpty() && items.none { it.decision == CabinDecision.RESTRICTED }, summary = summary)
    }
}
