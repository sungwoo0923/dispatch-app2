// ======================= src/PlatformNoticeBanner.jsx =======================
// 📢 플랫폼 공지 띠 배너 — 관리자 관리센터 › 운영 › 플랫폼 공지에서 게시한 글을 운송사/화주사 화면 맨 위에 보여준다.
//  - 사용자가 닫으면(브라우저 기준) 같은 공지는 다시 뜨지 않는다
// ⭐ 2026-11-02 관리자센터2 — 대상(audience): all(전체) · carrier(전체 운송사) · shipper(전체 화주사) · selected(선택한 운송사 → targetCompanies[])
//  조회는 서버 규칙이 증명할 수 있는 조건으로 두 번 나눠 한다:
//   ① where("audience","in",["all","carrier"|"shipper"])  ② where("targetCompanies","array-contains", 우리 회사)
//  같은 글이 운송사 홈 › 공지사항 목록에도 "플랫폼 공지" 표시로 섞여 나온다(usePlatformNotices + toBoardNotice).
import React from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";

const DISMISS_KEY = "kpPlatformNoticeDismissed";
const readDismissed = () => { try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"); } catch { return []; } };
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const toMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);

// 지금 이 회사(운송사) 또는 화주사 화면에 보여 줄 플랫폼 공지 — 게시 중 + 종료일 전만
export function usePlatformNotices({ audience = "carrier", company = "" } = {}) {
  const [byAud, setByAud] = React.useState([]);
  const [byCo, setByCo] = React.useState([]);
  const co = String(company || "").trim();
  // ⭐ 2026-11-03 예약 게시 — 1분마다 다시 확인해 예약 시각이 되면 나타나게
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => { const t = setInterval(() => setTick((v) => v + 1), 60000); return () => clearInterval(t); }, []);
  React.useEffect(() => {
    const q = query(collection(db, "platformNotices"), where("audience", "in", ["all", audience === "shipper" ? "shipper" : "carrier"]));
    return onSnapshot(q, (s) => setByAud(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setByAud([]));
  }, [audience]);
  React.useEffect(() => {
    if (!co || audience === "shipper") { setByCo([]); return undefined; }
    const q = query(collection(db, "platformNotices"), where("targetCompanies", "array-contains", co));
    return onSnapshot(q, (s) => setByCo(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setByCo([]));
  }, [co, audience]);
  return React.useMemo(() => {
    const today = todayYmd(); const now = Date.now();
    const m = new Map();
    [...byAud, ...byCo].forEach((n) => {
      if (n.active === false || (n.endDate && n.endDate < today)) return;
      if ((n.publishAt || 0) > now) return; // 예약 시각 전(아직 안 보임)
      if (n.audience === "selected" && !(n.targetCompanies || []).includes(co)) return;
      m.set(n.id, n);
    });
    return [...m.values()].sort((a, b) => (b.publishAt || toMs(b.createdAt)) - (a.publishAt || toMs(a.createdAt)));
  }, [byAud, byCo, co, tick]);
}

// 회사 공지사항 목록(NoticeBoard)에 섞을 모양으로 — id 앞에 plat: 를 붙여 회사 공지와 섞이지 않게
export const toBoardNotice = (n) => ({
  ...n, id: `plat:${n.id}`, platformId: n.id, _platform: true,
  content: n.body || "", contentHtml: n.bodyHtml || "", category: n.level || "안내", author: n.author || "KP-Flow 운영팀",
  ...(n.publishAt ? { createdAt: n.publishAt } : {}), // 예약 게시는 게시 시각을 작성일로
  teams: [], targetUids: [], readBy: [], viewedBy: Array.isArray(n.viewedBy) ? n.viewedBy : [], audience: "platform", // ⭐ 2026-11-03 조회수(viewedBy) // ⭐ 2026-11-03 직원 지정 없음(우리 회사 직원 전체)
});
// 회사 공지 + 플랫폼 공지를 합친 목록(최신순)
export function useBoardNoticesWithPlatform(notices, company, dateOf) {
  const plat = usePlatformNotices({ audience: "carrier", company });
  return React.useMemo(() => {
    const extra = plat.filter((n) => n.board !== false).map((n) => { const b = toBoardNotice(n); return dateOf ? { ...b, date: dateOf(b.createdAt) } : b; });
    return [...extra, ...(notices || [])].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
  }, [plat, notices, dateOf]);
}

// "플랫폼 공지" 표시 — 네이비 바탕 + 금색 글씨 + KP 마크(회사 공지와 한눈에 구분)
export function PlatformBadge({ size = "sm" }) {
  const big = size === "lg";
  return (
    <span className={`shrink-0 inline-flex items-center gap-1 rounded-full whitespace-nowrap font-black ${big ? "h-7 pl-1 pr-2.5 text-[12.5px]" : "h-[22px] pl-0.5 pr-2 text-[11.5px]"}`}
      style={{ background: "linear-gradient(90deg,#0B1428,#1B2B4B)", color: "#E9C46A", boxShadow: "inset 0 0 0 1px rgba(233,196,106,.45)" }}>
      <span className={`inline-flex items-center justify-center rounded-full font-black ${big ? "w-5 h-5 text-[9.5px]" : "w-[18px] h-[18px] text-[8.5px]"}`} style={{ background: "#E9C46A", color: "#0B1428", letterSpacing: "-0.04em" }}>KP</span>
      플랫폼 공지
    </span>
  );
}

// ⭐ 2026-11-03 onOpen(id)을 주면 배너를 눌렀을 때 펼치지 않고 그 공지 글(홈 › 공지사항)로 바로 이동한다(운송사 PC).
//  onOpen이 없는 화면(화주사)은 예전처럼 펼쳐 보기.
export default function PlatformNoticeBanner({ audience = "carrier", company = "", onOpen }) {
  const all = usePlatformNotices({ audience, company });
  const [dismissed, setDismissed] = React.useState(readDismissed);
  const [open, setOpen] = React.useState(null);
  const items = all.filter((n) => n.banner !== false && !dismissed.includes(n.id));
  if (!items.length) return null;
  const n = items[0];
  const dismiss = () => {
    const next = [...dismissed, n.id].slice(-100);
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)); } catch { /* 무시 */ }
  };
  const strong = n.level === "중요" || n.level === "점검" || n.level === "긴급";
  return (
    <div className="relative text-white" style={{ background: strong ? "linear-gradient(90deg,#0B1428,#1B2B4B)" : "linear-gradient(90deg,#1B2B4B,#2D4C82)" }}>
      <div className="flex items-center gap-3 px-4 py-2 text-[13px]">
        <span className="shrink-0 px-2 py-0.5 rounded-md bg-white/10 border border-white/20 text-[10.5px] font-black tracking-[0.14em] text-[#8FB0F0]">{n.level || "안내"}</span>
        <button type="button" onClick={() => (onOpen ? onOpen(n.id) : setOpen(open === n.id ? null : n.id))} className="flex-1 min-w-0 text-left font-bold truncate">
          {n.title}{onOpen ? <span className="ml-2 text-white/50 font-semibold">공지 보기 ›</span> : n.body ? <span className="ml-2 text-white/50 font-semibold">{open === n.id ? "접기 ▲" : "자세히 ▼"}</span> : null}
        </button>
        {items.length > 1 && <span className="shrink-0 text-[11.5px] text-white/50">+{items.length - 1}</span>}
        <button type="button" onClick={dismiss} className="shrink-0 h-7 px-2.5 rounded-lg text-[12px] font-bold text-white/70 hover:text-white hover:bg-white/10">닫기 ✕</button>
      </div>
      {!onOpen && open === n.id && n.body && <div className="px-4 pb-3 text-[13px] leading-relaxed text-white/80 whitespace-pre-wrap">{n.body}</div>}
    </div>
  );
}
