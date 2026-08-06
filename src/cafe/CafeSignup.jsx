// ======================= src/cafe/CafeSignup.jsx =======================
// 배차마당 회원가입 — 운송사/화주사처럼 승인 절차 없이 가입 즉시 이용 가능하다.
import React, { useState } from "react";
import { auth, db } from "../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";

export default function CafeSignup() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
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
      nav("/cafe", { replace: true });
    } catch (e) {
      const msg = e.code === "auth/email-already-in-use" ? "이미 가입된 이메일입니다."
        : e.code === "auth/invalid-email" ? "이메일 형식이 올바르지 않습니다."
        : e.message || "가입 중 오류가 발생했습니다.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-900 outline-none focus:border-[#1B2B4B] transition";

  return (
    <div className="min-h-screen bg-[#f4f6fa] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[#1B2B4B] flex items-center justify-center text-white font-black text-[15px]">배</div>
            <span className="text-[19px] font-black text-[#1B2B4B] tracking-tight">배차마당</span>
          </div>
          <p className="text-[13px] text-gray-400">화물 배차 정보 공유 커뮤니티</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7 space-y-3">
          <h2 className="text-[16px] font-bold text-gray-900 mb-1">회원가입</h2>

          <input className={inputCls} placeholder="이메일 (아이디)" type="email" autoComplete="off"
            value={email} onChange={e => setEmail(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="비밀번호 (6자 이상)" type="password" autoComplete="off"
              value={pw} onChange={e => setPw(e.target.value)} />
            <input className={inputCls} placeholder="비밀번호 확인" type="password" autoComplete="off"
              value={pw2} onChange={e => setPw2(e.target.value)} />
          </div>
          <input className={inputCls} placeholder="회사명 (개인 차주는 상호/성함)" autoComplete="off"
            value={companyName} onChange={e => setCompanyName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="이름" autoComplete="off"
              value={name} onChange={e => setName(e.target.value)} />
            <input className={inputCls} placeholder="닉네임" autoComplete="off"
              value={nickname} onChange={e => setNickname(e.target.value)} />
          </div>
          <input className={inputCls} placeholder="휴대폰번호" autoComplete="off"
            value={phone} onChange={e => setPhone(formatPhone(e.target.value))} />

          {error && <div className="text-[12px] text-red-500 font-semibold px-1">{error}</div>}

          <button onClick={submit} disabled={loading}
            className="w-full py-3 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white font-bold text-[14px] transition disabled:opacity-50 mt-2">
            {loading ? "가입 중..." : "가입하고 시작하기"}
          </button>

          <div className="text-center pt-2">
            <Link to="/cafe-login" className="text-[13px] text-gray-500 hover:text-[#1B2B4B]">이미 계정이 있으신가요? 로그인</Link>
          </div>
        </div>

        <div className="text-center mt-4">
          <Link to="/login" className="text-[12px] text-gray-400 hover:text-gray-600">← 메인으로</Link>
        </div>
      </div>
    </div>
  );
}
