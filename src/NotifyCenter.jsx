// ======================= src/NotifyCenter.jsx =======================
// 🔔 2026-11-03 알림 통합 — PC·모바일 화면 가운데 알림 팝업(오른쪽 아래·아래쪽 배너 대신)
// 🔔 2026-11-18 알림 브리핑 — 한 장씩이 아니라 "한 창"에 분류별로 묶어서(아래 NotifyBundle) · 임원/대표는 골드 디자인
//  나에게 온 "아직 안 본" 것을 모은다:
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
import { usePlatformNotices, usePlatformRead, markPlatformNoticeRead, PlatformBadge, hidePlatformNoticeForever, platformSessionClosed } from "./PlatformNoticeBanner";
import { RichHtml } from "./richText";
import { DAY_MS, isNoticeUnread, noticeAtMs, toMs, useMinuteTick } from "./notifyCore";
import { isPopupOn, popupCatOfNotify, usePopupPrefs } from "./popupPrefs";
import { useLeavePopupOn } from "./leaveBasis"; // 🔕 2026-11-26 연차 촉진 팝업 회사 설정
import { usePopupTurn } from "./popupTurn"; // 🪟 2026-11-18 접속 팝업 차례(알림 브리핑 → 축하 → 생일 → 일일 보고)

const ApprovalDocPreview = React.lazy(() => import("./Approval").then((m) => ({ default: m.ApprovalDocPreview })));

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
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
  apPaid: { head: "지급 완료", en: "PAID", go: "전자결재에서 열기" }, // ⭐ 2026-11-04 지출결의 지급완료
  handover: { head: "인수인계", en: "HANDOVER", go: "인수인계 열기" },
  // ⭐ 2026-11-06 인사·급여 알림(hrNotices) — 급여명세서 발행 · 연차 사용 촉진(근로기준법 61조)
  payslip: { head: "급여명세서", en: "PAYSLIP", go: "급여명세서 열기" },
  leave1: { head: "연차 사용 촉진", en: "ANNUAL LEAVE · 1ST NOTICE", go: "사용 계획 제출" },
  leave2: { head: "연차 사용시기 지정", en: "ANNUAL LEAVE · 2ND NOTICE", go: "연차 사용 계획 보기" },
  leaveHr: { head: "연차 사용 촉진", en: "HR · LEAVE PROMOTION", go: "연차 사용 촉진 열기" },
  leavePlan: { head: "연차 사용 계획", en: "HR · LEAVE PLAN", go: "연차 사용 촉진 열기" },
};
const HR_NOTICE_POP_WINDOW = 30 * DAY_MS;

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
    else if (d.status === "approved" && d.paid?.at) { kind = "apPaid"; sub = `[지급 완료] ${d.title || ""} — ${Math.round(Number(d.amount) || 0).toLocaleString("ko-KR")}원 지급되었습니다${d.paid.date ? ` · 지급일 ${d.paid.date}` : ""}`; }
    else if (d.status === "approved") sub = "결재가 모두 끝났습니다(최종 승인).";
    else { const last = [...line].reverse().find((x) => x.status === "approved"); sub = `${last ? `${last.name || ""} ${last.position || ""} 승인 · ` : ""}${okN}/${line.length} 진행 중`; }
    return { ...base, key: `apm:${d.id}:${d.status}:${okN}${d.status === "approved" && d.paid?.at ? `:paid${d.paid.at}` : ""}`, kind, sub, page: "mine", mark: { t: "apMine" } };
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
    else if (it.src === "hrNotice") await updateDoc(doc(db, "hrNotices", it.id), { readAt: Date.now() });
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
  const [hrn, setHrn] = React.useState([]); // ⭐ 2026-11-06 인사·급여 알림(본인 것만 — 보안 규칙)
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
  React.useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(query(collection(db, "hrNotices"), where("uid", "==", uid)), (s) => setHrn(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setHrn([]));
  }, [uid]);
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
      if (platRead.has(n.id) || platformSessionClosed().has(n.id) || n.authorUid === uid) return; // ⭐ 2026-11-04 닫기(이번 접속)·다시 보지 않기(계정)
      const at = n.publishAt || toMs(n.createdAt);
      if (at && now - at > NOTICE_POP_WINDOW) return;
      out.push({ key: `p:${n.id}`, src: "platform", id: n.id, openId: `plat:${n.id}`, kind: "platform", at, title: n.title || "플랫폼 공지", sub: `${n.author || "LogisWeb 운영팀"} · ${n.level || "안내"}`, content: n.body, contentHtml: n.bodyHtml });
    });
    (hos || []).forEach((h) => {
      if (co && coOf(h) !== co) return;
      if (!receiversOf(h).includes(uid) || (h.readBy || []).includes(uid) || (h.authorUid && h.authorUid === uid)) return;
      const at = toMs(h.createdAt) || toMs(h.date);
      if (at && now - at > HANDOVER_POP_WINDOW) return;
      out.push({ key: `h:${h.id}`, src: "handover", id: h.id, kind: "handover", at, title: `${h.author || ""}님의 인수인계`, sub: `${h.date || ""}${h.receiver ? ` · 받는 사람 ${h.receiver}` : ""}`, content: h.text });
    });
    (aps || []).forEach((d) => { const it = approvalItem(d, uid, now, localSeen); if (it) out.push({ ...it, src: "approval" }); });
    (hrn || []).forEach((h) => {
      if (h.readAt || (co && coOf(h) !== co)) return;
      const at = toMs(h.createdAt) || now;
      if (now - at > HR_NOTICE_POP_WINDOW) return;
      out.push({ key: `hn:${h.id}`, src: "hrNotice", id: h.id, kind: KIND[h.kind] ? h.kind : "notice", link: h.link || "", refId: h.refId || "", at, title: h.title || "인사 알림", sub: "인사관리부", content: h.body });
    });
    return out.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 50);
  }, [uid, role, team, co, notices, plat, platRead, hos, aps, hrn, now, localSeen]);
  const ready = notices !== null && aps !== null && hos !== null;
  return { queue, ready, bumpLocal: () => setLocalSeen(readLocal()) };
}

