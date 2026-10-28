// ======================= src/KpSubNav.jsx =======================
// ⭐ 속메뉴 공용 왼쪽 사이드바(2026-10-28) — 관리자메뉴처럼 거래처관리·매출관리·정산관리·관리센터·배차현황의
//  속메뉴를 왼쪽 메뉴바로 보여준다. 접기(아이콘만)를 누르면 본문이 넓어진다(PC에 기억).
//  items: [{ key, label, icon, badge, en, sub }]  /  groups: [{ label, items }]  (둘 중 하나)
//   - badge: 숫자(카톡처럼 개수) 또는 "N"(새 글), soft: true면 빨간 대신 옅은 배지(예약·임시보관 개수 등) / sub: 하위메뉴 [{ key, label, icon, badge }] — 부모나 하위가 열려 있으면 펼친다
//  actions: [{ key, label, icon, onClick }] — 화면 전환 대신 팝업을 여는 버튼(예: 월 비교 분석)
import React, { useState } from "react";
import { ShellIcon } from "./AdminShell";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";

export default function KpSubNav({ code = "MENU", title, icon = "dashboard", items, groups, actions = [], actionsLabel = "도구", active, onSelect, children, bodyClass = "px-6 py-5", noBleed = false }) {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("kpSubNavCollapsed") === "1"; } catch { return false; } });
  const toggle = () => setCollapsed((v) => { try { localStorage.setItem("kpSubNavCollapsed", v ? "0" : "1"); } catch { /* 저장 실패 무시 */ } return !v; });
  const gs = groups || [{ label: "", items: items || [] }];

  const hasBadge = (b) => (typeof b === "string" ? !!b : b > 0);
  const badgeTxt = (b) => (typeof b === "number" && b > 99 ? "99+" : b);
  const Btn = ({ it, on, onClick, sub = false }) => (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? it.label : undefined}
      className={`w-full flex items-center gap-3 rounded-xl font-semibold transition ${sub ? "text-[13px]" : "text-[14px]"} ${collapsed ? "justify-center px-0 py-2.5" : sub ? "pl-5 pr-3 py-1.5" : "px-3 py-2.5"} ${
        on ? "bg-white text-[#1B2B4B] shadow-[0_6px_16px_rgba(0,0,0,0.22)]" : "text-blue-50/80 hover:bg-white/[0.08] hover:text-white"
      }`}
    >
      <span className={`relative rounded-lg flex items-center justify-center shrink-0 ${sub ? "w-6 h-6" : "w-8 h-8"} ${on ? "bg-[#EEF3FB]" : "bg-white/[0.06]"}`}>
        <ShellIcon name={it.icon} size={sub ? 14 : 17} className={on ? "text-[#1B2B4B]" : "text-blue-200/85"} />
        {collapsed && hasBadge(it.badge) && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500" />}
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 min-w-0 text-left">
            <span className="block truncate">{it.label}</span>
            {it.en && <span className="block truncate" style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.18em", opacity: on ? 0.55 : 0.45 }}>{it.en}</span>}
          </span>
          {hasBadge(it.badge) && (
            <span title={it.badgeTitle} className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-extrabold flex items-center justify-center tabular-nums ${typeof it.badge === "string" ? "tracking-wider " : ""}${on ? "bg-[#1B2B4B] text-white" : it.soft ? "bg-white/15 text-white" : "bg-rose-500 text-white"}`}>{badgeTxt(it.badge)}</span>
          )}
        </>
      )}
    </button>
  );

  return (
    <div className={`flex bg-[#F4F6FA] overflow-hidden ${noBleed ? "rounded-[20px]" : "-m-4"}`} style={{ height: noBleed ? "calc(100vh - 88px)" : "calc(100vh - 80px)" }}>
      <aside
        className="shrink-0 h-full flex flex-col text-white transition-[width] duration-200"
        style={{ width: collapsed ? 72 : 228, background: "linear-gradient(180deg, #16264A 0%, #1B2B4B 55%, #14213D 100%)" }}
      >
        <div className={`pt-5 pb-4 border-b border-white/10 flex items-center gap-3 ${collapsed ? "px-0 justify-center" : "px-4"}`}>
          <div className="w-10 h-10 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center shrink-0">
            <ShellIcon name={icon} size={19} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.22em" }} className="text-blue-200/70">{code}</div>
              <div className="text-[15.5px] font-bold truncate">{title}</div>
            </div>
          )}
        </div>
        <nav className={`flex-1 overflow-y-auto py-4 space-y-5 no-scrollbar ${collapsed ? "px-2" : "px-3"}`}>
          {gs.map((g, gi) => (
            <div key={g.label || gi}>
              {g.label && !collapsed && <div className="px-3 mb-1.5 text-[11px] font-bold text-blue-200/45">{g.label}</div>}
              <div className="space-y-1">
                {g.items.map((it) => {
                  const open = it.sub && (it.key === active || it.sub.some((x) => x.key === active));
                  return (
                    <React.Fragment key={it.key}>
                      <Btn it={it} on={it.key === active || (open && collapsed)} onClick={() => onSelect?.(it.sub ? it.sub[0].key : it.key)} />
                      {open && !collapsed && (
                        <div className="ml-4 pl-1 border-l border-white/10 space-y-0.5 py-0.5">
                          {it.sub.map((x) => <Btn key={x.key} it={x} sub on={x.key === active} onClick={() => onSelect?.(x.key)} />)}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          ))}
          {actions.length > 0 && (
            <div>
              {!collapsed && <div className="px-3 mb-1.5 text-[11px] font-bold text-blue-200/45">{actionsLabel}</div>}
              <div className="space-y-1">
                {actions.map((a) => <Btn key={a.key} it={a} on={false} onClick={a.onClick} />)}
              </div>
            </div>
          )}
        </nav>
        <button type="button" onClick={toggle} className="m-3 h-9 rounded-xl text-[12.5px] font-bold text-blue-100/70 hover:text-white hover:bg-white/[0.08] border border-white/10 flex items-center justify-center gap-2" title={collapsed ? "메뉴 펼치기" : "메뉴 접기"}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? "rotate(180deg)" : "none" }}><path d="M15 6l-6 6 6 6" /></svg>
          {!collapsed && "메뉴 접기"}
        </button>
      </aside>
      <main className={`flex-1 min-w-0 h-full overflow-y-auto ${bodyClass}`}>{children}</main>
    </div>
  );
}
