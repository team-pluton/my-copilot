package app.commadrive.app

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.commadrive.core.EnergyEstimator
import app.commadrive.core.EnergyPlan
import app.commadrive.core.Feasibility
import app.commadrive.core.NavResult
import app.commadrive.core.PassengerType
import app.commadrive.core.RankInput
import app.commadrive.core.RankedRestStop
import app.commadrive.core.ReachableState
import app.commadrive.core.RecommendationEngine
import app.commadrive.core.RestStop
import app.commadrive.core.TripMode
import app.commadrive.core.TripPlan
import app.commadrive.core.Verdict
import app.commadrive.core.VehicleSnapshot
import app.commadrive.core.WhatIfOption
import app.commadrive.core.WhatIfResult
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** 화면 단계 — 웹 시연의 01~06 을 차 안 흐름으로 줄인 것 */
enum class Step { PLAN, JUDGE, STOPS, DRIVE }

data class LogEntry(val time: String, val text: String, val verdictChanged: Boolean)

/**
 * 앱 상태와 판단. **판단은 전부 core/ 가 한다** — 여기는 값을 모아 넘기고, 바뀐 값을 화면·음성으로 돌려줄 뿐이다.
 *
 * 차량 값은 두 출처 중 하나다: Pleos Vehicle SDK(LIVE) 또는 시연 조작판(DEMO). 섞지 않는다 —
 * LIVE 면 조작판이 차량 값을 바꾸지 못한다 (CLAUDE.md 정책 4).
 */
class AppViewModel(app: Application) : AndroidViewModel(app) {
    val link = CarLink(app, viewModelScope)
    val speaker = Speaker(app)
    private val engine = RecommendationEngine()

    var vehicleLink by mutableStateOf(Link.CONNECTING); private set
    var naviLink by mutableStateOf(Link.CONNECTING); private set
    private var liveSnapshot by mutableStateOf<VehicleSnapshot?>(null)

    /** 내비가 예측한 도착 잔량(%) — LIVE 내비에 경로가 있을 때만 */
    var naviArrivalSoc by mutableStateOf<Int?>(null); private set
    var naviRemainKm by mutableStateOf<Double?>(null); private set

    var step by mutableStateOf(Step.PLAN)
    var plan by mutableStateOf(DemoData.journeyPlan); private set
    var demoVehicle by mutableStateOf(DemoData.journeyVehicle); private set
    var realEfficiency by mutableStateOf(false); private set

    /** 시연 주행 진행 — 가는 길(km) · 대기 경과(분) · 오는 길(km) */
    var traveledKm by mutableStateOf(0.0); private set
    var waitElapsed by mutableStateOf(0); private set
    var returnTraveled by mutableStateOf(0.0); private set

    var selected by mutableStateOf<RestStop?>(null); private set
    var arrivedAt by mutableStateOf<RestStop?>(null); private set
    private var demoWaypoints by mutableStateOf(0)
    var adding by mutableStateOf(false); private set

    var toast by mutableStateOf<String?>(null)

    /** 꽉 찬 슬롯처럼 사용자가 읽고 닫아야 하는 알림 */
    var notice by mutableStateOf<String?>(null)
    var voiceLine by mutableStateOf<String?>(null); private set
    val log = mutableStateListOf<LogEntry>()

    private var baseline: EnergyPlan? = null

    init {
        link.start()
        viewModelScope.launch { link.vehicleLink.collect { vehicleLink = it; if (it == Link.LIVE) rebaseline() } }
        viewModelScope.launch { link.naviLink.collect { naviLink = it } }
        viewModelScope.launch {
            link.snapshot.collect { s ->
                if (s != null) {
                    liveSnapshot = s
                    onVehicleChanged("차량 값 변화")
                }
            }
        }
        // 내비 경로 — 도착 잔량 예측과 남은 거리. 있으면 그 값이 가는 길의 기준이 된다(research 9절)
        viewModelScope.launch {
            while (isActive) {
                val n = link.navi
                if (naviLink == Link.LIVE && n != null) {
                    runCatching { n.refresh() }
                    naviArrivalSoc = n.naviArrivalSocPct()
                    naviRemainKm = runCatching { n.currentTrip()?.remainingKm }.getOrNull()
                }
                delay(5_000)
            }
        }
        rebaseline()
    }

    // ── 값 ─────────────────────────────────────────────────────────

