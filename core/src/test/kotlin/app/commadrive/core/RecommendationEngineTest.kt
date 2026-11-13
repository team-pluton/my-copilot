package app.commadrive.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * 추천 엔진·에너지 추정 규칙을 증명하는 테스트.
 *
 * 이 파일은 단순한 안전망이 아니라 **심사 자료**다. "추천이 실제로 작동하느냐"는 질문에 차량 없이
 * 답할 수 있는 유일한 근거라서, 테스트 이름을 전부 규칙 문장으로 적었다.
 *
 * `거울` 테스트는 TS(`src/lib/core`)가 같은 입력으로 낸 값을 그대로 적은 것이다 (2026-10-24,
 * `npx tsx` 로 뽑음). 한쪽을 고치면 양쪽 값을 다시 맞춘다.
 */
object Fixtures {
    fun stop(
        id: String,
        routeKm: Double,
        amenities: Set<Amenity>,
        chargerKw: Int?,
        detourKm: Double? = 0.5,
        detourMinutes: Int? = null,
        confidence: DataConfidence = DataConfidence.VERIFIED,
    ) = RestStop(
        id = id, name = id, location = GeoPoint(36.0, 127.0), routeKm = routeKm, amenities = amenities,
        detourKm = detourKm, detourMinutes = detourMinutes, chargerKw = chargerKw,
        chargerStalls = chargerKw?.let { 4 }, confidence = confidence, openingHours = "24시간", dataSource = "test",
    )

    private val full = setOf(Amenity.RESTROOM, Amenity.PARKING, Amenity.RESTAURANT, Amenity.CAFE, Amenity.BABY_CARE, Amenity.PET_AREA, Amenity.EV_CHARGER)
    private val basic = setOf(Amenity.RESTROOM, Amenity.PARKING, Amenity.RESTAURANT, Amenity.EV_CHARGER)

    /** mock.ts 의 DEMO_STOPS 와 같다 (서울→부산, 경로상 거리순) */
    val demoStops = listOf(
        stop("기흥휴게소", 35.0, basic, 100),
        stop("안성휴게소", 70.0, full, 200, 0.3, 2),
        stop("천안휴게소", 95.0, basic + Amenity.BABY_CARE, 100, 0.6),
        stop("옥산휴게소", 125.0, basic + Amenity.CAFE, 350, 0.4),
        stop("죽암휴게소", 150.0, setOf(Amenity.RESTROOM, Amenity.PARKING, Amenity.RESTAURANT), null, confidence = DataConfidence.UNKNOWN),
        stop("금강휴게소", 165.0, basic + Amenity.CAFE + Amenity.PET_AREA, 200, 0.4),
        stop("황간휴게소", 220.0, basic, 50, 0.5),
        stop("김천휴게소", 250.0, full, 350, 0.3, 2),
        stop("칠곡휴게소", 290.0, basic, 100, 0.7),
        stop("건천휴게소", 330.0, basic + Amenity.CAFE, 200, 0.5),
        stop("언양휴게소", 370.0, setOf(Amenity.RESTROOM, Amenity.PARKING, Amenity.CAFE, Amenity.EV_CHARGER), 100, 0.5, confidence = DataConfidence.UNKNOWN),
        stop("안성 시내 대형 카페", 72.0, setOf(Amenity.RESTROOM, Amenity.PARKING, Amenity.CAFE, Amenity.PET_AREA, Amenity.EV_CHARGER), 50, 7.5, confidence = DataConfidence.UNKNOWN),
        stop("천안 IC 밖 충전소", 97.0, setOf(Amenity.RESTROOM, Amenity.PARKING, Amenity.EV_CHARGER), 200, null, confidence = DataConfidence.UNKNOWN),
    )

    val plan = TripPlan("부산", 400.0, 40, 20.0, setOf(PassengerType.CHILD, PassengerType.PET), 90)
    val vehicle = VehicleSnapshot(68.0, 77.0, null, true, 6.0, DriveMode.NORMAL, 0, 0.0, false)

    fun input(v: VehicleSnapshot = vehicle, traveledKm: Double = 0.0): RankInput {
        val e = EnergyEstimator.estimate(plan.copy(routeKm = plan.routeKm - traveledKm), v)
        return RankInput(plan, traveledKm, e.needsCharge, v.tripMinutes, Feasibility.of(v, e.waitPct, plan.minReservePct))
    }
}

class EnergyEstimatorTest {

