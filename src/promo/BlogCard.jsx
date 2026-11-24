// ======================= src/promo/BlogCard.jsx =======================
// 🖼 2026-11-23 블로그 카드 이미지(1080×1080) — 표지 · 실제 화면 · 핵심 정리 · 비교. marketing/blog/templates/card.html 과 같은 모양
//  화면에서 고치면 바로 보이고, cardToBlob 으로 JPG 를 만든다(html2canvas). 홈페이지 블로그 쪽은 GitHub 자동 작업이 card.html 로 같은 그림을 다시 만든다.
import React from "react";
import { createRoot } from "react-dom/client";
import { libUrl } from "./promoKit";
import { loadPromoFont } from "./promoPlayer";

export const CARD_KINDS = [["cover", "표지", "큰 제목 + 화면"], ["shot", "실제 화면", "제목 + 큰 화면"], ["points", "핵심 정리", "번호 4개"], ["vs", "비교", "엑셀 vs 로지스웹"]];
const imgOf = (p) => (!p ? "" : /^(https?:|\/|data:|blob:)/.test(p) ? p : libUrl(p));
function Hl({ text }) { return String(text || "").split(/(\*\*[^*]+\*\*)/).map((p, i) => { const m = p.match(/^\*\*([^*]+)\*\*$/); return m ? <span key={i} style={{ color: "#4F8BFF" }}>{m[1]}</span> : <React.Fragment key={i}>{p}</React.Fragment>; }); }

