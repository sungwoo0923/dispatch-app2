// src/planner/PlannerWalletModal.jsx — "내지갑" 팝업 (PC/모바일 공용).
// 기준 재산만 설정해두면, 수입·지출 내역이 자동으로 반영된 잔액을 계산해서
// 보여준다. 대출금/마이너스통장 같은 빚은 숫자 하나로 뭉뚱그리지 않고, "+"로
// 항목을 하나씩 추가해서 분류·금액·(선택)회차·만기일까지 따로 남길 수 있다.
import React, { useState } from "react";
import {
  usePlannerWallet, setPlannerWalletBase, computeWalletBalance,
  usePlannerDebts, addPlannerDebt, deletePlannerDebt, totalDebtAmount, mergeDebtCategoryOptions,
  fmtWon, formatAmountInput, parseAmountInput,
} from "../adminPlannerData";
import PlannerCategorySelect from "./PlannerCategorySelect";
import PlannerDatePicker from "./PlannerDatePicker";
import useBodyScrollLock from "./useBodyScrollLock";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

function AddDebtForm({ groupId, myName, debts, onDone }) {
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [useInstallment, setUseInstallment] = useState(false);
  const [installmentNo, setInstallmentNo] = useState("");
  const [installmentTotal, setInstallmentTotal] = useState("");
  const [useDueDate, setUseDueDate] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!category.trim() || !parseAmountInput(amount)) { alert("분류와 금액을 입력해 주세요."); return; }
    setSaving(true);
    try {
      await addPlannerDebt({
        groupId, category: category.trim(), amount: Number(parseAmountInput(amount)),
        installmentNo: useInstallment ? installmentNo : "", installmentTotal: useInstallment ? installmentTotal : "",
        dueDate: useDueDate ? dueDate : "", actorName: myName,
      });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border p-3 space-y-2.5 mb-3" style={{ borderColor: ACCENT_BORDER, background: ACCENT_SOFT }}>
      <div>
        <div className="text-[11px] font-semibold text-gray-600 mb-1">분류</div>
        <PlannerCategorySelect value={category} onChange={setCategory} options={mergeDebtCategoryOptions(debts)} placeholder="예: 마이너스통장" className="w-full border rounded-lg px-3 py-2 text-[12.5px] focus:outline-none bg-white" />
      </div>
      <div>
        <div className="text-[11px] font-semibold text-gray-600 mb-1">금액</div>
        <input
          value={amount}
          onChange={(e) => setAmount(formatAmountInput(parseAmountInput(e.target.value)))}
          placeholder="0"
          inputMode="numeric"
          className="w-full border rounded-lg px-3 py-2 text-[12.5px] text-right focus:outline-none bg-white"
          style={{ borderColor: ACCENT_BORDER }}
        />
      </div>

      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input type="checkbox" checked={useInstallment} onChange={(e) => setUseInstallment(e.target.checked)} className="w-3.5 h-3.5" style={{ accentColor: ACCENT }} />
        <span className="text-[11.5px] font-semibold text-gray-600">상환 회차 입력</span>
      </label>
      {useInstallment && (
        <div className="flex items-center gap-1.5">
          <input value={installmentNo} onChange={(e) => setInstallmentNo(e.target.value.replace(/[^0-9]/g, ""))} placeholder="현재 회차" inputMode="numeric" className="w-full border rounded-lg px-2.5 py-1.5 text-[12px] text-center focus:outline-none bg-white" style={{ borderColor: ACCENT_BORDER }} />
          <span className="text-gray-400 text-[12px] shrink-0">/</span>
          <input value={installmentTotal} onChange={(e) => setInstallmentTotal(e.target.value.replace(/[^0-9]/g, ""))} placeholder="총 회차" inputMode="numeric" className="w-full border rounded-lg px-2.5 py-1.5 text-[12px] text-center focus:outline-none bg-white" style={{ borderColor: ACCENT_BORDER }} />
        </div>
      )}

      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input type="checkbox" checked={useDueDate} onChange={(e) => setUseDueDate(e.target.checked)} className="w-3.5 h-3.5" style={{ accentColor: ACCENT }} />
        <span className="text-[11.5px] font-semibold text-gray-600">만기일 입력</span>
      </label>
      {useDueDate && (
        <PlannerDatePicker value={dueDate} onChange={setDueDate} placeholder="만기일 선택" className="w-full text-left border rounded-lg px-3 py-2 text-[12.5px] bg-white" />
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onDone} className="flex-1 py-2 rounded-lg border text-gray-600 text-[12px] font-semibold bg-white" style={{ borderColor: ACCENT_BORDER }}>취소</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2 rounded-lg text-white text-[12px] font-bold" style={{ background: ACCENT }}>
          {saving ? "저장 중..." : "추가"}
        </button>
      </div>
    </div>
  );
}

