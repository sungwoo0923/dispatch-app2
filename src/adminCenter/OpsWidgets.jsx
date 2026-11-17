// ======================= src/adminCenter/OpsWidgets.jsx =======================
// 🛰 2026-11-18 관리자센터 — 대시보드 부품(트래픽 · 운영비 · 운송사 사용량 · 초과분)
//  관제 대시보드 · 실시간 트래픽 · 운송사 사용량 · 운영 비용 화면이 같은 부품을 쓴다.
import React from "react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, PieChart, Pie, Cell } from "recharts";
import { G, NUM, AXIS, AdmTip, Meter, EstTag, RealTag, compact, short, won } from "./admUi";

export const SERIES = ["#D7BC82", "#8FB0F0", "#B89A5E", "#6E95E8", "#F3E3BC", "#4B6CB7", "#8C7442", "#CFE0FF", "#5A4517", "#2D4C82"];

// ─── 30일 읽기 · 쓰기(실측) ───
export function TrafficChart({ days = [], free, height = 230, showWrites = true }) {
  const id = React.useId().replace(/:/g, "");
  if (!days.length) return <div className="h-[180px] flex items-center justify-center text-[13px] font-bold" style={{ color: G.dim }}>구글 클라우드 사용량이 아직 쌓이지 않았어요 — 1시간마다 모여요</div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={days} margin={{ top: 8, right: 6, left: -6, bottom: 0 }}>
          <defs>
            <linearGradient id={`r${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={G.gold} stopOpacity={0.45} /><stop offset="1" stopColor={G.gold} stopOpacity={0} /></linearGradient>
            <linearGradient id={`w${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={G.ice} stopOpacity={0.35} /><stop offset="1" stopColor={G.ice} stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(215,188,130,.07)" vertical={false} />
          <XAxis dataKey="d" {...AXIS} interval="preserveStartEnd" minTickGap={18} />
          <YAxis yAxisId="r" {...AXIS} width={44} tickFormatter={compact} />
          {showWrites && <YAxis yAxisId="w" orientation="right" {...AXIS} width={40} tickFormatter={compact} />}
          <Tooltip content={<AdmTip fmt={(v) => Number(v).toLocaleString()} unit="건" />} cursor={{ stroke: "rgba(215,188,130,.3)" }} />
          {free?.read ? <ReferenceLine yAxisId="r" y={free.read} stroke="rgba(242,196,109,.55)" strokeDasharray="4 4" label={{ value: "하루 무료 읽기", position: "insideTopLeft", fill: "rgba(242,196,109,.75)", fontSize: 10.5 }} /> : null}
          <Area yAxisId="r" type="monotone" dataKey="reads" name="읽기" stroke={G.gold} strokeWidth={2} fill={`url(#r${id})`} dot={false} isAnimationActive={false} />
          {showWrites && <Area yAxisId="w" type="monotone" dataKey="writes" name="쓰기" stroke={G.ice} strokeWidth={1.6} fill={`url(#w${id})`} dot={false} isAnimationActive={false} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── 24시간 접속 막대 ───
export function HourBars({ hourly = [], height = 120 }) {
  const max = Math.max(1, ...hourly.map((h) => h.logins));
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {hourly.map((h, i) => {
          const last = i === hourly.length - 1;
          return (
            <div key={i} className="flex-1 h-full flex flex-col justify-end group relative" title={`${h.h} · 로그인 ${h.logins}회 · ${h.people}명`}>
              <div className="rounded-t-[3px] transition-all" style={{ height: `${Math.max(3, (h.logins / max) * 100)}%`, background: last ? `linear-gradient(180deg, ${G.goldHi}, ${G.gold})` : h.logins ? "linear-gradient(180deg, rgba(215,188,130,.75), rgba(215,188,130,.25))" : "rgba(255,255,255,.06)", boxShadow: last ? `0 0 12px ${G.gold}` : "none" }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] font-bold" style={{ ...NUM, color: G.dim }}>
        <span>{hourly[0]?.h}</span><span>{hourly[6]?.h}</span><span>{hourly[12]?.h}</span><span>{hourly[18]?.h}</span><span style={{ color: G.gold }}>지금</span>
      </div>
    </div>
  );
}

// ─── 운영비 도넛 ───
export function CostDonut({ byGroup = [], total = 0, size = 200, label = "월말 예상" }) {
  const data = byGroup.length ? byGroup : [{ group: "없음", krw: 1 }];
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="krw" nameKey="group" innerRadius={size * 0.36} outerRadius={size * 0.48} paddingAngle={1.5} stroke="none" isAnimationActive={false}>
            {data.map((x, i) => <Cell key={x.group} fill={byGroup.length ? SERIES[i % SERIES.length] : "rgba(255,255,255,.08)"} />)}
          </Pie>
          {byGroup.length > 0 && <Tooltip content={<AdmTip fmt={(v) => won(v)} />} />}
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-[11px] font-bold" style={{ color: G.dim }}>{label}</div>
        <div className="text-[22px] font-black leading-tight" style={{ ...NUM, color: G.goldHi }}>{short(total)}<span className="text-[13px] ml-0.5" style={{ color: G.dim }}>원</span></div>
        <div className="text-[10.5px] font-extrabold tracking-[0.18em]" style={{ ...NUM, color: G.goldDim }}>PER MONTH</div>
      </div>
    </div>
  );
}
export function CostLegend({ byGroup = [], total = 0, max = 9 }) {
  return (
    <div className="space-y-1.5 min-w-0">
      {byGroup.slice(0, max).map((x, i) => (
        <div key={x.group} className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <i className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: SERIES[i % SERIES.length] }} />
            <span className="text-[13px] font-bold truncate" style={{ color: G.sub }}>{x.group}</span>
            {x.est && <EstTag />}
            <span className="ml-auto text-[13px] font-black whitespace-nowrap" style={{ ...NUM, color: G.ink }}>{won(x.krw)}</span>
            <span className="w-11 text-right text-[11.5px] font-bold" style={{ ...NUM, color: G.dim }}>{total ? ((x.krw / total) * 100).toFixed(0) : 0}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 운영자 주머니(무료 기간) ───
export function WalletStrip({ c, ai }) {
  const pct = c.dim ? c.dayNo / c.dim : 0;
  return (
    <div className="rounded-[16px] p-3.5 sm:p-4" style={{ background: "linear-gradient(140deg, rgba(215,188,130,.16), rgba(140,116,66,.06) 60%, rgba(255,255,255,.015))", border: "1px solid rgba(215,188,130,.35)" }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10.5px] font-extrabold tracking-[0.24em]" style={{ ...NUM, color: G.gold }}>OUT OF POCKET</span>
        {c.free ? <span className="h-[20px] px-2 rounded-md text-[11px] font-black inline-flex items-center" style={{ color: G.goldInk, background: G.gold }}>무료 기간 · 전액 운영자 부담</span> : <span className="text-[12px] font-bold" style={{ color: G.sub }}>매출 {won(c.revenue)}에서 빠져요</span>}
        <span className="ml-auto">{c.source === "measured" ? <RealTag>서버 실측 + 단가</RealTag> : <EstTag>활동량 추정</EstTag>}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {[["지금까지", c.mtd, `${c.dayNo}일 동안`], ["월말 예상", c.totalMonth, `${c.ym?.slice(5)}월 전체`], ["하루 평균", c.perDay, ai ? `AI ${short(ai.krw)}원 포함` : ""]].map(([l, v, s], i) => (
          <div key={l} className="min-w-0">
            <div className="text-[11.5px] font-bold" style={{ color: G.dim }}>{l}</div>
            <div className={`${i === 1 ? "text-[22px] sm:text-[26px]" : "text-[18px] sm:text-[21px]"} font-black leading-tight whitespace-nowrap`} style={{ ...NUM, color: i === 1 ? G.goldHi : "#fff" }}>{short(v)}<span className="text-[12px] ml-0.5" style={{ color: G.dim }}>원</span></div>
            <div className="text-[11px] font-semibold truncate" style={{ color: G.dim }}>{s}</div>
          </div>
        ))}
      </div>
      <div className="mt-2.5 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.07)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: `linear-gradient(90deg, #8C7442, ${G.goldHi})` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] font-bold" style={{ ...NUM, color: G.dim }}><span>{c.ym}.01</span><span>이번 달 {Math.round(pct * 100)}% 지남</span><span>{c.ym}.{c.dim}</span></div>
    </div>
  );
}

// ─── 운송사별 사용량(계약 금액 없이) — 한 줄에 직원 · 오더 · 저장 · 서버 읽기 ───
export function CarrierUsageRows({ carriers = [], max = 8, onOpen, compactMode = false }) {
  const maxCost = Math.max(1, ...carriers.map((c) => c.costTotal));
  if (!carriers.length) return <div className="py-10 text-center text-[13px] font-bold" style={{ color: G.dim }}>집계된 운송사가 없어요 — 운송사 관제에서 [지금 갱신]을 눌러 주세요</div>;
  return (
    <div className="divide-y" style={{ borderColor: G.line }}>
      {carriers.slice(0, max).map((c, i) => (
        <button key={c.name} type="button" onClick={() => onOpen?.(c.name)} className="adm-row w-full text-left px-1 py-2.5 grid gap-x-4 gap-y-1.5 items-center rounded-lg" style={{ gridTemplateColumns: compactMode ? "minmax(0,1fr)" : "minmax(150px,1.1fr) repeat(3,minmax(0,1fr)) minmax(120px,.9fr)", borderColor: "rgba(215,188,130,.08)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 text-[11px] font-black text-center shrink-0" style={{ ...NUM, color: i < 3 ? G.gold : G.dim }}>{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0">
              <span className="block text-[14px] font-black truncate" style={{ color: G.ink }}>{c.name}</span>
              <span className="block text-[11.5px] font-bold truncate" style={{ color: G.dim }}>{c.planName || "요금제 미지정"}{c.onlineNow ? ` · 지금 ${c.onlineNow}명` : ""}{c.over > 0 ? " · " : ""}{c.over > 0 && <span style={{ color: G.bad }}>초과 {won(c.over)}</span>}</span>
            </span>
          </div>
          {compactMode ? (
            <div className="grid grid-cols-3 gap-3 pl-8">
              <MiniMeter label="직원" used={c.staff} limit={c.seatLimit} unit="명" />
              <MiniMeter label="월 오더" used={c.orders} limit={c.orderLimit} unit="건" />
              <MiniMeter label="저장" used={c.storageGB} limit={c.limitGB} unit="GB" dec />
            </div>
          ) : (
            <>
              <MiniMeter label="직원 계정" used={c.staff} limit={c.seatLimit} unit="명" />
              <MiniMeter label="월 오더(예상)" used={c.orders} limit={c.orderLimit} unit="건" />
              <MiniMeter label="저장 용량" used={c.storageGB} limit={c.limitGB} unit="GB" dec />
            </>
          )}
          <div className={compactMode ? "pl-8" : ""}>
            <div className="flex items-baseline justify-between gap-2"><span className="text-[11px] font-bold" style={{ color: G.dim }}>운영 원가 <EstTag /></span><span className="text-[13px] font-black" style={{ ...NUM, color: G.goldHi }}>{won(c.costTotal)}</span></div>
            <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.06)" }}><div className="h-full rounded-full" style={{ width: `${(c.costTotal / maxCost) * 100}%`, background: `linear-gradient(90deg, rgba(215,188,130,.35), ${G.gold})` }} /></div>
            <div className="mt-0.5 text-[10.5px] font-bold truncate" style={{ ...NUM, color: G.dim }}>읽기 {compact(c.reads)} · 쓰기 {compact(c.writes)}{c.sampled ? "" : " (추정)"}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
export function MiniMeter({ label, used = 0, limit = 0, unit = "", dec = false }) {
  const f = (v) => (dec ? Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 1 }) : Math.round(v || 0).toLocaleString());
  const over = limit > 0 && used > limit;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-1.5 min-w-0">
        <span className="text-[11px] font-bold truncate" style={{ color: G.dim }}>{label}</span>
        <span className="text-[12.5px] font-black whitespace-nowrap" style={{ ...NUM, color: over ? G.bad : G.ink }}>{f(used)}<span className="text-[10.5px] font-bold" style={{ color: G.dim }}>{limit ? ` / ${f(limit)}` : ""}{unit}</span></span>
      </div>
      <div className="mt-1"><Meter used={used} limit={limit || 0} height={5} /></div>
      {!limit && <div className="mt-0.5 text-[10px] font-bold" style={{ color: G.dim }}>한도 없음</div>}
    </div>
  );
}

// ─── 초과 운송사(초과 금액 · 초과 데이터) ───
export function OverageList({ carriers = [], max = 6 }) {
  const list = carriers.filter((c) => c.over > 0).sort((a, b) => b.over - a.over).slice(0, max);
  if (!list.length) return <div className="py-8 text-center text-[13px] font-bold" style={{ color: G.dim }}>이번 달 한도를 넘은 운송사가 없어요</div>;
  const mx = Math.max(...list.map((c) => c.over));
  return (
    <div className="space-y-2.5">
      {list.map((c) => {
        const parts = [
          c.extra?.seats ? `직원 +${c.extra.seats}명` : "", c.extra?.orders ? `오더 +${c.extra.orders.toLocaleString()}건` : "",
          c.extra?.fleet ? `지입 ${c.extra.fleet}대` : "", c.extra?.storageGB ? `저장 +${c.extra.storageGB}GB` : "",
        ].filter(Boolean);
        return (
          <div key={c.name} className="min-w-0">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-[13.5px] font-black truncate" style={{ color: G.ink }}>{c.name}</span>
              <span className="text-[11px] font-bold shrink-0" style={{ color: G.dim }}>{c.planName}</span>
              <span className="ml-auto text-[14px] font-black whitespace-nowrap" style={{ ...NUM, color: G.bad }}>+{won(c.over)}</span>
            </div>
            <div className="mt-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.06)" }}>
              <div className="h-full rounded-full" style={{ width: `${(c.over / mx) * 100}%`, background: "linear-gradient(90deg, rgba(255,138,122,.35), #FF8A7A)" }} />
            </div>
            <div className="mt-0.5 text-[11.5px] font-bold truncate" style={{ ...NUM, color: G.sub }}>{parts.join(" · ")}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── 운송사별 서버 원가 막대(가로) ───
export function CarrierCostBars({ carriers = [], max = 10, height }) {
  const rows = carriers.slice(0, max).map((c) => ({ name: c.name, server: Math.round(c.server), direct: Math.round(c.direct) }));
  if (!rows.length) return null;
  return (
    <div style={{ height: height || Math.max(160, rows.length * 32 + 24) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(215,188,130,.07)" horizontal={false} />
          <XAxis type="number" {...AXIS} tickFormatter={short} />
          <YAxis type="category" dataKey="name" width={96} {...AXIS} tick={{ fontSize: 12, fill: G.sub, fontWeight: 700 }} />
          <Tooltip content={<AdmTip fmt={(v) => won(v)} />} cursor={{ fill: "rgba(215,188,130,.05)" }} />
          <Bar dataKey="server" name="서버(읽기·쓰기·저장)" stackId="a" fill={G.gold} barSize={14} radius={[3, 0, 0, 3]} />
          <Bar dataKey="direct" name="문자 · 세금계산서" stackId="a" fill={G.ice} barSize={14} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── 일별 서버비 막대 ───
export function DailyCostBars({ days = [], height = 150 }) {
  if (!days.length) return null;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={days} margin={{ top: 6, right: 4, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="rgba(215,188,130,.07)" vertical={false} />
          <XAxis dataKey="d" {...AXIS} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...AXIS} width={44} tickFormatter={short} />
          <Tooltip content={<AdmTip fmt={(v) => won(v)} />} cursor={{ fill: "rgba(215,188,130,.05)" }} />
          <Bar dataKey="krw" name="서버 변동비" fill={G.gold} radius={[3, 3, 0, 0]} barSize={8} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── 지금 흐르는 양(분당) — 숫자 + 흐르는 선 ───
export function FlowGauge({ label, perMin = 0, total = 0, free = 0, unit = "건" }) {
  const ratio = free ? total / free : 0;
  return (
    <div className="rounded-[14px] p-3 min-w-0" style={{ background: "rgba(255,255,255,.035)", border: `1px solid ${G.line}` }}>
      <div className="flex items-center justify-between gap-2"><span className="text-[12.5px] font-bold" style={{ color: G.sub }}>{label}</span><span className="text-[10px] font-extrabold tracking-[0.18em]" style={{ ...NUM, color: G.goldDim }}>/MIN</span></div>
      <div className="mt-1 flex items-baseline gap-1"><span className="text-[24px] font-black leading-none" style={{ ...NUM, color: "#fff" }}>{Math.round(perMin).toLocaleString()}</span><span className="text-[12px] font-bold" style={{ color: G.dim }}>{unit}/분</span></div>
      <svg viewBox="0 0 200 10" className="w-full mt-2" preserveAspectRatio="none" style={{ height: 8 }}><line x1="0" y1="5" x2="200" y2="5" stroke={G.gold} strokeWidth="2" className="adm-flow" opacity={perMin ? 0.9 : 0.15} /></svg>
      <div className="mt-1.5 text-[11.5px] font-bold truncate" style={{ ...NUM, color: G.dim }}>오늘 {Number(total).toLocaleString()}{unit}{free ? ` · 무료량 ${Math.round(ratio * 100)}%` : ""}</div>
      {free > 0 && <div className="mt-1"><Meter used={total} limit={free} height={4} /></div>}
    </div>
  );
}
