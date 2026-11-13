package app.commadrive.core.assistant

/**
 * 데이터 신선도 · 출처 — `src/lib/assistant/freshness.ts` 의 거울.
 * 기어·주행 제한·속도는 끊기는 순간 모름 · 배터리·공조·도어는 10분까지 "끊기기 전 값"으로 보여 주되 판단에는 안 씀 · 프로필은 기한 없음.
 */
enum class SignalKind(val label: String, val maxAgeMin: Int?) {
    GEAR("기어", 0), UX("주행 제한", 0), SPEED("속도", 0), SOC("배터리", 10), HVAC("공조 온도", 10), DOOR("도어", 10), ROUTE("내비 경로", 0), PROFILE("내 설정", null)
}
enum class Freshness { FRESH, STALE, UNKNOWN }
/** 신호 자체의 상태 — 연결과 별개(외부 평가 8 ①). OK 가 아니면 연결과 무관하게 모름 (freshness.ts SignalStatus) */
enum class SignalStatus(val label: String) { OK("정상"), NONE("받은 적 없음"), ERROR("조회 실패") }
/** 에너지 추정의 근거 등급 — 입력 계획 기반과 내비 경로 기반을 같은 정확도처럼 보이지 않게 (freshness.ts EnergyBasis) */
enum class EnergyBasis(val label: String) {
    NAVI_ROUTE("내비 경로 기반 추정"), USER_PLAN("입력 계획 기반 추정 · 내비 경로 아님"), NO_ROUTE("목적지·경로 정보 필요"), NO_BATTERY("판단 보류 · 배터리 값 없음")
}

/** 연결은 하나가 아니다 — 주행 신호(AAOS) · 배터리(Pleos EvBattery) · 공조·도어(Pleos HVAC·Door)가 따로 온다 (freshness.ts LinkKind) */
enum class LinkKind(val label: String) { DRIVE("주행 신호(기어·속도·주행 제한)"), ENERGY("배터리"), CABIN("공조·도어") }
/** 기능별 필수 입력 — 이것만 검사한다 (freshness.ts REQUIRED_SIGNALS) */
enum class Feature(val label: String, val required: List<SignalKind>) {
    ENERGY("에너지 판단", listOf(SignalKind.SOC)), CLIMATE_PREPARE("출발 준비 공조", listOf(SignalKind.HVAC)), DRIVE_RESTRICTION("주행 제한", listOf(SignalKind.GEAR, SignalKind.UX)), FINISH("하차 확인", emptyList())
}
data class Readiness(val ok: Boolean, val missing: List<SignalKind>) {
    val line: String? get() = if (ok) null else "부족한 정보: ${missing.joinToString(" · ") { it.label }}"
}

/**
 * 동력원 — MY CO-PILOT 은 전체 차량 대상(오너 결정 2026-10-28). 공통 기능은 동력원과 무관하고 에너지 판단만 동력원별로 갈린다.
 * 지금 엔진은 EV 배터리만 센다 — 연료 계산은 만들지 않고 "지원 안 함 · 확인 전"으로 안내. SDK 에 Fuel.getFuelPercent 는 있지만(javap 2026-10-28) 실제 수신·단위·동력원 판별이 미검증 (freshness.ts Powertrain)
 * 동력원 · SDK capability(VehicleCapability) · 기능 가용성(Availability)은 다른 개념 — EvBattery 지원만으로 EV 라 판정하지 않는다(PHEV). UNKNOWN 이어도 공통 기능은 제공.
 */
enum class Powertrain(val label: String) { EV("전기차"), PHEV("플러그인 하이브리드"), HEV("하이브리드"), ICE("내연기관"), UNKNOWN("차량 유형 확인 전") }
enum class UnavailableReason { POWERTRAIN, NOT_SUPPORTED, NO_PERMISSION }
data class VehicleCapability(val powertrain: Powertrain, val supported: Map<Feature, Boolean> = emptyMap(), val granted: Map<Feature, Boolean> = emptyMap())
/** 기능 가용성 — 안 되면 그 기능만 끄고 이유를 적는다. 공통 기능은 계속 쓴다 (freshness.ts Availability) */
data class Availability(val ok: Boolean, val reason: UnavailableReason?, val line: String?) {
    companion object { val OK = Availability(true, null, null) }
}

