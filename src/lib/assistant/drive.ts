/**
 * 주행 중 화면 한 줄 — core/assistant/Drive.kt 의 거울 (3차 P0-2).
 *
 * 주행 중에는 판정을 큰 글씨로 계속 띄울 이유가 없다. 문제가 없으면 조용히, 확인할 것이 있으면 짧게, 모르면 모른다고만.
 *  · QUIET     — 판단 문제 없음. 작은 한 줄(경유지가 있으면 그곳까지 거리만 크게). 음성 없음
 *  · ATTENTION — 충전 계획을 확인해야 함. 짧게 한 번(음성 한 번), 선택지는 정차한 뒤
 *  · UNKNOWN   — 차량 정보가 없음. 지난 판단을 되풀이하지 않는다
 * 제조사 경고 시스템이 아니다 — 빨강·경고 아이콘·깜빡임으로 안전 경고처럼 보이게 하지 않는다.
 */
import type { EnergyView } from "./energy-view";

export type DriveLevel = "QUIET" | "ATTENTION" | "UNKNOWN";
export type DriveLine = {
  level: DriveLevel;
  title: string;
  sub: string | null;
  /** 경유지까지 — 큰 숫자는 이것만 */
  stop: { name: string; km: number } | null;
};

export function driveLine(view: EnergyView, linkLive: boolean, stop: { name: string; km: number } | null, legLabel: string): DriveLine {
  if (!linkLive || view.status === "UNKNOWN") {
    return { level: "UNKNOWN", title: "차량 정보 확인 중", sub: "최신 정보가 오기 전에는 판단을 말하지 않습니다", stop: null };
  }
  if (view.status === "OK") {
    return stop
      ? { level: "QUIET", title: `다음 충전 경유지 · ${stop.name}`, sub: null, stop }
      : { level: "QUIET", title: `${legLabel}까지 에너지 문제 없음 · 추정`, sub: null, stop: null };
  }
  return {
    level: "ATTENTION",
    title: view.status === "SHORT" ? "충전 계획이 필요해요" : "에너지 여유가 크지 않아요",
    sub: "정차한 뒤 선택지를 볼 수 있어요",
    stop,
  };
}
