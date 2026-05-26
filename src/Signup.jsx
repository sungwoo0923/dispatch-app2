// src/Signup.jsx  —  운송사 회원가입
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "./firebase";
import {
  doc, setDoc, serverTimestamp, collection, query, where, getDocs, addDoc,
} from "firebase/firestore";

const POSITIONS = ["대표", "이사", "팀장", "과장", "대리", "사원", "기타"];

const SERVICE_TERMS = `제1조 (목적)
본 약관은 S-Flow 물류 관리 플랫폼(이하 "서비스")의 운송사 회원 이용과 관련하여 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.

제2조 (서비스 내용)
① 배차 관리, 기사 관리, 운임 정산, 거래처 관리 등 운송 업무 전반에 관한 기능을 제공합니다.
② 화주사와의 운송 계약 및 배차 현황을 실시간으로 관리할 수 있습니다.
③ 서비스 세부 내용은 운영 정책에 따라 변경될 수 있으며, 사전 공지합니다.

제3조 (이용자 의무)
① 가입 시 정확한 회사 정보 및 사업자 정보를 등록해야 합니다.
② 배차 정보, 기사 정보, 운임 정보 등을 허위로 등록하거나 조작해서는 안 됩니다.
③ 타 운송사의 정보에 무단으로 접근하거나 데이터를 침해해서는 안 됩니다.
④ 서비스를 통해 취득한 화주사 및 기사 정보를 제3자에게 무단 제공하는 행위를 금지합니다.

제4조 (데이터 관리)
① 각 운송사의 배차 데이터, 기사 정보, 거래처 정보는 해당 운송사만 접근 가능합니다.
② 서비스 탈퇴 시 데이터 보존 기간은 관련 법령에 따릅니다.

제5조 (서비스 이용 제한)
약관 위반, 부정 이용, 허위 정보 등록 시 서비스 이용을 제한할 수 있습니다.`;

const PRIVACY_TERMS = `수집하는 개인정보 항목
- 필수: 회사명, 사업자번호, 이름, 이메일, 핸드폰번호
- 선택: 직책, 주소

수집 및 이용 목적
- 운송사 회원 관리 및 서비스 제공
- 배차 시스템 운영 및 운임 정산 처리
- 기사 및 거래처 관리 서비스 제공
- 고객 지원 및 민원 처리

보유 및 이용 기간
- 서비스 이용 계약 종료 후 5년 (관련 법령에 따름)
- 세금계산서 등 거래 관련 서류는 5년 보관

개인정보의 제3자 제공
원칙적으로 개인정보를 외부에 제공하지 않습니다.
단, 운송 계약 이행을 위해 화주사에게 필요 최소 정보를 제공할 수 있습니다.

개인정보 처리 위탁
서비스 운영을 위해 Firebase(Google LLC)를 이용하며, 데이터는 암호화되어 보관됩니다.

이용자 권리
이용자는 언제든지 개인정보 열람, 수정, 삭제를 요청할 수 있습니다.`;

const formatPhone = (val) => {
  const v = val.replace(/[^0-9]/g, "");
  if (v.length <= 3) return v;
  if (v.length <= 7) return `${v.slice(0, 3)}-${v.slice(3)}`;
  return `${v.slice(0, 3)}-${v.slice(3, 7)}-${v.slice(7, 11)}`;
};

const formatBizNum = (val) => {
  const v = val.replace(/[^0-9]/g, "");
  if (v.length <= 3) return v;
  if (v.length <= 5) return `${v.slice(0, 3)}-${v.slice(3)}`;
  return `${v.slice(0, 3)}-${v.slice(3, 5)}-${v.slice(5, 10)}`;
};

