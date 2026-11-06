// ======================= cafe-site/src/hub/HubWallet.jsx =======================
// ⭐ 2026-11-06 예치금 · 정산(휴대폰 · PC 같은 화면) — 잔액 · 보류 · 지급 예정 · 미정산 · 내역 · 충전 요청 · 정산 계좌
//  잔액은 서버(functions/hubWallet.js)만 바꾼다. 여기서는 충전 "요청"(회사 계좌 입금 후)과 정산 계좌 등록만 한다.
//  ⚠️ 실제 돈 보관 · 이체는 지급대행(PG) 계약 뒤 — 지금은 관리자가 입금 확인 · 직접 이체 후 [지급완료] 처리하는 원장 방식.
import React, { useEffect, useMemo, useState } from "react";
import { HI, Btn, Badge, Card, Field, inputCls, selectCls, NUMS, NAVY_BG, Empty } from "./hubUi";
import { LEDGER_LABEL, BANKS, canTake, canPost, ago, tsMs, fmtPhone } from "./hubConstants";
import { subscribeWallet, subscribeLedger, subscribeMyCharges, subscribeMyPayouts, subscribeMyDebts, requestCharge, cancelCharge, saveBank } from "./hubApi";

export const wonFull = (n) => `${(Math.round(Number(n) || 0)).toLocaleString("ko-KR")}원`;
const money = (v) => { const d = String(v).replace(/[^\d]/g, "").slice(0, 9); return d ? Number(d).toLocaleString() : ""; };
// 원장 한 줄 — 사용 가능 예치금 기준 +/−
const SIGN = { charge: 1, release: 1, fee_income: 1, adjust: 0, hold: -1, fee_paid: -1, debt_paid: -1, deduct: -1, payout_scheduled: 1, payout_done: 1, fee_owed: -1, platform_fee: 1 };
const NOTE = { hold: "보류로 이동", deduct: "보류에서 차감", payout_scheduled: "지급 예정에 추가", payout_done: "계좌로 지급", fee_owed: "미정산으로 기록" };
const CH_ST = { requested: ["입금 확인 대기", "sky"], confirmed: ["충전 완료", "navy"], rejected: ["반려", "line"], cancelled: ["취소", "line"] };
const PO_ST = { queued: ["지급 대기", "sky"], requested: ["지급 요청됨", "blue"], processing: ["지급 처리 중", "blue"], paid: ["지급 완료", "navy"], failed: ["지급 실패", "line"] };

