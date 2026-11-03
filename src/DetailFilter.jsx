// ======================= src/DetailFilter.jsx =======================
// 🔎 2026-11-03 세부검색 — 최대 3차까지 "칸 고르기 + 검색어"로 좁혀 찾기 (+ 시작일~종료일)
//  · 예) 1차 배차담당자 = 하동협 → 2차 거래처명 = 원로지스 → 3차 상차지명 = 한국자동차
//  · 검색어가 그 칸의 어떤 값과 "정확히 같으면"(띄어쓰기·대소문자 무시) 그 값만, 같은 값이 없으면 "포함"으로
//    (원로 → 원로만 · 원로지스·원로지는 빠짐)
//  · 실시간배차현황은 기간 없이(withDate=false)
import React from "react";
import { createPortal } from "react-dom";
import CustomDatePicker from "./CustomDatePicker";
import { makeClientMatcher, normClient } from "./clientMatch";
import { useLoadOrderRange } from "./orderHistory";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const kst = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const MAX = 3;

// 고를 수 있는 칸(라벨 → 값 꺼내기) — getters로 덮어쓰거나 더할 수 있다
export const DETAIL_FIELDS = [
  ["청구사업자", (r) => r.청구사업자],
  ["배차담당자", (r) => r.등록자명 || r.작성자],
  ["거래처명", (r) => r.거래처명],
  ["상차지명", (r) => r.상차지명],
  ["하차지명", (r) => r.하차지명],
  ["상차지주소", (r) => r.상차지주소],
  ["하차지주소", (r) => r.하차지주소],
  ["차량번호", (r) => r.차량번호],
  ["기사명", (r) => r.이름],
  ["기사 전화번호", (r) => r.전화번호],
  ["차량톤수", (r) => r.차량톤수 || r.톤수],
  ["차량종류", (r) => r.차량종류],
  ["화물내용", (r) => r.화물내용],
  ["배차상태", (r) => r.배차상태],
  ["지급방식", (r) => r.지급방식],
  ["배차방식", (r) => r.배차방식],
  ["메모", (r) => r.메모],
];

function fieldMap(getters, hide = []) {
  const m = new Map();
  for (const [k, g] of DETAIL_FIELDS) if (!hide.includes(k)) m.set(k, g);
  for (const [k, g] of Object.entries(getters || {})) { if (g) m.set(k, g); else m.delete(k); }
  return m;
}
const valOf = (fm, f, r) => { const g = fm.get(f); return String((g ? g(r) : r?.[f]) ?? "").trim(); };
const defDateOf = (r) => String(r?.상차일 || r?.상차일자 || "").slice(0, 10);

// 조건대로 거르기 — value: { from, to, conds: [{ f, q }] } | null
export function applyDetailFilter(rows, value, { getters, dateOf = defDateOf, withDate = true, hide } = {}) {
  if (!value || !Array.isArray(rows)) return rows;
  const fm = fieldMap(getters, hide);
  let out = rows;
  if (withDate && value.from && value.to) {
    const s = value.from <= value.to ? value.from : value.to, e = value.from <= value.to ? value.to : value.from;
    out = out.filter((r) => { const d = dateOf(r); return d && d >= s && d <= e; });
  }
  for (const c of value.conds || []) {
    if (!c?.f || !normClient(c.q)) continue;
    const vals = new Set(); out.forEach((r) => vals.add(valOf(fm, c.f, r)));
    const ok = makeClientMatcher(c.q, [...vals]);
    out = out.filter((r) => ok(valOf(fm, c.f, r)));
  }
  return out;
}
export const detailActive = (v) => !!v && ((v.conds || []).some((c) => c?.f && normClient(c.q)) || !!(v.from && v.to));
export const detailSummary = (v, withDate = true) => {
  if (!v) return "";
  const p = [];
  if (withDate && v.from && v.to) p.push(v.from === v.to ? v.from.slice(5).replace("-", ".") : `${v.from.slice(5).replace("-", ".")}~${v.to.slice(5).replace("-", ".")}`);
  (v.conds || []).forEach((c) => { if (c?.f && normClient(c.q)) p.push(`${c.f} ${c.q}`); });
  return p.join(" · ");
};

