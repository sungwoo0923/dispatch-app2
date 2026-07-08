import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { ListChecks, RefreshCw, FileSpreadsheet } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import { downloadCsv } from "../utils/exportCsv";
import { formatDate, toDateKey, addDays } from "../utils/dateUtils";
import { EMPLOYMENT_TYPE_OPTIONS, SHIFT_TYPE_OPTIONS } from "../constants/hr";
import SmsButton from "../components/SmsButton";

const EMPTY_FILTERS = { siteId: "", vendorId: "", shiftType: "", employmentType: "", name: "", phone: "" };

export default function LeaveUsageStatus() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [range, setRange] = useState({ start: addDays(toDateKey(), -90), end: toDateKey() });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (s) => setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (s) => setVendors(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")), (s) => setLeaves(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const employeeByUid = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";
  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "-";

  const rows = useMemo(() => {
    return leaves
      .map((lv) => ({ leave: lv, emp: employeeByUid.get(lv.uid) }))
      .filter(({ emp }) => Boolean(emp))
      .filter(({ leave, emp }) => {
        if (range.start && leave.startDate < range.start) return false;
        if (range.end && leave.startDate > range.end) return false;
        if (filters.siteId && emp.workSiteId !== filters.siteId) return false;
        if (filters.vendorId && emp.vendorId !== filters.vendorId) return false;
        if (filters.shiftType && emp.shiftType !== filters.shiftType) return false;
        if (filters.employmentType && emp.employmentType !== filters.employmentType) return false;
        if (filters.name && !emp.name?.includes(filters.name)) return false;
        if (filters.phone && !emp.phone?.includes(filters.phone)) return false;
        return true;
      })
      .sort((a, b) => b.leave.startDate.localeCompare(a.leave.startDate));
  }, [leaves, employeeByUid, filters, range]);

  const exportCsv = () => {
    const headers = ["이름", "사업자", "센터", "근무시작일자", "휴가일자", "휴가유형", "유급여부", "휴가일수", "사유", "전화번호"];
    downloadCsv("근로자휴가사용현황", headers, rows.map(({ leave: lv, emp }) => [lv.name, vendorName_(emp.vendorId), siteName_(emp.workSiteId), emp.hireDate ? formatDate(emp.hireDate) : "-", formatDate(lv.startDate), lv.type, lv.paid || "유급", lv.days || 1, lv.reason || "-", emp.phone || "-"]));
  };

  return (
    <div className="space-y-6">
      <Panel icon={ListChecks} title="근로자휴가사용현황">
        <p className="mb-4 text-xs text-muted">근로자가 전체적으로 휴가를 사용한 현황을 확인 할 수 있습니다. 휴가일자,유급유형 및 유급 여부,휴가 일수를 한 눈에 확인 가능하며 조회 할 수 있습니다.</p>
        <Card className="mb-4 space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.siteId} onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value }))}>
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
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.vendorId} onChange={(e) => setFilters((f) => ({ ...f, vendorId: e.target.value }))}>
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
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.shiftType} onChange={(e) => setFilters((f) => ({ ...f, shiftType: e.target.value }))}>
                <option value="">전체</option>
                {SHIFT_TYPE_OPTIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">근무형태</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.employmentType} onChange={(e) => setFilters((f) => ({ ...f, employmentType: e.target.value }))}>
                <option value="">전체</option>
                {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">이름</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.name} onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">휴가발생일</span>
              <div className="flex items-center gap-1.5">
                <input type="date" className="rounded-lg border border-slate-200 px-2 py-2 text-sm" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
                <span className="text-muted">~</span>
                <input type="date" className="rounded-lg border border-slate-200 px-2 py-2 text-sm" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
              </div>
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50" onClick={() => setFilters(EMPTY_FILTERS)}>
              <RefreshCw size={16} />
            </button>
            <Button>검색</Button>
          </div>
        </Card>

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="text-xs font-medium text-muted">근로자 휴가 사용 현황 {rows.length}</p>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <FileSpreadsheet size={13} /> 엑셀
          </Button>
        </div>
        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[860px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-semibold">순번</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">사업자</th>
                <th className="px-4 py-3 font-semibold">센터</th>
                <th className="px-4 py-3 font-semibold">근무시작일자</th>
                <th className="px-4 py-3 font-semibold">휴가일자</th>
                <th className="px-4 py-3 font-semibold">휴가유형</th>
                <th className="px-4 py-3 font-semibold">유급여부</th>
                <th className="px-4 py-3 font-semibold">휴가일수</th>
                <th className="px-4 py-3 font-semibold">사유</th>
                <th className="px-4 py-3 font-semibold">전화번호</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ leave: lv, emp }, i) => (
                <tr key={lv.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-ink">{i + 1}</td>
                  <td className="px-4 py-3 text-ink">{lv.name}</td>
                  <td className="px-4 py-3 text-ink">{vendorName_(emp.vendorId)}</td>
                  <td className="px-4 py-3 text-ink">{siteName_(emp.workSiteId)}</td>
                  <td className="px-4 py-3 text-ink">{emp.hireDate ? formatDate(emp.hireDate) : "-"}</td>
                  <td className="px-4 py-3 text-ink">{formatDate(lv.startDate)}</td>
                  <td className="px-4 py-3 text-ink">{lv.type}</td>
                  <td className="px-4 py-3 text-ink">{lv.paid || "유급"}</td>
                  <td className="px-4 py-3 text-ink">{lv.days || 1}</td>
                  <td className="px-4 py-3 text-ink">{lv.reason || "-"}</td>
                  <td className="px-4 py-3 text-ink"><span className="inline-flex items-center gap-1">{emp.phone || "-"}<SmsButton phone={emp.phone} /></span></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-center text-xs text-muted">
                    사용된 휴가가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
