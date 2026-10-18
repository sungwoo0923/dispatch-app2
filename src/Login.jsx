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

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0F1A30] text-white select-none" style={{ fontFamily }}>
      {/* 배경 — 관리자가 올린 영상 > 이미지 > 기본 네이비 */}
      {c.backgroundVideoUrl ? (
        <video key={c.backgroundVideoUrl} className="absolute inset-0 w-full h-full object-cover" src={c.backgroundVideoUrl} autoPlay loop muted playsInline preload="auto" />
      ) : c.backgroundImageUrl ? (
        <img className="absolute inset-0 w-full h-full object-cover" src={c.backgroundImageUrl} alt="" />
      ) : null}
      <div className="absolute inset-0" style={{ background: overlayBackground }} />
      <style>{`
        @keyframes kpLoginIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        @keyframes kpLoginTruck { 0% { transform: translateX(-40px) } 100% { transform: translateX(calc(100% + 40px)) } }
        @keyframes kpLoginFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1.5px) } }
      `}</style>

      <div className="relative z-10 min-h-screen flex flex-col items-center px-5" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
        <div className="w-full max-w-[420px] flex flex-col flex-1">
          {/* 로고 */}
          <div className="flex flex-col items-center" style={{ animation: "kpLoginIn 0.5s ease both" }}>
            <img src="/icons/sflow-icon.png" alt="KP-Flow" className="w-16 h-16 sm:w-20 sm:h-20 rounded-[18px] sm:rounded-[22px] shadow-[0_10px_28px_rgba(0,0,0,0.35)] ring-1 ring-white/15" />
            <h1 className="mt-3.5 text-[26px] sm:text-[30px] font-black tracking-tight">KP-Flow</h1>
            <p className="mt-1 text-[13px] font-semibold tracking-[0.18em] text-blue-200/65">배차관리 시스템</p>
          </div>

          {/* 트럭이 지나가는 길 */}
          <div className="relative h-7 mt-7 mb-7 mx-1 overflow-hidden" aria-hidden="true">
            <div className="absolute left-0 right-0 bottom-1 h-[2px]" style={{ backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.28) 50%, transparent 50%)", backgroundSize: "12px 2px" }} />
            <div className="absolute bottom-1 left-0 w-full" style={{ animation: "kpLoginTruck 7s linear infinite", willChange: "transform" }}>
              <svg width="32" height="23" viewBox="0 0 30 22" style={{ display: "block", animation: "kpLoginFloat 0.5s ease-in-out infinite" }}>
                <rect x="1" y="3" width="17" height="12" rx="2" fill="#E8EEF9" />
                <path d="M18 7h5.5l4 4.5V15H18z" fill="#93C5FD" />
                <rect x="20" y="8.3" width="3.2" height="2.6" rx="0.6" fill="#1B2B4B" />
                <circle cx="7" cy="17" r="2.6" fill="#0F1A30" stroke="#E8EEF9" strokeWidth="1.3" />
                <circle cx="22.5" cy="17" r="2.6" fill="#0F1A30" stroke="#E8EEF9" strokeWidth="1.3" />
              </svg>
            </div>
          </div>

          {/* 계정 선택 */}
          <p className="text-[14px] font-bold text-blue-100/80 mb-3 px-1">어떤 계정으로 들어가시나요?</p>
          <div className="flex flex-col gap-3">
            {ROLES.map((r, i) => {
              const main = r.key === lastRole;
              return (
                <Link
                  key={r.key}
                  to={r.to}
                  onClick={() => remember(r.key)}
                  className={`group flex items-center gap-3.5 rounded-[18px] px-4 py-4 sm:py-[18px] transition-transform active:scale-[0.98] ${
                    main
                      ? "bg-white text-[#1B2B4B] shadow-[0_12px_30px_rgba(0,0,0,0.3)]"
                      : "bg-white/[0.07] ring-1 ring-white/10 hover:bg-white/[0.11]"
                  }`}
                  style={{ animation: `kpLoginIn 0.5s ease ${0.08 + i * 0.06}s both` }}
                >
                  <div className={`w-12 h-12 shrink-0 rounded-[14px] flex items-center justify-center ${main ? "bg-[#EEF3FB]" : "bg-blue-400/[0.18]"}`}>
                    {r.icon(main ? "#1B2B4B" : "#93C5FD")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="text-[17px] font-extrabold">{r.title}</span>
                      {main && hasHistory && <span className="text-[10.5px] font-extrabold text-blue-600 bg-blue-100 rounded-full px-2 py-0.5">최근 로그인</span>}
                    </div>
                    <div className={`mt-0.5 text-[12.5px] truncate ${main ? "text-gray-500" : "text-blue-100/60"}`}>{r.desc}</div>
                  </div>
                  <svg className={`shrink-0 transition-transform group-hover:translate-x-0.5 ${main ? "text-[#1B2B4B]/50" : "text-white/40"}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                </Link>
              );
            })}
          </div>

          {/* 회원가입 — 계정 종류별 한 줄 */}
          <div className="mt-auto pt-10 text-center">
            <p className="text-[13px] text-blue-100/55">처음 오셨나요? 회원가입</p>
            <div className="mt-2 flex items-center justify-center gap-1 text-[13px] font-bold">
              {ROLES.map((r, i) => (
                <React.Fragment key={r.key}>
                  {i > 0 && <span className="text-white/20 px-1">·</span>}
                  <Link to={r.signup} onClick={() => remember(r.key)} className="text-blue-300 hover:text-blue-200 px-1 py-1">{r.title.replace(" (기사)", "")}</Link>
                </React.Fragment>
              ))}
            </div>
            <p className="mt-6 text-[11px] text-white/25">{c.footerText || DEFAULT_FOOTER}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
