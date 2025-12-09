// ======================= FleetManagement.jsx (FULL PREMIUM FINAL) =======================
import React, { useEffect, useState, useMemo } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { db, auth, getCollections } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
} from "firebase/firestore";

// 지도 새 컴포넌트
import DriverMap from "./components/DriverMap.jsx";

// 상태별 색상
const statusColors = {
  "운행중": "blue",
  "대기": "gray",
  "적재중": "orange",
  "휴식": "yellow",
  "출차": "green",
  "퇴근": "black",
};

export default function FleetManagement() {
  const [drivers, setDrivers] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("전체");
  const [selected, setSelected] = useState(null);

  // 🔥 drivers_test / drivers 자동 분기
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) return;

      const { drivers: driversCol } = getCollections(user);

      const unsubDrivers = onSnapshot(
        collection(db, driversCol),
        async (snap) => {
          const arr = [];

          for (const s of snap.docs) {
            const id = s.id;
            const d = s.data();

            const uSnap = await getDoc(doc(db, "users", id));
            const u = uSnap.exists() ? uSnap.data() : {};

            arr.push({
              id,
              이름: u.name || d.name,
              차량번호: u.carNo || d.carNo,
              상태: d.status,
              location: d.location,
              총거리: d.totalDistance || 0,
              근무시간: d.workMinutes || 0,
              updatedAt: d.updatedAt,
              active: d.active,
            });
          }

          setDrivers(arr);
        }
      );

      return () => unsubDrivers();
    });

    return () => unsubAuth();
  }, []);

  const filteredRows = useMemo(() => {
    return drivers.filter((d) => {
      const keyword = query.trim();
      const matchQ = !keyword || d.차량번호?.includes(keyword) || d.이름?.includes(keyword);
      const matchF = filter === "전체" || d.상태 === filter;
      return matchQ && matchF && d.active;
    });
  }, [drivers, query, filter]);

  const kpi = useMemo(() => {
    const total = filteredRows.length;
    const drive = filteredRows.filter((d) => d.상태 === "운행중").length;
    return { total, drive };
  }, [filteredRows]);

  return (
    <div className="flex flex-col gap-6">

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card label="총 기사" value={`${kpi.total} 명`} color="text-blue-600" />
        <Card label="운행중" value={`${kpi.drive} 명`} color="text-green-600" />
      </div>

      {/* 검색/필터 */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="차량번호 / 기사명 검색"
          className="border rounded p-2 w-52"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="border rounded p-2"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option>전체</option>
          <option>대기</option>
          <option>운행중</option>
          <option>적재중</option>
          <option>휴식</option>
          <option>퇴근</option>
        </select>
      </div>

      {/* 표 */}
      <DriverTable rows={filteredRows} onSelect={setSelected} />

      {/* 🔥 새 지도 */}
      <DriverMap />

    </div>
  );
}

// =========================================
// Components
// =========================================
function Card({ label, value, color }) {
  return (
    <div className="bg-white border shadow rounded-xl p-4">
      <p className="text-gray-600 text-sm">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function DriverTable({ rows, onSelect }) {
  return (
    <div className="bg-white border shadow rounded-xl p-4 overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-100 border-b">
          <tr>
            <th className="p-2">차량번호</th>
            <th className="p-2">기사명</th>
            <th className="p-2">상태</th>
            <th className="p-2">누적거리(km)</th>
            <th className="p-2">업데이트</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan="5" className="text-center p-4 text-gray-400">
                데이터 없음
              </td>
            </tr>
          )}

          {rows.map((d) => (
            <tr
              key={d.id}
              className="border-b hover:bg-gray-50 cursor-pointer"
              onClick={() => onSelect(d)}
            >
              <td className="text-center">{d.차량번호}</td>
              <td className="text-center">{d.이름}</td>
              <td className="text-center">{d.상태}</td>
              <td className="text-center">{(d.총거리 || 0).toFixed(1)}</td>
              <td className="text-center">
                {d.updatedAt?.toDate?.()?.toLocaleString?.() || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
// ======================= END =======================
