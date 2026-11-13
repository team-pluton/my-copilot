package app.commadrive.core.assistant

import app.commadrive.core.Amenity
import app.commadrive.core.DriveMode
import app.commadrive.core.PassengerType
import app.commadrive.core.TripPlan
import app.commadrive.core.VehicleSnapshot
import java.io.File
import kotlin.math.roundToInt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** V6 — T01~T17 + TS 와 같은 계약 파일(contracts/v6). 충전기 값은 전부 시연(MOCK)이다. v6-integration.test.ts 의 거울 */
class V6IntegrationTest {
    private val now = 1_793_761_200_000L // 2026-11-04 12:00 KST
    private val plan = TripPlan("부산", 400.0, 40, 20.0, setOf(PassengerType.CHILD, PassengerType.PET), 90)
    private val snapshot = VehicleSnapshot(68.0, 77.0, null, true, 6.0, DriveMode.NORMAL, 0, 0.0, false)

    private fun vehicle(soc: Double? = 68.0, cap: Double? = 77400.0, readAt: Long? = now - 1000) =
        JourneyFact.normalizeVehicle(VehicleEnergyRaw(soc, cap, readAt, DataEvidence.VEHICLE, FactAvailability.OK), now)

    private fun rows(over: Map<String, Map<String, String>> = emptyMap()) =
        Corridor.mockChargerRows(now, over).mapNotNull { ChargerData.normalize(it, now - 60_000, DataEvidence.MOCK) }

    private fun input(
        powertrain: Powertrain = Powertrain.EV, v: Fact<VehicleEnergy> = vehicle(), p: TripPlan = plan, traveled: Double = 0.0,
        chargers: ChargerFeed = ChargerFeed(FactAvailability.OK, null, rows()), rejected: List<String> = emptyList(), stops: List<CorridorStop> = Corridor.MOCK_STOPS,
    ) = DecisionInput(powertrain, v, snapshot, p, traveled, Connector.DC_COMBO, stops, chargers, now, rejected)

    private fun tsv(name: String): List<Map<String, String>> {
        val lines = File("../contracts/v6/$name").readLines(Charsets.UTF_8).filter { it.isNotEmpty() }
        val cols = lines.first().split("\t")
        return lines.drop(1).map { l -> val v = l.split("\t"); cols.mapIndexed { i, c -> c to (v.getOrNull(i) ?: "") }.toMap() }
    }

    @Test fun `T01 차량 값 정규화 — Wh 는 kWh 로 · 말이 안 되면 버린다`() {
        assertEquals(77.4, JourneyFact.capacityToKwh(77400.0))
        assertEquals(77.4, JourneyFact.capacityToKwh(77.4))
        assertNull(JourneyFact.capacityToKwh(5.0))
        assertEquals(VehicleEnergy(68.0, 77.4), vehicle().value)
        assertNull(vehicle(140.0).value)
        assertEquals(FactFreshness.STALE, vehicle(readAt = now - 3_600_000).meta.freshness)
    }

    @Test fun `T02 T03 충전이 필요 없으면 추천도 외부 조회도 없다`() {
        val i = input(v = vehicle(100.0, 200000.0), p = plan.copy(routeKm = 100.0, waitMinutesAfterArrival = 0))
        assertFalse(IntegratedDecision.needsChargerLookup(i))
        val d = IntegratedDecision.decide(i)
        assertEquals(DecisionKind.NO_CHARGE_NEEDED, d.kind)
        assertNull(d.top)
        assertFalse(d.usedChargerData)
        assertTrue(IntegratedDecision.needsChargerLookup(input()))
    }

    @Test fun `47퍼센트 부족 시연값은 기존 엔진 그대로`() {
        assertEquals(47, IntegratedDecision.decide(input(v = vehicle(68.0, 77000.0))).shortfallPct!!.roundToInt())
    }

    @Test fun `T04 닿지 못하는 곳은 추천하지 않는다`() {
        val d = IntegratedDecision.decide(input(v = vehicle(40.0)))
        assertNotEquals("gimcheon", d.top?.stopId)
        assertTrue(d.excluded.any { it.stopId == "gimcheon" && "닿지 못할" in it.reason })
    }

