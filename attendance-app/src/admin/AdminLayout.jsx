import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot, getDocs, doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { Menu, X, LogOut, ChevronDown, DoorOpen, FileWarning } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useNavBadges } from "../hooks/useNavBadges";
import Breadcrumb from "../components/Breadcrumb";
import BuildInfo from "../components/BuildInfo";
import Messenger from "../messenger/Messenger";
import { toDateKey } from "../utils/dateUtils";

// 스케줄 출근시각 이후 이만큼(분) 지나도 체크인 기록이 없으면 결근(노쇼)
// 알림을 관리자 전원에게 broadcast한다. 서버 크론이 없는 클라이언트 전용
// 구조라, 관리자가 화면을 켜두는 동안 주기적으로 확인하는 방식으로 둔다.
const NO_SHOW_GRACE_MINUTES = 30;
const NO_SHOW_CHECK_INTERVAL_MS = 5 * 60 * 1000;
import { NAV, SUPER_ADMIN_NAV_ITEM } from "./navConfig";

const itemClass = ({ isActive }) =>
  `flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive ? "bg-primary-light text-primary" : "text-muted hover:bg-slate-50"
  }`;

// 카톡 안읽음 숫자처럼, 파란 원 안에 흰 굵은 숫자로 표시한다.
function NavBadge({ count }) {
  if (!count) return null;
  return (
    <span className="ml-1.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function NavItems({ items, onClick, badgeCounts }) {
  const location = useLocation();
  const [openMenu, setOpenMenu] = useState(
    () => items.find((n) => n.children?.some((c) => location.pathname.startsWith(c.to)))?.to ?? null
  );

  return (
    <nav className="space-y-1 px-3">
      {items.map(({ to, label, icon: Icon, end, children }) => {
        if (!children) {
          return (
            <NavLink key={to} to={to} end={end} onClick={onClick} className={itemClass}>
              <Icon size={18} />
              <span className="flex-1">{label}</span>
              <NavBadge count={badgeCounts?.[to]} />
            </NavLink>
          );
        }

        const isOpen = openMenu === to;
        const isChildActive = children.some((c) => location.pathname === c.to);
        const groupCount = children.reduce((sum, c) => sum + (badgeCounts?.[c.to] || 0), 0);
        return (
          <div key={to}>
            <button
              type="button"
              onClick={() => setOpenMenu(isOpen ? null : to)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isChildActive ? "bg-primary-light text-primary" : "text-muted hover:bg-slate-50"
              }`}
            >
              <Icon size={18} />
              <span className="flex-1 text-left">{label}</span>
              <NavBadge count={groupCount} />
              <ChevronDown size={16} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>

            {isOpen && (
              <div className="ml-6 mt-1 space-y-1 border-l border-slate-100 pl-3">
                {children.map((child) => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    end
                    onClick={onClick}
                    className={({ isActive }) =>
                      `flex items-center rounded-lg px-3 py-1.5 text-sm ${
                        isActive ? "bg-primary-light text-primary" : "text-muted hover:bg-slate-50"
                      }`
                    }
                  >
                    <span className="flex-1">{child.label}</span>
                    <NavBadge count={badgeCounts?.[child.to]} />
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function AdminLayout() {
  const { user, profile, company, logout, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [earlyLeaveCount, setEarlyLeaveCount] = useState(0);
  const [resignationCount, setResignationCount] = useState(0);
  const navItems = isSuperAdmin ? [...NAV, SUPER_ADMIN_NAV_ITEM] : NAV;
  const { badgeCounts, markSeen } = useNavBadges(profile?.companyId, user?.uid);

  // 사이드바에서 배지가 붙은 메뉴로 이동하면(더블클릭 없이 클릭 한 번으로도)
  // 그 메뉴는 이 관리자 계정 기준으로 "확인함" 처리한다.
  useEffect(() => {
    markSeen(location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(
        collection(db, "leaves"),
        where("companyId", "==", profile.companyId),
        where("type", "==", "조퇴"),
        where("status", "==", "pending")
      ),
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

  // 결근(노쇼) 자동 알림: 오늘 출근확정된 스케줄인데 유예시간이 지나도록
  // 체크인 기록이 없으면 관리자 전원에게 알림을 보내고, schedules 문서에
  // noShowAlertSent를 남겨 같은 스케줄에 중복 발송하지 않게 한다.
  useEffect(() => {
    if (!profile?.companyId) return;

    const checkNoShows = async () => {
      const todayKey = toDateKey();
      const now = new Date();
      const schedSnap = await getDocs(
        query(
          collection(db, "schedules"),
          where("companyId", "==", profile.companyId),
          where("date", "==", todayKey),
          where("status", "==", "출근확정")
        )
      );
      const candidates = schedSnap.docs.filter((d) => {
        const s = d.data();
        if (s.noShowAlertSent || !s.startTime) return false;
        const [h, m] = s.startTime.split(":").map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return false;
        const scheduled = new Date(now);
        scheduled.setHours(h, m, 0, 0);
        return (now.getTime() - scheduled.getTime()) / 60000 >= NO_SHOW_GRACE_MINUTES;
      });
      if (candidates.length === 0) return;

      // 개별 문서를 uid별로 getDoc하는 대신, 오늘자 회사 전체 출근기록을
      // 한 번의 list 쿼리로 가져와 체크인한 uid 집합을 만든다 — attendance의
      // get() 규칙은 본인 uid만 허용해 관리자가 다른 사람 문서를 개별
      // getDoc하면 항상 거부되므로(문서가 없을 때는 특히), list 쿼리로
      // 우회한다.
      const attSnap = await getDocs(
        query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("date", "==", todayKey))
      );
      const checkedInUids = new Set(attSnap.docs.filter((d) => d.data().checkInTime).map((d) => d.data().uid));

      const noShows = candidates.filter((d) => !checkedInUids.has(d.data().uid));
      if (noShows.length === 0) return;

      const adminSnap = await getDocs(
        query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "admin"))
      );
      if (adminSnap.empty) return;

      for (const schedDoc of noShows) {
        const s = schedDoc.data();
        const batch = writeBatch(db);
        adminSnap.docs.forEach((a) => {
          const ref = doc(collection(db, "notifications"));
          batch.set(ref, {
            companyId: profile.companyId,
            uid: a.id,
            title: "근로자 결근(미출근) 알림",
            message: `${s.name} 근로자가 오늘 ${s.startTime} 출근 예정이었으나 아직 체크인하지 않았습니다.`,
            read: false,
            createdAt: serverTimestamp(),
          });
        });
        batch.update(schedDoc.ref, { noShowAlertSent: true });
        await batch.commit();
      }
    };

    checkNoShows();
    const interval = setInterval(checkNoShows, NO_SHOW_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [profile?.companyId]);

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="hidden w-60 shrink-0 border-r border-slate-100 bg-white md:sticky md:top-0 md:flex md:h-screen md:flex-col">
        <Link to="/" className="flex items-center px-5 py-5">
          <img src="/logo.png" alt="KP-Work" className="h-14 w-auto" />
        </Link>
        {company && (
          <div className="mx-3 mb-2 rounded-xl bg-slate-50 px-3 py-2">
            <p className="truncate text-xs font-semibold text-ink">{company.name}</p>
            <p className="font-mono text-[11px] text-muted">회사코드 {company.id}</p>
          </div>
        )}
        <div className="flex-1 overflow-y-auto py-2">
          <NavItems items={navItems} badgeCounts={badgeCounts} />
        </div>
        <button
          onClick={logout}
          className="mx-3 mb-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-slate-50"
        >
          <LogOut size={18} /> 로그아웃
        </button>
        <BuildInfo className="mb-3" />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-64 overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4">
              <Link to="/" onClick={() => setMobileOpen(false)}>
                <img src="/logo.png" alt="KP-Work" className="h-12 w-auto" />
              </Link>
              <button onClick={() => setMobileOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <NavItems items={navItems} badgeCounts={badgeCounts} onClick={() => setMobileOpen(false)} />
            <button
              onClick={logout}
              className="mx-3 mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-slate-50"
            >
              <LogOut size={18} /> 로그아웃
            </button>
          </div>
          <div className="flex-1 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3.5 md:px-8">
          <button className="md:hidden" onClick={() => setMobileOpen(true)}>
            <Menu size={22} />
          </button>
          <p className="text-sm font-medium text-ink">관리자 대시보드</p>
          <div className="flex items-center gap-3">
            {earlyLeaveCount > 0 && (
              <button
                type="button"
                onClick={() => navigate("/leaves")}
                className="flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning hover:bg-warning/20"
              >
                <DoorOpen size={14} /> 조퇴요청 {earlyLeaveCount}건이 있습니다
              </button>
            )}
            {resignationCount > 0 && (
              <button
                type="button"
                onClick={() => navigate("/employees/contracts?tab=resignation")}
                className="flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning hover:bg-warning/20"
              >
                <FileWarning size={14} /> 사직서 결재대기 {resignationCount}건이 있습니다
              </button>
            )}
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-sm font-semibold text-primary">
              {profile?.name?.[0] || "K"}
            </div>
          </div>
        </header>
        <Breadcrumb />
        <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-4 md:px-8 md:pb-8">
          <Outlet />
        </main>
      </div>

      <Messenger />
    </div>
  );
}
