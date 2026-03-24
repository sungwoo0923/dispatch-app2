// src/shipper/ShipperLogin.jsx
import React, { useState, useEffect } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import { 
  setPersistence, 
  browserLocalPersistence, 
  browserSessionPersistence 
} from "firebase/auth";

export default function ShipperLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberId, setRememberId] = useState(false);
const [autoLogin, setAutoLogin] = useState(false);
const [showPopup, setShowPopup] = useState(false);
const [countdown, setCountdown] = useState(3);
const [loginTime, setLoginTime] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
  const savedEmail = localStorage.getItem("savedEmail");
  const savedAutoLogin = localStorage.getItem("autoLogin");

  if (savedEmail) {
    setEmail(savedEmail);
    setRememberId(true);
  }

  if (savedAutoLogin === "true") {
    setAutoLogin(true);
  }
}, []);
useEffect(() => {
  if (!showPopup) return;

if (countdown === 0) {
  sessionStorage.removeItem("skipLoginPopup"); // 🔥 추가
  navigate("/shipper", { replace: true });
  return;
}

  const timer = setTimeout(() => {
    setCountdown((prev) => prev - 1);
  }, 1000);

  return () => clearTimeout(timer);
}, [countdown, showPopup, navigate]);
  const login = async () => {
  try {

    // 🔥 자동로그인 여부에 따라 유지 방식 변경
await setPersistence(
  auth,
  autoLogin ? browserLocalPersistence : browserSessionPersistence
);

await signInWithEmailAndPassword(auth, email, password);
sessionStorage.setItem("skipLoginPopup", "true");
// 🔥 그 다음 팝업
const now = new Date();
const formatted = now.toLocaleString("ko-KR");
setLoginTime(formatted);

setShowPopup(true);
setCountdown(3);
    // 아이디 저장
    if (rememberId) {
      localStorage.setItem("savedEmail", email);
    } else {
      localStorage.removeItem("savedEmail");
    }

    if (autoLogin) {
      localStorage.setItem("autoLogin", "true");
    } else {
      localStorage.removeItem("autoLogin");
    }

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

<form autoComplete="off">
  <input
    name="shipper-email"              // 🔥 핵심
    autoComplete="off"
    className="w-full border rounded p-2 mb-3"
    placeholder="이메일"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />

  <input
    type="password"
    name="shipper-password"           // 🔥 핵심
    autoComplete="new-password"       // 🔥 핵심
    className="w-full border rounded p-2 mb-4"
    placeholder="비밀번호"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
  />
  <div className="flex justify-between text-sm mb-4">
  <label className="flex items-center gap-1 cursor-pointer">
    <input
      type="checkbox"
      checked={rememberId}
      onChange={(e) => setRememberId(e.target.checked)}
    />
    아이디 저장
  </label>

  <label className="flex items-center gap-1 cursor-pointer">
    <input
      type="checkbox"
      checked={autoLogin}
      onChange={(e) => setAutoLogin(e.target.checked)}
    />
    자동 로그인
  </label>
</div>
</form>

        <button
          onClick={login}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded mb-4"
        >
          화주 로그인
        </button>

        {/* 화주 회원가입 */}
        <div className="text-sm text-gray-600 mb-4">
          아직 계정이 없으신가요?{" "}
          <span
            className="text-blue-600 cursor-pointer underline"
            onClick={() => navigate("/shipper-signup")}
          >
            화주 회원가입
          </span>
        </div>

        {/* ✅ 관리자 로그인으로 돌아가기 */}
        <div className="text-sm text-gray-500">
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="hover:text-gray-700 underline"
          >
            ← 관리자 로그인으로 돌아가기
          </button>
        </div>
      </div>
      {showPopup && (
  <div className="fixed inset-0 bg-black/40 z-[999] flex items-center justify-center">
    <div className="bg-white w-[320px] rounded-2xl shadow-xl p-6 text-center">

      <div className="text-lg font-bold mb-3">로그인 완료</div>

      <div className="text-sm text-gray-600 mb-1">로그인 일시</div>
      <div className="text-sm font-semibold mb-2">{loginTime}</div>

      <div className="text-sm text-gray-600 mb-1">로그인 아이디</div>
      <div className="text-sm font-semibold mb-3">{email}</div>

<div className="relative w-20 h-20 mx-auto mb-4">
  <svg className="w-20 h-20 -rotate-90">
    <circle
      cx="40"
      cy="40"
      r="34"
      stroke="#e5e7eb"
      strokeWidth="6"
      fill="none"
    />
    <circle
      cx="40"
      cy="40"
      r="34"
      stroke="#2563eb"
      strokeWidth="6"
      fill="none"
      strokeDasharray={2 * Math.PI * 34}
      strokeDashoffset={
        (2 * Math.PI * 34 * countdown) / 3
      }
      strokeLinecap="round"
      style={{
        transition: "stroke-dashoffset 1s linear",
      }}
    />
  </svg>

  <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-blue-600">
    {countdown}
  </div>
</div>

      <div className="text-xs text-gray-500 mb-4">
        오늘도 좋은 하루 되세요!
      </div>

      <button
onClick={() => {
  sessionStorage.removeItem("skipLoginPopup"); // 🔥 추가
  navigate("/shipper", { replace: true });
}}
        className="w-full bg-blue-600 text-white py-2 rounded"
      >
        확인
      </button>

    </div>
  </div>
)}
    </div>
  );
}
