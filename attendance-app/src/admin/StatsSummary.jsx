import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { BarChart3, CheckCircle2, Clock, CalendarOff, Users, Search, AlertTriangle, TrendingUp } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Panel from "../components/Panel";
import Badge from "../components/Badge";
import { useCompanyLookups, leaveStatusOn } from "../utils/statsShared";
import { toMonthKey, toDateKey, formatTime } from "../utils/dateUtils";

// "언제 누가 출근했는지 한눈에" — 통계 메뉴에 들어왔을 때 가장 먼저 보이는
// 페이지. 오늘 하루의 출근/미출근/휴가 현황을 즉시 파악할 수 있는 요약
// 카드 + 실시간 명단을 맨 위에 두고, 그 아래 최근 추이 차트를 붙였다.
function StatTile({ icon: Icon, label, value, tone }) {
  const TONES = {
    primary: "bg-primary-light text-primary",
    success: "bg-emerald-50 text-emerald-600",
    warning: "bg-amber-50 text-amber-600",
    danger: "bg-rose-50 text-rose-600",
    muted: "bg-slate-100 text-slate-500",
  };
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${TONES[tone]}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold leading-tight text-ink">{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </Card>
  );
}

export default function StatsSummary() {
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
    const unsubMonth = onSnapshot(
      query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("month", "==", month)),
      (snap) => setMonthAttendance(snap.docs.map((d) => d.data()))
    );
    const unsubToday = onSnapshot(
      query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("date", "==", today)),
      (snap) => setTodayAttendance(snap.docs.map((d) => d.data()))
    );
    const unsubLeaves = onSnapshot(
      query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")),
      (snap) => setLeaves(snap.docs.map((d) => d.data()))
    );
    return () => {
      unsubMonth();
      unsubToday();
      unsubLeaves();
    };
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
    const late = todayAttendance.filter((a) => a.status === "지각").length;
    return { total: activeEmployees.length, present, onLeave, absent, late };
  }, [todayStatusRows, activeEmployees.length, todayAttendance]);

  const attendanceRate = counts.total ? Math.round((counts.present / counts.total) * 100) : 0;

  const dailyData = useMemo(() => {
    const byDate = {};
    for (const a of monthAttendance) {
      const day = a.date?.slice(8, 10);
      if (!day || !a.checkInTime) continue;
      byDate[day] = byDate[day] || { day, 정상출근: 0, 지각: 0 };
      if (a.status === "지각") byDate[day].지각 += 1;
      else byDate[day].정상출근 += 1;
    }
    return Object.values(byDate).sort((a, b) => a.day.localeCompare(b.day));
  }, [monthAttendance]);

  // "이번 달 지각이 잦은 근로자"처럼 관리자가 육안으로 표를 다 훑지 않아도
  // 바로 조치할 대상을 알 수 있게, 지각 횟수 기준 상위 5명을 자동으로
  // 추려서 보여준다 — 단순 집계표를 넘어 실제 관리 인사이트를 주는 부분.
  const topLateEmployees = useMemo(() => {
    const countByUid = {};
    for (const a of monthAttendance) {
      if (a.status !== "지각") continue;
      countByUid[a.uid] = (countByUid[a.uid] || 0) + 1;
    }
    return Object.entries(countByUid)
      .map(([uid, lateCount]) => ({ emp: lookups.employees.find((e) => e.id === uid), lateCount }))
      .filter((r) => r.emp)
      .sort((a, b) => b.lateCount - a.lateCount)
      .slice(0, 5);
  }, [monthAttendance, lookups.employees]);

  return (
    <Panel
      icon={BarChart3}
      title="통계 · 오늘 현황"
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile icon={Users} label="전체 재직인원" value={counts.total} tone="primary" />
          <StatTile icon={TrendingUp} label="출근율" value={`${attendanceRate}%`} tone="primary" />
          <StatTile icon={CheckCircle2} label="오늘 출근" value={counts.present} tone="success" />
          <StatTile icon={AlertTriangle} label="오늘 지각" value={counts.late} tone="danger" />
          <StatTile icon={Clock} label="오늘 미출근" value={counts.absent} tone="warning" />
          <StatTile icon={CalendarOff} label="오늘 휴가/휴무" value={counts.onLeave} tone="muted" />
        </div>

        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">오늘({today}) 출근 현황</p>
            <label className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="w-48 rounded-lg border border-slate-200 py-1.5 pl-7 pr-2.5 text-xs"
                placeholder="이름/전화번호 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <div className="-mx-5 max-h-[420px] overflow-y-auto overscroll-contain px-5">
            <table className="w-full text-center text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-xs text-muted">
                  <th className="px-3 py-2.5 font-semibold">이름</th>
                  <th className="px-3 py-2.5 font-semibold">센터</th>
                  <th className="px-3 py-2.5 font-semibold">부서/직급</th>
                  <th className="px-3 py-2.5 font-semibold">상태</th>
                  <th className="px-3 py-2.5 font-semibold">퇴근</th>
                </tr>
              </thead>
              <tbody>
                {todayStatusRows.map(({ emp, status, checkOut }) => (
                  <tr key={emp.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-ink">{emp.name}</td>
                    <td className="px-3 py-2.5 text-ink">{siteName_(emp.workSiteId)}</td>
                    <td className="px-3 py-2.5 text-ink">{[emp.team, emp.position].filter(Boolean).join(" · ") || "-"}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-ink">{checkOut ? formatTime(checkOut) : "-"}</td>
                  </tr>
                ))}
                {todayStatusRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-xs text-muted">
                      조건에 맞는 근로자가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <p className="mb-4 text-sm font-semibold text-ink">일별 출근 인원 추이 ({month})</p>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="정상출근" stackId="a" fill="#2563EB" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="지각" stackId="a" fill="#e11d48" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <p className="mb-4 text-sm font-semibold text-ink">이번 달 지각 잦은 근로자 TOP 5</p>
            {topLateEmployees.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted">이번 달 지각 기록이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {topLateEmployees.map(({ emp, lateCount }, i) => (
                  <li key={emp.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[11px] font-bold text-rose-600">
                        {i + 1}
                      </span>
                      {emp.name}
                    </span>
                    <Badge tone="danger">지각 {lateCount}회</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Panel>
  );
}
