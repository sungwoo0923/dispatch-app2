// ===================== src/driver/DriverTracking.jsx (FINAL REALTIME GPS) =====================
import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

export default function DriverTracking() {
  const user = auth.currentUser;
  const [pos, setPos] = useState(null);
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setPos({ lat, lng });

        updateDoc(doc(db, "drivers", uid), {
          location: { lat, lng },
          updatedAt: serverTimestamp(),
        });
      },
      (err) => {
        console.error("위치 권한 필요:", err);
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [uid]);

  return (
    <div className="p-6 text-center">
      <h2 className="text-lg font-semibold mb-3">실시간 위치 전송 중</h2>

      {pos ? (
        <div>
          <p>
            {pos.lat.toFixed(6)}, {pos.lng.toFixed(6)}
          </p>
        </div>
      ) : (
        <p>GPS 신호 대기...</p>
      )}
    </div>
  );
}
