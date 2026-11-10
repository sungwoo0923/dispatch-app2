// ======================= src/driver/DriverPcGate.jsx =======================
// 🖥 2026-11-10 차주(기사) 로그인 · 가입은 휴대폰에서만 — PC 브라우저로 /driver-login · /driver-register 에 오면 안내만 보인다
//  · 휴대폰(안드로이드 기사앱 · 모바일 브라우저 · 아이폰)은 그대로
//  · 사무실에서 화면을 미리 볼 일이 있으면 주소 끝에 ?pc=1
import React from "react";
import { isDesktopBrowser } from "./driverAppContext";
import { LogisMark } from "../brand";

export default function DriverPcGate({ children }) {
  const bypass = (() => { try { return new URLSearchParams(window.location.search).get("pc") === "1"; } catch { return false; } })();
  if (!isDesktopBrowser() || bypass) return children;
  return (
    <div className="min-h-screen flex items-center justify-center p-5 text-white" data-kp="driver-pc-gate"
      style={{ background: "radial-gradient(900px 420px at 80% -10%, rgba(110,149,232,.28), transparent 60%), linear-gradient(135deg,#060C1A 0%,#0F1A30 50%,#1B2B4B 100%)", fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕',sans-serif" }}>
      <div className="w-full max-w-[460px] rounded-[26px] bg-white/[0.05] ring-1 ring-white/10 p-7 text-center shadow-[0_30px_80px_rgba(0,0,0,.45)]">
        <div className="flex justify-center"><LogisMark size={52} /></div>
        <div className="mt-4 text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]">DRIVER · MOBILE ONLY</div>
        <h1 className="mt-1.5 text-[22px] font-black">차주(기사) 로그인은 휴대폰에서 해요</h1>
        <p className="mt-2 text-[14px] text-white/65 leading-relaxed">기사앱은 위치 · 알림을 휴대폰에서 써야 해서<br />PC에서는 로그인할 수 없어요.</p>
        <div className="mt-6 grid gap-2.5">
          <a href="/driver-guide" className="h-12 rounded-2xl bg-white text-[#0F1A30] text-[15px] font-black flex items-center justify-center">기사앱 설치 안내 보기</a>
          <a href="/login" className="h-12 rounded-2xl bg-white/[0.08] ring-1 ring-white/15 text-[14.5px] font-black flex items-center justify-center hover:bg-white/[0.14]">운송사 · 화주사 로그인으로</a>
        </div>
      </div>
    </div>
  );
}
