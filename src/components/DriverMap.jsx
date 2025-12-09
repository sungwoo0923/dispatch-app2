// ===================== src/components/DriverMap.jsx (PREMIUM FINAL v6) =====================
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

// ⭐ 추가: center 변경 시 즉시 지도 이동
function SetViewOnLocationChange({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lng], map.getZoom(), { animate: false });
    }
  }, [center]);
  return null;
}

export default function DriverMap({ onSelect, center }) { // ⭐ center prop 받기
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
          총거리: d.totalDistance,
          updatedAt: d.updatedAt,
          경로: d.path || [],
        });
      }
      setDrivers(arr);
    });

    return () => unsub();
  }, []);

  const defaultCenter = center || drivers[0]?.location || { lat: 37.5665, lng: 126.9780 };

  return (
    <div className="w-full bg-white rounded-xl shadow p-3 z-10">
      <h3 className="font-bold mb-3 text-gray-700">
        실시간 기사 위치 지도
      </h3>

      <div style={{ height: "450px", width: "100%" }}>
        <MapContainer
          center={[defaultCenter.lat, defaultCenter.lng]}
          zoom={12}
          scrollWheelZoom={true}
          style={{ height: "100%" }}
        >
          {/* ⭐ 지도 즉시 이동 기능 */}
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
              {/* ⭐ 팝업은 지도 위에만 뜨게 유지 (UI와 안겹침) */}
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
