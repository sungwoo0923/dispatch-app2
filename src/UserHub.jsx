// ======================= src/UserHub.jsx =======================
// 🧭 2026-11-16 상단바 [내 메뉴] 버튼 하나 — 사내메일함 · 원격 지원 요청 · 내 정보 · 알림 내역을 한곳에(사용자 요청: 상단바가 복잡해서)
//  마우스를 올리면(또는 누르면) 목록이 열리고, 고르면 각 창이 뜬다.
//  메일함 · 알림함 창 자체는 그대로 쓴다 — MailHeaderButton · DriverEventBell 을 숨겨서 두고 이벤트로 연다(kp-open-mail · kp-open-driver-bell)
import React from "react";
import { useDriverEventCounts } from "./driverEvents";

const Ico = ({ d }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const I = {
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  support: <><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" /></>,
  me: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  swap: <><path d="M7 7h11l-3-3M17 17H6l3 3" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
};
const Badge = ({ n }) => (n > 0 ? <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-black text-white grid place-items-center tabular-nums" style={{ background: "#E5332A" }}>{n > 99 ? "99+" : n}</span> : null);

// 🧭 2026-11-16 trigger(children)를 주면 그 모양(회사명 · 이름 칸)이 버튼이 된다 · onTriggerClick 이 있으면 누를 때 그걸 먼저(새 버전 업데이트)
export default function UserHub({ name = "", mailUnread = 0, onMyInfo, onSupport, showSupport = true, children = null, onTriggerClick = null, align = "right", triggerClass = "", onSwitchCompany = null }) {
  const bell = useDriverEventCounts();
  const bellN = (bell.orders || 0) + (bell.docs || 0) + (bell.sos || 0) + (bell.checkout || 0);
  const total = mailUnread + bellN;
  const [open, setOpen] = React.useState(false);
  const box = React.useRef(null);
  const timer = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", h, true); window.addEventListener("keydown", k);
    return () => { window.removeEventListener("mousedown", h, true); window.removeEventListener("keydown", k); };
  }, [open]);
  const enter = () => { clearTimeout(timer.current); setOpen(true); };
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 220); };
  const pick = (fn) => { setOpen(false); fn?.(); };
  const openBell = () => { const r = box.current?.getBoundingClientRect(); window.dispatchEvent(new CustomEvent("kp-open-driver-bell", { detail: r ? { top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) } : {} })); };
  const items = [
    { k: "mail", label: "사내메일함", ico: I.mail, n: mailUnread, on: () => window.dispatchEvent(new CustomEvent("kp-open-mail", { detail: {} })) },
    { k: "bell", label: "알림 내역", sub: "기사 수락 · 서류 · 긴급", ico: I.bell, n: bellN, on: openBell },
    { k: "me", label: "내 정보", ico: I.me, on: onMyInfo },
    // 🔀 2026-11-19 최고관리자 · 부관리자만 — 다른 운송사 화면으로 바로(CompanySwitcher)
    ...(onSwitchCompany ? [{ k: "company", label: "운송사 전환", sub: "로그아웃 없이 다른 운송사 화면으로", ico: I.swap, on: onSwitchCompany }] : []),
    ...(showSupport ? [{ k: "support", label: "원격 지원 요청", sub: "사용이 어려우면 화면을 같이 봐요", ico: I.support, on: onSupport }] : []),
  ];
  const initial = String(name || "").trim().slice(0, 1) || "나";
  return (
    <div ref={box} className="relative" onMouseEnter={enter} onMouseLeave={leave} data-kp="user-hub">
      {children ? (
        <button type="button" onClick={() => (onTriggerClick ? onTriggerClick() : setOpen((v) => !v))} aria-haspopup="menu" aria-expanded={open} title="내 메뉴 — 사내메일함 · 알림 내역 · 내 정보 · 원격 지원" className={`relative ${triggerClass}`}>
          {children}
          {total > 0 && <span className="absolute -top-1.5 -right-1.5"><Badge n={total} /></span>}
        </button>
      ) : (
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} title="내 메뉴 — 사내메일함 · 알림 내역 · 내 정보 · 원격 지원"
        className="kp-icon-btn transition relative !w-auto !px-1.5 gap-1.5 inline-flex items-center">
        <span className="w-6 h-6 rounded-full grid place-items-center text-[12px] font-black text-[#0F1A30] bg-white/90">{initial}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.7 }}><path d="M6 9l6 6 6-6" /></svg>
        {total > 0 && <span className="absolute -top-1 -right-1"><Badge n={total} /></span>}
      </button>)}
      {open && (
        <div role="menu" className={`absolute ${align === "left" ? "left-0" : "right-0"} top-full pt-2 z-[2147482500]`}>
          <div className="w-[248px] rounded-2xl bg-white shadow-[0_18px_44px_rgba(11,20,40,0.28)] border border-[#E3E8F0] py-1.5 text-[#0F1A30]">
            {name && <div className="px-4 pt-2 pb-2 text-[12.5px] font-bold text-[#7A879C] border-b border-[#EEF2F8] mb-1 truncate">{name}</div>}
            {items.map((it) => (
              <button key={it.k} type="button" role="menuitem" onClick={() => pick(it.on)} data-kp={`user-hub-${it.k}`}
                className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-[#F4F6FA]">
                <span className="text-[#1B2B4B]"><Ico d={it.ico} /></span>
                <span className="flex-1 min-w-0"><span className="block text-[14px] font-bold">{it.label}</span>{it.sub && <span className="block text-[11.5px] text-[#9AA9C3] truncate">{it.sub}</span>}</span>
                <Badge n={it.n || 0} />
              </button>))}
          </div>
        </div>)}
    </div>
  );
}
