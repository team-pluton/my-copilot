/* eslint-disable @next/next/no-img-element -- 정적 내보내기라 이미지 최적화 서버가 없다. 캡처 PNG 를 그대로 쓴다 */

/**
 * 화면 캡처 6장 — 시연 사이트를 puppeteer 로 찍은 것 (앱 창만 · 라이트 · 840×1184, 1 car-px = 1px).
 * 코드가 바뀌면 다시 찍어야 한다: HANDOFF "캡처 다시 뜨기".
 */
const SHOTS: { src: string; title: string; note: string }[] = [
  { src: "/screens/01-status.png", title: "01 상태", note: "큰 숫자 하나 — 모자라면 부족분, 충분하면 도착 잔량" },
  { src: "/screens/02-trip.png", title: "02 여정", note: "대기 시간 · 최소 잔량 · 동승자(수동)" },
  { src: "/screens/03-energy.png", title: "03 에너지 계획", note: "주행 / 대기 / 최소 막대 · 범위 · 가정값 전부 공개" },
  { src: "/screens/04-candidates-added.png", title: "04 후보", note: "3곳 · 점수 · 도착 시 잔량 · 충전 시간 · 미충족을 숨기지 않음 · 추가 결과는 토스트" },
  { src: "/screens/05-driving.png", title: "05 주행 중 (DO)", note: "한 줄 + 음성. 설정·비교 없음" },
  { src: "/screens/06-arrived.png", title: "06 도착·재계산", note: "충전 뒤 남은 구간을 다시 센다" },
];

export function ScreenGallery() {
  return (
    <div className="not-prose grid grid-cols-2 gap-3 sm:grid-cols-3">
      {SHOTS.map((s) => (
        <figure key={s.src} className="bg-surface border-line overflow-hidden rounded-xl border">
          <img src={s.src} alt={s.title} width={840} height={1184} className="w-full" loading="lazy" />
          <figcaption className="p-3"><p className="text-sm font-semibold">{s.title}</p><p className="text-muted mt-0.5 text-xs leading-snug">{s.note}</p></figcaption>
        </figure>
      ))}
    </div>
  );
}
