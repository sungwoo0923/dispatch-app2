// ======================= cafe-site/src/hub/HubSignup.jsx =======================
// ⭐ 2026-11-06 허브 회원가입(신청서 + 서류) → 관리자 승인
//  차주: 사업자등록증 · 화물운송종사자격증 · 자동차등록증 · 운전면허증 · 적재물배상보험 증권 · 통장사본 + 차량 정보 · 프로필 사진
//  화주: 사업자등록증 (+ 담당자 재직·위임 확인) · 운송사: 사업자등록증 · 화물운송사업 허가증 (+ 재직·위임 확인 · 통장사본)
//  단계: 유형 → 계정 → 정보 → 서류 → 확인·동의. 거절된 신청은 같은 화면에서 고쳐 다시 제출한다(?edit=1).
//  ⭐ 2026-11-07 차주 계정 = 차량번호(풀 넘버) + 휴대폰번호(이메일 · 비밀번호 없음). [계정] 단계에서 바로 계정을 만들어
//  같은 차량번호가 이미 있으면 서류를 올리기 전에 "이미 가입된 차량번호예요"로 알려 준다.
//  차량번호 · 휴대폰번호는 로그인 정보라 가입 뒤에는 화면에서 못 바꾼다(관리자 콘솔에서 바꾸면 로그인 정보도 같이 바뀜).
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase";
import HubAuthLayout from "./HubAuthLayout";
import { HI, Btn, Field, inputCls, selectCls, Chip, FilePick } from "./hubUi";
import { ROLES, ROLE_DOCS, DOC_TYPES, HUB_VEHICLES, HUB_TONS, SIDO_LIST, sigunguOf, fmtPhone, fmtBizNo, bizNoValid, BANKS } from "./hubConstants";
import { getMember, submitApplication, uploadMemberFile, claimSession } from "./hubApi";
import { HubDeviceGate, bindDevice } from "./hubDevice";
import { authErrorText, driverAuthErrorText, createHubDriverAccount, verifyHubDriverPhone, isHubDriverEmail, plateOfHubEmail, plateValid, phoneValid, normPlate } from "./hubLink";

const STEPS = ["유형", "계정", "정보", "서류", "확인"];
const EMPTY = { email: "", pw: "", pw2: "", name: "", phone: "", companyName: "", bizNo: "", ceoName: "", managerTitle: "", bizAddress: "", permitNo: "",
  plate: "", vtype: "", vton: "", vlen: "", vwid: "", homeSido: "", homeSgg: "", regions: [], bank: "", bankNo: "", bankHolder: "" };

