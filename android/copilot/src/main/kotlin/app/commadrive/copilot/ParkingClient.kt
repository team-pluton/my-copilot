package app.commadrive.copilot

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * 서울 시영 주차 프록시 클라이언트(ARRIVE READY) — 앱에는 서울 API 키가 없다. 개발 PC 의 프록시 `/v1/parking`(scripts/charger-proxy/server.ts)으로
 * `adb reverse tcp:8787 tcp:8787` 을 통해 온다. 응답은 API 행 그대로 — 정규화 · 판단은 core ArriveReady 가 한다(거울 규칙).
 * 실패는 예외로 내지 않고 이유를 돌려준다 — 판단은 '없다'가 아니라 '확인하지 못했어요'로 말한다.
 */
object ParkingClient {
    private const val TIMEOUT_MS = 20_000

    data class Result(val ok: Boolean, val reason: String?, val retrievedAt: Long, val realtime: List<Map<String, String>>, val info: List<Map<String, String>>)

    suspend fun fetch(lat: Double, lon: Double, radiusM: Int): Result = withContext(Dispatchers.IO) {
        runCatching {
            val c = URL("http://127.0.0.1:8787/v1/parking?lat=$lat&lon=$lon&radius=$radiusM").openConnection() as HttpURLConnection
            c.connectTimeout = TIMEOUT_MS; c.readTimeout = TIMEOUT_MS
            try {
                if (c.responseCode != 200) return@runCatching failed("프록시 응답 ${c.responseCode}")
                parse(c.inputStream.bufferedReader(Charsets.UTF_8).readText())
            } finally { c.disconnect() }
        }.getOrElse { failed("프록시에 연결하지 못했어요") }
    }

    private fun failed(reason: String) = Result(false, reason, System.currentTimeMillis(), emptyList(), emptyList())

    internal fun parse(text: String): Result {
        val o = JSONObject(text)
        val ok = o.optString("availability") == "OK"
        val reason = if (o.isNull("errorReason")) null else o.optString("errorReason")
        fun rows(a: JSONArray?) = if (a == null) emptyList() else List(a.length()) { i -> val r = a.getJSONObject(i); buildMap { r.keys().forEach { k -> put(k, r.optString(k)) } } }
        return Result(ok, reason, o.optLong("retrievedAt", System.currentTimeMillis()), rows(o.optJSONArray("realtime")), rows(o.optJSONArray("info")))
    }
}
