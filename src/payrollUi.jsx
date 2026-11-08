// ======================= src/payrollUi.jsx =======================
// ⭐ 2026-11-07 급여 화면 공용 조각(Payroll.jsx · PayrollReports.jsx) — 입력칸 · 드롭다운 · 금액칸 · 구독 훅 · 날짜 도우미
import React from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { MONO } from "./OfficeBooks";
import { wonFmt } from "./payrollCalc";

export const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
export const kstYm = () => kstDay().slice(0, 7);
export const shiftYm = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
export const lastDayOf = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
export const safeId = (s) => String(s || "").replace(/[/\s#?[\]]/g, "_").slice(0, 80);
export const slipId = (co, ym, uid) => `${safeId(co)}_${ym}_${uid}`;
export const runId = (co, ym) => `${safeId(co)}_${ym}`;
export const empId = (co, uid) => `${safeId(co)}__${uid}`;
export const toNum = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };
export const ymLabel = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;
export const blank = (v) => v === undefined || v === null || v === "";
export const uniq = (a) => a.filter((x, i) => x && a.indexOf(x) === i);

// 글자 14px 이상 · 숫자는 굵게 + 자리 맞춤(tabular-nums)
export const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[15px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#8FB0F0]/40 disabled:bg-[#F5F7FB] disabled:text-[#7A879C]";
export const numInp = `${inp} text-right tabular-nums font-black`;
export const NUMS = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };
export const sec = "rounded-[20px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_rgba(16,24,40,0.05)]";
export const btn = "h-11 px-4 rounded-xl text-[14px] font-black disabled:opacity-40 whitespace-nowrap";
export const btnLine = `${btn} border border-[#DCE3EE] bg-white text-[#1B2B4B] hover:border-[#2D4C82]`;
export const btnDark = `${btn} bg-[#0F1A30] text-white hover:bg-[#1B2B4B]`;
export const Label = ({ children, hint }) => <div className="mb-1.5 flex items-baseline gap-1.5 min-w-0"><span className="text-[14px] font-black text-[#3A4A66] whitespace-nowrap shrink-0">{children}</span>{hint && <span className="text-[14px] font-bold text-[#7A879C] truncate min-w-0" title={typeof hint === "string" ? hint : undefined}>{hint}</span>}</div>;
// 안내 상자 — info(네이비/회색) · error(빨강, 오류만)
export const Note = ({ kind = "info", children }) => (
  <div className={`rounded-xl px-3.5 py-2.5 text-[14px] font-bold leading-relaxed border ${kind === "error" ? "bg-[#FEF3F2] border-[#FECDCA] text-[#B42318]" : "bg-[#F5F8FD] border-[#DCE3EE] text-[#1B2B4B]"}`}>{children}</div>
);
// 칸 제목(영문 작은 글씨 + 제목)
export const H = ({ en, children, right }) => <div className="px-4 pt-3.5 pb-2.5 flex items-center gap-2 flex-wrap"><div className="min-w-0"><div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={NUMS}>{en}</div><div className="text-[16px] font-black text-[#0F1A30]">{children}</div></div>{right && <div className="ml-auto flex items-center gap-1.5 flex-wrap">{right}</div>}</div>;

// 기본 드롭다운(브라우저 기본 select — 키보드·모바일 선택창 그대로) · options: [값, 이름] 또는 문자열 · groups: [[머리말, options]]
export function Sel({ value, onChange, options = [], groups = null, disabled, className = "", placeholder, testid, dark = false, ariaLabel }) {
  const opt = (o) => (Array.isArray(o) ? <option key={String(o[0])} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>);
  return (
    <div className={`relative ${className}`}>
      <select aria-label={ariaLabel} data-testid={testid} disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value)}
        className={dark ? "h-11 w-full pl-3 pr-9 rounded-xl appearance-none bg-white/10 border border-white/25 text-white text-[15px] font-black outline-none focus:border-[#8FB0F0] [&>option]:text-[#0F1A30] [&>optgroup]:text-[#0F1A30]" : `${inp} appearance-none pr-9 cursor-pointer`}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {groups ? groups.filter(([, os]) => os.length).map(([g, os]) => <optgroup key={g} label={g}>{os.map(opt)}</optgroup>) : options.map(opt)}
      </select>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${dark ? "text-[#8FB0F0]" : "text-[#5B6B85]"}`}><path d="M6 9l6 6 6-6" /></svg>
    </div>
  );
}
// 금액 칸(천 단위 쉼표)
export const Money = ({ value, onChange, disabled, placeholder = "0", className = "", testid }) => (
  <input disabled={disabled} inputMode="numeric" data-testid={testid} value={toNum(value) ? wonFmt(value) : ""} onChange={(e) => onChange(toNum(e.target.value))} onFocus={(e) => e.target.select()} className={`${numInp} ${className}`} style={NUMS} placeholder={placeholder} />
);
// 둘 중 하나 고르기(작은 탭)
export function Seg({ value, onChange, options, testid, className = "" }) {
  return (
    <div className={`inline-flex p-1 rounded-xl bg-[#EEF1F6] gap-1 ${className}`} role="tablist" data-testid={testid}>
      {options.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)} className={`h-9 px-3.5 rounded-lg text-[14px] font-black whitespace-nowrap ${value === k ? "bg-white text-[#0F1A30] shadow-[0_2px_6px_rgba(15,26,48,0.12)]" : "text-[#5B6B85]"}`}>{l}</button>)}
    </div>
  );
}
// Enter = 다음 칸(Tab과 같은 순서) — 한글 조합 중에는 넘기지 않는다
export function enterNext(e) {
  if (e.key !== "Enter" || e.nativeEvent?.isComposing) return;
  const t = e.target;
  if (!((t.tagName === "INPUT" && !["checkbox", "radio", "button", "file", "password"].includes(t.type)) || t.tagName === "SELECT")) return;
  const els = [...e.currentTarget.querySelectorAll("input:not([disabled]):not([type=checkbox]):not([type=hidden]):not([type=file]),select:not([disabled])")].filter((el) => el.offsetParent !== null);
  const i = els.indexOf(t);
  if (i < 0) return;
  e.preventDefault();
  const n = els[i + 1];
  if (n) { n.focus(); if (n.select) try { n.select(); } catch { /* 무시 */ } }
}
export function useMedia(q) {
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(q).matches : false);
  const [v, setV] = React.useState(get);
  React.useEffect(() => {
    if (!window.matchMedia) return undefined;
    const m = window.matchMedia(q); const h = () => setV(m.matches);
    m.addEventListener ? m.addEventListener("change", h) : m.addListener(h);
    return () => (m.removeEventListener ? m.removeEventListener("change", h) : m.removeListener(h));
  }, [q]);
  return v;
}
// ⭐ 2026-11-09 급여관리 바로 열기 — 한 번 받은 목록은 이 화면(메모리)에 기억해 두고, 다시 들어오면 먼저 보여 준 뒤 실시간으로 갱신
//  (브라우저 저장소에는 안 남김 · 새로고침/로그아웃하면 사라짐 · 권한 오류면 빈 목록으로 바뀜)
const _memo = new Map();
const MEMO_MAX = 40;
const memoSet = (k, v) => { _memo.delete(k); _memo.set(k, v); if (_memo.size > MEMO_MAX) _memo.delete(_memo.keys().next().value); };
export function useCol(name, company, extra = null, key = "") {
  const mk = `c|${name}|${company}|${extra ? `${extra[0]}=${extra[1]}` : ""}`;
  const [rows, setRows] = React.useState(() => (company && _memo.has(mk) ? _memo.get(mk) : null));
  React.useEffect(() => {
    if (!company) return undefined;
    setRows(_memo.has(mk) ? _memo.get(mk) : null);
    const cons = [where("companyName", "==", company), ...(extra ? [where(extra[0], "==", extra[1])] : [])];
    return onSnapshot(query(collection(db, name), ...cons), (s) => { const v = s.docs.map((d) => ({ id: d.id, ...d.data() })); memoSet(mk, v); setRows(v); }, () => { _memo.delete(mk); setRows([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, company, key]);
  return rows;
}
export function useDocData(path, id) {
  const mk = `d|${path}|${id}`;
  const [v, setV] = React.useState(() => (id && _memo.has(mk) ? _memo.get(mk) : undefined));
  React.useEffect(() => {
    if (!id) return undefined;
    setV(_memo.has(mk) ? _memo.get(mk) : undefined);
    return onSnapshot(doc(db, path, id), (s) => { const x = s.exists() ? { id: s.id, ...s.data() } : null; memoSet(mk, x); setV(x); }, () => { _memo.delete(mk); setV(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, id]);
  return v;
}
// 파일 내려받기(엑셀·CSV)
export async function downloadXlsx(name, sheets) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  sheets.forEach(([title, rows, widths]) => { const ws = XLSX.utils.aoa_to_sheet(rows); if (widths) ws["!cols"] = widths.map((w) => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31)); });
  XLSX.writeFile(wb, `${name}.xlsx`);
}
export function downloadCsv(name, rows) {
  const csv = rows.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\r\n");
  const b = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `${name}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
