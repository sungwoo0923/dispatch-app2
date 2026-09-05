// ======================= gom-hour-site/src/App.jsx =======================
// GOM_Hour의 자체 최상위 라우터. "/"는 고객용 주문페이지, "/admin"은
// 관리자페이지(다음 단계에서 구현 예정)다.
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import OrderPage from "./OrderPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* TODO: 관리자페이지 구현 시 <Route path="/admin/*" element={<AdminApp />} /> 추가 */}
        <Route path="/*" element={<OrderPage />} />
      </Routes>
    </BrowserRouter>
  );
}
