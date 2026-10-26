// ======================= src/MfaModal.jsx =======================
// ⭐ 최고관리자 2차 인증(휴대폰 문자)
// [현재 방식 — PC 전용] PC에서 최고관리자로 로그인하면 등록한 휴대폰으로 인증번호 문자를 보내고,
//   6자리를 입력해야 프로그램이 열린다(PcVerifyGate). 모바일은 묻지 않는다. 문자 발송·확인은
//   Firebase "전화 인증"을 별도 인스턴스(pcVerify)에서 써서 본 로그인에는 영향이 없다.
//   번호는 users/{uid}.pcVerifyPhone, 이 PC에서 확인했다는 표시는 로그아웃 전까지 유지(kpPcMfaOk).
// [예전 방식 — 아래 useMfaPrompt 등] Firebase 공식 "SMS 다중 인증"은 계정 전체(PC+모바일)에 걸려
//   PC만 따로 적용할 수 없어 더 쓰지 않는다. 이미 등록된 계정이 있으면 해제할 수 있게만 남겨둔다.
// (아래는 예전 방식 설명)
//  - 등록: 로그인 관리 → "2차 인증(휴대폰 문자)" 에서 휴대폰 번호 등록(이메일 인증 → 문자 인증번호 확인)
//  - 로그인: 비밀번호가 맞으면 Firebase가 "2차 인증 필요" 오류를 내고 → 이 창에서 문자로 받은 6자리 입력
//  - 비밀번호 변경처럼 "다시 로그인 확인"이 필요한 곳에서도 같은 창을 쓴다
// Firebase 콘솔에서 Authentication → SMS 다중 인증을 켜야 동작한다(안 켜져 있으면 안내 문구가 나옴).
import React from "react";
import { createPortal } from "react-dom";
import {
  RecaptchaVerifier, PhoneAuthProvider, PhoneMultiFactorGenerator, getMultiFactorResolver, multiFactor,
  reauthenticateWithCredential, EmailAuthProvider, sendEmailVerification,
} from "firebase/auth";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithPhoneNumber, signOut } from "firebase/auth";
import { doc, setDoc, deleteField } from "firebase/firestore";
import { auth as mainAuth, db } from "./firebase";

export const MASTER_EMAIL = "tjddnqkf@naver.com";

// 010-1234-5678 → +821012345678
export function toE164(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("82")) return `+${d}`;
  if (d.startsWith("0")) return `+82${d.slice(1)}`;
  return d ? `+${d}` : "";
}
// +821012345678 → 010-****-5678 (Firebase가 이미 가린 번호면 그대로)
export function maskPhone(p) {
  const s = String(p || "");
  if (s.includes("*")) return s.replace(/^\+82/, "0");
  const d = s.replace(/\D/g, "").replace(/^82/, "0");
  return d.length >= 10 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : s;
}

export function mfaErrorText(e) {
  const code = e?.code || "";
  const map = {
    "auth/invalid-verification-code": "인증번호가 맞지 않습니다. 다시 확인해 주세요.",
    "auth/code-expired": "인증번호가 만료되었습니다. [다시 받기]를 눌러주세요.",
    "auth/too-many-requests": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    "auth/quota-exceeded": "오늘 보낼 수 있는 문자 수를 넘었습니다. 잠시 후 다시 시도해 주세요.",
    "auth/invalid-phone-number": "휴대폰 번호 형식이 올바르지 않습니다.",
    "auth/missing-phone-number": "휴대폰 번호를 입력해 주세요.",
    "auth/operation-not-allowed": "Firebase에서 전화(문자) 인증이 아직 켜져 있지 않습니다. 콘솔 → Authentication → 로그인 방법 → 전화를 사용 설정해 주세요.",
    "auth/admin-restricted-operation": "Firebase에서 문자 인증(SMS 다중 인증)이 아직 켜져 있지 않습니다.",
    "auth/unverified-email": "이메일 인증을 먼저 완료해야 합니다.",
    "auth/requires-recent-login": "보안을 위해 비밀번호를 다시 입력해 주세요.",
    "auth/wrong-password": "비밀번호가 올바르지 않습니다.",
    "auth/invalid-credential": "비밀번호가 올바르지 않습니다.",
    "auth/second-factor-already-in-use": "이미 등록된 번호입니다.",
    "auth/maximum-second-factor-count-exceeded": "등록할 수 있는 번호 수를 넘었습니다.",
    "auth/captcha-check-failed": "보안 확인(reCAPTCHA)에 실패했습니다. 새로고침 후 다시 시도해 주세요.",
    "auth/invalid-app-credential": "보안 확인에 실패했습니다. Firebase 승인된 도메인에 이 주소가 있는지 확인해 주세요.",
    "auth/network-request-failed": "인터넷 연결을 확인해 주세요.",
    "mfa/cancelled": "2차 인증을 취소했습니다.",
  };
  return map[code] || `인증 실패: ${e?.message || e}`;
}