    val isLiveVehicle: Boolean get() = vehicleLink == Link.LIVE && liveSnapshot != null
    val vehicle: VehicleSnapshot get() = liveSnapshot?.takeIf { vehicleLink == Link.LIVE } ?: demoVehicle

    /** 지금 시점에서 남은 일정 — 이미 달린 거리·지난 대기는 뺀다 */
    val remainingPlan: TripPlan
        get() {
            val navi = naviArrivalSoc?.toDouble()
            return if (plan.mode == TripMode.WAIT) {
                plan.copy(
                    routeKm = max(plan.routeKm - traveledKm, 0.0),
                    waitMinutesAfterArrival = max(plan.waitMinutesAfterArrival - waitElapsed, 0),
                    returnKm = max(plan.returnKm - returnTraveled, 0.0),
                    naviArrivalSocPct = if (traveledKm == 0.0) navi else null,
                )
            } else {
                plan.copy(
                    routeKm = naviRemainKm ?: max(plan.routeKm - traveledKm, 0.0),
                    naviArrivalSocPct = navi,
                )
            }
        }

    val energy: EnergyPlan get() = EnergyEstimator.estimate(remainingPlan, vehicle)
    val verdict: Verdict get() = EnergyEstimator.verdictOf(energy)

    private val rankInput: RankInput
        get() {
            val e = energy
            return RankInput(plan, traveledKm, e.needsCharge, vehicle.tripMinutes, Feasibility.of(vehicle, e.waitPct, plan.minReservePct))
        }

    val ranked: List<RankedRestStop>
        get() = if (plan.mode == TripMode.JOURNEY) engine.rank(DemoData.stops, rankInput) else emptyList()

    val excluded: List<RecommendationEngine.Exclusion>
        get() {
            if (plan.mode != TripMode.JOURNEY) return emptyList()
            val shown = ranked.map { it.stop.id }.toSet()
            return engine.excluded(DemoData.stops, rankInput).filter { it.stop.id !in shown }
        }

    fun breakdown(stop: RestStop) = engine.breakdown(stop, rankInput)
    fun reachable(stop: RestStop): ReachableState = engine.reachableState(stop, rankInput)

    fun atStopPct(stop: RestStop): Double =
        max(vehicle.batteryPct - (stop.routeKm - traveledKm) * EnergyEstimator.pctPerKm(vehicle), 0.0)

    /** 후보까지 간 뒤 잔량에서 80% 까지 — 카드와 도착 화면이 같은 수를 보여 준다 */
    fun chargeMinutesOf(stop: RestStop): Int? {
        val kw = stop.chargerKw ?: return null
        return EnergyEstimator.chargeMinutes(atStopPct(stop), Feasibility.CHARGE_TARGET_PCT, vehicle.batteryKwh, kw)
    }

    /** 만약에 비교 — 웹 시연 simulator.tsx 와 같은 선택지 */
    val whatIf: List<WhatIfResult>
        get() {
            val v = vehicle
            val opts = mutableListOf(
                WhatIfOption(if (plan.mode == TripMode.WAIT) "지금 그대로" else "충전 없이 그대로") { p, vv -> p to vv },
            )
            if (plan.mode == TripMode.WAIT) {
                opts += WhatIfOption("1시간 더 기다리면") { p, vv -> p.copy(waitMinutesAfterArrival = p.waitMinutesAfterArrival + 60) to vv }
                opts += WhatIfOption("공조 끄고 기다리면") { p, vv -> p to vv.copy(hvacOn = false) }
                opts += WhatIfOption("출발 전 15분 급속(100kW)") { p, vv ->
                    p to vv.copy(batteryPct = min(vv.batteryPct + EnergyEstimator.chargePctInMinutes(15, 100, vv.batteryKwh), 100.0))
                }
            } else {
                val top = selected ?: ranked.firstOrNull()?.stop
                val kw = top?.chargerKw
                if (top != null && kw != null) {
                    val atStop = atStopPct(top)
                    val short = top.name.removeSuffix("휴게소")
                    val m = EnergyEstimator.chargeMinutes(atStop, Feasibility.CHARGE_TARGET_PCT, v.batteryKwh, kw)
                    opts += WhatIfOption("${short}에서 15분만 충전") { p, vv ->
                        p to vv.copy(batteryPct = vv.batteryPct + EnergyEstimator.chargePctInMinutes(15, kw, vv.batteryKwh))
                    }
                    opts += WhatIfOption("${short}에서 80%까지 (약 ${m}분)") { p, vv ->
                        p to vv.copy(batteryPct = vv.batteryPct + max(Feasibility.CHARGE_TARGET_PCT - atStop, 0.0))
                    }
                }
                opts += WhatIfOption("공조 끄고 가면") { p, vv -> p to vv.copy(hvacOn = false) }
            }
            return EnergyEstimator.compareOptions(remainingPlan, v, opts)
        }

