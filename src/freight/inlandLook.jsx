// ======================= src/freight/inlandLook.jsx =======================
// 🎨 2026-11-18 컨테이너 · 해상 · 항공 화면을 내륙과 "똑같은 모양"으로 — 내륙 화면(DispatchApp)의 단추 · 칩 · 표 · 달력 모양을 그대로 옮겨 쓴다
//  (사용자 요청: "디자인 전체를 내륙과 동일하게, 단 업무마다 보는 방법은 업무자가 한 눈에 이해하도록")
//  · DM_BTN* · dmToggleCls · DmDot : 내륙 오더등록 위쪽 버튼 줄과 같은 모양
//  · KpiPills  : 내륙 배차현황 "총 N건 · 청구 · 기사 · 수수료" 알약
//  · NavyTable : 내륙 배차현황 표(남색 머리줄 14px · 줄무늬 · 선택 칸 · 두 번 누르면 수정)
//  · OrderCalendar : 내륙 오더등록 오른쪽 달력(TODAY · TIME 머리 + 달력)
//  · PageClock : 내륙 화면 머리말 오른쪽 날짜 · 시각
import React from "react";
import CustomSelect from "../CustomSelect";
import CustomDatePicker from "../CustomDatePicker";
import { MONO } from "./ui";
import { profitColor } from "../marginPct";

