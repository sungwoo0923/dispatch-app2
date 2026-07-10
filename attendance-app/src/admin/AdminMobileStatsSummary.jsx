import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { CheckCircle2, Clock, CalendarOff, Users, Search } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Badge from "../components/Badge";
import { useCompanyLookups, leaveStatusOn } from "../utils/statsShared";
import { toMonthKey, toDateKey, formatTime } from "../utils/dateUtils";

const TONES = {
  primary: "bg-primary-light text-primary",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  muted: "bg-slate-100 text-slate-500",
};

function StatTile({ icon: Icon, label, value, tone }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-tight text-ink">{value}</p>
        <p className="truncate text-[11px] text-muted">{label}</p>
      </div>
    </div>
  );
}

// 통계 · 오늘 현황의 모바일 전용 화면 — 상단 요약 타일 2x2, 오늘 출근 현황을
// 표 대신 카드 목록으로, 하단에 일별 추이 차트를 그대로 유지했다.
export default function AdminMobileStatsSummary() {
  const { profile } = useAuth();
  const lookups = useCompanyLookups(profile?.companyId);
  const [month, setMonth] = useState(toMonthKey());
  const [monthAttendance, setMonthAttendance] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [search, setSearch] = useState("");
  const today = toDateKey();

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("month", "==", month)), (snap) => setMonthAttendance(snap.docs.map((d) => d.data()))),
      onSnapshot(query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("date", "==", today)), (snap) => setTodayAttendance(snap.docs.map((d) => d.data()))),
      onSnapshot(query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")), (snap) => setLeaves(snap.docs.map((d) => d.data()))),
    ];
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.companyId, month, today]);

  const siteName_ = (id) => lookups.workSites.find((s) => s.id === id)?.name || "-";
  const activeEmployees = useMemo(() => lookups.employees.filter((e) => e.employmentStatus !== "퇴사"), [lookups.employees]);

  const todayStatusRows = useMemo(() => {
    return activeEmployees
      .map((emp) => {
        const att = todayAttendance.find((a) => a.uid === emp.id);
        const leave = leaveStatusOn(leaves, lookups.leaveTypes, emp.id, today);
        let status, sortRank;
        if (att?.checkInTime) {
          status = { kind: "present", label: `출근 ${formatTime(att.checkInTime)}`, tone: "success" };
          sortRank = att.checkOutTime ? 2 : 0;
        } else if (leave) {
          status = { kind: "leave", label: `${leave.type}${leave.paid ? "" : "(무급)"}`, tone: "muted" };
          sortRank = 3;
        } else {
          status = { kind: "absent", label: "미출근", tone: "warning" };
          sortRank = 1;
        }
        return { emp, status, sortRank, checkOut: att?.checkOutTime };
      })
      .filter(({ emp }) => !search || emp.name?.includes(search) || emp.phone?.includes(search))
      .sort((a, b) => a.sortRank - b.sortRank || a.emp.name.localeCompare(b.emp.name));
  }, [activeEmployees, todayAttendance, leaves, lookups.leaveTypes, today, search]);

  const counts = useMemo(() => {
    const present = todayStatusRows.filter((r) => r.status.kind === "present").length;
    const onLeave = todayStatusRows.filter((r) => r.status.kind === "leave").length;
    const absent = todayStatusRows.filter((r) => r.status.kind === "absent").length;
    return { total: activeEmployees.length, present, onLeave, absent };
  }, [todayStatusRows, activeEmployees.length]);

  const dailyData = useMemo(() => {
    const byDate = {};
    for (const a of monthAttendance) {
      const day = a.date?.slice(8, 10);
      if (!day || !a.checkInTime) continue;
      byDate[day] = byDate[day] || { day, 출근: 0 };
      byDate[day].출근 += 1;
    }
    return Object.values(byDate).sort((a, b) => a.day.localeCompare(b.day));
  }, [monthAttendance]);

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">통계 · 오늘 현황</p>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border border-slate-200 px-2.5 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatTile icon={Users} label="전체 재직인원" value={counts.total} tone="primary" />
        <StatTile icon={CheckCircle2} label="오늘 출근" value={counts.present} tone="success" />
        <StatTile icon={Clock} label="오늘 미출근" value={counts.absent} tone="warning" />
        <StatTile icon={CalendarOff} label="오늘 휴가/휴무" value={counts.onLeave} tone="muted" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">오늘({today}) 출근 현황</p>
        </div>
        <div className="relative mb-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름/전화번호 검색" className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-2.5 text-xs" />
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
        </div>
        <div className="max-h-96 space-y-1.5 overflow-y-auto">
          {todayStatusRows.length === 0 && <p className="py-6 text-center text-xs text-muted">조건에 맞는 근로자가 없습니다.</p>}
          {todayStatusRows.map(({ emp, status, checkOut }) => (
            <div key={emp.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{emp.name}</p>
                <p className="truncate text-[11px] text-muted">{siteName_(emp.workSiteId)}</p>
              </div>
              <div className="shrink-0 text-right">
                <Badge tone={status.tone}>{status.label}</Badge>
                {checkOut && <p className="mt-0.5 text-[11px] text-muted">퇴근 {formatTime(checkOut)}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3.5">
        <p className="mb-3 text-sm font-semibold text-ink">일별 출근 인원 추이 ({month})</p>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} />
              <Tooltip />
              <Bar dataKey="출근" fill="#2563EB" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
