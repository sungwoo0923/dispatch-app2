// ======================= src/NoticeBoard.jsx =======================
// 📢 공지사항 목록·본문(2026-10-30) — 메일함처럼 번호·작성자·날짜는 좁게, 제목은 넓게.
//  · 글을 누르면 팝업이 아니라 본문 화면으로 들어가고 "← 목록"으로 돌아온다.
//  · 상단 고정(최대 5개) — 맨 위에 고정 표시 + 굵은 글씨.
//  · 세부 공개 대상(팀) — 내부용 공지를 특정 팀에만 보이게.
//  · ⭐ 2026-11-03 받는 사람(직원) 지정 — targetUids의 직원에게만 보이게. "지정 N명"은 본문 안에서만(목록에는 안 보임).
//  · 🔒 2026-11-03 지정 공지 비공개 — 팀·직원 지정 공지는 지정된 사람 · 작성자 · 최고관리자만(회사 관리자도 지정 안 됐으면 안 보임)
import React from "react";
import { runDelete } from "./DeleteProgress"; // ⭐ 2026-11-05 삭제 진행 창 + 한 번에 삭제
import { RichHtml } from "./richText";
import { db } from "./firebase";
import { doc, updateDoc, deleteDoc, arrayUnion } from "firebase/firestore";
// ⭐ 2026-11-03 예약 게시(publishAt) · 공개 대상 여러 개(audiences: internal·shipper·driver) · 조회수(readBy / 플랫폼 공지는 viewedBy)
import { PlatformBadge, platformReadIds, markPlatformNoticeRead } from "./PlatformNoticeBanner";
import { noticeTargetUids, canSeeTargetedNotice } from "./notifyCore";
import PostComments, { PostLikeButton, PostCounts } from "./PostComments"; // 💬 2026-11-03 댓글·대댓글·좋아요
import { LogisMark } from "./brand"; // 🔷 2026-11-04 LogisWeb 마크

