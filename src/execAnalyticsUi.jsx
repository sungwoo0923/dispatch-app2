// ======================= src/execAnalyticsUi.jsx =======================
// 👑 2026-11-17 경영 분석 · 결재 대기 전용 부품(임원 디자인 시스템 src/execUi.jsx 위에 얹는 것만)
//  · 결론 한 줄(Brief) · 필터 줄(Toolbar) · 근거 문구(Basis) · 정렬 표(SortTable — 좁은 화면은 카드) · 그래프 툴팁(TipBox) · 대화상자(Modal)
//  · 금액 표기: 패널 안은 "만원" 하나로(fmtMan) — 핵심 숫자 타일만 자동(억 · 만)
import React from "react";
import { EX, EX_NUM, GOLD_GRAD, Eyebrow, Empty } from "./execUi";

// ── 숫자 ──
const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
// 만원 숫자(음수는 정식 빼기표 −)
export const mn = (v) => { const x = Math.round(n0(v) / 1e4); return `${x < 0 ? "−" : ""}${Math.abs(x).toLocaleString("ko-KR")}`; };
export const cm = (v) => { const x = Math.round(n0(v)); return `${x < 0 ? "−" : ""}${Math.abs(x).toLocaleString("ko-KR")}`; };
// 단가처럼 작은 금액 — 만원 소수 한 자리(35.7)
export const mn1 = (v) => { const x = n0(v) / 1e4; return `${x < 0 ? "−" : ""}${Math.abs(x).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`; };
// 핵심 숫자 타일 금액 — 1억 이상은 억원 소수 두 자리(5.40 · 4.72 처럼 자릿수 고정), 그 아래는 만원
export const km = (v) => { const x = n0(v); const a = Math.abs(x); const s = x < 0 ? "−" : ""; if (a >= 1e8) return { value: `${s}${(a / 1e8).toFixed(a >= 1e10 ? 0 : 2)}`, unit: "억원" }; if (a >= 1e4) return { value: `${s}${Math.round(a / 1e4).toLocaleString("ko-KR")}`, unit: "만원" }; return { value: `${s}${Math.round(a).toLocaleString("ko-KR")}`, unit: "원" }; };
// 📏 2026-11-27 시뮬레이션 — 매출이 거의 없는 달에 판관비가 커서 "영업이익률 −3222.7%" 같은 값이 그대로 나왔다.
//  ±999% 를 넘으면 숫자 대신 "−999% 아래" 로 줄여 보여 준다(금액은 영업이익 칸에 그대로)
export const pct = (v, dp = 1) => (v == null || !Number.isFinite(v) ? "—" : Math.abs(v) > 999 ? (v < 0 ? "−999% 아래" : "999% 넘음") : `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(dp)}%`);
// 이익 · 이익률 색 — 플러스 빨강 · 마이너스 파랑(앱 전체 규칙)
export const pc = (v) => (v > 0 ? EX.up : v < 0 ? EX.down : EX.sub);

// ── 결론 한 줄 ──
export function Brief({ children, basis, tone = "gold" }) {
  const c = tone === "warn" ? EX.warn : EX.gold;
  return (
    <section className="relative rounded-[20px] px-4 md:px-6 py-4 md:py-[18px] flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-6 overflow-hidden"
      style={{ background: `linear-gradient(100deg, ${tone === "warn" ? "rgba(245,196,107,.12)" : "rgba(215,188,130,.10)"}, rgba(255,255,255,.025) 60%)`, border: `1px solid ${tone === "warn" ? "rgba(245,196,107,.35)" : EX.lineHi}` }}>
      <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: tone === "warn" ? EX.warn : GOLD_GRAD }} />
      <div className="min-w-0 flex-1">
        <Eyebrow color={c} size={10}>{tone === "warn" ? "ATTENTION" : "BRIEFING"}</Eyebrow>
        <p className="mt-1 text-[14.5px] md:text-[15.5px] font-bold leading-relaxed" style={{ color: EX.text, wordBreak: "keep-all" }}>{children}</p>
      </div>
      {basis && <div className="shrink-0 text-[12px] font-semibold lg:text-right" style={{ color: EX.mute }}>{basis}</div>}
    </section>
  );
}
// 강조 숫자(문장 안)
export const B = ({ children, color }) => <b style={{ ...EX_NUM, color: color || EX.goldHi, fontWeight: 900 }}>{children}</b>;

