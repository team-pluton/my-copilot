import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileDown } from "lucide-react";
import { ArchitectureFigure } from "@/components/figures/architecture";
import { EnergyFigure, ScoreFigure } from "@/components/figures/energy-figure";
import { ScreenGallery } from "@/components/figures/screen-gallery";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "기획서" };

/**
 * 기획서 v2 — 1차 접수의 **필수 제출물**이 되는 본문. `docs/01-product.md` 를 따른다.
 *
 * 심사 기준(전해 들음: 차량 특화성 · 창의성 · 기술 활용성 · 사업성)에 맞춰 절을 세웠다.
 * 숫자는 실측·가정·추정·미확인·전해 들음을 구분해 적는다 — 한 번 틀리면 전체 신뢰가 깎인다.
 * 바깥 통계는 출처와 날짜를 붙인다. 출처 없는 숫자는 쓰지 않는다.
 */
const SECTIONS = [
  { id: "summary", title: "0. 한 장 요약" },
  { id: "problem", title: "1. 문제와 근거" },
  { id: "target", title: "2. 타깃과 페르소나" },
  { id: "solution", title: "3. 해결책 — 세 축" },
  { id: "modes", title: "3-1. 하나의 판단, 세 순간" },
  { id: "rejudge", title: "3-2. 실시간 재판단 · 만약에 비교" },
  { id: "difference", title: "4. 기존 기능과의 경계" },
  { id: "platform", title: "5. 플랫폼 적합성 (확인됨)" },
  { id: "api", title: "6. Pleos API 매핑" },
  { id: "scenario", title: "7. 시나리오" },
  { id: "energy", title: "8. 에너지 추정" },
  { id: "engine", title: "9. 추천 엔진" },
  { id: "screens", title: "10. 화면" },
  { id: "driving", title: "11. 주행 중 동작 (DO)" },
  { id: "scope", title: "12. 범위와 제외" },
  { id: "plan", title: "13. 구조와 구현 계획" },
  { id: "business", title: "14. 사업성 · 확장" },
  { id: "kpi", title: "15. 검증 계획" },
  { id: "risks", title: "16. 위험과 대응" },
  { id: "sources", title: "17. 출처" },
];

