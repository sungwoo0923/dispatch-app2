// ======================= pnk-site/src/Auth.jsx =======================
// PnK PROJECT 인트라넷 — 로그인 · 회원가입(약관 동의) · 가입 요청 · 승인/사번 대기 · 2차 인증(최고관리자 · 부관리자)
//  · 로그인: 사번(PNK-0001) 또는 이메일 + 비밀번호 · [아이디 저장](이 기기 기억) · [자동 로그인](끄면 브라우저를 닫을 때 로그아웃)
//  · 회원가입: 약관 동의(필수 2 · 선택 1) → 로그인 계정 만들기 → 가입 요청(승인 대기) → 대표 · 관리자가 승인하며 사번 발급
//    로지스웹 계정이 이미 있으면 그 계정으로 로그인해 가입 요청만 보내면 된다(계정을 새로 만들지 않음)
//  · 2차 인증: 최고관리자 · 부관리자는 비밀번호 다음에 8자리 2차 비밀번호(처음 한 번 정함) — 서버 확인(functions/pnkMfa.js)
import React from "react";
import {
  browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, sendPasswordResetEmail,
  setPersistence, signInWithEmailAndPassword, signOut, updateProfile,
} from "firebase/auth";
import { auth, callFn } from "./firebase";
import { emailOfLogin, requestJoin } from "./pnkApi";
import { TERMS, TERMS_VERSION } from "./pnkTerms";
import { DEPT_ORDER, TITLES } from "./pnkConst";
import { Btn, Field, Input, Modal, Select, cx, errMsg } from "./ui";
import Icon from "./icons";

const LS = { id: "pnkSavedId", saveId: "pnkSaveId", auto: "pnkAutoLogin" };
const lsGet = (k, d = "") => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* 무시 */ } };
export const autoLoginOn = () => lsGet(LS.auto, "1") === "1";
const authMsg = (er) => (er.code === "pnk/no-empno" ? "등록되지 않은 사번입니다. 사번이 없으면 이메일로 로그인해 주세요."
  : ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email", "auth/invalid-login-credentials"].includes(er.code) ? "사번(이메일) 또는 비밀번호가 맞지 않습니다."
    : er.code === "auth/too-many-requests" ? "여러 번 틀려 잠시 막혔습니다. 잠시 뒤 다시 하거나 비밀번호를 재설정해 주세요."
      : er.code === "auth/email-already-in-use" ? "이미 가입된 이메일입니다. [로그인]에서 그 계정으로 로그인한 뒤 가입 요청을 보내 주세요."
        : er.code === "auth/weak-password" ? "비밀번호는 8자 이상으로 정해 주세요."
          : er.code === "auth/network-request-failed" ? "인터넷 연결을 확인해 주세요." : errMsg(er));