function TermsBox({ title, text }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-4 py-2.5 text-[12px] font-bold text-gray-600 border-b border-gray-200">
        {title}
      </div>
      <div className="px-4 py-3 h-32 overflow-y-auto text-[12px] text-gray-500 leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

// ── Step 1: 가입 유형 선택 ────────────────────────────────────────────────────
function TypeSelect({ onSelect }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f4f6fa] px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-10">
          <img
            src="/icons/sflow-icon.png"
            alt="S-Flow"
            className="w-14 h-14 rounded-2xl shadow-md mx-auto mb-5"
          />
          <h1 className="text-[26px] font-extrabold text-[#1B2B4B] tracking-tight">
            운송사 회원가입
          </h1>
          <p className="text-[14px] text-gray-500 mt-2">가입 유형을 선택해주세요</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => onSelect("신규")}
            className="bg-white border-2 border-[#1B2B4B] rounded-2xl p-8 text-left hover:bg-[#1B2B4B] hover:text-white transition-all group shadow-sm"
          >
            <div className="text-[18px] font-extrabold text-[#1B2B4B] group-hover:text-white mb-2">
              신규 가입신청
            </div>
            <div className="text-[13px] text-gray-500 group-hover:text-white/80">
              새로운 운송사 등록
            </div>
            <div className="text-[11px] text-gray-400 group-hover:text-white/60 mt-2">
              회사 정보 + 담당자 정보 등록
            </div>
          </button>

          <button
            onClick={() => onSelect("기존")}
            className="bg-white border-2 border-gray-200 rounded-2xl p-8 text-left hover:border-[#1B2B4B] hover:bg-gray-50 transition-all shadow-sm"
          >
            <div className="text-[18px] font-extrabold text-gray-800 mb-2">
              기존 회사 추가 가입
            </div>
            <div className="text-[13px] text-gray-500">
              기존 운송사의 추가 계정
            </div>
            <div className="text-[11px] text-gray-400 mt-2">
              회사명 확인 후 담당자 정보 등록
            </div>
          </button>
        </div>

        <p className="text-center text-[13px] text-gray-400">
          이미 계정이 있으신가요?{" "}
          <button
            onClick={() => navigate("/transport-login")}
            className="text-[#1B2B4B] font-semibold hover:underline"
          >
            로그인
          </button>
        </p>
      </div>
    </div>
  );
}

