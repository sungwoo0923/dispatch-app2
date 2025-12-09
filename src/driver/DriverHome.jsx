// ===================== src/driver/DriverHome.jsx (PREMIUM FINAL) =====================
import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import DriverTracking from "./DriverTracking";
import DriverLogs from "./DriverLogs";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";

export default function DriverHome() {
  const navigate = useNavigate();
  const [uid, setUid] = useState(null);
  const [driver, setDriver] = useState(undefined);
  const [activeTab, setActiveTab] = useState("home");
  const [showMore, setShowMore] = useState(false);

  // 로그인 체크
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) navigate("/driver-login");
      else setUid(user.uid);
    });
    return () => unsub();
  }, [navigate]);

  // 드라이버 데이터 실시간 구독
  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, "drivers", uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return setDriver(null);
      setDriver(snap.data());
    });
    return () => unsub();
  }, [uid]);

  if (!driver)
    return (
      <div className="flex items-center justify-center h-screen">
        승인 대기 또는 불러오는 중
      </div>
    );

  // ===================== 상태 업데이트 =====================
  const updateStatus = async (mainStatus, subStatus) => {
    const ref = doc(db, "drivers", uid);
    const snap = await getDoc(ref);
    const location = snap.data()?.location || null;

    await updateDoc(ref, {
      mainStatus,
      subStatus,
      active: mainStatus !== "퇴근",
      updatedAt: serverTimestamp(),
      location,
       status:
   mainStatus === "퇴근" ? "퇴근" :
   mainStatus === "대기" ? "대기" :
   "운행중",
    });
  };

  const mainBtns = [
    ["출근", "운행중", "출근", "bg-blue-600"],
    ["대기", "대기", "대기", "bg-slate-500"],
    ["퇴근", "퇴근", "퇴근", "bg-rose-600"],
  ];

  const subFlow = ["출근", "상차입차", "상차출차", "하차입차", "하차출차", "대기"];

  const currentSub = driver.subStatus || "대기";
  const nextIndex = subFlow.indexOf(currentSub) + 1;
  const nextSub = subFlow[nextIndex] || "대기";

  return (
    <div className="min-h-screen bg-gray-100 p-4 pb-20">
      {/* 상단 대표 상태 카드 */}
      <div className="bg-white rounded-2xl shadow p-4 mb-5">
        <p className="font-bold text-xl text-blue-600 mb-1">
          {driver.mainStatus || "대기"}
        </p>
        <p className="text-sm text-gray-700">기사: {driver.name}</p>
        <p className="text-sm text-gray-700 mb-3">
          차량번호: {driver.carNo}
        </p>

        <button
          onClick={() => {
            localStorage.clear();
            signOut(auth);
            navigate("/driver-login");
          }}
          className="px-3 py-1 bg-rose-600 text-white rounded text-xs float-right"
        >
          로그아웃
        </button>
      </div>

      {activeTab === "home" && (
        <>
          {/* 대표 상태 버튼 */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {mainBtns.map(([label, m, s, color]) => (
              <button
                key={label}
                onClick={() => updateStatus(m, s)}
                className={`${color} text-white font-bold py-3 rounded-xl shadow-md`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 추천 버튼 */}
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-1">
              다음 작업 제안
            </p>
            <button
              onClick={() => updateStatus("운행중", nextSub)}
              className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold shadow-md"
            >
              {nextSub}
            </button>
          </div>

          {/* 전체 상태 */}
          <button
            onClick={() => setShowMore(!showMore)}
            className="text-gray-700 text-xs underline mb-2"
          >
            전체 업무 단계 보기 ▾
          </button>

          {showMore && (
            <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
              {subFlow.map((s) => (
                <button
                  key={s}
                  onClick={() => updateStatus("운행중", s)}
                  className="bg-gray-300 py-2 rounded text-gray-900"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "location" && <DriverTracking driverId={uid} />}
      {activeTab === "logs" && <DriverLogs driverId={uid} />}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 w-full flex bg-white shadow">
        {[
          ["home", "상태"],
          ["location", "위치"],
          ["logs", "로그"],
        ].map(([key, txt]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 py-3 text-xs ${
              activeTab === key
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-600"
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
