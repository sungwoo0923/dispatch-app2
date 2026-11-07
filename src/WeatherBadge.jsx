// ======================= src/WeatherBadge.jsx =======================
// 🌦 2026-11-07 기상청 단기예보 · 기상특보 — 배차 프로그램과 허브(cafe-site)가 같이 쓰는 화면 조각.
//  Firebase를 직접 부르지 않는다: 각 화면이 createWeatherStore({ call, readDoc })로 만든 store를 넘긴다.
//   · readDoc(key)  weatherCache/{key} 읽기(서버가 3시간마다 채운다) · call("weatherFor", { regions }) 없거나 오래된 곳만
//   · <WeatherBadge store address ymd time />   오더 줄 — 비 · 눈 · 강풍 · 폭염 아이콘 + 기온, 특보 지역이면 "특보" 칩
//   · <WeatherStrip store addresses />           홈 · 경영 보고 — 오더가 있는 지역 날씨 + 특보 한 줄
//  키가 없거나(서버 disabled) 자료가 없으면 아무것도 그리지 않는다.
import React from "react";
import { regionOfAddress, slotKey, weatherAt, weatherFlags, warningsFor, warnShort, WEATHER_KIND_LABEL } from "../functions/publicDataCore.mjs";
import { createWeatherStore } from "./publicDataClient.js";

export { createWeatherStore };

export function useWeather(store, keys) {
  React.useSyncExternalStore(store?.subscribe || (() => () => {}), store?.version || (() => 0), store?.version || (() => 0));
  const sig = (keys || []).filter(Boolean).join("|");
  React.useEffect(() => { if (store && sig) store.request(sig.split("|")); }, [store, sig]);
}

// ─────────────── 아이콘(선 아이콘 · currentColor) ───────────────
const P = {
  rain: <><path d="M7 15a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 7.5a3.5 3.5 0 0 1 .5 6.97" /><path d="M9 17l-1 3M13 17l-1 3M17 17l-1 3" /></>,
  snow: <><path d="M12 3v18M5.5 6.5l13 11M18.5 6.5l-13 11" /></>,
  wind: <><path d="M3 9h11a3 3 0 1 0-3-3" /><path d="M3 15h15a3 3 0 1 1-3 3" /></>,
  heat: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  cold: <><path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1 1M17.4 17.4l1 1M5.6 18.4l1-1M17.4 6.6l1-1" /></>,
  cloud: <path d="M7 18a4.5 4.5 0 0 1-.7-8.95A6 6 0 0 1 17.6 8.6 4 4 0 0 1 17 18z" />,
  warn: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>,
};
const KIND_COLOR = { rain: "#2F6FB8", snow: "#5B8FC9", wind: "#5B6B85", heat: "#C2561B", cold: "#4A6FA5", sun: "#C98A12", cloud: "#8592A8" };
export function WxIcon({ kind, size = 15, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || KIND_COLOR[kind] || "#5B6B85"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>{P[kind] || P.cloud}</svg>
  );
}
const fmtAt = (k) => (k ? `${Number(k.slice(4, 6))}/${Number(k.slice(6, 8))} ${Number(k.slice(8, 10))}시` : "");
const skyKind = (h) => (Number(h?.sky) === 1 ? "sun" : "cloud");

export function WarnChip({ warns, size = "sm" }) {
  if (!warns?.length) return null;
  const lvl = warns.some((w) => w.level === "경보");
  return (
    <span title={warnShort(warns)} data-testid="wx-warn"
      className={`inline-flex items-center gap-0.5 rounded-md font-extrabold whitespace-nowrap ${size === "sm" ? "h-[20px] px-1.5 text-[11.5px]" : "h-6 px-2 text-[12.5px]"}`}
      style={{ background: lvl ? "#FDECEC" : "#FFF4E0", color: lvl ? "#B4342A" : "#9A5B00", boxShadow: `inset 0 0 0 1px ${lvl ? "#F3C4C0" : "#F4D9A6"}` }}>
      <WxIcon kind="warn" size={11} color={lvl ? "#B4342A" : "#9A5B00"} />특보 지역
    </span>
  );
}

