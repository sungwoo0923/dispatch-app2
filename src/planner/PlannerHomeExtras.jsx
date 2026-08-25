// src/planner/PlannerHomeExtras.jsx — 홈 대시보드 상단에 얹는 "이 앱만의" 위젯 묶음.
// 다른 캘린더/가계부 앱에는 없는 요소들 — 커플 D-day(+생리 예정일), 오늘의 기분
// 체크인, 이번 주 미션(새로고침/19금 모드) — 을 한데 모아 보여준다.
// PC(DashboardTab)/모바일(MobileDashboard) 양쪽 대시보드 맨 위에서 그대로 재사용.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  todayStr, usePlannerTodayMoods, setPlannerMood, MOOD_OPTIONS,
  useWeekMission, rerollWeekMission, setWeekMissionPool, computeMissionTurnUid,
  MISSION_VERSIONS, WEEKLY_MISSIONS, WEEKLY_MISSIONS_FUNNY, WEEKLY_MISSIONS_HONEST, WEEKLY_MISSIONS_ADULT,
  useGroupCycles, computeCycleInfo, dDayLabel,
} from "../adminPlannerData";
import { useGroupMembers, TOTAL_MASTER_EMAIL } from "./plannerAuth";
import PlannerCycleTracker from "./PlannerCycleTracker";
import useBodyScrollLock from "./useBodyScrollLock";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