/** 제품 화면의 출처는 넷뿐 — SDK 이름·권한·지원 여부는 개발자 정보에만 (freshness.ts ORIGIN_LABEL) */
enum class SourceOrigin(val label: String) { VEHICLE("차량 정보"), USER("직접 설정"), ESTIMATE("추정"), DEMO("시연 데이터") }

object Fresh {
    /** 에너지 판단을 할 수 있는 동력원 — 엔진이 셀 수 있을 때만 */
    val ENERGY_POWERTRAINS = listOf(Powertrain.EV)

    /** 이유의 순서: 동력원 → 차량 지원(checkXXXCapabilities) → 권한. 입력 부족(readiness)은 가용한 기능 안에서의 보류라 여기 없다 */
    fun availability(feature: Feature, cap: VehicleCapability): Availability = when {
        feature == Feature.ENERGY && cap.powertrain !in ENERGY_POWERTRAINS -> Availability(
            false, UnavailableReason.POWERTRAIN,
            if (cap.powertrain == Powertrain.UNKNOWN) "에너지 판단 보류 · 차량 유형 확인 전" else "${cap.powertrain.label} 연료 계산은 아직 지원하지 않음 · 공식 SDK 데이터 확인 전",
        )
        cap.supported[feature] == false -> Availability(false, UnavailableReason.NOT_SUPPORTED, "${feature.label} · 이 차량이 지원하지 않는 기능")
        cap.granted[feature] == false -> Availability(false, UnavailableReason.NO_PERMISSION, "${feature.label} · 차량 데이터 권한 없음")
        else -> Availability.OK
    }

    fun of(kind: SignalKind, readAtMin: Int?, nowMin: Int, live: Boolean, status: SignalStatus = SignalStatus.OK): Freshness = when {
        kind == SignalKind.PROFILE -> Freshness.FRESH
        status != SignalStatus.OK -> Freshness.UNKNOWN
        readAtMin == null -> Freshness.UNKNOWN
        live -> Freshness.FRESH
        (kind.maxAgeMin ?: 0) > 0 && nowMin - readAtMin <= (kind.maxAgeMin ?: 0) -> Freshness.STALE
        else -> Freshness.UNKNOWN
    }

    fun usable(f: Freshness) = f == Freshness.FRESH

    /** 신호가 어느 연결로 오나 — 내 설정은 연결이 아니다 */
    fun linkOf(kind: SignalKind): LinkKind? = when (kind) {
        SignalKind.GEAR, SignalKind.UX, SignalKind.SPEED -> LinkKind.DRIVE
        SignalKind.SOC -> LinkKind.ENERGY
        SignalKind.HVAC, SignalKind.DOOR -> LinkKind.CABIN
        SignalKind.ROUTE, SignalKind.PROFILE -> null
    }

    fun energyBasisOf(fresh: Map<SignalKind, Freshness>, hasUserRoute: Boolean): EnergyBasis = when {
        !readiness(Feature.ENERGY, fresh).ok -> EnergyBasis.NO_BATTERY
        usable(fresh[SignalKind.ROUTE] ?: Freshness.UNKNOWN) -> EnergyBasis.NAVI_ROUTE
        hasUserRoute -> EnergyBasis.USER_PLAN
        else -> EnergyBasis.NO_ROUTE
    }

    /** 필수 입력이 전부 신선한가. 아니면 판단을 보류하고 부족한 신호를 돌려준다 */
    fun readiness(feature: Feature, fresh: Map<SignalKind, Freshness>): Readiness {
        val missing = feature.required.filter { !usable(fresh[it] ?: Freshness.UNKNOWN) }
        return Readiness(missing.isEmpty(), missing)
    }

    fun sourceLine(f: Freshness, clock: String?, origin: SourceOrigin): String? = when {
        f == Freshness.UNKNOWN || clock == null -> null
        f == Freshness.FRESH -> "${origin.label} · $clock"
        else -> "끊기기 전 값 · $clock · 판단에 쓰지 않음"
    }
}