    @Test fun `T06 받은 지 오래된 상태는 불확실`() {
        val old = Corridor.mockChargerRows(now).mapNotNull { ChargerData.normalize(it, now - 3_600_000, DataEvidence.CACHED) }
        val a = ChargerData.assess(old, listOf("MOCK0003"), Connector.DC_COMBO, now)
        assertEquals(StationVerdict.NEEDS_CHECK to FactFreshness.STALE, a.verdict to a.freshness)
        assertEquals(DecisionKind.NO_RELIABLE, IntegratedDecision.decide(input(chargers = ChargerFeed(FactAvailability.OK, null, old))).kind)
    }

    @Test fun `T07 충전소 충전기 ID 를 쌍으로`() {
        val a = ChargerData.normalize(mapOf("statId" to "A", "chgerId" to "01", "stat" to "2", "chgerType" to "04", "statUpdDt" to "20261104115000"), now, DataEvidence.MOCK)!!
        val b = ChargerData.normalize(mapOf("statId" to "B", "chgerId" to "01", "stat" to "5", "chgerType" to "04", "statUpdDt" to "20261104115000"), now, DataEvidence.MOCK)!!
        assertEquals(2, ChargerData.dedupe(listOf(a, b)).size)
        assertEquals(1, ChargerData.assess(listOf(a, b), listOf("A"), Connector.DC_COMBO, now).availableCount)
        assertEquals(StationVerdict.EXCLUDED, ChargerData.assess(listOf(a, b), listOf("B"), Connector.DC_COMBO, now).verdict)
        val merged = ChargerData.applyStatusDelta(listOf(a), listOf(mapOf("statId" to "A", "chgerId" to "01", "stat" to "5", "statUpdDt" to "20261104100000")), now, DataEvidence.LIVE_API)
        assertEquals(ChargerStatus.AVAILABLE, merged.single().availabilityStatus)
    }

    @Test fun `T08 시설이 확인되지 않으면 충족이라 하지 않는다`() {
        val r = IntegratedDecision.decide(input(stops = Corridor.stops(mapOf("hwanggan" to listOf("MOCK0003"), "jukam" to listOf("MOCK0002")))))
        assertTrue(Amenity.BABY_CARE in r.top!!.familyUnknown)
        assertFalse(Amenity.BABY_CARE in r.top!!.familyConfirmed)
        val noRestroom = Corridor.MOCK_STOPS.map { s -> s.copy(facilities = s.facilities.filterKeys { it == Amenity.PARKING }) }
        val n = IntegratedDecision.decide(input(stops = noRestroom))
        assertEquals(DecisionKind.NO_RELIABLE, n.kind)
        assertTrue(n.needsCheck.all { "필수 시설 미확인" in it.reasons.first() })
    }

    @Test fun `T09 우회 시간을 모르면 숫자가 없다`() {
        val d = IntegratedDecision.decide(input())
        assertNull(d.top!!.detourMinutes)
        assertTrue((listOf(d.headline, d.detail) + d.top!!.reasons).none { Regex("""추가 \d+분|우회 \d+""").containsMatchIn(it) })
    }

    @Test fun `T10 API 실패 — 믿을 추천 없음, 에너지 판단은 유지`() {
        val d = IntegratedDecision.decide(input(chargers = ChargerFeed(FactAvailability.FAILED, "503", emptyList())))
        assertEquals(DecisionKind.NO_RELIABLE, d.kind)
        assertNull(d.top)
        assertEquals(IntegratedDecision.decide(input()).shortfallPct, d.shortfallPct)
        assertTrue(d.needsCheck.all { it.station.evidence == DataEvidence.UNKNOWN && it.station.availableCount == 0 })
    }

    private val target = NaviPlace("황간휴게소", 36.2211, 127.9245, null)
    private val other = NaviPlace("기존 경유지", 35.1, 129.0, "x")
    private val other2 = NaviPlace("기존 경유지 2", 35.5, 128.5, "y")
    private fun wp(vararg es: WaypointEvent) = es.fold(WaypointState(), WaypointHandoff::reduce)
    private val start = WaypointEvent.Start(1, target)