function Card({ title, right, children }) {
  return (
    <div className="bg-white border rounded-xl p-3.5" style={{ borderColor: ACCENT_BORDER }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11.5px] font-bold text-gray-500">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

// 함께한 지 D-day + (등록돼 있으면) 여성 구성원의 생리 예정일을 한 카드에 묶어서
// 보여준다. 예정일 바를 누르면 생리주기 화면이 화면 중앙 팝업으로 뜬다.
function DdayAndCycleBanner({ groupId, myUid, myGender, myName, coupleStartDate }) {
  const members = useGroupMembers(groupId);
  const cycles = useGroupCycles(groupId);
  const [showCycle, setShowCycle] = useState(false);

  const femaleWithCycle = useMemo(() => {
    const females = members.filter((m) => m.gender === "female");
    for (const f of females) {
      const c = cycles.find((cy) => cy.uid === f.uid);
      if (c) return { member: f, info: computeCycleInfo(c) };
    }
    return null;
  }, [members, cycles]);

  if (!coupleStartDate && !femaleWithCycle) return null;

  const start = coupleStartDate ? new Date(coupleStartDate + "T00:00:00") : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = start ? Math.floor((today - start) / 86400000) + 1 : null;
  const periodDday = femaleWithCycle ? dDayLabel(femaleWithCycle.info?.nextPeriodStart) : null;

  return (
    <>
      <div className="rounded-xl overflow-hidden" style={{ background: ACCENT }}>
        {coupleStartDate && (
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-[12.5px] font-semibold text-white/85">함께한 지</span>
            <span className="text-[16px] font-extrabold text-white">{days.toLocaleString("ko-KR")}일째</span>
          </div>
        )}
        {femaleWithCycle && (
          <button
            onClick={() => setShowCycle(true)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-left"
            style={{ borderTop: coupleStartDate ? "1px solid rgba(255,255,255,0.2)" : "none" }}
          >
            <span className="text-[12px] font-semibold text-white/85">{femaleWithCycle.member.name || "배우자"}님 생리 예정일</span>
            <span className="text-[12.5px] font-bold text-white">{femaleWithCycle.info?.nextPeriodStart}{periodDday ? ` · ${periodDday}` : ""}</span>
          </button>
        )}
      </div>

      {showCycle && (
        <div className="fixed inset-0 z-[10020] flex items-center justify-center p-4" onClick={() => setShowCycle(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white rounded-2xl p-5 w-full max-w-[440px] max-h-[85vh] overflow-y-auto overscroll-contain"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-[14px] font-extrabold text-gray-800">생리주기</div>
              <button onClick={() => setShowCycle(false)} className="text-gray-400 text-[18px] leading-none">✕</button>
            </div>
            <PlannerCycleTracker groupId={groupId} myUid={myUid} myGender={myGender} myName={myName} />
          </div>
        </div>
      )}
    </>
  );
}

// ⭐ 알약 버튼 행 대신, 문장형 선택지를 고르는 얇은 드롭다운 한 줄로 바꿨다.
// 드롭다운은 폭을 억지로 늘리지 않고 고른 문장 길이에 맞게 자연스럽게 표시되고,
// 바로 아래에 상대방 기분이 "오늘 OOO님은 기분이 ○○○" 한 줄로만 나온다.
function MoodCheckin({ groupId, myUid, myName }) {
  const today = todayStr();
  const moods = usePlannerTodayMoods(groupId, today);
  const mine = moods.find((m) => m.uid === myUid);
  const others = moods.filter((m) => m.uid !== myUid);
  const [saving, setSaving] = useState(false);

  const pick = async (value) => {
    if (!value || value === mine?.mood || saving) return;
    setSaving(true);
    try { await setPlannerMood(groupId, myUid, myName, today, value); } finally { setSaving(false); }
  };

  return (
    <div className="bg-white border rounded-xl px-2.5 py-2" style={{ borderColor: ACCENT_BORDER }}>
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] font-bold text-gray-400 shrink-0">오늘 기분</span>
        <select
          value={mine?.mood || ""}
          onChange={(e) => pick(e.target.value)}
          disabled={saving}
          className="min-w-0 max-w-full border rounded-lg px-2 py-1.5 text-[11.5px] font-bold focus:outline-none bg-white"
          style={{ borderColor: ACCENT_BORDER, color: mine?.mood ? ACCENT : "#9ca3af" }}
        >
          <option value="" disabled>오늘 기분을 골라주세요</option>
          {MOOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      {others.length > 0 && (
        <div className="mt-1.5 text-[11px] text-gray-500 truncate">
          {others.map((o) => `오늘 ${o.name || "배우자"}님은 기분이 ${MOOD_OPTIONS.find((m) => m.value === o.mood)?.partnerLabel || ""}`).join(" · ")}
        </div>
      )}
    </div>
  );
}

// 미션 버전 전체(랜덤 룰렛용) — key별 목록을 한 곳에 모아둔다.
const ALL_MISSION_POOLS = { normal: WEEKLY_MISSIONS, funny: WEEKLY_MISSIONS_FUNNY, honest: WEEKLY_MISSIONS_HONEST, adult: WEEKLY_MISSIONS_ADULT };
function randomPoolAndIndex() {
  const keys = Object.keys(ALL_MISSION_POOLS);
  const pool = keys[Math.floor(Math.random() * keys.length)];
  const list = ALL_MISSION_POOLS[pool];
  const index = Math.floor(Math.random() * list.length);
  return { pool, index, text: list[index] };
}

// ⭐ "랜덤 버전"을 고르면 넷 중 하나가 슬롯머신처럼 빠르게 바뀌다가, STOP을
// 누르면 점점 느려지며 멈추고 최종 미션이 확정된다.
function MissionRoulette({ onConfirm, onCancel }) {
  const [current, setCurrent] = useState(() => randomPoolAndIndex());
  const [spinning, setSpinning] = useState(true);
  const [settled, setSettled] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => setCurrent(randomPoolAndIndex()), 70);
    return () => clearInterval(intervalRef.current);
  }, []);

  const stop = () => {
    if (!spinning) return;
    clearInterval(intervalRef.current);
    setSpinning(false);
    const delays = [90, 130, 190, 270, 380, 520, 700];
    let i = 0;
    const step = () => {
      setCurrent(randomPoolAndIndex());
      i += 1;
      if (i < delays.length) setTimeout(step, delays[i]);
      else setSettled(true);
    };
    setTimeout(step, delays[0]);
  };

  const versionLabel = MISSION_VERSIONS.find((v) => v.key === current.pool)?.label || current.pool;

  return (
    <div>
      <div className="rounded-xl p-5 mb-4 min-h-[96px] flex flex-col items-center justify-center text-center" style={{ background: ACCENT_SOFT }}>
        <div className="text-[10.5px] font-bold mb-1.5" style={{ color: ACCENT }}>{versionLabel}</div>
        <div className="text-[13.5px] font-bold text-gray-800" style={{ opacity: settled ? 1 : 0.65 }}>{current.text}</div>
      </div>
      {!settled ? (
        <button onClick={stop} disabled={!spinning} className="w-full py-3 rounded-xl text-white text-[14px] font-extrabold disabled:opacity-50" style={{ background: ACCENT }}>
          STOP
        </button>
      ) : (
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border text-gray-600 text-[13px] font-semibold" style={{ borderColor: ACCENT_BORDER }}>취소</button>
          <button onClick={() => onConfirm(current)} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: ACCENT }}>이걸로 확정</button>
        </div>
      )}
    </div>
  );
}

