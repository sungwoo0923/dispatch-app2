// ======================= src/OfficeBooks.jsx =======================
// 💼 경리 업무(2026-10-31) — 수입·지출 장부(현금출납) · 고정비 · 비품·자산 관리. PC·모바일 공용(반응형).
//  · 수입·지출: 날짜·구분·계정과목·결제수단·거래처·증빙(영수증 사진) → 월별 합계·계정별 비중·일자별 목록·CSV
//    전자결재 "비용·지출 결의" 승인분을 한 번에 장부로 가져오기, 매달 나가는 고정비(임대료·통신비 등) 한 번에 반영
//  · 비품·자산: 사무가구·IT기기·소모품 등 — 수량·위치·담당자·구입가·상태, 소모품은 최소 수량 아래면 "재고 부족", 입출고 이력
import React from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, arrayUnion } from "firebase/firestore";
import { db, auth } from "./firebase";
import { compressImage } from "./InternalMail";
import CustomDatePicker from "./CustomDatePicker";
import { CustomSelect } from "./CustomSelect";
import { computeFunds, isCard, isCredit, last4, fundBadge } from "./fundsCalc";
import { upsertAutoEntry } from "./ledgerAuto";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
export const HERO_BG = "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)";
// 이미지(데이터 URL) 파일로 저장
export function saveImage(dataUrl, name = "이미지") {
  if (!dataUrl) return;
  const a = document.createElement("a"); a.href = dataUrl; a.download = `${String(name).replace(/[\\/:*?"<>|]/g, "_")}.jpg`;
  document.body.appendChild(a); a.click(); a.remove();
}
const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const won = (n) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}`;
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0);
const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";

// ── 공용 디자인 조각 ──
export function BookHero({ en, title, desc, kpis = [], right }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] px-4 py-4 md:px-7 md:py-5 text-white shadow-[0_14px_32px_rgba(15,26,48,0.25)]" style={{ background: HERO_BG }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[11px] md:text-[12px] font-extrabold tracking-[0.26em] text-[#8FB0F0] whitespace-nowrap" style={{ fontFamily: MONO }}>{en}</div>
          <div className="text-[20px] md:text-[24px] font-black mt-0.5">{title}</div>
          <div className="text-[12.5px] md:text-[14px] text-white/60 mt-0.5">{desc}</div>
        </div>
        {right}
      </div>
      {kpis.length > 0 && (
        <div className={`mt-3 grid grid-cols-2 ${kpis.length >= 4 ? "md:grid-cols-4" : "md:grid-cols-3"} gap-2`}>
          {kpis.map(([l, v, sub]) => (
            <div key={l} className="rounded-2xl bg-white/[0.07] border border-white/10 px-3 md:px-4 py-2.5 min-w-0">
              <div className="text-[11.5px] md:text-[12.5px] font-bold text-white/55 whitespace-nowrap truncate">{l}</div>
              <div className="text-[18px] md:text-[21px] font-black tabular-nums whitespace-nowrap truncate" style={{ fontFamily: MONO }}>{v}</div>
              {sub && <div className="text-[11px] text-white/45 truncate">{sub}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function BookCard({ en, title, right, children, flush = false }) {
  return (
    <div className="rounded-[20px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_rgba(16,24,40,0.05)] overflow-hidden min-w-0">
      {(en || title) && (
        <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            {en && <div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#4B6CB7] whitespace-nowrap" style={{ fontFamily: MONO }}>{en}</div>}
            <div className="text-[15px] font-black text-[#0F1A30] tracking-tight truncate">{title}</div>
          </div>
          {right}
        </div>
      )}
      <div className={flush ? "" : "px-4 pb-4"}>{children}</div>
    </div>
  );
}
export const Chip = ({ on, children, onClick }) => (
  <button type="button" onClick={onClick} className={`h-9 px-3.5 rounded-full text-[13px] font-black border whitespace-nowrap shrink-0 ${on ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE]"}`}>{children}</button>
);
const Label = ({ children }) => <div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5 whitespace-nowrap">{children}</div>;
export function Sheet({ title, en, onClose, children, footer, side = false }) {
  // ⭐ 2026-10-31 side — 등록·수정 창을 화면 오른쪽 넓은 사이드 패널로(팝업보다 크게 잘 보이게)
  if (side) return (
    <div className="fixed inset-0 z-[100000] bg-[#0F1A30]/45 flex justify-end" onClick={onClose}>
      <div className="kp-side-panel h-full w-full md:w-[600px] xl:w-[680px] bg-[#F4F6FA] flex flex-col shadow-[-24px_0_60px_rgba(15,26,48,0.35)]" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 md:px-7 py-5 text-white flex items-center gap-3 shrink-0" style={{ background: HERO_BG, paddingTop: "max(env(safe-area-inset-top, 0px), 20px)" }}>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{en}</div>
            <div className="text-[21px] md:text-[23px] font-black truncate">{title}</div>
          </div>
          <button type="button" onClick={onClose} className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 shrink-0 text-[15px]">✕</button>
        </div>
        <div className="kp-side-body flex-1 overflow-y-auto px-5 md:px-7 py-5 space-y-4">{children}</div>
        {footer && <div className="shrink-0 px-5 md:px-7 py-4 bg-white border-t border-[#E3E8F0] flex gap-2" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}>{footer}</div>}
      </div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-[100000] bg-[#0F1A30]/50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
      <div className="w-full md:max-w-[640px] max-h-[92vh] bg-[#F4F6FA] rounded-t-[24px] md:rounded-[22px] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 text-white flex items-center gap-3 shrink-0" style={{ background: HERO_BG }}>
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-extrabold tracking-[0.22em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{en}</div>
            <div className="text-[17px] font-black truncate">{title}</div>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 shrink-0">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">{children}</div>
        {footer && <div className="shrink-0 px-4 py-3 bg-white border-t border-[#E3E8F0] flex gap-2" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}>{footer}</div>}
      </div>
    </div>
  );
}
function useCompanyCol(name, company) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, name), where("companyName", "==", company)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
  }, [name, company]);
  return rows;
}

// ═════════════════════════ 수입·지출 장부 ═════════════════════════
export const LEDGER_ACCOUNTS = {
  지출: ["복리후생비", "여비교통비", "차량유지비", "유류비", "운반비", "접대비", "소모품비", "비품구입", "통신비", "임차료", "수도광열비", "보험료", "세금과공과", "지급수수료", "광고선전비", "교육훈련비", "도서인쇄비", "수선비", "급여·상여", "기타"],
  수입: ["운송수입", "기타수입", "이자수입", "보조금", "환급", "잡이익"],
};
const METHODS = ["법인카드", "계좌이체", "현금", "개인카드(정산)", "자동이체"];
const blankEntry = (type = "지출") => ({ date: kstDay(), type, account: type === "지출" ? "소모품비" : "운송수입", item: "", amount: "", method: type === "지출" ? "법인카드" : "계좌이체", vendor: "", memo: "", evidence: "", receipt: "" });