export default function HubSignup() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const loc = useLocation();
  const [user, setUser] = useState(undefined);
  const [existing, setExisting] = useState(null);
  const [role, setRole] = useState(ROLES[sp.get("role")] ? sp.get("role") : "driver");
  const [step, setStep] = useState(ROLES[sp.get("role")] ? 1 : 0);
  const [f, setF] = useState(EMPTY);
  const [files, setFiles] = useState({}); // key → { file } | { path, name }
  const [agree, setAgree] = useState({ terms: false, privacy: false, docs: false });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  // 이 화면에서 방금 계정을 만들었거나 로그인 화면에서 넘어왔으면 휴대폰번호는 이미 확인됨(로그인 화면은 번호를 메모리로만 넘긴다)
  const [phoneLocked, setPhoneLocked] = useState(() => !!loc.state?.phone);
  const [devGate, setDevGate] = useState(null); // 차주 계정을 만든 직후 문자 인증 · 기기 등록
  useEffect(() => { if (loc.state?.phone) setF((p) => ({ ...p, phone: fmtPhone(loc.state.phone) })); }, [loc.state]);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u || null)), []);
  useEffect(() => {
    if (!user) return;
    const plateUser = isHubDriverEmail(user.email);
    if (plateUser) { setRole("driver"); setF((p) => ({ ...p, plate: plateOfHubEmail(user.email) })); }
    // 이어 쓰는 차주 — 이 휴대폰이 등록 기기가 아니면 다시 로그인(로그인 화면이 문자 인증을 한다)
    if (plateUser && !devGate) bindDevice().then((r) => {
      if (r?.ok) return;
      try { sessionStorage.setItem("hubLoginNotice", "다시 로그인해 주세요"); } catch { /* 무시 */ }
      signOut(auth).finally(() => nav("/login?role=driver&mode=hub", { replace: true }));
    }).catch(() => {});
    getMember(user.uid).then((m) => {
      if (!m) return; // 계정만 만들고 신청서가 없는 경우, 이어서 작성
      if (m.source !== "signup" || m.status === "approved") { nav("/", { replace: true }); return; }
      setExisting(m);
      setRole(m.role);
      setF((p) => ({ ...p, name: m.name || "", phone: m.phone || "", companyName: m.companyName || "", bizNo: m.bizNo || "", ceoName: m.ceoName || "", managerTitle: m.managerTitle || "", bizAddress: m.bizAddress || "", permitNo: m.permitNo || "",
        plate: m.vehicle?.plate || "", vtype: m.vehicle?.type || "", vton: m.vehicle?.ton || "", vlen: m.vehicle?.length || "", vwid: m.vehicle?.width || "",
        homeSido: m.home?.sido || "", homeSgg: m.home?.sigungu || "", regions: m.regions || [], bank: m.bank?.bank || "", bankNo: m.bank?.number || "", bankHolder: m.bank?.holder || "" }));
      setFiles({ ...(m.docs || {}), ...(m.photoPath ? { photo: { path: m.photoPath, name: "프로필 사진" } } : {}) });
      if (plateUser) setPhoneLocked(true);
      setStep(2);
    });
  }, [user, nav]);
  const loggedIn = !!user;
  const plateUser = loggedIn && isHubDriverEmail(user?.email);
  useEffect(() => { if (loggedIn && step === 1 && !devGate) setStep(2); }, [loggedIn, step, devGate]);

  const set = (k, fmt) => (e) => setF((p) => ({ ...p, [k]: fmt ? fmt(e.target.value) : e.target.value }));
  const docs = ROLE_DOCS[role];
  const needPhoto = role === "driver";

  const check = (s) => {
    if (s === 1 && !loggedIn && role === "driver") {
      if (!plateValid(f.plate)) return "차량번호를 전부 입력해 주세요. 예: 경기12가3456";
      if (!phoneValid(f.phone)) return "휴대폰번호를 정확히 입력해 주세요";
    } else if (s === 1 && !loggedIn) {
      if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return "이메일을 정확히 입력해 주세요.";
      if (f.pw.length < 8) return "비밀번호는 8자 이상으로 정해 주세요.";
      if (f.pw !== f.pw2) return "비밀번호가 서로 다릅니다.";
    }
    if (s === 2) {
      if (!f.name.trim()) return role === "driver" ? "이름을 입력해 주세요." : "담당자 이름을 입력해 주세요.";
      if (role === "driver" ? !phoneValid(f.phone) : f.phone.replace(/\D/g, "").length < 10) return "휴대폰 번호를 정확히 입력해 주세요.";
      if (role !== "driver" && !f.companyName.trim()) return "회사명을 입력해 주세요.";
      if (!bizNoValid(f.bizNo)) return "사업자등록번호가 올바르지 않아요(10자리, 국세청 검증식).";
      if (role === "driver") {
        if (!plateValid(f.plate)) return "차량번호를 전부 입력해 주세요. 예: 경기12가3456";
        if (!f.vtype || !f.vton) return "차종과 톤수를 골라 주세요.";
        if (!f.vlen) return "적재함 길이를 입력해 주세요.";
        if (!f.homeSido) return "거주(차고지) 지역을 골라 주세요.";
      }
      // ⭐ 2026-11-07 오더를 받는 회원(차주 · 운송사)은 운송료 받을 본인 실계좌가 꼭 있어야 한다(배차신청 규칙도 같은 기준)
      if (role !== "shipper" && (!f.bank || f.bankNo.replace(/[^\d]/g, "").length < 6)) return "운송료 받을 계좌를 넣어 주세요";
    }
    if (s === 3) {
      const miss = docs.required.filter((k) => !files[k]);
      if (miss.length) return `필수 서류를 올려 주세요: ${miss.map((k) => DOC_TYPES[k]).join(", ")}`;
      if (needPhoto && !files.photo) return "프로필 사진을 올려 주세요(배차된 화주에게 보이에요).";
    }
    if (s === 4 && !(agree.terms && agree.privacy && agree.docs)) return "모든 항목에 동의해 주세요.";
    return "";
  };
  const next = async () => {
    const e = check(step); setErr(e);
    if (e) return;
    // 차주는 [계정] 단계에서 바로 계정을 만든다(로그인되면 위 effect가 [정보] 단계로 넘긴다)
    if (step === 1 && !loggedIn && role === "driver") {
      setBusy("확인하고 있어요");
      setDevGate("need-sms"); // 계정이 생기자마자 [정보]로 넘어가지 않게 먼저 켠다
      try { await createHubDriverAccount({ plate: f.plate, phone: f.phone }); setPhoneLocked(true); setF((p) => ({ ...p, plate: normPlate(p.plate) })); }
      catch (e2) { setDevGate(null); setErr(driverAuthErrorText(e2)); }
      finally { setBusy(""); }
      return;
    }
    setStep((s) => Math.min(4, s + 1)); window.scrollTo({ top: 0 });
  };
  const back = () => { setErr(""); setStep((s) => Math.max(loggedIn ? 2 : 0, s - 1)); };

  const submit = async () => {
    for (const s of [1, 2, 3, 4]) { const e = check(s); if (e) { setErr(e); setStep(s); return; } }
    setErr("");
    try {
      let uid = user?.uid;
      // 계정만 만들어 두고 나중에 이어 쓰는 차주 — 휴대폰번호가 로그인 비밀번호와 같아야 한다
      if (plateUser && !phoneLocked) {
        setBusy("휴대폰번호를 확인하고 있어요");
        if (!(await verifyHubDriverPhone(user, f.phone))) { setStep(2); throw Object.assign(new Error("가입할 때 넣은 휴대폰번호를 입력해 주세요"), { hub: true }); }
      }
      if (!uid) {
        setBusy("계정을 만들고 있어요");
        const cred = await createUserWithEmailAndPassword(auth, f.email.trim(), f.pw);
        uid = cred.user.uid;
      }
      const up = {};
      const keys = [...docs.required, ...docs.optional, ...(needPhoto ? ["photo"] : [])];
      for (const k of keys) {
        const v = files[k];
        if (!v) continue;
        if (v.file) { setBusy(`${k === "photo" ? "프로필 사진" : DOC_TYPES[k]} 올리고 있어요`); up[k] = await uploadMemberFile(uid, k, v.file); }
        else if (v.path) up[k] = { path: v.path, name: v.name || "", type: v.type || "", size: v.size || 0 };
      }
      const { photo, ...docMap } = up;
      setBusy("신청서를 보내고 있어요");
      await submitApplication(uid, {
        role,
        email: user?.email || f.email.trim(),
        name: f.name.trim(),
        phone: role === "driver" ? fmtPhone(f.phone) : f.phone.trim(),
        ...(plateUser ? { login: "plate" } : {}),
        companyName: (f.companyName || (role === "driver" ? f.name : "")).trim(),
        bizNo: f.bizNo.trim(),
        ceoName: f.ceoName.trim(),
        managerTitle: f.managerTitle.trim(),
        bizAddress: f.bizAddress.trim(),
        permitNo: f.permitNo.trim(),
        vehicle: role === "driver" ? { plate: plateUser ? plateOfHubEmail(user.email) : normPlate(f.plate), type: f.vtype, ton: f.vton, length: f.vlen, width: f.vwid } : null,
        home: role === "driver" ? { sido: f.homeSido, sigungu: f.homeSgg } : null,
        regions: role === "driver" ? f.regions : [],
        // ⭐ 2026-11-06 운임 받을 정산 계좌(차주 · 운송사) — 예치금 결제 오더 운임이 이 계좌로 지급된다
        ...(role !== "shipper" && f.bankNo ? { bank: { bank: f.bank, number: f.bankNo.replace(/[^\d-]/g, ""), holder: (f.bankHolder || f.name).trim() } } : {}),
        docs: docMap,
        photoPath: photo?.path || "",
        agree: { terms: true, privacy: true, docs: true, at: Date.now() },
      }, existing);
      await claimSession(uid);
      nav("/", { replace: true });
    } catch (e) {
      setErr(authErrorText(e));
    } finally { setBusy(""); }
  };

  const Steps = (
    <ol className="flex items-center gap-1.5 mb-5" aria-label="가입 단계">
      {STEPS.map((s, i) => (
        <li key={s} className="flex-1 min-w-0">
          <div className={`h-1.5 rounded-full ${i <= step ? "bg-[#2D4C82]" : "bg-[#E2E7EF]"}`} />
          <div className={`mt-1.5 text-[13.5px] font-bold text-center ${i === step ? "text-[#0F1A30]" : i < step ? "text-[#2D4C82]" : "text-[#A3AEC0]"}`}>{s}</div>
        </li>
      ))}
    </ol>
  );
  const sggs = useMemo(() => sigunguOf(f.homeSido), [f.homeSido]);

  return (
    <HubAuthLayout wide sub={existing?.status === "rejected" ? "거절된 신청 고치기" : `${ROLES[role].label} 회원가입`} title={existing ? "가입 신청서 수정" : "회원가입 신청"}
      footer={<Link to={`/login?role=${role}`} className="text-[15px] font-semibold text-[#55657F] hover:text-[#0F1A30]">이미 계정이 있나요? <b className="text-[#1B2B4B]">로그인</b></Link>}>
      {Steps}
      {existing?.status === "rejected" && existing.rejectReason && (
        <div className="mb-4 rounded-2xl bg-[#0F1A30] text-white px-4 py-3.5 text-[15px]"><b className="text-[#8FB0F0]">거절 사유</b>, {existing.rejectReason}</div>
      )}

      {step === 0 && (
        <div className="space-y-2.5" data-testid="signup-step-type">
          {Object.entries(ROLES).map(([k, r]) => (
            <button key={k} type="button" data-testid={`signup-role-${k}`} onClick={() => { setRole(k); setStep(loggedIn ? 2 : 1); }}
              className={`w-full p-4 rounded-2xl flex items-center gap-4 text-left transition ring-1 ring-inset ${role === k ? "bg-[#0F1A30] text-white ring-[#0F1A30]" : "bg-white ring-[#D6DEEA] hover:ring-[#2D4C82]"}`}>
              <span className={`w-14 h-14 rounded-2xl inline-flex items-center justify-center ${role === k ? "bg-white/10 text-[#8FB0F0]" : "bg-[#EAF0FA] text-[#1B2B4B]"}`}><HI name={r.icon} size={26} /></span>
              <span className="flex-1 min-w-0"><span className="block text-[18px] font-extrabold">{r.label}</span><span className={`block text-[15px] ${role === k ? "text-white/65" : "text-[#8592A8]"}`}>{r.desc}</span></span>
              <HI name="chevron" size={20} />
            </button>
          ))}
          <div className="pt-2 text-[14.5px] text-[#55657F] leading-relaxed">로지스웹 운송사 직원, 소속 기사, 화주사는 가입하지 말고 <Link to="/login?mode=logisweb" className="font-bold text-[#1B2B4B] underline">로지스웹 계정으로 로그인</Link>하세요.</div>
        </div>
      )}

      {step === 1 && devGate && loggedIn && (
        <div data-testid="signup-step-sms">
          <HubDeviceGate reason={devGate} phone={f.phone} uid={user?.uid} onDone={() => { setDevGate(null); setStep(2); }} />
        </div>
      )}
      {step === 1 && !loggedIn && role === "driver" && (
        <div className="space-y-3.5" data-testid="signup-step-account">
          <div className="rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#DCE3EE] px-4 py-3 text-[14.5px] text-[#3A4A66] leading-relaxed">차량번호가 아이디, 휴대폰번호로 로그인해요. 이메일, 비밀번호는 필요 없어요.</div>
          <Field label="차량번호" required hint="전부 입력해 주세요"><input className={inputCls} lang="ko" autoComplete="username" value={f.plate} onChange={set("plate")} placeholder="예: 경기12가3456" data-testid="su-plate" /></Field>
          <Field label="휴대폰번호" required hint="로그인할 때 써요"><input className={inputCls} type="tel" inputMode="numeric" autoComplete="tel" value={f.phone} onChange={set("phone", fmtPhone)} placeholder="010-0000-0000" data-testid="su-phone" /></Field>
        </div>
      )}
      {step === 1 && !loggedIn && role !== "driver" && (
        <div className="space-y-3.5" data-testid="signup-step-account">
          <Field label="이메일(아이디)" required><input className={inputCls} type="email" autoComplete="username" placeholder="name@example.com" value={f.email} onChange={set("email")} data-testid="su-email" /></Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="비밀번호" required hint="8자 이상"><input className={inputCls} type="password" autoComplete="new-password" value={f.pw} onChange={set("pw")} data-testid="su-pw" /></Field>
            <Field label="비밀번호 확인" required><input className={inputCls} type="password" autoComplete="new-password" value={f.pw2} onChange={set("pw2")} data-testid="su-pw2" /></Field>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3.5" data-testid="signup-step-info">
          {role !== "driver" && <Field label="회사명(상호)" required><input className={inputCls} value={f.companyName} onChange={set("companyName")} placeholder="사업자등록증의 상호" data-testid="su-company" /></Field>}
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="사업자등록번호" required hint="번호를 자동으로 확인해요"><input className={inputCls} inputMode="numeric" value={f.bizNo} onChange={set("bizNo", fmtBizNo)} placeholder="000-00-00000" data-testid="su-bizno" /></Field>
            <Field label="대표자명"><input className={inputCls} value={f.ceoName} onChange={set("ceoName")} placeholder="사업자등록증의 대표자" data-testid="su-ceo" /></Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={role === "driver" ? "이름" : "담당자 이름"} required><input className={inputCls} value={f.name} onChange={set("name")} autoComplete="name" data-testid="su-name" /></Field>
            {plateUser && phoneLocked
              ? <Field label="휴대폰" hint="로그인 정보라 여기서는 못 바꿔요"><input className={`${inputCls} bg-[#F5F7FB] text-[#55657F]`} value={f.phone} readOnly data-testid="su-phone-locked" /></Field>
              : <Field label="휴대폰" required hint={plateUser ? "가입할 때 넣은 번호" : "배차가 확정된 상대에게만 공개"}><input className={inputCls} type="tel" inputMode="numeric" value={f.phone} onChange={set("phone", fmtPhone)} placeholder="010-0000-0000" autoComplete="tel" data-testid="su-phone" /></Field>}
          </div>
          {role === "driver" && <Field label="상호(개인사업자)" hint="없으면 비워 두세요(이름으로 표시)"><input className={inputCls} value={f.companyName} onChange={set("companyName")} data-testid="su-company" /></Field>}
          {role !== "driver" && <div className="grid sm:grid-cols-2 gap-3">
            <Field label="담당자 직책"><input className={inputCls} value={f.managerTitle} onChange={set("managerTitle")} placeholder="예: 물류팀 과장" /></Field>
            {role === "carrier" && <Field label="화물운송사업 허가번호"><input className={inputCls} value={f.permitNo} onChange={set("permitNo")} placeholder="허가증 번호" data-testid="su-permit" /></Field>}
          </div>}
          {role !== "driver" && <Field label="사업장 주소"><input className={inputCls} value={f.bizAddress} onChange={set("bizAddress")} placeholder="사업자등록증 주소" /></Field>}
          {role === "driver" && <>
            <div className="pt-2 text-[16px] font-extrabold text-[#0F1A30] flex items-center gap-2"><HI name="truck" size={19} className="text-[#2D4C82]" />차량 정보</div>
            <div className="grid grid-cols-2 gap-3">
              {plateUser
                ? <Field label="차량번호" hint="아이디라 못 바꿔요"><input className={`${inputCls} bg-[#F5F7FB] text-[#55657F]`} value={f.plate} readOnly data-testid="su-plate-locked" /></Field>
                : <Field label="차량번호" required><input className={inputCls} lang="ko" value={f.plate} onChange={set("plate")} placeholder="경기12가3456" data-testid="su-plate" /></Field>}
              <Field label="차종" required><select className={selectCls} value={f.vtype} onChange={set("vtype")} data-testid="su-vtype"><option value="">선택</option>{HUB_VEHICLES.map((v) => <option key={v}>{v}</option>)}</select></Field>
              <Field label="톤수" required><select className={selectCls} value={f.vton} onChange={set("vton")} data-testid="su-vton"><option value="">선택</option>{HUB_TONS.map((v) => <option key={v}>{v}</option>)}</select></Field>
              <Field label="적재함 길이(m)" required><input className={inputCls} inputMode="decimal" value={f.vlen} onChange={set("vlen")} placeholder="예: 9.6" data-testid="su-vlen" /></Field>
              <Field label="적재함 폭(m)"><input className={inputCls} inputMode="decimal" value={f.vwid} onChange={set("vwid")} placeholder="예: 2.35" data-testid="su-vwid" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="거주(차고지) 시·도" required><select className={selectCls} value={f.homeSido} onChange={(e) => setF((p) => ({ ...p, homeSido: e.target.value, homeSgg: "" }))} data-testid="su-home-sido"><option value="">선택</option>{SIDO_LIST.map((s) => <option key={s}>{s}</option>)}</select></Field>
              <Field label="시·군·구"><select className={selectCls} value={f.homeSgg} onChange={set("homeSgg")} disabled={!f.homeSido} data-testid="su-home-sgg"><option value="">선택</option>{sggs.map((s) => <option key={s}>{s}</option>)}</select></Field>
            </div>
            <Field label="주 운행 지역" hint="콜 알림에 써요(여러 개)">
              <div className="flex flex-wrap gap-2">
                {SIDO_LIST.map((s) => <Chip key={s} on={f.regions.includes(s)} onClick={() => setF((p) => ({ ...p, regions: p.regions.includes(s) ? p.regions.filter((x) => x !== s) : [...p.regions, s] }))}>{s}</Chip>)}
              </div>
            </Field>
          </>}
          {role !== "shipper" && (
            <div className="rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#DCE3EE] p-4 space-y-3" data-testid="su-bank-box">
              <div className="text-[15.5px] font-extrabold text-[#0F1A30]">운송료 받을 계좌 <span className="text-[#2D4C82]">*</span></div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="은행"><select className={selectCls} value={f.bank} onChange={set("bank")} data-testid="su-bank"><option value="">선택</option>{BANKS.map((b) => <option key={b}>{b}</option>)}</select></Field>
                <Field label="계좌번호"><input className={inputCls} inputMode="numeric" value={f.bankNo} onChange={set("bankNo")} placeholder="숫자만" data-testid="su-bank-no" /></Field>
              </div>
              <Field label="예금주" hint="사업자나 본인 이름과 같아야 해요"><input className={inputCls} value={f.bankHolder} onChange={set("bankHolder")} placeholder={f.name || "예금주"} data-testid="su-bank-holder" /></Field>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2.5" data-testid="signup-step-docs">
          <div className="rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#DCE3EE] px-4 py-3 text-[14.5px] text-[#3A4A66] leading-relaxed">서류는 <b>관리자만</b> 확인하고 다른 회원에게는 보이지 않아요. 글자가 잘 보이게 찍어 주세요.</div>
          {needPhoto && <FilePick label="프로필 사진" required value={files.photo} accept="image/*" testid="doc-photo" onPick={(file) => setFiles((p) => ({ ...p, photo: { file } }))} />}
          {docs.required.map((k) => <FilePick key={k} label={DOC_TYPES[k]} required value={files[k]} testid={`doc-${k}`} onPick={(file) => setFiles((p) => ({ ...p, [k]: { file } }))} />)}
          {docs.optional.map((k) => <FilePick key={k} label={DOC_TYPES[k]} value={files[k]} testid={`doc-${k}`} onPick={(file) => setFiles((p) => ({ ...p, [k]: { file } }))} />)}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3" data-testid="signup-step-review">
          <div className="rounded-2xl ring-1 ring-inset ring-[#E2E7EF] divide-y divide-[#EEF1F6]">
            {[["유형", ROLES[role].label], ["이름", f.name], ["휴대폰", f.phone], ["회사", f.companyName || "-"], ["사업자번호", f.bizNo],
              ...(role === "driver" ? [["차량", `${f.plate}, ${f.vton} ${f.vtype}`], ["적재함", `${f.vlen || "-"}m × ${f.vwid || "-"}m`], ["주 운행", f.regions.join(", ") || "-"]] : []),
              ["서류", `${Object.keys(files).filter((k) => k !== "photo").length}개`]].map(([k, v]) => (
              <div key={k} className="flex px-4 py-3 text-[15.5px]"><span className="w-24 shrink-0 font-semibold text-[#8592A8]">{k}</span><span className="font-bold text-[#0F1A30] min-w-0 break-all">{v}</span></div>
            ))}
          </div>
          {[["terms", "이용약관에 동의해요(허위 정보, 서류 위조 시 이용 정지 및 법적 책임)."], ["privacy", "개인정보 수집과 이용에 동의해요(연락처는 배차가 확정된 상대에게만 공개)."], ["docs", "제출한 서류가 본인(본사) 것이며 유효함을 확인해요."]].map(([k, t]) => (
            <label key={k} className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#F5F7FB] cursor-pointer">
              <input type="checkbox" checked={agree[k]} onChange={(e) => setAgree((p) => ({ ...p, [k]: e.target.checked }))} className="mt-0.5 w-5 h-5 accent-[#1B2B4B] shrink-0" data-testid={`agree-${k}`} />
              <span className="text-[15px] text-[#3A4A66] leading-relaxed">{t}</span>
            </label>
          ))}
        </div>
      )}

      {err && <div role="alert" data-testid="signup-error" className="mt-4 rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#C7D3E8] px-4 py-3 text-[15px] font-bold text-[#0F1A30] flex gap-2"><HI name="alert" size={18} className="shrink-0 mt-0.5 text-[#2D4C82]" />{err}</div>}
      {step > 0 && !devGate && (
        <div className="mt-5 grid grid-cols-[auto_1fr] gap-2.5">
          <Btn kind="ghost" onClick={back} disabled={!!busy || (loggedIn && step === 2) }>이전</Btn>
          {step < 4
            ? <Btn onClick={next} disabled={!!busy} data-testid="su-next">{busy || "다음"}</Btn>
            : <Btn onClick={submit} disabled={!!busy} data-testid="su-submit">{busy || (existing ? "다시 제출하기" : "가입 신청하기")}</Btn>}
        </div>
      )}
    </HubAuthLayout>
  );
}
