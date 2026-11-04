// src/driver/DriverRegister.jsx
import { coDocKey } from "../coKey";
import React, { useState, useEffect, useRef } from "react";
import { readPublicCompanies } from "../publicCompanies";
import CustomDatePicker from "../CustomDatePicker";
import { auth, db, FUNCTIONS_BASE } from "../firebase";
import { fmtPhone } from "../formatInput";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { legacyDriverEmail, scopedDriverEmail, legacyOwnerCompany } from "./driverEmail";
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { addDoc, collection } from "firebase/firestore";
import { BANK_NAMES, accountLengths, formatAccount, validateAccount, onlyDigits } from "../bankUtil";
import { compressImage } from "../InternalMail";
import { LogisMark } from "../brand"; // 🔷 2026-11-04 LogisWeb 로고

// ⭐ 사용자 요청 — 차량종류/톤수/거주지를 가입할 때 드롭다운으로 선택하게 한다
// (이전엔 "1톤"/"카고"가 뒤섞인 한 줄짜리 목록 하나만 있었음). 차종은 "직접입력"을
// 고르면 밑에 자유 입력칸이 나온다.
const VEHICLE_CATEGORIES = ["라보/다마스", "카고", "윙바디", "탑차", "냉장/냉동윙", "냉장/냉동탑", "직접입력"];
// ⭐ 사용자 요청 — 1톤 단위 숫자가 아니라 실제 차량제원표(PC의 CARGO_VEHICLE_SPEC_TABLE)와
// 동일한 표기(장축/와이드/광폭 등)로 선택하게 한다.
const TON_OPTIONS = [
  "1톤", "1톤 장축", "1.4톤", "1.4톤 장축", "2.5톤", "3.5톤", "3.5톤 장축", "3.5톤 와이드",
  "5톤", "5톤 플러스", "5톤 축", "8톤", "8톤 특장", "9.5톤", "11톤", "11톤 장축", "11톤 후축",
  "14톤", "14톤 후축", "18톤", "22톤", "25톤", "추레라",
];
// 거주지 — 시/도 1차 선택, 경기도만 시/군 2차 선택(수원인지 파주인지가 배차 거리
// 판단에 중요하다는 요청). 다른 광역시/도는 지역이 좁아 1차 선택만으로 충분하다고
// 보고 생략했다 — 필요해지면 같은 방식으로 RESIDENCE_SUB_REGIONS에 추가하면 된다.
const RESIDENCE_PROVINCES = ["서울", "인천", "경기", "강원", "충북", "충남", "대전", "세종", "전북", "전남", "광주", "경북", "경남", "대구", "울산", "부산", "제주"];
const RESIDENCE_SUB_REGIONS = {
  경기: ["수원", "성남", "고양", "용인", "부천", "안산", "안양", "남양주", "화성", "평택", "의정부", "시흥", "파주", "김포", "광명", "군포", "광주", "이천", "양주", "오산", "구리", "안성", "포천", "의왕", "하남", "여주", "동두천", "과천", "가평", "양평", "연천"],
};

const DRIVER_TERMS = `제1조 (목적)
본 약관은 S-Flow 물류 관리 플랫폼(이하 "서비스")의 기사(차주) 회원 이용과 관련하여 권리, 의무 및 책임사항을 규정합니다.

제2조 (서비스 내용)
① 배차 현황 조회, 운행 정보 관리, 배차 알림 수신 등의 기능을 제공합니다.
② 서비스 세부 내용은 운영 정책에 따라 변경될 수 있으며, 사전 공지합니다.

제3조 (이용자 의무)
① 가입 시 정확한 차량번호와 이름을 등록해야 합니다.
② 허위 정보 등록, 타인 사칭 등의 행위를 금지합니다.
③ 배차 수락 후 정당한 사유 없이 운행을 거부하는 행위를 금지합니다.
④ 서비스를 통해 취득한 화주사 및 화물 정보를 외부에 유출하는 행위를 금지합니다.

제4조 (서비스 이용 제한)
약관 위반, 부정 이용, 사고 은폐 등의 경우 서비스 이용을 제한할 수 있습니다.`;

const DRIVER_GPS = `수집 항목
- GPS 위치 좌표 (위도·경도), 이동 속도, 이동 경로

수집 목적
- 실시간 차량 위치 모니터링 및 배차 관제
- 운행 이력 기록 및 안전 관리 (출근·퇴근·이동 경로)
- 충돌 등 이상 상황 감지 및 긴급 대응

수집 주기
- 앱 사용 중 상시 (출근 이후 ~ 퇴근 시까지)
- 정확도 100m 이하의 GPS 신호만 저장됩니다

보유 기간
- 운행 종료 후 3개월

위치정보 수집에 동의하지 않을 경우 차량 관제 서비스 이용이 제한될 수 있습니다.`;

