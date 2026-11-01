// src/Signup.jsx  —  운송사 회원가입
import { EXEC_TEAM, isExecPosition, suggestRole } from "./hrConstants";
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { checkEmailAvailable, warmSignupFunctions } from "./emailCheck";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "firebase/auth";
import { auth, db, FUNCTIONS_BASE } from "./firebase";
import { freeDeletedEmail } from "./freeEmail";
import { readPublicCompanies } from "./publicCompanies";
import CustomSelect from "./CustomSelect";
import CustomDatePicker from "./CustomDatePicker";
import {
  doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, addDoc, updateDoc,
} from "firebase/firestore";

// 운송사 목록 — 가입 화면이 열릴 때 한 번 받아 두고, 입력할 때마다 바로 거른다(드롭다운 즉시)
let companyListPromise = null;
function loadCompanyList() {
  if (!companyListPromise) {
    // ① 공개 목록(로그인 전 읽기 가능) ② 서버 함수 — 둘을 합친다(어느 한쪽만 돼도 검색됨)
    const pub = readPublicCompanies().catch(() => []);
    const fn = fetch(`${FUNCTIONS_BASE}/findCompany?all=1`).then((r) => (r.ok ? r.json() : null))
      .then((j) => (Array.isArray(j?.results) ? j.results : [])).catch(() => []);
    companyListPromise = Promise.all([pub, fn]).then(([a, b]) => {
      const m = new Map();
      [...a, ...b].forEach((c) => { const n = String(c.companyName || "").trim(); if (n && (!m.has(n) || (!m.get(n).address && c.address))) m.set(n, { companyName: n, address: c.address || "" }); });
      const list = [...m.values()].sort((x, y) => x.companyName.localeCompare(y.companyName, "ko"));
      if (!list.length) { companyListPromise = null; return null; }
      return list;
    });
  }
  return companyListPromise;
}
// 기존 회사 검색 — 로그인 전이라 서버 함수(findCompany)로 찾고, 로그인 상태면 직접 조회도 시도
async function findCompanies(q, exact = false) {
  const list = await loadCompanyList();
  if (list) {
    const key = String(q || "").trim().toLowerCase().replace(/\s+/g, "");
    const hit = list.filter((c) => { const n = String(c.companyName || "").toLowerCase().replace(/\s+/g, ""); return exact ? n === key : n.includes(key); });
    if (hit.length) return hit;
  }
  const key = String(q || "").trim().toLowerCase();
  try {
    const r = await fetch(`${FUNCTIONS_BASE}/findCompany?q=${encodeURIComponent(key)}${exact ? "&exact=1" : ""}`);
    if (r.ok) { const j = await r.json(); if (Array.isArray(j.results)) return j.results; }
  } catch { /* 함수 배포 전 */ }
  const snap = await getDocs(query(collection(db, "transportApplications"), where("type", "==", "신규"), where("status", "==", "approved")));
  return snap.docs.map((d) => ({ ...d.data(), _docId: d.id }))
    .filter((d) => { const n = (d.companyName || "").trim().toLowerCase(); return exact ? n === key : n.includes(key); });
}

