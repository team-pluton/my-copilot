package app.commadrive.core.assistant

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** arrive-handoff.test.ts 와 같은 값 — 세종로 · 동국제강 실측(2026-11-11)으로 승인 → 재검증 → 내비 → 재조회 */
class ArriveHandoffTest {
    private val now = 1_794_373_200_000L
    private val min = 60_000L
    private val fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneOffset.ofHours(9))
    private fun rt(id: String, name: String, total: String, cnt: String) = mapOf(
        "PKLT_CD" to id, "PKLT_NM" to name, "ADDR" to "종로구", "PKLT_TYPE" to "NW", "PRK_STTS_YN" to "1", "TPKCT" to total, "NOW_PRK_VHCL_CNT" to cnt,
        "NOW_PRK_VHCL_UPDT_TM" to fmt.format(Instant.ofEpochMilli(now - 5 * min)), "WD_OPER_BGNG_TM" to "0000", "WD_OPER_END_TM" to "2400", "WE_OPER_BGNG_TM" to "0000", "WE_OPER_END_TM" to "2400",
        "LHLDY_OPER_BGNG_TM" to "0000", "LHLDY_OPER_END_TM" to "2400", "BSC_PRK_CRG" to "430", "BSC_PRK_HR" to "5",
    )
    private val info = listOf(mapOf("PKLT_CD" to "171721", "LAT" to "37.573403", "LOT" to "126.975884"), mapOf("PKLT_CD" to "1425816", "LAT" to "37.567337", "LOT" to "126.983435"))
    private val trips = listOf(TripEstimate("171721", 3882, 23432, now, true), TripEstimate("1425816", 3377, 22039, now, true))
    private val goal = ArriveGoal(now + 90 * min, "광화문 고객사", GeoPoint(37.572, 126.9769), 10, true)
    private fun input(sejong: String = "579", feedOk: Boolean = true, reason: String? = null) =
        ArriveInput(goal, now, ArriveReady.joinParking(listOf(rt("171721", "세종로 공영주차장(시)", "1260", sejong), rt("1425816", "동국제강 공영주차장(시)", "13", "3")), info, now, true), trips, feedOk, reason)
    private val key = ArriveHandoff.goalKeyOf(goal.appointmentAt, goal.place, goal.bufferMin)
    private val v = ArriveHandoff.RULE_VERSION
    private val sejong = NaviPlace("세종로 공영주차장(시)", 37.573403, 126.975884, null)
    private fun run(s: ArriveHandoffState, vararg es: ArriveHandoffEvent) = es.fold(s) { acc, e -> ArriveHandoff.reduce(acc, e) }
    private val idle = ArriveHandoffState()

    @Test fun `승인 때 후보 ID · 좌표 · 정보 시각 · 판단 버전 · 목표를 고정한다`() {
        val a = ArriveHandoff.approvalOf(ArriveReady.decide(input()).top!!, key, now)
        assertEquals(ArriveApproval("171721", "세종로 공영주차장(시)", GeoPoint(37.573403, 126.975884), now - 5 * min, v, key, now), a)
    }

    @Test fun `실행 직전 다시 검증 - 목표 · 규칙 · 정보 실패 · 조건 미충족 · 위치 변경이면 보내지 않는다`() {
        val d = ArriveReady.decide(input())
        val a = ArriveHandoff.approvalOf(d.top!!, key, now)
        assertNull(ArriveHandoff.revalidate(a, d, key, v))
        assertEquals("약속이나 방문지가 바뀌었어요 · 다시 판단한 결과를 확인해 주세요", ArriveHandoff.revalidate(a, d, ArriveHandoff.goalKeyOf(goal.appointmentAt!! + 30 * min, goal.place, 10), v))
        assertEquals("판단 규칙이 바뀌었어요 · 다시 판단한 결과를 확인해 주세요", ArriveHandoff.revalidate(a, d, key, "arrive-v9"))
        assertEquals("주차장 정보를 확인하지 못했어요 · 프록시에 연결하지 못했어요", ArriveHandoff.revalidate(a, ArriveReady.decide(input(feedOk = false, reason = "프록시에 연결하지 못했어요")), key, v))
        assertEquals("승인한 세종로 공영주차장(시)이(가) 지금은 조건을 맞추지 못해요 · 만차로 표시돼 있어요(13:55 기준)", ArriveHandoff.revalidate(a, ArriveReady.decide(input("1260")), key, v))
        assertNull(ArriveHandoff.revalidate(ArriveHandoff.approvalOf(d.fasterButFar!!, key, now), d, key, v))
        assertEquals("주차장 위치 정보가 바뀌었어요 · 다시 확인해 주세요", ArriveHandoff.revalidate(a.copy(point = GeoPoint(a.point.lat + 0.002, a.point.lon)), d, key, v))
    }

    @Test fun `승인 → 재검증 → 요청 → 콜백 → 재조회 같은 곳 = 경로 설정됨(주차 · 방문 완료 아님)`() {
        val d = ArriveReady.decide(input())
        var s = run(idle, ArriveHandoffEvent.Approve(1, ArriveHandoff.approvalOf(d.top!!, key, now)))
        assertEquals(ArrivePhase.REVALIDATING, s.phase)
        assertEquals("실행 전에 주차 정보와 소요 시간을 다시 확인하는 중", ArriveHandoff.stepLabel(s))
        assertEquals(1, ArriveHandoff.reduce(s, ArriveHandoffEvent.Approve(2, ArriveHandoff.approvalOf(d.top!!, key, now))).requestId)
        s = run(s, ArriveHandoffEvent.Revalidated(1, d, key, v), ArriveHandoffEvent.Lookup(1, null, true))
        assertEquals(ArrivePhase.PENDING, s.phase)
        assertTrue(ArriveHandoff.shouldSend(s))
        s = run(s, ArriveHandoffEvent.DestinationRead(1, NaviPlace("강남역", 37.4979, 127.0276, "x")))
        assertEquals(ArrivePhase.PENDING, s.phase)
        s = run(s, ArriveHandoffEvent.RouteStarted(1))
        assertFalse(ArriveHandoff.shouldSend(s))
        assertEquals(ArrivePhase.PENDING, ArriveHandoff.reduce(s, ArriveHandoffEvent.DestinationRead(9, sejong)).phase)
        s = run(s, ArriveHandoffEvent.DestinationRead(1, sejong.copy(lat = sejong.lat + 0.0003)))
        assertEquals(ArrivePhase.ROUTE_SET, s.phase)
        assertEquals("내비 목적지를 세종로 공영주차장(시)(으)로 설정했어요 · 내비가 확인함 · 주차 · 방문은 아직 기록하지 않아요", s.message)
    }

    @Test fun `기존 목적지가 있으면 묻는다 - 거절하면 그대로 · 승인해야 보낸다 · 이미 같은 곳이면 보내지 않는다`() {
        val d = ArriveReady.decide(input())
        val looking = run(idle, ArriveHandoffEvent.Approve(1, ArriveHandoff.approvalOf(d.top!!, key, now)), ArriveHandoffEvent.Revalidated(1, d, key, v))
        val ask = ArriveHandoff.reduce(looking, ArriveHandoffEvent.Lookup(1, NaviPlace("광화문 고객사", 37.572, 126.9769, "p1"), true))
        assertEquals(ArrivePhase.CONFIRM_REPLACE, ask.phase)
        assertEquals("지금 안내 중인 광화문 고객사 경로가 세종로 공영주차장(시) 경로로 바뀌어요", ask.message)
        assertFalse(ArriveHandoff.shouldSend(ask))
        assertEquals(ArriveHandoffState(message = "기존 경로를 그대로 둡니다"), ArriveHandoff.reduce(ask, ArriveHandoffEvent.Cancel))
        assertEquals(ArrivePhase.PENDING, ArriveHandoff.reduce(ask, ArriveHandoffEvent.ConfirmReplace(1)).phase)
        assertEquals(ArrivePhase.ROUTE_SET, ArriveHandoff.reduce(looking, ArriveHandoffEvent.Lookup(1, sejong, true)).phase)
        assertEquals(ArrivePhase.FAILED, ArriveHandoff.reduce(looking, ArriveHandoffEvent.Lookup(1, null, false)).phase)
    }

    @Test fun `실패 · 미확인을 나눈다 - 오류는 실패, 응답 없음은 미확인, 재검증 실패는 보내지 않음`() {
        val d = ArriveReady.decide(input())
        val a = ArriveHandoff.approvalOf(d.top!!, key, now)
        val pending = run(idle, ArriveHandoffEvent.Approve(1, a), ArriveHandoffEvent.Revalidated(1, d, key, v), ArriveHandoffEvent.Lookup(1, null, true))
        val err = ArriveHandoff.reduce(pending, ArriveHandoffEvent.Error(1, NaviError.CAUSE_SEARCH_ROUTE))
        assertEquals(ArrivePhase.FAILED, err.phase)
        assertEquals("내비가 경로를 찾지 못했습니다 · 기존 경로는 그대로입니다", err.message)
        val unknown = ArriveHandoff.reduce(pending, ArriveHandoffEvent.Timeout(1))
        assertEquals(ArrivePhase.UNKNOWN_OUTCOME, unknown.phase)
        assertFalse(ArriveHandoff.shouldSend(unknown))
        assertEquals("응답 없음 · 결과 미확인", ArriveHandoff.stepLabel(unknown))
        assertEquals(1, ArriveHandoff.reduce(unknown, ArriveHandoffEvent.Approve(2, a)).requestId)
        val late = ArriveHandoff.reduce(unknown, ArriveHandoffEvent.DestinationRead(1, sejong))
        assertEquals(ArrivePhase.ROUTE_SET, late.phase)
        assertTrue(late.message!!.startsWith("응답은 늦었지만 내비 목적지가 세종로 공영주차장(시)(으)로 바뀌어 있어요"))
        val blocked = run(idle, ArriveHandoffEvent.Approve(3, a), ArriveHandoffEvent.Revalidated(3, ArriveReady.decide(input("1260")), key, v))
        assertEquals(ArrivePhase.BLOCKED, blocked.phase)
        assertEquals("승인한 세종로 공영주차장(시)이(가) 지금은 조건을 맞추지 못해요 · 만차로 표시돼 있어요(13:55 기준) · 내비에는 보내지 않았어요", blocked.message)
        assertEquals(idle, ArriveHandoff.reduce(blocked, ArriveHandoffEvent.Cancel))
    }

    @Test fun `E32-22 - 대안으로 바꾼 뒤 1순위가 세종로여도 안내 중인 곳이 유효하면 유지가 주 문장`() {
        val d = ArriveReady.decide(input())
        assertEquals("171721", d.top?.parking?.id)
        val st = ArriveReady.planStatus(d, "1425816", "동국제강 공영주차장(시)")
        assertEquals(listOf<Any?>(PlanChange.KEEP, "지금 경로를 유지해도 괜찮아 보여요", "171721", "1425816", false),
            listOf(st.change, st.headline, st.best?.parking?.id, st.routed?.parking?.id, st.recovery.notify))
        // 가까운 후보 우선으로 앞선 세종로를 여유가 더 큰 동국제강과 비교해 '약 -N분 많아요'를 만들지 않는다
        assertNull(ArriveReady.decisiveReason(d.top!!, d.fasterButFar!!))
    }

    private val dong = NaviPlace("동국제강 공영주차장(시)", 37.567337, 126.983435, null)
    private fun routeSet(): ArriveHandoffState {
        val a = ArriveHandoff.approvalOf(ArriveReady.decide(input()).top!!, key, now)
        return run(idle, ArriveHandoffEvent.Approve(1, a), ArriveHandoffEvent.Revalidated(1, ArriveReady.decide(input()), key, v),
            ArriveHandoffEvent.Lookup(1, null, true), ArriveHandoffEvent.RouteStarted(1), ArriveHandoffEvent.DestinationRead(1, sejong))
    }

    @Test fun `경로 설정 뒤 운전자가 내비에서 목적지를 바꾸면 존중한다 - 읽지 못한 것은 바뀐 것이 아니다`() {
        val s = routeSet()
        assertEquals(ArrivePhase.ROUTE_SET, s.phase)
        assertEquals(s, run(s, ArriveHandoffEvent.NaviChanged(sejong, true)))
        assertEquals(s, run(s, ArriveHandoffEvent.NaviChanged(null, false)))
        val o = run(s, ArriveHandoffEvent.NaviChanged(dong, true))
        assertEquals(listOf<Any?>(ArrivePhase.OVERRIDDEN, false, "내비 목적지가 동국제강 공영주차장(시)(으)로 바뀌어 있어요 · 앱이 보낸 경로가 아니라 이전 계획을 다시 적용하지 않아요"), listOf(o.phase, o.routed, o.message))
        assertEquals("내비 안내가 끝났거나 목적지가 없어요 · 이전 계획을 다시 적용하지 않아요", run(s, ArriveHandoffEvent.NaviChanged(null, true)).message)
        assertEquals(idle, run(o, ArriveHandoffEvent.Cancel))
        val pending = run(idle, ArriveHandoffEvent.Approve(2, s.approval!!))
        assertEquals(pending, run(pending, ArriveHandoffEvent.NaviChanged(dong, true)))
    }

    @Test fun `재시작 뒤 복원 - 내비를 다시 읽어 같을 때만 경로 설정됨 · 읽지 못했거나 다르면 반영됐다고 말하지 않는다`() {
        val a = routeSet().approval!!
        val ok = ArriveHandoff.restore(a, sejong, true)
        assertEquals(listOf<Any?>(ArrivePhase.ROUTE_SET, true, a, null), listOf(ok.phase, ok.routed, ok.approval, ok.requestId))
        assertEquals("앱을 다시 열어 내비 목적지를 다시 읽었어요 · 세종로 공영주차장(시)(으)로 안내 중 · 주차 · 방문은 아직 기록하지 않아요", ok.message)
        val unknown = ArriveHandoff.restore(a, null, false)
        assertEquals(ArrivePhase.IDLE to null, unknown.phase to unknown.approval)
        assertEquals("이전에 승인한 세종로 공영주차장(시) 경로가 지금 내비에 있는지 읽지 못했어요 · 확인 전이라 설정됨으로 보지 않아요", unknown.message)
        assertEquals("이전에 승인한 세종로 공영주차장(시) 경로가 지금 내비 목적지와 달라요 · 다시 적용하지 않아요", ArriveHandoff.restore(a, dong, true).message)
        assertEquals(ArrivePhase.IDLE, ArriveHandoff.restore(a, null, true).phase)
        assertEquals("판단 규칙이 바뀌어 이전 승인은 쓰지 않아요 · 다시 판단해 주세요", ArriveHandoff.restore(a, sejong, true, "arrive-v9").message)
        assertFalse(ArriveHandoff.shouldSend(ArriveHandoff.restore(a, null, true)))
    }

    @Test fun `저장 · 복원의 주인 - 운전자 · 이동별로 나누고 게스트는 저장하지 않는다 · 미확인은 미확인끼리만 · 약속이 지나면 버린다`() {
        val mom = ArriveOwner("mom", ProfileMode.WORK); val dad = ArriveOwner("dad", ProfileMode.WORK)
        val unknown = ArriveOwner(null, ProfileMode.WORK); val guest = ArriveOwner(null, ProfileMode.GUEST)
        assertFalse(guest.savable); assertTrue(mom.savable)
        assertTrue(mom.storeKey != dad.storeKey)
        assertEquals("goal.-.WORK", unknown.storeKey)
        assertTrue(mom.canRestore(mom, now + min, now))
        assertFalse(dad.canRestore(mom, now + min, now))
        assertFalse(unknown.canRestore(mom, now + min, now))
        assertTrue(unknown.canRestore(unknown, now + min, now))
        assertFalse(ArriveOwner("mom", ProfileMode.PICKUP).canRestore(mom, now + min, now))
        assertFalse(guest.canRestore(guest, now + min, now))
        assertFalse(mom.canRestore(mom, now - min, now))
    }
}
