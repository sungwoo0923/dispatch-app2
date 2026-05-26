// ======================= src/Login.jsx (Homepage) =======================
import React from "react";
import { Link } from "react-router-dom";

const features = [
  { title: "배차 관리", desc: "실시간 배차 등록 및 현황 관리" },
  { title: "기사 관리", desc: "차주 정보 및 운행 현황" },
  { title: "운임 정산", desc: "청구운임 및 기사운임 정산" },
  { title: "거래처 관리", desc: "화주사 및 거래처 통합 관리" },
];

export default function Login() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#061832] via-[#0B2554] to-[#0D2B66]">
      {/* Fixed Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 bg-[#061832]/80 backdrop-blur border-b border-white/10">
        <div className="flex items-center gap-2">
          <img src="/icons/sflow-icon.png" alt="S-Flow" className="w-7 h-7 rounded-md" />
          <span className="font-bold text-white text-sm">S-Flow Logistics</span>
        </div>
        <div className="flex items-center gap-1">
          <Link to="/transport-login" className="px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            운송사 로그인
          </Link>
          <Link to="/driver-login" className="px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            기사 로그인
          </Link>
          <Link to="/shipper-login" className="px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            화주 로그인
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center min-h-screen px-4 pt-14 text-center">
        {/* Badge */}
        <span className="inline-block mb-6 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/70 bg-white/10 border border-white/20 rounded-full">
          물류 관리 플랫폼
        </span>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight mb-4">
          더 스마트한 물류 관리
        </h1>

        {/* Subtitle */}
        <p className="text-white/60 text-base sm:text-lg mb-10 leading-relaxed">
          배차 관리부터 기사 관리, 운임 정산까지<br />
          S-Flow 하나로 물류 업무를 최적화하세요.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-row items-center justify-center gap-3 mb-16">
          <Link
            to="/transport-login"
            className="bg-white text-[#1B2B4B] font-bold rounded-xl px-6 py-3 text-sm hover:bg-white/90 transition-colors"
          >
            운송사 시작하기
          </Link>
          <Link
            to="/driver-login"
            className="bg-white/10 text-white border border-white/20 rounded-xl px-6 py-3 text-sm hover:bg-white/20 transition-colors"
          >
            기사 로그인
          </Link>
          <Link
            to="/shipper-login"
            className="bg-white/10 text-white border border-white/20 rounded-xl px-6 py-3 text-sm hover:bg-white/20 transition-colors"
          >
            화주 포털
          </Link>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl w-full mt-0">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-white/5 border border-white/10 rounded-xl p-5 text-left"
            >
              <p className="text-white font-bold text-sm">{f.title}</p>
              <p className="text-white/40 text-xs mt-1">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Bottom Links */}
        <div className="flex items-center gap-4 mt-8 text-xs text-white/30">
          <Link to="/signup" className="hover:text-white/60 transition-colors">운송사 회원가입</Link>
          <span>·</span>
          <Link to="/driver-register" className="hover:text-white/60 transition-colors">기사 등록</Link>
          <span>·</span>
          <Link to="/shipper-signup" className="hover:text-white/60 transition-colors">화주 회원가입</Link>
        </div>
      </section>
    </div>
  );
}
