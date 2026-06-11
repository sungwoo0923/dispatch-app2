// DriverHome.jsx — 지입기사 전용 앱 (리뉴얼)
import React, { useEffect, useState, useRef, useCallback } from "react";
import { db, auth } from "../firebase";
import {
  doc, onSnapshot, updateDoc, addDoc, deleteDoc,
  collection, query, where, orderBy, limit, getDocs, serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

// Capacitor 네이티브 컨텍스트 여부 확인
const isNative = () => typeof window !== "undefined" && !!(window.Capacitor?.isNativePlatform?.());

// BackgroundGeolocation 플러그인 — Capacitor native bridge를 통해 등록
// 웹 빌드 시 registerPlugin은 no-op stub을 반환하므로 동적 import 불필요
let BgGeo = null;
async function loadBgGeo() {
  if (BgGeo) return BgGeo;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    BgGeo = registerPlugin("BackgroundGeolocation");
  } catch (_) {}
  return BgGeo;
}

// KST 날짜 문자열 (YYYY-MM-DD) — UTC 대신 KST 기준 오늘 날짜
function kstDateStr(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

// ─── 상태 설정 ───────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  대기:      { color: "#6b7280", label: "대기" },
  출근:      { color: "#1B2B4B", label: "출근" },
  상차중:    { color: "#374151", label: "상차중" },
  운행중:    { color: "#1B2B4B", label: "운행중" },
  하차중:    { color: "#374151", label: "하차중" },
  복귀중:    { color: "#4b5563", label: "복귀중" },
  휴식:      { color: "#9ca3af", label: "휴식" },
  휴차:      { color: "#374151", label: "휴차" },
  퇴근:      { color: "#111827", label: "퇴근" },
  최종퇴근:  { color: "#111827", label: "최종퇴근" },
};

