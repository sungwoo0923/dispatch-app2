// ======================= src/SignupWelcomeCard.jsx =======================
// 🎉 2026-11-22 가입 완료 카드 — 가입 신청이 승인된 뒤 처음 로그인할 때 한 번 뜬다(운송사 로그인 src/TransportLogin.jsx).
//  비밀번호가 맞은 사람에게만 보이고, 회사코드를 크게 보여 주고 [복사] · [직원 초대 안내 복사] · [이 코드로 로그인]을 준다.
//  한 번 로그인하면 users/{uid}.welcomeSeenAt 이 생겨 다음부터는 뜨지 않는다.
import React, { useState } from "react";
import { MARKET_URL, MARKET_NAME } from "./orderMarketConfig";

const SIGNUP_URL = "https://app.logisweb.co.kr/signup";

export default function SignupWelcomeCard({ info, onContinue, onClose }) {
  const [copied, setCopied] = useState("");
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(""), 1800); } catch { setCopied("fail"); }
  };
  const invite = [
    `[로지스웹] ${info.companyName} 직원 가입 안내`,
    `1) ${SIGNUP_URL} 에서 [기존 회사 추가 가입]을 눌러요`,
    `2) 회사명에 "${info.companyName}"을 검색해서 골라요`,
    `3) 회사 관리자가 승인하면 아래 회사코드로 로그인해요`,
    `회사코드: ${info.companyCode}`,
  ].join("\n");
  const steps = [
    ["직원 초대", "같은 회사로 [기존 회사 추가 가입]을 하면 돼요. 아래 안내를 복사해서 보내 주세요."],
    ["기사 등록", "기사관리에서 기사를 등록하면 기사앱으로 오더가 바로 가요."],
    [`${MARKET_NAME}`, `같은 계정으로 ${MARKET_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")} 에 로그인해 전국 운송사와 오더를 주고받아요.`],
  ];
  return (
    <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center bg-[#0B1428]/60 backdrop-blur-[2px] p-0 sm:p-6" data-welcome-card>
      <div className="w-full sm:max-w-[440px] bg-white rounded-t-[26px] sm:rounded-[26px] overflow-hidden shadow-[0_30px_80px_rgba(11,20,40,.45)]">
        <div className="px-6 pt-6 pb-5 text-white" style={{ background: "radial-gradient(120% 140% at 90% -20%, #2D4C82 0%, #1B2B4B 45%, #0F1A30 80%, #0B1428 100%)" }}>
          <div className="w-12 h-12 rounded-2xl bg-white/10 grid place-items-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8FB0F0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>
          </div>
          <div className="mt-4 text-[13px] font-extrabold tracking-[0.14em] text-[#8FB0F0]">WELCOME</div>
          <div className="text-[24px] font-black leading-tight mt-1">가입이 승인됐어요</div>
          <div className="text-[14px] text-white/65 mt-1.5">{info.name ? `${info.name}님, ` : ""}{info.companyName}에서 로지스웹을 바로 쓸 수 있어요.</div>
        </div>
        <div className="px-6 py-5">
          <div className="text-[12px] font-extrabold tracking-[0.12em] text-[#7A879C]">회사코드</div>
          <div className="mt-1.5 flex items-center gap-2 rounded-2xl bg-[#F5F7FB] border border-[#E3E8F0] px-4 h-[64px]">
            <span className="flex-1 text-[28px] font-black text-[#0F1A30] tracking-[0.18em] tabular-nums" data-welcome-code>{info.companyCode}</span>
            <button type="button" onClick={() => copy(info.companyCode, "code")} className="h-10 px-3.5 rounded-xl bg-white border border-[#DCE3EE] text-[13px] font-extrabold text-[#1B2B4B] hover:bg-[#EEF3FC]">{copied === "code" ? "복사됨" : "복사"}</button>
          </div>
          <div className="text-[12.5px] text-[#7A879C] mt-1.5">로그인할 때마다 넣는 코드예요. 이 기기에는 자동으로 저장해 둘게요.</div>

          <ol className="mt-5 space-y-3">
            {steps.map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-[#0F1A30] text-white text-[12px] font-black grid place-items-center shrink-0">{i + 1}</span>
                <span className="min-w-0"><span className="block text-[14px] font-extrabold text-[#0F1A30]">{t}</span><span className="block text-[12.5px] text-[#55657F] leading-snug">{d}</span></span>
              </li>
            ))}
          </ol>

          <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
            <button type="button" onClick={() => copy(invite, "invite")} className="h-[50px] px-4 rounded-[14px] bg-[#EEF3FC] text-[13.5px] font-extrabold text-[#1B2B4B] hover:brightness-95" data-welcome-invite>{copied === "invite" ? "복사됨" : "직원 초대 안내 복사"}</button>
            <button type="button" onClick={onContinue} className="h-[50px] rounded-[14px] text-white text-[15px] font-black" style={{ background: "linear-gradient(120deg,#0F1A30,#1B2B4B 55%,#2D4C82)" }} data-welcome-continue>이 코드로 로그인</button>
          </div>
          <button type="button" onClick={onClose} className="w-full mt-2 h-10 text-[12.5px] font-bold text-[#9AA9C3] hover:text-[#0F1A30]">닫기</button>
        </div>
      </div>
    </div>
  );
}
