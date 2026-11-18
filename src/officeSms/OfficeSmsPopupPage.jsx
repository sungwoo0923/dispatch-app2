// ======================= src/officeSms/OfficeSmsPopupPage.jsx =======================
// 💬 2026-11-18 사내문자 별도 창(/sms-window) — 배차 프로그램 창에서 [별도 창으로]를 눌러 연 경우에만 열린다
//  · 2차 인증까지 통과한 프로그램 창(opener)과 같은 계정인지 확인한다(주소를 직접 쳐서 들어오면 안내만)
//  · 이름표(기사 · 오더 기사)는 프로그램 창에서 받아 온다(BroadcastChannel)
import React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { useOfficeSmsData } from "./OfficeSmsWindow";
import { smsChannel, postSms, setWinMode } from "./officeSmsPopup";
import OfficeSmsPanel from "./OfficeSmsPanel";

function openerUid() {
  try {
    const o = window.opener;
    if (!o || o.closed || o.location.origin !== window.location.origin) return "";
    return o.__kpAuth?.currentUser?.uid || "";
  } catch { return ""; }
}

function Notice({ title, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#061832 0%,#0B2554 50%,#0D2B66 100%)", fontFamily: "'Pretendard','Noto Sans KR',sans-serif", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 22, padding: "26px 26px 22px", maxWidth: 380, textAlign: "center", boxShadow: "0 30px 80px rgba(0,0,0,.35)" }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#0F1A30" }}>{title}</div>
        <div style={{ fontSize: 13.5, color: "#5B6B85", marginTop: 8, lineHeight: 1.7 }}>{children}</div>
        <button type="button" onClick={() => window.close()} style={{ marginTop: 18, height: 42, padding: "0 22px", borderRadius: 12, border: "none", background: "#1B2B4B", color: "#fff", fontWeight: 900, cursor: "pointer" }}>창 닫기</button>
      </div>
    </div>
  );
}

export default function OfficeSmsPopupPage() {
  const [user, setUser] = React.useState(undefined);
  const [book, setBook] = React.useState({ book: {}, kinds: {} });
  const [openReq, setOpenReq] = React.useState(() => {
    try { const u = new URLSearchParams(window.location.search); const p = u.get("peer"); return p ? { peer: p, name: u.get("name") || "", ts: Date.now() } : null; } catch { return null; }
  });
  const [focused, setFocused] = React.useState(true);
  const [size, setSize] = React.useState({ w: window.innerWidth });
  React.useEffect(() => onAuthStateChanged(auth, (u) => setUser(u || null)), []);
  React.useEffect(() => {
    document.title = "사내문자 · LogisWeb";
    const ch = smsChannel(); if (!ch) return undefined;
    const h = (e) => {
      const d = e.data || {};
      if (d.type === "book") setBook({ book: d.book || {}, kinds: d.kinds || {} });
      if (d.type === "open" && d.peer) { setOpenReq({ peer: d.peer, name: d.name || "", ts: Date.now() }); try { window.focus(); } catch { /* 무시 */ } }
    };
    ch.addEventListener("message", h);
    postSms({ type: "hello" });
    return () => ch.removeEventListener("message", h);
  }, []);
  React.useEffect(() => {
    const f = () => setFocused(document.visibilityState === "visible");
    const r = () => setSize({ w: window.innerWidth });
    document.addEventListener("visibilitychange", f); window.addEventListener("resize", r);
    return () => { document.removeEventListener("visibilitychange", f); window.removeEventListener("resize", r); };
  }, []);
  const uid = user?.uid || "";
  const data = useOfficeSmsData(uid);
  const [allowed] = React.useState(() => openerUid());

  if (user === undefined) return <div style={{ position: "fixed", inset: 0, background: "#0B1428" }} />;
  if (!user) return <Notice title="로그인이 필요해요">배차 프로그램에 로그인한 뒤, 사내문자 창에서 [별도 창으로]를 눌러 열어 주세요.</Notice>;
  if (!allowed || allowed !== uid) return <Notice title="프로그램에서 열어 주세요">보안을 위해 사내문자 별도 창은 배차 프로그램 화면의 사내문자 창 → [별도 창으로] 버튼으로만 열려요.</Notice>;

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <OfficeSmsPanel uid={uid} box={data.box} msgs={data.msgs} loadErr={data.loadErr} book={book.book} kinds={book.kinds}
        route={data.route} onRoute={data.changeRoute} winMode="popup" onWinMode={(v) => { setWinMode(v); if (v === "float") window.close(); }}
        variant={size.w < 760 ? "float" : "page"} width={size.w} openReq={openReq} active={focused} />
    </div>
  );
}
