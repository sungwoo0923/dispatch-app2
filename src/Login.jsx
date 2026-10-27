// ======================= src/Login.jsx (로그인 선택 화면) =======================
// ⭐ 리디자인 — 예전엔 상단 로그인 링크 3개와 가운데 "○○ 시작하기" 버튼 3개가 같은 곳으로 가는 중복이 있었고,
// 홍보용 카드 4개(배차 관리 등)까지 있어 복잡했다. 로딩 화면과 같은 KP-Flow 디자인으로 통일하고,
// "누가 어떤 걸 누르면 되는지" 바로 보이게 큰 선택 카드 3개로 정리했다.
//  - 마지막에 쓴 계정 종류를 기억해 맨 위 카드처럼 강조(흰색 + "최근 로그인")
//  - 회원가입은 맨 아래 한 줄로(계정 종류별)
//  - 배경 영상/이미지·글꼴·하단 문구는 지금처럼 관리자메뉴 > 랜딩페이지 편집 값을 그대로 쓴다
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db, doc, onSnapshot } from "./firebase";
import KpTruck3D from "./KpTruck3D";

const DEFAULT_FOOTER = "© 2025 KP-Flow Logistics. All rights reserved.";
const FONT_FAMILY_MAP = {
  noto: "'Noto Sans KR', sans-serif",
  nanum: "'Nanum Gothic', sans-serif",
  gothicA1: "'Gothic A1', sans-serif",
};
const LAST_ROLE_KEY = "lastLoginRole";

