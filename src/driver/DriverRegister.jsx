// src/driver/DriverRegister.jsx
import React, { useState } from "react";
import { auth, db } from "../firebase";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";

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

function TermsBox({ title, text }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 text-[12px] font-bold text-gray-600 border-b border-gray-200">
        {title}
      </div>
      <div className="px-4 py-3 h-28 overflow-y-auto text-[12px] text-gray-500 leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

export default function DriverRegister() {
  const [companyName, setCompanyName] = useState("");
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
    const normPlate = carNo.trim().replace(/\s+/g, "").toUpperCase();
    let preRegistered = null;
    try {
      const preSnap = await getDoc(doc(db, "drivers", normPlate));
      if (preSnap.exists()) {
        const d = preSnap.data();
        const sameName = (d.이름 || d.name || "").trim() === name.trim();
        const sameCompany = (d.companyName || "").trim() === companyName.trim();
        if (sameName && sameCompany) preRegistered = d;
        else {
          setError("이미 등록된 차량번호인데 이름·회사명이 다릅니다. 관리자에게 문의해주세요.");
          return;
        }
      }
    } catch (_) { /* 조회 실패 시 그냥 신규 가입으로 진행 */ }

    try {
      setLoading(true);
      const res = await createUserWithEmailAndPassword(auth, email, password);
      const uid = res.user.uid;

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
        approved: false,
        termsAgreed,
        privacyAgreed,
        gpsAgreed,
        createdAt: serverTimestamp(),
      });
      if (hireDate) {
        await setDoc(doc(db, "userProfiles", uid), { hireDate }, { merge: true }).catch(() => {});
      }

      await setDoc(doc(db, "drivers", uid), {
        uid,
        name: name.trim(),
        carNo: carNo.trim(),
        phone: phone.trim(),
        vehicleType,
        차량종류: category,
        차량톤수: tonnage,
        거주지: residence,
        요청사항: requestNote.trim(),
        companyName: companyName.trim(),
        mainStatus: "대기",
        subStatus: "대기",
        status: "대기",
        state: "대기",
        goStatus: "대기",
        active: false,
        totalDistance: 0,
        approved: false,
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
        await deleteDoc(doc(db, "drivers", normPlate)).catch(() => {});
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#061832] via-[#0B2554] to-[#0D2B66] px-4 py-10">
      <div className="absolute top-4 right-4">
        <img src="/icons/sflow-icon.png" alt="S-Flow" className="w-9 h-9 rounded-xl shadow-md" />
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-7">
          <h1 className="text-[22px] font-extrabold text-[#1B2B4B] tracking-tight">기사 등록</h1>
          <p className="text-[13px] text-gray-400 mt-1">차량번호와 이름으로 계정이 생성됩니다</p>
        </div>

        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
              소속 회사명 <span className="text-red-400">*</span>
            </label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="가입한 운송사명을 입력하세요"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition"
            />
            <p className="text-[11px] text-gray-400 mt-1">관리자가 등록한 회사명과 정확히 일치해야 합니다.</p>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
              차량번호 <span className="text-red-400">*</span>
            </label>
            <input
              value={carNo}
              onChange={(e) => setCarNo(e.target.value)}
              placeholder="예: 경기97가1234"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition"
            />
            <p className="text-[11px] text-gray-400 mt-1">차량번호가 로그인 ID 및 비밀번호로 사용됩니다.</p>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
              이름 <span className="text-red-400">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="실명 입력"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition"
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
              핸드폰번호 <span className="text-red-400">*</span>
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="010-0000-0000"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
                차량 종류 <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <select
                  value={vehicleCategory}
                  onChange={(e) => setVehicleCategory(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition appearance-none bg-white"
                >
                  <option value="">선택</option>
                  {VEHICLE_CATEGORIES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">▾</span>
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
                톤수 <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <select
                  value={tonnage}
                  onChange={(e) => setTonnage(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition appearance-none bg-white"
                >
                  <option value="">선택</option>
                  {TON_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">▾</span>
              </div>
            </div>
          </div>

          {vehicleCategory === "직접입력" && (
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">차량 종류 직접입력 <span className="text-red-400">*</span></label>
              <input
                value={vehicleCategoryCustom}
                onChange={(e) => setVehicleCategoryCustom(e.target.value)}
                placeholder="예: 리프트탑"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
                거주지(시/도) <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <select
                  value={residenceProvince}
                  onChange={(e) => { setResidenceProvince(e.target.value); setResidenceCity(""); }}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition appearance-none bg-white"
                >
                  <option value="">선택</option>
                  {RESIDENCE_PROVINCES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">▾</span>
              </div>
            </div>
            {RESIDENCE_SUB_REGIONS[residenceProvince] && (
              <div>
                <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
                  시/군 <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <select
                    value={residenceCity}
                    onChange={(e) => setResidenceCity(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition appearance-none bg-white"
                  >
                    <option value="">선택</option>
                    {RESIDENCE_SUB_REGIONS[residenceProvince].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">▾</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">요청사항</label>
            <textarea
              value={requestNote}
              onChange={(e) => setRequestNote(e.target.value)}
              rows={2}
              placeholder="관리자에게 전달할 요청사항이 있으면 입력하세요"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition resize-none"
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">입사일</label>
            <input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition" />
            <p className="text-[11px] text-gray-400 mt-1.5">입사일을 입력하면 연차/월차가 자동으로 설정됩니다.</p>
          </div>
        </div>

        {/* 약관 */}
        <div className="space-y-3 mb-5">
          <TermsBox title="서비스 이용약관" text={DRIVER_TERMS} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={termsAgreed}
              onChange={(e) => setTermsAgreed(e.target.checked)}
              className="w-4 h-4 accent-[#1B2B4B]"
            />
            <span className="text-[13px] text-gray-700 font-medium">서비스 이용약관에 동의합니다 <span className="text-red-400">(필수)</span></span>
          </label>

          <TermsBox title="개인정보처리방침" text={DRIVER_PRIVACY} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={privacyAgreed}
              onChange={(e) => setPrivacyAgreed(e.target.checked)}
              className="w-4 h-4 accent-[#1B2B4B]"
            />
            <span className="text-[13px] text-gray-700 font-medium">개인정보처리방침에 동의합니다 <span className="text-red-400">(필수)</span></span>
          </label>

          <TermsBox title="위치정보 수집 동의" text={DRIVER_GPS} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={gpsAgreed}
              onChange={(e) => setGpsAgreed(e.target.checked)}
              className="w-4 h-4 accent-[#1B2B4B]"
            />
            <span className="text-[13px] text-gray-700 font-medium">위치정보 수집에 동의합니다 <span className="text-red-400">(필수)</span></span>
          </label>
        </div>

        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-[13px] px-4 py-3 rounded-xl font-semibold">
            등록 완료! 관리자 승인 후 로그인이 가능합니다.
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-[13px] px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <button
          onClick={register}
          disabled={loading || success}
          className="w-full bg-[#1B2B4B] text-white py-3 rounded-xl font-bold text-[15px] hover:bg-[#243a60] transition disabled:opacity-60"
        >
          {loading ? "등록 중..." : "등록 신청"}
        </button>

        <div className="mt-5 flex flex-col items-center gap-2">
          <button
            onClick={() => navigate("/driver-login")}
            className="text-[13px] text-[#1B2B4B] font-semibold hover:underline"
          >
            로그인으로 돌아가기
          </button>
          <Link to="/login" className="text-[12px] text-gray-400 hover:underline">
            다른 유형으로 로그인
          </Link>
        </div>
      </div>
    </div>
  );
}
