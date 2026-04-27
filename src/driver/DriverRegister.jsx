// ===================== src/driver/DriverRegister.jsx (SYNC FIXED) =====================
import React, { useState } from "react";
import { auth, db } from "../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

export default function DriverRegister() {
  const [carNo, setCarNo] = useState("");
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const makeEmail = (v) => `${v.replace(/ /g, "")}@driver.run25.kr`;

  const register = async () => {
    if (!carNo.trim() || !name.trim()) {
      return alert("차량번호와 이름을 입력하세요!");
    }

    const email = makeEmail(carNo.trim());
    const password = carNo.trim();

    try {
      const res = await createUserWithEmailAndPassword(auth, email, password);
      const uid = res.user.uid;

      // users
      await setDoc(doc(db, "users", uid), {
        uid,
        email,
        role: "driver",
        name: name.trim(),
        carNo: carNo.trim(),
        approved: false,
        createdAt: serverTimestamp(),
      });

      // drivers (🔥 관리자 및 앱 최신필드 포함)
      await setDoc(doc(db, "drivers", uid), {
        uid,
        name: name.trim(),
        carNo: carNo.trim(),
        mainStatus: "대기",
        subStatus: "대기",
        status: "대기",
        state: "대기",
        goStatus: "대기",
        active: false,
        totalDistance: 0,
        updatedAt: serverTimestamp(),
      });

      alert("등록 완료! 관리자 승인 후 로그인 가능합니다.");
      navigate("/driver-login");
      
    } catch (err) {
      console.error(err);
      alert("등록 실패: 이미 등록된 차량번호일 수 있습니다.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <button
        className="absolute top-4 left-4 text-sm text-gray-600 hover:underline"
        onClick={() => navigate("/driver-login")}
      >
        ← 로그인
      </button>

      <h2 className="text-lg font-semibold mb-4 text-gray-900">기사 등록</h2>

      <div className="bg-white p-4 rounded shadow w-80 flex flex-col gap-3">
        <input
          placeholder="차량번호 (예: 경기97가1234)"
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
      </div>
    </div>
  );
}
// ===================== END =====================
