// ======================= src/PlatformNoticeBanner.jsx =======================
// 📢 플랫폼 공지 띠 배너 — 관리자 관리센터 › 운영 › 플랫폼 공지에서 게시한 글을 운송사/화주사 화면 맨 위에 보여준다.
//  - 사용자가 닫으면(브라우저 기준) 같은 공지는 다시 뜨지 않는다
import React from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";

const DISMISS_KEY = "kpPlatformNoticeDismissed";
const readDismissed = () => { try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"); } catch { return []; } };
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export default function PlatformNoticeBanner({ audience = "carrier" }) {
  const [list, setList] = React.useState([]);
  const [dismissed, setDismissed] = React.useState(readDismissed);
  const [open, setOpen] = React.useState(null);
  React.useEffect(() => {
    const q = query(collection(db, "platformNotices"), where("active", "==", true));
    return onSnapshot(q, (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([]));
  }, []);
  const today = todayYmd();
  const items = list.filter((n) => (!n.audience || n.audience === "all" || n.audience === audience) && !(n.endDate && n.endDate < today) && !dismissed.includes(n.id));
  if (!items.length) return null;
  const n = items[0];
  const dismiss = () => {
    const next = [...dismissed, n.id].slice(-100);
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)); } catch { /* 무시 */ }
  };
  const strong = n.level === "중요" || n.level === "점검";
  return (
    <div className="relative text-white" style={{ background: strong ? "linear-gradient(90deg,#0B1428,#1B2B4B)" : "linear-gradient(90deg,#1B2B4B,#2D4C82)" }}>
      <div className="flex items-center gap-3 px-4 py-2 text-[13px]">
        <span className="shrink-0 px-2 py-0.5 rounded-md bg-white/10 border border-white/20 text-[10.5px] font-black tracking-[0.14em] text-[#8FB0F0]">{n.level || "안내"}</span>
        <button type="button" onClick={() => setOpen(open === n.id ? null : n.id)} className="flex-1 min-w-0 text-left font-bold truncate">
          {n.title}{n.body ? <span className="ml-2 text-white/50 font-semibold">{open === n.id ? "접기 ▲" : "자세히 ▼"}</span> : null}
        </button>
        {items.length > 1 && <span className="shrink-0 text-[11.5px] text-white/50">+{items.length - 1}</span>}
        <button type="button" onClick={dismiss} className="shrink-0 h-7 px-2.5 rounded-lg text-[12px] font-bold text-white/70 hover:text-white hover:bg-white/10">닫기 ✕</button>
      </div>
      {open === n.id && n.body && <div className="px-4 pb-3 text-[13px] leading-relaxed text-white/80 whitespace-pre-wrap">{n.body}</div>}
    </div>
  );
}
