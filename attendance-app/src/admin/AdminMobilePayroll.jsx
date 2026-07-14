import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { Search, CalculatorIcon, Lock, LockOpen, Monitor, CheckSquare, Square, Trash2, CheckCircle2, Receipt, Printer, MoreVertical, X, ListChecks } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import CurrencyInput from "../components/CurrencyInput";
import BankAccountFields from "../components/BankAccountFields";
import PayslipInfoGroup from "../components/PayslipInfoGroup";
import { isPlausibleAccountLength } from "../utils/bankAccount";
import { calcMonthlyPayroll, getSiteInsuranceRates } from "../utils/payroll";
import { toMonthKey, toDateKey, formatDate, birthDateFromResident } from "../utils/dateUtils";

const PERIOD_LABELS = { daily: "일급", weekly: "주급", monthly: "월급" };

// PC Payroll.jsx 미리보기와 동일한 항목 구성 — 값이 없으면(0) 해당 줄을
// 표시하지 않아 기본 항목만 쓰는 회사는 예전과 같은 간단한 명세서로 보인다.
const PAYMENT_ROWS = [
  ["기본급", "base", false],
  ["상여", "bonus", true],
  ["직책수당", "positionAllowance", true],
  ["연차수당", "annualLeaveAllowance", true],
  ["주휴수당", "weeklyAllowance", false],
  ["기타수당", "allowances", false],
  ["식대", "mealAllowance", false],
  ["특별상여", "specialBonus", true],
  ["연장근로수당", "overtimePay", false],
  ["휴일근로수당", "holidayPay", true],
  ["출장수당", "businessTripAllowance", true],
  ["장기근속수당", "longServiceAllowance", true],
  ["통신비지원금", "commAllowance", true],
  ["지각공제", "lateDeduction", false],
  ["조퇴공제", "earlyLeaveDeduction", false],
];
const DEDUCTION_ROWS = [
  ["국민연금", "pension", false],
  ["건강보험", "health", false],
  ["장기요양보험", "longTermCare", false],
  ["고용보험", "employment", false],
  ["기타공제액", "otherDeduction", true],
  ["건강보험정산", "healthAdjustment", true],
  ["선지급금", "advancePayment", true],
  ["소득세", "incomeTax", true],
  ["지방소득세", "localIncomeTax", true],
  ["연말정산소득세", "yearEndIncomeTax", true],
  ["연말정산지방소득세", "yearEndLocalIncomeTax", true],
];

function birthDateDisplay(residentNumberFront) {
  const key = birthDateFromResident(residentNumberFront);
  return key ? formatDate(key) : "-";
}

function defaultRangeFor(periodType, base = toDateKey()) {
  const end = new Date(`${base}T00:00:00`);
  const start = new Date(end);
  if (periodType === "weekly") start.setDate(start.getDate() - 6);
  else if (periodType === "monthly") {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  }
  return { start: toDateKey(start), end: toDateKey(end) };
}

const EMPTY_FORM = {
  wageType: "hourly",
  baseWage: 12000,
  hoursWorked: 160,
  overtimeHours: 0,
  weeklyEligibleWeeks: 4,
  allowances: 0,
  mealAllowance: 0,
  lateDeduction: 0,
  earlyLeaveDeduction: 0,
};

