// src/AdminPlanner.jsx — "나의 플래너"(KP-Planner) PC 화면의 실제 내용.
// ⭐ 배차프로그램과는 완전히 분리된 별도 앱(src/planner/)에서만 쓰인다 —
// 로그인/가입도 별도이고, 배차/오더/거래처 등 어떤 데이터와도 연관되지 않는다.
// 수입/지출 가계부, 일정 달력, 이벤트(명절/여행 등) 예산을 자유롭게 기록하고
// PDF/엑셀로 내보낼 수 있다. userCompany prop에는 회사명이 아니라 planner/plannerAuth.js가
// 발급하는 "가족 코드"(groupId)가 들어온다(이 값을 기준으로 데이터가 나뉜다).
import React, { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { KOREAN_HOLIDAYS, shortHolidayLabel } from "./CustomDatePicker";
import {
  usePlannerEntries, addPlannerEntry, updatePlannerEntry, deletePlannerEntry,
  upsertBudgetTarget, fmtWon, todayStr, formatAmountInput, parseAmountInput,
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, RECURRING_EXPENSE_CATEGORIES, RECURRING_INCOME_CATEGORIES,
  dDayLabel, ensureRecurringInstances,
  nextOccurrence, recurringDateInYear, mergeCategoryOptions, budgetStatusLabel,
} from "./adminPlannerData";
import { ACCENT, ACCENT_BORDER } from "./planner/plannerTheme";
import PlannerDatePicker from "./planner/PlannerDatePicker";
import PlannerTimePicker from "./planner/PlannerTimePicker";
import PlannerCategorySelect from "./planner/PlannerCategorySelect";
import PlannerReceiptCapture from "./planner/PlannerReceiptCapture";
import PlannerCycleTracker from "./planner/PlannerCycleTracker";
import PlannerMessenger from "./planner/PlannerMessenger";
import useBodyScrollLock from "./planner/useBodyScrollLock";

function todayY() { return new Date().getFullYear(); }
function thisMonthRange() {
  const d = new Date();
  const y = d.getFullYear(), m = d.getMonth();
  const pad = (n) => String(n).padStart(2, "0");
  const first = `${y}-${pad(m + 1)}-01`;
  const last = `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`;
  return { first, last };
}

// ────────────────────────────────────────────────
// 공통 UI 조각
// ────────────────────────────────────────────────
// ⭐ 바깥(빈 곳)을 클릭해도 닫히지 않는다 — 입력하다가 실수로 밖을 눌러 내용이
// 날아가는 문제가 반복 신고되어, 닫기는 오직 "닫기/✕" 버튼으로만 하게 했다.
function Modal({ title, onClose, children, wide }) {
  useBodyScrollLock();
  const modalRef = useRef(null);
  useEffect(() => { modalRef.current?.focus(); }, []);
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`relative bg-white rounded-2xl w-full ${wide ? "max-w-lg" : "max-w-sm"} max-h-[88vh] overflow-y-auto overscroll-contain p-5 shadow-xl outline-none`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-[15px] font-bold text-gray-800">{title}</div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
            ✕
          </button>
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

// ⭐ DispatchApp.jsx에도 이름이 같은 Metric이 있지만, 이 파일은 별도 모듈이라
// 그 쪽 스코프를 공유하지 못한다("Metric is not defined" 오류의 원인이었다) —
// 이 파일 전용으로 다시 선언한다.
function Metric({ label, value, valueClass = "text-gray-800" }) {
  return (
    <div className="rounded-lg bg-white border border-gray-200 px-3 py-2.5">
      <p className="text-[12px] font-semibold text-gray-500 mb-0.5">{label}</p>
      <p className={`text-[16px] font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#EC6FA0]";

// ────────────────────────────────────────────────
// 수입/지출 등록·수정 모달
// ────────────────────────────────────────────────
function LedgerEntryModal({ initial, defaultType = "expense", companyName, actorName, onClose, onOpenRecurring }) {
  const [type, setType] = useState(initial?.type || defaultType);
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
      const payload = {
        type, companyName, title: title.trim(), category: category.trim(),
        amount: Number(amount), date, memo: memo.trim(), createdByName: actorName || "", receiptURL: receiptURL || "",
      };
      if (initial?.id) await updatePlannerEntry(initial.id, payload);
      else await addPlannerEntry(payload);
      onClose();
    } catch (e) {
      alert("저장 중 오류가 발생했습니다: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={initial?.id ? "내역 수정" : "수입/지출 등록"} onClose={onClose}>
      {initial?.createdByName && (
        <div className="text-[11px] text-gray-400 mb-3 -mt-2">등록: {initial.createdByName}</div>
      )}
      {!initial?.id && onOpenRecurring && (
        <button
          type="button"
          onClick={() => { onClose(); onOpenRecurring(); }}
          className="w-full mb-3 -mt-1 text-[11.5px] font-semibold text-left"
          style={{ color: ACCENT }}
        >
          매달 반복되는 지출/수입인가요? 정기 등록 관리 →
        </button>
      )}
      <Field label="구분">
        <div className="flex gap-2">
          {[["expense", "지출"], ["income", "수입"]].map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => { setType(v); setCategory(""); }}
              className={`flex-1 py-2 rounded-lg text-[13px] font-bold border ${
                type === v ? "bg-[#EC6FA0] text-white border-[#EC6FA0]" : "bg-white text-gray-500 border-gray-200"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </Field>
      <Field label="항목명">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 사무실 임대료" />
      </Field>
      <Field label="분류">
        <PlannerCategorySelect value={category} onChange={setCategory} options={categoryOptions} className={inputCls} />
      </Field>
      <Field label="금액(원)">
        <input className={inputCls} type="text" inputMode="numeric" value={formatAmountInput(amount)} onChange={(e) => setAmount(parseAmountInput(e.target.value))} placeholder="0" />
      </Field>
      <Field label="날짜">
        <PlannerDatePicker value={date} onChange={setDate} />
      </Field>
      {type === "expense" && (
        <Field label="영수증(선택)">
          <PlannerReceiptCapture
            groupId={companyName}
            photoURL={receiptURL}
            onPhotoChange={setReceiptURL}
            onScanned={(amt) => setAmount(String(amt))}
          />
        </Field>
      )}
      <Field label="메모">
        <textarea className={inputCls} rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </Field>
      <div className="flex gap-2 mt-4">
        {initial?.id && (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("이 내역을 삭제하시겠습니까?")) return;
              await deletePlannerEntry(initial.id);
              onClose();
            }}
            className="px-4 py-2.5 rounded-xl border border-red-200 text-red-500 text-[13px] font-bold"
          >
            삭제
          </button>
        )}
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[13px] font-semibold">닫기</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: ACCENT }}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────
// 일정 등록·수정 모달
// ────────────────────────────────────────────────
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

function ScheduleEntryModal({ initial, defaultDate, companyName, actorName, onClose }) {
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
    } catch (e) {
      alert("저장 중 오류가 발생했습니다: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={initial?.id ? "일정 수정" : "일정 등록"} onClose={onClose}>
      {initial?.createdByName && (
        <div className="text-[11px] text-gray-400 mb-3 -mt-2">등록: {initial.createdByName}</div>
      )}
      <Field label="제목">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 세무사 미팅" />
      </Field>
      <Field label={multiDay ? "시작일" : `날짜${dday ? ` · ${dday}` : ""}`}>
        <PlannerDatePicker value={date} onChange={(v) => { setDate(v); if (v > endDate) setEndDate(v); }} />
      </Field>
      {!initial?.id && (
        <label className="flex items-center gap-2 mb-3 -mt-1 cursor-pointer select-none">
          <input type="checkbox" checked={multiDay} onChange={(e) => setMultiDay(e.target.checked)} className="w-4 h-4" style={{ accentColor: ACCENT }} />
          <span className="text-[12.5px] font-semibold text-gray-600">여러 날 동일 일정으로 등록 (예: 1일~3일)</span>
        </label>
      )}
      {multiDay && !initial?.id && (
        <Field label="종료일">
          <PlannerDatePicker value={endDate} onChange={setEndDate} />
        </Field>
      )}
      <Field label="시간(선택)">
        <PlannerTimePicker value={time} onChange={setTime} />
      </Field>
      <label className="flex items-center gap-2 mb-3 -mt-1 cursor-pointer select-none">
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="w-4 h-4" style={{ accentColor: ACCENT }} />
        <span className="text-[12.5px] font-semibold text-gray-600">매년 반복 (생일/기념일)</span>
      </label>
      <Field label="메모">
        <textarea className={inputCls} rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </Field>
      <div className="flex gap-2 mt-4">
        {initial?.id && (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("이 일정을 삭제하시겠습니까?")) return;
              await deletePlannerEntry(initial.id);
              onClose();
            }}
            className="px-4 py-2.5 rounded-xl border border-red-200 text-red-500 text-[13px] font-bold"
          >
            삭제
          </button>
        )}
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[13px] font-semibold">닫기</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: ACCENT }}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────
// 이벤트 예산 구성원 등록·수정 모달
// ────────────────────────────────────────────────
// ⭐ "닫기/저장" 대신 "저장(끝내기)/추가(이 사람 저장하고 바로 다음 사람 입력)"로
// 바꿔달라는 요청 — 신규 등록일 때만 "추가" 버튼이 뜨고, 누르면 폼이 초기화된 채
// 모달이 계속 열려있어 구성원을 연달아 입력할 수 있다.
function FamilyMemberModal({ initial, group, companyName, actorName, onClose }) {
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
      const payload = {
        type: "familyBudget", companyName, group, title: name.trim(), category: side,
        amount: Number(amount) || 0, memo: memo.trim(), createdByName: actorName || "",
      };
      if (initial?.id) await updatePlannerEntry(initial.id, payload);
      else await addPlannerEntry(payload);
      return true;
    } catch (e) {
      alert("저장 중 오류가 발생했습니다: " + e.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAndClose = async () => { if (await doSave()) onClose(); };
  const saveAndAddNext = async () => {
    if (await doSave()) {
      setName(""); setAmount(""); setMemo("");
      setAddedFlash(true);
      setTimeout(() => setAddedFlash(false), 1200);
    }
  };

  return (
    <Modal title={isEdit ? "구성원 수정" : "구성원 추가"} onClose={onClose}>
      {initial?.createdByName && (
        <div className="text-[11px] text-gray-400 mb-3 -mt-2">등록: {initial.createdByName}</div>
      )}
      {addedFlash && <div className="text-[12px] font-bold mb-3 -mt-1" style={{ color: ACCENT }}>추가됐어요 — 다음 구성원을 입력해 주세요</div>}
      <Field label="이름">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 아버지" autoFocus />
      </Field>
      <Field label="구분">
        <div className="flex gap-2">
          {["본가", "처가/외가", "기타"].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setSide(v)}
              className={`flex-1 py-2 rounded-lg text-[12.5px] font-bold border ${
                side === v ? "bg-[#EC6FA0] text-white border-[#EC6FA0]" : "bg-white text-gray-500 border-gray-200"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </Field>
      <Field label="금액(원)">
        <input className={inputCls} type="text" inputMode="numeric" value={formatAmountInput(amount)} onChange={(e) => setAmount(parseAmountInput(e.target.value))} placeholder="0" />
      </Field>
      <Field label="메모">
        <textarea className={inputCls} rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </Field>
      <div className="flex gap-2 mt-4">
        {isEdit && (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("삭제하시겠습니까?")) return;
              await deletePlannerEntry(initial.id);
              onClose();
            }}
            className="px-4 py-2.5 rounded-xl border border-red-200 text-red-500 text-[13px] font-bold"
          >
            삭제
          </button>
        )}
        <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[13px] font-semibold">닫기</button>
        <button onClick={saveAndClose} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: ACCENT }}>
          {saving ? "저장 중..." : "저장"}
        </button>
        {!isEdit && (
          <button onClick={saveAndAddNext} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold border" style={{ background: "#fff", color: ACCENT, borderColor: ACCENT }}>
            추가
          </button>
        )}
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────
// 새 이벤트 예산 묶음 생성 모달
// ────────────────────────────────────────────────
function NewGroupModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  return (
    <Modal title="새 이벤트 예산 만들기" onClose={onClose}>
      <Field label="이벤트 이름">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 2026년 추석" autoFocus />
      </Field>
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[13px] font-semibold">닫기</button>
        <button
          onClick={() => { if (!name.trim()) { alert("이름을 입력해 주세요."); return; } onCreate(name.trim()); }}
          className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold"
          style={{ background: ACCENT }}
        >
          만들기
        </button>
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────
// 정기 지출(월세/보험료 등) 자동 반복 등록 관리
// ────────────────────────────────────────────────
function RecurringManagerModal({ templates, companyName, actorName, onClose }) {
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
      await addPlannerEntry({
        type: "recurringTemplate", companyName, title: title.trim(), entryType, category: category.trim(),
        amount: Number(amount) || 0, dayOfMonth: Number(dayOfMonth) || 1, active: true, createdByName: actorName || "",
      });
      setTitle(""); setAmount(""); setCategory(""); setDayOfMonth("1");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="정기 지출/수입 자동 등록" onClose={onClose} wide>
      <div className="text-[11.5px] text-gray-400 mb-3">매달 지정한 날짜가 되면 수입/지출 내역에 자동으로 등록돼요 (예: 월세, 보험료, 구독료).</div>
      <div className="grid grid-cols-2 gap-2 mb-2.5">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="이름 (예: 월세)" />
        <div className="flex gap-1.5">
          {[["expense", "지출"], ["income", "수입"]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setEntryType(v)}
              className={`flex-1 py-2 rounded-lg text-[12.5px] font-bold border ${entryType === v ? "bg-[#EC6FA0] text-white border-[#EC6FA0]" : "bg-white text-gray-500 border-gray-200"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <PlannerCategorySelect value={category} onChange={setCategory} options={categoryOptions} className={inputCls} placeholder="분류 선택/입력" />
        <input className={inputCls} type="text" inputMode="numeric" value={formatAmountInput(amount)} onChange={(e) => setAmount(parseAmountInput(e.target.value))} placeholder="금액" />
        <input className={inputCls} type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} placeholder="매월 며칠" />
      </div>
      <button onClick={add} disabled={saving} className="w-full py-2.5 rounded-xl text-white text-[13px] font-bold mb-4" style={{ background: ACCENT }}>
        정기 항목 추가
      </button>

      <div className="text-[12px] font-bold text-gray-500 mb-2">등록된 정기 항목</div>
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {templates.length === 0 && <div className="py-8 text-center text-[12px] text-gray-400">등록된 정기 항목이 없습니다</div>}
        {templates.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-3.5 py-2.5 border-b border-gray-50 last:border-b-0">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-gray-800 truncate">
                {t.title} <span className="text-[11px] text-gray-400 font-normal">매월 {t.dayOfMonth}일 · {t.entryType === "income" ? "수입" : "지출"}</span>
              </div>
              <div className="text-[12px] font-bold" style={{ color: ACCENT }}>{fmtWon(t.amount)}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <button
                onClick={() => updatePlannerEntry(t.id, { active: t.active === false })}
                className="text-[11px] font-semibold px-2 py-1 rounded-md border border-gray-200 text-gray-500"
              >
                {t.active === false ? "재개" : "일시중지"}
              </button>
              <button
                onClick={async () => { if (window.confirm("삭제하시겠습니까?")) await deletePlannerEntry(t.id); }}
                className="text-[11px] font-semibold px-2 py-1 rounded-md border border-red-200 text-red-500"
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────
// PDF / 엑셀 내보내기 (숨겨진 인쇄용 레이아웃 → 캡처)
// ────────────────────────────────────────────────
function exportTableToExcel(filename, rows, headerMap) {
  const mapped = rows.map((r) => {
    const o = {};
    Object.entries(headerMap).forEach(([key, label]) => { o[label] = r[key]; });
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(mapped);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "내역");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

async function buildPdfBlob(node) {
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
  const img = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  let heightLeft = imgH;
  let y = 0;
  pdf.addImage(img, "PNG", 0, y, imgW, imgH);
  heightLeft -= pageH;
  while (heightLeft > 0) {
    y = heightLeft - imgH;
    pdf.addPage();
    pdf.addImage(img, "PNG", 0, y, imgW, imgH);
    heightLeft -= pageH;
  }
  return pdf;
}

async function exportPrintableToPdf(node, filename) {
  const pdf = await buildPdfBlob(node);
  pdf.save(`${filename}.pdf`);
}

// ⭐ "월간 요약 PDF를 카톡으로 공유" 요청 — 카카오 SDK 연동(앱키/도메인 등록 필요)
// 없이도 되는 방법으로, 표준 Web Share API를 쓴다. 카카오톡 등 설치된 공유 대상
// 앱 목록이 뜨고 그중 카카오톡을 고르면 PDF 파일이 그대로 전달된다. 미지원 환경
// (일부 PC 브라우저 등)에서는 자동으로 파일 다운로드로 대체된다.
async function shareOrDownloadPdf(node, filename) {
  const pdf = await buildPdfBlob(node);
  const blob = pdf.output("blob");
  const file = new File([blob], `${filename}.pdf`, { type: "application/pdf" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch {
      // 사용자가 공유를 취소한 경우 등 — 조용히 다운로드로 대체
    }
  }
  pdf.save(`${filename}.pdf`);
}

function PrintableLedger({ innerRef, companyName, label, rows, totalIncome, totalExpense }) {
  return (
    <div style={{ position: "fixed", left: -99999, top: 0, width: 780 }}>
      <div ref={innerRef} style={{ width: 780, background: "#fff", padding: 28, fontFamily: "'Noto Sans KR', sans-serif" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT, marginBottom: 2 }}>수입·지출 내역서</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
          {companyName} · {label} · 생성일 {todayStr()}
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          {[
            ["총 수입", fmtWon(totalIncome)],
            ["총 지출", fmtWon(totalExpense)],
            ["잔액", fmtWon(totalIncome - totalExpense)],
          ].map(([label2, val]) => (
            <div key={label2} style={{ flex: 1, border: `1px solid #e2e8f0`, borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>{label2}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: ACCENT }}>{val}</div>
            </div>
          ))}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: ACCENT, color: "#fff" }}>
              {["날짜", "구분", "항목명", "분류", "금액", "메모"].map((h) => (
                <th key={h} style={{ padding: "8px 6px", textAlign: "left", fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 ? "#f8fafc" : "#fff", borderBottom: "1px solid #eef2f7" }}>
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

function PrintableFamily({ innerRef, companyName, group, rows, total }) {
  return (
    <div style={{ position: "fixed", left: -99999, top: 0, width: 700 }}>
      <div ref={innerRef} style={{ width: 700, background: "#fff", padding: 28, fontFamily: "'Noto Sans KR', sans-serif" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT, marginBottom: 2 }}>{group} — 이벤트 예산표</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>{companyName} · 생성일 {todayStr()}</div>
        <div style={{ marginBottom: 16, border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", display: "inline-block" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>총 예산</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: ACCENT }}>{fmtWon(total)}</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: ACCENT, color: "#fff" }}>
              {["이름", "구분", "금액", "메모"].map((h) => (
                <th key={h} style={{ padding: "8px 6px", textAlign: "left", fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 ? "#f8fafc" : "#fff", borderBottom: "1px solid #eef2f7" }}>
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

// ────────────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────────────
const TAB_ITEMS = [
  ["dashboard", "홈"],
  ["ledger", "수입·지출"],
  ["calendar", "일정"],
  ["family", "이벤트 예산"],
  ["cycle", "생리주기"],
  ["messenger", "메신저"],
];

export default function AdminPlanner({ userCompany, myRealName, myUid, myGender }) {
  const companyName = userCompany || localStorage.getItem("userCompany") || "";
  const { entries } = usePlannerEntries(companyName);
  const [tab, setTab] = useState("dashboard");
  const [year, setYear] = useState(todayY());

  const incomeExpense = useMemo(() => entries.filter((e) => e.type === "income" || e.type === "expense"), [entries]);
  const schedules = useMemo(() => entries.filter((e) => e.type === "schedule"), [entries]);
  const familyEntries = useMemo(() => entries.filter((e) => e.type === "familyBudget"), [entries]);
  const recurringTemplates = useMemo(() => entries.filter((e) => e.type === "recurringTemplate"), [entries]);
  const budgetTarget = useMemo(
    () => entries.find((e) => e.type === "budgetTarget" && String(e.year) === String(year))?.amount || 0,
    [entries, year]
  );

  // ⭐ 정기 지출/수입 자동 등록 — 이번 달에 아직 생성되지 않은 항목만 조용히 채워 넣는다.
  useEffect(() => {
    if (companyName && entries.length >= 0) ensureRecurringInstances(companyName, entries, myRealName);
  }, [companyName, entries, myRealName]);

  const yearRows = useMemo(() => incomeExpense.filter((e) => String(e.date || "").slice(0, 4) === String(year)), [incomeExpense, year]);
  const totalIncome = useMemo(() => yearRows.filter((r) => r.type === "income").reduce((s, r) => s + Number(r.amount || 0), 0), [yearRows]);
  const totalExpense = useMemo(() => yearRows.filter((r) => r.type === "expense").reduce((s, r) => s + Number(r.amount || 0), 0), [yearRows]);

  const groups = useMemo(() => {
    const map = new Map();
    familyEntries.forEach((e) => {
      const g = e.group || "미지정";
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(e);
    });
    return Array.from(map.entries());
  }, [familyEntries]);

  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[17px] font-extrabold text-gray-800">나의 플래너</div>
          <div className="text-[12px] text-gray-400 mt-0.5">가족과 함께 기록하는 우리집 수입·지출, 일정, 이벤트 예산</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear((y) => y - 1)} className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500">‹</button>
          <div className="text-[14px] font-bold text-gray-700 w-16 text-center">{year}년</div>
          <button onClick={() => setYear((y) => y + 1)} className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500">›</button>
        </div>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {TAB_ITEMS.map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`px-4 py-2 text-[13px] font-bold rounded-lg transition border ${
              tab === v ? "bg-[#EC6FA0] text-white border-[#EC6FA0]" : "bg-white text-[#EC6FA0] border-[#EC6FA0] hover:bg-[#EC6FA0] hover:text-white"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <DashboardTab
          year={year} budgetTarget={budgetTarget} totalIncome={totalIncome} totalExpense={totalExpense}
          schedules={schedules} groups={groups} companyName={companyName} actorName={myRealName} entries={entries}
          incomeExpense={incomeExpense}
        />
      )}
      {tab === "ledger" && (
        <LedgerTab rows={incomeExpense} companyName={companyName} actorName={myRealName} recurringTemplates={recurringTemplates} />
      )}
      {tab === "calendar" && (
        <CalendarTab year={year} schedules={schedules} companyName={companyName} actorName={myRealName} />
      )}
      {tab === "family" && (
        <FamilyTab groups={groups} companyName={companyName} actorName={myRealName} />
      )}
      {tab === "cycle" && (
        <PlannerCycleTracker groupId={companyName} myUid={myUid} myGender={myGender} myName={myRealName} />
      )}
      {tab === "messenger" && (
        <PlannerMessenger groupId={companyName} myUid={myUid} myName={myRealName} />
      )}
    </div>
  );
}

function DashboardTab({ year, budgetTarget, totalIncome, totalExpense, schedules, groups, companyName, actorName, entries, incomeExpense }) {
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(budgetTarget || ""));
  const [sharing, setSharing] = useState(false);
  const balance = totalIncome - totalExpense;
  const printRef = useRef(null);
  const upcoming = useMemo(() => {
    const t = todayStr();
    // ⭐ 매년 반복(생일/기념일)은 저장된 날짜가 과거라도 "올해/내년 돌아오는 날짜"로
    // 계산해서 다가오는 일정에 함께 보여준다.
    return schedules
      .map((s) => ({ ...s, effectiveDate: s.recurring ? nextOccurrence(s.date, t) : s.date }))
      .filter((s) => (s.effectiveDate || "") >= t)
      .sort((a, b) => (a.effectiveDate || "").localeCompare(b.effectiveDate || ""))
      .slice(0, 5);
  }, [schedules]);
  const familyTotal = useMemo(() => groups.reduce((sum, [, rows]) => sum + rows.reduce((s, r) => s + Number(r.amount || 0), 0), 0), [groups]);

  const { first, last } = thisMonthRange();
  const monthRows = useMemo(() => incomeExpense.filter((r) => (r.date || "") >= first && (r.date || "") <= last), [incomeExpense, first, last]);
  const monthIncome = monthRows.filter((r) => r.type === "income").reduce((s, r) => s + Number(r.amount || 0), 0);
  const monthExpense = monthRows.filter((r) => r.type === "expense").reduce((s, r) => s + Number(r.amount || 0), 0);

  const shareMonthly = async () => {
    setSharing(true);
    try {
      await shareOrDownloadPdf(printRef.current, `이달의요약_${first.slice(0, 7)}`);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-bold text-gray-700">{year}년 요약</div>
        <button onClick={shareMonthly} disabled={sharing} className="text-[12px] font-bold px-3 py-1.5 rounded-lg" style={{ background: ACCENT, color: "#fff" }}>
          {sharing ? "생성 중..." : "이번 달 요약 카톡 공유"}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-bold text-gray-400">{year}년 총예산 목표</div>
            <button onClick={() => setEditingBudget((v) => !v)} className="text-[11px] font-semibold text-[#EC6FA0] hover:underline">수정</button>
          </div>
          {editingBudget ? (
            <div className="flex gap-1 mt-1">
              <input className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-[13px]" type="text" inputMode="numeric" value={formatAmountInput(budgetInput)} onChange={(e) => setBudgetInput(parseAmountInput(e.target.value))} />
              <button
                onClick={async () => { await upsertBudgetTarget({ companyName, year, amount: budgetInput, entries, actorName }); setEditingBudget(false); }}
                className="shrink-0 whitespace-nowrap px-3 rounded-lg text-white text-[12px] font-bold" style={{ background: ACCENT }}
              >
                저장
              </button>
            </div>
          ) : (
            <div className="text-[19px] font-extrabold" style={{ color: ACCENT }}>{fmtWon(budgetTarget)}</div>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] font-bold text-gray-400 mb-1">총 수입</div>
          <div className="text-[19px] font-extrabold text-gray-700">{fmtWon(totalIncome)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] font-bold text-gray-400 mb-1">총 지출</div>
          <div className="text-[19px] font-extrabold text-red-600">{fmtWon(totalExpense)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] font-bold text-gray-400 mb-1">잔액</div>
          <div className="text-[19px] font-extrabold" style={{ color: balance >= 0 ? ACCENT : "#dc2626" }}>{fmtWon(balance)}</div>
        </div>
      </div>

      {/* ⭐ 예산 대비 지출 진행률 — 부부가 같이 보는 화면이니 "이번 해 예산을 얼마나
          썼는지"를 막대 하나로 바로 알아볼 수 있게 한다(총예산 목표를 설정했을 때만). */}
      {budgetTarget > 0 && (() => {
        const pct = (totalExpense / budgetTarget) * 100;
        const status = budgetStatusLabel(pct);
        return (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="text-[12px] font-bold text-gray-600">예산 대비 지출</div>
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-extrabold text-white" style={{ background: status.color }}>{status.label}</span>
              </div>
              <div className="text-[12px] font-semibold text-gray-500">
                {fmtWon(totalExpense)} / {fmtWon(budgetTarget)} ({Math.round(pct)}%)
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: status.color }} />
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[13px] font-bold text-gray-700 mb-3">다가오는 일정</div>
          {upcoming.length === 0 && <div className="text-[12px] text-gray-400 py-4 text-center">등록된 일정이 없습니다</div>}
          <div className="space-y-2">
            {upcoming.map((s) => {
              const dday = dDayLabel(s.effectiveDate);
              const soon = dday === "D-DAY" || dday === "D-1";
              return (
                <div key={s.id} className="flex items-center justify-between text-[12.5px] border-b border-gray-50 last:border-b-0 pb-2 last:pb-0">
                  <span className="text-gray-700 font-semibold truncate flex items-center gap-1.5">
                    {dday && (
                      <span
                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-extrabold"
                        style={soon ? { background: ACCENT, color: "#fff" } : { background: "#f3f4f6", color: "#6b7280" }}
                      >
                        {dday}
                      </span>
                    )}
                    {s.title}{s.recurring && <span className="text-[10px] text-gray-400 font-normal">(매년)</span>}
                  </span>
                  <span className="text-gray-400 shrink-0 ml-2">{s.effectiveDate}{s.time ? ` ${s.time}` : ""}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[13px] font-bold text-gray-700 mb-3">이벤트 예산</div>
          {groups.length === 0 && <div className="text-[12px] text-gray-400 py-4 text-center">등록된 이벤트 예산이 없습니다</div>}
          <div className="space-y-2">
            {groups.map(([g, rows]) => (
              <div key={g} className="flex items-center justify-between text-[12.5px] border-b border-gray-50 last:border-b-0 pb-2 last:pb-0">
                <span className="text-gray-700 font-semibold truncate">{g}</span>
                <span className="text-gray-500 shrink-0 ml-2">{fmtWon(rows.reduce((s, r) => s + Number(r.amount || 0), 0))}</span>
              </div>
            ))}
          </div>
          {groups.length > 0 && (
            <div className="flex items-center justify-between text-[12.5px] mt-2 pt-2 border-t border-gray-100 font-bold" style={{ color: ACCENT }}>
              <span>합계</span><span>{fmtWon(familyTotal)}</span>
            </div>
          )}
        </div>
      </div>

      <PrintableLedger innerRef={printRef} companyName={companyName} label={`${first.slice(0, 7)} 이번 달 요약`} rows={monthRows} totalIncome={monthIncome} totalExpense={monthExpense} />
    </div>
  );
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
function dateLabelKo(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${dateStr} (${WEEKDAY_KO[d.getDay()]})`;
}

// ⭐ 예전엔 6열짜리 표 하나가 화면 끝까지 늘어져 있었다. 대신 (1) 분류별 합계를
// 위에 한눈에 보여주고(가로 스크롤 — 카드가 늘어나도 화면이 아래로 밀리지 않는다)
// (2) 목록은 날짜별로 묶어서, 폭도 max-w로 제한한 좁은 카드 리스트로 보여준다.
// (3) 시작일/종료일/구분은 누르는 즉시 바로 반영되고(내역을 추가하면 그 결과가
// 바로바로 보여야 한다는 요구사항), 검색어만 "조회" 버튼(또는 Enter)을 눌러야
// 반영된다 — 자유 텍스트 검색만 배차프로그램의 조회 방식을 따른다.
function LedgerTab({ rows, companyName, actorName, recurringTemplates }) {
  const monthDefault = thisMonthRange();
  const [filters, setFilters] = useState({ start: monthDefault.first, end: monthDefault.last, kind: "all" });
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keywordApplied, setKeywordApplied] = useState("");
  const [editing, setEditing] = useState(null); // null | {} | entry
  const [showRecurring, setShowRecurring] = useState(false);
  const printRef = useRef(null);

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

  const categoryTotals = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      const cat = r.category?.trim() || "미분류";
      if (!map.has(cat)) map.set(cat, { income: 0, expense: 0 });
      const e = map.get(cat);
      if (r.type === "income") e.income += Number(r.amount || 0);
      else e.expense += Number(r.amount || 0);
    });
    return Array.from(map.entries()).sort((a, b) => (b[1].income + b[1].expense) - (a[1].income + a[1].expense));
  }, [filtered]);

  const dateGroups = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      const d = r.date || "날짜없음";
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(r);
    });
    return Array.from(map.entries()); // filtered가 이미 날짜 내림차순 정렬됨
  }, [filtered]);

  const rangeLabel = `${filters.start || "전체"} ~ ${filters.end || "전체"}`;

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-xl p-3.5 mb-4">
        <div className="flex flex-wrap items-end gap-2.5">
          <div>
            <div className="text-[11px] font-semibold text-gray-400 mb-1">시작일</div>
            <PlannerDatePicker value={filters.start} onChange={(v) => setFilters((d) => ({ ...d, start: v }))} className="border rounded-lg px-3 py-1.5 text-[12.5px] border-gray-200" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-gray-400 mb-1">종료일</div>
            <PlannerDatePicker value={filters.end} onChange={(v) => setFilters((d) => ({ ...d, end: v }))} className="border rounded-lg px-3 py-1.5 text-[12.5px] border-gray-200" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-gray-400 mb-1">구분</div>
            <div className="flex gap-1">
              {[["all", "전체"], ["income", "수입"], ["expense", "지출"]].map(([v, l]) => (
                <button key={v} onClick={() => setFilters((d) => ({ ...d, kind: v }))}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-bold border ${filters.kind === v ? "bg-[#EC6FA0] text-white border-[#EC6FA0]" : "bg-white text-gray-500 border-gray-200"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-[140px]">
            <div className="text-[11px] font-semibold text-gray-400 mb-1">검색어</div>
            <input
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runQuery(); }}
              placeholder="항목명/분류/메모"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[12.5px]"
            />
          </div>
          <button onClick={runQuery} className="px-4 py-2 rounded-lg text-white text-[12.5px] font-bold" style={{ background: ACCENT }}>조회</button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="text-[12px] font-semibold text-gray-500">{rangeLabel}</div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => exportTableToExcel(`수입지출_${filters.start}_${filters.end}`, filtered, { date: "날짜", type: "구분", title: "항목명", category: "분류", amount: "금액", memo: "메모" })}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"
          >
            엑셀 다운로드
          </button>
          <button
            onClick={() => exportPrintableToPdf(printRef.current, `수입지출_${filters.start}_${filters.end}`)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"
          >
            PDF 다운로드
          </button>
          <button onClick={() => setEditing({})} className="px-3 py-1.5 rounded-lg text-white text-[12px] font-bold" style={{ background: ACCENT }}>
            내역 추가
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5 max-w-xl">
        <Metric label="수입" value={fmtWon(totalIncome)} />
        <Metric label="지출" value={fmtWon(totalExpense)} valueClass="text-red-600" />
        <Metric label="잔액" value={fmtWon(totalIncome - totalExpense)} valueClass="text-[#EC6FA0]" />
      </div>

      {categoryTotals.length > 0 && (
        <div className="mb-6">
          <div className="text-[12px] font-bold text-gray-500 mb-2">분류별 합계</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categoryTotals.map(([cat, { income, expense }]) => (
              <div key={cat} className="shrink-0 px-3 py-2 rounded-lg border border-gray-200 bg-white min-w-[110px]">
                <div className="text-[11px] text-gray-400 mb-0.5">{cat}</div>
                <div className="text-[12.5px] font-bold whitespace-nowrap">
                  {!!expense && <span className="text-red-600">-{expense.toLocaleString()}</span>}
                  {!!expense && !!income && <span className="text-gray-300 mx-0.5">/</span>}
                  {!!income && <span className="text-gray-700">+{income.toLocaleString()}</span>}
                  <span className="text-gray-400 font-normal">원</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-2xl">
        <div className="text-[12px] font-bold text-gray-500 mb-2">날짜별 내역</div>
        {dateGroups.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl py-10 text-center text-[12.5px] text-gray-400">등록된 내역이 없습니다</div>
        )}
        <div className="space-y-3">
          {dateGroups.map(([date, items]) => {
            const daySum = items.reduce((s, r) => s + (r.type === "income" ? Number(r.amount || 0) : -Number(r.amount || 0)), 0);
            return (
              <div key={date}>
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <div className="text-[12px] font-bold text-gray-600">{dateLabelKo(date)}</div>
                  <div className={`text-[11.5px] font-semibold ${daySum >= 0 ? "text-gray-400" : "text-red-500"}`}>
                    {daySum >= 0 ? "+" : ""}{daySum.toLocaleString()}원
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {items.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => setEditing(r)}
                      className="flex items-center justify-between px-4 py-3 text-[13.5px] border-b border-gray-50 last:border-b-0 hover:bg-gray-50 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-bold ${r.type === "income" ? "bg-gray-100 text-gray-700" : "bg-red-50 text-red-600"}`}>
                          {r.type === "income" ? "수입" : "지출"}
                        </span>
                        {r.receiptURL && <span className="shrink-0 text-[11px]" title="영수증 첨부됨">📎</span>}
                        <span className="text-gray-900 font-semibold truncate">{r.title}</span>
                        {r.category && <span className="text-[12px] text-gray-500 shrink-0">{r.category}</span>}
                        {r.memo && <span className="text-[12px] text-gray-400 truncate">· {r.memo}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {r.createdByName && <span className="text-[11px] text-gray-400">{r.createdByName}</span>}
                        <span className={`font-bold ${r.type === "income" ? "text-gray-800" : "text-red-600"}`}>{fmtWon(r.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <PrintableLedger innerRef={printRef} companyName={companyName} label={rangeLabel} rows={filtered} totalIncome={totalIncome} totalExpense={totalExpense} />

      {editing && (
        <LedgerEntryModal
          initial={editing.id ? editing : null}
          companyName={companyName}
          actorName={actorName}
          onClose={() => setEditing(null)}
          onOpenRecurring={() => setShowRecurring(true)}
        />
      )}
      {showRecurring && (
        <RecurringManagerModal templates={recurringTemplates} companyName={companyName} actorName={actorName} onClose={() => setShowRecurring(false)} />
      )}
    </div>
  );
}

function CalendarTab({ year, schedules, companyName, actorName }) {
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(year);
  const [editing, setEditing] = useState(null); // null | {date} | entry
  React.useEffect(() => { setViewYear(year); }, [year]);

  // ⭐ 매년 반복(생일/기념일)은 저장된 연도와 상관없이, 지금 보고 있는 달력의
  // 연도(viewYear) 기준 월/일로 매번 다시 계산해서 꽂아준다 — 그래야 몇 년을
  // 넘겨봐도 매년 같은 날에 나타난다.
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

  const goMonth = (delta) => {
    let m = viewMonth + delta, y = viewYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setViewMonth(m); setViewYear(y);
  };

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => goMonth(-1)} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-[#EC6FA0] font-bold">‹</button>
          <div className="text-[14px] font-bold text-[#EC6FA0]">{viewYear}년 {viewMonth + 1}월</div>
          <button onClick={() => goMonth(1)} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-[#EC6FA0] font-bold">›</button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
            <div key={w} className={`text-center text-[12px] font-extrabold py-1 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"}`}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d == null) return <div key={i} />;
            const dateStr = fmt(viewYear, viewMonth, d);
            const dow = new Date(viewYear, viewMonth, d).getDay();
            const holidayName = KOREAN_HOLIDAYS[dateStr];
            const isToday = dateStr === todayS;
            const items = byDate.get(dateStr) || [];
            return (
              <div
                key={i}
                onClick={() => setEditing({ date: dateStr })}
                className={`min-h-[92px] rounded-lg border p-1.5 cursor-pointer hover:border-[#EC6FA0] transition ${isToday ? "border-2 border-[#EC6FA0]" : "border-gray-100"}`}
              >
                <div className={`text-[12px] font-bold mb-1 ${holidayName || dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-gray-600"}`}>
                  {d}
                  {holidayName && <span className="ml-1 text-[9px] font-semibold text-red-500">{shortHolidayLabel(holidayName)}</span>}
                </div>
                <div className="space-y-0.5">
                  {items.slice(0, 3).map((it) => (
                    <div
                      key={it.id}
                      onClick={(e) => { e.stopPropagation(); setEditing(it); }}
                      title={it.createdByName ? `등록: ${it.createdByName}` : undefined}
                      className="text-[10px] font-semibold rounded px-1 py-[1px] truncate text-white"
                      style={{ background: ACCENT }}
                    >
                      {it.time ? `${it.time} ` : ""}{it.title}
                    </div>
                  ))}
                  {items.length > 3 && <div className="text-[9.5px] text-gray-400 font-semibold">+{items.length - 3}건</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <ScheduleEntryModal
          initial={editing.id ? editing : null}
          defaultDate={editing.date}
          companyName={companyName}
          actorName={actorName}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ⭐ 본가/처가·외가를 한 줄 리스트에 섞어 보여주던 예전 방식 대신, 묶음 하나를
// "본가 | 처가·외가" 두 패널로 딱 나눠서 좌우로 보여준다("기타"로 등록한 인원은
// 맨 아래에 별도 줄로). 두 칸 사이에는 뚜렷한 세로 구분선을, 카드끼리는 뚜렷한
// 가로 구분선을 넣어서 "구분이 부족하다"는 피드백을 반영했다.
const FAMILY_SIDES = ["본가", "처가/외가"];

function FamilyMemberColumn({ title, rows, onEdit }) {
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="text-[13.5px] font-bold text-gray-700">{title}</div>
        <div className="text-[12px] font-semibold text-gray-500">{rows.length}명</div>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden flex-1" style={{ borderColor: ACCENT_BORDER }}>
        {rows.length === 0 && <div className="py-6 text-center text-[12px] text-gray-400">등록된 인원이 없습니다</div>}
        {rows.map((r, idx) => (
          <div
            key={r.id}
            onClick={() => onEdit(r)}
            className="flex items-center justify-between px-3 py-2.5 text-[13px] cursor-pointer"
            style={idx > 0 ? { borderTop: `2px solid ${ACCENT_BORDER}` } : undefined}
          >
            <div className="min-w-0">
              <div className="text-gray-900 font-semibold truncate">{r.title}</div>
              {(r.memo || r.createdByName) && (
                <div className="text-[11.5px] text-gray-500 truncate">
                  {r.memo}{r.memo && r.createdByName ? " · " : ""}{r.createdByName}
                </div>
              )}
            </div>
            <span className="text-gray-800 font-bold shrink-0 ml-2">{fmtWon(r.amount)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-[13px] mt-2 px-0.5 text-gray-600 font-semibold">
        <span>소계</span><span className="font-bold text-[13.5px]" style={{ color: ACCENT }}>{fmtWon(total)}</span>
      </div>
    </div>
  );
}

// ⭐ 접기/펴기 상태를 localStorage에 묶음 이름별로 저장 — 재접속해도 접어둔 카드는
// 접힌 채로, 펴둔 카드는 펴진 채로 그대로 유지된다.
function collapseKey(g) { return `kpplanner_collapse_${g}`; }

function EventBudgetCard({ g, rows, companyName, onAddMember, onEditMember }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(collapseKey(g)) === "1"; } catch { return false; }
  });
  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(collapseKey(g), next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const bySide = FAMILY_SIDES.map((side) => [side, rows.filter((r) => r.category === side)]);
  const etc = rows.filter((r) => !FAMILY_SIDES.includes(r.category));
  const printRef = useRef(null);

  if (collapsed) {
    return (
      <button
        onClick={toggle}
        className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-3.5 flex items-center justify-between hover:border-[#EC6FA0] transition text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-gray-300">▸</span>
          <span className="text-[14px] font-bold text-gray-800 truncate">{g} 이벤트</span>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-[12.5px] font-semibold text-gray-500">{rows.length}명</span>
          <span className="text-[14px] font-extrabold" style={{ color: ACCENT }}>{fmtWon(total)}</span>
        </div>
      </button>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <button onClick={toggle} className="flex items-center gap-2 text-left">
          <span className="text-gray-300">▾</span>
          <span className="text-[14px] font-bold text-gray-800">{g}</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportTableToExcel(`${g}_이벤트예산`, rows, { title: "이름", category: "구분", amount: "금액", memo: "메모" })}
            className="text-[12px] font-semibold text-gray-500 hover:text-[#EC6FA0]"
          >
            엑셀
          </button>
          <button
            onClick={() => exportPrintableToPdf(printRef.current, `${g}_이벤트예산`)}
            className="text-[12px] font-semibold text-gray-500 hover:text-[#EC6FA0]"
          >
            PDF
          </button>
          <button
            onClick={() => onAddMember(g)}
            className="text-[11px] font-semibold text-white px-2.5 py-1 rounded-md" style={{ background: ACCENT }}
          >
            구성원 추가
          </button>
        </div>
      </div>

      <div className="p-4 flex items-stretch gap-4">
        {bySide.map(([side, sideRows]) => (
          <div
            key={side}
            className={side === FAMILY_SIDES[1] ? "pl-4 flex-1 min-w-0" : "flex-1 min-w-0"}
            style={side === FAMILY_SIDES[1] ? { borderLeft: `2px solid ${ACCENT_BORDER}` } : undefined}
          >
            <FamilyMemberColumn title={side} rows={sideRows} onEdit={(r) => onEditMember(g, r)} />
          </div>
        ))}
      </div>

      {etc.length > 0 && (
        <div className="px-4 pb-4">
          <div className="text-[13.5px] font-bold text-gray-700 mb-2 px-0.5">기타</div>
          <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: ACCENT_BORDER }}>
            {etc.map((r, idx) => (
              <div key={r.id} onClick={() => onEditMember(g, r)}
                className="flex items-center justify-between px-3 py-2.5 text-[13px] cursor-pointer" style={idx > 0 ? { borderTop: `2px solid ${ACCENT_BORDER}` } : undefined}>
                <span className="text-gray-900 font-semibold truncate">{r.title}</span>
                <span className="text-gray-800 font-bold shrink-0 ml-2">{fmtWon(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-5 py-3 bg-[#EC6FA0]/[0.04] flex items-center justify-between border-t border-gray-100">
        <span className="text-[13px] font-semibold text-gray-600">총 인원수 {rows.length}명</span>
        <span className="text-[15px] font-extrabold" style={{ color: ACCENT }}>총 {fmtWon(total)}</span>
      </div>

      <PrintableFamily innerRef={printRef} companyName={companyName} group={g} rows={rows} total={total} />
    </div>
  );
}

function FamilyTab({ groups, companyName, actorName }) {
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [editingMember, setEditingMember] = useState(null); // {group} | {group, entry}

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setShowNewGroup(true)} className="px-3 py-1.5 rounded-lg text-white text-[12px] font-bold" style={{ background: ACCENT }}>
          새 이벤트 예산
        </button>
      </div>

      {groups.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-[13px] text-gray-400">
          등록된 이벤트 예산이 없습니다. "새 이벤트 예산"으로 명절·경조사·여행 등의 예산표를 만들어 보세요.
        </div>
      )}

      <div className="space-y-4 max-w-3xl">
        {groups.map(([g, rows]) => (
          <EventBudgetCard
            key={g}
            g={g}
            rows={rows}
            companyName={companyName}
            onAddMember={(group) => setEditingMember({ group })}
            onEditMember={(group, entry) => setEditingMember({ group, entry })}
          />
        ))}
      </div>

      {showNewGroup && (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onCreate={(name) => { setShowNewGroup(false); setEditingMember({ group: name }); }}
        />
      )}
      {editingMember && (
        <FamilyMemberModal
          initial={editingMember.entry}
          group={editingMember.group}
          companyName={companyName}
          actorName={actorName}
          onClose={() => setEditingMember(null)}
        />
      )}
    </div>
  );
}
