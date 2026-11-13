package app.commadrive.core.assistant

import app.commadrive.core.BreakPhase
import app.commadrive.core.EnergyEstimator
import app.commadrive.core.TripPlan
import app.commadrive.core.VehicleSnapshot
import app.commadrive.core.Verdict
import kotlin.math.abs

/**
 * 제안 엔진 — "지금 이 사람에게 꺼낼 것 **하나**". `src/lib/assistant/planner.ts` 의 거울.
 *
 * 메뉴를 늘어놓지 않는다. 상황(여정 단계)·에너지 판단·사용자 선호에서 후보를 만들고, Safety Gate 로 거른 뒤
 * 점수가 가장 높은 하나만 앞에 낸다. 나머지는 추천함(inbox)에 둔다 — 지우지 않는다.
 *
 * 에너지 판단은 **쉼표 DRIVE 엔진 그대로**다(EnergyEstimator.estimate·verdictOf). 여기서 다시 계산하거나 고치지 않는다.
 */
/** NEXT_LEG: 귀가 구간 준비(V5 Mission) — 중간 목적지에서 방문·대기 중일 때 "귀가 일정을 확인할까요?" 한 번 (확인 = 기억 표시 · 내비 목적지 설정 아님) */
enum class SuggestionType { PROFILE_PREPARATION, ENERGY_DECISION, BREAK_PLANNING, ARRIVAL_PREPARATION, CHECKLIST_REMINDER, NEXT_LEG }

enum class SuggestionStatus { NEW, DEFERRED }

/**
 * 위험 등급 — 점수 하나로 위험과 일상 준비를 겨루게 하지 않는다. ordinal 이 곧 순서다 (V5 지시서 9절의 우선순위).
 *  RISK 에너지 '부족' · DECISION 지금 이동을 계속하기 위한 결정(귀가 구간 준비) · PHASE 지금 여정 단계의 할 일 · ADVISORY 에너지 '주의'
 */
enum class SuggestionTier { RISK, DECISION, PHASE, ADVISORY }

/** Mission 힌트(planner.ts mission) — 복귀 목적지가 있고 아직 귀가 구간을 준비하지 않았으면 대기 중에 한 번 묻는다 */
/**
 * waitedMin · plannedWaitMin — "계속 기다리기" 뒤 다시 물을지(화면점검 2차 리뷰 2026-11-11): 고정 10분이 아니라 **이 이동의 대기 계획**으로.
 * 예정 시간이 지나면 한 번만 "아직 기다리는 중인가요?", 예정이 없거나 두 번 거절하면 다시 묻지 않는다 (planner.ts mission)
 */
data class MissionHint(val nextLegReady: Boolean, val returnDestination: String?, val waitedMin: Int = 0, val plannedWaitMin: Int = 0)

data class Suggestion(
    val type: SuggestionType,
    val title: String,
    val explanation: String,
    /** 누르면 일어나는 일. null = 알려 주기만 한다 */
    val action: ActionType?,
    val priority: Int,
    val allowedWhileDriving: Boolean,
    val confirmationRequired: Boolean,
    val status: SuggestionStatus,
    /** 왜 지금 이 제안인가 — 화면에 그대로. 종류를 섞지 않는다 */
    val evidence: List<Evidence>,
    val tier: SuggestionTier,
    /** 건너뛰면 어떻게 되나 */
    val ifSkipped: String,
)

/**
 * 판단 근거의 종류 — **차량이 알려 준 값 · 사용자가 정한 값 · 우리 추정 · 판단 규칙**을 나눈다.
 * 섞으면 추정이 사실처럼 읽힌다 (CLAUDE.md 정책 2). 차량 값이 모의인지 실제인지는 화면이 함께 적는다.
 */
enum class EvidenceKind { VEHICLE, USER, ESTIMATE, RULE }
data class Evidence(val kind: EvidenceKind, val text: String)

/** 근거 문장에 넣을 값들 — 판단에는 쓰지 않는다. 설명만 한다 */
data class PlannerContext(
    val profileName: String,
    val batteryPct: Double?,
    val waitMinutes: Int,
    val minReservePct: Double,
    val tripMinutes: Int?,
    val breakIntervalMinutes: Int,
    val remainingKm: Double?,
)

