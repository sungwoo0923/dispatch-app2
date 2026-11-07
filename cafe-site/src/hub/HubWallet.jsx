// ======================= cafe-site/src/hub/HubWallet.jsx =======================
// ⭐ 2026-11-06 예치금 · 정산
// ⭐ 2026-11-07 (3차) 마이페이지(24시콜 마이페이지 구조 참고, 디자인은 허브 그대로)
//  가상계좌 정보(총 잔고 · 출금가능금액 · [출금계좌 변경] [입출금내역] [출금] · 내 충전 계좌) · 계산서 발행내역 / 수신내역 ·
//  운송료 지급 · 쪽지/알림 · 약관 및 계약 동의내역 · 내정보
//  잔액은 서버(functions/hubWallet.js)만 바꾼다. 여기서는 [입금 확인 요청] · 출금 신청 · 출금계좌 등록만 한다.
//  가상계좌: 회원 문서 va(관리자 또는 PG 웹훅이 정함)가 있으면 그 계좌로 입금하면 자동 충전, 없으면 회사 계좌 + [입금 확인 요청]
import React, { useEffect, useMemo, useState } from "react";
import { HI, Btn, Badge, Card, Field, inputCls, selectCls, NUMS, NAVY_BG, Empty } from "./hubUi";
import { LEDGER_LABEL, BANKS, canTake, ago, tsMs, ROLES, SOURCE_LABEL, hasBank } from "./hubConstants";
import { isHubDriverEmail } from "./hubLink";
import {
  subscribeWallet, subscribeLedger, subscribeMyCharges, subscribeMyPayouts, subscribeMyDebts, requestCharge, cancelCharge, saveBank,
  requestWithdraw, subscribeMyWithdrawals, markRead,
} from "./hubApi";

export const wonFull = (n) => `${(Math.round(Number(n) || 0)).toLocaleString("ko-KR")}원`;
const money = (v) => { const d = String(v).replace(/[^\d]/g, "").slice(0, 9); return d ? Number(d).toLocaleString() : ""; };
const SIGN = { charge: 1, release: 1, return_refund: 1, fee_income: 1, adjust: 0, hold: -1, fee_paid: -1, debt_paid: -1, deduct: -1, payout_scheduled: 1, payout_done: 1, fee_owed: -1, platform_fee: 1, withdraw_req: -1, withdraw_done: -1, withdraw_cancel: 1 };
const CH_ST = { requested: ["확인 기다림", "sky"], confirmed: ["충전 완료", "navy"], rejected: ["반려", "line"], cancelled: ["취소", "line"] };
const PO_ST = { scheduled: ["지급 예정", "sky"], queued: ["지급 대기", "sky"], requested: ["보내는 중", "blue"], processing: ["보내는 중", "blue"], paid: ["지급 완료", "navy"], failed: ["지급 실패", "line"] };
const WD_ST = { requested: ["신청", "sky"], processing: ["보내는 중", "blue"], paid: ["출금 완료", "navy"], rejected: ["반려", "line"], failed: ["실패", "line"] };
const fmtT = (t) => (tsMs(t) ? new Date(tsMs(t)).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "방금");
const mask = (n) => String(n || "").replace(/.(?=.{4})/g, "*");

