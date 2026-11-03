// ======================= src/NotifyCenter.jsx =======================
// 🔔 2026-11-03 알림 통합 — PC·모바일 화면 가운데 알림 팝업(오른쪽 아래·아래쪽 배너 대신)
//  나에게 온 "아직 안 본" 것을 하나씩 보여 준다(여러 개면 최신 것부터 · 닫으면 다음 · "1 / 3" 표시):
//   · 공지사항(회사 공지 · 플랫폼 공지) · 인사발령 공문 · 부고
//   · 전자결재 — 결재 요청(내 차례) · 결재 취소 요청 · 내가 올린 문서의 승인/반려/취소 결과 · 참조(최종 승인)
//   · 인수인계(내가 받은 것)
//  [닫기]나 [바로 가기]를 누르면 읽음으로 저장 — 화면 숫자·맨 위 공지 띠와 같은 기록을 쓴다:
//   공지 notices.readBy · 플랫폼 공지 이 브라우저(PlatformNoticeBanner) · 인수인계 handovers.readBy(+메일함 사본)
//   결재 결과 approvals.drafterUnread=false·seenBy · 참조 ccReadBy · 결재 요청 line[step].viewedAt(결재함에서 연 것과 같음)
//   결재 취소 요청만 서버 기록이 없어 이 브라우저에 남긴다
//  예약 공지(publishAt)는 게시 시각이 지나야 나타난다(1분마다 다시 확인).
import React from "react";
import { createPortal } from "react-dom";
import { db, DEFAULT_COMPANY } from "./firebase";
import { arrayUnion, collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { canSeeNotice } from "./NoticeBoard";
import { usePlatformNotices, usePlatformRead, markPlatformNoticeRead, PlatformBadge } from "./PlatformNoticeBanner";
import { RichHtml } from "./richText";
import { DAY_MS, isNoticeUnread, noticeAtMs, toMs, useMinuteTick } from "./notifyCore";

const ApprovalDocPreview = React.lazy(() => import("./Approval").then((m) => ({ default: m.ApprovalDocPreview })));

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const NOTICE_POP_WINDOW = 3 * DAY_MS;    // 공지·인사발령: 최근 3일 안의 안 읽은 글만 팝업(오래된 글은 메뉴 숫자로)
const HANDOVER_POP_WINDOW = 7 * DAY_MS;
const APPROVAL_POP_WINDOW = 30 * DAY_MS;
const CC_POP_WINDOW = 7 * DAY_MS;
const LOCAL_KEY = "kpNotifySeen"; // 결재 취소 요청처럼 서버에 "봤음" 칸이 없는 것만

const readLocal = () => { try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const addLocal = (k) => { try { const l = readLocal(); if (!l.includes(k)) localStorage.setItem(LOCAL_KEY, JSON.stringify([...l, k].slice(-300))); } catch { /* 무시 */ } };
const receiversOf = (h) => (Array.isArray(h?.receiverUids) && h.receiverUids.length ? h.receiverUids : h?.receiverUid ? [h.receiverUid] : []);
const coOf = (x) => String(x?.companyName || DEFAULT_COMPANY || "").trim();

// 종류별 머리글(크게 · 자간 넓게 · 한 줄) — 영어 작은 이름표
const KIND = {
  notice: { head: "공지사항", en: "NOTICE", go: "공지사항에서 열기" },
  platform: { head: "공지사항", en: "PLATFORM NOTICE", go: "공지사항에서 열기" },
  hr: { head: "인사발령 공문", en: "PERSONNEL ORDER", go: "인사발령 문서 열기" },
  obit: { head: "부고", en: "OBITUARY", go: "공지사항에서 열기" },
  apReq: { head: "결재 요청", en: "APPROVAL REQUEST", go: "전자결재에서 열기" },
  apCancelReq: { head: "결재 취소 요청", en: "CANCEL REQUEST", go: "전자결재에서 열기" },
  apOk: { head: "결재 승인", en: "APPROVED", go: "전자결재에서 열기" },
  apNo: { head: "결재 반려", en: "REJECTED", go: "전자결재에서 열기" },
  apCancel: { head: "결재 취소", en: "CANCELLED", go: "전자결재에서 열기" },
  apCancelNo: { head: "취소 거부", en: "CANCEL REJECTED", go: "전자결재에서 열기" },
  apCc: { head: "결재 참조", en: "CC · APPROVED", go: "전자결재에서 열기" },
  handover: { head: "인수인계", en: "HANDOVER", go: "인수인계 열기" },
};

// 결재 문서 한 건 → 나에게 띄울 팝업(없으면 null)
function approvalItem(d, uid, now, localSeen) {
  if ((d.hiddenBy || []).includes(uid)) return null;
  const at = toMs(d.updatedAt) || toMs(d.createdAt);
  const base = { id: d.id, at, doc: d, title: d.title || d.formLabel || "결재 문서" };
  const who = `${d.drafter?.name || ""} ${d.drafter?.position || ""}`.trim();
  if (now - at > APPROVAL_POP_WINDOW) return null;
  // 내 결재 차례 — 결재함에서 열어 본 적(viewedAt)이 없으면
  if (d.status === "pending" && d.line?.[d.step]?.uid === uid && !d.line[d.step].viewedAt)
    return { ...base, key: `apr:${d.id}:${d.step}`, kind: "apReq", sub: `${who} · ${d.formLabel || ""}`.replace(/ · $/, ""), page: "inbox", mark: { t: "apReq" } };
  if (d.status === "approved" && d.cancel?.status === "pending" && d.cancel.line?.[d.cancel.step]?.uid === uid) {
    const k = `apc:${d.id}:${d.cancel.step}`;
    if (!localSeen.includes(k)) return { ...base, key: k, kind: "apCancelReq", sub: `${who} · 사유: ${d.cancel?.reason || ""}`, page: "inbox", mark: { t: "local", k } };
  }
  // 내가 올린 문서의 결과
  const mineNew = d.drafterUid === uid && (d.drafterUnread === true || (d.drafterUnread === undefined && d.status === "rejected" && !(d.seenBy || []).includes(uid)));
  if (mineNew) {
    const line = d.line || [];
    const okN = line.filter((x) => x.status === "approved").length;
    let kind = "apOk"; let sub = "";
    if (d.status === "rejected") { const r = line.find((x) => x.status === "rejected"); kind = "apNo"; sub = `${r?.name || ""} ${r?.position || ""} · 사유: ${r?.comment || "-"}`; }
    else if (d.status === "cancelled") { kind = "apCancel"; sub = "문서가 결재 취소되었습니다."; }
    else if (d.status === "approved" && d.cancel?.status === "rejected") { const r = (d.cancel.line || []).find((x) => x.status === "rejected"); kind = "apCancelNo"; sub = `${r?.name || ""} · ${r?.comment || ""}`; }
    else if (d.status === "approved") sub = "결재가 모두 끝났습니다(최종 승인).";
    else { const last = [...line].reverse().find((x) => x.status === "approved"); sub = `${last ? `${last.name || ""} ${last.position || ""} 승인 · ` : ""}${okN}/${line.length} 진행 중`; }
    return { ...base, key: `apm:${d.id}:${d.status}:${okN}`, kind, sub, page: "mine", mark: { t: "apMine" } };
  }
  // 참조 — 최종 승인된 문서
  if ((d.ccUids || []).includes(uid) && d.drafterUid !== uid && d.status === "approved" && !(d.ccReadBy || []).includes(uid) && now - at < CC_POP_WINDOW)
    return { ...base, key: `apcc:${d.id}`, kind: "apCc", sub: `${who} · 최종 승인된 문서`, page: "inbox", mark: { t: "apCc" } };
  return null;
}

// 읽음 저장 — 각 종류의 원래 기록 칸에
async function markRead(it, uid) {
  try {
    if (it.src === "notice") await updateDoc(doc(db, "notices", it.id), { readBy: arrayUnion(uid) });
    else if (it.src === "platform") markPlatformNoticeRead(it.id);
    else if (it.src === "handover") {
      await updateDoc(doc(db, "handovers", it.id), { readBy: arrayUnion(uid) });
      updateDoc(doc(db, "internalMails", `handover_${it.id}`), { readBy: arrayUnion(uid) }).catch(() => {}); // 메일함 사본(서버가 만든 것)도 읽음
    } else if (it.src === "approval") {
      const d = it.doc;
      if (it.mark.t === "apReq") await updateDoc(doc(db, "approvals", d.id), { line: d.line.map((s, i) => (i === d.step ? { ...s, viewedAt: Date.now() } : s)) });
      else if (it.mark.t === "apMine") await updateDoc(doc(db, "approvals", d.id), { drafterUnread: false, seenBy: arrayUnion(uid) });
      else if (it.mark.t === "apCc") await updateDoc(doc(db, "approvals", d.id), { ccReadBy: arrayUnion(uid) });
      else if (it.mark.t === "local") addLocal(it.mark.k);
    }
  } catch { /* 권한·연결 문제는 무시 — 이 화면에서는 이미 닫혔다 */ }
}

// 공지·인수인계·결재 구독 + 팝업 대기열(최신 것부터)
export function useNotifyQueue({ uid, role, team = "", company = "" }) {
  const now = useMinuteTick();
  const [notices, setNotices] = React.useState(null);
  const [aps, setAps] = React.useState(null);
  const [hos, setHos] = React.useState(null);
  const co = String(company || "").trim();
  const plat = usePlatformNotices({ audience: "carrier", company: co });
  const platRead = usePlatformRead();
  const [localSeen, setLocalSeen] = React.useState(readLocal);
  React.useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(collection(db, "notices"), (s) => setNotices(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setNotices([]));
  }, [uid, co]);
  React.useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(query(collection(db, "approvals"), where("participants", "array-contains", uid)), (s) => setAps(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setAps([]));
  }, [uid]);
  React.useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(collection(db, "handovers"), (s) => setHos(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setHos([]));
  }, [uid, co]);
  const queue = React.useMemo(() => {
    if (!uid) return [];
    const out = [];
    const me = { uid, role, team };
    (notices || []).forEach((n) => {
      if (co && coOf(n) !== co) return;
      if (!canSeeNotice(n, me) || !isNoticeUnread(n, uid, now, NOTICE_POP_WINDOW)) return;
      const kind = n.category === "인사발령" ? "hr" : n.category === "부고" ? "obit" : "notice";
      out.push({ key: `n:${n.id}`, src: "notice", id: n.id, openId: n.id, kind, at: noticeAtMs(n), title: n.title || n.category || "공지사항", sub: `${n.author || ""}${n.category && kind === "notice" && n.category !== "공지사항" ? ` · ${n.category}` : ""}`, content: n.content, contentHtml: n.contentHtml, image: n.image });
    });
    plat.forEach((n) => {
      if (platRead.has(n.id) || n.authorUid === uid) return;
      const at = n.publishAt || toMs(n.createdAt);
      if (at && now - at > NOTICE_POP_WINDOW) return;
      out.push({ key: `p:${n.id}`, src: "platform", id: n.id, openId: `plat:${n.id}`, kind: "platform", at, title: n.title || "플랫폼 공지", sub: `${n.author || "KP-Flow 운영팀"} · ${n.level || "안내"}`, content: n.body, contentHtml: n.bodyHtml });
    });
    (hos || []).forEach((h) => {
      if (co && coOf(h) !== co) return;
      if (!receiversOf(h).includes(uid) || (h.readBy || []).includes(uid) || (h.authorUid && h.authorUid === uid)) return;
      const at = toMs(h.createdAt) || toMs(h.date);
      if (at && now - at > HANDOVER_POP_WINDOW) return;
      out.push({ key: `h:${h.id}`, src: "handover", id: h.id, kind: "handover", at, title: `${h.author || ""}님의 인수인계`, sub: `${h.date || ""}${h.receiver ? ` · 받는 사람 ${h.receiver}` : ""}`, content: h.text });
    });
    (aps || []).forEach((d) => { const it = approvalItem(d, uid, now, localSeen); if (it) out.push({ ...it, src: "approval" }); });
    return out.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 50);
  }, [uid, role, team, co, notices, plat, platRead, hos, aps, now, localSeen]);
  const ready = notices !== null && aps !== null && hos !== null;
  return { queue, ready, bumpLocal: () => setLocalSeen(readLocal()) };
}

