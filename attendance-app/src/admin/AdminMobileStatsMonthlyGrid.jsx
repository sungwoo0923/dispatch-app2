import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Search, ChevronDown } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import MiniMonthCalendar from "../components/MiniMonthCalendar";
import { useCompanyLookups, filterEmployees, daysInMonth, leaveStatusOn } from "../utils/statsShared";
import { toMonthKey } from "../utils/dateUtils";

function dayStatus({ uid, dateKey, attendance, leaves, leaveTypes, isFuture, isTodayNotYetOver }) {
  if (attendance.some((a) => a.uid === uid && a.date === dateKey && (a.status === "출근" || a.status === "지각"))) return "present";
  const leave = leaveStatusOn(leaves, leaveTypes, uid, dateKey);
  if (leave) return leave.paid ? "paidLeave" : "unpaidLeave";
  if (isFuture || isTodayNotYetOver) return "future";
  return "absent";
}

const CELL_STYLE = {
  present: "bg-primary text-white",
  paidLeave: "bg-primary-light text-primary",
  unpaidLeave: "bg-slate-200 text-slate-500",
  absent: "bg-red-50 text-danger",
  future: "text-slate-300",
};

const LEGEND = [
  { key: "present", label: "출근", swatch: "bg-primary" },
  { key: "paidLeave", label: "유급휴무", swatch: "bg-primary-light" },
  { key: "unpaidLeave", label: "무급휴무", swatch: "bg-slate-200" },
  { key: "absent", label: "결근", swatch: "bg-red-50" },
];

// 근로자별월별출근집계의 모바일 전용 화면 — PC의 "근로자 × 31일" 가로 스크롤
// 표 대신, 근로자를 세로 목록으로 두고 각 근로자를 펼치면 요일정렬 미니
// 캘린더(MiniMonthCalendar)로 한 달 출근 현황을 "출석부처럼" 한눈에 보여준다.
export default function AdminMobileStatsMonthlyGrid() {
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
  const todayKey = new Date().toISOString().slice(0, 10);
  const siteName_ = (id) => lookups.workSites.find((s) => s.id === id)?.name || "-";

  const statusFor = (uid, day) => {
    const dateKey = `${month}-${String(day).padStart(2, "0")}`;
    const isTodayNotYetOver = dateKey === todayKey && new Date().getHours() < 18;
    return dayStatus({ uid, dateKey, attendance, leaves, leaveTypes: lookups.leaveTypes, isFuture: dateKey > todayKey, isTodayNotYetOver });
  };

  const rows = useMemo(() => {
    return filterEmployees(lookups.employees, { siteId, search })
      .map((emp) => {
        const marks = Array.from({ length: numDays }, (_, i) => statusFor(emp.id, i + 1));
        const present = marks.filter((s) => s === "present").length;
        return { emp, marks, present };
      })
      .sort((a, b) => (a.emp.name || "").localeCompare(b.emp.name || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookups.employees, siteId, search, attendance, leaves, month]);

  return (
    <div className="space-y-3 px-4 pt-4">
      <div>
        <p className="text-sm font-semibold text-ink">근로자별월별출근집계</p>
        <p className="mt-0.5 text-xs text-muted">근로자를 눌러 이번 달 출근 현황을 한눈에 확인하세요</p>
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        {LEGEND.map((l) => (
          <span key={l.key} className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${l.swatch}`} /> {l.label}
          </span>
        ))}
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">조건에 맞는 근로자가 없습니다.</div>}
        {rows.map(({ emp, marks, present }) => {
          const isOpen = openId === emp.id;
          return (
            <div key={emp.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button type="button" onClick={() => setOpenId(isOpen ? null : emp.id)} className="flex w-full items-center gap-3 p-3.5 text-left active:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{emp.name}</p>
                  <p className="truncate text-xs text-muted">{siteName_(emp.workSiteId)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted">출근일수</p>
                  <p className="text-sm font-bold text-primary">{present}</p>
                </div>
                <ChevronDown size={16} className={`shrink-0 text-slate-300 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="border-t border-slate-100 p-3.5">
                  <MiniMonthCalendar
                    month={month}
                    cells={marks.map((s, i) => ({ day: i + 1, className: CELL_STYLE[s] }))}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
