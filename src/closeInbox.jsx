// ======================= src/closeInbox.jsx =======================
// 📥 2026-11-16 배차마감 도착 알림 — 배차 담당자가 월 마감에서 1차 마감(submitted)하면 경리 쪽에
//  ① 상단 메뉴 · 정산관리 왼쪽 메뉴(거래처정산)에 숫자(경리 확인을 기다리는 거래처 수)
//  ② 오른쪽 아래 배너 "배차마감이 도착했어요" [확인] [닫기] — 몇 초 뒤 저절로 사라진다(한 번 본 건 다시 안 뜸)
//  PC(DispatchApp) · 모바일(MobileApp) 같이 쓴다. 정산관리를 볼 수 있는 사람에게만(enabled)
import React from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useArDesk } from "./SettleDesk";
import { isFinalLocked } from "./closeFlow";
import { setOrderGuard, setDeleteGuard } from "./orderWrite";

const SEEN_KEY = (co) => `kpCloseInboxSeen:${co}`;
const tsOf = (v) => (typeof v === "number" ? v : v?.seconds ? v.seconds * 1000 : 0);

export function useCloseInbox(company, enabled = true) {
  const co = enabled ? String(company || "").trim() : "";
  const desk = useArDesk(co);
  const items = React.useMemo(() => [...(desk.closes?.values?.() || [])]
    .filter((d) => d.status === "submitted")
    .map((d) => ({ client: d.client, ym: d.yyyymm, by: d.submittedByName || "", at: tsOf(d.submittedAt) }))
    .sort((a, b) => b.at - a.at), [desk.closes]);
  React.useEffect(() => { pub(items.length); }, [items.length]);
  return { co, items, count: items.length };
}
// 숫자만 필요한 곳(모바일 메뉴 등) — useCloseInbox 를 부른 화면이 알려 준 값을 같이 본다
let N = 0; const subs = new Set();
const pub = (v) => { N = v; subs.forEach((f) => f(v)); };
export function useCloseInboxCount() {
  const [v, setV] = React.useState(N);
  React.useEffect(() => { subs.add(setV); setV(N); return () => { subs.delete(setV); }; }, []);
  return v;
}

export function CloseInboxBanner({ inbox, onOpen, mobile = false }) {
  const [show, setShow] = React.useState(null);
  React.useEffect(() => {
    if (!inbox?.co || !inbox.items.length) return undefined;
    let seen = 0; try { seen = Number(localStorage.getItem(SEEN_KEY(inbox.co))) || 0; } catch { /* 무시 */ }
    const fresh = inbox.items.filter((x) => x.at > seen);
    if (!fresh.length) return undefined;
    try { localStorage.setItem(SEEN_KEY(inbox.co), String(Math.max(...fresh.map((x) => x.at)))); } catch { /* 무시 */ }
    if (!seen) return undefined; // 처음 켠 기기는 쌓인 것으로 배너를 띄우지 않는다(숫자로만)
    setShow(fresh);
    const t = setTimeout(() => setShow(null), 9000);
    return () => clearTimeout(t);
  }, [inbox?.co, inbox?.items]);
  if (!show) return null;
  const first = show[0];
  return (
    <div role="status" data-kp="close-inbox-banner" className={`fixed z-[2147482400] ${mobile ? "left-3 right-3 bottom-20" : "right-6 bottom-6 w-[380px]"}`}>
      <div className="rounded-2xl overflow-hidden bg-white border border-[#DCE3EE] shadow-[0_20px_50px_rgba(11,20,40,0.28)]">
        <div className="px-4 py-3 flex items-start gap-3" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
          <span className="kp-subnav-newdot mt-1.5 w-2 h-2 rounded-full bg-[#CFE0FF] shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-extrabold tracking-[0.22em] text-[#8FB0F0]">MONTH CLOSE</div>
            <div className="text-[15px] font-black text-white leading-snug">배차마감이 도착했어요{show.length > 1 ? ` · ${show.length}곳` : ""}</div>
          </div>
        </div>
        <div className="px-4 py-3 text-[13.5px] text-[#1B2B4B]">
          <b>{first.client}</b> {Number(String(first.ym).slice(5))}월{first.by ? ` · ${first.by}` : ""}{show.length > 1 ? ` 외 ${show.length - 1}곳` : ""} — 확인할까요?
        </div>
        <div className="px-4 pb-3 flex justify-end gap-2">
          <button type="button" onClick={() => setShow(null)} className="h-9 px-4 rounded-xl border border-[#D5DDEA] bg-white text-[13px] font-bold text-[#3A4A66]">닫기</button>
          <button type="button" onClick={() => { setShow(null); onOpen?.(first); }} className="h-9 px-4 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black">확인</button>
        </div>
      </div>
    </div>
  );
}

// 🔒 2026-11-16 최종마감 잠금 검사기 — PC · 모바일 화면에 한 번 걸어 두면 오더 저장(orderWrite) · 삭제(DeleteProgress)가 모두 이걸 거친다
//  오더 내용 칸(거래처 · 날짜 · 상하차지 · 차량 · 기사 · 운임 · 상태 · 메모 등)을 고칠 때만 막는다 — 계산서 · 입금 · 지급 같은 정산 기록은 그대로
//  bypass: 경리 · 회계 · 정산 팀, 최고관리자 등(일시해제 없이도 고칠 수 있는 사람)
const CONTENT = new Set(["거래처명", "상차일", "하차일", "상차시간", "하차시간", "상차지명", "상차지주소", "하차지명", "하차지주소", "화물내용", "차량톤수", "차량종류", "차량번호", "이름", "기사명", "전화번호", "청구운임", "기사운임", "수수료", "배차상태", "지급방식", "배차방식", "메모", "마감월", "경유지_상차", "경유지_하차", "특수운임"]);
const ymOf = (o) => String(o?.마감월 || "").slice(0, 7) || String(o?.상차일 || "").slice(0, 7);
const MSG = (c, ym) => `${c} ${Number(String(ym).slice(5))}월은 최종마감 이후 수정이 불가합니다.\n필요 시 경리팀에 해제요청 해주세요.`;
export function useFinalLockGuard(company, bypass = false) {
  const desk = useArDesk(String(company || "").trim());
  const ref = React.useRef({ closes: null, bypass });
  ref.current = { closes: desk.closes, bypass };
  React.useEffect(() => {
    const lockedOf = (o) => {
      const { closes } = ref.current; const c = String(o?.거래처명 || "").trim(); if (!c || !closes) return null;
      const ym = ymOf(o); return isFinalLocked(closes.get(`${c}|${ym}`)) ? MSG(c, ym) : null;
    };
    const anyLocked = () => { const { closes } = ref.current; return !!closes && [...closes.values()].some(isFinalLocked); };
    setOrderGuard(async (docRef, data) => {
      if (ref.current.bypass || !anyLocked() || !Object.keys(data).some((k) => CONTENT.has(k))) return null;
      let cur = {}; try { const s = await getDoc(docRef); cur = s.exists() ? s.data() : {}; } catch { /* 못 읽으면 고칠 값으로만 */ }
      return lockedOf(cur) || lockedOf({ ...cur, ...data });
    });
    setDeleteGuard(async (items) => {
      if (ref.current.bypass || !anyLocked()) return null;
      for (const it of items || []) { try { const s = await getDoc(doc(db, it.col, it.id)); const m = s.exists() ? lockedOf(s.data()) : null; if (m) return m; } catch { /* 무시 */ } }
      return null;
    });
    return () => { setOrderGuard(null); setDeleteGuard(null); };
  }, []);
}
