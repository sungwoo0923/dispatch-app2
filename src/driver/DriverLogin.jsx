// ======================= src/driver/DriverLogin.jsx (EDIT) =======================
import React, { useState } from "react";
import { db, doc, getDoc } from "../firebase";
import { useNavigate } from "react-router-dom";

export default function DriverLogin() {
  const [carNo, setCarNo] = useState("");
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const login = async () => {
    const id = `${carNo.trim()}_${name.trim()}`;
    const ref = doc(db, "users", id);
    const snap = await getDoc(ref);

    if (!snap.exists()) return alert("등록되지 않은 기사입니다!");

    const u = snap.data();
    if (!u.approved) return alert("관리자 승인 대기 중입니다.");

    localStorage.setItem("role", "driver");
    localStorage.setItem("driverId", id);

    alert("로그인 성공!");
    navigate("/driver-home");
  };


  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <h2 className="text-lg font-semibold mb-4">기사 로그인</h2>

      <div className="bg-white p-4 rounded shadow w-80 flex flex-col gap-3">
        <input
          placeholder="차량번호"
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
          onClick={login}
          className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          로그인
        </button>

        <button
          onClick={() => navigate("/driver-register")}
          className="text-sm text-blue-600 mt-2"
        >
          등록하기
        </button>
      </div>
    </div>
  );
}
