// src/shipper/ShipperSignup.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, deleteUser } from "firebase/auth";
import { auth, db } from "../firebase";
import {
  doc, setDoc, serverTimestamp, collection, query, where, getDocs, addDoc, updateDoc,
} from "firebase/firestore";

const POSITIONS = ["대표", "이사", "팀장", "과장", "대리", "사원", "기타"];

const SERVICE_TERMS = `제1조 (목적)
본 약관은 S-Flow 물류 관리 플랫폼(이하 "서비스")의 이용과 관련하여 회사와 이용자의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.

제2조 (서비스 내용)
① 본 서비스는 화물 운송 의뢰, 배차 현황 조회, 운임 정산 등 물류 관련 기능을 제공합니다.
② 서비스 세부 내용은 운영 정책에 따라 변경될 수 있으며, 사전 공지합니다.

제3조 (이용자 의무)
① 이용자는 가입 시 정확한 정보를 등록해야 하며, 변경 시 즉시 수정해야 합니다.
② 타인의 계정을 도용하거나 허위 정보를 등록하는 행위를 금지합니다.
③ 서비스를 통해 취득한 정보를 무단으로 제3자에게 제공하거나 유출해서는 안 됩니다.
④ 서비스의 정상적인 운영을 방해하는 행위를 금지합니다.

제4조 (서비스 이용 제한)
이용자가 본 약관을 위반하거나 부정한 방법으로 서비스를 이용할 경우 이용을 제한할 수 있습니다.

제5조 (서비스 중단)
시스템 점검, 긴급 장애 복구 등의 사유로 서비스를 일시 중단할 수 있으며, 이 경우 사전 공지합니다.`;

