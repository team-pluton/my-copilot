/**
 * 에너지 예산 그림 — "현재 잔량" 막대와 "필요한 것(주행 + 대기 + 최소)" 막대를 나란히.
 * 두 막대의 차가 부족분이다. 수치는 기본 시나리오(서울→부산, 68%, 6°C, 대기 40분) 의 추정값.
 * 숫자를 바꾸면 시연과 어긋나므로 props 로 받는다.
 */
export function EnergyFigure({ battery = 68, drive = 93, driveErr = 11, wait = 2, reserve = 20, className }: { battery?: number; drive?: number; driveErr?: number; wait?: number; reserve?: number; className?: string }) {
  const W = 960, left = 150, right = 40, barW = W - left - right;
  const max = Math.max(battery, drive + wait + reserve) * 1.05;
  const x = (p: number) => left + (p / max) * barW;
  const need = drive + wait + reserve;
  const short = need - battery;
  const t = { ink: "var(--color-text)", mute: "var(--color-muted)", line: "var(--color-line)", acc: "var(--color-accent)", bad: "var(--color-bad)", auto: "#6a57ff", res: "#686a72", good: "var(--color-good)" };
  return (
    <svg viewBox={`0 0 ${W} 250`} className={className} role="img" aria-label={`에너지 예산: 현재 ${battery}%, 필요 ${need}% (주행 ${drive}±${driveErr}, 대기 ${wait}, 최소 ${reserve}) → 약 ${short}% 부족`}>
      {/* 눈금 */}
      {[0, 25, 50, 75, 100].map((p) => (
        <g key={p}><line x1={x(p)} y1="40" x2={x(p)} y2="168" stroke={t.line} strokeDasharray="3 5" /><text x={x(p)} y="222" textAnchor="middle" fill={t.mute} fontSize="12">{p}%</text></g>
      ))}
      {/* 현재 잔량 */}
      <text x="24" y="76" fill={t.ink} fontSize="14" fontWeight="600">현재 잔량</text>
      <rect x={left} y="58" width={x(battery) - left} height="28" rx="6" fill={t.good} />
      <text x={x(battery) + 10} y="77" fill={t.ink} fontSize="14" fontWeight="700">{battery}%</text>
      {/* 필요한 것 */}
      <text x="24" y="146" fill={t.ink} fontSize="14" fontWeight="600">필요한 것</text>
      <rect x={left} y="128" width={x(drive) - left} height="28" rx="6" fill={t.acc} />
      <rect x={x(drive)} y="128" width={x(drive + wait) - x(drive)} height="28" fill={t.auto} />
      <rect x={x(drive + wait)} y="128" width={x(need) - x(drive + wait)} height="28" rx="6" fill={t.res} />
      {/* 추정 범위 */}
      <line x1={x(drive - driveErr)} y1="142" x2={x(drive + driveErr)} y2="142" stroke={t.ink} strokeWidth="2" />
      <line x1={x(drive - driveErr)} y1="134" x2={x(drive - driveErr)} y2="150" stroke={t.ink} strokeWidth="2" />
      <line x1={x(drive + driveErr)} y1="134" x2={x(drive + driveErr)} y2="150" stroke={t.ink} strokeWidth="2" />
      <text x={x(drive / 2)} y="176" textAnchor="middle" fill={t.mute} fontSize="12">주행 {drive}% ± {driveErr}</text>
      {/* 대기 조각은 좁아서 아래로 끌어내 적는다 — 위는 부족분 띠가 차지한다 */}
      <line x1={x(drive + wait / 2)} y1="158" x2={x(drive + wait / 2)} y2="186" stroke={t.auto} strokeWidth="1.5" />
      <text x={x(drive + wait / 2)} y="200" textAnchor="middle" fill={t.mute} fontSize="12">대기 {wait}%</text>
      <text x={x(drive + wait + reserve / 2)} y="176" textAnchor="middle" fill={t.mute} fontSize="12">최소 {reserve}%</text>
      {/* 부족분 */}
      <path d={`M ${x(battery)} 92 L ${x(battery)} 124`} stroke={t.bad} strokeWidth="2" strokeDasharray="4 3" />
      <rect x={x(battery)} y="96" width={x(need) - x(battery)} height="24" rx="4" fill={t.bad} opacity="0.18" />
      <text x={(x(battery) + x(need)) / 2} y="112" textAnchor="middle" fill={t.bad} fontSize="13" fontWeight="700">약 {short}% 부족 → 경로상 한 번 충전</text>
      <text x="24" y="244" fill={t.mute} fontSize="12">기본 시나리오 · 서울→부산 400km · 외기 6°C · 공조 ON · 도착 후 대기 40분. 전부 가정값이며 공식 주행가능거리가 아니다.</text>
    </svg>
  );
}

/** 점수 다섯 축과 가중치 — 추천 엔진 표를 그림으로 */
export function ScoreFigure({ className }: { className?: string }) {
  const axes: [string, number, string][] = [
    ["경로 이탈", 35, "0km → 100 · 10km → 0 · 거리 미상은 제외"],
    ["선호 시설", 25, "동승자 선호 시설 커버율 (필수는 배제 조건)"],
    ["충전 속도", 20, "kW ÷ 200 · 충전 불필요 여정에선 뺀다"],
    ["휴식 시점", 10, "그곳 도착 시점이 휴식 간격에 가까울수록"],
    ["정보 신뢰도", 10, "확인됨 100 · 미확인 40"],
  ];
  const t = { ink: "var(--color-text)", mute: "var(--color-muted)", acc: "var(--color-accent)", line: "var(--color-line)", surf2: "var(--color-surface-2)" };
  return (
    <svg viewBox="0 0 960 230" className={className} role="img" aria-label="추천 점수 다섯 축: 경로 이탈 35, 선호 시설 25, 충전 속도 20, 휴식 시점 10, 정보 신뢰도 10">
      {axes.map(([name, w, desc], i) => {
        const y = 14 + i * 42;
        return (
          <g key={name}>
            <text x="24" y={y + 17} fill={t.ink} fontSize="14" fontWeight="600">{name}</text>
            <rect x="150" y={y} width="420" height="24" rx="6" fill={t.surf2} />
            <rect x="150" y={y} width={420 * (w / 35)} height="24" rx="6" fill={t.acc} opacity={0.35 + (w / 35) * 0.65} />
            <text x={150 + 420 * (w / 35) + 10} y={y + 17} fill={t.ink} fontSize="14" fontWeight="700">×{w}</text>
            <text x="630" y={y + 17} fill={t.mute} fontSize="12">{desc}</text>
          </g>
        );
      })}
      <line x1="24" y1="226" x2="936" y2="226" stroke={t.line} />
    </svg>
  );
}
