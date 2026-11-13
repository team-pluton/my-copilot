"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeCharger, type ChargerRecord } from "@/lib/assistant/charger";
import { MOCK_STOPS, mockChargerRows } from "@/lib/assistant/corridor";
import { canPickStop, decide, decisionSurface, replanNotice, type Candidate, type DecisionInput } from "@/lib/assistant/integrated-decision";
import { normalizeVehicle } from "@/lib/assistant/journey-fact";
import { IDLE_WAYPOINT, reduceWaypoint, type WaypointEvent, type WaypointState } from "@/lib/assistant/waypoint-handoff";
import { DecisionCard } from "./decision-card";
import { ChevronLeft, ChevronRight, Moon, Pause, Play, RectangleHorizontal, RectangleVertical, Sun, X } from "lucide-react";
import { energyView } from "@/lib/assistant/energy-view";
import { energyOptions, maxWaitWithoutCharge, planViaStop, waitLimitLine } from "@/lib/assistant/options";
import { driveLine } from "@/lib/assistant/drive";
import { PREPARE_ITEM_LABEL, prepareStatus, type PrepareItemKey } from "@/lib/assistant/prepare";
import { energyFor, statusOf, WAIT_MODE_LABEL, type WaitMode } from "@/lib/assistant/wait";
import { availability, ENERGY_BASIS_LABEL, energyBasisOf, freshnessOf, LINK_KINDS, LINK_LABEL, missingLine, POWERTRAIN_LABEL, POWERTRAINS, readiness, SIGNAL_LINK, sourceLine, STATUS_LABEL, usable, type Freshness, type LinkKind, type Powertrain, type SignalKind, type SignalStatus } from "@/lib/assistant/freshness";
import { changedInputs, decideNotification, INITIAL_NOTIFICATION, notificationMessage, rejudgeCause, rejudgeNote, shouldResurface, type NotificationState, type Rejudge, type RejudgeCause, type RejudgeInputs } from "@/lib/assistant/notify";
import { idleAction, reduceAction, type ActionEvent, type ActionState } from "@/lib/assistant/actions";
import { checkAction, type ActionType, type GateContext } from "@/lib/assistant/gate";
import { INITIAL_JOURNEY, isLastLeg, isRestricted, motionOf, nextJourney, restoreJourney, withLegs, type Gear, type JourneyEvent, type JourneySignals, type JourneyState } from "@/lib/assistant/journey";
import { legRemainingKm, legsOf, remainingPlan, RETURN_DESTINATION } from "@/lib/assistant/trip";
import {
  activityOf, migrateVault, newMemory, recordActivity, remember, rememberDriver, rememberMode, lastTripFor, setHistory as setVaultHistory, startTrip, wipeProfile,
  type ActivityKind, type JourneyMemory, type ProfileVault,
} from "@/lib/assistant/memory";
import { CABIN_LABEL, planCabin, settleCabin, withMemory, type CabinKey, type CabinNow, type CabinOutcome, type CabinSettled, type CabinSupport, type Lighting } from "@/lib/assistant/cabin";
import { combinedPrefs, DEMO_DRIVER_IDS, seatMemoLine, situationLabel, type DriverId, soloKey } from "@/lib/assistant/situation";
import { accept as acceptLearning, candidates as learnCandidates, decline as declineLearning, observe, storeCandidate, type LearnCandidate, type ObservationSource } from "@/lib/assistant/learning";
import { newTrip, plan as planSuggestions, reactivate, recordAccepted, recordDismissed, recordKept, type Suggestion, type SuggestionHistory } from "@/lib/assistant/planner";
import { missionHeadline, missionOf, missionReturnLine, restorable, WAIT_SOURCE_LABEL, type MissionSnapshot, type WaitSource } from "@/lib/assistant/mission";
import { IDLE_HANDOFF, reduceHandoff, shouldSend, type HandoffEvent, type HandoffState, type NaviPlace } from "@/lib/assistant/route-handoff";
import { CONTEXT_LABEL, CONTEXT_OF, PROFILE_MODES, PROFILE_PRESETS, TRIP_PRESETS, finishNote, climateGapOfTarget, defaultWaitModeOf, migrateProfiles, planFor, type ProfileMode, type UserProfile } from "@/lib/assistant/profile";
import { chargeMinutes, pctPerKm, verdictOf } from "@/lib/core/energy";
import { FEASIBILITY_DEFAULTS, WEIGHTS, breakdown, excluded, feasibilityFor, rank } from "@/lib/core/engine";
import { DEMO_ROUTE, DEMO_STOPS, WAYPOINT_SLOTS, mockAddStop } from "@/lib/core/mock";
import type { RestStop, TripPlan, VehicleSnapshot } from "@/lib/core/model";
import { phaseOf } from "@/lib/core/scheduler";
import { cn } from "@/lib/utils";
import { Toast, u, useToast } from "../demo/car-ui";
import type { Orientation, ShellTheme } from "../demo/pleos-shell";
import { CopilotNav } from "./copilot-nav";
import { CopilotShell } from "./copilot-shell";
import { CandidatesScreen } from "../demo/screens";
import { Btn, Panel, Row, Seg } from "../demo/simulator";
import {
  COPILOT_SCREENS, CopilotDrivingScreen, CopilotEnergyScreen, DetailScreen, DetailSide, FinishScreen, HistoryScreen, HomeScreen, PHASE_LABEL, PrepareScreen, ProfileScreen,
  type CopilotScreenId, type DoorView, type HomePrepare, type SourceRow,
} from "./copilot-screens";

/**
 * MY CO-PILOT 시연 — 쉼표 DRIVE 시연(/demo)과 **나란히 비교하려고** 따로 둔 실험 화면 (오너 지시 2026-10-26).
 * 출품작이 아니다. 쉼표 DRIVE 의 에너지·추천 엔진과 화면(에너지·후보·주행 중)을 그대로 불러 쓰고,
 * 그 위에 여정 단계(journey) · Safety Gate(gate) · 제안 하나(planner) · 프로필(profile)을 얹었다.
 *
 * ⚠️ 차량 값·제어 결과는 전부 모의(Mock)다. 공조 "적용 성공"도 모의 값이다 (CLAUDE.md 정책 4).
 * 시연 시계(simMin)는 브라우저 시계와 따로 간다 — 시나리오를 몇 번 돌려도 같은 장면이 나와야 해서다.
 */
const TICK_MS = 400;
const LATENCY_MS = 700;
const CHARGE_TARGET_PCT = FEASIBILITY_DEFAULTS.chargeTargetPct;
// v2: 이동 기록·거절 학습을 프로필별로 나눴다(ProfileVault). v1 의 섞인 기록은 읽지 않는다 — 누구 것인지 알 수 없다
// v3: "프로필 없이 시작"(GUEST) 칸이 생겼다 — v2 저장소에는 그 칸이 없어 새로 시작한다
// v4: 탑승 조합(동승자 칸) · 실내 취향 · 마지막 선택 — v3 저장소는 **버리지 않고** 옮긴다(migrateProfiles · migrateVault, 오너 지시 2026-10-28 2절)
// v5: 픽업 프로필 칸 + 진행 중 Mission 스냅샷(재시작 복원, 지시서 4절 6) — v4 저장소도 그대로 옮긴다(없는 칸은 프리셋)
const STORE_KEY = "copilot.v5";
const LEGACY_KEYS = ["copilot.v4", "copilot.v3"];
const MISSION_KEY = "copilot.v5.mission";

/** 공조 요청 번호 — 늘어나기만 하면 된다. 지난 요청의 늦은 콜백을 가려내는 데 쓴다(actions.ts) */
let requestSeq = 0;
const nextRequestId = () => ++requestSeq;

type Tri = "YES" | "NO" | "UNKNOWN";
const triValue = (t: Tri) => (t === "YES" ? true : t === "NO" ? false : null);
type UxMode = "AUTO" | "RESTRICTED" | "UNRESTRICTED" | "UNKNOWN";
/** 모의 차량의 공조 응답 — 성공 · 거절 · 응답 없음(적용 안 됨) · 늦게 적용(타임아웃 뒤 콜백) · 값 불일치 · 응답 없음+재조회 불가 */
type ControlMode = "SUCCESS" | "ERROR" | "TIMEOUT" | "LATE" | "MISMATCH" | "UNREADABLE" | "PARTIAL";

/** 기기에 남기는 것 — 프로필 편집과 프로필별 이동 기록·거절 학습. 위치는 저장하지 않는다 */
type Stored = { profiles: Record<ProfileMode, UserProfile>; vault: ProfileVault };
function load(): Stored | null {
  try {
    const raw = localStorage.getItem(STORE_KEY) ?? LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean) ?? null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return { profiles: migrateProfiles(parsed.profiles), vault: migrateVault(parsed.vault) };
  } catch { return null; }
}
function save(s: Stored) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* 사생활 보호 모드 — 저장 없이 돈다 */ }
}
/** 진행 중 Mission 스냅샷 — 확인된 것만(mission.ts MissionSnapshot). 앱을 다시 열면 이어서 간다. 위치는 저장하지 않는다 */
function loadMission(): MissionSnapshot | null {
  try { const raw = localStorage.getItem(MISSION_KEY); return raw ? (JSON.parse(raw) as MissionSnapshot) : null; } catch { return null; }
}
function saveMission(s: MissionSnapshot | null) {
  try { if (s) localStorage.setItem(MISSION_KEY, JSON.stringify(s)); else localStorage.removeItem(MISSION_KEY); } catch { /* 저장 없이 돈다 */ }
}

const fresh = (mode: ProfileMode) => ({
  plan: planFor(PROFILE_PRESETS[mode]),
  vehicle: TRIP_PRESETS[mode].vehicle,
});

