// ⭐ 2026-11-03 담당자·차량 조회 — 기간을 고르고 배차담당자 + 차량번호/기사명으로 한 번에 찾기
//    배차관리(아래 실시간 표)·실시간배차현황·배차현황 버튼에서 같은 창을 연다.
import React from "react";
import { createPortal } from "react-dom";
import CustomDatePicker from "./CustomDatePicker"; // 프로그램 공용 달력

const kst = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const toInt = (v) => { const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10); return Number.isFinite(n) ? n : 0; };
const norm = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
const won = (n) => `${Number(n || 0).toLocaleString()}원`;
const EMPTY = "미지정";
const timeKey = (t) => { const m = String(t || "").match(/(\d{1,2}):(\d{2})/); if (!m) return "99:99"; let h = +m[1]; if (/오후|PM/i.test(t) && h < 12) h += 12; if (/오전|AM/i.test(t) && h === 12) h = 0; return String(h).padStart(2, "0") + ":" + m[2]; };

function quickRanges() {
  const t = kst();
  const d = new Date(t + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // 월=0
  const ym = t.slice(0, 7);
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const y = +t.slice(0, 4), m = +t.slice(5, 7);
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  const pym = `${py}-${String(pm).padStart(2, "0")}`;
  return [
    { k: "어제", s: addDays(t, -1), e: addDays(t, -1) },
    { k: "오늘", s: t, e: t },
    { k: "이번 주", s: addDays(t, -dow), e: addDays(t, 6 - dow) },
    { k: "이번 달", s: `${ym}-01`, e: `${ym}-${lastDay(y, m)}` },
    { k: "지난달", s: `${pym}-01`, e: `${pym}-${lastDay(py, pm)}` },
  ];
}

export default function OrderLookupModal({ open, onClose, rows = [], nameOf = () => "", title = "담당자·차량 조회" }) {
  const today = kst();
  const [start, setStart] = React.useState(today);
  const [end, setEnd] = React.useState(today);
  const [mgr, setMgr] = React.useState("");
  const [car, setCar] = React.useState("");
  const [sugOpen, setSugOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const [showN, setShowN] = React.useState(300);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 기간 안의 오더(취소 제외) + 담당자 이름 미리 계산
  const inRange = React.useMemo(() => {
    if (!open) return [];
    const s = start <= end ? start : end, e = start <= end ? end : start;
    const out = [];
    for (const r of rows || []) {
      const d = String(r?.상차일 || "").slice(0, 10);
      if (!d || d < s || d > e) continue;
      if (r.배차상태 === "배차취소") continue;
      out.push({ r, mgr: nameOf(r) || EMPTY });
    }
    return out;
  }, [open, rows, start, end, nameOf]);

  // 담당자별 요약(드롭다운 + 요약표)
  const mgrStats = React.useMemo(() => {
    const m = new Map();
    for (const { r, mgr: n } of inRange) {
      const o = m.get(n) || { name: n, cnt: 0, done: 0, sale: 0, drv: 0 };
      o.cnt++; if (String(r.차량번호 || "").trim()) o.done++;
      o.sale += toInt(r.청구운임); o.drv += toInt(r.기사운임);
      m.set(n, o);
    }
    return [...m.values()].sort((a, b) => (a.name === EMPTY) - (b.name === EMPTY) || b.cnt - a.cnt || a.name.localeCompare(b.name, "ko"));
  }, [inRange]);

  const byMgr = React.useMemo(() => (mgr ? inRange.filter((x) => x.mgr === mgr) : inRange), [inRange, mgr]);

  // 차량번호·기사명 자동완성(기간·담당자 안에서)
  const suggestions = React.useMemo(() => {
    const q = norm(car);
    if (!q) return [];
    const m = new Map();
    for (const { r } of byMgr) {
      const plate = String(r.차량번호 || "").trim(), nm = String(r.이름 || "").trim();
      if (!plate && !nm) continue;
      if (!norm(plate).includes(q) && !norm(nm).includes(q)) continue;
      const k = plate + "|" + nm;
      const o = m.get(k) || { plate, nm, cnt: 0 };
      o.cnt++; m.set(k, o);
    }
    return [...m.values()].sort((a, b) => b.cnt - a.cnt).slice(0, 12);
  }, [byMgr, car]);

  const result = React.useMemo(() => {
    const q = norm(car);
    const list = q ? byMgr.filter(({ r }) => norm(r.차량번호).includes(q) || norm(r.이름).includes(q)) : byMgr;
    return [...list].sort((a, b) => String(a.r.상차일 || "").localeCompare(String(b.r.상차일 || "")) || timeKey(a.r.상차시간).localeCompare(timeKey(b.r.상차시간)));
  }, [byMgr, car]);

  React.useEffect(() => { setShowN(300); }, [start, end, mgr, car]);

  const kpi = React.useMemo(() => {
    let done = 0, sale = 0, drv = 0;
    for (const { r } of result) { if (String(r.차량번호 || "").trim()) done++; sale += toInt(r.청구운임); drv += toInt(r.기사운임); }
    return { cnt: result.length, done, wait: result.length - done, sale, drv, fee: sale - drv };
  }, [result]);

  const downloadExcel = async () => {
    const XLSX = await import("xlsx");
    const data = result.map(({ r, mgr: n }, i) => ({
      순번: i + 1, 상차일: r.상차일 || "", 상차시간: r.상차시간 || "", 배차담당자: n, 거래처명: r.거래처명 || "",
      상차지명: r.상차지명 || "", 하차지명: r.하차지명 || "", 차량번호: r.차량번호 || "", 기사명: r.이름 || "", 전화번호: r.전화번호 || "",
      배차상태: r.배차상태 || "", 청구운임: toInt(r.청구운임), 기사운임: toInt(r.기사운임), 수수료: toInt(r.청구운임) - toInt(r.기사운임),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "조회결과");
    XLSX.writeFile(wb, `담당자차량조회_${start}~${end}${mgr ? "_" + mgr : ""}${car ? "_" + car : ""}.xlsx`);
  };

  if (!open) return null;
  const pick = (s) => { const q = norm(car); setCar(s.plate && (norm(s.plate).includes(q) || !s.nm) ? s.plate : s.nm); setSugOpen(false); }; // 이름으로 찾던 중이면 이름 그대로(그 기사 전체)
  const inp = "h-9 rounded-lg border border-[#D5DDEA] bg-white px-2.5 text-[13.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#1B2B4B] focus:ring-2 focus:ring-[#1B2B4B]/10";
  const lab = "text-[11.5px] font-black text-[#5B6B85] mb-1 tracking-tight";
  const ranges = quickRanges();

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0F1A30]/45 p-2" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="w-[min(1640px,97vw)] h-[94vh] flex flex-col rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,26,48,0.35)] overflow-hidden">
        {/* 머리 */}
        <div className="flex items-center gap-3 px-6 py-4 bg-[#1B2B4B] text-white">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          </div>
          <div className="min-w-0">
            <div className="text-[16px] font-black">{title}</div>
            <div className="text-[11.5px] text-white/60 font-semibold">기간을 고르고 배차담당자·차량번호·기사명으로 찾아요 (상차일 기준)</div>
          </div>
          <button onClick={onClose} className="ml-auto h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-[12px] font-bold">닫기 <span className="text-white/50">ESC</span></button>
        </div>

        {/* 조건 */}
        <div className="px-6 pt-4 pb-3 border-b border-[#E9EDF4] bg-[#F7F9FC]">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className={lab}>기간 (상차일)</div>
              <div className="flex items-center gap-1.5">
                <CustomDatePicker className={`${inp} w-[150px] text-left`} value={start} onChange={(e) => setStart(e.target.value)} />
                <span className="text-[#9AA9C3] font-bold">~</span>
                <CustomDatePicker className={`${inp} w-[150px] text-left`} value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-1 pb-0.5">
              {ranges.map((q) => {
                const on = start === q.s && end === q.e;
                return <button key={q.k} onClick={() => { setStart(q.s); setEnd(q.e); }} className={`h-8 px-2.5 rounded-lg text-[12px] font-bold border transition ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#3A4A66] border-[#D5DDEA] hover:bg-[#EEF2F8]"}`}>{q.k}</button>;
              })}
            </div>
            <div>
              <div className={lab}>배차담당자</div>
              <select className={`${inp} min-w-[150px] cursor-pointer`} value={mgr} onChange={(e) => setMgr(e.target.value)}>
                <option value="">전체 ({inRange.length.toLocaleString()}건)</option>
                {mgrStats.map((m) => <option key={m.name} value={m.name}>{m.name} ({m.cnt.toLocaleString()}건)</option>)}
              </select>
            </div>
            <div className="relative">
              <div className={lab}>차량번호 · 기사명</div>
              <div className="relative">
                <input className={`${inp} w-[220px] pr-7`} value={car} placeholder="예) 8600, 장연민"
                  role="combobox" aria-expanded={sugOpen && suggestions.length > 0}
                  onChange={(e) => { setCar(e.target.value); setSugOpen(true); setHi(0); }}
                  onFocus={() => setSugOpen(true)}
                  onBlur={() => setTimeout(() => setSugOpen(false), 150)}
                  onKeyDown={(e) => {
                    if (!sugOpen || !suggestions.length) return;
                    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, suggestions.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
                    else if (e.key === "Enter") { e.preventDefault(); pick(suggestions[hi]); }
                  }} />
                {car && <button onClick={() => setCar("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full text-[#9AA9C3] hover:bg-[#EEF2F8] text-[13px] leading-none">×</button>}
              </div>
              {sugOpen && suggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-[300px] max-h-[260px] overflow-auto rounded-xl border border-[#D5DDEA] bg-white shadow-[0_12px_28px_rgba(15,26,48,0.18)] py-1" role="listbox">
                  {suggestions.map((s, i) => (
                    <div key={s.plate + s.nm} role="option" aria-selected={i === hi} onMouseDown={(e) => { e.preventDefault(); pick(s); }} onMouseEnter={() => setHi(i)}
                      className={`px-3 py-2 cursor-pointer flex items-center gap-2 ${i === hi ? "bg-[#EEF2F8]" : ""}`}>
                      <span className="text-[13.5px] font-black text-[#0F1A30] tabular-nums">{s.plate || "-"}</span>
                      <span className="text-[13px] font-semibold text-[#3A4A66]">{s.nm}</span>
                      <span className="ml-auto text-[11.5px] font-bold text-[#9AA9C3] tabular-nums">{s.cnt}건</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {(mgr || car) && <button onClick={() => { setMgr(""); setCar(""); }} className="h-9 px-3 rounded-lg text-[12px] font-bold text-[#5B6B85] hover:bg-[#EEF2F8]">조건 지우기</button>}
            <button onClick={downloadExcel} disabled={!result.length} className="ml-auto h-9 px-3.5 rounded-lg bg-[#1B7F4B] text-white text-[12.5px] font-black disabled:opacity-40 hover:opacity-90">엑셀 다운로드</button>
          </div>

          {/* 합계 */}
          <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              ["조회 건수", `${kpi.cnt.toLocaleString()}건`, "#0F1A30"],
              ["배차완료", `${kpi.done.toLocaleString()}건`, "#1B7F4B"],
              ["미배차", `${kpi.wait.toLocaleString()}건`, kpi.wait ? "#C2410C" : "#9AA9C3"],
              ["청구운임", won(kpi.sale), "#1B2B4B"],
              ["기사운임", won(kpi.drv), "#1B2B4B"],
              ["수수료", won(kpi.fee), kpi.fee < 0 ? "#C2410C" : "#4B6CB7"],
            ].map(([k, v, c]) => (
              <div key={k} className="rounded-xl bg-white border border-[#E3E8F0] px-3 py-2">
                <div className="text-[11px] font-bold text-[#7A8AA6]">{k}</div>
                <div className="text-[15px] font-black tabular-nums" style={{ color: c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {/* 담당자를 고르지 않았으면 담당자별 요약 — 누르면 그 담당자로 좁힌다 */}
          {!mgr && !car && mgrStats.length > 0 && (
            <div className="px-6 pt-4">
              <div className="text-[12px] font-black text-[#5B6B85] mb-2">담당자별 요약 <span className="font-semibold text-[#9AA9C3]">· 누르면 그 담당자만 봐요</span></div>
              <div className="flex flex-wrap gap-2">
                {mgrStats.map((m) => (
                  <button key={m.name} onClick={() => setMgr(m.name)} className="text-left rounded-xl border border-[#E3E8F0] bg-white hover:border-[#1B2B4B] hover:shadow-sm px-3 py-2 min-w-[150px] transition">
                    <div className="flex items-center gap-2"><span className="text-[13.5px] font-black text-[#0F1A30]">{m.name}</span><span className="ml-auto text-[12px] font-black text-[#4B6CB7] tabular-nums">{m.cnt}건</span></div>
                    <div className="text-[11.5px] font-semibold text-[#7A8AA6] tabular-nums">청구 {m.sale.toLocaleString()} · 수수료 {(m.sale - m.drv).toLocaleString()}</div>
                    {m.cnt - m.done > 0 && <div className="text-[11px] font-bold text-[#C2410C]">미배차 {m.cnt - m.done}건</div>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="px-6 py-4">
            {result.length === 0 ? (
              <div className="py-16 text-center text-[13.5px] font-semibold text-[#9AA9C3]">조건에 맞는 오더가 없어요.</div>
            ) : (
              <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
                <colgroup>{[46, 62, 92, 84, null, null, 112, 70, 82, 90, 90, 84].map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
                <thead>
                  <tr>
                    {["순번", "상차일", "상차시간", "배차담당자", "거래처명", "상차지 → 하차지", "차량번호", "기사명", "배차상태", "청구운임", "기사운임", "수수료"].map((h) => (
                      <th key={h} className="sticky top-0 z-[1] bg-[#EEF2F8] text-[#3A4A66] text-[12px] font-black px-1.5 py-2 border-b border-[#D5DDEA] whitespace-nowrap overflow-hidden text-ellipsis text-center">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.slice(0, showN).map(({ r, mgr: n }, i) => {
                    const sale = toInt(r.청구운임), drv = toInt(r.기사운임);
                    const hasCar = !!String(r.차량번호 || "").trim();
                    const td = "px-1.5 py-2 border-b border-[#EEF1F6] whitespace-nowrap overflow-hidden text-ellipsis";
                    return (
                      <tr key={r._id || i} className={i % 2 ? "bg-[#FAFBFD]" : "bg-white"}>
                        <td className={`${td} text-center text-[#7A8AA6] tabular-nums`}>{i + 1}</td>
                        <td className={`${td} text-center tabular-nums`}>{String(r.상차일 || "").slice(5)}</td>
                        <td className={`${td} text-center`}>{r.상차시간 || "-"}</td>
                        <td className={`${td} text-center font-bold ${n === EMPTY ? "text-[#9AA9C3]" : "text-[#0F1A30]"}`}>{n}</td>
                        <td className={`${td} font-semibold truncate`} title={r.거래처명}>{r.거래처명 || "-"}</td>
                        <td className={`${td} truncate`} title={`${r.상차지명 || ""} → ${r.하차지명 || ""}`}>{r.상차지명 || "-"} <span className="text-[#9AA9C3]">→</span> {r.하차지명 || "-"}</td>
                        <td className={`${td} text-center font-black tabular-nums`}>{r.차량번호 || <span className="text-[#C2410C] font-bold">미배차</span>}</td>
                        <td className={`${td} text-center font-semibold`}>{r.이름 || "-"}</td>
                        <td className={`${td} text-center`}><span className={`inline-block px-2 py-0.5 rounded-md text-[11.5px] font-black ${hasCar ? "bg-[#E7F5EC] text-[#1B7F4B]" : "bg-[#FFF1E6] text-[#C2410C]"}`}>{r.배차상태 || (hasCar ? "배차완료" : "배차중")}</span></td>
                        <td className={`${td} text-right tabular-nums`}>{sale ? sale.toLocaleString() : "-"}</td>
                        <td className={`${td} text-right tabular-nums`}>{drv ? drv.toLocaleString() : "-"}</td>
                        <td className={`${td} text-right tabular-nums font-bold ${sale - drv < 0 ? "text-[#C2410C]" : "text-[#4B6CB7]"}`}>{sale || drv ? (sale - drv).toLocaleString() : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {result.length > showN && (
              <button onClick={() => setShowN((n) => n + 300)} className="mt-3 w-full h-10 rounded-xl border border-[#E3E8F0] text-[13px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD]">
                더 보기 <span className="text-[#7A8AA6] font-bold tabular-nums">({showN.toLocaleString()} / {result.length.toLocaleString()}건)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
