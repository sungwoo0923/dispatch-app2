// ======================= pnk-site/src/App.jsx =======================
// PnK PROJECT 사내 인트라넷 — 로그인 · 가입 요청 · 왼쪽 메뉴(로지스웹 관리 화면과 같은 네이비 사이드바) · 화면 이동
//  PnK PROJECT(법인)가 만드는 로지스웹 · 로지스웹 허브 · 공식 홈페이지 · 기사앱을 한곳에서 관리하는 사내 시스템.
import React from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { ROLE_LABEL, limit, orderBy, requestJoin, useMe, useCol, where } from "./pnkApi";
import { Btn, Field, Input, Select, cx, errMsg } from "./ui";
import { DEPT_ORDER, TITLES } from "./pnkConst";
import Icon from "./icons";
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
  if (me.loading) return <Splash />;
  if (!me.user) return <Login />;
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
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          </React.Suspense>
        </Shell>
      </BrowserRouter>
    </MeCtx.Provider>
  );
}

function Splash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <img src="/brand/pnk-mark-192.png" alt="" className="w-16 h-16 rounded-2xl" />
      <div className="text-[13px] font-bold text-[#7A8AA8]">PnK PROJECT 인트라넷 불러오는 중…</div>
    </div>
  );
}

// ───────────────────────── 왼쪽 메뉴 + 본문 ─────────────────────────
function Shell({ children }) {
  const me = useMeCtx();
  const loc = useLocation();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const uid = me.user.uid;
  const [pending] = useCol(me.isAdmin ? "pnkMembers" : null, [where("status", "==", "pending")], [me.isAdmin]);
  const [mails] = useCol("pnkMail", [where("toUids", "array-contains", uid)], [uid]);
  const [notices] = useCol("pnkPosts", [where("board", "==", "notice"), orderBy("createdAt", "desc"), limit(30)], []);
  const badges = {
    notice: (notices || []).filter((p) => !p.readBy?.[uid] && p.authorUid !== uid).length,
    pending: (pending || []).length,
    mail: (mails || []).filter((m) => !m.readBy?.[uid] && !m.trashBy?.[uid]).length,
  };
  const groups = MENU.map((g) => ({ ...g, items: g.items.filter((it) => (!it.admin || me.isAdmin) && (!it.owner || me.owner)) })).filter((g) => g.items.length);

  const side = (
    <aside className="w-[236px] shrink-0 h-full flex flex-col text-white" style={{ background: "linear-gradient(180deg, #16264A 0%, #1B2B4B 55%, #14213D 100%)" }}>
      <div className="px-5 pt-6 pb-5 border-b border-white/10 flex items-center gap-3">
        <img src="/brand/pnk-mark-192.png" alt="" className="w-10 h-10 rounded-xl bg-white shrink-0" />
        <div className="min-w-0">
          <div className="text-[10.5px] font-extrabold tracking-[0.18em] text-blue-200/70">INTRANET</div>
          <div className="text-[15px] font-black truncate">PnK PROJECT</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 no-scrollbar">
        {groups.map((g) => (
          <div key={g.label || "top"}>
            {g.label && <div className="px-3 mb-1.5 text-[11px] font-bold text-blue-200/75">{g.label}</div>}
            <div className="space-y-1">
              {g.items.map((it) => {
                const b = it.badge ? badges[it.badge] : 0;
                return (
                  <NavLink key={it.to} to={it.to} end={it.to === "/"}
                    className={({ isActive }) => cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold transition",
                      isActive ? "bg-white text-navy shadow-[0_6px_16px_rgba(0,0,0,0.18)]" : "text-blue-50/80 hover:bg-white/[0.08] hover:text-white")}>
                    {({ isActive }) => (<>
                      <Icon name={it.icon} size={18} className={isActive ? "text-navy" : "text-blue-200/80"} />
                      <span className="flex-1 text-left truncate">{it.label}</span>
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
            <div className="text-[11px] text-blue-200/75 truncate">{ROLE_LABEL[me.member?.role] || "직원"}{me.member?.dept ? ` · ${me.member.dept}` : ""}</div>
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
      <header className="md:hidden sticky top-0 z-30 h-14 px-4 flex items-center gap-3 text-white" style={{ background: "#1B2B4B" }}>
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
      <main className="flex-1 min-w-0 md:h-full md:overflow-y-auto px-4 md:px-7 py-5 md:py-6">
        <div className="w-full max-w-[1600px] mx-auto">{children}</div>
      </main>
    </div>
  );
}

// ───────────────────────── 로그인 ─────────────────────────
function AuthFrame({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(160deg, #14213D 0%, #1B2B4B 50%, #2D4C82 100%)" }}>
      <div className="w-full max-w-[400px] bg-white rounded-[26px] shadow-2xl p-7">
        <div className="flex flex-col items-center mb-6">
          <img src="/brand/pnk-logo-600.png" alt="PnK PROJECT" className="w-28" />
          <div className="mt-3 text-[12px] font-extrabold tracking-[0.2em] text-[#7A8AA8]">사내 인트라넷</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Login() {
  const [email, setEmail] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setMsg("");
    try { await signInWithEmailAndPassword(auth, email.trim(), pw); } catch (er) {
      setMsg(["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(er.code) ? "이메일 또는 비밀번호가 맞지 않습니다." : errMsg(er));
    } finally { setBusy(false); }
  };
  const reset = async () => {
    if (!email.trim()) { setMsg("이메일을 먼저 입력해 주세요."); return; }
    try { await sendPasswordResetEmail(auth, email.trim()); setMsg("비밀번호 재설정 메일을 보냈습니다."); } catch (er) { setMsg(errMsg(er)); }
  };
  return (
    <AuthFrame>
      <form onSubmit={go} className="space-y-3">
        <Field label="이메일"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="로지스웹 계정 이메일" /></Field>
        <Field label="비밀번호"><Input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        {msg && <div className="text-[12.5px] font-semibold text-rose-600">{msg}</div>}
        <Btn type="submit" disabled={busy} className="w-full h-11 text-[14px]">{busy ? "로그인 중…" : "로그인"}</Btn>
        <button type="button" onClick={reset} className="w-full text-[12.5px] font-semibold text-[#7A8AA8] hover:text-navy">비밀번호를 잊으셨나요?</button>
      </form>
      <p className="mt-5 text-[12px] leading-relaxed text-[#7A8AA8] text-center">로지스웹과 같은 계정으로 로그인합니다.<br />처음이면 로그인 후 [가입 요청]을 보내고 관리자 승인을 기다려 주세요.</p>
    </AuthFrame>
  );
}

// 로그인했지만 아직 구성원이 아닌 계정 — 가입 요청 / 승인 대기 / 사용 중지
function JoinGate({ me }) {
  const [f, setF] = React.useState({ name: "", dept: "", title: "", phone: "" });
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const st = me.member?.status;
  const send = async () => {
    if (!f.name.trim()) { setMsg("이름을 입력해 주세요."); return; }
    setBusy(true); setMsg("");
    try { await requestJoin(me.user, f); } catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <AuthFrame>
      {st === "pending" ? (
        <div className="text-center">
          <div className="text-[16px] font-black text-navy-950">가입 요청을 보냈습니다</div>
          <p className="mt-2 text-[13px] text-[#5A6A86]">관리자가 승인하면 바로 들어갈 수 있습니다.<br />({me.user.email})</p>
        </div>
      ) : st === "off" ? (
        <div className="text-center">
          <div className="text-[16px] font-black text-navy-950">사용이 중지된 계정입니다</div>
          <p className="mt-2 text-[13px] text-[#5A6A86]">관리자에게 문의해 주세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-[15px] font-black text-navy-950">PnK PROJECT 구성원 가입 요청</div>
          <p className="text-[12.5px] text-[#5A6A86]">{me.user.email} 계정으로 요청합니다.</p>
          <Field label="이름 *"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="부서"><Select custom value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })} options={DEPT_ORDER} placeholder="선택 · 직접 입력" /></Field>
            <Field label="직책"><Select custom value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} options={TITLES} placeholder="선택 · 직접 입력" /></Field>
          </div>
          <Field label="연락처"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="010-0000-0000" /></Field>
          {msg && <div className="text-[12.5px] font-semibold text-rose-600">{msg}</div>}
          <Btn onClick={send} disabled={busy} className="w-full h-11">가입 요청 보내기</Btn>
        </div>
      )}
      <button type="button" onClick={() => signOut(auth)} className="mt-4 w-full text-[12.5px] font-semibold text-[#7A8AA8] hover:text-navy">다른 계정으로 로그인</button>
    </AuthFrame>
  );
}