// ── Step 2: 가입 양식 ─────────────────────────────────────────────────────────
function SignupForm({ signupType, onBack }) {
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [address, setAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const searchAddress = () => {
    const load = () =>
      new Promise((resolve) => {
        if (window.daum?.Postcode) { resolve(); return; }
        const s = document.createElement("script");
        s.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
        s.onload = resolve;
        document.head.appendChild(s);
      });
    load().then(() => {
      new window.daum.Postcode({ oncomplete: (d) => setAddress(d.address) }).open();
    });
  };

  const validateExistingCompany = async () => {
    const q = query(
      collection(db, "transportApplications"),
      where("companyName", "==", companyName.trim()),
      where("type", "==", "신규"),
    );
    const snap = await getDocs(q);
    const valid = snap.docs.some((d) => d.data().status !== "rejected");
    if (!valid) {
      setError(
        `"${companyName.trim()}"으로 신청된 가입 내역이 없습니다. 관리자에게 문의하세요.`
      );
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!companyName.trim()) return setError("회사명을 입력해주세요.");
    if (signupType === "신규" && !businessNumber.trim()) return setError("사업자번호를 입력해주세요.");
    if (!name.trim()) return setError("이름을 입력해주세요.");
    if (!phone.trim()) return setError("핸드폰번호를 입력해주세요.");
    if (!email.trim()) return setError("이메일을 입력해주세요.");
    if (password.length < 6) return setError("비밀번호는 6자 이상 입력해주세요.");
    if (password !== passwordConfirm) return setError("비밀번호가 일치하지 않습니다.");
    if (!termsAgreed || !privacyAgreed) return setError("이용약관 및 개인정보처리방침에 모두 동의해주세요.");

    if (signupType === "기존") {
      setLoading(true);
      const ok = await validateExistingCompany();
      if (!ok) { setLoading(false); return; }
    } else {
      setLoading(true);
    }

    try {
      const res = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = res.user.uid;
      const fullAddress = address + (addressDetail ? ` ${addressDetail}` : "");

      await setDoc(doc(db, "users", uid), {
        uid,
        email: email.trim(),
        companyName: companyName.trim(),
        name: name.trim(),
        phone: phone.trim(),
        position: position || "",
        address: fullAddress,
        role: "admin",
        approved: false,
        isMaster: false,
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, "transportApplications"), {
        type: signupType,
        companyName: companyName.trim(),
        businessNumber: signupType === "신규" ? businessNumber.trim() : "",
        email: email.trim(),
        name: name.trim(),
        phone: phone.trim(),
        position: position || "",
        address: fullAddress,
        termsAgreed: true,
        privacyAgreed: true,
        termsAgreedAt: serverTimestamp(),
        status: "pending",
        userId: uid,
        companyCode: "",
        createdAt: serverTimestamp(),
      });

      // Sign out immediately — prevents auto-login before admin approval
      await signOut(auth);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      const code = err.code || "";
      if (code === "auth/email-already-in-use") {
        setError("이미 가입된 이메일입니다.");
      } else if (code === "auth/invalid-email") {
        setError("올바른 이메일 형식을 입력해주세요.");
      } else if (code === "auth/weak-password") {
        setError("비밀번호는 6자 이상이어야 합니다.");
      } else {
        setError("가입 신청 중 오류가 발생했습니다. 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6fa] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* 헤더 */}
        <div className="bg-[#1B2B4B] px-8 py-6">
          <button onClick={onBack} className="text-white/60 hover:text-white text-[13px] mb-3 block">
            &larr; 뒤로
          </button>
          <h1 className="text-[20px] font-extrabold text-white">
            {signupType === "신규" ? "신규 가입신청" : "기존 회사 추가 가입"}
          </h1>
          <p className="text-white/60 text-[13px] mt-1">
            {signupType === "신규"
              ? "회사 정보와 담당자 정보를 입력해주세요"
              : "소속 회사명과 담당자 정보를 입력해주세요"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">

          {/* 회사 정보 */}
          <SectionLabel>회사 정보</SectionLabel>

          <Field label="회사명" required>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              placeholder="회사명 입력"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B]" />
          </Field>

          {signupType === "신규" && (
            <Field label="사업자번호" required>
              <input value={businessNumber}
                onChange={(e) => setBusinessNumber(formatBizNum(e.target.value))}
                placeholder="000-00-00000" maxLength={12}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B]" />
            </Field>
          )}

          <Field label="주소">
            <div className="flex gap-2 mb-2">
              <input value={address} readOnly
                placeholder="주소 검색 버튼을 눌러주세요"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] bg-gray-50 focus:outline-none cursor-default" />
              <button type="button" onClick={searchAddress}
                className="px-4 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition whitespace-nowrap">
                주소 검색
              </button>
            </div>
            <input value={addressDetail} onChange={(e) => setAddressDetail(e.target.value)}
              placeholder="상세주소 입력 (선택)"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B]" />
          </Field>

          {/* 담당자 정보 */}
          <SectionLabel>담당자 정보</SectionLabel>

          <Field label="이름" required>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="이름 입력"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B]" />
          </Field>

          <Field label="핸드폰번호" required>
            <input value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="010-0000-0000" maxLength={13}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B]" />
          </Field>

          <Field label="직책">
            <select value={position} onChange={(e) => setPosition(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] bg-white">
              <option value="">직책 선택 (선택사항)</option>
              {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>

          {/* 계정 정보 */}
          <SectionLabel>계정 정보</SectionLabel>

          <Field label="이메일" required>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 입력"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B]" />
          </Field>

          <Field label="비밀번호" required>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상 입력"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B]" />
          </Field>

          <Field label="비밀번호 확인" required>
            <input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="비밀번호 다시 입력"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B]" />
          </Field>

          {/* 약관 */}
          <SectionLabel>약관 동의</SectionLabel>

          <div className="space-y-3">
            <TermsBox title="서비스 이용약관" text={SERVICE_TERMS} />
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={termsAgreed} onChange={(e) => setTermsAgreed(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 accent-[#1B2B4B] cursor-pointer" />
              <span className="text-[13px] font-semibold text-gray-700">
                서비스 이용약관에 동의합니다 <span className="text-red-500">*</span>
              </span>
            </label>

            <TermsBox title="개인정보처리방침" text={PRIVACY_TERMS} />
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={privacyAgreed} onChange={(e) => setPrivacyAgreed(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 accent-[#1B2B4B] cursor-pointer" />
              <span className="text-[13px] font-semibold text-gray-700">
                개인정보처리방침에 동의합니다 <span className="text-red-500">*</span>
              </span>
            </label>
          </div>

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-[13px] px-4 py-3 rounded-xl font-semibold">
              운송사 가입신청이 완료되었습니다. 관리자 승인 후 로그인이 가능합니다.
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-[13px] px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || success}
            className="w-full bg-[#1B2B4B] text-white py-3.5 rounded-xl font-bold text-[15px] hover:bg-[#243a60] transition disabled:opacity-50 mt-2">
            {loading ? "처리 중..." : "가입 신청"}
          </button>
        </form>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider pt-1 pb-1 border-b border-gray-100">
      {children}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────
export default function Signup() {
  const [signupType, setSignupType] = useState(null);

  if (!signupType) {
    return <TypeSelect onSelect={setSignupType} />;
  }
  return <SignupForm signupType={signupType} onBack={() => setSignupType(null)} />;
}