// 넘치는 본문 — 아래쪽 흐림 + "전체 보기 →"
function ScrollBody({ children, onMore, moreLabel = "전체 보기 →" }) {
  const ref = React.useRef(null);
  const [more, setMore] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const check = () => setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 8);
    check();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el); if (el.firstElementChild) ro?.observe(el.firstElementChild);
    el.addEventListener("scroll", check, { passive: true });
    const t = setTimeout(check, 400);
    return () => { ro?.disconnect(); el.removeEventListener("scroll", check); clearTimeout(t); };
  }, [children]);
  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div ref={ref} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-7 py-5" data-testid="notify-body"><div>{children}</div></div>
      {more && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 flex items-end justify-center pb-3" style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0), #fff 72%)" }}>
          <button type="button" onClick={onMore} className="pointer-events-auto h-9 px-4 rounded-full bg-[#0F1A30] text-white text-[13px] font-black shadow-[0_8px_20px_rgba(15,26,48,0.28)] whitespace-nowrap" data-testid="notify-more">{moreLabel}</button>
        </div>
      )}
    </div>
  );
}

// 팝업 한 장(화면 그리기만 — 테스트에서도 바로 쓴다)
export function NotifyModal({ item, index = 1, total = 1, company = "", mobile = false, onClose, onGo }) {
  React.useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  if (!item) return null;
  const K = KIND[item.kind] || KIND.notice;
  const isAp = item.src === "approval";
  const warn = item.kind === "apNo" || item.kind === "apCancelNo";
  const when = item.at ? new Date(item.at).toLocaleString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }) : "";
  return createPortal(
    <div className="fixed inset-0 z-[999995] flex items-center justify-center px-3 sm:px-6" style={{ background: "rgba(11,20,40,0.55)", backdropFilter: "blur(2px)" }} data-testid="notify-modal">
      <div className="kp-notify-in w-full flex flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_30px_80px_rgba(11,20,40,0.45)] ring-1 ring-white/10"
        style={mobile ? { maxWidth: 560, maxHeight: "min(70vh, 70dvh)" } : { width: "min(880px, 92vw)", maxHeight: "75vh" }}
        role="dialog" aria-modal="true" aria-label={K.head}>
        {/* 머리 — 종류를 크게 한 줄로(좁은 휴대폰에서도 줄바꿈·잘림 없이 글씨가 줄어든다) */}
        <div className="relative shrink-0 px-5 sm:px-7 pt-4 pb-4 text-white" style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="min-w-0 inline-flex items-center gap-2 whitespace-nowrap truncate">
              <span className="text-[11.5px] font-extrabold tracking-[0.22em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{K.en}</span>
              {when && <span className="text-[13px] font-bold text-white/80 tracking-normal" style={{ fontFamily: "'Noto Sans KR','Pretendard',system-ui,sans-serif" }}>{when}</span>}
            </span>
            {total > 1 && <span className="ml-auto shrink-0 h-6 px-2.5 rounded-full bg-white/10 ring-1 ring-white/20 text-[11.5px] font-black tabular-nums grid place-items-center" style={{ fontFamily: MONO }} data-testid="notify-count">{index} / {total}</span>}
          </div>
          <div className="mt-1.5 font-black whitespace-nowrap overflow-hidden leading-[1.15]" data-testid="notify-head"
            style={{ fontSize: mobile ? "clamp(19px, 6.4vw, 30px)" : "clamp(24px, 2.6vw, 34px)", letterSpacing: mobile ? "0.3em" : "0.34em", color: warn ? "#FFD6D3" : "#fff" }}>{K.head}</div>
        </div>
        {/* 제목 */}
        <div className="shrink-0 px-5 sm:px-7 pt-4 pb-3 border-b border-[#EEF1F6]">
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            {item.src === "platform" && <PlatformBadge />}
            {item.sub && <span className="text-[12.5px] font-bold text-[#5A6A85] break-words">{item.sub}</span>}
          </div>
          <div className="mt-1 text-center text-[18px] sm:text-[22px] font-black text-[#0F1A30] leading-snug break-words line-clamp-2">{item.title}</div>
        </div>
        {/* 본문 — 높이 상한 안에서만 스크롤 */}
        <ScrollBody onMore={() => onGo?.(item)}>
          {isAp ? (
            <div className="rounded-2xl bg-[#EEF1F6] p-2 sm:p-4">
              <React.Suspense fallback={<div className="py-10 text-center text-[13px] text-[#7A879C]">문서를 불러오는 중…</div>}>
                <ApprovalDocPreview d={item.doc} company={company} />
              </React.Suspense>
            </div>
          ) : item.kind === "hr" && item.image ? (
            <div className="space-y-4">
              {/* 공문 — 사진처럼 종이 한 장 */}
              <div className="mx-auto max-w-[640px] rounded-xl bg-white p-2 sm:p-3 shadow-[0_14px_36px_rgba(15,26,48,0.18)] ring-1 ring-[#E3E8F0]">
                <img src={item.image} alt="인사발령 공문" className="w-full h-auto block rounded-md" />
              </div>
              {(item.content || item.contentHtml) && <RichHtml html={item.contentHtml} text={item.content} className="text-center text-[16px] sm:text-[17px] font-semibold text-[#0F1A30] leading-[1.8] antialiased" />}
            </div>
          ) : (
            <div className="space-y-4">
              {(item.content || item.contentHtml)
                ? <RichHtml html={item.contentHtml} text={item.content} className="text-center text-[16.5px] sm:text-[18px] font-semibold text-[#0F1A30] leading-[1.8] break-words antialiased" />
                : <div className="text-center text-[14px] text-[#9AA9C3]">내용이 없습니다.</div>}
              {item.image && <img src={item.image} alt="" className="mx-auto w-full max-w-[640px] h-auto rounded-xl border border-[#E3E8F0]" />}
            </div>
          )}
        </ScrollBody>
        {/* 버튼 */}
        <div className="shrink-0 flex justify-center gap-2 px-4 sm:px-7 py-3 border-t border-[#EEF1F6] bg-[#F8FAFD]" style={mobile ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" } : undefined}>
          <button type="button" onClick={onClose} className="h-10 px-5 min-w-[96px] rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-black text-[#1B2B4B] whitespace-nowrap" data-testid="notify-close">{total > 1 ? "닫고 다음" : "닫기"}</button>
          <button type="button" onClick={() => onGo?.(item)} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black whitespace-nowrap overflow-hidden text-ellipsis" data-testid="notify-go">{K.go} →</button>
        </div>
      </div>
      <style>{`@keyframes kpNotifyIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}.kp-notify-in{animation:kpNotifyIn .26s cubic-bezier(.2,.9,.3,1.1) both}`}</style>
    </div>, document.body);
}

