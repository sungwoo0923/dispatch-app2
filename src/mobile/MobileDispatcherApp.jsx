// ======================= src/mobile/MobileDriverApp.jsx (UI 개선) =======================
import React, { useState, useRef } from "react";
import { auth, db } from "../firebase";
import { doc, updateDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";

export default function MobileDriverApp() {
  const [tracking, setTracking] = useState(false);
  const [statusText, setStatusText] = useState("대기중");
  const [distanceKm, setDistanceKm] = useState(0);
  const [driveTime, setDriveTime] = useState("0h 0m");

  const driverId = auth.currentUser?.uid;
  const watchIdRef = useRef(null);
  const lastPosRef = useRef(null);
  const distanceRef = useRef(0);
  const drivingSecRef = useRef(0);
  const idleSecRef = useRef(0);
  const lastTimeRef = useRef(Date.now());

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const startTracking = () => {
    setTracking(true);
    setStatusText("운행중");
    distanceRef.current = 0;
    drivingSecRef.current = 0;
    idleSecRef.current = 0;
    lastPosRef.current = null;

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, speed } = pos.coords;
        const t = Date.now();
        if (lastPosRef.current) {
          const d = getDistance(
            lastPosRef.current.lat,
            lastPosRef.current.lng,
            latitude,
            longitude
          );
          distanceRef.current += d;
          const delta = (t - lastTimeRef.current) / 1000;
          if ((speed || 0) > 5) drivingSecRef.current += delta;
          else idleSecRef.current += delta;
        }

        lastPosRef.current = { lat: latitude, lng: longitude };
        lastTimeRef.current = t;

        setDistanceKm((distanceRef.current / 1000).toFixed(1));
        setDriveTime(
          `${Math.floor(drivingSecRef.current / 3600)}h ${Math.floor((drivingSecRef.current % 3600) / 60)}m`
        );

        await setDoc(
          doc(db, "driver_locations", driverId),
          {
            lat: latitude,
            lng: longitude,
            speed: speed || 0,
            lastUpdated: serverTimestamp(),
            status: "운행중",
            totalDistance: distanceRef.current,
            drivingSec: drivingSecRef.current,
            idleSec: idleSecRef.current,
          },
          { merge: true }
        );
      },
      console.error,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  };

  const stopTracking = async () => {
    setTracking(false);
    setStatusText("대기중");
    navigator.geolocation.clearWatch(watchIdRef.current);

    await updateDoc(doc(db, "driver_locations", driverId), {
      status: "대기중",
      lastUpdated: serverTimestamp(),
    });

    alert("📊 운행 종료! 리포트 저장 완료");
  };

  const logout = () => {
    if (tracking) stopTracking();
    signOut(auth);
  };

  return (
    <div className="p-5 space-y-5 text-center">
      <h2 className="text-2xl font-bold">🚚 RUN Driver_PSW</h2>
      <p className="text-xl font-semibold">{statusText}</p>

      <div className="bg-gray-100 p-4 rounded-lg">
        <p className="text-lg">오늘 누적 거리</p>
        <p className="text-3xl font-bold">{distanceKm} km</p>

        <p className="text-lg mt-3">운행 시간</p>
        <p className="text-2xl font-bold">{driveTime}</p>
      </div>

      {!tracking ? (
        <button
          className="w-full bg-blue-600 text-white py-4 rounded-lg text-xl font-bold"
          onClick={startTracking}
        >
          ▶ 운행 시작
        </button>
      ) : (
        <button
          className="w-full bg-red-600 text-white py-4 rounded-lg font-bold text-xl"
          onClick={stopTracking}
        >
          ⏹ 운행 종료
        </button>
      )}

      <button
        className="w-full bg-gray-200 py-3 rounded-lg"
        onClick={logout}
      >
        로그아웃
      </button>
    </div>
  );
}
// ======================= END =======================
