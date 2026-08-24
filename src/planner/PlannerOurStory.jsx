// src/planner/PlannerOurStory.jsx — "우리 이야기" 메뉴 (PC/모바일 공용).
// 관계 시작일을 기준으로 한 D-day와, 그동안 등록해둔 일정(생일/기념일/여행 등)을
// 달력이 아니라 시간순 "연표"로 다시 보여준다. 다른 캘린더/가계부 앱에는 없는,
// 이 앱만의 "우리 둘의 기록" 느낌을 주는 화면.
import React, { useMemo, useState } from "react";
import { usePlannerEntries } from "../adminPlannerData";
import { updateCoupleStartDate } from "./plannerAuth";
import PlannerDatePicker from "./PlannerDatePicker";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

function daysSince(dateStr) {
  const start = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today - start) / 86400000) + 1; // 시작일을 1일째로 센다
}

// account는 groupId/uid/name/coupleStartDate만 있으면 되는 "좁은" 형태로 받는다
// (PlannerMyInfo처럼 전체 계정을 그대로 spread하지 않음 — 이 화면은 관계 시작일
// 하나만 바꾸므로, 변경된 값만 onCoupleStartDateChange로 위로 알려준다).
export default function PlannerOurStory({ account, onCoupleStartDateChange }) {
  const { entries } = usePlannerEntries(account.groupId);
  const schedules = useMemo(
    () => entries.filter((e) => e.type === "schedule").sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    [entries]
  );

  const [editing, setEditing] = useState(!account.coupleStartDate);
  const [draft, setDraft] = useState(account.coupleStartDate || "");
  const [saving, setSaving] = useState(false);

  const saveStartDate = async (next) => {
    setDraft(next);
    setSaving(true);
    try {
      await updateCoupleStartDate(account.groupId, next);
      onCoupleStartDateChange?.(next);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const days = account.coupleStartDate ? daysSince(account.coupleStartDate) : null;

  const timeline = useMemo(() => {
    const items = schedules.map((s) => ({ date: s.date, title: s.title, category: s.category, recurring: s.recurring }));
    if (account.coupleStartDate) items.unshift({ date: account.coupleStartDate, title: "우리가 시작된 날", category: "시작일", origin: true });
    return items.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [schedules, account.coupleStartDate]);

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="rounded-2xl p-6 text-center" style={{ background: ACCENT }}>
        {account.coupleStartDate && !editing ? (
          <>
            <div className="text-[12.5px] font-semibold" style={{ color: "rgba(255,255,255,0.8)" }}>함께한 지</div>
            <div className="text-[38px] font-extrabold text-white leading-tight mt-1">{days.toLocaleString("ko-KR")}일째</div>
            <div className="text-[11.5px] mt-1" style={{ color: "rgba(255,255,255,0.75)" }}>{account.coupleStartDate}부터</div>
            <button
              onClick={() => setEditing(true)}
              className="mt-3 text-[11.5px] font-semibold px-3 py-1.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.18)", color: "#fff" }}
            >
              시작일 수정
            </button>
          </>
        ) : (
          <>
            <div className="text-[13px] font-bold text-white mb-3">우리가 시작된 날을 기록해두면{"\n"}함께한 날을 매일 보여드려요</div>
            <div className="bg-white rounded-xl p-1">
              <PlannerDatePicker value={draft} onChange={saveStartDate} placeholder="시작일 선택" />
            </div>
            {account.coupleStartDate && (
              <button onClick={() => setEditing(false)} className="mt-2.5 text-[11.5px] font-semibold" style={{ color: "rgba(255,255,255,0.8)" }}>
                취소
              </button>
            )}
            {saving && <div className="text-[11px] text-white/80 mt-2">저장 중...</div>}
          </>
        )}
      </div>

      <div>
        <div className="text-[13px] font-bold text-gray-700 mb-2.5">우리 연표</div>
        {timeline.length === 0 ? (
          <div className="text-[12.5px] text-gray-400 text-center py-8 bg-white border rounded-xl" style={{ borderColor: ACCENT_BORDER }}>
            아직 등록된 일정이 없어요. 일정 메뉴에서 기념일/여행을 추가해보세요.
          </div>
        ) : (
          <div className="relative pl-4">
            <div className="absolute left-[5px] top-1 bottom-1 w-[2px]" style={{ background: ACCENT_BORDER }} />
            <div className="space-y-4">
              {timeline.map((t, i) => (
                <div key={i} className="relative">
                  <div
                    className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full"
                    style={{ background: t.origin ? ACCENT : "#fff", border: `2px solid ${ACCENT}` }}
                  />
                  <div className="text-[10.5px] font-semibold text-gray-400">{t.date}</div>
                  <div className="text-[13px] font-bold text-gray-700 mt-0.5">
                    {t.title}
                    {t.recurring && <span className="text-[10px] text-gray-400 font-normal ml-1">(매년)</span>}
                  </div>
                  {t.category && (
                    <span
                      className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: ACCENT_SOFT, color: ACCENT }}
                    >
                      {t.category}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
