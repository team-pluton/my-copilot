package app.commadrive.core

/**
 * Pleos SDK 원시값 → 엔진 입력. 어댑터가 부르지만 규칙은 여기 두어 테스트로 고정한다.
 *
 * 웹(TS)에는 SDK 가 없어 거울이 없다 — 엔진·추정 규칙이 아니라 **입력 정규화**다.
 *
 * 왜 필요한가 (에뮬레이터 실측, research 12·16절):
 *  - 배터리 용량이 **Wh**(77400)로 왔는데 kWh 로 읽어 400km 를 "충분"이라 판단했다(E8 · E25).
 *  - 내비 목적지가 없을 때 남은 거리 0m · 좌표 (0,0) 이 와서 "주행 0% · 충분 · 80%까지 약 0분"이 됐다(RESULT §7-4).
 * 둘 다 "모르면 모른다" 쪽으로 — 틀린 값으로 "충분"이라 말하는 것이 가장 나쁘다.
 */
object SdkUnits {
    /** 승용 EV 배터리로 믿을 수 있는 범위(kWh). 밖이면 단위를 모르는 값이다 */
    val PLAUSIBLE_CAPACITY_KWH = 10.0..250.0

    /**
     * 용량 원시값을 kWh 로. 1000 이 넘으면 Wh 로 본다(250kWh 를 넘는 승용 배터리는 없고, 1000Wh 미만 배터리도 없다).
     * 바꾼 뒤에도 범위 밖이면 null → 호출자가 차종 기본값을 쓴다.
     */
    fun capacityKwh(raw: Double?): Double? {
        if (raw == null || raw.isNaN() || raw <= 0) return null
        val kwh = if (raw > 1000) raw / 1000 else raw
        return kwh.takeIf { it in PLAUSIBLE_CAPACITY_KWH }
    }

    /**
     * 내비 목적지 → 남은 거리(km). 목적지가 없다는 신호(0m 이하 · 좌표 (0,0))면 null.
     * null 은 "경로 없음"이다 — 0km 로 쓰면 어떤 잔량이든 "충분"이 된다.
     */
    fun remainingKm(remainMeters: Number?, lat: Double, lon: Double): Double? {
        val m = remainMeters?.toDouble() ?: return null
        if (m.isNaN() || m <= 0) return null
        if (lat == 0.0 && lon == 0.0) return null
        return m / 1000.0
    }
}
