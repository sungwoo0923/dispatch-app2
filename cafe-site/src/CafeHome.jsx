// ======================= cafe-site/src/CafeHome.jsx =======================
// 배차마당 홈 — 처음 들어온 사람이 "여기는 여러 사람이 올린 오더가 모이는 곳이고,
// 내가 오더를 올리거나 남의 오더에 배차신청을 할 수 있구나"를 바로 알 수 있게
// 서비스 소개 + 이용방법 + 실시간 요약(방금 올라온 오더/긴급/인기 노선/차종별)으로 구성한다.
// ⭐ 2026-10-28 리디자인 — 관제형 히어로(격자 네이비) + 숫자 타일 + 라이브 보드
import React, { useMemo } from "react";
import { VEHICLE_TYPES } from "./cafeConstants";
import { GRID_BG, MONO, Icon, DarkStat, Panel, Tag, timeAgo, region } from "./ui";

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const STEPS = [
  ["plus", "오더 올리기", "상·하차지, 화물, 차량, 운임을 입력하면 모든 회원에게 실시간으로 공유됩니다."],
  ["live", "실시간 현황 확인", "다른 운송사·화주가 올린 오더를 지역·차종별로 찾아봅니다."],
  ["bolt", "배차신청", "원하는 오더에 배차신청! 신청 후 10초 안에는 취소할 수 있습니다."],
  ["phone", "배차확정 · 연락", "확정되면 서로의 연락처가 공개되어 바로 전화·문자로 진행합니다."],
];

