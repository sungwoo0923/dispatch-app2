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
import { n, won, short, kstYm, monthOf, stageFinder, summarizeSettle, clientLedger } from "./settleCore";
export { summarizeSettle, clientLedger } from "./settleCore";

const NUM = { fontVariantNumeric: "tabular-nums" };
// ── 화면 부품 ──────────────────────────────────────────────
const CARD = "bg-white rounded-2xl border border-[#E3E8F0] shadow-[0_1px_2px_rgba(15,26,48,0.04)]";
const Eyebrow = ({ children }) => <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">{children}</div>;

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
      <input value={open ? q : (value || "")} placeholder="거래처 이름을 입력하거나 고르세요" onFocus={() => { setOpen(true); setQ(""); setAct(0); }} onChange={(e) => { setQ(e.target.value); setOpen(true); setAct(0); }}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setAct((a) => Math.min(list.length - 1, a + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); } else if (e.key === "Enter" && list[act]) { e.preventDefault(); pick(list[act].name); } else if (e.key === "Escape") setOpen(false); }}
        className="h-11 w-full rounded-xl border border-[#D5DDEA] bg-white pl-3.5 pr-9 text-[15px] font-bold text-[#0F1A30] outline-none focus:border-[#1B2B4B] focus:ring-4 focus:ring-[#4B6CB7]/10" />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A879C] pointer-events-none"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg></span>
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1.5 max-h-[320px] overflow-y-auto rounded-xl border border-[#DCE3EE] bg-white shadow-[0_18px_40px_rgba(15,26,48,0.18)] py-1">
          {list.length === 0 ? <div className="px-3.5 py-3 text-[14px] text-[#7A879C]">찾는 거래처가 없습니다</div> : list.map((o, i) => (
            <button key={o.name} type="button" onMouseEnter={() => setAct(i)} onClick={() => pick(o.name)} className={`w-full h-10 px-3.5 flex items-center gap-2 text-left ${i === act ? "bg-[#F1F5FC]" : ""}`}>
              <span className="flex-1 min-w-0 truncate text-[14.5px] font-bold text-[#0F1A30]">{o.name}</span>
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
  const [client, setClient] = React.useState("");
  const comboOptions = React.useMemo(() => { const un = new Map(S.aging.map((a) => [a.client, a.total])); const names = new Set(); (orders || []).forEach((o) => { const c = String(o.거래처명 || "").trim(); if (c && n(o.청구운임) > 0) names.add(c); }); return [...names].map((name) => ({ name, unpaid: un.get(name) || 0 })).sort((a, b) => b.unpaid - a.unpaid || a.name.localeCompare(b.name, "ko")); }, [orders, S.aging]);
  const ledger = React.useMemo(() => (client ? clientLedger(orders, client, stageOf) : []), [orders, client, stageOf]);
  const [startOld, setStartOld] = React.useState(() => settleStartTab() === "거래처정산");
  const [guide, setGuide] = React.useState(false);
  const firstTodo = S.steps.findIndex((s) => s.left > 0);
  const agingTotal = S.aging.reduce((a, x) => ({ d30: a.d30 + x.d30, d60: a.d60 + x.d60, d90: a.d90 + x.d90, over: a.over + x.over, total: a.total + x.total }), { d30: 0, d60: 0, d90: 0, over: 0, total: 0 });
  const go = (tab) => onGo?.(tab === "입금확인" && !depositOn ? "거래처정산" : tab);

  return (
    <div className="p-1 sm:p-2 space-y-4" data-kp="settle-home">
      {/* 머리 — 달 고르기 + 이 달 숫자 */}
      <div className="rounded-2xl text-white px-5 py-4 flex items-center gap-x-6 gap-y-3 flex-wrap" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
        <div className="min-w-0">
          <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">SETTLEMENT · OVERVIEW</div>
          <div className="mt-0.5 text-[21px] font-black">정산 홈</div>
        </div>
        <CustomSelect value={ym} onChange={(e) => setYm(e.target.value)} className="h-11 w-[150px] rounded-xl border border-white/25 bg-white/10 px-3 text-[15.5px] font-black text-white" title="정산할 달">
          {months.map((m) => <option key={m} value={m}>{`${m.slice(0, 4)}년 ${Number(m.slice(5))}월`}</option>)}
        </CustomSelect>
        <div className="flex items-center gap-6 flex-wrap ml-auto" style={NUM}>
          {[["청구", S.sale], ["기사 지급", S.buy], ["수수료", S.profit]].map(([l, v]) => (
            <div key={l}><div className="text-[12px] font-bold text-[#B9C8E6]">{l}</div><div className="text-[20px] font-black whitespace-nowrap">{won(v)}<span className="text-[13px] font-bold text-[#B9C8E6] ml-0.5">원</span></div></div>))}
        </div>
      </div>

      {/* ① 월 마감 진행판 */}
      <section className={`${CARD} p-5`}>
        <div className="flex items-end justify-between gap-3 flex-wrap mb-4">
          <div><Eyebrow>MONTH CLOSE</Eyebrow><div className="text-[17px] font-black text-[#0F1A30]">{`${Number(ym.slice(5))}월 정산, 여기까지 왔어요`}</div></div>
          <div className="text-[13.5px] font-bold text-[#5B6B85]">{firstTodo < 0 ? "이 달 정산을 모두 마쳤습니다" : `다음 할 일: ${S.steps[firstTodo].label}`}</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          {S.steps.map((s, i) => { const done = s.left === 0; const pct = s.total ? Math.round(((s.total - s.left) / s.total) * 100) : 100; const next = i === firstTodo; return (
            <button key={s.key} type="button" onClick={() => go(s.go)} data-step={s.key} title={`${s.label} — 누르면 그 화면으로 갑니다`}
              className={`text-left rounded-2xl border px-4 py-3.5 transition ${next ? "border-[#1B2B4B] shadow-[0_0_0_4px_rgba(75,108,183,0.12)]" : "border-[#E3E8F0] hover:border-[#9FB3D9]"} bg-white`}>
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full grid place-items-center text-[12px] font-black ${done ? "bg-[#1B2B4B] text-white" : next ? "border-2 border-[#1B2B4B] text-[#1B2B4B]" : "border border-[#C9D5EA] text-[#7A879C]"}`} style={NUM}>{done ? "✓" : i + 1}</span>
                <span className="text-[14.5px] font-black text-[#0F1A30] whitespace-nowrap">{s.label}</span>
              </div>
              <div className="mt-2.5 flex items-baseline gap-1" style={NUM}>
                <span className={`text-[26px] font-black leading-none ${done ? "text-[#9AA9C3]" : "text-[#0F1A30]"}`}>{done ? "완료" : s.left.toLocaleString()}</span>
                {!done && <span className="text-[13px] font-bold text-[#5B6B85]">{s.unit} 남음</span>}
              </div>
              <div className="mt-1 h-[18px] text-[12.5px] font-bold text-[#7A879C] truncate" style={NUM}>{done ? `${s.total.toLocaleString()}${s.unit} 모두 끝` : s.amount ? `${short(s.amount)}원 · ${s.hint}` : s.hint}</div>
              <div className="mt-2.5 h-1.5 rounded-full bg-[#EEF1F6] overflow-hidden"><div className="h-full rounded-full bg-[#1B2B4B] transition-all" style={{ width: `${pct}%` }} /></div>
            </button>); })}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ② 미수 경과 */}
        <section className={`${CARD} p-5`}>
          <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
            <div><Eyebrow>RECEIVABLES</Eyebrow><div className="text-[17px] font-black text-[#0F1A30]">아직 안 들어온 돈</div></div>
            <div className="text-[20px] font-black text-[#0F1A30]" style={NUM}>{won(agingTotal.total)}<span className="text-[13px] font-bold text-[#7A879C] ml-0.5">원</span></div>
          </div>
          {agingTotal.total > 0 && (
            <div className="mb-3">
              <div className="h-3 rounded-full overflow-hidden flex bg-[#EEF1F6]">{[["d30", "#C9D5EA"], ["d60", "#7C97CC"], ["d90", "#2D4C82"], ["over", "#0F1A30"]].map(([k, c]) => <div key={k} style={{ width: `${(agingTotal[k] / agingTotal.total) * 100}%`, background: c }} />)}</div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center" style={NUM}>{[["30일 이내", "d30"], ["31~60일", "d60"], ["61~90일", "d90"], ["90일 넘음", "over"]].map(([l, k]) => <div key={k}><div className="text-[12px] font-bold text-[#7A879C]">{l}</div><div className={`text-[15px] font-black ${k === "over" && agingTotal.over ? "text-[#B4342A]" : "text-[#0F1A30]"}`}>{short(agingTotal[k])}</div></div>)}</div>
            </div>)}
          {S.aging.length === 0 ? <div className="py-8 text-center text-[14px] text-[#7A879C]">미수가 없습니다</div> : (
            <div className="max-h-[300px] overflow-y-auto -mx-1">
              {S.aging.slice(0, 40).map((a) => (
                <button key={a.client} type="button" onClick={() => setClient(a.client)} className="w-full flex items-center gap-3 px-1 py-2 border-b border-[#EEF1F6] text-left hover:bg-[#F7F9FC]">
                  <span className="flex-1 min-w-0 truncate text-[14.5px] font-bold text-[#0F1A30]">{a.client}</span>
                  {a.over + a.d90 > 0 && <span className="text-[12.5px] font-black text-[#B4342A] whitespace-nowrap" style={NUM}>60일 넘음 {short(a.over + a.d90)}</span>}
                  <span className="w-[110px] text-right text-[14.5px] font-black text-[#0F1A30] whitespace-nowrap" style={NUM}>{won(a.total)}</span>
                </button>))}
            </div>)}
          <div className="mt-2 text-[12.5px] text-[#7A879C]">입금 확인을 했거나 그 달을 마감한 청구는 뺍니다. 거래처를 누르면 오른쪽 원장에 나옵니다.</div>
        </section>

        {/* ③ 거래처 원장 */}
        <section className={`${CARD} p-5`}>
          <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
            <div><Eyebrow>LEDGER</Eyebrow><div className="text-[17px] font-black text-[#0F1A30]">거래처 원장</div></div>
            <ClientCombo options={comboOptions} value={client} onChange={setClient} />
          </div>
          {!client ? <div className="py-10 text-center text-[14px] text-[#7A879C]">거래처를 고르면 달마다 청구 · 입금 · 남은 금액이 통장처럼 나옵니다</div>
            : ledger.length === 0 ? <div className="py-10 text-center text-[14px] text-[#7A879C]">청구 내역이 없습니다</div> : (
              <div className="overflow-x-auto rounded-xl border border-[#E3E8F0]">
                <table className="w-full text-[14px] whitespace-nowrap" style={NUM}>
                  <thead><tr className="bg-[#F7F9FC] text-[#5B6B85]">{["달", "건수", "청구", "입금", "남은 금액(누적)", "단계"].map((h, i) => <th key={h} className={`px-3 py-2.5 font-black ${i === 0 || i === 5 ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
                  <tbody>{[...ledger].reverse().map((x) => (
                    <tr key={x.ym} className="border-t border-[#EEF1F6]">
                      <td className="px-3 py-2.5 font-black text-[#0F1A30]">{`${x.ym.slice(2, 4)}년 ${Number(x.ym.slice(5))}월`}</td>
                      <td className="px-3 py-2.5 text-right">{x.count.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right font-bold">{won(x.sale)}</td>
                      <td className="px-3 py-2.5 text-right text-[#5B6B85]">{x.paid ? won(x.paid) : "-"}</td>
                      <td className={`px-3 py-2.5 text-right font-black ${x.balance > 0 ? "text-[#B4342A]" : "text-[#9AA9C3]"}`}>{won(x.balance)}</td>
                      <td className="px-3 py-2.5 text-[13px] font-bold text-[#3A4A66]">{stageLabel(x.stage)}</td>
                    </tr>))}</tbody>
                </table>
              </div>)}
          {client && <div className="mt-3 flex justify-end"><button type="button" onClick={() => go("거래처정산")} className="h-10 px-4 rounded-xl border border-[#C9D5EA] bg-white text-[13.5px] font-black text-[#1B2B4B]">거래처정산에서 명세서 열기</button></div>}
        </section>
      </div>

      {/* 달라진 점 + 시작 화면 고르기 */}
      <section className={`${CARD} px-5 py-4`}>
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={() => setGuide((g) => !g)} className="text-[14px] font-black text-[#1B2B4B] underline underline-offset-4">{guide ? "설명 접기" : "예전과 뭐가 달라졌나요?"}</button>
          <label className="ml-auto flex items-center gap-2 text-[13.5px] font-bold text-[#3A4A66] cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-[#1B2B4B]" checked={startOld} onChange={(e) => { setStartOld(e.target.checked); try { localStorage.setItem(START_KEY, e.target.checked ? "거래처정산" : "홈"); } catch { /* 무시 */ } }} />
            정산관리를 열 때 예전처럼 거래처정산부터 보기
          </label>
        </div>
        {guide && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[14px] leading-relaxed">
            <div className="rounded-xl border border-[#E3E8F0] p-4"><div className="text-[12px] font-extrabold tracking-[0.16em] text-[#94A3B8] mb-1.5">예전</div><ul className="space-y-1 text-[#3A4A66]"><li>· 거래처정산 · 용차지급관리 · 입금 확인을 하나씩 열어 남은 일을 직접 찾음</li><li>· 미수는 미수금관리, 거래처별 잔액은 명세서를 열어 확인</li></ul></div>
            <div className="rounded-xl border border-[#1B2B4B] p-4"><div className="text-[12px] font-extrabold tracking-[0.16em] text-[#4B6CB7] mb-1.5">지금</div><ul className="space-y-1 text-[#0F1A30] font-semibold"><li>· 정산 홈에서 이 달 남은 일을 한눈에 → 칸을 누르면 그 화면으로 바로</li><li>· 미수는 30 · 60 · 90일로 나눠 보고, 거래처를 누르면 원장(달별 청구 · 입금 · 잔액)</li><li>· 예전 화면은 그대로 — 왼쪽 메뉴에서 똑같이 쓸 수 있습니다</li></ul></div>
          </div>)}
      </section>
    </div>
  );
}
