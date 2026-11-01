// src/navMenus.jsx
// ⭐ 2026-11-01 상단 메뉴 마우스 올리면 세부 메뉴가 부드럽게 펼쳐진다(모든 팀 공통)
//  · MENU_SUBS: 상단 메뉴 → 그 화면 왼쪽 메뉴(KpSubNav code / AdminShell badgeLabel)의 항목
//  · 세부 메뉴를 누르면 그 메뉴 화면을 열고, 화면의 왼쪽 메뉴가 해당 항목으로 바로 이동한다(useSubnavTarget)
import React from "react";
import { createPortal } from "react-dom";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";

export const MENU_SUBS = {
  HOME: { code: "HOME", items: [["대시보드", "대시보드"], ["공지사항", "공지사항"], ["execsched", "임원 일정"], ["teamsched", "직원 일정"], ["rules", "사내 규정"], ["ap:inbox", "결재함"]] },
  배차현황: { code: "DISPATCH", items: [["배차현황", "배차현황"], ["미배차현황", "미배차현황"]] },
  단가표: { code: "RATE CARD", items: [["노선별", "노선별 단가표"], ["다목적지", "다목적지 단가표"], ["manual", "직접 작성"], ["history", "발행 이력"]] },
  기사관리: { code: "DRIVERS", items: [["drv", "기사관리"], ["acc:pending", "가입 승인"], ["acc:drivers", "승인된 기사"], ["docs:driver", "기사 제출 서류"], ["docs:penalty", "과태료 · 사고 서류"]] },
  거래처관리: { code: "CLIENTS", items: [["하차지거래처", "하차지거래처"], ["기본거래처", "기본거래처"], ["고정거래처관리", "고정거래처관리"]] },
  매출관리: { code: "REVENUE", items: [["dashboard", "매출 대시보드"], ["target", "목표 · 전망"], ["clients", "거래처 순위 · 신규"], ["trend", "거래처 동향 분석"], ["yearly", "연간 요약"], ["query", "거래처 기간 조회"]] },
  정산관리: { code: "SETTLEMENT", items: [["거래처정산", "거래처정산"], ["지급관리", "용차지급관리"], ["지입정산관리", "지입정산관리"]] },
  전자결재: { code: "E-APPROVAL", items: [["inbox", "결재함"], ["leave", "근태 · 휴가 신청"], ["expense", "비용 · 지출 결의"], ["draft", "업무 기안 · 품의"], ["report", "업무 보고 · 인사"], ["handover", "인수인계"], ["mine", "내 기안함"], ["lines", "결재선 관리"]] },
  회계관리: { code: "ACCOUNTING", items: [["overview", "회계 개요"], ["book", "회계 장부"], ["retire", "퇴직 정산"]] },
  자금관리: { code: "FINANCE", items: [["funds", "자금 현황"], ["book", "수입 · 지출 장부"]] },
  인사관리부: { code: "HUMAN RESOURCES", items: [["record", "인사관리"], ["edit", "직원관리"], ["register", "직원 등록"], ["attendance", "출근기록부"], ["leave", "연차 관리"], ["settings", "직책 · 부서 설정"], ["rules", "사내 규정"], ["obit", "부고 알림"]] },
  회사관리: { code: "COMPANY", items: [["회사정보", "회사정보"], ["조직도", "조직도"], ["내정보", "내정보"], ["내 이력서", "내 이력서"]] }, // ⭐ 2026-11-02 점검 — 기본 목록에서 '출근기록부' 제거(인사관리자 등 그 탭이 없는 사람에게 눌러도 이동 안 되는 메뉴가 보였음). 탭이 있는 사람은 화면을 열면 registerSubnav로 다시 보인다
  운임조회: { code: "FARE LOOKUP", items: [["전국운임조회", "전국운임조회"], ["자사운임표", "자사운임표"]] },
  지입차관리: { code: "FLEET CONTROL", items: [["tracking", "관제현황"], ["route", "노선관리"], ["fixed", "고정노선"], ["history", "이력 조회"], ["attendance", "출근기록부"], ["temperature", "온도 관제"], ["cargo-camera", "적재함 카메라"], ["vehicle", "차량 관리"], ["registration", "기사 등록 관리"]] },
  관리자메뉴: { code: "ADMIN", items: [["members", "회원 관리"], ["linked", "연동 화주사"], ["loginSessions", "로그인 관리"], ["billing", "구독 · 결제"], ["setup", "초기 설정 · 튜토리얼"]] },
};

