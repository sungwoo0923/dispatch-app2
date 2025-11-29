// ======================= src/driver/DriverApp.jsx =======================
import React, { useEffect, useRef, useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

// ❗카카오 지도 전역 객체 사용
/* global kakao */

export default function DriverApp({ user }) {
  const [pos, setPos] = useState(null);
  const mapRef = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);

  // 현재 위치 가져오기
  const getLocation = () => {
    if (!navigator.geolocation) {
      alert("📌 위치 정보를 사용할 수 없습니다.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (geo) => {
        const { latitude, longitude } = geo.coords;
        setPos({ lat: latitude, lng: longitude });

        if (map.current && marker.current) {
          const move = new kakao.maps.LatLng(latitude, longitude);
          marker.current.setPosition(move);
          map.current.setCenter(move);
        }
      },
      () => alert("⚠ GPS 권한이 필요합니다."),
      { enableHighAccuracy: true }
    );
  };

  // 지도 생성
  useEffect(() => {
    if (!mapRef.current) return;

    const center = new kakao.maps.LatLng(37.5665, 126.9780); // 기본 서울
    map.current = new kakao.maps.Map(mapRef.current, {
      center,
      level: 4,
    });

    marker.current = new kakao.maps.Marker({
      position: center,
      map: map.current,
    });

    getLocation();
  }, []);

  // 위치 DB 저장
  const sendLocation = async () => {
    if (!pos) {
      alert("위치를 먼저 가져오세요!");
      return;
    }
    await addDoc(collection(db, "driverLocation"), {
      uid: user?.uid || "unknown",
      lat: pos.lat,
      lng: pos.lng,
      time: serverTimestamp(),
    });
    alert("📡 위치 전송됨!");
  };

  return (
    <div className="w-full h-screen flex flex-col">
      <div className="p-3 bg-gray-800 text-white text-lg font-bold">
        RUN Driver_PSW
      </div>

      <div
        ref={mapRef}
        className="flex-1 border-t border-gray-300"
      />

      <div className="p-3 grid grid-cols-2 gap-2">
        <button
          onClick={getLocation}
          className="py-3 bg-blue-500 text-white rounded-lg font-bold"
        >
          📍 내 위치
        </button>
        <button
          onClick={sendLocation}
          className="py-3 bg-green-600 text-white rounded-lg font-bold"
        >
          📡 서버전송
        </button>
      </div>
    </div>
  );
}
