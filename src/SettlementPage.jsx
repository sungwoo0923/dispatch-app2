// ======================= src/SettlementPage.jsx =======================
import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import * as XLSX from "xlsx";

export default function SettlementPage() {
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState({});
  const [yearMonth, setYearMonth] = useState(
    new Date().toISOString().slice(0, 7)
  ); // YYYY-MM

  const loadReports = async () => {
    const q = query(
      collection(db, "driver_reports"),
      where("date", ">=", `${yearMonth}-01`),
      where("date", "<=", `${yearMonth}-31`)
    );

    const snap = await getDocs(q);
    const arr = [];
    const userMap = {};

    for (const d of snap.docs) {
      const data = d.data();
      arr.push(data);

      const uid = data.driverId;
      if (!userMap[uid]) {
        const userSnap = await getDoc(doc(db, "users", uid));
        if (userSnap.exists()) userMap[uid] = userSnap.data();
      }
    }

    setReports(arr);
    setUsers(userMap);
  };

  useEffect(() => {
    loadReports();
  }, [yearMonth]);

  const vehicleMap = {
    "vehicle1": "88가 0001",
    "vehicle2": "88나 1234",
    "vehicle3": "88다 5678",
    "vehicle4": "88라 9012",
    "vehicle5": "88마 3456",
  };

  const groupByDriver = {};
  reports.forEach((r) => {
    if (!groupByDriver[r.driverId]) groupByDriver[r.driverId] = [];
    groupByDriver[r.driverId].push(r);
  });

  const calcSum = (arr, key) =>
    arr.reduce((a, b) => a + (b[key] || 0), 0);

  const exportExcel = () => {
    const rows = Object.keys(groupByDriver).map((uid) => {
      const data = groupByDriver[uid];
      const u = users[uid] || {};
      return {
        기사명: u.name || uid,
        차량번호: vehicleMap[u.vehicleId] || "-",
        거리km: (calcSum(data, "totalDistance") / 1000).toFixed(1),
        주유비원: calcSum(data, "fuelCost"),
        톨비원: calcSum(data, "tollCost"),
        총비용원:
          calcSum(data, "fuelCost") + calcSum(data, "tollCost"),
        운행일수: data.length,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${yearMonth}`);
    XLSX.writeFile(wb, `정산_${yearMonth}.xlsx`);
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">📑 월 정산</h2>

      <div className="flex gap-3 items-center">
        <input
          type="month"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          className="border p-2 rounded"
        />
        <button
          onClick={loadReports}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          검색
        </button>
        <button
          onClick={exportExcel}
          className="px-4 py-2 bg-green-600 text-white rounded"
        >
          ⬇ 엑셀 다운로드
        </button>
      </div>

      <table className="w-full border text-center">
        <thead className="bg-gray-100">
          <tr>
            <th>기사</th>
            <th>차량번호</th>
            <th>운행거리(km)</th>
            <th>주유비</th>
            <th>톨비</th>
            <th>회사총비용</th>
            <th>운행일수</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(groupByDriver).map((uid) => {
            const data = groupByDriver[uid];
            const u = users[uid] || {};
            const km = calcSum(data, "totalDistance") / 1000;
            const fuel = calcSum(data, "fuelCost");
            const toll = calcSum(data, "tollCost");
            const cost = fuel + toll;

            return (
              <tr key={uid} className="border-b">
                <td className="font-bold">{u.name || uid}</td>
                <td>{vehicleMap[u.vehicleId] || "-"}</td>
                <td>{km.toFixed(1)}</td>
                <td>{fuel.toLocaleString()}</td>
                <td>{toll.toLocaleString()}</td>
                <td className="text-red-600 font-bold">
                  {cost.toLocaleString()}
                </td>
                <td>{data.length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
// ======================= END =======================
