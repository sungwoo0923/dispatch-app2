// ======================= src/FareResultUi.jsx =======================
// 🎨 2026-11-24 운임조회 결과 창 공용 디자인 — 운임 산출(운임조회 › 운임 산출)과 같은 모양
//  네이비 머리(구간 · 핵심 숫자 3개: 대표 청구운임 · 평균 기사운임 · 평균 매출총이익) → 운임 분포 카드(범위 · 분포 막대 · 빠른 적용) → 과거 운송 기록
//  글씨는 네이비 · 그레이 단색, 색은 막대 그래프에만. 오더등록 · 선택수정 · 오더복사 · 우클릭 · 모바일 운임조회가 같이 쓴다.
import React from "react";

export const fareNum = (v) => Number(String(v ?? "0").replace(/[^\d-]/g, "")) || 0;
const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");

// 기록 → 핵심 숫자
export function fareStats(records = []) {
  const rows = (records || []).filter((r) => fareNum(r.청구운임) > 0);
  if (!rows.length) return null;
  const sales = rows.map((r) => fareNum(r.청구운임));
  const buys = rows.map((r) => fareNum(r.기사운임)).filter((v) => v > 0);
  const profits = rows.map((r) => (r.수수료 != null && r.수수료 !== "" ? fareNum(r.수수료) : fareNum(r.청구운임) - fareNum(r.기사운임))).filter((v) => Number.isFinite(v));
  const freq = new Map(); sales.forEach((v) => freq.set(v, (freq.get(v) || 0) + 1));
  const [mode, modeN] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  const avg = (a) => (a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : 0);
  const saleAvg = avg(sales), profitAvg = avg(profits);
  return { count: rows.length, mode, modeN, saleAvg, saleMin: Math.min(...sales), saleMax: Math.max(...sales), buyAvg: avg(buys), profitAvg, margin: saleAvg ? Math.round((profitAvg / saleAvg) * 1000) / 10 : 0, sales };
}

