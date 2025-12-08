// ===================== src/FleetManagement.jsx =====================
import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, onSnapshot } from "firebase/firestore";

export default function FleetManagement() {
  const [rows, setRows] = useState([]);
  const [driverFilter, setDriverFilter] = useState("");

  useEffect(() => {
    return onSnapshot(collection(db, "drivers"), (snap) => {
      const arr = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((d) => d.active);

      setRows(arr);
    });
  }, []);

  const filtered = rows.filter((r) =>
    driverFilter ? r.id === driverFilter : true
  );

  return (
    <div className="p-4">
      <select
        value={driverFilter}
        onChange={(e) => setDriverFilter(e.target.value)}
        className="border px-2 py-1 mb-3"
      >
        <option value="">전체기사</option>
        {rows.map((d) => (
          <option key={d.id} value={d.id}>
            {d.이름 || d.id}
          </option>
        ))}
      </select>

      <table className="table-auto w-full text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th>차량번호</th>
            <th>기사명</th>
            <th>상태</th>
            <th>총거리</th>
            <th>근무시간</th>
            <th>업데이트</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id}>
              <td>{r.차량번호}</td>
              <td>{r.이름}</td>
              <td>{r.상태}</td>
              <td>{r.totalDistanceKm?.toFixed(1) || "0.0"} km</td>
              <td>{secToT(r.totalWorkTimeSec)}</td>
              <td>{formatTS(r.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function secToT(sec = 0) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}
const formatTS = (ts) => ts?.toDate?.().toLocaleTimeString?.() || "";