// ⭐ 실제 화면의 왼쪽 메뉴를 기억 — 팀·권한마다 보이는 항목이 달라서, 한 번이라도 연 화면은 그 사람이 실제로 보는 항목만 펼친다
const REG_KEY = (code) => { let r = ""; try { r = (localStorage.getItem("role") || "") + (localStorage.getItem("role") === "hrAcct" ? `-${localStorage.getItem("kpHrAcctView") || "acct"}` : ""); } catch { /* 무시 */ } return `kpSubnavReg:${r}:${code}`; };
const _reg = {};
export function registerSubnav(code, items) {
  if (!code || !Array.isArray(items) || !items.length) return;
  const clean = items.filter((x) => x && x[0] && x[1]).map((x) => [String(x[0]), String(x[1])]);
  const j = JSON.stringify(clean);
  const k = REG_KEY(code);
  if (_reg[k] === j) return;
  _reg[k] = j;
  try { localStorage.setItem(k, j); } catch { /* 무시 */ }
}
function registeredItems(code) {
  try { const k = REG_KEY(code); const j = _reg[k] || localStorage.getItem(k); return j ? JSON.parse(j) : null; } catch { return null; }
}

// 세부 메뉴 이동 요청 — 화면이 아직 안 열렸으면 열린 뒤(3초 안) 적용
export function emitSubnav(code, key) {
  try { window.__kpPendingSub = { code, key, at: Date.now() }; } catch { /* 무시 */ } // 화면이 늦게 열려도(처음 불러오기) 10초 안이면 적용
  try { window.dispatchEvent(new CustomEvent("kp:subnav", { detail: { code, key } })); } catch { /* 무시 */ }
}
// KpSubNav · AdminShell에서 — 이 화면(code)의 항목(keys)으로 이동 요청이 오면 onSelect(key)
export function useSubnavTarget(code, keys, onSelect, labeled = null) {
  const ref = React.useRef({ keys, onSelect });
  ref.current = { keys, onSelect };
  const regJson = labeled ? JSON.stringify(labeled) : "";
  React.useEffect(() => { if (labeled) registerSubnav(code, labeled); }, [code, regJson]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const apply = (d) => {
      if (!d || d.code !== code) return false;
      const ks = ref.current.keys || [];
      if (!ks.includes(d.key)) return false;
      ref.current.onSelect?.(d.key);
      return true;
    };
    const p = (() => { try { return window.__kpPendingSub; } catch { return null; } })();
    if (p && Date.now() - p.at < 10000 && apply(p)) { try { window.__kpPendingSub = null; } catch { /* 무시 */ } }
    const h = (e) => { if (apply(e.detail)) { try { window.__kpPendingSub = null; } catch { /* 무시 */ } } };
    window.addEventListener("kp:subnav", h);
    return () => window.removeEventListener("kp:subnav", h);
  }, [code]);
}

