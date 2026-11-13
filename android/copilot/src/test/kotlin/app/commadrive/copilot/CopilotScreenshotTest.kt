package app.commadrive.copilot

import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Looper
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.lifecycle.ViewModelProvider
import app.commadrive.core.assistant.CarState
import app.commadrive.core.assistant.DriveLevel
import app.commadrive.core.assistant.Intent
import app.commadrive.core.assistant.ProfileMode
import app.commadrive.core.assistant.WaitMode
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.time.Duration

/**
 * 문서용 화면 캡처 + 앱 창 크기 검증 — 판단 자체는 core CopilotSessionTest 가 검증한다. 기기·에뮬레이터 없이
 * 실제 Compose 화면을 그린다(JVM 렌더 — Pleos Connect Emulator 실행이 아니다).
 * 창 크기는 공식 레이아웃 문서의 값(research 7절): 17" 세로 840×1184 · 가로 1700×1184 · 12.9" 세로 628×855 · 14.6" 가로 1360×948 (dp).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w840dp-h1184dp-port-mdpi")
class CopilotScreenshotTest {
    @get:Rule val rule = createAndroidComposeRule<CopilotActivity>()
    private val out = File(System.getProperty("shots.dir") ?: "build/shots").apply { mkdirs() }
    private val vm get() = ViewModelProvider(rule.activity)[CopilotViewModel::class.java]

    private fun idle(ms: Long = 50) { shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(ms)); rule.waitForIdle() }
    // 토스트는 몇 초 뒤 사라진다 — 캡처에는 그 장면에서 새로 뜬 것만 남긴다(직전 장면 것은 지운다)
    private fun act(block: CopilotViewModel.() -> Unit) { rule.runOnUiThread { vm.send(Intent.ClearToast); vm.block() }; idle() }
    private fun shot(name: String) {
        idle()
        val v = rule.activity.window.decorView
        val bmp = Bitmap.createBitmap(v.width, v.height, Bitmap.Config.ARGB_8888)
        v.draw(Canvas(bmp))
        File(out, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    /** 대표 시연 1 — 업무일 하루(충전 없음). 앱이 먼저 묻는 것은 하차 확인 두 번, 주행 중은 늘 조용 */
    /** Simple & Proactive UX(오너 지시 2026-10-28) — 질문 하나 · 선택 한 번이 곧 준비 · 승인 하나 · 결과는 항목마다 */
    @Test fun oneScreen() {
        shot("O01-오늘은-누구와")
        act { send(Intent.ChooseAndPrepare(ProfileMode.SOLO)) }; shot("O02-혼자-2개-한번에")
        act { controlMode = ControlMode.PARTIAL; applyCabin() }; idle(1200); shot("O03-일부만-성공")
        act { send(Intent.EndTrip); send(Intent.SetCar(CarState(hvacC = 22.0, seatVent = true, lighting = app.commadrive.core.assistant.Lighting.CALM))); send(Intent.ChooseAndPrepare(ProfileMode.SOLO)) }; shot("O04-혼자-모두맞음")
        act { send(Intent.EndTrip); send(Intent.ChooseAndPrepare(ProfileMode.COMPANION)) }; shot("O05-동승자-아내와둘이")
        act { send(Intent.EndTrip); send(Intent.SetCar(CarState(permClimate = false, permSeat = null))); send(Intent.ChooseAndPrepare(ProfileMode.FAMILY)) }; shot("O06-권한없음-직접")
        act { send(Intent.EndTrip); send(Intent.SetLinkOf(listOf(app.commadrive.core.assistant.LinkKind.CABIN), false)); send(Intent.ChooseAndPrepare(ProfileMode.FAMILY)) }; shot("O07-연결끊김-직접")
        // DRIVER × OCCUPANCY × JOURNEY — 아빠 + 가족 / 엄마 + 가족은 운전석만 다르다 · 학습 후보는 3번 반복 뒤 한 번
        // 앞 장면의 권한 거부·연결 끊김을 되돌린다(SetCar 는 모의 차량 전체를 바꾼다)
        act { send(Intent.EndTrip); send(Intent.SetCar(CarState())); send(Intent.SetDriver("dad")); send(Intent.ChooseAndPrepare(ProfileMode.FAMILY)); send(Intent.ClearToast) }; idle(1500); shot("O08-아빠-가족")
        act { send(Intent.EndTrip); send(Intent.SetDriver("mom")); send(Intent.ChooseAndPrepare(ProfileMode.FAMILY)); send(Intent.ClearToast) }; idle(1500); shot("O09-엄마-가족")
        act {
            send(Intent.EndTrip); send(Intent.SetDriver("dad")); send(Intent.ChooseAndPrepare(ProfileMode.SOLO))
            repeat(3) { send(Intent.SetHvac(24.0)); send(Intent.Drive); send(Intent.JumpTo(24.0)); send(Intent.Park); send(Intent.EndTrip); send(Intent.ChooseAndPrepare(ProfileMode.SOLO)) }
            send(Intent.ClearToast)
        }; idle(1500); shot("O10-취향-후보-한번만")
        act { send(Intent.EndTrip); send(Intent.ClearToast) }; idle(1500); shot("O11-다시-오늘은-누구와")
    }

    @Test fun workday() {
        act { send(Intent.Choose(ProfileMode.WORK)); send(Intent.SetHvac(21.0)); send(Intent.StartPrepare) }; shot("W01-업무-출발준비")
        act { send(Intent.SetPacked(state.profile.packing)); tab = Tab.PREPARE }; shot("W02-준비끝")
        act { tab = Tab.HOME; send(Intent.Drive) }; idle(800); shot("W03-주행-조용")
        assertEquals(DriveLevel.QUIET, vm.view.drive.level)
        act { send(Intent.JumpTo(37.8)); send(Intent.Park) }; idle(300); shot("W04-고객사-도착")
        act { send(Intent.StartFinish); send(Intent.SetChecked(state.profile.finishChecklist)); send(Intent.Complete) }; shot("W05-방문중")
        act { send(Intent.ChangeWait(60)) }; shot("W06-미팅연장-알림없음")
        act { send(Intent.Drive) }; idle(800); shot("W07-귀가-조용")
        act { send(Intent.JumpTo(37.8)); send(Intent.Park); send(Intent.StartFinish); send(Intent.SetChecked(state.profile.finishChecklist)); send(Intent.Complete); tab = Tab.HISTORY }; idle(300); shot("W08-하루끝-기록")
    }

    /** 대표 시연 2 — 가족 장거리. 에너지 판단 · 경유지 포함 판단 · 주행 중 확인 필요 */
    @Test fun family() {
        shot("A01-시작")
        act { send(Intent.Choose(ProfileMode.FAMILY)); send(Intent.StartPrepare) }; shot("A02-홈-출발준비")
        act { tab = Tab.DETAIL }; shot("A03-자세히-출처")
        act { tab = Tab.PREPARE }; shot("A04-출발준비")
        act { tab = Tab.ENERGY }; shot("A05-에너지-선택지")
        act { send(Intent.Drive) }; idle(400); shot("A06-주행-확인필요")
        assertEquals(DriveLevel.ATTENTION, vm.view.drive.level)
        act { send(Intent.Stop); send(Intent.Park); tab = Tab.STOPS; view.ranked.firstOrNull()?.let { addWaypoint(it.stop) } }; idle(1200); shot("A07-경유지추가")
        act { tab = Tab.PREPARE }; shot("A08-출발준비-경유지포함")
        act { send(Intent.Dismiss(app.commadrive.core.assistant.SuggestionType.PROFILE_PREPARATION)); send(Intent.SetPacked(state.profile.packing)) }; shot("A09-공조-건너뜀")
        act { tab = Tab.HOME; send(Intent.Drive) }; idle(400); shot("A10-주행-경유지까지")
        act { send(Intent.SetLink(false)) }; shot("A11-주행-정보없음")
        assertEquals(DriveLevel.UNKNOWN, vm.view.drive.level)
        act { send(Intent.SetLink(true)); send(Intent.Stop) }
        rule.onNodeWithText("개발용").performClick(); idle(); shot("A12-개발용-조작판")
    }

    /** 실행 중 창 크기가 바뀌어도(세로 → 가로) 이번 이동이 그대로 — Pleos: 사라졌다 돌아오거나 창이 바뀌어도 종료가 아니다 */
    @Test fun resizeKeepsState() {
        act { send(Intent.Choose(ProfileMode.FAMILY)); send(Intent.StartPrepare); send(Intent.SetPacked(state.profile.packing.take(2))); tab = Tab.PREPARE }; shot("R01-세로-출발준비")
        val before = vm.state
        RuntimeEnvironment.setQualifiers("w1700dp-h1184dp-land-mdpi")
        rule.activityRule.scenario.recreate(); idle(300); shot("R02-가로로-바꿈")
        assertEquals(before.memory, vm.state.memory)
        assertEquals(before.journey, vm.state.journey)
        assertEquals(Tab.PREPARE, vm.tab)
    }

    @Test fun readyBlockedGuest() {
        act { send(Intent.Choose(ProfileMode.SOLO)); send(Intent.SetHvac(22.0)); send(Intent.StartPrepare) }; shot("G01-혼자-준비끝")
        act { send(Intent.EndTrip); send(Intent.Choose(ProfileMode.FAMILY)); send(Intent.SetCar(CarState(permClimate = false))); send(Intent.StartPrepare); tab = Tab.PREPARE }; shot("C01-권한없음-출발준비")
        act { send(Intent.EndTrip); send(Intent.Choose(ProfileMode.GUEST)); send(Intent.StartPrepare); tab = Tab.HOME }; shot("K01-프로필없이-첫결과")
        act { send(Intent.EndTrip); send(Intent.Choose(ProfileMode.WORK)); send(Intent.SetBattery(45.0)); send(Intent.StartPrepare); send(Intent.ChangeWait(120)); send(Intent.Drive); send(Intent.JumpTo(37.8)); send(Intent.Park); send(Intent.SetWaitMode(WaitMode.IN_CAR)); tab = Tab.ENERGY }
        shot("E01-차안대기-선택지")
        act { send(Intent.EndTrip); send(Intent.Choose(ProfileMode.FAMILY)); tab = Tab.PROFILE }; shot("P01-프로필-편집")
    }

    @Config(qualifiers = "w1700dp-h1184dp-land-mdpi")
    @Test fun wide17() {
        act { send(Intent.Choose(ProfileMode.FAMILY)); send(Intent.StartPrepare) }; shot("L01-17인치-가로-홈")
        act { tab = Tab.PREPARE }; shot("L02-17인치-가로-출발준비")
    }

    @Config(qualifiers = "w1360dp-h948dp-land-mdpi")
    @Test fun wide146() {
        act { send(Intent.Choose(ProfileMode.WORK)); send(Intent.StartPrepare) }; shot("M01-14인치-가로-홈")
        act { tab = Tab.ENERGY }; shot("M02-14인치-가로-에너지")
    }

    @Config(qualifiers = "w628dp-h855dp-port-mdpi")
    @Test fun small129() {
        act { send(Intent.Choose(ProfileMode.FAMILY)); send(Intent.StartPrepare) }; shot("S01-12인치-세로-홈")
        act { tab = Tab.PREPARE }; shot("S02-12인치-세로-출발준비")
        act { tab = Tab.ENERGY }; shot("S03-12인치-세로-에너지")
        act { tab = Tab.HOME; send(Intent.Drive) }; idle(400); shot("S04-12인치-세로-주행")
    }

    @Config(qualifiers = "+night")
    @Test fun dark() {
        act { send(Intent.Choose(ProfileMode.WORK)); send(Intent.SetHvac(21.0)); send(Intent.StartPrepare); send(Intent.SetPacked(state.profile.packing)) }; shot("D01-다크-준비끝")
        act { send(Intent.Drive) }; idle(800); shot("D02-다크-주행-조용")
        act { send(Intent.Stop) }
    }
}
