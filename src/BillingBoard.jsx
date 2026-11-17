// ======================= src/BillingBoard.jsx =======================
// 🧾 2026-11-17 정산 홈 › 청구 현황판 — 미청구 · 청구완료 · 입금완료(지급완료)를 화주사(명세서) + 개별오더(OUT 콜) 한 화면에
//  · 받을 돈: 화주사(거래처 × 월) + 개별오더 · 줄 돈: 용차 기사 운임(계산서 전 → 계산서 받음 → 지급완료)
//  · 칸을 누르면 그 일을 하는 화면(거래명세서 · 입금 확인 · 용차지급관리)으로 간다. 계산은 settleCore.billingBoard(순수 함수 · scripts/billingBoard.test.mjs)
import React from "react";
import { sdCard, sdBtn, sdInp, Ico, IC } from "./SettleDesk";
import { billingBoard, BILL_STATUS, PAY_STATUS, won, kstYm } from "./settleCore";
import { routeGroupOf, rgLabel, RG_NONE } from "./routeGroups";

const NUMS = { fontVariantNumeric: "tabular-nums" };
const COLS = [
  { k: "unbilled", color: "#D92D20", soft: "#FEF3F2", line: "#F9C9C4" },
  { k: "billed", color: "#C4600A", soft: "#FFF6ED", line: "#F6D3B0" },
  { k: "paid", color: "#2D6BE0", soft: "#EEF4FF", line: "#C7D7FB" },
];
const ymText = (ym) => (ym ? `${ym.slice(2, 4)}.${ym.slice(5)}` : "");

