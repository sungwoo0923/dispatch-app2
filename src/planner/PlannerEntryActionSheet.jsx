// src/planner/PlannerEntryActionSheet.jsx — 리스트 행을 길게 누르면 뜨는 "수정/삭제"
// 선택 팝업. 수정을 누르면 바로 수정창으로, 삭제를 누르면 "삭제하시겠습니까?"
// 확인을 한 번 더 거친 뒤 삭제한다. 가계부/경조사 등 PlannerEntry 기반 리스트
// 어디서든 공용으로 쓴다.
import React, { useState } from "react";
import { deletePlannerEntry } from "../adminPlannerData";
import useBodyScrollLock from "./useBodyScrollLock";
import { ACCENT, ACCENT_BORDER } from "./plannerTheme";

export default function PlannerEntryActionSheet({ entry, label, onEdit, onClose }) {
  useBodyScrollLock();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await deletePlannerEntry(entry.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10025] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:w-[320px] p-4 pb-[max(16px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        {!confirming ? (
          <>
            <div className="text-[13px] font-bold text-gray-700 mb-3 px-1 truncate">{label || entry.title || entry.personName || "내역"}</div>
            <button
              onClick={() => { onClose(); onEdit(entry); }}
              className="w-full py-3 rounded-xl text-[13.5px] font-bold text-left px-3.5 mb-1.5"
              style={{ background: "#fff", color: ACCENT, border: `1px solid ${ACCENT_BORDER}` }}
            >
              수정
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="w-full py-3 rounded-xl text-[13.5px] font-bold text-left px-3.5 text-red-500 border border-red-200"
            >
              삭제
            </button>
          </>
        ) : (
          <>
            <div className="text-[13.5px] font-semibold text-gray-700 mb-4 px-1">삭제하시겠습니까?</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirming(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[13px] font-semibold">취소</button>
              <button onClick={doDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-[13px] font-bold disabled:opacity-60">
                {deleting ? "삭제 중..." : "확인"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
