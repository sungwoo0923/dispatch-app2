// ======================= FleetManagement.jsx (FULL FINAL SYNCED) =======================
import React, { useEffect, useState, useMemo } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
} from "react-leaflet";
import { db, auth, getCollections } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
} from "firebase/firestore";

// Leaflet 아이콘 설정
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.1/dist/images/marker-shadow.png",
});

// 상태별 색상
const statusColors = {
  운행중: "blue",
  대기: "gray",
  적재중: "orange",
  휴식: "yellow",
  출차: "green",
  퇴근: "black",
};

// 지도 기본 좌표
const SEOUL_CENTER = [37.51093, 126.67645];

export default function FleetManagement() {
  const [drivers, setDrivers] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("전체");
  const [selected, setSelected] = useState(null);

  // 🔥 drivers / drivers_test 자동분기 반영
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
              _id: id,
              uid: id,
              이름: u.name || u.이름 || d.name,
              차량번호: u.carNo || u.차량번호 || d.carNo,
              상태: d.status || d.상태 || "-",
              location: d.location,
              history: d.history || [],
              총거리: d.총거리 || 0,
              근무시간: d.근무시간 || 0,
              updatedAt: d.updatedAt,
            });
          }

          setDrivers(arr);
        }
      );

      return () => unsubDrivers();
    });

    return () => unsubAuth();
  }, []);

  // 검색 / 필터 기능
  const filteredRows = useMemo(() => {
    return drivers
      .filter((d) => d.차량번호)
      .filter((d) => {
        const q = query.trim();
        const matchQ = !q || d.차량번호.includes(q) || d.이름.includes(q);
        const matchF = filter === "전체" || d.상태 === filter;
        const matchActive = d.active !== false; // 승인 기사만 표시
        return matchQ && matchF;
      });
  }, [query, filter, drivers]);

  // KPI
  const kpi = useMemo(() => {
    const total = filteredRows.length;
    const run = filteredRows.filter((d) => d.상태 === "운행중").length;
    const avg =
      (
        filteredRows.reduce((a, b) => a + (b.근무시간 || 0), 0) /
        (total || 1)
      ).toFixed(1);

    return { total, run, avg };
  }, [filteredRows]);

  const mapCenter =
    selected?.location?.lat && selected?.location?.lng
      ? [selected.location.lat, selected.location.lng]
      : SEOUL_CENTER;

  const getHistoryPath = () => {
    if (!selected?.history) return [];
    return selected.history
      .slice(-20)
      .filter((p) => p.lat && p.lng)
      .map((p) => [p.lat, p.lng]);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        <Card label="총 지입차" value={`${kpi.total}대`} color="text-blue-600" />
        <Card label="운행 중" value={`${kpi.run}대`} color="text-green-600" />
        <Card label="평균 근무시간" value={`${kpi.avg}h`} color="text-yellow-600" />
      </div>

      {/* 검색 */}
      <SearchPanel
        query={query}
        setQuery={setQuery}
        filter={filter}
        setFilter={setFilter}
      />

      {/* 표 */}
      <DriverTable rows={filteredRows} onSelect={setSelected} />

      {/* 지도 */}
      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="text-lg font-semibold mb-3">기사 위치 지도</h3>

        <MapContainer
          key="fleet-map"
          center={mapCenter}
          zoom={11}
          style={{ height: "400px", width: "100%" }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {filteredRows
            .filter((d) => d.location?.lat)
            .map((d) => (
              <Marker
                key={d._id}
                position={[d.location.lat, d.location.lng]}
                icon={L.divIcon({
                  html: `<div style="width:12px;height:12px;border-radius:50%;
                    background:${statusColors[d.상태] || "blue"};
                    border:2px solid white"></div>`,
                })}
                eventHandlers={{ click: () => setSelected(d) }}
              >
                <Popup>
                  {d.이름} ({d.차량번호})
                  <br />
                  상태: {d.상태}
                </Popup>
              </Marker>
            ))}

          {selected && (
            <Polyline positions={getHistoryPath()} color="blue" />
          )}
        </MapContainer>
      </div>

      {/* 상세 모달 */}
      {selected && (
        <DetailModal
          selected={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ==================== 서브 컴포넌트 ====================

function Card({ label, value, color }) {
  return (
    <div className="p-4 bg-blue-50 rounded-xl shadow-sm border">
      <p className="text-gray-600 text-sm">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function SearchPanel({ query, setQuery, filter, setFilter }) {
  return (
    <div className="flex gap-6">
      <div className="w-64 bg-white rounded-xl shadow p-4 h-fit">
        <h3 className="text-lg font-semibold mb-4">검색 / 필터</h3>
        <input
          type="text"
          placeholder="차량번호 / 기사명"
          className="border rounded w-full p-2 mb-3"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="border rounded w-full p-2"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option>전체</option>
          <option>대기</option>
          <option>운행중</option>
          <option>휴식</option>
          <option>적재중</option>
          <option>출차</option>
          <option>퇴근</option>
        </select>
      </div>
    </div>
  );
}

function DriverTable({ rows, onSelect }) {
  return (
    <div className="flex-1 bg-white rounded-xl shadow p-4 overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-100 border-b">
          <tr>
            <th className="p-2 text-left">차량번호</th>
            <th className="p-2 text-left">기사명</th>
            <th className="p-2 text-center">상태</th>
            <th className="p-2 text-center">총거리</th>
            <th className="p-2 text-center">근무시간</th>
            <th className="p-2 text-center">업데이트</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan="6" className="text-center p-5 text-gray-500">
                데이터 없음
              </td>
            </tr>
          ) : (
            rows.map((d) => (
              <tr
                key={d._id}
                className="border-b hover:bg-gray-50 cursor-pointer"
                onClick={() => onSelect(d)}
              >
                <td className="p-2">{d.차량번호}</td>
                <td className="p-2">{d.이름}</td>
                <td className="p-2 text-center">{d.상태 || "-"}</td>
                <td className="p-2 text-center">
                  {d.총거리 ? `${d.총거리} km` : "-"}
                </td>
                <td className="p-2 text-center">{d.근무시간 || "-"}</td>
                <td className="p-2 text-center">
                  {d.updatedAt?.toDate?.().toLocaleString() || "-"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function DetailModal({ selected, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-[420px] rounded-xl shadow-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-3">차량 상세 정보</h3>
        <p>차량번호: {selected.차량번호}</p>
        <p>기사명: {selected.이름}</p>
        <p>상태: {selected.상태}</p>
        <p>전화번호: {selected.전화번호 || "-"}</p>
        <button
          onClick={onClose}
          className="mt-5 bg-gray-200 px-3 py-1 rounded"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
// ======================= END =======================