export function WalletSummary({ w, compact = false }) {
  return (
    <div className="rounded-[24px] p-5 text-white" style={NAVY_BG} data-testid="wallet-summary">
      <div className="flex items-center gap-2 text-[14.5px] font-bold text-[#8FB0F0]"><HI name="wallet" size={17} />사용 가능 예치금</div>
      <div className="text-[34px] lg:text-[38px] font-extrabold leading-tight mt-1" style={NUMS} data-testid="wallet-available">{wonFull(w?.available)}</div>
      <div className={`grid ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"} gap-2 mt-4`}>
        {[["보류", w?.held, "wallet-held", "배차 확정 오더"], ["지급 예정", w?.pending, "wallet-pending", "받을 운임"], ["미정산", w?.owed, "wallet-owed", "낼 수수료"], ["수수료 수입", w?.feeEarned, "wallet-fee", "누계"]].map(([l, v, t, s]) => (
          <div key={l} className="rounded-2xl bg-white/[0.07] ring-1 ring-inset ring-white/10 px-3 py-2.5 min-w-0">
            <div className="text-[13px] text-white/60 font-bold">{l} <span className="text-white/35 font-semibold">{s}</span></div>
            <div className="text-[18px] font-extrabold truncate" style={NUMS} data-testid={t}>{wonFull(v)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HubWallet({ me, cfg, toast }) {
  const [w, setW] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [charges, setCharges] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [debts, setDebts] = useState([]);
  const [amt, setAmt] = useState("");
  const [dep, setDep] = useState(me.companyName || me.name || "");
  const [busy, setBusy] = useState(false);
  const [bank, setBank] = useState({ bank: me.bank?.bank || "", number: me.bank?.number || "", holder: me.bank?.holder || me.name || "" });
  const [tab, setTab] = useState("all");
  useEffect(() => subscribeWallet(me.uid, setW), [me.uid]);
  useEffect(() => subscribeLedger(me.uid, setLedger), [me.uid]);
  useEffect(() => subscribeMyCharges(me.uid, setCharges), [me.uid]);
  useEffect(() => subscribeMyPayouts(me.uid, setPayouts), [me.uid]);
  useEffect(() => subscribeMyDebts(me.uid, setDebts), [me.uid]);
  const acct = cfg?.depositAccount || {};
  const taker = canTake(me) || me.role === "driver";
  const poster = canPost(me);
  const rows = useMemo(() => ledger.filter((l) => tab === "all" || (tab === "in" ? (SIGN[l.type] || Math.sign(l.amount)) > 0 : (SIGN[l.type] || Math.sign(l.amount)) < 0)), [ledger, tab]);
  const openDebts = debts.filter((d) => d.status === "open");

  const charge = async () => {
    setBusy(true);
    try { await requestCharge(me, amt, dep); toast?.("충전 요청을 보냈습니다 · 입금이 확인되면 예치금에 들어갑니다"); setAmt(""); }
    catch (e) { toast?.(String(e?.code || "").includes("permission") ? "요청할 수 없습니다(승인 회원만)" : e?.message || "요청하지 못했습니다"); }
    finally { setBusy(false); }
  };
  const save = () => {
    if (!bank.bank || String(bank.number).replace(/[^\d]/g, "").length < 6 || !bank.holder.trim()) { toast?.("은행 · 계좌번호 · 예금주를 모두 입력해 주세요"); return; }
    saveBank(me.uid, bank).then(() => toast?.("정산 계좌를 저장했습니다")).catch(() => toast?.("저장하지 못했습니다"));
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-4 max-w-[1180px]" data-testid="wallet-view">
      <div className="space-y-4 min-w-0">
        <WalletSummary w={w} />
        {openDebts.length > 0 && (
          <Card className="p-4 ring-[#C7D3E8]" data-testid="wallet-debts">
            <div className="flex items-center gap-2"><HI name="alert" size={18} className="text-[#2D4C82]" /><span className="text-[16px] font-extrabold text-[#0F1A30]">미정산 수수료 {openDebts.length}건</span><span className="ml-auto text-[15px] font-extrabold" style={NUMS}>{wonFull(openDebts.reduce((a, d) => a + (d.amount || 0), 0))}</span></div>
            <div className="text-[14px] text-[#55657F] mt-1 leading-relaxed">선불 · 착불 오더 수수료입니다. 예치금을 충전하면 오래된 것부터 자동으로 정산됩니다.</div>
            {openDebts.slice(0, 5).map((d) => <div key={d.id} className="flex text-[14.5px] py-1.5 border-t border-[#EEF1F6] mt-1.5"><span className="font-bold text-[#1B2B4B] truncate">{d.route}</span><span className="ml-auto font-extrabold" style={NUMS}>{wonFull(d.amount)}</span></div>)}
          </Card>
        )}
        <Card className="p-4 lg:p-5" data-testid="wallet-charge">
          <div className="flex items-center gap-2 mb-3"><span className="w-9 h-9 rounded-xl bg-[#EAF0FA] text-[#1B2B4B] inline-flex items-center justify-center"><HI name="plus" size={18} /></span><span className="text-[17px] font-extrabold text-[#0F1A30]">예치금 충전</span></div>
          <div className="rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#DCE3EE] p-4" data-testid="deposit-account">
            <div className="text-[13.5px] font-bold text-[#8592A8]">입금 계좌(회사)</div>
            {acct.number ? (
              <>
                <div className="text-[19px] font-extrabold text-[#0F1A30] mt-0.5" style={NUMS}>{acct.bank} {acct.number}</div>
                <div className="text-[14.5px] font-bold text-[#3A4A66]">예금주 {acct.holder}</div>
                <button type="button" onClick={() => navigator.clipboard?.writeText(`${acct.bank} ${acct.number}`).then(() => toast?.("계좌번호를 복사했습니다")).catch(() => {})} className="mt-2 h-9 px-3 rounded-xl bg-white ring-1 ring-inset ring-[#D6DEEA] text-[13.5px] font-bold text-[#1B2B4B]">계좌번호 복사</button>
              </>
            ) : <div className="text-[15px] font-bold text-[#55657F] mt-1">관리자가 입금 계좌를 아직 등록하지 않았습니다.</div>}
            <div className="text-[13.5px] text-[#55657F] mt-2 leading-relaxed">입금 후 아래 [충전 요청]을 누르면 관리자가 입금을 확인하고 예치금에 넣어 드립니다. 입금자명을 꼭 같게 해 주세요.</div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 mt-3">
            <Field label="충전 금액(원)"><input className={`${inputCls} text-right font-extrabold`} inputMode="numeric" value={amt} onChange={(e) => setAmt(money(e.target.value))} placeholder="0" style={NUMS} data-testid="charge-amount" /></Field>
            <Field label="입금자명"><input className={inputCls} value={dep} onChange={(e) => setDep(e.target.value.slice(0, 40))} data-testid="charge-depositor" /></Field>
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">{[100000, 500000, 1000000, 3000000].map((v) => <button key={v} type="button" onClick={() => setAmt(money(String((Number(String(amt).replace(/[^\d]/g, "")) || 0) + v)))} className="h-10 px-3.5 rounded-full bg-white ring-1 ring-inset ring-[#D6DEEA] text-[14px] font-bold text-[#1B2B4B]">+{v / 10000}만</button>)}</div>
          <Btn size="lg" className="w-full mt-3" disabled={busy || !amt} onClick={charge} data-testid="charge-submit">{busy ? "요청 중…" : `충전 요청${amt ? ` · ${amt}원` : ""}`}</Btn>
          {charges.length > 0 && (
            <div className="mt-3 divide-y divide-[#EEF1F6]" data-testid="charge-list">
              {charges.slice(0, 6).map((c) => (
                <div key={c.id} className="flex items-center gap-2 py-2.5 text-[14.5px]">
                  <Badge tone={CH_ST[c.status]?.[1]}>{CH_ST[c.status]?.[0] || c.status}</Badge>
                  <span className="font-extrabold text-[#0F1A30]" style={NUMS}>{wonFull(c.amount)}</span>
                  <span className="text-[#8592A8] truncate">{c.depositor} · {ago(c.createdAt)}{c.rejectReason ? ` · ${c.rejectReason}` : ""}</span>
                  {c.status === "requested" && <button type="button" onClick={() => cancelCharge(c.id).catch(() => {})} className="ml-auto h-9 px-3 rounded-xl text-[13.5px] font-bold text-[#55657F] hover:bg-[#F2F5FA] shrink-0">취소</button>}
                </div>
              ))}
            </div>
          )}
        </Card>
        {(taker || me.role === "carrier") && (
          <Card className="p-4 lg:p-5" data-testid="wallet-bank">
            <div className="flex items-center gap-2 mb-1"><span className="w-9 h-9 rounded-xl bg-[#EAF0FA] text-[#1B2B4B] inline-flex items-center justify-center"><HI name="won" size={18} /></span><span className="text-[17px] font-extrabold text-[#0F1A30]">정산 계좌</span>{me.bank?.number && <Badge tone="navy" className="ml-auto">등록됨</Badge>}</div>
            <div className="text-[14px] text-[#55657F] mb-3">운임이 지급될 계좌입니다(예금주는 사업자 · 본인 이름과 같아야 합니다).</div>
            <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2.5">
              <Field label="은행"><select className={selectCls} value={bank.bank} onChange={(e) => setBank((p) => ({ ...p, bank: e.target.value }))} data-testid="bank-name"><option value="">선택</option>{BANKS.map((b) => <option key={b}>{b}</option>)}</select></Field>
              <Field label="계좌번호"><input className={inputCls} inputMode="numeric" value={bank.number} onChange={(e) => setBank((p) => ({ ...p, number: e.target.value.replace(/[^\d-]/g, "").slice(0, 30) }))} placeholder="숫자만" data-testid="bank-number" /></Field>
            </div>
            <Field label="예금주" className="mt-2.5"><input className={inputCls} value={bank.holder} onChange={(e) => setBank((p) => ({ ...p, holder: e.target.value.slice(0, 40) }))} data-testid="bank-holder" /></Field>
            <Btn kind="soft" className="w-full mt-3" onClick={save} data-testid="bank-save">정산 계좌 저장</Btn>
          </Card>
        )}
      </div>
      <div className="space-y-4 min-w-0">
        {(taker || payouts.length > 0) && (
          <Card className="p-4 lg:p-5" data-testid="wallet-payouts">
            <div className="text-[16px] font-extrabold text-[#0F1A30] mb-2 flex items-center gap-2"><HI name="truck" size={18} className="text-[#2D4C82]" />운임 지급 <span className="text-[#8592A8]">{payouts.length || ""}</span></div>
            {payouts.length === 0 ? <div className="text-[14.5px] text-[#8592A8] leading-relaxed">예치금 결제(인수증 · 예치금) 오더를 운송완료하고 계산서를 발행하면 여기에 지급 예정으로 올라갑니다.</div> : payouts.slice(0, 20).map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-2.5 border-t border-[#EEF1F6] first:border-0 text-[14.5px]" data-testid="payout-row">
                <Badge tone={PO_ST[p.status]?.[1]}>{PO_ST[p.status]?.[0] || p.status}</Badge>
                <span className="min-w-0 flex-1 truncate font-bold text-[#1B2B4B]">{p.route}</span>
                <span className="font-extrabold text-[#0F1A30] shrink-0" style={NUMS}>{wonFull(p.amount)}</span>
              </div>
            ))}
          </Card>
        )}
        <Card className="p-4 lg:p-5" data-testid="wallet-ledger">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[16px] font-extrabold text-[#0F1A30]">예치금 내역</span>
            <div className="ml-auto flex gap-1">{[["all", "전체"], ["in", "들어옴"], ["out", "나감"]].map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={`h-9 px-3 rounded-full text-[13.5px] font-bold ${tab === k ? "bg-[#0F1A30] text-white" : "bg-[#F2F5FA] text-[#55657F]"}`}>{l}</button>)}</div>
          </div>
          {rows.length === 0 ? <Empty icon="wallet" title="내역이 없습니다" desc={poster ? "예치금을 충전하면 인수증 · 예치금 결제 오더를 올릴 수 있습니다." : "정산이 생기면 여기에 쌓입니다."} /> : (
            <div className="divide-y divide-[#EEF1F6]">
              {rows.map((l) => {
                const sg = SIGN[l.type] ?? Math.sign(l.amount);
                const plus = sg > 0 || (l.type === "adjust" && l.amount > 0);
                return (
                  <div key={l.id} className="py-3 flex gap-3" data-testid="ledger-row" data-type={l.type}>
                    <span className={`w-10 h-10 rounded-2xl inline-flex items-center justify-center shrink-0 ${plus ? "bg-[#0F1A30] text-[#8FB0F0]" : "bg-[#F2F5FA] text-[#55657F]"}`}><HI name={plus ? "plus" : "arrow"} size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="text-[15.5px] font-extrabold text-[#0F1A30]">{l.label || LEDGER_LABEL[l.type] || l.type}</span>{NOTE[l.type] && <span className="text-[12.5px] font-bold text-[#8592A8]">{NOTE[l.type]}</span>}</div>
                      <div className="text-[13.5px] text-[#55657F] truncate">{[l.route, l.memo].filter(Boolean).join(" · ") || "-"}</div>
                      <div className="text-[12.5px] text-[#A3AEC0]" style={NUMS}>{tsMs(l.at) ? new Date(tsMs(l.at)).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "방금"} · 잔액 {wonFull(l.availableAfter)}</div>
                    </div>
                    <span className={`text-[16px] font-extrabold shrink-0 ${plus ? "text-[#0F1A30]" : "text-[#55657F]"}`} style={NUMS}>{plus ? "+" : "−"}{wonFull(Math.abs(l.amount))}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <div className="text-[13px] text-[#8592A8] leading-relaxed px-1">예치금은 로지스웹 허브 정산 장부입니다. 실제 입금 · 지급은 회사 계좌로 처리되며, 지급대행(PG) 연동 후에는 자동 이체로 바뀝니다. 문의 {fmtPhone(cfg?.supportPhone || "") || "고객센터"}</div>
      </div>
    </div>
  );
}
