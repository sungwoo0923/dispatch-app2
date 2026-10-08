// src/driver/DriverLogin.jsx
import React, { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import BigCheck from "../components/BigCheck";

// ⭐ 사용자 요청 — 한 번 로그인한 폰에서는 소속회사명/차량번호/이름을 기억하고(정보 저장),
// "자동 로그인"을 켜두면 로그인 화면에 들어오는 순간 저장된 정보로 바로 로그인한다.
// 단, 기사가 직접 "로그아웃"을 누른 직후에는 자동 로그인하지 않는다(다시 들어가버리는 것 방지).
const SAVED_KEY = "driverLoginSaved";
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "null"); } catch { return null; }
}

export default function DriverLogin() {
  const saved = loadSaved();
  const keep = saved && saved.remember !== false;
  const [companyNameState, setCompanyName] = useState(keep ? saved.companyName || "" : "");
  const [carNoState, setCarNo] = useState(keep ? saved.carNo || "" : "");
  const [nameState, setName] = useState(keep ? saved.name || "" : "");
  const [rememberInfo, setRememberInfo] = useState(saved ? saved.remember !== false : true);
  const [autoLogin, setAutoLogin] = useState(saved ? saved.autoLogin === true : false);
  const [error, setError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const navigate = useNavigate();

  const makeEmail = (v) => `${v.replace(/ /g, "")}@driver.run25.kr`;

  // 페이지 진입 시 무조건 초기화 → 자동 로그인 설정이면 저장된 정보로 바로 로그인
  useEffect(() => {
    (async () => {
      await signOut(auth).catch(() => {});
      localStorage.removeItem("role");
      localStorage.removeItem("uid");
      const justLoggedOut = sessionStorage.getItem("driverJustLoggedOut") === "1";
      sessionStorage.removeItem("driverJustLoggedOut");
      const sv = loadSaved();
      if (!justLoggedOut && sv?.autoLogin && sv.companyName && sv.carNo && sv.name) login(sv);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (override) => {
    // override: 자동 로그인 시 저장된 값(아직 state 반영 전일 수 있어 직접 받는다)
    const companyName = override?.companyName ?? companyNameState;
    const carNo = override?.carNo ?? carNoState;
    const name = override?.name ?? nameState;
    if (loggingIn) return;
    setError("");
    if (!companyName.trim() || !carNo.trim() || !name.trim()) {
      setError("회사명, 차량번호, 이름을 모두 입력해주세요.");
      return;
    }

    const email = makeEmail(carNo.trim());
    const password = carNo.trim();

    setLoggingIn(true);
    try {
      let uid;
      try {
        const res = await signInWithEmailAndPassword(auth, email, password);
        uid = res.user.uid;
      } catch (signInErr) {
        // ⭐ 사용자 요청 — 관리자가 PC 기사관리에서 지입차를 미리 등록해두면(차량번호로
        // 문서만 만들어짐, 인증 계정은 아직 없음) 그 기사가 여기서 바로 로그인하려 해도
        // 로그인용 계정 자체가 없어 매번 실패했다(기사 등록 화면을 따로 거쳐야만 했음).
        // 로그인 시도 중 "그런 계정이 없음" 류 오류가 나면, 입력한 차량번호로 미리
        // 등록된 문서가 있는지 확인해서 이름·회사명이 맞으면 바로 그 자리에서 계정을
        // 만들어 이어받는다 — 기사 입장에서는 그냥 "로그인"만 하면 되는 경험이 된다.
        // ⭐ 버그수정 — drivers 컬렉션은 보안규칙상 로그인한 사용자만 읽을 수 있는데,
        // 이 조회를 계정 생성보다 먼저 하면 아직 비로그인 상태라 매번 permission-denied가
        // 나서(바깥 catch에 먹혀 "차량번호 또는 이름이 올바르지 않습니다"로만 보임)
        // 선등록 문서가 실제로 있어도 절대 못 찾았다. 계정을 먼저 만들어 로그인 상태를
        // 확보한 뒤 조회하고, 선등록 문서가 없거나 이름·회사명이 다르면 방금 만든
        // 계정을 그 자리에서 삭제해 원상복구한다.
        const normPlate = carNo.trim().replace(/\s+/g, "").toUpperCase();
        let res;
        try {
          res = await createUserWithEmailAndPassword(auth, email, password);
        } catch (createErr) {
          throw signInErr;
        }
        uid = res.user.uid;

        const preSnap = await getDoc(doc(db, "drivers", normPlate));
        if (!preSnap.exists()) {
          await res.user.delete().catch(() => {});
          throw signInErr;
        }
        const d = preSnap.data();
        const sameName = (d.이름 || d.name || "").trim() === name.trim();
        const sameCompany = (d.companyName || "").trim() === companyName.trim();
        if (!sameName || !sameCompany) {
          await res.user.delete().catch(() => {});
          throw signInErr;
        }

        const phone = d.전화번호 || d.phone || "";
        const common = {
          uid, name: name.trim(), carNo: carNo.trim(), phone,
          vehicleType: d.vehicleType || "",
          차량종류: d.차량종류 || "", 차량톤수: d.차량톤수 || "",
          거주지: d.거주지 || "", 요청사항: d.요청사항 || "",
          companyName: companyName.trim(),
          // 관리자가 PC에서 직접 등록한 차량이므로 승인 절차 없이 바로 사용 가능하게 한다.
          approved: true,
        };
        await setDoc(doc(db, "users", uid), {
          ...common, email, role: "driver",
          termsAgreed: true, privacyAgreed: true, gpsAgreed: true,
          createdAt: serverTimestamp(),
        });
        // ⭐ 버그수정 — PC 기사관리 화면은 drivers/{id} 문서를 이름/차량번호/전화번호(한글
        // 필드)로 읽는데, 여기서 영문 필드(name/carNo/phone)만 썼더니 로그인 직후 PC
        // 기사관리 목록에서 해당 기사 줄이 전부 "-"로 보였다(모바일 DriverHome은 반대로
        // 영문 필드를 읽으므로 영문도 그대로 유지) — 양쪽 다 쓴다.
        await setDoc(doc(db, "drivers", uid), {
          ...common,
          이름: name.trim(), 차량번호: carNo.trim(), 전화번호: phone,
          mainStatus: "대기", subStatus: "대기", status: "대기", state: "대기", goStatus: "대기",
          active: false, totalDistance: 0,
          등급: d.등급 || "일반", 담당자: d.담당자 || null, 근무요일: d.근무요일 || [], 메모: d.메모 || "",
          등록자: d.등록자 || "",
          createdAt: d.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await deleteDoc(doc(db, "drivers", normPlate)).catch(() => {});
      }

      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) {
        setError("등록된 기사 정보가 없습니다.");
        await signOut(auth);
        return;
      }

      const u = snap.data();
      if (!u.approved) {
        setError("관리자 승인 대기중입니다.");
        await signOut(auth);
        return;
      }
      if (u.name && u.name !== name.trim()) {
        setError("차량번호 또는 이름이 올바르지 않습니다.");
        await signOut(auth);
        return;
      }
      if (u.companyName && u.companyName !== companyName.trim()) {
        setError("소속 회사명이 올바르지 않습니다.");
        await signOut(auth);
        return;
      }

      localStorage.setItem("role", "driver");
      localStorage.setItem("uid", uid);
      try {
        const remember = override ? true : rememberInfo;
        const auto = override ? true : autoLogin;
        localStorage.setItem(SAVED_KEY, JSON.stringify(remember
          ? { remember: true, autoLogin: auto, companyName: companyName.trim(), carNo: carNo.trim(), name: name.trim() }
          : { remember: false, autoLogin: false }));
      } catch { /* 저장 실패 무시 */ }

      setTimeout(() => {
        navigate("/driver-home", { replace: true });
      }, 300);
    } catch (err) {
      console.error(err);
      setError("차량번호 또는 이름이 올바르지 않습니다.");
      await signOut(auth);
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#061832] via-[#0B2554] to-[#0D2B66] px-4">
      {/* 상단 우측 로고 */}
      <div className="absolute top-4 right-4">
        <img
          src="/icons/sflow-icon.png"
          alt="KP-Flow"
          className="w-9 h-9 rounded-xl shadow-md"
        />
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8">
        {/* 타이틀 */}
        <div className="text-center mb-8">
          <h1 className="text-[22px] font-extrabold text-[#1B2B4B] tracking-tight">
            기사 로그인
          </h1>
          <p className="text-[13px] text-gray-400 mt-1">
            차량번호와 이름으로 로그인합니다
          </p>
        </div>

        {/* 입력 필드 */}
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
              소속 회사명
            </label>
            <input
              value={companyNameState}
              onChange={(e) => setCompanyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              placeholder="가입한 운송사명을 입력하세요"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition"
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
              차량번호
            </label>
            <input
              value={carNoState}
              onChange={(e) => setCarNo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              placeholder="예: 경기97가1234"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition"
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
              기사 이름
            </label>
            <input
              value={nameState}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              placeholder="이름 입력"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition"
            />
          </div>
        </div>

        {/* ⭐ 정보 저장 / 자동 로그인 */}
        <div className="mt-4 flex items-center justify-between">
          <BigCheck checked={rememberInfo} onChange={(v) => { setRememberInfo(v); if (!v) setAutoLogin(false); }} label="기본정보 저장" />
          <BigCheck checked={autoLogin} onChange={(v) => { setAutoLogin(v); if (v) setRememberInfo(true); }} label="자동 로그인" />
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-600 text-[13px] px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* 로그인 버튼 */}
        <button
          onClick={() => login()}
          disabled={loggingIn}
          className="mt-6 w-full bg-[#1B2B4B] text-white py-3 rounded-xl font-bold text-[15px] hover:bg-[#243a60] transition disabled:opacity-60"
        >
          {loggingIn ? "로그인 중..." : "로그인"}
        </button>

        {/* 하단 링크 */}
        <div className="mt-5 flex flex-col items-center gap-2">
          <button
            onClick={() => navigate("/driver-register")}
            className="text-[13px] text-[#1B2B4B] font-semibold hover:underline"
          >
            기사 등록하기
          </button>
          <button
            onClick={() => navigate("/login")}
            className="text-[12px] text-gray-400 hover:underline"
          >
            다른 유형으로 로그인
          </button>
        </div>
      </div>
    </div>
  );
}
