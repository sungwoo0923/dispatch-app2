// ======================= src/Login.jsx (Homepage) =======================
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db, doc, onSnapshot } from "./firebase";

// ⭐ 아래 DEFAULT_* 값들은 최고관리자가 관리자메뉴 > 랜딩페이지 편집에서 아무것도
// 안 건드렸을 때 그대로 쓰이는 기존 화면 그대로다 — siteConfig/landing 문서가
// 없거나 특정 필드가 비어있으면 이 값으로 자동 대체된다(onSnapshot 실시간 반영이라
// 편집하면 바로 화면에 뜬다, 새로고침 필요 없음).
const DEFAULT_BADGE = "물류 관리 플랫폼";
const DEFAULT_HEADLINE_1 = "더 스마트한";
const DEFAULT_HEADLINE_2 = "물류 관리";
const DEFAULT_ACCENT_COLOR = "#93c5fd"; // tailwind text-blue-300
const DEFAULT_TEXT_COLOR = "#ffffff";
const DEFAULT_SUBTITLE_1 = "배차 관리부터 차주 관리, 운임 정산까지";
const DEFAULT_SUBTITLE_2 = "KP-Flow 하나로 물류 업무를 최적화하세요.";
const DEFAULT_CTA_TRANSPORT = "운송사 시작하기";
const DEFAULT_CTA_DRIVER = "차주 시작하기";
const DEFAULT_CTA_SHIPPER = "화주사 시작하기";
const DEFAULT_FOOTER = "© 2025 KP-Flow Logistics. All rights reserved.";
const DEFAULT_FEATURES = [
  { title: "배차 관리", desc: "실시간 배차 등록 및 현황 관리" },
  { title: "차주 관리", desc: "차주 정보 및 운행 현황 통합 관리" },
  { title: "운임 정산", desc: "청구운임 및 기사운임 자동 정산" },
  { title: "거래처 관리", desc: "화주사 및 거래처 통합 관리" },
];
const DEFAULT_OVERLAY_GRADIENT =
  "linear-gradient(135deg, rgba(6,24,50,0.88) 0%, rgba(11,37,84,0.82) 50%, rgba(13,43,102,0.88) 100%)";
const FONT_FAMILY_MAP = {
  noto: "'Noto Sans KR', sans-serif",
  nanum: "'Nanum Gothic', sans-serif",
  gothicA1: "'Gothic A1', sans-serif",
};

