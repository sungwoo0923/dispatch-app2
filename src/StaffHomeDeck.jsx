// ======================= src/StaffHomeDeck.jsx =======================
// 🔒 2026-11-27 운송사무원(user) 홈 — 회사 매출 · 수익 · 담당자 순위 · Top 거래처는 빼고 "운영 숫자(건수)"와 "본인 실적"만 보여 준다.
//  예전엔 사무원 홈도 관제 데크(HomeDeck)라 회사 이번 달 · 올해 매출 · 수익 · 담당자별 매출 순위가 그대로 보였다(매출관리를 막아 둔 뜻과 어긋남).
//  계산은 HomeDeck 과 같은 재료(실시간 오더 + 지난 기간 캐시 pastCache · buildPastStats)를 그대로 쓴다 — 숫자 규칙은 바꾸지 않는다.
import React, { useMemo } from "react";
import { AttendanceQuickButton } from "./attendanceQuick";
import { buildPastStats } from "./pastStats";
import { creatorOf } from "./monthCompare";

const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const addDay = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dateOf = (r) => String(r?.상차일자 || r?.상차일 || r?.상차 || "").slice(0, 10);
const isCancelled = (r) => r?.배차상태 === "배차취소" || ["취소", "배차취소", "오더취소", "취소됨"].includes(r?.상태);
const won = (n) => Math.round(n || 0).toLocaleString();
const NUM = { fontVariantNumeric: "tabular-nums" };

function Tile({ label, value, unit, foot, primary = false }) {
  return (
    <div className={`rounded-2xl px-4 py-3.5 min-w-0 border ${primary ? "bg-[#1B2B4B] border-[#2D4C82]" : "bg-white/[0.04] border-white/10"}`}>
      <div className="text-[13px] font-bold text-[#CFE0FF]/80">{label}</div>
      <div className="mt-1 text-[26px] font-black text-white leading-tight truncate" style={NUM}>{value}<span className="ml-1 text-[14px] font-bold text-[#CFE0FF]/70">{unit}</span></div>
      {foot && <div className="mt-1 text-[12.5px] font-bold text-[#CFE0FF]/65 truncate">{foot}</div>}
    </div>
  );
}

export default function StaffHomeDeck({ dispatchData = [], pastCache, liveStart, myName = "", myEmail = "", att = null, todo = null, weather = null }) {
  const today = kstToday();
  const tomorrow = addDay(today, 1);
  const thisMonth = today.slice(0, 7);
  const rows = useMemo(() => dispatchData.filter((r) => !isCancelled(r) && r.source !== "transport_transmit"), [dispatchData]);
  const live = useMemo(() => buildPastStats(rows.filter((r) => dateOf(r) >= liveStart), thisMonth), [rows, liveStart, thisMonth]);
  // 내 이름 키 — 담당자 집계(staff)는 등록자 이름 또는 이메일 앞부분
  const mineKey = useMemo(() => {
    const keys = new Set([String(myName || "").trim(), String(myEmail || "").trim(), String(myEmail || "").split("@")[0]].filter(Boolean));
    return (k) => keys.has(String(k || "").trim());
  }, [myName, myEmail]);
  const ops = useMemo(() => {
    const t = rows.filter((r) => dateOf(r) === today);
    const tm = rows.filter((r) => dateOf(r) === tomorrow);
    const done = t.filter((r) => r.배차상태 === "배차완료").length;
    // 이번 달 오더 건수 — 지난 기간 캐시(상차일 < liveStart) + 실시간
    let month = 0;
    Object.entries(pastCache?.days || {}).forEach(([d, v]) => { if (d < liveStart && d.startsWith(thisMonth)) month += v[2] || 0; });
    Object.entries(live.days).forEach(([d, v]) => { if (d.startsWith(thisMonth)) month += v[2] || 0; });
    return { today: t.length, done, open: t.length - done, tomorrow: tm.length, month };
  }, [rows, today, tomorrow, pastCache, live, liveStart, thisMonth]);
  const mine = useMemo(() => {
    const m = [0, 0, 0];
    const add = (src) => Object.entries(src || {}).forEach(([k, v]) => { if (mineKey(k)) { m[0] += v[0] || 0; m[1] += v[1] || 0; m[2] += v[2] || 0; } });
    if (pastCache?.month === thisMonth) add(pastCache.staff);
    add(live.staff);
    const todayMine = rows.filter((r) => dateOf(r) === today && mineKey(creatorOf(r))).length;
    return { sale: m[0], profit: m[1], n: m[2], today: todayMine };
  }, [pastCache, live, mineKey, rows, today, thisMonth]);
  const ready = !!pastCache;
  const mm = Number(thisMonth.slice(5));
  return (
    <div className="rounded-[24px] p-5 md:p-6 text-white" style={{ background: "linear-gradient(135deg,#0B1428,#13203D 55%,#1B2B4B)" }} data-testid="staff-home-deck">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div className="min-w-0">
          <div className="text-[12px] font-extrabold tracking-[0.2em] text-[#8FB0F0]">TODAY · OPERATIONS</div>
          <h1 className="mt-1.5 text-[24px] md:text-[26px] font-black">{myName ? `${myName}님 반갑습니다, 좋은 하루 되세요.` : "반갑습니다, 좋은 하루 되세요."}</h1>
          <p className="mt-1 text-[14.5px] font-semibold text-[#CFE0FF]/80">오늘 오더 <b className="text-white" style={NUM}>{ops.today.toLocaleString()}</b>건 · 배차완료 <b className="text-white" style={NUM}>{ops.done.toLocaleString()}</b>건 · 남은 배차 <b className="text-white" style={NUM}>{ops.open.toLocaleString()}</b>건</p>
        </div>
        {att && <AttendanceQuickButton {...att} variant="deck" />}
      </div>
      {todo}
      <div className="text-[13px] font-black text-[#8FB0F0] mb-2">운영 현황</div>
      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <Tile primary label="오늘 오더" value={ops.today.toLocaleString()} unit="건" />
        <Tile label="오늘 배차완료" value={ops.done.toLocaleString()} unit="건" />
        <Tile label="오늘 남은 배차" value={ops.open.toLocaleString()} unit="건" />
        <Tile label="내일 오더" value={ops.tomorrow.toLocaleString()} unit="건" />
        <Tile label={`${mm}월 오더`} value={ready ? ops.month.toLocaleString() : "…"} unit="건" foot={ready ? "상차일 기준 · 취소 제외" : "계산 중…"} />
      </div>
      <div className="text-[13px] font-black text-[#8FB0F0] mb-2">내 실적</div>
      <div className="grid gap-3 mb-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <Tile primary label="오늘 내가 등록한 오더" value={mine.today.toLocaleString()} unit="건" />
        <Tile label={`${mm}월 내 오더`} value={ready ? mine.n.toLocaleString() : "…"} unit="건" />
        <Tile label={`${mm}월 내 매출`} value={ready ? won(mine.sale) : "…"} unit="원" foot="배차완료 · 청구월 기준" />
        <Tile label={`${mm}월 내 수익`} value={ready ? won(mine.profit) : "…"} unit="원" />
      </div>
      {weather && <div className="mt-4">{weather}</div>}
    </div>
  );
}