    /** 시연 내비의 경유지 수 (실제 내비면 내비가 센다) */
    val demoWaypointCount: Int get() = demoWaypoints

    // ── 여정 입력 (정차 중) ──────────────────────────────────────────

    fun chooseMode(mode: TripMode) {
        if (mode == TripMode.STAY) return // 설계 단계 — 화면에서도 막혀 있다
        plan = if (mode == TripMode.WAIT) DemoData.waitPlan else DemoData.journeyPlan
        // 사용 목적을 고르면 그 시나리오의 시연 차량 값으로 돌아간다 — 앞 장면에서 바꾼 효율·잔량이 새 판단에 섞이지 않게
        if (!isLiveVehicle) {
            realEfficiency = false
            demoVehicle = if (mode == TripMode.WAIT) DemoData.waitVehicle else DemoData.journeyVehicle
        }
        resetTrip()
    }

    fun togglePassenger(p: PassengerType) {
        plan = plan.copy(passengers = if (p in plan.passengers) plan.passengers - p else plan.passengers + p)
        rebaseline()
    }

    fun setWait(min: Int) { plan = plan.copy(waitMinutesAfterArrival = min.coerceIn(0, 240)); rebaseline() }
    fun setReserve(pct: Double) { plan = plan.copy(minReservePct = pct.coerceIn(5.0, 40.0)); rebaseline() }
    fun setRoundTrip(on: Boolean) { plan = plan.copy(returnKm = if (on) plan.routeKm else 0.0); rebaseline() }

    /** 시연을 처음 상태로 — 같은 사용 목적으로 다시 */
    fun restart() = chooseMode(plan.mode)

    private fun resetTrip() {
        traveledKm = 0.0; waitElapsed = 0; returnTraveled = 0.0
        selected = null; arrivedAt = null; demoWaypoints = 0; voiceLine = null
        log.clear()
        rebaseline()
    }

    /** 입력을 바꾼 것은 "재판단"이 아니다 — 새 기준선을 잡는다 */
    private fun rebaseline() { baseline = energy }

    // ── 판단을 다시 내린다 ─────────────────────────────────────────

    private fun onVehicleChanged(cause: String) {
        val prev = baseline ?: run { rebaseline(); return }
        val next = energy
        val r = EnergyEstimator.rejudge(prev, next)
        if (r != null) {
            baseline = next
            log.add(0, LogEntry(now(), cause + " — " + r.message, r.from != r.to))
            toast = r.message
            if (r.from != r.to) say(spokenVerdict())
        }
        // 향하는 경유지에 못 닿게 되면 알린다 — 경로는 바꾸지 않는다(정책 1)
        val target = selected
        if (target != null && plan.mode == TripMode.JOURNEY && target.routeKm > traveledKm &&
            reachable(target) == ReachableState.UNREACHABLE
        ) {
            val line = "지금 배터리로 ${target.name}까지 여유가 부족할 수 있어요. 경로는 그대로예요. 정차하면 다른 곳을 보여 드릴게요."
            if (voiceLine != line) {
                say(line)
                log.add(0, LogEntry(now(), "경유지 도달 경고 — " + target.name, true))
            }
        }
    }

    fun setBattery(pct: Double) {
        if (isLiveVehicle) return
        demoVehicle = demoVehicle.copy(batteryPct = pct.coerceIn(5.0, 100.0))
        onVehicleChanged("잔량 ${pct.roundToInt()}%")
    }

    fun setTemp(c: Double) {
        if (isLiveVehicle) return
        demoVehicle = demoVehicle.copy(outsideTempC = c)
        onVehicleChanged("외기온 ${c.roundToInt()}°C")
    }

    fun setHvac(on: Boolean) {
        if (isLiveVehicle) return
        demoVehicle = demoVehicle.copy(hvacOn = on)
        onVehicleChanged(if (on) "공조 켬" else "공조 끔")
    }

