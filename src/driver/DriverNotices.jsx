// ======================= src/driver/DriverNotices.jsx =======================
// 📢 기사 앱 공지사항(2026-11-03) — 회사가 공지 작성에서 공개 대상에 "기사"를 넣은 글만(같은 회사) · 최신순 · 읽기 전용
//  · 예약 게시(publishAt)가 아직 안 된 글은 보이지 않는다
//  · 홈 화면에 최근 3개, [전체 보기]로 모두. 누르면 본문(꾸민 글·이미지)
import React from "react";
import { createPortal } from "react-dom";
import { collection, onSnapshot, query, where, doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../firebase";
import { RichHtml } from "../richText";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const toMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);
const whenOf = (n) => Math.max(toMs(n.createdAt), Number(n.publishAt) || 0);
const md = (ms) => { if (!ms) return ""; const d = new Date(ms); return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };

export function useDriverNotices(companyName) {
  const [list, setList] = React.useState([]);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 60e3); return () => clearInterval(t); }, []);
  const [raw, setRaw] = React.useState([]);
  React.useEffect(() => {
    if (!companyName) { setRaw([]); return undefined; }
    return onSnapshot(query(collection(db, "notices"), where("companyName", "==", companyName), where("audiences", "array-contains", "driver")),
      (s) => setRaw(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRaw([]));
  }, [companyName]);
  React.useEffect(() => {
    const now = Date.now();
    setList(raw.filter((n) => (Number(n.publishAt) || 0) <= now).sort((a, b) => (b.pinned === true) - (a.pinned === true) || whenOf(b) - whenOf(a)));
  }, [raw, tick]);
  return list;
}

export default function DriverNotices({ companyName, uid }) {
  const list = useDriverNotices(companyName);
  const [all, setAll] = React.useState(false);
  const [open, setOpen] = React.useState(null);
  React.useEffect(() => {
    if (open && uid && !(open.readBy || []).includes(uid)) updateDoc(doc(db, "notices", open.id), { readBy: arrayUnion(uid) }).catch(() => {});
  }, [open, uid]);
  if (!list.length) return null;
  const unread = (n) => uid && !(n.readBy || []).includes(uid);
  const Row = ({ n, last }) => (
    <button type="button" onClick={() => setOpen(n)} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: "11px 2px", background: "none", border: "none", borderBottom: last ? "none" : "1px solid #EEF2F8", cursor: "pointer" }}>
      {n.pinned ? <span style={{ flexShrink: 0, fontSize: 13.5, fontWeight: 900, color: "#8FB0F0", background: "#0F1A30", borderRadius: 6, padding: "2px 6px" }}>고정</span>
        : n.category && n.category !== "공지사항" ? <span style={{ flexShrink: 0, fontSize: 13.5, fontWeight: 900, color: "#1B2B4B", background: "#EEF3FC", borderRadius: 6, padding: "2px 6px" }}>{n.category}</span> : null}
      <span style={{ flex: 1, minWidth: 0, fontSize: 16.5, fontWeight: unread(n) ? 900 : 700, color: unread(n) ? "#0F1A30" : "#3A4A66", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.title || "공지사항"}</span>
      {unread(n) && <span style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 8, background: "#1B2B4B", color: "#fff", fontSize: 12.5, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>N</span>}
      <span style={{ flexShrink: 0, fontSize: 14.5, fontWeight: 700, color: "#9AA9C3", fontFamily: MONO }}>{md(whenOf(n))}</span>
    </button>
  );
  const shown = all ? list : list.slice(0, 3);
  return (
    <div style={{ background: "white", borderRadius: 20, padding: "14px 16px 6px", marginBottom: 12, boxShadow: "0 1px 2px rgba(15,26,48,.04), 0 10px 28px rgba(15,26,48,.06)", border: "1px solid #E6EBF3" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: "0.22em", color: "#4B6CB7", fontFamily: MONO }}>NOTICE</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: "#0F1A30" }}>회사 공지사항 <span style={{ fontSize: 14.5, color: "#9AA9C3", fontWeight: 700 }}>{list.length}</span></div>
        </div>
        {list.length > 3 && <button type="button" onClick={() => setAll((v) => !v)} style={{ fontSize: 14.5, fontWeight: 800, color: "#2D4C82", background: "none", border: "none", cursor: "pointer" }}>{all ? "접기" : "전체 보기 ›"}</button>}
      </div>
      {shown.map((n, i) => <Row key={n.id} n={n} last={i === shown.length - 1} />)}
      {open && createPortal(
        <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 99990, background: "rgba(11,20,40,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "min(88vh, calc(100dvh - 32px))", overscrollBehavior: "contain", overflowY: "auto", background: "#fff", borderRadius: "22px 22px 0 0", paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div style={{ position: "sticky", top: 0, padding: "16px 18px", color: "#fff", background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)", display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: "0.24em", color: "#8FB0F0", fontFamily: MONO }}>NOTICE · {md(whenOf(open))}</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2, wordBreak: "break-word" }}>{open.title || "공지사항"}</div>
                <div style={{ fontSize: 14.5, color: "rgba(255,255,255,.6)", marginTop: 2 }}>{open.author || ""}{open.category ? ` · ${open.category}` : ""}</div>
              </div>
              <button type="button" onClick={() => setOpen(null)} aria-label="닫기" style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,.1)", border: "none", color: "#fff", fontWeight: 900, fontSize: 17 }}>✕</button>
            </div>
            <div style={{ padding: "18px 18px 24px" }}>
              <RichHtml html={open.contentHtml} text={open.content} className="text-[17px] text-[#1F2A44] leading-[1.85]" />
              {open.image && <img src={open.image} alt="" style={{ width: "100%", height: "auto", borderRadius: 16, marginTop: 14, border: "1px solid #E6EBF3" }} />}
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
}
