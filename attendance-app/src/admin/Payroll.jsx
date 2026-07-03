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
} from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import { calcMonthlyPayroll, getSiteInsuranceRates } from "../utils/payroll";
import { toMonthKey, toDateKey, formatTime } from "../utils/dateUtils";
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
  const [companyName, setCompanyName] = useState("");
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
    getDoc(doc(db, "companies", profile.companyId)).then((s) => setCompanyName(s.data()?.name || ""));
  }, [profile?.companyId]);

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
      ...result,
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
        ...result,
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
        if (t) allowances += t.amount;
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
      await setDoc(
        doc(db, "payrolls", p.id),
        {
          allowances,
          note: adjustForm.note || p.note || "",
          appliedInsuranceItem: adjustForm.insuranceItem || null,
          appliedDeductionItem: adjustForm.deductionItem || null,
          ...result,
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

        <div className="mb-3 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
          <p className="text-xs font-medium text-muted">
            목록 {filteredEmployees.length}
            <span className="ml-2 text-[11px] text-muted">✓ 팀근정보가 없음 | 휴무일 '123' 5시간 이상 연장</span>
          </p>
          <div className="flex flex-nowrap gap-2 overflow-x-auto">
            <Button size="sm" onClick={() => setSettleOpen(true)}>
              <CalculatorIcon size={13} /> 정산처리 요청
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmedFor("confirmed")}>
              <Lock size={13} /> 정산확정
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmedFor("draft")}>
              <LockOpen size={13} /> 정산확정취소
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

        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-medium">
                  <input type="checkbox" checked={selected.size > 0 && selected.size === filteredEmployees.length} onChange={toggleSelectAll} />
                </th>
                <th className="px-4 py-3 font-medium">순번</th>
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="px-4 py-3 font-medium">근무구분</th>
                <th className="px-4 py-3 font-medium">근무형태</th>
                <th className="px-4 py-3 font-medium">부서</th>
                <th className="px-4 py-3 font-medium">직급</th>
                <th className="px-4 py-3 font-medium">4대보험</th>
                {filters.showDailyHours === "Y" && <th className="px-4 py-3 font-medium">요일별 근무시간</th>}
                {filters.showTemplateInfo === "포함" && <th className="px-4 py-3 font-medium">템플릿정보</th>}
                <th className="px-4 py-3 font-medium">지급합계</th>
                <th className="px-4 py-3 font-medium">공제합계</th>
                <th className="px-4 py-3 font-medium">실수령액</th>
                <th className="px-4 py-3 font-medium">정산상태</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp, i) => {
                const p = payrollFor(emp.id);
                return (
                  <tr key={emp.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(emp.id)} onChange={() => toggleSelected(emp.id)} />
                    </td>
                    <td className="px-4 py-3 text-muted">{i + 1}</td>
                    <td className="px-4 py-3 text-ink">{emp.name}</td>
                    <td className="px-4 py-3 text-muted">{emp.shiftType || "-"}</td>
                    <td className="px-4 py-3 text-muted">{emp.employmentType || "-"}</td>
                    <td className="px-4 py-3 text-muted">{emp.team || "-"}</td>
                    <td className="px-4 py-3 text-muted">{emp.position || "-"}</td>
                    <td className="px-4 py-3 text-muted">{emp.insuranceApplied || "-"}</td>
                    {filters.showDailyHours === "Y" && (
                      <td className="max-w-[220px] truncate px-4 py-3 text-[11px] text-muted" title={dailyHoursFor(emp.id)}>
                        {dailyHoursFor(emp.id) || "-"}
                      </td>
                    )}
                    {filters.showTemplateInfo === "포함" && (
                      <td className="px-4 py-3 text-[11px] text-muted">
                        {p?.periodType ? PERIOD_LABELS[p.periodType] : "-"} · {p?.wageType === "hourly" ? "시급" : "월급"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted">{p ? p.grossPay.toLocaleString() + "원" : "-"}</td>
                    <td className="px-4 py-3 text-muted">{p ? p.deductions.total.toLocaleString() + "원" : "-"}</td>
                    <td className="px-4 py-3 font-medium text-ink">{p ? p.netPay.toLocaleString() + "원" : "-"}</td>
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
                      <Button size="sm" variant="outline" onClick={() => openFor(emp)}>
                        <Wallet size={14} /> {p ? "수정" : "생성"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-6 text-center text-xs text-muted">
                    조건에 맞는 근로자가 없습니다.
                  </td>
                </tr>
              )}
              {filters.subtotalView === "포함" && filteredEmployees.length > 0 && (
                <tr className="bg-slate-50 font-semibold text-ink">
                  <td colSpan={filters.showDailyHours === "Y" || filters.showTemplateInfo === "포함" ? 9 : 8} className="px-4 py-3 text-right text-xs">
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
        <label className="mb-2 block">
          <span className="mb-1.5 block text-xs font-medium text-muted">
            급여형태 및 기간선택 <span className="text-danger">필수</span>
          </span>
          <div className="flex items-center gap-2">
            {Object.entries(PERIOD_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSettleForm((f) => ({ ...f, periodType: key, ...defaultRangeFor(key) }))}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  settleForm.periodType === key ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"
                }`}
              >
                {label}
              </button>
            ))}
            <input
              type="date"
              className="rounded-xl border border-slate-200 px-2.5 py-2 text-sm"
              value={settleForm.start}
              onChange={(e) => setSettleForm((f) => ({ ...f, start: e.target.value }))}
            />
            <span className="text-muted">~</span>
            <input
              type="date"
              className="rounded-xl border border-slate-200 px-2.5 py-2 text-sm"
              value={settleForm.end}
              onChange={(e) => setSettleForm((f) => ({ ...f, end: e.target.value }))}
            />
          </div>
        </label>
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
          {allowanceTemplates.length > 0 && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">수당템플릿 추가</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                defaultValue=""
                onChange={(e) => {
                  const t = allowanceTemplates.find((x) => x.id === e.target.value);
                  if (t) setForm((f) => ({ ...f, allowances: Number(f.allowances || 0) + t.amount }));
                  e.target.value = "";
                }}
              >
                <option value="">선택 시 기타수당에 더해집니다</option>
                {allowanceTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (+{t.amount.toLocaleString()}원)
                  </option>
                ))}
              </select>
            </label>
          )}
        </form>
      </Modal>
    </div>
  );
}
