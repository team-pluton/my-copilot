package app.commadrive.core.assistant

import kotlin.test.Test
import kotlin.test.assertEquals

/** DRIVER × OCCUPANCY × JOURNEY · 학습 후보 — `src/lib/assistant/situation.test.ts` 와 같은 입력·같은 기대값 (거울) */
class SituationTest {
    private val ok = CabinSupportItem(true, true)
    private val support: CabinSupport = mapOf(CabinKey.HVAC_TEMP to ok, CabinKey.HVAC_POWER to ok, CabinKey.SEAT_VENT to ok, CabinKey.SEAT_HEAT to ok, CabinKey.STEERING_HEAT to CabinSupportItem(null, null), CabinKey.LIGHTING to CabinSupportItem(null, null))
    private val now = CabinNow(25.0, true, false, false, false, null)
    private val dad = Situation.DEMO_DRIVERS.getValue("dad")
    private val mom = Situation.DEMO_DRIVERS.getValue("mom")

    @Test fun `아빠 + 가족 · 엄마 + 가족 — 운전석은 운전자마다 다르고, 가족의 공조·음악은 같다`() {
        val fam = Profiles.PRESETS.getValue(ProfileMode.FAMILY)
        val a = Situation.combinedPrefs(fam, dad); val m = Situation.combinedPrefs(fam, mom)
        assertEquals(a.hvacTempC, m.hvacTempC); assertEquals(a.music, m.music); assertEquals(a.lighting, m.lighting); assertEquals(a.guidance, m.guidance)
        assertEquals(listOf(true, null, null), listOf(a.seatVent, a.seatHeat, a.steeringHeat))
        assertEquals(listOf(null, true, true), listOf(m.seatVent, m.seatHeat, m.steeringHeat))
        assertEquals(listOf(CabinKey.HVAC_TEMP, CabinKey.SEAT_VENT), Cabin.plan(a, now, support, false, "가족").toApply)
        assertEquals(listOf(CabinKey.HVAC_TEMP, CabinKey.SEAT_HEAT), Cabin.plan(m, now, support, false, "가족").toApply)
        assertEquals("아빠 · 가족 · 여행", Situation.label(fam, dad))
        assertEquals("엄마 · 혼자 · 업무 방문", Situation.label(Profiles.PRESETS.getValue(ProfileMode.WORK), mom))
        assertEquals("아빠 · 부부 · 외출", Situation.label(Profiles.PRESETS.getValue(ProfileMode.COMPANION), dad))
    }

    @Test fun `운전자 미확인이면 운전석 항목은 유지 — 이전 운전자의 시트 설정을 적용하지 않는다 · 인식은 수동`() {
        val p = Situation.combinedPrefs(Profiles.PRESETS.getValue(ProfileMode.SOLO), null)
        assertEquals(listOf(null, null, null), listOf(p.seatVent, p.seatHeat, p.steeringHeat))
        assertEquals(22.0, p.hvacTempC)
        assertEquals("운전자 미확인 · 혼자 · 출퇴근", Situation.label(Profiles.PRESETS.getValue(ProfileMode.SOLO), null))
        assertEquals("운전자 미확인 · 운전석 설정은 차량 프로필 그대로", Situation.seatMemoLine(null))
        assertEquals("아빠 · 운전석 메모리 1 (차량 운전자 프로필 · 앱은 바꾸지 않음)", Situation.seatMemoLine(dad))
        assertEquals(DriverRecognition.MANUAL, Situation.RECOGNITION)
        assertEquals(PrefOwner.DRIVER, Situation.CABIN_OWNER.getValue(CabinKey.SEAT_VENT))
        assertEquals("mom", Memory.rememberDriver(Memory.emptyVault(), "mom").lastDriver)
    }