function Frame({ children, wide }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: "radial-gradient(90% 70% at 50% 0%, #2D4C82 0%, #1B2B4B 45%, #0F1A30 100%)" }}>
      <div className="absolute -left-24 -bottom-24 w-[420px] h-[420px] rounded-full bg-white/[0.04]" />
      <div className="absolute -right-20 -top-28 w-[360px] h-[360px] rounded-full bg-white/[0.05]" />
      <div className={cx("relative w-full bg-white rounded-[28px] shadow-[0_30px_80px_rgba(0,0,0,0.35)] overflow-hidden", wide ? "max-w-[520px]" : "max-w-[420px]")}>
        <div className="px-7 pt-7 pb-5 flex flex-col items-center border-b border-[#EEF1F6]">
          <img src="/brand/pnk-logo-600.png" alt="PnK PROJECT" className="w-24" />
          <div className="mt-2 text-[11px] font-extrabold tracking-[0.24em] text-[#7A8AA8]">HEADQUARTERS INTRANET</div>
        </div>
        <div className="p-7">{children}</div>
        <div className="px-7 pb-5 text-center text-[11px] text-[#A0ABBE]">© PnK PROJECT · 로지스웹 · 로지스웹 허브 · 기사앱</div>
      </div>
    </div>
  );
}
function Check({ checked, onChange, children, className = "" }) {
  return (
    <label className={cx("flex items-center gap-2 text-[13px] font-semibold text-[#3A4A66] cursor-pointer select-none", className)}>
      <span className={cx("w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center transition shrink-0", checked ? "bg-navy border-navy" : "border-[#C9D3E4] bg-white")}>
        {checked && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4"><path d="m5 12 5 5 9-10" /></svg>}
      </span>
      <input type="checkbox" className="hidden" checked={checked} onChange={(e) => onChange(e.target.checked)} />{children}
    </label>
  );
}
async function applyPersistence(auto) {
  lsSet(LS.auto, auto ? "1" : "0");
  await setPersistence(auth, auto ? browserLocalPersistence : browserSessionPersistence);
}

// ───────────────────────── 로그인 · 회원가입 ─────────────────────────
export function Login() {
  const [mode, setMode] = React.useState("login");
  const [terms, setTerms] = React.useState(null);
  return (
    <Frame wide={mode === "signup"}>
      <div className="grid grid-cols-2 gap-1 p-1 bg-navy-50 rounded-2xl mb-5">
        {[["login", "로그인"], ["signup", "회원가입"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMode(k)} className={cx("h-10 rounded-xl text-[14px] font-black transition", mode === k ? "bg-white text-navy shadow" : "text-[#7A8AA8]")}>{l}</button>
        ))}
      </div>
      {mode === "login" ? <LoginForm /> : <SignupForm onDone={() => setMode("login")} showTerm={setTerms} />}
      <div className="mt-5 flex justify-center gap-3 text-[11.5px] text-[#7A8AA8]">
        {TERMS.filter((t) => t.required).map((t) => <button key={t.key} type="button" onClick={() => setTerms(t)} className="hover:text-navy underline-offset-2 hover:underline">{t.key === "service" ? "이용약관" : "개인정보 처리"}</button>)}
      </div>
      {terms && <Modal open title={terms.title} onClose={() => setTerms(null)} footer={<Btn onClick={() => setTerms(null)}>확인</Btn>}><div className="text-[13.5px] leading-[1.8] whitespace-pre-wrap text-[#22304D]">{terms.body}</div></Modal>}
    </Frame>
  );
}

function LoginForm() {
  const [saveId, setSaveId] = React.useState(() => lsGet(LS.saveId, "1") === "1");
  const [auto, setAuto] = React.useState(autoLoginOn);
  const [id, setId] = React.useState(() => (lsGet(LS.saveId, "1") === "1" ? lsGet(LS.id) : ""));
  const [pw, setPw] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const pwRef = React.useRef(null);
  const go = async (e) => {
    e.preventDefault();
    if (!id.trim() || !pw) { setMsg("사번(이메일)과 비밀번호를 넣어 주세요."); return; }
    setBusy(true); setMsg("");
    try {
      await applyPersistence(auto);
      const email = await emailOfLogin(id);
      await signInWithEmailAndPassword(auth, email, pw);
      lsSet(LS.saveId, saveId ? "1" : "0");
      lsSet(LS.id, saveId ? id.trim() : null);
    } catch (er) { setMsg(authMsg(er)); setBusy(false); }
  };
  const reset = async () => {
    if (!id.trim()) { setMsg("사번 또는 이메일을 먼저 넣어 주세요."); return; }
    try { await sendPasswordResetEmail(auth, await emailOfLogin(id)); setMsg("가입한 이메일로 비밀번호 재설정 메일을 보냈습니다."); } catch (er) { setMsg(authMsg(er)); }
  };
  return (
    <form onSubmit={go} className="space-y-3">
      <Field label="사번 또는 이메일"><Input autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !pw) { e.preventDefault(); pwRef.current?.focus(); } }} placeholder="PNK-0001 또는 이메일" autoFocus={!id} className="h-12 text-[15px]" /></Field>
      <Field label="비밀번호">
        <div className="relative">
          <Input ref={pwRef} type={show ? "text" : "password"} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus={!!id} className="h-12 text-[15px] pr-11" />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-3.5 text-[#7A8AA8]" aria-label="비밀번호 보기"><Icon name="eye" size={18} /></button>
        </div>
      </Field>
      <div className="flex items-center gap-4 pt-1">
        <Check checked={saveId} onChange={setSaveId}>아이디 저장</Check>
        <Check checked={auto} onChange={setAuto}>자동 로그인</Check>
        <button type="button" onClick={reset} className="ml-auto text-[12.5px] font-semibold text-[#7A8AA8] hover:text-navy">비밀번호 찾기</button>
      </div>
      {!auto && <div className="text-[11.5px] text-[#7A8AA8]">자동 로그인을 끄면 브라우저를 닫을 때 로그아웃됩니다(공용 PC 권장).</div>}
      {msg && <div className="text-[12.5px] font-semibold text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{msg}</div>}
      <Btn type="submit" disabled={busy} className="w-full h-12 text-[15px]">{busy ? "로그인 중…" : "로그인"}</Btn>
      <p className="text-[11.5px] leading-relaxed text-[#7A8AA8] text-center pt-1">로지스웹 계정이 있으면 그 이메일로 바로 로그인해 가입 요청을 보내세요.<br />최고관리자 · 부관리자는 로그인 후 2차 인증(8자리)을 합니다.</p>
    </form>
  );
}

