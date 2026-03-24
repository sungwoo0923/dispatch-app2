// ======================= src/Login.jsx (PREMIUM V6.1 FIXED) =======================
import React, { useState, useEffect } from "react";
import { auth } from "./firebase";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { useNavigate, Link } from "react-router-dom";
import { LogIn, Loader2, Truck, UserPlus } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const navigate = useNavigate();
const [showPopup, setShowPopup] = useState(false);
const [countdown, setCountdown] = useState(3);
const [loginTime, setLoginTime] = useState("");
useEffect(() => {
  if (!showPopup) return;

  const handleKey = (e) => {
    if (e.key === "Enter") {
      sessionStorage.removeItem("skipLoginPopup");
      navigate("/app", { replace: true });
    }
  };

  window.addEventListener("keydown", handleKey);
  return () => window.removeEventListener("keydown", handleKey);
}, [showPopup, navigate]);
useEffect(() => {
  if (!showPopup) return;

  if (countdown === 0) {
    navigate("/app", { replace: true });
    return;
  }

  const timer = setTimeout(() => {
    setCountdown((prev) => prev - 1);
  }, 1000);

  return () => clearTimeout(timer);
}, [countdown, showPopup]);
  const login = async () => {
  setError(null);
  setMsg(null);

  if (!email.trim() || !pw.trim()) {
    return setError("이메일 / 비밀번호를 입력해주세요.");
  }

  try {
    setLoading(true);

    await signInWithEmailAndPassword(auth, email, pw);
sessionStorage.setItem("skipLoginPopup", "true");
    // 🔥 로그인 시간
    const now = new Date();
    setLoginTime(now.toLocaleString("ko-KR"));

    // 🔥 팝업 실행
    setShowPopup(true);
    setCountdown(3);

  } catch (err) {
    setError("로그인 실패. 이메일과 비밀번호를 확인해주세요.");
    console.error(err);
  } finally {
    // 🔥 이거 반드시 필요
    setLoading(false);
  }
};

  const resetPw = async () => {
    if (!email.trim()) return setError("이메일을 먼저 입력해주세요.");
    try {
      await sendPasswordResetEmail(auth, email);
      setMsg("재설정 링크를 이메일로 발송했습니다.");
      setError(null);
    } catch (err) {
      setError("해당 이메일을 찾을 수 없습니다.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center
      bg-gradient-to-br from-[#061832] via-[#0B2554] to-[#0D2B66] px-4">

      <div className="bg-white/95 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.15)]
        p-10 w-full max-w-md border border-gray-100 backdrop-blur-md text-center">

        {/* 타이틀 */}
        <h1 className="text-2xl font-extrabold text-[#0D2B66] mb-3">
          RUN25 배차프로그램
        </h1>

        <p className="text-gray-600 mb-6 text-sm">
          직원 전용 관리자 로그인
        </p>

        {/* 이메일 */}
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border w-full p-3 rounded-lg mb-3"
        />

        {/* 비밀번호 */}
        <input
          type="password"
          placeholder="비밀번호"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="border w-full p-3 rounded-lg mb-3"
        />

        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        {msg && <p className="text-green-600 text-sm mb-2">{msg}</p>}

        <button
          onClick={login}
          disabled={loading}
          className="w-full bg-[#0D2B66] text-white py-3 rounded-lg flex justify-center gap-2"
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <LogIn size={20} />}
          로그인
        </button>

        {!loading && (
          <button
            onClick={resetPw}
            className="text-sm text-gray-500 mt-3 underline"
          >
            비밀번호 찾기
          </button>
        )}

        <div className="border-t my-6"></div>

        {/* 직원 / 기사 */}
        <Link to="/signup" className="block text-blue-600 mb-4">
          직원 회원가입
        </Link>

        <div className="flex justify-center gap-6 mb-6">
          <Link to="/driver-login" className="flex items-center gap-1 text-green-700">
            <Truck size={16} /> 기사 로그인
          </Link>
          <Link to="/driver-register" className="flex items-center gap-1 text-green-700">
            <UserPlus size={16} /> 기사 회원가입
          </Link>
        </div>

        {/* ================= 화주 전용 ================= */}
        <div className="border-t my-6"></div>

        <div className="text-sm text-gray-600 mb-2">
          화주 고객이신가요?
        </div>

        <div className="flex justify-center gap-4">
          <Link
            to="/shipper-login"
            className="px-4 py-2 rounded bg-blue-600 text-white font-semibold"
          >
            화주 로그인
          </Link>

          <Link
            to="/shipper-signup"
            className="px-4 py-2 rounded bg-gray-200 text-gray-800 font-semibold"
          >
            화주 회원가입
          </Link>
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
          <circle cx="40" cy="40" r="34" stroke="#e5e7eb" strokeWidth="6" fill="none"/>
          <circle
            cx="40"
            cy="40"
            r="34"
            stroke="#2563eb"
            strokeWidth="6"
            fill="none"
            strokeDasharray={2 * Math.PI * 34}
            strokeDashoffset={(2 * Math.PI * 34 * countdown) / 3}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s linear" }}
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
        onClick={() => navigate("/app", { replace: true })}
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