// 보이지 않는 reCAPTCHA(문자 발송 전에 사람인지 확인) — 창 안의 빈 칸에 붙인다
function makeVerifier(authInst, el) {
  return new RecaptchaVerifier(authInst, el, { size: "invisible" });
}

// 6자리 인증번호 입력창(로그인·등록 공용 디자인)
export function MfaCodeBox({ title, subtitle, sendLabel = "인증번호 받기", onSend, onVerify, onCancel, autoSend = false, initiallySent = false, recaptchaRef }) {
  const [code, setCode] = React.useState("");
  const [sent, setSent] = React.useState(initiallySent);
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const [left, setLeft] = React.useState(initiallySent ? 60 : 0);
  const inputRef = React.useRef(null);
  React.useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const send = async (opts) => {
    setBusy("send"); setErr("");
    try {
      await onSend(opts);
      setSent(true); setLeft(60); setCode("");
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) { setErr(mfaErrorText(e)); } finally { setBusy(""); }
  };
  const verify = async () => {
    if (code.length !== 6) return setErr("문자로 받은 6자리 숫자를 입력해 주세요.");
    setBusy("verify"); setErr("");
    try { await onVerify(code); } catch (e) { setErr(mfaErrorText(e)); setBusy(""); }
  };
  const autoSent = React.useRef(false);
  React.useEffect(() => {
    if (autoSend && !autoSent.current) { autoSent.current = true; send({ auto: true }); }
  }, [autoSend]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-full max-w-[380px] bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="bg-[#1B2B4B] px-6 py-5 text-white">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></svg>
          </div>
          <div className="min-w-0">
            <div className="text-[16.5px] font-black">{title}</div>
            {subtitle && <div className="text-[12.5px] text-white/70 mt-0.5">{subtitle}</div>}
          </div>
        </div>
      </div>
      <div className="px-6 py-5 space-y-3">
        {!sent ? (
          <button onClick={send} disabled={busy === "send"} className="w-full py-3 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-bold hover:bg-[#243a60] disabled:opacity-60">
            {busy === "send" ? "문자 보내는 중…" : sendLabel}
          </button>
        ) : (
          <>
            <input
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && verify()}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="● ● ● ● ● ●"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3.5 text-[24px] font-black tracking-[0.5em] text-center text-[#1B2B4B] outline-none focus:border-[#1B2B4B] placeholder:text-gray-300 placeholder:tracking-[0.3em] placeholder:text-[18px]"
            />
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-gray-500">문자로 받은 6자리를 입력하세요</span>
              <button onClick={send} disabled={left > 0 || busy === "send"} className="font-bold text-[#1B2B4B] disabled:text-gray-400">
                {left > 0 ? `다시 받기 ${left}초` : "다시 받기"}
              </button>
            </div>
            <button onClick={verify} disabled={busy === "verify" || code.length !== 6} className="w-full py-3 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-bold hover:bg-[#243a60] disabled:opacity-50">
              {busy === "verify" ? "확인 중…" : "인증 확인"}
            </button>
          </>
        )}
        {err && <div className="text-[12.5px] font-semibold text-red-600 text-center leading-relaxed">{err}</div>}
        {onCancel && <button onClick={onCancel} disabled={busy === "verify"} className="w-full py-2 text-[13px] font-semibold text-gray-500 hover:text-gray-700">취소</button>}
        <div ref={recaptchaRef} />
      </div>
    </div>
  );
}

