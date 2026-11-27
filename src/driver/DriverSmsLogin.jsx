// src/driver/DriverSmsLogin.jsx
// 🔒 2026-11-27 기사 [문자 인증으로 로그인] — 새 휴대폰 · 앱 재설치로 이 기기에 로그인 열쇠가 없을 때
//  [왜] 새로 가입한 기사 비밀번호는 차량번호가 아니라 기기에 저장한 무작위 열쇠다(driverLoginKey.js).
//       열쇠가 없는 기기에서는 운송사 · 휴대폰번호 · 이름만으로는 들어갈 수 없으니, 가입한 휴대폰으로 본인 확인을 한다.
//  ① 운송사 · 이름(로그인 칸 값) + 휴대폰번호 → 서버(driverPhoneLogin)가 그 기사 계정을 찾음 → 문자 발송
//  ② 인증번호 6자리 → 이 기기에서 새 열쇠를 만들어 저장 → 서버(resetPasswordSms)가 "문자 인증 번호 = 그 계정 가입 번호"를 확인하고
//     비밀번호를 새 열쇠로 바꿈(예전 열쇠 · 차량번호는 더 이상 안 됨, 다른 기기 로그인도 끊김) → 바로 로그인
//  · 예전 방식(비밀번호 = 차량번호) 기사도 이걸 쓰면 그때부터 열쇠 방식이 된다(서버가 pwResetBy:"sms" 를 남겨 차량 변경 때 차량번호로 되돌리지 않음).
import React from "react";
import { createPortal } from "react-dom";
import { FUNCTIONS_BASE } from "../firebase";
import { fetchCaller } from "../claimsSync";
import { usePhoneCheck, toE164, maskPhone } from "../MfaModal";
import { fmtPhone } from "../formatInput";
import { resolveDriverPhone, phoneDigits } from "./driverEmail";
import { newDriverKey, saveDriverKey, forgetDriverKey } from "./driverLoginKey";

const call = fetchCaller(FUNCTIONS_BASE, () => null);
const smsErr = (e) => {
  const c = String(e?.code || "");
  if (c === "auth/invalid-verification-code") return "인증번호가 맞지 않아요. 다시 넣어 주세요.";
  if (c === "auth/code-expired") return "인증번호 시간이 지났어요. [인증번호 다시 받기]를 눌러 주세요.";
  if (c === "auth/too-many-requests") return "문자를 너무 많이 요청했어요. 잠시 뒤 다시 해 주세요.";
  if (c === "auth/invalid-phone-number") return "휴대폰번호를 확인해 주세요.";
  if (/이메일이 맞지 않/.test(String(e?.message || ""))) return "가입할 때 넣은 휴대폰번호와 달라요. 번호가 바뀌었으면 소속 운송사에 문의해 주세요.";
  if (/load failed|failed to fetch|networkerror|요청 실패\((404|5\d\d)\)/i.test(String(e?.message || ""))) return "서버에 연결하지 못했어요. 인터넷을 확인하고 다시 해 주세요.";
  return e?.message || "처리하지 못했어요. 다시 해 주세요.";
};
// driverPhoneLogin 결과 → 안내 문구("" = 계속)
const whoErr = (r) => {
  if (r?.error === "rate") return "시도가 너무 많아요. 10분 뒤 다시 해 주세요.";
  if (r?.error) return "서버에 연결하지 못했어요. 인터넷을 확인하고 다시 해 주세요.";
  if (r?.ok && r.email) return "";
  if (r?.ok && r.pre) return "아직 기사앱 계정이 없어요. 로그인 화면의 [기사 등록하기]로 가입해 주세요.";
  if (r?.code === "NAME_MISMATCH") return "이 휴대폰번호로 가입한 기사 이름이 달라요. 로그인 칸의 이름을 확인해 주세요.";
  if (r?.code === "COMPANY_MISMATCH") return "이 휴대폰번호로 가입한 운송사가 달라요. 로그인 칸의 운송사명을 확인해 주세요.";
  if (r?.code === "DISABLED") return "사용이 정지된 계정이에요. 소속 운송사에 문의해 주세요.";
  return "이 휴대폰번호로 가입한 기사를 찾지 못했어요. 가입할 때 넣은 번호인지 확인하거나 소속 운송사에 문의해 주세요.";
};

