import { NavLink, Outlet } from "react-router-dom";
import { LogOut, ClipboardList, Wallet } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import BuildInfo from "../components/BuildInfo";

const itemClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive ? "bg-primary-light text-primary" : "text-muted hover:bg-slate-50"
  }`;

// 외부 인력사무소(에이전시) 전용 화면 껍데기 — 도급사 관리자 화면과 완전히
// 분리되어 있고, 요청장/정산 두 메뉴만 볼 수 있다(요청장/정산 외 데이터는
// firestore.rules에서도 애초에 읽을 수 없다).
export default function AgencyLayout() {
  const { agency, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="hidden w-60 shrink-0 border-r border-slate-100 bg-white px-3 py-5 md:flex md:flex-col">
        <div className="mb-6 px-2">
          <img src="/logo.png" alt="KP-Work" className="h-7" />
          <p className="mt-1 truncate text-xs font-medium text-muted">{agency?.name || "인력사무소"}</p>
        </div>
        <nav className="flex-1 space-y-1">
          <NavLink to="/" end className={itemClass}>
            <ClipboardList size={18} /> 요청장
          </NavLink>
          <NavLink to="/settlement" className={itemClass}>
            <Wallet size={18} /> 정산
          </NavLink>
        </nav>
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted hover:bg-slate-50"
        >
          <LogOut size={18} /> 로그아웃
        </button>
        <BuildInfo className="mt-3 px-2" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3 md:hidden">
          <img src="/logo.png" alt="KP-Work" className="h-6" />
          <button type="button" onClick={logout} className="text-muted">
            <LogOut size={18} />
          </button>
        </header>
        <nav className="flex gap-1 border-b border-slate-100 bg-white px-3 py-2 md:hidden">
          <NavLink to="/" end className={itemClass}>
            <ClipboardList size={16} /> 요청장
          </NavLink>
          <NavLink to="/settlement" className={itemClass}>
            <Wallet size={16} /> 정산
          </NavLink>
        </nav>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
