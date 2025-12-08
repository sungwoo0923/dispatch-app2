// ======================= src/Login.jsx =======================
import React, { useState } from "react";
import { auth, signInWithEmailAndPassword } from "./firebase";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const navigate = useNavigate();

  const login = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, pw);
      localStorage.setItem("role", "admin"); // 기본은 admin(직원)
      navigate("/app");
    } catch (err) {
      alert("로그인 실패: " + err.message);
    }
  };

  return (
    <div className="min-h-screen flex justify-center items-center bg-gray-100">
      <div className="bg-white p-6 rounded-xl shadow w-96 text-center">
        <h2 className="text-lg font-semibold mb-4">배차 시스템 로그인</h2>

        <input
          type="email"
          className="border w-full px-3 py-2 mb-2 rounded"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          className="border w-full px-3 py-2 mb-4 rounded"
          placeholder="비밀번호"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />

        <button
          className="bg-blue-600 w-full py-2 text-white rounded mb-4"
          onClick={login}
        >
          로그인
        </button>

        {/* 직원 회원가입 */}
        <Link to="/signup" className="text-sm text-green-600 block mb-1">
          직원 회원가입
        </Link>

        {/* 차량/기사 로그인 */}
        <Link to="/driver-login" className="text-sm text-blue-600 block">
          차량/기사 로그인
        </Link>

        {/* 차량/기사 회원가입 🔥 추가 */}
        <Link to="/driver-register" className="text-sm mt-1 text-gray-700 block">
          차량/기사 회원가입
        </Link>

      </div>
    </div>
  );
}
