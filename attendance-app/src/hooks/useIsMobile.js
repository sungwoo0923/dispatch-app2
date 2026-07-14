import { useEffect, useState } from "react";

const BREAKPOINT = 768; // Tailwind's `md` — matches AdminLayout's existing sidebar breakpoint.

// 관리자 화면 전용: PC용 사이드바+테이블 트리와, 하단탭+카드 기반의 신규
// 모바일 전용 트리를 뷰포트 폭 기준으로 완전히 분기하기 위한 훅. 리사이즈에도
// 반응하므로(브라우저 창 크기 조절, 태블릿 회전 등) 새로고침 없이 전환된다.
// 가로/세로 중 짧은 변 기준으로 판정 — 휴대폰을 가로모드로 돌리면 폭이
// 768을 넘는 경우가 많아 innerWidth만 보면 PC 레이아웃으로 잘못 전환되던 문제 방지.
function computeIsMobile() {
  if (typeof window === "undefined") return false;
  return Math.min(window.innerWidth, window.innerHeight) < BREAKPOINT;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(computeIsMobile);

  useEffect(() => {
    const onChange = () => setIsMobile(computeIsMobile());
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
    };
  }, []);

  return isMobile;
}
