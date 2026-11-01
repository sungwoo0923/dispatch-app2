// src/shipper/ShipperSignup.jsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { checkEmailAvailable } from "../emailCheck";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, deleteUser } from "firebase/auth";
import { auth, db } from "../firebase";
import { freeDeletedEmail } from "../freeEmail";
import { readPublicCompanies } from "../publicCompanies";
import CustomSelect from "../CustomSelect";
import CustomDatePicker from "../CustomDatePicker";
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
    <div className="border border-[#DCE3EE] rounded-xl overflow-hidden">
      <div className="bg-[#F3F6FA] px-4 py-2.5 text-[13px] font-black text-[#1B2B4B] border-b border-[#DCE3EE]">
        {title}
      </div>
      <div className="px-4 py-3 h-32 overflow-y-auto text-[12.5px] text-[#5B6B85] leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

// ── Step 1: 가입 유형 선택 ────────────────────────────────────────────────────
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const GRID_BG = "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/26px 26px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/26px 26px, linear-gradient(135deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)";
function TypeSelect({ onSelect }) {
  const navigate = useNavigate();
  const Card = ({ type, en, title, desc, points, dark }) => (
    <button type="button" onClick={() => onSelect(type)}
      className={`group text-left rounded-[22px] p-7 border transition-all duration-200 hover:-translate-y-0.5 ${dark ? "bg-[#0F1A30] border-[#0F1A30] text-white shadow-[0_18px_40px_rgba(11,20,40,.35)]" : "bg-white border-[#DCE3EE] text-[#0F1A30] hover:border-[#2D4C82] shadow-[0_8px_24px_rgba(15,26,48,.08)]"}`}>
      <div className={`text-[11px] font-extrabold tracking-[0.26em] ${dark ? "text-[#8FB0F0]" : "text-[#2D4C82]"}`} style={{ fontFamily: MONO }}>{en}</div>
      <div className="text-[22px] font-black mt-1.5">{title}</div>
      <div className={`text-[14px] mt-1 ${dark ? "text-white/65" : "text-[#5B6B85]"}`}>{desc}</div>
      <div className="mt-5 space-y-2">
        {points.map((t) => <div key={t} className={`flex items-center gap-2 text-[13.5px] font-semibold ${dark ? "text-white/85" : "text-[#3A4A66]"}`}><span className={`w-1.5 h-1.5 rotate-45 ${dark ? "bg-[#8FB0F0]" : "bg-[#2D4C82]"}`} />{t}</div>)}
      </div>
      <div className={`mt-6 h-12 rounded-xl flex items-center justify-center text-[15px] font-black ${dark ? "bg-white text-[#0F1A30]" : "bg-[#0F1A30] text-white"}`}>시작하기 →</div>
    </button>
  );
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: GRID_BG }}>
      <div className="w-full max-w-[880px]">
        <div className="text-center mb-8">
          <img src="/icons/sflow-icon.png" alt="" className="w-14 h-14 rounded-2xl shadow-lg mx-auto mb-4" />
          <div className="text-[11px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>SHIPPER · SIGN UP</div>
          <h1 className="text-[30px] font-black text-white tracking-tight mt-1">화주 회원가입</h1>
          <p className="text-[14.5px] text-white/60 mt-1.5">가입 유형을 골라 주세요</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card type="신규" dark en="NEW COMPANY" title="신규 가입신청" desc="처음 이용하시는 회사" points={["회사 정보 · 사업자번호", "거래하는 운송사 연결", "승인 후 오더 요청·현황 조회"]} />
          <Card type="기존" en="JOIN EXISTING" title="기존 회사 추가 가입" desc="이미 등록된 회사의 추가 구성원" points={["회사명 검색 → 선택", "담당자 정보 입력", "승인되면 바로 사용"]} />
        </div>
        <p className="text-center text-[14px] text-white/60 mt-7">
          이미 계정이 있으신가요?{" "}
          <button onClick={() => navigate("/shipper-login")} className="text-white font-black hover:underline">로그인</button>
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
  const [hireDate, setHireDate] = useState("");
  const [address, setAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [addressPopupOpen, setAddressPopupOpen] = useState(false);
  const addressBoxRef = useRef(null);
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
      // 로그인 전에도 읽을 수 있는 공개 운송사 목록 먼저, 안 되면 신청서 직접 조회
      let all = await readPublicCompanies().catch(() => []);
      if (!all.length) {
        const snap = await getDocs(query(collection(db, "transportApplications"), where("type", "==", "신규"), where("status", "==", "approved")));
        all = snap.docs.map((d) => ({ ...d.data(), _docId: d.id }));
      }
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

  // 모바일 브라우저/웹뷰에서는 daum Postcode의 .open()이 새 팝업창을 띄우지 못하고
  // 현재 탭 자체를 이동시켜버려, 주소 선택 후 앱이 처음부터 다시 로드되며
  // 로고 화면 → 가입선택 화면으로 튕기는 문제가 있었다. 새 창을 띄우지 않는
  // embed 방식으로 현재 화면 안에 오버레이 레이어로 띄운다.
  const searchAddress = () => {
    const load = () =>
      new Promise((resolve) => {
        if (window.daum?.Postcode) { resolve(); return; }
        const s = document.createElement("script");
        s.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
        s.onload = resolve;
        document.head.appendChild(s);
      });
    load().then(() => setAddressPopupOpen(true));
  };

  useEffect(() => {
    if (!addressPopupOpen || !addressBoxRef.current || !window.daum?.Postcode) return;
    addressBoxRef.current.innerHTML = "";
    new window.daum.Postcode({
      oncomplete: (d) => {
        setAddress(d.address);
        setAddressPopupOpen(false);
      },
      width: "100%",
      height: "100%",
    }).embed(addressBoxRef.current);
  }, [addressPopupOpen]);

  const checkEmailDuplicate = async () => {
    const trimmed = email.trim();
    if (!trimmed) return setEmailCheckMsg({ ok: false, msg: "이메일을 먼저 입력해주세요." });
    setCheckingEmail(true);
    setEmailChecked(false);
    setEmailCheckMsg(null);
    try {
      // Firestore 활성 계정만 체크 (삭제/탈퇴된 계정은 재가입 허용)
      const st = await checkEmailAvailable(trimmed);
      if (st === "used") {
        setEmailChecked(false);
        setEmailCheckMsg({ ok: false, msg: "이미 사용 중인 이메일입니다." });
      } else {
        setEmailChecked(true);
        setEmailCheckMsg({ ok: true, msg: st === "free" ? "사용 가능한 이메일입니다." : "확인되었습니다. 이미 가입된 이메일이면 가입 신청 때 안내됩니다." });
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
        hireDate: hireDate || "",
        address: fullAddress,
        role: "shipper",
        approved: false,
        isMaster: false,
        linkedTransportCompany: linkedTransport || null,
        createdAt: serverTimestamp(),
      });
      if (hireDate) {
        await setDoc(doc(db, "userProfiles", uid), { hireDate }, { merge: true }).catch(() => {});
      }
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
        if (authErr.code === "auth/email-already-in-use" && (await freeDeletedEmail(email))) {
          // ⭐ 2026-11-01 삭제된 계정의 이메일 — 서버가 정리해 줬으면 바로 다시 가입
          const res = await createUserWithEmailAndPassword(auth, email.trim(), password);
          uid = res.user.uid;
        } else if (authErr.code === "auth/email-already-in-use") {
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
    <>
    <div className="min-h-screen bg-[#EEF2F8] flex items-start lg:items-center justify-center px-0 sm:px-4 py-0 sm:py-8">
      <div className="w-full max-w-[1120px] bg-white sm:rounded-[26px] shadow-[0_24px_60px_rgba(11,20,40,.14)] overflow-hidden lg:grid lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="relative text-white px-7 py-7 lg:py-10 flex flex-col" style={{ background: GRID_BG }}>
          <button type="button" onClick={onBack} className="self-start h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 text-[13px] font-bold hover:bg-white/15">← 가입 유형</button>
          <div className="mt-6 text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>SHIPPER · {signupType === "신규" ? "NEW COMPANY" : "JOIN EXISTING"}</div>
          <h1 className="text-[26px] font-black mt-1">{signupType === "신규" ? "신규 가입신청" : "기존 회사 추가 가입"}</h1>
          <p className="text-white/65 text-[14px] mt-1.5 leading-relaxed">{signupType === "신규" ? "회사 정보와 담당자 정보를 입력해 주세요. 거래하는 운송사를 연결하면 오더 요청이 바로 전달돼요." : "소속 회사를 검색해서 고르고 담당자 정보를 입력해 주세요."}</p>
          <div className="hidden lg:block mt-8 space-y-3">
            {["회사 정보", "담당자 정보", "계정 정보", "약관 동의"].map((t, i) => (
              <div key={t} className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-[12px] font-black" style={{ fontFamily: MONO }}>{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[14.5px] font-bold text-white/85">{t}</span>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-8 lg:p-10 grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2 content-start min-w-0">

          {/* 회사 정보 */}
          <SectionLabel>회사 정보</SectionLabel>

          {/* 기존 가입: 회사명 검색 */}
          {signupType === "기존" ? (
            <Field label="회사명" required full>
              <div className="flex gap-2">
                <input
                  value={companySearchQ}
                  onChange={(e) => { setCompanySearchQ(e.target.value); setSelectedCompanyApp(null); setCompanyName(""); }}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchExistingShipperCompany())}
                  placeholder="회사명 검색"
                  className="flex-1 min-w-0 h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15"
                />
                <button
                  type="button"
                  onClick={searchExistingShipperCompany}
                  disabled={companySearching}
                  className="h-12 px-4 sm:px-5 shrink-0 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black hover:bg-[#1B2B4B] transition whitespace-nowrap disabled:opacity-50"
                >
                  {companySearching ? "검색 중..." : "검색"}
                </button>
              </div>

              {companySuggestions.length > 0 && (
                <div className="mt-1 border border-[#DCE3EE] rounded-xl overflow-hidden shadow-sm">
                  {companySuggestions.map((item, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectCompanySuggestion(item)}
                      className="w-full text-left px-4 py-3 hover:bg-[#EEF3FC] border-b border-[#EEF1F6] last:border-b-0 transition"
                    >
                      <div className="text-[14px] font-bold text-[#1B2B4B]">{item.companyName}</div>
                      <div className="text-[12px] text-[#7A89A3] mt-0.5 flex flex-wrap gap-x-3">
                        {item.businessNumber && <span>사업자번호: {item.businessNumber}</span>}
                        {item.name && <span>대표: {item.name}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {hasCompanySearched && !companySearching && companySuggestions.length === 0 && (
                <div className="mt-2 bg-[#F3F6FA] border border-[#DCE3EE] text-[#1B2B4B] text-[13px] px-4 py-3 rounded-xl">
                  <strong>"{companySearchQ}"</strong>(으)로 등록된 화주 회사가 없습니다.<br />
                  신규가입으로 진행해 주세요.
                </div>
              )}

              {selectedCompanyApp && (
                <div className="mt-2 flex items-center gap-2 bg-[#EEF3FC] border border-[#C9D6EE] px-3 py-2 rounded-xl">
                  <span className="text-[13px] text-[#0F1A30] font-semibold">{selectedCompanyApp.companyName}</span>
                  <button
                    type="button"
                    onClick={() => { setSelectedCompanyApp(null); setCompanyName(""); setCompanySearchQ(""); setBusinessNumber(""); setAddress(""); }}
                    className="text-[11px] text-[#5B6B85] hover:text-[#0F1A30] ml-auto"
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
                className="w-full h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15"
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
                className="w-full h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15"
              />
            </Field>
          )}

          {signupType === "기존" && (
            <Field label="사업자번호">
              <input
                value={businessNumber}
                readOnly
                placeholder="회사 선택 시 자동 입력"
                className="w-full border border-[#DCE3EE] rounded-xl px-4 py-2.5 text-[14px] bg-[#F7F9FC] focus:outline-none cursor-default"
              />
            </Field>
          )}

          {/* 신규 가입: 연결 운송사 검색 */}
          {signupType === "신규" && (
            <Field label="연결 운송사" full>
              <div className="flex gap-2">
                <input
                  value={transportSearchQ}
                  onChange={(e) => { setTransportSearchQ(e.target.value); setSelectedTransport(null); }}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchTransportCompany())}
                  placeholder="운송사명 검색 (선택사항)"
                  className="flex-1 min-w-0 h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15"
                />
                <button
                  type="button"
                  onClick={searchTransportCompany}
                  disabled={transportSearching}
                  className="h-12 px-4 sm:px-5 shrink-0 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black hover:bg-[#1B2B4B] transition whitespace-nowrap disabled:opacity-50"
                >
                  {transportSearching ? "검색 중..." : "검색"}
                </button>
              </div>

              {transportSuggestions.length > 0 && (
                <div className="mt-1 border border-[#DCE3EE] rounded-xl overflow-hidden shadow-sm">
                  {transportSuggestions.map((item, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectTransportSuggestion(item)}
                      className="w-full text-left px-4 py-3 hover:bg-[#EEF3FC] border-b border-[#EEF1F6] last:border-b-0 transition"
                    >
                      <div className="text-[14px] font-bold text-[#1B2B4B]">{item.companyName}</div>
                      <div className="text-[12px] text-[#7A89A3] mt-0.5 flex flex-wrap gap-x-3">
                        {item.businessNumber && <span>사업자번호: {item.businessNumber}</span>}
                        {(item.name || item.representative) && <span>대표: {item.name || item.representative}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {hasTransportSearched && !transportSearching && transportSuggestions.length === 0 && (
                <div className="mt-2 bg-[#F3F6FA] border border-[#DCE3EE] text-[#1B2B4B] text-[13px] px-4 py-3 rounded-xl">
                  <strong>"{transportSearchQ}"</strong>(으)로 등록된 운송사가 없습니다.
                </div>
              )}

              {selectedTransport && (
                <div className="mt-2 flex items-center gap-2 bg-[#EEF3FC] border border-[#C9D6EE] px-3 py-2 rounded-xl">
                  <span className="text-[13px] text-[#0F1A30] font-semibold">{selectedTransport.companyName}</span>
                  <span className="text-[12px] text-[#7A89A3]">
                    {selectedTransport.businessNumber && `사업자번호: ${selectedTransport.businessNumber}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setSelectedTransport(null); setTransportSearchQ(""); }}
                    className="text-[11px] text-[#5B6B85] hover:text-[#0F1A30] ml-auto"
                  >
                    ✕
                  </button>
                </div>
              )}

              <p className="text-[11px] text-[#7A89A3] mt-1">
                연결할 운송사를 선택하면 승인 후 오더가 해당 운송사와 연동됩니다.
              </p>
            </Field>
          )}

          {/* 주소 */}
          <Field label="주소" full>
            <div className="flex gap-2 mb-2">
              <input
                value={address}
                readOnly={signupType === "기존"}
                onChange={signupType === "신규" ? (e) => setAddress(e.target.value) : undefined}
                placeholder="주소 검색 버튼을 눌러주세요"
                className={`flex-1 border border-[#DCE3EE] rounded-xl px-4 py-2.5 text-[14px] focus:outline-none ${signupType === "기존" ? "bg-[#F7F9FC] cursor-default" : "focus:border-[#1B2B4B]"}`}
              />
              {signupType === "신규" && (
                <button
                  type="button"
                  onClick={searchAddress}
                  className="h-12 px-4 sm:px-5 shrink-0 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black hover:bg-[#1B2B4B] transition whitespace-nowrap"
                >
                  주소 검색
                </button>
              )}
            </div>
            <input
              value={addressDetail}
              onChange={(e) => setAddressDetail(e.target.value)}
              placeholder="상세주소 입력 (선택)"
              className="w-full h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15"
            />
          </Field>

          {/* 담당자 정보 */}
          <SectionLabel>담당자 정보</SectionLabel>

          <Field label="이름" required>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="이름 입력"
              className="w-full h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15" />
          </Field>

          <Field label="핸드폰번호" required>
            <input value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="010-0000-0000" maxLength={13}
              className="w-full h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15" />
          </Field>

          <Field label="직책">
            <CustomSelect value={position} onChange={(e) => setPosition(e.target.value)}
              className="w-full h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] bg-white">
              <option value="">직책 선택 (선택사항)</option>
              {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </CustomSelect>
          </Field>

          <Field label="입사일">
            <CustomDatePicker value={hireDate} onChange={(e) => setHireDate(e.target.value)} placeholder="입사일 선택 (선택사항)" showIcon
              className="w-full h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] bg-white" />
            <p className="text-[11px] text-[#7A89A3] mt-1.5 pl-1">입사일을 입력하면 연차/월차가 자동으로 설정됩니다.</p>
          </Field>

          {/* 계정 정보 */}
          <SectionLabel>계정 정보</SectionLabel>

          <Field label="이메일" required full>
            <div className="flex gap-2">
              <input type="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailChecked(false); setEmailCheckMsg(null); }}
                placeholder="이메일 입력"
                className="flex-1 min-w-0 h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15" />
              <button
                type="button"
                onClick={checkEmailDuplicate}
                disabled={checkingEmail}
                className="h-12 px-4 sm:px-5 shrink-0 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black hover:bg-[#1B2B4B] transition whitespace-nowrap disabled:opacity-50"
              >
                {checkingEmail ? "확인 중..." : "중복확인"}
              </button>
            </div>
            {emailCheckMsg && (
              <p className={`text-[12px] mt-1 ${emailCheckMsg.ok ? "text-[#2D4C82]" : "text-[#0F1A30]"}`}>
                {emailCheckMsg.msg}
              </p>
            )}
          </Field>

          <Field label="비밀번호" required>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상 입력"
              className="w-full h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15" />
          </Field>

          <Field label="비밀번호 확인" required>
            <input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="비밀번호 다시 입력"
              className="w-full h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15" />
          </Field>

          {/* 약관 */}
          <SectionLabel>약관 동의</SectionLabel>

          <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
            <div className="space-y-2"><TermsBox title="서비스 이용약관" text={SERVICE_TERMS} />
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={termsAgreed} onChange={(e) => setTermsAgreed(e.target.checked)}
                className="w-4 h-4 rounded accent-[#0F1A30] cursor-pointer" />
              <span className="text-[14px] font-bold text-[#0F1A30]">
                서비스 이용약관에 동의합니다 <span className="text-[#2D4C82]">*</span>
              </span>
            </label></div>
            <div className="space-y-2">
            <TermsBox title="개인정보처리방침" text={PRIVACY_TERMS} />
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={privacyAgreed} onChange={(e) => setPrivacyAgreed(e.target.checked)}
                className="w-4 h-4 rounded accent-[#0F1A30] cursor-pointer" />
              <span className="text-[14px] font-bold text-[#0F1A30]">
                개인정보처리방침에 동의합니다 <span className="text-[#2D4C82]">*</span>
              </span>
            </label></div>
          </div>

          {error && (
            <div className="md:col-span-2 bg-[#0F1A30] text-white text-[14px] font-bold px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="md:col-span-2 w-full h-14 rounded-2xl text-white font-black text-[16px] transition disabled:opacity-50 mt-2 shadow-[0_12px_26px_rgba(15,26,48,0.28)]" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>
            {loading ? "처리 중..." : "가입 신청"}
          </button>
        </form>
      </div>
    </div>
    {addressPopupOpen && (
      <div
        className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center px-4"
        onClick={() => setAddressPopupOpen(false)}
      >
        <div
          className="w-full max-w-md h-[70vh] bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#EEF1F6]">
            <span className="text-[14px] font-bold text-[#1B2B4B]">주소 검색</span>
            <button
              type="button"
              onClick={() => setAddressPopupOpen(false)}
              className="text-[#7A89A3] hover:text-[#0F1A30] text-[16px] leading-none"
            >
              ✕
            </button>
          </div>
          <div ref={addressBoxRef} className="flex-1" />
        </div>
      </div>
    )}
    </>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="md:col-span-2 flex items-center gap-2.5 pt-3 pb-1 border-b border-[#EEF1F6]">
      <span className="w-1.5 h-1.5 rotate-45 bg-[#2D4C82]" />
      <span className="text-[16px] font-black text-[#0F1A30]">{children}</span>
    </div>
  );
}

function Field({ label, required, children, full }) {
  return (
    <div className={`min-w-0 ${full ? "md:col-span-2" : ""}`}>
      <label className="block text-[13.5px] font-black text-[#3A4A66] mb-1.5">
        {label}
        {required && <span className="text-[#2D4C82] ml-0.5">*</span>}
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
