// ======================= src/PayrollGate.jsx =======================
// ⭐ 2026-11-07 급여관리 잠금(비밀번호 한 번 더) — 서버 함수 payrollPwStatus · payrollPwSet · payrollPwVerify · payrollLock(functions/payrollPw.js)
//  · 처음: 경리 관리자가 비밀번호를 정한다(다른 담당자는 "관리자가 먼저 정해야 해요")
//  · 맞으면 서버가 payrollUnlocks/{uid}(30분)를 만들고, 보안 규칙이 이 문서를 보고 급여 문서를 열어 준다
//  · 10분 동안 손대지 않으면 자동으로 다시 잠근다 · [지금 잠그기] · 관리자는 [비밀번호 변경]
//  · 둘러보기(/preview)는 서버 없이 이 브라우저 안에서만 흉내 낸다(실제 데이터는 규칙이 지킨다)
import React from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { db, auth, FUNCTIONS_BASE } from "./firebase";
import { isPreviewMode } from "./fsTenant";

export const IDLE_MS = 10 * 60 * 1000;
const NUMS = { fontVariantNumeric: "tabular-nums" };
const demo = () => { try { return isPreviewMode() || window.location.pathname === "/preview"; } catch { return false; } };

async function call(name, data, force = false) {
  const token = await auth.currentUser?.getIdToken?.(force);
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data }) });
  let j = {};
  try { j = await res.json(); } catch { /* 무시 */ }
  if (!res.ok || j.error) throw new Error(j.error?.message || `요청 실패(${res.status})`);
  return j.result;
}
// 둘러보기용 가짜 서버(이 탭 안에서만)
const DK = "kpDemoPayPw";
const demoApi = {
  status: () => { let pw = ""; let until = 0; try { pw = sessionStorage.getItem(DK) || ""; until = Number(sessionStorage.getItem(`${DK}:until`)) || 0; } catch { /* 무시 */ } return { staff: true, admin: true, hasPassword: true, usingDefault: !pw, unlockedUntil: until > Date.now() ? until : 0, lockUntil: 0 }; },
  set: ({ newPassword, currentPassword }) => { const cur = sessionStorage.getItem(DK); if (cur && cur !== currentPassword) throw new Error("지금 비밀번호가 맞지 않아요"); if (String(newPassword).length < 6) throw new Error("비밀번호는 6자 이상으로 정해 주세요"); sessionStorage.setItem(DK, newPassword); const until = Date.now() + 30 * 60000; sessionStorage.setItem(`${DK}:until`, String(until)); return { ok: true, expiresAt: until, changed: !!cur }; },
  verify: ({ password }) => { const cur = sessionStorage.getItem(DK) || ""; const ok = cur ? cur === password : password === "000000"; if (!ok) return { ok: false, left: 4 }; const until = Date.now() + 30 * 60000; sessionStorage.setItem(`${DK}:until`, String(until)); return { ok: true, expiresAt: until, mustChange: !cur }; },
  lock: () => { sessionStorage.removeItem(`${DK}:until`); return { ok: true }; },
  reset: ({ newPassword }) => { if (String(newPassword).length < 6) throw new Error("비밀번호는 6자 이상으로 정해 주세요"); sessionStorage.setItem(DK, newPassword); const until = Date.now() + 30 * 60000; sessionStorage.setItem(`${DK}:until`, String(until)); return { ok: true, expiresAt: until }; },
};
const api = {
  status: (company) => (demo() ? Promise.resolve(demoApi.status()) : call("payrollPwStatus", { company })),
  set: (company, newPassword, currentPassword) => (demo() ? Promise.resolve().then(() => demoApi.set({ newPassword, currentPassword })) : call("payrollPwSet", { company, newPassword, currentPassword })),
  verify: (company, password) => (demo() ? Promise.resolve(demoApi.verify({ password })) : call("payrollPwVerify", { company, password })),
  lock: (company) => (demo() ? Promise.resolve(demoApi.lock()) : call("payrollLock", { company })),
  // ⭐ 2026-11-10 잊었을 때 — 로그인 비밀번호로 방금 다시 확인한 새 토큰(force)으로 부른다(서버가 확인 시각 5분 안인지 본다)
  reset: (company, newPassword) => (demo() ? Promise.resolve().then(() => demoApi.reset({ newPassword })) : call("payrollPwReset", { company, newPassword }, true)),
};