// 창 틀 — 머리(구간 · 칩 · 핵심 숫자) + 본문 + 닫기
export function FareShell({ title = "운임 조회 결과", from, to, chips = [], stats, kpiLabel = "대표 청구운임", onClose, zClass = "z-[999999]", width = 820, children, mobile = false }) {
  return (
    <div className={`fixed inset-0 bg-[#0B1428]/70 backdrop-blur-[3px] flex ${mobile ? "items-end" : "items-center"} justify-center ${zClass} ${mobile ? "" : "p-4"}`} data-fare-shell="1">
      <div className={`bg-[#F3F5F9] ${mobile ? "rounded-t-[24px] w-full max-h-[92vh]" : "rounded-[24px] max-w-[96vw] max-h-[90vh]"} flex flex-col shadow-[0_40px_100px_rgba(0,0,0,0.45)] overflow-hidden`} style={mobile ? undefined : { width }}>
        <div className="relative overflow-hidden px-5 sm:px-6 pt-5 pb-5 text-white shrink-0" style={{ background: "radial-gradient(120% 140% at 0% 0%,#22396B 0%,#0F1A30 55%,#0A1222 100%)" }}>
          <span className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(143,176,240,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(143,176,240,.06) 1px,transparent 1px)", backgroundSize: "24px 24px" }} />
          <div className="relative flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-bold text-white/55">{title}</div>
              <div className="flex items-center gap-3 mt-1 min-w-0">
                <span className="text-[17px] sm:text-[19px] font-black truncate max-w-[42%]">{from || "-"}</span>
                <span className="flex-1 h-[2px] rounded bg-gradient-to-r from-[#6E95E8] to-[#CFE0FF] relative min-w-[28px]"><span className="absolute -right-0.5 -top-[4px] border-l-[8px] border-l-[#CFE0FF] border-y-[5px] border-y-transparent" /></span>
                <span className="text-[17px] sm:text-[19px] font-black truncate max-w-[42%] text-right">{to || "-"}</span>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 h-9 w-9 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white text-[18px] leading-none">×</button>
          </div>
          {chips.filter(Boolean).length > 0 && (
            <div className="relative flex flex-wrap gap-1.5 mt-3 text-[12px] font-bold">
              {chips.filter(Boolean).map((c) => <span key={c} className="px-2.5 py-1 rounded-lg bg-white/[0.08] border border-white/10 text-white/80">{c}</span>)}
            </div>
          )}
          {stats && (
            <div className="relative grid grid-cols-3 gap-2 sm:gap-3 mt-4">
              <div className="rounded-2xl bg-white text-[#0F1A30] px-3 sm:px-4 py-3">
                <div className="text-[11.5px] font-bold text-[#6B7A93]">{kpiLabel}</div>
                <div className="text-[20px] sm:text-[26px] font-black tracking-[-0.02em] tabular-nums mt-0.5">{won(stats.mode)}</div>
                <div className="text-[11px] text-[#6B7A93] mt-0.5">{stats.count}건 중 {stats.modeN}건</div>
              </div>
              <div className="rounded-2xl bg-white/[0.06] border border-white/10 px-3 sm:px-4 py-3">
                <div className="text-[11.5px] font-bold text-white/55">평균 기사운임</div>
                <div className="text-[20px] sm:text-[26px] font-black tracking-[-0.02em] tabular-nums mt-0.5">{stats.buyAvg ? won(stats.buyAvg) : "—"}</div>
                <div className="text-[11px] text-white/45 mt-0.5">매입</div>
              </div>
              <div className="rounded-2xl bg-white/[0.06] border border-white/10 px-3 sm:px-4 py-3">
                <div className="text-[11.5px] font-bold text-white/55">평균 매출총이익</div>
                <div className="text-[20px] sm:text-[26px] font-black tracking-[-0.02em] tabular-nums mt-0.5">{won(stats.profitAvg)}</div>
                <div className="text-[11px] text-white/45 mt-0.5">마진율 {stats.margin}%</div>
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-4" data-fare-scroll>{children}</div>
        <div className="px-5 py-3.5 border-t border-[#E3E8F0] bg-white shrink-0">
          <button type="button" onClick={onClose} className="w-full h-11 rounded-xl bg-[#0F1A30] text-white text-[14px] font-extrabold">닫기</button>
        </div>
      </div>
    </div>
  );
}

// 흰 카드
export const FareCard = ({ title, sub, right, children, className = "" }) => (
  <div className={`bg-white border border-[#E3E8F0] rounded-[20px] p-4 sm:p-5 ${className}`}>
    {(title || right) && <div className="flex items-center justify-between gap-2 mb-3"><div className="flex items-baseline gap-2 min-w-0"><span className="text-[15px] font-black text-[#0F1A30] whitespace-nowrap">{title}</span>{sub && <span className="text-[12px] text-[#6B7A93] truncate">{sub}</span>}</div>{right}</div>}
    {children}
  </div>
);

// 운임 분포 — 범위 막대 · 분포 막대 · 빠른 적용(최저 · 대표 · 최고 · AI 추천 …)
export function FareRange({ min, max, marker, markerLabel = "대표", sales = [], quick = [], onApply, note }) {
  const span = (max - min) || 1;
  const pos = (v) => Math.max(0, Math.min(100, ((v - min) / span) * 100));
  const N = 12; const bins = Array.from({ length: N }, () => 0);
  if (max > min) sales.forEach((v) => { bins[Math.min(N - 1, Math.floor(((v - min) / span) * N))] += 1; });
  const peak = Math.max(1, ...bins);
  const mi = max > min && marker != null ? Math.min(N - 1, Math.floor(((marker - min) / span) * N)) : -1;
  return (
    <>
      <div className="flex items-baseline gap-2"><span className="text-[26px] font-black text-[#0F1A30] tabular-nums tracking-[-0.02em]">{won(min)}</span><span className="text-[16px] font-bold text-[#A8B3C5]">~</span><span className="text-[26px] font-black text-[#0F1A30] tabular-nums tracking-[-0.02em]">{won(max)}</span><span className="text-[13px] font-bold text-[#6B7A93]">원</span>{note && <span className="ml-auto text-[12px] font-bold text-[#6B7A93]">{note}</span>}</div>
      {max > min && sales.length > 1 && <div className="flex items-end gap-1 h-10 mt-3">{bins.map((n, i) => <i key={i} className="flex-1 rounded-t-[3px]" style={{ height: `${Math.max(6, (n / peak) * 100)}%`, background: i === mi ? "#2D4C82" : "#D6E0F0" }} />)}</div>}
      <div className="relative h-1.5 rounded bg-[#EEF2F7] mt-2">
        {marker != null && <span className="absolute -top-[5px] w-[2px] h-4 bg-[#0F1A30]" style={{ left: `${pos(marker)}%` }} />}
      </div>
      <div className="flex justify-between text-[11px] font-semibold text-[#6B7A93] mt-1.5"><span>최저 {won(min)}</span>{marker != null && <span className="text-[#0F1A30] font-bold">{markerLabel} {won(marker)}</span>}<span>최고 {won(max)}</span></div>
      {quick.length > 0 && (
        <div className={`grid gap-2 mt-4 ${quick.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
          {quick.map((x) => {
            const Tag = onApply ? "button" : "div";
            return (
              <Tag key={x.label} type={onApply ? "button" : undefined} onClick={onApply ? () => onApply(x.value) : undefined}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${x.strong ? "border-[#0F1A30] bg-white" : "border-[#E3E8F0] bg-[#F7F9FC]"} ${onApply ? "hover:border-[#0F1A30] active:scale-[0.98]" : ""}`}>
                <div className="text-[11px] font-bold text-[#6B7A93]">{x.label}</div>
                <div className="text-[17px] font-black text-[#0F1A30] tabular-nums leading-tight mt-0.5">{won(x.value)}</div>
                {x.sub && <div className="text-[10.5px] text-[#8A97AD] mt-0.5 truncate">{x.sub}</div>}
              </Tag>
            );
          })}
        </div>
      )}
    </>
  );
}