export function WalletSummary({ w, compact = false }) {
  const total = (Number(w?.available) || 0) + (Number(w?.held) || 0);
  return (
    <div className="rounded-[24px] p-5 text-white" style={NAVY_BG} data-testid="wallet-summary">
      <div className="flex items-center gap-2 text-[14.5px] font-bold text-[#8FB0F0]"><HI name="wallet" size={17} />잔액</div>
      <div className="text-[34px] lg:text-[38px] font-extrabold leading-tight mt-1" style={NUMS} data-testid="wallet-available">{wonFull(w?.available)}</div>
      <div className={`grid ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"} gap-2 mt-4`}>
        {[["총 잔고", total, "wallet-total"], ["배차 확정(보류)", w?.held, "wallet-held"], ["받을 운송료", w?.pending, "wallet-pending"], ["미정산", w?.owed, "wallet-owed"]].map(([l, v, t]) => (
          <div key={l} className="rounded-2xl bg-white/[0.07] ring-1 ring-inset ring-white/10 px-3 py-2.5 min-w-0">
            <div className="text-[13px] text-white/60 font-bold truncate">{l}</div>
            <div className="text-[18px] font-extrabold truncate" style={NUMS} data-testid={t}>{wonFull(v)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Sec({ icon, title, right, children, testid, id }) {
  return (
    <Card className="p-4 lg:p-5" data-testid={testid} id={id}>
      <div className="flex items-center gap-2 mb-3"><span className="w-9 h-9 rounded-xl bg-[#EAF0FA] text-[#1B2B4B] inline-flex items-center justify-center"><HI name={icon} size={18} /></span><span className="text-[17px] font-extrabold text-[#0F1A30]">{title}</span>{right && <span className="ml-auto">{right}</span>}</div>
      {children}
    </Card>
  );
}

export default function HubWallet({ me, cfg, toast, jobs = [], posts = [], notices = [], openOrder, logout, isAdmin, children }) {
  const [w, setW] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [charges, setCharges] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [debts, setDebts] = useState([]);
  const [wds, setWds] = useState([]);
  const [amt, setAmt] = useState("");
  const [dep, setDep] = useState(me.companyName || me.name || "");
  const [wamt, setWamt] = useState("");
  const [busy, setBusy] = useState("");
  const [bank, setBank] = useState({ bank: me.bank?.bank || "", number: me.bank?.number || "", holder: me.bank?.holder || me.name || "" });
  const [bankOpen, setBankOpen] = useState(!hasBank(me));
  const [tab, setTab] = useState("all");
  const [inv, setInv] = useState(canTake(me) || me.role === "driver" ? "out" : "in");
  useEffect(() => subscribeWallet(me.uid, setW), [me.uid]);
  useEffect(() => subscribeLedger(me.uid, setLedger), [me.uid]);
  useEffect(() => subscribeMyCharges(me.uid, setCharges), [me.uid]);
  useEffect(() => subscribeMyPayouts(me.uid, setPayouts), [me.uid]);
  useEffect(() => subscribeMyDebts(me.uid, setDebts), [me.uid]);
  useEffect(() => subscribeMyWithdrawals(me.uid, setWds), [me.uid]);
  const acct = cfg?.depositAccount || {};
  const va = me.va?.number ? me.va : null;
  const rows = useMemo(() => ledger.filter((l) => tab === "all" || (tab === "in" ? (SIGN[l.type] || Math.sign(l.amount)) > 0 : (SIGN[l.type] || Math.sign(l.amount)) < 0)), [ledger, tab]);
  const openDebts = debts.filter((d) => d.status === "open");
  const issued = jobs.filter((o) => o.invoice);
  const received = posts.filter((o) => o.invoice);
  const go = (id) => { try { document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch { /* 무시 */ } };

  const charge = async () => {
    setBusy("charge");
    try { await requestCharge(me, amt, dep); toast?.("입금 확인을 요청했어요"); setAmt(""); }
    catch (e) { toast?.(String(e?.code || "").includes("permission") ? "승인된 회원만 요청할 수 있어요" : e?.message || "요청하지 못했어요"); }
    finally { setBusy(""); }
  };
  const withdraw = async () => {
    setBusy("wd");
    try { await requestWithdraw(me, wamt); toast?.("출금을 신청했어요"); setWamt(""); }
    catch (e) { toast?.(String(e?.code || "").includes("permission") ? "출금가능금액을 확인해 주세요" : e?.message || "신청하지 못했어요"); }
    finally { setBusy(""); }
  };
  const save = () => {
    if (!bank.bank || String(bank.number).replace(/[^\d]/g, "").length < 6 || !bank.holder.trim()) { toast?.("은행, 계좌번호, 예금주를 모두 넣어 주세요"); return; }
    saveBank(me.uid, bank).then(() => { toast?.("계좌를 저장했어요"); setBankOpen(false); }).catch(() => toast?.("저장하지 못했어요"));
  };
  const infoRows = [["유형", `${ROLES[me.role]?.label || ""} ${SOURCE_LABEL[me.source] ? `(${SOURCE_LABEL[me.source]})` : ""}`], ["이름", me.name], ["휴대폰", me.phone], ["회사", me.companyName], ["사업자번호", me.bizNo], ["사업자 상태", me.bizStatus],
    ...(me.vehicle ? [["차량", `${me.vehicle.plate} ${me.vehicle.ton} ${me.vehicle.type}`]] : []),
    // ⭐ 2026-11-07 차량번호로 로그인하는 차주는 가짜 이메일 대신 로그인 방법 · 휴대폰번호 변경 안내(로그인 정보라 관리자가 바꾼다)
    isHubDriverEmail(me.email) ? ["로그인", "차량번호 + 휴대폰번호. 번호가 바뀌면 관리자에게 알려 주세요"] : ["이메일", me.email]].filter(([, v]) => v && String(v).trim());

  return (
    <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-4 max-w-[1180px]" data-testid="wallet-view">
      <div className="space-y-4 min-w-0">
        <WalletSummary w={w} />
        <div className="grid grid-cols-3 gap-2" data-testid="wallet-actions">
          <Btn kind="ghost" size="md" className="!px-2 !text-[14px] whitespace-nowrap" onClick={() => { setBankOpen(true); setTimeout(() => go("my-bank"), 50); }} data-testid="btn-bank-change">출금계좌 변경</Btn>
          <Btn kind="ghost" size="md" className="!px-2 !text-[14px] whitespace-nowrap" onClick={() => go("my-ledger")} data-testid="btn-ledger">입출금내역</Btn>
          <Btn size="md" onClick={() => go("my-withdraw")} data-testid="btn-withdraw">출금</Btn>
        </div>
        {openDebts.length > 0 && (
          <Card className="p-4 ring-[#C7D3E8]" data-testid="wallet-debts">
            <div className="flex items-center gap-2"><HI name="alert" size={18} className="text-[#2D4C82]" /><span className="text-[16px] font-extrabold text-[#0F1A30]">밀린 수수료 {openDebts.length}건</span><span className="ml-auto text-[15px] font-extrabold" style={NUMS}>{wonFull(openDebts.reduce((a, d) => a + (d.amount || 0), 0))}</span></div>
            <div className="text-[14px] text-[#55657F] mt-1">충전하면 오래된 것부터 바로 갚아져요.</div>
          </Card>
        )}
        <Sec icon="wallet" title="가상계좌 정보" testid="wallet-charge">
          {va ? (
            <div className="rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#DCE3EE] p-4" data-testid="va-account">
              <div className="text-[13.5px] font-bold text-[#8592A8]">내 충전 계좌</div>
              <div className="text-[19px] font-extrabold text-[#0F1A30] mt-0.5" style={NUMS}>{va.bank} {va.number}</div>
              <div className="text-[14.5px] font-bold text-[#3A4A66]">예금주 {va.holder || me.companyName || me.name}</div>
              <div className="text-[13.5px] text-[#55657F] mt-1.5">이 계좌로 보내면 바로 충전돼요.</div>
              <button type="button" onClick={() => navigator.clipboard?.writeText(`${va.bank} ${va.number}`).then(() => toast?.("계좌번호를 복사했어요")).catch(() => {})} className="mt-2 h-9 px-3 rounded-xl bg-white ring-1 ring-inset ring-[#D6DEEA] text-[13.5px] font-bold text-[#1B2B4B]">복사</button>
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#DCE3EE] p-4" data-testid="deposit-account">
                <div className="text-[13.5px] font-bold text-[#8592A8]">입금 계좌</div>
                {acct.number ? (
                  <>
                    <div className="text-[19px] font-extrabold text-[#0F1A30] mt-0.5" style={NUMS}>{acct.bank} {acct.number}</div>
                    <div className="text-[14.5px] font-bold text-[#3A4A66]">예금주 {acct.holder}</div>
                    <button type="button" onClick={() => navigator.clipboard?.writeText(`${acct.bank} ${acct.number}`).then(() => toast?.("계좌번호를 복사했어요")).catch(() => {})} className="mt-2 h-9 px-3 rounded-xl bg-white ring-1 ring-inset ring-[#D6DEEA] text-[13.5px] font-bold text-[#1B2B4B]">복사</button>
                  </>
                ) : <div className="text-[15px] font-bold text-[#55657F] mt-1">입금 계좌를 준비하고 있어요</div>}
                <div className="text-[13.5px] text-[#55657F] mt-2">내 전용 계좌가 생기기 전에는 입금하고 확인을 요청해 주세요.</div>
              </div>
              <div className="grid grid-cols-2 gap-2.5 mt-3">
                <Field label="입금한 금액(원)"><input className={`${inputCls} text-right font-extrabold`} inputMode="numeric" value={amt} onChange={(e) => setAmt(money(e.target.value))} placeholder="0" style={NUMS} data-testid="charge-amount" /></Field>
                <Field label="입금자명"><input className={inputCls} value={dep} onChange={(e) => setDep(e.target.value.slice(0, 40))} data-testid="charge-depositor" /></Field>
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">{[100000, 500000, 1000000, 3000000].map((v) => <button key={v} type="button" onClick={() => setAmt(money(String((Number(String(amt).replace(/[^\d]/g, "")) || 0) + v)))} className="h-10 px-3.5 rounded-full bg-white ring-1 ring-inset ring-[#D6DEEA] text-[14px] font-bold text-[#1B2B4B]">+{v / 10000}만</button>)}</div>
              <Btn size="lg" className="w-full mt-3" disabled={!!busy || !amt} onClick={charge} data-testid="charge-submit">{busy === "charge" ? "요청하고 있어요" : "입금 확인 요청"}</Btn>
            </>
          )}
          {charges.length > 0 && (
            <div className="mt-3 divide-y divide-[#EEF1F6]" data-testid="charge-list">
              {charges.slice(0, 6).map((c) => (
                <div key={c.id} className="flex items-center gap-2 py-2.5 text-[14.5px]">
                  <Badge tone={CH_ST[c.status]?.[1]}>{CH_ST[c.status]?.[0] || c.status}</Badge>
                  <span className="font-extrabold text-[#0F1A30]" style={NUMS}>{wonFull(c.amount)}</span>
                  <span className="text-[#8592A8] truncate">{c.source === "va" ? "가상계좌" : c.depositor} {ago(c.createdAt)}</span>
                  {c.status === "requested" && <button type="button" onClick={() => cancelCharge(c.id).catch(() => {})} className="ml-auto h-9 px-3 rounded-xl text-[13.5px] font-bold text-[#55657F] hover:bg-[#F2F5FA] shrink-0">취소</button>}
                </div>
              ))}
            </div>
          )}
        </Sec>
        <Sec icon="won" title="출금계좌" id="my-bank" testid="wallet-bank" right={me.bank?.number ? <Badge tone="navy">등록됨</Badge> : <Badge tone="line">필요해요</Badge>}>
          {!bankOpen && me.bank?.number ? (
            <div className="flex items-center gap-2"><span className="text-[16px] font-extrabold text-[#0F1A30]" style={NUMS} data-testid="bank-shown">{me.bank.bank} {mask(me.bank.number)}</span><span className="text-[14.5px] text-[#55657F]">{me.bank.holder}</span><Btn kind="ghost" size="md" className="ml-auto" onClick={() => setBankOpen(true)}>바꾸기</Btn></div>
          ) : (
            <>
              <div className="text-[14px] text-[#55657F] mb-3">운송료와 출금을 받을 내 계좌예요. 배차신청하려면 꼭 필요해요.</div>
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2.5">
                <Field label="은행"><select className={selectCls} value={bank.bank} onChange={(e) => setBank((p) => ({ ...p, bank: e.target.value }))} data-testid="bank-name"><option value="">선택</option>{bank.bank && !BANKS.includes(bank.bank) && <option>{bank.bank}</option>}{BANKS.map((b) => <option key={b}>{b}</option>)}</select></Field>
                <Field label="계좌번호"><input className={inputCls} inputMode="numeric" value={bank.number} onChange={(e) => setBank((p) => ({ ...p, number: e.target.value.replace(/[^\d-]/g, "").slice(0, 30) }))} placeholder="숫자만" data-testid="bank-number" /></Field>
              </div>
              <Field label="예금주" className="mt-2.5"><input className={inputCls} value={bank.holder} onChange={(e) => setBank((p) => ({ ...p, holder: e.target.value.slice(0, 40) }))} data-testid="bank-holder" /></Field>
              <Btn kind="soft" className="w-full mt-3" onClick={save} data-testid="bank-save">저장</Btn>
            </>
          )}
        </Sec>
        <Sec icon="arrow" title="출금" id="my-withdraw" testid="wallet-withdraw">
          <div className="flex items-baseline gap-2 mb-2"><span className="text-[14.5px] font-bold text-[#8592A8]">출금가능금액</span><span className="text-[20px] font-extrabold text-[#0F1A30]" style={NUMS} data-testid="withdrawable">{wonFull(w?.available)}</span></div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <input className={`${inputCls} text-right font-extrabold`} inputMode="numeric" value={wamt} onChange={(e) => setWamt(money(e.target.value))} placeholder="출금할 금액" style={NUMS} data-testid="withdraw-amount" />
            <Btn onClick={withdraw} disabled={!!busy || !wamt || !me.bank?.number} data-testid="withdraw-submit">{busy === "wd" ? "신청하고 있어요" : "출금"}</Btn>
          </div>
          <div className="text-[13.5px] text-[#8592A8] mt-1.5">{me.bank?.number ? `${me.bank.bank} ${mask(me.bank.number)}로 보내드려요` : "출금계좌를 먼저 등록해 주세요"}</div>
          {wds.length > 0 && <div className="mt-2 divide-y divide-[#EEF1F6]" data-testid="withdraw-list">{wds.slice(0, 6).map((x) => <div key={x.id} className="flex items-center gap-2 py-2 text-[14.5px]"><Badge tone={WD_ST[x.status]?.[1]}>{WD_ST[x.status]?.[0] || x.status}</Badge><span className="font-extrabold" style={NUMS}>{wonFull(x.amount)}</span><span className="text-[#8592A8] ml-auto">{ago(x.createdAt)}</span></div>)}</div>}
        </Sec>
        {(payouts.length > 0 || canTake(me)) && (
          <Sec icon="truck" title="운송료 지급" testid="wallet-payouts">
            {payouts.length === 0 ? <div className="text-[14.5px] text-[#8592A8]">계산서를 올리고 등록자가 확인하면 지급일이 정해져요.</div> : payouts.slice(0, 20).map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-2.5 border-t border-[#EEF1F6] first:border-0 text-[14.5px]" data-testid="payout-row">
                <Badge tone={PO_ST[p.status]?.[1]}>{PO_ST[p.status]?.[0] || p.status}</Badge>
                <span className="min-w-0 flex-1 truncate font-bold text-[#1B2B4B]">{p.route}{p.dueDate ? ` ${p.dueDate}` : ""}</span>
                <span className="font-extrabold text-[#0F1A30] shrink-0" style={NUMS}>{wonFull(p.amount)}</span>
              </div>
            ))}
          </Sec>
        )}
      </div>
      <div className="space-y-4 min-w-0">
        <Sec icon="list" title="입출금내역" id="my-ledger" testid="wallet-ledger" right={<div className="flex gap-1">{[["all", "전체"], ["in", "입금"], ["out", "출금"]].map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={`h-9 px-3 rounded-full text-[13.5px] font-bold ${tab === k ? "bg-[#0F1A30] text-white" : "bg-[#F2F5FA] text-[#55657F]"}`}>{l}</button>)}</div>}>
          {rows.length === 0 ? <Empty icon="wallet" title="아직 내역이 없어요" /> : (
            <div className="divide-y divide-[#EEF1F6] max-h-[520px] overflow-y-auto hub-scroll">
              {rows.map((l) => {
                const sg = SIGN[l.type] ?? Math.sign(l.amount);
                const plus = sg > 0 || (l.type === "adjust" && l.amount > 0);
                return (
                  <div key={l.id} className="py-3 flex gap-3" data-testid="ledger-row" data-type={l.type}>
                    <span className={`w-10 h-10 rounded-2xl inline-flex items-center justify-center shrink-0 ${plus ? "bg-[#0F1A30] text-[#8FB0F0]" : "bg-[#F2F5FA] text-[#55657F]"}`}><HI name={plus ? "plus" : "arrow"} size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15.5px] font-extrabold text-[#0F1A30]">{LEDGER_LABEL[l.type] || l.label || l.type}</div>
                      <div className="text-[13.5px] text-[#55657F] truncate">{[l.route, l.memo].filter(Boolean).join("  ") || "-"}</div>
                      <div className="text-[12.5px] text-[#A3AEC0]" style={NUMS}>{fmtT(l.at)}  잔액 {wonFull(l.availableAfter)}</div>
                    </div>
                    <span className={`text-[16px] font-extrabold shrink-0 ${plus ? "text-[#0F1A30]" : "text-[#55657F]"}`} style={NUMS}>{plus ? "+" : "-"}{wonFull(Math.abs(l.amount))}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Sec>
        <Sec icon="receipt" title="전자세금계산서" testid="my-invoices" right={<div className="flex gap-1">{[["out", "발행내역"], ["in", "수신내역"]].map(([k, l]) => <button key={k} type="button" onClick={() => setInv(k)} className={`h-9 px-3 rounded-full text-[13.5px] font-bold ${inv === k ? "bg-[#0F1A30] text-white" : "bg-[#F2F5FA] text-[#55657F]"}`} data-testid={`inv-tab-${k}`}>{l}</button>)}</div>}>
          {(inv === "out" ? issued : received).length === 0 ? <div className="text-[14.5px] text-[#8592A8]">{inv === "out" ? "발행한 계산서가 없어요" : "받은 계산서가 없어요"}</div> : (inv === "out" ? issued : received).slice(0, 30).map((o) => (
            <button key={o.id} type="button" onClick={() => openOrder?.(o)} className="w-full text-left flex items-center gap-2 py-2.5 border-t border-[#EEF1F6] first:border-0 text-[14.5px]" data-testid="invoice-row">
              <Badge tone={o.invoiceOk ? "navy" : "sky"}>{o.invoiceOk ? "확인됨" : "확인 전"}</Badge>
              <span className="min-w-0 flex-1 truncate font-bold text-[#1B2B4B]">{o.상차시군구 || o.상차시도} → {o.하차시군구 || o.하차시도}  {o.invoice.no}</span>
              <span className="font-extrabold shrink-0" style={NUMS}>{wonFull(o.invoice.amount)}</span>
            </button>
          ))}
        </Sec>
        <Sec icon="bell" title="쪽지와 알림" testid="my-notices">
          {notices.length === 0 ? <div className="text-[14.5px] text-[#8592A8]">새 알림이 없어요</div> : notices.slice(0, 8).map((n) => (
            <button key={n.id} type="button" onClick={() => { markRead(n.id); if (n.orderId) openOrder?.({ id: n.orderId }); }} className={`w-full text-left py-2.5 border-t border-[#EEF1F6] first:border-0 flex gap-2 ${n.read ? "" : "font-bold"}`}>
              {!n.read && <span className="mt-2 w-2 h-2 rounded-full bg-[#2D4C82] shrink-0" />}
              <span className="min-w-0 flex-1"><span className="block text-[15px] text-[#0F1A30] truncate">{n.title}</span><span className="block text-[13.5px] text-[#55657F] truncate font-normal">{n.body}</span></span>
              <span className="text-[12.5px] text-[#A3AEC0] shrink-0 font-normal">{ago(n.createdAt)}</span>
            </button>
          ))}
        </Sec>
        <Sec icon="shield" title="약관 및 계약 동의내역" testid="my-agree">
          {[["이용약관", me.agree?.terms], ["개인정보 처리", me.agree?.privacy], ["서류 확인", me.agree?.docs]].map(([l, v]) => (
            <div key={l} className="flex items-center py-2 border-t border-[#EEF1F6] first:border-0 text-[15px]"><span className="font-bold text-[#1B2B4B]">{l}</span><span className="ml-auto text-[#55657F]">{v ? `동의 ${me.agree?.at ? new Date(me.agree.at).toLocaleDateString("ko-KR") : ""}` : me.source !== "signup" ? "로지스웹 계정 동의" : "-"}</span></div>
          ))}
        </Sec>
        <Sec icon="user" title="내정보" testid="me-view">
          <div className="divide-y divide-[#EEF1F6]">{infoRows.map(([k, v]) => <div key={k} className="flex py-2.5 text-[15px]"><span className="w-24 shrink-0 font-semibold text-[#8592A8]">{k}</span><span className="font-bold text-[#0F1A30] break-all">{v}</span></div>)}</div>
          <div className="mt-2 text-[13.5px] text-[#8592A8]">{me.source === "signup" ? "차량과 서류를 바꾸려면 고객센터로 연락해 주세요" : "정보는 로지스웹 프로그램에서 바꿔 주세요"}</div>
          {children}
          {isAdmin && <a href="/admin" className="mt-3 h-12 px-4 rounded-2xl bg-[#F5F7FB] flex items-center gap-2 text-[16px] font-bold text-[#1B2B4B]" data-testid="me-admin"><HI name="shield" size={18} />허브 관리자<HI name="chevron" size={18} className="ml-auto" /></a>}
          {logout && <Btn kind="ghost" className="w-full mt-3" onClick={logout} data-testid="btn-logout"><HI name="logout" size={18} />로그아웃</Btn>}
        </Sec>
        <div className="text-[13px] text-[#8592A8] px-1">문의 {cfg?.supportPhone || "고객센터"}</div>
      </div>
    </div>
  );
}
