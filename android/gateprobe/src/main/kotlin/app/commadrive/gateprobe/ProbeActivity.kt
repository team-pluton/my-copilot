package app.commadrive.gateprobe

import ai.pleos.playground.navi.constants.NaviErrorCode
import ai.pleos.playground.navi.constants.RouteOption
import ai.pleos.playground.navi.data.DestinationInfo
import ai.pleos.playground.navi.data.RouteInfo
import ai.pleos.playground.navi.data.RouteStateInfo
import ai.pleos.playground.navi.data.TripInfo
import ai.pleos.playground.navi.data.TripRequest
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import android.app.Activity
import android.os.Bundle
import android.util.Log

/**
 * adb 로 부른다 — 화면 없음, 결과는 logcat `GateProbe`.
 *   am start -n app.commadrive.gateprobe/.ProbeActivity --es op trip  --es pts "37.5734,126.9759,세종로;37.5715,126.9950,종묘"
 *   am start -n app.commadrive.gateprobe/.ProbeActivity --es op route --es pts "37.5734,126.9759,세종로 공영주차장"
 *   am start -n app.commadrive.gateprobe/.ProbeActivity --es op state
 * trip 은 좌표마다 차례로(앞 응답을 받은 뒤 다음) 보낸다 — onTripInfo 에 어느 요청의 답인지 표시가 없어서다.
 */
class ProbeActivity : Activity() {
    private lateinit var navi: NaviHelper
    private var queue = ArrayDeque<Triple<Double, Double, String>>()
    private var sentAt = 0L

    private val listener = object : NaviHelperEventListener {
        override fun onTripInfo(info: TripInfo) {
            log("trip ← distance=${info.distance} eta=${info.eta} socAtDest=${info.estimatedSocAtDest} energy=${info.energyConsumption} traffic=${info.summary.trafficConditions} points=${info.summary.routePoints.size} after=${System.currentTimeMillis() - sentAt}ms")
            next()
        }
        override fun onRouteStateInfo(info: RouteStateInfo) { log("state ← routing=${info.isRouting} remainCharge=${info.remainDestinationChargingInt}") }
        override fun onDestinationInfo(info: DestinationInfo) { log("dest ← name=${info.name} lat=${info.latitude} lon=${info.longitude} poiId=${info.poiId} remainDistance=${info.remainDistance} remainTime=${info.remainTime}") }
        override fun onRouteStarted(info: ai.pleos.playground.navi.data.RouteStartInfo) { log("routeStarted ← $info after=${System.currentTimeMillis() - sentAt}ms"); navi.getDestinationInfo() }
        override fun onError(code: NaviErrorCode) { log("error ← $code after=${System.currentTimeMillis() - sentAt}ms"); next() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val op = intent.getStringExtra("op") ?: "state"
        queue = ArrayDeque((intent.getStringExtra("pts") ?: "").split(';').filter { it.isNotBlank() }.map { p ->
            val a = p.split(','); Triple(a[0].trim().toDouble(), a[1].trim().toDouble(), a.getOrElse(2) { "probe" }.trim())
        })
        navi = NaviHelper(applicationContext)
        navi.initialize({
            navi.addListener(listener)
            log("ready op=$op n=${queue.size}")
            when (op) {
                "trip" -> next()
                "route" -> queue.removeFirstOrNull()?.let { (lat, lon, name) ->
                    sentAt = System.currentTimeMillis()
                    log("route → $name ($lat, $lon)")
                    navi.requestRoute(RouteInfo(lat, lon, null, null, name, "", "", "", RouteOption.RECOMMENDED, "", false))
                }
                else -> { navi.getRouteStateInfo(); navi.getDestinationInfo() }
            }
        }, { log("init failed $it") })
        moveTaskToBack(true)
    }

    private fun next() {
        val (lat, lon, name) = queue.removeFirstOrNull() ?: return log("trip done")
        sentAt = System.currentTimeMillis()
        log("trip → $name ($lat, $lon)")
        runCatching { navi.requestTrip(TripRequest(lat, lon, "", name, "")) }.onFailure { log("trip threw $it"); next() }
    }

    private fun log(s: String) { Log.d("GateProbe", s) }
}