// ── 필터 줄 ──
export function Toolbar({ children, basis }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
      <div className="flex flex-wrap items-center gap-2 min-w-0">{children}</div>
      {basis && <div className="md:ml-auto text-[12.5px] font-semibold" style={{ color: EX.mute }}>{basis}</div>}
    </div>
  );
}
// 근거 · 가정 문구(패널 맨 아래 작은 글씨)
export function Basis({ children, className = "mt-4" }) {
  return <p className={`${className} text-[12px] leading-[1.7] font-medium`} style={{ color: EX.mute, wordBreak: "keep-all" }}>{children}</p>;
}
// 작은 소제목(패널 안)
export function SubHead({ children, right }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mt-5 mb-2">
      <div className="text-[13px] font-extrabold tracking-[-0.01em]" style={{ color: EX.sub }}>{children}</div>
      {right && <div className="text-[12px] font-semibold" style={{ color: EX.mute }}>{right}</div>}
    </div>
  );
}
// 작은 숫자 칸(상세 안)
export function MiniStat({ label, value, unit, color, foot }) {
  return (
    <div className="rounded-2xl px-3.5 py-3 min-w-0" style={{ background: "rgba(255,255,255,.035)", border: `1px solid ${EX.line}` }}>
      <div className="text-[12px] font-bold truncate" style={{ color: EX.mute }}>{label}</div>
      <div className="mt-1 flex items-baseline gap-1 whitespace-nowrap" style={EX_NUM}>
        <span className="text-[20px] font-black tracking-[-0.02em]" style={{ color: color || EX.text }}>{value}</span>
        {unit && <span className="text-[12px] font-bold" style={{ color: EX.mute }}>{unit}</span>}
      </div>
      {foot && <div className="mt-1 text-[12px] font-semibold" style={{ color: EX.mute }}>{foot}</div>}
    </div>
  );
}
// 구분선 있는 줄 목록
export function Rows({ children, className = "" }) {
  return <div className={`divide-y ${className}`} style={{ borderColor: EX.line }}>{React.Children.toArray(children).map((c, i) => <div key={i} style={{ borderTop: i ? "1px solid rgba(255,255,255,.06)" : 0 }}>{c}</div>)}</div>;
}

// ── 그래프 툴팁 ──
export function TipBox({ title, rows = [], foot }) {
  return (
    <div className="rounded-xl px-3.5 py-2.5 text-[12.5px] shadow-2xl min-w-[170px]" style={{ background: "rgba(8,14,30,.96)", border: `1px solid ${EX.lineHi}`, color: EX.text, ...EX_NUM }}>
      <div className="mb-1.5 text-[12px] font-extrabold" style={{ color: EX.gold }}>{title}</div>
      {rows.filter(Boolean).map(([l, c, v, vc]) => (
        <div key={l} className="flex items-center justify-between gap-5 leading-6">
          <span className="inline-flex items-center gap-1.5" style={{ color: EX.sub }}>{c && <span className="w-2 h-2 rounded-full" style={{ background: c }} />}{l}</span>
          <b className="font-black" style={{ color: vc || EX.text }}>{v}</b>
        </div>
      ))}
      {foot && <div className="mt-1 text-[11.5px] font-semibold" style={{ color: EX.mute }}>{foot}</div>}
    </div>
  );
}

