package app.commadrive.core

import kotlin.math.floor
import kotlin.math.roundToInt

/**
 * 에너지 추정 — 축 1 의 심장. **도착한 뒤 차에서 쓸 에너지까지** 센다. `src/lib/core/energy.ts` 의 거울.
 *
 * 내비와 충전소 검색은 "도착"까지만 본다. 도착해서 40분 차 안에서 기다리면 공조가 돌고,
 * 그 몫은 아무도 미리 안 센다. 그래서 주행 소비 · 대기 소비 · 최소 잔량을 **따로** 세고 합친다.
 *
 * ⚠️ **항상 범위(±)와 함께 돌려준다.** 제조사 공식 주행가능거리처럼 보이게 하지 않는다 (CLAUDE.md 정책 2).
 *
 *     주행 소비(%) = 거리 × 기준 소비율(kWh/km) × 보정(주행모드·외기온·공조) ÷ 배터리 용량
 *     대기 소비(%) = 대기 시간 × 공조 분당 소비 ÷ 배터리 용량
 *     부족분       = 주행 + 대기 + 최소 잔량 − 현재 잔량
 */
data class EnergyPlan(
    /** 주행 전체(가는 길 + 오는 길) */
    val drivePct: Double,
    val outboundPct: Double,
    val returnPct: Double,
    /** 공조 켜고 최대 몇 분까지 기다려도 되나 — 보수적(주행 범위 비관 끝). 공조 OFF 면 null */
    val maxWaitMinutes: Int?,
    val driveRange: Pair<Double, Double>,
    val waitPct: Double,
    val reservePct: Double,
    /** 양수면 모자란다 */
    val shortfallPct: Double,
    val shortfallRange: Pair<Double, Double>,
    val needsCharge: Boolean,
    /** 도착 시 예상 잔량(대기 포함). 모자라면 음수일 수 있다 */
    val arrivalPct: Double,
    /** 가정을 글로 — "어떻게 계산했나" 패널이 그대로 쓴다 */
    val assumptions: List<String>,
    /** 사람에게 보여 줄 한 문장 */
    val message: String,
)

enum class Verdict(val label: String) { OK("충분"), TIGHT("아슬아슬"), SHORT("부족") }
data class Rejudgement(val from: Verdict, val to: Verdict, val delta: Double, val message: String)
class WhatIfOption(val label: String, val apply: (TripPlan, VehicleSnapshot) -> Pair<TripPlan, VehicleSnapshot>)
data class WhatIfResult(val label: String, val verdict: Verdict, val arrivalPct: Double, val shortfallPct: Double)

object EnergyEstimator {
    /** 차종 기본 소비율 — EvBattery 효율값이 없을 때만 쓴다 (가정, 중형 EV 기준) */
    const val DEFAULT_KWH_PER_100KM = 16.0

    /** 공조가 켜져 있을 때 정차 중 분당 소비(kWh). 가정값 — 외기온으로 보정한다 */
    const val HVAC_KWH_PER_MIN_BASE = 0.025

    /** 추정의 불확실성 — 주행 소비의 ±12%. 가정값 (보정 전까지) */
    const val DRIVE_UNCERTAINTY = 0.12

    /** 내비 도착 잔량 예측을 쓸 때의 오차 — 가정 ±5% */
    const val NAVI_UNCERTAINTY = 0.05

    private data class Factors(val perKm: Double, val mode: Double, val temp: Double, val hvacDrive: Double)

    /** 보정 계수 — 전부 가정값. 방향은 상식과 맞고 크기는 보수적으로 */
    private fun factors(v: VehicleSnapshot) = Factors(
        perKm = (v.efficiencyKwhPer100km ?: DEFAULT_KWH_PER_100KM) / 100.0,
        mode = when (v.driveMode) { DriveMode.ECO -> 0.93; DriveMode.SPORT -> 1.12; DriveMode.NORMAL -> 1.0 },
        temp = when {
            v.outsideTempC <= 0 -> 1.2
            v.outsideTempC <= 10 -> 1.08
            v.outsideTempC >= 30 -> 1.06
            else -> 1.0
        },
        hvacDrive = if (v.hvacOn) 1.04 else 1.0,
    )

