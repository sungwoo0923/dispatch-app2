// src/UpdateBanner.jsx
import React from "react";

export default function UpdateBanner() {
  const [phase, setPhase] = React.useState("hidden"); // hidden | show | fadeout

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;

    // ✅ 컨트롤러 변경 = 새 SW 활성화 완료 → 배너 표시 후 자동 새로고침
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;

      setPhase("show");

      // 2초 후 fadeout 시작
      setTimeout(() => setPhase("fadeout"), 2000);

      // 2.8초 후 새로고침
      setTimeout(() => window.location.reload(), 2800);
    });

    // ✅ 기존 waiting 워커 즉시 처리
    navigator.serviceWorker.ready.then(reg => {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "APPLY_UPDATE" });
      }

      // 새 워커 설치 감지
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: "APPLY_UPDATE" });
          }
        });
      });
    });

    // ✅ 5분마다 업데이트 체크
    const interval = setInterval(() => {
      navigator.serviceWorker.ready.then(reg => reg.update()).catch(() => {});
    }, 5 * 60 * 1000);

    // ✅ 탭 포커스 시 업데이트 체크
    const onFocus = () => {
      navigator.serviceWorker.ready.then(reg => reg.update()).catch(() => {});
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <>
      <style>{`
        @keyframes bannerDown {
          from { opacity: 0; transform: translateY(-100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bannerUp {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(-100%); }
        }
        .update-banner {
          animation: bannerDown 0.4s ease-out forwards;
        }
        .update-banner.fadeout {
          animation: bannerUp 0.5s ease-in forwards;
        }
      `}</style>
      <div className={`update-banner${phase === "fadeout" ? " fadeout" : ""}`}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 999999,
          background: "#1B2B4B",
          color: "white",
          textAlign: "center",
          padding: "10px 16px",
          fontSize: "13px",
          fontWeight: 600,
          letterSpacing: "0.2px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          fontFamily: "'Noto Sans KR', sans-serif",
        }}
      >
        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#4ade80", marginRight: 8, verticalAlign: "middle" }} />
        최신 버전으로 자동 업데이트되었습니다. 잠시 후 새로고침됩니다.
      </div>
    </>
  );
}