/**
 * 로그인/재확인 중 "2차 인증 필요" 오류가 나면 문자 인증창을 띄우고, 통과하면 로그인 결과를 돌려준다.
 * const [mfaUi, askMfa] = useMfaPrompt();  …  catch (e) { if (e.code === "auth/multi-factor-auth-required") cred = await askMfa(e, auth); }
 */
export function useMfaPrompt() {
  const [state, setState] = React.useState(null); // { resolver, hint, authInst, resolve, reject }
  const recaptchaRef = React.useRef(null);
  const verifierRef = React.useRef(null);
  const vidRef = React.useRef("");
  const ask = React.useCallback((error, authInst = mainAuth) => new Promise((resolve, reject) => {
    const resolver = getMultiFactorResolver(authInst, error);
    const hint = resolver.hints.find((h) => h.factorId === PhoneMultiFactorGenerator.FACTOR_ID) || resolver.hints[0];
    setState({ resolver, hint, authInst, resolve, reject });
  }), []);
  const cleanup = () => { try { verifierRef.current?.clear(); } catch { /* 무시 */ } verifierRef.current = null; vidRef.current = ""; };
  React.useEffect(() => () => cleanup(), []);
  const ui = state && createPortal(
    <div className="fixed inset-0 z-[100001] bg-black/55 flex items-center justify-center p-5">
      <MfaCodeBox
        title="2차 인증"
        subtitle={`등록된 휴대폰 ${maskPhone(state.hint?.phoneNumber)}으로 인증번호를 보냅니다`}
        autoSend
        recaptchaRef={recaptchaRef}
        onSend={async () => {
          if (!verifierRef.current) verifierRef.current = makeVerifier(state.authInst, recaptchaRef.current);
          vidRef.current = await new PhoneAuthProvider(state.authInst).verifyPhoneNumber(
            { multiFactorHint: state.hint, session: state.resolver.session }, verifierRef.current);
        }}
        onVerify={async (code) => {
          const cred = PhoneAuthProvider.credential(vidRef.current, code);
          const result = await state.resolver.resolveSignIn(PhoneMultiFactorGenerator.assertion(cred));
          cleanup();
          setState(null);
          state.resolve(result);
        }}
        onCancel={() => { cleanup(); setState(null); state.reject(Object.assign(new Error("cancelled"), { code: "mfa/cancelled" })); }}
      />
    </div>,
    document.body,
  );
  return [ui, ask];
}

// 비밀번호로 다시 확인(2차 인증 등록·해제 전에 필요) — 2차 인증이 이미 있으면 문자 인증까지
async function reauth(user, pw, askMfa) {
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pw));
  } catch (e) {
    if (e?.code === "auth/multi-factor-auth-required") await askMfa(e, mainAuth);
    else throw e;
  }
}

