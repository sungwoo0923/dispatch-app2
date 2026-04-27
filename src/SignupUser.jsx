import React, { useState } from "react";
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

export default function SignupUser() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const nav = useNavigate();

  const signup = async () => {
    try {
      const res = await createUserWithEmailAndPassword(auth, email, pw);
      await setDoc(doc(db, "users", res.user.uid), {
        email,
        role: "user",
        approved: false,
      });

      alert("가입 요청 완료! 승인 후 이용 가능합니다.");
      nav("/");
    } catch (e) {
      alert("오류: " + e.message);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded shadow w-[350px]">
        <h2 className="text-center font-bold mb-6">직원 회원가입</h2>

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
          onClick={signup}
          className="w-full bg-green-600 text-white p-2 rounded active:scale-95"
        >
          회원가입 요청
        </button>

        <div className="text-center mt-3 text-sm">
          <button
            className="text-blue-600 underline"
            onClick={() => nav("/")}
          >
            로그인으로
          </button>
        </div>
      </div>
    </div>
  );
}
