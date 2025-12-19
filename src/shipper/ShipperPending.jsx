// src/shipper/ShipperPending.jsx
import React from "react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export default function ShipperPending() {
  const logout = async () => {
    await signOut(auth);
    window.location.href = "/shipper-login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-lg w-[360px] text-center">
        <h1 className="text-xl font-bold mb-4">⏳ 승인 대기 중</h1>

        <p className="text-gray-600 text-sm mb-6">
          화주 계정은 관리자 승인 후 이용 가능합니다.
          <br />
          보통 영업시간 기준 1~24시간 내 처리됩니다.
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={logout}
            className="w-full py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800"
          >
            로그아웃
          </button>

          <a
            href="tel:070-0000-0000"
            className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 text-white"
          >
            관리자 문의
          </a>
        </div>
      </div>
    </div>
  );
}
