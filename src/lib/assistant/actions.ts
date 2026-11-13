/**
 * 차량 제어 요청의 상태 — core/assistant/Actions.kt 의 거울.
 *
 * gate.ts 의 settleControl 은 "결과 하나를 보고 성공/실패를 정하는" 함수였다. 실제 차에서는 그것으로 모자라다(QUALITY_AUDIT 6):
 *  · 타임아웃은 실패가 아니라 **결과를 모르는 것**이다. 5초 뒤 포기했는데 10초 뒤 적용될 수 있다.
 *    그때 바로 "다시 시도"하면 같은 명령이 두 번 간다 → 모르면 **실제 값을 다시 읽기 전까지 재시도하지 않는다.**
 *  · 늦게 온 콜백은 **그 요청의 것일 때만** 반영한다. 지난 요청의 콜백이 새 요청 결과를 덮으면 안 된다.
 *  · 확인 카드를 연 채 출발하면 그 승인은 무효다 — 정차 후 옛 확인 카드가 다시 보이지 않게.
 * 순수 리듀서다. SDK 호출·타이머는 어댑터(시연은 시뮬레이터)가 하고, 결과만 이벤트로 넣는다.
 */
import { CONTROL_TOLERANCE, type ControlSource } from "./gate";

export type ActionPhase = "IDLE" | "CONFIRMING" | "PENDING" | "VERIFIED_SUCCESS" | "FAILED" | "UNKNOWN_OUTCOME";

export type ActionState = {
  phase: ActionPhase;
  /** 지금 기다리는 요청 — 이 번호가 아닌 콜백은 무시한다 */
  requestId: number | null;
  target: number | null;
  /** 차에 반영된 것으로 확인한 값 */
  applied: number | null;
  message: string | null;
  /** 다시 시도해도 되나 — 결과를 모르면 false (중복 명령 방지) */
  canRetry: boolean;
  source: ControlSource;
};

export const idleAction = (source: ControlSource): ActionState => ({ phase: "IDLE", requestId: null, target: null, applied: null, message: null, canRetry: true, source });

export type ActionEvent =
  | { type: "OPEN" }
  | { type: "CANCEL" }
  | { type: "SEND"; requestId: number; target: number }
  | { type: "CALLBACK"; requestId: number; value: number }
  | { type: "ERROR"; requestId: number; reason: string }
  | { type: "TIMEOUT"; requestId: number }
  | { type: "READBACK"; requestId: number; value: number | null }
  /** 주행 시작 · 세션 종료 — 열려 있던 확인을 무효로 한다(이미 보낸 요청은 결과를 계속 기다린다) */
  | { type: "INVALIDATE"; reason: string };

const same = (a: number, b: number) => Math.abs(a - b) <= CONTROL_TOLERANCE;
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : String(x));

export function reduceAction(s: ActionState, e: ActionEvent): ActionState {
  switch (e.type) {
    case "OPEN":
      // 보내는 중이거나, 결과를 모르는데 재조회 전이면 다시 열지 않는다
      if (s.phase === "PENDING" || s.phase === "CONFIRMING" || (s.phase === "UNKNOWN_OUTCOME" && !s.canRetry)) return s;
      return { ...s, phase: "CONFIRMING", message: null };
    case "CANCEL":
      return s.phase === "CONFIRMING" ? { ...s, phase: "IDLE", message: null } : s;
    case "SEND":
      return s.phase === "CONFIRMING" ? { ...s, phase: "PENDING", requestId: e.requestId, target: e.target, applied: null, message: null, canRetry: false } : s;
    case "CALLBACK": {
      if (e.requestId !== s.requestId || (s.phase !== "PENDING" && s.phase !== "UNKNOWN_OUTCOME") || s.target === null) return s;
      const late = s.phase === "UNKNOWN_OUTCOME";
      if (!same(e.value, s.target)) {
        return { ...s, phase: "FAILED", applied: e.value, canRetry: true, message: `요청한 값과 차량 값이 다릅니다 (요청 ${fmt(s.target)} · 현재 ${fmt(e.value)}).` };
      }
      const what = s.source === "MOCK" ? `시연 값으로 ${fmt(s.target)} 적용` : `${fmt(s.target)} 적용됨`;
      return { ...s, phase: "VERIFIED_SUCCESS", applied: e.value, canRetry: true, message: late ? `${what} — 응답이 늦게 왔습니다` : what };
    }
    case "ERROR":
      return e.requestId === s.requestId && s.phase === "PENDING" ? { ...s, phase: "FAILED", canRetry: true, message: `적용하지 못했습니다: ${e.reason}` } : s;
    case "TIMEOUT":
      return e.requestId === s.requestId && s.phase === "PENDING"
        ? { ...s, phase: "UNKNOWN_OUTCOME", canRetry: false, message: "응답이 없어 적용됐는지 모릅니다. 실제 값을 다시 읽는 중입니다 — 그전에는 다시 보내지 않습니다." }
        : s;
    case "READBACK": {
      if (e.requestId !== s.requestId || s.phase !== "UNKNOWN_OUTCOME" || s.target === null) return s;
      if (e.value === null) return { ...s, message: "값을 다시 읽을 수 없어 결과를 확정하지 못했습니다. 공조 패널에서 직접 확인해 주세요 — 중복 명령을 막으려고 다시 보내지 않습니다." };
      return same(e.value, s.target)
        ? { ...s, phase: "VERIFIED_SUCCESS", applied: e.value, canRetry: true, message: `응답은 없었지만 다시 읽어 보니 ${fmt(e.value)} 로 바뀌어 있습니다` }
        : { ...s, phase: "FAILED", applied: e.value, canRetry: true, message: `적용되지 않았습니다 (지금 ${fmt(e.value)}). 다시 시도할 수 있습니다.` };
    }
    case "INVALIDATE":
      return s.phase === "CONFIRMING" ? { ...s, phase: "IDLE", message: e.reason } : s;
  }
}
