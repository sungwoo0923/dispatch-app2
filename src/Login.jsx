// ======================= src/Login.jsx (PREMIUM V6.1 FIXED) =======================
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
    </div>
  );
}
