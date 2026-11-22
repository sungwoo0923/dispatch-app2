// ======================= cafe-site/src/hub/HubLogin.jsx =======================
// ⭐ 2026-11-06 허브 로그인 — 유형별 입구(차주 · 화주 · 운송사) + [로지스웹 계정으로 로그인]
//  허브 회원: 차주는 차량번호(아이디) + 휴대폰번호, 화주 · 운송사는 이메일 + 비밀번호(가입 신청 → 관리자 승인)
//  ⭐ 2026-11-07 차주는 이메일 · 비밀번호가 없다. 예전에 이메일로 가입한 차주는 [이메일로 가입했어요]로 이메일 로그인.
//  한 번 로그인하면 계속 로그인돼 있다(Firebase Auth 기본 저장 = 이 기기 IndexedDB, 앱을 껐다 켜도 유지 · cafe-site/src/firebase.js).
//  로그아웃하면 차량번호는 입력된 채로 둔다(휴대폰번호는 저장하지 않음).
//  로지스웹 계정: 운송사 직원(회사명·회사코드·이메일·비밀번호) / 소속 기사(운송사·차량번호·이름) / 화주사(회사명·회사코드·이메일·비밀번호)
import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "../firebase";
import HubAuthLayout from "./HubAuthLayout";
import { HI, Btn, inputCls, Field } from "./hubUi";
import { ROLES, fmtPhone } from "./hubConstants";
import { claimSession } from "./hubApi";
import { loginHubMember, loginHubDriver, loginLogiswebDriver, loginLogiswebShipper, loginLogiswebStaff, loginHubAdmin, findMyCompanyCode, readPublicCompanies, authErrorText, driverAuthErrorText, readSavedPlate, hubDriverEmail, phoneDigits } from "./hubLink";
import { HubDeviceGate, DriverPcBlock, isMobileDevice } from "./hubDevice";

// 앱이 등록 기기가 아니라서 로그아웃시킬 때 남기는 안내(HubApp)
const takeNotice = () => { try { const v = sessionStorage.getItem("hubLoginNotice") || ""; sessionStorage.removeItem("hubLoginNotice"); return v; } catch { return ""; } };

const SAVE_KEY = "hubLoginSaved";
const readSaved = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}"); } catch { return {}; } };

