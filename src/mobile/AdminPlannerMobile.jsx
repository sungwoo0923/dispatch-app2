// src/mobile/AdminPlannerMobile.jsx — "나의 플래너"(KP-Planner) 모바일 화면의 실제 내용.
// ⭐ 배차프로그램과는 완전히 분리된 별도 앱(src/planner/)에서만 쓰인다 — 로그인/
// 가입도 별도이고, 배차/오더 등 어떤 데이터와도 연관되지 않는다.
// PC(../AdminPlanner.jsx)와 같은 Firestore 컬렉션(adminPlannerData.js)을 공유한다.
import React, { useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { KOREAN_HOLIDAYS, shortHolidayLabel } from "../CustomDatePicker";
import {
  usePlannerEntries, addPlannerEntry, updatePlannerEntry, deletePlannerEntry,
  upsertBudgetTarget, fmtWon, todayStr,
} from "../adminPlannerData";
import { PINK } from "../planner/plannerTheme";

const CATEGORY_SUGGESTIONS = ["생활비", "경조사", "명절", "세금/공과금", "보험", "여행", "자녀", "부모님", "기타"];
function todayY() { return new Date().getFullYear(); }

// ⭐ 바깥(빈 곳)을 눌러도 닫히지 않는다 — 입력 중 실수로 밖을 눌러 내용이
// 날아가는 문제 때문에, 닫기는 "닫기/✕" 버튼으로만 하게 했다.
function Sheet({ title, onClose, children, accent }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[88vh] overflow-y-auto p-5 shadow-xl">
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

function LedgerEntryModal({ initial, companyName, actorName, accent, onClose }) {
  const [type, setType] = useState(initial?.type || "expense");
  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : "");
  const [date, setDate] = useState(initial?.date || todayStr());
  const [memo, setMemo] = useState(initial?.memo || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { alert("항목명을 입력해 주세요."); return; }
    if (!amount || Number(amount) <= 0) { alert("금액을 입력해 주세요."); return; }
    setSaving(true);
    try {
      const payload = { type, companyName, title: title.trim(), category: category.trim(), amount: Number(amount), date, memo: memo.trim(), createdByName: actorName || "" };
      if (initial?.id) await updatePlannerEntry(initial.id, payload);
      else await addPlannerEntry(payload);
      onClose();
    } catch (e) { alert("저장 중 오류: " + e.message); } finally { setSaving(false); }
  };

  return (
    <Sheet title={initial?.id ? "내역 수정" : "수입/지출 등록"} onClose={onClose} accent={accent}>
      {initial?.createdByName && <div className="text-[11px] text-gray-400 mb-3 -mt-2">등록: {initial.createdByName}</div>}
      <Field label="구분">
        <div className="flex gap-2">
          {[["expense", "지출"], ["income", "수입"]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setType(v)}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-bold border"
              style={type === v ? { background: accent, color: "#fff", borderColor: accent } : { color: "#6b7280", borderColor: "#e5e7eb" }}>
              {l}
            </button>
          ))}
        </div>
      </Field>
      <Field label="항목명"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 사무실 임대료" /></Field>
      <Field label="분류">
        <input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="예: 생활비" list="planner-category-list-m" />
        <datalist id="planner-category-list-m">{CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label="금액(원)"><input className={inputCls} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>
      <Field label="날짜"><input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
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
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { alert("일정 제목을 입력해 주세요."); return; }
    setSaving(true);
    try {
      const payload = { type: "schedule", companyName, title: title.trim(), date, time, memo: memo.trim(), createdByName: actorName || "" };
      if (initial?.id) await updatePlannerEntry(initial.id, payload);
      else await addPlannerEntry(payload);
      onClose();
    } catch (e) { alert("저장 중 오류: " + e.message); } finally { setSaving(false); }
  };

  return (
    <Sheet title={initial?.id ? "일정 수정" : "일정 등록"} onClose={onClose} accent={accent}>
      {initial?.createdByName && <div className="text-[11px] text-gray-400 mb-3 -mt-2">등록: {initial.createdByName}</div>}
      <Field label="제목"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 세무사 미팅" /></Field>
      <Field label="날짜"><input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="시간(선택)"><input className={inputCls} type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
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
  const [name, setName] = useState(initial?.title || "");
  const [side, setSide] = useState(initial?.category || "본가");
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : "");
  const [memo, setMemo] = useState(initial?.memo || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { alert("이름을 입력해 주세요."); return; }
    setSaving(true);
    try {
      const payload = { type: "familyBudget", companyName, group, title: name.trim(), category: side, amount: Number(amount) || 0, memo: memo.trim(), createdByName: actorName || "" };
      if (initial?.id) await updatePlannerEntry(initial.id, payload);
      else await addPlannerEntry(payload);
      onClose();
    } catch (e) { alert("저장 중 오류: " + e.message); } finally { setSaving(false); }
  };

  return (
    <Sheet title={initial?.id ? "구성원 수정" : "구성원 추가"} onClose={onClose} accent={accent}>
      {initial?.createdByName && <div className="text-[11px] text-gray-400 mb-3 -mt-2">등록: {initial.createdByName}</div>}
      <Field label="이름"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 아버지" /></Field>
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
      <Field label="금액(원)"><input className={inputCls} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>
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

function NewGroupModal({ onClose, onCreate, accent }) {
  const [name, setName] = useState("");
  return (
    <Sheet title="새 예산 묶음 만들기" onClose={onClose} accent={accent}>
      <Field label="묶음 이름"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 2026년 추석" autoFocus /></Field>
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[13px] font-semibold">닫기</button>
        <button onClick={() => { if (!name.trim()) { alert("이름을 입력해 주세요."); return; } onCreate(name.trim()); }}
          className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: accent }}>만들기</button>
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

function PrintableLedger({ innerRef, companyName, year, month, rows, totalIncome, totalExpense, accent }) {
  return (
    <div style={{ position: "fixed", left: -99999, top: 0, width: 780 }}>
      <div ref={innerRef} style={{ width: 780, background: "#fff", padding: 28 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: accent, marginBottom: 2 }}>수입·지출 내역서</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>{companyName} · {year}년{month ? ` ${month}월` : " 전체"} · 생성일 {todayStr()}</div>
        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          {[["총 수입", fmtWon(totalIncome)], ["총 지출", fmtWon(totalExpense)], ["잔액", fmtWon(totalIncome - totalExpense)]].map(([label, val]) => (
            <div key={label} style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>{label}</div>
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
        <div style={{ fontSize: 20, fontWeight: 800, color: accent, marginBottom: 2 }}>{group} — 가족 예산표</div>
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
export default function AdminPlannerMobile({ userCompany, dispatcherName, activeTab, onTabChange, hideTabBar = false }) {
  const accent = PINK;
  const companyName = userCompany || localStorage.getItem("userCompany") || "";
  const { entries } = usePlannerEntries(companyName);
  const [internalTab, setInternalTab] = useState("dashboard");
  const tab = activeTab ?? internalTab;
  const setTab = onTabChange ?? setInternalTab;
  const [year, setYear] = useState(todayY());

  const incomeExpense = useMemo(() => entries.filter((e) => e.type === "income" || e.type === "expense"), [entries]);
  const schedules = useMemo(() => entries.filter((e) => e.type === "schedule"), [entries]);
  const familyEntries = useMemo(() => entries.filter((e) => e.type === "familyBudget"), [entries]);
  const budgetTarget = useMemo(() => entries.find((e) => e.type === "budgetTarget" && String(e.year) === String(year))?.amount || 0, [entries, year]);
  const yearRows = useMemo(() => incomeExpense.filter((e) => String(e.date || "").slice(0, 4) === String(year)), [incomeExpense, year]);
  const totalIncome = useMemo(() => yearRows.filter((r) => r.type === "income").reduce((s, r) => s + Number(r.amount || 0), 0), [yearRows]);
  const totalExpense = useMemo(() => yearRows.filter((r) => r.type === "expense").reduce((s, r) => s + Number(r.amount || 0), 0), [yearRows]);
  const groups = useMemo(() => {
    const map = new Map();
    familyEntries.forEach((e) => { const g = e.group || "미지정"; if (!map.has(g)) map.set(g, []); map.get(g).push(e); });
    return Array.from(map.entries());
  }, [familyEntries]);

  return (
    <div className="px-4 pt-3 pb-24">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] text-gray-400">우리 가족만 보는 개인 기록입니다.</div>
      </div>
      <div className="flex items-center justify-center gap-3 mb-3">
        <button onClick={() => setYear((y) => y - 1)} className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500">‹</button>
        <div className="text-[14px] font-bold text-gray-700">{year}년</div>
        <button onClick={() => setYear((y) => y + 1)} className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500">›</button>
      </div>
      {!hideTabBar && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto">
          {[["dashboard", "홈"], ["ledger", "수입·지출"], ["calendar", "일정"], ["family", "가족 예산"]].map(([v, l]) => (
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
          schedules={schedules} groups={groups} companyName={companyName} actorName={dispatcherName} entries={entries} accent={accent} />
      )}
      {tab === "ledger" && <MobileLedger year={year} rows={yearRows} companyName={companyName} actorName={dispatcherName} accent={accent} />}
      {tab === "calendar" && <MobileCalendar year={year} schedules={schedules} companyName={companyName} actorName={dispatcherName} accent={accent} />}
      {tab === "family" && <MobileFamily groups={groups} companyName={companyName} actorName={dispatcherName} accent={accent} />}
    </div>
  );
}

function MobileDashboard({ year, budgetTarget, totalIncome, totalExpense, schedules, groups, companyName, actorName, entries, accent }) {
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(budgetTarget || ""));
  const balance = totalIncome - totalExpense;
  const upcoming = useMemo(() => {
    const t = todayStr();
    return schedules.filter((s) => (s.date || "") >= t).sort((a, b) => (a.date || "").localeCompare(b.date || "")).slice(0, 5);
  }, [schedules]);
  const familyTotal = useMemo(() => groups.reduce((sum, [, rows]) => sum + rows.reduce((s, r) => s + Number(r.amount || 0), 0), 0), [groups]);

  return (
    <div className="space-y-3">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] font-bold text-gray-400">{year}년 총예산 목표</div>
          <button onClick={() => setEditingBudget((v) => !v)} className="text-[11px] font-semibold" style={{ color: accent }}>수정</button>
        </div>
        {editingBudget ? (
          <div className="flex gap-1.5 mt-1">
            <input className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" type="number" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} />
            <button onClick={async () => { await upsertBudgetTarget({ companyName, year, amount: budgetInput, entries, actorName }); setEditingBudget(false); }}
              className="px-3 rounded-lg text-white text-[12px] font-bold" style={{ background: accent }}>저장</button>
          </div>
        ) : (
          <div className="text-[18px] font-extrabold" style={{ color: accent }}>{fmtWon(budgetTarget)}</div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-3.5">
          <div className="text-[11px] font-bold text-gray-400 mb-1">총 수입</div>
          <div className="text-[16px] font-extrabold text-gray-700">{fmtWon(totalIncome)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3.5">
          <div className="text-[11px] font-bold text-gray-400 mb-1">총 지출</div>
          <div className="text-[16px] font-extrabold text-red-600">{fmtWon(totalExpense)}</div>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-3.5">
        <div className="text-[11px] font-bold text-gray-400 mb-1">잔액</div>
        <div className="text-[17px] font-extrabold" style={{ color: balance >= 0 ? accent : "#dc2626" }}>{fmtWon(balance)}</div>
      </div>

      {/* ⭐ 예산 대비 지출 진행률 — 부부가 같이 보는 화면이니 이번 해 예산을 얼마나
          썼는지 막대 하나로 바로 알 수 있게 한다(총예산 목표 설정 시에만). */}
      {budgetTarget > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] font-bold text-gray-600">예산 대비 지출</div>
            <div className="text-[10.5px] font-semibold text-gray-400">{Math.round((totalExpense / budgetTarget) * 100)}%</div>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, (totalExpense / budgetTarget) * 100)}%`, background: totalExpense > budgetTarget ? "#dc2626" : accent }}
            />
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-[13px] font-bold text-gray-700 mb-2.5">다가오는 일정</div>
        {upcoming.length === 0 && <div className="text-[12px] text-gray-400 py-3 text-center">등록된 일정이 없습니다</div>}
        <div className="space-y-2">
          {upcoming.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-[12.5px] border-b border-gray-50 last:border-b-0 pb-2 last:pb-0">
              <span className="text-gray-700 font-semibold truncate">{s.title}</span>
              <span className="text-gray-400 shrink-0 ml-2">{s.date}{s.time ? ` ${s.time}` : ""}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-[13px] font-bold text-gray-700 mb-2.5">가족 예산 묶음</div>
        {groups.length === 0 && <div className="text-[12px] text-gray-400 py-3 text-center">등록된 예산 묶음이 없습니다</div>}
        <div className="space-y-2">
          {groups.map(([g, rows]) => (
            <div key={g} className="flex items-center justify-between text-[12.5px] border-b border-gray-50 last:border-b-0 pb-2 last:pb-0">
              <span className="text-gray-700 font-semibold truncate">{g}</span>
              <span className="text-gray-500 shrink-0 ml-2">{fmtWon(rows.reduce((s, r) => s + Number(r.amount || 0), 0))}</span>
            </div>
          ))}
        </div>
        {groups.length > 0 && (
          <div className="flex items-center justify-between text-[12.5px] mt-2 pt-2 border-t border-gray-100 font-bold" style={{ color: accent }}>
            <span>합계</span><span>{fmtWon(familyTotal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const WEEKDAY_KO_M = ["일", "월", "화", "수", "목", "금", "토"];
function dateLabelKoM(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${dateStr}(${WEEKDAY_KO_M[d.getDay()]})`;
}

// ⭐ 예전엔 카드 하나에 날짜·분류가 다 뒤섞여 있었다. 위에는 분류별 합계 칩을,
// 아래는 날짜별로 소제목을 나눠서 목록을 보여준다 — 분류/날짜 기준으로 딱딱 구분.
function MobileLedger({ year, rows, companyName, actorName, accent }) {
  const [month, setMonth] = useState(0);
  const [editing, setEditing] = useState(null);
  const printRef = useRef(null);
  const filtered = useMemo(
    () => (month ? rows.filter((r) => Number(String(r.date || "").slice(5, 7)) === month) : rows).sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [rows, month]
  );
  const totalIncome = filtered.filter((r) => r.type === "income").reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalExpense = filtered.filter((r) => r.type === "expense").reduce((s, r) => s + Number(r.amount || 0), 0);

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

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-gray-600">
          <option value={0}>전체 월</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}월</option>)}
        </select>
        <button onClick={() => setEditing({})} className="ml-auto px-3 py-1.5 rounded-lg text-white text-[12px] font-bold" style={{ background: accent }}>내역 추가</button>
      </div>
      <div className="flex gap-2 mb-3">
        <button onClick={() => exportTableToExcel(`수입지출_${year}${month ? `_${month}월` : ""}`, filtered, { date: "날짜", type: "구분", title: "항목명", category: "분류", amount: "금액", memo: "메모" })}
          className="flex-1 py-1.5 rounded-lg border border-gray-200 text-[11.5px] font-semibold text-gray-600">엑셀 다운로드</button>
        <button onClick={() => exportPrintableToPdf(printRef.current, `수입지출_${year}${month ? `_${month}월` : ""}`)}
          className="flex-1 py-1.5 rounded-lg border border-gray-200 text-[11.5px] font-semibold text-gray-600">PDF 다운로드</button>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white border border-gray-200 rounded-lg px-2.5 py-2">
          <div className="text-[10px] text-gray-400">수입</div>
          <div className="text-[12.5px] font-bold text-gray-700">{fmtWon(totalIncome)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg px-2.5 py-2">
          <div className="text-[10px] text-gray-400">지출</div>
          <div className="text-[12.5px] font-bold text-red-600">{fmtWon(totalExpense)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg px-2.5 py-2">
          <div className="text-[10px] text-gray-400">잔액</div>
          <div className="text-[12.5px] font-bold" style={{ color: accent }}>{fmtWon(totalIncome - totalExpense)}</div>
        </div>
      </div>

      {categoryTotals.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] font-bold text-gray-500 mb-1.5">분류별 합계</div>
          <div className="flex flex-wrap gap-1.5">
            {categoryTotals.map(([cat, amt]) => (
              <div key={cat} className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white">
                <span className="text-[10.5px] text-gray-400 mr-1">{cat}</span>
                <span className={`text-[11.5px] font-bold ${amt < 0 ? "text-red-600" : "text-gray-700"}`}>
                  {amt >= 0 ? "+" : ""}{amt.toLocaleString()}원
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dateGroups.length === 0 && <div className="bg-white border border-gray-200 rounded-xl py-10 text-center text-[12.5px] text-gray-400">등록된 내역이 없습니다</div>}
      <div className="space-y-3">
        {dateGroups.map(([date, items]) => (
          <div key={date}>
            <div className="text-[11px] font-bold text-gray-500 mb-1.5 px-0.5">{dateLabelKoM(date)}</div>
            <div className="space-y-1.5">
              {items.map((r) => (
                <div key={r.id} onClick={() => setEditing(r)} className="bg-white border border-gray-200 rounded-xl p-3 active:bg-gray-50">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9.5px] font-bold ${r.type === "income" ? "bg-gray-100 text-gray-600" : "bg-red-50 text-red-500"}`}>
                        {r.type === "income" ? "수입" : "지출"}
                      </span>
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
      <PrintableLedger innerRef={printRef} companyName={companyName} year={year} month={month} rows={filtered} totalIncome={totalIncome} totalExpense={totalExpense} accent={accent} />
      {editing && <LedgerEntryModal initial={editing.id ? editing : null} companyName={companyName} actorName={actorName} accent={accent} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MobileCalendar({ year, schedules, companyName, actorName, accent }) {
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(year);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [editing, setEditing] = useState(null);
  React.useEffect(() => { setViewYear(year); }, [year]);

  const byDate = useMemo(() => {
    const map = new Map();
    schedules.forEach((s) => { if (!s.date) return; if (!map.has(s.date)) map.set(s.date, []); map.get(s.date).push(s); });
    return map;
  }, [schedules]);

  const first = new Date(viewYear, viewMonth, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const fmt = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const todayS = todayStr();
  const goMonth = (delta) => { let m = viewMonth + delta, y = viewYear; if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; } setViewMonth(m); setViewYear(y); };
  const dayItems = byDate.get(selectedDate) || [];

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
        <div className="text-[12.5px] font-bold text-gray-600">{selectedDate}</div>
        <button onClick={() => setEditing({ date: selectedDate })} className="px-2.5 py-1 rounded-lg text-white text-[11px] font-bold" style={{ background: accent }}>일정 추가</button>
      </div>
      {dayItems.length === 0 && <div className="bg-white border border-gray-200 rounded-xl py-8 text-center text-[12px] text-gray-400">등록된 일정이 없습니다</div>}
      <div className="space-y-2">
        {dayItems.map((it) => (
          <div key={it.id} onClick={() => setEditing(it)} className="bg-white border border-gray-200 rounded-xl p-3 active:bg-gray-50">
            <div className="text-[13px] font-bold text-gray-800">{it.title}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              {it.time ? `${it.time} · ` : ""}{it.memo || ""}{it.createdByName ? ` · ${it.createdByName}` : ""}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <ScheduleEntryModal initial={editing.id ? editing : null} defaultDate={editing.date} companyName={companyName} actorName={actorName} accent={accent} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

// ⭐ 본가/처가·외가를 섞어 한 리스트로 보여주던 예전 방식 대신, 묶음 하나를 좌우
// 두 칸("본가" | "처가·외가")으로 딱 나눠 보여준다. 화면이 좁은 모바일에서도
// grid-cols-2로 나란히 배치하면 구분이 뚜렷하다. 맨 아래엔 총 인원수·총 금액.
const FAMILY_SIDES_M = ["본가", "처가/외가"];

// ⭐ 인원 적은 쪽 소계가 위로 붙던 문제 — 칸을 세로 flex로 만들고 목록 박스를
// flex-1로 늘려 소계가 항상 양쪽 같은 줄(맨 아래)에 맞춰지게 했다. 글씨도
// 전체적으로 크고 진하게(너무 작고 흐리다는 피드백).
function MobileFamilyColumn({ title, rows, accent, onEdit }) {
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  return (
    <div className="min-w-0 flex flex-col">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[12.5px] font-bold text-gray-700">{title}</div>
        <div className="text-[11px] font-semibold text-gray-500">{rows.length}명</div>
      </div>
      <div className="bg-gray-50 rounded-lg border border-gray-100 overflow-hidden flex-1">
        {rows.length === 0 && <div className="py-4 text-center text-[11.5px] text-gray-400">없음</div>}
        {rows.map((r) => (
          <div key={r.id} onClick={() => onEdit(r)} className="px-2.5 py-2 border-b border-white last:border-b-0 active:bg-white">
            <div className="text-[13px] font-semibold text-gray-900 truncate">{r.title}</div>
            <div className="text-[12px] font-bold text-gray-700">{fmtWon(r.amount)}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-[12px] mt-1.5 text-gray-600 font-semibold">
        <span>소계</span><span className="font-bold text-[12.5px]" style={{ color: accent }}>{fmtWon(total)}</span>
      </div>
    </div>
  );
}

function MobileFamily({ groups, companyName, actorName, accent }) {
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const printRefs = useRef({});

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setShowNewGroup(true)} className="px-3 py-1.5 rounded-lg text-white text-[12px] font-bold" style={{ background: accent }}>새 예산 묶음</button>
      </div>
      {groups.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl py-14 text-center text-[12.5px] text-gray-400 px-6">
          등록된 예산 묶음이 없습니다. "새 예산 묶음"으로 명절·경조사 예산표를 만들어 보세요.
        </div>
      )}
      <div className="space-y-3">
        {groups.map(([g, rows]) => {
          const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
          const bySide = FAMILY_SIDES_M.map((side) => [side, rows.filter((r) => r.category === side)]);
          const etc = rows.filter((r) => !FAMILY_SIDES_M.includes(r.category));
          if (!printRefs.current[g]) printRefs.current[g] = React.createRef();
          return (
            <div key={g} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-3.5 py-3 border-b border-gray-100">
                <div className="text-[13px] font-bold text-gray-800 mb-1.5">{g}</div>
                <div className="flex items-center gap-3">
                  <button onClick={() => exportTableToExcel(`${g}_가족예산`, rows, { title: "이름", category: "구분", amount: "금액", memo: "메모" })}
                    className="text-[11px] font-semibold text-gray-400">엑셀</button>
                  <button onClick={() => exportPrintableToPdf(printRefs.current[g].current, `${g}_가족예산`)}
                    className="text-[11px] font-semibold text-gray-400">PDF</button>
                  <button onClick={() => setEditingMember({ group: g })}
                    className="ml-auto text-[11px] font-semibold text-white px-2 py-1 rounded-md" style={{ background: accent }}>구성원 추가</button>
                </div>
              </div>

              <div className="p-3 grid grid-cols-2 gap-3">
                {bySide.map(([side, sideRows]) => (
                  <MobileFamilyColumn key={side} title={side} rows={sideRows} accent={accent} onEdit={(r) => setEditingMember({ group: g, entry: r })} />
                ))}
              </div>

              {etc.length > 0 && (
                <div className="px-3 pb-3">
                  <div className="text-[11.5px] font-bold text-gray-600 mb-1.5">기타</div>
                  <div className="bg-gray-50 rounded-lg border border-gray-100 overflow-hidden">
                    {etc.map((r) => (
                      <div key={r.id} onClick={() => setEditingMember({ group: g, entry: r })} className="flex items-center justify-between px-2.5 py-2 border-b border-white last:border-b-0">
                        <span className="text-[12px] font-semibold text-gray-800 truncate">{r.title}</span>
                        <span className="text-[11px] font-bold text-gray-600 shrink-0 ml-2">{fmtWon(r.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="px-3.5 py-2.5 flex items-center justify-between border-t border-gray-100" style={{ background: `${accent}0a` }}>
                <span className="text-[11px] font-semibold text-gray-500">총 {rows.length}명</span>
                <span className="text-[13px] font-extrabold" style={{ color: accent }}>{fmtWon(total)}</span>
              </div>

              <PrintableFamily innerRef={printRefs.current[g]} companyName={companyName} group={g} rows={rows} total={total} accent={accent} />
            </div>
          );
        })}
      </div>
      {showNewGroup && <NewGroupModal accent={accent} onClose={() => setShowNewGroup(false)} onCreate={(name) => { setShowNewGroup(false); setEditingMember({ group: name }); }} />}
      {editingMember && (
        <FamilyMemberModal initial={editingMember.entry} group={editingMember.group} companyName={companyName} actorName={actorName} accent={accent} onClose={() => setEditingMember(null)} />
      )}
    </div>
  );
}