    @Test
    fun `거울 - 기본 시나리오는 약 47 퍼센트 부족이고 범위는 36에서 58이다`() {
        val e = EnergyEstimator.estimate(Fixtures.plan, Fixtures.vehicle)
        assertEquals(93.4, e.drivePct)
        assertEquals(82.2 to 104.6, e.driveRange)
        assertEquals(1.7, e.waitPct)
        assertEquals(47.0, e.shortfallPct)
        assertEquals(35.8 to 58.2, e.shortfallRange)
        assertTrue(e.needsCharge)
        assertEquals(-27.0, e.arrivalPct)
        assertEquals("도착 후 40분 대기까지 하려면 약 47% 가 모자랍니다 (추정 36~58%). 경로상 한 번 충전을 권합니다.", e.message)
    }

    @Test
    fun `거울 - 1km 당 소비율은 0_2334 퍼센트다`() {
        assertEquals(0.2334, (EnergyEstimator.pctPerKm(Fixtures.vehicle) * 10000).let { Math.round(it) / 10000.0 })
    }

    @Test
    fun `거울 - 80 퍼센트로 150km 는 충전 없이 충분하고 도착 잔량은 약 43 퍼센트다`() {
        val e = EnergyEstimator.estimate(Fixtures.plan.copy(routeKm = 150.0), Fixtures.vehicle.copy(batteryPct = 80.0))
        assertFalse(e.needsCharge)
        assertEquals(43.3, e.arrivalPct)
        assertTrue(e.message.startsWith("현재 배터리로 도착 후 40분 대기까지 충분합니다"))
    }

    @Test
    fun `범위의 비관적인 끝만 0을 넘으면 아슬아슬이라고 말한다`() {
        val e = EnergyEstimator.estimate(
            Fixtures.plan.copy(routeKm = 330.0, waitMinutesAfterArrival = 0),
            Fixtures.vehicle.copy(batteryPct = 95.0, hvacOn = false, outsideTempC = 20.0),
        )
        assertTrue(e.needsCharge)
        assertEquals(-6.4, e.shortfallPct)
        assertTrue(e.message.contains("아슬아슬"))
    }

    @Test
    fun `저온 영하 7도 히터 최대는 상온 대비 약 20 퍼센트를 더 쓴다 - 환경부 인증 평균 마이너스 21과 같은 방향과 크기`() {
        val mild = EnergyEstimator.pctPerKm(Fixtures.vehicle.copy(outsideTempC = 20.0, hvacOn = false))
        val cold = EnergyEstimator.pctPerKm(Fixtures.vehicle.copy(outsideTempC = -7.0, hvacOn = true))
        val rangeLoss = 1 - mild / cold
        assertTrue(rangeLoss in 0.18..0.23, "실제 $rangeLoss")
    }

    @Test
    fun `거울 - 충전 시간 350kW 로 10에서 80 퍼센트는 약 22분 50kW 는 약 73분`() {
        assertEquals(22, EnergyEstimator.chargeMinutes(10.0, 80.0, 77.0, 350))
        assertEquals(73, EnergyEstimator.chargeMinutes(17.0, 80.0, 77.0, 50))
        assertEquals(0, EnergyEstimator.chargeMinutes(80.0, 80.0, 77.0, 350))
    }

    @Test
    fun `거울 - 공항 마중 왕복 104km 60분 대기는 충전 없이 충분하고 공조 켜고 최대 185분`() {
        val plan = TripPlan("인천공항 (마중)", 52.0, 60, 20.0, emptySet(), 120, TripMode.WAIT, 52.0)
        val e = EnergyEstimator.estimate(plan, Fixtures.vehicle.copy(batteryPct = 55.0, outsideTempC = 1.0))
        assertFalse(e.needsCharge)
        assertEquals(24.3, e.drivePct)
        assertEquals(12.1, e.outboundPct)
        assertEquals(12.1, e.returnPct)
        assertEquals(28.2, e.arrivalPct)
        assertEquals(185, e.maxWaitMinutes)
        assertEquals("현재 배터리로 60분 기다렸다 돌아오기까지 충분합니다 (귀가 시 예상 잔량 약 28%). 충전하지 않아도 됩니다.", e.message)
        val cold = EnergyEstimator.estimate(plan, Fixtures.vehicle.copy(batteryPct = 55.0, outsideTempC = -7.0))
        assertEquals(92, cold.maxWaitMinutes)
        val short = EnergyEstimator.estimate(plan, Fixtures.vehicle.copy(batteryPct = 40.0, outsideTempC = -7.0))
        assertTrue(short.needsCharge)
        assertEquals(0, short.maxWaitMinutes)
        assertTrue(short.message.endsWith("출발 전 충전을 권합니다."))
    }