function hexToRgba(hex, alpha) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return `rgba(11,37,84,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function Login() {
  // ⭐ siteConfig/landing 문서를 실시간 구독한다 — 최고관리자가 관리자메뉴에서
  // 저장하면 이 화면(로그인 전, 누구나 보는 화면)에 새로고침 없이 바로 반영된다.
  // Firestore 규칙(firestore.rules)에서 이 문서의 get은 로그인 여부와 무관하게
  // 누구나 허용, write만 최고관리자로 제한해뒀다.
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

  const backgroundImageUrl = c.backgroundImageUrl || "";
  const overlayBackground = c.overlayColor
    ? `linear-gradient(135deg, ${hexToRgba(c.overlayColor, (c.overlayOpacity ?? 82) / 100)} 0%, ${hexToRgba(c.overlayColor, (c.overlayOpacity ?? 82) / 100)} 100%)`
    : DEFAULT_OVERLAY_GRADIENT;
  const fontFamily = FONT_FAMILY_MAP[c.fontFamily] || FONT_FAMILY_MAP.noto;
  const textColor = c.textColor || DEFAULT_TEXT_COLOR;
  const accentColor = c.accentColor || DEFAULT_ACCENT_COLOR;
  const features = Array.isArray(c.features) && c.features.length === 4 ? c.features : DEFAULT_FEATURES;

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ fontFamily }}>
      {/* ── 배경: 최고관리자가 이미지를 올렸으면 이미지, 아니면 기존 영상(공개 폴더
          /videos/bg-truck.mp4)을 그대로 쓴다 ── */}
      {backgroundImageUrl ? (
        <img
          className="absolute inset-0 w-full h-full object-cover"
          src={backgroundImageUrl}
          alt=""
        />
      ) : (
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src="/videos/bg-truck.mp4"
          autoPlay
          loop
          muted
          playsInline
        />
      )}
      {/* 배경 위 어두운 오버레이 */}
      <div className="absolute inset-0" style={{ background: overlayBackground }} />

      {/* ── 콘텐츠 레이어 ── */}
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* Fixed Nav */}
        {/* ⭐ 로그인 링크 3개가 좁은 화면(작은 아이폰 등)에서 줄바꿈되던 문제 —
            모바일 기준(px-2 py-1.5 text-xs)으로 작게 시작해서 화면이 커질수록
            sm:/lg: 브레이크포인트에서 원래 크기로 커지도록 반응형으로 바꿨다.
            flex-nowrap + overflow-x-auto를 같이 둬서, 그래도 안 들어가는 극단적으로
            좁은 화면에서는 줄바꿈 대신 가로 스크롤로 빠지게 안전장치를 뒀다
            (로고 글자는 요청대로 줄바꿈 허용 — truncate 안 함). */}
        <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-2 px-3 sm:px-6 py-3 bg-[#061832]/70 backdrop-blur-md border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <img src="/icons/sflow-icon.png" alt="KP-Flow" className="w-6 h-6 sm:w-7 sm:h-7 rounded-md shrink-0" />
            <span className="font-bold text-white text-xs sm:text-sm tracking-tight">KP-Flow Logistics</span>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1 flex-nowrap overflow-x-auto no-scrollbar shrink-0">
            <Link to="/transport-login" className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm whitespace-nowrap text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all">
              운송사 로그인
            </Link>
            <Link to="/driver-login" className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm whitespace-nowrap text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all">
              차주 로그인
            </Link>
            <Link to="/shipper-login" className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm whitespace-nowrap text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all">
              화주사 로그인
            </Link>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="flex flex-col items-center justify-center flex-1 px-4 pt-20 pb-10 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 bg-white/10 border border-white/20 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">{c.badgeText || DEFAULT_BADGE}</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-5 max-w-3xl" style={{ color: textColor }}>
            {c.headlineLine1 || DEFAULT_HEADLINE_1}<br />
            <span style={{ color: accentColor }}>{c.headlineLine2 || DEFAULT_HEADLINE_2}</span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg mb-10 leading-relaxed max-w-xl" style={{ color: textColor, opacity: 0.6 }}>
            {c.subtitleLine1 || DEFAULT_SUBTITLE_1}<br />
            {c.subtitleLine2 || DEFAULT_SUBTITLE_2}
          </p>

          {/* CTA Buttons */}
          {/* ⭐ 좁은 화면에서 버튼 3개가 줄바꿈되던 문제 — flex-wrap을 없애고
              (flex-nowrap) 모바일 기준 작은 패딩/글자로 시작해서 sm:에서
              원래 크기로 커지게 반응형으로 바꿨다. 그래도 안 들어가면
              줄바꿈 대신 가로 스크롤로 빠진다(overflow-x-auto). */}
          <div className="flex flex-row flex-nowrap items-center justify-center gap-2 sm:gap-3 mb-16 overflow-x-auto no-scrollbar max-w-full px-2">
            <Link
              to="/transport-login"
              className="bg-white text-[#1B2B4B] font-bold rounded-xl px-3.5 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm hover:bg-blue-50 transition-all shadow-lg whitespace-nowrap shrink-0"
            >
              {c.ctaTransportLabel || DEFAULT_CTA_TRANSPORT}
            </Link>
            <Link
              to="/driver-login"
              className="bg-white/10 text-white border border-white/25 rounded-xl px-3.5 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm hover:bg-white/20 transition-all backdrop-blur-sm whitespace-nowrap shrink-0"
            >
              {c.ctaDriverLabel || DEFAULT_CTA_DRIVER}
            </Link>
            <Link
              to="/shipper-login"
              className="bg-white/10 text-white border border-white/25 rounded-xl px-3.5 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm hover:bg-white/20 transition-all backdrop-blur-sm whitespace-nowrap shrink-0"
            >
              {c.ctaShipperLabel || DEFAULT_CTA_SHIPPER}
            </Link>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl w-full">
            {features.map((f, i) => (
              <div
                key={i}
                className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-5 text-left transition-all backdrop-blur-sm"
              >
                <p className="text-white font-bold text-sm">{f.title}</p>
                <p className="text-white/40 text-xs mt-1 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="py-4 text-center">
          <p className="text-xs text-white/20">{c.footerText || DEFAULT_FOOTER}</p>
        </footer>
      </div>
    </div>
  );
}
