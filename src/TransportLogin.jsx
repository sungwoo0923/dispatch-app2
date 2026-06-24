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
  const [showCodeLookup, setShowCodeLookup] = useState(false);
  const [codeLookupQ, setCodeLookupQ] = useState("");
  const [codeResults, setCodeResults] = useState([]);
  const [codeSearching, setCodeSearching] = useState(false);
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

  const searchCompanyCode = async () => {
    const q2 = codeLookupQ.trim().toLowerCase();
    if (!q2) return;
    setCodeSearching(true);
    try {
      const snap = await getDocs(collection(db, "transportApplications"));
      const all = snap.docs.map(d => d.data()).filter(d => d.status === "approved" && d.companyCode);
      const filtered = all.filter(d => (d.companyName || "").toLowerCase().includes(q2));
      const unique = Object.values(
        filtered.reduce((acc, r) => {
          acc[r.companyName] = { companyName: r.companyName, companyCode: r.companyCode };
          return acc;
        }, {})
      );
      setCodeResults(unique);
    } catch {
      setCodeResults([]);
    } finally {
      setCodeSearching(false);
    }
  };

  const login = async () => {
    setError(null);
    setMsg(null);

    if (!companyCode.trim()) return setError("회사코드는 필수 항목입니다. 승인 안내 이메일을 확인해주세요.");
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
      } else {
        // totalMaster: loginCompany를 반드시 갱신해야 헤더에 올바른 회사명이 표시됨
        localStorage.setItem("loginCompany", inputCompanyName);
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
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                회사코드 <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => { setShowCodeLookup(true); setCodeLookupQ(""); setCodeResults([]); }}
                className="text-[11px] text-[#1B2B4B] font-semibold hover:underline"
              >
                회사코드 찾기
              </button>
            </div>
            <input
              type="text"
              placeholder="승인 후 발급된 코드 입력 (필수)"
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
        <div className="fixed inset-0 bg-black/50 z-[999] flex items-center justify-center">
          <div className="w-[340px] rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div style={{ background: "#1B2B4B", padding: "22px 28px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginBottom: 6 }}>LOGIN COMPLETE</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>로그인 완료</div>
            </div>
            {/* Body */}
            <div style={{ background: "#fff", padding: "24px 28px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f0f2f5", paddingBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.04em" }}>로그인 일시</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1B2B4B" }}>{loginTime}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.04em" }}>아이디</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1B2B4B" }}>{email}</span>
                </div>
              </div>

              {/* SVG circular countdown */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <div style={{ position: "relative", width: 72, height: 72 }}>
                  <svg width="72" height="72" style={{ transform: "rotate(-90deg)" }}>
                    <circle cx="36" cy="36" r="30" stroke="#e5e7eb" strokeWidth="5" fill="none" />
                    <circle
                      cx="36" cy="36" r="30"
                      stroke="#1B2B4B"
                      strokeWidth="5"
                      fill="none"
                      strokeDasharray={2 * Math.PI * 30}
                      strokeDashoffset={(2 * Math.PI * 30 * countdown) / 3}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dashoffset 1s linear" }}
                    />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "#1B2B4B" }}>
                    {countdown}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: "center", fontSize: 12, color: "#9ca3af", marginBottom: 18 }}>오늘도 좋은 하루 되세요</div>

              <button
                onClick={() => { sessionStorage.removeItem("skipLoginPopup"); navigate("/app", { replace: true }); }}
                style={{ width: "100%", background: "#1B2B4B", color: "#fff", padding: "13px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em" }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 회사코드 찾기 모달 */}
      {showCodeLookup && (
        <div className="fixed inset-0 bg-black/50 z-[999] flex items-center justify-center"
          onClick={() => setShowCodeLookup(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-[15px]">회사코드 찾기</h3>
                <p className="text-white/60 text-[12px] mt-0.5">회사명으로 코드를 검색합니다</p>
              </div>
              <button onClick={() => setShowCodeLookup(false)} className="text-white/60 hover:text-white text-lg">✕</button>
            </div>
            <div className="p-5">
              <div className="flex gap-2 mb-4">
                <input
                  autoFocus
                  value={codeLookupQ}
                  onChange={e => setCodeLookupQ(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") searchCompanyCode(); }}
                  placeholder="회사명을 입력하세요"
                  className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#1B2B4B] transition"
                />
                <button
                  onClick={searchCompanyCode}
                  disabled={codeSearching || !codeLookupQ.trim()}
                  className="px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50 transition"
                  style={{ background: "#1B2B4B" }}
                >
                  {codeSearching ? "검색 중..." : "검색"}
                </button>
              </div>
              {codeResults.length > 0 ? (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  {codeResults.map(r => (
                    <div key={r.companyName} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-b-0 hover:bg-blue-50/30">
                      <div>
                        <div className="text-[13px] font-semibold text-gray-800">{r.companyName}</div>
                        <div className="text-[12px] font-mono text-[#1B2B4B] font-bold">{r.companyCode}</div>
                      </div>
                      <button
                        onClick={() => {
                          setCompanyCode(r.companyCode);
                          setCompanyName(r.companyName);
                          setShowCodeLookup(false);
                        }}
                        className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[#1B2B4B] border border-[#1B2B4B]/30 hover:bg-[#1B2B4B]/10 transition"
                      >
                        선택
                      </button>
                    </div>
                  ))}
                </div>
              ) : codeLookupQ && !codeSearching ? (
                <div className="text-center py-6 text-[13px] text-gray-400">검색 결과가 없습니다</div>
              ) : null}
              <p className="text-[11px] text-gray-400 mt-4 text-center">
                코드를 찾지 못하면 관리자에게 문의하세요
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
