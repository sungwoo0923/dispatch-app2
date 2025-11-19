// ======================= src/StandardFare.jsx =======================
import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, onSnapshot } from "firebase/firestore";

// 🔥 차량종류 옵션 목록 (중복 제거 + 정리 버전)
const VEHICLE_TYPES = [
  "전체",
  "다마스",
  "라보",
  "라보/다마스",
  "카고",
  "윙바디",
  "냉장탑",
  "냉동탑",
  "리프트",
  "오토바이"
];

// 🔥 문자열 정규화 (공백 제거 + 소문자 변환)
const clean = (s) => String(s || "").replace(/\s+/g, "").trim().toLowerCase();

// 🔥 화물내용 숫자 추출 (예: 16파렛/16p → 16)
const extractCargoNumber = (text) => {
  const m = String(text).match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

// 🔥 톤수 숫자 추출 (예: 1톤/1t/1.4톤 → 1 or 1.4)
const extractTon = (text) => {
  const m = String(text).replace(/톤|t/gi, "").match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

export default function StandardFare() {
  const [dispatchData, setDispatchData] = useState([]);

  // 검색 입력값
  const [pickup, setPickup] = useState(localStorage.getItem("sf_pickup") || "");
  const [drop, setDrop] = useState(localStorage.getItem("sf_drop") || "");
  const [cargo, setCargo] = useState(localStorage.getItem("sf_cargo") || "");
  const [ton, setTon] = useState(localStorage.getItem("sf_ton") || "");
  const [vehicle, setVehicle] = useState(localStorage.getItem("sf_vehicle") || "전체");

  // 결과
  const [result, setResult] = useState([]);
  const [aiFare, setAiFare] = useState(null);

  // 🔥 Firestore 실시간 구독
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "dispatch"), (snap) => {
      const arr = snap.docs.map((d) => ({ _id: d.id, ...d.data() }));
      setDispatchData(arr);
    });
    return () => unsub();
  }, []);

  // 입력값 localStorage 저장
  useEffect(() => {
    localStorage.setItem("sf_pickup", pickup);
    localStorage.setItem("sf_drop", drop);
    localStorage.setItem("sf_cargo", cargo);
    localStorage.setItem("sf_ton", ton);
    localStorage.setItem("sf_vehicle", vehicle);
  }, [pickup, drop, cargo, ton, vehicle]);

  // ⭐ AI 추천운임 계산
  const calcAiFare = (rows) => {
    if (!rows.length) return null;

    const fares = rows
      .map((r) => Number(String(r.청구운임 || 0).replace(/[^\d]/g, "")))
      .filter((n) => n > 0);

    if (!fares.length) return null;

    const avg = Math.round(fares.reduce((a, b) => a + b) / fares.length);
    const min = Math.min(...fares);
    const max = Math.max(...fares);

    // 최근 데이터
    const latest = rows
      .slice()
      .sort((a, b) => (b.상차일 || "").localeCompare(a.상차일 || ""))[0];

    const latestFare = Number(String(latest?.청구운임 || 0).replace(/[^\d]/g, ""));

    const aiValue = Math.round(latestFare * 0.6 + avg * 0.4);
    const confidence = Math.min(95, 60 + rows.length * 5);

    return { avg, min, max, latestFare, aiValue, confidence };
  };

  // 🔍 검색 실행
  const search = () => {
    if (!pickup.trim() || !drop.trim()) {
      alert("상차지명과 하차지명을 입력하세요.");
      return;
    }

    let list = [...dispatchData];

    // 1) 상/하차지 유사검색(부분일치 허용)
    list = list.filter(
      (r) =>
        clean(r.상차지명).includes(clean(pickup)) ||
        clean(pickup).includes(clean(r.상차지명))
    );
    list = list.filter(
      (r) =>
        clean(r.하차지명).includes(clean(drop)) ||
        clean(drop).includes(clean(r.하차지명))
    );

    // 2) 화물내용 (숫자/문자 모두 허용)
    if (cargo.trim()) {
      const cargoNum = extractCargoNumber(cargo);
      list = list.filter((r) => {
        const rowNum = extractCargoNumber(r.화물내용);
        return cargoNum === rowNum || clean(r.화물내용).includes(clean(cargo));
      });
    }

    // 3) 톤수 유사검색
    if (ton.trim()) {
      const tonNum = extractTon(ton);
      list = list.filter((r) => {
        const rowTon = extractTon(r.차량톤수);
        return rowTon && Math.abs(rowTon - tonNum) <= 0.7;
      });
    }

    // 4) 차량종류 필터
    if (vehicle !== "전체") {
      list = list.filter((r) => clean(r.차량종류).includes(clean(vehicle)));
    }

    setResult(list);
    setAiFare(calcAiFare(list));

    if (list.length === 0) alert("조회된 데이터가 없습니다.");
  };

  // 🔄 초기화 버튼
  const reset = () => {
    setPickup("");
    setDrop("");
    setCargo("");
    setTon("");
    setVehicle("전체");
    setResult([]);
    setAiFare(null);

    localStorage.removeItem("sf_pickup");
    localStorage.removeItem("sf_drop");
    localStorage.removeItem("sf_cargo");
    localStorage.removeItem("sf_ton");
    localStorage.removeItem("sf_vehicle");
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">📘 표준 운임표</h2>

      {/* 검색창 */}
      <div className="bg-white p-5 border rounded-xl shadow mb-6">
        <div className="grid grid-cols-5 gap-4">

          <div>
            <label className="text-sm text-gray-500">상차지 *</label>
            <input
              className="border p-2 rounded w-full"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-gray-500">하차지 *</label>
            <input
              className="border p-2 rounded w-full"
              value={drop}
              onChange={(e) => setDrop(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-gray-500">화물내용</label>
            <input
              className="border p-2 rounded w-full"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-gray-500">차량톤수</label>
            <input
              className="border p-2 rounded w-full"
              value={ton}
              onChange={(e) => setTon(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-gray-500">차량종류</label>
            <select
              className="border p-2 rounded w-full"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
            >
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            className="bg-blue-600 text-white px-5 py-2 rounded shadow"
            onClick={search}
          >
            🔍 검색하기
          </button>

          <button
            className="bg-gray-400 text-white px-5 py-2 rounded shadow"
            onClick={reset}
          >
            초기화
          </button>
        </div>
      </div>

      {/* 요약 */}
      {result.length > 0 && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded mb-5">
          총 <b>{result.length}</b> 건의 과거 데이터를 찾았습니다.
        </div>
      )}

      {/* AI 추천 */}
      {aiFare && (
        <div className="bg-amber-50 p-5 rounded-xl border border-amber-300 shadow mb-6">
          <h3 className="text-lg font-bold mb-3">🤖 AI 추천운임</h3>
          <p>평균 운임: <b>{aiFare.avg.toLocaleString()}</b> 원</p>
          <p>최소~최대: <b>{aiFare.min.toLocaleString()} ~ {aiFare.max.toLocaleString()}</b> 원</p>
          <p>최근 동일구간: <b>{aiFare.latestFare.toLocaleString()}</b> 원</p>

          <div className="mt-4 p-4 bg-white border rounded shadow-sm">
            <div className="text-xl text-amber-700 font-bold mb-1">
              📌 {aiFare.aiValue.toLocaleString()} 원
            </div>
            <div className="text-gray-600">
              신뢰도: <b>{aiFare.confidence}%</b>
            </div>
          </div>
        </div>
      )}

      {/* 결과 테이블 */}
      <div className="overflow-auto border rounded-xl shadow">
        <table className="min-w-[1300px] text-sm border">
          <thead className="bg-gray-100">
            <tr>
              {[
                "상차일",
                "상차지명",
                "하차지명",
                "화물내용",
                "차량종류",
                "차량톤수",
                "청구운임",
                "기사운임",
                "수수료",
              ].map((t) => (
                <th key={t} className="border px-3 py-2 text-center">
                  {t}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {result.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-gray-500">
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              result.map((r) => (
                <tr key={r._id} className="odd:bg-white even:bg-gray-50">
                  <td className="border px-3 py-2 text-center">{r.상차일}</td>
                  <td className="border px-3 py-2">{r.상차지명}</td>
                  <td className="border px-3 py-2">{r.하차지명}</td>
                  <td className="border px-3 py-2">{r.화물내용}</td>
                  <td className="border px-3 py-2">{r.차량종류}</td>
                  <td className="border px-3 py-2">{r.차량톤수}</td>
                  <td className="border px-3 py-2 text-right">
                    {Number(r.청구운임 || 0).toLocaleString()}
                  </td>
                  <td className="border px-3 py-2 text-right">
                    {Number(r.기사운임 || 0).toLocaleString()}
                  </td>
                  <td className="border px-3 py-2 text-right">
                    {Number(r.수수료 || 0).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
