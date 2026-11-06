// ======================= cafe-site/src/CafeLogin.jsx =======================
// 2026-10-28 리디자인 — 배차 프로그램과 같은 네이비 톤 분할 화면(AuthLayout)
// ⭐ 2026-11-06 로지스웹 허브 — 로지스웹 운송사 계정으로 그대로 로그인(같은 Firebase 계정)
import React, { useState } from "react";
import { auth } from "./firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import { Icon, inputCls, btnPrimary, btnPrimaryStyle } from "./ui";
import { PROGRAM_URL } from "./cafeConstants";

export default function CafeLogin() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
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
      setMsg("비밀번호 재설정 메일을 보냈습니다. 메일함을 확인해 주세요.");
    } catch {
      setError("재설정 메일 발송에 실패했습니다.");
    }
  };

  return (
    <AuthLayout sub="로지스웹 운송사 계정으로" title="로그인"
      footer={<a href={PROGRAM_URL} target="_blank" rel="noreferrer" className="text-[14px] font-semibold text-[#55657F] hover:text-[#0F1A30]">로지스웹 배차 프로그램 바로가기 ↗</a>}>
      <form className="space-y-3.5" onSubmit={(e) => { e.preventDefault(); login(); }}>
        <label className="block">
          <span className="text-[14px] font-bold text-[#55657F]">이메일</span>
          <div className="relative mt-1.5">
            <Icon name="mail" size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9AA9C3]" />
            <input className={`${inputCls} pl-11`} placeholder="name@company.com" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </label>
        <label className="block">
          <span className="text-[14px] font-bold text-[#55657F]">비밀번호</span>
          <div className="relative mt-1.5">
            <Icon name="lock" size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9AA9C3]" />
            <input className={`${inputCls} pl-11 pr-16`} placeholder="비밀번호" type={showPw ? "text" : "password"} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-[#55657F] hover:text-[#0F1A30]">{showPw ? "숨기기" : "보기"}</button>
          </div>
        </label>

        {error && <div className="rounded-xl bg-[#F5F8FD] border border-[#DCE3EE] px-3.5 py-2.5 text-[14px] font-bold text-[#0F1A30]">⚠ {error}</div>}
        {msg && <div className="rounded-xl bg-[#EEF3FB] border border-[#D5E0F2] px-3.5 py-2.5 text-[14px] font-bold text-[#1B2B4B]">✓ {msg}</div>}

        <button type="submit" disabled={loading} className={`w-full ${btnPrimary}`} style={btnPrimaryStyle}>
          {loading ? "로그인 중…" : "로그인"}
        </button>

        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={resetPw} className="text-[14px] font-semibold text-[#55657F] hover:text-[#0F1A30]">비밀번호를 잊으셨나요?</button>
          <Link to="/signup" className="text-[14px] font-bold text-[#1B2B4B] hover:underline">둘러보기 가입 →</Link>
        </div>
      </form>
      <div className="mt-6 pt-5 border-t border-[#EEF1F6] text-[14px] text-[#55657F] leading-relaxed">
        로지스웹 운송사 직원 계정이면 가입 없이 바로 로그인됩니다. 오더 올리기·잡기는 운송사 계정만 할 수 있고, 둘러보기 가입 계정은 열람만 됩니다.
      </div>
    </AuthLayout>
  );
}
