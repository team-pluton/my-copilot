package app.commadrive.core.assistant

/**
 * 출발 준비 = 하나의 준비 과정 — `src/lib/assistant/prepare.ts` 의 거울.
 * 항목마다 끝남 · 할 일 남음 · 앱이 확인 못 함(남은 일로 세지 않는다) · 해당 없음. 남은 일이 없으면 완료 버튼을 요구하지 않는다.
 */
enum class PrepareItemKey(val label: String) { CLIMATE("공조"), PACKING("준비물"), ENERGY("충전 계획") }
/** 확인 완료 · 확인 필요 · 이번에는 건너뜀(완료 아님) · 지원하지 않음 · 해당 없음 (3차 P0-4) */
enum class PrepareItemState(val label: String) { DONE("확인 완료"), NEEDS_CHECK("확인 필요"), SKIPPED("이번에는 건너뜀"), UNSUPPORTED("지원하지 않음"), NOT_APPLICABLE("") }
data class PrepareItem(val key: PrepareItemKey, val state: PrepareItemState, val line: String)

data class PrepareInput(
    val climate: ClimateState,
    val currentC: Double?,
    val targetC: Double?,
    val climateDecision: ClimateDecision?,
    /** 공조를 바꿀 수 없는 이유(차종 미지원 · 권한 없음) — 확인 요청은 이유가 아니다 */
    val climateBlocked: String?,
    val packingTotal: Int,
    val packedCount: Int,
    /** 충전 판정 — 경유지를 골랐으면 그 경유지를 포함한 계획의 판정 */
    val energy: EnergyStatus,
    val waypointChosen: Boolean,
    val skipped: List<PrepareItemKey> = emptyList(),
)

data class PrepareStatus(val items: List<PrepareItem>, val done: Int, val needs: Int, val unsupported: Int, val skipped: Int, val ready: Boolean, val summary: String)

object Prepare {
    private val COUNT = listOf("", "한", "두", "세")
    private fun r0(x: Double) = Math.round(x)

    private fun climateItem(i: PrepareInput): PrepareItem {
        val t = i.targetC?.let { r0(it) }
        return when {
            i.climate == ClimateState.SKIP -> PrepareItem(PrepareItemKey.CLIMATE, PrepareItemState.NOT_APPLICABLE, "이 프로필은 공조를 맞추지 않습니다")
            i.climate == ClimateState.UNREADABLE -> PrepareItem(PrepareItemKey.CLIMATE, PrepareItemState.UNSUPPORTED, "공조 온도를 읽을 수 없어요 · 차량 공조 패널에서 직접 확인")
            i.climate == ClimateState.SAME -> PrepareItem(PrepareItemKey.CLIMATE, PrepareItemState.DONE, "저장한 ${t}°C 와 같습니다")
            i.climateDecision != null -> PrepareItem(
                PrepareItemKey.CLIMATE, PrepareItemState.DONE,
                if (i.climateDecision.decision == ClimateDecisionKind.APPLIED) "${r0(i.climateDecision.valueC)}°C 로 맞췄습니다 (시연 데이터)" else "${r0(i.climateDecision.valueC)}°C 그대로 두기로 했습니다",
            )
            PrepareItemKey.CLIMATE in i.skipped -> PrepareItem(PrepareItemKey.CLIMATE, PrepareItemState.SKIPPED, "이번에는 건너뛰었습니다 · 지금 ${i.currentC?.let { r0(it).toString() } ?: "—"}°C")
            i.climateBlocked != null -> PrepareItem(PrepareItemKey.CLIMATE, PrepareItemState.UNSUPPORTED, "${i.climateBlocked} · 차량 공조 패널에서 ${t}°C 로 맞출 수 있습니다")
            else -> PrepareItem(PrepareItemKey.CLIMATE, PrepareItemState.NEEDS_CHECK, "지금 ${i.currentC?.let { r0(it).toString() } ?: "—"}°C → 저장한 ${t}°C")
        }
    }

