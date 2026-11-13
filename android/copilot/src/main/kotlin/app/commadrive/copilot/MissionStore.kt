package app.commadrive.copilot

import android.content.Context
import app.commadrive.core.PassengerType
import app.commadrive.core.TripMode
import app.commadrive.core.TripPlan
import app.commadrive.core.assistant.ClimateDecision
import app.commadrive.core.assistant.ClimateDecisionKind
import app.commadrive.core.assistant.Confidence
import app.commadrive.core.assistant.JourneyMemory
import app.commadrive.core.assistant.JourneyPhase
import app.commadrive.core.assistant.JourneyState
import app.commadrive.core.assistant.MissionSnapshot
import app.commadrive.core.assistant.Missions
import app.commadrive.core.assistant.PrepareItemKey
import app.commadrive.core.assistant.ProfileMode
import app.commadrive.core.assistant.SuggestionType
import app.commadrive.core.assistant.WaitMode
import app.commadrive.core.assistant.WaitSource
import org.json.JSONArray
import org.json.JSONObject

/**
 * 진행 중 Mission 스냅샷 저장소(V5 지시서 4절 6 · HANDOFF "이번 이동 저장") — 프로세스가 죽거나 창이 닫혀도 확인된 상태를 이어서 간다.
 * 무엇을 담는지는 core 의 [MissionSnapshot] 이 정한다(확인된 것만 · 진행 중 제어 요청·알림 기준·위치 없음). 여기서는 그것을 JSON 으로 적고 읽을 뿐이다.
 * 저장은 세션이 바뀔 때마다(값이 같으면 건너뜀), 복원은 앱이 켜질 때 한 번 — 복원 뒤 여정 단계는 지금 차 신호로 다시 판단한다(CopilotSession.restore).
 * 손상된 저장값은 버리고 새로 시작한다 — 반쯤 복원하지 않는다.
 */
class MissionStore(context: Context) {
    private val prefs = context.getSharedPreferences("copilot.mission", Context.MODE_PRIVATE)
    private var last: String? = null

    fun save(s: MissionSnapshot?) {
        val json = s?.takeIf { Missions.restorable(it) }?.let { encode(it).toString() }
        if (json == last) return
        last = json
        prefs.edit().apply { if (json == null) remove(KEY) else putString(KEY, json) }.apply()
    }

    fun load(): MissionSnapshot? = try {
        prefs.getString(KEY, null)?.let { decode(JSONObject(it)) }?.takeIf { Missions.restorable(it) }
    } catch (_: Exception) { null }

    fun clear() { last = null; prefs.edit().remove(KEY).apply() }