// 오더 줄 배지 — 날씨가 평범하면(맑음 · 흐림) 기온만 흐리게, 비 · 눈 · 강풍 · 폭염이면 아이콘을 앞에
export function WeatherBadge({ store, address, ymd, time, region: regionProp, showPlain = true, prefix = "" }) {
  const region = React.useMemo(() => regionProp || regionOfAddress(address), [regionProp, address]);
  useWeather(store, region ? [region.key] : []);
  if (!store || !region) return null;
  const doc = store.region(region.key);
  const warns = warningsFor(region, store.warn()?.active || []);
  const h = doc ? weatherAt(doc.hours, slotKey(ymd, time)) : null;
  if (!h && !warns.length) return null;
  const f = weatherFlags(h);
  const notable = f.kinds.length > 0;
  const tip = [region.short, h && fmtAt(h.at), h && f.label, h?.pop ? `강수확률 ${h.pop}%` : "", h?.wsd ? `바람 ${h.wsd}m/s` : "", h?.t !== undefined && h?.t !== null ? `${h.t}°` : "", warns.length ? warnShort(warns) : ""].filter(Boolean).join(" · ");
  if (!notable && !showPlain && !warns.length) return null;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap align-middle" title={tip} data-testid="wx-badge" data-kinds={f.kinds.join(",")}>
      {prefix && <span className="text-[12px] font-bold text-[#8592A8]">{prefix}</span>}
      {h && (notable
        ? <span className="inline-flex items-center gap-0.5 h-[20px] pl-1 pr-1.5 rounded-md bg-[#EEF3FA] text-[12px] font-extrabold text-[#1B2B4B]" style={{ boxShadow: "inset 0 0 0 1px #DCE5F2" }}>
            {f.kinds.slice(0, 2).map((k) => <WxIcon key={k} kind={k} size={13} />)}
            <span className="tabular-nums">{h.t !== null && h.t !== undefined ? `${Math.round(h.t)}°` : WEATHER_KIND_LABEL[f.kinds[0]]}</span>
          </span>
        : <span className="inline-flex items-center gap-0.5 text-[12px] font-bold text-[#8592A8] tabular-nums"><WxIcon kind={skyKind(h)} size={12} color="#A3AEC0" />{h.t !== null && h.t !== undefined ? `${Math.round(h.t)}°` : ""}</span>)}
      <WarnChip warns={warns} />
    </span>
  );
}

// 하루(그 날짜) 중 가장 궂은 시각 요약 { kinds, tmin, tmax, pop, at }
function daySummary(hours, ymd) {
  const d = String(ymd || "").replace(/[^\d]/g, "");
  const ks = Object.keys(hours || {}).filter((k) => k.startsWith(d) && Number(k.slice(8, 10)) >= 6 && Number(k.slice(8, 10)) <= 20).sort();
  if (!ks.length) return null;
  const kinds = new Set(); let tmin = Infinity, tmax = -Infinity, pop = 0;
  ks.forEach((k) => { const h = hours[k]; weatherFlags(h).kinds.forEach((x) => kinds.add(x)); if (h.t !== null && h.t !== undefined) { tmin = Math.min(tmin, h.t); tmax = Math.max(tmax, h.t); } pop = Math.max(pop, h.pop || 0); });
  const mid = hours[ks[Math.floor(ks.length / 2)]];
  return { kinds: [...kinds], tmin: Number.isFinite(tmin) ? Math.round(tmin) : null, tmax: Number.isFinite(tmax) ? Math.round(tmax) : null, pop, sky: skyKind(mid) };
}

