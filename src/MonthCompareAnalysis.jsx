// ===================== 월 비교 분석 화면 (PC·모바일 공용) =====================
import React, { useMemo, useState, useEffect } from "react";
import { analyzeMonths, explainGap, COMPARE_DIMS, toWon } from "./monthCompare";

const NAVY = "#1B2B4B";
const won = (v) => `${Math.round(v).toLocaleString()}원`;
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const mLabel = (m) => `${String(m).slice(0, 4)}년 ${Number(String(m).slice(5, 7))}월`;
const shiftMonth = (m, d) => { const [y, mm] = m.split("-").map(Number); const t = new Date(y, mm - 1 + d, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`; };
const kstMonth = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
const TONE = {
  bad: { bg: "#fff5f5", border: "#fecaca", bar: "#b91c1c", title: "#991b1b" },
  warn: { bg: "#fffbeb", border: "#fde68a", bar: "#b45309", title: "#92400e" },
  info: { bg: "#f4f7fb", border: "#d7deea", bar: NAVY, title: NAVY },
};

function Delta({ v, money = true, isRate = false }) {
  if (!v) return <span style={{ color: "#6b7280" }}>-</span>;
  const up = v > 0;
  const txt = isRate ? `${up ? "+" : ""}${(v * 100).toFixed(1)}%p` : `${up ? "+" : "−"}${money ? Math.abs(Math.round(v)).toLocaleString() + "원" : Math.abs(v)}`;
  return <span style={{ color: up ? "#047857" : "#b91c1c", fontWeight: 800 }}>{txt}</span>;
}

// ⭐ 좌우 비교 — 왼쪽 A월, 오른쪽 B월, 마지막 칸 "A월 대비 B월" 증감
function MonthSideBySide({ res, a, b, compact }) {
  const A = res.detailA, B = res.detailB;
  const n = (v) => Math.round(v).toLocaleString();
  const money = (v) => `${n(v)}원`;
  const pctOf = (va, vb) => (va ? ((vb - va) / Math.abs(va)) * 100 : null);
  const diffEl = (va, vb, kind = "money", goodUp = true) => {
    const d = vb - va;
    if (kind === "rate") {
      const p = d * 100;
      if (Math.abs(p) < 0.05) return <span style={{ color: "#6b7280", fontWeight: 800 }}>변동 없음</span>;
      return <span style={{ color: (p > 0) === goodUp ? "#047857" : "#b91c1c", fontWeight: 900 }}>{p > 0 ? "+" : ""}{p.toFixed(1)}%p</span>;
    }
    if (!d) return <span style={{ color: "#6b7280", fontWeight: 800 }}>변동 없음</span>;
    const pc = pctOf(va, vb);
    const color = (d > 0) === goodUp ? "#047857" : "#b91c1c";
    return (
      <span style={{ color, fontWeight: 900, whiteSpace: "nowrap" }}>
        {d > 0 ? "+" : "−"}{kind === "cnt" ? `${n(Math.abs(d))}건` : kind === "num" ? n(Math.abs(d)) : money(Math.abs(d))}
        {pc != null && <span style={{ fontSize: 12, fontWeight: 800, marginLeft: 4 }}>({pc > 0 ? "+" : ""}{pc.toFixed(1)}%)</span>}
      </span>
    );
  };
  const fmt = (v, kind) => kind === "rate" ? `${(v * 100).toFixed(1)}%` : kind === "cnt" ? `${n(v)}건` : kind === "num" ? n(v) : money(v);

  const groups = [
    { title: "기본 실적", rows: [
      ["총 매출 (청구운임)", A.sale, B.sale, "money"],
      ["총 기사운임", A.driver, B.driver, "money", false],
      ["총 수익", A.profit, B.profit, "money"],
      ["수익률", A.rate, B.rate, "rate"],
      ["총 건수", A.cnt, B.cnt, "cnt"],
    ] },
    { title: "건당 평균", rows: [
      ["건당 평균 매출", A.avgSale, B.avgSale, "money"],
      ["건당 평균 기사운임", A.avgDriver, B.avgDriver, "money", false],
      ["건당 평균 수익", A.avgProfit, B.avgProfit, "money"],
    ] },
    { title: "지급방식별 (매출 · 건수)", rows: res.payKeys.map((k) => {
      const pa = A.pay[k] || { cnt: 0, sale: 0, driver: 0 }, pb = B.pay[k] || { cnt: 0, sale: 0, driver: 0 };
      return [k, pa, pb, "pay"];
    }) },
    { title: "손실", rows: [
      ["총 손실금액 (역마진)", A.lossAmt, B.lossAmt, "money", false, `${A.lossCnt}건`, `${B.lossCnt}건`],
      ["└ 청구운임 미입력 운반비", A.noSaleDriver, B.noSaleDriver, "money", false, `${A.noSaleCnt}건`, `${B.noSaleCnt}건`],
    ] },
    { title: "운영", rows: [
      ["운행일수 (오더 있는 날)", A.days, B.days, "num"],
      ["일평균 매출", A.perDaySale, B.perDaySale, "money"],
      ["일평균 건수", A.perDayCnt, B.perDayCnt, "num"],
      ["거래처 수", A.clients, B.clients, "num"],
      ...(A.fixedCnt || B.fixedCnt ? [["고정거래처 매출", A.fixedSale, B.fixedSale, "money", true, `${A.fixedCnt}건`, `${B.fixedCnt}건`]] : []),
    ] },
  ];

  // 좁은 화면: 항목명은 위 한 줄, 아래에 [A월 | B월(증감)] 두 칸
  const cols = compact ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.1fr)";
  const headA = { background: "#eef1f6", color: NAVY }, headB = { background: NAVY, color: "#fff" };
  const valCell = (main, sub, strong) => (
    <div style={{ textAlign: "right", minWidth: 0 }}>
      <div style={{ fontSize: compact ? 14 : 15, fontWeight: strong ? 900 : 700, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{main}</div>
      {sub && <div style={{ fontSize: 12, fontWeight: 700, color: "#4b5563", whiteSpace: "nowrap" }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e7ef", borderRadius: 14, overflow: "hidden", flexShrink: 0 }}>
      {/* 한 줄 요약 */}
      <div style={{ padding: compact ? "12px 14px" : "14px 18px", borderBottom: "1px solid #e2e7ef", display: "flex", flexWrap: "wrap", gap: "6px 16px", alignItems: "baseline" }}>
        <span style={{ fontSize: compact ? 16 : 17, fontWeight: 900, color: NAVY }}>{a} 대비 {b}</span>
        {[["매출", A.sale, B.sale, "money"], ["건수", A.cnt, B.cnt, "cnt"], ["수익", A.profit, B.profit, "money"], ["기사운임", A.driver, B.driver, "money", false]].map(([l, va, vb, k, g]) => (
          <span key={l} style={{ fontSize: 14, fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>{l} {diffEl(va, vb, k, g !== false)}</span>
        ))}
      </div>
      {/* 머리줄 */}
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: compact ? "10px 12px" : "10px 18px", alignItems: "center", borderBottom: "2px solid #e2e7ef" }}>
        {!compact && <span style={{ fontSize: 13, fontWeight: 900, color: "#4b5563" }}>항목</span>}
        <span style={{ ...headA, textAlign: "center", borderRadius: 8, padding: "6px 0", fontSize: 15, fontWeight: 900 }}>{a}</span>
        {compact ? (
          <span style={{ ...headB, textAlign: "center", borderRadius: 8, padding: "6px 0", fontSize: 15, fontWeight: 900 }}>{b} <span style={{ fontSize: 11, opacity: .8 }}>(증감)</span></span>
        ) : (
          <>
            <span style={{ ...headB, textAlign: "center", borderRadius: 8, padding: "6px 0", fontSize: 15, fontWeight: 900 }}>{b}</span>
            <span style={{ textAlign: "center", fontSize: 14, fontWeight: 900, color: NAVY }}>{a} 대비 {b}</span>
          </>
        )}
      </div>
      {groups.filter((g) => g.rows.length).map((g) => (
        <div key={g.title}>
          <div style={{ padding: compact ? "8px 12px 4px" : "10px 18px 4px", fontSize: 13, fontWeight: 900, color: NAVY, background: "#f8f9fb", borderTop: "1px solid #eef1f6" }}>{g.title}</div>
          {g.rows.map(([label, va, vb, kind, goodUp = true, subA, subB]) => {
            const isPay = kind === "pay";
            const mainA = isPay ? (va.cnt ? money(va.sale) : "-") : fmt(va, kind);
            const mainB = isPay ? (vb.cnt ? money(vb.sale) : "-") : fmt(vb, kind);
            const sA = isPay ? (va.cnt ? `${va.cnt}건 · 수익 ${n(va.sale - va.driver)}` : "") : subA;
            const sB = isPay ? (vb.cnt ? `${vb.cnt}건 · 수익 ${n(vb.sale - vb.driver)}` : "") : subB;
            // 지급방식 "손실"처럼 매출이 두 달 다 0원이면 수익(손해) 기준으로 비교
            const payNoSale = isPay && !va.sale && !vb.sale;
            const diff = isPay ? (payNoSale ? diffEl(va.sale - va.driver, vb.sale - vb.driver, "money") : diffEl(va.sale, vb.sale, "money")) : diffEl(va, vb, kind, goodUp);
            const strong = ["총 매출 (청구운임)", "총 수익", "총 손실금액 (역마진)"].includes(label);
            return (
              <div key={label} style={{ display: "grid", gridTemplateColumns: cols, gap: compact ? "2px 10px" : 8, padding: compact ? "8px 12px" : "9px 18px", alignItems: compact ? "start" : "center", borderTop: "1px solid #f1f3f6" }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#1f2937", minWidth: 0, gridColumn: compact ? "1 / -1" : undefined }}>{label}</span>
                {valCell(mainA, sA, strong)}
                {compact ? (
                  <div style={{ textAlign: "right", minWidth: 0 }}>
                    {valCell(mainB, sB, strong)}
                    <div style={{ fontSize: 12 }}>{diff}</div>
                  </div>
                ) : (
                  <>
                    {valCell(mainB, sB, strong)}
                    <div style={{ textAlign: "right", fontSize: 14 }}>
                      {diff}
                      {isPay && (va.cnt || vb.cnt) ? <div style={{ fontSize: 12, fontWeight: 700, color: "#4b5563" }}>건수 {vb.cnt - va.cnt >= 0 ? "+" : "−"}{Math.abs(vb.cnt - va.cnt)}건</div> : null}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// 두 달 비교 행 — PC는 [항목 | A | B] 한 줄, 좁은 화면은 항목 아래 A/B 두 칸
function CompareRows({ items, a, b, compact }) {
  const cell = (c, label) => (
    <div style={{ textAlign: compact ? "left" : "right", background: compact ? "#f8f9fb" : "transparent", borderRadius: 8, padding: compact ? "7px 10px" : 0, minWidth: 0 }}>
      {compact && <div style={{ fontSize: 12, fontWeight: 800, color: "#4b5563" }}>{label}</div>}
      <div style={{ fontSize: 15, fontWeight: 900, color: c.bad ? "#b91c1c" : "#111827", whiteSpace: "nowrap" }}>{c.main}</div>
      {c.sub && <div style={{ fontSize: 12, fontWeight: 700, color: "#4b5563", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</div>}
    </div>
  );
  return (
    <div>
      {!compact && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr)", gap: 12, padding: "8px 10px", background: "#f4f7fb", borderRadius: 8, fontSize: 14, fontWeight: 900, color: NAVY }}>
          <span>구분</span><span style={{ textAlign: "right" }}>{a}</span><span style={{ textAlign: "right" }}>{b}</span>
        </div>
      )}
      {items.map((it) => (
        <div key={it.key} style={{ display: "grid", gridTemplateColumns: compact ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr)", gap: compact ? 6 : 12, padding: compact ? "10px 0" : "10px 10px", borderBottom: "1px solid #eef1f6", alignItems: "start" }}>
          <div style={{ gridColumn: compact ? "1 / -1" : undefined, minWidth: 0 }}>{it.head}</div>
          {cell(it.cells[0], a)}
          {cell(it.cells[1], b)}
        </div>
      ))}
    </div>
  );
}

export default function MonthCompareAnalysis({ rows = [], isExcluded = () => false, hasExcluded = false, onClose, compact = false }) {
  const months = useMemo(() => {
    const s = new Set(rows.map((r) => String(r.상차일 || "").slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)));
    return [...s].sort().reverse();
  }, [rows]);
  // 기본: 지난달 vs 그 전달(이번 달은 아직 진행 중이라 비교가 왜곡됨)
  const [monthB, setMonthB] = useState(() => shiftMonth(kstMonth(), -1));
  const [monthA, setMonthA] = useState(() => shiftMonth(kstMonth(), -2));
  const [scope, setScope] = useState(hasExcluded ? "pure" : "all");
  const [dimKey, setDimKey] = useState("client");
  const [showAllRows, setShowAllRows] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const res = useMemo(() => analyzeMonths({ rows, monthA, monthB, scope, isExcluded }), [rows, monthA, monthB, scope, isExcluded]);
  const gapInfo = useMemo(() => explainGap(res), [res]);
  const [showAnomalyList, setShowAnomalyList] = useState(false);
  const { A } = res;
  const dimRows = res.dims[dimKey] || [];
  const a = `${Number(monthA.slice(5))}월`, b = `${Number(monthB.slice(5))}월`;

  const monthOptions = months.length ? months : [monthA, monthB];
  const sel = { height: 38, padding: "0 10px", borderRadius: 9, border: "1px solid #cbd5e1", fontSize: 15, fontWeight: 800, color: "#111827", background: "#fff" };
  const card = { background: "#fff", border: "1px solid #e2e7ef", borderRadius: 14, padding: compact ? 14 : 18, minWidth: 0, boxSizing: "border-box" };
  const h = { fontSize: compact ? 16 : 17, fontWeight: 900, color: NAVY, margin: "0 0 10px" };


  const anomalyListEl = (
    <div style={{ marginTop: 10 }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: "#eef1f6", color: NAVY }}>
                      {["구분", "상차일", "거래처", "상차지 → 하차지", "청구운임", "기사운임", "수익", "비고"].map((t) => (
                        <th key={t} style={{ padding: "8px 10px", fontWeight: 900, whiteSpace: "nowrap", textAlign: ["청구운임", "기사운임", "수익"].includes(t) ? "right" : "left" }}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {res.anomaliesB.slice(0, 100).map(({ r, an }, i) => {
                      const s = toWon(r.청구운임), d = toWon(r.기사운임);
                      const t = TONE[an.tone];
                      return (
                        <tr key={r._id || i} style={{ borderBottom: "1px solid #eef1f6" }}>
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}><span style={{ fontSize: 12, fontWeight: 900, color: t.title, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 5, padding: "1px 7px" }}>{an.type}</span></td>
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontWeight: 700, color: "#374151" }}>{r.상차일}</td>
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontWeight: 800, color: "#111827" }}>{r.거래처명 || "-"}</td>
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontWeight: 600, color: "#374151" }}>{(r.상차지명 || r.출발지 || "-")} → {(r.하차지명 || r.도착지 || "-")}</td>
                          <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>{s.toLocaleString()}</td>
                          <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>{d.toLocaleString()}</td>
                          <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 900, color: s - d < 0 ? "#b91c1c" : "#111827" }}>{(s - d).toLocaleString()}</td>
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontWeight: 600, color: "#4b5563" }}>{an.note}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {res.anomaliesB.length > 100 && <div style={{ fontSize: 13, color: "#4b5563", marginTop: 6 }}>수익이 낮은 순으로 100건까지 표시</div>}
              </div>
    </div>
  );
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99990, background: "rgba(15,23,42,.45)", display: "flex", alignItems: compact ? "stretch" : "center", justifyContent: "center", padding: compact ? 0 : 20, fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif", wordBreak: "keep-all" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#f4f6f9", width: compact ? "100%" : "min(1280px, 100%)", height: compact ? "100%" : "min(92vh, 1100px)", borderRadius: compact ? 0 : 18, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        {/* 헤더 */}
        <div style={{ background: NAVY, padding: compact ? "14px 16px" : "16px 22px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: "#fff", fontSize: compact ? 17 : 19, fontWeight: 900 }}>월 비교 분석</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: "rgba(255,255,255,.85)", fontSize: 24, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* 조건 */}
        <div style={{ padding: compact ? "12px 16px" : "14px 22px", background: "#fff", borderBottom: "1px solid #e2e7ef", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <select value={monthA} onChange={(e) => setMonthA(e.target.value)} style={sel}>
            {monthOptions.map((m) => <option key={m} value={m}>{mLabel(m)}</option>)}
          </select>
          <span style={{ fontSize: 15, fontWeight: 900, color: "#4b5563" }}>vs</span>
          <select value={monthB} onChange={(e) => setMonthB(e.target.value)} style={sel}>
            {monthOptions.map((m) => <option key={m} value={m}>{mLabel(m)}</option>)}
          </select>
          <div style={{ display: "flex", gap: 4, background: "#eef1f6", borderRadius: 10, padding: 3, marginLeft: compact ? 0 : 8 }}>
            {[["pure", "순수 운송"], ["all", "전체"], ...(hasExcluded ? [["excluded", "제외 거래처"]] : [])].filter(([k]) => hasExcluded || k === "all").map(([k, l]) => (
              <button key={k} onClick={() => setScope(k)} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "none", background: scope === k ? NAVY : "transparent", color: scope === k ? "#fff" : "#374151", fontSize: 14, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>{l}</button>
            ))}
          </div>
        </div>

        {/* ⭐ 버그수정 — 세로 flex 스크롤 영역 안에서 overflow:hidden 카드(좌우 비교표)가
            높이 0 근처로 찌그러져 얇은 선처럼만 보였다. 자식이 줄어들지 않게 고정한다. */}
        <style>{`.mca-scroll > * { flex-shrink: 0; }`}</style>
        <div className="mca-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: compact ? 12 : 20, display: "flex", flexDirection: "column", gap: compact ? 12 : 16 }}>
          <MonthSideBySide res={res} a={a} b={b} compact={compact} />

          {/* ⭐ 왜 차이가 났나 — 한 줄 결론 + 덜 번 금액을 원인별로(합계가 정확히 맞음) */}
          <div style={card}>
            <div style={{ fontSize: compact ? 18 : 20, fontWeight: 900, color: "#111827", lineHeight: 1.45 }}>{gapInfo.headline}</div>
            <div style={{ fontSize: compact ? 15 : 16, fontWeight: 700, color: "#1f2937", lineHeight: 1.6, marginTop: 8, background: gapInfo.gap < 0 ? "#fff5f5" : "#f0fdf4", border: `1px solid ${gapInfo.gap < 0 ? "#fecaca" : "#bbf7d0"}`, borderRadius: 10, padding: "10px 14px" }}>
              {gapInfo.why}
            </div>
            {gapInfo.reasons.length > 0 && (
              <>
                <div style={{ fontSize: 16, fontWeight: 900, color: NAVY, margin: "16px 0 8px" }}>
                  {gapInfo.gap < 0 ? `덜 번 ${Math.round(-gapInfo.gap).toLocaleString()}원, 어디서 생겼나 (큰 순서)` : "원인별 금액"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {gapInfo.reasons.map((r, i) => {
                    const neg = r.amount < 0;
                    const w = gapInfo.gap ? Math.min(100, Math.round((Math.abs(r.amount) / Math.abs(gapInfo.gap)) * 100)) : 0;
                    return (
                      <div key={i} style={{ border: "1px solid #e2e7ef", borderRadius: 10, padding: "10px 12px", background: "#fff" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontSize: 15, fontWeight: 900, color: "#111827", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i + 1}. {r.label}</span>
                          <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 900, color: neg ? "#b91c1c" : "#047857", whiteSpace: "nowrap" }}>{neg ? "−" : "+"}{Math.abs(Math.round(r.amount)).toLocaleString()}원</span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginTop: 3 }}>{r.desc}</div>
                        <div style={{ height: 6, background: "#eef1f6", borderRadius: 4, marginTop: 7, overflow: "hidden" }}>
                          <div style={{ width: `${w}%`, height: "100%", background: neg ? "#ef4444" : "#10b981", borderRadius: 4 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>


          {/* 확인 필요 오더 — 두 달 건수·금액 비교 */}
          <div style={card}>
            <h3 style={h}>확인이 필요한 오더 ({a} vs {b})</h3>
            <CompareRows
              compact={compact}
              a={a} b={b}
              items={res.anomalySummary.map((t) => ({
                key: t.type,
                head: <>
                  <span style={{ fontSize: 13, fontWeight: 900, color: TONE[t.tone].title, background: TONE[t.tone].bg, border: `1px solid ${TONE[t.tone].border}`, borderRadius: 5, padding: "1px 7px", whiteSpace: "nowrap" }}>{t.type}</span>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#4b5563", marginTop: 4 }}>{t.desc}</div>
                </>,
                cells: [t.a, t.b].map((v, k) => ({
                  main: `${v.cnt}건`,
                  sub: `${t.amountLabel} ${Math.round(v.amount).toLocaleString()}원`,
                  bad: k === 1 && t.b.cnt > t.a.cnt,
                })),
              }))}
            />
            {res.anomaliesB.length > 0 && (
              <button onClick={() => setShowAnomalyList((v) => !v)} style={{ marginTop: 10, height: 34, padding: "0 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: NAVY, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                {showAnomalyList ? "목록 접기" : `${b} 오더 목록 보기 (${res.anomaliesB.length}건)`}
              </button>
            )}
            {showAnomalyList && anomalyListEl}
          </div>

          {/* 매출관리(순수 운송)에서 빠지는 거래처 */}
          <div style={card}>
            <h3 style={h}>매출관리(순수 운송)에 포함되지 않는 거래처</h3>
            {res.excludedClients.length === 0 ? (
              <div style={{ fontSize: 15, fontWeight: 700, color: "#374151" }}>{a}·{b}에는 순수 운송에서 빠지는 거래처 오더가 없습니다.</div>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#4b5563", marginBottom: 8 }}>거래처관리에서 "순수 운송료 매출 통계에서 제외"가 켜진 거래처입니다. "순수 운송" 숫자에는 들어가지 않고 "전체"에만 들어갑니다.</div>
                <CompareRows
                  compact={compact}
                  a={a} b={b}
                  items={res.excludedClients.map((g) => ({
                    key: g.key,
                    head: <span style={{ fontSize: 15, fontWeight: 900, color: "#111827" }}>{g.key}</span>,
                    cells: [g.a, g.b].map((v) => ({
                      main: v.cnt ? won(v.sale) : "-",
                      sub: v.cnt ? `수익 ${won(v.profit)} · ${v.cnt}건` : "",
                    })),
                  }))}
                />
              </>
            )}
          </div>

          {/* 항목별 비교 */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <h3 style={{ ...h, margin: 0 }}>항목별 비교</h3>
              <div style={{ display: "flex", gap: 4, overflowX: "auto", scrollbarWidth: "none", maxWidth: "100%" }}>
                {COMPARE_DIMS.map((d) => (
                  <button key={d.key} onClick={() => { setDimKey(d.key); setShowAllRows(false); }} style={{ height: 32, padding: "0 12px", borderRadius: 99, border: "1px solid " + (dimKey === d.key ? NAVY : "#cbd5e1"), background: dimKey === d.key ? NAVY : "#fff", color: dimKey === d.key ? "#fff" : "#1f2937", fontSize: 14, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{d.label}</button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#4b5563", marginBottom: 8 }}>"수익률 영향"은 {b} 매출을 {a} 평균 수익률({pct(A.rate)})로 벌었다면 대비 얼마나 덜/더 벌었는지입니다. 빨간 항목부터 확인하세요.</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 760 }}>
                <thead>
                  <tr style={{ background: NAVY, color: "#fff" }}>
                    {["항목", `${a} 매출`, `${a} 수익률`, `${b} 매출`, `${b} 수익률`, "매출 증감", "수익 증감", "수익률 영향"].map((t) => (
                      <th key={t} style={{ padding: "9px 10px", fontWeight: 800, whiteSpace: "nowrap", textAlign: t === "항목" ? "left" : "right" }}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(showAllRows ? dimRows : dimRows.slice(0, 15)).map((g) => (
                    <tr key={g.key} style={{ borderBottom: "1px solid #eef1f6" }}>
                      <td style={{ padding: "9px 10px", fontWeight: 800, color: "#111827", whiteSpace: "nowrap" }}>
                        {g.key}
                        {g.isNew && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: NAVY, background: "#eef1f6", borderRadius: 4, padding: "1px 5px" }}>신규</span>}
                        {g.isGone && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: "#6b7280", background: "#f1f3f6", borderRadius: 4, padding: "1px 5px" }}>{b} 없음</span>}
                      </td>
                      <td style={{ padding: "9px 10px", textAlign: "right", color: "#374151", fontWeight: 600 }}>{g.a.sale ? won(g.a.sale) : "-"}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", color: "#374151", fontWeight: 600 }}>{g.a.sale ? pct(g.a.rate) : "-"}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", color: "#111827", fontWeight: 800 }}>{g.b.sale ? won(g.b.sale) : "-"}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 800, color: g.b.sale && g.b.rate < A.rate ? "#b91c1c" : "#111827" }}>{g.b.sale ? pct(g.b.rate) : "-"}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right" }}><Delta v={g.dSale} /></td>
                      <td style={{ padding: "9px 10px", textAlign: "right" }}><Delta v={g.dProfit} /></td>
                      <td style={{ padding: "9px 10px", textAlign: "right" }}><Delta v={Math.round(g.marginImpact)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dimRows.length > 15 && (
              <button onClick={() => setShowAllRows((v) => !v)} style={{ marginTop: 10, height: 34, padding: "0 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: NAVY, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                {showAllRows ? "접기" : `전체 ${dimRows.length}개 보기`}
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
