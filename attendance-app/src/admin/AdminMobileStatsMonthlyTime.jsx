import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Search, ChevronDown } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Badge from "../components/Badge";
import { useCompanyLookups, filterEmployees, daysInMonth, WEEKDAY_LABELS, leaveStatusOn } from "../utils/statsShared";
import { toMonthKey, formatTime } from "../utils/dateUtils";

// 근로자별월별출퇴근시간집계의 모바일 전용 화면 — PC의 "근로자 × 31일" 표는
// 정확한 출퇴근 "시각"이 셀마다 들어가 미니 캘린더에 압축하기 어려우므로,
// 근로자를 펼치면 실제 출근/휴가 기록이 있는 날짜만 세로 목록으로 보여준다
// (기록 없는 날은 생략해 스크롤 부담을 줄인다).
export default function AdminMobileStatsMonthlyTime() {
  const { profile } = useAuth();
  const lookups = useCompanyLookups(profile?.companyId);
  const [siteId, setSiteId] = useState("");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(toMonthKey());
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("month", "==", month)), (snap) => setAttendance(snap.docs.map((d) => d.data()))),
      onSnapshot(query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")), (snap) => setLeaves(snap.docs.map((d) => d.data()))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId, month]);

  const numDays = daysInMonth(month);
  const siteName_ = (id) => lookups.workSites.find((s) => s.id === id)?.name || "-";

  const entriesFor = (uid) => {
    const out = [];
    for (let day = 1; day <= numDays; day++) {
      const dateKey = `${month}-${String(day).padStart(2, "0")}`;
      const a = attendance.find((x) => x.uid === uid && x.date === dateKey && x.status === "출근");
      if (a?.checkInTime) {
        out.push({ day, dateKey, in: formatTime(a.checkInTime), out: a.checkOutTime ? formatTime(a.checkOutTime) : "미퇴근", late: a.status === "지각" });
        continue;
      }
      const leave = leaveStatusOn(leaves, lookups.leaveTypes, uid, dateKey);
      if (leave) out.push({ day, dateKey, leave: leave.type });
    }
    return out;
  };

  const rows = useMemo(() => {
    return filterEmployees(lookups.employees, { siteId, search })
      .map((emp) => ({ emp, entries: entriesFor(emp.id) }))
      .sort((a, b) => (a.emp.name || "").localeCompare(b.emp.name || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookups.employees, siteId, search, attendance, leaves, month]);

  const weekdayFor = (dateKey) => WEEKDAY_LABELS[new Date(`${dateKey}T00:00:00`).getDay()];

  return (
    <div className="space-y-3 px-4 pt-4">
      <div>
        <p className="text-sm font-semibold text-ink">근로자별월별출퇴근시간집계</p>
        <p className="mt-0.5 text-xs text-muted">근로자를 눌러 날짜별 출퇴근 시각을 확인하세요</p>
      </div>

      <div className="flex items-center gap-2">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm" />
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">전체 센터</option>
          {lookups.workSites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">조건에 맞는 근로자가 없습니다.</div>}
        {rows.map(({ emp, entries }) => {
          const isOpen = openId === emp.id;
          return (
            <div key={emp.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button type="button" onClick={() => setOpenId(isOpen ? null : emp.id)} className="flex w-full items-center gap-3 p-3.5 text-left active:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{emp.name}</p>
                  <p className="truncate text-xs text-muted">{siteName_(emp.workSiteId)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted">기록일수</p>
                  <p className="text-sm font-bold text-primary">{entries.length}</p>
                </div>
                <ChevronDown size={16} className={`shrink-0 text-slate-300 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="space-y-1.5 border-t border-slate-100 p-3.5">
                  {entries.length === 0 && <p className="py-2 text-center text-xs text-muted">이번 달 기록이 없습니다.</p>}
                  {entries.map((e) => (
                    <div key={e.day} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                      <span className="font-medium text-ink">{e.day}일 ({weekdayFor(e.dateKey)})</span>
                      {e.leave ? (
                        <Badge tone="muted">{e.leave}</Badge>
                      ) : (
                        <span className={e.out === "미퇴근" ? "font-semibold text-warning" : "text-ink"}>
                          {e.in} ~ {e.out}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