    @Test fun `학습 후보 — 다른 이동 3번 같은 값이어야 묻는다 · 일회성은 아니다 · 한 번만 · 거절한 값은 다시 안 묻는다`() {
        val ctx = LearnCtx("dad", ProfileMode.SOLO)
        val cur = Situation.combinedPrefs(Profiles.PRESETS.getValue(ProfileMode.SOLO), dad)
        var st = Learning.observe(LearningState(), ctx, CabinKey.HVAC_TEMP, 24.0, 1, ObservationSource.VEHICLE)
        assertEquals(emptyList(), Learning.candidates(st, ctx, cur, "혼자"))
        st = Learning.observe(st, ctx, CabinKey.HVAC_TEMP, 24.0, 1, ObservationSource.VEHICLE)
        st = Learning.observe(st, ctx, CabinKey.HVAC_TEMP, 24.0, 2, ObservationSource.VEHICLE)
        assertEquals(emptyList(), Learning.candidates(st, ctx, cur, "혼자"))
        st = Learning.observe(st, ctx, CabinKey.HVAC_TEMP, 24.3, 3, ObservationSource.VEHICLE)
        val c = Learning.candidates(st, ctx, cur, "혼자")
        assertEquals(1, c.size)
        assertEquals(Learning.MIN_TRIPS, c[0].trips)
        assertEquals("최근 3번 이동에서 혼자일 때 공조 온도가 24°C였어요 — 탑승 조합 취향으로 저장할까요?", c[0].line)
        assertEquals(emptyList(), Learning.candidates(Learning.observe(st, ctx, CabinKey.HVAC_TEMP, 25.0, 4, ObservationSource.VEHICLE), ctx, cur, "혼자"))
        val saved = Learning.withPref(cur, CabinKey.HVAC_TEMP, c[0].value)
        assertEquals(24.0, saved.hvacTempC)
        assertEquals(emptyList(), Learning.candidates(Learning.accept(st, ctx, CabinKey.HVAC_TEMP), ctx, saved, "혼자"))
        var d = Learning.decline(st, ctx, CabinKey.HVAC_TEMP, 24.0)
        for (t in 5..7) d = Learning.observe(d, ctx, CabinKey.HVAC_TEMP, 24.0, t, ObservationSource.VEHICLE)
        assertEquals(emptyList(), Learning.candidates(d, ctx, cur, "혼자"))
        for (t in 8..10) d = Learning.observe(d, ctx, CabinKey.HVAC_TEMP, 20.0, t, ObservationSource.VEHICLE)
        assertEquals(20.0, Learning.candidates(d, ctx, cur, "혼자").firstOrNull()?.value)
    }

    @Test fun `학습하지 않는 것 — 받은 적 없음 · 앱이 스스로 바꾼 값 · 운전자 미확인 · 이동 번호 없음 · 조명`() {
        val ctx = LearnCtx("dad", ProfileMode.SOLO)
        var st = LearningState()
        for (t in 1..3) for (src in listOf(ObservationSource.APP, ObservationSource.NONE)) st = Learning.observe(st, ctx, CabinKey.SEAT_VENT, true, t, src)
        assertEquals(LearningState(), st)
        for (t in 1..3) st = Learning.observe(st, LearnCtx(null, ProfileMode.SOLO), CabinKey.SEAT_VENT, true, t, ObservationSource.VEHICLE)
        assertEquals(LearningState(), st)
        assertEquals(LearningState(), Learning.observe(st, ctx, CabinKey.SEAT_VENT, true, 0, ObservationSource.VEHICLE))
        for (t in 1..3) st = Learning.observe(st, ctx, CabinKey.LIGHTING, Lighting.CALM, t, ObservationSource.VEHICLE)
        assertEquals(LearningState(), st)
        var s2 = LearningState()
        for (t in 1..3) s2 = Learning.observe(s2, ctx, CabinKey.SEAT_HEAT, true, t, ObservationSource.VEHICLE)
        assertEquals(PrefOwner.DRIVER, Learning.candidates(s2, ctx, CabinPrefs(hvacTempC = 22.0), "혼자")[0].owner)
        assertEquals(true, Learning.withPref(dad.prefs, CabinKey.SEAT_HEAT, true).seatHeat)
        assertEquals(emptyList(), Learning.candidates(s2, LearnCtx("mom", ProfileMode.SOLO), CabinPrefs.NONE, "혼자"))
    }

