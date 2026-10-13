// ======================= cafe-site/src/CafeHome.jsx =======================
// 배차마당 홈 — 처음 들어온 사람이 "여기는 여러 사람이 올린 오더가 모이는 곳이고,
// 내가 오더를 올리거나 남의 오더에 배차신청을 할 수 있구나"를 바로 알 수 있게
// 서비스 소개 + 이용방법 + 실시간 요약(방금 올라온 오더/긴급/인기 노선/차종별)으로 구성한다.
import React, { useMemo } from "react";
import { VEHICLE_TYPES } from "./cafeConstants";

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function timeAgo(ts) {
  if (!ts?.toDate) return "";
  const diff = (Date.now() - ts.toDate().getTime()) / 1000;
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

// "인천 서구 북항로 28-29" → "인천 서구"
const region = (addr) => (addr || "").trim().split(/\s+/).slice(0, 2).join(" ");

const STEPS = [
  ["1", "오더 올리기", "상·하차지, 화물, 차량, 운임을 입력해 오더를 올립니다. 모든 회원에게 실시간으로 공유돼요."],
  ["2", "실시간 현황 확인", "다른 운송사·화주가 올린 오더를 실시간 배차현황에서 지역·차종별로 찾아보세요."],
  ["3", "배차신청", "원하는 오더에 배차신청! 신청 후 10초 안에는 취소할 수 있어요."],
  ["4", "배차확정 · 연락", "확정되면 서로의 연락처가 공개되어 바로 전화/문자로 진행합니다."],
];

function MiniRow({ o, onClick }) {
  return (
    <div onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition">
      <div className="flex flex-col items-center w-14 shrink-0">
        <span className="text-[11px] font-bold text-[#1B2B4B]">{(o.상차일 || "").slice(5) || "-"}</span>
        <span className="text-[10px] text-gray-400">{o.상차시간 || ""}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13.5px] font-bold text-gray-900 min-w-0">
          {o.긴급 && <span className="text-[10px] font-bold px-1.5 py-px rounded border border-orange-300 text-orange-700 shrink-0">긴급</span>}
          <span className="truncate">{region(o.상차지주소) || o.상차지명}</span>
          <span className="text-gray-300 shrink-0">→</span>
          <span className="truncate">{region(o.하차지주소) || o.하차지명}</span>
        </div>
        <div className="text-[11.5px] text-gray-500 truncate">
          {[o.화물내용, o.차량톤수, o.차량종류].filter(Boolean).join(" · ") || "-"}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[13px] font-bold text-[#1B2B4B]">{o.운임 || "협의"}</div>
        <div className="text-[10.5px] text-gray-400">{timeAgo(o.createdAt)}</div>
      </div>
    </div>
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

  return (
    <div className="space-y-5">
      {/* 히어로 — 서비스 소개 */}
      <div className="rounded-2xl bg-gradient-to-br from-[#1B2B4B] to-[#2c4475] text-white px-6 py-7 lg:px-10 lg:py-9 flex flex-col lg:flex-row lg:items-center gap-6">
        <div className="flex-1 min-w-0">
          <div className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15 mb-3">화물 오더 공유 커뮤니티</div>
          <h1 className="text-[22px] lg:text-[28px] font-black leading-snug tracking-tight">
            전국 운송사·화주·기사가 함께 쓰는<br />실시간 오더 공유 마당
          </h1>
          <p className="text-white/70 text-[13px] lg:text-[14px] mt-2 leading-relaxed">
            남는 오더는 올리고, 필요한 오더는 바로 배차신청하세요.<br className="hidden sm:inline" />
            {profile?.nickname ? `${profile.nickname}님, ` : ""}지금 {stats.open}건의 오더가 차량을 기다리고 있어요.
          </p>
          <div className="flex flex-wrap gap-2 mt-5">
            <button onClick={onNewOrder}
              className="px-5 py-2.5 rounded-xl bg-white text-[#1B2B4B] text-[13.5px] font-bold hover:bg-gray-100 transition">
              + 오더 올리기
            </button>
            <button onClick={() => onGoLive()}
              className="px-5 py-2.5 rounded-xl border border-white/40 text-white text-[13.5px] font-bold hover:bg-white/10 transition">
              실시간 배차현황 보기 →
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2.5 lg:w-[360px] shrink-0">
          {[
            ["배차 대기", stats.open, "건"],
            ["오늘 등록", stats.todayNew, "건"],
            ["오늘 배차완료", stats.todayDone, "건"],
            ["참여 업체", stats.companies, "곳"],
          ].map(([l, v, u]) => (
            <div key={l} className="bg-white/10 rounded-xl px-4 py-3">
              <div className="text-[11px] font-semibold text-white/60">{l}</div>
              <div className="text-[24px] font-black leading-tight">{v}<span className="text-[12px] font-bold text-white/60 ml-0.5">{u}</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* 이용 방법 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {STEPS.map(([n, t, d]) => (
          <div key={n} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex gap-3">
            <div className="w-8 h-8 rounded-full bg-[#1B2B4B] text-white font-black text-[13px] flex items-center justify-center shrink-0">{n}</div>
            <div className="min-w-0">
              <div className="text-[14px] font-bold text-gray-900">{t}</div>
              <div className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">{d}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* 방금 올라온 오더 */}
        <div className="xl:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[14px] font-bold text-gray-900">방금 올라온 배차 대기 오더</span>
            </div>
            <button onClick={() => onGoLive()} className="text-[12px] font-bold text-gray-400 hover:text-[#1B2B4B]">전체보기 →</button>
          </div>
          {latest.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-gray-400">
              아직 대기 중인 오더가 없어요.<br />
              <button onClick={onNewOrder} className="mt-3 px-4 py-2 rounded-lg bg-[#1B2B4B] text-white text-[12.5px] font-bold">첫 오더 올리기</button>
            </div>
          ) : (
            latest.map(o => <MiniRow key={o.id} o={o} onClick={() => onOpenOrder(o)} />)
          )}
        </div>

        <div className="space-y-5">
          {/* 긴급 오더 */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-orange-300 text-orange-700">긴급</span>
              <span className="text-[14px] font-bold text-gray-900">급하게 차를 찾는 오더</span>
            </div>
            {urgent.length === 0 ? (
              <div className="py-8 text-center text-[12.5px] text-gray-400">현재 긴급 오더가 없습니다.</div>
            ) : (
              urgent.map(o => <MiniRow key={o.id} o={o} onClick={() => onOpenOrder(o)} />)
            )}
          </div>

          {/* 인기 노선 */}
          <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
            <div className="text-[14px] font-bold text-gray-900 mb-3">많이 올라오는 노선 TOP 5</div>
            {topRoutes.length === 0 ? (
              <div className="text-[12.5px] text-gray-400 py-3">데이터가 쌓이면 표시됩니다.</div>
            ) : (
              <div className="space-y-2">
                {topRoutes.map(([route, cnt], i) => (
                  <div key={route} className="flex items-center gap-2.5 text-[13px]">
                    <span className={`w-5 h-5 rounded text-[11px] font-black flex items-center justify-center shrink-0 ${i === 0 ? "bg-[#1B2B4B] text-white" : "bg-gray-100 text-gray-500"}`}>{i + 1}</span>
                    <span className="flex-1 truncate font-semibold text-gray-800">{route}</span>
                    <span className="text-[12px] text-gray-400 shrink-0">{cnt}건</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 차종별 대기 오더 — 클릭하면 실시간 현황에서 해당 차종만 */}
          <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
            <div className="text-[14px] font-bold text-gray-900 mb-3">차종별 대기 오더</div>
            {byVehicle.length === 0 ? (
              <div className="text-[12.5px] text-gray-400 py-3">대기 중인 오더가 없습니다.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {byVehicle.map(([v, c]) => (
                  <button key={v} onClick={() => onGoLive(v)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12.5px] font-semibold text-gray-700 hover:border-[#1B2B4B] hover:text-[#1B2B4B] transition">
                    {v} <span className="font-black text-[#1B2B4B]">{c}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