export const DM_FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B2B4B] focus-visible:ring-offset-2 focus-visible:shadow-[0_0_0_6px_rgba(143,176,240,0.22)]";
export const DM_BTN = `inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl text-[13px] font-extrabold whitespace-nowrap select-none transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${DM_FOCUS}`;
export const DM_BTN_PRIMARY = `${DM_BTN} bg-[#0F1A30] text-white shadow-[0_4px_12px_rgba(15,26,48,0.20)] hover:bg-[#1B2B4B]`;
export const DM_BTN_SECONDARY = `${DM_BTN} bg-white text-[#1B2B4B] border border-[#DCE3EE] hover:border-[#2D4C82] hover:bg-[#F5F8FD]`;
export const dmToggleCls = (on) => `${DM_BTN} !px-3 border ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B] shadow-[0_4px_12px_rgba(27,43,75,0.22)]" : "bg-white text-[#5B6B85] border-[#DCE3EE] hover:border-[#2D4C82] hover:text-[#0F1A30]"}`;
export function DmDot({ on, alert = false }) {
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition ${on ? (alert ? "bg-[#FF6B6B]" : "bg-[#8FB0F0]") : "bg-[#C9D3E3]"}`} />;
}
const ICON = {
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>,
  fare: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /><path d="M9 11h4M11 9v4" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  swap: <><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
};
export function DmIcon({ name, size = 15, className = "" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">{ICON[name]}</svg>;
}

// 날짜(한국 시각)
const kst = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3);
export const ymdK = (d = new Date()) => kst(d).toISOString().slice(0, 10);
export const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const monthRange = (ymd = ymdK()) => { const [y, m] = ymd.split("-").map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return [`${ymd.slice(0, 7)}-01`, `${ymd.slice(0, 7)}-${String(last).padStart(2, "0")}`]; };
export const nextMonday = (ymd = ymdK()) => { const d = new Date(`${ymd}T00:00:00Z`); const w = d.getUTCDay(); return addDays(ymd, w === 0 ? 1 : 8 - w); };

// 내륙 화면 머리말 오른쪽 — 날짜 · 요일 · 시각
export function PageClock() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  const k = kst(now);
  return (
    <div className="ml-auto hidden lg:flex items-center gap-2.5 h-10 pl-3 pr-1 rounded-[14px] bg-[#F5F8FD] border border-[#E3E8F0] shrink-0 tabular-nums" style={{ fontFamily: MONO }}>
      <span className="w-1.5 h-1.5 rounded-full bg-[#4B6CB7] animate-pulse" />
      <span className="text-[12.5px] font-bold text-[#3A4A66]">{k.toISOString().slice(0, 10).replace(/-/g, ".")}</span>
      <span className="text-[10.5px] font-extrabold tracking-[0.18em] text-[#9AA9C3]">{["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][k.getUTCDay()]}</span>
      <span className="h-8 px-2.5 rounded-[10px] bg-[#0F1A30] text-white text-[13px] font-black flex items-center">{k.toISOString().slice(11, 16)}</span>
    </div>
  );
}

// 내륙 배차현황 알약 — [총 N건 ▾] 청구 · 지급 · 수익
export function KpiPills({ count, sale, cost, profit, saleLabel = "청구", costLabel = "지급", profitLabel = "수익", pageSize, onPageSize }) {
  const pill = "flex items-center gap-2 bg-white border border-[#1B2B4B]/20 px-4 py-2 rounded-xl shadow-sm";
  const rate = sale ? Math.round((profit / sale) * 1000) / 10 : 0;
  return (
    <>
      <div className="flex items-center gap-1.5 h-[38px] px-4 rounded-xl bg-[#1B2B4B] text-white shadow-sm">
        <span className="text-[12px] font-medium text-white/70">총</span>
        <span className="text-[15px] font-extrabold tabular-nums">{Number(count || 0).toLocaleString("ko-KR")}건</span>
        {onPageSize && (
          <CustomSelect value={String(pageSize)} onChange={(e) => onPageSize(Number(e.target.value))} className="ml-1 h-7 px-1.5 rounded-md bg-transparent text-white/80 text-[11.5px] font-bold border-0 cursor-pointer">
            {[50, 100, 200, 500].map((n) => <option key={n} value={n}>· {n}개씩</option>)}
          </CustomSelect>
        )}
      </div>
      <div className={pill}><span className="text-[12px] font-medium text-gray-500">{saleLabel}</span><span className="text-[15px] font-extrabold text-[#1B2B4B] tabular-nums">{Math.round(sale || 0).toLocaleString("ko-KR")}원</span></div>
      <div className={pill}><span className="text-[12px] font-medium text-gray-500">{costLabel}</span><span className="text-[15px] font-extrabold text-[#1B2B4B] tabular-nums">{Math.round(cost || 0).toLocaleString("ko-KR")}원</span></div>
      <div className={pill}>
        <span className="text-[12px] font-medium text-gray-500">{profitLabel}</span>
        <span className="text-[15px] font-extrabold tabular-nums" style={{ color: profit ? profitColor(profit) : "#1B2B4B" }}>{Math.round(profit || 0).toLocaleString("ko-KR")}원</span>
        {sale > 0 && <span className="text-[11.5px] font-bold tabular-nums" style={{ color: profit ? profitColor(profit) : "#7A89A3" }}>{rate}%</span>}
      </div>
    </>
  );
}

// 내륙 배차현황 날짜 줄 — 시작 ~ 끝 + 남색 검색칸(종류 ▾ · 검색어 · 조회) + 어제/당일/내일/이번달
export function DateSearchBar({ start, end, onRange, searchTypes = [], searchType, onSearchType, onSearch, live = false, extra = null }) {
  const [s, setS] = React.useState(start); const [e, setE] = React.useState(end);
  const qRef = React.useRef(null);
  React.useEffect(() => { setS(start); setE(end); }, [start, end]);
  const t = ymdK();
  const go = (a, b) => { setS(a); setE(b); onRange(a, b); };
  const chip = (on) => `px-2 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap flex-shrink-0 transition ${on ? "bg-[#1B2B4B] text-white" : "bg-gray-200/70 text-gray-600 hover:bg-gray-300"}`;
  const dirty = s && e && (s !== start || e !== end);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {!live && (<>
        <CustomDatePicker className="w-[150px] border border-gray-300 rounded-lg px-2 py-1.5 text-[13px] font-semibold flex-shrink-0 bg-white" value={s} onChange={(ev) => setS(ev.target.value)} />
        <span className="text-gray-500 text-[13px] flex-shrink-0">~</span>
        <CustomDatePicker className="w-[150px] border border-gray-300 rounded-lg px-2 py-1.5 text-[13px] font-semibold flex-shrink-0 bg-white" value={e} onChange={(ev) => setE(ev.target.value)} />
      </>)}
      <div className="flex items-center border-2 border-[#1B2B4B] rounded-lg overflow-hidden bg-white h-[30px] flex-shrink-0">
        <CustomSelect className="px-1 h-full text-[11px] bg-[#1B2B4B] text-white outline-none cursor-pointer" value={searchType} onChange={(ev) => onSearchType(ev.target.value)}>
          {searchTypes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </CustomSelect>
        <input autoComplete="off" ref={qRef} className="px-2 h-full text-[11px] w-28 outline-none" placeholder="검색어"
          onKeyUp={(ev) => { if (ev.key === "Enter") { onSearch(qRef.current?.value || ""); if (dirty) onRange(s, e); } }} />
        <button type="button" onClick={() => { onSearch(qRef.current?.value || ""); if (dirty) onRange(s, e); }}
          className={`h-full px-2 text-white text-[11px] font-bold transition bg-[#1B2B4B] hover:bg-[#243a60] ${dirty ? "animate-pulse" : ""}`}>조회</button>
      </div>
      {extra}
      <button type="button" className={chip(start === addDays(t, -1) && end === addDays(t, -1))} onClick={() => go(addDays(t, -1), addDays(t, -1))}>어제</button>
      <button type="button" className={chip(start === t && end === t)} onClick={() => go(t, t)}>당일</button>
      <button type="button" className={chip(start === addDays(t, 1) && end === addDays(t, 1))} onClick={() => go(addDays(t, 1), addDays(t, 1))}>내일</button>
      {live
        ? <button type="button" className={chip(start === addDays(t, -1) && end === addDays(t, 1))} onClick={() => go(addDays(t, -1), addDays(t, 1))}>전체</button>
        : <button type="button" className={chip(start === monthRange(t)[0] && end === monthRange(t)[1])} onClick={() => { const [a, b] = monthRange(t); go(a, b); }}>이번달</button>}
    </div>
  );
}

