import React, { useState } from "react";
import { auth, db } from "./firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const nav = useNavigate();

  const login = async () => {
    try {
      const user = await signInWithEmailAndPassword(auth, email, pw);
      const ref = doc(db, "users", user.user.uid);
      const info = (await getDoc(ref)).data();

      if (!info.approved) return alert("관리자 승인 대기중입니다.");

      localStorage.setItem("role", info.role || "user");
      alert("로그인 성공!");
      nav("/app");
    } catch (e) {
      alert("로그인 실패: " + e.message);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded shadow w-[350px]">
        <h2 className="text-center font-bold mb-6">배차 시스템 로그인</h2>

        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 mb-3 border rounded"
        />

        <input
          type="password"
          placeholder="비밀번호"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="w-full p-2 mb-4 border rounded"
        />

        <button
          onClick={login}
          className="w-full bg-blue-600 text-white p-2 rounded active:scale-95"
        >
          로그인
        </button>

        <div className="text-center text-sm mt-3">
          <button
            className="text-green-700 underline"
            onClick={() => nav("/signup")}
          >
            직원 회원가입
          </button>
        </div>

        <div className="text-center text-sm mt-2">
          <button
            className="text-green-700 underline"
            onClick={() => nav("/driver-login")}
          >
            차량/기사 로그인
          </button>
        </div>
      </div>
    </div>
  );
}
