// ======================= src/driver/DriverLogin.jsx (AUTH + APPROVE CHECK) =======================
import React, { useState } from "react";
import { auth, db } from "../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

export default function DriverLogin() {
  const [carNo, setCarNo] = useState("");
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const makeEmail = (v) => `${v.replace(/ /g, "")}@driver.run25.kr`;

  const login = async () => {
    if (!carNo.trim() || !name.trim()) return alert("모두 입력해주세요!");

    const email = makeEmail(carNo.trim());
    const password = carNo.trim(); // 차량번호 = PW
    try {
      // 1) Auth 로그인
      const res = await signInWithEmailAndPassword(auth, email, password);
      const uid = res.user.uid;

      // 2) Firestore 승인 확인
      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) {
        alert("등록된 기사 데이터가 없습니다.");
        return signOut(auth);
      }

      const u = snap.data();
      if (!u.approved) {
        alert("관리자 승인 대기중입니다!");
        return signOut(auth);
      }

      // 3) Local 저장
      localStorage.setItem("role", "driver");
      localStorage.setItem("uid", uid);

      alert("로그인 성공!");
      navigate("/driver-home");

    } catch (err) {
      console.error(err);
      alert("로그인 실패: 차량번호 또는 이름이 올바르지 않습니다.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">

      <button
        className="absolute top-4 left-4 text-sm text-blue-600 hover:underline"
        onClick={() => navigate("/login")}
      >
        ← 직원 로그인
      </button>

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

// ======================= END =======================