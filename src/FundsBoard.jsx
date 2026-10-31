// ======================= src/FundsBoard.jsx =======================
// 💰 자금 관리(2026-10-31) — 회사 통장·현금·예금·대출을 등록하고 지금 잔액을 한눈에. PC·모바일 공용.
//  · 처음 시작: 통장·현금·예금·대출의 "기준일 잔액"을 한 번에 입력(초기 자금 셋팅)
//  · 이후 잔액 = 마지막 확인 잔액(기준일) + 그 뒤 수입·지출 장부에서 이 계좌로 지정한 입출금
//  · 은행 잔액과 맞지 않으면 [잔액 맞추기]로 그날 실제 잔액을 다시 적는다(이력 남음)
//  · 보유 자금 · 이번 달 순현금흐름 · 월평균 지출 → 운영 가능 개월수(런웨이) · 대출 잔액
//  · 열람: 경리(입력·수정) + 대표(조회). 다른 직원에게는 메뉴가 보이지 않는다(보안 규칙도 경리·관리자만)
import React from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where, arrayUnion } from "firebase/firestore";
import { db, auth } from "./firebase";
import KpSubNav from "./KpSubNav";
import { BookHero, BookCard, Chip, Sheet, MONO, CashBook } from "./OfficeBooks";
import CustomDatePicker from "./CustomDatePicker";
import { CustomSelect } from "./CustomSelect";
import { formatAccount, onlyDigits } from "./bankUtil";
import { FUND_KINDS, CARD_COMPANIES, BANK_OPTIONS, computeFunds, toInt, isCard, isCredit, fundBadge, formatCardNo, last4 } from "./fundsCalc";

