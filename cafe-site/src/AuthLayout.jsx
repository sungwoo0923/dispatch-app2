// ======================= cafe-site/src/AuthLayout.jsx =======================
// 로그인·회원가입 공용 화면 — 왼쪽: 서비스 소개(검색에도 읽히는 글), 오른쪽: 입력 카드. 휴대폰에서는 소개가 위로 접힌다.
// ⭐ 2026-11-06 로지스웹 허브 리디자인 — 로지스웹 디자인 언어(네이비 + #8FB0F0), 운송사 간 오더 거래 소개
import React from "react";
import { MARKET_NAME, MARKET_NAME_EN, MARKET_TAGLINE } from "./cafeConstants";
import { GRID_BG, Logo, Icon } from "./ui";

const FEATURES = [
  ["swap", "운송사끼리 오더 거래", "남는 오더는 올리고, 필요한 오더는 [이 오더 잡기]로 요청합니다."],
  ["eyeoff", "매칭 전 정보 보호", "매칭 전에는 시·구와 운임만. 주소·연락처는 수락된 운송사에게만."],
  ["link", "배차 프로그램 자동 연동", "수락되면 받은 운송사 로지스웹에 오더가 자동 등록됩니다."],
  ["live", "진행 상황 자동 반영", "배차완료·운송완료가 올린 운송사 원래 오더에 그대로 반영됩니다."],
];
// 화면 장식용 예시 행(실제 오더 아님)
const SAMPLE = [["인천 서구", "평택시", "11톤 윙바디", "모집중"], ["화성시", "부산 강서구", "5톤 카고", "매칭완료"], ["김포시", "대전 유성구", "1톤 탑", "운송완료"]];

export default function AuthLayout({ title, sub, children, footer }) {
  return (
    <div className="min-h-screen bg-[#F2F4F8] flex">
      <aside className="hidden lg:flex w-[54%] max-w-[800px] relative overflow-hidden text-white flex-col justify-between p-12" style={GRID_BG}>
        <div className="absolute -right-24 -top-24 w-[460px] h-[460px] rounded-full bg-[#4B6CB7]/25 blur-3xl pointer-events-none" />
        <Logo dark size={46} />
        <div className="relative">
          <div className="text-[14px] font-semibold text-[#8FB0F0]">{MARKET_NAME_EN}</div>
          <h1 className="text-[40px] font-extrabold leading-[1.25] tracking-[-0.02em] mt-2">운송사의 남는 오더가<br />다른 운송사의 매출이 되는 곳</h1>
          <p className="text-[16px] text-white/65 mt-4 leading-relaxed max-w-[500px]">{MARKET_TAGLINE}. 로지스웹 운송사 계정으로 바로 로그인하세요.</p>
          <div className="grid grid-cols-2 gap-3 mt-8 max-w-[600px]">
            {FEATURES.map(([ic, t, d]) => (
              <div key={t} className="rounded-2xl bg-white/[0.06] ring-1 ring-inset ring-white/10 p-4">
                <span className="w-10 h-10 rounded-xl bg-white/10 text-[#8FB0F0] flex items-center justify-center"><Icon name={ic} size={18} /></span>
                <div className="text-[15px] font-extrabold mt-3">{t}</div>
                <div className="text-[14px] text-white/60 mt-1 leading-relaxed">{d}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 max-w-[600px] rounded-2xl bg-[#0B1428]/60 ring-1 ring-inset ring-white/10 overflow-hidden">
            <div className="px-4 py-2.5 flex items-center gap-2 border-b border-white/10">
              <span className="w-2 h-2 rounded-full bg-[#8FB0F0] animate-pulse" /><span className="text-[13px] font-semibold text-[#8FB0F0]">실시간 보드 · 화면 예시</span>
            </div>
            {SAMPLE.map(([a, b, v, s]) => (
              <div key={a} className="px-4 py-3 flex items-center gap-3 text-[14px] border-b border-white/[0.06] last:border-0">
                <span className="font-bold">{a}</span><Icon name="arrow" size={13} className="text-white/40" /><span className="font-bold">{b}</span>
                <span className="text-white/50">{v}</span>
                <span className={`ml-auto text-[13px] font-bold px-2.5 h-7 inline-flex items-center rounded-full ${s === "운송완료" ? "bg-white text-[#0F1A30]" : s === "매칭완료" ? "bg-[#8FB0F0] text-[#0F1A30]" : "ring-1 ring-inset ring-white/25 text-white/85"}`}>{s}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="text-[13px] text-white/40">© {MARKET_NAME} · 로지스웹 운송사 오더 거래소</div>
      </aside>

      <main className="flex-1 flex flex-col">
        <div className="lg:hidden px-5 pt-7 pb-9 text-white" style={GRID_BG}>
          <Logo dark size={40} />
          <div className="text-[24px] font-extrabold leading-snug mt-6">운송사의 남는 오더가<br />다른 운송사의 매출이 되는 곳</div>
          <div className="text-[14px] text-white/65 mt-2">{MARKET_TAGLINE}</div>
        </div>
        <div className="flex-1 flex items-center justify-center px-4 py-8 lg:py-12 -mt-5 lg:mt-0">
          <div className="w-full max-w-[460px]">
            <div className="bg-white rounded-[24px] shadow-[0_24px_60px_rgba(15,26,48,.12)] ring-1 ring-inset ring-[#E2E7EF] p-6 sm:p-9">
              {sub && <div className="text-[14px] font-semibold text-[#2D4C82]">{sub}</div>}
              <h2 className="text-[26px] font-extrabold text-[#0F1A30] mt-1 mb-6">{title}</h2>
              {children}
            </div>
            {footer && <div className="mt-5 text-center">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
