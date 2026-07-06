import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { FileSpreadsheet, BarChart3, Users, CalendarDays, Building2, RefreshCw } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Panel from "../components/Panel";
import { toMonthKey, toDateKey } from "../utils/dateUtils";
import { downloadCsv } from "../utils/exportCsv";
import { EMPLOYMENT_TYPE_OPTIONS, SHIFT_TYPE_OPTIONS } from "../constants/hr";

const TABS = [
  { key: "summary", label: "요약" },
  { key: "attendanceCount", label: "근로자별출근집계" },
  { key: "monthlyGrid", label: "근로자별월별출근집계" },
  { key: "siteAggregate", label: "센터별집계" },
];

function useCompanyLookups(companyId) {
  const [companyName, setCompanyName] = useState("");
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    if (!companyId) return;
    getDoc(doc(db, "companies", companyId)).then((s) => setCompanyName(s.data()?.name || ""));
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", companyId), where("role", "==", "employee")), (snap) =>
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", companyId)), (snap) =>
        setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", companyId)), (snap) =>
        setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "departments"), where("companyId", "==", companyId)), (snap) =>
        setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "positions"), where("companyId", "==", companyId)), (snap) =>
        setPositions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [companyId]);

  return { companyName, employees, workSites, vendors, departments, positions };
}

function filterEmployees(employees, filters) {
  return employees.filter((emp) => {
    if (!emp.approved) return false;
    if (filters.siteId && emp.workSiteId !== filters.siteId) return false;
    if (filters.vendorId && emp.vendorId !== filters.vendorId) return false;
    if (filters.shiftType && emp.shiftType !== filters.shiftType) return false;
    if (filters.employmentType && emp.employmentType !== filters.employmentType) return false;
    if (filters.team && emp.team !== filters.team) return false;
    if (filters.position && emp.position !== filters.position) return false;
    if (filters.search && !`${emp.name}${emp.phone}`.includes(filters.search)) return false;
    return true;
  });
}

function ExcelButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-slate-50"
    >
      <FileSpreadsheet size={15} /> 엑셀
    </button>
  );
}