    @Test
    fun `실시간 재판단 - 외기 6도에서 영하 7도면 부족분 47에서 58, 작은 변화는 알리지 않는다`() {
        val a = EnergyEstimator.estimate(Fixtures.plan, Fixtures.vehicle)
        assertEquals("재판단 · 부족분 47% → 58% (+11%p)", EnergyEstimator.rejudge(a, EnergyEstimator.estimate(Fixtures.plan, Fixtures.vehicle.copy(outsideTempC = -7.0)))!!.message)
        assertEquals(null, EnergyEstimator.rejudge(a, EnergyEstimator.estimate(Fixtures.plan, Fixtures.vehicle.copy(outsideTempC = 5.0))))
    }

    @Test
    fun `실시간 재판단 - 판정이 바뀌면 충분에서 부족이라고 말한다`() {
        val plan = TripPlan("인천공항 (마중)", 52.0, 60, 20.0, emptySet(), 120, TripMode.WAIT, 52.0)
        val r = EnergyEstimator.rejudge(
            EnergyEstimator.estimate(plan, Fixtures.vehicle.copy(batteryPct = 55.0, outsideTempC = 1.0)),
            EnergyEstimator.estimate(plan, Fixtures.vehicle.copy(batteryPct = 40.0, outsideTempC = -7.0)),
        )!!
        assertEquals(Verdict.OK, r.from)
        assertEquals(Verdict.SHORT, r.to)
        assertEquals("판단이 바뀌었습니다: 충분 → 부족 · 이제 약 10% 부족 (추정 7~13%)", r.message)
    }

    @Test
    fun `만약에 비교 - 김천 15분이면 아슬아슬 80퍼센트면 충분 충전 없이면 부족`() {
        val r = EnergyEstimator.compareOptions(Fixtures.plan, Fixtures.vehicle, listOf(
            WhatIfOption("그대로") { p, vv -> p to vv },
            WhatIfOption("15분") { p, vv -> p to vv.copy(batteryPct = vv.batteryPct + EnergyEstimator.chargePctInMinutes(15, 350, vv.batteryKwh)) },
            WhatIfOption("80%") { p, vv -> p to vv.copy(batteryPct = vv.batteryPct + (80 - 10.4)) },
        ))
        assertEquals(listOf(Verdict.SHORT, Verdict.TIGHT, Verdict.OK), r.map { it.verdict })
        assertEquals(21.5, r[1].arrivalPct)
        assertEquals(48.5, EnergyEstimator.chargePctInMinutes(15, 350, 77.0))
        assertEquals(26.0, EnergyEstimator.chargePctInMinutes(15, 100, 77.0))
    }

    @Test
    fun `내비 도착 잔량이 있으면 가는 길은 그 값을 쓰고 오차를 5퍼센트로 좁힌다`() {
        val e = EnergyEstimator.estimate(Fixtures.plan.copy(routeKm = 150.0, naviArrivalSocPct = 48.0), Fixtures.vehicle.copy(batteryPct = 80.0))
        assertEquals(32.0, e.drivePct)
        assertEquals(30.4 to 33.6, e.driveRange)
        assertEquals(46.3, e.arrivalPct)
        assertEquals("가는 길: 내비 도착 잔량 예측 48% 기준 (NaviHelper)", e.assumptions.first())
    }

    @Test
    fun `왕복이면 오는 길을 내비 모델 비율로 보정한다 - 공항 마중 내비 44`() {
        val plan = TripPlan("인천공항 (마중)", 52.0, 60, 20.0, emptySet(), 120, TripMode.WAIT, 52.0, naviArrivalSocPct = 44.0)
        val e = EnergyEstimator.estimate(plan, Fixtures.vehicle.copy(batteryPct = 55.0, outsideTempC = 1.0))
        assertEquals(11.0, e.outboundPct)
        assertEquals(11.0, e.returnPct)
        assertEquals(30.5, e.arrivalPct)
        assertEquals(281, e.maxWaitMinutes)
    }

    @Test
    fun `공조를 끄면 대기 소비는 0이고 가정 문구에도 그렇게 적힌다`() {
        val e = EnergyEstimator.estimate(Fixtures.plan, Fixtures.vehicle.copy(hvacOn = false))
        assertEquals(0.0, e.waitPct)
        assertTrue(e.assumptions.any { it.contains("공조 OFF → 대기 소비 0") })
    }

    @Test
    fun `차량 효율값이 있으면 기본값 대신 그 값을 쓰고 가정이 아니라고 적는다`() {
        val e = EnergyEstimator.estimate(Fixtures.plan, Fixtures.vehicle.copy(efficiencyKwhPer100km = 14.0))
        assertTrue(e.assumptions.first().contains("14.0 kWh/100km (차량 효율값)"))
        assertTrue(e.drivePct < 93.4)
    }
}

