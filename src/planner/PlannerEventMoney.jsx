// src/planner/PlannerEventMoney.jsx — "경조사" 메뉴 (PC/모바일 공용).
// 결혼식/장례식 등에서 누구에게 얼마를 냈는지, 누구에게 얼마를 받았는지 기록해두고
// 이름으로 검색하면 그 사람과 주고받은 내역과 잔액(누가 줄 차례인지)을 보여준다.
// 한국 가정에 실제로 필요한데 캘린더/가계부 앱엔 잘 없는 기능.
import React, { useMemo, useState } from "react";
import {
  usePlannerEntries, addPlannerEntry, deletePlannerEntry, fmtWon, todayStr,
  formatAmountInput, parseAmountInput, eventMoneyBalanceByPerson,
  EVENT_MONEY_TYPES, EVENT_MONEY_RELATIONS,
} from "../adminPlannerData";
import PlannerDatePicker from "./PlannerDatePicker";
import useBodyScrollLock from "./useBodyScrollLock";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

function fieldStyle() {
  return { borderColor: ACCENT_BORDER };
}

function AddModal({ groupId, actorUid, actorName, onClose }) {
  useBodyScrollLock();
  const modalRef = React.useRef(null);
  React.useEffect(() => { modalRef.current?.focus(); }, []);

  const [personName, setPersonName] = useState("");
  const [relation, setRelation] = useState(EVENT_MONEY_RELATIONS[0]);
  const [eventType, setEventType] = useState(EVENT_MONEY_TYPES[0]);
  const [direction, setDirection] = useState("give");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!personName.trim() || !parseAmountInput(amount)) { alert("이름과 금액을 입력해 주세요."); return; }
    setSaving(true);
    try {
      await addPlannerEntry({
        type: "eventMoney", companyName: groupId,
        personName: personName.trim(), relation, eventType, direction,
        amount: Number(parseAmountInput(amount)), date, memo: memo.trim(),
        createdByUid: actorUid, createdByName: actorName || "",
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10010] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={modalRef} tabIndex={-1} className="relative bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full sm:w-[420px] max-h-[88vh] overflow-y-auto overscroll-contain outline-none">
        <div className="text-[15px] font-extrabold text-gray-800 mb-4">경조사 기록 추가</div>

        <div className="flex gap-2 mb-3">
          {[["give", "내가 냈어요"], ["receive", "내가 받았어요"]].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setDirection(v)}
              className="flex-1 py-2.5 rounded-lg text-[12.5px] font-bold border"
              style={direction === v ? { background: ACCENT, color: "#fff", borderColor: ACCENT } : { color: ACCENT, borderColor: ACCENT_BORDER }}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-[11.5px] font-semibold text-gray-600 mb-1">이름</div>
            <input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="예: 김철수" className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none" style={fieldStyle()} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11.5px] font-semibold text-gray-600 mb-1">관계</div>
              <select value={relation} onChange={(e) => setRelation(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none bg-white" style={fieldStyle()}>
                {EVENT_MONEY_RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <div className="text-[11.5px] font-semibold text-gray-600 mb-1">경조사 종류</div>
              <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none bg-white" style={fieldStyle()}>
                {EVENT_MONEY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11.5px] font-semibold text-gray-600 mb-1">금액</div>
              <input
                value={amount}
                onChange={(e) => setAmount(formatAmountInput(parseAmountInput(e.target.value)))}
                placeholder="0"
                inputMode="numeric"
                className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none text-right"
                style={fieldStyle()}
              />
            </div>
            <div>
              <div className="text-[11.5px] font-semibold text-gray-600 mb-1">날짜</div>
              <PlannerDatePicker value={date} onChange={setDate} />
            </div>
          </div>
          <div>
            <div className="text-[11.5px] font-semibold text-gray-600 mb-1">메모 (선택)</div>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 큰이모 아들 결혼식" className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none" style={fieldStyle()} />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border text-gray-600 text-[13px] font-semibold" style={fieldStyle()}>취소</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg text-white text-[13px] font-bold disabled:opacity-50" style={{ background: ACCENT }}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlannerEventMoney({ account }) {
  const { entries } = usePlannerEntries(account.groupId);
  const [keyword, setKeyword] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [openPerson, setOpenPerson] = useState(null);

  const people = useMemo(() => eventMoneyBalanceByPerson(entries), [entries]);
  const filtered = useMemo(
    () => (keyword.trim() ? people.filter((p) => p.personName.includes(keyword.trim())) : people),
    [people, keyword]
  );

  const remove = async (id) => {
    if (!confirm("이 기록을 삭제할까요?")) return;
    await deletePlannerEntry(id);
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="text-[12.5px] text-gray-500 leading-relaxed">
        경조사비를 주고받은 내역을 이름별로 기록해두면, 나중에 그 사람에게 경조사가 생겼을 때 얼마를 줬었는지 바로 확인할 수 있어요.
      </div>

      <div className="flex gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="이름으로 검색"
          className="flex-1 min-w-0 border rounded-full px-4 py-2.5 text-[13px] focus:outline-none"
          style={fieldStyle()}
        />
        <button onClick={() => setShowAdd(true)} className="shrink-0 whitespace-nowrap px-4 rounded-full text-white text-[12.5px] font-bold" style={{ background: ACCENT }}>
          + 기록 추가
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-[12.5px] text-gray-400 text-center py-10 bg-white border rounded-xl" style={fieldStyle()}>
          {keyword ? "검색 결과가 없어요." : "아직 등록된 경조사 기록이 없어요."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const open = openPerson === p.personName;
            const balanceLabel = p.balance > 0 ? `${fmtWon(p.balance)} 받을 차례` : p.balance < 0 ? `${fmtWon(-p.balance)} 줄 차례` : "정산 완료";
            const balanceColor = p.balance > 0 ? "#2563eb" : p.balance < 0 ? "#dc2626" : "#6b7280";
            return (
              <div key={p.personName} className="bg-white border rounded-xl overflow-hidden" style={fieldStyle()}>
                <button onClick={() => setOpenPerson(open ? null : p.personName)} className="w-full flex items-center justify-between px-4 py-3">
                  <div className="text-left">
                    <div className="text-[13.5px] font-bold text-gray-800">{p.personName}</div>
                    <div className="text-[10.5px] text-gray-400 mt-0.5">{p.records.length}건 · 낸 {fmtWon(p.gave)} · 받은 {fmtWon(p.received)}</div>
                  </div>
                  <div className="text-[12px] font-bold" style={{ color: balanceColor }}>{balanceLabel}</div>
                </button>
                {open && (
                  <div className="border-t px-4 py-2 space-y-2" style={{ borderColor: ACCENT_SOFT }}>
                    {p.records.map((r) => (
                      <div key={r.id} className="flex items-center justify-between py-1.5 text-[12px]">
                        <div>
                          <span className="font-semibold text-gray-700">{r.date}</span>
                          <span className="text-gray-400 ml-2">{r.eventType} · {r.relation}</span>
                          {r.memo && <span className="text-gray-400 ml-2">{r.memo}</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold" style={{ color: r.direction === "give" ? "#dc2626" : "#2563eb" }}>
                            {r.direction === "give" ? "-" : "+"}{fmtWon(r.amount)}
                          </span>
                          <button onClick={() => remove(r.id)} className="text-gray-300 hover:text-gray-500 text-[11px]">삭제</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && <AddModal groupId={account.groupId} actorUid={account.uid} actorName={account.name} onClose={() => setShowAdd(false)} />}
    </div>
  );
}
