// src/planner/PlannerWalletModal.jsx — "내지갑" 팝업 (PC/모바일 공용).
// 기준 재산(+마이너스통장 채무)만 설정해두면, 수입·지출 내역이 자동으로 반영된
// 잔액을 계산해서 보여준다. 별도의 입금/출금 기록은 없다 — 실제 잔액 변화는
// 수입·지출 메뉴에서 내역을 등록/삭제하는 것으로 자연스럽게 반영된다.
import React, { useState } from "react";
import { usePlannerWallet, setPlannerWallet, computeWalletBalance, fmtWon, formatAmountInput, parseAmountInput } from "../adminPlannerData";
import useBodyScrollLock from "./useBodyScrollLock";
import { ACCENT, ACCENT_BORDER } from "./plannerTheme";

export default function PlannerWalletModal({ groupId, myName, totalIncome, totalExpense, onClose }) {
  useBodyScrollLock();
  const modalRef = React.useRef(null);
  React.useEffect(() => { modalRef.current?.focus(); }, []);

  const wallet = usePlannerWallet(groupId);
  const balance = computeWalletBalance(wallet, totalIncome, totalExpense);

  const [editing, setEditing] = useState(!wallet);
  const [baseInput, setBaseInput] = useState(wallet ? String(wallet.baseAssets || 0) : "");
  const [overdraftInput, setOverdraftInput] = useState(wallet ? String(wallet.overdraftDebt || 0) : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await setPlannerWallet(groupId, {
        baseAssets: Number(parseAmountInput(baseInput)) || 0,
        overdraftDebt: Number(parseAmountInput(overdraftInput)) || 0,
      }, myName);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10015] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={modalRef} tabIndex={-1} className="relative bg-white rounded-2xl p-5 w-full max-w-[420px] max-h-[88vh] overflow-y-auto overscroll-contain outline-none">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[15px] font-extrabold text-gray-800">내지갑</div>
          <button onClick={onClose} className="text-gray-400 text-[18px] leading-none">✕</button>
        </div>

        <div className="rounded-xl p-4 text-center mb-4" style={{ background: ACCENT }}>
          <div className="text-[12px] font-semibold text-white/80">현재 잔액</div>
          <div className="text-[26px] font-extrabold text-white mt-0.5">{balance == null ? "미설정" : fmtWon(balance)}</div>
          {wallet && (
            <div className="text-[10.5px] text-white/70 mt-1">
              기준 재산 {fmtWon(wallet.baseAssets || 0)}
              {wallet.overdraftDebt > 0 && ` · 마이너스통장 -${fmtWon(wallet.overdraftDebt)}`}
              {" "}· 수입·지출 반영 {totalIncome - totalExpense >= 0 ? "+" : ""}{fmtWon(totalIncome - totalExpense)}
            </div>
          )}
          {!editing && wallet && (
            <button onClick={() => { setEditing(true); setBaseInput(String(wallet.baseAssets || 0)); setOverdraftInput(String(wallet.overdraftDebt || 0)); }} className="mt-2.5 text-[11px] font-semibold text-white/80">
              기준 재산 다시 설정하기
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div className="text-[12.5px] text-gray-500 leading-relaxed">
              현재 우리 재산(기준 잔액)을 입력해두면, 이후 수입·지출 메뉴에 등록하는 내역이 여기 잔액에 자동으로 반영돼요.
            </div>
            <div>
              <div className="text-[11.5px] font-semibold text-gray-600 mb-1">기준 재산</div>
              <input
                value={baseInput}
                onChange={(e) => setBaseInput(formatAmountInput(parseAmountInput(e.target.value)))}
                placeholder="0"
                inputMode="numeric"
                className="w-full border rounded-lg px-3 py-2.5 text-[13px] text-right focus:outline-none"
                style={{ borderColor: ACCENT_BORDER }}
              />
            </div>
            <div>
              <div className="text-[11.5px] font-semibold text-gray-600 mb-1">마이너스통장 (선택 — 쓰고 있는 채무 금액)</div>
              <input
                value={overdraftInput}
                onChange={(e) => setOverdraftInput(formatAmountInput(parseAmountInput(e.target.value)))}
                placeholder="0"
                inputMode="numeric"
                className="w-full border rounded-lg px-3 py-2.5 text-[13px] text-right focus:outline-none"
                style={{ borderColor: ACCENT_BORDER }}
              />
            </div>
            <button onClick={save} disabled={saving} className="w-full py-2.5 rounded-lg text-white text-[13px] font-bold disabled:opacity-50" style={{ background: ACCENT }}>
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        ) : (
          <div className="text-[11.5px] text-gray-400 text-center leading-relaxed">
            수입·지출 메뉴에서 내역을 등록/삭제하면 이 잔액도 자동으로 바뀌어요.
          </div>
        )}
      </div>
    </div>
  );
}
