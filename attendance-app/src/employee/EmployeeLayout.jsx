import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Home, History, CalendarDays, Menu } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const TABS = [
  { to: "/", label: "홈", icon: Home, end: true },
  { to: "/history", label: "출근기록", icon: History },
  { to: "/schedule", label: "스케줄", icon: CalendarDays },
  { to: "/more", label: "더보기", icon: Menu },
];

// Routes reachable only through the 더보기 menu still count as "더보기" active
// for bottom-tab highlighting purposes.
const MORE_ROUTES = ["/more", "/payslips", "/leave", "/contracts", "/documents", "/safety", "/board"];

export default function EmployeeLayout() {
  const { profile } = useAuth();
  const location = useLocation();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
        <div>
          <p className="text-xs text-muted">안녕하세요</p>
          <p className="text-sm font-semibold text-ink">{profile?.name}님</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-sm font-semibold text-primary">
          {profile?.name?.[0] || "K"}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-1/2 z-40 grid w-full max-w-md -translate-x-1/2 grid-cols-4 border-t border-slate-100 bg-white px-1 py-2 shadow-[0_-2px_10px_rgba(15,23,42,0.06)]">
        {TABS.map(({ to, label, icon: Icon, end }) => {
          const isMoreTab = to === "/more";
          const isActive = isMoreTab
            ? MORE_ROUTES.some((r) => location.pathname.startsWith(r))
            : end
              ? location.pathname === to
              : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] ${
                isActive ? "text-primary" : "text-muted"
              }`}
            >
              <Icon size={20} />
              {label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
