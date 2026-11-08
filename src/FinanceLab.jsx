// ======================= src/FinanceLab.jsx =======================
// 🧪 2026-11-08 경리 시범 기능(테스트운송사만) — 다른 운송사는 실무 중이라 메뉴가 보이지 않는다(finLabOn)
//  · 전표·재무제표(회계관리 › 전표·재무제표): 자동 전표(전자결재 승인·지급완료 · 배차 매출·원가 · 장부 · 기초 잔액) + 일반전표 입력
//    → 시산표 · 손익계산서 · 재무상태표 · 계정별 원장 · 더존/위하고 업로드용 CSV
//  · 자금 예측(자금관리 › 자금 예측): 고정비·급여·평소 흐름·지급 대기 결재·예정 항목·미수금으로 12개월 잔고 → 운영 가능 개월수
//  계산은 src/journalCore.js · src/cashForecast.js(단위 테스트 있음). 데이터 보호는 firestore.rules(acctJournal · acctPlanned — 경리 담당만 쓰기)
import React from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { db, auth } from "./firebase";
import { BookHero, BookCard, Chip, Sheet, MONO } from "./OfficeBooks";
import { useCompanyRows } from "./companyColStore";
import CustomDatePicker from "./CustomDatePicker";
import { CustomSelect } from "./CustomSelect";
import { kpConfirm } from "./kpDialog";
import { useMyProfile } from "./userNames";
import { CHART, KIND_LABEL, canEditAccounts, useAccountList } from "./acctAccounts";
import { buildJournal, trialBalance, incomeStatement, balanceSheet, accountLedger, journalCsv, sumSide } from "./journalCore";
import { cashForecast } from "./cashForecast";
import { computeFunds } from "./fundsCalc";
import { loadAcctPayments } from "./acctPayments";
import { receivablesOf } from "./arAging";

export { FIN_LAB_COMPANY, finLabOn } from "./finLab";

