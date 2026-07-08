import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Menu, X, LogOut, CalendarCheck2, ChevronDown, DoorOpen, FileWarning } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Breadcrumb from "../components/Breadcrumb";
import BuildInfo from "../components/BuildInfo";
import { NAV, SUPER_ADMIN_NAV_ITEM } from "./navConfig";

const itemClass = ({ isActive }) =>
  `flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive ? "bg-primary-light text-primary" : "text-muted hover:bg-slate-50"
  }`;

function NavItems({ items, onClick }) {
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
              {label}
            </NavLink>
          );
        }

        const isOpen = openMenu === to;
        const isChildActive = children.some((c) => location.pathname === c.to);
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
                      `block rounded-lg px-3 py-1.5 text-sm ${
                        isActive ? "bg-primary-light text-primary" : "text-muted hover:bg-slate-50"
                      }`
                    }
                  >
                    {child.label}
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
  const { profile, company, logout, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [earlyLeaveCount, setEarlyLeaveCount] = useState(0);
  const [resignationCount, setResignationCount] = useState(0);
  const navItems = isSuperAdmin ? [...NAV, SUPER_ADMIN_NAV_ITEM] : NAV;

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
      setResignationCount(snap.docs.filter((d) => ["submitted", "manager_signed"].includes(d.data().status)).length)
    );
    return () => unsub();
  }, [profile?.companyId]);

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="hidden w-60 shrink-0 border-r border-slate-100 bg-white md:flex md:flex-col">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
            <CalendarCheck2 size={18} />
          </div>
          <span className="text-base font-bold text-ink">KP-work</span>
        </div>
        {company && (
          <div className="mx-3 mb-2 rounded-xl bg-slate-50 px-3 py-2">
            <p className="truncate text-xs font-semibold text-ink">{company.name}</p>
            <p className="font-mono text-[11px] text-muted">회사코드 {company.id}</p>
          </div>
        )}
        <div className="flex-1 overflow-y-auto py-2">
          <NavItems items={navItems} />
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
              <span className="text-base font-bold text-ink">KP-work</span>
              <button onClick={() => setMobileOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <NavItems items={navItems} onClick={() => setMobileOpen(false)} />
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
    </div>
  );
}
