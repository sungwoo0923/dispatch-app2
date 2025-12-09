// ======================= src/driver/DriverLogin.jsx (FINAL FIXED v2) =======================
import React, { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

export default function DriverLogin() {
  const [carNo, setCarNo] = useState("");
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const makeEmail = (v) => `${v.replace(/ /g, "")}@driver.run25.kr`;

  // ⭐ 페이지 진입 시 무조건 초기화
  useEffect(() => {
    signOut(auth);
    localStorage.removeItem("role");
    localStorage.removeItem("uid");
  }, []);

  const login = async () => {
    if (!carNo.trim() || !name.trim()) {
      return alert("모두 입력해주세요!");
    }

    const email = makeEmail(carNo.trim());
    const password = carNo.trim();

    try {
      // Auth 로그인
      const res = await signInWithEmailAndPassword(auth, email, password);
      const uid = res.user.uid;

      // Firestore 사용자 정보 조회
      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) {
        alert("등록된 기사 정보가 없습니다.");
        await signOut(auth);
        return;
      }

      const u = snap.data();
      if (!u.approved) {
        alert("관리자 승인 대기중입니다!");
        await signOut(auth);
        return;
      }

      // 승인 완료 → 드라이버 권한 저장
      localStorage.setItem("role", "driver");
      localStorage.setItem("uid", uid);

      alert("로그인 성공!");

      // 🔥 Auth/role 완전 반영 후 이동 (리다이렉트 충돌 방지)
      setTimeout(() => {
        navigate("/driver-home", { replace: true });
      }, 300);

    } catch (err) {
      console.error(err);
      alert("로그인 실패: 차량번호 또는 이름이 올바르지 않습니다.");
      await signOut(auth);
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