const PRIVACY_TERMS = `수집하는 개인정보 항목
- 필수: 회사명, 사업자번호, 이름, 이메일, 핸드폰번호
- 선택: 직책, 주소

수집 및 이용 목적
- 서비스 제공 및 운영, 회원 관리, 본인 확인
- 운송 계약 이행 및 정산 처리
- 고객 지원 및 민원 처리

보유 및 이용 기간
- 서비스 이용 계약 종료 후 5년 (관련 법령에 따름)
- 단, 법령에서 별도 보존 기간을 정한 경우 해당 기간 동안 보관

개인정보의 제3자 제공
원칙적으로 개인정보를 외부에 제공하지 않습니다.
단, 이용자의 동의가 있거나 법령에 따른 요구가 있는 경우 제공할 수 있습니다.

개인정보 처리 위탁
서비스 운영을 위해 Firebase(Google LLC)를 이용하며, 데이터는 암호화되어 보관됩니다.

이용자 권리
이용자는 언제든지 개인정보 열람, 수정, 삭제를 요청할 수 있습니다.
문의: 서비스 관리자에게 연락해주세요.`;

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
            화주 회원가입
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
              처음 이용하시는 회사
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
              이미 등록된 회사의 추가 구성원
            </div>
            <div className="text-[11px] text-gray-400 mt-2">
              회사명 확인 후 담당자 정보 등록
            </div>
          </button>
        </div>

        <p className="text-center text-[13px] text-gray-400">
          이미 계정이 있으신가요?{" "}
          <button
            onClick={() => navigate("/shipper-login")}
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
  const [emailChecked, setEmailChecked] = useState(false);
  const [emailCheckMsg, setEmailCheckMsg] = useState(null);
  const [checkingEmail, setCheckingEmail] = useState(false);

  // ── 기존 가입: 화주 회사 검색 ────────────────────────────────────────────
  const [companySearchQ, setCompanySearchQ] = useState("");
  const [companySuggestions, setCompanySuggestions] = useState([]);
  const [companySearching, setCompanySearching] = useState(false);
  const [hasCompanySearched, setHasCompanySearched] = useState(false);
  const [selectedCompanyApp, setSelectedCompanyApp] = useState(null);

  const searchExistingShipperCompany = async () => {
    const q = companySearchQ.trim();
    if (!q) return;
    setCompanySearching(true);
    setHasCompanySearched(false);
    try {
      const snap = await getDocs(query(
        collection(db, "companyApplications"),
        where("type", "==", "신규"),
      ));
      const all = snap.docs.map((d) => ({ ...d.data(), _docId: d.id }));
      const matched = all.filter((d) =>
        d.status !== "rejected" &&
        (d.companyName || "").toLowerCase().includes(q.toLowerCase())
      );
      // deduplicate by companyName, keep latest approved or pending
      const seen = new Map();
      for (const item of matched) {
        if (!seen.has(item.companyName)) seen.set(item.companyName, item);
      }
      setCompanySuggestions(Array.from(seen.values()));
    } catch (_) {
      setCompanySuggestions([]);
    } finally {
      setCompanySearching(false);
      setHasCompanySearched(true);
    }
  };

  const selectCompanySuggestion = (item) => {
    setCompanyName(item.companyName || "");
    setCompanySearchQ(item.companyName || "");
    setBusinessNumber(formatBizNum(item.businessNumber || ""));
    setAddress(item.address || "");
    setAddressDetail("");
    setSelectedCompanyApp(item);
    setCompanySuggestions([]);
    setHasCompanySearched(false);
  };

  // ── 신규 가입: 운송사 검색 ────────────────────────────────────────────────
  const [transportSearchQ, setTransportSearchQ] = useState("");
  const [transportSuggestions, setTransportSuggestions] = useState([]);
  const [transportSearching, setTransportSearching] = useState(false);
  const [hasTransportSearched, setHasTransportSearched] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState(null);

  const searchTransportCompany = async () => {
    const q = transportSearchQ.trim();
    if (!q) return;
    setTransportSearching(true);
    setHasTransportSearched(false);
    try {
      const snap = await getDocs(query(
        collection(db, "transportApplications"),
        where("type", "==", "신규"),
        where("status", "==", "approved"),
      ));
      const all = snap.docs.map((d) => ({ ...d.data(), _docId: d.id }));
      const matched = all.filter((d) =>
        (d.companyName || "").toLowerCase().includes(q.toLowerCase())
      );
      const seen = new Map();
      for (const item of matched) {
        if (!seen.has(item.companyName)) seen.set(item.companyName, item);
      }
      setTransportSuggestions(Array.from(seen.values()));
    } catch (_) {
      setTransportSuggestions([]);
    } finally {
      setTransportSearching(false);
      setHasTransportSearched(true);
    }
  };

  const selectTransportSuggestion = (item) => {
    setSelectedTransport(item);
    setTransportSearchQ(item.companyName || "");
    setTransportSuggestions([]);
    setHasTransportSearched(false);
  };

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

  const checkEmailDuplicate = async () => {
    const trimmed = email.trim();
    if (!trimmed) return setEmailCheckMsg({ ok: false, msg: "이메일을 먼저 입력해주세요." });
    setCheckingEmail(true);
    setEmailChecked(false);
    setEmailCheckMsg(null);
    try {
      // Firestore 활성 계정만 체크 (삭제/탈퇴된 계정은 재가입 허용)
      const snap = await getDocs(query(collection(db, "users"), where("email", "==", trimmed)));
      if (!snap.empty) {
        setEmailChecked(false);
        setEmailCheckMsg({ ok: false, msg: "이미 사용 중인 이메일입니다." });
      } else {
        setEmailChecked(true);
        setEmailCheckMsg({ ok: true, msg: "사용 가능한 이메일입니다." });
      }
    } catch {
      setEmailCheckMsg({ ok: false, msg: "확인 중 오류가 발생했습니다." });
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!companyName.trim()) return setError("회사명을 입력해주세요.");
    if (signupType === "신규" && !businessNumber.trim()) return setError("사업자번호를 입력해주세요.");
    if (!name.trim()) return setError("이름을 입력해주세요.");
    if (!phone.trim()) return setError("핸드폰번호를 입력해주세요.");
    if (!email.trim()) return setError("이메일을 입력해주세요.");
    if (!emailChecked) return setError("이메일 중복확인을 해주세요.");
    if (password.length < 6) return setError("비밀번호는 6자 이상 입력해주세요.");
    if (password !== passwordConfirm) return setError("비밀번호가 일치하지 않습니다.");
    if (!termsAgreed || !privacyAgreed) return setError("이용약관 및 개인정보처리방침에 모두 동의해주세요.");

    if (signupType === "기존" && !selectedCompanyApp) {
      setError("회사명을 검색하여 선택해주세요.");
      return;
    }

    // 회사명 + 사업자번호 중복 체크 (신규 가입 시)
    if (signupType === "신규") {
      const dupSnap = await getDocs(
        query(
          collection(db, "companyApplications"),
          where("companyName", "==", companyName.trim()),
          where("businessNumber", "==", businessNumber.trim())
        )
      );
      const activeDup = dupSnap.docs.find(d => d.data().status !== "rejected");
      if (activeDup) {
        setError("이미 동일한 회사명과 사업자번호로 가입 신청된 내역이 있습니다.");
        return;
      }
    }

    setLoading(true);

    const doFirestoreSetup = async (uid) => {
      const fullAddress = address + (addressDetail ? ` ${addressDetail}` : "");
      const linkedTransport = selectedTransport
        ? {
            companyName: selectedTransport.companyName || "",
            businessNumber: selectedTransport.businessNumber || "",
            companyCode: selectedTransport.companyCode || "",
            representative: selectedTransport.name || selectedTransport.representative || "",
          }
        : null;
      await setDoc(doc(db, "users", uid), {
        uid,
        email: email.trim(),
        companyName: companyName.trim(),
        name: name.trim(),
        phone: phone.trim(),
        position: position || "",
        address: fullAddress,
        role: "shipper",
        approved: false,
        isMaster: false,
        linkedTransportCompany: linkedTransport || null,
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, "companyApplications"), {
        type: signupType,
        companyName: companyName.trim(),
        businessNumber: signupType === "신규" ? businessNumber.trim() : (selectedCompanyApp?.businessNumber || ""),
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
        linkedTransportCompany: linkedTransport || null,
        createdAt: serverTimestamp(),
      });
      if (signupType === "기존" && fullAddress.trim() && selectedCompanyApp?._docId && !selectedCompanyApp.address) {
        try {
          await updateDoc(doc(db, "companyApplications", selectedCompanyApp._docId), { address: fullAddress.trim() });
        } catch (_) {}
      }
    };

    try {
      let uid;
      try {
        const res = await createUserWithEmailAndPassword(auth, email.trim(), password);
        uid = res.user.uid;
      } catch (authErr) {
        if (authErr.code === "auth/email-already-in-use") {
          // 기존 Firestore 활성 계정 여부 확인
          const snap = await getDocs(query(collection(db, "users"), where("email", "==", email.trim())));
          if (!snap.empty) {
            setError("이미 사용 중인 이메일입니다.");
            return;
          }
          // 삭제된 계정 — 동일 비밀번호로 로그인 후 Auth 계정 삭제 후 재가입 시도
          try {
            const oldCred = await signInWithEmailAndPassword(auth, email.trim(), password);
            await deleteUser(oldCred.user);
            const res = await createUserWithEmailAndPassword(auth, email.trim(), password);
            uid = res.user.uid;
          } catch {
            setError("이전에 탈퇴된 계정입니다. 관리자에게 계정 초기화를 요청해주세요.");
            return;
          }
        } else {
          throw authErr;
        }
      }
      await doFirestoreSetup(uid);
      navigate("/shipper-pending", { replace: true });
    } catch (err) {
      setError(err.message || "가입 신청 중 오류가 발생했습니다.");
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
            ← 뒤로
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

          {/* 기존 가입: 회사명 검색 */}
          {signupType === "기존" ? (
            <Field label="회사명" required>
              <div className="flex gap-2">
                <input
                  value={companySearchQ}
                  onChange={(e) => { setCompanySearchQ(e.target.value); setSelectedCompanyApp(null); setCompanyName(""); }}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchExistingShipperCompany())}
                  placeholder="회사명 검색"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B]"
                />
                <button
                  type="button"
                  onClick={searchExistingShipperCompany}
                  disabled={companySearching}
                  className="px-4 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition whitespace-nowrap disabled:opacity-50"
                >
                  {companySearching ? "검색 중..." : "검색"}
                </button>
              </div>

              {companySuggestions.length > 0 && (
                <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  {companySuggestions.map((item, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectCompanySuggestion(item)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition"
                    >
                      <div className="text-[14px] font-bold text-[#1B2B4B]">{item.companyName}</div>
                      <div className="text-[12px] text-gray-400 mt-0.5 flex flex-wrap gap-x-3">
                        {item.businessNumber && <span>사업자번호: {item.businessNumber}</span>}
                        {item.name && <span>대표: {item.name}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {hasCompanySearched && !companySearching && companySuggestions.length === 0 && (
                <div className="mt-2 bg-amber-50 border border-amber-200 text-amber-700 text-[13px] px-4 py-3 rounded-xl">
                  <strong>"{companySearchQ}"</strong>(으)로 등록된 화주 회사가 없습니다.<br />
                  신규가입으로 진행해 주세요.
                </div>
              )}

              {selectedCompanyApp && (
                <div className="mt-2 flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl">
                  <span className="text-[13px] text-blue-700 font-semibold">{selectedCompanyApp.companyName}</span>
                  <button
                    type="button"
                    onClick={() => { setSelectedCompanyApp(null); setCompanyName(""); setCompanySearchQ(""); setBusinessNumber(""); setAddress(""); }}
                    className="text-[11px] text-blue-400 hover:text-red-500 ml-auto"
                  >
                    ✕
                  </button>
                </div>
              )}
            </Field>
          ) : (
            <Field label="회사명" required>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="회사명 입력"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B]"
              />
            </Field>
          )}

          {/* 사업자번호 */}
          {signupType === "신규" && (
            <Field label="사업자번호" required>
              <input
                value={businessNumber}
                onChange={(e) => setBusinessNumber(formatBizNum(e.target.value))}
                placeholder="000-00-00000"
                maxLength={12}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B]"
              />
            </Field>
          )}

          {signupType === "기존" && (
            <Field label="사업자번호">
              <input
                value={businessNumber}
                readOnly
                placeholder="회사 선택 시 자동 입력"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] bg-gray-50 focus:outline-none cursor-default"
              />
            </Field>
          )}

          {/* 신규 가입: 연결 운송사 검색 */}
          {signupType === "신규" && (
            <Field label="연결 운송사">
              <div className="flex gap-2">
                <input
                  value={transportSearchQ}
                  onChange={(e) => { setTransportSearchQ(e.target.value); setSelectedTransport(null); }}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchTransportCompany())}
                  placeholder="운송사명 검색 (선택사항)"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B]"
                />
                <button
                  type="button"
                  onClick={searchTransportCompany}
                  disabled={transportSearching}
                  className="px-4 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition whitespace-nowrap disabled:opacity-50"
                >
                  {transportSearching ? "검색 중..." : "검색"}
                </button>
              </div>

              {transportSuggestions.length > 0 && (
                <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  {transportSuggestions.map((item, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectTransportSuggestion(item)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition"
                    >
                      <div className="text-[14px] font-bold text-[#1B2B4B]">{item.companyName}</div>
                      <div className="text-[12px] text-gray-400 mt-0.5 flex flex-wrap gap-x-3">
                        {item.businessNumber && <span>사업자번호: {item.businessNumber}</span>}
                        {(item.name || item.representative) && <span>대표: {item.name || item.representative}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {hasTransportSearched && !transportSearching && transportSuggestions.length === 0 && (
                <div className="mt-2 bg-amber-50 border border-amber-200 text-amber-700 text-[13px] px-4 py-3 rounded-xl">
                  <strong>"{transportSearchQ}"</strong>(으)로 등록된 운송사가 없습니다.
                </div>
              )}

              {selectedTransport && (
                <div className="mt-2 flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl">
                  <span className="text-[13px] text-blue-700 font-semibold">{selectedTransport.companyName}</span>
                  <span className="text-[12px] text-gray-400">
                    {selectedTransport.businessNumber && `사업자번호: ${selectedTransport.businessNumber}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setSelectedTransport(null); setTransportSearchQ(""); }}
                    className="text-[11px] text-blue-400 hover:text-red-500 ml-auto"
                  >
                    ✕
                  </button>
                </div>
              )}

              <p className="text-[11px] text-gray-400 mt-1">
                연결할 운송사를 선택하면 승인 후 오더가 해당 운송사와 연동됩니다.
              </p>
            </Field>
          )}

          {/* 주소 */}
          <Field label="주소">
            <div className="flex gap-2 mb-2">
              <input
                value={address}
                readOnly={signupType === "기존"}
                onChange={signupType === "신규" ? (e) => setAddress(e.target.value) : undefined}
                placeholder="주소 검색 버튼을 눌러주세요"
                className={`flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none ${signupType === "기존" ? "bg-gray-50 cursor-default" : "focus:border-[#1B2B4B]"}`}
              />
              {signupType === "신규" && (
                <button
                  type="button"
                  onClick={searchAddress}
                  className="px-4 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition whitespace-nowrap"
                >
                  주소 검색
                </button>
              )}
            </div>
            <input
              value={addressDetail}
              onChange={(e) => setAddressDetail(e.target.value)}
              placeholder="상세주소 입력 (선택)"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B]"
            />
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
            <div className="flex gap-2">
              <input type="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailChecked(false); setEmailCheckMsg(null); }}
                placeholder="이메일 입력"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B]" />
              <button
                type="button"
                onClick={checkEmailDuplicate}
                disabled={checkingEmail}
                className="px-4 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition whitespace-nowrap disabled:opacity-50"
              >
                {checkingEmail ? "확인 중..." : "중복확인"}
              </button>
            </div>
            {emailCheckMsg && (
              <p className={`text-[12px] mt-1 ${emailCheckMsg.ok ? "text-green-600" : "text-red-500"}`}>
                {emailCheckMsg.msg}
              </p>
            )}
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

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-[13px] px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
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
export default function ShipperSignup() {
  const [signupType, setSignupType] = useState(null);

  if (!signupType) {
    return <TypeSelect onSelect={setSignupType} />;
  }
  return <SignupForm signupType={signupType} onBack={() => setSignupType(null)} />;
}
