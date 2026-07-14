import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { FileSpreadsheet, Clock } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Panel from "../components/Panel";
import { toMonthKey, formatTime } from "../utils/dateUtils";
import { downloadCsv } from "../utils/exportCsv";
import { EMPLOYMENT_TYPE_OPTIONS, SHIFT_TYPE_OPTIONS } from "../constants/hr";
import SmsButton from "../components/SmsButton";
import { useCompanyLookups, filterEmployees, daysInMonth, WEEKDAY_LABELS, leaveStatusOn } from "../utils/statsShared";

function ExcelButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-slate-50">
      <FileSpreadsheet size={15} /> 엑셀
    </button>
  );
}

// 출근 여부(1/0)만 보여주는 월별출근집계와 달리, 실제 출근/퇴근 "시각"을 하루씩
// 셀에 채워 넣어 지각·조퇴·초과근무처럼 시간 자체가 중요한 걸 한눈에 볼 수
// 있게 한다.
export default function StatsMonthlyTimeGrid() {
  const { profile } = useAuth();
  const lookups = useCompanyLookups(profile?.companyId);
  const [filters, setFilters] = useState({ siteId: "", vendorId: "", shiftType: "", employmentType: "", team: "", search: "" });
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

  const numDays = daysInMonth(month);
  const dayList = Array.from({ length: numDays }, (_, i) => i + 1);
  const rows = filterEmployees(lookups.employees, filters);
  const siteName_ = (id) => lookups.workSites.find((s) => s.id === id)?.name || "-";
  const vendorName_ = (id) => lookups.vendors.find((v) => v.id === id)?.name || "-";

  const weekdayFor = (day) => {
    const d = new Date(`${month}-${String(day).padStart(2, "0")}T00:00:00`);
    return WEEKDAY_LABELS[d.getDay()];
  };

  const cellFor = (uid, day) => {
    const dateKey = `${month}-${String(day).padStart(2, "0")}`;
    const a = attendance.find((x) => x.uid === uid && x.date === dateKey && x.status === "출근");
    if (a?.checkInTime) {
      return { in: formatTime(a.checkInTime), out: a.checkOutTime ? formatTime(a.checkOutTime) : "미퇴근", late: false };
    }
    const leave = leaveStatusOn(leaves, lookups.leaveTypes, uid, dateKey);
    if (leave) return { leave: leave.type };
    return null;
  };

  const exportCsv = () => {
    const headers = ["사업자", "센터", "소속업체", "부서", "직급", "이름", "전화번호", ...dayList.map((d) => String(d))];
    const rowsOut = rows.map((emp) => {
      const marks = dayList.map((d) => {
        const c = cellFor(emp.id, d);
        if (!c) return "-";
        if (c.leave) return c.leave;
        return `${c.in}~${c.out}`;
      });
      return [lookups.companyName, siteName_(emp.workSiteId), vendorName_(emp.vendorId), emp.team || "-", emp.position || "-", emp.name, emp.phone, ...marks];
    });
    downloadCsv(`근로자월별출퇴근시간_${month}`, headers, rowsOut);
  };

  return (
    <Panel icon={Clock} title="근로자월별출퇴근시간">
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
        <label className="block flex-1 min-w-[140px]">
          <span className="mb-1.5 block text-xs font-medium text-muted">이름</span>
          <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="검색어를 입력하세요." />
        </label>
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-muted">목록 {rows.length}</p>
        <ExcelButton onClick={exportCsv} />
      </div>

      <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-muted">
              <th className="sticky left-0 z-10 bg-white px-3 py-3 font-medium">센터</th>
              <th className="bg-white px-3 py-3 font-medium">소속업체</th>
              <th className="bg-white px-3 py-3 font-medium">부서</th>
              <th className="bg-white px-3 py-3 font-medium">직급</th>
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
            {rows.map((emp) => (
              <tr key={emp.id} className="border-b border-slate-50 last:border-0">
                <td className="sticky left-0 bg-white px-3 py-2 text-ink">{siteName_(emp.workSiteId)}</td>
                <td className="px-3 py-2 text-ink">{vendorName_(emp.vendorId)}</td>
                <td className="px-3 py-2 text-ink">{emp.team || "-"}</td>
                <td className="px-3 py-2 text-ink">{emp.position || "-"}</td>
                <td className="px-3 py-2 text-ink">{emp.name}</td>
                <td className="px-3 py-2 text-ink"><span className="inline-flex items-center gap-1">{emp.phone}<SmsButton phone={emp.phone} /></span></td>
                {dayList.map((d) => {
                  const c = cellFor(emp.id, d);
                  return (
                    <td key={d} className="whitespace-nowrap px-2 py-2 text-center">
                      {!c ? (
                        <span className="text-slate-300">-</span>
                      ) : c.leave ? (
                        <span className="rounded-md bg-primary-light px-1.5 py-0.5 text-[10px] font-medium text-primary">{c.leave}</span>
                      ) : (
                        <span className={`text-[11px] ${c.out === "미퇴근" ? "text-warning" : "text-ink"}`}>
                          {c.in}
                          <br />
                          {c.out}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={numDays + 6} className="px-4 py-6 text-center text-muted">조건에 맞는 근로자가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
