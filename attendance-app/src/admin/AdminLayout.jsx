import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ClipboardCheck,
  CalendarClock,
  Wallet,
  BarChart3,
  ShieldCheck,
  MessageSquare,
  Settings,
  LayoutTemplate,
  Menu,
  X,
  LogOut,
  CalendarCheck2,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const NAV = [
  { to: "/", label: "홈", icon: LayoutDashboard, end: true },
  {
    to: "/employees",
    label: "근로자",
    icon: Users,
    children: [
      { to: "/employees", label: "근로자 목록" },
      { to: "/employees/contracts", label: "계약서" },
      { to: "/employees/documents", label: "서류함" },
      { to: "/employees/status", label: "입퇴사현황" },
    ],
  },
  { to: "/schedule", label: "스케줄", icon: CalendarDays },
  { to: "/attendance", label: "출근현황", icon: ClipboardCheck },
  { to: "/leaves", label: "휴가", icon: CalendarClock },
  {
    to: "/safety",
    label: "안전",
    icon: ShieldCheck,
    children: [
      { to: "/safety", label: "안전교육현황" },
      { to: "/safety/settings", label: "센터별 안전관리" },
    ],
  },
  { to: "/payroll", label: "정산", icon: Wallet },
  { to: "/stats", label: "통계", icon: BarChart3 },
  { to: "/board", label: "게시판", icon: MessageSquare },
  { to: "/templates", label: "템플릿", icon: LayoutTemplate },
  {
    to: "/settings/admins",
    label: "설정",
    icon: Settings,
    children: [
      { to: "/settings/admins", label: "관리자 계정" },
      { to: "/settings/org", label: "부서·직급" },
    ],
  },
];

const itemClass = ({ isActive }) =>
  `flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive ? "bg-primary-light text-primary" : "text-muted hover:bg-slate-50"
  }`;

function NavItems({ onClick }) {
  const location = useLocation();
  const [openMenu, setOpenMenu] = useState(
    () => NAV.find((n) => n.children?.some((c) => location.pathname.startsWith(c.to)))?.to ?? null
  );

  return (
    <nav className="space-y-1 px-3">
      {NAV.map(({ to, label, icon: Icon, end, children }) => {
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
  const { profile, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="hidden w-60 shrink-0 border-r border-slate-100 bg-white md:flex md:flex-col">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
            <CalendarCheck2 size={18} />
          </div>
          <span className="text-base font-bold text-ink">KP-work</span>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <NavItems />
        </div>
        <button
          onClick={logout}
          className="mx-3 mb-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-slate-50"
        >
          <LogOut size={18} /> 로그아웃
        </button>
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
            <NavItems onClick={() => setMobileOpen(false)} />
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

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3.5 md:px-8">
          <button className="md:hidden" onClick={() => setMobileOpen(true)}>
            <Menu size={22} />
          </button>
          <p className="text-sm font-medium text-ink">관리자 대시보드</p>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-sm font-semibold text-primary">
            {profile?.name?.[0] || "K"}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
