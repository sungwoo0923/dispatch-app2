// ======================= pnk-site/src/Auth.jsx =======================
// PnK PROJECT 인트라넷 — 로그인 · 회원가입(약관 동의) · 가입 요청 · 승인/사번 대기 · 2차 인증(최고관리자 · 부관리자)
//  · 로그인: 사번(PNK-0001) + 이메일 + 비밀번호(셋 다 맞아야) · [사번 · 이메일 저장] · [자동 로그인] · 사번 없는 사람은 [가입 신청 상태 확인]만
//  · 로지스웹 계정(users 문서가 있는 계정)은 들어올 수 없다 — 최고관리자 · 부관리자만 예외(규칙도 같음)
//  · 회원가입: 약관 동의(필수 2 · 선택 1) → 로그인 계정 만들기 → 가입 요청(승인 대기) → 대표 · 관리자가 승인하며 사번 발급
//  · 2차 인증: 최고관리자 · 부관리자는 비밀번호 다음에 8자리 2차 비밀번호(처음 한 번 정함) — 서버 확인(functions/pnkMfa.js)
import React from "react";
import {
  browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, sendPasswordResetEmail,
  setPersistence, signInWithEmailAndPassword, signOut, updateProfile,
} from "firebase/auth";
import { auth, callFn, db, sideConn } from "./firebase";
import { normEmpNo, requestJoin } from "./pnkApi";
import { doc, getDoc } from "firebase/firestore";
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
          <button key={k} type="button" onClick={() => setMode(k)} className={cx("h-10 rounded-xl text-[14px] font-black transition", (mode === k || (mode === "status" && k === "login")) ? "bg-white text-navy shadow" : "text-[#7A8AA8]")}>{l}</button>
        ))}
      </div>
      {mode === "login" ? <LoginForm onStatus={() => setMode("status")} /> : mode === "status" ? <StatusForm onBack={() => setMode("login")} /> : <SignupForm onDone={() => setMode("login")} showTerm={setTerms} />}
      <div className="mt-5 flex justify-center gap-3 text-[11.5px] text-[#7A8AA8]">
        {TERMS.filter((t) => t.required).map((t) => <button key={t.key} type="button" onClick={() => setTerms(t)} className="hover:text-navy underline-offset-2 hover:underline">{t.key === "service" ? "이용약관" : "개인정보 처리"}</button>)}
      </div>
      {terms && <Modal open title={terms.title} onClose={() => setTerms(null)} footer={<Btn onClick={() => setTerms(null)}>확인</Btn>}><div className="text-[13.5px] leading-[1.8] whitespace-pre-wrap text-[#22304D]">{terms.body}</div></Modal>}
    </Frame>
  );
}

