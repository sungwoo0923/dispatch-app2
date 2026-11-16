// ======================= src/SettleHome.jsx =======================
// 🧭 2026-11-14 정산 홈 — 정산관리 첫 화면. "이번 달에 뭐가 남았지?"를 한눈에 보고, 누르면 그 일을 하는 기존 화면으로 간다
//  · 기존 화면(거래처정산 · 용차지급관리 · 입금 확인 · 지입정산관리 · 지게차 지급)은 하나도 바꾸지 않았다 — 여기서는 숫자를 모아 보여 주고 길만 안내한다
//  · ① 월 마감 진행판: 오더 확정 → 명세서 → 계산서 → 입금 → 기사 지급 → 마감 (단계마다 남은 건수 · 금액 · 진행 막대)
//  · ② 미수 경과: 아직 안 들어온 돈을 30 · 60 · 90일로 나눠 거래처별로
//  · ③ 거래처 원장: 거래처를 찾으면(입력하면서 고르기) 달마다 청구 · 입금 · 미수 잔액이 통장처럼
//  데이터: 오더(청구운임 · 기사운임 · 지급상태 · 입금상태 · 계산서일 · 마감월) + arDesk(거래처 × 월 명세서 단계)
//  계산은 아래 summarizeSettle() 한 곳(순수 함수) — scripts/settleHome.test.mjs
import React from "react";
import { CustomSelect } from "./CustomSelect";
import { useArDesk, stageLabel } from "./SettleDesk";
import { closeBoard, closeCounts } from "./closeFlow"; // ✅ 2026-11-16 2단계 마감 숫자
import { n, won, short, kstYm, monthOf, stageFinder, summarizeSettle, clientLedger } from "./settleCore";
export { summarizeSettle, clientLedger } from "./settleCore";

const NUM = { fontVariantNumeric: "tabular-nums" };
// ── 화면 부품 ──────────────────────────────────────────────
// 🎨 2026-11-16 바탕색 없이 선과 글씨색으로만 — 초록 끝 · 주황 기다림 · 빨강 고칠 것 · 파랑 지금 할 일
const CARD = "rounded-2xl border border-[#DCE2EC]";
const T = { ok: "text-[#0F7A52]", warn: "text-[#B25F00]", bad: "text-[#C62F25]", blue: "text-[#2457D6]", mute: "text-[#8D97AB]", sub: "text-[#5A6781]", fg: "text-[#16233D]" };
const BTN = "h-10 px-4 rounded-xl border border-[#DCE2EC] bg-transparent text-[13.5px] font-black text-[#16233D] hover:border-[#9FB0CC] whitespace-nowrap";
const BTN_PRI = "h-10 px-4 rounded-xl border border-[#2457D6] bg-transparent text-[13.5px] font-black text-[#2457D6] whitespace-nowrap";

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

