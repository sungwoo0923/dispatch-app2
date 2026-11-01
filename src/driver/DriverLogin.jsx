// src/driver/DriverLogin.jsx
import { coDocKey } from "../coKey";
import React, { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import BigCheck from "../components/BigCheck";
import { legacyDriverEmail, scopedDriverEmail, signInDriver } from "./driverEmail";

// ⭐ 사용자 요청 — 한 번 로그인한 폰에서는 소속회사명/차량번호/이름을 기억하고(정보 저장),
// "자동 로그인"을 켜두면 로그인 화면에 들어오는 순간 저장된 정보로 바로 로그인한다.
// 단, 기사님이 직접 "로그아웃"을 누른 직후에는 자동 로그인하지 않는다(다시 들어가버리는 것 방지).
const SAVED_KEY = "driverLoginSaved";
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "null"); } catch { return null; }
}

export default function DriverLogin() {
  const saved = loadSaved();
  const keep = saved && saved.remember !== false;
  const [companyNameState, setCompanyName] = useState(keep ? saved.companyName || "" : "");
  const [carNoState, setCarNo] = useState(keep ? saved.carNo || "" : "");
  const [nameState, setName] = useState(keep ? saved.name || "" : "");
  const [rememberInfo, setRememberInfo] = useState(saved ? saved.remember !== false : true);
  const [autoLogin, setAutoLogin] = useState(saved ? saved.autoLogin === true : false);
  const [error, setError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const navigate = useNavigate();

  // 페이지 진입 시 무조건 초기화 → 자동 로그인 설정이면 저장된 정보로 바로 로그인
  useEffect(() => {
    (async () => {
      await signOut(auth).catch(() => {});
      localStorage.removeItem("role");
      localStorage.removeItem("uid");
      const justLoggedOut = sessionStorage.getItem("driverJustLoggedOut") === "1";
      sessionStorage.removeItem("driverJustLoggedOut");
      const sv = loadSaved();
      if (!justLoggedOut && sv?.autoLogin && sv.companyName && sv.carNo && sv.name) login(sv);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (override) => {
    // override: 자동 로그인 시 저장된 값(아직 state 반영 전일 수 있어 직접 받는다)
    const companyName = override?.companyName ?? companyNameState;
    const carNo = override?.carNo ?? carNoState;
    const name = override?.name ?? nameState;
    if (loggingIn) return;
    setError("");
    if (!companyName.trim() || !carNo.trim() || !name.trim()) {
      setError("회사명, 차량번호, 이름을 모두 입력해주세요.");
      return;
    }

    let email = legacyDriverEmail(carNo.trim());
    const password = carNo.trim();

    setLoggingIn(true);
    try {
      let uid;
      try {
        // ⭐ 2026-11-01 예전 계정 → 회사별 계정 순서로 로그인(다른 운송사 같은 차량번호 대응)
        const r = await signInDriver(auth, db, companyName, carNo);
        uid = r.uid;
        email = r.email;
      } catch (signInErr) {
        // ⭐ 사용자 요청 — 관리자가 PC 기사관리에서 지입차를 미리 등록해두면(차량번호로
        // 문서만 만들어짐, 인증 계정은 아직 없음) 그 기사님이 여기서 바로 로그인하려 해도
        // 로그인용 계정 자체가 없어 매번 실패했다(기사 등록 화면을 따로 거쳐야만 했음).
        // 로그인 시도 중 "그런 계정이 없음" 류 오류가 나면, 입력한 차량번호로 미리
        // 등록된 문서가 있는지 확인해서 이름·회사명이 맞으면 바로 그 자리에서 계정을
        // 만들어 이어받는다 — 기사 입장에서는 그냥 "로그인"만 하면 되는 경험이 된다.
        // ⭐ 버그수정 — drivers 컬렉션은 보안규칙상 로그인한 사용자만 읽을 수 있는데,
        // 이 조회를 계정 생성보다 먼저 하면 아직 비로그인 상태라 매번 permission-denied가
        // 나서(바깥 catch에 먹혀 "차량번호 또는 이름이 올바르지 않습니다"로만 보임)
        // 선등록 문서가 실제로 있어도 절대 못 찾았다. 계정을 먼저 만들어 로그인 상태를
        // 확보한 뒤 조회하고, 선등록 문서가 없거나 이름·회사명이 다르면 방금 만든
        // 계정을 그 자리에서 삭제해 원상복구한다.
        const normPlate = carNo.trim().replace(/\s+/g, "").toUpperCase();
        let res;
        try {
          res = await createUserWithEmailAndPassword(auth, email, password);
        } catch (createErr) {
          // 예전 계정 이름을 다른 운송사 기사가 쓰고 있으면 회사별 계정으로 만든다
          if (createErr?.code !== "auth/email-already-in-use") throw signInErr;
          try {
            email = scopedDriverEmail(companyName.trim(), carNo.trim());
            res = await createUserWithEmailAndPassword(auth, email, password);
          } catch { throw signInErr; }
        }
        uid = res.user.uid;

        // ⭐ 2026-11-01 PC 선등록 문서 — 회사별 이름(회사__차량번호) 먼저, 없으면 예전 이름(차량번호)
        const preKey = coDocKey(companyName.trim(), normPlate);
        let preSnap = await getDoc(doc(db, "drivers", preKey));
        if (!preSnap.exists() && preKey !== normPlate) {
          const legacySnap = await getDoc(doc(db, "drivers", normPlate));
          if (legacySnap.exists() && (legacySnap.data().companyName || "").trim() === companyName.trim()) preSnap = legacySnap;
        }
        const preId = preSnap.exists() ? preSnap.id : normPlate;
        if (!preSnap.exists()) {
          await res.user.delete().catch(() => {});
          throw signInErr;
        }
        const d = preSnap.data();
        const sameName = (d.이름 || d.name || "").trim() === name.trim();
        const sameCompany = (d.companyName || "").trim() === companyName.trim();
        if (!sameName || !sameCompany) {
          await res.user.delete().catch(() => {});
          throw signInErr;
        }

        const phone = d.전화번호 || d.phone || "";
        const common = {
          uid, name: name.trim(), carNo: carNo.trim(), phone,
          vehicleType: d.vehicleType || "",
          차량종류: d.차량종류 || "", 차량톤수: d.차량톤수 || "",
          거주지: d.거주지 || "", 요청사항: d.요청사항 || "",
          companyName: companyName.trim(),
          // 관리자가 PC에서 직접 등록한 차량이므로 승인 절차 없이 바로 사용 가능하게 한다.
          approved: true,
        };
        await setDoc(doc(db, "users", uid), {
          ...common, email, role: "driver",
          termsAgreed: true, privacyAgreed: true, gpsAgreed: true,
          createdAt: serverTimestamp(),
        });
        // ⭐ 버그수정 — PC 기사관리 화면은 drivers/{id} 문서를 이름/차량번호/전화번호(한글
        // 필드)로 읽는데, 여기서 영문 필드(name/carNo/phone)만 썼더니 로그인 직후 PC
        // 기사관리 목록에서 해당 기사 줄이 전부 "-"로 보였다(모바일 DriverHome은 반대로
        // 영문 필드를 읽으므로 영문도 그대로 유지) — 양쪽 다 쓴다.
        await setDoc(doc(db, "drivers", uid), {
          ...common,
          이름: name.trim(), 차량번호: carNo.trim(), 전화번호: phone,
          mainStatus: "대기", subStatus: "대기", status: "대기", state: "대기", goStatus: "대기",
          active: false, totalDistance: 0,
          등급: d.등급 || "일반", 담당자: d.담당자 || null, 근무요일: d.근무요일 || [], 메모: d.메모 || "",
          등록자: d.등록자 || "",
          createdAt: d.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await deleteDoc(doc(db, "drivers", preId)).catch(() => {});
      }

      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) {
        setError("등록된 기사 정보가 없습니다.");
        await signOut(auth);
        return;
      }

      const u = snap.data();
      // ⭐ 기사앱은 기사 계정만 로그인
      if (u.role !== "driver") {
        setError("기사 계정이 아닙니다. 가입하신 로그인 화면(운송사/화주사)에서 로그인해주세요.");
        await signOut(auth);
        return;
      }
      if (!u.approved) {
        setError("관리자 승인 대기중입니다.");
        await signOut(auth);
        return;
      }
      if (u.name && u.name !== name.trim()) {
        setError("차량번호 또는 이름이 올바르지 않습니다.");
        await signOut(auth);
        return;
      }
      if (u.companyName && u.companyName !== companyName.trim()) {
        setError("소속 회사명이 올바르지 않습니다.");
        await signOut(auth);
        return;
      }

      localStorage.setItem("role", "driver");
      localStorage.setItem("uid", uid);
      try {
        const remember = override ? true : rememberInfo;
        const auto = override ? true : autoLogin;
        localStorage.setItem(SAVED_KEY, JSON.stringify(remember
          ? { remember: true, autoLogin: auto, companyName: companyName.trim(), carNo: carNo.trim(), name: name.trim() }
          : { remember: false, autoLogin: false }));
      } catch { /* 저장 실패 무시 */ }

      setTimeout(() => {
        navigate("/driver-home", { replace: true });
      }, 300);
    } catch (err) {
      console.error(err);
      setError("차량번호 또는 이름이 올바르지 않습니다.");
      await signOut(auth);
    } finally {
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
      <label className="block mb-1 text-[11px] font-extrabold tracking-[0.12em] text-[#7A879C]">{label}</label>
      <div className="group flex items-center gap-2.5 h-[46px] px-3.5 rounded-[13px] bg-[#F5F7FB] border border-[#E3E8F0] transition focus-within:bg-white focus-within:border-[#2D4C82] focus-within:shadow-[0_0_0_4px_rgba(45,76,130,0.10)]">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="text-[#9AA9C3] group-focus-within:text-[#1B2B4B] shrink-0">{fieldIcon[key]}</svg>
        {input}
      </div>
    </div>
  );
  const inputCls = "flex-1 min-w-0 bg-transparent outline-none text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#B4BFD0] placeholder:font-medium";

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
            <div className="text-[10.5px] font-bold tracking-[0.3em] text-white/45">DRIVER APP</div>
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
          <div className="mt-10 text-[30px] font-black leading-snug tracking-tight">버튼 하나로<br />운행이 기록됩니다.</div>
          <div className="mt-3 text-[14px] text-white/50 leading-relaxed">출근 · 상차 · 하차 · 인수증까지<br />기사님 업무를 한 화면에서 처리합니다.</div>
        </div>
        <div className="relative flex items-center gap-6 text-[11px] font-bold tracking-[0.2em] text-white/35">
          <span>SECURE · TLS</span><span>GPS LIVE</span><span>© KP-FLOW</span>
        </div>
      </div>

      {/* 오른쪽 — 로그인 폼 */}
      <div className="flex-1 min-w-0 flex items-center justify-center px-4 py-6 sm:py-10 relative">
        <div className="kp-login-in w-full max-w-[420px]">
          {/* 모바일 머리 */}
          <div className="lg:hidden flex flex-col items-center mb-4">
            <img src="/icons/sflow-icon.png" alt="" className="w-12 h-12 rounded-[14px] shadow-[0_10px_24px_rgba(15,26,48,0.25)]" />
            <div className="mt-2 text-[17px] font-black tracking-[0.18em] text-[#0F1A30]">KP-FLOW</div>
            <div className="text-[10.5px] font-bold tracking-[0.3em] text-[#9AA9C3]">DRIVER APP</div>
            <div className="mt-2 flex items-center gap-2 h-7 px-3 rounded-full bg-white border border-[#E3E8F0] text-[12px] font-bold text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#4B6CB7] kp-pulse" />{pad(now.getHours())}:{pad(now.getMinutes())}<span className="text-[#9AA9C3]">:{pad(now.getSeconds())}</span>
            </div>
          </div>

          <div className="bg-white rounded-[26px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_24px_60px_rgba(15,26,48,0.10)] px-5 sm:px-10 pt-6 sm:pt-9 pb-6 sm:pb-8">
            <div className="text-[11.5px] font-extrabold tracking-[0.28em] text-[#4B6CB7]">DRIVER SIGN IN</div>
            <h1 className="mt-1 text-[22px] sm:text-[26px] font-black text-[#0F1A30] tracking-tight">기사 로그인</h1>
            <p className="text-[12.5px] sm:text-[13.5px] text-[#7A879C] mt-1 mb-5 sm:mb-7">소속 회사 · 차량번호 · 이름으로 로그인하세요</p>

            {field("company", "소속 회사명", (
              <input value={companyNameState} onChange={(e) => setCompanyName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} placeholder="가입한 운송사명" className={inputCls} />
            ))}
            {field("car", "차량번호", (
              <input value={carNoState} onChange={(e) => setCarNo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} placeholder="예: 경기97가1234" className={inputCls} />
            ))}
            {field("name", "기사 이름", (
              <input value={nameState} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} placeholder="이름" className={inputCls} />
            ))}

            {/* ⭐ 정보 저장 / 자동 로그인 */}
            <div className="flex items-center justify-between mt-3 mb-4">
              <BigCheck checked={rememberInfo} onChange={(v) => { setRememberInfo(v); if (!v) setAutoLogin(false); }} label="기본정보 저장" />
              <BigCheck checked={autoLogin} onChange={(v) => { setAutoLogin(v); if (v) setRememberInfo(true); }} label="자동 로그인" />
            </div>

            {error && (
              <div className="flex gap-2 text-[13px] font-semibold text-[#0F1A30] mb-4 bg-[#F2F6FC] border border-[#D9E3F3] rounded-xl px-3.5 py-2.5">
                <span className="text-[#1B2B4B] font-black">!</span><span>{error}</span>
              </div>
            )}

            <button onClick={() => login()} disabled={loggingIn}
              className="w-full h-[50px] rounded-[14px] text-white text-[15px] font-black tracking-[0.04em] flex items-center justify-center gap-2 shadow-[0_14px_28px_rgba(15,26,48,0.28)] hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60"
              style={{ background: "linear-gradient(120deg, #0F1A30 0%, #1B2B4B 55%, #2D4C82 100%)" }}>
              {loggingIn ? "확인 중…" : "로그인"}
              {!loggingIn && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
            </button>

            <div className="flex items-center gap-3 my-4 sm:my-6"><span className="flex-1 h-px bg-[#EEF1F6]" /><span className="text-[11px] font-bold tracking-[0.2em] text-[#C2CBD9]">OR</span><span className="flex-1 h-px bg-[#EEF1F6]" /></div>

            <div className={`grid ${window.Capacitor?.isNativePlatform?.() ? "grid-cols-1" : "grid-cols-2"} gap-2.5`}>
              <button onClick={() => navigate("/driver-register")} className="h-11 rounded-xl border border-[#0F1A30] text-[#0F1A30] text-[13.5px] font-black flex items-center justify-center hover:bg-[#0F1A30] hover:text-white transition">기사 등록하기</button>
              {/* 기사앱(APK)에서는 기사 전용이라 다른 유형 로그인을 숨긴다 */}
              {!window.Capacitor?.isNativePlatform?.() && <button onClick={() => navigate("/login")} className="h-11 rounded-xl border border-[#E3E8F0] text-[#5B6B85] text-[13.5px] font-bold flex items-center justify-center hover:bg-[#F5F7FB] transition">다른 유형 로그인</button>}
            </div>
          </div>
          <div className="text-center mt-4 text-[11px] font-bold tracking-[0.2em] text-[#B4BFD0]">KP-FLOW · DRIVER</div>
        </div>
      </div>
    </div>
    </>
  );
}