// ═════════════════════════════════════════════════════════════════════════
// 🔔 2026-11-18 알림 브리핑 — 접속하면 공지 · 결재 · 인사 · 인수인계를 "한 창"에 분류별로 묶어 보여 준다
//  (예전: 한 장씩 따로 떠서 [다음]을 계속 눌러야 했다 — 사용자 요청으로 하나로 묶음)
//  · PC: 왼쪽 분류(전체 · 전자결재 · 공지사항 · 인사·급여 · 인수인계) → 가운데 목록 → 오른쪽 내용 미리보기
//  · 휴대폰: 위 분류 칩 → 목록 → 누르면 내용(← 목록)
//  · [확인] = 읽음(다음 건으로) · [바로 가기] = 읽음 + 그 화면으로 · [모두 확인] · [나중에 보기] = 이번 접속에서만 닫기(읽음 아님)
//  · 디자인: 일반 직원 = 프로그램 기본(흰 바탕 + 남색 머리) · 임원/대표 = 깊은 남색 + 골드(임원 화면과 같은 톤)
// ═════════════════════════════════════════════════════════════════════════
export const CATS = [
  { key: "all", label: "전체", en: "ALL" },
  { key: "approval", label: "전자결재", en: "APPROVAL" },
  { key: "notice", label: "공지사항", en: "NOTICE" },
  { key: "hr", label: "인사 · 급여", en: "HR" },
  { key: "handover", label: "인수인계", en: "HANDOVER" },
];
export function catOf(it) {
  if (it.src === "approval") return "approval";
  if (it.src === "handover") return "handover";
  if (it.src === "hrNotice" || it.kind === "hr") return "hr";
  return "notice";
}
const ICON = {
  all: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  approval: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  notice: <><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>,
  hr: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>,
  handover: <><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
};
const Ico = ({ k, size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[k] || ICON.all}</svg>;

// 색 — 일반(남색 · 흰 바탕) / 임원(깊은 남색 · 골드)
const THEME = {
  staff: {
    overlay: "rgba(11,20,40,0.55)", shell: "#FFFFFF", ring: "0 30px 80px rgba(11,20,40,0.45)",
    head: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)",
    eyebrow: "#8FB0F0", headText: "#FFFFFF", headSub: "rgba(255,255,255,.72)",
    rail: "#F5F8FD", railLine: "#E3E8F0", railOn: "#1B2B4B", railOnText: "#FFFFFF", railText: "#3A4A66",
    listBg: "#FFFFFF", line: "#EEF1F6", itemOn: "#EEF3FC", itemOnBar: "#1B2B4B", title: "#0F1A30", sub: "#5B6B85", faint: "#9AA9C3",
    detailBg: "#FFFFFF", paper: "#EEF1F6", accent: "#1B2B4B", chipBg: "#EEF3FC", chipText: "#1B2B4B",
    primary: { background: "#0F1A30", color: "#fff" }, ghost: { background: "#fff", color: "#1B2B4B", border: "1px solid #DCE3EE" },
    foot: "#F8FAFD", warn: "#C2362B", count: "#C2362B",
  },
  exec: {
    overlay: "rgba(3,7,16,0.66)", shell: "#0A1328", ring: "0 40px 100px rgba(0,0,0,.6), 0 0 0 1px rgba(215,188,130,.28)",
    head: "radial-gradient(600px 220px at 0% 0%, rgba(215,188,130,.16), transparent 70%), linear-gradient(120deg,#050A16 0%,#0A1328 55%,#0F1B36 100%)",
    eyebrow: "#D7BC82", headText: "#F4F6FB", headSub: "rgba(232,238,250,.62)",
    rail: "#070E1F", railLine: "rgba(215,188,130,.16)", railOn: "linear-gradient(135deg,#F3E3BC,#D7BC82)", railOnText: "#1A1405", railText: "rgba(232,238,250,.78)",
    listBg: "#0A1328", line: "rgba(255,255,255,.07)", itemOn: "rgba(215,188,130,.10)", itemOnBar: "#D7BC82", title: "#F4F6FB", sub: "rgba(232,238,250,.62)", faint: "rgba(232,238,250,.4)",
    detailBg: "#0C162E", paper: "#F3F5F9", accent: "#D7BC82", chipBg: "rgba(215,188,130,.14)", chipText: "#F3E3BC",
    primary: { background: "linear-gradient(135deg,#F3E3BC,#D7BC82)", color: "#1A1405" }, ghost: { background: "rgba(255,255,255,.05)", color: "rgba(232,238,250,.85)", border: "1px solid rgba(255,255,255,.12)" },
    foot: "#08101F", warn: "#FF9B94", count: "#D7BC82",
  },
};
const agoText = (ms) => { if (!ms) return ""; const m = Math.floor((Date.now() - ms) / 60000); if (m < 1) return "방금"; if (m < 60) return `${m}분 전`; const h = Math.floor(m / 60); if (h < 24) return `${h}시간 전`; const d = Math.floor(h / 24); return d < 7 ? `${d}일 전` : new Date(ms).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }); };
const MONO_S = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };

