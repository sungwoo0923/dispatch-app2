// src/Signup.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "./firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!email || !password) return alert("이메일과 비밀번호를 입력하세요.");
    if (password !== confirm) return alert("비밀번호가 일치하지 않습니다.");

    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const user = result.user;

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        name: "신규사용자",
        role: "test",      // 🆕 기본 권한: test!
        approved: false,   // 승인 전 로그인 제한 유지
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
      });

      alert("회원가입 완료! 관리자 승인 후 로그인 가능합니다.");
      await signOut(auth);
      navigate("/login");
    } catch (err) {
      alert("회원가입 실패: " + err.message);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <h1 className="text-2xl font-bold mb-4">회원가입</h1>

      <form onSubmit={handleSignup} className="flex flex-col gap-3 w-72">
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
        <input
          type="password"
          placeholder="비밀번호 확인"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="border p-2 rounded"
          required
        />
        <button
          type="submit"
          className="bg-green-600 text-white py-2 rounded hover:bg-green-700"
        >
          회원가입
        </button>
      </form>

      <div className="mt-4 text-sm text-gray-600">
        이미 계정이 있으신가요?{" "}
        <button
          onClick={() => navigate("/login")}
          className="text-blue-600 hover:underline"
        >
          로그인으로 돌아가기
        </button>
      </div>
    </div>
  );
}