// 다음 액션 정의 (현재 상태에 따른 컨텍스트 버튼)
function getActions(status, isFinalCheckout) {
  switch (status) {
    case "대기":
    case null:
    case undefined:
      return [
        { label: "출근", status: "출근", primary: true },
        { label: "휴차 처리", status: "휴차", primary: false },
      ];
    case "퇴근":
      if (isFinalCheckout) return [{ label: "출근", status: "출근", primary: true }];
      return [
        { label: "출근", status: "출근", primary: true },
        { label: "휴차 처리", status: "휴차", primary: false },
        { label: "최종 퇴근 완료 (당일 종료)", status: "최종퇴근", primary: false },
      ];
    case "출근":
      return [
        { label: "상차 시작", status: "상차중", primary: true },
        { label: "대기", status: "대기", primary: false },
        { label: "휴식", status: "휴식", primary: false },
        { label: "휴차 처리", status: "휴차", primary: false },
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
    case "휴차":
      return [
        { label: "대기로 복귀", status: "대기", primary: true },
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
  // Only process the current session: logs after the last "최종퇴근"
  let lastFinalIdx = -1;
  for (let i = logs.length - 1; i >= 0; i--) {
    if (logs[i].status === "최종퇴근") { lastFinalIdx = i; break; }
  }
  const sessionLogs = lastFinalIdx >= 0 ? logs.slice(lastFinalIdx + 1) : logs;

  let workMs = 0, driveMs = 0, checkInTime = null, tripCount = 0;
  let lastTime = null, lastStatus = null;

  sessionLogs.forEach(log => {
    const t = log.timestamp?.toDate?.();
    if (!t) return;
    if (log.status === "출근" && !checkInTime) checkInTime = t;
    if (log.status === "운행중") tripCount++;
    if (lastTime && lastStatus && lastStatus !== "퇴근" && lastStatus !== "대기" && lastStatus !== "최종퇴근") {
      const diff = t - lastTime;
      if (lastStatus !== "휴식") workMs += diff;
      if (lastStatus === "운행중" || lastStatus === "하차중") driveMs += diff;
    }
    lastTime = t; lastStatus = log.status;
  });

  if (lastTime && lastStatus && lastStatus !== "퇴근" && lastStatus !== "최종퇴근") {
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
  const lastGpsTimeRef = useRef(0);         // timestamp of last gps_tracks write

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

    // GPS 콜백 (watchPosition + BackgroundGeolocation 공통)
    const gpsCallback = async (lat, lng, speed, accuracy) => {
      setPos({ lat, lng, speed, accuracy });
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
      if (distDelta > 0.01) {
        totalDistRef.current += distDelta;
        updateData.totalDistance = totalDistRef.current;
      }
      const lastStore = lastGpsStoreRef.current;
      const storeDelta = lastStore ? calcDist(lastStore.lat, lastStore.lng, lat, lng) : 999;
      const nowMs = Date.now();
      const timeSinceLast = nowMs - lastGpsTimeRef.current;
      if (storeDelta > 0.05 || timeSinceLast >= 30000) {
        lastGpsStoreRef.current = { lat, lng };
        lastGpsTimeRef.current = nowMs;
        addDoc(collection(db, "gps_tracks"), {
          driverId: uid, lat, lng,
          speed: speed ? Math.round(speed * 3.6) : 0,
          timestamp: serverTimestamp(), date: kstDateStr(),
        }).catch(() => {});
      }
      try { await updateDoc(doc(db, "drivers", uid), updateData); } catch (_) {}
    };

    let cleanup = () => {};

    if (isNative()) {
      // ── 네이티브 앱: BackgroundGeolocation 플러그인 사용 ──
      let watcherId = null;
      loadBgGeo().then((plugin) => {
        if (!plugin) return;
        plugin.addWatcher(
          {
            backgroundMessage: "취소하면 위치 추적이 중지됩니다.",
            backgroundTitle: "KP-Flow 운행 추적 중",
            requestPermissions: true,
            stale: false,
            distanceFilter: 10,
          },
          (location, error) => {
            if (error) {
              if (error.code === "NOT_AUTHORIZED") setPermissionDenied(true);
              return;
            }
            gpsCallback(location.latitude, location.longitude, location.speed, location.accuracy);
          }
        ).then((id) => { watcherId = id; });
      });

      cleanup = () => {
        if (watcherId) {
          loadBgGeo().then((plugin) => plugin?.removeWatcher({ id: watcherId }).catch(() => {}));
        }
      };
    } else {
      // ── 웹 브라우저: navigator.geolocation 사용 ──
      let watchId = null;

      const startWatch = () => {
        if (watchId != null) navigator.geolocation.clearWatch(watchId);
        watchId = navigator.geolocation.watchPosition(
          (p) => gpsCallback(p.coords.latitude, p.coords.longitude, p.coords.speed, p.coords.accuracy),
          (err) => { if (err.code === 1) setPermissionDenied(true); },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
        );
      };

      startWatch();

      // 30초마다 updatedAt 강제 갱신 (정지 중에도 최신 상태 유지)
      const forceInterval = setInterval(() => {
        const p = lastPosRef.current;
        if (!p) return;
        updateDoc(doc(db, "drivers", uid), {
          location: { lat: p.lat, lng: p.lng },
          updatedAt: serverTimestamp(),
          active: true,
        }).catch(() => {});
      }, 30000);

      // 백그라운드→포그라운드 복귀 시 GPS 재시작
      const handleVisibility = () => {
        if (document.visibilityState !== "visible") return;
        startWatch();
        navigator.geolocation.getCurrentPosition(
          async (p) => {
            const { latitude: lat, longitude: lng, speed, accuracy } = p.coords;
            setPos({ lat, lng, speed, accuracy });
            if (accuracy <= 100) {
              lastPosRef.current = { lat, lng };
              try {
                await updateDoc(doc(db, "drivers", uid), {
                  location: { lat, lng },
                  speed: speed ? Math.round(speed * 3.6) : 0,
                  updatedAt: serverTimestamp(),
                  active: true,
                });
              } catch (_) {}
            }
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );
      };
      document.addEventListener("visibilitychange", handleVisibility);

      cleanup = () => {
        if (watchId != null) navigator.geolocation.clearWatch(watchId);
        clearInterval(forceInterval);
        document.removeEventListener("visibilitychange", handleVisibility);
      };
    }

    return cleanup;
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
  const autoDropDoneRef = useRef(false);
  const wasAwayFromCheckInRef = useRef(false); // tracks if driver moved >0.5km away since last check-in/out
  const [tick, setTick] = useState(0);
  const _td = new Date();
  const todayStr = `${_td.getFullYear()}-${String(_td.getMonth()+1).padStart(2,"0")}-${String(_td.getDate()).padStart(2,"0")}`;
  const [logFrom, setLogFrom] = useState(todayStr);
  const [logTo, setLogTo] = useState(todayStr);
  const [appliedRange, setAppliedRange] = useState({ from: todayStr, to: todayStr });
  const [checkinWarning, setCheckinWarning] = useState(null);
  const [collisionAlert, setCollisionAlert] = useState(null);
  const [locRequestSent, setLocRequestSent] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [calendarDayDetail, setCalendarDayDetail] = useState(null); // { dateStr, logs }
  const [photoModal, setPhotoModal] = useState(null); // { nextStatus, actionLabel }
  const [photoUploading, setPhotoUploading] = useState(false);
  const [todayPhotos, setTodayPhotos] = useState([]); // today's driver_photo_logs
  const [cargoTemp, setCargoTemp] = useState(null); // { temperature, humidity, updatedAt }
  const [emergencyModal, setEmergencyModal] = useState(false); // SOS 긴급 모달
  const [emergencySent, setEmergencySent] = useState(false); // 긴급 알림 전송 여부
  const driverRef = useRef(null);
  const posRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

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

  // 오늘 사진 업로드 현황 구독
  useEffect(() => {
    if (!uid) return;
    const _td2 = new Date();
    const todayDateStr = `${_td2.getFullYear()}-${String(_td2.getMonth()+1).padStart(2,"0")}-${String(_td2.getDate()).padStart(2,"0")}`;
    const q = query(collection(db, "driver_photo_logs"), where("uid","==",uid), where("logDate","==",todayDateStr));
    return onSnapshot(q, snap => setTodayPhotos(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [uid]);

  // 적재함 온도 구독 (IoT 센서 연결 시 자동 수신)
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "cargo_temp", uid), snap => {
      setCargoTemp(snap.exists() ? snap.data() : null);
    }, () => {});
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
    const start = new Date(todayStr + "T00:00:00+09:00");
    return allLogs.filter(l => { const t = l.timestamp?.toDate?.(); return t && t >= start; });
  }, [allLogs, todayStr]);
  const summary = React.useMemo(() => calcWorkSummary(todayLogs), [todayLogs, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // 운행기록 탭: 선택 날짜 범위 로그
  const rangeLogs = React.useMemo(() => {
    const from = appliedRange.from ? new Date(appliedRange.from + "T00:00:00+09:00") : null;
    const to = appliedRange.to ? new Date(appliedRange.to + "T23:59:59+09:00") : null;
    return allLogs.filter(l => {
      const t = l.timestamp?.toDate?.();
      if (!t) return false;
      if (from && t < from) return false;
      if (to && t > to) return false;
      return true;
    });
  }, [allLogs, appliedRange]);
  const rangeSummary = React.useMemo(() => calcWorkSummary(rangeLogs), [rangeLogs, tick]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const today = kstDateStr();
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
        driverUpdate.isFinalCheckout = false;
        // 날짜가 바뀌었거나 최종퇴근 후 재출근 시 거리 초기화
        if (driver?.workDate !== today || driver?.isFinalCheckout) {
          driverUpdate.totalDistance = 0;
          driverUpdate.workDate = today;
          resetTotalDist();
        }
      }
      // Capture before updateDoc — Firestore optimistic update may zero driver.totalDistance
      const finalDistance = isFinal ? (driver?.totalDistance || 0) : 0;
      if (isFinal) {
        // 최종퇴근: 오늘 누적거리 기록 후 다음날을 위해 초기화
        driverUpdate.workDate = today;
        driverUpdate.totalDistance = 0;
        driverUpdate.isFinalCheckout = true;
        resetTotalDist();
      }
      await updateDoc(doc(db, "drivers", uid), driverUpdate);
      const logExtra = isFinal ? { finalDistance } : {};
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

  // Auto 출근: must have moved >0.5km away from 출근지 at some point (wasAway guard)
  // On app restart: if driver's last status update was >5 min ago, assume they've been away
  useEffect(() => {
    if (!pos || !uid || statusLoading) return;
    const status = driver?.status;
    if (status && status !== "퇴근" && status !== "대기") return;
    const checkInLoc = driver?.checkInLocation || companyDefaultLoc;
    if (!checkInLoc?.lat || !checkInLoc?.lng) return;
    if (pos.accuracy != null && pos.accuracy > 100) return;
    const today = kstDateStr();
    const isSameDayFinal = driver?.isFinalCheckout && driver?.workDate === today;
    const dist = calcDist(pos.lat, pos.lng, checkInLoc.lat, checkInLoc.lng);
    if (dist > 0.5) wasAwayFromCheckInRef.current = true;
    // App restart scenario: if within range but wasAway not yet set, check driver.updatedAt
    // If last status change was >5 min ago, it's safe to assume driver was away since then
    if (!wasAwayFromCheckInRef.current && !autoCheckinDoneRef.current && dist <= 0.5) {
      const raw = driver?.updatedAt;
      const updatedAt = raw?.toDate?.() || (raw?.seconds ? new Date(raw.seconds * 1000) : null);
      if (updatedAt && (Date.now() - updatedAt.getTime()) > 5 * 60 * 1000) {
        wasAwayFromCheckInRef.current = true;
      }
    }
    if (isSameDayFinal) return;
    if (wasAwayFromCheckInRef.current && !autoCheckinDoneRef.current && dist <= 0.5) {
      autoCheckinDoneRef.current = true;
      updateStatus("출근").catch(() => { autoCheckinDoneRef.current = false; });
    }
  }, [pos, uid, statusLoading, driver?.status, driver?.checkInLocation, driver?.isFinalCheckout, driver?.workDate, driver?.updatedAt, companyDefaultLoc, updateStatus]);

  // 자동 하차: status가 운행중이 아닐 때 autoDropDoneRef 리셋
  useEffect(() => {
    if (driver?.status !== "운행중") autoDropDoneRef.current = false;
  }, [driver?.status]);

  // 자동 하차시작: 운행중 + 하차지 100m 이내 진입 시 자동 트리거
  useEffect(() => {
    if (!pos || !uid || statusLoading) return;
    if (driver?.status !== "운행중") return;
    const dropLoc = driver?.dropLocation;
    if (!dropLoc?.lat || !dropLoc?.lng) return;
    if (pos.accuracy != null && pos.accuracy > 50) return;
    const dist = calcDist(pos.lat, pos.lng, dropLoc.lat, dropLoc.lng);
    if (!autoDropDoneRef.current && dist <= 0.1) {
      autoDropDoneRef.current = true;
      updateStatus("하차중").catch(() => { autoDropDoneRef.current = false; });
    }
  }, [pos, uid, statusLoading, driver?.status, driver?.dropLocation, updateStatus]);

  // 수동 출근: 출근지가 설정된 경우 0.5km 이내에서만 허용
  const handleActionButton = useCallback((action) => {
    if (action.status === "출근") {
      const checkInLoc = driver?.checkInLocation || companyDefaultLoc;
      if (checkInLoc?.lat && checkInLoc?.lng && pos && (pos.accuracy == null || pos.accuracy <= 100)) {
        const dist = calcDist(pos.lat, pos.lng, checkInLoc.lat, checkInLoc.lng);
        if (dist > 0.5) {
          setCheckinWarning(dist);
          return;
        }
      }
    }
    // 상차완료 / 하차완료 → 사진 업로드 모달
    if (action.status === "운행중" || action.status === "복귀중") {
      setPhotoModal({ nextStatus: action.status, actionLabel: action.label });
      return;
    }
    updateStatus(action.status);
  }, [driver?.checkInLocation, companyDefaultLoc, pos, updateStatus]);

  // 사진 업로드 처리
  const handlePhotoUpload = useCallback(async (file) => {
    if (!file || !uid) return;
    setPhotoUploading(true);
    try {
      // Compress image before storing (Canvas resize → JPEG 0.75, max 1200px)
      const base64 = await new Promise((res, rej) => {
        const img = new Image();
        const objUrl = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(objUrl);
          const MAX = 1200;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
            else { width = Math.round(width * MAX / height); height = MAX; }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          res(canvas.toDataURL("image/jpeg", 0.75));
        };
        img.onerror = rej;
        img.src = objUrl;
      });
      const _now = new Date();
      const logDate = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,"0")}-${String(_now.getDate()).padStart(2,"0")}`;
      const actionType = photoModal.nextStatus === "운행중" ? "상차완료" : "하차완료";
      await addDoc(collection(db, "driver_photo_logs"), {
        uid,
        driverName: driver?.name || "",
        carNo: driver?.carNo || "",
        actionType,
        imageBase64: base64,
        timestamp: serverTimestamp(),
        logDate,
        companyName: driver?.companyName || "",
      });
      showToast(`${actionType} 사진이 전송되었습니다`);
      await updateStatus(photoModal.nextStatus);
      setPhotoModal(null);
    } catch (e) {
      showToast("사진 전송 중 오류가 발생했습니다");
    } finally {
      setPhotoUploading(false);
    }
  }, [uid, driver, photoModal, updateStatus]);

  // 긴급 알림 관리자에게 전송
  const handleSendEmergency = useCallback(async () => {
    if (!uid || emergencySent) return;
    try {
      await addDoc(collection(db, "emergency_alerts"), {
        uid,
        driverName: driver?.name || "",
        carNo: driver?.carNo || "",
        location: (pos && (pos.accuracy == null || pos.accuracy <= 100)) ? { lat: pos.lat, lng: pos.lng } : null,
        timestamp: serverTimestamp(),
        resolved: false,
        companyName: driver?.companyName || "",
      });
      setEmergencySent(true);
      showToast("관리자에게 긴급 알림이 전송되었습니다");
      setTimeout(() => setEmergencySent(false), 60000);
    } catch (_) {
      showToast("전송 중 오류가 발생했습니다");
    }
  }, [uid, driver, pos, emergencySent]);

  // 이전 상태로 되돌리기: 마지막 로그 삭제 후 이전 상태로 복원
  const handleUndoLastStatus = useCallback(async () => {
    if (!uid || statusLoading || todayLogs.length === 0) return;
    setStatusLoading(true);
    try {
      const sorted = [...todayLogs].sort((a, b) => {
        const at = a.timestamp?.toDate?.()?.getTime() || 0;
        const bt = b.timestamp?.toDate?.()?.getTime() || 0;
        return at - bt;
      });
      const lastLog = sorted[sorted.length - 1];
      const prevLog = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
      const prevStatus = prevLog?.mainStatus || prevLog?.status || "대기";
      await deleteDoc(doc(db, "driver_logs", lastLog.id));
      const undoUpdate = {
        status: prevStatus,
        mainStatus: prevStatus,
        active: prevStatus !== "퇴근" && prevStatus !== "대기" && prevStatus !== "휴차",
        updatedAt: serverTimestamp(),
      };
      if (prevStatus === "출근") undoUpdate.isFinalCheckout = false;
      await updateDoc(doc(db, "drivers", uid), undoUpdate);
      showToast(`'${lastLog.status}' 취소 → '${prevStatus}'`);
    } catch (_) {
      showToast("되돌리기 중 오류가 발생했습니다");
    } finally {
      setStatusLoading(false);
    }
  }, [uid, statusLoading, todayLogs]);

  // 새로고침: tick 갱신 + 출근지 반경 내이면 자동 출근 시도
  const handleRefresh = useCallback(() => {
    setTick(t => t + 1);
    const status = driver?.status;
    if (!uid || statusLoading || (status && status !== "퇴근" && status !== "대기" && status !== "휴차")) {
      showToast("새로고침 완료");
      return;
    }
    if (driver?.isFinalCheckout && kstDateStr() === (driver?.workDate)) {
      showToast("새로고침 완료");
      return;
    }
    const checkInLoc = driver?.checkInLocation || companyDefaultLoc;
    if (!checkInLoc?.lat || !checkInLoc?.lng || !pos || (pos.accuracy != null && pos.accuracy > 100)) {
      showToast("새로고침 완료");
      return;
    }
    const dist = calcDist(pos.lat, pos.lng, checkInLoc.lat, checkInLoc.lng);
    if (dist <= 0.5 && !autoCheckinDoneRef.current) {
      autoCheckinDoneRef.current = true;
      wasAwayFromCheckInRef.current = true;
      updateStatus("출근")
        .then(() => showToast("출근지 인식 — 출근 처리되었습니다"))
        .catch(() => { autoCheckinDoneRef.current = false; wasAwayFromCheckInRef.current = false; showToast("출근 처리 중 오류"); });
    } else {
      showToast("새로고침 완료");
    }
  }, [uid, statusLoading, driver, companyDefaultLoc, pos, updateStatus]);

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
  const actions = getActions(currentStatus, driver.isFinalCheckout);
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
              출근지 반경 <strong style={{ color: "#1B2B4B" }}>500m 이내</strong>에서만 출근 처리가 가능합니다.<br />
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* SOS 긴급 버튼 */}
              <button
                onClick={() => setEmergencyModal(true)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 20, background: "#ef4444", border: "none", color: "white", fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 10px rgba(239,68,68,0.5)", letterSpacing: "0.03em" }}
              >
                <svg width="13" height="13" fill="white" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                SOS
              </button>
              {/* 설정 버튼 */}
              <button onClick={() => setActiveTab("settings")} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="16" height="16" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{dateStr}</div>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.05em" }}>오늘 운행 현황</div>
              <button
                onClick={handleRefresh}
                style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 8, padding: "4px 10px", fontSize: 11, color: "#6b7280", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                새로고침
              </button>
            </div>
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

          {/* 연료비 추정 */}
          {(driver.totalDistance || 0) > 0.5 && (() => {
            const km = driver.totalDistance || 0;
            const vt = String(driver.vehicleType || "").replace(/\s/g,"");
            const eff = /25|28/.test(vt)?3.0:/11|15|18/.test(vt)?3.5:/1[^0-9]|2\.5|소형/.test(vt)?5.5:4.0;
            const liters = km / eff;
            const cost = Math.round(liters * 1750);
            return (
              <div style={{ background:"white", borderRadius:16, padding:"14px 16px", marginBottom:14, boxShadow:"0 1px 6px rgba(0,0,0,0.06)", border:"1px solid #e5e7eb" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", marginBottom:10, letterSpacing:"0.05em" }}>오늘 연료비 추정</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                  {[
                    { label:"이동거리", value:`${km.toFixed(1)} km` },
                    { label:"연료 소비", value:`${liters.toFixed(1)} L` },
                    { label:"연료비", value:`${cost.toLocaleString()}원` },
                  ].map(({label,value})=>(
                    <div key={label} style={{ textAlign:"center", padding:"10px 4px", background:"#f9fafb", borderRadius:10 }}>
                      <div style={{ fontSize:15, fontWeight:800, color:"#1B2B4B" }}>{value}</div>
                      <div style={{ fontSize:10, color:"#9ca3af", marginTop:3, fontWeight:600 }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:10, color:"#d1d5db", marginTop:8, textAlign:"center" }}>
                  기준: {eff}km/L · 경유 1,750원/L
                </div>
              </div>
            );
          })()}

          {/* GPS 경고 */}
          {permissionDenied && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", marginBottom: 2 }}>위치 권한이 필요합니다</div>
              <div style={{ fontSize: 12, color: "#ef4444" }}>설정에서 위치 권한을 허용하면 실시간 추적 및 출근지 500m 이내 자동 출근이 가능합니다.</div>
            </div>
          )}

          {/* 액션 버튼 */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 10, letterSpacing: "0.05em" }}>
              {driver.isFinalCheckout ? "당일 근무 완료" : (currentStatus === "퇴근" || currentStatus === "대기" || !driver.status ? "오늘 업무 시작" : "다음 액션")}
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

          {/* 오늘 사진 업로드 현황 */}
          {(() => {
            const hasLoad = todayPhotos.some(p => p.actionType === "상차완료");
            const hasDrop = todayPhotos.some(p => p.actionType === "하차완료");
            return (
              <div style={{ background: "#1B2B4B", borderRadius: 16, padding: "14px 16px", marginBottom: 14, boxShadow: "0 4px 16px rgba(27,43,75,0.18)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 10, letterSpacing: "0.06em" }}>오늘 사진 전송 현황</div>
                <div style={{ display: "flex", gap: 10 }}>
                  {[["상차완료", hasLoad], ["하차완료", hasDrop]].map(([label, sent]) => (
                    <div key={label} style={{
                      flex: 1, padding: "10px 12px", borderRadius: 10, textAlign: "center",
                      background: sent ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${sent ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)"}`,
                    }}>
                      <div style={{ fontSize: 11, color: sent ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.4)", fontWeight: 700, marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: sent ? "#ffffff" : "rgba(255,255,255,0.35)" }}>{sent ? "✓ 전송완료" : "미전송"}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 이전 상태로 되돌리기 */}
          {todayLogs.length > 0 && !driver.isFinalCheckout && (
            <div style={{ marginBottom: 14 }}>
              <button
                onClick={handleUndoLastStatus}
                disabled={statusLoading}
                style={{
                  width: "100%", padding: "11px 20px", borderRadius: 12,
                  border: "1.5px solid #e5e7eb", background: "white",
                  color: "#6b7280", fontSize: 13, fontWeight: 600,
                  cursor: statusLoading ? "not-allowed" : "pointer",
                  opacity: statusLoading ? 0.6 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.36"/></svg>
                이전 상태로 되돌리기
              </button>
            </div>
          )}

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

      {/* ─── 탭: 온도 관제 ─── */}
      {activeTab === "temperature" && (
        <div style={{ padding: "16px" }}>
          {/* 헤더 */}
          <div style={{ background: "#1B2B4B", borderRadius: 16, padding: "16px 18px", marginBottom: 14, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>
            </div>
            <div>
              <div style={{ color: "white", fontWeight: 800, fontSize: 15 }}>적재함 온도</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>IoT 센서 연결 시 실시간 표시</div>
            </div>
          </div>

          {cargoTemp && cargoTemp.temperature != null ? (() => {
            const temp = cargoTemp.temperature;
            const updAt = cargoTemp.updatedAt?.toDate?.() || (cargoTemp.updatedAt?.seconds ? new Date(cargoTemp.updatedAt.seconds * 1000) : null);
            const ago = updAt ? Math.round((Date.now() - updAt.getTime()) / 1000) : null;
            const isOnline = ago != null && ago < 300;
            let tempColor = "#1B2B4B", tempBg = "#f0f4ff";
            if (temp <= -18) { tempColor = "#3b82f6"; tempBg = "#eff6ff"; }
            else if (temp <= 0) { tempColor = "#06b6d4"; tempBg = "#ecfeff"; }
            else if (temp <= 10) { tempColor = "#10b981"; tempBg = "#f0fdf4"; }
            else if (temp > 25) { tempColor = "#ef4444"; tempBg = "#fef2f2"; }
            return (
              <div style={{ background: "white", borderRadius: 16, padding: "24px 20px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: `1.5px solid ${tempColor}30`, textAlign: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, marginBottom: 6, letterSpacing: "0.05em" }}>현재 온도</div>
                <div style={{ fontSize: 52, fontWeight: 900, color: tempColor, lineHeight: 1, marginBottom: 8 }}>
                  {temp > 0 ? "+" : ""}{temp.toFixed(1)}°C
                </div>
                {cargoTemp.humidity != null && (
                  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>습도 {cargoTemp.humidity.toFixed(0)}%</div>
                )}
                <div style={{ fontSize: 11, color: isOnline ? "#10b981" : "#9ca3af", fontWeight: 600 }}>
                  {isOnline ? `● 실시간 · ${ago}초 전 업데이트` : `● 오프라인 · ${updAt ? updAt.toLocaleTimeString("ko-KR") : "알 수 없음"}`}
                </div>
              </div>
            );
          })() : (
            <div style={{ background: "white", borderRadius: 16, padding: "32px 20px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb", textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🌡️</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 6 }}>센서 미연결</div>
              <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6 }}>IoT 온도 센서가 설치되면<br/>여기에 적재함 온도가 표시됩니다</div>
            </div>
          )}

          {/* 안내 */}
          <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>센서 연결 안내</div>
            <div style={{ fontSize: 12, color: "#78350f", lineHeight: 1.7 }}>
              Bluetooth 또는 WiFi 온도 센서 구매 후 차량에 부착하면 자동으로 연동됩니다. 관리자에게 문의하세요.
            </div>
          </div>
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

      {/* ─── 탭: 설정 ─── */}
      {activeTab === "settings" && (
        <div style={{ padding: "16px" }}>

          {/* 기사 정보 */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 8, letterSpacing: "0.06em", paddingLeft: 4 }}>기사 정보</div>
          <div style={{ background: "white", borderRadius: 16, boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb", overflow: "hidden", marginBottom: 20 }}>
            {[
              ["이름", driver.name || "-"],
              ["차량번호", driver.carNo || "-"],
              ["차량종류", driver.vehicleType || "-"],
              ["연락처", driver.phone || "-"],
              ["현재 상태", currentStatus],
            ].map(([label, value], i, arr) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", borderBottom: i < arr.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 13, color: "#1B2B4B", fontWeight: 700 }}>{value}</span>
              </div>
            ))}
          </div>

          {/* 위치 설정 */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 8, letterSpacing: "0.06em", paddingLeft: 4 }}>위치 설정</div>
          <div style={{ background: "white", borderRadius: 16, boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb", overflow: "hidden", marginBottom: 20 }}>
            {/* 출발지 */}
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="16" height="16" fill="none" stroke="#3b82f6" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1B2B4B" }}>출발지 (출근지)</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>
                      {(() => { const loc = driver.checkInLocation || companyDefaultLoc; return loc ? (loc.name || `${loc.lat?.toFixed(4)}, ${loc.lng?.toFixed(4)}`) : "미설정"; })()}
                    </div>
                  </div>
                </div>
                {locRequestSent ? (
                  <span style={{ fontSize: 11, color: "#10b981", fontWeight: 700 }}>요청됨 ✓</span>
                ) : (
                  <button
                    onClick={async () => {
                      try {
                        const loc = driver.checkInLocation || companyDefaultLoc;
                        await addDoc(collection(db, "location_change_requests"), { uid, driverName: driver?.name || "", carNo: driver?.carNo || "", currentLocation: loc || null, requestedAt: serverTimestamp(), status: "pending" });
                        setLocRequestSent(true);
                        setTimeout(() => setLocRequestSent(false), 30000);
                        showToast("관리자에게 변경 요청이 전송되었습니다");
                      } catch (_) { showToast("요청 전송 중 오류가 발생했습니다"); }
                    }}
                    style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6", background: "#eff6ff", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}
                  >
                    변경 요청
                  </button>
                )}
              </div>
            </div>
            {/* 하차지 */}
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fdf4ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="16" height="16" fill="none" stroke="#a855f7" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1B2B4B" }}>하차지 설정</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>
                      {driver.dropLocation ? `${driver.dropLocation.lat.toFixed(4)}, ${driver.dropLocation.lng.toFixed(4)}` : "미설정 · 100m 내 자동 하차"}
                    </div>
                  </div>
                </div>
                {pos ? (
                  <button
                    onClick={async () => {
                      if (pos.accuracy != null && pos.accuracy > 100) { showToast("GPS 정확도가 낮습니다"); return; }
                      try { await updateDoc(doc(db, "drivers", uid), { dropLocation: { lat: pos.lat, lng: pos.lng } }); showToast("하차지가 저장되었습니다"); }
                      catch (_) { showToast("저장 중 오류가 발생했습니다"); }
                    }}
                    style={{ fontSize: 12, fontWeight: 700, color: "#a855f7", background: "#fdf4ff", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}
                  >현위치 저장</button>
                ) : (
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>GPS 대기중</span>
                )}
              </div>
              {driver.dropLocation && (
                <button
                  onClick={async () => { try { await updateDoc(doc(db, "drivers", uid), { dropLocation: null }); showToast("하차지가 초기화되었습니다"); } catch (_) {} }}
                  style={{ marginTop: 8, fontSize: 11, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                >하차지 초기화</button>
              )}
            </div>
            {/* GPS 현황 */}
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: pos ? "#f0fdf4" : "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="16" height="16" fill="none" stroke={pos ? "#10b981" : "#9ca3af"} strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1B2B4B" }}>GPS 상태</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>
                    {permissionDenied ? "위치 권한 없음" : pos ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)} · 정확도 ${pos.accuracy ? `${Math.round(pos.accuracy)}m` : "양호"}` : "신호 대기중..."}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 누적 통계 */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 8, letterSpacing: "0.06em", paddingLeft: 4 }}>누적 통계</div>
          {(() => {
            const allSessions = [];
            let checkIn = null;
            const sorted = [...allLogs].sort((a,b)=>(a.timestamp?.toDate?.()?.getTime()||0)-(b.timestamp?.toDate?.()?.getTime()||0));
            sorted.forEach(l => {
              const s = l.status || l.mainStatus || "";
              if (s === "출근") checkIn = l.timestamp?.toDate?.();
              if ((s === "최종퇴근" || s === "퇴근") && checkIn) {
                const out = l.timestamp?.toDate?.(); if (out) allSessions.push(out.getTime() - checkIn.getTime()); if (s === "최종퇴근") checkIn = null;
              }
            });
            const totalWorkMs = allSessions.reduce((a,b)=>a+b, 0);
            const workDays = new Set(sorted.filter(l=>(l.status||l.mainStatus)==="출근").map(l=>{ const t=l.timestamp?.toDate?.(); return t?kstDateStr(t):""; })).size;
            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
                {[
                  ["누적 출근일", `${workDays}일`],
                  ["총 근무시간", totalWorkMs > 0 ? formatDuration(totalWorkMs) : "--"],
                  ["운행기록", `${allLogs.filter(l=>(l.status||l.mainStatus)==="운행중").length}회`],
                ].map(([label, value]) => (
                  <div key={label} style={{ textAlign: "center", padding: "14px 8px", background: "white", borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#1B2B4B" }}>{value}</div>
                    <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, fontWeight: 600 }}>{label}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* 운행일지 달력 */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 8, letterSpacing: "0.06em", paddingLeft: 4 }}>운행일지</div>
          {(() => {
            const { y, m } = calendarMonth;
            const daysInMonth = new Date(y, m + 1, 0).getDate();
            const firstDay = new Date(y, m, 1).getDay();
            const checkinDates = new Set(allLogs.filter(l => (l.status || l.mainStatus) === "출근").map(l => { const t = l.timestamp?.toDate?.(); return t ? kstDateStr(t) : ""; }).filter(Boolean));
            const logsByDate = {};
            allLogs.forEach(l => { const t = l.timestamp?.toDate?.(); if (!t) return; const ds = kstDateStr(t); if (!logsByDate[ds]) logsByDate[ds] = []; logsByDate[ds].push(l); });
            const DAYS = ["일","월","화","수","목","금","토"];
            return (
              <div style={{ background: "white", borderRadius: 16, padding: "20px", marginBottom: 20, boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => setCalendarMonth(({y,m}) => m===0 ? {y:y-1,m:11} : {y,m:m-1})} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 7, padding: "3px 8px", fontSize: 13, cursor: "pointer", color: "#374151" }}>‹</button>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1B2B4B", minWidth: 72, textAlign: "center" }}>{y}년 {m+1}월</span>
                    <button onClick={() => setCalendarMonth(({y,m}) => m===11 ? {y:y+1,m:0} : {y,m:m+1})} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 7, padding: "3px 8px", fontSize: 13, cursor: "pointer", color: "#374151" }}>›</button>
                  </div>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>출근일 {checkinDates.size}일</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 8 }}>
                  {DAYS.map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#9ca3af", padding: "4px 0" }}>{d}</div>)}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
                  {Array(firstDay).fill(null).map((_,i) => <div key={`e${i}`} />)}
                  {Array.from({length: daysInMonth}, (_,i) => {
                    const day = i + 1;
                    const ds = `${y}-${String(m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                    const hasCheckin = checkinDates.has(ds);
                    const isToday = ds === todayStr;
                    return (
                      <button key={ds}
                        onClick={() => hasCheckin && setCalendarDayDetail({ dateStr: ds, logs: (logsByDate[ds] || []).sort((a,b)=>(a.timestamp?.toDate?.()?.getTime()||0)-(b.timestamp?.toDate?.()?.getTime()||0)) })}
                        style={{ aspectRatio: "1", borderRadius: 8, border: "none", background: hasCheckin ? "#1B2B4B" : isToday ? "#f0f4f8" : "transparent", color: hasCheckin ? "white" : isToday ? "#1B2B4B" : "#374151", fontSize: 13, fontWeight: hasCheckin||isToday ? 700 : 400, cursor: hasCheckin ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", outline: isToday && !hasCheckin ? "1.5px solid #1B2B4B" : "none" }}
                      >{day}</button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 10, textAlign: "center" }}>출근한 날짜를 탭하면 상세 기록을 볼 수 있습니다</div>
              </div>
            );
          })()}

          {/* 달력 날짜 상세 팝업 */}
          {calendarDayDetail && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9998, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setCalendarDayDetail(null)}>
              <div style={{ background: "white", borderRadius: "20px 20px 0 0", padding: "0 0 32px", width: "100%", maxWidth: 480, boxShadow: "0 -8px 32px rgba(0,0,0,0.2)", maxHeight: "80vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                <div style={{ background: "#1B2B4B", padding: "18px 20px 16px", borderRadius: "20px 20px 0 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ color: "white", fontWeight: 800, fontSize: 16 }}>{calendarDayDetail.dateStr}</div>
                  <button onClick={() => setCalendarDayDetail(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
                </div>
                {(() => {
                  const logs = calendarDayDetail.logs;
                  let checkIn=null, checkOut=null, tripCount=0;
                  logs.forEach(l => { const s = l.status || l.mainStatus || ""; const t = l.timestamp?.toDate?.(); if (s==="출근" && !checkIn) checkIn=t; if (s==="최종퇴근" || s==="퇴근") checkOut=t; if (s==="운행중") tripCount++; });
                  const workMs = checkIn && checkOut ? checkOut.getTime()-checkIn.getTime() : (checkIn ? Date.now()-checkIn.getTime() : 0);
                  return (
                    <div style={{ padding: "16px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                        {[["출근 시각", checkIn ? formatTime(checkIn) : "--"], ["퇴근 시각", checkOut ? formatTime(checkOut) : (checkIn ? "근무중" : "--")], ["근무 시간", workMs > 0 ? formatDuration(workMs) : "--"], ["운행 횟수", `${tripCount}회`]].map(([label, value]) => (
                          <div key={label} style={{ background: "#f9fafb", borderRadius: 10, padding: "12px", textAlign: "center" }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: "#1B2B4B" }}>{value}</div>
                            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, fontWeight: 600 }}>{label}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 10, letterSpacing: "0.05em" }}>상태 기록</div>
                      {logs.map((log, i) => { const t = log.timestamp?.toDate?.(); const cfg = STATUS_CONFIG[log.status] || STATUS_CONFIG["대기"]; return (
                        <div key={log.id || i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i<logs.length-1 ? "1px solid #f3f4f6" : "none" }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                          <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#1B2B4B" }}>{log.status}</div>
                          <div style={{ fontSize: 12, color: "#9ca3af" }}>{t ? formatTime(t) : "--"}</div>
                        </div>
                      ); })}
                      {(() => {
                        const dayPhotos = todayPhotos.filter(p => p.logDate === calendarDayDetail.dateStr);
                        if (!dayPhotos.length) return null;
                        return (
                          <div style={{ marginTop: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 10, letterSpacing: "0.05em" }}>첨부 사진</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                              {dayPhotos.map(p => (
                                <div key={p.id} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #e5e7eb" }}>
                                  <img src={p.imageBase64} alt={p.actionType} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover" }} />
                                  <div style={{ padding: "6px 8px", fontSize: 11, fontWeight: 700, color: "#1B2B4B", background: "#f9fafb" }}>{p.actionType}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* 앱 정보 & 로그아웃 */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 8, letterSpacing: "0.06em", paddingLeft: 4 }}>앱 정보</div>
          <div style={{ background: "white", borderRadius: 16, boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb", overflow: "hidden", marginBottom: 20 }}>
            {[
              ["앱 이름", "KP-Flow 기사 앱"],
              ["회사", driver.companyName || "-"],
            ].map(([label, value], i, arr) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", borderBottom: i < arr.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ background: "#fef3f2", borderRadius: 16, padding: "16px 20px", marginBottom: 16, border: "1px solid #fecaca" }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>문제가 발생했을 때 로그아웃 후 재로그인하세요.</div>
            <button onClick={handleLogout} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1.5px solid #fca5a5", background: "white", color: "#dc2626", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
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

      {/* ─── 사진 업로드 모달 ─── */}
      {photoModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:9999, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
          <div style={{ background:"white", borderRadius:"20px 20px 0 0", width:"100%", maxWidth:480, boxShadow:"0 -8px 32px rgba(0,0,0,0.25)", paddingBottom:"max(24px, env(safe-area-inset-bottom))" }}>
            <div style={{ background:"#1B2B4B", padding:"18px 20px 16px", borderRadius:"20px 20px 0 0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ color:"white", fontWeight:800, fontSize:16 }}>{photoModal.actionLabel}</div>
                <div style={{ color:"rgba(255,255,255,0.6)", fontSize:12, marginTop:2 }}>사진을 업로드해야 다음 단계로 이동합니다</div>
              </div>
            </div>
            <div style={{ padding:"20px 20px 0" }}>
              <div style={{ fontSize:13, color:"#374151", lineHeight:1.6, marginBottom:20 }}>
                {photoModal.nextStatus === "운행중" ? "상차가 완료된 상태를 사진으로 남겨주세요." : "하차가 완료된 상태를 사진으로 남겨주세요."}<br />
                <span style={{ fontSize:12, color:"#9ca3af" }}>관리자가 실시간으로 확인할 수 있습니다.</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {/* 카메라 직접 촬영 */}
                <label style={{ display:"block", width:"100%", padding:"15px", borderRadius:14, background:"#1B2B4B", color:"white", fontSize:16, fontWeight:700, textAlign:"center", cursor: photoUploading ? "not-allowed" : "pointer", opacity: photoUploading ? 0.6 : 1, boxShadow:"0 4px 16px rgba(27,43,75,0.25)" }}>
                  {photoUploading ? "업로드 중..." : "카메라로 촬영"}
                  <input type="file" accept="image/*" capture="environment" style={{ display:"none" }} disabled={photoUploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value=""; }} />
                </label>
                {/* 앨범 선택 */}
                <label style={{ display:"block", width:"100%", padding:"13px", borderRadius:14, background:"white", color:"#1B2B4B", fontSize:15, fontWeight:700, textAlign:"center", cursor: photoUploading ? "not-allowed" : "pointer", border:"1.5px solid #1B2B4B" }}>
                  앨범에서 선택
                  <input type="file" accept="image/*" style={{ display:"none" }} disabled={photoUploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value=""; }} />
                </label>
                {/* 건너뛰기 (경고 포함) */}
                <button
                  onClick={() => {
                    if (window.confirm("사진을 업로드하지 않으면 기록이 남지 않습니다.\n정말 건너뛰시겠습니까?")) {
                      updateStatus(photoModal.nextStatus);
                      setPhotoModal(null);
                    }
                  }}
                  disabled={photoUploading}
                  style={{ width:"100%", padding:"12px", borderRadius:14, border:"1.5px solid #e5e7eb", background:"white", color:"#9ca3af", fontSize:14, fontWeight:600, cursor: photoUploading ? "not-allowed" : "pointer" }}
                >
                  사진 없이 건너뛰기
                </button>
              </div>
            </div>
            <div style={{ padding:"16px 20px 0" }}>
              <div style={{ padding:"10px 14px", borderRadius:10, background:"#fef9c3", border:"1px solid #fde68a" }}>
                <div style={{ fontSize:12, color:"#92400e", fontWeight:600 }}>⚠ 사진 없이 건너뛰면 해당 시점 사진 기록이 남지 않습니다.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 긴급 SOS 모달 ─── */}
      {emergencyModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 99999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setEmergencyModal(false)}>
          <div style={{ background: "white", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 480, paddingBottom: "max(24px, env(safe-area-inset-bottom))", boxShadow: "0 -8px 40px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div style={{ background: "#ef4444", padding: "20px 22px 18px", borderRadius: "24px 24px 0 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fmBlink 0.8s ease-in-out infinite" }}>
                  <svg width="22" height="22" fill="white" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                </div>
                <div>
                  <div style={{ color: "white", fontWeight: 900, fontSize: 18 }}>긴급 상황</div>
                  <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 }}>아래 버튼을 눌러 즉시 연결하세요</div>
                </div>
              </div>
              <button onClick={() => setEmergencyModal(false)} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, color: "white", fontSize: 20, width: 34, height: 34, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>

            {/* 즉시 전화 버튼 */}
            <div style={{ padding: "18px 20px 0" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", marginBottom: 10, letterSpacing: "0.05em" }}>즉시 전화 연결</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "119", sub: "화재·구급", tel: "119", color: "#ef4444", bg: "#fef2f2" },
                  { label: "112", sub: "경찰 신고", tel: "112", color: "#3b82f6", bg: "#eff6ff" },
                  { label: "배차팀", sub: "1533-2525", tel: "15332525", color: "#1B2B4B", bg: "#f0f4ff" },
                ].map(({ label, sub, tel, color, bg }) => (
                  <a key={label} href={`tel:${tel}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 8px", borderRadius: 14, background: bg, border: `1.5px solid ${color}30`, textDecoration: "none", cursor: "pointer" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                      <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.63a19.79 19.79 0 01-3.07-8.7A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.13 6.13l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 900, color }}>{label}</div>
                    <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{sub}</div>
                  </a>
                ))}
              </div>

              {/* 관리자 긴급 알림 전송 */}
              <button
                onClick={async () => { await handleSendEmergency(); }}
                disabled={emergencySent}
                style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none", background: emergencySent ? "#f3f4f6" : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", color: emergencySent ? "#9ca3af" : "white", fontSize: 16, fontWeight: 800, cursor: emergencySent ? "default" : "pointer", boxShadow: emergencySent ? "none" : "0 4px 16px rgba(239,68,68,0.35)", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4 20-7z"/></svg>
                {emergencySent ? "관리자에게 알림 전송됨 ✓" : "관리자에게 긴급 알림 전송"}
              </button>
              {pos && (
                <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginBottom: 6 }}>
                  현재 위치 ({pos.lat.toFixed(4)}, {pos.lng.toFixed(4)})가 함께 전송됩니다
                </div>
              )}
            </div>
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
          { key: "temperature", label: "온도", icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
            </svg>
          )},
          { key: "contacts", label: "연락처", icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.63a19.79 19.79 0 01-3.07-8.7A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.13 6.13l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
          )},
          { key: "settings", label: "설정", icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
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