// 내용 — 결재 문서 미리보기 · 인사발령 공문 · 글
export function NotifyContent({ item, company = "", dark = false }) {
  if (item.src === "approval") return (
    <div className="rounded-2xl p-2 sm:p-4" style={{ background: dark ? "#F3F5F9" : "#EEF1F6" }}>
      <React.Suspense fallback={<div className="py-10 text-center text-[13px] text-[#7A879C]">문서를 불러오는 중…</div>}>
        <ApprovalDocPreview d={item.doc} company={company} />
      </React.Suspense>
    </div>
  );
  const textCls = `text-[15.5px] sm:text-[16.5px] font-semibold leading-[1.8] break-words antialiased ${dark ? "text-[#E8EEFA]" : "text-[#0F1A30]"}`;
  return (
    <div className="space-y-4">
      {item.kind === "hr" && item.image && (
        <div className="mx-auto max-w-[620px] rounded-xl bg-white p-2 sm:p-3 shadow-[0_14px_36px_rgba(15,26,48,0.18)] ring-1 ring-[#E3E8F0]">
          <img src={item.image} alt="인사발령 공문" className="w-full h-auto block rounded-md" />
        </div>
      )}
      {(item.content || item.contentHtml)
        ? <RichHtml html={item.contentHtml} text={item.content} className={textCls} />
        : !(item.kind === "hr" && item.image) && <div className={`text-[14px] ${dark ? "text-white/40" : "text-[#9AA9C3]"}`}>내용이 없습니다.</div>}
      {item.image && item.kind !== "hr" && <img src={item.image} alt="" className="w-full max-w-[620px] h-auto rounded-xl border border-[#E3E8F0]" />}
    </div>
  );
}