function VersionPickerModal({ groupId, weekKey, currentPool, myUid, allowed, otherName, onClose }) {
  useBodyScrollLock();
  const [mode, setMode] = useState("pick"); // pick | roulette
  const [saving, setSaving] = useState(false);

  const apply = async (pool, missionIndex, pickedRandom = false) => {
    setSaving(true);
    try {
      await setWeekMissionPool(groupId, weekKey, pool, { actorUid: myUid, missionIndex, pickedRandom, allowed });
      onClose();
    } catch (err) {
      alert(err.message || "변경할 수 없어요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10035] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl p-5 w-full max-w-[380px] max-h-[85vh] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[14.5px] font-extrabold text-gray-800">미션 버전 변경</div>
          <button onClick={onClose} className="text-gray-400 text-[18px] leading-none">✕</button>
        </div>
        {!allowed && (
          <div className="text-[11px] text-red-500 mt-2 mb-1 leading-relaxed">
            버전 변경은 매주 한 번, 번갈아가며 할 수 있어요 — 이번 주는 {otherName || "배우자"}님 차례예요.
          </div>
        )}
        {mode === "pick" ? (
          <div className="space-y-2 mt-3">
            {MISSION_VERSIONS.map((v) => (
              <button
                key={v.key}
                onClick={() => apply(v.key)}
                disabled={!allowed || saving}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left disabled:opacity-40"
                style={currentPool === v.key ? { background: ACCENT_SOFT, borderColor: ACCENT, color: ACCENT } : { borderColor: ACCENT_BORDER, color: "#374151" }}
              >
                <span className="text-[13px] font-bold">{v.label}</span>
                {currentPool === v.key && <span className="text-[10.5px] font-bold">현재</span>}
              </button>
            ))}
            <button
              onClick={() => setMode("roulette")}
              disabled={!allowed || saving}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left disabled:opacity-40"
              style={{ borderColor: ACCENT_BORDER, color: "#374151" }}
            >
              <span className="text-[13px] font-bold">랜덤 버전</span>
              <span className="text-[10.5px] text-gray-400">룰렛으로 뽑기</span>
            </button>
          </div>
        ) : (
          <div className="mt-3">
            <MissionRoulette onCancel={() => setMode("pick")} onConfirm={(r) => apply(r.pool, r.index, true)} />
          </div>
        )}
      </div>
    </div>
  );
}

function WeeklyMission({ groupId, myUid, myName }) {
  const { weekKey, text, pool, index, versionChanged, pickedRandom } = useWeekMission(groupId);
  const [busy, setBusy] = useState(false);
  const [showVersionPicker, setShowVersionPicker] = useState(false);
  const members = useGroupMembers(groupId);

  const me = members.find((m) => m.uid === myUid);
  const other = members.find((m) => m.uid !== myUid);
  const isOwner = me?.email === TOTAL_MASTER_EMAIL;
  const turnUid = computeMissionTurnUid(members, weekKey);
  // 배우자가 아직 가입 전이면(혼자뿐이면) 항상 내 차례로 취급.
  const isMyTurn = members.length < 2 || myUid === turnUid;
  const allowed = isOwner || (isMyTurn && !versionChanged);
  const currentVersionLabel = MISSION_VERSIONS.find((v) => v.key === pool)?.label || "일상 버전";

  const reroll = async () => {
    setBusy(true);
    try { await rerollWeekMission(groupId, weekKey, pool, index); } finally { setBusy(false); }
  };

  return (
    <Card
      title="이번 주 커플 미션"
      right={
        <div className="flex items-center gap-2.5 shrink-0">
          <button onClick={reroll} disabled={busy} className="text-[11px] font-bold" style={{ color: ACCENT }}>
            다른 미션
          </button>
          <button onClick={() => setShowVersionPicker(true)} className="text-[11px] font-bold" style={{ color: ACCENT }}>
            버전변경
          </button>
        </div>
      }
    >
      <div className="text-[9.5px] font-bold text-gray-400 mb-1">
        {currentVersionLabel}{pickedRandom && " · 랜덤으로 뽑힘"}
      </div>
      <div className="text-[13px] font-bold text-gray-700">{text}</div>

      {showVersionPicker && (
        <VersionPickerModal
          groupId={groupId} weekKey={weekKey} currentPool={pool} myUid={myUid}
          allowed={allowed} otherName={other?.name}
          onClose={() => setShowVersionPicker(false)}
        />
      )}
    </Card>
  );
}

export default function PlannerHomeExtras({ groupId, myUid, myName, myGender, coupleStartDate }) {
  if (!groupId) return null;
  return (
    <div className="space-y-2.5 mb-5">
      <DdayAndCycleBanner groupId={groupId} myUid={myUid} myGender={myGender} myName={myName} coupleStartDate={coupleStartDate} />
      {/* ⭐ 오늘의 기분은 이제 얇은 한 줄이라, 카드형인 이번 주 미션과 2단 그리드로
          묶으면 높이를 억지로 맞추려 늘어나 보였다 — 각자 전체 폭으로 세로 배치. */}
      <MoodCheckin groupId={groupId} myUid={myUid} myName={myName} />
      <WeeklyMission groupId={groupId} myUid={myUid} myName={myName} />
    </div>
  );
}
