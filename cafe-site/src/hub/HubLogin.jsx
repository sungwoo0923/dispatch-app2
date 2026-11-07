// ======================= cafe-site/src/hub/HubLogin.jsx =======================
// ⭐ 2026-11-06 허브 로그인 — 유형별 입구(차주 · 화주 · 운송사) + [로지스웹 계정으로 로그인]
//  허브 회원: 이메일 + 비밀번호(가입 신청 → 관리자 승인)
//  로지스웹 계정: 운송사 직원(회사명·회사코드·이메일·비밀번호) / 소속 기사(운송사·차량번호·이름) / 화주사(회사명·회사코드·이메일·비밀번호)
import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";
import HubAuthLayout from "./HubAuthLayout";
import { HI, Btn, inputCls, Field } from "./hubUi";
import { ROLES } from "./hubConstants";
import { claimSession } from "./hubApi";
import { loginHubMember, loginLogiswebDriver, loginLogiswebShipper, loginLogiswebStaff, authErrorText } from "./hubLink";

const SAVE_KEY = "hubLoginSaved";
const readSaved = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}"); } catch { return {}; } };

export default function HubLogin() {
  const [sp, setSp] = useSearchParams();
  const saved = readSaved();
  const role = ROLES[sp.get("role")] ? sp.get("role") : saved.role || "driver";
  const mode = sp.get("mode") === "logisweb" ? "logisweb" : sp.get("mode") === "hub" ? "hub" : saved.mode || "hub";
  const [f, setF] = useState({ email: saved.email || "", password: "", companyName: saved.companyName || "", companyCode: saved.companyCode || "", carNo: saved.carNo || "", name: saved.name || "" });
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const nav = useNavigate();
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const go = (r, m) => { setErr(""); setMsg(""); setSp({ role: r, mode: m }, { replace: true }); };

  const submit = async (e) => {
    e?.preventDefault();
    setErr(""); setMsg("");
    setBusy(true);
    try {
      let m;
      if (mode === "hub") {
        if (!f.email.trim() || !f.password) throw Object.assign(new Error("이메일과 비밀번호를 입력해 주세요."), { hub: true });
        m = await loginHubMember({ email: f.email, password: f.password, role });
      } else if (role === "driver") m = await loginLogiswebDriver(f);
      else if (role === "shipper") m = await loginLogiswebShipper(f);
      else m = await loginLogiswebStaff(f);
      await claimSession(m.uid || m.id);
      try { localStorage.setItem(SAVE_KEY, JSON.stringify({ role, mode, email: f.email, companyName: f.companyName, companyCode: f.companyCode, carNo: f.carNo, name: f.name })); } catch { /* 무시 */ }
      nav("/", { replace: true });
    } catch (e2) {
      setErr(authErrorText(e2));
    } finally { setBusy(false); }
  };
  const reset = async () => {
    setErr(""); setMsg("");
    if (!f.email.trim()) return setErr("비밀번호를 재설정할 이메일을 입력해 주세요.");
    try { await sendPasswordResetEmail(auth, f.email.trim()); setMsg("재설정 메일을 보냈어요. 메일함을 확인해 주세요."); } catch { setErr("재설정 메일을 보내지 못했어요."); }
  };

  const lw = mode === "logisweb";
  const lwTitle = { driver: "로지스웹 소속 기사", shipper: "로지스웹 화주사", carrier: "로지스웹 운송사 직원" }[role];
  return (
    <HubAuthLayout sub={lw ? "가입 없이 기존 계정으로" : "로지스웹 허브"} title={lw ? `${lwTitle} 로그인` : "로그인"}
      footer={<Link to={`/signup?role=${role}`} className="text-[15px] font-semibold text-[#55657F] hover:text-[#0F1A30]">처음이신가요? <b className="text-[#1B2B4B]">{ROLES[role].label} 회원가입 →</b></Link>}>
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

      <form className="mt-5 space-y-3.5" onSubmit={submit}>
        {!lw && <>
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
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="회사명"><input className={inputCls} placeholder="가입한 회사명" value={f.companyName} onChange={set("companyName")} data-testid="lw-company" /></Field>
            <Field label="회사코드"><input className={inputCls} placeholder="승인 코드" value={f.companyCode} onChange={(e) => setF((p) => ({ ...p, companyCode: e.target.value.toUpperCase() }))} data-testid="lw-code" /></Field>
          </div>
          <Field label="이메일"><input className={inputCls} type="email" autoComplete="username" placeholder="로지스웹 로그인 이메일" value={f.email} onChange={set("email")} data-testid="login-email" /></Field>
          <Field label="비밀번호"><input className={inputCls} type="password" autoComplete="current-password" placeholder="로지스웹 비밀번호" value={f.password} onChange={set("password")} data-testid="login-password" /></Field>
        </>}

        {err && <div role="alert" data-testid="login-error" className="rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#C7D3E8] px-4 py-3 text-[15px] font-bold text-[#0F1A30] flex gap-2"><HI name="alert" size={18} className="shrink-0 mt-0.5 text-[#2D4C82]" />{err}</div>}
        {msg && <div className="rounded-2xl bg-[#EAF0FA] px-4 py-3 text-[15px] font-bold text-[#1B2B4B]">{msg}</div>}

        <Btn type="submit" size="xl" className="w-full" disabled={busy} data-testid="login-submit">{busy ? "확인하고 있어요" : "로그인"}</Btn>
        {!lw && (
          <div className="flex items-center justify-between">
            <button type="button" onClick={reset} className="h-11 text-[15px] font-semibold text-[#55657F]">비밀번호 찾기</button>
            <Link to={`/signup?role=${role}`} className="h-11 inline-flex items-center text-[15px] font-bold text-[#1B2B4B]">회원가입 →</Link>
          </div>
        )}
      </form>

      {!lw ? (
        <button type="button" onClick={() => go(role, "logisweb")} data-testid="go-logisweb"
          className="mt-4 w-full rounded-2xl p-4 flex items-center gap-3 text-left text-white transition hover:brightness-110" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
          <img src="/brand/logisweb-mark-square.svg" alt="" className="w-11 h-11 rounded-xl" />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-extrabold">로지스웹 계정으로 로그인</span>
            <span className="block text-[14px] text-white/65">운송사 직원, 소속 기사, 화주사는 가입 없이 바로</span>
          </span>
          <HI name="chevron" size={20} className="text-[#8FB0F0]" />
        </button>
      ) : (
        <div className="mt-5 pt-4 border-t border-[#EEF1F6] text-[14.5px] text-[#55657F] leading-relaxed">
          로지스웹에 등록된 정보(회사, 차량, 연락처)가 그대로 허브 회원 정보가 돼요. 정보 변경은 로지스웹 프로그램에서 해 주세요.
          {role === "driver" && " 소속 기사는 허브에서 \"차주\"로, 운송사 직원은 \"운송사\"로 이용해요."}
        </div>
      )}
    </HubAuthLayout>
  );
}
