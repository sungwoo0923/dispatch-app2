// ======================= src/Payroll.jsx =======================
// ⭐ 2026-11-06 직원 급여 계산 · 급여명세서(사무직 직원 — 기사 운임 집계와 별개). PC·모바일 공용(반응형).
//  · 월 급여 계산: 달 고르기 → 직원 목록 → 출근기록부 시간(연장·야간·휴일) 자동 + 직접 수정 → 지급·공제·실지급 계산 →
//    [확정(잠금)] → [명세서 발행](직원 알림) → [지급 처리](수입·지출 장부 "급여·상여" 자동 기록)
//  · 직원 급여 설정: 월급/시급/일급 · 고용형태 · 식대·자가운전보조금(비과세) · 직책·기타수당 · 부양가족·자녀 · 4대보험 적용 · 고정 세액 · 지급 계좌
//  · 요율 설정: 연도별 4대보험·비과세 한도·가산율·최저시급(처음 값은 법정 요율 — payrollCalc.js PAYROLL_PRESETS) · 회사 수당·공제 항목
//  · 급여명세서: 2021.11.19 시행 근로기준법 48조 2항 · 시행령 27조의2 기재사항(성명·생년월일·지급일·임금총액·구성항목별 금액·
//    계산방법·근로일수·연장/야간/휴일 근로시간·공제 항목별 금액과 총액) — 인쇄/PDF 저장 가능
//  · 권한: payrollAccess.js(화면) · firestore.rules payrollEditor()/payrollViewer()(데이터). 직원 본인은 "발행된" 본인 명세서만
//  데이터: payrollSettings/{회사} · payrollEmployees/{회사}__{uid} · payrollRuns/{회사}_{YYYY-MM} · payslips/{회사}_{YYYY-MM}_{uid} · hrNotices(알림)
// ⭐ 2026-11-06 급여 계산 화면 개편 — 게시판 목록 → 좌우 반반 작업 화면(왼쪽: 직원 목록 + 입력 / 오른쪽: 급여명세서 실시간 미리보기)
//  · 고를 수 있는 칸은 전부 드롭다운(달·부서·직책·재직상태·급여형태·고용형태·수당/공제 종류·부양가족·세액 비율·4대보험·은행·지급 계좌)
//  · 노란색 표시 전부 제거 → 프로그램 네이비 팔레트(#0B1428/#0F1A30/#1B2B4B/#2D4C82, 강조 #8FB0F0), 빨강은 오류만
//  · 직원별 최근 12개월 · 올해 누계 · 차인지급액 내역 · 회사 부담 · 점검 메시지 · 일괄(전체 계산·선택 확정·선택 발행) · Enter = 다음 칸
// ⭐ 2026-11-07 개편 — 경리 전용 + 급여 비밀번호(PayrollGate) · 화면 꽉 채움(넓은 화면은 직원 목록 | 입력 | 명세서 3칸) · 연봉제 ·
//  직원 급여 설정 2칸(왼쪽 목록·필터 / 오른쪽 상세 + 근로계약서) · 요율 카드 단순화 · 새 급여명세서(payslipDoc.js) · 신고·이체 탭(PayrollReports.jsx) ·
//  발행하면 앱 알림(hrNotices 팝업) + 사내메일(푸시) · 전월 대비 변동 표시 · 직원은 내정보 › 급여명세서(MyPayslipsSection)
import React from "react";
import { arrayUnion, collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { db, auth, DEFAULT_COMPANY } from "./firebase";
import { BookHero, BookCard } from "./OfficeBooks";
import { isTMUser } from "./staffFilter";
import { personName } from "./userNames";
import { calcPayslipFull, hoursFromAttendance, ratesFor, presetFor, RATE_FIELDS, wonFmt, FREELANCE, annualBreakdown } from "./payrollCalc";
import { isWeekend, isHoliday } from "./attendanceUtils";
import { upsertAutoEntry } from "./ledgerAuto";
import { usePayrollAccess } from "./payrollAccess";
import { BANK_NAMES, formatAccount, onlyDigits, parseBankText } from "./bankUtil";
import { useHrOptions, EMPLOYMENT_STATUS_OPTIONS } from "./hrConstants";
import { sendInternalMail } from "./InternalMail";
import CustomDatePicker from "./CustomDatePicker";
import PayrollGate, { GateTimer, prefetchPayrollStatus, warmPayrollVerify } from "./PayrollGate";
import { payslipHtml, PAYSLIP_CSS, printPayslips, TAX_NOTE } from "./payslipDoc";
import { kstDay, kstYm, shiftYm, lastDayOf, safeId, slipId, runId, empId, toNum, ymLabel, blank, uniq, inp, numInp, NUMS, sec, Label, Note, H, Sel, Money, Seg, enterNext, useMedia, useCol, useDocData } from "./payrollUi";
import { kpPrompt, kpConfirm } from "./kpDialog";

const PayrollReports = React.lazy(() => import("./PayrollReports"));
const PayrollContracts = React.lazy(() => import("./PayrollContracts"));
export { payslipHtml, PAYSLIP_CSS, printPayslips, TAX_NOTE, safeId, slipId, runId, empId };
// 직원별 상태 칩 — 미입력 · 계산됨 · 확정 · 발행 · 지급
const ROW_ST = {
  none: ["미입력", "#5B6B85", "#F2F4F7"], calc: ["계산됨", "#2D4C82", "#EEF3FC"], confirmed: ["확정", "#FFFFFF", "#2D4C82"], published: ["발행", "#FFFFFF", "#1B2B4B"], paid: ["지급", "#8FB0F0", "#0B1428"],
};
// ⭐ 2026-11-17 칸 폭 재기(가운데 칸이 넓으면 4칸 · 지급|공제 나란히 — 화면 폭이 아니라 실제 칸 폭으로)
function useWidth(el) {
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    if (!el) return undefined;
    setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el); return () => ro.disconnect();
  }, [el]);
  return w;
}
const ROW_DOT = { none: "#C5CEDC", calc: "#8FB0F0", confirmed: "#4B6CB7", published: "#1B2B4B", paid: "#0B1428" }; // ⭐ 2026-11-17 직원 목록 상태 점
const rowStatus = (r) => (!r.result ? "none" : r.slip?.status === "paid" ? "paid" : r.slip?.published ? "published" : r.slip?.status === "confirmed" ? "confirmed" : "calc");
const RowChip = ({ st, unsaved, compact = false }) => { const s = ROW_ST[st] || ROW_ST.none; return <span className="h-7 px-2.5 rounded-lg text-[14px] font-black inline-flex items-center gap-1 whitespace-nowrap" style={{ color: s[1], background: s[2] }} title={unsaved ? "아직 저장 전(자동 계산 값)" : ""}>{s[0]}{unsaved && st === "calc" ? (compact ? <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" aria-label="저장 전" /> : " · 저장 전") : ""}</span>; };
// 전월 대비 실지급 변동(10% 이상) 표시
const DiffTag = ({ cur, prev }) => {
  if (!cur || !prev) return null;
  const d = cur - prev; const p = prev ? d / prev : 0;
  if (Math.abs(p) < 0.1) return null;
  // ⭐ 2026-11-17 급여는 빨강 · 파랑으로 늘고 줄음을 칠하지 않는다(화살표만) — 빨강은 오류만
  return <span className="h-5 px-1.5 rounded-md text-[12.5px] font-black inline-flex items-center whitespace-nowrap bg-[#F2F4F7] text-[#3A4A66]" title={`전월 ${wonFmt(prev)}원 → ${wonFmt(cur)}원`} style={NUMS}>{d > 0 ? "▲" : "▼"} {Math.abs(Math.round(p * 100))}%</span>;
};

// ── 고르기 목록(드롭다운) ──
// ⭐ 2026-11-06 급여형태 · 고용형태 · 수당/공제 종류 · 부양가족 · 세액 비율 · 4대보험 적용
export const PAY_TYPES = [["monthly", "월급"], ["annual", "연봉"], ["hourly", "시급"], ["daily", "일급"]];
const payTypeLabel = (k) => (PAY_TYPES.find((x) => x[0] === k) || PAY_TYPES[0])[1];
export const EMP_TYPES = ["정규직", "계약직", "일용직", FREELANCE];
const FIXED_ONLY = ["직책수당", "식대", "자가운전보조금"];
const MONTH_ONLY = ["상여금"];
const NONTAX_KINDS = { 식대: "mealExempt", 자가운전보조금: "carExempt" };
export const PAY_KINDS = [
  ["직책수당", true], ["식대", false], ["자가운전보조금", false], ["상여금", true],
  ["고정 연장근로수당", true], ["야간근로수당(정액)", true], ["휴일근로수당(정액)", true],
  ["출산·보육수당", false], ["자격수당", true], ["근속수당", true], ["가족수당", true], ["직무수당", true], ["통신비", true],
  ["성과급", true], ["명절상여", true], ["기타", true],
]; // [이름, 과세 기본값]
export const DEDUCT_KINDS = ["가불금", "기숙사비", "경조회비", "사우회비", "식대 공제", "사내대출 상환", "연말정산 소득세", "연말정산 지방소득세", "건강보험 정산", "기타"];
const N0_10 = Array.from({ length: 11 }, (_, i) => i);
const TAX_RATES = [80, 100, 120];

// ── 지급 계좌 ── { bank, acct(숫자만), holder }
export const acctText = (a) => (a && a.bank && a.acct ? `${a.bank} ${formatAccount(a.bank, a.acct)}${a.holder ? ` (${a.holder})` : ""}` : "");
const acctKey = (a) => (a && a.bank && a.acct ? `${a.bank}|${onlyDigits(a.acct)}|${a.holder || ""}` : "");
// users/userProfiles 문서에 저장된 계좌 칸(이름이 화면마다 달라 넓게 본다)
function userAccounts(u = {}) {
  const out = [];
  const holder = u.accountHolder || u.depositor || u.bankHolder || u.예금주 || u.name || "";
  [u.payAccount, u.salaryAccount, u.bankAccount, u.account, u.계좌].forEach((v) => {
    if (!v) return;
    if (typeof v === "object" && v.bank) out.push({ bank: v.bank, acct: onlyDigits(v.acct || v.account || v.number), holder: v.holder || holder });
    else if (typeof v === "string") { const p = parseBankText(v); if (p.acct) out.push({ bank: p.bank || u.bankName || u.bank || "기타", acct: p.acct, holder: p.holder || holder }); }
  });
  const bank = u.bankName || (typeof u.bank === "string" ? u.bank : "") || u.은행;
  const no = u.accountNumber || u.accountNo || u.bankAccountNumber || u.계좌번호;
  if (bank && no) out.push({ bank, acct: onlyDigits(no), holder });
  return out;
}

// ── 데이터 구독 ──
const isStaff = (u, company) => (u.companyName || DEFAULT_COMPANY) === company && !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role) && !isTMUser(u) && u.approved !== false;
const _staffMemo = new Map(); // ⭐ 2026-11-09 다시 들어오면 지난 직원 목록을 먼저 보여 준다(메모리만)
function useStaff(company) {
  const [rows, setRows] = React.useState(() => _staffMemo.get(company) || null);
  React.useEffect(() => {
    if (!company) return undefined;
    setRows(_staffMemo.get(company) || null);
    return onSnapshot(query(collection(db, "users"), where("companyName", "==", company)), (s) => { const v = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => isStaff(u, company)); _staffMemo.set(company, v); setRows(v); }, () => setRows([]));
  }, [company]);
  return rows;
}
// ⭐ 2026-11-09 회계관리에 들어오면 급여 화면 묶음 + 잠금 상태(서버)를 미리 받아 둔다 → [급여 계산] 누르면 바로 열림
export function prefetchPayroll(company) { warmPayrollVerify(); return prefetchPayrollStatus(company).catch(() => null); }
export const usePayrollSettings = (company) => useDocData("payrollSettings", company);
// 수당·공제 종류 드롭다운 — 기본 목록 + 회사 항목(요율·설정) + 이미 쓰고 있는 항목 이름
function useItemKinds(settings, emps, slips) {
  return React.useMemo(() => {
    const base = PAY_KINDS.map((k) => k[0]);
    const custom = uniq([...(settings?.customPayItems || []).map((x) => (typeof x === "string" ? x : x?.label))]).filter((x) => !base.includes(x));
    const used = uniq([...(emps || []).flatMap((e) => (e.allowances || []).map((a) => a.label)), ...(slips || []).flatMap((s) => (s.input?.extraPays || []).map((a) => a.label))]).filter((x) => !base.includes(x) && !custom.includes(x));
    const dBase = DEDUCT_KINDS;
    const dCustom = uniq((settings?.customDeductItems || []).map((x) => (typeof x === "string" ? x : x?.label))).filter((x) => !dBase.includes(x));
    const dUsed = uniq((slips || []).flatMap((s) => (s.input?.extraDeducts || []).map((a) => a.label))).filter((x) => !dBase.includes(x) && !dCustom.includes(x));
    const taxableOf = (label) => { const k = PAY_KINDS.find((x) => x[0] === label); if (k) return k[1]; const c = (settings?.customPayItems || []).find((x) => x?.label === label); return c ? c.taxable !== false : true; };
    return {
      pay: [["기본 항목", base], ["회사 항목", custom], ["사용 중인 항목", used]],
      deduct: [["기본 항목", dBase], ["회사 항목", dCustom], ["사용 중인 항목", dUsed]],
      taxableOf,
    };
  }, [settings, emps, slips]);
}

// ═════════════════ 급여명세서(화면) — 내용은 payslipDoc.js(인쇄와 같은 HTML) ═════════════════
export function PayslipView({ slip, company }) {
  return <div className="kp-payslip"><style>{PAYSLIP_CSS}</style><div dangerouslySetInnerHTML={{ __html: payslipHtml(slip, company) }} /></div>;
}

// ═════════════════ 급여관리(경리 전용 · 비밀번호 잠금) ═════════════════
// ⭐ 2026-11-17 급여 화면 한 판으로 개편 — 메뉴마다 따로 놀던 머리 카드(BookHero) · 잠금 줄 · 일괄 버튼 줄 · 달 고르기를 맨 위 남색 한 줄(PayBar)로 모았다
//  · 위: [급여] 메뉴 탭(월 급여 계산 · 직원 급여 설정 · 신고 · 이체 · 요율 · 설정) · 잠금 시계 / 지급월 ‹ › · 진행 단계(계산 → 확정 → 명세서 발행 → 지급) · 합계(인원 · 지급 · 공제 · 실지급)
//  · 지급월 · 고른 직원은 탭을 옮겨도 그대로(직원 급여 설정 · 신고 · 이체가 같은 달 · 같은 사람을 본다)
//  · 넓은 화면(1280px 이상)은 화면 높이에 딱 맞춤 — 칸마다 따로 스크롤(바깥 스크롤 없음)
export const PAY_TABS = [["run", "월 급여 계산"], ["emp", "직원 급여 설정"], ["report", "신고 · 이체"], ["rates", "요율 · 설정"]];
export default function PayrollCenter({ company, role = "" }) {
  const uid = auth.currentUser?.uid || "preview";
  const acc = usePayrollAccess(company, uid, role, auth.currentUser?.email || "");
  const shell = React.useCallback((gate) => <PayrollShell company={company} gate={gate} />, [company]);
  if (acc.loading) return <div className="py-24 text-center text-[15px] font-bold text-[#7A879C]">확인 중…</div>;
  if (!acc.canView) return <div className="rounded-2xl bg-white border border-[#E3E8F0] py-16 px-4 text-center text-[15px] font-bold text-[#5B6B85]">급여는 경리·회계팀만 볼 수 있어요. 본인 급여명세서는 내정보 › 급여명세서에서 볼 수 있어요.</div>;
  return (
    <div className="w-full max-w-none min-w-0" data-testid="payroll-center">
      <PayrollGate company={company} canAdmin={acc.canAdmin}>{shell}</PayrollGate>
    </div>
  );
}

// 급여 한 판 — 위 남색 줄 + 탭 본문(달 · 직원 선택을 함께 쓴다)
function PayrollShell({ company, gate }) {
  const fit = useMedia("(min-width: 1280px)"); // 화면 높이 맞춤(칸마다 스크롤)
  const [tab, setTab] = React.useState("run");
  const [ym, setYm] = React.useState(kstYm);
  const [selId, setSelId] = React.useState(null);
  const pm = usePayrollMonth(company, ym, false);
  const fallback = <div className="py-20 text-center text-[15px] font-bold text-[#7A879C]">불러오는 중…</div>;
  const scroll = fit ? "h-full overflow-y-auto overscroll-contain pr-1 -mr-1" : "";
  return (
    <div className={fit ? "flex flex-col gap-3 min-h-[560px]" : "space-y-3"} style={fit ? { height: "calc(100vh - 196px)" } : undefined} data-testid="payroll-shell">
      <PayBar pm={pm} ym={ym} setYm={setYm} tab={tab} setTab={setTab} gate={gate} />
      <div className={fit ? "flex-1 min-h-0" : ""}>
        {tab === "run" && <PayrollRun pm={pm} company={company} ym={ym} ro={false} fit={fit} selId={selId} setSelId={setSelId} />}
        {tab === "emp" && <PayEmployees company={company} ro={false} fit={fit} selId={selId} setSelId={setSelId} />}
        {tab === "report" && <div className={scroll}><React.Suspense fallback={fallback}><PayrollReports company={company} ym={ym} /></React.Suspense></div>}
        {tab === "rates" && <div className={scroll}><PayRates company={company} ro={false} /></div>}
      </div>
    </div>
  );
}

// ── 맨 위 남색 줄 ──
const STEPS = [["calc", "계산"], ["confirm", "확정"], ["publish", "발행"], ["pay", "지급"]]; // 계산 → 확정 → 명세서 발행 → 지급
function PayBar({ pm, ym, setYm, tab, setTab, gate }) {
  const { totals, rows, ready, nConfirmed, nPublished, st, busy, ro } = pm;
  const [more, setMore] = React.useState(false);
  const nAll = rows.length;
  const done = { calc: ready.length > 0 && ready.length === nAll, confirm: ready.length > 0 && nConfirmed === ready.length, publish: ready.length > 0 && nPublished === ready.length, pay: st === "paid" };
  const cnt = { calc: `${ready.length}/${nAll}`, confirm: `${nConfirmed}`, publish: `${nPublished}`, pay: st === "paid" ? (pm.run?.payDate || "완료") : "" };
  const curStep = STEPS.find(([k]) => !done[k])?.[0] || "pay";
  // 다음에 누를 버튼(단계에 따라 하나만 크게)
  const next = ro || st === "paid" ? null
    : ready.some((r) => !r.slip?.published && r.slip?.status !== "paid") ? ["전체 확정 · 발행", () => pm.publishRows(ready), "payroll-publish-all"]
      : st === "confirmed" ? ["지급 처리", pm.pay, "payroll-pay"] : null;
  const moreItems = [
    !ro && st !== "paid" && ["전체 계산 · 저장", () => pm.saveDraft(ready, "전체 계산"), !ready.some((r) => !r.locked), "pay-calc-all"],
    !ro && st === "confirmed" && next?.[0] !== "지급 처리" && ["지급 처리", pm.pay, false, ""],
    !ro && st === "confirmed" && ["전체 확정 해제", () => pm.unlockRows(rows), false, "payroll-unlock-all"],
    !ro && st === "paid" && ["지급 취소", pm.unpay, false, "payroll-unpay"],
    pm.shownSlips.some((s) => s.status !== "draft") && ["확정분 전체 인쇄", () => printPayslips(pm.shownSlips.filter((s) => s.status !== "draft"), pm.company), false, "payroll-print-all"],
    gate?.canChange && ["급여 비밀번호 변경", gate.change, false, "pw-change"],
  ].filter(Boolean);
  React.useEffect(() => { if (!more) return undefined; const h = () => setMore(false); window.addEventListener("click", h); return () => window.removeEventListener("click", h); }, [more]);
  const kpi = [["인원", `${totals.n}명`, nAll > totals.n ? `설정 필요 ${nAll - totals.n}` : ""], ["지급 총액", wonFmt(totals.gross), ""], ["공제 총액", wonFmt(totals.deduct), `원천세 ${wonFmt(totals.tax)}`], ["실지급 총액", wonFmt(totals.net), `회사 부담 ${wonFmt(totals.employer)}`]];
  const arrow = "w-10 h-10 rounded-xl bg-white/10 border border-white/20 text-[17px] font-black hover:bg-white/20 shrink-0";
  return (
    <div className="shrink-0 rounded-[20px] text-white shadow-[0_12px_28px_rgba(15,26,48,0.22)]" style={{ background: "linear-gradient(120deg,#0B1428 0%,#0F1A30 35%,#1B2B4B 75%,#24406E 100%)" }} data-testid="pay-bar">
      {/* 1줄: 메뉴 탭 · 이 달 합계 */}
      <div className="px-3 md:px-4 pt-3 flex items-center gap-x-3 gap-y-2 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.07] overflow-x-auto no-scrollbar max-w-full" role="tablist" aria-label="급여 메뉴">
          {PAY_TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`h-9 px-3.5 rounded-lg text-[14px] font-black whitespace-nowrap transition ${tab === k ? "bg-white text-[#0F1A30] shadow-[0_2px_8px_rgba(0,0,0,0.25)]" : "text-white/70 hover:text-white hover:bg-white/10"}`} data-testid={`pay-tab-${k}`}>{l}</button>)}
        </div>
        <span className="flex-1" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 min-w-0" data-testid="pay-kpis">
          {kpi.map(([l, v, sub]) => (
            <div key={l} className="rounded-xl bg-white/[0.07] border border-white/10 px-3 py-1 min-w-[118px]" title={sub || undefined}>
              <div className="text-[12.5px] font-bold text-white/55 truncate">{l}</div>
              <div className="text-[16px] font-black leading-tight text-right whitespace-nowrap" style={NUMS}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      {/* 2줄: 지급월 · 진행 단계 · 다음 할 일 · 잠금 */}
      <div className="px-3 md:px-4 pt-2.5 pb-3 flex items-center gap-x-3 gap-y-2.5 flex-wrap">
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => setYm(shiftYm(ym, -1))} className={arrow} aria-label="이전 달">‹</button>
          <Sel dark ariaLabel="지급월(귀속 월)" testid="pay-month" value={ym} onChange={(v) => v && setYm(v)} options={pm.ymList.map((m) => [m, `${ymLabel(m)} · ${pm.ymStatus(m)}`])} className="w-[214px]" />
          <button type="button" onClick={() => setYm(shiftYm(ym, 1))} className={arrow} aria-label="다음 달">›</button>
        </div>
        <ol className="flex items-center gap-1 min-w-0 max-w-full overflow-x-auto no-scrollbar" aria-label="진행 단계" data-testid="pay-steps">
          {STEPS.map(([k, l], i) => {
            const on = k === curStep && !done[k]; const ok = done[k];
            return (
              <li key={k} className="flex items-center gap-1">
                {i > 0 && <span className={`w-3 h-[2px] rounded ${ok || on ? "bg-[#8FB0F0]" : "bg-white/20"}`} />}
                <span className={`h-10 pl-1.5 pr-3 rounded-xl inline-flex items-center gap-1.5 text-[14px] font-black whitespace-nowrap ${on ? "bg-white text-[#0F1A30]" : ok ? "bg-[#8FB0F0]/15 text-white" : "text-white/55"}`} aria-current={on ? "step" : undefined}>
                  <span className={`w-6 h-6 rounded-lg grid place-items-center text-[13px] ${on ? "bg-[#0F1A30] text-white" : ok ? "bg-[#8FB0F0] text-[#0B1428]" : "bg-white/10"}`}>{ok ? "✓" : i + 1}</span>
                  {l}{cnt[k] && <span className={`font-bold ${on ? "text-[#5B6B85]" : "text-white/60"}`} style={NUMS}>{cnt[k]}</span>}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="flex items-center gap-1.5 shrink-0 relative">
          {next && <button type="button" disabled={busy} onClick={next[1]} className="h-10 px-4 rounded-xl bg-[#8FB0F0] text-[#0B1428] text-[14px] font-black hover:bg-[#A9C3F5] disabled:opacity-40 whitespace-nowrap" data-testid={next[2]}>{next[0]}</button>}
          {moreItems.length > 0 && <button type="button" onClick={(e) => { e.stopPropagation(); setMore((v) => !v); }} className="h-10 px-3 rounded-xl bg-white/10 border border-white/20 text-[14px] font-black hover:bg-white/20 whitespace-nowrap" aria-expanded={more} data-testid="pay-more">더보기 ▾</button>}
          {more && (
            <div className="absolute z-40 top-full mt-1.5 left-0 w-[220px] rounded-xl bg-white text-[#0F1A30] shadow-[0_18px_40px_rgba(15,26,48,0.28)] border border-[#DCE3EE] py-1" role="menu">
              {moreItems.map(([l, fn, dis, tid]) => <button key={l} type="button" role="menuitem" disabled={(busy && tid !== "pw-change") || dis} onClick={() => { setMore(false); fn(); }} className="w-full text-left px-3.5 h-11 text-[14px] font-black hover:bg-[#F5F8FD] disabled:opacity-40" data-testid={tid || undefined}>{l}</button>)}
            </div>
          )}
        </div>
        <span className="flex-1" />
        {gate && (
          <div className="flex items-center gap-1.5 shrink-0" data-testid="payroll-unlocked-bar">
            <span className="h-10 px-3 rounded-xl bg-white/[0.07] text-[14px] font-bold text-white/70 inline-flex items-center gap-1.5 whitespace-nowrap" title="급여 비밀번호로 연 남은 시간이에요. 10분 동안 손대지 않으면 자동으로 잠겨요" aria-label="잠금까지 남은 시간"><GateTimer until={gate.until} /></span>
            <button type="button" onClick={gate.lock} className="h-10 px-3 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black whitespace-nowrap" data-testid="payroll-lock">잠그기</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 한 달 급여 데이터 · 처리(저장 · 확정 · 발행 · 지급) — 위 줄 합계와 계산 화면이 같이 쓴다 ──
const EMP_BLANK = { payType: "monthly", employmentType: "정규직", baseMonthly: 0, annualSalary: 0, annualSeverance: false, annualMealIncluded: false, hourlyWage: 0, dailyWage: 0, meal: 200000, car: 0, positionAllow: 0, allowances: [], dependents: 1, children: 0, taxRatePct: 100, taxFixed: "", npBase: "", hiBase: "", npExempt: false, hiExempt: false, eiExempt: false, mealOrdinary: false, birthDate: "", payAccount: null, memo: "" };
// 직원 급여 설정 문서 정리(저장용)
function cleanEmp(f) {
  const clean = {
    ...f, baseMonthly: toNum(f.baseMonthly), annualSalary: toNum(f.annualSalary), annualSeverance: !!f.annualSeverance, annualMealIncluded: !!f.annualMealIncluded, hourlyWage: toNum(f.hourlyWage), dailyWage: toNum(f.dailyWage), meal: toNum(f.meal), car: toNum(f.car), positionAllow: toNum(f.positionAllow),
    dependents: Math.max(1, toNum(f.dependents) || 1), children: toNum(f.children), taxRatePct: toNum(f.taxRatePct) || 100,
    allowances: (f.allowances || []).filter((x) => x.label || toNum(x.amount)).map((x) => ({ label: x.label || "기타수당", amount: toNum(x.amount), taxable: x.taxable !== false, ordinary: x.ordinary !== false })),
    payAccount: f.payAccount && f.payAccount.bank && f.payAccount.acct ? { bank: f.payAccount.bank, acct: onlyDigits(f.payAccount.acct), holder: f.payAccount.holder || "" } : null,
  };
  delete clean.id; delete clean.updatedAt; delete clean.contractFiles; // 계약서 파일 목록은 따로(arrayUnion)
  return clean;
}
const empReady = (e) => !!e && ((e.payType === "hourly" && toNum(e.hourlyWage)) || (e.payType === "daily" && toNum(e.dailyWage)) || (e.payType === "annual" && toNum(e.annualSalary)) || ((e.payType || "monthly") === "monthly" && toNum(e.baseMonthly)));
const needMsg = (t) => (t === "hourly" ? "시급을 입력해 주세요" : t === "daily" ? "일급을 입력해 주세요" : t === "annual" ? "연봉을 입력해 주세요" : "월 기본급을 입력해 주세요");
const payText = (e) => (!e ? "" : e.payType === "hourly" ? `시급 ${wonFmt(e.hourlyWage)}` : e.payType === "daily" ? `일급 ${wonFmt(e.dailyWage)}` : e.payType === "annual" ? `연봉 ${wonFmt(e.annualSalary)}` : wonFmt(e.baseMonthly));
// 출근기록 값 + 이번 달 직접 수정 → 계산 엔진 입력
function monthOf(input = {}, a = {}) {
  const pick = (k) => (!blank(input[k]) ? toNum(input[k]) : toNum(a[k]));
  return {
    workDays: pick("workDays"), regularHours: pick("regularHours"), otHours: pick("otHours"), nightHours: pick("nightHours"), holHours: pick("holHours"), holOverHours: pick("holOverHours"),
    weeklyHolidayHours: toNum(input.weeklyHolidayHours), bonus: toNum(input.bonus), extraPays: input.extraPays || [], extraDeducts: input.extraDeducts || [],
    taxOverride: input.taxOverride, localTaxOverride: input.localTaxOverride,
  };
}

function usePayrollMonth(company, ym, ro) {
  const staff = useStaff(company);
  const emps = useCol("payrollEmployees", company);
  const allSlips = useCol("payslips", company); // 최근 12개월 · 올해 누계 · 달별 상태
  const slips = React.useMemo(() => (allSlips ? allSlips.filter((x) => x.ym === ym) : null), [allSlips, ym]);
  const att = useCol("attendance", company, ["month", ym], ym);
  const hols = useCol("holidays", company);
  const runs = useCol("payrollRuns", company);
  const settings = usePayrollSettings(company);
  const hr = useHrOptions(company);
  const run = useDocData("payrollRuns", company ? runId(company, ym) : "");
  const kinds = useItemKinds(settings, emps, allSlips);
  const [busy, setBusy] = React.useState(false);
  const year = Number(ym.slice(0, 4));
  const curRates = ratesFor(settings || {}, year);
  const empMap = React.useMemo(() => Object.fromEntries((emps || []).map((e) => [e.uid, e])), [emps]);
  const slipMap = React.useMemo(() => Object.fromEntries((slips || []).map((s) => [s.uid, s])), [slips]);
  const prevMap = React.useMemo(() => Object.fromEntries((allSlips || []).filter((x) => x.ym === shiftYm(ym, -1)).map((s) => [s.uid, s])), [allSlips, ym]);
  const isOff = React.useCallback((d) => isWeekend(d) || isHoliday(d, hols || []), [hols]);
  const monthStart = `${ym}-01`; const monthEnd = lastDayOf(ym);
  const people = (staff || []).filter((u) => {
    if (slipMap[u.id]) return true;
    if (u.employmentStatus === "퇴사" && String(u.resignedAt || u.resignPlan?.date || "9999").slice(0, 10) < monthStart) return false;
    if (u.hireDate && u.hireDate > monthEnd) return false;
    return u.employmentStatus !== "퇴사" || !!empMap[u.id];
  }).sort((a, b) => String(a.team || "").localeCompare(String(b.team || ""), "ko") || String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  const rows = people.map((u) => {
    const emp = empMap[u.id] || null;
    const slip = slipMap[u.id];
    const locked = ["confirmed", "paid"].includes(slip?.status);
    if (locked && slip?.result) return { u, emp, slip, locked, result: slip.result, input: slip.input || {}, att: slip.att || {}, rates: slip.rates || run?.rates || curRates };
    const a = hoursFromAttendance((att || []).filter((r) => r.uid === u.id), isOff);
    const input = slip?.input || {};
    return { u, emp, slip, locked: false, result: empReady(emp) ? calcPayslipFull(emp, monthOf(input, a), curRates) : null, input, att: a, rates: curRates };
  });
  const ready = rows.filter((r) => r.result);
  const sum = (list, f) => list.reduce((s, r) => s + (f(r.result) || 0), 0);
  const totalsOf = (list) => ({ n: list.length, gross: sum(list, (x) => x.gross), deduct: sum(list, (x) => x.totalDeduct), net: sum(list, (x) => x.net), employer: sum(list, (x) => x.employer?.total), tax: sum(list, (x) => (x.deductions || []).filter((d) => d.key === "tax" || d.key === "local").reduce((s, d) => s + d.amount, 0)) });
  const totals = totalsOf(ready);
  const nConfirmed = ready.filter((r) => r.locked).length;
  const nPublished = ready.filter((r) => r.slip?.published).length;
  const st = run?.status === "paid" ? "paid" : ready.length && nConfirmed === ready.length ? "confirmed" : slips?.length ? "draft" : "none";
  const byName = auth.currentUser?.email || "";
  const logEntry = (action, detail = "") => ({ at: Date.now(), action, by: byName, detail });
  const payDateDefault = () => { const d = Number(settings?.payDay) || 0; if (!d) return kstDay(); const n = shiftYm(ym, settings?.payNextMonth === false ? 0 : 1); return `${n}-${String(Math.min(d, 28)).padStart(2, "0")}`; };

  // 달 드롭다운 — 최근 12개월 + 다음 달 + 처리 기록이 있는 달, 상태 함께
  const runMap = Object.fromEntries((runs || []).map((r) => [r.ym, r]));
  const slipYmCount = {}; const slipYmSt = {};
  (allSlips || []).forEach((s) => { slipYmCount[s.ym] = (slipYmCount[s.ym] || 0) + 1; (slipYmSt[s.ym] = slipYmSt[s.ym] || []).push(s.status === "paid" ? "paid" : s.published ? "pub" : s.status === "confirmed" ? "conf" : "draft"); });
  const ymList = uniq([shiftYm(kstYm(), 1), ...Array.from({ length: 13 }, (_, i) => shiftYm(kstYm(), -i)), ...Object.keys(runMap), ...Object.keys(slipYmCount), ym]).sort().reverse();
  const ymStatus = (m) => { const r = runMap[m]; if (r?.status === "paid") return "지급 완료"; if (r?.status === "confirmed") return r.published ? "확정 · 발행" : "확정"; const sl = slipYmSt[m] || [];
    if (sl.length && sl.every((x) => x === "paid")) return `지급 완료 ${sl.length}명`;
    if (sl.length && sl.every((x) => x !== "draft")) return `확정 ${sl.length}명${sl.some((x) => x === "pub" || x === "paid") ? " · 발행" : ""}`;
    if (sl.length) return `작성 중 ${sl.length}명`; return m > kstYm() ? "예정" : "미작성"; };

  // ── 저장 · 확정 · 발행 · 지급 ──
  const slipDoc = (r, extra = {}) => ({
    companyName: company, ym, uid: r.u.id, name: personName(r.u) || r.u.name || "", team: r.u.team || "", position: r.u.position || "",
    birthDate: r.u.birthDate || r.emp?.birthDate || "", hireDate: r.u.hireDate || "", phone: r.u.phone || "", payType: r.emp?.payType || "monthly", employmentType: r.emp?.employmentType || "",
    payDate: r.input?.payDate || run?.payDate || payDateDefault(), payAccount: r.input?.payAccount || r.emp?.payAccount || null,
    input: r.input || {}, att: r.att || {}, result: r.result, rates: r.rates || curRates, updatedAt: serverTimestamp(), updatedBy: byName, ...extra,
  });
  const runPatch = (after, extra = {}) => ({ companyName: company, ym, totals: totalsOf(after), rates: curRates, payDate: run?.payDate || payDateDefault(), updatedAt: serverTimestamp(), updatedBy: byName, ...extra });
  // 이번 작업 뒤의 행 목록(확정·발행 여부를 덮어써서 달 전체 상태 판단)
  const merged = (list, patch) => ready.map((r) => { const o = list.find((x) => x.u.id === r.u.id); return o ? { ...r, ...o, ...patch(o) } : r; });
  const runStatusAfter = (after) => (after.length && after.every((r) => r.locked) ? "confirmed" : "draft");
  const saveEmpIn = (b, r) => { if (r.empDirty && r.emp) b.set(doc(db, "payrollEmployees", empId(company, r.u.id)), { ...cleanEmp(r.emp), companyName: company, uid: r.u.id, name: personName(r.u) || r.u.name || "", updatedAt: serverTimestamp(), updatedBy: byName }, { merge: true }); };
  const commit = async (fn, failMsg) => { setBusy(true); try { const b = writeBatch(db); await fn(b); await b.commit(); return true; } catch (e) { alert(`${failMsg}: ${e.message}`); return false; } finally { setBusy(false); } };
  // 임시 저장(계산됨) — list: 행 목록(편집 중인 한 사람은 화면 값이 들어온다)
  const saveDraft = (list, label = "저장") => {
    const todo = list.filter((r) => r.result && !r.locked);
    if (ro || !todo.length) return Promise.resolve(false);
    return commit((b) => {
      todo.forEach((r) => { saveEmpIn(b, r); b.set(doc(db, "payslips", slipId(company, ym, r.u.id)), slipDoc(r, { status: "draft", published: false }), { merge: true }); });
      const after = merged(todo, () => ({ locked: false }));
      b.set(doc(db, "payrollRuns", runId(company, ym)), { ...runPatch(after, { status: "draft" }), log: arrayUnion(logEntry(label, `${todo.length}명`)) }, { merge: true });
    }, "저장 실패");
  };
  const confirmRows = async (list, ask = true) => {
    const todo = list.filter((r) => r.result && !r.locked);
    if (ro) return Promise.resolve(false);
    if (!todo.length) { alert("확정할 직원이 없습니다(급여 설정이 없거나 이미 확정됨)."); return Promise.resolve(false); }
    if (ask && !(await kpConfirm(`${ymLabel(ym)} 급여 ${todo.length}명을 확정할까요?\n확정하면 잠겨서 수정할 수 없습니다(확정 해제는 사유 기록).`, { title: "급여 확정", okText: "확정" }))) return false;
    return commit((b) => {
      todo.forEach((r) => { saveEmpIn(b, r); b.set(doc(db, "payslips", slipId(company, ym, r.u.id)), slipDoc(r, { status: "confirmed", published: false, confirmedAt: Date.now(), confirmedBy: byName }), { merge: true }); });
      const after = merged(todo, () => ({ locked: true }));
      const status = runStatusAfter(after);
      b.set(doc(db, "payrollRuns", runId(company, ym)), { ...runPatch(after, { status, published: false }), ...(status === "confirmed" ? { confirmedAt: Date.now(), confirmedBy: byName } : {}), log: arrayUnion(logEntry("확정", `${todo.length}명 · 실지급 ${wonFmt(totalsOf(todo).net)}원`)) }, { merge: true });
    }, "확정 실패");
  };
  // 발행 — 확정 안 된 사람은 확정과 함께 발행(직원 알림)
  const publishRows = async (list) => {
    const todo = list.filter((r) => r.result && !r.slip?.published && r.slip?.status !== "paid");
    if (ro) return Promise.resolve(false);
    if (!todo.length) { alert("발행할 명세서가 없습니다(이미 발행됨)."); return Promise.resolve(false); }
    const nNew = todo.filter((r) => !r.locked).length;
    if (!(await kpConfirm(`${ymLabel(ym)} 급여명세서 ${todo.length}건을 발행할까요?${nNew ? `\n· 확정 전 ${nNew}명은 확정(잠금)과 함께 발행됩니다` : ""}\n· 직원은 내정보 › 급여명세서에서 본인 것만 볼 수 있습니다\n· 직원에게 앱 알림 · 사내메일(푸시)이 갑니다`, { title: "급여명세서 발행", okText: "발행" }))) return false;
    const notes = todo.map((r) => ({ uid: r.u.id, name: personName(r.u) || r.u.name || "", team: r.u.team || "", position: r.u.position || "", net: r.result?.net, pd: r.input?.payDate || r.slip?.payDate || run?.payDate || payDateDefault() }));
    return commit((b) => {
      const now = Date.now();
      todo.forEach((r) => {
        const id = slipId(company, ym, r.u.id);
        if (!r.locked) { saveEmpIn(b, r); b.set(doc(db, "payslips", id), slipDoc(r, { status: "confirmed", confirmedAt: now, confirmedBy: byName, published: true, publishedAt: now, publishedBy: byName }), { merge: true }); }
        else b.update(doc(db, "payslips", id), { published: true, publishedAt: now, publishedBy: byName, updatedAt: serverTimestamp() });
        const nm = personName(r.u) || r.u.name || "";
        const pd = r.input?.payDate || r.slip?.payDate || run?.payDate || payDateDefault();
        b.set(doc(collection(db, "hrNotices")), { companyName: company, uid: r.u.id, kind: "payslip", link: "payslip", refId: id, title: `${ymLabel(ym)} 급여명세서가 발행되었습니다`, body: `${nm}님, ${ymLabel(ym)}분 급여명세서가 발행되었습니다.\n실수령액 ${wonFmt(r.result?.net)}원 · 지급일 ${pd}\n\n내정보 › 급여명세서에서 확인·인쇄할 수 있습니다.`, createdAt: serverTimestamp(), createdBy: byName });
      });
      const after = merged(todo, () => ({ locked: true, slip: { status: "confirmed", published: true } }));
      const status = runStatusAfter(after);
      const allPub = after.every((r) => r.slip?.published);
      b.set(doc(db, "payrollRuns", runId(company, ym)), { ...runPatch(after, { status }), published: allPub, ...(allPub ? { publishedAt: now, publishedBy: byName } : {}), log: arrayUnion(logEntry("명세서 발행", `${todo.length}건 · 앱 알림 · 사내메일`)) }, { merge: true });
    }, "발행 실패").then(async (ok) => {
      // ⭐ 2026-11-07 사내메일(받는 사람 휴대폰 푸시는 서버 notifyInternalMail이 보낸다) — 금액은 메일에 넣지 않는다(알림 미리보기 노출 방지)
      if (ok) await Promise.all(notes.map((x) => sendInternalMail({ company, to: [{ uid: x.uid, name: x.name, team: x.team, position: x.position }], subject: `${ymLabel(ym)} 급여명세서가 발행되었습니다`, body: `${x.name}님, ${ymLabel(ym)}분 급여명세서가 발행되었습니다.\n지급일 ${x.pd}\n\n내정보 › 급여명세서에서 확인·인쇄할 수 있습니다.`, kind: "hr", fromName: "경리팀", important: true }).catch(() => null)));
      return ok;
    });
  };
  const unlockRows = async (list) => {
    const todo = list.filter((r) => r.slip && r.slip.status === "confirmed");
    if (!todo.length) return Promise.resolve(false);
    const reason = await kpPrompt(`확정을 풀고 다시 수정합니다(${todo.length}명). 사유를 적어 주세요(기록이 남고, 발행된 명세서는 직원 화면에서 내려갑니다).`);
    if (!reason || reason.trim().length < 2) return Promise.resolve(false);
    return commit((b) => {
      todo.forEach((r) => b.update(doc(db, "payslips", r.slip.id), { status: "draft", published: false, updatedAt: serverTimestamp(), updatedBy: byName, unlockReason: reason.trim() }));
      b.set(doc(db, "payrollRuns", runId(company, ym)), { status: "draft", published: false, updatedAt: serverTimestamp(), log: arrayUnion(logEntry("확정 해제", `${todo.length}명 · ${reason.trim()}`)) }, { merge: true });
    }, "실패");
  };
  const pay = async () => {
    const d = (await kpPrompt("지급일(YYYY-MM-DD)", run?.payDate || payDateDefault()));
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.trim())) return;
    const ok = await commit((b) => {
      (slips || []).forEach((s) => b.update(doc(db, "payslips", s.id), { status: "paid", paidDate: d.trim(), paidAt: Date.now(), updatedAt: serverTimestamp() }));
      b.set(doc(db, "payrollRuns", runId(company, ym)), { status: "paid", payDate: d.trim(), paidAt: Date.now(), paidBy: byName, totals, log: arrayUnion(logEntry("지급 처리", `${d.trim()} · 실지급 ${wonFmt(totals.net)}원`)) }, { merge: true });
    }, "지급 처리 실패");
    // 🔗 수입·지출 장부 연동(ledgerAuto) — 실지급액 합계 1줄(원천세·4대보험은 신고·납부 때 따로)
    if (ok && settings?.ledgerOn !== false) {
      await upsertAutoEntry(db, `payroll_${ym}`, { company, date: d.trim(), account: "급여·상여", item: `${ymLabel(ym)} 직원 급여 지급 · ${slips.length}명`, amount: totals.net, vendor: "직원 급여", memo: `급여 계산 자동 — 지급 총액 ${wonFmt(totals.gross)}원 · 공제 ${wonFmt(totals.deduct)}원(원천세·4대보험은 따로 납부)`, auto: "payroll" }).catch((e) => console.warn("장부 기록 실패", e));
    }
  };
  const unpay = async () => {
    if (!(await kpConfirm("지급 처리를 취소할까요? 장부의 급여 지급 줄도 지워집니다."))) return;
    const ok = await commit((b) => {
      (slips || []).forEach((s) => b.update(doc(db, "payslips", s.id), { status: "confirmed", paidDate: "", updatedAt: serverTimestamp() }));
      b.set(doc(db, "payrollRuns", runId(company, ym)), { status: "confirmed", paidAt: null, log: arrayUnion(logEntry("지급 취소")) }, { merge: true });
    }, "실패");
    if (ok) await upsertAutoEntry(db, `payroll_${ym}`, { company, amount: 0, auto: "payroll" }).catch(() => {});
  };
  const loading = staff === null || emps === null || slips === null;
  const shownSlips = (slips || []).slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  return { company, ym, ro, staff, emps, allSlips, slips, hr, run, kinds, busy, curRates, prevMap, people, rows, ready, totals, totalsOf, nConfirmed, nPublished, st, ymList, ymStatus, payDateDefault, slipDoc, saveDraft, confirmRows, publishRows, unlockRows, pay, unpay, loading, shownSlips };
}

// ── 월 급여 계산 — 직원 목록(왼쪽) | 급여 시트(가운데) | 명세서 미리보기(오른쪽) ──
// ⭐ 2026-11-17 3칸 폭 고정 · 칸마다 따로 스크롤 · 1440px 아래는 오른쪽 칸을 가운데 [명세서] 탭으로 · 1280px 아래(태블릿 · 휴대폰)는 직원 목록을 서랍(☰)으로
//  키보드: ↑ ↓ = 다른 직원(입력칸 밖에서) · Alt + ↑ ↓ = 어디서든 · Enter = 첫 입력칸으로
function PayrollRun({ pm, company, ym, ro, fit, selId, setSelId }) {
  const w3 = useMedia("(min-width: 1440px)"); // 3칸
  const ledger2 = useMedia("(min-width: 1760px)"); // 지급 | 공제 나란히
  const { rows, ready, loading, prevMap, nConfirmed, nPublished } = pm;
  const [checked, setChecked] = React.useState(() => new Set());
  const [pane, setPane] = React.useState("edit"); // 3칸이 아닐 때: 입력 | 명세서
  const [drawer, setDrawer] = React.useState(false);
  const [flt, setFlt] = React.useState({ q: "", team: "", position: "", emp: "재직", payType: "", st: "" });
  const dirtyRef = React.useRef(false);
  const listRef = React.useRef(null);
  const editRef = React.useRef(null);
  const hr = pm.hr;
  const teamOpts = uniq([...(hr.teams || []), ...pm.people.map((u) => u.team)]);
  const posOpts = uniq([...(hr.exec || []), ...(hr.normal || []), ...pm.people.map((u) => u.position)]);
  const statusOpts = uniq([...EMPLOYMENT_STATUS_OPTIONS, ...pm.people.map((u) => u.employmentStatus)]);
  const qq = flt.q.trim();
  const base = rows.filter((r) => {
    const u = r.u;
    if (qq && ![personName(u), u.name, u.team, u.position, u.phone].some((v) => String(v || "").includes(qq))) return false;
    if (flt.team && u.team !== flt.team) return false;
    if (flt.position && u.position !== flt.position) return false;
    if (flt.emp && (u.employmentStatus || "재직") !== flt.emp) return false;
    if (flt.payType && (flt.payType === "none" ? r.result : !r.emp || (r.emp.payType || "monthly") !== flt.payType)) return false;
    return true;
  });
  const shown = base.filter((r) => !flt.st || rowStatus(r) === flt.st);
  const stCount = Object.fromEntries(Object.keys(ROW_ST).map((k) => [k, base.filter((r) => rowStatus(r) === k).length]));
  const cur = rows.find((r) => r.u.id === selId) || shown[0] || rows[0] || null;
  React.useEffect(() => { if (cur && cur.u.id !== selId) setSelId(cur.u.id); }, [selId, cur, setSelId]);
  React.useEffect(() => { setChecked(new Set()); }, [ym]);
  const toggleCheck = (id) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShownChecked = shown.length > 0 && shown.every((r) => checked.has(r.u.id));
  const checkedRows = rows.filter((r) => checked.has(r.u.id));
  const nFlt = ["team", "position", "payType"].filter((k) => flt[k]).length + (flt.emp !== "재직" ? 1 : 0);
  const [fltOpen, setFltOpen] = React.useState(false);

  // 다른 직원으로 — 저장 안 한 수정이 있으면 한 번 묻는다
  const go = React.useCallback(async (id) => {
    if (!id || id === cur?.u.id) return;
    if (dirtyRef.current && !(await kpConfirm("저장하지 않은 수정이 있어요. 저장하지 않고 다른 직원으로 넘어갈까요?", { title: "저장 안 됨", okText: "넘어가기" }))) return;
    dirtyRef.current = false;
    setSelId(id); setDrawer(false);
  }, [cur, setSelId]);
  const step = React.useCallback((d) => { const i = shown.findIndex((r) => r.u.id === cur?.u.id); const n = shown[i + d]; if (n) go(n.u.id); }, [shown, cur, go]);
  // 고른 줄이 목록에서 보이게
  React.useEffect(() => { const el = listRef.current?.querySelector(`[data-uid="${cur?.u.id}"]`); el?.scrollIntoView?.({ block: "nearest" }); }, [cur?.u.id]);
  // 키보드
  React.useEffect(() => {
    const h = (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Enter") return;
      if (e.isComposing || e.ctrlKey || e.metaKey || document.querySelector("[role=dialog],.kp-dialog")) return;
      const t = e.target; const field = t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const inList = listRef.current?.contains(t);
      const free = t === document.body || inList;
      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && (e.altKey || (!field && free))) { e.preventDefault(); step(e.key === "ArrowUp" ? -1 : 1); return; }
      if (e.key === "Enter" && !field && free && !e.altKey) {
        e.preventDefault();
        const f = editRef.current?.querySelector("[data-pay-editor] input:not([disabled]),[data-pay-editor] select:not([disabled])");
        if (f) { f.focus(); try { f.select?.(); } catch { /* 무시 */ } }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [step]);

  const bulkBtn = "h-10 px-3 rounded-xl text-[14px] font-black disabled:opacity-40 whitespace-nowrap";
  const list = (
    <div className={`${sec} overflow-hidden flex flex-col min-w-0 ${fit ? "h-full" : ""}`} data-testid="pay-emp-panel">
      <div className="p-3 space-y-2 border-b border-[#EEF1F6] shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <input value={flt.q} onChange={(e) => setFlt((f) => ({ ...f, q: e.target.value }))} onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); step(e.key === "ArrowUp" ? -1 : 1); } else if (e.key === "Enter" && shown[0]) { e.preventDefault(); go(shown[0].u.id); } }}
              placeholder="이름 · 부서 · 직책" className={`${inp} !h-10 pl-9`} aria-label="직원 검색" data-testid="emp-search" />
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5B6B85" strokeWidth="2.6" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          </div>
          <button type="button" onClick={() => setFltOpen((v) => !v)} aria-expanded={fltOpen} className={`h-10 px-3 rounded-xl border text-[14px] font-black whitespace-nowrap ${fltOpen || nFlt ? "border-[#1B2B4B] bg-[#EEF3FC] text-[#1B2B4B]" : "border-[#DCE3EE] bg-white text-[#3A4A66]"}`} data-testid="flt-toggle">필터{nFlt ? ` ${nFlt}` : ""}</button>
        </div>
        {fltOpen && (
          <div className="grid grid-cols-2 gap-1.5">
            <Sel ariaLabel="부서" value={flt.team} onChange={(v) => setFlt((f) => ({ ...f, team: v }))} placeholder="부서 전체" options={teamOpts} testid="flt-team" />
            <Sel ariaLabel="직책" value={flt.position} onChange={(v) => setFlt((f) => ({ ...f, position: v }))} placeholder="직책 전체" options={posOpts} />
            <Sel ariaLabel="재직상태" value={flt.emp} onChange={(v) => setFlt((f) => ({ ...f, emp: v }))} placeholder="재직상태 전체" options={statusOpts} />
            <Sel ariaLabel="급여형태" value={flt.payType} onChange={(v) => setFlt((f) => ({ ...f, payType: v }))} placeholder="급여형태 전체" options={[...PAY_TYPES.map(([k, l]) => [k, `${l}제`]), ["none", "설정 필요"]]} />
          </div>
        )}
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="처리 상태">
          {[["", "전체", base.length], ...Object.entries(ROW_ST).map(([k, v]) => [k, v[0], stCount[k]])].filter(([k, , n]) => !k || n || flt.st === k).map(([k, l, n]) => (
            <button key={k || "all"} type="button" role="tab" aria-selected={flt.st === k} onClick={() => setFlt((f) => ({ ...f, st: k }))} className={`h-8 px-2.5 rounded-lg text-[13.5px] font-black whitespace-nowrap ${flt.st === k ? "bg-[#0F1A30] text-white" : "bg-[#F2F4F7] text-[#3A4A66] hover:bg-[#E9EDF3]"}`}>{l} <span style={NUMS} className={flt.st === k ? "text-white/70" : "text-[#7A879C]"}>{n}</span></button>
          ))}
        </div>
      </div>
      <label className="px-3 h-10 shrink-0 flex items-center gap-2 bg-[#F5F8FD] border-b border-[#EEF1F6] text-[13.5px] font-black text-[#3A4A66] cursor-pointer">
        <input type="checkbox" className="w-[17px] h-[17px] accent-[#1B2B4B]" checked={allShownChecked} onChange={() => setChecked((s) => { const n = new Set(s); shown.forEach((r) => (allShownChecked ? n.delete(r.u.id) : n.add(r.u.id))); return n; })} />
        전체 선택{checked.size > 0 && <span className="text-[#2D4C82]">· {checked.size}명</span>}
        <span className="ml-auto font-bold text-[#7A879C]">실지급</span>
      </label>
      <div ref={listRef} tabIndex={0} className={`divide-y divide-[#EEF1F6] overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8FB0F0] ${fit ? "flex-1 min-h-0" : "max-h-[60vh]"}`} data-testid="pay-emp-list" aria-label="직원 목록 — ↑ ↓ 로 옮기고 Enter 로 입력">
        {loading ? <div className="py-10 text-center text-[14px] font-bold text-[#7A879C]">불러오는 중…</div> : !shown.length ? <div className="py-10 text-center text-[14px] font-bold text-[#7A879C]">조건에 맞는 직원이 없어요</div> : shown.map((r) => {
          const on = cur?.u.id === r.u.id; const rs = rowStatus(r); const s = ROW_ST[rs];
          return (
            <div key={r.u.id} data-uid={r.u.id} className={`pl-3 pr-3 py-2 flex items-center gap-2 cursor-pointer ${on ? "bg-[#EEF3FC] shadow-[inset_3px_0_0_#1B2B4B]" : "hover:bg-[#F8FAFD]"}`} onClick={() => go(r.u.id)} data-testid="payroll-edit" aria-selected={on}>
              <input type="checkbox" aria-label={`${r.u.name} 선택`} className="w-[17px] h-[17px] accent-[#1B2B4B] shrink-0" checked={checked.has(r.u.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleCheck(r.u.id)} />
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-black text-[#0F1A30] truncate">{personName(r.u) || r.u.name}</span>
                <span className="block text-[13px] font-bold text-[#7A879C] truncate">{[r.u.team, r.u.position].filter(Boolean).join(" · ") || "-"}</span>
              </span>
              <span className="text-right shrink-0 min-w-[88px]">
                <span className="block text-[14.5px] font-black text-[#0F1A30]" style={NUMS}>{r.result ? wonFmt(r.result.net) : "-"}</span>
                <span className="flex items-center justify-end gap-1 text-[12.5px] font-black text-[#5B6B85] whitespace-nowrap"><DiffTag cur={r.result?.net} prev={prevMap[r.u.id]?.result?.net} /><span className="w-1.5 h-1.5 rounded-full" style={{ background: ROW_DOT[rs] }} />{!r.slip && rs === "calc" ? "저장 전" : s[0]}</span>
              </span>
            </div>
          );
        })}
      </div>
      {/* 아래: 고른 직원 일괄 처리 · 합계 */}
      <div className="shrink-0 border-t border-[#E3E8F0] bg-white p-2.5 space-y-2">
        {checked.size > 0 && !ro && pm.st !== "paid" ? (
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" disabled={pm.busy || !checkedRows.some((r) => r.result && !r.locked)} onClick={() => pm.confirmRows(checkedRows)} className={`${bulkBtn} border border-[#1B2B4B] bg-white text-[#1B2B4B]`} data-testid="payroll-confirm">선택 확정 {checkedRows.filter((r) => r.result && !r.locked).length}</button>
            <button type="button" disabled={pm.busy || !checkedRows.some((r) => r.result && !r.slip?.published)} onClick={() => pm.publishRows(checkedRows)} className={`${bulkBtn} bg-[#1B2B4B] text-white`} data-testid="payroll-publish">선택 발행 {checkedRows.filter((r) => r.result && !r.slip?.published).length}</button>
          </div>
        ) : null}
        <div className="flex items-center justify-between text-[13.5px] font-bold text-[#5B6B85] px-0.5"><span>확정 <b className="text-[#0F1A30]" style={NUMS}>{nConfirmed}</b> · 발행 <b className="text-[#0F1A30]" style={NUMS}>{nPublished}</b> / {ready.length}명</span><span className="text-[#7A879C]">↑↓ 이동 · Enter 입력</span></div>
      </div>
    </div>
  );

  if (loading) return <div className={`${sec} py-16 text-center text-[15px] font-bold text-[#7A879C]`}>불러오는 중…</div>;
  if (!rows.length) return <div className={`${sec} py-16 text-center text-[15px] font-bold text-[#5B6B85]`}>이 달 대상 직원이 없어요. [직원 급여 설정]에서 직원을 먼저 확인해 주세요.</div>;
  const history = cur ? (pm.allSlips || []).filter((s) => s.uid === cur.u.id && s.ym !== ym).sort((a, b) => String(b.ym).localeCompare(String(a.ym))) : [];
  const idx = shown.findIndex((r) => r.u.id === cur?.u.id);
  const ws = cur && (
    <Workspace key={`${cur.u.id}_${ym}`} company={company} ym={ym} row={cur} ro={ro} busy={pm.busy} fit={fit} w3={w3} ledger2={ledger2} pane={pane} setPane={setPane} kinds={pm.kinds} history={history} rates={cur.rates || pm.curRates} runPayDate={pm.run?.payDate || pm.payDateDefault()}
      slipDoc={pm.slipDoc} onSave={(r) => pm.saveDraft([r])} onConfirm={(r) => pm.confirmRows([r])} onPublish={(r) => pm.publishRows([r])} onUnlock={(r) => pm.unlockRows([r])}
      onPrev={idx > 0 ? () => step(-1) : null} onNext={idx >= 0 && idx < shown.length - 1 ? () => step(1) : null} pos={idx >= 0 ? `${idx + 1}/${shown.length}` : ""} onDirty={(v) => { dirtyRef.current = v; }}
      onOpenList={fit ? null : () => setDrawer(true)} editRef={editRef} />
  );
  const foot = pm.run?.log?.length > 0 && <div className="text-[13px] font-bold text-[#7A879C] px-1 truncate" title={pm.run.log.map((l) => `${new Date(l.at).toLocaleString("ko-KR")} ${l.action}${l.detail ? `(${l.detail})` : ""}`).join("\n")}>처리 기록 · {pm.run.log.slice(-2).map((l) => `${new Date(l.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} ${l.action}`).join(" · ")}</div>;
  if (fit) {
    return (
      <div className={`h-full grid gap-3 ${w3 ? "grid-cols-[280px_minmax(0,1fr)_minmax(380px,0.62fr)]" : "grid-cols-[272px_minmax(0,1fr)]"}`} data-testid="payroll-run">
        <div className="min-h-0 min-w-0">{list}</div>
        {ws}
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="payroll-run">
      {drawer && (
        <div className="fixed inset-0 z-[9000] bg-[#0F1A30]/45 flex" onClick={() => setDrawer(false)}>
          <div className="w-[88vw] max-w-[340px] h-full bg-[#F4F6FA] p-2 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-1.5 py-1.5"><b className="text-[16px] text-[#0F1A30]">직원 목록</b><button type="button" onClick={() => setDrawer(false)} className="w-10 h-10 rounded-xl border border-[#DCE3EE] bg-white text-[#1B2B4B] font-black" aria-label="닫기">✕</button></div>
            <div className="flex-1 min-h-0 [&>div]:h-full [&>div]:max-h-none">{list}</div>
          </div>
        </div>
      )}
      {ws}
      {foot}
    </div>
  );
}

// ── 한 사람 급여 시트 ──
// 지급 항목 줄 ↔ 저장 구조: 직책수당·식대·자가운전보조금 = 직원 설정 칸 · 그 밖의 "매월" = allowances · 상여금·"이번 달" = 그 달 입력
let rowSeq = 0;
const rid = () => `r${(rowSeq += 1)}`;
function payRowsFrom(emp, input) {
  const out = [];
  if (toNum(emp.positionAllow)) out.push({ id: rid(), kind: "직책수당", amount: toNum(emp.positionAllow), scope: "fixed", taxable: true });
  if (toNum(emp.meal)) out.push({ id: rid(), kind: "식대", amount: toNum(emp.meal), scope: "fixed", taxable: false });
  if (toNum(emp.car)) out.push({ id: rid(), kind: "자가운전보조금", amount: toNum(emp.car), scope: "fixed", taxable: false });
  (emp.allowances || []).forEach((a) => out.push({ id: rid(), kind: a.label || "기타", amount: toNum(a.amount), scope: "fixed", taxable: a.taxable !== false, ordinary: a.ordinary !== false }));
  if (toNum(input.bonus)) out.push({ id: rid(), kind: "상여금", amount: toNum(input.bonus), scope: "month", taxable: true });
  (input.extraPays || []).forEach((p) => out.push({ id: rid(), kind: p.label || "기타", amount: toNum(p.amount), scope: "month", taxable: p.taxable !== false }));
  return out;
}
const dedRowsFrom = (input) => (input.extraDeducts || []).map((d) => ({ id: rid(), kind: d.label || "기타", amount: toNum(d.amount) }));
const rowLabel = (r, fb) => (r.kind === "기타" ? (String(r.name || "").trim() || fb) : r.kind);
function composeState(s) {
  const fixed = s.payRows.filter((r) => r.scope !== "month"); const mon = s.payRows.filter((r) => r.scope === "month");
  const sumK = (l, k) => l.filter((r) => r.kind === k).reduce((a, r) => a + toNum(r.amount), 0);
  const emp = {
    ...s.emp, positionAllow: sumK(fixed, "직책수당"), meal: sumK(fixed, "식대"), car: sumK(fixed, "자가운전보조금"),
    allowances: fixed.filter((r) => !FIXED_ONLY.includes(r.kind) && toNum(r.amount)).map((r) => ({ label: rowLabel(r, "기타수당"), amount: toNum(r.amount), taxable: r.taxable !== false, ordinary: r.ordinary !== false })),
  };
  const input = {
    ...s.input, bonus: sumK(mon, "상여금"),
    extraPays: mon.filter((r) => r.kind !== "상여금" && toNum(r.amount)).map((r) => ({ label: rowLabel(r, "기타지급"), amount: toNum(r.amount), taxable: r.taxable !== false })),
    extraDeducts: s.dedRows.filter((d) => toNum(d.amount)).map((d) => ({ label: rowLabel(d, "기타공제"), amount: toNum(d.amount) })),
  };
  return { emp, input };
}

// ⭐ 2026-11-07 연봉제 — 퇴직금 포함 여부 · 식대 포함 여부 + 월 급여 계산 내역
function AnnualBox({ emp, ro, setEmp, className = "col-span-2 md:col-span-3" }) {
  const a = annualBreakdown(emp);
  return (
    <div className={`${className} rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] p-3 space-y-2.5`} data-testid="annual-box">
      <div className="grid grid-cols-2 gap-2">
        <div><Label hint="13분의 1은 퇴직금 몫">퇴직금</Label><Sel disabled={ro} value={emp.annualSeverance ? "y" : "n"} onChange={(v) => setEmp("annualSeverance", v === "y")} options={[["n", "연봉에 없음(÷ 12)"], ["y", "연봉에 포함(÷ 13)"]]} testid="ed-annual-sev" /></div>
        <div><Label hint="식대·자가운전보조금">수당</Label><Sel disabled={ro} value={emp.annualMealIncluded ? "y" : "n"} onChange={(v) => setEmp("annualMealIncluded", v === "y")} options={[["n", "연봉과 별도"], ["y", "연봉에 포함"]]} testid="ed-annual-meal" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-bold text-[#3A4A66]" style={NUMS}>
        <span>연봉 <b className="text-[#0F1A30]">{wonFmt(a.annual)}</b></span><span>÷ {a.divisor}</span><span>= 월 <b className="text-[#0F1A30]">{wonFmt(a.monthlyTotal)}</b></span>
        {a.fixedIn > 0 && <><span>− 식대 등 {wonFmt(a.fixedIn)}</span><span>= 기본급 <b className="text-[#0F1A30]">{wonFmt(a.base)}</b></span></>}
        {a.severance && <span className="text-[#2D4C82]">· 퇴직금 몫 연 {wonFmt(a.severanceYear)}</span>}
      </div>
    </div>
  );
}

// 작은 두 칸 고르기(매월/이번 달 · 과세/비과세)
const Mini = ({ value, onChange, options, disabled, label }) => (
  <span className="inline-flex p-0.5 rounded-lg bg-[#EEF1F6]" role="radiogroup" aria-label={label}>
    {options.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={value === k} disabled={disabled} onClick={() => onChange(k)} className={`h-7 px-2 rounded-md text-[13px] font-black whitespace-nowrap disabled:cursor-not-allowed ${value === k ? "bg-white text-[#0F1A30] shadow-[0_1px_3px_rgba(15,26,48,0.15)]" : "text-[#7A879C]"} ${disabled && value !== k ? "opacity-50" : ""}`}>{l}</button>)}
  </span>
);
// 장부 한 줄(이름 · 설명 · 금액)
const LedgerLine = ({ label, sub, amount, minus = false, tag, right, testid }) => (
  <div className="px-3.5 py-2 flex items-center gap-2 min-h-[44px]" data-testid={testid}>
    <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 min-w-0"><span className="text-[14.5px] font-black text-[#0F1A30] truncate">{label}</span>{tag && <span className="h-5 px-1.5 rounded text-[12px] font-black bg-[#EEF3FC] text-[#2D4C82] inline-flex items-center whitespace-nowrap">{tag}</span>}</div>{sub && <div className="text-[13px] font-bold text-[#7A879C] truncate" title={typeof sub === "string" ? sub : undefined}>{sub}</div>}</div>
    {right}
    {amount !== undefined && <b className="text-[15px] text-[#0F1A30] text-right whitespace-nowrap min-w-[92px]" style={NUMS}>{minus && amount ? "−" : ""}{wonFmt(amount)}</b>}
  </div>
);
// 금액 칸(장부 안 — 작고 오른쪽 정렬)
const cellInp = "h-9 w-[118px] px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-right text-[14.5px] font-black text-[#0F1A30] outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#8FB0F0]/40 disabled:bg-[#F5F7FB] disabled:text-[#7A879C] shrink-0";
// 좁은 칸에서 명세서를 한 줄씩(인쇄 화면은 그대로)
const NARROW_SLIP_CSS = ".kp-pay-narrow .ps .hero{grid-template-columns:minmax(0,1fr)}.kp-pay-narrow .ps .hd{padding:16px}.kp-pay-narrow .ps .tt{font-size:19px}.kp-pay-narrow .ps .who{text-align:left}.kp-pay-narrow .ps .net .v{font-size:30px}.kp-pay-narrow .ps .cols{grid-template-columns:minmax(0,1fr)}";

function Workspace({ company, ym, row, ro: roIn, busy, fit, w3, ledger2, pane, setPane, kinds, history, rates, runPayDate, slipDoc, onSave, onConfirm, onPublish, onUnlock, onPrev, onNext, pos, onDirty, onOpenList, editRef }) {
  const u = row.u;
  const init = React.useMemo(() => {
    const emp = { ...EMP_BLANK, ...(row.emp || {}) };
    if (!emp.payAccount) { const a = userAccounts(u)[0]; if (a) emp.payAccount = a; }
    const input = { ...(row.input || {}) };
    return { emp, input, payRows: payRowsFrom(emp, input), dedRows: dedRowsFrom(input) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [s, setS] = React.useState(init);
  const [acctNew, setAcctNew] = React.useState(false);
  const [taxOpen, setTaxOpen] = React.useState(false);
  const [side, setSide] = React.useState("slip"); // 오른쪽 칸: 명세서 | 인건비 · 누계
  const [boxEl, boxRef] = React.useState(null);
  const cw = useWidth(boxEl); // 가운데 칸 폭
  const wideBox = cw >= 600; // 기본 칸 4줄 · 근무시간 6칸
  const twoLedger = ledger2 || cw >= 820; // 지급 | 공제 나란히
  const locked = row.locked;
  const ro = roIn || locked;
  const { emp, input } = composeState(s);
  const a = row.att || {};
  const result = locked ? row.result : empReady(emp) ? calcPayslipFull(emp, monthOf(input, a), rates) : null;
  const dirty = !locked && JSON.stringify(composeState(s)) !== JSON.stringify(composeState(init));
  React.useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  React.useEffect(() => () => onDirty?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps
  const empDirty = !locked && (!row.emp || JSON.stringify(cleanEmp(emp)) !== JSON.stringify(cleanEmp({ ...EMP_BLANK, ...row.emp })));
  const live = { ...row, emp, input, result, empDirty };
  const setEmp = (k, v) => setS((p) => ({ ...p, emp: { ...p.emp, [k]: v } }));
  const setIn = (k, v) => setS((p) => ({ ...p, input: { ...p.input, [k]: v } }));
  const setPay = (id, patch) => setS((p) => ({ ...p, payRows: p.payRows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const setDed = (id, patch) => setS((p) => ({ ...p, dedRows: p.dedRows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const st = rowStatus({ ...row, result });
  const payType = emp.payType || "monthly";
  const free = emp.employmentType === FREELANCE;
  const D = (k) => (result?.deductions || []).find((d) => d.key === k)?.amount || 0;

  // 지급 계좌 — 이 직원에게 저장된 계좌(직원 설정 · 회원 정보 · 지난 명세서)
  const accounts = [];
  [input.payAccount, emp.payAccount, ...userAccounts(u), ...history.map((h) => h.payAccount)].forEach((x) => { if (acctKey(x) && !accounts.some((y) => acctKey(y) === acctKey(x))) accounts.push(x); });
  const curAcct = input.payAccount || emp.payAccount || null;
  const pickAcct = (k) => {
    if (k === "__new") { setAcctNew(true); return; }
    setAcctNew(false);
    const x = accounts.find((y) => acctKey(y) === k) || null;
    setS((p) => ({ ...p, input: { ...p.input, payAccount: x }, emp: { ...p.emp, payAccount: x || p.emp.payAccount } }));
  };
  const editAcct = (patch) => { const x = { bank: "", acct: "", holder: u.name || "", ...(curAcct || {}), ...patch }; setS((p) => ({ ...p, input: { ...p.input, payAccount: x }, emp: { ...p.emp, payAccount: x } })); };

  // 수당 종류 — 현재 줄에 있는 이름도 목록에 넣는다
  const payGroups = (() => { const all = kinds.pay.flatMap(([, l]) => l); const extra = uniq(s.payRows.map((r) => r.kind)).filter((k) => !all.includes(k)); return [...kinds.pay, ["이 직원 항목", extra]]; })();
  const dedGroups = (() => { const all = kinds.deduct.flatMap(([, l]) => l); const extra = uniq(s.dedRows.map((r) => r.kind)).filter((k) => !all.includes(k)); return [...kinds.deduct, ["이 직원 항목", extra]]; })();
  const pickKind = (r, kind) => setPay(r.id, { kind, scope: FIXED_ONLY.includes(kind) ? "fixed" : MONTH_ONLY.includes(kind) ? "month" : r.scope, taxable: kinds.taxableOf(kind) });

  // ── 점검 메시지 ──
  const checks = [];
  (result?.warnings || []).filter((w) => /최저/.test(w)).forEach((w) => checks.push(["error", `최저임금 미달 — ${w}`]));
  if (!locked && !empReady(emp)) checks.push(["error", needMsg(payType)]);
  Object.entries(NONTAX_KINDS).forEach(([k, rk]) => { const amt = k === "식대" ? toNum(emp.meal) : toNum(emp.car); const cap = toNum(rates[rk]); if (cap && amt > cap) checks.push(["info", `비과세 한도 초과 — ${k} ${wonFmt(amt)}원 중 월 한도 ${wonFmt(cap)}원 초과분 ${wonFmt(amt - cap)}원은 과세로 계산됩니다`]); });
  const care = s.payRows.filter((r) => r.kind === "출산·보육수당" && r.taxable === false).reduce((x, r) => x + toNum(r.amount), 0);
  if (care > 200000) checks.push(["info", `비과세 한도 초과 — 출산·보육수당 비과세는 월 20만원까지입니다(${wonFmt(care - 200000)}원 초과). 초과분은 "과세"로 나눠 입력해 주세요`]);
  const otherNt = s.payRows.filter((r) => r.taxable === false && !["식대", "자가운전보조금", "출산·보육수당"].includes(r.kind)).map((r) => rowLabel(r, "기타"));
  if (otherNt.length) checks.push(["info", `비과세로 표시된 항목(${uniq(otherNt).join(", ")}) — 소득세법상 비과세 요건에 맞는지 확인해 주세요`]);
  if (!(u.birthDate || emp.birthDate)) checks.push(["info", "생년월일이 없습니다 — 급여명세서 필수 기재사항(근로기준법 시행령 27조의2)입니다. 위 기본 정보에서 입력하세요"]);
  if (a.missing) checks.push(["info", `출근기록 퇴근 누락 ${a.missing}일 — 정상 8시간으로 계산했습니다. 필요하면 시간을 고쳐 주세요`]);
  if (!acctKey(curAcct)) checks.push(["info", "지급 계좌가 없습니다 — 계좌를 고르거나 직접 입력하면 명세서에 표시됩니다"]);
  if (emp.employmentType === "일용직" && payType !== "daily") checks.push(["info", "일용직은 급여형태를 \"일급\"으로 두면 일용근로소득 원천세(2.7%)로 계산합니다"]);
  if ((result?.warnings || []).some((w) => /간이세액/.test(w))) checks.push(["info", TAX_NOTE]);

  // ── 최근 12개월 · 올해 누계 ──
  const hist12 = history.filter((h) => h.ym < ym).slice(0, 12);
  const yearRows = history.filter((h) => h.ym.slice(0, 4) === ym.slice(0, 4) && h.ym < ym && h.result);
  const ytd = (f) => yearRows.reduce((x, h) => x + (f(h.result) || 0), 0) + (result ? f(result) || 0 : 0);
  const taxOf = (r) => (r?.deductions || []).filter((d) => d.key === "tax" || d.key === "local").reduce((x, d) => x + d.amount, 0);

  const slipPreview = locked && row.slip ? row.slip : { ...slipDoc(live), result, ym, rates };
  const autoRows = (result?.earnings || []).filter((e) => ["base", "weekly", "ot", "night", "holiday"].includes(e.key));
  const hourField = (k, label, hint) => (
    <label key={k} className="block min-w-0"><span className="block text-[13px] font-black text-[#3A4A66] truncate">{label}</span><span className="block text-[12.5px] font-bold text-[#7A879C] truncate mb-1">{hint ?? `기록 ${a[k] ?? 0}`}</span>
      <span className="relative block"><input disabled={ro} inputMode="decimal" value={input[k] ?? ""} onChange={(e) => setIn(k, e.target.value.replace(/[^\d.]/g, ""))} placeholder={String(a[k] ?? 0)} className={`${numInp} !h-10 pr-8`} style={NUMS} data-testid={`hour-${k}`} />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-[#7A879C]">{k === "workDays" ? "일" : "h"}</span></span>
    </label>
  );
  const btn = "h-10 px-3 rounded-xl text-[14px] font-black disabled:opacity-40 whitespace-nowrap";
  const card = "rounded-2xl border border-[#E3E8F0] bg-white overflow-hidden";
  const cardHead = (en, title, right) => <div className="px-3.5 py-2.5 flex items-center gap-2 bg-[#F8FAFD] border-b border-[#EEF1F6]"><div className="min-w-0"><div className="text-[11px] font-extrabold tracking-[0.08em] text-[#4B6CB7]">{en}</div><div className="text-[15px] font-black text-[#0F1A30]">{title}</div></div><span className="flex-1" />{right}</div>;
  const del = (fn) => !ro && <button type="button" onClick={fn} aria-label="줄 삭제" className="h-7 px-2 rounded-md text-[13px] font-black text-[#7A879C] hover:text-[#B42318] hover:bg-[#FEF3F2]">삭제</button>;

  // 지급 항목
  const earnCard = (
    <div className={card} data-testid="pay-earnings">
      {cardHead("EARNINGS", "지급 항목", !ro && <button type="button" onClick={() => setS((p) => ({ ...p, payRows: [...p.payRows, { id: rid(), kind: "", amount: 0, scope: "month", taxable: true }] }))} className="h-8 px-2.5 rounded-lg bg-[#0F1A30] text-white text-[13.5px] font-black" data-testid="add-pay">+ 수당</button>)}
      <div className="divide-y divide-[#EEF1F6]">
        {autoRows.map((e) => <LedgerLine key={e.key} label={e.label} sub={e.calc} tag="자동" amount={e.amount} />)}
        {!autoRows.length && <LedgerLine label="기본급" sub="급여형태 · 금액을 넣으면 자동으로 계산돼요" amount={0} />}
        {s.payRows.map((r) => (
          <div key={r.id} className="px-3.5 py-2 space-y-1.5" data-testid="pay-row">
            <div className="flex items-center gap-2">
              <Sel disabled={ro} value={r.kind} onChange={(v) => pickKind(r, v)} placeholder="수당 종류 선택" groups={payGroups} ariaLabel="수당 종류" className="flex-1 min-w-0 [&_select]:!h-9 [&_select]:!text-[14.5px]" />
              <input disabled={ro} inputMode="numeric" value={toNum(r.amount) ? wonFmt(r.amount) : ""} onChange={(e) => setPay(r.id, { amount: toNum(e.target.value) })} onFocus={(e) => e.target.select()} placeholder="0" className={cellInp} style={NUMS} aria-label="금액" />
            </div>
            {r.kind === "기타" && <input disabled={ro} value={r.name || ""} onChange={(e) => setPay(r.id, { name: e.target.value })} placeholder="항목 이름(명세서에 표시)" className={`${inp} !h-9`} />}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Mini label="지급 구분" disabled={ro || FIXED_ONLY.includes(r.kind) || MONTH_ONLY.includes(r.kind)} value={r.scope} onChange={(v) => setPay(r.id, { scope: v })} options={[["fixed", "매월"], ["month", "이번 달"]]} />
              <Mini label="과세 구분" disabled={ro || MONTH_ONLY.includes(r.kind)} value={r.taxable === false ? "n" : "y"} onChange={(v) => setPay(r.id, { taxable: v === "y" })} options={[["y", "과세"], ["n", "비과세"]]} />
              <span className="flex-1" />
              {del(() => setS((p) => ({ ...p, payRows: p.payRows.filter((x) => x.id !== r.id) })))}
            </div>
          </div>
        ))}
        {!s.payRows.length && <div className="px-3.5 py-2.5 text-[13.5px] font-bold text-[#7A879C]">식대 · 직책수당 · 상여가 있으면 [+ 수당]을 눌러요</div>}
      </div>
      <div className="px-3.5 py-2.5 border-t-2 border-[#1B2B4B] flex items-center gap-2 bg-[#F8FAFD]"><span className="text-[14.5px] font-black text-[#0F1A30] whitespace-nowrap">지급 총액</span>{result && <span className="text-[13px] font-bold text-[#7A879C] truncate">과세 {wonFmt(result.taxable)} · 비과세 {wonFmt(result.nonTaxable)}</span>}<span className="flex-1" /><b className="text-[17px] text-[#0F1A30]" style={NUMS} data-testid="ed-gross">{wonFmt(result?.gross)}</b></div>
    </div>
  );
  // 공제 항목
  const dedCard = (
    <div className={card} data-testid="pay-deductions">
      {cardHead("DEDUCTIONS", "공제 항목", !ro && <button type="button" onClick={() => setS((p) => ({ ...p, dedRows: [...p.dedRows, { id: rid(), kind: "", amount: 0 }] }))} className="h-8 px-2.5 rounded-lg border border-[#1B2B4B] bg-white text-[13.5px] font-black text-[#1B2B4B]" data-testid="add-ded">+ 공제</button>)}
      <div className="divide-y divide-[#EEF1F6]">
        {[["np", "국민연금", "npExempt"], ["hi", "건강보험", "hiExempt"], ["ltc", "장기요양보험", null], ["ei", "고용보험", "eiExempt"]].map(([k, l, ex]) => (
          <LedgerLine key={k} label={l} sub={free ? "프리랜서는 적용 제외" : k === "ltc" ? "건강보험료 따라 계산" : (result?.deductions || []).find((d) => d.key === k)?.calc || "자동 계산"} amount={D(k)} minus
            right={ex ? <Mini label={`${l} 적용`} disabled={ro || free} value={emp[ex] || free ? "n" : "y"} onChange={(v) => setEmp(ex, v === "n")} options={[["y", "적용"], ["n", "제외"]]} /> : null} />
        ))}
        <LedgerLine label={free ? "사업소득세" : "소득세"} sub={`자동 ${wonFmt(result?.autoTax)} · 칸에 적으면 그 금액`} right={<input disabled={ro} inputMode="numeric" value={input.taxOverride ?? ""} onChange={(e) => setIn("taxOverride", e.target.value.replace(/[^\d]/g, ""))} placeholder={wonFmt(D("tax"))} className={cellInp} style={NUMS} data-testid="ed-tax" aria-label="소득세 직접 입력" />} />
        <LedgerLine label="지방소득세" sub="소득세 × 10%" right={<input disabled={ro} inputMode="numeric" value={input.localTaxOverride ?? ""} onChange={(e) => setIn("localTaxOverride", e.target.value.replace(/[^\d]/g, ""))} placeholder={wonFmt(D("local"))} className={cellInp} style={NUMS} aria-label="지방소득세 직접 입력" />} />
        {s.dedRows.map((r) => (
          <div key={r.id} className="px-3.5 py-2 space-y-1.5" data-testid="ded-row">
            <div className="flex items-center gap-2">
              <Sel disabled={ro} value={r.kind} onChange={(v) => setDed(r.id, { kind: v })} placeholder="공제 종류 선택" groups={dedGroups} ariaLabel="공제 종류" className="flex-1 min-w-0 [&_select]:!h-9 [&_select]:!text-[14.5px]" />
              <input disabled={ro} inputMode="numeric" value={toNum(r.amount) ? wonFmt(r.amount) : ""} onChange={(e) => setDed(r.id, { amount: toNum(e.target.value) })} onFocus={(e) => e.target.select()} placeholder="0" className={cellInp} style={NUMS} aria-label="공제 금액" />
            </div>
            {(r.kind === "기타" || !ro) && <div className="flex items-center gap-1.5">{r.kind === "기타" && <input disabled={ro} value={r.name || ""} onChange={(e) => setDed(r.id, { name: e.target.value })} placeholder="항목 이름" className={`${inp} !h-9 flex-1`} />}<span className="flex-1" />{del(() => setS((p) => ({ ...p, dedRows: p.dedRows.filter((x) => x.id !== r.id) })))}</div>}
          </div>
        ))}
      </div>
      <div className="px-3.5 py-2.5 border-t-2 border-[#1B2B4B] flex items-center gap-2 bg-[#F8FAFD]"><span className="text-[14.5px] font-black text-[#0F1A30] whitespace-nowrap">공제 총액</span><span className="text-[13px] font-bold text-[#7A879C] truncate">4대보험 · 세금 · 기타</span><span className="flex-1" /><b className="text-[17px] text-[#0F1A30]" style={NUMS}>{result?.totalDeduct ? "−" : ""}{wonFmt(result?.totalDeduct)}</b></div>
    </div>
  );

  const editor = (
    <div ref={boxRef} className="space-y-3 min-w-0" onKeyDown={enterNext} data-pay-editor data-testid="pay-editor">
      {/* 기본 */}
      <div className={card}>
        {cardHead("BASE PAY", <>급여 기본 <span className="text-[13px] font-bold text-[#7A879C]">· 직원 급여 설정에도 저장돼요</span></>)}
        <div className={`p-3.5 grid gap-2.5 ${wideBox ? "grid-cols-4" : "grid-cols-2"}`}>
          <div><Label>급여형태</Label><Sel disabled={ro} value={payType} onChange={(v) => setEmp("payType", v)} options={PAY_TYPES.map(([k, l]) => [k, `${l}제`])} testid="ed-paytype" /></div>
          <div><Label>고용형태</Label><Sel disabled={ro} value={emp.employmentType || "정규직"} onChange={(v) => setEmp("employmentType", v)} options={EMP_TYPES} testid="ed-emptype" /></div>
          <div className="col-span-2">
            {payType === "hourly" ? <><Label hint={`최저 ${wonFmt(rates.minWage)}원`}>시급</Label><Money disabled={ro} value={emp.hourlyWage} onChange={(v) => setEmp("hourlyWage", v)} testid="ed-base" /></>
              : payType === "daily" ? <><Label hint={`최저 ${wonFmt(rates.minWage * 8)}원(8h)`}>일급</Label><Money disabled={ro} value={emp.dailyWage} onChange={(v) => setEmp("dailyWage", v)} testid="ed-base" /></>
                : payType === "annual" ? <><Label hint="1년 총액">연봉</Label><Money disabled={ro} value={emp.annualSalary} onChange={(v) => setEmp("annualSalary", v)} testid="ed-base" /></>
                  : <><Label hint="월 소정근로 기준">월 기본급</Label><Money disabled={ro} value={emp.baseMonthly} onChange={(v) => setEmp("baseMonthly", v)} testid="ed-base" /></>}
          </div>
          {payType === "annual" && <AnnualBox emp={emp} ro={ro} setEmp={setEmp} className={wideBox ? "col-span-4" : "col-span-2"} />}
          <div><Label hint={`기본 ${runPayDate}`}>지급일</Label><CustomDatePicker disabled={ro} value={input.payDate || runPayDate} onChange={(e) => setIn("payDate", e.target.value)} className={`${inp} text-left`} showIcon /></div>
          <div><Label hint={u.birthDate ? "회원 정보" : "명세서 필수"}>생년월일</Label>{u.birthDate ? <div className={`${inp} flex items-center bg-[#F5F7FB]`} style={NUMS}>{u.birthDate}</div> : <CustomDatePicker disabled={ro} value={emp.birthDate || ""} onChange={(e) => setEmp("birthDate", e.target.value)} placeholder="입력" className={`${inp} text-left`} showIcon />}</div>
          <div className="col-span-2"><Label hint={accounts.length ? `저장된 계좌 ${accounts.length}개` : "저장된 계좌 없음"}>지급 계좌</Label>
            <Sel disabled={ro} value={acctNew ? "__new" : acctKey(curAcct)} onChange={pickAcct} placeholder="계좌 선택 안 함" options={[...accounts.map((x) => [acctKey(x), acctText(x)]), ["__new", "+ 새 계좌 직접 입력"]]} testid="ed-account" /></div>
          {(acctNew || (curAcct && !accounts.some((y) => acctKey(y) === acctKey(curAcct)))) && !ro && (
            <div className={`${wideBox ? "col-span-4" : "col-span-2"} grid grid-cols-2 md:grid-cols-[180px_minmax(0,1fr)_140px] gap-2 rounded-xl bg-[#F5F8FD] p-2.5`}>
              <Sel value={curAcct?.bank || ""} onChange={(v) => editAcct({ bank: v })} placeholder="은행 선택" options={BANK_NAMES} testid="ed-bank" />
              <input inputMode="numeric" value={curAcct?.acct ? formatAccount(curAcct.bank, curAcct.acct) : ""} onChange={(e) => editAcct({ acct: onlyDigits(e.target.value) })} placeholder="계좌번호" className={`${inp} col-span-2 md:col-span-1 order-3 md:order-none`} style={NUMS} />
              <input value={curAcct?.holder || ""} onChange={(e) => editAcct({ holder: e.target.value })} placeholder="예금주" className={inp} />
            </div>
          )}
        </div>
      </div>

      {/* 근무시간 */}
      <div className={card}>
        {cardHead("HOURS · ATTENDANCE", <>근무시간 <span className="text-[13px] font-bold text-[#7A879C]">· 비우면 출근기록부 값</span></>, !ro && <button type="button" onClick={() => setS((p) => { const n = { ...p.input }; ["workDays", "regularHours", "otHours", "nightHours", "holHours", "holOverHours"].forEach((k) => delete n[k]); return { ...p, input: n }; })} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[13.5px] font-black text-[#1B2B4B]">출근기록 값으로</button>)}
        <div className={`p-3.5 grid gap-2 ${wideBox ? "grid-cols-6" : "grid-cols-3"}`}>
          {hourField("workDays", "근로일수")}
          {payType === "hourly" && hourField("regularHours", "정상 근로")}
          {payType === "daily" && <div className="min-w-0"><span className="block text-[13px] font-black text-[#3A4A66]">정상 근로</span><span className="block text-[12.5px] font-bold text-[#7A879C] mb-1">근로일수 × 8h</span><div className={`${numInp} !h-10 flex items-center justify-end bg-[#F5F7FB]`} style={NUMS}>{toNum(!blank(input.workDays) ? input.workDays : a.workDays) * 8}h</div></div>}
          {hourField("otHours", "연장근로")}
          {hourField("nightHours", "야간 22~06시")}
          {hourField("holHours", "휴일 8h 이내")}
          {hourField("holOverHours", "휴일 8h 초과")}
          {payType !== "monthly" && <label className="block min-w-0"><span className="block text-[13px] font-black text-[#3A4A66]">주휴시간</span><span className="block text-[12.5px] font-bold text-[#7A879C] mb-1">주 15h 이상</span><input disabled={ro} inputMode="decimal" value={input.weeklyHolidayHours ?? ""} onChange={(e) => setIn("weeklyHolidayHours", e.target.value.replace(/[^\d.]/g, ""))} className={`${numInp} !h-10`} style={NUMS} placeholder="0" /></label>}
        </div>
      </div>

      {/* 지급 | 공제 장부 */}
      <div className={`grid gap-3 items-start ${twoLedger && cw >= 760 ? "grid-cols-2" : "grid-cols-1"}`}>{earnCard}{dedCard}</div>

      {/* 실지급 */}
      {result && (
        <div className="rounded-2xl bg-[#0F1A30] text-white px-4 py-3 flex items-center gap-x-3 gap-y-1 flex-wrap" style={NUMS}>
          <span className="text-[14px] font-bold text-white/70">지급 <b className="text-white">{wonFmt(result.gross)}</b> − 공제 <b className="text-white">{wonFmt(result.totalDeduct)}</b></span>
          <span className="flex-1" />
          <span className="text-[14px] font-black text-[#8FB0F0]">실지급액</span><b className="text-[22px]" data-testid="ed-net">{wonFmt(result.net)}원</b>
        </div>
      )}

      {/* 세금 · 보험 기준(접기) */}
      <div className={card}>
        <button type="button" onClick={() => setTaxOpen((v) => !v)} aria-expanded={taxOpen} className="w-full px-3.5 py-2.5 flex items-center gap-2 text-left bg-[#F8FAFD]" data-testid="tax-basis">
          <div className="min-w-0"><div className="text-[11px] font-extrabold tracking-[0.08em] text-[#4B6CB7]">TAX · INSURANCE BASIS</div><div className="text-[15px] font-black text-[#0F1A30]">세금 · 보험 기준</div></div>
          <span className="flex-1 text-right text-[13.5px] font-bold text-[#5B6B85] truncate">부양가족 {Math.max(0, (toNum(emp.dependents) || 1) - 1)}명 · 자녀 {toNum(emp.children)}명 · {toNum(emp.taxRatePct) || 100}%{emp.taxFixed ? ` · 고정 세액 ${wonFmt(emp.taxFixed)}` : ""}</span>
          <span className="text-[#5B6B85] font-black">{taxOpen ? "▴" : "▾"}</span>
        </button>
        {taxOpen && (
          <div className="p-3.5 space-y-2.5 border-t border-[#EEF1F6]">
            <div className={`grid gap-2.5 ${wideBox ? "grid-cols-4" : "grid-cols-2"}`}>
              <div><Label hint="본인 제외">부양가족</Label><Sel disabled={ro || free} value={String(Math.max(0, (toNum(emp.dependents) || 1) - 1))} onChange={(v) => setEmp("dependents", toNum(v) + 1)} options={N0_10.map((n) => [String(n), `${n}명`])} testid="ed-dependents" /></div>
              <div><Label hint="8~20세">자녀</Label><Sel disabled={ro || free} value={String(toNum(emp.children))} onChange={(v) => setEmp("children", toNum(v))} options={N0_10.map((n) => [String(n), `${n}명`])} testid="ed-children" /></div>
              <div><Label>세액 비율</Label><Sel disabled={ro || free} value={String(toNum(emp.taxRatePct) || 100)} onChange={(v) => setEmp("taxRatePct", toNum(v))} options={TAX_RATES.map((p) => [String(p), `${p}%`])} testid="ed-taxrate" /></div>
              <div><Label hint="간이세액표">고정 세액(월)</Label><input disabled={ro || free} inputMode="numeric" value={emp.taxFixed ?? ""} onChange={(e) => setEmp("taxFixed", e.target.value.replace(/[^\d]/g, ""))} placeholder="자동" className={numInp} style={NUMS} /></div>
              <div className="col-span-2"><Label hint="비우면 과세급여">국민연금 기준소득월액</Label><Money disabled={ro || free || emp.npExempt} value={emp.npBase} onChange={(v) => setEmp("npBase", v || "")} placeholder={`자동 ${wonFmt(result?.npBase)}`} /></div>
              <div className="col-span-2"><Label hint="비우면 과세급여">건강보험 보수월액</Label><Money disabled={ro || free || emp.hiExempt} value={emp.hiBase} onChange={(v) => setEmp("hiBase", v || "")} placeholder={`자동 ${wonFmt(result?.hiBase)}`} /></div>
            </div>
            {result && <div className="text-[13.5px] font-bold text-[#5B6B85]">{(result.deductions || []).filter((d) => d.key === "tax").map((d) => d.calc)} → 소득세 <b className="text-[#0F1A30]" style={NUMS}>{wonFmt(D("tax"))}</b> · 지방소득세 <b className="text-[#0F1A30]" style={NUMS}>{wonFmt(D("local"))}</b></div>}
          </div>
        )}
      </div>
      <div><Label>비고 <span className="font-bold text-[#7A879C]">(명세서에 표시)</span></Label><input disabled={ro} value={input.memo || ""} onChange={(e) => setIn("memo", e.target.value)} className={inp} placeholder="예: 11월 성과 반영" /></div>

      {/* 점검 */}
      {checks.length > 0 && <div className="space-y-1.5" data-testid="pay-checks">{checks.map(([k, m]) => <Note key={m} kind={k}>{m}</Note>)}</div>}
    </div>
  );

  // 오른쪽: 회사 부담 · 누계
  const costNode = (
    <div className="space-y-3">
      {result && (
        <div className={card}>
          {cardHead("EMPLOYER COST", "회사 부담(인건비)")}
          <div className="divide-y divide-[#EEF1F6]">
            {[["국민연금", result.employer?.np], ["건강보험", result.employer?.hi], ["장기요양", result.employer?.ltc], ["고용보험(+고용안정)", result.employer?.ei], ["산재보험", result.employer?.ia]].map(([l, v]) => <LedgerLine key={l} label={l} amount={v} />)}
          </div>
          <div className="px-3.5 py-2.5 border-t-2 border-[#1B2B4B] bg-[#F8FAFD] space-y-1">
            <div className="flex justify-between text-[14px] font-black text-[#0F1A30]"><span>회사 부담 합계</span><span style={NUMS}>{wonFmt(result.employer?.total)}</span></div>
            <div className="flex justify-between items-baseline text-[14.5px] font-black text-[#0F1A30]"><span>총 인건비 <span className="text-[13px] font-bold text-[#7A879C]">지급 총액 + 회사 부담</span></span><b className="text-[17px]" style={NUMS}>{wonFmt(result.costTotal ?? (result.gross + (result.employer?.total || 0)))}</b></div>
          </div>
        </div>
      )}
      <div className={card}>
        {cardHead("HISTORY · YTD", `최근 12개월 · ${ym.slice(0, 4)}년 누계`)}
        <div className="p-3.5 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            {[["지급 누계", ytd((r) => r.gross)], ["공제 누계", ytd((r) => r.totalDeduct)], ["원천세 누계", ytd(taxOf)], ["실지급 누계", ytd((r) => r.net)]].map(([l, v]) => <div key={l} className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2"><div className="text-[13px] font-bold text-[#5B6B85]">{l}</div><div className="text-[16px] font-black text-[#0F1A30] text-right" style={NUMS}>{wonFmt(v)}</div></div>)}
          </div>
          <div className="text-[13px] font-bold text-[#7A879C]">누계 = {ym.slice(0, 4)}년 지난 달 명세서 {yearRows.length}건 + 이번 달(화면 값)</div>
          {hist12.length ? (
            <div className="overflow-x-auto rounded-xl border border-[#E3E8F0]">
              <table className="w-full text-[14px]">
                <thead><tr className="bg-[#F5F8FD] text-[#3A4A66] font-black">{["귀속 월", "지급", "실지급", "상태"].map((h, i) => <th key={h} className={`px-2.5 py-2 whitespace-nowrap ${i && i < 3 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[#EEF1F6]">
                  {hist12.map((h) => <tr key={h.id}><td className="px-2.5 py-2 font-black text-[#0F1A30] whitespace-nowrap" style={NUMS}>{h.ym.slice(2).replace("-", ".")}</td><td className="px-2.5 py-2 text-right font-bold" style={NUMS}>{wonFmt(h.result?.gross)}</td><td className="px-2.5 py-2 text-right font-black text-[#0F1A30]" style={NUMS}>{wonFmt(h.result?.net)}</td><td className="px-2.5 py-2"><RowChip st={rowStatus({ result: h.result, slip: h })} compact /></td></tr>)}
                </tbody>
              </table>
            </div>
          ) : <div className="text-[14px] font-bold text-[#7A879C]">지난 명세서가 없어요</div>}
        </div>
      </div>
    </div>
  );
  const slipNode = (
    <div className="space-y-3">
      {result ? <div className={`kp-payslip-pane rounded-2xl bg-white p-3 shadow-[0_6px_18px_rgba(15,26,48,0.08)] ${w3 ? "kp-pay-narrow" : ""}`}><style>{NARROW_SLIP_CSS}</style><PayslipView slip={slipPreview} company={company} /></div>
        : <div className="py-16 text-center text-[15px] font-bold text-[#5B6B85]">기본급(또는 시급 · 일급)을 넣으면 명세서가 나타나요</div>}
      {result && result.taxMode === "auto" && <Note>소득세는 {TAX_NOTE}입니다.</Note>}
      {locked && <Note>{row.slip?.status === "paid" ? `지급 완료(${row.slip?.paidDate || "-"}) — 고칠 수 없어요` : "확정(잠금)된 명세서예요 — 고치려면 [확정 해제]"}</Note>}
    </div>
  );

  // 가운데 칸 머리(직원) · 아래(실지급 + 버튼)
  const navBtn = "w-9 h-9 rounded-xl border border-[#DCE3EE] bg-white text-[16px] font-black text-[#1B2B4B] disabled:opacity-30";
  const head = (
    <div className="shrink-0 px-4 py-3 border-b border-[#EEF1F6] bg-white flex items-center gap-3 flex-wrap">
      {onOpenList && <button type="button" onClick={onOpenList} className="h-9 px-3 rounded-xl border border-[#1B2B4B] bg-white text-[14px] font-black text-[#1B2B4B]" data-testid="open-emp-drawer">☰ 직원</button>}
      <span className="w-11 h-11 rounded-2xl bg-[#0F1A30] text-white grid place-items-center text-[18px] font-black shrink-0">{String(u.name || "?").slice(0, 1)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap"><b className="text-[18px] text-[#0F1A30]">{personName(u) || u.name}</b><RowChip st={st} unsaved={!row.slip} />{dirty && <span className="h-7 px-2.5 rounded-lg text-[13.5px] font-black inline-flex items-center border border-[#2D4C82] text-[#2D4C82]">수정 중 · 저장 안 됨</span>}</div>
        <div className="text-[13.5px] font-bold text-[#5B6B85] truncate">{[u.team, u.position, u.employmentStatus || "재직", u.hireDate ? `입사 ${u.hireDate}` : "", u.phone || u.mobile || ""].filter(Boolean).join(" · ")}</div>
      </div>
      {!w3 && <Seg value={pane} onChange={setPane} options={[["edit", "입력"], ["preview", "명세서"], ["cost", "인건비 · 누계"]]} testid="pay-pane" />}
      <div className="flex items-center gap-1 shrink-0"><button type="button" disabled={!onPrev} onClick={onPrev || undefined} className={navBtn} aria-label="이전 직원">‹</button>{pos && <span className="text-[13px] font-bold text-[#7A879C] min-w-[40px] text-center" style={NUMS}>{pos}</span>}<button type="button" disabled={!onNext} onClick={onNext || undefined} className={navBtn} aria-label="다음 직원">›</button></div>
    </div>
  );
  const actions = (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      <button type="button" disabled={!result} onClick={() => printPayslips([slipPreview], company)} className={`${btn} border border-[#DCE3EE] bg-white text-[#1B2B4B]`} data-testid="slip-print" title="인쇄하거나 PDF로 저장">인쇄</button>
      {!roIn && !locked && <button type="button" disabled={busy || !result} onClick={() => onSave(live)} className={`${btn} border border-[#1B2B4B] bg-white text-[#1B2B4B]`} data-testid="slip-save" title={dirty ? "고친 내용을 저장" : "계산된 값 그대로 저장"}>저장</button>}
      {!roIn && !locked && <button type="button" disabled={busy || !result} onClick={() => onConfirm(live)} className={`${btn} bg-[#1B2B4B] text-white`} data-testid="slip-confirm">확정</button>}
      {!roIn && row.slip?.status !== "paid" && !row.slip?.published && <button type="button" disabled={busy || !result} onClick={() => onPublish(live)} className={`${btn} bg-[#0F1A30] text-white`} data-testid="slip-publish">발행</button>}
      {!roIn && row.slip?.status === "confirmed" && <button type="button" disabled={busy} onClick={() => onUnlock(row)} className={`${btn} border border-[#DCE3EE] bg-white text-[#3A4A66]`}>확정 해제</button>}
    </div>
  );
  const bottom = (
    <div className={`shrink-0 px-4 py-2.5 border-t border-[#E3E8F0] bg-white/95 backdrop-blur flex items-center gap-x-3 gap-y-2 flex-wrap ${fit ? "" : "sticky bottom-2 z-10 rounded-2xl border shadow-[0_10px_30px_rgba(15,26,48,0.16)]"}`}>
      <span className="text-[14px] font-bold text-[#5B6B85] whitespace-nowrap">실지급 <b className="text-[19px] text-[#0F1A30] ml-1" style={NUMS}>{result ? wonFmt(result.net) : "-"}</b><span className="text-[#0F1A30] font-black">원</span></span>
      <span className="flex-1" />
      {actions}
    </div>
  );
  const body = !w3 && pane === "preview" ? slipNode : !w3 && pane === "cost" ? costNode : editor;
  if (fit) {
    return (
      <>
        <div ref={editRef} className={`${sec} overflow-hidden flex flex-col min-h-0 min-w-0`} data-testid="pay-sheet">
          {head}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 bg-[#FBFCFE]">{body}</div>
          {bottom}
        </div>
        {w3 && (
          <div className={`${sec} overflow-hidden flex flex-col min-h-0 min-w-0`} data-testid="pay-preview">
            <div className="shrink-0 px-3.5 py-2.5 border-b border-[#EEF1F6] flex items-center gap-2">
              <Seg value={side} onChange={setSide} options={[["slip", "명세서 미리보기"], ["cost", "인건비 · 누계"]]} testid="pay-side" />
              <span className="flex-1" />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 bg-[#F4F6FA]">{side === "slip" ? slipNode : costNode}</div>
          </div>
        )}
      </>
    );
  }
  return (
    <div ref={editRef} className="space-y-3 min-w-0">
      <div className={`${sec} overflow-hidden`}>{head}</div>
      {body}
      {bottom}
    </div>
  );
}

// ── 직원 급여 설정 ──
// ⭐ 2026-11-07 2칸 화면 — 왼쪽: 검색 + 필터(부서·직책·재직·급여형태·상태) 목록 / 오른쪽: 고른 직원 상세(기본 급여 · 수당 · 소득세 · 4대보험 · 계좌 · 근로계약서)
//  모바일·좁은 화면: 목록 → 고르면 상세(뒤로)
// ⭐ 2026-11-17 급여 한 판 — 머리 카드 없앰 · 고른 직원은 [월 급여 계산]과 같이 씀(selId) · 넓은 화면은 화면 높이에 맞춰 칸마다 스크롤
function PayEmployees({ company, ro, fit = false, selId: selIdIn = null, setSelId: setSelIdIn = null }) {
  const wide = useMedia("(min-width: 1100px)");
  const staff = useStaff(company);
  const emps = useCol("payrollEmployees", company);
  const settings = usePayrollSettings(company);
  const hr = useHrOptions(company);
  const kinds = useItemKinds(settings, emps, null);
  const rates = ratesFor(settings || {}, Number(kstYm().slice(0, 4)));
  const map = Object.fromEntries((emps || []).map((e) => [e.uid, e]));
  const [selLocal, setSelLocal] = React.useState(null);
  const selId = setSelIdIn ? selIdIn : selLocal;
  const setSelId = setSelIdIn || setSelLocal;
  const [fId, setFId] = React.useState(null); // 지금 폼에 열린 직원
  const [f, setF] = React.useState(null);
  const [base, setBase] = React.useState(null);
  const [flt, setFlt] = React.useState({ q: "", team: "", position: "", emp: "재직", payType: "", st: "" });
  const [busy, setBusy] = React.useState(false);
  const [paneTab, setPaneTab] = React.useState("pay");
  const all = (staff || []).filter((u) => u.employmentStatus !== "퇴사" || map[u.id]);
  const q = flt.q.trim();
  const list = all.filter((u) => !q || [personName(u), u.name, u.team, u.position, u.phone].some((v) => String(v || "").includes(q)))
    .filter((u) => !flt.team || u.team === flt.team)
    .filter((u) => !flt.position || u.position === flt.position)
    .filter((u) => !flt.emp || (u.employmentStatus || "재직") === flt.emp)
    .filter((u) => !flt.payType || (map[u.id] && (map[u.id].payType || "monthly") === flt.payType))
    .filter((u) => !flt.st || (flt.st === "done" ? empReady(map[u.id]) : !empReady(map[u.id])))
    .sort((a, b) => String(a.team || "").localeCompare(String(b.team || ""), "ko") || String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  const sel = (fId && all.find((u) => u.id === fId)) || null;
  const open = (u) => { setSelId(u.id); setFId(u.id); const e = { ...EMP_BLANK, ...(map[u.id] || {}) }; if (!e.payAccount) e.payAccount = userAccounts(u)[0] || null; setF(e); setBase(JSON.stringify(cleanEmp(e))); setPaneTab("pay"); };
  // 넓은 화면은 첫 직원을 바로 연다 · 다른 탭에서 고른 직원이 있으면 그 사람
  React.useEffect(() => { if (!emps || staff === null) return; const t = (selId && all.find((u) => u.id === selId)) || (wide && !selId ? list[0] : null); if (t && fId !== t.id) open(t); }); // eslint-disable-line react-hooks/exhaustive-deps
  // 다른 곳(근로계약서 올리기)에서 바뀐 파일 목록 반영
  React.useEffect(() => { if (selId && f && map[selId]?.contractFiles !== f.contractFiles) setF((p) => (p ? { ...p, contractFiles: map[selId]?.contractFiles } : p)); }, [emps]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const dirty = !!f && base !== JSON.stringify(cleanEmp(f));
  const save = async () => {
    if (!empReady(f)) return alert(`${needMsg(f.payType)}.`);
    setBusy(true);
    try {
      await setDoc(doc(db, "payrollEmployees", empId(company, sel.id)), { ...cleanEmp(f), companyName: company, uid: sel.id, name: personName(sel) || sel.name || "", updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "" }, { merge: true });
      setBase(JSON.stringify(cleanEmp(f)));
    } catch (e) { alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const preview = f && empReady(f) ? calcPayslipFull(f, { regularHours: f.payType === "hourly" ? rates.monthlyHours : 0, workDays: f.payType === "daily" ? 22 : 0 }, rates) : null;
  const money = (k, label, hint) => <div><Label hint={hint}>{label}</Label><Money disabled={ro} value={f[k]} onChange={(v) => set(k, v)} testid={`emp-${k}`} /></div>;
  const yn = (k, label) => <div><Label>{label}</Label><Sel disabled={ro} value={f[k] ? "n" : "y"} onChange={(v) => set(k, v === "n")} options={[["y", "적용"], ["n", "제외"]]} /></div>;
  const acct = f?.payAccount || { bank: "", acct: "", holder: "" };
  const setAcct = (patch) => set("payAccount", { ...acct, ...patch });
  const teamOpts = uniq([...(hr.teams || []), ...all.map((u) => u.team)]);
  const posOpts = uniq([...(hr.exec || []), ...(hr.normal || []), ...all.map((u) => u.position)]);
  const statusOpts = uniq([...EMPLOYMENT_STATUS_OPTIONS, ...all.map((u) => u.employmentStatus)]);
  const nDone = all.filter((u) => empReady(map[u.id])).length;

  const listNode = (
    <div className={`${sec} overflow-hidden min-w-0 flex flex-col ${fit && wide ? "h-full" : wide ? "sticky top-0 self-start" : ""}`} data-testid="payemp-list">
      <div className="p-3 space-y-2 border-b border-[#EEF1F6] shrink-0">
        <div className="relative">
          <input value={flt.q} onChange={(e) => setFlt((x) => ({ ...x, q: e.target.value }))} placeholder="이름 · 부서 · 직책 · 연락처" className={`${inp} pl-10`} aria-label="직원 검색" data-testid="payemp-search" />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6B85" strokeWidth="2.6" className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Sel value={flt.team} onChange={(v) => setFlt((x) => ({ ...x, team: v }))} placeholder="부서 전체" options={teamOpts} ariaLabel="부서" />
          <Sel value={flt.position} onChange={(v) => setFlt((x) => ({ ...x, position: v }))} placeholder="직책 전체" options={posOpts} ariaLabel="직책" />
          <Sel value={flt.emp} onChange={(v) => setFlt((x) => ({ ...x, emp: v }))} placeholder="재직상태 전체" options={statusOpts} ariaLabel="재직상태" />
          <Sel value={flt.payType} onChange={(v) => setFlt((x) => ({ ...x, payType: v }))} placeholder="급여형태 전체" options={PAY_TYPES.map(([k, l]) => [k, `${l}제`])} ariaLabel="급여형태" testid="payemp-flt-pay" />
        </div>
        <Seg value={flt.st} onChange={(v) => setFlt((x) => ({ ...x, st: v }))} options={[["", `전체 ${all.length}`], ["done", `완료 ${nDone}`], ["need", `필요 ${all.length - nDone}`]]} className="w-full [&>button]:flex-1" />
      </div>
      <div className={`divide-y divide-[#EEF1F6] overflow-y-auto overscroll-contain ${fit && wide ? "flex-1 min-h-0" : wide ? "max-h-[calc(100vh-430px)] min-h-[300px]" : ""}`}>
        {staff === null || emps === null ? <div className="py-12 text-center text-[15px] font-bold text-[#7A879C]">불러오는 중…</div> : !list.length ? <div className="py-12 text-center text-[15px] font-bold text-[#7A879C]">조건에 맞는 직원이 없어요</div> : list.map((u) => {
          const e = map[u.id]; const on = sel?.id === u.id;
          return (
            <button key={u.id} type="button" onClick={() => open(u)} className={`w-full text-left px-3.5 py-2.5 flex items-center gap-2.5 ${on ? "bg-[#EEF3FC] shadow-[inset_4px_0_0_#1B2B4B]" : "hover:bg-[#F8FAFD]"}`} data-testid="payemp-row">
              <span className="w-9 h-9 rounded-xl bg-[#1B2B4B] text-white grid place-items-center text-[15px] font-black shrink-0">{String(u.name || "?").slice(0, 1)}</span>
              <span className="flex-1 min-w-0"><span className="block text-[15px] font-black text-[#0F1A30] truncate">{personName(u) || u.name}</span><span className="block text-[14px] font-bold text-[#5B6B85] truncate">{[u.team, u.position, e ? `${payTypeLabel(e.payType)}제` : ""].filter(Boolean).join(" · ") || "-"}</span></span>
              {empReady(e) ? <span className="text-right text-[14.5px] font-black text-[#0F1A30] whitespace-nowrap" style={NUMS}>{payText(e)}</span>
                : <span className="h-7 px-2.5 rounded-lg bg-[#F2F4F7] text-[#3A4A66] text-[14px] font-black inline-flex items-center whitespace-nowrap">설정 필요</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  const detail = sel && f ? (
    <div className={`space-y-3 min-w-0 ${fit && wide ? "h-full overflow-y-auto overscroll-contain pr-1 -mr-1" : ""}`} onKeyDown={enterNext} data-testid="payemp-detail">
      <div className={`${sec} px-4 py-3.5`}>
        <div className="flex items-center gap-3 flex-wrap">
          {!wide && <button type="button" onClick={() => { setSelId(null); setFId(null); }} className="w-10 h-10 rounded-xl border border-[#DCE3EE] bg-white text-[16px] font-black text-[#1B2B4B]" aria-label="목록으로">‹</button>}
          <span className="w-12 h-12 rounded-2xl bg-[#0F1A30] text-white grid place-items-center text-[19px] font-black shrink-0">{String(sel.name || "?").slice(0, 1)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap"><b className="text-[19px] text-[#0F1A30]">{personName(sel) || sel.name}</b>{dirty && <span className="h-7 px-2.5 rounded-lg text-[14px] font-black inline-flex items-center border border-[#2D4C82] text-[#2D4C82]">수정 중 · 저장 안 됨</span>}</div>
            <div className="text-[14px] font-bold text-[#5B6B85] truncate">{[sel.team, sel.position, sel.employmentStatus || "재직", sel.hireDate ? `입사 ${sel.hireDate}` : ""].filter(Boolean).join(" · ")}</div>
          </div>
          <div className={`flex items-center gap-2 ${wide ? "" : "w-full"}`}>
            <Seg value={paneTab} onChange={setPaneTab} options={[["pay", "급여 설정"], ["contract", "근로계약서"]]} testid="payemp-tabs" className={wide ? "" : "flex-1 [&>button]:flex-1"} />
            {!ro && paneTab === "pay" && <button type="button" disabled={busy || !dirty} onClick={save} className="h-11 px-5 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-40" data-testid="payemp-save">{busy ? "저장 중…" : "저장"}</button>}
          </div>
        </div>
        {preview && paneTab === "pay" && (
          <div className="mt-3 rounded-2xl bg-[#0F1A30] text-white px-4 py-3 flex items-center gap-x-4 gap-y-1 flex-wrap" style={NUMS}>
            <span className="text-[14px] font-bold text-white/70">추가 근무 없는 달{f.payType === "daily" ? "(22일)" : ""}</span>
            <span className="text-[14px] font-bold">지급 <b>{wonFmt(preview.gross)}</b> − 공제 <b>{wonFmt(preview.totalDeduct)}</b></span>
            <span className="text-[14px] font-bold text-white/70">통상시급 {wonFmt(preview.ordinaryHourly)}</span>
            <span className="ml-auto text-[19px] font-black">실지급 {wonFmt(preview.net)}원</span>
          </div>
        )}
      </div>
      {paneTab === "contract" ? (
        <React.Suspense fallback={<div className="py-16 text-center text-[15px] font-bold text-[#7A879C]">불러오는 중…</div>}>
          <PayrollContracts company={company} u={sel} emp={f} settings={settings} canEdit={!ro} docId={empId(company, sel.id)} />
        </React.Suspense>
      ) : (
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3 items-start">
          <BookCard en="BASE PAY" title="기본 급여">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              <div><Label>급여형태</Label><Sel disabled={ro} value={f.payType || "monthly"} onChange={(v) => set("payType", v)} options={PAY_TYPES.map(([k, l]) => [k, `${l}제`])} testid="emp-paytype" /></div>
              <div><Label>고용형태</Label><Sel disabled={ro} value={f.employmentType || "정규직"} onChange={(v) => set("employmentType", v)} options={EMP_TYPES} /></div>
              {f.payType === "hourly" ? money("hourlyWage", "시급", `최저 ${wonFmt(rates.minWage)}원`) : f.payType === "daily" ? money("dailyWage", "일급", `8h 최저 ${wonFmt(rates.minWage * 8)}원`) : f.payType === "annual" ? money("annualSalary", "연봉", "1년 총액") : money("baseMonthly", "월 기본급")}
              {f.payType === "annual" && <AnnualBox emp={f} ro={ro} setEmp={set} />}
              {money("positionAllow", "직책수당", "통상임금 포함")}
              {money("meal", "식대", `비과세 월 ${wonFmt(rates.mealExempt)}원까지`)}
              {money("car", "자가운전보조금", `비과세 월 ${wonFmt(rates.carExempt)}원까지`)}
              <div><Label hint="통상시급 계산">식대 통상임금</Label><Sel disabled={ro} value={f.mealOrdinary ? "y" : "n"} onChange={(v) => set("mealOrdinary", v === "y")} options={[["n", "제외"], ["y", "포함"]]} /></div>
              <div className="col-span-2 md:col-span-1"><Label hint={sel.birthDate ? "회원 정보" : "명세서 필수"}>생년월일</Label>{sel.birthDate ? <div className={`${inp} flex items-center bg-[#F5F7FB]`} style={NUMS}>{sel.birthDate}</div> : <CustomDatePicker disabled={ro} value={f.birthDate || ""} onChange={(e) => set("birthDate", e.target.value)} className={`${inp} text-left`} showIcon />}</div>
            </div>
            {(toNum(f.meal) > toNum(rates.mealExempt) || toNum(f.car) > toNum(rates.carExempt)) && <div className="mt-2.5"><Note>비과세 한도를 넘는 금액은 과세로 계산됩니다.</Note></div>}
          </BookCard>
          <BookCard en="ALLOWANCES" title="기타 고정 수당 (매월)">
            {(f.allowances || []).map((x, i) => {
              const known = kinds.pay.flatMap(([, l]) => l);
              const kindVal = known.includes(x.label) ? x.label : x.label ? "__custom" : "";
              return (
                <div key={i} className="grid grid-cols-2 md:grid-cols-[minmax(0,1fr)_130px_96px_130px_44px] gap-1.5 mb-1.5">
                  <div className="col-span-2 md:col-span-1 space-y-1.5">
                    <Sel disabled={ro} value={kindVal} onChange={(v) => set("allowances", f.allowances.map((y, j) => (j === i ? { ...y, label: v === "__custom" || v === "기타" ? "" : v, custom: v === "__custom" || v === "기타", taxable: v && v !== "__custom" ? kinds.taxableOf(v) : y.taxable } : y)))}
                      placeholder="수당 종류 선택" groups={[...kinds.pay.map(([g, l]) => [g, l.filter((k) => !FIXED_ONLY.includes(k) && !MONTH_ONLY.includes(k))]), ["직접 입력", [["__custom", x.label && !known.includes(x.label) ? `${x.label}(직접 입력)` : "직접 입력…"]]]]} />
                    {(kindVal === "__custom" || x.custom) && <input disabled={ro} value={x.label || ""} onChange={(e) => set("allowances", f.allowances.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} className={inp} placeholder="수당 이름(예: 자격수당)" />}
                  </div>
                  <Money disabled={ro} value={x.amount} onChange={(v) => set("allowances", f.allowances.map((y, j) => (j === i ? { ...y, amount: v } : y)))} />
                  <Sel disabled={ro} value={x.taxable === false ? "n" : "y"} onChange={(v) => set("allowances", f.allowances.map((y, j) => (j === i ? { ...y, taxable: v === "y" } : y)))} options={[["y", "과세"], ["n", "비과세"]]} />
                  <Sel disabled={ro} value={x.ordinary === false ? "n" : "y"} onChange={(v) => set("allowances", f.allowances.map((y, j) => (j === i ? { ...y, ordinary: v === "y" } : y)))} options={[["y", "통상임금 포함"], ["n", "통상임금 제외"]]} />
                  {!ro && <button type="button" onClick={() => set("allowances", f.allowances.filter((_, j) => j !== i))} aria-label="줄 삭제" className="h-11 w-11 rounded-xl border border-[#DCE3EE] bg-white text-[#5B6B85] hover:text-[#B42318]">✕</button>}
                </div>
              );
            })}
            {!(f.allowances || []).length && <div className="mb-2 text-[14px] font-bold text-[#7A879C]">매월 고정으로 주는 수당이 있으면 추가하세요</div>}
            {!ro && <button type="button" onClick={() => set("allowances", [...(f.allowances || []), { label: "", amount: 0, taxable: true, ordinary: true }])} className="h-10 px-3.5 rounded-lg border border-dashed border-[#5B6B85] text-[14px] font-black text-[#1B2B4B]">+ 수당 추가</button>}
          </BookCard>
          <BookCard en="INCOME TAX" title="소득세(간이세액)">
            <div className="grid grid-cols-3 gap-2.5">
              <div><Label hint="본인 제외">부양가족</Label><Sel disabled={ro} value={String(Math.max(0, (toNum(f.dependents) || 1) - 1))} onChange={(v) => set("dependents", toNum(v) + 1)} options={N0_10.map((n) => [String(n), `${n}명`])} /></div>
              <div><Label hint="8~20세">자녀</Label><Sel disabled={ro} value={String(toNum(f.children))} onChange={(v) => set("children", toNum(v))} options={N0_10.map((n) => [String(n), `${n}명`])} /></div>
              <div><Label>세액 비율</Label><Sel disabled={ro} value={String(toNum(f.taxRatePct) || 100)} onChange={(v) => set("taxRatePct", toNum(v))} options={TAX_RATES.map((p) => [String(p), `${p}%`])} /></div>
            </div>
            <div className="mt-2.5"><Label hint="간이세액표 금액을 넣으면 그 값으로">고정 세액(월)</Label><input disabled={ro} inputMode="numeric" value={f.taxFixed ?? ""} onChange={(e) => set("taxFixed", e.target.value.replace(/[^\d]/g, ""))} placeholder="비우면 자동 계산(근사치)" className={numInp} style={NUMS} /></div>
            <div className="mt-2.5"><Note>{TAX_NOTE}{f.employmentType === FREELANCE ? " · 프리랜서는 사업소득세 3% + 지방 0.3%로 계산" : f.employmentType === "일용직" ? " · 일용직(일급제)은 일용근로소득 2.7%로 계산" : ""}</Note></div>
          </BookCard>
          <BookCard en="SOCIAL INSURANCE" title="4대보험">
            <div className="grid grid-cols-3 gap-2.5">{yn("npExempt", "국민연금")}{yn("hiExempt", "건강·장기요양")}{yn("eiExempt", "고용보험")}</div>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              <div><Label hint="비우면 과세급여">국민연금 기준소득월액</Label><Money disabled={ro} value={f.npBase} onChange={(v) => set("npBase", v || "")} placeholder="자동" /></div>
              <div><Label hint="비우면 과세급여">건강보험 보수월액</Label><Money disabled={ro} value={f.hiBase} onChange={(v) => set("hiBase", v || "")} placeholder="자동" /></div>
            </div>
            <div className="mt-2 text-[14px] font-bold text-[#5B6B85]">국민연금 제외: 만 60세 이상 등 · 고용보험 제외: 만 65세 이후 신규 등{f.employmentType === FREELANCE ? " · 프리랜서는 모두 제외로 계산" : ""}</div>
          </BookCard>
          <div className="2xl:col-span-2">
            <BookCard en="PAY ACCOUNT" title="급여 지급 계좌">
              {userAccounts(sel).length > 0 && <div className="mb-2"><Sel disabled={ro} value="" onChange={(k) => { const x = userAccounts(sel).find((y) => acctKey(y) === k); if (x) set("payAccount", x); }} placeholder="회원 정보의 계좌 불러오기" options={userAccounts(sel).map((x) => [acctKey(x), acctText(x)])} /></div>}
              <div className="grid grid-cols-2 md:grid-cols-[200px_minmax(0,1fr)_160px] gap-2">
                <Sel disabled={ro} value={acct.bank || ""} onChange={(v) => setAcct({ bank: v })} placeholder="은행 선택" options={BANK_NAMES} testid="emp-bank" />
                <input disabled={ro} inputMode="numeric" value={acct.acct ? formatAccount(acct.bank, acct.acct) : ""} onChange={(e) => setAcct({ acct: onlyDigits(e.target.value) })} placeholder="계좌번호" className={`${inp} col-span-2 md:col-span-1 order-3 md:order-none`} style={NUMS} />
                <input disabled={ro} value={acct.holder || ""} onChange={(e) => setAcct({ holder: e.target.value })} placeholder="예금주" className={inp} />
              </div>
            </BookCard>
          </div>
        </div>
      )}
    </div>
  ) : (
    <div className={`${sec} py-24 text-center text-[15px] font-bold text-[#7A879C]`}>왼쪽에서 직원을 골라 주세요</div>
  );

  return (
    <div className={fit && wide ? "h-full" : "space-y-3"} data-testid="payroll-emps">
      {wide ? <div className={`grid grid-cols-[280px_minmax(0,1fr)] gap-3 ${fit ? "h-full" : "items-start"}`}>{listNode}{detail}</div> : sel ? detail : listNode}
    </div>
  );
}

// ── 요율 · 설정 ──
// ⭐ 2026-11-07 단순하게 — 근로자 4대보험 요율 4개를 큰 카드로 + [2026 기준값] · 나머지(회사 부담·상하한·비과세 한도·가산율·최저시급)는 "자세한 요율"에 접어 둠
// 데스크톱 입력칸 글자는 index.css가 14px !important로 고정 → 큰 요율 칸만 important로 덮어쓴다
const bigInput = (el) => { if (el) el.style.setProperty("font-size", "30px", "important"); };
const MAIN_RATES = [["npEmp", "국민연금", "근로자 부담"], ["hiEmp", "건강보험", "근로자 부담"], ["ltcRatio", "장기요양", "건강보험료 대비"], ["eiEmp", "고용보험", "근로자 부담"]];
function PayRates({ company, ro }) {
  const settings = usePayrollSettings(company);
  const [year, setYear] = React.useState(() => Number(kstYm().slice(0, 4)));
  const [f, setF] = React.useState(null);
  const [opt, setOpt] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [adv, setAdv] = React.useState(false);
  const [saved, setSaved] = React.useState("");
  React.useEffect(() => {
    if (settings !== undefined) {
      setF(ratesFor(settings || {}, year));
      setOpt({ small: !!settings?.small, payDay: settings?.payDay ?? 10, payNextMonth: settings?.payNextMonth !== false, ledgerOn: settings?.ledgerOn !== false,
        customPayItems: (settings?.customPayItems || []).map((x) => (typeof x === "string" ? { label: x, taxable: true } : x)), customDeductItems: (settings?.customDeductItems || []).map((x) => (typeof x === "string" ? x : x?.label)).filter(Boolean) });
    }
  }, [settings, year]);
  if (!f || !opt) return <div className="py-16 text-center text-[15px] font-bold text-[#7A879C]">불러오는 중…</div>;
  const save = async () => {
    setBusy(true); setSaved("");
    try {
      const vals = Object.fromEntries(RATE_FIELDS.map(([k]) => [k, toNum(f[k])]));
      await setDoc(doc(db, "payrollSettings", company), {
        companyName: company, years: { [year]: { ...vals, small: !!opt.small } }, small: !!opt.small, payDay: toNum(opt.payDay) || 10, payNextMonth: !!opt.payNextMonth, ledgerOn: !!opt.ledgerOn,
        customPayItems: opt.customPayItems.filter((x) => String(x.label || "").trim()).map((x) => ({ label: x.label.trim(), taxable: x.taxable !== false })),
        customDeductItems: uniq(opt.customDeductItems.map((x) => String(x || "").trim())),
        updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "",
      }, { merge: true });
      setSaved("저장했어요");
    } catch (e) { alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const p = presetFor(year);
  const yearOpts = uniq([2025, year - 1, year, year + 1, Number(kstYm().slice(0, 4)) + 1]).filter((y) => y >= 2025).sort();
  const changed = RATE_FIELDS.filter(([k]) => String(p[k]) !== String(f[k])).length;
  const field = ([k, label, unit, hint]) => (
    <div key={k}>
      <Label hint={hint}>{label}</Label>
      <div className="relative"><input disabled={ro} inputMode="decimal" value={unit === "원" ? (toNum(f[k]) ? wonFmt(f[k]) : "") : (f[k] ?? "")} onChange={(e) => setF((x) => ({ ...x, [k]: unit === "원" ? toNum(e.target.value) : e.target.value.replace(/[^\d.]/g, "") }))} className={`${numInp} pr-12`} style={NUMS} data-testid={`rate-${k}`} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px] font-black text-[#7A879C]">{unit}</span></div>
      {String(p[k]) !== String(f[k]) && <div className="mt-1 text-[14px] font-bold text-[#2D4C82]">기준값 {unit === "원" ? wonFmt(p[k]) : p[k]}{unit}</div>}
    </div>
  );
  return (
    <div className="space-y-3" onKeyDown={enterNext} data-testid="payroll-rates">
      <div className={`${sec} p-4`}>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <div className="min-w-0"><div className="text-[11px] font-extrabold tracking-[0.08em] text-[#4B6CB7]" style={NUMS}>SOCIAL INSURANCE</div><div className="text-[17px] font-black text-[#0F1A30]">{year}년 4대보험 요율 <span className="text-[14px] font-bold text-[#5B6B85]">· 근로자 부담</span></div></div>
          <Sel ariaLabel="연도" value={String(year)} onChange={(v) => setYear(Number(v))} options={yearOpts.map((y) => [String(y), `${y}년 요율`])} className="w-[150px]" testid="rates-year" />
          <span className="flex-1" />
          {changed > 0 && <span className="text-[14px] font-bold text-[#2D4C82]">기준값과 다른 칸 {changed}개</span>}
          {!ro && <button type="button" onClick={() => setF({ ...presetFor(year) })} className="h-10 px-3.5 rounded-xl border border-[#1B2B4B] bg-white text-[14px] font-black text-[#1B2B4B]" data-testid="rates-reset">{year} 기준값으로</button>}
        </div>
        <div className="mb-3 text-[14px] font-bold text-[#5B6B85]">처음 값은 그 해 법정 요율이에요. 고시가 바뀌면 여기서 고치면 되고, 확정한 달은 그때 요율이 그대로 남아요.</div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
          {MAIN_RATES.map(([k, label, sub]) => (
            <label key={k} className="rounded-2xl bg-[#F5F8FD] border border-[#E3E8F0] px-4 py-3 block cursor-text">
              <div className="flex items-baseline justify-between gap-2"><span className="text-[15px] font-black text-[#0F1A30]">{label}</span><span className="text-[14px] font-bold text-[#7A879C]">{sub}</span></div>
              <div className="mt-1 flex items-baseline gap-1">
                <input disabled={ro} inputMode="decimal" value={f[k] ?? ""} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value.replace(/[^\d.]/g, "") }))} className="min-w-0 bg-transparent font-black text-[#0F1A30] outline-none border-b-2 border-transparent focus:border-[#2D4C82]" ref={bigInput} style={{ ...NUMS, lineHeight: 1.15, width: `${Math.max(3, String(f[k] ?? "").length + 0.6)}ch` }} data-testid={`rate-${k}`} aria-label={`${label} 요율`} />
                <span className="text-[18px] font-black text-[#5B6B85]">%</span>
              </div>
              <div className={`text-[14px] font-bold ${String(p[k]) !== String(f[k]) ? "text-[#2D4C82]" : "text-[#7A879C]"}`}>{String(p[k]) !== String(f[k]) ? `기준값 ${p[k]}%` : "기준값 그대로"}</div>
            </label>
          ))}
        </div>
        <div className="mt-3 text-[14px] font-bold text-[#5B6B85] leading-relaxed">{year === 2026 ? "2026년: 국민연금 4.75% · 건강보험 3.595% · 장기요양 = 건강보험료 × 13.14% · 고용보험 0.9% · 최저시급 10,320원" : `${year}년 기준값은 ${presetFor(year).year}년 법정 요율이에요`}</div>
        <button type="button" onClick={() => setAdv((v) => !v)} className="mt-3 h-11 w-full rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-black text-[#1B2B4B] flex items-center justify-center gap-2" aria-expanded={adv} data-testid="rates-adv">
          자세한 요율 {adv ? "접기" : "펼치기"} <span className="font-bold text-[#7A879C]">회사 부담 · 상하한 · 비과세 한도 · 가산율 · 최저시급</span>
        </button>
        {adv && <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5">{RATE_FIELDS.filter(([k]) => !MAIN_RATES.some((m) => m[0] === k)).map(field)}</div>}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        <BookCard en="OPTIONS" title="급여 설정">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>급여 지급일</Label><div className="grid grid-cols-2 gap-2">
              <Sel disabled={ro} value={opt.payNextMonth ? "next" : "same"} onChange={(v) => setOpt((o) => ({ ...o, payNextMonth: v === "next" }))} options={[["next", "다음 달"], ["same", "그 달"]]} ariaLabel="지급 월" />
              <Sel disabled={ro} value={String(toNum(opt.payDay) || 10)} onChange={(v) => setOpt((o) => ({ ...o, payDay: toNum(v) }))} options={Array.from({ length: 28 }, (_, i) => [String(i + 1), `${i + 1}일`])} ariaLabel="지급일" testid="opt-payday" />
            </div></div>
            <div><Label>사업장 규모</Label><Sel disabled={ro} value={opt.small ? "small" : "normal"} onChange={(v) => setOpt((o) => ({ ...o, small: v === "small" }))} options={[["normal", "상시 5인 이상"], ["small", "5인 미만(가산수당 없음)"]]} /></div>
            <div className="md:col-span-2"><Label>장부 연동</Label><Sel disabled={ro} value={opt.ledgerOn ? "y" : "n"} onChange={(v) => setOpt((o) => ({ ...o, ledgerOn: v === "y" }))} options={[["y", "지급 처리하면 수입·지출 장부에 \"급여·상여\" 지출 자동 기록"], ["n", "장부에 기록하지 않음"]]} /></div>
          </div>
        </BookCard>
        {/* 회사 수당·공제 항목 — 급여 계산의 수당/공제 종류 드롭다운에 함께 나온다 */}
        <BookCard en="CUSTOM ITEMS" title="회사 수당 · 공제 항목">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label hint="수당 종류에 추가">회사 수당 항목</Label>
              <div className="space-y-1.5">
                {opt.customPayItems.map((x, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_100px_44px] gap-1.5">
                    <input disabled={ro} value={x.label} onChange={(e) => setOpt((o) => ({ ...o, customPayItems: o.customPayItems.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) }))} className={inp} placeholder="예: 안전운행수당" />
                    <Sel disabled={ro} value={x.taxable === false ? "n" : "y"} onChange={(v) => setOpt((o) => ({ ...o, customPayItems: o.customPayItems.map((y, j) => (j === i ? { ...y, taxable: v === "y" } : y)) }))} options={[["y", "과세"], ["n", "비과세"]]} />
                    {!ro && <button type="button" onClick={() => setOpt((o) => ({ ...o, customPayItems: o.customPayItems.filter((_, j) => j !== i) }))} aria-label="삭제" className="h-11 w-11 rounded-xl border border-[#DCE3EE] bg-white text-[#5B6B85]">✕</button>}
                  </div>
                ))}
                {!ro && <button type="button" onClick={() => setOpt((o) => ({ ...o, customPayItems: [...o.customPayItems, { label: "", taxable: true }] }))} className="h-10 px-3.5 rounded-lg border border-dashed border-[#5B6B85] text-[14px] font-black text-[#1B2B4B]">+ 수당 항목</button>}
              </div>
            </div>
            <div>
              <Label hint="공제 종류에 추가">회사 공제 항목</Label>
              <div className="space-y-1.5">
                {opt.customDeductItems.map((x, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_44px] gap-1.5">
                    <input disabled={ro} value={x} onChange={(e) => setOpt((o) => ({ ...o, customDeductItems: o.customDeductItems.map((y, j) => (j === i ? e.target.value : y)) }))} className={inp} placeholder="예: 노조비" />
                    {!ro && <button type="button" onClick={() => setOpt((o) => ({ ...o, customDeductItems: o.customDeductItems.filter((_, j) => j !== i) }))} aria-label="삭제" className="h-11 w-11 rounded-xl border border-[#DCE3EE] bg-white text-[#5B6B85]">✕</button>}
                  </div>
                ))}
                {!ro && <button type="button" onClick={() => setOpt((o) => ({ ...o, customDeductItems: [...o.customDeductItems, ""] }))} className="h-10 px-3.5 rounded-lg border border-dashed border-[#5B6B85] text-[14px] font-black text-[#1B2B4B]">+ 공제 항목</button>}
              </div>
            </div>
          </div>
        </BookCard>
      </div>
      {!ro && (
        <div className="sticky bottom-2 z-10 flex items-center gap-3">
          <button type="button" disabled={busy} onClick={save} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50 shadow-[0_10px_24px_rgba(15,26,48,0.25)]" data-testid="rates-save">{busy ? "저장 중…" : `${year}년 요율 · 설정 저장`}</button>
          {saved && <span className="text-[14px] font-black text-[#2D4C82]" role="status">{saved}</span>}
        </div>
      )}
    </div>
  );
}

// ═════════════════ 내 급여명세서(직원 본인 — 발행된 것만) ═════════════════
// ⭐ 2026-11-07 내정보 › 급여명세서 탭(MyPayslipsSection) · 모바일 내정보도 같은 것 · 명세서는 새 디자인(payslipDoc.js)
export function MyPayslips({ company, uid: uidIn, compact = false }) {
  const uid = uidIn || auth.currentUser?.uid || "";
  const [rows, setRows] = React.useState(null);
  const [sel, setSel] = React.useState(null);
  React.useEffect(() => {
    if (!uid) { setRows([]); return undefined; }
    return onSnapshot(query(collection(db, "payslips"), where("uid", "==", uid), where("published", "==", true)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.ym).localeCompare(String(a.ym)))), () => setRows([]));
  }, [uid]);
  const cur = rows?.find((r) => r.id === sel) || rows?.[0] || null;
  React.useEffect(() => { if (cur && !cur.readAt && uid && cur.uid === uid) updateDoc(doc(db, "payslips", cur.id), { readAt: Date.now() }).catch(() => {}); }, [cur, uid]);
  const year = cur?.ym?.slice(0, 4);
  const yearRows = (rows || []).filter((r) => r.ym?.startsWith(year || ""));
  const years = uniq((rows || []).map((r) => r.ym?.slice(0, 4)));
  const kpis = cur ? [["최근 실수령액", `${wonFmt(cur.result?.net)}원`, ymLabel(cur.ym)], [`${year}년 지급 총액`, `${wonFmt(yearRows.reduce((s, r) => s + (r.result?.gross || 0), 0))}원`, `${yearRows.length}개월`], [`${year}년 실수령 합계`, `${wonFmt(yearRows.reduce((s, r) => s + (r.result?.net || 0), 0))}원`]] : [];
  return (
    <div className="space-y-3 min-w-0" data-testid="my-payslips">
      {compact ? (
        cur && <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">{kpis.map(([k, v, sub]) => <div key={k} className="rounded-2xl bg-white border border-[#E3E8F0] px-4 py-3"><div className="text-[14px] font-bold text-[#5B6B85]">{k}</div><div className="text-[19px] font-black text-[#0F1A30]" style={NUMS}>{v}</div>{sub && <div className="text-[14px] font-bold text-[#7A879C]">{sub}</div>}</div>)}</div>
      ) : (
        <BookHero en="MY · PAYSLIP" title="급여명세서" desc="회사가 발행한 본인 급여명세서만 보여요. 인쇄하거나 PDF로 저장할 수 있어요" kpis={kpis} />
      )}
      {rows === null ? <div className="py-16 text-center text-[15px] font-bold text-[#7A879C]">불러오는 중…</div> : !rows.length ? (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] py-16 text-center text-[15px] font-bold text-[#7A879C]">아직 발행된 급여명세서가 없어요</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-3 items-start">
          <div className="rounded-[20px] bg-white border border-[#E3E8F0] overflow-hidden flex lg:block overflow-x-auto no-scrollbar" role="tablist" aria-label="귀속 월">
            {years.map((y) => (
              <React.Fragment key={y}>
                <div className="hidden lg:block px-4 pt-3 pb-1 text-[14px] font-black text-[#7A879C]" style={NUMS}>{y}년</div>
                {rows.filter((r) => r.ym?.startsWith(y)).map((r) => (
                  <button key={r.id} type="button" role="tab" aria-selected={cur?.id === r.id} onClick={() => setSel(r.id)} className={`shrink-0 lg:w-full text-left px-4 py-2.5 lg:border-t border-[#EEF1F6] ${cur?.id === r.id ? "bg-[#EEF3FC] shadow-[inset_3px_0_0_#1B2B4B]" : "hover:bg-[#F8FAFD]"}`} data-testid="my-slip-row">
                    <div className="text-[15px] font-black text-[#0F1A30] whitespace-nowrap">{Number(r.ym.slice(5, 7))}월<span className="lg:hidden text-[14px] font-bold text-[#7A879C]"> · {r.ym.slice(0, 4)}</span>{!r.readAt && <span className="ml-1.5 text-[14px] font-black px-1.5 rounded bg-[#2D4C82] text-white align-middle">새 명세서</span>}</div>
                    <div className="text-[14px] font-black text-[#2D4C82] whitespace-nowrap" style={NUMS}>{wonFmt(r.result?.net)}원</div>
                  </button>
                ))}
              </React.Fragment>
            ))}
          </div>
          {cur && (
            <div className="space-y-2 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap"><span className="text-[14px] font-bold text-[#5B6B85]">{ymLabel(cur.ym)} · {cur.status === "paid" ? `지급 완료 ${cur.paidDate || ""}` : "지급 예정"}</span><button type="button" onClick={() => printPayslips([cur], company || cur.companyName)} className="h-11 px-4 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black" data-testid="my-slip-print">인쇄 · PDF 저장</button></div>
              <div className="rounded-[20px] bg-white border border-[#E3E8F0] p-3 md:p-5"><PayslipView slip={cur} company={company || cur.companyName} /></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// 내정보 화면 안 탭 — 머리 카드 없이
export function MyPayslipsSection(props) {
  return <MyPayslips {...props} compact />;
}
