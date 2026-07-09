import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";

// 배차 프로그램(KPflow) 모바일의 업데이트 배너와 동일한 목적 — 새 버전을
// 배포해도 이미 열려있던 화면은 그 자리에서 저절로 최신 코드로 바뀌지
// 않는다(서비스워커가 백그라운드에서 새 버전을 받아둘 뿐). registerSW()의
// onNeedRefresh 콜백으로 그 시점을 감지해 배너를 띄우고, 사용자가
// "업데이트"를 누르면 새 서비스워커를 활성화한 뒤 새로고침한다.
let needRefresh = false;
let updateSW = null;
const listeners = new Set();

function setNeedRefresh(value) {
  needRefresh = value;
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  updateSW = registerSW({
    onNeedRefresh() {
      setNeedRefresh(true);
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
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
  const applyUpdate = () => updateSW?.(true);
  const dismiss = () => setNeedRefresh(false);
  return { needRefresh: state, applyUpdate, dismiss };
}
