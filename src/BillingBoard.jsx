// ======================= src/BillingBoard.jsx =======================
// 🧾 2026-11-17 정산 홈 › 청구 현황판(RECEIVABLES BOARD) — 미청구 · 청구완료 · 입금완료를 화주사 정산(명세서) + 개별 오더(OUT 콜) 한 화면에
//  · 매출채권(AR): 화주사 정산(거래처 × 정산월) + 개별 오더 · 매입채무(AP): 용차 기사 운임(계산서 미수취 → 계산서 수취 → 지급완료)
//  · 🎨 2026-11-17 리디자인 2 — 남색 관제판(헤더 · 회수율 링 · 단계 막대) + 3열 레인(단계별 표). 숫자는 기본 글씨체(tabular-nums)
//  · 줄을 누르면 그 일을 하는 화면(거래명세서 · 입금 확인 · 용차지급관리)으로 간다. 계산은 settleCore.billingBoard(scripts/billingBoard.test.mjs)
import React from "react";
import { billingBoard, won, short, kstYm } from "./settleCore";
import { routeGroupOf, rgLabel, RG_NONE } from "./routeGroups";

const NUMS = { fontVariantNumeric: "tabular-nums" };
const MODES = {
  ar: { code: "ACCOUNTS RECEIVABLE", title: "매출채권", desc: "화주사 청구 · 회수", rate: "회수율", rateHint: "입금완료 ÷ 청구 대상",
    lanes: [["unbilled", "미청구", "UNBILLED", "계산서 발행 전"], ["billed", "청구완료", "INVOICED", "입금 대기"], ["paid", "입금완료", "COLLECTED", "회수 완료"]] },
  ap: { code: "ACCOUNTS PAYABLE", title: "매입채무", desc: "용차 기사 운임 지급", rate: "지급률", rateHint: "지급완료 ÷ 지급 대상",
    lanes: [["unbilled", "계산서 미수취", "PENDING", "기사 계산서 대기"], ["billed", "계산서 수취", "RECEIVED", "지급 대기"], ["paid", "지급완료", "SETTLED", "지급 완료"]] },
};
const TONE = {
  unbilled: { c: "#F04866", glow: "rgba(240,72,102,.45)", soft: "#FFF1F3", ink: "#C21D43" },
  billed: { c: "#6C7BFF", glow: "rgba(108,123,255,.45)", soft: "#F1F2FF", ink: "#3F49C9" },
  paid: { c: "#19C29A", glow: "rgba(25,194,154,.45)", soft: "#ECFBF6", ink: "#0B8466" },
};
const KIND = { client: ["화주사 정산", "#1B2B4B", "#EEF3FB"], order: ["개별 오더", "#5B3FB5", "#F4F0FF"], ap: ["용차 기사", "#0F6E7A", "#E9F7F8"] };
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
const monthEnd = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const ymLabel = (ym) => `${ym.slice(0, 4)}.${ym.slice(5)}`;

// 회수율 링
function Ring({ pct = 0, size = 92 }) {
  const r = (size - 12) / 2, C = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <defs><linearGradient id="bbRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7CF5D2" /><stop offset="1" stopColor="#19C29A" /></linearGradient></defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="8" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#bbRing)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(C * p) / 100} ${C}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ filter: "drop-shadow(0 0 6px rgba(25,194,154,.55))", transition: "stroke-dasharray .6s ease" }} />
    </svg>);
}

