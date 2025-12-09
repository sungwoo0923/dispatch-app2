// ===================== src/driver/DriverHome.jsx (FIXED) =====================
import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
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

  // 인증 완료 확인
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) navigate("/driver-login");
      else setUid(user.uid);
    });
    return () => unsub();
  }, [navigate]);

  // 기사 정보 실시간 구독
  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setDriver(null);
        return;
      }
      setDriver(snap.data());
    });
    return () => unsub();
  }, [uid]);

  if (driver === undefined) return <div className="flex items-center justify-center p-10">로딩중...</div>;

  if (driver === null || driver.approved === false) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 text-center">
        <p>관리자 승인 대기중입니다</p>
        <button
          onClick={() => {
            localStorage.clear();
            signOut(auth);
            navigate("/driver-login");
          }}
          className="bg-blue-600 text-white px-3 py-2 rounded text-sm"
        >
          로그인 화면
        </button>
      </div>
    );
  }

  const changeStatus = async (status) => {
    await updateDoc(doc(db, "users", uid), {
      상태: status,
      updatedAt: serverTimestamp(),
    });
  };

  const menu = [
    ["대기", "bg-gray-500"],
    ["휴식", "bg-yellow-500"],
    ["운행중", "bg-blue-500"],
    ["적재중", "bg-orange-500"],
    ["출차", "bg-green-600"],
    ["퇴근", "bg-red-600"],
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-4 pb-16">
      <div className="bg-white rounded-xl shadow p-3 mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-lg mb-1">상태 변경</h3>
          <p className="text-sm">기사: {driver.name || driver.이름}</p>
          <p className="text-sm">차량번호: {driver.carNo || driver.차량번호}</p>
        </div>

        <button
          onClick={() => {
            localStorage.clear();
            signOut(auth);
            navigate("/driver-login");
          }}
          className="px-3 py-1 bg-red-600 text-white rounded text-xs"
        >
          로그아웃
        </button>
      </div>

      {activeTab === "home" && (
        <div className="grid grid-cols-3 gap-3">
          {menu.map(([label, color]) => (
            <button
              key={label}
              onClick={() => changeStatus(label)}
              className={`${color} text-white font-bold py-2 rounded-lg`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {activeTab === "location" && <DriverTracking driverId={uid} />}
      {activeTab === "logs" && <DriverLogs driverId={uid} />}

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
                : "bg-gray-200 text-gray-700"
            }`}
          >
            {txt}
          </button>
        ))}
      </div>
    </div>
  );
}