// 라벨(테두리만)
export const FareTag = ({ children, strong = false, warn = false }) => (
  <span className={`px-1.5 py-px text-[10.5px] font-bold rounded-[5px] border whitespace-nowrap ${warn ? "border-[#E3B4A0] text-[#9A4A2A]" : strong ? "border-[#0F1A30] text-[#0F1A30]" : "border-[#D5DCE7] text-[#5B6B85]"}`}>{children}</span>
);

// 과거 운송 기록 한 줄 — tags: [{ text, strong, warn }] · extra: 특수운임 줄 등 · onApply 있으면 [적용]
export function FareRow({ rec, avg = 0, pct = null, tags = [], extra = null, vias = null, onApply, top = false }) {
  const fare = fareNum(rec.청구운임); const buy = fareNum(rec.기사운임);
  const diff = avg ? fare - avg : 0;
  return (
    <div className={`rounded-2xl border bg-white px-4 py-3 ${top ? "border-[#0F1A30]" : "border-[#E3E8F0]"}`} data-fare-row="1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12.5px] font-bold text-[#6B7A93] tabular-nums">{rec.상차일 || "-"}</span>
        {top && <FareTag strong>최근 유사 운송</FareTag>}
        {tags.filter(Boolean).map((t, i) => <FareTag key={i} strong={t.strong} warn={t.warn}>{t.text}</FareTag>)}
        {extra?.tag}
      </div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-1.5 sm:gap-3 mt-1.5">
        <div className="min-w-0">
          <div className="text-[14px] font-extrabold text-[#0F1A30] truncate">{rec.상차지명 || "-"} → {rec.하차지명 || "-"}</div>
          {vias}
          <div className="text-[12px] text-[#6B7A93] mt-0.5 truncate">{[rec.차량종류, rec.차량톤수, rec.화물내용].filter(Boolean).join(" · ") || "-"}{rec.이름 ? ` · ${rec.이름}` : ""}</div>
          {extra?.line}
        </div>
        <div className="shrink-0 flex sm:block items-baseline gap-2 sm:text-right">
          <div className="text-[19px] font-black text-[#0F1A30] tabular-nums leading-none">{won(fare)}<span className="text-[12px] font-bold text-[#6B7A93] ml-0.5">원</span></div>
          <div className="text-[11.5px] text-[#6B7A93] tabular-nums sm:mt-1">기사 {buy ? won(buy) : "-"}{avg ? ` · ${Math.abs(diff) < 1000 ? "평균" : `평균 ${diff > 0 ? "+" : "−"}${won(Math.abs(diff))}`}` : ""}</div>
        </div>
      </div>
      {(pct != null || onApply) && (
        <div className="flex items-center gap-3 mt-2.5">
          {pct != null && <div className="relative flex-1 h-1 rounded bg-[#EEF2F7]"><span className="absolute -top-[3px] w-[2px] h-2.5 bg-[#2D4C82]" style={{ left: `${pct}%` }} /></div>}
          {onApply && <button type="button" onClick={() => onApply(fare)} className="shrink-0 h-8 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[12px] font-bold active:scale-95">적용</button>}
        </div>
      )}
    </div>
  );
}

