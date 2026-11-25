// ======================= src/trafficLayer.jsx =======================
// 🚦 2026-11-22 관제센터 1단계 — Leaflet 지도(관제 · 지입차 관제현황 · 기사 지도 · 모바일) 공용 교통정보 레이어
//  사용법: <MapContainer> 안에 <TrafficOverlay /> 한 줄. 지도 오른쪽 아래에 [교통정보] 켜기/끄기 버튼이 생기고,
//  켜져 있으면 사고 · 공사 · 통제 아이콘이 뜬다. 아이콘을 누르면 설명 + [CCTV 보기].
import React from "react";
import { createPortal } from "react-dom";
import { Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { ensureTrafficStyles, useTrafficOn, useLongWorkOn, useIncidents, visibleIncidents, kindMeta, eventTimeText, trafficStatusText, prettyMessage, isLongWork } from "./trafficCore";
import { openCctv } from "./trafficCctv";
export { ensureTrafficStyles };

const _icons = new Map();
export function incidentIcon(ev, big = false) {
  const m = kindMeta(ev);
  const k = `${m.label}|${big ? 1 : 0}`;
  let ic = _icons.get(k);
  if (!ic) {
    const s = big ? 34 : 28;
    const pulse = ev.kind === "accident" || ev.blocked
      ? `<span style="position:absolute;inset:-5px;border-radius:50%;background:${m.color};opacity:.3;animation:kpTrfPing 1.8s cubic-bezier(0,0,.2,1) infinite;"></span>` : "";
    ic = L.divIcon({
      html: `<div style="position:absolute;left:0;top:0;transform:translate(-50%,-50%);width:${s}px;height:${s}px;">${pulse}<div style="position:relative;width:100%;height:100%;border-radius:50%;background:#fff;border:3px solid ${m.color};box-shadow:0 3px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:${big ? 17 : 14}px;line-height:1;">${m.icon}</div></div>`,
      className: "", iconSize: [0, 0], iconAnchor: [0, 0],
    });
    _icons.set(k, ic);
  }
  return ic;
}

// 🚦 2026-11-22 ITS 원문("<공사>::국회대로::…")을 읽기 쉽게: 어디 · 몇 차로 · 내용 줄 · 언제부터 · 기관
export function IncidentPopupBody({ ev }) {
  const m = kindMeta(ev);
  const pm = prettyMessage(ev.msg, ev.road);
  const when = [eventTimeText(ev), pm.org].filter(Boolean).join(" · ");
  return (
    <div style={{ minWidth: 220, maxWidth: 280 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: "#fff", background: m.color, borderRadius: 6, padding: "2px 7px" }}>{m.icon} {m.label}</span>
        {isLongWork(ev) && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#64748B" }}>장기 공사</span>}
      </div>
      <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900, color: "#111827", lineHeight: 1.35 }}>{pm.where || ev.road || m.label}</div>
      {(pm.lanes || ev.lanes) && <div style={{ marginTop: 2, fontSize: 12, fontWeight: 800, color: m.color }}>{pm.lanes || `${ev.lanes} 차단`}</div>}
      {pm.lines.length > 0 && (
        <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
          {pm.lines.slice(0, 4).map((l, i) => <li key={i} style={{ fontSize: 12, fontWeight: 600, color: "#374151", lineHeight: 1.45 }}>· {l}</li>)}
        </ul>
      )}
      {when && <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "#6B7280" }}>{when}</div>}
      <button type="button" onClick={() => openCctv(ev)}
        style={{ marginTop: 8, width: "100%", height: 30, borderRadius: 8, border: "none", background: "#1B2B4B", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
        📹 근처 CCTV 보기
      </button>
    </div>
  );
}

// 지도 위 켜기/끄기 버튼(지도 칸 안에 붙는다)
export function TrafficToggle({ dark = false, style, count, status }) {
  const [on, setOn] = useTrafficOn();
  const [lw, setLw] = useLongWorkOn();
  ensureTrafficStyles();
  const note = on ? trafficStatusText(status) : "";
  return (
    <div className="kp-trf-row" style={style}>
    {on && !note && (
      <button type="button" className={`kp-trf-btn sub ${dark ? "d" : "l"} ${lw ? "on" : ""}`} data-kp="traffic-longwork"
        title={lw ? "장기 공사 숨기기" : "몇 달째 이어지는 부분통제 공사도 보기"} onClick={(e) => { e.stopPropagation(); setLw(!lw); }}>
        🚧 장기 공사 {lw ? "숨기기" : "보기"}
      </button>
    )}
    <button type="button" className={`kp-trf-btn ${dark ? "d" : "l"} ${on ? "on" : ""}`} style={style} data-kp="traffic-toggle"
      title={on ? `교통정보 끄기${note ? ` — ${note}` : ""}` : "교통정보 켜기: 사고 · 공사 · 통제를 지도에 보여 줘요"}
      onClick={(e) => { e.stopPropagation(); setOn(!on); }}>
      <span className="dot" style={{ background: on ? (note ? "#F59E0B" : "#EF4444") : "#94A3B8" }} />
      교통정보 {on ? (note ? (status?.status === "no-key" ? "연결 전" : "…") : count != null ? count : "켜짐") : "꺼짐"}
    </button>
    </div>
  );
}

function boundsOf(map) {
  const b = map.getBounds();
  return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
}

// <MapContainer> 안에 넣는다
export function TrafficOverlay({ dark = false, position = { right: 10, bottom: 26 }, showToggle = true, highlight }) {
  const map = useMap();
  const [on] = useTrafficOn();
  const [lw] = useLongWorkOn();
  const st = useIncidents(on);
  const [view, setView] = React.useState(() => ({ b: boundsOf(map), z: map.getZoom() }));
  useMapEvents({ moveend: () => setView({ b: boundsOf(map), z: map.getZoom() }) });
  ensureTrafficStyles();
  const items = React.useMemo(() => (on ? visibleIncidents(st.items, view.b, view.z, { longWork: lw }) : []), [on, lw, st.items, view]);
  const holder = React.useMemo(() => {
    const el = L.DomUtil.create("div");
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    return el;
  }, []);
  React.useEffect(() => {
    if (!showToggle) return undefined;
    const c = map.getContainer();
    c.appendChild(holder);
    return () => { if (holder.parentNode) holder.parentNode.removeChild(holder); };
  }, [map, holder, showToggle]);
  Object.assign(holder.style, { position: "absolute", zIndex: 1000, ...Object.fromEntries(Object.entries(position).map(([k, v]) => [k, typeof v === "number" ? `${v}px` : v])) });
  return (
    <>
      {items.map((ev) => (
        <Marker key={ev.id} position={[ev.lat, ev.lng]} icon={incidentIcon(ev, highlight && highlight.has(ev.id))}
          zIndexOffset={ev.kind === "accident" || ev.blocked ? 300 : 100}>
          <Popup className="kp-trf-pop" autoPan><IncidentPopupBody ev={ev} /></Popup>
        </Marker>
      ))}
      {showToggle && st.status !== "unavailable" && createPortal(<TrafficToggle dark={dark} count={st.status === "ok" ? items.length : null} status={st} />, holder)}
    </>
  );
}