function SignupForm({ onDone, showTerm }) {
  const [agree, setAgree] = React.useState({ service: false, privacy: false, notify: false });
  const all = TERMS.every((t) => agree[t.key]);
  const [f, setF] = React.useState({ email: "", pw: "", pw2: "", name: "", phone: "", dept: "", title: "" });
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const pwOk = f.pw.length >= 8 && /[A-Za-z]/.test(f.pw) && /\d/.test(f.pw);
  const go = async () => {
    setMsg("");
    if (!agree.service || !agree.privacy) { setMsg("필수 약관에 동의해 주세요."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) { setMsg("이메일 주소를 확인해 주세요."); return; }
    if (!pwOk) { setMsg("비밀번호는 영문 · 숫자를 섞어 8자 이상으로 정해 주세요."); return; }
    if (f.pw !== f.pw2) { setMsg("비밀번호 확인이 맞지 않습니다."); return; }
    if (!f.name.trim()) { setMsg("이름을 넣어 주세요."); return; }
    setBusy(true);
    try {
      await applyPersistence(true);
      const cred = await createUserWithEmailAndPassword(auth, f.email.trim(), f.pw);
      await updateProfile(cred.user, { displayName: f.name.trim() }).catch(() => {});
      await requestJoin(cred.user, { ...f, terms: { version: TERMS_VERSION, service: true, privacy: true, notify: !!agree.notify, at: Date.now() } });
      // 로그인 상태 그대로 → "가입 요청을 보냈습니다" 화면으로 바뀐다
    } catch (er) { setMsg(authMsg(er)); setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-line p-3.5">
        <Check checked={all} onChange={(v) => setAgree({ service: v, privacy: v, notify: v })} className="font-black text-navy-950">약관 전체 동의</Check>
        <div className="mt-2.5 pt-2.5 border-t border-[#EEF1F6] space-y-2">
          {TERMS.map((t) => (
            <div key={t.key} className="flex items-center gap-2">
              <Check checked={agree[t.key]} onChange={(v) => setAgree({ ...agree, [t.key]: v })}><span className={t.required ? "text-navy font-black" : "text-[#7A8AA8]"}>{t.required ? "[필수]" : "[선택]"}</span> {t.title.replace("(선택) ", "")}</Check>
              <button type="button" onClick={() => showTerm(t)} className="ml-auto text-[12px] text-[#7A8AA8] hover:text-navy shrink-0">보기</button>
            </div>
          ))}
        </div>
      </div>
      <Field label="이메일 (로그인 아이디)"><Input type="email" autoComplete="email" value={f.email} onChange={set("email")} placeholder="name@example.com" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="비밀번호" hint={f.pw && !pwOk ? "영문 · 숫자 섞어 8자 이상" : ""}><Input type="password" autoComplete="new-password" value={f.pw} onChange={set("pw")} /></Field>
        <Field label="비밀번호 확인" hint={f.pw2 && f.pw !== f.pw2 ? "같지 않습니다" : ""}><Input type="password" autoComplete="new-password" value={f.pw2} onChange={set("pw2")} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="이름"><Input value={f.name} onChange={set("name")} /></Field>
        <Field label="휴대폰"><Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^\d]/g, "").replace(/^(\d{3})(\d{3,4})(\d{4}).*$/, "$1-$2-$3") })} placeholder="010-0000-0000" /></Field>
        <Field label="부서"><Select custom value={f.dept} onChange={set("dept")} options={DEPT_ORDER} placeholder="선택 · 직접 입력" /></Field>
        <Field label="직책"><Select custom value={f.title} onChange={set("title")} options={TITLES} placeholder="선택 · 직접 입력" /></Field>
      </div>
      {msg && <div className="text-[12.5px] font-semibold text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{msg}</div>}
      <Btn onClick={go} disabled={busy} className="w-full h-12 text-[15px]">{busy ? "가입 중…" : "가입 신청"}</Btn>
      <p className="text-[11.5px] leading-relaxed text-[#7A8AA8] text-center">가입 신청 → 대표 · 관리자 승인 → 사번 발급 후 이용할 수 있습니다.<br />로지스웹 계정이 이미 있으면 <button type="button" onClick={onDone} className="text-navy font-bold underline">로그인</button>에서 그 계정으로 들어가 주세요.</p>
    </div>
  );
}

