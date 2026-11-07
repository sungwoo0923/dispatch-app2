// ======================= cafe-site/src/hub/HubSignup.jsx =======================
// ⭐ 2026-11-06 허브 회원가입(신청서 + 서류) → 관리자 승인
//  차주: 사업자등록증 · 화물운송종사자격증 · 자동차등록증 · 운전면허증 · 적재물배상보험 증권 · 통장사본 + 차량 정보 · 프로필 사진
//  화주: 사업자등록증 (+ 담당자 재직·위임 확인) · 운송사: 사업자등록증 · 화물운송사업 허가증 (+ 재직·위임 확인 · 통장사본)
//  단계: 유형 → 계정 → 정보 → 서류 → 확인·동의. 거절된 신청은 같은 화면에서 고쳐 다시 제출한다(?edit=1).
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { createUserWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import HubAuthLayout from "./HubAuthLayout";
import { HI, Btn, Field, inputCls, selectCls, Chip, FilePick } from "./hubUi";
import { ROLES, ROLE_DOCS, DOC_TYPES, HUB_VEHICLES, HUB_TONS, SIDO_LIST, sigunguOf, fmtPhone, fmtBizNo, bizNoValid, BANKS } from "./hubConstants";
import { getMember, submitApplication, uploadMemberFile, claimSession } from "./hubApi";
import { authErrorText } from "./hubLink";

const STEPS = ["유형", "계정", "정보", "서류", "확인"];
const EMPTY = { email: "", pw: "", pw2: "", name: "", phone: "", companyName: "", bizNo: "", ceoName: "", managerTitle: "", bizAddress: "", permitNo: "",
  plate: "", vtype: "", vton: "", vlen: "", vwid: "", homeSido: "", homeSgg: "", regions: [], bank: "", bankNo: "", bankHolder: "" };

export default function HubSignup() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [user, setUser] = useState(undefined);
  const [existing, setExisting] = useState(null);
  const [role, setRole] = useState(ROLES[sp.get("role")] ? sp.get("role") : "driver");
  const [step, setStep] = useState(ROLES[sp.get("role")] ? 1 : 0);
  const [f, setF] = useState(EMPTY);
  const [files, setFiles] = useState({}); // key → { file } | { path, name }
  const [agree, setAgree] = useState({ terms: false, privacy: false, docs: false });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u || null)), []);
  useEffect(() => {
    if (!user) return;
    getMember(user.uid).then((m) => {
      if (!m) return; // 계정만 만들고 신청서가 없는 경우, 이어서 작성
      if (m.source !== "signup" || m.status === "approved") { nav("/", { replace: true }); return; }
      setExisting(m);
      setRole(m.role);
      setF((p) => ({ ...p, name: m.name || "", phone: m.phone || "", companyName: m.companyName || "", bizNo: m.bizNo || "", ceoName: m.ceoName || "", managerTitle: m.managerTitle || "", bizAddress: m.bizAddress || "", permitNo: m.permitNo || "",
        plate: m.vehicle?.plate || "", vtype: m.vehicle?.type || "", vton: m.vehicle?.ton || "", vlen: m.vehicle?.length || "", vwid: m.vehicle?.width || "",
        homeSido: m.home?.sido || "", homeSgg: m.home?.sigungu || "", regions: m.regions || [], bank: m.bank?.bank || "", bankNo: m.bank?.number || "", bankHolder: m.bank?.holder || "" }));
      setFiles({ ...(m.docs || {}), ...(m.photoPath ? { photo: { path: m.photoPath, name: "프로필 사진" } } : {}) });
      setStep(2);
    });
  }, [user, nav]);
  const loggedIn = !!user;
  useEffect(() => { if (loggedIn && step === 1) setStep(2); }, [loggedIn, step]);

  const set = (k, fmt) => (e) => setF((p) => ({ ...p, [k]: fmt ? fmt(e.target.value) : e.target.value }));
  const docs = ROLE_DOCS[role];
  const needPhoto = role === "driver";

  const check = (s) => {
    if (s === 1 && !loggedIn) {
      if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return "이메일을 정확히 입력해 주세요.";
      if (f.pw.length < 8) return "비밀번호는 8자 이상으로 정해 주세요.";
      if (f.pw !== f.pw2) return "비밀번호가 서로 다릅니다.";
    }
    if (s === 2) {
      if (!f.name.trim()) return role === "driver" ? "이름을 입력해 주세요." : "담당자 이름을 입력해 주세요.";
      if (f.phone.replace(/\D/g, "").length < 10) return "휴대폰 번호를 정확히 입력해 주세요.";
      if (role !== "driver" && !f.companyName.trim()) return "회사명을 입력해 주세요.";
      if (!bizNoValid(f.bizNo)) return "사업자등록번호가 올바르지 않아요(10자리, 국세청 검증식).";
      if (role === "driver") {
        if (f.plate.replace(/\s/g, "").length < 7) return "차량번호를 정확히 입력해 주세요.";
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
  const next = () => { const e = check(step); setErr(e); if (!e) setStep((s) => Math.min(4, s + 1)); window.scrollTo({ top: 0 }); };
  const back = () => { setErr(""); setStep((s) => Math.max(loggedIn ? 2 : 0, s - 1)); };

  const submit = async () => {
    for (const s of [1, 2, 3, 4]) { const e = check(s); if (e) { setErr(e); setStep(s); return; } }
    setErr("");
    try {
      let uid = user?.uid;
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
        phone: f.phone.trim(),
        companyName: (f.companyName || (role === "driver" ? f.name : "")).trim(),
        bizNo: f.bizNo.trim(),
        ceoName: f.ceoName.trim(),
        managerTitle: f.managerTitle.trim(),
        bizAddress: f.bizAddress.trim(),
        permitNo: f.permitNo.trim(),
        vehicle: role === "driver" ? { plate: f.plate.replace(/\s+/g, ""), type: f.vtype, ton: f.vton, length: f.vlen, width: f.vwid } : null,
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

      {step === 1 && !loggedIn && (
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
            <Field label="휴대폰" required hint="배차가 확정된 상대에게만 공개"><input className={inputCls} inputMode="numeric" value={f.phone} onChange={set("phone", fmtPhone)} placeholder="010-0000-0000" autoComplete="tel" data-testid="su-phone" /></Field>
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
              <Field label="차량번호" required><input className={inputCls} value={f.plate} onChange={set("plate")} placeholder="경기12가3456" data-testid="su-plate" /></Field>
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
      {step > 0 && (
        <div className="mt-5 grid grid-cols-[auto_1fr] gap-2.5">
          <Btn kind="ghost" onClick={back} disabled={!!busy || (loggedIn && step === 2) }>이전</Btn>
          {step < 4
            ? <Btn onClick={next} data-testid="su-next">다음</Btn>
            : <Btn onClick={submit} disabled={!!busy} data-testid="su-submit">{busy || (existing ? "다시 제출하기" : "가입 신청하기")}</Btn>}
        </div>
      )}
    </HubAuthLayout>
  );
}
