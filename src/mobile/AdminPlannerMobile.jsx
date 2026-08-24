// src/mobile/AdminPlannerMobile.jsx — "나의 플래너"(KP-Planner) 모바일 화면의 실제 내용.
// ⭐ 배차프로그램과는 완전히 분리된 별도 앱(src/planner/)에서만 쓰인다 — 로그인/
// 가입도 별도이고, 배차/오더 등 어떤 데이터와도 연관되지 않는다.
// PC(../AdminPlanner.jsx)와 같은 Firestore 컬렉션(adminPlannerData.js)을 공유한다.
// 생리주기/메신저/내정보 메뉴는 이 파일이 아니라 PlannerMobileShell이 별도 화면으로
// 직접 그린다(이 파일은 예전부터 있던 4개 탭: 홈/수입지출/일정/이벤트예산만 담당).
import React, { useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { KOREAN_HOLIDAYS, shortHolidayLabel } from "../CustomDatePicker";
import {
  usePlannerEntries, addPlannerEntry, updatePlannerEntry, deletePlannerEntry,
  upsertBudgetTarget, fmtWon, todayStr, formatAmountInput, parseAmountInput,
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, RECURRING_EXPENSE_CATEGORIES, RECURRING_INCOME_CATEGORIES,
  dDayLabel, ensureRecurringInstances,
  nextOccurrence, recurringDateInYear, mergeCategoryOptions, budgetStatusLabel,
  usePlannerWallet, computeWalletBalance, usePlannerDebts, totalDebtAmount,
} from "../adminPlannerData";
import { ACCENT, ACCENT_BORDER, ACCENT_SOFT } from "../planner/plannerTheme";
import { captureNodeAsImage } from "../planner/plannerCapture";
import PlannerDatePicker from "../planner/PlannerDatePicker";
import PlannerTimePicker from "../planner/PlannerTimePicker";
import PlannerDialNumber from "../planner/PlannerDialNumber";
import PlannerCategorySelect from "../planner/PlannerCategorySelect";
import PlannerReceiptCapture from "../planner/PlannerReceiptCapture";
import PlannerHomeExtras from "../planner/PlannerHomeExtras";
import PlannerUpcomingSchedule from "../planner/PlannerUpcomingSchedule";
import PlannerWalletModal from "../planner/PlannerWalletModal";
import useBodyScrollLock from "../planner/useBodyScrollLock";

function todayY() { return new Date().getFullYear(); }
// 시작~종료일 사이의 모든 날짜를 "YYYY-MM-DD" 문자열로 나열한다(둘 다 포함).
function datesBetween(start, end) {
  const out = [];
  const d = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (d <= last) {
    const pad = (n) => String(n).padStart(2, "0");
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}
function thisMonthRange() {
  const d = new Date();
  const y = d.getFullYear(), m = d.getMonth();
  const pad = (n) => String(n).padStart(2, "0");
  return { first: `${y}-${pad(m + 1)}-01`, last: `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}` };
}

// ⭐ 바깥(빈 곳)을 눌러도 닫히지 않는다 — 입력 중 실수로 밖을 눌러 내용이
// 날아가는 문제 때문에, 닫기는 "닫기/✕" 버튼으로만 하게 했다.
function Sheet({ title, onClose, children, accent }) {
  useBodyScrollLock();
  const sheetRef = useRef(null);
  React.useEffect(() => { sheetRef.current?.focus(); }, []);
  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div ref={sheetRef} tabIndex={-1} className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[88vh] overflow-y-auto overscroll-contain p-5 shadow-xl outline-none">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[15px] font-bold text-gray-800">{title}</div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div className="mb-3">
      <div className="text-[12px] font-semibold text-gray-500 mb-1">{label}</div>
      {children}
    </div>
  );
}
const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none";

function LedgerEntryModal({ initial, companyName, actorName, accent, onClose, onOpenRecurring }) {
  const [type, setType] = useState(initial?.type || "expense");
  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : "");
  const [date, setDate] = useState(initial?.date || todayStr());
  const [memo, setMemo] = useState(initial?.memo || "");
  const [receiptURL, setReceiptURL] = useState(initial?.receiptURL || "");
  const [saving, setSaving] = useState(false);
  const categoryOptions = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const save = async () => {
    if (!title.trim()) { alert("항목명을 입력해 주세요."); return; }
    if (!amount || Number(amount) <= 0) { alert("금액을 입력해 주세요."); return; }
    setSaving(true);
    try {
      const payload = { type, companyName, title: title.trim(), category: category.trim(), amount: Number(amount), date, memo: memo.trim(), createdByName: actorName || "", receiptURL: receiptURL || "" };
      if (initial?.id) await updatePlannerEntry(initial.id, payload);
      else await addPlannerEntry(payload);
      onClose();
    } catch (e) { alert("저장 중 오류: " + e.message); } finally { setSaving(false); }
  };

  return (
    <Sheet title={initial?.id ? "내역 수정" : "수입/지출 등록"} onClose={onClose} accent={accent}>
      {initial?.createdByName && <div className="text-[11px] text-gray-400 mb-3 -mt-2">등록: {initial.createdByName}</div>}
      {!initial?.id && onOpenRecurring && (
        <button type="button" onClick={() => { onClose(); onOpenRecurring(); }} className="w-full mb-3 -mt-1 text-[11.5px] font-semibold text-left" style={{ color: accent }}>
          매달 반복되는 지출/수입인가요? 정기 등록 관리 →
        </button>
      )}
      <Field label="구분">
        <div className="flex gap-2">
          {[["expense", "지출"], ["income", "수입"]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => { setType(v); setCategory(""); }}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-bold border"
              style={type === v ? { background: accent, color: "#fff", borderColor: accent } : { color: "#6b7280", borderColor: "#e5e7eb" }}>
              {l}
            </button>
          ))}
        </div>
      </Field>
      <Field label="항목명"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 사무실 임대료" /></Field>
      <Field label="분류"><PlannerCategorySelect value={category} onChange={setCategory} options={categoryOptions} className={inputCls} /></Field>
      <Field label="금액(원)"><input className={inputCls} type="text" inputMode="numeric" value={formatAmountInput(amount)} onChange={(e) => setAmount(parseAmountInput(e.target.value))} placeholder="0" /></Field>
      <Field label="날짜"><PlannerDatePicker value={date} onChange={setDate} className={inputCls + " text-left"} /></Field>
      {type === "expense" && (
        <Field label="영수증(선택)">
          <PlannerReceiptCapture groupId={companyName} photoURL={receiptURL} onPhotoChange={setReceiptURL} onScanned={(amt) => setAmount(String(amt))} />
        </Field>
      )}
      <Field label="메모"><textarea className={inputCls} rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
      <div className="flex gap-2 mt-4">
        {initial?.id && (
          <button type="button" onClick={async () => { if (!window.confirm("삭제하시겠습니까?")) return; await deletePlannerEntry(initial.id); onClose(); }}
            className="px-4 py-2.5 rounded-xl border border-red-200 text-red-500 text-[13px] font-bold">삭제</button>
        )}
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[13px] font-semibold">닫기</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: accent }}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </Sheet>
  );
}

