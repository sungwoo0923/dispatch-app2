// ======================= src/MonthlyReport.jsx =======================
// 📊 월간 경영 보고서(예전 "매익률 원인 보고서" 자리) — 운송사라면 매달 꼭 보는 숫자를 한 장으로.
//  ① 전월 대비 핵심 지표(건수·매출·수익·수익률·건당 수익)
//  ② 거래처: 매출 TOP 10(전월 대비 증감) · 신규 거래처 · 이번 달 끊긴 거래처
//  ③ 차량 톤수별 수익성 · 요일별 물량(배차 인력 계획용) · 일별 추이
//  ④ 리스크: 손실·저마진(5% 미만) 오더, 미배차로 남은 오더, 미정산 매출
//  인쇄/PDF는 브라우저 인쇄로 그대로.
import React, { useMemo, useState } from "react";
import { statsOf, toWon } from "./monthCompare";
import { useLoadOrderRange, monthEnd, monthStartAgo } from "./orderHistory";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const kstMonth = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
const shiftMonth = (m, d) => { const [y, mm] = m.split("-").map(Number); const t = new Date(y, mm - 1 + d, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`; };
const won = (n) => `${Math.round(n || 0).toLocaleString("ko-KR")}`;
const man = (v) => { const a = Math.abs(v); return a >= 1e4 ? `${v < 0 ? "−" : ""}${Math.round(a / 1e4).toLocaleString()}만` : `${Math.round(v).toLocaleString()}`; };
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const DONE = (r) => !["배차취소", "취소", "오더취소", "취소됨"].includes(r.배차상태 || r.상태 || "");

function Delta({ a, b, money, rate }) {
  const d = b - a;
  if (!a && !b) return <span style={{ color: "#9AA9C3" }}>-</span>;
  const s = rate ? `${d >= 0 ? "▲" : "▼"} ${Math.abs(d * 100).toFixed(1)}%p` : `${d >= 0 ? "▲" : "▼"} ${money ? man(Math.abs(d)) : Math.abs(d).toLocaleString()}${!rate && a ? ` (${d >= 0 ? "+" : "−"}${Math.abs((d / a) * 100).toFixed(0)}%)` : ""}`;
  return <span style={{ fontWeight: 900, color: d >= 0 ? "#1B2B4B" : "#7A89A3" }}>{s}</span>;
}

export default function MonthlyReport({ rows = [], isExcluded = () => false, hasExcluded = false, onClose }) {
  const [month, setMonth] = useState(kstMonth());
  const prev = shiftMonth(month, -1);
  useLoadOrderRange(monthStartAgo(month, 1), monthEnd(month));
  const [scope, setScope] = useState(hasExcluded ? "pure" : "all");
  const inScope = (r) => scope === "all" || !isExcluded(r.거래처명);
  const A = useMemo(() => rows.filter((r) => String(r.상차일 || "").startsWith(prev) && inScope(r) && DONE(r)), [rows, prev, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const B = useMemo(() => rows.filter((r) => String(r.상차일 || "").startsWith(month) && inScope(r) && DONE(r)), [rows, month, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const sa = statsOf(A), sb = statsOf(B);
  const months = useMemo(() => [...new Set([kstMonth(), shiftMonth(kstMonth(), -1), ...rows.map((r) => String(r.상차일 || "").slice(0, 7))].filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort().reverse().slice(0, 24), [rows]);

  const byKey = (list, key) => { const m = new Map(); list.forEach((r) => { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; };
  const clientA = byKey(A, (r) => String(r.거래처명 || "").trim() || "(미입력)");
  const clientB = byKey(B, (r) => String(r.거래처명 || "").trim() || "(미입력)");
  const topClients = [...clientB.entries()].map(([k, l]) => ({ k, s: statsOf(l), p: statsOf(clientA.get(k) || []) })).sort((x, y) => y.s.sale - x.s.sale).slice(0, 10);
  const newClients = [...clientB.keys()].filter((k) => !clientA.has(k));
  const lostClients = [...clientA.entries()].filter(([k]) => !clientB.has(k)).map(([k, l]) => ({ k, s: statsOf(l) })).sort((x, y) => y.s.sale - x.s.sale);
  const tonOf = (r) => String(r.차량톤수 || r.톤수 || "").trim() || "미지정";
  const tons = [...byKey(B, tonOf).entries()].map(([k, l]) => ({ k, s: statsOf(l) })).sort((x, y) => (parseFloat(x.k) || 99) - (parseFloat(y.k) || 99));
  const dow = DAYS.map((d, i) => ({ d, n: B.filter((r) => r.상차일 && new Date(`${r.상차일}T00:00:00`).getDay() === i).length }));
  const maxDow = Math.max(1, ...dow.map((x) => x.n));
  const daily = (() => { const m = {}; B.forEach((r) => { const d = String(r.상차일).slice(8, 10); m[d] = (m[d] || 0) + toWon(r.청구운임); }); return Object.entries(m).sort(); })();
  const maxDaily = Math.max(1, ...daily.map(([, v]) => v));
  const risky = B.filter((r) => { const s = toWon(r.청구운임), d = toWon(r.기사운임); return s > 0 && (s - d <= 0 || (s - d) / s < 0.05); });
  const unassigned = rows.filter((r) => String(r.상차일 || "").startsWith(month) && DONE(r) && !String(r.차량번호 || "").trim());
  const unsettled = B.filter((r) => { const st = r.정산상태; const v = st && typeof st === "object" ? st[month] : st; return v !== "정산완료"; });

  const box = { background: "#fff", border: "1px solid #E3E8F0", borderRadius: 16, padding: 18 };
  const h = (en, t) => <div style={{ marginBottom: 10 }}><div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.24em", color: "#8FB0F0" }}>{en}</div><div style={{ fontSize: 17, fontWeight: 900, color: "#0F1A30" }}>{t}</div></div>;
  const th = { padding: "9px 10px", fontSize: 13, fontWeight: 900, color: "#fff", background: "#0B1428", textAlign: "right", whiteSpace: "nowrap" };
  const td = { padding: "9px 10px", fontSize: 14, fontWeight: 700, color: "#0F1A30", borderBottom: "1px solid #EEF1F6", textAlign: "right", whiteSpace: "nowrap", fontFamily: MONO };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99990, background: "rgba(11,20,40,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Noto Sans KR',sans-serif" }}>
      <div style={{ width: "min(1500px,100%)", height: "100%", maxHeight: 1250, background: "#F3F6FA", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(0,0,0,.35)" }}>
        <div style={{ padding: "16px 22px", color: "#fff", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.26em", color: "#8FB0F0" }}>MONTHLY REPORT · {prev} → {month}</div>
            <div style={{ fontSize: 21, fontWeight: 900 }}>월간 경영 보고서</div>
          </div>
          {hasExcluded && <div style={{ display: "flex", padding: 3, borderRadius: 12, background: "rgba(255,255,255,.1)" }}>{[["pure", "순수 운송"], ["all", "전체"]].map(([k, l]) => <button key={k} type="button" onClick={() => setScope(k)} style={{ height: 34, padding: "0 12px", borderRadius: 9, border: "none", background: scope === k ? "#fff" : "transparent", color: scope === k ? "#0F1A30" : "#fff", fontSize: 13, fontWeight: 900, cursor: "pointer" }}>{l}</button>)}</div>}
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ height: 38, borderRadius: 10, border: "none", padding: "0 10px", fontSize: 14, fontWeight: 900, color: "#0F1A30" }}>{months.map((m) => <option key={m} value={m}>{m.replace("-", "년 ")}월</option>)}</select>
          <button type="button" onClick={() => window.print()} style={{ height: 38, padding: "0 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 13.5, fontWeight: 900, cursor: "pointer" }}>인쇄</button>
          <button type="button" onClick={onClose} style={{ height: 38, padding: "0 16px", borderRadius: 10, border: "none", background: "#fff", color: "#0F1A30", fontSize: 13.5, fontWeight: 900, cursor: "pointer" }}>닫기</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(460px,1fr))", alignContent: "start" }}>
          <div style={{ ...box, gridColumn: "1 / -1" }}>
            {h("KEY METRICS", `핵심 지표 — ${prev.slice(5)}월 대비 ${month.slice(5)}월`)}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
              {[["운행 건수", sa.cnt, sb.cnt, `${sb.cnt.toLocaleString()}건`], ["매출", sa.sale, sb.sale, `${won(sb.sale)}원`, 1], ["수익", sa.profit, sb.profit, `${won(sb.profit)}원`, 1], ["수익률", sa.rate, sb.rate, pct(sb.rate), 0, 1], ["건당 수익", sa.avgProfit, sb.avgProfit, `${won(sb.avgProfit)}원`, 1], ["거래처 수", clientA.size, clientB.size, `${clientB.size}곳`]].map(([k, a, b, v, money, rate], i) => (
                <div key={k} style={{ borderRadius: 14, padding: "12px 14px", background: i === 2 ? "#0F1A30" : "#F5F8FD", color: i === 2 ? "#fff" : "#0F1A30", border: i === 2 ? "none" : "1px solid #E3E8F0" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, opacity: 0.7 }}>{k}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, fontFamily: MONO, whiteSpace: "nowrap" }}>{v}</div>
                  <div style={{ fontSize: 12.5, marginTop: 2 }}>{i === 2 ? <span style={{ color: "#8FB0F0", fontWeight: 900 }}>{sb.profit - sa.profit >= 0 ? "▲" : "▼"} {man(Math.abs(sb.profit - sa.profit))}</span> : <Delta a={a} b={b} money={money} rate={rate} />}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={box}>
            {h("TOP CLIENTS", "매출 상위 거래처 10")}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["거래처", "건수", "매출", "수익률", "전월 대비"].map((x, i) => <th key={x} style={{ ...th, textAlign: i ? "right" : "left", borderRadius: i === 0 ? "8px 0 0 0" : i === 4 ? "0 8px 0 0" : 0 }}>{x}</th>)}</tr></thead>
              <tbody>{topClients.map((c) => <tr key={c.k}><td style={{ ...td, textAlign: "left", fontFamily: "inherit", fontWeight: 900, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{c.k}</td><td style={td}>{c.s.cnt}</td><td style={td}>{man(c.s.sale)}</td><td style={td}>{pct(c.s.rate)}</td><td style={td}><Delta a={c.p.sale} b={c.s.sale} money /></td></tr>)}
                {!topClients.length && <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: "#9AA9C3" }}>이 달 운행이 없습니다</td></tr>}</tbody>
            </table>
          </div>
          <div style={box}>
            {h("CLIENT CHANGE", "거래처 변화")}
            <div style={{ fontSize: 13.5, fontWeight: 900, color: "#0F1A30", marginBottom: 6 }}>신규 거래처 {newClients.length}곳</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>{newClients.slice(0, 30).map((k) => <span key={k} style={{ padding: "4px 10px", borderRadius: 8, background: "#EEF3FC", border: "1px solid #C9D6EE", fontSize: 13, fontWeight: 800, color: "#1B2B4B" }}>{k}</span>)}{!newClients.length && <span style={{ color: "#9AA9C3", fontSize: 13 }}>없음</span>}</div>
            <div style={{ fontSize: 13.5, fontWeight: 900, color: "#0F1A30", marginBottom: 6 }}>이번 달 거래가 없는 거래처 {lostClients.length}곳 <span style={{ fontWeight: 700, color: "#7A89A3", fontSize: 12.5 }}>— 연락해 볼 곳</span></div>
            {lostClients.slice(0, 10).map((c) => <div key={c.k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 2px", borderBottom: "1px dashed #E3E8F0", fontSize: 13.5 }}><b>{c.k}</b><span style={{ fontFamily: MONO, color: "#5B6B85" }}>전월 {c.s.cnt}건 · {man(c.s.sale)}</span></div>)}
          </div>
          <div style={box}>
            {h("VEHICLE CLASS", "차량 톤수별 수익성")}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["톤수", "건수", "매출", "건당 수익", "수익률"].map((x, i) => <th key={x} style={{ ...th, textAlign: i ? "right" : "left" }}>{x}</th>)}</tr></thead>
              <tbody>{tons.map((t) => <tr key={t.k}><td style={{ ...td, textAlign: "left", fontFamily: "inherit", fontWeight: 900 }}>{t.k}</td><td style={td}>{t.s.cnt}</td><td style={td}>{man(t.s.sale)}</td><td style={td}>{won(t.s.avgProfit)}</td><td style={td}>{pct(t.s.rate)}</td></tr>)}</tbody>
            </table>
          </div>
          <div style={box}>
            {h("WORKLOAD", "요일별 물량 · 일별 매출")}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, marginBottom: 14 }}>
              {dow.map((x) => <div key={x.d} style={{ flex: 1, textAlign: "center" }}><div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900 }}>{x.n}</div><div style={{ height: `${(x.n / maxDow) * 80}px`, minHeight: 2, borderRadius: 6, background: x.d === "토" || x.d === "일" ? "#8FB0F0" : "#1B2B4B" }} /><div style={{ fontSize: 13, fontWeight: 900, marginTop: 4 }}>{x.d}</div></div>)}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80 }}>
              {daily.map(([d, v]) => <div key={d} title={`${d}일 ${won(v)}원`} style={{ flex: 1, height: `${(v / maxDaily) * 100}%`, minHeight: 2, background: "#2D4C82", borderRadius: "3px 3px 0 0" }} />)}
            </div>
          </div>
          <div style={{ ...box, gridColumn: "1 / -1" }}>
            {h("RISK", "확인이 필요한 오더")}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginBottom: 12 }}>
              {[["손실·저마진(5% 미만)", `${risky.length}건`, `손실 합계 ${won(risky.reduce((s, r) => s + Math.min(0, toWon(r.청구운임) - toWon(r.기사운임)), 0))}원`], ["미배차(기사 미지정)", `${unassigned.length}건`, "이번 달 상차 오더 중"], ["미정산 매출", `${won(unsettled.reduce((s, r) => s + toWon(r.청구운임), 0))}원`, `${unsettled.length}건 · 거래처정산에서 처리`]].map(([k, v, sub]) => (
                <div key={k} style={{ borderRadius: 14, padding: "12px 14px", background: "#F5F8FD", border: "1px solid #E3E8F0" }}><div style={{ fontSize: 12.5, fontWeight: 800, color: "#5B6B85" }}>{k}</div><div style={{ fontSize: 22, fontWeight: 900, fontFamily: MONO }}>{v}</div><div style={{ fontSize: 12, color: "#7A89A3" }}>{sub}</div></div>
              ))}
            </div>
            {risky.slice(0, 12).map((r, i) => <div key={r._id || i} style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 120px 120px", gap: 8, padding: "7px 4px", borderBottom: "1px solid #EEF1F6", fontSize: 13.5 }}><span style={{ fontFamily: MONO }}>{r.상차일}</span><b>{r.거래처명}</b><span>{r.상차지명} → {r.하차지명}</span><span style={{ fontFamily: MONO, textAlign: "right" }}>청구 {won(toWon(r.청구운임))}</span><span style={{ fontFamily: MONO, textAlign: "right", fontWeight: 900 }}>수익 {won(toWon(r.청구운임) - toWon(r.기사운임))}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