    fun useRealEfficiency(on: Boolean) {
        if (isLiveVehicle) return
        realEfficiency = on
        demoVehicle = demoVehicle.copy(efficiencyKwhPer100km = if (on) DemoData.REAL_EFFICIENCY_KWH_PER_100KM else null)
        onVehicleChanged(if (on) "실주행 효율 ${DemoData.REAL_EFFICIENCY_KWH_PER_100KM} kWh/100km" else "효율 기본값")
    }

    /** 시연 주행 버튼에 적을 말 — 지금 단계가 가는 길인지·대기인지·오는 길인지 */
    val advanceLabel: String?
        get() = when {
            isLiveVehicle -> null
            arrivedAt != null -> null
            plan.mode == TripMode.WAIT && traveledKm >= plan.routeKm && waitElapsed < plan.waitMinutesAfterArrival -> "대기 +20분"
            plan.mode == TripMode.WAIT && traveledKm >= plan.routeKm -> if (returnTraveled < plan.returnKm) "귀가 +30km" else null
            traveledKm < plan.routeKm -> "주행 +30km"
            else -> null
        }

    /**
     * 시연 주행 — 한 번에 30km(또는 대기 20분). 잔량은 같은 엔진의 소비율로 줄인다.
     * 계획대로 흘러가면 부족분이 그대로라 재판단이 조용하다 — 그게 맞다. 값이 계획과 어긋날 때만 말한다.
     */
    fun advance() {
        if (isLiveVehicle || arrivedAt != null) return
        val v = demoVehicle
        if (plan.mode == TripMode.WAIT && traveledKm >= plan.routeKm) {
            if (waitElapsed < plan.waitMinutesAfterArrival) {
                val m = min(20, plan.waitMinutesAfterArrival - waitElapsed)
                val used = EnergyEstimator.estimate(TripPlan("대기", 0.0, m, 0.0, emptySet(), 90), v).waitPct
                waitElapsed += m
                demoVehicle = v.copy(batteryPct = max(v.batteryPct - used, 0.0), speedKmh = 0.0)
                onVehicleChanged("대기 ${waitElapsed}분")
            } else {
                val km = min(30.0, plan.returnKm - returnTraveled)
                if (km <= 0) return
                returnTraveled += km
                demoVehicle = v.copy(batteryPct = max(v.batteryPct - km * EnergyEstimator.pctPerKm(v), 0.0), speedKmh = 100.0)
                onVehicleChanged("귀가 ${returnTraveled.roundToInt()}km")
            }
            return
        }
        val nextStop = selected?.takeIf { it.routeKm > traveledKm }
        val km = minOf(30.0, plan.routeKm - traveledKm, nextStop?.let { it.routeKm - traveledKm } ?: Double.MAX_VALUE)
        if (km <= 0) return
        traveledKm += km
        demoVehicle = v.copy(
            batteryPct = max(v.batteryPct - km * EnergyEstimator.pctPerKm(v), 0.0),
            tripMinutes = v.tripMinutes + (km / DemoData.KM_PER_MINUTE).roundToInt(),
            speedKmh = if (traveledKm >= plan.routeKm) 0.0 else 100.0,
        )
        onVehicleChanged("주행 ${traveledKm.roundToInt()}km")
        if (nextStop != null && traveledKm >= nextStop.routeKm) arrive(nextStop) else announceAhead()
    }

    private fun announceAhead() {
        val s = selected ?: return
        val left = s.routeKm - traveledKm
        if (left > 0 && left <= 50) {
            say(if (left <= 10) "${s.name}가 ${left.roundToInt()}km 앞이에요. 오른쪽 차로를 이용하세요." else "${s.name}가 ${left.roundToInt()}km 앞이에요.")
        }
    }

    private fun arrive(stop: RestStop) {
        arrivedAt = stop
        demoVehicle = demoVehicle.copy(speedKmh = 0.0)
        val m = chargeMinutesOf(stop)
        say(if (m != null) "${stop.name}에 도착했어요. 80% 까지 약 ${m}분 걸려요. 그동안 쉬세요." else "${stop.name}에 도착했어요. 쉬어 가세요.")
    }

