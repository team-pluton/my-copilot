package app.commadrive.copilot

import app.commadrive.core.assistant.ChargerData
import app.commadrive.core.assistant.ChargerRecord
import app.commadrive.core.assistant.DataEvidence
import app.commadrive.core.assistant.FactAvailability
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * 충전소 프록시 클라이언트 — 앱에는 API 키가 없다. 개발 PC 의 프록시(scripts/charger-proxy/server.ts)로 `adb reverse tcp:8787 tcp:8787` 을 통해 온다.
 * 프록시가 없거나 실패해도 예외를 밖으로 내지 않는다 — 차량 기능과 Mission 은 이 결과와 무관하게 돈다(지시서 4절).
 */
object ChargerClient {
    private const val URL_CORRIDOR = "http://127.0.0.1:8787/v1/corridor"
    private const val TIMEOUT_MS = 20_000

    data class Result(
        val availability: FactAvailability,
        val errorReason: String?,
        val evidence: DataEvidence,
        val mapping: Map<String, List<String>>,
        val records: List<ChargerRecord>,
    )

    suspend fun fetch(): Result = withContext(Dispatchers.IO) {
        runCatching {
            val c = URL(URL_CORRIDOR).openConnection() as HttpURLConnection
            c.connectTimeout = TIMEOUT_MS; c.readTimeout = TIMEOUT_MS
            try {
                if (c.responseCode != 200) return@runCatching failed("프록시 응답 ${c.responseCode}")
                parse(c.inputStream.bufferedReader(Charsets.UTF_8).readText())
            } finally { c.disconnect() }
        }.getOrElse { failed("프록시에 연결하지 못했어요", FactAvailability.NOT_CONNECTED) }
    }

    private fun failed(reason: String, a: FactAvailability = FactAvailability.FAILED) = Result(a, reason, DataEvidence.UNKNOWN, emptyMap(), emptyList())

    internal fun parse(text: String): Result {
        val o = JSONObject(text)
        val availability = runCatching { FactAvailability.valueOf(o.getString("availability")) }.getOrDefault(FactAvailability.FAILED)
        val error = if (o.isNull("errorReason")) null else o.getString("errorReason")
        val evidence = runCatching { DataEvidence.valueOf(o.getString("evidence")) }.getOrDefault(DataEvidence.UNKNOWN)
        val at = if (o.isNull("retrievedAt")) null else o.getLong("retrievedAt")
        val map = o.optJSONObject("mapping")
        val mapping = buildMap { map?.keys()?.forEach { k -> val a = map.getJSONArray(k); put(k, List(a.length()) { a.getString(it) }) } }
        val items = o.optJSONArray("items")
        val records = if (items == null || at == null) emptyList() else List(items.length()) { i ->
            val it = items.getJSONObject(i)
            val raw = buildMap<String, String?> { it.keys().forEach { k -> put(k, it.optString(k)) } }
            ChargerData.normalize(raw, at, evidence)
        }.filterNotNull()
        return Result(availability, error, evidence, mapping, ChargerData.dedupe(records))
    }
}
