package app.commadrive.core.assistant

import app.commadrive.core.Fixtures
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertSame
import kotlin.test.assertTrue

/**
 * 원탭 다음 이동(V5, 2026-11-03) — `src/lib/assistant/route-handoff.test.ts` 와 **같은 입력·같은 기대값**이다 (거울).
 * 뒤의 세션 테스트는 픽업 Mission 에서 귀가 일정 확인 → 집으로 안내 시작 → 결과가 Mission 머리줄에 들어가는 흐름을 고정한다.
 */
class RouteHandoffTest {
    private val home = NaviPlace("집", 37.4979, 127.0276, "home-1")
    private val academy = NaviPlace("학원", 37.51, 127.06, "poi-9")
    private fun run(vararg es: HandoffEvent) = es.fold(HandoffState(), RouteHandoff::reduce)

    @Test fun `같은 곳 — POI id 가 같거나 100m 안`() {
        assertTrue(RouteHandoff.samePlace(home, home.copy(poiId = null, lat = home.lat + 0.0005)))
        assertFalse(RouteHandoff.samePlace(home, home.copy(poiId = "x", lat = home.lat + 0.009)))
        assertTrue(RouteHandoff.samePlace(home, academy.copy(poiId = "home-1")))
    }

    @Test fun `기본 흐름 — 보냄 → 경로 시작 → 목적지를 다시 읽어 집이면 확인됨`() {
        var s = run(HandoffEvent.Start(1), HandoffEvent.Lookup(1, home, null))
        assertEquals(HandoffPhase.PENDING to true, s.phase to RouteHandoff.shouldSend(s))
        s = RouteHandoff.reduce(s, HandoffEvent.RouteStarted(1))
        assertEquals(HandoffPhase.PENDING to false, s.phase to RouteHandoff.shouldSend(s))
        s = RouteHandoff.reduce(s, HandoffEvent.DestinationRead(1, home))
        assertEquals(HandoffPhase.VERIFIED to "내비 목적지를 집으로 설정했어요 · 내비가 확인함", s.phase to s.message)
        assertEquals(null, RouteHandoff.button(s))
    }

    @Test fun `없는 주소를 만들지 않는다 — 집 즐겨찾기가 없으면 보내지 않음`() {
        val s = run(HandoffEvent.Start(1), HandoffEvent.Lookup(1, null, null))
        assertEquals(HandoffPhase.NO_HOME, s.phase)
        assertFalse(RouteHandoff.shouldSend(s))
        assertEquals("내비에 집이 저장돼 있지 않아요 · 내비게이션에서 집을 등록하거나 목적지를 직접 설정해 주세요", s.message)
    }

    @Test fun `빈 즐겨찾기 — 좌표가 (0, 0)인 HOME 은 집이 없는 것 (에뮬레이터 실측)`() {
        val s = run(HandoffEvent.Start(1), HandoffEvent.Lookup(1, NaviPlace("집", 0.0, 0.0, null), null))
        assertEquals(HandoffPhase.NO_HOME to false, s.phase to RouteHandoff.shouldSend(s))
    }

    @Test fun `기존 경로 보호 — 교체 확인 · 취소하면 그대로 · 이미 집이면 보내지 않음 · 주행 시작이면 무효`() {
        val ask = run(HandoffEvent.Start(1), HandoffEvent.Lookup(1, home, academy))
        assertEquals(listOf(HandoffPhase.CONFIRM_REPLACE, false, "지금 안내 중인 학원 경로가 집 경로로 바뀌어요", "집 경로로 바꾸기"),
            listOf(ask.phase, RouteHandoff.shouldSend(ask), ask.message, RouteHandoff.button(ask)))
        val cancelled = RouteHandoff.reduce(ask, HandoffEvent.Cancel)
        assertEquals(HandoffPhase.IDLE to "기존 경로를 그대로 둡니다", cancelled.phase to cancelled.message)
        assertEquals(HandoffPhase.PENDING, RouteHandoff.reduce(ask, HandoffEvent.ConfirmReplace(1)).phase)
        val already = run(HandoffEvent.Start(1), HandoffEvent.Lookup(1, home, home.copy(poiId = null)))
        assertEquals(HandoffPhase.VERIFIED to "이미 집으로 안내 중이에요", already.phase to already.message)
        assertEquals(HandoffPhase.IDLE, RouteHandoff.reduce(ask, HandoffEvent.Invalidate("주행 중")).phase)
    }

    @Test fun `요청 직후 읽은 지난 목적지로 실패 처리하지 않는다 · 경로 콜백 뒤에도 다르면 실패`() {
        val sent = run(HandoffEvent.Start(1), HandoffEvent.Lookup(1, home, null))
        assertEquals(HandoffPhase.PENDING, RouteHandoff.reduce(sent, HandoffEvent.DestinationRead(1, academy)).phase)
        val wrong = RouteHandoff.reduce(RouteHandoff.reduce(sent, HandoffEvent.RouteStarted(1)), HandoffEvent.DestinationRead(1, academy))
        assertEquals(listOf(HandoffPhase.FAILED, "내비 목적지가 집이 아니에요(학원) · 내비게이션에서 확인해 주세요", "집으로 안내 시작"),
            listOf(wrong.phase, wrong.message, RouteHandoff.button(wrong)))
    }

