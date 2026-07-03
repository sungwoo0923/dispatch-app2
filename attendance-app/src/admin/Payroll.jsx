import { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Wallet, FileSpreadsheet, Lock, LockOpen, CalculatorIcon } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { calcMonthlyPayroll, DEFAULT_PAYROLL_RATES, getSiteInsuranceRates } from "../utils/payroll";
import { toMonthKey, toDateKey } from "../utils/dateUtils";
import { downloadCsv } from "../utils/exportCsv";
import { EMPLOYMENT_TYPE_OPTIONS } from "../constants/hr";

const PERIOD_LABELS = { daily: "일급", weekly: "주급", monthly: "월급" };

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

export default function Payroll() {
  const { profile } = useAuth();
  const [month, setMonth] = useState(toMonthKey());
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [allowanceTemplates, setAllowanceTemplates] = useState([]);
  const [target, setTarget] = useState(null);
  const [form, setForm] = useState({
    wageType: "hourly",
    baseWage: 12000,
    hoursWorked: 160,
    overtimeHours: 0,
    weeklyEligibleWeeks: 4,
    allowances: 0,
  });

  const [filters, setFilters] = useState({ siteId: "", vendorId: "", employmentType: "", team: "", search: "" });
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleForm, setSettleForm] = useState({ periodType: "monthly", ...defaultRangeFor("monthly") });
  const [settling, setSettling] = useState(false);

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

  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";
  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "-";

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (!emp.approved) return false;
      if (filters.siteId && emp.workSiteId !== filters.siteId) return false;
      if (filters.vendorId && emp.vendorId !== filters.vendorId) return false;
      if (filters.employmentType && emp.employmentType !== filters.employmentType) return false;
      if (filters.team && emp.team !== filters.team) return false;
      if (filters.search && !`${emp.name}${emp.phone}`.includes(filters.search)) return false;
      return true;
    });
  }, [employees, filters]);

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
    } else {
      setForm({ wageType: "hourly", baseWage: 12000, hoursWorked: 160, overtimeHours: 0, weeklyEligibleWeeks: 4, allowances: 0 });
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
    const { start, end } = settleForm;
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
      const weeklyEligibleWeeks = existing?.weeklyEligibleWeeks || 0;
      const rates = await getSiteInsuranceRates(profile.companyId, emp.workSiteId, end);
      const result = calcMonthlyPayroll({
        baseWage,
        wageType,
        hoursWorked: Math.round(hoursWorked),
        overtimeHours: Math.round(overtimeHours),
        weeklyEligibleWeeks,
        allowances,
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

  const exportCsv = () => {
    const headers = ["이름", "센터", "소속업체", "고용구분", "지급합계", "공제합계", "실수령액", "정산상태"];
    const rows = filteredEmployees.map((emp) => {
      const p = payrollFor(emp.id);
      return [
        emp.name,
        siteName_(emp.workSiteId),
        vendorName_(emp.vendorId),
        emp.employmentType || "-",
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink">급여 정산</h1>
          <p className="text-sm text-muted">월별 급여명세서 생성/조회</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <Button variant="outline" onClick={exportCsv}>
            <FileSpreadsheet size={16} /> 엑셀
          </Button>
          <Button onClick={() => setSettleOpen(true)}>
            <CalculatorIcon size={16} /> 정산처리 요청
          </Button>
        </div>
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
          <span className="mb-1.5 block text-xs font-medium text-muted">근무형태</span>
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
        <label className="block flex-1 min-w-[160px]">
          <span className="mb-1.5 block text-xs font-medium text-muted">이름 검색</span>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="검색어 입력"
          />
        </label>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setConfirmedFor("confirmed")}>
            <Lock size={13} /> 정산확정
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmedFor("draft")}>
            <LockOpen size={13} /> 정산확정취소
          </Button>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">센터</th>
              <th className="px-4 py-3 font-medium">지급합계</th>
              <th className="px-4 py-3 font-medium">공제합계</th>
              <th className="px-4 py-3 font-medium">실수령액</th>
              <th className="px-4 py-3 font-medium">정산상태</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map((emp) => {
              const p = payrollFor(emp.id);
              return (
                <tr key={emp.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-ink">{emp.name}</td>
                  <td className="px-4 py-3 text-muted">{siteName_(emp.workSiteId)}</td>
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
                <td colSpan={7} className="px-4 py-6 text-center text-xs text-muted">
                  조건에 맞는 근로자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

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
        <p className="mb-3 text-xs text-muted">
          선택하신 기간 단위로 (재)정산처리됩니다. 현재 필터 조건에 맞는 근로자 {filteredEmployees.length}명의 출근기록을 기준으로 근무시간을 계산합니다.
        </p>
        <label className="mb-3 block">
          <span className="mb-1.5 block text-xs font-medium text-muted">급여형태</span>
          <div className="flex gap-2">
            {Object.entries(PERIOD_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSettleForm({ periodType: key, ...defaultRangeFor(key) })}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
                  settleForm.periodType === key ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">시작일</span>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={settleForm.start}
              onChange={(e) => setSettleForm((f) => ({ ...f, start: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">종료일</span>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={settleForm.end}
              onChange={(e) => setSettleForm((f) => ({ ...f, end: e.target.value }))}
            />
          </label>
        </div>
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
