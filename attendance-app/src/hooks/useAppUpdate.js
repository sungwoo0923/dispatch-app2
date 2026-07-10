import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";

// 배차 프로그램(KPflow) 모바일의 업데이트 배너와 동일한 목적 — 새 버전을
// 배포해도 이미 열려있던 화면은 그 자리에서 저절로 최신 코드로 바뀌지
// 않는다(서비스워커가 백그라운드에서 새 버전을 받아둘 뿐). registerSW()의
// onNeedRefresh 콜백으로 그 시점을 감지해 배너를 띄우고, 사용자가
// "업데이트"를 누르면 새 서비스워커를 활성화한 뒤 새로고침한다.
let needRefresh = false;
let updateSW = null;
let swRegistration = null;
// 사용자가 배너를 "닫기"로 넘긴 뒤에도 5분 주기 검사가 같은 대기 중인
// 서비스워커를 다시 감지해 onNeedRefresh를 재호출하면, 방금 닫은 배너가
// 바로 또 뜨는 것처럼 보인다("수시로 알림이 뜬다"는 문의의 원인). 닫은
// 뒤 일정 시간은 같은 세션에서 재알림을 억제한다 — 새로고침하면 자연히
// 초기화되므로 진짜 새 배포가 있으면 다음 방문/새로고침 때는 다시 뜬다.
let dismissedUntil = 0;
const listeners = new Set();

function setNeedRefresh(value) {
  needRefresh = value;
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (Date.now() < dismissedUntil) return;
      setNeedRefresh(true);
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      swRegistration = registration;
      // 카카오톡 인앱 브라우저/일반 브라우저 탭/홈 화면에 설치한 아이콘은
      // 각자 독립된 서비스워커 캐시를 갖기 때문에, 어느 한 곳에서 열었을
      // 때 새 버전이 배포됐는지 "그 자리에서 바로" 확인해야 나머지 경로도
      // 금방 같은 버전으로 맞춰진다 — 예전에는 5분 주기/포커스 시에만
      // 확인해서, 짧게 열었다 닫는 카카오톡 인앱 브라우저 등에서는 배포된
      // 새 버전이 있어도 업데이트 배너가 뜰 기회조차 없었다.
      const check = () => registration.update().catch(() => {});
      check();
      setInterval(check, 5 * 60 * 1000);
      window.addEventListener("focus", check);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
  });
}

export function useAppUpdate() {
  const [state, setState] = useState(needRefresh);
  useEffect(() => {
    const listener = () => setState(needRefresh);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  // updateSW(true)는 대기 중인 서비스워커에 SKIP_WAITING을 보내고
  // controllerchange 이벤트에서 새로고침하는데, 그 이벤트가 어떤 이유로든
  // 안 뜨면("버튼을 눌러도 반응이 없다") 사용자 입장에선 버튼이 고장난
  // 것처럼 보인다. 일정 시간 안에 브라우저가 알아서 새로고침하지 않으면
  // 강제로 새로고침해 항상 눈에 보이는 결과가 나오게 한다.
  const applyUpdate = () => {
    updateSW?.(true);
    if (swRegistration?.waiting) {
      swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    setTimeout(() => window.location.reload(), 1200);
  };
  const dismiss = () => {
    dismissedUntil = Date.now() + 10 * 60 * 1000;
    setNeedRefresh(false);
  };

  // "업데이트 확인" 버튼을 직접 눌렀을 때 쓰는 함수 — 서버에 새 서비스워커가
  // 있는지 바로 확인해보고, 있으면 { hasUpdate: true }, 없으면(=지금이 최신
  // 버전) { hasUpdate: false }를 알려준다. 새 서비스워커 설치는 시간이 좀
  // 걸리므로 updatefound/설치완료 이벤트를 기다리되, 새 버전이 아예 없는
  // 경우엔 그 이벤트 자체가 안 뜨므로 일정 시간 후엔 "최신 버전"으로 판단한다.
  const checkForUpdate = () => {
    if (needRefresh) return Promise.resolve({ hasUpdate: true });
    if (!swRegistration) return Promise.resolve({ hasUpdate: false });
    return new Promise((resolve) => {
      let settled = false;
      const finish = (hasUpdate) => {
        if (settled) return;
        settled = true;
        swRegistration.removeEventListener("updatefound", onUpdateFound);
        resolve({ hasUpdate });
      };
      const onUpdateFound = () => {
        const installing = swRegistration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed") finish(true);
        });
      };
      swRegistration.addEventListener("updatefound", onUpdateFound);
      swRegistration.update().catch(() => finish(false));
      setTimeout(() => finish(needRefresh), 4000);
    });
  };

  return { needRefresh: state, applyUpdate, dismiss, checkForUpdate };
}
