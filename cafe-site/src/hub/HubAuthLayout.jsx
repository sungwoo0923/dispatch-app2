// ======================= cafe-site/src/hub/HubAuthLayout.jsx =======================
// ⭐ 2026-11-06 허브 로그인 · 가입 공용 화면 — PC: 왼쪽 소개 + 오른쪽 입력 카드 / 휴대폰: 위 짧은 소개 + 카드
import React from "react";
import { HI, HubMark, NAVY_BG, HUB_CSS } from "./hubUi";

const FEATURES = [
  ["bolt", "실시간 콜", "새 오더가 올라오면 바로 울리고 읽어 줘요."],
  ["clock", "10초 취소", "배차신청 후 10초 안에는 취소, 그 뒤엔 확정."],
  ["shield", "서류 인증", "사업자, 자격증, 보험을 확인한 회원만."],
  ["lock", "정보 보호", "상세주소, 연락처는 배차 확정 후에만."],
];
const SAMPLE = [["경기 화성시", "부산 강서구", "11톤 윙", "68만"], ["인천 서구", "충남 천안시", "5톤 카고", "32만"], ["서울 송파구", "대전 유성구", "1톤 탑", "21만"]];

export default function HubAuthLayout({ title, sub, children, footer, wide = false }) {
  return (
    <div className="min-h-screen bg-[#EEF1F6] flex">
      <style>{HUB_CSS}</style>
      <aside className="hidden lg:flex w-[46%] max-w-[720px] relative overflow-hidden text-white flex-col justify-between p-12 sticky top-0 h-screen" style={NAVY_BG}>
        <div className="absolute -right-32 -top-32 w-[480px] h-[480px] rounded-full bg-[#4B6CB7]/25 blur-3xl pointer-events-none" />
        <HubMark size={44} />
        <div className="relative">
          <div className="text-[15px] font-bold text-[#8FB0F0]">LogisWeb Hub, Freight Call</div>
          <h1 className="text-[42px] font-extrabold leading-[1.22] tracking-[-0.03em] mt-2">화주, 운송사, 차주를<br />한 화면에서 잇는 화물 콜</h1>
          <p className="text-[16.5px] text-white/65 mt-4 leading-relaxed max-w-[520px]">오더를 올리면 차주에게 바로 떠요. 로지스웹 계정은 가입 없이 쓸 수 있어요.</p>
          <div className="grid grid-cols-2 gap-3 mt-8 max-w-[560px]">
            {FEATURES.map(([ic, t, d]) => (
              <div key={t} className="rounded-2xl bg-white/[0.06] ring-1 ring-inset ring-white/10 p-4">
                <span className="w-10 h-10 rounded-xl bg-white/10 text-[#8FB0F0] flex items-center justify-center"><HI name={ic} size={19} /></span>
                <div className="text-[16px] font-extrabold mt-3">{t}</div>
                <div className="text-[14.5px] text-white/60 mt-1 leading-relaxed">{d}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 max-w-[560px] rounded-2xl bg-[#0B1428]/60 ring-1 ring-inset ring-white/10 overflow-hidden">
            <div className="px-4 py-2.5 flex items-center gap-2 border-b border-white/10"><span className="w-2 h-2 rounded-full bg-[#8FB0F0] animate-pulse" /><span className="text-[13.5px] font-bold text-[#8FB0F0]">실시간 콜, 화면 예시</span></div>
            {SAMPLE.map(([a, b, v, f]) => (
              <div key={a} className="px-4 py-3 flex items-center gap-3 text-[15px] border-b border-white/[0.06] last:border-0">
                <span className="font-bold">{a}</span><HI name="arrow" size={14} className="text-white/40" /><span className="font-bold">{b}</span>
                <span className="text-white/50">{v}</span>
                <span className="ml-auto font-extrabold text-[#8FB0F0]">{f}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="text-[13.5px] text-white/40">© 로지스웹 허브, LogisWeb Hub</div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        <div className="lg:hidden px-5 pt-[max(24px,env(safe-area-inset-top))] pb-10 text-white" style={NAVY_BG}>
          <HubMark size={40} />
          <div className="text-[25px] font-extrabold leading-snug mt-6 tracking-[-0.02em]">화물 콜, 더 빠르고<br />더 안전하게</div>
          <div className="text-[15px] text-white/65 mt-2">인증 회원, 10초 취소, 배차 후 정보 공개</div>
        </div>
        <div className="flex-1 flex items-start lg:items-center justify-center px-4 py-6 lg:py-12 -mt-6 lg:mt-0">
          <div className={`w-full ${wide ? "max-w-[640px]" : "max-w-[480px]"}`}>
            <div className="bg-white rounded-[26px] shadow-[0_24px_60px_rgba(15,26,48,.12)] ring-1 ring-inset ring-[#E2E7EF] p-5 sm:p-8">
              {sub && <div className="text-[15px] font-bold text-[#2D4C82]">{sub}</div>}
              {title && <h2 className="text-[26px] font-extrabold text-[#0F1A30] mt-0.5 mb-5 tracking-[-0.02em]">{title}</h2>}
              {children}
            </div>
            {footer && <div className="mt-5 text-center">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