class RecommendationEngineTest {

    private val engine = RecommendationEngine()

    @Test
    fun `거울 - 기본 시나리오 후보는 김천 88 금강 82 황간 56 이다`() {
        val result = engine.rank(Fixtures.demoStops, Fixtures.input())
        assertEquals(listOf("김천휴게소", "금강휴게소", "황간휴게소"), result.map { it.stop.id })
        assertEquals(listOf(88, 82, 56), result.map { it.score })
        assertEquals(
            "필수 시설 2개 모두 충족 · 선호 3개 중 3개 · 급속 350kW · 도착 시 약 10%(보수적 3%) · 보수적으로도 한 번 충전으로 도착 · 경로에서 0.3km · 추가 2분",
            result[0].reason,
        )
        assertEquals(listOf(Amenity.BABY_CARE), result[1].unmet)
        assertEquals(listOf(Amenity.BABY_CARE, Amenity.PET_AREA), result[2].unmet)
    }

    @Test
    fun `거울 - 1위 점수 구성은 이탈 97 시설 100 충전 100 시점 0 신뢰 100 이다`() {
        val b = engine.breakdown(Fixtures.demoStops.first { it.id == "김천휴게소" }, Fixtures.input())
        assertEquals(ScoreBreakdown(97, 100, 100, 0, 100, 88, true), b)
    }

    @Test
    fun `거기서 충전해도 끝까지 못 가는 곳은 시설이 좋아도 빠진다`() {
        // 안성은 선호 시설을 전부 갖췄지만 70km 지점이라 남은 330km 를 80% 로 못 간다
        val result = engine.rank(Fixtures.demoStops, Fixtures.input())
        assertFalse(result.any { it.stop.id == "안성휴게소" })
        assertEquals(ReachableState.MORE_STOPS, engine.reachableState(Fixtures.demoStops.first { it.id == "안성휴게소" }, Fixtures.input()))
    }

    @Test
    fun `평균으로는 한 번에 가도 보수적으로 모자라면 추가 충전 가능성을 적는다`() {
        val s = Fixtures.demoStops.first { it.id == "금강휴게소" }
        assertEquals(ReachableState.ONE_STOP_LIKELY, engine.reachableState(s, Fixtures.input()))
        val reason = engine.rank(Fixtures.demoStops, Fixtures.input()).first { it.stop.id == "금강휴게소" }.reason
        assertTrue(reason.contains("한 번 충전 예상 · 추가 충전 가능성"), reason)
    }

    @Test
    fun `지금 배터리로 못 가는 곳은 후보가 아니다`() {
        assertEquals(ReachableState.UNREACHABLE, engine.reachableState(Fixtures.demoStops.first { it.id == "칠곡휴게소" }, Fixtures.input()))
    }

    @Test
    fun `한 번에 끝까지 가는 곳이 하나도 없으면 갈 수 있는 곳으로 돌아간다`() {
        // 배터리 30%: 어디서 충전해도 끝까지 못 가지만, 갈 수 있는 곳(기흥·안성)은 보여 줘야 한다
        val low = Fixtures.vehicle.copy(batteryPct = 30.0)
        val result = engine.rank(Fixtures.demoStops, Fixtures.input(low))
        assertTrue(result.isNotEmpty())
        assertTrue(result.all { it.stop.routeKm <= 95.0 })
        assertTrue(result.first().reason.contains("충전해도 한 번 더 서야 함"))
    }

    @Test
    fun `충전이 필요한 여정에서 충전기 없는 곳은 점수와 무관하게 빠진다`() {
        val result = engine.rank(Fixtures.demoStops, Fixtures.input())
        assertFalse(result.any { it.stop.chargerKw == null })
    }

    @Test
    fun `충전이 필요 없는 여정에서는 충전 축을 가중치에서 뺀다`() {
        val input = RankInput(Fixtures.plan, 0.0, needsCharge = false, tripMinutes = 0)
        val b = engine.breakdown(Fixtures.demoStops.first { it.id == "죽암휴게소" }, input)
        assertFalse(b.chargerCounted)
        assertEquals(0, b.charger)
        assertTrue(b.total > 0)
    }

    @Test
    fun `필수 시설이 없으면 점수와 무관하게 후보에서 빠진다`() {
        // 어린이 동승 → 화장실 필수. 화장실 없는 곳은 경로 바로 옆이어도 추천하면 안 된다
        val noRestroom = Fixtures.stop("화장실없음", 200.0, setOf(Amenity.PARKING, Amenity.EV_CHARGER), 350, 0.0)
        val result = engine.rank(listOf(noRestroom), RankInput(Fixtures.plan, 0.0, true, 0))
        assertTrue(result.isEmpty())
    }

