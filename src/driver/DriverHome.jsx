// ===================== DriverHome.jsx (NATIVE UI + AUTO-CHECKIN + VOICE v7) =====================
import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import {
  doc,
  onSnapshot,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

export default function DriverHome() {
  const [uid, setUid] = useState(null);
  const [driver, setDriver] = useState(null);
  const [activeTab, setActiveTab] = useState("home");

  // 사무실 위치(출근 감지용)
  const OFFICE = { lat: 37.612345, lng: 126.712345 }; // ★ 원하는 사무실 좌표 넣기
  const AUTO_CHECKIN_RANGE = 0.2; // km = 200m

  // 거리 계산 함수
  const calcDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // 음성 안내
  const speak = (msg) => {
    if (!msg) return;
    const utter = new SpeechSynthesisUtterance(msg);
    utter.rate = 1.05;
    utter.pitch = 1.0;
    speechSynthesis.speak(utter);
  };

  // 로그인 감시
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (!u) window.location.href = "/driver-login";
      else setUid(u.uid);
    });
  }, []);

  // Driver 데이터 실시간 구독
  useEffect(() => {
    if (!uid) return;

    return onSnapshot(doc(db, "drivers", uid), (snap) => {
      if (snap.exists()) setDriver(snap.data());
    });
  }, [uid]);

  // ⭐ 자동 출근 처리
  useEffect(() => {
    if (!uid) return;

    const watch = navigator.geolocation.watchPosition(
      async (pos) => {
        if (!driver) return;

        const { latitude, longitude } = pos.coords;
        const dist = calcDistance(latitude, longitude, OFFICE.lat, OFFICE.lng);

        // 200m 이내 && 아직 출근 상태 아님
        if (dist <= AUTO_CHECKIN_RANGE && driver.status !== "출근") {
          await updateStatus("출근");
          speak("출근이 자동으로 처리되었습니다.");
        }
      },
      (err) => console.log(err),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watch);
  }, [driver]);

  // 상태 업데이트 함수
  const updateStatus = async (newStatus) => {
    let final = newStatus;

    // ⭐ 상차완료/하차완료 → 운행중 자동 변경
    if (newStatus === "상차완료" || newStatus === "하차완료") {
      final = "운행중";
      speak("운행을 시작합니다.");
    } else {
      speak(`${newStatus} 상태로 변경되었습니다.`);
    }

    const ref = doc(db, "drivers", uid);

    await updateDoc(ref, {
      status: final,
      mainStatus: final,
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, "driver_logs"), {
      uid,
      status: final,
      timestamp: serverTimestamp(),
    });
  };

  if (!driver)
    return (
      <div className="h-screen flex items-center justify-center text-lg font-bold">
        로딩중...
      </div>
    );

  // 버튼 그룹 구성
  const GROUPS = {
    출근퇴근: [
      { label: "출근", status: "출근", color: "#1E90FF" },
      { label: "퇴근", status: "퇴근", color: "#0F172A" },
    ],
    상차: [
      { label: "상차 시작", status: "상차시작", color: "#FB923C" },
      { label: "상차 완료", status: "상차완료", color: "#10B981" },
    ],
    하차: [
      { label: "하차 시작", status: "하차시작", color: "#14B8A6" },
      { label: "하차 완료", status: "하차완료", color: "#0EA5E9" },
    ],
    기타: [
      { label: "대기", status: "대기", color: "#64748B" },
      { label: "휴식", status: "휴식", color: "#EAB308" },
    ],
  };

  return (
    <div className="min-h-screen p-5 pb-20 bg-gray-100">

      {/* ===================== 상단 상태 카드 (iOS 스타일) ===================== */}
      <div className="rounded-2xl p-5 bg-white shadow-md mb-6">
        <div className="text-3xl font-extrabold text-blue-600 tracking-tight">
          {driver.status || "대기"}
        </div>

        <div className="text-sm text-gray-600 mt-2">
          {driver.name} / {driver.carNo}
        </div>

        <div className="text-xs text-gray-500 mt-1">
          총 이동거리: {(driver.totalDistance || 0).toFixed(2)} km
        </div>

        <button
          onClick={() => {
            signOut(auth);
            window.location.href = "/driver-login";
          }}
          className="mt-3 text-xs text-red-500 underline float-right"
        >
          로그아웃
        </button>
      </div>

      {/* ===================== 버튼 UI ===================== */}
      {activeTab === "home" && (
        <div className="flex flex-col gap-5">

          {/* 그룹을 순서대로 렌더링 */}
          {Object.entries(GROUPS).map(([title, btns]) => (
            <div key={title}>
              <div className="text-sm font-bold text-gray-700 mb-2">{title}</div>

              <div className="grid grid-cols-2 gap-3">
                {btns.map((b, i) => (
                  <button
                    key={i}
                    onClick={() => updateStatus(b.status)}
                    style={{ background: b.color }}
                    className="text-white py-4 rounded-xl font-bold shadow active:scale-95 transition-transform"
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===================== 하단 네비 ===================== */}
      <div className="fixed bottom-0 left-0 w-full bg-white flex shadow-md">
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