function AttendanceCountTab({ profile, lookups }) {
  const [filters, setFilters] = useState({ siteId: "", vendorId: "", shiftType: "", employmentType: "", search: "" });
  const [range, setRange] = useState(() => {
    const end = toDateKey();
    const start = end.slice(0, 8) + "01";
    return { start, end };
  });
  const [attendance, setAttendance] = useState([]);
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(
        collection(db, "attendance"),
        where("companyId", "==", profile.companyId),
        where("date", ">=", range.start),
        where("date", "<=", range.end)
      ),
      (snap) => setAttendance(snap.docs.map((d) => d.data()))
    );
    return () => unsub();
  }, [profile?.companyId, range.start, range.end]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(
        collection(db, "schedules"),
        where("companyId", "==", profile.companyId),
        where("date", ">=", range.start),
        where("date", "<=", range.end)
      ),
      (snap) => setSchedules(snap.docs.map((d) => d.data()))
    );
    return () => unsub();
  }, [profile?.companyId, range.start, range.end]);

  const rows = useMemo(() => {
    const filtered = filterEmployees(lookups.employees, filters);
    return filtered.map((emp) => {
      const empAttendance = attendance.filter((a) => a.uid === emp.id && a.status === "출근");
      let late = 0;
      for (const a of empAttendance) {
        if (!a.checkInTime) continue;
        const sched = schedules.find((s) => s.uid === emp.id && s.date === a.date);
        if (!sched?.startTime) continue;
        const checkTime = a.checkInTime.slice(11, 16);
        if (checkTime > sched.startTime) late += 1;
      }
      return { emp, present: empAttendance.length, late };
    });
  }, [lookups.employees, filters, attendance, schedules]);

  const siteName_ = (id) => lookups.workSites.find((s) => s.id === id)?.name || "-";
  const vendorName_ = (id) => lookups.vendors.find((v) => v.id === id)?.name || "-";

  const exportCsv = () => {
    const headers = ["사업자", "센터", "소속업체", "근무구분", "근무형태", "이름", "전화번호", "성별", "부서", "직급", "출근", "지각"];
    const rowsOut = rows.map(({ emp, present, late }) => [
      lookups.companyName,
      siteName_(emp.workSiteId),
      vendorName_(emp.vendorId),
      emp.shiftType || "-",
      emp.employmentType || "-",
      emp.name,
      emp.phone,
      emp.gender || "-",
      emp.team || "-",
      emp.position || "-",
      present,
      late,
    ]);
    downloadCsv(`근로자별출근집계_${range.start}~${range.end}`, headers, rowsOut);
  };

  return (
    <Panel icon={Users} title="근로자별출근집계">
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">사업자</span>
          <select disabled className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-muted">
            <option>{lookups.companyName || "-"}</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={filters.siteId}
            onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value }))}
          >
            <option value="">전체</option>
            {lookups.workSites.map((s) => (
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
            {lookups.vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">근무구분</span>
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
          <span className="mb-1.5 block text-xs font-medium text-muted">기간</span>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
              value={range.start}
              onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
            />
            <span className="text-muted">~</span>
            <input
              type="date"
              className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
              value={range.end}
              onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
            />
          </div>
        </label>
        <label className="block flex-1 min-w-[160px]">
          <span className="mb-1.5 block text-xs font-medium text-muted">이름</span>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="검색어 입력"
          />
        </label>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50"
            title="새로고침"
            onClick={() => setFilters({ siteId: "", vendorId: "", shiftType: "", employmentType: "", search: "" })}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-muted">목록 {rows.length}</p>
        <ExcelButton onClick={exportCsv} />
      </div>
      <div className="-mx-4 overflow-x-auto md:-mx-5">
        <table className="w-full min-w-[980px] text-center text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-4 py-3 font-semibold">순번</th>
              <th className="px-4 py-3 font-semibold">사업자</th>
              <th className="px-4 py-3 font-semibold">센터</th>
              <th className="px-4 py-3 font-semibold">소속업체</th>
              <th className="px-4 py-3 font-semibold">근무구분</th>
              <th className="px-4 py-3 font-semibold">근무형태</th>
              <th className="px-4 py-3 font-semibold">이름</th>
              <th className="px-4 py-3 font-semibold">전화번호</th>
              <th className="px-4 py-3 font-semibold">부서</th>
              <th className="px-4 py-3 font-semibold">직급</th>
              <th className="px-4 py-3 font-semibold">출근</th>
              <th className="px-4 py-3 font-semibold">지각</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ emp, present, late }, i) => (
              <tr key={emp.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 text-muted">{i + 1}</td>
                <td className="px-4 py-3 text-muted">{lookups.companyName}</td>
                <td className="px-4 py-3 text-muted">{siteName_(emp.workSiteId)}</td>
                <td className="px-4 py-3 text-muted">{vendorName_(emp.vendorId)}</td>
                <td className="px-4 py-3 text-muted">{emp.shiftType || "-"}</td>
                <td className="px-4 py-3 text-muted">{emp.employmentType || "-"}</td>
                <td className="px-4 py-3 text-ink">{emp.name}</td>
                <td className="px-4 py-3 text-muted">{emp.phone}</td>
                <td className="px-4 py-3 text-muted">{emp.team || "-"}</td>
                <td className="px-4 py-3 text-muted">{emp.position || "-"}</td>
                <td className="px-4 py-3 font-medium text-ink">{present}</td>
                <td className="px-4 py-3 text-muted">{late}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-6 text-center text-xs text-muted">
                  조건에 맞는 근로자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function daysInMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function MonthlyGridTab({ profile, lookups }) {
  const [filters, setFilters] = useState({ siteId: "", vendorId: "", shiftType: "", employmentType: "", team: "", search: "" });
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
  const rows = filterEmployees(lookups.employees, filters);
  const siteName_ = (id) => lookups.workSites.find((s) => s.id === id)?.name || "-";
  const vendorName_ = (id) => lookups.vendors.find((v) => v.id === id)?.name || "-";

  const weekdayFor = (day) => {
    const d = new Date(`${month}-${String(day).padStart(2, "0")}T00:00:00`);
    return WEEKDAY_LABELS[d.getDay()];
  };

  const presentOn = (uid, day) => {
    const dateKey = `${month}-${String(day).padStart(2, "0")}`;
    return attendance.some((a) => a.uid === uid && a.date === dateKey && a.status === "출근");
  };

  const exportCsv = () => {
    const headers = ["사업자", "센터", "소속업체", "근무구분", "근무형태", "부서", "직급", "4대보험", "이름", "전화번호", ...dayList.map((d) => String(d)), "소계"];
    const rowsOut = rows.map((emp) => {
      const marks = dayList.map((d) => (presentOn(emp.id, d) ? 1 : 0));
      const total = marks.reduce((a, b) => a + b, 0);
      return [
        lookups.companyName,
        siteName_(emp.workSiteId),
        vendorName_(emp.vendorId),
        emp.shiftType || "-",
        emp.employmentType || "-",
        emp.team || "-",
        emp.position || "-",
        emp.insuranceApplied || "-",
        emp.name,
        emp.phone,
        ...marks,
        total,
      ];
    });
    downloadCsv(`근로자별월별출근집계_${month}`, headers, rowsOut);
  };

  const subtotals = dayList.map((d) => rows.filter((emp) => presentOn(emp.id, d)).length);

  return (
    <Panel icon={CalendarDays} title="근로자별월별출근집계">
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">사업자</span>
          <select disabled className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-muted">
            <option>{lookups.companyName || "-"}</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={filters.siteId}
            onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value }))}
          >
            <option value="">전체</option>
            {lookups.workSites.map((s) => (
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
            {lookups.vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">근무구분</span>
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
            {lookups.departments.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">출근월</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block flex-1 min-w-[140px]">
          <span className="mb-1.5 block text-xs font-medium text-muted">이름</span>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="검색어를 입력하세요."
          />
        </label>
      </Card>

      <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
        <p className="text-xs font-medium text-muted">목록</p>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[11px] text-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary-light" /> 유급휴무
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-200" /> 무급휴무
          </span>
          <ExcelButton onClick={exportCsv} />
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto md:-mx-5">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-muted">
              <th className="sticky left-0 z-10 bg-white px-3 py-3 font-medium">사업자</th>
              <th className="bg-white px-3 py-3 font-medium">센터</th>
              <th className="bg-white px-3 py-3 font-medium">소속업체</th>
              <th className="bg-white px-3 py-3 font-medium">근무구분</th>
              <th className="bg-white px-3 py-3 font-medium">근무형태</th>
              <th className="bg-white px-3 py-3 font-medium">부서</th>
              <th className="bg-white px-3 py-3 font-medium">직급</th>
              <th className="bg-white px-3 py-3 font-medium">4대보험</th>
              <th className="bg-white px-3 py-3 font-medium">이름</th>
              <th className="bg-white px-3 py-3 font-medium">전화번호</th>
              {dayList.map((d) => (
                <th key={d} className="px-2 py-3 text-center font-medium">
                  {d}
                  <br />({weekdayFor(d)})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((emp) => {
              const marks = dayList.map((d) => presentOn(emp.id, d));
              return (
                <tr key={emp.id} className="border-b border-slate-50 last:border-0">
                  <td className="sticky left-0 bg-white px-3 py-2 text-ink">{lookups.companyName}</td>
                  <td className="px-3 py-2 text-muted">{siteName_(emp.workSiteId)}</td>
                  <td className="px-3 py-2 text-muted">{vendorName_(emp.vendorId)}</td>
                  <td className="px-3 py-2 text-muted">{emp.shiftType || "-"}</td>
                  <td className="px-3 py-2 text-muted">{emp.employmentType || "-"}</td>
                  <td className="px-3 py-2 text-muted">{emp.team || "-"}</td>
                  <td className="px-3 py-2 text-muted">{emp.position || "-"}</td>
                  <td className="px-3 py-2 text-muted">{emp.insuranceApplied || "-"}</td>
                  <td className="px-3 py-2 text-ink">{emp.name}</td>
                  <td className="px-3 py-2 text-muted">{emp.phone}</td>
                  {marks.map((m, i) => (
                    <td key={i} className={`px-2 py-2 text-center ${m ? "text-primary font-medium" : "text-slate-300"}`}>
                      {m ? 1 : 0}
                    </td>
                  ))}
                </tr>
              );
            })}
            {rows.length > 0 && (
              <tr className="bg-slate-50 font-semibold text-ink">
                <td colSpan={10} className="sticky left-0 bg-slate-50 px-3 py-2 text-right">
                  [소계]
                </td>
                {subtotals.map((s, i) => (
                  <td key={i} className="px-2 py-2 text-center">
                    {s}
                  </td>
                ))}
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={numDays + 10} className="px-4 py-6 text-center text-muted">
                  조건에 맞는 근로자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function SiteAggregateTab({ profile, lookups }) {
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

  // Groups attendance by 센터+소속업체+근무구분 so each row is one site/vendor
  // combination's daily headcount, matching the guide's aggregated view.
  const groups = useMemo(() => {
    const filteredEmployees = filterEmployees(lookups.employees, filters);
    const filteredIds = new Set(filteredEmployees.map((e) => e.id));
    const byKey = new Map();
    for (const emp of filteredEmployees) {
      const key = `${emp.workSiteId || ""}_${emp.vendorId || ""}_${emp.shiftType || ""}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          siteId: emp.workSiteId,
          vendorId: emp.vendorId,
          shiftType: emp.shiftType,
          counts: Array(numDays).fill(0),
        });
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
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={filters.siteId}
            onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value }))}
          >
            <option value="">전체</option>
            {lookups.workSites.map((s) => (
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
            {lookups.vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">근무구분</span>
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
          <span className="mb-1.5 block text-xs font-medium text-muted">출근월</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <div className="ml-auto">
          <Button_variant onClick={() => setFilters({ siteId: "", vendorId: "", shiftType: "", employmentType: "" })} />
        </div>
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-muted">목록 {groups.length}</p>
        <ExcelButton onClick={exportCsv} />
      </div>
      <div className="-mx-4 overflow-x-auto md:-mx-5">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-muted">
              <th className="sticky left-0 bg-white px-3 py-3 font-medium">사업자</th>
              <th className="bg-white px-3 py-3 font-medium">센터</th>
              <th className="bg-white px-3 py-3 font-medium">소속업체</th>
              <th className="bg-white px-3 py-3 font-medium">근무구분</th>
              {dayList.map((d) => (
                <th key={d} className="px-2 py-3 text-center font-medium">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} className="border-b border-slate-50 last:border-0">
                <td className="sticky left-0 bg-white px-3 py-2 text-ink">{lookups.companyName}</td>
                <td className="px-3 py-2 text-muted">{siteName_(g.siteId)}</td>
                <td className="px-3 py-2 text-muted">{vendorName_(g.vendorId)}</td>
                <td className="px-3 py-2 text-muted">{g.shiftType || "-"}</td>
                {g.counts.map((c, i) => (
                  <td key={i} className="px-2 py-2 text-center">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
            {groups.length > 0 && (
              <tr className="bg-slate-50 font-semibold text-ink">
                <td colSpan={4} className="sticky left-0 bg-slate-50 px-3 py-2 text-right">
                  [소계]
                </td>
                {subtotals.map((s, i) => (
                  <td key={i} className="px-2 py-2 text-center">
                    {s}
                  </td>
                ))}
              </tr>
            )}
            {groups.length === 0 && (
              <tr>
                <td colSpan={numDays + 4} className="px-4 py-6 text-center text-muted">
                  조건에 맞는 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Button_variant({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50" title="새로고침">
      <RefreshCw size={16} />
    </button>
  );
}

function SummaryTab({ profile }) {
  const [month, setMonth] = useState(toMonthKey());
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubAtt = onSnapshot(
      query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("month", "==", month)),
      (snap) => setAttendance(snap.docs.map((d) => d.data()))
    );
    const unsubLeaves = onSnapshot(
      query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")),
      (snap) => setLeaves(snap.docs.map((d) => d.data()))
    );
    return () => {
      unsubAtt();
      unsubLeaves();
    };
  }, [profile?.companyId, month]);

  const dailyData = useMemo(() => {
    const byDate = {};
    for (const a of attendance) {
      const day = a.date?.slice(8, 10);
      if (!day) continue;
      byDate[day] = byDate[day] || { day, 출근: 0, 자동: 0, 수동: 0 };
      byDate[day].출근 += 1;
      if (a.source === "auto") byDate[day].자동 += 1;
      else byDate[day].수동 += 1;
    }
    return Object.values(byDate).sort((a, b) => a.day.localeCompare(b.day));
  }, [attendance]);

  const leaveTypeCounts = useMemo(() => {
    const counts = {};
    for (const l of leaves) counts[l.type] = (counts[l.type] || 0) + 1;
    return counts;
  }, [leaves]);

  return (
    <Panel
      icon={BarChart3}
      title="통계 요약"
      actions={
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      }
    >
      <div className="space-y-6">
        <Card className="p-5">
          <p className="mb-4 text-sm font-semibold text-ink">일별 출근 인원 ({month})</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="자동" stackId="a" fill="#2563EB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="수동" stackId="a" fill="#93C5FD" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <p className="mb-3 text-sm font-semibold text-ink">휴가 유형별 사용 현황 (누적)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(leaveTypeCounts).length === 0 && <p className="text-xs text-muted">데이터가 없습니다.</p>}
            {Object.entries(leaveTypeCounts).map(([type, count]) => (
              <div key={type} className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-lg font-bold text-ink">{count}</p>
                <p className="text-[11px] text-muted">{type}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Panel>
  );
}

export default function Stats() {
  const { profile } = useAuth();
  const [tab, setTab] = useState("summary");
  const lookups = useCompanyLookups(profile?.companyId);

  return (
    <div className="space-y-4">
      <div className="flex flex-nowrap gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 text-sm w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 font-medium transition-colors ${
              tab === t.key ? "bg-white text-primary shadow-sm" : "text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "summary" && <SummaryTab profile={profile} />}
      {tab === "attendanceCount" && <AttendanceCountTab profile={profile} lookups={lookups} />}
      {tab === "monthlyGrid" && <MonthlyGridTab profile={profile} lookups={lookups} />}
      {tab === "siteAggregate" && <SiteAggregateTab profile={profile} lookups={lookups} />}
    </div>
  );
}
