// ======================= src/SettleHome.jsx =======================
// 🧭 2026-11-14 정산 홈 — 정산관리 첫 화면. "이번 달에 뭐가 남았지?"를 한눈에 보고, 누르면 그 일을 하는 기존 화면으로 간다
//  🛠 2026-11-16 리디자인 2 — 거래처정산과 같은 모양(흰 카드 · 남색). ① 청구월 + 합계 ② 정산 공정 6단계(누르면 아래 표를 그 단계 미완료로 거름)
//     ③ 거래처별 정산 현황(배차마감 · 명세서 · 계산서 · 입금 · 미수금) ④ 미수 연령 분석 · 거래처 원장
//  · 기존 화면(거래처정산 · 용차지급관리 · 입금 확인 · 지입정산관리 · 지게차 지급)은 하나도 바꾸지 않았다 — 여기서는 숫자를 모아 보여 주고 길만 안내한다
//  · ① 월 마감 진행판: 오더 확정 → 명세서 → 계산서 → 입금 → 기사 지급 → 마감 (단계마다 남은 건수 · 금액 · 진행 막대)
//  · ② 미수 경과: 아직 안 들어온 돈을 30 · 60 · 90일로 나눠 거래처별로
//  · ③ 거래처 원장: 거래처를 찾으면(입력하면서 고르기) 달마다 청구 · 입금 · 미수 잔액이 통장처럼
//  데이터: 오더(청구운임 · 기사운임 · 지급상태 · 입금상태 · 계산서일 · 마감월) + arDesk(거래처 × 월 명세서 단계)
//  계산은 아래 summarizeSettle() 한 곳(순수 함수) — scripts/settleHome.test.mjs
import React from "react";
import { useArDesk, stageLabel, sdCard, sdBtn, sdBtnPri, sdInp, Ico, IC, viewStage, MonthPicker, FlowTrack } from "./SettleDesk";
import { MarginPct, profitColor } from "./marginPct"; // ⭐ 2026-11-17 매출이익 옆 매출 대비 % · 매출이익 색(플러스 빨강 · 마이너스 파랑)
import BillingBoard from "./BillingBoard"; // 🧾 2026-11-17 청구 현황판(미청구 · 청구완료 · 입금완료)
import { closeBoard } from "./closeFlow"; // ✅ 2026-11-16 2단계 마감 숫자
import { n, won, short, kstYm, monthOf, stageFinder, summarizeSettle, clientLedger } from "./settleCore";
export { summarizeSettle, clientLedger } from "./settleCore";

const NUM = { fontVariantNumeric: "tabular-nums" };
// ── 화면 부품 ──────────────────────────────────────────────
// 🎨 2026-11-16 바탕색 없이 선과 글씨색으로만 — 초록 끝 · 주황 기다림 · 빨강 고칠 것 · 파랑 지금 할 일

// 입력하면서 고르는 거래처 찾기(드롭다운 + 검색)
function ClientCombo({ options, value, onChange }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [act, setAct] = React.useState(0);
  const box = React.useRef(null);
  React.useEffect(() => { const off = (e) => { if (!box.current?.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", off); return () => document.removeEventListener("mousedown", off); }, []);
  const nq = q.replace(/\s/g, "").toLowerCase();
  const list = (nq ? options.filter((o) => o.name.replace(/\s/g, "").toLowerCase().includes(nq)) : options).slice(0, 60);
  const pick = (name) => { onChange(name); setQ(""); setOpen(false); };
  return (
    <div ref={box} className="relative w-full sm:w-[340px]" data-kp="settle-client-combo">
      <input value={open ? q : (value || "")} placeholder="거래처명 입력 또는 선택" onFocus={() => { setOpen(true); setQ(""); setAct(0); }} onChange={(e) => { setQ(e.target.value); setOpen(true); setAct(0); }}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setAct((a) => Math.min(list.length - 1, a + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); } else if (e.key === "Enter" && list[act]) { e.preventDefault(); pick(list[act].name); } else if (e.key === "Escape") setOpen(false); }}
        className="h-11 w-full rounded-xl border border-[#DCE2EC] bg-transparent pl-3.5 pr-9 text-[15px] font-bold text-[#0F1A30] outline-none focus:border-[#1B2B4B] focus:ring-4 focus:ring-[#4B6CB7]/10" />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A879C] pointer-events-none"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg></span>
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1.5 max-h-[320px] overflow-y-auto rounded-xl border border-[#DCE3EE] bg-white shadow-[0_18px_40px_rgba(15,26,48,0.18)] py-1">
          {list.length === 0 ? <div className="px-3.5 py-3 text-[14px] text-[#7A879C]">찾는 거래처가 없습니다</div> : list.map((o, i) => (
            <button key={o.name} type="button" onMouseEnter={() => setAct(i)} onClick={() => pick(o.name)} className={`w-full h-10 px-3.5 flex items-center gap-2 text-left ${i === act ? "text-[#2457D6]" : ""}`}>
              <span className={`flex-1 min-w-0 truncate text-[14.5px] font-bold ${i === act ? "text-[#2457D6]" : "text-[#0F1A30]"}`}>{o.name}</span>
              {o.unpaid > 0 && <span className="text-[12.5px] font-black text-[#B4342A] whitespace-nowrap" style={NUM}>미수 {short(o.unpaid)}</span>}
            </button>))}
        </div>)}
    </div>
  );
}