    @Test fun `오류는 실패 · 응답 없음은 모름 · 다시 읽어 집이면 늦게라도 확인 · 모르는 동안 다시 시작 안 함`() {
        val sent = run(HandoffEvent.Start(1), HandoffEvent.Lookup(1, home, null))
        val err = RouteHandoff.reduce(sent, HandoffEvent.Error(1, NaviError.CAUSE_SEARCH_ROUTE))
        assertEquals(HandoffPhase.FAILED to "내비가 경로를 찾지 못했습니다 · 기존 경로는 그대로입니다", err.phase to err.message)
        val unk = RouteHandoff.reduce(sent, HandoffEvent.Timeout(1))
        assertEquals(HandoffPhase.UNKNOWN_OUTCOME, unk.phase)
        assertSame(unk, RouteHandoff.reduce(unk, HandoffEvent.Start(2)))
        val late = RouteHandoff.reduce(unk, HandoffEvent.DestinationRead(1, home))
        assertEquals(HandoffPhase.VERIFIED to "응답은 늦었지만 내비 목적지가 집으로 바뀌어 있어요", late.phase to late.message)
        assertEquals(HandoffPhase.FAILED, RouteHandoff.reduce(run(HandoffEvent.Start(1)), HandoffEvent.Timeout(1)).phase)
    }

    @Test fun `늦은 콜백 — 다른 요청 번호의 결과는 무시한다`() {
        val sent = run(HandoffEvent.Start(2), HandoffEvent.Lookup(2, home, null))
        assertSame(sent, RouteHandoff.reduce(sent, HandoffEvent.DestinationRead(1, home)))
        assertSame(sent, RouteHandoff.reduce(sent, HandoffEvent.Error(1, NaviError.UNAVAILABLE)))
    }

    @Test fun `게이트 — 경로 요청은 주차·확인·NAVI_ROUTE_SEARCH 권한이 있어야`() {
        val parked = GateContext(false, Motion(MotionKind.PARKED, Confidence.CONFIRMED), emptyMap(), mapOf(Permission.NAVI_ROUTE_SEARCH to true), emptySet())
        assertTrue(SafetyGate.check(ActionType.REQUEST_ROUTE, parked, true).allowed)
        assertEquals(GateBlock.NO_PERMISSION, SafetyGate.check(ActionType.REQUEST_ROUTE, parked.copy(permissions = emptyMap()), true).block)
        assertEquals(GateBlock.DRIVING_BLOCKED, SafetyGate.check(ActionType.REQUEST_ROUTE, parked.copy(motion = Motion(MotionKind.MOVING, Confidence.CONFIRMED)), true).block)
    }

    // ── 세션 ──
    private val session = CopilotSession(Fixtures.demoStops)
    private fun runS(vararg intents: Intent, from: SessionState = SessionState()) = intents.fold(from, session::reduce)

    @Test fun `세션 — 귀가 일정 확인 뒤에만 집으로 안내 시작 · 확인되면 Mission 머리줄이 바뀐다 · 계획은 그대로`() {
        var s = runS(Intent.Choose(ProfileMode.PICKUP), Intent.StartPrepare, Intent.Drive, Intent.JumpTo(11.8), Intent.Park, Intent.StartWait)
        assertFalse(session.view(s).canRouteHome)
        assertEquals(s, runS(Intent.StartRouteHome(), from = s)) // 확인 전에는 아무것도 하지 않는다
        s = runS(Intent.ReadyNextLeg, from = s)
        assertTrue(session.view(s).canRouteHome)
        val plan = s.plan
        s = runS(Intent.StartRouteHome(), from = s)
        val id = s.handoff.requestId!!
        assertEquals(HandoffPhase.LOOKING, s.handoff.phase)
        s = runS(Intent.Handoff(HandoffEvent.Lookup(id, home, null)), Intent.Handoff(HandoffEvent.RouteStarted(id)), Intent.Handoff(HandoffEvent.DestinationRead(id, home)), from = s)
        val m = session.view(s).mission!!
        assertEquals("픽업 후 귀가 · 귀가 경로 확인됨", Missions.headline(m))
        assertEquals("내비 목적지: 집 (귀가) · 내비가 확인함", Missions.returnLine(m))
        assertEquals(plan, s.plan) // 앱의 계획·경유지는 바꾸지 않는다 — 바뀐 것은 내비 목적지(내비가 확인)
        assertTrue(Memory.activityOf(s.vault, ProfileMode.PICKUP).first().text.startsWith("내비 목적지 집으로 확인"))
    }

    @Test fun `세션 — 경로 권한이 없으면 막는다 · 새 이동이면 비운다`() {
        val waiting = runS(Intent.Choose(ProfileMode.PICKUP), Intent.StartPrepare, Intent.Drive, Intent.JumpTo(11.8), Intent.Park, Intent.StartWait, Intent.ReadyNextLeg)
        val denied = runS(Intent.SetCar(waiting.car.copy(permNavi = false)), Intent.StartRouteHome(), from = waiting)
        assertEquals(HandoffPhase.IDLE to "이 기능을 쓸 권한이 없습니다.", denied.handoff.phase to denied.toast)
        val started = runS(Intent.StartRouteHome(), from = waiting)
        // 모의 내비 — 확인돼도 '(모의)'를 단다(실제 내비 확인과 섞지 않는다)
        val m = runS(Intent.StartRouteHome(mock = true), from = waiting)
        val mid = m.handoff.requestId!!
        val mv = runS(Intent.Handoff(HandoffEvent.Lookup(mid, home, null)), Intent.Handoff(HandoffEvent.RouteStarted(mid)), Intent.Handoff(HandoffEvent.DestinationRead(mid, home)), from = m)
        assertEquals("시연 내비에 집을 목적지로 설정했어요 (모의)" to "픽업 후 귀가 · 귀가 경로 확인됨 (모의)", mv.handoff.message to Missions.headline(session.view(mv).mission!!))
        assertEquals(HandoffPhase.IDLE, runS(Intent.EndTrip, Intent.ChooseAndPrepare(ProfileMode.PICKUP), from = started).handoff.phase)
    }
}
