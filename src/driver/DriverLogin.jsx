// src/driver/DriverLogin.jsx
import React, { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

export default function DriverLogin() {
  const [carNo, setCarNo] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const makeEmail = (v) => `${v.replace(/ /g, "")}@driver.run25.kr`;

  // 페이지 진입 시 무조건 초기화
  useEffect(() => {
    signOut(auth);
    localStorage.removeItem("role");
    localStorage.removeItem("uid");
  }, []);

  const login = async () => {
    setError("");
    if (!carNo.trim() || !name.trim()) {
      setError("차량번호와 이름을 모두 입력해주세요.");
      return;
    }

    const email = makeEmail(carNo.trim());
    const password = carNo.trim();

    try {
      const res = await signInWithEmailAndPassword(auth, email, password);
      const uid = res.user.uid;

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

      localStorage.setItem("role", "driver");
      localStorage.setItem("uid", uid);

      setTimeout(() => {
        navigate("/driver-home", { replace: true });
      }, 300);
    } catch (err) {
      console.error(err);
      setError("차량번호 또는 이름이 올바르지 않습니다.");
      await signOut(auth);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#061832] via-[#0B2554] to-[#0D2B66] px-4">
      {/* 상단 우측 로고 */}
      <div className="absolute top-4 right-4">
        <img
          src="/icons/sflow-icon.png"
          alt="S-Flow"
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
              차량번호
            </label>
            <input
              value={carNo}
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              placeholder="이름 입력"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition"
            />
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-600 text-[13px] px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* 로그인 버튼 */}
        <button
          onClick={login}
          className="mt-6 w-full bg-[#1B2B4B] text-white py-3 rounded-xl font-bold text-[15px] hover:bg-[#243a60] transition"
        >
          로그인
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
