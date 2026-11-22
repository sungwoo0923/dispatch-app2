// ======================= src/trafficTmap.js =======================
// 🚦 2026-11-22 관제센터 1단계 — Tmap 지도(배차 경로 보기 · 위치 보기 · 화주 화면) 교통정보 레이어
//  사용법: 지도를 만든 바로 뒤에 attachTmapTraffic(map, 지도칸 id 또는 요소) 한 줄.
//  · 지도칸 오른쪽 아래에 [교통정보] 켜기/끄기 버튼, 켜져 있으면 사고 · 공사 · 통제 아이콘.
//  · 같은 지도에 두 번 불러도 한 번만 붙는다. 지도칸이 화면에서 사라지면 스스로 정리한다.
import { ensureTrafficStyles, isTrafficOn, setTrafficOn, subscribeTrafficOn, subscribeIncidents, getIncidentState, visibleIncidents, kindMeta, eventTitle, eventTimeText, trafficStatusText } from "./trafficCore";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const llOf = (p) => (p ? { lat: typeof p.lat === "function" ? p.lat() : (p._lat ?? p.lat), lng: typeof p.lng === "function" ? p.lng() : (p._lng ?? p.lng) } : null);

function boundsOf(map) {
  try {
    const b = map.getBounds();
    const ne = llOf(b.getNorthEast ? b.getNorthEast() : b._ne), sw = llOf(b.getSouthWest ? b.getSouthWest() : b._sw);
    if (!ne || !sw || !Number.isFinite(ne.lat) || !Number.isFinite(sw.lat)) return null;
    return { north: ne.lat, south: sw.lat, east: ne.lng, west: sw.lng };
  } catch { return null; }
}
function iconHtml(ev) {
  const m = kindMeta(ev);
  return `<div style="width:28px;height:28px;border-radius:50%;background:#fff;border:3px solid ${m.color};box-shadow:0 3px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;cursor:pointer;transform:translate(0,0)">${m.icon}</div>`;
}
function popupHtml(ev) {
  const m = kindMeta(ev);
  const sub = [eventTimeText(ev), ev.lanes && `${ev.lanes} 차단`].filter(Boolean).join(" · ");
  return `<div style="position:relative;min-width:220px;max-width:270px;background:#fff;border-radius:12px;padding:10px 12px;box-shadow:0 8px 24px rgba(0,0,0,.25);font-family:'Noto Sans KR',system-ui,sans-serif;">
<button type="button" data-kp-trf-close style="position:absolute;right:6px;top:4px;border:none;background:none;font-size:16px;cursor:pointer;color:#64748B">×</button>
<div style="font-size:13.5px;font-weight:900;color:${m.color};padding-right:16px">${m.icon} ${esc(eventTitle(ev))}</div>
<div style="margin-top:5px;font-size:12px;font-weight:600;color:#374151;line-height:1.5">${esc(sub)}${ev.msg ? `<div style="margin-top:3px">${esc(ev.msg)}</div>` : ""}</div>
<button type="button" data-kp-cctv="${esc(ev.id)}" style="margin-top:8px;width:100%;height:30px;border-radius:8px;border:none;background:#1B2B4B;color:#fff;font-size:12px;font-weight:800;cursor:pointer">📹 근처 CCTV 보기</button></div>`;
}

export function attachTmapTraffic(map, elOrId) {
  const T = typeof window !== "undefined" ? window.Tmapv2 : null;
  const el = typeof elOrId === "string" ? document.getElementById(elOrId) : elOrId;
  if (!T || !map || !el) return () => {};
  if (map.__kpTraffic) return map.__kpTraffic;
  ensureTrafficStyles();
  if (getComputedStyle(el).position === "static") el.style.position = "relative";

  let markers = [], info = null, byId = new Map(), dead = false;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("data-kp", "traffic-toggle");
  Object.assign(btn.style, { position: "absolute", right: "10px", bottom: "10px", zIndex: "1000" });
  el.appendChild(btn);

  const clear = () => { markers.forEach((mk) => { try { mk.setMap(null); } catch { /* 무시 */ } }); markers = []; };
  const closeInfo = () => { if (info) { try { info.setMap(null); } catch { /* 무시 */ } info = null; } };
  const renderBtn = (count) => {
    const on = isTrafficOn();
    const st = getIncidentState();
    const note = on ? trafficStatusText(st) : "";
    btn.style.display = st.status === "unavailable" ? "none" : "";
    btn.className = `kp-trf-btn l ${on ? "on" : ""}`;
    btn.title = on ? `교통정보 끄기${note ? ` — ${note}` : ""}` : "교통정보 켜기 — 사고 · 공사 · 통제를 지도에 보여 줘요";
    btn.innerHTML = `<span class="dot" style="background:${on ? (note ? "#F59E0B" : "#EF4444") : "#94A3B8"}"></span>교통정보 ${on ? (note ? (st.status === "no-key" ? "연결 전" : "…") : count) : "꺼짐"}`;
  };
  const render = () => {
    if (dead) return;
    if (!el.isConnected) { detach(); return; }
    clear();
    byId = new Map();
    if (!isTrafficOn()) { closeInfo(); renderBtn(0); return; }
    let zoom = null; try { zoom = map.getZoom(); } catch { /* 무시 */ }
    const list = visibleIncidents(getIncidentState().items, boundsOf(map), zoom);
    for (const ev of list) {
      byId.set(ev.id, ev);
      try {
        const mk = new T.Marker({ position: new T.LatLng(ev.lat, ev.lng), map, iconHTML: iconHtml(ev), iconSize: new T.Size(28, 28), title: eventTitle(ev) });
        mk.addListener("click", () => {
          closeInfo();
          info = new T.InfoWindow({ position: new T.LatLng(ev.lat, ev.lng), content: popupHtml(ev), type: 2, border: "0px", background: "transparent", map });
        });
        markers.push(mk);
      } catch { /* SDK 차이 — 아이콘 하나 실패해도 계속 */ }
    }
    renderBtn(list.length);
  };
  const onClick = (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest("[data-kp-trf-close]")) { e.stopPropagation(); closeInfo(); return; }
    const c = t.closest("[data-kp-cctv]");
    if (c) {
      e.stopPropagation();
      const ev = byId.get(c.getAttribute("data-kp-cctv"));
      if (ev) import("./trafficCctv").then((m) => m.openCctv(ev));
    }
  };
  btn.addEventListener("click", (e) => { e.stopPropagation(); setTrafficOn(!isTrafficOn()); });
  el.addEventListener("click", onClick, true);

  let unInc = null;
  const syncSub = () => {
    if (isTrafficOn() && !unInc) unInc = subscribeIncidents(render);
    if (!isTrafficOn() && unInc) { unInc(); unInc = null; }
    render();
  };
  const unOn = subscribeTrafficOn(syncSub);
  const listeners = [];
  ["dragend", "zoom_changed"].forEach((evName) => { try { listeners.push(map.addListener(evName, render)); } catch { /* 무시 */ } });

  function detach() {
    if (dead) return;
    dead = true;
    unOn(); if (unInc) unInc();
    clear(); closeInfo();
    el.removeEventListener("click", onClick, true);
    if (btn.parentNode) btn.parentNode.removeChild(btn);
    try { listeners.forEach((l) => l && map.removeListener && map.removeListener(l)); } catch { /* 무시 */ }
    delete map.__kpTraffic;
  }
  map.__kpTraffic = detach;
  syncSub();
  return detach;
}