function hexToRgba(hex, alpha) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return `rgba(11,37,84,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// 계정 종류 — 로그인·가입 경로와 한 줄 설명
const ROLES = [
  {
    key: "transport",
    title: "운송사",
    desc: "배차 등록 · 현황 · 정산 관리",
    to: "/transport-login",
    signup: "/signup",
    icon: (c) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 14h3M8 17h6" />
      </svg>
    ),
  },
  {
    key: "driver",
    title: "차주 (기사)",
    desc: "운행 확인 · 인수증·서류 업로드",
    to: "/driver-login",
    signup: "/driver-register",
    icon: (c) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="6" width="13" height="10" rx="1.5" /><path d="M14 9h4l3 3.5V16h-7z" /><circle cx="5.5" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" />
      </svg>
    ),
  },
  {
    key: "shipper",
    title: "화주사",
    desc: "오더 요청 · 배차 현황 확인",
    to: "/shipper-login",
    signup: "/shipper-signup",
    icon: (c) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21V8l6-4 6 4v13" /><path d="M15 21V11h6v10M7 12h4M7 16h4" />
      </svg>
    ),
  },
];

export default function Login() {
  // siteConfig/landing — 관리자메뉴 > 랜딩페이지 편집 값(배경·글꼴·하단 문구)을 실시간으로 반영
  const [config, setConfig] = useState(null);
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "siteConfig", "landing"),
      (snap) => setConfig(snap.exists() ? snap.data() || {} : {}),
      () => setConfig({}) // 읽기 실패해도(비로그인 등) 기본값으로 그냥 진행
    );
    return () => unsub();
  }, []);
  const c = config || {};

  // 마지막에 고른 계정 종류(이 기기 기준)
  const [lastRole] = useState(() => { try { return localStorage.getItem(LAST_ROLE_KEY) || "transport"; } catch { return "transport"; } });
  const remember = (key) => { try { localStorage.setItem(LAST_ROLE_KEY, key); } catch { /* 무시 */ } };
  const hasHistory = (() => { try { return !!localStorage.getItem(LAST_ROLE_KEY); } catch { return false; } })();

  const hasMedia = !!(c.backgroundVideoUrl || c.backgroundImageUrl);
  const overlayBackground = c.overlayColor
    ? hexToRgba(c.overlayColor, (c.overlayOpacity ?? 82) / 100)
    : hasMedia
      ? "linear-gradient(180deg, rgba(15,26,48,0.55) 0%, rgba(15,26,48,0.85) 100%)"
      : "radial-gradient(120% 70% at 50% 0%, #2A3F6B 0%, #1B2B4B 45%, #0F1A30 100%)";
  const fontFamily = FONT_FAMILY_MAP[c.fontFamily] || FONT_FAMILY_MAP.noto;

  // 디지털 시계(초 단위)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const pad = (n) => String(n).padStart(2, "0");
  const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#060D1C] text-white select-none" style={{ fontFamily }}>
      {/* 배경 — 관리자가 올린 영상 > 이미지 > 기본(디지털 격자) */}
      {c.backgroundVideoUrl ? (
        <video key={c.backgroundVideoUrl} className="absolute inset-0 w-full h-full object-cover" src={c.backgroundVideoUrl} autoPlay loop muted playsInline preload="auto" />
      ) : c.backgroundImageUrl ? (
        <img className="absolute inset-0 w-full h-full object-cover" src={c.backgroundImageUrl} alt="" />
      ) : null}
      <div className="absolute inset-0" style={{ background: hasMedia || c.overlayColor ? overlayBackground : "radial-gradient(90% 60% at 50% 0%, #22396A 0%, #0F1A30 55%, #060D1C 100%)" }} />
      {/* 원근 격자 바닥 */}
      <div className="absolute inset-x-0 bottom-0 h-[55%] pointer-events-none overflow-hidden" style={{ perspective: "520px" }} aria-hidden="true">
        <div className="absolute inset-x-[-50%] top-0 h-[200%] kp-grid-floor" style={{
          backgroundImage: "linear-gradient(rgba(143,176,240,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(143,176,240,0.16) 1px, transparent 1px)",
          backgroundSize: "56px 56px", transform: "rotateX(62deg)", transformOrigin: "50% 0",
          maskImage: "linear-gradient(180deg, transparent 0%, #000 35%, #000 100%)", WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 35%, #000 100%)",
        }} />
      </div>
      <style>{`
        @keyframes kpLoginIn { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
        @keyframes kpRoad { from { transform: translateX(0) } to { transform: translateX(-40px) } }
        @keyframes kpGrid { from { background-position: 0 0 } to { background-position: 0 56px } }
        @keyframes kpBlink { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
        @keyframes kpPacket { 0% { transform: translateX(0); opacity: 0 } 15% { opacity: 1 } 85% { opacity: 1 } 100% { transform: translateX(var(--d)); opacity: 0 } }
        .kp-grid-floor { animation: kpGrid 2.4s linear infinite; }
        .kp-blink { animation: kpBlink 1.6s ease-in-out infinite; }
      `}</style>

      <div className="relative z-10 min-h-screen flex flex-col px-5 lg:px-12" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 28px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
        {/* 맨 위 — 브랜드 + 상태 */}
        <div className="w-full max-w-[1120px] mx-auto flex items-center justify-between gap-3" style={{ animation: "kpLoginIn .5s ease both" }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/icons/sflow-icon.png" alt="KP-Flow" className="w-9 h-9 rounded-[11px] ring-1 ring-white/20 shrink-0" />
            <div className="min-w-0 leading-tight">
              <div className="text-[15px] font-black tracking-[0.2em] whitespace-nowrap" style={{ fontFamily: MONO }}>KP-FLOW</div>
              <div className="hidden sm:block text-[9.5px] font-bold tracking-[0.28em] text-white/40 whitespace-nowrap">LOGISTICS DISPATCH SYSTEM</div>
            </div>
          </div>
          <div className="flex items-center gap-2 h-8 px-3 rounded-full bg-white/[0.06] ring-1 ring-white/10 text-[11px] font-bold tabular-nums whitespace-nowrap shrink-0" style={{ fontFamily: MONO }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#8FB0F0] kp-blink" />
            <span className="text-white/50 hidden sm:inline">ONLINE</span>
            <span>{pad(now.getHours())}:{pad(now.getMinutes())}<span className="text-white/40">:{pad(now.getSeconds())}</span></span>
          </div>
        </div>

        <div className="flex-1 w-full max-w-[1120px] mx-auto grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-16 items-center py-8">
          {/* 왼쪽(PC) / 위(모바일) — 3D 트럭 히어로 */}
          <div className="min-w-0 flex flex-col items-center lg:items-start" style={{ animation: "kpLoginIn .55s ease .05s both" }}>
            <div className="hidden lg:block text-[11.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>REAL-TIME DISPATCH</div>
            <h1 className="hidden lg:block mt-3 text-[44px] font-black leading-[1.15] tracking-tight">배차의 모든 순간을<br />하나의 흐름으로.</h1>
            <p className="hidden lg:block mt-3 text-[15px] text-white/50 leading-relaxed">오더 등록부터 배차 · 정산 · 마감까지<br />운송 업무를 한 화면에서.</p>

            {/* 도로 + 트럭 */}
            <div className="relative w-full max-w-[460px] h-[120px] lg:h-[150px] mt-2 lg:mt-10 overflow-hidden" aria-hidden="true">
              <div className="absolute left-0 right-0 bottom-[22px] h-[2px] overflow-hidden rounded-full">
                <div className="absolute inset-y-0 left-0" style={{ width: "calc(100% + 40px)", backgroundImage: "linear-gradient(90deg, rgba(207,224,255,0.55) 50%, transparent 50%)", backgroundSize: "40px 2px", animation: "kpRoad .5s linear infinite" }} />
              </div>
              <div className="absolute left-0 right-0 bottom-[14px] h-[18px] rounded-full" style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(110,149,232,0.35), transparent 70%)" }} />
              {[0, 1, 2].map((k) => (
                <span key={k} className="absolute bottom-[21px] left-0 w-1.5 h-1.5 rounded-full bg-[#CFE0FF]" style={{ "--d": "460px", animation: `kpPacket 2.4s linear ${k * 0.8}s infinite`, boxShadow: "0 0 8px #8FB0F0" }} />
              ))}
              <div className="absolute left-1/2 -translate-x-1/2 bottom-[16px] lg:bottom-[14px]">
                <KpTruck3D width={typeof window !== "undefined" && window.innerWidth >= 1024 ? 220 : 170} />
              </div>
            </div>
            <div className="lg:hidden mt-1 text-center">
              <div className="text-[22px] font-black tracking-tight">KP-Flow</div>
              <div className="text-[11px] font-bold tracking-[0.28em] text-white/45 mt-0.5">배차관리 시스템</div>
            </div>
          </div>

          {/* 계정 선택 */}
          <div className="min-w-0 w-full max-w-[440px] mx-auto lg:mx-0 lg:justify-self-end">
            <div className="flex items-end justify-between mb-3 px-1" style={{ animation: "kpLoginIn .5s ease .1s both" }}>
              <div>
                <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>SELECT ACCOUNT</div>
                <div className="mt-1 text-[16px] font-black">어떤 계정으로 들어가시나요?</div>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              {ROLES.map((r, i) => {
                const main = r.key === lastRole;
                return (
                  <Link key={r.key} to={r.to} onClick={() => remember(r.key)}
                    className={`group relative flex items-center gap-3.5 rounded-[18px] px-4 py-3.5 transition active:scale-[0.985] overflow-hidden ${
                      main ? "bg-white text-[#0F1A30] shadow-[0_16px_36px_rgba(0,0,0,0.35)]" : "bg-white/[0.05] ring-1 ring-white/10 hover:bg-white/[0.09] hover:ring-white/20"}`}
                    style={{ animation: `kpLoginIn .5s ease ${0.14 + i * 0.06}s both` }}>
                    <span className={`text-[11px] font-black tabular-nums w-5 shrink-0 ${main ? "text-[#9AA9C3]" : "text-white/30"}`} style={{ fontFamily: MONO }}>{pad(i + 1)}</span>
                    <div className={`w-11 h-11 shrink-0 rounded-[13px] flex items-center justify-center ${main ? "bg-gradient-to-br from-[#0F1A30] to-[#2D4C82]" : "bg-white/[0.08] ring-1 ring-white/10"}`}>
                      {r.icon(main ? "#FFFFFF" : "#CFE0FF")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 whitespace-nowrap min-w-0">
                        <span className="text-[16.5px] font-black truncate">{r.title}</span>
                        {main && hasHistory && <span className="text-[10px] font-extrabold text-white bg-[#1B2B4B] rounded-full px-2 py-0.5 shrink-0">최근</span>}
                      </div>
                      <div className={`mt-0.5 text-[12.5px] truncate whitespace-nowrap ${main ? "text-[#7A879C]" : "text-white/50"}`}>{r.desc}</div>
                    </div>
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition group-hover:translate-x-0.5 ${main ? "bg-[#0F1A30] text-white" : "bg-white/[0.06] text-white/60"}`}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                    </span>
                  </Link>
                );
              })}
            </div>

            {/* 회원가입 — 계정 종류별 */}
            <div className="mt-5 flex items-center justify-between gap-2 rounded-[16px] max-[340px]:flex-col max-[340px]:items-stretch bg-white/[0.04] ring-1 ring-white/10 px-4 py-3" style={{ animation: "kpLoginIn .5s ease .32s both" }}>
              <span className="text-[12.5px] font-bold text-white/55 whitespace-nowrap">회원가입</span>
              <div className="flex items-center justify-end gap-1 text-[12.5px] font-black whitespace-nowrap max-[340px]:justify-between">
                {ROLES.map((r) => (
                  <Link key={r.key} to={r.signup} onClick={() => remember(r.key)} className="px-2.5 h-7 inline-flex items-center rounded-full bg-white/[0.07] hover:bg-white/[0.14] text-white transition">{r.title.replace(" (기사)", "")}</Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-[10.5px] font-bold tracking-[0.12em] text-white/25">{c.footerText || DEFAULT_FOOTER}</p>
      </div>
    </div>
  );
}
