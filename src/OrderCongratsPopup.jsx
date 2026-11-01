// ======================= src/OrderCongratsPopup.jsx =======================
// 🎉 인사발령 안내 창(2026-11-01) — 승진·부서 이동 등 발령을 받은 사람이 프로그램(PC·모바일)에
//  처음 들어왔을 때 딱 한 번 띄운다. 인사관리부 › 인사발령에서 발송하면 users/{uid}.orderNotice 가 생기고,
//  [확인]을 누르면 orderNotice.seen = true 로 바뀌어 다시 뜨지 않는다(다른 기기에서도).
//  · 승진: 축하 메시지  · 전보(부서 이동): 새 출발 응원  · 직책·권한 변경: 새 역할 응원
import React from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const GOLD = "#E9C46A";

function pick(kind) {
  const k = String(kind || "");
  if (k.includes("승진")) return "promo";
  if (k.includes("전보")) return "move";
  return "role";
}

function message(n, name) {
  const who = `${name || ""}${n.toPos && n.toPos !== "-" ? ` ${n.toPos}` : ""}님`;
  const co = n.company || "";
  const team = n.toTeam && n.toTeam !== "미배정" ? n.toTeam : "";
  switch (pick(n.kind)) {
    case "promo":
      return {
        en: "CONGRATULATIONS",
        head: "승진을 진심으로 축하드립니다",
        lines: [
          `${who}, 그동안 묵묵히 쌓아 오신 노력과 책임감이 오늘의 결실로 이어졌습니다.`,
          "함께 일하는 동료들이 누구보다 기뻐하고 있습니다. 새로운 자리에서도 지금처럼 든든한 모습으로 함께해 주세요.",
          "앞으로의 더 큰 활약을 응원합니다.",
        ],
        sign: `${co} 임직원 일동`,
      };
    case "move":
      return {
        en: "NEW START",
        head: `${team ? `${team}에 오신 것을` : "새 부서에 오신 것을"} 환영합니다`,
        lines: [
          `${who}, 새로운 팀에서의 출발을 진심으로 응원합니다.`,
          "지금까지 쌓아 온 경험은 새 팀에서도 큰 힘이 될 것입니다. 낯선 업무가 있으면 언제든 동료들에게 편하게 물어봐 주세요.",
          "새로운 자리에서의 활약을 기대합니다.",
        ],
        sign: `${co} 임직원 일동`,
      };
    default:
      return {
        en: "NEW ROLE",
        head: "새로운 역할을 응원합니다",
        lines: [
          `${who}, 이번 발령으로 새로운 역할을 맡게 되셨습니다.`,
          "바뀐 메뉴와 권한은 지금부터 바로 적용됩니다. 새 자리에서도 좋은 성과 기대하겠습니다.",
        ],
        sign: `${co} 임직원 일동`,
      };
  }
}

// 금빛·남색 조각이 천천히 떨어지는 배경(승진일 때만)
function Confetti() {
  const pieces = React.useMemo(() => Array.from({ length: 34 }, (_, i) => ({
    left: (i * 37) % 100, delay: (i % 9) * 0.35, dur: 3.2 + (i % 5) * 0.5, w: 6 + (i % 3) * 3, rot: (i * 47) % 360,
    c: ["#E9C46A", "#F4E2A8", "#8FB0F0", "#FFFFFF", "#C9A24B"][i % 5],
  })), []);
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {pieces.map((p, i) => (
        <span key={i} style={{ position: "absolute", top: -16, left: `${p.left}%`, width: p.w, height: p.w * 1.6, background: p.c, borderRadius: 2, opacity: 0.85, transform: `rotate(${p.rot}deg)`, animation: `kpcf ${p.dur}s linear ${p.delay}s infinite` }} />
      ))}
    </div>
  );
}

