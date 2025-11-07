// src/NoAccess.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

export default function NoAccess() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-center px-4">
      <div className="text-4xl mb-4">🚫</div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">
        접근 권한이 없습니다.
      </h2>
      <p className="text-gray-600 mb-6">
        관리자에게 문의하세요.
      </p>

      <button
        onClick={() => navigate(-1)}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        🔙 이전 화면으로 돌아가기
      </button>
    </div>
  );
}