export default function SettleHome({ orders = [], company = "", onGo, depositOn = false }) {
  const desk = useArDesk(company);
  const stageOf = React.useMemo(() => stageFinder(desk?.stmts), [desk?.stmts]);
  const months = React.useMemo(() => { const set = new Set([kstYm(0), kstYm(-1)]); (orders || []).forEach((o) => { const m = monthOf(o); if (/^\d{4}-\d{2}$/.test(m)) set.add(m); }); return [...set].sort().reverse().slice(0, 24); }, [orders]);
  const [ym, setYm] = React.useState(() => kstYm(0));
  const S = React.useMemo(() => summarizeSettle(orders, ym, stageOf), [orders, ym, stageOf]);
  // ✅ 2026-11-16 2단계 마감 — 배차자 1차 마감 → 경리 2차 검증 숫자
  const closeOf = React.useCallback((c, m) => desk?.closes?.get(`${c}|${m}`) || null, [desk?.closes]);
  const board = React.useMemo(() => closeBoard(orders, ym, { closeOf }), [orders, ym, closeOf]);
  const cc = React.useMemo(() => closeCounts(board), [board]);
  const [client, setClient] = React.useState("");
  const comboOptions = React.useMemo(() => { const un = new Map(S.aging.map((a) => [a.client, a.total])); const names = new Set(); (orders || []).forEach((o) => { const c = String(o.거래처명 || "").trim(); if (c && n(o.청구운임) > 0) names.add(c); }); return [...names].map((name) => ({ name, unpaid: un.get(name) || 0 })).sort((a, b) => b.unpaid - a.unpaid || a.name.localeCompare(b.name, "ko")); }, [orders, S.aging]);
  const ledger = React.useMemo(() => (client ? clientLedger(orders, client, stageOf) : []), [orders, client, stageOf]);
  const [startOld, setStartOld] = React.useState(() => settleStartTab() === "거래처정산");
  const agingTotal = S.aging.reduce((a, x) => ({ d30: a.d30 + x.d30, d60: a.d60 + x.d60, d90: a.d90 + x.d90, over: a.over + x.over, total: a.total + x.total }), { d30: 0, d60: 0, d90: 0, over: 0, total: 0 });
  const go = (tab, d) => onGo?.(tab === "입금확인" && !depositOn ? "거래처정산" : tab, d);
  const step = (k) => S.steps.find((s) => s.key === k) || { left: 0, amount: 0 };
  // 청구할 곳 — 2차 승인했는데 아직 명세서를 안 보낸 곳(마감 흐름을 안 쓰면 발송 전 전체)
  const stageAt = (c) => stageOf(c, ym);
  const approvedToSend = board.filter((r) => r.status === "approved" && ["미작성", "작성"].includes(stageAt(r.client))).length;
  const useClose = cc.submitted + cc.approved + cc.rejected > 0;
  const toSend = useClose ? approvedToSend : step("send").left;
  const drv = step("payout");
  const over60 = S.aging.filter((a) => a.over + a.d90 > 0).length;
  const cards = [
    { k: "verify", step: "1 · 검증", title: "경리 확인을 기다려요", big: cc.submitted, unit: "곳", desc: cc.rejected ? `배차자가 1차 마감한 거래처예요. 반려해서 고치는 중 ${cc.rejected}곳.` : "배차자가 1차 마감한 거래처예요. 승인하면 청구로 넘어가요.", btn: "검증하러 가기", on: () => go("마감검증") },
    { k: "send", step: "2 · 청구", title: "보낼 명세서", big: toSend, unit: "곳", desc: useClose ? "2차 승인이 끝난 곳이에요. 거래처 양식대로 만들어져요." : "아직 명세서를 보내지 않은 거래처예요.", btn: "명세서 보내기", on: () => go("거래처정산", { tab: "invoice", board: true }) },
    { k: "money", step: "3 · 받기 · 지급", title: "못 받은 돈", big: agingTotal.total, unit: "원", money: true, desc: `60일 넘은 곳 ${over60}곳 · 기사 미지급 ${drv.left.toLocaleString()}건`, btn: "미수금 보기", on: () => go("거래처정산", { tab: "unsettledMonth" }), btn2: drv.left ? "기사 지급" : "", on2: () => go("지급관리") },
  ];
  const hot = cards.findIndex((c) => c.big > 0);

  return (
    <div className="p-1 sm:p-2 space-y-4 text-[#16233D]" data-kp="settle-home">
      {/* 머리 — 달 고르기 + 이 달 숫자(매뉴얼은 오른쪽 위 [정산 매뉴얼] 하나만) */}
      <div className="flex items-end gap-x-6 gap-y-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[21px] font-black">정산 홈</div>
          <div className={`text-[13.5px] ${T.sub}`}>할 일을 검증 → 청구 → 받기 · 지급 순서로 보여 줘요. 지금 할 일은 파란 글씨예요.</div>
        </div>
        <CustomSelect value={ym} onChange={(e) => setYm(e.target.value)} className="h-10 w-[150px] rounded-xl border border-[#DCE2EC] bg-transparent px-3 text-[15px] font-black text-[#16233D]" title="정산월">
          {months.map((m) => <option key={m} value={m}>{`${m.slice(0, 4)}년 ${Number(m.slice(5))}월`}</option>)}
        </CustomSelect>
        <div className="flex items-center gap-6 flex-wrap ml-auto" style={NUM}>
          {[["청구", S.sale], ["기사 지급", S.buy], ["수수료", S.profit]].map(([l, v]) => (
            <div key={l}><div className={`text-[12px] font-bold ${T.mute}`}>{l}</div><div className="text-[18px] font-black whitespace-nowrap">{won(v)}<span className={`text-[13px] font-bold ${T.mute} ml-0.5`}>원</span></div></div>))}
        </div>
      </div>

      {/* 마감 흐름 한 줄 — 글씨색으로만 */}
      <div className="flex gap-x-5 gap-y-1 flex-wrap text-[13.5px] font-black" style={NUM}>
        <span className={T.ok}>2차 승인 {cc.approved}곳</span>
        <span className={T.warn}>검증 대기 {cc.submitted}곳</span>
        <span className={T.bad}>반려 {cc.rejected}곳</span>
        <span className={T.blue}>배차자 검증 완료 {cc.verified || 0}곳</span>
        <span className={T.mute}>검증 전 {cc.none}곳</span>
      </div>

      {/* ① 오늘 할 일 3개 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map((c, i) => { const on = i === hot; return (
          <section key={c.k} className={`${CARD} p-4 flex flex-col gap-2`} data-step={c.k}>
            <div className={`text-[12px] font-black tracking-[0.04em] ${on ? T.blue : T.mute}`}>{c.step}</div>
            <div className="text-[16.5px] font-black">{c.title}</div>
            <div className={`text-[28px] font-black leading-none ${on ? T.blue : c.big ? T.fg : T.mute}`} style={NUM}>{c.money ? won(c.big) : c.big.toLocaleString()}<span className={`text-[14px] font-bold ${T.sub} ml-1`}>{c.unit}</span></div>
            <div className={`text-[13.5px] ${T.sub}`}>{c.desc}</div>
            <div className="mt-auto pt-1 flex gap-2 flex-wrap">
              <button type="button" onClick={c.on} className={on ? BTN_PRI : BTN}>{c.btn}</button>
              {c.btn2 && <button type="button" onClick={c.on2} className={BTN}>{c.btn2}</button>}
            </div>
          </section>); })}
      </div>

      {/* 세부 단계 — 누르면 그 화면으로(숫자가 0이면 끝난 단계) */}
      <div className={`${CARD} px-4 py-3 flex gap-x-5 gap-y-1.5 flex-wrap items-center text-[13.5px]`} style={NUM}>
        <span className={`font-black ${T.sub}`}>세부 단계</span>
        {S.steps.map((s) => (
          <button key={s.key} type="button" onClick={() => go(s.go)} data-step={s.key} title={`${s.label} 화면으로 이동`} className="font-bold hover:underline underline-offset-4">
            {s.label} <span className={s.left ? T.warn : T.ok}>{s.left ? `${s.left.toLocaleString()}${s.unit} 남음` : "끝"}</span>
          </button>))}
        <button type="button" data-kp="settle-bank" onClick={() => go("거래처정산", { tab: "unsettledMonth", bank: true })} className={`ml-auto font-black ${T.blue} hover:underline underline-offset-4`}>입금내역 자동 대사</button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ② 먼저 챙길 거래처(미수 오래된 순) */}
        <section className={`${CARD} p-4`}>
          <div className="flex items-end justify-between gap-3 flex-wrap mb-2">
            <div className="text-[16.5px] font-black">먼저 챙길 거래처</div>
            <div className="text-[13px] font-bold flex gap-3 flex-wrap" style={NUM}>
              <span className={T.sub}>30일 이내 {short(agingTotal.d30)}</span><span className={T.warn}>31~60일 {short(agingTotal.d60)}</span><span className={T.bad}>61~90일 {short(agingTotal.d90)}</span><span className={`${T.bad} font-black`}>90일 초과 {short(agingTotal.over)}</span>
            </div>
          </div>
          {S.aging.length === 0 ? <div className={`py-8 text-center text-[14px] ${T.mute}`}>못 받은 돈이 없어요</div> : (
            <div className="max-h-[320px] overflow-y-auto">
              {S.aging.slice(0, 40).map((a) => { const old = a.over ? "90일+" : a.d90 ? "61일+" : a.d60 ? "31일+" : "30일 안"; const tone = a.over || a.d90 ? T.bad : a.d60 ? T.warn : T.mute; return (
                <button key={a.client} type="button" onClick={() => setClient(a.client)} className="w-full flex items-center gap-3 py-2 border-b border-[#DCE2EC] last:border-b-0 text-left">
                  <span className={`w-[52px] shrink-0 text-[12.5px] font-black ${tone}`}>{old}</span>
                  <span className={`flex-1 min-w-0 truncate text-[14.5px] font-bold ${client === a.client ? T.blue : ""}`}>{a.client}</span>
                  <span className="w-[120px] text-right text-[14.5px] font-black whitespace-nowrap" style={NUM}>{won(a.total)}</span>
                </button>); })}
            </div>)}
          <div className={`mt-2 text-[12.5px] ${T.mute}`}>입금 확인이나 마감이 끝난 청구는 빠져요. 거래처를 누르면 오른쪽에 원장이 나와요.</div>
        </section>

        {/* ③ 거래처 원장 */}
        <section className={`${CARD} p-4`}>
          <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
            <div className="text-[16.5px] font-black">거래처 원장</div>
            <ClientCombo options={comboOptions} value={client} onChange={setClient} />
          </div>
          {!client ? <div className={`py-10 text-center text-[14px] ${T.mute}`}>거래처를 고르면 달마다 청구 · 입금 · 남은 돈이 나와요</div>
            : ledger.length === 0 ? <div className={`py-10 text-center text-[14px] ${T.mute}`}>청구 내역이 없어요</div> : (
              <div className="overflow-x-auto">
                <table className="kp-plain w-full text-[14px] whitespace-nowrap" style={NUM}>
                  <thead><tr className={`text-[12px] ${T.mute}`}>{["월", "건수", "청구", "입금", "잔액(누계)", "단계"].map((h, i) => <th key={h} className={`px-3 py-2 font-bold border-b border-[#DCE2EC] ${i === 0 || i === 5 ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
                  <tbody>{[...ledger].reverse().map((x) => (
                    <tr key={x.ym} className="border-b border-[#DCE2EC] last:border-b-0">
                      <td className="px-3 py-2.5 font-black">{`${x.ym.slice(2, 4)}년 ${Number(x.ym.slice(5))}월`}</td>
                      <td className="px-3 py-2.5 text-right">{x.count.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right font-bold">{won(x.sale)}</td>
                      <td className={`px-3 py-2.5 text-right ${T.sub}`}>{x.paid ? won(x.paid) : "-"}</td>
                      <td className={`px-3 py-2.5 text-right font-black ${x.balance > 0 ? T.bad : T.mute}`}>{won(x.balance)}</td>
                      <td className={`px-3 py-2.5 text-[13px] font-bold ${T.sub}`}>{stageLabel(x.stage)}</td>
                    </tr>))}</tbody>
                </table>
              </div>)}
          {client && <div className="mt-3 flex justify-end"><button type="button" onClick={() => go("거래처정산", { tab: "invoice", client, ym: ledger.some((x) => x.ym === ym) ? ym : (ledger[ledger.length - 1]?.ym || ym) })} className={BTN}>{client} 명세서 열기</button></div>}
        </section>
      </div>

      <label className={`flex items-center gap-2 text-[13px] font-bold ${T.sub} cursor-pointer`}>
        <input type="checkbox" className="w-4 h-4 accent-[#2457D6]" checked={startOld} onChange={(e) => { setStartOld(e.target.checked); try { localStorage.setItem(START_KEY, e.target.checked ? "거래처정산" : "홈"); } catch { /* 무시 */ } }} />
        정산관리를 열 때 예전처럼 거래처정산부터 보기
      </label>
    </div>
  );
}