import { START_KEY, settleStartTab } from "./settleStart";

const NUMS = { fontVariantNumeric: "tabular-nums" };
const G = { ok: "#0F7A52", warn: "#B25F00", bad: "#C62F25", blue: "#2457D6", mute: "#9AA9C3", sub: "#5B6B85", ink: "#0F1A30" };
// 거래처 한 곳의 배차마감 상태
export const closeText = (r) => {
  if (!r) return { t: "-", c: G.mute, done: false };
  if (r.changed && r.status !== "none") return { t: "마감 후 변경", c: G.bad, done: false };
  if (r.status === "approved") return { t: r.doc?.unlocked ? "일시해제" : "최종마감", c: r.doc?.unlocked ? G.warn : G.ok, done: true };
  if (r.status === "submitted") return { t: "배차마감", c: G.ok, done: true };
  if (r.status === "rejected") return { t: "반려", c: G.bad, done: false };
  if (r.status === "verified") return { t: "검증", c: G.blue, done: false };
  return { t: "마감 전", c: G.mute, done: false };
};

export default function SettleHome({ orders = [], company = "", onGo, depositOn = false }) {
  const desk = useArDesk(company);
  const stageOf = React.useMemo(() => { const f = stageFinder(desk?.stmts); return (c, m) => viewStage(f(c, m)); }, [desk?.stmts]);
  const months = React.useMemo(() => { const set = new Set([kstYm(0), kstYm(-1)]); (orders || []).forEach((o) => { const m = monthOf(o); if (/^\d{4}-\d{2}$/.test(m)) set.add(m); }); return [...set].sort().reverse().slice(0, 24); }, [orders]);
  const [ym, setYm] = React.useState(() => kstYm(0));
  const S = React.useMemo(() => summarizeSettle(orders, ym, stageOf), [orders, ym, stageOf]);
  const closeOf = React.useCallback((c, m) => desk?.closes?.get(`${c}|${m}`) || null, [desk?.closes]);
  const board = React.useMemo(() => closeBoard(orders, ym, { closeOf }), [orders, ym, closeOf]);
  const boardMap = React.useMemo(() => new Map(board.map((r) => [r.client, r])), [board]);
  const [view, setView] = React.useState(() => { try { return localStorage.getItem("kpSettleHomeView") === "board" ? "board" : "flow"; } catch { return "flow"; } });
  const setViewSave = (v) => { setView(v); try { localStorage.setItem("kpSettleHomeView", v); } catch { /* 무시 */ } };
  const [client, setClient] = React.useState("");
  const [stepF, setStepF] = React.useState("");
  const [q, setQ] = React.useState("");
  const comboOptions = React.useMemo(() => { const un = new Map(S.aging.map((a) => [a.client, a.total])); const names = new Set(); (orders || []).forEach((o) => { const c = String(o.거래처명 || "").trim(); if (c && n(o.청구운임) > 0) names.add(c); }); return [...names].map((name) => ({ name, unpaid: un.get(name) || 0 })).sort((a, b) => b.unpaid - a.unpaid || a.name.localeCompare(b.name, "ko")); }, [orders, S.aging]);
  const ledger = React.useMemo(() => (client ? clientLedger(orders, client, stageOf) : []), [orders, client, stageOf]);
  const [startOld, setStartOld] = React.useState(() => settleStartTab() === "거래처정산");
  const agingTotal = S.aging.reduce((a, x) => ({ d30: a.d30 + x.d30, d60: a.d60 + x.d60, d90: a.d90 + x.d90, over: a.over + x.over, total: a.total + x.total }), { d30: 0, d60: 0, d90: 0, over: 0, total: 0 });
  const go = (tab, d) => onGo?.(tab === "입금확인" && !depositOn ? "거래처정산" : tab, d);
  const step = (k) => S.steps.find((x) => x.key === k) || { left: 0, amount: 0, total: 0 };
  const [y, m] = ym.split("-").map(Number);
  React.useEffect(() => setStepF(""), [ym]);

  // 거래처별 정산 현황
  const rows = React.useMemo(() => S.clients.map((c) => {
    const st = viewStage(c.stage); const idx = ["미작성", "작성", "계산서발행", "마감"].indexOf(st);
    const b = boardMap.get(c.client); const ct = closeText(b);
    const unpaid = idx >= 3 ? 0 : Math.max(0, c.sale - c.paid);
    // 🗂 2026-11-16 진행 순서 — 마감 전(0) → 배차마감(1) → 명세서 작성(2) → 계산서 발행(3) → 입금 완료(4, 맨 아래)
    const level = unpaid <= 0 && c.sale > 0 ? 4 : idx >= 2 ? 3 : idx >= 1 ? 2 : ct.done ? 1 : 0;
    return { ...c, st, idx, ct, unpaid, level };
  }).sort((a, b) => a.level - b.level || b.sale - a.sale), [S.clients, boardMap]);
  const total = rows.length;
  const steps = [
    { k: "close", no: "01", label: "배차마감", done: rows.filter((r) => r.ct.done).length, total, test: (r) => !r.ct.done, go: () => go("거래처정산", { tab: "invoice", board: true }), link: "거래처정산" },
    { k: "write", no: "02", label: "명세서 작성", done: rows.filter((r) => r.idx >= 1).length, total, test: (r) => r.idx < 1, go: () => go("거래처정산", { tab: "invoice", board: true }), link: "명세서" },
    { k: "tax", no: "03", label: "계산서 발행", done: rows.filter((r) => r.idx >= 2).length, total, test: (r) => r.idx < 2, go: () => go("거래처정산", { tab: "invoice", board: true }), link: "명세서" },
    { k: "deposit", no: "04", label: "입금 확인", done: rows.filter((r) => r.unpaid <= 0).length, total, test: (r) => r.unpaid > 0, go: () => go("거래처정산", { tab: "unsettledMonth" }), link: "미수금관리", amt: rows.reduce((a, r) => a + r.unpaid, 0) },
    { k: "payout", no: "05", label: "기사 지급", done: step("payout").total - step("payout").left, total: step("payout").total, unit: "건", go: () => go("지급관리"), link: "용차지급관리", amt: step("payout").amount },
    { k: "end", no: "06", label: "정산 마감", done: rows.filter((r) => r.idx >= 3).length, total, test: (r) => r.idx < 3, go: () => go("거래처정산", { tab: "invoice", board: true }), link: "명세서" },
  ];
  const cur = steps.findIndex((x) => x.done < x.total);
  const fStep = steps.find((x) => x.k === stepF);
  const nq = q.replace(/\s/g, "").toLowerCase();
  const shown = rows.filter((r) => (!fStep?.test || fStep.test(r)) && (!nq || r.client.replace(/\s/g, "").toLowerCase().includes(nq)));
  const openStmt = (c) => go("거래처정산", { tab: "invoice", client: c, ym });
  const th = "px-3 py-2.5 font-black sticky top-0 bg-[#F8FAFD] z-[1] whitespace-nowrap";

  // 🧾 2026-11-17 정산 홈 보기 — [정산 진행](예전 화면) · [청구 현황판](미청구 · 청구완료 · 입금완료 한 번에). 고른 보기는 이 브라우저에 기억
  const viewSw = (
    <div className="inline-flex p-1 rounded-xl bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(15,26,48,0.04)]" role="tablist" data-kp="settle-home-view">
      {[["flow", "정산 진행"], ["board", "청구 현황판"]].map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setViewSave(k)} className={`h-9 px-4 rounded-lg text-[14px] font-black transition ${view === k ? "bg-[#0F1A30] text-white" : "text-[#5B6B85] hover:text-[#0F1A30]"}`}>{l}</button>))}
    </div>);
  if (view === "board") return (
    <div className="space-y-3">{viewSw}<BillingBoard orders={orders} stageOf={stageOf} months={months} onGo={go} depositOn={depositOn} /></div>);

  return (
    <div className="space-y-3 text-[#0F1A30]" data-kp="settle-home">
      {viewSw}
      {/* ① 청구월 · 합계 */}
      <div className={`${sdCard} p-4`}>
        <div className="flex items-center gap-3 flex-wrap">
          <MonthPicker ym={ym} onChange={setYm} months={months} />
          <div className="ml-auto grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2" style={NUMS}>
            {[["매출(청구)", S.sale, G.ink], ["매입(기사·지게차 등)", S.buy, G.sub], ["매출이익", S.profit, profitColor(S.profit, { neutral: G.ink })], ["미수 잔액", agingTotal.total, agingTotal.total ? G.bad : G.ink]].map(([l, v, c]) => (
              <div key={l} className="text-right"><div className="text-[12.5px] font-bold text-[#5B6B85]">{l}</div><div className="text-[19px] font-black leading-tight whitespace-nowrap" style={{ color: c }}>{won(v)}<span className="text-[12.5px] text-[#9AA9C3] ml-0.5">원</span>{l === "매출이익" &&<MarginPct profit={S.profit} sales={S.sale} />}</div></div>))}
          </div>
        </div>

        {/* ② 정산 공정 */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-1.5" data-kp="settle-flow">
          {steps.map((x, i) => { const on = stepF === x.k; const now = i === cur; const fin = x.total > 0 && x.done >= x.total; const left = Math.max(0, x.total - x.done); return (
            <button key={x.k} type="button" data-step={x.k} onClick={() => (x.test ? setStepF(on ? "" : x.k) : x.go())} title={x.test ? `${x.label} 미완료 거래처만 보기` : `${x.link}로 이동`}
              className={`relative text-left rounded-xl px-3 py-2.5 border transition ${on ? "bg-[#0F1A30] border-[#0F1A30] text-white shadow-[0_8px_18px_rgba(15,26,48,0.2)]" : now ? "bg-white border-[#2457D6]" : "bg-white border-[#DCE3EE] hover:border-[#8FB0F0]"}`}>
              <div className="flex items-center gap-1.5">
                <span className={`w-6 h-5 rounded-md text-[10.5px] font-black flex items-center justify-center ${on ? "bg-white/15 text-white" : fin ? "bg-[#E8F5EF] text-[#0F7A52]" : now ? "kp-step-now bg-[#0F1A30] text-white" : "bg-[#EEF3FB] text-[#2D4C82]"}`} style={NUMS}>{x.no}</span>
                <span className={`text-[13.5px] font-black truncate ${on ? "text-white" : ""}`}>{x.label}</span>
                {now && !on && <span className="ml-auto text-[11px] font-black text-[#2457D6]">진행</span>}
              </div>
              <div className={`mt-1.5 text-[22px] font-black leading-none ${on ? "text-white" : fin ? "text-[#0F7A52]" : ""}`} style={NUMS}>{x.done.toLocaleString()}<span className={`text-[13px] ml-0.5 ${on ? "text-white/60" : "text-[#9AA9C3]"}`}>/{x.total.toLocaleString()}{x.unit || "곳"}</span></div>
              <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: on ? "rgba(255,255,255,.18)" : "#EEF2F8" }}><div className="h-full rounded-full" style={{ width: `${x.total ? Math.round((x.done / x.total) * 100) : 0}%`, background: on ? "#fff" : fin ? G.ok : "#2D4C82" }} /></div>
              <div className={`mt-1.5 text-[12px] font-bold truncate ${on ? "text-white/70" : "text-[#9AA9C3]"}`} style={NUMS}>{fin ? "완료" : x.amt ? `미처리 ${left}${x.unit || "곳"} · ${short(x.amt)}원` : `미처리 ${left}${x.unit || "곳"}`}</div>
            </button>); })}
        </div>
      </div>

      {/* ③ 거래처별 정산 현황 */}
      <div className={`${sdCard} overflow-hidden`} data-kp="settle-clients">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#E3E8F0] flex-wrap">
          <div className="text-[15.5px] font-black mr-2">거래처별 정산 현황 <span className="text-[13px] font-bold text-[#9AA9C3]" style={NUMS}>{shown.length}/{total}곳</span></div>
          {fStep && <button type="button" onClick={() => setStepF("")} className="h-8 px-3 rounded-lg bg-[#EEF3FB] text-[#1B2B4B] text-[13px] font-black inline-flex items-center gap-1.5">{fStep.label} 미완료<Ico d={IC.x} size={12} w={2.6} /></button>}
          <div className="relative w-full sm:w-[220px] sm:ml-auto">
            <Ico d={IC.search} size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA9C3] pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처 검색" className={`${sdInp} pl-9 !h-9`} />
          </div>
          <button type="button" onClick={() => go("거래처정산", { tab: "invoice", board: true })} className={`${sdBtn} !h-9`}>거래처정산 열기</button>
        </div>
        {!shown.length ? (
          <div className="py-14 text-center"><div className="text-[15px] font-black">{total ? "조건에 맞는 거래처가 없어요" : `${m}월 청구 대상 오더가 없어요`}</div></div>
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="kp-sd kp-grid w-full" style={{ minWidth: 980 }}>
              <thead><tr className="text-left text-[13px] text-[#5B6B85]">
                <th className={`${th} text-center w-[52px]`}>No</th><th className={th}>거래처</th><th className={`${th} text-right`}>건수</th><th className={`${th} text-right`}>청구액</th>
                <th className={`${th} text-center`}>정산 진행 (배차마감 → 명세서 → 계산서 → 입금)</th><th className={`${th} text-right`}>미수금</th><th className={th} />
              </tr></thead>
              <tbody>{shown.map((r, i) => (
                <tr key={r.client} onDoubleClick={() => openStmt(r.client)} className="border-t border-[#EEF2F8] hover:bg-[#F8FAFD]">
                  <td className="px-3 py-2.5 text-center text-[12.5px] text-[#9AA9C3]" style={NUMS}>{i + 1}</td>
                  <td className="px-3 py-2.5 text-[14.5px] font-black max-w-[240px] truncate">{r.client}</td>
                  <td className="px-3 py-2.5 text-right text-[14px] text-[#3A4A66]" style={NUMS}>{r.count.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-[14.5px] font-black whitespace-nowrap" style={NUMS}>{won(r.sale)}</td>
                  <td className="px-3 py-2"><div className="max-w-[420px] mx-auto"><FlowTrack compact steps={[
                    { label: "배차마감", done: r.ct.done, text: r.ct.t, bad: r.ct.c === G.bad },
                    { label: "명세서", done: r.idx >= 1, text: r.idx >= 1 ? "작성" : "미작성" },
                    { label: "계산서", done: r.idx >= 2, text: r.idx >= 2 ? "발행" : "미발행" },
                    { label: "입금", done: r.unpaid <= 0, text: r.unpaid <= 0 ? "완료" : r.paid > 0 ? "부분입금" : "미입금" },
                  ]} /></div></td>
                  <td className="px-3 py-2.5 text-right text-[14px] font-black whitespace-nowrap" style={{ ...NUMS, color: r.unpaid > 0 ? G.bad : G.mute }}>{r.unpaid > 0 ? won(r.unpaid) : "-"}</td>
                  <td className="px-3 py-2 text-right"><button type="button" onClick={() => openStmt(r.client)} className="h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black">명세서</button></td>
                </tr>))}</tbody>
            </table>
          </div>)}
        <div className="px-4 py-2 border-t border-[#E3E8F0] bg-[#F8FAFD] text-[12.5px] text-[#9AA9C3]">배차마감 = 배차 담당자가 배차현황 › 월 마감에서 1차 마감한 거래처 · 위 공정 칸을 누르면 그 단계 미완료 거래처만 보여요 · 줄을 두 번 누르면 명세서</div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {/* ④ 미수 연령 분석 */}
        <div className={`${sdCard} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-[#E3E8F0] flex items-center gap-2 flex-wrap">
            <div className="text-[15.5px] font-black mr-auto">미수 연령 분석</div>
            <button type="button" data-kp="settle-bank" onClick={() => go("거래처정산", { tab: "unsettledMonth", bank: true })} className={`${sdBtn} !h-9`}>입금내역 자동 대사</button>
          </div>
          <div className="grid grid-cols-4 border-b border-[#EEF2F8]" style={NUMS}>
            {[["30일 이내", agingTotal.d30, G.sub], ["31~60일", agingTotal.d60, G.warn], ["61~90일", agingTotal.d90, G.bad], ["90일 초과", agingTotal.over, G.bad]].map(([l, v, c], i) => (
              <div key={l} className={`px-4 py-2.5 ${i ? "border-l border-[#EEF2F8]" : ""}`}><div className="text-[12px] font-bold text-[#9AA9C3]">{l}</div><div className="text-[16px] font-black" style={{ color: v ? c : G.mute }}>{short(v)}</div></div>))}
          </div>
          {S.aging.length === 0 ? <div className="py-10 text-center text-[14px] text-[#9AA9C3]">미수금이 없어요</div> : (
            <div className="max-h-[300px] overflow-y-auto">
              {S.aging.slice(0, 40).map((a) => { const old = a.over ? "90일+" : a.d90 ? "61일+" : a.d60 ? "31일+" : "30일 내"; const c = a.over || a.d90 ? G.bad : a.d60 ? G.warn : G.mute; return (
                <button key={a.client} type="button" onClick={() => setClient(a.client)} className={`w-full flex items-center gap-3 px-4 py-2.5 border-b border-[#EEF2F8] last:border-b-0 text-left hover:bg-[#F8FAFD] ${client === a.client ? "bg-[#EEF3FB]" : ""}`}>
                  <span className="w-[52px] shrink-0 text-[12.5px] font-black" style={{ color: c }}>{old}</span>
                  <span className="flex-1 min-w-0 truncate text-[14px] font-bold">{a.client}</span>
                  <span className="text-right text-[14px] font-black whitespace-nowrap" style={NUMS}>{won(a.total)}</span>
                </button>); })}
            </div>)}
        </div>

        {/* ⑤ 거래처 원장 */}
        <div className={`${sdCard} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-[#E3E8F0] flex items-center gap-2 flex-wrap">
            <div className="text-[15.5px] font-black mr-auto">거래처 원장</div>
            <ClientCombo options={comboOptions} value={client} onChange={setClient} />
          </div>
          {!client ? <div className="py-12 text-center text-[14px] text-[#9AA9C3]">거래처를 고르면 월별 청구 · 입금 · 잔액이 나와요</div>
            : ledger.length === 0 ? <div className="py-12 text-center text-[14px] text-[#9AA9C3]">청구 내역이 없어요</div> : (
              <div className="max-h-[300px] overflow-auto">
                <table className="kp-sd kp-grid w-full" style={NUMS}>
                  <thead><tr className="text-[13px] text-[#5B6B85]">{["정산월", "건수", "청구", "입금", "잔액(누계)", "단계"].map((h, i) => <th key={h} className={`${th} ${i === 0 || i === 5 ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
                  <tbody>{[...ledger].reverse().map((x) => (
                    <tr key={x.ym} className="border-t border-[#EEF2F8]">
                      <td className="px-3 py-2.5 text-[14px] font-black">{`${x.ym.slice(2, 4)}.${x.ym.slice(5)}`}</td>
                      <td className="px-3 py-2.5 text-right text-[14px]">{x.count.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right text-[14px] font-bold">{won(x.sale)}</td>
                      <td className="px-3 py-2.5 text-right text-[14px] text-[#5B6B85]">{x.paid ? won(x.paid) : "-"}</td>
                      <td className="px-3 py-2.5 text-right text-[14px] font-black" style={{ color: x.balance > 0 ? G.bad : G.mute }}>{won(x.balance)}</td>
                      <td className="px-3 py-2.5 text-[13px] font-bold text-[#5B6B85]">{stageLabel(viewStage(x.stage))}</td>
                    </tr>))}</tbody>
                </table>
              </div>)}
          {client && <div className="px-4 py-2.5 border-t border-[#E3E8F0] flex justify-end"><button type="button" onClick={() => go("거래처정산", { tab: "invoice", client, ym: ledger.some((x) => x.ym === ym) ? ym : (ledger[ledger.length - 1]?.ym || ym) })} className={`${sdBtnPri} !h-9`}>{client} 명세서 열기</button></div>}
        </div>
      </div>

      <label className="flex items-center gap-2 text-[12.5px] font-bold text-[#9AA9C3] cursor-pointer">
        <input type="checkbox" className="w-4 h-4 accent-[#0F1A30]" checked={startOld} onChange={(e) => { setStartOld(e.target.checked); try { localStorage.setItem(START_KEY, e.target.checked ? "거래처정산" : "홈"); } catch { /* 무시 */ } }} />
        정산관리를 열 때 거래처정산부터 보기
      </label>
    </div>
  );
}
