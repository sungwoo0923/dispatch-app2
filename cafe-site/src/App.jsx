// ======================= cafe-site/src/App.jsx =======================
// 배차마당(cafe-site)의 자체 최상위 라우터. 운송 프로그램(dispatch-app2)
// 본체 라우터 아래(/cafe/*)에 붙어있던 예전 구조와 달리, 이 사이트는
// 자기 자신이 루트("/")를 갖는 완전히 독립된 사이트다.
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import CafeApp from "./CafeApp";
import CafeLogin from "./CafeLogin";
import CafeSignup from "./CafeSignup";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<CafeLogin />} />
        <Route path="/signup" element={<CafeSignup />} />
        {/* 오더 상세는 게시판 위에 뜨는 모달이지만, 직접 링크로 공유할 수 있도록
            /orders/:id 도 같은 화면(CafeApp)에서 처리한다. */}
        <Route path="/orders/:id" element={<CafeApp />} />
        <Route path="/*" element={<CafeApp />} />
      </Routes>
    </BrowserRouter>
  );
}
