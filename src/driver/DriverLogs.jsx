// ===================== src/driver/DriverLogs.jsx (WORK TIME V2) =====================
import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot
} from "firebase/firestore";

export default function DriverLogs({ driverId }) {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({
    totalWork: 0,
    totalDrive: 0
  });

  // 근무시간 계산 로직
  useEffect(() => {
    if (!driverId) return;

    const q = query(
      collection(db, "driver_logs"),
      where("uid", "==", driverId),
      orderBy("timestamp", "asc")
    );

    const unsub = onSnapshot(q, async (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));
      setLogs(list);

      // 시간 계산
      let workMs = 0;
      let driveMs = 0;

      let lastTime = null;
      let lastStatus = null;

      list.forEach((log) => {
        if (!log.timestamp?.toDate) return;
        const time = log.timestamp.toDate();

        if (lastTime) {
          const diff = time - lastTime;

          // 출근~퇴근 전체: 근무시간
          if (lastStatus && lastStatus !== "퇴근") {
            // 휴식 제외
            if (lastStatus !== "휴식") {
              workMs += diff;
            }
          }

          // 운행중만: 운행시간
          if (lastStatus === "운행중") {
            driveMs += diff;
          }
        }

        lastTime = time;
        lastStatus = log.mainStatus;
      });

      setSummary({
        totalWork: Math.floor(workMs / 1000 / 60), // minutes
        totalDrive: Math.floor(driveMs / 1000 / 60)
      });
    });

    return () => unsub();
  }, [driverId]);

  const formatMin = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}시간 ${m}분`;
  };

  return (
    <div className="text-sm text-gray-800 p-2">
      <div className="bg-white rounded-xl shadow p-4 mb-4">
        <div className="font-bold mb-2">근무 요약</div>
        <p>총 근무시간: {formatMin(summary.totalWork)}</p>
        <p>운행중 시간: {formatMin(summary.totalDrive)}</p>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <div className="font-bold mb-2">로그 내역</div>
        <div className="max-h-60 overflow-auto">
          {logs.map((l) => (
            <div key={l.id} className="py-2 border-b">
              [{l.mainStatus}] {l.subStatus}  
              <br />
              <span className="text-xs text-gray-500">
                {l.timestamp?.toDate()?.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
// ===================== END =====================
