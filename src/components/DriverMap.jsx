// ===================== src/components/DriverMap.jsx (PREMIUM FINAL v4) =====================
import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";
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

export default function DriverMap() {
  const [drivers, setDrivers] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "drivers"), (snap) => {
      setDrivers(
        snap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((d) => d.location && d.active)
      );
    });
    return () => unsub();
  }, []);

  return (
    <div className="w-full bg-white rounded-xl shadow p-3">
      <h3 className="font-bold mb-3 text-gray-700">실시간 기사 위치 지도</h3>

      <div style={{ height: "450px", width: "100%" }}>
        <MapContainer
          center={[37.5665, 126.9780]}
          zoom={11}
          scrollWheelZoom={true}
          style={{ height: "100%" }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {drivers.map((d) => (
            <Marker
              key={d.id}
              position={[d.location.lat, d.location.lng]}
              icon={blueIcon}
            >
              <Popup>
                <b>{d.name || "-"}</b> ({d.carNo || "-"})
                <br />
                상태: {d.status || "확인중"}
                <br />
                이동거리: {(d.totalDistance || 0).toFixed(1)} km
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
