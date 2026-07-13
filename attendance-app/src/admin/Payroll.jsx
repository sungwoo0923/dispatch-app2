import { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  Wallet,
  FileSpreadsheet,
  Lock,
  LockOpen,
  CalculatorIcon,
  HelpCircle,
  RefreshCw,
  Trash2,
  CheckSquare,
  Settings2,
  Receipt,
  Printer,
} from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import { calcMonthlyPayroll, getSiteInsuranceRates } from "../utils/payroll";
import { toMonthKey, toDateKey, formatTime, formatDate, birthDateFromResident } from "../utils/dateUtils";
import { downloadCsv } from "../utils/exportCsv";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  SHIFT_TYPE_OPTIONS,
  PAY_TYPE_OPTIONS,
  NATIONALITY_OPTIONS,
  COUNTRY_OPTIONS,
} from "../constants/hr";

const PERIOD_LABELS = { daily: "일급", weekly: "주급", monthly: "월급" };
const INSURANCE_ITEMS = ["국민연금", "건강보험", "요양보험", "고용보험"];
const DEDUCTION_ITEMS = ["지각공제", "조퇴공제", "기타공제"];

// 급여명세서 지급/공제 항목 확장 — 기존 base/overtimePay/weeklyAllowance/
// allowances/mealAllowance/lateDeduction/earlyLeaveDeduction(지급) 및
// deductions.{pension,health,longTermCare,employment}(공제) 계산 로직은
// 그대로 두고, 관리자가 수동으로 입력하는 추가 항목만 최상위(지급)/
// deductions 하위(공제)에 옵션 필드로 얹는다. 값이 없으면 명세서에 해당
// 줄 자체를 렌더링하지 않아 기존 정산 데이터도 그대로 문제없이 보인다.
const PAYMENT_EXTRA_FIELDS = [
  ["bonus", "상여"],
  ["positionAllowance", "직책수당"],
  ["annualLeaveAllowance", "연차수당"],
  ["specialBonus", "특별상여"],
  ["holidayPay", "휴일근로수당"],
  ["businessTripAllowance", "출장수당"],
  ["longServiceAllowance", "장기근속수당"],
  ["commAllowance", "통신비지원금"],
];
const DEDUCTION_EXTRA_FIELDS = [
  ["otherDeduction", "기타공제액"],
  ["healthAdjustment", "건강보험정산"],
  ["advancePayment", "선지급금"],
  ["incomeTax", "소득세"],
  ["localIncomeTax", "지방소득세"],
  ["yearEndIncomeTax", "연말정산소득세"],
  ["yearEndLocalIncomeTax", "연말정산지방소득세"],
];

function emptyExtraForm() {
  const out = {};
  PAYMENT_EXTRA_FIELDS.forEach(([k]) => (out[k] = 0));
  DEDUCTION_EXTRA_FIELDS.forEach(([k]) => (out[k] = 0));
  return out;
}

// calcMonthlyPayroll()이 돌려주는 result(base/overtimePay/... + grossPay/
// deductions/netPay)에, 위 확장 항목들의 합계를 얹어 grossPay/deductions.total/
// netPay를 다시 계산한다. paymentSource/deductionSource는 각각 확장 지급/공제
// 필드를 담고 있는 아무 객체(폼 state, 기존 payrolls 문서, 기존 문서의
// deductions 하위 객체 등)나 받을 수 있어 save()/runSettlement()/
// applyAdjustment() 세 곳에서 동일하게 재사용한다.
function withExtraTotals(result, paymentSource, deductionSource) {
  const extraPayments = Object.fromEntries(PAYMENT_EXTRA_FIELDS.map(([k]) => [k, Number(paymentSource?.[k] || 0)]));
  const extraDeductions = Object.fromEntries(DEDUCTION_EXTRA_FIELDS.map(([k]) => [k, Number(deductionSource?.[k] || 0)]));
  const extraPaymentsTotal = Object.values(extraPayments).reduce((s, v) => s + v, 0);
  const extraDeductionsTotal = Object.values(extraDeductions).reduce((s, v) => s + v, 0);
  const grossPay = result.grossPay + extraPaymentsTotal;
  const deductionsTotal = result.deductions.total + extraDeductionsTotal;
  return {
    ...result,
    ...extraPayments,
    grossPay,
    netPay: grossPay - deductionsTotal,
    deductions: { ...result.deductions, ...extraDeductions, total: deductionsTotal },
  };
}

// 주민/외국인번호 앞자리에서 생년월일을 뽑아 급여명세서 상단 정보표에 쓴다.
function birthDateDisplay(residentNumberFront) {
  const key = birthDateFromResident(residentNumberFront);
  return key ? formatDate(key) : "-";
}

const GUIDE_NOTES = [
  "급여 형태 및 기간 선택: 일급,주급,월급을 선택할 수 있으며 기간별로 정산 조회가 가능합니다.",
  "4대보험 Y/N: 4대보험 여부에 따라 정산 조회가 가능합니다.",
  "소계 Y/N: 시간/수당/보험요율 변경으로 나뉜 근로자 정산내역을 '소계 보기'로 한 줄로 묶어 쉽게 확인 할 수 있습니다.",
  "요일별 근무시간 Y/N: 정산에 사용되는 실제 출,퇴근 시간을 확인할 수 있습니다.",
  "템플릿 정보 Y/N: 시간/수당/보험요율 템플릿 정보를 숨김 또는 표시 설정이 가능합니다.",
  "보험,수당,공제 선택: 보험료,수당,공제항목을 선택하여 금액을 수정할 수 있습니다.",
  "정산처리 요청: 출근 현황 기준으로 실시간 정산이 가능하며, 결과를 바로 확인할 수 있습니다.",
  "정산 확정: 정산을 확정하면 수정이 불가능하며, 근로자의 급여 명세서가 자동생성됩니다.",
  "정산 확정 취소: 이미 확정된 정산도 필요한 경우 취소할 수 있습니다.",
];

function defaultRangeFor(periodType, base = toDateKey()) {
  const end = new Date(`${base}T00:00:00`);
  const start = new Date(end);
  if (periodType === "daily") {
    // same day
  } else if (periodType === "weekly") {
    start.setDate(start.getDate() - 6);
  } else {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  }
  return { start: toDateKey(start), end: toDateKey(end) };
}

const EMPTY_FILTERS = {
  siteId: "",
  vendorId: "",
  shiftType: "",
  employmentType: "",
  team: "",
  payType: "",
  nationality: "",
  country: "",
  name: "",
  phone: "",
  residentQuery: "",
  bankQuery: "",
  insuranceYN: "",
  subtotalView: "포함",
  showDailyHours: "N",
  showTemplateInfo: "포함",
};