function ScheduleEntryModal({ initial, defaultDate, companyName, actorName, accent, onClose }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [date, setDate] = useState(initial?.date || defaultDate || todayStr());
  const [time, setTime] = useState(initial?.time || "");
  const [memo, setMemo] = useState(initial?.memo || "");
  const [recurring, setRecurring] = useState(!!initial?.recurring);
  const [multiDay, setMultiDay] = useState(false);
  const [endDate, setEndDate] = useState(initial?.date || defaultDate || todayStr());
  const [saving, setSaving] = useState(false);
  const dday = dDayLabel(recurring ? nextOccurrence(date, todayStr()) : date);

  const save = async () => {
    if (!title.trim()) { alert("일정 제목을 입력해 주세요."); return; }
    if (multiDay && endDate < date) { alert("종료일이 시작일보다 빠릅니다."); return; }
    setSaving(true);
    try {
      const base = { type: "schedule", companyName, title: title.trim(), time, memo: memo.trim(), createdByName: actorName || "", recurring };
      if (initial?.id) {
        await updatePlannerEntry(initial.id, { ...base, date });
      } else if (multiDay && endDate !== date) {
        const days = datesBetween(date, endDate);
        await Promise.all(days.map((d) => addPlannerEntry({ ...base, date: d })));
      } else {
        await addPlannerEntry({ ...base, date });
      }
      onClose();
    } catch (e) { alert("저장 중 오류: " + e.message); } finally { setSaving(false); }
  };

  return (
    <Sheet title={initial?.id ? "일정 수정" : "일정 등록"} onClose={onClose} accent={accent}>
      {initial?.createdByName && <div className="text-[11px] text-gray-400 mb-3 -mt-2">등록: {initial.createdByName}</div>}
      <Field label="제목"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 세무사 미팅" /></Field>
      <Field label={multiDay ? "시작일" : `날짜${dday ? ` · ${dday}` : ""}`}>
        <PlannerDatePicker value={date} onChange={(v) => { setDate(v); if (v > endDate) setEndDate(v); }} className={inputCls + " text-left"} />
      </Field>
      {!initial?.id && (
        <label className="flex items-center gap-2 mb-3 -mt-1 cursor-pointer select-none">
          <input type="checkbox" checked={multiDay} onChange={(e) => setMultiDay(e.target.checked)} className="w-4 h-4" style={{ accentColor: accent }} />
          <span className="text-[12.5px] font-semibold text-gray-600">여러 날 동일 일정 등록 (예: 1일~3일)</span>
        </label>
      )}
      {multiDay && !initial?.id && (
        <Field label="종료일"><PlannerDatePicker value={endDate} onChange={setEndDate} className={inputCls + " text-left"} /></Field>
      )}
      <Field label="시간(선택)"><PlannerTimePicker value={time} onChange={setTime} className={inputCls + " text-left"} /></Field>
      <label className="flex items-center gap-2 mb-3 -mt-1 cursor-pointer select-none">
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="w-4 h-4" style={{ accentColor: accent }} />
        <span className="text-[12.5px] font-semibold text-gray-600">매년 반복 (생일/기념일)</span>
      </label>
      <Field label="메모"><textarea className={inputCls} rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
      <div className="flex gap-2 mt-4">
        {initial?.id && (
          <button type="button" onClick={async () => { if (!window.confirm("삭제하시겠습니까?")) return; await deletePlannerEntry(initial.id); onClose(); }}
            className="px-4 py-2.5 rounded-xl border border-red-200 text-red-500 text-[13px] font-bold">삭제</button>
        )}
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[13px] font-semibold">닫기</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: accent }}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </Sheet>
  );
}

function FamilyMemberModal({ initial, group, companyName, actorName, accent, onClose }) {
  const isEdit = !!initial?.id;
  const [name, setName] = useState(initial?.title || "");
  const [side, setSide] = useState(initial?.category || "본가");
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : "");
  const [memo, setMemo] = useState(initial?.memo || "");
  const [saving, setSaving] = useState(false);
  const [addedFlash, setAddedFlash] = useState(false);

  const doSave = async () => {
    if (!name.trim()) { alert("이름을 입력해 주세요."); return false; }
    setSaving(true);
    try {
      const payload = { type: "familyBudget", companyName, group, title: name.trim(), category: side, amount: Number(amount) || 0, memo: memo.trim(), createdByName: actorName || "" };
      if (initial?.id) await updatePlannerEntry(initial.id, payload);
      else await addPlannerEntry(payload);
      return true;
    } catch (e) { alert("저장 중 오류: " + e.message); return false; } finally { setSaving(false); }
  };
  const saveAndClose = async () => { if (await doSave()) onClose(); };
  const saveAndAddNext = async () => {
    if (await doSave()) { setName(""); setAmount(""); setMemo(""); setAddedFlash(true); setTimeout(() => setAddedFlash(false), 1200); }
  };

  return (
    <Sheet title={isEdit ? "구성원 수정" : "구성원 추가"} onClose={onClose} accent={accent}>
      {initial?.createdByName && <div className="text-[11px] text-gray-400 mb-3 -mt-2">등록: {initial.createdByName}</div>}
      {addedFlash && <div className="text-[12px] font-bold mb-3 -mt-1" style={{ color: accent }}>추가됐어요 — 다음 구성원을 입력해 주세요</div>}
      <Field label="이름"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 아버지" autoFocus /></Field>
      <Field label="구분">
        <div className="flex gap-2">
          {["본가", "처가/외가", "기타"].map((v) => (
            <button key={v} type="button" onClick={() => setSide(v)}
              className="flex-1 py-2 rounded-lg text-[12px] font-bold border"
              style={side === v ? { background: accent, color: "#fff", borderColor: accent } : { color: "#6b7280", borderColor: "#e5e7eb" }}>
              {v}
            </button>
          ))}
        </div>
      </Field>
      <Field label="금액(원)"><input className={inputCls} type="text" inputMode="numeric" value={formatAmountInput(amount)} onChange={(e) => setAmount(parseAmountInput(e.target.value))} placeholder="0" /></Field>
      <Field label="메모"><textarea className={inputCls} rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
      <div className="flex gap-2 mt-4">
        {isEdit && (
          <button type="button" onClick={async () => { if (!window.confirm("삭제하시겠습니까?")) return; await deletePlannerEntry(initial.id); onClose(); }}
            className="px-4 py-2.5 rounded-xl border border-red-200 text-red-500 text-[13px] font-bold">삭제</button>
        )}
        <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[13px] font-semibold">닫기</button>
        <button onClick={saveAndClose} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: accent }}>
          {saving ? "저장 중..." : "저장"}
        </button>
        {!isEdit && (
          <button onClick={saveAndAddNext} disabled={saving} className="flex-1 py-2.5 rounded-xl text-[13px] font-bold border" style={{ background: "#fff", color: accent, borderColor: accent }}>
            추가
          </button>
        )}
      </div>
    </Sheet>
  );
}

