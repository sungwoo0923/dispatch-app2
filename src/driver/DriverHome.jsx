// ===================== src/driver/DriverHome.jsx =====================
import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import { doc, onSnapshot, serverTimestamp, updateDoc, setDoc } from "firebase/firestore";
import DriverTracking from "./DriverTracking";
import DriverLogs from "./DriverLogs";

export default function DriverHome() {
  const phone = auth.currentUser?.phoneNumber;
  const [activeTab, setActiveTab] = useState("home");
  const [driver, setDriver] = useState(null);
  const [workInfo, setWorkInfo] = useState({});
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!phone) return;

    const ref = doc(db, "drivers", phone);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setDriver(snap.data());
    });

    const dayRef = doc(db, "driver_work", phone, "days", today);
    const unsubDay = onSnapshot(dayRef, (snap) => {
      if (snap.exists()) setWorkInfo(snap.data());
    });

    return () => { unsub(); unsubDay(); };
  }, [phone]);

  if (!driver) return <div>로딩중...</div>;
  if (!driver.active)
    return (
      <div className="p-5 text-center text-red-600">
        관리자 승인 대기중입니다.
      </div>
    );

  const km = (workInfo.totalDistanceKm || 0).toFixed(1);
  const h = Math.floor((workInfo.totalWorkTimeSec || 0) / 3600);
  const m = Math.floor(((workInfo.totalWorkTimeSec || 0) % 3600) / 60);

  const changeStatus = async (status) => {
    await updateDoc(doc(db, "drivers", phone), {
      상태: status,
      updatedAt: serverTimestamp(),
    });
  };

  const buttons = [
    ["대기", "bg-gray-500"],
    ["휴식", "bg-yellow-400"],
    ["운행중", "bg-blue-600"],
    ["입차", "bg-green-600"],
    ["출차", "bg-orange-500"],
    ["퇴근", "bg-red-500"],
  ];

  return (
    <div className="min-h-screen p-5 bg-gray-100">
      <div className="p-3 bg-white rounded mb-4 shadow">
        <h3 className="font-bold text-gray-800 mb-2">오늘 근무 요약</h3>
        <p>총 이동거리: {km} km</p>
        <p>근무시간: {h}시간 {m}분</p>
      </div>

      {activeTab === "home" && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {buttons.map(([label, color]) => (
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

      {activeTab === "location" && <DriverTracking phone={phone} />}
      {activeTab === "logs" && <DriverLogs phone={phone} />}

      <div className="fixed bottom-0 left-0 w-full flex">
        <Tab keytab="home" label="상태" active={activeTab} setActive={setActiveTab} />
        <Tab keytab="location" label="위치" active={activeTab} setActive={setActiveTab} />
        <Tab keytab="logs" label="로그" active={activeTab} setActive={setActiveTab} />
      </div>
    </div>
  );
}

function Tab({ keytab, label, active, setActive }) {
  return (
    <button
      className={`flex-1 p-3 ${active === keytab ? "bg-blue-600 text-white" : "bg-gray-300"}`}
      onClick={() => setActive(keytab)}
    >
      {label}
    </button>
  );
}
