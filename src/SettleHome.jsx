// ======================= src/SettleHome.jsx =======================
// 🧭 2026-11-14 정산 홈 — 정산관리 첫 화면. "이번 달에 뭐가 남았지?"를 한눈에 보고, 누르면 그 일을 하는 기존 화면으로 간다
//  🛠 2026-11-16 리디자인 — ① 이번 달 흐름 5단계(배차 마감 → 명세서 → 계산서 → 입금 → 기사 지급) ② 거래처 진행표(거래처 한 줄에 단계별 ✓)
//     ③ 먼저 챙길 거래처 · 거래처 원장. 마감 검증 탭은 없앴다 — 배차자가 1차 마감하면 거래처정산에 바로 "배차 마감" 표시
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

// 거래처 한 곳의 배차 마감 상태(경리 쪽에서 보는 이름)
export const closeText = (r) => {
  if (!r) return { t: "-", c: T.mute };
  if (r.changed && r.status !== "none") return { t: "마감 뒤 바뀜", c: T.bad };
  if (r.status === "approved" || r.status === "submitted") return { t: "✓ 넘어옴", c: T.ok };
  if (r.status === "rejected") return { t: "돌려보냄", c: T.bad };
  if (r.status === "verified") return { t: "검증 완료", c: T.blue };
  return { t: "배차 확인 중", c: T.mute };
};

