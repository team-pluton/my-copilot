import Link from "next/link";
import { ArrowRight, BatteryCharging, Route, ShieldCheck, Users } from "lucide-react";
import { ArchitectureFigure } from "@/components/figures/architecture";
import { ShellPreview } from "@/components/landing/shell-preview";

/**
 * 소개 — 심사위원이 처음 보는 화면. 30초 안에 "무슨 문제를 어떻게 푸는가"가 읽혀야 한다.
 * 긴 설명은 기획서로 보내고 여기는 한 문장 + 살아 있는 미리보기 + 세 축 + 구조도.
 */
export default function Home() {
  return (
    <div className="space-y-16">
      <section className="space-y-6 pt-8 sm:pt-12">
        <p className="text-accent text-sm font-semibold tracking-wide">현대자동차그룹 차량용 앱 개발 공모전 2026 · Pleos Connect</p>
        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          자동차가 지금 상태를 알려준다면,
          <br />
          쉼표 DRIVE 는 <span className="text-accent">앞으로 무엇을 할 수 있는지</span> 알려줍니다.
        </h1>
        <p className="text-muted max-w-2xl text-base leading-relaxed sm:text-lg">
          주행과 <strong className="text-text">도착 후 차량 사용(대기·귀가)</strong>까지 예측하고, 공조·외기·실주행 효율이
          달라질 때마다 <strong className="text-text">이동 계획을 다시 판단</strong>하는 차량용 모빌리티 서비스입니다.
          충전이 필요 없으면 그렇다고 말하고, 필요하면 선택지(15분만 · 80% 까지 · 공조 끄기)를 비교해 보여 준 뒤
          동승자 조건에 맞는 곳을 내비 경유지로 넘깁니다. 검색과 지도는 내비가, <strong className="text-text">판단</strong>은 우리가 합니다.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/demo/" className="bg-accent hover:bg-accent-strong inline-flex h-12 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition-colors">
            Pleos 화면에서 직접 시연 <ArrowRight className="size-4" />
          </Link>
          <Link href="/proposal/" className="border-line hover:bg-surface inline-flex h-12 items-center rounded-xl border px-5 text-sm font-semibold transition-colors">
            기획서 읽기
          </Link>
        </div>
      </section>

      {/* 살아 있는 미리보기 — 핵심 장면 8개 자동 재생. 폰에서는 셸이 작아 숨기고 시연 페이지로 보낸다 */}
      <section className="space-y-3">
        <div className="hidden sm:block"><ShellPreview /></div>
        {/* 폰: 셸을 그대로 그리면 글자가 안 읽혀 녹화 GIF 로 대신한다 (public/demo.gif — 코드가 바뀌면 다시 뜬다) */}
        {/* eslint-disable-next-line @next/next/no-img-element -- 정적 내보내기, GIF 는 최적화 대상이 아니다 */}
        <img src="/demo.gif" alt="시연 장면 자동 재생: 상태 → 후보 → 경유지 추가 → 주행 → 도착" width={880} height={501} className="border-line w-full rounded-xl border sm:hidden" />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className="text-muted">
            <span className="hidden sm:inline">자동 재생 · </span>Pleos Connect 시스템 셸(Connect-S 17인치, 2560×1440 비율) 안의 <strong className="text-text">왼쪽 앱 창</strong>이 우리 앱. 오른쪽은 내비 — 경유지 마커가 거기에 생깁니다.
          </p>
          <span className="flex items-center gap-3"><a href="/app-demo-vertical.mp4" className="text-muted font-semibold hover:underline">앱 실기기 영상</a><a href="/demo.mp4" className="text-muted font-semibold hover:underline">웹 시연 영상</a><Link href="/demo/" className="text-accent font-semibold hover:underline">직접 조작하기 →</Link></span>
        </div>
      </section>

      {/* 판단 → 실행 → 변화 → 재판단 — 출발 전에 한 번 계산하고 끝나는 앱과 갈리는 자리 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">판단 → 실행 → 상황 변화 → 재판단</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["① 판단", "주행 + 대기 + 귀가 에너지를 범위로. 충분 · 아슬아슬 · 부족 세 단계."],
            ["② 비교 · 실행", "만약에 — 충전 없이 / 15분만 / 80% 까지 / 공조 끄기를 나란히. 고르면 NaviHelper 경유지로."],
            ["③ 상황 변화", "Vehicle SDK 가 잔량·공조·외기·실주행 효율 변화를 알린다 (getCurrentEvEfficiency 등)."],
            ["④ 재판단", "판정이 바뀌거나 3%p 이상 움직일 때만 알린다. 향하는 경유지에 닿기 어려우면 음성으로 — 경로는 바꾸지 않는다."],
          ].map(([t, d]) => (
            <div key={t} className="bg-surface border-line rounded-2xl border p-4"><p className="text-accent text-sm font-semibold">{t}</p><p className="text-muted mt-1 text-xs leading-relaxed">{d}</p></div>
          ))}
        </div>
      </section>

      {/* 세 순간 — 휴게소 추천이 정체성이 아니라 여러 수단 중 하나라는 것 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">하나의 판단, 세 순간</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["JOURNEY · 장거리 여행", "편도 + 도착 후 대기를 세어 충전이 필요한지 판단하고, 필요하면 동승자 조건에 맞는 충전·휴식 경유지를 고른다.", "시연 1 · 서울→부산"],
            ["WAIT · 픽업·마중", "가서 기다렸다 돌아오기까지 센다. 귀가 시 잔량과 '공조 켜고 최대 몇 분' 을 알려 주고, 충분하면 충전하지 않아도 된다고 말한다.", "시연 2 · 공항 마중"],
            ["STAY · 캠핑·차박", "목적지 체류(공조·외부 전력)와 귀가 잔량을 예산으로. 외부 전력은 사용자 입력·검증 데이터일 때만 계산한다.", "설계 — 본선 이후"],
          ].map(([t, d, s]) => (
            <div key={t} className="bg-surface border-line rounded-2xl border p-5"><p className="text-accent text-xs font-semibold">{s}</p><p className="mt-1 text-base font-semibold">{t}</p><p className="text-muted mt-2 text-sm leading-relaxed">{d}</p></div>
          ))}
        </div>
      </section>

      {/* 근거 띠 — "그럴듯한 기획" 이 아니라 확인된 것 위에 서 있다는 표시 */}
      <section className="border-line grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-4">
        {[
          ["공식 문서로 확인", "경유지 2개 · DO 정책 · 창 2560×1440 · 토큰 · SDK v2.3.2"],
          ["Android 앱 · 실물 SDK", "실물 Pleos SDK 로 빌드한 release APK · 실기기 실행 · Kotlin 34 · TS 25 테스트 통과"],
          ["플랫폼이 허용한 동작", "Mobility Services: 'EV 충전소 찾기 + 경유지 설정'"],
          ["만들지 않는 것", "검색 · 지도 · 음성 비서 · 자동 경로 변경"],
        ].map(([t, d]) => (
          <div key={t} className="bg-surface p-4"><p className="text-accent text-xs font-semibold">{t}</p><p className="text-muted mt-1 text-xs leading-relaxed">{d}</p></div>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: BatteryCharging, title: "도착 후 사용까지 포함한 에너지 예산", body: "목적지 도착 후 사용자가 정한 활동 — 차 안 대기, 귀가 — 의 에너지까지 이동 예산에 넣는다. 공조를 켠 채 기다리는 몫을 따로 세고 범위(±)로 보여 준다. 충분하면 충전하지 않아도 된다고 말한다." },
          { icon: Users, title: "동승자 조건으로 고르는 충전소", body: "어린이·어르신·반려동물 프리셋의 필수 시설은 배제 조건, 선호 시설은 점수와 미충족 설명. '유아 편의시설 없음'을 숨기지 않는다. 거기서 충전하면 끝까지 갈 것으로 추정되는 곳을 고르고, 불확실하면 그렇다고 적는다." },
          { icon: Route, title: "충전 정차 = 휴식", body: "충전 20~40분이 곧 쉼표다. 언제 서나는 에너지가, 어디서 서나는 동승자 조건이 정한다. 고른 곳은 NaviHelper 경유지(최대 2개)로 — 자동으로 경로를 바꾸지 않는다." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="bg-surface border-line rounded-2xl border p-5">
            <span className="bg-surface-2 text-accent mb-4 flex size-10 items-center justify-center rounded-xl"><Icon className="size-5" /></span>
            <h2 className="mb-2 text-base font-semibold">{title}</h2>
            <p className="text-muted text-sm leading-relaxed">{body}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">우리가 만드는 것은 앱 창 안쪽뿐입니다</h2>
          <p className="text-muted text-sm leading-relaxed">상태바·드라이빙뷰·GNB·내비는 차량 OS 가 그립니다. 판단(core)은 Android 를 모르는 순수 Kotlin 이라 차량 없이도 테스트로 증명하고, SDK 는 Port 뒤에 두어 실제 연동과 시연용 모의를 바꿔 끼웁니다.</p>
        </div>
        <div className="bg-surface border-line rounded-2xl border p-4 sm:p-6"><ArchitectureFigure className="w-full" /></div>
      </section>

      <section className="bg-surface border-line grid gap-6 rounded-2xl border p-6 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">플랫폼 정책 안에 정확히 들어갑니다</h2>
          <p className="text-muted text-sm leading-relaxed">
            Pleos 공식 문서의 Mobility Services 카테고리 주행 중 허용 예시에{" "}
            <em className="text-text">&ldquo;EV 충전소 찾기와 경유지 설정&rdquo;</em> 이 명시돼 있습니다. 앱 창은 세로가 기본·가로가 확장,
            주행 중에는 DO 플래그를 따라 한 줄 상태와 음성만 남깁니다. 시연이 그 구조 그대로 돕니다 — 창 치수·색·글자 크기는 공식 디자인 문서 값입니다.
          </p>
          <p className="text-muted flex items-start gap-1.5 text-xs">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            시연의 장소·수치는 가상 데이터입니다. 웹 시연의 SDK 연동은 모의이고, Android 앱은 실제 SDK 에 먼저 붙고 없으면 시연 모드라고 표시합니다. 에너지 추정은 제조사 공식 주행가능거리가 아닙니다.
          </p>
        </div>
        <Link href="/demo/" className="bg-accent hover:bg-accent-strong inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition-colors">
          시연 열기 <ArrowRight className="size-4" />
        </Link>
      </section>
    </div>
  );
}
