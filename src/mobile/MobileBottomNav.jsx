// ======================= src/mobile/MobileBottomNav.jsx =======================
// 📱 2026-11-28 휴대폰 직원 앱 하단 메뉴바(사용자 요청 — 기사앱처럼)
//  · 5칸: 홈 / (바꿀 수 있는 칸) / 가운데 큰 버튼(팀 핵심 일 · 고정) / 전자결재 / 설정
//  · 홈 · 가운데 · 전자결재 · 설정은 고정, 두 번째 칸만 사용자가 바꾼다(탭을 꾹 누르거나 설정 › 하단 메뉴) — 계정마다 저장(users/{uid}.mobileNav)
//  · 바꿀 때 목록에는 그 사람이 지금 열 수 있는 메뉴만 나온다(MobileApp 이 권한으로 거른 목록을 넘긴다)
//  · 스크롤과 상관없이 화면 맨 아래에 늘 떠 있다 — #root 에 글자 크기 zoom 이 걸리면 iOS에서 fixed 가 화면 중간에 뜨므로 body 로 그리고 안쪽에만 zoom
import React from "react";
import { createPortal } from "react-dom";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";

// 칸에 쓰는 메뉴 — 이름은 칸에 들어가게 짧게
export const NAV_ITEMS = {
  home: { label: "홈", icon: "home" },
  register: { label: "배차등록", icon: "plus" },
  approval: { label: "전자결재", icon: "approval" },
  settings: { label: "설정", icon: "gear" },
  list: { label: "배차현황", icon: "list" },
  unassigned: { label: "미배차현황", icon: "clock" },
  fixedroute: { label: "고정노선", icon: "route" },
  monthclose: { label: "월 마감", icon: "check" },
  fare: { label: "운임조회", icon: "search" },
  ratecard: { label: "단가표", icon: "won" },
  drivers: { label: "기사관리", icon: "user" },
  fleet: { label: "지입차", icon: "truck" },
  clients: { label: "거래처", icon: "building" },
  notice: { label: "공지사항", icon: "bell" },
  schedule: { label: "직원 일정", icon: "calendar" },
  board: { label: "게시판", icon: "chat" },
  settle: { label: "정산관리", icon: "receipt" },
  sales: { label: "매출관리", icon: "chart" },
  acct: { label: "회계관리", icon: "won" },
  cashbook: { label: "자금관리", icon: "wallet" },
  assets: { label: "비품·자산", icon: "box" },
  hr: { label: "인사관리부", icon: "idcard" },
  attendance: { label: "출근기록부", icon: "clock" },
  cert: { label: "증명서", icon: "stamp" },
  rules: { label: "사내 규정", icon: "book" },
  safety: { label: "안전교육", icon: "shield" },
  salesMgmt: { label: "영업관리", icon: "trend" },
  briefing: { label: "일일 보고", icon: "chart" },
  analysis: { label: "경영 분석", icon: "trend" },
  apqueue: { label: "결재 대기", icon: "stamp" },
  staffinfo: { label: "직원 정보", icon: "users" },
  funds: { label: "자금 현황", icon: "wallet" },
  execsched: { label: "임원 일정", icon: "calendar" },
};

// 팀(화면)별 — slot2 = 두 번째 칸 기본값, center = 가운데(고정), choices = 두 번째 칸에 고를 수 있는 메뉴(권한으로 한 번 더 거른다)
export const NAV_MODES = {
  dispatch: { label: "운송", slot2: "list", center: "register", centerAlt: ["unassigned", "fixedroute"], choices: ["list", "unassigned", "fixedroute", "monthclose", "fare", "ratecard", "drivers", "fleet", "clients", "notice", "schedule", "board"] },
  viewer: { label: "조회전용", slot2: "list", center: "unassigned", centerAlt: ["fixedroute", "fare"], choices: ["list", "fixedroute", "fare", "ratecard", "notice", "schedule"] },
  acct: { label: "경리", slot2: "settle", center: "cashbook", centerAlt: ["acct", "sales"], choices: ["settle", "sales", "acct", "assets", "list", "drivers", "notice", "schedule"] },
  hr: { label: "인사", slot2: "hr", center: "attendance", centerAlt: ["cert"], choices: ["hr", "cert", "schedule", "rules", "safety", "notice"] },
  sales: { label: "영업", slot2: "salesMgmt", center: "fare", centerAlt: ["ratecard", "salesMgmt"], choices: ["salesMgmt", "ratecard", "notice", "schedule"] },
  exec: { label: "경영", slot2: "briefing", center: "analysis", centerAlt: ["apqueue"], choices: ["briefing", "apqueue", "staffinfo", "funds", "execsched", "salesMgmt", "notice"] },
  office: { label: "사내업무", slot2: "notice", center: "schedule", centerAlt: ["board"], choices: ["notice", "board", "execsched", "rules", "safety"] },
};

