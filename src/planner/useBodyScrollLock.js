// src/planner/useBodyScrollLock.js — 팝업(Modal/Sheet)이 떠 있는 동안 뒤쪽 화면이
// 같이 스크롤되던 문제를 막는다. 단순히 overflow:hidden만 주면 iOS Safari에서는
// 여전히 뒤가 스크롤되는 경우가 있어서, body를 position:fixed로 고정하고 나중에
// 원래 스크롤 위치로 되돌리는 방식을 쓴다.
import { useEffect } from "react";

export default function useBodyScrollLock() {
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);
}