    private fun packingItem(i: PrepareInput): PrepareItem {
        if (i.packingTotal == 0) return PrepareItem(PrepareItemKey.PACKING, PrepareItemState.NOT_APPLICABLE, "준비물 목록이 없습니다")
        val left = i.packingTotal - minOf(i.packedCount, i.packingTotal)
        return when {
            left == 0 -> PrepareItem(PrepareItemKey.PACKING, PrepareItemState.DONE, "${i.packingTotal}개 모두 챙겼습니다")
            PrepareItemKey.PACKING in i.skipped -> PrepareItem(PrepareItemKey.PACKING, PrepareItemState.SKIPPED, "이번에는 건너뛰었습니다 · ${left}개 확인 안 함")
            else -> PrepareItem(PrepareItemKey.PACKING, PrepareItemState.NEEDS_CHECK, "${i.packingTotal}개 중 ${left}개 남음")
        }
    }

    // 경유지를 골랐다는 사실만으로 끝내지 않는다 — 그 경유지를 포함한 계획이 충분이어야 확인 완료
    private fun energyItem(i: PrepareInput): PrepareItem = when {
        i.energy == EnergyStatus.OK -> PrepareItem(PrepareItemKey.ENERGY, PrepareItemState.DONE, if (i.waypointChosen) "선택한 충전 경유지를 포함하면 충분합니다 (추정)" else "충전 없이 충분합니다 (추정)")
        i.energy == EnergyStatus.UNKNOWN -> PrepareItem(PrepareItemKey.ENERGY, PrepareItemState.UNSUPPORTED, "차량 정보가 없어 지금은 확인할 수 없어요")
        PrepareItemKey.ENERGY in i.skipped -> PrepareItem(PrepareItemKey.ENERGY, PrepareItemState.SKIPPED, "이번에는 건너뛰었습니다 · 충전 계획 없이 출발")
        i.waypointChosen -> PrepareItem(PrepareItemKey.ENERGY, PrepareItemState.NEEDS_CHECK, "선택한 경유지만으로는 여유가 크지 않아요")
        else -> PrepareItem(PrepareItemKey.ENERGY, PrepareItemState.NEEDS_CHECK, if (i.energy == EnergyStatus.SHORT) "충전 계획이 필요해요" else "에너지 여유가 크지 않아요 · 선택지를 확인해 주세요")
    }

    private fun names(items: List<PrepareItem>) = items.joinToString("·") { it.key.label }

    /** 은/는 — 마지막 글자 받침으로 고른다 */
    private fun eunNeun(w: String): String { val c = w.last().code - 0xAC00; return if (c in 0 until 11172 && c % 28 != 0) "은" else "는" }

    fun status(i: PrepareInput): PrepareStatus {
        val items = listOf(climateItem(i), packingItem(i), energyItem(i))
        val doneItems = items.filter { it.state == PrepareItemState.DONE }
        val needItems = items.filter { it.state == PrepareItemState.NEEDS_CHECK }
        val unsupItems = items.filter { it.state == PrepareItemState.UNSUPPORTED }
        val skipItems = items.filter { it.state == PrepareItemState.SKIPPED }
        val ready = needItems.isEmpty()
        val tail = (if (unsupItems.isNotEmpty()) " · ${names(unsupItems)}${eunNeun(names(unsupItems))} 차량에서 직접 확인해 주세요" else "") +
            (if (skipItems.isNotEmpty()) " · ${names(skipItems)}${eunNeun(names(skipItems))} 이번에는 건너뛰었습니다" else "")
        val summary = when {
            ready && doneItems.isEmpty() && unsupItems.isEmpty() && skipItems.isEmpty() -> "확인할 출발 준비가 없습니다 · 바로 출발하셔도 됩니다"
            ready && skipItems.isNotEmpty() -> "남은 확인은 없습니다$tail"
            ready && unsupItems.isNotEmpty() -> "확인할 수 있는 준비는 끝났습니다$tail"
            ready -> "출발 준비가 끝났습니다 · 바로 출발하셔도 됩니다"
            doneItems.isNotEmpty() -> "출발 준비에서 ${COUNT[doneItems.size]} 가지는 확인됐고, ${names(needItems)} ${COUNT[needItems.size]} 가지만 남았습니다$tail"
            else -> "출발 전에 ${names(needItems)} ${COUNT[needItems.size]} 가지를 확인해 주세요$tail"
        }
        return PrepareStatus(items, doneItems.size, needItems.size, unsupItems.size, skipItems.size, ready, summary)
    }
}