// 경유지 표시(상 · 하)
export function viaNames(rec) {
  const sa = (v) => { if (Array.isArray(v)) return v; if (typeof v === "string" && v.trim().startsWith("[")) try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } return []; };
  const toN = (s) => (typeof s === "string" ? s : (s?.업체명 || s?.지명 || s?.주소 || ""));
  const main = (name) => { const ms = [...String(name || "").matchAll(/(\d+)\.\s*([^\d\n.]+)/g)]; return ms.length > 1 ? ms.sort((a, b) => +a[1] - +b[1]).slice(1).map((m) => m[2].trim()) : []; };
  const pV = [...new Set([...sa(rec.경유상차목록 || []), ...sa(rec.경유지_상차 || []), ...sa(rec.경유지상차 || [])].map(toN).filter(Boolean))];
  const dV = [...new Set([...sa(rec.경유하차목록 || []), ...sa(rec.경유지_하차 || []), ...sa(rec.경유지하차 || [])].map(toN).filter(Boolean))];
  return { up: pV.length ? pV : main(rec.상차지명), down: dV.length ? dV : main(rec.하차지명) };
}
export function FareVias({ rec }) {
  const { up, down } = viaNames(rec);
  if (!up.length && !down.length) return null;
  return <div className="text-[11.5px] text-[#5B6B85] mt-0.5 truncate">경유 {[...up.map((n) => `${n}(상)`), ...down.map((n) => `${n}(하)`)].join(" · ")}</div>;
}

// 기록 거르기(전체 · 완전일치 …)
export function FareFilterPills({ records = [], filter, setFilter }) {
  const labels = ["all", "완전일치", "부분일치", "톤수일치", "경로일치"];
  const cnt = {}; records.forEach((r) => { const l = r._match?.label || "경로일치"; cnt[l] = (cnt[l] || 0) + 1; });
  return (
    <div className="flex gap-1.5 flex-wrap mb-3">
      {labels.map((l) => {
        const n = l === "all" ? records.length : cnt[l] || 0;
        if (l !== "all" && !n) return null;
        return <button key={l} type="button" onClick={() => setFilter(l)} className={`h-7 px-2.5 rounded-lg text-[11.5px] font-bold border transition ${filter === l ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#E3E8F0] hover:border-[#2D4C82]"}`}>{l === "all" ? `전체 ${n}` : `${l} ${n}`}</button>;
      })}
    </div>
  );
}
