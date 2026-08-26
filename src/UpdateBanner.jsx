// src/UpdateBanner.jsx
import React from "react";
import { db } from "./firebase";
import { doc, onSnapshot } from "firebase/firestore";

// ⭐ 2026-08-26 사용자 요청 히스토리:
// 1) 배포할 때마다 "새 버전이 준비되었습니다" 배너가 뜨는 게 불편하니 꺼달라고 함.
// 2) 이어서, 배너와 별개로 새 버전이 화면이 열려있는 동안 백그라운드에서 조용히
//    자동 적용되는 것도 꺼서 "새로고침해야 버전이 업데이트되게" 해달라고 함 —
//    그래서 아래 useEffect와 main.jsx 양쪽에서 자동 APPLY_UPDATE(skipWaiting)
//    전송을 껐다. 배포해도 지금 열려있는 화면은 예전 코드로 계속 돌아가고,
//    사용자가 새로고침하거나 앱을 완전히 껐다 켜야만 최신 버전이 적용된다 —
//    이 동작은 아래 3)의 배너 on/off 토글과 무관하게 항상 그렇다.
// 3) 최고관리자가 헤더의 "업데이트알림 ON/OFF" 버튼(DispatchApp.jsx 참고)으로
//    이 배너를 실시간으로 직접 켜고 끌 수 있게 해달라고 함 — Firestore
//    appSettings/updateBanner 문서의 enabled 값을 그대로 따른다(아래
//    bannerEnabled state 참고). 문서가 아직 없으면(기본 배포 상태) 자동으로
//    OFF다. 코드에 박아둔 상수로 다시 되돌리지 말 것 — 최고관리자가 UI로 켜고
//    끄는 게 지금의 정상 동작이다.

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

  // 최고관리자가 켠 상태인지 실시간 구독 — 문서가 없으면(기본 배포 상태) false.
  // ref로도 같이 들고 있는 이유: 아래 activateUpdate가 []-dep useEffect 안에서
  // 한 번만 만들어지므로, state를 직접 참조하면 클로저에 갇힌 초깃값(false)만
  // 계속 보게 된다 — ref를 통해 항상 최신 값을 읽는다.
  const [bannerEnabled, setBannerEnabled] = React.useState(false);
  const bannerEnabledRef = React.useRef(false);
  React.useEffect(() => { bannerEnabledRef.current = bannerEnabled; }, [bannerEnabled]);

  React.useEffect(() => {
    const unsub = onSnapshot(doc(db, "appSettings", "updateBanner"), (snap) => {
      setBannerEnabled(snap.exists() ? !!snap.data()?.enabled : false);
    }, () => {});
    return () => unsub();
  }, []);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const activateUpdate = () => {
      if (!bannerEnabledRef.current) return;
      setVisible(true);
      window.dispatchEvent(new Event("appUpdateAvailable"));
    };

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      activateUpdate();
    });

    // ⭐ 새 서비스워커를 감지해도 자동으로 APPLY_UPDATE(skipWaiting)를 보내지
    // 않는다 — 사용자가 새로고침하거나 앱을 완전히 껐다 켜야만 새 버전이
    // 적용되게 해달라는 요청. main.jsx도 동일하게 처리돼 있다.

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
