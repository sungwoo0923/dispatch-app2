// ⭐ 2026-11-03 담당자·차량 조회 — 기간을 고르고 배차담당자 + 차량번호/기사명으로 한 번에 찾기
//    배차관리(아래 실시간 표)·실시간배차현황·배차현황 버튼에서 같은 창을 연다.
import React from "react";
import { createPortal } from "react-dom";
import CustomDatePicker from "./CustomDatePicker"; // 프로그램 공용 달력
import MgrBadge from "./MgrBadge";

const kst = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const toInt = (v) => { const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10); return Number.isFinite(n) ? n : 0; };
const norm = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
const won = (n) => `${Number(n || 0).toLocaleString()}원`;
const EMPTY = "미지정";
const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
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
      배차상태: r.배차상태 || "", 청구운임: toInt(r.청구운임), 기사운임: toInt(r.기사운임), 수수료: toInt(r.청구운임) - toInt(r.기사운임) - toInt(r.지게차비용),
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#060C1A]/60 backdrop-blur-[3px] p-2" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="w-[min(1640px,97vw)] h-[94vh] flex flex-col rounded-[22px] bg-[#F4F6FA] shadow-[0_30px_80px_rgba(6,12,26,0.55)] overflow-hidden ring-1 ring-white/10">
        {/* 머리 */}
        <div className="relative overflow-hidden px-6 pt-5 pb-4 text-white" style={{ background: "radial-gradient(900px 300px at 85% -30%, rgba(110,149,232,.32), transparent 60%), linear-gradient(120deg,#060C1A 0%,#0F1A30 45%,#1B2B4B 100%)" }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px" }} />
          <div className="relative flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#2D4C82,#0B1428)", border: "1px solid rgba(207,224,255,.3)", boxShadow: "0 0 0 4px rgba(143,176,240,.08), 0 0 24px rgba(110,149,232,.25)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            </div>
            <div className="min-w-0">
              <div className="text-[10.5px] font-extrabold tracking-[0.32em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>ORDER LOOKUP · MANAGER × VEHICLE</div>
              <div className="text-[21px] font-black mt-0.5 tracking-tight">{title}</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden md:inline-flex items-center gap-2 h-9 px-3 rounded-xl bg-white/[0.06] border border-white/15 text-[12px] font-bold text-white/80" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
                <span className="w-2 h-2 rounded-full bg-[#4ADE80] shadow-[0_0_8px_#4ADE80]" />{start.slice(5).replace("-", ".")} – {end.slice(5).replace("-", ".")} · {result.length.toLocaleString()} ROWS
              </span>
              <button onClick={onClose} className="h-9 px-3.5 rounded-xl bg-white/[0.08] border border-white/15 hover:bg-white/[0.16] text-[12.5px] font-black">닫기 <span className="text-white/45 ml-0.5" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>ESC</span></button>
            </div>
          </div>
          {/* 합계 — 디지털 계기판 */}
          <div className="relative mt-4 grid grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              ["COUNT", "조회 건수", kpi.cnt.toLocaleString(), "건", "#FFFFFF"],
              ["DONE", "배차완료", kpi.done.toLocaleString(), "건", "#7EE2A8"],
              ["PENDING", "미배차", kpi.wait.toLocaleString(), "건", kpi.wait ? "#FCD9A0" : "rgba(255,255,255,.4)"],
              ["SALES", "청구운임", kpi.sale.toLocaleString(), "원", "#FFFFFF"],
              ["DRIVER", "기사운임", kpi.drv.toLocaleString(), "원", "#CFE0FF"],
              ["MARGIN", "수수료", kpi.fee.toLocaleString(), "원", kpi.fee < 0 ? "#FFB4A8" : "#8FB0F0"],
            ].map(([en, k, v, u, c]) => (
              <div key={k} className="rounded-2xl px-3.5 py-2.5 bg-white/[0.05] border border-white/[0.12] backdrop-blur-sm">
                <div className="flex items-center gap-1.5"><span className="text-[9.5px] font-extrabold tracking-[0.2em] text-white/40" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{en}</span><span className="text-[11px] font-bold text-white/60">{k}</span></div>
                <div className="mt-0.5 text-[19px] font-black tabular-nums leading-tight" style={{ color: c, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{v}<span className="ml-1 text-[11px] font-bold text-white/40">{u}</span></div>
              </div>
            ))}
          </div>
          {kpi.cnt > 0 && (
            <div className="relative mt-2.5 h-1.5 rounded-full bg-white/10 overflow-hidden" title={`배차율 ${Math.round((kpi.done / kpi.cnt) * 100)}%`}>
              <div className="h-full rounded-full" style={{ width: `${(kpi.done / kpi.cnt) * 100}%`, background: "linear-gradient(90deg,#4B6CB7,#8FB0F0)" }} />
            </div>
          )}
        </div>

        {/* 조건 */}
        <div className="px-6 pt-4 pb-4 border-b border-[#E3E8F0] bg-white">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className={lab}>기간 (상차일)</div>
              <div className="flex items-center gap-1.5">
                <CustomDatePicker className={`${inp} w-[150px] text-left`} value={start} onChange={(e) => setStart(e.target.value)} />
                <span className="text-[#9AA9C3] font-bold">~</span>
                <CustomDatePicker className={`${inp} w-[150px] text-left`} value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="inline-flex p-1 rounded-xl bg-[#EEF2F8] border border-[#E3E8F0] mb-0.5">
              {ranges.map((q) => {
                const on = start === q.s && end === q.e;
                return <button key={q.k} onClick={() => { setStart(q.s); setEnd(q.e); }} className={`h-8 px-3 rounded-lg text-[12.5px] font-black transition ${on ? "bg-[#0F1A30] text-white shadow-[0_4px_12px_rgba(15,26,48,.25)]" : "text-[#5B6B85] hover:text-[#0F1A30]"}`}>{q.k}</button>;
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
                <input className={`${inp} w-[220px] pr-7`} value={car} placeholder="예) 1234, 홍길동"
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
            <button onClick={downloadExcel} disabled={!result.length} className="ml-auto h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[12.5px] font-black disabled:opacity-40 hover:bg-[#1B2B4B] inline-flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>엑셀 다운로드</button>
          </div>

        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {/* 담당자를 고르지 않았으면 담당자별 요약 — 누르면 그 담당자로 좁힌다 */}
          {!mgr && !car && mgrStats.length > 0 && (
            <div className="px-6 pt-4">
              <div className="flex items-center gap-2 mb-2.5"><span className="text-[10px] font-extrabold tracking-[0.28em] text-[#8A99B4]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>BY MANAGER</span><span className="text-[12.5px] font-black text-[#3A4A66]">담당자별 요약</span><span className="text-[11.5px] font-semibold text-[#9AA9C3]">· 누르면 그 담당자만</span></div>
              <div className="flex flex-wrap gap-2">
                {mgrStats.map((m) => (
                  <button key={m.name} onClick={() => setMgr(m.name)} className="group text-left rounded-2xl border border-[#E3E8F0] bg-white hover:border-[#2D4C82] hover:shadow-[0_8px_22px_rgba(15,26,48,.10)] px-4 py-3 min-w-[190px] transition">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-[#0F1A30] text-white text-[12px] font-black flex items-center justify-center">{String(m.name).slice(0, 1)}</span>
                      <span className="text-[14px] font-black text-[#0F1A30]">{m.name}</span>
                      <span className="ml-auto text-[15px] font-black text-[#2D4C82] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{m.cnt}</span>
                    </div>
                    <div className="mt-2 h-1 rounded-full bg-[#EEF1F6] overflow-hidden"><div className="h-full rounded-full bg-[#2D4C82]" style={{ width: `${m.cnt ? (m.done / m.cnt) * 100 : 0}%` }} /></div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] font-bold text-[#7A8AA6] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
                      <span>₩{m.sale.toLocaleString()}</span><span className="text-[#C9D3E3]">|</span><span className="text-[#4B6CB7]">+{(m.sale - m.drv).toLocaleString()}</span>
                      {m.cnt - m.done > 0 && <span className="ml-auto text-[#C2410C]">미배차 {m.cnt - m.done}</span>}
                    </div>
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
                <colgroup>{[52, 72, 96, 140, 180, null, 128, 84, 92, 104, 104, 100].map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
                <thead>
                  <tr>
                    {["순번", "상차일", "상차시간", "배차담당자", "거래처명", "상차지 → 하차지", "차량번호", "기사명", "배차상태", "청구운임", "기사운임", "수수료"].map((h) => (
                      <th key={h} className="sticky top-0 z-[1] bg-[#1B2B4B] text-white text-[12px] font-extrabold px-1.5 py-2.5 border-r border-white/10 last:border-r-0 whitespace-nowrap overflow-hidden text-ellipsis text-center first:rounded-tl-xl last:rounded-tr-xl">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.slice(0, showN).map(({ r, mgr: n }, i) => {
                    const sale = toInt(r.청구운임), drv = toInt(r.기사운임);
                    const hasCar = !!String(r.차량번호 || "").trim();
                    const td = "px-2 py-2 border-b border-[#E9EDF4] border-r border-r-[#F1F4F9] last:border-r-0 whitespace-nowrap overflow-hidden text-ellipsis text-center";
                    return (
                      <tr key={r._id || i} className={`${i % 2 ? "bg-[#FAFBFD]" : "bg-white"} hover:bg-[#F0F4FB] transition-colors`}>
                        <td className={`${td} text-center text-[#7A8AA6] tabular-nums`}>{i + 1}</td>
                        <td className={`${td} text-center tabular-nums`}>{String(r.상차일 || "").slice(5)}</td>
                        <td className={`${td} text-center`}>{r.상차시간 || "-"}</td>
                        <td className={`${td} overflow-visible`}><MgrBadge row={r} name={n === EMPTY ? "" : n} empty={EMPTY} /></td>
                        <td className={`${td} font-semibold`} title={r.거래처명}>{r.거래처명 || "-"}</td>
                        <td className={td} title={`${r.상차지명 || ""} → ${r.하차지명 || ""}`}>{r.상차지명 || "-"} <span className="text-[#9AA9C3]">→</span> {r.하차지명 || "-"}</td>
                        <td className={`${td} text-center font-black tabular-nums`}>{r.차량번호 || <span className="text-[#C2410C] font-bold">미배차</span>}</td>
                        <td className={`${td} text-center font-semibold`}>{r.이름 || "-"}</td>
                        <td className={`${td} text-center`}><span className={`inline-block px-2 py-0.5 rounded-md text-[11.5px] font-black ${hasCar ? "bg-[#E7F5EC] text-[#1B7F4B]" : "bg-[#FFF1E6] text-[#C2410C]"}`}>{r.배차상태 || (hasCar ? "배차완료" : "배차중")}</span></td>
                        <td className={`${td} tabular-nums`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{sale ? sale.toLocaleString() : "-"}</td>
                        <td className={`${td} tabular-nums`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{drv ? drv.toLocaleString() : "-"}</td>
                        <td style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} className={`${td} tabular-nums font-bold ${sale - drv < 0 ? "text-[#C2410C]" : "text-[#4B6CB7]"}`}>{sale || drv ? (sale - drv).toLocaleString() : "-"}</td>
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