/** dismissedThisTrip — 이번 이동에서 거절한 횟수(새 이동에서 0). 연속 거절(dismissStreak)은 이동을 넘어 배운다 */
data class SuggestionRecord(val dismissStreak: Int = 0, val lastShownAt: Long? = null, val lastDismissedAt: Long? = null, val doneThisTrip: Boolean = false, val dismissedThisTrip: Int = 0)

data class EnergySignal(val verdict: Verdict, val message: String)

data class ClimateGap(val currentC: Double, val targetC: Double)

data class PlannerInput(
    val journey: JourneyState,
    /** Journey.isRestricted(signals) — 주행 중 화면 규칙 */
    val restricted: Boolean,
    /** 시연 시계(ms). 벽시계를 쓰지 않는다 — 시나리오를 똑같이 다시 돌리려고 */
    val now: Long,
    val energy: EnergySignal?,
    val breakPhase: BreakPhase?,
    /** 프로필에 저장한 온도와 지금 차의 온도. 차가 못 알려 주면 null */
    val climate: ClimateGap?,
    /** 하차 체크리스트에서 아직 확인하지 않은 항목 수 */
    val checklistPending: Int,
    /** 사용자가 "먼저 제안" 을 껐으면 false — 전부 추천함으로 간다 */
    val proactive: Boolean,
    val history: Map<SuggestionType, SuggestionRecord>,
    val context: PlannerContext,
    /** 탑승 조합의 안내 빈도가 "최소 안내"면 true — 주의(ADVISORY) 등급은 추천함으로. 위험·단계 할 일은 그대로 (planner.ts quiet) */
    val quiet: Boolean = false,
    val mission: MissionHint? = null,
)

/** companions: 함께 할 일(최대 2, 주행 중 없음) · inbox: 앞에 띄우지 않은 것 */
/**
 * 왜 앞에 띄우지 않았나 — "필요할 때만 제안한다"를 검증 가능하게(외부 평가 6 ③: 검토 수 · 표시 수 · 억제와 이유). planner.ts HeldReason 의 거울.
 */
enum class HeldReason(val label: String) {
    DONE_THIS_TRIP("이번 이동에서 이미 함"), COOLDOWN("방금 거절해 10분 쉼"), DRIVING("주행 중이라 정차까지"), DISMISSED("3번 연속 거절"), PROACTIVE_OFF("'먼저 제안' 꺼짐"), QUIET("최소 안내 · 주의 등급은 추천함으로"), KEEP_WAITING("계속 기다리기 · 대기 계획까지 묻지 않음"),
}
data class Held(val type: SuggestionType, val reason: HeldReason)
/** reviewed 후보로 검토한 수 · shown 앞에 띄운 수(주요 1 + 함께 할 일) · held 띄우지 않은 것과 이유(추천함에 있는 것과 후보에서 뺀 것 모두) */
data class PlanAudit(val reviewed: Int, val shown: Int, val held: List<Held>)
data class PlanResult(val top: Suggestion?, val companions: List<Suggestion>, val inbox: List<Suggestion>, val audit: PlanAudit)

object SuggestionPlanner {
    /** 점수 가중치 — **초기 설계값**이다 (스펙 6.3). 상황 관련성 40 · 중요도 25 · 시점 적합성 20 · 새로움 15 */
    const val W_RELEVANCE = 0.4
    const val W_IMPORTANCE = 0.25
    const val W_TIMING = 0.2
    const val W_NOVELTY = 0.15

    /** 거절한 제안은 이 시간 동안 다시 띄우지 않는다 */
    const val DISMISS_COOLDOWN_MS = 10 * 60_000L
    /** 보여 준 지 이 시간 안이면 "새롭지 않다" */
    const val SHOWN_RECENT_MS = 5 * 60_000L
    /** 같은 제안을 이만큼 연달아 거절하면 먼저 띄우지 않고 추천함에만 둔다 (규칙 기반 학습, 스펙 3.4) */
    const val DISMISS_STREAK_LIMIT = 3
    /** 주행 중에는 이 중요도 이상만 앞에 낸다. 나머지는 정차할 때까지 보류 */
    const val DRIVING_MIN_IMPORTANCE = 0.7
    /** 공조 설정 차이가 이보다 작으면 제안하지 않는다(°C) */
    const val CLIMATE_GAP_MIN_C = 1.0
    /** 주요 제안 옆에 함께 보여 줄 할 일 */
    const val MAX_COMPANIONS = 2

