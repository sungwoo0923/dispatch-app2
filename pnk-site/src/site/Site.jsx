// ======================= pnk-site/src/site/Site.jsx =======================
// 🏡 PnK PROJECT 공식 홈페이지(2026-11-18) — 로그인하지 않은 누구나 보는 회사 소개 화면
//  · 주소: /  /about  /business  /services  /contact   (직원 로그인은 오른쪽 위 [로그인] → /login → 인트라넷 /intranet)
//  · 인트라넷(App.jsx)과 따로 불러온다 — 이 화면은 Firebase 를 처음부터 불러오지 않는다(문의 보낼 때만)
//  · 예전 인트라넷 주소(/mail · /tasks …)로 들어오면 /intranet/… 로 넘긴다
import React from "react";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import "./site.css";
import { Home, About, Business, Services, Contact } from "./SitePages";
import { Arrow, useReveal } from "./parts";

export const NAV = [
  { to: "/about", label: "회사소개", en: "About" },
  { to: "/business", label: "사업분야", en: "Business" },
  { to: "/services", label: "서비스", en: "Services" },
  { to: "/contact", label: "문의하기", en: "Contact" },
];
const OLD_INTRANET = ["/notice", "/board", "/mail", "/tasks", "/calendar", "/sales", "/finance", "/company", "/files", "/members", "/customers", "/approvals", "/attendance", "/leave"];

export default function Site() {
  return (
    <BrowserRouter>
      <Frame>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/business" element={<Business />} />
          <Route path="/services" element={<Services />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={<Fallback />} />
        </Routes>
      </Frame>
    </BrowserRouter>
  );
}

function Fallback() {
  const { pathname } = useLocation();
  if (OLD_INTRANET.some((p) => pathname === p || pathname.startsWith(`${p}/`))) { window.location.replace(`/intranet${pathname}`); return null; }
  return <Navigate to="/" replace />;
}

// ───────────── 틀: 위쪽 메뉴 · 아래쪽 정보 ─────────────
function Frame({ children }) {
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const overHero = pathname === "/" || pathname === "/about"; // 큰 사진 위에서는 흰 글자
  React.useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  React.useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);
  React.useEffect(() => {
    const t = NAV.find((n) => n.to === pathname)?.label;
    document.title = t ? `${t} · PnK PROJECT` : "PnK PROJECT · 상상을 설계하고, 가치를 완성합니다";
  }, [pathname]);
  React.useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [open]);
  useReveal();

  const solid = scrolled || !overHero || open;
  return (
    <div className="pk">
      <header className={`pk-head ${solid ? "solid" : "over"}`}>
        <div className="wrap h-[68px] md:h-[84px] flex items-center gap-6">
          <Link to="/" className="flex items-center gap-3 shrink-0" aria-label="PnK PROJECT 홈">
            <img src="/brand/pnk-mark-192.png" alt="" className="w-9 h-9 md:w-10 md:h-10 rounded-[10px] bg-white object-contain" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,.06)" }} />
            <span className="leading-tight">
              <span className="block text-[16px] md:text-[17px] font-extrabold tracking-[-0.2px]">PnK PROJECT</span>
              <span className="eng block text-[10.5px] opacity-75" style={{ letterSpacing: "0.22em" }}>Imagine · Complete</span>
            </span>
          </Link>
          <nav className="pk-nav hidden lg:flex items-center gap-10 mx-auto">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? "on" : "")}>{n.label}</NavLink>)}
          </nav>
          <div className="ml-auto lg:ml-0 flex items-center gap-2">
            <span className="hidden md:block"><Link to="/contact" className="btn btn-sm btn-line">프로젝트 문의</Link></span>
            <a href="/login" className={`btn btn-sm ${solid ? "btn-dark" : "btn-light"}`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
              로그인
            </a>
            <button type="button" onClick={() => setOpen((v) => !v)} className="lg:hidden w-11 h-11 -mr-2 flex items-center justify-center" aria-label={open ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={open}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 8h16M4 16h16" />}
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* 휴대폰 · 태블릿 전체 메뉴 */}
      <div className={`lg:hidden fixed inset-0 z-40 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`} style={{ background: "var(--ivory)" }} aria-hidden={!open}>
        <div className="wrap pt-[100px] pb-10 h-full flex flex-col">
          <nav className="flex flex-col">
            {[{ to: "/", label: "홈", en: "Home" }, ...NAV].map((n, i) => (
              <NavLink key={n.to} to={n.to} end className="flex items-baseline justify-between py-5" style={{ borderBottom: "1px solid var(--line)" }} tabIndex={open ? 0 : -1}>
                {({ isActive }) => (<>
                  <span className="serif text-[26px] font-semibold" style={{ color: isActive ? "var(--oak)" : "var(--ink)" }}>{n.label}</span>
                  <span className="eng text-[12px]" style={{ color: "var(--mute)" }}>{String(i + 1).padStart(2, "0")} · {n.en}</span>
                </>)}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto grid grid-cols-2 gap-3">
            <Link to="/contact" className="btn btn-line" tabIndex={open ? 0 : -1}>프로젝트 문의</Link>
            <a href="/login" className="btn btn-dark" tabIndex={open ? 0 : -1}>직원 로그인</a>
          </div>
        </div>
      </div>

      <main>{children}</main>

      <footer style={{ background: "var(--cream)", borderTop: "1px solid var(--line)" }}>
        <div className="wrap py-14 md:py-16 grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <img src="/brand/pnk-mark-192.png" alt="" className="w-11 h-11 rounded-xl bg-white object-contain" />
              <div className="text-[18px] font-extrabold">PnK PROJECT</div>
            </div>
            <p className="serif mt-5 text-[19px] leading-[1.6]">상상을 설계하고,<br />가치를 완성합니다.</p>
            <p className="mt-3 text-[13.5px] leading-[1.8]" style={{ color: "var(--mute)" }}>현장의 일을 프로그램으로 바꾸는<br />소프트웨어 개발 회사</p>
          </div>
          <FootCol title="회사" items={[["/about", "회사소개"], ["/business", "사업분야"], ["/contact", "문의하기"]]} />
          <FootCol title="서비스" items={[["https://www.logisweb.co.kr", "로지스웹"], ["https://hub.logisweb.co.kr", "로지스웹 허브"], ["/services", "요양 · 돌봄 서비스"], ["/business", "맞춤 웹 · 앱 개발"]]} />
          <FootCol title="바로가기" items={[["https://app.logisweb.co.kr", "로지스웹 프로그램 열기"], ["/login", "직원 로그인 (인트라넷)"]]} />
        </div>
        <div className="wrap"><div className="rule" /></div>
        <div className="wrap py-6 flex flex-col md:flex-row gap-2 md:items-center justify-between text-[12.5px]" style={{ color: "var(--mute)" }}>
          <span>© {new Date().getFullYear()} PnK PROJECT. All rights reserved.</span>
          <span className="eng" style={{ letterSpacing: "0.2em" }}>Imagine · Design · Complete</span>
        </div>
      </footer>
    </div>
  );
}

function FootCol({ title, items }) {
  return (
    <div>
      <div className="text-[13px] font-bold" style={{ color: "var(--oak-d)" }}>{title}</div>
      <ul className="mt-4 space-y-3">
        {items.map(([to, label]) => (
          <li key={label} className="text-[14.5px]">
            {/^https?:|^\/login/.test(to)
              ? <a href={to} {...(to.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="hover:underline underline-offset-4">{label}</a>
              : <Link to={to} className="hover:underline underline-offset-4">{label}</Link>}
          </li>
        ))}
      </ul>
    </div>
  );
}