    @Test fun `T11 경로·슬롯을 읽기 전에는 보낼 상태가 아니다`() {
        assertFalse(WaypointHandoff.shouldSend(WaypointState()))
        assertFalse(WaypointHandoff.shouldSend(wp(start)))
        assertEquals(WaypointPhase.NO_ROUTE, wp(start, WaypointEvent.Lookup(1, false, emptyList())).phase)
        assertEquals(WaypointPhase.FAILED, wp(start, WaypointEvent.Lookup(1, null, emptyList())).phase)
        assertTrue(WaypointHandoff.shouldSend(wp(start, WaypointEvent.Lookup(1, true, emptyList()))))
    }

    @Test fun `T12 콜백·재조회 없이 성공이라 하지 않는다`() {
        val sent = wp(start, WaypointEvent.Lookup(1, true, emptyList()))
        assertEquals(WaypointPhase.PENDING, WaypointHandoff.reduce(sent, WaypointEvent.Ack(1)).phase)
        assertEquals(WaypointPhase.PENDING, WaypointHandoff.reduce(sent, WaypointEvent.WaypointsRead(1, emptyList())).phase)
        assertEquals(WaypointPhase.UNKNOWN_OUTCOME, WaypointHandoff.reduce(sent, WaypointEvent.Timeout(1)).phase)
        val acked = WaypointHandoff.reduce(sent, WaypointEvent.Ack(1))
        assertEquals(WaypointPhase.FAILED, WaypointHandoff.reduce(acked, WaypointEvent.WaypointsRead(1, emptyList())).phase)
        val ok = WaypointHandoff.reduce(acked, WaypointEvent.WaypointsRead(1, listOf(target)))
        assertEquals(WaypointPhase.VERIFIED, ok.phase)
        assertTrue("내비가 확인함" in ok.message!!)
        assertFalse(WaypointHandoff.reduce(sent, WaypointEvent.Ack(9)).acked)
    }

    @Test fun `T12b 에뮬레이터 실측 — 콜백 없음 좌표 0 늦은 목록`() {
        val sent = wp(start, WaypointEvent.Lookup(1, true, emptyList()))
        val unknown = WaypointHandoff.reduce(sent, WaypointEvent.Timeout(1))
        assertEquals(WaypointPhase.UNKNOWN_OUTCOME, WaypointHandoff.reduce(unknown, WaypointEvent.WaypointsRead(1, emptyList())).phase)
        val zero = NaviPlace("황간휴게소", 0.0, 0.0, null)
        assertEquals(WaypointPhase.VERIFIED, WaypointHandoff.reduce(unknown, WaypointEvent.WaypointsRead(1, listOf(zero))).phase)
        val gaveUp = WaypointHandoff.reduce(unknown, WaypointEvent.GiveUp(1))
        assertEquals(WaypointPhase.FAILED, gaveUp.phase)
        assertTrue("다시 보내지 않았어요" in gaveUp.message!!)
        assertEquals(WaypointPhase.VERIFIED, wp(start, WaypointEvent.Lookup(1, true, listOf(zero))).phase)
        assertFalse(WaypointHandoff.sameWaypoint(NaviPlace("A", 0.0, 0.0, null), NaviPlace("B", 0.0, 0.0, null)))
    }

    @Test fun `T13 기존 경유지를 임의로 지우지 않는다`() {
        val full = wp(start, WaypointEvent.Lookup(1, true, listOf(other, other2)))
        assertEquals(WaypointPhase.SLOTS_FULL, full.phase)
        assertFalse(WaypointHandoff.shouldSend(full))
        assertTrue("그대로" in WaypointHandoff.reduce(full, WaypointEvent.Cancel).message!!)
        val acked = WaypointHandoff.reduce(WaypointHandoff.reduce(full, WaypointEvent.ChooseReplace(1, 1)), WaypointEvent.Ack(1))
        assertTrue("내비가 확인함" in WaypointHandoff.reduce(acked, WaypointEvent.WaypointsRead(1, listOf(other, target))).message!!)
        assertTrue("목록에 없는 기존 경유지" in WaypointHandoff.reduce(acked, WaypointEvent.WaypointsRead(1, listOf(target))).message!!)
    }