// 급여의 모바일 전용 화면 — PC의 다중필터+체크박스 일괄적용 표 대신,
// 월 선택+검색 카드 목록으로 훑어보고 카드를 탭해 개별 급여를 입력하는
// 흐름으로 재구성했다. 정산처리 요청/정산확정(취소)은 데스크톱과 동일한
// 계산 로직을 그대로 옮겨왔다. 보험/수당/공제 일괄적용은 PC 전용으로 남긴다.
export default function AdminMobilePayroll() {
  const { profile } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [companyName, setCompanyName] = useState("");
  const [payrollPayday, setPayrollPayday] = useState("");
  const [month, setMonth] = useState(toMonthKey());
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [selected, setSelected] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [editingBank, setEditingBank] = useState(false);
  const [bankForm, setBankForm] = useState({ bankName: "", bankAccount: "", accountHolder: "" });
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [settleOpen, setSettleOpen] = useState(false);
  const [settleForm, setSettleForm] = useState({ periodType: "monthly", monthEndOnly: false, ...defaultRangeFor("monthly") });
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    getDoc(doc(db, "companies", profile.companyId)).then((s) => {
      setCompanyName(s.data()?.name || "");
      setPayrollPayday(s.data()?.payrollPayday || "");
    });
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (s) => setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !e.deleted))),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
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

  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";
  const payrollFor = (uid) => payrolls.find((p) => p.uid === uid);

  const [previewFor, setPreviewFor] = useState(null); // { emp, p }
  const openPreview = (emp) => {
    const p = payrollFor(emp.id);
    if (!p) return;
    setPreviewFor({ emp, p });
  };

  const payDateFor = (p) => (payrollPayday ? `${p.month}-${String(payrollPayday).padStart(2, "0")}` : toDateKey());

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
    const win = window.open("", "_blank");
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

  const filteredEmployees = useMemo(() => {
    return employees
      .filter((emp) => emp.approved)
      .filter((emp) => siteFilter === "all" || emp.workSiteId === siteFilter)
      .filter((emp) => !search.trim() || emp.name?.includes(search.trim()) || emp.phone?.includes(search.trim()))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [employees, search, siteFilter]);

  const toggleSelected = (uid) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === filteredEmployees.length ? new Set() : new Set(filteredEmployees.map((e) => e.id))));
  };

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
    setSelected(new Set());
  };

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
    setEditingBank(false);
    setBankForm({ bankName: emp.bankName || "", bankAccount: emp.bankAccount || "", accountHolder: emp.accountHolder || "" });
    const existing = payrollFor(emp.id);
    setForm(
      existing
        ? {
            wageType: existing.wageType || "hourly",
            baseWage: existing.baseWage || 12000,
            hoursWorked: existing.hoursWorked || 160,
            overtimeHours: existing.overtimeHours || 0,
            weeklyEligibleWeeks: existing.weeklyEligibleWeeks || 4,
            allowances: existing.allowances || 0,
            mealAllowance: existing.mealAllowance || 0,
            lateDeduction: existing.lateDeduction || 0,
            earlyLeaveDeduction: existing.earlyLeaveDeduction || 0,
          }
        : EMPTY_FORM
    );
  };

  const saveBankInfo = async () => {
    if (bankForm.bankAccount && !isPlausibleAccountLength(bankForm.bankName, bankForm.bankAccount)) {
      toast.error(`${bankForm.bankName || "선택한 은행"} 계좌번호 자릿수가 맞지 않습니다. 다시 확인해주세요.`);
      return;
    }
    try {
      await updateDoc(doc(db, "users", target.id), {
        bankName: bankForm.bankName,
        bankAccount: bankForm.bankAccount,
        accountHolder: bankForm.accountHolder,
      });
      setTarget((t) => (t ? { ...t, ...bankForm } : t));
      setEditingBank(false);
      toast.success("급여계좌 정보가 수정되었습니다");
    } catch (err) {
      toast.error(`저장에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const existing = payrollFor(target.id);
      const rates = await getSiteInsuranceRates(profile.companyId, target.workSiteId, `${month}-28`, target.insuranceRateOverrideId);
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
      toast.success("저장되었습니다");
      setTarget(null);
    } catch (err) {
      toast.error(`저장에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const runSettlement = async () => {
    setSettling(true);
    try {
      const { start } = settleForm;
      const end = settleForm.monthEndOnly ? defaultRangeFor("monthly", start).end : settleForm.end;
      const attSnap = await getDocs(
        query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("date", ">=", start), where("date", "<=", end))
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
        const rates = await getSiteInsuranceRates(profile.companyId, emp.workSiteId, end, emp.insuranceRateOverrideId);
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
      toast.success("정산처리되었습니다");
      setSettleOpen(false);
    } catch (err) {
      toast.error(`정산처리에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setSettling(false);
    }
  };

  const setConfirmedFor = async (status) => {
    for (const emp of filteredEmployees) {
      const p = payrollFor(emp.id);
      if (!p) continue;
      if (status === "confirmed" && p.settlementStatus === "confirmed") continue;
      if (status === "draft" && p.settlementStatus !== "confirmed") continue;
      await setDoc(doc(db, "payrolls", p.id), { settlementStatus: status, confirmedAt: status === "confirmed" ? serverTimestamp() : null }, { merge: true });
    }
    toast.success(status === "confirmed" ? "정산확정되었습니다" : "정산확정이 취소되었습니다");
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">급여</p>
          <p className="mt-0.5 text-xs text-muted">{companyName}</p>
        </div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border border-slate-200 px-2.5 py-2 text-sm" />
      </div>

      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름 또는 연락처 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
        <option value="all">전체 센터</option>
        {workSites.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      <div className="relative flex items-center gap-2">
        <Button size="sm" className="flex-1" onClick={() => setSettleOpen(true)}>
          <CalculatorIcon size={13} /> 정산처리
        </Button>
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="shrink-0 rounded-xl border border-slate-200 bg-white p-2.5 text-muted active:bg-slate-50"
          aria-label="더보기"
        >
          <MoreVertical size={16} />
        </button>
        {moreOpen && (
          <div className="absolute right-0 top-full z-10 mt-1.5 w-44 space-y-0.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => { setConfirmedFor("confirmed"); setMoreOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-ink active:bg-slate-50"
            >
              <Lock size={13} /> 전체 확정
            </button>
            <button
              type="button"
              onClick={() => { setConfirmedFor("draft"); setMoreOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-ink active:bg-slate-50"
            >
              <LockOpen size={13} /> 확정취소
            </button>
            <button
              type="button"
              onClick={() => { setSelectMode(true); setMoreOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-ink active:bg-slate-50"
            >
              <ListChecks size={13} /> 선택 관리 모드
            </button>
          </div>
        )}
      </div>

      {selectMode && (
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain">
          <button type="button" onClick={toggleSelectAll} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-ink">
            {selected.size > 0 && selected.size === filteredEmployees.length ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} className="text-slate-300" />}
            전체선택 {selected.size > 0 && `(${selected.size})`}
          </button>
          <Button size="sm" variant="outline" onClick={settleSelected} disabled={selected.size === 0}>
            <CheckCircle2 size={13} /> 선택정산처리
          </Button>
          <Button size="sm" variant="danger" onClick={deleteSelectedPayrolls} disabled={selected.size === 0}>
            <Trash2 size={13} /> 선택삭제
          </Button>
          <button
            type="button"
            onClick={() => { setSelectMode(false); setSelected(new Set()); }}
            className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-muted active:bg-slate-50"
            aria-label="선택 모드 종료"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <div className="space-y-2">
        {filteredEmployees.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">조건에 맞는 근로자가 없습니다.</div>}
        {filteredEmployees.map((emp) => {
          const p = payrollFor(emp.id);
          const isSelected = selected.has(emp.id);
          return (
            <div
              key={emp.id}
              className={`flex w-full flex-col gap-2 rounded-xl border bg-white p-3.5 transition-colors ${isSelected ? "border-primary ring-1 ring-primary" : "border-slate-200"}`}
            >
              <div className="flex items-center gap-2">
                {selectMode && (
                  <button type="button" onClick={() => toggleSelected(emp.id)} className="shrink-0 p-0.5" aria-label="선택">
                    {isSelected ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} className="text-slate-300" />}
                  </button>
                )}
                <button type="button" onClick={() => openFor(emp)} className="flex flex-1 items-center justify-between gap-2 text-left">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{emp.name}</p>
                    <p className="truncate text-xs text-muted">{siteName_(emp.workSiteId)}</p>
                  </div>
                  {p ? (
                    p.settlementStatus === "confirmed" ? <Badge tone="success">정산확정</Badge> : <Badge tone="warning">정산처리</Badge>
                  ) : (
                    <Badge tone="muted">미처리</Badge>
                  )}
                </button>
              </div>
              {p && (
                <>
                  <button type="button" onClick={() => openFor(emp)} className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-center">
                    <div>
                      <p className="text-[11px] text-muted">지급합계</p>
                      <p className="text-xs font-semibold text-ink">{Number(p.grossPay || 0).toLocaleString()}원</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted">공제합계</p>
                      <p className="text-xs font-semibold text-ink">{Number(p.deductions?.total || 0).toLocaleString()}원</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted">실수령액</p>
                      <p className="text-xs font-bold text-primary">{Number(p.netPay || 0).toLocaleString()}원</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => openPreview(emp)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-ink"
                  >
                    <Receipt size={13} /> 명세서 미리보기
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs text-muted">
        <Monitor size={14} className="shrink-0" />
        보험·수당·공제 일괄적용, 엑셀 다운로드는 PC 화면에서 이용해주세요.
      </div>

      <Modal open={settleOpen} onClose={() => setSettleOpen(false)} title="정산처리 요청">
        <div className="space-y-3">
          <p className="text-sm text-ink">선택하신 기간 단위로 (재)정산처리됩니다.</p>
          <div className="flex gap-2">
            {Object.entries(PERIOD_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSettleForm((f) => ({ ...f, periodType: key, ...defaultRangeFor(key) }))}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold ${settleForm.periodType === key ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input type="date" className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" value={settleForm.start} onChange={(e) => setSettleForm((f) => ({ ...f, start: e.target.value }))} />
            <span className="text-muted">~</span>
            <input type="date" className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" value={settleForm.end} onChange={(e) => setSettleForm((f) => ({ ...f, end: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={settleForm.monthEndOnly} onChange={(e) => setSettleForm((f) => ({ ...f, monthEndOnly: e.target.checked }))} />
            월말계산 (당월말까지만 정산됨)
          </label>
          <Button className="w-full" onClick={runSettlement} disabled={settling}>
            {settling ? "처리 중..." : "정산처리"}
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(target)} onClose={() => setTarget(null)} title={`${target?.name || ""} · ${month} 급여 입력`}>
        <div className="space-y-3">
          <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-ink">급여계좌</p>
              {!editingBank && (
                <button type="button" className="font-semibold text-primary" onClick={() => setEditingBank(true)}>
                  수정
                </button>
              )}
            </div>
            {editingBank ? (
              <div className="space-y-2">
                <BankAccountFields
                  bankName={bankForm.bankName}
                  bankAccount={bankForm.bankAccount}
                  onBankNameChange={(v) => setBankForm((f) => ({ ...f, bankName: v }))}
                  onBankAccountChange={(v) => setBankForm((f) => ({ ...f, bankAccount: v }))}
                  bankLabel="은행"
                  accountLabel="계좌번호"
                  wrapperClassName="grid grid-cols-2 gap-2"
                  fieldClassName="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                  labelClassName="mb-1 block text-[11px] font-medium text-muted"
                />
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-muted">예금주</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                    value={bankForm.accountHolder}
                    onChange={(e) => setBankForm((f) => ({ ...f, accountHolder: e.target.value }))}
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-muted"
                    onClick={() => {
                      setEditingBank(false);
                      setBankForm({ bankName: target?.bankName || "", bankAccount: target?.bankAccount || "", accountHolder: target?.accountHolder || "" });
                    }}
                  >
                    취소
                  </button>
                  <button type="button" className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white" onClick={saveBankInfo}>
                    계좌 저장
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
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
            )}
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">급여 형태</span>
            <select className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.wageType} onChange={(e) => setForm((f) => ({ ...f, wageType: e.target.value }))}>
              <option value="hourly">시급</option>
              <option value="monthly">월급(고정)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">{form.wageType === "hourly" ? "시급(원)" : "월 기본급(원)"}</span>
            <CurrencyInput className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.baseWage} onChange={(v) => setForm((f) => ({ ...f, baseWage: v }))} />
          </label>
          {form.wageType === "hourly" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">근무시간</span>
                <input type="number" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.hoursWorked} onChange={(e) => setForm((f) => ({ ...f, hoursWorked: e.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">연장시간</span>
                <input type="number" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.overtimeHours} onChange={(e) => setForm((f) => ({ ...f, overtimeHours: e.target.value }))} />
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">주휴수당 적용 주수</span>
              <input type="number" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.weeklyEligibleWeeks} onChange={(e) => setForm((f) => ({ ...f, weeklyEligibleWeeks: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">기타수당(원)</span>
              <CurrencyInput className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.allowances} onChange={(v) => setForm((f) => ({ ...f, allowances: v }))} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">식대(원)</span>
              <CurrencyInput className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.mealAllowance} onChange={(v) => setForm((f) => ({ ...f, mealAllowance: v }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">지각공제(원)</span>
              <CurrencyInput className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.lateDeduction} onChange={(v) => setForm((f) => ({ ...f, lateDeduction: v }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">조퇴공제(원)</span>
              <CurrencyInput className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.earlyLeaveDeduction} onChange={(v) => setForm((f) => ({ ...f, earlyLeaveDeduction: v }))} />
            </label>
          </div>
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(previewFor)}
        onClose={() => setPreviewFor(null)}
        title="급여명세서 미리보기"
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={sharePayslip}>
              공유
            </Button>
            <Button variant="outline" className="flex-1" onClick={printPayslip}>
              <Printer size={13} /> 인쇄/저장
            </Button>
          </>
        }
      >
        {previewFor && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
              <div className="space-y-1 bg-ink px-5 py-4 text-center text-white">
                <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-white/70">
                  <Receipt size={13} /> 급여명세서
                </p>
                <p className="text-lg font-bold">{companyName || ""}</p>
              </div>
              <div className="space-y-3 border-b border-dashed border-slate-200 px-5 py-4">
                <PayslipInfoGroup
                  title="근로자 정보"
                  rows={[
                    ["성명", previewFor.emp.name],
                    ["생년월일", birthDateDisplay(previewFor.emp.residentNumberFront)],
                    ["입사일", previewFor.emp.hireDate ? formatDate(previewFor.emp.hireDate) : "-"],
                    ["직급", previewFor.emp.position || "-"],
                    ["부서", previewFor.emp.team || "-"],
                  ]}
                />
                <PayslipInfoGroup
                  title="지급 정보"
                  rows={[
                    ["회사명", companyName || "-"],
                    ["지급일", payDateFor(previewFor.p)],
                    ["지급대상기간", previewFor.p.month],
                    ["발급일", toDateKey()],
                    ["비고", previewFor.p.note || "-"],
                  ]}
                />
              </div>
              <div className="p-5 text-center">
                <span className="inline-block rounded-full bg-primary-light px-3 py-1 text-xs font-semibold text-primary">실수령액</span>
                <p className="mt-2 text-3xl font-extrabold text-ink">{Number(previewFor.p.netPay || 0).toLocaleString()}원</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5">
              <p className="mb-2 text-sm font-bold text-ink">지급내역 {Number(previewFor.p.grossPay || 0).toLocaleString()}원</p>
              {PAYMENT_ROWS.filter(([, key, optional]) => !optional || Number(previewFor.p[key] || 0)).map(([label, key]) => (
                <div key={key} className="flex items-center justify-between py-1.5 text-sm font-medium text-muted">
                  <span>{label}</span>
                  <span className="font-semibold text-ink">{Number(previewFor.p[key] || 0).toLocaleString()}원</span>
                </div>
              ))}
              <div className="my-2 border-t border-dashed border-slate-200" />
              <div className="flex items-center justify-between py-1.5 text-sm font-bold text-ink">
                <span>지급합계</span>
                <span>{Number(previewFor.p.grossPay || 0).toLocaleString()}원</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5">
              <p className="mb-2 text-sm font-semibold text-ink">공제내역</p>
              {DEDUCTION_ROWS.filter(([, key, optional]) => !optional || Number(previewFor.p.deductions?.[key] || 0)).map(([label, key]) => (
                <div key={key} className="flex items-center justify-between py-1.5 text-sm font-medium text-muted">
                  <span>{label}</span>
                  <span className="font-semibold text-ink">{Number(previewFor.p.deductions?.[key] || 0).toLocaleString()}원</span>
                </div>
              ))}
              <div className="my-2 border-t border-dashed border-slate-200" />
              <div className="flex items-center justify-between py-1.5 text-sm font-bold text-ink">
                <span>공제합계</span>
                <span>{Number(previewFor.p.deductions?.total || 0).toLocaleString()}원</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