// 홈 · 경영 보고 띠 — addresses: 주소 목록(오더의 상차 · 하차지) · ymd: 볼 날짜
export function WeatherStrip({ store, addresses, ymd, title = "오늘 운행 지역 날씨", max = 8, dark = false, large = false }) {
  const regions = React.useMemo(() => {
    const m = new Map();
    (addresses || []).forEach((a) => { const r = regionOfAddress(a); if (!r) return; const x = m.get(r.key) || { r, n: 0 }; x.n++; m.set(r.key, x); });
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 24);
  }, [addresses]);
  useWeather(store, regions.map((x) => x.r.key));
  if (!store || !regions.length) return null;
  const active = store.warn()?.active || [];
  const rows = regions.map((x) => ({ ...x, doc: store.region(x.r.key), warns: warningsFor(x.r, active) }))
    .map((x) => ({ ...x, sum: x.doc ? daySummary(x.doc.hours, ymd) : null }))
    .filter((x) => x.sum || x.warns.length);
  if (!rows.length) return null;
  // 궂은 날씨 · 특보 지역 먼저
  rows.sort((a, b) => (b.warns.length - a.warns.length) || ((b.sum?.kinds.length || 0) - (a.sum?.kinds.length || 0)) || (b.n - a.n));
  const warnTypes = [...new Set(rows.flatMap((x) => x.warns.map((w) => w.type)))];
  const shownRows = rows.slice(0, max);
  const base = rows.find((x) => x.doc?.base)?.doc?.base || "";
  const txt = dark ? "text-white" : "text-[#0F1A30]";
  const sub = dark ? "text-white/60" : "text-[#7A879C]";
  // large: 일일 경영 보고처럼 큰 글씨 화면
  const fz = large ? { title: "text-[17px]", name: "text-[15.5px]", n: "text-[13.5px]", t: "text-[15.5px]", line: "text-[14px]", meta: "text-[13px]", chip: "text-[13.5px] h-7", card: "min-w-[140px] px-3.5 py-2.5", icon: 18 }
    : { title: "text-[14px]", name: "text-[13.5px]", n: "text-[11.5px]", t: "text-[13px]", line: "text-[12px]", meta: "text-[11.5px]", chip: "text-[12.5px] h-6", card: "min-w-[118px] px-3 py-2", icon: 16 };
  return (
    <div className={`rounded-[16px] ${dark ? "bg-white/5 ring-1 ring-white/10" : "bg-white border border-[#E3E8F0]"} px-4 py-3`} data-testid="wx-strip">
      <div className="flex items-center gap-2 flex-wrap">
        <WxIcon kind="cloud" size={15} color={dark ? "#8FB0F0" : "#2D4C82"} />
        <span className={`${fz.title} font-black ${txt}`}>{title}</span>
        {warnTypes.length > 0 && <span className={`inline-flex items-center gap-1 px-2 rounded-md font-extrabold ${fz.chip}`} style={{ background: "#FFF4E0", color: "#9A5B00", boxShadow: "inset 0 0 0 1px #F4D9A6" }}><WxIcon kind="warn" size={12} color="#9A5B00" />{warnTypes.join(" · ")} 발효 중</span>}
        <span className={`ml-auto ${fz.meta} ${sub}`}>기상청 단기예보{base ? ` · ${Number(base.slice(8, 10))}시 발표` : ""}</span>
      </div>
      <div className="mt-1.5 flex gap-2 overflow-x-auto p-0.5 -mx-0.5">
        {shownRows.map((x) => (
          <div key={x.r.key} title={x.warns.length ? warnShort(x.warns) : ""}
            className={`shrink-0 ${fz.card} rounded-xl ${dark ? "bg-white/5" : "bg-[#F7F9FC]"} ${x.warns.length ? "ring-1 ring-[#F4D9A6]" : ""}`}>
            <div className="flex items-center gap-1">
              <span className={`${fz.name} font-extrabold ${txt}`}>{x.r.short}</span>
              <span className={`${fz.n} ${sub}`}>오더 {x.n}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              {x.sum ? <>
                {(x.sum.kinds.length ? x.sum.kinds.slice(0, 2) : [x.sum.sky]).map((k) => <WxIcon key={k} kind={k} size={fz.icon} />)}
                <span className={`${fz.t} font-bold tabular-nums ${txt}`}>{x.sum.tmin !== null ? `${x.sum.tmin}° / ${x.sum.tmax}°` : ""}</span>
              </> : <span className={`${fz.line} ${sub}`}>예보 없음</span>}
            </div>
            <div className={`mt-0.5 ${fz.line} font-semibold ${x.warns.length ? "text-[#9A5B00]" : sub}`}>
              {x.warns.length ? warnShort(x.warns) : x.sum?.kinds.length ? x.sum.kinds.map((k) => WEATHER_KIND_LABEL[k]).join(" · ") + (x.sum.pop ? ` ${x.sum.pop}%` : "") : x.sum?.pop >= 30 ? `강수 ${x.sum.pop}%` : "운행 무난"}
            </div>
          </div>
        ))}
        {rows.length > max && <div className={`shrink-0 self-center px-2 text-[12.5px] ${sub}`}>외 {rows.length - max}곳</div>}
      </div>
    </div>
  );
}
