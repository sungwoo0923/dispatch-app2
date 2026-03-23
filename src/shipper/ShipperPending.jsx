// src/shipper/ShipperPending.jsx

import React, { useState, useEffect } from "react";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

export default function ShipperPending() {
  const [showContact, setShowContact] = useState(false);

  // 🔥 승인 감지 → 자동 이동
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        const data = snap.data();

        if (data.approved === true) {
          window.location.href = "/shipper"; // 자동 진입
        }
      }
    });

    return () => unsub();
  }, []);

  const logout = async () => {
    await signOut(auth);
    window.location.href = "/shipper-login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">

      <div className="bg-white p-10 rounded-2xl shadow-xl w-[380px] text-center">

        {/* 🔥 애니메이션 */}
        <div className="flex justify-center mb-6">
          <div className="relative">

            {/* 펄스 */}
            <div className="w-16 h-16 bg-blue-100 rounded-full animate-ping absolute"></div>

            {/* 스피너 */}
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>

          </div>
        </div>

        <h1 className="text-2xl font-bold mb-4">승인 대기 중</h1>

        <p className="text-gray-600 text-base mb-6 leading-relaxed">
          화주 계정은 관리자 승인 후 이용 가능합니다.
          <br />
          보통 영업시간 기준 1~24시간 내 처리됩니다.
        </p>

        <div className="flex flex-col gap-3">

          <button
            onClick={logout}
            className="w-full py-2.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm"
          >
            로그아웃
          </button>

          <button
            onClick={() => setShowContact(true)}
            className="w-full py-2.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
          >
            관리자 문의
          </button>

        </div>
      </div>

      {/* 🔥 관리자 문의 팝업 (글씨 키움) */}
      {showContact && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center">

          <div className="bg-white w-[360px] rounded-2xl shadow-2xl p-7 text-center">

            <div className="text-xl font-bold text-gray-800 mb-5">
              관리자 문의
            </div>

            <div className="space-y-4 text-gray-700">

              <div>
                <div className="text-sm text-gray-500">대표번호</div>
                <a
                  href="tel:15332525"
                  className="text-blue-600 font-bold text-2xl"
                >
                  1533-2525
                </a>
              </div>

              <div>
                <div className="text-sm text-gray-500">운영시간</div>
                <div className="text-base">평일 09:00 ~ 18:00</div>
              </div>

              <div className="text-sm text-gray-400">
                승인 관련 문의는 위 번호로 연락 부탁드립니다.
              </div>

            </div>

            <button
              onClick={() => setShowContact(false)}
              className="mt-6 w-full py-3 bg-blue-600 text-white rounded-lg text-base font-semibold"
            >
              확인
            </button>

          </div>
        </div>
      )}

    </div>
  );
}