// ======================= src/AdminShell.jsx =======================
// ⭐ 관리 화면 공용 레이아웃(회사관리·관리자메뉴) — 왼쪽 메뉴바 + 상단 인사 카드 + 숫자 카드 + 본문.
// KP-Flow 네이비 색으로 통일. 각 화면은 메뉴 목록·숫자 카드·버튼만 넘겨주면 된다.
import React from "react";

const ICONS = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.7.8 2.8 2.6 3 5.2" /></>,
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" /></>,
  send: <><path d="M21 3 10 14" /><path d="M21 3 14.5 21l-4.5-7-7-4.5z" /></>,
  chat: <><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" /></>,
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v6H3v-6z" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3" /><path d="M5 3v5h5M19 21v-5h-5" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M15 8l2 2" /></>,
  sheet: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 3v18" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  bell: <><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  building: <><path d="M4 21V5l8-2v18M12 7l8 2v12" /><path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2M2 21h20" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  idcard: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" /><path d="M5.5 16c.5-1.6 1.9-2.5 3.5-2.5s3 .9 3.5 2.5M15 10h3M15 13h3" /></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></>,
  shield: <><path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  hourglass: <><path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9" /></>,
  money: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  truck: <><rect x="1" y="6" width="13" height="10" rx="1.5" /><path d="M14 9h4l3 3.5V16h-7z" /><circle cx="5.5" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></>,
};

export function ShellIcon({ name, size = 18, className = "", strokeWidth = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {ICONS[name] || ICONS.dashboard}
    </svg>
  );
}

const TONES = {
  navy: "bg-[#EEF3FB] text-[#1B2B4B]",
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  rose: "bg-rose-50 text-rose-600",
};

const dateLabel = () => {
  const d = new Date();
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${["일", "월", "화", "수", "목", "금", "토"][d.getDay()]}요일`;
};

/**
 * props
 *  badgeLabel: 사이드바 위 작은 글씨(예: "ADMIN", "COMPANY")
 *  title: 사이드바 제목(예: 사용자 이름, 회사명)
 *  groups: [{ label, items: [{ key, label, icon, badge }] }]
 *  active, onSelect(key)
 *  heroTitle, heroSubtitle, heroActions: [{ label, icon, onClick, active }]
 *  stats: [{ label, value, icon, tone }]
 *  sidebarFooter: 사이드바 맨 아래 영역(선택)
 *  hideHero: 상단 인사 카드 숨김(본문이 넓어야 하는 화면)
 */
export default function AdminShell({
  badgeLabel, title, groups = [], active, onSelect,
  heroTitle, heroSubtitle, heroActions = [], stats = [], sidebarFooter, hideHero = false, children,
}) {
  return (
    // ⭐ 화면 높이에 맞춘 틀 — 왼쪽 메뉴바는 고정, 오른쪽 본문만 스크롤(상단 메뉴줄 56px + 여백 24px 제외)
    <div className="flex bg-[#F4F6FA] -m-4 overflow-hidden" style={{ height: "calc(100vh - 80px)" }}>
      {/* ── 왼쪽 메뉴바 ── */}
      <aside
        className="w-[236px] shrink-0 h-full flex flex-col text-white"
        style={{ background: "linear-gradient(180deg, #16264A 0%, #1B2B4B 55%, #14213D 100%)" }}
      >
        <div className="px-5 pt-6 pb-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center shrink-0">
            <ShellIcon name="shield" size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-[10.5px] font-extrabold tracking-[0.18em] text-blue-200/70">{badgeLabel}</div>
            <div className="text-[15px] font-bold truncate">{title}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 no-scrollbar">
          {groups.map((g) => (
            <div key={g.label || g.items[0]?.key}>
              {g.label && <div className="px-3 mb-1.5 text-[11px] font-bold text-blue-200/45">{g.label}</div>}
              <div className="space-y-1">
                {g.items.map((it) => {
                  const on = it.key === active;
                  return (
                    <button
                      key={it.key}
                      onClick={() => onSelect?.(it.key)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold transition ${
                        on ? "bg-white text-[#1B2B4B] shadow-[0_6px_16px_rgba(0,0,0,0.18)]" : "text-blue-50/80 hover:bg-white/[0.08] hover:text-white"
                      }`}
                    >
                      <ShellIcon name={it.icon} size={18} className={on ? "text-[#1B2B4B]" : "text-blue-200/80"} />
                      <span className="flex-1 text-left truncate">{it.label}</span>
                      {it.badge > 0 && (
                        <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-extrabold flex items-center justify-center ${on ? "bg-[#1B2B4B] text-white" : "bg-rose-500 text-white"}`}>{it.badge}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        {sidebarFooter && <div className="px-3 py-3 border-t border-white/10">{sidebarFooter}</div>}
      </aside>

      {/* ── 본문 ── */}
      <main className="flex-1 min-w-0 h-full overflow-y-auto px-7 py-6">
        <div className="max-w-[1480px] mx-auto">
          {!hideHero && (
            <section
              className="relative overflow-hidden rounded-[26px] px-8 py-7 text-white mb-6 shadow-[0_14px_34px_rgba(27,43,75,0.25)]"
              style={{ background: "linear-gradient(120deg, #1B2B4B 0%, #233B66 55%, #2D4C82 100%)" }}
            >
              <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-white/[0.06]" />
              <div className="absolute right-40 -bottom-24 w-56 h-56 rounded-full bg-white/[0.05]" />
              <div className="relative">
                <div className="text-[13.5px] font-bold text-blue-100/85">{dateLabel()}</div>
                <h1 className="mt-1.5 text-[28px] font-black tracking-tight">{heroTitle}</h1>
                {heroSubtitle && <p className="mt-2 text-[15px] font-medium text-blue-50/90">{heroSubtitle}</p>}
                {heroActions.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {heroActions.map((a) => (
                      <button
                        key={a.label}
                        onClick={a.onClick}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold ring-1 transition ${
                          a.active ? "bg-white text-[#1B2B4B] ring-white" : "bg-white/10 ring-white/20 hover:bg-white/20"
                        }`}
                      >
                        {a.icon && <ShellIcon name={a.icon} size={16} />}
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {stats.length > 0 && (
            <div className="grid gap-5 mb-6" style={{ gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, minmax(0, 1fr))` }}>
              {stats.map((s) => (
                <div key={s.label} className="bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)] px-6 py-5 flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${TONES[s.tone] || TONES.navy}`}>
                    <ShellIcon name={s.icon} size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-bold text-gray-600">{s.label}</div>
                    <div className="mt-0.5 text-[28px] font-black text-[#0F1A30] tabular-nums leading-tight truncate">{s.value}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {children}
        </div>
      </main>
    </div>
  );
}
