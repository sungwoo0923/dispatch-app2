// src/shipper/ShipperLogin.jsx
import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

export default function ShipperLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const login = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // App.jsx에서 role/approved 보고 자동 라우팅
    } catch (e) {
      alert("로그인 실패");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-900">
      <div className="bg-white p-8 rounded-xl shadow-lg w-[360px] text-center">
        <h1 className="text-xl font-bold mb-2">화주 전용 로그인</h1>
        <p className="text-sm text-gray-500 mb-6">
          화주 고객 전용 포털입니다
        </p>

        <input
          className="w-full border rounded p-2 mb-3"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          className="w-full border rounded p-2 mb-4"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={login}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded mb-4"
        >
          화주 로그인
        </button>

        <div className="text-sm text-gray-600">
          아직 계정이 없으신가요?{" "}
          <span
            className="text-blue-600 cursor-pointer underline"
            onClick={() => navigate("/shipper-signup")}
          >
            화주 회원가입
          </span>
        </div>
      </div>
    </div>
  );
}