    private fun rec(h: Map<SuggestionType, SuggestionRecord>, t: SuggestionType) = h[t] ?: SuggestionRecord()

    fun recordShown(h: Map<SuggestionType, SuggestionRecord>, t: SuggestionType, now: Long) = h + (t to rec(h, t).copy(lastShownAt = now))
    fun recordDismissed(h: Map<SuggestionType, SuggestionRecord>, t: SuggestionType, now: Long) =
        h + (t to rec(h, t).let { it.copy(dismissStreak = it.dismissStreak + 1, lastDismissedAt = now, dismissedThisTrip = it.dismissedThisTrip + 1) })
    fun recordAccepted(h: Map<SuggestionType, SuggestionRecord>, t: SuggestionType) = h + (t to rec(h, t).copy(dismissStreak = 0, doneThisTrip = true))
    /** "지금 그대로 둘게요" — 거절로 배우되 이번 이동에서는 다시 묻지 않는다 */
    fun recordKept(h: Map<SuggestionType, SuggestionRecord>, t: SuggestionType, now: Long) =
        h + (t to rec(h, t).let { it.copy(dismissStreak = it.dismissStreak + 1, lastDismissedAt = now, doneThisTrip = true, dismissedThisTrip = it.dismissedThisTrip + 1) })
    /** 사용자가 추천함에서 다시 켠다 — 연속 거절을 지운다 */
    fun reactivate(h: Map<SuggestionType, SuggestionRecord>, t: SuggestionType) = h + (t to rec(h, t).copy(dismissStreak = 0, lastDismissedAt = null))
    /** 새 여정 — "이번 여정에서 했음"만 지운다. 거절 학습은 남긴다 */
    fun newTrip(h: Map<SuggestionType, SuggestionRecord>) = h.mapValues { it.value.copy(doneThisTrip = false, dismissedThisTrip = 0) }

    /** 쉼표 DRIVE 엔진의 판정을 제안 입력으로. 충분(OK)이면 꺼낼 것이 없다 */
    fun energySignalOf(plan: TripPlan, v: VehicleSnapshot): EnergySignal? {
        val e = EnergyEstimator.estimate(plan, v)
        val verdict = EnergyEstimator.verdictOf(e)
        return if (verdict == Verdict.OK) null else EnergySignal(verdict, e.message)
    }

    private class Candidate(
        val type: SuggestionType, val action: ActionType?, val relevance: Double, val importance: Double, val timing: Double,
        val title: String, val explanation: String, val evidence: List<Evidence>,
        val tier: SuggestionTier, val ifSkipped: String,
    )

    private fun km1(km: Double) = fmt(Math.round(km * 10) / 10.0)
    private val TRAILING_NOTE = Regex("""\s*\(.*\)$""")
    /** "집 (귀가)" → "집" — 카드 한 줄에서 괄호 설명을 뺀다 (planner.ts placeName) */
    private fun placeName(d: String) = d.replace(TRAILING_NOTE, "")