export function CashBook({ company, isViewer = false }) {
  const rowsRaw = useCompanyCol("acctLedger", company);
  // 자동 연동 줄 중 금액이 0이 된 것(지급 취소 등)은 숨긴다
  const rows = React.useMemo(() => (rowsRaw ? rowsRaw.filter((r) => !(r.auto && !toInt(r.amount))) : rowsRaw), [rowsRaw]);
  const recurring = useCompanyCol("acctRecurring", company);
  const funds = useCompanyCol("acctFunds", company);
  const [customAcc, setCustomAcc] = React.useState(false);
  const [photo, setPhoto] = React.useState(null); // 증빙 사진 보기·저장
  const [ym, setYm] = React.useState(kstDay().slice(0, 7));
  const [type, setType] = React.useState("전체");
  const [q, setQ] = React.useState("");
  const [edit, setEdit] = React.useState(null);
  const [recurOpen, setRecurOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [approvals, setApprovals] = React.useState([]);
  const fileRef = React.useRef(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "approvals"), where("company", "==", company), where("cat", "==", "expense")), (s) => setApprovals(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.cat === "expense" && a.status === "approved")), () => setApprovals([]));
  }, [company]);
  const F = React.useMemo(() => computeFunds(funds || [], rows || []), [funds, rows]);
  const fundOpts = F.list.filter((f) => f.kind !== "대출");
  const month = (rows || []).filter((r) => String(r.date || "").startsWith(ym));
  const income = month.filter((r) => r.type === "수입").reduce((s, r) => s + toInt(r.amount), 0);
  const expense = month.filter((r) => r.type === "지출").reduce((s, r) => s + toInt(r.amount), 0);
  const noEvidence = month.filter((r) => r.type === "지출" && !r.receipt && !r.evidence).length;
  const byAcc = {}; month.filter((r) => r.type === "지출").forEach((r) => { byAcc[r.account || "기타"] = (byAcc[r.account || "기타"] || 0) + toInt(r.amount); });
  const accTop = Object.entries(byAcc).sort((a, b) => b[1] - a[1]);
  const kw = q.trim();
  const list = month.filter((r) => (type === "전체" || r.type === type) && (!kw || [r.item, r.vendor, r.account, r.memo].some((v) => String(v || "").includes(kw))))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || tsMs(b.createdAt) - tsMs(a.createdAt));
  // 장부 — 날짜 오름차순 + 누계 잔액(이 달 수입 − 지출)
  const ledgerRows = (() => { let bal = 0; return [...list].sort((a, b) => String(a.date).localeCompare(String(b.date)) || tsMs(a.createdAt) - tsMs(b.createdAt)).map((r) => { bal += (r.type === "수입" ? 1 : -1) * toInt(r.amount); return { ...r, bal }; }); })();
  const daily = (() => { const dim = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate(); let cum = 0; return Array.from({ length: dim }, (_, i) => { const d = `${ym}-${String(i + 1).padStart(2, "0")}`; const l = month.filter((r) => r.date === d); const inn = l.filter((r) => r.type === "수입").reduce((s2, r) => s2 + toInt(r.amount), 0); const out = l.filter((r) => r.type === "지출").reduce((s2, r) => s2 + toInt(r.amount), 0); cum += inn - out; return { d: i + 1, in: inn, out, cum }; }); })();
  const imported = new Set((rows || []).map((r) => r.sourceId).filter(Boolean));
  const toImport = approvals.filter((a) => !imported.has(a.id) && Number(a.amount) > 0);
  const recurDone = new Set(month.map((r) => r.recurId).filter(Boolean));
  const recurTodo = (recurring || []).filter((r) => r.active !== false && !recurDone.has(r.id));
  const shiftYm = (n) => { const d = new Date(`${ym}-01T00:00:00`); d.setMonth(d.getMonth() + n); setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };

  const save = async () => {
    const e = edit;
    if (!e.item.trim() && !e.vendor.trim()) return alert("내용 또는 거래처를 입력해 주세요.");
    if (!toInt(e.amount)) return alert("금액을 입력해 주세요.");
    setBusy(true);
    try {
      const data = { date: e.date, type: e.type, account: String(e.account || "").trim() || "기타", fundId: e.fundId || "", item: e.item.trim(), amount: toInt(e.amount), method: e.method, vendor: e.vendor.trim(), memo: e.memo.trim(), evidence: e.evidence, receipt: e.receipt || "", companyName: company };
      if (e.id) await updateDoc(doc(db, "acctLedger", e.id), { ...data, updatedAt: serverTimestamp() });
      else await addDoc(collection(db, "acctLedger"), { ...data, createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "" });
      setEdit(null);
    } catch (err) { alert(`저장 실패: ${err.message}`); } finally { setBusy(false); }
  };
  const remove = async (e) => { if (!window.confirm("이 내역을 삭제할까요?")) return; await deleteDoc(doc(db, "acctLedger", e.id)); setEdit(null); };
  const importApprovals = async () => {
    if (!toImport.length) return;
    if (!window.confirm(`전자결재로 승인된 지출결의 ${toImport.length}건을 장부에 넣을까요?`)) return;
    setBusy(true);
    try {
      // ⭐ 2026-11-01 결제수단에 맞는 통장·카드가 하나뿐이면 자동 지정(자금 잔액에 바로 반영) — 여러 개면 장부에서 골라 주세요
      const pickFund = (pay) => {
        const p = String(pay || "");
        const c = /법인카드/.test(p) ? fundOpts.filter((f) => f.kind === "법인카드" || f.kind === "법인카드 한도") : /현금/.test(p) ? fundOpts.filter((f) => f.kind === "현금") : /계좌|이체/.test(p) ? fundOpts.filter((f) => f.kind === "보통예금") : [];
        return c.length === 1 ? c[0].id : "";
      };
      for (const a of toImport) {
        const d = a.data || {};
        await setDoc(doc(db, "acctLedger", `appr_${a.id}`), { fundId: pickFund(d.pay || d.method || "법인카드"), date: d.date || d.spendDate || new Date(tsMs(a.createdAt) + 9 * 3600e3).toISOString().slice(0, 10), type: "지출", account: d.account || "기타", item: a.title || a.formLabel || "지출결의", amount: Number(a.amount) || 0, method: d.pay || d.method || "법인카드", vendor: d.vendor || "", memo: `전자결재 ${a.docNo || ""} · ${a.drafter?.name || ""}`, evidence: "전자결재", receipt: (a.images || [])[0] || "", sourceId: a.id, companyName: company, createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "" }, { merge: true });
      }
    } finally { setBusy(false); }
  };
  // 고정비 한 달 치를 장부에 — 같은 고정비·같은 달은 한 줄만(문서 이름 고정: 여러 명이 눌러도 두 번 안 들어감)
  const writeRecur = async (list, month) => {
    for (const r of list) {
      const day = String(Math.min(28, Math.max(1, Number(r.day) || 1))).padStart(2, "0");
      await setDoc(doc(db, "acctLedger", `recur_${r.id}_${month}`), { date: `${month}-${day}`, type: r.type || "지출", account: r.account || "기타", item: r.name, amount: toInt(r.amount), method: r.method || "자동이체", fundId: r.fundId || "", vendor: r.vendor || "", memo: "고정비 자동 반영", evidence: "", receipt: "", recurId: r.id, companyName: company, createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "" }, { merge: true });
    }
  };
  // ⭐ 2026-11-01 이번 달 고정비는 납부일이 지나면 장부를 열 때 자동 반영(경리·관리자 화면)
  const autoRecurRef = React.useRef("");
  React.useEffect(() => {
    if (isViewer || !rows || !recurring) return;
    const today = kstDay(); const month = today.slice(0, 7);
    if (ym !== month || autoRecurRef.current === month) return;
    const due = recurTodo.filter((r) => Math.min(28, Math.max(1, Number(r.day) || 1)) <= Number(today.slice(8, 10)));
    autoRecurRef.current = month;
    if (due.length) writeRecur(due, month).catch(() => {});
  }, [rows, recurring, ym, isViewer]); // eslint-disable-line react-hooks/exhaustive-deps
  const applyRecurring = async () => {
    if (!recurTodo.length) return;
    if (!window.confirm(`${ym.replace("-", "년 ")}월 고정비 ${recurTodo.length}건을 장부에 넣을까요?`)) return;
    setBusy(true);
    try {
      await writeRecur(recurTodo, ym);
    } finally { setBusy(false); }
  };
  const csv = () => {
    const head = ["날짜", "구분", "계정과목", "내용", "거래처", "결제수단", "금액", "증빙", "메모"];
    const lines = [head.join(","), ...list.map((r) => [r.date, r.type, r.account, r.item, r.vendor, r.method, r.amount, r.receipt ? "영수증" : r.evidence || "", r.memo].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" })); a.download = `수입지출_${ym}.csv`; a.click();
  };

  return (
    <div className="space-y-4">
      <BookHero en="ACCOUNTING · CASH BOOK" title="수입·지출 장부" desc="돈이 들어오고 나간 내역을 날짜·계정과목별로 기록하고 증빙(영수증)까지 보관합니다"
        right={<div className="flex items-center gap-1.5">
          <button type="button" onClick={() => shiftYm(-1)} className="w-9 h-9 rounded-xl bg-white/10 border border-white/15">‹</button>
          <span className="h-9 px-3 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black grid place-items-center tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{ym.replace("-", ".")}</span>
          <button type="button" onClick={() => shiftYm(1)} className="w-9 h-9 rounded-xl bg-white/10 border border-white/15">›</button>
        </div>}
        kpis={[["수입", `${won(income)}원`, `${month.filter((r) => r.type === "수입").length}건`], ["지출", `${won(expense)}원`, `${month.filter((r) => r.type === "지출").length}건`], ["수지 차액", `${income - expense >= 0 ? "+" : ""}${won(income - expense)}원`, "수입 − 지출"], ["증빙 없는 지출", `${noEvidence}건`, "영수증·전자결재 미첨부"]]} />

      {!isViewer && (toImport.length > 0 || recurTodo.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {toImport.length > 0 && <button type="button" disabled={busy} onClick={importApprovals} className="rounded-2xl border border-[#C9D6EE] bg-[#EEF3FC] px-4 py-3 text-left"><b className="text-[14px] text-[#0F1A30]">✎ 승인된 지출결의 {toImport.length}건 가져오기</b><div className="text-[12px] text-[#5B6B85]">전자결재 › 비용·지출 결의에서 승인된 문서를 장부에 넣습니다</div></button>}
          {recurTodo.length > 0 && <button type="button" disabled={busy} onClick={applyRecurring} className="rounded-2xl border border-[#C9D6EE] bg-[#EEF3FC] px-4 py-3 text-left"><b className="text-[14px] text-[#0F1A30]">↻ 이번 달 고정비 {recurTodo.length}건 반영</b><div className="text-[12px] text-[#5B6B85]">{recurTodo.slice(0, 3).map((r) => r.name).join(" · ")}{recurTodo.length > 3 ? " …" : ""}</div></button>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <div className="space-y-4 min-w-0">
        {/* ⭐ 2026-10-31 장부형 — 일별 현금 흐름 그래프 + 줄 친 장부(일자·구분·계정·적요·수입·지출·누계 잔액) */}
        <BookCard en="DAILY CASH FLOW" title={`${ym.replace("-", "년 ")}월 일별 수입 · 지출 · 누계`}>
          <div className="h-[200px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#EEF2F8" vertical={false} />
                <XAxis dataKey="d" tick={{ fill: "#9AA9C3", fontSize: 10.5, fontFamily: MONO }} axisLine={false} tickLine={false} interval={2} />
                <YAxis tickFormatter={(v) => (Math.abs(v) >= 1e4 ? `${Math.round(v / 1e4)}만` : v)} tick={{ fill: "#9AA9C3", fontSize: 10.5, fontFamily: MONO }} axisLine={false} tickLine={false} width={44} />
                <Tooltip formatter={(v, n) => [`${won(v)}원`, n]} labelFormatter={(l) => `${ym.slice(5)}월 ${l}일`} contentStyle={{ borderRadius: 12, border: "1px solid #E3E8F0", fontSize: 12 }} />
                <Bar dataKey="in" name="수입" fill="#4B6CB7" radius={[4, 4, 0, 0]} maxBarSize={14} />
                <Bar dataKey="out" name="지출" fill="#0F1A30" radius={[4, 4, 0, 0]} maxBarSize={14} />
                <Line dataKey="cum" name="누계 차액" stroke="#B88A2E" strokeWidth={2} dot={false} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </BookCard>
        <BookCard flush>
          <div className="px-3.5 md:px-4 py-3 border-b border-[#EEF1F6] flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7] mr-1" style={{ fontFamily: MONO }}>LEDGER</span>
            {["전체", "지출", "수입"].map((t) => <Chip key={t} on={type === t} onClick={() => setType(t)}>{t}</Chip>)}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="적요·거래처·계정 검색" className="order-last md:order-none w-full md:w-auto md:ml-auto md:min-w-[150px] h-9 px-3 rounded-xl border border-[#DCE3EE] bg-[#F8FAFD] text-[13.5px] outline-none focus:border-[#2D4C82]" />
            {!isViewer && <button type="button" onClick={() => setEdit(blankEntry("지출"))} className="ml-auto md:ml-0 h-9 px-3.5 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black whitespace-nowrap shrink-0">+ 지출</button>}
            {!isViewer && <button type="button" onClick={() => setEdit(blankEntry("수입"))} className="h-9 px-3.5 rounded-xl border border-[#0F1A30] text-[#0F1A30] text-[13px] font-black whitespace-nowrap shrink-0">+ 수입</button>}
          </div>
          {rows === null ? <div className="py-16 text-center text-[13px] font-bold text-[#9AA9C3]">불러오는 중…</div>
            : !ledgerRows.length ? <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">이 달 내역이 없습니다</div> : (
            <>
              {/* PC — 줄 친 장부 */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[13px] border-collapse" style={{ minWidth: 820 }}>
                  <thead>
                    <tr className="bg-[#0F1A30] text-white">
                      {[["일자", 70], ["구분", 54], ["계정과목", 120], ["적요 · 거래처", null], ["수입", 116], ["지출", 116], ["누계 잔액", 124], ["증빙", 64]].map(([h, w]) => <th key={h} className="px-3 py-2.5 text-[12px] font-black text-left whitespace-nowrap" style={w ? { width: w } : undefined}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.map((r, i) => {
                      const newDay = i === 0 || ledgerRows[i - 1].date !== r.date;
                      return (
                        <tr key={r.id} onClick={() => !isViewer && setEdit({ ...blankEntry(r.type), ...r, amount: String(r.amount || "") })} className={`cursor-pointer hover:bg-[#F2F6FD] ${newDay && i ? "border-t-2 border-[#DCE3EE]" : "border-t border-[#EEF2F8]"} ${i % 2 ? "bg-[#FBFCFE]" : "bg-white"}`}>
                          <td className="px-3 py-2 font-black text-[#1B2B4B] tabular-nums" style={{ fontFamily: MONO }}>{newDay ? String(r.date).slice(5).replace("-", ".") : ""}</td>
                          <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded-md text-[11px] font-black ${r.type === "수입" ? "bg-[#EEF3FC] text-[#2D4C82]" : "bg-[#0F1A30] text-white"}`}>{r.type}</span></td>
                          <td className="px-3 py-2 font-bold text-[#3A4A66] truncate max-w-[120px]">{r.account}</td>
                          <td className="px-3 py-2 min-w-0">{(r.auto || r.recurId || r.sourceId) && <span title={r.memo || "다른 화면에서 자동 반영"} className="mr-1.5 px-1.5 py-0.5 rounded-md bg-[#F3E7CC] text-[#6B5320] text-[10.5px] font-black">자동</span>}<span className="font-black text-[#0F1A30]">{r.item || "-"}</span>{r.auto === "drvpay" && r.count ? <span className="ml-1 text-[11px] text-[#7A879C]">({r.count}건)</span> : null}{r.vendor && <span className="text-[#7A879C]"> · {r.vendor}</span>}{r.method && <span className="ml-1 text-[11px] text-[#9AA9C3]">{r.method}</span>}{F.byId[r.fundId] && <span className="ml-1.5 px-1.5 py-0.5 rounded-md bg-[#EEF3FC] text-[#2D4C82] text-[11px] font-black whitespace-nowrap">{isCard(F.byId[r.fundId]) ? "▭" : "▣"} {F.byId[r.fundId].name}</span>}</td>
                          <td className="px-3 py-2 text-right font-black tabular-nums text-[#2D4C82]" style={{ fontFamily: MONO }}>{r.type === "수입" ? won(r.amount) : ""}</td>
                          <td className="px-3 py-2 text-right font-black tabular-nums text-[#0F1A30]" style={{ fontFamily: MONO }}>{r.type === "지출" ? won(r.amount) : ""}</td>
                          <td className={`px-3 py-2 text-right font-black tabular-nums ${r.bal < 0 ? "text-[#B42318]" : "text-[#1B2B4B]"}`} style={{ fontFamily: MONO }}>{r.bal < 0 ? "−" : ""}{won(Math.abs(r.bal))}</td>
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>{r.receipt ? <button type="button" onClick={() => setPhoto(r)} title="증빙 보기·저장" className="w-8 h-8 rounded-lg border border-[#DCE3EE] bg-cover bg-center" style={{ backgroundImage: `url(${r.receipt})` }} /> : r.evidence ? <span className="text-[11px] font-bold text-[#7A879C]">{r.evidence}</span> : r.type === "지출" ? <span className="text-[11px] font-black text-[#B42318]">없음</span> : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-[3px] border-double border-[#0F1A30] bg-[#F5F8FD]">
                      <td colSpan={4} className="px-3 py-2.5 font-black text-[#0F1A30]">이 달 합계 · {ledgerRows.length}건</td>
                      <td className="px-3 py-2.5 text-right font-black tabular-nums text-[#2D4C82]" style={{ fontFamily: MONO }}>{won(ledgerRows.filter((r) => r.type === "수입").reduce((s2, r) => s2 + toInt(r.amount), 0))}</td>
                      <td className="px-3 py-2.5 text-right font-black tabular-nums" style={{ fontFamily: MONO }}>{won(ledgerRows.filter((r) => r.type === "지출").reduce((s2, r) => s2 + toInt(r.amount), 0))}</td>
                      <td colSpan={2} className="px-3 py-2.5 font-black tabular-nums" style={{ fontFamily: MONO }}>{(() => { const v = ledgerRows.length ? ledgerRows[ledgerRows.length - 1].bal : 0; return `${v < 0 ? "−" : "+"}${won(Math.abs(v))}`; })()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {/* 휴대폰 — 장부 줄 카드 */}
              <div className="md:hidden divide-y divide-[#EEF2F8]">
                {ledgerRows.map((r) => (
                  <button key={r.id} type="button" onClick={() => !isViewer && setEdit({ ...blankEntry(r.type), ...r, amount: String(r.amount || "") })} className="w-full text-left px-3.5 py-2.5 flex items-center gap-2.5">
                    <span className="w-11 text-center shrink-0"><span className="block text-[13px] font-black text-[#1B2B4B] tabular-nums" style={{ fontFamily: MONO }}>{String(r.date).slice(8)}</span><span className={`block text-[10px] font-black ${r.type === "수입" ? "text-[#2D4C82]" : "text-[#7A879C]"}`}>{r.type}</span></span>
                    <span className="flex-1 min-w-0"><span className="block text-[14px] font-black text-[#0F1A30] truncate">{r.item || r.vendor || r.account}</span><span className="block text-[11.5px] text-[#7A879C] truncate">{r.account}{r.vendor ? ` · ${r.vendor}` : ""}{F.byId[r.fundId] ? ` · ${F.byId[r.fundId].name}` : ""}</span></span>
                    {r.receipt && <span onClick={(e) => { e.stopPropagation(); setPhoto(r); }} className="w-8 h-8 rounded-lg border border-[#DCE3EE] bg-cover bg-center shrink-0" style={{ backgroundImage: `url(${r.receipt})` }} />}
                    <span className="text-right shrink-0"><span className={`block text-[14px] font-black tabular-nums ${r.type === "수입" ? "text-[#2D4C82]" : "text-[#0F1A30]"}`} style={{ fontFamily: MONO }}>{r.type === "수입" ? "+" : "−"}{won(r.amount)}</span><span className="block text-[10.5px] text-[#9AA9C3] tabular-nums" style={{ fontFamily: MONO }}>잔 {won(r.bal)}</span></span>
                  </button>
                ))}
              </div>
            </>
          )}
        </BookCard>
        </div>
        <div className="space-y-4">
          <BookCard en="BREAKDOWN" title="계정과목별 지출">
            {!accTop.length ? <div className="py-4 text-[12.5px] text-[#9AA9C3] font-bold">지출 내역이 없습니다</div> : accTop.map(([k, v]) => (
              <div key={k} className="py-1.5">
                <div className="flex justify-between text-[12.5px]"><span className="font-bold text-[#3A4A66] truncate">{k}</span><span className="font-black tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{won(v)}</span></div>
                <div className="mt-1 h-2 rounded-full bg-[#EEF2F8] overflow-hidden"><span className="block h-full bg-gradient-to-r from-[#1B2B4B] to-[#4B6CB7]" style={{ width: `${(v / Math.max(1, accTop[0][1])) * 100}%` }} /></div>
              </div>
            ))}
          </BookCard>
          <BookCard en="RECURRING" title="고정비" right={!isViewer && <button type="button" onClick={() => setRecurOpen(true)} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#1B2B4B] whitespace-nowrap">관리</button>}>
            {!(recurring || []).length ? <div className="py-2 text-[12.5px] text-[#9AA9C3] font-bold">임대료·통신비·보험료처럼 매달 나가는 돈을 등록해 두면 한 번에 장부에 넣을 수 있습니다</div>
              : (recurring || []).map((r) => (
                <div key={r.id} className="flex items-center justify-between py-1.5 text-[12.5px] border-b border-[#F1F4F9] last:border-b-0">
                  <span className="min-w-0 truncate"><b className="text-[#0F1A30]">{r.name}</b> <span className="text-[#9AA9C3]">매달 {r.day}일</span></span>
                  <span className="font-black tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{won(r.amount)}{recurDone.has(r.id) ? " ✓" : ""}</span>
                </div>
              ))}
          </BookCard>
          <button type="button" onClick={csv} className="w-full h-11 rounded-2xl border border-[#DCE3EE] bg-white text-[13.5px] font-black text-[#1B2B4B]">이 달 장부 엑셀(CSV) 내려받기</button>
        </div>
      </div>

      {/* ⭐ 2026-10-31 회사 총 자금 — 자금 현황과 같은 계산(장부에서 고른 통장·카드 입출금 반영) */}
      {fundOpts.length > 0 && (
        <div className="rounded-[22px] overflow-hidden text-white shadow-[0_14px_32px_rgba(15,26,48,0.22)]" style={{ background: HERO_BG }}>
          <div className="px-4 md:px-6 py-4 flex items-end justify-between gap-3 flex-wrap border-b border-white/10">
            <div>
              <div className="text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>COMPANY FUNDS · 회사 총 자금</div>
              <div className="text-[28px] md:text-[34px] font-black tabular-nums leading-tight" style={{ fontFamily: MONO }}>{won(F.cash)}<span className="text-[16px] text-white/60 ml-1">원</span></div>
              <div className="text-[12.5px] text-white/55">통장·현금 잔액 합계 · 장부에서 고른 통장·카드 입출금이 바로 반영됩니다</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="rounded-2xl bg-white/[0.07] border border-white/10 px-3.5 py-2"><div className="text-[11.5px] font-bold text-white/55">이번 달 카드 사용</div><div className="text-[17px] font-black tabular-nums" style={{ fontFamily: MONO }}>{won(F.cardMonth)}원</div></div>
              {F.loan > 0 && <div className="rounded-2xl bg-white/[0.07] border border-white/10 px-3.5 py-2"><div className="text-[11.5px] font-bold text-white/55">대출 잔액</div><div className="text-[17px] font-black tabular-nums text-[#FCA5A5]" style={{ fontFamily: MONO }}>−{won(F.loan)}원</div></div>}
            </div>
          </div>
          <div className="px-3 md:px-5 py-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            {fundOpts.map((f) => (
              <div key={f.id} className="rounded-2xl bg-white/[0.06] border border-white/10 px-3 py-2.5 flex items-center gap-2.5 min-w-0">
                <span className="w-9 h-9 rounded-xl grid place-items-center text-[10px] font-black shrink-0" style={{ background: isCard(f) ? "linear-gradient(135deg,#B88A2E,#E2C077)" : "rgba(255,255,255,0.12)" }}>{fundBadge(f)}</span>
                <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-black truncate">{f.name}</span><span className="block text-[11px] text-white/50 truncate">{isCredit(f) ? `남은 한도 · 이번 달 ${won(f.usedMonth || 0)} 사용` : f.linkName ? `${f.linkName} 연결` : [f.bank, last4(f)].filter(Boolean).join(" ") || f.kind}</span></span>
                <span className={`text-[15px] font-black tabular-nums shrink-0 ${f.balance < 0 ? "text-[#FCA5A5]" : ""}`} style={{ fontFamily: MONO }}>{f.balance < 0 ? "−" : ""}{won(Math.abs(f.balance))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {edit && (
        <Sheet side en={`CASH BOOK · ${edit.id ? "EDIT" : "NEW"}`} title={`${edit.type} ${edit.id ? "수정" : "등록"}`} onClose={() => { setEdit(null); setCustomAcc(false); }}
          footer={<>{edit.id && <button type="button" onClick={() => remove(edit)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#B42318]">삭제</button>}<button type="button" onClick={() => setEdit(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">취소</button><button type="button" disabled={busy} onClick={save} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50">{busy ? "저장 중…" : "저장"}</button></>}>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white border border-[#E3E8F0]">
            {["지출", "수입"].map((t) => <button key={t} type="button" onClick={() => setEdit((p) => ({ ...p, type: t, account: LEDGER_ACCOUNTS[t][0] }))} className={`h-10 rounded-lg text-[14px] font-black ${edit.type === t ? "bg-[#0F1A30] text-white" : "text-[#5B6B85]"}`}>{t}</button>)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>날짜</Label><CustomDatePicker value={edit.date} onChange={(e) => setEdit((p) => ({ ...p, date: e.target.value }))} className={inp} showIcon /></div>
            <div><Label>금액(원)</Label><input inputMode="numeric" value={edit.amount ? won(edit.amount) : ""} onChange={(e) => setEdit((p) => ({ ...p, amount: e.target.value.replace(/[^\d]/g, "") }))} className={`${inp} text-right tabular-nums`} style={{ fontFamily: MONO }} placeholder="0" /></div>
          </div>
          <div><Label>계정과목</Label>
            {(() => {
              // 기본 계정 + 이 회사가 직접 입력해 쓴 계정
              const base = LEDGER_ACCOUNTS[edit.type];
              const used = [...new Set((rows || []).filter((r) => r.type === edit.type).map((r) => r.account).filter((a) => a && !base.includes(a)))];
              const all = [...base, ...used];
              const isCustom = customAcc || (edit.account && !all.includes(edit.account));
              return (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {all.map((a) => <Chip key={a} on={!isCustom && edit.account === a} onClick={() => { setCustomAcc(false); setEdit((p) => ({ ...p, account: a })); }}>{a}</Chip>)}
                    <Chip on={isCustom} onClick={() => { setCustomAcc(true); setEdit((p) => ({ ...p, account: "" })); }}>✎ 직접입력</Chip>
                  </div>
                  {isCustom && <input autoFocus value={edit.account} onChange={(e) => setEdit((p) => ({ ...p, account: e.target.value }))} className={`${inp} mt-2`} placeholder="계정과목을 직접 입력 (예: 차량리스료, 협회비)" />}
                </>
              );
            })()}
          </div>
          <div><Label>통장 · 카드 · 현금 <span className="font-semibold text-[#9AA9C3]">(고르면 자금 현황 잔액이 그만큼 {edit.type === "지출" ? "줄어듭니다" : "늘어납니다"})</span></Label>
            {fundOpts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#C9D2E0] bg-white px-3 py-3 text-[12.5px] font-bold text-[#7A879C]">등록된 통장·카드가 없습니다 — 자금관리 › 자금 현황에서 먼저 등록해 주세요</div>
            ) : (
              <CustomSelect value={edit.fundId || ""} onChange={(e) => { const id = e.target.value; const f = F.byId[id]; setEdit((p) => ({ ...p, fundId: id, method: !f ? p.method : f.kind === "현금" ? "현금" : isCard(f) ? (f.kind === "법인카드" ? "법인카드" : "개인카드(정산)") : (["법인카드", "개인카드(정산)", "현금"].includes(p.method) ? "계좌이체" : p.method) })); }} className={inp}>
                <option value="">지정 안 함 (잔액에 반영하지 않음)</option>
                {fundOpts.map((f) => <option key={f.id} value={f.id}>{`${f.name} · ${f.kind}${f.bank ? ` ${f.bank}` : ""}${last4(f) ? ` ${last4(f)}` : ""} — ${isCredit(f) ? "남은 한도" : "잔액"} ${won(f.balance)}원`}</option>)}
              </CustomSelect>
            )}
            {(() => {
              const f = F.byId[edit.fundId];
              if (!f) return null;
              const orig = edit.id ? (rows || []).find((r) => r.id === edit.id) : null;
              const origEff = orig && orig.fundId === f.id ? (orig.type === "수입" ? 1 : -1) * toInt(orig.amount) : 0;
              const now = f.balance - origEff;
              const next = now + (edit.type === "수입" ? 1 : -1) * toInt(edit.amount);
              return (
                <div className="mt-2 rounded-xl px-3.5 py-3 text-white flex items-center gap-3" style={{ background: HERO_BG }}>
                  <span className="w-9 h-9 rounded-xl grid place-items-center text-[10px] font-black shrink-0" style={{ background: isCard(f) ? "linear-gradient(135deg,#B88A2E,#E2C077)" : "rgba(255,255,255,0.12)" }}>{fundBadge(f)}</span>
                  <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-black truncate">{f.name}{f.linkName ? ` → ${f.linkName}` : ""}</span><span className="block text-[11.5px] text-white/55">{isCredit(f) ? "이번 달 남은 한도" : "잔액"} · 저장하면</span></span>
                  <span className="text-right shrink-0 tabular-nums" style={{ fontFamily: MONO }}><span className="block text-[12px] text-white/55 line-through">{won(now)}</span><span className={`block text-[17px] font-black ${next < 0 ? "text-[#FCA5A5]" : ""}`}>{next < 0 ? "−" : ""}{won(Math.abs(next))}원</span></span>
                </div>
              );
            })()}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div><Label>내용</Label><input value={edit.item} onChange={(e) => setEdit((p) => ({ ...p, item: e.target.value }))} className={inp} placeholder="예: 복합기 토너, 사무실 생수" /></div>
            <div><Label>거래처(사용처)</Label><input value={edit.vendor} onChange={(e) => setEdit((p) => ({ ...p, vendor: e.target.value }))} className={inp} placeholder="예: ○○문구" /></div>
          </div>
          <div><Label>결제수단</Label><div className="flex flex-wrap gap-1.5">{METHODS.map((m) => <Chip key={m} on={edit.method === m} onClick={() => setEdit((p) => ({ ...p, method: m }))}>{m}</Chip>)}</div></div>
          <div><Label>증빙</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">{["세금계산서", "카드전표", "현금영수증", "간이영수증", "증빙 없음"].map((m) => <Chip key={m} on={edit.evidence === m} onClick={() => setEdit((p) => ({ ...p, evidence: m }))}>{m}</Chip>)}</div>
            {edit.receipt ? (
              <div className="relative rounded-xl overflow-hidden border border-[#E3E8F0] bg-white"><img src={edit.receipt} alt="" className="w-full max-h-72 object-contain" /><div className="absolute top-2 right-2 flex gap-1.5"><button type="button" onClick={() => saveImage(edit.receipt, `증빙_${edit.date}_${edit.item || edit.vendor || edit.account}`)} className="h-8 px-3 rounded-lg bg-white/90 text-[#0F1A30] text-[12px] font-black border border-[#DCE3EE]">⬇ 사진 저장</button><button type="button" onClick={() => setEdit((p) => ({ ...p, receipt: "" }))} className="h-8 px-3 rounded-lg bg-[#0F1A30]/80 text-white text-[12px] font-bold">사진 빼기</button></div></div>
            ) : <button type="button" onClick={() => fileRef.current?.click()} className="w-full h-16 rounded-xl border-2 border-dashed border-[#C9D2E0] bg-white text-[13px] font-bold text-[#5B6B85]">▤ 영수증 사진 찍기·올리기</button>}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { const r = await compressImage(f, 1400, 0.8).catch(() => ""); setEdit((p) => ({ ...p, receipt: r })); } }} />
          </div>
          <div><Label>메모</Label><input value={edit.memo} onChange={(e) => setEdit((p) => ({ ...p, memo: e.target.value }))} className={inp} placeholder="선택" /></div>
        </Sheet>
      )}
      {photo && (
        <div className="fixed inset-0 z-[100001] bg-[#0B1428]/85 flex flex-col items-center justify-center p-4" onClick={() => setPhoto(null)}>
          <img src={photo.receipt} alt="" className="max-w-full max-h-[78vh] rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => saveImage(photo.receipt, `증빙_${photo.date}_${photo.item || photo.vendor || photo.account}`)} className="h-11 px-5 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black">⬇ 사진 저장</button>
            <button type="button" onClick={() => setPhoto(null)} className="h-11 px-5 rounded-xl bg-white/15 text-white text-[14px] font-bold">닫기</button>
          </div>
        </div>
      )}
      {recurOpen && <RecurringEditor company={company} rows={recurring || []} ledger={rows || []} funds={fundOpts} onClose={() => setRecurOpen(false)} />}
    </div>
  );
}

function RecurringEditor({ company, rows, ledger = [], funds = [], onClose }) {
  const [f, setF] = React.useState({ type: "지출", name: "", account: "임차료", amount: "", day: "25", method: "자동이체", vendor: "", fundId: "" });
  const [custom, setCustom] = React.useState(false);
  const accs = [...new Set([...LEDGER_ACCOUNTS[f.type], ...ledger.filter((r) => r.type === f.type).map((r) => r.account).filter(Boolean)])];
  const add = async () => {
    if (!f.name.trim() || !toInt(f.amount)) return alert("이름과 금액을 입력해 주세요.");
    if (!String(f.account || "").trim()) return alert("계정과목을 입력해 주세요.");
    await addDoc(collection(db, "acctRecurring"), { ...f, account: String(f.account).trim(), name: f.name.trim(), amount: toInt(f.amount), active: true, companyName: company, createdAt: serverTimestamp() });
    setF((p) => ({ ...p, name: "", amount: "", vendor: "" }));
  };
  return (
    <Sheet side en="CASH BOOK · RECURRING" title="고정비 · 정기 수입 관리" onClose={onClose} footer={<button type="button" onClick={onClose} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black">닫기</button>}>
      <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4 space-y-3">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F4F6FA] border border-[#E3E8F0]">
          {["지출", "수입"].map((t) => <button key={t} type="button" onClick={() => { setCustom(false); setF((p) => ({ ...p, type: t, account: LEDGER_ACCOUNTS[t][0] })); }} className={`h-10 rounded-lg text-[14px] font-black ${f.type === t ? "bg-[#0F1A30] text-white" : "text-[#5B6B85]"}`}>매달 {t}</button>)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>이름</Label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inp} placeholder={f.type === "지출" ? "예: 사무실 임대료" : "예: 주차장 임대수입"} /></div>
          <div><Label>금액</Label><input inputMode="numeric" value={f.amount ? won(f.amount) : ""} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d]/g, "") })} className={`${inp} text-right`} /></div>
          <div><Label>계정과목</Label>
            <select value={custom ? "__custom" : f.account} onChange={(e) => { if (e.target.value === "__custom") { setCustom(true); setF({ ...f, account: "" }); } else { setCustom(false); setF({ ...f, account: e.target.value }); } }} className={inp}>
              {accs.map((a) => <option key={a} value={a}>{a}</option>)}
              <option value="__custom">✎ 직접입력</option>
            </select>
            {custom && <input autoFocus value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} className={`${inp} mt-2`} placeholder="계정과목 직접 입력" />}
          </div>
          <div><Label>매달 (일)</Label><input inputMode="numeric" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value.replace(/[^\d]/g, "").slice(0, 2) })} className={inp} /></div>
          {funds.length > 0 && <div className="col-span-2"><Label>나가는(들어오는) 통장·카드 <span className="font-semibold text-[#9AA9C3]">(장부에 넣으면 자금 잔액에 반영)</span></Label>
            <CustomSelect value={f.fundId} onChange={(e) => setF({ ...f, fundId: e.target.value })} className={inp}>
              <option value="">지정 안 함</option>
              {funds.map((x) => <option key={x.id} value={x.id}>{`${x.name} · ${x.kind}${x.bank ? ` ${x.bank}` : ""}`}</option>)}
            </CustomSelect></div>}
        </div>
        <button type="button" onClick={add} className="w-full h-11 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black">+ 고정비 추가</button>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="rounded-2xl bg-white border border-[#E3E8F0] px-3 py-2.5 flex items-center gap-2">
          <div className="flex-1 min-w-0"><div className="text-[14px] font-black text-[#0F1A30] truncate">{r.name} <span className={`text-[11px] font-black ${r.type === "수입" ? "text-[#2D4C82]" : "text-[#7A879C]"}`}>{r.type || "지출"}</span></div><div className="text-[11.5px] text-[#7A879C]">{r.account} · 매달 {r.day}일 · {r.method}</div>
            {funds.length > 0 && <select value={r.fundId || ""} onChange={(e) => updateDoc(doc(db, "acctRecurring", r.id), { fundId: e.target.value })} className="mt-1 h-8 px-2 rounded-lg border border-[#DCE3EE] bg-white text-[12px] font-bold text-[#1B2B4B] max-w-full"><option value="">통장·카드 지정 안 함</option>{funds.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</div>
          <span className="text-[13.5px] font-black tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{won(r.amount)}</span>
          <button type="button" onClick={() => updateDoc(doc(db, "acctRecurring", r.id), { active: r.active === false })} className={`h-8 px-2.5 rounded-lg text-[12px] font-black whitespace-nowrap ${r.active === false ? "border border-[#DCE3EE] text-[#9AA9C3]" : "bg-[#EEF3FC] text-[#1B2B4B]"}`}>{r.active === false ? "꺼짐" : "켜짐"}</button>
          <button type="button" onClick={() => window.confirm("삭제할까요?") && deleteDoc(doc(db, "acctRecurring", r.id))} className="w-8 h-8 rounded-lg text-[#9AA9C3]">✕</button>
        </div>
      ))}
    </Sheet>
  );
}

// ═════════════════════════ 비품·자산 관리 ═════════════════════════
export const ASSET_CATS = ["사무가구", "IT기기", "사무기기", "소모품", "차량·장비", "기타"];
const ASSET_STATUS = ["사용중", "보관", "수리중", "폐기"];
const blankAsset = () => ({ name: "", category: "IT기기", qty: "1", unit: "개", minQty: "", location: "", holder: "", purchaseDate: kstDay(), price: "", vendor: "", status: "사용중", code: "", memo: "", photo: "", toLedger: true });

export function AssetManager({ company, isViewer = false }) {
  const rows = useCompanyCol("officeAssets", company);
  const [cat, setCat] = React.useState("전체");
  const [q, setQ] = React.useState("");
  const [edit, setEdit] = React.useState(null);
  const [move, setMove] = React.useState(null); // { a, kind: "in"|"out", n, memo }
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef(null);
  const L = rows || [];
  const active = L.filter((a) => a.status !== "폐기");
  const low = active.filter((a) => toInt(a.minQty) > 0 && toInt(a.qty) <= toInt(a.minQty));
  const value = active.reduce((s, a) => s + toInt(a.price) * (a.category === "소모품" ? 1 : Math.max(1, toInt(a.qty))), 0);
  const repair = active.filter((a) => a.status === "수리중");
  const kw = q.trim();
  const shown = L.filter((a) => (cat === "전체" ? a.status !== "폐기" : cat === "재고 부족" ? low.includes(a) : cat === "폐기" ? a.status === "폐기" : a.category === cat && a.status !== "폐기"))
    .filter((a) => !kw || [a.name, a.location, a.holder, a.code, a.vendor].some((v) => String(v || "").includes(kw)))
    .sort((a, b) => String(a.category).localeCompare(String(b.category), "ko") || String(a.name).localeCompare(String(b.name), "ko"));
  const save = async () => {
    const e = edit;
    if (!e.name.trim()) return alert("품목 이름을 입력해 주세요.");
    setBusy(true);
    try {
      const data = { name: e.name.trim(), category: e.category, qty: toInt(e.qty), unit: e.unit || "개", minQty: toInt(e.minQty), location: e.location.trim(), holder: e.holder.trim(), purchaseDate: e.purchaseDate || "", price: toInt(e.price), vendor: e.vendor.trim(), status: e.status, code: e.code.trim(), memo: e.memo.trim(), photo: e.photo || "", companyName: company };
      const toLedger = e.toLedger !== false;
      let id = e.id;
      if (e.id) await updateDoc(doc(db, "officeAssets", e.id), { ...data, toLedger, updatedAt: serverTimestamp() });
      else id = (await addDoc(collection(db, "officeAssets"), { ...data, toLedger, history: [{ at: Date.now(), kind: "등록", n: data.qty, by: auth.currentUser?.email || "" }], createdAt: serverTimestamp() })).id;
      // 🔗 2026-11-01 구입가 → 수입·지출 장부 "비품 구입" 지출(자금 잔액 반영). 끄면 장부에서 빠진다
      const cost = data.category === "소모품" ? data.price : data.price * Math.max(1, data.qty);
      await upsertAutoEntry(db, id, { company, date: data.purchaseDate, account: data.category === "소모품" ? "소모품비" : "비품구입", item: `비품 구입 · ${data.name}`, amount: toLedger ? cost : 0, vendor: data.vendor, memo: "비품·자산 등록 — 자동 반영", auto: "asset" }).catch(() => {});
      setEdit(null);
    } catch (err) { alert(`저장 실패: ${err.message}`); } finally { setBusy(false); }
  };
  const doMove = async () => {
    const n = toInt(move.n); if (!n) return;
    const next = Math.max(0, toInt(move.a.qty) + (move.kind === "in" ? n : -n));
    await updateDoc(doc(db, "officeAssets", move.a.id), { qty: next, history: arrayUnion({ at: Date.now(), kind: move.kind === "in" ? "입고" : "출고", n, memo: move.memo || "", by: auth.currentUser?.email || "" }) });
    setMove(null);
  };
  return (
    <div className="space-y-4">
      <BookHero en="ACCOUNTING · OFFICE ASSETS" title="비품·자산 관리" desc="사무가구·IT기기·소모품의 수량·위치·담당자·구입가를 관리하고 소모품 재고 부족을 알려줍니다"
        kpis={[["관리 품목", `${active.length}종`, `폐기 ${L.length - active.length}`], ["자산 금액", `${won(value)}원`, "구입가 기준"], ["재고 부족", `${low.length}종`, "최소 수량 이하 소모품"], ["수리중", `${repair.length}건`, ""]]} />
      <BookCard flush>
        <div className="px-3.5 md:px-4 py-3 border-b border-[#EEF1F6] flex items-center gap-2 overflow-x-auto no-scrollbar">
          {["전체", "재고 부족", ...ASSET_CATS, "폐기"].map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{c}{c === "재고 부족" && low.length ? ` ${low.length}` : ""}</Chip>)}
        </div>
        <div className="px-3.5 md:px-4 py-2.5 border-b border-[#EEF1F6] flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="품목·위치·담당자·관리번호 검색" className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-[#DCE3EE] bg-[#F8FAFD] text-[13.5px] outline-none focus:border-[#2D4C82]" />
          {!isViewer && <button type="button" onClick={() => setEdit(blankAsset())} className="h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black whitespace-nowrap">+ 비품 등록</button>}
        </div>
        {rows === null ? <div className="py-16 text-center text-[13px] font-bold text-[#9AA9C3]">불러오는 중…</div>
          : !shown.length ? <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">등록된 비품이 없습니다</div> : (
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {shown.map((a) => {
              const isLow = low.includes(a);
              return (
                <div key={a.id} className={`rounded-2xl border p-3 flex gap-3 ${isLow ? "border-[#F5C2C2] bg-[#FFF8F8]" : "border-[#E3E8F0] bg-white"}`}>
                  <button type="button" onClick={() => !isViewer && setEdit({ ...blankAsset(), ...a, toLedger: a.toLedger === true, qty: String(a.qty ?? ""), minQty: String(a.minQty || ""), price: String(a.price || "") })}
                    className="w-14 h-14 rounded-xl shrink-0 grid place-items-center text-white text-[11px] font-black bg-cover bg-center" style={a.photo ? { backgroundImage: `url(${a.photo})` } : { background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}>{a.photo ? "" : String(a.category || "").slice(0, 2)}</button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5"><span className="text-[14px] font-black text-[#0F1A30] truncate">{a.name}</span>{a.code && <span className="text-[10.5px] font-bold text-[#9AA9C3] whitespace-nowrap" style={{ fontFamily: MONO }}>{a.code}</span>}</div>
                    <div className="text-[11.5px] text-[#7A879C] truncate">{[a.category, a.location, a.holder && `담당 ${a.holder}`].filter(Boolean).join(" · ")}</div>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span className={`h-6 px-2 rounded-md text-[11.5px] font-black grid place-items-center tabular-nums whitespace-nowrap ${isLow ? "bg-[#B42318] text-white" : "bg-[#0F1A30] text-white"}`} style={{ fontFamily: MONO }}>{won(a.qty)}{a.unit || "개"}</span>
                      {a.status !== "사용중" && <span className="h-6 px-2 rounded-md bg-[#EEF3FC] text-[#2D4C82] text-[11px] font-black grid place-items-center whitespace-nowrap">{a.status}</span>}
                      {isLow && <span className="text-[11px] font-black text-[#B42318] whitespace-nowrap">재고 부족(최소 {a.minQty})</span>}
                      {!isViewer && a.status !== "폐기" && <>
                        <button type="button" onClick={() => setMove({ a, kind: "in", n: "1", memo: "" })} className="ml-auto h-7 px-2.5 rounded-lg border border-[#DCE3EE] text-[11.5px] font-black text-[#1B2B4B] whitespace-nowrap">입고</button>
                        <button type="button" onClick={() => setMove({ a, kind: "out", n: "1", memo: "" })} className="h-7 px-2.5 rounded-lg border border-[#DCE3EE] text-[11.5px] font-black text-[#1B2B4B] whitespace-nowrap">출고</button>
                      </>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </BookCard>

      {edit && (
        <Sheet side en={`ASSET · ${edit.id ? "EDIT" : "NEW"}`} title={edit.id ? "비품 수정" : "비품 등록"} onClose={() => setEdit(null)}
          footer={<>{edit.id && <button type="button" onClick={async () => { if (window.confirm("삭제할까요? (폐기 처리는 상태를 '폐기'로)")) { await deleteDoc(doc(db, "officeAssets", edit.id)); /* ⭐ 2026-11-02 점검 — 비품 삭제 시 '비품 구입' 자동 지출 줄도 함께 삭제(amount 0 → 줄 제거) */ await upsertAutoEntry(db, edit.id, { company, amount: 0, auto: "asset" }).catch(() => {}); setEdit(null); } }} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#B42318]">삭제</button>}<button type="button" onClick={() => setEdit(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">취소</button><button type="button" disabled={busy} onClick={save} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50">{busy ? "저장 중…" : "저장"}</button></>}>
          <div><Label>분류</Label><div className="flex flex-wrap gap-1.5">{ASSET_CATS.map((c) => <Chip key={c} on={edit.category === c} onClick={() => setEdit((p) => ({ ...p, category: c, unit: c === "소모품" ? (p.unit === "개" ? "개" : p.unit) : p.unit }))}>{c}</Chip>)}</div></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div><Label>품목 이름</Label><input value={edit.name} onChange={(e) => setEdit((p) => ({ ...p, name: e.target.value }))} className={inp} placeholder="예: 노트북, A4용지, 복합기" /></div>
            <div><Label>관리번호(선택)</Label><input value={edit.code} onChange={(e) => setEdit((p) => ({ ...p, code: e.target.value }))} className={inp} placeholder="예: IT-001" /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>수량</Label><input inputMode="numeric" value={edit.qty} onChange={(e) => setEdit((p) => ({ ...p, qty: e.target.value.replace(/[^\d]/g, "") }))} className={`${inp} text-right`} /></div>
            <div><Label>단위</Label><input value={edit.unit} onChange={(e) => setEdit((p) => ({ ...p, unit: e.target.value }))} className={inp} placeholder="개·박스·대" /></div>
            <div><Label>최소 수량</Label><input inputMode="numeric" value={edit.minQty} onChange={(e) => setEdit((p) => ({ ...p, minQty: e.target.value.replace(/[^\d]/g, "") }))} className={`${inp} text-right`} placeholder="소모품" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>위치</Label><input value={edit.location} onChange={(e) => setEdit((p) => ({ ...p, location: e.target.value }))} className={inp} placeholder="예: 2층 사무실" /></div>
            <div><Label>담당·사용자</Label><input value={edit.holder} onChange={(e) => setEdit((p) => ({ ...p, holder: e.target.value }))} className={inp} placeholder="예: 홍길동" /></div>
            <div><Label>구입일</Label><CustomDatePicker value={edit.purchaseDate} onChange={(e) => setEdit((p) => ({ ...p, purchaseDate: e.target.value }))} className={inp} showIcon /></div>
            <div><Label>구입가(원)</Label><input inputMode="numeric" value={edit.price ? won(edit.price) : ""} onChange={(e) => setEdit((p) => ({ ...p, price: e.target.value.replace(/[^\d]/g, "") }))} className={`${inp} text-right`} /></div>
            <label className="col-span-2 flex items-center gap-2 text-[13px] font-bold text-[#1B2B4B]"><input type="checkbox" checked={edit.toLedger !== false} onChange={(e) => setEdit((p) => ({ ...p, toLedger: e.target.checked }))} />구입가를 수입·지출 장부에 지출로 기록(자금 잔액 반영){edit.category !== "소모품" && toInt(edit.qty) > 1 ? ` — 구입가 × ${toInt(edit.qty)}개` : ""}</label>
          </div>
          <div><Label>상태</Label><div className="flex flex-wrap gap-1.5">{ASSET_STATUS.map((c) => <Chip key={c} on={edit.status === c} onClick={() => setEdit((p) => ({ ...p, status: c }))}>{c}</Chip>)}</div></div>
          <div><Label>구입처 · 메모</Label><input value={edit.vendor} onChange={(e) => setEdit((p) => ({ ...p, vendor: e.target.value }))} className={`${inp} mb-2`} placeholder="구입처" /><input value={edit.memo} onChange={(e) => setEdit((p) => ({ ...p, memo: e.target.value }))} className={inp} placeholder="메모(보증기간·시리얼 등)" /></div>
          <div><Label>사진</Label>
            {edit.photo ? <div className="relative rounded-xl overflow-hidden border border-[#E3E8F0] bg-white"><img src={edit.photo} alt="" className="w-full max-h-48 object-contain" /><button type="button" onClick={() => setEdit((p) => ({ ...p, photo: "" }))} className="absolute top-2 right-2 h-8 px-3 rounded-lg bg-[#0F1A30]/80 text-white text-[12px] font-bold">빼기</button></div>
              : <button type="button" onClick={() => fileRef.current?.click()} className="w-full h-14 rounded-xl border-2 border-dashed border-[#C9D2E0] bg-white text-[13px] font-bold text-[#5B6B85]">◎ 사진 올리기(선택)</button>}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { const r = await compressImage(f, 1000, 0.75).catch(() => ""); setEdit((p) => ({ ...p, photo: r })); } }} />
          </div>
          {edit.id && (edit.history || []).length > 0 && (
            <div className="rounded-2xl bg-white border border-[#E3E8F0] p-3"><Label>입출고 이력</Label>
              {[...(edit.history || [])].reverse().slice(0, 12).map((h, i) => <div key={i} className="flex justify-between text-[12px] py-1 border-b border-[#F1F4F9] last:border-b-0"><span className="text-[#3A4A66] truncate">{new Date(h.at).toLocaleDateString("ko-KR")} · {h.kind}{h.memo ? ` · ${h.memo}` : ""}</span><span className="font-black tabular-nums whitespace-nowrap">{h.kind === "출고" ? "−" : "+"}{h.n}</span></div>)}
            </div>
          )}
        </Sheet>
      )}
      {move && (
        <Sheet en={`ASSET · ${move.kind === "in" ? "STOCK IN" : "STOCK OUT"}`} title={`${move.a.name} ${move.kind === "in" ? "입고" : "출고"}`} onClose={() => setMove(null)}
          footer={<><button type="button" onClick={() => setMove(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">취소</button><button type="button" onClick={doMove} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black">{move.kind === "in" ? "입고" : "출고"} 처리</button></>}>
          <div className="text-[13px] text-[#5B6B85]">지금 {won(move.a.qty)}{move.a.unit || "개"} → {won(Math.max(0, toInt(move.a.qty) + (move.kind === "in" ? 1 : -1) * toInt(move.n)))}{move.a.unit || "개"}</div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>수량</Label><input inputMode="numeric" value={move.n} onChange={(e) => setMove((p) => ({ ...p, n: e.target.value.replace(/[^\d]/g, "") }))} className={`${inp} text-right`} /></div>
            <div><Label>메모</Label><input value={move.memo} onChange={(e) => setMove((p) => ({ ...p, memo: e.target.value }))} className={inp} placeholder={move.kind === "in" ? "예: ○○문구 구입" : "예: 영업팀 지급"} /></div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
