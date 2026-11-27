// ======================= src/dispatch/OrderRouteMapPanel.jsx =======================
// 🗺 2026-11-27 시안 L(사용자 확정) — 오더등록 오른쪽에 늘 떠 있는 실시간 경로 지도(티맵)
//  · 상차지 · 하차지 주소가 둘 다 들어오면 0.7초 뒤 경로를 바로 그린다(구간별 교통 색) · 주소가 바뀌면 다시
//  · 아래: 거리 · 예상 시간(상차시간 기준 도착 예상) · 예상 유류비(톤수별 연비 × 오늘 경유값) · 통행료(티맵)
import React from "react";
import { loadTmap } from "../tmapLoader";
import { drawTmapTrafficRoute, clearTmapOverlays, TRAFFIC_LEGEND } from "../mapStyle";

const NUM = { fontVariantNumeric: "tabular-nums" };
// 톤수별 기준 연비(km/L) — 회사 값이 따로 없을 때 쓰는 보통 값
export const FUEL_EFF = [[1, 9], [1.4, 8], [2.5, 7], [3.5, 6.5], [5, 4.5], [8, 4], [11, 3.5], [18, 3], [99, 2.8]];
const effOf = (ton) => { const t = parseFloat(String(ton || "").replace(/[^\d.]/g, "")); if (!t) return null; return (FUEL_EFF.find(([max]) => t <= max) || FUEL_EFF[FUEL_EFF.length - 1])[1]; };
const dieselPrice = () => {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("fuelCache_"));
    for (const k of ["fuelCache_01", ...keys]) {
      const arr = JSON.parse(localStorage.getItem(k) || "null");
      const d = Array.isArray(arr) ? arr.find((o) => String(o?.PRODNM || "").includes("경유")) : null;
      const v = Number(String(d?.PRICE ?? "").replace(/,/g, ""));
      if (v > 0) return v;
    }
  } catch { /* 무시 */ }
  return null;
};
// "오전 9시 30분" · "09:30" → 분
const minOf = (t) => {
  const s = String(t || ""); const m = /(\d{1,2})\s*(?::|시)\s*(\d{1,2})?/.exec(s); if (!m) return null;
  let h = +m[1]; const mi = +(m[2] || 0); if (/오후/.test(s) && h < 12) h += 12; if (/오전/.test(s) && h === 12) h = 0; return h * 60 + mi;
};
const hm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`);
const won = (n) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
const pin = (label, color) => "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="44" height="54" viewBox="0 0 44 54"><path d="M22 52s-18-16-18-30a18 18 0 1 1 36 0c0 14-18 30-18 30z" fill="${color}" stroke="#fff" stroke-width="3"/><text x="22" y="27" font-family="Noto Sans KR,Arial" font-size="15" font-weight="900" fill="#fff" text-anchor="middle">${label}</text></svg>`);

