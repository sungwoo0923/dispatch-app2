// src/shipper/ShipperLogin.jsx
import React, { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function ShipperLogin() {
  const [companyName, setCompanyName] = useState(
    () => localStorage.getItem("shipperCompany") || ""
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberId, setRememberId] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [loginTime, setLoginTime] = useState("");
  const navigate = useNavigate();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionStorage.removeItem("shipperValidating");
      sessionStorage.removeItem("skipLoginPopup");
    };
  }, []);

  // Restore saved credentials
  useEffect(() => {
    const savedEmail = localStorage.getItem("savedShipperEmail");
    const savedAutoLogin = localStorage.getItem("shipperAutoLogin");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberId(true);
    }
    if (savedAutoLogin === "true") {
      setAutoLogin(true);
    }
  }, []);

  // Countdown auto-navigate
  useEffect(() => {
    if (!showPopup) return;
    if (countdown === 0) {
      sessionStorage.removeItem("skipLoginPopup");
      navigate("/shipper", { replace: true });
      return;
    }
    const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, showPopup, navigate]);

  const login = async () => {
    setError(null);
    setMsg(null);

    if (!companyName.trim()) return setError("회사명을 입력해주세요.");
    if (!email.trim() || !password.trim()) return setError("이메일과 비밀번호를 입력해주세요.");

    sessionStorage.setItem("shipperValidating", "true");

    try {
      setLoading(true);

      await setPersistence(
        auth,
        autoLogin ? browserLocalPersistence : browserSessionPersistence
      );

      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const uid = credential.user.uid;

      // Firestore validation
      const userSnap = await getDoc(doc(db, "users", uid));

      if (!userSnap.exists()) {
        sessionStorage.removeItem("shipperValidating");
        await signOut(auth);
        setError("등록된 계정 정보가 없습니다");
        return;
      }

      const userData = userSnap.data();

      if (userData.role !== "shipper") {
        sessionStorage.removeItem("shipperValidating");
        await signOut(auth);
        setError("화주 계정이 아닙니다");
        return;
      }

      if ((userData.companyName || "") !== companyName.trim()) {
        sessionStorage.removeItem("shipperValidating");
        await signOut(auth);
        setError("회사명이 일치하지 않습니다");
        return;
      }

      // All checks passed
      localStorage.setItem("shipperCompany", companyName.trim());
      localStorage.setItem("loginCompany", companyName.trim());

      if (rememberId) {
        localStorage.setItem("savedShipperEmail", email.trim());
      } else {
        localStorage.removeItem("savedShipperEmail");
      }

      if (autoLogin) {
        localStorage.setItem("shipperAutoLogin", "true");
      } else {
        localStorage.removeItem("shipperAutoLogin");
      }

      sessionStorage.removeItem("shipperValidating");
      sessionStorage.setItem("skipLoginPopup", "true");

      const now = new Date();
      setLoginTime(now.toLocaleString("ko-KR"));
      setShowPopup(true);
      setCountdown(3);
    } catch (err) {
      sessionStorage.removeItem("shipperValidating");
      const code = err.code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("비밀번호가 일치하지 않습니다");
      } else if (code === "auth/user-not-found") {
        setError("등록된 이메일이 없습니다");
      } else {
        setError("로그인에 실패했습니다");
      }
    } finally {
      setLoading(false);
    }
  };

  const resetPw = async () => {
    if (!email.trim()) return setError("이메일을 먼저 입력해주세요.");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMsg("재설정 링크를 이메일로 발송했습니다.");
      setError(null);
    } catch {
      setError("해당 이메일을 찾을 수 없습니다.");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !loading) login();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-[#061832] via-[#0B2554] to-[#0D2B66]">
      {/* Top-right icon */}
      <div className="fixed top-4 right-4 z-50">
        <img
          src="/icons/sflow-icon.png"
          alt="KP-Flow"
          className="w-9 h-9 rounded-xl shadow-lg"
        />
      </div>

      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-8">
        {/* Title */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold text-[#1B2B4B] tracking-tight">
            화주 로그인
          </h1>
          <p className="text-gray-400 text-sm mt-1">KP-Flow 화주사 전용 포털</p>
        </div>

        {/* 회사명 */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
            회사명 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="shipper-company"
            autoComplete="off"
            placeholder="회사명을 입력하세요"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B4B]/30 focus:border-[#1B2B4B] transition"
          />
        </div>

        {/* 이메일 */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
            이메일
          </label>
          <input
            type="email"
            name="shipper-email"
            autoComplete="off"
            placeholder="이메일 주소"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B4B]/30 focus:border-[#1B2B4B] transition"
          />
        </div>

        {/* 비밀번호 */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
            비밀번호
          </label>
          <input
            type="password"
            name="shipper-password"
            autoComplete="new-password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B4B]/30 focus:border-[#1B2B4B] transition"
          />
        </div>

        {/* Checkboxes */}
        <div className="flex justify-between text-sm mb-5">
          <label className="flex items-center gap-1.5 cursor-pointer text-gray-600">
            <input
              type="checkbox"
              checked={rememberId}
              onChange={(e) => setRememberId(e.target.checked)}
              className="accent-[#1B2B4B]"
            />
            아이디 저장
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-gray-600">
            <input
              type="checkbox"
              checked={autoLogin}
              onChange={(e) => setAutoLogin(e.target.checked)}
              className="accent-[#1B2B4B]"
            />
            자동 로그인
          </label>
        </div>

        {/* Error / Success messages */}
        {error && (
          <p className="text-red-500 text-sm mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        {msg && (
          <p className="text-green-600 text-sm mb-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            {msg}
          </p>
        )}

        {/* Login button */}
        <button
          onClick={login}
          disabled={loading}
          className="w-full bg-[#1B2B4B] hover:bg-[#243a63] text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-60 mb-3"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : null}
          화주 로그인
        </button>

        {/* Password reset */}
        {!loading && (
          <div className="text-center mb-4">
            <button
              onClick={resetPw}
              className="text-xs text-gray-400 hover:text-gray-600 underline transition"
            >
              비밀번호 찾기
            </button>
          </div>
        )}

        <div className="border-t border-gray-100 my-4" />

        {/* Bottom links */}
        <div className="flex justify-center gap-6 text-sm">
          <Link
            to="/shipper-signup"
            className="text-[#1B2B4B] font-medium hover:underline transition"
          >
            화주 회원가입
          </Link>
          <Link
            to="/login"
            className="text-gray-400 hover:text-gray-600 transition"
          >
            다른 유형으로 로그인
          </Link>
        </div>
      </div>

      {/* Login success popup */}
      {showPopup && (
        <div className="fixed inset-0 bg-black/40 z-[999] flex items-center justify-center">
          <div className="bg-white w-[320px] rounded-2xl shadow-xl p-6 text-center">
            <div className="text-lg font-bold mb-3">로그인 완료</div>

            <div className="text-sm text-gray-500 mb-1">로그인 일시</div>
            <div className="text-sm font-semibold mb-2">{loginTime}</div>

            <div className="text-sm text-gray-500 mb-1">아이디</div>
            <div className="text-sm font-semibold mb-4">{email}</div>

            {/* SVG circular countdown */}
            <div className="relative w-20 h-20 mx-auto mb-4">
              <svg className="w-20 h-20 -rotate-90">
                <circle cx="40" cy="40" r="34" stroke="#e5e7eb" strokeWidth="6" fill="none" />
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

            <div className="text-xs text-gray-400 mb-4">오늘도 좋은 하루 되세요</div>

            <button
              onClick={() => {
                sessionStorage.removeItem("skipLoginPopup");
                navigate("/shipper", { replace: true });
              }}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