export default function ProposalPage() {
  return (
    // 인쇄에선 목차가 숨는데 grid 열이 남으면 본문이 220px 열에 끼인다 — print 에선 한 열로
    <div className="grid gap-10 lg:grid-cols-[220px_1fr] print:block">
      <aside className="no-print lg:sticky lg:top-20 lg:self-start">
        <p className="text-muted mb-3 text-xs font-semibold tracking-wide">목차</p>
        <nav aria-label="기획서 목차" className="space-y-1">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="text-muted hover:text-text hover:bg-surface block rounded-lg px-3 py-1.5 text-sm transition-colors">{s.title}</a>
          ))}
        </nav>
        <Link href="/demo/" className="bg-accent hover:bg-accent-strong mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-colors">시연으로 <ArrowRight className="size-4" /></Link>
        <a href="/proposal.pdf" className="border-line hover:bg-surface mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors"><FileDown className="size-4" /> 기획서 PDF 받기</a>
        <div className="mt-2"><PrintButton /></div>
      </aside>

      <article className="space-y-14">
        {/* ── 표지 */}
        <header className="print-avoid space-y-4">
          <p className="text-accent text-sm font-semibold">현대자동차그룹 차량용 앱 개발 공모전 2026 · 기획서 · Pleos Connect · Mobility Services</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">쉼표 DRIVE<span className="text-muted font-normal"> — 앞으로 무엇을 할 수 있는지 알려주는 차량용 이동 판단 서비스</span></h1>
          <p className="text-lg font-semibold leading-relaxed">자동차가 지금 상태를 알려준다면, 쉼표 DRIVE 는 앞으로 무엇을 할 수 있는지 알려준다. 주행과 도착 후 차량 사용까지 예측하고, 상황이 달라질 때마다 이동 계획을 다시 판단한다.</p>
          <p className="text-muted leading-relaxed">
            쉼표(,)는 문장을 끝내지 않고 숨을 고르는 기호다. EV 장거리 이동에서 충전 정차가 바로 그 쉼표다 —
            <strong className="text-text"> 언제</strong> 서야 하는지는 도착 후 쓸 에너지까지 센 예산이,
            <strong className="text-text"> 어디서</strong> 서야 하는지는 동승자 조건이 정하고, 고른 곳은 차량 내비게이션의 경유지가 된다.
            그리고 서지 않아도 될 때는 <strong className="text-text">서지 않아도 된다고</strong> 말한다 — 장거리 여행뿐 아니라 픽업·마중처럼 도착해서 기다렸다 돌아오는 순간에도 같은 판단을 쓴다.
          </p>
          <dl className="text-muted grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
            <div><dt className="font-semibold">심사 자료</dt><dd>익명 — 참가자 정보는 접수양식 01 에만 적는다 (공식 규정)</dd></div>
            <div><dt className="font-semibold">시연</dt><dd>(웹 시연 주소 — 제출 시 기재)/demo (웹, Pleos 셸 비율)</dd></div>
            <div><dt className="font-semibold">버전</dt><dd>v3.1 · 2026-10-25</dd></div>
          </dl>
        </header>

        <Section id="summary" title="0. 한 장 요약">
          <p><strong>도착한 뒤 차에서 쓸 에너지까지 계산해 &ldquo;충전하러 서야 하는지&rdquo;를 먼저 판단하고, 선다면 동승자 모두에게 맞는 곳을 골라 내비 경유지로 꽂아 주는 앱.</strong></p>
          <div className="not-prose print-avoid grid gap-3 sm:grid-cols-4">
            {[
              ["차량 특화성", "Vehicle SDK 의 잔량·효율·공조·주행거리가 바뀔 때마다 재판단하고 NaviHelper 경유지로 실행한다 — 폰 앱이 가질 수 없는 입력과 출력. 주행 중엔 DO 규칙대로 한 줄과 음성만."],
              ["창의성", "도착 후 체류 소비까지 포함한 이동 에너지 예산을 제안한다. 충전 정차와 휴식을 같은 정차로 묶고, 추천 이유·제외 이유·미충족을 숨기지 않는다."],
              ["기술 활용성", "NaviHelper·Vehicle·AAOS·TTS 를 Port 뒤에 두고, 판단은 Android 를 모르는 순수 Kotlin core 에서 단위 테스트로 증명(Kotlin 34 · TS 25, 전부 통과, 양쪽 같은 값). 같은 core 를 실물 SDK 와 함께 빌드한 Android 앱(APK)이 실기기에서 돌고, 웹 시연이 같은 규칙으로 돈다."],
              ["사업성", "반려가구 26.7%·겨울 주행거리 −21% 라는 두 현실 위에서, 충전사업자·휴게소 제휴와 플릿(Fleet API) 확장. 추천 순위를 파는 구조는 피한다."],
            ].map(([t, d]) => (
              <div key={t} className="bg-surface border-line rounded-xl border p-4"><p className="text-accent text-xs font-semibold">{t}</p><p className="text-muted mt-1 text-xs leading-relaxed">{d}</p></div>
            ))}
          </div>
          <Table head={["질문", "답"]} rows={[
            ["무엇이 다른가", "\"어디서 충전할까\" 보다 먼저 \"충전이 필요한가 · 이후 일정(대기·귀가)까지 가능한가\"를 답한다. 필요할 때만 동승자 조건에 맞는 경유지를 고른다"],
            ["왜 차 안이어야 하나", "배터리·효율·공조·트립 시간은 차량만 알고, 경유지는 차량 내비만 받는다"],
            ["무엇을 만들지 않나", "검색 · 지도 · 음성 비서 · 자동 경로 변경 · 피로도 측정 — 전부 플랫폼에 맡기거나 하지 않는다"],
            ["왜 계속 쓰나", "장거리 여행만이 아니라 픽업·마중처럼 자주 반복되는 '가서 기다렸다 돌아오기'에서도, 충전이 필요 없다는 결정과 '공조 켜고 몇 분까지' 를 준다. 날씨·공조가 바뀌면 다시 알려 준다"],
            ["공모 분야", "공식 분야(인카 엔터테인먼트 · 모빌리티 라이프 케어 · 안전 운전 · 패밀리·동승자 케어) 중 모빌리티 라이프 케어 + 패밀리·동승자 케어"],
            ["지금 어디까지 됐나", "Android 앱(Kotlin · Compose) release APK — 실물 Pleos SDK(Vehicle · NaviHelper · TextToSpeech)로 빌드해 실기기에서 전체 흐름 확인(Pleos 서비스가 없어 시연 모드) · 웹 시연(6화면·공식 셸 비율·가이드 투어 11단계) · 단위 테스트 Kotlin 34 · TS 25 전부 통과. 에뮬레이터 실행은 다음 단계"],
          ]} />
        </Section>

        <Section id="problem" title="1. 문제와 근거">
          <p>EV 장거리 이동에서 운전자는 세 가지를 <strong>머릿속으로</strong> 계산한다.</p>
          <ol>
            <li>지금 배터리로 <strong>도착 후 대기(공조·대기 전력)와 귀가까지</strong> 버티나 — 목적지 도착 후 사용자가 정한 활동의 에너지까지 이동 예산에 넣는 기능은, 검토한 공식 자료에서 보이지 않았다</li>
            <li>모자라면 <strong>어디서</strong> 충전하나 — 충전소 정보에 동승자 조건과 이동 전체의 에너지 요구를 함께 얹어 고르는 기능은 보이지 않았다</li>
            <li>충전하는 20~40분을 <strong>누가 어떻게</strong> 보내나 — 아이 화장실·식사·반려동물은 따로 찾는다</li>
          </ol>
          <p>세 질문이 <strong>한 번의 정차</strong>로 풀려야 하는데, 지금은 세 앱·세 화면이다. 왜 지금 이 문제인가:</p>
          <Table head={["사실", "수치", "출처"]} rows={[
            ["겨울이면 주행거리가 준다", "환경부 인증 42개 모델(2020~23) 저온 주행거리 상온 대비 평균 −21% (약 82km). 저온 측정은 −7°C · 히터 최대", "환경부 인증 자료 분석 보도, 2024-01 [1]"],
            ["\"도착 후 대기\"는 흔하다", "픽업·마중·아이 재우기 — 공조를 켠 채 차 안에서 기다리는 시간. 저온에서 공조는 소비의 큰 몫이고, 아무 앱도 이 몫을 미리 세지 않는다", "본 기획의 관찰 · 에너지 추정 8절"],
            ["동승자 조건이 있는 가구가 많다", "반려가구 591만 (전체 가구의 26.7%, 2024년 말) · 반려인 1,546만 명 (인구의 29.9%)", "KB금융 『2025 한국 반려동물 보고서』 2025-06-29 [2]"],
            ["같이 가고 싶은데 시설이 없다", "반려인 75.8% 가 동반 여행 희망. 포기 이유 1·2위가 동반 가능 숙박(46.4%)·음식점(44.8%) 부족", "한국관광공사 조사 보도, 2025 [3]"],
            ["휴게소 쪽 공급은 희소하다", "고속도로 휴게소 반려견 놀이터 전국 20곳(2025-06 기준: 수도권 5 · 충청 6 · 호남 2 · 영남 7). 희소할수록 '골라 주는' 가치가 크다", "한국도로공사 자료, 뉴시스 2025-10-03 [4]"],
            ["충전 인프라는 빠르게 늘고 있다", "SK일렉링크 휴게소 62곳 200기(350kW 53·200kW 147) · 채비 27곳 138기(2026). 선택지가 늘수록 '어디서'가 어려워진다", "보도 [5][6]"],
          ]} />
          <Note>통계는 보도된 2차 자료다. 1차 자료(환경부 무공해차 통합누리집 · 한국관광공사 원자료 · 한국도로공사 현황)로 바꾸는 것이 11/15 전 할 일이다.</Note>
        </Section>

        <Section id="target" title="2. 타깃과 페르소나">
          <p>1차: <strong>EV 로 장거리를 가는 가족 단위 탑승객</strong>. 동승자(아이·어르신·반려동물)가 있을수록 정차 조건이 복잡해지고 추천의 가치가 커진다. 2차: 도착 후 차에서 대기하는 일이 잦은 운전자.</p>
          <div className="not-prose print-avoid grid gap-3 sm:grid-cols-2">
            {[
              ["① 주말 가족 운전자 (38세, 아이오닉 5)", "6세 아이와 반려견을 태우고 서울에서 부산 처가로. 출발 전 배터리 68%, 날씨 6°C. 처가 도착 후 아이가 잠들어 40분쯤 차에서 기다리는 일이 잦다. 지금은 내비 충전소 검색과 네이버 '반려견 휴게소' 검색을 번갈아 본다.", "원하는 것: 한 번만 서고 싶다. 선다면 아이 화장실과 강아지 산책이 되는 곳."],
              ["② 픽업·마중 운전자 (45세, EV6)", "공항 마중, 학원 픽업처럼 도착해서 차 안에서 기다리는 시간이 길다. 겨울엔 공조를 켠 채 30~60분. 돌아오는 길에 배터리가 생각보다 모자라 당황한 적이 있다.", "원하는 것: 돌아올 길까지 셈한 뒤 '지금 충전해 두라'고 먼저 말해 주는 것."],
            ].map(([t, s, w]) => (
              <div key={t} className="bg-surface border-line rounded-xl border p-4"><p className="text-sm font-semibold">{t}</p><p className="text-muted mt-1 text-xs leading-relaxed">{s}</p><p className="text-accent mt-2 text-xs font-semibold">{w}</p></div>
            ))}
          </div>
        </Section>

        <Section id="solution" title="3. 해결책 — 세 축">
          <div className="not-prose print-avoid grid gap-3 sm:grid-cols-3">
            {[
              ["① 도착 후 사용까지 포함한 에너지 예산", "주행 소비 + 대기 소비 + 최소 잔량 → 부족분. 항상 범위(±)와 함께. EvBattery · HVAC · Odometer · DrivingMode."],
              ["② 동승자 조건으로 고르는 충전소", "필수 시설은 배제 조건, 선호 시설은 점수. 미충족을 숨기지 않고 적는다. 거기서 충전하면 끝까지 갈 것으로 추정되는 곳을 우선하고, 보수적으로 모자랄 수 있으면 그렇다고 적는다."],
              ["③ 충전 정차 = 휴식", "충전 시간과 휴식 간격을 같은 정차로 맞춘다. 검토한 자료에서 보이지 않은 결합."],
            ].map(([t, d]) => (
              <div key={t} className="bg-surface border-line rounded-xl border p-4"><p className="text-sm font-semibold">{t}</p><p className="text-muted mt-1 text-xs leading-relaxed">{d}</p></div>
            ))}
          </div>
          <p><strong>장소 검색과 경유지 추가는 우리가 만드는 것이 아니라 쓰는 것이다.</strong> 검색은 내비/Gleo AI 가, 경유지는 NaviHelper 가 한다. 우리는 <em>언제 · 왜 · 누구를 위해</em> 서는지 <strong>판단</strong>만 한다.</p>
        </Section>

        <Section id="modes" title="3-1. 하나의 판단, 세 순간 — JOURNEY · WAIT · STAY">
          <p>휴게소 추천은 제품의 정체성이 아니라 <strong>여러 해결 수단 중 하나</strong>다. 정체성은 &ldquo;차량 에너지와 이동 계획을 함께 보고, 충전이 필요한지 · 이후 일정까지 가능한지 먼저 판단하는 것&rdquo;이다. 같은 엔진(COMMA Energy Core)이 차량 이용의 세 순간에 쓰인다 — 앱 셋이 아니라 여정 화면의 &ldquo;오늘 차를 어떻게 쓰나요&rdquo; 선택 하나다.</p>
          <Table head={["모드", "계산 범위", "핵심 출력", "추천 행동", "상태"]} rows={[
            ["JOURNEY 장거리 여행", "편도 + 도착 후 대기", "부족분(범위) · 한 번 충전 가능성", "충전·휴식 경유지 3곳 → NaviHelper", "구현 · 시연 1"],
            ["WAIT 픽업·마중", "가는 길 + 대기 + 오는 길(왕복)", "귀가 시 잔량 · 공조 켜고 최대 대기 시간(보수적)", "충전 불필요 결정 / 모자라면 출발 전 충전", "구현 · 시연 2"],
            ["STAY 캠핑·차박", "가는 길 + 체류(공조·외부 전력) + 귀가", "체류 가능 시간 · 귀가 잔량 보장선", "체류 예산 설정 · 귀가 전 충전 경고", "설계 — 본선 이후 결정"],
          ]} />
          <p><strong>시연 2 — 공항 마중(가상).</strong> 집 → 인천공항 52km, 60분 대기, 같은 길로 귀가. 배터리 55%, 1°C, 공조 ON. 가는 길 12% · 대기 3% · 오는 길 12% · 최소 20% → <strong>귀가 시 잔량 약 28%, 충전하지 않아도 된다</strong>. 공조를 켠 채 <strong>최대 약 3시간 5분</strong>까지 기다려도 된다(보수적 추정). −7°C 면 최대 92분으로 줄고, 배터리 40% 에 −7°C 면 &ldquo;약 10% 모자랍니다. 출발 전 충전을 권합니다.&rdquo; — 경로상 휴게소를 권하지 않는다.</p>
          <p><strong>충전이 필요 없을 때의 가치.</strong> 충분하면 그렇다고 한 줄로 말하고 경고를 되풀이하지 않는다. 쉬고 싶을 때만 &ldquo;쉬어 갈 곳만 보기&rdquo;로 휴식 후보를 연다. <em>충전하지 않아도 된다는 결정을 근거와 함께 내려 주는 것</em> 자체가 결과다.</p>
          <p><strong>STAY 설계 원칙.</strong> 체류 시간 × 공조 소비 + 외부 전력(V2L 등) 사용량으로 체류 예산을 잡고, 귀가에 필요한 잔량을 바닥선으로 고정한다. 외부 전력 사용량은 <strong>사용자가 입력하거나 검증된 차량 데이터가 있을 때만</strong> 계산한다 — 모르는 값을 추정해 넣지 않는다. 엔진 변경은 대기 항에 외부 전력 항을 더하는 정도라 본선 이후 구현 여부를 결정한다.</p>
        </Section>

        <Section id="rejudge" title="3-2. 실시간 재판단 · 만약에 비교 — 판단 → 실행 → 상황 변화 → 재판단">
          <p>출발 전에 한 번 계산하고 끝나는 앱이 아니다. 차량 데이터가 바뀌면 남은 구간을 다시 추정하고, <strong>판정(충분 · 아슬아슬 · 부족)이 바뀌었거나 부족분이 3%p 이상 움직였을 때만</strong> 알린다 — 매번 알리면 아무도 보지 않는다.</p>
          <Table head={["상황 변화 (입력)", "SDK", "재판단 결과 (시연 수치, 가상)"]} rows={[
            ["외기 6°C → −7°C", "AAOS ENV_OUTSIDE_TEMPERATURE", "재판단 · 부족분 47% → 58% (+11%p)"],
            ["실주행 효율 16 → 18.4 kWh/100km (맞바람·고속)", "Vehicle getCurrentEvEfficiency", "부족분 47% → 61% (+14%p) · 향하던 김천에 닿기 어려움 → 음성 \"김천휴게소까지 여유가 부족할 수 있어요. 정차하면 더 가까운 후보를 보여 드릴게요.\" 경로는 바꾸지 않는다"],
            ["공항 마중: 잔량 55% → 40%, 1°C → −7°C", "registerEvBatteryStateOfCharge · AAOS", "판단이 바뀌었습니다: 충분 → 부족 · 이제 약 10% 부족 (추정 7~13%) → 출발 전 충전"],
            ["외기 6°C → 5°C", "AAOS", "알리지 않음 (판정 같고 변화 3%p 미만)"],
          ]} />
          <p><strong>만약에 비교.</strong> 숫자 하나가 아니라 &ldquo;내 선택이 이후 일정에 어떻게 닿나&rdquo;를 나란히 보여 준다. 같은 추정 엔진에 조건만 바꿔 다시 돌린다.</p>
          <Table head={["장거리 여행 (서울→부산)", "결과"]} rows={[
            ["충전 없이 그대로", "약 47% 부족 · 부족"],
            ["김천에서 15분만 충전 (+48.5%)", "도착 약 22% · 아슬아슬"],
            ["김천에서 80%까지 (약 22분)", "도착 약 43% · 충분"],
            ["공조 끄고 가면", "약 42% 부족 · 부족"],
          ]} />
          <Table head={["픽업·마중 (공항 왕복)", "결과"]} rows={[
            ["지금 그대로", "귀가 약 28% · 충분"],
            ["1시간 더 기다리면", "귀가 약 26% · 충분"],
            ["공조 끄고 기다리면", "귀가 약 32% · 충분"],
            ["출발 전 15분 급속(100kW, +26%)", "귀가 약 54% · 충분"],
          ]} />
          <p>N분 충전량은 충전 시간 추정의 역(같은 테이퍼 가정)이고, 경유지 충전은 &ldquo;시작 잔량에 더하는&rdquo; 근사다 — 그곳에 닿을 수 있다는 것은 추천 엔진이 이미 확인했다. 재판단 · 만약에 · N분 충전량은 TS 와 Kotlin 에 같이 있고 같은 값으로 테스트된다.</p>
        </Section>

        <Section id="difference" title="4. 기존 기능과의 경계">
          <Table head={["기능", "현대차 현재", "쉼표 DRIVE"]} rows={[
            ["경로상 장소 검색 · 화장실/주차장 검색", "제공 (2026-10 업데이트 — 전해 들음)", "만들지 않는다 — 내비에 맡김"],
            ["EV 경로 충전 계획 · 도착 잔량 예측", "제공 — NaviHelper 실물에 ChargingPlan · 추천 충전소 · 목표 SOC · 도착 잔량 (2026-10-25 확인)", "다시 만들지 않는다 — 내비 예측을 주행 구간 기준값으로 쓰고, 그 뒤(대기·귀가·동승자·재판단)를 더한다"],
            ["경유지 추가", "제공 (NaviHelper — 확인)", "수단으로 쓴다"],
            ["AI 음성 장소 검색", "Gleo AI", "만들지 않는다"],
            ["충전소 추천", "내비 충전 계획(확인) · 마이현대 EV(전해 들음)", "동승자 필수·선호 시설 · 도착 후 대기·귀가까지 포함한 적합성 — 차이"],
            ["도착 후 대기 소비까지 포함한 에너지 예산", "확인되지 않음", "축 ①"],
            ["동승자별 시설 조건 조합 · 미충족 설명", "확인되지 않음", "축 ②"],
            ["충전 정차와 휴식 간격의 결합", "확인되지 않음", "축 ③"],
          ]} />
          <Note>&ldquo;확인되지 않음&rdquo;은 없다는 뜻이 아니라, 검토한 공식 자료에서 명시적으로 보이지 않았다는 뜻이다. 설명회·실차에서 재확인한다.</Note>
          <p><strong>같은 상황, 다른 답.</strong> 서울→부산 400km · 배터리 68% · 6°C · 어린이 + 반려견:</p>
          <Table head={["", "충전소 검색(가까운 급속 순)", "쉼표 DRIVE"]} rows={[
            ["묻는 것", "어디에 충전소가 있나", "지금 서야 하나 · 선다면 어디가 맞나"],
            ["답", "안성휴게소 70km (가장 가까운 급속, 시설 좋음)", "김천휴게소 250km — 도착 시 약 10%(보수적 3%), 80% 까지 약 22분, 보수적 추정으로도 한 번 충전으로 도착 예상"],
            ["결과", "안성에서 80% 까지 채워도 남은 330km 를 추정상 못 가 한 번 더 서게 된다", "설정한 가정과 추정 범위에서 한 번 충전으로 도착 예상. 안성은 '충전해도 한 번 더 서야 함' 으로 제외 이유가 적힌다"],
            ["동승자", "따로 검색", "화장실·주차 필수 통과, 유아 편의시설·반려동물 구역은 점수와 미충족 표시"],
          ]} />
        </Section>

        <Section id="platform" title="5. 플랫폼 적합성 (공식 문서로 확인, 2026-10-24)">
          <ul>
            <li>카테고리 <strong>Mobility Services</strong>. 공식 문서의 주행 중 제한적 허용 예시에 <em>&ldquo;Finding EV charging stations and setting them as waypoints&rdquo;</em> 가 <strong>명시</strong>돼 있다 — 이 앱의 핵심 동작 그대로.</li>
            <li>NaviHelper SDK v3.0.5: 경유지 <strong>최대 2개</strong>(<code>WaypointIndex.FIRST/SECOND</code>) · <code>addWaypoint()</code> · <code>onWaypointChanged()</code> · <code>onWayPointArrived()</code> · 권한 <code>pleos.car.permission.NAVI_ROUTE_SEARCH</code>. <em>&ldquo;요청 성공이 완료를 뜻하지 않는다 — 콜백으로 확인&rdquo;</em> 은 우리 설계와 같다.</li>
            <li>Vehicle SDK v2.3.2(2026-10-19): <strong>EvBattery · HVAC · Odometer · DrivingMode</strong> (+ Brake). <code>getCurrentEvEfficiency</code> · <code>registerEvBatteryStateOfCharge</code> 가 추가돼 기준 소비율을 차량 효율값으로 바꿀 수 있다. 속도·기어·외기온은 <strong>AAOS Car API</strong>(같은 릴리즈에서 <code>VehicleSpeedListener</code> 삭제 — Standard First). 차량별 지원은 <code>checkXXXCapabilities</code>.</li>
            <li>에뮬레이터 Virtual Console 에 <strong>Energy(Battery SOC · Capacity · Remaining Range) · Climate(HVAC) · Motion(Odometer · Gear)</strong> 카드가 있어 시연 조작판의 값을 그대로 재현할 수 있다. 폼 팩터 프리셋이 Connect-S 17&quot; 2560×1440 · 세로 앱 창 840×1184dp 를 확인해 준다.</li>
            <li>앱 창은 1~2개, <strong>세로 기본·가로 확장</strong>, 둘 다 필수. 상단바·GNB 는 시스템 영역. <strong>DO 미선언 시 주행 중 사용 불가</strong> — DO 선언 전제로 <code>UX_RESTRICTIONS</code>(키보드·검색·설정·영상 금지)를 지킨다.</li>
          </ul>
        </Section>

        <Section id="api" title="6. Pleos API 매핑 — 기능 하나마다 어떤 API 를 어떻게">
          <p>&ldquo;Pleos Playground 공개 API 활용&rdquo;이 과제다. 아래는 기능별로 <strong>어느 SDK 의 무엇</strong>을 쓰는지와, 그 사실을 <strong>어디까지 확인했는지</strong>다.</p>
          <Table head={["기능", "SDK / API", "메서드 · 권한", "확인 상태"]} rows={[
            ["배터리 잔량 · 용량 · 효율", "Vehicle SDK 2.3.2 · EvBattery", "registerEvBatteryStateOfCharge · registerCurrentEvEfficiency (VehicleListener.onFailed 필수) · 용량은 AAOS INFO_EV_BATTERY_CAPACITY (SDK 쪽 deprecated) · 권한 CAR_ENERGY · CAR_INFO", "앱에 연결 · 실기기 설치 · 에뮬레이터 실행 전"],
            ["공조 상태 (대기 소비 추정)", "Vehicle SDK · HVAC", "HVAC 전원·온도·풍량 조회, registerHvacTemperature…", "문서 확인"],
            ["주행 시간 · 거리 (휴식 간격)", "Vehicle SDK · Odometer", "트립 거리·시간", "문서 확인"],
            ["주행 모드 (효율 보정)", "Vehicle SDK · DrivingMode", "드라이브 모드 조회", "문서 확인"],
            ["주행 / 정차 판정", "AAOS Car API + Vehicle Gear", "CarPropertyManager 속도·기어·PARKING_BRAKE_ON · Vehicle Gear(CAR_DRIVE)", "문서 확인 (Standard First) · Vehicle Brake 는 페달 상태만(실물 SDK)"],
            ["외기온 (저온 보정)", "AAOS Car API", "ENV_OUTSIDE_TEMPERATURE", "문서 확인 (Standard First 예시)"],
            ["현재 경로 · 남은 거리", "NaviHelper", "getDestinationInfo → onDestinationInfo(remainDistance) · onCurrentLocationInfo", "문서 확인"],
            ["경유지 추가 · 확인 · 도착", "NaviHelper 3.0.5", "addWaypoint(RequestWaypointInfo) · onWaypointChanged(WaypointChangedInfo: ADD) · onWayPointArrived · 권한 NAVI_ROUTE_SEARCH", "앱에 연결 · 에뮬레이터 실행 전"],
            ["내비 도착 잔량 예측 (주행 구간 기준값)", "NaviHelper 3.0.5", "getRouteStateInfo → RouteStateInfo.remainDestinationChargingInt · remainWaypointChargingInt · TripInfo.estimatedSocAtDest", "앱에 연결 · 단위(%) 확인 전"],
            ["내비 충전 계획 (비교·참고)", "NaviHelper 3.0.5", "onDrivingInfo → DrivingState(isRecommendedChargingStation · targetSoc · ChargingPlan)", "실물 SDK 확인"],
            ["주행 중 제한", "AAOS CarUxRestrictionsManager", "NO_KEYBOARD · NO_FILTERING · NO_SETUP · LIMIT_CONTENT", "문서 확인"],
            ["음성 안내 9문장", "TextToSpeech SDK v3.3.1", "TextToSpeech(Mode.ON_DEVICE) · initialize · speak — ON_DEVICE 는 앱 등록 불필요 · 권한 TTS_SERVICE · 문구는 docs/06-demo.md", "앱에 연결 · 없으면 Android TTS 로 물러남"],
            ["현재 위치", "FusedLocation SDK v1.1.3", "후보까지 거리", "버전 확인"],
            ["휴게소 · 충전기 · 시설 데이터", "자체 (공공데이터: 한국도로공사 휴게소 충전소·편의시설)", "앱 내 캐시 · 출처 표기", "데이터셋 확보 전 (시연은 가상)"],
          ]} />
          <p><strong>없을 때는 이렇게 한다</strong> — 차종마다 지원이 다르므로(<code>checkXXXCapabilities</code>) 입력마다 폴백이 있다:</p>
          <Table head={["입력", "없으면", "화면에 적는 것"]} rows={[
            ["EV 효율값", "차종 기본값 16 kWh/100km", "\"차종 기본값 · 가정\""],
            ["배터리 잔량·용량", "사용자가 직접 입력 (정차 중)", "\"직접 입력\""],
            ["공조 상태", "켜짐으로 가정 (보수적)", "\"공조 ON 가정\""],
            ["외기온", "마지막으로 읽은 값, 없으면 10°C", "\"외기온 미확인\""],
            ["트립 시간(Odometer)", "앱 내 수동 타이머", "\"수동 타이머\""],
            ["속도·기어", "주행 상태 UNKNOWN → 정차 중 전용으로 동작", "—"],
            ["경로·남은 거리(NaviHelper)", "목적지 거리를 사용자가 입력", "\"내비 미연결\""],
          ]} />
          <p><strong>실제 SDK 로 만든 Android 앱.</strong> 판단 규칙(core)과 이 어댑터를 소스 그대로 컴파일한 Compose 앱의 release APK 가 있다(저장소 apk/). 앱은 먼저 실제 Vehicle·NaviHelper·TextToSpeech 서비스에 붙고, 없으면 4초 안에 시연 모드로 물러나 화면에 차량·내비 연결 상태를 각각 적는다 — 실기기에서 SDK 가 실제 서비스(ai.pleos.playground.service.vehicle · …navi)에 바인딩을 시도하는 것을 로그로 확인했다. 웹 시연과 같은 값(부족 47% · 김천 88 · 마중 귀가 28%)이 나온다.</p>
          <p><strong>실제 SDK 로 컴파일 검증.</strong> SDK 는 공식 공개 Maven 저장소에 있다. 그 실물 jar(NaviHelper 3.0.5 · Vehicle 2.3.2)와 android.jar(API 34)에 대고 우리 어댑터를 컴파일했고 통과했다(2026-10-25). 그 과정에서 문서 예시엔 없던 필수 인자(RequestWaypointInfo 의 poiId·address·poiSubId)와 필수 콜백(VehicleListener.onFailed)을 컴파일러가 잡아 고쳤다. 남은 것은 에뮬레이터에서의 <strong>실행</strong>이다. 경유지 추가는 이렇게 한다 — <strong>요청을 성공으로 치지 않는다.</strong></p>
          <pre className="not-prose print-avoid bg-surface border-line overflow-x-auto rounded-xl border p-4 text-xs leading-relaxed">{`// adapters/PleosNavigationProvider.kt — 공식 공개 저장소의 NaviHelper 3.0.5 실물 jar 에 대고 컴파일 통과 (2026-10-25)
override suspend fun addStop(stop: RestStop): NavResult {
    val used = waypoints.size                                   // onWayPointInfo 로 받아 둔 슬롯 수
    if (used >= 2) return NavResult.SlotFull(used)              // 기존 경유지를 지우지 않는다
    val index = if (used == 0) WaypointIndex.FIRST else WaypointIndex.SECOND
    return withTimeoutOrNull(10_000) {
        suspendCancellableCoroutine { cont ->
            val listener = object : NaviHelperEventListener {
                override fun onWaypointChanged(info: WaypointChangedInfo) {   // 여기서야 "추가됨"
                    if (info.cmdType == WaypointCmdType.ADD && info.index == index) { navi.removeListener(this); cont.resume(NavResult.Added) }
                }
                override fun onError(code: NaviErrorCode) { navi.removeListener(this); cont.resume(NavResult.Failed(code.name)) }
            }
            navi.addListener(listener)
            navi.addWaypoint(RequestWaypointInfo(latitude = stop.location.lat, longitude = stop.location.lon, poiName = stop.name,
                waypointIndex = index, poiId = stop.id, address = stop.name, poiSubId = ""))   // 실물에서 필수 — 컴파일러가 잡았다
        }
    } ?: NavResult.Unavailable                                  // 10초 안에 콜백이 없으면 경로는 그대로
}`}</pre>
        </Section>

        <Section id="scenario" title="7. 시나리오 — 서울 → 부산, 가족 + 반려견 (수치는 가상)">
          <ol>
            <li><strong>정차·출발 전</strong> — 목적지 부산, 도착 후 대기 40분, 최소 잔량 20%, 동승자 어린이 + 반려동물.</li>
            <li><strong>에너지 계획</strong> — 배터리 68%, 외기 6°C, 공조 ON. 주행 추정 93% ± 11, 대기 2%, 최소 20% → <strong>약 47% 부족(36~58%)</strong>. <em>&ldquo;도착 후 40분 대기까지 하려면 약 47% 가 모자랍니다. 경로상 한 번 충전을 권합니다.&rdquo;</em></li>
            <li><strong>후보 3곳</strong> — 먼저 <strong>갈 수 있는 곳</strong>, 그중 <strong>거기서 80% 까지 충전하면 끝까지 가는 곳</strong>만 남긴다(70km 앞 휴게소는 시설이 좋아도 남은 330km 를 또 못 가므로 빠진다). 그 안에서 화장실·주차 필수 + 유아 편의시설·반려동물 구역 선호, 경로 이탈·충전 속도·휴식 시점·신뢰도로 점수. 결과 김천 88 · 금강 82 · 황간 56. 금강은 평균으로는 한 번에 가지만 보수적 추정(+12%)으로 모자랄 수 있어 &ldquo;한 번 충전 예상 · 추가 충전 가능성&rdquo;이 붙는다. <em>&ldquo;유아 편의시설 없음&rdquo;</em>, <em>&ldquo;도착 시 약 10%(보수적 3%)&rdquo;</em> 를 그대로 적는다.</li>
            <li><strong>경유지 추가</strong> — 1위 선택 → <code>addWaypoint()</code> → <code>onWaypointChanged</code> 확인 → 내비 창에 마커. 슬롯이 찼으면 기존 경유지를 지우지 않고 교체를 묻는다.</li>
            <li><strong>주행 중</strong> — 한 줄 상태 + 음성(&ldquo;김천휴게소가 10km 앞이에요. 오른쪽 차로를 이용하세요.&rdquo;). 설정·비교 없음.</li>
            <li><strong>경유지 도착</strong> — <code>onWayPointArrived</code> → 350kW · 80% 까지 약 25분 — 그 시간이 쉼표. 재출발 시 남은 150km 는 43% 로 충분.</li>
          </ol>
        </Section>

        <Section id="energy" title="8. 에너지 추정 — 정직하게">
          <div className="not-prose print-avoid bg-surface border-line rounded-xl border p-3 sm:p-4"><EnergyFigure className="w-full" /></div>
          <pre className="not-prose bg-surface border-line overflow-x-auto rounded-xl border p-4 text-xs leading-relaxed">{`주행 소비(%) = 거리 × 기준 소비율 × 보정(주행모드 · 외기온 · 공조) ÷ 배터리 용량
대기 소비(%) = 대기 시간 × 공조 분당 소비 ÷ 배터리 용량
부족분       = 주행 + 대기 + 최소 잔량 − 현재 잔량`}</pre>
          <ul>
            <li>기준 소비율은 <strong>EvBattery 효율값</strong>(<code>getCurrentEvEfficiency</code>)이 있으면 그 값, 없으면 차종 기본값 16 kWh/100km(가정). 외기 10°C 이하 ×1.08, 0°C 이하 ×1.2, 공조 ×1.04, SPORT ×1.12, ECO ×0.93. <strong>검증:</strong> 이 계수로 −7°C 히터 최대(환경부 저온 인증 조건)를 넣으면 상온·공조 OFF 대비 주행거리가 약 20% 줄어 환경부 인증 42개 모델 평균 −21% 와 맞는다 — 단위 테스트로 고정해 두었다.</li>
            <li><strong>항상 범위(±)로 보여 준다.</strong> 제조사 공식 주행가능거리처럼 보이게 하지 않는다. 범위의 낙관적 끝이 0을 넘어야 &ldquo;확실히 부족&rdquo;, 비관적 끝만 넘으면 &ldquo;아슬아슬&rdquo;.</li>
            <li>보정 계수는 전부 가정값이며 화면의 &ldquo;어떻게 계산했나&rdquo; 패널에 그대로 적힌다. Virtual Console 의 SOC·Capacity 와 효율값으로 보정한다.</li>
            <li><strong>내비 예측을 기준으로.</strong> Pleos 내비가 목적지 도착 잔량을 예측한다(RouteStateInfo.remainDestinationChargingInt — 실물 SDK 확인). 그 값이 있으면 가는 길 소비는 내비 값을 쓰고 오차를 ±5%(가정)로 좁히며, 오는 길은 내비/모델 비율로 보정한다. 예: 80%·150km 에 내비가 48% 라고 하면 주행 32%(30~34%) → 도착 46%. 우리 모델은 내비 값이 없을 때의 폴백이다. 테스트로 고정했다.</li>
            <li><strong>충전 시간</strong>(&ldquo;80% 까지 약 N분&rdquo;)은 충전기 출력과 차량 최대 수용 출력(가정 230kW) 중 작은 값에 테이퍼 비율(200kW 이상 0.65 · 50kW 이상 0.8 · 그 아래 0.9)을 곱한 평균 출력으로 센다. 곡선을 흉내 내지 않는 대신 &ldquo;약&rdquo;을 붙인다 — 김천 350kW 10→80% 약 22분, 황간 50kW 17→80% 약 73분.</li>
          </ul>
        </Section>

        <Section id="engine" title="9. 추천 엔진">
          <p>규칙 기반. 설명할 수 있어야 하고, 테스트로 증명돼야 한다. <code>Score(p) = Σ wᵢ·sᵢ(p) / Σ wᵢ</code> (sᵢ ∈ 0~100).</p>
          <Table head={["축", "가중치", "규칙"]} rows={[
            ["경로 이탈", "35", "0km → 100, 10km → 0 (선형). 10km 초과·거리 미상은 제외"],
            ["선호 시설", "25", "동승자 선호 시설 커버율. 필수 시설은 점수가 아니라 배제 조건"],
            ["충전 속도", "20", "kW ÷ 200 (상한 100). 충전 불필요 여정에선 가중치에서 뺀다"],
            ["휴식 시점", "10", "그 후보 도착 시점이 휴식 간격에 가까울수록"],
            ["정보 신뢰도", "10", "확인됨 100 / 미확인 40 — 동점 가르기"],
          ]} />
          <div className="not-prose print-avoid bg-surface border-line rounded-xl border p-3 sm:p-4"><ScoreFigure className="w-full" /></div>
          <p>점수 앞에 <strong>배제</strong>가 있다: 지나온 곳 · 필수 시설 없는 곳 · (충전 필요 시) 충전기 없는 곳 · 경로 이탈 10km 초과 또는 미상 · <strong>지금 배터리로 못 가는 곳</strong>. 거기서 80% 까지 충전하면 끝까지 갈 것으로 추정되는 후보가 하나라도 있으면 그것만 남긴다. 판정은 둘로 나눈다 — <strong>보수적 추정(주행 +12%)으로도 도착</strong>이면 &ldquo;보수적으로도 한 번 충전으로 도착&rdquo;, 평균으로만 도착이면 &ldquo;한 번 충전 예상 · 추가 충전 가능성&rdquo;. &ldquo;한 번만 충전하면 끝까지&rdquo;는 약속이 아니라 추정이다.</p>
          <p>빠진 후보에도 이유가 붙는다 — &ldquo;제외 N곳 — 왜 빠졌나&rdquo;를 펼치면 <em>안성: 충전해도 한 번 더 서야 함 · 칠곡: 지금 배터리로 못 감 · 죽암: 충전기 없음(또는 미확인) · 천안 IC 밖: 경로 이탈 거리 미상</em> 처럼 한 줄씩 적힌다. 추천 이유만으로는 &ldquo;안성은 왜 없지?&rdquo;에 답할 수 없다.</p>
          <p>후보는 <strong>최대 3개</strong> — 많을수록 운전자가 화면을 오래 본다. 각 후보에 <strong>이유</strong>(도착 시 잔량 포함)와 <strong>미충족 선호 시설</strong>이 붙는다. 규칙은 순수 Kotlin <code>core/</code> 의 단위 테스트가 증명한다(Kotlin 34 · TS 25, 2026-10-24 전부 통과 — &ldquo;거기서 충전해도 끝까지 못 가는 곳은 시설이 좋아도 빠진다&rdquo; 같은 문장이 테스트 이름이고, 기본 시나리오의 47%·김천 88 같은 값은 웹 시연과 똑같이 고정돼 있다).</p>
        </Section>

        <Section id="screens" title="10. 화면 — 세로 기본 · 가로 확장">
          <Table head={["#", "세로 (핵심)", "가로 확장 (추가)"]} rows={[
            ["01 상태", "큰 숫자 하나(부족분 또는 도착 잔량) · 제안 한 줄", "+ 차량 상태 패널 (배터리·공조·주행모드·타이어)"],
            ["02 여정", "목적지 · 대기 시간 · 최소 잔량 · 동승자", "+ 이 조합의 필수/선호 시설"],
            ["03 에너지 계획", "주행/대기/최소 막대 · 부족분 · 제안", "+ 계산 가정 · 주의"],
            ["04 후보", "카드 3개 · 점수 · 미충족 · 결과는 토스트", "+ 1위 점수 구성"],
            ["05 주행 중", "한 줄 + 음성 (DO)", "같음"],
            ["06 도착·재계산", "이번 정차 · 충전 뒤 남은 구간 재계산", "+ 오늘 정차 기록"],
          ]} />
          <p>상단바·하단 탭은 그리지 않는다 — 시스템(Status bar·GNB) 것이다. 지도도 그리지 않는다 — 옆 창의 내비가 한다. 창 치수(세로 840×1184 · 가로 1700×1184), 색 토큰, 글자 크기(Headline/Title/Body/Label), 버튼·토스트 규격은 Pleos 공식 디자인 문서 값이고 폰트는 공식 Asta Sans 다. 시연의 &ldquo;앱 창만&rdquo; 보기에는 공식 FormFactorConsole 프리셋과 같은 dp 로 <strong>17&quot; 세로 840×1184 · 17&quot; 가로 1700×1184 · 14.6&quot; 가로 1360×948 · 12.9&quot; 세로 628×855</strong> 가 있어, 글자·여백은 dp 로 고정한 채 창만 바꿔 접힘을 확인할 수 있다(낮은 창은 본문이 스크롤).</p>
          <ScreenGallery />
        </Section>

        <Section id="driving" title="11. 주행 중 동작 (DO)">
          <ul>
            <li>DO 선언을 전제로 <code>CarUxRestrictions</code> 를 읽어 키보드·검색·필터·설정·영상을 끈다.</li>
            <li>주행 중 화면은 <strong>한 줄 상태</strong>(다음 경유지까지 km 또는 도착 예상 잔량)와 <strong>음성 안내</strong>뿐. 한 문장에 숫자 하나, 주행 중엔 질문하지 않는다. 설정·비교는 정차 후.</li>
            <li>절대 자동으로 경로를 바꾸지 않는다. 경유지는 사용자가 고르고 콜백으로 확인.</li>
            <li>백그라운드로 가면 타이머·폴링을 멈추고, 복귀하면 상태를 복원해 창 크기에 맞게 다시 그린다.</li>
          </ul>
        </Section>

        <Section id="scope" title="12. 범위와 제외">
          <p><strong>MVP</strong>: 여정 설정 · 에너지 계획 · 후보 3개 · 경유지 전달 · 주행 중 모드 · 도착 재계산. 서울→부산 <strong>한 경로</strong>.</p>
          <p><strong>제외</strong>: 로그인 · 결제 · 커뮤니티 · 충전소 예약 · 전국 데이터 · 자동 동승자 감지 · 피로도 · 고장 예측 · 차량 제어 · 자체 지도 · 범용 음성 비서 · 3D 필수화.</p>
        </Section>

        <Section id="plan" title="13. 구조와 구현 계획">
          <div className="not-prose print-avoid bg-surface border-line rounded-xl border p-3 sm:p-4"><ArchitectureFigure className="w-full" /></div>
          <p>Kotlin · Jetpack Compose AAOS 앱. 에너지 추정·추천 엔진·휴식 스케줄은 Android 의존 없는 순수 Kotlin 모듈로 분리해 단위 테스트로 규칙을 증명한다. Pleos SDK 는 어댑터 인터페이스 뒤에 두어 실제 연동과 시연용 모의를 바꿔 끼운다 — 2026-10-19 릴리즈에서 NaviHelper 의 좌표 인자 순서가 바뀌었는데, 이런 변화가 닿는 곳이 어댑터 한 파일이다. <strong>웹 시연이 그 설계를 미리 보여 준다</strong> — 같은 규칙의 TS 거울이 돌고, Kotlin 테스트는 TS 가 낸 값을 그대로 고정해 둔다.</p>
          <Table head={["시기", "할 일", "산출물"]} rows={[
            ["10/25 완료", "Android 앱 release APK · 실기기 실행 · 실기기 녹화 시연 영상 · 접수양식 02 작성", "apk/ · 영상 · DOCX"],
            ["~10/30", "설명회(10/28)에서 DO 절차·카테고리·외기온 입력·심사 환경 확인 · 에뮬레이터에서 addWaypoint() 한 번", "검증 완료 표기"],
            ["~11/6", "Virtual Console 값으로 에너지 보정 · 한국도로공사 공공데이터로 실 휴게소 15~30곳 · TTS 문장", "실데이터 후보 · 보정 계수"],
            ["~11/15", "접수양식(DOCX) · GitHub(소스 + release APK) · 시연 영상 · 1차 제출", "제출"],
            ["11/16~12/2", "에뮬레이터 실연동(NaviHelper·Vehicle) · DO 플래그 대응 · 가로/세로 폼 팩터 테스트 · PT 리허설", "본선 시연"],
          ]} />
        </Section>

        <Section id="business" title="14. 사업성 · 확장">
          <p><strong>누구에게 무엇이 좋아지나.</strong> 운전자는 필요할 때만 가능한 한 적게 서고, 동승자는 그 정차가 편하다. 필요 없으면 서지 않아도 된다는 확신을 얻는다. 현대차그룹은 &ldquo;EV 는 충전이 불편하다&rdquo;는 인식을 <em>차 안에서</em> 바꾸는 기능을 얻는다 — 폰 앱으로는 배터리·효율·공조를 못 읽고 경유지를 못 꽂는다.</p>
          <Table head={["단계", "모델", "지키는 선"]} rows={[
            ["1. 기본 (무료)", "Pleos App Market · Mobility Services. 차량 구매자의 EV 경험 품질 — 브랜드 가치가 1차 수익", "광고 없음"],
            ["2. 제휴", "충전사업자(SK일렉링크 휴게소 62곳 200기 · 채비 27곳 138기 등)와 '여기서 충전' 연결 · 휴게소 F&B·반려동물 시설 쿠폰", "유료 노출이 순위를 바꾸지 않는다 — 제휴는 배지로만 구분"],
            ["3. 플릿 (B2B)", "Pleos Fleet API 로 법인 EV 차량군의 충전·휴식 계획과 운행 기록 — 구독", "개인 경로를 서버에 영구 보관하지 않는다"],
          ]} />
          <p><strong>확장.</strong> 기아·제네시스 테마는 토큰 구조가 같아 색만 바뀐다. 내연기관은 Vehicle Fuel 도메인으로 &ldquo;주유 + 휴식&rdquo;이 된다. 해외는 충전 네트워크·반려동물 동승 문화가 더 성숙한 유럽부터. Gleo AI 와는 Gleo Interface 로 &ldquo;다음 쉼표 어디야?&rdquo;를 받는다 — 우리는 답을 계산하고 말은 Gleo 가 한다.</p>
          <p><strong>왜 플랫폼이 우리를 원하나.</strong> 플랫폼 입장에서 좋은 서드파티 앱은 플랫폼 API 를 깊게 쓰면서 플랫폼 기능(검색·지도·음성)과 겹치지 않는 앱이다. 쉼표 DRIVE 는 Vehicle 4개 도메인 + NaviHelper + AAOS + TTS 를 쓰고, 검색·지도·음성은 한 줄도 만들지 않는다.</p>
        </Section>

        <Section id="kpi" title="15. 검증 계획 — 달성 목표">
          <div className="not-prose print-avoid grid gap-3 sm:grid-cols-4">
            {[["95% 이상", "시연 시나리오 정상 완료율"], ["3회 이하", "정차 상태에서 경유지 확정까지 조작 수"], ["100%", "권한·연결·데이터 장애 안내 처리"], ["0건", "사용자 확인 없는 경로 변경 · 범위 없는 에너지 수치"]].map(([n, d]) => (
              <div key={d} className="bg-surface border-line rounded-xl border p-4"><p className="text-accent text-2xl font-bold tabular-nums">{n}</p><p className="text-muted mt-1 text-xs leading-relaxed">{d}</p></div>
            ))}
          </div>
          <p>검증 방법: ① 순수 Kotlin 단위 테스트(규칙 문장 = 테스트 이름, Kotlin 34 · TS 25 통과) ② Virtual Console 로 SOC·HVAC·Odometer 를 바꾸며 화면 반응 확인 ③ 폼 팩터 테스트(17&quot;·14.6&quot;·12.9&quot; × 세로/가로) ④ 사용자 5명 과업 테스트 — &ldquo;출발 전 경유지 확정&rdquo;까지의 조작 수와 소요 시간.</p>
        </Section>

        <Section id="risks" title="16. 위험과 대응">
          <ol>
            <li><strong>추정이 틀린다</strong> — 항상 범위로 보여 주고 &ldquo;추정&rdquo;이라 적는다. 차량 효율값과 Virtual Console 로 보정. 공식 주행가능거리와 혼동되지 않게 한다. <strong>오차가 커지는 때를 화면에 적는다</strong>: 영하 10°C 이하 · 100km/h 이상 고속(현재 모델에 속도 항이 없다 — 평균 80km/h 가정) · 탑승 인원·적재 · 비·맞바람. 에너지 화면의 &ldquo;무엇이 바뀌면&rdquo; 표가 조건별 부족분 변화(외기 −5°C, 공조 OFF, 대기 +20분, ECO/SPORT)를 숫자로 보여 준다.</li>
            <li><strong>Vehicle 데이터 접근이 차종에 따라 다르다</strong> — <code>checkXXXCapabilities</code> 로 확인하고, 없으면 사용자가 배터리를 직접 입력하는 경로를 둔다.</li>
            <li><strong>내비가 이미 충전 계획을 세운다</strong> — 실물 SDK 로 확인했다. 그래서 주행 구간·충전 계획은 내비 것을 쓰고, 우리는 그 뒤(도착 후 대기·귀가·동승자 조건·재판단·만약에)만 맡는다. 겹치지 않는 것이 플랫폼 앱으로서의 장점이다.</li>
            <li><strong>휴게소 추천 앱으로만 보인다</strong> — 정체성은 &ldquo;충전이 필요한가 · 이후 일정까지 가능한가&rdquo;의 판단이다. 픽업·마중(WAIT)을 두 번째 시연으로 두고, 충전이 필요 없을 때의 결정을 화면 첫 줄에 둔다.</li>
            <li><strong>Gleo AI·내비와 겹쳐 보인다</strong> — 검색을 만들지 않는다. 시연의 하이라이트를 &ldquo;부족분 판단 → 동승자 조건 선별 → 경유지 반영&rdquo;에 둔다.</li>
            <li><strong>DO 선언 절차·카테고리 심사</strong> — 설명회에서 확인. 안 되면 정차 중 전용으로 좁힌다 (핵심은 어차피 정차 중이다).</li>
            <li><strong>휴게소 데이터 품질</strong> — 공공데이터를 쓰되 미확인 항목은 신뢰도 40 으로 깎고 &ldquo;정보 미확인&rdquo;을 적는다. 틀린 추천 한 번이 가장 큰 손실이다.</li>
            <li><strong>에뮬레이터 환경</strong> — 최소 그래픽 사양(RTX 3060급)이 높다. 본선 시연 환경을 설명회에서 확인하고, 웹 시연을 보조 수단으로 둔다.</li>
          </ol>
        </Section>

        <Section id="sources" title="17. 출처">
          <ol className="text-sm">
            <li>환경부 인증 42개 모델 저온 주행거리 분석 보도 (2024-01-05, 다음뉴스 전재) — 상온 대비 평균 −21%, 저온 −7°C 히터 최대.</li>
            <li>KB금융지주 경영연구소, 『2025 한국 반려동물 보고서』(2025-06-29) — 2024년 말 기준 반려가구 591만(전체 가구의 26.7%), 반려인 1,546만 명(인구의 29.9%). 원문 확인.</li>
            <li>한국관광공사 반려동물 동반여행 조사 보도 (2025) — 동반 여행 희망 75.8%, 포기 이유 숙박 46.4%·음식점 44.8%.</li>
            <li>뉴시스 2025-10-03 (한국도로공사 자료) — 고속도로 휴게소 반려견 놀이터 전국 20곳(2025-06 기준). 덕평·용인(강릉)·죽암·충주(양평)·오수·군산(서울)·화서(영덕)·진주(부산) 등. 원문 확인.</li>
            <li>SK일렉링크 고속도로 휴게소 충전소 보도 (2023) — 62개 휴게소 200기(350kW 53·200kW 147).</li>
            <li>채비 고속도로 휴게소 급속 충전망 보도 (2026-07) — 27개 휴게소 138기.</li>
            <li>Pleos Playground 공식 문서 (document.pleos.ai, 2026-10-24 열람) — NaviHelper · Vehicle SDK · 앱 카테고리/주행 제한 · 디자인 가이드 · 2026-10-19 릴리즈 노트 · Virtual Console · 폼 팩터 테스트 가이드. 상세는 저장소 <code>docs/research/PLEOS_PLATFORM.md</code>.</li>
          </ol>
          <Note>시연의 휴게소·충전기·시설·거리 수치는 전부 가상이며, 장소 이름만 실제 휴게소에서 빌렸다. 에너지 수치는 추정이고 제조사 공식 주행가능거리가 아니다.</Note>
        </Section>
      </article>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
      <div className="text-text/90 space-y-4 text-[15px] leading-relaxed [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:text-[13px] [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_strong]:text-text [&_ul]:list-disc [&_ul]:space-y-1.5">{children}</div>
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="border-warn/40 bg-warn/10 rounded-xl border px-4 py-3 text-sm leading-relaxed">{children}</p>;
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="not-prose print-avoid overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-muted text-xs"><tr>{head.map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-line border-t">{r.map((c, j) => <td key={j} className={j === 0 ? "py-2 pr-3 font-medium" : "text-muted py-2 pr-3"}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