function MiniRow({ o, onClick }) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left flex items-center gap-4 px-5 py-3.5 border-b border-[#F1F4F9] last:border-0 hover:bg-[#F8FAFD] transition">
      <div className="w-[58px] shrink-0 text-center rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] py-1.5">
        <div className="text-[13px] font-black text-[#0F1A30] leading-none" style={{ fontFamily: MONO }}>{(o.상차일 || "").slice(5).replace("-", "/") || "--/--"}</div>
        <div className="text-[10.5px] font-bold text-[#7A879C] mt-1">{o.상차시간 || "시간 협의"}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[14.5px] font-black text-[#0F1A30] min-w-0">
          {o.긴급 && <Tag strong>긴급</Tag>}
          <span className="truncate">{region(o.상차지주소) || o.상차지명}</span>
          <Icon name="arrow" size={14} className="text-[#9AA9C3] shrink-0" />
          <span className="truncate">{region(o.하차지주소) || o.하차지명}</span>
        </div>
        <div className="text-[12.5px] text-[#7A879C] truncate mt-0.5">{[o.화물내용, o.차량톤수, o.차량종류].filter(Boolean).join(" · ") || "-"}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[14px] font-black text-[#0F1A30]" style={{ fontFamily: MONO }}>{o.운임 || "협의"}</div>
        <div className="text-[11px] font-bold text-[#9AA9C3] mt-0.5">{timeAgo(o.createdAt)}</div>
      </div>
    </button>
  );
}

export default function CafeHome({ orders, profile, onNewOrder, onGoLive, onOpenOrder }) {
  const today = new Date();

  const stats = useMemo(() => ({
    total: orders.length,
    open: orders.filter(o => o.status === "open").length,
    todayNew: orders.filter(o => o.createdAt?.toDate && sameDay(o.createdAt.toDate(), today)).length,
    todayDone: orders.filter(o => o.status === "confirmed" && o.confirmedAt?.toDate && sameDay(o.confirmedAt.toDate(), today)).length,
    companies: new Set(orders.map(o => o.companyName).filter(Boolean)).size,
  }), [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  const openOrders = useMemo(() => orders.filter(o => o.status === "open"), [orders]);
  const latest = useMemo(() => openOrders.slice(0, 8), [openOrders]);
  const urgent = useMemo(() => openOrders.filter(o => o.긴급).slice(0, 5), [openOrders]);

  const topRoutes = useMemo(() => {
    const m = new Map();
    orders.forEach(o => {
      const a = region(o.상차지주소), b = region(o.하차지주소);
      if (!a || !b) return;
      const k = `${a} → ${b}`;
      m.set(k, (m.get(k) || 0) + 1);
    });
    return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5);
  }, [orders]);

  const byVehicle = useMemo(() => {
    const m = new Map();
    openOrders.forEach(o => { if (o.차량종류) m.set(o.차량종류, (m.get(o.차량종류) || 0) + 1); });
    return VEHICLE_TYPES.map(v => [v, m.get(v) || 0]).filter(([, c]) => c > 0);
  }, [openOrders]);
  const maxRoute = Math.max(1, ...topRoutes.map(([, c]) => c));
  const doneRate = stats.total ? Math.round((orders.filter(o => o.status === "confirmed").length / stats.total) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* 히어로 — 서비스 소개 + 실시간 숫자 */}
      <div className="relative overflow-hidden rounded-[26px] text-white px-6 py-7 lg:px-10 lg:py-9 flex flex-col xl:flex-row xl:items-center gap-7 shadow-[0_18px_40px_rgba(15,26,48,0.28)]" style={GRID_BG}>
        <div className="absolute -right-20 -top-28 w-[380px] h-[380px] rounded-full bg-[#4B6CB7]/20 blur-3xl pointer-events-none" />
        <div className="relative flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#CFE0FF] animate-pulse" />LIVE · FREIGHT ORDER EXCHANGE
          </div>
          <h1 className="text-[26px] lg:text-[34px] font-black leading-[1.25] tracking-tight mt-3">
            전국 운송사·화주·차주가 함께 쓰는<br />실시간 오더 공유 마당
          </h1>
          <p className="text-white/65 text-[14px] lg:text-[15px] mt-3 leading-relaxed">
            {profile?.nickname ? <b className="text-white">{profile.nickname}님, </b> : null}지금 <b className="text-white" style={{ fontFamily: MONO }}>{stats.open}</b>건의 오더가 차량을 기다리고 있습니다.
          </p>
          <div className="flex flex-wrap gap-2.5 mt-6">
            <button type="button" onClick={onNewOrder} className="h-12 px-6 rounded-xl bg-white text-[#0F1A30] text-[14.5px] font-black inline-flex items-center gap-2 shadow-[0_10px_24px_rgba(0,0,0,0.25)] hover:bg-[#F5F8FD]"><Icon name="plus" size={17} />오더 올리기</button>
            <button type="button" onClick={() => onGoLive()} className="h-12 px-6 rounded-xl ring-1 ring-white/30 text-white text-[14.5px] font-black inline-flex items-center gap-2 hover:bg-white/10"><Icon name="live" size={17} />실시간 배차현황</button>
          </div>
        </div>
        <div className="relative grid grid-cols-2 gap-2.5 xl:w-[400px] shrink-0">
          <DarkStat label="배차 대기" value={stats.open} unit="건" />
          <DarkStat label="오늘 등록" value={stats.todayNew} unit="건" />
          <DarkStat label="오늘 배차완료" value={stats.todayDone} unit="건" />
          <DarkStat label="참여 업체" value={stats.companies} unit="곳" />
          <div className="col-span-2 rounded-2xl bg-white/[0.07] ring-1 ring-white/10 px-4 py-3">
            <div className="flex items-center justify-between text-[11.5px] font-bold text-white/55"><span>누적 배차 성사율</span><span className="text-white" style={{ fontFamily: MONO }}>{doneRate}%</span></div>
            <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-white rounded-full" style={{ width: `${doneRate}%` }} /></div>
          </div>
        </div>
      </div>

      {/* 이용 방법 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {STEPS.map(([ic, t, d], i) => (
          <div key={t} className="bg-white border border-[#E3E8F0] rounded-[20px] px-5 py-4 flex gap-3.5">
            <span className="w-11 h-11 rounded-[14px] flex items-center justify-center text-white shrink-0" style={{ background: "linear-gradient(135deg,#0F1A30,#2D4C82)" }}><Icon name={ic} size={18} /></span>
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold tracking-[0.24em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>STEP {String(i + 1).padStart(2, "0")}</div>
              <div className="text-[15px] font-black text-[#0F1A30]">{t}</div>
              <div className="text-[12.5px] text-[#7A879C] mt-0.5 leading-relaxed">{d}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Panel className="xl:col-span-2" en="LIVE BOARD" title="방금 올라온 배차 대기 오더"
          right={<button type="button" onClick={() => onGoLive()} className="text-[12.5px] font-black text-[#4B6CB7] inline-flex items-center gap-1">전체보기 <Icon name="arrow" size={13} /></button>}>
          {latest.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-[14px] font-bold text-[#9AA9C3]">아직 대기 중인 오더가 없습니다</div>
              <button type="button" onClick={onNewOrder} className="mt-4 h-11 px-5 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black">첫 오더 올리기</button>
            </div>
          ) : latest.map(o => <MiniRow key={o.id} o={o} onClick={() => onOpenOrder(o)} />)}
        </Panel>

        <div className="space-y-5">
          <Panel en="URGENT" title="급하게 차를 찾는 오더">
            {urgent.length === 0 ? <div className="py-8 text-center text-[13px] font-bold text-[#9AA9C3]">현재 긴급 오더가 없습니다</div>
              : urgent.map(o => <MiniRow key={o.id} o={o} onClick={() => onOpenOrder(o)} />)}
          </Panel>

          <Panel en="TOP ROUTES" title="많이 올라오는 노선 TOP 5" bodyClass="px-5 py-4">
            {topRoutes.length === 0 ? <div className="text-[13px] font-bold text-[#9AA9C3] py-3">데이터가 쌓이면 표시됩니다</div> : (
              <div className="space-y-3">
                {topRoutes.map(([route, cnt], i) => (
                  <div key={route}>
                    <div className="flex items-center gap-2.5 text-[13.5px]">
                      <span className={`w-6 h-6 rounded-lg text-[11.5px] font-black flex items-center justify-center shrink-0 ${i === 0 ? "bg-[#0F1A30] text-white" : "bg-[#EEF1F6] text-[#5B6B85]"}`} style={{ fontFamily: MONO }}>{i + 1}</span>
                      <span className="flex-1 truncate font-bold text-[#0F1A30]">{route}</span>
                      <span className="text-[12.5px] font-black text-[#5B6B85] shrink-0" style={{ fontFamily: MONO }}>{cnt}</span>
                    </div>
                    <div className="ml-8 mt-1.5 h-1 rounded-full bg-[#EEF1F6] overflow-hidden"><div className="h-full rounded-full bg-[#1B2B4B]" style={{ width: `${(cnt / maxRoute) * 100}%`, opacity: 1 - i * 0.15 }} /></div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel en="BY VEHICLE" title="차종별 대기 오더" bodyClass="px-5 py-4">
            {byVehicle.length === 0 ? <div className="text-[13px] font-bold text-[#9AA9C3] py-3">대기 중인 오더가 없습니다</div> : (
              <div className="flex flex-wrap gap-2">
                {byVehicle.map(([v, c]) => (
                  <button key={v} type="button" onClick={() => onGoLive(v)} className="h-9 pl-3 pr-1.5 rounded-xl border border-[#E3E8F0] text-[13px] font-bold text-[#3A4A66] hover:border-[#1B2B4B] hover:text-[#0F1A30] inline-flex items-center gap-2 transition">
                    {v}<span className="min-w-[24px] h-6 px-1.5 rounded-lg bg-[#0F1A30] text-white text-[11.5px] font-black flex items-center justify-center" style={{ fontFamily: MONO }}>{c}</span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
