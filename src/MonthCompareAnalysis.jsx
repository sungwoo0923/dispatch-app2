// ===================== 월 비교 분석 화면 (PC·모바일 공용) =====================
import React, { useMemo, useState, useEffect } from "react";
import { analyzeMonths, buildInsights, COMPARE_DIMS, toWon } from "./monthCompare";

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
  const insights = useMemo(() => buildInsights(res), [res]);
  const { A, B, effects } = res;
  const dimRows = res.dims[dimKey] || [];
  const a = `${Number(monthA.slice(5))}월`, b = `${Number(monthB.slice(5))}월`;

  const monthOptions = months.length ? months : [monthA, monthB];
  const sel = { height: 38, padding: "0 10px", borderRadius: 9, border: "1px solid #cbd5e1", fontSize: 15, fontWeight: 800, color: "#111827", background: "#fff" };
  const card = { background: "#fff", border: "1px solid #e2e7ef", borderRadius: 14, padding: compact ? 14 : 18, minWidth: 0, boxSizing: "border-box" };
  const h = { fontSize: compact ? 16 : 17, fontWeight: 900, color: NAVY, margin: "0 0 10px" };

  const kpis = [
    ["건수", A.cnt, B.cnt, "cnt"], ["매출", A.sale, B.sale], ["운반비", A.driver, B.driver], ["수익", A.profit, B.profit],
    ["수익률", A.rate, B.rate, "rate"], ["건당 매출", A.avgSale, B.avgSale], ["건당 수익", A.avgProfit, B.avgProfit],
  ];
  const effectList = [["물량(건수) 변화", effects.volume], ["건당 매출 변화", effects.price], ["수익률 변화", effects.margin]];
  const maxEff = Math.max(1, ...effectList.map(([, v]) => Math.abs(v)), Math.abs(effects.total));

  const fmtK = (kind, v) => kind === "rate" ? pct(v) : kind === "cnt" ? `${v}건` : won(v);
  const deltaOf = (kind, va, vb) => kind === "rate" ? <Delta v={vb - va} isRate /> : kind === "cnt" ? <Delta v={vb - va} money={false} /> : <Delta v={vb - va} />;
  const kpiCards = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
      {kpis.map(([label, va, vb, kind]) => (
        <div key={label} style={{ ...card, padding: "12px 14px" }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: NAVY }}>{label}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#4b5563", marginTop: 5, whiteSpace: "nowrap" }}>{a} {fmtK(kind, va)}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 2, whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#4b5563" }}>{b}</span>
            <span style={{ fontSize: 17, fontWeight: 900, color: "#111827" }}>{fmtK(kind, vb)}</span>
          </div>
          <div style={{ fontSize: 14, marginTop: 3 }}>{deltaOf(kind, va, vb)}</div>
        </div>
      ))}
    </div>
  );
  const kpiTable = (
    <div style={card}>
      <h3 style={h}>숫자 비교</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ color: NAVY }}>
            {["", a, `${b} (증감)`].map((t, i) => <th key={i} style={{ padding: "6px 4px", textAlign: i ? "right" : "left", fontWeight: 900, borderBottom: "2px solid #e2e7ef" }}>{t}</th>)}
          </tr>
        </thead>
        <tbody>
          {kpis.map(([label, va, vb, kind]) => (
            <tr key={label} style={{ borderBottom: "1px solid #eef1f6" }}>
              <td style={{ padding: "8px 4px", fontWeight: 800, color: "#111827", whiteSpace: "nowrap" }}>{label}</td>
              <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{fmtK(kind, va).replace("원", "")}</td>
              <td style={{ padding: "8px 4px", textAlign: "right", whiteSpace: "nowrap" }}>
                <div style={{ fontWeight: 900, color: "#111827" }}>{fmtK(kind, vb).replace("원", "")}</div>
                <div style={{ fontSize: 12 }}>{deltaOf(kind, va, vb)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: "#4b5563", marginTop: 6 }}>금액 단위: 원</div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99990, background: "rgba(15,23,42,.45)", display: "flex", alignItems: compact ? "stretch" : "center", justifyContent: "center", padding: compact ? 0 : 20, fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif", wordBreak: "keep-all" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#f4f6f9", width: compact ? "100%" : "min(1280px, 100%)", height: compact ? "100%" : "min(92vh, 1100px)", borderRadius: compact ? 0 : 18, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        {/* 헤더 */}
        <div style={{ background: NAVY, padding: compact ? "14px 16px" : "16px 22px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: "#fff", fontSize: compact ? 17 : 19, fontWeight: 900 }}>월 비교 분석</div>
            <div style={{ color: "rgba(255,255,255,.75)", fontSize: 13, fontWeight: 600, marginTop: 2 }}>두 달의 전체 오더를 비교해 매출·수익이 왜 달라졌는지 찾아줍니다</div>
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

        <div style={{ flex: 1, overflowY: "auto", padding: compact ? 12 : 20, display: "flex", flexDirection: "column", gap: compact ? 12 : 16 }}>
          {!compact && kpiCards}
          <div style={{ display: "grid", gridTemplateColumns: compact ? "minmax(0, 1fr)" : "minmax(0, 1.25fr) minmax(0, 1fr)", gap: compact ? 12 : 16, alignItems: "start" }}>
            {/* 분석 요약 */}
            <div style={card}>
              <h3 style={h}>분석 결과</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {insights.map((it, i) => {
                  const t = TONE[it.tone] || TONE.info;
                  return (
                    <div key={i} style={{ background: t.bg, border: `1px solid ${t.border}`, borderLeft: `4px solid ${t.bar}`, borderRadius: 10, padding: "11px 14px" }}>
                      <div style={{ fontSize: 15, fontWeight: 900, color: t.title, marginBottom: 4 }}>{it.title}</div>
                      {it.text && <div style={{ fontSize: 15, fontWeight: 600, color: "#1f2937", lineHeight: 1.6 }}>{it.text}</div>}
                      {it.list && (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, fontWeight: 600, color: "#1f2937", lineHeight: 1.7 }}>
                          {it.list.map((x, j) => <li key={j}>{x}</li>)}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {compact && kpiTable}
            {/* 수익 변화 분해 막대 */}
            <div style={card}>
              <h3 style={h}>수익 변화 원인 ({a} → {b})</h3>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 12 }}>
                {a} 수익 {won(A.profit)} → {b} 수익 {won(B.profit)}
              </div>
              {[...effectList, ["합계", effects.total]].map(([l, v]) => {
                const w = Math.round((Math.abs(v) / maxEff) * 100);
                const pos = v >= 0;
                const total = l === "합계";
                return (
                  <div key={l} style={{ marginBottom: 12, paddingTop: total ? 10 : 0, borderTop: total ? "1px dashed #cbd5e1" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: total ? 900 : 800, color: "#1f2937", marginBottom: 4 }}>
                      <span>{l}</span>
                      <span style={{ color: pos ? "#047857" : "#b91c1c" }}>{pos ? "+" : "−"}{Math.abs(Math.round(v)).toLocaleString()}원</span>
                    </div>
                    <div style={{ height: 12, background: "#eef1f6", borderRadius: 6, position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: 0, bottom: 0, left: pos ? "50%" : `${50 - w / 2}%`, width: `${w / 2}%`, background: pos ? (total ? "#065f46" : "#10b981") : (total ? "#7f1d1d" : "#ef4444"), borderRadius: 6 }} />
                      <div style={{ position: "absolute", top: -2, bottom: -2, left: "50%", width: 2, background: "#94a3b8" }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: 13, fontWeight: 600, color: "#4b5563", lineHeight: 1.6, marginTop: 4 }}>
                · 물량: 오더 건수가 늘거나 줄어든 영향<br />· 건당 매출: 오더 1건당 청구운임 변화 영향<br />· 수익률: 같은 매출에서 남기는 비율(마진) 변화 영향
              </div>
            </div>
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

          {/* 확인 필요 오더 */}
          <div style={card}>
            <h3 style={h}>{b} 확인 필요 오더 ({res.anomaliesB.length}건)</h3>
            {res.anomaliesB.length === 0 ? (
              <div style={{ fontSize: 15, fontWeight: 700, color: "#047857" }}>역마진·운임 미입력·저마진 오더가 없습니다.</div>
            ) : (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
