// ======================= src/ProInsight.jsx =======================
// 💎 프로 요금제 전용 "인사이트" — 이미 쌓인 배차 데이터만으로 돈이 되는 정보를 뽑아준다.
//  ① 수익성: 거래처별 매출·수익·마진율·건당 수익과 직전 기간 대비 증감
//  ② 저마진 경고: 마진율이 기준 미만이거나 역마진인 오더
//  ③ 이상 운임 감지: 같은 노선·차종 평균보다 청구운임이 크게 벗어난 오더(입력 실수·덤핑 의심)
//  ④ 노선 Top: 수익이 큰 노선과 평균 운임
//  ⑤ 화주 월간 운송 리포트: 거래처를 고르면 화주에게 그대로 보낼 수 있는 리포트(PDF 인쇄) — 마진 등 내부 정보는 빠진다
import React from "react";

const MONO = "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace";
const n = (v) => Number(String(v ?? "").replace(/[^\d-]/g, "")) || 0;
const won = (v) => `${Math.round(v || 0).toLocaleString()}`;
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const pad = (x) => String(x).padStart(2, "0");
const ymKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const isCanceled = (r) => /취소/.test(String(r.배차상태 || "")) || /취소/.test(String(r.지급방식 || ""));

const PERIODS = [
  { key: "this", label: "이번 달" },
  { key: "last", label: "지난 달" },
  { key: "q", label: "최근 3개월" },
];
function rangeOf(key) {
  const now = new Date();
  const first = (y, m) => new Date(y, m, 1);
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  let s, e, ps, pe;
  if (key === "this") { s = first(now.getFullYear(), now.getMonth()); e = now; ps = first(now.getFullYear(), now.getMonth() - 1); pe = new Date(ps.getFullYear(), ps.getMonth(), now.getDate()); }
  else if (key === "last") { s = first(now.getFullYear(), now.getMonth() - 1); e = new Date(now.getFullYear(), now.getMonth(), 0); ps = first(now.getFullYear(), now.getMonth() - 2); pe = new Date(now.getFullYear(), now.getMonth() - 1, 0); }
  else { s = first(now.getFullYear(), now.getMonth() - 2); e = now; ps = first(now.getFullYear(), now.getMonth() - 5); pe = new Date(now.getFullYear(), now.getMonth() - 2, 0); }
  return { s: fmt(s), e: fmt(e), ps: fmt(ps), pe: fmt(pe) };
}