export default function DriverSmsLogin({ companyName, name, initialPhone = "", onClose, onDone }) {
  const [step, setStep] = React.useState("who"); // who → code
  const [phone, setPhone] = React.useState(() => fmtPhone(phoneDigits(initialPhone)));
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const emailRef = React.useRef("");
  const holderRef = React.useRef(null);
  const { send, confirm } = usePhoneCheck(holderRef);
  const e164 = toE164(phone);
  const co = String(companyName || "").trim();
  const nm = String(name || "").trim();
  const okWho = !!co && !!nm && /^\+8210\d{7,8}$/.test(e164);
  const run = async (fn) => { setBusy(true); setMsg(""); try { await fn(); } catch (e) { setMsg(smsErr(e)); } finally { setBusy(false); } };

  const sendCode = () => run(async () => {
    const r = await resolveDriverPhone(FUNCTIONS_BASE, { companyName: co, phone, name: nm });
    const bad = whoErr(r);
    if (bad) { setMsg(bad); return; }
    emailRef.current = r.email;
    await send(e164);
    setCode("");
    setStep("code");
  });
  const check = () => run(async () => {
    const idToken = await confirm(code);
    // 새 열쇠는 비밀번호를 바꾸기 "전에" 기기에 저장 — 바꾼 직후 앱이 꺼져도 다음에 그 열쇠로 들어간다. 못 바꾸면 지운다.
    const key = newDriverKey();
    saveDriverKey(key);
    try {
      await call("resetPasswordSms", { email: emailRef.current, idToken, newPassword: key });
    } catch (e) {
      forgetDriverKey(key);
      throw e;
    }
    onDone?.(phoneDigits(phone));
  });

  const input = "w-full h-14 border-2 border-[#DCE3EE] rounded-2xl px-4 text-[18px] font-bold text-[#0F1A30] outline-none focus:border-[#1B2B4B] bg-[#F5F7FB] focus:bg-white";
  const primary = "w-full h-14 rounded-2xl text-white text-[18px] font-black disabled:opacity-50";
  const navy = { background: "linear-gradient(120deg, #0F1A30 0%, #1B2B4B 55%, #2D4C82 100%)" };
  return createPortal(
    <div className="fixed inset-0 z-[100070] bg-[#060E1F]/60 flex items-end sm:items-center justify-center sm:p-4" onClick={busy ? undefined : onClose} data-testid="driver-sms-login">
      <div className="w-full sm:max-w-[420px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="px-6 py-5 flex items-center justify-between text-white" style={navy}>
          <div>
            <div className="font-black text-[20px]">문자 인증으로 로그인</div>
            <div className="text-white/65 text-[14.5px] mt-0.5">새 휴대폰이거나 로그인이 안 될 때 · {step === "who" ? 1 : 2}/2단계</div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-white/70 hover:text-white text-[28px] leading-none px-1">×</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {step === "who" && (<>
            {!co || !nm ? (
              <div className="rounded-2xl bg-[#F2F6FC] border-2 border-[#2D4C82]/25 px-4 py-3 text-[16.5px] font-bold text-[#1B2B4B] leading-relaxed break-keep">
                먼저 로그인 화면에 <b>소속 운송사명</b>과 <b>기사 이름</b>을 넣어 주세요.
              </div>
            ) : (
              <div className="text-[16px] font-semibold text-[#3A4A66] leading-relaxed break-keep"><b>{co}</b> · <b>{nm}</b> 기사님 — 가입할 때 넣은 휴대폰번호로 인증번호를 보내요.</div>
            )}
            <input value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} inputMode="tel" placeholder="010-0000-0000" className={`${input} tabular-nums`} data-testid="driver-sms-phone" />
            <button type="button" disabled={!okWho || busy} onClick={sendCode} className={primary} style={navy}>{busy ? "확인 중…" : "인증번호 받기"}</button>
          </>)}
          {step === "code" && (<>
            <div className="text-[16px] font-semibold text-[#3A4A66]"><b>{maskPhone(e164)}</b>으로 보낸 인증번호 6자리를 넣어 주세요.</div>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(e) => e.key === "Enter" && code.length === 6 && !busy && check()} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className={`${input} text-center text-[24px] tracking-[0.4em] tabular-nums`} autoFocus />
            <button type="button" disabled={code.length !== 6 || busy} onClick={check} className={primary} style={navy}>{busy ? "확인 중…" : "확인하고 로그인"}</button>
            <button type="button" disabled={busy} onClick={sendCode} className="w-full text-[15px] font-bold text-[#7A879C] hover:text-[#1B2B4B] py-1">인증번호 다시 받기</button>
          </>)}
          {msg && <div className="text-[15.5px] font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2.5 leading-relaxed break-keep">{msg}</div>}
          <div className="text-[14px] font-semibold text-[#7A879C] leading-relaxed break-keep">인증하면 이 휴대폰으로 로그인이 바뀌어요. 예전 휴대폰은 로그아웃돼요.</div>
          <div ref={holderRef} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
