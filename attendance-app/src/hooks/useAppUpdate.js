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
      // 백그라운드에서도 새 버전이 배포됐는지 주기적으로/포커스 시 확인한다.
      const check = () => registration.update().catch(() => {});
      setInterval(check, 5 * 60 * 1000);
      window.addEventListener("focus", check);
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
