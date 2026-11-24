// ======================= src/CompanySwitcher.jsx =======================
// 🔀 2026-11-19 운송사 전환(최고관리자 · 부관리자만) — 로그아웃 없이 다른 운송사 화면으로 바로(사용자 요청)
//  들어가는 곳: 상단 회사 · 이름 칸(▾) › [운송사 전환] (UserHub)
//  고르면 로그인 때와 같은 방법으로 회사를 바꾼다: localStorage loginCompany · userCompany → kp:loginCompany → 새로 고침
//  (화면 곳곳이 loginCompany 를 그릴 때 읽어서, 새로 고쳐야 모든 목록 · 구독이 새 회사로 다시 잡힌다)
//  회사 목록: publicCompanies(승인된 운송사 — 최고관리자가 로그인할 때 채운다)
import React from "react";
import { createPortal } from "react-dom";
import { readPublicCompanies } from "./publicCompanies";
import { confirmLeave } from "./leaveGuard";

const RECENT = "kpRecentCompanies";
const readRecent = () => { try { const v = JSON.parse(localStorage.getItem(RECENT) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };

export function switchCompany(co) {
  const name = String(co || "").trim();
  if (!name) return;
  try {
    localStorage.setItem("loginCompany", name);
    localStorage.setItem("userCompany", name);
    localStorage.setItem(RECENT, JSON.stringify([name, ...readRecent().filter((x) => x !== name)].slice(0, 6)));
    sessionStorage.removeItem("kpEntry");
  } catch { /* 무시 */ }
  window.dispatchEvent(new CustomEvent("kp:loginCompany", { detail: name }));
  setTimeout(() => window.location.reload(), 60);
}

export default function CompanySwitcher({ current = "", onClose }) {
  const [list, setList] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    readPublicCompanies().then((rows) => setList([...new Set(rows.map((r) => String(r.companyName || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"))))
      .catch((e) => { setErr(e.message || "목록을 불러오지 못했어요"); setList([]); });
  }, []);
  React.useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose?.(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const recent = readRecent().filter((x) => x !== current && (!list || list.includes(x)));
  const kw = q.trim().toLowerCase();
  const shown = (list || []).filter((c) => !kw || c.toLowerCase().includes(kw));
  const go = async (c) => {
    if (c === current) { onClose?.(); return; }
    if (!(await confirmLeave())) return;
    switchCompany(c);
  };
  // 이름을 직접 쳐서(목록에 아직 없는 회사) 들어가기
  const typed = q.trim() && !shown.some((c) => c === q.trim()) ? q.trim() : "";
  const Row = ({ c, tag }) => (
    <button type="button" onClick={() => go(c)} className={`w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-[#F4F6FA] ${c === current ? "bg-[#EEF3FC]" : ""}`} data-kp="co-switch-item">
      <span className="w-8 h-8 rounded-lg grid place-items-center text-[13px] font-black text-white shrink-0" style={{ background: "linear-gradient(135deg,#0F1A30,#2D4C82)" }}>{c.slice(0, 1)}</span>
      <span className="flex-1 min-w-0 text-[14.5px] font-bold text-[#0F1A30] truncate">{c}</span>
      {c === current ? <span className="text-[12px] font-black text-[#2D4C82]">지금 보는 회사</span> : tag ? <span className="text-[11.5px] font-bold text-[#9AA9C3]">{tag}</span> : null}
    </button>
  );
  return createPortal(
    <div className="fixed inset-0 z-[2147483200] bg-[#0B1428]/55 backdrop-blur-[2px] grid place-items-center p-4" onClick={onClose} data-kp="co-switch">
      <div className="w-full max-w-[440px] max-h-[80vh] rounded-[24px] bg-white overflow-hidden shadow-[0_24px_60px_rgba(15,26,48,0.35)] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-4 text-white shrink-0" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
          <div className="text-[11.5px] font-extrabold tracking-[0.16em] text-[#8FB0F0]">ADMIN · SWITCH COMPANY</div>
          <div className="mt-0.5 text-[20px] font-black">운송사 전환</div>
          <div className="mt-1 text-[13px] font-bold text-white/70">고르면 로그아웃 없이 그 운송사 화면으로 바로 바뀌어요. 최고관리자 · 부관리자만 보여요.</div>
        </div>
        <div className="px-4 pt-3 pb-2 shrink-0">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="운송사 이름 찾기" className="h-11 w-full px-4 rounded-xl border border-[#DCE3EE] text-[15px] font-bold text-[#0F1A30] outline-none focus:border-[#2D4C82]" data-kp="co-switch-q" />
        </div>
        <div className="overflow-y-auto pb-2 min-h-[120px]">
          {list === null && <div className="py-10 text-center text-[14px] text-[#9AA9C3]">운송사 목록을 불러오는 중…</div>}
          {err && <div className="mx-4 my-2 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] px-3 py-2 text-[13px] font-bold text-[#B42318]">{err}</div>}
          {!kw && recent.length > 0 && <><div className="px-4 pt-1 pb-1 text-[11.5px] font-extrabold tracking-[0.12em] text-[#4B6CB7]">최근</div>{recent.map((c) => <Row key={`r-${c}`} c={c} tag="최근" />)}<div className="mx-4 my-1 border-t border-[#EEF2F8]" /></>}
          {shown.map((c) => <Row key={c} c={c} />)}
          {typed && <button type="button" onClick={() => go(typed)} className="w-full px-4 py-3 text-left text-[14px] font-bold text-[#2D4C82] hover:bg-[#F4F6FA]">「{typed}」(으)로 들어가기: 목록에 없는 회사</button>}
          {list && !shown.length && !typed && <div className="py-10 text-center text-[14px] text-[#9AA9C3]">찾는 운송사가 없어요</div>}
        </div>
        <div className="px-4 py-3 border-t border-[#EEF2F8] shrink-0 flex justify-end">
          <button type="button" onClick={onClose} className="h-10 px-5 rounded-xl border border-[#DCE3EE] text-[14px] font-black text-[#3A4A66]">닫기</button>
        </div>
      </div>
    </div>, document.body);
}
