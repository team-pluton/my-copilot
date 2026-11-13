/**
 * 출발 준비 = 하나의 준비 과정 — core/assistant/Prepare.kt 의 거울.
 *
 * 1차의 `prepareSummary` 는 (완료 n, 확인 필요 m) 숫자뿐이라 "공조를 23°C 로 맞췄다"가 가치처럼 보였다(검토 ③).
 * 사용자에게 가치는 **출발 전에 무엇이 끝났고 무엇이 남았나** 한 문장이다. 그래서 항목마다 상태를 나눈다:
 *  · DONE        — 끝남(같음 · 적용 확인 · 그대로 두기로 함 · 다 챙김 · 충분 · 경유지 정함)
 *  · NEEDS_CHECK — 사용자가 할 일이 남음
 *  · UNSUPPORTED — 앱이 확인할 수 없음(읽기 불가 · 차종 미지원 · 권한 없음 · 차량 값 없음).
 *                  **남은 일로 세지 않는다** — 사용자가 앱에서 해결할 수 있는 일이 아니다. 대신 "직접 확인"을 따로 적는다
 *  · SKIPPED     — 사용자가 **이번에는 건너뜀**. 남은 일은 아니지만 완료도 아니다(3차 P0-4)
 *  · NOT_APPLICABLE — 이 프로필에는 없는 항목
 * 화면을 열었다거나 버튼을 눌렀다는 것만으로 완료가 되지 않는다: 공조는 콜백 검증 · 준비물은 사용자 체크 · 충전은 판정(또는 경유지를 포함한 판정)이 충분일 때.
 * 남은 일이 없으면 "출발 준비 완료"를 누르라고 하지 않는다(ready).
 */
import type { EnergyStatus } from "./energy-view";
import type { ClimateDecision } from "./memory";

export type PrepareItemKey = "CLIMATE" | "PACKING" | "ENERGY";
export type PrepareItemState = "DONE" | "NEEDS_CHECK" | "SKIPPED" | "UNSUPPORTED" | "NOT_APPLICABLE";

export const PREPARE_STATE_LABEL: Record<PrepareItemState, string> = { DONE: "확인 완료", NEEDS_CHECK: "확인 필요", SKIPPED: "이번에는 건너뜀", UNSUPPORTED: "지원하지 않음", NOT_APPLICABLE: "" };
export type PrepareItem = { key: PrepareItemKey; state: PrepareItemState; line: string };

export const PREPARE_ITEM_LABEL: Record<PrepareItemKey, string> = { CLIMATE: "공조", PACKING: "준비물", ENERGY: "충전 계획" };

export type PrepareInput = {
  /** 공조 비교 결과 — SKIP: 저장 온도 없음 · UNREADABLE: 지금 온도를 못 읽음 */
  climate: "SKIP" | "SAME" | "DIFFERENT" | "UNREADABLE";
  currentC: number | null;
  targetC: number | null;
  /** 이번 이동에서 사용자가 정한 것(적용 확인 · 그대로 두기) */
  climateDecision: ClimateDecision | null;
  /** 공조를 바꿀 수 없는 이유(차종 미지원 · 권한 없음) — 확인 요청(NEEDS_CONFIRMATION)은 이유가 아니다 */
  climateBlocked: string | null;
  packingTotal: number;
  packedCount: number;
  /** 충전 판정 — 경유지를 골랐으면 그 경유지를 포함한 계획의 판정 */
  energy: EnergyStatus;
  waypointChosen: boolean;
  /** 사용자가 이번에는 건너뛴 항목 */
  skipped: PrepareItemKey[];
};

export type PrepareStatus = {
  items: PrepareItem[];
  done: number;
  /** 사용자가 할 일 */
  needs: number;
  /** 앱이 확인 못 한 것 — 차량에서 직접 */
  unsupported: number;
  /** 이번에는 건너뛴 것 — 남은 일도, 완료도 아니다 */
  skipped: number;
  /** 남은 일이 없다 — 출발 준비 완료를 따로 묻지 않는다 */
  ready: boolean;
  summary: string;
};

const COUNT = ["", "한", "두", "세"];
const r0 = (x: number) => Math.round(x);

