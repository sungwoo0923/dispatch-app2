// ======================= src/mobile/MobileDriverApp.jsx =======================

import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  addDoc,
  doc,
  serverTimestamp
} from "firebase/firestore";
import { getDistanceKm } from "../utils/distance";
import { getFuelPrice } from "../firebase/fuelApi"; // 🔥 추가

export default function MobileDriverApp() {
  const [dispatchList, setDispatchList] = useState([]);
  const [active, setActive] = useState(null); // 운행 진행중 배차 ID
  const [startLocation, setStartLocation] = useState(null);
  const [overtime, setOvertime] = useState(false); // 잔업 여부

  const uid = auth.currentUser?.uid;

  // 📍 GPS 현재 위치 불러오기
  const getCurrentPosition = () =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords),
        (err) => {
          alert("📍 위치 권한을 허용해주세요!");
          reject(err);
        },
        { enableHighAccuracy: true }
      );
    });

  // 🔹 본인 배차 목록 실시간 반영
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "dispatch"), where("driverId", "==", uid));
    const unsub = onSnapshot(q, (snap) => {
      setDispatchList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [uid]);

  // 🚀 운행시작
  const handleStart = async (d) => {
    const pos = await getCurrentPosition();
    setStartLocation(pos);
    setActive(d.id);

    alert("출발 위치 저장 완료! 🚚");
  };

  // 🛑 운행완료 → 거리 + 유가 + 유류비 저장
  const handleEnd = async (d) => {
    if (!startLocation) return alert("출발 위치 정보가 없습니다!");

    const endPos = await getCurrentPosition();
    const km = getDistanceKm(
      startLocation.latitude,
      startLocation.longitude,
      endPos.latitude,
      endPos.longitude
    );

    const fuelPrice = await getFuelPrice(); // 🔥 유가 자동 수집
    const fuelCost = Number(((km / 3.5) * fuelPrice).toFixed(0)); // 3.5 km/L

    // 🔥 운행 기록 저장
    await addDoc(collection(db, "drivers", uid, "logs"), {
      dispatchId: d.id,
      vehicleId: d.차량번호 || "",
      startAt: serverTimestamp(),
      endAt: serverTimestamp(),
      startPoint: startLocation,
      endPoint: endPos,
      distanceKm: Number(km.toFixed(2)),
      overtime,
      fuelPrice,
      fuelCost,
      createdAt: serverTimestamp()
    });

    // 🔥 배차상태 완료 처리
    await updateDoc(doc(db, "dispatch", d.id), {
      배차상태: "배송완료"
    });

    setActive(null);
    setStartLocation(null);
    setOvertime(false);

    alert(
      `🚚 운행 완료!\n총거리: ${km.toFixed(2)} km\n유류비: ${fuelCost.toLocaleString()}원 저장되었습니다.`
    );
  };

  return (
    <div className="p-4 min-h-screen bg-gray-50">
      <h1 className="text-lg font-bold mb-3">🚚 내 배차 목록</h1>

      {dispatchList.length === 0 && (
        <p className="text-sm text-gray-500">현재 배차가 없습니다.</p>
      )}

      <div className="flex flex-col gap-3">
        {dispatchList.map((d) => (
          <div
            key={d.id}
            className="bg-white rounded-lg shadow p-3 border border-gray-200"
          >
            <div className="text-sm font-semibold">{d.거래처명}</div>
            <div className="text-xs text-gray-600">
              {d.상차지명} → {d.하차지명}
            </div>
            <div className="text-xs mt-1">
              상태: <b>{d.배차상태}</b>
            </div>

            {active === d.id ? (
              <>
                <label className="flex items-center gap-2 mt-2 text-xs">
                  <input
                    type="checkbox"
                    checked={overtime}
                    onChange={(e) => setOvertime(e.target.checked)}
                  />
                  잔업 여부
                </label>
                <button
                  onClick={() => handleEnd(d)}
                  className="w-full bg-red-600 text-white py-1 rounded text-xs mt-2"
                >
                  🛑 운행완료
                </button>
              </>
            ) : (
              <button
                onClick={() => handleStart(d)}
                disabled={d.배차상태 !== "배차완료"}
                className="w-full bg-blue-600 text-white py-1 rounded text-xs mt-2 disabled:bg-gray-300"
              >
                🚀 운행시작
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ======================= END =======================
