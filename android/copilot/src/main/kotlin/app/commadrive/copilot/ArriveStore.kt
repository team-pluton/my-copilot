package app.commadrive.copilot

import android.content.Context
import app.commadrive.core.assistant.ArriveApproval
import app.commadrive.core.assistant.ArriveOwner
import app.commadrive.core.assistant.ProfileMode
import app.commadrive.core.assistant.GeoPoint
import app.commadrive.core.assistant.NaviPlace
import org.json.JSONObject

/**
 * ARRIVE READY 의 이동 목표 · 승인 저장(오너 2026-11-13) — 앱이 다시 켜져도 운전자가 목표를 다시 입력하지 않게.
 * 담는 것: 사용자가 확인한 약속 시각 · 방문지 · 여유, 그리고 내비에서 확인된 승인(주차장 ID · 좌표 · 정보 시각 · 판단 버전 · 목표 키).
 * 담지 않는 것: 주차 대수 · 소요 시간 · 판단 결과 — 저장한 값을 지금 사실로 쓰지 않는다. 복원 뒤 새로 받는다.
 * 승인은 복원 때 내비 목적지를 다시 읽어 같을 때만 '경로 설정됨'으로 되살린다(ArriveHandoff.restore). 약속이 지났거나 저장값이 깨졌으면 버린다.
 * MissionStore 와 같은 방식(SharedPreferences · JSON · 반쯤 복원하지 않음).
 * 운전자 · 이동 목적별 키로 나눈다(ArriveOwner) — 다른 운전자의 목표 · 승인이 보이지 않게. 프로필 없이(GUEST) 탄 이동은 저장하지 않는다.
 */
data class ArriveSaved(
    val owner: ArriveOwner,
    val appointmentAt: Long,
    val place: NaviPlace,
    val placeFromNavi: Boolean,
    val bufferMin: Int,
    val approval: ArriveApproval?,
    val savedAt: Long,
)

class ArriveStore(context: Context) {
    private val prefs = context.getSharedPreferences("copilot.arrive", Context.MODE_PRIVATE)
    private val last = mutableMapOf<String, String?>()

    /** s 가 null 이면 그 주인의 기록만 지운다 · 게스트는 저장하지 않는다 */
    fun save(owner: ArriveOwner, s: ArriveSaved?) {
        if (!owner.savable) return
        val key = owner.storeKey
        val json = s?.takeIf { it.owner == owner }?.let { encode(it).toString() }
        if (last.containsKey(key) && last[key] == json) return
        last[key] = json
        prefs.edit().apply { if (json == null) remove(key) else putString(key, json) }.apply()
    }

    /** 지금 주인의 기록만 — 운전자 · 이동이 같고 약속이 아직 남았을 때 */
    fun load(owner: ArriveOwner, now: Long): ArriveSaved? = try {
        prefs.getString(owner.storeKey, null)?.let { decode(JSONObject(it)) }?.takeIf { owner.canRestore(it.owner, it.appointmentAt, now) }
    } catch (_: Exception) { null }

    companion object {

        fun encode(s: ArriveSaved): JSONObject = JSONObject().apply {
            put("version", 2); put("driver", s.owner.driver ?: JSONObject.NULL); put("mode", s.owner.mode.name); put("appointmentAt", s.appointmentAt); put("bufferMin", s.bufferMin); put("placeFromNavi", s.placeFromNavi); put("savedAt", s.savedAt)
            put("place", JSONObject().put("name", s.place.name).put("lat", s.place.lat).put("lon", s.place.lon))
            put("approval", s.approval?.let { a ->
                JSONObject().put("parkingId", a.parkingId).put("name", a.name).put("lat", a.point.lat).put("lon", a.point.lon)
                    .put("dataAt", a.dataAt ?: JSONObject.NULL).put("ruleVersion", a.ruleVersion).put("goalKey", a.goalKey).put("approvedAt", a.approvedAt)
            } ?: JSONObject.NULL)
        }

        fun decode(o: JSONObject): ArriveSaved {
            require(o.getInt("version") == 2)
            val owner = ArriveOwner(if (o.isNull("driver")) null else o.getString("driver"), ProfileMode.valueOf(o.getString("mode")))
            val p = o.getJSONObject("place")
            val a = if (o.isNull("approval")) null else o.getJSONObject("approval").let {
                ArriveApproval(it.getString("parkingId"), it.getString("name"), GeoPoint(it.getDouble("lat"), it.getDouble("lon")),
                    if (it.isNull("dataAt")) null else it.getLong("dataAt"), it.getString("ruleVersion"), it.getString("goalKey"), it.getLong("approvedAt"))
            }
            return ArriveSaved(owner, o.getLong("appointmentAt"), NaviPlace(p.getString("name"), p.getDouble("lat"), p.getDouble("lon"), null),
                o.getBoolean("placeFromNavi"), o.getInt("bufferMin"), a, o.getLong("savedAt"))
        }
    }
}