function NewGroupModal({ onClose, onCreate, accent }) {
  const [name, setName] = useState("");
  return (
    <Sheet title="새 이벤트 예산 만들기" onClose={onClose} accent={accent}>
      <Field label="이벤트 이름"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 2026년 추석" autoFocus /></Field>
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[13px] font-semibold">닫기</button>
        <button onClick={() => { if (!name.trim()) { alert("이름을 입력해 주세요."); return; } onCreate(name.trim()); }}
          className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: accent }}>만들기</button>
      </div>
    </Sheet>
  );
}

function RecurringManagerSheet({ templates, companyName, actorName, accent, onClose }) {
  const [title, setTitle] = useState("");
  const [entryType, setEntryType] = useState("expense");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [saving, setSaving] = useState(false);
  const categoryOptions = mergeCategoryOptions(entryType === "income" ? RECURRING_INCOME_CATEGORIES : RECURRING_EXPENSE_CATEGORIES, templates, entryType);

  const add = async () => {
    if (!title.trim() || !amount) { alert("이름과 금액을 입력해 주세요."); return; }
    setSaving(true);
    try {
      await addPlannerEntry({ type: "recurringTemplate", companyName, title: title.trim(), entryType, category: category.trim(), amount: Number(amount) || 0, dayOfMonth: Number(dayOfMonth) || 1, active: true, createdByName: actorName || "" });
      setTitle(""); setAmount(""); setCategory(""); setDayOfMonth("1");
    } finally { setSaving(false); }
  };

  return (
    <Sheet title="정기 지출/수입 자동 등록" onClose={onClose} accent={accent}>
      <div className="text-[11px] text-gray-400 mb-3">매달 지정한 날짜에 자동으로 등록돼요 (월세/보험료/구독료 등).</div>
      <Field label="이름"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 월세" /></Field>
      <Field label="구분">
        <div className="flex gap-2">
          {[["expense", "지출"], ["income", "수입"]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setEntryType(v)} className="flex-1 py-2 rounded-lg text-[12.5px] font-bold border"
              style={entryType === v ? { background: accent, color: "#fff", borderColor: accent } : { color: "#6b7280", borderColor: "#e5e7eb" }}>{l}</button>
          ))}
        </div>
      </Field>
      <Field label="분류(선택)"><PlannerCategorySelect value={category} onChange={setCategory} options={categoryOptions} className={inputCls} placeholder="분류 선택/입력" /></Field>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <input className={inputCls} type="text" inputMode="numeric" value={formatAmountInput(amount)} onChange={(e) => setAmount(parseAmountInput(e.target.value))} placeholder="금액" />
        <input className={inputCls} type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} placeholder="매월 며칠" />
      </div>
      <button onClick={add} disabled={saving} className="w-full py-2.5 rounded-xl text-white text-[13px] font-bold mb-4" style={{ background: accent }}>정기 항목 추가</button>

      <div className="text-[12px] font-bold text-gray-500 mb-2">등록된 정기 항목</div>
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {templates.length === 0 && <div className="py-6 text-center text-[12px] text-gray-400">없음</div>}
        {templates.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-3 py-2.5 border-b border-gray-50 last:border-b-0">
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-gray-800 truncate">{t.title} <span className="text-[10.5px] text-gray-400 font-normal">매월{t.dayOfMonth}일</span></div>
              <div className="text-[11.5px] font-bold" style={{ color: accent }}>{fmtWon(t.amount)}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <button onClick={() => updatePlannerEntry(t.id, { active: t.active === false })} className="text-[10.5px] font-semibold px-2 py-1 rounded-md border border-gray-200 text-gray-500">
                {t.active === false ? "재개" : "중지"}
              </button>
              <button onClick={async () => { if (window.confirm("삭제하시겠습니까?")) await deletePlannerEntry(t.id); }} className="text-[10.5px] font-semibold px-2 py-1 rounded-md border border-red-200 text-red-500">삭제</button>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function exportTableToExcel(filename, rows, headerMap) {
  const mapped = rows.map((r) => { const o = {}; Object.entries(headerMap).forEach(([k, l]) => { o[l] = r[k]; }); return o; });
  const ws = XLSX.utils.json_to_sheet(mapped);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "내역");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
async function exportPrintableToPdf(node, filename) {
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
  const img = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  let heightLeft = imgH, y = 0;
  pdf.addImage(img, "PNG", 0, y, imgW, imgH);
  heightLeft -= pageH;
  while (heightLeft > 0) { y = heightLeft - imgH; pdf.addPage(); pdf.addImage(img, "PNG", 0, y, imgW, imgH); heightLeft -= pageH; }
  pdf.save(`${filename}.pdf`);
}

function PrintableLedger({ innerRef, companyName, label, rows, totalIncome, totalExpense, accent }) {
  return (
    <div style={{ position: "fixed", left: -99999, top: 0, width: 780 }}>
      <div ref={innerRef} style={{ width: 780, background: "#fff", padding: 28 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: accent, marginBottom: 2 }}>수입·지출 내역서</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>{companyName} · {label} · 생성일 {todayStr()}</div>
        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          {[["총 수입", fmtWon(totalIncome)], ["총 지출", fmtWon(totalExpense)], ["잔액", fmtWon(totalIncome - totalExpense)]].map(([label2, val]) => (
            <div key={label2} style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>{label2}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: accent }}>{val}</div>
            </div>
          ))}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ background: accent, color: "#fff" }}>{["날짜", "구분", "항목명", "분류", "금액", "메모"].map((h) => <th key={h} style={{ padding: "8px 6px", textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 ? "#f8fafc" : "#fff" }}>
                <td style={{ padding: "6px" }}>{r.date}</td>
                <td style={{ padding: "6px" }}>{r.type === "income" ? "수입" : "지출"}</td>
                <td style={{ padding: "6px" }}>{r.title}</td>
                <td style={{ padding: "6px" }}>{r.category}</td>
                <td style={{ padding: "6px", textAlign: "right" }}>{fmtWon(r.amount)}</td>
                <td style={{ padding: "6px", color: "#64748b" }}>{r.memo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function PrintableFamily({ innerRef, companyName, group, rows, total, accent }) {
  return (
    <div style={{ position: "fixed", left: -99999, top: 0, width: 700 }}>
      <div ref={innerRef} style={{ width: 700, background: "#fff", padding: 28 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: accent, marginBottom: 2 }}>{group} — 이벤트 예산표</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>{companyName} · 생성일 {todayStr()}</div>
        <div style={{ marginBottom: 16, border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", display: "inline-block" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>총 예산</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: accent }}>{fmtWon(total)}</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ background: accent, color: "#fff" }}>{["이름", "구분", "금액", "메모"].map((h) => <th key={h} style={{ padding: "8px 6px", textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 ? "#f8fafc" : "#fff" }}>
                <td style={{ padding: "6px" }}>{r.title}</td>
                <td style={{ padding: "6px" }}>{r.category}</td>
                <td style={{ padding: "6px", textAlign: "right" }}>{fmtWon(r.amount)}</td>
                <td style={{ padding: "6px", color: "#64748b" }}>{r.memo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ⭐ activeTab/onTabChange를 넘기면(플래너 전용 권한의 모바일 셸처럼 바깥 햄버거
// 메뉴가 탭 이동을 대신 담당하는 경우) 내부 탭바를 안 그리고 바깥에서 준 탭을
// 그대로 따른다 — 그 외(최고관리자가 일반 메뉴에서 들어온 경우)에는 예전처럼
// 내부 탭바로 스스로 탭을 관리한다.
export default function AdminPlannerMobile({ userCompany, dispatcherName, activeTab, onTabChange, hideTabBar = false, myUid, myGender, coupleStartDate }) {
  const accent = ACCENT;
  const companyName = userCompany || localStorage.getItem("userCompany") || "";
  const { entries } = usePlannerEntries(companyName);
  const [internalTab, setInternalTab] = useState("dashboard");
  const tab = activeTab ?? internalTab;
  const setTab = onTabChange ?? setInternalTab;
  const [year, setYear] = useState(todayY());

  const incomeExpense = useMemo(() => entries.filter((e) => e.type === "income" || e.type === "expense"), [entries]);
  const schedules = useMemo(() => entries.filter((e) => e.type === "schedule"), [entries]);
  const familyEntries = useMemo(() => entries.filter((e) => e.type === "familyBudget"), [entries]);
  const recurringTemplates = useMemo(() => entries.filter((e) => e.type === "recurringTemplate"), [entries]);
  const budgetTarget = useMemo(() => entries.find((e) => e.type === "budgetTarget" && String(e.year) === String(year))?.amount || 0, [entries, year]);
  const yearRows = useMemo(() => incomeExpense.filter((e) => String(e.date || "").slice(0, 4) === String(year)), [incomeExpense, year]);
  const totalIncome = useMemo(() => yearRows.filter((r) => r.type === "income").reduce((s, r) => s + Number(r.amount || 0), 0), [yearRows]);
  const totalExpense = useMemo(() => yearRows.filter((r) => r.type === "expense").reduce((s, r) => s + Number(r.amount || 0), 0), [yearRows]);
  const groups = useMemo(() => {
    const map = new Map();
    familyEntries.forEach((e) => { const g = e.group || "미지정"; if (!map.has(g)) map.set(g, []); map.get(g).push(e); });
    return Array.from(map.entries());
  }, [familyEntries]);

  React.useEffect(() => {
    if (companyName) ensureRecurringInstances(companyName, entries, dispatcherName);
  }, [companyName, entries, dispatcherName]);

  return (
    <div className="px-4 pt-3 pb-24">
      <div className="flex items-center justify-center gap-3 mb-3">
        <button onClick={() => setYear((y) => y - 1)} className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500">‹</button>
        <div className="text-[14px] font-bold text-gray-700">{year}년</div>
        <button onClick={() => setYear((y) => y + 1)} className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500">›</button>
      </div>
      {!hideTabBar && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto">
          {[["dashboard", "홈"], ["ledger", "수입·지출"], ["calendar", "일정"], ["family", "이벤트 예산"]].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className="shrink-0 px-3 py-1.5 text-[12px] font-bold rounded-lg border"
              style={tab === v ? { background: accent, color: "#fff", borderColor: accent } : { color: accent, borderColor: accent }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {tab === "dashboard" && (
        <MobileDashboard year={year} budgetTarget={budgetTarget} totalIncome={totalIncome} totalExpense={totalExpense}
          schedules={schedules} groups={groups} companyName={companyName} actorName={dispatcherName} entries={entries} accent={accent} incomeExpense={incomeExpense}
          myUid={myUid} myGender={myGender} coupleStartDate={coupleStartDate} />
      )}
      {tab === "ledger" && <MobileLedger rows={incomeExpense} companyName={companyName} actorName={dispatcherName} accent={accent} recurringTemplates={recurringTemplates} entries={entries} />}
      {tab === "calendar" && <MobileCalendar year={year} schedules={schedules} companyName={companyName} actorName={dispatcherName} accent={accent} />}
      {tab === "family" && <MobileFamily groups={groups} companyName={companyName} actorName={dispatcherName} accent={accent} />}
    </div>
  );
}

function MobileDashboard({ year, budgetTarget, totalIncome, totalExpense, schedules, groups, companyName, actorName, entries, accent, incomeExpense, myUid, myGender, coupleStartDate }) {
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(budgetTarget || ""));
  const [sharing, setSharing] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(null); // null | "new" | 일정 entry 객체
  const balance = totalIncome - totalExpense;
  const printRef = useRef(null);
  const upcoming = useMemo(() => {
    const t = todayStr();
    return schedules
      .map((s) => ({ ...s, effectiveDate: s.recurring ? nextOccurrence(s.date, t) : s.date }))
      .filter((s) => (s.effectiveDate || "") >= t)
      .sort((a, b) => (a.effectiveDate || "").localeCompare(b.effectiveDate || ""));
  }, [schedules]);
  const familyTotal = useMemo(() => groups.reduce((sum, [, rows]) => sum + rows.reduce((s, r) => s + Number(r.amount || 0), 0), 0), [groups]);
  const { first, last } = thisMonthRange();
  const monthRows = useMemo(() => incomeExpense.filter((r) => (r.date || "") >= first && (r.date || "") <= last), [incomeExpense, first, last]);
  const monthIncome = monthRows.filter((r) => r.type === "income").reduce((s, r) => s + Number(r.amount || 0), 0);
  const monthExpense = monthRows.filter((r) => r.type === "expense").reduce((s, r) => s + Number(r.amount || 0), 0);

  const shareMonthly = async () => {
    setSharing(true);
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const pdf = new jsPDF("p", "mm", "a4");
      const imgW = pdf.internal.pageSize.getWidth();
      const imgH = (canvas.height * imgW) / canvas.width;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, imgW, imgH);
      const blob = pdf.output("blob");
      const file = new File([blob], `이달의요약_${first.slice(0, 7)}.pdf`, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "이달의 요약" }); } catch {}
      } else {
        pdf.save(`이달의요약_${first.slice(0, 7)}.pdf`);
      }
    } finally { setSharing(false); }
  };

  return (
    <div>
      <PlannerHomeExtras groupId={companyName} myUid={myUid} myName={actorName} myGender={myGender} coupleStartDate={coupleStartDate} />
      {/* ⭐ 예전엔 예산/수입지출/일정/이벤트예산이 각각 다른 카드로 따로 떨어져
          있었다. 카드 하나로 합치고, 그 안을 주제별로 구분선/소제목으로 나눴다. */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-3.5">
          <button onClick={shareMonthly} disabled={sharing} className="w-full py-2.5 rounded-xl text-white text-[12.5px] font-bold" style={{ background: accent }}>
            {sharing ? "생성 중..." : "이번 달 요약 카톡 공유"}
          </button>
        </div>

        <div className="px-3.5 pb-3.5">
          <div className="text-[11.5px] font-bold mb-2" style={{ color: accent }}>예산</div>
          <div className="bg-white border rounded-xl p-3.5 mb-2.5" style={{ borderColor: ACCENT_BORDER }}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-bold text-gray-500">{year}년 총예산 목표</div>
              <button onClick={() => setEditingBudget((v) => !v)} className="text-[11px] font-semibold" style={{ color: accent }}>수정</button>
            </div>
            {editingBudget ? (
              <div className="flex gap-1.5 mt-1">
                <input className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" type="text" inputMode="numeric" value={formatAmountInput(budgetInput)} onChange={(e) => setBudgetInput(parseAmountInput(e.target.value))} />
                <button onClick={async () => { await upsertBudgetTarget({ companyName, year, amount: budgetInput, entries, actorName }); setEditingBudget(false); }}
                  className="shrink-0 whitespace-nowrap px-3 rounded-lg text-white text-[12px] font-bold" style={{ background: accent }}>저장</button>
              </div>
            ) : (
              <PlannerDialNumber value={budgetTarget} className="text-[18px] font-extrabold" style={{ color: accent }} />
            )}
          </div>
          {budgetTarget > 0 && (() => {
            const pct = (totalExpense / budgetTarget) * 100;
            const status = budgetStatusLabel(pct);
            return (
              <div className="bg-white border rounded-xl p-3.5" style={{ borderColor: ACCENT_BORDER }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="text-[11px] font-bold text-gray-600">예산 대비 지출</div>
                    <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-extrabold text-white" style={{ background: status.color }}>{status.label}</span>
                  </div>
                  <div className="text-[10.5px] font-semibold text-gray-500">{Math.round(pct)}%</div>
                </div>
                <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: status.color }} />
                </div>
              </div>
            );
          })()}
        </div>

        <div className="border-t-2 border-gray-100 px-3.5 py-3.5">
          <div className="text-[11.5px] font-bold mb-2" style={{ color: accent }}>수입·지출</div>
          <div className="grid grid-cols-2 gap-2.5 mb-2.5">
            <div className="bg-white border rounded-xl p-3" style={{ borderColor: ACCENT_BORDER }}>
              <div className="text-[11px] font-bold text-gray-500 mb-1">총 수입</div>
              <PlannerDialNumber value={totalIncome} className="text-[15px] font-extrabold text-gray-700" />
            </div>
            <div className="bg-white border rounded-xl p-3" style={{ borderColor: ACCENT_BORDER }}>
              <div className="text-[11px] font-bold text-gray-500 mb-1">총 지출</div>
              <PlannerDialNumber value={totalExpense} className="text-[15px] font-extrabold text-red-600" />
            </div>
          </div>
          <div className="bg-white border rounded-xl p-3" style={{ borderColor: ACCENT_BORDER }}>
            <div className="text-[11px] font-bold text-gray-500 mb-1">잔액</div>
            <PlannerDialNumber value={balance} className="text-[16px] font-extrabold" style={{ color: balance >= 0 ? accent : "#dc2626" }} />
          </div>
        </div>

        <div className="border-t-2 border-gray-100 px-3.5 py-3.5">
          <PlannerUpcomingSchedule
            upcoming={upcoming}
            onAdd={() => setScheduleModal("new")}
            onSelect={(s) => setScheduleModal(s)}
            bare
            titleClassName="text-[11.5px] font-bold mb-2"
            titleColor={accent}
          />
        </div>

        <div className="border-t-2 border-gray-100 px-3.5 py-3.5">
          <div className="text-[11.5px] font-bold mb-2" style={{ color: accent }}>이벤트 예산</div>
          {groups.length === 0 && <div className="text-[12px] text-gray-500 py-3 text-center">등록된 이벤트 예산이 없습니다</div>}
          <div className="space-y-2">
            {groups.map(([g, rows]) => (
              <div key={g} className="flex items-center justify-between text-[12.5px] border-b border-gray-100 last:border-b-0 pb-2 last:pb-0">
                <span className="text-gray-700 font-semibold truncate">{g}</span>
                <span className="text-gray-600 shrink-0 ml-2">{fmtWon(rows.reduce((s, r) => s + Number(r.amount || 0), 0))}</span>
              </div>
            ))}
          </div>
          {groups.length > 0 && (
            <div className="flex items-center justify-between text-[12.5px] mt-2 pt-2 border-t border-gray-100 font-bold" style={{ color: accent }}>
              <span>합계</span><PlannerDialNumber value={familyTotal} />
            </div>
          )}
        </div>
      </div>
      <PrintableLedger innerRef={printRef} companyName={companyName} label={`${first.slice(0, 7)} 이번 달 요약`} rows={monthRows} totalIncome={monthIncome} totalExpense={monthExpense} accent={accent} />

      {scheduleModal && (
        <ScheduleEntryModal
          initial={scheduleModal === "new" ? null : scheduleModal}
          defaultDate={todayStr()}
          companyName={companyName}
          actorName={actorName}
          accent={accent}
          onClose={() => setScheduleModal(null)}
        />
      )}
    </div>
  );
}

const WEEKDAY_KO_M = ["일", "월", "화", "수", "목", "금", "토"];
function dateLabelKoM(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${dateStr}(${WEEKDAY_KO_M[d.getDay()]})`;
}

// ⭐ 시작일/종료일/구분은 누르는 즉시 바로 반영된다(내역을 등록하면 결과에 바로
// 나와야 한다는 요구사항) — 검색어만 "조회" 버튼(또는 Enter)을 눌러야 반영된다.
// 내역추가/저장(이미지)/PDF/분류별합계/날짜별목록을 카드 하나로 합쳤고, 저장·PDF는
// 상단 오른쪽에 작은 버튼으로 뺐다. 정기 지출 등록은 "내역 추가" 안에서 연결된다.
function MobileLedger({ rows, companyName, actorName, accent, recurringTemplates, entries }) {
  const monthDefault = thisMonthRange();
  const [filters, setFilters] = useState({ start: monthDefault.first, end: monthDefault.last, kind: "all" });
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keywordApplied, setKeywordApplied] = useState("");
  const [editing, setEditing] = useState(null);
  const [showRecurring, setShowRecurring] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const printRef = useRef(null);
  const viewRef = useRef(null);
  const wallet = usePlannerWallet(companyName);
  const debts = usePlannerDebts(companyName);

  const runQuery = () => setKeywordApplied(keywordDraft);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => (!filters.start || (r.date || "") >= filters.start) && (!filters.end || (r.date || "") <= filters.end))
      .filter((r) => filters.kind === "all" || r.type === filters.kind)
      .filter((r) => {
        if (!keywordApplied.trim()) return true;
        const k = keywordApplied.trim().toLowerCase();
        return (r.title || "").toLowerCase().includes(k) || (r.category || "").toLowerCase().includes(k) || (r.memo || "").toLowerCase().includes(k);
      })
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [rows, filters, keywordApplied]);

  const totalIncome = filtered.filter((r) => r.type === "income").reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalExpense = filtered.filter((r) => r.type === "expense").reduce((s, r) => s + Number(r.amount || 0), 0);
  const walletBalance = computeWalletBalance(wallet, totalIncome, totalExpense, totalDebtAmount(debts));

  const categoryTotals = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      const cat = r.category?.trim() || "미분류";
      map.set(cat, (map.get(cat) || 0) + (r.type === "income" ? Number(r.amount || 0) : -Number(r.amount || 0)));
    });
    return Array.from(map.entries()).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  }, [filtered]);

  const dateGroups = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => { const d = r.date || "날짜없음"; if (!map.has(d)) map.set(d, []); map.get(d).push(r); });
    return Array.from(map.entries());
  }, [filtered]);

  const saveImage = async () => {
    setSaving(true);
    try { await captureNodeAsImage(viewRef.current, `수입지출_${filters.start}_${filters.end}`); } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10.5px] font-semibold text-gray-400 mb-1">시작일</div>
            <PlannerDatePicker value={filters.start} onChange={(v) => setFilters((d) => ({ ...d, start: v }))} className="w-full text-left border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12px]" />
          </div>
          <div>
            <div className="text-[10.5px] font-semibold text-gray-400 mb-1">종료일</div>
            <PlannerDatePicker value={filters.end} onChange={(v) => setFilters((d) => ({ ...d, end: v }))} className="w-full text-left border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12px]" />
          </div>
        </div>
        <div className="flex gap-1.5">
          {[["all", "전체"], ["income", "수입"], ["expense", "지출"]].map(([v, l]) => (
            <button key={v} onClick={() => setFilters((d) => ({ ...d, kind: v }))}
              className="flex-1 py-1.5 rounded-lg text-[11.5px] font-bold border" style={filters.kind === v ? { background: accent, color: "#fff", borderColor: accent } : { color: "#6b7280", borderColor: "#e5e7eb" }}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input value={keywordDraft} onChange={(e) => setKeywordDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runQuery(); }}
            placeholder="항목명/분류/메모 검색" className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12px]" />
          <button onClick={runQuery} className="shrink-0 whitespace-nowrap px-4 py-1.5 rounded-lg text-white text-[12px] font-bold" style={{ background: accent }}>조회</button>
        </div>
      </div>

      <div ref={viewRef} className="bg-white border border-gray-200 rounded-xl p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[12.5px] font-bold text-gray-700">수입·지출 내역</div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowWallet(true)} className="px-2 py-1 rounded-md border border-gray-200 flex items-center gap-1 shrink-0 text-[11px] font-semibold" style={{ color: accent }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
              </svg>
              내지갑
            </button>
            <button onClick={() => setEditing({})} className="px-2.5 py-1 rounded-md text-white text-[11px] font-bold" style={{ background: accent }}>내역 추가</button>
            <button onClick={saveImage} disabled={saving} className="px-2.5 py-1 rounded-md border border-gray-200 text-[11px] font-semibold text-gray-500">
              {saving ? "저장중" : "저장"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-white border rounded-lg px-2.5 py-2" style={{ borderColor: ACCENT_BORDER }}>
            <div className="text-[10px] text-gray-500">수입</div>
            <PlannerDialNumber value={totalIncome} className="text-[12.5px] font-bold text-gray-700" />
          </div>
          <div className="bg-white border rounded-lg px-2.5 py-2" style={{ borderColor: ACCENT_BORDER }}>
            <div className="text-[10px] text-gray-500">지출</div>
            <PlannerDialNumber value={totalExpense} className="text-[12.5px] font-bold text-red-600" />
          </div>
          <div className="bg-white border rounded-lg px-2.5 py-2" style={{ borderColor: ACCENT_BORDER }}>
            <div className="text-[10px] text-gray-500">잔액</div>
            <PlannerDialNumber value={walletBalance != null ? walletBalance : totalIncome - totalExpense} className="text-[12.5px] font-bold" style={{ color: accent }} />
          </div>
        </div>

        <button
          onClick={() => setShowDetail((v) => !v)}
          className="w-full py-2 rounded-lg border text-[12px] font-bold mb-1"
          style={{ borderColor: accent, color: accent }}
        >
          {showDetail ? "상세내역 닫기 ▲" : "상세내역보기 ▼"}
        </button>

        {showDetail && (
          <>
            {categoryTotals.length > 0 && (
              <div className="mb-3 mt-2">
                <div className="text-[11px] font-bold text-gray-500 mb-1.5">분류별 합계</div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {categoryTotals.map(([cat, amt]) => (
                    <div key={cat} className="shrink-0 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white">
                      <span className="text-[10.5px] text-gray-400 mr-1">{cat}</span>
                      <span className={`text-[11.5px] font-bold whitespace-nowrap ${amt < 0 ? "text-red-600" : "text-gray-700"}`}>
                        {amt >= 0 ? "+" : ""}{amt.toLocaleString()}원
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dateGroups.length === 0 && <div className="py-10 text-center text-[12.5px] text-gray-400">등록된 내역이 없습니다</div>}
            <div className="space-y-3">
              {dateGroups.map(([date, items]) => (
                <div key={date}>
                  <div className="text-[11px] font-bold text-gray-500 mb-1.5 px-0.5">{dateLabelKoM(date)}</div>
                  <div className="space-y-1.5">
                    {items.map((r) => (
                      <div key={r.id} onClick={() => setEditing(r)} className="bg-white border rounded-xl p-3" style={{ borderColor: ACCENT_BORDER }}>
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9.5px] font-bold ${r.type === "income" ? "text-gray-600" : "bg-red-50 text-red-500"}`} style={r.type === "income" ? { background: ACCENT_SOFT } : undefined}>
                              {r.type === "income" ? "수입" : "지출"}
                            </span>
                            {r.receiptURL && (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                              </svg>
                            )}
                            <span className="text-[13px] font-bold text-gray-800 truncate">{r.title}</span>
                          </div>
                          <span className={`text-[13px] font-extrabold shrink-0 ml-2 ${r.type === "income" ? "text-gray-700" : "text-red-600"}`}>{fmtWon(r.amount)}</span>
                        </div>
                        <div className="text-[10.5px] text-gray-400">
                          {r.category || "미분류"}{r.memo ? ` · ${r.memo}` : ""}{r.createdByName ? ` · ${r.createdByName}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <PrintableLedger innerRef={printRef} companyName={companyName} label={`${filters.start} ~ ${filters.end}`} rows={filtered} totalIncome={totalIncome} totalExpense={totalExpense} accent={accent} />
      {editing && (
        <LedgerEntryModal
          initial={editing.id ? editing : null}
          companyName={companyName}
          actorName={actorName}
          accent={accent}
          onClose={() => setEditing(null)}
          onOpenRecurring={() => setShowRecurring(true)}
        />
      )}
      {showRecurring && <RecurringManagerSheet templates={recurringTemplates} companyName={companyName} actorName={actorName} accent={accent} onClose={() => setShowRecurring(false)} />}
      {showWallet && <PlannerWalletModal groupId={companyName} myName={actorName} totalIncome={totalIncome} totalExpense={totalExpense} onClose={() => setShowWallet(false)} />}
    </div>
  );
}

function MobileCalendar({ year, schedules, companyName, actorName, accent }) {
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(year);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [editing, setEditing] = useState(null);
  React.useEffect(() => { setViewYear(year); }, [year]);

  // ⭐ 매년 반복(생일/기념일)은 보고 있는 연도(viewYear) 기준 월/일로 다시 계산해서
  // 매년 같은 날에 나타나게 한다.
  const byDate = useMemo(() => {
    const map = new Map();
    schedules.forEach((s) => {
      if (!s.date) return;
      const key = s.recurring ? recurringDateInYear(s.date, viewYear) : s.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    });
    return map;
  }, [schedules, viewYear]);

  const first = new Date(viewYear, viewMonth, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const fmt = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const todayS = todayStr();
  const goMonth = (delta) => { let m = viewMonth + delta, y = viewYear; if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; } setViewMonth(m); setViewYear(y); };
  // ⭐ 예전엔 선택한 날짜의 일정만 보였는데, 이번 달 전체에 등록된 일정을 아래에
  // 쭉 보여주고, 날짜를 선택하면 그 날 일정만 맨 위로 올라오는 방식으로 바꿨다.
  // "새로고침"을 누르면 선택 날짜가 오늘로 리셋되며 원래 순서로 돌아온다.
  const monthItems = useMemo(() => {
    const mm = String(viewMonth + 1).padStart(2, "0");
    const prefix = `${viewYear}-${mm}`;
    const rows = [];
    byDate.forEach((items, dateKey) => { if (dateKey.startsWith(prefix)) rows.push(...items.map((it) => ({ ...it, __effDate: dateKey }))); });
    return rows.sort((a, b) => (a.__effDate || "").localeCompare(b.__effDate || ""));
  }, [byDate, viewYear, viewMonth]);
  const displayItems = useMemo(() => {
    const selected = monthItems.filter((it) => it.__effDate === selectedDate);
    const rest = monthItems.filter((it) => it.__effDate !== selectedDate);
    return [...selected, ...rest];
  }, [monthItems, selectedDate]);

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => goMonth(-1)} className="w-7 h-7 rounded-lg text-base font-bold" style={{ color: accent }}>‹</button>
          <div className="text-[13px] font-bold" style={{ color: accent }}>{viewYear}년 {viewMonth + 1}월</div>
          <button onClick={() => goMonth(1)} className="w-7 h-7 rounded-lg text-base font-bold" style={{ color: accent }}>›</button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
            <div key={w} className={`text-center text-[11px] font-extrabold py-1 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"}`}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d == null) return <div key={i} />;
            const dateStr = fmt(viewYear, viewMonth, d);
            const dow = new Date(viewYear, viewMonth, d).getDay();
            const holidayName = KOREAN_HOLIDAYS[dateStr];
            const isToday = dateStr === todayS;
            const isSel = dateStr === selectedDate;
            const items = byDate.get(dateStr) || [];
            return (
              <button key={i} type="button" onClick={() => setSelectedDate(dateStr)}
                className="min-h-[44px] rounded-lg text-[12px] font-semibold flex flex-col items-center justify-center gap-0.5 py-1"
                style={isSel ? { background: accent, color: "#fff" } : isToday ? { border: `2px solid ${accent}`, color: "#374151" } : { color: holidayName || dow === 0 ? "#ef4444" : dow === 6 ? "#3b82f6" : "#374151" }}>
                <span>{d}</span>
                {items.length > 0 && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? "bg-white" : ""}`} style={!isSel ? { background: accent } : undefined} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="text-[12.5px] font-bold text-gray-600">{viewYear}년 {viewMonth + 1}월 등록된 일정</div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => setSelectedDate(todayS)} className="px-2 py-1 rounded-lg border text-[11px] font-bold" style={{ color: accent, borderColor: accent }}>새로고침</button>
          <button onClick={() => setEditing({ date: selectedDate })} className="px-2.5 py-1 rounded-lg text-white text-[11px] font-bold" style={{ background: accent }}>일정 추가</button>
        </div>
      </div>
      {displayItems.length === 0 && <div className="bg-white border border-gray-200 rounded-xl py-8 text-center text-[12px] text-gray-400">등록된 일정이 없습니다</div>}
      <div className="space-y-2">
        {displayItems.map((it) => {
          const dday = dDayLabel(it.recurring ? nextOccurrence(it.date, todayStr()) : it.date);
          const isSelected = it.__effDate === selectedDate;
          return (
            <div
              key={it.id}
              onClick={() => setEditing(it)}
              className="bg-white border rounded-xl p-3 active:bg-gray-50"
              style={{ borderColor: isSelected ? accent : "#e5e7eb", borderWidth: isSelected ? 1.5 : 1 }}
            >
              <div className="text-[13px] font-bold text-gray-800 flex items-center gap-1.5">
                {dday && <span className="px-1.5 py-0.5 rounded text-[9.5px] font-extrabold" style={{ background: accent, color: "#fff" }}>{dday}</span>}
                {it.title}
                <span className="text-[10.5px] text-gray-400 font-normal">{it.__effDate}</span>
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {it.time ? `${it.time} · ` : ""}{it.memo || ""}{it.createdByName ? ` · ${it.createdByName}` : ""}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <ScheduleEntryModal initial={editing.id ? editing : null} defaultDate={editing.date} companyName={companyName} actorName={actorName} accent={accent} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

// ⭐ 본가/처가·외가를 섞어 한 리스트로 보여주던 예전 방식 대신, 묶음 하나를 좌우
// 두 칸("본가" | "처가·외가")으로 딱 나눠 보여준다. 두 칸 사이·카드 사이에 뚜렷한
// 구분선을 넣었다("구분이 부족해 보인다"는 피드백 반영).
const FAMILY_SIDES_M = ["본가", "처가/외가"];

// ⭐ 부모(MobileFamily의 grid)는 두 칸의 높이를 자동으로 같게 늘려주지만(grid 기본
// align-items: stretch), 이 컴포넌트 자신이 h-full로 그 높이를 실제로 채우고 안의
// 목록 박스가 flex-1로 남는 공간을 흡수해야 "소계"가 양쪽 다 같은 줄(맨 아래)에
// 맞춰진다 — h-full이 빠져있던 게 인원수가 다를 때 소계 위치가 어긋나던 원인이었다.
function MobileFamilyColumn({ title, rows, accent, onEdit }) {
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  return (
    <div className="min-w-0 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[12.5px] font-bold text-gray-700">{title}</div>
        <div className="text-[11px] font-semibold text-gray-500">{rows.length}명</div>
      </div>
      <div className="bg-white rounded-lg border overflow-hidden flex-1" style={{ borderColor: ACCENT_BORDER }}>
        {rows.length === 0 && <div className="py-4 text-center text-[11.5px] text-gray-400">없음</div>}
        {rows.map((r, idx) => (
          <div key={r.id} onClick={() => onEdit(r)} className="flex items-center justify-between gap-2 px-2.5 py-2" style={idx > 0 ? { borderTop: `2px solid ${ACCENT_BORDER}` } : undefined}>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-gray-900 truncate">{r.title}</div>
              {r.createdByName && <div className="text-[10.5px] text-gray-400 truncate">{r.createdByName}</div>}
            </div>
            <span className="text-[12px] font-bold text-gray-700 shrink-0">{fmtWon(r.amount)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-[12px] mt-1.5 text-gray-600 font-semibold">
        <span>소계</span><PlannerDialNumber value={total} className="font-bold text-[12.5px]" style={{ color: accent }} />
      </div>
    </div>
  );
}

function collapseKeyM(g) { return `kpplanner_collapse_${g}`; }

function MobileEventBudgetCard({ g, rows, companyName, accent, onAddMember, onEditMember }) {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(collapseKeyM(g)) === "1"; } catch { return false; } });
  const toggle = () => setCollapsed((v) => { const next = !v; try { localStorage.setItem(collapseKeyM(g), next ? "1" : "0"); } catch {} return next; });
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const bySide = FAMILY_SIDES_M.map((side) => [side, rows.filter((r) => r.category === side)]);
  const etc = rows.filter((r) => !FAMILY_SIDES_M.includes(r.category));
  const printRef = useRef(null);

  if (collapsed) {
    return (
      <button onClick={toggle} className="w-full bg-white border rounded-xl px-3.5 py-3 flex items-center justify-between text-left" style={{ borderColor: ACCENT_BORDER }}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-gray-300 text-[11px]">▸</span>
          <span className="text-[13px] font-bold text-gray-800 truncate">{g} 이벤트</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] font-semibold text-gray-500">{rows.length}명</span>
          <PlannerDialNumber value={total} className="text-[13px] font-extrabold" style={{ color: accent }} />
        </div>
      </button>
    );
  }

  return (
    <div className="bg-white border rounded-xl overflow-hidden" style={{ borderColor: ACCENT_BORDER }}>
      <div className="px-3.5 py-3 border-b" style={{ borderColor: ACCENT_SOFT }}>
        <button onClick={toggle} className="flex items-center gap-1.5 mb-1.5">
          <span className="text-gray-300 text-[11px]">▾</span>
          <span className="text-[13px] font-bold text-gray-800">{g}</span>
        </button>
        <div className="flex items-center gap-3">
          <button onClick={() => exportTableToExcel(`${g}_이벤트예산`, rows, { title: "이름", category: "구분", amount: "금액", memo: "메모" })} className="text-[11px] font-semibold text-gray-400">엑셀</button>
          <button onClick={() => exportPrintableToPdf(printRef.current, `${g}_이벤트예산`)} className="text-[11px] font-semibold text-gray-400">PDF</button>
          <button onClick={() => onAddMember(g)} className="ml-auto text-[11px] font-semibold text-white px-2 py-1 rounded-md" style={{ background: accent }}>구성원 추가</button>
        </div>
      </div>

      <div className="p-3 grid grid-cols-2 gap-3">
        {bySide.map(([side, sideRows]) => (
          <div key={side} className={side === FAMILY_SIDES_M[1] ? "pl-3" : ""} style={side === FAMILY_SIDES_M[1] ? { borderLeft: `2px solid ${ACCENT_BORDER}` } : undefined}>
            <MobileFamilyColumn title={side} rows={sideRows} accent={accent} onEdit={(r) => onEditMember(g, r)} />
          </div>
        ))}
      </div>

      {etc.length > 0 && (
        <div className="px-3 pb-3">
          <div className="text-[11.5px] font-bold text-gray-600 mb-1.5">기타</div>
          <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: ACCENT_BORDER }}>
            {etc.map((r, idx) => (
              <div key={r.id} onClick={() => onEditMember(g, r)} className="flex items-center justify-between px-2.5 py-2" style={idx > 0 ? { borderTop: `2px solid ${ACCENT_BORDER}` } : undefined}>
                <span className="text-[12px] font-semibold text-gray-800 truncate">{r.title}</span>
                <span className="text-[11px] font-bold text-gray-600 shrink-0 ml-2">{fmtWon(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-3.5 py-2.5 flex items-center justify-between border-t border-gray-100" style={{ background: `${accent}0a` }}>
        <span className="text-[11px] font-semibold text-gray-500">총 {rows.length}명</span>
        <PlannerDialNumber value={total} className="text-[13px] font-extrabold" style={{ color: accent }} />
      </div>

      <PrintableFamily innerRef={printRef} companyName={companyName} group={g} rows={rows} total={total} accent={accent} />
    </div>
  );
}

function MobileFamily({ groups, companyName, actorName, accent }) {
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setShowNewGroup(true)} className="px-3 py-1.5 rounded-lg text-white text-[12px] font-bold" style={{ background: accent }}>새 이벤트 예산</button>
      </div>
      {groups.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl py-14 text-center text-[12.5px] text-gray-400 px-6">
          등록된 이벤트 예산이 없습니다. "새 이벤트 예산"으로 명절·경조사·여행 예산표를 만들어 보세요.
        </div>
      )}
      <div className="space-y-3">
        {groups.map(([g, rows]) => (
          <MobileEventBudgetCard key={g} g={g} rows={rows} companyName={companyName} accent={accent}
            onAddMember={(group) => setEditingMember({ group })} onEditMember={(group, entry) => setEditingMember({ group, entry })} />
        ))}
      </div>
      {showNewGroup && <NewGroupModal accent={accent} onClose={() => setShowNewGroup(false)} onCreate={(name) => { setShowNewGroup(false); setEditingMember({ group: name }); }} />}
      {editingMember && (
        <FamilyMemberModal initial={editingMember.entry} group={editingMember.group} companyName={companyName} actorName={actorName} accent={accent} onClose={() => setEditingMember(null)} />
      )}
    </div>
  );
}
