// src/useNarrow.js
// ⭐ 2026-11-06 휴대폰 폭(기본 640px 이하)인지 — PC 화면을 모바일 앱 안에서 그대로 쓸 때(kp-m-pc)
//   넓은 표 대신 카드 목록으로 바꿔 그리는 데 쓴다(가로 스크롤 없이 전부 보이게).
import React from "react";

const q = (w) => `(max-width: ${w}px)`;
export function isNarrowNow(w = 640) {
  try { return window.matchMedia(q(w)).matches; } catch { return false; }
}
export default function useNarrow(w = 640) {
  const [n, setN] = React.useState(() => isNarrowNow(w));
  React.useEffect(() => {
    let mq;
    try { mq = window.matchMedia(q(w)); } catch { return undefined; }
    const h = () => setN(mq.matches);
    h();
    if (mq.addEventListener) mq.addEventListener("change", h); else mq.addListener(h);
    return () => { if (mq.removeEventListener) mq.removeEventListener("change", h); else mq.removeListener(h); };
  }, [w]);
  return n;
}
