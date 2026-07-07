import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Link } from "react-router-dom";
import { Users, CheckCircle2, AlarmClock, LogOut as LogOutIcon, UserX, Megaphone, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import OnboardingWidget from "./OnboardingWidget";
import { downloadCsv } from "../utils/exportCsv";
import { toDateKey, formatDate } from "../utils/dateUtils";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

const MINI_STATS = [
  { key: "scheduled", label: "예정", icon: Users, className: "text-ink" },
  { key: "present", label: "출근", icon: CheckCircle2, className: "text-primary" },
  { key: "late", label: "지각", icon: AlarmClock, className: "text-warning" },
  { key: "leftEarly", label: "조퇴", icon: LogOutIcon, className: "text-ink" },
  { key: "absent", label: "휴무", icon: UserX, className: "text-danger" },
];

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(d) {
  return `'${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}`;
}
function monthBounds(d) {
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const endKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  return [start, endKey];
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [posts, setPosts] = useState([]);
  const [monthCursor, setMonthCursor] = useState(() => new Date());

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(
        query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
        (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(
        query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("date", "==", toDateKey())),
        (snap) => setTodayAttendance(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "posts"), where("companyId", "==", profile.companyId)), (snap) =>
        setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const approvedEmployees = employees.filter((e) => e.approved);

  const stats = useMemo(() => {
    const present = todayAttendance.filter((a) => a.status === "출근").length;
    const late = todayAttendance.filter((a) => a.status === "지각").length;
    const leftEarly = todayAttendance.filter((a) => a.checkOutTime).length;
    const absent = Math.max(0, approvedEmployees.length - todayAttendance.length);
    return { scheduled: approvedEmployees.length, present, late, leftEarly, absent };
  }, [todayAttendance, approvedEmployees.length]);

  const recentPosts = useMemo(
    () =>
      [...posts]
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 4),
    [posts]
  );

  // 선택된 월을 마지막 달로 하는 최근 12개월 구간 — 헤드카운트 라인차트와
  // 입/퇴사자 막대차트가 같은 x축(월)을 공유한다.
  const months = useMemo(() => {
    const list = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - i, 1);
      list.push(d);
    }
    return list;
  }, [monthCursor]);

  const chartData = useMemo(() => {
    return months.map((d) => {
      const [start, end] = monthBounds(d);
      const headcount = employees.filter((e) => e.hireDate && e.hireDate <= end && (!e.resignDate || e.resignDate >= start)).length;
      const hired = employees.filter((e) => e.hireDate && e.hireDate >= start && e.hireDate <= end).length;
      const resigned = employees.filter((e) => e.resignDate && e.resignDate >= start && e.resignDate <= end).length;
      return { month: monthLabel(d), 전체인원: headcount, 입사자: hired, 퇴사자: resigned };
    });
  }, [months, employees]);

  const currentHeadcount = chartData[chartData.length - 1]?.전체인원 || 0;
  const prevHeadcount = chartData[chartData.length - 2]?.전체인원 || 0;
  const diff = currentHeadcount - prevHeadcount;

  const shiftMonth = (delta) => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));

  const exportKpiExcel = () => {
    downloadCsv(
      "출근현황",
      ["예정", "출근", "지각", "조퇴", "휴무"],
      [[stats.scheduled, stats.present, stats.late, stats.leftEarly, stats.absent]]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-ink">오늘 근태 현황</h1>
        <p className="text-sm text-muted">{toDateKey()} 기준</p>
      </div>

      <OnboardingWidget />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <Card className="p-4">
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto overscroll-x-contain">
            {MINI_STATS.map((s) => (
              <div key={s.key} className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5">
                <s.icon size={16} className={s.className} />
                <span className="text-xs text-muted">{s.label}</span>
                <span className={`text-base font-bold ${s.className}`}>{stats[s.key]}</span>
              </div>
            ))}
            <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={exportKpiExcel}>
              <Download size={14} /> 엑셀
            </Button>
          </div>
        </Card>

        <Card className="flex flex-col p-4">
          <div className="mb-2 flex items-center gap-1.5">
            <Megaphone size={15} className="text-primary" />
            <p className="text-sm font-semibold text-ink">공지사항</p>
          </div>
          <div className="flex-1 divide-y divide-slate-100">
            {recentPosts.length === 0 && <p className="py-3 text-xs text-muted">등록된 공지사항이 없습니다.</p>}
            {recentPosts.map((p) => (
              <Link key={p.id} to="/board" className="flex items-center justify-between gap-2 py-2 text-sm hover:text-primary">
                <span className="truncate text-ink">
                  {p.pinned && <span className="mr-1 rounded bg-primary-light px-1 text-[10px] text-primary">필독</span>}
                  {p.title}
                </span>
                <span className="shrink-0 text-[11px] text-muted">
                  {p.createdAt?.seconds ? formatDate(new Date(p.createdAt.seconds * 1000).toISOString().slice(0, 10)) : ""}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4 md:p-5">
        <div className="mb-4 flex flex-nowrap items-center gap-3">
          <p className="text-sm font-semibold text-ink">월별 출근현황</p>
          <div className="flex flex-nowrap items-center gap-1">
            <button onClick={() => shiftMonth(-1)} className="rounded-lg p-1 text-muted hover:bg-slate-100 hover:text-ink">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-ink">
              {monthCursor.getFullYear()}년 {monthCursor.getMonth() + 1}월
            </span>
            <button onClick={() => shiftMonth(1)} className="rounded-lg p-1 text-muted hover:bg-slate-100 hover:text-ink">
              <ChevronRight size={16} />
            </button>
          </div>
          <span className="text-sm text-muted">
            {currentHeadcount}명 전월대비{" "}
            <span className={diff > 0 ? "text-primary" : diff < 0 ? "text-danger" : "text-muted"}>
              {diff > 0 ? `+${diff}` : diff}
            </span>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-muted">전체인원</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="전체인원" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted">입사자 / 퇴사자</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="입사자" fill="#2563EB" radius={[3, 3, 0, 0]} />
                <Bar dataKey="퇴사자" fill="#CBD5E1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>
    </div>
  );
}
