import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Wallet } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { calcMonthlyPayroll, DEFAULT_PAYROLL_RATES } from "../utils/payroll";
import { toMonthKey } from "../utils/dateUtils";

export default function Payroll() {
  const { profile } = useAuth();
  const [month, setMonth] = useState(toMonthKey());
  const [employees, setEmployees] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [target, setTarget] = useState(null);
  const [form, setForm] = useState({
    wageType: "hourly",
    baseWage: 12000,
    hoursWorked: 160,
    overtimeHours: 0,
    weeklyEligibleWeeks: 4,
    allowances: 0,
  });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
      (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "payrolls"), where("companyId", "==", profile.companyId), where("month", "==", month)),
      (snap) => setPayrolls(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId, month]);

  const payrollFor = (uid) => payrolls.find((p) => p.uid === uid);

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
      });
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const result = calcMonthlyPayroll({
      baseWage: Number(form.baseWage),
      wageType: form.wageType,
      hoursWorked: Number(form.hoursWorked),
      overtimeHours: Number(form.overtimeHours),
      weeklyEligibleWeeks: Number(form.weeklyEligibleWeeks),
      allowances: Number(form.allowances),
      rates: DEFAULT_PAYROLL_RATES,
    });

    await setDoc(doc(db, "payrolls", `${month}_${target.id}`), {
      companyId: profile.companyId,
      uid: target.id,
      name: target.name,
      month,
      wageType: form.wageType,
      baseWage: Number(form.baseWage),
      hoursWorked: Number(form.hoursWorked),
      overtimeHours: Number(form.overtimeHours),
      weeklyEligibleWeeks: Number(form.weeklyEligibleWeeks),
      ...result,
      updatedAt: serverTimestamp(),
    });
    setTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink">급여 정산</h1>
          <p className="text-sm text-muted">월별 급여명세서 생성/조회</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">지급합계</th>
              <th className="px-4 py-3 font-medium">공제합계</th>
              <th className="px-4 py-3 font-medium">실수령액</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const p = payrollFor(emp.id);
              return (
                <tr key={emp.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-ink">{emp.name}</td>
                  <td className="px-4 py-3 text-muted">{p ? p.grossPay.toLocaleString() + "원" : "-"}</td>
                  <td className="px-4 py-3 text-muted">{p ? p.deductions.total.toLocaleString() + "원" : "-"}</td>
                  <td className="px-4 py-3 font-medium text-ink">{p ? p.netPay.toLocaleString() + "원" : "-"}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="outline" onClick={() => openFor(emp)}>
                      <Wallet size={14} /> {p ? "수정" : "생성"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

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
        </form>
      </Modal>
    </div>
  );
}
