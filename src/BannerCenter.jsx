// ======================= src/BannerCenter.jsx =======================
// 🔔 화면 오른쪽 아래 알림 배너(2026-10-27) — 카톡 알림처럼 쌓였다가 저절로 사라진다.
//  ⭐ 2026-11-03 알림 통합 — 공지·인사발령·전자결재·인수인계는 여기서 빼고 가운데 팝업(NotifyCenter.jsx)으로 옮겼다.
//   여기 남은 것: 일반 사내메일 · 마감보고 메일 · 다른 화면이 보내는 배너(개인 일정 · 퇴근 알림 등 "kp-banner")
//  - BannerCard: 공지·일정·인수인계·메일·인사발령 공용 카드(네이비 한 가지 톤)
//  - BannerCenter: 접속해 있는 동안 새로 온 사내메일(인사발령·마감보고 포함)을 배너로 띄운다.
//    누르면 사내메일함에서 그 메일이 바로 열린다(MailHeaderButton이 "kp-open-mail"을 받는다).
import React from "react";
import { createPortal } from "react-dom";
import { db, auth } from "./firebase";
import { arrayUnion, collection, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";

const ICONS = {
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  hr: <><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>,
  closeReport: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  notice: <><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></>,
  schedule: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  handover: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  approval: <><path d="M9 3h6l-1 7h4l1 4H5l1-4h4z" /><path d="M5 18h14M7 21h10" /></>,
  attendance: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></>, // ⭐ 2026-11-03 퇴근 알림
};
export const BANNER_LABEL = { mail: "사내메일", hr: "인사발령", closeReport: "마감보고", notice: "공지사항", schedule: "일정", handover: "인수인계", approval: "전자결재", attendance: "근태" };

export function BannerCard({ id, kind = "mail", label, title, body, from, image, duration = 10000, onClick, onClose }) {
  const [hover, setHover] = React.useState(false);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  // 남은 시간을 기억 — 마우스를 올리면 멈추고, 떼면 이어서 줄어든다(부모가 다시 그려져도 처음부터 다시 세지 않음)
  const leftRef = React.useRef(duration);
  React.useEffect(() => {
    if (hover || !duration) return undefined;
    const start = Date.now();
    const t = setTimeout(() => closeRef.current?.(id), leftRef.current);
    return () => { clearTimeout(t); leftRef.current = Math.max(300, leftRef.current - (Date.now() - start)); };
  }, [hover, duration, id]);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={onClick}
      className="kp-banner-in pointer-events-auto w-[340px] max-w-[calc(100vw-24px)] cursor-pointer select-none rounded-[18px] overflow-hidden bg-white ring-1 ring-[#0F1A30]/10 shadow-[0_18px_44px_rgba(15,26,48,0.28)]">
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
        <span className="w-10 h-10 rounded-[13px] flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#0F1A30,#2D4C82)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICONS[kind] || ICONS.mail}</svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10.5px] font-black tracking-[0.14em] text-[#4B6CB7]">{label || BANNER_LABEL[kind] || "알림"}</span>
            {from && <span className="text-[11.5px] font-semibold text-[#9AA9C3] truncate">· {from}</span>}
            <span className="ml-auto text-[11px] text-[#B4BFD0] shrink-0">지금</span>
          </div>
          <div className="text-[14px] font-black text-[#0F1A30] leading-snug mt-0.5 line-clamp-2 break-words">{title}</div>
          {body && <div className="text-[12.5px] text-[#5A6A85] leading-relaxed mt-0.5 line-clamp-2 whitespace-pre-line break-words">{body}</div>}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onClose?.(id); }} className="w-6 h-6 -mr-1 rounded-full flex items-center justify-center text-[#9AA9C3] hover:bg-[#EEF1F6] hover:text-[#0F1A30] shrink-0 text-[13px]">✕</button>
      </div>
      {image && <div className="px-4 pb-3"><img src={image} alt="" className="w-full max-h-[150px] object-cover object-top rounded-xl border border-[#E3E8F0]" /></div>}
      <div className="h-[3px] bg-[#EEF1F6]">
        {duration ? <div className="h-full bg-[#1B2B4B] kp-banner-bar" style={{ animationDuration: `${duration}ms`, animationPlayState: hover ? "paused" : "running" }} /> : null}
      </div>
    </div>
  );
}

export function BannerStyles() {
  return (
    <style>{`
      @keyframes kpBannerIn { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: none; } }
      @keyframes kpBannerBar { from { width: 100%; } to { width: 0%; } }
      .kp-banner-in { animation: kpBannerIn .32s cubic-bezier(.2,.9,.3,1.2) both; }
      .kp-banner-bar { animation-name: kpBannerBar; animation-timing-function: linear; animation-fill-mode: forwards; }
    `}</style>
  );
}

