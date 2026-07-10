import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Search } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useCompanyLookups, filterEmployees } from "../utils/statsShared";
import { toDateKey } from "../utils/dateUtils";

// 근로자별출근집계의 모바일 전용 화면 — 기간 내 근로자별 출근/지각 횟수를
// 표 대신 카드 목록으로 보여준다. 기본 조회기간은 이번 달 1일~오늘.
export default function AdminMobileStatsAttendanceCount() {
  const { profile } = useAuth();
  const lookups = useCompanyLookups(profile?.companyId);
  const [search, setSearch] = useState("");
  const [range] = useState(() => {
    const end = toDateKey();
    return { start: end.slice(0, 8) + "01", end };
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
    const filtered = filterEmployees(lookups.employees, { search });
    return filtered
      .map((emp) => {
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
      })
      .sort((a, b) => (a.emp.name || "").localeCompare(b.emp.name || ""));
  }, [lookups.employees, search, attendance, schedules]);

  const siteName_ = (id) => lookups.workSites.find((s) => s.id === id)?.name || "-";

  return (
    <div className="space-y-3 px-4 pt-4">
      <div>
        <p className="text-sm font-semibold text-ink">근로자별출근집계</p>
        <p className="mt-0.5 text-xs text-muted">{range.start} ~ {range.end} 기준 출근·지각 횟수입니다</p>
      </div>

      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름 또는 연락처 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">조건에 맞는 근로자가 없습니다.</div>}
        {rows.map(({ emp, present, late }) => (
          <div key={emp.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{emp.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{siteName_(emp.workSiteId)}</p>
            </div>
            <div className="flex shrink-0 gap-4 text-center">
              <div>
                <p className="text-[11px] text-muted">출근</p>
                <p className="text-sm font-bold text-ink">{present}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted">지각</p>
                <p className={`text-sm font-bold ${late > 0 ? "text-danger" : "text-ink"}`}>{late}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
