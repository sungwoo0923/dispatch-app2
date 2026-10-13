// ======================= cafe-site/src/CafeHome.jsx =======================
// 배차마당 홈 — 처음 들어온 사람이 "여기는 여러 사람이 올린 오더가 모이는 곳이고,
// 내가 오더를 올리거나 남의 오더에 배차신청을 할 수 있구나"를 바로 알 수 있게
// 서비스 소개 + 이용방법 + 실시간 요약(방금 올라온 오더/긴급/인기 노선/차종별)으로 구성한다.
import React, { useMemo } from "react";
import { VEHICLE_TYPES } from "./cafeConstants";
import { T } from "./CafeEditMode";

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

// 게시판형 오더 표 — 배차프로그램처럼 최소한의 컬럼만, 한 줄(가로)로 보여준다.
// cols: 보여줄 컬럼 키 목록
const BOARD_COLS = {
  when:  { label: "상차일시", cls: "w-[130px]" },
  from:  { label: "상차지" },
  to:    { label: "하차지" },
  route: { label: "구간" },
  cargo: { label: "화물내용" },
  car:   { label: "차량" },
  fare:  { label: "운임", cls: "w-[100px]" },
  ago:   { label: "등록", cls: "w-[80px]" },
};

function boardCell(key, o) {
  const when = `${(o.상차일 || "").slice(5).replace("-", "/") || "-"}${o.상차시간 ? ` ${o.상차시간}` : ""}`;
  const place = (name, addr) => (
    <span className="font-semibold text-gray-900">{name || "-"}{addr ? <span className="ml-1 font-normal text-gray-400">({region(addr)})</span> : null}</span>
  );
  switch (key) {
    case "when": return <span className="font-bold text-[#1B2B4B] whitespace-nowrap">{when}</span>;
    case "from": return place(o.상차지명, o.상차지주소);
    case "to": return place(o.하차지명, o.하차지주소);
    case "route": return <span className="font-semibold text-gray-900">{region(o.상차지주소) || o.상차지명} → {region(o.하차지주소) || o.하차지명}</span>;
    case "cargo": return o.화물내용 || "-";
    case "car": return [o.차량톤수, o.차량종류].filter(Boolean).join(" ") || "-";
    case "fare": return <span className="font-bold text-[#1B2B4B]">{o.운임 || "협의"}</span>;
    case "ago": return <span className="text-gray-400">{timeAgo(o.createdAt)}</span>;
    default: return null;
  }
}

