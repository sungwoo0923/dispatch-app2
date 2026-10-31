// src/driver/DriverRegister.jsx
import { coDocKey } from "../coKey";
import React, { useState, useEffect, useRef } from "react";
import { readPublicCompanies } from "../publicCompanies";
import CustomDatePicker from "../CustomDatePicker";
import { auth, db } from "../firebase";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { addDoc, collection } from "firebase/firestore";
import { BANK_NAMES, accountLengths, formatAccount, validateAccount, onlyDigits } from "../bankUtil";
import { compressImage } from "../InternalMail";

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
- 필수: 이름, 차량번호
- 선택: 연락처, 차종

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

// ⭐ 사용자 요청(2026-10-30) — 한 화면에 길게 늘어선 입력칸을 스크롤로 내리며 채우던 가입을,
// 단계별로 한 화면씩 [이전]/[다음]으로 넘기며 입력·선택하게 바꿨다. 드롭다운 대신 큰 선택 버튼
// (기사님이 휴대폰에서 바로 누를 수 있게), 단계마다 입력값을 확인하고 다음으로 넘어간다.
const STEPS = [
  { key: "account", en: "ACCOUNT", title: "소속 운송사 · 차량번호", desc: "차량번호가 로그인 아이디·비밀번호가 됩니다" },
  { key: "profile", en: "PROFILE", title: "기사님 정보", desc: "본인 확인과 배차 연락에 쓰입니다" },
  { key: "vehicle", en: "VEHICLE", title: "차량 정보", desc: "차량 종류와 톤수를 골라주세요" },
  { key: "residence", en: "RESIDENCE", title: "거주지", desc: "가까운 배차를 위해 사용됩니다" },
  { key: "bank", en: "SETTLEMENT", title: "정산 받을 계좌", desc: "지입·용차 운임 지급용 · 가입 후 내 정보에서 수정 가능" },
  { key: "biz", en: "BUSINESS", title: "사업자 정보", desc: "세금계산서 발행용 · 없으면 건너뛰세요" },
  { key: "terms", en: "AGREEMENT", title: "약관 동의 · 확인", desc: "입력 내용을 확인하고 등록을 신청하세요" },
];

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const inputCls = "w-full h-12 border border-[#DCE3EE] rounded-xl px-3.5 text-[15px] font-bold text-[#0F1A30] bg-white placeholder:text-[#9AA7BD] placeholder:font-semibold focus:outline-none focus:border-[#2D4C82] focus:ring-4 focus:ring-[#2D4C82]/10 transition";

