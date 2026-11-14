// ======================= src/PasswordResetSms.jsx =======================
// 🔑 2026-11-14 비밀번호 찾기 — 가입할 때 넣은 휴대폰으로 문자 인증 → 새 비밀번호 두 번 → 변경(예전 비밀번호는 더 이상 안 됨)
//  ① 이메일 + 휴대폰 번호 → [인증번호 받기]  ② 인증번호 6자리  ③ 새 비밀번호 두 번 → [변경]
//  문자 확인은 별도 로그인 칸(usePhoneCheck)에서 하고, 서버(functions/passwordResetSms.js)가 번호 = 그 계정의 가입 번호인지 확인한 뒤 바꾼다
import React from "react";
import { createPortal } from "react-dom";
import { FUNCTIONS_BASE } from "./firebase";
import { fetchCaller } from "./claimsSync";
import { usePhoneCheck, toE164, maskPhone } from "./MfaModal";
import { fmtPhone } from "./formatInput";

const call = fetchCaller(FUNCTIONS_BASE, () => null);
const smsErr = (e) => {
  const c = String(e?.code || "");
  if (c === "auth/invalid-verification-code") return "인증번호가 맞지 않습니다.";
  if (c === "auth/code-expired") return "인증번호 시간이 지났습니다. 다시 받아 주세요.";
  if (c === "auth/too-many-requests") return "문자를 너무 많이 요청했습니다. 잠시 뒤 다시 해 주세요.";
  if (c === "auth/invalid-phone-number") return "휴대폰 번호를 확인해 주세요.";
  return e?.message || "처리하지 못했습니다.";
};

export default function PasswordResetSms({ initialEmail = "", onClose, onDone, onEmailLink }) {
  const [step, setStep] = React.useState("who"); // who → code → pw → done
  const [email, setEmail] = React.useState(initialEmail);
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [pw1, setPw1] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const tokenRef = React.useRef("");
  const holderRef = React.useRef(null);
  const { send, confirm } = usePhoneCheck(holderRef);
  const e164 = toE164(phone);
  const okWho = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && /^\+8210\d{7,8}$/.test(e164);
  const run = async (fn) => { setBusy(true); setMsg(""); try { await fn(); } catch (e) { setMsg(smsErr(e)); } finally { setBusy(false); } };
  const sendCode = () => run(async () => { await send(e164); setCode(""); setStep("code"); });
  const check = () => run(async () => { tokenRef.current = await confirm(code); setStep("pw"); });
  const change = () => {
    if (pw1.length < 6) return setMsg("새 비밀번호는 6자 이상으로 정해 주세요.");
    if (pw1 !== pw2) return setMsg("새 비밀번호 두 칸이 서로 다릅니다.");
    return run(async () => {
      await call("resetPasswordSms", { email: email.trim(), idToken: tokenRef.current, newPassword: pw1 });
      tokenRef.current = ""; setStep("done");
    });
  };
  const input = "w-full h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] outline-none focus:border-[#1B2B4B] bg-[#F5F7FB] focus:bg-white";
  const primary = "w-full h-12 rounded-xl bg-[#1B2B4B] text-white text-[14.5px] font-black disabled:opacity-50";
  const stepNo = { who: 1, code: 2, pw: 3, done: 3 }[step];
  return createPortal(
    <div className="fixed inset-0 z-[1000] bg-[#061832]/60 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose} data-pw-reset>
      <div className="w-full sm:max-w-[420px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-white font-black text-[16px]">비밀번호 찾기</div>
            <div className="text-white/60 text-[12px] mt-0.5">가입할 때 넣은 휴대폰으로 문자 인증 · {stepNo}/3단계</div>
          </div>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white text-[24px] leading-none px-1">×</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {step === "who" && (<>
            <div><div className="text-[12px] font-extrabold text-[#7A879C] mb-1.5">이메일(아이디)</div>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@company.com" className={input} /></div>
            <div><div className="text-[12px] font-extrabold text-[#7A879C] mb-1.5">가입할 때 넣은 휴대폰 번호</div>
              <input value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} inputMode="tel" placeholder="010-0000-0000" className={`${input} tabular-nums`} /></div>
            <button type="button" disabled={!okWho || busy} onClick={sendCode} className={primary} data-pw-send>{busy ? "보내는 중…" : "인증번호 받기"}</button>
          </>)}
          {step === "code" && (<>
            <div className="text-[13.5px] text-[#3A4A66]"><b>{maskPhone(e164)}</b>으로 보낸 인증번호 6자리를 넣어 주세요.</div>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className={`${input} text-center text-[22px] tracking-[0.4em] tabular-nums`} autoFocus />
            <button type="button" disabled={code.length !== 6 || busy} onClick={check} className={primary}>{busy ? "확인 중…" : "확인"}</button>
            <button type="button" disabled={busy} onClick={sendCode} className="w-full text-[13px] font-bold text-[#7A879C] hover:text-[#1B2B4B] py-1">인증번호 다시 받기</button>
          </>)}
          {step === "pw" && (<>
            <div className="text-[13.5px] text-[#3A4A66]">문자 인증을 마쳤습니다. 새 비밀번호를 정해 주세요.</div>
            <input value={pw1} onChange={(e) => setPw1(e.target.value)} type="password" autoComplete="new-password" placeholder="새 비밀번호 (6자 이상)" className={input} autoFocus />
            <input value={pw2} onChange={(e) => setPw2(e.target.value)} type="password" autoComplete="new-password" placeholder="새 비밀번호 확인" onKeyDown={(e) => e.key === "Enter" && change()} className={input} />
            <button type="button" disabled={!pw1 || !pw2 || busy} onClick={change} className={primary}>{busy ? "바꾸는 중…" : "변경"}</button>
          </>)}
          {step === "done" && (<>
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-4 text-[14px] text-emerald-800 leading-relaxed"><b>비밀번호를 바꿨습니다.</b><br />예전 비밀번호는 더 이상 쓸 수 없고, 다른 기기의 로그인도 끊었습니다. 새 비밀번호로 로그인해 주세요.</div>
            <button type="button" onClick={() => onDone?.(email.trim())} className={primary}>로그인하러 가기</button>
          </>)}
          {msg && <div className="text-[13px] font-semibold text-red-600 bg-red-50 rounded-xl px-3 py-2 leading-relaxed">{msg}</div>}
          {step === "who" && onEmailLink && <div className="text-center"><button type="button" onClick={() => onEmailLink(email.trim())} className="text-[12px] font-bold text-[#9AA9C3] hover:text-[#1B2B4B]">휴대폰 번호가 바뀌었나요? 이메일로 재설정 링크 받기</button></div>}
          <div ref={holderRef} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