function OrderBoard({ id, orders, cols, onOpenOrder, empty }) {
  if (orders.length === 0) return empty;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="bg-gray-50">
          <tr>
            {cols.map(c => (
              <th key={c} className={`px-3 py-2 text-center text-[11.5px] font-bold text-gray-500 border-b border-gray-200 whitespace-nowrap ${BOARD_COLS[c].cls || ""}`}>
                <T k={`home.${id}.col.${c}`}>{BOARD_COLS[c].label}</T>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id} onClick={() => onOpenOrder(o)} className="cursor-pointer hover:bg-gray-50 transition">
              {cols.map(c => (
                <td key={c} className="px-3 py-2.5 text-center text-[12.5px] text-gray-700 border-b border-gray-100 whitespace-nowrap max-w-[220px] truncate">
                  {c === "when" && o.긴급 && <span className="mr-1 text-[10px] font-bold px-1 py-px rounded border border-orange-300 text-orange-700">긴급</span>}
                  {boardCell(c, o)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
          <T k="home.hero.badge" className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15 mb-3">화물 오더 공유 커뮤니티</T>
          <T k="home.hero.title" as="h1" className="text-[22px] lg:text-[28px] font-black leading-snug tracking-tight whitespace-pre-line">
            {"전국 운송사·화주·기사가 함께 쓰는\n실시간 오더 공유 마당"}
          </T>
          <T k="home.hero.desc" as="p" className="block text-white/70 text-[13px] lg:text-[14px] mt-2 leading-relaxed">
            남는 오더는 올리고, 필요한 오더는 바로 배차신청하세요.
          </T>
          <p className="text-white/70 text-[13px] lg:text-[14px] leading-relaxed">
            {profile?.nickname ? `${profile.nickname}님, ` : ""}<T k="home.hero.waitPre">지금</T> <b className="text-white">{stats.open}</b><T k="home.hero.waitPost">건의 오더가 차량을 기다리고 있어요.</T>
          </p>
          <div className="flex flex-wrap gap-2 mt-5">
            <button onClick={onNewOrder}
              className="px-5 py-2.5 rounded-xl bg-white text-[#1B2B4B] text-[13.5px] font-bold hover:bg-gray-100 transition">
              <T k="home.hero.btnNew">+ 오더 올리기</T>
            </button>
            <button onClick={() => onGoLive()}
              className="px-5 py-2.5 rounded-xl border border-white/40 text-white text-[13.5px] font-bold hover:bg-white/10 transition">
              <T k="home.hero.btnLive">실시간 배차현황 보기 →</T>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2.5 lg:w-[360px] shrink-0">
          {[
            ["open", "배차 대기", stats.open, "건"],
            ["todayNew", "오늘 등록", stats.todayNew, "건"],
            ["todayDone", "오늘 배차완료", stats.todayDone, "건"],
            ["companies", "참여 업체", stats.companies, "곳"],
          ].map(([key, l, v, u]) => (
            <div key={key} className="bg-white/10 rounded-xl px-4 py-3">
              <T k={`home.stat.${key}`} className="block text-[11px] font-semibold text-white/60">{l}</T>
              <div className="text-[24px] font-black leading-tight">{v}<T k={`home.stat.${key}.unit`} className="text-[12px] font-bold text-white/60 ml-0.5">{u}</T></div>
            </div>
          ))}
        </div>
      </div>

      {/* 이용 방법 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {STEPS.map(([n, t, d]) => (
          <div key={n} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex gap-3">
            <div className="w-8 h-8 rounded-full bg-[#1B2B4B] text-white font-black text-[13px] flex items-center justify-center shrink-0">{n}</div>
            <div className="min-w-0 flex-1">
              <T k={`home.step${n}.title`} className="block text-[14px] font-bold text-gray-900">{t}</T>
              <T k={`home.step${n}.desc`} className="block text-[12px] text-gray-500 mt-0.5 leading-relaxed">{d}</T>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* 방금 올라온 오더 — 게시판형 */}
        <div className="xl:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
              </span>
              <T k="home.latest.title" className="text-[14px] font-bold text-gray-900">방금 올라온 배차 대기 오더</T>
            </div>
            <button onClick={() => onGoLive()} className="text-[12px] font-bold text-gray-400 hover:text-[#1B2B4B]"><T k="home.latest.more">전체보기 →</T></button>
          </div>
          <OrderBoard
            id="latest"
            orders={latest}
            cols={["when", "from", "to", "cargo", "car", "fare", "ago"]}
            onOpenOrder={onOpenOrder}
            empty={
              <div className="py-16 text-center text-[13px] text-gray-400">
                <T k="home.latest.empty">아직 대기 중인 오더가 없어요.</T><br />
                <button onClick={onNewOrder} className="mt-3 px-4 py-2 rounded-lg bg-[#1B2B4B] text-white text-[12.5px] font-bold"><T k="home.latest.emptyBtn">첫 오더 올리기</T></button>
              </div>
            }
          />
        </div>

        <div className="space-y-5">
          {/* 긴급 오더 */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
              <T k="home.urgent.badge" className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-orange-300 text-orange-700">긴급</T>
              <T k="home.urgent.title" className="text-[14px] font-bold text-gray-900">급하게 차를 찾는 오더</T>
            </div>
            <OrderBoard
              id="urgent"
              orders={urgent}
              cols={["when", "route", "fare"]}
              onOpenOrder={onOpenOrder}
              empty={<div className="py-8 text-center text-[12.5px] text-gray-400"><T k="home.urgent.empty">현재 긴급 오더가 없습니다.</T></div>}
            />
          </div>

          {/* 인기 노선 */}
          <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
            <T k="home.routes.title" className="block text-[14px] font-bold text-gray-900 mb-3">많이 올라오는 노선 TOP 5</T>
            {topRoutes.length === 0 ? (
              <T k="home.routes.empty" className="block text-[12.5px] text-gray-400 py-3">데이터가 쌓이면 표시됩니다.</T>
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
            <T k="home.vehicle.title" className="block text-[14px] font-bold text-gray-900 mb-3">차종별 대기 오더</T>
            {byVehicle.length === 0 ? (
              <T k="home.vehicle.empty" className="block text-[12.5px] text-gray-400 py-3">대기 중인 오더가 없습니다.</T>
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