// 앱에 한 번 — onGo(item): { src, kind, id, openId, page } 받아서 그 메뉴로 이동
export default function NotifyCenter({ uid, role, team = "", company = "", mobile = false, onGo }) {
  const { queue, ready, bumpLocal } = useNotifyQueue({ uid, role, team, company });
  const [done, setDone] = React.useState(() => new Set()); // 방금 닫은 것(서버 기록이 돌아오기 전에도 바로 사라지게)
  const [curKey, setCurKey] = React.useState(null);
  const [armed, setArmed] = React.useState(false); // 켜자마자(로딩 화면 위로) 뜨지 않게 잠깐 기다린다
  React.useEffect(() => { const t = setTimeout(() => setArmed(true), 1800); return () => clearTimeout(t); }, []);
  const live = queue.filter((x) => !done.has(x.key));
  // 보고 있는 팝업은 새 알림이 와도 바뀌지 않게(닫으면 최신 것부터 다음)
  const cur = live.find((x) => x.key === curKey) || live[0] || null;
  React.useEffect(() => { if (cur && cur.key !== curKey) setCurKey(cur.key); }, [cur, curKey]);
  if (!uid || !ready || !armed || !cur) return null;
  const finish = (it) => {
    setDone((p) => new Set(p).add(it.key));
    setCurKey(null);
    markRead(it, uid).then(() => { if (it.mark?.t === "local") bumpLocal(); });
  };
  return (
    <NotifyModal item={cur} index={1} total={live.length} company={company} mobile={mobile}
      onClose={() => finish(cur)}
      onGo={(it) => { finish(it); onGo?.(it); }} />
  );
}
