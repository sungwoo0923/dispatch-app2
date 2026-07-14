import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { ListChecks, RefreshCw, FileSpreadsheet } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import Modal from "../components/Modal";
import { downloadCsv } from "../utils/exportCsv";
import { formatDate, toDateKey, addDays } from "../utils/dateUtils";
import { calcLeaveBalance } from "../utils/leave";
import { EMPLOYMENT_TYPE_OPTIONS, SHIFT_TYPE_OPTIONS } from "../constants/hr";
import SmsButton from "../components/SmsButton";

// 사용내역/월별집계/연도별집계는 전부 "이미 사용된 휴가를 다른 각도로 조회"하는
// 화면이라 별도 메뉴 3개 대신 탭 하나로 묶었다. 데이터 구독(leaves)은 공통이라
// 최상위에서 한 번만 구독하고 각 탭에 내려준다.
const TOP_TABS = [
  { key: "list", label: "사용내역" },
  { key: "month", label: "월별집계" },
  { key: "year", label: "연도별집계" },
];

function buildAggRows(period, yearMonth, employees, leaves) {
  const [year, month] = yearMonth.split("-").map(Number);
  const cols = period === "month" ? Array.from({ length: 31 }, (_, i) => i + 1) : Array.from({ length: 12 }, (_, i) => i + 1);

  const rows = employees.map((e) => {
    const perCol = Object.fromEntries(cols.map((c) => [c, 0]));
    for (const lv of leaves.filter((l) => l.uid === e.id)) {
      const d = new Date(`${lv.startDate}T00:00:00`);
      if (period === "month") {
        if (d.getFullYear() === year && d.getMonth() + 1 === month) perCol[d.getDate()] = (perCol[d.getDate()] || 0) + (lv.days || 1);
      } else {
        if (d.getFullYear() === year) perCol[d.getMonth() + 1] = (perCol[d.getMonth() + 1] || 0) + (lv.days || 1);
      }
    }
    const total = Object.values(perCol).reduce((a, b) => a + b, 0);
    return { emp: e, perCol, total };
  });

  return { cols, rows: rows.filter((r) => r.total > 0) };
}