// 로그인 관리 화면 — 최고관리자 2차 인증 등록/해제
export function MfaEnrollSection({ user: userProp }) {
  const user = userProp?.reload ? userProp : mainAuth.currentUser;
  const [, force] = React.useReducer((x) => x + 1, 0);
  const [mfaUi, askMfa] = useMfaPrompt();
  const [pw, setPw] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [step, setStep] = React.useState(""); // "" | "code"
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState({ type: "", text: "" });
  const recaptchaRef = React.useRef(null);
  const verifierRef = React.useRef(null);
  const vidRef = React.useRef("");
  React.useEffect(() => () => { try { verifierRef.current?.clear(); } catch { /* 무시 */ } }, []);
  if (!user) return null;
  const factors = multiFactor(user).enrolledFactors || [];

  const refresh = async () => { await user.reload().catch(() => {}); force(); };
  const sendVerifyEmail = async () => {
    setBusy("email"); setMsg({ type: "", text: "" });
    try {
      await sendEmailVerification(user);
      setMsg({ type: "ok", text: `${user.email} 메일함으로 인증 메일을 보냈습니다. 메일의 링크를 누른 뒤 [인증 완료 확인]을 눌러주세요.` });
    } catch (e) { setMsg({ type: "err", text: mfaErrorText(e) }); } finally { setBusy(""); }
  };
  const sendCode = async () => {
    if (!pw) return setMsg({ type: "err", text: "현재 비밀번호를 입력해 주세요." });
    const e164 = toE164(phone);
    if (!/^\+8210\d{7,8}$/.test(e164)) return setMsg({ type: "err", text: "휴대폰 번호를 010-0000-0000 형식으로 입력해 주세요." });
    setBusy("send"); setMsg({ type: "", text: "" });
    try {
      await reauth(user, pw, askMfa);
      const session = await multiFactor(user).getSession();
      if (!verifierRef.current) verifierRef.current = makeVerifier(mainAuth, recaptchaRef.current);
      vidRef.current = await new PhoneAuthProvider(mainAuth).verifyPhoneNumber({ phoneNumber: e164, session }, verifierRef.current);
      setStep("code");
    } catch (e) { setMsg({ type: "err", text: mfaErrorText(e) }); } finally { setBusy(""); }
  };
  const unenroll = async (f) => {
    if (!pw) return setMsg({ type: "err", text: "해제하려면 현재 비밀번호를 먼저 입력해 주세요." });
    if (!window.confirm(`${maskPhone(f.phoneNumber)} 2차 인증을 해제할까요? 해제하면 비밀번호만으로 로그인됩니다.`)) return;
    setBusy("un"); setMsg({ type: "", text: "" });
    try {
      await reauth(user, pw, askMfa);
      await multiFactor(user).unenroll(f);
      setPw("");
      await refresh();
      setMsg({ type: "ok", text: "2차 인증을 해제했습니다." });
    } catch (e) { setMsg({ type: "err", text: mfaErrorText(e) }); } finally { setBusy(""); }
  };

  const input = "w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-[#1B2B4B] bg-white";
  return (
    <div className="space-y-3">
      {mfaUi}
      {factors.length > 0 ? (
        <>
          {factors.map((f) => (
            <div key={f.uid} className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z" /><path d="m9 12 2 2 4-4" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold text-emerald-800">사용 중 · {maskPhone(f.phoneNumber)}</div>
                <div className="text-[12px] text-emerald-700/80">로그인할 때마다 이 번호로 인증번호 문자가 옵니다{f.enrollmentTime ? ` · 등록 ${new Date(f.enrollmentTime).toLocaleDateString("ko-KR")}` : ""}</div>
              </div>
              <button onClick={() => unenroll(f)} disabled={busy === "un"} className="shrink-0 px-3 py-2 rounded-xl border border-red-300 text-red-600 text-[12.5px] font-bold hover:bg-red-50 disabled:opacity-60">해제</button>
            </div>
          ))}
          <input type="password" autoComplete="current-password" placeholder="해제할 때만 — 현재 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} className={input} />
        </>
      ) : !user.emailVerified ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2.5">
          <div className="text-[13px] text-amber-800 font-semibold leading-relaxed">휴대폰 인증을 등록하려면 먼저 이메일 인증이 필요합니다(Firebase 보안 규칙).</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={sendVerifyEmail} disabled={busy === "email"} className="py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold disabled:opacity-60">{busy === "email" ? "보내는 중…" : "인증 메일 보내기"}</button>
            <button onClick={refresh} className="py-2.5 rounded-xl border border-[#1B2B4B] text-[#1B2B4B] text-[13px] font-bold">인증 완료 확인</button>
          </div>
        </div>
      ) : step === "code" ? (
        <div className="flex justify-center">
          <MfaCodeBox
            title="휴대폰 인증 등록"
            subtitle={`${maskPhone(toE164(phone))}으로 인증번호를 보냈습니다`}
            recaptchaRef={null}
            onSend={async () => {
              const session = await multiFactor(user).getSession();
              vidRef.current = await new PhoneAuthProvider(mainAuth).verifyPhoneNumber({ phoneNumber: toE164(phone), session }, verifierRef.current);
            }}
            initiallySent
            onVerify={async (code) => {
              const cred = PhoneAuthProvider.credential(vidRef.current, code);
              await multiFactor(user).enroll(PhoneMultiFactorGenerator.assertion(cred), "최고관리자 휴대폰");
              setStep(""); setPw(""); setPhone("");
              await refresh();
              setMsg({ type: "ok", text: "2차 인증이 등록되었습니다. 다음 로그인부터 문자 인증번호를 입력합니다." });
            }}
            onCancel={() => setStep("")}
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          <input type="password" autoComplete="current-password" placeholder="현재 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} className={input} />
          <input type="tel" inputMode="tel" placeholder="휴대폰 번호 (010-0000-0000)" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
          <button onClick={sendCode} disabled={busy === "send"} className="w-full py-3 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-bold hover:bg-[#243a60] disabled:opacity-60">
            {busy === "send" ? "문자 보내는 중…" : "인증번호 받기"}
          </button>
        </div>
      )}
      {msg.text && <div className={`text-[13px] font-semibold leading-relaxed ${msg.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</div>}
      <div ref={recaptchaRef} />
    </div>
  );
}

/* ====================== PC 전용 2차 인증 ====================== */
export const PC_MFA_KEY = "kpPcMfaOk"; // 이 PC에서 문자 인증을 통과한 기록 { uid, at }
// ⭐ 2026-10-26 — 한 번 인증하면 이 PC에서는 12시간 동안 다시 묻지 않는다.
//    (예전엔 로그아웃하면 지워서, 최고관리자가 회사코드를 찾아 다시 로그인할 때마다 문자를 또 받아야 했다)
const PC_MFA_VALID_MS = 12 * 60 * 60 * 1000;
export function markPcMfaPassed(uid) {
  try { localStorage.setItem(PC_MFA_KEY, JSON.stringify({ uid, at: Date.now() })); } catch { /* 무시 */ }
}
// ⭐ 인증 화면이 잠깐 닫혔다 다시 열려도(로그인 직후 확인이 끝나며 화면이 다시 그려지는 경우) 문자를 또 보내지 않도록,
//    마지막으로 보낸 문자와 그 확인 정보를 화면 밖에 보관한다 — 처음 받은 번호를 그대로 입력하면 된다.
const RESEND_GUARD_MS = 60 * 1000;
let lastPcSend = { phone: "", at: 0, confirm: null };

function phoneAuthInstance() {
  const app = getApps().find((a) => a.name === "pcVerify") || initializeApp(mainAuth.app.options, "pcVerify");
  return getAuth(app);
}

// 문자 보내기 → 6자리 확인. 매번 새 reCAPTCHA 칸을 만들어 "이미 그려짐" 오류를 피한다.
function usePhoneCheck(holderRef) {
  const confirmRef = React.useRef(null);
  const verifierRef = React.useRef(null);
  const clear = () => { try { verifierRef.current?.clear(); } catch { /* 무시 */ } verifierRef.current = null; };
  React.useEffect(() => () => clear(), []);
  const send = async (phoneE164, { auto = false } = {}) => {
    // 자동 발송인데 1분 안에 같은 번호로 이미 보냈다면 다시 보내지 않고 그 확인 정보를 이어 쓴다
    if (auto && lastPcSend.confirm && lastPcSend.phone === phoneE164 && Date.now() - lastPcSend.at < RESEND_GUARD_MS) {
      confirmRef.current = lastPcSend.confirm;
      return;
    }
    const a2 = phoneAuthInstance();
    clear();
    const holder = holderRef.current;
    if (holder) holder.innerHTML = "";
    const el = document.createElement("div");
    holder?.appendChild(el);
    verifierRef.current = new RecaptchaVerifier(a2, el, { size: "invisible" });
    confirmRef.current = await signInWithPhoneNumber(a2, phoneE164, verifierRef.current);
    lastPcSend = { phone: phoneE164, at: Date.now(), confirm: confirmRef.current };
  };
  const confirm = async (code) => {
    if (!confirmRef.current) throw Object.assign(new Error("인증번호를 먼저 받아주세요."), { code: "auth/missing-verification-id" });
    await confirmRef.current.confirm(code);
    lastPcSend = { phone: "", at: 0, confirm: null };
    await signOut(phoneAuthInstance()).catch(() => {});
    clear();
  };
  return { send, confirm };
}

export function isPcMfaPassed(uid) {
  try {
    const raw = localStorage.getItem(PC_MFA_KEY);
    if (!raw) return false;
    const v = JSON.parse(raw);
    return !!v && v.uid === uid && Date.now() - (Number(v.at) || 0) < PC_MFA_VALID_MS;
  } catch { return false; } // 예전 형식(uid 문자열)은 다시 한 번만 인증
}

// PC 로그인 직후 프로그램을 가리는 인증 화면
export function PcVerifyGate({ uid, phone, onCancel }) {
  const holderRef = React.useRef(null);
  const { send, confirm } = usePhoneCheck(holderRef);
  const [, force] = React.useReducer((x) => x + 1, 0);
  return createPortal(
    <div className="fixed inset-0 z-[100002] flex items-center justify-center p-5" style={{ background: "linear-gradient(135deg, #061832 0%, #0B2554 50%, #0D2B66 100%)" }}>
      <div className="flex flex-col items-center w-full max-w-[380px]">
        <img src="/icons/sflow-icon.png" alt="" className="w-14 h-14 rounded-[16px] shadow-[0_10px_28px_rgba(0,0,0,0.35)] ring-1 ring-white/15 mb-4" />
        <div className="text-white/70 text-[12.5px] font-semibold tracking-[0.18em] mb-5">최고관리자 보안 확인</div>
        <MfaCodeBox
          title="PC 로그인 2차 인증"
          subtitle={`등록된 휴대폰 ${maskPhone(phone)}으로 인증번호를 보냅니다`}
          autoSend
          onSend={(opts) => send(phone, opts)}
          onVerify={async (code) => {
            await confirm(code);
            markPcMfaPassed(uid);
            window.dispatchEvent(new Event("kp-pc-mfa-ok"));
            force();
          }}
          onCancel={onCancel}
        />
        <div ref={holderRef} />
        <p className="mt-4 text-[12px] text-white/50 text-center leading-relaxed">PC에서만 확인합니다. 인증 후에는 로그아웃할 때까지 다시 묻지 않습니다.</p>
      </div>
    </div>,
    document.body,
  );
}

// 로그인 관리 화면 — PC 2차 인증 휴대폰 등록·변경·해제(+ 예전 방식 해제)
export function PcVerifySection({ user: userProp, phone }) {
  const user = userProp?.reload ? userProp : mainAuth.currentUser;
  const holderRef = React.useRef(null);
  const { send, confirm } = usePhoneCheck(holderRef);
  const [, force] = React.useReducer((x) => x + 1, 0);
  const [editing, setEditing] = React.useState(false);
  const [newPhone, setNewPhone] = React.useState("");
  const [sentTo, setSentTo] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState({ type: "", text: "" });
  const [mfaUi, askMfa] = useMfaPrompt();
  if (!user) return null;
  const legacy = multiFactor(user).enrolledFactors || [];

  const startSend = async () => {
    const e164 = toE164(newPhone);
    if (!/^\+8210\d{7,8}$/.test(e164)) return setMsg({ type: "err", text: "휴대폰 번호를 010-0000-0000 형식으로 입력해 주세요." });
    setBusy("send"); setMsg({ type: "", text: "" });
    try { await send(e164); setSentTo(e164); } catch (e) { setMsg({ type: "err", text: mfaErrorText(e) }); } finally { setBusy(""); }
  };
  const remove = async () => {
    if (!pw) return setMsg({ type: "err", text: "해제하려면 현재 비밀번호를 입력해 주세요." });
    if (!window.confirm("PC 2차 인증을 해제할까요? 해제하면 PC에서도 비밀번호만으로 로그인됩니다.")) return;
    setBusy("rm"); setMsg({ type: "", text: "" });
    try {
      await reauth(user, pw, askMfa);
      await setDoc(doc(db, "users", user.uid), { pcVerifyPhone: deleteField() }, { merge: true });
      setPw("");
      setMsg({ type: "ok", text: "PC 2차 인증을 해제했습니다." });
    } catch (e) { setMsg({ type: "err", text: mfaErrorText(e) }); } finally { setBusy(""); }
  };
  const removeLegacy = async (f) => {
    if (!pw) return setMsg({ type: "err", text: "현재 비밀번호를 입력해 주세요." });
    setBusy("legacy");
    try {
      await reauth(user, pw, askMfa);
      await multiFactor(user).unenroll(f);
      await user.reload().catch(() => {});
      force();
      setMsg({ type: "ok", text: "예전 방식(모바일에도 걸리던 인증)을 해제했습니다." });
    } catch (e) { setMsg({ type: "err", text: mfaErrorText(e) }); } finally { setBusy(""); }
  };
  const input = "w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-[#1B2B4B] bg-white";

  return (
    <div className="space-y-3">
      {mfaUi}
      {legacy.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
          <div className="text-[13px] font-semibold text-amber-800">예전 방식 인증이 켜져 있어 모바일에서도 문자 인증을 묻습니다. 아래 비밀번호 입력 후 해제하세요.</div>
          {legacy.map((f) => (
            <button key={f.uid} onClick={() => removeLegacy(f)} disabled={busy === "legacy"} className="px-3 py-2 rounded-lg border border-amber-400 text-amber-800 text-[12.5px] font-bold bg-white disabled:opacity-60">
              {maskPhone(f.phoneNumber)} 예전 방식 해제
            </button>
          ))}
        </div>
      )}

      {phone && !editing ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z" /><path d="m9 12 2 2 4-4" /></svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-emerald-800">사용 중 · {maskPhone(phone)}</div>
            <div className="text-[12px] text-emerald-700/80">PC에서 로그인할 때마다 이 번호로 인증번호 문자가 옵니다 (모바일은 묻지 않음)</div>
          </div>
          <button onClick={() => { setEditing(true); setNewPhone(""); setSentTo(""); setMsg({ type: "", text: "" }); }} className="shrink-0 px-3 py-2 rounded-xl border border-[#1B2B4B]/30 text-[#1B2B4B] text-[12.5px] font-bold hover:bg-white">번호 변경</button>
        </div>
      ) : sentTo ? (
        <div className="flex justify-center">
          <MfaCodeBox
            title="휴대폰 인증"
            subtitle={`${maskPhone(sentTo)}으로 인증번호를 보냈습니다`}
            initiallySent
            onSend={() => send(sentTo)}
            onVerify={async (code) => {
              await confirm(code);
              await setDoc(doc(db, "users", user.uid), { pcVerifyPhone: sentTo }, { merge: true });
              markPcMfaPassed(user.uid);
              setSentTo(""); setEditing(false);
              setMsg({ type: "ok", text: "등록되었습니다. 다음에 PC에서 로그인할 때부터 문자 인증번호를 입력합니다." });
            }}
            onCancel={() => setSentTo("")}
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          <input type="tel" inputMode="tel" placeholder="휴대폰 번호 (010-0000-0000)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className={input} />
          <div className="flex gap-2">
            <button onClick={startSend} disabled={busy === "send"} className="flex-1 py-3 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-bold hover:bg-[#243a60] disabled:opacity-60">
              {busy === "send" ? "문자 보내는 중…" : "인증번호 받기"}
            </button>
            {editing && <button onClick={() => setEditing(false)} className="px-4 py-3 rounded-xl border border-gray-300 text-[14px] font-bold text-gray-600">취소</button>}
          </div>
        </div>
      )}

      {phone && !editing && (
        <div className="flex gap-2">
          <input type="password" autoComplete="current-password" placeholder="해제할 때만 — 현재 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} className={input} />
          <button onClick={remove} disabled={busy === "rm"} className="shrink-0 px-4 rounded-xl border border-red-300 text-red-600 text-[13px] font-bold hover:bg-red-50 disabled:opacity-60">해제</button>
        </div>
      )}
      {!phone && legacy.length > 0 && (
        <input type="password" autoComplete="current-password" placeholder="예전 방식 해제용 — 현재 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} className={input} />
      )}
      {msg.text && <div className={`text-[13px] font-semibold leading-relaxed ${msg.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</div>}
      <div ref={holderRef} />
    </div>
  );
}
