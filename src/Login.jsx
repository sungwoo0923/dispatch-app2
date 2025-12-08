// ======================= src/Login.jsx (UPDATE) =======================
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { auth, db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return alert("이메일과 비밀번호를 입력하세요.");

    try {
      await setPersistence(auth, browserLocalPersistence);

      const result = await signInWithEmailAndPassword(auth, email, password);
      const user = result.user;

      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);

      // 일반 PC 사용자 로그인 처리 유지
      if (!snap.exists()) {
        await setDoc(ref, {
          uid: user.uid,
          email: user.email,
          role: "user",
          approved: false,
          createdAt: serverTimestamp(),
        });
        alert("회원가입 완료! 관리자 승인 후 로그인 가능합니다.");
        return;
      }

      const data = snap.data();
      if (!data.approved) {
        alert("관리자 승인 대기 중입니다.");
        return;
      }

      const role = data.role;
      localStorage.setItem("role", role);
      localStorage.setItem("uid", user.uid);

      navigate(role === "admin" ? "/app" : "/app");
    } catch (err) {
      console.error(err);
      alert("로그인 실패: " + err.message);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <h1 className="text-xl font-bold mb-4">배차 시스템 로그인</h1>

      <form onSubmit={handleLogin} className="flex flex-col gap-3 w-72">
        <input
          type="email"
          placeholder="이메일"
          className="border p-2 rounded"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="비밀번호"
          className="border p-2 rounded"
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="bg-blue-600 text-white p-2 rounded">
          로그인
        </button>
      </form>

      {/* 추가: 차량/기사 로그인 */}
      <div className="mt-4">
        <button
          className="text-green-700 underline"
          onClick={() => navigate("/driver-login")}
        >
          차량/기사 로그인
        </button>
      </div>
    </div>
  );
}
