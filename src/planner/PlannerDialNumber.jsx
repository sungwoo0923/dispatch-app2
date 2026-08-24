// src/planner/PlannerDialNumber.jsx — "다이얼(오도미터)"처럼 숫자가 굴러가며 나타나는
// 금액 표시. 값이 바뀔 때마다 이전 값에서 새 값까지 짧게 애니메이션한다.
import React, { useEffect, useRef, useState } from "react";

export default function PlannerDialNumber({ value, suffix = "원", duration = 650, className, style }) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <span className={className} style={style}>
      {display.toLocaleString("ko-KR")}{suffix}
    </span>
  );
}