// 가운데 · 두 번째 칸 정하기 — can(key) = 지금 열 수 있는지, saved = 계정에 저장한 두 번째 칸
export function resolveNav(mode, can, saved) {
  const M = NAV_MODES[mode] || NAV_MODES.dispatch;
  const center = [M.center, ...(M.centerAlt || [])].find((k) => can(k)) || M.center;
  const choices = M.choices.filter((k) => k !== center && can(k));
  const slot2 = (saved && choices.includes(saved) ? saved : null) || (choices.includes(M.slot2) ? M.slot2 : choices[0]) || "notice";
  return { center, slot2, choices };
}

const P = {
  home: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  approval: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 15l2 2 4-4" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  list: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  won: <><path d="M4 7l3 10 3-8 2 0 3 8 3-10" /><path d="M3 11h18" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>,
  truck: <><rect x="1" y="6" width="14" height="10" rx="1.5" /><path d="M15 10h4l3 3v3h-7z" /><circle cx="6" cy="18" r="1.8" /><circle cx="18" cy="18" r="1.8" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  receipt: <><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M16 15h2" /></>,
  box: <><path d="M21 8l-9-5-9 5 9 5z" /><path d="M3 8v8l9 5 9-5V8M12 13v8" /></>,
  idcard: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16a3 3 0 0 1 6 0M14 10h4M14 14h3" /></>,
  stamp: <><path d="M9 3h6v6l3 3v3H6v-3l3-3z" /><path d="M5 20h14" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></>,
  shield: <><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" /><path d="M9 12l2 2 4-4" /></>,
  trend: <><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />,
};
export function NavIcon({ name, size = 22, stroke = 2 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[name] || P.list}</svg>;
}

