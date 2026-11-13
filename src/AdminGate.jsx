// ======================= src/AdminGate.jsx =======================
// 🔐 2026-11-10 최고관리자 · 부관리자 로그인 보안 확인 (PC · 모바일 모두)
//  · 로그인한 적 있는 기기: ① 계정 비밀번호 → ② 2차 비밀번호(8자 이상, 화면 키패드)
//  · 처음 로그인하는 기기: ① 계정 비밀번호 → ② 2차 비밀번호 → ③ 휴대폰 문자 인증(통과하면 이 기기를 기억)
//  예전엔 PC에서 12시간마다 문자 인증(PcVerifyGate)을 했다 → 문자는 처음 보는 기기에서만.
//  · 2차 비밀번호 · 기기 목록 · 문자 확인은 서버(functions/pnkMfa.js, app: "logis")가 한다 — PnK 인트라넷과 같은 2차 비밀번호를 쓴다
//  · 기기 구분 값은 이 브라우저 저장값(kpAdminDev) — 로그아웃해도 남는다. 브라우저 기록을 지우면 새 기기로 본다
//  · 이번 로그인에서 통과했다는 표시(kpAdminGateOk = { uid, authTime })는 다시 로그인하면 새로 묻는다(새로고침은 다시 묻지 않음)
import React from "react";
import { createPortal } from "react-dom";
import { auth, FUNCTIONS_BASE } from "./firebase";
import { fetchCaller } from "./claimsSync";
import { MfaCodeBox, usePhoneCheck, toE164, maskPhone } from "./MfaModal";
import SecureKeypad, { adminDeviceId } from "./SecureKeypad";
import { LogisMark } from "./brand";
import { fmtPhone } from "./formatInput";

export const ADMIN_GATE_KEY = "kpAdminGateOk";
export const ADMIN_GATE_EVENT = "kp-admin-gate-ok";
const call = fetchCaller(FUNCTIONS_BASE, () => auth.currentUser);
const mfa = (data) => call("pnkMfa", { app: "logis", dev: adminDeviceId(), ...data });

