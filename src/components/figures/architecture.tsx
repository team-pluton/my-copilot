/**
 * 구조도 — 셸 / 앱 창 / core / Port / SDK 의 경계. 인라인 SVG 라 테마 색을 그대로 쓴다.
 * 말하려는 것은 하나다: **우리가 만드는 것은 앱 창 안쪽뿐이고, 판단(core)은 Android 를 모른다.**
 */
export function ArchitectureFigure({ className }: { className?: string }) {
  const t = { ink: "var(--color-text)", mute: "var(--color-muted)", line: "var(--color-line)", surf: "var(--color-surface)", surf2: "var(--color-surface-2)", acc: "var(--color-accent)", good: "var(--color-good)", warn: "var(--color-warn)" };
  return (
    <svg viewBox="0 0 960 440" className={className} role="img" aria-label="구조도: Pleos 셸 안의 앱 창, 그 안의 UI와 core, Port 뒤의 SDK 어댑터">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={t.mute} /></marker>
      </defs>
      {/* 셸 */}
      <rect x="16" y="16" width="560" height="408" rx="18" fill="none" stroke={t.line} strokeWidth="2" strokeDasharray="8 6" />
      <text x="32" y="44" fill={t.mute} fontSize="13" fontWeight="600">Pleos Connect 시스템 셸 — 차량 OS 영역 · 우리 코드 아님</text>
      <rect x="32" y="60" width="528" height="26" rx="6" fill={t.surf2} /><text x="44" y="78" fill={t.mute} fontSize="12">Status bar</text>
      <rect x="32" y="94" width="120" height="292" rx="8" fill={t.surf2} /><text x="52" y="240" fill={t.mute} fontSize="12">Driving view</text>
      <rect x="32" y="394" width="528" height="20" rx="6" fill={t.surf2} /><text x="44" y="408" fill={t.mute} fontSize="11">GNB</text>
      <rect x="432" y="94" width="128" height="292" rx="8" fill={t.surf2} />
      <text x="452" y="232" fill={t.mute} fontSize="12">옆 창</text><text x="452" y="250" fill={t.mute} fontSize="12">내비게이션</text>
      {/* 우리 앱 창 */}
      <rect x="160" y="94" width="264" height="292" rx="10" fill={t.surf} stroke={t.acc} strokeWidth="2" />
      <text x="176" y="118" fill={t.acc} fontSize="13" fontWeight="700">앱 창 — 쉼표 DRIVE (우리가 만드는 것)</text>
      <rect x="176" y="130" width="232" height="70" rx="8" fill={t.surf2} />
      <text x="188" y="152" fill={t.ink} fontSize="12" fontWeight="600">UI · Kotlin / Jetpack Compose</text>
      <text x="188" y="170" fill={t.mute} fontSize="11">6 화면 · 세로 기본 · 가로 확장 · DO 모드</text>
      <text x="188" y="186" fill={t.mute} fontSize="11">(웹 시연 = 같은 구조의 React 거울)</text>
      <rect x="176" y="212" width="232" height="96" rx="8" fill={t.surf2} stroke={t.good} strokeWidth="1.5" />
      <text x="188" y="234" fill={t.good} fontSize="12" fontWeight="700">core/ — 순수 Kotlin · Android 모름</text>
      <text x="188" y="254" fill={t.ink} fontSize="11">EnergyEstimator  주행 + 대기 + 최소 → 부족분(±)</text>
      <text x="188" y="272" fill={t.ink} fontSize="11">RecommendationEngine  배제 → 점수 → 이유</text>
      <text x="188" y="290" fill={t.ink} fontSize="11">BreakScheduler  휴식 시점 · 단위 테스트 대상</text>
      <rect x="176" y="320" width="232" height="52" rx="8" fill={t.surf2} />
      <text x="188" y="342" fill={t.ink} fontSize="12" fontWeight="600">Ports — 우리가 정한 인터페이스</text>
      <text x="188" y="360" fill={t.mute} fontSize="11">Vehicle · Navigation · Location · RestStops</text>
      {/* 어댑터 */}
      <text x="616" y="44" fill={t.mute} fontSize="13" fontWeight="600">어댑터 — Port 뒤에 숨는다</text>
      {[
        ["NaviHelper SDK", "addWaypoint · 경유지 ≤ 2 · 콜백으로 확인", t.acc],
        ["Vehicle SDK", "EvBattery · HVAC · Odometer · DrivingMode", t.acc],
        ["AAOS Car API", "속도 · 기어 · CarUxRestrictions(DO)", t.acc],
        ["Mock (시연·테스트)", "같은 Port · 화면에 늘 '모의'라 적는다", t.warn],
      ].map(([h, d, c], i) => (
        <g key={h} transform={`translate(616 ${64 + i * 86})`}>
          <rect width="328" height="70" rx="8" fill={t.surf} stroke={c} strokeWidth="1.5" />
          <text x="14" y="26" fill={t.ink} fontSize="12" fontWeight="600">{h}</text>
          <text x="14" y="48" fill={t.mute} fontSize="11">{d}</text>
        </g>
      ))}
      {/* Port → 어댑터 선 */}
      <path d="M 408 346 C 500 346, 520 99, 616 99" fill="none" stroke={t.mute} strokeWidth="1.2" markerEnd="url(#arr)" />
      <path d="M 408 346 C 500 346, 520 185, 616 185" fill="none" stroke={t.mute} strokeWidth="1.2" markerEnd="url(#arr)" />
      <path d="M 408 346 C 500 346, 520 271, 616 271" fill="none" stroke={t.mute} strokeWidth="1.2" markerEnd="url(#arr)" />
      <path d="M 408 346 C 500 346, 520 357, 616 357" fill="none" stroke={t.mute} strokeWidth="1.2" strokeDasharray="4 4" markerEnd="url(#arr)" />
      {/* 앱 창 → 옆 창: 경유지만 */}
      <path d="M 424 150 L 432 150" fill="none" stroke={t.acc} strokeWidth="2" />
      <text x="436" y="140" fill={t.acc} fontSize="10">경유지만</text>
    </svg>
  );
}