// 상단 메뉴 버튼을 감싸서 — 마우스를 올리면 아래로 세부 메뉴 패널이 부드럽게 펼쳐진다
// badges — 세부 메뉴 항목별 숫자/"N" ({ key: 3 | "N" }) — 2026-11-02
export function NavHover({ menu, label, disabled = false, onOpenMenu, badges = null, children }) {
  const base = MENU_SUBS[menu];
  const reg = base ? registeredItems(base.code) : null;
  // ⭐ 2026-11-01 세부 메뉴가 있는 메뉴는 처음부터 항상 펼친다(한 번 연 화면은 그 사람이 실제로 보는 항목으로)
  const conf = base ? { code: base.code, items: reg && reg.length ? reg : base.items } : null;
  const anchorRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  const [shown, setShown] = React.useState(false);
  const [pos, setPos] = React.useState({ left: 0, top: 0 });
  const tIn = React.useRef(null); const tOut = React.useRef(null);
  const clear = () => { clearTimeout(tIn.current); clearTimeout(tOut.current); };
  const enter = () => {
    if (!conf || disabled) return;
    clear();
    tIn.current = setTimeout(() => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (r) setPos({ left: Math.max(8, Math.min(window.innerWidth - 248, r.left + r.width / 2 - 120)), top: r.bottom + 8 });
      setOpen(true);
      requestAnimationFrame(() => setShown(true));
    }, 120);
  };
  const leave = () => {
    clear();
    tOut.current = setTimeout(() => { setShown(false); tOut.current = setTimeout(() => setOpen(false), 180); }, 140);
  };
  React.useEffect(() => () => clear(), []);
  React.useEffect(() => {
    if (!open) return undefined;
    // ⭐ 세부 메뉴 안을 스크롤(휠·스크롤바)할 땐 닫지 않는다 — 바깥 화면이 스크롤될 때만 닫는다
    const close = (e) => { if (e && e.type === "scroll" && panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return; setShown(false); setOpen(false); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);
  const pick = (key) => { clear(); setShown(false); setOpen(false); onOpenMenu?.(); setTimeout(() => emitSubnav(conf.code, key), 0); };
  return (
    <span ref={anchorRef} className="inline-flex" onMouseEnter={enter} onMouseLeave={leave}
      onClickCapture={(e) => {
        // ⭐ 2026-11-01 버그수정 — 세부 메뉴(포털) 안을 눌러도 이 캡처가 먼저 돌아 패널을 지워 버려, 세부 메뉴 버튼의 onClick이 실행되지 않았다(어느 메뉴든 이동 안 됨)
        if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
        clear(); setShown(false); setOpen(false); /* 상단 메뉴 버튼을 누르면 펼친 세부 메뉴는 닫힌다 */
      }}>
      {children}
      {open && conf && createPortal(
        <div ref={panelRef} onMouseEnter={() => clear()} onMouseLeave={leave}
          /* ⭐ 포털이라 휠이 상단 메뉴(nav)까지 올라가 메뉴줄이 옆으로 밀리며 닫혔다 — 여기서 멈춘다 */
          onWheel={(e) => e.stopPropagation()}
          style={{
            position: "fixed", left: pos.left, top: pos.top, width: 240, zIndex: 2147482000,
            opacity: shown ? 1 : 0, transform: shown ? "translateY(0) scale(1)" : "translateY(-6px) scale(0.98)",
            transformOrigin: "50% 0", transition: "opacity 180ms ease, transform 200ms cubic-bezier(.2,.8,.2,1)",
            pointerEvents: shown ? "auto" : "none",
          }}>
          <div style={{ position: "absolute", top: -8, left: 0, right: 0, height: 8 }} />
          <div className="rounded-2xl overflow-hidden shadow-[0_24px_60px_rgba(5,10,25,0.45)] ring-1 ring-white/10" style={{ background: "linear-gradient(160deg,#0F1A30 0%,#152340 60%,#1B2B4B 100%)" }}>
            <div className="px-4 pt-3 pb-2 border-b border-white/10">
              <div className="text-[9.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{conf.code}</div>
              <div className="text-[14px] font-black text-white mt-0.5">{label || menu}</div>
            </div>
            <div className="p-1.5 overflow-y-auto" style={{ maxHeight: "min(70vh, 520px)", overscrollBehavior: "contain" }}>
              {conf.items.map(([key, l], i) => (
                <button key={key} type="button" onClick={() => pick(key)}
                  className="w-full flex items-center gap-2.5 px-3 h-10 rounded-xl text-left text-[13.5px] font-bold text-white/80 hover:text-white hover:bg-white/[0.08] transition"
                  style={{ transitionDelay: shown ? `${i * 18}ms` : "0ms" }}>
                  <span className="w-1.5 h-1.5 rotate-45 bg-[#8FB0F0]/70 shrink-0" />
                  <span className="truncate flex-1">{l}</span>
                  {(() => { const b = badges?.[key]; const on = typeof b === "string" ? !!b : b > 0; return on ? <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-black grid place-items-center tabular-nums">{typeof b === "number" && b > 99 ? "99+" : b}</span> : null; })()}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
