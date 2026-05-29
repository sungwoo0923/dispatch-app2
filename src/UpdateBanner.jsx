// src/UpdateBanner.jsx
import React from "react";

export default function UpdateBanner() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const activateUpdate = () => {
      setVisible(true);
    };

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      activateUpdate();
    });

    navigator.serviceWorker.ready.then(reg => {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "APPLY_UPDATE" });
      }
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

    const interval = setInterval(() => {
      navigator.serviceWorker.ready.then(reg => reg.update()).catch(() => {});
    }, 5 * 60 * 1000);

    const onFocus = () => {
      navigator.serviceWorker.ready.then(reg => reg.update()).catch(() => {});
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes bannerDown {
          from { opacity: 0; transform: translateY(-100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .update-banner {
          animation: bannerDown 0.4s ease-out forwards;
        }
      `}</style>
      <div
        className="update-banner"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 999999,
          background: "#1B2B4B",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "10px 20px",
          fontSize: "13px",
          fontWeight: 600,
          letterSpacing: "0.2px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          fontFamily: "'Noto Sans KR', sans-serif",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />
          새 버전이 준비되었습니다.
        </span>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "white",
            color: "#1B2B4B",
            border: "none",
            borderRadius: "6px",
            padding: "5px 16px",
            fontSize: "13px",
            fontWeight: 700,
            cursor: "pointer",
            letterSpacing: "0.2px",
            flexShrink: 0,
          }}
        >
          업데이트
        </button>
        <button
          onClick={() => setVisible(false)}
          style={{
            background: "transparent",
            color: "rgba(255,255,255,0.6)",
            border: "none",
            fontSize: "18px",
            cursor: "pointer",
            lineHeight: 1,
            padding: "0 4px",
            flexShrink: 0,
          }}
          title="닫기"
        >
          ×
        </button>
      </div>
    </>
  );
}