    private fun candidates(i: PlannerInput): List<Candidate> {
        val phase = i.journey.phase
        val atDestination = i.journey.atDestination
        val x = i.context
        val out = mutableListOf<Candidate>()
        val c = i.climate
        if (phase == JourneyPhase.PREPARING && c != null && abs(c.targetC - c.currentC) >= CLIMATE_GAP_MIN_C) {
            out += Candidate(
                SuggestionType.PROFILE_PREPARATION, ActionType.SET_CLIMATE, 1.0, 0.6, 1.0,
                "저장한 온도 ${fmt(c.targetC)}°C 로 맞출까요?",
                "지금 차량은 ${fmt(c.currentC)}°C 입니다. 바꾸기 전에 한 번 더 묻습니다.",
                listOf(
                    Evidence(EvidenceKind.USER, "${x.profileName} 프로필 저장 온도 ${fmt(c.targetC)}°C"),
                    Evidence(EvidenceKind.VEHICLE, "지금 공조 설정 ${fmt(c.currentC)}°C"),
                    Evidence(EvidenceKind.RULE, "차이 ${km1(abs(c.targetC - c.currentC))}°C — ${fmt(CLIMATE_GAP_MIN_C)}°C 이상이면 제안"),
                ),
                SuggestionTier.PHASE, "건너뛰면 지금 온도를 그대로 두고, 이번 이동에서는 다시 묻지 않습니다.",
            )
        }
        val e = i.energy
        // 마지막 구간의 목적지에서만 에너지 제안을 거둔다 — 중간 목적지(왕복)에서는 귀로 에너지가 남아 있다
        val finalArrival = atDestination && i.journey.isLastLeg
        val energyPhase = phase != JourneyPhase.FINISHING && phase != JourneyPhase.COMPLETED && phase != JourneyPhase.NOT_STARTED &&
            !(phase == JourneyPhase.PARKED && finalArrival)
        if (e != null && energyPhase) {
            out += Candidate(
                SuggestionType.ENERGY_DECISION, ActionType.SUGGEST_CHARGE_STOP, 1.0, if (e.verdict == Verdict.SHORT) 1.0 else 0.7,
                if (phase == JourneyPhase.PREPARING || phase == JourneyPhase.PARKED) 1.0 else 0.8,
                if (e.verdict == Verdict.SHORT) "충전 계획이 필요해요" else "에너지 여유가 크지 않아요",
                e.message,
                listOfNotNull(
                    x.batteryPct?.let { Evidence(EvidenceKind.VEHICLE, "배터리 ${Math.round(it)}%") },
                    Evidence(EvidenceKind.USER, "도착 후 대기 ${x.waitMinutes}분 · 최소 잔량 ${fmt(x.minReservePct)}%"),
                    Evidence(EvidenceKind.ESTIMATE, e.message),
                    Evidence(EvidenceKind.RULE, if (e.verdict == Verdict.SHORT) "판정 '부족' — 추정 범위 전체가 최소 잔량에 못 미침" else "판정 '아슬아슬' — 추정 범위 일부가 최소 잔량에 못 미침"),
                ),
                if (e.verdict == Verdict.SHORT) SuggestionTier.RISK else SuggestionTier.ADVISORY,
                if (e.verdict == Verdict.SHORT) "건너뛰어도 10분 뒤 다시 확인합니다. 부족 판단은 거절해도 추천함으로 미루지 않습니다." else "건너뛰면 10분 뒤 다시 확인합니다.",
            )
        }
        // 곧 도착이면 휴식을 권하지 않는다 — 3km 앞에서 "쉬어 가자"는 말은 도착하면 쉰다는 것보다 못하다
        if (i.breakPhase == BreakPhase.SUGGEST && phase == JourneyPhase.DRIVING) {
            out += Candidate(
                SuggestionType.BREAK_PLANNING, ActionType.SUGGEST_CHARGE_STOP, 0.8, 0.7, 1.0,
                "쉬어 갈 때가 됐어요", "정한 휴식 간격이 지났습니다. 다음 정차 후보를 보여 드릴게요.",
                listOfNotNull(
                    x.tripMinutes?.let { Evidence(EvidenceKind.VEHICLE, "쉬지 않고 ${it}분 주행") },
                    Evidence(EvidenceKind.USER, "휴식 간격 ${x.breakIntervalMinutes}분"),
                ),
                SuggestionTier.PHASE, "건너뛰면 10분 뒤 다시 알려 드립니다.",
            )
        }
        if (phase == JourneyPhase.APPROACHING && i.checklistPending > 0) {
            out += Candidate(
                SuggestionType.ARRIVAL_PREPARATION, null, 0.9, 0.4, 1.0,
                "곧 도착합니다", "내리기 전에 챙길 것 ${i.checklistPending}개가 있습니다.",
                listOfNotNull(
                    x.remainingKm?.let { Evidence(EvidenceKind.ESTIMATE, "목적지까지 ${km1(it)}km (이동 계획 기준)") },
                    Evidence(EvidenceKind.USER, "하차 체크리스트 미확인 ${i.checklistPending}개"),
                ),
                SuggestionTier.PHASE, "알림만 드립니다. 도착해 주차하면 하차 준비를 다시 묻습니다.",
            )
        }
        // 방문·대기 중(귀가 구간 남음) — 귀가 일정을 한 번 확인한다. 내비 목적지는 앱이 바꾸지 않는다. 수락은 "귀가 확인" 표시다 (planner.ts NEXT_LEG)
        val m = i.mission
        if (phase == JourneyPhase.WAITING && m != null && !m.nextLegReady && m.returnDestination != null) {
            // 두 번째(대기 계획이 지난 뒤)는 질문을 바꾼다 — 같은 질문을 되풀이하지 않고 상황을 다시 확인한다
            val again = rec(i.history, SuggestionType.NEXT_LEG).dismissedThisTrip > 0
            out += Candidate(
                SuggestionType.NEXT_LEG, ActionType.PREPARE_NEXT_LEG, 1.0, 0.75, 1.0,
                // 차량 화면에서 한눈에 — 제목은 짧게, 줄마다 하나. 마지막 줄이 주의: 귀가 일정 확인 ≠ 내비 목적지 설정 (planner.ts 와 같다)
                if (again) "아직 기다리는 중인가요?" else "방문을 마치셨나요?", "귀가 일정이 남아 있어요.\n다음 이동: ${placeName(m.returnDestination)}으로\n확인하면 '집으로 안내 시작'으로 내비에 경로를 요청할 수 있어요 — 그전에는 경로를 바꾸지 않아요.",
                listOf(
                    Evidence(EvidenceKind.USER, "저장된 복귀 목적지 ${m.returnDestination}"),
                    Evidence(EvidenceKind.RULE, "중간 목적지 도착은 구간의 끝 · 여정(Mission)은 끝나지 않음"),
                ),
                SuggestionTier.DECISION, nextLegSkipNote(again, m.plannedWaitMin),
            )
        }
        // 확인할 하차 항목이 없으면 묻지 않는다 — 혼자 출퇴근하는 날 "하차 준비할까요?"는 방해다
        if (phase == JourneyPhase.PARKED && atDestination && i.checklistPending > 0) {
            out += Candidate(
                SuggestionType.CHECKLIST_REMINDER, ActionType.CONFIRM_FINISH, 1.0, 0.8, 1.0,
                "하차 준비를 시작할까요?", "준비물을 하나씩 확인합니다. 차량 내부는 직접 확인해 주세요.",
                listOf(
                    Evidence(EvidenceKind.VEHICLE, if (i.journey.confidence == Confidence.CONFIRMED) "기어 P(주차) · 목적지 0.5km 안(이동 계획 기준)" else "주차 브레이크와 정지로 추정한 주차 · 목적지 0.5km 안(이동 계획 기준)"),
                    Evidence(EvidenceKind.RULE, "주차해도 하차 화면을 저절로 열지 않고 먼저 묻습니다"),
                ),
                SuggestionTier.PHASE, "건너뛰면 10분 뒤 다시 묻습니다.",
            )
        }
        return out
    }