export default function OrderRouteMapPanel({ form, onOpenBig, height }) {
  const mapId = React.useRef(`order-route-map-${Math.random().toString(36).slice(2)}`).current;
  const mapRef = React.useRef(null);
  const overlays = React.useRef([]);
  const [ready, setReady] = React.useState(false);
  const [state, setState] = React.useState("idle"); // idle | loading | ready | error
  const [info, setInfo] = React.useState(null);
  const from = String(form?.상차지주소 || "").trim(), to = String(form?.하차지주소 || "").trim();

  // 지도는 늘 띄워 둔다(주소가 없어도 수도권 지도)
  React.useEffect(() => {
    let off = false;
    (async () => {
      await loadTmap().catch(() => {});
      for (let i = 0; i < 60 && !(window.Tmapv2?.Map && document.getElementById(mapId)); i++) await new Promise((r) => setTimeout(r, 50));
      if (off || !window.Tmapv2?.Map || !document.getElementById(mapId)) return;
      mapRef.current = new window.Tmapv2.Map(mapId, { center: new window.Tmapv2.LatLng(37.45, 127.05), width: "100%", height: "100%", zoom: 9 });
      setReady(true);
    })();
    return () => { off = true; };
  }, [mapId]);
  // 패널 크기가 바뀌면 지도 크기도
  React.useEffect(() => { try { mapRef.current?.resize?.(); } catch { /* 무시 */ } }, [height]);

  React.useEffect(() => {
    const map = mapRef.current; if (!ready || !map) return undefined;
    clearTmapOverlays(overlays.current); overlays.current = [];
    if (!from || !to) { setState("idle"); setInfo(null); return undefined; }
    setState("loading");
    let off = false;
    const t = setTimeout(async () => {
      let r = null;
      try {
        const API_BASE = import.meta.env.VITE_API_BASE || "";
        const vias = [...(form?.경유상차목록 || []), ...(form?.경유하차목록 || [])].map((x) => x?.주소).filter(Boolean);
        const res = await fetch(`${API_BASE}/api/route`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromAddr: from, toAddr: to, viaPoints: vias }) });
        r = await res.json();
      } catch { r = null; }
      if (off) return;
      if (!r?.path?.length) { setState("error"); setInfo(null); return; }
      const T = window.Tmapv2;
      overlays.current = drawTmapTrafficRoute(map, r, { weight: 7 }) || [];
      const path = r.path.map(([lng, lat]) => new T.LatLng(lat, lng));
      const s = path[0], e = path[path.length - 1];
      overlays.current.push(new T.Marker({ position: s, map, icon: pin("상", "#1B2B4B"), iconSize: new T.Size(44, 54), iconAnchor: new T.Point(22, 54) }));
      overlays.current.push(new T.Marker({ position: e, map, icon: pin("하", "#2D4C82"), iconSize: new T.Size(44, 54), iconAnchor: new T.Point(22, 54) }));
      const b = new T.LatLngBounds(); path.forEach((p) => b.extend(p)); try { map.fitBounds(b, 60); } catch { map.fitBounds(b); }
      setInfo({ km: Number(r.distanceKm) || 0, min: Number(r.durationMin) || 0, toll: r.tollFare });
      setState("ready");
    }, 700);
    return () => { off = true; clearTimeout(t); };
  }, [ready, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const startMin = minOf(form?.상차시간);
  const eta = info ? hm((startMin ?? (new Date().getHours() * 60 + new Date().getMinutes())) + info.min) : "";
  const eff = effOf(form?.차량톤수);
  const price = dieselPrice();
  const fuel = info && eff && price ? (info.km / eff) * price : null;
  const zoom = (d) => { try { mapRef.current?.setZoom(mapRef.current.getZoom() + d); } catch { /* 무시 */ } };

  const Stat = ({ lbl, val, sub, dark }) => (
    <div className="rounded-[14px] px-3.5 py-3" style={dark ? { background: "linear-gradient(135deg,#0F1A30,#1B2B4B 60%,#2D4C82)", color: "#fff" } : { background: "#F4F7FB" }}>
      <div className={`text-[11.5px] font-extrabold ${dark ? "text-[#8FB0F0]" : "text-[#5E6B82]"}`}>{lbl}</div>
      <div className={`${dark ? "text-[23px]" : "text-[20px]"} font-black tracking-tight mt-0.5`} style={NUM}>{val}</div>
      <div className={`text-[11.5px] font-bold mt-0.5 ${dark ? "text-[#C9D3E3]" : "text-[#6B7890]"}`}>{sub}</div>
    </div>
  );
  return (
    <aside data-kp="order-route-map" className="flex flex-col bg-white border border-[#E1E7F0] rounded-[20px] overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_40px_rgba(16,24,40,0.08)]" style={{ height }}>
      <div className="px-4 py-3 flex items-center gap-2.5 border-b border-[#EEF2F8]">
        <span className="w-[26px] h-[26px] rounded-[8px] grid place-items-center shadow-[0_3px_8px_rgba(15,26,48,0.25)]" style={{ background: "linear-gradient(135deg,#0F1A30,#2D4C82)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h8a3 3 0 000-6H8a3 3 0 010-6h8" /></svg>
        </span>
        <div className="leading-tight"><div className="text-[10px] font-extrabold tracking-[0.22em] text-[#2D4C82]">LIVE ROUTE</div><div className="text-[15px] font-black text-[#0F1A30]">실시간 경로</div></div>
        <span className="ml-auto h-[26px] inline-flex items-center gap-1.5 px-2.5 rounded-[8px] bg-[#EEF3FB] text-[11.5px] font-black text-[#1B2B4B]"><span className="w-[7px] h-[7px] rounded-full bg-[#2EB67D]" />TMAP 실시간 교통</span>
      </div>
      <div className="relative flex-1 min-h-0 bg-[#EEF2F7]">
        <div id={mapId} className="absolute inset-0" />
        {(form?.상차지명 || from) && (
          <div className="absolute left-3 right-3 top-3 flex flex-col gap-1.5 pointer-events-none" style={{ zIndex: 5 }}>
            {[["상", form?.상차지명 || from, form?.상차시간 || "", false], ["하", form?.하차지명 || to, info ? `도착 예상 ${eta}` : form?.하차시간 || "", true]].filter(([, n]) => n).map(([t, n, r, o]) => (
              <div key={t} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/95 shadow-[0_6px_16px_rgba(15,26,48,0.12)] text-[12.5px]">
                <span className={`text-[11px] font-black rounded-md px-1.5 py-0.5 ${o ? "bg-white text-[#1B2B4B] shadow-[inset_0_0_0_1.5px_#1B2B4B]" : "bg-[#1B2B4B] text-white"}`}>{t}</span>
                <b className="truncate text-[#0F1A30]">{n}</b><span className="ml-auto text-[#5E6B82] whitespace-nowrap">{r}</span>
              </div>))}
          </div>
        )}
        {state !== "ready" && (
          <div className="absolute left-3 bottom-3 h-[30px] inline-flex items-center px-3 rounded-[10px] bg-[#0F1A30]/90 text-white text-[12px] font-extrabold" style={{ zIndex: 5 }}>
            {state === "loading" ? "경로를 찾는 중…" : state === "error" ? "경로를 못 찾았어요 · 주소를 확인해 주세요" : "주소를 넣으면 경로가 바로 그려져요"}
          </div>
        )}
        {state === "ready" && (
          <div className="absolute left-3 bottom-3 bg-white/95 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-[#3A4A66] flex items-center gap-2.5 shadow" style={{ zIndex: 5 }}>
            {TRAFFIC_LEGEND.map((x) => <span key={x.c} className="flex items-center gap-1"><span className="inline-block w-4 h-1.5 rounded" style={{ background: x.color }} />{x.label}</span>)}
          </div>
        )}
        <div className="absolute right-3 bottom-3 flex flex-col gap-1.5" style={{ zIndex: 5 }}>
          {[["+", 1], ["−", -1]].map(([l, d]) => <button key={l} type="button" tabIndex={-1} onClick={() => zoom(d)} className="w-[34px] h-[34px] rounded-[10px] bg-white border border-[#DCE2EC] text-[#1B2B4B] font-black shadow-sm hover:bg-[#F3F6FB]">{l}</button>)}
        </div>
      </div>
      <div className="p-3.5 grid grid-cols-2 gap-2.5 border-t border-[#EEF2F8]">
        <Stat dark lbl="거리" val={info ? `${info.km.toFixed(1)}km` : "—"} sub="실제 도로 기준" />
        <Stat dark lbl="예상 시간" val={info ? dur(info.min) : "—"} sub={info ? `${startMin != null ? `${form.상차시간} 출발` : "지금 출발"} → 도착 ${eta}` : "상 · 하차 주소를 넣어요"} />
        <Stat lbl="예상 유류비" val={fuel ? won(fuel) : "—"} sub={eff ? `${form?.차량톤수 || ""} · ${eff}km/L · 경유 ${price ? `${Math.round(price).toLocaleString()}원/L` : "-"}` : "차량톤수를 넣으면 계산해요"} />
        <Stat lbl="통행료" val={info ? (info.toll ? won(info.toll) : info.toll === 0 ? "없음" : "—") : "—"} sub="티맵 경로 기준" />
        <button type="button" tabIndex={-1} onClick={onOpenBig} disabled={!from || !to}
          className="col-span-2 h-10 rounded-[11px] border border-[#DCE2EC] bg-white text-[13px] font-extrabold text-[#1B2B4B] hover:bg-[#F3F6FB] disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>경로 크게 보기 · 경유지 포함
        </button>
      </div>
    </aside>
  );
}
