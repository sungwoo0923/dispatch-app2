// DriverHome.jsx — 지입기사 전용 앱 (리뉴얼)
import React, { useEffect, useState, useRef, useCallback } from "react";
import { db, auth } from "../firebase";
import {
  doc, onSnapshot, updateDoc, addDoc,
  collection, query, where, orderBy, limit, getDocs, serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

// ─── 상태 설정 ───────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  대기:      { color: "#6b7280", label: "대기" },
  출근:      { color: "#1B2B4B", label: "출근" },
  상차중:    { color: "#374151", label: "상차중" },
  운행중:    { color: "#1B2B4B", label: "운행중" },
  하차중:    { color: "#374151", label: "하차중" },
  복귀중:    { color: "#4b5563", label: "복귀중" },
  휴식:      { color: "#9ca3af", label: "휴식" },
  퇴근:      { color: "#111827", label: "퇴근" },
  최종퇴근:  { color: "#111827", label: "최종퇴근" },
};

// 다음 액션 정의 (현재 상태에 따른 컨텍스트 버튼)
function getActions(status) {
  switch (status) {
    case "대기":
    case null:
    case undefined:
      return [{ label: "출근", status: "출근", primary: true }];
    case "퇴근":
      return [
        { label: "출근", status: "출근", primary: true },
        { label: "최종 퇴근 완료 (당일 종료)", status: "최종퇴근", primary: false },
      ];
    case "출근":
      return [
        { label: "상차 시작", status: "상차중", primary: true },
        { label: "대기", status: "대기", primary: false },
        { label: "휴식", status: "휴식", primary: false },
        { label: "퇴근", status: "퇴근", primary: false },
      ];
    case "상차중":
      return [
        { label: "상차 완료 (운행 시작)", status: "운행중", primary: true },
      ];
    case "운행중":
      return [
        { label: "하차 시작", status: "하차중", primary: true },
        { label: "대기", status: "대기", primary: false },
      ];
    case "하차중":
      return [
        { label: "하차 완료 (복귀)", status: "복귀중", primary: true },
      ];
    case "복귀중":
      return [
        { label: "다음 상차 시작", status: "상차중", primary: true },
        { label: "대기", status: "대기", primary: false },
        { label: "퇴근", status: "퇴근", primary: false },
      ];
    case "휴식":
      return [
        { label: "대기로 복귀", status: "대기", primary: true },
        { label: "상차 시작", status: "상차중", primary: false },
      ];
    default:
      return [
        { label: "상차 시작", status: "상차중", primary: true },
        { label: "대기", status: "대기", primary: false },
        { label: "퇴근", status: "퇴근", primary: false },
      ];
  }
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function formatTime(date) {
  if (!date) return "--:--";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function StatusDot({ status, size = 10 }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["대기"];
  return (
    <span style={{
      display: "inline-block",
      width: size, height: size,
      borderRadius: "50%",
      background: cfg.color,
      flexShrink: 0,
    }} />
  );
}

// ─── 기사 로그 전체 구독 (orderBy 제거 → composite index 불필요) ──────────────
function useAllDriverLogs(uid) {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "driver_logs"), where("uid", "==", uid), limit(1000));
    return onSnapshot(q, (snap) => {
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const at = a.timestamp?.toDate?.()?.getTime() || 0;
          const bt = b.timestamp?.toDate?.()?.getTime() || 0;
          return at - bt;
        });
      setLogs(all);
    });
  }, [uid]);
  return logs;
}

