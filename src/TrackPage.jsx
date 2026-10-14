// ===================== 화주용 배송 추적 페이지 (/track, 로그인 없음) =====================
// 링크(id·컬렉션·토큰)로 오더 1건만 조회한다. 운임 등 금액 정보는 보여주지 않는다.
// 차량 위치는 liveLocations/{오더id}(기사용 링크 m=driver·업로드 링크 위치공유가 기록)에서 읽는다.
import React, { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { doc, onSnapshot, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { db } from "./firebase";
import { geocodeAddress, getDrivingRouteByCoords } from "./tmapFareCalc";

const NAVY = "#1B2B4B";
const tsMs = (v) => (v?.toMillis ? v.toMillis() : typeof v?.seconds === "number" ? v.seconds * 1000 : typeof v === "number" ? v : 0);
const hm = (ms) => { if (!ms) return ""; const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const maskName = (n) => { const s = String(n || "").trim(); if (s.length <= 1) return s; if (s.length === 2) return s[0] + "*"; return s[0] + "*".repeat(s.length - 2) + s[s.length - 1]; };
const shortAddr = (a) => String(a || "").split(" ").slice(0, 3).join(" ");

const pin = (text, filled) => L.divIcon({
  html: `<div style="transform:translate(-50%,-50%);position:absolute;min-width:34px;height:34px;padding:0 8px;box-sizing:border-box;border-radius:17px;background:${filled ? NAVY : "#fff"};border:3px solid ${NAVY};color:${filled ? "#fff" : NAVY};font:900 14px 'Noto Sans KR',sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:nowrap;">${text}</div>`,
  className: "", iconSize: [0, 0], iconAnchor: [0, 0],
});
const truckIcon = L.divIcon({
  html: `<div style="transform:translate(-50%,-50%);position:absolute;width:44px;height:44px;border-radius:50%;background:${NAVY};box-shadow:0 0 0 4px #fff,0 4px 14px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4h13v11H1z"/><path d="M14 8h4l3 3v4h-7z"/><circle cx="5.5" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/></svg></div>`,
  className: "", iconSize: [0, 0], iconAnchor: [0, 0],
});

function Fit({ pts }) {
  const map = useMap();
  const key = pts.map((p) => p.join(",")).join("|");
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 100);
    if (pts.length === 1) map.setView(pts[0], 13);
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 14 });
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function TrackPage() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id"), col = params.get("c") || "orders", token = params.get("t");
  const [order, setOrder] = useState(undefined);
  const [live, setLive] = useState(null);
  const [geo, setGeo] = useState({ p: null, d: null });
  const [eta, setEta] = useState(null);

  useEffect(() => {
    if (!id || !["orders", "dispatch"].includes(col)) { setOrder(null); return; }
    return onSnapshot(doc(db, col, id), (s) => setOrder(s.exists() ? { _id: s.id, ...s.data() } : null), () => setOrder(null));
  }, [id, col]);
  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, "liveLocations", id), (s) => setLive(s.exists() ? s.data() : null), () => {});
  }, [id]);
  // m=driver → 기사용 링크(기사추적토큰). 위치공유 동의 후 liveLocations에 좌표를 기록한다.
  const isDriver = params.get("m") === "driver";
  const valid = order && token && (isDriver ? order.기사추적토큰 === token : order.추적토큰 === token);
  useEffect(() => {
    if (!valid) return;
    let alive = true;
    Promise.all([geocodeAddress(order.상차지주소), geocodeAddress(order.하차지주소)]).then(([p, d]) => {
      if (alive) setGeo({ p: p ? { lat: p.lat, lng: p.lon } : null, d: d ? { lat: d.lat, lng: d.lon } : null });
    }).catch(() => {});
    return () => { alive = false; };
  }, [valid, order?.상차지주소, order?.하차지주소]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = useMemo(() => {
    if (!order) return [];
    const done = order.기사확인상태 === "완료" || order.배차상태 === "운송완료" || !!order.기사완료일시;
    return [
      { label: "차량 배정", on: !!String(order.차량번호 || "").trim(), at: tsMs(order.배차확정일시) || tsMs(order.기사확인일시) },
      { label: "상차지 도착", on: !!order.상차지도착일시 || !!order.상차완료일시 || done, at: tsMs(order.상차지도착일시) },
      { label: "상차 완료", on: !!order.상차완료일시 || done, at: tsMs(order.상차완료일시) },
      { label: "운송 중", on: !!order.상차완료일시 || done, at: 0 },
      { label: "하차 완료", on: done, at: tsMs(order.기사완료일시) },
    ];
  }, [order]);
  const curIdx = steps.reduce((m, s, i) => (s.on ? i : m), -1);
  const done = curIdx === 4;
  const liveMs = tsMs(live?.위치갱신일시);
  const liveFresh = live?.위치 && liveMs && Date.now() - liveMs < 30 * 60000 && !done;
  const truck = liveFresh ? [live.위치.lat, live.위치.lng] : null;

  // 도착 예상: 상차 완료 후엔 현재 위치 → 하차지, 그 전엔 현재 위치 → 상차지
  useEffect(() => {
    if (!liveFresh) { setEta(null); return; }
    const to = curIdx >= 2 ? geo.d : geo.p;
    if (!to) return;
    let alive = true;
    getDrivingRouteByCoords({ lat: live.위치.lat, lon: live.위치.lng }, { lat: to.lat, lon: to.lng }).then((r) => {
      if (alive && r) setEta({ km: r.km, min: r.minutes, target: curIdx >= 2 ? "하차지" : "상차지" });
    }).catch(() => {});
    return () => { alive = false; };
  }, [liveFresh, Math.round((live?.위치?.lat || 0) * 500), Math.round((live?.위치?.lng || 0) * 500), curIdx, geo.d, geo.p]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 기사 위치 공유(기사용 링크) — UploadPage 위치공유와 같은 방식(8초 간격 기록) ──
  const [share, setShare] = useState({ on: false, err: "", lastAt: 0 });
  const watchRef = useRef(null);
  const lastWriteRef = useRef(0);
  const wakeRef = useRef(null);
  const startShare = () => {
    if (!navigator.geolocation) { setShare((p) => ({ ...p, err: "이 휴대폰 브라우저는 위치 공유를 지원하지 않습니다." })); return; }
    const mirror = order._transmittedOrderId ? { col: "orders", id: order._transmittedOrderId }
      : (order.originCol && order.originId ? { col: order.originCol, id: order.originId } : null);
    updateDoc(doc(db, col, id), { 위치공유중: true }).catch(() => {});
    if (mirror) updateDoc(doc(db, mirror.col, mirror.id), { 위치공유중: true }).catch(() => {});
    try { navigator.wakeLock?.request("screen").then((w) => { wakeRef.current = w; }).catch(() => {}); } catch { /* 화면 켜짐 유지 미지원 */ }
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = navigator.geolocation.watchPosition((pos) => {
      const now = Date.now();
      setShare({ on: true, err: "", lastAt: now });
      if (now - lastWriteRef.current < 8000) return;
      lastWriteRef.current = now;
      const payload = { 위치: { lat: pos.coords.latitude, lng: pos.coords.longitude }, 위치갱신일시: serverTimestamp(), 출처: "기사추적링크" };
      setDoc(doc(db, "liveLocations", id), payload, { merge: true }).catch(() => {});
      if (mirror) setDoc(doc(db, "liveLocations", mirror.id), payload, { merge: true }).catch(() => {});
    }, (err) => {
      setShare({ on: false, lastAt: 0, err: err.code === 1 ? "위치 권한이 거부되었습니다. 휴대폰 설정 → 브라우저(크롬/삼성인터넷) → 위치 권한을 허용한 뒤 다시 눌러주세요." : "위치를 가져올 수 없습니다. GPS를 켜고 다시 눌러주세요." });
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  };
  useEffect(() => () => {
    if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current);
    try { wakeRef.current?.release(); } catch { /* 무시 */ }
  }, []);

  const wrap = { minHeight: "100vh", background: "#f4f6f9", fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif", wordBreak: "keep-all" };
  if (order === undefined) return <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#4b5563" }}>불러오는 중…</div>;
  if (!valid) return <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontSize: 16, fontWeight: 700, color: "#4b5563" }}>유효하지 않은 배송 조회 링크입니다.<br />담당자에게 링크를 다시 요청해 주세요.</div>;

  const pts = [geo.p && [geo.p.lat, geo.p.lng], geo.d && [geo.d.lat, geo.d.lng], truck].filter(Boolean);
  const etaTime = eta ? new Date(Date.now() + eta.min * 60000) : null;

  return (
    <div style={wrap}>
      <div style={{ background: NAVY, color: "#fff", padding: "18px 18px 22px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.7)" }}>{order.companyName ? `${order.companyName} · ` : ""}{isDriver ? "기사 위치 공유" : "배송 조회"}</div>
          <div style={{ fontSize: 21, fontWeight: 900, marginTop: 6 }}>{order.상차지명 || "-"} → {order.하차지명 || "-"}</div>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 10, background: "rgba(255,255,255,.12)", borderRadius: 10, padding: "10px 12px" }}>
            {done ? `하차 완료 · ${hm(steps[4].at)}`
              : eta ? `${eta.target}까지 약 ${eta.km}km · ${eta.min}분 (${String(etaTime.getHours()).padStart(2, "0")}:${String(etaTime.getMinutes()).padStart(2, "0")} 도착 예상)`
              : curIdx >= 0 ? `현재 상태: ${steps[curIdx].label}` : "차량 배정 대기 중"}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* 기사용 — 위치 공유 시작 */}
        {isDriver && !done && (
          <div style={{ background: share.on ? "#ecfdf5" : "#fff", borderRadius: 14, border: `2px solid ${share.on ? "#10b981" : NAVY}`, padding: 16 }}>
            {share.on ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 900, color: "#047857" }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#10b981", animation: "trkPulse 1.2s infinite" }} />
                  위치 공유 중
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#065f46", marginTop: 6, lineHeight: 1.6 }}>
                  담당자가 차량 위치를 보고 있습니다. 운송이 끝날 때까지 <b>이 화면을 켜 두세요.</b><br />
                  (다른 앱으로 넘어가거나 화면이 꺼지면 전송이 멈춥니다)
                </div>
                <style>{`@keyframes trkPulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
              </>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 900, color: NAVY }}>담당자가 위치 공유를 요청했습니다</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#374151", marginTop: 6, lineHeight: 1.6 }}>
                  아래 버튼을 누르고 위치 권한을 <b>허용</b>해 주세요. 이 오더 운송 중에만 위치가 담당자에게 보입니다.
                </div>
                <button onClick={startShare}
                  style={{ marginTop: 12, width: "100%", height: 54, borderRadius: 12, border: "none", background: NAVY, color: "#fff", fontSize: 18, fontWeight: 900, cursor: "pointer" }}>
                  위치 공유 시작
                </button>
                {share.err && <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700, color: "#b91c1c", lineHeight: 1.5 }}>{share.err}</div>}
              </>
            )}
          </div>
        )}
        {/* 진행 단계 */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e7ef", padding: "16px 10px 12px" }}>
          <div style={{ display: "flex" }}>
            {steps.map((s, i) => {
              const now = i === curIdx && !done;
              const c = s.on ? NAVY : "#d1d5db";
              return (
                <div key={s.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", minWidth: 0 }}>
                  {i > 0 && <div style={{ position: "absolute", top: 7, right: "50%", width: "100%", height: 3, background: s.on ? NAVY : "#e5e7eb" }} />}
                  <div style={{ width: 16, height: 16, borderRadius: "50%", background: now ? "#2563eb" : c, border: "3px solid #fff", boxShadow: now ? "0 0 0 4px rgba(37,99,235,.25)" : "none", zIndex: 1 }} />
                  <div style={{ fontSize: 13, fontWeight: now ? 900 : 800, color: now ? "#2563eb" : s.on ? NAVY : "#9ca3af", marginTop: 6, textAlign: "center", whiteSpace: "nowrap" }}>{s.label}</div>
                  {s.at > 0 && s.on && <div style={{ fontSize: 11, fontWeight: 700, color: "#4b5563", marginTop: 2 }}>{hm(s.at)}</div>}
                </div>
              );
            })}
          </div>
        </div>
        {/* 지도 */}
        <div style={{ height: 320, borderRadius: 14, overflow: "hidden", border: "1px solid #e2e7ef", background: "#fff", position: "relative" }}>
          <MapContainer center={pts[0] || [37.45, 126.8]} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <Fit pts={pts} />
            {geo.p && <Marker position={[geo.p.lat, geo.p.lng]} icon={pin("상차", false)} />}
            {geo.d && <Marker position={[geo.d.lat, geo.d.lng]} icon={pin("하차", true)} />}
            {truck && <Marker position={truck} icon={truckIcon} zIndexOffset={1000} />}
          </MapContainer>
          {!truck && !done && (
            <div style={{ position: "absolute", left: 10, bottom: 10, zIndex: 500, background: "rgba(255,255,255,.95)", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontWeight: 700, color: "#4b5563" }}>차량 실시간 위치가 아직 공유되지 않았습니다</div>
          )}
          {truck && <div style={{ position: "absolute", left: 10, bottom: 10, zIndex: 500, background: "rgba(255,255,255,.95)", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontWeight: 700, color: "#1f2937" }}>위치 갱신 {hm(liveMs)}</div>}
        </div>
        {/* 상세 */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e7ef", padding: "6px 16px" }}>
          {[
            ["상차지", `${order.상차지명 || "-"}`, shortAddr(order.상차지주소)],
            ["상차 일시", `${order.상차일 || ""} ${order.상차시간 || "즉시"}`],
            ["하차지", `${order.하차지명 || "-"}`, shortAddr(order.하차지주소)],
            ["하차 일시", `${order.하차일 || order.상차일 || ""} ${order.하차시간 || "즉시"}`],
            ["화물", [order.화물내용, order.차량종류, order.차량톤수].filter(Boolean).join(" · ") || "-"],
            ["차량", `${order.차량번호 || "배정 전"}${order.이름 ? ` · ${maskName(order.이름)} 기사` : ""}`],
          ].map(([k, v, sub]) => (
            <div key={k} style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: "1px solid #f1f3f6" }}>
              <span style={{ width: 72, flexShrink: 0, fontSize: 14, fontWeight: 800, color: "#4b5563" }}>{k}</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>{v}{sub && <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#4b5563" }}>{sub}</span>}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center", padding: "4px 0 16px" }}>이 페이지는 자동으로 갱신됩니다.</div>
      </div>
    </div>
  );
}
