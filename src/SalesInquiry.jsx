// ===================== 매출 질의 점검표 (최고관리자 전용) =====================
// ⭐ 2026-11-03 — 윗선에서 월 매출에 대해 질문이 왔을 때 답변 근거가 되는 표를 한 화면에 모은다.
//  ① 금액 대사      : "오더별 금액 vs 거래처별 금액"이 왜 다른지 — 기준별 합계를 나란히 보여주고 차액과 맞는 항목을 찾아준다
//  ② 수수료 0% 거래처 : 수익 0원(청구=기사)·역마진 오더를 거래처별로 전월과 비교(건수·기사운임 비용 증감)
//  ③ 명절 전후 운임   : 기간 내 오더의 기사운임을 "평소(직전 3개월 같은 상차지→하차지·톤수 평균)"와 비교해 청구 미반영 손실을 계산
//  ④ 대기비·수작업비  : 메모·화물내용·전달사항에 대기/수작업 등이 적힌 오더 — 추가비용을 청구에 반영했는지 확인
//  ⑤ 월 특이사항     : 일자별 특이 오더(수익 0원·역마진·손실·거래처 "개인"/공란) — 보고용 문구 복사
import React, { useMemo, useState, useEffect } from "react";
import { toWon, creatorOf, useStaffNames } from "./monthCompare";
import { useLoadOrderRange, monthEnd, monthStartAgo } from "./orderHistory";
import { CustomSelect } from "./CustomSelect";

