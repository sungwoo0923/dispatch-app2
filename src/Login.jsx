// ======================= src/Login.jsx (Landing Page) =======================
import React from "react";
import { Link } from "react-router-dom";

const cards = [
  {
    title: "운송사",
    subtitle: "배차 관리 시스템 / 관리자·직원 전용",
    loginTo: "/transport-login",
    loginLabel: "운송사 로그인",
    signupTo: "/signup",
    signupLabel: "운송사 회원가입",
  },
  {
    title: "기사",
    subtitle: "차주·드라이버 / 운행 관리 전용",
    loginTo: "/driver-login",
    loginLabel: "기사 로그인",
    signupTo: "/driver-register",
    signupLabel: "기사 등록",
  },
  {
    title: "화주",
    subtitle: "화물 발주사 / 화주사 전용",
    loginTo: "/shipper-login",
    loginLabel: "화주 로그인",
    signupTo: "/shipper-signup",
    signupLabel: "화주 회원가입",
  },
];

export default function Login() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10 relative"
      style={{ background: "linear-gradient(135deg, #061832 0%, #0B2554 50%, #0D2B66 100%)" }}
    >
      {/* Top-right app icon */}
      <div className="fixed top-4 right-4 z-50">
        <img
          src="/icons/sflow-icon.png"
          alt="S-Flow"
          className="w-20 h-20 rounded-2xl shadow-lg"
        />
      </div>

      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          S-Flow Logistics
        </h1>
        <p className="text-blue-200 text-base mt-2">이용 유형을 선택해주세요</p>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-2xl overflow-hidden shadow-xl border border-white/10"
          >
            {/* Card header */}
            <div
              className="px-6 py-5 text-center"
              style={{ background: "#1B2B4B" }}
            >
              <h2 className="text-xl font-bold text-white">{card.title}</h2>
              <p className="text-blue-200 text-xs mt-1 leading-relaxed">{card.subtitle}</p>
            </div>

            {/* Card body */}
            <div
              className="px-6 py-6 flex flex-col gap-3"
              style={{ background: "#ffffff" }}
            >
              <Link
                to={card.loginTo}
                className="block w-full text-center text-white font-semibold py-2.5 rounded-lg transition-opacity hover:opacity-90"
                style={{ background: "#1B2B4B" }}
              >
                {card.loginLabel}
              </Link>
              <Link
                to={card.signupTo}
                className="block w-full text-center font-semibold py-2.5 rounded-lg border transition-colors hover:bg-gray-50"
                style={{ color: "#1B2B4B", borderColor: "#1B2B4B" }}
              >
                {card.signupLabel}
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <p className="text-blue-300/50 text-xs mt-12 text-center">
        S-Flow Logistics Management System
      </p>
    </div>
  );
}