    companion object {
        private const val KEY = "snapshot"

        fun encode(s: MissionSnapshot): JSONObject = JSONObject().apply {
            put("version", s.version); put("mode", s.mode.name); put("driver", s.driver ?: JSONObject.NULL); put("chosen", s.chosen)
            put("plan", JSONObject().apply {
                val p = s.plan
                put("destinationName", p.destinationName); put("routeKm", p.routeKm); put("waitMinutesAfterArrival", p.waitMinutesAfterArrival); put("minReservePct", p.minReservePct)
                put("passengers", JSONArray(p.passengers.map { it.name })); put("breakIntervalMinutes", p.breakIntervalMinutes); put("mode", p.mode.name); put("returnKm", p.returnKm)
                put("naviArrivalSocPct", p.naviArrivalSocPct ?: JSONObject.NULL)
            })
            put("journey", JSONObject().apply { val j = s.journey; put("phase", j.phase.name); put("atDestination", j.atDestination); put("confidence", j.confidence.name); put("leg", j.leg); put("legs", j.legs) })
            put("traveledKm", s.traveledKm); put("waitedMin", s.waitedMin); put("simMin", s.simMin)
            put("waitMode", s.waitMode.name); put("waitSource", s.waitSource.name); put("nextLegReady", s.nextLegReady); put("endedEarly", s.endedEarly); put("missionStartedAt", s.missionStartedAt ?: JSONObject.NULL)
            put("memory", JSONObject().apply {
                val m = s.memory
                put("tripId", m.tripId); put("profile", m.profile.name); put("prepareDone", m.prepareDone); put("packed", JSONArray(m.packed))
                put("climate", m.climate?.let { JSONObject().put("decision", it.decision.name).put("valueC", it.valueC) } ?: JSONObject.NULL)
                put("waypointIds", JSONArray(m.waypointIds)); put("finishChecked", JSONObject().apply { m.finishChecked.forEach { (leg, items) -> put(leg.toString(), JSONArray(items)) } })
                put("lastShown", m.lastShown?.name ?: JSONObject.NULL); put("skipped", JSONArray(m.skipped.map { it.name }))
            })
            put("waypointIds", JSONArray(s.waypointIds)); put("chargedAt", JSONArray(s.chargedAt))
            put("batteryPct", s.batteryPct); put("tripMinutes", s.tripMinutes); put("savedAt", s.savedAt)
        }

        private fun JSONObject.str(k: String): String? = if (isNull(k)) null else getString(k)
        private fun JSONArray.strings() = (0 until length()).map { getString(it) }

        fun decode(o: JSONObject): MissionSnapshot {
            val p = o.getJSONObject("plan")
            val j = o.getJSONObject("journey")
            val m = o.getJSONObject("memory")
            val fc = m.getJSONObject("finishChecked")
            return MissionSnapshot(
                version = o.getInt("version"), mode = ProfileMode.valueOf(o.getString("mode")), driver = o.str("driver"), chosen = o.getBoolean("chosen"),
                plan = TripPlan(
                    p.getString("destinationName"), p.getDouble("routeKm"), p.getInt("waitMinutesAfterArrival"), p.getDouble("minReservePct"),
                    p.getJSONArray("passengers").strings().map { PassengerType.valueOf(it) }.toSet(), p.getInt("breakIntervalMinutes"), TripMode.valueOf(p.getString("mode")), p.getDouble("returnKm"),
                    if (p.isNull("naviArrivalSocPct")) null else p.getDouble("naviArrivalSocPct"),
                ),
                journey = JourneyState(JourneyPhase.valueOf(j.getString("phase")), j.getBoolean("atDestination"), Confidence.valueOf(j.getString("confidence")), j.getInt("leg"), j.getInt("legs")),
                traveledKm = o.getDouble("traveledKm"), waitedMin = o.getInt("waitedMin"), simMin = o.getInt("simMin"),
                waitMode = WaitMode.valueOf(o.getString("waitMode")), waitSource = WaitSource.valueOf(o.getString("waitSource")), nextLegReady = o.getBoolean("nextLegReady"), endedEarly = o.getBoolean("endedEarly"),
                missionStartedAt = o.str("missionStartedAt"),
                memory = JourneyMemory(
                    m.getInt("tripId"), ProfileMode.valueOf(m.getString("profile")), m.getBoolean("prepareDone"), m.getJSONArray("packed").strings(),
                    if (m.isNull("climate")) null else m.getJSONObject("climate").let { ClimateDecision(ClimateDecisionKind.valueOf(it.getString("decision")), it.getDouble("valueC")) },
                    m.getJSONArray("waypointIds").strings(), fc.keys().asSequence().associate { it.toInt() to fc.getJSONArray(it).strings() },
                    m.str("lastShown")?.let { SuggestionType.valueOf(it) }, m.getJSONArray("skipped").strings().map { PrepareItemKey.valueOf(it) },
                ),
                waypointIds = o.getJSONArray("waypointIds").strings(), chargedAt = o.getJSONArray("chargedAt").strings(),
                batteryPct = o.getDouble("batteryPct"), tripMinutes = o.getInt("tripMinutes"), savedAt = o.getString("savedAt"),
            )
        }
    }
}
