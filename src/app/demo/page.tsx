import type { Metadata } from "next";
import { Simulator } from "@/components/demo/simulator";

export const metadata: Metadata = { title: "시연" };

/**
 * 시연 — Pleos Connect 시스템 셸(상태바 · Driving view · GNB · 옆 창 내비) 안의 **앱 창**에서
 * 여섯 화면이 돈다. 상태와 조작은 전부 Simulator 에 있고, 이 페이지는 틀만 준다.
 */
export default function DemoPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Pleos 화면 안에서 시연</h1>
        <p className="text-muted text-sm leading-relaxed">
          바깥은 차량 OS 가 그리는 시스템 영역(Connect-S 17&quot; · 2560×1440 비율)이고, 우리 앱은{" "}
          <strong className="text-text">왼쪽 앱 창 하나</strong>만 받습니다. 오른쪽 창은 Pleos 내비게이션 —
          후보 화면에서 경유지를 추가하면 그 창에 마커가 생깁니다. 세로(기본)·가로(확장), 라이트·다크를
          바꿔 보고, 배터리·외기온·대기 시간을 바꾸면 에너지 계획과 후보가 바뀝니다.
        </p>
      </header>
      <Simulator />
    </div>
  );
}
