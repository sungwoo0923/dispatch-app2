// ======================= src/driver/DriverRegister.jsx =======================
import React, { useState } from "react";
import { db, doc, setDoc } from "../firebase";
import { collection, getDocs, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

export default function DriverRegister() {
  const [carNo, setCarNo] = useState("");
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const register = async () => {
    if (!carNo.trim() || !name.trim()) return alert("모두 입력하세요!");

    const id = `${carNo.trim()}_${name.trim()}`;

    // users 컬렉션 등록 (승인 대기)
    await setDoc(doc(db, "users", id), {
      uid: id,
      email: carNo.trim(), // 차량번호 기반
      role: "driver",
      name: name.trim(),
      approved: false,
      createdAt: serverTimestamp(),
    });

    // drivers 컬렉션 등록(비활성)
    await setDoc(doc(db, "drivers", id), {
      차량번호: carNo.trim(),
      이름: name.trim(),
      active: false,
      상태: "대기",
      updatedAt: serverTimestamp(),
    }, { merge: true });

    alert("등록 완료! 관리자 승인 후 로그인 가능합니다.");
    navigate("/driver-login");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">기사 등록</h2>

      <div className="bg-white p-4 rounded shadow w-80 flex flex-col gap-3">
        <input
          placeholder="차량번호(예: 97가1234)"
          value={carNo}
          onChange={(e) => setCarNo(e.target.value)}
          className="border p-2 rounded"
        />
        <input
          placeholder="기사 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border p-2 rounded"
        />

        <button
          onClick={register}
          className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          등록
        </button>

        <button
          onClick={() => navigate("/driver-login")}
          className="text-sm text-blue-600 mt-2"
        >
          로그인하기
        </button>
      </div>
    </div>
  );
}