const DRIVER_PRIVACY = `수집하는 개인정보 항목
- 필수: 이름, 차량번호, 휴대폰번호
- 선택: 차종·톤수, 거주지, 정산 계좌, 사업자 정보

수집 및 이용 목적
- 배차 관리 서비스 제공 및 운행 매칭
- 회원 관리 및 본인 확인
- 운행 이력 관리 및 정산 처리

보유 및 이용 기간
- 서비스 이용 계약 종료 후 3년 (관련 법령에 따름)

개인정보의 제3자 제공
배차 업무 수행을 위해 운송사에게 필요 최소 정보를 제공할 수 있습니다.

개인정보 처리 위탁
서비스 운영을 위해 Firebase(Google LLC)를 이용하며, 데이터는 암호화되어 보관됩니다.`;

// ⭐ 사용자 요청(2026-10-30) — 한 화면에 길게 늘어선 입력칸을 단계별로 나눴다.
// ⭐ 2026-11-03 사용자 요청 — 연세 있는 기사님도 쉽게 가입하도록 필수는 이름·차량번호·휴대폰번호(+소속 운송사)만.
//  차종/톤수·거주지·계좌·사업자·입사일 등은 첫 화면 아래 "추가 정보(선택)"에 접어 두고(가입 후 내 정보에서 입력 가능),
//  단계는 [기본 정보] → [동의 · 등록] 두 개로 줄였다. 입력칸·버튼도 크게.
const STEPS = [
  { key: "basic", en: "DRIVER INFO", title: "기사님 정보", desc: "이름 · 차량번호 · 휴대폰번호만 입력하면 됩니다" },
  { key: "terms", en: "AGREEMENT", title: "동의하고 등록", desc: "입력 내용을 확인하고 등록을 눌러주세요" },
];

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const inputCls = "w-full h-14 border-2 border-[#DCE3EE] rounded-2xl px-4 text-[18px] font-bold text-[#0F1A30] bg-white placeholder:text-[#9AA7BD] placeholder:font-semibold focus:outline-none focus:border-[#2D4C82] focus:ring-4 focus:ring-[#2D4C82]/10 transition";

function Field({ label, req, hint, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-[16px] font-black text-[#1B2B4B]">{label}{req && <span className="text-[#2D4C82] ml-0.5">*</span>}</label>
        {!req && <span className="text-[12px] font-bold text-[#9AA7BD]">선택</span>}
      </div>
      {children}
      {hint && <p className="text-[13px] text-[#7A89A3] mt-1.5">{hint}</p>}
    </div>
  );
}

// 큰 선택 버튼 묶음 — 드롭다운 대신 한 번에 보이고 바로 누른다(같은 걸 다시 누르면 선택 해제)
function Chips({ options, value, onPick, cols = 3, size = "md", label = (o) => o }) {
  const h = size === "xs" ? "h-9 text-[13px]" : size === "sm" ? "h-10 text-[14px]" : "h-12 text-[15px]";
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <button key={o} type="button" onClick={() => onPick(on ? "" : o)}
            className={`${h} px-0.5 rounded-xl font-black truncate tracking-tight transition-colors border ${on
              ? "bg-[#1B2B4B] border-[#1B2B4B] text-white shadow-[0_6px_16px_rgba(27,43,75,.28)]"
              : "bg-white border-[#DCE3EE] text-[#3A4A66] active:bg-[#EEF3FC]"}`}>
            {label(o)}
          </button>
        );
      })}
    </div>
  );
}

// 접히는 묶음 — "추가 정보(선택)" 안의 항목별 칸
function Fold({ title, summary, open, onToggle, children }) {
  return (
    <div className={`rounded-2xl border ${open ? "border-[#2D4C82]/40 bg-[#F8FAFE]" : "border-[#DCE3EE] bg-white"}`}>
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 px-4 h-14 text-left">
        <span className="flex-1 min-w-0">
          <span className="block text-[15.5px] font-black text-[#0F1A30]">{title}</span>
          {!open && summary && <span className="block text-[12.5px] font-bold text-[#2D4C82] truncate">{summary}</span>}
        </span>
        <span className="text-[13px] font-black text-[#7A89A3] shrink-0">{open ? "접기 ▲" : "열기 ▼"}</span>
      </button>
      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  );
}

function TermRow({ title, text, checked, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-2xl border ${checked ? "border-[#2D4C82]/40 bg-[#F5F8FD]" : "border-[#DCE3EE] bg-white"}`}>
      <div className="flex items-center gap-3 px-3.5 h-14">
        <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <span className={`w-7 h-7 shrink-0 rounded-full grid place-items-center text-[14px] font-black ${checked ? "bg-[#1B2B4B] text-white" : "border-2 border-[#C9D2E0] text-transparent"}`}>✓</span>
          <span className="text-[15px] font-bold text-[#0F1A30] truncate">{title} <span className="text-[#2D4C82] text-[12px]">(필수)</span></span>
        </button>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-[13px] font-bold text-[#7A89A3] px-2 h-9 shrink-0">{open ? "닫기" : "보기"}</button>
      </div>
      {open && (
        <div className="mx-3.5 mb-3 px-3 py-2.5 max-h-36 overflow-y-auto rounded-xl bg-white border border-[#EEF1F6] text-[12.5px] text-[#5B6B85] leading-relaxed whitespace-pre-wrap">{text}</div>
      )}
    </div>
  );
}

// ⭐ 2026-11-03 기사관리에 이미 있는 기사면 서버(linkDriverSignup)가 새 계정과 바로 연결·승인한다.
//  서버가 응답하지 않으면(배포 전 등) null → 예전처럼 승인 대기로 가입.
async function tryAutoLink(user, payload) {
  try {
    const token = await user.getIdToken();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch(`${FUNCTIONS_BASE}/linkDriverSignup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    }).finally(() => clearTimeout(timer));
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

