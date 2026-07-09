import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { FileSpreadsheet, Users, RefreshCw } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Panel from "../components/Panel";
import { toDateKey } from "../utils/dateUtils";
import { downloadCsv } from "../utils/exportCsv";
import { EMPLOYMENT_TYPE_OPTIONS, SHIFT_TYPE_OPTIONS } from "../constants/hr";
import SmsButton from "../components/SmsButton";
import { useCompanyLookups, filterEmployees } from "../utils/statsShared";

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

export default function StatsAttendanceCount() {
  const { profile } = useAuth();
  const lookups = useCompanyLookups(profile?.companyId);
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
      query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("date", ">=", range.start), where("date", "<=", range.end)),
      (snap) => setAttendance(snap.docs.map((d) => d.data()))
    );
    return () => unsub();
  }, [profile?.companyId, range.start, range.end]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "schedules"), where("companyId", "==", profile.companyId), where("date", ">=", range.start), where("date", "<=", range.end)),
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
          <span className="mb-1.5 block text-xs font-medium text-muted">기간</span>
          <div className="flex items-center gap-1.5">
            <input type="date" className="rounded-lg border border-slate-200 px-2 py-2 text-sm" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
            <span className="text-muted">~</span>
            <input type="date" className="rounded-lg border border-slate-200 px-2 py-2 text-sm" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
          </div>
        </label>
        <label className="block flex-1 min-w-[160px]">
          <span className="mb-1.5 block text-xs font-medium text-muted">이름</span>
          <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="검색어 입력" />
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50" title="새로고침" onClick={() => setFilters({ siteId: "", vendorId: "", shiftType: "", employmentType: "", search: "" })}>
            <RefreshCw size={16} />
          </button>
        </div>
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-muted">목록 {rows.length}</p>
        <ExcelButton onClick={exportCsv} />
      </div>
      <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
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
                <td className="px-4 py-3 text-ink">{i + 1}</td>
                <td className="px-4 py-3 text-ink">{lookups.companyName}</td>
                <td className="px-4 py-3 text-ink">{siteName_(emp.workSiteId)}</td>
                <td className="px-4 py-3 text-ink">{vendorName_(emp.vendorId)}</td>
                <td className="px-4 py-3 text-ink">{emp.shiftType || "-"}</td>
                <td className="px-4 py-3 text-ink">{emp.employmentType || "-"}</td>
                <td className="px-4 py-3 text-ink">{emp.name}</td>
                <td className="px-4 py-3 text-ink"><span className="inline-flex items-center gap-1">{emp.phone}<SmsButton phone={emp.phone} /></span></td>
                <td className="px-4 py-3 text-ink">{emp.team || "-"}</td>
                <td className="px-4 py-3 text-ink">{emp.position || "-"}</td>
                <td className="px-4 py-3 font-medium text-ink">{present}</td>
                <td className="px-4 py-3 text-ink">{late}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-6 text-center text-xs text-muted">조건에 맞는 근로자가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
