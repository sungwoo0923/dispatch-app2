// ======================= cafe-site/src/CafeLogin.jsx =======================
import React, { useState } from "react";
import { auth } from "./firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";

export default function CafeLogin() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const login = async () => {
    setError(""); setMsg("");
    if (!email.trim() || !pw) return setError("이메일과 비밀번호를 입력해주세요.");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pw);
      nav("/", { replace: true });
    } catch (e) {
      setError(e.code === "auth/invalid-credential" || e.code === "auth/wrong-password" || e.code === "auth/user-not-found"
        ? "이메일 또는 비밀번호가 올바르지 않습니다." : (e.message || "로그인 중 오류가 발생했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const resetPw = async () => {
    setError(""); setMsg("");
    if (!email.trim()) return setError("비밀번호를 재설정할 이메일을 입력해주세요.");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMsg("비밀번호 재설정 메일을 보냈습니다.");
    } catch {
      setError("재설정 메일 발송에 실패했습니다.");
    }
  };

  const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-900 outline-none focus:border-[#1B2B4B] transition";

  return (
    <div className="min-h-screen bg-[#f4f6fa] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[#1B2B4B] flex items-center justify-center text-white font-black text-[15px]">배</div>
            <span className="text-[19px] font-black text-[#1B2B4B] tracking-tight">배차마당</span>
          </div>
          <p className="text-[13px] text-gray-400">화물 배차 정보 공유 커뮤니티</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7 space-y-3"
          onKeyDown={e => { if (e.key === "Enter") login(); }}>
          <input className={inputCls} placeholder="이메일" type="email" autoComplete="off"
            value={email} onChange={e => setEmail(e.target.value)} />
          <input className={inputCls} placeholder="비밀번호" type="password" autoComplete="off"
            value={pw} onChange={e => setPw(e.target.value)} />

          {error && <div className="text-[12px] text-red-500 font-semibold px-1">{error}</div>}
          {msg && <div className="text-[12px] text-emerald-600 font-semibold px-1">{msg}</div>}

          <button onClick={login} disabled={loading}
            className="w-full py-3 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white font-bold text-[14px] transition disabled:opacity-50">
            {loading ? "로그인 중..." : "로그인"}
          </button>

          <div className="flex items-center justify-between pt-1">
            <button onClick={resetPw} className="text-[12px] text-gray-400 hover:text-gray-600">비밀번호를 잊으셨나요?</button>
            <Link to="/signup" className="text-[13px] font-semibold text-[#1B2B4B] hover:underline">회원가입</Link>
          </div>
        </div>

        <div className="text-center mt-4">
          <a href="https://dispatch-app2.vercel.app/login" target="_blank" rel="noreferrer"
            className="text-[12px] text-gray-400 hover:text-gray-600">배차관리 프로그램으로 돌아가기 ↗</a>
        </div>
      </div>
    </div>
  );
}
