"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Compass, Maximize2, Moon, Pause, Play, RectangleHorizontal, RectangleVertical, RotateCcw, Sun, Unplug, Wifi, X } from "lucide-react";
import { chargeMinutes, chargePctInMinutes, compareOptions, estimate, pctPerKm, rejudge, type WhatIfOption } from "@/lib/core/energy";
import { FEASIBILITY_DEFAULTS, WEIGHTS, breakdown, excluded, feasibilityFor, rank, reachableState } from "@/lib/core/engine";
import { DEFAULT_PLAN, DEFAULT_VEHICLE, DEMO_ROUTE, DEMO_STOPS, WAIT_PLAN, WAIT_VEHICLE, WAYPOINT_SLOTS, mockAddStop } from "@/lib/core/mock";
import type { RestStop, TripMode, TripPlan, VehicleSnapshot } from "@/lib/core/model";
import { PHASE_LABEL, phaseOf } from "@/lib/core/scheduler";
import { cn } from "@/lib/utils";
import { Toast, useToast } from "./car-ui";
import { NavMock } from "./nav-mock";
import { PleosShell, WINDOW_PRESETS, type Orientation, type ShellTheme, type ViewMode, type WindowPreset } from "./pleos-shell";
import { ArrivedScreen, CandidatesScreen, DrivingScreen, EnergyScreen, SCREENS, StatusScreen, TripScreen, type ScreenId, type StopLog } from "./screens";

/**
 * 시연 전체의 상태와 판단. 화면(screens.tsx)은 표시만, 셸(pleos-shell.tsx)은 무대만.
 *
 * 위는 **Pleos 시스템 셸 안의 앱 창**, 아래는 조작판. 조작판은 실제 앱에 없는 것이다 —
 * Vehicle SDK·내비가 넣어 줄 값을 사람이 대신 넣는 자리라 셸 밖에 둔다.
 *
 * ⚠️ 어댑터는 전부 모의(Mock). 프레임 위에 그 사실을 늘 띄운다 (CLAUDE.md 정책 4).
 */
const TICK_MS = 400;
/** 경유지 추가 모의 지연 — 공식 버튼의 Loading 상태를 보여 주려는 것 */
const NAV_LATENCY_MS = 700;
const CHARGE_TARGET_PCT = FEASIBILITY_DEFAULTS.chargeTargetPct;

const narrowQuery = "(max-width: 767px)";
const subscribeNarrow = (cb: () => void) => { const m = window.matchMedia(narrowQuery); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };
const getNarrow = () => window.matchMedia(narrowQuery).matches;

