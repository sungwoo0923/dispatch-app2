// ======================= src/lazyLoad.jsx =======================
// ⭐ 2026-11-02 속도 — 첫 화면에 필요 없는 큰 화면·라이브러리를 "쓸 때" 받아오게 하는 도우미.
//  ① lazyView: 지입차관리·운임조회처럼 메뉴를 눌러야 보이는 큰 화면을 따로 떼어(별도 파일) 받는다.
//     각 화면마다 자체 Suspense(가벼운 자리표시)를 둬서, 받는 동안 앱 전체가 로딩 화면으로 바뀌지 않는다.
//  ② html2canvas: 캡처(이미지·PDF 저장) 라이브러리 — 원래도 Promise를 돌려주는 함수라 같은 모양으로
//     감싸면 부르는 곳은 그대로 두고, 처음 캡처할 때만 내려받는다.
//  ③ loadJsPDF: PDF 라이브러리 — PDF 저장 버튼을 누를 때 내려받는다.
//  ④ prefetchWhenIdle: 첫 화면이 다 뜬 뒤 한가할 때 미리 받아 둬서, 메뉴를 처음 열 때도 기다림이 거의 없다.
import React, { Suspense } from "react";

// 한 번 실패(배포 직후 옛 파일 등)하면 한 번 더 시도 — 그래도 실패하면 ErrorBoundary가 새로고침 처리
const retryOnce = (load) => () => load().catch(() => load());

function LazyFallback() {
  return (
    <div style={{ minHeight: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>
      불러오는 중…
    </div>
  );
}

export function lazyView(load, fallback = <LazyFallback />) {
  const loader = retryOnce(load);
  const Lazy = React.lazy(loader);
  function LazyView(props) {
    return (
      <Suspense fallback={fallback}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  LazyView.preload = loader;
  return LazyView;
}

let h2cP = null;
export function html2canvas(...args) {
  if (!h2cP) h2cP = import("html2canvas").then((m) => m.default || m).catch((e) => { h2cP = null; throw e; });
  return h2cP.then((fn) => fn(...args));
}

let pdfP = null;
export function loadJsPDF() {
  if (!pdfP) pdfP = import("jspdf").then((m) => m.default || m.jsPDF).catch((e) => { pdfP = null; throw e; });
  return pdfP;
}

// 첫 화면이 자리잡은 뒤(기본 6초) 한가할 때 하나씩 미리 받아 둔다 — 화면 전환·입력과 겹치지 않게 간격을 둔다
export function prefetchWhenIdle(loaders, startDelay = 6000) {
  if (typeof window === "undefined") return () => {};
  let stopped = false; let timer = null;
  const conn = typeof navigator !== "undefined" ? navigator.connection : null;
  if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ""))) return () => {};
  const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 200));
  const queue = loaders.filter(Boolean);
  const next = () => {
    if (stopped || !queue.length) return;
    idle(() => {
      if (stopped) return;
      const l = queue.shift();
      Promise.resolve().then(() => l()).catch(() => {}).finally(() => { timer = setTimeout(next, 400); });
    });
  };
  timer = setTimeout(next, startDelay);
  return () => { stopped = true; clearTimeout(timer); };
}
