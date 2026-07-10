import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ClipboardList, CalendarCheck, CheckCircle2, MessageSquare, User } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import HeaderIcons from "./HeaderIcons";

const TABS = [
  { to: "/work-info", label: "근무정보", icon: ClipboardList },
  { to: "/history", label: "출근현황", icon: CalendarCheck },
  { to: "/", label: "체크", icon: CheckCircle2, end: true, center: true },
  { to: "/board", label: "공지사항", icon: MessageSquare },
  { to: "/my-info", label: "내정보", icon: User },
];

// Routes reachable only through a hub tab still count as that tab active for
// bottom-nav highlighting purposes.
const WORKINFO_ROUTES = ["/work-info", "/contracts", "/payslips", "/leave"];
const MYINFO_ROUTES = ["/my-info", "/documents", "/safety"];

export default function EmployeeLayout() {
  const { profile } = useAuth();
  const location = useLocation();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-surface">
      <header
        className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-2.5"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.625rem)" }}
      >
        <img src="/logo.png" alt="KP-Work" className="h-11 w-auto" />
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] leading-tight text-muted">안녕하세요</p>
            <p className="text-xs font-semibold leading-tight text-ink">{profile?.name}님</p>
          </div>
          <HeaderIcons />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      <nav
        id="employee-bottom-nav"
        className="fixed bottom-0 left-1/2 z-40 grid w-full max-w-md -translate-x-1/2 grid-cols-5 border-t border-slate-100 bg-white px-1 py-2 shadow-[0_-2px_10px_rgba(15,23,42,0.06)]"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {TABS.map(({ to, label, icon: Icon, end, center }) => {
          const isActive =
            to === "/work-info"
              ? WORKINFO_ROUTES.some((r) => location.pathname.startsWith(r))
              : to === "/my-info"
                ? MYINFO_ROUTES.some((r) => location.pathname.startsWith(r))
                : end
                  ? location.pathname === to
                  : location.pathname.startsWith(to);

          if (center) {
            return (
              <NavLink key={to} to={to} end={end} className="relative flex flex-col items-center gap-1 py-1.5">
                <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30">
                  <Icon size={22} />
                </span>
                <span className={`text-[11px] ${isActive ? "font-semibold text-primary" : "text-muted"}`}>{label}</span>
              </NavLink>
            );
          }

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