// 접속 중 새 사내메일 → 배너
export default function BannerCenter({ bottom = 24 }) {
  const [uid, setUid] = React.useState(auth.currentUser?.uid || null);
  const [items, setItems] = React.useState([]);
  React.useEffect(() => auth.onAuthStateChanged((u) => setUid(u?.uid || null)), []);
  React.useEffect(() => {
    if (!uid) return undefined;
    let first = true;
    const startedAt = Date.now() - 60000;
    return onSnapshot(query(collection(db, "internalMails"), where("to", "array-contains", uid)), (snap) => {
      if (first) { first = false; return; } // 접속 전 메일은 메일함 숫자로만
      snap.docChanges().forEach((c) => {
        if (c.type !== "added") return;
        const m = { id: c.doc.id, ...c.doc.data() };
        if (m.fromUid === uid) return;
        if (m.kind === "approval") return; // 전자결재 결과 메일은 기록용 — 알림은 가운데 팝업(NotifyCenter)
        // ⭐ 2026-11-03 알림 통합 — 인사발령 공문·부고(공지 안내 메일)·인수인계 사본은 가운데 팝업(NotifyCenter)이 공지/인수인계로 띄운다(배너 중복 없앰)
        if (m.kind === "handover" || m.kind === "notice" || (m.kind === "hr" && /^\[인사발령/.test(String(m.subject || "")))) return;
        const at = m.at?.toMillis ? m.at.toMillis() : Date.now();
        if (at < startedAt) return;
        // ⭐ 2026-11-01 같은 내용의 공지(인사발령·부고) 배너가 홈에서 또 뜨지 않게 "본 것"으로 남긴다(이 기기 + 내 계정)
        if (m.noticeKey) {
          try { const k = JSON.parse(localStorage.getItem("permDismissed") || "[]"); if (!k.includes(m.noticeKey)) localStorage.setItem("permDismissed", JSON.stringify([...k, m.noticeKey].slice(-300))); } catch { /* 무시 */ }
          setDoc(doc(db, "userSeenNotifs", uid), { keys: arrayUnion(m.noticeKey) }, { merge: true }).catch(() => {});
        }
        setItems((p) => (p.some((x) => x.id === m.id) ? p : [...p, m].slice(-4)));
      });
    }, () => {});
  }, [uid]);
  // ⭐ 2026-11-03 알림 통합 — 전자결재(결재 요청·승인·반려·참조) 배너는 없앴다. 화면 가운데 알림 팝업(NotifyCenter)이 띄운다
  // ⭐ 2026-11-03 다른 화면이 띄우는 배너(퇴근 10분 전 · 오늘 개인일정 등) — window.dispatchEvent(new CustomEvent("kp-banner", { detail }))
  //  detail = { id, kind: "schedule"|..., label, title, body, duration, open }  · open: 누르면 보낼 창 이벤트 이름(예: "kp-open-personal-schedule")
  React.useEffect(() => {
    const h = (e) => {
      const d = e.detail || {};
      if (!d.title) return;
      const id = d.id || `cb-${Date.now()}`;
      setItems((p) => (p.some((x) => x.id === id) ? p : [...p, { ...d, id, custom: true }].slice(-4)));
    };
    window.addEventListener("kp-banner", h);
    return () => window.removeEventListener("kp-banner", h);
  }, []);
  const close = React.useCallback((id) => setItems((p) => p.filter((x) => x.id !== id)), []);
  if (!items.length) return <BannerStyles />;
  return createPortal(
    <>
      <BannerStyles />
      {/* ⭐ 2026-11-02 화면 점검 — 배너가 쌓여도 위쪽 머리말(메뉴 버튼)까지 올라가지 않게 높이 상한(화면 - bottom - 머리말 84px)
          · 넘치면 오래된(위쪽) 배너부터 잘려 보이지 않음 · 휴대폰(640px 미만)은 최근 2개만 · 바깥 틀은 누름 통과(pointer-events-none), 카드만 누름 */}
      <div className="fixed right-3 sm:right-6 z-[999990] flex flex-col justify-end gap-2.5 items-end pointer-events-none overflow-hidden px-3 -mx-3 pt-3 pb-4 -mb-4"
        style={{ bottom, maxHeight: `calc(100dvh - ${typeof bottom === "number" ? `${bottom}px` : bottom} - 84px)` }}>
        {items.slice(typeof window !== "undefined" && window.innerWidth < 640 ? -2 : -4).map((m) => m.custom ? (
          <BannerCard key={m.id} id={m.id} kind={m.kind || "schedule"} label={m.label} title={m.title} body={m.body} duration={m.duration ?? 15000} onClose={close}
            onClick={() => { if (m.open) window.dispatchEvent(new CustomEvent(m.open, { detail: m.openDetail || null })); close(m.id); }} />
        ) : (
          <BannerCard key={m.id} id={m.id} kind={m.kind === "hr" || m.kind === "closeReport" || m.kind === "approval" ? m.kind : "mail"}
            from={m.fromName} title={m.subject || "(제목 없음)"} body={String(m.body || "").replace(/\n{2,}/g, "\n").slice(0, 160)}
            image={(m.images || [])[0]} duration={m.kind === "hr" ? 15000 : 10000}
            onClose={close}
            onClick={() => {
              if (m.kind === "approval") { window.__kpOpenApproval = { id: m.approvalId, page: m.page }; window.dispatchEvent(new Event("kp-open-approval")); }
              else window.dispatchEvent(new CustomEvent("kp-open-mail", { detail: { id: m.id } }));
              close(m.id);
            }} />
        ))}
      </div>
    </>, document.body);
}