    @Test fun `귀속 — 변경 주체는 SDK 가 모른다 · 운전석은 혼자 탈 때만 운전자에게 · 가족 공조는 운전자 무관 · 혼자 공조는 운전자 × 혼자`() {
        val dadFam = LearnCtx("dad", ProfileMode.FAMILY); val momFam = LearnCtx("mom", ProfileMode.FAMILY); val dadSolo = LearnCtx("dad", ProfileMode.SOLO)
        assertEquals(ChangeSubject.DRIVER_ASSUMED, Learning.changeSubject(dadSolo)); assertEquals(ChangeSubject.UNKNOWN, Learning.changeSubject(dadFam)); assertEquals(ChangeSubject.UNKNOWN, Learning.changeSubject(LearnCtx(null, ProfileMode.SOLO)))
        assertEquals("D|dad", Learning.key(dadFam, CabinKey.SEAT_VENT)); assertEquals("O|FAMILY", Learning.key(dadFam, CabinKey.HVAC_TEMP)); assertEquals("O|FAMILY", Learning.key(momFam, CabinKey.HVAC_TEMP)); assertEquals("O|SOLO|dad", Learning.key(dadSolo, CabinKey.HVAC_TEMP))
        // 가족 탑승 중의 운전석 변경은 운전자 취향으로 귀속하지 않는다(조수석이 켰을 수 있다)
        var st = LearningState()
        for (t in 1..3) st = Learning.observe(st, momFam, CabinKey.SEAT_HEAT, true, t, ObservationSource.VEHICLE)
        assertEquals(LearningState(), st)
        // 가족 공조는 누가 돌렸든 가족 기록 — 아빠 운전 2번 + 엄마 운전 1번
        st = Learning.observe(st, dadFam, CabinKey.HVAC_TEMP, 24.0, 1, ObservationSource.VEHICLE); st = Learning.observe(st, dadFam, CabinKey.HVAC_TEMP, 24.0, 2, ObservationSource.VEHICLE); st = Learning.observe(st, momFam, CabinKey.HVAC_TEMP, 24.0, 3, ObservationSource.VEHICLE)
        val c = Learning.candidates(st, momFam, Situation.combinedPrefs(Profiles.PRESETS.getValue(ProfileMode.FAMILY), mom), "가족")
        assertEquals(1, c.size); assertEquals(PrefOwner.OCCUPANCY, c[0].owner); assertEquals(ObservationSource.VEHICLE, c[0].evidence)
        assertEquals("최근 3번 이동에서 가족일 때 공조 온도가 24°C였어요 — 탑승 조합 취향으로 저장할까요?", c[0].line)
        // 혼자 공조는 운전자 × 혼자
        var so = LearningState()
        for (t in 1..3) so = Learning.observe(so, dadSolo, CabinKey.HVAC_TEMP, 24.0, t, ObservationSource.VEHICLE)
        assertEquals(1, Learning.candidates(so, dadSolo, Situation.combinedPrefs(Profiles.PRESETS.getValue(ProfileMode.SOLO), dad), "혼자").size)
        assertEquals(emptyList(), Learning.candidates(so, LearnCtx("mom", ProfileMode.SOLO), Situation.combinedPrefs(Profiles.PRESETS.getValue(ProfileMode.SOLO), mom), "혼자"))
        // 혼자 탈 때의 운전석 변경은 운전자에게 — 어느 조합에서도 아빠 것
        var dr = LearningState()
        for (t in 1..3) dr = Learning.observe(dr, dadSolo, CabinKey.SEAT_HEAT, true, t, ObservationSource.VEHICLE)
        assertEquals("최근 3번 이동에서 가족일 때 열선시트가 켜져 있었어요 — 운전자 취향으로 저장할까요?", Learning.candidates(dr, dadFam, Situation.combinedPrefs(Profiles.PRESETS.getValue(ProfileMode.FAMILY), dad), "가족").firstOrNull()?.line)
    }

    @Test fun `증거 등급 — 모의는 기록되지만 실차 증거가 아니다 · 시연 데이터 문장 · 집계 0 · VEHICLE 과 섞이지 않는다`() {
        val ctx = LearnCtx("dad", ProfileMode.SOLO)
        val cur = Situation.combinedPrefs(Profiles.PRESETS.getValue(ProfileMode.SOLO), dad)
        var st = LearningState()
        for (t in 1..3) st = Learning.observe(st, ctx, CabinKey.HVAC_TEMP, 24.0, t, ObservationSource.MOCK)
        val c = Learning.candidates(st, ctx, cur, "혼자")
        assertEquals(ObservationSource.MOCK, c[0].evidence)
        assertEquals("시연 데이터 · 최근 3번 이동에서 혼자일 때 공조 온도가 24°C였어요 — 탑승 조합 취향으로 저장할까요?", c[0].line)
        assertEquals(RealEvidence(0, 0), Learning.realEvidence(st))
        var mixed = Learning.observe(Learning.observe(LearningState(), ctx, CabinKey.HVAC_TEMP, 24.0, 1, ObservationSource.MOCK), ctx, CabinKey.HVAC_TEMP, 24.0, 2, ObservationSource.MOCK)
        mixed = Learning.observe(mixed, ctx, CabinKey.HVAC_TEMP, 24.0, 3, ObservationSource.VEHICLE)
        assertEquals(emptyList(), Learning.candidates(mixed, ctx, cur, "혼자"))
        assertEquals(RealEvidence(1, 1), Learning.realEvidence(mixed))
        assertEquals(mixed, Learning.observe(mixed, ctx, CabinKey.HVAC_TEMP, 24.0, 4, ObservationSource.MOCK))
    }