// 로그인 = 사번 + 이메일 + 비밀번호(셋 다 맞아야). 로지스웹 계정은 들어올 수 없다(인트라넷 회원가입한 직원만 · 최고관리자 · 부관리자 예외)
const LS2 = { emp: "pnkSavedEmp" };
// 로그인 확인에 실패해 로그아웃하면 화면이 다시 그려진다 — 그때도 안내가 남게
let flash = "";
function LoginForm({ onStatus }) {
  const [saveId, setSaveId] = React.useState(() => lsGet(LS.saveId, "1") === "1");
  const [auto, setAuto] = React.useState(autoLoginOn);
  const [emp, setEmp] = React.useState(() => (lsGet(LS.saveId, "1") === "1" ? lsGet(LS2.emp) : ""));
  const [id, setId] = React.useState(() => (lsGet(LS.saveId, "1") === "1" ? lsGet(LS.id) : ""));
  const [pw, setPw] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(() => flash); // 다음 로그인 시도 때 지운다(개발 모드에서 두 번 불려도 남게)
  const go = async (e) => {
    e.preventDefault();
    const no = normEmpNo(emp);
    if (!no || !id.trim() || !pw) { setMsg("사번 · 이메일 · 비밀번호를 모두 넣어 주세요."); return; }
    if (!/^PNK-\d{4,6}$/.test(no)) { setMsg("사번은 PNK-0001 형식입니다(숫자만 넣어도 됩니다)."); return; }
    setBusy(true); setMsg(""); flash = "";
    try {
      await applyPersistence(auto);
      const cred = await signInWithEmailAndPassword(auth, id.trim(), pw);
      const chk = await checkMember(cred.user, no);
      if (!chk.ok) { flash = chk.msg; setMsg(chk.msg); await signOut(auth); setBusy(false); return; }
      lsSet(LS.saveId, saveId ? "1" : "0");
      lsSet(LS.id, saveId ? id.trim() : null);
      lsSet(LS2.emp, saveId ? no : null);
    } catch (er) { setMsg(authMsg(er)); setBusy(false); }
  };
  const reset = async () => {
    if (!id.trim()) { setMsg("가입한 이메일을 먼저 넣어 주세요."); return; }
    try { await sendPasswordResetEmail(auth, id.trim()); setMsg("가입한 이메일로 비밀번호 재설정 메일을 보냈습니다."); } catch (er) { setMsg(authMsg(er)); }
  };
  return (
    <form onSubmit={go} className="space-y-3">
      <Field label="사번"><Input value={emp} onChange={(e) => setEmp(e.target.value.toUpperCase())} onBlur={() => setEmp((v) => normEmpNo(v))} placeholder="PNK-0001" autoFocus={!emp} className="h-12 text-[15px] tnum font-bold" /></Field>
      <Field label="이메일"><Input type="email" autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} placeholder="가입한 이메일" className="h-12 text-[15px]" /></Field>
      <Field label="비밀번호">
        <div className="relative">
          <Input type={show ? "text" : "password"} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus={!!emp && !!id} className="h-12 text-[15px] pr-11" />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-3.5 text-[#7A8AA8]" aria-label="비밀번호 보기"><Icon name="eye" size={18} /></button>
        </div>
      </Field>
      <div className="flex items-center gap-4 pt-1">
        <Check checked={saveId} onChange={setSaveId}>사번 · 이메일 저장</Check>
        <Check checked={auto} onChange={setAuto}>자동 로그인</Check>
        <button type="button" onClick={reset} className="ml-auto text-[12.5px] font-semibold text-[#7A8AA8] hover:text-navy">비밀번호 찾기</button>
      </div>
      {!auto && <div className="text-[11.5px] text-[#7A8AA8]">자동 로그인을 끄면 브라우저를 닫을 때 로그아웃됩니다(공용 PC 권장).</div>}
      {msg && <div className="text-[12.5px] font-semibold text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{msg}</div>}
      <Btn type="submit" disabled={busy} className="w-full h-12 text-[15px]">{busy ? "로그인 중…" : "로그인"}</Btn>
      <div className="flex items-center justify-between pt-1 text-[11.5px] text-[#7A8AA8]">
        <span>PnK PROJECT 직원 전용 · 로지스웹 계정으로는 들어올 수 없습니다</span>
        <button type="button" onClick={onStatus} className="font-bold text-navy hover:underline shrink-0 ml-2">사번이 아직 없나요?</button>
      </div>
    </form>
  );
}

// 로그인한 계정이 이 사번의 인트라넷 직원인지 — 최고관리자 · 부관리자는 처음 들어올 때(사번 자동 발급 전) 통과
async function checkMember(user, no) {
  const [m, u] = await Promise.all([
    getDoc(doc(db, "pnkMembers", user.uid)).catch(() => null),
    getDoc(doc(db, "users", user.uid)).catch(() => null),
  ]);
  const tm = String(user.email || "").toLowerCase() === "tjddnqkf@naver.com" || (u?.exists() && u.data().role === "totalMaster");
  const md = m?.exists() ? m.data() : null;
  if (tm) return !md?.empNo || md.empNo === no ? { ok: true } : { ok: false, msg: "사번이 맞지 않습니다." };
  if (u?.exists()) return { ok: false, msg: "로지스웹 계정으로는 사내 인트라넷에 들어올 수 없습니다. [회원가입]에서 직원으로 가입해 주세요." };
  if (!md) return { ok: false, msg: "인트라넷 회원이 아닙니다. [회원가입]에서 직원으로 가입해 주세요." };
  if (!md.empNo) return { ok: false, msg: "아직 사번이 없습니다(승인 대기). 아래 [사번이 아직 없나요?]에서 가입 신청 상태를 볼 수 있습니다." };
  if (md.empNo !== no) return { ok: false, msg: "사번 · 이메일 · 비밀번호가 맞지 않습니다." };
  if (md.status === "off") return { ok: false, msg: "사용이 중지된 계정입니다. 관리자에게 문의해 주세요." };
  return { ok: true };
}

// 사번이 아직 없는 사람 — 이메일 · 비밀번호로 가입 신청 상태만 본다(들어가지는 못함)
function StatusForm({ onBack }) {
  const [id, setId] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [res, setRes] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setRes(null);
    try {
      const sc = sideConn(); // 본 로그인과 따로(확인만 하고 바로 로그아웃)
      const cred = await signInWithEmailAndPassword(sc.auth, id.trim(), pw);
      const m = await getDoc(doc(sc.db, "pnkMembers", cred.user.uid)).catch(() => null);
      const u = await getDoc(doc(sc.db, "users", cred.user.uid)).catch(() => null);
      const d = m?.exists() ? m.data() : null;
      await signOut(sc.auth);
      setRes(u?.exists() && !d ? { tone: "red", t: "로지스웹 계정입니다", d: "사내 인트라넷은 [회원가입]으로 가입한 직원만 들어올 수 있습니다." }
        : !d ? { tone: "red", t: "가입 신청이 없습니다", d: "[회원가입]에서 직원으로 가입해 주세요." }
          : d.empNo ? { tone: "green", t: `승인되었습니다 — 사번 ${d.empNo}`, d: "로그인에서 사번 · 이메일 · 비밀번호를 넣어 들어오세요." }
            : d.status === "off" ? { tone: "red", t: "사용이 중지된 계정입니다", d: "관리자에게 문의해 주세요." }
              : { tone: "navy", t: "승인 대기 중입니다", d: `${d.name || ""}님의 가입 신청을 대표 · 관리자가 확인하고 있습니다. 승인되면 사번이 발급됩니다.` });
    } catch (er) { setRes({ tone: "red", t: "확인하지 못했습니다", d: authMsg(er) }); }
    setBusy(false);
  };
  return (
    <form onSubmit={go} className="space-y-3">
      <div className="text-[15px] font-black text-navy-950">가입 신청 상태 확인</div>
      <p className="text-[12.5px] text-[#5A6A86]">회원가입 때 넣은 이메일 · 비밀번호를 넣으세요. 승인되면 사번이 보입니다.</p>
      <Field label="이메일"><Input type="email" value={id} onChange={(e) => setId(e.target.value)} /></Field>
      <Field label="비밀번호"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      {res && <div className={cx("rounded-xl px-3 py-2.5", res.tone === "green" ? "bg-emerald-50 text-emerald-800" : res.tone === "red" ? "bg-rose-50 text-rose-700" : "bg-navy-50 text-navy")}><div className="text-[13.5px] font-black">{res.t}</div><div className="text-[12.5px] mt-0.5">{res.d}</div></div>}
      <Btn type="submit" disabled={busy} className="w-full h-11">{busy ? "확인 중…" : "확인"}</Btn>
      <button type="button" onClick={onBack} className="w-full text-[12.5px] font-semibold text-[#7A8AA8] hover:text-navy">← 로그인으로</button>
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
      <p className="text-[11.5px] leading-relaxed text-[#7A8AA8] text-center">가입 신청 → 대표 · 관리자 승인 → 사번 발급 후 <button type="button" onClick={onDone} className="text-navy font-bold underline">로그인</button>(사번 · 이메일 · 비밀번호)합니다.<br />PnK PROJECT 직원 전용입니다. 로지스웹에서 쓰는 이메일은 쓸 수 없으니 다른 이메일로 가입해 주세요.</p>
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
            : me.logisweb ? <Status icon="shield" title="로지스웹 계정으로는 들어올 수 없습니다">사내 인트라넷은 PnK PROJECT 직원 전용입니다.<br />로그아웃한 뒤 [회원가입]에서 직원으로 가입해 주세요.</Status>
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
