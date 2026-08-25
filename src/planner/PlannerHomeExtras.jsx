// src/planner/PlannerHomeExtras.jsx — 홈 대시보드 상단에 얹는 "이 앱만의" 위젯 묶음.
// 다른 캘린더/가계부 앱에는 없는 요소들 — 커플 D-day(+생리 예정일), 오늘의 기분
// 체크인, 이번 주 미션(새로고침/19금 모드) — 을 한데 모아 보여준다.
// PC(DashboardTab)/모바일(MobileDashboard) 양쪽 대시보드 맨 위에서 그대로 재사용.
import React, { useMemo, useState } from "react";
import {
  todayStr, usePlannerTodayMoods, setPlannerMood, MOOD_OPTIONS,
  useWeekMission, rerollWeekMission, setWeekMissionPool,
  useGroupCycles, computeCycleInfo, dDayLabel,
} from "../adminPlannerData";
import { useGroupMembers } from "./plannerAuth";
import PlannerCycleTracker from "./PlannerCycleTracker";
import { ACCENT, ACCENT_BORDER } from "./plannerTheme";

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

function WeeklyMission({ groupId, myName }) {
  const { weekKey, text, pool, index } = useWeekMission(groupId);
  const [busy, setBusy] = useState(false);
  const isAdult = pool === "adult";

  const reroll = async () => {
    setBusy(true);
    try { await rerollWeekMission(groupId, weekKey, pool, index); } finally { setBusy(false); }
  };
  const toggleAdult = async () => {
    setBusy(true);
    try { await setWeekMissionPool(groupId, weekKey, isAdult ? "normal" : "adult"); } finally { setBusy(false); }
  };

  return (
    <Card
      title="이번 주 커플 미션"
      right={
        <button onClick={reroll} disabled={busy} className="text-[11px] font-bold shrink-0" style={{ color: ACCENT }}>
          다른 미션
        </button>
      }
    >
      <div className="text-[13px] font-bold text-gray-700">{text}</div>
      <label className="flex items-center gap-1.5 cursor-pointer select-none mt-2.5">
        <input type="checkbox" checked={isAdult} onChange={toggleAdult} disabled={busy} className="w-3.5 h-3.5" style={{ accentColor: ACCENT }} />
        <span className="text-[10.5px] font-semibold text-gray-500">19금 버전</span>
      </label>
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
      <WeeklyMission groupId={groupId} myName={myName} />
    </div>
  );
}