// ───────────────────────── 로그인했지만 아직 구성원이 아닌 계정 ─────────────────────────
export function JoinGate({ me }) {
  const [f, setF] = React.useState({ name: me.user.displayName || "", dept: "", title: "", phone: "" });
  const [agree, setAgree] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const st = me.member?.status;
  const send = async () => {
    if (!agree) { setMsg("이용약관 · 개인정보 수집에 동의해 주세요."); return; }
    if (!f.name.trim()) { setMsg("이름을 넣어 주세요."); return; }
    setBusy(true); setMsg("");
    try { await requestJoin(me.user, { ...f, terms: { version: TERMS_VERSION, service: true, privacy: true, notify: false, at: Date.now() } }); } catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  };
  const Status = ({ icon, title, children }) => (
    <div className="text-center py-2">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-navy-100 text-navy flex items-center justify-center mb-3"><Icon name={icon} size={26} /></div>
      <div className="text-[17px] font-black text-navy-950">{title}</div>
      <p className="mt-2 text-[13px] text-[#5A6A86] leading-relaxed">{children}</p>
    </div>
  );
  return (
    <Frame>
      {me.needEmpNo ? <Status icon="idcard" title="사번 발급 대기 중입니다">승인은 되었지만 아직 사번이 없습니다.<br />대표 · 관리자가 사번을 주면 바로 들어갈 수 있습니다.</Status>
        : st === "pending" ? <Status icon="hourglass" title="가입 신청이 접수되었습니다">대표 · 관리자가 승인하면서 사번을 드립니다.<br />승인되면 사번으로도 로그인할 수 있습니다.<br /><span className="text-[#7A8AA8]">{me.user.email}</span></Status>
          : st === "off" ? <Status icon="shield" title="사용이 중지된 계정입니다">관리자에게 문의해 주세요.</Status>
            : (
              <div className="space-y-3">
                <div className="text-[15px] font-black text-navy-950">PnK PROJECT 구성원 가입 요청</div>
                <p className="text-[12.5px] text-[#5A6A86]">{me.user.email} 계정으로 요청합니다.</p>
                <Field label="이름"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="부서"><Select custom value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })} options={DEPT_ORDER} placeholder="선택 · 직접 입력" /></Field>
                  <Field label="직책"><Select custom value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} options={TITLES} placeholder="선택 · 직접 입력" /></Field>
                </div>
                <Field label="휴대폰"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="010-0000-0000" /></Field>
                <Check checked={agree} onChange={setAgree}>[필수] 이용약관 · 개인정보 수집 · 이용에 동의합니다</Check>
                {msg && <div className="text-[12.5px] font-semibold text-rose-600">{msg}</div>}
                <Btn onClick={send} disabled={busy} className="w-full h-11">가입 요청 보내기</Btn>
              </div>
            )}
      <button type="button" onClick={() => signOut(auth)} className="mt-4 w-full text-[12.5px] font-semibold text-[#7A8AA8] hover:text-navy">다른 계정으로 로그인</button>
    </Frame>
  );
}

