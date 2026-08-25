// src/planner/PlannerTimeCapsule.jsx — "타임캡슐" 메뉴 (PC/모바일 공용).
// 지금 쓴 메시지를 미래의 날짜가 되기 전까지 잠가두고, 그날이 되면 열어볼 수 있게
// 하는 기능. 결혼기념일에 맞춰 미리 편지를 써두거나, 다음 생일에 열어볼 말을
// 남겨두는 식으로 쓸 수 있다. 서버 스케줄러 없이 "오늘 ≥ 배달일"만 비교해서 잠금을 푼다.
import React, { useMemo, useState } from "react";
import { usePlannerTimeCapsules, addPlannerTimeCapsule, deletePlannerTimeCapsule, todayStr, dDayLabel } from "../adminPlannerData";
import PlannerDatePicker from "./PlannerDatePicker";
import PlannerInfoTip from "./PlannerInfoTip";
import useBodyScrollLock from "./useBodyScrollLock";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

function LockIcon({ size = 16, color = ACCENT }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function AddModal({ groupId, myUid, myName, onClose }) {
  useBodyScrollLock();
  const modalRef = React.useRef(null);
  React.useEffect(() => { modalRef.current?.focus(); }, []);

  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
  const [text, setText] = useState("");
  const [deliverDate, setDeliverDate] = useState(tomorrow);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!text.trim()) { alert("내용을 입력해 주세요."); return; }
    if (deliverDate <= todayStr()) { alert("배달일은 오늘 이후 날짜로 정해 주세요."); return; }
    setSaving(true);
    try {
      await addPlannerTimeCapsule({ groupId, fromUid: myUid, fromName: myName, text, deliverDate });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10010] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={modalRef} tabIndex={-1} className="relative bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full sm:w-[420px] max-h-[88vh] overflow-y-auto overscroll-contain outline-none">
        <div className="text-[15px] font-extrabold text-gray-800 mb-1">타임캡슐 남기기</div>
        <div className="text-[11.5px] text-gray-400 mb-4">정한 날짜가 되기 전까지는 상대방도 열어볼 수 없어요.</div>

        <div className="text-[11.5px] font-semibold text-gray-600 mb-1">내용</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="미래의 우리에게, 혹은 상대방에게 남기고 싶은 말을 적어보세요"
          className="w-full border rounded-lg px-3 py-2.5 text-[13px] focus:outline-none resize-none"
          style={{ borderColor: ACCENT_BORDER }}
        />

        <div className="mt-3">
          <div className="text-[11.5px] font-semibold text-gray-600 mb-1">언제 열어볼까요</div>
          <PlannerDatePicker value={deliverDate} onChange={setDeliverDate} />
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border text-gray-600 text-[13px] font-semibold" style={{ borderColor: ACCENT_BORDER }}>취소</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg text-white text-[13px] font-bold disabled:opacity-50" style={{ background: ACCENT }}>
            {saving ? "저장 중..." : "봉인하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlannerTimeCapsule({ account }) {
  const capsules = usePlannerTimeCapsules(account.groupId);
  const [showAdd, setShowAdd] = useState(false);
  const today = todayStr();

  const { locked, opened } = useMemo(() => {
    const locked = capsules.filter((c) => c.deliverDate > today);
    const opened = capsules.filter((c) => c.deliverDate <= today).sort((a, b) => (b.deliverDate || "").localeCompare(a.deliverDate || ""));
    return { locked, opened };
  }, [capsules, today]);

  const remove = async (id) => {
    if (!confirm("삭제할까요? 복구할 수 없어요.")) return;
    await deletePlannerTimeCapsule(id);
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex justify-end">
        <PlannerInfoTip
          align="right"
          text="지금 쓴 메시지를 미래의 날짜에 열어볼 수 있게 잠가둘 수 있어요. 기념일에 맞춰 미리 편지를 써두거나, 다음 생일에 열어볼 말을 남겨보세요."
        />
      </div>

      <button onClick={() => setShowAdd(true)} className="w-full py-3 rounded-xl text-white text-[13.5px] font-bold" style={{ background: ACCENT }}>
        + 타임캡슐 남기기
      </button>

      {locked.length > 0 && (
        <div>
          <div className="text-[12.5px] font-bold text-gray-600 mb-2">잠긴 타임캡슐 {locked.length}개</div>
          <div className="space-y-2">
            {locked.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-white border rounded-xl px-4 py-3" style={{ borderColor: ACCENT_BORDER }}>
                <div className="flex items-center gap-2.5">
                  <LockIcon />
                  <div>
                    <div className="text-[12.5px] font-bold text-gray-700">{c.deliverDate}에 열려요</div>
                    <div className="text-[10.5px] text-gray-400 mt-0.5">{c.fromName}님이 남김 · {dDayLabel(c.deliverDate) || ""}</div>
                  </div>
                </div>
                {c.fromUid === account.uid && (
                  <button onClick={() => remove(c.id)} className="text-gray-300 hover:text-gray-500 text-[11px] shrink-0">삭제</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-[12.5px] font-bold text-gray-600 mb-2">열어본 타임캡슐</div>
        {opened.length === 0 ? (
          <div className="text-[12.5px] text-gray-400 text-center py-8 bg-white border rounded-xl" style={{ borderColor: ACCENT_BORDER }}>
            아직 열어볼 수 있는 타임캡슐이 없어요.
          </div>
        ) : (
          <div className="space-y-2.5">
            {opened.map((c) => (
              <div key={c.id} className="bg-white border rounded-xl p-4" style={{ borderColor: ACCENT_BORDER }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{ background: ACCENT_SOFT, color: ACCENT }}>
                    {c.deliverDate} · {c.fromName}
                  </span>
                  {c.fromUid === account.uid && (
                    <button onClick={() => remove(c.id)} className="text-gray-300 hover:text-gray-500 text-[11px]">삭제</button>
                  )}
                </div>
                <div className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">{c.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && <AddModal groupId={account.groupId} myUid={account.uid} myName={account.name} onClose={() => setShowAdd(false)} />}
    </div>
  );
}