// ⭐ 2026-11-09 급여관리 바로 열기 — 잠금 상태(서버 함수) 응답을 기다리지 않게
//  · 지난번 상태를 이 탭(sessionStorage)에 기억해 두고 먼저 보여 준다(비밀번호 여부·관리자 여부만 — 급여 데이터는 저장 안 함)
//  · 같은 회사 상태 요청은 한 번만(회계관리 화면에 들어오면 미리 요청 — prefetchPayrollStatus)
//  · 이미 잠금 해제된 상태(payrollUnlocks 문서가 살아 있음)면 서버 응답 전에도 바로 급여 화면을 연다
const stKey = (company) => `kpPayGateSt:${company}:${auth.currentUser?.uid || ""}`;
const readSt = (company) => { try { const v = JSON.parse(sessionStorage.getItem(stKey(company)) || "null"); return v && typeof v === "object" ? v : null; } catch { return null; } };
const writeSt = (company, r) => { try { const { unlockedUntil, lockUntil, ...keep } = r || {}; void unlockedUntil; void lockUntil; sessionStorage.setItem(stKey(company), JSON.stringify(keep)); } catch { /* 무시 */ } };
const stPending = new Map(); // 회사 → { at, p }
// ⭐ 2026-11-10 잠금 해제가 느리던 문제 — 비밀번호 확인 서버(payrollPwVerify)는 자주 안 불려서 매번 처음 켜지느라(콜드 스타트) 몇 초씩 걸렸다.
//  급여 화면에 들어오면(비밀번호를 치는 동안) 미리 한 번 깨워 둔다 — 아무것도 읽거나 쓰지 않는 호출 · 4분에 한 번만
let warmAt = 0;
export function warmPayrollVerify() {
  if (demo() || Date.now() - warmAt < 4 * 60000) return;
  warmAt = Date.now();
  // 로그인 토큰 없이 부른다 — 예전 서버(warm 처리 전)에 닿아도 "로그인 필요"로 끝나서 틀린 횟수로 세지 않는다
  fetch(`${FUNCTIONS_BASE}/payrollPwVerify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { warm: true } }) }).catch(() => { warmAt = 0; });
}
export function prefetchPayrollStatus(company, { force = false } = {}) {
  if (!company) return Promise.resolve(null);
  const key = `${company}:${auth.currentUser?.uid || ""}`;
  const hit = stPending.get(key);
  if (!force && hit && Date.now() - hit.at < 60000) return hit.p;
  const p = api.status(company).then((r) => { writeSt(company, r); return r; });
  p.catch(() => stPending.delete(key));
  stPending.set(key, { at: Date.now(), p });
  return p;
}

const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const inp = "h-12 w-full px-4 rounded-xl border border-[#DCE3EE] bg-white text-[16px] font-bold text-[#0F1A30] outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#8FB0F0]/40 tracking-[0.12em]";
const LockIcon = ({ open = false, size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />{open ? <path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7" /> : <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />}<circle cx="12" cy="15.5" r="1.3" fill="currentColor" />
  </svg>
);

// 비밀번호 정하기 · 바꾸기
function PwForm({ company, mode, onDone, onCancel }) {
  const [cur, setCur] = React.useState("");
  const [a, setA] = React.useState("");
  const [b, setB] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const change = mode === "change";
  const submit = async (e) => {
    e?.preventDefault?.();
    setMsg("");
    if (a.length < 6) return setMsg("비밀번호는 6자 이상으로 정해 주세요");
    if (a !== b) return setMsg("두 번 입력한 비밀번호가 달라요");
    setBusy(true);
    try { const r = await api.set(company, a, change ? cur : undefined); onDone?.(r); } catch (er) { setMsg(er.message || "저장하지 못했어요"); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3" data-testid="payroll-pw-form">
      {change && <label className="block"><span className="block mb-1.5 text-[14px] font-black text-[#3A4A66]">지금 비밀번호</span><input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} className={inp} data-testid="pw-cur" /></label>}
      <label className="block"><span className="block mb-1.5 text-[14px] font-black text-[#3A4A66]">{change ? "새 비밀번호" : "급여 비밀번호"} <span className="font-bold text-[#7A879C]">6자 이상</span></span><input type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} className={inp} data-testid="pw-new" autoFocus={!change} /></label>
      <label className="block"><span className="block mb-1.5 text-[14px] font-black text-[#3A4A66]">한 번 더</span><input type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} className={inp} data-testid="pw-new2" /></label>
      {msg && <div className="rounded-xl bg-[#FEF3F2] border border-[#FECDCA] px-3.5 py-2.5 text-[14px] font-bold text-[#B42318]" role="alert">{msg}</div>}
      <div className="flex gap-2 pt-1">
        {onCancel && <button type="button" onClick={onCancel} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[15px] font-black text-[#3A4A66]">취소</button>}
        <button type="submit" disabled={busy} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50" data-testid="pw-save">{busy ? "저장 중…" : change ? "비밀번호 바꾸기" : "정하고 열기"}</button>
      </div>
    </form>
  );
}

// ⭐ 2026-11-10 급여 비밀번호를 잊었을 때 — 경리 관리자급이 로그인 비밀번호로 본인 확인 → 새 급여 비밀번호
function ResetForm({ company, onDone, onCancel }) {
  const [login, setLogin] = React.useState("");
  const [a, setA] = React.useState("");
  const [b, setB] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const submit = async (e) => {
    e?.preventDefault?.();
    setMsg("");
    if (!demo() && !login) return setMsg("로그인 비밀번호를 넣어 주세요");
    if (a.length < 6) return setMsg("새 급여 비밀번호는 6자 이상으로 정해 주세요");
    if (a !== b) return setMsg("두 번 입력한 비밀번호가 달라요");
    setBusy(true);
    try {
      if (!demo()) {
        const u = auth.currentUser;
        if (!u?.email) throw new Error("로그인 정보를 찾지 못했어요. 다시 로그인해 주세요");
        try { await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, login)); }
        catch (er) { const c = String(er?.code || ""); throw new Error(/wrong-password|invalid-credential|invalid-login/.test(c) ? "로그인 비밀번호가 맞지 않아요" : /too-many/.test(c) ? "여러 번 틀려서 잠시 막혔어요. 조금 뒤 다시 해 주세요" : "본인 확인을 하지 못했어요"); }
      }
      const r = await api.reset(company, a);
      onDone?.(r);
    } catch (er) { setMsg(er.message || "바꾸지 못했어요"); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3" data-testid="payroll-pw-reset">
      <div className="rounded-xl bg-[#F5F8FD] border border-[#DCE3EE] px-3.5 py-2.5 text-[14px] font-bold text-[#1B2B4B] leading-relaxed">지금 쓰는 <b>로그인 비밀번호</b>로 본인 확인을 한 뒤 새 급여 비밀번호를 정합니다. 바꾸면 다른 담당자는 새 비밀번호로 다시 열어야 해요.</div>
      <label className="block"><span className="block mb-1.5 text-[14px] font-black text-[#3A4A66]">로그인 비밀번호</span><input type="password" autoComplete="current-password" value={login} onChange={(e) => setLogin(e.target.value)} className={inp} data-testid="reset-login" autoFocus /></label>
      <label className="block"><span className="block mb-1.5 text-[14px] font-black text-[#3A4A66]">새 급여 비밀번호 <span className="font-bold text-[#7A879C]">6자 이상</span></span><input type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} className={inp} data-testid="reset-new" /></label>
      <label className="block"><span className="block mb-1.5 text-[14px] font-black text-[#3A4A66]">한 번 더</span><input type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} className={inp} data-testid="reset-new2" /></label>
      {msg && <div className="rounded-xl bg-[#FEF3F2] border border-[#FECDCA] px-3.5 py-2.5 text-[14px] font-bold text-[#B42318]" role="alert">{msg}</div>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[15px] font-black text-[#3A4A66]">취소</button>
        <button type="submit" disabled={busy} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50" data-testid="reset-save">{busy ? "확인 중…" : "본인 확인하고 바꾸기"}</button>
      </div>
    </form>
  );
}

function GateCard({ title, desc, children }) {
  return (
    <div className="min-h-[calc(100vh-220px)] w-full grid place-items-center px-3 py-10" data-testid="payroll-gate">
      <div className="w-full max-w-[440px] rounded-[24px] bg-white border border-[#E3E8F0] shadow-[0_24px_60px_rgba(15,26,48,0.14)] overflow-hidden">
        <div className="px-6 pt-6 pb-5 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
          <div className="w-12 h-12 rounded-2xl bg-white/10 ring-1 ring-white/20 grid place-items-center text-[#8FB0F0]"><LockIcon /></div>
          <div className="mt-3 text-[12px] font-extrabold tracking-[0.26em] text-[#8FB0F0]">PAYROLL · LOCKED</div>
          <div className="mt-0.5 text-[21px] font-black">{title}</div>
          {desc && <div className="mt-1 text-[14px] font-bold text-white/75 leading-relaxed">{desc}</div>}
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export default function PayrollGate({ company, canAdmin = false, children }) {
  const uid = auth.currentUser?.uid || "";
  const [st, setSt] = React.useState(() => readSt(company)); // 서버 상태(지난번 값 먼저)
  const [until, setUntil] = React.useState(0);
  const [snapReady, setSnapReady] = React.useState(() => demo() || !uid); // 잠금 해제 문서를 한 번 받았는지
  const [pw, setPw] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [changing, setChanging] = React.useState(false);
  const [resetting, setResetting] = React.useState(false); // ⭐ 2026-11-10 비밀번호 잊었을 때
  const [now, setNow] = React.useState(Date.now());
  const lastAct = React.useRef(Date.now());
  const load = React.useCallback((force = false) => prefetchPayrollStatus(company, { force }).then((r) => { setSt(r); if (demo() || !uid) setUntil(r.unlockedUntil || 0); }).catch((e) => setSt({ error: e.message })), [company, uid]);
  React.useEffect(() => { load(); warmPayrollVerify(); }, [load]);
  // 서버 잠금 해제 문서(다른 탭에서 잠그거나 비밀번호가 바뀌면 바로 잠김)
  React.useEffect(() => {
    if (demo() || !uid) return undefined;
    return onSnapshot(doc(db, "payrollUnlocks", uid), (s) => { const d = s.exists() ? s.data() : null; const ex = d && d.companyName === company ? d.expiresAt?.toMillis?.() || 0 : 0; setUntil(ex > Date.now() ? ex : 0); setSnapReady(true); }, () => setSnapReady(true));
  }, [uid, company]);
  const open = until > now;
  // 시계 · 손대지 않으면 잠금
  React.useEffect(() => {
    if (!open) return undefined;
    const act = () => { lastAct.current = Date.now(); };
    const evs = ["mousedown", "keydown", "touchstart", "wheel", "mousemove"];
    evs.forEach((e) => window.addEventListener(e, act, { passive: true }));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { evs.forEach((e) => window.removeEventListener(e, act)); clearInterval(t); };
  }, [open]);
  const lockNow = React.useCallback(async (why = "") => { setUntil(0); setPw(""); setMsg(why); setChanging(false); stPending.clear(); await api.lock(company).catch(() => {}); }, [company]);
  React.useEffect(() => { if (open && now - lastAct.current > IDLE_MS) lockNow("10분 동안 쓰지 않아 다시 잠갔어요"); }, [now, open, lockNow]);
  React.useEffect(() => { if (!open && until && now >= until) setMsg("30분이 지나 다시 잠갔어요"); }, [now, open, until]);
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);

  const unlock = async (e) => {
    e?.preventDefault?.();
    if (!pw) return;
    setBusy(true); setMsg("");
    try {
      const r = await api.verify(company, pw);
      if (r.ok) { lastAct.current = Date.now(); setNow(Date.now()); setUntil(r.expiresAt); setPw(""); if (r.mustChange) { setSt((s) => ({ ...s, usingDefault: true })); setChanging(true); } }
      else if (r.lockUntil) setMsg(`여러 번 틀려서 ${new Date(r.lockUntil).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}까지 잠겼어요`);
      else setMsg(`비밀번호가 맞지 않아요 · ${r.left}번 더 틀리면 잠깐 잠겨요`);
    } catch (er) { setMsg(er.message || "확인하지 못했어요"); } finally { setBusy(false); }
  };

  // 이미 열려 있으면(잠금 해제 문서가 살아 있음) 서버 응답을 기다리지 않고 바로 연다
  if (!st && !open) return <div className="py-24 text-center text-[15px] font-bold text-[#7A879C]">확인 중…</div>;
  if (st?.error && !open) return <GateCard title="잠금 상태를 확인하지 못했어요" desc={st.error}><button type="button" onClick={() => load(true)} className="w-full h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black">다시 시도</button></GateCard>;
  if (!open && !snapReady) return <div className="py-24 text-center text-[15px] font-bold text-[#7A879C]">확인 중…</div>;
  if (!open && st.staff === false) return <GateCard title="경리 담당자만 열 수 있어요" desc="급여는 경리·회계팀이 관리합니다. 본인 급여명세서는 내정보에서 볼 수 있어요." />;
  if (!open && !st.hasPassword) {
    return (st.admin || canAdmin)
      ? <GateCard title="급여 비밀번호를 정해 주세요" desc="급여관리를 열 때마다 한 번 더 확인합니다. 경리 담당자에게만 알려 주세요."><PwForm company={company} mode="set" onDone={(r) => { lastAct.current = Date.now(); setSt((s) => ({ ...s, hasPassword: true })); setNow(Date.now()); setUntil(r.expiresAt); }} /></GateCard>
      : <GateCard title="아직 급여 비밀번호가 없어요" desc="경리 관리자가 먼저 비밀번호를 정하면 열 수 있어요." />;
  }
  const isPayAdmin = !!(st?.admin || canAdmin);
  if (!open && resetting) {
    return (
      <GateCard title="급여 비밀번호 재설정" desc="비밀번호를 잊었을 때 — 경리 관리자만 할 수 있어요">
        <ResetForm company={company} onCancel={() => setResetting(false)} onDone={(r) => { lastAct.current = Date.now(); setResetting(false); setMsg(""); setSt((s) => ({ ...s, hasPassword: true, usingDefault: false })); stPending.clear(); setNow(Date.now()); setUntil(r.expiresAt); }} />
      </GateCard>
    );
  }
  if (!open) {
    return (
      <GateCard title="급여관리 잠금" desc="급여 비밀번호를 넣으면 30분 동안 열려요.">
        <form onSubmit={unlock} className="space-y-3">
          <input type="password" autoComplete="current-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="급여 비밀번호" className={inp} data-testid="payroll-pw" aria-label="급여 비밀번호" />
          {msg && <div className={`rounded-xl px-3.5 py-2.5 text-[14px] font-bold border ${/틀|잠겼어요|맞지/.test(msg) && !/다시 잠갔/.test(msg) ? "bg-[#FEF3F2] border-[#FECDCA] text-[#B42318]" : "bg-[#F5F8FD] border-[#DCE3EE] text-[#1B2B4B]"}`} role="status">{msg}</div>}
          <button type="submit" disabled={busy || !pw} className="w-full h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-40" data-testid="payroll-unlock">{busy ? "확인 중…" : "잠금 해제"}</button>
          <div className="text-[14px] font-bold text-[#7A879C] leading-relaxed">{st.usingDefault ? "처음 비밀번호는 000000이에요. 들어가면 바로 새 비밀번호로 바꿔 주세요." : isPayAdmin ? "비밀번호를 잊었으면 아래 [비밀번호를 잊었어요]로 다시 정할 수 있어요." : "비밀번호를 잊었으면 경리 관리자에게 바꿔 달라고 하세요."}</div>
          {isPayAdmin && !st.usingDefault && <button type="button" onClick={() => { setMsg(""); setResetting(true); }} className="w-full h-11 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] font-black text-[#1B2B4B]" data-testid="payroll-forgot">비밀번호를 잊었어요</button>}
        </form>
      </GateCard>
    );
  }
  const left = until - now;
  return (
    <div className="space-y-3 w-full min-w-0">
      <div className="rounded-2xl bg-white border border-[#E3E8F0] px-3.5 py-2 flex items-center gap-2.5 flex-wrap" data-testid="payroll-unlocked-bar">
        <span className="w-8 h-8 rounded-lg bg-[#EEF3FC] text-[#2D4C82] grid place-items-center"><LockIcon open size={17} /></span>
        <span className="text-[14px] font-black text-[#0F1A30]">잠금 해제됨</span>
        <span className="text-[14px] font-bold text-[#5B6B85]"><b className="text-[#0F1A30]" style={NUMS}>{mmss(left)}</b> 뒤 잠김 · 10분 쉬면 자동 잠금</span>
        <span className="flex-1" />
        {(st?.admin || canAdmin) && <button type="button" onClick={() => setChanging(true)} className="h-9 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[14px] font-black text-[#1B2B4B]" data-testid="pw-change">비밀번호 변경</button>}
        <button type="button" onClick={() => lockNow("잠갔어요")} className="h-9 px-3 rounded-lg bg-[#0F1A30] text-white text-[14px] font-black" data-testid="payroll-lock">지금 잠그기</button>
      </div>
      {changing && (
        <div className="fixed inset-0 z-[100000] bg-[#0F1A30]/45 grid place-items-center px-3" onClick={() => { if (!(st?.usingDefault && (st?.admin || canAdmin))) setChanging(false); }}>
          <div className="w-full max-w-[440px] rounded-[24px] bg-white shadow-[0_24px_60px_rgba(15,26,48,0.3)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-5 pb-4 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}><div className="text-[12px] font-extrabold tracking-[0.26em] text-[#8FB0F0]">PAYROLL · PASSWORD</div><div className="text-[19px] font-black">급여 비밀번호 변경</div><div className="text-[14px] font-bold text-white/75">바꾸면 다른 담당자는 새 비밀번호로 다시 열어야 해요</div></div>
            <div className="px-6 py-5">
              {st?.usingDefault && <div className="mb-3 rounded-xl bg-[#EEF3FC] border border-[#C9D6EE] px-3.5 py-2.5 text-[14px] font-bold text-[#1B2B4B]">처음 비밀번호(000000)를 쓰고 있어요. 새 비밀번호로 바꿔 주세요.</div>}
              {(st?.admin || canAdmin)
                ? <PwForm company={company} mode={st?.usingDefault ? "set" : "change"} onCancel={st?.usingDefault ? undefined : () => setChanging(false)} onDone={(r) => { setChanging(false); setSt((s) => ({ ...s, usingDefault: false })); setUntil(r.expiresAt); }} />
                : <div className="space-y-3"><div className="text-[14px] font-bold text-[#3A4A66]">비밀번호는 경리 관리자만 바꿀 수 있어요. 관리자에게 바꿔 달라고 해 주세요.</div><button type="button" onClick={() => setChanging(false)} className="w-full h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black">확인</button></div>}
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
