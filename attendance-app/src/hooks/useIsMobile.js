import { useEffect, useState } from "react";

const BREAKPOINT = 768; // Tailwind's `md` — matches AdminLayout's existing sidebar breakpoint.

// 관리자 화면 전용: PC용 사이드바+테이블 트리와, 하단탭+카드 기반의 신규
// 모바일 전용 트리를 뷰포트 폭 기준으로 완전히 분기하기 위한 훅. 리사이즈에도
// 반응하므로(브라우저 창 크기 조절, 태블릿 회전 등) 새로고침 없이 전환된다.
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < BREAKPOINT);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return isMobile;
}
