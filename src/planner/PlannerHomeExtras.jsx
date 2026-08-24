// src/planner/PlannerHomeExtras.jsx — 홈 대시보드 상단에 얹는 "이 앱만의" 위젯 묶음.
// 다른 캘린더/가계부 앱에는 없는 요소들 — 커플 D-day, 오늘의 기분 체크인, 이번 주
// 미션, 우리 목표 저금통, 이번 달 브리핑 — 을 한 카드에 모아서 보여준다.
// PC(DashboardTab)/모바일(MobileDashboard) 양쪽 대시보드 맨 위에서 그대로 재사용.
import React, { useState } from "react";
import {
  todayStr, fmtWon, formatAmountInput, parseAmountInput,
  usePlannerTodayMoods, setPlannerMood, MOOD_OPTIONS,
  currentWeekMission, useWeekMissionCheck, togglePlannerMissionDone,
  usePlannerSavingsGoal, setPlannerSavingsGoal, savingsContributedTotal, addPlannerEntry,
  buildMonthlyBriefing,
} from "../adminPlannerData";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

function Card({ title, children }) {
  return (
    <div className="bg-white border rounded-xl p-3.5" style={{ borderColor: ACCENT_BORDER }}>
      <div className="text-[11.5px] font-bold text-gray-500 mb-2">{title}</div>
      {children}
    </div>
  );
}

function DdayBanner({ coupleStartDate }) {
  if (!coupleStartDate) return null;
  const start = new Date(coupleStartDate + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.floor((today - start) / 86400000) + 1;
  return (
    <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: ACCENT }}>
      <span className="text-[12.5px] font-semibold text-white/85">함께한 지</span>
      <span className="text-[16px] font-extrabold text-white">{days.toLocaleString("ko-KR")}일째</span>
    </div>
  );
}

function MoodCheckin({ groupId, myUid, myName }) {
  const today = todayStr();
  const moods = usePlannerTodayMoods(groupId, today);
  const mine = moods.find((m) => m.uid === myUid);
  const others = moods.filter((m) => m.uid !== myUid);
  const [saving, setSaving] = useState(false);

  const pick = async (value) => {
    setSaving(true);
    try { await setPlannerMood(groupId, myUid, myName, today, value); } finally { setSaving(false); }
  };

  return (
    <Card title="오늘의 기분">
      <div className="flex gap-1.5">
        {MOOD_OPTIONS.map((m) => (
          <button
            key={m.value}
            onClick={() => pick(m.value)}
            disabled={saving}
            className="flex-1 py-2 rounded-lg text-[12px] font-bold border"
            style={mine?.mood === m.value ? { background: ACCENT, color: "#fff", borderColor: ACCENT } : { color: ACCENT, borderColor: ACCENT_BORDER }}
          >
            {m.label}
          </button>
        ))}
      </div>
      {others.length > 0 && (
        <div className="mt-2 text-[11px] text-gray-500">
          {others.map((o) => `${o.name || "배우자"} · ${MOOD_OPTIONS.find((m) => m.value === o.mood)?.label || ""}`).join("  ")}
        </div>
      )}
    </Card>
  );
}

function WeeklyMission({ groupId, myName }) {
  const { weekKey, text } = currentWeekMission();
  const state = useWeekMissionCheck(groupId, weekKey);
  const done = !!state?.done;
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    setSaving(true);
    try { await togglePlannerMissionDone(groupId, weekKey, !done, myName); } finally { setSaving(false); }
  };

  return (
    <Card title="이번 주 커플 미션">
      <div className="flex items-center justify-between gap-2">
        <div className={`text-[13px] font-bold ${done ? "text-gray-400 line-through" : "text-gray-700"}`}>{text}</div>
        <button
          onClick={toggle}
          disabled={saving}
          className="shrink-0 whitespace-nowrap text-[11.5px] font-bold px-3 py-1.5 rounded-full border"
          style={done ? { background: ACCENT_SOFT, color: ACCENT, borderColor: ACCENT_BORDER } : { color: ACCENT, borderColor: ACCENT_BORDER }}
        >
          {done ? "완료됨" : "완료하기"}
        </button>
      </div>
      {done && state?.doneByName && <div className="text-[10.5px] text-gray-400 mt-1">{state.doneByName}님이 완료 처리했어요</div>}
    </Card>
  );
}

