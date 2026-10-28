// ======================= src/KpSubNav.jsx =======================
// ⭐ 속메뉴 공용 왼쪽 사이드바(2026-10-28) — 관리자메뉴처럼 거래처관리·매출관리·정산관리·관리센터·배차현황의
//  속메뉴를 왼쪽 메뉴바로 보여준다. 접기(아이콘만)를 누르면 본문이 넓어진다(PC에 기억).
//  items: [{ key, label, icon, badge, en }]  /  groups: [{ label, items }]  (둘 중 하나)
//  actions: [{ key, label, icon, onClick }] — 화면 전환 대신 팝업을 여는 버튼(예: 월 비교 분석)
import React, { useState } from "react";
import { ShellIcon } from "./AdminShell";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";

export default function KpSubNav({ code = "MENU", title, icon = "dashboard", items, groups, actions = [], actionsLabel = "도구", active, onSelect, children, bodyClass = "px-6 py-5", noBleed = false }) {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("kpSubNavCollapsed") === "1"; } catch { return false; } });
  const toggle = () => setCollapsed((v) => { try { localStorage.setItem("kpSubNavCollapsed", v ? "0" : "1"); } catch { /* 저장 실패 무시 */ } return !v; });
  const gs = groups || [{ label: "", items: items || [] }];

  const Btn = ({ it, on, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? it.label : undefined}
      className={`w-full flex items-center gap-3 rounded-xl text-[14px] font-semibold transition ${collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5"} ${
        on ? "bg-white text-[#1B2B4B] shadow-[0_6px_16px_rgba(0,0,0,0.22)]" : "text-blue-50/80 hover:bg-white/[0.08] hover:text-white"
      }`}
    >
      <span className={`relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${on ? "bg-[#EEF3FB]" : "bg-white/[0.06]"}`}>
        <ShellIcon name={it.icon} size={17} className={on ? "text-[#1B2B4B]" : "text-blue-200/85"} />
        {collapsed && it.badge > 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500" />}
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 min-w-0 text-left">
            <span className="block truncate">{it.label}</span>
            {it.en && <span className="block truncate" style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.18em", opacity: on ? 0.55 : 0.45 }}>{it.en}</span>}
          </span>
          {it.badge > 0 && (
            <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-extrabold flex items-center justify-center ${on ? "bg-[#1B2B4B] text-white" : "bg-rose-500 text-white"}`}>{it.badge}</span>
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
                {g.items.map((it) => <Btn key={it.key} it={it} on={it.key === active} onClick={() => onSelect?.(it.key)} />)}
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
