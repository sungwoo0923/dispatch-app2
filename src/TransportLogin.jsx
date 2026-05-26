// ======================= src/TransportLogin.jsx =======================
import React, { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";
const DOLCAE_COMPANY = "돌캐";

export default function TransportLogin() {
  const [companyCode, setCompanyCode] = useState(
    () => localStorage.getItem("transportCode") || ""
  );
  const [companyName, setCompanyName] = useState(
    () => localStorage.getItem("loginCompany") || ""
  );
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [loginTime, setLoginTime] = useState("");
  const navigate = useNavigate();

  // 돌캐 회사 코드 자동완성: 저장된 코드 없을 때 Firestore에서 조회
  useEffect(() => {
    if (localStorage.getItem("transportCode")) return;
    const fetchDolcaeCode = async () => {
      try {
        const q = query(
          collection(db, "transportApplications"),
          where("companyName", "==", DOLCAE_COMPANY),
          where("type", "==", "신규"),
          where("status", "==", "approved")
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          if (data.companyCode) {
            setCompanyCode(data.companyCode);
            setCompanyName(DOLCAE_COMPANY);
          }
        }
      } catch (_) {}
    };
    fetchDolcaeCode();
  }, []);

  // Enter key in popup
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

  // Countdown auto-navigate
  useEffect(() => {
    if (!showPopup) return;
    if (countdown === 0) {
      sessionStorage.removeItem("skipLoginPopup");
      navigate("/app", { replace: true });
      return;
    }
    const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, showPopup, navigate]);

  // cleanup: remove semaphore if component unmounts during validation
  useEffect(() => {
    return () => {
      sessionStorage.removeItem("transportValidating");
    };
  }, []);

  const login = async () => {
    setError(null);
    setMsg(null);

    if (!companyName.trim()) return setError("회사명을 입력해주세요.");
    if (!email.trim() || !pw.trim()) return setError("이메일과 비밀번호를 입력해주세요.");

    try {
      setLoading(true);
      // Semaphore set BEFORE auth so App.jsx won't redirect while we validate
      sessionStorage.setItem("transportValidating", "true");

      const credential = await signInWithEmailAndPassword(auth, email.trim(), pw);
      const uid = credential.user.uid;
      const inputEmail = email.trim().toLowerCase();
      const inputCompanyName = companyName.trim();
      const inputCompanyCode = companyCode.trim();

      if (inputEmail !== TOTAL_MASTER_EMAIL) {
        const userSnap = await getDoc(doc(db, "users", uid));

        if (!userSnap.exists()) {
          sessionStorage.removeItem("transportValidating");
          await signOut(auth);
          setError("등록된 계정 정보가 없습니다.");
          return;
        }

        const userData = userSnap.data();

        if ((userData.companyName || "") !== inputCompanyName) {
          sessionStorage.removeItem("transportValidating");
          await signOut(auth);
          setError("회사명이 일치하지 않습니다. 가입한 회사명을 정확히 입력해주세요.");
          return;
        }

        if (userData.userStatus === "banned") {
          sessionStorage.removeItem("transportValidating");
          await signOut(auth);
          setError("영구 정지된 계정입니다. 관리자에게 문의하세요.");
          return;
        }

        if (userData.userStatus === "suspended") {
          sessionStorage.removeItem("transportValidating");
          await signOut(auth);
          setError("사용 정지된 계정입니다. 관리자에게 문의하세요.");
          return;
        }

        if (!userData.approved) {
          sessionStorage.removeItem("transportValidating");
          await signOut(auth);
          setError("관리자 승인 대기 중입니다. 승인 후 로그인이 가능합니다.");
          return;
        }

        if (userData.companyCode) {
          if (!inputCompanyCode) {
            sessionStorage.removeItem("transportValidating");
            await signOut(auth);
            setError("회사코드를 입력해주세요. 코드는 가입 승인 시 이메일로 안내받으셨습니다.");
            return;
          }
          if (userData.companyCode !== inputCompanyCode) {
            sessionStorage.removeItem("transportValidating");
            await signOut(auth);
            setError("회사코드가 일치하지 않습니다. 승인 안내 이메일을 확인해주세요.");
            return;
          }
        }

        localStorage.setItem("loginCompany", inputCompanyName);
        localStorage.setItem("userCompany", inputCompanyName);
      }

      if (inputCompanyCode) {
        localStorage.setItem("transportCode", inputCompanyCode);
      }

      // Validation done — switch from validation semaphore to popup semaphore
      sessionStorage.removeItem("transportValidating");
      sessionStorage.setItem("skipLoginPopup", "true");

      setLoginTime(new Date().toLocaleString("ko-KR"));
      setShowPopup(true);
      setCountdown(3);
    } catch (err) {
      sessionStorage.removeItem("transportValidating");
      const code = err.code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("비밀번호가 일치하지 않습니다.");
      } else if (code === "auth/user-not-found") {
        setError("등록된 이메일이 없습니다.");
      } else {
        setError("로그인에 실패했습니다. 입력 정보를 확인해주세요.");
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
    <div
      className="min-h-screen flex items-center justify-center px-4 relative"
      style={{ background: "linear-gradient(135deg, #061832 0%, #0B2554 50%, #0D2B66 100%)" }}
    >
      {/* Top-right app icon */}
      <div className="fixed top-4 right-4 z-50">
        <img
          src="/icons/sflow-icon.png"
          alt="KP-Flow"
          className="w-20 h-20 rounded-2xl shadow-lg"
        />
      </div>

      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-white/10"
        style={{ background: "rgba(255,255,255,0.97)" }}
      >
        {/* Card header */}
        <div
          className="px-10 pt-8 pb-6 text-center"
          style={{ background: "#1B2B4B" }}
        >
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            S-Flow Logistics
          </h1>
          <p className="text-blue-200 text-sm mt-1">운송사 로그인</p>
        </div>

        {/* Card body */}
        <div className="px-10 py-8">

          {/* 회사코드 */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
              회사코드
            </label>
            <input
              type="text"
              placeholder="승인 후 발급된 코드 입력 (선택)"
              value={companyCode}
              onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B4B]/30 focus:border-[#1B2B4B] transition"
            />
          </div>

          {/* 회사명 */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
              회사명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
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
              이메일 <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
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
              비밀번호 <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              placeholder="비밀번호"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B4B]/30 focus:border-[#1B2B4B] transition"
            />
          </div>

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
            className="w-full text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
            style={{ background: "#1B2B4B" }}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : null}
            로그인
          </button>

          {/* Password reset */}
          {!loading && (
            <div className="text-center mt-3">
              <button
                onClick={resetPw}
                className="text-xs text-gray-400 hover:text-gray-600 underline transition"
              >
                비밀번호 찾기
              </button>
            </div>
          )}

          <div className="border-t border-gray-100 my-5" />

          {/* Bottom links */}
          <div className="flex justify-center gap-6 text-sm">
            <Link
              to="/signup"
              className="text-[#1B2B4B] font-medium hover:underline transition"
            >
              운송사 회원가입
            </Link>
            <Link
              to="/login"
              className="text-gray-400 hover:text-gray-600 transition"
            >
              다른 유형으로 로그인
            </Link>
          </div>
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
              onClick={() => { sessionStorage.removeItem("skipLoginPopup"); navigate("/app", { replace: true }); }}
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
