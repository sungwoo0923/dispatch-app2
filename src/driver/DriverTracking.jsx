// ===================== DriverTracking.jsx (GPS 업그레이드 Full) =====================
import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, setDoc } from "firebase/firestore";

export default function DriverTracking({ driver }) {
  const [coords, setCoords] = useState(null);

  useEffect(() => {
    if (!driver?._id) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });

        setDoc(
          doc(db, "drivers", driver._id),
          {
            location: {
              lat: latitude,
              lng: longitude,
              updatedAt: Date.now()
            }
          },
          { merge: true }
        );
      },
      (err) => {
        console.error("GPS Error:", err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [driver]);

  return (
    <div className="p-4 text-center">
      <h3 className="font-bold text-lg mb-3">실시간 위치 공유</h3>
      {coords ? (
        <p className="text-green-700 font-semibold">
          위치 공유 중<br />
          {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
        </p>
      ) : (
        <p className="text-gray-500">GPS 수신 중...</p>
      )}
    </div>
  );
}
// ==================================================================