export default function BillingBoard({ orders = [], stageOf, months = [], onGo, depositOn = false }) {
  const [mode, setMode] = React.useState("ar");
  const [from, setFrom] = React.useState(() => kstYm(-2));
  const [to, setTo] = React.useState(() => kstYm(0));
  const [kind, setKind] = React.useState("all");
  const [rgSel, setRgSel] = React.useState("all");
  const [q, setQ] = React.useState("");
  const today = kstToday();
  const M = MODES[mode];
  const B = React.useMemo(() => billingBoard(orders, { from, to, mode, stageOf }), [orders, from, to, mode, stageOf]);
  const rgOf = (x) => (x.kind === "client" ? [...new Set(x.orders.map((o) => routeGroupOf(o) || RG_NONE))] : [routeGroupOf(x.order) || RG_NONE]);
  const groups = React.useMemo(() => { const s = new Set(); B.items.forEach((x) => rgOf(x).forEach((g) => s.add(g))); return [...s]; }, [B.items]); // eslint-disable-line react-hooks/exhaustive-deps
  const nq = q.replace(/\s/g, "").toLowerCase();
  const shown = B.items.filter((x) => (mode === "ap" || kind === "all" || x.kind === kind)
    && (rgSel === "all" || rgOf(x).includes(rgSel))
    && (!nq || `${x.client}${x.sub || ""}${x.order?.차량번호 || ""}${x.order?.상차지명 || ""}${x.order?.하차지명 || ""}`.replace(/\s/g, "").toLowerCase().includes(nq)));
  const sumOf = (st) => { const l = shown.filter((x) => x.status === st); return { n: l.length, orders: l.reduce((a, x) => a + x.count, 0), amount: l.reduce((a, x) => a + x.amount, 0), vat: l.reduce((a, x) => a + x.vat, 0) }; };
  const S = { unbilled: sumOf("unbilled"), billed: sumOf("billed"), paid: sumOf("paid") };
  const grand = S.unbilled.amount + S.billed.amount + S.paid.amount;
  const pct = (v) => (grand ? (v / grand) * 100 : 0);
  const monthOpts = React.useMemo(() => [...new Set([...months, kstYm(0), kstYm(-1), kstYm(-2), from, to])].filter(Boolean).sort().reverse(), [months, from, to]);
  // 경과일 — 미청구 화주사: 정산월 말일부터 · 개별 오더: 상차일부터 · 청구완료 오더: 계산서일부터
  const ageOf = (x) => {
    if (x.status === "paid") return null;
    if (x.kind === "client") { if (x.status !== "unbilled" || !x.ym) return null; const d = dayDiff(monthEnd(x.ym), today); return d > 0 ? d : null; } // 아직 안 끝난 달은 표시 안 함
    const base = x.status === "billed" ? (x.order?.계산서일 || x.date) : x.date;
    return base ? Math.max(0, dayDiff(String(base).slice(0, 10), today)) : null;
  };
  const open = (x) => {
    if (mode === "ap") return onGo?.("지급관리");
    if (x.kind === "client") return onGo?.("거래처정산", { tab: "invoice", client: x.client, ym: x.ym });
    return onGo?.(depositOn ? "입금확인" : "거래처정산", depositOn ? undefined : { tab: "unsettledMonth" });
  };
  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lab = Object.fromEntries(M.lanes.map(([k, l]) => [k, l]));
    const head = ["단계", "구분", "정산월", "일자", mode === "ap" ? "기사" : "거래처", "건수", "공급가액", "부가세 포함", "경과일", "비고"];
    const lines = [head.join(",")].concat(shown.map((x) => [lab[x.status], mode === "ap" ? KIND.ap[0] : KIND[x.kind][0], x.ym, x.date, x.client, x.count, x.amount, x.vat, ageOf(x) ?? "", x.note].map(esc).join(",")));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" })); a.download = `${M.title}_현황_${from}~${to}.csv`; a.click();
  };

  const glassSeg = (on) => `h-8 px-3.5 rounded-lg text-[13px] font-bold transition ${on ? "bg-white text-[#0B1324] shadow-[0_2px_10px_rgba(0,0,0,.25)]" : "text-white/60 hover:text-white"}`;
  const glassSel = "h-9 rounded-lg bg-white/[0.06] border border-white/15 px-2.5 text-[13px] font-bold text-white outline-none focus:border-[#7CF5D2]/60 [&>option]:text-[#0F1A30]";
  const chip = (on) => `h-8 px-3 rounded-full text-[12.5px] font-bold border transition ${on ? "bg-[#0B1324] border-[#0B1324] text-white" : "bg-white border-[#DCE3EE] text-[#5B6B85] hover:border-[#9AA9C3]"}`;
  const collected = S.paid.amount;

  return (
    <div className="space-y-3 text-[#0F1A30]" data-kp="billing-board">
      {/* ── 관제판 헤더 ── */}
      <section className="relative overflow-hidden rounded-2xl text-white shadow-[0_18px_40px_-18px_rgba(11,19,36,.7)]"
        style={{ background: "radial-gradient(1200px 300px at 85% -40%, rgba(108,123,255,.35), transparent 60%), radial-gradient(800px 260px at -10% 120%, rgba(25,194,154,.22), transparent 60%), linear-gradient(135deg,#0B1324 0%,#111C33 55%,#0E1A30 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-[0.07]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative p-5">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.24em] text-[#7CF5D2]"><span className="w-1.5 h-1.5 rounded-full bg-[#7CF5D2] shadow-[0_0_10px_#7CF5D2] animate-pulse" />{M.code}</div>
              <div className="mt-1 text-[22px] font-black tracking-tight">{M.title} 현황<span className="ml-2 text-[13.5px] font-bold text-white/55">{M.desc}</span></div>
            </div>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <div className="inline-flex p-1 rounded-xl bg-white/[0.07] border border-white/10" role="tablist">
                {[["ar", "매출채권 (AR)"], ["ap", "매입채무 (AP)"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={mode === k} className={glassSeg(mode === k)} onClick={() => setMode(k)}>{l}</button>)}
              </div>
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-white/55">기간
                <select className={glassSel} value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }}>{monthOpts.map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}</select>
                <span className="text-white/35">—</span>
                <select className={glassSel} value={to} onChange={(e) => { setTo(e.target.value); if (e.target.value < from) setFrom(e.target.value); }}>{monthOpts.map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}</select>
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)] gap-5 items-center">
            <div className="flex items-center gap-4">
              <div className="relative grid place-items-center"><Ring pct={pct(collected)} /><div className="absolute text-center"><div className="text-[19px] font-black leading-none" style={NUMS}>{pct(collected).toFixed(1)}<span className="text-[11px] text-white/60">%</span></div><div className="mt-0.5 text-[10.5px] font-bold text-white/55">{M.rate}</div></div></div>
              <div>
                <div className="text-[12px] font-bold text-white/55">총 {mode === "ap" ? "지급" : "청구"} 대상 · 공급가액</div>
                <div className="text-[28px] font-black leading-tight tracking-tight" style={NUMS}>{won(grand)}<span className="text-[14px] text-white/50 ml-1">원</span></div>
                <div className="text-[12px] font-bold text-white/45" style={NUMS}>부가세 포함 {won(S.unbilled.vat + S.billed.vat + S.paid.vat)}원 · {shown.length.toLocaleString()}건 · {M.rateHint}</div>
              </div>
            </div>
            <div className="min-w-0">
              <div className="grid grid-cols-3 gap-2">
                {M.lanes.map(([k, l, en]) => (
                  <div key={k} className="rounded-xl bg-white/[0.05] border border-white/10 px-3.5 py-2.5 backdrop-blur-sm">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] text-white/50"><span className="w-1.5 h-1.5 rounded-full" style={{ background: TONE[k].c, boxShadow: `0 0 8px ${TONE[k].glow}` }} />{en}</div>
                    <div className="mt-1 flex items-baseline gap-1.5 flex-wrap"><span className="text-[13px] font-bold text-white/80">{l}</span><span className="text-[11.5px] font-bold text-white/40" style={NUMS}>{S[k].n.toLocaleString()}건</span></div>
                    <div className="text-[19px] font-black leading-tight" style={NUMS}>{short(S[k].amount)}<span className="text-[11.5px] text-white/45 ml-0.5">원</span><span className="ml-1.5 text-[12px] font-bold" style={{ color: TONE[k].c }}>{pct(S[k].amount).toFixed(1)}%</span></div>
                  </div>))}
              </div>
              <div className="mt-2.5 h-2 rounded-full overflow-hidden flex bg-white/[0.08]" aria-hidden>
                {M.lanes.map(([k]) => (S[k].amount > 0 ? <div key={k} style={{ width: `${pct(S[k].amount)}%`, background: `linear-gradient(90deg, ${TONE[k].c}, ${TONE[k].c}CC)`, boxShadow: `0 0 12px ${TONE[k].glow}` }} /> : null))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 필터 줄 ── */}
      <div className="flex items-center gap-2 flex-wrap rounded-2xl bg-white border border-[#E3E8F0] px-3 py-2.5">
        {mode === "ar" && [["all", "전체"], ["client", "화주사 정산"], ["order", "개별 오더"]].map(([k, l]) => <button key={k} type="button" className={chip(kind === k)} onClick={() => setKind(k)}>{l}</button>)}
        {groups.length > 1 && <select className="h-8 rounded-full border border-[#DCE3EE] bg-white px-3 text-[12.5px] font-bold text-[#1B2B4B] outline-none" value={rgSel} onChange={(e) => setRgSel(e.target.value)} aria-label="노선구분"><option value="all">노선구분 · 전체</option>{groups.map((g) => <option key={g} value={g}>{rgLabel(g)}</option>)}</select>}
        <div className="relative w-full sm:w-[260px] sm:ml-auto">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA9C3]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === "ap" ? "기사 · 거래처 · 차량번호 검색" : "거래처 · 차량번호 · 상하차지 검색"} className="h-9 w-full rounded-full border border-[#DCE3EE] bg-[#F8FAFD] pl-9 pr-3 text-[13px] font-semibold outline-none focus:bg-white focus:border-[#1B2B4B]" />
        </div>
        <button type="button" onClick={exportCsv} disabled={!shown.length} className="h-9 px-4 rounded-full bg-[#0B1324] text-white text-[13px] font-bold inline-flex items-center gap-1.5 disabled:opacity-40 hover:bg-[#1B2B4B]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16" /></svg>엑셀
        </button>
      </div>

      {/* ── 3열 레인 ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {M.lanes.map(([k, l, en, hint]) => {
          const T = TONE[k]; const list = shown.filter((x) => x.status === k);
          return (
            <section key={k} data-col={k} className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,26,48,.04)]">
              <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${T.c}, transparent)` }} />
              <header className="px-4 pt-3 pb-3 border-b border-[#EEF2F8]">
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] font-bold tracking-[0.18em]" style={{ color: T.ink }}>{en}</span>
                  <span className="ml-auto text-[11.5px] font-bold text-[#9AA9C3]">{hint}</span>
                </div>
                <div className="mt-1 flex items-end gap-2">
                  <span className="text-[16px] font-black">{l}</span>
                  <span className="px-1.5 py-0.5 rounded-md text-[11.5px] font-bold" style={{ background: T.soft, color: T.ink, ...NUMS }}>{S[k].n.toLocaleString()}건</span>
                  <span className="ml-auto text-right">
                    <span className="block text-[20px] font-black leading-none" style={NUMS}>{won(S[k].amount)}<span className="text-[11.5px] text-[#9AA9C3] ml-0.5">원</span></span>
                    <span className="block mt-1 text-[11.5px] font-semibold text-[#9AA9C3]" style={NUMS}>VAT 포함 {won(S[k].vat)}</span>
                  </span>
                </div>
              </header>
              <div className="grid grid-cols-[88px_minmax(0,1fr)_auto] gap-2 px-4 py-1.5 bg-[#F8FAFD] border-b border-[#EEF2F8] text-[11px] font-bold text-[#9AA9C3]">
                <span>구분</span><span>{mode === "ap" ? "기사 · 정산월" : "거래처 · 정산월"}</span><span className="text-right">공급가액</span>
              </div>
              <div className="max-h-[560px] overflow-y-auto">
                {!list.length && <div className="py-14 text-center"><div className="mx-auto w-9 h-9 rounded-full grid place-items-center" style={{ background: T.soft, color: T.ink }}>✓</div><div className="mt-2 text-[13px] font-bold text-[#9AA9C3]">해당 건이 없어요</div></div>}
                {list.map((x) => {
                  const kd = mode === "ap" ? KIND.ap : KIND[x.kind]; const age = ageOf(x);
                  const ageTone = age == null ? null : age > 60 ? "#C21D43" : age > 30 ? "#C4600A" : "#7A879C";
                  return (
                    <button key={x.key} type="button" onClick={() => open(x)} title="누르면 처리 화면으로 이동해요"
                      className="group w-full grid grid-cols-[88px_minmax(0,1fr)_auto] gap-2 items-center px-4 py-2.5 text-left border-b border-[#F1F4F9] last:border-b-0 hover:bg-[#F8FAFD] transition relative">
                      <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r opacity-0 group-hover:opacity-100 transition" style={{ background: T.c }} />
                      <span className="justify-self-start px-2 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap" style={{ color: kd[1], background: kd[2] }}>{kd[0]}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-black">{x.client}</span>
                        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#7A879C] min-w-0" style={NUMS}>
                          <span className="shrink-0">{x.kind === "client" ? `${ymLabel(x.ym)} · ${x.count.toLocaleString()}건` : `${x.date.slice(5).replace("-", ".")}`}</span>
                          {x.kind !== "client" && <span className="truncate">{[x.order?.상차지명, x.order?.하차지명].filter(Boolean).join(" → ") || x.sub || ""}</span>}
                          {x.note && <span className="truncate" style={{ color: T.ink }}>· {x.note}</span>}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-[14px] font-black whitespace-nowrap" style={NUMS}>{won(x.amount)}</span>
                        {age != null && <span className="block text-[11px] font-bold" style={{ color: ageTone, ...NUMS }}>D+{age}</span>}
                      </span>
                    </button>);
                })}
              </div>
            </section>);
        })}
      </div>
      <p className="text-[12px] text-[#9AA9C3] px-1 leading-relaxed">
        {mode === "ap" ? "용차 기사 운임 기준 · 기사 세금계산서를 받으면 ‘계산서 수취’, 용차지급관리에서 지급완료하면 ‘지급완료’ · D+ = 상차일(수취 후엔 계산서일)부터 지난 날 · 줄을 누르면 용차지급관리로 이동"
          : "화주사 정산 = 거래처 × 정산월 명세서(세금계산서 발행 → 청구완료, 마감 또는 전액 입금 → 입금완료) · 개별 오더 = OUT 콜 1건(계산서일 → 청구완료, 입금 확인 → 입금완료) · D+ = 정산월 말일(개별 오더는 상차일 · 계산서일)부터 지난 날"}
      </p>
    </div>
  );
}
