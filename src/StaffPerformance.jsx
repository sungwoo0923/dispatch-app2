// ===================== 배차담당자별 실적 (관리자 전용) =====================
// ⭐ 담당자(오더 등록자)별 건수·매출·수익·수익률·저마진 건수를 월 단위로 보고 전월과 비교한다.
import React, { useMemo, useState, useEffect } from "react";
import { toWon, creatorOf, useStaffNames } from "./monthCompare";
import { useLoadOrderRange, monthEnd, monthStartAgo } from "./orderHistory";

const NAVY = "#1B2B4B";
const kstMonth = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
const shiftMonth = (m, d) => { const [y, mm] = m.split("-").map(Number); const t = new Date(y, mm - 1 + d, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`; };
const man = (v) => { const a = Math.abs(v); if (a >= 1e8) { const e = Math.floor(a / 1e8), m = Math.round((a - e * 1e8) / 1e4); return `${v < 0 ? "−" : ""}${e}억${m ? ` ${m.toLocaleString()}만` : ""}원`; } return a >= 1e4 ? `${v < 0 ? "−" : ""}${Math.round(a / 1e4).toLocaleString()}만원` : `${Math.round(v).toLocaleString()}원`; };
const pct = (v) => `${(v * 100).toFixed(1)}%`;

function aggregate(list) {
  const m = new Map();
  for (const r of list) {
    const k = r.__fixed ? "고정거래처" : (creatorOf(r) || "미지정");
    if (!m.has(k)) m.set(k, { key: k, cnt: 0, sale: 0, driver: 0, low: 0, neg: 0, clients: new Set() });
    const g = m.get(k);
    const s = toWon(r.청구운임), d = toWon(r.기사운임);
    g.cnt++; g.sale += s; g.driver += d;
    if (s > 0 && s - d > 0 && (s - d) / s < 0.05) g.low++;
    if (s - d <= 0) g.neg++;
    if (r.거래처명) g.clients.add(String(r.거래처명).trim());
  }
  return m;
}

export default function StaffPerformance({ rows = [], isExcluded = () => false, hasExcluded = false, onClose }) {
  // ⭐ 이번 달부터 보여준다(예전엔 지난달로 열리는데 월 선택칸은 이번 달로 보여 "10월인데 9월 실적"으로 보였다)
  const [month, setMonth] = useState(() => kstMonth());
  useLoadOrderRange(monthStartAgo(month, 1), monthEnd(month)); // ★ 고른 달 + 전월(전월 대비)만 불러오기
  const [scope, setScope] = useState(hasExcluded ? "pure" : "all");
  const [sortKey, setSortKey] = useState("profit");
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const months = useMemo(() => [...new Set([kstMonth(), shiftMonth(kstMonth(), -1), ...rows.map((r) => String(r.상차일 || "").slice(0, 7))].filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort().reverse(), [rows]);
  const prev = shiftMonth(month, -1);
  const inScope = (r) => (scope === "all" ? true : !isExcluded(r.거래처명));
  const namesVer = useStaffNames(); // 계정 이메일 → 직원 이름
  const cur = useMemo(() => aggregate(rows.filter((r) => String(r.상차일 || "").startsWith(month) && inScope(r))), [rows, month, scope, namesVer]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = useMemo(() => aggregate(rows.filter((r) => String(r.상차일 || "").startsWith(prev) && inScope(r))), [rows, prev, scope, namesVer]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = [...cur.values()].map((g) => {
    const p = before.get(g.key);
    const profit = g.sale - g.driver;
    return { ...g, profit, rate: g.sale ? profit / g.sale : 0, avgProfit: g.cnt ? profit / g.cnt : 0, prevProfit: p ? p.sale - p.driver : 0, prevCnt: p ? p.cnt : 0, prevRate: p && p.sale ? (p.sale - p.driver) / p.sale : null };
  });
  const sorters = { profit: (x, y) => y.profit - x.profit, sale: (x, y) => y.sale - x.sale, cnt: (x, y) => y.cnt - x.cnt, rate: (x, y) => y.rate - x.rate, low: (x, y) => (y.low + y.neg) - (x.low + x.neg) };
  list.sort(sorters[sortKey]);
  const tot = list.reduce((a, g) => ({ cnt: a.cnt + g.cnt, sale: a.sale + g.sale, driver: a.driver + g.driver, profit: a.profit + g.profit, low: a.low + g.low, neg: a.neg + g.neg }), { cnt: 0, sale: 0, driver: 0, profit: 0, low: 0, neg: 0 });
  const totRate = tot.sale ? tot.profit / tot.sale : 0;
  const maxProfit = Math.max(1, ...list.map((g) => Math.abs(g.profit)));

  const th = { padding: "11px 8px", fontWeight: 900, textAlign: "center", borderBottom: "2px solid #cfd8e5", borderLeft: "1px solid #dfe5ee", whiteSpace: "nowrap", cursor: "pointer" };
  const td = { padding: "10px 8px", textAlign: "center", borderLeft: "1px solid #eef1f6", whiteSpace: "nowrap", fontSize: 15, fontWeight: 700, color: "#111827" };
  const SORTS = [["profit", "수익순"], ["sale", "매출순"], ["cnt", "건수순"], ["rate", "수익률순"], ["low", "저마진 많은순"]];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99990, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif", wordBreak: "keep-all" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#f4f6f9", width: "min(1500px, 100%)", height: "min(95vh, 1200px)", borderRadius: 18, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        <div style={{ background: NAVY, padding: "16px 22px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ color: "#fff", fontSize: 19, fontWeight: 900, flex: 1 }}>배차담당자별 실적 <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.7)", marginLeft: 6 }}>관리자 전용</span></div>
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ height: 36, borderRadius: 8, border: "none", padding: "0 10px", fontSize: 15, fontWeight: 800 }}>
            {(months.length ? months : [month]).map((m) => <option key={m} value={m}>{m.slice(0, 4)}년 {Number(m.slice(5))}월</option>)}
          </select>
          {hasExcluded && (
            <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,.12)", borderRadius: 9, padding: 3 }}>
              {[["pure", "순수 운송"], ["all", "전체"]].map(([k, l]) => (
                <button key={k} onClick={() => setScope(k)} style={{ height: 30, padding: "0 12px", borderRadius: 7, border: "none", background: scope === k ? "#fff" : "transparent", color: scope === k ? NAVY : "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{l}</button>
              ))}
            </div>
          )}
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: "rgba(255,255,255,.85)", fontSize: 24, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, flexShrink: 0 }}>
            {[["담당자 수", `${list.length}명`], ["총 건수", `${tot.cnt.toLocaleString()}건`], ["총 매출", man(tot.sale)], ["총 수익", man(tot.profit)], ["평균 수익률", pct(totRate)], ["저마진·0원 이하", `${(tot.low + tot.neg).toLocaleString()}건`]].map(([l, v]) => (
              <div key={l} style={{ background: "#fff", border: "1px solid #e2e7ef", borderRadius: 12, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#4b5563" }}>{l}</div>
                <div style={{ fontSize: 21, fontWeight: 900, color: "#111827", marginTop: 3 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", border: "1px solid #e2e7ef", borderRadius: 14, padding: 16, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              <span style={{ fontSize: 17, fontWeight: 900, color: NAVY, marginRight: 8 }}>{Number(month.slice(5))}월 담당자별 실적</span>
              {SORTS.map(([k, l]) => (
                <button key={k} onClick={() => setSortKey(k)} style={{ height: 30, padding: "0 12px", borderRadius: 99, border: "1px solid " + (sortKey === k ? NAVY : "#cbd5e1"), background: sortKey === k ? NAVY : "#fff", color: sortKey === k ? "#fff" : "#1f2937", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{l}</button>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#4b5563" }}>담당자 = 오더를 등록한 사람 · 저마진 = 수익률 5% 미만</span>
            </div>
            <div style={{ overflowX: "auto", border: "1px solid #dfe5ee", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1150 }}>
                <thead>
                  <tr style={{ background: "#eef1f6", color: NAVY, fontSize: 14 }}>
                    {["순위", "담당자", "건수", "매출", "기사운임", "수익", "수익률", "건당 수익", "저마진", "수익 0원 이하", "거래처 수", `${Number(prev.slice(5))}월 대비 수익`].map((h, i) => (
                      <th key={h} style={{ ...th, borderLeft: i ? th.borderLeft : "none", cursor: "default", background: h === "수익" ? NAVY : undefined, color: h === "수익" ? "#fff" : undefined }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((g, i) => {
                    const dP = g.profit - g.prevProfit;
                    const lowRate = g.rate < totRate - 0.02;
                    return (
                      <tr key={g.key} style={{ borderTop: "1px solid #eef1f6", background: lowRate ? "#fff7f7" : undefined }}>
                        <td style={{ ...td, borderLeft: "none", color: "#4b5563" }}>{i + 1}</td>
                        <td style={{ ...td, fontWeight: 900 }}>{g.key}</td>
                        <td style={td}>{g.cnt.toLocaleString()}건</td>
                        <td style={td}>{man(g.sale)}</td>
                        <td style={td}>{man(g.driver)}</td>
                        <td style={{ ...td, fontWeight: 900 }}>
                          {man(g.profit)}
                          <div style={{ height: 5, background: "#eef1f6", borderRadius: 3, marginTop: 4 }}><div style={{ width: `${Math.round((Math.abs(g.profit) / maxProfit) * 100)}%`, height: "100%", background: g.profit >= 0 ? NAVY : "#dc2626", borderRadius: 3 }} /></div>
                        </td>
                        <td style={{ ...td, fontWeight: 900, color: lowRate ? "#b91c1c" : "#111827" }}>{pct(g.rate)}</td>
                        <td style={td}>{Math.round(g.avgProfit).toLocaleString()}원</td>
                        <td style={{ ...td, color: g.low ? "#92400e" : "#9ca3af" }}>{g.low}건</td>
                        <td style={{ ...td, color: g.neg ? "#b91c1c" : "#9ca3af" }}>{g.neg}건</td>
                        <td style={td}>{g.clients.size}</td>
                        <td style={{ ...td, color: dP >= 0 ? "#047857" : "#b91c1c", fontWeight: 900 }}>
                          {g.prevCnt ? `${dP >= 0 ? "+" : "−"}${man(Math.abs(dP))}` : "신규"}
                          {g.prevRate != null && <div style={{ fontSize: 12, fontWeight: 700, color: "#4b5563" }}>수익률 {pct(g.prevRate)} → {pct(g.rate)}</div>}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: "2px solid #cfd8e5", background: "#f8f9fb" }}>
                    <td style={{ ...td, borderLeft: "none" }} />
                    <td style={{ ...td, fontWeight: 900 }}>합계</td>
                    <td style={{ ...td, fontWeight: 900 }}>{tot.cnt.toLocaleString()}건</td>
                    <td style={{ ...td, fontWeight: 900 }}>{man(tot.sale)}</td>
                    <td style={{ ...td, fontWeight: 900 }}>{man(tot.driver)}</td>
                    <td style={{ ...td, fontWeight: 900 }}>{man(tot.profit)}</td>
                    <td style={{ ...td, fontWeight: 900 }}>{pct(totRate)}</td>
                    <td style={td}>{tot.cnt ? Math.round(tot.profit / tot.cnt).toLocaleString() : 0}원</td>
                    <td style={td}>{tot.low}건</td>
                    <td style={td}>{tot.neg}건</td>
                    <td style={td} />
                    <td style={td} />
                  </tr>
                </tbody>
              </table>
            </div>
            {list.length === 0 && <div style={{ fontSize: 15, fontWeight: 700, color: "#4b5563", padding: "16px 0", textAlign: "center" }}>이 달에 배차완료 오더가 없습니다.</div>}
            <div style={{ fontSize: 13, fontWeight: 600, color: "#4b5563", marginTop: 8 }}>연한 빨강 행 = 평균 수익률({pct(totRate)})보다 2%p 이상 낮은 담당자</div>
          </div>
        </div>
      </div>
    </div>
  );
}
