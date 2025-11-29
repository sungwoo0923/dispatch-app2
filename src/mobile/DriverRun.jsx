// ======================= src/mobile/DriverRun.jsx =======================
import React, { useState, useEffect, useRef } from "react";
import { auth, db } from "../firebase";
import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

// 거리 계산 (Haversine)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DriverRun() {
  const [tracking, setTracking] = useState(false);
  const mapRef = useRef(null);
  const mapObjRef = useRef(null);
  const markerRef = useRef(null);

  const watchRef = useRef(null);
  const posRef = useRef(null);
  const distanceRef = useRef(0);
  const drivingRef = useRef(0);
  const idleRef = useRef(0);
  const lastTimeRef = useRef(Date.now());

  const driverId = auth.currentUser?.uid;

  const updateLocation = async (pos) => {
    const { latitude, longitude, speed } = pos.coords;
    const now = Date.now();

    if (posRef.current) {
      const dist = getDistance(
        posRef.current.lat,
        posRef.current.lng,
        latitude,
        longitude
      );
      distanceRef.current += dist;

      const deltaSec = (now - lastTimeRef.current) / 1000;
      if ((speed || 0) > 3) drivingRef.current += deltaSec;
      else idleRef.current += deltaSec;
    }

    posRef.current = { lat: latitude, lng: longitude };
    lastTimeRef.current = now;

    // 지도 이동 및 마커 표시
    if (mapObjRef.current) {
      const posK = new window.kakao.maps.LatLng(latitude, longitude);
      mapObjRef.current.setCenter(posK);
      markerRef.current.setPosition(posK);
    }

    // Firestore 업데이트
    await setDoc(doc(db, "driver_locations", driverId), {
      lat: latitude,
      lng: longitude,
      speed: speed || 0,
      lastUpdated: serverTimestamp(),
      status: "운행중",
      totalDistance: distanceRef.current,
      drivingSec: drivingRef.current,
      idleSec: idleRef.current,
    }, { merge: true });
  };

  const startTracking = () => {
    setTracking(true);
    distanceRef.current = 0;
    drivingRef.current = 0;
    idleRef.current = 0;
    posRef.current = null;
    lastTimeRef.current = Date.now();

    watchRef.current = navigator.geolocation.watchPosition(
      updateLocation,
      console.error,
      { enableHighAccuracy: true }
    );
  };

  const stopTracking = async () => {
    setTracking(false);
    navigator.geolocation.clearWatch(watchRef.current);

    const today = new Date().toISOString().slice(0, 10);
    const distKm = distanceRef.current / 1000;
    const fuelCost = Math.round((distKm / 5.5) * 1650);

    await updateDoc(doc(db, "driver_locations", driverId), {
      status: "대기중",
      lastUpdated: serverTimestamp(),
    });

    await setDoc(doc(db, "driver_reports", `${driverId}_${today}`), {
      driverId,
      date: today,
      totalDistance: distanceRef.current,
      drivingSec: drivingRef.current,
      idleSec: idleRef.current,
      fuelCost,
      finishedAt: serverTimestamp(),
    }, { merge: true });

    alert("📊 운행 종료 및 데이터 저장 완료!");
  };

  useEffect(() => {
    if (window.kakao && !mapObjRef.current) {
      mapObjRef.current = new window.kakao.maps.Map(
        mapRef.current,
        { center: new window.kakao.maps.LatLng(37.5665, 126.978), level: 5 }
      );
      markerRef.current = new window.kakao.maps.Marker({
        position: mapObjRef.current.getCenter(),
        map: mapObjRef.current,
      });
    }
  }, []);

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">🛰 실시간 운행</h2>

      {/* 지도 */}
      <div ref={mapRef} className="w-full h-64 rounded bg-gray-200" />

      {!tracking ? (
        <button onClick={startTracking} className="w-full bg-blue-600 text-white py-3 rounded text-lg">
          ▶ 운행 시작
        </button>
      ) : (
        <button onClick={stopTracking} className="w-full bg-red-600 text-white py-3 rounded text-lg">
          ⏹ 운행 종료
        </button>
      )}

      <div className="text-center text-gray-600 text-sm">
        위치기반 운행 데이터 수집 중…
      </div>
    </div>
  );
}
// ======================= END =======================
