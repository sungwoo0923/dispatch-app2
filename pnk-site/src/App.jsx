// ======================= pnk-site/src/App.jsx =======================
// PnK PROJECT 사내 인트라넷 — 주소 /login · /intranet/…(공식 홈페이지 site/Site.jsx 와 따로 불러온다) · 로그인 · 가입 요청 · 왼쪽 메뉴(로지스웹 관리 화면과 같은 네이비 사이드바) · 화면 이동
//  PnK PROJECT(법인)가 만드는 로지스웹 · 로지스웹 허브 · 공식 홈페이지 · 기사앱을 한곳에서 관리하는 사내 시스템.
import React from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { ROLE_LABEL, limit, orderBy, useMe, useCol, where } from "./pnkApi";
import { cx } from "./ui";
import Icon from "./icons";
import BootScreen from "./BootScreen";
import { JoinGate, Login, MfaGate } from "./Auth";
import * as UI from "./editor/uiStore";
const EditLayer = React.lazy(() => import("./editor/EditLayer"));
const Home = React.lazy(() => import("./pages/Home"));
const Board = React.lazy(() => import("./pages/Board"));
const Mail = React.lazy(() => import("./pages/Mail"));
const Tasks = React.lazy(() => import("./pages/Tasks"));
const CalendarPage = React.lazy(() => import("./pages/Calendar"));
const Sales = React.lazy(() => import("./pages/Sales"));
const Finance = React.lazy(() => import("./pages/Finance"));
const Company = React.lazy(() => import("./pages/Company"));
const Files = React.lazy(() => import("./pages/Files"));
const Members = React.lazy(() => import("./pages/Members"));
const Customers = React.lazy(() => import("./pages/Customers"));
const Services = React.lazy(() => import("./pages/Services"));
const Approvals = React.lazy(() => import("./pages/Approvals"));
const Attendance = React.lazy(() => import("./pages/Attendance"));
const Leave = React.lazy(() => import("./pages/Leave"));
const Insights = React.lazy(() => import("./pages/Insights")); // 📊 2026-11-18 경영 분석(대표 · 관리자)
const HomepageEditor = React.lazy(() => import("./pages/HomepageEditor")); // 🌐 2026-11-18 공식 홈페이지 편집(로지스웹 홈페이지 편집기와 같은 것)

export const MeCtx = React.createContext(null);
export const useMeCtx = () => React.useContext(MeCtx);

// 메뉴 — admin: true 는 대표 · 관리자만 보인다
const MENU = [
  { label: null, items: [{ to: "/", label: "대시보드", icon: "home" }, { to: "/insights", label: "경영 분석", icon: "trend", admin: true }] },
  { label: "사업 관제", items: [
    { to: "/customers", label: "고객사 · 가입자", icon: "building", owner: true },
    { to: "/services", label: "서비스 현황", icon: "server" },
    { to: "/sales", label: "영업 관리", icon: "handshake" },
  ] },
  { label: "소통", items: [
    { to: "/notice", label: "사내 공지", icon: "megaphone", badge: "notice" },
    { to: "/board", label: "게시판 · 회의록", icon: "chat" },
    { to: "/mail", label: "사내메일", icon: "mail", badge: "mail" },
  ] },
  { label: "결재 · 근태", items: [
    { to: "/approvals", label: "전자결재", icon: "stamp", badge: "approval" },
    { to: "/attendance", label: "출퇴근 · 근태", icon: "clock" },
    { to: "/leave", label: "휴가", icon: "flag" },
  ] },
  { label: "업무", items: [
    { to: "/tasks", label: "업무 보드", icon: "board" },
    { to: "/calendar", label: "일정", icon: "calendar" },
    { to: "/files", label: "자료실", icon: "folder" },
  ] },
  { label: "경영", items: [
    { to: "/finance", label: "매출 · 손익", icon: "trend", admin: true },
    { to: "/homepage", label: "홈페이지 편집", icon: "globe", admin: true },
    { to: "/company", label: "회사 정보", icon: "idcard" },
    { to: "/members", label: "구성원 · 조직도", icon: "users", badge: "pending" },
  ] },
];