    /**
     * 하나를 고른다. 순서:
     *  1. 이번 여정에서 이미 한 것, 거절 직후(쿨다운)인 것은 뺀다
     *  2. 주행 중이면 주행 중에 못 하는 것·덜 중요한 것은 보류(DEFERRED) — 정차하면 다시 올라온다
     *  3. 연달아 거절한 것, "먼저 제안" 을 끈 경우는 추천함으로
     *  4. 남은 것 중 점수가 가장 높은 하나 — 단 **위험 등급이 먼저**(RISK → PHASE → ADVISORY), 그다음 함께 할 일 최대 2개.
     *     연속 거절로 추천함에 미루는 것은 RISK 에 적용하지 않는다. 문제가 없는 날에는 아무것도 내지 않는다.
     */
    /** "계속 기다리기" 뒤 안내 — 대기 계획이 있으면 그때 한 번만, 없거나 두 번째면 다시 묻지 않는다. 출발은 대기 카드에서 언제든 */
    fun nextLegSkipNote(again: Boolean, plannedWaitMin: Int) =
        if (!again && plannedWaitMin > 0) "계속 기다리시면 대기 예정 ${plannedWaitMin}분이 지날 때 한 번만 다시 확인해요. 집으로 출발은 대기 카드에서 언제든 할 수 있어요."
        else "계속 기다리시면 다시 묻지 않아요. 집으로 출발은 대기 카드에서 언제든 할 수 있어요."

