// ======================= src/mobile/DriverReport.jsx =======================
import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot
} from "firebase/firestore";

export default function DriverReport() {
  const [monthly, setMonthly] = useState([]);
  const uid = auth.currentUser?.uid;
  const yearMonth = new Date().toISOString().slice(0, 7); // 2025-11

  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, "driver_reports"),
      where("driverId", "==", uid),
      where("date", ">=", `${yearMonth}-01`),
      where("date", "<=", `${yearMonth}-31`)
    );

    const unsub = onSnapshot(q, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push(d.data()));
      setMonthly(arr);
    });
    return () => unsub();
  }, [uid, yearMonth]);

  const sum = (key) =>
    monthly.reduce((a, b) => a + (b[key] || 0), 0);

  const fmtTime = (sec) =>
    `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">📑 {yearMonth}월 정산 리포트</h2>

      {monthly.length === 0 && (
        <p className="text-gray-500 text-center">
          운행 데이터가 없습니다.
        </p>
      )}

      {monthly.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 space-y-3">
          <p>🚚 총 운행 거리: {(sum("totalDistance") / 1000).toFixed(1)} km</p>
          <p>⛽ 총 주유비: {sum("fuelCost").toLocaleString()} 원</p>
          <p>⏱ 총 운행 시간: {fmtTime(sum("drivingSec"))}</p>
          <p>🅿 총 정차 시간: {fmtTime(sum("idleSec"))}</p>
          <p>📅 총 운행일수: {monthly.length}일</p>
        </div>
      )}
    </div>
  );
}
// ======================= END =======================