    /**
     * 1km 달릴 때 쓰는 배터리 %. 추천 엔진이 "거기까지 갈 수 있나 · 거기서 충전하면 끝까지 가나"를
     * 셀 때 쓴다 — 같은 보정을 두 군데서 따로 계산하면 두 화면이 다른 말을 한다.
     */
    fun pctPerKm(v: VehicleSnapshot): Double {
        val f = factors(v)
        return f.perKm * f.mode * f.temp * f.hvacDrive / v.batteryKwh * 100.0
    }

    fun estimate(plan: TripPlan, v: VehicleSnapshot): EnergyPlan {
        val f = factors(v)

        val kmToPct = { km: Double -> km * f.perKm * f.mode * f.temp * f.hvacDrive / v.batteryKwh * 100.0 }
        val navi = plan.naviArrivalSocPct
        val modelOutbound = kmToPct(plan.routeKm)
        val outboundPct = if (navi != null) maxOf(v.batteryPct - navi, 0.0) else modelOutbound
        val calib = if (navi != null && modelOutbound > 0) outboundPct / modelOutbound else 1.0
        val returnPctRaw = kmToPct(plan.returnKm) * calib
        val drivePct = outboundPct + returnPctRaw
        val uncertainty = if (navi != null) NAVI_UNCERTAINTY else DRIVE_UNCERTAINTY
        val driveRange = drivePct * (1 - uncertainty) to drivePct * (1 + uncertainty)

        val hvacTempFactor = when {
            v.outsideTempC <= 0 -> 1.6
            v.outsideTempC <= 10 -> 1.3
            v.outsideTempC >= 30 -> 1.4
            else -> 1.0
        }
        val waitKwh = if (v.hvacOn) plan.waitMinutesAfterArrival * HVAC_KWH_PER_MIN_BASE * hvacTempFactor else 0.0
        val waitPct = waitKwh / v.batteryKwh * 100.0

        val reservePct = plan.minReservePct
        val shortfallPct = drivePct + waitPct + reservePct - v.batteryPct
        val shortfallRange = (driveRange.first + waitPct + reservePct - v.batteryPct) to
            (driveRange.second + waitPct + reservePct - v.batteryPct)
        val arrivalPct = v.batteryPct - drivePct - waitPct

        // 범위의 **낙관적인 끝**이 0 을 넘으면 확실히 모자라고, 비관적인 끝만 넘으면 "아슬아슬"
        val needsCharge = shortfallRange.second > 0

        val waitPctPerMin = if (v.hvacOn) HVAC_KWH_PER_MIN_BASE * hvacTempFactor / v.batteryKwh * 100.0 else 0.0
        val maxWaitMinutes = if (waitPctPerMin > 0) floor((v.batteryPct - driveRange.second - reservePct) / waitPctPerMin).toInt().coerceAtLeast(0) else null

        val assumptions = listOf(
            "기준 소비 ${"%.1f".format(f.perKm * 100)} kWh/100km " +
                if (v.efficiencyKwhPer100km != null) "(차량 효율값)" else "(차종 기본값 · 가정)",
            "주행모드 ${v.driveMode} ×${f.mode.trim()} · 외기온 ${v.outsideTempC.trim()}°C ×${f.temp.trim()}" +
                if (v.hvacOn) " · 공조 ON ×${f.hvacDrive.trim()}" else "",
            if (v.hvacOn) {
                "도착 후 대기 ${plan.waitMinutesAfterArrival}분 · 공조 분당 ${"%.3f".format(HVAC_KWH_PER_MIN_BASE * hvacTempFactor)} kWh (가정)"
            } else {
                "도착 후 대기 ${plan.waitMinutesAfterArrival}분 · 공조 OFF → 대기 소비 0"
            },
            "추정 오차 ±${(DRIVE_UNCERTAINTY * 100).roundToInt()}% (보정 전)",
        )

        val assumptionsAll = assumptions.toMutableList().apply {
            if (plan.returnKm > 0) add(1, "왕복: 가는 길 ${plan.routeKm.trim()}km + 오는 길 ${plan.returnKm.trim()}km · 대기는 그 사이")
            if (navi != null) {
                this[0] = "가는 길: 내비 도착 잔량 예측 ${navi.trim()}% 기준 (NaviHelper)" + if (plan.returnKm > 0) " · 오는 길은 같은 비율(×${"%.2f".format(calib)})로 보정" else ""
                this[lastIndex] = "추정 오차 ±${(NAVI_UNCERTAINTY * 100).roundToInt()}% (내비 예측 기준 · 가정)"
            }
        }

        return EnergyPlan(
            drivePct = r1(drivePct),
            outboundPct = r1(outboundPct),
            returnPct = r1(returnPctRaw),
            maxWaitMinutes = maxWaitMinutes,
            driveRange = r1(driveRange.first) to r1(driveRange.second),
            waitPct = r1(waitPct),
            reservePct = reservePct,
            shortfallPct = r1(shortfallPct),
            shortfallRange = r1(shortfallRange.first) to r1(shortfallRange.second),
            needsCharge = needsCharge,
            arrivalPct = r1(arrivalPct),
            assumptions = assumptionsAll,
            message = buildMessage(plan, shortfallPct, shortfallRange, arrivalPct),
        )
    }

