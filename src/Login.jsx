// ======================= src/Login.jsx (PREMIUM V6.1) =======================
import React, { useState } from "react";
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

  const login = async () => {
    setError(null);
    setMsg(null);
    if (!email.trim() || !pw.trim()) {
      return setError("이메일 / 비밀번호를 입력해주세요.");
    }

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, pw);
      localStorage.setItem("role", "admin");
      navigate("/app");
    } catch (err) {
      setError("로그인 실패. 이메일과 비밀번호를 확인해주세요.");
      console.error(err);
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
          Dispatcher Platform
        </h1>

        <p className="text-gray-600 mb-6 text-sm">
          직원 전용 관리자 로그인
        </p>

        {/* 이메일 입력 */}
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border w-full p-3 rounded-lg mb-3 text-gray-800
          focus:border-blue-600 focus:ring focus:ring-blue-200"
        />

        {/* 비밀번호 입력 */}
        <input
          type="password"
          placeholder="비밀번호"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="border w-full p-3 rounded-lg mb-3 text-gray-800
          focus:border-blue-600 focus:ring focus:ring-blue-200"
        />

        {/* 메시지 */}
        {error && <p className="text-red-600 text-sm mb-2 font-semibold">{error}</p>}
        {msg && <p className="text-green-600 text-sm mb-2 font-semibold">{msg}</p>}

        {/* 로그인 버튼 */}
        <button
          onClick={login}
          disabled={loading}
          className="w-full bg-[#0D2B66] text-white font-bold py-3 rounded-lg
          hover:bg-[#153A85] transition flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <LogIn size={20} />
          )}
          로그인
        </button>

        {/* 비밀번호 찾기 */}
        {!loading && (
          <button
            onClick={resetPw}
            className="text-sm text-gray-500 mt-3 hover:text-blue-700 underline"
          >
            비밀번호 찾기
          </button>
        )}

        <div className="border-t my-6"></div>

        {/* 직원 회원가입 */}
        <Link
          to="/signup"
          className="block text-blue-600 font-semibold hover:underline mb-5"
        >
          직원 회원가입
        </Link>

        {/* 기사 관련 메뉴 */}
        <div className="text-xs text-gray-500 mb-3">
          직원이 아닌 경우 차량/기사 메뉴 이용
        </div>

        <div className="flex justify-center gap-6">
          <Link
            to="/driver-login"
            className="flex items-center gap-1 text-green-700 font-semibold hover:underline"
          >
            <Truck size={16} /> 기사 로그인
          </Link>
          <Link
            to="/driver-register"
            className="flex items-center gap-1 text-green-700 font-semibold hover:underline"
          >
            <UserPlus size={16} /> 기사 회원가입
          </Link>
        </div>

      </div>
    </div>
  );
}