export function CardView({ c = {} }) {
  const kind = c.kind || "cover"; const cover = kind === "cover";
  const box = { position: "absolute", inset: 0 };
  return (
    <div style={{ width: 1080, height: 1080, position: "relative", overflow: "hidden", fontFamily: "Pretendard, 'Noto Sans KR', sans-serif", color: "#fff", letterSpacing: "-0.02em", wordBreak: "keep-all", background: "radial-gradient(120% 80% at 50% 0%, #1B2B4B 0%, #0F1A30 45%, #08101F 100%)" }}>
      <div style={{ ...box, backgroundImage: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
      <div style={{ position: "absolute", width: 800, height: 700, left: 140, top: 120, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(79,139,255,.35), rgba(79,139,255,0))" }} />
      <div style={{ ...box, padding: "90px 80px" }}>
        <span style={{ display: "inline-flex", padding: "10px 26px", borderRadius: 999, background: "linear-gradient(150deg,#22375F,#16264A)", border: "1px solid rgba(143,176,240,.35)", color: "#D3DFF5", fontWeight: 600, fontSize: 34 }}>{c.cat || "LogisWeb 블로그"}</span>
        <div style={{ fontSize: cover ? 76 : 86, fontWeight: 900, lineHeight: 1.2, marginTop: 34, whiteSpace: "pre-line" }}><Hl text={c.title} /></div>
        {c.sub && <div style={{ fontSize: 38, fontWeight: 600, color: "#D3DFF5", marginTop: 28, lineHeight: 1.45, whiteSpace: "pre-line" }}><Hl text={c.sub} /></div>}
        {kind === "points" && <div style={{ marginTop: 44, display: "flex", flexDirection: "column", gap: 18 }}>{(c.points || []).slice(0, 5).map((p, i) => (
          <div key={i} style={{ display: "flex", gap: 28, alignItems: "flex-start", padding: "22px 30px", borderRadius: 24, background: "linear-gradient(150deg,rgba(34,55,95,.9),rgba(22,38,74,.9))", border: "2px solid rgba(143,176,240,.25)" }}>
            <span style={{ flex: "none", width: 64, height: 64, borderRadius: "50%", background: "#2D5BD8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 900 }}>{i + 1}</span>
            <span style={{ fontSize: 37, fontWeight: 700, lineHeight: 1.35 }}><Hl text={p?.[0]} />{p?.[1] && <small style={{ display: "block", fontSize: 28, fontWeight: 500, color: "#D3DFF5", marginTop: 6 }}>{p[1]}</small>}</span>
          </div>))}</div>}
        {kind === "vs" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 50 }}>
          {[["a", c.aTitle || "엑셀 · 수작업", "😩", "rgba(255,90,95,.1)", "rgba(255,90,95,.4)"], ["b", c.bTitle || "LogisWeb", "✅", "rgba(43,209,126,.1)", "rgba(43,209,126,.5)"]].map(([k, tt, ic, bg, bd]) => (
            <div key={k} style={{ borderRadius: 26, padding: 34, fontSize: 34, lineHeight: 1.6, background: bg, border: `2px solid ${bd}` }}><div style={{ fontSize: 40, fontWeight: 800, marginBottom: 16 }}>{ic} {tt}</div>{(c[k] || []).map((x, i) => <div key={i}>{x}</div>)}</div>))}
        </div>}
      </div>
      {(cover || kind === "shot") && c.img && (
        <div style={{ position: "absolute", left: cover ? 120 : 80, right: cover ? 40 : 80, bottom: 150, borderRadius: 24, overflow: "hidden", background: "#fff", boxShadow: "0 40px 100px -20px rgba(0,0,0,.8), 0 0 0 2px rgba(143,176,240,.3)", transform: cover ? "rotate(-2deg)" : "none" }}>
          <div style={{ height: 38, background: "#1B2B4B", display: "flex", alignItems: "center", gap: 9, padding: "0 16px" }}>{["#FF5F57", "#FEBC2E", "#28C840"].map((x) => <i key={x} style={{ width: 12, height: 12, borderRadius: "50%", background: x, display: "block" }} />)}<b style={{ marginLeft: 10, fontWeight: 600, fontSize: 17, color: "#A9C0EC" }}>{c.label || "LogisWeb"}</b></div>
          <div style={{ height: cover ? 360 : 560, backgroundImage: `url("${imgOf(c.img)}")`, backgroundSize: c.zoom && c.zoom > 1 ? `${Math.round(c.zoom * 100)}% auto` : "cover", backgroundPosition: c.crop || "50% 0%", backgroundRepeat: "no-repeat", backgroundColor: "#fff" }} />
        </div>)}
      <div style={{ position: "absolute", left: 80, right: 80, bottom: 60, display: "flex", alignItems: "center", gap: 18, fontSize: 32, color: "#D3DFF5" }}>
        <img src="/brand/logisweb-mark.svg" alt="" style={{ width: 87, height: 41 }} />
        <span style={{ fontSize: 44, fontWeight: 900, color: "#fff", letterSpacing: "-0.04em" }}>Logis<span style={{ color: "#4F8BFF" }}>Web</span></span>
        <span>운송사 통합 TMS</span><span style={{ marginLeft: "auto", fontWeight: 700 }}>logisweb.co.kr</span>
      </div>
    </div>
  );
}
export function CardThumb({ c, size = 200, onClick, active }) {
  return <button type="button" onClick={onClick} style={{ width: size, height: size, overflow: "hidden", borderRadius: 12, outline: active ? "3px solid #D7BC82" : "1px solid rgba(143,176,240,.2)", flex: "none", position: "relative", display: "block" }}>
    <div style={{ transform: `scale(${size / 1080})`, transformOrigin: "0 0", width: 1080, height: 1080, pointerEvents: "none" }}><CardView c={c} /></div></button>;
}
// 카드 → JPG Blob
export async function cardToBlob(c, type = "image/jpeg") {
  await loadPromoFont();
  const { default: html2canvas } = await import("html2canvas");
  const host = document.createElement("div"); host.style.cssText = "position:fixed;left:-20000px;top:0;width:1080px;height:1080px;pointer-events:none"; document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await new Promise((res) => { root.render(<CardView c={c} />); setTimeout(res, 60); });
    const pre = c.img ? new Image() : null; if (pre) { pre.crossOrigin = "anonymous"; await new Promise((r) => { pre.onload = pre.onerror = r; pre.src = imgOf(c.img); setTimeout(r, 8000); }); }
    await Promise.all([...host.querySelectorAll("img")].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; setTimeout(r, 8000); }))));
    await document.fonts.ready;
    const cv = await html2canvas(host.firstChild, { width: 1080, height: 1080, scale: 1, useCORS: true, backgroundColor: "#08101F", logging: false });
    return await new Promise((r) => cv.toBlob(r, type, 0.9));
  } finally { root.unmount(); host.remove(); }
}