// 한 창(화면 그리기만 — 테스트에서도 바로 쓴다)
export function NotifyBundle({ items, exec = false, mobile = false, company = "", name = "", onRead, onGo, onNever, onReadAll, onLater }) {
  const T = exec ? THEME.exec : THEME.staff;
  const [cat, setCat] = React.useState("all");
  const [selKey, setSelKey] = React.useState(mobile ? "" : items[0]?.key || "");
  const counts = React.useMemo(() => { const c = { all: items.length }; items.forEach((it) => { const k = catOf(it); c[k] = (c[k] || 0) + 1; }); return c; }, [items]);
  const list = cat === "all" ? items : items.filter((it) => catOf(it) === cat);
  // 고른 건이 사라지면(확인) 같은 분류의 다음 건 · 분류가 비면 전체로
  React.useEffect(() => {
    if (cat !== "all" && !counts[cat]) { setCat("all"); return; }
    if (selKey && list.some((x) => x.key === selKey)) return;
    if (!mobile) setSelKey(list[0]?.key || "");
    else setSelKey("");
  }, [items, cat]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const h = (e) => { if (e.key === "Escape") { if (mobile && selKey) setSelKey(""); else onLater?.(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onLater, mobile, selKey]);
  const sel = items.find((x) => x.key === selKey) || null;
  const now = new Date(Date.now() + 9 * 3600e3);
  const ymd = `${now.toISOString().slice(0, 10).replace(/-/g, ".")} ${["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][now.getUTCDay()]}`;
  const approvalN = counts.approval || 0;
  const greet = `${name ? `${name}님, ` : ""}${approvalN ? `결재할 문서 ${approvalN}건을 포함해 ` : ""}확인할 알림이 ${items.length}건 있어요.`;
  const K = sel ? KIND[sel.kind] || KIND.notice : null;
  const warn = sel && (sel.kind === "apNo" || sel.kind === "apCancelNo");

  const catBtn = (c) => {
    const on = cat === c.key; const n = counts[c.key] || 0;
    if (c.key !== "all" && !n) return null;
    return (
      <button key={c.key} type="button" onClick={() => { setCat(c.key); if (!mobile) { const first = (c.key === "all" ? items : items.filter((x) => catOf(x) === c.key))[0]; setSelKey(first?.key || ""); } }}
        className={mobile ? "shrink-0 h-9 px-3.5 rounded-full inline-flex items-center gap-1.5 text-[13px] font-black whitespace-nowrap transition" : "w-full h-12 px-3.5 rounded-xl flex items-center gap-2.5 text-[14px] font-black transition"}
        style={on ? { background: mobile && !exec ? "#FFFFFF" : T.railOn, color: mobile && !exec ? "#0F1A30" : T.railOnText, boxShadow: exec ? "0 8px 20px rgba(215,188,130,.25)" : "0 8px 18px rgba(15,26,48,.22)" } : mobile ? { color: "rgba(255,255,255,.86)", border: "1px solid rgba(255,255,255,.22)", background: "rgba(255,255,255,.06)" } : { color: T.railText, border: "1px solid transparent" }}
        data-testid={`notify-cat-${c.key}`}>
        <Ico k={c.key} size={mobile ? 14 : 17} />
        <span className="whitespace-nowrap">{c.label}</span>
        <span className={`${mobile ? "" : "ml-auto"} min-w-[22px] h-[22px] px-1.5 rounded-full grid place-items-center text-[11.5px] font-black`} style={{ ...MONO_S, background: on ? (exec ? "rgba(26,20,5,.14)" : mobile ? "#EEF3FC" : "rgba(255,255,255,.18)") : mobile ? "rgba(255,255,255,.16)" : T.chipBg, color: on ? (mobile && !exec ? "#1B2B4B" : T.railOnText) : mobile ? "#fff" : T.chipText }}>{n}</span>
      </button>
    );
  };

  const listView = (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ background: T.listBg }} data-testid="notify-list">
      {list.map((it) => {
        const k = KIND[it.kind] || KIND.notice; const on = it.key === selKey; const bad = it.kind === "apNo" || it.kind === "apCancelNo";
        return (
          <button key={it.key} type="button" onClick={() => setSelKey(it.key)} className="relative w-full text-left px-4 py-3.5 flex gap-3 items-start transition" style={{ background: on ? T.itemOn : "transparent", borderBottom: `1px solid ${T.line}` }} data-testid="notify-item">
            {on && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ background: T.itemOnBar }} />}
            <span className="shrink-0 w-9 h-9 rounded-xl grid place-items-center" style={{ background: T.chipBg, color: T.chipText }}><Ico k={catOf(it)} size={16} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11.5px] font-black whitespace-nowrap" style={{ color: bad ? T.warn : T.accent }}>{k.head}</span>
                <span className="ml-auto text-[11px] font-bold whitespace-nowrap" style={{ ...MONO_S, color: T.faint }}>{agoText(it.at)}</span>
              </span>
              <span className="block mt-0.5 text-[14px] font-black leading-snug line-clamp-2 break-words" style={{ color: T.title }}>{it.title}</span>
              {it.sub && <span className="block mt-0.5 text-[12px] font-semibold truncate" style={{ color: T.sub }}>{it.sub}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );

  const detail = sel ? (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col" style={{ background: T.detailBg }}>
      <div className="shrink-0 px-5 sm:px-7 pt-5 pb-4" style={{ borderBottom: `1px solid ${T.line}` }}>
        {mobile && <button type="button" onClick={() => setSelKey("")} className="mb-3 h-8 px-3 rounded-lg text-[12.5px] font-black" style={T.ghost}>← 목록</button>}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="h-7 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-[12px] font-black" style={{ background: T.chipBg, color: warn ? T.warn : T.chipText }}><Ico k={catOf(sel)} size={13} />{K.head}</span>
          {sel.src === "platform" && <PlatformBadge />}
          <span className="text-[11px] font-extrabold tracking-[0.2em]" style={{ ...MONO_S, color: T.faint }}>{K.en}</span>
          <span className="ml-auto text-[12px] font-bold" style={{ ...MONO_S, color: T.faint }}>{sel.at ? new Date(sel.at).toLocaleString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }) : ""}</span>
        </div>
        <div className="mt-2 text-[19px] sm:text-[22px] font-black leading-snug break-words" style={{ color: T.title }}>{sel.title}</div>
        {sel.sub && <div className="mt-1 text-[13px] font-semibold break-words" style={{ color: warn ? T.warn : T.sub }}>{sel.sub}</div>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-7 py-5" data-testid="notify-body"><NotifyContent item={sel} company={company} dark={exec} /></div>
      <div className="shrink-0 flex items-center gap-2 px-5 sm:px-7 py-3" style={{ background: T.foot, borderTop: `1px solid ${T.line}`, ...(mobile ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" } : {}) }}>
        {sel.src === "platform"
          ? <button type="button" onClick={() => onNever?.(sel)} className="h-10 px-4 rounded-xl text-[13px] font-black whitespace-nowrap" style={T.ghost} data-testid="notify-never">다시 보지 않기</button>
          : null}
        <button type="button" onClick={() => onRead?.(sel)} className="ml-auto h-10 px-5 rounded-xl text-[13.5px] font-black whitespace-nowrap" style={T.ghost} data-testid="notify-close">확인</button>
        {sel.src !== "platform" && <button type="button" onClick={() => onGo?.(sel)} className="h-10 px-5 rounded-xl text-[13.5px] font-black whitespace-nowrap" style={T.primary} data-testid="notify-go">{K.go} →</button>}
      </div>
    </div>
  ) : (
    <div className="flex-1 grid place-items-center text-[13.5px] font-bold" style={{ background: T.detailBg, color: T.faint }}>왼쪽 목록에서 알림을 고르세요</div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[999995] flex items-center justify-center" style={{ background: T.overlay, backdropFilter: "blur(3px)", padding: mobile ? 0 : 20 }} data-testid="notify-modal" data-theme={exec ? "exec" : "staff"}>
      <div className="kp-notify-in w-full flex flex-col overflow-hidden" role="dialog" aria-modal="true" aria-label="알림 브리핑"
        style={mobile ? { height: "100dvh", background: T.shell } : { width: "min(1120px, 96vw)", height: "min(720px, 88vh)", borderRadius: 26, background: T.shell, boxShadow: T.ring }}>
        {/* 머리 — 오늘 날짜 · 몇 건 · 모두 확인 · 나중에 */}
        <div className="relative shrink-0 px-5 sm:px-7 py-4 sm:py-5 overflow-hidden" style={{ background: T.head, ...(mobile ? { paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" } : {}) }}>
          {exec && <span className="absolute top-0 left-7 right-7 h-[1.5px]" style={{ background: "linear-gradient(90deg, transparent, #D7BC82, #F3E3BC, #D7BC82, transparent)" }} />}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10.5px] sm:text-[11px] font-extrabold tracking-[0.3em] whitespace-nowrap truncate" style={{ ...MONO_S, color: T.eyebrow }}>{exec ? "EXECUTIVE BRIEFING" : "NOTIFICATIONS"}{mobile ? "" : ` · ${ymd}`}</div>
              <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                <span className="text-[22px] sm:text-[26px] font-black tracking-tight" style={{ color: T.headText }}>알림 브리핑</span>
                <span className="text-[22px] sm:text-[26px] font-black tabular-nums" style={{ ...MONO_S, color: exec ? "#F3E3BC" : "#8FB0F0" }} data-testid="notify-count">{items.length}건</span>
              </div>
              <div className="mt-1 text-[13px] sm:text-[13.5px] font-semibold" style={{ color: T.headSub }}>{greet}</div>
            </div>
            <div className="shrink-0 flex items-center gap-1.5">
              {!mobile && <button type="button" onClick={onReadAll} className="h-9 px-3.5 rounded-xl text-[12.5px] font-black whitespace-nowrap" style={exec ? T.primary : { background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.22)" }} data-testid="notify-readall">모두 확인</button>}
              <button type="button" onClick={onLater} aria-label="나중에 보기" title="나중에 보기(이번 접속에서만 닫기)" className="h-9 px-3 rounded-xl text-[12.5px] font-black whitespace-nowrap" style={{ background: "rgba(255,255,255,.08)", color: T.headText, border: "1px solid rgba(255,255,255,.16)" }} data-testid="notify-later">{mobile ? "✕" : "나중에 보기 ✕"}</button>
            </div>
          </div>
          {mobile && <div className="mt-3 -mx-5 px-5 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>{CATS.map(catBtn)}</div>}
        </div>
        {/* 몸통 */}
        {mobile ? (
          sel ? detail : (<>
            {listView}
            <div className="shrink-0 px-4 py-3 flex gap-2" style={{ background: T.foot, borderTop: `1px solid ${T.line}`, paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
              <button type="button" onClick={onLater} className="flex-1 h-11 rounded-xl text-[14px] font-black" style={T.ghost}>나중에 보기</button>
              <button type="button" onClick={onReadAll} className="flex-[1.4] h-11 rounded-xl text-[14px] font-black" style={T.primary}>모두 확인</button>
            </div>
          </>)
        ) : (
          <div className="flex-1 min-h-0 flex">
            <nav className="shrink-0 w-[220px] p-3 space-y-1 overflow-y-auto" style={{ background: T.rail, borderRight: `1px solid ${T.railLine}` }}>
              <div className="px-2 pb-2 text-[10.5px] font-extrabold tracking-[0.24em]" style={{ ...MONO_S, color: T.faint }}>CATEGORY</div>
              {CATS.map(catBtn)}
              <div className="pt-4 px-2 text-[11.5px] font-semibold leading-relaxed" style={{ color: T.faint }}>[확인]을 누르면 읽음으로 바뀌고 다음 알림으로 넘어가요. [나중에 보기]는 읽음으로 바꾸지 않아요.</div>
            </nav>
            <div className="shrink-0 w-[340px] flex flex-col" style={{ borderRight: `1px solid ${T.line}` }}>
              <div className="shrink-0 h-11 px-4 flex items-center text-[12.5px] font-black" style={{ color: T.sub, borderBottom: `1px solid ${T.line}`, background: T.listBg }}>{CATS.find((c) => c.key === cat)?.label} <span className="ml-1.5" style={{ ...MONO_S, color: T.faint }}>{list.length}</span></div>
              {listView}
            </div>
            {detail}
          </div>
        )}
      </div>
      <style>{`@keyframes kpNotifyIn{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}.kp-notify-in{animation:kpNotifyIn .28s cubic-bezier(.2,.9,.3,1.1) both}`}</style>
    </div>, document.body);
}

// 이번 접속에서 [나중에 보기]로 닫은 알림(새 알림이 오면 그것만 다시 뜬다)
const LATER_KEY = "kpNotifyLater";
const readLater = () => { try { return new Set(JSON.parse(sessionStorage.getItem(LATER_KEY) || "[]")); } catch { return new Set(); } };
const writeLater = (set) => { try { sessionStorage.setItem(LATER_KEY, JSON.stringify([...set].slice(-300))); } catch { /* 무시 */ } };

// 앱에 한 번 — onGo(item): { src, kind, id, openId, page } 받아서 그 메뉴로 이동
export default function NotifyCenter({ uid, role, team = "", company = "", mobile = false, exec = false, name = "", onGo }) {
  const { queue: queueAll, ready, bumpLocal } = useNotifyQueue({ uid, role, team, company });
  // ⭐ 2026-11-07 팝업 알림 설정(계정별) — 꺼 둔 종류는 띄우지 않는다(읽음 처리도 안 해서 목록·메뉴 숫자에는 남는다)
  const popupPrefs = usePopupPrefs(uid);
  const leavePopup = useLeavePopupOn(company); // 🔕 2026-11-26 회사가 연차 촉진 팝업을 껐으면(인사관리부 › 연차 촉진 설정) 팝업만 안 띄움
  const queue = queueAll.filter((x) => isPopupOn(popupPrefs, popupCatOfNotify(x)) && (leavePopup || !(x.src === "hrNotice" && (x.kind === "leave1" || x.kind === "leave2"))));
  const [done, setDone] = React.useState(() => new Set()); // 방금 확인한 것(서버 기록이 돌아오기 전에도 바로 사라지게)
  const [later, setLater] = React.useState(readLater);
  const [armed, setArmed] = React.useState(false); // 켜자마자(로딩 화면 위로) 뜨지 않게 잠깐 기다린다
  React.useEffect(() => { const t = setTimeout(() => setArmed(true), 1800); return () => clearTimeout(t); }, []);
  const live = queue.filter((x) => !done.has(x.key));
  // 새 알림이 하나라도 있으면(나중에 보기 이후 온 것) 묶음 전체를 다시 보여 준다
  const fresh = live.some((x) => !later.has(x.key));
  const loading = !!uid && (!ready || !armed);
  const wants = !!uid && (loading || (live.length > 0 && fresh));
  const myTurn = usePopupTurn("notify", wants); // 🪟 축하 · 생일 · 일일 보고 팝업은 이 창이 닫힌 다음에
  if (!uid || loading || !myTurn || !live.length || !fresh) return null;
  const finish = (it) => {
    setDone((p) => new Set(p).add(it.key));
    // ⭐ 2026-11-22 플랫폼 공지는 계정마다 한 번만 — [확인]을 누르면 계정에 읽음으로 남겨 다시 로그인 · 다른 기기에서도 다시 뜨지 않는다
    //  (예전엔 이번 접속에서만 닫혀 로그인할 때마다 다시 떴다). 다시 보려면 공지사항 목록에서 열면 된다.
    if (it.src === "platform") { hidePlatformNoticeForever(it.id); return; }
    markRead(it, uid).then(() => { if (it.mark?.t === "local") bumpLocal(); });
  };
  const closeLater = () => { const s = new Set(later); live.forEach((x) => s.add(x.key)); writeLater(s); setLater(s); };
  return (
    <NotifyBundle items={live} exec={exec} mobile={mobile} company={company} name={name}
      onRead={finish}
      onNever={(it) => { setDone((p) => new Set(p).add(it.key)); hidePlatformNoticeForever(it.id); }}
      onGo={(it) => { finish(it); closeLater(); onGo?.(it); }}
      onReadAll={() => live.forEach(finish)}
      onLater={closeLater} />
  );
}