export default function Payroll() {
  const { profile } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [companyName, setCompanyName] = useState("");
  const [payrollInfo, setPayrollInfo] = useState({ payday: "", depositTime: "", contactPhone: "" });
  const [payrollInfoOpen, setPayrollInfoOpen] = useState(false);
  const [payrollInfoForm, setPayrollInfoForm] = useState({ payday: "", depositTime: "", contactPhone: "" });
  const [month, setMonth] = useState(toMonthKey());
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [allowanceTemplates, setAllowanceTemplates] = useState([]);
  const [target, setTarget] = useState(null);
  const [form, setForm] = useState({
    wageType: "hourly",
    baseWage: 12000,
    hoursWorked: 160,
    overtimeHours: 0,
    weeklyEligibleWeeks: 4,
    allowances: 0,
    mealAllowance: 0,
    lateDeduction: 0,
    earlyLeaveDeduction: 0,
    ...emptyExtraForm(),
  });

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState(() => new Set());
  const [adjustForm, setAdjustForm] = useState({ insuranceItem: "", allowanceItem: "", deductionItem: "", note: "" });
  const [showGuide, setShowGuide] = useState(false);

  const [settleOpen, setSettleOpen] = useState(false);
  const [settleForm, setSettleForm] = useState({ periodType: "monthly", monthEndOnly: false, ...defaultRangeFor("monthly") });
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(doc(db, "companies", profile.companyId), (s) => {
      setCompanyName(s.data()?.name || "");
      const info = { payday: s.data()?.payrollPayday || "", depositTime: s.data()?.payrollDepositTime || "", contactPhone: s.data()?.payrollContactPhone || "" };
      setPayrollInfo(info);
      setPayrollInfoForm(info);
    });
    return () => unsub();
  }, [profile?.companyId]);

  // 급여일/입금시간/직통번호 — 직원 모바일 급여관리 화면 상단에 고정으로
  // 노출되고, 문제가 있을 때 바로 전화/문자할 수 있는 연락처로도 쓰인다.
  const savePayrollInfo = async () => {
    await updateDoc(doc(db, "companies", profile.companyId), {
      payrollPayday: payrollInfoForm.payday,
      payrollDepositTime: payrollInfoForm.depositTime,
      payrollContactPhone: payrollInfoForm.contactPhone,
    });
    toast.success("저장되었습니다");
    setPayrollInfoOpen(false);
  };

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(
        query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
        (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) =>
        setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (snap) =>
        setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "departments"), where("companyId", "==", profile.companyId)), (snap) =>
        setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "allowanceTemplates"), where("companyId", "==", profile.companyId)), (snap) =>
        setAllowanceTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "payrolls"), where("companyId", "==", profile.companyId), where("month", "==", month)),
      (snap) => setPayrolls(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId, month]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("month", "==", month)),
      (snap) => setAttendance(snap.docs.map((d) => d.data()))
    );
    return () => unsub();
  }, [profile?.companyId, month]);

  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";
  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "-";

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (!emp.approved) return false;
      if (filters.siteId && emp.workSiteId !== filters.siteId) return false;
      if (filters.vendorId && emp.vendorId !== filters.vendorId) return false;
      if (filters.shiftType && emp.shiftType !== filters.shiftType) return false;
      if (filters.employmentType && emp.employmentType !== filters.employmentType) return false;
      if (filters.team && emp.team !== filters.team) return false;
      if (filters.payType && emp.payType !== filters.payType) return false;
      if (filters.nationality && emp.nationality !== filters.nationality) return false;
      if (filters.country && emp.country !== filters.country) return false;
      if (filters.name && !emp.name?.includes(filters.name)) return false;
      if (filters.phone && !emp.phone?.includes(filters.phone)) return false;
      if (filters.residentQuery && !(emp.residentNumberFront || "").includes(filters.residentQuery)) return false;
      if (filters.bankQuery && !`${emp.bankName || ""}${emp.bankAccount || ""}`.includes(filters.bankQuery)) return false;
      if (filters.insuranceYN && emp.insuranceApplied !== filters.insuranceYN) return false;
      return true;
    });
  }, [employees, filters]);

  const payrollFor = (uid) => payrolls.find((p) => p.uid === uid);

  const [previewFor, setPreviewFor] = useState(null); // { emp, p }
  const openPreview = (emp) => {
    const p = payrollFor(emp.id);
    if (!p) return;
    setPreviewFor({ emp, p });
  };

  // 근로자목록/스케줄 화면과 동일한 우클릭 컨텍스트 메뉴 패턴 — 정산 데이터가
  // 없는 근로자는 "수정"을 선택(또는 행을 더블클릭)하면 급여입력 팝업이
  // 생성 모드로, 있는 근로자는 수정 모드로 동일하게 뜬다.
  const [rowMenu, setRowMenu] = useState(null); // { x, y, emp }
  const openRowMenu = (e, emp) => {
    e.preventDefault();
    setRowMenu({ x: e.clientX, y: e.clientY, emp });
  };
  const closeRowMenu = () => setRowMenu(null);

  useEffect(() => {
    if (!rowMenu) return;
    const onDocClick = () => closeRowMenu();
    document.addEventListener("click", onDocClick);
    document.addEventListener("scroll", onDocClick, true);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("scroll", onDocClick, true);
    };
  }, [rowMenu]);

  // 급여명세서 지급일 — 사업자에 급여일(payrollInfo.payday, 매월 며칠)이
  // 설정되어 있으면 해당 정산월과 조합해 실제 날짜로 보여주고, 미설정이면
  // 발급일(오늘)로 대체한다.
  const payDateFor = (p) =>
    payrollInfo.payday ? `${p.month}-${String(payrollInfo.payday).padStart(2, "0")}` : toDateKey();

  const printPayslip = () => {
    if (!previewFor) return;
    const { emp, p } = previewFor;
    const d = p.deductions || {};
    const row = (label, value, strong) =>
      `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;${strong ? "font-weight:700;border-top:1px dashed #cbd5e1;margin-top:6px;padding-top:10px;" : "color:#475569;"}"><span>${label}</span><span style="color:#0f172a;font-weight:${strong ? 700 : 600}">${Number(value || 0).toLocaleString()}원</span></div>`;
    const rowIf = (label, value, strong) => (Number(value || 0) ? row(label, value, strong) : "");
    const info = (label, value) => `<div><span>${label}</span><span style="font-weight:600">${value ?? "-"}</span></div>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>급여명세서 - ${emp.name}</title>
      <style>body{font-family:'Malgun Gothic',sans-serif;max-width:420px;margin:24px auto;color:#0f172a;}
      .card{border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;margin-bottom:16px;}
      .head{background:#0f172a;color:#fff;text-align:center;padding:16px;}
      .info{padding:16px;border-bottom:1px dashed #e2e8f0;font-size:13px;}
      .info div{display:flex;justify-content:space-between;padding:2px 0;}
      .net{padding:20px;text-align:center;}
      .body{padding:16px;}
      .title{font-weight:700;font-size:13px;margin-bottom:6px;}
      </style></head><body>
      <div class="card">
        <div class="head"><p style="margin:0;font-size:12px;opacity:.7">급여명세서</p><p style="margin:4px 0 0;font-size:17px;font-weight:700">${companyName || ""}</p></div>
        <div class="info">
          ${info("회사명", companyName || "-")}
          ${info("성명", emp.name)}
          ${info("생년월일", birthDateDisplay(emp.residentNumberFront))}
          ${info("입사일", emp.hireDate ? formatDate(emp.hireDate) : "-")}
          ${info("직책", emp.position || "-")}
          ${info("직급", emp.position || "-")}
          ${info("부서", emp.team || "-")}
          ${info("지급일", payDateFor(p))}
          ${info("지급대상기간", p.month)}
          ${info("발급일", toDateKey())}
          ${info("비고", p.note || "-")}
        </div>
        <div class="net"><span style="background:#eff6ff;color:#2563eb;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600">실수령액</span><p style="font-size:28px;font-weight:800;margin:8px 0 0">${Number(p.netPay || 0).toLocaleString()}원</p></div>
      </div>
      <div class="card"><div class="body">
        <p class="title">지급내역 ${Number(p.grossPay || 0).toLocaleString()}원</p>
        ${row("기본급", p.base)}${rowIf("상여", p.bonus)}${rowIf("직책수당", p.positionAllowance)}${rowIf("연차수당", p.annualLeaveAllowance)}${row("주휴수당", p.weeklyAllowance)}${row("기타수당", p.allowances)}${row("식대", p.mealAllowance)}${rowIf("특별상여", p.specialBonus)}${row("연장근로수당", p.overtimePay)}${rowIf("휴일근로수당", p.holidayPay)}${rowIf("출장수당", p.businessTripAllowance)}${rowIf("장기근속수당", p.longServiceAllowance)}${rowIf("통신비지원금", p.commAllowance)}${row("지각공제", p.lateDeduction)}${row("조퇴공제", p.earlyLeaveDeduction)}${row("지급합계", p.grossPay, true)}
      </div></div>
      <div class="card"><div class="body">
        <p class="title">공제내역</p>
        ${row("국민연금", d.pension)}${row("건강보험", d.health)}${row("장기요양보험", d.longTermCare)}${row("고용보험", d.employment)}${rowIf("기타공제액", d.otherDeduction)}${rowIf("건강보험정산", d.healthAdjustment)}${rowIf("선지급금", d.advancePayment)}${rowIf("소득세", d.incomeTax)}${rowIf("지방소득세", d.localIncomeTax)}${rowIf("연말정산소득세", d.yearEndIncomeTax)}${rowIf("연말정산지방소득세", d.yearEndLocalIncomeTax)}${row("공제합계", d.total, true)}
      </div></div>
      <p style="text-align:center;font-size:11px;color:#94a3b8">본 명세서는 시스템에서 자동 생성되었습니다.</p>
      </body></html>`;
    const win = window.open("", "_blank", "width=480,height=720");
    if (!win) {
      toast.error("팝업이 차단되었습니다. 팝업 차단을 해제해주세요.");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  const sharePayslip = async () => {
    if (!previewFor) return;
    const { emp, p } = previewFor;
    const text = `[급여명세서] ${emp.name} · ${p.month} · 실수령액 ${Number(p.netPay || 0).toLocaleString()}원`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "급여명세서", text });
      } catch {
        // 사용자가 공유를 취소한 경우
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("클립보드에 복사했습니다");
    } catch {
      toast.error("공유하기를 지원하지 않는 환경입니다.");
    }
  };

  const dailyHoursFor = (uid) => {
    const records = attendance.filter((a) => a.uid === uid && a.status === "출근").sort((a, b) => a.date.localeCompare(b.date));
    return records
      .map((r) => `${r.date.slice(8, 10)}일 ${r.checkInTime ? formatTime(r.checkInTime) : "-"}~${r.checkOutTime ? formatTime(r.checkOutTime) : "-"}`)
      .join(", ");
  };

  const toggleSelected = (uid) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  const toggleSelectAll = () =>
    setSelected((s) => (s.size === filteredEmployees.length ? new Set() : new Set(filteredEmployees.map((e) => e.id))));

  // 선택정산처리: 체크된 근로자의 정산만 확정 처리한다(전체확정과 달리
  // 관리자가 고른 대상만 정확히 반영) — 확정되어야 근로자 모바일
  // 급여관리 화면에도 명세서가 조회된다.
  const settleSelected = async () => {
    if (selected.size === 0) return;
    if (!(await confirm(`선택한 ${selected.size}건을 정산확정 처리하시겠습니까?`, "save"))) return;
    let count = 0;
    for (const uid of selected) {
      const p = payrollFor(uid);
      if (!p || p.settlementStatus === "confirmed") continue;
      await setDoc(doc(db, "payrolls", p.id), { settlementStatus: "confirmed", confirmedAt: serverTimestamp() }, { merge: true });
      count += 1;
    }
    toast.success(`${count}건 정산확정되었습니다`);
  };

  // 삭제(초기화): 잘못 입력된 정산을 처음부터 다시 입력해야 할 때, 해당
  // payrolls 문서 자체를 지워 미처리 상태로 되돌린다.
  const deleteSelectedPayrolls = async () => {
    if (selected.size === 0) return;
    if (!(await confirm(`선택한 ${selected.size}건의 정산 데이터를 삭제하시겠습니까? 삭제하면 처음부터 다시 입력해야 합니다.`, "delete"))) return;
    let count = 0;
    for (const uid of selected) {
      const p = payrollFor(uid);
      if (!p) continue;
      await deleteDoc(doc(db, "payrolls", p.id));
      count += 1;
    }
    setSelected(new Set());
    toast.success(`${count}건 삭제되었습니다`);
  };

  const openFor = (emp) => {
    setTarget(emp);
    const existing = payrollFor(emp.id);
    if (existing) {
      setForm({
        wageType: existing.wageType || "hourly",
        baseWage: existing.baseWage || 12000,
        hoursWorked: existing.hoursWorked || 160,
        overtimeHours: existing.overtimeHours || 0,
        weeklyEligibleWeeks: existing.weeklyEligibleWeeks || 4,
        allowances: existing.allowances || 0,
        mealAllowance: existing.mealAllowance || 0,
        lateDeduction: existing.lateDeduction || 0,
        earlyLeaveDeduction: existing.earlyLeaveDeduction || 0,
        ...Object.fromEntries(PAYMENT_EXTRA_FIELDS.map(([k]) => [k, existing[k] || 0])),
        ...Object.fromEntries(DEDUCTION_EXTRA_FIELDS.map(([k]) => [k, existing.deductions?.[k] || 0])),
      });
    } else {
      setForm({
        wageType: "hourly",
        baseWage: 12000,
        hoursWorked: 160,
        overtimeHours: 0,
        weeklyEligibleWeeks: 4,
        allowances: 0,
        mealAllowance: 0,
        lateDeduction: 0,
        earlyLeaveDeduction: 0,
        ...emptyExtraForm(),
      });
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const existing = payrollFor(target.id);
    const rates = await getSiteInsuranceRates(profile.companyId, target.workSiteId, `${month}-28`);
    const result = calcMonthlyPayroll({
      baseWage: Number(form.baseWage),
      wageType: form.wageType,
      hoursWorked: Number(form.hoursWorked),
      overtimeHours: Number(form.overtimeHours),
      weeklyEligibleWeeks: Number(form.weeklyEligibleWeeks),
      allowances: Number(form.allowances),
      mealAllowance: Number(form.mealAllowance),
      lateDeduction: Number(form.lateDeduction),
      earlyLeaveDeduction: Number(form.earlyLeaveDeduction),
      rates,
    });
    // form에 담긴 상여/직책수당 등 확장 지급항목과 소득세/선지급금 등 확장
    // 공제항목을 grossPay/deductions.total/netPay 합계에 반영한다.
    const withExtras = withExtraTotals(result, form, form);

    await setDoc(doc(db, "payrolls", `${month}_${target.id}`), {
      companyId: profile.companyId,
      uid: target.id,
      name: target.name,
      siteId: target.workSiteId || null,
      siteName: siteName_(target.workSiteId),
      month,
      wageType: form.wageType,
      baseWage: Number(form.baseWage),
      hoursWorked: Number(form.hoursWorked),
      overtimeHours: Number(form.overtimeHours),
      weeklyEligibleWeeks: Number(form.weeklyEligibleWeeks),
      settlementStatus: existing?.settlementStatus || "draft",
      ...withExtras,
      updatedAt: serverTimestamp(),
    });
    setTarget(null);
  };

  // 정산처리 요청: for every filtered employee, sums 출근 days in the chosen
  // period from attendance and writes/refreshes a draft payroll so the admin
  // only has to fine-tune baseWage/allowances rather than start from scratch.
  const runSettlement = async () => {
    setSettling(true);
    const { start } = settleForm;
    const end = settleForm.monthEndOnly ? defaultRangeFor("monthly", start).end : settleForm.end;
    const attSnap = await getDocs(
      query(
        collection(db, "attendance"),
        where("companyId", "==", profile.companyId),
        where("date", ">=", start),
        where("date", "<=", end)
      )
    );
    const records = attSnap.docs.map((d) => d.data());
    const targetMonth = end.slice(0, 7);

    for (const emp of filteredEmployees) {
      const empRecords = records.filter((r) => r.uid === emp.id && r.status === "출근");
      let hoursWorked = 0;
      let overtimeHours = 0;
      for (const r of empRecords) {
        let h = 8;
        if (r.checkInTime && r.checkOutTime) {
          h = Math.max(0, Math.min(12, (new Date(r.checkOutTime) - new Date(r.checkInTime)) / 3600000));
        }
        hoursWorked += Math.min(h, 8);
        overtimeHours += Math.max(0, h - 8);
      }

      const existing = payrollFor(emp.id);
      const baseWage = existing?.baseWage || 12000;
      const wageType = existing?.wageType || "hourly";
      const allowances = existing?.allowances || 0;
      const mealAllowance = existing?.mealAllowance || 0;
      const lateDeduction = existing?.lateDeduction || 0;
      const earlyLeaveDeduction = existing?.earlyLeaveDeduction || 0;
      const weeklyEligibleWeeks = existing?.weeklyEligibleWeeks || 0;
      const rates = await getSiteInsuranceRates(profile.companyId, emp.workSiteId, end);
      const result = calcMonthlyPayroll({
        baseWage,
        wageType,
        hoursWorked: Math.round(hoursWorked),
        overtimeHours: Math.round(overtimeHours),
        weeklyEligibleWeeks,
        allowances,
        mealAllowance,
        lateDeduction,
        earlyLeaveDeduction,
        rates,
      });
      // 재정산 시에도 관리자가 급여수정 팝업에서 수동 입력해둔 상여/수당/
      // 소득세 등 확장 항목은 기존 baseWage/allowances처럼 그대로 이어받아
      // setDoc(merge 없이 전체 덮어쓰기)로 인해 값이 사라지지 않게 한다.
      const withExtras = withExtraTotals(result, existing, existing?.deductions);

      await setDoc(doc(db, "payrolls", `${targetMonth}_${emp.id}`), {
        companyId: profile.companyId,
        uid: emp.id,
        name: emp.name,
        siteId: emp.workSiteId || null,
        siteName: siteName_(emp.workSiteId),
        month: targetMonth,
        wageType,
        baseWage,
        hoursWorked: Math.round(hoursWorked),
        overtimeHours: Math.round(overtimeHours),
        weeklyEligibleWeeks,
        periodType: settleForm.periodType,
        periodStart: start,
        periodEnd: end,
        settlementStatus: "draft",
        ...withExtras,
        updatedAt: serverTimestamp(),
      });
    }

    setMonth(targetMonth);
    setSettling(false);
    setSettleOpen(false);
  };

  const setConfirmedFor = async (status) => {
    for (const emp of filteredEmployees) {
      const p = payrollFor(emp.id);
      if (!p) continue;
      if (status === "confirmed" && p.settlementStatus === "confirmed") continue;
      if (status === "draft" && p.settlementStatus !== "confirmed") continue;
      await setDoc(
        doc(db, "payrolls", p.id),
        { settlementStatus: status, confirmedAt: status === "confirmed" ? serverTimestamp() : null },
        { merge: true }
      );
    }
  };

  // 보험/수당/공제 선택 + 비고 저장: applies the chosen item's amount to every
  // checked row's draft payroll and recalculates the totals.
  const applyAdjustment = async () => {
    if (selected.size === 0) return;
    for (const uid of selected) {
      const p = payrollFor(uid);
      if (!p || p.settlementStatus === "confirmed") continue;
      const emp = employees.find((e) => e.id === uid);
      let allowances = p.allowances || 0;
      if (adjustForm.allowanceItem) {
        const t = allowanceTemplates.find((x) => x.name === adjustForm.allowanceItem);
        if (t) allowances += Number(t.dailyEtcAllowance || 0);
      }
      const rates = await getSiteInsuranceRates(profile.companyId, emp?.workSiteId, `${month}-28`);
      const result = calcMonthlyPayroll({
        baseWage: p.baseWage,
        wageType: p.wageType,
        hoursWorked: p.hoursWorked,
        overtimeHours: p.overtimeHours,
        weeklyEligibleWeeks: p.weeklyEligibleWeeks,
        allowances,
        mealAllowance: p.mealAllowance || 0,
        lateDeduction: p.lateDeduction || 0,
        earlyLeaveDeduction: p.earlyLeaveDeduction || 0,
        rates,
      });
      // merge:true라 확장 필드 자체는 남아있지만, grossPay/netPay/deductions.total은
      // 다시 계산해서 써주지 않으면 상여/소득세 등이 반영되지 않은 값으로 되돌아간다.
      const withExtras = withExtraTotals(result, p, p.deductions);
      await setDoc(
        doc(db, "payrolls", p.id),
        {
          allowances,
          note: adjustForm.note || p.note || "",
          appliedInsuranceItem: adjustForm.insuranceItem || null,
          appliedDeductionItem: adjustForm.deductionItem || null,
          ...withExtras,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    setAdjustForm({ insuranceItem: "", allowanceItem: "", deductionItem: "", note: "" });
  };

  const exportCsv = () => {
    const headers = ["이름", "센터", "소속업체", "근무구분", "근무형태", "부서", "직급", "4대보험", "지급합계", "공제합계", "실수령액", "정산상태"];
    const rows = filteredEmployees.map((emp) => {
      const p = payrollFor(emp.id);
      return [
        emp.name,
        siteName_(emp.workSiteId),
        vendorName_(emp.vendorId),
        emp.shiftType || "-",
        emp.employmentType || "-",
        emp.team || "-",
        emp.position || "-",
        emp.insuranceApplied || "-",
        p?.grossPay ?? "",
        p?.deductions?.total ?? "",
        p?.netPay ?? "",
        p ? (p.settlementStatus === "confirmed" ? "정산확정" : "정산처리") : "미처리",
      ];
    });
    downloadCsv(`급여_${month}`, headers, rows);
  };

  return (
    <div className="space-y-6">
      <Panel
        icon={Wallet}
        title="급여"
        actions={
          <button type="button" onClick={() => setShowGuide(true)} className="text-muted hover:text-primary" title="사용법 안내">
            <HelpCircle size={18} />
          </button>
        }
      >
        <Card className="mb-4 space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
              <select disabled className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-muted">
                <option>{companyName || "-"}</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">센터 *</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.siteId}
                onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value }))}
              >
                <option value="">전체</option>
                {workSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">소속업체</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.vendorId}
                onChange={(e) => setFilters((f) => ({ ...f, vendorId: e.target.value }))}
              >
                <option value="">전체</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">근무구분</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.shiftType}
                onChange={(e) => setFilters((f) => ({ ...f, shiftType: e.target.value }))}
              >
                <option value="">전체</option>
                {SHIFT_TYPE_OPTIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">근무형태</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.employmentType}
                onChange={(e) => setFilters((f) => ({ ...f, employmentType: e.target.value }))}
              >
                <option value="">전체</option>
                {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">부서</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.team}
                onChange={(e) => setFilters((f) => ({ ...f, team: e.target.value }))}
              >
                <option value="">전체</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">지급</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.payType}
                onChange={(e) => setFilters((f) => ({ ...f, payType: e.target.value }))}
              >
                <option value="">전체</option>
                {PAY_TYPE_OPTIONS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">국적구분</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.nationality}
                onChange={(e) => setFilters((f) => ({ ...f, nationality: e.target.value }))}
              >
                <option value="">전체</option>
                {NATIONALITY_OPTIONS.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">국가구분</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.country}
                onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))}
              >
                <option value="">전체</option>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">이름</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.name}
                onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
                placeholder="이름"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">전화번호</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.phone}
                onChange={(e) => setFilters((f) => ({ ...f, phone: e.target.value }))}
                placeholder="전화번호"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">주민/외국인번호</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.residentQuery}
                onChange={(e) => setFilters((f) => ({ ...f, residentQuery: e.target.value }))}
                placeholder="주민/외국인번호"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">급여계좌</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.bankQuery}
                onChange={(e) => setFilters((f) => ({ ...f, bankQuery: e.target.value }))}
                placeholder="급여계좌"
              />
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">4대보험</span>
              <div className="flex h-[38px] items-center gap-3 text-sm">
                {["", "Y", "N"].map((v) => (
                  <label key={v || "all"} className="flex items-center gap-1">
                    <input type="radio" checked={filters.insuranceYN === v} onChange={() => setFilters((f) => ({ ...f, insuranceYN: v }))} />
                    {v || "전체"}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">소계</span>
              <div className="flex h-[38px] items-center gap-3 text-sm">
                {["포함", "제외"].map((v) => (
                  <label key={v} className="flex items-center gap-1">
                    <input type="radio" checked={filters.subtotalView === v} onChange={() => setFilters((f) => ({ ...f, subtotalView: v }))} />
                    {v}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">요일별 근무시간보기</span>
              <div className="flex h-[38px] items-center gap-3 text-sm">
                {["Y", "N"].map((v) => (
                  <label key={v} className="flex items-center gap-1">
                    <input type="radio" checked={filters.showDailyHours === v} onChange={() => setFilters((f) => ({ ...f, showDailyHours: v }))} />
                    {v}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">템플릿정보</span>
              <div className="flex h-[38px] items-center gap-3 text-sm">
                {["포함", "제외"].map((v) => (
                  <label key={v} className="flex items-center gap-1">
                    <input type="radio" checked={filters.showTemplateInfo === v} onChange={() => setFilters((f) => ({ ...f, showTemplateInfo: v }))} />
                    {v}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">
                급여형태 및 기간선택 <span className="text-danger">필수</span>
              </span>
              <div className="flex items-center gap-2">
                {Object.entries(PERIOD_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSettleForm((f) => ({ ...f, periodType: key, ...defaultRangeFor(key) }))}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      settleForm.periodType === key ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <input
                  type="date"
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  value={settleForm.start}
                  onChange={(e) => setSettleForm((f) => ({ ...f, start: e.target.value }))}
                />
                <span className="text-muted">~</span>
                <input
                  type="date"
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  value={settleForm.end}
                  onChange={(e) => setSettleForm((f) => ({ ...f, end: e.target.value }))}
                />
              </div>
            </label>
            <div className="flex gap-2">
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <button type="button" className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50" title="새로고침" onClick={() => setFilters(EMPTY_FILTERS)}>
                <RefreshCw size={16} />
              </button>
              <Button onClick={() => setSettleOpen(true)}>검색</Button>
            </div>
          </div>
        </Card>

        <Card className="mb-3 flex flex-wrap items-center justify-between gap-3 p-3.5">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-ink">
              <Wallet size={14} className="text-primary" /> 급여일 {payrollInfo.payday ? `매월 ${payrollInfo.payday}일` : "미설정"}
            </span>
            <span className="text-muted">입금시간 {payrollInfo.depositTime || "미설정"}</span>
            <span className="text-muted">직통번호 {payrollInfo.contactPhone || "미설정"}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setPayrollInfoOpen(true)}>
            <Settings2 size={13} /> 급여 안내 설정
          </Button>
        </Card>

        <div className="mb-3 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="text-xs font-medium text-muted">
            목록 {filteredEmployees.length}
            <span className="ml-2 text-[11px] text-muted">✓ 팀근정보가 없음 | 휴무일 '123' 5시간 이상 연장</span>
          </p>
          <div className="flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain">
            <Button size="sm" onClick={() => setSettleOpen(true)}>
              <CalculatorIcon size={13} /> 정산처리 요청
            </Button>
            <Button size="sm" variant="outline" onClick={settleSelected} disabled={selected.size === 0}>
              <CheckSquare size={13} /> 선택정산처리
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmedFor("confirmed")}>
              <Lock size={13} /> 전체확정
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmedFor("draft")}>
              <LockOpen size={13} /> 확정취소
            </Button>
            <Button size="sm" variant="danger" onClick={deleteSelectedPayrolls} disabled={selected.size === 0}>
              <Trash2 size={13} /> 선택삭제
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <FileSpreadsheet size={13} /> 엑셀
            </Button>
          </div>
        </div>

        <Card className="mb-3 flex flex-wrap items-end gap-2 p-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">보험선택</span>
            <select
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
              value={adjustForm.insuranceItem}
              onChange={(e) => setAdjustForm((f) => ({ ...f, insuranceItem: e.target.value }))}
            >
              <option value="">보험선택</option>
              {INSURANCE_ITEMS.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">수당선택</span>
            <select
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
              value={adjustForm.allowanceItem}
              onChange={(e) => setAdjustForm((f) => ({ ...f, allowanceItem: e.target.value }))}
            >
              <option value="">수당선택</option>
              {allowanceTemplates.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">공제선택</span>
            <select
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
              value={adjustForm.deductionItem}
              onChange={(e) => setAdjustForm((f) => ({ ...f, deductionItem: e.target.value }))}
            >
              <option value="">공제선택</option>
              {DEDUCTION_ITEMS.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>
          <label className="block flex-1 min-w-[140px]">
            <span className="mb-1 block text-[11px] font-medium text-muted">비고</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
              value={adjustForm.note}
              onChange={(e) => setAdjustForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="비고"
            />
          </label>
          <Button size="sm" onClick={applyAdjustment} disabled={selected.size === 0}>
            저장
          </Button>
        </Card>

        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[1320px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-semibold">
                  <input type="checkbox" checked={selected.size > 0 && selected.size === filteredEmployees.length} onChange={toggleSelectAll} />
                </th>
                <th className="px-4 py-3 font-semibold">순번</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">근무구분</th>
                <th className="px-4 py-3 font-semibold">근무형태</th>
                <th className="px-4 py-3 font-semibold">부서</th>
                <th className="px-4 py-3 font-semibold">직급</th>
                <th className="px-4 py-3 font-semibold">4대보험</th>
                <th className="px-4 py-3 font-semibold">은행</th>
                <th className="px-4 py-3 font-semibold">예금주</th>
                <th className="px-4 py-3 font-semibold">계좌번호</th>
                {filters.showDailyHours === "Y" && <th className="px-4 py-3 font-semibold">요일별 근무시간</th>}
                {filters.showTemplateInfo === "포함" && <th className="px-4 py-3 font-semibold">템플릿정보</th>}
                <th className="px-4 py-3 font-semibold">지급합계</th>
                <th className="px-4 py-3 font-semibold">공제합계</th>
                <th className="px-4 py-3 font-semibold">실수령액</th>
                <th className="px-4 py-3 font-semibold">정산상태</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp, i) => {
                const p = payrollFor(emp.id);
                return (
                  <tr
                    key={emp.id}
                    className="border-b border-slate-50 last:border-0"
                    onContextMenu={(e) => openRowMenu(e, emp)}
                    onDoubleClick={() => {
                      if (!p) openFor(emp);
                    }}
                  >
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(emp.id)} onChange={() => toggleSelected(emp.id)} />
                    </td>
                    <td className="px-4 py-3 text-ink">{i + 1}</td>
                    <td className="px-4 py-3 text-ink">{emp.name}</td>
                    <td className="px-4 py-3 text-ink">{emp.shiftType || "-"}</td>
                    <td className="px-4 py-3 text-ink">{emp.employmentType || "-"}</td>
                    <td className="px-4 py-3 text-ink">{emp.team || "-"}</td>
                    <td className="px-4 py-3 text-ink">{emp.position || "-"}</td>
                    <td className="px-4 py-3 text-ink">{emp.insuranceApplied || "-"}</td>
                    <td className="px-4 py-3 text-ink">{emp.bankName || "-"}</td>
                    <td className="px-4 py-3 text-ink">{emp.accountHolder || "-"}</td>
                    <td className="px-4 py-3 text-ink">{emp.bankAccount || "-"}</td>
                    {filters.showDailyHours === "Y" && (
                      <td className="max-w-[220px] truncate px-4 py-3 text-[11px] text-ink" title={dailyHoursFor(emp.id)}>
                        {dailyHoursFor(emp.id) || "-"}
                      </td>
                    )}
                    {filters.showTemplateInfo === "포함" && (
                      <td className="px-4 py-3 text-[11px] text-ink">
                        {p?.periodType ? PERIOD_LABELS[p.periodType] : "-"} · {p?.wageType === "hourly" ? "시급" : "월급"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-ink">{p ? Number(p.grossPay || 0).toLocaleString() + "원" : "-"}</td>
                    <td className="px-4 py-3 text-ink">{p ? Number(p.deductions?.total || 0).toLocaleString() + "원" : "-"}</td>
                    <td className="px-4 py-3 font-medium text-ink">{p ? Number(p.netPay || 0).toLocaleString() + "원" : "-"}</td>
                    <td className="px-4 py-3">
                      {p ? (
                        p.settlementStatus === "confirmed" ? (
                          <Badge tone="success">정산확정</Badge>
                        ) : (
                          <Badge tone="warning">정산처리</Badge>
                        )
                      ) : (
                        <Badge tone="muted">미처리</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-nowrap items-center justify-center gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => openFor(emp)}>
                          <Wallet size={14} /> {p ? "수정" : "생성"}
                        </Button>
                        {p && (
                          <Button size="sm" variant="outline" onClick={() => openPreview(emp)}>
                            <Receipt size={14} /> 명세서
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={18} className="px-4 py-6 text-center text-xs text-muted">
                    조건에 맞는 근로자가 없습니다.
                  </td>
                </tr>
              )}
              {filters.subtotalView === "포함" && filteredEmployees.length > 0 && (
                <tr className="bg-slate-50 font-semibold text-ink">
                  <td colSpan={filters.showDailyHours === "Y" || filters.showTemplateInfo === "포함" ? 12 : 11} className="px-4 py-3 text-right text-xs">
                    소계
                  </td>
                  <td className="px-4 py-3">
                    {filteredEmployees.reduce((sum, e) => sum + (payrollFor(e.id)?.grossPay || 0), 0).toLocaleString()}원
                  </td>
                  <td className="px-4 py-3">
                    {filteredEmployees.reduce((sum, e) => sum + (payrollFor(e.id)?.deductions?.total || 0), 0).toLocaleString()}원
                  </td>
                  <td className="px-4 py-3">
                    {filteredEmployees.reduce((sum, e) => sum + (payrollFor(e.id)?.netPay || 0), 0).toLocaleString()}원
                  </td>
                  <td colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {rowMenu && (
        <div
          className="fixed z-50 w-36 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg"
          style={{ left: rowMenu.x, top: rowMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="truncate px-3 py-1 text-[11px] text-muted">{rowMenu.emp.name}</p>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-slate-50"
            onClick={() => {
              openFor(rowMenu.emp);
              closeRowMenu();
            }}
          >
            {payrollFor(rowMenu.emp.id) ? "수정" : "생성"}
          </button>
          {payrollFor(rowMenu.emp.id) && (
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-slate-50"
              onClick={() => {
                openPreview(rowMenu.emp);
                closeRowMenu();
              }}
            >
              명세서
            </button>
          )}
        </div>
      )}

      <Modal open={showGuide} onClose={() => setShowGuide(false)} title="급여 사용법" size="lg" footer={<Button onClick={() => setShowGuide(false)}>닫기</Button>}>
        <ol className="space-y-2 text-xs text-muted">
          {GUIDE_NOTES.map((note, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 font-semibold text-primary">{i + 1}.</span>
              {note}
            </li>
          ))}
        </ol>
      </Modal>

      <Modal
        open={settleOpen}
        onClose={() => setSettleOpen(false)}
        title="정산처리 요청"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setSettleOpen(false)}>
              취소
            </Button>
            <Button onClick={runSettlement} disabled={settling}>
              {settling ? "처리 중..." : "정산처리"}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-ink">선택하신 기간 단위로 (재)정산처리됩니다.</p>
        <p className="mb-3 text-xs text-muted">
          주단위 정산처리가 필요하신 경우, 필터영역에서 해당 단위로 검색하신 후 정산처리를 진행해주세요.
        </p>
        <div className="mb-3 rounded-xl bg-primary-light p-3 text-xs text-primary">
          정산처리조건
          <br />
          #사업자: {companyName || "-"} #센터: {siteName_(filters.siteId) !== "-" ? siteName_(filters.siteId) : "전체"}
        </div>
        <div className="mb-2">
          <span className="mb-1.5 block text-xs font-medium text-muted">
            급여형태 <span className="text-danger">필수</span>
          </span>
          <div className="flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain">
            {Object.entries(PERIOD_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSettleForm((f) => ({ ...f, periodType: key, ...defaultRangeFor(key) }))}
                className={`shrink-0 rounded-xl border px-3 py-2 text-sm ${
                  settleForm.periodType === key ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-2">
          <span className="mb-1.5 block text-xs font-medium text-muted">
            기간선택 <span className="text-danger">필수</span>
          </span>
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain">
            <input
              type="date"
              className="rounded-xl border border-slate-200 px-2.5 py-2 text-sm"
              value={settleForm.start}
              onChange={(e) => setSettleForm((f) => ({ ...f, start: e.target.value }))}
            />
            <span className="shrink-0 text-muted">~</span>
            <input
              type="date"
              className="rounded-xl border border-slate-200 px-2.5 py-2 text-sm"
              value={settleForm.end}
              onChange={(e) => setSettleForm((f) => ({ ...f, end: e.target.value }))}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={settleForm.monthEndOnly}
            onChange={(e) => setSettleForm((f) => ({ ...f, monthEndOnly: e.target.checked }))}
          />
          월말계산 (당월말까지만 정산됨)
        </label>
      </Modal>

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={`${target?.name} · ${month} 급여 입력`}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setTarget(null)}>
              취소
            </Button>
            <Button onClick={save}>저장</Button>
          </>
        }
      >
        <form onSubmit={save} className="space-y-3">
          {/* 급여계좌는 근로자 등록정보(users.bankName 등)가 원본이므로 여기서는
              읽기전용으로 참고만 보여준다 — 정산 처리 중 계좌를 확인/전달할 때 편의용. */}
          <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-xs">
            <p className="mb-1 font-semibold text-ink">급여계좌 (근로자 등록정보 · 참고용)</p>
            <div className="flex items-center justify-between">
              <span className="text-muted">은행</span>
              <span className="font-medium text-ink">{target?.bankName || "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">예금주</span>
              <span className="font-medium text-ink">{target?.accountHolder || "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">계좌번호</span>
              <span className="font-medium text-ink">{target?.bankAccount || "-"}</span>
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">급여 형태</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.wageType}
              onChange={(e) => setForm((f) => ({ ...f, wageType: e.target.value }))}
            >
              <option value="hourly">시급</option>
              <option value="monthly">월급(고정)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              {form.wageType === "hourly" ? "시급(원)" : "월 기본급(원)"}
            </span>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.baseWage}
              onChange={(e) => setForm((f) => ({ ...f, baseWage: e.target.value }))}
            />
          </label>
          {form.wageType === "hourly" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">근무시간</span>
                <input
                  type="number"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={form.hoursWorked}
                  onChange={(e) => setForm((f) => ({ ...f, hoursWorked: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">연장시간</span>
                <input
                  type="number"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={form.overtimeHours}
                  onChange={(e) => setForm((f) => ({ ...f, overtimeHours: e.target.value }))}
                />
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">주휴수당 적용 주수</span>
              <input
                type="number"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={form.weeklyEligibleWeeks}
                onChange={(e) => setForm((f) => ({ ...f, weeklyEligibleWeeks: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">기타수당(원)</span>
              <input
                type="number"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={form.allowances}
                onChange={(e) => setForm((f) => ({ ...f, allowances: e.target.value }))}
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">식대(원)</span>
              <input
                type="number"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={form.mealAllowance}
                onChange={(e) => setForm((f) => ({ ...f, mealAllowance: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">지각공제(원)</span>
              <input
                type="number"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={form.lateDeduction}
                onChange={(e) => setForm((f) => ({ ...f, lateDeduction: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">조퇴공제(원)</span>
              <input
                type="number"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={form.earlyLeaveDeduction}
                onChange={(e) => setForm((f) => ({ ...f, earlyLeaveDeduction: e.target.value }))}
              />
            </label>
          </div>
          <div className="border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold text-ink">지급항목</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PAYMENT_EXTRA_FIELDS.map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">{label}(원)</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold text-ink">공제항목</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DEDUCTION_EXTRA_FIELDS.map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">{label}(원)</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>

          {allowanceTemplates.length > 0 && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">수당템플릿 추가</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                defaultValue=""
                onChange={(e) => {
                  const t = allowanceTemplates.find((x) => x.id === e.target.value);
                  if (t) setForm((f) => ({ ...f, allowances: Number(f.allowances || 0) + Number(t.dailyEtcAllowance || 0) }));
                  e.target.value = "";
                }}
              >
                <option value="">선택 시 기타수당에 더해집니다</option>
                {allowanceTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (+{Number(t.dailyEtcAllowance || 0).toLocaleString()}원)
                  </option>
                ))}
              </select>
            </label>
          )}
        </form>
      </Modal>

      <Modal
        open={payrollInfoOpen}
        onClose={() => setPayrollInfoOpen(false)}
        title="급여 안내 설정"
        footer={
          <>
            <Button variant="outline" onClick={() => setPayrollInfoOpen(false)}>
              취소
            </Button>
            <Button onClick={savePayrollInfo}>저장</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">근로자 모바일 급여관리 화면 상단에 항상 표시되고, 급여 문의 시 바로 전화/문자할 수 있는 연락처로 쓰입니다.</p>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">급여일 (매월 며칠)</span>
            <input
              type="number"
              min="1"
              max="31"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={payrollInfoForm.payday}
              onChange={(e) => setPayrollInfoForm((f) => ({ ...f, payday: e.target.value }))}
              placeholder="예: 25"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">입금시간</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={payrollInfoForm.depositTime}
              onChange={(e) => setPayrollInfoForm((f) => ({ ...f, depositTime: e.target.value }))}
              placeholder="예: 오전 10시"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">급여 문의 직통번호</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={payrollInfoForm.contactPhone}
              onChange={(e) => setPayrollInfoForm((f) => ({ ...f, contactPhone: e.target.value }))}
              placeholder="예: 02-000-0000"
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(previewFor)}
        onClose={() => setPreviewFor(null)}
        title="급여명세서 미리보기"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={sharePayslip}>
              공유
            </Button>
            <Button variant="outline" onClick={printPayslip}>
              <Printer size={13} /> 인쇄/저장
            </Button>
            <Button onClick={() => setPreviewFor(null)}>닫기</Button>
          </>
        }
      >
        {previewFor && (
          <div className="space-y-4">
            <Card className="overflow-hidden p-0">
              <div className="space-y-1 bg-ink px-5 py-4 text-center text-white">
                <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-white/70">
                  <Receipt size={13} /> 급여명세서
                </p>
                <p className="text-lg font-bold">{companyName || ""}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-dashed border-slate-200 px-5 py-4 text-sm">
                {[
                  ["회사명", companyName || "-"],
                  ["성명", previewFor.emp.name],
                  ["생년월일", birthDateDisplay(previewFor.emp.residentNumberFront)],
                  ["입사일", previewFor.emp.hireDate ? formatDate(previewFor.emp.hireDate) : "-"],
                  ["직책", previewFor.emp.position || "-"],
                  ["직급", previewFor.emp.position || "-"],
                  ["부서", previewFor.emp.team || "-"],
                  ["지급일", payDateFor(previewFor.p)],
                  ["지급대상기간", previewFor.p.month],
                  ["발급일", toDateKey()],
                  ["비고", previewFor.p.note || "-"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className="text-muted">{label}</span>
                    <span className="truncate font-semibold text-ink">{value}</span>
                  </div>
                ))}
              </div>
              <div className="p-5 text-center">
                <span className="inline-block rounded-full bg-primary-light px-3 py-1 text-xs font-semibold text-primary">실수령액</span>
                <p className="mt-2 text-3xl font-extrabold text-ink">{Number(previewFor.p.netPay || 0).toLocaleString()}원</p>
              </div>
            </Card>

            <Card className="p-5">
              <p className="mb-2 text-sm font-bold text-ink">지급내역 {Number(previewFor.p.grossPay || 0).toLocaleString()}원</p>
              {[
                ["기본급", previewFor.p.base, false],
                ["상여", previewFor.p.bonus, true],
                ["직책수당", previewFor.p.positionAllowance, true],
                ["연차수당", previewFor.p.annualLeaveAllowance, true],
                ["주휴수당", previewFor.p.weeklyAllowance, false],
                ["기타수당", previewFor.p.allowances, false],
                ["식대", previewFor.p.mealAllowance, false],
                ["특별상여", previewFor.p.specialBonus, true],
                ["연장근로수당", previewFor.p.overtimePay, false],
                ["휴일근로수당", previewFor.p.holidayPay, true],
                ["출장수당", previewFor.p.businessTripAllowance, true],
                ["장기근속수당", previewFor.p.longServiceAllowance, true],
                ["통신비지원금", previewFor.p.commAllowance, true],
                ["지각공제", previewFor.p.lateDeduction, false],
                ["조퇴공제", previewFor.p.earlyLeaveDeduction, false],
              ]
                .filter(([, value, optional]) => !optional || Number(value || 0))
                .map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between py-1.5 text-sm font-medium text-muted">
                    <span>{label}</span>
                    <span className="font-semibold text-ink">{Number(value || 0).toLocaleString()}원</span>
                  </div>
                ))}
              <div className="my-2 border-t border-dashed border-slate-200" />
              <div className="flex items-center justify-between py-1.5 text-sm font-bold text-ink">
                <span>지급합계</span>
                <span>{Number(previewFor.p.grossPay || 0).toLocaleString()}원</span>
              </div>
            </Card>

            <Card className="p-5">
              <p className="mb-2 text-sm font-semibold text-ink">공제내역</p>
              {[
                ["국민연금", previewFor.p.deductions?.pension, false],
                ["건강보험", previewFor.p.deductions?.health, false],
                ["장기요양보험", previewFor.p.deductions?.longTermCare, false],
                ["고용보험", previewFor.p.deductions?.employment, false],
                ["기타공제액", previewFor.p.deductions?.otherDeduction, true],
                ["건강보험정산", previewFor.p.deductions?.healthAdjustment, true],
                ["선지급금", previewFor.p.deductions?.advancePayment, true],
                ["소득세", previewFor.p.deductions?.incomeTax, true],
                ["지방소득세", previewFor.p.deductions?.localIncomeTax, true],
                ["연말정산소득세", previewFor.p.deductions?.yearEndIncomeTax, true],
                ["연말정산지방소득세", previewFor.p.deductions?.yearEndLocalIncomeTax, true],
              ]
                .filter(([, value, optional]) => !optional || Number(value || 0))
                .map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between py-1.5 text-sm font-medium text-muted">
                    <span>{label}</span>
                    <span className="font-semibold text-ink">{Number(value || 0).toLocaleString()}원</span>
                  </div>
                ))}
              <div className="my-2 border-t border-dashed border-slate-200" />
              <div className="flex items-center justify-between py-1.5 text-sm font-bold text-ink">
                <span>공제합계</span>
                <span>{Number(previewFor.p.deductions?.total || 0).toLocaleString()}원</span>
              </div>
            </Card>
          </div>
        )}
      </Modal>
    </div>
  );
}