const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const short = (n) => { const a = Math.abs(n || 0); if (a >= 1e8) return `${(n / 1e8).toFixed(1)}억`; if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`; return Math.round(n || 0).toLocaleString(); };
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const ymAgo = (n) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 7); };
const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
export { FUND_KINDS, computeFunds };
// 대표 직책 — 자금 화면을 볼 수 있는 임원
export const isCeoPosition = (p) => ["대표", "대표이사", "사장"].includes(String(p || "").trim());

function useRows(name, company) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, name), where("companyName", "==", company)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
  }, [name, company]);
  return rows;
}
export function useFundsSummary(company, enabled = true) {
  const funds = useRows("acctFunds", enabled ? company : "");
  const ledger = useRows("acctLedger", enabled ? company : "");
  return React.useMemo(() => ({ ready: funds !== null, has: (funds || []).length > 0, ...computeFunds(funds || [], ledger || []) }), [funds, ledger]);
}

const Lbl = ({ children }) => <div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5 whitespace-nowrap">{children}</div>;
// 종류별 입력칸 — 은행·카드사(드롭다운) · 계좌/카드번호 · 명의 · 체크/신용 · 연결 통장
function FundFields({ f, set, funds = [], selfId }) {
  const card = isCard(f);
  const accounts = funds.filter((x) => x.active !== false && x.id !== selfId && !isCard(x) && !["대출", "현금"].includes(x.kind));
  const credit = card && f.payType !== "체크";
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="col-span-2"><Lbl>이름</Lbl><input value={f.name || ""} onChange={(e) => set({ name: e.target.value })} className={inp} placeholder={card ? "예: 홍길동카드, 영업팀 법인카드" : f.kind === "현금" ? "예: 현금 시재" : "예: 기업은행 운영자금"} /></div>
      {f.kind !== "현금" && (
        <>
          <div><Lbl>{card ? "카드사" : "은행"}</Lbl>
            <CustomSelect value={f.bank || ""} onChange={(e) => set({ bank: e.target.value })} className={inp}>
              <option value="">{card ? "카드사 선택" : "은행 선택"}</option>
              {(card ? CARD_COMPANIES : BANK_OPTIONS).map((b) => <option key={b} value={b}>{b}</option>)}
            </CustomSelect>
          </div>
          <div><Lbl>{card ? "카드번호" : "계좌번호"}</Lbl>
            <input inputMode="numeric" value={card ? formatCardNo(f.number) : formatAccount(f.bank, f.number)} onChange={(e) => set({ number: onlyDigits(e.target.value) })} className={`${inp} tabular-nums tracking-wide`} style={{ fontFamily: MONO }} placeholder={card ? "0000-0000-0000-0000" : f.bank ? "숫자만 — 하이픈 자동" : "은행을 먼저 고르세요"} />
          </div>
          <div className="col-span-2"><Lbl>{card ? "사용자(명의)" : "예금주"}</Lbl><input value={f.holder || ""} onChange={(e) => set({ holder: e.target.value })} className={inp} placeholder={card ? "예: 홍길동 / (주)회사명" : "예: (주)회사명"} /></div>
        </>
      )}
      {card && (
        <div className="col-span-2"><Lbl>결제 방식</Lbl>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white border border-[#E3E8F0]">
            {[["신용", "신용카드 (월 한도)"], ["체크", "체크카드 (통장에서 바로)"]].map(([k, l]) => <button key={k} type="button" onClick={() => set({ payType: k })} className={`h-10 rounded-lg text-[13.5px] font-black ${(f.payType || "신용") === k ? "bg-[#0F1A30] text-white" : "text-[#5B6B85]"}`}>{l}</button>)}
          </div>
        </div>
      )}
      {card && f.payType === "체크" && (
        <div className="col-span-2"><Lbl>연결 통장 <span className="font-semibold text-[#9AA9C3]">(이 카드로 쓰면 이 통장 잔액에서 빠집니다)</span></Lbl>
          <CustomSelect value={f.linkFundId || ""} onChange={(e) => set({ linkFundId: e.target.value })} className={inp}>
            <option value="">연결 안 함 — 카드 자체 잔액으로 관리</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.bank ? ` · ${a.bank}` : ""}{last4(a) ? ` ${last4(a)}` : ""}</option>)}
          </CustomSelect>
        </div>
      )}
    </div>
  );
}
const amountLabel = (f) => (f.kind === "대출" ? "남은 대출금" : isCard(f) && f.payType !== "체크" ? "월 사용 한도" : "기준일 잔액");
const blankFund = (kind = "보통예금") => ({ kind, name: "", bank: "", number: "", holder: "", payType: "신용", linkFundId: "", balance: "" });

// ── 처음 자금 셋팅(여러 계좌를 한 번에) ──
function SetupPanel({ company, onClose }) {
  const [rows, setRows] = React.useState([{ ...blankFund("보통예금"), name: "주거래 통장" }, { ...blankFund("현금"), name: "현금 시재" }]);
  const [date, setDate] = React.useState(kstDay());
  const [busy, setBusy] = React.useState(false);
  const set = (i, k, v) => setRows((p) => p.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const save = async () => {
    const ok = rows.filter((r) => r.name.trim());
    if (!ok.length) return alert("통장·현금을 하나 이상 입력해 주세요.");
    setBusy(true);
    try {
      for (const r of ok) await addDoc(collection(db, "acctFunds"), { companyName: company, kind: r.kind, name: r.name.trim(), bank: r.bank || "", number: onlyDigits(r.number), holder: (r.holder || "").trim(), payType: isCard(r) ? (r.payType || "신용") : "", linkFundId: "", openingBalance: toInt(r.balance), openingDate: date, checks: [], active: true, createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "" });
      onClose();
    } finally { setBusy(false); }
  };
  const total = rows.filter((r) => r.kind !== "대출" && !(isCard(r) && r.payType !== "체크")).reduce((s, r) => s + toInt(r.balance), 0);
  return (
    <Sheet side en="FUNDS · INITIAL SETUP" title="자금 상태 입력" onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">취소</button><button type="button" disabled={busy} onClick={save} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50">{busy ? "저장 중…" : `저장 · 보유 자금 ${won(total)}원`}</button></>}>
      <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4 text-[13px] text-[#5B6B85] leading-relaxed">
        회사 통장·카드·현금·예금·대출을 등록하고 <b className="text-[#0F1A30]">기준일 잔액</b>(카드는 월 한도)을 적어 주세요. 그 뒤로는 수입·지출 장부에서 통장·카드를 고르면 잔액이 자동으로 늘고 줄어듭니다.
      </div>
      <div><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">기준일</div><CustomDatePicker value={date} onChange={(e) => setDate(e.target.value)} className={inp} showIcon /></div>
      {rows.map((r, i) => (
        <div key={i} className="rounded-2xl bg-white border border-[#E3E8F0] p-4 space-y-2.5">
          <div className="flex items-center justify-between"><span className="text-[11px] font-extrabold tracking-[0.2em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>ACCOUNT {String(i + 1).padStart(2, "0")}</span>{rows.length > 1 && <button type="button" onClick={() => setRows((p) => p.filter((_, j) => j !== i))} className="text-[12px] font-bold text-[#9AA9C3]">빼기</button>}</div>
          <div className="flex flex-wrap gap-1.5">{FUND_KINDS.map((k) => <Chip key={k} on={r.kind === k} onClick={() => setRows((p) => p.map((x, j) => (j === i ? { ...x, kind: k, ...(isCard({ kind: k }) !== isCard(x) ? { bank: "", number: "" } : {}) } : x)))}>{k}</Chip>)}</div>
          <FundFields f={r} set={(patch) => setRows((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)))} funds={[]} />
          <div><Lbl>{amountLabel(r)}</Lbl><input inputMode="numeric" value={r.balance ? won(r.balance) : ""} onChange={(e) => set(i, "balance", e.target.value.replace(/[^\d]/g, ""))} className={`${inp} text-right tabular-nums`} style={{ fontFamily: MONO }} placeholder="0" /></div>
        </div>
      ))}
      <button type="button" onClick={() => setRows((p) => [...p, blankFund("보통예금")])} className="w-full h-12 rounded-2xl border-2 border-dashed border-[#C9D2E0] bg-white text-[14px] font-black text-[#1B2B4B]">+ 통장·카드·현금·대출 추가</button>
    </Sheet>
  );
}

// ── 계좌 하나 추가·수정 / 잔액 맞추기 ──
function AccountPanel({ company, acc, funds = [], onClose }) {
  const [f, setF] = React.useState(acc ? { payType: "신용", ...acc, kind: acc.kind === "법인카드 한도" ? "법인카드" : acc.kind, openingBalance: String(acc.openingBalance || "") } : { ...blankFund("보통예금"), openingBalance: "", openingDate: kstDay(), memo: "" });
  const [check, setCheck] = React.useState({ date: kstDay(), balance: "" });
  const save = async () => {
    if (!f.name.trim()) return alert("이름을 입력해 주세요.");
    const data = { kind: f.kind, name: f.name.trim(), bank: f.kind === "현금" ? "" : (f.bank || ""), number: f.kind === "현금" ? "" : onlyDigits(f.number), holder: (f.holder || "").trim(), payType: isCard(f) ? (f.payType || "신용") : "", linkFundId: isCard(f) && f.payType === "체크" ? (f.linkFundId || "") : "", useFor: f.kind === "대출" ? [] : (f.useFor || []), memo: (f.memo || "").trim(), openingBalance: toInt(f.openingBalance), openingDate: f.openingDate || kstDay(), companyName: company };
    if (acc?.id) await updateDoc(doc(db, "acctFunds", acc.id), { ...data, updatedAt: serverTimestamp() });
    else await addDoc(collection(db, "acctFunds"), { ...data, checks: [], active: true, createdAt: serverTimestamp() });
    onClose();
  };
  const addCheck = async () => {
    if (!check.balance) return alert("실제 잔액을 입력해 주세요.");
    await updateDoc(doc(db, "acctFunds", acc.id), { checks: arrayUnion({ date: check.date, balance: toInt(check.balance), at: Date.now(), by: auth.currentUser?.email || "" }) });
    onClose();
  };
  return (
    <Sheet side en={`FUNDS · ${acc ? "ACCOUNT" : "NEW ACCOUNT"}`} title={acc ? acc.name : "통장·카드·현금 등록"} onClose={onClose}
      footer={<>{acc && <button type="button" onClick={async () => { if (window.confirm("이 계좌를 목록에서 뺄까요? (기록은 남습니다)")) { await updateDoc(doc(db, "acctFunds", acc.id), { active: false }); onClose(); } }} className="h-12 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#B42318]">목록에서 빼기</button>}<button type="button" onClick={onClose} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">닫기</button><button type="button" onClick={save} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black">저장</button></>}>
      {acc && !isCredit(acc) && !(isCard(acc) && acc.linkFundId) && (
        <div className="rounded-2xl p-4 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
          <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>RECONCILE · 잔액 맞추기</div>
          <div className="text-[13px] text-white/70 mt-1">은행 앱의 실제 잔액과 다르면 오늘 실제 잔액을 적어 주세요. 이후 계산은 이 값부터 시작합니다.</div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mt-3">
            <CustomDatePicker value={check.date} onChange={(e) => setCheck((p) => ({ ...p, date: e.target.value }))} className="h-11 w-full px-3 rounded-xl text-[#0F1A30] text-[14px] font-bold" showIcon />
            <input inputMode="numeric" value={check.balance ? won(check.balance) : ""} onChange={(e) => setCheck((p) => ({ ...p, balance: e.target.value.replace(/[^\d-]/g, "") }))} className="h-11 w-full px-3 rounded-xl text-right text-[#0F1A30] text-[14px] font-black tabular-nums" style={{ fontFamily: MONO }} placeholder="실제 잔액" />
            <button type="button" onClick={addCheck} className="h-11 px-4 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black">맞추기</button>
          </div>
          {(acc.checks || []).length > 0 && <div className="mt-3 space-y-1">{[...acc.checks].reverse().slice(0, 5).map((c, i) => <div key={i} className="flex justify-between text-[12px] text-white/70"><span style={{ fontFamily: MONO }}>{c.date}</span><span className="font-black tabular-nums" style={{ fontFamily: MONO }}>{won(c.balance)}원</span></div>)}</div>}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">{FUND_KINDS.map((k) => <Chip key={k} on={f.kind === k} onClick={() => setF((p) => ({ ...p, kind: k, ...(isCard({ kind: k }) !== isCard(p) ? { bank: "", number: "" } : {}) }))}>{k}</Chip>)}</div>
      <FundFields f={f} set={(patch) => setF((p) => ({ ...p, ...patch }))} funds={funds} selfId={acc?.id} />
      {f.kind !== "대출" && (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4">
          <div className="text-[12.5px] font-black text-[#3A4A66]">자동 연동 기본 통장 <span className="font-semibold text-[#9AA9C3]">(다른 화면에서 처리한 돈이 이 통장 잔액에 자동 반영)</span></div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[["drvpay", "기사운임 지급(정산관리 지급완료)"], ["collect", "거래처 수금(회계관리 입금)"], ["expense", "지출결의·비품·퇴직금"]].map(([k, l]) => {
              const on = (f.useFor || []).includes(k);
              return <Chip key={k} on={on} onClick={() => setF((p) => ({ ...p, useFor: on ? (p.useFor || []).filter((x) => x !== k) : [...(p.useFor || []), k] }))}>{on ? "✓ " : ""}{l}</Chip>;
            })}
          </div>
          <div className="mt-2 text-[11.5px] text-[#7A879C]">용도마다 한 통장만 고르세요. 여러 통장에 같은 용도를 고르면 먼저 등록한 통장이 쓰입니다.</div>
        </div>
      )}
      {!(isCard(f) && f.payType === "체크" && f.linkFundId) && (
        <div className="grid grid-cols-2 gap-2">
          {!(isCard(f) && f.payType !== "체크") && <div><Lbl>기준일</Lbl><CustomDatePicker value={f.openingDate} onChange={(e) => setF((p) => ({ ...p, openingDate: e.target.value }))} className={inp} showIcon /></div>}
          <div className={isCard(f) && f.payType !== "체크" ? "col-span-2" : ""}><Lbl>{amountLabel(f)}</Lbl><input inputMode="numeric" value={f.openingBalance ? won(f.openingBalance) : ""} onChange={(e) => setF((p) => ({ ...p, openingBalance: e.target.value.replace(/[^\d-]/g, "") }))} className={`${inp} text-right tabular-nums`} style={{ fontFamily: MONO }} /></div>
        </div>
      )}
      <div><Lbl>메모</Lbl><input value={f.memo || ""} onChange={(e) => setF((p) => ({ ...p, memo: e.target.value }))} className={inp} placeholder="예: 급여 이체 전용 · 결제일 매달 15일" /></div>
    </Sheet>
  );
}

// ── 자금 현황 ──
export function FundsBoard({ company, canEdit = true }) {
  const funds = useRows("acctFunds", company);
  const ledger = useRows("acctLedger", company);
  const S = React.useMemo(() => computeFunds(funds || [], ledger || []), [funds, ledger]);
  const [setup, setSetup] = React.useState(false);
  const [acc, setAcc] = React.useState(null); // {} = 새 계좌
  const six = [5, 4, 3, 2, 1, 0].map(ymAgo).map((m) => { const r = (ledger || []).filter((x) => String(x.date || "").startsWith(m)); return { m, in: r.filter((x) => x.type === "수입").reduce((s, x) => s + toInt(x.amount), 0), out: r.filter((x) => x.type === "지출").reduce((s, x) => s + toInt(x.amount), 0) }; });
  const max = Math.max(1, ...six.flatMap((x) => [x.in, x.out]));
  const assetList = S.list.filter(S.inCash).sort((a, b) => b.balance - a.balance);
  const cards = S.list.filter(isCard);
  const net = S.thisMonth.in - S.thisMonth.out;
  if (funds === null) return <div className="py-20 text-center text-[13px] font-bold text-[#9AA9C3]">불러오는 중…</div>;
  return (
    <div className="space-y-4">
      <BookHero en="FINANCE · TREASURY" title="자금 현황" desc="통장·카드·현금·예금·대출 잔액과 현금 흐름 — 장부에서 통장·카드를 고르면 자동으로 늘고 줄어듭니다"
        right={canEdit && funds.length > 0 && <button type="button" onClick={() => setAcc({})} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black whitespace-nowrap">+ 통장·카드 등록</button>}
        kpis={[
          ["보유 자금", `${won(S.cash)}원`, `${assetList.length}개 계좌·현금`],
          ["이번 달 순현금흐름", `${net >= 0 ? "+" : ""}${short(net)}원`, `수입 ${short(S.thisMonth.in)} · 지출 ${short(S.thisMonth.out)}`],
          ["운영 가능 기간", S.runway == null ? "—" : `${S.runway.toFixed(1)}개월`, `월평균 지출 ${short(S.avgOut)}원 기준`],
          cards.length ? ["이번 달 카드 사용", `${won(S.cardMonth)}원`, `${cards.length}장 · 대출 ${short(S.loan)}원`] : ["대출 잔액", `${won(S.loan)}원`, S.loan ? "기준일·맞추기 잔액" : "등록된 대출 없음"],
        ]} />
      {!funds.length ? (
        <div className="rounded-[22px] border-2 border-dashed border-[#C9D2E0] bg-white px-6 py-12 text-center">
          <div className="text-[11px] font-extrabold tracking-[0.26em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>GET STARTED</div>
          <div className="text-[20px] font-black text-[#0F1A30] mt-1">자금 상태를 입력해 주세요</div>
          <div className="text-[13.5px] text-[#7A879C] mt-1">통장·카드·현금·예금·대출을 등록하고 지금 잔액만 적으면, 이후엔 장부 입출금으로 자동 계산됩니다</div>
          {canEdit ? <button type="button" onClick={() => setSetup(true)} className="mt-5 h-12 px-6 rounded-2xl bg-[#0F1A30] text-white text-[15px] font-black">자금 상태 입력</button> : <div className="mt-4 text-[13px] font-bold text-[#9AA9C3]">경리 담당자가 입력하면 여기에 보입니다</div>}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
          <BookCard en="ACCOUNTS" title="계좌·현금별 잔액" flush>
            <div className="divide-y divide-[#EEF2F8]">
              {[...S.list].sort((a, b) => (a.kind === "대출") - (b.kind === "대출") || isCard(a) - isCard(b) || b.balance - a.balance).map((f) => {
                const share = S.cash > 0 && S.inCash(f) ? (f.balance / S.cash) * 100 : 0;
                const credit = isCredit(f);
                const usePct = credit && f.limit > 0 ? Math.min(100, ((f.usedMonth || 0) / f.limit) * 100) : 0;
                const sub = isCard(f)
                  ? [f.kind, f.bank, last4(f), f.holder, credit ? `이번 달 ${won(f.usedMonth || 0)}원 사용` : f.linkName ? `→ ${f.linkName}에서 출금` : "체크", f.usesMonth ? `${f.usesMonth}건` : ""]
                  : [f.kind, f.bank, last4(f), `기준 ${f.base.date || "-"}`, f.moves ? `이후 입출금 ${f.moves}건` : ""];
                return (
                  <button key={f.id} type="button" disabled={!canEdit} onClick={() => setAcc(funds.find((x) => x.id === f.id))} className="w-full text-left px-4 py-3.5 flex items-center gap-3 enabled:hover:bg-[#F7F9FC]">
                    <span className={`w-11 h-11 rounded-2xl shrink-0 grid place-items-center text-[11px] font-black ${f.kind === "대출" ? "bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA]" : f.kind === "현금" ? "bg-[#EEF3FC] text-[#2D4C82]" : isCard(f) ? "text-white" : "bg-[#0F1A30] text-white"}`} style={isCard(f) ? { background: "linear-gradient(135deg,#B88A2E,#E2C077)" } : undefined}>{fundBadge(f)}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15.5px] font-black text-[#0F1A30] truncate">{f.name}</span>
                      <span className="block text-[12.5px] text-[#7A879C] truncate">{sub.filter(Boolean).join(" · ")}</span>
                      {share > 0 && <span className="mt-1.5 block h-1.5 rounded-full bg-[#EEF2F8] overflow-hidden max-w-[320px]"><span className="block h-full rounded-full bg-gradient-to-r from-[#1B2B4B] to-[#4B6CB7]" style={{ width: `${Math.max(2, share)}%` }} /></span>}
                      {credit && f.limit > 0 && <span className="mt-1.5 block h-1.5 rounded-full bg-[#EEF2F8] overflow-hidden max-w-[320px]"><span className={`block h-full rounded-full ${usePct > 85 ? "bg-[#B42318]" : "bg-gradient-to-r from-[#B88A2E] to-[#E2C077]"}`} style={{ width: `${Math.max(2, usePct)}%` }} /></span>}
                    </span>
                    <span className="text-right shrink-0">
                      {credit && <span className="block text-[10.5px] font-black text-[#9AA9C3]">남은 한도</span>}
                      {isCard(f) && f.linkName && <span className="block text-[10.5px] font-black text-[#9AA9C3]">통장 잔액</span>}
                      <span className={`block text-[17px] font-black tabular-nums ${f.kind === "대출" || f.balance < 0 ? "text-[#B42318]" : "text-[#0F1A30]"}`} style={{ fontFamily: MONO }}>{f.kind === "대출" ? "−" : f.balance < 0 ? "−" : ""}{won(Math.abs(f.balance))}</span>
                      {share > 0 && <span className="block text-[11px] font-bold text-[#9AA9C3] tabular-nums" style={{ fontFamily: MONO }}>{share.toFixed(1)}%</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </BookCard>
          <BookCard en="CASH FLOW · 6 MONTHS" title="월별 수입 · 지출">
            <div className="flex items-end gap-2 h-[200px] pt-2">
              {six.map((x) => (
                <div key={x.m} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end justify-center gap-[3px] h-[160px]">
                    <span title={`수입 ${won(x.in)}원`} className="w-[38%] rounded-t-md bg-[#4B6CB7]" style={{ height: `${(x.in / max) * 100}%` }} />
                    <span title={`지출 ${won(x.out)}원`} className="w-[38%] rounded-t-md bg-[#0F1A30]" style={{ height: `${(x.out / max) * 100}%` }} />
                  </div>
                  <span className="text-[11.5px] font-black text-[#5B6B85] tabular-nums" style={{ fontFamily: MONO }}>{x.m.slice(5)}월</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-3 text-[12px] font-bold text-[#5B6B85]"><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#4B6CB7]" />수입</span><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#0F1A30]" />지출</span></div>
            <div className="mt-3 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2.5 text-[12px] text-[#5B6B85] leading-relaxed">
              잔액은 <b className="text-[#0F1A30]">기준일 잔액 + 장부에서 이 통장·카드로 지정한 입출금</b>으로 계산합니다. 체크카드는 연결 통장에서, 신용카드는 이번 달 한도에서 빠집니다. 은행 잔액과 다르면 계좌를 눌러 <b className="text-[#0F1A30]">잔액 맞추기</b>를 해 주세요.
            </div>
          </BookCard>
        </div>
      )}
      {setup && <SetupPanel company={company} onClose={() => setSetup(false)} />}
      {acc && <AccountPanel company={company} acc={acc.id ? acc : null} funds={funds || []} onClose={() => setAcc(null)} />}
    </div>
  );
}

// ── 경리 상단 메뉴 › 자금관리: 자금 현황 · 수입·지출 장부 ──
export function FundsWorkspace({ company, isViewer = false }) {
  const [tab, setTab] = React.useState(() => { try { const v = sessionStorage.getItem("kpFundsTab"); sessionStorage.removeItem("kpFundsTab"); return v || "funds"; } catch { return "funds"; } });
  return (
    <KpSubNav code="FINANCE" title="자금관리" icon="wallet" active={tab} onSelect={setTab}
      items={[{ key: "funds", label: "자금 현황", en: "TREASURY", icon: "wallet" }, { key: "book", label: "수입·지출 장부", en: "CASH BOOK", icon: "sheet" }]}>
      {tab === "funds" ? <FundsBoard company={company} canEdit={!isViewer} /> : <CashBook company={company} isViewer={isViewer} />}
    </KpSubNav>
  );
}
