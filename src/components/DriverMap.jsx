// ===================== src/components/DriverMap.jsx (PREMIUM FINAL v5) =====================
import React, { useEffect, useState } from "react";
import { db, auth, getCollections } from "../firebase";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
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

export default function DriverMap({ onSelect }) {
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
          경로: d.path || []
        });
      }
      setDrivers(arr);
    });

    return () => unsub();
  }, []);

  const center = drivers[0]?.location || { lat: 37.5665, lng: 126.9780 };

  return (
    <div className="w-full bg-white rounded-xl shadow p-3">
      <h3 className="font-bold mb-3 text-gray-700">
        실시간 기사 위치 지도
      </h3>

      <div style={{ height: "450px", width: "100%" }}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={12}
          scrollWheelZoom={true}
          style={{ height: "100%" }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {drivers.map((d) => (
            <Marker
              key={d.id}
              position={[d.location.lat, d.location.lng]}
              icon={blueIcon}
              eventHandlers={{
                click: () => onSelect?.(d) // 🔥 Fleet 팝업 연동 완성!
              }}
            >
              <Popup>
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
