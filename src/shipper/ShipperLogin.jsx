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

const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";

export default function ShipperLogin() {
  const [companyCode, setCompanyCode] = useState(
    () => localStorage.getItem("shipperCode") || ""
  );
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

    const isTotalMasterAttempt = email.trim() === TOTAL_MASTER_EMAIL;

    // totalMaster: only need email + password
    if (!isTotalMasterAttempt) {
      if (!companyCode.trim()) return setError("회사코드를 입력해주세요.");
      if (!companyName.trim()) return setError("회사명을 입력해주세요.");
    }
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
      const isTotalMaster = credential.user.email === TOTAL_MASTER_EMAIL || userData.role === "totalMaster";

      // totalMaster: bypass all validation
      if (!isTotalMaster) {
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

        if ((userData.companyCode || "") !== companyCode.trim()) {
          sessionStorage.removeItem("shipperValidating");
          await signOut(auth);
          setError("회사코드가 일치하지 않습니다");
          return;
        }
      }

      // All checks passed
      if (!isTotalMaster) {
        localStorage.setItem("shipperCode", companyCode.trim());
        localStorage.setItem("shipperCompany", companyName.trim());
        localStorage.setItem("loginCompany", companyName.trim());
      }

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
      // 비밀번호는 통과했는데 그 뒤 확인 단계에서 실패한 경우 — 반쯤 로그인된 상태로 남지 않게
      if (!String(code || "").startsWith("auth/")) signOut(auth).catch(() => {});
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("비밀번호가 일치하지 않습니다");
      } else if (code === "auth/user-not-found") {
        setError("등록된 이메일이 없습니다");
      } else if (code === "auth/too-many-requests") {
        setError("로그인 시도가 너무 많아 잠시 잠겼습니다. 몇 분 뒤 다시 시도하거나 '비밀번호 찾기'로 재설정해주세요.");
      } else if (code === "auth/network-request-failed") {
        setError("인터넷 연결이 불안정해 로그인하지 못했습니다. 잠시 후 다시 시도해주세요.");
      } else if (code === "auth/user-disabled") {
        setError("사용이 중지된 계정입니다. 관리자에게 문의하세요.");
      } else if (code === "auth/invalid-email") {
        setError("이메일 형식이 올바르지 않습니다.");
      } else if (code === "permission-denied") {
        setError("계정 정보를 읽을 권한이 없습니다. 관리자에게 문의하세요. (permission-denied)");
      } else {
        // ⭐ 원인 파악용으로 오류 코드를 같이 보여준다(운송사 로그인과 동일)
        console.error("[화주 로그인 실패]", err);
        setError(`로그인에 실패했습니다. (${code || err?.message || "unknown"})`);
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

  const isTotalMasterInput = email.trim() === TOTAL_MASTER_EMAIL;

  // ⭐ 2026-10-29 리디자인 — 운송사 로그인(TransportLogin)과 같은 화면 구성
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const pad = (n) => String(n).padStart(2, "0");
  const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
  const fieldIcon = {
    code: <><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
    company: <><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1" /></>,
    email: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    pw: <><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14 9l2 2" /></>,
  };
  const field = (key, label, input) => (
    <div className="mb-3.5">
      <label className="block mb-1.5 text-[11.5px] font-extrabold tracking-[0.12em] text-[#7A879C]">{label}</label>
      <div className="group flex items-center gap-2.5 h-[50px] px-4 rounded-[14px] bg-[#F5F7FB] border border-[#E3E8F0] transition focus-within:bg-white focus-within:border-[#2D4C82] focus-within:shadow-[0_0_0_4px_rgba(45,76,130,0.10)]">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="text-[#9AA9C3] group-focus-within:text-[#1B2B4B] shrink-0">{fieldIcon[key]}</svg>
        {input}
      </div>
    </div>
  );
  const inputCls = "flex-1 min-w-0 bg-transparent outline-none text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#B4BFD0] placeholder:font-medium";
  const Check = ({ checked, onChange, label }) => (
    <label className="flex items-center gap-2 cursor-pointer select-none text-[13.5px] font-bold text-[#3A4A66]">
      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[12px] transition ${checked ? "bg-[#1B2B4B] text-white" : "border-2 border-[#C9D2E0] bg-white"}`}>{checked ? "✓" : ""}</span>
      <input type="checkbox" className="hidden" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );

  return (
    <>
    <style>{`
      @keyframes kpLoginIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
      @keyframes kpPulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
      .kp-login-in { animation: kpLoginIn .5s cubic-bezier(.2,.8,.2,1) both; }
      .kp-pulse { animation: kpPulse 1.6s ease-in-out infinite; }
    `}</style>
    <div className="min-h-screen w-full flex items-stretch bg-[#F2F4F8]">
      {/* 왼쪽 — 브랜드 패널(PC) */}
      <div className="hidden lg:flex relative flex-col justify-between w-[46%] max-w-[720px] overflow-hidden px-14 py-12 text-white"
        style={{ background: "linear-gradient(150deg, #060E1F 0%, #0F1A30 45%, #1B2B4B 100%)" }}>
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
        <div className="absolute -right-40 -top-40 w-[520px] h-[520px] rounded-full" style={{ background: "radial-gradient(circle, rgba(110,149,232,0.22), transparent 65%)" }} />
        <div className="relative flex items-center gap-3">
          <img src="/icons/sflow-icon.png" alt="" className="w-11 h-11 rounded-[13px] ring-1 ring-white/20" />
          <div>
            <div className="text-[18px] font-black tracking-[0.18em]">KP-FLOW</div>
            <div className="text-[10.5px] font-bold tracking-[0.3em] text-white/45">SHIPPER PORTAL</div>
          </div>
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 text-[11.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#6E95E8] kp-pulse" /> SYSTEM ONLINE
          </div>
          <div className="mt-4 font-black leading-none tabular-nums" style={{ fontSize: 88, letterSpacing: "-0.02em", fontFamily: MONO }}>
            {pad(now.getHours())}<span className="kp-pulse text-white/40">:</span>{pad(now.getMinutes())}
            <span className="text-[30px] text-white/35 ml-2">{pad(now.getSeconds())}</span>
          </div>
          <div className="mt-3 text-[15px] font-semibold text-white/60">
            {now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          </div>
          <div className="mt-10 text-[30px] font-black leading-snug tracking-tight">배차 요청부터 정산까지<br />실시간으로 확인하세요.</div>
          <div className="mt-3 text-[14px] text-white/50 leading-relaxed">오더 요청 · 배차 현황 · 기사 정보 · 정산을<br />화주사 전용 화면에서 한 번에.</div>
        </div>
        <div className="relative flex items-center gap-6 text-[11px] font-bold tracking-[0.2em] text-white/35">
          <span>SECURE · TLS</span><span>REAL-TIME SYNC</span><span>© KP-FLOW</span>
        </div>
      </div>

      {/* 오른쪽 — 로그인 폼 */}
      <div className="flex-1 min-w-0 flex items-center justify-center px-4 py-10 relative">
        <div className="kp-login-in w-full max-w-[420px]">
          <div className="lg:hidden flex flex-col items-center mb-7">
            <img src="/icons/sflow-icon.png" alt="" className="w-16 h-16 rounded-[18px] shadow-[0_10px_24px_rgba(15,26,48,0.25)]" />
            <div className="mt-3 text-[20px] font-black tracking-[0.18em] text-[#0F1A30]">KP-FLOW</div>
            <div className="text-[10.5px] font-bold tracking-[0.3em] text-[#9AA9C3]">SHIPPER PORTAL</div>
          </div>

          <div className="bg-white rounded-[26px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_24px_60px_rgba(15,26,48,0.10)] px-7 sm:px-10 pt-9 pb-8">
            <div className="text-[11.5px] font-extrabold tracking-[0.28em] text-[#4B6CB7]">SHIPPER SIGN IN</div>
            <h1 className="mt-1 text-[26px] font-black text-[#0F1A30] tracking-tight">화주사 로그인</h1>
            <p className="text-[13.5px] text-[#7A879C] mt-1 mb-7">승인 후 발급된 회사코드로 로그인하세요</p>

            {!isTotalMasterInput && field("code", "회사코드", (
              <input type="text" name="shipper-code" autoComplete="off" placeholder="승인 후 발급된 코드" value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} onKeyDown={handleKeyDown} className={`${inputCls} ${companyCode ? "tracking-[0.12em] font-mono" : ""}`} />
            ))}
            {!isTotalMasterInput && field("company", "회사명", (
              <input type="text" name="shipper-company" autoComplete="off" placeholder="가입한 회사명" value={companyName} onChange={(e) => setCompanyName(e.target.value)} onKeyDown={handleKeyDown} className={inputCls} />
            ))}
            {field("email", "이메일", (
              <input type="email" name="shipper-email" autoComplete="off" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={handleKeyDown} className={inputCls} />
            ))}
            {field("pw", "비밀번호", (
              <input type="password" name="shipper-password" autoComplete="new-password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKeyDown} className={inputCls} />
            ))}

            <div className="flex items-center justify-between mt-4 mb-5">
              <Check checked={rememberId} onChange={setRememberId} label="아이디 저장" />
              <Check checked={autoLogin} onChange={setAutoLogin} label="자동 로그인" />
            </div>

            {error && (
              <div className="flex gap-2 text-[13px] font-semibold text-[#0F1A30] mb-4 bg-[#F2F6FC] border border-[#D9E3F3] rounded-xl px-3.5 py-2.5">
                <span className="text-[#1B2B4B] font-black">!</span><span>{error}</span>
              </div>
            )}
            {msg && (
              <div className="text-[13px] font-semibold text-[#0F1A30] mb-4 bg-[#F2F6FC] border border-[#D9E3F3] rounded-xl px-3.5 py-2.5">{msg}</div>
            )}

            <button onClick={login} disabled={loading}
              className="w-full h-[54px] rounded-[15px] text-white text-[15.5px] font-black tracking-[0.04em] flex items-center justify-center gap-2 shadow-[0_14px_28px_rgba(15,26,48,0.28)] hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60"
              style={{ background: "linear-gradient(120deg, #0F1A30 0%, #1B2B4B 55%, #2D4C82 100%)" }}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {loading ? "확인 중…" : "로그인"}
              {!loading && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
            </button>

            {!loading && (
              <div className="text-center mt-3.5">
                <button onClick={resetPw} className="text-[12.5px] font-bold text-[#9AA9C3] hover:text-[#0F1A30] transition">비밀번호를 잊으셨나요?</button>
              </div>
            )}

            <div className="flex items-center gap-3 my-6"><span className="flex-1 h-px bg-[#EEF1F6]" /><span className="text-[11px] font-bold tracking-[0.2em] text-[#C2CBD9]">OR</span><span className="flex-1 h-px bg-[#EEF1F6]" /></div>

            <div className="grid grid-cols-2 gap-2.5">
              <Link to="/shipper-signup" className="h-11 rounded-xl border border-[#0F1A30] text-[#0F1A30] text-[13.5px] font-black flex items-center justify-center hover:bg-[#0F1A30] hover:text-white transition">화주사 회원가입</Link>
              <Link to="/login" className="h-11 rounded-xl border border-[#E3E8F0] text-[#5B6B85] text-[13.5px] font-bold flex items-center justify-center hover:bg-[#F5F7FB] transition">다른 유형 로그인</Link>
            </div>
          </div>
          <div className="text-center mt-5 text-[11px] font-bold tracking-[0.2em] text-[#B4BFD0]">KP-FLOW · SHIPPER</div>
        </div>
      </div>

      {/* 로그인 완료 — 디지털 카운트다운 */}
      {showPopup && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center px-4" style={{ background: "rgba(6,14,31,0.72)" }}>
          <div className="kp-login-in relative w-full max-w-[380px] rounded-[28px] overflow-hidden text-white shadow-[0_30px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/10"
            style={{ background: "linear-gradient(160deg, #0B1428 0%, #0F1A30 50%, #1B2B4B 100%)" }}>
            <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
            <div className="relative px-8 pt-8 pb-7">
              <div className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.28em] text-[#8FB0F0]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#6E95E8] kp-pulse" /> AUTHENTICATED
              </div>
              <div className="mt-3 text-[24px] font-black tracking-tight">로그인 완료</div>
              <div className="text-[13px] text-white/55 mt-0.5">{companyName || "KP-FLOW"}</div>
              <div className="mt-7 flex flex-col items-center">
                <div className="relative w-[148px] h-[148px]">
                  <svg width="148" height="148" className="-rotate-90">
                    <circle cx="74" cy="74" r="64" stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
                    <circle cx="74" cy="74" r="64" stroke="url(#kpShipRing)" strokeWidth="6" fill="none" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 64} strokeDashoffset={(2 * Math.PI * 64 * (3 - countdown)) / 3}
                      style={{ transition: "stroke-dashoffset 1s linear" }} />
                    <defs><linearGradient id="kpShipRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8FB0F0" /><stop offset="100%" stopColor="#ffffff" /></linearGradient></defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div key={countdown} className="kp-login-in font-black tabular-nums leading-none" style={{ fontSize: 60, fontFamily: MONO }}>{pad(countdown)}</div>
                    <div className="text-[10px] font-extrabold tracking-[0.3em] text-white/40 mt-1">SEC</div>
                  </div>
                </div>
                <div className="mt-3 text-[12.5px] font-semibold text-white/55">잠시 후 화주사 화면으로 이동합니다</div>
              </div>
              <div className="mt-7 rounded-2xl bg-white/[0.05] ring-1 ring-white/10 divide-y divide-white/10">
                {[["ACCOUNT", email], ["SIGNED IN", loginTime]].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-4 py-3 gap-3">
                    <span className="text-[10.5px] font-extrabold tracking-[0.22em] text-white/40 shrink-0">{k}</span>
                    <span className="text-[13px] font-bold text-white/90 truncate tabular-nums">{v}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => { sessionStorage.removeItem("skipLoginPopup"); navigate("/shipper", { replace: true }); }}
                className="mt-5 w-full h-[50px] rounded-[14px] bg-white text-[#0F1A30] text-[14.5px] font-black tracking-[0.04em] hover:bg-[#EEF3FB] transition">
                바로 시작하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
