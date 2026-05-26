// ======================= src/Login.jsx (Homepage) =======================
import React from "react";
import { Link } from "react-router-dom";

const features = [
  { title: "배차 관리", desc: "실시간 배차 등록 및 현황 관리" },
  { title: "차주 관리", desc: "차주 정보 및 운행 현황 통합 관리" },
  { title: "운임 정산", desc: "청구운임 및 기사운임 자동 정산" },
  { title: "거래처 관리", desc: "화주사 및 거래처 통합 관리" },
];

export default function Login() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* ── 배경 비디오 (공개 폴더 /videos/bg-truck.mp4 에 영상 파일을 업로드하면 표시됨) ── */}
      <video
        className="absolute inset-0 w-full h-full object-cover"
        src="/videos/bg-truck.mp4"
        autoPlay
        loop
        muted
        playsInline
      />
      {/* 비디오 위 어두운 오버레이 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(6,24,50,0.88) 0%, rgba(11,37,84,0.82) 50%, rgba(13,43,102,0.88) 100%)",
        }}
      />

      {/* ── 콘텐츠 레이어 ── */}
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* Fixed Nav */}
        <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 bg-[#061832]/70 backdrop-blur-md border-b border-white/10">
          <div className="flex items-center gap-2">
            <img src="/icons/sflow-icon.png" alt="KP-Flow" className="w-7 h-7 rounded-md" />
            <span className="font-bold text-white text-sm tracking-tight">KP-Flow Logistics</span>
          </div>
          <div className="flex items-center gap-1">
            <Link to="/transport-login" className="px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all">
              운송사 로그인
            </Link>
            <Link to="/driver-login" className="px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all">
              차주 로그인
            </Link>
            <Link to="/shipper-login" className="px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all">
              화주사 로그인
            </Link>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="flex flex-col items-center justify-center flex-1 px-4 pt-20 pb-10 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 bg-white/10 border border-white/20 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">물류 관리 플랫폼</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-5 max-w-3xl">
            더 스마트한<br />
            <span className="text-blue-300">물류 관리</span>
          </h1>

          {/* Subtitle */}
          <p className="text-white/60 text-base sm:text-lg mb-10 leading-relaxed max-w-xl">
            배차 관리부터 차주 관리, 운임 정산까지<br />
            KP-Flow 하나로 물류 업무를 최적화하세요.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-row items-center justify-center gap-3 mb-16 flex-wrap">
            <Link
              to="/transport-login"
              className="bg-white text-[#1B2B4B] font-bold rounded-xl px-6 py-3 text-sm hover:bg-blue-50 transition-all shadow-lg whitespace-nowrap"
            >
              운송사 시작하기
            </Link>
            <Link
              to="/driver-login"
              className="bg-white/10 text-white border border-white/25 rounded-xl px-6 py-3 text-sm hover:bg-white/20 transition-all backdrop-blur-sm whitespace-nowrap"
            >
              차주 시작하기
            </Link>
            <Link
              to="/shipper-login"
              className="bg-white/10 text-white border border-white/25 rounded-xl px-6 py-3 text-sm hover:bg-white/20 transition-all backdrop-blur-sm whitespace-nowrap"
            >
              화주사 시작하기
            </Link>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl w-full">
            {features.map((f) => (
              <div
                key={f.title}
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
          <p className="text-xs text-white/20">© 2025 KP-Flow Logistics. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}
