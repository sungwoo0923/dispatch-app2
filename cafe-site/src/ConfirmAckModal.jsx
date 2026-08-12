// ======================= cafe-site/src/ConfirmAckModal.jsx =======================
// 배차취소 / 오더삭제처럼 되돌리기 어려운 동작을 실행하기 전, 상대방(차주) 정보와
// 오더 정보를 보여주고 "협의됨"에 반드시 체크해야만 실행 버튼이 활성화되는 확인모달.
import React, { useState } from "react";

export default function ConfirmAckModal({
  title, order, counterpartLabel = "차주", counterpartName, counterpartPhone,
  ackText, confirmLabel, onConfirm, onClose,
}) {
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[440px] max-w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-red-50 border-b border-red-100 px-6 py-4">
          <div className="text-red-700 font-bold text-[15px]">{title}</div>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-1.5">
            <div className="text-[13px] font-bold text-gray-900">{order?.상차지명} → {order?.하차지명}</div>
            <div className="text-[12px] text-gray-500">{order?.상차일} {order?.상차시간} · {order?.화물내용}</div>
            <div className="text-[12px] text-gray-500">운임 {order?.운임 || "협의"}</div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div className="text-[11px] font-bold text-amber-700 mb-1">{counterpartLabel} 정보</div>
            <div className="text-[13px] font-bold text-gray-900">{counterpartName || "-"}{counterpartPhone ? ` · ${counterpartPhone}` : ""}</div>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#1B2B4B] shrink-0" />
            <span className="text-[13px] font-semibold text-gray-800">{ackText}</span>
          </label>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-[13px] transition">
            닫기
          </button>
          <button onClick={run} disabled={!ack || busy}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-[13px] transition disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? "처리 중..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
