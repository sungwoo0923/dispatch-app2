// ======================= src/BlankScreenGuard.jsx =======================
// 🧯 2026-11-16 빈 화면 지킴이 — 로그인한 뒤 화면이 아무것도 없이 하얗게만 남는 경우(태블릿 크롬에서 신고 · 카톡 브라우저는 정상)
//  · 화면 가운데 몇 곳을 짚어 봐서 6초 넘게 아무것도 없으면(body · #root만 보이면) 안내 카드를 띄운다
//  · 그때 화면 상태(주소 · 화면 폭 · PC/모바일 판정 · 저장된 설정 이름 · 맨 위 상자들)를 관리센터 › 오류 신고로 한 번 자동으로 보낸다
//    → 어느 기기의 어떤 저장값 때문에 비었는지 바로 찾을 수 있다
//  · [새로고침] · [화면 기억 지우고 다시 열기](로그인 · 회사 선택 · 배포 버전 기억은 남긴다)
import React from "react";

const KEEP = /^(firebase|loginCompany$|userCompany$|kpPin|kpDriverApp$|kpApkStaff$|driverLoginKeys$)/; // 🔒 2026-11-27 driverLoginKeys = 기사 로그인 열쇠(지우면 문자 인증을 다시 해야 함)
const isEmptyHit = (el) => !el || el === document.body || el === document.documentElement || el.id === "root";

function looksBlank() {
  const w = window.innerWidth, h = window.innerHeight;
  if (!w || !h || document.visibilityState !== "visible") return false;
  const pts = [[w / 2, h / 2], [w / 2, h / 4], [w / 4, h / 2], [(3 * w) / 4, h / 2], [w / 2, (3 * h) / 4]];
  return pts.every(([x, y]) => isEmptyHit(document.elementFromPoint(x, y)));
}

function boxInfo(el, depth = 0, out = []) {
  if (!el || out.length > 24) return out;
  for (const c of el.children) {
    if (out.length > 24) break;
    const cs = getComputedStyle(c); const r = c.getBoundingClientRect();
    out.push(`${"  ".repeat(depth)}${c.tagName.toLowerCase()}${c.id ? "#" + c.id : ""}${c.className && typeof c.className === "string" ? "." + c.className.trim().split(/\s+/).slice(0, 4).join(".") : ""} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}] d=${cs.display} o=${cs.opacity} v=${cs.visibility}${cs.zoom && cs.zoom !== "1" ? " z=" + cs.zoom : ""}${cs.transform !== "none" ? " t=" + cs.transform.slice(0, 40) : ""}`);
    if (depth < 2) boxInfo(c, depth + 1, out);
  }
  return out;
}

function diagnose(extra) {
  const keys = (s) => { try { return Object.keys(s).filter((k) => !/^firebase/.test(k)).sort().join(", "); } catch { return "?"; } };
  const meta = document.querySelector('meta[name="viewport"]');
  return [
    `path=${location.pathname}${location.search}`,
    `win=${window.innerWidth}x${window.innerHeight} screen=${screen.width}x${screen.height} dpr=${window.devicePixelRatio} touch=${navigator.maxTouchPoints} platform=${navigator.platform}`,
    `vv=${window.visualViewport ? `${Math.round(window.visualViewport.width)}x${Math.round(window.visualViewport.height)}@${window.visualViewport.scale}` : "-"} viewport="${meta?.content || ""}"`,
    `layout=${JSON.stringify(extra || {})} rootZoom=${document.getElementById("root")?.style.zoom || ""}`,
    `local: ${keys(localStorage)}`,
    `session: ${keys(sessionStorage)}`,
    "boxes:",
    ...boxInfo(document.getElementById("root")),
  ].join("\n");
}

export default function BlankScreenGuard({ active, info }) {
  const [blank, setBlank] = React.useState(false);
  const [code, setCode] = React.useState("");
  const sentRef = React.useRef(false);
  const infoRef = React.useRef(info); infoRef.current = info;
  React.useEffect(() => {
    if (!active) { setBlank(false); return undefined; }
    let hits = 0;
    const tick = () => {
      if (looksBlank()) { hits += 1; if (hits >= 3) setBlank(true); } else { hits = 0; setBlank(false); }
    };
    let iv = null;
    const start = setTimeout(() => { tick(); iv = setInterval(tick, 2000); }, 4000);
    return () => { clearTimeout(start); clearInterval(iv); };
  }, [active]);
  React.useEffect(() => {
    if (!blank || sentRef.current) return;
    sentRef.current = true;
    try { if (sessionStorage.getItem("kpBlankSent") === location.pathname) return; sessionStorage.setItem("kpBlankSent", location.pathname); } catch { /* 무시 */ }
    const err = new Error("빈 화면(로그인 후 아무것도 안 보임)");
    err.stack = diagnose(infoRef.current);
    import("./errorReport").then(({ sendErrorReport }) => sendErrorReport(err, "빈 화면 자동 신고")).then((c) => setCode(c)).catch(() => {});
  }, [blank]);
  if (!blank) return null;
  const resetView = () => {
    try { sessionStorage.clear(); } catch { /* 무시 */ }
    try { Object.keys(localStorage).forEach((k) => { if (!KEEP.test(k)) localStorage.removeItem(k); }); } catch { /* 무시 */ }
    window.location.replace("/app");
  };
  return (
    <div data-kp-blank-guard className="fixed inset-0 z-[2147482000] flex items-center justify-center p-5" style={{ background: "#F4F6FA" }}>
      <div className="w-full max-w-[400px] rounded-2xl bg-white shadow-[0_16px_40px_rgba(15,26,48,0.16)] p-6 text-center">
        <div className="text-[18px] font-black text-[#0F1A30]">화면이 비어 있어요</div>
        <p className="mt-2 text-[14px] leading-relaxed text-[#5B6B85]">
          새로고침해 보고, 그래도 비어 있으면 <b className="text-[#0F1A30]">화면 기억 지우기</b>를 눌러 주세요.<br />
          로그인과 회사 선택은 그대로 남아요.
        </p>
        <div className="mt-5 grid gap-2">
          <button type="button" onClick={() => window.location.reload()} className="h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black">새로고침</button>
          <button type="button" onClick={resetView} className="h-12 rounded-xl border border-[#DCE3EE] text-[#0F1A30] text-[15px] font-bold">화면 기억 지우고 다시 열기</button>
        </div>
        {code && <div className="mt-4 text-[12.5px] font-bold text-[#7A879C]">관리센터에 자동으로 알렸어요 · 오류 번호 <b className="font-mono tracking-wider text-[#0F1A30]">{code}</b></div>}
      </div>
    </div>
  );
}
