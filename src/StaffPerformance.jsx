// ===================== 배차담당자별 실적 (관리자 전용) =====================
// ⭐ 담당자(오더 등록자)별 건수·매출·수익·수익률·저마진 건수를 월 단위로 보고 전월과 비교한다.
import React, { useMemo, useState, useEffect } from "react";
import { toWon, creatorOf, useStaffNames } from "./monthCompare";
import { useLoadOrderRange, monthEnd, monthStartAgo } from "./orderHistory";
import { CustomSelect } from "./CustomSelect";

const NAVY = "#1B2B4B";
const kstMonth = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
const shiftMonth = (m, d) => { const [y, mm] = m.split("-").map(Number); const t = new Date(y, mm - 1 + d, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`; };
const man = (v) => { const a = Math.abs(v); if (a >= 1e8) { const e = Math.floor(a / 1e8), m = Math.round((a - e * 1e8) / 1e4); return `${v < 0 ? "−" : ""}${e}억${m ? ` ${m.toLocaleString()}만` : ""}원`; } return a >= 1e4 ? `${v < 0 ? "−" : ""}${Math.round(a / 1e4).toLocaleString()}만원` : `${Math.round(v).toLocaleString()}원`; };
const pct = (v) => `${(v * 100).toFixed(1)}%`;

function aggregate(list) {
  const m = new Map();
  for (const r of list) {
    const k = r.__fixed ? "고정거래처" : (creatorOf(r) || "미지정");
    if (k === "최고관리자") continue; // ⭐ 2026-11-03 최고관리자 계정은 담당자 실적에서 뺌
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
    <div style={{ position: "fixed", inset: 0, zIndex: 99990, background: "rgba(11,20,40,.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif", wordBreak: "keep-all" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#F4F7FB", width: "min(1500px, 100%)", height: "min(95vh, 1200px)", borderRadius: 22, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 30px 80px rgba(11,20,40,.45)" }}>
        <div style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)", padding: "18px 24px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* ⭐ 2026-11-07 디자인 통일 — 다른 경영 창과 같은 남색 그라데이션 머리말 · 영어 머리표 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Noto Sans KR',sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: "0.24em", textTransform: "uppercase", color: "#8FB0F0" }}>Revenue · Staff Performance</div>
            <div style={{ color: "#fff", fontSize: 20, fontWeight: 900, marginTop: 2 }}>배차담당자별 실적 <span style={{ fontSize: 13, fontWeight: 800, color: "#C9D6EE", marginLeft: 6, border: "1px solid rgba(143,176,240,.4)", borderRadius: 99, padding: "1px 9px", verticalAlign: "middle" }}>관리자 전용</span></div>
          </div>
          <CustomSelect value={month} onChange={(e) => setMonth(e.target.value)} style={{ height: 38, borderRadius: 11, border: "none", padding: "0 26px 0 10px", fontSize: 15, fontWeight: 800, background: "#fff", color: "#0F1A30" }}>
            {(months.length ? months : [month]).map((m) => <option key={m} value={m}>{m.slice(0, 4)}년 {Number(m.slice(5))}월</option>)}
          </CustomSelect>
          {hasExcluded && (
            <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,.1)", borderRadius: 12, padding: 4 }}>
              {[["pure", "순수 운송"], ["all", "전체"]].map(([k, l]) => (
                <button key={k} onClick={() => setScope(k)} style={{ height: 30, padding: "0 12px", borderRadius: 7, border: "none", background: scope === k ? "#fff" : "transparent", color: scope === k ? NAVY : "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{l}</button>
              ))}
            </div>
          )}
          <button onClick={onClose} aria-label="닫기" title="닫기" style={{ width: 38, height: 38, borderRadius: 11, border: "1px solid rgba(143,176,240,.35)", background: "rgba(255,255,255,.06)", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, flexShrink: 0 }}>
            {[["담당자 수", `${list.length}명`], ["총 건수", `${tot.cnt.toLocaleString()}건`], ["총 매출", man(tot.sale)], ["총 수익", man(tot.profit)], ["평균 수익률", pct(totRate)], ["저마진·0원 이하", `${(tot.low + tot.neg).toLocaleString()}건`]].map(([l, v]) => (
              <div key={l} style={{ background: "#fff", border: "1px solid #E3E8F0", borderRadius: 16, padding: "14px 16px", textAlign: "left", boxShadow: "0 1px 2px rgba(15,26,48,.04)" }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: "#5B6B86" }}>{l}</div>
                <div style={{ fontSize: 23, fontWeight: 900, color: "#0F1A30", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", border: "1px solid #E3E8F0", borderRadius: 16, padding: 20, flexShrink: 0, boxShadow: "0 1px 2px rgba(15,26,48,.04)" }}>
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
                          <div style={{ height: 5, background: "#eef1f6", borderRadius: 3, marginTop: 4 }}><div style={{ width: `${Math.round((Math.abs(g.profit) / maxProfit) * 100)}%`, height: "100%", background: g.profit >= 0 ? NAVY : "#D92D20", borderRadius: 3 }} /></div>
                        </td>
                        <td style={{ ...td, fontWeight: 900, color: lowRate ? "#D92D20" : "#0F1A30" }}>{pct(g.rate)}</td>
                        <td style={td}>{Math.round(g.avgProfit).toLocaleString()}원</td>
                        <td style={{ ...td, color: g.low ? "#2D4C82" : "#9AA8C2" }}>{g.low}건</td>
                        <td style={{ ...td, color: g.neg ? "#D92D20" : "#9AA8C2" }}>{g.neg}건</td>
                        <td style={td}>{g.clients.size}</td>
                        <td style={{ ...td, color: !g.prevCnt ? "#2D4C82" : dP > 0 ? "#D92D20" : dP < 0 ? "#1E5BD8" : "#6B7588", fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
                          {g.prevCnt ? `${dP > 0 ? "▲ +" : dP < 0 ? "▼ −" : ""}${man(Math.abs(dP))}` : "신규"}
                          {g.prevRate != null && <div style={{ fontSize: 13, fontWeight: 700, color: "#5B6B86" }}>수익률 {pct(g.prevRate)} → {pct(g.rate)}</div>}
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