    @Test fun `T14 추천이 그대로면 다시 묻지 않는다`() {
        val before = IntegratedDecision.decide(input())
        val minor = IntegratedDecision.decide(input(chargers = ChargerFeed(FactAvailability.OK, null, rows(mapOf("MOCK0003/02" to mapOf("stat" to "3"))))))
        assertFalse(IntegratedDecision.replanNotice(before, minor).changed)
        val after = IntegratedDecision.decide(input(chargers = ChargerFeed(FactAvailability.OK, null, rows(mapOf("MOCK0003/01" to mapOf("stat" to "5"), "MOCK0003/02" to mapOf("stat" to "5"))))))
        val n = IntegratedDecision.replanNotice(before, after)
        assertTrue(n.changed)
        assertTrue("황간휴게소: 충전기가 모두 점검" in n.message!!)
        assertTrue("금강휴게소" in n.message!!)
    }

    @Test fun `T15 근거 등급이 섞이지 않는다`() {
        val top = IntegratedDecision.decide(input()).top!!
        assertEquals(DataEvidence.MOCK, top.station.evidence)
        assertEquals("배터리 차량 정보 · 충전기 시연 데이터 · 위치 시연 데이터", IntegratedDecision.evidenceLine(top, vehicle()))
    }

    @Test fun `T16 EV 전용 계산은 다른 동력원에 쓰지 않는다`() {
        for (p in listOf(Powertrain.PHEV, Powertrain.HEV, Powertrain.ICE, Powertrain.UNKNOWN)) {
            assertEquals(DecisionKind.NOT_APPLICABLE, IntegratedDecision.decide(input(powertrain = p)).kind)
            assertFalse(IntegratedDecision.needsChargerLookup(input(powertrain = p)))
        }
    }

    @Test fun `T17 주행 중엔 한 줄뿐, 고를 수 없다`() {
        val d = IntegratedDecision.decide(input())
        assertEquals(DecisionSurface.Full, IntegratedDecision.surface(d, true))
        assertTrue(IntegratedDecision.surface(d, false) is DecisionSurface.OneLine)
        assertFalse(IntegratedDecision.canPickStop(d, d.top!!.stopId, false))
        assertTrue(IntegratedDecision.canPickStop(d, d.top!!.stopId, true))
        assertFalse(IntegratedDecision.canPickStop(d, "gimcheon", true))
    }

    @Test fun `구간 목록은 원본 CSV 와 같다`() {
        val csv = File("../docs/data/rest-stops.csv").readLines(Charsets.UTF_8).drop(1).filter { it.isNotBlank() }.map { it.split(",") }
        assertEquals(csv.map { listOf(it[0], it[1], it[2]) }, Corridor.ROWS.map { listOf(it.id, it.name, it.routeKm.roundToInt().toString()) })
    }

    @Test fun `계약 — 충전기 정규화`() {
        for (c in tsv("charger-normalize.tsv")) {
            val r = ChargerData.normalize(mapOf("statId" to c["statId"], "chgerId" to c["chgerId"], "statNm" to c["statNm"], "chgerType" to c["chgerType"], "powerType" to c["powerType"], "stat" to c["stat"], "statUpdDt" to c["statUpdDt"], "lat" to c["lat"], "lng" to c["lng"], "parkingFree" to c["parkingFree"], "note" to c["note"]), now, DataEvidence.MOCK)
            val name = c.getValue("case")
            if (c["exp_key"] == "-") { assertNull(r, name); continue }
            assertEquals(c["exp_key"], r!!.key, name)
            assertEquals(c["exp_connectors"], r.connectors?.joinToString(",") ?: "?", name)
            assertEquals(c.getValue("exp_kw"), r.outputKw?.let { if (it == Math.floor(it)) it.toLong().toString() else it.toString() } ?: "?", name)
            assertEquals(c["exp_status"], r.availabilityStatus.name, name)
            assertEquals(c["exp_updated_ms"], r.statusUpdatedAt?.toString() ?: "?", name)
            assertEquals(c["exp_lat"], r.latitude?.toString() ?: "?", name)
            assertEquals(c["exp_parking"], r.parkingFree?.toString() ?: "?", name)
            assertEquals(c["exp_note"], r.accessRestrictions ?: "-", name)
        }
    }