function SavingsGoal({ groupId, myUid, myName, entries }) {
  const goal = usePlannerSavingsGoal(groupId);
  const total = savingsContributedTotal(entries);
  const [newTitle, setNewTitle] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [contribAmount, setContribAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const createGoal = async () => {
    if (!newTitle.trim() || !parseAmountInput(newTarget)) return;
    setSaving(true);
    try { await setPlannerSavingsGoal(groupId, { title: newTitle.trim(), targetAmount: Number(parseAmountInput(newTarget)) }); }
    finally { setSaving(false); }
  };

  const contribute = async () => {
    const amt = Number(parseAmountInput(contribAmount));
    if (!amt) return;
    setSaving(true);
    try {
      await addPlannerEntry({ type: "savingsContribution", companyName: groupId, amount: amt, contributorUid: myUid, contributorName: myName || "", date: todayStr() });
      setContribAmount("");
    } finally { setSaving(false); }
  };

  if (!goal) {
    return (
      <Card title="우리 목표 저금통">
        <div className="flex gap-1.5">
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="목표 이름 (예: 제주도 여행)" className="flex-1 min-w-0 border rounded-lg px-2.5 py-2 text-[12px] focus:outline-none" style={{ borderColor: ACCENT_BORDER }} />
          <input value={newTarget} onChange={(e) => setNewTarget(formatAmountInput(parseAmountInput(e.target.value)))} placeholder="목표 금액" inputMode="numeric" className="w-24 shrink-0 border rounded-lg px-2.5 py-2 text-[12px] text-right focus:outline-none" style={{ borderColor: ACCENT_BORDER }} />
          <button onClick={createGoal} disabled={saving} className="shrink-0 px-3 rounded-lg text-white text-[12px] font-bold" style={{ background: ACCENT }}>만들기</button>
        </div>
      </Card>
    );
  }

  const pct = goal.targetAmount > 0 ? Math.min(100, Math.round((total / goal.targetAmount) * 100)) : 0;
  const achieved = pct >= 100;

  return (
    <Card title="우리 목표 저금통">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] font-bold text-gray-700">{goal.title}</span>
        <span className="text-[12px] font-bold" style={{ color: achieved ? "#16a34a" : ACCENT }}>{fmtWon(total)} / {fmtWon(goal.targetAmount)}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: ACCENT_SOFT }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: achieved ? "#16a34a" : ACCENT }} />
      </div>
      {achieved ? (
        <div className="text-[12px] font-bold mt-2" style={{ color: "#16a34a" }}>목표를 달성했어요! 축하해요</div>
      ) : (
        <div className="flex gap-1.5 mt-2.5">
          <input
            value={contribAmount}
            onChange={(e) => setContribAmount(formatAmountInput(parseAmountInput(e.target.value)))}
            placeholder="보탤 금액"
            inputMode="numeric"
            className="flex-1 min-w-0 border rounded-lg px-2.5 py-1.5 text-[12px] text-right focus:outline-none"
            style={{ borderColor: ACCENT_BORDER }}
          />
          <button onClick={contribute} disabled={saving} className="shrink-0 whitespace-nowrap px-3 rounded-lg text-white text-[12px] font-bold" style={{ background: ACCENT }}>
            보태기
          </button>
        </div>
      )}
    </Card>
  );
}

function MonthlyBriefing({ incomeExpense, budgetTarget, groupId, entries }) {
  const goal = usePlannerSavingsGoal(groupId);
  const savingsTotal = savingsContributedTotal(entries);
  const lines = buildMonthlyBriefing({ incomeExpense, budgetTarget, savingsGoal: goal, savingsTotal });
  return (
    <Card title="이번 달 브리핑">
      <div className="space-y-1">
        {lines.map((l, i) => (
          <div key={i} className="text-[12px] text-gray-600 leading-relaxed">{l}</div>
        ))}
      </div>
    </Card>
  );
}

export default function PlannerHomeExtras({ groupId, myUid, myName, coupleStartDate, entries, incomeExpense, budgetTarget }) {
  if (!groupId) return null;
  return (
    <div className="space-y-2.5 mb-5">
      <DdayBanner coupleStartDate={coupleStartDate} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <MoodCheckin groupId={groupId} myUid={myUid} myName={myName} />
        <WeeklyMission groupId={groupId} myName={myName} />
        <SavingsGoal groupId={groupId} myUid={myUid} myName={myName} entries={entries} />
        <MonthlyBriefing incomeExpense={incomeExpense} budgetTarget={budgetTarget} groupId={groupId} entries={entries} />
      </div>
    </div>
  );
}
