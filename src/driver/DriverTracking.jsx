// ===================== src/driver/DriverTracking.jsx =====================
import React, { useEffect } from "react";
import { db } from "../firebase";
import { doc, updateDoc, addDoc, collection, serverTimestamp, increment, getDoc, setDoc } from "firebase/firestore";

export default function DriverTracking({ phone }) {

  const updateTracking = async (gps) => {
    const driverRef = doc(db, "drivers", phone);
    const dayKey = new Date().toISOString().slice(0, 10);
    const workRef = doc(db, "driver_work", phone, "days", dayKey);
    const snap = await getDoc(workRef);

    let lastGps = snap.exists() ? snap.data().lastGps : null;
    let dist = 0;

    if (lastGps) dist = getDistance(lastGps.lat, lastGps.lng, gps.lat, gps.lng);

    await setDoc(
      workRef,
      {
        lastGps: gps,
        totalDistanceKm: increment(dist / 1000),
        totalWorkTimeSec: increment(60),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await updateDoc(driverRef, {
      gps,
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, "driver_logs", phone, "events"), {
      gps,
      type: "auto-track",
      dist,
      time: serverTimestamp(),
    });
  };

  useEffect(() => {
    if (!phone) return;
    const timer = setInterval(() => {
      navigator.geolocation.getCurrentPosition((pos) => {
        updateTracking({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      });
    }, 60000);

    return () => clearInterval(timer);
  }, [phone]);

  return (
    <div className="text-center mt-10">
      위치 자동기록중(1분단위)
    </div>
  );
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2)**2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
