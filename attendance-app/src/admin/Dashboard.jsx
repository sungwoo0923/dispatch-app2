import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Users, CheckCircle2, AlarmClock, LogOut as LogOutIcon, UserX, ClipboardCheck } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import StatCard from "../components/StatCard";
import Badge from "../components/Badge";
import Panel from "../components/Panel";
import OnboardingWidget from "./OnboardingWidget";
import { toDateKey, formatTime } from "../utils/dateUtils";

export default function Dashboard() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState([]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubUsers = onSnapshot(
      query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
      (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubAtt = onSnapshot(
      query(
        collection(db, "attendance"),
        where("companyId", "==", profile.companyId),
        where("date", "==", toDateKey())
      ),
      (snap) => setTodayAttendance(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubUsers();
      unsubAtt();
    };
  }, [profile?.companyId]);

  const approvedEmployees = employees.filter((e) => e.approved);

  const stats = useMemo(() => {
    const present = todayAttendance.filter((a) => a.status === "출근").length;
    const late = todayAttendance.filter((a) => a.status === "지각").length;
    const leftEarly = todayAttendance.filter((a) => a.checkOutTime).length;
    const absent = Math.max(0, approvedEmployees.length - todayAttendance.length);
    return { present, late, leftEarly, absent };
  }, [todayAttendance, approvedEmployees.length]);

  const recent = [...todayAttendance].sort((a, b) => (b.checkInTime || "").localeCompare(a.checkInTime || "")).slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-ink">오늘 근태 현황</h1>
        <p className="text-sm text-muted">{toDateKey()} 기준</p>
      </div>

      <OnboardingWidget />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard icon={Users} label="전체 직원" value={approvedEmployees.length} suffix="명" tone="primary" />
        <StatCard icon={CheckCircle2} label="출근" value={stats.present} suffix="명" tone="success" />
        <StatCard icon={AlarmClock} label="지각" value={stats.late} suffix="명" tone="warning" />
        <StatCard icon={LogOutIcon} label="퇴근" value={stats.leftEarly} suffix="명" tone="primary" />
        <StatCard icon={UserX} label="미출근" value={stats.absent} suffix="명" tone="danger" />
      </div>

      <Panel icon={ClipboardCheck} title={`최근 출근 (${recent.length}건)`}>
        <div className="divide-y divide-slate-100">
          {recent.length === 0 && <p className="py-3 text-xs text-muted">아직 출근 기록이 없습니다.</p>}
          {recent.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-ink">{r.name}</span>
              <span className="text-muted">{r.checkInTime ? formatTime(r.checkInTime) : "-"}</span>
              <Badge tone={r.source === "auto" ? "primary" : "muted"}>{r.source === "auto" ? "자동" : "수동"}</Badge>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