function Card({ code, title, right, children, className = "" }) {
  return (
    <div className={`bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)] overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-3 px-5 h-[50px] border-b border-[#EEF1F6] bg-[#F7F9FC]">
        <div className="flex items-center gap-2 min-w-0"><span className="text-[10px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>{code}</span><span className="text-[15.5px] font-black text-[#0F1A30] truncate">{title}</span></div>
        {right}
      </div>
      <div>{children}</div>
    </div>
  );
}
const Bar = ({ v, max }) => <div className="h-1.5 rounded-full bg-[#EEF2F8] overflow-hidden"><div className="h-full rounded-full bg-[#2D4C82]" style={{ width: `${Math.max(2, Math.min(100, pct(v, max)))}%` }} /></div>;

export default function ProInsight({ data = [], companyName = "", onOpenOrder }) {
  const [period, setPeriod] = React.useState("this");
  const [minMargin, setMinMargin] = React.useState(5);
  const [reportClient, setReportClient] = React.useState("");
  const [reportMonth, setReportMonth] = React.useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return ymKey(d); });
  const { s, e, ps, pe } = rangeOf(period);
  const valid = React.useMemo(() => data.filter((r) => r.상차일 && !isCanceled(r) && n(r.청구운임) > 0), [data]);
  const cur = valid.filter((r) => r.상차일 >= s && r.상차일 <= e);
  const prev = valid.filter((r) => r.상차일 >= ps && r.상차일 <= pe);

  const agg = (rows, keyFn) => {
    const m = new Map();
    rows.forEach((r) => {
      const k = keyFn(r); if (!k) return;
      const o = m.get(k) || { key: k, cnt: 0, rev: 0, cost: 0 };
      o.cnt++; o.rev += n(r.청구운임); o.cost += n(r.기사운임); m.set(k, o);
    });
    return [...m.values()].map((o) => ({ ...o, profit: o.rev - o.cost, margin: pct(o.rev - o.cost, o.rev) }));
  };
  const tot = (rows) => { const rev = rows.reduce((a, r) => a + n(r.청구운임), 0); const cost = rows.reduce((a, r) => a + n(r.기사운임), 0); return { cnt: rows.length, rev, profit: rev - cost, margin: pct(rev - cost, rev) }; };
  const T = tot(cur), P = tot(prev);
  const delta = (a, b) => (b ? ((a - b) / b) * 100 : null);

  const clients = agg(cur, (r) => String(r.거래처명 || "").trim()).sort((a, b) => b.profit - a.profit);
  const prevClients = Object.fromEntries(agg(prev, (r) => String(r.거래처명 || "").trim()).map((o) => [o.key, o]));
  const maxProfit = Math.max(1, ...clients.map((c) => Math.abs(c.profit)));

  const routeKey = (r) => `${String(r.상차지명 || "").trim()} → ${String(r.하차지명 || "").trim()}`;
  const routes = agg(cur, (r) => (r.상차지명 && r.하차지명 ? routeKey(r) : "")).filter((o) => o.cnt >= 2).sort((a, b) => b.profit - a.profit).slice(0, 10);

  const lowMargin = cur.map((r) => ({ r, profit: n(r.청구운임) - n(r.기사운임), margin: pct(n(r.청구운임) - n(r.기사운임), n(r.청구운임)) }))
    .filter((x) => x.margin < minMargin).sort((a, b) => a.margin - b.margin).slice(0, 40);

  // 이상 운임: 최근 13개월 같은 노선+차종 평균 대비 ±35% 이상(표본 4건 이상)
  const routeStats = React.useMemo(() => {
    const m = new Map();
    valid.forEach((r) => { const k = `${routeKey(r)}|${r.차량종류 || ""}|${r.차량톤수 || ""}`; const a = m.get(k) || []; a.push(n(r.청구운임)); m.set(k, a); });
    return m;
  }, [valid]);
  const anomalies = cur.map((r) => {
    const arr = routeStats.get(`${routeKey(r)}|${r.차량종류 || ""}|${r.차량톤수 || ""}`) || [];
    if (arr.length < 4) return null;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    const dev = pct(n(r.청구운임) - avg, avg);
    return Math.abs(dev) >= 35 ? { r, avg, dev } : null;
  }).filter(Boolean).sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev)).slice(0, 30);

  // ─── 화주 월간 리포트 ───
  const allClients = [...new Set(valid.map((r) => String(r.거래처명 || "").trim()).filter(Boolean))].sort();
  const printReport = () => {
    if (!reportClient) { window.alert("거래처를 골라 주세요."); return; }
    const rows = valid.filter((r) => String(r.거래처명 || "").trim() === reportClient && String(r.상차일).slice(0, 7) === reportMonth).sort((a, b) => String(a.상차일).localeCompare(String(b.상차일)));
    if (!rows.length) { window.alert("그 달에 이 거래처 운송 기록이 없습니다."); return; }
    const total = rows.reduce((a, r) => a + n(r.청구운임), 0);
    const byRoute = agg(rows, routeKey).sort((a, b) => b.cnt - a.cnt).slice(0, 8);
    const byDay = {}; rows.forEach((r) => { byDay[r.상차일] = (byDay[r.상차일] || 0) + 1; });
    const days = Object.keys(byDay).sort();
    const maxDay = Math.max(1, ...Object.values(byDay));
    const vehicles = agg(rows, (r) => `${r.차량톤수 || ""} ${r.차량종류 || ""}`.trim() || "기타").sort((a, b) => b.cnt - a.cnt);
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(reportClient)} ${reportMonth} 운송 리포트</title><style>
      @page{size:A4;margin:12mm} body{font-family:'Pretendard','Noto Sans KR',sans-serif;color:#0F1A30;margin:0}
      .hero{background:#0F1A30;color:#fff;padding:22px 26px;border-radius:14px;display:flex;justify-content:space-between;align-items:flex-end}
      .eb{font-family:monospace;font-size:10px;letter-spacing:.3em;color:#8FB0F0;font-weight:800} h1{margin:4px 0 0;font-size:24px}
      .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}
      .k{border:1px solid #E3E8F0;border-radius:12px;padding:10px 12px}.k b{display:block;font-family:monospace;font-size:20px;margin-top:2px}.k span{font-size:11px;color:#7A89A3;font-weight:700}
      h3{font-size:13px;margin:16px 0 6px} table{width:100%;border-collapse:collapse;font-size:11px} th{background:#1B2B4B;color:#fff;padding:6px;text-align:center} td{border-bottom:1px solid #E3E8F0;padding:5px 6px}
      .bars{display:flex;align-items:flex-end;gap:3px;height:70px;border-bottom:1px solid #CBD5E3;padding:0 2px}.bars div{flex:1;background:#2D4C82;border-radius:3px 3px 0 0}
      .foot{margin-top:18px;font-size:10px;color:#8A97AD;display:flex;justify-content:space-between}
    </style></head><body>
      <div class="hero"><div><div class="eb">MONTHLY TRANSPORT REPORT</div><h1>${esc(reportClient)} 귀하 · ${reportMonth.replace("-", "년 ")}월 운송 리포트</h1></div><div style="font-size:12px;text-align:right">${esc(companyName)}<br/>발행 ${new Date().toLocaleDateString("ko-KR")}</div></div>
      <div class="kpis"><div class="k"><span>운송 건수</span><b>${rows.length}건</b></div><div class="k"><span>운송 금액(VAT 별도)</span><b>${won(total)}원</b></div><div class="k"><span>건당 평균</span><b>${won(total / rows.length)}원</b></div><div class="k"><span>운행일</span><b>${days.length}일</b></div></div>
      <h3>일자별 운송량</h3><div class="bars">${days.map((d) => `<div title="${d}" style="height:${(byDay[d] / maxDay) * 100}%"></div>`).join("")}</div>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:#8A97AD;margin-top:2px"><span>${days[0]}</span><span>${days[days.length - 1]}</span></div>
      <h3>주요 노선</h3><table><thead><tr><th>노선</th><th>건수</th><th>금액</th></tr></thead><tbody>${byRoute.map((o) => `<tr><td>${esc(o.key)}</td><td style="text-align:center">${o.cnt}</td><td style="text-align:right">${won(o.rev)}원</td></tr>`).join("")}</tbody></table>
      <h3>차량별</h3><table><thead><tr><th>차량</th><th>건수</th><th>금액</th></tr></thead><tbody>${vehicles.map((o) => `<tr><td>${esc(o.key)}</td><td style="text-align:center">${o.cnt}</td><td style="text-align:right">${won(o.rev)}원</td></tr>`).join("")}</tbody></table>
      <h3>운송 내역</h3><table><thead><tr><th>상차일</th><th>상차지</th><th>하차지</th><th>차량</th><th>화물</th><th>금액</th></tr></thead><tbody>${rows.map((r) => `<tr><td style="text-align:center">${esc(r.상차일)}</td><td>${esc(r.상차지명)}</td><td>${esc(r.하차지명)}</td><td>${esc(`${r.차량톤수 || ""} ${r.차량종류 || ""}`)}</td><td>${esc(r.화물내용)}</td><td style="text-align:right">${won(n(r.청구운임))}</td></tr>`).join("")}</tbody></table>
      <div class="foot"><span>본 리포트는 ${esc(companyName)}의 배차 기록을 바탕으로 자동 작성되었습니다.</span><span>KP-Flow</span></div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  const kpi = (label, v, d, unit = "원") => (
    <div className="rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3">
      <div className="text-[11.5px] font-bold text-white/55">{label}</div>
      <div className="text-[22px] font-black tabular-nums mt-0.5" style={{ fontFamily: MONO }}>{v}<span className="text-[12px] text-white/50 ml-1">{unit}</span></div>
      {d != null && <div className="text-[11.5px] font-bold text-[#8FB0F0]">{d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1)}% <span className="text-white/40">직전 기간 대비</span></div>}
    </div>
  );
  const th = "px-3 py-2.5 text-[12px] font-black text-white bg-[#1B2B4B] whitespace-nowrap";
  const td = "px-3 py-2 text-[13px] border-t border-[#EEF1F6]";

  return (
    <div className="space-y-4 px-6 py-5">
      {/* 머리말 */}
      <div className="relative rounded-[24px] overflow-hidden text-white px-7 py-6" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <span className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
        <div className="relative flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>PRO · INSIGHT</div>
            <div className="text-[26px] font-black mt-1">수익성 인사이트</div>
            <div className="text-[13px] text-white/60 mt-0.5">{s} ~ {e} · 취소 제외 · 청구운임 있는 오더 기준</div>
          </div>
          <div className="flex gap-1 p-1 rounded-xl bg-white/10 border border-white/15">
            {PERIODS.map((p) => <button key={p.key} type="button" onClick={() => setPeriod(p.key)} className={`h-9 px-4 rounded-lg text-[13px] font-black ${period === p.key ? "bg-white text-[#0F1A30]" : "text-white/70 hover:text-white"}`}>{p.label}</button>)}
          </div>
        </div>
        <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-5">
          {kpi("매출(청구)", won(T.rev), delta(T.rev, P.rev))}
          {kpi("수익(청구-기사)", won(T.profit), delta(T.profit, P.profit))}
          {kpi("마진율", T.margin.toFixed(1), null, "%")}
          {kpi("운송 건수", T.cnt.toLocaleString(), delta(T.cnt, P.cnt), "건")}
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-start">
        <Card code="CLIENTS" title={`거래처 수익성 (${clients.length}곳)`}>
          <div className="overflow-x-auto max-h-[520px]">
            <table className="w-full"><thead className="sticky top-0"><tr>{["거래처", "건수", "매출", "수익", "마진율", "건당 수익", "직전 대비"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>{clients.map((c) => { const p0 = prevClients[c.key]; const d = p0 ? delta(c.profit, p0.profit) : null; return (
                <tr key={c.key} className="hover:bg-[#F7F9FC]">
                  <td className={`${td} font-black text-[#0F1A30] min-w-[160px]`}><div className="truncate max-w-[220px]">{c.key}</div><Bar v={Math.abs(c.profit)} max={maxProfit} /></td>
                  <td className={`${td} text-center tabular-nums`}>{c.cnt}</td>
                  <td className={`${td} text-right tabular-nums`} style={{ fontFamily: MONO }}>{won(c.rev)}</td>
                  <td className={`${td} text-right tabular-nums font-black ${c.profit < 0 ? "text-[#2D4C82] underline decoration-[#8FB0F0] decoration-2" : "text-[#0F1A30]"}`} style={{ fontFamily: MONO }}>{won(c.profit)}</td>
                  <td className={`${td} text-center`}><span className={`px-2 py-0.5 rounded-md text-[12px] font-black ${c.margin < minMargin ? "bg-[#0F1A30] text-white" : "bg-[#EEF2F8] text-[#1B2B4B]"}`}>{c.margin.toFixed(1)}%</span></td>
                  <td className={`${td} text-right tabular-nums`} style={{ fontFamily: MONO }}>{won(c.profit / c.cnt)}</td>
                  <td className={`${td} text-center text-[12px] font-bold text-[#2D4C82]`}>{d == null ? "신규" : `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(0)}%`}</td>
                </tr>); })}
                {!clients.length && <tr><td colSpan={7} className="py-14 text-center text-[#9AA9C3]">이 기간 데이터가 없습니다.</td></tr>}
              </tbody></table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card code="ROUTES" title="수익 Top 노선 (2건 이상)">
            <div className="divide-y divide-[#EEF1F6]">
              {routes.map((o, i) => (
                <div key={o.key} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-7 h-7 rounded-lg bg-[#0F1A30] text-white text-[12px] font-black flex items-center justify-center tabular-nums">{i + 1}</span>
                  <div className="flex-1 min-w-0"><div className="text-[13.5px] font-black text-[#0F1A30] truncate">{o.key}</div><div className="text-[11.5px] font-bold text-[#7A89A3]">{o.cnt}건 · 평균 {won(o.rev / o.cnt)}원 · 마진 {o.margin.toFixed(1)}%</div></div>
                  <div className="text-[14px] font-black tabular-nums text-[#0F1A30]" style={{ fontFamily: MONO }}>{won(o.profit)}</div>
                </div>
              ))}
              {!routes.length && <div className="py-10 text-center text-[#9AA9C3]">반복 노선이 없습니다.</div>}
            </div>
          </Card>

          <Card code="REPORT" title="화주 월간 운송 리포트">
            <div className="p-5 space-y-3">
              <div className="text-[12.5px] text-[#5B6B85]">거래처(화주)에게 그대로 보낼 수 있는 월간 리포트를 만듭니다. 마진·기사운임 같은 내부 정보는 들어가지 않습니다.</div>
              <div className="grid grid-cols-[1fr_150px] gap-2">
                <select value={reportClient} onChange={(e) => setReportClient(e.target.value)} className="h-11 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-bold"><option value="">거래처 선택</option>{allClients.map((c) => <option key={c}>{c}</option>)}</select>
                <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="h-11 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-bold" />
              </div>
              <button type="button" onClick={printReport} className="w-full h-11 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black hover:bg-[#1B2B4B]">리포트 만들기 · PDF 저장</button>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 items-start">
        <Card code="ALERT" title={`저마진 경고 (${lowMargin.length}건)`} right={
          <label className="flex items-center gap-1.5 text-[12px] font-bold text-[#5B6B85]">기준 마진율
            <input type="number" value={minMargin} onChange={(e) => setMinMargin(Number(e.target.value) || 0)} className="w-14 h-8 px-2 rounded-lg border border-[#DCE3EE] text-right font-black" />%</label>}>
          <div className="max-h-[420px] overflow-y-auto divide-y divide-[#EEF1F6]">
            {lowMargin.map(({ r, profit, margin }) => (
              <button key={r._id || r.id} type="button" onClick={() => onOpenOrder?.(r)} className="w-full text-left flex items-center gap-3 px-5 py-2.5 hover:bg-[#F7F9FC]">
                <span className={`w-16 text-center py-1 rounded-md text-[12px] font-black ${margin < 0 ? "bg-[#0F1A30] text-white" : "bg-[#EEF2F8] text-[#1B2B4B]"}`}>{margin.toFixed(1)}%</span>
                <div className="flex-1 min-w-0"><div className="text-[13px] font-black text-[#0F1A30] truncate">{r.거래처명} · {r.상차지명} → {r.하차지명}</div><div className="text-[11.5px] font-bold text-[#7A89A3]">{r.상차일} · 청구 {won(n(r.청구운임))} / 기사 {won(n(r.기사운임))}</div></div>
                <span className="text-[13px] font-black tabular-nums" style={{ fontFamily: MONO }}>{won(profit)}</span>
              </button>
            ))}
            {!lowMargin.length && <div className="py-10 text-center text-[#9AA9C3]">기준 미만 오더가 없습니다.</div>}
          </div>
        </Card>
        <Card code="ANOMALY" title={`이상 운임 감지 (${anomalies.length}건)`} right={<span className="text-[11.5px] font-bold text-[#7A89A3]">같은 노선·차량 평균 대비 ±35%</span>}>
          <div className="max-h-[420px] overflow-y-auto divide-y divide-[#EEF1F6]">
            {anomalies.map(({ r, avg, dev }) => (
              <button key={r._id || r.id} type="button" onClick={() => onOpenOrder?.(r)} className="w-full text-left flex items-center gap-3 px-5 py-2.5 hover:bg-[#F7F9FC]">
                <span className="w-16 text-center py-1 rounded-md text-[12px] font-black bg-[#0F1A30] text-white">{dev > 0 ? "+" : ""}{dev.toFixed(0)}%</span>
                <div className="flex-1 min-w-0"><div className="text-[13px] font-black text-[#0F1A30] truncate">{r.상차지명} → {r.하차지명} · {r.차량톤수} {r.차량종류}</div><div className="text-[11.5px] font-bold text-[#7A89A3]">{r.상차일} · {r.거래처명} · 이 오더 {won(n(r.청구운임))} / 평균 {won(avg)}</div></div>
              </button>
            ))}
            {!anomalies.length && <div className="py-10 text-center text-[#9AA9C3]">눈에 띄는 이상 운임이 없습니다.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
