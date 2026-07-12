import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Home, Users, CalendarDays, MessageSquare, Grid2x2, LogOut, DoorOpen, FileWarning } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useNavBadges } from "../hooks/useNavBadges";
import { isMenuAllowed } from "./navConfig";
import HeaderIcons from "../employee/HeaderIcons";
import Messenger from "../messenger/Messenger";
import OfflineBanner from "../components/OfflineBanner";

const TABS = [
  { to: "/", label: "홈", icon: Home, end: true },
  { to: "/employees", label: "근로자", icon: Users },
  { to: "/schedule", label: "스케줄", icon: CalendarDays },
  { to: "/board", label: "게시판", icon: MessageSquare, end: true },
  { to: "/more", label: "전체메뉴", icon: Grid2x2 },
];

// 관리자 전용 모바일 UI의 뼈대 — PC용 AdminLayout(사이드바+테이블)과 완전히
// 분리된 트리로, 하단탭 앱 형태의 새 화면들을 위한 헤더/바텀탭/권한가드를
// 제공한다. 아직 모바일 전용으로 새로 만들지 않은 화면은 이 셸 안에서
// 기존 PC 화면 컴포넌트를 그대로 렌더링하는 과도기 상태로 두고, 화면별로
// 순차적으로 모바일 전용 버전으로 교체해나간다.
export default function AdminMobileLayout() {
  const { user, profile, company, logout, allowedMenuPaths } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [earlyLeaveCount, setEarlyLeaveCount] = useState(0);
  const [resignationCount, setResignationCount] = useState(0);
  const [showMessenger, setShowMessenger] = useState(false);
  const [messengerUnread, setMessengerUnread] = useState(0);
  const { badgeCounts, markSeen } = useNavBadges(profile?.companyId, user?.uid);

  useEffect(() => {
    markSeen(location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("type", "==", "조퇴"), where("status", "==", "pending")),
      (snap) => setEarlyLeaveCount(snap.size)
    );
    return () => unsub();
  }, [profile?.companyId]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(query(collection(db, "resignationRequests"), where("companyId", "==", profile.companyId)), (snap) =>
      setResignationCount(
        snap.docs.filter((d) => {
          const data = d.data();
          return !data.deleted && ["submitted", "manager_signed", "ceo_pending"].includes(data.status);
        }).length
      )
    );
    return () => unsub();
  }, [profile?.companyId]);

  const totalBadge = Object.values(badgeCounts).reduce((a, b) => a + b, 0);
  const alertCount = earlyLeaveCount + resignationCount;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-surface">
      <header
        className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-2.5"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.625rem)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <img src="/logo.png" alt="KP-Work" className="h-8 w-auto shrink-0" />
          <p className="truncate text-xs font-semibold text-ink">{company?.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {alertCount > 0 && (
            <button
              type="button"
              onClick={() => navigate(resignationCount > 0 ? "/employees/contracts?tab=resignation" : "/leaves")}
              className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-1 text-[11px] font-semibold text-warning"
            >
              {resignationCount > 0 ? <FileWarning size={12} /> : <DoorOpen size={12} />} {alertCount}
            </button>
          )}
          <HeaderIcons onMessengerClick={() => setShowMessenger(true)} messengerUnread={messengerUnread} />
          <button onClick={logout} className="text-muted hover:text-danger" title="로그아웃">
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <OfflineBanner />

      {/* 안읽음 수 추적은 항상 켜두고, showMessenger로 화면 표시만 전환한다
          (직원 모바일 앱과 동일한 패턴 — PC 관리자화면의 <Messenger />와
          같은 chat_rooms/chat_messages 컬렉션을 그대로 공유한다). */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9990, background: "#fff",
          display: "flex", flexDirection: "column", overflow: "hidden",
          visibility: showMessenger ? "visible" : "hidden",
          pointerEvents: showMessenger ? "auto" : "none",
        }}
      >
        <Messenger
          mobileMode
          mobileVisible={showMessenger}
          onClose={() => setShowMessenger(false)}
          onUnreadChange={setMessengerUnread}
        />
      </div>

      <main className="flex-1 overflow-y-auto pb-24">
        {isMenuAllowed(location.pathname, allowedMenuPaths) ? <Outlet /> : <Navigate to="/" replace />}
      </main>

      <nav
        id="admin-bottom-nav"
        className="fixed bottom-0 left-1/2 z-40 grid w-full max-w-md -translate-x-1/2 grid-cols-5 border-t border-slate-100 bg-white px-1 py-1.5 shadow-[0_-2px_10px_rgba(15,23,42,0.06)]"
        style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
      >
        {TABS.map(({ to, label, icon: Icon, end }) => {
          const isActive = end ? location.pathname === to : to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          const badge = to === "/employees" ? badgeCounts["/employees"] : to === "/more" ? totalBadge - (badgeCounts["/employees"] || 0) : 0;
          return (
            <NavLink key={to} to={to} end={end} className="relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px]">
              <span className="relative">
                <Icon size={19} className={isActive ? "text-primary" : "text-muted"} />
                {badge > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger px-0.5 text-[8px] font-bold text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              <span className={isActive ? "font-semibold text-primary" : "text-muted"}>{label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
