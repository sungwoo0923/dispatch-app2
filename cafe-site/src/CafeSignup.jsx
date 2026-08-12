// ======================= cafe-site/src/CafeSignup.jsx =======================
// 배차마당 회원가입 — 운송사/화주사처럼 승인 절차 없이 가입 즉시 이용 가능하다.
// 화주(오더 등록) / 차주(배차 신청)를 먼저 선택하게 해, 차주라면 차량정보를
// 추가로 입력받는다 — 다만 배차마당은 "차주만 신청 가능"이 아니라 누구나 서로의
// 오더를 보고 신청할 수 있으므로, 이 구분은 프로필 표시/필요 입력항목용이다.
import React, { useState } from "react";
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import { CAFE_ROLES, VEHICLE_TYPES } from "./cafeConstants";
import BizNumberInput, { isValidBizNumber, BIZ_DIRECTORY_COL } from "./BizNumberInput";
import CafeBrand from "./CafeBrand";

export default function CafeSignup() {
  const [cafeRole, setCafeRole] = useState("shipper"); // shipper | driver
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [bizNumber, setBizNumber] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const formatPhone = (v) => {
    const d = v.replace(/[^\d]/g, "").slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  };

  const submit = async () => {
    setError("");
    if (!email.trim() || !pw || !companyName.trim() || !name.trim() || !nickname.trim() || !phone.trim()) {
      return setError("모든 항목을 입력해주세요.");
    }
    if (pw.length < 6) return setError("비밀번호는 6자 이상이어야 합니다.");
    if (pw !== pw2) return setError("비밀번호가 일치하지 않습니다.");
    if (bizNumber && bizNumber.replace(/[^\d]/g, "").length === 10 && !isValidBizNumber(bizNumber)) {
      return setError("사업자등록번호 형식이 올바르지 않습니다.");
    }
    if (cafeRole === "driver" && !vehicleNumber.trim()) return setError("차량번호를 입력해주세요.");

    setLoading(true);
    try {
      const res = await createUserWithEmailAndPassword(auth, email.trim(), pw);
      await setDoc(doc(db, "users", res.user.uid), {
        email: email.trim(),
        role: "cafeUser",
        cafeRole, // "shipper" | "driver"
        approved: true,
        companyName: companyName.trim(),
        name: name.trim(),
        nickname: nickname.trim(),
        phone: phone.trim(),
        bizNumber: bizNumber.trim(),
        ...(cafeRole === "driver" ? {
          vehicleNumber: vehicleNumber.trim(),
          vehicleType: vehicleType.trim(),
        } : {}),
        createdAt: serverTimestamp(),
      });
      // 배차마당에 처음 등록되는 사업자번호라면, 다음에 같은 회사 직원이 가입할 때
      // "조회"로 회사명을 바로 찾을 수 있도록 공개 조회용 디렉터리에 남겨둔다.
      const bizDigits = bizNumber.replace(/[^\d]/g, "");
      if (bizDigits.length === 10) {
        await setDoc(doc(db, BIZ_DIRECTORY_COL, bizDigits), {
          companyName: companyName.trim(), updatedAt: serverTimestamp(),
        }, { merge: true }).catch(() => {});
      }
      nav("/", { replace: true });
    } catch (e) {
      const msg = e.code === "auth/email-already-in-use" ? "이미 가입된 이메일입니다."
        : e.code === "auth/invalid-email" ? "이메일 형식이 올바르지 않습니다."
        : e.message || "가입 중 오류가 발생했습니다.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-900 outline-none focus:border-[#1B2B4B] transition";

  return (
    <div className="min-h-screen bg-[#f4f6fa] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[460px]">
        <div className="text-center mb-6">
          <CafeBrand size="lg" center />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7 space-y-3">
          <h2 className="text-[16px] font-bold text-gray-900 mb-1">회원가입</h2>

          {/* 화주/차주 구분 */}
          <div className="grid grid-cols-2 gap-2 mb-1">
            {CAFE_ROLES.map(r => (
              <button key={r.key} type="button" onClick={() => setCafeRole(r.key)}
                className={`text-left px-3.5 py-3 rounded-xl border-2 transition ${
                  cafeRole === r.key ? "border-[#1B2B4B] bg-[#1B2B4B]/5" : "border-gray-200 hover:border-gray-300"
                }`}>
                <div className={`text-[13.5px] font-bold ${cafeRole === r.key ? "text-[#1B2B4B]" : "text-gray-700"}`}>{r.label}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{r.desc}</div>
              </button>
            ))}
          </div>

          <input className={inputCls} placeholder="이메일 (아이디)" type="email" autoComplete="off"
            value={email} onChange={e => setEmail(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="비밀번호 (6자 이상)" type="password" autoComplete="off"
              value={pw} onChange={e => setPw(e.target.value)} />
            <input className={inputCls} placeholder="비밀번호 확인" type="password" autoComplete="off"
              value={pw2} onChange={e => setPw2(e.target.value)} />
          </div>
          <input className={inputCls} placeholder={cafeRole === "driver" ? "상호 또는 성함" : "회사명"} autoComplete="off"
            value={companyName} onChange={e => setCompanyName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="이름" autoComplete="off"
              value={name} onChange={e => setName(e.target.value)} />
            <input className={inputCls} placeholder="닉네임" autoComplete="off"
              value={nickname} onChange={e => setNickname(e.target.value)} />
          </div>
          <input className={inputCls} placeholder="휴대폰번호" autoComplete="off"
            value={phone} onChange={e => setPhone(formatPhone(e.target.value))} />

          <BizNumberInput value={bizNumber} onChange={setBizNumber} onPick={setCompanyName} />

          {cafeRole === "driver" && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <input className={inputCls} placeholder="차량번호 (예: 12가1234)" autoComplete="off"
                value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} />
              <select className={inputCls} value={vehicleType} onChange={e => setVehicleType(e.target.value)}>
                <option value="">차량종류 선택</option>
                {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          )}

          {error && <div className="text-[12px] text-red-500 font-semibold px-1">{error}</div>}

          <button onClick={submit} disabled={loading}
            className="w-full py-3 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white font-bold text-[14px] transition disabled:opacity-50 mt-2">
            {loading ? "가입 중..." : "가입하고 시작하기"}
          </button>

          <div className="text-center pt-2">
            <Link to="/login" className="text-[13px] text-gray-500 hover:text-[#1B2B4B]">이미 계정이 있으신가요? 로그인</Link>
          </div>
        </div>

        <div className="text-center mt-4">
          <a href="https://dispatch-app2.vercel.app/login" target="_blank" rel="noreferrer"
            className="text-[12px] text-gray-400 hover:text-gray-600">배차관리 프로그램으로 돌아가기 ↗</a>
        </div>
      </div>
    </div>
  );
}
