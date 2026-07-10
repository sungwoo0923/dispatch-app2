import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, getDocs, getDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Search, CalculatorIcon, Lock, LockOpen, Monitor } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { calcMonthlyPayroll, getSiteInsuranceRates } from "../utils/payroll";
import { toMonthKey, toDateKey } from "../utils/dateUtils";

const PERIOD_LABELS = { daily: "일급", weekly: "주급", monthly: "월급" };

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
  const [companyName, setCompanyName] = useState("");
  const [month, setMonth] = useState(toMonthKey());
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [settleOpen, setSettleOpen] = useState(false);
  const [settleForm, setSettleForm] = useState({ periodType: "monthly", monthEndOnly: false, ...defaultRangeFor("monthly") });
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    getDoc(doc(db, "companies", profile.companyId)).then((s) => setCompanyName(s.data()?.name || ""));
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (s) => setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
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

  const filteredEmployees = useMemo(() => {
    return employees
      .filter((emp) => emp.approved)
      .filter((emp) => !search.trim() || emp.name?.includes(search.trim()) || emp.phone?.includes(search.trim()))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [employees, search]);

  const openFor = (emp) => {
    setTarget(emp);
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

  const save = async () => {
    setSaving(true);
    try {
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

      <div className="flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain">
        <Button size="sm" onClick={() => setSettleOpen(true)}>
          <CalculatorIcon size={13} /> 정산처리 요청
        </Button>
        <Button size="sm" variant="outline" onClick={() => setConfirmedFor("confirmed")}>
          <Lock size={13} /> 전체 확정
        </Button>
        <Button size="sm" variant="outline" onClick={() => setConfirmedFor("draft")}>
          <LockOpen size={13} /> 확정취소
        </Button>
      </div>

      <div className="space-y-2">
        {filteredEmployees.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">조건에 맞는 근로자가 없습니다.</div>}
        {filteredEmployees.map((emp) => {
          const p = payrollFor(emp.id);
          return (
            <button key={emp.id} type="button" onClick={() => openFor(emp)} className="flex w-full flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{emp.name}</p>
                  <p className="truncate text-xs text-muted">{siteName_(emp.workSiteId)}</p>
                </div>
                {p ? (
                  p.settlementStatus === "confirmed" ? <Badge tone="success">정산확정</Badge> : <Badge tone="warning">정산처리</Badge>
                ) : (
                  <Badge tone="muted">미처리</Badge>
                )}
              </div>
              {p && (
                <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-center">
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
                </div>
              )}
            </button>
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
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">급여 형태</span>
            <select className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.wageType} onChange={(e) => setForm((f) => ({ ...f, wageType: e.target.value }))}>
              <option value="hourly">시급</option>
              <option value="monthly">월급(고정)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">{form.wageType === "hourly" ? "시급(원)" : "월 기본급(원)"}</span>
            <input type="number" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.baseWage} onChange={(e) => setForm((f) => ({ ...f, baseWage: e.target.value }))} />
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
              <input type="number" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.allowances} onChange={(e) => setForm((f) => ({ ...f, allowances: e.target.value }))} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">식대(원)</span>
              <input type="number" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.mealAllowance} onChange={(e) => setForm((f) => ({ ...f, mealAllowance: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">지각공제(원)</span>
              <input type="number" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.lateDeduction} onChange={(e) => setForm((f) => ({ ...f, lateDeduction: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">조퇴공제(원)</span>
              <input type="number" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.earlyLeaveDeduction} onChange={(e) => setForm((f) => ({ ...f, earlyLeaveDeduction: e.target.value }))} />
            </label>
          </div>
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