    /**
     * 제안 문장. "먼저 말해 준다"를 **규칙**으로 만든 것 — 그래야 심사에서 "왜 그렇게 말했나"에 답할 수 있다.
     */
    private fun buildMessage(plan: TripPlan, shortfall: Double, range: Pair<Double, Double>, arrival: Double): String {
        val wait = plan.waitMinutesAfterArrival
        if (plan.returnKm > 0) {
            val what = "${wait}분 기다렸다 돌아오기까지"
            return when {
                range.first > 0 -> "$what 하려면 약 ${shortfall.roundToInt()}% 가 모자랍니다 (추정 ${range.first.roundToInt()}~${range.second.roundToInt()}%). 출발 전 충전을 권합니다."
                range.second > 0 -> "$what 아슬아슬합니다 (추정 ${range.first.roundToInt()}~${range.second.roundToInt()}%). 출발 전 짧게 충전하면 여유가 생깁니다."
                else -> "현재 배터리로 $what 충분합니다 (귀가 시 예상 잔량 약 ${arrival.roundToInt()}%). 충전하지 않아도 됩니다."
            }
        }
        return when {
            range.first > 0 ->
                "도착 후 ${wait}분 대기까지 하려면 약 ${shortfall.roundToInt()}% 가 모자랍니다 " +
                    "(추정 ${range.first.roundToInt()}~${range.second.roundToInt()}%). 경로상 한 번 충전을 권합니다."
            range.second > 0 ->
                "도착 후 ${wait}분 대기까지 아슬아슬합니다 (추정 ${range.first.roundToInt()}~${range.second.roundToInt()}%). " +
                    "쉬어 가는 김에 짧게 충전하면 여유가 생깁니다."
            else ->
                "현재 배터리로 도착 후 ${wait}분 대기까지 충분합니다 (도착 예상 잔량 약 ${arrival.roundToInt()}%). 충전 없이 휴식만 계획합니다."
        }
    }

    /** 차량이 받을 수 있는 최대 충전 출력(kW) — 가정: 800V 급 중형 EV 피크 */
    const val VEHICLE_MAX_CHARGE_KW = 230.0