    /** 시연: 충전을 마친 것으로 — 실제 앱은 EvBattery 잔량이 올라오는 것을 그대로 본다 */
    fun finishCharging() {
        val stop = arrivedAt ?: return
        demoVehicle = demoVehicle.copy(batteryPct = max(Feasibility.CHARGE_TARGET_PCT, demoVehicle.batteryPct), tripMinutes = 0)
        arrivedAt = null
        selected = null
        demoWaypoints = max(demoWaypoints - 1, 0)
        rebaseline()
        log.add(0, LogEntry(now(), stop.name + " 충전 뒤 다시 판단 — " + verdict.label + " · " + energy.message, false))
        say(spokenVerdict())
    }

    // ── 경유지 (사용자가 고른다 · 콜백으로 확인) ─────────────────────

    fun addWaypoint(stop: RestStop) {
        if (adding) return
        if (naviLink == Link.LIVE) {
            if (!DemoData.hasLocation(stop)) {
                notice = "${stop.name}의 좌표를 확인하지 못해 내비에 넘기지 않았어요. 엉뚱한 곳이 경유지가 되는 것보다 낫습니다."
                return
            }
            val n = link.navi ?: return
            if (!n.hasDestination) {
                // 목적지 없이 보내면 내비가 검색 화면을 띄우고 콜백이 오지 않는다(E11) — 보내기 전에 알린다
                val line = "내비게이션에 목적지가 없어요. 목적지를 먼저 설정한 뒤 경유지를 추가해 주세요."
                notice = line
                say(line)
                return
            }
            adding = true
            viewModelScope.launch {
                val r = runCatching { n.addStop(stop) }.getOrElse { NavResult.Failed(it.message ?: "오류") }
                adding = false
                onNavResult(stop, r)
            }
        } else {
            onNavResult(stop, if (demoWaypoints >= DemoData.WAYPOINT_SLOTS) NavResult.SlotFull(demoWaypoints) else NavResult.Added)
        }
    }

    fun clearDemoWaypoints() {
        demoWaypoints = 0
        selected = null
        toast = "시연: 경유지 슬롯을 비웠어요"
    }

    private fun onNavResult(stop: RestStop, r: NavResult) {
        when (r) {
            NavResult.Added -> {
                selected = stop
                if (naviLink != Link.LIVE) demoWaypoints += 1
                toast = "${stop.name} — 경유지로 추가됨. 경로 계산은 내비가 합니다"
                log.add(0, LogEntry(now(), (if (naviLink == Link.LIVE) "경유지 추가 확인(onWaypointChanged) — " else "경유지 추가 (시연 내비) — ") + stop.name, false))
            }
            is NavResult.SlotFull -> {
                val line = "경유지 두 개가 모두 찼어요. 기존 경유지는 그대로 두었어요."
                notice = "$line 내비에서 하나를 지운 뒤 다시 눌러 주세요."
                say(line)
            }
            NavResult.Unavailable -> {
                // 연결은 돼 있고 경유지 콜백만 안 온 경우다(E11) — "연결하지 못했어요"는 틀린 말이었다
                val line = "내비게이션 응답이 없어요. 지금 경로는 그대로예요."
                notice = line
                say(line)
            }
            is NavResult.Failed -> notice = "경유지 추가 실패 (${r.reason}). 지금 경로는 그대로예요."
        }
    }

    // ── 음성 ───────────────────────────────────────────────────────

    /** docs/06-demo.md 2절 "확정" 문구 */
    fun spokenVerdict(): String {
        val e = energy
        if (plan.mode == TripMode.WAIT) {
            if (verdict != Verdict.OK) return "돌아오는 길까지 배터리가 모자랄 수 있어요. 출발 전에 충전해 두세요."
            val m = e.maxWaitMinutes
            val wait = when {
                m == null -> ""
                m >= 120 -> " 공조 켜고 약 ${m / 60}시간까지 기다려도 돼요."
                else -> " 공조 켜고 약 ${m}분까지 기다려도 돼요."
            }
            return "귀가까지 충분해요.$wait"
        }
        return when (verdict) {
            Verdict.SHORT -> "도착 후 대기까지 배터리가 모자랄 수 있어요. 정차 중에 경로상 충전·휴식 후보를 보여 드릴게요."
            Verdict.TIGHT -> "도착 후 대기까지 아슬아슬해요. 쉬어 가는 김에 짧게 충전하면 여유가 생겨요."
            Verdict.OK -> "충전 없이 도착할 수 있어요. 휴식만 계획할게요."
        }
    }

    fun say(line: String) {
        voiceLine = line
        speaker.say(line)
    }

    private fun now(): String = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss"))

    override fun onCleared() {
        link.stop()
        speaker.release()
    }
}