export default function HubLogin() {
  const [sp, setSp] = useSearchParams();
  const saved = readSaved();
  const role = ROLES[sp.get("role")] ? sp.get("role") : saved.role || "driver";
  const mode = ["logisweb", "hub", "admin"].includes(sp.get("mode")) ? sp.get("mode") : saved.mode === "logisweb" ? "logisweb" : "hub";
  const [f, setF] = useState({ plate: readSavedPlate(), phone: "", email: saved.email || "", password: "", companyName: saved.companyName || "", companyCode: saved.companyCode || "", carNo: saved.carNo || "", name: saved.name || "" });
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState(() => takeNotice());
  const [gate, setGate] = useState(null); // 문자 인증 · 기기 등록 단계 { reason, phone, uid, relogin, m }
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [driverEmail, setDriverEmail] = useState(false); // 예전에 이메일로 가입한 차주
  const admin = mode === "admin"; // ⭐ 2026-11-22 관리자 로그인 — 이메일 · 비밀번호만
  const plateLogin = mode === "hub" && role === "driver" && !driverEmail;
  const pcBlocked = mode === "hub" && role === "driver" && !isMobileDevice(); // 차주 화면은 휴대폰에서만
  const nav = useNavigate();
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const go = (r, m) => { setErr(""); setMsg(""); setSp({ role: r, mode: m }, { replace: true }); };

  const submit = async (e) => {
    e?.preventDefault();
    setErr(""); setMsg("");
    setBusy(true);
    try {
      let m;
      if (admin) {
        m = await loginHubAdmin({ email: f.email, password: f.password });
      } else if (plateLogin) {
        m = await loginHubDriver({ plate: f.plate, phone: f.phone });
        if (m.needSignup && !m.device) { nav("/signup?role=driver", { replace: true, state: { phone: f.phone } }); return; }
      } else if (mode === "hub") {
        if (!f.email.trim() || !f.password) throw Object.assign(new Error("이메일과 비밀번호를 입력해 주세요."), { hub: true });
        m = await loginHubMember({ email: f.email, password: f.password, role });
      } else if (role === "driver") m = await loginLogiswebDriver(f);
      else if (role === "shipper") m = await loginLogiswebShipper(f);
      else m = await loginLogiswebStaff(f);
      if (m.device) {
        const plate = f.plate, phone = f.phone, email = f.email.trim(), pw = f.password;
        setGate({ m, reason: m.device, phone: plateLogin ? phone : m.phone, uid: m.id,
          relogin: () => (plateLogin ? signInWithEmailAndPassword(auth, hubDriverEmail(plate), phoneDigits(phone)) : signInWithEmailAndPassword(auth, email, pw)) });
        return;
      }
      await finish(m);
    } catch (e2) {
      setErr(plateLogin ? driverAuthErrorText(e2) : authErrorText(e2));
    } finally { setBusy(false); }
  };
  const finish = async (m) => {
    if (m.admin) { await claimSession(m.id).catch(() => {}); nav("/admin", { replace: true }); return; } // 관리자도 이 기기 번호를 남긴다(예전 번호가 남아 바로 튕기지 않게) // 최고관리자 · 부관리자 — 바로 관리자 화면
    if (m.needSignup) { nav("/signup?role=driver", { replace: true, state: { phone: f.phone } }); return; }
    await claimSession(m.uid || m.id);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ role, mode: admin ? "hub" : mode, email: f.email, companyName: f.companyName, companyCode: f.companyCode, carNo: f.carNo, name: f.name })); } catch { /* 무시 */ }
    nav("/", { replace: true });
  };
  const reset = async () => {
    setErr(""); setMsg("");
    if (!f.email.trim()) return setErr("비밀번호를 재설정할 이메일을 입력해 주세요.");
    try { await sendPasswordResetEmail(auth, f.email.trim()); setMsg("재설정 메일을 보냈어요. 메일함을 확인해 주세요."); } catch { setErr("재설정 메일을 보내지 못했어요."); }
  };

  const lw = mode === "logisweb";
  // 회사코드 찾기 — 이메일 · 비밀번호를 넣어야 눌린다(로지스웹 운송사 로그인과 같음)
  const codeReady = !!f.email.trim() && !!f.password;
  const [codeBox, setCodeBox] = useState(null); // { busy } | { err } | { companyName, companyCode } | { admin }
  const findCode = async () => {
    if (!codeReady) return;
    setCodeBox({ busy: true });
    try {
      const r = await findMyCompanyCode({ email: f.email, password: f.password });
      setCodeBox(r);
      if (r.companyName && !f.companyName.trim()) setF((p) => ({ ...p, companyName: r.companyName }));
    } catch (e2) { setCodeBox({ err: authErrorText(e2) }); }
  };
  const lwTitle = { driver: "로지스웹 소속 기사", shipper: "로지스웹 화주사", carrier: "로지스웹 운송사 직원" }[role];
  return (
    <HubAuthLayout sub={gate ? "본인 휴대폰 확인" : lw ? "가입 없이 기존 계정으로" : "로지스웹 허브"} title={gate ? (gate.reason === "need-sms" ? "문자 인증" : "다른 휴대폰이에요") : lw ? `${lwTitle} 로그인` : "로그인"}
      footer={<Link to={`/signup?role=${role}`} className="text-[15px] font-semibold text-[#55657F] hover:text-[#0F1A30]">처음이신가요? <b className="text-[#1B2B4B]">{ROLES[role].label} 회원가입</b></Link>}>
      {gate ? (
        <HubDeviceGate reason={gate.reason} phone={gate.phone} uid={gate.uid} relogin={gate.relogin}
          onDone={() => finish(gate.m).catch((e2) => { setGate(null); setErr(authErrorText(e2)); })}
          onCancel={() => { signOut(auth).catch(() => {}); setGate(null); setF((p) => ({ ...p, phone: "" })); }} />
      ) : <>
      {!admin && <>
      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="회원 유형">
        {Object.entries(ROLES).map(([k, r]) => (
          <button key={k} type="button" role="tab" aria-selected={role === k} data-testid={`role-${k}`} onClick={() => go(k, mode)}
            className={`h-[78px] rounded-2xl flex flex-col items-center justify-center gap-1.5 transition ${role === k ? "bg-[#0F1A30] text-white shadow-[0_10px_24px_rgba(11,20,40,.25)]" : "bg-[#F5F7FB] text-[#3A4A66] ring-1 ring-inset ring-[#E2E7EF] hover:ring-[#2D4C82]"}`}>
            <HI name={r.icon} size={22} className={role === k ? "text-[#8FB0F0]" : ""} />
            <span className="text-[16px] font-extrabold">{r.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[#EEF2F8]">
        {[["hub", "허브 회원"], ["logisweb", "로지스웹 계정"]].map(([k, l]) => (
          <button key={k} type="button" data-testid={`mode-${k}`} onClick={() => go(role, k)} aria-pressed={mode === k}
            className={`h-11 rounded-xl text-[15px] font-bold transition ${mode === k ? "bg-white text-[#0F1A30] shadow-[0_2px_8px_rgba(15,26,48,.12)]" : "text-[#55657F]"}`}>{l}</button>
        ))}
      </div>
      </>}

      {pcBlocked ? <div className="mt-6"><DriverPcBlock inline /></div> : (
      <form className="mt-5 space-y-3.5" onSubmit={submit}>
        {plateLogin && <>
          <Field label="차량번호" hint="아이디예요. 전부 입력해 주세요">
            <input className={inputCls} autoComplete="username" lang="ko" placeholder="예: 경기12가3456" value={f.plate} onChange={set("plate")} data-testid="login-plate" />
          </Field>
          <Field label="휴대폰번호">
            <input className={inputCls} type="tel" inputMode="numeric" autoComplete="tel" placeholder="010-0000-0000" value={f.phone} onChange={(e) => setF((p) => ({ ...p, phone: fmtPhone(e.target.value) }))} data-testid="login-phone" />
          </Field>
        </>}
        {admin && <div className="rounded-2xl bg-[#0F1A30] text-white px-4 py-3 text-[15px] font-bold flex items-center gap-2" data-testid="admin-mode"><HI name="shield" size={18} className="text-[#8FB0F0]" />관리자 로그인 — 이메일 · 비밀번호만 넣어요</div>}
        {!lw && !plateLogin && <>
          <Field label="이메일"><input className={inputCls} type="email" autoComplete="username" placeholder="name@company.com" value={f.email} onChange={set("email")} data-testid="login-email" /></Field>
          <Field label="비밀번호">
            <div className="relative">
              <input className={`${inputCls} pr-16`} type={showPw ? "text" : "password"} autoComplete="current-password" placeholder="비밀번호" value={f.password} onChange={set("password")} data-testid="login-password" />
              <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-3 text-[14px] font-bold text-[#55657F]">{showPw ? "숨기기" : "보기"}</button>
            </div>
          </Field>
        </>}
        {lw && role === "driver" && <>
          <Field label="소속 운송사"><input className={inputCls} placeholder="예: 한빛로지스" value={f.companyName} onChange={set("companyName")} data-testid="lw-company" /></Field>
          <Field label="차량번호" hint="기사앱에 등록한 차량번호(띄어쓰기 상관없음)"><input className={inputCls} placeholder="예: 경기12가3456" value={f.carNo} onChange={set("carNo")} data-testid="lw-car" /></Field>
          <Field label="이름"><input className={inputCls} placeholder="이름" value={f.name} onChange={set("name")} data-testid="lw-name" /></Field>
        </>}
        {lw && role !== "driver" && <>
          <Field label={<span className="flex items-center justify-between w-full">회사코드<button type="button" onClick={findCode} disabled={!codeReady || codeBox?.busy} title={codeReady ? "가입한 계정으로 확인한 뒤 내 회사코드를 보여 드려요" : "아래 이메일 · 비밀번호를 먼저 넣어 주세요"} data-testid="lw-code-find"
            className={`text-[14px] font-extrabold ${codeReady ? "text-[#2D4C82] hover:underline" : "text-[#B8C3D6] cursor-not-allowed"}`}>{codeBox?.busy ? "확인 중…" : "회사코드 찾기"}</button></span>}>
            <input className={`${inputCls} ${f.companyCode ? "tracking-[0.12em]" : ""}`} placeholder="승인 후 발급된 코드" value={f.companyCode} onChange={(e) => setF((p) => ({ ...p, companyCode: e.target.value.toUpperCase() }))} data-testid="lw-code" />
          </Field>
          {codeBox && !codeBox.busy && (
            <div className="rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#C7D3E8] px-4 py-3 text-[15px] text-[#1B2B4B]" data-testid="lw-code-result">
              {codeBox.err ? <b>{codeBox.err}</b>
                : codeBox.admin ? <b>관리자 계정이에요. 회사명 · 회사코드 없이 로그인하면 돼요.</b>
                : codeBox.companyCode ? <div className="flex items-center gap-3"><span className="min-w-0 flex-1"><span className="block text-[13.5px] text-[#55657F] truncate">{codeBox.companyName}</span><span className="block text-[20px] font-extrabold tracking-[0.12em]">{codeBox.companyCode}</span></span>
                    <Btn size="md" onClick={() => { setF((p) => ({ ...p, companyCode: codeBox.companyCode, companyName: codeBox.companyName || p.companyName })); setCodeBox(null); }} data-testid="lw-code-apply">넣기</Btn></div>
                : <b>이 계정은 회사코드 없이 로그인해요. 회사코드 칸은 비워 두면 돼요.</b>}
            </div>
          )}
          <Field label="회사명"><CompanySearch value={f.companyName} onChange={(v) => setF((p) => ({ ...p, companyName: v }))} /></Field>
          <Field label="이메일"><input className={inputCls} type="email" autoComplete="username" placeholder="로지스웹 로그인 이메일" value={f.email} onChange={set("email")} data-testid="login-email" /></Field>
          <Field label="비밀번호"><input className={inputCls} type="password" autoComplete="current-password" placeholder="로지스웹 비밀번호" value={f.password} onChange={set("password")} data-testid="login-password" /></Field>
          <div className="text-[13.5px] text-[#5F6E87]">최고관리자는 이메일 · 비밀번호만 넣으면 돼요.</div>
        </>}

        {err && <div role="alert" data-testid="login-error" className="rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#C7D3E8] px-4 py-3 text-[15px] font-bold text-[#0F1A30] flex gap-2"><HI name="alert" size={18} className="shrink-0 mt-0.5 text-[#2D4C82]" />{err}</div>}
        {msg && <div className="rounded-2xl bg-[#EAF0FA] px-4 py-3 text-[15px] font-bold text-[#1B2B4B]">{msg}</div>}

        <Btn type="submit" size="xl" className="w-full" disabled={busy} data-testid="login-submit">{busy ? "확인하고 있어요" : "로그인"}</Btn>
        {plateLogin && (
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => { setErr(""); setDriverEmail(true); }} className="h-11 text-[14.5px] font-semibold text-[#55657F] underline underline-offset-4" data-testid="driver-email-link">이메일로 가입했어요</button>
            <Link to="/signup?role=driver" className="h-11 inline-flex items-center text-[15px] font-bold text-[#1B2B4B]">회원가입</Link>
          </div>
        )}
        {!admin && !lw && !plateLogin && role === "driver" && (
          <button type="button" onClick={() => { setErr(""); setDriverEmail(false); }} className="h-10 text-[14.5px] font-semibold text-[#55657F] underline underline-offset-4" data-testid="driver-plate-link">차량번호로 로그인</button>
        )}
        {!lw && !plateLogin && (
          <div className="flex items-center justify-between">
            <button type="button" onClick={reset} className="h-11 text-[15px] font-semibold text-[#55657F]">비밀번호 찾기</button>
            {!admin && <Link to={`/signup?role=${role}`} className="h-11 inline-flex items-center text-[15px] font-bold text-[#1B2B4B]">회원가입</Link>}
          </div>
        )}
      </form>
      )}

      {admin ? (
        <button type="button" onClick={() => go(role, "hub")} className="mt-4 h-11 text-[15px] font-bold text-[#55657F] inline-flex items-center gap-1.5" data-testid="admin-back"><HI name="back" size={17} />회원 로그인으로</button>
      ) : !lw ? (
        <button type="button" onClick={() => go(role, "logisweb")} data-testid="go-logisweb"
          className="mt-4 w-full rounded-2xl p-4 flex items-center gap-3 text-left text-white transition hover:brightness-110" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
          <img src="/brand/logisweb-mark-square.svg" alt="" className="w-11 h-11 rounded-xl" />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-extrabold">로지스웹 계정으로 로그인</span>
            <span className="block text-[14px] text-white/65" data-testid="go-logisweb-caption">로지스웹 가입자는 누르세요</span>
          </span>
          <HI name="chevron" size={20} className="text-[#8FB0F0]" />
        </button>
      ) : (
        <div className="mt-5 pt-4 border-t border-[#EEF1F6] text-[14.5px] text-[#55657F] leading-relaxed">
          로지스웹에 등록된 정보(회사, 차량, 연락처)가 그대로 허브 회원 정보가 돼요. 정보 변경은 로지스웹 프로그램에서 해 주세요.
          {role === "driver" && " 소속 기사는 허브에서 \"차주\"로, 운송사 직원은 \"운송사\"로 이용해요."}
        </div>
      )}
      {!admin && !gate && <div className="mt-4 text-center"><button type="button" onClick={() => go(role, "admin")} className="h-10 text-[14px] font-semibold text-[#7A879C] hover:text-[#0F1A30] inline-flex items-center gap-1.5" data-testid="go-admin"><HI name="shield" size={15} />관리자 로그인</button></div>}
      </>}
    </HubAuthLayout>
  );
}

// ⭐ 2026-11-22 회사명 조회 — 로지스웹 가입 화면과 같은 공개 운송사 목록에서 찾아 고른다(직접 입력도 그대로 됨)
function CompanySearch({ value, onChange }) {
  const [all, setAll] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); document.addEventListener("touchstart", h);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h); };
  }, [open]);
  const load = async () => {
    if (all) { setOpen(true); return; }
    setBusy(true);
    try { setAll(await readPublicCompanies()); } catch { setAll([]); } finally { setBusy(false); setOpen(true); }
  };
  const k = String(value || "").replace(/\s+/g, "").toLowerCase();
  const hits = (all || []).filter((c) => !k || String(c.companyName).replace(/\s+/g, "").toLowerCase().includes(k)).slice(0, 30);
  return (
    <div ref={box} className="relative">
      <div className="flex gap-2">
        <input className={inputCls} placeholder="가입한 회사명" value={value} data-testid="lw-company"
          onChange={(e) => { onChange(e.target.value); if (all) setOpen(true); }} onFocus={() => all && setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" && !all) { e.preventDefault(); load(); } }} />
        <Btn kind="soft" size="lg" className="shrink-0" onClick={load} disabled={busy} data-testid="lw-company-search">{busy ? "조회 중" : "조회"}</Btn>
      </div>
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-2 bg-white rounded-2xl ring-1 ring-inset ring-[#DCE3EE] shadow-[0_24px_60px_rgba(11,20,40,.18)] max-h-[260px] overflow-y-auto" data-testid="lw-company-list">
          {hits.length ? hits.map((c) => (
            <button key={c.companyName} type="button" onClick={() => { onChange(c.companyName); setOpen(false); }} className="w-full text-left px-4 py-3 border-b border-[#EEF1F6] last:border-0 hover:bg-[#F5F8FD]">
              <span className="block text-[15.5px] font-bold text-[#0F1A30]">{c.companyName}</span>
              {c.address && <span className="block text-[13.5px] text-[#66758E] truncate">{c.address}</span>}
            </button>
          )) : <div className="px-4 py-4 text-[14.5px] text-[#55657F]">{value ? `"${value}"(으)로 등록된 회사가 없어요` : "등록된 회사가 없어요"}</div>}
        </div>
      )}
    </div>
  );
}