export default function PlannerWalletModal({ groupId, myName, totalIncome, totalExpense, onClose }) {
  useBodyScrollLock();
  const modalRef = React.useRef(null);
  React.useEffect(() => { modalRef.current?.focus(); }, []);

  const wallet = usePlannerWallet(groupId);
  const debts = usePlannerDebts(groupId);
  const debtTotal = totalDebtAmount(debts);
  const balance = computeWalletBalance(wallet, totalIncome, totalExpense, debtTotal);

  const [editingBase, setEditingBase] = useState(!wallet);
  const [baseInput, setBaseInput] = useState(wallet ? String(wallet.baseAssets || 0) : "");
  const [saving, setSaving] = useState(false);
  const [showAddDebt, setShowAddDebt] = useState(false);

  const saveBase = async () => {
    setSaving(true);
    try {
      await setPlannerWalletBase(groupId, Number(parseAmountInput(baseInput)) || 0, myName);
      setEditingBase(false);
    } finally {
      setSaving(false);
    }
  };

  const removeDebt = async (id) => {
    if (!confirm("이 항목을 삭제할까요?")) return;
    await deletePlannerDebt(id);
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
              {debtTotal > 0 && ` · 채무 -${fmtWon(debtTotal)}`}
              {" "}· 수입·지출 반영 {totalIncome - totalExpense >= 0 ? "+" : ""}{fmtWon(totalIncome - totalExpense)}
            </div>
          )}
        </div>

        <div className="mb-4">
          <div className="text-[11.5px] font-bold text-gray-500 mb-1.5">기준 재산</div>
          {editingBase ? (
            <div className="flex gap-2">
              <input
                value={baseInput}
                onChange={(e) => setBaseInput(formatAmountInput(parseAmountInput(e.target.value)))}
                placeholder="0"
                inputMode="numeric"
                className="flex-1 min-w-0 border rounded-lg px-3 py-2 text-[13px] text-right focus:outline-none"
                style={{ borderColor: ACCENT_BORDER }}
              />
              <button onClick={saveBase} disabled={saving} className="shrink-0 px-4 rounded-lg text-white text-[12.5px] font-bold" style={{ background: ACCENT }}>
                {saving ? "저장 중" : "저장"}
              </button>
            </div>
          ) : (
            <button onClick={() => { setEditingBase(true); setBaseInput(String(wallet?.baseAssets || 0)); }} className="w-full flex items-center justify-between border rounded-lg px-3 py-2 text-[13px]" style={{ borderColor: ACCENT_BORDER }}>
              <span className="font-bold text-gray-700">{fmtWon(wallet?.baseAssets || 0)}</span>
              <span className="text-[11px] font-semibold" style={{ color: ACCENT }}>수정</span>
            </button>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11.5px] font-bold text-gray-500">우리 채무 현황 (대출금·마이너스통장 등)</div>
            {!showAddDebt && (
              <button onClick={() => setShowAddDebt(true)} className="text-[11.5px] font-bold px-2.5 py-1 rounded-full text-white" style={{ background: ACCENT }}>
                + 추가
              </button>
            )}
          </div>

          {showAddDebt && <AddDebtForm groupId={groupId} myName={myName} debts={debts} onDone={() => setShowAddDebt(false)} />}

          {debts.length === 0 ? (
            <div className="text-[11.5px] text-gray-400 text-center py-4 border rounded-xl" style={{ borderColor: ACCENT_BORDER }}>
              등록된 채무 항목이 없어요.
            </div>
          ) : (
            <div className="space-y-1.5">
              {debts.map((d) => (
                <div key={d.id} className="flex items-center justify-between border rounded-lg px-3 py-2" style={{ borderColor: ACCENT_BORDER }}>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-bold text-gray-700">{d.category}</div>
                    <div className="text-[10.5px] text-gray-400 mt-0.5">
                      {d.installmentNo && d.installmentTotal ? `${d.installmentNo}/${d.installmentTotal}회` : ""}
                      {d.installmentNo && d.installmentTotal && d.dueDate ? " · " : ""}
                      {d.dueDate ? `만기 ${d.dueDate}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-red-500 text-[13px]">-{fmtWon(d.amount)}</span>
                    <button onClick={() => removeDebt(d.id)} className="text-gray-300 hover:text-gray-500 text-[11px]">삭제</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
