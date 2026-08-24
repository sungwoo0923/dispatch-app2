// src/AdminPlanner.jsx — "나의 플래너" (관리센터 > 최고관리자 전용 탭)
// ⭐ 배차/오더/거래처 등 이 프로그램의 다른 어떤 데이터와도 전혀 연관되지 않는
// 최고관리자 개인용 메뉴다. 수입/지출 가계부, 일정 달력, 명절·가족 예산을
// 자유롭게 기록하고 PDF/엑셀로 내보낼 수 있다.
import React, { useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { KOREAN_HOLIDAYS, shortHolidayLabel } from "./CustomDatePicker";
import {
  usePlannerEntries, addPlannerEntry, updatePlannerEntry, deletePlannerEntry,
  upsertBudgetTarget, fmtWon, todayStr,
} from "./adminPlannerData";

const NAVY = "#1B2B4B";
const CATEGORY_SUGGESTIONS = ["생활비", "경조사", "명절", "세금/공과금", "보험", "여행", "자녀", "부모님", "기타"];

function todayY() { return new Date().getFullYear(); }

// ────────────────────────────────────────────────
// 공통 UI 조각
// ────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative bg-white rounded-2xl w-full ${wide ? "max-w-lg" : "max-w-sm"} max-h-[88vh] overflow-y-auto p-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
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

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]";

