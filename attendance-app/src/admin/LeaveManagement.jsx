import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Users2, RefreshCw, FileSpreadsheet } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Panel from "../components/Panel";
import { downloadCsv } from "../utils/exportCsv";
import { formatDate, toDateKey } from "../utils/dateUtils";
import { calcLeaveBalance } from "../utils/leave";
import { SHIFT_TYPE_OPTIONS } from "../constants/hr";

const EMPTY_FILTERS = { siteId: "", vendorId: "", shiftType: "", name: "" };

// 예전엔 관리자가 "휴가템플릿/휴가유형/센터별설정"을 먼저 다 만들고, 그
// 다음 근로자를 하나하나 "휴가 대상자로 등록"까지 해야만 이 화면에
// 나타났다 — 근로기준법 기준 연차/월차는 입사일만 있으면 자동으로 계산
// 가능한데 관리자에게 3중 사전설정을 요구하는 구조였고, 실제로는 그
// 설정과 무관하게 발생일수가 항상 "2일" 고정값으로 나오는 버그까지
// 있었다. 이제 입사일 기준으로 자동 계산하고, 모든 재직 근로자가 별도
// 등록 없이 바로 나타난다.
export default function LeaveManagement() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [asOf, setAsOf] = useState(toDateKey());

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (s) =>
        setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !e.deleted && e.employmentStatus !== "퇴사"))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (s) => setVendors(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")), (s) => setLeaves(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";
  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "-";

  const rows = useMemo(() => {
    return employees
      .filter((e) => (!filters.siteId || e.workSiteId === filters.siteId) && (!filters.vendorId || e.vendorId === filters.vendorId) && (!filters.shiftType || e.shiftType === filters.shiftType) && (!filters.name || e.name?.includes(filters.name)))
      .map((e) => ({
        emp: e,
        balance: calcLeaveBalance({ hireDate: e.hireDate || asOf, leaves: leaves.filter((l) => l.uid === e.id), today: asOf, careerYears: e.careerYears }),
      }))
      .sort((a, b) => (a.emp.name || "").localeCompare(b.emp.name || ""));
  }, [employees, leaves, filters, asOf]);

  const exportCsv = () => {
    const headers = ["이름", "사업자", "센터", "입사일", "구분", "휴가발생일수", "휴가사용일수", "휴가잔여일수"];
    downloadCsv(
      "근로자휴가관리",
      headers,
      rows.map(({ emp: e, balance: b }) => [e.name, vendorName_(e.vendorId), siteName_(e.workSiteId), e.hireDate ? formatDate(e.hireDate) : "-", b.leaveLabel, b.entitlement, b.used, b.remaining])
    );
  };

  return (
    <div className="space-y-6">
      <Panel icon={Users2} title="근로자휴가관리">
        <p className="mb-4 text-xs text-muted">
          입사일 기준 근로기준법 산정 방식(1년 미만: 매월 개근 시 1일 · 1년 이상: 15일 + 장기근속 가산)으로 자동 계산됩니다. 별도 등록 없이 재직 중인 모든 근로자가 표시됩니다.
        </p>

        <Card className="mb-4 space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
              <span className="mb-1.5 block text-xs font-medium text-muted">이름</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.name} onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">조회기준일자</span>
              <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50" onClick={() => { setFilters(EMPTY_FILTERS); setAsOf(toDateKey()); }}>
              <RefreshCw size={16} />
            </button>
            <Button>검색</Button>
          </div>
        </Card>

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="text-xs font-medium text-muted">근로자 휴가 현황 {rows.length}</p>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <FileSpreadsheet size={13} /> 엑셀
          </Button>
        </div>
        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[820px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-semibold">순번</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">사업자</th>
                <th className="px-4 py-3 font-semibold">센터</th>
                <th className="px-4 py-3 font-semibold">입사일</th>
                <th className="px-4 py-3 font-semibold">구분</th>
                <th className="px-4 py-3 font-semibold">휴가발생일수</th>
                <th className="px-4 py-3 font-semibold">휴가사용일수</th>
                <th className="px-4 py-3 font-semibold">휴가잔여일수</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ emp: e, balance: b }, i) => (
                <tr key={e.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-ink">{i + 1}</td>
                  <td className="px-4 py-3 text-ink">{e.name}</td>
                  <td className="px-4 py-3 text-ink">{vendorName_(e.vendorId)}</td>
                  <td className="px-4 py-3 text-ink">{siteName_(e.workSiteId)}</td>
                  <td className="px-4 py-3 text-ink">{e.hireDate ? formatDate(e.hireDate) : "-"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={b.isAnnual ? "success" : "warning"}>{b.leaveLabel}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink">{b.entitlement}</td>
                  <td className="px-4 py-3 text-ink">{b.used}</td>
                  <td className="px-4 py-3 font-semibold text-primary">{b.remaining}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-xs text-muted">
                    조회조건에 해당하는 근로자가 없습니다.
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
