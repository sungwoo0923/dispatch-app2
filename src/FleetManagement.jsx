// ======================= FleetManagement.jsx (FINAL FULL COPY VERSION) =======================
import React, { useEffect, useState, useMemo, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { db, auth, getCollections } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
} from "firebase/firestore";
import DriverMap from "./components/DriverMap.jsx";
import { MapContainer, TileLayer, Polyline, Marker } from "react-leaflet";

// 상태 색상
const statusColors = {
  운행중: "bg-blue-600",
  대기: "bg-gray-500",
  적재중: "bg-orange-500",
  휴식: "bg-yellow-500",
  출차: "bg-green-600",
  퇴근: "bg-black",
};

// 숫자 애니메이션 Hook
const useAnimatedNumber = (value) => {
  const [display, setDisplay] = useState(value);
  const ref = useRef(value);

  useEffect(() => {
    const step = (value - ref.current) / 10;
    const id = setInterval(() => {
      ref.current += step;
      setDisplay(ref.current);
      if (Math.abs(value - ref.current) < 0.01) {
        clearInterval(id);
        ref.current = value;
        setDisplay(value);
      }
    }, 40);
    return () => clearInterval(id);
  }, [value]);

  return display;
};

export default function FleetManagement() {
  const [drivers, setDrivers] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("전체");
  const [selected, setSelected] = useState(null);
  const [hoverPath, setHoverPath] = useState(null);

  // ⭐ 지도 센터
  const [center, setCenter] = useState(null);

  // DB 구독
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) return;

      const { drivers: driversCol } = getCollections(user);

      const unsubDrivers = onSnapshot(collection(db, driversCol), async (snap) => {
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
            role: u.role || d.role,
            상태: d.status,
            location: d.location,
            경로: d.path || [],
            총거리: d.totalDistance || 0,
            근무시간: d.workMinutes || 0,
            updatedAt: d.updatedAt,
            active: d.active,
          });
        }

        setDrivers(arr);
      });

      return () => unsubDrivers();
    });

    return () => unsubAuth();
  }, []);

  // 필터
  const filteredRows = useMemo(() => {
    return drivers.filter((d) => {
      const keyword = query.trim();
      const matchQ =
        !keyword ||
        d.차량번호?.includes(keyword) ||
        d.이름?.includes(keyword);

      const matchF = filter === "전체" || d.상태 === filter;

      return (
        d.role === "driver" &&
        d.active === true &&
        matchQ &&
        matchF
      );
    });
  }, [drivers, query, filter]);

  // KPI
  const kpi = useMemo(() => {
    const total = filteredRows.length;
    const drive = filteredRows.filter((d) => d.상태 === "운행중").length;
    return { total, drive };
  }, [filteredRows]);

  return (
    <div className="flex flex-col gap-6">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card label="지입수" value={`${kpi.total} 명`} color="text-blue-600" />
        <Card label="운행중" value={`${kpi.drive} 명`} color="text-green-600" />
      </div>

      {/* 검색 */}
      <div className="flex gap-3">
        <input
          className="border rounded p-2 w-52"
          placeholder="차량번호 / 기사명 검색"
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
        </select>
      </div>

      {/* 카드형 리스트 */}
      <DriverCardList
        rows={filteredRows}
        onSelect={(d) => {
          setSelected(d);
          if (d.location) setCenter(d.location); // ⭐ 카드 누르면 지도 이동
        }}
        onHover={setHoverPath}
      />

      {/* 상세 팝업 */}
      {selected && (
        <DriverDetailModal
          data={selected}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Hover 이동경로 */}
      {hoverPath && <MiniDrivingPath data={hoverPath} />}

      {/* 지도 */}
      <DriverMap
        drivers={filteredRows}
        onSelect={(d) => {
          setSelected(d);
          if (d.location) setCenter(d.location); // ⭐ 지도 마커 누르면 지도 이동
        }}
        center={center}
      />
    </div>
  );
}

// ==================================================================

function Card({ label, value, color }) {
  return (
    <div className="bg-white border shadow rounded-xl p-4">
      <p className="text-gray-600 text-sm">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function DriverCardList({ rows, onSelect, onHover }) {
  return (
    <div className="bg-white border shadow rounded-xl p-4">
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((d) => (
          <DriverCard
            key={d.id}
            data={d}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
      </div>
    </div>
  );
}

function DriverCard({ data, onSelect, onHover }) {
  const distance = useAnimatedNumber(data.총거리);
  const worktime = useAnimatedNumber(data.근무시간);

  return (
    <div
      className="border rounded-xl p-4 cursor-pointer hover:shadow-lg bg-gray-50 flex justify-between"
      onClick={() => onSelect(data)}
      onMouseEnter={() => onHover(data)}
      onMouseLeave={() => onHover(null)}
    >
      <div>
        <p className="font-bold text-lg">{data.차량번호}</p>
        <p className="text-sm text-gray-600">{data.이름}</p>
        <p className="text-xs text-gray-500 mt-1">{distance.toFixed(2)} km 이동</p>
        <p className="text-xs text-gray-500">근무 {Math.floor(worktime)} 분</p>
      </div>

      <div className="text-right">
        <span
          className={`px-2 py-1 text-xs rounded-lg text-white ${
            statusColors[data.상태] || "bg-gray-400"
          }`}
        >
          {data.상태}
        </span>
        <p className="text-[10px] text-gray-400 mt-1">
          {data.updatedAt?.toDate?.()?.toLocaleTimeString?.() || "-"}
        </p>
      </div>
    </div>
  );
}

function DriverDetailModal({ data, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm
                 flex items-center justify-center z-[9999]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 w-80 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-lg font-bold mb-2">
          {data.이름} / {data.차량번호}
        </div>

        <div className="text-sm text-gray-600 mb-1">상태: {data.상태}</div>
        <div className="text-sm text-gray-600">
          총 이동거리: {(data.총거리 || 0).toFixed(2)} km
        </div>

        <div className="text-xs text-gray-400 mt-3">
          업데이트: {data.updatedAt?.toDate?.()?.toLocaleString?.()}
        </div>

        <button
          className="w-full py-2 mt-4 bg-blue-600 text-white rounded-xl"
          onClick={onClose}
        >
          닫기
        </button>
      </div>
    </div>
  );
}

function MiniDrivingPath({ data }) {
  if (!data.location) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-white border rounded-xl shadow-lg z-50">
      <MapContainer
        center={[data.location.lat, data.location.lng]}
        zoom={14}
        scrollWheelZoom={false}
        className="h-48 w-48 rounded-xl"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        <Marker position={[data.location.lat, data.location.lng]} />

        {Array.isArray(data.경로) && data.경로.length > 1 && (
          <Polyline positions={data.경로.map((p) => [p.lat, p.lng])} color="blue" />
        )}
      </MapContainer>
    </div>
  );
}

// ======================= END =======================