    /**
     * 충전 시간(분) 추정 — "80% 까지 약 N분". 테이퍼를 곡선 대신 평균 출력 비율로 뭉뚱그린다
     * (200kW 이상 0.65 · 50~199kW 0.8 · 그 아래 0.9). 전부 가정값, 화면에는 "약".
     */
    fun chargeMinutes(fromPct: Double, toPct: Double, batteryKwh: Double, chargerKw: Int): Int {
        if (toPct <= fromPct || chargerKw <= 0) return 0
        val peak = minOf(chargerKw.toDouble(), VEHICLE_MAX_CHARGE_KW)
        val taper = when { chargerKw >= 200 -> 0.65; chargerKw >= 50 -> 0.8; else -> 0.9 }
        val kwh = (toPct - fromPct) / 100.0 * batteryKwh
        return (kwh / (peak * taper) * 60).roundToInt()
    }

    /** N분 충전하면 몇 % — chargeMinutes 의 역. energy.ts chargePctInMinutes 의 거울 */
    fun chargePctInMinutes(minutes: Int, chargerKw: Int, batteryKwh: Double): Double {
        if (minutes <= 0 || chargerKw <= 0) return 0.0
        val peak = minOf(chargerKw.toDouble(), VEHICLE_MAX_CHARGE_KW)
        val taper = when { chargerKw >= 200 -> 0.65; chargerKw >= 50 -> 0.8; else -> 0.9 }
        return r1(minOf(peak * taper * minutes / 60.0 / batteryKwh * 100.0, 100.0))
    }

    fun verdictOf(p: EnergyPlan): Verdict = when {
        p.shortfallRange.first > 0 -> Verdict.SHORT
        p.shortfallRange.second > 0 -> Verdict.TIGHT
        else -> Verdict.OK
    }

    /** 실시간 재판단 — 판정이 바뀌었거나 부족분이 threshold(%p) 이상 움직였을 때만. energy.ts rejudge 의 거울 */
    fun rejudge(prev: EnergyPlan, next: EnergyPlan, threshold: Double = 3.0): Rejudgement? {
        val from = verdictOf(prev)
        val to = verdictOf(next)
        val delta = r1(next.shortfallPct - prev.shortfallPct)
        if (from == to && kotlin.math.abs(delta) < threshold) return null
        val sign = if (delta > 0) "+" else ""
        val detail = when {
            to == Verdict.OK -> "예상 잔량 ${prev.arrivalPct.roundToInt()}% → ${next.arrivalPct.roundToInt()}%"
            from == Verdict.OK -> "이제 약 ${maxOf(next.shortfallPct.roundToInt(), 0)}% 부족 (추정 ${next.shortfallRange.first.roundToInt()}~${next.shortfallRange.second.roundToInt()}%)"
            else -> "부족분 ${prev.shortfallPct.roundToInt()}% → ${next.shortfallPct.roundToInt()}% ($sign${delta.roundToInt()}%p)"
        }
        val message = if (from != to) "판단이 바뀌었습니다: ${from.label} → ${to.label} · $detail" else "재판단 · $detail"
        return Rejudgement(from, to, delta, message)
    }

    /** 만약에 비교 — 선택지마다 조건을 바꿔 다시 추정. energy.ts compareOptions 의 거울 */
    fun compareOptions(plan: TripPlan, v: VehicleSnapshot, options: List<WhatIfOption>): List<WhatIfResult> =
        options.map { o ->
            val (p, vv) = o.apply(plan, v)
            val r = estimate(p, vv)
            WhatIfResult(o.label, verdictOf(r), r.arrivalPct, r.shortfallPct)
        }

    private fun r1(n: Double): Double = (n * 10).roundToInt() / 10.0

    /** 1.0 → "1", 1.08 → "1.08" — TS 의 숫자 표기와 맞춘다 */
    private fun Double.trim(): String = if (this == this.toLong().toDouble()) this.toLong().toString() else this.toString()
}
