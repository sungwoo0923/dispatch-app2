// src/Login.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
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
      const result = await signInWithEmailAndPassword(auth, email, password);
      const user = result.user;

      // Firestore 승인 여부 확인
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        // 신규 사용자면 등록 후 승인 대기 처리
        await setDoc(ref, {
          uid: user.uid,
          email: user.email,
          name: "신규사용자",
          approved: false,
          role: "user",
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
        });
        alert("회원가입 완료! 관리자 승인 후 로그인 가능합니다.");
        return;
      }

      const data = snap.data();
      if (!data.approved) {
        alert("관리자 승인 대기 중입니다.");
        return;
      }

      // 승인된 사용자 → 메인 페이지 이동
      navigate("/app");
    } catch (err) {
      console.error(err);
      alert("로그인 실패: " + err.message);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <h1 className="text-2xl font-bold mb-4">배차 시스템 로그인</h1>

      <form onSubmit={handleLogin} className="flex flex-col gap-3 w-72">
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border p-2 rounded"
          required
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border p-2 rounded"
          required
        />
        <button
          type="submit"
          className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          로그인
        </button>
      </form>

      <div className="mt-4 text-sm text-gray-600">
        계정이 없으신가요?{" "}
        <button
          onClick={() => navigate("/signup")}
          className="text-blue-600 hover:underline"
        >
          회원가입
        </button>
      </div>
    </div>
  );
}
