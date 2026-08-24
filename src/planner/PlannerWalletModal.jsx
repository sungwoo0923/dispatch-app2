// src/planner/PlannerWalletModal.jsx — "지갑" 팝업 (PC/모바일 공용).
// 수입·지출 메뉴 안에서 열리는, 우리 부부의 현재 재산(잔액)을 관리하는 기능.
// 처음엔 현재 재산을 한 번 설정해두고, 그 이후로는 +/-로 조정만 누적해서 반영한다.
import React, { useState } from "react";
import {
  usePlannerWallet, setPlannerWalletInitial, walletAdjustmentEntries, walletAdjustmentTotal,
  addWalletAdjustment, deletePlannerEntry, fmtWon, formatAmountInput, parseAmountInput,
} from "../adminPlannerData";
import useBodyScrollLock from "./useBodyScrollLock";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

export default function PlannerWalletModal({ groupId, myName, entries, onClose }) {
  useBodyScrollLock();
  const modalRef = React.useRef(null);
  React.useEffect(() => { modalRef.current?.focus(); }, []);

  const wallet = usePlannerWallet(groupId);
  const adjustments = walletAdjustmentEntries(entries);
  const adjustmentTotal = walletAdjustmentTotal(entries);
  const balance = (wallet?.initialBalance || 0) + adjustmentTotal;

  const [initialInput, setInitialInput] = useState("");
  const [editingInitial, setEditingInitial] = useState(false);
  const [sign, setSign] = useState("plus"); // plus | minus
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  const saveInitial = async () => {
    if (!parseAmountInput(initialInput)) return;
    setSaving(true);
    try {
      await setPlannerWalletInitial(groupId, Number(parseAmountInput(initialInput)), myName);
      setEditingInitial(false);
      setInitialInput("");
    } finally {
      setSaving(false);
    }
  };

  const addAdjustment = async () => {
    const amt = Number(parseAmountInput(amount));
    if (!amt) return;
    setSaving(true);
    try {
      await addWalletAdjustment({ groupId, amount: sign === "plus" ? amt : -amt, memo, actorName: myName });
      setAmount(""); setMemo("");
    } finally {
      setSaving(false);
    }
  };

  const removeAdjustment = async (id) => {
    if (!confirm("이 내역을 삭제할까요?")) return;
    await deletePlannerEntry(id);
  };

  return (
    <div className="fixed inset-0 z-[10015] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={modalRef} tabIndex={-1} className="relative bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full sm:w-[440px] max-h-[88vh] overflow-y-auto overscroll-contain outline-none">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[15px] font-extrabold text-gray-800">지갑</div>
          <button onClick={onClose} className="text-gray-400 text-[18px] leading-none">✕</button>
        </div>

        {!wallet ? (
          <div>
            <div className="text-[12.5px] text-gray-500 mb-3 leading-relaxed">
              현재 우리 재산(잔액)을 한 번 설정해두면, 앞으로는 +/-로 조정만 하면서 잔액을 관리할 수 있어요.
            </div>
            <div className="flex gap-2">
              <input
                value={initialInput}
                onChange={(e) => setInitialInput(formatAmountInput(parseAmountInput(e.target.value)))}
                placeholder="현재 재산 (원)"
                inputMode="numeric"
                className="flex-1 min-w-0 border rounded-lg px-3 py-2.5 text-[13px] text-right focus:outline-none"
                style={{ borderColor: ACCENT_BORDER }}
              />
              <button onClick={saveInitial} disabled={saving} className="shrink-0 px-4 rounded-lg text-white text-[13px] font-bold" style={{ background: ACCENT }}>
                설정
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-xl p-4 text-center mb-4" style={{ background: ACCENT }}>
              <div className="text-[12px] font-semibold text-white/80">현재 잔액</div>
              <div className="text-[26px] font-extrabold text-white mt-0.5">{fmtWon(balance)}</div>
              {editingInitial ? (
                <div className="flex gap-1.5 mt-3">
                  <input
                    value={initialInput}
                    onChange={(e) => setInitialInput(formatAmountInput(parseAmountInput(e.target.value)))}
                    placeholder={String(wallet.initialBalance)}
                    inputMode="numeric"
                    className="flex-1 min-w-0 border-0 rounded-lg px-2.5 py-1.5 text-[12px] text-right focus:outline-none"
                  />
                  <button onClick={saveInitial} disabled={saving} className="shrink-0 px-2.5 rounded-lg bg-white text-[11.5px] font-bold" style={{ color: ACCENT }}>저장</button>
                </div>
              ) : (
                <button onClick={() => { setEditingInitial(true); setInitialInput(String(wallet.initialBalance || 0)); }} className="mt-2 text-[11px] font-semibold text-white/75">
                  기준 재산 다시 설정하기
                </button>
              )}
            </div>

            <div className="flex gap-2 mb-2">
              {[["plus", "입금(+)"], ["minus", "출금(-)"]].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setSign(v)}
                  className="flex-1 py-2 rounded-lg text-[12.5px] font-bold border"
                  style={sign === v ? { background: ACCENT, color: "#fff", borderColor: ACCENT } : { color: ACCENT, borderColor: ACCENT_BORDER }}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mb-1.5">
              <input
                value={amount}
                onChange={(e) => setAmount(formatAmountInput(parseAmountInput(e.target.value)))}
                placeholder="금액"
                inputMode="numeric"
                className="flex-1 min-w-0 border rounded-lg px-3 py-2 text-[13px] text-right focus:outline-none"
                style={{ borderColor: ACCENT_BORDER }}
              />
              <button onClick={addAdjustment} disabled={saving} className="shrink-0 px-4 rounded-lg text-white text-[13px] font-bold" style={{ background: ACCENT }}>
                반영
              </button>
            </div>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모 (선택)"
              className="w-full border rounded-lg px-3 py-2 text-[12.5px] focus:outline-none mb-4"
              style={{ borderColor: ACCENT_BORDER }}
            />

            <div className="text-[11.5px] font-bold text-gray-500 mb-1.5">조정 내역</div>
            {adjustments.length === 0 ? (
              <div className="text-[12px] text-gray-400 text-center py-6 border rounded-xl" style={{ borderColor: ACCENT_BORDER }}>
                아직 조정 내역이 없어요.
              </div>
            ) : (
              <div className="space-y-1.5">
                {adjustments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-[12px] border-b pb-1.5" style={{ borderColor: ACCENT_SOFT }}>
                    <div className="min-w-0">
                      <span className="text-gray-600">{a.date}</span>
                      {a.memo && <span className="text-gray-400 ml-2 truncate">{a.memo}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold" style={{ color: a.amount >= 0 ? "#2563eb" : "#dc2626" }}>
                        {a.amount >= 0 ? "+" : ""}{fmtWon(a.amount)}
                      </span>
                      <button onClick={() => removeAdjustment(a.id)} className="text-gray-300 hover:text-gray-500 text-[11px]">삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
