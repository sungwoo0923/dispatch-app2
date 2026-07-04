import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Home, ChevronRight, Star } from "lucide-react";
import { NAV, SUPER_ADMIN_NAV_ITEM, resolveBreadcrumb } from "../admin/navConfig";
import { useAuth } from "../hooks/useAuth";

// Mirrors the reference guide's "홈 > 섹션 > 현재 화면" bar with a per-route
// favorite star, stored per-browser since it's a personal shortcut, not
// company data.
export default function Breadcrumb() {
  const location = useLocation();
  const { isSuperAdmin } = useAuth();
  const navItems = isSuperAdmin ? [...NAV, SUPER_ADMIN_NAV_ITEM] : NAV;
  const { section, label } = resolveBreadcrumb(location.pathname, navItems);
  const [starred, setStarred] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("kpwork_starred_pages") || "[]").includes(location.pathname);
    } catch {
      return false;
    }
  });

  const toggleStar = () => {
    let list = [];
    try {
      list = JSON.parse(localStorage.getItem("kpwork_starred_pages") || "[]");
    } catch {
      list = [];
    }
    const next = starred ? list.filter((p) => p !== location.pathname) : [...list, location.pathname];
    localStorage.setItem("kpwork_starred_pages", JSON.stringify(next));
    setStarred(!starred);
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 text-xs text-muted md:px-8">
      <div className="flex items-center gap-1.5">
        <Home size={13} />
        <ChevronRight size={12} />
        {section && (
          <>
            <span>{section}</span>
            <ChevronRight size={12} />
          </>
        )}
        <span className="font-medium text-ink">{label}</span>
      </div>
      <button onClick={toggleStar} title="즐겨찾기" className="text-muted hover:text-primary">
        <Star size={14} className={starred ? "fill-primary text-primary" : ""} />
      </button>
    </div>
  );
}
