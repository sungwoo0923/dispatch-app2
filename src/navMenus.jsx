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
  인사관리부: { code: "HUMAN RESOURCES", items: [["record", "인사관리"], ["edit", "직원 정보 · 퇴사"], ["register", "직원 등록"], ["attendance", "출근기록부"], ["leave", "연차 관리"], ["settings", "직책 · 부서 설정"], ["rules", "사내 규정"], ["obit", "부고 알림"]] },
  회사관리: { code: "COMPANY", items: [["회사정보", "회사정보"], ["조직도", "조직도"], ["내정보", "내정보"], ["내 이력서", "내 이력서"], ["출근기록부", "출근기록부"]] },
  관리자메뉴: { code: "ADMIN", items: [["members", "회원 관리"], ["linked", "연동 화주사"], ["loginSessions", "로그인 관리"], ["billing", "구독 · 결제"], ["setup", "초기 설정 · 튜토리얼"]] },
};

// 세부 메뉴 이동 요청 — 화면이 아직 안 열렸으면 열린 뒤(3초 안) 적용
export function emitSubnav(code, key) {
  try { window.__kpPendingSub = { code, key, at: Date.now() }; } catch { /* 무시 */ }
  try { window.dispatchEvent(new CustomEvent("kp:subnav", { detail: { code, key } })); } catch { /* 무시 */ }
}
// KpSubNav · AdminShell에서 — 이 화면(code)의 항목(keys)으로 이동 요청이 오면 onSelect(key)
export function useSubnavTarget(code, keys, onSelect) {
  const ref = React.useRef({ keys, onSelect });
  ref.current = { keys, onSelect };
  React.useEffect(() => {
    const apply = (d) => {
      if (!d || d.code !== code) return false;
      const ks = ref.current.keys || [];
      if (!ks.includes(d.key)) return false;
      ref.current.onSelect?.(d.key);
      return true;
    };
    const p = (() => { try { return window.__kpPendingSub; } catch { return null; } })();
    if (p && Date.now() - p.at < 3000 && apply(p)) { try { window.__kpPendingSub = null; } catch { /* 무시 */ } }
    const h = (e) => { if (apply(e.detail)) { try { window.__kpPendingSub = null; } catch { /* 무시 */ } } };
    window.addEventListener("kp:subnav", h);
    return () => window.removeEventListener("kp:subnav", h);
  }, [code]);
}

// 상단 메뉴 버튼을 감싸서 — 마우스를 올리면 아래로 세부 메뉴 패널이 부드럽게 펼쳐진다
export function NavHover({ menu, label, disabled = false, onOpenMenu, children }) {
  const conf = MENU_SUBS[menu];
  const anchorRef = React.useRef(null);
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
    const close = () => { setShown(false); setOpen(false); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);
  const pick = (key) => { clear(); setShown(false); setOpen(false); onOpenMenu?.(); setTimeout(() => emitSubnav(conf.code, key), 0); };
  return (
    <span ref={anchorRef} className="inline-flex" onMouseEnter={enter} onMouseLeave={leave}>
      {children}
      {open && conf && createPortal(
        <div onMouseEnter={() => clear()} onMouseLeave={leave}
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
            <div className="p-1.5">
              {conf.items.map(([key, l], i) => (
                <button key={key} type="button" onClick={() => pick(key)}
                  className="w-full flex items-center gap-2.5 px-3 h-10 rounded-xl text-left text-[13.5px] font-bold text-white/80 hover:text-white hover:bg-white/[0.08] transition"
                  style={{ transitionDelay: shown ? `${i * 18}ms` : "0ms" }}>
                  <span className="w-1.5 h-1.5 rotate-45 bg-[#8FB0F0]/70 shrink-0" />
                  <span className="truncate">{l}</span>
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
