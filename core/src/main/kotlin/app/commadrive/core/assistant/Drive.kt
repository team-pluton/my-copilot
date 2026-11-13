package app.commadrive.core.assistant

/**
 * 주행 중 화면 한 줄 — `src/lib/assistant/drive.ts` 의 거울 (3차 P0-2).
 * QUIET(문제 없음 · 작은 한 줄 · 음성 없음) · ATTENTION(짧게 한 번, 선택지는 정차 후) · UNKNOWN(지난 판단을 되풀이하지 않음).
 * 제조사 경고 시스템이 아니다 — 빨강·경고 아이콘으로 안전 경고처럼 보이게 하지 않는다.
 */
enum class DriveLevel { QUIET, ATTENTION, UNKNOWN }
data class DriveStop(val name: String, val km: Int)
data class DriveLine(val level: DriveLevel, val title: String, val sub: String?, val stop: DriveStop?)

object Drive {
    fun line(view: EnergyView, linkLive: Boolean, stop: DriveStop?, legLabel: String): DriveLine = when {
        !linkLive || view.status == EnergyStatus.UNKNOWN -> DriveLine(DriveLevel.UNKNOWN, "차량 정보 확인 중", "최신 정보가 오기 전에는 판단을 말하지 않습니다", null)
        view.status == EnergyStatus.OK -> if (stop != null) DriveLine(DriveLevel.QUIET, "다음 충전 경유지 · ${stop.name}", null, stop)
            else DriveLine(DriveLevel.QUIET, "${legLabel}까지 에너지 문제 없음 · 추정", null, null)
        else -> DriveLine(DriveLevel.ATTENTION, if (view.status == EnergyStatus.SHORT) "충전 계획이 필요해요" else "에너지 여유가 크지 않아요", "정차한 뒤 선택지를 볼 수 있어요", stop)
    }
}
