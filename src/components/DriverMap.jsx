// ===================== src/components/DriverMap.jsx (PREMIUM FINAL v6 + UI ADDED) =====================
import React, { useEffect, useState } from "react";
import { db, auth, getCollections } from "../firebase";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Pulse Animated Marker
const blueIcon = L.divIcon({
  html: `
    <div style="
      width:18px; height:18px;
      background:#0078FF;
      border-radius:50%;
      border:3px solid #ffffff;
      box-shadow: 0 0 12px rgba(0,120,255,0.85);
      animation: pulse 1.4s infinite ease-in-out;
    "></div>
    <style>
      @keyframes pulse {
        0% { transform: scale(1); opacity:1; }
        50% { transform: scale(1.4); opacity:0.75; }
        100% { transform: scale(1); opacity:1; }
      }
    </style>
  `,
  className: "",
});

// ⭐ 지도 중심 자동 이동
function SetViewOnLocationChange({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lng], map.getZoom(), { animate: false });
    }
  }, [center]);
  return null;
}

export default function DriverMap({ onSelect, center }) {
  const [drivers, setDrivers] = useState([]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const { drivers: driversCol } = getCollections(user);

    const unsub = onSnapshot(collection(db, driversCol), async (snap) => {
      const arr = [];
      for (const s of snap.docs) {
        const id = s.id;
        const d = s.data();
        if (!d.active || !d.location) continue;

        const uSnap = await getDoc(doc(db, "users", id));
        const u = uSnap.exists() ? uSnap.data() : {};

        arr.push({
          id,
          이름: u.name || d.name,
          차량번호: u.carNo || d.carNo,
          상태: d.status,
          location: d.location,
          총거리: d.totalDistance || 0,
          updatedAt: d.updatedAt,
          speed: d.speed || 0,
          avgSpeed: d.avgSpeed || 0,
          graph: d.graph || [],
        });
      }
      setDrivers(arr);
    });

    return () => unsub();
  }, []);

  const main = drivers[0]; // 첫 기사 기준 (기존 디자인 유지)

  const defaultCenter = center || main?.location || { lat: 37.5665, lng: 126.9780 };

  return (
    <div className="w-full bg-white rounded-xl shadow p-3 z-10">
      <h3 className="font-bold mb-3 text-gray-700">
        실시간 기사 위치 지도
      </h3>

      {/* ===========================
          ⭐⭐ 추가된 UI 영역 ⭐⭐
      ============================ */}
      <div className="grid grid-cols-2 gap-2 text-xs mb-4">

        <div className="p-2 rounded-xl bg-blue-50">
          <b>현재 속도</b>
          <br /> {main?.speed?.toFixed(1) || 0} km/h
        </div>

        <div className="p-2 rounded-xl bg-green-50">
          <b>평균 속도</b>
          <br /> {main?.avgSpeed?.toFixed(1) || 0} km/h
        </div>

        <div className="p-2 rounded-xl bg-gray-50">
          <b>총 이동거리</b>
          <br /> {(main?.총거리 || 0).toFixed(2)} km
        </div>

        <div className="p-2 rounded-xl bg-yellow-50">
          <b>운행 상태</b>
          <br /> {main?.상태 || "대기"}
        </div>
      </div>

      <div className="mb-3 text-xs">
        <div className="font-bold mb-1">금일 누적 이동거리 그래프</div>

        <div className="w-full h-12 bg-gray-100 rounded-lg"></div>
      </div>

      {/* ===========================
          ⭐ 지도 영역 (원본 그대로)
      ============================ */}
      <div style={{ height: "450px", width: "100%" }}>
        <MapContainer
          center={[defaultCenter.lat, defaultCenter.lng]}
          zoom={12}
          scrollWheelZoom={true}
          style={{ height: "100%" }}
        >
          <SetViewOnLocationChange center={center} />

          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {drivers.map((d) => (
            <Marker
              key={d.id}
              position={[d.location.lat, d.location.lng]}
              icon={blueIcon}
              eventHandlers={{
                click: () => onSelect?.(d),
              }}
            >
              <Popup offset={[0, -5]}>
                <b>{d.이름 || "-"}</b> ({d.차량번호 || "-"})
                <br />
                상태: {d.상태 || "확인중"}
                <br />
                이동거리: {(d.총거리 || 0).toFixed(1)} km
                <br />
                업데이트: {d.updatedAt?.toDate?.()?.toLocaleString?.() || "-"}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
// ===================== END =====================
