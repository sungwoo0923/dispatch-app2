// src/UpdateBanner.jsx
import React from "react";

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
// 4) 2026-10-28: 상단 강제 배너와 "업데이트알림 ON/OFF" 버튼을 없앰 — 새 버전은
//    버전 표시 자리의 NEW 표시(VersionCheck.jsx)로 안내하고, 누르면 안내 카드가 뜬다.
//    이 컴포넌트는 이제 화면에 아무것도 그리지 않고 서비스워커 새 버전 확인만 한다.

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
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // ⭐ 새 서비스워커를 감지해도 자동으로 APPLY_UPDATE(skipWaiting)를 보내지
    // 않는다 — 사용자가 업데이트를 누르거나 앱을 껐다 켜야만 새 버전이 적용된다.
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
  return null;
}
