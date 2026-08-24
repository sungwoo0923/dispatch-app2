// src/planner/PlannerTimeline.jsx — "타임라인" 메뉴 (PC/모바일 공용, 옛 이름 "우리 이야기").
// 등록된 일정을 나열하던 예전 방식 대신, 만난 날 기준 100일/1000일 같은 절편
// 기념일과 매년 돌아오는 N주년이 언제인지 계산해서 보여준다. 화면 중앙에는 커플
// 사진을 올려둘 수 있다.
import React, { useMemo, useRef, useState } from "react";
import {
  todayStr, durationParts, generateAnniversaries, next14DayInfo, uploadTimelinePhoto, useTimelinePhoto,
} from "../adminPlannerData";
import { updateCoupleStartDate } from "./plannerAuth";
import PlannerDatePicker from "./PlannerDatePicker";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

function daysBetween(fromStr, toStr) {
  const a = new Date(fromStr + "T00:00:00");
  const b = new Date(toStr + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
function weekdayLabel(dateStr) {
  const WK = ["일", "월", "화", "수", "목", "금", "토"];
  const d = new Date(dateStr + "T00:00:00");
  return WK[d.getDay()];
}

function PhotoPicker({ groupId }) {
  const photoURL = useTimelinePhoto(groupId);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const handlePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try { await uploadTimelinePhoto(groupId, file); } finally { setUploading(false); }
  };

  return (
    <button
      onClick={() => inputRef.current?.click()}
      className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-gray-50 border flex items-center justify-center"
      style={{ borderColor: ACCENT_BORDER }}
    >
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handlePick} />
      {photoURL ? (
        <img src={photoURL} alt="커플 사진" className="w-full h-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-2 text-gray-400">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="10.5" r="2" />
            <path d="M21 16l-5.5-5.5a1.5 1.5 0 0 0-2.1 0L4 19" />
          </svg>
          <span className="text-[12px] font-semibold">사진 선택</span>
        </div>
      )}
      {uploading && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-[12px] font-bold">업로드 중...</div>
      )}
      {photoURL && !uploading && (
        <div className="absolute bottom-2 right-2 bg-black/45 text-white text-[10.5px] font-semibold px-2.5 py-1 rounded-full">사진 변경</div>
      )}
    </button>
  );
}

export default function PlannerTimeline({ account, onCoupleStartDateChange }) {
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

  const today = todayStr();
  const anniversaries = useMemo(
    () => (account.coupleStartDate ? generateAnniversaries(account.coupleStartDate) : []),
    [account.coupleStartDate]
  );
  const day14 = useMemo(() => next14DayInfo(today), [today]);
  const duration = account.coupleStartDate ? durationParts(account.coupleStartDate, today) : null;

  if (!account.coupleStartDate || editing) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <div className="rounded-2xl p-6 text-center" style={{ background: ACCENT }}>
          <div className="text-[13px] font-bold text-white mb-3">우리가 시작된 날을 기록해두면{"\n"}100일·1000일 같은 기념일을 미리 알려드려요</div>
          <div className="bg-white rounded-xl p-1">
            <PlannerDatePicker value={draft} onChange={saveStartDate} placeholder="시작일 선택" />
          </div>
          {account.coupleStartDate && (
            <button onClick={() => setEditing(false)} className="mt-2.5 text-[11.5px] font-semibold text-white/80">취소</button>
          )}
          {saving && <div className="text-[11px] text-white/80 mt-2">저장 중...</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11.5px] font-bold" style={{ color: ACCENT }}>{day14.name}</span>
          <span className="text-[11.5px] font-bold" style={{ color: ACCENT }}>{day14.daysLeft === 0 ? "오늘" : `${day14.daysLeft}일 남음`}</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: ACCENT_SOFT }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${day14.pct}%`, background: ACCENT }} />
        </div>
      </div>

      <div className="text-center">
        <div className="text-[13px] text-gray-500">사랑한지</div>
        <div className="text-[24px] font-extrabold text-gray-800 mt-0.5">
          {duration.years > 0 && `${duration.years}년 `}{duration.months}개월 {duration.days}일
        </div>
        <button onClick={() => setEditing(true)} className="text-[11px] font-semibold mt-1" style={{ color: ACCENT }}>시작일 수정</button>
      </div>

      <PhotoPicker groupId={account.groupId} />

      <div className="bg-white border rounded-xl overflow-hidden" style={{ borderColor: ACCENT_BORDER }}>
        {anniversaries.map((row, i) => {
          const d = daysBetween(today, row.date);
          const passed = d < 0;
          return (
            <div
              key={row.label}
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: i > 0 ? `1px solid ${ACCENT_SOFT}` : "none", background: d === 0 ? ACCENT_SOFT : "transparent" }}
            >
              <span className="text-[13px] font-bold text-gray-700">{row.label}</span>
              <div className="text-right">
                <div className="text-[12px] font-semibold text-gray-600">{row.date} ({weekdayLabel(row.date)})</div>
                <div className="text-[11px] font-bold mt-0.5" style={{ color: d === 0 ? ACCENT : passed ? "#9ca3af" : ACCENT }}>
                  {d === 0 ? "오늘" : passed ? `${-d}일 지남` : `${d}일 남음`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