// ⚡ 2026-11-13 보안 확인이 느리던 문제 — 로그인 화면이 열릴 때 미리 준비해 둔다
//  ① 2차 비밀번호 서버(pnkMfa)를 미리 깨운다(쉬고 있던 서버가 켜지는 데 몇 초 걸렸다) ② 문자 인증에 쓰는 구글 확인(reCAPTCHA) 주소에 미리 연결해 둔다
let _warmed = 0;
export function warmAdminGate() {
  if (Date.now() - _warmed < 4 * 60 * 1000) return; // 4분 안에는 다시 안 함
  _warmed = Date.now();
  try { fetch(`${FUNCTIONS_BASE}/pnkMfa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { app: "logis", action: "ping" } }) }).catch(() => {}); } catch { /* 무시 */ }
  try {
    ["https://www.google.com", "https://www.gstatic.com", "https://identitytoolkit.googleapis.com", "https://www.recaptcha.net"].forEach((h) => {
      if (document.querySelector(`link[data-kp-warm="${h}"]`)) return;
      const l = document.createElement("link"); l.rel = "preconnect"; l.href = h; l.crossOrigin = "anonymous"; l.setAttribute("data-kp-warm", h); document.head.appendChild(l);
    });
    if (!document.querySelector('link[data-kp-warm="recaptcha-js"]')) { const p = document.createElement("link"); p.rel = "preload"; p.as = "script"; p.href = "https://www.google.com/recaptcha/api.js?render=explicit"; p.setAttribute("data-kp-warm", "recaptcha-js"); document.head.appendChild(p); }
  } catch { /* 무시 */ }
}

export async function adminAuthTime(user) {
  const fb = String(user?.metadata?.lastSignInTime || "login"); // 토큰을 못 읽으면 마지막 로그인 시각으로 대신 구분
  try { return Number((await user.getIdTokenResult()).claims?.auth_time) || fb; } catch { return fb; }
}
export function isAdminGatePassed(uid, authTime) {
  try {
    const v = JSON.parse(localStorage.getItem(ADMIN_GATE_KEY) || "null");
    return !!v && !!authTime && v.uid === uid && v.authTime === authTime;
  } catch { return false; }
}
function markPassed(uid, authTime) {
  try { localStorage.setItem(ADMIN_GATE_KEY, JSON.stringify({ uid, authTime, at: Date.now() })); } catch { /* 무시 */ }
  window.dispatchEvent(new Event(ADMIN_GATE_EVENT));
}

// inline: 운송사 로그인 카드 안에 그대로 띄운다(화면이 넘어가지 않게) — 2026-11-11
const InlineCtx = React.createContext(false);
const Shell = ({ label, children, foot }) => React.useContext(InlineCtx) ? (
  <div className="w-full" data-admin-gate="inline" style={{ animation: "kpGateIn .35s cubic-bezier(.2,.8,.2,1) both" }}>
    <style>{`@keyframes kpGateIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }`}</style>
    <div className="flex items-center gap-2 mb-3">
      <span className="w-6 h-6 rounded-full bg-[#0F1A30] text-white text-[11px] font-black grid place-items-center shrink-0">2</span>
      <span className="text-[11.5px] font-extrabold tracking-[0.14em] text-[#4B6CB7]">{label}</span>
      <span className="flex-1 h-px bg-[#EEF1F6]" />
    </div>
    {children}
    {foot}
  </div>
) : createPortal(
  <div className="fixed inset-0 z-[100002] overflow-y-auto" style={{ background: "linear-gradient(135deg, #061832 0%, #0B2554 50%, #0D2B66 100%)" }} data-admin-gate>
    <div className="min-h-full flex items-center justify-center p-4">
      <div className="flex flex-col items-center w-full max-w-[400px]">
        <LogisMark size={48} className="mb-3" style={{ filter: "drop-shadow(0 10px 28px rgba(0,0,0,0.35))" }} />
        <div className="text-white/70 text-[12.5px] font-semibold tracking-[0.18em] mb-4">{label}</div>
        {children}
        {foot}
      </div>
    </div>
  </div>,
  document.body,
);

// step: load → code(setup1 → setup2 | verify) → sms(phone → code) → 통과
export function AdminLoginGate({ user, authTime, sub = false, onCancel, inline = false }) {
  return <InlineCtx.Provider value={inline}><GateBody user={user} authTime={authTime} sub={sub} onCancel={onCancel} inline={inline} /></InlineCtx.Provider>;
}
function GateBody({ user, authTime, sub, onCancel, inline }) {
  const who = sub ? "부관리자" : "최고관리자";
  const [step, setStep] = React.useState("code"); // ⚡ 2026-11-13 서버 확인을 기다리지 않고 2차 비밀번호 칸을 바로 띄운다(확인은 뒤에서)
  const [checking, setChecking] = React.useState(true);
  const [setup, setSetup] = React.useState(false);
  const [first, setFirst] = React.useState(""); // 만들 때 첫 번째로 넣은 값
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [phone, setPhone] = React.useState(""); // 등록된 번호(E.164) — 없으면 입력받는다
  const [newPhone, setNewPhone] = React.useState("");
  const [phoneGo, setPhoneGo] = React.useState(false); // 새 번호를 넣고 [인증번호 받기]를 눌렀는지
  const holderRef = React.useRef(null);
  const { send, confirm } = usePhoneCheck(holderRef);

  const load = React.useCallback(async () => {
    setChecking(true); setMsg("");
    try {
      const r = await Promise.race([mfa({ action: "status" }), new Promise((_, no) => setTimeout(() => no(new Error("서버 응답이 늦습니다")), 12000))]);
      if (r.required === false) { markPassed(user.uid, authTime); return; }
      if (!r.hasCode) { setCode(""); setFirst(""); } // 아직 2차 비밀번호가 없는 계정 — 만들기 화면으로(미리 친 값은 지운다)
      setSetup(!r.hasCode);
      if (r.locked) setMsg("여러 번 틀려 잠겼습니다. 10분 뒤 다시 해 주세요.");
      setStep("code");
    } catch (e) { setMsg(e.message || "서버에 연결하지 못했습니다"); setStep("error"); }
    finally { setChecking(false); }
  }, [user.uid, authTime]);
  React.useEffect(() => { warmAdminGate(); load(); }, [load]);

  const submit = async (v) => {
    setMsg("");
    if (setup && !first) { setFirst(v); setCode(""); return; }
    if (setup && first !== v) { setMsg("두 번 넣은 값이 다릅니다. 처음부터 다시 정해 주세요."); setFirst(""); setCode(""); return; }
    setBusy(true);
    try {
      const r = await mfa({ action: setup ? "setup" : "verify", code: v });
      setCode(""); setFirst("");
      if (r.needSms) { setSetup(false); setPhone(r.phone || ""); setStep("sms"); }
      else markPassed(user.uid, authTime);
    } catch (e) { setMsg(e.message || "확인하지 못했습니다"); setCode(""); if (setup) setFirst(""); }
    finally { setBusy(false); }
  };

  const cancel = <div className={inline ? "text-center" : ""}><button type="button" onClick={onCancel} className={inline ? "mt-3 text-[12.5px] font-bold text-[#9AA9C3] hover:text-[#0F1A30]" : "mt-4 text-[13px] font-semibold text-white/60 hover:text-white"}>다른 계정으로 로그인</button></div>;
  const card = inline ? "w-full" : "w-full bg-white rounded-2xl shadow-2xl";
  const note = inline ? "mt-3 text-[11.5px] text-[#9AA9C3] text-center leading-relaxed" : "mt-4 text-[12px] text-white/50 text-center leading-relaxed";

  if (step === "load" || step === "error") {
    return (
      <Shell label={`${who} 보안 확인`} foot={cancel}>
        <div className={`${card} ${inline ? "py-4" : "px-6 py-7"} text-center`}>
          {step === "load" ? <div className="text-[14px] font-bold text-[#5B6B85]">확인하는 중…</div> : (
            <>
              <div className="text-[14px] font-bold text-red-600 leading-relaxed">{msg}</div>
              <button type="button" onClick={load} className="mt-4 w-full py-3 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-bold">다시 시도</button>
            </>
          )}
        </div>
      </Shell>
    );
  }

  if (step === "sms") {
    const target = phone || toE164(newPhone);
    const okPhone = /^\+8210\d{7,8}$/.test(target);
    return (
      <Shell label={`${who} 보안 확인 · 3단계`} foot={cancel}>
        {phone || (okPhone && phoneGo) ? (
          <MfaCodeBox
            key={target}
            title="처음 로그인하는 기기입니다"
            subtitle={`${phone ? "등록된 휴대폰" : "휴대폰"} ${maskPhone(target)}으로 인증번호를 보냅니다`}
            autoSend
            onSend={(opts) => send(target, opts)}
            onVerify={async (c) => {
              const idToken = await confirm(c);
              await mfa({ action: "trust", idToken, ua: navigator.userAgent });
              markPassed(user.uid, authTime);
            }}
            onCancel={phone ? undefined : () => setPhoneGo(false)}
          />
        ) : (
          <div className={`${card} ${inline ? "" : "px-6 py-6"} space-y-3`}>
            <div className="text-[16px] font-black text-[#1B2B4B]">휴대폰 번호 등록</div>
            <div className="text-[12.5px] text-gray-500 leading-relaxed">처음 로그인하는 기기에서는 문자 인증을 한 번 합니다. 인증번호를 받을 본인 휴대폰 번호를 넣어 주세요. 이 번호가 계정에 등록됩니다.</div>
            <input value={newPhone} onChange={(e) => setNewPhone(fmtPhone(e.target.value))} inputMode="tel" placeholder="010-0000-0000" autoFocus
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-[18px] font-black text-center text-[#1B2B4B] outline-none focus:border-[#1B2B4B]" />
            <button type="button" disabled={!okPhone} onClick={() => setPhoneGo(true)} className="w-full py-3 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-bold disabled:opacity-50">인증번호 받기</button>
          </div>
        )}
        <div ref={holderRef} />
        <p className={note}>문자 인증은 처음 로그인하는 기기에서만 합니다.<br />다음부터 이 기기에서는 2차 비밀번호만 확인합니다.</p>
      </Shell>
    );
  }

  return (
    <Shell label={`${who} 보안 확인 · 2단계`} foot={cancel}>
      <div className={`${card} ${inline ? "" : "px-4 pt-5 pb-4"}`}>
        <div className="text-center mb-2">
          <div className="text-[16.5px] font-black text-[#1B2B4B]">{setup ? (first ? "한 번 더 넣어 주세요" : "2차 비밀번호 만들기") : "2차 비밀번호"}</div>
          <div className="text-[12.5px] text-gray-500 mt-1 leading-relaxed">
            {setup ? (first ? "방금 정한 2차 비밀번호를 똑같이 넣어 주세요." : "영문 · 숫자 8자 이상으로 정해 주세요. 로그인 비밀번호와 다르게 정하세요.") : user.email}
          </div>
        </div>
        <SecureKeypad value={code} onChange={setCode} onSubmit={(v) => { if (checking) { setMsg("확인하는 중입니다. 잠시 뒤 다시 눌러 주세요."); return; } submit(v); }} disabled={busy} submitLabel={busy ? "확인 중…" : setup ? (first ? "정하고 들어가기" : "다음") : "확인"} />
        {msg && <div className="mt-3 text-[12.5px] font-semibold text-red-600 bg-red-50 rounded-xl px-3 py-2 text-center leading-relaxed">{msg}</div>}
      </div>
      <p className={note}>2차 비밀번호를 잊으면 {sub ? "최고관리자에게 초기화를 요청하세요." : "개발 담당에게 초기화를 요청하세요."}<br />PnK 인트라넷과 같은 2차 비밀번호를 씁니다.</p>
    </Shell>
  );
}

// 로그인 관리 화면 — 2차 비밀번호 바꾸기
export function AdminCodeChange() {
  const [cur, setCur] = React.useState("");
  const [nw, setNw] = React.useState("");
  const [nw2, setNw2] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState({ type: "", text: "" });
  const go = async () => {
    if (cur.length < 8 || nw.length < 8) return setMsg({ type: "err", text: "8자 이상 넣어 주세요." });
    if (!/^[A-Za-z0-9!@#$%^&*._-]{8,20}$/.test(nw)) return setMsg({ type: "err", text: "새 2차 비밀번호는 영문 · 숫자 · 기호(!@#$%^&*._-) 8~20자로 정해 주세요." });
    if (nw !== nw2) return setMsg({ type: "err", text: "새 2차 비밀번호 확인이 맞지 않습니다." });
    setBusy(true); setMsg({ type: "", text: "" });
    try {
      await mfa({ action: "change", code: cur, newCode: nw });
      setCur(""); setNw(""); setNw2("");
      setMsg({ type: "ok", text: "2차 비밀번호를 바꿨습니다. 인트라넷도 새 2차 비밀번호로 로그인합니다." });
    } catch (e) { setMsg({ type: "err", text: e.message || "바꾸지 못했습니다" }); } finally { setBusy(false); }
  };
  const input = "w-full border border-[#DCE3EE] rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-[#1B2B4B] bg-white";
  return (
    <div className="space-y-2.5">
      <input type="password" autoComplete="off" value={cur} onChange={(e) => setCur(e.target.value.replace(/\s/g, "").slice(0, 20))} placeholder="지금 2차 비밀번호" className={input} />
      <input type="password" autoComplete="off" value={nw} onChange={(e) => setNw(e.target.value.replace(/\s/g, "").slice(0, 20))} placeholder="새 2차 비밀번호 (영문 · 숫자 8자 이상)" className={input} />
      <input type="password" autoComplete="off" value={nw2} onChange={(e) => setNw2(e.target.value.replace(/\s/g, "").slice(0, 20))} placeholder="새 2차 비밀번호 확인" className={input} />
      {msg.text && <div className={`text-[13px] font-semibold ${msg.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</div>}
      <button type="button" onClick={go} disabled={busy} className="w-full py-3 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-bold hover:bg-[#243a60] disabled:opacity-60">{busy ? "바꾸는 중…" : "2차 비밀번호 변경"}</button>
    </div>
  );
}