    @Test
    fun `경로에서 얼마나 벗어나는지 모르면 추천하지 않는다`() {
        val unknown = Fixtures.demoStops.first { it.id == "천안 IC 밖 충전소" }
        assertTrue(engine.rank(listOf(unknown), RankInput(Fixtures.plan, 0.0, true, 0)).isEmpty())
    }

    @Test
    fun `너무 멀리 벗어나는 곳은 아예 버린다`() {
        val tooFar = Fixtures.stop("과도우회", 200.0, setOf(Amenity.RESTROOM, Amenity.PARKING, Amenity.EV_CHARGER), 200, 30.0)
        assertTrue(engine.rank(listOf(tooFar), RankInput(Fixtures.plan, 0.0, true, 0)).isEmpty())
    }

    @Test
    fun `거울 - 빠진 후보마다 이유가 하나씩 붙는다`() {
        val ex = engine.excluded(Fixtures.demoStops, Fixtures.input()).associate { it.stop.id to it.reason }
        assertEquals("충전해도 한 번 더 서야 함", ex["안성휴게소"])
        assertEquals("지금 배터리로 못 감", ex["칠곡휴게소"])
        assertEquals("충전기 없음(또는 미확인)", ex["죽암휴게소"])
        assertEquals("경로 이탈 거리 미상", ex["천안 IC 밖 충전소"])
        assertEquals(null, ex["김천휴게소"])
        assertEquals(10, ex.size)
    }

    @Test
    fun `이미 지나온 곳은 후보가 아니다`() {
        val result = engine.rank(Fixtures.demoStops, Fixtures.input(traveledKm = 100.0))
        assertTrue(result.all { it.stop.routeKm > 100.0 })
    }

    @Test
    fun `주행 중에는 후보를 셋까지만 보여 준다`() {
        val many = (1..10).map { Fixtures.stop("휴게소$it", 150.0 + it, setOf(Amenity.RESTROOM, Amenity.PARKING, Amenity.EV_CHARGER), 200, it * 0.5) }
        assertEquals(3, engine.rank(many, RankInput(Fixtures.plan, 0.0, true, 0)).size)
    }

    @Test
    fun `우회 시간을 모르면 이유에 분을 적지 않는다`() {
        // 직선거리를 시간인 것처럼 보여 주면 그건 틀린 정보다
        val reason = engine.rank(Fixtures.demoStops, Fixtures.input()).first { it.stop.id == "금강휴게소" }.reason
        assertFalse(Regex("""추가 \d+분""").containsMatchIn(reason), "실제 이유: $reason")
    }

    @Test
    fun `미충족 선호 시설은 숨기지 않고 라벨로 적는다`() {
        assertEquals("유아 편의시설, 반려동물 구역 없음", RecommendationEngine.unmetLabel(listOf(Amenity.BABY_CARE, Amenity.PET_AREA)))
        assertEquals("선호 시설 모두 있음", RecommendationEngine.unmetLabel(emptyList()))
    }
}

class BreakSchedulerTest {

    private fun v(minutes: Int) = Fixtures.vehicle.copy(tripMinutes = minutes)

    @Test
    fun `거울 - 90분 간격에서 70분은 미리 탐색 85분은 준비 95분은 권장이다`() {
        assertEquals(BreakPhase.PREFETCH, BreakScheduler.phaseOf(Fixtures.plan, v(70)))
        assertEquals(BreakPhase.READY, BreakScheduler.phaseOf(Fixtures.plan, v(85)))
        assertEquals(BreakPhase.SUGGEST, BreakScheduler.phaseOf(Fixtures.plan, v(95)))
    }

    @Test
    fun `출발 직후에는 아무것도 하지 않는다`() {
        assertEquals(BreakPhase.CRUISING, BreakScheduler.phaseOf(Fixtures.plan, v(10)))
    }

    @Test
    fun `간격을 30분으로 줄여도 같은 비율로 동작한다`() {
        // 분을 상수로 박지 않은 이유가 이것이다
        assertEquals(BreakPhase.PREFETCH, BreakScheduler.phaseOf(Fixtures.plan.copy(breakIntervalMinutes = 30), v(23)))
    }

    @Test
    fun `남은 시간은 음수가 되지 않고 나중에는 간격의 4분의 1 뒤다`() {
        assertEquals(0, BreakScheduler.minutesUntilBreak(Fixtures.plan, v(200)))
        assertEquals(22, BreakScheduler.snoozeMinutes(Fixtures.plan))
    }
}
