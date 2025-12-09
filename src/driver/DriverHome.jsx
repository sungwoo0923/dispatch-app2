// ===================== DriverHome.jsx (FINAL STABLE v3) =====================
import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import {
  doc, onSnapshot, updateDoc, serverTimestamp,
  getDoc, collection, addDoc, query, where, orderBy, onSnapshot as logsSub
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import DriverMap from "../components/DriverMap";

export default function DriverHome() {
  const navigate = useNavigate();
  const [uid, setUid] = useState(null);
  const [driver, setDriver] = useState(null);
  const [activeTab, setActiveTab] = useState("home");
  const [logs, setLogs] = useState([]);

  // 로그인 감시
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (!u) navigate("/driver-login");
      else setUid(u.uid);
    });
  }, []);

  // Driver 데이터 구독
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "drivers", uid), (snap) => {
      setDriver(snap.data());
    });
  }, [uid]);

  // Logs 구독
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "driver_logs"),
      where("uid", "==", uid),
      orderBy("timestamp", "desc")
    );
    return logsSub(q, (snap) => {
      setLogs(snap.docs.map((v) => v.data()));
    });
  }, [uid]);

  // 위치 & 거리 업데이트
  useEffect(() => {
    if (!uid) return;
    const timer = setInterval(async () => {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const ref = doc(db, "drivers", uid);
        const snap = await getDoc(ref);
        const d = snap.data();
        const { latitude, longitude } = pos.coords;

        const calcDist = (lat1, lng1, lat2, lng2) => {
          const R = 6371;
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLng = (lng2 - lng1) * Math.PI / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };

        let dist = d.totalDistance || 0;
        if (d.location)
          dist += calcDist(d.location.lat, d.location.lng, latitude, longitude);

        await updateDoc(ref, {
          location: { lat: latitude, lng: longitude },
          totalDistance: dist,
          updatedAt: serverTimestamp(),
        });
      });
    }, 10000);
    return () => clearInterval(timer);
  }, [uid]);

  if (!driver) {
    return <div className="h-screen flex items-center justify-center text-lg font-bold">로딩중...</div>;
  }

  const mainBtns = [
    ["출근", "대기", "출근", "#1E90FF"],
    ["상차", "적재중", "상차입차", "#F97316"],
    ["하차", "운행중", "하차입차", "#10B981"],
    ["대기", "대기", "대기", "#64748B"],
    ["휴식", "휴식", "대기", "#EAB308"],
    ["퇴근", "퇴근", "대기", "#111827"],
  ];

  const updateStatus = async (mainStatus, subStatus) => {
    const ref = doc(db, "drivers", uid);
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);

    await updateDoc(ref, {
      mainStatus,
      subStatus,
      active: mainStatus !== "퇴근",
      status: mainStatus,
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, "driver_logs"), {
      uid, mainStatus, subStatus, timestamp: serverTimestamp(), dateKey,
    });
  };

  return (
    <div className="min-h-screen p-5 pb-20 bg-gray-100">
      {/* 상태 카드 */}
      <div className="rounded-2xl p-5 bg-white shadow mb-6">
        <div className="text-2xl font-bold text-blue-600">
          {driver.mainStatus || "대기"}
        </div>
        <div className="text-sm text-gray-600 mt-2">
          {driver.name} / {driver.carNo}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          총 이동거리: {(driver.totalDistance || 0).toFixed(2)} km
        </div>
        <button
          onClick={() => { signOut(auth); navigate("/driver-login"); }}
          className="mt-3 text-xs text-red-500 underline float-right"
        >
          로그아웃
        </button>
      </div>

      {/* 화면 탭 */}
      {activeTab === "home" && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {mainBtns.map(([label, m, s, color]) => (
              <button
                key={label}
                style={{ background: color }}
                className="text-white py-3 rounded-xl font-bold shadow"
                onClick={() => updateStatus(m, s)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {activeTab === "location" && <DriverMap />}

      {activeTab === "logs" && (
        <div className="bg-white p-4 rounded-xl shadow text-sm">
          {logs.length === 0 && <p>로그 없음</p>}
          {logs.map((log, i) => (
            <div key={i} className="border-b py-2">
              {log.mainStatus} | {log.subStatus} | 
              {log.timestamp?.toDate?.()?.toLocaleTimeString() || "-"}
            </div>
          ))}
        </div>
      )}

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 w-full bg-white flex shadow">
        {[
          ["home", "상태"],
          ["location", "위치"],
          ["logs", "로그"],
        ].map(([key, txt]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 py-3 text-xs ${
              activeTab === key ? "text-blue-600 font-bold" : "text-gray-500"
            }`}
          >
            {txt}
          </button>
        ))}
      </div>
    </div>
  );
}
// ===================== END =====================