// 오른쪽 작은 단추(내륙 배차현황 오른쪽 위 — 기사복사 · 업로드링크 · 선택삭제 · 선택초기화 · 엑셀다운)
export const smallBtn = (kind = "navy") => `px-2 py-1 rounded-lg text-[11px] font-semibold shadow hover:opacity-90 whitespace-nowrap ${kind === "red" ? "bg-red-600 text-white" : kind === "gray" ? "bg-gray-300 text-gray-800" : kind === "dark" ? "bg-gray-800 text-white" : "bg-[#1B2B4B] text-white"}`;

// 내륙 배차현황 표 — cols: [{ key, label, cell(row), align, width }]
export function NavyTable({ rows, cols, rowKey = (r) => r.id, selected, onToggle, onToggleAll, onRowClick, onRowDoubleClick, onRowContext, startIndex = 0, empty = "조회된 결과가 없습니다.", rowTone }) {
  const allOn = rows.length > 0 && rows.every((r) => selected?.has(rowKey(r)));
  return (
    <div className="kp-grid rounded-xl shadow border border-gray-200 overflow-x-auto bg-white">
      <table className="w-full min-w-max table-auto">
        <thead className="bg-[#1B2B4B]">
          <tr>
            {selected && <th className="px-3 py-3 text-center text-[14px] font-bold text-white whitespace-nowrap border-b border-white/10 border-r border-r-white/10"><input type="checkbox" checked={allOn} onChange={() => onToggleAll?.(rows)} /></th>}
            <th className="px-3 py-3 text-center text-[14px] font-bold text-white whitespace-nowrap border-b border-white/10 border-r border-r-white/10">순번</th>
            {cols.map((c) => <th key={c.key} className="px-3 py-3 text-center text-[14px] font-bold text-white whitespace-nowrap border-b border-white/10 border-r border-r-white/10 last:border-r-0">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={cols.length + 2} className="py-16 text-center text-[13px] text-gray-500">{empty}</td></tr>}
          {rows.map((r, i) => {
            const id = rowKey(r); const on = selected?.has(id);
            const tone = rowTone?.(r);
            return (
              <tr key={id} onClick={() => onRowClick?.(r)} onDoubleClick={() => onRowDoubleClick?.(r)} onContextMenu={onRowContext ? (e) => { e.preventDefault(); onRowContext(r); } : undefined}
                className={`cursor-pointer transition-colors ${on ? "bg-blue-50" : tone === "warn" ? "bg-[#FFFAF2] hover:bg-[#FFF3E0]" : i % 2 === 0 ? "bg-white hover:bg-[#F5F8FD]" : "bg-[#F9FBFD] hover:bg-[#F5F8FD]"}`}>
                {selected && <td className="px-3 py-2 text-center border-b border-[#E9EDF4] border-r border-r-[#F1F4F9]" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={!!on} onChange={() => onToggle?.(id)} /></td>}
                <td className="px-3 py-2 text-[13.5px] font-bold text-[#5B6B85] text-center border-b border-[#E9EDF4] border-r border-r-[#F1F4F9] tabular-nums">{startIndex + i + 1}</td>
                {cols.map((c) => (
                  <td key={c.key} className={`px-3 py-2 text-[13.5px] text-[#0F1A30] border-b border-[#E9EDF4] border-r border-r-[#F1F4F9] last:border-r-0 whitespace-nowrap ${c.align === "right" ? "text-right tabular-nums" : c.align === "left" ? "text-left" : "text-center"} ${c.wrap ? "max-w-[220px] truncate" : ""}`}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 내륙 오더등록 오른쪽 달력 — 고른 날(작업일 · 출항일)에 표시, 날짜를 누르면 그 날로
export function OrderCalendar({ marks = [], value, onPick, labels = ["작업일", "반납"] }) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const today = ymdK(now);
  const [ym, setYm] = React.useState(() => (value || today).slice(0, 7));
  React.useEffect(() => { if (value) setYm(value.slice(0, 7)); }, [value]);
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const move = (n) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setYm(d.toISOString().slice(0, 7)); };
  const ymd = (d) => `${ym}-${String(d).padStart(2, "0")}`;
  return (
    <aside className="rounded-[24px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_30px_rgba(16,24,40,0.07)] overflow-hidden">
      <div className="px-5 py-4 flex items-end justify-between text-white" style={{ background: "linear-gradient(120deg,#0B1428 0%,#0F1A30 40%,#1B2B4B 75%,#2D4C82 100%)" }}>
        <div><div className="text-[10px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>TODAY</div><div className="text-[15px] font-black tabular-nums">{today}</div></div>
        <div className="text-right"><div className="text-[10px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>TIME</div><div className="text-[20px] font-black tabular-nums">{kst(now).toISOString().slice(11, 19)}</div></div>
      </div>
      <div className="p-4">
        <div className="flex gap-2 mb-3">
          {marks.map((mk, i) => (
            <span key={i} className={`flex-1 h-10 rounded-xl text-[12.5px] font-black grid place-items-center ${i === 0 ? "bg-[#1B2B4B] text-white" : "border border-[#DCE3EE] text-[#5B6B85]"}`}>
              {labels[i] || ""} · {mk ? `${Number(mk.slice(5, 7))}/${Number(mk.slice(8, 10))}` : "-"}
            </span>
          ))}
        </div>
        <div className="rounded-2xl border border-[#E3E8F0] p-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => move(-1)} className="w-7 h-7 rounded-lg text-[#5B6B85] hover:bg-[#F5F8FD] font-black">‹</button>
            <span className="text-[14px] font-black text-[#0F1A30]">{y}년 {m}월</span>
            <button type="button" onClick={() => move(1)} className="w-7 h-7 rounded-lg text-[#5B6B85] hover:bg-[#F5F8FD] font-black">›</button>
          </div>
          <div className="grid grid-cols-7 text-center text-[12.5px] font-black text-[#1B2B4B] mb-1">{["일", "월", "화", "수", "목", "금", "토"].map((d) => <span key={d} className="py-1">{d}</span>)}</div>
          <div className="grid grid-cols-7 gap-y-1 text-center">
            {cells.map((d, i) => {
              if (!d) return <span key={`b${i}`} />;
              const k = ymd(d); const mi = marks.indexOf(k); const isT = k === today;
              return (
                <button key={k} type="button" onClick={() => onPick?.(k)}
                  className={`h-10 rounded-xl text-[13px] font-bold tabular-nums transition ${mi === 0 ? "bg-[#1B2B4B] text-white" : mi > 0 ? "ring-2 ring-[#1B2B4B] text-[#0F1A30]" : isT ? "bg-[#EEF3FC] text-[#0F1A30]" : i % 7 === 0 ? "text-[#C2362B] hover:bg-[#F5F8FD]" : "text-[#1B2B4B] hover:bg-[#F5F8FD]"}`}>{d}</button>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-[#EEF1F6] flex items-center gap-3 text-[11.5px] font-bold text-[#5B6B85]">
            <button type="button" onClick={() => setYm(today.slice(0, 7))} className="font-black text-[#0F1A30]">오늘로 이동</button>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#1B2B4B]" />{labels[0]}</span>
            {labels[1] && <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full ring-2 ring-[#1B2B4B]" />{labels[1]}</span>}
          </div>
        </div>
      </div>
    </aside>
  );
}

// 내륙 오더등록 아래 메모 카드(MEMO 메모 · DRIVER NOTE 전달사항)
export function NoteCard({ en, title, sub, value, onChange, placeholder }) {
  return (
    <div className="rounded-[18px] border border-[#E3E8F0] bg-white overflow-hidden">
      <div className="px-4 h-12 flex items-center gap-2 border-b border-[#EEF1F6]">
        <span className="text-[10px] font-extrabold tracking-[0.3em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>{en}</span>
        <span className="text-[15px] font-black text-[#0F1A30]">{title}</span>
        {sub && <span className="text-[12.5px] font-semibold text-[#7A89A3]">{sub}</span>}
      </div>
      <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={4} placeholder={placeholder}
        className="w-full px-4 py-3 text-[13.5px] font-semibold text-[#0F1A30] placeholder:text-[#A7B3C6] resize-none focus:outline-none" />
      <div className="px-4 pb-2 text-right text-[11px] font-bold text-[#9AA9C3] tabular-nums">{String(value || "").length}자</div>
    </div>
  );
}