const SAVED_LOGIN_KEY = "driverLoginSaved"; // DriverLogin과 같은 키 — 연결되면 로그인 칸을 미리 채워 둔다

export default function DriverRegister() {
  const [step, setStep] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [coList, setCoList] = useState([]);
  const [coOpen, setCoOpen] = useState(false);
  useEffect(() => { readPublicCompanies().then(setCoList).catch(() => {}); }, []);
  const coKey = companyName.replace(/\s+/g, "").toLowerCase();
  const coMatches = coKey ? coList.filter((c) => c.companyName.replace(/\s+/g, "").toLowerCase().includes(coKey) && c.companyName !== companyName).slice(0, 6) : [];
  const [carNo, setCarNo] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleCategory, setVehicleCategory] = useState("");
  const [vehicleCategoryCustom, setVehicleCategoryCustom] = useState("");
  const [tonnage, setTonnage] = useState("");
  const [residenceProvince, setResidenceProvince] = useState("");
  const [residenceCity, setResidenceCity] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [hireDate, setHireDate] = useState("");
  // 💳 정산 정보(지입·용차 기사 지급용) — 모두 선택(가입 후 내 정보에서 입력 가능)
  const [bank, setBank] = useState({ bank: "", acct: "", holder: "" });
  const [bankReset, setBankReset] = useState(false);
  const [bizNo, setBizNo] = useState("");
  const [bizName, setBizName] = useState("");
  const [bizImg, setBizImg] = useState("");
  const bizFileRef = useRef(null);
  const acctRef = useRef(null);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [gpsAgreed, setGpsAgreed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(""); // "" | "pending"(승인 대기) | "linked"(기존 기사와 연결)
  const [moreOpen, setMoreOpen] = useState(false); // 추가 정보(선택) 펼침
  const [fold, setFold] = useState(""); // 추가 정보 안에서 펼친 묶음 하나
  const navigate = useNavigate();

  // 차량번호는 띄어쓰기 없이(로그인 계정·기사관리 비교가 띄어쓰기 없는 값 기준)
  const plateOf = (v) => String(v || "").replace(/\s+/g, "");
  const category = vehicleCategory === "직접입력" ? vehicleCategoryCustom.trim() : vehicleCategory;
  const residence = residenceCity ? `${residenceProvince} ${residenceCity}` : residenceProvince;

  // 확인 — 통과하면 "", 아니면 안내 문구. 필수는 운송사·차량번호·이름·휴대폰번호, 나머지는 입력했을 때만 형식 확인
  const checkBasic = () => {
    if (!companyName.trim()) return "소속 운송사를 입력해주세요.";
    if (!plateOf(carNo)) return "차량번호를 입력해주세요.";
    if (!name.trim()) return "이름을 입력해주세요.";
    if (!onlyDigits(phone)) return "휴대폰번호를 입력해주세요.";
    if (onlyDigits(phone).length < 10) return "휴대폰번호를 끝까지 입력해주세요.";
    if (bank.acct || bank.holder) {
      const v = validateAccount(bank.bank, bank.acct, bank.holder);
      if (!v.ok) return `정산 계좌: ${v.msg}`;
    }
    if (bizNo && onlyDigits(bizNo).length !== 10) return "사업자등록번호는 10자리입니다.";
    return "";
  };
  const checkStep = (i) => {
    const k = STEPS[i].key;
    if (k === "basic") return checkBasic();
    if (k === "terms" && (!termsAgreed || !privacyAgreed || !gpsAgreed)) return "약관에 모두 동의해주세요.";
    return "";
  };
  // 계좌·사업자 칸에 잘못 들어간 값이 있으면 그 묶음을 펼쳐 보여준다
  const showProblem = (msg) => {
    if (msg.startsWith("정산 계좌")) { setMoreOpen(true); setFold("bank"); }
    else if (msg.startsWith("사업자")) { setMoreOpen(true); setFold("biz"); }
  };

  const register = async () => {
    setError("");
    const bad = STEPS.findIndex((_, i) => checkStep(i));
    if (bad !== -1) { const m = checkStep(bad); setStep(bad); showProblem(m); return setError(m); }

    const plate = plateOf(carNo);
    const co = companyName.trim();
    let email = legacyDriverEmail(plate);
    const password = plate;
    // vehicleType은 기존 화면들이 "카고 3.5톤" 식 한 줄 문자열로 읽던 필드라 하위호환으로 함께 저장(선택 입력이라 비어 있을 수 있음)
    const vehicleType = [category, tonnage].filter(Boolean).join(" ");
    const phoneStr = fmtPhone(phone);

    // ⭐ 사용자 요청 — 관리자가 PC 기사관리에서 미리 등록해둔 기사(인증 계정 없음)가 가입하면 그 값을 이어받는다.
    // ⭐ 버그수정 — drivers 컬렉션은 보안규칙상 로그인한 사용자만 읽을 수 있어 계정을 먼저 만든 뒤 조회한다.
    const normPlate = plate.toUpperCase();
    const payInfo = {
      정산계좌: bank.acct ? { bank: bank.bank, acct: onlyDigits(bank.acct), holder: bank.holder.trim() } : null,
      사업자번호: onlyDigits(bizNo) || "",
      사업자상호: bizName.trim(),
    };

    try {
      setLoading(true);
      let res;
      try {
        res = await createUserWithEmailAndPassword(auth, email, password);
      } catch (e) {
        // ⭐ 2026-11-01 같은 차량번호가 다른 운송사에 이미 있으면 회사별 계정으로 가입
        if (e?.code !== "auth/email-already-in-use") throw e;
        const owner = await legacyOwnerCompany(auth, db, plate);
        if (owner === co) throw e;
        email = scopedDriverEmail(co, plate);
        res = await createUserWithEmailAndPassword(auth, email, password);
      }
      const uid = res.user.uid;

      // ⭐ 2026-11-03 기사관리에 같은 차량번호 + (같은 휴대폰번호 또는 같은 이름) 기사가 있으면 서버가 연결·승인
      const link = await tryAutoLink(res.user, {
        companyName: co, carNo: plate, name: name.trim(), phone: phoneStr,
        차량종류: category, 차량톤수: tonnage, 거주지: residence, 요청사항: requestNote.trim(),
        hireDate: hireDate || "", ...payInfo,
        termsAgreed, privacyAgreed, gpsAgreed,
      });
      if (link?.linked) {
        if (bizImg) {
          await addDoc(collection(db, "driver_documents"), {
            driverId: uid, companyName: co, docType: "bizReg", docLabel: "사업자등록증", status: "제출", fileName: "사업자등록증.jpg", fileType: "image/jpeg", dataUrl: bizImg,
            uploadedAt: { seconds: Math.floor(Date.now() / 1000) }, by: "기사 가입",
          }).catch(() => {});
        }
        try { localStorage.setItem(SAVED_LOGIN_KEY, JSON.stringify({ remember: true, autoLogin: false, companyName: co, carNo: plate, name: name.trim() })); } catch { /* 저장 실패 무시 */ }
        await signOut(auth);
        setSuccess("linked");
        setTimeout(() => navigate("/driver-login"), 3500);
        return;
      }

      let preRegistered = null;
      // ⭐ 2026-11-01 PC 선등록 문서 — 회사별 이름(회사__차량번호) 먼저, 없으면 예전 이름(차량번호)
      const preKey = coDocKey(co, normPlate);
      let preSnap = await getDoc(doc(db, "drivers", preKey));
      if (!preSnap.exists() && preKey !== normPlate) {
        const legacySnap = await getDoc(doc(db, "drivers", normPlate));
        if (legacySnap.exists() && (legacySnap.data().companyName || "").trim() === co) preSnap = legacySnap;
      }
      const preId = preSnap.exists() ? preSnap.id : normPlate;
      if (preSnap.exists()) {
        const d = preSnap.data();
        const sameName = (d.이름 || d.name || "").trim() === name.trim();
        const sameCompany = (d.companyName || "").trim() === co;
        if (sameName && sameCompany) {
          preRegistered = d;
        } else {
          await res.user.delete().catch(() => {});
          setError("이미 등록된 차량번호인데 이름·회사명이 다릅니다. 관리자에게 문의해주세요.");
          return;
        }
      }

      await setDoc(doc(db, "users", uid), {
        uid,
        email,
        role: "driver",
        name: name.trim(),
        carNo: plate,
        phone: phoneStr,
        vehicleType,
        차량종류: category,
        차량톤수: tonnage,
        거주지: residence,
        요청사항: requestNote.trim(),
        companyName: co,
        hireDate: hireDate || "",
        ...payInfo,
        approved: false,
        termsAgreed,
        privacyAgreed,
        gpsAgreed,
        createdAt: serverTimestamp(),
      });
      if (hireDate) {
        await setDoc(doc(db, "userProfiles", uid), { hireDate }, { merge: true }).catch(() => {});
      }

      // ⭐ 버그수정 — PC 기사관리는 한글 필드(이름/차량번호/전화번호), 모바일 DriverHome은 영문 필드를 읽으므로 양쪽 다 쓴다.
      await setDoc(doc(db, "drivers", uid), {
        uid,
        name: name.trim(),
        carNo: plate,
        phone: phoneStr,
        이름: name.trim(),
        차량번호: plate,
        전화번호: phoneStr,
        vehicleType,
        차량종류: category,
        차량톤수: tonnage,
        거주지: residence,
        요청사항: requestNote.trim(),
        companyName: co,
        ...payInfo,
        mainStatus: "대기",
        subStatus: "대기",
        status: "대기",
        state: "대기",
        goStatus: "대기",
        active: false,
        totalDistance: 0,
        approved: false,
        createdAt: preRegistered?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
        // 관리자가 PC에서 미리 지정해둔 값은 가입 입력값보다 우선해서 이어받는다.
        ...(preRegistered ? {
          등급: preRegistered.등급 || "일반",
          담당자: preRegistered.담당자 || null,
          근무요일: preRegistered.근무요일 || [],
          메모: preRegistered.메모 || "",
          등록자: preRegistered.등록자 || "",
        } : {}),
      });
      if (preRegistered) {
        await deleteDoc(doc(db, "drivers", preId)).catch(() => {});
      }
      if (bizImg) {
        // ⭐ 2026-11-02 점검 — 필수서류 키(bizReg)로 저장해야 기사 제출 서류/서류 관리에 표시됨
        await addDoc(collection(db, "driver_documents"), {
          driverId: uid, companyName: co, docType: "bizReg", docLabel: "사업자등록증", status: "제출", fileName: "사업자등록증.jpg", fileType: "image/jpeg", dataUrl: bizImg,
          uploadedAt: { seconds: Math.floor(Date.now() / 1000) }, by: "기사 가입",
        }).catch(() => {});
      }

      await signOut(auth);
      setSuccess("pending");
      setTimeout(() => navigate("/driver-login"), 3500);
    } catch (err) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        setError("이미 등록된 차량번호입니다. 로그인 화면에서 로그인해주세요.");
      } else {
        setError("등록에 실패했습니다. 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  // 🏦 PC 운송사 화면(BankAccountInput)과 같은 규칙 — 은행 형식대로 하이픈 자동, 자리수 확인,
  // 다른 은행으로 바꾸면 계좌번호는 비운다(형식이 달라 그대로 두면 틀린 번호가 저장됨).
  const pickBank = (b) => {
    if (b === bank.bank) return;
    setBankReset(!!bank.acct);
    setBank((v) => ({ ...v, bank: b, acct: "" }));
    setTimeout(() => acctRef.current?.focus(), 50);
  };
  const acctDigits = onlyDigits(bank.acct);
  const acctLens = accountLengths(bank.bank);
  const acctCheck = bank.bank || bank.acct ? validateAccount(bank.bank, bank.acct, bank.holder) : null;

  const go = (i) => { setError(""); setStep(Math.max(0, Math.min(STEPS.length - 1, i))); };
  const next = () => {
    const msg = checkStep(step);
    if (msg) { showProblem(msg); return setError(msg); }
    if (step < STEPS.length - 1) return go(step + 1);
    register();
  };
  const prev = () => (step === 0 ? navigate("/driver-login") : go(step - 1));
  const onEnter = (e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); next(); } };

  const [bankOpen, setBankOpen] = useState(true);
  const S = STEPS[step];
  const last = step === STEPS.length - 1;
  const allAgreed = termsAgreed && privacyAgreed && gpsAgreed;
  const setAll = (v) => { setTermsAgreed(v); setPrivacyAgreed(v); setGpsAgreed(v); };
  const toggleFold = (k) => setFold((f) => (f === k ? "" : k));
  const moreCount = [category || tonnage, residence, bank.acct, bizNo || bizImg, hireDate || requestNote.trim()].filter(Boolean).length;

  const moreBody = (
    <div className="space-y-2.5">
      <Fold title="차량 종류 · 톤수" summary={[category, tonnage].filter(Boolean).join(" ")} open={fold === "vehicle"} onToggle={() => toggleFold("vehicle")}>
        <Field label="차량 종류">
          <Chips options={VEHICLE_CATEGORIES} value={vehicleCategory} onPick={setVehicleCategory} cols={3} />
          {vehicleCategory === "직접입력" && (
            <input value={vehicleCategoryCustom} autoFocus onChange={(e) => setVehicleCategoryCustom(e.target.value)} placeholder="예: 리프트탑" className={`${inputCls} mt-2`} />
          )}
        </Field>
        <Field label="톤수">
          <Chips options={TON_OPTIONS} value={tonnage} onPick={setTonnage} cols={4} size="sm" />
        </Field>
      </Fold>
      <Fold title="거주지" summary={residence} open={fold === "residence"} onToggle={() => toggleFold("residence")}>
        <Field label="시 / 도">
          <Chips options={RESIDENCE_PROVINCES} value={residenceProvince} onPick={(v) => { setResidenceProvince(v); setResidenceCity(""); }} cols={5} size="xs" />
        </Field>
        {RESIDENCE_SUB_REGIONS[residenceProvince] && (
          <Field label={`${residenceProvince} 시 / 군`}>
            <Chips options={RESIDENCE_SUB_REGIONS[residenceProvince]} value={residenceCity} onPick={setResidenceCity} cols={5} size="xs" />
          </Field>
        )}
      </Fold>
      <Fold title="정산 받을 계좌" summary={bank.acct ? `${bank.bank} ${formatAccount(bank.bank, bank.acct)}` : ""} open={fold === "bank"} onToggle={() => toggleFold("bank")}>
        <Field label="은행">
          {bank.bank && !bankOpen ? (
            <div className="flex items-center gap-3 h-14 px-3.5 rounded-2xl border-2 border-[#2D4C82]/40 bg-[#F5F8FD]">
              <span className="w-8 h-8 rounded-xl bg-[#1B2B4B] text-white grid place-items-center text-[12px] font-black">{bank.bank.slice(0, 1)}</span>
              <span className="flex-1 text-[17px] font-black text-[#0F1A30] truncate">{bank.bank}</span>
              <button type="button" onClick={() => setBankOpen(true)} className="h-10 px-3.5 rounded-xl border border-[#C9D6EE] bg-white text-[14px] font-black text-[#1B2B4B]">변경</button>
            </div>
          ) : (
            <Chips options={BANK_NAMES} value={bank.bank} onPick={(b) => { if (b) { pickBank(b); setBankOpen(false); } }} cols={4} size="sm" label={(b) => b.replace(/\(.*\)/, "")} />
          )}
        </Field>
        {!!bank.bank && <>
          <Field label="계좌번호">
            <div className="relative">
              <input ref={acctRef} inputMode="numeric" value={formatAccount(bank.bank, bank.acct)}
                onChange={(e) => { setBankReset(false); setBank((v) => ({ ...v, acct: onlyDigits(e.target.value).slice(0, 16) })); }}
                placeholder="숫자만 입력하면 하이픈 자동"
                className={`${inputCls} pr-24 tabular-nums tracking-wider`} style={{ fontFamily: acctDigits ? MONO : undefined }} />
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 px-2 h-7 rounded-lg grid place-items-center text-[12px] font-black tabular-nums ${acctLens.includes(acctDigits.length) ? "bg-[#1B2B4B] text-white" : "bg-[#EEF2F8] text-[#5B6B85]"}`} style={{ fontFamily: MONO }}>
                {acctDigits.length}{acctLens.length ? `/${acctLens.find((l) => l >= acctDigits.length) || acctLens[acctLens.length - 1]}` : ""}자리
              </span>
            </div>
            <div className="mt-1.5 min-h-[18px] text-[12.5px] font-bold">
              {bankReset ? <span className="text-[#2D4C82]">! 은행이 바뀌어 계좌번호를 초기화했습니다 — 다시 입력해 주세요</span>
                : acctCheck && acctDigits ? <span className={acctCheck.level === "ok" ? "text-[#1B2B4B]" : acctCheck.level === "warn" ? "text-[#2D4C82]" : "text-[#7A89A3]"}>{acctCheck.level === "ok" ? "✓ " : "! "}{acctCheck.msg}</span>
                : acctLens.length ? <span className="text-[#7A89A3]">{bank.bank} 계좌는 보통 {acctLens.join("·")}자리입니다</span> : null}
            </div>
          </Field>
          <Field label="예금주">
            <input value={bank.holder} onChange={(e) => setBank((v) => ({ ...v, holder: e.target.value }))} placeholder={name ? `예: ${name}` : "예금주"} className={inputCls} />
          </Field>
        </>}
      </Fold>
      <Fold title="사업자 정보" summary={bizNo ? `${bizNo}${bizName ? ` · ${bizName}` : ""}` : bizImg ? "사업자등록증 사진 첨부" : ""} open={fold === "biz"} onToggle={() => toggleFold("biz")}>
        <Field label="사업자등록번호">
          <input inputMode="numeric" value={bizNo} onChange={(e) => { const d = onlyDigits(e.target.value).slice(0, 10); setBizNo(d.length > 5 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d); }}
            placeholder="000-00-00000" className={`${inputCls} tabular-nums tracking-wider`} style={{ fontFamily: bizNo ? MONO : undefined }} />
        </Field>
        {bizNo && (
          <Field label="상호">
            <input value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="사업자등록증의 상호" className={inputCls} />
          </Field>
        )}
        <Field label="사업자등록증 사진">
          {bizImg ? (
            <div className="relative rounded-2xl overflow-hidden border border-[#DCE3EE]">
              <img src={bizImg} alt="사업자등록증" className="w-full max-h-44 object-contain bg-[#F3F6FA]" />
              <button type="button" onClick={() => setBizImg("")} className="absolute top-2 right-2 h-9 px-3 rounded-lg bg-[#0B1428]/80 text-white text-[13px] font-bold">다시 찍기</button>
            </div>
          ) : (
            <button type="button" onClick={() => bizFileRef.current?.click()} className="w-full h-24 rounded-2xl border-2 border-dashed border-[#C9D2E0] text-[#5B6B85] text-[15px] font-bold active:bg-[#F5F8FD]">+ 촬영 또는 사진 선택</button>
          )}
          <input ref={bizFileRef} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setBizImg(await compressImage(f, 1400, 0.8).catch(() => "")); }} />
        </Field>
      </Fold>
      <Fold title="입사일 · 요청사항" summary={[hireDate, requestNote.trim()].filter(Boolean).join(" · ")} open={fold === "etc"} onToggle={() => toggleFold("etc")}>
        <Field label="입사일" hint="입사일을 입력하면 연차/월차가 자동으로 설정됩니다.">
          <CustomDatePicker value={hireDate} onChange={(e) => setHireDate(e.target.value)} placeholder="입사일 선택" showIcon className={inputCls} />
        </Field>
        <Field label="요청사항">
          <textarea value={requestNote} onChange={(e) => setRequestNote(e.target.value)} rows={2} placeholder="관리자에게 전달할 내용이 있으면 입력하세요"
            className="w-full border-2 border-[#DCE3EE] rounded-2xl px-4 py-3 text-[16px] font-semibold text-[#0F1A30] placeholder:text-[#9AA7BD] focus:outline-none focus:border-[#2D4C82] focus:ring-4 focus:ring-[#2D4C82]/10 transition resize-none" />
        </Field>
      </Fold>
    </div>
  );

  let body = null;
  if (success) body = (
    <div className="pt-6 text-center">
      <div className="mx-auto w-20 h-20 rounded-full grid place-items-center text-[36px] font-black text-white" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>✓</div>
      {success === "linked" ? (
        <>
          <h2 className="mt-5 text-[22px] font-black text-[#0F1A30]">등록된 기사 정보와 연결되었습니다</h2>
          <p className="mt-2 text-[15.5px] font-bold text-[#5B6B85] leading-relaxed">승인 없이 바로 사용할 수 있습니다.<br />로그인 화면에서 <span className="text-[#1B2B4B]">로그인</span>만 눌러주세요.</p>
        </>
      ) : (
        <>
          <h2 className="mt-5 text-[22px] font-black text-[#0F1A30]">등록 신청 완료</h2>
          <p className="mt-2 text-[15.5px] font-bold text-[#5B6B85] leading-relaxed">관리자 승인 대기 중입니다.<br />승인 후 로그인이 가능합니다.</p>
        </>
      )}
      <button type="button" onClick={() => navigate("/driver-login")} className="mt-6 w-full h-14 rounded-2xl text-white font-black text-[17px]" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>로그인 화면으로</button>
    </div>
  );
  else if (S.key === "basic") body = (
    <div className="space-y-5">
      <Field label="소속 운송사" req hint="일하시는 운송사 이름을 검색해서 고르세요.">
        <div className="relative">
          <input value={companyName} autoFocus
            onChange={(e) => { setCompanyName(e.target.value); setCoOpen(true); }}
            onFocus={() => setCoOpen(true)} onBlur={() => setTimeout(() => setCoOpen(false), 150)} onKeyDown={onEnter}
            placeholder="운송사명 검색" className={inputCls} />
          {coOpen && coMatches.length > 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1.5 bg-white border border-[#DCE3EE] rounded-2xl shadow-[0_18px_40px_rgba(15,26,48,.18)] overflow-hidden max-h-[260px] overflow-y-auto">
              {coMatches.map((c) => (
                <button key={c.companyName} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setCompanyName(c.companyName); setCoOpen(false); }}
                  className="w-full text-left px-4 py-3.5 active:bg-[#EEF3FC] hover:bg-[#EEF3FC] border-b border-[#EEF1F6] last:border-0">
                  <div className="text-[16px] font-black text-[#0F1A30]">{c.companyName}</div>
                  {c.address && <div className="text-[12.5px] text-[#7A89A3] truncate">{c.address}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>
      <Field label="차량번호" req hint="띄어쓰기 없이 저장되며, 로그인할 때도 차량번호를 씁니다.">
        <input value={carNo} onChange={(e) => setCarNo(plateOf(e.target.value))} onKeyDown={onEnter} placeholder="예: 경기97가1234" className={inputCls} />
      </Field>
      <Field label="이름" req>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onEnter} placeholder="실명 입력" className={inputCls} />
      </Field>
      <Field label="휴대폰번호" req>
        <input value={phone} type="tel" inputMode="numeric" onChange={(e) => setPhone(fmtPhone(e.target.value))} onKeyDown={onEnter} placeholder="010-0000-0000" className={`${inputCls} tabular-nums tracking-wide`} />
      </Field>

      <div className="pt-1">
        <button type="button" onClick={() => setMoreOpen((v) => !v)}
          className={`w-full flex items-center gap-3 px-4 h-16 rounded-2xl border-2 text-left ${moreOpen ? "border-[#2D4C82]/50 bg-[#F5F8FD]" : "border-dashed border-[#C9D2E0] bg-white"}`}>
          <span className="flex-1 min-w-0">
            <span className="block text-[16px] font-black text-[#1B2B4B]">추가 정보(선택){moreCount ? <span className="ml-1.5 text-[#2D4C82]">{moreCount}개 입력</span> : null}</span>
            <span className="block text-[12.5px] font-bold text-[#7A89A3] truncate">차종·톤수, 거주지, 계좌, 사업자 — 나중에 내 정보에서 입력해도 됩니다</span>
          </span>
          <span className="text-[13px] font-black text-[#7A89A3] shrink-0">{moreOpen ? "접기 ▲" : "열기 ▼"}</span>
        </button>
        {moreOpen && <div className="mt-2.5">{moreBody}</div>}
      </div>
    </div>
  );
  else if (S.key === "terms") {
    const rows = [
      ["소속", [companyName, carNo]],
      ["기사", [name, phone]],
      ["차량", [[category, tonnage].filter(Boolean).join(" "), residence]],
      ["정산", [bank.acct ? `${bank.bank} ${formatAccount(bank.bank, bank.acct)}` : "", bank.acct ? bank.holder : ""]],
    ];
    body = (
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#DCE3EE] divide-y divide-[#EEF1F6] overflow-hidden">
          {rows.map(([k, v]) => (
            <button key={k} type="button" onClick={() => go(0)} className="w-full flex items-center gap-3 px-4 h-12 text-left active:bg-[#F5F8FD]">
              <span className="w-10 shrink-0 text-[12px] font-extrabold tracking-wider text-[#7A89A3]">{k}</span>
              <span className="flex-1 min-w-0 text-[15px] font-black text-[#0F1A30] truncate tabular-nums">{v.filter(Boolean).join(" · ") || <span className="text-[#9AA7BD] font-bold">나중에 입력</span>}</span>
              <span className="text-[12px] font-bold text-[#9AA7BD]">수정</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setAll(!allAgreed)}
          className={`w-full flex items-center gap-3 px-4 h-16 rounded-2xl text-left ${allAgreed ? "text-white" : "bg-[#F3F6FA] text-[#0F1A30] border-2 border-[#C9D2E0]"}`}
          style={allAgreed ? { background: "linear-gradient(120deg,#0F1A30,#2D4C82)" } : undefined}>
          <span className={`w-8 h-8 rounded-full grid place-items-center text-[16px] font-black ${allAgreed ? "bg-white text-[#1B2B4B]" : "border-2 border-[#C9D2E0] text-transparent"}`}>✓</span>
          <span className="text-[17px] font-black">약관 전체 동의</span>
        </button>
        <div className="space-y-2">
          <TermRow title="서비스 이용약관" text={DRIVER_TERMS} checked={termsAgreed} onChange={setTermsAgreed} />
          <TermRow title="개인정보처리방침" text={DRIVER_PRIVACY} checked={privacyAgreed} onChange={setPrivacyAgreed} />
          <TermRow title="위치정보 수집 동의" text={DRIVER_GPS} checked={gpsAgreed} onChange={setGpsAgreed} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden" style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/26px 26px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/26px 26px, linear-gradient(135deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
      <div className="w-full max-w-[520px] mx-auto flex-1 min-h-0 flex flex-col lg:py-8">
        {/* 상단 — 단계 표시 */}
        <div className="px-4 pb-4 text-white" style={{ paddingTop: "max(env(safe-area-inset-top), 14px)" }}>
          <div className="flex items-center justify-between">
            <div className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0]">DRIVER · SIGN UP</div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-white/70 tabular-nums" style={{ fontFamily: MONO }}>
                <span className="text-white">{step + 1}</span> / {STEPS.length}
              </span>
              <LogisMark size={28} />
            </div>
          </div>
          <div className="mt-2 text-[10px] font-extrabold tracking-[0.22em] text-white/45" style={{ fontFamily: MONO }}>{S.en}</div>
          <h1 className="text-[24px] font-black tracking-tight leading-tight">{S.title}</h1>
          <p className="text-[14px] text-white/70 mt-0.5">{S.desc}</p>
          <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0,1fr))` }}>
            {STEPS.map((s, i) => (
              <button key={s.key} type="button" aria-label={s.title} onClick={() => i < step && go(i)}
                className={`h-1.5 rounded-full transition-colors duration-300 ${i < step ? "bg-[#8FB0F0]" : i === step ? "bg-white" : "bg-white/15"}`} />
            ))}
          </div>
        </div>

        {/* 입력 */}
        <div className="flex-1 min-h-0 bg-white rounded-t-[28px] lg:rounded-[28px] shadow-2xl flex flex-col overflow-hidden">
          <div key={`${step}-${success}`} className="flex-1 min-h-0 overflow-y-auto px-4 pt-5 pb-4 kp-step-in">
            {body}
          </div>

          {/* 하단 — 이전 / 다음 */}
          {!success && (
            <div className="px-4 pt-2.5 border-t border-[#EEF1F6] bg-white" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
              {error && <div className="mb-2.5 bg-[#0F1A30] text-white text-[14.5px] font-bold px-4 py-3 rounded-xl">{error}</div>}
              <div className="flex gap-2">
                <button type="button" onClick={prev} disabled={loading}
                  className="h-14 w-[30%] rounded-2xl border-2 border-[#DCE3EE] bg-white text-[#3A4A66] font-black text-[16px] active:bg-[#F3F6FA] disabled:opacity-50">
                  {step === 0 ? "로그인" : "이전"}
                </button>
                <button type="button" onClick={next} disabled={loading}
                  className="h-14 flex-1 rounded-2xl text-white font-black text-[17px] transition disabled:opacity-60 shadow-[0_12px_26px_rgba(15,26,48,0.28)]" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>
                  {loading ? "등록 중..." : last ? "등록하기" : "다음"}
                </button>
              </div>
              {step === 0 && !window.Capacitor?.isNativePlatform?.() && (
                <div className="mt-2.5 text-center"><Link to="/login" className="text-[12.5px] text-[#7A89A3] hover:underline">다른 유형으로 로그인</Link></div>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes kpStepIn{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}.kp-step-in{animation:kpStepIn .22s ease-out}`}</style>
    </div>
  );
}
