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
import { ManualButton } from "./WorkManual"; // 📘 2026-11-14 자금 매뉴얼
import { BookHero, BookCard, Chip, Sheet, MONO, CashBook, BookSkeleton } from "./OfficeBooks";
import { useCompanyRows } from "./companyColStore";
import CustomDatePicker from "./CustomDatePicker";
import { CustomSelect } from "./CustomSelect";
import { formatAccount, onlyDigits } from "./bankUtil";
import { FUND_KINDS, CARD_COMPANIES, BANK_OPTIONS, computeFunds, toInt, isCard, isCredit, fundBadge, formatCardNo, last4 } from "./fundsCalc";
import { kpConfirm } from "./kpDialog";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { useExecMode, EX, EX_NUM, GOLD_GRAD, ExecPage, ExecPanel, ExecKpis, ExecGrid, Kpi, Num, Eyebrow, GoldRule, Ring, Meter, Chip as XChip, Empty, Legend, ExecTooltip, chartTheme, moneyParts, fmtWon, fmtMan, fmtEokMan, pctChange } from "./execUi"; // 👑 2026-11-17 임원 자금현황

const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const short = (n) => { const a = Math.abs(n || 0); if (a >= 1e8) return `${(n / 1e8).toFixed(1)}억`; if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`; return Math.round(n || 0).toLocaleString(); };
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const ymAgo = (n) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 7); };
const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
export { FUND_KINDS, computeFunds };
// 대표 직책 — 자금 화면을 볼 수 있는 임원
export const isCeoPosition = (p) => ["대표", "대표이사", "사장"].includes(String(p || "").trim());

// ⭐ 2026-11-06 속도 — 공용 구독(companyColStore): 자금 현황·장부·대시보드가 같은 구독을 함께 쓰고, 닫아도 3분간 유지
function useRows(name, company) {
  return useCompanyRows(name, company);
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
            <input inputMode="numeric" value={card ? formatCardNo(f.number) : formatAccount(f.bank, f.number)} onChange={(e) => set({ number: onlyDigits(e.target.value) })} className={`${inp} tabular-nums tracking-wide`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} placeholder={card ? "0000-0000-0000-0000" : f.bank ? "숫자만 — 하이픈 자동" : "은행을 먼저 고르세요"} />
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
    } catch (e) {
      // ⭐ 2026-11-02 점검 — 권한 없음 등으로 저장 실패 시 안내 없이 멈추던 문제: 오류 안내 추가
      alert(`저장 실패: ${e.message}`);
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
          <div className="flex items-center justify-between"><span className="text-[11px] font-extrabold tracking-[0.2em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>ACCOUNT {String(i + 1).padStart(2, "0")}</span>{rows.length > 1 && <button type="button" onClick={() => setRows((p) => p.filter((_, j) => j !== i))} className="text-[12px] font-bold text-[#9AA9C3]">빼기</button>}</div>
          <div className="flex flex-wrap gap-1.5">{FUND_KINDS.map((k) => <Chip key={k} on={r.kind === k} onClick={() => setRows((p) => p.map((x, j) => (j === i ? { ...x, kind: k, ...(isCard({ kind: k }) !== isCard(x) ? { bank: "", number: "" } : {}) } : x)))}>{k}</Chip>)}</div>
          <FundFields f={r} set={(patch) => setRows((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)))} funds={[]} />
          <div><Lbl>{amountLabel(r)}</Lbl><input inputMode="numeric" value={r.balance ? won(r.balance) : ""} onChange={(e) => set(i, "balance", e.target.value.replace(/[^\d]/g, ""))} className={`${inp} text-right tabular-nums`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} placeholder="0" /></div>
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
    // ⭐ 2026-11-02 점검 — 저장 실패(권한 없음 등) 시 아무 안내가 없던 문제: try/catch로 오류 안내
    try {
      if (acc?.id) await updateDoc(doc(db, "acctFunds", acc.id), { ...data, updatedAt: serverTimestamp() });
      else await addDoc(collection(db, "acctFunds"), { ...data, checks: [], active: true, createdAt: serverTimestamp() });
      onClose();
    } catch (e) {
      alert(`저장 실패: ${e.message}`);
    }
  };
  const addCheck = async () => {
    if (!check.balance) return alert("실제 잔액을 입력해 주세요.");
    await updateDoc(doc(db, "acctFunds", acc.id), { checks: arrayUnion({ date: check.date, balance: toInt(check.balance), at: Date.now(), by: auth.currentUser?.email || "" }) });
    onClose();
  };
  return (
    <Sheet side en={`FUNDS · ${acc ? "ACCOUNT" : "NEW ACCOUNT"}`} title={acc ? acc.name : "통장·카드·현금 등록"} onClose={onClose}
      footer={<>{acc && <button type="button" onClick={async () => { if ((await kpConfirm("이 계좌를 목록에서 뺄까요? (기록은 남습니다)"))) { await updateDoc(doc(db, "acctFunds", acc.id), { active: false }); onClose(); } }} className="h-12 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#B42318]">목록에서 빼기</button>}<button type="button" onClick={onClose} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">닫기</button><button type="button" onClick={save} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black">저장</button></>}>
      {acc && !isCredit(acc) && !(isCard(acc) && acc.linkFundId) && (
        <div className="rounded-2xl p-4 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
          <div className="text-[11px] font-extrabold tracking-[0.08em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>RECONCILE · 잔액 맞추기</div>
          <div className="text-[13px] text-white/70 mt-1">은행 앱의 실제 잔액과 다르면 오늘 실제 잔액을 적어 주세요. 이후 계산은 이 값부터 시작합니다.</div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mt-3">
            <CustomDatePicker value={check.date} onChange={(e) => setCheck((p) => ({ ...p, date: e.target.value }))} className="h-11 w-full px-3 rounded-xl text-[#0F1A30] text-[14px] font-bold" showIcon />
            <input inputMode="numeric" value={check.balance ? won(check.balance) : ""} onChange={(e) => setCheck((p) => ({ ...p, balance: e.target.value.replace(/[^\d-]/g, "") }))} className="h-11 w-full px-3 rounded-xl text-right text-[#0F1A30] text-[14px] font-black tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} placeholder="실제 잔액" />
            <button type="button" onClick={addCheck} className="h-11 px-4 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black">맞추기</button>
          </div>
          {(acc.checks || []).length > 0 && <div className="mt-3 space-y-1">{[...acc.checks].reverse().slice(0, 5).map((c, i) => <div key={i} className="flex justify-between text-[12px] text-white/70"><span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{c.date}</span><span className="font-black tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won(c.balance)}원</span></div>)}</div>}
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
          <div className={isCard(f) && f.payType !== "체크" ? "col-span-2" : ""}><Lbl>{amountLabel(f)}</Lbl><input inputMode="numeric" value={f.openingBalance ? won(f.openingBalance) : ""} onChange={(e) => setF((p) => ({ ...p, openingBalance: e.target.value.replace(/[^\d-]/g, "") }))} className={`${inp} text-right tabular-nums`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} /></div>
        </div>
      )}
      <div><Lbl>메모</Lbl><input value={f.memo || ""} onChange={(e) => setF((p) => ({ ...p, memo: e.target.value }))} className={inp} placeholder="예: 급여 이체 전용 · 결제일 매달 15일" /></div>
    </Sheet>
  );
}

// ── 자금 현황 ──
// 👑 2026-11-17 임원 화면(useExecMode) 이면 대표용 자금 보고서판(ExecFundsView), 아니면 경리 화면 그대로(FundsBoardOffice)
export function FundsBoard(props) {
  const exec = useExecMode();
  return exec ? <ExecFundsView company={props.company} /> : <FundsBoardOffice {...props} />;
}
function FundsBoardOffice({ company, canEdit = true }) {
  const funds = useRows("acctFunds", company);
  const ledger = useRows("acctLedger", company);
  const S = React.useMemo(() => computeFunds(funds || [], ledger || []), [funds, ledger]);
  const [setup, setSetup] = React.useState(false);
  const [acc, setAcc] = React.useState(null); // {} = 새 계좌
  // ⭐ 2026-11-06 속도 — 6개월 합계는 장부를 한 번만 훑어서(장부가 바뀔 때만 다시)
  const six = React.useMemo(() => {
    const ms = [5, 4, 3, 2, 1, 0].map(ymAgo); const acc = Object.fromEntries(ms.map((m) => [m, { m, in: 0, out: 0 }]));
    for (const x of ledger || []) { const a = acc[String(x.date || "").slice(0, 7)]; if (!a) continue; if (x.type === "수입") a.in += toInt(x.amount); else if (x.type === "지출") a.out += toInt(x.amount); }
    return ms.map((m) => acc[m]);
  }, [ledger]);
  const max = Math.max(1, ...six.flatMap((x) => [x.in, x.out]));
  const assetList = S.list.filter(S.inCash).sort((a, b) => b.balance - a.balance);
  const cards = S.list.filter(isCard);
  const net = S.thisMonth.in - S.thisMonth.out;
  if (funds === null) return <BookSkeleton rows={5} />; // ⭐ 2026-11-06 뼈대 화면
  return (
    <div className="space-y-4">
      <BookHero en="FINANCE · TREASURY" title="자금 현황" desc="통장·카드·현금·예금·대출 잔액과 현금 흐름 — 장부에서 통장·카드를 고르면 자동으로 늘고 줄어듭니다"
        right={<div className="flex items-center gap-2 flex-wrap"><ManualButton menu="자금관리" section="funds" dark />{canEdit && funds.length > 0 && <button type="button" onClick={() => setAcc({})} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black whitespace-nowrap">+ 통장·카드 등록</button>}</div>}
        kpis={[
          ["보유 자금", `${won(S.cash)}원`, `${assetList.length}개 계좌·현금`],
          ["이번 달 순현금흐름", `${net >= 0 ? "+" : ""}${short(net)}원`, `수입 ${short(S.thisMonth.in)} · 지출 ${short(S.thisMonth.out)}`, net], // ⭐ 2026-11-17 플러스 빨강 · 마이너스 파랑
          ["운영 가능 기간", S.runway == null ? "—" : `${S.runway.toFixed(1)}개월`, `월평균 지출 ${short(S.avgOut)}원 기준`],
          cards.length ? ["이번 달 카드 사용", `${won(S.cardMonth)}원`, `${cards.length}장 · 대출 ${short(S.loan)}원`] : ["대출 잔액", `${won(S.loan)}원`, S.loan ? "기준일·맞추기 잔액" : "등록된 대출 없음"],
        ]} />
      {!funds.length ? (
        <div className="rounded-[22px] border-2 border-dashed border-[#C9D2E0] bg-white px-6 py-12 text-center">
          <div className="text-[11px] font-extrabold tracking-[0.08em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>GET STARTED</div>
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
                      <span className={`block text-[17px] font-black tabular-nums ${f.balance < 0 ? "text-[#2D6BE0]" : f.kind === "대출" ? "text-[#B42318]" : "text-[#0F1A30]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{f.kind === "대출" ? "−" : f.balance < 0 ? "−" : ""}{won(Math.abs(f.balance))}</span>
                      {share > 0 && <span className="block text-[11px] font-bold text-[#9AA9C3] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{share.toFixed(1)}%</span>}
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
                  <span className="text-[11.5px] font-black text-[#5B6B85] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{x.m.slice(5)}월</span>
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

// ══════════════════════════════════════════════════════════════════════════
// 👑 2026-11-17 임원 자금현황 — 대표 · 임원이 보는 "자금 보고서판"(보기 전용 · 입력 버튼 · 매뉴얼 없음)
//  · 계산은 경리 화면과 같다(computeFunds · 장부 입출금) — 모양 · 구성 · 문장만 임원용
//  · 결론 한 줄 → 보유 자금 · 운영 가능 기간 → 이번 달 현금 흐름 타일 → 6개월 흐름 그래프 · 계좌별 잔액
//  · 개발 둘러보기(/preview?demo=1&demoFunds=1)에서만 가짜 자금 · 장부로 채운 모양을 확인할 수 있다(배포 빌드에서는 빠짐)
const XF_KIND = [["보통예금", "보통예금", EX.gold], ["정기예금·적금", "정기예금 · 적금", EX.ice], ["현금", "현금 시재", "#6E8BC9"], ["기타", "체크카드 · 기타", "#B9A4E8"]];
const xfGroup = (f) => (["보통예금", "정기예금·적금", "현금"].includes(f.kind) ? f.kind : "기타");
const xfDot = (d) => String(d || "").replace(/-/g, ".");
function useExecFundsDemo(company) {
  const [d, setD] = React.useState(null);
  React.useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    let on = true;
    try { const q = new URLSearchParams(window.location.search); if (q.get("demo") !== "1" || q.get("demoFunds") !== "1") return undefined; } catch { return undefined; }
    import("./execAnalyticsDemo").then((m) => { if (on) { const x = m.execAnalyticsDemo(company); setD({ funds: x.funds, ledger: x.ledger }); } }).catch(() => {});
    return () => { on = false; };
  }, [company]);
  return d;
}
// 순현금흐름 타일(플러스 빨강 · 마이너스 파랑 — 앱 전체 규칙)
function XfNetTile({ net, foot }) {
  const [a, u] = moneyParts(Math.abs(net));
  const c = net > 0 ? EX.up : net < 0 ? EX.down : EX.text;
  return (
    <div className="relative rounded-[20px] p-4 md:p-5 min-w-0 overflow-hidden" style={{ background: EX.panel, border: `1px solid ${EX.line}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)" }}>
      <Eyebrow color={EX.ice} size={10}>NET CASH FLOW</Eyebrow>
      <div className="mt-1 text-[13px] md:text-[13.5px] font-bold truncate" style={{ color: EX.sub }}>이번 달 순현금흐름</div>
      <div className="mt-2.5"><Num value={`${net > 0 ? "+" : net < 0 ? "−" : ""}${a}`} unit={u} size={32} color={c} /></div>
      <div className="mt-2.5 text-[12px] font-semibold truncate" style={{ color: EX.mute }}>{foot}</div>
    </div>
  );
}
function XfBadge({ f }) {
  const b = fundBadge(f);
  const st = b === "LOAN" ? { color: EX.up, background: "rgba(255,138,122,.10)", border: "1px solid rgba(255,138,122,.28)" }
    : b === "CARD" ? { color: "#1A1408", background: GOLD_GRAD, border: "1px solid transparent" }
      : b === "CASH" ? { color: EX.ice, background: "rgba(143,176,240,.10)", border: "1px solid rgba(143,176,240,.28)" }
        : { color: EX.goldHi, background: "rgba(215,188,130,.10)", border: `1px solid ${EX.lineHi}` };
  return <span className="w-11 h-11 rounded-2xl shrink-0 grid place-items-center text-[10px] font-black tracking-[0.12em]" style={{ ...EX_NUM, ...st }}>{b}</span>;
}
function XfRow({ f, share, right, sub }) {
  return (
    <li className="py-3.5 flex items-center gap-3 min-w-0" style={{ borderTop: "1px solid rgba(255,255,255,.05)" }}>
      <XfBadge f={f} />
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] font-extrabold truncate" style={{ color: EX.text }}>{f.name}</div>
        <div className="mt-0.5 text-[12px] font-semibold truncate" style={{ color: EX.mute }}>{sub}</div>
        {share != null && <div className="mt-2 max-w-[260px]"><Meter value={share} max={100} height={4} /></div>}
      </div>
      <div className="shrink-0 text-right">{right}</div>
    </li>
  );
}
const XfAmt = ({ v, neg, color = EX.text, cap }) => (
  <>
    {cap && <div className="text-[10.5px] font-extrabold mb-0.5" style={{ color: EX.faint }}>{cap}</div>}
    <div className="text-[16px] font-black whitespace-nowrap" style={{ ...EX_NUM, color: v < 0 ? EX.down : color }}>{neg || v < 0 ? "−" : ""}{fmtWon(Math.abs(v))}<span className="ml-0.5 text-[12px] font-bold" style={{ color: EX.mute }}>원</span></div>
  </>
);
function XfGroupHead({ label, total, neg }) {
  return (
    <div className="mt-4 first:mt-1 mb-1 flex items-baseline justify-between gap-3">
      <span className="text-[12px] font-extrabold tracking-[0.04em]" style={{ color: EX.sub }}>{label}</span>
      {total != null && <span className="text-[12.5px] font-black" style={{ ...EX_NUM, color: EX.mute }}>{neg ? "−" : ""}{fmtWon(Math.abs(total))}원</span>}
    </div>
  );
}
// 6개월 들어온 돈 · 나간 돈 · 순흐름(만원)
function XfFlowChart({ six }) {
  const id = React.useId().replace(/:/g, "");
  const data = six.map((x) => ({ label: `${Number(x.m.slice(5))}월`, in: x.in, out: x.out, net: x.in - x.out }));
  return (
    <div className="h-[260px] md:h-[300px] xl:h-[400px] -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barGap={4} barCategoryGap="28%">
          <defs>
            <linearGradient id={`xfi${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#F1DDAE" /><stop offset="100%" stopColor="#A8874A" stopOpacity=".85" /></linearGradient>
            <linearGradient id={`xfo${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8FB0F0" stopOpacity=".9" /><stop offset="100%" stopColor="#4B6CB7" stopOpacity=".55" /></linearGradient>
          </defs>
          <CartesianGrid {...chartTheme.grid} />
          <XAxis dataKey="label" {...chartTheme.axis} dy={6} />
          <YAxis {...chartTheme.axis} width={58} tickFormatter={(v) => fmtMan(v)} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,.18)" />
          <Tooltip cursor={chartTheme.cursor} content={<ExecTooltip fmt={(v) => fmtMan(v)} unit="만원" />} />
          <Bar dataKey="in" name="들어온 돈" fill={`url(#xfi${id})`} radius={[6, 6, 0, 0]} maxBarSize={30} />
          <Bar dataKey="out" name="나간 돈" fill={`url(#xfo${id})`} radius={[6, 6, 0, 0]} maxBarSize={30} />
          <Line dataKey="net" name="순현금흐름" type="monotone" stroke={EX.text} strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3, fill: EX.bg1, stroke: EX.text, strokeWidth: 1.5 }} activeDot={{ r: 4.5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
// 6개월 합계(만원) — 그래프 아래 한 줄
function XfFlowSum({ six }) {
  const tin = six.reduce((s, x) => s + x.in, 0); const tout = six.reduce((s, x) => s + x.out, 0); const tnet = tin - tout;
  const done = six.slice(0, -1).filter((x) => x.in || x.out);
  const avg = done.length ? done.reduce((s, x) => s + x.out, 0) / done.length : tout;
  const cells = [["6개월 들어온 돈", fmtMan(tin), EX.text], ["6개월 나간 돈", fmtMan(tout), EX.text], ["6개월 순현금흐름", `${tnet > 0 ? "+" : tnet < 0 ? "−" : ""}${fmtMan(Math.abs(tnet))}`, tnet > 0 ? EX.up : tnet < 0 ? EX.down : EX.text], ["월평균 나간 돈", fmtMan(avg), EX.text]];
  return (
    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden" style={{ border: `1px solid ${EX.line}`, background: EX.line }}>
      {cells.map(([l, v, c]) => (
        <div key={l} className="px-3.5 py-3 min-w-0" style={{ background: EX.bg1 }}>
          <div className="text-[11.5px] font-bold truncate" style={{ color: EX.mute }}>{l}</div>
          <div className="mt-1"><Num value={v} unit="만원" size={18} weight={800} color={c} /></div>
        </div>
      ))}
    </div>
  );
}
function ExecFundsSkeleton() {
  return (
    <ExecPage en="TREASURY" title="자금현황" sub="불러오는 중입니다">
      <div className="grid gap-4 md:grid-cols-[1.5fr_1fr]">{[0, 1].map((i) => <div key={i} className="h-[210px] rounded-[22px] animate-pulse" style={{ background: EX.panel, border: `1px solid ${EX.line}` }} />)}</div>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-[120px] rounded-[20px] animate-pulse" style={{ background: EX.panel, border: `1px solid ${EX.line}` }} />)}</div>
    </ExecPage>
  );
}

function ExecFundsView({ company }) {
  const demo = useExecFundsDemo(company);
  const fundsLive = useRows("acctFunds", company);
  const ledgerLive = useRows("acctLedger", company);
  const funds = demo ? demo.funds : fundsLive;
  const ledger = demo ? demo.ledger : ledgerLive || [];
  const S = React.useMemo(() => computeFunds(funds || [], ledger), [funds, ledger]);
  const six = React.useMemo(() => {
    const ms = [5, 4, 3, 2, 1, 0].map(ymAgo); const a = Object.fromEntries(ms.map((m) => [m, { m, in: 0, out: 0 }]));
    for (const x of ledger) { const e = a[String(x.date || "").slice(0, 7)]; if (!e) continue; if (x.type === "수입") e.in += toInt(x.amount); else if (x.type === "지출") e.out += toInt(x.amount); }
    return ms.map((m) => a[m]);
  }, [ledger]);
  const today = kstDay();
  if (funds === null) return <ExecFundsSkeleton />;
  const hasFlow = six.some((x) => x.in || x.out);
  const head = { en: "TREASURY", title: "자금현황", sub: "회사 통장 · 현금 · 예금 잔액과 돈의 흐름입니다 · 보기 전용(입력은 경리 담당자가 자금관리에서 합니다)", right: <XChip tone="mute">{xfDot(today)} 기준</XChip> };

  // ── 아직 입력 전 ──
  if (!funds.length) {
    return (
      <ExecPage testId="exec-funds" {...head}>
        <ExecPanel glow pad={false}>
          <div className="px-5 py-12 md:py-16 flex flex-col items-center text-center">
            <div className="relative w-[92px] h-[92px] grid place-items-center rounded-full" style={{ border: `1px solid ${EX.lineHi}`, background: "radial-gradient(circle at 50% 35%, rgba(215,188,130,.18), rgba(215,188,130,.02) 70%)", boxShadow: "0 0 40px rgba(215,188,130,.12)" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={EX.gold} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="12" cy="12" r="3.6" /><path d="M12 8.4v1.2M12 14.4v1.2M8.4 12h1.2M14.4 12h1.2M6 20v1.5M18 20v1.5" /></svg>
            </div>
            <Eyebrow className="mt-6">AWAITING FIRST ENTRY</Eyebrow>
            <h2 className="mt-2 text-[21px] md:text-[24px] font-black tracking-[-0.02em]" style={{ color: EX.text }}>아직 입력된 자금 정보가 없습니다</h2>
            <p className="mt-2 text-[14px] md:text-[14.5px] font-semibold leading-relaxed" style={{ color: EX.sub }}>경리 담당자가 자금관리에 잔액을 입력하면 여기에 보입니다.</p>
            <p className="mt-1 text-[12.5px] font-medium leading-relaxed max-w-[520px]" style={{ color: EX.mute, wordBreak: "keep-all" }}>통장 · 현금 · 예금 · 카드 · 대출을 한 번 등록하면, 그 뒤로는 수입 · 지출 장부의 입출금으로 잔액이 자동으로 계산됩니다.</p>
            <div className="mt-8 w-full max-w-[720px] grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))" }}>
              {[["TOTAL CASH", "보유 자금", "원"], ["RUNWAY", "운영 가능 기간", "개월"], ["NET CASH FLOW", "이번 달 순현금흐름", "원"]].map(([en, l, u]) => (
                <div key={l} className="rounded-2xl px-4 py-3.5 text-left" style={{ border: `1px dashed ${EX.line}`, background: "rgba(255,255,255,.02)" }}>
                  <Eyebrow color={EX.faint} size={9.5}>{en}</Eyebrow>
                  <div className="mt-1 text-[12.5px] font-bold" style={{ color: EX.mute }}>{l}</div>
                  <div className="mt-2"><Num value="—" unit={u} size={24} color={EX.faint} unitColor={EX.faint} /></div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[11.5px] font-semibold" style={{ color: EX.faint }}>입력되면 이 자리에 보이는 항목입니다</div>
          </div>
        </ExecPanel>
        {hasFlow && (
          <ExecPanel en="CASH FLOW · 6 MONTHS" title="월별 들어온 돈 · 나간 돈" sub="수입 · 지출 장부 기준 · 단위 만원" right={<Legend items={[["들어온 돈", EX.gold], ["나간 돈", EX.ice], ["순현금흐름", EX.text, "line"]]} />}>
            <XfFlowChart six={six} />
          </ExecPanel>
        )}
      </ExecPage>
    );
  }

  // ── 보고서판 ──
  const cashList = S.list.filter(S.inCash).sort((a, b) => b.balance - a.balance);
  const cards = S.list.filter(isCard).filter((f) => !S.inCash(f));
  const loans = S.list.filter((f) => f.kind === "대출").sort((a, b) => b.balance - a.balance);
  const tm = S.thisMonth; const lm = S.monthly[1] || { in: 0, out: 0 };
  const net = tm.in - tm.out;
  const runway = S.runway;
  const rTone = runway == null ? EX.faint : runway < 3 ? EX.danger : runway < 6 ? EX.warn : EX.gold;
  const rChip = runway == null ? ["mute", "계산 대기"] : runway < 3 ? ["up", "주의"] : runway < 6 ? ["warn", "보통"] : ["gold", "여유"];
  const comp = XF_KIND.map(([k, l, c]) => ({ k, l, c, v: cashList.filter((f) => xfGroup(f) === k).reduce((s, f) => s + Math.max(0, f.balance), 0), n: cashList.filter((f) => xfGroup(f) === k).length })).filter((x) => x.n);
  const compTotal = comp.reduce((s, x) => s + x.v, 0) || 1;
  const [ca, cu] = moneyParts(S.cash);
  const brief = [
    <>보유 자금은 <b style={{ color: EX.goldHi }}>{fmtEokMan(S.cash)}</b>입니다.</>,
    runway != null ? <> 최근 3개월 평균 지출로 보면 약 <b style={{ color: EX.text }}>{runway.toFixed(1)}개월</b> 운영할 수 있습니다.</> : null,
    tm.in || tm.out ? <> 이번 달은 {net >= 0 ? "들어온 돈이" : "나간 돈이"} <b style={{ color: net >= 0 ? EX.up : EX.down }}>{fmtEokMan(Math.abs(net))}</b> 더 많습니다.</> : <> 이번 달 장부 입출금 기록은 아직 없습니다.</>,
    S.loan > 0 ? <> 대출 잔액은 {fmtEokMan(S.loan)}입니다.</> : null,
  ];
  const kpis = [
    <Kpi key="in" en="INFLOW" label="이번 달 들어온 돈" money={tm.in} delta={pctChange(tm.in, lm.in)} deltaLabel="전월 대비" />,
    <Kpi key="out" en="OUTFLOW" label="이번 달 나간 돈" money={tm.out} delta={pctChange(tm.out, lm.out)} deltaLabel="전월 대비" invert />,
    <XfNetTile key="net" net={net} foot="들어온 돈 − 나간 돈 · 장부 기준" />,
    cards.length ? <Kpi key="card" en="CARD · THIS MONTH" label="이번 달 카드 사용" money={S.cardMonth} foot={`${cards.length}장 · 결제일에 통장 출금`} /> : null,
    <Kpi key="loan" en="LOAN" label="대출 잔액" money={S.loan} foot={loans.length ? `${loans.length}건 · 마지막 확인 잔액` : "등록된 대출 없음"} />,
  ].filter(Boolean);

  return (
    <ExecPage testId="exec-funds" {...head}>
      {/* 결론 한 줄 */}
      <div className="rounded-[18px] px-4 md:px-6 py-3.5 md:py-4 flex items-start gap-3" style={{ background: "linear-gradient(90deg, rgba(215,188,130,.10), rgba(255,255,255,.02) 70%)", border: `1px solid ${EX.lineHi}` }}>
        <span className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: EX.gold, boxShadow: `0 0 10px ${EX.gold}` }} />
        <p className="text-[14px] md:text-[15px] font-semibold leading-relaxed" style={{ color: EX.sub, wordBreak: "keep-all" }}>{brief}</p>
      </div>

      <ExecGrid cols="minmax(0,1.55fr) minmax(0,1fr)">
        {/* 보유 자금 */}
        <ExecPanel glow>
          <div className="pt-5 md:pt-6">
            <Eyebrow>TOTAL CASH ON HAND</Eyebrow>
            <div className="mt-1.5 text-[14px] font-bold" style={{ color: EX.sub }}>보유 자금</div>
            <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
              <Num value={ca} unit={cu} size={48} color={EX.goldHi} unitColor={EX.gold} />
              <span className="pb-1 text-[12.5px] font-semibold" style={{ ...EX_NUM, color: EX.mute }}>{fmtWon(S.cash)}원</span>
            </div>
            <div className="mt-1.5 text-[12.5px] font-medium" style={{ color: EX.mute }}>통장 · 현금 · 예금 {cashList.length}곳 합계 · 대출과 신용카드 한도는 넣지 않았습니다</div>
            <GoldRule className="mt-5" />
            <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,.06)" }}>
              {comp.map((x) => <span key={x.k} title={`${x.l} ${fmtWon(x.v)}원`} style={{ width: `${(x.v / compTotal) * 100}%`, background: x.c === EX.gold ? GOLD_GRAD : x.c, boxShadow: "inset -1px 0 0 rgba(5,10,22,.6)" }} />)}
            </div>
            <ul className="mt-4 grid gap-x-6 gap-y-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))" }}>
              {comp.map((x) => { const [a, u] = moneyParts(x.v); return (
                <li key={x.k} className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: EX.sub }}><span className="w-2 h-2 rounded-[3px]" style={{ background: x.c }} />{x.l}<span style={{ color: EX.faint }}>· {x.n}</span></div>
                  <div className="mt-1 flex items-baseline gap-2"><Num value={a} unit={u} size={19} weight={800} /><span className="text-[12px] font-bold" style={{ ...EX_NUM, color: EX.mute }}>{(() => { const p = (x.v / compTotal) * 100; return p > 0 && p < 1 ? "1% 미만" : `${p.toFixed(0)}%`; })()}</span></div>
                </li>
              ); })}
            </ul>
          </div>
        </ExecPanel>
        {/* 운영 가능 기간 */}
        <ExecPanel en="RUNWAY" title="운영 가능 기간" right={<XChip tone={rChip[0]}>{rChip[1]}</XChip>}>
          <div className="mt-2 flex items-center gap-5 md:gap-6">
            <Ring value={runway == null ? 0 : Math.min(100, (runway / 12) * 100)} size={136} stroke={9} color={rTone} label={runway == null ? "—" : runway >= 100 ? "99+" : runway.toFixed(1)} sub="개월" />
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold leading-relaxed" style={{ color: EX.sub, wordBreak: "keep-all" }}>{runway == null ? "지출 기록이 쌓이면 계산됩니다." : <>새 수입이 없어도 지금 자금으로 약 <b style={{ color: EX.text }}>{runway.toFixed(1)}개월</b>을 버틸 수 있습니다.</>}</div>
              <div className="mt-3 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${EX.line}` }}>
                <div className="flex items-baseline justify-between gap-2 text-[12.5px] font-bold"><span style={{ color: EX.mute }}>월평균 지출</span><span style={{ ...EX_NUM, color: EX.text }}>{fmtMan(S.avgOut)}<span className="ml-0.5 text-[11px]" style={{ color: EX.mute }}>만원</span></span></div>
                <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[12.5px] font-bold"><span style={{ color: EX.mute }}>보유 자금</span><span style={{ ...EX_NUM, color: EX.text }}>{fmtMan(S.cash)}<span className="ml-0.5 text-[11px]" style={{ color: EX.mute }}>만원</span></span></div>
              </div>
            </div>
          </div>
          <div className="mt-4 text-[11.5px] font-medium leading-relaxed" style={{ color: EX.faint, wordBreak: "keep-all" }}>보유 자금 ÷ 최근 3개월 월평균 지출 · 원이 가득 차면 12개월 이상 · 3개월 미만은 주의</div>
        </ExecPanel>
      </ExecGrid>

      <ExecKpis min={190}>{kpis}</ExecKpis>

      <ExecGrid cols="minmax(0,1.35fr) minmax(0,1fr)">
        <ExecPanel en="CASH FLOW · 6 MONTHS" title="월별 들어온 돈 · 나간 돈" sub="수입 · 지출 장부 기준 · 단위 만원" right={<span className="hidden md:block"><Legend items={[["들어온 돈", EX.gold], ["나간 돈", EX.ice], ["순현금흐름", EX.text, "line"]]} /></span>}>
          {hasFlow ? <><XfFlowChart six={six} /><XfFlowSum six={six} /></> : <Empty text="최근 6개월 장부 입출금 기록이 없습니다" sub="경리 담당자가 수입 · 지출 장부에 적으면 그래프가 그려집니다" />}
          <div className="md:hidden mt-2"><Legend items={[["들어온 돈", EX.gold], ["나간 돈", EX.ice], ["순현금흐름", EX.text, "line"]]} /></div>
        </ExecPanel>
        <ExecPanel en="ACCOUNTS" title="계좌 · 카드 · 대출" sub="잔액 큰 순 · 원 단위">
          <XfGroupHead label="보유 자금" total={S.cash} />
          <ul>
            {cashList.map((f) => <XfRow key={f.id} f={f} share={S.cash > 0 ? Math.max(0, (f.balance / S.cash) * 100) : null} sub={[f.kind === "정기예금·적금" ? "정기예금 · 적금" : f.kind, f.bank, last4(f), f.base?.date ? `기준 ${xfDot(f.base.date)}` : ""].filter(Boolean).join(" · ")}
              right={<><XfAmt v={f.balance} /><div className="mt-0.5 text-[11px] font-bold" style={{ ...EX_NUM, color: EX.faint }}>{S.cash > 0 ? `${Math.max(0, (f.balance / S.cash) * 100).toFixed(1)}%` : ""}</div></>} />)}
          </ul>
          {cards.length > 0 && <>
            <XfGroupHead label="카드 · 이번 달 사용" total={S.cardMonth} />
            <ul>
              {cards.map((f) => { const credit = isCredit(f); const use = credit && f.limit > 0 ? Math.min(100, ((f.usedMonth || 0) / f.limit) * 100) : null; return (
                <XfRow key={f.id} f={f} share={null} sub={[f.kind, f.bank, last4(f), credit ? (f.limit > 0 ? `한도 ${fmtMan(f.limit)}만원 중 ${use.toFixed(0)}% 사용` : "신용") : f.linkName ? `${f.linkName}에서 출금` : "체크"].filter(Boolean).join(" · ")}
                  right={<XfAmt v={f.usedMonth || 0} cap="이번 달 사용" />} />
              ); })}
            </ul>
          </>}
          {loans.length > 0 && <>
            <XfGroupHead label="대출 잔액" total={S.loan} neg />
            <ul>{loans.map((f) => <XfRow key={f.id} f={f} share={null} sub={[f.bank, last4(f), f.base?.date ? `확인 ${xfDot(f.base.date)}` : ""].filter(Boolean).join(" · ")} right={<XfAmt v={f.balance} neg color={EX.up} />} />)}</ul>
          </>}
        </ExecPanel>
      </ExecGrid>

      <div className="px-1 text-[11.5px] font-medium leading-relaxed" style={{ color: EX.faint, wordBreak: "keep-all" }}>
        잔액 = 기준일(또는 마지막 잔액 맞추기) 잔액 + 그 뒤 장부에서 이 계좌로 지정한 입출금 · 체크카드는 연결 통장에서, 신용카드는 이번 달 한도에서 빠집니다 · 은행 잔액과 다르면 경리 담당자가 자금관리에서 맞춥니다
      </div>
    </ExecPage>
  );
}

// ── 경리 상단 메뉴 › 자금관리: 자금 현황 · 수입·지출 장부 ──
export function FundsWorkspace({ company, isViewer = false }) {
  const [tab, setTab] = React.useState(() => { try { const v = sessionStorage.getItem("kpFundsTab"); sessionStorage.removeItem("kpFundsTab"); return v || "funds"; } catch { return "funds"; } });
  return (
    <KpSubNav code="FINANCE" title="자금관리" icon="wallet" active={tab} onSelect={setTab} actions={[{ key: "manual", label: "자금 매뉴얼", icon: "doc", onClick: () => window.dispatchEvent(new CustomEvent("kp-open-manual", { detail: { menu: "자금관리", section: tab } })) }]}
      items={[{ key: "funds", label: "자금 현황", en: "TREASURY", icon: "wallet" }, { key: "book", label: "수입·지출 장부", en: "CASH BOOK", icon: "sheet" }]}>
      {tab === "funds" ? <FundsBoard company={company} canEdit={!isViewer} /> : <CashBook company={company} isViewer={isViewer} />}
    </KpSubNav>
  );
}
