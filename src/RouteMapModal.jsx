import React from "react";
import { db } from "./firebase";
import { collection, doc, onSnapshot, query, where, orderBy } from "firebase/firestore";

function kstDateStr(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

// ⭐ 주소 → 좌표 변환 — PC(배차관리 3파트 배차요청장)와 모바일에서 공용으로 쓰는
// Tmap 지오코딩 헬퍼. 원본 주소 → 지번 변환 → 주소 축소 순으로 재시도해서
// 도로명 주소도 최대한 좌표로 바꿔낸다.
const TMAP_KEY = "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer";

function cleanAddrForGeo(a) {
  return String(a || "").replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
}

async function geocodeOnce(address) {
  try {
    const url = "https://apis.openapi.sk.com/tmap/geo/fullAddrGeo?version=1&format=json&fullAddr=" + encodeURIComponent(address);
    const res = await fetch(url, { method: "GET", headers: { Accept: "application/json", appKey: TMAP_KEY } });
    const data = await res.json();
    const coord = data?.coordinateInfo?.coordinate?.[0];
    if (!coord) return null;
    return { lat: parseFloat(coord.lat), lon: parseFloat(coord.lon) };
  } catch {
    return null;
  }
}

async function convertToJibun(address) {
  try {
    const res = await fetch("https://apis.openapi.sk.com/tmap/geo/convertAddress?version=1&format=json", {
      method: "POST",
      headers: { appKey: TMAP_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ address, coordType: "WGS84GEO" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.addressInfo?.fullAddress || null;
  } catch {
    return null;
  }
}

function shortenAddress(address) {
  const parts = address.split(" ");
  const results = [];
  for (let i = parts.length; i >= 2; i--) results.push(parts.slice(0, i).join(" "));
  return results;
}

export async function geocodeTmapAddr(addr) {
  if (!addr || !addr.trim()) return null;
  try {
    const cleaned = cleanAddrForGeo(addr);
    let result = await geocodeOnce(cleaned);
    if (result) return result;
    const jibun = await convertToJibun(cleaned);
    if (jibun) {
      result = await geocodeOnce(jibun);
      if (result) return result;
    }
    for (const shortAddr of shortenAddress(cleaned)) {
      result = await geocodeOnce(shortAddr);
      if (result) return result;
    }
    return null;
  } catch {
    return null;
  }
}

// ⭐ 사용자 요청 — 경로보기에 "예정 경로"뿐 아니라 기사의 실제 GPS 이동 동선과
// 현재 위치도 같이 보여준다(아래 live 아이콘 — 녹색 점선이 실제 이동 경로).
function makeLiveIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="17" fill="#16a34a" stroke="white" stroke-width="3"/>
      <text x="20" y="26" text-anchor="middle" font-size="18">🚚</text>
    </svg>
  `;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

function makePinIcon(label, color) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="80" viewBox="0 0 60 80">
      <rect x="2" y="2" width="56" height="26" rx="13" ry="13" fill="${color}" stroke="white" stroke-width="2"/>
      <text x="30" y="20" text-anchor="middle" font-size="13" font-weight="bold" font-family="sans-serif" fill="white">${label}</text>
      <polygon points="25,26 35,26 30,36" fill="${color}"/>
      <circle cx="30" cy="60" r="9" fill="${color}" stroke="white" stroke-width="3"/>
      <line x1="30" y1="36" x2="30" y2="51" stroke="${color}" stroke-width="3"/>
    </svg>
  `;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

// ⭐ 경로보기 팝업 — 오더정보/등록화면 등 어디서든 상/하차지 주소만 넘기면 Tmap
// 위에 실제 도로 경로(폴리라인)와 출발/도착(+경유) 마커를 그려준다. PC/모바일 공용.
// 디자인은 프로그램 전체 톤(네이비 헤더 + 무채색)에 맞춰 알록달록한 색 없이 구성.
export default function RouteMapModal({ pickupAddr, dropAddr, pickupName, dropName, viaPickup = [], viaDrop = [], driverId, orderDate, onClose }) {
  const mapId = React.useRef(`route-map-modal-${Math.random().toString(36).slice(2)}`).current;
  const [status, setStatus] = React.useState("loading"); // loading | ready | error
  const [info, setInfo] = React.useState(null); // { distanceKm, durationMin }
  const mapObjRef = React.useRef(null);
  const driverMarkerRef = React.useRef(null);
  const driverPolylineRef = React.useRef(null);
  const [driverTrack, setDriverTrack] = React.useState([]);
  const [liveLoc, setLiveLoc] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Tmap 스크립트 + 지도 DOM이 준비될 때까지 대기(최대 2초)
      for (let i = 0; i < 40; i++) {
        if (window.Tmapv2 && document.getElementById(mapId)) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      if (cancelled) return;
      if (!window.Tmapv2 || !document.getElementById(mapId)) { setStatus("error"); return; }

      const start = await geocodeTmapAddr(pickupAddr);
      if (cancelled) return;
      const end = await geocodeTmapAddr(dropAddr);
      if (cancelled) return;
      if (!start || !end) { setStatus("error"); return; }

      const map = new window.Tmapv2.Map(mapId, {
        center: new window.Tmapv2.LatLng(start.lat, start.lon),
        width: "100%",
        height: "100%",
        zoom: 11,
      });
      mapObjRef.current = map;

      const API_BASE = import.meta.env.VITE_API_BASE || "";
      const viaAddrs = [...viaPickup, ...viaDrop].filter(Boolean);
      let routeData = null;
      try {
        const res = await fetch(`${API_BASE}/api/route`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromAddr: pickupAddr, toAddr: dropAddr, viaPoints: viaAddrs }),
        });
        routeData = await res.json();
      } catch {}
      if (cancelled) return;

      if (!routeData?.path?.length) { setStatus("error"); return; }

      const linePath = routeData.path.map(([lng, lat]) => new window.Tmapv2.LatLng(lat, lng));
      if (!linePath.length) { setStatus("error"); return; }

      new window.Tmapv2.Polyline({ path: linePath, strokeColor: "#1B2B4B", strokeWeight: 5, map });

      const bounds = new window.Tmapv2.LatLngBounds();
      linePath.forEach((p) => { if (p) bounds.extend(p); });
      if (!bounds.isEmpty()) map.fitBounds(bounds);

      const markerStart = linePath[0];
      const markerEnd = linePath[linePath.length - 1];
      if (markerStart && markerEnd) {
        new window.Tmapv2.Marker({ position: markerStart, map, icon: makePinIcon("출발", "#1B2B4B"), iconSize: new window.Tmapv2.Size(60, 80), iconAnchor: new window.Tmapv2.Point(30, 80) });
        new window.Tmapv2.Marker({ position: markerEnd, map, icon: makePinIcon("도착", "#374151"), iconSize: new window.Tmapv2.Size(60, 80), iconAnchor: new window.Tmapv2.Point(30, 80) });
      }

      for (let vi = 0; vi < viaPickup.length; vi++) {
        if (cancelled) return;
        const vCoord = await geocodeTmapAddr(viaPickup[vi]);
        if (cancelled) return;
        if (vCoord) {
          new window.Tmapv2.Marker({ position: new window.Tmapv2.LatLng(vCoord.lat, vCoord.lon), map, icon: makePinIcon(`상${vi + 1}`, "#6b7280"), iconSize: new window.Tmapv2.Size(60, 80), iconAnchor: new window.Tmapv2.Point(30, 80) });
        }
      }
      for (let vi = 0; vi < viaDrop.length; vi++) {
        if (cancelled) return;
        const vCoord = await geocodeTmapAddr(viaDrop[vi]);
        if (cancelled) return;
        if (vCoord) {
          new window.Tmapv2.Marker({ position: new window.Tmapv2.LatLng(vCoord.lat, vCoord.lon), map, icon: makePinIcon(`하${vi + 1}`, "#6b7280"), iconSize: new window.Tmapv2.Size(60, 80), iconAnchor: new window.Tmapv2.Point(30, 80) });
        }
      }

      setInfo({ distanceKm: Number(routeData.distanceKm) || 0, durationMin: Number(routeData.durationMin) || 0 });
      setStatus("ready");
    };

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupAddr, dropAddr]);

  // ⭐ 사용자 요청 — 기사의 실제 이동 동선(오늘자 gps_tracks)과 현재 위치(drivers/{id}.location)를
  // 실시간 구독한다. driverId가 없으면(다른 화면에서 호출된 예정경로 전용 사용) 아무것도 하지 않는다.
  React.useEffect(() => {
    if (!driverId) { setDriverTrack([]); setLiveLoc(null); return; }
    const dateStr = orderDate || kstDateStr();
    const unsubTrack = onSnapshot(
      query(collection(db, "gps_tracks"), where("driverId", "==", driverId), where("date", "==", dateStr), orderBy("timestamp", "asc")),
      (snap) => {
        const pts = snap.docs
          .map((d) => d.data())
          .filter((p) => p.lat != null && p.lng != null)
          .map((p) => ({ lat: p.lat, lng: p.lng }));
        setDriverTrack(pts);
      },
      () => setDriverTrack([])
    );
    const unsubLive = onSnapshot(
      doc(db, "drivers", driverId),
      (snap) => {
        const loc = snap.exists() ? snap.data()?.location : null;
        setLiveLoc(loc && loc.lat != null && loc.lng != null ? { lat: loc.lat, lng: loc.lng } : null);
      },
      () => setLiveLoc(null)
    );
    return () => { unsubTrack(); unsubLive(); };
  }, [driverId, orderDate]);

  // 지도가 준비된 뒤(status==="ready") 또는 새 GPS 데이터가 들어올 때마다 실제 이동
  // 경로(녹색 점선)와 현재 위치 마커를 다시 그린다.
  React.useEffect(() => {
    const map = mapObjRef.current;
    if (!map || !window.Tmapv2 || status !== "ready") return;

    if (driverPolylineRef.current) { driverPolylineRef.current.setMap(null); driverPolylineRef.current = null; }
    if (driverTrack.length >= 2) {
      const path = driverTrack.map((p) => new window.Tmapv2.LatLng(p.lat, p.lng));
      driverPolylineRef.current = new window.Tmapv2.Polyline({
        path, strokeColor: "#16a34a", strokeWeight: 5, strokeStyle: "dashed", map,
      });
    }

    if (driverMarkerRef.current) { driverMarkerRef.current.setMap(null); driverMarkerRef.current = null; }
    if (liveLoc) {
      driverMarkerRef.current = new window.Tmapv2.Marker({
        position: new window.Tmapv2.LatLng(liveLoc.lat, liveLoc.lng),
        map,
        icon: makeLiveIcon(),
        iconSize: new window.Tmapv2.Size(40, 40),
        iconAnchor: new window.Tmapv2.Point(20, 20),
      });
    }
  }, [driverTrack, liveLoc, status]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999999] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[720px] max-w-full h-[560px] max-h-[88vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="text-white font-bold text-[14px]">경로보기</div>
            <div className="text-white/60 text-[11px] mt-0.5 truncate">
              {pickupName || pickupAddr || "-"} → {dropName || dropAddr || "-"}
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white text-base flex items-center justify-center shrink-0">×</button>
        </div>
        <div className="flex-1 relative bg-gray-100">
          <div id={mapId} className="w-full h-full" />
          {status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold text-gray-500 bg-white/80">경로를 불러오는 중...</div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold text-gray-500 bg-white/80">경로 정보를 가져올 수 없습니다</div>
          )}
          {driverId && status === "ready" && (
            <div className="absolute left-3 bottom-3 bg-white/90 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 flex items-center gap-3 shadow">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#1B2B4B]" />예정 경로</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#16a34a]" style={{ borderTop: "2px dashed #16a34a", background: "none" }} />실제 이동 · 현재위치</span>
            </div>
          )}
        </div>
        {info && (
          <div className="px-5 py-3 border-t border-gray-100 flex gap-3 shrink-0">
            <div className="flex-1 border border-gray-200 rounded-lg py-2 text-center bg-gray-50">
              <div className="text-[10px] text-gray-500 mb-0.5">총 거리</div>
              <div className="text-[15px] font-black text-[#1B2B4B]">
                {info.distanceKm.toFixed(1)}<span className="text-[10px] font-semibold text-gray-500 ml-0.5">km</span>
              </div>
            </div>
            <div className="flex-1 border border-gray-200 rounded-lg py-2 text-center bg-gray-50">
              <div className="text-[10px] text-gray-500 mb-0.5">예상 시간</div>
              <div className="text-[15px] font-black text-[#1B2B4B]">
                {info.durationMin}<span className="text-[10px] font-semibold text-gray-500 ml-0.5">분</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
