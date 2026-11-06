// ======================= cafe-site/src/hub/HubLiveTrack.jsx =======================
// ⭐ 2026-11-06 허브 위치관제 — 배차 프로그램 실시간 관제(src/LiveFleetMaps.jsx "오더 1건")와 똑같은 화면(src/liveTrackView.jsx)을 쓴다.
//  같은 지도(Leaflet + OSM 흑백) · 트럭 마커 · LIVE 배지 · 최근 이동경로 선 · 운행 단계 6칸 · 속도/최종 수신/남은 거리/도착 예상 · 전화 버튼.
//  데이터만 허브 것: hubLive/{orderId}(배차된 회원이 보내는 위치) + hubLive/{orderId}/track(이동 경로) + 상·하차 상세주소(private/detail).
//  등록자 · 관리자만, 배차 확정 뒤 ~ 운송완료 전까지(규칙). 운송완료되면 창이 "관제 종료"로 바뀐다.
import React, { useEffect, useMemo, useState } from "react";
import { LiveTrackView } from "../../../src/liveTrackView";
import { ensureLiveStyles, liveTsMs } from "../../../src/liveCore";
import { geocodeAddress, getDrivingRouteByCoords, haversineKm } from "../../../src/tmapFareCalc";
import { subscribeLive, subscribeTrack, liveActive } from "./hubApi";
import { regionLL } from "./hubConstants";

const STEP_PHASE = ["운송중", "상차지진입", "상차지도착", "하차이동", "하차지진입", "하차지도착"];
const _geo = new Map();
function useGeo(addr, fallback) {
  const key = String(addr || "").trim();
  const fb = fallback ? { lat: fallback[0], lng: fallback[1], approx: true } : null;
  const [g, setG] = useState(() => _geo.get(key) || null);
  useEffect(() => {
    let on = true;
    if (!key) { setG(fb); return undefined; }
    if (_geo.has(key)) { setG(_geo.get(key)); return undefined; }
    setG(fb);
    geocodeAddress(key).then((r) => {
      if (!on) return;
      const v = r ? { lat: r.lat, lng: r.lon } : fb;
      if (r) _geo.set(key, v);
      setG(v);
    }).catch(() => {});
    return () => { on = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return g;
}

// 실도로 남은 거리(2분에 한 번, 1km 넘게 움직였을 때만 다시) — 실패하면 화면이 직선거리로 대신 보여준다
function useRemain(loc, target, label) {
  const [r, setR] = useState(null);
  const k = target ? `${target.lat.toFixed(4)},${target.lng.toFixed(4)}` : "";
  useEffect(() => {
    if (!loc || !target) { setR(null); return undefined; }
    if (r && r.k === k && r.at > Date.now() - 120000 && haversineKm(r.from.lat, r.from.lng, loc.lat, loc.lng) < 1) return undefined;
    let on = true;
    getDrivingRouteByCoords({ lat: loc.lat, lon: loc.lng }, { lat: target.lat, lon: target.lng }).then((x) => {
      if (on && x) setR({ km: x.km, min: x.minutes, label, at: Date.now(), from: loc, k });
    }).catch(() => {});
    return () => { on = false; };
  }, [loc?.lat, loc?.lng, k]); // eslint-disable-line react-hooks/exhaustive-deps
  return r && r.k === k ? r : null;
}

export default function HubLiveTrack({ order, detail, match, mobile, onClose }) {
  useEffect(() => { ensureLiveStyles(); }, []);
  const [live, setLive] = useState(undefined);
  const [track, setTrack] = useState([]);
  const active = liveActive(order);
  useEffect(() => (active ? subscribeLive(order.id, setLive) : (setLive(null), undefined)), [order.id, active]);
  useEffect(() => (active ? subscribeTrack(order.id, setTrack) : (setTrack([]), undefined)), [order.id, active]);
  const pickupGeo = useGeo(detail?.상차지주소, regionLL(order.상차시도, order.상차시군구));
  const dropGeo = useGeo(detail?.하차지주소, regionLL(order.하차시도, order.하차시군구));
  const entry = useMemo(() => {
    if (!live || live.lat == null) return null;
    return {
      id: order.takerUid, lat: Number(live.lat), lng: Number(live.lng), speed: Math.max(0, Math.round(Number(live.speed) || 0)),
      plate: live.plate || match?.vehicle?.plate || "", name: live.name || match?.name || "", phone: live.phone || match?.phone || "",
      grade: match?.role === "carrier" ? "운송사" : "차주", status: order.status === "loaded" ? "운송중" : "상차이동",
      updatedMs: liveTsMs(live.updatedAt) || Date.now(),
    };
  }, [live, match, order.status, order.takerUid]);
  // 운행 단계 — 상차 전: 상차지까지 거리(3km 진입 · 1km 도착), 상차 뒤: 하차지까지
  const loc = entry ? { lat: entry.lat, lng: entry.lng } : null;
  const step = useMemo(() => {
    if (!loc) return -1;
    const loaded = order.status === "loaded";
    const t = loaded ? dropGeo : pickupGeo;
    const base = loaded ? 3 : 0;
    if (!t) return base;
    const d = haversineKm(loc.lat, loc.lng, t.lat, t.lng);
    return base + (d <= 1 ? 2 : d <= 3 ? 1 : 0);
  }, [loc?.lat, loc?.lng, order.status, pickupGeo, dropGeo]); // eslint-disable-line react-hooks/exhaustive-deps
  const target = step >= 3 ? (step === 5 ? null : dropGeo) : step === 2 ? dropGeo : pickupGeo;
  const remain = useRemain(loc, target, step >= 2 ? "하차지까지" : "상차지까지");
  const lwOrder = {
    상차지명: detail?.상차지명 || `${order.상차시도} ${order.상차시군구 || ""}`.trim(), 상차지주소: detail?.상차지주소 || "", 상차일: order.상차일, 상차시간: order.상차시간,
    하차지명: detail?.하차지명 || `${order.하차시도} ${order.하차시군구 || ""}`.trim(), 하차지주소: detail?.하차지주소 || "", 하차일: order.하차일 || order.상차일, 하차시간: order.하차시간,
    화물내용: order.화물내용, 차량톤수: order.차량톤수, 차량종류: order.차량종류, 거래처명: order.posterCompany || "", 차량번호: entry?.plate || match?.vehicle?.plate || "", 이름: match?.name || "", 전화번호: match?.phone || "",
  };
  return (
    <div data-testid="hub-live">
      <LiveTrackView order={lwOrder} entry={active ? entry : null} track={track} pickupGeo={pickupGeo} dropGeo={dropGeo}
        phase={entry ? STEP_PHASE[Math.max(0, step)] : null} step={step} remain={remain ? { km: remain.km, min: remain.min, label: remain.label } : null}
        mobile={mobile} onClose={onClose}
        emptyText={!active ? "운송이 끝나 위치관제를 종료했습니다(운송완료 · 취소 후에는 위치를 볼 수 없습니다)." : live === undefined ? "위치 정보를 불러오는 중입니다…" : "차주 앱에서 아직 위치를 보내지 않았습니다. 차주가 허브 앱(또는 로지스웹 기사앱)을 열면 바로 보입니다."} />
    </div>
  );
}