    @Test fun `대표 시연 A·B·C — 같은 엔진으로 재현 · 아빠+가족 · 엄마+가족 · 이미 맞는 다음 가족 여행`() {
        val fam = Profiles.PRESETS.getValue(ProfileMode.FAMILY)
        val a = Cabin.plan(Situation.combinedPrefs(fam, dad), now, support, false, "가족")
        assertEquals(listOf(CabinKey.HVAC_TEMP, CabinKey.SEAT_VENT), a.toApply)
        assertEquals("저장된 취향과 비교해 변경할 설정이 2개 있습니다 · 실내 조명은 차량에서 직접", a.summary)
        val b = Cabin.plan(Situation.combinedPrefs(fam, mom), now, support, false, "가족")
        assertEquals(listOf(CabinKey.HVAC_TEMP, CabinKey.SEAT_HEAT), b.toApply)
        assertEquals(a.items.first { it.key == CabinKey.HVAC_TEMP }.line, b.items.first { it.key == CabinKey.HVAC_TEMP }.line)
        val c1 = Cabin.plan(Situation.combinedPrefs(fam, dad), now.copy(hvacTempC = 23.0, seatVent = true), support, false, "가족")
        assertEquals(emptyList(), c1.toApply)
        assertEquals("앱에서 바꿀 수 있는 설정은 없습니다 · 실내 조명은 차량에서 직접", c1.summary)
        val c2 = Cabin.plan(Situation.combinedPrefs(fam, dad), now.copy(hvacTempC = 23.0, seatVent = true, lighting = Lighting.BRIGHT), support, false, "가족")
        assertEquals(emptyList(), c2.toApply)
        assertEquals(true, c2.nothingToDo)
        assertEquals("가족 이동 준비를 확인했어요 · 저장한 취향과 모두 맞습니다", c2.summary)
    }
    @Test fun `혼자 공조 정합성 — 아빠 혼자 24°C · 엄마 혼자 20°C 를 각각 학습·승인해도 섞이지 않는다 · 저장 자리 = 귀속 키(운전자별 soloCabin) · 프로필 targetC 그대로`() {
        val solo = Profiles.PRESETS.getValue(ProfileMode.SOLO)
        val dadCtx = LearnCtx("dad", ProfileMode.SOLO); val momCtx = LearnCtx("mom", ProfileMode.SOLO)
        var st = LearningState()
        for (t in 1..3) st = Learning.observe(st, dadCtx, CabinKey.HVAC_TEMP, 24.0, t, ObservationSource.VEHICLE)
        for (t in 4..6) st = Learning.observe(st, momCtx, CabinKey.HVAC_TEMP, 20.0, t, ObservationSource.VEHICLE)
        val cd = Learning.candidates(st, dadCtx, Situation.combinedPrefs(solo, dad), "혼자")[0]
        val sd = Learning.store(cd, dadCtx, solo, dad, null)
        assertEquals(solo, sd.profile)
        assertEquals(SoloCabin(hvacTempC = 24.0), sd.solo)
        val cm = Learning.candidates(st, momCtx, Situation.combinedPrefs(solo, mom), "혼자")[0]
        assertEquals(20.0, cm.value)
        val sm = Learning.store(cm, momCtx, solo, mom, null)
        val vault = Memory.emptyVault().copy(soloCabin = mapOf(Situation.soloKey("dad", ProfileMode.SOLO) to sd.solo!!, Situation.soloKey("mom", ProfileMode.SOLO) to sm.solo!!))
        assertEquals(24.0, Situation.combinedPrefs(solo, dad, vault.soloCabin[Situation.soloKey("dad", ProfileMode.SOLO)]).hvacTempC)
        assertEquals(20.0, Situation.combinedPrefs(solo, mom, vault.soloCabin[Situation.soloKey("mom", ProfileMode.SOLO)]).hvacTempC)
        assertEquals(22.0, Situation.combinedPrefs(solo, null, null).hvacTempC)
        assertEquals(23.0, Situation.combinedPrefs(Profiles.PRESETS.getValue(ProfileMode.FAMILY), dad, vault.soloCabin[Situation.soloKey("dad", ProfileMode.SOLO)]).hvacTempC)
        assertEquals(emptyList(), Learning.candidates(Learning.accept(st, dadCtx, CabinKey.HVAC_TEMP), dadCtx, Situation.combinedPrefs(solo, dad, sd.solo), "혼자"))
        var fam = LearningState()
        for (t in 1..3) fam = Learning.observe(fam, LearnCtx("dad", ProfileMode.FAMILY), CabinKey.HVAC_TEMP, 24.0, t, ObservationSource.VEHICLE)
        val cf = Learning.candidates(fam, LearnCtx("dad", ProfileMode.FAMILY), Situation.combinedPrefs(Profiles.PRESETS.getValue(ProfileMode.FAMILY), dad), "가족")[0]
        val sf = Learning.store(cf, LearnCtx("dad", ProfileMode.FAMILY), Profiles.PRESETS.getValue(ProfileMode.FAMILY), dad, null)
        assertEquals(24.0, sf.profile.targetC); assertEquals(null, sf.solo); assertEquals(dad, sf.driver)
    }
}
