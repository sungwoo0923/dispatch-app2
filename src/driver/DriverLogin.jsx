// src/driver/DriverLogin.jsx
import React, { useState, useEffect, useRef } from "react";
import { auth, db, FUNCTIONS_BASE } from "../firebase";
import { signInWithCustomToken, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { usePhoneCheck, toE164 } from "../MfaModal"; // 🔒 2026-11-23 휴대폰 문자 인증
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { readPublicCompanies } from "../publicCompanies"; // ⭐ 2026-11-10 소속 운송사명 검색 드롭다운
import BigCheck from "../components/BigCheck";
import { LogisMark, LogisWordmark, LogisTag } from "../brand"; // 🔷 2026-11-04 LogisWeb 로고
import { isPhoneLoginId, isPartialPhone, phoneDigits } from "./driverEmail"; // ⭐ 2026-11-11 휴대폰번호 로그인
import { isDriverAppContext, peekDriverAppOnlyKick, clearDriverAppOnlyKick, DRIVER_APP_ONLY_ERROR, isNativeApk, setApkStaffMode } from "./driverAppContext"; // ⭐ 2026-11-08 기사앱은 기사 계정만
import { checkDriverUserDoc, describeDriverLoginError, driverLoginError, keepDriverLoginError, takeDriverLoginError, setDriverBusy } from "./driverLoginErrors"; // ⭐ 2026-11-05 실패 사유 안내

// ⭐ 사용자 요청 — 한 번 로그인한 폰에서는 소속회사명/차량번호/이름을 기억하고(정보 저장),
// "자동 로그인"을 켜두면 로그인 화면에 들어오는 순간 저장된 정보로 바로 로그인한다.
// 단, 기사님이 직접 "로그아웃"을 누른 직후에는 자동 로그인하지 않는다(다시 들어가버리는 것 방지).
const SAVED_KEY = "driverLoginSaved";
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "null"); } catch { return null; }
}

// ⭐ 2026-11-05 실패 종류 표시(네이비 원 + 기호) — 승인 대기는 모래시계, 연결 문제는 신호, 나머지는 느낌표
function ErrBadge({ tone, size = 34, dark = false }) {
  const sym = tone === "wait" ? "⌛" : tone === "net" ? "⟳" : tone === "stop" ? "■" : "!";
  return (
    <span className={`shrink-0 rounded-full grid place-items-center font-black ${dark ? "bg-white/12 text-[#8FB0F0] border border-white/20" : "bg-[#1B2B4B] text-white"}`}
      style={{ width: size, height: size, fontSize: Math.round(size * (sym === "■" ? 0.34 : 0.5)) }}>{sym}</span>
  );
}