function Badge({ n }) {
  if (!n) return null;
  return <span style={{ position: "absolute", top: -4, left: "calc(50% + 7px)", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#FF3B30", color: "#fff", fontSize: 11, fontWeight: 900, display: "grid", placeItems: "center", boxSizing: "border-box", boxShadow: "0 0 0 2px #fff" }}>{n > 99 ? "99+" : n}</span>;
}

// items: [{ key, label, icon, active, badge, onClick, center }] — 5칸
export default function MobileBottomNav({ items = [], zoom = 1, hidden = false, onLongPress }) {
  const timer = React.useRef(null);
  const fired = React.useRef(false);
  const start = (key) => { fired.current = false; clearTimeout(timer.current); timer.current = setTimeout(() => { fired.current = true; try { navigator.vibrate?.(18); } catch { /* 무시 */ } onLongPress?.(key); }, 520); };
  const stop = () => clearTimeout(timer.current);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  return createPortal(
    <nav aria-label="하단 메뉴" data-testid="m-bottom-nav" className="kp-m-bottomnav"
      style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 45, pointerEvents: hidden ? "none" : "auto", transform: hidden ? "translateY(130%)" : "none", transition: "transform .25s ease", fontFamily: MONO }}>
      <style>{".kp-m-bottomnav button:focus:not(:focus-visible){outline:none}.kp-m-bottomnav button:focus-visible{outline:2px solid #2D4C82;outline-offset:2px;border-radius:14px}"}</style>
      <div style={{ zoom }}>
        <div style={{ padding: "0 10px max(10px, env(safe-area-inset-bottom, 0px))", background: "linear-gradient(180deg, rgba(238,242,248,0) 0%, rgba(238,242,248,.92) 45%)" }}>
          <div style={{ maxWidth: 560, margin: "0 auto", height: 70, borderRadius: 24, background: "rgba(255,255,255,.95)", border: "1px solid #D6E0F0", boxShadow: "0 12px 32px rgba(11,20,40,.16), inset 0 1px 0 #fff", backdropFilter: "blur(16px) saturate(1.5)", WebkitBackdropFilter: "blur(16px) saturate(1.5)", display: "flex", alignItems: "flex-end", padding: "0 4px 7px", boxSizing: "border-box" }}>
            {items.map((it) => (
              <button key={it.key} type="button" data-nav={it.key} aria-current={it.active ? "page" : undefined}
                onPointerDown={() => start(it.key)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
                onContextMenu={(e) => e.preventDefault()}
                onClick={(e) => { if (fired.current) { e.preventDefault(); fired.current = false; return; } it.onClick?.(); }}
                style={{ flex: 1, minWidth: 0, position: "relative", border: "none", background: "none", padding: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer", WebkitTapHighlightColor: "transparent", WebkitTouchCallout: "none", userSelect: "none", WebkitUserSelect: "none",
                  color: it.center || it.active ? "#0B1428" : "#6B7A94", fontWeight: it.center || it.active ? 900 : 700, fontSize: "min(12.5px, 3.3vw)", letterSpacing: "-0.2px", whiteSpace: "nowrap" }}>
                {it.center ? (
                  <span style={{ width: 56, height: 56, marginTop: -28, borderRadius: 19, display: "grid", placeItems: "center", color: "#fff", background: "linear-gradient(145deg,#0B1428,#1B2B4B 55%,#2D4C82)", border: "4px solid #EEF2F8", boxShadow: "0 12px 24px rgba(15,26,48,.36), inset 0 1px 0 rgba(255,255,255,.2)", boxSizing: "border-box" }}>
                    <NavIcon name={it.icon} size={it.icon === "plus" ? 26 : 23} stroke={it.icon === "plus" ? 2.6 : 2.1} />
                  </span>
                ) : (
                  <span style={{ width: 46, height: 30, borderRadius: 11, display: "grid", placeItems: "center", color: it.active ? "#fff" : "#6B7A94", background: it.active ? "linear-gradient(135deg,#0F1D3A,#2D4C82)" : "transparent", boxShadow: it.active ? "0 8px 18px rgba(27,43,75,.3)" : "none" }}>
                    <NavIcon name={it.icon} size={21} />
                  </span>
                )}
                <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</span>
                {!it.center && <Badge n={it.badge} />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>,
    document.body,
  );
}

// 남색 아래 창(화면 전환 창과 같은 모양)
function DarkSheet({ en, title, sub, onClose, children, footer, testid }) {
  React.useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[2147482500] bg-[#0B1428]/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }} data-testid={testid}>
      <div className="w-full sm:max-w-[560px] rounded-t-[26px] sm:rounded-[24px] overflow-hidden shadow-[0_30px_80px_rgba(5,10,25,0.55)] ring-1 ring-white/10 flex flex-col" style={{ background: "linear-gradient(160deg,#0F1A30 0%,#152340 60%,#1B2B4B 100%)", maxHeight: "88vh" }}>
        <div className="px-5 pt-5 pb-4 flex items-start gap-3 border-b border-white/10 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{en}</div>
            <div className="text-[20px] font-black text-white mt-0.5">{title}</div>
            {sub && <div className="text-[13px] font-semibold text-white/55 mt-0.5">{sub}</div>}
          </div>
          <button type="button" onClick={onClose} className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 text-white shrink-0" aria-label="닫기">✕</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5">{children}</div>
        {footer && <div className="shrink-0 px-3.5 pt-3 border-t border-white/10" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}>{footer}</div>}
        {!footer && <div style={{ height: "max(env(safe-area-inset-bottom, 0px), 12px)" }} />}
      </div>
    </div>,
    document.body,
  );
}

const REG_KEY = "kpRegPickLast";
// 가운데 [배차등록] — 직접 입력 / AI 통화
export function RegisterPickSheet({ onManual, onAgent, agentOk = true, onClose }) {
  let last = "manual";
  try { last = localStorage.getItem(REG_KEY) || "manual"; } catch { /* 무시 */ }
  const pick = (k, fn) => { try { localStorage.setItem(REG_KEY, k); } catch { /* 무시 */ } fn?.(); };
  const opts = [
    { k: "manual", en: "MANUAL", icon: "pen", title: "직접 입력해서 등록", desc: "칸을 채워 등록 · 빠른 등록 · 오더 스캔", fn: onManual, ok: true },
    { k: "agent", en: "AI CALL", icon: "phone", title: "AI 통화로 등록", desc: agentOk ? "통화하듯 말하면 AI가 칸을 채워요" : "이 휴대폰 브라우저는 음성 인식을 지원하지 않아요", fn: onAgent, ok: agentOk },
  ];
  if (last === "agent" && agentOk) opts.reverse();
  return (
    <DarkSheet en="NEW ORDER" title="어떻게 배차를 등록할까요?" sub="마지막에 고른 방법이 맨 위에 와요" onClose={onClose} testid="m-register-pick">
      <div className="flex flex-col gap-2.5">
        {opts.map((o, i) => {
          const on = i === 0 && o.ok;
          return (
            <button key={o.k} type="button" disabled={!o.ok} onClick={() => pick(o.k, o.fn)} data-testid={`m-register-${o.k}`}
              className={`w-full text-left rounded-2xl px-4 py-4 border transition flex items-center gap-3.5 ${on ? "bg-white border-white text-[#0F1A30] shadow-[0_10px_26px_rgba(0,0,0,0.3)]" : "bg-white/[0.06] border-white/12 text-white"} ${o.ok ? "" : "opacity-50"}`}>
              <span className={`w-12 h-12 rounded-[14px] grid place-items-center shrink-0 ${on ? "bg-[#EEF3FB] text-[#1B2B4B]" : "bg-white/[0.08] text-[#8FB0F0]"}`}><NavIcon name={o.icon} size={22} /></span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[9.5px] font-extrabold tracking-[0.22em] ${on ? "text-[#4B6CB7]" : "text-[#8FB0F0]"}`} style={{ fontFamily: MONO }}>{o.en}</span>
                <span className="block text-[17px] font-black leading-tight">{o.title}</span>
                <span className={`block text-[12.5px] font-semibold mt-0.5 ${on ? "text-[#5B6B85]" : "text-white/60"}`}>{o.desc}</span>
              </span>
              {on && <span className="shrink-0 px-2 py-1 rounded-lg bg-[#0F1A30] text-white text-[11px] font-black">최근</span>}
            </button>
          );
        })}
        <div className="flex items-center gap-2 px-1 pt-1 text-white/50 text-[12px] font-semibold"><NavIcon name="check" size={14} />AI 통화로 채운 칸도 저장 전에 한 번 확인해요</div>
      </div>
    </DarkSheet>
  );
}

// 하단 메뉴 바꾸기 — 두 번째 칸만 바뀐다(홈 · 가운데 · 전자결재 · 설정은 고정)
export function NavEditSheet({ slots = [], choices = [], current = "", defaultKey = "", onSave, onClose }) {
  const [pick, setPick] = React.useState(current);
  const [busy, setBusy] = React.useState(false);
  const save = async (k) => { if (busy) return; setBusy(true); try { await onSave?.(k); } finally { setBusy(false); } };
  return (
    <DarkSheet en="MY TAB BAR" title="하단 메뉴 바꾸기" sub="두 번째 칸에 둘 메뉴를 골라요" onClose={onClose} testid="m-nav-edit"
      footer={(
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-white/55"><NavIcon name="lock" size={14} />내 권한으로 열 수 있는 메뉴만 보여요 · 내 계정에 저장돼요</div>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => { setPick(defaultKey); save(defaultKey); }} className="flex-1 h-12 rounded-2xl border border-white/20 text-white text-[14.5px] font-extrabold">팀 기본값으로</button>
            <button type="button" disabled={busy} onClick={() => save(pick)} className="flex-[1.4] h-12 rounded-2xl bg-white text-[#0F1A30] text-[14.5px] font-black" data-testid="m-nav-save">{busy ? "저장 중…" : "저장"}</button>
          </div>
        </div>
      )}>
      <div className="rounded-[18px] bg-black/20 p-2 flex gap-1.5 mb-3">
        {slots.map((s, i) => {
          const editable = i === 1;
          const label = editable ? (NAV_ITEMS[pick]?.label || s.label) : s.label;
          return (
            <div key={s.key} className={`flex-1 min-w-0 h-16 rounded-[14px] flex flex-col items-center justify-center gap-0.5 text-[11.5px] font-extrabold ${editable ? "bg-white text-[#0F1A30] border-2 border-[#8FB0F0] shadow-[0_0_0_4px_rgba(143,176,240,0.25)]" : "bg-white/[0.05] border border-dashed border-white/20 text-white/50"}`}>
              <NavIcon name={editable ? (NAV_ITEMS[pick]?.icon || s.icon) : s.icon} size={18} />
              <span className="max-w-full truncate px-0.5">{label}</span>
              <span className={`text-[9.5px] ${editable ? "text-[#2D4C82]" : ""}`}>{editable ? "바꾸는 칸" : i === 2 ? "가운데 고정" : "고정"}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5">
        {choices.map((k) => {
          const it = NAV_ITEMS[k]; if (!it) return null;
          const on = k === pick;
          return (
            <button key={k} type="button" onClick={() => setPick(k)} aria-pressed={on} data-testid={`m-nav-choice-${k}`}
              className={`h-12 px-3 rounded-xl flex items-center gap-2.5 text-[14.5px] font-extrabold border text-left ${on ? "bg-white text-[#0F1A30] border-white" : "bg-white/[0.05] text-white border-white/10"}`}>
              <span className={on ? "text-[#1B2B4B]" : "text-[#8FB0F0]"}><NavIcon name={it.icon} size={18} /></span>
              {it.label}
              {k === defaultKey && <span className={`ml-auto text-[11px] font-black ${on ? "text-[#4B6CB7]" : "text-white/45"}`}>팀 기본</span>}
              {on && <span className={`${k === defaultKey ? "" : "ml-auto "}px-2 py-0.5 rounded-lg bg-[#0F1A30] text-white text-[11px] font-black`}>선택</span>}
            </button>
          );
        })}
      </div>
    </DarkSheet>
  );
}
