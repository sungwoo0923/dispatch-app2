// src/driver/DriverRegister.jsx
import React, { useState } from "react";
import { auth, db } from "../firebase";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";

const VEHICLE_TYPES = ["1톤", "1.4톤", "2.5톤", "3.5톤", "5톤", "11톤", "25톤", "축차", "카고", "탑차", "윙바디", "냉동차", "기타"];

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
  const [carNo, setCarNo] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("");
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
    if (!carNo.trim()) return setError("차량번호를 입력해주세요.");
    if (!name.trim()) return setError("이름을 입력해주세요.");
    if (!phone.trim()) return setError("핸드폰번호를 입력해주세요.");
    if (!vehicleType) return setError("차량 종류를 선택해주세요.");
    if (!termsAgreed || !privacyAgreed || !gpsAgreed) return setError("모든 약관에 동의해주세요.");

    const email = makeEmail(carNo.trim());
    const password = carNo.trim();

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
        vehicleType: vehicleType || "",
        approved: false,
        termsAgreed,
        privacyAgreed,
        gpsAgreed,
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, "drivers", uid), {
        uid,
        name: name.trim(),
        carNo: carNo.trim(),
        phone: phone.trim(),
        vehicleType: vehicleType || "",
        mainStatus: "대기",
        subStatus: "대기",
        status: "대기",
        state: "대기",
        goStatus: "대기",
        active: false,
        totalDistance: 0,
        approved: false,
        updatedAt: serverTimestamp(),
      });

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

          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
              차량 종류 <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition appearance-none bg-white"
              >
                <option value="">차량 종류 선택</option>
                {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">▾</span>
            </div>
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
