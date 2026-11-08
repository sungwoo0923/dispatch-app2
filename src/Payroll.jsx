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
import { BookHero, BookCard, Chip } from "./OfficeBooks";
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
import PayrollGate, { prefetchPayrollStatus } from "./PayrollGate";
import { payslipHtml, PAYSLIP_CSS, printPayslips, TAX_NOTE } from "./payslipDoc";
import { kstDay, kstYm, shiftYm, lastDayOf, safeId, slipId, runId, empId, toNum, ymLabel, blank, uniq, inp, numInp, NUMS, sec, Label, Note, H, Sel, Money, Seg, enterNext, useMedia, useCol, useDocData } from "./payrollUi";
import { kpPrompt, kpConfirm } from "./kpDialog";

const PayrollReports = React.lazy(() => import("./PayrollReports"));
const PayrollContracts = React.lazy(() => import("./PayrollContracts"));
export { payslipHtml, PAYSLIP_CSS, printPayslips, TAX_NOTE, safeId, slipId, runId, empId };
const STATUS = {
  none: ["작성 전", "#5B6B85", "#F2F4F7"], draft: ["작성 중", "#2D4C82", "#EEF3FC"], confirmed: ["확정(잠금)", "#FFFFFF", "#1B2B4B"], paid: ["지급 완료", "#8FB0F0", "#0B1428"],
};
const StatusPill = ({ st, published }) => { const s = STATUS[st] || STATUS.none; return <span className="inline-flex items-center gap-1.5"><span className="h-8 px-3 rounded-lg text-[14px] font-black inline-flex items-center" style={{ color: s[1], background: s[2] }}>{s[0]}</span>{published && <span className="h-8 px-3 rounded-lg text-[14px] font-black inline-flex items-center bg-[#2D4C82] text-white">명세서 발행</span>}</span>; };
// 직원별 상태 칩 — 미입력 · 계산됨 · 확정 · 발행 · 지급
const ROW_ST = {
  none: ["미입력", "#5B6B85", "#F2F4F7"], calc: ["계산됨", "#2D4C82", "#EEF3FC"], confirmed: ["확정", "#FFFFFF", "#2D4C82"], published: ["발행", "#FFFFFF", "#1B2B4B"], paid: ["지급", "#8FB0F0", "#0B1428"],
};
const rowStatus = (r) => (!r.result ? "none" : r.slip?.status === "paid" ? "paid" : r.slip?.published ? "published" : r.slip?.status === "confirmed" ? "confirmed" : "calc");
const RowChip = ({ st, unsaved, compact = false }) => { const s = ROW_ST[st] || ROW_ST.none; return <span className="h-7 px-2.5 rounded-lg text-[14px] font-black inline-flex items-center gap-1 whitespace-nowrap" style={{ color: s[1], background: s[2] }} title={unsaved ? "아직 저장 전(자동 계산 값)" : ""}>{s[0]}{unsaved && st === "calc" ? (compact ? <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" aria-label="저장 전" /> : " · 저장 전") : ""}</span>; };
// 전월 대비 실지급 변동(10% 이상) 표시
const DiffTag = ({ cur, prev }) => {
  if (!cur || !prev) return null;
  const d = cur - prev; const p = prev ? d / prev : 0;
  if (Math.abs(p) < 0.1) return null;
  return <span className={`h-6 px-1.5 rounded-md text-[13px] font-black inline-flex items-center whitespace-nowrap ${d > 0 ? "bg-[#EEF3FC] text-[#2D4C82]" : "bg-[#FEF3F2] text-[#B42318]"}`} title={`전월 ${wonFmt(prev)}원 → ${wonFmt(cur)}원`} style={NUMS}>{d > 0 ? "▲" : "▼"} {Math.abs(Math.round(p * 100))}%</span>;
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
export function prefetchPayroll(company) { return prefetchPayrollStatus(company).catch(() => null); }
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
const PAY_TABS = [["run", "월 급여 계산"], ["emp", "직원 급여 설정"], ["report", "신고 · 이체"], ["rates", "요율 · 설정"]];
export default function PayrollCenter({ company, role = "" }) {
  const uid = auth.currentUser?.uid || "preview";
  const acc = usePayrollAccess(company, uid, role, auth.currentUser?.email || "");
  const [tab, setTab] = React.useState("run");
  if (acc.loading) return <div className="py-24 text-center text-[15px] font-bold text-[#7A879C]">확인 중…</div>;
  if (!acc.canView) return <div className="rounded-2xl bg-white border border-[#E3E8F0] py-16 px-4 text-center text-[15px] font-bold text-[#5B6B85]">급여는 경리·회계팀만 볼 수 있어요. 본인 급여명세서는 내정보 › 급여명세서에서 볼 수 있어요.</div>;
  const fallback = <div className="py-20 text-center text-[15px] font-bold text-[#7A879C]">불러오는 중…</div>;
  return (
    <div className="w-full max-w-none min-w-0" data-testid="payroll-center">
      <PayrollGate company={company} canAdmin={acc.canAdmin}>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 [&>*]:shrink-0" role="tablist">
          {PAY_TABS.map(([k, l]) => <Chip key={k} on={tab === k} onClick={() => setTab(k)}>{l}</Chip>)}
        </div>
        {tab === "run" && <PayrollRun company={company} ro={false} />}
        {tab === "emp" && <PayEmployees company={company} ro={false} />}
        {tab === "report" && <React.Suspense fallback={fallback}><PayrollReports company={company} /></React.Suspense>}
        {tab === "rates" && <PayRates company={company} ro={false} />}
      </PayrollGate>
    </div>
  );
}

// ── 월 급여 계산(좌: 직원 목록 + 입력 / 우: 급여명세서 미리보기) ──
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

function PayrollRun({ company, ro }) {
  const wide = useMedia("(min-width: 1280px)");
  const xwide = useMedia("(min-width: 1600px)"); // ⭐ 2026-11-07 넓은 화면은 직원 목록 | 입력 | 명세서 3칸
  const [ym, setYm] = React.useState(kstYm);
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
  const [selId, setSelId] = React.useState(null);
  const [checked, setChecked] = React.useState(() => new Set());
  const [pane, setPane] = React.useState("edit"); // 태블릿·모바일: 입력 | 미리보기
  const [flt, setFlt] = React.useState({ q: "", team: "", position: "", emp: "재직", payType: "", st: "" });
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
  const locked = st === "confirmed" || st === "paid";
  const byName = auth.currentUser?.email || "";
  const logEntry = (action, detail = "") => ({ at: Date.now(), action, by: byName, detail });
  const payDateDefault = () => { const d = Number(settings?.payDay) || 0; if (!d) return kstDay(); const n = shiftYm(ym, settings?.payNextMonth === false ? 0 : 1); return `${n}-${String(Math.min(d, 28)).padStart(2, "0")}`; };

  // ── 필터 · 드롭다운 목록(인사 설정 + 실제 직원 데이터) ──
  const teamOpts = uniq([...(hr.teams || []), ...people.map((u) => u.team)]);
  const posOpts = uniq([...(hr.exec || []), ...(hr.normal || []), ...people.map((u) => u.position)]);
  const statusOpts = uniq([...EMPLOYMENT_STATUS_OPTIONS, ...people.map((u) => u.employmentStatus)]);
  const qq = flt.q.trim();
  const shown = rows.filter((r) => {
    const u = r.u;
    if (qq && ![personName(u), u.name, u.team, u.position, u.phone].some((v) => String(v || "").includes(qq))) return false;
    if (flt.team && u.team !== flt.team) return false;
    if (flt.position && u.position !== flt.position) return false;
    if (flt.emp && (u.employmentStatus || "재직") !== flt.emp) return false;
    if (flt.payType && (flt.payType === "none" ? r.result : !r.emp || (r.emp.payType || "monthly") !== flt.payType)) return false;
    if (flt.st && rowStatus(r) !== flt.st) return false;
    return true;
  });
  const cur = rows.find((r) => r.u.id === selId) || shown[0] || rows[0] || null;
  React.useEffect(() => { if (!selId && cur) setSelId(cur.u.id); }, [selId, cur]);
  React.useEffect(() => { setChecked(new Set()); }, [ym]);
  const toggleCheck = (id) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShownChecked = shown.length > 0 && shown.every((r) => checked.has(r.u.id));

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
  const checkedRows = rows.filter((r) => checked.has(r.u.id));
  const shownSlips = (slips || []).slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  const history = cur ? (allSlips || []).filter((s) => s.uid === cur.u.id && s.ym !== ym).sort((a, b) => String(b.ym).localeCompare(String(a.ym))) : [];
  const btn = "h-11 px-4 rounded-xl text-[14px] font-black disabled:opacity-40 whitespace-nowrap";
  const btnLine = `${btn} border border-[#DCE3EE] bg-white text-[#1B2B4B] hover:border-[#2D4C82]`;
  const btnDark = `${btn} bg-[#0F1A30] text-white hover:bg-[#1B2B4B]`;

  const listNode = (
    <BookCard en={`STAFF · ${shown.length}/${rows.length}`} title="직원 목록" flush
      right={<span className="text-[14px] font-bold text-[#5B6B85]">확정 <b className="text-[#0F1A30]" style={NUMS}>{nConfirmed}</b> · 발행 <b className="text-[#0F1A30]" style={NUMS}>{nPublished}</b> / {ready.length}명</span>}>
      <div className="px-4 pb-3 space-y-2">
        <EmpCombo rows={rows} q={flt.q} setQ={(q) => setFlt((f) => ({ ...f, q }))} onPick={(id) => { setSelId(id); setPane("edit"); }} />
        <div className={`grid grid-cols-2 ${xwide ? "" : "md:grid-cols-3"} gap-2`}>
          <Sel ariaLabel="부서" value={flt.team} onChange={(v) => setFlt((f) => ({ ...f, team: v }))} placeholder="부서 전체" options={teamOpts} testid="flt-team" />
          <Sel ariaLabel="직책" value={flt.position} onChange={(v) => setFlt((f) => ({ ...f, position: v }))} placeholder="직책 전체" options={posOpts} />
          <Sel ariaLabel="재직상태" value={flt.emp} onChange={(v) => setFlt((f) => ({ ...f, emp: v }))} placeholder="재직상태 전체" options={statusOpts} />
          <Sel ariaLabel="급여형태" value={flt.payType} onChange={(v) => setFlt((f) => ({ ...f, payType: v }))} placeholder="급여형태 전체" options={[...PAY_TYPES.map(([k, l]) => [k, `${l}제`]), ["none", "설정 필요"]]} />
          <Sel ariaLabel="처리 상태" value={flt.st} onChange={(v) => setFlt((f) => ({ ...f, st: v }))} placeholder="상태 전체" options={Object.entries(ROW_ST).map(([k, v]) => [k, v[0]])} className={xwide ? "col-span-2" : "col-span-2 md:col-span-1"} />
        </div>
      </div>
      <div className="border-t border-[#EEF1F6]">
        <label className="px-4 h-11 flex items-center gap-2.5 bg-[#F5F8FD] text-[14px] font-black text-[#3A4A66] cursor-pointer">
          <input type="checkbox" className="w-[18px] h-[18px] accent-[#1B2B4B]" checked={allShownChecked} onChange={() => setChecked((s) => { const n = new Set(s); shown.forEach((r) => (allShownChecked ? n.delete(r.u.id) : n.add(r.u.id))); return n; })} />
          보이는 직원 전체 선택 {checked.size > 0 && <span className="text-[#2D4C82]">· {checked.size}명 선택</span>}
          <span className="ml-auto text-[14px] font-bold text-[#7A879C]">실지급(원)</span>
        </label>
        <div className={`divide-y divide-[#EEF1F6] overflow-y-auto ${xwide ? "max-h-[calc(100vh-520px)] min-h-[320px]" : wide ? "max-h-[360px]" : "max-h-[300px]"}`} data-testid="pay-emp-list">
          {loading ? <div className="py-10 text-center text-[14px] font-bold text-[#7A879C]">불러오는 중…</div> : !shown.length ? <div className="py-10 text-center text-[14px] font-bold text-[#7A879C]">조건에 맞는 직원이 없습니다</div> : shown.map((r) => {
            const on = cur?.u.id === r.u.id;
            return (
              <div key={r.u.id} className={`px-4 py-2.5 flex items-center gap-2.5 ${on ? "bg-[#EEF3FC] shadow-[inset_4px_0_0_#1B2B4B]" : "hover:bg-[#F8FAFD]"}`}>
                <input type="checkbox" aria-label={`${r.u.name} 선택`} className="w-[18px] h-[18px] accent-[#1B2B4B] shrink-0" checked={checked.has(r.u.id)} onChange={() => toggleCheck(r.u.id)} />
                <button type="button" onClick={() => { setSelId(r.u.id); setPane("edit"); }} className="flex-1 min-w-0 flex items-center gap-2.5 text-left" data-testid="payroll-edit">
                  <span className="w-9 h-9 rounded-xl bg-[#1B2B4B] text-white grid place-items-center text-[15px] font-black shrink-0">{String(r.u.name || "?").slice(0, 1)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-black text-[#0F1A30] truncate">{personName(r.u) || r.u.name}</span>
                    <span className="block text-[14px] font-bold text-[#5B6B85] truncate">{[r.u.team, r.u.position, r.emp ? `${payTypeLabel(r.emp.payType)}제` : ""].filter(Boolean).join(" · ") || "-"}</span>
                  </span>
                  <RowChip st={rowStatus(r)} unsaved={!r.slip} compact={xwide} />
                  <span className="w-[104px] text-right shrink-0"><span className="block text-[15px] font-black text-[#0F1A30]" style={NUMS}>{r.result ? wonFmt(r.result.net) : "-"}</span><DiffTag cur={r.result?.net} prev={prevMap[r.u.id]?.result?.net} /></span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </BookCard>
  );

  return (
    <div className="space-y-3" data-testid="payroll-run">
      <BookHero en={`PAYROLL · ${ym}`} title="월 급여 계산" desc={wide ? "왼쪽에서 직원을 고르고 입력하면 오른쪽 급여명세서가 바로 바뀝니다 · 출근기록부 시간 자동 반영" : "직원을 고르고 입력 → [명세서 미리보기]에서 바로 확인 · 출근기록부 시간 자동 반영"}
        kpis={[["대상 인원", `${totals.n}명`, rows.length > totals.n ? `설정 필요 ${rows.length - totals.n}명` : `확정 ${nConfirmed}명 · 발행 ${nPublished}명`], ["지급 총액", `${wonFmt(totals.gross)}원`], ["공제 총액", `${wonFmt(totals.deduct)}원`, `원천세 ${wonFmt(totals.tax)}원`], ["실지급 총액", `${wonFmt(totals.net)}원`, `회사 부담 4대보험 ${wonFmt(totals.employer)}원`]]}
        right={
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setYm(shiftYm(ym, -1))} className="w-11 h-11 rounded-xl bg-white/10 border border-white/25 text-[17px] font-black" aria-label="이전 달">‹</button>
            <Sel dark ariaLabel="귀속 월" testid="pay-month" value={ym} onChange={(v) => v && setYm(v)} options={ymList.map((m) => [m, `${ymLabel(m)} · ${ymStatus(m)}`])} className="w-[230px]" />
            <button type="button" onClick={() => setYm(shiftYm(ym, 1))} className="w-11 h-11 rounded-xl bg-white/10 border border-white/25 text-[17px] font-black" aria-label="다음 달">›</button>
          </div>
        } />
      {/* 달 상태 · 일괄 작업 */}
      <div className="rounded-2xl bg-white border border-[#E3E8F0] px-4 py-3 flex items-center gap-2 flex-wrap">
        <StatusPill st={st} published={run?.published} />
        <span className="text-[14px] font-bold text-[#5B6B85]">지급일 <b className="text-[#0F1A30]" style={NUMS}>{run?.payDate || payDateDefault()}</b></span>
        <span className="text-[14px] font-bold text-[#5B6B85] hidden 2xl:inline">{curRates.year}년 요율 · 국민연금 {curRates.npEmp}% · 건강 {curRates.hiEmp}% · 장기요양 {curRates.ltcRatio}% · 고용 {curRates.eiEmp}%{curRates.small ? " · 5인 미만(가산 없음)" : ""}</span>
        <span className="flex-1" />
        {!ro && st !== "paid" && <button type="button" disabled={busy || !ready.some((r) => !r.locked)} onClick={() => saveDraft(ready, "전체 계산")} className={btnLine} data-testid="pay-calc-all">전체 계산 · 저장</button>}
        {!ro && st !== "paid" && <button type="button" disabled={busy || !checkedRows.some((r) => r.result && !r.locked)} onClick={() => confirmRows(checkedRows)} className={btnLine} data-testid="payroll-confirm">선택 확정{checked.size ? ` ${checkedRows.filter((r) => r.result && !r.locked).length}` : ""}</button>}
        {!ro && st !== "paid" && <button type="button" disabled={busy || !checkedRows.some((r) => r.result && !r.slip?.published)} onClick={() => publishRows(checkedRows)} className={`${btn} bg-[#2D4C82] text-white`} data-testid="payroll-publish">선택 발행{checked.size ? ` ${checkedRows.filter((r) => r.result && !r.slip?.published).length}` : ""}</button>}
        {!ro && st !== "paid" && <button type="button" disabled={busy || !ready.some((r) => !r.slip?.published && r.slip?.status !== "paid")} onClick={() => publishRows(ready)} className={btnDark} data-testid="payroll-publish-all">전체 확정 · 발행</button>}
        {!ro && st === "confirmed" && <button type="button" disabled={busy} onClick={() => unlockRows(rows)} className={`${btn} border border-[#DCE3EE] bg-white text-[#3A4A66]`}>전체 확정 해제</button>}
        {!ro && st === "confirmed" && <button type="button" disabled={busy} onClick={pay} className={btnDark}>지급 처리</button>}
        {!ro && st === "paid" && <button type="button" disabled={busy} onClick={unpay} className={`${btn} border border-[#DCE3EE] bg-white text-[#3A4A66]`}>지급 취소</button>}
        {shownSlips.some((s) => s.status !== "draft") && <button type="button" onClick={() => printPayslips(shownSlips.filter((s) => s.status !== "draft"), company)} className={btnLine}>확정분 전체 인쇄</button>}
      </div>
      {/* 태블릿·모바일: 입력 ↔ 미리보기 */}
      {!wide && (
        <div className="sticky top-0 z-20 -mx-1 px-1 py-1.5 bg-[#F4F6FA]/95 backdrop-blur">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white border border-[#E3E8F0]" role="tablist">
            {[["edit", "입력"], ["preview", "명세서 미리보기"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={pane === k} onClick={() => setPane(k)} className={`h-11 rounded-xl text-[15px] font-black ${pane === k ? "bg-[#0F1A30] text-white" : "text-[#3A4A66]"}`} data-testid={`pane-${k}`}>{l}</button>)}
          </div>
        </div>
      )}
      {loading ? <div className="py-16 text-center text-[15px] font-bold text-[#7A879C]">불러오는 중…</div> : !rows.length ? (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] py-16 text-center text-[15px] font-bold text-[#5B6B85]">이 달 대상 직원이 없습니다</div>
      ) : (
        <Workspace key={`${cur?.u.id}_${ym}`} company={company} ym={ym} row={cur} ro={ro} busy={busy} wide={wide} xwide={xwide} pane={pane} listNode={listNode}
          kinds={kinds} history={history} rates={cur?.rates || curRates} runPayDate={run?.payDate || payDateDefault()}
          slipDoc={slipDoc} onSave={(r) => saveDraft([r])} onConfirm={(r) => confirmRows([r])} onPublish={(r) => publishRows([r])} onUnlock={(r) => unlockRows([r])}
          onPrev={() => { const i = shown.findIndex((r) => r.u.id === cur?.u.id); if (i > 0) setSelId(shown[i - 1].u.id); }}
          onNext={() => { const i = shown.findIndex((r) => r.u.id === cur?.u.id); if (i >= 0 && i < shown.length - 1) setSelId(shown[i + 1].u.id); }} />
      )}
      <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-4 py-3 text-[14px] text-[#3A4A66] leading-relaxed">
        ■ 소득세는 <b className="text-[#0F1A30]">{TAX_NOTE}</b>입니다. 직원별 [고정 세액] 또는 명세서별 [소득세 직접 입력]으로 국세청 간이세액표 금액을 넣을 수 있습니다.
        ■ 시간은 출근기록부(출근·퇴근 시각, 휴게 4h↑30분·8h↑1시간 공제, 평일 8시간 초과 = 연장, 22~06시 = 야간, 주말·공휴일 = 휴일)에서 자동 계산되며 직접 고칠 수 있습니다.
        {run?.log?.length > 0 && <> ■ 처리 기록: {run.log.slice(-3).map((l) => `${new Date(l.at).toLocaleString("ko-KR")} ${l.action}${l.detail ? `(${l.detail})` : ""}`).join(" · ")}</>}
      </div>
    </div>
  );
}

// 직원 찾기(검색 + 고르기 목록) — ↑↓ 로 고르고 Enter
function EmpCombo({ rows, q, setQ, onPick }) {
  const [open, setOpen] = React.useState(false);
  const [act, setAct] = React.useState(0);
  const t = q.trim();
  const list = rows.filter((r) => !t || [personName(r.u), r.u.name, r.u.team, r.u.position, r.u.phone].some((v) => String(v || "").includes(t))).slice(0, 8);
  const pick = (r) => { if (!r) return; onPick(r.u.id); setOpen(false); };
  return (
    <div className="relative">
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setAct(0); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setAct((i) => Math.min(list.length - 1, i + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setAct((i) => Math.max(0, i - 1)); } else if (e.key === "Enter") { e.preventDefault(); pick(list[act]); } else if (e.key === "Escape") setOpen(false); }}
        placeholder="직원 검색 · 이름 · 부서 · 직책 · 연락처" className={`${inp} pl-10`} role="combobox" aria-expanded={open} aria-autocomplete="list" data-testid="emp-combo" />
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6B85" strokeWidth="2.6" className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      {open && list.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-xl bg-white border border-[#DCE3EE] shadow-[0_16px_40px_rgba(15,26,48,0.18)] py-1 max-h-[320px] overflow-y-auto" role="listbox">
          {list.map((r, i) => (
            <button key={r.u.id} type="button" role="option" aria-selected={i === act} onMouseDown={(e) => { e.preventDefault(); pick(r); }} onMouseEnter={() => setAct(i)} className={`w-full px-3 py-2 flex items-center gap-2 text-left ${i === act ? "bg-[#1B2B4B] text-white" : "text-[#0F1A30]"}`}>
              <b className="text-[15px]">{personName(r.u) || r.u.name}</b>
              <span className={`text-[14px] font-bold truncate ${i === act ? "text-[#8FB0F0]" : "text-[#5B6B85]"}`}>{[r.u.team, r.u.position].filter(Boolean).join(" · ")}</span>
              <span className="ml-auto"><RowChip st={rowStatus(r)} /></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 한 사람 작업 화면: 입력(왼쪽) + 급여명세서 미리보기(오른쪽) ──
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

function Workspace({ company, ym, row, ro: roIn, busy, wide, xwide = false, pane, listNode, kinds, history, rates, runPayDate, slipDoc, onSave, onConfirm, onPublish, onUnlock, onPrev, onNext }) {
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
  const locked = row.locked;
  const ro = roIn || locked;
  const { emp, input } = composeState(s);
  const a = row.att || {};
  const result = locked ? row.result : empReady(emp) ? calcPayslipFull(emp, monthOf(input, a), rates) : null;
  const dirty = !locked && JSON.stringify(composeState(s)) !== JSON.stringify(composeState(init));
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
  if (!(u.birthDate || emp.birthDate)) checks.push(["info", "생년월일이 없습니다 — 급여명세서 필수 기재사항(근로기준법 시행령 27조의2)입니다. 아래 직원 정보에서 입력하세요"]);
  if (a.missing) checks.push(["info", `출근기록 퇴근 누락 ${a.missing}일 — 정상 8시간으로 계산했습니다. 필요하면 시간을 고쳐 주세요`]);
  if (!acctKey(curAcct)) checks.push(["info", "지급 계좌가 없습니다 — 계좌를 고르거나 직접 입력하면 명세서에 표시됩니다"]);
  if (emp.employmentType === "일용직" && payType !== "daily") checks.push(["info", "일용직은 급여형태를 \"일급\"으로 두면 일용근로소득 원천세(2.7%)로 계산합니다"]);
  if ((result?.warnings || []).some((w) => /간이세액/.test(w))) checks.push(["info", TAX_NOTE]);

  // ── 최근 12개월 · 올해 누계 ──
  const hist12 = history.filter((h) => h.ym < ym).slice(0, 12);
  const yearRows = history.filter((h) => h.ym.slice(0, 4) === ym.slice(0, 4) && h.ym < ym && h.result);
  const ytd = (f) => yearRows.reduce((x, h) => x + (f(h.result) || 0), 0) + (result ? f(result) || 0 : 0);
  const taxOf = (r) => (r?.deductions || []).filter((d) => d.key === "tax" || d.key === "local").reduce((x, d) => x + d.amount, 0);
  const insOf = (r) => (r?.deductions || []).filter((d) => ["np", "hi", "ltc", "ei"].includes(d.key)).reduce((x, d) => x + d.amount, 0);
  const otherDedOf = (r) => (r?.deductions || []).filter((d) => !["np", "hi", "ltc", "ei", "tax", "local"].includes(d.key)).reduce((x, d) => x + d.amount, 0);

  const slipPreview = locked && row.slip ? row.slip : { ...slipDoc(live), result, ym, rates };
  const autoRows = (result?.earnings || []).filter((e) => ["base", "weekly", "ot", "night", "holiday"].includes(e.key));
  const hourField = (k, label, hint) => (
    <div key={k}><Label hint={hint ?? `출근기록 ${a[k] ?? 0}`}>{label}</Label>
      <div className="relative"><input disabled={ro} inputMode="decimal" value={input[k] ?? ""} onChange={(e) => setIn(k, e.target.value.replace(/[^\d.]/g, ""))} placeholder={String(a[k] ?? 0)} className={`${numInp} pr-10`} style={NUMS} data-testid={`hour-${k}`} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px] font-bold text-[#7A879C]">{k === "workDays" ? "일" : "h"}</span></div>
    </div>
  );
  const sec = "rounded-[20px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_rgba(16,24,40,0.05)]";
  const btn = "h-11 px-4 rounded-xl text-[14px] font-black disabled:opacity-40 whitespace-nowrap";
  const delBtn = (fn) => <button type="button" disabled={ro} onClick={fn} aria-label="줄 삭제" className="h-11 w-11 rounded-xl border border-[#DCE3EE] bg-white text-[#5B6B85] hover:text-[#B42318] disabled:opacity-40 col-start-4 row-start-1 md:col-start-auto md:row-start-auto">✕</button>;

  const editor = (
    <div className="space-y-3 min-w-0" onKeyDown={enterNext} data-testid="pay-editor">
      {/* 직원 정보(회원·인사 정보에서 자동) */}
      <div className={`${sec} px-4 py-3.5`}>
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-[#0F1A30] text-white grid place-items-center text-[19px] font-black shrink-0">{String(u.name || "?").slice(0, 1)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap"><b className="text-[19px] text-[#0F1A30]">{personName(u) || u.name}</b><RowChip st={st} unsaved={!row.slip} />{dirty && <span className="h-7 px-2.5 rounded-lg text-[14px] font-black inline-flex items-center border border-[#2D4C82] text-[#2D4C82]">수정 중 · 저장 안 됨</span>}</div>
            <div className="text-[14px] font-bold text-[#5B6B85] truncate">{[u.team, u.position, u.employmentStatus || "재직"].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="flex gap-1 shrink-0"><button type="button" onClick={onPrev} className="w-10 h-10 rounded-xl border border-[#DCE3EE] bg-white text-[16px] font-black text-[#1B2B4B]" aria-label="이전 직원">‹</button><button type="button" onClick={onNext} className="w-10 h-10 rounded-xl border border-[#DCE3EE] bg-white text-[16px] font-black text-[#1B2B4B]" aria-label="다음 직원">›</button></div>
        </div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          {[["입사일", u.hireDate || "-"], ["연락처", u.phone || u.mobile || "-"], ["이메일", u.email || "-"]].map(([k, v]) => <div key={k} className="rounded-xl bg-[#F5F8FD] px-3 py-2 min-w-0"><div className="text-[14px] font-bold text-[#5B6B85]">{k}</div><div className="text-[14px] font-black text-[#0F1A30] truncate" style={NUMS}>{v}</div></div>)}
          <div className="rounded-xl bg-[#F5F8FD] px-3 py-2 min-w-0"><div className="text-[14px] font-bold text-[#5B6B85]">생년월일</div>
            {u.birthDate ? <div className="text-[14px] font-black text-[#0F1A30]" style={NUMS}>{u.birthDate}</div> : <CustomDatePicker disabled={ro} value={emp.birthDate || ""} onChange={(e) => setEmp("birthDate", e.target.value)} placeholder="입력" className="w-full h-7 bg-transparent text-[14px] font-black text-[#0F1A30] outline-none text-left" />}</div>
        </div>
      </div>

      {/* 급여 기본 */}
      <div className={sec}>
        <H en="BASE PAY">급여 기본 <span className="text-[14px] font-bold text-[#5B6B85]">· 직원 설정에도 저장</span></H>
        <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-2.5">
          <div><Label>급여형태</Label><Sel disabled={ro} value={payType} onChange={(v) => setEmp("payType", v)} options={PAY_TYPES.map(([k, l]) => [k, `${l}제`])} testid="ed-paytype" /></div>
          <div><Label>고용형태</Label><Sel disabled={ro} value={emp.employmentType || "정규직"} onChange={(v) => setEmp("employmentType", v)} options={EMP_TYPES} testid="ed-emptype" /></div>
          <div className="col-span-2 md:col-span-1">
            {payType === "hourly" ? <><Label hint={`최저 ${wonFmt(rates.minWage)}원`}>시급</Label><Money disabled={ro} value={emp.hourlyWage} onChange={(v) => setEmp("hourlyWage", v)} testid="ed-base" /></>
              : payType === "daily" ? <><Label hint={`최저 ${wonFmt(rates.minWage * 8)}원(8h)`}>일급</Label><Money disabled={ro} value={emp.dailyWage} onChange={(v) => setEmp("dailyWage", v)} testid="ed-base" /></>
                : payType === "annual" ? <><Label hint="1년 총액">연봉</Label><Money disabled={ro} value={emp.annualSalary} onChange={(v) => setEmp("annualSalary", v)} testid="ed-base" /></>
                  : <><Label hint="월 소정근로 기준">월 기본급</Label><Money disabled={ro} value={emp.baseMonthly} onChange={(v) => setEmp("baseMonthly", v)} testid="ed-base" /></>}
          </div>
          {payType === "annual" && <AnnualBox emp={emp} ro={ro} setEmp={setEmp} />}
          <div><Label hint={`기본 ${runPayDate}`}>지급일</Label><CustomDatePicker disabled={ro} value={input.payDate || runPayDate} onChange={(e) => setIn("payDate", e.target.value)} className={`${inp} text-left`} showIcon /></div>
          <div className="col-span-1 md:col-span-2"><Label hint={accounts.length ? `저장된 계좌 ${accounts.length}개` : "저장된 계좌 없음"}>지급 계좌</Label>
            <Sel disabled={ro} value={acctNew ? "__new" : acctKey(curAcct)} onChange={pickAcct} placeholder="계좌 선택 안 함" options={[...accounts.map((x) => [acctKey(x), acctText(x)]), ["__new", "+ 새 계좌 직접 입력"]]} testid="ed-account" /></div>
          {(acctNew || (curAcct && !accounts.some((y) => acctKey(y) === acctKey(curAcct)))) && !ro && (
            <div className="col-span-2 md:col-span-3 grid grid-cols-2 md:grid-cols-[180px_minmax(0,1fr)_140px] gap-2 rounded-xl bg-[#F5F8FD] p-2.5">
              <Sel value={curAcct?.bank || ""} onChange={(v) => editAcct({ bank: v })} placeholder="은행 선택" options={BANK_NAMES} testid="ed-bank" />
              <input inputMode="numeric" value={curAcct?.acct ? formatAccount(curAcct.bank, curAcct.acct) : ""} onChange={(e) => editAcct({ acct: onlyDigits(e.target.value) })} placeholder="계좌번호" className={`${inp} col-span-2 md:col-span-1 order-3 md:order-none`} style={NUMS} />
              <input value={curAcct?.holder || ""} onChange={(e) => editAcct({ holder: e.target.value })} placeholder="예금주" className={inp} />
            </div>
          )}
        </div>
      </div>

      {/* 근무시간 */}
      <div className={sec}>
        <H en="HOURS · ATTENDANCE" right={!ro && <button type="button" onClick={() => setS((p) => { const n = { ...p.input }; ["workDays", "regularHours", "otHours", "nightHours", "holHours", "holOverHours"].forEach((k) => delete n[k]); return { ...p, input: n }; })} className="h-9 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[14px] font-black text-[#1B2B4B]">출근기록 값으로</button>}>근무시간 <span className="text-[14px] font-bold text-[#5B6B85]">· 비우면 출근기록부 값</span></H>
        <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {hourField("workDays", "근로일수")}
          {payType === "hourly" && hourField("regularHours", "정상 근로시간")}
          {payType === "daily" && <div><Label hint="근로일수 × 8h">정상 근로시간</Label><div className={`${numInp} flex items-center justify-end bg-[#F5F7FB]`} style={NUMS}>{toNum(!blank(input.workDays) ? input.workDays : a.workDays) * 8}h</div></div>}
          {hourField("otHours", "연장근로")}
          {hourField("nightHours", "야간(22~06시)")}
          {hourField("holHours", "휴일근로 8h 이내")}
          {hourField("holOverHours", "휴일근로 8h 초과")}
          {payType !== "monthly" && <div><Label hint="주 15h 이상">주휴시간</Label><input disabled={ro} inputMode="decimal" value={input.weeklyHolidayHours ?? ""} onChange={(e) => setIn("weeklyHolidayHours", e.target.value.replace(/[^\d.]/g, ""))} className={numInp} style={NUMS} placeholder="0" /></div>}
        </div>
      </div>

      {/* 지급 항목 */}
      <div className={sec}>
        <H en="EARNINGS" right={!ro && <button type="button" onClick={() => setS((p) => ({ ...p, payRows: [...p.payRows, { id: rid(), kind: "", amount: 0, scope: "month", taxable: true }] }))} className="h-9 px-3 rounded-lg bg-[#0F1A30] text-white text-[14px] font-black" data-testid="add-pay">+ 수당 추가</button>}>지급 항목</H>
        <div className="px-4 pb-4 space-y-2">
          {autoRows.map((e) => <div key={e.key} className="flex items-center gap-2 rounded-xl bg-[#F5F8FD] px-3 py-2"><span className="text-[14px] font-black text-[#1B2B4B]">{e.label}</span><span className="text-[14px] font-bold text-[#5B6B85] truncate flex-1">{e.calc}</span><b className="text-[15px] text-[#0F1A30]" style={NUMS}>{wonFmt(e.amount)}</b></div>)}
          {s.payRows.length > 0 && <div className="hidden md:grid grid-cols-[minmax(0,1.5fr)_140px_108px_100px_44px] gap-1.5 px-0.5 text-[14px] font-black text-[#5B6B85]"><span>수당 종류</span><span className="text-right pr-2">금액(원)</span><span>지급</span><span>세금</span><span /></div>}
          {s.payRows.map((r) => (
            <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_44px] md:grid-cols-[minmax(0,1.5fr)_140px_108px_100px_44px] gap-1.5 items-start" data-testid="pay-row">
              <div className="col-span-3 md:col-span-1 space-y-1.5">
                <Sel disabled={ro} value={r.kind} onChange={(v) => pickKind(r, v)} placeholder="수당 종류 선택" groups={payGroups} ariaLabel="수당 종류" />
                {r.kind === "기타" && <input disabled={ro} value={r.name || ""} onChange={(e) => setPay(r.id, { name: e.target.value })} placeholder="항목 이름(명세서에 표시)" className={inp} />}
              </div>
              <Money disabled={ro} value={r.amount} onChange={(v) => setPay(r.id, { amount: v })} />
              <Sel disabled={ro || FIXED_ONLY.includes(r.kind) || MONTH_ONLY.includes(r.kind)} value={r.scope} onChange={(v) => setPay(r.id, { scope: v })} options={[["fixed", "매월"], ["month", "이번 달"]]} ariaLabel="지급 구분" />
              <Sel disabled={ro || MONTH_ONLY.includes(r.kind)} value={r.taxable === false ? "n" : "y"} onChange={(v) => setPay(r.id, { taxable: v === "y" })} options={[["y", "과세"], ["n", "비과세"]]} ariaLabel="과세 구분" />
              {delBtn(() => setS((p) => ({ ...p, payRows: p.payRows.filter((x) => x.id !== r.id) })))}
            </div>
          ))}
          {!s.payRows.length && <div className="text-[14px] font-bold text-[#7A879C] py-1">추가 수당이 없습니다 — [+ 수당 추가]로 식대·직책수당·상여 등을 넣으세요</div>}
          {result && <div className="flex items-center justify-between rounded-xl border border-[#1B2B4B] px-3.5 py-2.5"><span className="text-[14px] font-black text-[#1B2B4B]">지급 총액 <span className="font-bold text-[#5B6B85]">· 과세 {wonFmt(result.taxable)} · 비과세 {wonFmt(result.nonTaxable)}</span></span><b className="text-[18px] text-[#0F1A30]" style={NUMS}>{wonFmt(result.gross)}원</b></div>}
        </div>
      </div>

      {/* 공제 항목 */}
      <div className={sec}>
        <H en="DEDUCTIONS">공제 항목</H>
        <div className="px-4 pb-4 space-y-3">
          <div>
            <div className="text-[14px] font-black text-[#3A4A66] mb-1.5">4대보험 <span className="font-bold text-[#7A879C]">· 자동 계산{free ? " · 프리랜서는 적용 제외" : ""}</span></div>
            <div className="rounded-xl border border-[#E3E8F0] divide-y divide-[#EEF1F6]">
              {[["np", "국민연금", "npExempt", "npBase", "기준소득월액"], ["hi", "건강보험", "hiExempt", "hiBase", "보수월액"], ["ltc", "장기요양보험", null, null, "건강보험료 연동"], ["ei", "고용보험", "eiExempt", null, "과세급여 기준"]].map(([k, l, ex, base, bl]) => (
                <div key={k} className="px-3 py-2 grid grid-cols-[minmax(0,1fr)_104px_minmax(0,1fr)] md:grid-cols-[120px_104px_minmax(0,1fr)_120px] gap-2 items-center">
                  <span className="text-[14px] font-black text-[#0F1A30]">{l}</span>
                  {ex ? <Sel disabled={ro || free} value={emp[ex] || free ? "n" : "y"} onChange={(v) => setEmp(ex, v === "n")} options={[["y", "적용"], ["n", "제외"]]} ariaLabel={`${l} 적용`} /> : <span className="text-[14px] font-bold text-[#7A879C] text-center">건강보험 따름</span>}
                  {base ? <Money disabled={ro || free || emp[ex]} value={emp[base]} onChange={(v) => setEmp(base, v || "")} placeholder={`${bl} 자동 ${wonFmt(k === "np" ? result?.npBase : result?.hiBase)}`} className="hidden md:block" /> : <span className="hidden md:block text-[14px] font-bold text-[#7A879C]">{bl}</span>}
                  <b className="text-right text-[15px] text-[#0F1A30] col-start-3 md:col-start-auto" style={NUMS}>{wonFmt(D(k))}</b>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[14px] font-black text-[#3A4A66] mb-1.5">소득세 · 지방소득세 <span className="font-bold text-[#7A879C]">· 자동 계산, 직접 입력하면 그 값</span></div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>부양가족 <span className="font-bold text-[#7A879C]">(본인 제외)</span></Label><Sel disabled={ro || free} value={String(Math.max(0, (toNum(emp.dependents) || 1) - 1))} onChange={(v) => setEmp("dependents", toNum(v) + 1)} options={N0_10.map((n) => [String(n), `${n}명`])} testid="ed-dependents" /></div>
              <div><Label hint="8~20세">자녀</Label><Sel disabled={ro || free} value={String(toNum(emp.children))} onChange={(v) => setEmp("children", toNum(v))} options={N0_10.map((n) => [String(n), `${n}명`])} testid="ed-children" /></div>
              <div><Label>세액 비율</Label><Sel disabled={ro || free} value={String(toNum(emp.taxRatePct) || 100)} onChange={(v) => setEmp("taxRatePct", toNum(v))} options={TAX_RATES.map((p) => [String(p), `${p}%`])} testid="ed-taxrate" /></div>
              <div><Label hint={`자동 ${wonFmt(result?.autoTax)}`}>{free ? "사업소득세" : "소득세"} 직접</Label><input disabled={ro} inputMode="numeric" value={input.taxOverride ?? ""} onChange={(e) => setIn("taxOverride", e.target.value.replace(/[^\d]/g, ""))} placeholder={wonFmt(D("tax"))} className={numInp} style={NUMS} data-testid="ed-tax" /></div>
              <div><Label hint="소득세 × 10%">지방세 직접</Label><input disabled={ro} inputMode="numeric" value={input.localTaxOverride ?? ""} onChange={(e) => setIn("localTaxOverride", e.target.value.replace(/[^\d]/g, ""))} placeholder={wonFmt(D("local"))} className={numInp} style={NUMS} /></div>
              <div><Label hint="간이세액표 금액">고정 세액(월)</Label><input disabled={ro || free} inputMode="numeric" value={emp.taxFixed ?? ""} onChange={(e) => setEmp("taxFixed", e.target.value.replace(/[^\d]/g, ""))} placeholder="자동" className={numInp} style={NUMS} /></div>
            </div>
            {result && <div className="mt-2 text-[14px] font-bold text-[#5B6B85]">{(result.deductions || []).filter((d) => d.key === "tax").map((d) => d.calc)} → 소득세 <b className="text-[#0F1A30]" style={NUMS}>{wonFmt(D("tax"))}</b> · 지방소득세 <b className="text-[#0F1A30]" style={NUMS}>{wonFmt(D("local"))}</b></div>}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5"><span className="text-[14px] font-black text-[#3A4A66]">기타 공제 <span className="font-bold text-[#7A879C]">· 이번 달</span></span>
              {!ro && <button type="button" onClick={() => setS((p) => ({ ...p, dedRows: [...p.dedRows, { id: rid(), kind: "", amount: 0 }] }))} className="ml-auto h-9 px-3 rounded-lg border border-[#1B2B4B] bg-white text-[14px] font-black text-[#1B2B4B]" data-testid="add-ded">+ 공제 추가</button>}</div>
            <div className="space-y-1.5">
              {s.dedRows.map((r) => (
                <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_140px_44px] gap-1.5 items-start">
                  <div className="space-y-1.5"><Sel disabled={ro} value={r.kind} onChange={(v) => setDed(r.id, { kind: v })} placeholder="공제 종류 선택" groups={dedGroups} ariaLabel="공제 종류" />
                    {r.kind === "기타" && <input disabled={ro} value={r.name || ""} onChange={(e) => setDed(r.id, { name: e.target.value })} placeholder="항목 이름" className={inp} />}</div>
                  <Money disabled={ro} value={r.amount} onChange={(v) => setDed(r.id, { amount: v })} />
                  <button type="button" disabled={ro} onClick={() => setS((p) => ({ ...p, dedRows: p.dedRows.filter((x) => x.id !== r.id) }))} aria-label="줄 삭제" className="h-11 w-11 rounded-xl border border-[#DCE3EE] bg-white text-[#5B6B85] hover:text-[#B42318] disabled:opacity-40">✕</button>
                </div>
              ))}
              {!s.dedRows.length && <div className="text-[14px] font-bold text-[#7A879C]">가불금 · 기숙사비 · 경조회비 등이 있으면 [+ 공제 추가]</div>}
            </div>
          </div>
          <div><Label>비고 <span className="font-bold text-[#7A879C]">(명세서에 표시)</span></Label><input disabled={ro} value={input.memo || ""} onChange={(e) => setIn("memo", e.target.value)} className={inp} placeholder="예: 11월 성과 반영" /></div>
        </div>
      </div>

      {/* 점검 */}
      {checks.length > 0 && <div className="space-y-1.5" data-testid="pay-checks">{checks.map(([k, m]) => <Note key={m} kind={k}>{m}</Note>)}</div>}

      {/* 차인지급액 · 회사 부담 */}
      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className={`${sec} px-4 py-3.5`}>
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={NUMS}>NET PAY</div>
            <div className="text-[16px] font-black text-[#0F1A30] mb-2">차인지급액 내역</div>
            {[["지급 총액", result.gross, ""], ["4대보험", insOf(result), "−"], ["소득세 · 지방소득세", taxOf(result), "−"], ["기타 공제", otherDedOf(result), "−"]].map(([l, v, sg]) => <div key={l} className="flex justify-between py-1 text-[14.5px] font-bold text-[#3A4A66]"><span>{sg && <span className="text-[#7A879C] mr-1">{sg}</span>}{l}</span><b className="text-[#0F1A30]" style={NUMS}>{wonFmt(v)}</b></div>)}
            <div className="mt-1.5 pt-2 border-t-2 border-[#1B2B4B] flex justify-between items-baseline"><span className="text-[15px] font-black text-[#0F1A30]">= 차인지급액</span><b className="text-[22px] text-[#0F1A30]" style={NUMS} data-testid="ed-net">{wonFmt(result.net)}원</b></div>
          </div>
          <div className={`${sec} px-4 py-3.5`}>
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={NUMS}>EMPLOYER COST</div>
            <div className="text-[16px] font-black text-[#0F1A30] mb-2">회사 부담(인건비)</div>
            {[["국민연금", result.employer?.np], ["건강보험", result.employer?.hi], ["장기요양", result.employer?.ltc], ["고용보험(+고용안정)", result.employer?.ei], ["산재보험", result.employer?.ia]].map(([l, v]) => <div key={l} className="flex justify-between py-0.5 text-[14px] font-bold text-[#3A4A66]"><span>{l}</span><b className="text-[#0F1A30]" style={NUMS}>{wonFmt(v)}</b></div>)}
            <div className="mt-1.5 pt-2 border-t border-[#DCE3EE] flex justify-between text-[14.5px] font-black text-[#0F1A30]"><span>회사 부담 합계</span><span style={NUMS}>{wonFmt(result.employer?.total)}</span></div>
            <div className="flex justify-between items-end gap-2 text-[15px] font-black text-[#0F1A30]"><span className="min-w-0">총 인건비<span className="block text-[14px] font-bold text-[#5B6B85]">지급 총액 + 회사 부담</span></span><b className="text-[18px] whitespace-nowrap" style={NUMS}>{wonFmt(result.costTotal ?? (result.gross + (result.employer?.total || 0)))}원</b></div>
          </div>
        </div>
      )}

      {/* 최근 12개월 · 올해 누계 */}
      <div className={sec}>
        <H en="HISTORY · YTD">최근 12개월 · {ym.slice(0, 4)}년 누계</H>
        <div className="px-4 pb-4 space-y-2.5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[["지급 누계", ytd((r) => r.gross)], ["공제 누계", ytd((r) => r.totalDeduct)], ["원천세 누계", ytd(taxOf)], ["실지급 누계", ytd((r) => r.net)]].map(([l, v]) => <div key={l} className="rounded-xl bg-[#0F1A30] px-3 py-2"><div className="text-[14px] font-bold text-[#8FB0F0]">{l}</div><div className="text-[16px] font-black text-white" style={NUMS}>{wonFmt(v)}</div></div>)}
          </div>
          <div className="text-[14px] font-bold text-[#7A879C]">누계 = {ym.slice(0, 4)}년 지난 달 명세서 {yearRows.length}건 + 이번 달(화면 값)</div>
          {hist12.length ? (
            <div className="overflow-x-auto rounded-xl border border-[#E3E8F0]">
              <table className="w-full min-w-[480px] text-[14px]">
                <thead><tr className="bg-[#F5F8FD] text-[#3A4A66] font-black">{["귀속 월", "지급 총액", "공제", "실지급", "상태"].map((h, i) => <th key={h} className={`px-3 py-2 ${i && i < 4 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[#EEF1F6]">
                  {hist12.map((h) => <tr key={h.id}><td className="px-3 py-2 font-black text-[#0F1A30]" style={NUMS}>{ymLabel(h.ym)}</td><td className="px-3 py-2 text-right font-bold" style={NUMS}>{wonFmt(h.result?.gross)}</td><td className="px-3 py-2 text-right font-bold" style={NUMS}>{wonFmt(h.result?.totalDeduct)}</td><td className="px-3 py-2 text-right font-black text-[#0F1A30]" style={NUMS}>{wonFmt(h.result?.net)}</td><td className="px-3 py-2"><RowChip st={rowStatus({ result: h.result, slip: h })} /></td></tr>)}
                </tbody>
              </table>
            </div>
          ) : <div className="text-[14px] font-bold text-[#7A879C]">지난 명세서가 없습니다</div>}
        </div>
      </div>
    </div>
  );

  const actions = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button type="button" disabled={!result} onClick={() => printPayslips([slipPreview], company)} className={`${btn} border border-[#DCE3EE] bg-white text-[#1B2B4B]`} data-testid="slip-print">인쇄 · PDF</button>
      {!roIn && !locked && <button type="button" disabled={busy || !result} onClick={() => onSave(live)} className={`${btn} border border-[#1B2B4B] bg-white text-[#1B2B4B]`} data-testid="slip-save">{dirty ? "저장" : "저장(계산됨)"}</button>}
      {!roIn && !locked && <button type="button" disabled={busy || !result} onClick={() => onConfirm(live)} className={`${btn} bg-[#0F1A30] text-white`} data-testid="slip-confirm">확정</button>}
      {!roIn && row.slip?.status !== "paid" && !row.slip?.published && <button type="button" disabled={busy || !result} onClick={() => onPublish(live)} className={`${btn} bg-[#2D4C82] text-white`} data-testid="slip-publish">발행</button>}
      {!roIn && row.slip?.status === "confirmed" && <button type="button" disabled={busy} onClick={() => onUnlock(row)} className={`${btn} border border-[#DCE3EE] bg-white text-[#3A4A66]`}>확정 해제</button>}
    </div>
  );
  const preview = (
    <div className={`${sec} overflow-hidden`} data-testid="pay-preview">
      <div className="px-4 py-3 flex items-center gap-2 flex-wrap border-b border-[#EEF1F6]">
        <div className="min-w-0"><div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={NUMS}>LIVE PREVIEW</div><div className="text-[16px] font-black text-[#0F1A30]">급여명세서 미리보기 <span className="text-[14px] font-bold text-[#5B6B85]">· 입력하면 바로 반영</span></div></div>
        <span className="flex-1" />
        {actions}
      </div>
      <div className={`p-3 md:p-4 bg-[#F4F6FA] ${wide ? "max-h-[calc(100vh-170px)] overflow-y-auto" : ""}`}>
        {result ? <div className="kp-payslip-pane rounded-2xl bg-white p-3 md:p-4 shadow-[0_6px_18px_rgba(15,26,48,0.08)]"><PayslipView slip={slipPreview} company={company} /></div>
          : <div className="py-16 text-center text-[15px] font-bold text-[#5B6B85]">기본급(또는 시급·일급)을 입력하면 명세서가 나타납니다</div>}
        {result && (result.taxMode === "auto") && <div className="mt-3"><Note>소득세는 {TAX_NOTE}입니다.</Note></div>}
        {locked && <div className="mt-3"><Note>{row.slip?.status === "paid" ? `지급 완료(${row.slip?.paidDate || "-"}) — 수정할 수 없습니다` : "확정(잠금)된 명세서입니다 — 고치려면 [확정 해제]"}</Note></div>}
      </div>
    </div>
  );
  if (xwide) return <div className="grid grid-cols-[minmax(330px,0.8fr)_minmax(0,1.25fr)_minmax(0,1.15fr)] gap-3 items-start"><div className="min-w-0 sticky top-0 self-start">{listNode}</div><div className="min-w-0">{editor}</div><div className="min-w-0 sticky top-0 self-start">{preview}</div></div>;
  if (wide) return <div className="grid grid-cols-2 gap-3 items-start"><div className="space-y-3 min-w-0">{listNode}{editor}</div><div className="min-w-0 sticky top-0 self-start">{preview}</div></div>;
  return pane === "preview" ? preview : <div className="space-y-3">{listNode}{editor}<div className="sticky bottom-2 z-10 rounded-2xl bg-white/95 backdrop-blur border border-[#E3E8F0] shadow-[0_10px_30px_rgba(15,26,48,0.16)] px-3 py-2.5 flex items-center gap-2 flex-wrap"><span className="text-[14px] font-bold text-[#5B6B85]">실지급 <b className="text-[17px] text-[#0F1A30]" style={NUMS}>{result ? wonFmt(result.net) : "-"}원</b></span><span className="flex-1" />{actions}</div></div>;
}

// ── 직원 급여 설정 ──
// ⭐ 2026-11-07 2칸 화면 — 왼쪽: 검색 + 필터(부서·직책·재직·급여형태·상태) 목록 / 오른쪽: 고른 직원 상세(기본 급여 · 수당 · 소득세 · 4대보험 · 계좌 · 근로계약서)
//  모바일·좁은 화면: 목록 → 고르면 상세(뒤로)
function PayEmployees({ company, ro }) {
  const wide = useMedia("(min-width: 1100px)");
  const staff = useStaff(company);
  const emps = useCol("payrollEmployees", company);
  const settings = usePayrollSettings(company);
  const hr = useHrOptions(company);
  const kinds = useItemKinds(settings, emps, null);
  const rates = ratesFor(settings || {}, Number(kstYm().slice(0, 4)));
  const map = Object.fromEntries((emps || []).map((e) => [e.uid, e]));
  const [selId, setSelId] = React.useState(null);
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
  const sel = all.find((u) => u.id === selId) || null;
  const open = (u) => { setSelId(u.id); const e = { ...EMP_BLANK, ...(map[u.id] || {}) }; if (!e.payAccount) e.payAccount = userAccounts(u)[0] || null; setF(e); setBase(JSON.stringify(cleanEmp(e))); setPaneTab("pay"); };
  // 넓은 화면은 첫 직원을 바로 연다
  React.useEffect(() => { if (wide && !selId && list[0] && emps) open(list[0]); }); // eslint-disable-line react-hooks/exhaustive-deps
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
    <div className={`${sec} overflow-hidden min-w-0 ${wide ? "sticky top-0 self-start" : ""}`} data-testid="payemp-list">
      <div className="p-3.5 space-y-2 border-b border-[#EEF1F6]">
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
      <div className={`divide-y divide-[#EEF1F6] overflow-y-auto ${wide ? "max-h-[calc(100vh-430px)] min-h-[300px]" : ""}`}>
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
    <div className="space-y-3 min-w-0" onKeyDown={enterNext} data-testid="payemp-detail">
      <div className={`${sec} px-4 py-3.5`}>
        <div className="flex items-center gap-3 flex-wrap">
          {!wide && <button type="button" onClick={() => setSelId(null)} className="w-10 h-10 rounded-xl border border-[#DCE3EE] bg-white text-[16px] font-black text-[#1B2B4B]" aria-label="목록으로">‹</button>}
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
    <div className={`${sec} py-24 text-center text-[15px] font-bold text-[#7A879C]`}>왼쪽에서 직원을 고르세요</div>
  );

  return (
    <div className="space-y-3" data-testid="payroll-emps">
      <BookHero en="PAYROLL · EMPLOYEES" title="직원 급여 설정" desc="월급 · 연봉 · 시급 · 일급, 수당, 부양가족, 4대보험, 지급 계좌, 근로계약서. 한 번 정해 두면 매달 그대로 계산해요"
        kpis={[["직원", `${all.length}명`], ["설정 완료", `${nDone}명`], ["설정 필요", `${all.length - nDone}명`], ["연봉제", `${all.filter((u) => map[u.id]?.payType === "annual").length}명`]]} />
      {wide ? <div className="grid grid-cols-[minmax(320px,380px)_minmax(0,1fr)] gap-3 items-start">{listNode}{detail}</div> : sel ? detail : listNode}
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
      <BookHero en={`PAYROLL · RATES · ${year}`} title="요율 · 급여 설정" desc="처음 값은 그 해 법정 요율이에요. 고시가 바뀌면 여기서 고치면 되고, 확정한 달은 그때 요율이 그대로 남아요"
        right={<Sel dark ariaLabel="연도" value={String(year)} onChange={(v) => setYear(Number(v))} options={yearOpts.map((y) => [String(y), `${y}년 요율`])} className="w-[160px]" />} />
      <div className={`${sec} p-4`}>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <div className="min-w-0"><div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={NUMS}>SOCIAL INSURANCE</div><div className="text-[17px] font-black text-[#0F1A30]">{year}년 4대보험 요율 <span className="text-[14px] font-bold text-[#5B6B85]">· 근로자 부담</span></div></div>
          <span className="flex-1" />
          {changed > 0 && <span className="text-[14px] font-bold text-[#2D4C82]">기준값과 다른 칸 {changed}개</span>}
          {!ro && <button type="button" onClick={() => setF({ ...presetFor(year) })} className="h-10 px-3.5 rounded-xl border border-[#1B2B4B] bg-white text-[14px] font-black text-[#1B2B4B]" data-testid="rates-reset">{year} 기준값으로</button>}
        </div>
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