// ── 정렬 표 — 넓은 화면은 표, 좁은 화면(640 미만)은 카드 ──
//  cols: [{ k, l, num, get, cell, sort:false, short, hideCompact, w }]
export function SortTable({ cols, rows, sort, setSort, onRow, selKey, rowKey = (r) => r.n, compact, limit = 0, testId, maxHeight = 600 }) {
  const sorted = React.useMemo(() => {
    const c = cols.find((x) => x.k === sort.k); if (!c) return rows;
    const g = c.get || ((r) => r[c.k]);
    return [...rows].sort((a, b) => { const x = g(a), y = g(b); const v = typeof x === "string" ? String(x).localeCompare(String(y), "ko") : (x ?? -Infinity) - (y ?? -Infinity); return sort.dir === "asc" ? v : -v; });
  }, [rows, cols, sort]);
  const [more, setMore] = React.useState(false);
  const cap = limit || (compact && !more ? 10 : 0);
  const shown = cap ? sorted.slice(0, cap) : sorted;
  const cell = (c, r) => (c.cell ? c.cell(r) : r[c.k]);
  const flip = (k) => setSort({ k, dir: sort.k === k && sort.dir === "desc" ? "asc" : "desc" });
  if (!rows.length) return <Empty text="표시할 자료가 없습니다" />;
  if (compact) {
    const sc = cols.filter((c) => c.sort !== false && c.num).slice(0, 4);
    return (
      <div data-testid={testId}>
        {sc.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className="text-[12px] font-bold mr-1" style={{ color: EX.mute }}>정렬</span>
            {sc.map((c) => { const on = sort.k === c.k; return <button key={c.k} type="button" onClick={() => flip(c.k)} className="h-9 px-3 rounded-xl text-[12.5px] font-extrabold" style={on ? { background: "rgba(215,188,130,.16)", color: EX.goldHi, border: `1px solid ${EX.lineHi}` } : { color: EX.sub, border: `1px solid ${EX.line}` }}>{c.short || c.l}{on ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</button>; })}
          </div>
        )}
        {shown.map((r) => {
          const k = rowKey(r); const Tag = onRow ? "button" : "div"; const on = selKey === k;
          return (
            <Tag key={k} type={onRow ? "button" : undefined} onClick={onRow ? () => onRow(r) : undefined} className="block w-full text-left py-3 px-1"
              style={{ borderTop: "1px solid rgba(255,255,255,.06)", background: on ? "rgba(215,188,130,.07)" : "transparent" }}>
              <div className="flex items-baseline justify-between gap-3 min-w-0">
                <div className="min-w-0 truncate text-[14.5px] font-extrabold" style={{ color: EX.text }}>{cell(cols[0], r)}</div>
                {cols[1] && <div className="shrink-0 text-[14.5px] font-black" style={{ ...EX_NUM, color: EX.text }}>{cell(cols[1], r)}</div>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">
                {cols.slice(2).filter((c) => !c.hideCompact).map((c) => (
                  <div key={c.k} className="flex justify-between gap-2 min-w-0"><span style={{ color: EX.mute }}>{c.short || c.l}</span><span className="font-bold whitespace-nowrap" style={{ ...EX_NUM, color: EX.text }}>{cell(c, r)}</span></div>
                ))}
              </div>
            </Tag>
          );
        })}
        {!limit && sorted.length > shown.length && <button type="button" onClick={() => setMore(true)} className="mt-2 w-full h-11 rounded-xl text-[13px] font-extrabold" style={{ color: EX.goldHi, border: `1px solid ${EX.lineHi}`, background: "rgba(215,188,130,.06)" }}>전체 {sorted.length}개 보기</button>}
      </div>
    );
  }
  return (
    <div data-testid={testId} className="overflow-x-auto -mx-1" style={{ maxHeight: limit ? undefined : maxHeight, overflowY: limit ? undefined : "auto" }}>
      <table className="kp-plain kp-exec-table w-full text-[13.5px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
        <thead>
          <tr>
            {cols.map((c) => {
              const on = sort.k === c.k;
              return (
                <th key={c.k} className={`sticky top-0 z-[1] px-3 py-2.5 text-[11.5px] font-extrabold tracking-[0.03em] whitespace-nowrap ${c.num ? "text-right" : "text-left"}`}
                  style={{ color: on ? EX.goldHi : EX.mute, background: "#0B1530", borderBottom: `1px solid ${EX.line}`, width: c.w }} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                  {c.sort === false ? c.l : <button type="button" onClick={() => flip(c.k)} className="inline-flex items-center gap-1 hover:brightness-125">{c.l}<span style={{ fontSize: 9, color: on ? EX.gold : EX.faint }}>{on && sort.dir === "asc" ? "▲" : "▼"}</span></button>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const k = rowKey(r); const on = selKey === k;
            return (
              <tr key={k} onClick={onRow ? () => onRow(r) : undefined} className={onRow ? "cursor-pointer hover:bg-white/[0.04]" : ""} style={on ? { background: "rgba(215,188,130,.08)" } : undefined}>
                {cols.map((c, ci) => (
                  <td key={c.k} className={`px-3 py-[11px] whitespace-nowrap ${c.num ? "text-right" : "text-left"}`}
                    style={{ ...(c.num ? EX_NUM : null), color: EX.text, borderBottom: "1px solid rgba(255,255,255,.05)", boxShadow: on && ci === 0 ? `inset 3px 0 0 ${EX.gold}` : undefined }}>{cell(c, r)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 대화상자(어두운 유리) ──
export function Modal({ label, onClose, compact, width = 880, children, testId }) {
  React.useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div data-kp-dialog role="dialog" aria-modal="true" aria-label={label} data-testid={testId} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 2147483400, background: "rgba(3,7,16,.66)", backdropFilter: "blur(4px)", display: "flex", alignItems: compact ? "flex-end" : "center", justifyContent: "center", padding: compact ? 0 : 24 }}>
      <div className="relative overflow-auto" style={{ width: `min(${width}px,100%)`, maxHeight: compact ? "92vh" : "90vh", padding: compact ? 18 : 28, borderRadius: compact ? "24px 24px 0 0" : 24, background: `linear-gradient(180deg, ${EX.bg2}, ${EX.bg1})`, border: `1px solid ${EX.lineHi}`, boxShadow: "0 40px 80px rgba(0,0,0,.5)", color: EX.text }}>
        <div className="absolute top-0 left-8 right-8 h-px" style={{ background: GOLD_GRAD }} />
        {children}
      </div>
    </div>
  );
}
// 결재 문서 원본(흰 종이) — 문서 미리보기는 원래 모양 그대로 종이 위에
export function Paper({ children }) {
  return <div className="rounded-2xl p-3 md:p-5" style={{ background: "#fff", color: "#111827", boxShadow: "0 12px 30px rgba(0,0,0,.35)" }}>{children}</div>;
}