function Field({ label, req, hint, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-[13px] font-black text-[#3A4A66]">{label}{req && <span className="text-[#2D4C82] ml-0.5">*</span>}</label>
        {!req && <span className="text-[11px] font-bold text-[#9AA7BD]">선택</span>}
      </div>
      {children}
      {hint && <p className="text-[11.5px] text-[#7A89A3] mt-1.5">{hint}</p>}
    </div>
  );
}

// 큰 선택 버튼 묶음 — 드롭다운 대신 한 번에 보이고 바로 누른다
function Chips({ options, value, onPick, cols = 3, size = "md", label = (o) => o }) {
  const h = size === "xs" ? "h-8 text-[12.5px]" : size === "sm" ? "h-9 text-[13px]" : "h-11 text-[14px]";
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <button key={o} type="button" onClick={() => onPick(o)}
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

function TermRow({ title, text, checked, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-2xl border ${checked ? "border-[#2D4C82]/40 bg-[#F5F8FD]" : "border-[#DCE3EE] bg-white"}`}>
      <div className="flex items-center gap-3 px-3.5 h-12">
        <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <span className={`w-6 h-6 shrink-0 rounded-full grid place-items-center text-[13px] font-black ${checked ? "bg-[#1B2B4B] text-white" : "border-2 border-[#C9D2E0] text-transparent"}`}>✓</span>
          <span className="text-[14px] font-bold text-[#0F1A30] truncate">{title} <span className="text-[#2D4C82] text-[12px]">(필수)</span></span>
        </button>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-[12px] font-bold text-[#7A89A3] px-2 h-8 shrink-0">{open ? "닫기" : "보기"}</button>
      </div>
      {open && (
        <div className="mx-3.5 mb-3 px-3 py-2.5 max-h-36 overflow-y-auto rounded-xl bg-white border border-[#EEF1F6] text-[12px] text-[#5B6B85] leading-relaxed whitespace-pre-wrap">{text}</div>
      )}
    </div>
  );
}

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
  // 💳 정산 정보(지입·용차 기사 지급용) — 계좌는 지입이면 사실상 필수, 사업자 정보는 선택
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
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const makeEmail = (v) => `${v.replace(/ /g, "")}@driver.run25.kr`;

  const formatPhone = (val) => {
    const v = val.replace(/[^0-9]/g, "");
    if (v.length <= 3) return v;
    if (v.length <= 7) return `${v.slice(0, 3)}-${v.slice(3)}`;
    return `${v.slice(0, 3)}-${v.slice(3, 7)}-${v.slice(7, 11)}`;
  };

  const register = async () => {
    setError("");
    if (!companyName.trim()) return setError("소속 회사명을 입력해주세요.");
    if (!carNo.trim()) return setError("차량번호를 입력해주세요.");
    if (!name.trim()) return setError("이름을 입력해주세요.");
    if (!phone.trim()) return setError("핸드폰번호를 입력해주세요.");
    if (!vehicleCategory) return setError("차량 종류를 선택해주세요.");
    if (vehicleCategory === "직접입력" && !vehicleCategoryCustom.trim()) return setError("차량 종류를 입력해주세요.");
    if (!tonnage) return setError("톤수를 선택해주세요.");
    if (!residenceProvince) return setError("거주지를 선택해주세요.");
    if (RESIDENCE_SUB_REGIONS[residenceProvince] && !residenceCity) return setError("거주 지역(시/군)을 선택해주세요.");
    if (bank.acct || bank.holder) {
      const v = validateAccount(bank.bank, bank.acct, bank.holder);
      if (!v.ok) return setError(`정산 계좌: ${v.msg}`);
    }
    if (bizNo && onlyDigits(bizNo).length !== 10) return setError("사업자등록번호는 10자리입니다.");
    if (!termsAgreed || !privacyAgreed || !gpsAgreed) return setError("모든 약관에 동의해주세요.");

    const email = makeEmail(carNo.trim());
    const password = carNo.trim();
    const category = vehicleCategory === "직접입력" ? vehicleCategoryCustom.trim() : vehicleCategory;
    const residence = residenceCity ? `${residenceProvince} ${residenceCity}` : residenceProvince;
    // vehicleType은 기존 화면들이 "카고 3.5톤" 식 한 줄 문자열로 읽던 필드라
    // 하위호환을 위해 그대로 조합해 함께 저장하고, 차량종류/차량톤수는 구조화된
    // 값으로 따로 저장해 PC 기사관리·지입차관리에서 그대로 쓸 수 있게 한다.
    const vehicleType = `${category} ${tonnage}`;

    // ⭐ 사용자 요청 — 관리자가 PC 기사관리에서 지입차를 미리 등록해두면(차량번호로
    // 문서가 만들어짐, Firebase 인증 계정은 아직 없음) 그 차주가 나중에 실제로
    // 기사앱에 가입하려 해도 로그인이 안 됐다(인증 계정 자체가 없으므로). 가입
    // 시점에 같은 차량번호의 "인증 계정 없는" 선등록 문서가 있는지 먼저 확인해서,
    // 차량번호·이름·회사명이 모두 같으면 그 문서에 이미 들어있는 등급/거주지/
    // 담당자 등 관리자가 미리 설정해둔 값을 그대로 이어받는다(겹치는 값은 가입
    // 입력값이 아니라 관리자가 지정한 값을 우선 — 등급/담당자/근무요일처럼 운영
    // 판단이 들어간 값은 기사 본인이 덮어쓰면 안 되므로).
    // ⭐ 버그수정 — drivers 컬렉션은 보안규칙상 로그인한 사용자만 읽을 수 있는데,
    // 이 조회를 계정 생성보다 먼저 하면 아직 비로그인 상태라 매번 permission-denied로
    // 막혀서(조용히 catch(_)에 먹혀) 선등록 데이터가 절대 이어받아지지 않았다.
    // 계정을 먼저 만들어 로그인 상태를 확보한 뒤 조회하고, 이름·회사명이 다르면
    // 방금 만든 계정을 그 자리에서 삭제해 원상복구한다.
    const normPlate = carNo.trim().replace(/\s+/g, "").toUpperCase();
    const payInfo = {
      정산계좌: bank.acct ? { bank: bank.bank, acct: onlyDigits(bank.acct), holder: bank.holder.trim() } : null,
      사업자번호: onlyDigits(bizNo) || "",
      사업자상호: bizName.trim(),
    };

    try {
      setLoading(true);
      const res = await createUserWithEmailAndPassword(auth, email, password);
      const uid = res.user.uid;

      let preRegistered = null;
      // ⭐ 2026-11-01 PC 선등록 문서 — 회사별 이름(회사__차량번호) 먼저, 없으면 예전 이름(차량번호)
        const preKey = coDocKey(companyName.trim(), normPlate);
        let preSnap = await getDoc(doc(db, "drivers", preKey));
        if (!preSnap.exists() && preKey !== normPlate) preSnap = await getDoc(doc(db, "drivers", normPlate));
        const preId = preSnap.exists() ? preSnap.id : normPlate;
      if (preSnap.exists()) {
        const d = preSnap.data();
        const sameName = (d.이름 || d.name || "").trim() === name.trim();
        const sameCompany = (d.companyName || "").trim() === companyName.trim();
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
        carNo: carNo.trim(),
        phone: phone.trim(),
        vehicleType,
        차량종류: category,
        차량톤수: tonnage,
        거주지: residence,
        요청사항: requestNote.trim(),
        companyName: companyName.trim(),
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

      // ⭐ 버그수정 — PC 기사관리 화면은 drivers/{id} 문서를 이름/차량번호/전화번호(한글
      // 필드)로 읽는데, 여기선 영문 필드(name/carNo/phone)만 써서 가입 직후 PC 기사관리
      // 목록에서 해당 기사 줄이 전부 "-"로 보였다(모바일 DriverHome은 반대로 영문 필드를
      // 읽으므로 영문도 그대로 유지) — 양쪽 다 쓴다.
      await setDoc(doc(db, "drivers", uid), {
        uid,
        name: name.trim(),
        carNo: carNo.trim(),
        phone: phone.trim(),
        이름: name.trim(),
        차량번호: carNo.trim(),
        전화번호: phone.trim(),
        vehicleType,
        차량종류: category,
        차량톤수: tonnage,
        거주지: residence,
        요청사항: requestNote.trim(),
        companyName: companyName.trim(),
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
        await addDoc(collection(db, "driver_documents"), {
          driverId: uid, companyName: companyName.trim(), docType: "사업자등록증", fileName: "사업자등록증.jpg", fileType: "image/jpeg", dataUrl: bizImg,
          uploadedAt: { seconds: Math.floor(Date.now() / 1000) }, by: "기사 가입",
        }).catch(() => {});
      }

      await signOut(auth);
      setSuccess(true);
      setTimeout(() => navigate("/driver-login"), 2500);
    } catch (err) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        setError("이미 등록된 차량번호입니다.");
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

  // 단계별 확인 — 통과하면 "", 아니면 안내 문구
  const checkStep = (i) => {
    const k = STEPS[i].key;
    if (k === "account") {
      if (!companyName.trim()) return "소속 회사명을 입력해주세요.";
      if (!carNo.trim()) return "차량번호를 입력해주세요.";
    }
    if (k === "profile") {
      if (!name.trim()) return "이름을 입력해주세요.";
      if (!phone.trim()) return "핸드폰번호를 입력해주세요.";
      if (onlyDigits(phone).length < 10) return "핸드폰번호를 끝까지 입력해주세요.";
    }
    if (k === "vehicle") {
      if (!vehicleCategory) return "차량 종류를 선택해주세요.";
      if (vehicleCategory === "직접입력" && !vehicleCategoryCustom.trim()) return "차량 종류를 입력해주세요.";
      if (!tonnage) return "톤수를 선택해주세요.";
    }
    if (k === "residence") {
      if (!residenceProvince) return "거주지를 선택해주세요.";
      if (RESIDENCE_SUB_REGIONS[residenceProvince] && !residenceCity) return "거주 지역(시/군)을 선택해주세요.";
    }
    if (k === "bank" && (bank.acct || bank.holder)) { // 은행만 고르고 넘기면 계좌 없이 가입
      const v = validateAccount(bank.bank, bank.acct, bank.holder);
      if (!v.ok) return `정산 계좌: ${v.msg}`;
    }
    if (k === "biz" && bizNo && onlyDigits(bizNo).length !== 10) return "사업자등록번호는 10자리입니다.";
    if (k === "terms" && (!termsAgreed || !privacyAgreed || !gpsAgreed)) return "모든 약관에 동의해주세요.";
    return "";
  };
  const go = (i) => { setError(""); setStep(Math.max(0, Math.min(STEPS.length - 1, i))); };
  const next = () => {
    const msg = checkStep(step);
    if (msg) return setError(msg);
    if (step < STEPS.length - 1) return go(step + 1);
    // 마지막 — 앞 단계에 빠진 값이 있으면 그 단계로 보낸다
    const bad = STEPS.findIndex((_, i) => checkStep(i));
    if (bad !== -1) { go(bad); setError(checkStep(bad)); return; }
    register();
  };
  const prev = () => (step === 0 ? navigate("/driver-login") : go(step - 1));
  const onEnter = (e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); next(); } };

  const [bankOpen, setBankOpen] = useState(true);
  const category = vehicleCategory === "직접입력" ? vehicleCategoryCustom.trim() : vehicleCategory;
  const S = STEPS[step];
  const last = step === STEPS.length - 1;
  const allAgreed = termsAgreed && privacyAgreed && gpsAgreed;
  const setAll = (v) => { setTermsAgreed(v); setPrivacyAgreed(v); setGpsAgreed(v); };

  let body = null;
  if (S.key === "account") body = (
    <div className="space-y-4">
      <Field label="소속 운송사" req hint="목록에서 고르면 정확히 연결됩니다.">
        <div className="relative">
          <input value={companyName} autoFocus
            onChange={(e) => { setCompanyName(e.target.value); setCoOpen(true); }}
            onFocus={() => setCoOpen(true)} onBlur={() => setTimeout(() => setCoOpen(false), 150)} onKeyDown={onEnter}
            placeholder="운송사명 검색" className={inputCls} />
          {coOpen && coMatches.length > 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1.5 bg-white border border-[#DCE3EE] rounded-2xl shadow-[0_18px_40px_rgba(15,26,48,.18)] overflow-hidden max-h-[260px] overflow-y-auto">
              {coMatches.map((c) => (
                <button key={c.companyName} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setCompanyName(c.companyName); setCoOpen(false); }}
                  className="w-full text-left px-4 py-3 active:bg-[#EEF3FC] hover:bg-[#EEF3FC] border-b border-[#EEF1F6] last:border-0">
                  <div className="text-[15px] font-black text-[#0F1A30]">{c.companyName}</div>
                  {c.address && <div className="text-[12px] text-[#7A89A3] truncate">{c.address}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>
      <Field label="차량번호" req hint="차량번호가 로그인 ID 및 비밀번호로 사용됩니다.">
        <input value={carNo} onChange={(e) => setCarNo(e.target.value)} onKeyDown={onEnter} placeholder="예: 경기97가1234" className={inputCls} />
      </Field>
    </div>
  );
  else if (S.key === "profile") body = (
    <div className="space-y-4">
      <Field label="이름" req>
        <input value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={onEnter} placeholder="실명 입력" className={inputCls} />
      </Field>
      <Field label="핸드폰번호" req>
        <input value={phone} inputMode="numeric" onChange={(e) => setPhone(formatPhone(e.target.value))} onKeyDown={onEnter} placeholder="010-0000-0000" className={`${inputCls} tabular-nums tracking-wide`} />
      </Field>
      <Field label="입사일" hint="입사일을 입력하면 연차/월차가 자동으로 설정됩니다.">
        <CustomDatePicker value={hireDate} onChange={(e) => setHireDate(e.target.value)} placeholder="입사일 선택" showIcon className={inputCls} />
      </Field>
      <Field label="요청사항">
        <textarea value={requestNote} onChange={(e) => setRequestNote(e.target.value)} rows={2} placeholder="관리자에게 전달할 내용이 있으면 입력하세요"
          className="w-full border border-[#DCE3EE] rounded-2xl px-4 py-3 text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#9AA7BD] focus:outline-none focus:border-[#2D4C82] focus:ring-4 focus:ring-[#2D4C82]/10 transition resize-none" />
      </Field>
    </div>
  );
  else if (S.key === "vehicle") body = (
    <div className="space-y-4">
      <Field label="차량 종류" req>
        <Chips options={VEHICLE_CATEGORIES} value={vehicleCategory} onPick={setVehicleCategory} cols={3} />
        {vehicleCategory === "직접입력" && (
          <input value={vehicleCategoryCustom} autoFocus onChange={(e) => setVehicleCategoryCustom(e.target.value)} onKeyDown={onEnter} placeholder="예: 리프트탑" className={`${inputCls} mt-2`} />
        )}
      </Field>
      <Field label="톤수" req>
        <Chips options={TON_OPTIONS} value={tonnage} onPick={setTonnage} cols={4} size="sm" />
      </Field>
    </div>
  );
  else if (S.key === "residence") body = (
    <div className="space-y-4">
      <Field label="시 / 도" req>
        <Chips options={RESIDENCE_PROVINCES} value={residenceProvince} onPick={(v) => { setResidenceProvince(v); setResidenceCity(""); }} cols={6} size="xs" />
      </Field>
      {RESIDENCE_SUB_REGIONS[residenceProvince] && (
        <Field label={`${residenceProvince} 시 / 군`} req>
          <Chips options={RESIDENCE_SUB_REGIONS[residenceProvince]} value={residenceCity} onPick={setResidenceCity} cols={6} size="xs" />
        </Field>
      )}
    </div>
  );
  else if (S.key === "bank") body = (
    <div className="space-y-4">
      <Field label="은행" req={false}>
        {bank.bank && !bankOpen ? (
          <div className="flex items-center gap-3 h-12 px-3.5 rounded-xl border border-[#2D4C82]/40 bg-[#F5F8FD]">
            <span className="w-8 h-8 rounded-xl bg-[#1B2B4B] text-white grid place-items-center text-[12px] font-black">{bank.bank.slice(0, 1)}</span>
            <span className="flex-1 text-[16px] font-black text-[#0F1A30] truncate">{bank.bank}</span>
            <button type="button" onClick={() => setBankOpen(true)} className="h-8 px-3 rounded-lg border border-[#C9D6EE] bg-white text-[12.5px] font-black text-[#1B2B4B]">변경</button>
          </div>
        ) : (
          <Chips options={BANK_NAMES} value={bank.bank} onPick={(b) => { pickBank(b); setBankOpen(false); }} cols={4} size="sm" label={(b) => b.replace(/\(.*\)/, "")} />
        )}
      </Field>
      {(!bankOpen || !!bank.bank) && <>
        <Field label="계좌번호" req={false}>
          <div className="relative">
            <input ref={acctRef} inputMode="numeric" value={formatAccount(bank.bank, bank.acct)} disabled={!bank.bank}
              onChange={(e) => { setBankReset(false); setBank((v) => ({ ...v, acct: onlyDigits(e.target.value).slice(0, 16) })); }} onKeyDown={onEnter}
              placeholder={bank.bank ? "숫자만 입력하면 하이픈 자동" : "은행을 먼저 고르세요"}
              className={`${inputCls} pr-24 tabular-nums tracking-wider disabled:bg-[#F3F6FA]`} style={{ fontFamily: acctDigits ? MONO : undefined }} />
            <span className={`absolute right-3 top-1/2 -translate-y-1/2 px-2 h-7 rounded-lg grid place-items-center text-[12px] font-black tabular-nums ${acctLens.includes(acctDigits.length) ? "bg-[#1B2B4B] text-white" : "bg-[#EEF2F8] text-[#5B6B85]"}`} style={{ fontFamily: MONO }}>
              {acctDigits.length}{acctLens.length ? `/${acctLens.find((l) => l >= acctDigits.length) || acctLens[acctLens.length - 1]}` : ""}자리
            </span>
          </div>
          <div className="mt-1.5 min-h-[18px] text-[12px] font-bold">
            {bankReset ? <span className="text-[#2D4C82]">! 은행이 바뀌어 계좌번호를 초기화했습니다 — 다시 입력해 주세요</span>
              : acctCheck && acctDigits ? <span className={acctCheck.level === "ok" ? "text-[#1B2B4B]" : acctCheck.level === "warn" ? "text-[#2D4C82]" : "text-[#7A89A3]"}>{acctCheck.level === "ok" ? "✓ " : "! "}{acctCheck.msg}</span>
              : bank.bank && acctLens.length ? <span className="text-[#7A89A3]">{bank.bank} 계좌는 보통 {acctLens.join("·")}자리입니다</span> : null}
          </div>
        </Field>
        <Field label="예금주" req={false}>
          <input value={bank.holder} onChange={(e) => setBank((v) => ({ ...v, holder: e.target.value }))} onKeyDown={onEnter} placeholder={name ? `예: ${name}` : "예금주"} className={inputCls} />
        </Field>
      </>}
      {!bank.bank && <p className="text-[12px] text-[#7A89A3]">지금 입력하지 않아도 가입 후 내 정보에서 등록할 수 있습니다.</p>}
    </div>
  );
  else if (S.key === "biz") body = (
    <div className="space-y-4">
      <Field label="사업자등록번호">
        <input inputMode="numeric" value={bizNo} onKeyDown={onEnter} onChange={(e) => { const d = onlyDigits(e.target.value).slice(0, 10); setBizNo(d.length > 5 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d); }}
          placeholder="000-00-00000" className={`${inputCls} tabular-nums tracking-wider`} style={{ fontFamily: bizNo ? MONO : undefined }} />
      </Field>
      {bizNo && (
        <Field label="상호">
          <input value={bizName} onChange={(e) => setBizName(e.target.value)} onKeyDown={onEnter} placeholder="사업자등록증의 상호" className={inputCls} />
        </Field>
      )}
      <Field label="사업자등록증 사진">
        {bizImg ? (
          <div className="relative rounded-2xl overflow-hidden border border-[#DCE3EE]">
            <img src={bizImg} alt="사업자등록증" className="w-full max-h-44 object-contain bg-[#F3F6FA]" />
            <button type="button" onClick={() => setBizImg("")} className="absolute top-2 right-2 h-8 px-3 rounded-lg bg-[#0B1428]/80 text-white text-[12px] font-bold">다시 찍기</button>
          </div>
        ) : (
          <button type="button" onClick={() => bizFileRef.current?.click()} className="w-full h-24 rounded-2xl border-2 border-dashed border-[#C9D2E0] text-[#5B6B85] text-[14px] font-bold active:bg-[#F5F8FD]">+ 촬영 또는 사진 선택</button>
        )}
        <input ref={bizFileRef} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setBizImg(await compressImage(f, 1400, 0.8).catch(() => "")); }} />
      </Field>
    </div>
  );
  else if (S.key === "terms") {
    const rows = [
      ["소속", [companyName, carNo], 0],
      ["기사", [name, phone], 1],
      ["차량", [category && tonnage ? `${category} ${tonnage}` : "", residenceCity ? `${residenceProvince} ${residenceCity}` : residenceProvince], 2],
      ["정산", [bank.acct ? `${bank.bank} ${formatAccount(bank.bank, bank.acct)}` : "계좌 미입력", bank.acct ? bank.holder : ""], 4],
    ];
    body = (
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#DCE3EE] divide-y divide-[#EEF1F6] overflow-hidden">
          {rows.map(([k, v, i]) => (
            <button key={k} type="button" onClick={() => go(i)} className="w-full flex items-center gap-3 px-4 h-10 text-left active:bg-[#F5F8FD]">
              <span className="w-9 shrink-0 text-[11px] font-extrabold tracking-wider text-[#7A89A3]">{k}</span>
              <span className="flex-1 min-w-0 text-[13.5px] font-black text-[#0F1A30] truncate tabular-nums">{v.filter(Boolean).join(" · ") || "-"}</span>
              <span className="text-[11px] font-bold text-[#9AA7BD]">수정</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setAll(!allAgreed)}
          className={`w-full flex items-center gap-3 px-4 h-[52px] rounded-2xl text-left ${allAgreed ? "text-white" : "bg-[#F3F6FA] text-[#0F1A30]"}`}
          style={allAgreed ? { background: "linear-gradient(120deg,#0F1A30,#2D4C82)" } : undefined}>
          <span className={`w-6 h-6 rounded-full grid place-items-center text-[13px] font-black ${allAgreed ? "bg-white text-[#1B2B4B]" : "border-2 border-[#C9D2E0] text-transparent"}`}>✓</span>
          <span className="text-[15px] font-black">약관 전체 동의</span>
        </button>
        <div className="space-y-2">
          <TermRow title="서비스 이용약관" text={DRIVER_TERMS} checked={termsAgreed} onChange={setTermsAgreed} />
          <TermRow title="개인정보처리방침" text={DRIVER_PRIVACY} checked={privacyAgreed} onChange={setPrivacyAgreed} />
          <TermRow title="위치정보 수집 동의" text={DRIVER_GPS} checked={gpsAgreed} onChange={setGpsAgreed} />
        </div>
      </div>
    );
  }

  const optional = S.key === "bank" || S.key === "biz";
  const empty = (S.key === "bank" && !bank.acct && !bank.holder) || (S.key === "biz" && !bizNo && !bizImg);

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden" style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/26px 26px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/26px 26px, linear-gradient(135deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
      <div className="w-full max-w-[520px] mx-auto flex-1 min-h-0 flex flex-col lg:py-8">
        {/* 상단 — 단계 표시 */}
        <div className="px-4 pb-4 text-white" style={{ paddingTop: "max(env(safe-area-inset-top), 14px)" }}>
          <div className="flex items-center justify-between">
            <div className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0]">DRIVER · SIGN UP</div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-white/70 tabular-nums" style={{ fontFamily: MONO }}>
                <span className="text-white">{String(step + 1).padStart(2, "0")}</span> / {String(STEPS.length).padStart(2, "0")}
              </span>
              <img src="/icons/sflow-icon.png" alt="" className="w-7 h-7 rounded-lg" />
            </div>
          </div>
          <div className="mt-2 text-[10px] font-extrabold tracking-[0.22em] text-white/45" style={{ fontFamily: MONO }}>{S.en}</div>
          <h1 className="text-[21px] font-black tracking-tight leading-tight">{S.title}</h1>
          <p className="text-[12.5px] text-white/60 mt-0.5">{S.desc}</p>
          <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0,1fr))` }}>
            {STEPS.map((s, i) => (
              <button key={s.key} type="button" aria-label={s.title} onClick={() => i < step && go(i)}
                className={`h-1.5 rounded-full transition-colors duration-300 ${i < step ? "bg-[#8FB0F0]" : i === step ? "bg-white" : "bg-white/15"}`} />
            ))}
          </div>
        </div>

        {/* 입력 — 한 화면에 한 단계 */}
        <div className="flex-1 min-h-0 bg-white rounded-t-[28px] lg:rounded-[28px] shadow-2xl flex flex-col overflow-hidden">
          <div key={step} className="flex-1 min-h-0 overflow-y-auto px-4 pt-5 pb-4 kp-step-in">
            {body}
            {success && (
              <div className="mt-4 bg-[#EEF3FC] border border-[#C9D6EE] text-[#0F1A30] text-[14px] px-4 py-3 rounded-2xl font-bold">
                등록 완료! 관리자 승인 후 로그인이 가능합니다.
              </div>
            )}
          </div>

          {/* 하단 — 이전 / 다음 */}
          <div className="px-4 pt-2.5 border-t border-[#EEF1F6] bg-white" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
            {error && <div className="mb-2.5 bg-[#0F1A30] text-white text-[13px] font-bold px-4 py-2.5 rounded-xl">{error}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={prev} disabled={loading}
                className="h-12 w-[32%] rounded-xl border border-[#DCE3EE] bg-white text-[#3A4A66] font-black text-[15px] active:bg-[#F3F6FA] disabled:opacity-50">
                {step === 0 ? "로그인" : "이전"}
              </button>
              <button type="button" onClick={next} disabled={loading || success}
                className="h-12 flex-1 rounded-xl text-white font-black text-[15px] transition disabled:opacity-60 shadow-[0_12px_26px_rgba(15,26,48,0.28)]" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>
                {loading ? "등록 중..." : last ? "등록 신청" : optional && empty ? "건너뛰기" : "다음"}
              </button>
            </div>
            {step === 0 && !window.Capacitor?.isNativePlatform?.() && (
              <div className="mt-2.5 text-center"><Link to="/login" className="text-[12px] text-[#7A89A3] hover:underline">다른 유형으로 로그인</Link></div>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes kpStepIn{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}.kp-step-in{animation:kpStepIn .22s ease-out}`}</style>
    </div>
  );
}