const POSITIONS = ["대표", "전무", "이사", "팀장", "과장", "대리", "사원", "기타"];

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
          <div className="text-[11px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>TRANSPORT · SIGN UP</div>
          <h1 className="text-[30px] font-black text-white tracking-tight mt-1">운송사 회원가입</h1>
          <p className="text-[14.5px] text-white/60 mt-1.5">가입 유형을 골라 주세요</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card type="신규" dark en="NEW COMPANY" title="신규 가입신청" desc="처음 쓰는 운송사 등록" points={["회사 정보 · 사업자번호", "요금제 선택", "승인 후 바로 사용(승인 전 둘러보기)"]} />
          <Card type="기존" en="JOIN EXISTING" title="기존 회사 추가 가입" desc="이미 쓰는 회사의 직원 계정" points={["회사명 검색 → 선택", "담당자 정보 입력", "회사 관리자가 승인하면 사용"]} />
        </div>
        <p className="text-center text-[14px] text-white/60 mt-7">
          이미 계정이 있으신가요?{" "}
          <button onClick={() => navigate("/transport-login")} className="text-white font-black hover:underline">로그인</button>
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
  // 💳 신규 운송사 — 쓰실 요금제(승인할 때 이 요금제로 열린다. 관리자가 승인 때 바꿀 수 있음)
  const [planId, setPlanId] = useState("standard");
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
  const [success, setSuccess] = useState(false);

  // 기존 회사 검색
  const [companySearchQ, setCompanySearchQ] = useState("");
  const [companySuggestions, setCompanySuggestions] = useState([]);
  const [companySearching, setCompanySearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedCompanyApp, setSelectedCompanyApp] = useState(null);

  const [companyList, setCompanyList] = useState(null);
  useEffect(() => { warmSignupFunctions(); loadCompanyList().then((l) => l && setCompanyList(l)); }, []);
  const instantMatches = (q) => {
    const key = String(q || "").trim().toLowerCase().replace(/\s+/g, "");
    if (!key || !companyList) return [];
    return companyList.filter((c) => String(c.companyName || "").toLowerCase().replace(/\s+/g, "").includes(key)).slice(0, 8);
  };
  const searchExistingCompany = async () => {
    const q = companySearchQ.trim();
    if (!q) return;
    setCompanySearching(true);
    setHasSearched(false);
    try {
      setCompanySuggestions(await findCompanies(q));
    } catch (_) {
      setCompanySuggestions([]);
    } finally {
      setCompanySearching(false);
      setHasSearched(true);
    }
  };

  const selectCompanySuggestion = (item) => {
    setCompanyName(item.companyName || "");
    setCompanySearchQ(item.companyName || "");
    setAddress(item.address || "");
    setAddressDetail("");
    setSelectedCompanyApp(item);
    setCompanySuggestions([]);
    setHasSearched(false);
  };

  // 이메일 중복확인
  const [emailCheckMsg, setEmailCheckMsg] = useState(null);
  const [emailChecking, setEmailChecking] = useState(false);

  const checkEmailDuplicate = async () => {
    const e = email.trim();
    if (!e) return setEmailCheckMsg({ text: "이메일을 입력해주세요.", type: "error" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return setEmailCheckMsg({ text: "올바른 이메일 형식을 입력해주세요.", type: "error" });
    setEmailChecking(true);
    try {
      const st = await checkEmailAvailable(e);
      if (st === "free") {
        setEmailCheckMsg({ text: "사용 가능한 이메일입니다.", type: "ok" });
      } else if (st === "unknown") {
        setEmailCheckMsg({ text: "확인되었습니다. 이미 가입된 이메일이면 가입 신청 때 안내됩니다.", type: "ok" });
      } else {
        setEmailCheckMsg({ text: "이미 사용 중인 이메일입니다.", type: "error" });
      }
    } catch (_) {
      setEmailCheckMsg({ text: "확인 중 오류가 발생했습니다.", type: "error" });
    } finally {
      setEmailChecking(false);
    }
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

  const validateExistingCompany = async () => {
    const n = companyName.trim();
    if (selectedCompanyApp && selectedCompanyApp.companyName === n) return true;
    let found = null;
    try { found = (await findCompanies(n, true)).length > 0; } catch { found = null; }
    if (found === false) {
      setError(`"${n}"(으)로 등록된 운송사가 없습니다. 회사명 검색 후 선택해주세요.`);
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

    const fullAddress = address + (addressDetail ? ` ${addressDetail}` : "");

    const writeUserDocs = async (uid) => {
      await setDoc(doc(db, "users", uid), {
        uid,
        email: email.trim(),
        companyName: companyName.trim(),
        name: name.trim(),
        phone: phone.trim(),
        position: position || "",
        // ⭐ 2026-10-31 대표·전무·이사는 임원 부서로(로그인하면 임원 화면). 기존 회사 합류자는 직책 기준 추천 권한으로 시작
        team: isExecPosition(position) ? EXEC_TEAM : "",
        hireDate: hireDate || "",
        address: fullAddress,
        role: signupType === "신규" ? "admin" : suggestRole({ team: isExecPosition(position) ? EXEC_TEAM : "", position }),
        approved: false,
        isMaster: false,
        requestedPlan: signupType === "신규" ? planId : "",
        status: null,
        createdAt: serverTimestamp(),
      });
      if (hireDate) {
        await setDoc(doc(db, "userProfiles", uid), { hireDate }, { merge: true }).catch(() => {});
      }
      await addDoc(collection(db, "transportApplications"), {
        type: signupType,
        companyName: companyName.trim(),
        businessNumber: signupType === "신규" ? businessNumber.trim() : "",
        requestedPlan: signupType === "신규" ? planId : "",
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
      // 기존 가입: 회사에 주소가 없었으면 이번에 입력된 주소를 회사 원본 신청서에 저장
      if (signupType === "기존" && fullAddress.trim() && selectedCompanyApp?._docId && !selectedCompanyApp.address) {
        try {
          await updateDoc(doc(db, "transportApplications", selectedCompanyApp._docId), { address: fullAddress.trim() });
        } catch (_) {}
      }
    };

    try {
      let res;
      try {
        res = await createUserWithEmailAndPassword(auth, email.trim(), password);
      } catch (e1) {
        // ⭐ 2026-11-01 삭제된 계정의 이메일이면 서버가 정리해 준 뒤 다시 가입
        if (e1?.code !== "auth/email-already-in-use" || !(await freeDeletedEmail(email))) throw e1;
        res = await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
      await writeUserDocs(res.user.uid);
      await signOut(auth);
      setSuccess(true);
    } catch (err) {
      const code = err.code || "";
      if (code === "auth/email-already-in-use") {
        // 관리자가 계정을 삭제했는지 확인 — 로그인 전에는 users 목록을 못 읽으므로
        // 입력한 비밀번호로 먼저 로그인해 "내 문서"만 확인한다(본인 문서는 읽기 허용).
        try {
          const reLogin = await signInWithEmailAndPassword(auth, email.trim(), password);
          const mine = await getDoc(doc(db, "users", reLogin.user.uid)).catch(() => null);
          const d = mine?.exists() ? mine.data() : null;
          const isDeleted = !d || d.status === "deleted" || d.status === "withdrawn";
          if (isDeleted) {
            await writeUserDocs(reLogin.user.uid);
            await signOut(auth);
            setSuccess(true);
          } else {
            await signOut(auth);
            setError("이미 가입된 이메일입니다. 로그인 화면에서 로그인해 주세요.");
          }
        } catch (_) {
          setError("이미 가입된 이메일입니다. 예전에 쓰던 계정이면 그때 비밀번호를 입력하거나, 로그인 화면의 비밀번호 재설정을 이용해 주세요.");
        }
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
    <>
    <div className="min-h-screen bg-[#EEF2F8] flex items-start lg:items-center justify-center px-0 sm:px-4 py-0 sm:py-8">
      <div className="w-full max-w-[1120px] bg-white sm:rounded-[26px] shadow-[0_24px_60px_rgba(11,20,40,.14)] overflow-hidden lg:grid lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* 왼쪽(PC) · 위(모바일) 안내 패널 */}
        <div className="relative text-white px-7 py-7 lg:py-10 flex flex-col" style={{ background: GRID_BG }}>
          <button type="button" onClick={onBack} className="self-start h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 text-[13px] font-bold hover:bg-white/15">← 가입 유형</button>
          <div className="mt-6 text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{signupType === "신규" ? "NEW COMPANY" : "JOIN EXISTING"}</div>
          <h1 className="text-[26px] font-black mt-1">{signupType === "신규" ? "신규 가입신청" : "기존 회사 추가 가입"}</h1>
          <p className="text-white/65 text-[14px] mt-1.5 leading-relaxed">{signupType === "신규" ? "회사 정보와 담당자 정보를 입력하면 관리자 승인 후 바로 쓸 수 있어요." : "소속 회사를 검색해서 고르고 담당자 정보를 입력해 주세요. 회사 관리자가 승인하면 로그인할 수 있어요."}</p>
          <div className="hidden lg:block mt-8 space-y-3">
            {["회사 정보", "담당자 정보", "계정 정보", "약관 동의"].map((t, i) => (
              <div key={t} className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-[12px] font-black" style={{ fontFamily: MONO }}>{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[14.5px] font-bold text-white/85">{t}</span>
              </div>
            ))}
          </div>
          <div className="hidden lg:block mt-auto pt-10 text-[12.5px] text-white/45">문의 · 관리자 승인 후 로그인 가능합니다</div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-8 lg:p-10 grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2 content-start min-w-0">

          {/* 회사 정보 */}
          <SectionLabel>회사 정보</SectionLabel>

          <Field label="회사명" required full={signupType === "기존"}>
            {signupType === "기존" ? (
              <div className="relative">
                <div className="flex gap-2">
                  <input
                    value={companySearchQ}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCompanySearchQ(v); setCompanyName(v); setSelectedCompanyApp(null);
                      if (companyList) { setCompanySuggestions(instantMatches(v)); setHasSearched(!!v.trim()); }
                      else { setCompanySuggestions([]); setHasSearched(false); }
                    }}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchExistingCompany())}
                    placeholder="회사명 검색"
                    className="flex-1 min-w-0 h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15"
                  />
                  <button type="button" onClick={searchExistingCompany} disabled={companySearching}
                    className="h-12 px-4 sm:px-5 shrink-0 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black hover:bg-[#1B2B4B] transition whitespace-nowrap disabled:opacity-50">
                    {companySearching ? "검색 중..." : "검색"}
                  </button>
                </div>
                {companySuggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-[#DCE3EE] rounded-xl shadow-[0_18px_40px_rgba(15,26,48,.18)] overflow-hidden max-h-[320px] overflow-y-auto">
                    {companySuggestions.map((item, i) => (
                      <button key={i} type="button"
                        onClick={() => selectCompanySuggestion(item)}
                        className="w-full text-left px-4 py-3 hover:bg-[#EEF3FC] border-b border-[#EEF1F6] last:border-b-0 transition">
                        <div className="text-[14px] font-bold text-[#1B2B4B]">{item.companyName}</div>
                        {item.address && <div className="text-[12.5px] text-[#7A89A3] mt-0.5 truncate">{item.address}</div>}
                      </button>
                    ))}
                  </div>
                )}
                {!hasSearched && companySearchQ && !companySearching && companySuggestions.length === 0 && (
                  <p className="text-[12.5px] text-[#7A89A3] mt-1.5 pl-1">검색 버튼을 눌러 회사를 찾아보세요</p>
                )}
                {hasSearched && !companySearching && companySuggestions.length === 0 && (
                  <div className="mt-2 p-3 bg-[#F3F6FA] border border-[#DCE3EE] rounded-xl text-[13.5px] text-[#1B2B4B] leading-relaxed">
                    <strong>"{companySearchQ}"</strong>(으)로 등록된 운송사가 없습니다.<br/>
                    신규가입으로 진행해 주세요.
                  </div>
                )}
              </div>
            ) : (
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                placeholder="회사명 입력"
                className="w-full h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15" />
            )}
          </Field>

          {signupType === "신규" && (
            <Field label="사업자번호" required>
              <input value={businessNumber}
                onChange={(e) => setBusinessNumber(formatBizNum(e.target.value))}
                placeholder="000-00-00000" maxLength={12}
                className="w-full h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15" />
            </Field>
          )}

          {signupType === "신규" && (
            <Field label="요금제" required full>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[["lite", "라이트", "월 4.9만"], ["basic", "베이직", "월 9.9만"], ["standard", "스탠다드", "월 15만"], ["pro", "프로", "월 34.9만"]].map(([id, nm, pr]) => (
                  <button key={id} type="button" onClick={() => setPlanId(id)}
                    className={`rounded-xl border px-3.5 py-3 text-left transition ${planId === id ? "border-[#1B2B4B] bg-[#1B2B4B] text-white" : "border-[#DCE3EE] text-[#1B2B4B] hover:border-[#2D4C82]"}`}>
                    <div className="text-[14px] font-black whitespace-nowrap">{nm}</div>
                    <div className={`text-[12px] font-semibold whitespace-nowrap ${planId === id ? "text-white/70" : "text-[#7A89A3]"}`}>{pr} · VAT 별도</div>
                  </button>
                ))}
              </div>
              <div className="text-[12.5px] text-[#7A89A3] mt-1.5">승인되면 고른 요금제의 메뉴로 열립니다. 쓰면서 언제든 바꿀 수 있습니다.</div>
            </Field>
          )}

          <Field label="주소" full>
            <div className="flex gap-2 mb-2">
              <input value={address}
                readOnly={signupType !== "기존"}
                onChange={signupType === "기존" ? (e) => setAddress(e.target.value) : undefined}
                placeholder={signupType === "기존" ? "회사 선택 시 자동입력, 직접 입력도 가능" : "주소 검색 버튼을 눌러주세요"}
                className={`flex-1 min-w-0 h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15 ${signupType !== "기존" ? "bg-[#F7F9FC] cursor-default" : ""}`} />
              <button type="button" onClick={searchAddress}
                className="h-12 px-4 sm:px-5 shrink-0 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black hover:bg-[#1B2B4B] transition whitespace-nowrap">
                주소 검색
              </button>
            </div>
            <input value={addressDetail} onChange={(e) => setAddressDetail(e.target.value)}
              placeholder="상세주소 입력 (선택)"
              className="w-full h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15" />
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
            <p className="text-[12.5px] text-[#7A89A3] mt-1.5 pl-1">입사일을 입력하면 연차/월차가 자동으로 설정됩니다.</p>
          </Field>

          {/* 계정 정보 */}
          <SectionLabel>계정 정보</SectionLabel>

          <Field label="이메일" required full>
            <div className="flex gap-2">
              <input type="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailCheckMsg(null); }}
                placeholder="이메일 입력"
                className="flex-1 min-w-0 h-12 border border-[#DCE3EE] rounded-xl px-4 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15" />
              <button type="button" onClick={checkEmailDuplicate} disabled={emailChecking}
                className="h-12 px-4 sm:px-5 shrink-0 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black hover:bg-[#1B2B4B] transition whitespace-nowrap disabled:opacity-50">
                {emailChecking ? "확인 중..." : "중복확인"}
              </button>
            </div>
            {emailCheckMsg && (
              <p className={`text-[12px] mt-1.5 pl-1 font-medium ${emailCheckMsg.type === "ok" ? "text-[#2D4C82]" : "text-[#0F1A30]"}`}>
                {emailCheckMsg.text}
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

          {success && (
            <div className="md:col-span-2 bg-[#EEF3FC] border border-[#C9D6EE] text-[#0F1A30] text-[14px] px-4 py-3.5 rounded-xl font-bold">
              운송사 가입신청이 완료되었습니다. 관리자 승인 후 로그인이 가능합니다.
              <div className="grid grid-cols-2 gap-2 mt-2.5">
                <button type="button" onClick={() => navigate(`/preview?co=${encodeURIComponent(companyName.trim())}&plan=${signupType === "신규" ? planId : ""}`)}
                  className="h-10 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-black">승인 전 둘러보기</button>
                <button type="button" onClick={() => navigate("/login")}
                  className="h-10 rounded-xl border border-[#1B2B4B]/30 bg-white text-[#1B2B4B] text-[13px] font-black">로그인 화면으로</button>
              </div>
            </div>
          )}

          {error && (
            <div className="md:col-span-2 bg-[#0F1A30] text-white text-[14px] font-bold px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || success}
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
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-[14px] font-bold text-[#1B2B4B]">주소 검색</span>
            <button
              type="button"
              onClick={() => setAddressPopupOpen(false)}
              className="text-gray-400 hover:text-gray-600 text-[16px] leading-none"
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
export default function Signup() {
  const [signupType, setSignupType] = useState(null);

  if (!signupType) {
    return <TypeSelect onSelect={setSignupType} />;
  }
  return <SignupForm signupType={signupType} onBack={() => setSignupType(null)} />;
}
