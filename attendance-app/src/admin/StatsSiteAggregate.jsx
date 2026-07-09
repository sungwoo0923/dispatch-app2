import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { FileSpreadsheet, Building2, RefreshCw } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Panel from "../components/Panel";
import { toMonthKey } from "../utils/dateUtils";
import { downloadCsv } from "../utils/exportCsv";
import { EMPLOYMENT_TYPE_OPTIONS, SHIFT_TYPE_OPTIONS } from "../constants/hr";
import { useCompanyLookups, filterEmployees, daysInMonth } from "../utils/statsShared";

function ExcelButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-slate-50">
      <FileSpreadsheet size={15} /> 엑셀
    </button>
  );
}

export default function StatsSiteAggregate() {
  const { profile } = useAuth();
  const lookups = useCompanyLookups(profile?.companyId);
  const [filters, setFilters] = useState({ siteId: "", vendorId: "", shiftType: "", employmentType: "" });
  const [month, setMonth] = useState(toMonthKey());
  const [attendance, setAttendance] = useState([]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("month", "==", month)),
      (snap) => setAttendance(snap.docs.map((d) => d.data()))
    );
    return () => unsub();
  }, [profile?.companyId, month]);

  const numDays = daysInMonth(month);
  const dayList = Array.from({ length: numDays }, (_, i) => i + 1);
  const employeesById = useMemo(() => new Map(lookups.employees.map((e) => [e.id, e])), [lookups.employees]);
  const siteName_ = (id) => lookups.workSites.find((s) => s.id === id)?.name || "-";
  const vendorName_ = (id) => lookups.vendors.find((v) => v.id === id)?.name || "-";

  const groups = useMemo(() => {
    const filteredEmployees = filterEmployees(lookups.employees, filters);
    const filteredIds = new Set(filteredEmployees.map((e) => e.id));
    const byKey = new Map();
    for (const emp of filteredEmployees) {
      const key = `${emp.workSiteId || ""}_${emp.vendorId || ""}_${emp.shiftType || ""}`;
      if (!byKey.has(key)) {
        byKey.set(key, { key, siteId: emp.workSiteId, vendorId: emp.vendorId, shiftType: emp.shiftType, counts: Array(numDays).fill(0) });
      }
    }
    for (const a of attendance) {
      if (!filteredIds.has(a.uid) || a.status !== "출근") continue;
      const emp = employeesById.get(a.uid);
      if (!emp) continue;
      const key = `${emp.workSiteId || ""}_${emp.vendorId || ""}_${emp.shiftType || ""}`;
      const g = byKey.get(key);
      if (!g) continue;
      const day = Number(a.date.slice(8, 10));
      if (day >= 1 && day <= numDays) g.counts[day - 1] += 1;
    }
    return [...byKey.values()];
  }, [lookups.employees, filters, attendance, employeesById, numDays]);

  const exportCsv = () => {
    const headers = ["사업자", "센터", "소속업체", "근무구분", ...dayList.map((d) => String(d))];
    const rowsOut = groups.map((g) => [lookups.companyName, siteName_(g.siteId), vendorName_(g.vendorId), g.shiftType || "-", ...g.counts]);
    downloadCsv(`센터별집계_${month}`, headers, rowsOut);
  };

  const subtotals = dayList.map((_, i) => groups.reduce((sum, g) => sum + g.counts[i], 0));

  return (
    <Panel icon={Building2} title="센터별집계">
      <p className="mb-4 text-xs text-muted">선택한 센터의 월별, 소속업체, 근무구분 근무형태에 따른 출근 인원을 조회할 수 있습니다.</p>
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">사업자</span>
          <select disabled className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-muted">
            <option>{lookups.companyName || "-"}</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.siteId} onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value }))}>
            <option value="">전체</option>
            {lookups.workSites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">소속업체</span>
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.vendorId} onChange={(e) => setFilters((f) => ({ ...f, vendorId: e.target.value }))}>
            <option value="">전체</option>
            {lookups.vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">근무구분</span>
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.shiftType} onChange={(e) => setFilters((f) => ({ ...f, shiftType: e.target.value }))}>
            <option value="">전체</option>
            {SHIFT_TYPE_OPTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">근무형태</span>
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.employmentType} onChange={(e) => setFilters((f) => ({ ...f, employmentType: e.target.value }))}>
            <option value="">전체</option>
            {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">출근월</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <div className="ml-auto">
          <button type="button" className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50" title="새로고침" onClick={() => setFilters({ siteId: "", vendorId: "", shiftType: "", employmentType: "" })}>
            <RefreshCw size={16} />
          </button>
        </div>
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-muted">목록 {groups.length}</p>
        <ExcelButton onClick={exportCsv} />
      </div>
      <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-muted">
              <th className="sticky left-0 bg-white px-3 py-3 font-medium">사업자</th>
              <th className="bg-white px-3 py-3 font-medium">센터</th>
              <th className="bg-white px-3 py-3 font-medium">소속업체</th>
              <th className="bg-white px-3 py-3 font-medium">근무구분</th>
              {dayList.map((d) => (
                <th key={d} className="px-2 py-3 text-center font-medium">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} className="border-b border-slate-50 last:border-0">
                <td className="sticky left-0 bg-white px-3 py-2 text-ink">{lookups.companyName}</td>
                <td className="px-3 py-2 text-ink">{siteName_(g.siteId)}</td>
                <td className="px-3 py-2 text-ink">{vendorName_(g.vendorId)}</td>
                <td className="px-3 py-2 text-ink">{g.shiftType || "-"}</td>
                {g.counts.map((c, i) => (
                  <td key={i} className="px-2 py-2 text-center">{c}</td>
                ))}
              </tr>
            ))}
            {groups.length > 0 && (
              <tr className="bg-slate-50 font-semibold text-ink">
                <td colSpan={4} className="sticky left-0 bg-slate-50 px-3 py-2 text-right">[소계]</td>
                {subtotals.map((s, i) => (
                  <td key={i} className="px-2 py-2 text-center">{s}</td>
                ))}
              </tr>
            )}
            {groups.length === 0 && (
              <tr>
                <td colSpan={numDays + 4} className="px-4 py-6 text-center text-muted">조건에 맞는 데이터가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