export default function App() {
  const me = useMe();
  // 🏢 입장 로딩 화면 — 로그인 확인 → 구성원 · 사번 확인 → 본사 데이터 연결(첫 화면 미리 받기) → 인트라넷 준비
  const [booted, setBooted] = React.useState(false);
  const [pre, setPre] = React.useState(false);
  React.useEffect(() => { if (!me.user) { setBooted(false); setPre(false); } }, [me.user]);
  React.useEffect(() => {
    if (me.loading || !me.active || pre) return;
    Promise.all([import("./pages/Home"), new Promise((r) => setTimeout(r, 250))]).finally(() => setPre(true));
  }, [me.loading, me.active, pre]);
  const stage = me.loading ? me.stage : !me.active ? 4 : pre ? 4 : 3;
  if (!booted && (me.loading || me.active)) return <BootScreen stage={stage} name={me.member?.name} onDone={() => setBooted(true)} />;
  if (!me.user) { UI.setRoute("login"); return <Login />; }
  if (me.needMfa) return <MfaGate me={me} />;
  if (!me.active) return <JoinGate me={me} />;
  // 로그인 화면(/login)에서 들어왔으면 주소를 인트라넷(/intranet)으로 바꾼다 — 화면 이동은 아래 basename 기준
  //  예전 인트라넷 주소(/mail 등)로 들어왔으면 /intranet/mail 처럼 그 화면으로
  { const p = window.location.pathname; if (!p.startsWith("/intranet")) window.history.replaceState(null, "", p === "/login" || p === "/" ? "/intranet" : `/intranet${p}`); }
  return (
    <MeCtx.Provider value={me}>
      <BrowserRouter basename="/intranet">
        <Shell>
          <React.Suspense fallback={<div className="py-16 text-center text-[13px] font-semibold text-[#98928B]">불러오는 중…</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/notice" element={<Board mode="notice" />} />
            <Route path="/board" element={<Board mode="board" />} />
            <Route path="/mail" element={<Mail />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/insights" element={me.isAdmin ? <Insights /> : <Navigate to="/" />} />
            <Route path="/finance" element={me.isAdmin ? <Finance /> : <Navigate to="/" />} />
            <Route path="/homepage" element={me.isAdmin ? <HomepageEditor /> : <Navigate to="/" />} />
            <Route path="/company" element={<Company />} />
            <Route path="/files" element={<Files />} />
            <Route path="/members" element={<Members />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/services" element={<Services />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/leave" element={<Leave />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          </React.Suspense>
        </Shell>
      </BrowserRouter>
    </MeCtx.Provider>
  );
}


const todayLabel = () => { const d = new Date(Date.now() + 9 * 3600e3); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${"일월화수목금토"[d.getUTCDay()]})`; };

// ───────────────────────── 왼쪽 메뉴 + 위쪽 줄 + 본문 ─────────────────────────
//  PC: 왼쪽 메뉴는 화면 높이에 붙어 있고(sticky · 위아래 끝까지), 본문은 창 전체로 스크롤된다
export function Shell({ children }) {
  const me = useMeCtx();
  const loc = useLocation();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { setOpen(false); window.scrollTo(0, 0); UI.setRoute(loc.pathname); }, [loc.pathname]);
  const [, bump] = React.useState(0);
  React.useEffect(() => UI.subscribe(() => bump((x) => x + 1)), []);
  const cfg = UI.current();
  const uid = me.user.uid;
  const [pending] = useCol(me.isAdmin ? "pnkMembers" : null, [where("status", "==", "pending")], [me.isAdmin]);
  const [mails] = useCol("pnkMail", [where("toUids", "array-contains", uid)], [uid]);
  const [notices] = useCol("pnkPosts", [where("board", "==", "notice"), orderBy("createdAt", "desc"), limit(30)], []);
  const [aps] = useCol("pnkApprovals", [where("viewers", "array-contains", uid), where("status", "==", "pending")], [uid]);
  const badges = {
    approval: (aps || []).filter((a) => a.line?.[a.step]?.uid === uid).length,
    notice: (notices || []).filter((p) => !p.readBy?.[uid] && p.authorUid !== uid).length,
    pending: (pending || []).length,
    mail: (mails || []).filter((m) => !m.readBy?.[uid] && !m.trashBy?.[uid]).length,
  };
  const groups = UI.menuOf(cfg, MENU).map((g) => ({ ...g, items: g.items.filter((it) => (!it.admin || me.isAdmin) && (!it.owner || me.owner) && (!it.hidden || UI.isEditing())) })).filter((g) => g.items.length);

  const here = groups.flatMap((g) => g.items.map((it) => ({ g, it }))).find((x) => (x.it.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(x.it.to)));

  const GROUP_EN = { "사업 관제": "Business", "소통": "Communication", "결재 · 근태": "Workflow", "업무": "Work", "경영": "Management" };
  const side = (
    <aside id="pnk-side" className="w-[248px] shrink-0 h-full flex flex-col text-white bg-navy-900 relative">
      <span className="absolute top-0 right-0 bottom-0 w-px bg-white/[0.06]" />
      <a href="/" title="공식 홈페이지" className="px-6 h-[76px] shrink-0 flex items-center gap-3 border-b border-white/[0.06]">
        <img src="/brand/pnk-mark-w.png" alt="" className="w-9 h-9 object-contain shrink-0" />
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-[0.02em] truncate">{cfg.theme?.brandTitle || "PnK PROJECT"}</div>
          <div className="eng text-[10px] text-[#CDBB9C] mt-0.5">Intranet</div>
        </div>
      </a>
      <nav className="flex-1 overflow-y-auto px-3 pt-4 pb-4 space-y-5 no-scrollbar">
        {groups.map((g) => (
          <div key={g.label || "top"}>
            {g.label && <div className="px-3 mb-1.5 flex items-baseline gap-2"><span className="eng text-[10.5px] text-[#CDBB9C]/80">{GROUP_EN[g.label] || ""}</span><span className="text-[11px] text-white/35">{g.label}</span></div>}
            <div className="space-y-0.5">
              {g.items.map((it) => {
                const b = it.badge ? badges[it.badge] : 0;
                return (
                  <NavLink key={it.to} to={it.to} end={it.to === "/"}
                    className={({ isActive }) => cx("relative w-full flex items-center gap-3 px-3 h-10 rounded-[10px] text-[13.5px] transition",
                      isActive ? "bg-white/[0.08] text-white font-semibold" : "font-medium text-white/60 hover:bg-white/[0.04] hover:text-white")}>
                    {({ isActive }) => (<>
                      {isActive && <span className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r gold-grad" />}
                      <Icon name={it.icon} size={17} className={isActive ? "text-[#D8C3A0]" : "text-white/45"} />
                      <span className={cx("flex-1 text-left truncate", it.hidden && "line-through opacity-50")}>{it.label}</span>
                      {b > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center gold-grad text-navy-950">{b}</span>}
                    </>)}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-3 py-3 border-t border-white/[0.06]">
        <div className="px-3 py-2 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full p-[1.5px] gold-grad shrink-0"><div className="w-full h-full rounded-full bg-navy-900 flex items-center justify-center text-[13px] font-semibold">{(me.member?.name || "?").slice(0, 1)}</div></div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold truncate">{me.member?.name || me.user.email}</div>
            <div className="text-[11px] text-white/45 truncate tnum">{me.member?.empNo} · {me.member?.title || ROLE_LABEL[me.member?.role] || "직원"}{me.member?.dept ? ` · ${me.member.dept}` : ""}</div>
          </div>
          <button type="button" onClick={() => signOut(auth)} title="로그아웃" className="w-8 h-8 rounded-lg flex items-center justify-center text-white/45 hover:bg-white/10 hover:text-white"><Icon name="logout" size={17} /></button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="md:flex min-h-screen">
      <div className="hidden md:block sticky top-0 h-screen shrink-0 z-20">{side}</div>
      {/* 휴대폰: 위쪽 줄 + 햄버거 메뉴 */}
      <header className="md:hidden sticky top-0 z-30 h-14 px-4 flex items-center gap-3 text-white bg-navy-900">
        <button type="button" onClick={() => setOpen(true)} className="w-9 h-9 -ml-1 rounded-lg flex items-center justify-center hover:bg-white/10" aria-label="메뉴"><Icon name="menu" size={20} /></button>
        <img src="/brand/pnk-mark-w.png" alt="" className="w-7 h-7 object-contain" />
        <div className="flex-1 min-w-0"><div className="text-[14.5px] font-semibold leading-tight">PnK PROJECT</div><div className="eng text-[9.5px] text-[#CDBB9C]">Intranet</div></div>
        {badges.mail > 0 && <NavLink to="/mail" className="relative w-9 h-9 flex items-center justify-center"><Icon name="mail" size={20} /><span className="absolute top-1 right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-black flex items-center justify-center" style={{ background: "#FF3B30" }}>{badges.mail}</span></NavLink>}
      </header>
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex" onClick={() => setOpen(false)}>
          <div className="h-full" onClick={(e) => e.stopPropagation()}>{side}</div>
          <div className="flex-1 bg-black/40" />
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* PC: 위쪽 줄 — 지금 화면 위치 · 날짜 · 메일/결재 바로가기 */}
        <div id="pnk-top" className="hidden md:flex sticky top-0 z-10 shrink-0 h-[76px] px-8 items-center gap-3 bg-white/85 backdrop-blur border-b border-line">
          <div className="flex-1 min-w-0">
            <div className="eng text-[10.5px] text-gold-deep">{here?.g.label ? `${GROUP_EN[here.g.label] || ""} · ${here.g.label}` : "PnK PROJECT"}</div>
            <div className="text-[17px] font-semibold text-navy-950 truncate tracking-[-0.02em]">{here?.it.label || ""}</div>
          </div>
          <span className="text-[12.5px] font-medium text-navy-600 tnum mr-3">{todayLabel()}</span>
          {[["/mail", "mail", "사내메일", badges.mail], ["/approvals", "stamp", "전자결재", badges.approval], ["/notice", "megaphone", "사내 공지", badges.notice]].map(([to, icon, label, n]) => (
            <NavLink key={to} to={to} title={label} className={({ isActive }) => cx("relative w-10 h-10 rounded-full flex items-center justify-center transition border", isActive ? "bg-navy-900 text-white border-navy-900" : "text-navy-700 border-line hover:border-[#CFC7BB]")}>
              <Icon name={icon} size={18} />
              {n > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center gold-grad text-navy-950">{n}</span>}
            </NavLink>
          ))}
          <a href="/" target="_blank" rel="noopener noreferrer" title="공식 홈페이지" className="ml-1 h-10 px-4 rounded-full border border-line text-[12.5px] font-semibold text-navy-700 hover:border-[#CFC7BB] flex items-center gap-1.5"><Icon name="globe" size={15} />홈페이지</a>
        </div>
        <main id="pnk-main" className="flex-1 min-w-0 px-4 md:px-8 py-5 md:py-7">
          <div className="w-full max-w-[1600px] mx-auto">{children}</div>
        </main>
      </div>
      {me.owner && <React.Suspense fallback={null}><EditLayer me={me} menu={MENU} /></React.Suspense>}
    </div>
  );
}