function quickRanges() {
  const t = kst();
  const d = new Date(t + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  const y = +t.slice(0, 4), m = +t.slice(5, 7);
  const last = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  const ym = t.slice(0, 7), pym = `${py}-${String(pm).padStart(2, "0")}`;
  return [
    { k: "어제", s: addDays(t, -1), e: addDays(t, -1) },
    { k: "오늘", s: t, e: t },
    { k: "이번 주", s: addDays(t, -dow), e: addDays(t, 6 - dow) },
    { k: "이번 달", s: `${ym}-01`, e: `${ym}-${last(y, m)}` },
    { k: "지난달", s: `${pym}-01`, e: `${pym}-${last(py, pm)}` },
  ];
}

const Icon = ({ s = 14 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
);

// 값 칸 — 고른 칸의 값들을 아래에 보여 준다(건수 많은 순 · 입력하면 좁혀짐)
function ValueInput({ field, q, onChange, options, onEnter, inputRef }) {
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const nq = normClient(q);
  const list = React.useMemo(() => {
    const arr = nq ? options.filter((o) => normClient(o.v).includes(nq)) : options;
    return arr.slice(0, 60);
  }, [options, nq]);
  const exact = nq && options.some((o) => normClient(o.v) === nq);
  React.useEffect(() => { setHi(0); }, [nq, field]);
  return (
    <div className="relative flex-1 min-w-0">
      <input ref={inputRef} autoComplete="off" disabled={!field} value={q}
        placeholder={field ? `${field} 입력 (예: ${options[0]?.v || "검색어"})` : "← 먼저 칸을 고르세요"}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, list.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") {
            e.preventDefault();
            if (open && list[hi] && nq && !exact) { onChange(list[hi].v); setOpen(false); } else onEnter?.();
          } else if (e.key === "Escape") { if (open) { e.stopPropagation(); setOpen(false); } }
        }}
        className="w-full h-10 rounded-xl border border-[#D5DDEA] bg-white pl-3 pr-16 text-[14px] font-bold text-[#0F1A30] outline-none focus:border-[#1B2B4B] focus:ring-2 focus:ring-[#1B2B4B]/10 disabled:bg-[#F4F6FA] disabled:text-[#9AA9C3] placeholder:font-semibold placeholder:text-[#9AA9C3]" />
      {nq && (
        <span className={`absolute right-2 top-1/2 -translate-y-1/2 h-5 px-1.5 rounded-md text-[10px] font-black inline-flex items-center ${exact ? "bg-[#0F1A30] text-white" : "bg-[#EEF2F8] text-[#5B6B85]"}`} style={{ fontFamily: MONO }} title={exact ? "같은 이름만 찾습니다" : "이 글자가 들어간 것을 모두 찾습니다"}>
          {exact ? "EXACT" : "LIKE"}
        </span>
      )}
      {open && field && list.length > 0 && !exact && (
        <div className="absolute z-20 left-0 right-0 top-[calc(100%+4px)] max-h-[240px] overflow-y-auto rounded-xl bg-white border border-[#DCE3EE] shadow-[0_16px_36px_rgba(15,26,48,.18)] py-1">
          {list.map((o, i) => (
            <button key={o.v} type="button" onMouseDown={(e) => { e.preventDefault(); onChange(o.v); setOpen(false); }} onMouseEnter={() => setHi(i)}
              className={`w-full flex items-center gap-2 px-3 h-8 text-left text-[13px] font-bold ${i === hi ? "bg-[#EEF2F8] text-[#0F1A30]" : "text-[#33415C]"}`}>
              <span className="truncate flex-1">{o.v}</span>
              <span className="text-[11px] font-bold text-[#9AA9C3] tabular-nums" style={{ fontFamily: MONO }}>{o.n.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailFilterModal({ open, onClose, rows, value, onApply, withDate, getters, dateOf, hide, title, dateLabel }) {
  const today = kst();
  const fm = React.useMemo(() => fieldMap(getters, hide), [getters, hide]);
  const fields = React.useMemo(() => [...fm.keys()], [fm]);
  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(today);
  const [conds, setConds] = React.useState([{ f: "", q: "" }]);
  const firstInput = React.useRef(null);

  // 열 때마다 — 적용 중이면 그 조건, 아니면 기간은 "오늘"로
  React.useEffect(() => {
    if (!open) return;
    const t = kst();
    setFrom(value?.from || t); setTo(value?.to || t);
    const cs = (value?.conds || []).filter((c) => c?.f).map((c) => ({ f: c.f, q: c.q || "" }));
    setConds(cs.length ? cs : [{ f: "", q: "" }]);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 단계별로 남는 오더 — 2차 값 목록은 1차까지 거른 오더에서 뽑는다
  const stages = React.useMemo(() => {
    if (!open) return [];
    let base = rows || [];
    if (withDate && from && to) base = applyDetailFilter(base, { from, to, conds: [] }, { getters, dateOf, withDate, hide });
    const out = [base];
    for (const c of conds) {
      const cur = out[out.length - 1];
      out.push(c.f && normClient(c.q) ? applyDetailFilter(cur, { conds: [c] }, { getters, withDate: false, hide }) : cur);
    }
    return out;
  }, [open, rows, from, to, conds, withDate, getters, dateOf, hide]);

  const optionsFor = (i, f) => {
    if (!f) return [];
    const cnt = new Map();
    for (const r of stages[i] || []) { const v = valOf(fm, f, r); if (v) cnt.set(v, (cnt.get(v) || 0) + 1); }
    return [...cnt.entries()].map(([v, n]) => ({ v, n })).sort((a, b) => b.n - a.n || a.v.localeCompare(b.v, "ko"));
  };

  if (!open) return null;
  const total = (stages[0] || []).length;
  const result = (stages[stages.length - 1] || []).length;
  const setC = (i, patch) => setConds((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const apply = () => {
    const cs = conds.filter((c) => c.f && normClient(c.q)).map((c) => ({ f: c.f, q: c.q.trim() }));
    onApply?.({ from: withDate ? (from <= to ? from : to) : "", to: withDate ? (from <= to ? to : from) : "", conds: cs });
    onClose?.();
  };
  const ranges = quickRanges();
  const inp = "h-10 rounded-xl border border-[#D5DDEA] bg-white px-3 text-[14px] font-bold text-[#0F1A30] outline-none focus:border-[#1B2B4B] focus:ring-2 focus:ring-[#1B2B4B]/10";

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#060C1A]/60 backdrop-blur-[3px] p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="w-[min(760px,96vw)] max-h-[94vh] flex flex-col rounded-[22px] bg-[#F4F6FA] shadow-[0_30px_80px_rgba(6,12,26,0.55)] overflow-hidden ring-1 ring-white/10">
        {/* 머리 */}
        <div className="relative overflow-hidden px-6 pt-5 pb-4 text-white" style={{ background: "radial-gradient(700px 260px at 85% -30%, rgba(110,149,232,.32), transparent 60%), linear-gradient(120deg,#060C1A 0%,#0F1A30 45%,#1B2B4B 100%)" }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px" }} />
          <div className="relative flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-[#CFE0FF]" style={{ background: "linear-gradient(135deg,#2D4C82,#0B1428)", border: "1px solid rgba(207,224,255,.3)", boxShadow: "0 0 0 4px rgba(143,176,240,.08), 0 0 24px rgba(110,149,232,.25)" }}>
              <Icon s={20} />
            </div>
            <div className="min-w-0">
              <div className="text-[10.5px] font-extrabold tracking-[0.32em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>DETAIL FILTER · UP TO 3 STEPS</div>
              <div className="text-[21px] font-black mt-0.5 tracking-tight">{title}</div>
            </div>
            <button onClick={onClose} className="ml-auto h-9 px-3.5 rounded-xl bg-white/[0.08] border border-white/15 hover:bg-white/[0.16] text-[12.5px] font-black">닫기 <span className="text-white/45 ml-0.5" style={{ fontFamily: MONO }}>ESC</span></button>
          </div>
          {/* 계기판 — 단계별 남는 건수 */}
          <div className="relative mt-4 flex items-stretch gap-1.5">
            {[["ALL", withDate ? "기간 안" : "전체", total], ...conds.map((c, i) => [`STEP ${i + 1}`, c.f && normClient(c.q) ? `${c.f}` : `${i + 1}차`, (stages[i + 1] || []).length])].map(([en, k, v], i, arr) => (
              <React.Fragment key={en}>
                <div className={`flex-1 min-w-0 rounded-2xl px-3.5 py-2.5 border ${i === arr.length - 1 ? "bg-white/[0.12] border-white/25" : "bg-white/[0.05] border-white/[0.12]"}`}>
                  <div className="flex items-center gap-1.5 min-w-0"><span className="text-[9.5px] font-extrabold tracking-[0.2em] text-white/40 shrink-0" style={{ fontFamily: MONO }}>{en}</span><span className="text-[11px] font-bold text-white/60 truncate">{k}</span></div>
                  <div className="mt-0.5 text-[19px] font-black tabular-nums leading-tight" style={{ fontFamily: MONO, color: i === arr.length - 1 ? "#FFFFFF" : "#CFE0FF" }}>{v.toLocaleString()}<span className="ml-1 text-[11px] font-bold text-white/40">건</span></div>
                </div>
                {i < arr.length - 1 && <span className="self-center text-white/30 text-[14px] font-black">›</span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* 기간 */}
          {withDate && (
            <section className="rounded-2xl bg-white border border-[#E3E8F0] px-4 py-3.5">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[10px] font-extrabold tracking-[0.22em] text-[#2D4C82]" style={{ fontFamily: MONO }}>PERIOD</span>
                <span className="text-[13px] font-black text-[#0F1A30]">기간</span>
                <span className="text-[11.5px] font-bold text-[#9AA9C3]">{dateLabel}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CustomDatePicker className={`${inp} w-[150px] text-left`} value={from} onChange={(e) => setFrom(e.target.value)} />
                <span className="text-[#9AA9C3] font-black">~</span>
                <CustomDatePicker className={`${inp} w-[150px] text-left`} value={to} onChange={(e) => setTo(e.target.value)} />
                <div className="inline-flex p-1 rounded-xl bg-[#EEF2F8] border border-[#E3E8F0]">
                  {ranges.map((q) => {
                    const on = from === q.s && to === q.e;
                    return <button key={q.k} type="button" onClick={() => { setFrom(q.s); setTo(q.e); }} className={`h-8 px-2.5 rounded-lg text-[12px] font-black whitespace-nowrap transition ${on ? "bg-[#0F1A30] text-white shadow-[0_4px_12px_rgba(15,26,48,.25)]" : "text-[#5B6B85] hover:text-[#0F1A30]"}`}>{q.k}</button>;
                  })}
                </div>
              </div>
            </section>
          )}

          {/* 조건 1~3차 */}
          <section className="rounded-2xl bg-white border border-[#E3E8F0] px-4 py-3.5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-extrabold tracking-[0.22em] text-[#2D4C82]" style={{ fontFamily: MONO }}>CONDITIONS</span>
              <span className="text-[13px] font-black text-[#0F1A30]">조건</span>
              <span className="text-[11.5px] font-bold text-[#9AA9C3]">위에서부터 차례로 좁혀집니다 · 같은 이름이 있으면 그 이름만</span>
            </div>
            <div className="space-y-2">
              {conds.map((c, i) => {
                const used = conds.filter((_, j) => j !== i).map((x) => x.f);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-11 h-10 shrink-0 rounded-xl bg-[#0F1A30] text-white flex flex-col items-center justify-center leading-none">
                      <span className="text-[13px] font-black" style={{ fontFamily: MONO }}>{String(i + 1).padStart(2, "0")}</span>
                      <span className="text-[9px] font-bold text-white/55 mt-0.5">{i + 1}차</span>
                    </span>
                    <select value={c.f} onChange={(e) => { setC(i, { f: e.target.value, q: "" }); }}
                      className={`${inp} w-[150px] shrink-0 cursor-pointer ${c.f ? "" : "text-[#9AA9C3]"}`}>
                      <option value="">칸 선택</option>
                      {fields.map((f) => <option key={f} value={f} disabled={used.includes(f)}>{f}</option>)}
                    </select>
                    <ValueInput field={c.f} q={c.q} onChange={(q) => setC(i, { q })} options={optionsFor(i, c.f)} onEnter={apply} inputRef={i === 0 ? firstInput : undefined} />
                    <span className="w-16 shrink-0 text-right text-[12px] font-black tabular-nums text-[#5B6B85]" style={{ fontFamily: MONO }}>
                      {c.f && normClient(c.q) ? `${(stages[i + 1] || []).length.toLocaleString()}건` : "—"}
                    </span>
                    <button type="button" title="이 조건 지우기" onClick={() => setConds((cs) => (cs.length === 1 ? [{ f: "", q: "" }] : cs.filter((_, j) => j !== i)))}
                      className="w-8 h-8 shrink-0 rounded-lg text-[#9AA9C3] hover:text-[#0F1A30] hover:bg-[#EEF2F8] flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
            {conds.length < MAX && (
              <button type="button" onClick={() => setConds((cs) => [...cs, { f: "", q: "" }])}
                className="mt-2.5 w-full h-10 rounded-xl border border-dashed border-[#C9D3E3] text-[12.5px] font-black text-[#5B6B85] hover:border-[#1B2B4B] hover:text-[#0F1A30] hover:bg-[#F7F9FC] transition">
                + {conds.length + 1}차 조건 추가 <span className="text-[#9AA9C3] font-bold">(최대 {MAX}차)</span>
              </button>
            )}
          </section>
        </div>

        {/* 아래 */}
        <div className="px-6 py-3.5 border-t border-[#E3E8F0] bg-white flex items-center gap-2">
          <button type="button" onClick={() => { const t = kst(); setFrom(t); setTo(t); setConds([{ f: "", q: "" }]); }}
            className="h-10 px-4 rounded-xl border border-[#D5DDEA] text-[13px] font-black text-[#5B6B85] hover:text-[#0F1A30] hover:border-[#1B2B4B]">초기화</button>
          {value && <button type="button" onClick={() => { onApply?.(null); onClose?.(); }}
            className="h-10 px-4 rounded-xl border border-[#D5DDEA] text-[13px] font-black text-[#5B6B85] hover:text-[#0F1A30] hover:border-[#1B2B4B]">세부검색 해제</button>}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[12px] font-bold text-[#5B6B85]">조회 결과 <b className="text-[16px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{result.toLocaleString()}</b> 건</span>
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-[#D5DDEA] text-[13px] font-black text-[#5B6B85] hover:text-[#0F1A30]">취소</button>
            <button type="button" onClick={apply} className="h-10 px-6 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black shadow-[0_6px_16px_rgba(15,26,48,.28)] hover:bg-[#1B2B4B] transition">조회</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// 툴바 버튼 + 팝업 — value/onApply는 쓰는 쪽에서 들고 있는다
export default function DetailFilterButton({ rows = [], value = null, onApply, withDate = true, getters, dateOf, hide, title = "세부검색", dateLabel = "상차일 기준", size = "sm", className = "" }) {
  const [open, setOpen] = React.useState(false);
  const on = detailActive(value);
  const n = (value?.conds || []).filter((c) => c?.f && normClient(c.q)).length;
  const h = size === "md" ? "h-9 text-[12.5px] px-3.5" : "h-[30px] text-[11.5px] px-2.5";
  return (
    <>
      <span className={`inline-flex items-center rounded-lg overflow-hidden flex-shrink-0 ${on ? "bg-[#0F1A30] text-white shadow-[0_3px_10px_rgba(15,26,48,.28)]" : "bg-white text-[#0F1A30] border border-[#1B2B4B]"} ${className}`}
        title={on ? `세부검색 적용 중 · ${detailSummary(value, withDate)}` : "칸을 골라 최대 3차까지 좁혀 찾기"}>
        <button type="button" onClick={() => setOpen(true)} className={`${h} inline-flex items-center gap-1.5 font-black whitespace-nowrap ${on ? "hover:bg-[#1B2B4B]" : "hover:bg-[#EEF2F8]"}`}>
          <Icon s={13} />세부검색
          {on && n > 0 && <span className="min-w-[16px] h-4 px-1 rounded-full bg-[#8FB0F0] text-[#0F1A30] text-[10px] font-black inline-flex items-center justify-center" style={{ fontFamily: MONO }}>{n}</span>}
          {on && <span className="hidden xl:inline max-w-[220px] truncate text-[11px] font-bold text-white/70">{detailSummary(value, withDate)}</span>}
        </button>
        {on && (
          <button type="button" title="세부검색 해제" onClick={() => onApply?.(null)} className={`${size === "md" ? "h-9 w-8" : "h-[30px] w-7"} border-l border-white/15 inline-flex items-center justify-center text-white/70 hover:text-white hover:bg-[#1B2B4B]`}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </span>
      <DetailFilterModal open={open} onClose={() => setOpen(false)} rows={rows} value={value} onApply={onApply} withDate={withDate} getters={getters} dateOf={dateOf} hide={hide} title={title} dateLabel={dateLabel} />
    </>
  );
}

// 화면 전체를 세부검색으로 거르기(정산관리·매출관리) — children(거른 오더, 버튼)
//  · 기간을 고르면 그 기간 오더를 서버에서 불러온다(PC는 최근 며칠만 실시간이라)
export function DetailScope({ data = [], getters, dateOf, withDate = true, hide, title, dateLabel, children }) {
  const [value, setValue] = React.useState(null);
  useLoadOrderRange(value?.from || null, value?.to || null, !!(withDate && value?.from));
  const rows = React.useMemo(() => applyDetailFilter(data, value, { getters, dateOf, withDate, hide }), [data, value, getters, dateOf, withDate, hide]);
  const btn = <DetailFilterButton rows={data} value={value} onApply={setValue} withDate={withDate} getters={getters} dateOf={dateOf} hide={hide} title={title} dateLabel={dateLabel} size="md" />;
  return children(rows, btn, value);
}