    @Test fun `계약 — 통합 판단`() {
        for (c in tsv("decision-cases.tsv")) {
            val name = c.getValue("case")
            val over = mutableMapOf<String, Map<String, String>>()
            if (c["rows"] != "-") for (p in c.getValue("rows").split(";")) {
                val (k, v) = p.split("=")
                val parts = v.split(":")
                over[k] = if (parts.size > 1) mapOf("stat" to parts[0], "chgerType" to parts[1]) else mapOf("stat" to parts[0])
            }
            val passengers = if (c["passengers"] == "-") emptySet() else c.getValue("passengers").split(",").map { PassengerType.valueOf(it) }.toSet()
            val p = plan.copy(passengers = passengers).let { if (name == "충전-불필요") it.copy(routeKm = 100.0, waitMinutesAfterArrival = 0) else it }
            val d = IntegratedDecision.decide(input(
                Powertrain.valueOf(c.getValue("powertrain")), vehicle(c.getValue("soc").toDouble(), c.getValue("capacity").toDouble()), p, c.getValue("traveled").toDouble(),
                if (c["feed"] == "OK") ChargerFeed(FactAvailability.OK, null, rows(over)) else ChargerFeed(FactAvailability.FAILED, "503", emptyList()),
                if (c["rejected"] == "-") emptyList() else c.getValue("rejected").split(","),
            ))
            assertEquals(c["exp_kind"], d.kind.name, name)
            assertEquals(c["exp_top"], d.top?.stopId ?: "-", name)
            assertEquals(c["exp_alts"], d.alternatives.joinToString(",") { it.stopId }.ifEmpty { "-" }, name)
            assertEquals(c["exp_check"], d.needsCheck.joinToString(",") { it.stopId }.ifEmpty { "-" }, name)
        }
    }

    @Test fun `E28 D6 - 시계 오차 보정과 신선도는 따로, 몇 초 미래는 나이 0, 5분 넘게 미래는 모름, 과거 값의 나이는 그대로`() {
        val now = 1_794_383_120_000L
        assertEquals(FactFreshness.FRESH, JourneyFact.freshnessOf(now + 2_000L, now))
        assertEquals(FactFreshness.UNKNOWN, JourneyFact.freshnessOf(now + 6 * 60_000L, now))
        assertEquals(FactFreshness.AGING, JourneyFact.freshnessOf(now - 11 * 60_000L, now))
        assertEquals(FactFreshness.STALE, JourneyFact.freshnessOf(now - 35 * 60_000L, now))
        assertEquals(0.0, JourneyFact.ageMinutes(now + 2_000L, now))
        assertEquals(35.0, JourneyFact.ageMinutes(now - 35 * 60_000L, now))
    }

    @Test fun `권할 곳이 없을 때 원인을 섞지 않는다 - 연결 실패 · 오래됨 · 조건 미충족 · 후보 없음`() {
        assertEquals("충전소 정보를 확인하지 못했어요", IntegratedDecision.noReliableHeadline(true, emptyList()))
        assertEquals("충전소 상태를 다시 확인해야 해요", IntegratedDecision.noReliableHeadline(false, listOf("상태 정보를 받은 지 오래됐어요", "상태 정보를 받은 지 오래됐어요")))
        assertEquals("지금 조건에서는 충전소를 추천하기 어려워요", IntegratedDecision.noReliableHeadline(false, listOf("상태 정보를 받은 지 오래됐어요", "충전 규격을 확인하지 못했어요")))
        assertEquals("현재 조건에 맞는 충전소를 찾지 못했어요", IntegratedDecision.noReliableHeadline(false, emptyList()))
        assertEquals("현재 배터리로 도달 가능한 후보가 확인되지 않았어요", IntegratedDecision.noReliableHeadline(false, emptyList(), listOf("지금 배터리로 닿지 못할 수 있어요", "지금 배터리로 닿지 못할 수 있어요")))
        assertEquals("현재 조건에 맞는 충전소를 찾지 못했어요", IntegratedDecision.noReliableHeadline(false, emptyList(), listOf("지금 배터리로 닿지 못할 수 있어요", "필수 시설 없음: 화장실")))
        assertEquals("충전소 정보를 확인하지 못했어요", IntegratedDecision.noReliableHeadline(true, emptyList(), listOf("지금 배터리로 닿지 못할 수 있어요")))
    }
}
