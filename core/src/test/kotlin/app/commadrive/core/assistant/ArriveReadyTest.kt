package app.commadrive.core.assistant

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** arrive-ready.test.ts 와 같은 값 · 같은 기대 결과 (거울 규칙) */
class ArriveReadyTest {
    // 2026-11-11(수) 14:00 KST · 약속 15:00 · 광화문 고객사
    private val now = 1_794_373_200_000L
    private val min = 60_000L
    private val goal = ArriveGoal(now + 60 * min, "광화문 고객사", GeoPoint(37.572, 126.9769), 10, true)

    private val fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneOffset.ofHours(9))
    private fun kst(ms: Long) = fmt.format(Instant.ofEpochMilli(ms))
    private fun rt(id: String, name: String, o: Map<String, String> = emptyMap()) = mapOf(
        "PKLT_CD" to id, "PKLT_NM" to name, "ADDR" to "종로구", "PKLT_TYPE" to "NW", "PRK_STTS_YN" to "1", "TPKCT" to "100", "NOW_PRK_VHCL_CNT" to "50",
        "NOW_PRK_VHCL_UPDT_TM" to kst(now - 5 * min), "WD_OPER_BGNG_TM" to "0000", "WD_OPER_END_TM" to "2400", "WE_OPER_BGNG_TM" to "0000", "WE_OPER_END_TM" to "2400",
        "LHLDY_OPER_BGNG_TM" to "0000", "LHLDY_OPER_END_TM" to "2400", "BSC_PRK_CRG" to "430", "BSC_PRK_HR" to "5",
    ) + o
    private fun info(id: String, lat: Double, lon: Double) = mapOf("PKLT_CD" to id, "LAT" to lat.toString(), "LOT" to lon.toString())
    private fun trip(id: String, m: Int?, km: Int? = 6) = TripEstimate(id, m?.let { it * 60 }, km?.let { it * 1000 }, now, true)

    private val realtime = listOf(
        rt("A", "세종로 공영주차장", mapOf("TPKCT" to "1260", "NOW_PRK_VHCL_CNT" to "626")),
        rt("B", "광화문 노상", mapOf("PKLT_TYPE" to "NS", "TPKCT" to "20", "NOW_PRK_VHCL_CNT" to "20")),
        rt("C", "종묘 주차장"),
        rt("D", "미연계 주차장", mapOf("PRK_STTS_YN" to "0")),
        rt("E", "좌표 없는 주차장"),
        rt("F", "오래된 주차장", mapOf("NOW_PRK_VHCL_UPDT_TM" to kst(now - 180 * min))),
        rt("G", "오후 1시 마감 주차장", mapOf("WD_OPER_BGNG_TM" to "0900", "WD_OPER_END_TM" to "1300")),
        rt("H", "작은 공영주차장", mapOf("TPKCT" to "30", "NOW_PRK_VHCL_CNT" to "25")),
    )
    private val infoRows = listOf(info("A", 37.5734, 126.9759), info("B", 37.5718, 126.9772), info("B", 37.5722, 126.9775), info("C", 37.5713, 126.9943), info("D", 37.5725, 126.9765),
        mapOf("PKLT_CD" to "E", "LAT" to "0", "LOT" to "0"), info("F", 37.5716, 126.9762), info("G", 37.5726, 126.977), info("H", 37.5723, 126.9768))
    private val trips = listOf("A", "B", "C", "D", "E", "F", "G", "H").map { trip(it, 25) }
    private fun input(goal: ArriveGoal = this.goal, parkings: List<ParkingFact> = ArriveReady.joinParking(realtime, infoRows, now, true), trips: List<TripEstimate> = this.trips) = ArriveInput(goal, now, parkings, trips)

    @Test fun `목표 - 약속 시각 · 위치 · 여유 · 확인이 없으면 판단하지 않고 무엇이 필요한지 말한다`() {
        assertEquals(listOf("약속 시각", "방문 장소 위치", "주차 후 여유", "약속 확인"), ArriveReady.goalMissing(ArriveGoal(null, "x", null, null, false), now))
        assertEquals(listOf("약속 시각(이미 지남)"), ArriveReady.goalMissing(goal.copy(appointmentAt = now - min), now))
        val d = ArriveReady.decide(input(goal.copy(bufferMin = null)))
        assertEquals(ArriveDecisionKind.NEEDS_INPUT, d.kind)
        assertEquals("주차 후 여유을(를) 알려 주시면 주차와 도착을 함께 볼게요", d.headline)
    }

    @Test fun `주차 정규화 - 코드로 결합 · 빈자리 = 면수 − 현재 대수 · 한국 시간`() {
        val ps = ArriveReady.joinParking(realtime, infoRows, now, true)
        assertEquals(8, ps.size)
        val a = ps.first { it.id == "A" }
        assertEquals(listOf<Any?>(634, ParkingKind.OFF_STREET, now - 5 * min, 430, 5), listOf(a.free, a.kind, a.updatedAt, a.basicFeeWon, a.basicFeeMinutes))
        assertEquals(GeoPoint(37.5734, 126.9759), a.point)
        val b = ps.first { it.id == "B" }
        assertEquals(ParkingKind.ON_STREET, b.kind)
        assertTrue((b.spreadM ?: 0) in 1 until 100)
        assertNull(ps.first { it.id == "D" }.free)
        assertNull(ps.first { it.id == "E" }.point)
        assertEquals(1_794_388_603_000L, ArriveReady.parseSeoulTime("2026-11-11 18:16:43"))
        assertNull(ArriveReady.parseSeoulTime("2026/11/11"))
        assertNull(ArriveReady.normalizeParking(mapOf("PKLT_NM" to "코드 없음"), emptyList(), now, true))
        assertNull(ArriveReady.normalizeParking(rt("X", "이상", mapOf("TPKCT" to "10", "NOW_PRK_VHCL_CNT" to "12")), emptyList(), now, true)!!.free)
    }

    @Test fun `빈자리 표시 - 20분 안의 연계 값만 판단에 쓴다`() {
        val p = ArriveReady.normalizeParking(rt("A", "a"), emptyList(), now, true)!!
        assertEquals(SpaceFact(SpaceShown.SPACES_SHOWN, FactFreshness.FRESH, 5.0), ArriveReady.spaceFact(p, now))
        assertEquals(SpaceShown.UNKNOWN, ArriveReady.spaceFact(p, now + 20 * min).shown)
        assertEquals(FactFreshness.AGING, ArriveReady.spaceFact(p, now + 20 * min).freshness)
        assertEquals(FactFreshness.STALE, ArriveReady.spaceFact(p, now + 200 * min).freshness)
        assertEquals(SpaceShown.FULL_SHOWN, ArriveReady.spaceFact(ArriveReady.normalizeParking(rt("F", "f", mapOf("NOW_PRK_VHCL_CNT" to "100")), emptyList(), now, true)!!, now).shown)
    }

    @Test fun `운영시간 - 평일 · 주말 · 자정 넘는 운영 · 시간 없음은 모름`() {
        val p = ArriveReady.normalizeParking(rt("G", "g", mapOf("WD_OPER_BGNG_TM" to "0900", "WD_OPER_END_TM" to "1300", "WE_OPER_BGNG_TM" to "2200", "WE_OPER_END_TM" to "0600")), emptyList(), now, true)!!
        assertEquals(true, ArriveReady.isOpenAt(p, now - 120 * min))
        assertEquals(false, ArriveReady.isOpenAt(p, now))
        val sat23 = 1_794_664_800_000L
        assertEquals(true, ArriveReady.isOpenAt(p, sat23))
        assertEquals(false, ArriveReady.isOpenAt(p, sat23 - 600 * min))
        assertNull(ArriveReady.isOpenAt(ArriveReady.normalizeParking(rt("N", "n", mapOf("WD_OPER_BGNG_TM" to "", "WD_OPER_END_TM" to "")), emptyList(), now, true)!!, now))
    }

    @Test fun `소요 시간 - 없거나 0 이거나 거리와 맞지 않으면 판단에 쓰지 않는다`() {
        assertEquals("내비 소요 시간을 받지 못했어요", ArriveReady.tripProblem(null))
        assertEquals("내비 소요 시간이 0으로 왔어요", ArriveReady.tripProblem(trip("A", 0)))
        assertEquals("내비 소요 시간이 거리와 맞지 않아요", ArriveReady.tripProblem(trip("A", 1, 10)))
        assertNull(ArriveReady.tripProblem(trip("A", 25, 6)))
        assertNull(ArriveReady.tripProblem(trip("A", 25, null)))
    }

    @Test fun `방문 가능성 - 남는 시간을 범위로`() {
        assertEquals(Slack(20, 25), ArriveReady.slackOf(goal, now, 25 * 60))
        assertEquals(Feasibility.ENOUGH, ArriveReady.feasibilityOf(ArriveReady.slackOf(goal, now, 25 * 60)))
        assertEquals(Slack(-2, 5), ArriveReady.slackOf(goal, now, 45 * 60))
        assertEquals(Feasibility.TIGHT, ArriveReady.feasibilityOf(ArriveReady.slackOf(goal, now, 45 * 60)))
        assertEquals(Feasibility.AT_RISK, ArriveReady.feasibilityOf(ArriveReady.slackOf(goal, now, 55 * 60)))
        assertEquals(Feasibility.UNKNOWN, ArriveReady.feasibilityOf(ArriveReady.slackOf(goal, now, null)))
    }

    @Test fun `결정 - 하나 · 순위를 가른 기준 · 남은 불확실성`() {
        val i = input()
        val d = ArriveReady.decide(i)
        assertEquals(ArriveDecisionKind.RECOMMEND, d.kind)
        assertEquals("A", d.top?.parking?.id)
        assertEquals("세종로 공영주차장에 세우면 약속 시간에 맞출 수 있어 보여요", d.headline)
        assertEquals(listOf("H"), d.alternatives.map { it.parking.id })
        assertNull(d.fasterButFar)
        assertEquals(listOf("F" to "빈자리 정보가 오래됐어요", "B" to "만차로 표시돼 있어요(13:55 기준)", "D" to "빈자리 정보가 없어요"), d.needsCheck.map { it.parking.id to it.problem })
        assertEquals(listOf("C" to "방문지에서 800m 밖", "E" to "위치를 몰라요", "G" to "도착 예정 시각에 운영하지 않아요"), d.excluded.map { it.id to it.reason })
        assertEquals("표시된 빈자리가 10면 이상이에요(작은 공영주차장은 5면)", ArriveReady.decisiveReason(d.top!!, d.alternatives[0]))
        assertEquals("약속 15:00 − 지금 14:00 − 주차장까지 약 25분(내비) − 주차 후 여유 10분(직접 설정) → 약 20~25분 남음 · 추정", ArriveReady.budgetLine(i, d.top))
        assertEquals(listOf("빈자리 634면 표시 · 13:55 기준 — 도착할 때도 있는지는 몰라요", "소요 시간은 내비 예상 그대로 · 실시간 교통 반영 여부는 확인 전", "주차장 위치는 대표 좌표 — 진입구와 다를 수 있어요"), ArriveReady.caveats(d.top!!, 10))
    }

    @Test fun `결정 - 빈자리가 많아도 약속을 맞추기 어려우면 권하지 않는다`() {
        val d = ArriveReady.decide(input(trips = trips.map { if (it.parkingId == "A") trip("A", 55) else it }))
        assertEquals("H", d.top?.parking?.id)
        assertEquals("이 주차장으로는 약속 시간을 맞추기 어려울 수 있어요", d.needsCheck.first { it.parking.id == "A" }.problem)
        val d2 = ArriveReady.decide(input(trips = trips.map { when (it.parkingId) { "A" -> trip("A", 45); "H" -> trip("H", 40); else -> it } }))
        assertEquals("세종로 공영주차장이(가) 가장 낫지만 빠듯해요", d2.headline)
    }

    @Test fun `불확실성 - 방문지에서 400m 이상이면 거리를 드러낸다`() {
        val far = ArriveReady.joinParking(listOf(rt("Z", "먼 주차장")), listOf(info("Z", 37.5785, 126.9769)), now, true)
        val d = ArriveReady.decide(input(parkings = far, trips = listOf(trip("Z", 25))))
        assertEquals(ArriveDecisionKind.RECOMMEND_WITH_CHECK, d.kind)
        assertEquals("먼 주차장이(가) 가장 낫지만 방문지까지 직선 약 720m — 걸어가는 시간 확인이 필요해요", d.headline)
        assertEquals("Z", d.top?.parking?.id)
        assertEquals("방문지까지 직선 약 720m — 걸어가는 시간이 여유 10분 안에 드는지 확인해 주세요", ArriveReady.caveats(d.top!!, 10)[2])
    }

    @Test fun `실패 상태 - 정보를 못 받음 · 오래됨 · 맞는 후보 없음을 섞지 않는다`() {
        val failed = ArriveReady.decide(input().copy(feedOk = false, feedReason = "프록시에 연결하지 못했어요"))
        assertEquals(ArriveDecisionKind.DATA_FAILED, failed.kind)
        assertEquals("주차장 정보를 확인하지 못했어요 · 프록시에 연결하지 못했어요", failed.headline)
        val stale = ArriveReady.decide(input(parkings = ArriveReady.joinParking(listOf(rt("S", "오래됨", mapOf("NOW_PRK_VHCL_UPDT_TM" to kst(now - 180 * min)))), listOf(info("S", 37.5723, 126.9768)), now, true), trips = listOf(trip("S", 25))))
        assertEquals(ArriveDecisionKind.DATA_STALE to "주차장 빈자리 정보를 최신으로 확인해야 해요", stale.kind to stale.headline)
        val none = ArriveReady.decide(input(parkings = ArriveReady.joinParking(listOf(rt("C", "종묘 주차장")), listOf(info("C", 37.5713, 126.9943)), now, true)))
        assertEquals(ArriveDecisionKind.NO_FIT to "방문지 800m 안에서 확인된 주차장이 없어요", none.kind to none.headline)
    }

    @Test fun `결정 - 소요 시간을 하나도 못 받으면 판단을 보류한다`() {
        val d = ArriveReady.decide(input(trips = emptyList()))
        assertEquals(ArriveDecisionKind.DATA_FAILED, d.kind)
        assertEquals("내비 소요 시간을 받지 못해 판단을 보류해요", d.headline)
        assertNull(d.top)
        assertTrue(d.needsCheck.all { it.problem != null })
        assertEquals("내비 소요 시간을 받지 못했어요", d.needsCheck.first { it.parking.id == "A" }.problem)
    }

    @Test fun `회귀 - 세종로 vs 동국제강 실측, 차로 빠른 것만으로 방문 목표에 맞다고 확정하지 않는다`() {
        val ps = ArriveReady.joinParking(
            listOf(rt("171721", "세종로 공영주차장(시)", mapOf("TPKCT" to "1260", "NOW_PRK_VHCL_CNT" to "579")), rt("1425816", "동국제강 공영주차장(시)", mapOf("TPKCT" to "13", "NOW_PRK_VHCL_CNT" to "3"))),
            listOf(info("171721", 37.573403, 126.975884), info("1425816", 37.567337, 126.983435)), now, true)
        val trips = listOf(TripEstimate("171721", 3882, 23432, now, true), TripEstimate("1425816", 3377, 22039, now, true))
        val d = ArriveReady.decide(ArriveInput(goal.copy(appointmentAt = now + 90 * min), now, ps, trips))
        assertEquals(ArriveDecisionKind.RECOMMEND, d.kind)
        assertEquals("171721", d.top?.parking?.id)
        assertEquals("세종로 공영주차장(시)이(가) 가장 낫지만 빠듯해요", d.headline)
        assertEquals("1425816", d.fasterButFar?.parking?.id)
        assertEquals("동국제강 공영주차장(시)은(는) 차로 약 8분 빠르지만 방문지까지 직선 약 780m — 걸어가는 시간이 여유 10분 안에 드는지 확인이 필요해요", ArriveReady.fasterButFarNote(d.top!!, d.fasterButFar!!, 10))
        assertEquals("세종로 공영주차장(시)은(는) 방문지와 가깝지만(약 180m) 남는 시간이 6~15분이고, 동국제강 공영주차장(시)은(는) 차로 약 8분 빠르지만 방문지까지 약 780m라 주차 후 이동을 확인해야 해요", ArriveReady.tradeoff(d.top!!, d.fasterButFar!!))
        val d60 = ArriveReady.decide(ArriveInput(goal.copy(appointmentAt = now + 60 * min), now, ps, trips))
        assertEquals(ArriveDecisionKind.NO_FIT, d60.kind)
        assertEquals("확인된 주차장 중 약속 시간에 맞춰 방문할 여유가 있는 후보를 찾지 못했어요", d60.headline)
        assertEquals("1425816", d60.fastest?.parking?.id)
    }

    @Test fun `다시 판단 - 결과가 의미 있게 달라질 때만 알리고 제안만`() {
        val before = ArriveReady.decide(input())
        assertEquals("A", before.top?.parking?.id)
        assertEquals(false, ArriveReady.recovery(before, null).notify)
        val small = ArriveReady.decide(input(parkings = ArriveReady.joinParking(realtime.map { if (it["PKLT_CD"] == "A") it + ("NOW_PRK_VHCL_CNT" to "660") else it }, infoRows, now, true)))
        assertEquals(ArriveRecovery(false, null, null), ArriveReady.recovery(small, "A"))
        val full = ArriveReady.decide(input(parkings = ArriveReady.joinParking(realtime.map { if (it["PKLT_CD"] == "A") it + ("NOW_PRK_VHCL_CNT" to "1260") else it }, infoRows, now, true)))
        val r = ArriveReady.recovery(full, "A")
        assertEquals(true, r.notify)
        assertEquals("안내 중인 주차장 · 만차로 표시돼 있어요(13:55 기준)", r.reason)
        assertEquals("H", r.suggestion?.parking?.id)
        val failed = ArriveReady.decide(input().copy(feedOk = false))
        assertEquals("주차장 정보를 확인하지 못했어요 · 안내 중인 경로는 그대로예요", ArriveReady.recovery(failed, "A").reason)
        val tight = ArriveReady.decide(input(trips = trips.map { if (it.parkingId == "H") trip("H", 45) else it }))
        assertEquals("A", tight.top?.parking?.id)
        val routedH = ArriveReady.recovery(tight, "H")
        assertEquals(true, routedH.notify)
        assertEquals("세종로 공영주차장이(가) 약속까지 여유가 더 있어요 · 지금 안내 중인 곳도 쓸 수 있어요", routedH.reason)
    }

    @Test fun `400m 는 확인 필요 수준을 나누는 임시 경계 - 390m 와 410m 후보가 둘 다 화면에 남는다`() {
        val dest = goal.place!!
        fun north(m: Int) = GeoPoint(dest.lat + m / 111_000.0, dest.lon)
        val ps = ArriveReady.joinParking(listOf(rt("N390", "390m 주차장"), rt("N410", "410m 주차장")), listOf(info("N390", north(390).lat, north(390).lon), info("N410", north(410).lat, north(410).lon)), now, true)
        val g = goal.copy(appointmentAt = now + 50 * min)
        val d = ArriveReady.decide(ArriveInput(g, now, ps, listOf(trip("N390", 30), trip("N410", 20))))
        assertEquals(ArriveDecisionKind.RECOMMEND, d.kind)
        assertEquals("N390", d.top?.parking?.id)
        assertEquals("N410", d.fasterButFar?.parking?.id)
        assertTrue(ArriveReady.tradeoff(d.top!!, d.fasterButFar!!).contains("차로 약 10분 빠르지만"))
        val same = ArriveReady.decide(ArriveInput(g, now, ps, listOf(trip("N390", 20), trip("N410", 20))))
        assertEquals("N390", same.top?.parking?.id)
        assertNull(same.fasterButFar)
        assertEquals(listOf("N410"), same.alternatives.map { it.parking.id })
    }

    @Test fun `실행 중인 계획 기준 - 유지 · 빠듯하지만 유지 · 바꾸기 제안 · 대안 없음 · 판단 불가를 나눈다`() {
        val base = ArriveReady.decide(input())
        val none0 = ArriveReady.planStatus(base, null, null)
        assertEquals(PlanChange.NO_PLAN to base.headline, none0.change to none0.headline)
        assertEquals("A", base.top?.parking?.id)
        val keep = ArriveReady.planStatus(base, "H", "작은 공영주차장")
        assertEquals(listOf<Any?>(PlanChange.KEEP, "지금 경로를 유지해도 괜찮아 보여요", "안내 중 · 작은 공영주차장 · 지금 확인된 정보로는 경로를 바꿀 이유가 없어요", "H", "A"),
            listOf(keep.change, keep.headline, keep.detail, keep.routed?.parking?.id, keep.best?.parking?.id))
        assertEquals(false, keep.recovery.notify)
        val full = ArriveReady.decide(input(parkings = ArriveReady.joinParking(realtime.map { if (it["PKLT_CD"] == "A") it + ("NOW_PRK_VHCL_CNT" to "1260") else it }, infoRows, now, true)))
        val sw = ArriveReady.planStatus(full, "A", "세종로 공영주차장")
        assertEquals(listOf<Any?>(PlanChange.SUGGEST_CHANGE, "안내 중인 주차장을 바꾸는 것이 좋아 보여요", "안내 중인 주차장 · 만차로 표시돼 있어요(13:55 기준)", null, "H"),
            listOf(sw.change, sw.headline, sw.detail, sw.routed, sw.recovery.suggestion?.parking?.id))
        val tight = ArriveReady.decide(input(trips = trips.map { if (it.parkingId == "H") trip("H", 45) else it }))
        assertEquals("지금 경로도 쓸 수 있지만 바꾸면 여유가 더 있어요", ArriveReady.planStatus(tight, "H", "작은 공영주차장").headline)
        val onlyA = ArriveReady.decide(input(parkings = ArriveReady.joinParking(listOf(realtime[0] + ("NOW_PRK_VHCL_CNT" to "1260")), infoRows, now, true)))
        val noAlt = ArriveReady.planStatus(onlyA, "A", "세종로 공영주차장")
        assertEquals(PlanChange.ROUTED_PROBLEM to null, noAlt.change to noAlt.recovery.suggestion)
        val allTight = ArriveReady.decide(input(trips = trips.map { trip(it.parkingId, 45) }))
        val kt = ArriveReady.planStatus(allTight, "A", "세종로 공영주차장")
        assertEquals(PlanChange.KEEP_TIGHT to "지금 경로로 갈 수 있지만 빠듯해요", kt.change to kt.headline)
        val failed = ArriveReady.planStatus(ArriveReady.decide(ArriveInput(goal, now, emptyList(), emptyList(), false, null)), "A", "세종로 공영주차장")
        assertEquals(listOf<Any?>(PlanChange.CANNOT_JUDGE, "지금은 판단할 정보가 부족해요 · 안내 중인 경로는 그대로예요", "주차장 정보를 확인하지 못했어요"), listOf(failed.change, failed.headline, failed.detail))
        val stale = ArriveReady.decide(input(parkings = ArriveReady.joinParking(realtime.map { if (it["PKLT_CD"] == "A") it + ("NOW_PRK_VHCL_UPDT_TM" to kst(now - 180 * min)) else it }, infoRows, now, true)))
        val st = ArriveReady.planStatus(stale, "A", "세종로 공영주차장")
        assertEquals(PlanChange.CANNOT_JUDGE to "세종로 공영주차장 · 빈자리 정보가 오래됐어요", st.change to st.detail)
        assertEquals("안내 중인 사라진 주차장을(를) 이번 정보에서 확인하지 못했어요", ArriveReady.planStatus(base, "Z", "사라진 주차장").detail)
    }
}