    /** 귀가 질문을 다시 꺼내도 되나 — 이번 이동에서 한 번 거절했고, 대기 계획이 있고, 그 시간이 지났을 때만 (planner.ts nextLegHeld) */
    fun nextLegHeld(r: SuggestionRecord, m: MissionHint?): Boolean =
        r.dismissedThisTrip > 0 && (r.dismissedThisTrip >= 2 || m == null || m.plannedWaitMin <= 0 || m.waitedMin < m.plannedWaitMin)

    fun plan(i: PlannerInput): PlanResult {
        val held = mutableListOf<Held>()
        val all = candidates(i)
        val scored = all.mapNotNull { c ->
            val r = rec(i.history, c.type)
            if (r.doneThisTrip) { held += Held(c.type, HeldReason.DONE_THIS_TRIP); return@mapNotNull null }
            if (c.type == SuggestionType.NEXT_LEG && nextLegHeld(r, i.mission)) { held += Held(c.type, HeldReason.KEEP_WAITING); return@mapNotNull null }
            if (r.lastDismissedAt != null && i.now - r.lastDismissedAt < DISMISS_COOLDOWN_MS) { held += Held(c.type, HeldReason.COOLDOWN); return@mapNotNull null }
            val novelty = if (r.lastShownAt != null && i.now - r.lastShownAt < SHOWN_RECENT_MS) 0.0 else 1.0
            val priority = Math.round((W_RELEVANCE * c.relevance + W_IMPORTANCE * c.importance + W_TIMING * c.timing + W_NOVELTY * novelty) * 100).toInt()
            val whileDriving = c.action == null || SafetyGate.allowedWhileDriving(c.action)
            // 이유는 검사 순서대로 하나만 적는다 — 주행 중 보류가 먼저, 그다음 거절 학습, 그다음 설정
            val reason = when {
                i.restricted && (!whileDriving || c.importance < DRIVING_MIN_IMPORTANCE) -> HeldReason.DRIVING
                r.dismissStreak >= DISMISS_STREAK_LIMIT && c.tier != SuggestionTier.RISK -> HeldReason.DISMISSED
                !i.proactive -> HeldReason.PROACTIVE_OFF
                i.quiet && c.tier == SuggestionTier.ADVISORY -> HeldReason.QUIET
                else -> null
            }
            if (reason != null) held += Held(c.type, reason)
            Suggestion(
                c.type, c.title, c.explanation, c.action, priority, whileDriving,
                c.action != null && SafetyGate.POLICY.getValue(c.action).confirmation,
                if (reason != null) SuggestionStatus.DEFERRED else SuggestionStatus.NEW,
                c.evidence, c.tier, c.ifSkipped,
            )
        }.sortedWith(compareBy<Suggestion>({ it.tier.ordinal }, { -it.priority }))
        val top = scored.firstOrNull { it.status == SuggestionStatus.NEW }
        val companions = if (i.restricted) emptyList() else scored.filter { it !== top && it.status == SuggestionStatus.NEW }.take(MAX_COMPANIONS)
        val inbox = scored.filter { s -> s !== top && companions.none { it === s } }
        // NEW 인데 자리가 없어 추천함으로 간 것(함께 할 일 한도 초과)은 억제가 아니라 "자리 없음" — 이유 목록에 넣지 않는다
        return PlanResult(top, companions, inbox, PlanAudit(all.size, (if (top != null) 1 else 0) + companions.size, held))
    }
}
