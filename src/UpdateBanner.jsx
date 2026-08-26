// src/UpdateBanner.jsx
import React from "react";

// ⭐ 2026-08-26 사용자 명시적 요청(KP-Flow 배차프로그램): 배포할 때마다
// "새 버전이 준비되었습니다" 배너/버튼이 뜨는 게 불편하니 꺼달라고 함 —
// 의도적으로 false로 잠가둔 값이니 별도 지시 없이 다시 true로 되돌리지 말 것.
//
// 처음엔 배너만 끄고 새 버전은 백그라운드에서 조용히 자동 적용했었는데(그래서
// 화면이 갑자기 바뀌는 것처럼 느껴짐), 이어서 "새로고침해야 버전이 업데이트되게
// 해달라"는 요청이 추가로 와서, 아래 useEffect와 main.jsx 양쪽에서 배차프로그램
// 한정으로 자동 APPLY_UPDATE(skipWaiting) 전송도 함께 껐다(isPlannerSite 분기
// 참고). 그래서 지금은: 배포해도 지금 열려있는 화면은 그대로 예전 코드로 계속
// 돌아가고, 사용자가 직접 새로고침하거나 앱을 완전히 껐다 켜야만 최신 버전이
// 적용된다.
const SHOW_UPDATE_BANNER = false;

// KP-Planner(VITE_PLANNER_SITE=1로 빌드되는 별도 Vercel 프로젝트)는 배차프로그램과
// 별개의 제품이라 위 요청들과 무관하다 — 배너는 원래부터 뜬 적이 없고, 새
// 서비스워커가 설치되면 지금까지처럼 조용히 즉시 자동 적용된다(아래 useEffect의
// isPlannerSite 분기, main.jsx도 동일). 여기 손대지 말 것.
const isPlannerSite = import.meta.env.VITE_PLANNER_SITE === "1";

// 업데이트 버튼 클릭 시 단순 새로고침만으로는, 이전에 설치된 서비스워커/캐시가
// 새 배포와 꼬여있는 경우(구버전 SW가 새 index.html은 네트워크로 받아오면서도
// 그 안에서 참조하는 새 JS 청크는 아직 캐시에 없다는 이유로 못 받아오는 등) 계속
// 예전 코드가 로드되는 문제가 있었다. 서비스워커를 완전히 해제하고 모든 캐시를
// 지운 뒤 새로고침해서, 어떤 경우에도 확실히 최신 코드를 받아오도록 한다.
export const hardReloadForUpdate = async () => {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}
  window.location.reload();
};

export default function UpdateBanner() {
  const [visible, setVisible] = React.useState(false);
  const [blinking, setBlinking] = React.useState(false);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const activateUpdate = () => {
      if (!SHOW_UPDATE_BANNER || isPlannerSite) return;
      setVisible(true);
      window.dispatchEvent(new Event("appUpdateAvailable"));
    };

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      activateUpdate();
    });

    // ⭐ 배차프로그램(KP-Flow)에서는 새 서비스워커를 감지해도 자동으로
    // APPLY_UPDATE(skipWaiting)를 보내지 않는다 — 사용자가 새로고침하거나 앱을
    // 완전히 껐다 켜야만 새 버전이 적용되게 해달라는 요청. main.jsx도 동일하게
    // 처리돼 있다. KP-Planner는 원래 동작(조용히 즉시 자동 적용)을 그대로 둔다.
    if (isPlannerSite) {
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
    }

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

  // ⭐ 예전엔 10초 뒤 깜빡이다 13초에 저절로 사라졌는데, 그 사이에 화면을 안
  // 보고 있으면 배너를 놓치고 계속 예전 버전으로 남는 문제가 있었다 — 이제는
  // 10초 뒤 살짝 깜빡이기만 하고, 사용자가 직접 닫거나 업데이트를 누르기
  // 전까지는 계속 떠 있는다.
  React.useEffect(() => {
    if (!visible) return;
    const blinkTimer = setTimeout(() => setBlinking(true), 10000);
    return () => clearTimeout(blinkTimer);
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes bannerDown {
          from { opacity: 0; transform: translateY(-100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bannerBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
        .update-banner {
          animation: bannerDown 0.4s ease-out forwards;
        }
        .update-banner-blink {
          animation: bannerBlink 1.4s ease-in-out infinite;
        }
      `}</style>
      <div
        className={blinking ? "update-banner-blink" : "update-banner"}
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
          onClick={hardReloadForUpdate}
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