export default function CopilotSimulator() {
  // 이 컴포넌트는 브라우저에서만 그린다(copilot-entry 의 ssr:false) — 그래서 초기값에서 저장소를 바로 읽는다
  const [stored] = useState(load);
  /**
   * 재시작 복원(지시서 4절 6) — 진행 중(출발 준비 이후 · 완료 전)인 Mission 스냅샷이 있으면 **처음 상태를 그것으로** 잡는다.
   * 공용 차량이라 지난번 프로필을 자동으로 고르지는 않지만(아래 chosen), 이미 시작한 이동은 끊기지 않고 이어진다.
   * 진행 중이던 제어 요청·알림 기준은 복원하지 않는다. 여정 단계는 저장값을 그대로 믿지 않고 지금 차 신호(모의: 주차)로 다시 판단한다
   */
  const [initialSnap] = useState<MissionSnapshot | null>(() => { const s = loadMission(); return restorable(s) ? s : null; });
  const restoredSignals = (s: MissionSnapshot): JourneySignals => ({ gear: "PARK", parkingBrake: true, speedKmh: 0, uxRestricted: false, remainingKm: legRemainingKm(s.plan, { leg: s.journey.leg, traveledInLegKm: s.traveledKm, waitedMinutes: s.waitedMin }) });
  const restoreNote = (s: MissionSnapshot) => ({ clock: s.savedAt, kind: "STATE" as const, text: `앱을 다시 열어 이동 #${s.memory.tripId} 를 이어서 — ${s.savedAt} 에 저장한 상태 · 진행 중이던 제어 요청은 복원하지 않음`, tripId: s.memory.tripId });
  const [profiles, setProfiles] = useState<Record<ProfileMode, UserProfile>>(stored?.profiles ?? PROFILE_PRESETS);
  const [vault, setVault] = useState<ProfileVault>(() => { const base = stored?.vault ?? migrateVault(null); return initialSnap ? recordActivity(base, initialSnap.mode, restoreNote(initialSnap)) : base; });
  const [mode, setMode] = useState<ProfileMode>(initialSnap?.mode ?? "FAMILY");
  /** 공용 차량 — 앱을 다시 열면 지난번 프로필을 **자동으로 고르지 않는다.** 사람이 고를 때까지 개인 기록을 보여 주지 않는다(진행 중 Mission 복원은 예외 — 이미 고른 이동이다) */
  const [chosen, setChosen] = useState(initialSnap !== null);
  const profile = profiles[mode];
  /** 운전자(수동) — 공식 운전자 인식 API 없음. null = 미확인 → 운전석 취향은 쓰지 않는다 */
  const [driverId, setDriverIdRaw] = useState<DriverId | null>(initialSnap?.driver ?? null);
  const driver = driverId ? vault.drivers[driverId] ?? null : null;
  const setDriverId = (id: DriverId | null) => { setDriverIdRaw(id); setVault((vt) => rememberDriver(vt, id)); };

  const [plan, setPlan] = useState<TripPlan>(() => initialSnap?.plan ?? fresh("FAMILY").plan);
  const [v, setV] = useState<VehicleSnapshot>(() => (initialSnap ? { ...fresh(initialSnap.mode).vehicle, batteryPct: initialSnap.batteryPct, tripMinutes: initialSnap.tripMinutes, speedKmh: 0 } : fresh("FAMILY").vehicle));
  /** 이번 구간에서 달린 거리 — 왕복이면 귀가 구간에서 0 부터 다시 센다 */
  const [traveledKm, setTraveledKm] = useState(initialSnap?.traveledKm ?? 0);
  /** 중간 목적지에서 기다린 시간(분) — 남은 대기가 그만큼 줄어든다 */
  const [waitedMin, setWaitedMin] = useState(initialSnap?.waitedMin ?? 0);
  const [simMin, setSimMin] = useState(initialSnap?.simMin ?? 0);
  const [playing, setPlaying] = useState(false);
  const [gear, setGear] = useState<Gear>("PARK");
  const [parkingBrake, setParkingBrake] = useState(true);
  const [uxMode, setUxMode] = useState<UxMode>("AUTO");
  /**
   * 차량 데이터 연결 — 끊기면 그 연결의 값을 **모른다**고 넘긴다. 마지막 값을 현재 값처럼 쓰지 않는다(지시서 12 J).
   * 연결은 셋이다(freshness.ts LinkKind): 주행 신호(AAOS) · 배터리(Pleos EvBattery) · 공조·도어(Pleos HVAC·Door).
   * 하나가 돌아왔다고 나머지가 유효한 것이 아니다 — 기능마다 필수 입력(REQUIRED_SIGNALS)만 검사한다(외부 평가 7 A).
   * 끊긴 시각을 남겨 "언제 값인지"를 화면에 적는다.
   */
  const [links, setLinks] = useState<Record<LinkKind, LinkState>>(ALL_LIVE);
  /** 끊길 때 찍어 둔 에너지 입력 — 복구 때 비교해 재판단의 원인을 적는다(여럿이면 하나로 말하지 않는다) */
  const [atLoss, setAtLoss] = useState<RejudgeInputs | null>(null);
  /** 신호 자체의 상태 — 연결과 별개(외부 평가 8 ①). 시연은 전부 정상, 내비 경로는 없음(NONE). 조작판에서 "배터리 조회 실패"를 만들어 본다 */
  const [signalStatus, setSignalStatus] = useState<Record<SignalKind, SignalStatus>>(ALL_OK);
  /** 동력원 — 전체 차량 대상(오너 결정 2026-10-28). 에너지 판단만 EV 에서 되고, 다른 동력원은 그 기능만 끄고 이유를 적는다. 시연 차량은 EV */
  const [powertrain, setPowertrain] = useState<Powertrain>("EV");
  const [journey, setJourney] = useState<JourneyState>(() => (initialSnap ? restoreJourney(initialSnap.journey, restoredSignals(initialSnap)) : INITIAL_JOURNEY));
  /** 대기 유형 — 사용자가 알려 주는 사실. 차를 두고 다녀오면 대기 소비 0 (wait.ts). 기본값은 프로필이 정한다 */
  const [waitMode, setWaitModeRaw] = useState<WaitMode>(initialSnap?.waitMode ?? "IN_CAR");
  // ── Mission(V5, 2026-11-02) — Mission 자체는 상태에서 계산한다(missionOf). 따로 드는 값은 셋 + 시작 시각
  /** 귀가 구간 준비를 사용자가 확인했나(NEXT_LEG 수락) — 구간이 바뀌면 다시 false. 내비 목적지는 바꾸지 않는다 */
  const [nextLegReady, setNextLegReady] = useState(initialSnap?.nextLegReady ?? false);
  /** 대기 시간의 출처 — 저장된 계획 / 직접 확인 / 없음(프로필 없이). 추정하지 않는다 */
  const [waitSource, setWaitSource] = useState<WaitSource>(initialSnap?.waitSource ?? "SAVED");
  /** 귀가 구간을 남긴 채 끝냈나 — Mission 상태 CANCELLED */
  const [endedEarly, setEndedEarly] = useState(initialSnap?.endedEarly ?? false);
  const [missionStartedAt, setMissionStartedAt] = useState<string | null>(initialSnap?.missionStartedAt ?? null);
  /** 원탭 다음 이동 — 웹은 모의 내비뿐(결과 문장에 '(모의)'). 복원하지 않는다(다시 읽기 전 모름) */
  const [handoff, setHandoff] = useState<HandoffState>(IDLE_HANDOFF);
  /** 한 흐름(시작 → 확인 → 보냄 → 다시 읽기) 안에서는 지역 값으로 이어 간다 — 렌더 중 ref 를 읽지 않으려고(React Compiler) */
  const handoffStep = (cur: HandoffState, e: HandoffEvent) => { const next = reduceHandoff(cur, e); setHandoff(next); return next; };
  /** V6 통합 판단(시나리오 V) — 충전기·시설은 전부 시연 데이터. 근거 줄에 그렇게 적힌다. 세션과 분리해 Mission 을 건드리지 않는다 */
  const [v6, setV6] = useState<V6State | null>(null);
  /** 개발자 정보(여정 단계 코드 · 제안 등급 · 신호) — 운전자 화면에는 내지 않는다. 셸 아래에만, 기본 꺼짐 */
  const [dev, setDev] = useState(false);

  // 차량 공조·도어 — Vehicle SDK HVAC·Door 가 줄 값 (모의)
  const [hvacC, setHvacC] = useState(25);
  const [hvacReadable, setHvacReadable] = useState(true);
  const [door, setDoor] = useState<DoorView>({ readable: true, open: false, locked: false });
  /** 시트·조명 — Vehicle SDK Seat·Light 가 줄 값(모의). 조명은 조회 자체가 미확인이라 기본 "모름" */
  const [cabinNow, setCabinNow] = useState<{ seatVent: boolean; seatHeat: boolean; steeringHeat: boolean; lighting: Lighting | null }>({ seatVent: false, seatHeat: false, steeringHeat: false, lighting: null });
  // 차종 지원(checkXXXCapabilities)·권한·제어 결과 — 시연에서 바꿔 본다
  const [capHvac, setCapHvac] = useState<Tri>("YES");
  const [permClimate, setPermClimate] = useState<Tri>("YES");
  /** 시트 제어 권한(CONTROL_CAR_SEATS) — 서드파티 허용 여부는 공조와 같이 미확인(설명회 질문 10). 시연 기본값 YES */
  const [permSeat, setPermSeat] = useState<Tri>("YES");
  /**
   * 일괄 적용(SMART CABIN PREPARE) — 승인 하나로 보내고 항목마다 결과를 따로 받는다. 결과가 오기 전에는 '적용 완료'라 하지 않는다.
   * KEPT = 사용자가 "지금 그대로" — 이번 이동에서는 다시 묻지 않는다
   */
  const [cabinBatch, setCabinBatch] = useState<{ phase: "IDLE" | "PENDING" | "DONE" | "KEPT"; settled: CabinSettled | null; message: string | null }>({ phase: "IDLE", settled: null, message: null });
  const [permNavi, setPermNavi] = useState<Tri>("YES");
  const [naviConnected, setNaviConnected] = useState(true);
  const [controlMode, setControlMode] = useState<ControlMode>("SUCCESS");
  /** 공조 요청 상태 — actions.ts 리듀서. 요청마다 번호를 붙여 늦은 콜백이 다른 요청을 덮지 않게 */
  const [action, setAction] = useState<ActionState>(() => idleAction("MOCK"));
  const dispatch = (e: ActionEvent) => setAction((s) => reduceAction(s, e));

  const [waypoints, setWaypoints] = useState<RestStop[]>(() => (initialSnap ? DEMO_STOPS.filter((s) => initialSnap.waypointIds.includes(s.id)) : []));
  const [chargedAt, setChargedAt] = useState<string[]>(initialSnap?.chargedAt ?? []);
  const [addingId, setAddingId] = useState<string | null>(null);
  /** 거절 학습은 프로필마다 — 가족 프로필에서의 거절이 업무 프로필 제안을 막지 않게 */
  const history = vault.history[mode];
  const setHistory = (f: SuggestionHistory | ((h: SuggestionHistory) => SuggestionHistory)) =>
    setVault((vt) => setVaultHistory(vt, mode, typeof f === "function" ? f(vt.history[mode]) : f));
  /** 이번 이동의 기억 — 새 이동이면 비운다(지난 확인 결과를 자동으로 가져오지 않는다) */
  const [memory, setMemory] = useState<JourneyMemory>(() => initialSnap?.memory ?? newMemory(0, "FAMILY"));
  /** 재판단 알림 기준 — 마지막으로 알린 판단과 비교한다(누적 변화). 화면 숫자는 늘 최신 계산 */
  const [notif, setNotif] = useState<NotificationState>(INITIAL_NOTIFICATION);
  /** 마지막 재판단(전 → 후 → 원인) — 토스트가 지나간 뒤에도 에너지 화면에 남긴다(DEMO-60S 대표 장면). 새 이동이면 비운다 */
  const [rejudge, setRejudge] = useState<Rejudge | null>(null);

  const [screen, setScreen] = useState<CopilotScreenId>("home");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [theme, setTheme] = useState<ShellTheme>("dark");
  const { toast, show: showToast } = useToast();
  const [tour, setTour] = useState<{ id: ScenarioId; idx: number } | null>(null);

  const clock = `${String(8 + Math.floor(simMin / 60)).padStart(2, "0")}:${String(simMin % 60).padStart(2, "0")}`;
  // 프로필 없이 시작(GUEST)은 기록을 남기지 않는다 — 누구의 이동인지 모르는 기록이다
  const log = (kind: ActivityKind, text: string, tripId = memory.tripId, who: ProfileMode = mode) => { if (who !== "GUEST") setVault((vt) => recordActivity(vt, who, { clock, kind, text, tripId })); };

  useEffect(() => { save({ profiles, vault }); }, [profiles, vault]);

  // ── 신호 → 여정 단계 ─────────────────────────────
  const legPos = { leg: journey.leg, traveledInLegKm: traveledKm, waitedMinutes: waitedMin };
  /** 이번 구간의 전체 거리 — 가는 길 또는 돌아오는 길 */
  const legTotalKm = journey.leg === 0 ? plan.routeKm : plan.returnKm ?? 0;
  const legDestination = journey.leg === 0 ? plan.destinationName : RETURN_DESTINATION;
  const remainingKm = legRemainingKm(plan, legPos);
  // AUTO: P 가 아니면 제한으로 본다 — 실제 기준은 차종·DO 선언마다 다르다(설명회 질문 1). 시연은 보수적인 쪽
  const uxRestricted = uxMode === "AUTO" ? gear !== "PARK" : uxMode === "RESTRICTED" ? true : uxMode === "UNRESTRICTED" ? false : null;
  const signals: JourneySignals = links.DRIVE.live
    ? { gear, parkingBrake, speedKmh: v.speedKmh, uxRestricted, remainingKm }
    : { gear: "UNKNOWN", parkingBrake: null, speedKmh: null, uxRestricted: null, remainingKm };
  /** 신호별 신선도 — 어느 연결로 오는 값인지에 따라 (freshness.ts). 조회 불가(공조·도어)는 연결과 무관하게 모름 */
  const lostMinOf = (l: LinkState) => (l.lostAt === null ? null : Number(l.lostAt.slice(0, 2)) * 60 + Number(l.lostAt.slice(3)) - 8 * 60);
  const freshOf = (kind: SignalKind, readable = true): Freshness => {
    if (kind === "PROFILE") return "FRESH";
    if (!readable) return "UNKNOWN";
    const lk = SIGNAL_LINK[kind];
    // 내비 경로는 차량 연결과 다른 길(NaviHelper) — 시연에는 없어 상태(NONE)만으로 정한다
    if (lk === null) return freshnessOf(kind, simMin, simMin, true, signalStatus[kind]);
    const l = links[lk];
    return freshnessOf(kind, l.live ? simMin : lostMinOf(l), simMin, l.live, signalStatus[kind]);
  };
  const freshMap: Record<SignalKind, Freshness> = {
    GEAR: freshOf("GEAR"), UX: freshOf("UX"), SPEED: freshOf("SPEED"), SOC: freshOf("SOC"), HVAC: freshOf("HVAC", hvacReadable), DOOR: freshOf("DOOR", door.readable), ROUTE: freshOf("ROUTE"), PROFILE: "FRESH",
  };
  /** 에너지 판단의 필수 입력(배터리)이 신선한가 — 아니면 판단 보류. 주행 신호가 끊겨도 배터리가 살아 있으면 판단한다(그 반대도) */
  const energyReady = readiness("ENERGY", freshMap);
  /** 근거 등급 — 시연은 늘 "입력 계획 기반"(내비 경로 없음). 경로가 없으면 판단하지 않는다 */
  const energyBasis = energyBasisOf(freshMap, remainingPlan(plan, { leg: journey.leg, traveledInLegKm: 0, waitedMinutes: 0 }).routeKm > 0);
  /** 이 차량에서 에너지 판단이 되는가 — 동력원(EV 만) → 지원 → 권한. 안 되면 에너지만 끄고 공통 기능은 그대로 */
  const energyAvail = availability("ENERGY", { powertrain });
  const energyUsable = energyAvail.ok && links.ENERGY.live && energyReady.ok && energyBasis !== "NO_ROUTE";
  // 여기서 바로 문장으로 — 뒤에서 객체를 넘기면 React Compiler 가 "나중에 바뀔 수 있는 값"으로 보고 메모를 포기한다
  const energyMissing = energyAvail.line ?? (energyBasis === "NO_ROUTE" ? ENERGY_BASIS_LABEL.NO_ROUTE : missingLine(energyReady));
  const energyBasisLabel = ENERGY_BASIS_LABEL[energyBasis];
  const cabinLive = links.CABIN.live;
  /** 앱이 지금 믿을 수 있는 배터리 값 — 배터리 연결이 끊기면 null */
  const liveSoc = energyUsable ? v.batteryPct : null;
  const motion = motionOf(signals);
  const restricted = isRestricted(signals);

  /*
   * 신호가 바뀔 때마다 여정 단계를 한 번 넘긴다. effect 가 아니라 렌더 중 "이전 값과 다르면" 패턴이다 —
   * 단계는 이전 단계에 기대므로(곧 도착 해제 간격) 계산값으로 둘 수 없고, effect 로 하면 한 박자 늦게 그린다.
   */
  const sigKey = `${signals.gear}|${signals.parkingBrake}|${signals.speedKmh}|${signals.uxRestricted}|${Math.round(remainingKm * 10)}`;
  const [seenSig, setSeenSig] = useState(sigKey);
  if (seenSig !== sigKey) {
    setSeenSig(sigKey);
    const next = nextJourney(journey, signals);
    if (next.phase !== journey.phase || next.atDestination !== journey.atDestination || next.leg !== journey.leg) {
      setJourney(next);
      const legNote = next.leg !== journey.leg ? " · 귀가 구간 시작" : "";
      log("STATE", `${PHASE_LABEL[journey.phase]} → ${PHASE_LABEL[next.phase]}${next.phase === "PARKED" ? (next.atDestination ? " · 목적지" : " · 중간 정차") : ""}${legNote}`);
      if (next.leg !== journey.leg) {
        // 다음 구간 — 거리는 0 부터, 하차 체크는 구간마다 따로(기억에), 최종 도착에서 하차 준비를 다시 묻게. 귀가 준비 확인은 지난 구간의 것
        setTraveledKm(0); setNextLegReady(false);
        setHistory((h) => ({ ...h, CHECKLIST_REMINDER: { dismissStreak: 0, lastShownAt: null, lastDismissedAt: null, doneThisTrip: false } }));
      }
    }
  }
  const packed = memory.packed;
  const setPacked = (f: string[] | ((c: string[]) => string[])) => setMemory((m) => remember(m, { kind: "PACKED", items: typeof f === "function" ? f(m.packed) : f }));
  const checked = memory.finishChecked[journey.leg] ?? [];
  const setChecked = (f: string[] | ((c: string[]) => string[])) => {
    const leg = journey.leg;
    setMemory((m) => remember(m, { kind: "FINISH_CHECKED", leg, items: typeof f === "function" ? f(m.finishChecked[leg] ?? []) : f }));
  };
  const fire = (e: JourneyEvent) => {
    const next = nextJourney(journey, signals, e);
    if (next !== journey) setJourney(next);
    return next;
  };

  // ── 쉼표 DRIVE 엔진 (그대로) ───────────────────────
  // 구간별 남은 계획 — 가는 길이면 귀로·남은 대기까지, 귀가 구간이면 돌아오는 길만 (trip.ts)
  const remainPlan = useMemo(() => remainingPlan(plan, { leg: journey.leg, traveledInLegKm: traveledKm, waitedMinutes: waitedMin }), [plan, journey.leg, traveledKm, waitedMin]);
  const energy = useMemo(() => energyFor(remainPlan, v, waitMode), [remainPlan, v, waitMode]);
  const verdict = verdictOf(energy);
  const rankInput = useMemo(() => ({ plan, traveledKm, needsCharge: energy.needsCharge, tripMinutes: v.tripMinutes, feasibility: feasibilityFor(v, energy.waitPct, plan.minReservePct) }), [plan, traveledKm, energy, v]);
  const isWait = plan.mode === "WAIT";
  const ranked = useMemo(() => (isWait ? [] : rank(DEMO_STOPS, rankInput)), [isWait, rankInput]);
  const excludedStops = useMemo(() => (isWait ? [] : excluded(DEMO_STOPS, rankInput)), [isWait, rankInput]);
  // 판단 뒤 선택지 — 쉼표 DRIVE estimate 를 조건만 바꿔 다시 부른 값(options.ts). 1위 후보는 가는 길에 슬롯이 남았을 때만
  const topStop = !isWait && journey.leg === 0 && waypoints.length < WAYPOINT_SLOTS ? ranked[0]?.stop ?? null : null;
  // 수동 useMemo 를 두지 않는다 — 연결별 신선도에서 파생된 값을 의존성에 넣으면 React Compiler 가 메모를 포기한다(자동 메모에 맡긴다)
  const options = energyUsable ? energyOptions({ plan: remainPlan, v, waitMode, charge: topStop ? { name: topStop.name, kmFromHere: Math.max(topStop.routeKm - traveledKm, 0) } : null }) : [];
  const waitLeft = journey.leg === 0 ? remainPlan.waitMinutesAfterArrival : 0;
  /**
   * 화면이 말하는 에너지 판단 — 무엇을 기준으로 충분한가를 문맥으로 넘긴다(3차 P0-3).
   * 가는 길에 고른 경유지가 있으면 그곳에서 80% 충전한 계획으로 다시 판단한다(선택지와 같은 식). 고른 사실만으로 "충분"이라 하지 않는다.
   */
  const viaStop = journey.leg === 0 ? waypoints.filter((w) => w.routeKm > traveledKm - 0.01).sort((a, b) => a.routeKm - b.routeKm)[0] ?? null : null;
  const shownEnergy = useMemo(() => (viaStop ? planViaStop(remainPlan, v, waitMode, Math.max(viaStop.routeKm - traveledKm, 0)).energy : energy), [viaStop, remainPlan, v, waitMode, traveledKm, energy]);
  const ev = energyView(energyUsable ? shownEnergy : null, liveSoc, v.batteryKwh, { roundTrip: journey.leg === 0 && (plan.returnKm ?? 0) > 0, viaWaypoint: viaStop !== null, minReservePct: plan.minReservePct });
  const waitLimit = energyUsable && waitLeft > 0 ? waitLimitLine(maxWaitWithoutCharge(remainPlan, v, waitMode), waitLeft) : null;

  // 경유지는 가는 길 위의 것이다 — 귀가 구간에는 없다
  const nextWaypoint = journey.leg !== 0 ? null : waypoints.filter((w) => w.routeKm > traveledKm - 0.01).sort((a, b) => a.routeKm - b.routeKm)[0] ?? null;
  const atWaypoint = nextWaypoint && traveledKm >= nextWaypoint.routeKm - 0.01 && motion.kind === "PARKED" ? nextWaypoint : null;

  // 후보 카드의 점수 구성·충전 시간 — /demo 와 같은 계산
  const breakdownOf = (st: RestStop) => {
    const b = breakdown(st, rankInput);
    return [
      { label: "경로 이탈", value: b.detour, weight: WEIGHTS.DETOUR },
      { label: "선호 시설", value: b.amenity, weight: WEIGHTS.AMENITY },
      ...(b.chargerCounted ? [{ label: "충전 속도", value: b.charger, weight: WEIGHTS.CHARGER }] : []),
      { label: "휴식 시점", value: b.timing, weight: WEIGHTS.TIMING },
      { label: "정보 신뢰도", value: b.confidence, weight: WEIGHTS.CONFIDENCE },
    ];
  };
  const chargeMinutesOf = (st: RestStop) => st.chargerKw ? chargeMinutes(Math.max(v.batteryPct - (st.routeKm - traveledKm) * pctPerKm(v), 0), CHARGE_TARGET_PCT, v.batteryKwh, st.chargerKw) : null;

  // ── Safety Gate 문맥 · 제안 ────────────────────────
  const inFlight: ActionType[] = [...(action.phase === "PENDING" ? (["SET_CLIMATE"] as const) : []), ...(addingId ? (["ADD_WAYPOINT"] as const) : [])];
  const gateCtx: GateContext = {
    uxRestricted, motion,
    // 경유지 기능 자체는 NaviHelper 가 있는 차면 지원이다. 연결이 끊긴 것은 요청 결과(UNAVAILABLE)로 알린다 — 차종 미지원과 섞지 않는다
    capabilities: { HVAC_TEMPERATURE: triValue(capHvac), NAVI_WAYPOINT: true },
    permissions: { CONTROL_CAR_CLIMATE: triValue(permClimate), NAVI_ROUTE_SEARCH: triValue(permNavi) },
    inFlight,
  };
  const now = simMin * 60_000;
  const climateGate = checkAction("SET_CLIMATE", gateCtx, true);
  const seatGate = checkAction("SET_SEAT", { ...gateCtx, capabilities: { ...gateCtx.capabilities, SEAT_POSITION: true }, permissions: { ...gateCtx.permissions, CONTROL_CAR_SEATS: triValue(permSeat) } }, true);
  /**
   * 실내 비교(Smart Cabin Prepare) — 저장 취향 vs 지금 차량 설정. 같은 건 안 건드리고, 지원·권한·신선도를 항목마다 본다(cabin.ts).
   * 공조·도어 연결이 끊기면 지금 값을 모른다 → 적용 후보가 되지 않는다. 이번 이동에서 이미 결정한 공조는 다시 묻지 않는다(Journey Memory).
   */
  const cabinNowFull: CabinNow = cabinLive
    ? { hvacTempC: hvacReadable ? hvacC : null, hvacOn: v.hvacOn, seatVent: cabinNow.seatVent, seatHeat: cabinNow.seatHeat, steeringHeat: cabinNow.steeringHeat, lighting: cabinNow.lighting }
    : { hvacTempC: null, hvacOn: null, seatVent: null, seatHeat: null, steeringHeat: null, lighting: null };
  const cabinSupport: CabinSupport = {
    HVAC_TEMP: { supported: triValue(capHvac), controllable: triValue(permClimate) }, HVAC_POWER: { supported: triValue(capHvac), controllable: triValue(permClimate) },
    SEAT_VENT: { supported: true, controllable: triValue(permSeat) }, SEAT_HEAT: { supported: true, controllable: triValue(permSeat) },
    STEERING_HEAT: { supported: null, controllable: null }, LIGHTING: { supported: null, controllable: null },
  };
  const contextLabel = CONTEXT_OF[profile.mode] ? CONTEXT_LABEL[CONTEXT_OF[profile.mode]!] : "프로필 없이";
  /** DRIVER × OCCUPANCY × JOURNEY 를 합친 비교 입력 — 운전자 미확인이면 운전석은 유지(situation.ts) */
  const solo = driverId ? vault.soloCabin[soloKey(driverId, mode)] ?? null : null; // 혼자 조합의 운전자별 공조(학습·승인한 것) — 없으면 프리셋
  const prefs = combinedPrefs(profile, driver, solo);
  const cabinPlan = withMemory(planCabin(prefs, cabinNowFull, cabinSupport, restricted, contextLabel), memory);
  const situationLine = situationLabel(profile, driver);
  /**
   * 학습 후보 — 차량 상태 변화의 관찰이 같은 주인(운전자 / 탑승 조합) 아래에서 다른 이동 3번 반복되면 한 번 묻는다.
   * 시뮬레이터의 조작판 슬라이더·토글이 "차에서 누군가 돌린 것을 콜백이 알려 준 상황"을 연기한다 — 출처 MOCK(시연 데이터, 실차 증거로 집계되지 않음).
   * 앱이 스스로 바꾼 값(APP)은 기록하지 않는다. 운전석 항목은 혼자 탈 때만 운전자에게(변경 주체는 SDK 가 알려 주지 않는다 — learning.ts 규칙 6)
   */
  const learnCtx = { driver: driverId, mode };
  const candidate: LearnCandidate | null = chosen && journey.phase === "PREPARING" ? learnCandidates(vault.learning, learnCtx, prefs, contextLabel)[0] ?? null : null;
  const observeCabin = (key: CabinKey, value: number | boolean, source: ObservationSource) => setVault((vt) => ({ ...vt, learning: observe(vt.learning, learnCtx, key, value, memory.tripId, source) }));
  const acceptCandidate = (c: LearnCandidate) => {
    // 저장 자리는 귀속 키와 같은 곳(storeCandidate) — 운전자 prefs / 혼자 조합은 운전자별 soloCabin / 가족·부부는 프로필
    const st = storeCandidate(c, learnCtx, profile, driver, solo);
    if (st.profile !== profile) changeProfile(st.profile);
    setVault((vt) => ({
      ...vt,
      drivers: st.driver && driverId ? { ...vt.drivers, [driverId]: st.driver } : vt.drivers,
      soloCabin: st.solo && driverId ? { ...vt.soloCabin, [soloKey(driverId, mode)]: st.solo } : vt.soloCabin,
      learning: acceptLearning(vt.learning, learnCtx, c.key),
    }));
    log("PREPARE", `취향 저장 · ${c.line.split(" — ")[0]} (${c.owner === "DRIVER" ? driver?.name ?? "운전자" : profile.name})`);
    showToast("취향으로 저장했습니다 · 다음 이동부터 비교에 씁니다", "positive");
  };
  const declineCandidate = (c: LearnCandidate) => { setVault((vt) => ({ ...vt, learning: declineLearning(vt.learning, learnCtx, c.key, c.value) })); log("PREPARE", `취향 후보 거절 · ${CABIN_LABEL[c.key]} — 이 값은 다시 묻지 않음`); };
  /** 차종 미지원 · 권한 없음 — 앱이 바꿀 수 없는 공조. 출발 준비는 "직접 확인", 제안에서는 뺀다(바꾸자고 해 놓고 못 바꾸지 않게) */
  const climateCantChange = !climateGate.allowed && (climateGate.block === "UNSUPPORTED" || climateGate.block === "NO_PERMISSION") ? climateGate.message : null;
  const suggestions = planSuggestions({
    journey, restricted, now,
    // 엔진 문장(energy.message)은 부족분을 "%" 로 쓴다 — MY CO-PILOT 화면·음성은 energyView 의 %p 문장으로 통일한다
    // 연결이 끊기면 에너지·공조 제안을 내지 않는다 — 모르는 값으로 판단하지 않는다
    energy: !energyUsable || verdict === "OK" || waypoints.length > 0 ? null : {
      verdict,
      message: `${isWait ? (journey.leg === 0 ? "대기·귀가까지" : "집까지") : plan.waitMinutesAfterArrival > 0 ? `도착 후 ${plan.waitMinutesAfterArrival}분 대기까지` : `${legDestination}까지`} 세면 ${energyView(energy, v.batteryPct, null).detail}.`,
    },
    breakPhase: phaseOf(plan, v),
    climate: climateCantChange ? null : climateGapOfTarget(prefs.hvacTempC, hvacReadable && cabinLive ? hvacC : null),
    checklistPending: profile.finishChecklist.filter((i) => !checked.includes(i)).length,
    proactive: profile.proactive,
    // 탑승 조합의 안내 빈도 — "최소 안내"면 주의 등급은 추천함으로(위험은 그대로)
    quiet: profile.cabin.guidance === "QUIET",
    // Mission 힌트 — 복귀 목적지가 있고 아직 귀가 구간을 준비하지 않았으면 대기 중에 한 번 묻는다
    mission: { nextLegReady, returnDestination: (plan.returnKm ?? 0) > 0 ? RETURN_DESTINATION : null, waitedMin, plannedWaitMin: plan.waitMinutesAfterArrival },
    history,
    context: {
      profileName: profile.name, batteryPct: liveSoc, waitMinutes: remainPlan.waitMinutesAfterArrival, minReservePct: plan.minReservePct,
      tripMinutes: v.tripMinutes, breakIntervalMinutes: plan.breakIntervalMinutes, remainingKm,
    },
  });

  /**
   * 갈 수 있는 끝 — 다음 경유지 · 목적지 · **배터리가 바닥나는 지점** 중 가장 가까운 곳.
   * 배터리 0% 로 수백 km 를 달리는 장면을 만들면 엔진이 "0.2km 앞인데 충전하라" 같은 말을 한다 — 시뮬레이터가 물리를 어기면 안 된다.
   */
  const limitOf = (fromKm: number, s: VehicleSnapshot, wp: RestStop | null, routeKm: number) => {
    const emptyAt = fromKm + s.batteryPct / pctPerKm(s);
    const stopAt = Math.min(wp?.routeKm ?? routeKm, routeKm);
    return emptyAt < stopAt ? { km: emptyAt, empty: true } : { km: stopAt, empty: false };
  };
  const emptyToast = () => showToast("배터리가 바닥나는 지점에서 멈췄습니다 (모의) · 충전 경유지를 먼저 넣으세요", "negative");

  if (restricted && action.phase === "CONFIRMING") setAction((s) => reduceAction(s, { type: "INVALIDATE", reason: "주행이 시작돼 공조 변경 확인을 취소했습니다. 정차한 뒤 다시 확인해 주세요." }));
  const shownType = suggestions.top?.type ?? null;
  if (memory.tripId > 0 && memory.lastShown !== shownType) setMemory((m) => remember(m, { kind: "SHOWN", type: shownType }));

  // ── 주행 재생 — 1틱 = 1분 · 80km/h ─────────────────
  // 인터벌 안에서는 최신 값을 ref 로 읽는다 — 클로저에 묶인 옛 배터리·경유지로 판단하지 않으려고
  const latest = useRef({ traveledKm, v, nextWaypoint, routeKm: legTotalKm });
  useEffect(() => { latest.current = { traveledKm, v, nextWaypoint, routeKm: legTotalKm }; });
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const s = latest.current;
      const limit = limitOf(s.traveledKm, s.v, s.nextWaypoint, s.routeKm);
      const next = Math.min(s.traveledKm + DEMO_ROUTE.kmPerMinute, limit.km);
      const used = (next - s.traveledKm) * pctPerKm(s.v);
      const arrived = next >= limit.km - 1e-9;
      latest.current = { ...s, traveledKm: next, v: { ...s.v, batteryPct: Math.max(s.v.batteryPct - used, 0) } };
      setTraveledKm(next);
      setSimMin((m) => m + 1);
      setV((x) => ({ ...x, tripMinutes: x.tripMinutes + 1, batteryPct: Math.max(x.batteryPct - used, 0), speedKmh: arrived ? 0 : x.speedKmh }));
      if (arrived) { setPlaying(false); if (limit.empty) emptyToast(); }
    }, TICK_MS);
    return () => clearInterval(id);
    // emptyToast 는 매 렌더 새로 만들어지지만 하는 일은 같다 — 넣으면 틱마다 인터벌이 다시 걸린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const drive = () => {
    setGear("DRIVE"); setParkingBrake(false); setPlaying(true); setV((s) => ({ ...s, speedKmh: 80 }));
  };
  const stop = () => { setPlaying(false); setV((s) => ({ ...s, speedKmh: 0 })); };
  const park = () => { stop(); setGear("PARK"); setParkingBrake(true); };

  /** 진행 거리를 옮긴다 — 경유지를 건너뛰지 않는다(충전을 건너뛴 배터리가 되면 안 된다) */
  const jumpTo = (km: number) => {
    const limit = limitOf(traveledKm, v, nextWaypoint, legTotalKm);
    const target = Math.min(km, limit.km);
    if (limit.empty && km > limit.km) { emptyToast(); setPlaying(false); setV((s) => ({ ...s, speedKmh: 0 })); }
    const d = Math.max(target - traveledKm, 0);
    const minutes = Math.round((d / 80) * 60);
    setTraveledKm(target);
    setSimMin((m) => m + minutes);
    setV((s) => ({ ...s, batteryPct: Math.max(s.batteryPct - d * pctPerKm(s), 0), tripMinutes: s.tripMinutes + minutes }));
  };

  // ── 행동 ─────────────────────────────────────────
  /** Mission 의 세 값을 새 이동 기준으로 — 대기 출처는 프로필의 저장된 계획(SAVED), 프로필 없이는 없음(NONE) */
  const resetMission = (m: ProfileMode) => { setNextLegReady(false); setEndedEarly(false); setWaitSource(m === "GUEST" ? "NONE" : "SAVED"); setHandoff(IDLE_HANDOFF); };
  const resetTrip = (m: ProfileMode, opts: { battery?: number; keepProfiles?: boolean } = {}) => {
    const f = fresh(m);
    setV6(null);
    if (!opts.keepProfiles) setProfiles((ps) => ({ ...ps, [m]: PROFILE_PRESETS[m] }));
    setMode(m); setPlan(f.plan); setV({ ...f.vehicle, batteryPct: opts.battery ?? f.vehicle.batteryPct }); setWaitModeRaw(defaultWaitModeOf(m)); resetMission(m); setMissionStartedAt(null);
    setTraveledKm(0); setWaitedMin(0); setSimMin(0); setPlaying(false); setGear("PARK"); setParkingBrake(true); setUxMode("AUTO");
    setJourney(INITIAL_JOURNEY); setLinks(ALL_LIVE); setAtLoss(null); setSignalStatus(ALL_OK); setPowertrain("EV"); setHvacC(25); setHvacReadable(true); setDoor({ readable: true, open: false, locked: false });
    setCapHvac("YES"); setPermClimate("YES"); setPermSeat("YES"); setPermNavi("YES"); setNaviConnected(true); setControlMode("SUCCESS");
    setCabinNow({ seatVent: false, seatHeat: false, steeringHeat: false, lighting: null }); setCabinBatch({ phase: "IDLE", settled: null, message: null });
    setAction(idleAction("MOCK")); setWaypoints([]); setChargedAt([]); setAddingId(null);
    setNotif(INITIAL_NOTIFICATION); setRejudge(null); setScreen("home"); setChosen(true);
    // 시나리오는 같은 장면이 나와야 한다 — 그 프로필의 거절 학습을 비우고 새 이동 기억으로 시작
    const st = startTrip(vault, m);
    setVault(setVaultHistory(st.vault, m, {})); setMemory(st.memory);
  };

  /**
   * 연결 끊김/복구 — 연결별로. 배터리 연결이 복구되면 지금 값으로 다시 판단하고, **마지막으로 알린 판단**과 비교해 바뀐 게 크면 알린다
   * (끊긴 동안 몰래 나빠진 것을 놓치지 않으려고). 주행 신호·공조 연결의 복구는 재판단이 아니다 — 에너지의 필수 입력이 아니다.
   * "차량 데이터 연결" 스위치는 셋을 한꺼번에(시나리오 J), 부분 복구는 개발자 조작판에서.
   */
  const setLinkOf = (kinds: LinkKind[], live: boolean) => {
    const changing = kinds.filter((k) => links[k].live !== live);
    if (changing.length === 0) return;
    const next = { ...links };
    for (const k of changing) next[k] = live ? { live: true, lostAt: null } : { live: false, lostAt: clock };
    setLinks(next);
    const names = changing.map((k) => LINK_LABEL[k]).join(" · ");
    if (!live) {
      if (changing.includes("ENERGY")) {
        // 끊기기 전에 마지막으로 안 판단을 기준으로 잡아 둔다 — 복구 뒤 끊긴 사이 바뀐 것과 비교하려고. 입력도 찍어 둔다(원인 분해)
        setNotif((n) => (n.lastNotified ? n : decideNotification(n, energy).state));
        setAtLoss(rejudgeInputs());
      }
      log("STATE", `차량 데이터 연결 끊김 — ${names} · 끊긴 동안 그 값으로 판단하지 않음`);
      return;
    }
    if (!changing.includes("ENERGY")) { log("STATE", `차량 데이터 연결 복구 — ${names}`); showToast(`${names} 연결이 돌아왔습니다`, "neutral"); return; }
    const base = notif.lastNotified ? notif : decideNotification(notif, energy).state;
    const d = decideNotification(base, energy);
    setNotif(d.state);
    const msg = notificationMessage(d, v.batteryPct);
    const cause = rejudgeCause(atLoss ? changedInputs(atLoss, rejudgeInputs()) : []);
    setAtLoss(null);
    keepRejudge(d, v.batteryPct, "끊기기 전", "복구 뒤", cause);
    const partial = LINK_KINDS.some((k) => !next[k].live) ? ` · 아직 끊김: ${LINK_KINDS.filter((k) => !next[k].live).map((k) => LINK_LABEL[k]).join(" · ")}` : "";
    log("STATE", `차량 데이터 연결 복구 — ${names} (${links.ENERGY.lostAt ?? "?"} 부터 끊김)${msg ? ` · ${msg} · ${cause.text}` : ""}${partial}`);
    const head = changing.length === LINK_KINDS.length ? "연결이 돌아왔습니다" : `${names} 연결이 돌아왔습니다`;
    showToast(msg ? `${head} · ${msg}${partial}` : `${head} · 지금 값으로 다시 판단했습니다${partial}`, msg && d.notify && d.notify.delta > 0 ? "negative" : "neutral");
    if (shouldResurface(d)) setHistory((h) => { const re = reactivate(h, "ENERGY_DECISION"); return { ...re, ENERGY_DECISION: { ...re.ENERGY_DECISION!, doneThisTrip: false } }; });
  };
  const setLinkLive = (live: boolean) => setLinkOf(LINK_KINDS, live);
  const allLive = LINK_KINDS.every((k) => links[k].live);

  const startPrepare = () => {
    if (!chosen) { showToast("먼저 프로필을 골라 주세요"); return; }
    const nextPlan = journey.phase === "COMPLETED" ? planFor(profile) : plan;
    if (journey.phase === "COMPLETED") {
      setHistory(newTrip); setWaypoints([]); setChargedAt([]); setNotif(INITIAL_NOTIFICATION); setRejudge(null);
      setTraveledKm(0); setWaitedMin(0); setPlan(nextPlan); setAction(idleAction("MOCK"));
    }
    const next = nextJourney(journey, signals, "START_PREPARE");
    if (next.phase !== "PREPARING") return;
    // 새 이동 — 이동 번호를 올리고 이번 이동 기억을 비운다 · 이 조합을 "지난번"으로 기억한다
    const st = startTrip(vault, mode);
    setVault(rememberMode(st.vault, mode, driverId)); setMemory(st.memory); setCabinBatch({ phase: "IDLE", settled: null, message: null });
    // 편도 1구간 · 왕복 2구간 — 출발 준비 때 여정에 맞춰 정한다
    setJourney(withLegs(next, legsOf(nextPlan)));
    setNextLegReady(false); setEndedEarly(false); setMissionStartedAt(clock); setHandoff(IDLE_HANDOFF);
    log("PREPARE", `이동 #${st.memory.tripId} · ${profile.name} 프로필로 출발 준비 시작${legsOf(nextPlan) > 1 ? " · 왕복" : ""}`, st.memory.tripId);
  };
  /** 중간 목적지에서 대기 시작(내리지 않고) · 여정 전체 종료 — 귀가가 남아 있어도 끝낼 수 있다(그러면 Mission 은 완료가 아니라 중단) */
  const startWait = () => { const n = fire("START_WAIT"); if (n.phase === "WAITING") log("STATE", `${plan.destinationName} 도착 · 사용자 확인 · 대기 시작 · 귀가 ${plan.returnKm ?? 0}km 남음`); };
  const endTrip = () => { const n = fire("END_TRIP"); if (n.phase === "COMPLETED") { setEndedEarly(!isLastLeg(journey)); log("FINISH", `이동 #${memory.tripId} 종료 (사용자 선택${!isLastLeg(journey) ? " · 귀가 구간 남은 채로" : ""}) · ${tripSummary()}`); showToast("여정을 마쳤습니다"); } };
  /**
   * 귀가 구간 준비(V5 NEXT_LEG) — 방문·대기 중(WAITING)에 주차한 채로만. 실행 직전 Safety Gate 를 다시 돌린다.
   * 하는 일은 "준비됨" 표시와 기록뿐 — 내비 목적지·경유지는 사용자 동의 없이 바꾸지 않는다(지시서 4절 8). 차가 출발하면 journey 가 귀가 구간으로 넘긴다
   */
  /**
   * 원탭 다음 이동(모의 내비) — 귀가 일정을 확인한 뒤 주차한 채로만. 게이트(REQUEST_ROUTE) → 즐겨찾기·경로 확인 → 보냄 → 목적지를 다시 읽어 확인.
   * 시연의 집은 시연 데이터 즐겨찾기다. 내비 연결을 끄면 실패 경로를, 조작판의 "기존 경로 있음"은 교체 확인 경로를 본다
   */
  const MOCK_HOME: NaviPlace = { name: "집 (시연 데이터)", lat: 37.4979, lon: 127.0276, poiId: "demo-home" };
  const sendMockRoute = (cur: HandoffState, id: number) => {
    setTimeout(() => {
      if (!naviConnected) { handoffStep(cur, { type: "ERROR", requestId: id, error: "UNAVAILABLE" }); return; }
      const s = handoffStep(reduceHandoff(cur, { type: "ROUTE_STARTED", requestId: id }), { type: "DESTINATION_READ", requestId: id, place: MOCK_HOME });
      if (s.phase === "VERIFIED") { log("WAYPOINT", `시연 내비 목적지 집으로 확인 (모의) · 요청 #${id}`); showToast(s.message ?? "", "positive"); }
    }, LATENCY_MS);
  };
  const v6Input = (s: V6State): DecisionInput => ({
    powertrain, vehicle: normalizeVehicle({ socPct: v.batteryPct, capacityRaw: v.batteryKwh, readAt: s.now, evidence: "MOCK", availability: "OK" }, s.now),
    snapshot: v, plan, traveledKm, connector: "DC_COMBO", stops: MOCK_STOPS, now: s.now, rejectedStopIds: s.rejected,
    chargers: s.feedFailed ? { availability: "FAILED", errorReason: "시연: 응답 없음", records: [] }
      : { availability: "OK", errorReason: null, records: mockChargerRows(s.now, s.overrides).map((r) => normalizeCharger(r, s.now, "MOCK")).filter((r): r is ChargerRecord => r != null) },
  });
  const decision = v6 ? decide(v6Input(v6)) : null;
  const updateV6 = (p: Partial<V6State>) => {
    if (!v6) return;
    const next = { ...v6, ...p };
    setV6({ ...next, notice: replanNotice(decide(v6Input(v6)), decide(v6Input(next))).message });
  };
  /** 모의 내비 — 실제 어댑터와 같은 리듀서를 지나 결과 문장에 '(모의)'가 붙는다 */
  const v6AddStop = (c: Candidate) => {
    if (!v6 || !decision || c.lat == null || c.lon == null || !canPickStop(decision, c.stopId, gear === "PARK" && !restricted)) return;
    const target = { name: c.name, lat: c.lat, lon: c.lon, poiId: null };
    const events: WaypointEvent[] = [{ type: "START", requestId: 1, target, mock: true }, { type: "LOOKUP", requestId: 1, routing: true, waypoints: [] }, { type: "ACK", requestId: 1 }, { type: "WAYPOINTS_READ", requestId: 1, waypoints: [target] }];
    setV6({ ...v6, waypoint: events.reduce(reduceWaypoint, IDLE_WAYPOINT) });
  };
  const startRouteHome = () => {
    if (journey.phase !== "WAITING" || !nextLegReady || (plan.returnKm ?? 0) <= 0) return;
    const g = checkAction("REQUEST_ROUTE", gateCtx, true);
    if (!g.allowed) { showToast(g.message, "negative"); return; }
    const id = nextRequestId();
    const s0 = handoffStep(handoff, { type: "START", requestId: id, mock: true });
    if (s0.phase !== "LOOKING") return;
    log("WAYPOINT", `집으로 안내 요청 #${id} · 내비 즐겨찾기·현재 목적지 확인부터 (사용자 선택 · 모의 내비)`);
    setTimeout(() => {
      const s = handoffStep(s0, naviConnected ? { type: "LOOKUP", requestId: id, home: MOCK_HOME, current: null } : { type: "TIMEOUT", requestId: id });
      if (shouldSend(s)) sendMockRoute(s, id);
      else if (s.message) showToast(s.message, s.phase === "VERIFIED" ? "positive" : "negative");
    }, 500);
  };
  const confirmRouteReplace = () => { const id = handoff.requestId; if (id === null) return; const s = handoffStep(handoff, { type: "CONFIRM_REPLACE", requestId: id }); if (shouldSend(s)) sendMockRoute(s, id); };
  const readyNextLeg = () => {
    if (journey.phase !== "WAITING" || (plan.returnKm ?? 0) <= 0) return;
    const g = checkAction("PREPARE_NEXT_LEG", gateCtx, true);
    if (!g.allowed) { showToast(g.message, "negative"); return; }
    setNextLegReady(true); setHistory((h) => recordAccepted(h, "NEXT_LEG"));
    log("STATE", `귀가 일정 확인 · ${RETURN_DESTINATION} ${plan.returnKm ?? 0}km · 내비 목적지 미설정 (앱이 설정하지 않음)`);
    showToast("귀가 일정을 확인했어요 · 내비 경로는 아직 그대로예요 — '집으로 안내 시작'을 누르면 내비에 집 경로를 요청하고, 목적지를 다시 읽어 확인합니다", "positive");
  };
  /** 이동 요약 — 완료 기록에 한 줄로 */
  const tripSummary = () => `준비 ${memory.prepareDone ? "완료" : "확인 안 함"} · 공조 ${memory.climate ? (memory.climate.decision === "APPLIED" ? `${memory.climate.valueC}°C 적용(모의)` : `${memory.climate.valueC}°C 유지`) : "결정 없음"} · 충전 정차 ${chargedAt.length}회`;

  /**
   * 프로필 바꾸기 — 이동 중에는 막는다(남의 준비물·동승자 조건이 섞인다). 바꾸면 이번 이동 기억·경유지·알림 기준을 비우고,
   * 기록과 거절 학습은 그 프로필 것만 보인다.
   */
  const selectMode = (m: ProfileMode) => {
    // 이동 중인지를 먼저 본다 — 주행 제한(Safety Gate)보다 "왜 안 되나"가 분명한 이유다
    const p = journey.phase;
    if (p !== "NOT_STARTED" && p !== "PREPARING" && p !== "COMPLETED") { showToast("이동 중에는 프로필을 바꿀 수 없습니다 · 여정을 끝낸 뒤 바꿔 주세요", "negative"); return; }
    const g = checkAction("LOAD_PROFILE", gateCtx, true);
    if (!g.allowed) { showToast(g.message, "negative"); return; }
    const nextPlan = planFor(profiles[m]);
    setMode(m); setChosen(true); setPlan(nextPlan); setWaitModeRaw(defaultWaitModeOf(m)); resetMission(m);
    setWaypoints([]); setChargedAt([]); setNotif(INITIAL_NOTIFICATION); setRejudge(null); setAction(idleAction("MOCK")); setCabinBatch({ phase: "IDLE", settled: null, message: null });
    if (p === "PREPARING") {
      const st = startTrip(vault, m);
      setVault(rememberMode(st.vault, m, driverId)); setMemory(st.memory);
      setJourney(withLegs({ ...journey, leg: 0 }, legsOf(nextPlan)));
      log("PREPARE", `이동 #${st.memory.tripId} · ${profiles[m].name} 프로필로 바꿔 출발 준비`, st.memory.tripId, m);
    } else setMemory(newMemory(0, m));
    showToast(`${profiles[m].name} 프로필을 불러왔습니다`);
  };
  /**
   * 탑승 조합을 고르면 **바로 출발 준비(비교)가 시작된다** — 선택 한 번이 곧 준비다(One Choice, Ready to Drive).
   * 탑승 전·이동 완료 상태에서만. 이미 준비 중이면 selectMode 가 조합만 바꾼다.
   */
  const chooseAndPrepare = (m: ProfileMode) => {
    const ph = journey.phase;
    if (ph !== "NOT_STARTED" && ph !== "COMPLETED") { selectMode(m); return; }
    const g = checkAction("LOAD_PROFILE", gateCtx, true);
    if (!g.allowed) { showToast(g.message, "negative"); return; }
    const p = profiles[m];
    const nextPlan = planFor(p);
    setMode(m); setChosen(true); setPlan(nextPlan); setWaitModeRaw(defaultWaitModeOf(m)); resetMission(m);
    setWaypoints([]); setChargedAt([]); setNotif(INITIAL_NOTIFICATION); setRejudge(null); setAction(idleAction("MOCK")); setCabinBatch({ phase: "IDLE", settled: null, message: null });
    if (ph === "COMPLETED") { setTraveledKm(0); setWaitedMin(0); setVault((vt) => setVaultHistory(vt, m, newTrip(vt.history[m]))); }
    const next = nextJourney(journey, { ...signals, gear: "PARK", speedKmh: 0 }, "START_PREPARE");
    if (next.phase !== "PREPARING") { setMemory(newMemory(0, m)); return; }
    const st = startTrip(vault, m);
    setVault((vt) => rememberMode({ ...st.vault, history: vt.history }, m, driverId)); setMemory(st.memory);
    setJourney(withLegs(next, legsOf(nextPlan))); setMissionStartedAt(clock);
    log("PREPARE", `이동 #${st.memory.tripId} · ${p.name} 조합으로 출발 준비 시작${legsOf(nextPlan) > 1 ? " · 왕복" : ""} · 저장 취향과 차량 설정 비교`, st.memory.tripId, m);
  };

  /**
   * SMART CABIN PREPARE — 승인 **하나**로 적용 후보를 전부 보낸다(오너 지시 3절 7). 보내기 직전 Safety Gate 를 항목 종류마다 다시 돌린다.
   * 모의 차량은 제어 결과 설정대로 응답한다(PARTIAL = 첫 항목만 성공). 결과는 항목마다 독립 — 성공한 것만 차량 값에 반영하고 '적용 확인'이라 적는다.
   */
  const applyCabin = () => {
    const keys = cabinPlan.toApply;
    if (keys.length === 0 || cabinBatch.phase === "PENDING") return;
    const needsHvac = keys.some((k) => k === "HVAC_TEMP" || k === "HVAC_POWER");
    const needsSeat = keys.some((k) => k === "SEAT_VENT" || k === "SEAT_HEAT");
    const g = needsHvac && !climateGate.allowed ? climateGate : needsSeat && !seatGate.allowed ? seatGate : null;
    if (g && !g.allowed) { setCabinBatch({ phase: "IDLE", settled: null, message: `실행 직전 재검사에서 막혔습니다 · ${g.message}` }); log("PREPARE", `실내 일괄 적용 차단(실행 직전 재검사) — ${g.message}`); return; }
    const id = nextRequestId();
    setCabinBatch({ phase: "PENDING", settled: null, message: null });
    log("PREPARE", `실내 일괄 적용 요청 #${id} · ${keys.map((k) => CABIN_LABEL[k]).join("·")} (모의)`);
    setTimeout(() => {
      const outcomes: Partial<Record<CabinKey, CabinOutcome>> = {};
      keys.forEach((k, i) => {
        outcomes[k] = controlMode === "SUCCESS" || controlMode === "LATE" ? { kind: "CALLBACK", matched: true }
          : controlMode === "ERROR" ? { kind: "ERROR", reason: "차량이 요청을 거절했습니다" }
          : controlMode === "MISMATCH" ? { kind: "CALLBACK", matched: i !== 0 }
          : controlMode === "PARTIAL" ? (i === 0 ? { kind: "CALLBACK", matched: true } : { kind: "ERROR", reason: "이 항목은 차량이 거절했습니다" })
          : { kind: "TIMEOUT" };
      });
      const settled = settleCabin(keys, outcomes, "MOCK");
      // 성공한 항목만 차량 값에 반영 — 모의 차량이 실제로 바뀐 것처럼
      const target = prefs.hvacTempC;
      if (settled.applied.includes("HVAC_TEMP") && target !== null) { setHvacC(target); setMemory((m) => remember(m, { kind: "CLIMATE", decision: "APPLIED", valueC: target })); setHistory((h) => recordAccepted(h, "PROFILE_PREPARATION")); }
      if (settled.applied.includes("HVAC_POWER") && prefs.hvacOn !== null) setV((x) => ({ ...x, hvacOn: prefs.hvacOn! }));
      setCabinNow((c) => ({
        ...c,
        seatVent: settled.applied.includes("SEAT_VENT") ? prefs.seatVent! : c.seatVent,
        seatHeat: settled.applied.includes("SEAT_HEAT") ? prefs.seatHeat! : c.seatHeat,
      }));
      setCabinBatch({ phase: "DONE", settled, message: null });
      log("PREPARE", `실내 일괄 적용 결과 #${id} · ${settled.summary} · ${settled.results.map((r) => r.line).join(" / ")}`);
      showToast(settled.summary, settled.allApplied ? "positive" : "negative");
    }, LATENCY_MS);
  };
  /** "지금 그대로" — 이번 이동에서는 실내 설정을 다시 묻지 않는다 */
  const keepCabin = () => {
    setHistory((h) => recordKept(h, "PROFILE_PREPARATION", now));
    setMemory((m) => remember(m, { kind: "CLIMATE", decision: "KEPT", valueC: hvacC }));
    setCabinBatch({ phase: "KEPT", settled: null, message: null });
    log("PREPARE", `실내 설정 지금 그대로(${cabinPlan.toApply.map((k) => CABIN_LABEL[k]).join("·")}) — 이번 이동에서는 다시 묻지 않음`);
  };
  /** 준비물 한 번에 — 항목마다 누르지 않아도 된다(필요하면 하나씩도) */
  const packAll = () => { setPacked(profile.packing); log("PREPARE", `준비물 ${profile.packing.length}개 모두 챙김 (사용자 확인)`); };
  const changeProfile = (p: UserProfile) => {
    setProfiles((ps) => ({ ...ps, [p.mode]: p }));
    if (traveledKm === 0) setPlan((pl) => ({ ...pl, passengers: p.passengers, minReservePct: p.minReservePct }));
  };

  /** 공조 맞추기 1단계 — 게이트가 "확인 필요"만 남기면 확인 카드를 연다 */
  const requestClimate = () => {
    const g = checkAction("SET_CLIMATE", gateCtx, false);
    if (!g.allowed && g.block !== "NEEDS_CONFIRMATION") { showToast(g.message, "negative"); return; }
    dispatch({ type: "OPEN" });
  };
  /** 2단계 — 확인한 **뒤에** 게이트를 다시 돌린다. 그사이 출발했으면 여기서 막힌다 */
  const confirmClimate = () => {
    const target = prefs.hvacTempC; // 합친 취향 — 일괄 적용과 같은 목표
    if (target === null) return;
    const g = checkAction("SET_CLIMATE", gateCtx, true);
    if (!g.allowed) { dispatch({ type: "INVALIDATE", reason: `확인하는 사이 상태가 바뀌어 실행하지 않았습니다 · ${g.message}` }); log("PREPARE", `공조 변경 차단(실행 직전 재검사) — ${g.message}`); return; }
    const id = nextRequestId();
    dispatch({ type: "SEND", requestId: id, target });
    const before = hvacC;
    const applied = () => { setHvacC(target); setHistory((h) => recordAccepted(h, "PROFILE_PREPARATION")); setMemory((m) => remember(m, { kind: "CLIMATE", decision: "APPLIED", valueC: target })); };
    const note = (what: string) => log("PREPARE", `공조 요청 #${id} ${before}→${target}°C · ${what} (모의)`);
    // 모의 차량 — 실제에서는 SDK 콜백·타이머·재조회가 이 이벤트들을 넣는다
    if (controlMode === "SUCCESS" || controlMode === "PARTIAL") setTimeout(() => { applied(); dispatch({ type: "CALLBACK", requestId: id, value: target }); note("적용 확인"); }, LATENCY_MS);
    if (controlMode === "ERROR") setTimeout(() => { dispatch({ type: "ERROR", requestId: id, reason: "차량이 요청을 거절했습니다" }); note("거절"); }, LATENCY_MS);
    if (controlMode === "MISMATCH") setTimeout(() => { dispatch({ type: "CALLBACK", requestId: id, value: before }); note(`값 불일치(${before})`); }, LATENCY_MS);
    if (controlMode === "TIMEOUT" || controlMode === "LATE" || controlMode === "UNREADABLE") {
      setTimeout(() => { dispatch({ type: "TIMEOUT", requestId: id }); note("응답 없음 — 결과 모름"); }, LATENCY_MS);
      if (controlMode === "LATE") setTimeout(() => { applied(); dispatch({ type: "CALLBACK", requestId: id, value: target }); note("늦게 적용됨"); }, LATENCY_MS + 300);
      // 다시 읽기 — 늦게 적용된 경우에는 이미 성공이라 리듀서가 무시한다
      setTimeout(() => dispatch({ type: "READBACK", requestId: id, value: controlMode === "UNREADABLE" ? null : controlMode === "LATE" ? target : before }), LATENCY_MS + 400);
    }
  };
  // "현재 설정 유지" — 이번 이동에서는 다시 묻지 않는다(recordKept). 10분마다 같은 온도를 묻지 않으려고
  const keepClimate = () => { setHistory((h) => recordKept(h, "PROFILE_PREPARATION", now)); setMemory((m) => remember(m, { kind: "CLIMATE", decision: "KEPT", valueC: hvacC })); log("PREPARE", `공조 ${hvacC}°C 유지 — 이번 이동에서는 다시 묻지 않음`); };
  const cancelClimate = () => { dispatch({ type: "CANCEL" }); keepClimate(); };
  /** 출발 준비 마침 — 남은 확인 항목이 있어도 사용자가 마칠 수 있다(무엇이 남았는지 기록에 남긴다) */
  const finishPrepare = () => {
    setMemory((m) => remember(m, { kind: "PREPARE_DONE" }));
    log("PREPARE", `출발 준비 마침 · 완료 ${prep.done} · 할 일 ${prep.needs} · 건너뜀 ${prep.skipped} · 지원 안 함 ${prep.unsupported}`);
    showToast(prep.needs > 0 ? `출발 준비를 마쳤습니다 · 확인 필요 ${prep.needs}개가 남아 있습니다` : "출발 준비를 마쳤습니다", "positive");
    setScreen("home");
  };

  const onPrimary = (s: Suggestion) => {
    if (s.action === "SET_CLIMATE") setScreen("prepare");
    else if (s.action === "SUGGEST_CHARGE_STOP") { setScreen(s.type === "BREAK_PLANNING" ? "stops" : "energy"); log("ENERGY", `에너지 확인 · ${energy.message}`); }
    else if (s.action === "CONFIRM_FINISH") startFinish();
    else if (s.action === "PREPARE_NEXT_LEG") readyNextLeg();
    else setHistory((h) => recordAccepted(h, s.type));
  };
  /** 출발 준비 항목 건너뛰기 — 남은 일에서는 빠지지만 확인 완료가 아니다(3차 P0-4) */
  const skipPrepare = (k: PrepareItemKey) => { setMemory((m) => remember(m, { kind: "SKIP_PREPARE", key: k })); log("PREPARE", `${PREPARE_ITEM_LABEL[k]} 이번에는 건너뜀 (확인 완료 아님)`); };
  const onDismiss = (s: Suggestion) => {
    // 홈에서 공조 제안을 건너뛰면 "그대로 두기로 함"(확인 완료)이 아니라 "이번에는 건너뜀"이다. 이번 이동에서 다시 묻지는 않는다
    if (s.type === "PROFILE_PREPARATION") { setHistory((h) => recordKept(h, "PROFILE_PREPARATION", now)); skipPrepare("CLIMATE"); }
    else setHistory((h) => recordDismissed(h, s.type, now));
    showToast(s.ifSkipped);
  };

  const addStop = (stopItem: RestStop) => {
    const g = checkAction("ADD_WAYPOINT", gateCtx, true);
    if (!g.allowed) { showToast(g.message, "negative"); return; }
    setAddingId(stopItem.id);
    setTimeout(() => {
      const r = mockAddStop(waypoints.length, naviConnected);
      setAddingId(null);
      if (r.kind === "ADDED") {
        setWaypoints((w) => [...w, stopItem]);
        setHistory((h) => recordAccepted(h, "ENERGY_DECISION"));
        setMemory((m) => remember(m, { kind: "WAYPOINT", id: stopItem.id }));
        showToast(`${stopItem.name} 경유지 추가됨 · 내비가 확인함 (시연 데이터)`, "positive");
        log("WAYPOINT", `${stopItem.name} 경유지 추가 (사용자 선택)`);
      } else if (r.kind === "SLOT_FULL") showToast("경유지 2개가 모두 찼습니다 · 기존 경유지는 그대로 둡니다");
      else showToast("내비게이션 연결 안 됨 · 기존 경로를 유지합니다", "negative");
    }, LATENCY_MS);
  };

  const charge = () => {
    if (!atWaypoint) return;
    const before = Math.round(v.batteryPct);
    setV((s) => ({ ...s, batteryPct: Math.max(CHARGE_TARGET_PCT, s.batteryPct), tripMinutes: 0 }));
    setWaypoints((w) => w.filter((x) => x.id !== atWaypoint.id));
    setChargedAt((c) => [...c, atWaypoint.name]);
    setTraveledKm((km) => km + 0.1);
    log("ENERGY", `${atWaypoint.name} 충전 ${before}→${Math.max(CHARGE_TARGET_PCT, before)}% (모의)`);
  };

  /**
   * 일정·차량 값 변경 → 쉼표 DRIVE 재판단(rejudge) 그대로. 판단이 나빠지면 에너지 제안을 다시 꺼낼 수 있게
   * "이번 여정에서 했음"을 풀지만, **이미 넣은 경유지는 건드리지 않는다** (CLAUDE.md 정책 1).
   */
  /** 에너지 판단에 들어가는 입력 묶음 — 끊길 때 찍고 복구 때 비교한다 */
  const rejudgeInputs = (): RejudgeInputs => ({ batteryPct: v.batteryPct, outsideTempC: v.outsideTempC, hvacOn: v.hvacOn, remainingKm, waitMinutes: remainPlan.waitMinutesAfterArrival, waitMode });

  /** 알릴 만한 변화면 전 → 후 → 원인을 남긴다. 전·후 모두 그때 잔량 기준 화면 값(energyView)으로 — 토스트 문장과 같은 숫자 */
  const keepRejudge = (d: ReturnType<typeof decideNotification>, soc: number, fromLabel: string, toLabel: string, cause: RejudgeCause) => {
    const n = rejudgeNote(d, soc, fromLabel, toLabel, cause, clock);
    if (n) setRejudge(n);
  };

  /** 재판단 카드의 원인은 호출자가 말하는 것이 아니라 **전후 입력을 비교**해 뽑는다 — 둘 이상 바뀌었으면 하나로 말하지 않는다(외부 평가 7 B) */
  const replan = (nextPlan: TripPlan, nextV: VehicleSnapshot, why: string) => {
    // 기준이 아직 없으면 지금(바꾸기 전) 판단을 기준으로 잡는다 — 그다음부터는 마지막으로 알린 판단과 비교
    const base = notif.lastNotified ? notif : decideNotification(notif, energy).state;
    const d = decideNotification(base, energyFor(remainingPlan(nextPlan, legPos), nextV, waitMode));
    setNotif(d.state); setPlan(nextPlan); setV(nextV);
    const msg = notificationMessage(d, nextV.batteryPct);
    if (!msg) return;
    const after: RejudgeInputs = { batteryPct: nextV.batteryPct, outsideTempC: nextV.outsideTempC, hvacOn: nextV.hvacOn, remainingKm, waitMinutes: remainingPlan(nextPlan, legPos).waitMinutesAfterArrival, waitMode };
    keepRejudge(d, nextV.batteryPct, "바꾸기 전", "바꾼 뒤", rejudgeCause(changedInputs(rejudgeInputs(), after)));
    showToast(msg, d.notify && d.notify.delta > 0 ? "negative" : "neutral");
    log("ENERGY", `${why} · ${msg}`);
    // 나빠졌으면 에너지 제안을 다시 꺼낸다 — 공조 거절 학습(쿨다운)으로 묻어 두지 않는다. 경유지는 건드리지 않는다
    if (shouldResurface(d)) setHistory((h) => { const re = reactivate(h, "ENERGY_DECISION"); return { ...re, ENERGY_DECISION: { ...re.ENERGY_DECISION!, doneThisTrip: false } }; });
  };
  /** 대기 시간 바꾸기 — 사용자가 바꾼 값은 "직접 확인"이 된다(Mission wait.source). 추정하지 않는다 */
  const changeWait = (deltaMinutes: number) => {
    replan({ ...plan, waitMinutesAfterArrival: Math.max(plan.waitMinutesAfterArrival + deltaMinutes, 0) }, v, `도착 후 대기 ${deltaMinutes > 0 ? "+" : "−"}${Math.abs(deltaMinutes)}분`);
    setWaitSource("USER");
  };

  /**
   * 대기 유형 바꾸기 — 사용자가 알려 주는 사실이라 정차 중에만. 바꾸면 쉼표 DRIVE 재판단과 같은 규칙으로
   * 마지막으로 알린 판단과 비교해 알린다(차 안에서 기다리기로 하면 충분 → 주의가 될 수 있다).
   */
  const setWaitMode = (m: WaitMode) => {
    if (m === waitMode) return;
    if (restricted) { showToast("주행 중에는 바꿀 수 없습니다 · 정차한 뒤 바꿔 주세요", "negative"); return; }
    const base = notif.lastNotified ? notif : decideNotification(notif, energy).state;
    const d = decideNotification(base, energyFor(remainPlan, v, m));
    setNotif(d.state); setWaitModeRaw(m); setWaitSource("USER");
    const msg = notificationMessage(d, v.batteryPct);
    keepRejudge(d, v.batteryPct, WAIT_MODE_LABEL[waitMode], WAIT_MODE_LABEL[m], rejudgeCause(["WAIT_MODE"]));
    log("ENERGY", `대기 유형 → ${WAIT_MODE_LABEL[m]}${msg ? ` · ${msg}` : ""}`);
    showToast(msg ? `${WAIT_MODE_LABEL[m]} · ${msg}` : `${WAIT_MODE_LABEL[m]} · 에너지 판단은 그대로입니다`, msg && d.notify && d.notify.delta > 0 ? "negative" : "neutral");
    if (shouldResurface(d)) setHistory((h) => { const re = reactivate(h, "ENERGY_DECISION"); return { ...re, ENERGY_DECISION: { ...re.ENERGY_DECISION!, doneThisTrip: false } }; });
  };

  const startFinish = () => {
    const next = fire("START_FINISH");
    if (next.phase === "FINISHING") { setHistory((h) => recordAccepted(h, "CHECKLIST_REMINDER")); setScreen("finish"); }
    else showToast("주차한 뒤에 하차 준비를 시작할 수 있습니다");
  };
  const finishGate = checkAction("CONFIRM_FINISH", gateCtx, true);
  const complete = () => {
    // 하차 준비 중일 때만 — 그 밖의 단계에서 받으면 FINISH_DONE 이 단계를 바꾸지 않아 "중간 정차"로 잘못 읽힌다
    if (journey.phase !== "FINISHING" || !finishGate.allowed) return;
    const after = fire("FINISH_DONE");
    const n = profile.finishChecklist.filter((i) => checked.includes(i)).length;
    const mid = after.phase === "WAITING";
    if (after.phase === "PARKED") {
      // 휴게소에서 확인한 것을 목적지 하차에 그대로 쓰지 않는다 — 이 구간의 확인을 비운다
      setChecked([]);
      log("FINISH", `중간 정차 하차 확인 완료 · 사용자 확인 ${n}/${profile.finishChecklist.length} (센서 판정 아님) · ${legDestination}까지 이어서`);
      showToast(`하차 확인 완료 · ${legDestination}까지 이어서 갑니다`, "positive"); setScreen("home"); return;
    }
    log("FINISH", `${mid ? "중간 하차" : "최종 하차"} 확인 완료 · 사용자 확인 ${n}/${profile.finishChecklist.length} (센서 판정 아님)${mid ? " · 귀가 남음" : ` · 이동 #${memory.tripId} 완료 · ${tripSummary()}`}`);
    showToast(mid ? `하차 확인 완료 · 귀가 ${plan.returnKm ?? 0}km 가 남아 있습니다` : "이동을 마쳤습니다", "positive");
    if (mid) setScreen("home");
  };
  const toggle = (setter: (f: (c: string[]) => string[]) => void) => (i: string) => setter((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));
  const editChecklist = (items: string[]) => {
    const g = checkAction("EDIT_CHECKLIST", gateCtx, true);
    if (!g.allowed) { showToast(g.message, "negative"); return; }
    changeProfile({ ...profile, finishChecklist: items });
  };

  // 지금 프로필 것만 지운다 — 다른 사람(프로필)의 설정·기록은 그대로
  const wipe = () => { setProfiles((ps) => ({ ...ps, [mode]: PROFILE_PRESETS[mode] })); setVault((vt) => wipeProfile(vt, mode)); showToast(`${profile.name} 프로필의 설정과 기록을 지웠습니다 · 다른 프로필은 그대로`); };

  // ── 화면 ─────────────────────────────────────────
  // 주행 중이면 무엇을 보고 있었든 한 줄 화면 — 정차하면 보던 화면으로 돌아간다 (통합안 시나리오 D)
  const shown: CopilotScreenId | "drive" = restricted ? "drive" : screen;
  const go = (s: CopilotScreenId) => setScreen(s);
  /** 홈 A — 지금 상황 한 줄. 사람 말로 (단계 이름이 아니라 "어디까지 얼마나") */
  const situation = journey.phase === "NOT_STARTED" ? `${legDestination}까지 ${Math.round(legTotalKm)}km${journey.legs > 1 || isWait ? " · 왕복" : ""}`
    : journey.phase === "COMPLETED" ? `이동 #${memory.tripId} 마침`
    : journey.phase === "WAITING" ? `귀가 ${plan.returnKm ?? 0}km 남음 · 배터리 ${Math.round(v.batteryPct)}%`
    // 주차 + 남은 거리 0.5km 안은 '근처 정차'까지 — 도착은 사용자가 확인한다(CopilotSession 거울)
    : journey.atDestination && journey.phase === "PARKED" ? `${legDestination} 근처 정차 · 배터리 ${Math.round(v.batteryPct)}%`
    : journey.atDestination && journey.phase === "FINISHING" ? `${legDestination} 도착 · 배터리 ${Math.round(v.batteryPct)}%`
    : `${legDestination}까지 ${Math.round(remainingKm)}km${journey.leg === 0 && remainPlan.waitMinutesAfterArrival > 0 ? ` · 도착 후 ${remainPlan.waitMinutesAfterArrival}분 대기` : ""} · 배터리 ${Math.round(v.batteryPct)}%`;
  const drive_ = driveLine(ev, energyUsable, nextWaypoint ? { name: nextWaypoint.name, km: Math.max(Math.round(nextWaypoint.routeKm - traveledKm), 0) } : null, isWait ? "귀가" : "도착");
  /** Mission(V5) — 상태에서 계산한다. 화면 머리(목적 · 단계 · 복귀 유지)와 복원 스냅샷이 같은 값을 본다 */
  const mission = missionOf({
    mode, tripId: memory.tripId, driver: driverId, plan, journey, waitMode, nextLegReady, waitSource, endedEarly,
    energyAvailable: energyAvail.ok, clock, createdAt: missionStartedAt, waypointIds: waypoints.map((w) => w.id),
    naviRouteVerified: handoff.phase === "VERIFIED", naviRouteMock: handoff.mock,
  });
  const homeMission = mission ? {
    headline: missionHeadline(mission), returnLine: missionReturnLine(mission),
    // 대기 줄 — 대기가 있거나 출처가 없을 때만. 저장된 계획인지 직접 확인했는지를 같이 적는다(추정이 아니라는 뜻)
    waitLine: mission.wait.minutes > 0 ? `도착 후 대기 ${mission.wait.minutes}분 · ${WAIT_SOURCE_LABEL[mission.wait.source]}` : mission.wait.source === "NONE" ? `대기 계획 ${WAIT_SOURCE_LABEL.NONE}` : null,
  } : null;
  /**
   * 복원 스냅샷(지시서 4절 6) — 확인된 것만. 바뀔 때마다 저장하고, 앱을 다시 열면 진행 중(출발 준비 이후 · 완료 전)일 때만 이어서 간다.
   * 진행 중이던 제어 요청·알림 기준은 담지 않는다(결과를 모르는 명령을 다시 보내지 않는다)
   */
  const snapshotJson = JSON.stringify(chosen ? {
    version: 1, mode, driver: driverId, chosen, plan, journey, traveledKm, waitedMin, simMin, waitMode, waitSource, nextLegReady, endedEarly, missionStartedAt,
    memory, waypointIds: waypoints.map((w) => w.id), chargedAt, batteryPct: v.batteryPct, tripMinutes: v.tripMinutes, savedAt: clock,
  } satisfies MissionSnapshot : null);
  const restoreSnapshot = (snap: MissionSnapshot) => {
    if (!restorable(snap)) return;
    setMode(snap.mode); setChosen(true); setDriverIdRaw(snap.driver); setPlan(snap.plan);
    setTraveledKm(snap.traveledKm); setWaitedMin(snap.waitedMin); setSimMin(snap.simMin); setWaitModeRaw(snap.waitMode); setWaitSource(snap.waitSource);
    setNextLegReady(snap.nextLegReady); setEndedEarly(snap.endedEarly); setMissionStartedAt(snap.missionStartedAt);
    setMemory(snap.memory); setWaypoints(DEMO_STOPS.filter((s) => snap.waypointIds.includes(s.id))); setChargedAt(snap.chargedAt);
    // 모의 차량 — 다시 연 순간은 주차 상태로 본다(실제 차량에서는 콜백이 덮는다). 열려 있던 확인·보내던 요청은 복원하지 않는다
    setV((x) => ({ ...x, batteryPct: snap.batteryPct, tripMinutes: snap.tripMinutes, speedKmh: 0 })); setPlaying(false); setGear("PARK"); setParkingBrake(true);
    setAction(idleAction("MOCK")); setCabinBatch({ phase: "IDLE", settled: null, message: null }); setNotif(INITIAL_NOTIFICATION); setRejudge(null); setAtLoss(null);
    // 여정 단계는 저장값을 그대로 믿지 않고 지금 차 신호로 다시 판단한다(restoreJourney = nextJourney)
    setJourney(restoreJourney(snap.journey, restoredSignals(snap)));
    setScreen("home");
    setVault((vt) => recordActivity(vt, snap.mode, restoreNote(snap)));
    showToast(`이동 #${snap.memory.tripId} 를 이어서 합니다 · ${snap.savedAt} 저장`);
  };
  // 앱을 다시 열어 이어서 시작했으면 한 번 알린다(상태는 초기값에서 이미 복원됐다)
  useEffect(() => {
    if (initialSnap) showToast(`이동 #${initialSnap.memory.tripId} 를 이어서 합니다 · ${initialSnap.savedAt} 저장`);
    // 처음 한 번 — initialSnap 은 마운트 뒤 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { const s = JSON.parse(snapshotJson) as MissionSnapshot | null; saveMission(restorable(s) ? s : null); }, [snapshotJson]);
  // 음성은 확인할 것이 있을 때만 — 문제가 없으면 주행 중 말하지 않는다
  const voice = profile.voice && suggestions.top && drive_.level === "ATTENTION" ? `${suggestions.top.title}. ${suggestions.top.explanation}` : null;
  const rangeKm = Math.round(v.batteryPct / pctPerKm(v));
  const climateState = prefs.hvacTempC === null ? "SKIP" as const : !hvacReadable || !cabinLive ? "UNREADABLE" as const : Math.abs(hvacC - prefs.hvacTempC) < 1 ? "SAME" as const : "DIFFERENT" as const;
  const prep = prepareStatus({
    climate: climateState, currentC: hvacReadable && cabinLive ? hvacC : null, targetC: prefs.hvacTempC, climateDecision: memory.climate,
    climateBlocked: climateCantChange,
    packingTotal: profile.packing.length, packedCount: profile.packing.filter((i) => packed.includes(i)).length,
    energy: ev.status, waypointChosen: viaStop !== null, skipped: memory.skipped,
  });
  /** 차량 상태와 여정 상태 — 따로 (wait.ts) */
  const st = statusOf(journey, motion, waitMode);
  /** 데이터 출처 — 값마다 언제 받은 값인지. 끊기기 전 값은 보여 주되 판단에 쓰지 않는다 (freshness.ts) */
  const srcRow = (label: string, kind: "SOC" | "HVAC" | "GEAR" | "UX", value: string, readable = true): SourceRow => {
    const f = readable ? freshMap[kind] : "UNKNOWN";
    const l = links[SIGNAL_LINK[kind]!];
    const st = signalStatus[kind];
    return { label, value: f === "UNKNOWN" ? "모름" : value, line: st !== "OK" && l.live ? STATUS_LABEL[st] : sourceLine(f, l.live ? clock : l.lostAt, "DEMO"), usable: usable(f) };
  };
  const sources: SourceRow[] = [
    srcRow("배터리", "SOC", `${Math.round(v.batteryPct)}%`),
    srcRow("공조 설정 온도", "HVAC", `${hvacC}°C`, hvacReadable),
    srcRow("기어", "GEAR", gear === "PARK" ? "P" : "D"),
    srcRow("주행 제한", "UX", uxRestricted === null ? "모름" : uxRestricted ? "켜짐" : "꺼짐"),
    { label: "내 설정", value: profile.mode === "GUEST" ? "없음 (프로필 없이)" : profile.name, line: "직접 설정", usable: true },
  ];

  /** 메인 화면의 출발 준비 카드 재료 — 실내 비교(승인 하나) · 준비물 · 에너지 한 줄. 남은 확인이 없으면 ready */
  const energyItem = prep.items[2];
  const homePrepare: HomePrepare = {
    cabin: cabinPlan, batch: cabinBatch, onApply: applyCabin, onKeep: keepCabin,
    packing: { items: profile.packing, packed, skipped: memory.skipped.includes("PACKING"), onToggle: toggle(setPacked), onPackAll: packAll, onSkip: () => skipPrepare("PACKING") },
    energyLine: energyItem.state === "NOT_APPLICABLE" ? null : { text: energyItem.line, tone: energyItem.state === "DONE" ? "ok" : energyItem.state === "NEEDS_CHECK" ? "warn" : "muted" },
    ready: prep.ready && (cabinBatch.phase !== "IDLE" || cabinPlan.toApply.length === 0) && cabinBatch.phase !== "PENDING",
    situation: situationLine, seatMemo: seatMemoLine(driver), candidate, onAccept: acceptCandidate, onDecline: declineCandidate,
  };

  // ── 시나리오 (통합안 11.4) — 같은 핸들러를 부른다. 투어가 거짓 장면을 만들면 안 된다 ──
  const SCENARIOS: Record<ScenarioId, { title: string; steps: { title: string; say: string; run: () => void }[] }> = {
    K: { title: "K 첫 이용 · 프로필 없이", steps: [
      { title: "처음 탄 차", say: "처음 타면 '오늘은 누구와 함께 가시나요?' 하나만 묻습니다. 혼자 · 가족 · 동승자 — 공조·동승자·준비물을 묻지 않습니다.", run: () => { resetTrip("GUEST"); setChosen(false); } },
      { title: "프로필 없이 시작", say: "개인 설정 없이 시작합니다. '혼자 이동'이라고 추정하지 않습니다.", run: () => selectMode("GUEST") },
      { title: "첫 결과 — 충전이 필요한가", say: "출발 준비를 누르면 내비 경로로 충전이 필요한지부터 말합니다. 공조·준비물은 묻지 않습니다(설정이 없으니까).", run: () => startPrepare() },
      { title: "기록은 남기지 않음", say: "프로필 없이 한 이동은 기록에 남기지 않습니다 — 누구의 이동인지 모릅니다.", run: () => go("history") },
    ] },
    V: { title: "V 통합 결정 (V6 · 시연 데이터)", steps: [
      { title: "가족 장거리 출발 준비", say: "서울→부산, 어린이·반려견. 배터리는 시연 값, 충전기·시설도 시연 데이터입니다. 실제 공공 API 응답이 아닙니다.", run: () => { resetTrip("FAMILY"); setOrientation("portrait"); startPrepare(); } },
      { title: "결정 하나", say: "기존 에너지 엔진이 약 47% 부족을 내고, 그 위에서 도달 · 규격 · 상태 · 일행 조건을 순서대로 걸러 추천 하나와 대안을 냅니다. 우회 시간은 확인된 값이 없어 숫자를 쓰지 않습니다.", run: () => { setV6({ now: nowMs(), overrides: {}, feedFailed: false, rejected: [], notice: null, waypoint: IDLE_WAYPOINT }); go("home"); } },
      { title: "추천한 곳이 점검으로 바뀜 (시연)", say: "상태가 바뀌어 선택이 달라질 때만 다시 묻습니다. 무엇이 왜 바뀌었는지 새 판단이 적은 사실만 보여 줍니다.", run: () => updateV6({ overrides: { "MOCK0003/01": { stat: "5" }, "MOCK0003/02": { stat: "5" } } }) },
      { title: "승인 후 경유지 (모의 내비)", say: "사용자가 고른 뒤에만 보냅니다. 콜백과 목록 재조회가 맞아야 추가됐다고 말합니다. 여기는 모의 내비입니다.", run: () => { if (decision?.top) v6AddStop(decision.top); } },
      { title: "API 가 끊기면 (시연)", say: "충전소 정보가 끊겨도 Mission 과 에너지 판단은 그대로이고, 믿을 추천이 없다고 말합니다. 값을 지어내지 않습니다.", run: () => updateV6({ feedFailed: true }) },
      { title: "주행 중", say: "비교 화면과 버튼은 사라지고 한 줄만 남습니다.", run: () => { updateV6({ feedFailed: false }); drive(); } },
    ] },
    W: { title: "대표 1 · 업무일 하루", steps: [
      { title: "업무 프로필 · 저장한 공조 같음", say: "충전이 필요 없는 평범한 업무일입니다. 공조는 이미 저장한 21°C 라 묻지 않습니다. 출발 준비에 남은 것은 준비물 하나뿐입니다.", run: () => { resetTrip("WORK"); setHvacC(21); startPrepareSoon(2); } },
      { title: "준비물만 확인", say: "저장 취향(21°C · 통풍시트)과 차량 설정이 맞아 묻지 않습니다. 남은 건 준비물 하나 — '모두 챙겼어요' 한 번이면 '출발하세요'. 완료 버튼을 누르라고 하지 않습니다.", run: () => { go("home"); packAll(); } },
      { title: "출발 — 조용히", say: "주행 중 화면은 작은 한 줄입니다. 문제가 없으니 음성도 없습니다.", run: () => { go("home"); drive(); } },
      { title: "고객사 도착", say: "주차하면 하차 준비를 할지 묻습니다. 왕복이라 귀가가 남아 있습니다.", run: () => { jumpTo(legTotalKm - 0.2); park(); go("home"); } },
      { title: "중간 하차 확인", say: "노트북·업무 자료·방문 목적·다음 일정 메모를 확인합니다.", run: () => { startFinish(); setChecked(PROFILE_PRESETS.WORK.finishChecklist); } },
      { title: "방문 중", say: "차량은 '주차', 여정은 '방문 중' — 차를 두고 다녀옵니다. 귀가 38km 와 귀로 에너지를 기억합니다.", run: () => complete() },
      { title: "미팅이 1시간 길어짐", say: "차를 두고 다녀오는 대기라 에너지 판단이 바뀌지 않습니다 — 알리지 않습니다.", run: () => changeWait(60) },
      // 외부 평가 4(2026-10-27)의 60초 대표 시연 — "차 안에서 기다리면" 공조 소비를 넣어 다시 센다. 귀가 구간은 대기 0 이라 되돌릴 필요가 없다(trip.remainingPlan)
      { title: "차 안에서 기다리기로", say: "비가 와서 차 안에서 공조를 켜고 기다리기로 바꿉니다. 대기 시간만큼 공조가 쓸 배터리를 넣어 귀가 에너지를 다시 셉니다 — 그래도 충분하면 판단은 그대로, 바뀌면 알립니다.", run: () => { setWaitMode("IN_CAR"); go("energy"); } },
      { title: "귀가 출발", say: "고객사를 떠나면 귀가 구간이 됩니다. 주행 중 화면은 여전히 조용합니다.", run: () => drive() },
      { title: "집 도착", say: "집에 주차했습니다. 이번이 마지막 구간이라 하차 확인을 마치면 하루가 끝납니다.", run: () => { jumpTo(legTotalKm - 0.2); park(); go("home"); } },
      { title: "최종 하차 확인", say: "고객사에서 확인한 것을 그대로 쓰지 않고 다시 확인합니다.", run: () => { startFinish(); setChecked(PROFILE_PRESETS.WORK.finishChecklist); } },
      { title: "하루 끝 · 기록", say: "이동을 마칩니다. 하루 동안 앱이 먼저 물은 것은 하차 확인 두 번뿐입니다(세션 테스트로 고정).", run: () => { complete(); go("history"); } },
    ] },
    A: { title: "대표 2 · 가족 장거리", steps: [
      { title: "탑승 · 가족 프로필", say: "가족 프로필(어린이·반려견, 수동 설정)로 출발 준비를 시작합니다. 차는 P 단 · 모의 값입니다.", run: () => { resetTrip("FAMILY"); setOrientation("portrait"); } },
      { title: "출발 준비 시작", say: "에너지 부족은 위험 등급이라 주요 제안이 됩니다. 공조 맞추기는 지금 단계의 할 일이라 '함께 준비할 것'으로 옆에 나옵니다.", run: () => startPrepare() },
      { title: "저장 취향과 비교", say: "가족 조합의 저장 취향(23°C · 공조 켬 · 밝은 조명 · 아이들 노래)과 지금 차량 설정을 비교합니다. 다른 것만 '한 번에 적용'으로 묶고, 조명처럼 값을 못 읽는 건 '차량에서 직접', 음악은 기억만 합니다.", run: () => go("home") },
      { title: "승인 하나로 적용 (모의)", say: "승인 직전에 Safety Gate 를 다시 돌리고 보냅니다. 결과는 항목마다 따로 — 콜백 값이 맞은 것만 '적용 확인(모의)'. 실제 차량에서 된다는 뜻이 아닙니다.", run: () => applyCabin() },
      { title: "준비물", say: "아이 간식·기저귀 가방·반려견 용품 — '모두 챙겼어요' 한 번.", run: () => packAll() },
      { title: "에너지 판단 (쉼표 DRIVE)", say: "도착 후 40분 대기까지 세면 약 47% 부족 — 쉼표 DRIVE 엔진이 낸 같은 판단입니다.", run: () => go("energy") },
      { title: "동승자 조건 경유지", say: "어린이·반려견 조건을 반영한 후보입니다. 1위를 경유지로 넘깁니다 — 사용자가 고르고 콜백으로 확인합니다.", run: () => { go("stops"); if (ranked[0] && waypoints.length === 0) addStop(ranked[0].stop); } },
      { title: "주행 — 한 줄 화면", say: "출발하면 설정 화면은 사라지고 한 줄 + 음성만 남습니다. 공조·프로필 변경은 막힙니다.", run: () => drive() },
      { title: "경유지 충전", say: "경유지에 도착해 P 로 주차했습니다(정지만으로는 주차로 보지 않습니다). 홈에 충전 카드가 뜨고, 단계는 '중간 정차'입니다.", run: () => { stop(); if (nextWaypoint) jumpTo(nextWaypoint.routeKm); setGear("PARK"); setParkingBrake(true); setV((s) => ({ ...s, speedKmh: 0 })); go("home"); } },
      { title: "재출발 · 곧 도착", say: "충전 뒤 재출발해 목적지 3km 앞입니다. 단계가 '곧 도착'으로 바뀌고, 도착 안내는 덜 중요해서 정차까지 보류됩니다.", run: () => resumeAfterCharge(plan.routeKm - 2.5) },
      { title: "목적지 주차", say: "목적지에 주차했습니다. 하차 화면을 저절로 열지 않고, 하차 준비를 할지 묻습니다.", run: () => { jumpTo(plan.routeKm - 0.2); park(); go("home"); } },
      { title: "하차 체크리스트", say: "아이 준비물·유모차·반려동물 용품까지. 도어 상태는 조회 가능한 값만 보여 주고 '직접 확인'을 요청합니다.", run: () => { startFinish(); setChecked(profile.finishChecklist); } },
      { title: "이동 완료", say: "사용자 확인 기록으로 이동을 마칩니다 — 센서 판정이 아닙니다. 기록 화면에 전 과정이 남습니다.", run: () => { complete(); go("history"); } },
    ] },
    B: { title: "B 업무 이동", steps: [
      { title: "업무 프로필", say: "업무 프로필: 광화문 고객사 왕복, 도착 후 90분 대기.", run: () => { resetTrip("WORK"); startPrepareSoon(2); } },
      { title: "준비물", say: "노트북·출입증·발표 자료를 확인합니다.", run: () => { go("prepare"); setPacked(PROFILE_PRESETS.WORK.packing); } },
      { title: "왕복 에너지", say: "왕복 + 90분 대기에도 충분합니다 — 충전하지 않아도 된다는 판단이 곧 결과입니다.", run: () => go("energy") },
      { title: "출발", say: "충전 제안 없이 출발합니다.", run: () => drive() },
      { title: "고객사 도착 · 주차", say: "고객사에 주차했습니다. 업무용 하차 체크리스트를 제안합니다. 왕복이라 귀가가 남아 있습니다.", run: () => { jumpTo(legTotalKm - 0.2); park(); go("home"); } },
      { title: "업무 체크리스트", say: "노트북·업무 자료·방문 목적·다음 일정 메모.", run: () => { startFinish(); setChecked(PROFILE_PRESETS.WORK.finishChecklist); } },
      { title: "하차 확인 → 대기 중", say: "하차 확인을 마쳐도 여정은 끝나지 않습니다. '대기 중 · 귀가 남음'이 되고 귀로 에너지는 그대로 남습니다.", run: () => complete() },
    ] },
    C: { title: "C 권한 제한", steps: [
      { title: "제어 권한 거부", say: "CONTROL_CAR_CLIMATE 가 거부된 차량입니다.", run: () => { resetTrip("FAMILY"); setPermClimate("NO"); startPrepareSoon(1); } },
      { title: "안내만", say: "저장 온도와 다르지만 공조는 '제어 권한 없음 · 차량에서 직접'으로 빠지고, 시트처럼 권한 있는 항목만 적용 후보에 남습니다. 성공한 척 값을 바꾸지 않습니다.", run: () => go("home") },
      { title: "다른 기능은 정상", say: "에너지 판단·경유지 추가는 그대로 됩니다.", run: () => go("energy") },
    ] },
    D: { title: "D 주행 중 제한", steps: [
      { title: "주차 중 프로필 편집", say: "주차 중에는 프로필을 고칠 수 있습니다.", run: () => { resetTrip("FAMILY"); startPrepareSoon(1); go("profile"); } },
      { title: "주행 전환", say: "기어 D · 주행 — CarUxRestrictions 가 켜지고 편집 화면은 즉시 한 줄 화면으로 바뀝니다.", run: () => drive() },
      { title: "다시 주차", say: "P 로 주차하면 보던 프로필 화면이 돌아옵니다.", run: () => park() },
    ] },
    E: { title: "E 에너지 재판단", steps: [
      { title: "업무 이동 · 배터리 45%", say: "왕복 + 90분 미팅. 미팅은 차를 두고 다녀오는 대기라 대기 소비는 0 으로 봅니다(가정) — 충분합니다.", run: () => { resetTrip("WORK", { battery: 45 }); startPrepareSoon(2); go("energy"); } },
      { title: "출발", say: "충전 없이 출발합니다.", run: () => drive() },
      { title: "미팅이 길어짐 · 대기 +120분", say: "대기가 210분이 됐지만 차를 두고 다녀오는 대기라 에너지 판단은 그대로입니다. 바뀌지 않은 것은 알리지 않습니다.", run: () => changeWait(120) },
      { title: "고객사 도착 · 주차", say: "고객사에 주차했습니다.", run: () => { jumpTo(legTotalKm - 0.2); park(); go("energy"); } },
      { title: "차 안에서 기다리기로", say: "비가 와서 차 안에서 공조를 켜고 기다리기로 했습니다. 고객사까지 오며 배터리가 줄어, 마지막으로 알린 판단과 비교해 '충분 → 부족(약 2%p)'으로 재판단합니다.", run: () => setWaitMode("IN_CAR") },
      { title: "그다음 선택지", say: "그대로 · 차를 두고 다녀오면 · 30분 줄이면을 같은 엔진으로 나란히 보여 줍니다. 차 안 대기는 약 120분까지 충전 없이 된다는 것도. 앱은 아무것도 바꾸지 않습니다.", run: () => go("energy") },
    ] },
    F: { title: "F 액션 실패", steps: [
      { title: "응답 없는 차량", say: "제어 결과를 '응답 없음'으로 둡니다. (단건 공조 흐름의 재조회·재시도 규칙 — 상세 화면 '출발 준비')", run: () => { resetTrip("FAMILY"); setControlMode("TIMEOUT"); startPrepareSoon(1); go("prepare"); } },
      { title: "승인", say: "사용자가 23°C 적용을 승인합니다.", run: () => requestClimate() },
      { title: "응답 없음 → 다시 읽기", say: "응답이 없으면 실패가 아니라 '모름'입니다. 실제 값을 다시 읽어 25°C 그대로임을 확인한 뒤에야 '다시 시도'가 열립니다 — 그전에 다시 보내면 명령이 두 번 갑니다.", run: () => confirmClimate() },
      { title: "늦게 적용되는 차량", say: "이번에는 응답이 늦게 오는 차량입니다. 다시 시도를 누릅니다.", run: () => { setControlMode("LATE"); requestClimate(); } },
      { title: "늦은 콜백 반영", say: "타임아웃 뒤에 온 콜백이 이번 요청의 것이라 성공으로 반영합니다(지난 요청의 콜백이었다면 무시합니다).", run: () => confirmClimate() },
    ] },
    G: { title: "G 출퇴근 · 제안 없음", steps: [
      { title: "혼자 출근 · 준비 끝난 차", say: "혼자 출근하는 날입니다. 공조는 이미 저장한 22°C, 배터리는 충분합니다. 비서는 아무것도 묻지 않습니다 — 그게 정상입니다.", run: () => { resetTrip("SOLO"); setHvacC(22); startPrepareSoon(1); } },
      { title: "출발", say: "주행 화면은 '충전 없이 충분해요' 한 줄입니다. 음성도 없습니다.", run: () => drive() },
      { title: "회사 도착 · 주차", say: "도착해 주차했습니다. 확인할 하차 항목이 없으니 하차 준비를 묻지 않고 '이동 마치기'만 둡니다.", run: () => { jumpTo(legTotalKm - 0.2); park(); go("home"); } },
      { title: "이동 마치기", say: "이동을 마칩니다. 기록에 한 줄만 남습니다.", run: () => endTrip() },
    ] },
    H: { title: "H 고객사 방문 · 귀가", steps: [
      { title: "업무 이동 · 왕복", say: "고객사 왕복 + 90분 대기. 왕복이라 여정은 두 구간입니다.", run: () => { resetTrip("WORK"); setHvacC(21); startPrepareSoon(2); } },
      { title: "출발", say: "가는 길입니다.", run: () => drive() },
      { title: "고객사 주차", say: "고객사에 주차했습니다. 하차 준비를 묻고, '내리지 않고 기다리기'·'여정 끝내기'도 고를 수 있습니다.", run: () => { jumpTo(legTotalKm - 0.2); park(); go("home"); } },
      { title: "중간 하차 확인", say: "업무 준비물을 확인합니다. 귀가가 남아 있어 '확인 완료 · 대기 시작'입니다.", run: () => { startFinish(); setChecked(PROFILE_PRESETS.WORK.finishChecklist); } },
      { title: "방문 중 · 귀가 남음", say: "여정은 끝나지 않았습니다. 차는 '주차', 사람은 '방문 중'(차를 두고 다녀옴) — 둘을 따로 보여 줍니다. 귀로 에너지는 그대로 남아 있습니다.", run: () => complete() },
      { title: "차 안에서 기다리면?", say: "대기 유형을 '차 안에서'로 바꾸면 공조가 대기 시간만큼 배터리를 씁니다. 이 차는 그래도 충분 — 에너지 화면에 차 안 대기 한계를 적습니다.", run: () => { setWaitMode("IN_CAR"); go("energy"); } },
      { title: "다시 차를 두고", say: "다시 '차를 두고 다녀옴'으로 돌립니다.", run: () => { setWaitMode("AWAY"); go("home"); } },
      { title: "30분 대기", say: "시연 시계를 30분 돌립니다. 남은 대기가 그만큼 줄어듭니다.", run: () => { setSimMin((m) => m + 30); setWaitedMin((w) => w + 30); } },
      { title: "귀가 출발", say: "고객사를 떠나면 귀가 구간이 됩니다. 남은 에너지를 돌아오는 길만으로 다시 셉니다.", run: () => drive() },
      { title: "집 도착 · 주차", say: "집에 주차했습니다. 이번이 마지막 구간이라 하차 확인을 마치면 이동이 끝납니다.", run: () => { jumpTo(legTotalKm - 0.2); park(); go("home"); } },
      { title: "최종 하차 확인", say: "다시 확인합니다 — 고객사에서 확인한 것을 그대로 쓰지 않습니다.", run: () => { startFinish(); setChecked(PROFILE_PRESETS.WORK.finishChecklist); } },
      { title: "이동 완료", say: "이동을 마칩니다. 기록 화면에 이동 요약이 남습니다.", run: () => { complete(); go("history"); } },
    ] },
    I: { title: "I 프로필 전환 · 격리", steps: [
      { title: "가족 이동 준비", say: "가족 프로필로 준비합니다. 준비물 두 개를 확인하고 실내 설정은 그대로 두기로 합니다.", run: () => { resetTrip("FAMILY"); startPrepareSoon(1); go("home"); } },
      { title: "준비 내용 기억", say: "이번 이동에서 기억하는 것: 준비물 2개, 실내 설정 그대로.", run: () => { setPacked(PROFILE_PRESETS.FAMILY.packing.slice(0, 2)); keepCabin(); go("history"); } },
      { title: "업무로 바꿈", say: "운전자가 바뀌어 업무 프로필로 바꿉니다. 가족의 준비물·동승자·거절 기록이 남지 않고, 기록도 업무 것만 보입니다.", run: () => { selectMode("WORK"); go("history"); } },
      { title: "업무 출발 준비", say: "준비물은 업무용으로 바뀌고, 실내 취향은 업무 조합(21°C · 통풍시트 · 최소 안내)과 비교합니다.", run: () => go("home") },
      { title: "업무로 출발", say: "업무 프로필로 출발합니다.", run: () => drive() },
      // 출발한 뒤의 상태로 눌러야 한다 — 같은 단계에서 타이머로 부르면 출발 전 상태를 들고 있어 검사를 빠져나간다
      { title: "주행 중 전환 시도", say: "출발한 뒤에는 프로필을 바꿀 수 없습니다 — 남의 준비물·동승자 조건이 섞입니다.", run: () => selectMode("FAMILY") },
    ] },
    P: { title: "P 픽업 후 귀가 (Mission C)", steps: [
      { title: "픽업 Mission 선택", say: "가족 맥락의 둘째 조합 '아이 픽업 후 귀가'. 학원까지 12km, 차 안에서 20분 대기(저장된 계획), 집으로 12km — 왕복 2구간이 하나의 Mission 입니다.", run: () => { resetTrip("PICKUP"); setDriverId("mom"); startPrepareSoon(2); } },
      { title: "출발 준비 · 머리줄", say: "맨 위에 Mission 의 목적과 단계('픽업 후 귀가 · 출발 준비')와 '귀가 집 유지'가 보입니다. 가족 취향과 차량 설정을 비교해 다른 것만 제안합니다.", run: () => go("home") },
      { title: "출발", say: "주행 중엔 한 줄뿐입니다.", run: () => drive() },
      { title: "학원 도착 · 주차", say: "픽업 장소에 주차했습니다. Mission 은 '도착'이지 완료가 아닙니다 — 귀가 구간이 남아 있습니다.", run: () => { jumpTo(legTotalKm - 0.2); park(); go("home"); } },
      { title: "차 안에서 기다리기", say: "내리지 않고 기다립니다. 차는 '주차', Mission 은 '차 안에서 대기'. 대기 중 공조 소비는 저장된 20분(저장된 계획)으로 셉니다 — 추정이 아닙니다.", run: () => startWait() },
      { title: "귀가 일정 확인", say: "대기 중에 '방문을 마치셨나요? · 귀가 일정이 남아 있어요 · 다음 이동: 집으로 · 확인하면 집으로 안내 시작으로 요청할 수 있어요'를 한 번 묻습니다(결정 등급). 확인은 Mission 이 귀가 일정을 기억한다는 표시일 뿐 — 내비 경로는 아직 그대로라고 분명히 말하고, '집으로 안내 시작'(승인 → 요청 → 목적지 재조회)으로 잇습니다.", run: () => readyNextLeg() },
      { title: "앱 재시작 · 복원", say: "앱이 꺼졌다 켜져도 확인된 Mission 상태(대기 중 · 귀가 일정 확인 · 경로 요청 전)를 이어서 갑니다. 진행 중이던 제어 요청은 복원하지 않습니다.", run: () => { const s = loadMission(); if (restorable(s)) restoreSnapshot(s); } },
      { title: "집으로 안내 시작 (모의 내비)", say: "한 번 누르면 내비에 저장된 집 즐겨찾기로 경로를 요청합니다. 기존 경로가 있으면 무엇이 바뀌는지 먼저 묻고, 목적지를 다시 읽어 집과 맞아야 '확인됨'입니다 — 웹은 모의 내비라 결과에 (모의)가 붙습니다.", run: () => startRouteHome() },
      { title: "귀가 출발", say: "차가 출발하면 귀가 구간이 됩니다. 남은 에너지는 돌아오는 길만으로 다시 셉니다.", run: () => drive() },
      { title: "집 도착 · 주차", say: "마지막 구간입니다. 하차 확인을 마치면 Mission 이 완료됩니다.", run: () => { jumpTo(legTotalKm - 0.2); park(); go("home"); } },
      { title: "하차 확인 · 완료", say: "아이 가방까지 확인하고 마칩니다. 기록에 하나의 Mission 으로 남습니다.", run: () => { startFinish(); setChecked(profile.finishChecklist); setTimeout(() => complete(), 0); } },
    ] },
    J: { title: "J 연결 끊김 · 복구", steps: [
      { title: "가족 이동 출발", say: "출발했습니다. 주행 화면은 충전 계획이 필요하다고 말합니다.", run: () => { resetTrip("FAMILY"); startPrepareSoon(1); setTimeout(() => drive(), 50); } },
      { title: "차량 연결 끊김", say: "차량 데이터 연결이 끊겼습니다. 끊기기 전 값으로 판단하지 않고 '차량 값을 기다리는 중'으로 바꿉니다. 제안과 제어도 멈춥니다.", run: () => setLinkLive(false) },
      { title: "끊긴 사이 상황이 바뀜", say: "끊긴 사이 60km 를 더 달렸고 외기가 −7°C 로 떨어졌습니다(시뮬레이터 세계에서만 — 앱은 모릅니다).", run: () => { stop(); jumpTo(traveledKm + 60); setV((s) => ({ ...s, outsideTempC: -7, hvacOn: true })); } },
      { title: "주차 — 그래도 모름", say: "주차했지만 앱은 기어를 모르니 단계를 바꾸지 않고, 주행 제한도 풀지 않습니다(보수적).", run: () => park() },
      { title: "배터리 연결만 먼저 복구", say: "배터리 연결만 돌아왔습니다. 에너지는 필수 입력(배터리)이 신선하니 다시 판단합니다 — 끊긴 사이 거리·외기온·히터가 함께 바뀌어 원인을 하나로 말하지 않습니다. 주행 신호는 아직 모르니 기어·주행 제한은 그대로 보수적입니다.", run: () => setLinkOf(["ENERGY"], true) },
      { title: "주행 신호·공조 연결 복구", say: "나머지 연결이 돌아오면 그제야 주차 상태를 알고 단계를 바꿉니다. 에너지는 다시 판단하지 않습니다(입력이 안 바뀌었으니까).", run: () => setLinkOf(["DRIVE", "CABIN"], true) },
    ] },
  };
  /** 충전 기록 → 재출발 → km 지점까지. jumpTo 는 지금 경유지에서 멈추므로(그게 맞다) 충전 직후에는 따로 센다 */
  function resumeAfterCharge(km: number) {
    const wp = atWaypoint;
    if (!wp) return;
    const after = Math.max(CHARGE_TARGET_PCT, v.batteryPct);
    const d = Math.max(km - wp.routeKm, 0), minutes = Math.round((d / 80) * 60);
    charge();
    setGear("DRIVE"); setParkingBrake(false); setTraveledKm(km); setSimMin((m) => m + minutes);
    setV((s) => ({ ...s, speedKmh: 80, batteryPct: Math.max(after - d * pctPerKm(s), 0), tripMinutes: minutes }));
  }
  /** 리셋 직후의 출발 준비 — 리셋한 state 가 반영된 다음 렌더에서 눌러야 단계가 맞다 */
  function startPrepareSoon(legs: number) { setTimeout(() => setJourney((j) => withLegs(nextJourney(j, { ...signals, gear: "PARK", speedKmh: 0 }, "START_PREPARE"), legs)), 0); }

  const runStep = (id: ScenarioId, idx: number) => { setTour({ id, idx }); SCENARIOS[id].steps[idx].run(); };
  const step = tour ? SCENARIOS[tour.id].steps[tour.idx] : null;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <span className="bg-warn/15 text-warn rounded-md px-2 py-1 text-xs font-semibold">발표용 시뮬레이터 · 차량 셸 전체가 Mock · 앱은 가운데 앱 창만 · 차량 값·제어 결과는 시연 데이터</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Seg options={[{ v: "portrait", label: "기본 앱 창 · 세로 840", icon: RectangleVertical }, { v: "landscape", label: "확장 앱 창 · 가로 1700", icon: RectangleHorizontal }]} value={orientation} onChange={setOrientation} />
          <Seg options={[{ v: "dark", label: "다크", icon: Moon }, { v: "light", label: "라이트", icon: Sun }]} value={theme} onChange={setTheme} />
          <button type="button" onClick={() => setDev((x) => !x)} aria-pressed={dev} className={cn("h-8 rounded-lg px-2.5 text-xs font-semibold", dev ? "bg-accent text-white" : "bg-surface-2 hover:bg-line")}>개발자 정보</button>
        </div>
      </div>

      <div className="no-print flex flex-wrap items-center gap-1.5">
        <span className="text-muted mr-1 text-xs">시나리오</span>
        {SCENARIO_ORDER.map((id) => (
          <button key={id} type="button" onClick={() => runStep(id, 0)} className={cn("h-8 rounded-lg px-2.5 text-xs font-semibold", tour?.id === id ? "bg-accent text-white" : "bg-surface-2 hover:bg-line")}>{SCENARIOS[id].title}</button>
        ))}
      </div>

      {tour && step && (
        <div className="no-print border-accent/40 bg-accent/10 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
          <span className="bg-accent shrink-0 rounded-md px-2 py-0.5 text-xs font-bold text-white">{SCENARIOS[tour.id].title} · {tour.idx + 1}/{SCENARIOS[tour.id].steps.length}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{step.title}</p>
            <p className="text-muted text-xs leading-relaxed">{step.say}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" disabled={tour.idx === 0} onClick={() => runStep(tour.id, tour.idx - 1)} className="bg-surface-2 hover:bg-line flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold disabled:opacity-40"><ChevronLeft className="size-3.5" /> 이전</button>
            {tour.idx < SCENARIOS[tour.id].steps.length - 1
              ? <button type="button" onClick={() => runStep(tour.id, tour.idx + 1)} className="bg-accent hover:bg-accent-strong flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-white">다음 <ChevronRight className="size-3.5" /></button>
              : <button type="button" onClick={() => setTour(null)} className="bg-accent hover:bg-accent-strong flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-white">끝내기</button>}
            <button type="button" onClick={() => setTour(null)} aria-label="시나리오 닫기" className="text-muted hover:text-text flex size-8 items-center justify-center rounded-lg"><X className="size-4" /></button>
          </div>
        </div>
      )}

      <div className="shell-stage">
        <CopilotShell
          orientation={orientation} theme={theme}
          speedKmh={Math.round(v.speedKmh)} gear={gear === "PARK" ? "P" : "D"} batteryPct={Math.round(v.batteryPct)} rangeKm={rangeKm} outsideTempC={v.outsideTempC} clock={clock}
          neighbor={<CopilotNav traveledKm={traveledKm} routeKm={legTotalKm} waypoints={nextWaypoint || journey.leg === 0 ? waypoints.map((w) => ({ name: w.name, routeKm: w.routeKm })) : []} destination={legDestination} speedKmh={v.speedKmh} clock={clock} />}
        >
          {shown === "drive" && <CopilotDrivingScreen line={drive_} voice={voice} socPct={liveSoc === null ? null : Math.round(liveSoc)} decisionLine={decision ? (() => { const s = decisionSurface(decision, false); return s.kind === "ONE_LINE" ? s.line : null; })() : null} />}
          {shown === "home" && <HomeScreen profile={profile} phase={journey.phase} mission={homeMission}
            chooser={chosen ? null : { names: { SOLO: profiles.SOLO.name, FAMILY: profiles.FAMILY.name, WORK: profiles.WORK.name, PICKUP: profiles.PICKUP.name, COMPANION: profiles.COMPANION.name, GUEST: profiles.GUEST.name }, remembered: lastTripFor(vault, driverId),
              drivers: DEMO_DRIVER_IDS.map((id) => vault.drivers[id]).filter(Boolean), driver: driverId, onDriver: setDriverId, onChoose: chooseAndPrepare }}
            status={st} situation={situation}
            prepare={journey.phase === "PREPARING" ? homePrepare : null}
            top={suggestions.top} companions={suggestions.companions} inboxCount={suggestions.inbox.length} orientation={orientation} atWaypoint={atWaypoint?.name ?? null}
            guestDone={profile.mode === "GUEST" && journey.phase === "COMPLETED"}
            decision={decision && v6 ? <DecisionCard decision={decision} vehicle={v6Input(v6).vehicle} notice={v6.notice} waypoint={v6.waypoint} parked={gear === "PARK" && !restricted} onAdd={v6AddStop} onReject={(c) => updateV6({ rejected: [...v6.rejected, c.stopId], waypoint: IDLE_WAYPOINT })} /> : null}
            trip={{
              canStartWait: journey.phase === "PARKED" && journey.atDestination && !isLastLeg(journey),
              canEndTrip: journey.phase === "WAITING" || (journey.phase === "PARKED" && journey.atDestination && !isLastLeg(journey)),
              // 확인할 하차 항목이 없는 최종 도착 — 묻지 않고, 마칠 수 있는 버튼만 둔다
              canFinishQuietly: journey.phase === "PARKED" && journey.atDestination && isLastLeg(journey) && profile.finishChecklist.length === 0,
              waiting: journey.phase === "WAITING" ? {
                title: `${plan.destinationName.replace(" (왕복)", "")} ${st.tripLabel}`,
                line: `${waitedMin}분 지남 · 귀가 ${plan.returnKm ?? 0}km 남음 · ${ev.headline}`,
                mode: waitMode,
              } : null,
              route: journey.phase === "WAITING" && nextLegReady && (plan.returnKm ?? 0) > 0
                ? { state: handoff, onStart: startRouteHome, onConfirmReplace: confirmRouteReplace, onCancel: () => handoffStep(handoff, { type: "CANCEL" }) } : null,
            }}
            onStartWait={startWait} onEndTrip={endTrip} onStartFinish={startFinish} onSetWaitMode={setWaitMode}
            onPrimary={onPrimary} onDismiss={onDismiss} onStartPrepare={startPrepare} onCharge={charge} onGo={go} side={<DetailSide top={suggestions.top} sources={sources} />} />}
          {shown === "detail" && <DetailScreen top={suggestions.top} inbox={suggestions.inbox} sources={sources} audit={suggestions.audit} orientation={orientation} onReactivate={(s) => setHistory((h) => reactivate(h, s.type))} onBack={() => go("home")} onGo={go} />}
          {shown === "profile" && <ProfileScreen profiles={profiles} mode={mode} orientation={orientation} onSelect={selectMode} onChange={changeProfile} onReset={wipe} onEditChecklist={editChecklist} />}
          {shown === "prepare" && <PrepareScreen profile={profile} targetC={prefs.hvacTempC} currentC={hvacReadable && cabinLive ? hvacC : null} gate={climateGate} action={action}
            packed={packed} status={prep} prepareDone={memory.prepareDone} orientation={orientation}
            onRequest={requestClimate} onConfirm={confirmClimate} onKeep={cancelClimate} onTogglePack={toggle(setPacked)} onGoEnergy={() => go("energy")} onFinish={finishPrepare} onSkip={skipPrepare} />}
          {shown === "energy" && <CopilotEnergyScreen view={ev} assumptions={energy.assumptions} options={options} waitLimit={waitLimit} rejudge={energyUsable ? rejudge : null} missing={energyMissing} basis={energyBasisLabel}
            wait={waitLeft > 0 ? { minutes: waitLeft, mode: waitMode } : null} canPickWait={!restricted} showStops={!isWait} orientation={orientation}
            onSetWaitMode={setWaitMode} onShowStops={() => go("stops")} />}
          {shown === "stops" && <CandidatesScreen ranked={ranked} needsCharge={energy.needsCharge} excluded={excludedStops} onAddStop={addStop} addingId={addingId} waypoints={waypoints.length} slots={WAYPOINT_SLOTS} orientation={orientation}
            breakdownOf={breakdownOf} chargeMinutesOf={chargeMinutesOf} selectedId={waypoints[0]?.id ?? null} emptyText={isWait ? "왕복 이동입니다 — 경로상 휴게소 대신, 모자라면 출발 전 충전을 권합니다" : undefined} />}
          {shown === "finish" && <FinishScreen profile={profile} phase={journey.phase} checked={checked} door={cabinLive ? { ...door, source: "MOCK", readAt: clock } : { ...door, readable: false }} orientation={orientation} finalLeg={isLastLeg(journey)} stopover={!journey.atDestination}
            summary={{ km: Math.round(traveledKm), stops: chargedAt, arrivalPct: Math.round(v.batteryPct) }}
            canComplete gateMessage={finishGate.allowed ? null : finishGate.message} note={finishNote(profile, checked)}
            onToggle={toggle(setChecked)}
            onComplete={complete} onStart={() => { startPrepare(); go("home"); }} />}
          {shown === "history" && <HistoryScreen entries={chosen ? activityOf(vault, mode) : []} memory={chosen && memory.tripId > 0 ? memory : null} profileName={chosen ? profile.name : null} legs={journey.legs} />}
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ bottom: u(144) }}><Toast toast={toast} /></div>
        </CopilotShell>
      </div>

      {dev && <div className="no-print text-muted flex flex-wrap items-center justify-between gap-2 text-xs">
        <span><span className="bg-surface-2 mr-1.5 rounded px-1.5 py-0.5 font-semibold">개발자</span>여정 단계 <strong className="text-text">{PHASE_LABEL[journey.phase]}</strong>{journey.phase === "PARKED" ? (journey.atDestination ? " · 목적지" : " · 중간 정차") : ""} · 움직임 {motion.kind} ({motion.confidence}) · 주행 제한 {restricted ? "켜짐" : "꺼짐"}</span>
        <span>시연 시계 {clock} · 제안 {suggestions.top ? `${suggestions.top.type} ${suggestions.top.priority}` : "없음"} · 대기 {waitMode} · 준비 {prep.done}/{prep.needs}/{prep.unsupported}</span>
      </div>}

      <nav aria-label="화면 목록" className="no-print grid grid-cols-4 gap-2 lg:grid-cols-7">
        {COPILOT_SCREENS.map((s) => (
          <button key={s.id} type="button" onClick={() => go(s.id)} aria-current={shown === s.id ? "page" : undefined}
            className={cn("rounded-xl border px-3 py-2 text-left transition-colors", shown === s.id ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-muted")}>
            <p className="text-sm font-semibold leading-tight">{s.title}</p>
            <p className="text-muted mt-1 hidden text-xs leading-snug xl:block">{s.hint}</p>
          </button>
        ))}
      </nav>

      <div className="no-print grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel title="주행 · 기어 (AAOS · Vehicle Gear, 모의)">
          <div className="flex items-end justify-between">
            <div><p className="text-muted text-xs">진행</p><p className="text-2xl font-bold tabular-nums">{Math.round(traveledKm)}<span className="text-sm">km</span> <span className="text-muted text-sm">/ {legTotalKm}km{journey.legs > 1 ? (journey.leg === 0 ? " · 가는 길" : " · 귀가") : ""}</span></p></div>
            <p className="text-muted text-right text-xs">남은 {Math.round(remainingKm * 10) / 10}km</p>
          </div>
          <input type="range" min={0} max={legTotalKm} value={traveledKm} onChange={(e) => jumpTo(Number(e.target.value))} className="accent-accent w-full" aria-label="진행 거리" />
          <div className="grid grid-cols-3 gap-2">
            <Btn tone="accent" onClick={playing ? stop : drive}>{playing ? <><Pause className="size-4" /> 정지</> : <><Play className="size-4" /> 주행</>}</Btn>
            <Btn tone={gear === "PARK" ? "accent" : "default"} onClick={park}>P 주차</Btn>
            <Btn onClick={() => jumpTo(legTotalKm - 2.5)}>목적지 3km 앞</Btn>
          </div>
          <label className="flex items-center justify-between text-sm"><span>차량 데이터 연결{allLive ? "" : " · 일부 끊김"}</span><input type="checkbox" checked={allLive} onChange={(e) => setLinkLive(e.target.checked)} className="accent-accent size-4" aria-label="차량 데이터 연결" /></label>
          <label className="flex items-center justify-between text-sm"><span>배터리 조회 실패 (VehicleListener.onFailed · 연결은 그대로)</span><input type="checkbox" checked={signalStatus.SOC === "ERROR"} onChange={(e) => setSignalStatus((m) => ({ ...m, SOC: e.target.checked ? "ERROR" : "OK" }))} className="accent-accent size-4" aria-label="배터리 조회 실패" /></label>
          {/* 연결은 셋 — 부분 복구를 만들어 본다(외부 평가 7 A). 실제 앱: 주행 신호 AAOS · 배터리 Pleos EvBattery · 공조·도어 Pleos HVAC·Door */}
          <div className="grid grid-cols-3 gap-2">
            {LINK_KINDS.map((k) => (
              <label key={k} className="flex items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate">{LINK_LABEL[k]}{links[k].live ? "" : ` · ${links[k].lostAt}~`}</span><input type="checkbox" checked={links[k].live} onChange={(e) => setLinkOf([k], e.target.checked)} className="accent-accent size-4 shrink-0" aria-label={`${LINK_LABEL[k]} 연결`} /></label>
            ))}
          </div>
          {/* 전체 차량 대상(오너 결정 2026-10-28) — 동력원은 EV 만 에너지 판단, 나머지는 "지원 안 함 · 확인 전"으로 끄고 공통 기능은 그대로. 실제 앱의 동력원 판별 방법은 미확인 */}
          <Row label="동력원 (에너지 판단은 EV 만)">
            <Seg options={POWERTRAINS.map((p) => ({ v: p, label: POWERTRAIN_LABEL[p] }))} value={powertrain} onChange={setPowertrain} />
          </Row>
          <label className="flex items-center justify-between text-sm"><span>주차 브레이크 (AAOS PARKING_BRAKE_ON)</span><input type="checkbox" checked={parkingBrake} onChange={(e) => setParkingBrake(e.target.checked)} className="accent-accent size-4" /></label>
          <Row label="CarUxRestrictions">
            <Seg options={[{ v: "AUTO", label: "자동(P 아니면 제한)" }, { v: "RESTRICTED", label: "제한" }, { v: "UNRESTRICTED", label: "해제" }, { v: "UNKNOWN", label: "모름" }]} value={uxMode} onChange={setUxMode} />
          </Row>
        </Panel>

        <Panel title="프로필 · 일정">
          <div className="grid grid-cols-4 gap-2">
            {PROFILE_MODES.map((m) => <Btn key={m} tone={mode === m ? "accent" : "default"} onClick={() => selectMode(m)}>{profiles[m].name}</Btn>)}
          </div>
          <Btn tone={mode === "GUEST" ? "accent" : "default"} onClick={() => selectMode("GUEST")}>프로필 없이</Btn>
          <Row label={`대기 유형 · ${WAIT_MODE_LABEL[waitMode]}`}>
            <Seg options={[{ v: "AWAY", label: "차를 두고" }, { v: "IN_CAR", label: "차 안에서" }]} value={waitMode} onChange={setWaitMode} />
          </Row>
          <Row label={`도착 후 대기 ${plan.waitMinutesAfterArrival}분 · ${WAIT_SOURCE_LABEL[waitSource]}`}>
            <div className="grid grid-cols-2 gap-2">
              <Btn onClick={() => changeWait(-30)}>−30분</Btn>
              <Btn onClick={() => changeWait(30)}>+30분</Btn>
            </div>
          </Row>
          <Row label={`배터리 ${Math.round(v.batteryPct)}% · 외기 ${v.outsideTempC}°C`}>
            <input type="range" min={5} max={100} value={Math.round(v.batteryPct)} onChange={(e) => replan(plan, { ...v, batteryPct: Number(e.target.value) }, "배터리 변경")} className="accent-accent w-full" aria-label="배터리" />
          </Row>
          <div className="grid grid-cols-2 gap-2">
            <Btn onClick={() => replan(plan, { ...v, outsideTempC: -7, hvacOn: true }, "겨울 −7° · 히터")}>겨울 −7° · 히터</Btn>
            <Btn onClick={() => resetTrip(mode, { keepProfiles: true })}>여정 초기화</Btn>
          </div>
          <Btn onClick={() => { setSimMin((m) => m + 10); if (journey.phase === "WAITING") setWaitedMin((w) => w + 10); }}>시연 시계 +10분 (정차한 채{journey.phase === "WAITING" ? " · 대기 시간에 더함" : ""})</Btn>
          {/* 재시작 복원(지시서 4절 6) — 저장된 진행 중 Mission 을 되살린다. 완료·고르기 전이면 없다 */}
          <Btn onClick={() => { const s = loadMission(); if (restorable(s)) restoreSnapshot(s); else showToast("복원할 진행 중 이동이 없습니다 · 출발 준비 이후부터 저장됩니다"); }}>앱 재시작 — 저장한 Mission 복원</Btn>
        </Panel>

        <Panel title="공조 · 도어 (Vehicle HVAC · Door, 모의)">
          {/* 조작판의 공조·시트 변경 = 차에서 누군가 돌린 것을 콜백이 알려 준 상황을 연기(출처 MOCK · 시연 데이터) → 학습 관찰. 앱이 적용한 값은 관찰하지 않는다. 실차 콜백(VEHICLE)은 어댑터 배선 뒤 */}
          <Row label={`지금 공조 ${hvacC}°C`}><input type="range" min={16} max={30} value={hvacC} onChange={(e) => { const c = Number(e.target.value); setHvacC(c); observeCabin("HVAC_TEMP", c, "MOCK"); }} className="accent-accent w-full" aria-label="지금 공조 온도" /></Row>
          <Row label="운전자 (수동 · 공식 인식 API 없음)">
            <div className="grid grid-cols-3 gap-2">
              {DEMO_DRIVER_IDS.map((id) => <Btn key={id} tone={driverId === id ? "accent" : "default"} onClick={() => setDriverId(id)}>{vault.drivers[id]?.name ?? id}</Btn>)}
              <Btn tone={driverId === null ? "accent" : "default"} onClick={() => setDriverId(null)}>미확인</Btn>
            </div>
          </Row>
          <label className="flex items-center justify-between text-sm"><span>공조 온도 조회 가능 (CAR_CLIMATE)</span><input type="checkbox" checked={hvacReadable} onChange={(e) => setHvacReadable(e.target.checked)} className="accent-accent size-4" /></label>
          <Row label="차종 지원 · checkHvacTemperatureCapabilities"><Seg options={TRI} value={capHvac} onChange={setCapHvac} /></Row>
          <Row label="제어 권한 · CONTROL_CAR_CLIMATE"><Seg options={TRI} value={permClimate} onChange={setPermClimate} /></Row>
          <Row label="시트 제어 권한 · CONTROL_CAR_SEATS"><Seg options={TRI} value={permSeat} onChange={setPermSeat} /></Row>
          <div className="grid grid-cols-3 gap-2">
            <Btn tone={cabinNow.seatVent ? "accent" : "default"} onClick={() => { observeCabin("SEAT_VENT", !cabinNow.seatVent, "MOCK"); setCabinNow((c) => ({ ...c, seatVent: !c.seatVent })); }}>통풍시트 {cabinNow.seatVent ? "켬" : "끔"}</Btn>
            <Btn tone={cabinNow.seatHeat ? "accent" : "default"} onClick={() => { observeCabin("SEAT_HEAT", !cabinNow.seatHeat, "MOCK"); setCabinNow((c) => ({ ...c, seatHeat: !c.seatHeat })); }}>열선시트 {cabinNow.seatHeat ? "켬" : "끔"}</Btn>
            <Btn tone={cabinNow.lighting ? "accent" : "default"} onClick={() => setCabinNow((c) => ({ ...c, lighting: c.lighting === null ? "CALM" : c.lighting === "CALM" ? "BRIGHT" : null }))}>조명 {cabinNow.lighting === null ? "모름" : cabinNow.lighting === "CALM" ? "차분" : "밝음"}</Btn>
          </div>
          <Row label="제어 결과 (모의)"><Seg options={[{ v: "SUCCESS", label: "성공" }, { v: "PARTIAL", label: "일부만 성공" }, { v: "ERROR", label: "거절" }, { v: "TIMEOUT", label: "응답 없음" }, { v: "LATE", label: "늦게 적용" }, { v: "MISMATCH", label: "값 불일치" }, { v: "UNREADABLE", label: "읽기 불가" }]} value={controlMode} onChange={setControlMode} /></Row>
          <div className="grid grid-cols-3 gap-2">
            <Btn tone={door.readable ? "accent" : "default"} onClick={() => setDoor((d) => ({ ...d, readable: !d.readable }))}>도어 조회 {door.readable ? "됨" : "안 됨"}</Btn>
            <Btn onClick={() => setDoor((d) => ({ ...d, open: !d.open }))}>도어 {door.open ? "열림" : "닫힘"}</Btn>
            <Btn onClick={() => setDoor((d) => ({ ...d, locked: !d.locked }))}>{door.locked ? "잠김" : "안 잠김"}</Btn>
          </div>
        </Panel>

        <Panel title="내비 · NaviHelper (모의)">
          <label className="flex items-center justify-between text-sm"><span>내비 연결</span><input type="checkbox" checked={naviConnected} onChange={(e) => setNaviConnected(e.target.checked)} className="accent-accent size-4" /></label>
          <Row label="경유지 권한 · NAVI_ROUTE_SEARCH"><Seg options={TRI} value={permNavi} onChange={setPermNavi} /></Row>
          <ul className="text-muted space-y-1 text-xs">
            {waypoints.length === 0 ? <li>경유지 없음</li> : waypoints.map((w) => <li key={w.id} className="flex justify-between"><span className="text-text">{w.name}</span><span>{w.routeKm}km</span></li>)}
          </ul>
          <p className="text-muted text-xs leading-relaxed">경유지는 사용자가 고르고 콜백으로 확인합니다. 재판단이 나빠져도 기존 경유지는 바꾸지 않습니다.</p>
          <label className="flex items-center justify-between text-sm"><span>먼저 제안 (프로필)</span><input type="checkbox" checked={profile.proactive} onChange={(e) => changeProfile({ ...profile, proactive: e.target.checked })} className="accent-accent size-4" /></label>
        </Panel>
      </div>
    </div>
  );
}

/** 시나리오 버튼을 누른 시각 — 렌더 중에 시계를 읽지 않도록 모듈 함수로 둔다 */
const nowMs = () => Date.now();
type V6State = { now: number; overrides: Record<string, Record<string, string>>; feedFailed: boolean; rejected: string[]; notice: string | null; waypoint: WaypointState };
type ScenarioId = "V" | "W" | "A" | "P" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K";
type LinkState = { live: boolean; lostAt: string | null };
const ALL_LIVE: Record<LinkKind, LinkState> = { DRIVE: { live: true, lostAt: null }, ENERGY: { live: true, lostAt: null }, CABIN: { live: true, lostAt: null } };
/** 시연의 신호 상태 — 내비 경로만 "받은 적 없음"(NaviHelper 연결 전) */
const ALL_OK: Record<SignalKind, SignalStatus> = { GEAR: "OK", UX: "OK", SPEED: "OK", SOC: "OK", HVAC: "OK", DOOR: "OK", ROUTE: "NONE", PROFILE: "OK" };
// 대표 시연 둘이 먼저 — 1: 비서 정체성(충전 없음) · 2: 기술적 차별성(가족 장거리 · 에너지)
const SCENARIO_ORDER: ScenarioId[] = ["W", "A", "P", "V", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
const TRI: { v: Tri; label: string }[] = [{ v: "YES", label: "있음" }, { v: "NO", label: "없음" }, { v: "UNKNOWN", label: "모름" }];