function climateItem(i: PrepareInput): PrepareItem {
  const t = i.targetC === null ? null : r0(i.targetC);
  if (i.climate === "SKIP") return { key: "CLIMATE", state: "NOT_APPLICABLE", line: "이 프로필은 공조를 맞추지 않습니다" };
  if (i.climate === "UNREADABLE") return { key: "CLIMATE", state: "UNSUPPORTED", line: "공조 온도를 읽을 수 없어요 · 차량 공조 패널에서 직접 확인" };
  if (i.climate === "SAME") return { key: "CLIMATE", state: "DONE", line: `저장한 ${t}°C 와 같습니다` };
  if (i.climateDecision) {
    return { key: "CLIMATE", state: "DONE", line: i.climateDecision.decision === "APPLIED" ? `${r0(i.climateDecision.valueC)}°C 로 맞췄습니다 (시연 데이터)` : `${r0(i.climateDecision.valueC)}°C 그대로 두기로 했습니다` };
  }
  if (i.skipped.includes("CLIMATE")) return { key: "CLIMATE", state: "SKIPPED", line: `이번에는 건너뛰었습니다 · 지금 ${i.currentC === null ? "—" : r0(i.currentC)}°C` };
  if (i.climateBlocked) return { key: "CLIMATE", state: "UNSUPPORTED", line: `${i.climateBlocked} · 차량 공조 패널에서 ${t}°C 로 맞출 수 있습니다` };
  return { key: "CLIMATE", state: "NEEDS_CHECK", line: `지금 ${i.currentC === null ? "—" : r0(i.currentC)}°C → 저장한 ${t}°C` };
}

function packingItem(i: PrepareInput): PrepareItem {
  if (i.packingTotal === 0) return { key: "PACKING", state: "NOT_APPLICABLE", line: "준비물 목록이 없습니다" };
  const left = i.packingTotal - Math.min(i.packedCount, i.packingTotal);
  if (left === 0) return { key: "PACKING", state: "DONE", line: `${i.packingTotal}개 모두 챙겼습니다` };
  if (i.skipped.includes("PACKING")) return { key: "PACKING", state: "SKIPPED", line: `이번에는 건너뛰었습니다 · ${left}개 확인 안 함` };
  return { key: "PACKING", state: "NEEDS_CHECK", line: `${i.packingTotal}개 중 ${left}개 남음` };
}

function energyItem(i: PrepareInput): PrepareItem {
  // 경유지를 골랐다는 사실만으로 끝내지 않는다 — 그 경유지를 포함한 계획이 충분이어야 확인 완료
  if (i.energy === "OK") return { key: "ENERGY", state: "DONE", line: i.waypointChosen ? "선택한 충전 경유지를 포함하면 충분합니다 (추정)" : "충전 없이 충분합니다 (추정)" };
  if (i.energy === "UNKNOWN") return { key: "ENERGY", state: "UNSUPPORTED", line: "차량 정보가 없어 지금은 확인할 수 없어요" };
  if (i.skipped.includes("ENERGY")) return { key: "ENERGY", state: "SKIPPED", line: "이번에는 건너뛰었습니다 · 충전 계획 없이 출발" };
  if (i.waypointChosen) return { key: "ENERGY", state: "NEEDS_CHECK", line: "선택한 경유지만으로는 여유가 크지 않아요" };
  return { key: "ENERGY", state: "NEEDS_CHECK", line: i.energy === "SHORT" ? "충전 계획이 필요해요" : "에너지 여유가 크지 않아요 · 선택지를 확인해 주세요" };
}

const names = (items: PrepareItem[]) => items.map((x) => PREPARE_ITEM_LABEL[x.key]).join("·");
/** 은/는 — 마지막 글자 받침으로 고른다 */
const eunNeun = (w: string) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 !== 0 ? "은" : "는"; };

export function prepareStatus(i: PrepareInput): PrepareStatus {
  const items = [climateItem(i), packingItem(i), energyItem(i)];
  const doneItems = items.filter((x) => x.state === "DONE");
  const needItems = items.filter((x) => x.state === "NEEDS_CHECK");
  const unsupItems = items.filter((x) => x.state === "UNSUPPORTED");
  const skipItems = items.filter((x) => x.state === "SKIPPED");
  const ready = needItems.length === 0;
  const tail = (unsupItems.length > 0 ? ` · ${names(unsupItems)}${eunNeun(names(unsupItems))} 차량에서 직접 확인해 주세요` : "")
    + (skipItems.length > 0 ? ` · ${names(skipItems)}${eunNeun(names(skipItems))} 이번에는 건너뛰었습니다` : "");
  const summary = ready
    ? doneItems.length === 0 && unsupItems.length === 0 && skipItems.length === 0
      ? "확인할 출발 준비가 없습니다 · 바로 출발하셔도 됩니다"
      : skipItems.length > 0
        ? `남은 확인은 없습니다${tail}`
        : unsupItems.length > 0
        ? `확인할 수 있는 준비는 끝났습니다${tail}`
        : "출발 준비가 끝났습니다 · 바로 출발하셔도 됩니다"
    : doneItems.length > 0
      ? `출발 준비에서 ${COUNT[doneItems.length]} 가지는 확인됐고, ${names(needItems)} ${COUNT[needItems.length]} 가지만 남았습니다${tail}`
      : `출발 전에 ${names(needItems)} ${COUNT[needItems.length]} 가지를 확인해 주세요${tail}`;
  return { items, done: doneItems.length, needs: needItems.length, unsupported: unsupItems.length, skipped: skipItems.length, ready, summary };
}
