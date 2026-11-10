// ======================= pnk-site/src/App.jsx =======================
// PnK PROJECT 사내 인트라넷 — 로그인 · 가입 요청 · 왼쪽 메뉴(로지스웹 관리 화면과 같은 네이비 사이드바) · 화면 이동
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

export const MeCtx = React.createContext(null);
export const useMeCtx = () => React.useContext(MeCtx);

// 메뉴 — admin: true 는 대표 · 관리자만 보인다
const MENU = [
  { label: null, items: [{ to: "/", label: "본사 대시보드", icon: "home" }] },
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
  return (
    <MeCtx.Provider value={me}>
      <BrowserRouter>
        <Shell>
          <React.Suspense fallback={<div className="py-16 text-center text-[13px] font-semibold text-[#7A8AA8]">불러오는 중…</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/notice" element={<Board mode="notice" />} />
            <Route path="/board" element={<Board mode="board" />} />
            <Route path="/mail" element={<Mail />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/finance" element={me.isAdmin ? <Finance /> : <Navigate to="/" />} />
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
function Shell({ children }) {
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

  const side = (
    <aside id="pnk-side" className="w-[224px] shrink-0 h-full flex flex-col text-white bg-navy-900">
      <div className="px-5 h-14 shrink-0 flex items-center gap-2.5">
        <img src="/brand/pnk-mark-192.png" alt="" className="w-8 h-8 rounded-lg bg-white shrink-0" />
        <div className="text-[15px] font-black truncate">{cfg.theme?.brandTitle || "PnK PROJECT"}</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pt-2 pb-4 space-y-4 no-scrollbar">
        {groups.map((g) => (
          <div key={g.label || "top"}>
            {g.label && <div className="px-3 mb-1 text-[11px] font-bold text-blue-200/60">{g.label}</div>}
            <div className="space-y-0.5">
              {g.items.map((it) => {
                const b = it.badge ? badges[it.badge] : 0;
                return (
                  <NavLink key={it.to} to={it.to} end={it.to === "/"}
                    className={({ isActive }) => cx("w-full flex items-center gap-3 px-3 h-10 rounded-lg text-[13.5px] transition",
                      isActive ? "bg-white text-navy font-black" : "font-semibold text-blue-50/80 hover:bg-white/[0.08] hover:text-white")}>
                    {({ isActive }) => (<>
                      <Icon name={it.icon} size={18} className={isActive ? "text-navy" : "text-blue-200/80"} />
                      <span className={cx("flex-1 text-left truncate", it.hidden && "line-through opacity-50")}>{it.label}</span>
                      {b > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-extrabold flex items-center justify-center" style={{ background: "#FF3B30", color: "#fff" }}>{b}</span>}
                    </>)}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-3 py-3 border-t border-white/10">
        <div className="px-3 py-2 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-[13px] font-black">{(me.member?.name || "?").slice(0, 1)}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold truncate">{me.member?.name || me.user.email}</div>
            <div className="text-[11px] text-blue-200/75 truncate">{me.member?.empNo} · {me.member?.title || ROLE_LABEL[me.member?.role] || "직원"}{me.member?.dept ? ` · ${me.member.dept}` : ""}</div>
          </div>
          <button type="button" onClick={() => signOut(auth)} title="로그아웃" className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-200/80 hover:bg-white/10 hover:text-white"><Icon name="logout" size={17} /></button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="md:flex md:h-screen md:overflow-hidden">
      <div className="hidden md:block h-full">{side}</div>
      {/* 휴대폰: 위쪽 줄 + 햄버거 메뉴 */}
      <header className="md:hidden sticky top-0 z-30 h-14 px-4 flex items-center gap-3 text-white bg-navy-900">
        <button type="button" onClick={() => setOpen(true)} className="w-9 h-9 -ml-1 rounded-lg flex items-center justify-center hover:bg-white/10" aria-label="메뉴"><Icon name="menu" size={20} /></button>
        <img src="/brand/pnk-mark-64.png" alt="" className="w-7 h-7 rounded-lg bg-white" />
        <div className="text-[15px] font-black flex-1">PnK PROJECT</div>
        {badges.mail > 0 && <NavLink to="/mail" className="relative w-9 h-9 flex items-center justify-center"><Icon name="mail" size={20} /><span className="absolute top-1 right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-black flex items-center justify-center" style={{ background: "#FF3B30" }}>{badges.mail}</span></NavLink>}
      </header>
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex" onClick={() => setOpen(false)}>
          <div className="h-full" onClick={(e) => e.stopPropagation()}>{side}</div>
          <div className="flex-1 bg-black/40" />
        </div>
      )}
      <div className="flex-1 min-w-0 md:h-full flex flex-col">
        {/* PC: 위쪽 줄 — 지금 화면 위치 · 날짜 · 메일/결재 바로가기 */}
        <div id="pnk-top" className="hidden md:flex shrink-0 h-14 px-7 items-center gap-2 bg-white border-b border-line">
          <div className="flex-1 min-w-0 flex items-center gap-2 text-[13.5px]">
            {here?.g.label && <><span className="font-semibold text-[#5A6A86]">{here.g.label}</span><span className="text-[#C0C8D6]">/</span></>}
            <span className="font-black text-navy-950 truncate">{here?.it.label || ""}</span>
          </div>
          <span className="text-[13px] font-bold text-[#3A4A66] tnum mr-2">{todayLabel()}</span>
          {[["/mail", "mail", "사내메일", badges.mail], ["/approvals", "stamp", "전자결재", badges.approval], ["/notice", "megaphone", "사내 공지", badges.notice]].map(([to, icon, label, n]) => (
            <NavLink key={to} to={to} title={label} className={({ isActive }) => cx("relative w-9 h-9 rounded-lg flex items-center justify-center transition", isActive ? "bg-navy-100 text-navy" : "text-[#5A6A86] hover:bg-navy-50 hover:text-navy")}>
              <Icon name={icon} size={19} />
              {n > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-black flex items-center justify-center" style={{ background: "#FF3B30", color: "#fff" }}>{n}</span>}
            </NavLink>
          ))}
        </div>
        <main id="pnk-main" className="flex-1 min-w-0 min-h-0 md:overflow-y-auto px-4 md:px-7 py-5 md:py-6">
          <div className="w-full max-w-[1600px] mx-auto">{children}</div>
        </main>
      </div>
      {me.owner && <React.Suspense fallback={null}><EditLayer me={me} menu={MENU} /></React.Suspense>}
    </div>
  );
}
