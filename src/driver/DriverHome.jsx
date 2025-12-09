// ===================== src/driver/DriverHome.jsx (PREMIUM FULL) =====================
import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import {
  doc, onSnapshot, updateDoc, serverTimestamp,
  getDoc, collection, addDoc
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";

export default function DriverHome() {
  const navigate = useNavigate();
  const [uid, setUid] = useState(null);
  const [driver, setDriver] = useState(undefined);
  const [activeTab, setActiveTab] = useState("home");
  const [showMore, setShowMore] = useState(false);

  // 로그인 유지 체크
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (!u) navigate("/driver-login");
      else setUid(u.uid);
    });
  }, []);

  // Driver 실시간 구독
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "drivers", uid), (snap) => {
      setDriver(snap.data());
    });
  }, [uid]);

  if (!driver)
    return <div className="flex items-center justify-center h-screen">로딩중…</div>;

  // ===================== 거리 계산 함수 =====================
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

  // ===================== 상태 변경 + 로그 기록 =====================
  const updateStatus = async (mainStatus, subStatus) => {
    const ref = doc(db, "drivers", uid);
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);

    await updateDoc(ref, {
      mainStatus,
      subStatus,
      active: mainStatus !== "퇴근",
      status:
        mainStatus === "퇴근" ? "퇴근" :
        mainStatus === "대기" ? "대기" :
        "운행중",
      updatedAt: serverTimestamp()
    });

    await addDoc(collection(db, "driver_logs"), {
      uid,
      mainStatus,
      subStatus,
      timestamp: serverTimestamp(),
      dateKey,
    });
  };

  // ===================== 위치 + 운행거리 자동 기록 =====================
  useEffect(() => {
    if (!uid) return;
    let lastPos = null;

    const loop = setInterval(() => {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;

        const ref = doc(db, "drivers", uid);
        const snap = await getDoc(ref);
        const d = snap.data();

        let dist = d.totalDistance || 0;
        if (d.location) {
          dist += calcDist(
            d.location.lat, d.location.lng,
            latitude, longitude
          );
        }

        await updateDoc(ref, {
          location: { lat: latitude, lng: longitude },
          totalDistance: dist,
          updatedAt: serverTimestamp()
        });
      });
    }, 10000);

    return () => clearInterval(loop);
  }, [uid]);

  const mainBtns = [
    ["출근", "운행중", "출근", "#007AFF"],
    ["대기", "대기", "대기", "#727272"],
    ["퇴근", "퇴근", "퇴근", "#FF3B30"],
  ];

  const subFlow = ["출근", "상차입차", "상차출차", "하차입차", "하차출차", "대기"];
  const nowSub = driver.subStatus || "대기";
  const nextSub = subFlow[(subFlow.indexOf(nowSub) + 1) % subFlow.length];

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

      {/* 메인 화면 */}
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

          <button
            className="w-full py-4 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg"
            onClick={() => updateStatus("운행중", nextSub)}
          >
            다음: {nextSub}
          </button>

          <button
            className="mt-4 text-xs text-gray-600 underline w-full"
            onClick={() => setShowMore(!showMore)}
          >
            전체 단계 보기
          </button>

          {showMore && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {subFlow.map((s) => (
                <button
                  key={s}
                  className="py-2 bg-gray-300 rounded text-xs"
                  onClick={() => updateStatus("운행중", s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* 위치 탭 */}
      {activeTab === "location" && (
        <div className="text-center text-sm text-gray-500 mt-10">
          위치 추적 연동 준비중...
        </div>
      )}

      {/* 로그 탭 */}
      {activeTab === "logs" && (
        <div className="text-center text-sm text-gray-500 mt-10">
          로그 연동 예정...
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