// ─── 근무 요약 계산 ──────────────────────────────────────────────────────────
function calcWorkSummary(logs) {
  let workMs = 0;
  let driveMs = 0;
  let checkInTime = null;
  let tripCount = 0;

  let lastTime = null;
  let lastStatus = null;

  logs.forEach(log => {
    const t = log.timestamp?.toDate?.();
    if (!t) return;
    if (log.status === "출근" && !checkInTime) checkInTime = t;
    if (log.status === "운행중") tripCount++;
    if (lastTime && lastStatus && lastStatus !== "퇴근" && lastStatus !== "대기") {
      const diff = t - lastTime;
      if (lastStatus !== "휴식") workMs += diff;
      if (lastStatus === "운행중" || lastStatus === "하차중") driveMs += diff;
    }
    lastTime = t;
    lastStatus = log.status;
  });

  // 현재까지 (마지막 로그 → 지금)
  if (lastTime && lastStatus && lastStatus !== "퇴근") {
    const diff = Date.now() - lastTime;
    if (lastStatus !== "휴식") workMs += diff;
    if (lastStatus === "운행중" || lastStatus === "하차중") driveMs += diff;
  }

  return { workMs, driveMs, checkInTime, tripCount };
}

// ─── Haversine 거리 ───────────────────────────────────────────────────────────
function calcDist(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── GPS 추적 훅 ─────────────────────────────────────────────────────────────
function useGpsTracking(uid, driverData) {
  const [pos, setPos] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const lastPosRef = useRef(null);
  const totalDistRef = useRef(0);           // running total — avoids stale closure bug
  const distInitializedRef = useRef(false); // true once synced from Firestore
  const lastGpsStoreRef = useRef(null);     // last point stored to gps_tracks

  // Initialize totalDistRef once when driverData first loads from Firestore
  useEffect(() => {
    if (!distInitializedRef.current && driverData !== null && driverData !== undefined) {
      totalDistRef.current = driverData.totalDistance || 0;
      distInitializedRef.current = true;
    }
  }, [driverData]);

  // Wake lock — keeps screen on for background tracking on Android Chrome
  useEffect(() => {
    if (!uid || !("wakeLock" in navigator)) return;
    let wl = null;
    const acquire = async () => {
      try { wl = await navigator.wakeLock.request("screen"); } catch (_) {}
    };
    acquire();
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      wl?.release().catch(() => {});
    };
  }, [uid]);

  const resetTotalDist = useCallback(() => {
    totalDistRef.current = 0;
    distInitializedRef.current = true;
    lastPosRef.current = null;
    lastGpsStoreRef.current = null;
  }, []);

  useEffect(() => {
    if (!uid) return;
    const watchId = navigator.geolocation.watchPosition(
      async (p) => {
        const { latitude: lat, longitude: lng, speed, accuracy } = p.coords;
        setPos({ lat, lng, speed, accuracy });

        // Ignore readings with poor accuracy
        if (accuracy > 100) return;

        const prev = lastPosRef.current;
        let distDelta = 0;
        if (prev) distDelta = calcDist(prev.lat, prev.lng, lat, lng);
        lastPosRef.current = { lat, lng };

        const updateData = {
          location: { lat, lng },
          speed: speed ? Math.round(speed * 3.6) : 0,
          updatedAt: serverTimestamp(),
        };

        // Accumulate distance using ref (not stale driverData)
        if (distDelta > 0.01) {
          totalDistRef.current += distDelta;
          updateData.totalDistance = totalDistRef.current;
        }

        // Store GPS waypoint every 50 m for accurate path visualization
        const lastStore = lastGpsStoreRef.current;
        const storeDelta = lastStore ? calcDist(lastStore.lat, lastStore.lng, lat, lng) : 999;
        if (storeDelta > 0.05) {
          lastGpsStoreRef.current = { lat, lng };
          addDoc(collection(db, "gps_tracks"), {
            driverId: uid,
            lat, lng,
            speed: speed ? Math.round(speed * 3.6) : 0,
            timestamp: serverTimestamp(),
            date: new Date().toISOString().slice(0, 10),
          }).catch(() => {});
        }

        try { await updateDoc(doc(db, "drivers", uid), updateData); } catch (_) {}
      },
      (err) => { if (err.code === 1) setPermissionDenied(true); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [uid]);

  return { pos, permissionDenied, resetTotalDist };
}

// ─── 충돌 감지 훅 ────────────────────────────────────────────────────────────
function useCollisionDetection(uid, driverRef, posRef, onCollision) {
  const onCollisionRef = useRef(onCollision);
  useEffect(() => { onCollisionRef.current = onCollision; }, [onCollision]);
  const cooldownRef = useRef(false);

  useEffect(() => {
    if (!uid) return;
    const handleMotion = async (e) => {
      if (cooldownRef.current) return;
      let magnitude = 0;
      if (e.acceleration?.x != null) {
        const { x = 0, y = 0, z = 0 } = e.acceleration;
        magnitude = Math.sqrt(x * x + y * y + z * z);
      } else if (e.accelerationIncludingGravity?.x != null) {
        const { x = 0, y = 0, z = 0 } = e.accelerationIncludingGravity;
        magnitude = Math.max(0, Math.sqrt(x * x + y * y + z * z) - 9.8);
      }
      if (magnitude < 25) return;
      cooldownRef.current = true;
      setTimeout(() => { cooldownRef.current = false; }, 90000); // 90s cooldown
      onCollisionRef.current?.(magnitude);
      const d = driverRef.current;
      const p = posRef.current;
      try {
        await addDoc(collection(db, "collision_alerts"), {
          uid,
          driverName: d?.name || "",
          carNo: d?.carNo || "",
          magnitude: Math.round(magnitude * 10) / 10,
          timestamp: serverTimestamp(),
          location: (p && (p.accuracy == null || p.accuracy <= 100)) ? { lat: p.lat, lng: p.lng } : null,
          resolved: false,
        });
      } catch (_) {}
    };
    if (typeof DeviceMotionEvent?.requestPermission === "function") {
      DeviceMotionEvent.requestPermission()
        .then(p => { if (p === "granted") window.addEventListener("devicemotion", handleMotion); })
        .catch(() => {});
    } else {
      window.addEventListener("devicemotion", handleMotion);
    }
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [uid]);
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function DriverHome() {
  const [uid, setUid] = useState(null);
  const [driver, setDriver] = useState(null);
  const [activeTab, setActiveTab] = useState("home");
  const [statusLoading, setStatusLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [companyDefaultLoc, setCompanyDefaultLoc] = useState(null);
  const autoCheckinDoneRef = useRef(false);
  const wasAwayFromCheckInRef = useRef(false); // tracks if driver moved >2km away since last check-in/out
  const _td = new Date();
  const todayStr = `${_td.getFullYear()}-${String(_td.getMonth()+1).padStart(2,"0")}-${String(_td.getDate()).padStart(2,"0")}`;
  const [logFrom, setLogFrom] = useState(todayStr);
  const [logTo, setLogTo] = useState(todayStr);
  const [appliedRange, setAppliedRange] = useState({ from: todayStr, to: todayStr });
  const [checkinWarning, setCheckinWarning] = useState(null);
  const [collisionAlert, setCollisionAlert] = useState(null);
  const driverRef = useRef(null);
  const posRef = useRef(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (!u) { window.location.href = "/driver-login"; return; }
      setUid(u.uid);
    });
  }, []);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "drivers", uid), (snap) => {
      if (snap.exists()) setDriver(snap.data());
    });
  }, [uid]);

  useEffect(() => {
    return onSnapshot(doc(db, "fleet_settings", "default"), (snap) => {
      setCompanyDefaultLoc(snap.exists() ? (snap.data().defaultCheckInLocation || null) : null);
    });
  }, []);

  const allLogs = useAllDriverLogs(uid);
  const { pos, permissionDenied, resetTotalDist } = useGpsTracking(uid, driver);

  // 오늘 로그 (홈탭 요약 + 상태표시용)
  const todayLogs = React.useMemo(() => {
    const start = new Date(todayStr + "T00:00:00");
    return allLogs.filter(l => { const t = l.timestamp?.toDate?.(); return t && t >= start; });
  }, [allLogs, todayStr]);
  const summary = React.useMemo(() => calcWorkSummary(todayLogs), [todayLogs]);

  // 운행기록 탭: 선택 날짜 범위 로그
  const rangeLogs = React.useMemo(() => {
    const from = appliedRange.from ? new Date(appliedRange.from + "T00:00:00") : null;
    const to = appliedRange.to ? new Date(appliedRange.to + "T23:59:59") : null;
    return allLogs.filter(l => {
      const t = l.timestamp?.toDate?.();
      if (!t) return false;
      if (from && t < from) return false;
      if (to && t > to) return false;
      return true;
    });
  }, [allLogs, appliedRange]);
  const rangeSummary = React.useMemo(() => calcWorkSummary(rangeLogs), [rangeLogs]);

  // Keep refs in sync with latest state (avoid stale closures in collision hook)
  useEffect(() => { driverRef.current = driver; }, [driver]);
  useEffect(() => { posRef.current = pos; }, [pos]);
  useCollisionDetection(uid, driverRef, posRef, (mag) => {
    setCollisionAlert({ magnitude: mag, time: new Date() });
  });

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const updateStatus = useCallback(async (newStatus) => {
    if (!uid || statusLoading) return;
    setStatusLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const isFinal = newStatus === "최종퇴근";
    const firestoreStatus = isFinal ? "퇴근" : newStatus;
    try {
      const driverUpdate = {
        status: firestoreStatus,
        mainStatus: firestoreStatus,
        updatedAt: serverTimestamp(),
        active: firestoreStatus !== "퇴근",
      };
      if (newStatus === "출근") {
        driverUpdate.workStartAt = serverTimestamp();
        // 새로운 날(달력일 기준)에만 거리 초기화 — 당일 반복 출근 시 거리 누적 유지
        if (driver?.workDate !== today) {
          driverUpdate.totalDistance = 0;
          driverUpdate.workDate = today;
          resetTotalDist();
        }
      }
      if (isFinal) {
        // 최종퇴근: 오늘 누적거리 기록 후 다음날을 위해 초기화
        driverUpdate.workDate = today;
        driverUpdate.totalDistance = 0;
        resetTotalDist();
      }
      await updateDoc(doc(db, "drivers", uid), driverUpdate);
      const logExtra = isFinal ? { finalDistance: driver?.totalDistance || 0 } : {};
      await addDoc(collection(db, "driver_logs"), {
        uid,
        driverName: driver?.name || "",
        carNo: driver?.carNo || "",
        status: newStatus,        // 로그에는 "최종퇴근" 그대로 기록
        mainStatus: firestoreStatus,
        timestamp: serverTimestamp(),
        location: (pos && (pos.accuracy == null || pos.accuracy <= 100)) ? { lat: pos.lat, lng: pos.lng } : null,
        ...logExtra,
      });
      showToast(`${isFinal ? "최종 퇴근" : newStatus} 처리되었습니다`);
    } catch (e) {
      showToast("처리 중 오류가 발생했습니다");
    } finally {
      setStatusLoading(false);
    }
  }, [uid, statusLoading, pos, driver, resetTotalDist]);

  // Active status → reset both refs so auto-checkin can fire again on next return
  useEffect(() => {
    const s = driver?.status;
    if (s && s !== "퇴근" && s !== "대기") {
      autoCheckinDoneRef.current = false;
      wasAwayFromCheckInRef.current = false;
    }
  }, [driver?.status]);

  // Auto 출근: driver must first move >2km away from 출근지 (wasAway guard)
  // then come back within 2km — prevents immediate re-checkin after pressing 퇴근 at 출근지
  useEffect(() => {
    if (!pos || !uid || statusLoading) return;
    const status = driver?.status;
    const checkInLoc = driver?.checkInLocation || companyDefaultLoc;
    if (!checkInLoc?.lat || !checkInLoc?.lng) return;
    if (pos.accuracy != null && pos.accuracy > 100) return;
    if (status && status !== "퇴근" && status !== "대기") return;
    const dist = calcDist(pos.lat, pos.lng, checkInLoc.lat, checkInLoc.lng);
    if (dist > 2) wasAwayFromCheckInRef.current = true;
    if (wasAwayFromCheckInRef.current && !autoCheckinDoneRef.current && dist <= 2) {
      autoCheckinDoneRef.current = true;
      updateStatus("출근").catch(() => { autoCheckinDoneRef.current = false; });
    }
  }, [pos, uid, statusLoading, driver?.status, driver?.checkInLocation, companyDefaultLoc, updateStatus]);

  // 수동 출근: 출근지가 설정된 경우 1km 이내에서만 허용
  const handleActionButton = useCallback((action) => {
    if (action.status === "출근") {
      const checkInLoc = driver?.checkInLocation || companyDefaultLoc;
      if (checkInLoc?.lat && checkInLoc?.lng && pos && (pos.accuracy == null || pos.accuracy <= 100)) {
        const dist = calcDist(pos.lat, pos.lng, checkInLoc.lat, checkInLoc.lng);
        if (dist > 1) {
          setCheckinWarning(dist);
          return;
        }
      }
    }
    updateStatus(action.status);
  }, [driver?.checkInLocation, companyDefaultLoc, pos, updateStatus]);

  const handleLogout = async () => {
    if (uid) {
      try {
        await updateDoc(doc(db, "drivers", uid), { active: false, updatedAt: serverTimestamp() });
      } catch (_) {}
    }
    await signOut(auth);
    window.location.href = "/driver-login";
  };

  if (!driver) {
    return (
      <div style={{ minHeight: "100vh", background: "#f4f6f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid #1B2B4B", borderTopColor: "transparent", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
          <div style={{ fontSize: 14, color: "#6b7280" }}>로딩중...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const currentStatus = driver.status || "대기";
  const statusCfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG["대기"];
  const actions = getActions(currentStatus);
  const dateStr = `${_td.getFullYear()}.${String(_td.getMonth()+1).padStart(2,"0")}.${String(_td.getDate()).padStart(2,"0")}`;

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6f9", paddingBottom: 72, fontFamily: '"Noto Sans KR", sans-serif' }}>

      {/* 충돌 감지 경고 모달 */}
      {collisionAlert && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9997, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
          <div style={{ background: "white", borderRadius: 18, padding: "28px 22px", maxWidth: 320, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
            <div style={{ width: 48, height: 48, background: "#fef2f2", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <svg width="26" height="26" fill="none" stroke="#ef4444" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div style={{ textAlign: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#111827" }}>충격이 감지되었습니다</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 6, lineHeight: 1.6 }}>
                강한 충격이 감지되었습니다.<br />괜찮으신가요?
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button
                onClick={() => setCollisionAlert(null)}
                style={{ flex: 1, padding: "13px", borderRadius: 12, border: "1.5px solid #e5e7eb", background: "white", color: "#374151", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                괜찮습니다
              </button>
              <a
                href="tel:119"
                onClick={() => setCollisionAlert(null)}
                style={{ flex: 1, padding: "13px", borderRadius: 12, border: "none", background: "#ef4444", color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                119 신고
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 출근지 1km 초과 경고 */}
      {checkinWarning !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
          <div style={{ background: "white", borderRadius: 18, padding: "28px 22px", maxWidth: 320, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 10 }}>출근 불가</div>
            <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.7, marginBottom: 22 }}>
              출근지 반경 <strong style={{ color: "#1B2B4B" }}>1km 이내</strong>에서만 출근 처리가 가능합니다.<br />
              현재 출근지까지 거리: <strong style={{ color: "#374151" }}>{checkinWarning.toFixed(1)} km</strong>
            </div>
            <button
              onClick={() => setCheckinWarning(null)}
              style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "#1B2B4B", color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          background: "#1B2B4B", color: "white", fontSize: 13, fontWeight: 600,
          padding: "10px 20px", borderRadius: 24, zIndex: 9999,
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
        }}>
          {toast}
        </div>
      )}

      {/* ─── 상단 헤더 ─── */}
      <div style={{ background: "#1B2B4B", padding: "16px 20px 20px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.1em", marginBottom: 2 }}>KP-Flow 기사 앱</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "white" }}>{driver.name || "-"}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 1 }}>{driver.carNo || "-"} {driver.vehicleType ? `· ${driver.vehicleType}` : ""}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>{dateStr}</div>
            <button onClick={handleLogout} style={{
              fontSize: 11, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.08)",
              border: "none", padding: "6px 12px", borderRadius: 8, cursor: "pointer",
            }}>로그아웃</button>
          </div>
        </div>

        {/* 현재 상태 표시 */}
        <div style={{
          background: "rgba(255,255,255,0.08)", borderRadius: 14, padding: "12px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 12, height: 12, borderRadius: "50%", background: statusCfg.color === "#1B2B4B" ? "#60a5fa" : "white",
              boxShadow: currentStatus === "운행중" ? "0 0 0 4px rgba(96,165,250,0.3)" : "none",
              flexShrink: 0,
            }} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "white", letterSpacing: "-0.5px" }}>{currentStatus}</div>
              {summary.checkInTime && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>
                  출근 {formatTime(summary.checkInTime)}
                </div>
              )}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            {permissionDenied ? (
              <div style={{ fontSize: 11, color: "#f87171" }}>GPS 권한 필요</div>
            ) : pos ? (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                GPS 활성
                {typeof pos.speed === "number" && pos.speed >= 0 && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>
                    {pos.speed > 0 ? `${Math.round(pos.speed * 3.6)} km/h` : "정지"}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>GPS 대기중...</div>
            )}
          </div>
        </div>
      </div>

      {/* ─── 탭: 홈 ─── */}
      {activeTab === "home" && (
        <div style={{ padding: "16px 16px 0" }}>

          {/* 오늘 요약 카드 */}
          <div style={{ background: "white", borderRadius: 16, padding: "16px", marginBottom: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 12, letterSpacing: "0.05em" }}>오늘 운행 현황</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "총 이동거리", value: `${(driver.totalDistance || 0).toFixed(1)} km` },
                { label: "근무시간", value: summary.workMs > 0 ? formatDuration(summary.workMs) : "--" },
                { label: "운행 횟수", value: `${summary.tripCount}회` },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: "center", padding: "10px 4px", background: "#f9fafb", borderRadius: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#1B2B4B" }}>{value}</div>
                  <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, fontWeight: 600 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* GPS 경고 */}
          {permissionDenied && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", marginBottom: 2 }}>위치 권한이 필요합니다</div>
              <div style={{ fontSize: 12, color: "#ef4444" }}>설정에서 위치 권한을 허용하면 실시간 추적 및 출근지 2km 이내 자동 출근이 가능합니다.</div>
            </div>
          )}

          {/* 액션 버튼 */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 10, letterSpacing: "0.05em" }}>
              {currentStatus === "퇴근" || currentStatus === "대기" || !driver.status ? "오늘 업무 시작" : "다음 액션"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {actions.map((action, i) => (
                <button
                  key={action.status}
                  onClick={() => handleActionButton(action)}
                  disabled={statusLoading}
                  style={{
                    padding: action.primary ? "16px 20px" : "12px 20px",
                    borderRadius: 14,
                    border: action.primary ? "none" : "1.5px solid #e5e7eb",
                    background: action.primary ? "#1B2B4B" : "white",
                    color: action.primary ? "white" : "#374151",
                    fontSize: action.primary ? 16 : 14,
                    fontWeight: 700,
                    cursor: statusLoading ? "not-allowed" : "pointer",
                    opacity: statusLoading ? 0.6 : 1,
                    transition: "all 0.15s",
                    textAlign: "center",
                    letterSpacing: "-0.3px",
                    boxShadow: action.primary ? "0 4px 16px rgba(27,43,75,0.25)" : "none",
                  }}
                >
                  {statusLoading && i === 0 ? "처리중..." : action.label}
                </button>
              ))}
            </div>
          </div>

          {/* 오늘 상태 로그 (최근 8개) */}
          {todayLogs.length > 0 && (
            <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 10, letterSpacing: "0.05em" }}>오늘 상태 기록</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {[...todayLogs].reverse().slice(0, 8).map((log, i, arr) => {
                  const t = log.timestamp?.toDate?.();
                  const cfg = STATUS_CONFIG[log.status] || STATUS_CONFIG["대기"];
                  return (
                    <div key={log.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "9px 0",
                      borderBottom: i < arr.length - 1 ? "1px solid #f3f4f6" : "none",
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1B2B4B", flex: 1 }}>{log.status}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>{t ? formatTime(t) : "--"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 탭: 연락처 ─── */}
      {activeTab === "contacts" && (
        <div style={{ padding: "16px" }}>
          {[
            {
              section: "회사 연락처",
              items: [
                { name: "돌캐", number: "1533-2525", tel: "15332525", desc: "배차팀" },
                { name: "후레쉬1공장", number: "032-720-7704", tel: "0327207704", desc: "인천" },
                { name: "후레쉬2공장", number: "032-720-7770", tel: "0327207770", desc: "인천" },
              ],
            },
            {
              section: "긴급 연락처",
              items: [
                { name: "화재·구급", number: "119", tel: "119", desc: "소방서 / 구급대" },
                { name: "경찰", number: "112", tel: "112", desc: "사건·사고 신고" },
                { name: "응급의료정보", number: "1339", tel: "1339", desc: "응급의료정보센터" },
              ],
            },
            {
              section: "도로·운송 지원",
              items: [
                { name: "한국도로공사", number: "1588-2504", tel: "15882504", desc: "고속도로 긴급출동" },
                { name: "교통사고 접수", number: "112", tel: "112", desc: "경찰청 교통사고" },
                { name: "민원·행정 안내", number: "110", tel: "110", desc: "정부24 콜센터" },
              ],
            },
          ].map(({ section, items }) => (
            <div key={section} style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 12, letterSpacing: "0.05em" }}>{section}</div>
              {items.map((item, i) => (
                <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: i < items.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{item.desc}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginRight: 10, fontVariantNumeric: "tabular-nums" }}>{item.number}</div>
                  <a
                    href={`tel:${item.tel}`}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 38, height: 38, borderRadius: 10,
                      background: "#1B2B4B", color: "white",
                      textDecoration: "none", flexShrink: 0,
                    }}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.63a19.79 19.79 0 01-3.07-8.7A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.13 6.13l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                    </svg>
                  </a>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ─── 탭: 내 정보 ─── */}
      {activeTab === "info" && (
        <div style={{ padding: "16px" }}>
          <div style={{ background: "white", borderRadius: 16, padding: "20px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 16, letterSpacing: "0.05em" }}>기사 정보</div>
            {[
              ["이름", driver.name || "-"],
              ["차량번호", driver.carNo || "-"],
              ["차량종류", driver.vehicleType || "-"],
              ["연락처", driver.phone || "-"],
              ["현재 상태", currentStatus],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid #f3f4f6" }}>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 13, color: "#1B2B4B", fontWeight: 700 }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ background: "white", borderRadius: 16, padding: "20px", marginTop: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 12, letterSpacing: "0.05em" }}>위치 정보</div>
            {pos ? (
              <>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>현재 좌표</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1B2B4B" }}>{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#9ca3af" }}>{permissionDenied ? "위치 권한이 없습니다" : "GPS 신호 대기중..."}</div>
            )}
          </div>

          <div style={{ background: "#fef3f2", borderRadius: 16, padding: "16px 20px", marginTop: 12, border: "1px solid #fecaca" }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>문제가 발생했을 때 로그아웃 후 재로그인하세요.</div>
            <button onClick={handleLogout} style={{
              width: "100%", padding: "12px", borderRadius: 12, border: "1.5px solid #fca5a5",
              background: "white", color: "#dc2626", fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}>
              로그아웃
            </button>
          </div>
        </div>
      )}

      {/* ─── 탭: 로그 ─── */}
      {activeTab === "logs" && (
        <div style={{ padding: "16px" }}>

          {/* 날짜 조회 */}
          <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 12, letterSpacing: "0.05em" }}>날짜 조회</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="date"
                value={logFrom}
                max={todayStr}
                onChange={e => setLogFrom(e.target.value)}
                style={{ flex: 1, minWidth: 120, padding: "9px 10px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 14, color: "#1B2B4B", background: "#f9fafb", outline: "none" }}
              />
              <span style={{ fontSize: 13, color: "#9ca3af", flexShrink: 0 }}>~</span>
              <input
                type="date"
                value={logTo}
                max={todayStr}
                onChange={e => setLogTo(e.target.value)}
                style={{ flex: 1, minWidth: 120, padding: "9px 10px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 14, color: "#1B2B4B", background: "#f9fafb", outline: "none" }}
              />
              <button
                onClick={() => setAppliedRange({ from: logFrom, to: logTo })}
                style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: "#1B2B4B", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                조회
              </button>
            </div>
          </div>

          {/* 근무 요약 */}
          <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 14, letterSpacing: "0.05em" }}>
              근무 요약 {appliedRange.from === appliedRange.to ? `(${appliedRange.from})` : `(${appliedRange.from} ~ ${appliedRange.to})`}
            </div>
            {[
              ["출근 시각", rangeSummary.checkInTime ? formatTime(rangeSummary.checkInTime) : "--"],
              ["총 근무시간", rangeSummary.workMs > 0 ? formatDuration(rangeSummary.workMs) : "--"],
              ["총 이동거리", appliedRange.from === todayStr && appliedRange.to === todayStr ? `${(driver.totalDistance || 0).toFixed(2)} km` : "--"],
              ["운행 횟수", `${rangeSummary.tripCount}회`],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 14, color: "#1B2B4B", fontWeight: 800 }}>{value}</span>
              </div>
            ))}
          </div>

          {/* 전체 상태 기록 */}
          <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 12, letterSpacing: "0.05em" }}>전체 상태 기록 ({rangeLogs.length}건)</div>
            {rangeLogs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", fontSize: 13, color: "#d1d5db" }}>해당 기간의 기록이 없습니다</div>
            ) : (
              <div>
                {[...rangeLogs].reverse().map((log, i) => {
                  const t = log.timestamp?.toDate?.();
                  const cfg = STATUS_CONFIG[log.status] || STATUS_CONFIG["대기"];
                  const isNewDay = i > 0 && (() => {
                    const prev = rangeLogs[rangeLogs.length - i]?.timestamp?.toDate?.();
                    return prev && t && prev.toDateString() !== t.toDateString();
                  })();
                  return (
                    <React.Fragment key={log.id}>
                      {isNewDay && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", padding: "8px 0 4px", borderTop: "1px solid #f0f2f5", marginTop: 4 }}>
                          {t ? `${t.getMonth()+1}/${t.getDate()}` : ""}
                        </div>
                      )}
                      <div style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 0",
                        borderBottom: i < rangeLogs.length - 1 ? "1px solid #f3f4f6" : "none",
                      }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#1B2B4B" }}>{log.status}</div>
                        <div style={{ fontSize: 12, color: "#9ca3af" }}>
                          {t ? (appliedRange.from !== appliedRange.to
                            ? `${t.getMonth()+1}/${t.getDate()} ${formatTime(t)}`
                            : formatTime(t)
                          ) : "--"}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 하단 탭 바 ─── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "white", borderTop: "1px solid #e5e7eb",
        display: "flex", zIndex: 200,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {[
          { key: "home", label: "홈", icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          )},
          { key: "logs", label: "운행기록", icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          )},
          { key: "contacts", label: "연락처", icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.63a19.79 19.79 0 01-3.07-8.7A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.13 6.13l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
          )},
          { key: "info", label: "내 정보", icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          )},
        ].map(({ key, label, icon }) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            flex: 1, padding: "10px 0 8px", border: "none", background: "none",
            cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            color: activeTab === key ? "#1B2B4B" : "#9ca3af",
            fontWeight: activeTab === key ? 700 : 500,
          }}>
            {icon}
            <span style={{ fontSize: 10, letterSpacing: "-0.2px" }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
