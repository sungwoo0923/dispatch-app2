// src/driver/DriverLogs.jsx
import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";

export default function DriverLogs({ phone }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (!phone) return;
    return onSnapshot(collection(db, "driver_logs", phone, "events"), (snap) => {
      setLogs(snap.docs.map((d) => d.data()));
    });
  }, [phone]);

  return (
    <div className="mt-3">
      {logs.map((l, i) => (
        <div key={i} className="border p-2 text-sm bg-white mb-2 rounded-lg">
          <b>{l.type}</b> / {l.time?.toDate().toLocaleString()}
        </div>
      ))}
    </div>
  );
}
