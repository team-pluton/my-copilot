package app.commadrive.core.assistant

import app.commadrive.core.EnergyEstimator
import app.commadrive.core.EnergyPlan
import app.commadrive.core.Rejudgement
import app.commadrive.core.Verdict

/**
 * 에너지 재판단 알림 정책 — `src/lib/assistant/notify.ts` 의 거울.
 *
 * 쉼표 DRIVE 의 rejudge(prev, next) 는 그대로 쓴다. prev 에 **마지막으로 알린 판단**을 넣어 누적 변화를 잡는다.
 * 화면 숫자는 늘 latest 다. 알림만 이 정책을 따른다.
 */
data class NotificationState(val latest: EnergyPlan?, val lastNotified: EnergyPlan?, val lastAcknowledged: EnergyPlan?) {
    companion object { val INITIAL = NotificationState(null, null, null) }
}

enum class NotificationReason { BASELINE, TIER_CHANGE, CUMULATIVE, NONE }

/** 비교 전후에 무엇이 바뀌었나 — 여럿이면 원인을 하나로 단정하지 않는다 (notify.ts ChangedInput) */
enum class ChangedInput(val label: String, val effect: String) {
    WAIT_MODE("대기 유형", "대기 중 공조 소비"), WAIT_MINUTES("대기 시간", "대기 중 공조 소비"), BATTERY("배터리 잔량", "지금 보유 에너지"),
    DISTANCE("남은 거리", "주행 소비"), OUTSIDE_TEMP("외기온", "공조·주행 소비"), HVAC("공조 ON/OFF", "공조 소비"),
}
data class RejudgeCause(val text: String, val single: Boolean)
data class RejudgeInputs(val batteryPct: Double, val outsideTempC: Double, val hvacOn: Boolean, val remainingKm: Double, val waitMinutes: Int, val waitMode: WaitMode)
/** 에너지 화면에 남기는 마지막 재판단 — 전 → 후 → 원인 */
data class Rejudge(val fromLabel: String, val fromPct: Int, val toLabel: String, val toPct: Int, val why: String, val single: Boolean, val clock: String)

/** previous: 비교 기준이었던 판단(마지막으로 알린 것) */
data class NotificationDecision(val state: NotificationState, val notify: Rejudgement?, val reason: NotificationReason, val risk: Verdict, val previous: EnergyPlan?)

object NotificationPolicy {
    const val NOTIFY_THRESHOLD_PCT = 3.0

    fun decide(s: NotificationState, latest: EnergyPlan, threshold: Double = NOTIFY_THRESHOLD_PCT): NotificationDecision {
        val risk = EnergyEstimator.verdictOf(latest)
        val base = s.lastNotified ?: return NotificationDecision(s.copy(latest = latest, lastNotified = latest), null, NotificationReason.BASELINE, risk, null)
        val r = EnergyEstimator.rejudge(base, latest, threshold)
            ?: return NotificationDecision(s.copy(latest = latest), null, NotificationReason.NONE, risk, base)
        return NotificationDecision(
            s.copy(latest = latest, lastNotified = latest), r,
            if (r.from != r.to) NotificationReason.TIER_CHANGE else NotificationReason.CUMULATIVE, risk, base,
        )
    }

    private fun tier(v: Verdict) = when (v) { Verdict.OK -> "충분"; Verdict.TIGHT -> "주의"; Verdict.SHORT -> "부족" }

    /** 사람에게 보이는 알림 문구 — energyView 를 거쳐 %p 와 0 이상으로. 엔진 문구(rejudge.message)는 그대로 둔다 */
    fun message(d: NotificationDecision, currentSocPct: Double): String? {
        val n = d.notify ?: return null
        val prev = d.previous ?: return null
        val latest = d.state.latest ?: return null
        val now = EnergyViews.of(latest, currentSocPct, null)
        if (d.reason == NotificationReason.TIER_CHANGE) return "판단이 바뀌었습니다: ${tier(n.from)} → ${tier(n.to)} · ${now.detail}"
        if (n.to == Verdict.OK) return "재판단 · 도착 예상 잔량 약 ${Math.round(maxOf(prev.arrivalPct, 0.0))}% → ${now.arrivalSocPct}%"
        val a = Math.round(maxOf(prev.shortfallPct, 0.0)).toInt()
        val b = now.requiredPctPoints
        return "재판단 · 추가 필요량 약 ${a}%p → ${b}%p (${if (b - a > 0) "+" else ""}${b - a}%p)"
    }

    fun acknowledge(s: NotificationState) = s.copy(lastAcknowledged = s.lastNotified)

    /** 재판단의 원인 — 하나만 바뀌었으면 그것, 여럿이면 하나로 단정하지 않는다 (notify.ts rejudgeCause) */
    fun cause(changed: List<ChangedInput>): RejudgeCause {
        val uniq = changed.distinct()
        return when (uniq.size) {
            0 -> RejudgeCause("입력 변화 없음 · 같은 조건으로 다시 계산", true)
            1 -> RejudgeCause("${uniq[0].label} 변경 · ${uniq[0].effect} 차이", true)
            else -> RejudgeCause("여러 값이 함께 바뀜(${uniq.joinToString(" · ") { it.label }}) — 원인을 하나로 말하지 않음", false)
        }
    }

    fun changedInputs(a: RejudgeInputs, b: RejudgeInputs): List<ChangedInput> = buildList {
        if (a.waitMode != b.waitMode) add(ChangedInput.WAIT_MODE)
        if (a.waitMinutes != b.waitMinutes) add(ChangedInput.WAIT_MINUTES)
        if (kotlin.math.abs(a.batteryPct - b.batteryPct) >= 0.5) add(ChangedInput.BATTERY)
        if (kotlin.math.abs(a.remainingKm - b.remainingKm) >= 0.5) add(ChangedInput.DISTANCE)
        if (kotlin.math.abs(a.outsideTempC - b.outsideTempC) >= 0.5) add(ChangedInput.OUTSIDE_TEMP)
        if (a.hvacOn != b.hvacOn) add(ChangedInput.HVAC)
    }

    /** 에너지 화면에 남기는 마지막 재판단 — 전 → 후 → 원인 (notify.ts rejudgeNote) */
    fun note(d: NotificationDecision, currentSocPct: Double, fromLabel: String, toLabel: String, cause: RejudgeCause, clock: String): Rejudge? {
        if (d.notify == null) return null
        val prev = d.previous ?: return null
        val latest = d.state.latest ?: return null
        val from = EnergyViews.of(prev, currentSocPct, null).arrivalSocPct ?: return null
        val to = EnergyViews.of(latest, currentSocPct, null).arrivalSocPct ?: return null
        return Rejudge(fromLabel, from, toLabel, to, cause.text, cause.single, clock)
    }

    /** 나빠지는 쪽으로 알렸으면 에너지 제안을 다시 꺼낸다 — 공조 제안의 거절 학습으로 에너지 경고를 묻어 두지 않는다 */
    fun shouldResurface(d: NotificationDecision): Boolean {
        val n = d.notify ?: return false
        return n.to.ordinal > n.from.ordinal || (n.to != Verdict.OK && n.delta > 0)
    }
}