export default function OrderCongratsPopup({ uid, profile, mobile = false }) {
  const n = profile?.orderNotice;
  const lsKey = n?.at ? `kpOrderSeen:${uid}:${n.at}` : "";
  const [closed, setClosed] = React.useState(false);
  const seenHere = (() => { try { return lsKey && localStorage.getItem(lsKey) === "1"; } catch { return false; } })();
  const show = !!(uid && n && !n.seen && !seenHere && !closed);

  const close = React.useCallback(() => {
    setClosed(true);
    try { if (lsKey) localStorage.setItem(lsKey, "1"); } catch { /* 무시 */ }
    updateDoc(doc(db, "users", uid), { "orderNotice.seen": true, "orderNotice.seenAt": Date.now() }).catch(() => {});
  }, [uid, lsKey]);

  React.useEffect(() => {
    if (!show) return undefined;
    const k = (e) => { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); close(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [show, close]);

  if (!show) return null;
  const m = message(n, profile?.name);
  const promo = pick(n.kind) === "promo";
  const chg = (a, b) => a && b && a !== b;
  const rows = [
    chg(n.fromTeam, n.toTeam) ? ["부서", n.fromTeam, n.toTeam] : null,
    chg(n.fromPos, n.toPos) ? ["직책", n.fromPos, n.toPos] : null,
    chg(n.fromRole, n.toRole) ? ["권한", n.fromRole, n.toRole] : null,
  ].filter(Boolean);

  return (
    <div data-kp-dialog style={{ position: "fixed", inset: 0, zIndex: 2147483600, background: "rgba(8,14,30,.62)", backdropFilter: "blur(3px)", display: "flex", alignItems: mobile ? "flex-end" : "center", justifyContent: "center", padding: mobile ? 0 : 16, fontFamily: "'Noto Sans KR',sans-serif" }}>
      <style>{"@keyframes kpcf{0%{transform:translateY(0) rotate(0)}100%{transform:translateY(560px) rotate(540deg)}}@keyframes kpop{from{transform:translateY(14px) scale(.97);opacity:0}to{transform:none;opacity:1}}"}</style>
      <div role="dialog" aria-modal="true" aria-label={m.head} style={{ width: mobile ? "100%" : "min(480px,100%)", maxHeight: "92vh", overflowY: "auto", borderRadius: mobile ? "24px 24px 0 0" : 24, background: "#fff", boxShadow: "0 36px 90px rgba(8,14,30,.5)", animation: "kpop .22s ease-out" }}>
        <div style={{ position: "relative", padding: "30px 26px 26px", color: "#fff", textAlign: "center", background: "radial-gradient(120% 90% at 50% 0%,#2D4C82 0%,#1B2B4B 48%,#0B1428 100%)", overflow: "hidden" }}>
          {promo ? <Confetti /> : null}
          <div style={{ position: "relative" }}>
            <div style={{ width: 64, height: 64, margin: "0 auto 14px", borderRadius: 999, display: "grid", placeItems: "center", background: "rgba(233,196,106,.14)", border: `1.5px solid ${GOLD}` }}>
              {promo ? (
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z" /><path d="M5 21h14" /></svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
              )}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.32em", color: GOLD }}>{m.en}</div>
            <div style={{ fontSize: mobile ? 21 : 23, fontWeight: 900, marginTop: 6, lineHeight: 1.35, wordBreak: "keep-all" }}>{m.head}</div>
            <div style={{ marginTop: 8, fontSize: 13.5, fontWeight: 700, color: "#C9D6EE" }}>
              {profile?.name || ""}{n.toPos && n.toPos !== "-" ? ` ${n.toPos}` : ""}{n.toTeam && n.toTeam !== "미배정" ? ` · ${n.toTeam}` : ""}
            </div>
          </div>
        </div>

        <div style={{ padding: "20px 24px 6px" }}>
          {rows.length ? (
            <div style={{ border: "1px solid #E4EAF4", borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
              {rows.map(([l, a, b]) => (
                <div key={l} style={{ display: "grid", gridTemplateColumns: "52px 1fr 20px 1fr", alignItems: "center", gap: 6, padding: "11px 14px", borderBottom: "1px solid #F0F3F8", fontSize: 14 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 900, color: "#7A8BA8" }}>{l}</span>
                  <span style={{ color: "#9AA9C3", fontWeight: 700, textDecoration: "line-through", textAlign: "right", wordBreak: "keep-all" }}>{a}</span>
                  <span style={{ color: "#C9A24B", fontWeight: 900, textAlign: "center" }}>→</span>
                  <span style={{ color: "#0F1A30", fontWeight: 900, wordBreak: "keep-all" }}>{b}</span>
                </div>
              ))}
              {n.date ? <div style={{ padding: "9px 14px", fontSize: 12, fontWeight: 700, color: "#5B6B87", background: "#F7F9FC" }}>시행일 {n.date}{n.docNo ? ` · ${n.docNo}` : ""}</div> : null}
            </div>
          ) : null}
          <div style={{ fontSize: 14.5, lineHeight: 1.8, color: "#2A3A56", fontWeight: 600, wordBreak: "keep-all" }}>
            {m.lines.map((t, i) => <p key={i} style={{ margin: i ? "8px 0 0" : 0 }}>{t}</p>)}
          </div>
          <div style={{ marginTop: 14, textAlign: "right", fontSize: 13, fontWeight: 900, color: "#1B2B4B" }}>{m.sign}</div>
        </div>
        <div style={{ padding: `16px 24px ${mobile ? "calc(20px + env(safe-area-inset-bottom))" : "22px"}` }}>
          <button type="button" autoFocus onClick={close} style={{ width: "100%", height: 50, borderRadius: 14, border: "none", cursor: "pointer", outline: "none", fontSize: 15.5, fontWeight: 900, color: "#0B1428", background: `linear-gradient(120deg,${GOLD},#F4E2A8)`, boxShadow: "0 10px 24px rgba(201,162,75,.35)" }}>
            {promo ? "감사합니다" : "확인"}
          </button>
        </div>
      </div>
    </div>
  );
}
