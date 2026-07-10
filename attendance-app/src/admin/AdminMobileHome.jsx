import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { Users, CheckCircle2, AlarmClock, LogOut as LogOutIcon, UserX, Megaphone, CalendarPlus, ClipboardCheck, PenSquare, ChevronRight } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { toDateKey, formatDate } from "../utils/dateUtils";

const STAT_CARDS = [
  { key: "present", label: "출근", icon: CheckCircle2, bg: "bg-primary-light", fg: "text-primary" },
  { key: "late", label: "지각", icon: AlarmClock, bg: "bg-amber-50", fg: "text-warning" },
  { key: "leftEarly", label: "조퇴", icon: LogOutIcon, bg: "bg-slate-100", fg: "text-ink" },
  { key: "absent", label: "휴무", icon: UserX, bg: "bg-red-50", fg: "text-danger" },
];

const QUICK_ACTIONS = [
  { to: "/schedule", label: "스케줄등록", icon: CalendarPlus },
  { to: "/attendance", label: "출근현황", icon: ClipboardCheck },
  { to: "/board", label: "공지작성", icon: PenSquare },
];

// 관리자 전용 모바일 앱의 홈 화면 — PC Dashboard.jsx를 그대로 줄인 게 아니라,
// 이동 중에도 바로 확인할 "오늘" 현황과 자주 쓰는 동작 위주로 새로 구성했다.
// 월별 헤드카운트/입퇴사 차트 같은 상세 통계는 통계 메뉴(더보기 탭)에서 PC와
// 동일하게 볼 수 있어, 여기서는 굳이 중복하지 않는다.
export default function AdminMobileHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (snap) =>
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("date", "==", toDateKey())), (snap) =>
        setTodayAttendance(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
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

  return (
    <div className="space-y-5 px-4 pt-4">
      <div>
        <p className="text-sm text-muted">{profile?.name}님, 안녕하세요</p>
        <h1 className="text-lg font-bold text-ink">{toDateKey()} 오늘 근태 현황</h1>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-br from-primary to-primary-dark p-4 text-white">
        <div>
          <p className="text-xs text-white/80">전체 근무예정</p>
          <p className="text-2xl font-bold">{stats.scheduled}명</p>
        </div>
        <Users size={34} className="text-white/70" />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {STAT_CARDS.map((s) => (
          <div key={s.key} className={`flex flex-col items-center gap-1 rounded-xl ${s.bg} py-3`}>
            <s.icon size={16} className={s.fg} />
            <span className={`text-base font-bold ${s.fg}`}>{stats[s.key]}</span>
            <span className="text-[10px] text-muted">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.to}
            type="button"
            onClick={() => navigate(a.to)}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white py-3.5 active:bg-slate-50"
          >
            <a.icon size={18} className="text-primary" />
            <span className="text-[11px] font-medium text-ink">{a.label}</span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Megaphone size={15} className="text-primary" /> 공지사항
          </p>
          <button type="button" onClick={() => navigate("/board")} className="flex items-center text-xs text-muted">
            더보기 <ChevronRight size={13} />
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {recentPosts.length === 0 && <p className="py-3 text-xs text-muted">등록된 공지사항이 없습니다.</p>}
          {recentPosts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => navigate("/board")}
              className="flex w-full items-center justify-between gap-2 py-2.5 text-left text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-ink">
                {p.pinned && <span className="mr-1 rounded bg-primary-light px-1 text-[10px] text-primary">필독</span>}
                {p.title}
              </span>
              <span className="shrink-0 text-[11px] text-muted">
                {p.createdAt?.seconds ? formatDate(new Date(p.createdAt.seconds * 1000).toISOString().slice(0, 10)) : ""}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