export function Simulator() {
  const [plan, setPlan] = useState<TripPlan>(DEFAULT_PLAN);
  const [v, setV] = useState<VehicleSnapshot>(DEFAULT_VEHICLE);
  const [traveledKm, setTraveledKm] = useState(0);
  /**
   * 진행 거리 슬라이더의 기준점 — 그 km 에서 배터리가 얼마였나. 슬라이더를 끌면 배터리를 그만큼 **같이** 줄인다.
   * 안 그러면 250km 지점으로 점프해도 68% 그대로라 "80% 까지 4분" 같은 엉뚱한 수가 뜬다.
   * 배터리 슬라이더를 손으로 만지거나 초기화·재출발하면 기준점을 다시 찍는다.
   */
  const [origin, setOrigin] = useState({ km: 0, batteryPct: DEFAULT_VEHICLE.batteryPct });
  const [playing, setPlaying] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [theme, setTheme] = useState<ShellTheme>("dark");
  const [viewOverride, setViewOverride] = useState<ViewMode | null>(null);
  // 앱 창만 볼 때의 폼 팩터 — 공식 FormFactorConsole 프리셋과 같은 dp
  const [windowPreset, setWindowPreset] = useState<WindowPreset>("s17-portrait");
  const [screen, setScreen] = useState<ScreenId>(1);
  const [autoScreen, setAutoScreen] = useState(true);
  const [waypoints, setWaypoints] = useState<RestStop[]>([]);
  const [navAvailable, setNavAvailable] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [log, setLog] = useState<StopLog[]>([]);
  const { toast, show: showToast } = useToast();
  const stage = useRef<HTMLDivElement>(null);
  /** 실시간 재판단 기록 — 최신이 앞. 차량 값이 바뀌어 판단이 움직였을 때만 쌓인다 */
  const [rejudgeLog, setRejudgeLog] = useState<{ clock: string; message: string }[]>([]);
  /** 향하는 경유지에 닿기 어려워졌다는 경고 — 음성 칩이 이것을 먼저 읽는다. 경로는 바꾸지 않는다 */
  const [alert, setAlert] = useState<string | null>(null);
  // 가이드 투어 — 심사위원이 조작판을 몰라도 대본(docs/06-demo.md) 순서로 본다. null 이면 꺼짐
  const [tourIdx, setTourIdx] = useState<number | null>(null);

  // 폰처럼 좁으면 앱 창만. 사용자가 고르면 그 값이 이긴다
  const narrow = useSyncExternalStore(subscribeNarrow, getNarrow, () => false);
  const viewMode: ViewMode = viewOverride ?? (narrow ? "window" : "shell");

  const remainingKm = Math.max(plan.routeKm - traveledKm, 0);
  // 남은 구간 기준으로 에너지를 센다 — 경유지에서 재출발하면 자동으로 재계산된다
  const energy = useMemo(() => estimate({ ...plan, routeKm: remainingKm }, v), [plan, remainingKm, v]);
  const phase = phaseOf(plan, v);
  const rankInput = useMemo(() => ({
    plan, traveledKm, needsCharge: energy.needsCharge, tripMinutes: v.tripMinutes,
    feasibility: feasibilityFor(v, energy.waitPct, plan.minReservePct),
  }), [plan, traveledKm, energy.needsCharge, energy.waitPct, v]);
  // 충전이 필요하거나 휴식 시점이 가까우면 후보를 찾는다. 그 전엔 조용히
  const wantCandidates = energy.needsCharge || phase !== "CRUISING";
  // 장거리 여행이면 늘 계산해 둔다 — 충전이 필요 없어도 "쉬어 갈 곳만 보기" 로 열 수 있게. 픽업·마중은 경로상 휴게소가 답이 아니다
  const isWait = plan.mode === "WAIT";
  const ranked = useMemo(() => (isWait ? [] : rank(DEMO_STOPS, rankInput)), [isWait, rankInput]);
  const excludedStops = useMemo(() => (wantCandidates && !isWait ? excluded(DEMO_STOPS, rankInput) : []), [wantCandidates, isWait, rankInput]);
  // 민감도 — 조건 하나만 바꿔 다시 추정한 부족분의 차이. "어떤 상황에서 오차가 커지나" 를 숫자로
  const sensitivity = useMemo(() => {
    const base = estimate({ ...plan, routeKm: remainingKm }, v).shortfallPct;
    const d = (p: Partial<TripPlan>, vv: Partial<VehicleSnapshot>) => estimate({ ...plan, routeKm: remainingKm, ...p }, { ...v, ...vv }).shortfallPct - base;
    return [
      // 외기 계수는 구간형(10°C 이하 ×1.08 · 0°C 이하 ×1.2)이라 "5°C 더" 는 구간 안에서 0 이 된다 — 구간을 넘기는 조건으로 묻는다
      { label: v.outsideTempC > 0 ? "외기 0°C 이하로 떨어지면" : "외기 10°C 로 풀리면", deltaPct: v.outsideTempC > 0 ? d({}, { outsideTempC: 0 }) : d({}, { outsideTempC: 10 }) },
      { label: "공조를 끄면", deltaPct: d({}, { hvacOn: false }) },
      { label: "도착 후 대기 20분 더", deltaPct: d({ waitMinutesAfterArrival: plan.waitMinutesAfterArrival + 20 }, {}) },
      { label: "ECO 모드", deltaPct: d({}, { driveMode: "ECO" }) },
      { label: "SPORT 모드", deltaPct: d({}, { driveMode: "SPORT" }) },
    ];
  }, [plan, remainingKm, v]);

  // 다음 경유지 = 아직 지나지 않은 것 중 가장 가까운 것
  const selected = waypoints.filter((w) => w.routeKm > traveledKm - 0.01).sort((a, b) => a.routeKm - b.routeKm)[0] ?? null;
  const kmToSelected = selected ? Math.max(Math.round(selected.routeKm - traveledKm), 0) : null;
  /**
   * **만약에 비교** — 선택지를 나란히. 숫자 하나가 아니라 "내 선택이 이후 일정에 어떻게 닿나" 를 보여 준다.
   * 장거리: 충전 없이 · 1위 경유지에서 15분만 · 80% 까지 · 공조 끄고 / 픽업·마중: 그대로 · 1시간 더 · 공조 끄고 · 출발 전 15분
   */
  const whatIf = useMemo(() => {
    const remain = { ...plan, routeKm: remainingKm };
    const opts: WhatIfOption[] = [{ label: plan.mode === "WAIT" ? "지금 그대로" : "충전 없이 그대로", apply: (p, vv) => [p, vv] }];
    if (plan.mode === "WAIT") {
      opts.push({ label: "1시간 더 기다리면", apply: (p, vv) => [{ ...p, waitMinutesAfterArrival: p.waitMinutesAfterArrival + 60 }, vv] });
      opts.push({ label: "공조 끄고 기다리면", apply: (p, vv) => [p, { ...vv, hvacOn: false }] });
      opts.push({ label: "출발 전 15분 급속(100kW)", apply: (p, vv) => [p, { ...vv, batteryPct: Math.min(vv.batteryPct + chargePctInMinutes(15, 100, vv.batteryKwh), 100) }] });
    } else {
      const top = selected ?? ranked[0]?.stop ?? null;
      if (top?.chargerKw) {
        const kw = top.chargerKw;
        const atStop = Math.max(v.batteryPct - (top.routeKm - traveledKm) * pctPerKm(v), 0);
        const short = top.name.replace("휴게소", "");
        opts.push({ label: `${short}에서 15분만 충전`, apply: (p, vv) => [p, { ...vv, batteryPct: vv.batteryPct + chargePctInMinutes(15, kw, vv.batteryKwh) }] });
        opts.push({ label: `${short}에서 80%까지 (약 ${chargeMinutes(atStop, CHARGE_TARGET_PCT, v.batteryKwh, kw)}분)`, apply: (p, vv) => [p, { ...vv, batteryPct: vv.batteryPct + Math.max(CHARGE_TARGET_PCT - atStop, 0) }] });
      }
      opts.push({ label: "공조 끄고 가면", apply: (p, vv) => [p, { ...vv, hvacOn: false }] });
    }
    return compareOptions(remain, v, opts);
  }, [plan, remainingKm, v, selected, ranked, traveledKm]);

  /** 후보에 닿았을 때 잔량에서 80% 까지 — 카드와 도착 화면이 같은 수를 보여 준다 */
  const chargeMinutesOf = (stop: RestStop) => {
    if (!stop.chargerKw) return null;
    const atStop = Math.max(v.batteryPct - (stop.routeKm - traveledKm) * pctPerKm(v), 0);
    return chargeMinutes(atStop, CHARGE_TARGET_PCT, v.batteryKwh, stop.chargerKw);
  };
  // 도착 화면의 재계산은 **충전 뒤** 기준 — 충전 전 잔량으로 남은 구간을 세면 "아직도 부족"이라는 엉뚱한 말이 뜬다
  const energyAfterStop = useMemo(() => {
    if (!selected) return energy;
    const after = selected.chargerKw ? Math.max(CHARGE_TARGET_PCT, v.batteryPct) : v.batteryPct;
    return estimate({ ...plan, routeKm: Math.max(plan.routeKm - selected.routeKm, 0) }, { ...v, batteryPct: after });
  }, [selected, energy, plan, v]);
  // 음성 문구는 docs/06-demo.md 2절 표가 정답이다 — 여기만 바꾸지 않는다
  const voice = alert ?? (selected && kmToSelected != null && kmToSelected <= 10
    ? `${selected.name} 가 ${kmToSelected}km 앞이에요. 오른쪽 차로를 이용하세요.`
    : selected && kmToSelected != null && kmToSelected <= 50
      ? `${selected.name} 가 ${kmToSelected}km 앞이에요.`
      : isWait && !energy.needsCharge && energy.maxWaitMinutes != null
        ? `귀가까지 충분해요. 공조 켜고 약 ${energy.maxWaitMinutes >= 120 ? `${Math.floor(energy.maxWaitMinutes / 60)}시간` : `${energy.maxWaitMinutes}분`}까지 기다려도 돼요.`
      : isWait && energy.needsCharge
        ? "돌아오는 길까지 배터리가 모자랄 수 있어요. 출발 전에 충전해 두세요."
      : !selected && phase === "SUGGEST"
        ? `${v.tripMinutes}분 달렸어요. 다음 휴게소에서 쉬어 가면 좋겠어요.`
        : !selected && energy.needsCharge
          ? "도착 후 대기까지 배터리가 모자랄 수 있어요. 정차 중에 경로상 충전·휴식 후보를 보여 드릴게요."
          : null);

  // 재생 — 1틱에 1분 · 80km/h. 경유지에 닿으면 멈추고 도착 화면
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setTraveledKm((km) => {
        const next = km + DEMO_ROUTE.kmPerMinute;
        if (selected && next >= selected.routeKm) {
          setPlaying(false);
          setV((s) => ({ ...s, speedKmh: 0 }));
          return selected.routeKm;
        }
        return Math.min(next, plan.routeKm);
      });
      setV((s) => ({ ...s, tripMinutes: s.tripMinutes + 1, speedKmh: 80, batteryPct: Math.max(s.batteryPct - DEMO_ROUTE.kmPerMinute * pctPerKm(s), 0) }));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, plan.routeKm, selected]);

  /** 주행/정차 토글. 속도는 여기서 바로 바꾼다 — effect 로 따라가면 렌더가 한 번 더 돈다 */
  const togglePlaying = () => {
    setPlaying((p) => {
      setV((s) => ({ ...s, speedKmh: p ? 0 : 80 }));
      // 출발하면 자동 전환을 다시 켠다 — 주행 중엔 DO 화면이어야 하므로, 손으로 고른 화면이 남아 있으면 안 된다
      if (!p) setAutoScreen(true);
      return !p;
    });
  };

  // 경유지 도착 판정
  const arrived = !!selected && traveledKm >= selected.routeKm - 0.01;
  /*
   * 자동 화면은 **state 로 밀어 넣지 않고 렌더에서 고른다.** effect 로 setScreen 하면
   * 렌더가 두 번 돌고 린트도 막는다. 사용자가 화면 목록을 누르면 autoScreen 이
   * 꺼져 수동값이 이긴다 — 심사 중에 화면이 튀면 안 된다.
   */
  const shownScreen: ScreenId = autoScreen ? (arrived ? 6 : playing ? 5 : screen) : screen;

  const go = (s: ScreenId) => { setAutoScreen(false); setScreen(s); };

  /** 경유지 추가 — 모의 지연 뒤 결과를 토스트로. 꽉 차면 기존 경유지를 지우지 않는다 */
  const addStop = (stop: RestStop) => {
    if (addingId) return;
    setAddingId(stop.id);
    setTimeout(() => {
      const result = mockAddStop(waypoints.length, navAvailable);
      setAddingId(null);
      if (result.kind === "ADDED") {
        setWaypoints((w) => [...w, stop]);
        showToast(`${stop.name} 경유지 추가됨 · onWaypointChanged`, "positive");
      } else if (result.kind === "SLOT_FULL") {
        showToast("경유지 2개가 모두 찼습니다 · 기존 경유지는 그대로 둡니다");
      } else if (result.kind === "UNAVAILABLE") {
        showToast("내비게이션 연결 안 됨 · 기존 경로를 유지합니다", "negative");
      } else {
        showToast("경유지 추가에 실패했습니다", "negative");
      }
    }, NAV_LATENCY_MS);
  };

  /** 도착 화면의 "주행 재개" — 충전 80% · 25분 휴식으로 기록하고 트립을 초기화 */
  const resume = () => {
    setAlert(null);
    if (selected) {
      const after = selected.chargerKw ? Math.max(CHARGE_TARGET_PCT, Math.round(v.batteryPct)) : Math.round(v.batteryPct);
      const minutes = selected.chargerKw ? chargeMinutes(v.batteryPct, after, v.batteryKwh, selected.chargerKw) : 20;
      setLog((l) => [...l, { stopName: selected.name, batteryBefore: Math.round(v.batteryPct), batteryAfter: after, minutes }]);
      setV((s) => ({ ...s, batteryPct: after, tripMinutes: 0 }));
      setWaypoints((w) => w.filter((x) => x.id !== selected.id));
      setTraveledKm(selected.routeKm + 0.1);
      setOrigin({ km: selected.routeKm + 0.1, batteryPct: after });
    }
    setAutoScreen(true); setScreen(1);
  };

  /**
   * **실시간 재판단** — 차량 값(공조·외기·효율·잔량·모드)이 바뀌면 남은 구간을 다시 추정하고,
   * 판정이 바뀌었거나 부족분이 3%p 이상 움직였을 때만 알린다(토스트 · 기록 · 음성).
   * 지금 향하는 경유지에 닿기 어려워지면 그것도 말하지만 **경로는 바꾸지 않는다** — 정차하면 더 가까운 후보를 보여 준다.
   * 실제 앱에서는 Vehicle SDK 구독(registerEvBatteryStateOfCharge · HVAC · getCurrentEvEfficiency)이 이 함수를 부른다.
   */
  const updateVehicle = (next: VehicleSnapshot, opts?: { silent?: boolean }) => {
    const remain = { ...plan, routeKm: remainingKm };
    const before = estimate(remain, v);
    const after = estimate(remain, next);
    setV(next);
    if (opts?.silent) return;
    const r = rejudge(before, after);
    let msg = r?.message ?? null;
    if (selected && selected.chargerKw) {
      const st = reachableState(selected, { plan, traveledKm, needsCharge: true, tripMinutes: next.tripMinutes, feasibility: feasibilityFor(next, after.waitPct, plan.minReservePct) });
      if (st === "UNREACHABLE") {
        setAlert(`${selected.name}까지 여유가 부족할 수 있어요. 정차하면 더 가까운 후보를 보여 드릴게요.`);
        msg = msg ? `${msg} · ${selected.name} 도달 위험` : `${selected.name} 도달 위험`;
      } else setAlert(null);
    }
    if (msg) {
      setRejudgeLog((l) => [{ clock, message: msg! }, ...l].slice(0, 6));
      showToast(msg, r && r.delta > 0 ? "negative" : "neutral");
    }
  };

  /** 진행 거리를 옮긴다 — 배터리는 기준점에서 그만큼 쓴 값으로 */
  const jumpTo = (km: number) => {
    setTraveledKm(km);
    setV((x) => ({ ...x, batteryPct: Math.max(origin.batteryPct - (km - origin.km) * pctPerKm(x), 0), tripMinutes: Math.max(Math.round(((km - origin.km) / 80) * 60), 0) }));
  };

  const reset = () => {
    setAlert(null); setRejudgeLog([]);
    setOrigin({ km: 0, batteryPct: DEFAULT_VEHICLE.batteryPct });
    setPlaying(false); setPlan(DEFAULT_PLAN); setV(DEFAULT_VEHICLE); setTraveledKm(0);
    setWaypoints([]); setNavAvailable(true); setLog([]); setAutoScreen(true); setScreen(1); setAddingId(null);
  };

  /** 사용 목적을 바꾼다 — 시연용 프리셋을 깐다. STAY 는 설계 단계라 여기 오지 않는다 */
  const applyScenario = (m: TripMode) => {
    reset();
    if (m === "WAIT") {
      setPlan(WAIT_PLAN); setV(WAIT_VEHICLE); setOrigin({ km: 0, batteryPct: WAIT_VEHICLE.batteryPct });
    }
  };

  const breakdownOf = (s: RestStop) => {
    const b = breakdown(s, rankInput);
    return [
      { label: "경로 이탈", value: b.detour, weight: WEIGHTS.DETOUR },
      { label: "선호 시설", value: b.amenity, weight: WEIGHTS.AMENITY },
      ...(b.chargerCounted ? [{ label: "충전 속도", value: b.charger, weight: WEIGHTS.CHARGER }] : []),
      { label: "휴식 시점", value: b.timing, weight: WEIGHTS.TIMING },
      { label: "정보 신뢰도", value: b.confidence, weight: WEIGHTS.CONFIDENCE },
    ];
  };

  const clock = `${String(8 + Math.floor(v.tripMinutes / 60)).padStart(2, "0")}:${String(v.tripMinutes % 60).padStart(2, "0")}`;
  // 상태바의 주행가능거리도 같은 보정(pctPerKm)으로 — 두 숫자가 다른 말을 하면 안 된다
  const rangeKm = Math.round(v.batteryPct / pctPerKm(v));

  /**
   * 가이드 투어 단계 — docs/06-demo.md 1절 대본과 같은 순서. 각 단계는 조작판이 하는 일을 대신 누른다.
   * 상태를 직접 바꾸지 않고 같은 핸들러(go · addStop · togglePlaying)를 부른다 — 투어가 거짓 장면을 만들면 안 된다.
   */
  const TOUR: { title: string; say: string; run: () => void }[] = [
    { title: "시스템 셸", say: "바깥은 Pleos 가 그리는 시스템 영역입니다. 우리 앱은 왼쪽 세로 창 하나만 받습니다. 오른쪽은 내비입니다.", run: () => { reset(); setViewOverride("shell"); setOrientation("portrait"); setTheme("dark"); } },
    { title: "01 상태", say: "출발 전입니다. 도착해서 40분 차 안에서 기다리는 것까지 세면 약 47% 가 모자랍니다. 내비는 이걸 안 셉니다.", run: () => go(1) },
    { title: "03 에너지 계획", say: "주행 93% ± 11, 대기 2%, 최소 20%. 범위로만 말하고 가정값은 전부 적습니다. '만약에' 카드가 선택지를 나란히 비교합니다 — 충전 없이면 부족, 김천에서 15분이면 아슬아슬, 80% 까지면 충분. 공식 주행가능거리가 아닙니다.", run: () => go(3) },
    { title: "04 후보", say: "갈 수 있는 곳, 그중 거기서 80% 까지 채우면 끝까지 갈 것으로 추정되는 곳만 남깁니다. 보수적 추정으로 모자랄 수 있으면 '추가 충전 가능성'을 적습니다. 70km 앞 안성은 시설이 좋아도 빠집니다 — 아래 '제외 N곳' 을 펼치면 이유가 하나씩 적혀 있습니다. 금강은 '유아 편의시설 없음'을 그대로 적습니다.", run: () => go(4) },
    { title: "경유지 추가", say: "1위를 경유지로 넘깁니다. NaviHelper 콜백이 와야 추가된 것으로 치고, 옆 내비 창에 마커가 생깁니다. 경로는 우리가 바꾸지 않습니다.", run: () => { go(4); const top = ranked[0]; if (top && waypoints.length === 0) addStop(top.stop); } },
    { title: "05 주행 중", say: "출발하면 한 줄과 음성만 남습니다. DO 정책입니다. 음성 칩의 스피커 버튼을 누르면 문구를 들을 수 있습니다(시연은 브라우저 TTS, 실제는 TextToSpeech SDK). 설정·비교는 정차 후에.", run: () => { if (!playing) togglePlaying(); } },
    { title: "실시간 재판단", say: "달리는 중에 실주행 효율이 추정보다 15% 나쁘게 나옵니다(맞바람·고속 — 실제 앱은 getCurrentEvEfficiency). 엔진이 남은 구간을 다시 계산해 변화를 알리고, 지금 향하는 김천까지 여유가 부족할 수 있다고 음성으로 말합니다. 경로는 바꾸지 않습니다.", run: () => updateVehicle({ ...v, efficiencyKwhPer100km: 18.4 }) },
    { title: "06 도착·재계산", say: "경유지에 도착했습니다. 80% 까지 걸리는 시간이 곧 쉼표입니다 — 충전기 출력과 잔량으로 셉니다. 충전 뒤 남은 구간은 다시 셉니다.", run: () => { setPlaying(false); setAlert(null); setV((x) => ({ ...x, speedKmh: 0, efficiencyKwhPer100km: null })); if (selected) jumpTo(selected.routeKm); setAutoScreen(true); } },
    { title: "충전 뒤 · 가로 · 라이트", say: "80% 까지 충전하고 재출발했습니다. 남은 150km 는 충분합니다. 창이 가로로 넓어지면 보조 정보가 열리고, 라이트 테마도 공식 토큰 그대로입니다.", run: () => { if (arrived) resume(); go(1); setOrientation("landscape"); setTheme("light"); } },
    { title: "픽업·마중 — 같은 엔진, 다른 순간", say: "공항 마중: 52km 가서 60분 기다렸다 돌아옵니다. 귀가 시 잔량 약 28%, 공조 켜고 최대 약 3시간까지 기다려도 됩니다 — '충전하지 않아도 된다' 는 결정이 곧 결과입니다. 조작판의 '겨울 −7°' 를 누르면 그 시간이 줄어듭니다.", run: () => { applyScenario("WAIT"); setOrientation("portrait"); setTheme("dark"); } },
    { title: "예외 처리", say: "출발 상태로 되돌리고 내비 연결을 끊었습니다. 후보의 '경유지로 추가'를 눌러 보세요 — 실패를 알리고 기존 경로는 그대로 둡니다. 슬롯 2개가 차도 기존 경유지를 지우지 않습니다.", run: () => { reset(); setOrientation("portrait"); setTheme("dark"); setNavAvailable(false); go(4); } },
  ];
  const runTour = (i: number) => { setTourIdx(i); TOUR[i].run(); };
  const endTour = () => { setTourIdx(null); setNavAvailable(true); };

  const fullscreen = () => {
    const el = stage.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  return (
    <div className="space-y-4">
      {/* 보기 조작 — 실제 차량에서는 시스템이 정하는 것들 */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <span className="bg-warn/15 text-warn rounded-md px-2 py-1 text-xs font-semibold">모의 연동 (Mock) · 실제 Pleos SDK 아님 · 장소·수치는 시연용 가상 데이터</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {tourIdx === null && <button type="button" onClick={() => runTour(0)} className="bg-accent hover:bg-accent-strong flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-white"><Compass className="size-3.5" /> 가이드 투어</button>}
          <Seg options={[{ v: "portrait", label: "세로 · 창 2개", icon: RectangleVertical }, { v: "landscape", label: "가로 · 확장", icon: RectangleHorizontal }]} value={orientation} onChange={setOrientation} />
          <Seg options={[{ v: "dark", label: "다크", icon: Moon }, { v: "light", label: "라이트", icon: Sun }]} value={theme} onChange={setTheme} />
          <Seg options={[{ v: "shell", label: "셸 전체" }, { v: "window", label: "앱 창만" }]} value={viewMode} onChange={setViewOverride} />
          {viewMode === "window" && (
            <Seg options={(Object.keys(WINDOW_PRESETS) as WindowPreset[]).map((k) => ({ v: k, label: WINDOW_PRESETS[k].label }))} value={windowPreset}
              onChange={(k) => { setWindowPreset(k); setOrientation(WINDOW_PRESETS[k].orientation); }} />
          )}
          <button type="button" onClick={fullscreen} className="bg-surface-2 hover:bg-line flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold"><Maximize2 className="size-3.5" /> 전체화면</button>
        </div>
      </div>

      {tourIdx !== null && (
        <div className="no-print border-accent/40 bg-accent/10 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
          <span className="bg-accent shrink-0 rounded-md px-2 py-0.5 text-xs font-bold text-white">{tourIdx + 1} / {TOUR.length}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{TOUR[tourIdx].title}</p>
            <p className="text-muted text-xs leading-relaxed">{TOUR[tourIdx].say}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" disabled={tourIdx === 0} onClick={() => runTour(tourIdx - 1)} className="bg-surface-2 hover:bg-line flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold disabled:opacity-40"><ChevronLeft className="size-3.5" /> 이전</button>
            {tourIdx < TOUR.length - 1
              ? <button type="button" onClick={() => runTour(tourIdx + 1)} className="bg-accent hover:bg-accent-strong flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-white">다음 <ChevronRight className="size-3.5" /></button>
              : <button type="button" onClick={endTour} className="bg-accent hover:bg-accent-strong flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-white">끝내기</button>}
            <button type="button" onClick={endTour} aria-label="투어 닫기" className="text-muted hover:text-text flex size-8 items-center justify-center rounded-lg"><X className="size-4" /></button>
          </div>
        </div>
      )}

      <div ref={stage} className="shell-stage">
        <PleosShell
          orientation={orientation} theme={theme} viewMode={viewMode} windowPreset={viewMode === "window" ? windowPreset : undefined}
          speedKmh={Math.round(v.speedKmh)} gear={playing ? "D" : "P"} batteryPct={Math.round(v.batteryPct)} rangeKm={rangeKm} outsideTempC={v.outsideTempC} clock={clock}
          neighbor={<NavMock traveledKm={traveledKm} routeKm={plan.routeKm} waypoints={waypoints.map((w) => ({ name: w.name, routeKm: w.routeKm }))} destination={plan.destinationName} speedKmh={v.speedKmh} clock={clock} />}
        >
          {shownScreen === 1 && <StatusScreen plan={plan} v={v} energy={energy} phase={phase} orientation={orientation} onGo={go} lastRejudge={rejudgeLog[0]?.message} />}
          {shownScreen === 2 && <TripScreen plan={plan} onChange={setPlan} orientation={orientation} energy={energy} onMode={applyScenario} />}
          {shownScreen === 3 && <EnergyScreen v={v} energy={energy} orientation={orientation} onGo={go} sensitivity={sensitivity} whatIf={whatIf} />}
          {shownScreen === 4 && <CandidatesScreen ranked={ranked} needsCharge={energy.needsCharge} chargeMinutesOf={chargeMinutesOf} excluded={excludedStops} emptyText={isWait ? "가까운 왕복 이동입니다 — 경로상 휴게소 대신, 모자라면 출발 전 충전을 권합니다" : undefined} onAddStop={addStop} addingId={addingId} waypoints={waypoints.length} slots={WAYPOINT_SLOTS} orientation={orientation} breakdownOf={breakdownOf} selectedId={waypoints.some((w) => ranked.some((r) => r.stop.id === w.id)) ? waypoints.find((w) => ranked.some((r) => r.stop.id === w.id))!.id : null} />}
          {shownScreen === 5 && <DrivingScreen nextStop={selected} kmToNext={kmToSelected} arrivalPct={energy.arrivalPct} voice={voice} arrivalLabel={(plan.returnKm ?? 0) > 0 ? "귀가 시 예상 잔량" : "도착 예상 잔량"} />}
          {shownScreen === 6 && <ArrivedScreen log={log} remainingKm={Math.round(remainingKm)} energy={energyAfterStop} orientation={orientation} onResume={resume} current={selected} chargeMin={selected && selected.chargerKw ? chargeMinutes(v.batteryPct, CHARGE_TARGET_PCT, v.batteryKwh, selected.chargerKw) : null} />}
          <Toast toast={toast} />
        </PleosShell>
      </div>

      <div className="no-print text-muted flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>{viewMode === "window" ? `앱 창 ${WINDOW_PRESETS[windowPreset].w}×${WINDOW_PRESETS[windowPreset].h}dp · 공식 폼 팩터 프리셋(FormFactorConsole)과 같은 값` : `Connect-S 17인치 · 2560×1440 의 비율 그대로 · 앱 창 ${orientation === "portrait" ? "840×1184 (세로, 기본)" : "1700×1184 (가로, 확장)"}`}</span>
        <span>화면 {String(shownScreen).padStart(2, "0")} {SCREENS[shownScreen - 1].title} · {autoScreen ? "자동 전환" : "수동"}</span>
      </div>

      <nav aria-label="화면 목록" className="no-print grid grid-cols-3 gap-2 lg:grid-cols-6">
        {SCREENS.map((s) => (
          <button key={s.id} type="button" onClick={() => go(s.id)} aria-current={shownScreen === s.id ? "page" : undefined}
            className={cn("rounded-xl border px-3 py-2 text-left transition-colors", shownScreen === s.id ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-muted")}>
            <p className="text-muted text-xs">{String(s.id).padStart(2, "0")}</p>
            <p className="text-sm font-semibold leading-tight">{s.title}</p>
            <p className="text-muted mt-1 hidden text-xs leading-snug xl:block">{s.hint}</p>
          </button>
        ))}
      </nav>

      <div className="no-print grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel title="주행 시뮬레이터">
          <div className="flex items-end justify-between">
            <div><p className="text-muted text-xs">진행 · 주행 시간</p><p className="text-2xl font-bold tabular-nums">{Math.round(traveledKm)}<span className="text-sm">km</span> <span className="text-muted text-sm">/ {v.tripMinutes}분</span></p></div>
            <div className="text-right"><p className="text-muted text-xs">휴식 단계</p><p className={cn("text-sm font-semibold", phase === "SUGGEST" ? "text-warn" : "")}>{PHASE_LABEL[phase]}</p></div>
          </div>
          <input type="range" min={0} max={plan.routeKm} value={traveledKm} onChange={(e) => jumpTo(Number(e.target.value))} className="accent-accent w-full" aria-label="진행 거리" />
          <div className="grid grid-cols-2 gap-2">
            <Btn tone="accent" onClick={togglePlaying}>{playing ? <><Pause className="size-4" /> 정차</> : <><Play className="size-4" /> 주행</>}</Btn>
            <Btn onClick={reset}><RotateCcw className="size-4" /> 초기화</Btn>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Btn tone={plan.mode !== "WAIT" ? "accent" : "default"} onClick={() => applyScenario("JOURNEY")}>장거리 여행 (서울→부산)</Btn>
            <Btn tone={plan.mode === "WAIT" ? "accent" : "default"} onClick={() => applyScenario("WAIT")}>공항 마중 (왕복+대기)</Btn>
          </div>
          <label className="flex items-center justify-between text-sm"><span>자동 화면 전환</span><input type="checkbox" checked={autoScreen} onChange={(e) => setAutoScreen(e.target.checked)} className="accent-accent size-4" /></label>
        </Panel>

        <Panel title="차량 · Vehicle SDK 값 (모의)">
          <Row label={`배터리 ${Math.round(v.batteryPct)}%`}><input type="range" min={5} max={100} value={Math.round(v.batteryPct)} onChange={(e) => { const b = Number(e.target.value); updateVehicle({ ...v, batteryPct: b }); setOrigin({ km: traveledKm, batteryPct: b }); }} className="accent-accent w-full" aria-label="배터리" /></Row>
          <Row label={`외기온 ${v.outsideTempC}°C`}><input type="range" min={-10} max={38} value={v.outsideTempC} onChange={(e) => updateVehicle({ ...v, outsideTempC: Number(e.target.value) })} className="accent-accent w-full" aria-label="외기온" /></Row>
          {/* 계절 프리셋 — 환경부 저온 인증(−7°C 히터 최대)이 왜 −21% 인지 한 번에 보여 준다 */}
          <div className="grid grid-cols-3 gap-2">
            <Btn onClick={() => updateVehicle({ ...v, outsideTempC: 18, hvacOn: false })}>봄 18° · 공조 OFF</Btn>
            <Btn onClick={() => updateVehicle({ ...v, outsideTempC: -7, hvacOn: true })}>겨울 −7° · 히터</Btn>
            <Btn onClick={() => updateVehicle({ ...v, outsideTempC: 32, hvacOn: true })}>여름 32° · 에어컨</Btn>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["ECO", "NORMAL", "SPORT"] as const).map((m) => <Btn key={m} tone={v.driveMode === m ? "accent" : "default"} onClick={() => updateVehicle({ ...v, driveMode: m })}>{m}</Btn>)}
          </div>
          <label className="flex items-center justify-between text-sm"><span>공조 ON</span><input type="checkbox" checked={v.hvacOn} onChange={(e) => updateVehicle({ ...v, hvacOn: e.target.checked })} className="accent-accent size-4" /></label>
          {/* 실주행 효율 — 실제 앱은 getCurrentEvEfficiency(Vehicle SDK v2.3.2). 추정보다 나쁘면 재판단이 돈다 */}
          <label className="flex items-center justify-between gap-2 text-sm"><span>실주행 효율 반영 · 맞바람·고속<span className="text-muted block text-xs">18.4 kWh/100km (기본 추정 16 대비 +15%)</span></span><input type="checkbox" checked={v.efficiencyKwhPer100km != null} onChange={(e) => updateVehicle({ ...v, efficiencyKwhPer100km: e.target.checked ? 18.4 : null })} className="accent-accent size-4 shrink-0" /></label>
        </Panel>

        <Panel title="내비게이션 · NaviHelper (모의)">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">{navAvailable ? <Wifi className="text-good size-4" /> : <Unplug className="text-bad size-4" />}{navAvailable ? "연결됨" : "연결 끊김"}</span>
            <span className="text-muted">경유지 {waypoints.length}/{WAYPOINT_SLOTS}</span>
          </div>
          <ul className="text-muted space-y-1 text-xs">
            {waypoints.length === 0 ? <li>경유지 없음 — 후보 화면에서 추가하면 옆 내비 창에 마커가 생긴다</li> : waypoints.map((w) => <li key={w.id} className="flex justify-between"><span className="text-text">{w.name}</span><span>{w.routeKm}km 지점</span></li>)}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <Btn onClick={() => setNavAvailable((x) => !x)}>{navAvailable ? "연결 끊기" : "다시 연결"}</Btn>
            <Btn onClick={() => setWaypoints([])}>슬롯 비우기</Btn>
          </div>
          <p className="text-muted text-xs leading-relaxed">슬롯 2개는 공식 문서로 확인된 값. 꽉 차면 기존 경유지를 지우지 않고 알린다.</p>
        </Panel>

        <div className="order-last md:col-span-2 xl:col-span-4">
          <Panel title="실시간 재판단 기록 — 차량 값이 바뀌면 남은 구간을 다시 계산">
            {rejudgeLog.length === 0
              ? <p className="text-muted text-xs leading-relaxed">아직 없음 — 위 조작판에서 외기온·공조·주행 모드·배터리를 바꾸거나 &ldquo;실주행 효율 반영&rdquo; 을 켜 보세요. 판정이 바뀌었거나 부족분이 3%p 이상 움직일 때만 기록합니다.</p>
              : <ul className="space-y-1 text-xs">{rejudgeLog.map((r, i) => <li key={i} className="flex gap-3"><span className="text-muted tabular-nums">{r.clock}</span><span className={i === 0 ? "text-text" : "text-muted"}>{r.message}</span></li>)}</ul>}
          </Panel>
        </div>

        <Panel title="이 조작판은 앱이 아니다">
          <p className="text-muted text-xs leading-relaxed">
            실제 차에서는 배터리·외기온·속도는 Vehicle SDK 가, 경로·경유지 결과는 NaviHelper 가 넣어 준다.
            시연에서는 그 자리를 사람이 채운다. 위 셸 안의 것만이 우리가 만드는 앱이다.
          </p>
          <ul className="text-muted space-y-1 text-xs">
            <li>· 셸(상태바·드라이빙뷰·GNB·옆 창 내비) — 차량 OS 영역, 우리 코드 아님</li>
            <li>· 앱 창 — Kotlin 으로 옮겨질 부분 (`core/` 와 거울)</li>
            <li>· 글자·여백은 2560×1440 기준 공식 px 를 창 폭에 비례해 그린다</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange }: { options: { v: T; label: string; icon?: React.ComponentType<{ className?: string }> }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="bg-surface border-line flex h-8 items-center rounded-lg border p-0.5" role="group">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)} aria-pressed={value === o.v}
          className={cn("flex h-full items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors", value === o.v ? "bg-surface-2 text-text" : "text-muted hover:text-text")}>
          {o.icon && <o.icon className="size-3.5" />}{o.label}
        </button>
      ))}
    </div>
  );
}
export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="bg-surface border-line space-y-3 rounded-2xl border p-4"><h2 className="text-sm font-semibold">{title}</h2>{children}</section>;
}
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="text-muted mb-1 text-xs">{label}</p>{children}</div>;
}
export function Btn({ children, onClick, tone = "default" }: { children: React.ReactNode; onClick: () => void; tone?: "default" | "accent" }) {
  return <button type="button" onClick={onClick} className={cn("flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors", tone === "accent" ? "bg-accent hover:bg-accent-strong text-white" : "bg-surface-2 hover:bg-line")}>{children}</button>;
}
