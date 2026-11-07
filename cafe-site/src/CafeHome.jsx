// ======================= cafe-site/src/CafeHome.jsx =======================
// ⭐ 2026-11-06 로지스웹 허브 — 마켓 첫 화면 머리(관제형 히어로): 지금 모집중인 오더 · 오늘 상차 · 긴급 · 오늘 매칭
//  + 거래 방법 3단계 안내 + 인기 노선. 아래 목록은 CafeApp이 그린다.
import React, { useMemo } from "react";
import { MARKET_NAME, MARKET_NAME_EN, MARKET_TAGLINE, pickRegion, isV2 } from "./cafeConstants";
import { GRID_BG, Icon, DarkStat, btnPrimary } from "./ui";

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const msOf = (ts) => (ts?.toMillis ? ts.toMillis() : 0);

export default function CafeHome({ orders, profile, onNewOrder, onPickRoute }) {
  const s = useMemo(() => {
    const today = ymd(new Date());
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const open = orders.filter((o) => o.status === "open");
    const routes = new Map();
    open.forEach((o) => {
      const a = pickRegion(o, "상차").sido; const b = pickRegion(o, "하차").sido;
      if (!a || !b) return;
      const k = `${a}|${b}`;
      routes.set(k, (routes.get(k) || 0) + 1);
    });
    return {
      open: open.length,
      today: open.filter((o) => o.상차일 === today).length,
      urgent: open.filter((o) => o.긴급).length,
      matchedToday: orders.filter((o) => isV2(o) && msOf(o.matchedAt) >= dayStart.getTime()).length,
      companies: new Set(orders.map((o) => o.companyName).filter(Boolean)).size,
      topRoutes: [...routes.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4),
    };
  }, [orders]);

  return (
    <section className="relative overflow-hidden rounded-[24px] text-white shadow-[0_24px_60px_rgba(11,20,40,.28)]" style={GRID_BG}>
      <div className="absolute -right-24 -top-28 w-[440px] h-[440px] rounded-full bg-[#4B6CB7]/25 blur-3xl pointer-events-none" />
      <div className="relative p-4 sm:p-7 lg:p-8 grid lg:grid-cols-[1.1fr_1fr] gap-4 sm:gap-6 lg:gap-10 items-center">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-white/[0.08] ring-1 ring-inset ring-white/15 text-[13px] font-semibold text-[#CFE0FF]">
            <span className="w-2 h-2 rounded-full bg-[#8FB0F0] animate-pulse" />실시간 · {MARKET_NAME_EN}
          </div>
          <h1 className="mt-3 text-[22px] sm:text-[34px] font-extrabold leading-[1.25] tracking-[-0.02em]">
            남는 오더는 넘기고,<br className="sm:hidden" /> 필요한 오더는 바로 잡는다.
          </h1>
          <p className="hidden sm:block mt-2.5 text-[16px] text-white/65 leading-relaxed max-w-[560px]">
            {MARKET_TAGLINE}. 수락되는 순간 정확한 주소·연락처가 열리고, 오더가 귀사 로지스웹 배차 프로그램에 자동으로 들어갑니다.
          </p>
          <div className="hidden sm:flex mt-5 flex-wrap gap-2.5">
            {profile.isCompany && (
              <button type="button" onClick={onNewOrder} className={`${btnPrimary} !bg-white !text-[#0F1A30] !shadow-[0_10px_30px_rgba(0,0,0,.3)]`} style={{ background: "#fff" }}>
                <Icon name="plus" size={17} />오더 올리기
              </button>
            )}
            <div className="flex items-center gap-3 text-[14px] text-white/70">
              {[["1", "올리기"], ["2", "잡기 요청 · 수락"], ["3", "내 프로그램에서 배차"]].map(([n, t], i) => (
                <span key={n} className="inline-flex items-center gap-1.5">
                  {i > 0 && <Icon name="arrow" size={13} className="text-white/35" />}
                  <span className="w-6 h-6 rounded-md bg-white/10 text-[13px] font-bold flex items-center justify-center">{n}</span>
                  <span className="hidden sm:inline">{t}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <div className="grid grid-cols-4 lg:grid-cols-2 gap-2 sm:gap-2.5">
            <DarkStat label="모집중" value={s.open} unit="건" hint={`참여 운송사 ${s.companies}곳`} />
            <DarkStat label="오늘 상차" value={s.today} unit="건" />
            <DarkStat label="긴급" value={s.urgent} unit="건" />
            <DarkStat label="오늘 매칭" value={s.matchedToday} unit="건" />
          </div>
          {s.topRoutes.length > 0 && (
            <div className="hidden sm:block mt-2.5 rounded-2xl bg-[#0B1428]/50 ring-1 ring-inset ring-white/10 px-4 py-3">
              <div className="text-[13px] font-semibold text-white/55 mb-1.5">많이 올라온 노선</div>
              <div className="flex flex-wrap gap-1.5">
                {s.topRoutes.map(([k, n]) => {
                  const [a, b] = k.split("|");
                  return (
                    <button key={k} type="button" onClick={() => onPickRoute?.(a, b)} className="h-9 px-3 rounded-xl bg-white/[0.08] hover:bg-white/15 text-[14px] font-bold inline-flex items-center gap-1.5 transition">
                      {a}<Icon name="arrow" size={12} className="text-[#8FB0F0]" />{b}<span className="text-[#8FB0F0]">{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