// ───────────────────────── 2차 인증(최고관리자 · 부관리자) ─────────────────────────
export function MfaGate({ me }) {
  const info = me.mfaInfo || {};
  const setup = info.required && !info.hasCode && !info.error;
  const [code, setCode] = React.useState("");
  const [code2, setCode2] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(info.error ? `서버에 연결하지 못했습니다(${info.error}). 잠시 뒤 새로고침해 주세요.` : info.locked ? "여러 번 틀려 잠겼습니다. 10분 뒤 다시 해 주세요." : "");
  const go = async (e) => {
    e?.preventDefault();
    setMsg("");
    if (code.length < 8) { setMsg("8자 이상 넣어 주세요."); return; }
    if (setup && code !== code2) { setMsg("확인이 맞지 않습니다."); return; }
    setBusy(true);
    try {
      await callFn("pnkMfa")({ action: setup ? "setup" : "verify", code, remember: autoLoginOn() });
      me.passMfa();
    } catch (er) { setMsg(er.message || "확인하지 못했습니다"); setBusy(false); }
  };
  return (
    <Frame>
      <form onSubmit={go} className="space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-navy text-white flex items-center justify-center mb-3"><Icon name="shield" size={26} /></div>
          <div className="text-[17px] font-black text-navy-950">{setup ? "2차 비밀번호 만들기" : "2차 인증"}</div>
          <p className="mt-1.5 text-[12.5px] text-[#5A6A86] leading-relaxed">{me.sub ? "부관리자" : "최고관리자"} 계정은 비밀번호 다음에 2차 비밀번호를 한 번 더 확인합니다.<br />{setup ? "영문 · 숫자 8자 이상으로 정해 주세요. 로그인 비밀번호와 다르게 정하세요." : `${me.user.email}`}</p>
        </div>
        <div className="relative">
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\s/g, "").slice(0, 20))} type={show ? "text" : "password"} autoFocus autoComplete="one-time-code" maxLength={20}
            placeholder="••••••••" className="w-full h-14 rounded-2xl border-2 border-[#DCE3EE] focus:border-navy text-center text-[22px] font-black tracking-[0.35em] outline-none tabular-nums" />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-4 top-4 text-[#7A8AA8]" aria-label="보기"><Icon name="eye" size={20} /></button>
        </div>
        <div className="flex justify-center gap-1.5">{Array.from({ length: 8 }).map((_, i) => <span key={i} className={cx("w-2.5 h-2.5 rounded-full transition", i < code.length ? "bg-navy" : "bg-[#DCE3EE]")} />)}</div>
        {setup && <input value={code2} onChange={(e) => setCode2(e.target.value.replace(/\s/g, "").slice(0, 20))} type={show ? "text" : "password"} maxLength={20} placeholder="한 번 더" className="w-full h-12 rounded-2xl border-2 border-[#DCE3EE] focus:border-navy text-center text-[18px] font-black tracking-[0.3em] outline-none" />}
        {msg && <div className="text-[12.5px] font-semibold text-rose-600 bg-rose-50 rounded-xl px-3 py-2 text-center">{msg}</div>}
        <Btn type="submit" disabled={busy || !!info.error} className="w-full h-12 text-[15px]">{busy ? "확인 중…" : setup ? "정하고 들어가기" : "확인"}</Btn>
        <div className="text-[11.5px] text-[#7A8AA8] text-center leading-relaxed">{autoLoginOn() ? "자동 로그인 중에는 30일 동안 다시 묻지 않습니다." : "다시 로그인하거나 12시간이 지나면 다시 묻습니다."}<br />2차 비밀번호를 잊으면 {me.sub ? "최고관리자에게 초기화를 요청하세요." : "개발 담당에게 초기화를 요청하세요(Firebase pnkMfaSecrets 삭제)."}</div>
      </form>
      <button type="button" onClick={() => signOut(auth)} className="mt-3 w-full text-[12.5px] font-semibold text-[#7A8AA8] hover:text-navy">다른 계정으로 로그인</button>
    </Frame>
  );
}
