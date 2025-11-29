// ======================= src/mobile/DriverReport.jsx =======================
import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";

export default function DriverReport() {
  const [report, setReport] = useState(null);

  useEffect(() => {
    const driverId = auth.currentUser?.uid;
    if (!driverId) return;

    const today = new Date().toISOString().slice(0, 10);
    const ref = doc(db, "driver_reports", `${driverId}_${today}`);

    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setReport(snap.data());
      else setReport(null);
    });

    return () => unsub();
  }, []);

  const fmtTime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">📑 오늘 리포트</h2>

      {!report && (
        <p className="text-gray-500 text-center">운행 데이터가 없습니다.</p>
      )}

      {report && (
        <div className="bg-gray-100 p-4 rounded-lg space-y-2 text-lg">
          <p>🚚 총 운행 거리: {(report.totalDistance / 1000).toFixed(1)} km</p>
          <p>⏱ 운행 시간: {fmtTime(report.drivingSec)}</p>
          <p>🅿 정차 시간: {fmtTime(report.idleSec)}</p>
          <p>⛽ 주유비(예상): {report.fuelCost?.toLocaleString()} 원</p>
          <p className="text-sm text-gray-600">
            완료시각: {report.finishedAt?.toDate().toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}
// ======================= END =======================
