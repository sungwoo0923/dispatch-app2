// src/App.jsx
import React from "react";
import DispatchApp from "./DispatchApp"; // 배차 프로그램 메인 컴포넌트 불러오기

export default function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <DispatchApp /> {/* 전체 프로그램 표시 */}
    </div>
  );
}