const NAVY = "#1B2B4B";
const kstMonth = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
const shiftMonth = (m, d) => { const [y, mm] = m.split("-").map(Number); const t = new Date(y, mm - 1 + d, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`; };
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const won = (v) => `${Math.round(v).toLocaleString()}원`;
const sign = (v) => (v > 0 ? `+${Math.round(v).toLocaleString()}` : v < 0 ? `−${Math.round(-v).toLocaleString()}` : "0");
const isCanceled = (r) => r?.배차상태 === "배차취소" || r?.상태 === "취소";
const isDone = (r) => (r?.배차상태 || "") === "배차완료";
const S = (r) => toWon(r.청구운임);
const D = (r) => toWon(r.기사운임);
const P = (r) => S(r) - D(r);
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const dayLabel = (ymd) => { const d = new Date(`${ymd}T00:00:00Z`); return `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}(${WD[d.getUTCDay()]})`; };
const normName = (n) => String(n || "").replace(/\(주\)|㈜|주식회사|\(유\)|\s/g, "").toLowerCase();
const route = (r) => `${String(r.상차지명 || "").trim()} → ${String(r.하차지명 || "").trim()}`;
const memoOf = (r) => [r.메모, r.오더메모, r.전달사항, r.기사전달주의사항, r.화물내용].map((v) => String(v || "").trim()).filter(Boolean).join(" / ");
// ⭐ 추석 연휴(설정이 없어서 연도별로 직접 둔다) — 명절 전후 기본 기간 계산용
const HOLIDAY_RANGES = [
  { label: "2026 설날", from: "2026-02-16", to: "2026-02-18" },
  { label: "2026 추석", from: "2026-09-24", to: "2026-09-26" },
  { label: "2027 설날", from: "2027-02-06", to: "2027-02-09" },
  { label: "2027 추석", from: "2027-09-14", to: "2027-09-16" },
];
const EXTRA_RE = /대기|수작업|수작|상하차비|하차비|상차비|작업비|인건비|랩핑|추가비|추가요금|할증/;

function downloadCsv(name, headers, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
}

// ── 공용 표 ──
const th = { padding: "10px 8px", fontWeight: 900, textAlign: "center", borderBottom: "2px solid #cfd8e5", borderLeft: "1px solid #dfe5ee", whiteSpace: "nowrap", background: "#eef1f6", color: NAVY, fontSize: 14, position: "sticky", top: 0 };
const td = { padding: "9px 8px", textAlign: "center", borderLeft: "1px solid #eef1f6", whiteSpace: "nowrap", fontSize: 14, fontWeight: 700, color: "#111827" };
function Table({ headers, rows, rowStyle, minWidth = 900, maxHeight = 520, onRowClick }) {
  return (
    <div style={{ overflow: "auto", border: "1px solid #dfe5ee", borderRadius: 10, maxHeight }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth }}>
        <thead><tr>{headers.map((h, i) => <th key={i} style={{ ...th, borderLeft: i ? th.borderLeft : "none" }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} onClick={onRowClick ? () => onRowClick(ri) : undefined} style={{ borderTop: "1px solid #eef1f6", cursor: onRowClick ? "pointer" : undefined, ...(rowStyle ? rowStyle(ri) : null) }}>
              {r.map((c, ci) => <td key={ci} style={{ ...td, borderLeft: ci ? td.borderLeft : "none", ...(typeof c === "object" && c && c.style ? c.style : null) }}>{typeof c === "object" && c && "v" in c ? c.v : c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div style={{ padding: 18, textAlign: "center", fontSize: 14, fontWeight: 700, color: "#6b7280" }}>해당하는 오더가 없습니다.</div>}
    </div>
  );
}
const Card = ({ title, children, right }) => (
  <div style={{ background: "#fff", border: "1px solid #e2e7ef", borderRadius: 14, padding: 16, flexShrink: 0 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      <span style={{ fontSize: 17, fontWeight: 900, color: NAVY }}>{title}</span>
      <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>{right}</span>
    </div>
    {children}
  </div>
);
const Kpis = ({ items }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, flexShrink: 0 }}>
    {items.map(([l, v, sub, color]) => (
      <div key={l} style={{ background: "#fff", border: "1px solid #e2e7ef", borderRadius: 12, padding: "12px 14px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#4b5563" }}>{l}</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: color || "#111827", marginTop: 3 }}>{v}</div>
        {sub && <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginTop: 2 }}>{sub}</div>}
      </div>
    ))}
  </div>
);
const btn = (on) => ({ height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid " + (on ? NAVY : "#cbd5e1"), background: on ? NAVY : "#fff", color: on ? "#fff" : "#1f2937", fontSize: 13, fontWeight: 800, cursor: "pointer" });
const inp = { height: 32, borderRadius: 8, border: "1px solid #cbd5e1", padding: "0 10px", fontSize: 14, fontWeight: 700, color: "#111827" };
const Note = ({ children }) => <div style={{ fontSize: 13, fontWeight: 600, color: "#4b5563", lineHeight: 1.6, background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 10, padding: "10px 12px" }}>{children}</div>;

// ════════════════ ① 금액 대사 ════════════════
function ReconcileTab({ all, month }) {
  const [client, setClient] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const inMonth = useMemo(() => all.filter((r) => String(r.상차일 || "").startsWith(month)), [all, month]);
  const clientList = useMemo(() => [...new Set(inMonth.map((r) => String(r.거래처명 || "").trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y, "ko")), [inMonth]);
  const list = client ? inMonth.filter((r) => String(r.거래처명 || "").trim() === client) : inMonth;
  const sum = (arr, f = S) => arr.reduce((s, r) => s + f(r), 0);
  const orders = list.filter((r) => !r.__fixed);
  const fixed = list.filter((r) => r.__fixed);
  const live = orders.filter((r) => !isCanceled(r));
  const done = live.filter(isDone);
  const pending = live.filter((r) => !isDone(r));
  const canceled = orders.filter(isCanceled);
  const noClient = done.filter((r) => !String(r.거래처명 || "").trim());
  const nextMonthDrop = done.filter((r) => r.하차일 && String(r.하차일).slice(0, 7) > month);

  const metrics = [
    { k: "all", l: "전체 오더 청구운임 (취소 제외, 배차중 포함)", v: sum(live), n: live.length },
    { k: "done", l: "배차완료 오더 청구운임  ← 정산관리 '거래처별' 기준", v: sum(done), n: done.length },
    { k: "rv", l: "배차완료 + 고정거래처  ← 매출관리 기준", v: sum(done) + sum(fixed), n: done.length + fixed.length },
    { k: "fixed", l: "고정거래처(고정노선) 금액", v: sum(fixed), n: fixed.length, diff: true },
    { k: "pending", l: "배차중(미완료) 오더 금액", v: sum(pending), n: pending.length, diff: true },
    { k: "cancel", l: "배차취소 오더 금액", v: sum(canceled), n: canceled.length, diff: true },
    { k: "noClient", l: "거래처명 미입력 오더 금액", v: sum(noClient), n: noClient.length, diff: true },
    { k: "nextDrop", l: "하차일이 다음 달인 오더 (상차일/하차일 기준 차이)", v: sum(nextMonthDrop), n: nextMonthDrop.length, diff: true },
    { k: "vat", l: "부가세(배차완료 × 10%)", v: Math.round(sum(done) * 0.1), n: null, diff: true },
    { k: "vatIn", l: "배차완료 VAT 포함(× 1.1)", v: Math.round(sum(done) * 1.1), n: null },
    { k: "driver", l: "기사운임 합계 (배차완료)", v: sum(done, D), n: done.length },
    { k: "profit", l: "수수료(수익) 합계 (배차완료)", v: sum(done, P), n: done.length, diff: true },
  ];
  const A = toWon(a), B = toWon(b);
  const gap = Math.abs(A - B);
  const near = (x, y) => x > 0 && Math.abs(x - y) <= 1000;
  const matchA = A ? metrics.filter((m) => near(m.v, A)) : [];
  const matchB = B ? metrics.filter((m) => near(m.v, B)) : [];
  const diffItems = metrics.filter((m) => m.diff);
  const gapMatches = [];
  if (gap) {
    diffItems.forEach((m) => { if (near(m.v, gap)) gapMatches.push(m.l); });
    for (let i = 0; i < diffItems.length; i++) for (let j = i + 1; j < diffItems.length; j++) if (near(diffItems[i].v + diffItems[j].v, gap)) gapMatches.push(`${diffItems[i].l} + ${diffItems[j].l}`);
  }
  // 거래처명 변형(띄어쓰기·㈜ 차이로 거래처별 합계가 쪼개지는 경우)
  const variants = useMemo(() => {
    const g = new Map();
    inMonth.forEach((r) => { const n = String(r.거래처명 || "").trim(); if (!n) return; const k = normName(n); if (!g.has(k)) g.set(k, new Map()); const m = g.get(k); m.set(n, (m.get(n) || 0) + S(r)); });
    return [...g.values()].filter((m) => m.size > 1).map((m) => [...m.entries()]);
  }, [inMonth]);
  // 거래처별 표
  const byClient = useMemo(() => {
    const m = new Map();
    inMonth.forEach((r) => {
      const n = String(r.거래처명 || "").trim() || "(거래처명 없음)";
      if (!m.has(n)) m.set(n, { n, cnt: 0, all: 0, done: 0, fixed: 0, pend: 0, cancel: 0 });
      const g = m.get(n); const s = S(r);
      if (r.__fixed) { g.fixed += s; return; }
      if (isCanceled(r)) { g.cancel += s; return; }
      g.cnt++; g.all += s;
      if (isDone(r)) g.done += s; else g.pend += s;
    });
    return [...m.values()].sort((x, y) => (y.all + y.fixed) - (x.all + x.fixed));
  }, [inMonth]);

  return (
    <>
      <Card title="금액 대사 — 질문받은 두 금액 입력" right={
        <CustomSelect value={client} onChange={(e) => setClient(e.target.value)} style={{ ...inp, minWidth: 180 }}>
          <option value="">전체 거래처</option>
          {clientList.map((c) => <option key={c} value={c}>{c}</option>)}
        </CustomSelect>
      }>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontWeight: 800 }}>오더별 금액</span><input style={inp} value={a} onChange={(e) => setA(e.target.value)} placeholder="예) 4,575,325" />
          <span style={{ fontWeight: 800 }}>거래처별 금액</span><input style={inp} value={b} onChange={(e) => setB(e.target.value)} placeholder="예) 3,245,882" />
          {gap > 0 && <span style={{ fontWeight: 900, color: "#b91c1c" }}>차액 {won(gap)}</span>}
        </div>
        {(A > 0 || B > 0) && (
          <Note>
            {A > 0 && <div>• 오더별 금액 {won(A)} → {matchA.length ? <b style={{ color: "#047857" }}>{matchA.map((m) => m.l).join(", ")}과 일치</b> : "아래 기준 중 일치하는 항목 없음 (거래처·월 선택 확인)"}</div>}
            {B > 0 && <div>• 거래처별 금액 {won(B)} → {matchB.length ? <b style={{ color: "#047857" }}>{matchB.map((m) => m.l).join(", ")}과 일치</b> : "아래 기준 중 일치하는 항목 없음 (거래처·월 선택 확인)"}</div>}
            {gap > 0 && <div>• 차액 {won(gap)} 원인 후보 → {gapMatches.length ? <b style={{ color: "#047857" }}>{gapMatches.join(" / ")}</b> : "단일 항목으로 맞는 것 없음 — 아래 거래처별 표에서 '차이' 열 확인"}</div>}
          </Note>
        )}
        <div style={{ marginTop: 12 }}>
          <Table minWidth={700} maxHeight={600} headers={["기준", "건수", "금액", "입력값과 비교"]}
            rows={metrics.map((m) => [
              { v: m.l, style: { textAlign: "left", fontWeight: m.diff ? 700 : 900 } },
              m.n == null ? "-" : `${m.n.toLocaleString()}건`,
              { v: won(m.v), style: { fontWeight: 900 } },
              { v: [near(m.v, A) && "오더별 = 이 값", near(m.v, B) && "거래처별 = 이 값", gap && m.diff && near(m.v, gap) && "차액 = 이 값"].filter(Boolean).join(" · ") || "", style: { color: "#047857", fontWeight: 900 } },
            ])}
            rowStyle={(i) => (near(metrics[i].v, A) || near(metrics[i].v, B) || (gap && metrics[i].diff && near(metrics[i].v, gap)) ? { background: "#ecfdf5" } : null)} />
        </div>
        <div style={{ marginTop: 10 }}><Note>
          정산관리(거래처별 청구)는 <b>배차완료 오더만</b>, 매출관리는 <b>배차완료 + 고정거래처</b>를 합칩니다. 그래서 고정거래처 금액·배차중 오더·취소 오더·VAT 포함 여부에 따라 두 금액이 달라질 수 있습니다.
          어느 금액이 맞는지는 "실제 청구서(세금계산서)에 나간 금액"과 같은 쪽이 맞는 금액입니다.
        </Note></div>
      </Card>

      {variants.length > 0 && (
        <Card title="⚠ 거래처명 표기가 달라 거래처별 합계가 쪼개진 경우">
          <Table minWidth={600} headers={["같은 거래처로 보이는 이름들", "이름별 금액"]}
            rows={variants.map((v) => [v.map(([n]) => n).join("  /  "), v.map(([n, s]) => `${n}: ${won(s)}`).join("  ·  ")])} />
        </Card>
      )}

      <Card title={`${Number(month.slice(5))}월 거래처별 금액 비교`} right={
        <button style={btn(false)} onClick={() => downloadCsv(`금액대사_${month}`, ["거래처", "건수", "전체(배차중포함)", "배차완료", "고정거래처", "배차중", "취소", "차이(전체-배차완료)"], byClient.map((g) => [g.n, g.cnt, g.all, g.done, g.fixed, g.pend, g.cancel, g.all - g.done]))}>CSV 저장</button>
      }>
        <Table headers={["거래처", "건수", "전체(배차중 포함)", "배차완료", "고정거래처", "배차중", "취소", "차이"]}
          rows={byClient.map((g) => [{ v: g.n, style: { textAlign: "left" } }, `${g.cnt}건`, won(g.all), won(g.done), g.fixed ? won(g.fixed) : "-", g.pend ? won(g.pend) : "-", g.cancel ? won(g.cancel) : "-", { v: g.all - g.done + g.fixed ? sign(g.all - g.done + g.fixed) : "0", style: { color: g.all - g.done + g.fixed ? "#b91c1c" : "#9ca3af", fontWeight: 900 } }])}
          rowStyle={(i) => (byClient[i].pend || byClient[i].fixed ? { background: "#fff7ed" } : null)} />
      </Card>
    </>
  );
}

// ════════════════ ② 수수료 0% 거래처 ════════════════
function ZeroFeeTab({ all, month }) {
  const prev = shiftMonth(month, -1);
  const [sel, setSel] = useState("");
  const pick = (m) => all.filter((r) => !r.__fixed && isDone(r) && String(r.상차일 || "").startsWith(m) && S(r) > 0 && P(r) <= 0 && String(r.지급방식 || "").trim() !== "손실");
  const cur = useMemo(() => pick(month), [all, month]); // eslint-disable-line react-hooks/exhaustive-deps
  const bef = useMemo(() => pick(prev), [all, prev]); // eslint-disable-line react-hooks/exhaustive-deps
  const group = (arr) => { const m = new Map(); arr.forEach((r) => { const n = String(r.거래처명 || "").trim() || "(거래처명 없음)"; if (!m.has(n)) m.set(n, { cnt: 0, zero: 0, neg: 0, driver: 0, loss: 0 }); const g = m.get(n); g.cnt++; g.driver += D(r); if (P(r) === 0) g.zero++; else { g.neg++; g.loss += -P(r); } }); return m; };
  const gc = group(cur), gb = group(bef);
  const names = [...new Set([...gc.keys(), ...gb.keys()])];
  const emp = { cnt: 0, zero: 0, neg: 0, driver: 0, loss: 0 };
  const rows = names.map((n) => ({ n, c: gc.get(n) || emp, b: gb.get(n) || emp })).sort((x, y) => (y.c.driver - y.b.driver) - (x.c.driver - x.b.driver));
  const tc = cur.reduce((s, r) => s + D(r), 0), tb = bef.reduce((s, r) => s + D(r), 0);
  const lossC = cur.reduce((s, r) => s + Math.max(0, -P(r)), 0);
  const detail = (sel ? cur.filter((r) => (String(r.거래처명 || "").trim() || "(거래처명 없음)") === sel) : cur).slice().sort((x, y) => String(x.상차일).localeCompare(String(y.상차일)));
  return (
    <>
      <Kpis items={[
        [`${Number(prev.slice(5))}월 수수료 0% 이하`, `${bef.length}건`, `기사운임 ${won(tb)}`],
        [`${Number(month.slice(5))}월 수수료 0% 이하`, `${cur.length}건`, `기사운임 ${won(tc)}`, cur.length > bef.length ? "#b91c1c" : "#047857"],
        ["건수 증감", `${sign(cur.length - bef.length)}건`],
        ["배차 비용(기사운임) 증감", `${sign(tc - tb)}원`, null, tc > tb ? "#b91c1c" : "#047857"],
        [`${Number(month.slice(5))}월 역마진 손실액`, won(lossC), "청구보다 기사운임이 더 나간 금액", "#b91c1c"],
      ]} />
      <Card title={`거래처별 수수료 0%·역마진 — ${Number(prev.slice(5))}월 vs ${Number(month.slice(5))}월`} right={
        <button style={btn(false)} onClick={() => downloadCsv(`수수료0_${month}`, ["거래처", `${prev} 건수`, `${month} 건수`, "증감", `${prev} 기사운임`, `${month} 기사운임`, "비용증감", "수익0원", "역마진", "역마진 손실액"], rows.map((g) => [g.n, g.b.cnt, g.c.cnt, g.c.cnt - g.b.cnt, g.b.driver, g.c.driver, g.c.driver - g.b.driver, g.c.zero, g.c.neg, g.c.loss]))}>CSV 저장</button>
      }>
        <Table headers={["거래처", `${Number(prev.slice(5))}월 건수`, `${Number(month.slice(5))}월 건수`, "증감", `${Number(prev.slice(5))}월 기사운임`, `${Number(month.slice(5))}월 기사운임`, "비용 증감", "수익 0원", "역마진", "역마진 손실"]}
          rows={rows.map((g) => [{ v: g.n, style: { textAlign: "left" } }, `${g.b.cnt}건`, `${g.c.cnt}건`, { v: sign(g.c.cnt - g.b.cnt), style: { color: g.c.cnt > g.b.cnt ? "#b91c1c" : "#047857" } }, won(g.b.driver), won(g.c.driver), { v: sign(g.c.driver - g.b.driver), style: { color: g.c.driver > g.b.driver ? "#b91c1c" : "#047857", fontWeight: 900 } }, `${g.c.zero}건`, `${g.c.neg}건`, g.c.loss ? won(g.c.loss) : "-"])}
          onRowClick={(i) => setSel(rows[i].n === sel ? "" : rows[i].n)}
          rowStyle={(i) => (rows[i].n === sel ? { background: "#e0e7ff" } : null)} />
        <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: "#4b5563" }}>수수료 0% = 청구운임 = 기사운임(수익 0원) · 역마진 = 기사운임이 더 큼 · 지급방식 "손실"은 제외 · 행을 누르면 아래에 오더 목록</div>
      </Card>
      <Card title={`${sel || "전체"} — ${Number(month.slice(5))}월 오더 목록 (${detail.length}건)`}>
        <Table headers={["상차일", "거래처", "상차지 → 하차지", "톤수", "청구운임", "기사운임", "수익", "등록자", "메모"]}
          rows={detail.map((r) => [r.상차일, r.거래처명, { v: route(r), style: { textAlign: "left" } }, r.차량톤수 || "", won(S(r)), won(D(r)), { v: won(P(r)), style: { color: P(r) < 0 ? "#b91c1c" : "#6b7280", fontWeight: 900 } }, creatorOf(r), { v: memoOf(r).slice(0, 40), style: { textAlign: "left", fontWeight: 500 } }])} />
      </Card>
    </>
  );
}

// ════════════════ ③ 명절 전후 운임 ════════════════
function HolidayTab({ all, month }) {
  const def = HOLIDAY_RANGES.find((h) => h.from.slice(0, 7) === month || h.to.slice(0, 7) === month);
  const [from, setFrom] = useState(def ? addDays(def.from, -7) : `${month}-01`);
  const [to, setTo] = useState(def ? addDays(def.to, 7) : monthEnd(month));
  const [onlyBad, setOnlyBad] = useState(true);
  useEffect(() => { const h = HOLIDAY_RANGES.find((x) => x.from.slice(0, 7) === month || x.to.slice(0, 7) === month); setFrom(h ? addDays(h.from, -7) : `${month}-01`); setTo(h ? addDays(h.to, 7) : monthEnd(month)); }, [month]);
  const baseFrom = monthStartAgo(from.slice(0, 7), 3);
  useLoadOrderRange(baseFrom, to);
  const key = (r) => `${String(r.상차지명 || "").trim()}|${String(r.하차지명 || "").trim()}|${String(r.차량톤수 || "").trim()}`;
  const base = useMemo(() => {
    const m = new Map();
    all.forEach((r) => {
      const d = String(r.상차일 || "");
      if (r.__fixed || !isDone(r) || d < baseFrom || d >= from || !S(r) || !D(r)) return;
      const k = key(r); if (!m.has(k)) m.set(k, { n: 0, s: 0, d: 0 }); const g = m.get(k); g.n++; g.s += S(r); g.d += D(r);
    });
    return m;
  }, [all, baseFrom, from]);
  const list = useMemo(() => all.filter((r) => { const d = String(r.상차일 || ""); return !r.__fixed && isDone(r) && d >= from && d <= to && S(r) > 0; }).map((r) => {
    const b = base.get(key(r));
    const avgD = b ? b.d / b.n : null, avgS = b ? b.s / b.n : null;
    const upD = avgD != null ? D(r) - avgD : null, upS = avgS != null ? S(r) - avgS : null;
    const miss = upD != null ? Math.max(0, upD - Math.max(0, upS)) : null; // 기사운임 오른 만큼 청구에 못 올린 금액
    return { r, avgD, avgS, upD, upS, miss, bn: b?.n || 0 };
  }).sort((x, y) => String(x.r.상차일).localeCompare(String(y.r.상차일))), [all, from, to, base]);
  const bad = (x) => P(x.r) <= 0 || (x.miss != null && x.miss >= 5000);
  const shown = onlyBad ? list.filter(bad) : list;
  const byClient = useMemo(() => {
    const m = new Map();
    list.forEach((x) => { const n = String(x.r.거래처명 || "").trim() || "(거래처명 없음)"; if (!m.has(n)) m.set(n, { n, cnt: 0, zero: 0, up: 0, upN: 0, miss: 0, profit: 0 }); const g = m.get(n); g.cnt++; g.profit += P(x.r); if (P(x.r) <= 0) g.zero++; if (x.upD != null && x.upD > 0) { g.up += x.upD; g.upN++; } if (x.miss) g.miss += x.miss; });
    return [...m.values()].filter((g) => g.zero || g.miss).sort((a, b) => b.miss - a.miss);
  }, [list]);
  const totMiss = list.reduce((s, x) => s + (x.miss || 0), 0);
  return (
    <>
      <Card title="명절 전후 운임 상승 — 청구 미반영 손실" right={<>
        <input type="date" style={inp} value={from} onChange={(e) => setFrom(e.target.value)} /> ~ <input type="date" style={inp} value={to} onChange={(e) => setTo(e.target.value)} />
        {HOLIDAY_RANGES.map((h) => <button key={h.label} style={btn(false)} onClick={() => { setFrom(addDays(h.from, -7)); setTo(addDays(h.to, 7)); }}>{h.label} ±7일</button>)}
      </>}>
        <Kpis items={[
          ["기간 오더", `${list.length}건`],
          ["수익 0원 이하", `${list.filter((x) => P(x.r) <= 0).length}건`, null, "#b91c1c"],
          ["기사운임이 평소보다 오른 건", `${list.filter((x) => x.upD > 0).length}건`],
          ["청구 미반영 손실 추정", won(totMiss), "기사운임 상승분 − 청구 상승분", "#b91c1c"],
        ]} />
        <div style={{ marginTop: 10 }}><Note>
          "평소" = 기간 시작 전 3개월({baseFrom} ~ {addDays(from, -1)}) 동안 <b>같은 상차지 → 하차지 · 같은 톤수</b> 배차완료 오더의 평균. 같은 노선 이력이 없으면 "-"로 표시됩니다.
          명절 전후 차량이 부족해 기사운임을 올려줬는데 업체 청구는 평소대로 해서 생긴 손실을 보여줍니다 (답변 4번: "1~2만원 손실을 보면서 배차" 근거).
        </Note></div>
      </Card>
      <Card title="거래처별 요약" right={<button style={btn(false)} onClick={() => downloadCsv(`명절운임_거래처_${from}_${to}`, ["거래처", "건수", "수익0원이하", "기사운임 상승건", "기사운임 상승합", "청구 미반영 손실", "기간 수익"], byClient.map((g) => [g.n, g.cnt, g.zero, g.upN, Math.round(g.up), Math.round(g.miss), g.profit]))}>CSV 저장</button>}>
        <Table headers={["거래처", "건수", "수익 0원 이하", "기사운임 상승 건", "기사운임 상승 합", "청구 미반영 손실", "기간 수익"]}
          rows={byClient.map((g) => [{ v: g.n, style: { textAlign: "left" } }, `${g.cnt}건`, `${g.zero}건`, `${g.upN}건`, won(g.up), { v: won(g.miss), style: { color: "#b91c1c", fontWeight: 900 } }, won(g.profit)])} />
      </Card>
      <Card title={`오더 목록 (${shown.length}건)`} right={<>
        <button style={btn(onlyBad)} onClick={() => setOnlyBad(true)}>문제 오더만</button>
        <button style={btn(!onlyBad)} onClick={() => setOnlyBad(false)}>전체</button>
        <button style={btn(false)} onClick={() => downloadCsv(`명절운임_오더_${from}_${to}`, ["상차일", "거래처", "노선", "톤수", "청구운임", "기사운임", "수익", "평소청구", "평소기사운임", "기사운임상승", "청구미반영"], shown.map((x) => [x.r.상차일, x.r.거래처명, route(x.r), x.r.차량톤수, S(x.r), D(x.r), P(x.r), x.avgS == null ? "" : Math.round(x.avgS), x.avgD == null ? "" : Math.round(x.avgD), x.upD == null ? "" : Math.round(x.upD), x.miss == null ? "" : Math.round(x.miss)]))}>CSV 저장</button>
      </>}>
        <Table minWidth={1250} headers={["상차일", "거래처", "상차지 → 하차지", "톤수", "청구운임", "기사운임", "수익", "평소 청구", "평소 기사운임", "기사운임 상승", "청구 미반영"]}
          rows={shown.map((x) => [dayLabel(x.r.상차일), x.r.거래처명, { v: route(x.r), style: { textAlign: "left" } }, x.r.차량톤수 || "", won(S(x.r)), won(D(x.r)), { v: won(P(x.r)), style: { color: P(x.r) <= 0 ? "#b91c1c" : undefined, fontWeight: 900 } }, x.avgS == null ? "-" : won(x.avgS), x.avgD == null ? "-" : `${won(x.avgD)} (${x.bn}건)`, x.upD == null ? "-" : { v: sign(x.upD), style: { color: x.upD > 0 ? "#b91c1c" : "#047857" } }, x.miss ? { v: won(x.miss), style: { color: "#b91c1c", fontWeight: 900 } } : "-"])} />
      </Card>
    </>
  );
}

// ════════════════ ④ 대기비·수작업비 ════════════════
function ExtraCostTab({ all, month }) {
  const list = useMemo(() => all.filter((r) => !r.__fixed && !isCanceled(r) && String(r.상차일 || "").startsWith(month) && EXTRA_RE.test(memoOf(r))).sort((a, b) => String(a.상차일).localeCompare(String(b.상차일))), [all, month]);
  const kw = (r) => [...new Set((memoOf(r).match(new RegExp(EXTRA_RE.source, "g")) || []))].join(", ");
  const byClient = useMemo(() => {
    const m = new Map();
    list.forEach((r) => { const n = String(r.거래처명 || "").trim() || "(거래처명 없음)"; if (!m.has(n)) m.set(n, { n, cnt: 0, bad: 0, s: 0, d: 0 }); const g = m.get(n); g.cnt++; g.s += S(r); g.d += D(r); if (P(r) <= 0) g.bad++; });
    return [...m.values()].sort((a, b) => b.cnt - a.cnt);
  }, [list]);
  return (
    <>
      <Kpis items={[
        ["대기·수작업 표시 오더", `${list.length}건`],
        ["그중 수익 0원 이하", `${list.filter((r) => P(r) <= 0).length}건`, "추가비용 청구 누락 의심", "#b91c1c"],
        ["해당 오더 수익 합", won(list.reduce((s, r) => s + P(r), 0))],
      ]} />
      <Note>
        현재 오더에 <b>대기비·수작업비 전용 칸이 없어서</b> 메모·오더메모·전달사항·화물내용에 "대기 / 수작업 / 상하차비 / 작업비 / 추가비" 등이 적힌 오더를 찾아 보여줍니다.
        기사에게 추가비용을 줬는데 업체 청구에 반영 안 된 건(수익 0원 이하)을 업체에 별도 청구할 근거로 쓰세요 (답변 6번 근거).
      </Note>
      <Card title="거래처별 요약">
        <Table minWidth={700} headers={["거래처", "건수", "수익 0원 이하", "청구운임 합", "기사운임 합", "수익"]}
          rows={byClient.map((g) => [{ v: g.n, style: { textAlign: "left" } }, `${g.cnt}건`, { v: `${g.bad}건`, style: { color: g.bad ? "#b91c1c" : "#9ca3af" } }, won(g.s), won(g.d), won(g.s - g.d)])} />
      </Card>
      <Card title={`오더 목록 (${list.length}건)`} right={<button style={btn(false)} onClick={() => downloadCsv(`대기수작업_${month}`, ["상차일", "거래처", "노선", "키워드", "청구운임", "기사운임", "수익", "메모"], list.map((r) => [r.상차일, r.거래처명, route(r), kw(r), S(r), D(r), P(r), memoOf(r)]))}>CSV 저장</button>}>
        <Table minWidth={1200} headers={["상차일", "거래처", "상차지 → 하차지", "키워드", "청구운임", "기사운임", "수익", "판단", "메모 내용"]}
          rows={list.map((r) => [dayLabel(r.상차일), r.거래처명, { v: route(r), style: { textAlign: "left" } }, kw(r), won(S(r)), won(D(r)), won(P(r)), P(r) <= 0 ? { v: "청구 누락 의심", style: { color: "#b91c1c", fontWeight: 900 } } : { v: "반영됨", style: { color: "#047857" } }, { v: memoOf(r).slice(0, 60), style: { textAlign: "left", fontWeight: 500, whiteSpace: "normal", minWidth: 260 } }])} />
      </Card>
    </>
  );
}

// ════════════════ ⑤ 월 특이사항(일자별) ════════════════
const REASONS = [
  { k: "neg", l: "역마진", t: (r) => S(r) > 0 && P(r) < 0 },
  { k: "zero", l: "수익 0원", t: (r) => S(r) > 0 && P(r) === 0 },
  { k: "loss", l: "지급방식 손실", t: (r) => String(r.지급방식 || "").trim() === "손실" },
  { k: "noSale", l: "청구운임 미입력", t: (r) => S(r) === 0 && D(r) > 0 },
  { k: "person", l: "거래처 '개인'/공란", t: (r) => { const n = String(r.거래처명 || "").trim(); return !n || /^개인/.test(n); } },
];
function SpecialTab({ all, month }) {
  const [on, setOn] = useState(() => Object.fromEntries(REASONS.map((x) => [x.k, true])));
  const [copied, setCopied] = useState(false);
  const list = useMemo(() => all.filter((r) => !r.__fixed && !isCanceled(r) && String(r.상차일 || "").startsWith(month)).map((r) => ({ r, why: REASONS.filter((x) => on[x.k] && x.t(r)).map((x) => x.l) })).filter((x) => x.why.length).sort((a, b) => String(a.r.상차일).localeCompare(String(b.r.상차일))), [all, month, on]);
  const byDay = useMemo(() => {
    const m = new Map();
    list.forEach((x) => { const d = x.r.상차일; if (!m.has(d)) m.set(d, new Map()); const c = m.get(d); const n = String(x.r.거래처명 || "").trim() || "거래처없음"; c.set(n, (c.get(n) || 0) + 1); });
    return [...m.entries()];
  }, [list]);
  const text = `${Number(month.slice(5))}월 배차 내역 중 특이사항\n\n` + byDay.map(([d, c]) => `${dayLabel(d)} ${[...c.entries()].map(([n, k]) => `${n} ${k}건`).join(", ")}`).join("\n");
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { window.prompt("복사해서 쓰세요", text); } };
  return (
    <>
      <Card title="특이 기준 선택" right={<>{REASONS.map((x) => <button key={x.k} style={btn(on[x.k])} onClick={() => setOn((p) => ({ ...p, [x.k]: !p[x.k] }))}>{x.l}</button>)}</>}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <pre style={{ flex: "1 1 360px", margin: 0, background: "#f8fafc", border: "1px solid #e2e7ef", borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, whiteSpace: "pre-wrap", fontFamily: "inherit", maxHeight: 360, overflow: "auto" }}>{text}</pre>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button style={btn(true)} onClick={copy}>{copied ? "복사됨 ✓" : "보고 문구 복사"}</button>
          </div>
        </div>
        <div style={{ marginTop: 10 }}><Note>
          거래처명이 "개인"인 오더는 아래 목록의 <b>상차지·하차지·전화번호·메모·등록자</b>로 어디인지 확인하세요 (사진 속 "10/3 개인 1건 — 개인이 어딘지" 질문 대응).
          ※ "배차일보 결재" 기능은 현재 프로그램에 없어, 결재 여부는 이 표에서 확인되지 않습니다.
        </Note></div>
      </Card>
      <Card title={`특이 오더 목록 (${list.length}건)`} right={<button style={btn(false)} onClick={() => downloadCsv(`특이사항_${month}`, ["상차일", "거래처", "사유", "상차지", "하차지", "전화번호", "청구운임", "기사운임", "수익", "지급방식", "등록자", "메모"], list.map((x) => [x.r.상차일, x.r.거래처명, x.why.join("/"), x.r.상차지명, x.r.하차지명, x.r.상차지담당자번호 || x.r.전화번호 || "", S(x.r), D(x.r), P(x.r), x.r.지급방식, creatorOf(x.r), memoOf(x.r)]))}>CSV 저장</button>}>
        <Table minWidth={1300} headers={["상차일", "거래처", "사유", "상차지 → 하차지", "연락처", "청구운임", "기사운임", "수익", "지급방식", "등록자", "메모"]}
          rows={list.map((x) => [dayLabel(x.r.상차일), { v: x.r.거래처명 || "(없음)", style: { fontWeight: 900 } }, { v: x.why.join(", "), style: { color: "#b91c1c" } }, { v: route(x.r), style: { textAlign: "left" } }, x.r.상차지담당자번호 || x.r.전화번호 || "", won(S(x.r)), won(D(x.r)), { v: won(P(x.r)), style: { color: P(x.r) < 0 ? "#b91c1c" : undefined, fontWeight: 900 } }, x.r.지급방식 || "", creatorOf(x.r), { v: memoOf(x.r).slice(0, 50), style: { textAlign: "left", fontWeight: 500 } }])} />
      </Card>
    </>
  );
}

const TABS = [
  ["recon", "① 금액 대사"],
  ["zero", "② 수수료 0% 거래처"],
  ["holiday", "③ 명절 전후 운임"],
  ["extra", "④ 대기비·수작업비"],
  ["special", "⑤ 월 특이사항(일자별)"],
];

// rawOrders: 배차상태 상관없이 전체 오더(취소·배차중 포함) · fixedRows: 매출관리에서 쓰는 고정거래처 행(__fixed)
export default function SalesInquiry({ rawOrders = [], fixedRows = [], onClose }) {
  const [month, setMonth] = useState(() => shiftMonth(kstMonth(), -1));
  const [tab, setTab] = useState(() => { try { return localStorage.getItem("kpSalesInquiryTab") || "recon"; } catch { return "recon"; } });
  useEffect(() => { try { localStorage.setItem("kpSalesInquiryTab", tab); } catch { /* 무시 */ } }, [tab]);
  useLoadOrderRange(monthStartAgo(month, 1), monthEnd(shiftMonth(month, 1))); // ★ 고른 달 ± 1개월
  useStaffNames();
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const all = useMemo(() => [...(rawOrders || []), ...(fixedRows || []).map((r) => ({ ...r, __fixed: true }))], [rawOrders, fixedRows]);
  const months = useMemo(() => Array.from({ length: 13 }, (_, i) => shiftMonth(kstMonth(), -i)), []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99990, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif", wordBreak: "keep-all" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#f4f6f9", width: "min(1600px, 100%)", height: "min(95vh, 1200px)", borderRadius: 18, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        <div style={{ background: NAVY, padding: "14px 22px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ color: "#fff", fontSize: 19, fontWeight: 900, flex: 1 }}>매출 질의 점검표 <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.7)", marginLeft: 6 }}>최고관리자 전용</span></div>
          <CustomSelect value={month} onChange={(e) => setMonth(e.target.value)} style={{ height: 36, borderRadius: 8, border: "none", padding: "0 26px 0 10px", fontSize: 15, fontWeight: 800, background: "#fff", color: "#0F1A30" }}>
            {months.map((m) => <option key={m} value={m}>{m.slice(0, 4)}년 {Number(m.slice(5))}월</option>)}
          </CustomSelect>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: "rgba(255,255,255,.85)", fontSize: 24, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 6, padding: "10px 18px 0", flexWrap: "wrap" }}>
          {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ ...btn(tab === k), height: 36, fontSize: 14 }}>{l}</button>)}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          {tab === "recon" && <ReconcileTab all={all} month={month} />}
          {tab === "zero" && <ZeroFeeTab all={all} month={month} />}
          {tab === "holiday" && <HolidayTab all={all} month={month} />}
          {tab === "extra" && <ExtraCostTab all={all} month={month} />}
          {tab === "special" && <SpecialTab all={all} month={month} />}
        </div>
      </div>
    </div>
  );
}
