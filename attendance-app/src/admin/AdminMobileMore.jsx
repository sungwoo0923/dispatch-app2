import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { NAV, SUPER_ADMIN_NAV_ITEMS, filterNavByPermission } from "./navConfig";

// 하단탭에 다 담을 수 없는 나머지 메뉴(휴가/안전/정산/통계/조직/권한/템플릿/
// 설정 등)를 아코디언 목록으로 모아두는 화면. 근로자/스케줄/게시판처럼
// 자주 쓰는 항목은 하단탭에 이미 있으므로 여기서는 굳이 중복하지 않는다.
const HIDDEN_TOP_LEVEL = ["/", "/employees", "/schedule", "/board"];

export default function AdminMobileMore() {
  const { profile, isSuperAdmin, allowedMenuPaths } = useAuth();
  const [openSection, setOpenSection] = useState(null);

  const navItems = filterNavByPermission(isSuperAdmin ? [...NAV, ...SUPER_ADMIN_NAV_ITEMS] : NAV, allowedMenuPaths).filter(
    (item) => !HIDDEN_TOP_LEVEL.includes(item.to)
  );

  return (
    <div className="space-y-4 px-4 pt-4">
      <div>
        <p className="text-sm font-semibold text-ink">전체메뉴</p>
        <p className="mt-0.5 text-xs text-muted">{profile?.name}님, 필요한 메뉴를 선택하세요</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          if (!item.children) {
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-ink active:bg-slate-50 ${idx > 0 ? "border-t border-slate-100" : ""}`}
              >
                <Icon size={18} className="shrink-0 text-primary" />
                {item.label}
              </Link>
            );
          }
          const isOpen = openSection === item.to;
          return (
            <div key={item.to} className={idx > 0 ? "border-t border-slate-100" : ""}>
              <button
                type="button"
                onClick={() => setOpenSection(isOpen ? null : item.to)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-ink active:bg-slate-50"
              >
                <Icon size={18} className="shrink-0 text-primary" />
                <span className="flex-1">{item.label}</span>
                <ChevronDown size={16} className={`text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="bg-slate-50 pb-1">
                  {item.children.map((c) => (
                    <Link key={c.to} to={c.to} className="flex items-center gap-2 px-4 py-2.5 pl-11 text-sm text-muted active:bg-slate-100">
                      {c.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
