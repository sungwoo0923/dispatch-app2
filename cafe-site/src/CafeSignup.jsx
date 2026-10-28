// ======================= cafe-site/src/CafeSignup.jsx =======================
// 배차마당 회원가입 — 운송사/화주사처럼 승인 절차 없이 가입 즉시 이용 가능하다.
// 2026-10-28 리디자인 — 로그인과 같은 분할 화면(AuthLayout)
import React, { useState } from "react";
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import { inputCls, btnPrimary, btnPrimaryStyle } from "./ui";

const F = ({ label, children }) => (
  <label className="block">
    <span className="text-[12.5px] font-bold text-[#5B6B85]">{label}</span>
    <div className="mt-1.5">{children}</div>
  </label>
);

export default function CafeSignup() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const formatPhone = (v) => {
    const d = v.replace(/[^\d]/g, "").slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  };

  const submit = async () => {
    setError("");
    if (!email.trim() || !pw || !companyName.trim() || !name.trim() || !nickname.trim() || !phone.trim()) {
      return setError("모든 항목을 입력해주세요.");
    }
    if (pw.length < 6) return setError("비밀번호는 6자 이상이어야 합니다.");
    if (pw !== pw2) return setError("비밀번호가 일치하지 않습니다.");
    if (!agree) return setError("연락처 공개 안내에 동의해 주세요.");

    setLoading(true);
    try {
      const res = await createUserWithEmailAndPassword(auth, email.trim(), pw);
      await setDoc(doc(db, "users", res.user.uid), {
        email: email.trim(),
        role: "cafeUser",
        approved: true,
        companyName: companyName.trim(),
        name: name.trim(),
        nickname: nickname.trim(),
        phone: phone.trim(),
        createdAt: serverTimestamp(),
      });
      nav("/", { replace: true });
    } catch (e) {
      const msg = e.code === "auth/email-already-in-use" ? "이미 가입된 이메일입니다."
        : e.code === "auth/invalid-email" ? "이메일 형식이 올바르지 않습니다."
        : e.message || "가입 중 오류가 발생했습니다.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout en="CREATE ACCOUNT" title="회원가입"
      footer={<Link to="/login" className="text-[13px] font-semibold text-[#7A879C] hover:text-[#0F1A30]">이미 계정이 있으신가요? <b className="text-[#1B2B4B]">로그인</b></Link>}>
      <form className="space-y-3.5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <F label="이메일 (아이디)"><input className={inputCls} placeholder="name@company.com" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></F>
        <div className="grid grid-cols-2 gap-2.5">
          <F label="비밀번호"><input className={inputCls} placeholder="6자 이상" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></F>
          <F label="비밀번호 확인"><input className={inputCls} placeholder="한 번 더" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></F>
        </div>
        <F label="회사명"><input className={inputCls} placeholder="개인 차주는 상호 또는 성함" autoComplete="organization" value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></F>
        <div className="grid grid-cols-2 gap-2.5">
          <F label="이름"><input className={inputCls} placeholder="홍길동" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></F>
          <F label="닉네임"><input className={inputCls} placeholder="게시판 표시 이름" autoComplete="off" value={nickname} onChange={(e) => setNickname(e.target.value)} /></F>
        </div>
        <F label="휴대폰번호"><input className={inputCls} placeholder="010-0000-0000" inputMode="numeric" autoComplete="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} /></F>

        <label className="flex items-start gap-2.5 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3.5 py-3 cursor-pointer">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#1B2B4B]" />
          <span className="text-[12.5px] text-[#3A4A66] leading-relaxed">배차가 <b>확정된 상대방에게만</b> 회사명·이름·휴대폰번호가 공개되는 것에 동의합니다.</span>
        </label>

        {error && <div className="rounded-xl bg-[#F5F8FD] border border-[#DCE3EE] px-3.5 py-2.5 text-[13px] font-bold text-[#0F1A30]">⚠ {error}</div>}

        <button type="submit" disabled={loading} className={`w-full ${btnPrimary}`} style={btnPrimaryStyle}>
          {loading ? "가입 중…" : "가입하고 시작하기"}
        </button>
      </form>
    </AuthLayout>
  );
}
