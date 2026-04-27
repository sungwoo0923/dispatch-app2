// ===================== src/DriverTimeline.jsx =====================
import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection,
  query,
  onSnapshot,
  orderBy,
} from "firebase/firestore";

export default function DriverTimeline({ phone }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (!phone) return;
    const today = new Date().toISOString().slice(0, 10);

    const q = query(
      collection(db, "driver_logs", phone, "events"),
      orderBy("time", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => unsub();
  }, [phone]);

  return (
    <div className="text-sm max-h-64 overflow-y-auto border rounded p-2 bg-gray-50">
      <h4 className="font-bold text-gray-700 mb-2">운행 타임라인</h4>
      {logs.map((log) => (
        <div key={log.id} className="border-b py-1">
          <p className="font-medium">{log.type}</p>
          {log.gps && (
            <p className="text-xs text-gray-500">
              ({log.gps.lat.toFixed(5)}, {log.gps.lng.toFixed(5)})
            </p>
          )}
          <p className="text-xs text-gray-400">
            {log.time?.toDate().toLocaleString("ko-KR")}
          </p>
        </div>
      ))}
      {logs.length === 0 && (
        <p className="text-xs text-gray-400">기록 없음</p>
      )}
    </div>
  );
}
// ===================== END =====================