export default function DriverLogin() {
  const saved = loadSaved();
  const keep = saved && saved.remember !== false;
  const [companyNameState, setCompanyName] = useState(keep ? saved.companyName || "" : "");
  const [carNoState, setCarNo] = useState(keep ? saved.loginId || saved.carNo || saved.phone || "" : ""); // ⭐ 2026-11-11 휴대폰번호 또는 차량번호
  const [nameState, setName] = useState(keep ? saved.name || "" : "");
  // ⭐ 2026-11-10 소속 운송사명 — 가입 화면처럼 입력하면 공개 운송사 목록에서 찾아 고른다(목록에 없어도 입력값 그대로 로그인 가능)
  const [coList, setCoList] = useState([]);
  const [coOpen, setCoOpen] = useState(false);
  useEffect(() => { readPublicCompanies().then(setCoList).catch(() => {}); }, []);
  const coNorm = (v) => String(v || "").replace(/\s+/g, "").toLowerCase();
  const coKey = coNorm(companyNameState);
  // ⭐ 2026-11-10 이름을 끝까지 똑같이 쳐도 목록에 남긴다(예전엔 정확히 같으면 빠져서 "태진"을 다 치면 드롭다운이 사라졌다) — 같은 이름은 맨 위 + ✓ 표시
  const coMatches = coKey ? coList.filter((c) => coNorm(c.companyName).includes(coKey))
    .sort((a, b) => (coNorm(b.companyName) === coKey) - (coNorm(a.companyName) === coKey) || coNorm(b.companyName).startsWith(coKey) - coNorm(a.companyName).startsWith(coKey) || a.companyName.localeCompare(b.companyName, "ko")).slice(0, 6) : [];
  const [rememberInfo, setRememberInfo] = useState(saved ? saved.remember !== false : true);
  const [autoLogin, setAutoLogin] = useState(saved ? saved.autoLogin === true : false);
  // ⭐ 2026-11-05 실패 안내 — { title, message, hint, tone }. 화면이 다시 그려져도 남도록 sessionStorage에도 둔다
  //  기사앱 안에서 사무실 계정이 로그아웃된 경우(App.jsx)엔 "기사 전용 앱이에요" 안내를 띄운다(새로고침돼도 2분 동안 남음)
  const [error, setErrorState] = useState(() => takeDriverLoginError() || peekDriverAppOnlyKick());
  const [errorPopup, setErrorPopupState] = useState(() => !!error);
  const setErrorPopup = (v) => { if (!v) clearDriverAppOnlyKick(); setErrorPopupState(v); };
  const setError = (info) => { clearDriverAppOnlyKick(); setErrorState(info || null); setErrorPopupState(!!info); keepDriverLoginError(info || null); };
  const driverApp = isDriverAppContext();
  const [loggingIn, setLoggingIn] = useState(false);
  const busyRef = useRef(false);
  // 🔒 2026-11-23 휴대폰 문자 인증 창 — askSms(번호) 가 인증 토큰을 돌려준다(취소하면 driver/sms-cancel)
  const smsHolderRef = useRef(null);
  const { send: smsSend, confirm: smsConfirm } = usePhoneCheck(smsHolderRef);
  const [smsAsk, setSmsAsk] = useState(null); // { phone, code, step: "phone" | "code", msg, busy }
  const smsWaitRef = useRef(null);
  const askSms = (phone) => new Promise((resolve, reject) => {
    smsWaitRef.current = { resolve, reject };
    setSmsAsk({ phone: phone ? String(phone).replace(/\D/g, "").replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3") : "", code: "", step: "phone", msg: "", busy: false });
  });
  const smsCancel = () => { const w = smsWaitRef.current; smsWaitRef.current = null; setSmsAsk(null); w?.reject(driverLoginError("driver/sms-cancel")); };
  const smsErrText = (e) => {
    const c = String(e?.code || "");
    if (c === "auth/invalid-verification-code") return "인증번호가 맞지 않아요.";
    if (c === "auth/code-expired") return "인증번호 시간이 지났어요. 다시 받아 주세요.";
    if (c === "auth/too-many-requests") return "문자를 너무 많이 요청했어요. 잠시 뒤 다시 해 주세요.";
    if (c === "auth/invalid-phone-number") return "휴대폰번호를 확인해 주세요.";
    return "문자 인증을 하지 못했어요. 잠시 뒤 다시 해 주세요.";
  };
  const smsSendCode = async () => {
    const e164 = toE164(smsAsk?.phone || "");
    if (!/^\+8210\d{7,8}$/.test(e164)) { setSmsAsk((x) => ({ ...x, msg: "010으로 시작하는 휴대폰번호를 끝까지 넣어 주세요." })); return; }
    setSmsAsk((x) => ({ ...x, busy: true, msg: "" }));
    try { await smsSend(e164); setSmsAsk((x) => ({ ...x, busy: false, step: "code", code: "", msg: "인증번호를 보냈어요. 문자로 받은 6자리를 넣어 주세요." })); }
    catch (e) { setSmsAsk((x) => ({ ...x, busy: false, msg: smsErrText(e) })); }
  };
  const smsCheck = async () => {
    setSmsAsk((x) => ({ ...x, busy: true, msg: "" }));
    try { const tok = await smsConfirm(String(smsAsk?.code || "").trim()); const w = smsWaitRef.current; smsWaitRef.current = null; setSmsAsk(null); w?.resolve(tok); }
    catch (e) { setSmsAsk((x) => ({ ...x, busy: false, msg: smsErrText(e) })); }
  };
  const restoredErrRef = useRef(!!error); // 재마운트 전에 떠 있던 실패 안내가 있었는지
  const navigate = useNavigate();

  // 페이지 진입 시 무조건 초기화 → 자동 로그인 설정이면 저장된 정보로 바로 로그인
  useEffect(() => {
    (async () => {
      // ⭐ 2026-11-05 다른 화면이 로그인 확인 중 표시를 남겨둔 채 끝났으면 지운다
      setDriverBusy(false);
      await signOut(auth).catch(() => {});
      localStorage.removeItem("role");
      localStorage.removeItem("uid");
      const justLoggedOut = sessionStorage.getItem("driverJustLoggedOut") === "1";
      sessionStorage.removeItem("driverJustLoggedOut");
      const sv = loadSaved();
      // 방금 실패 안내가 떠 있으면 자동 로그인으로 다시 시도하지 않는다(같은 실패가 반복되며 안내가 사라짐)
      // 🔒 2026-11-23 로그인은 문자 인증이라 저절로 하지 않는다(로그인해 둔 휴대폰은 앱을 열면 그대로 들어간다)
      void justLoggedOut; void sv;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⭐ 2026-11-05 로그인 확인 — 실패 이유를 코드로 나눠 던지고, 마지막 catch에서 한 번에 안내한다.
  //  [원인] 예전엔 signInDriver가 로그인에 성공하는 순간 App.jsx가 users 문서(role:"driver", approved)를 받아
  //  /driver-login → /driver-home 으로 먼저 이동시켰다. 그 뒤 이 화면이 이름·회사가 다르다며 로그아웃하면
  //  /driver-home이 다시 /driver-login으로 돌려보내 이 화면이 새로 그려졌고(error 상태 초기화 + 진입 시 로그아웃),
  //  기사님 눈에는 "새로고침되고 아무 안내 없이 로그인 화면"으로 보였다. 확인 중에는 App이 이동하지 않도록
  //  setDriverBusy(true)로 알리고, 안내는 sessionStorage에도 남겨 재마운트돼도 보이게 한다.
  const login = async (override) => {
    // override: 자동 로그인 시 저장된 값(아직 state 반영 전일 수 있어 직접 받는다)
    const companyName = String(override?.companyName ?? companyNameState).trim();
    const name = String(override?.name ?? nameState).trim();
    // ⭐ 2026-11-11 휴대폰번호(전체) 또는 차량번호 — 한 칸에 어느 쪽을 넣어도 된다.
    //  자동 로그인은 저장된 차량번호로 먼저(빠름), 안 되면 저장된 휴대폰번호로(차량이 바뀐 경우) 한 번 더 확인한다.
    const typed = String(carNoState).trim();
    const ids = override
      ? [...new Set([String(override.carNo || "").trim(), isPhoneLoginId(override.phone) ? phoneDigits(override.phone) : ""].filter(Boolean))]
      : [typed];
    if (busyRef.current) return;
    const ctx = { companyName, carNo: isPhoneLoginId(ids[0]) ? "" : ids[0] || "", phone: isPhoneLoginId(ids[0]) ? phoneDigits(ids[0]) : "", name };
    setError(null);
    const empty = [!companyName && "소속 운송사명", !ids[0] && "휴대폰번호(또는 차량번호)", !name && "이름"].filter(Boolean);
    if (empty.length) {
      setError(describeDriverLoginError(driverLoginError("driver/empty", { field: empty.join(" · ") }), ctx));
      return;
    }
    if (!override && isPartialPhone(typed)) {
      setError(describeDriverLoginError(driverLoginError("driver/phone-incomplete"), ctx));
      return;
    }

    // 한 가지 정보(휴대폰번호 또는 차량번호)로 로그인 확인 — 성공: { uid, carNo, u } / 실패: 사유 코드를 던짐
    // 🔒 2026-11-23 로그인 = 휴대폰 문자 인증 — 예전엔 비밀번호가 차량번호라 차량번호 · 이름 · 운송사만 알면 누구나 로그인했다.
    //  운송사 · 이름 · 휴대폰(또는 차량번호)을 넣으면 휴대폰 인증번호를 받고, 서버(driverSmsLogin)가 운송사에 등록된 그 기사 번호인지 확인해
    //  로그인시킨다. 이미 로그인해 둔 휴대폰은 다시 묻지 않는다(로그아웃하거나 새 휴대폰이면 다시 인증).
    const attempt = async (idRaw) => {
      const usePhone = isPhoneLoginId(idRaw);
      ctx.carNo = usePhone ? "" : idRaw;
      ctx.phone = usePhone ? phoneDigits(idRaw) : "";
      const phoneIdToken = await askSms(usePhone ? phoneDigits(idRaw) : String(loadSaved()?.phone || ""));
      let r;
      try {
        const res = await fetch(`${FUNCTIONS_BASE}/driverSmsLogin`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyName, name, loginId: idRaw, phoneIdToken }),
        });
        if (res.status === 429) throw Object.assign(new Error("too many"), { code: "auth/too-many-requests" });
        r = await res.json().catch(() => null);
        if (!res.ok || !r) throw driverLoginError("driver/network");
      } catch (e) { if (e?.code) throw e; throw driverLoginError("driver/network", { cause: e }); }
      if (!r.ok) {
        const map = { NOT_MATCH: "driver/sms-not-match", PHONE_MISMATCH: "driver/sms-not-match", PENDING: "driver/pending", REJECTED: "driver/rejected", RETIRED: "driver/retired", SMS_REQUIRED: "driver/sms-required" };
        if (r.code === "DISABLED") throw Object.assign(new Error("disabled"), { code: "auth/user-disabled" });
        throw driverLoginError(map[r.code] || "driver/sms-not-match");
      }
      const cred = r.token ? await signInWithCustomToken(auth, r.token) : await signInWithEmailAndPassword(auth, r.email, r.password);
      const uid = cred.user.uid;
      const snap = await getDoc(doc(db, "users", uid));
      const u = snap.exists() ? snap.data() : null;
      const bad = checkDriverUserDoc(u, { name, companyName });
      if (bad) throw driverLoginError(bad, { reason: u?.rejectReason || u?.rejectedReason || u?.거절사유 || "" });
      return { uid, carNo: String(u?.carNo || ctx.carNo || ""), u };
    };

    busyRef.current = true;
    setLoggingIn(true);
    setDriverBusy(true);
    let ok = false;
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw driverLoginError("driver/network");
      // 계정 상태(승인 대기·정지 등)나 연결 문제로 막힌 것이면 다른 정보로 다시 시도하지 않는다
      const STOP = ["driver/network", "auth/network-request-failed", "auth/too-many-requests", "auth/user-disabled", "driver/pending", "driver/rejected", "driver/retired", "driver/suspended", "driver/use-register"];
      let done = null;
      let lastErr = null;
      for (const id of ids.slice(0, 1)) { // 🔒 문자 인증은 한 번만
        try { done = await attempt(id); break; } catch (e) {
          lastErr = e;
          await signOut(auth).catch(() => {});
          if (STOP.includes(e?.code)) break;
        }
      }
      if (!done) throw lastErr;
      const { uid, u } = done;

      localStorage.setItem("role", "driver");
      localStorage.setItem("uid", uid);
      try { localStorage.setItem("driverLoginV2", "1"); } catch { /* 무시 */ } // ⭐ 2026-11-11 새 로그인 방식으로 로그인함(DriverHome이 다시 묻지 않음)
      try {
        const remember = override ? true : rememberInfo;
        const auto = override ? true : autoLogin;
        // 지금 차량번호 · 휴대폰번호를 같이 저장 — 다음 자동 로그인 때 차량이 바뀌어 있어도 휴대폰번호로 이어진다
        const carNo = String(u?.carNo || done.carNo || "").trim();
        const phone = isPhoneLoginId(u?.phone) ? phoneDigits(u.phone) : (ctx.phone || (isPhoneLoginId(override?.phone) ? phoneDigits(override.phone) : ""));
        const loginId = override ? (override.loginId || override.carNo || "") : typed;
        localStorage.setItem(SAVED_KEY, JSON.stringify(remember
          ? { remember: true, autoLogin: auto, companyName, carNo, name, phone, loginId: isPhoneLoginId(loginId) ? loginId : carNo || loginId }
          : { remember: false, autoLogin: false }));
      } catch { /* 저장 실패 무시 */ }
      ok = true;
      // ⭐ 2026-11-05 확인 끝 — App이 /driver-home을 그리도록 표시를 내리고 바로 이동(App이 역할을 받기 전이면 잠깐 로딩 화면)
      setDriverBusy(false);
      navigate("/driver-home", { replace: true });
    } catch (err) {
      if (err?.code === "driver/sms-cancel") { await signOut(auth).catch(() => {}); return; } // 문자 인증 창을 닫음 — 안내 없이
      console.error("[기사 로그인 실패]", err?.code || "", err);
      // ⭐ 2026-11-08 기사앱 안에서는 기사 아닌 계정 안내를 "기사 전용 앱"으로
      setError(driverApp && err?.code === "driver/not-driver" ? { ...DRIVER_APP_ONLY_ERROR } : describeDriverLoginError(err, ctx));
      await signOut(auth).catch(() => {});
    } finally {
      if (!ok) setDriverBusy(false);
      busyRef.current = false;
      setLoggingIn(false);
    }
  };

  // ⭐ 2026-10-29 리디자인 — 운송사 로그인(TransportLogin)과 같은 화면 구성(왼쪽 디지털 브랜드 패널 + 오른쪽 로그인 카드)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const pad = (n) => String(n).padStart(2, "0");
  const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
  const fieldIcon = {
    company: <><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1" /></>,
    car: <><rect x="1" y="6" width="13" height="10" rx="1.5" /><path d="M14 9h4l3 3.5V16h-7z" /><circle cx="5.5" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></>,
    name: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  };
  const field = (key, label, input) => (
    <div className="mb-3">
      <label className="block mb-1.5 text-[15.5px] font-black text-[#3A4A66]">{label}</label>
      <div className="group flex items-center gap-2.5 h-[54px] px-3.5 rounded-2xl bg-[#F5F7FB] border border-[#E3E8F0] transition focus-within:bg-white focus-within:border-[#2D4C82] focus-within:shadow-[0_0_0_4px_rgba(45,76,130,0.10)]">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="text-[#9AA9C3] group-focus-within:text-[#1B2B4B] shrink-0">{fieldIcon[key]}</svg>
        {input}
      </div>
    </div>
  );
  const inputCls = "flex-1 min-w-0 bg-transparent outline-none text-[18px] font-bold text-[#0F1A30] placeholder:text-[#B4BFD0] placeholder:font-medium";

  return (
    <>
    <style>{`
      @keyframes kpLoginIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
      @keyframes kpPulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
      .kp-login-in { animation: kpLoginIn .5s cubic-bezier(.2,.8,.2,1) both; }
      .kp-pulse { animation: kpPulse 1.6s ease-in-out infinite; }
    `}</style>
    <div data-kp-spot="loginForm" className="min-h-screen w-full flex items-stretch bg-[#F2F4F8]">
      {/* 왼쪽 — 브랜드 패널(PC) */}
      <div data-kp-spot="loginPanel" className="hidden lg:flex relative flex-col justify-between w-[46%] max-w-[720px] overflow-hidden px-14 py-12 text-white"
        style={{ background: "linear-gradient(150deg, #060E1F 0%, #0F1A30 45%, #1B2B4B 100%)" }}>
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
        <div className="absolute -right-40 -top-40 w-[520px] h-[520px] rounded-full" style={{ background: "radial-gradient(circle, rgba(110,149,232,0.22), transparent 65%)" }} />
        <div className="relative flex items-center gap-3">
          <LogisMark size={46} spot="loginPanel" />
          <div>
            <div className="mb-2"><LogisWordmark height={16} spot="loginPanel" /></div>
            <div className="text-[13.5px] font-bold tracking-[0.3em] text-white/45">DRIVER APP</div>
          </div>
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 text-[13.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#6E95E8] kp-pulse" /> SYSTEM ONLINE
          </div>
          <div className="mt-4 font-black leading-none tabular-nums" style={{ fontSize: 88, letterSpacing: "-0.02em", fontFamily: MONO }}>
            {pad(now.getHours())}<span className="kp-pulse text-white/40">:</span>{pad(now.getMinutes())}
            <span className="text-[30px] text-white/35 ml-2">{pad(now.getSeconds())}</span>
          </div>
          <div className="mt-3 text-[17px] font-semibold text-white/60">
            {now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          </div>
          <div className="mt-10 text-[30px] font-black leading-snug tracking-tight">버튼 하나로<br />운행이 기록됩니다.</div>
          <div className="mt-3 text-[16.5px] text-white/50 leading-relaxed">출근 · 상차 · 하차 · 인수증까지<br />기사님 업무를 한 화면에서 처리합니다.</div>
        </div>
        <div className="relative flex items-center gap-6 text-[13.5px] font-bold tracking-[0.2em] text-white/35">
          <span>SECURE · TLS</span><span>GPS LIVE</span><span>© LogisWeb</span>
        </div>
      </div>

      {/* 오른쪽 — 로그인 폼 */}
      <div className="flex-1 min-w-0 flex items-center justify-center px-4 py-6 sm:py-10 relative">
        <div className="kp-login-in w-full max-w-[420px]">
          {/* 모바일 머리 */}
          <div className="lg:hidden flex flex-col items-center mb-4">
            <LogisMark size={52} spot="loginForm" style={{ filter: "drop-shadow(0 10px 24px rgba(15,26,48,0.25))" }} />
            <div className="mt-2.5 mb-1"><LogisTag height={13} chip spot="loginForm" /></div>
            <div className="text-[13.5px] font-bold tracking-[0.3em] text-[#9AA9C3]">DRIVER APP</div>
            <div className="mt-2 flex items-center gap-2 h-7 px-3 rounded-full bg-white border border-[#E3E8F0] text-[14.5px] font-bold text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#4B6CB7] kp-pulse" />{pad(now.getHours())}:{pad(now.getMinutes())}<span className="text-[#9AA9C3]">:{pad(now.getSeconds())}</span>
            </div>
          </div>

          <div className="bg-white rounded-[26px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_24px_60px_rgba(15,26,48,0.10)] px-5 sm:px-10 pt-6 sm:pt-9 pb-6 sm:pb-8">
            <div className="text-[13.5px] font-extrabold tracking-[0.28em] text-[#4B6CB7]">DRIVER SIGN IN</div>
            <h1 className="mt-1 text-[23px] sm:text-[26px] font-black text-[#0F1A30] tracking-tight">기사 로그인</h1>
            <p className="text-[14.5px] sm:text-[15.5px] text-[#7A879C] mt-1 mb-5 sm:mb-7">소속 회사 · 휴대폰번호 · 이름으로 로그인하세요</p>

            {field("company", "소속 운송사명", (
              <div className="relative">
                <input value={companyNameState} onChange={(e) => { setCompanyName(e.target.value); setCoOpen(true); }} onCompositionEnd={(e) => { setCompanyName(e.currentTarget.value); setCoOpen(true); }} onFocus={() => setCoOpen(true)} onBlur={() => setTimeout(() => setCoOpen(false), 200)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { if (coOpen && coMatches.length === 1) { e.preventDefault(); setCompanyName(coMatches[0].companyName); setCoOpen(false); return; } login(); } }}
                  autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="소속된 운송사명 검색" className={inputCls} data-testid="login-co-input" />
                {coOpen && coMatches.length > 0 && (
                  <div data-testid="login-co-list" className="absolute z-30 left-0 right-0 top-full mt-1.5 bg-white border-2 border-[#C9D6EE] rounded-2xl shadow-[0_18px_40px_rgba(15,26,48,.22)] overflow-hidden max-h-[300px] overflow-y-auto overscroll-contain">
                    {coMatches.map((c) => (
                      <button key={c.companyName} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setCompanyName(c.companyName); setCoOpen(false); }}
                        className="w-full text-left px-4 min-h-[54px] py-2.5 border-b border-[#EEF1F6] last:border-0 active:bg-[#EEF3FC] hover:bg-[#F5F8FD]">
                        <span className="flex items-center gap-2">
                          <span className="flex-1 min-w-0 block text-[17px] font-black text-[#0F1A30] truncate">{c.companyName}</span>
                          {coNorm(c.companyName) === coKey && <span className="shrink-0 h-7 px-2.5 rounded-lg bg-[#1B2B4B] text-white text-[13.5px] font-black grid place-items-center">✓ 선택됨</span>}
                        </span>
                        {c.address && <span className="block text-[14px] font-semibold text-[#7A89A3] truncate">{c.address}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {/* ⭐ 2026-11-11 휴대폰번호(전체) 또는 차량번호 — 차량이 바뀌어도 휴대폰번호로는 그대로 로그인된다 */}
            {field("car", "휴대폰번호 (또는 차량번호)", (
              <input value={carNoState} onChange={(e) => setCarNo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} placeholder="예: 01012345678" autoComplete="off" autoCorrect="off" spellCheck={false} className={inputCls} data-testid="login-id-input" />
            ))}
            {field("name", "기사 이름", (
              <input value={nameState} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} placeholder="이름" className={inputCls} />
            ))}

            {/* ⭐ 정보 저장 / 자동 로그인 */}
            <div className="flex items-center justify-between mt-3 mb-4">
              <BigCheck checked={rememberInfo} onChange={(v) => { setRememberInfo(v); if (!v) setAutoLogin(false); }} label="기본정보 저장" />
              <BigCheck checked={autoLogin} onChange={(v) => { setAutoLogin(v); if (v) setRememberInfo(true); }} label="자동 로그인" />
            </div>

            {/* ⭐ 2026-11-05 실패 안내 카드 — 팝업을 닫아도 다시 로그인할 때까지 남는다(큰 글씨) */}
            {error && (
              <div role="alert" data-testid="driver-login-error" className="mb-4 rounded-2xl border-2 border-[#2D4C82]/30 bg-[#F2F6FC] px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <ErrBadge tone={error.tone} size={34} />
                  <div className="min-w-0">
                    <div className="text-[18px] font-black text-[#0F1A30] leading-snug">{error.title}</div>
                    <div className="mt-1 text-[16.5px] font-bold text-[#1B2B4B] leading-relaxed break-keep">{error.message}</div>
                    {error.hint && <div className="mt-1 text-[15.5px] font-semibold text-[#5B6B85] leading-relaxed break-keep">{error.hint}</div>}
                  </div>
                </div>
              </div>
            )}

            <button onClick={() => login()} disabled={loggingIn}
              className="w-full h-14 rounded-2xl text-white text-[18px] font-black tracking-[0.04em] flex items-center justify-center gap-2 shadow-[0_14px_28px_rgba(15,26,48,0.28)] hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60"
              style={{ background: "linear-gradient(120deg, #0F1A30 0%, #1B2B4B 55%, #2D4C82 100%)" }}>
              {loggingIn ? "확인 중…" : "로그인"}
              {!loggingIn && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
            </button>

            <div className="flex items-center gap-3 my-4 sm:my-6"><span className="flex-1 h-px bg-[#EEF1F6]" /><span className="text-[13.5px] font-bold tracking-[0.2em] text-[#C2CBD9]">OR</span><span className="flex-1 h-px bg-[#EEF1F6]" /></div>

            <div className={`grid ${driverApp ? "grid-cols-1" : "grid-cols-2"} gap-2.5`}>
              <button onClick={() => navigate("/driver-register")} className="h-11 rounded-xl border border-[#0F1A30] text-[#0F1A30] text-[15.5px] font-black flex items-center justify-center hover:bg-[#0F1A30] hover:text-white transition">기사 등록하기</button>
              {/* 기사앱(APK·홈 화면 기사앱)에서는 기사 전용이라 다른 유형 로그인을 숨긴다 */}
              {!driverApp && <button onClick={() => navigate("/login")} className="h-11 rounded-xl border border-[#E3E8F0] text-[#5B6B85] text-[15.5px] font-bold flex items-center justify-center hover:bg-[#F5F7FB] transition">다른 유형 로그인</button>}
              {/* 📍 2026-11-16 APK에서 직원(사무실) 계정으로 — 백그라운드 자동 출근용 */}
              {driverApp && isNativeApk() && <button onClick={() => setApkStaffMode(true)} data-kp="apk-staff-login" className="h-11 rounded-xl border border-[#E3E8F0] text-[#5B6B85] text-[15px] font-bold flex items-center justify-center hover:bg-[#F4F6FA]">직원(사무실) 계정으로 로그인</button>}
            </div>
            {/* 👀 2026-11-22 관리자 — 기사를 골라 그 기사앱 화면을 보기 전용으로(웹에서만, src/driver/DriverViewAs.jsx) */}
            {!driverApp && <button onClick={() => navigate("/driver-view")} data-kp="driver-view" className="w-full mt-3 h-10 text-[13px] font-bold text-[#9AA9C3] hover:text-[#0F1A30] inline-flex items-center justify-center gap-1.5">관리자로 기사 화면 보기</button>}
          </div>
          <div className="flex justify-center mt-4 text-[13.5px] font-bold tracking-[0.2em] text-[#B4BFD0]"><LogisTag height={7.5} chip spot="loginForm" text="DRIVER" /></div>
        </div>
      </div>
    </div>

    {/* ⭐ 2026-11-05 로그인 확인 중 — 가운데 창(여러 번 누르지 않도록) */}
    {loggingIn && (
      <div className="fixed inset-0 z-[100050] bg-[#060E1F]/55 flex items-center justify-center p-6" data-testid="driver-login-busy">
        <div className="w-full max-w-[320px] rounded-2xl bg-white shadow-2xl px-6 py-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full border-4 border-[#DCE3EE] border-t-[#2D4C82] animate-spin" />
          <div className="mt-4 text-[19px] font-black text-[#0F1A30]">로그인 확인 중…</div>
          <div className="mt-1 text-[16.5px] font-semibold text-[#5B6B85]">잠시만 기다려 주세요</div>
        </div>
      </div>
    )}

    {/* ⭐ 2026-11-05 실패 이유 팝업(네이비) — 확인을 누르면 닫히고, 아래 카드에는 그대로 남는다 */}
    {error && errorPopup && !loggingIn && (
      <div className="fixed inset-0 z-[100060] bg-[#060E1F]/60 flex items-center justify-center p-5" onClick={() => setErrorPopup(false)} data-testid="driver-login-error-popup">
        <div className="w-full max-w-[400px] rounded-2xl overflow-hidden bg-white shadow-[0_30px_80px_rgba(6,14,31,.45)] kp-login-in" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-labelledby="dlErrTitle">
          <div className="px-6 pt-6 pb-5 text-white" style={{ background: "linear-gradient(120deg, #0F1A30 0%, #1B2B4B 55%, #2D4C82 100%)" }}>
            <div className="flex items-center gap-3">
              <ErrBadge tone={error.tone} size={44} dark />
              <div className="min-w-0">
                <div className="text-[13.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">{error.code === "driver/relogin" ? "NOTICE" : error.tone === "wait" ? "PENDING" : error.tone === "net" ? "NETWORK" : "LOGIN FAILED"}</div>
                <div id="dlErrTitle" className="text-[22px] font-black leading-tight">{error.title}</div>
              </div>
            </div>
          </div>
          <div className="px-6 py-5">
            <p className="text-[17.5px] font-bold text-[#0F1A30] leading-relaxed break-keep">{error.message}</p>
            {error.hint && <p className="mt-2.5 text-[17px] font-semibold text-[#5B6B85] leading-relaxed break-keep">{error.hint}</p>}
          </div>
          <div className={`px-6 pb-6 grid gap-2 ${error.code === "driver/not-registered" ? "grid-cols-2" : "grid-cols-1"}`}>
            {error.code === "driver/not-registered" && (
              <button onClick={() => { setError(null); navigate("/driver-register"); }} className="h-14 rounded-2xl border-2 border-[#0F1A30] text-[#0F1A30] text-[17px] font-black">기사 등록하기</button>
            )}
            <button autoFocus onClick={() => setErrorPopup(false)} className="h-14 rounded-2xl text-white text-[18px] font-black" style={{ background: "linear-gradient(120deg, #0F1A30 0%, #1B2B4B 55%, #2D4C82 100%)" }}>확인</button>
          </div>
        </div>
      </div>
    )}
    {smsAsk && (
      <div className="fixed inset-0 z-[1000] bg-[#061832]/60 flex items-end sm:items-center justify-center" data-kp="driver-sms-login">
        <div className="w-full sm:max-w-[420px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="bg-[#1B2B4B] px-6 py-4">
            <div className="text-white font-black text-[19px]">휴대폰 인증</div>
            <div className="text-white/70 text-[14.5px] mt-0.5 font-bold">운송사에 등록된 휴대폰번호로 인증하면 로그인돼요</div>
          </div>
          <div className="p-5 grid gap-3">
            <input value={smsAsk.phone} type="tel" inputMode="numeric" disabled={smsAsk.step === "code"} placeholder="010-0000-0000"
              onChange={(e) => setSmsAsk((x) => ({ ...x, phone: e.target.value.replace(/[^0-9-]/g, "") }))}
              className="h-14 px-4 rounded-2xl border border-[#DCE3EE] bg-[#F5F7FB] text-[19px] font-black tabular-nums disabled:opacity-70" />
            {smsAsk.step === "code" && (
              <input value={smsAsk.code} inputMode="numeric" maxLength={6} autoFocus placeholder="인증번호 6자리"
                onChange={(e) => setSmsAsk((x) => ({ ...x, code: e.target.value.replace(/\D/g, "") }))}
                className="h-14 px-4 rounded-2xl border-2 border-[#1B2B4B] text-[21px] font-black tabular-nums tracking-[0.3em]" />
            )}
            {smsAsk.msg && <div className={`text-[15px] font-bold ${smsAsk.step === "code" && !/않|못|지났|많이|확인/.test(smsAsk.msg) ? "text-[#2D4C82]" : "text-[#B4342A]"}`}>{smsAsk.msg}</div>}
            {smsAsk.step === "code" ? (
              <>
                <button type="button" disabled={smsAsk.busy || smsAsk.code.length !== 6} onClick={smsCheck} className="h-14 rounded-2xl bg-[#1B2B4B] text-white text-[18px] font-black disabled:opacity-50">{smsAsk.busy ? "확인 중…" : "확인하고 로그인"}</button>
                <button type="button" disabled={smsAsk.busy} onClick={() => setSmsAsk((x) => ({ ...x, step: "phone", code: "", msg: "" }))} className="h-12 rounded-2xl border border-[#DCE3EE] text-[#3A4A66] text-[16px] font-black">번호 다시 넣기</button>
              </>
            ) : (
              <button type="button" disabled={smsAsk.busy} onClick={smsSendCode} className="h-14 rounded-2xl bg-[#1B2B4B] text-white text-[18px] font-black disabled:opacity-50">{smsAsk.busy ? "보내는 중…" : "인증번호 받기"}</button>
            )}
            <button type="button" onClick={smsCancel} className="h-11 text-[15.5px] font-black text-[#7A89A3]">취소</button>
            <div ref={smsHolderRef} />
          </div>
        </div>
      </div>
    )}
    </>
  );
}