const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const short = (n) => { const a = Math.abs(n || 0); if (a >= 1e8) return `${(n / 1e8).toFixed(1)}억`; if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`; return Math.round(n || 0).toLocaleString(); };
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
const num = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };
const Lbl = ({ children }) => <div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5 whitespace-nowrap">{children}</div>;
const Pilot = () => <span className="ml-2 px-2 py-0.5 rounded-md bg-[#FFF4D6] text-[#7A5A00] text-[11px] font-black align-middle">시범 · 테스트운송사</span>;

// 비용·지출 결의(경리 조회 — 보안 규칙 isAcctApprovalReader와 같은 조건으로 company + cat)
function useExpenseApprovals(company) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "approvals"), where("company", "==", company), where("cat", "==", "expense")),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
  }, [company]);
  return rows;
}
function useCanEdit(isViewer) {
  const me = useMyProfile(auth.currentUser?.uid);
  return !isViewer && canEditAccounts(me);
}
function downloadText(text, name) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ═══════════════════════════ 전표 · 재무제표 ═══════════════════════════
const SRC_TONE = { 전자결재: "bg-[#EEF3FC] text-[#2D4C82]", 지급완료: "bg-[#E8F7EE] text-[#1F7A45]", "배차(매출)": "bg-[#F3E7CC] text-[#6B5320]", "배차(원가)": "bg-[#F3E7CC] text-[#6B5320]", 장부: "bg-[#F4F6FA] text-[#3A4A66]", "장부(자동)": "bg-[#F4F6FA] text-[#3A4A66]", "기초 잔액": "bg-[#EDE9FE] text-[#5B21B6]", 수동: "bg-[#0F1A30] text-white" };

export function JournalSuite({ company, orders = null, isViewer = false }) {
  const canEdit = useCanEdit(isViewer);
  const approvals = useExpenseApprovals(company);
  const ledger = useCompanyRows("acctLedger", company);
  const funds = useCompanyRows("acctFunds", company);
  const manual = useCompanyRows("acctJournal", company);
  const [view, setView] = React.useState("journal");
  const y = new Date(Date.now() + 9 * 3600e3).getUTCFullYear();
  const [from, setFrom] = React.useState(`${y}-01-01`);
  const [to, setTo] = React.useState(kstDay());
  const [srcF, setSrcF] = React.useState("전체");
  const [acct, setAcct] = React.useState("보통예금");
  const [edit, setEdit] = React.useState(null);
  const ready = approvals !== null && ledger !== null && funds !== null && manual !== null && orders !== null;
  const journal = React.useMemo(() => (ready ? buildJournal({ approvals, orders: orders || [], ledger: ledger || [], funds: funds || [], manual: manual || [] }) : []), [ready, approvals, orders, ledger, funds, manual]);
  const inRange = journal.filter((e) => e.date >= from && e.date <= to);
  const shown = srcF === "전체" ? inRange : inRange.filter((e) => e.src === srcF);
  const tb = React.useMemo(() => trialBalance(journal, { from, to }), [journal, from, to]);
  const is = React.useMemo(() => incomeStatement(journal, { from, to }), [journal, from, to]);
  const bs = React.useMemo(() => balanceSheet(journal, { to }), [journal, to]);
  const fundCash = React.useMemo(() => computeFunds(funds || [], ledger || []).cash, [funds, ledger]);
  const bookCash = (bs.assets.find((a) => a.name === "보통예금")?.balance || 0) + (bs.assets.find((a) => a.name === "현금")?.balance || 0);
  const bad = journal.filter((e) => !e.balanced);
  const srcs = ["전체", ...[...new Set(journal.map((e) => e.src))]];

  if (!ready) return <div className="py-24 text-center text-[14px] font-bold text-[#9AA9C3]">전표를 만드는 중…</div>;
  const removeManual = async (e) => {
    if (!(await kpConfirm(`${e.no} 전표를 삭제할까요?`))) return;
    await deleteDoc(doc(db, "acctJournal", e.docId)).catch((er) => window.alert(er.code === "permission-denied" ? "전표는 경리 담당만 지울 수 있어요." : er.message));
  };
  return (
    <div className="space-y-4">
      <BookHero en="ACCOUNTING · BOOKKEEPING" title={<>전표 · 재무제표<Pilot /></>}
        desc="전자결재 승인·지급완료, 배차 매출·기사운임, 수입·지출 장부가 계정과목별 전표로 자동 입력되고 재무제표가 바로 만들어집니다"
        kpis={[["매출(운송수입)", `${short(is.totals.revenue)}원`, `${from} ~ ${to}`], ["영업이익", `${short(is.totals.operating)}원`, `매출총이익 ${short(is.totals.gross)}원`], ["당기순이익", `${short(is.totals.net)}원`, "영업외 손익 포함"], ["자산 / 부채", `${short(bs.totals.assets)} / ${short(bs.totals.liabilities)}`, `${to} 기준`]]}
        right={<div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => downloadText(journalCsv(journal, { from, to }), `전표_${company}_${from}_${to}.csv`)} className="h-10 px-4 rounded-xl bg-white/15 text-white text-[13.5px] font-black">⤓ 전표 CSV(더존·위하고)</button>
          {canEdit && <button type="button" onClick={() => setEdit({ date: kstDay(), kind: "대체", memo: "", lines: [{ side: "D", acct: "", amount: "", vendor: "" }, { side: "C", acct: "", amount: "", vendor: "" }] })} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black">+ 일반전표 입력</button>}
        </div>} />

      <div className="rounded-2xl border border-[#E3E8F0] bg-white px-4 py-3 flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {[["journal", "전표"], ["tb", "시산표"], ["is", "손익계산서"], ["bs", "재무상태표"], ["ledger", "계정별 원장"]].map(([k, l]) => <Chip key={k} on={view === k} onClick={() => setView(k)}>{l}</Chip>)}
        </div>
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          {view !== "bs" && <div className="w-[150px]"><CustomDatePicker value={from} onChange={(e) => setFrom(e.target.value)} className={inp} showIcon /></div>}
          {view !== "bs" && <span className="text-[#9AA9C3] font-black">~</span>}
          <div className="w-[150px]"><CustomDatePicker value={to} onChange={(e) => setTo(e.target.value)} className={inp} showIcon /></div>
          <button type="button" onClick={() => { setFrom(`${y}-01-01`); setTo(kstDay()); }} className="h-11 px-3 rounded-xl border border-[#DCE3EE] text-[13px] font-black text-[#3A4A66]">올해</button>
          <button type="button" onClick={() => { const d = kstDay(); setFrom(`${d.slice(0, 7)}-01`); setTo(d); }} className="h-11 px-3 rounded-xl border border-[#DCE3EE] text-[13px] font-black text-[#3A4A66]">이번 달</button>
        </div>
      </div>
      {bad.length > 0 && <div className="rounded-2xl border border-[#F3C2BD] bg-[#FDF1EF] px-4 py-3 text-[13px] font-bold text-[#B42318]">차변·대변이 맞지 않는 전표 {bad.length}건 — {bad.slice(0, 3).map((e) => e.no).join(", ")}{bad.length > 3 ? " 외" : ""} (일반전표를 고쳐 주세요)</div>}

      {view === "journal" && (
        <BookCard en="JOURNAL" title={`전표 ${shown.length.toLocaleString()}건`} right={<div className="flex gap-1.5 flex-wrap">{srcs.map((s) => <Chip key={s} on={srcF === s} onClick={() => setSrcF(s)}>{s}</Chip>)}</div>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead><tr className="bg-[#F4F6FA] text-[#3A4A66]">{["일자 · 번호", "구분", "적요", "차변 계정", "차변 금액", "대변 계정", "대변 금액", ""].map((h) => <th key={h} className="px-3 py-2.5 text-left font-black whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={8} className="py-14 text-center text-[#9AA9C3] font-bold">이 기간에 전표가 없어요</td></tr>}
                {shown.slice().reverse().slice(0, 400).map((e) => {
                  const D = e.lines.filter((l) => l.side === "D"); const C = e.lines.filter((l) => l.side === "C"); const rows = Math.max(D.length, C.length);
                  return Array.from({ length: rows }, (_, i) => (
                    <tr key={`${e.id}_${i}`} className={i === rows - 1 ? "border-b border-[#EEF1F6]" : ""}>
                      {i === 0 && <td rowSpan={rows} className="px-3 py-2 align-top whitespace-nowrap"><div className="font-black text-[#0F1A30]" style={num}>{e.date}</div><div className="text-[11.5px] text-[#9AA9C3]" style={num}>{e.no}</div></td>}
                      {i === 0 && <td rowSpan={rows} className="px-3 py-2 align-top whitespace-nowrap"><span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${SRC_TONE[e.src] || "bg-[#F4F6FA] text-[#3A4A66]"}`}>{e.src}</span></td>}
                      {i === 0 && <td rowSpan={rows} className="px-3 py-2 align-top min-w-[200px] text-[#1B2B4B] font-semibold">{e.memo}{e.vendor && <span className="text-[#7A879C]"> · {e.vendor}</span>}</td>}
                      <td className="px-3 py-1.5 whitespace-nowrap text-[#0F1A30] font-bold">{D[i] ? <>{D[i].acct}<span className="ml-1 text-[11px] text-[#9AA9C3]" style={num}>{D[i].code}</span></> : ""}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap" style={num}>{D[i] ? won(D[i].amount) : ""}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-[#0F1A30] font-bold">{C[i] ? <>{C[i].acct}<span className="ml-1 text-[11px] text-[#9AA9C3]" style={num}>{C[i].code}</span></> : ""}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap" style={num}>{C[i] ? won(C[i].amount) : ""}</td>
                      {i === 0 && <td rowSpan={rows} className="px-2 py-2 align-top text-right">{e.src === "수동" && canEdit && <button type="button" onClick={() => removeManual(e)} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[12px] font-bold text-[#B42318]">삭제</button>}{!e.balanced && <div className="text-[11px] font-black text-[#B42318]">차대 불일치</div>}</td>}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
          {shown.length > 400 && <div className="px-4 py-3 text-[12.5px] text-[#7A879C] font-bold">최근 400건만 보여요 — 기간을 줄이거나 CSV로 받아 보세요</div>}
          <div className="px-4 py-3 border-t border-[#EEF1F6] text-[12.5px] text-[#5B6B85] leading-relaxed">
            자동 전표는 원본을 고치면 따라 바뀝니다(전자결재 승인·지급완료/취소, 배차 운임, 장부). 감가상각·부가세 정리·결산 대체처럼 원본이 없는 거래는 [+ 일반전표 입력]으로 넣으세요.
            매출은 배차완료 기준(미수금 계산과 같이 부가세 포함), 기사운임은 미지급금으로 잡았다가 지급완료 때 정리됩니다.
          </div>
        </BookCard>
      )}

      {view === "tb" && (
        <BookCard en="TRIAL BALANCE" title={`합계잔액시산표 · ${from} ~ ${to}`}>
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-[13.5px]">
            <thead><tr className="bg-[#F4F6FA] text-[#3A4A66]">{["코드", "계정과목", "분류", "차변 합계", "대변 합계", "잔액"].map((h) => <th key={h} className={`px-3 py-2.5 font-black whitespace-nowrap ${["차변 합계", "대변 합계", "잔액"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {tb.map((a) => (
                <tr key={a.name} className="border-b border-[#EEF1F6] hover:bg-[#F5F8FD] cursor-pointer" onClick={() => { setAcct(a.name); setView("ledger"); }}>
                  <td className="px-3 py-2" style={num}>{a.code}</td><td className="px-3 py-2 font-black text-[#0F1A30]">{a.name}</td><td className="px-3 py-2 text-[#7A879C]">{KIND_LABEL[a.kind]}</td>
                  <td className="px-3 py-2 text-right" style={num}>{won(a.debit)}</td><td className="px-3 py-2 text-right" style={num}>{won(a.credit)}</td><td className={`px-3 py-2 text-right font-black ${a.balance < 0 ? "text-[#B42318]" : "text-[#0F1A30]"}`} style={num}>{won(a.balance)}</td>
                </tr>
              ))}
              <tr className="bg-[#0F1A30] text-white font-black"><td className="px-3 py-2.5" colSpan={3}>합계</td><td className="px-3 py-2.5 text-right" style={num}>{won(tb.reduce((s, a) => s + a.debit, 0))}</td><td className="px-3 py-2.5 text-right" style={num}>{won(tb.reduce((s, a) => s + a.credit, 0))}</td><td className="px-3 py-2.5 text-right text-[12px]">{tb.reduce((s, a) => s + a.debit - a.credit, 0) === 0 ? "차대 일치 ✓" : "차대 불일치"}</td></tr>
            </tbody>
          </table></div>
          <div className="px-4 py-3 text-[12.5px] text-[#7A879C] font-bold">줄을 누르면 그 계정의 원장(거래 내역·누적 잔액)이 열립니다</div>
        </BookCard>
      )}

      {view === "is" && (
        <BookCard en="INCOME STATEMENT" title={`손익계산서 · ${from} ~ ${to}`}>
          <div className="px-4 pb-4 max-w-[760px]">
            {[["Ⅰ. 매출액", is.revenue, is.totals.revenue], ["Ⅱ. 매출원가", is.cogs, is.totals.cogs]].map(([t, list, v]) => <StmtBlock key={t} title={t} list={list} total={v} />)}
            <StmtTotal label="Ⅲ. 매출총이익" value={is.totals.gross} />
            <StmtBlock title="Ⅳ. 판매비와관리비" list={is.sga} total={is.totals.sga} />
            <StmtTotal label="Ⅴ. 영업이익" value={is.totals.operating} />
            <StmtBlock title="Ⅵ. 영업외수익" list={is.otherIn} total={is.totals.otherIn} />
            <StmtBlock title="Ⅶ. 영업외비용" list={is.otherOut} total={is.totals.otherOut} />
            <StmtTotal label="Ⅷ. 당기순이익(법인세 차감 전)" value={is.totals.net} strong />
          </div>
        </BookCard>
      )}

      {view === "bs" && (
        <BookCard en="BALANCE SHEET" title={`재무상태표 · ${to} 기준`}>
          <div className="px-4 pb-4 grid md:grid-cols-2 gap-4">
            <div><StmtBlock title="자산" list={bs.assets} total={bs.totals.assets} /></div>
            <div>
              <StmtBlock title="부채" list={bs.liabilities} total={bs.totals.liabilities} />
              <StmtBlock title="자본" list={[...bs.equity, { name: "당기순이익(누적, 결산 전)", balance: bs.net, code: "" }]} total={bs.totals.equity} />
              <StmtTotal label="부채와 자본 합계" value={bs.totals.liabilities + bs.totals.equity} strong />
            </div>
          </div>
          <div className="px-4 py-3 border-t border-[#EEF1F6] text-[12.5px] leading-relaxed">
            <div className={bs.totals.check === 0 ? "text-[#1F7A45] font-black" : "text-[#B42318] font-black"}>{bs.totals.check === 0 ? "자산 = 부채 + 자본 ✓" : `자산과 부채+자본이 ${won(bs.totals.check)}원 차이 — 차대 불일치 전표를 확인하세요`}</div>
            <div className="text-[#5B6B85] mt-1">장부상 현금·예금 {won(bookCash)}원 · 자금 현황 보유 자금 {won(fundCash)}원{bookCash !== fundCash ? ` — ${won(bookCash - fundCash)}원 차이(잔액 맞추기·통장 미지정 장부 줄·카드 결제분 등)` : " — 일치"}</div>
            <div className="text-[#7A879C] mt-1">기초 잔액은 자금 현황의 통장·현금·대출 처음 잔액으로 잡습니다(차액은 자본금). 그 날짜 이전의 결재·장부는 이중으로 잡히지 않게 뺍니다.</div>
          </div>
        </BookCard>
      )}

      {view === "ledger" && (
        <BookCard en="GENERAL LEDGER" title="계정별 원장" right={<div className="w-[220px]"><CustomSelect value={acct} onChange={(e) => setAcct(e.target.value)} className={inp}>{[...new Set([...CHART.map((a) => a.name), ...tb.map((a) => a.name)])].map((n) => <option key={n} value={n}>{n}</option>)}</CustomSelect></div>}>
          <LedgerTable rows={accountLedger(journal, acct, { from, to })} />
        </BookCard>
      )}

      {edit && <ManualEntrySheet company={company} edit={edit} setEdit={setEdit} />}
    </div>
  );
}

function StmtBlock({ title, list = [], total }) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between py-2 border-b-2 border-[#0F1A30]"><span className="text-[14px] font-black text-[#0F1A30]">{title}</span><span className="text-[14px] font-black" style={num}>{won(total)}</span></div>
      {list.length === 0 && <div className="py-2 text-[12.5px] text-[#9AA9C3] font-bold">없음</div>}
      {list.map((a) => <div key={a.name} className="flex items-center justify-between py-1.5 border-b border-[#EEF1F6] text-[13.5px]"><span className="text-[#3A4A66] pl-3">{a.name}</span><span className={a.balance < 0 ? "text-[#B42318]" : ""} style={num}>{won(a.balance)}</span></div>)}
    </div>
  );
}
function StmtTotal({ label, value, strong = false }) {
  return <div className={`mt-3 flex items-center justify-between px-3 py-2.5 rounded-xl ${strong ? "bg-[#0F1A30] text-white" : "bg-[#EEF3FC] text-[#0F1A30]"}`}><span className="text-[14px] font-black">{label}</span><span className={`text-[15px] font-black ${!strong && value < 0 ? "text-[#B42318]" : ""}`} style={num}>{won(value)}</span></div>;
}
function LedgerTable({ rows }) {
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-[13px]">
      <thead><tr className="bg-[#F4F6FA] text-[#3A4A66]">{["일자", "전표번호", "적요", "거래처", "차변", "대변", "잔액"].map((h) => <th key={h} className={`px-3 py-2.5 font-black whitespace-nowrap ${["차변", "대변", "잔액"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-[#9AA9C3] font-bold">이 기간에 이 계정 거래가 없어요</td></tr>}
        {rows.map((r, i) => <tr key={`${r.no}_${i}`} className="border-b border-[#EEF1F6]"><td className="px-3 py-2" style={num}>{r.date}</td><td className="px-3 py-2 text-[#7A879C]" style={num}>{r.no}</td><td className="px-3 py-2 min-w-[200px]">{r.memo}</td><td className="px-3 py-2 text-[#5B6B85]">{r.vendor}</td><td className="px-3 py-2 text-right" style={num}>{r.debit ? won(r.debit) : ""}</td><td className="px-3 py-2 text-right" style={num}>{r.credit ? won(r.credit) : ""}</td><td className={`px-3 py-2 text-right font-black ${r.balance < 0 ? "text-[#B42318]" : ""}`} style={num}>{won(r.balance)}</td></tr>)}
      </tbody>
    </table></div>
  );
}

// 일반전표 입력(경리 담당만 — 서버 규칙 acctJournal도 같은 기준)
function ManualEntrySheet({ company, edit, setEdit }) {
  const coAccounts = useAccountList(company);
  const names = [...new Set([...CHART.map((a) => a.name), ...coAccounts])];
  const [busy, setBusy] = React.useState(false);
  const set = (p) => setEdit((e) => ({ ...e, ...p }));
  const setLine = (i, p) => setEdit((e) => ({ ...e, lines: e.lines.map((l, k) => (k === i ? { ...l, ...p } : l)) }));
  const lines = edit.lines.map((l) => ({ ...l, amount: toInt(l.amount) }));
  const D = sumSide(lines, "D"); const C = sumSide(lines, "C");
  const ok = D > 0 && D === C && lines.every((l) => !l.amount || l.acct);
  const save = async () => {
    if (!ok) return window.alert("차변 합계와 대변 합계가 같아야 하고, 금액이 있는 줄은 계정과목을 골라야 해요.");
    setBusy(true);
    try {
      await addDoc(collection(db, "acctJournal"), { companyName: company, date: edit.date, kind: edit.kind, memo: String(edit.memo || "").trim(), lines: lines.filter((l) => l.amount > 0).map((l) => ({ side: l.side, acct: l.acct, amount: l.amount, vendor: String(l.vendor || "").trim() })), createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "" });
      setEdit(null);
    } catch (e) { window.alert(e.code === "permission-denied" ? "전표는 경리 담당만 입력할 수 있어요." : e.message); } finally { setBusy(false); }
  };
  return (
    <Sheet side en="JOURNAL · NEW" title="일반전표 입력" onClose={() => setEdit(null)}
      footer={<><button type="button" onClick={() => setEdit(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">취소</button><button type="button" disabled={busy || !ok} onClick={save} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-40">{busy ? "저장 중…" : ok ? "저장" : "차변 = 대변이 되도록 입력"}</button></>}>
      <div className="grid grid-cols-2 gap-2">
        <div><Lbl>전표 일자</Lbl><CustomDatePicker value={edit.date} onChange={(e) => set({ date: e.target.value })} className={inp} showIcon /></div>
        <div><Lbl>구분</Lbl><CustomSelect value={edit.kind} onChange={(e) => set({ kind: e.target.value })} className={inp}>{["대체", "입금", "출금"].map((k) => <option key={k} value={k}>{k}</option>)}</CustomSelect></div>
        <div className="col-span-2"><Lbl>적요</Lbl><input value={edit.memo} onChange={(e) => set({ memo: e.target.value })} className={inp} placeholder="예: 11월 차량 감가상각 · 2기 부가세 정리" /></div>
      </div>
      <div className="space-y-2">
        {edit.lines.map((l, i) => (
          <div key={i} className="rounded-xl bg-white border border-[#E3E8F0] p-2.5 grid grid-cols-[80px_1fr_120px_32px] gap-1.5 items-center">
            <CustomSelect value={l.side} onChange={(e) => setLine(i, { side: e.target.value })} className={inp}><option value="D">차변</option><option value="C">대변</option></CustomSelect>
            <CustomSelect value={l.acct} onChange={(e) => setLine(i, { acct: e.target.value })} className={inp}><option value="">계정과목</option>{names.map((n) => <option key={n} value={n}>{n}</option>)}</CustomSelect>
            <input inputMode="numeric" value={l.amount ? won(toInt(l.amount)) : ""} onChange={(e) => setLine(i, { amount: e.target.value.replace(/[^\d]/g, "") })} className={`${inp} text-right`} style={num} placeholder="금액" />
            <button type="button" onClick={() => set({ lines: edit.lines.filter((_, k) => k !== i) })} disabled={edit.lines.length <= 2} className="w-8 h-8 rounded-lg text-[#9AA9C3] disabled:opacity-30">✕</button>
            <input value={l.vendor || ""} onChange={(e) => setLine(i, { vendor: e.target.value })} className={`${inp} col-span-4 !h-9 text-[13px]`} placeholder="거래처(선택)" />
          </div>
        ))}
        <button type="button" onClick={() => set({ lines: [...edit.lines, { side: D > C ? "C" : "D", acct: "", amount: D !== C ? String(Math.abs(D - C)) : "", vendor: "" }] })} className="h-10 px-4 rounded-xl border border-dashed border-[#9AA9C3] text-[13px] font-black text-[#2D4C82]">+ 줄 추가</button>
      </div>
      <div className={`rounded-xl px-4 py-3 text-[14px] font-black flex justify-between ${D === C && D > 0 ? "bg-[#E8F7EE] text-[#1F7A45]" : "bg-[#FDF1EF] text-[#B42318]"}`}>
        <span>차변 {won(D)} · 대변 {won(C)}</span><span>{D === C && D > 0 ? "일치 ✓" : `차이 ${won(D - C)}`}</span>
      </div>
    </Sheet>
  );
}

// ═══════════════════════════ 자금 예측 · 운영 가능 개월수 ═══════════════════════════
export function CashForecastPanel({ company, orders = null, isViewer = false }) {
  const canEdit = useCanEdit(isViewer);
  const ledger = useCompanyRows("acctLedger", company);
  const funds = useCompanyRows("acctFunds", company);
  const recurring = useCompanyRows("acctRecurring", company);
  const planned = useCompanyRows("acctPlanned", company);
  const approvals = useExpenseApprovals(company);
  const today = kstDay();
  const [pay, setPay] = React.useState({ ar: {} });
  React.useEffect(() => { if (company) loadAcctPayments(db, Number(today.slice(0, 4)), company).then(setPay).catch(() => {}); }, [company, today]);
  const receivable = React.useMemo(() => (orders ? receivablesOf({ orders, paid: pay.ar || {}, today }).reduce((s, x) => s + x.outstanding, 0) : 0), [orders, pay, today]);
  const unpaid = React.useMemo(() => (approvals || []).filter((d) => d.status === "approved" && !d.paid?.at && d.form !== "card" && toInt(d.amount) > 0), [approvals]);
  const F = React.useMemo(() => computeFunds(funds || [], ledger || []), [funds, ledger]);
  const fc = React.useMemo(() => cashForecast({ cash: F.cash, ledger: ledger || [], recurring: recurring || [], unpaidApprovals: unpaid, planned: planned || [], receivable, today }), [F.cash, ledger, recurring, unpaid, planned, receivable, today]);
  const [add, setAdd] = React.useState(null);
  if (ledger === null || funds === null || recurring === null || planned === null) return <div className="py-24 text-center text-[14px] font-bold text-[#9AA9C3]">자금 예측 계산 중…</div>;
  const left = (s) => (s.monthsLeft == null ? "12개월+" : `${s.monthsLeft}개월`);
  const chart = fc.base.rows.map((r, i) => ({ m: r.m.slice(2).replace("-", "."), 기본: r.balance, 보수적: fc.conservative.rows[i].balance, 순흐름: r.net }));
  const savePlanned = async () => {
    if (!add.name.trim() || !toInt(add.amount) || !add.date) return window.alert("날짜·이름·금액을 입력해 주세요.");
    try { await addDoc(collection(db, "acctPlanned"), { companyName: company, date: add.date, type: add.type, name: add.name.trim(), amount: toInt(add.amount), createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "" }); setAdd(null); }
    catch (e) { window.alert(e.code === "permission-denied" ? "예정 항목은 경리 담당만 넣을 수 있어요." : e.message); }
  };
  return (
    <div className="space-y-4">
      <BookHero en="TREASURY · FORECAST" title={<>자금 예측 · 운영 가능 개월수<Pilot /></>}
        desc="지금 잔고에서 매달 들어올 돈과 나갈 돈(고정비·급여·평소 흐름·지급 대기 결재·예정 항목)을 12개월 굴려 잔고가 바닥나는 시점을 봅니다"
        kpis={[["보유 자금", `${short(fc.cash)}원`, "자금 현황 통장·현금 합계"], ["운영 가능(지금 흐름)", left(fc.base), fc.base.runOutMonth ? `${fc.base.runOutMonth} 잔고 부족 예상` : "12개월 안 부족 없음"], ["운영 가능(매출 끊기면)", left(fc.conservative), fc.conservative.runOutMonth ? `${fc.conservative.runOutMonth} 잔고 부족` : "12개월 안 부족 없음"], ["월 고정 지출", `${short(fc.fixedOut)}원`, `고정비 ${short(fc.fixedOutRecur)} + 급여 ${short(fc.payroll)}`]]} />

      <div className="grid md:grid-cols-3 gap-3">
        {[["매달 들어오는 돈(평소)", fc.runRate.varIn + fc.fixedIn, `거래처 수금 등 ${short(fc.runRate.varIn)} + 정기 수입 ${short(fc.fixedIn)}`],
          ["매달 나가는 돈(평소)", fc.runRate.varOut + fc.fixedOut, `변동 ${short(fc.runRate.varOut)}(기사운임 ${short(fc.runRate.drvOut)}) + 고정 ${short(fc.fixedOut)}`],
          ["확정·대기 중인 돈", fc.receivable - fc.pending, `받을 미수금 ${short(fc.receivable)} · 지급 대기 결재 ${unpaid.length}건 ${short(fc.pending)}`]].map(([l, v, sub]) => (
          <div key={l} className="rounded-2xl bg-white border border-[#E3E8F0] px-4 py-3"><div className="text-[12.5px] font-black text-[#5B6B85]">{l}</div><div className="text-[22px] font-black text-[#0F1A30]" style={num}>{won(v)}원</div><div className="text-[12px] text-[#7A879C]">{sub}</div></div>
        ))}
      </div>

      <BookCard en="12 MONTHS" title="월말 잔고 예측" right={<span className="text-[12px] font-bold text-[#7A879C]">평균 기준 {fc.runRate.months.length ? fc.runRate.months.join(" · ") : "장부 없음"}</span>}>
        <div className="h-[260px] px-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#EEF1F6" vertical={false} />
              <XAxis dataKey="m" tick={{ fontSize: 11, fill: "#7A879C" }} />
              <YAxis tickFormatter={short} tick={{ fontSize: 11, fill: "#7A879C" }} width={56} />
              <Tooltip formatter={(v) => `${won(v)}원`} />
              <ReferenceLine y={0} stroke="#B42318" strokeDasharray="4 4" />
              <Bar dataKey="순흐름" fill="#C9D6EE" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="기본" stroke="#0F1A30" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="보수적" stroke="#B42318" strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto border-t border-[#EEF1F6]"><table className="w-full min-w-[720px] text-[13px]">
          <thead><tr className="bg-[#F4F6FA] text-[#3A4A66]">{["월", "들어올 돈", "나갈 돈", "순흐름", "월말 잔고(지금 흐름)", "월말 잔고(매출 끊기면)"].map((h) => <th key={h} className={`px-3 py-2.5 font-black whitespace-nowrap ${h === "월" ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
          <tbody>{fc.base.rows.map((r, i) => { const c = fc.conservative.rows[i]; return (
            <tr key={r.m} className="border-b border-[#EEF1F6]"><td className="px-3 py-2 font-black" style={num}>{r.m}{i === 0 && <span className="ml-1 text-[11px] text-[#9AA9C3]">(남은 기간)</span>}</td><td className="px-3 py-2 text-right" style={num}>{won(r.inflow)}</td><td className="px-3 py-2 text-right" style={num}>{won(r.outflow)}</td><td className={`px-3 py-2 text-right ${r.net < 0 ? "text-[#B42318]" : "text-[#1F7A45]"}`} style={num}>{r.net >= 0 ? "+" : ""}{won(r.net)}</td><td className={`px-3 py-2 text-right font-black ${r.balance < 0 ? "text-[#B42318]" : ""}`} style={num}>{won(r.balance)}</td><td className={`px-3 py-2 text-right ${c.balance < 0 ? "text-[#B42318] font-black" : "text-[#5B6B85]"}`} style={num}>{won(c.balance)}</td></tr>
          ); })}</tbody>
        </table></div>
        <div className="px-4 py-3 text-[12.5px] text-[#5B6B85] leading-relaxed">
          · 지금 흐름: 최근 3개월 장부 평균(수금·변동 지출) + 고정비·급여·정기 수입 + 지급 대기 결재(이번 달) + 아래 예정 항목.<br />
          · 매출 끊기면: 새 매출·기사운임이 없다고 보고, 받을 미수금만 다음 두 달에 나눠 들어온다고 봅니다(가장 보수적인 운영 기간).<br />
          · 예전 계산(보유 자금 ÷ 월 고정·변동 지출): {fc.simpleRunway == null ? "—" : `${fc.simpleRunway}개월`}
        </div>
      </BookCard>

      <BookCard en="PLANNED" title="예정된 입출금" right={canEdit && <button type="button" onClick={() => setAdd({ date: kstDay(), type: "지출", name: "", amount: "" })} className="h-9 px-3.5 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black">+ 예정 항목</button>}>
        <div className="px-4 pb-4 space-y-1.5">
          {!(planned || []).length && <div className="py-3 text-[13px] text-[#9AA9C3] font-bold">차량 구입·대출 상환·부가세 납부·보험 갱신처럼 한 번 크게 들고 나는 돈을 넣으면 예측에 반영돼요</div>}
          {[...(planned || [])].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-xl border border-[#EEF1F6] px-3 py-2">
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${p.type === "수입" ? "bg-[#E8F7EE] text-[#1F7A45]" : "bg-[#FDF1EF] text-[#B42318]"}`}>{p.type}</span>
              <span className="text-[13px] text-[#7A879C]" style={num}>{p.date}</span>
              <span className="text-[14px] font-black text-[#0F1A30] flex-1 min-w-0 truncate">{p.name}</span>
              <span className="text-[14px] font-black" style={num}>{won(p.amount)}원</span>
              {canEdit && <button type="button" onClick={async () => (await kpConfirm("삭제할까요?")) && deleteDoc(doc(db, "acctPlanned", p.id)).catch(() => {})} className="w-8 h-8 rounded-lg text-[#9AA9C3]">✕</button>}
            </div>
          ))}
        </div>
      </BookCard>

      {add && (
        <Sheet side en="FORECAST · PLANNED" title="예정 항목 추가" onClose={() => setAdd(null)} footer={<><button type="button" onClick={() => setAdd(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">취소</button><button type="button" onClick={savePlanned} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black">저장</button></>}>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white border border-[#E3E8F0]">{["지출", "수입"].map((t) => <button key={t} type="button" onClick={() => setAdd((p) => ({ ...p, type: t }))} className={`h-10 rounded-lg text-[14px] font-black ${add.type === t ? "bg-[#0F1A30] text-white" : "text-[#5B6B85]"}`}>{t} 예정</button>)}</div>
          <div className="grid grid-cols-2 gap-2">
            <div><Lbl>날짜</Lbl><CustomDatePicker value={add.date} onChange={(e) => setAdd((p) => ({ ...p, date: e.target.value }))} className={inp} showIcon /></div>
            <div><Lbl>금액(원)</Lbl><input inputMode="numeric" value={add.amount ? won(toInt(add.amount)) : ""} onChange={(e) => setAdd((p) => ({ ...p, amount: e.target.value.replace(/[^\d]/g, "") }))} className={`${inp} text-right`} style={num} /></div>
            <div className="col-span-2"><Lbl>내용</Lbl><input value={add.name} onChange={(e) => setAdd((p) => ({ ...p, name: e.target.value }))} className={inp} placeholder={add.type === "지출" ? "예: 2기 확정 부가세 납부 · 화물차 구입 계약금" : "예: 정책자금 대출 실행 · 보험 환급"} /></div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