// ⭐ 2026-11-02 관리자센터2 — 플랫폼 공지(_platform)는 관리자 관리센터가 올린 글: 회사에서 고치거나 지울 수 없고,
//  읽음 표시는 서버 문서 대신 이 브라우저에만 기록한다(다른 회사 직원 uid가 한 문서에 쌓이지 않게).
//  ⭐ 2026-11-03 읽음 기록은 PlatformNoticeBanner와 한 곳(맨 위 띠·가운데 팝업과 같은 기록)
const markPlatRead = (id) => markPlatformNoticeRead(String(id || "").replace(/^plat:/, ""));

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
export const MAX_PINNED = 5;
const toMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);
const shortDate = (ms) => {
  if (!ms) return "";
  const d = new Date(ms); const now = new Date();
  const hm = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (d.toDateString() === now.toDateString()) return hm;
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${hm}`;
};
const fullDate = (ms) => (ms ? new Date(ms).toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }) : "");

// ⭐ 2026-11-03 받는 사람(직원) 지정 — targetUids가 있으면 그 직원들에게만(비어 있으면 지정 없음) · 기준은 notifyCore 한 곳
export { noticeTargetUids };
// "지정 3명" 표시 말풍선(마우스를 올리면 받는 사람 이름 전부)
export const noticeTargetTitle = (n) => { const names = Array.isArray(n?.targetNames) ? n.targetNames.filter(Boolean) : []; return names.length ? `받는 사람: ${names.join(", ")}` : `지정된 직원 ${noticeTargetUids(n).length}명`; };

// 이 사람이 볼 수 있는 공지인지 — 지정이 없으면 전체, 팀 지정이면 그 팀 + 작성자 + 관리자
// ⭐ 2026-11-03 직원 지정(targetUids)이면 지정된 직원 + 작성자 + 관리자(팀 지정과 같은 규칙)
// ⭐ 2026-11-03 예약 게시 — 게시 시각(publishAt ms)이 아직 안 됐으면 작성자·관리자만 본다(예약 표시와 함께)
export const NOTICE_SCHEDULE_ROLES = ["admin", "totalMaster", "superadmin", "hrManager", "hrAcct", "allMgr"];
export const noticePublishAt = (n) => Number(n?.publishAt) || 0;
export const isNoticeScheduled = (n, now = Date.now()) => !n?._platform && noticePublishAt(n) > now;
export const noticeAudiences = (n) => (Array.isArray(n?.audiences) && n.audiences.length ? n.audiences : n?.audience === "shipper" || n?.audience === "all" ? ["internal", "shipper"] : ["internal"]);
// 조회수 — 한 계정 1회(회사 공지 readBy · 플랫폼 공지 viewedBy)
export const noticeViews = (n) => (n?._platform ? (n.viewedBy || []).length : (n?.readBy || []).length);
const pad2 = (x) => String(x).padStart(2, "0");
export const scheduleLabel = (ms) => { const d = new Date(ms); return `예약 · ${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
export function canSeeNotice(n, me) {
  // 🔒 2026-11-03 지정 공지 비공개 — 팀·직원 지정 공지는 지정된 사람·작성자·최고관리자만(관리자라도 지정 안 됐으면 안 보임)
  if (!canSeeTargetedNotice(n, me)) return false;
  if (isNoticeScheduled(n) && !(n.authorUid && n.authorUid === me?.uid) && !NOTICE_SCHEDULE_ROLES.includes(me?.role) && !me?.isMaster) return false;
  return true;
}

const PAGE = 15;
// 목록 날짜·순서 — 예약 게시 글은 게시 시각 기준
const whenOf = (n) => Math.max(toMs(n.createdAt), noticePublishAt(n));
const Eye = ({ size = 13 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
const SchedBadge = ({ n, big }) => <span title="예약 게시 — 이 시각에 직원들에게 보이고 알림이 갑니다(지금은 작성자·관리자만 보임)" className={`shrink-0 inline-flex items-center gap-1 rounded-md bg-[#0F1A30] text-[#8FB0F0] font-black whitespace-nowrap ${big ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[10.5px]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{scheduleLabel(noticePublishAt(n))}</span>;
const AudBadges = ({ n, big }) => { const a = noticeAudiences(n); const cls = `shrink-0 rounded border border-[#C9D6EE] text-[#2D4C82] font-black ${big ? "px-2 py-0.5 rounded-md text-[11px]" : "px-1.5 py-0.5 text-[10.5px]"}`; return <>{a.includes("shipper") && <span className={cls}>{big ? "화주사 공개" : "화주사"}</span>}{a.includes("driver") && <span className={cls}>{big ? "기사 공개" : "기사"}</span>}{!a.includes("internal") && <span className={cls}>직원 제외</span>}</>; };
export default function NoticeBoard({ notices = [], me, canWrite, isViewer, onEdit, confirm, openId, setOpenId }) {
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const visible = React.useMemo(() => notices.filter((n) => canSeeNotice(n, me)).sort((a, b) => whenOf(b) - whenOf(a)), [notices, me]);
  // 플랫폼 공지 고정글은 회사 고정 5개와 따로 — 맨 위
  const pinned = React.useMemo(() => [
    ...visible.filter((n) => n._platform && n.pinned).sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt)),
    ...visible.filter((n) => !n._platform && n.pinned).sort((a, b) => toMs(b.pinnedAt || b.createdAt) - toMs(a.pinnedAt || a.createdAt)).slice(0, MAX_PINNED),
  ], [visible]);
  const [, bumpRead] = React.useState(0);
  const rest = React.useMemo(() => {
    const kw = q.trim();
    return visible.filter((n) => !pinned.includes(n)).filter((n) => !kw || [n.title, n.content, n.author].some((v) => String(v || "").includes(kw)));
  }, [visible, pinned, q]);
  const pages = Math.max(1, Math.ceil(rest.length / PAGE));
  const shown = rest.slice((page - 1) * PAGE, page * PAGE);
  const cur = openId ? notices.find((n) => n.id === openId && canSeeNotice(n, me)) || null : null; // 🔒 지정 공지는 링크·알림으로 열어도 대상자만
  React.useEffect(() => {
    // ⭐ 2026-11-03 플랫폼 공지 조회수 — 본 사람 uid를 viewedBy에 한 번만(서버 규칙: viewedBy만 더할 수 있음)
    if (cur?._platform) { markPlatRead(cur.id); bumpRead((x) => x + 1); if (me?.uid && cur.platformId && !(cur.viewedBy || []).includes(me.uid)) updateDoc(doc(db, "platformNotices", cur.platformId), { viewedBy: arrayUnion(me.uid) }).catch(() => {}); return; }
    if (cur && me?.uid && !(cur.readBy || []).includes(me.uid)) updateDoc(doc(db, "notices", cur.id), { readBy: arrayUnion(me.uid) }).catch(() => {});
  }, [cur, me?.uid]);
  const isNew = (n) => !isNoticeScheduled(n) && Date.now() - whenOf(n) < 24 * 3600e3;
  const isSA = ["superadmin", "totalMaster"].includes(me?.role);
  const canManage = (n) => !n._platform && !isViewer && (isSA || (canWrite && (n.authorUid ? n.authorUid === me?.uid : true)));
  // ⭐ 2026-11-04 관리자(·마스터)는 임원 등 다른 사람이 올린 회사 공지도 삭제할 수 있다(수정은 작성자만)
  const canRemove = (n) => !!n && !n._platform && !isViewer && (canManage(n) || ["admin", "allMgr"].includes(me?.role) || me?.isMaster === true);
  const togglePin = async (n) => {
    if (!n.pinned && visible.filter((x) => x.pinned && !x._platform).length >= MAX_PINNED) { window.alert(`상단 고정은 ${MAX_PINNED}개까지입니다. 다른 고정을 먼저 해제해 주세요.`); return; }
    await updateDoc(doc(db, "notices", n.id), { pinned: !n.pinned, pinnedAt: n.pinned ? null : Date.now() }).catch((e) => window.alert(e.message));
  };
  // 💬 댓글·좋아요 — 회사 공지만(플랫폼 공지는 다른 곳 글), 화주·기사 화면에는 직원 댓글을 보이지 않는다
  const canTalk = (n) => !!n && !n._platform && !!me?.uid && !["shipper", "driver", "cafeUser"].includes(me?.role);
  const remove = (n) => confirm("공지사항을 삭제하시겠습니까?", async () => { await runDelete({ label: "공지", task: () => deleteDoc(doc(db, "notices", n.id)) }); setOpenId(null); }); // ⭐ 2026-11-05 삭제 진행 창

  if (cur) {
    const ms = whenOf(cur);
    return (
      <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
        <div className="px-4 sm:px-8 py-5 border-b border-[#EEF1F6]">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setOpenId(null)} className="h-9 px-3.5 rounded-xl border border-[#DCE3EE] text-[13px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD]">← 목록</button>
            {canManage(cur) ? (
              <div className="ml-auto flex gap-1.5">
                <button type="button" onClick={() => togglePin(cur)} className="h-9 px-3.5 rounded-xl border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD]">{cur.pinned ? "고정 해제" : "상단 고정"}</button>
                <button type="button" onClick={() => onEdit(cur)} className="h-9 px-3.5 rounded-xl bg-[#0F1A30] text-white text-[12.5px] font-black">수정</button>
                <button type="button" onClick={() => remove(cur)} className="h-9 px-3.5 rounded-xl border border-[#DCE3EE] text-[12.5px] font-black text-[#7A879C] hover:bg-[#F5F8FD]">삭제</button>
              </div>
            ) : canRemove(cur) && (
              <div className="ml-auto flex gap-1.5">
                <button type="button" onClick={() => remove(cur)} title="관리자 권한으로 삭제" className="h-9 px-3.5 rounded-xl border border-[#DCE3EE] text-[12.5px] font-black text-[#7A879C] hover:bg-[#F5F8FD]">삭제</button>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center gap-1.5 flex-wrap">
            {cur._platform && <PlatformBadge size="lg" />}
            {cur.pinned && <span className="px-2 py-0.5 rounded-md bg-[#0F1A30] text-[#8FB0F0] text-[11px] font-black">• 고정</span>}
            {cur.category && <span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${cur.category === "부고" ? "bg-[#1A1A1A] text-white" : "bg-[#EEF3FC] text-[#1B2B4B]"}`}>{cur.category}</span>}
            {isNoticeScheduled(cur) && <SchedBadge n={cur} big />}
            {!cur._platform && <AudBadges n={cur} big />}
            {(cur.teams || []).length > 0 && <span className="px-2 py-0.5 rounded-md border border-[#C9D6EE] text-[#2D4C82] text-[11px] font-black">{cur.teams.join(" · ")} 대상</span>}
            {/* ⭐ 2026-11-03 직원 지정 공지 — "지정 3명"(이름은 마우스를 올리면) */}
            {noticeTargetUids(cur).length > 0 && <span title={noticeTargetTitle(cur)} className="px-2 py-0.5 rounded-md border border-[#C9D6EE] text-[#2D4C82] text-[11px] font-black cursor-help">지정 {noticeTargetUids(cur).length}명{(cur.targetNames || []).length ? ` · ${cur.targetNames.length === 1 ? cur.targetNames[0] : `${cur.targetNames[0]} 외 ${cur.targetNames.length - 1}명`}` : ""}</span>}
          </div>
          <h2 className="mt-2 text-[20px] sm:text-[24px] font-black text-[#0F1A30] leading-snug break-words">{cur.title || "공지사항"}</h2>
          <div className="mt-3 flex items-center gap-3">
            {cur._platform
              ? <LogisMark size={40} />
              : <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}>{String(cur.author || "?").slice(0, 1)}</span>}
            <div className="leading-tight">
              <div className="text-[14px] font-black text-[#0F1A30]">{cur.author || "-"}</div>
              <div className="text-[12px] text-[#7A879C] tabular-nums flex items-center flex-wrap gap-x-1">{fullDate(ms)}{isNoticeScheduled(cur) ? " 게시 예정" : ""}{cur._platform ? (cur.updatedAt ? ` · 수정 ${fullDate(toMs(cur.updatedAt))}` : "") + " · LogisWeb 운영팀이 보낸 공지입니다" : ""}<span className="inline-flex items-center gap-1 font-bold text-[#5B6B85]" title="조회수 — 한 계정 1회">· <Eye size={12} /> 조회 {noticeViews(cur)}</span></div>
              {cur.revisedAt && <div className="text-[12px] font-bold text-[#B54708] tabular-nums">{cur.hrOrder?.status === "cancelled" ? "취소" : "수정"} {fullDate(toMs(cur.revisedAt))}{cur.revisedBy ? ` · ${cur.revisedBy}` : ""}</div>}
            </div>
          </div>
        </div>
        <div className="px-4 sm:px-8 py-6 sm:py-7 space-y-5">
          <RichHtml html={cur.contentHtml} text={cur.content} className="text-[15.5px] text-[#1F2A44] leading-[1.95]" />{/* ⭐ 2026-11-03 꾸민 글(플랫폼 공지) */}
          {/* ⭐ 2026-10-31 공문(인사발령 등) 이미지 — 작게 보이던 문제: 본문 폭 가득(최대 920px), 누르면 원본 크기로 */}
          {cur.image && (
            <div className="space-y-2">
              <button type="button" onClick={() => { const w = window.open(""); if (w) { w.document.write(`<title>${String(cur.title || "공문").replace(/</g, "")}</title><body style="margin:0;background:#0F1A30;display:flex;justify-content:center"><img src="${cur.image}" style="max-width:100%;height:auto"/></body>`); w.document.close(); } }}
                className="block w-full max-w-[920px] rounded-2xl overflow-hidden border border-[#E3E8F0] shadow-[0_10px_30px_rgba(15,26,48,0.08)] hover:shadow-[0_14px_36px_rgba(15,26,48,0.14)] transition">
                <img src={cur.image} alt="" className="w-full h-auto block" />
              </button>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <a href={cur.image} download={`${String(cur.title || "공문").replace(/[\\/:*?"<>|]/g, "")}.jpg`} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"><span aria-hidden>⬇</span><span>이미지 저장</span></a>
                <span className="text-[12px] text-[#9AA9C3] whitespace-nowrap">이미지를 누르면 원본 크기로 볼 수 있습니다</span>
              </div>
            </div>
          )}
          {/* 💬 2026-11-03 좋아요 — 회사 공지(플랫폼 공지 제외) · 직원만 */}
          {canTalk(cur) && <div className="pt-1"><PostLikeButton col="notices" post={cur} me={me} disabled={isViewer} /></div>}
        </div>
        {canTalk(cur) && <PostComments col="notices" post={cur} me={me} readOnly={isViewer} />}
      </div>
    );
  }

  const Row = ({ n, no, pin }) => {
    const unread = n._platform ? !platformReadIds().has(n.platformId || String(n.id).replace(/^plat:/, "")) : me?.uid && !(n.readBy || []).includes(me.uid);
    return (
      <button type="button" onClick={() => setOpenId(n.id)}
        className={`w-full grid grid-cols-[52px_minmax(0,1fr)_auto] md:grid-cols-[64px_minmax(0,1fr)_120px_110px_64px] items-center gap-2.5 md:gap-3 px-3 md:px-5 h-[60px] md:h-[56px] border-b border-[#F1F4F9] text-left transition hover:bg-[#F5F8FD] ${n._platform ? "bg-[linear-gradient(90deg,#FBF7EC,#F6F8FC_40%)]" : pin ? "bg-[#F3F6FB]" : ""}`}>
        <span className="text-center">
          {pin ? <span className="inline-flex items-center justify-center whitespace-nowrap h-6 px-1.5 rounded-md bg-[#0F1A30] text-[#8FB0F0] text-[10.5px] font-black">• 고정</span>
            : <span className="text-[14px] font-bold text-[#5B6B85] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{no}</span>}
        </span>
        <span className="min-w-0 flex flex-col md:flex-row md:items-center gap-0.5 md:gap-1.5">
        <span className="min-w-0 flex items-center gap-1.5 whitespace-nowrap">
          {n._platform && <span className="hidden md:inline-flex"><PlatformBadge /></span>}
          {n.category && n.category !== "공지사항" && <span className={`${n._platform ? "hidden md:inline-block" : ""} shrink-0 px-1.5 py-0.5 rounded text-[10.5px] font-black ${n.category === "부고" ? "bg-[#1A1A1A] text-white" : "bg-[#EEF3FC] text-[#1B2B4B]"}`}>{n.category}</span>}
          {isNoticeScheduled(n) && <SchedBadge n={n} />}
          {!n._platform && <AudBadges n={n} />}
          {/* 🔒 2026-11-03 지정 공지 — 목록에는 대상(팀·지정 N명)을 드러내지 않는다(본문 안에서만 표시) */}
          <span className={`truncate ${pin ? "text-[15.5px] font-black text-[#0B1428]" : unread ? "text-[15px] font-black text-[#0F1A30]" : "text-[15px] font-semibold text-[#3A4A66]"}`}>{n.title || "공지사항"}</span>
          {n.revisedAt && <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10.5px] font-black ${n.hrOrder?.status === "cancelled" ? "bg-[#FEF3F2] text-[#B42318]" : "bg-[#FFF4E5] text-[#B54708]"}`}>{n.hrOrder?.status === "cancelled" ? "취소" : "수정됨"}</span>}
          {n.image && <span className="shrink-0 text-[11px] text-[#9AA9C3]">▣</span>}
          {!n._platform && <PostCounts p={n} />}
          {isNew(n) && unread && <span className="shrink-0 w-[18px] h-[18px] rounded-full bg-[#1B2B4B] text-white text-[10px] font-black flex items-center justify-center">N</span>}
        </span>
        {/* 휴대폰 — 작성자는 제목 아래 줄로 */}
        {n._platform
          ? <span className="md:hidden flex items-center gap-1.5 min-w-0"><PlatformBadge /><span className="truncate text-[12px] font-bold text-[#8A6A16]">{n.category}</span></span>
          : <span className="md:hidden truncate text-[12px] font-bold text-[#7A879C] inline-flex items-center gap-1.5">{n.author || "-"}<span className="inline-flex items-center gap-0.5 font-semibold text-[#9AA9C3] tabular-nums"><Eye size={11} />{noticeViews(n)}</span></span>}
        </span>
        <span className={`hidden md:block truncate text-[14px] font-bold ${n._platform ? "text-[#8A6A16]" : "text-[#1B2B4B]"}`}>{n.author || "-"}</span>
        <span className="text-right text-[14px] font-semibold text-[#3A4A66] tabular-nums whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{shortDate(whenOf(n))}</span>
        <span className="hidden md:inline-flex items-center justify-center gap-1 text-[13px] font-semibold text-[#5B6B85] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} title="조회수 — 한 계정 1회"><Eye size={12} />{noticeViews(n)}</span>
      </button>
    );
  };

  return (
    <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
      <div className="px-3 md:px-4 py-3 border-b border-[#EEF1F6] flex items-center gap-3">
        <div className="relative flex-1 min-w-0 max-w-[360px]">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="제목·내용·작성자 검색"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#DCE3EE] bg-[#F8FAFD] text-[13.5px] text-[#0F1A30] outline-none focus:border-[#2D4C82]" />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA9C3]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </div>
        <span className="ml-auto shrink-0 whitespace-nowrap text-[12px] md:text-[12.5px] font-bold text-[#9AA9C3]">고정 {pinned.filter((n) => !n._platform).length}/{MAX_PINNED} · {visible.length}개의 글</span>
      </div>
      <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] md:grid-cols-[64px_minmax(0,1fr)_120px_110px_64px] gap-2.5 md:gap-3 px-3 md:px-5 h-11 items-center bg-[#F3F6FA] border-b border-[#E3E8F0] text-[13.5px] md:text-[14px] font-black text-[#1B2B4B] whitespace-nowrap">
        <span className="text-center">번호</span><span>제목</span><span className="hidden md:block">작성자</span><span className="text-right">날짜</span><span className="hidden md:block text-center">조회</span>
      </div>
      {pinned.map((n) => <Row key={n.id} n={n} pin />)}
      {!shown.length && !pinned.length ? <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">{q ? "검색 결과가 없습니다" : "등록된 공지가 없습니다"}</div>
        : shown.map((n, i) => <Row key={n.id} n={n} no={rest.length - ((page - 1) * PAGE + i)} />)}
      {pages > 1 && (
        <div className="flex justify-center gap-1 py-3">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => <button key={n} type="button" onClick={() => setPage(n)} className={`w-8 h-8 rounded-lg text-[12.5px] font-black ${n === page ? "bg-[#0F1A30] text-white" : "text-[#5B6B85] hover:bg-[#F5F8FD]"}`}>{n}</button>)}
        </div>
      )}
    </div>
  );
}