export default function SettleHome({ orders = [], company = "", onGo, depositOn = false }) {
  const desk = useArDesk(company);
  const stageOf = React.useMemo(() => stageFinder(desk?.stmts), [desk?.stmts]);
  const months = React.useMemo(() => { const set = new Set([kstYm(0), kstYm(-1)]); (orders || []).forEach((o) => { const m = monthOf(o); if (/^\d{4}-\d{2}$/.test(m)) set.add(m); }); return [...set].sort().reverse().slice(0, 24); }, [orders]);
  const [ym, setYm] = React.useState(() => kstYm(0));
  const S = React.useMemo(() => summarizeSettle(orders, ym, stageOf), [orders, ym, stageOf]);
  const closeOf = React.useCallback((c, m) => desk?.closes?.get(`${c}|${m}`) || null, [desk?.closes]);
  const board = React.useMemo(() => closeBoard(orders, ym, { closeOf }), [orders, ym, closeOf]);
  const boardMap = React.useMemo(() => new Map(board.map((r) => [r.client, r])), [board]);
  const cc = React.useMemo(() => closeCounts(board), [board]);
  const [client, setClient] = React.useState("");
  const [onlyLeft, setOnlyLeft] = React.useState(false);
  const [q, setQ] = React.useState("");
  const comboOptions = React.useMemo(() => { const un = new Map(S.aging.map((a) => [a.client, a.total])); const names = new Set(); (orders || []).forEach((o) => { const c = String(o.거래처명 || "").trim(); if (c && n(o.청구운임) > 0) names.add(c); }); return [...names].map((name) => ({ name, unpaid: un.get(name) || 0 })).sort((a, b) => b.unpaid - a.unpaid || a.name.localeCompare(b.name, "ko")); }, [orders, S.aging]);
  const ledger = React.useMemo(() => (client ? clientLedger(orders, client, stageOf) : []), [orders, client, stageOf]);
  const [startOld, setStartOld] = React.useState(() => settleStartTab() === "거래처정산");
  const agingTotal = S.aging.reduce((a, x) => ({ d30: a.d30 + x.d30, d60: a.d60 + x.d60, d90: a.d90 + x.d90, over: a.over + x.over, total: a.total + x.total }), { d30: 0, d60: 0, d90: 0, over: 0, total: 0 });
  const go = (tab, d) => onGo?.(tab === "입금확인" && !depositOn ? "거래처정산" : tab, d);
  const step = (k) => S.steps.find((s) => s.key === k) || { left: 0, amount: 0, total: 0 };
  const total = S.clients.length;
  const passed = cc.submitted + cc.approved;
  const ym2 = `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;
  const openStmt = (c) => go("거래처정산", { tab: "invoice", client: c, ym });

  // ① 이번 달 흐름 — 남은 것이 있는 첫 단계가 "지금 할 일"
  const flow = [
    { k: "close", label: "배차 마감", sub: "배차자가 넘긴 곳", done: passed, total, left: Math.max(0, total - passed), unit: "곳",
      note: cc.rejected ? `돌려보낸 곳 ${cc.rejected}` : cc.none + (cc.verified || 0) ? `배차 확인 중 ${cc.none + (cc.verified || 0)}` : "", btn: "거래처정산", on: () => go("거래처정산", { tab: "invoice", board: true }) },
    { k: "send", label: "명세서 발송", sub: "보낸 곳", done: total - step("send").left, total, left: step("send").left, unit: "곳", note: step("send").left ? `${short(step("send").amount)}원 남음` : "", btn: "명세서 보내기", on: () => go("거래처정산", { tab: "invoice", board: true }) },
    { k: "tax", label: "계산서 발행", sub: "발행한 곳", done: total - step("tax").left, total, left: step("tax").left, unit: "곳", note: step("tax").left ? `${short(step("tax").amount)}원 남음` : "", btn: "계산서", on: () => go("거래처정산", { tab: "invoice", board: true }) },
    { k: "deposit", label: "입금", sub: "다 받은 곳", done: total - step("deposit").left, total, left: step("deposit").left, unit: "곳", note: step("deposit").left ? `${short(step("deposit").amount)}원 못 받음` : "", btn: "미수금", on: () => go("거래처정산", { tab: "unsettledMonth" }) },
    { k: "payout", label: "기사 지급", sub: "지급한 건", done: step("payout").total - step("payout").left, total: step("payout").total, left: step("payout").left, unit: "건", note: step("payout").left ? `${short(step("payout").amount)}원 미지급` : "", btn: "지급하기", on: () => go("지급관리") },
  ];
  const hot = flow.findIndex((f) => f.left > 0);

  // ② 거래처 진행표
  const rows = React.useMemo(() => S.clients.map((c) => {
    const idx = ["미작성", "작성", "발송", "확인", "계산서요청", "계산서발행", "마감"].indexOf(c.stage);
    const b = boardMap.get(c.client);
    const unpaid = idx >= 6 ? 0 : Math.max(0, c.sale - c.paid);
    const left = (b && (b.status === "submitted" || b.status === "approved") && !b.changed ? 0 : 1) + (idx < 2 ? 1 : 0) + (idx < 5 ? 1 : 0) + (unpaid > 0 ? 1 : 0);
    return { ...c, idx, b, unpaid, left };
  }), [S.clients, boardMap]);
  const nq = q.replace(/\s/g, "").toLowerCase();
  const shown = rows.filter((r) => (!onlyLeft || r.left) && (!nq || r.client.replace(/\s/g, "").toLowerCase().includes(nq)));
  const ck = (ok, t, tone) => <span className={`text-[13px] font-black whitespace-nowrap ${ok ? T.ok : tone || T.mute}`}>{ok ? "✓" : t}</span>;

  return (
    <div className="p-1 sm:p-2 space-y-4 text-[#16233D]" data-kp="settle-home">
      {/* 머리 */}
      <div className="flex items-end gap-x-6 gap-y-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[21px] font-black">정산 홈</div>
          <div className={`text-[13.5px] ${T.sub}`}>{ym2} 정산이 어디까지 왔는지 보여 줘요. 파란 단계가 지금 할 일이에요.</div>
        </div>
        <CustomSelect value={ym} onChange={(e) => setYm(e.target.value)} className="h-10 w-[150px] rounded-xl border border-[#DCE2EC] bg-transparent px-3 text-[15px] font-black text-[#16233D]" title="정산월">
          {months.map((m) => <option key={m} value={m}>{`${m.slice(0, 4)}년 ${Number(m.slice(5))}월`}</option>)}
        </CustomSelect>
        <div className="flex items-center gap-6 flex-wrap ml-auto" style={NUM}>
          {[["청구", S.sale], ["기사 지급", S.buy], ["수수료", S.profit]].map(([l, v]) => (
            <div key={l}><div className={`text-[12px] font-bold ${T.mute}`}>{l}</div><div className="text-[18px] font-black whitespace-nowrap">{won(v)}<span className={`text-[13px] font-bold ${T.mute} ml-0.5`}>원</span></div></div>))}
        </div>
      </div>

      {/* ① 이번 달 흐름 */}
      <section className={`${CARD} overflow-hidden`} data-kp="settle-flow">
        <div className="grid grid-cols-2 md:grid-cols-5">
          {flow.map((f, i) => { const on = i === hot; const pct = f.total ? Math.round((f.done / f.total) * 100) : 0; return (
            <div key={f.k} data-step={f.k} className={`p-4 flex flex-col gap-1.5 border-[#DCE2EC] ${i ? "md:border-l" : ""} ${i % 2 ? "border-l md:border-l" : ""} ${i >= 2 ? "border-t md:border-t-0" : ""}`}>
              <div className={`flex items-center gap-2 text-[12.5px] font-black ${on ? T.blue : f.left ? T.sub : T.ok}`}>
                <span className="w-5 h-5 rounded-full border-2 grid place-items-center text-[11px]" style={{ borderColor: "currentColor" }}>{f.left ? i + 1 : "✓"}</span>{f.label}{on && <span className="ml-auto">지금</span>}
              </div>
              <div className={`text-[24px] font-black leading-none ${on ? T.blue : f.left ? T.fg : T.ok}`} style={NUM}>{f.done.toLocaleString()}<span className={`text-[14px] font-bold ${T.mute}`}> / {f.total.toLocaleString()}{f.unit}</span></div>
              <div className="h-1 rounded-full bg-[#EDF1F7] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: f.left ? (on ? "#2457D6" : "#9AA6BC") : "#0F7A52" }} /></div>
              <div className={`text-[12.5px] font-bold min-h-[18px] ${T.sub}`} style={NUM}>{f.left ? f.note || `${f.left}${f.unit} 남음` : "끝났어요"}</div>
              <button type="button" onClick={f.on} className={`mt-auto self-start text-[13px] font-black hover:underline underline-offset-4 ${on ? T.blue : T.sub}`}>{f.btn} ›</button>
            </div>); })}
        </div>
      </section>

      {/* ② 거래처 진행표 */}
      <section className={`${CARD}`} data-kp="settle-clients">
        <div className="px-4 pt-3.5 pb-2 flex items-center gap-3 flex-wrap">
          <div className="text-[16.5px] font-black mr-auto">거래처 진행표 <span className={`text-[13px] font-bold ${T.mute}`} style={NUM}>{total}곳</span></div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처 찾기" className="h-9 w-[180px] rounded-lg border border-[#DCE2EC] bg-transparent px-3 text-[13.5px] font-bold outline-none focus:border-[#2457D6]" />
          <label className={`inline-flex items-center gap-1.5 text-[13px] font-bold cursor-pointer ${T.sub}`}><input type="checkbox" className="w-4 h-4 accent-[#2457D6]" checked={onlyLeft} onChange={(e) => setOnlyLeft(e.target.checked)} />남은 일 있는 곳만</label>
        </div>
        {!shown.length ? <div className={`py-10 text-center text-[14px] ${T.mute}`}>{total ? "조건에 맞는 거래처가 없어요" : `${ym2}에 청구할 오더가 없어요`}</div> : (
          <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
            <table className="kp-plain w-full min-w-[820px] text-[14px] whitespace-nowrap" style={NUM}>
              <thead><tr className={`text-[12.5px] ${T.sub}`}>
                {["순번", "거래처", "오더", "청구", "배차 마감", "명세서", "계산서", "입금", "못 받은 돈", ""].map((h, i) => <th key={i} className={`sticky top-0 bg-white px-3 py-2 font-bold border-b border-[#DCE2EC] ${[2, 3, 8].includes(i) ? "text-right" : i === 0 ? "text-center" : "text-left"}`}>{h}</th>)}
              </tr></thead>
              <tbody>{shown.map((r, i) => { const ct = closeText(r.b); return (
                <tr key={r.client} onClick={() => openStmt(r.client)} className="cursor-pointer border-b border-[#EEF1F6] last:border-b-0 hover:bg-[#F6F8FB]" title="눌러서 명세서 열기">
                  <td className={`px-3 py-2.5 text-center text-[12.5px] ${T.mute}`}>{i + 1}</td>
                  <td className="px-3 py-2.5 font-black max-w-[220px] truncate">{r.client}</td>
                  <td className="px-3 py-2.5 text-right">{r.count.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right font-bold">{won(r.sale)}</td>
                  <td className="px-3 py-2.5"><span className={`text-[13px] font-black ${ct.c}`}>{ct.t}</span></td>
                  <td className="px-3 py-2.5">{ck(r.idx >= 2, r.idx === 1 ? "작성함" : "보내기 전", r.idx === 1 ? T.blue : null)}</td>
                  <td className="px-3 py-2.5">{ck(r.idx >= 5, "발행 전")}</td>
                  <td className="px-3 py-2.5">{ck(r.unpaid <= 0, r.paid > 0 ? "일부 받음" : "받기 전", r.paid > 0 ? T.warn : null)}</td>
                  <td className={`px-3 py-2.5 text-right font-black ${r.unpaid > 0 ? T.bad : T.mute}`}>{r.unpaid > 0 ? won(r.unpaid) : "-"}</td>
                  <td className={`px-3 py-2.5 text-right text-[12.5px] font-bold ${T.blue}`}>열기 ›</td>
                </tr>); })}</tbody>
            </table>
          </div>)}
        <div className={`px-4 py-2 border-t border-[#DCE2EC] text-[12.5px] ${T.mute}`}>배차 마감은 배차현황 › 월 마감에서 배차자가 넘긴 곳이에요. 줄을 누르면 그 거래처 명세서가 열려요.</div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ③ 먼저 챙길 거래처(미수 오래된 순) */}
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
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <span className={`text-[12.5px] ${T.mute}`}>거래처를 누르면 오른쪽에 원장이 나와요.</span>
            <button type="button" data-kp="settle-bank" onClick={() => go("거래처정산", { tab: "unsettledMonth", bank: true })} className={`ml-auto text-[13px] font-black ${T.blue} hover:underline underline-offset-4`}>입금내역 자동 대사 ›</button>
          </div>
        </section>

        {/* ④ 거래처 원장 */}
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
