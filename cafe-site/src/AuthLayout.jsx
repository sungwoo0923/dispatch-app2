// ======================= cafe-site/src/AuthLayout.jsx =======================
// 로그인·회원가입 공용 화면(2026-10-28 리디자인) — 왼쪽: 서비스 소개(네이버 등 검색에도 읽히는 글),
// 오른쪽: 입력 카드. 휴대폰에서는 소개가 위로 접혀 올라간다.
import React from "react";
import { GRID_BG, Logo, Icon, MONO } from "./ui";

const FEATURES = [
  ["live", "실시간 오더 공유", "운송사·화주·차주가 올린 오더가 모든 회원 화면에 즉시 뜹니다."],
  ["bolt", "10초 배차 확정", "배차신청 후 10초 안에는 취소할 수 있고, 지나면 자동으로 확정됩니다."],
  ["shield", "연락처 보호", "배차가 확정된 당사자끼리만 연락처가 공개됩니다."],
  ["truck", "차종·지역 검색", "윙바디·카고·냉동탑 등 차종과 상·하차 지역으로 바로 찾습니다."],
];

// 화면 장식용 예시 행(실제 오더 아님)
const SAMPLE = [
  ["인천 서구", "평택 포승", "11톤 윙", "대기중"],
  ["화성 향남", "부산 강서", "5톤 카고", "신청중"],
  ["김포 고촌", "대전 유성", "1톤 탑", "배차완료"],
];

export default function AuthLayout({ title, en, children, footer }) {
  return (
    <div className="min-h-screen bg-[#EEF1F6] flex">
      {/* 소개 */}
      <aside className="hidden lg:flex w-[52%] max-w-[760px] relative overflow-hidden text-white flex-col justify-between p-12" style={GRID_BG}>
        <div className="absolute -right-24 -top-24 w-[420px] h-[420px] rounded-full bg-[#4B6CB7]/20 blur-3xl pointer-events-none" />
        <Logo dark size={44} />
        <div className="relative">
          <div className="text-[11.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>FREIGHT ORDER EXCHANGE</div>
          <h1 className="text-[40px] font-black leading-[1.25] tracking-tight mt-3">
            전국 화물 오더가<br />실시간으로 모이는 곳
          </h1>
          <p className="text-[15.5px] text-white/65 mt-4 leading-relaxed max-w-[460px]">
            남는 오더는 올리고, 필요한 오더는 바로 배차신청하세요.<br />운송사·화주·차주가 함께 쓰는 화물 배차 정보 공유 플랫폼입니다.
          </p>
          <div className="grid grid-cols-2 gap-3 mt-8 max-w-[560px]">
            {FEATURES.map(([ic, t, d]) => (
              <div key={t} className="rounded-2xl bg-white/[0.06] ring-1 ring-white/10 p-4">
                <span className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"><Icon name={ic} size={17} /></span>
                <div className="text-[14.5px] font-black mt-2.5">{t}</div>
                <div className="text-[12.5px] text-white/55 mt-1 leading-relaxed">{d}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 max-w-[560px] rounded-2xl bg-[#0B1428]/60 ring-1 ring-white/10 overflow-hidden">
            <div className="px-4 py-2.5 flex items-center gap-2 border-b border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[#CFE0FF] animate-pulse" />
              <span className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>LIVE BOARD · 화면 예시</span>
            </div>
            {SAMPLE.map(([a, b, v, s]) => (
              <div key={a} className="px-4 py-2.5 flex items-center gap-3 text-[13px] border-b border-white/[0.06] last:border-0">
                <span className="font-bold">{a}</span><Icon name="arrow" size={13} className="text-white/40" /><span className="font-bold">{b}</span>
                <span className="text-white/45 text-[12px]">{v}</span>
                <span className={`ml-auto text-[11px] font-black px-2 py-0.5 rounded-md ${s === "배차완료" ? "bg-white text-[#0F1A30]" : "ring-1 ring-white/25 text-white/80"}`}>{s}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="text-[12px] text-white/35">© 배차마당 · 화물 배차 정보 공유 플랫폼</div>
      </aside>

      {/* 입력 */}
      <main className="flex-1 flex flex-col">
        <div className="lg:hidden px-5 pt-6 pb-8 text-white" style={GRID_BG}>
          <Logo dark size={38} />
          <div className="text-[22px] font-black leading-snug mt-5">전국 화물 오더가<br />실시간으로 모이는 곳</div>
          <div className="text-[13px] text-white/60 mt-1.5">운송사·화주·차주가 함께 쓰는 배차 정보 공유 플랫폼</div>
        </div>
        <div className="flex-1 flex items-center justify-center px-5 py-8 lg:py-12 -mt-4 lg:mt-0">
          <div className="w-full max-w-[440px]">
            <div className="bg-white rounded-[24px] shadow-[0_24px_60px_rgba(15,26,48,0.12)] border border-[#E3E8F0] p-7 sm:p-9">
              <div className="text-[11px] font-extrabold tracking-[0.26em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>{en}</div>
              <h2 className="text-[26px] font-black text-[#0F1A30] mt-1 mb-6">{title}</h2>
              {children}
            </div>
            {footer && <div className="mt-5 text-center">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
