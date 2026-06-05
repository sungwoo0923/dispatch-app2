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
  대기:    { color: "#6b7280", label: "대기" },
  출근:    { color: "#1B2B4B", label: "출근" },
  상차중:  { color: "#374151", label: "상차중" },
  운행중:  { color: "#1B2B4B", label: "운행중" },
  하차중:  { color: "#374151", label: "하차중" },
  복귀중:  { color: "#4b5563", label: "복귀중" },
  휴식:    { color: "#9ca3af", label: "휴식" },
  퇴근:    { color: "#111827", label: "퇴근" },
};

// 다음 액션 정의 (현재 상태에 따른 컨텍스트 버튼)
function getActions(status) {
  switch (status) {
    case "대기":
    case "퇴근":
    case null:
    case undefined:
      return [{ label: "출근", status: "출근", primary: true }];
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

// ─── 오늘 로그 조회 ───────────────────────────────────────────────────────────
function useTodayLogs(uid) {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    if (!uid) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const q = query(
      collection(db, "driver_logs"),
      where("uid", "==", uid),
      orderBy("timestamp", "asc"),
    );
    return onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const todayLogs = all.filter(l => {
        const t = l.timestamp?.toDate?.();
        return t && t >= today;
      });
      setLogs(todayLogs);
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

// ─── GPS 추적 훅 ─────────────────────────────────────────────────────────────
function useGpsTracking(uid, driverData) {
  const [pos, setPos] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const lastPosRef = useRef(null);

  const calcDist = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  useEffect(() => {
    if (!uid) return;
    const watchId = navigator.geolocation.watchPosition(
      async (p) => {
        const { latitude: lat, longitude: lng, speed } = p.coords;
        setPos({ lat, lng, speed });

        const prev = lastPosRef.current;
        let distDelta = 0;
        if (prev) distDelta = calcDist(prev.lat, prev.lng, lat, lng);
        lastPosRef.current = { lat, lng };

        const ref = doc(db, "drivers", uid);
        const updateData = {
          location: { lat, lng },
          speed: speed ? Math.round(speed * 3.6) : 0,
          updatedAt: serverTimestamp(),
        };
        if (distDelta > 0.01) {
          updateData.totalDistance = (driverData?.totalDistance || 0) + distDelta;
        }
        try { await updateDoc(ref, updateData); } catch (_) {}
      },
      (err) => {
        if (err.code === 1) setPermissionDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [uid]);

  return { pos, permissionDenied };
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function DriverHome() {
  const [uid, setUid] = useState(null);
  const [driver, setDriver] = useState(null);
  const [activeTab, setActiveTab] = useState("home");
  const [statusLoading, setStatusLoading] = useState(false);
  const [toast, setToast] = useState("");

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

  const logs = useTodayLogs(uid);
  const { pos, permissionDenied } = useGpsTracking(uid, driver);
  const summary = React.useMemo(() => calcWorkSummary(logs), [logs]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const updateStatus = useCallback(async (newStatus) => {
    if (!uid || statusLoading) return;
    setStatusLoading(true);
    try {
      await updateDoc(doc(db, "drivers", uid), {
        status: newStatus,
        mainStatus: newStatus,
        updatedAt: serverTimestamp(),
        active: newStatus !== "퇴근",
      });
      await addDoc(collection(db, "driver_logs"), {
        uid,
        status: newStatus,
        mainStatus: newStatus,
        timestamp: serverTimestamp(),
      });
      showToast(`${newStatus} 처리되었습니다`);
    } catch (e) {
      showToast("처리 중 오류가 발생했습니다");
    } finally {
      setStatusLoading(false);
    }
  }, [uid, statusLoading]);

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
  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,"0")}.${String(today.getDate()).padStart(2,"0")}`;

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6f9", paddingBottom: 72, fontFamily: '"Noto Sans KR", sans-serif' }}>

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
              <div style={{ fontSize: 12, color: "#ef4444" }}>설정에서 위치 권한을 허용하면 실시간 추적과 자동 출근이 가능합니다.</div>
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
                  onClick={() => updateStatus(action.status)}
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

          {/* 오늘 상태 로그 (최근 5개) */}
          {logs.length > 0 && (
            <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 10, letterSpacing: "0.05em" }}>오늘 상태 기록</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {[...logs].reverse().slice(0, 8).map((log, i) => {
                  const t = log.timestamp?.toDate?.();
                  const cfg = STATUS_CONFIG[log.status] || STATUS_CONFIG["대기"];
                  return (
                    <div key={log.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "9px 0",
                      borderBottom: i < Math.min(logs.length, 8) - 1 ? "1px solid #f3f4f6" : "none",
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
          <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 14, letterSpacing: "0.05em" }}>오늘 근무 요약</div>
            {[
              ["출근 시각", summary.checkInTime ? formatTime(summary.checkInTime) : "--"],
              ["총 근무시간", summary.workMs > 0 ? formatDuration(summary.workMs) : "--"],
              ["총 이동거리", `${(driver.totalDistance || 0).toFixed(2)} km`],
              ["운행 횟수", `${summary.tripCount}회`],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 14, color: "#1B2B4B", fontWeight: 800 }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 12, letterSpacing: "0.05em" }}>오늘 전체 상태 기록 ({logs.length}건)</div>
            {logs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", fontSize: 13, color: "#d1d5db" }}>오늘 기록이 없습니다</div>
            ) : (
              <div>
                {[...logs].reverse().map((log, i) => {
                  const t = log.timestamp?.toDate?.();
                  const cfg = STATUS_CONFIG[log.status] || STATUS_CONFIG["대기"];
                  return (
                    <div key={log.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 0",
                      borderBottom: i < logs.length - 1 ? "1px solid #f3f4f6" : "none",
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#1B2B4B" }}>{log.status}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>{t ? formatTime(t) : "--"}</div>
                    </div>
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