export default function LeaveUsage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState("list");
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [leaves, setLeaves] = useState([]);

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

  return (
    <div className="space-y-6">
      <Panel icon={ListChecks} title="휴가사용현황">
        <div className="mb-4 flex flex-nowrap overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100 bg-white">
          {TOP_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`shrink-0 px-4 py-3 text-sm font-medium ${tab === t.key ? "bg-primary-dark text-white" : "text-muted hover:bg-slate-50"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "list" && <UsageListTab employees={employees} workSites={workSites} vendors={vendors} leaves={leaves} />}
        {tab === "month" && <MonthlyTab employees={employees} vendors={vendors} leaves={leaves} />}
        {tab === "year" && <YearlyTab employees={employees} workSites={workSites} vendors={vendors} leaves={leaves} />}
      </Panel>
    </div>
  );
}

const EMPTY_FILTERS = { siteId: "", vendorId: "", shiftType: "", employmentType: "", name: "", phone: "" };

function UsageListTab({ employees, workSites, vendors, leaves }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [range, setRange] = useState({ start: addDays(toDateKey(), -90), end: toDateKey() });
  const [detailUid, setDetailUid] = useState(null);

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
    <div>
      <p className="mb-4 text-xs text-muted">근로자가 전체적으로 휴가를 사용한 현황을 확인 할 수 있습니다. 휴가일자, 유급유형 및 유급 여부, 휴가 일수를 한 눈에 확인 가능하며 조회 할 수 있습니다.</p>
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
              <tr
                key={lv.id}
                onDoubleClick={() => setDetailUid(emp.id)}
                title="더블클릭하여 휴가현황 요약보기"
                className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
              >
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

      <Modal
        open={Boolean(detailUid)}
        onClose={() => setDetailUid(null)}
        title="근로자 휴가현황 요약"
        footer={<Button onClick={() => setDetailUid(null)}>닫기</Button>}
      >
        {detailUid &&
          (() => {
            const emp = employeeByUid.get(detailUid);
            const b = calcLeaveBalance({ hireDate: emp?.hireDate || toDateKey(), leaves: leaves.filter((l) => l.uid === detailUid), careerYears: emp?.careerYears });
            return (
              <div className="space-y-3 text-center">
                <p className="text-sm font-semibold text-ink">{emp?.name}</p>
                <p className="text-xs text-muted">{siteName_(emp?.workSiteId)} · {vendorName_(emp?.vendorId)}</p>
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <div className="rounded-xl border border-slate-100 p-3">
                    <p className="text-[11px] text-muted">총 휴가발생일수 ({b.leaveLabel})</p>
                    <p className="mt-1 text-lg font-bold text-ink">{b.entitlement}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 p-3">
                    <p className="text-[11px] text-muted">사용일수</p>
                    <p className="mt-1 text-lg font-bold text-ink">{b.used}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 p-3">
                    <p className="text-[11px] text-muted">잔여일수</p>
                    <p className="mt-1 text-lg font-bold text-primary">{b.remaining}</p>
                  </div>
                </div>
              </div>
            );
          })()}
      </Modal>
    </div>
  );
}

function MonthlyTab({ employees, vendors, leaves }) {
  const [yearMonth, setYearMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { cols, rows } = useMemo(() => buildAggRows("month", yearMonth, employees, leaves), [yearMonth, employees, leaves]);

  const exportCsv = () => {
    const headers = ["소속업체", "이름", "전화번호", ...cols.map((c) => `${c}일`)];
    downloadCsv("근로자별월간집계", headers, rows.map((r) => [vendors.find((v) => v.id === r.emp.vendorId)?.name || "-", r.emp.name, r.emp.phone || "-", ...cols.map((c) => r.perCol[c] || "")]));
  };

  return (
    <div>
      <p className="mb-4 text-xs text-muted">사업자의 검색 조건 별로 월 단위로 휴가 사용한 일 수를 전체적으로 볼수 있으며 유급 휴가에 대해서 통계 집계를 조회 할 수 있습니다.</p>
      <Card className="mb-4 flex flex-nowrap items-end justify-between gap-3 overflow-x-auto overscroll-x-contain p-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">출근년월</span>
          <input type="month" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} />
        </label>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <FileSpreadsheet size={13} /> 엑셀
        </Button>
      </Card>
      <p className="mb-2 text-xs font-medium text-muted">목록 {rows.length}</p>
      <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
        <table className="w-full min-w-[1100px] text-center text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-3 py-3 font-semibold">소속업체</th>
              <th className="px-3 py-3 font-semibold">이름</th>
              <th className="px-3 py-3 font-semibold">전화번호</th>
              {cols.map((c) => (
                <th key={c} className="px-2 py-3 text-center font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.emp.id} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-2 text-ink">{vendors.find((v) => v.id === r.emp.vendorId)?.name || "-"}</td>
                <td className="px-3 py-2 text-ink">{r.emp.name}</td>
                <td className="px-3 py-2 text-ink"><span className="inline-flex items-center gap-1">{r.emp.phone || "-"}<SmsButton phone={r.emp.phone} /></span></td>
                {cols.map((c) => (
                  <td key={c} className="px-2 py-2 text-center text-ink">
                    {r.perCol[c] || ""}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3 + cols.length} className="px-3 py-6 text-center text-xs text-muted">
                  해당 월에 사용된 휴가가 없습니다.
                </td>
              </tr>
            )}
            {rows.length > 0 && (
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td className="px-3 py-2 text-ink" colSpan={3}>
                  [소계]
                </td>
                {cols.map((c) => (
                  <td key={c} className="px-2 py-2 text-center text-ink">
                    {rows.reduce((sum, r) => sum + (r.perCol[c] || 0), 0) || ""}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function YearlyTab({ employees, workSites, vendors, leaves }) {
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const { cols, rows } = useMemo(() => buildAggRows("year", `${year}-01`, employees, leaves), [year, employees, leaves]);

  const exportCsv = () => {
    const headers = ["센터", "소속업체", "이름", "전화번호", ...cols.map((c) => `${c}월`)];
    downloadCsv("근로자별연간집계", headers, rows.map((r) => [workSites.find((s) => s.id === r.emp.workSiteId)?.name || "-", vendors.find((v) => v.id === r.emp.vendorId)?.name || "-", r.emp.name, r.emp.phone || "-", ...cols.map((c) => r.perCol[c] || "")]));
  };

  return (
    <div>
      <p className="mb-4 text-xs text-muted">사업자의 검색 조건 별로 연 단위로 휴가 사용한 일 수를 전체적으로 볼수 있으며 유급 일수로 통계 집계를 조회할 수 있습니다.</p>
      <Card className="mb-4 flex flex-nowrap items-end justify-between gap-3 overflow-x-auto overscroll-x-contain p-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">출근년도</span>
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={year} onChange={(e) => setYear(e.target.value)}>
            {[Number(year) - 1, Number(year), Number(year) + 1].map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <FileSpreadsheet size={13} /> 엑셀
        </Button>
      </Card>
      <p className="mb-2 text-xs font-medium text-muted">목록 {rows.length}</p>
      <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
        <table className="w-full min-w-[900px] text-center text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-3 py-3 font-semibold">센터</th>
              <th className="px-3 py-3 font-semibold">소속업체</th>
              <th className="px-3 py-3 font-semibold">이름</th>
              <th className="px-3 py-3 font-semibold">전화번호</th>
              {cols.map((c) => (
                <th key={c} className="px-2 py-3 text-center font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.emp.id} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-2 text-ink">{workSites.find((s) => s.id === r.emp.workSiteId)?.name || "-"}</td>
                <td className="px-3 py-2 text-ink">{vendors.find((v) => v.id === r.emp.vendorId)?.name || "-"}</td>
                <td className="px-3 py-2 text-ink">{r.emp.name}</td>
                <td className="px-3 py-2 text-ink"><span className="inline-flex items-center gap-1">{r.emp.phone || "-"}<SmsButton phone={r.emp.phone} /></span></td>
                {cols.map((c) => (
                  <td key={c} className="px-2 py-2 text-center text-ink">
                    {r.perCol[c] || ""}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4 + cols.length} className="px-3 py-6 text-center text-xs text-muted">
                  해당 연도에 사용된 휴가가 없습니다.
                </td>
              </tr>
            )}
            {rows.length > 0 && (
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td className="px-3 py-2 text-ink" colSpan={4}>
                  [소계]
                </td>
                {cols.map((c) => (
                  <td key={c} className="px-2 py-2 text-center text-ink">
                    {rows.reduce((sum, r) => sum + (r.perCol[c] || 0), 0) || ""}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
