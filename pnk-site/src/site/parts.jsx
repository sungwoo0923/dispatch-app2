// ======================= pnk-site/src/site/parts.jsx =======================
// 공식 홈페이지 공용 조각 — 나타나기 · 화살표 · 사진 · 작은 영문 제목 · 아래쪽 문의 띠
import React from "react";
import { Link, useLocation } from "react-router-dom";

export function useReveal() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    const els = Array.from(document.querySelectorAll(".pk .rv:not(.in)"));
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return undefined; }
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [pathname]);
}

export function Arrow({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

export function Photo({ src, alt = "", className = "", ratio, eager, imgClass = "" }) {
  return (
    <div className={`photo ${className}`} style={ratio ? { aspectRatio: ratio } : undefined}>
      <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" className={imgClass} />
    </div>
  );
}

export function Eyebrow({ children, light }) {
  return <div className="eng" style={{ fontSize: 13, fontWeight: 600, color: light ? "#F3DDB8" : "var(--oak)" }}>{children}</div>;
}

// 아래쪽 공통 — 문의 안내 띠
export function CtaBand() {
  return (
    <section className="py-20 md:py-28" style={{ background: "var(--ink)", color: "var(--ivory)" }}>
      <div className="wrap grid md:grid-cols-[1.4fr_1fr] gap-10 items-end">
        <div className="rv">
          <Eyebrow light>Let’s build together</Eyebrow>
          <h2 className="serif t-1 mt-5">머릿속에만 있던 프로그램,<br />이제 현장에서 쓰게 만들어 드릴게요.</h2>
        </div>
        <div className="rv d1 md:text-right">
          <p className="text-[15px] leading-[1.85]" style={{ color: "#D9CFC0" }}>지금 손으로 하고 있는 일, 엑셀로 버티는 업무,<br className="hidden md:block" />만들고 싶은 앱이 있다면 편하게 이야기해 주세요.</p>
          <Link to="/contact" className="btn btn-light mt-7">프로젝트 문의하기 <Arrow /></Link>
        </div>
      </div>
    </section>
  );
}