export default function BillingBoard({ orders = [], stageOf, months = [], onGo, depositOn = false }) {
  const [mode, setMode] = React.useState("ar"); // ar 받을 돈 · ap 줄 돈
  const [from, setFrom] = React.useState(() => kstYm(-2));
  const [to, setTo] = React.useState(() => kstYm(0));
  const [kind, setKind] = React.useState("all"); // all · client · order
  const [rgSel, setRgSel] = React.useState("all");
  const [q, setQ] = React.useState("");
  const B = React.useMemo(() => billingBoard(orders, { from, to, mode, stageOf }), [orders, from, to, mode, stageOf]);
  const rgOf = (x) => (x.kind === "client" ? [...new Set(x.orders.map((o) => routeGroupOf(o) || RG_NONE))] : [routeGroupOf(x.order) || RG_NONE]);
  const groups = React.useMemo(() => { const s = new Set(); B.items.forEach((x) => rgOf(x).forEach((g) => s.add(g))); return [...s]; }, [B.items]); // eslint-disable-line react-hooks/exhaustive-deps
  const nq = q.replace(/\s/g, "").toLowerCase();
  const shown = B.items.filter((x) => (kind === "all" || x.kind === kind)
    && (rgSel === "all" || rgOf(x).includes(rgSel))
    && (!nq || `${x.client}${x.sub || ""}${x.order?.차량번호 || ""}${x.order?.상차지명 || ""}${x.order?.하차지명 || ""}`.replace(/\s/g, "").toLowerCase().includes(nq)));
  const LABEL = mode === "ap" ? PAY_STATUS : BILL_STATUS;
  const sumOf = (st) => { const l = shown.filter((x) => x.status === st); return { count: l.length, amount: l.reduce((a, x) => a + x.amount, 0), vat: l.reduce((a, x) => a + x.vat, 0) }; };
  const grand = shown.reduce((a, x) => a + x.amount, 0);
  const monthOpts = React.useMemo(() => [...new Set([...months, kstYm(0), kstYm(-1), kstYm(-2), from, to])].filter(Boolean).sort().reverse(), [months, from, to]);

  const open = (x) => {
    if (mode === "ap") return onGo?.("지급관리");
    if (x.kind === "client") return onGo?.("거래처정산", { tab: "invoice", client: x.client, ym: x.ym });
    return onGo?.(depositOn ? "입금확인" : "거래처정산", depositOn ? undefined : { tab: "unsettledMonth" });
  };
  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = mode === "ap" ? ["상태", "정산월", "상차일", "기사", "거래처", "기사운임", "부가세포함", "비고"] : ["상태", "구분", "정산월", "상차일", "거래처", "건수", "공급가액", "부가세포함", "입금액", "비고"];
    const lines = [head.join(",")].concat(shown.map((x) => (mode === "ap"
      ? [LABEL[x.status], x.ym, x.date, x.client, x.sub, x.amount, x.vat, x.note]
      : [LABEL[x.status], x.kind === "client" ? "화주사" : "개별오더", x.ym, x.date, x.client, x.count, x.amount, x.vat, x.paid, x.note]).map(esc).join(",")));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" })); a.download = `청구현황_${mode === "ap" ? "지급" : "청구"}_${from}~${to}.csv`; a.click();
  };
  const seg = (on) => `h-9 px-3.5 rounded-lg text-[13.5px] font-black transition ${on ? "bg-[#0F1A30] text-white" : "text-[#5B6B85] hover:text-[#0F1A30]"}`;
  const sel = "h-9 rounded-lg border border-[#D5DDEA] bg-white px-2 text-[13.5px] font-bold text-[#0F1A30] outline-none";

  return (
    <div className="space-y-3 text-[#0F1A30]" data-kp="billing-board">
      <div className={`${sdCard} p-4 space-y-3`}>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex p-1 rounded-xl bg-[#F4F6FA]">
            <button type="button" className={seg(mode === "ar")} onClick={() => setMode("ar")}>받을 돈(청구)</button>
            <button type="button" className={seg(mode === "ap")} onClick={() => setMode("ap")}>줄 돈(기사 지급)</button>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#5B6B85]">기간
            <select className={sel} value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }}>{monthOpts.map((m) => <option key={m} value={m}>{m.replace("-", "년 ")}월</option>)}</select>~
            <select className={sel} value={to} onChange={(e) => { setTo(e.target.value); if (e.target.value < from) setFrom(e.target.value); }}>{monthOpts.map((m) => <option key={m} value={m}>{m.replace("-", "년 ")}월</option>)}</select>
          </span>
          {mode === "ar" && <div className="inline-flex p-1 rounded-xl bg-[#F4F6FA]">
            {[["all", "전체"], ["client", "화주사"], ["order", "개별오더"]].map(([k, l]) => <button key={k} type="button" className={seg(kind === k)} onClick={() => setKind(k)}>{l}</button>)}
          </div>}
          {groups.length > 1 && <select className={sel} value={rgSel} onChange={(e) => setRgSel(e.target.value)} aria-label="노선구분"><option value="all">노선구분 전체</option>{groups.map((g) => <option key={g} value={g}>{rgLabel(g)}</option>)}</select>}
          <div className="relative w-full sm:w-[220px] sm:ml-auto">
            <Ico d={IC.search} size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA9C3] pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === "ap" ? "기사 · 거래처 · 차량번호" : "거래처 · 차량번호 · 상하차지"} className={`${sdInp} pl-9 !h-9`} />
          </div>
          <button type="button" onClick={exportCsv} disabled={!shown.length} className={`${sdBtn} !h-9`}>엑셀 내려받기</button>
        </div>
        {/* 합계 띠 — 칸마다 비율 */}
        <div className="h-2.5 rounded-full overflow-hidden flex bg-[#EEF2F8]" aria-hidden>
          {COLS.map((c) => { const v = sumOf(c.k).amount; return v > 0 ? <div key={c.k} style={{ width: `${(v / (grand || 1)) * 100}%`, background: c.color }} /> : null; })}
        </div>
        <div className="text-[12.5px] font-bold text-[#9AA9C3]" style={NUMS}>{from === to ? `${from.replace("-", "년 ")}월` : `${from.replace("-", "년 ")}월 ~ ${to.replace("-", "년 ")}월`} · 전체 {shown.length.toLocaleString()}줄 · 공급가 {won(grand)}원</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {COLS.map((c) => {
          const s = sumOf(c.k); const list = shown.filter((x) => x.status === c.k);
          return (
            <section key={c.k} className={`${sdCard} overflow-hidden flex flex-col`} data-col={c.k}>
              <header className="px-4 py-3 border-b" style={{ borderColor: c.line, background: c.soft }}>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                  <span className="text-[15.5px] font-black" style={{ color: c.color }}>{LABEL[c.k]}</span>
                  <span className="ml-auto text-[13px] font-black text-[#5B6B85]" style={NUMS}>{s.count.toLocaleString()}줄 · {grand ? Math.round((s.amount / grand) * 100) : 0}%</span>
                </div>
                <div className="mt-1.5 flex items-baseline gap-2 flex-wrap" style={NUMS}>
                  <span className="text-[22px] font-black leading-none">{won(s.amount)}<span className="text-[12.5px] text-[#9AA9C3] ml-0.5">원</span></span>
                  <span className="text-[12.5px] font-bold text-[#7A879C]">부가세 포함 {won(s.vat)}원</span>
                </div>
              </header>
              <div className="max-h-[560px] overflow-y-auto divide-y divide-[#EEF2F8]">
                {!list.length && <div className="py-12 text-center text-[14px] text-[#9AA9C3]">없어요</div>}
                {list.map((x) => (
                  <button key={x.key} type="button" onClick={() => open(x)} className="w-full text-left px-4 py-2.5 hover:bg-[#F8FAFD] transition" title="누르면 처리하는 화면으로 가요">
                    <div className="flex items-center gap-2">
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-black ${x.kind === "client" ? "bg-[#EEF3FB] text-[#1B2B4B]" : "bg-[#F4F0FF] text-[#5B3FB5]"}`}>{mode === "ap" ? "기사" : x.kind === "client" ? "화주사" : "개별오더"}</span>
                      <span className="min-w-0 flex-1 truncate text-[14.5px] font-black">{x.client}</span>
                      <span className="shrink-0 text-[14.5px] font-black" style={NUMS}>{won(x.amount)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[12.5px] font-bold text-[#7A879C]" style={NUMS}>
                      <span>{x.kind === "client" ? `${ymText(x.ym)}월 · ${x.count.toLocaleString()}건` : `${x.date.slice(5).replace("-", ".")} · ${[x.order?.상차지명, x.order?.하차지명].filter(Boolean).join(" → ") || x.sub || ""}`}</span>
                      {x.note && <span className="ml-auto truncate" style={{ color: c.color }}>{x.note}</span>}
                    </div>
                  </button>))}
              </div>
            </section>);
        })}
      </div>
      <div className="text-[12.5px] text-[#9AA9C3] px-1">
        {mode === "ap" ? "기사 운임 기준 · 기사 계산서를 받으면 ‘계산서 받음’, 용차지급관리에서 지급완료하면 ‘지급완료’로 옮겨요. 줄을 누르면 용차지급관리로 가요."
          : "화주사 = 거래처 × 정산월 명세서 한 줄(계산서 발행 → 청구완료, 마감 · 다 입금 → 입금완료) · 개별오더 = OUT 콜 한 건(계산서일 → 청구완료, 입금 확인 → 입금완료). 줄을 누르면 거래명세서 · 입금 확인으로 가요."}
      </div>
    </div>
  );
}
