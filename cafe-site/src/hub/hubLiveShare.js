// ======================= cafe-site/src/hub/hubLiveShare.js =======================
// ⭐ 2026-11-06 위치관제 — 배차된 회원(차주 · 운송사) 쪽 위치 보내기. 배차 프로그램 기사앱(src/driver/DriverHome.jsx)의
//  웹 위치 전송과 같은 기준이다:
//   · watchPosition(enableHighAccuracy, maximumAge 0, timeout 20초) · 정확도 100m 넘는 위치는 버림
//   · 이동 경로(track)는 정확도 35m 이내 위치만, 50m 이상 움직였거나 30초 지났을 때
//   · 30초마다 마지막 위치로 갱신(단, 실제 수신이 90초 넘게 없으면 가짜로 신선하게 만들지 않음)
//   · 화면이 다시 보이면(백그라운드 → 앞) 다시 시작
//  보내는 동안: 확정된 배차(assigned + confirmed) 또는 상차완료(loaded) 오더 1건. 운송완료 · 취소되면 바로 멈춘다(서버가 기록도 지운다).
//  로지스웹 소속 기사는 기사앱(백그라운드 GPS)이 drivers/{uid}에 쓰는 위치를 서버가 넘겨 주므로(hubDriverLocMirror) 앱을 꺼도 이어진다.
import { useEffect, useRef, useState } from "react";
import { writeLive, addTrackPoint, liveActive } from "./hubApi";

const km = (a, b) => {
  const R = 6371, t = (d) => (d * Math.PI) / 180;
  const dLa = t(b.lat - a.lat), dLo = t(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export function useHubLocationShare(me, jobs) {
  const job = (jobs || []).find((j) => j.takerUid === me?.uid && liveActive(j)) || null;
  const [state, setState] = useState({ on: false, denied: false, last: 0, accuracy: 0 });
  const jobRef = useRef(job);
  jobRef.current = job;
  const key = job ? `${job.id}|${job.status}` : "";

  useEffect(() => {
    if (!job || !me?.uid || typeof navigator === "undefined" || !navigator.geolocation) { setState((s) => ({ ...s, on: false })); return undefined; }
    let watchId = null;
    const last = { pos: null, posAt: 0, track: null, trackAt: 0 };
    const send = (lat, lng, speed, accuracy) => {
      const o = jobRef.current;
      if (!o) return;
      if (accuracy > 100) return;
      last.pos = { lat, lng, speed, accuracy }; last.posAt = Date.now();
      writeLive(o, me, last.pos).then(() => setState({ on: true, denied: false, last: Date.now(), accuracy: Math.round(accuracy || 0) })).catch(() => {});
      const moved = last.track ? km(last.track, { lat, lng }) : 999;
      if (accuracy != null && accuracy <= 35 && (moved > 0.05 || Date.now() - last.trackAt >= 30000)) {
        last.track = { lat, lng }; last.trackAt = Date.now();
        addTrackPoint(o, { lat, lng, speed, accuracy }).catch(() => {});
      }
    };
    const start = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(
        (p) => send(p.coords.latitude, p.coords.longitude, p.coords.speed, p.coords.accuracy),
        (err) => { if (err.code === 1) setState((s) => ({ ...s, on: false, denied: true })); },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
      );
    };
    start();
    const force = setInterval(() => {
      if (!last.pos || Date.now() - last.posAt > 90000) return;
      const o = jobRef.current;
      if (o) writeLive(o, me, last.pos).catch(() => {});
    }, 30000);
    const onVis = () => { if (document.visibilityState === "visible") start(); };
    document.addEventListener("visibilitychange", onVis);
    setState((s) => ({ ...s, on: true }));
    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      clearInterval(force);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [key, me?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  return { job, ...state };
}