// ────────────────────────────────────────────────
// 수입/지출 등록·수정 모달
// ────────────────────────────────────────────────
function LedgerEntryModal({ initial, defaultType = "expense", companyName, actorName, onClose }) {
  const [type, setType] = useState(initial?.type || defaultType);
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
      const payload = {
        type, companyName, title: title.trim(), category: category.trim(),
        amount: Number(amount), date, memo: memo.trim(), createdByName: actorName || "",
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
      <Field label="구분">
        <div className="flex gap-2">
          {[["expense", "지출"], ["income", "수입"]].map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setType(v)}
              className={`flex-1 py-2 rounded-lg text-[13px] font-bold border ${
                type === v ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-500 border-gray-200"
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
        <input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="예: 생활비" list="planner-category-list" />
        <datalist id="planner-category-list">
          {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
        </datalist>
      </Field>
      <Field label="금액(원)">
        <input className={inputCls} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label="날짜">
        <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
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
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: NAVY }}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────
// 일정 등록·수정 모달
// ────────────────────────────────────────────────
function ScheduleEntryModal({ initial, defaultDate, companyName, actorName, onClose }) {
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
    } catch (e) {
      alert("저장 중 오류가 발생했습니다: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={initial?.id ? "일정 수정" : "일정 등록"} onClose={onClose}>
      <Field label="제목">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 세무사 미팅" />
      </Field>
      <Field label="날짜">
        <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="시간(선택)">
        <input className={inputCls} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </Field>
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
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: NAVY }}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────
// 가족/명절 예산 구성원 등록·수정 모달
// ────────────────────────────────────────────────
function FamilyMemberModal({ initial, group, companyName, actorName, onClose }) {
  const [name, setName] = useState(initial?.title || "");
  const [side, setSide] = useState(initial?.category || "본가");
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : "");
  const [memo, setMemo] = useState(initial?.memo || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { alert("이름을 입력해 주세요."); return; }
    setSaving(true);
    try {
      const payload = {
        type: "familyBudget", companyName, group, title: name.trim(), category: side,
        amount: Number(amount) || 0, memo: memo.trim(), createdByName: actorName || "",
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
    <Modal title={initial?.id ? "구성원 수정" : "구성원 추가"} onClose={onClose}>
      <Field label="이름">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 아버지" />
      </Field>
      <Field label="구분">
        <div className="flex gap-2">
          {["본가", "처가/외가", "기타"].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setSide(v)}
              className={`flex-1 py-2 rounded-lg text-[12.5px] font-bold border ${
                side === v ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-500 border-gray-200"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </Field>
      <Field label="금액(원)">
        <input className={inputCls} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label="메모">
        <textarea className={inputCls} rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </Field>
      <div className="flex gap-2 mt-4">
        {initial?.id && (
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
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[13px] font-semibold">닫기</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: NAVY }}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────
// 새 명절/가족예산 묶음 생성 모달
// ────────────────────────────────────────────────
function NewGroupModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  return (
    <Modal title="새 예산 묶음 만들기" onClose={onClose}>
      <Field label="묶음 이름">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 2026년 추석" autoFocus />
      </Field>
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[13px] font-semibold">닫기</button>
        <button
          onClick={() => { if (!name.trim()) { alert("이름을 입력해 주세요."); return; } onCreate(name.trim()); }}
          className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold"
          style={{ background: NAVY }}
        >
          만들기
        </button>
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

async function exportPrintableToPdf(node, filename) {
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
  pdf.save(`${filename}.pdf`);
}

function PrintableLedger({ innerRef, companyName, year, month, rows, totalIncome, totalExpense }) {
  return (
    <div style={{ position: "fixed", left: -99999, top: 0, width: 780 }}>
      <div ref={innerRef} style={{ width: 780, background: "#fff", padding: 28, fontFamily: "'Noto Sans KR', sans-serif" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 2 }}>수입·지출 내역서</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
          {companyName} · {year}년{month ? ` ${month}월` : " 전체"} · 생성일 {todayStr()}
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          {[
            ["총 수입", fmtWon(totalIncome)],
            ["총 지출", fmtWon(totalExpense)],
            ["잔액", fmtWon(totalIncome - totalExpense)],
          ].map(([label, val]) => (
            <div key={label} style={{ flex: 1, border: `1px solid #e2e8f0`, borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>{val}</div>
            </div>
          ))}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: NAVY, color: "#fff" }}>
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
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 2 }}>{group} — 가족 예산표</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>{companyName} · 생성일 {todayStr()}</div>
        <div style={{ marginBottom: 16, border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", display: "inline-block" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>총 예산</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>{fmtWon(total)}</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: NAVY, color: "#fff" }}>
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
export default function AdminPlanner({ userCompany, myRealName }) {
  const companyName = userCompany || localStorage.getItem("userCompany") || "";
  const { entries } = usePlannerEntries(companyName);
  const [tab, setTab] = useState("dashboard");
  const [year, setYear] = useState(todayY());

  const incomeExpense = useMemo(() => entries.filter((e) => e.type === "income" || e.type === "expense"), [entries]);
  const schedules = useMemo(() => entries.filter((e) => e.type === "schedule"), [entries]);
  const familyEntries = useMemo(() => entries.filter((e) => e.type === "familyBudget"), [entries]);
  const budgetTarget = useMemo(
    () => entries.find((e) => e.type === "budgetTarget" && String(e.year) === String(year))?.amount || 0,
    [entries, year]
  );

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
          <div className="text-[12px] text-gray-400 mt-0.5">최고관리자 전용 · 다른 배차 데이터와 연동되지 않는 개인 기록입니다.</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear((y) => y - 1)} className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500">‹</button>
          <div className="text-[14px] font-bold text-gray-700 w-16 text-center">{year}년</div>
          <button onClick={() => setYear((y) => y + 1)} className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500">›</button>
        </div>
      </div>

      <div className="flex gap-2 mb-5">
        {[["dashboard", "요약"], ["ledger", "수입·지출"], ["calendar", "일정"], ["family", "명절/가족 예산"]].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`px-4 py-2 text-[13px] font-bold rounded-lg transition border ${
              tab === v ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#1B2B4B] border-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white"
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
        />
      )}
      {tab === "ledger" && (
        <LedgerTab year={year} rows={yearRows} companyName={companyName} actorName={myRealName} />
      )}
      {tab === "calendar" && (
        <CalendarTab year={year} schedules={schedules} companyName={companyName} actorName={myRealName} />
      )}
      {tab === "family" && (
        <FamilyTab groups={groups} companyName={companyName} actorName={myRealName} />
      )}
    </div>
  );
}

function DashboardTab({ year, budgetTarget, totalIncome, totalExpense, schedules, groups, companyName, actorName, entries }) {
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(budgetTarget || ""));
  const balance = totalIncome - totalExpense;
  const upcoming = useMemo(() => {
    const t = todayStr();
    return schedules.filter((s) => (s.date || "") >= t).sort((a, b) => (a.date || "").localeCompare(b.date || "")).slice(0, 5);
  }, [schedules]);
  const familyTotal = useMemo(() => groups.reduce((sum, [, rows]) => sum + rows.reduce((s, r) => s + Number(r.amount || 0), 0), 0), [groups]);

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-bold text-gray-400">{year}년 총예산 목표</div>
            <button onClick={() => setEditingBudget((v) => !v)} className="text-[11px] font-semibold text-[#1B2B4B] hover:underline">수정</button>
          </div>
          {editingBudget ? (
            <div className="flex gap-1 mt-1">
              <input className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-[13px]" type="number" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} />
              <button
                onClick={async () => { await upsertBudgetTarget({ companyName, year, amount: budgetInput, entries, actorName }); setEditingBudget(false); }}
                className="px-3 rounded-lg text-white text-[12px] font-bold" style={{ background: NAVY }}
              >
                저장
              </button>
            </div>
          ) : (
            <div className="text-[19px] font-extrabold" style={{ color: NAVY }}>{fmtWon(budgetTarget)}</div>
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
          <div className="text-[19px] font-extrabold" style={{ color: balance >= 0 ? NAVY : "#dc2626" }}>{fmtWon(balance)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[13px] font-bold text-gray-700 mb-3">다가오는 일정</div>
          {upcoming.length === 0 && <div className="text-[12px] text-gray-400 py-4 text-center">등록된 일정이 없습니다</div>}
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
          <div className="text-[13px] font-bold text-gray-700 mb-3">명절/가족 예산 묶음</div>
          {groups.length === 0 && <div className="text-[12px] text-gray-400 py-4 text-center">등록된 예산 묶음이 없습니다</div>}
          <div className="space-y-2">
            {groups.map(([g, rows]) => (
              <div key={g} className="flex items-center justify-between text-[12.5px] border-b border-gray-50 last:border-b-0 pb-2 last:pb-0">
                <span className="text-gray-700 font-semibold truncate">{g}</span>
                <span className="text-gray-500 shrink-0 ml-2">{fmtWon(rows.reduce((s, r) => s + Number(r.amount || 0), 0))}</span>
              </div>
            ))}
          </div>
          {groups.length > 0 && (
            <div className="flex items-center justify-between text-[12.5px] mt-2 pt-2 border-t border-gray-100 font-bold" style={{ color: NAVY }}>
              <span>합계</span><span>{fmtWon(familyTotal)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LedgerTab({ year, rows, companyName, actorName }) {
  const [month, setMonth] = useState(0); // 0 = 전체
  const [editing, setEditing] = useState(null); // null | {} | entry
  const printRef = useRef(null);

  const filtered = useMemo(
    () => (month ? rows.filter((r) => Number(String(r.date || "").slice(5, 7)) === month) : rows).sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [rows, month]
  );
  const totalIncome = filtered.filter((r) => r.type === "income").reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalExpense = filtered.filter((r) => r.type === "expense").reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="border border-gray-200 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-gray-600">
          <option value={0}>전체 월</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}월</option>)}
        </select>
        <div className="flex gap-2">
          <button
            onClick={() => exportTableToExcel(`수입지출_${year}${month ? `_${month}월` : ""}`, filtered, { date: "날짜", type: "구분", title: "항목명", category: "분류", amount: "금액", memo: "메모" })}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"
          >
            엑셀 다운로드
          </button>
          <button
            onClick={() => exportPrintableToPdf(printRef.current, `수입지출_${year}${month ? `_${month}월` : ""}`)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"
          >
            PDF 다운로드
          </button>
          <button onClick={() => setEditing({})} className="px-3 py-1.5 rounded-lg text-white text-[12px] font-bold" style={{ background: NAVY }}>
            내역 추가
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-3 text-[12.5px]">
        <div className="text-gray-500">수입 <span className="font-bold text-gray-700">{fmtWon(totalIncome)}</span></div>
        <div className="text-gray-500">지출 <span className="font-bold text-red-600">{fmtWon(totalExpense)}</span></div>
        <div className="text-gray-500">잔액 <span className="font-bold" style={{ color: NAVY }}>{fmtWon(totalIncome - totalExpense)}</span></div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[90px_60px_1fr_100px_120px_1fr] gap-2 px-4 py-2 bg-gray-50 text-[11px] font-bold text-gray-400 border-b border-gray-100">
          <div>날짜</div><div>구분</div><div>항목명</div><div>분류</div><div className="text-right">금액</div><div>메모</div>
        </div>
        {filtered.length === 0 && <div className="py-10 text-center text-[12.5px] text-gray-400">등록된 내역이 없습니다</div>}
        {filtered.map((r) => (
          <div
            key={r.id}
            onClick={() => setEditing(r)}
            className="grid grid-cols-[90px_60px_1fr_100px_120px_1fr] gap-2 px-4 py-2.5 text-[12.5px] border-b border-gray-50 last:border-b-0 hover:bg-gray-50 cursor-pointer items-center"
          >
            <div className="text-gray-500">{r.date}</div>
            <div className={r.type === "income" ? "text-gray-700 font-semibold" : "text-red-600 font-semibold"}>{r.type === "income" ? "수입" : "지출"}</div>
            <div className="text-gray-800 font-semibold truncate">{r.title}</div>
            <div className="text-gray-400 truncate">{r.category}</div>
            <div className={`text-right font-bold ${r.type === "income" ? "text-gray-700" : "text-red-600"}`}>{fmtWon(r.amount)}</div>
            <div className="text-gray-400 truncate">{r.memo}</div>
          </div>
        ))}
      </div>

      <PrintableLedger innerRef={printRef} companyName={companyName} year={year} month={month} rows={filtered} totalIncome={totalIncome} totalExpense={totalExpense} />

      {editing && (
        <LedgerEntryModal initial={editing.id ? editing : null} companyName={companyName} actorName={actorName} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function CalendarTab({ year, schedules, companyName, actorName }) {
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(year);
  const [editing, setEditing] = useState(null); // null | {date} | entry
  React.useEffect(() => { setViewYear(year); }, [year]);

  const byDate = useMemo(() => {
    const map = new Map();
    schedules.forEach((s) => {
      if (!s.date) return;
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date).push(s);
    });
    return map;
  }, [schedules]);

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
          <button onClick={() => goMonth(-1)} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-[#1B2B4B] font-bold">‹</button>
          <div className="text-[14px] font-bold text-[#1B2B4B]">{viewYear}년 {viewMonth + 1}월</div>
          <button onClick={() => goMonth(1)} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-[#1B2B4B] font-bold">›</button>
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
                className={`min-h-[92px] rounded-lg border p-1.5 cursor-pointer hover:border-[#1B2B4B] transition ${isToday ? "border-2 border-[#1B2B4B]" : "border-gray-100"}`}
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
                      className="text-[10px] font-semibold rounded px-1 py-[1px] truncate text-white"
                      style={{ background: NAVY }}
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

function FamilyTab({ groups, companyName, actorName }) {
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [editingMember, setEditingMember] = useState(null); // {group} | {group, entry}
  const [expanded, setExpanded] = useState(() => new Set(groups.map(([g]) => g)));
  const printRefs = useRef({});

  const toggle = (g) => setExpanded((prev) => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setShowNewGroup(true)} className="px-3 py-1.5 rounded-lg text-white text-[12px] font-bold" style={{ background: NAVY }}>
          새 예산 묶음
        </button>
      </div>

      {groups.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-[13px] text-gray-400">
          등록된 예산 묶음이 없습니다. "새 예산 묶음"으로 명절·경조사 등 예산표를 만들어 보세요.
        </div>
      )}

      <div className="space-y-3">
        {groups.map(([g, rows]) => {
          const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
          const isOpen = expanded.has(g);
          if (!printRefs.current[g]) printRefs.current[g] = React.createRef();
          return (
            <div key={g} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => toggle(g)}>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-gray-800">{g}</span>
                  <span className="text-[11px] text-gray-400">{rows.length}명</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-bold" style={{ color: NAVY }}>{fmtWon(total)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); exportTableToExcel(`${g}_가족예산`, rows, { title: "이름", category: "구분", amount: "금액", memo: "메모" }); }}
                    className="text-[11px] font-semibold text-gray-400 hover:text-[#1B2B4B]"
                  >
                    엑셀
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); exportPrintableToPdf(printRefs.current[g].current, `${g}_가족예산`); }}
                    className="text-[11px] font-semibold text-gray-400 hover:text-[#1B2B4B]"
                  >
                    PDF
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingMember({ group: g }); }}
                    className="text-[11px] font-semibold text-white px-2 py-1 rounded-md" style={{ background: NAVY }}
                  >
                    구성원 추가
                  </button>
                </div>
              </div>
              {isOpen && (
                <div className="border-t border-gray-100">
                  {rows.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => setEditingMember({ group: g, entry: r })}
                      className="flex items-center justify-between px-4 py-2 text-[12.5px] border-b border-gray-50 last:border-b-0 hover:bg-gray-50 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-gray-800 font-semibold shrink-0">{r.title}</span>
                        <span className="text-gray-400 shrink-0">{r.category}</span>
                        {r.memo && <span className="text-gray-400 truncate">· {r.memo}</span>}
                      </div>
                      <span className="text-gray-700 font-bold shrink-0 ml-2">{fmtWon(r.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <PrintableFamily innerRef={printRefs.current[g]} companyName={companyName} group={g} rows={rows} total={total} />
            </div>
          );
        })}
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
