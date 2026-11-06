// ======================= src/PostComments.jsx =======================
// 💬 2026-11-03 댓글 · 대댓글 · 좋아요 — 공지사항(notices)과 사내 게시판(boardPosts)이 같이 쓰는 부품(PC·모바일 공용)
//  저장 방식: 글 문서 안의 배열(게시판이 원래 쓰던 comments 배열을 그대로 이어서 사용)
//   · 글 좋아요 : likes: [uid]                         — 한 사람 1번(누르면 켜고, 다시 누르면 끔)
//   · 댓글     : comments: [{ id, uid, name, position, text, at(ms), parentId?(답글이면 원 댓글 id),
//                             likes: [uid], editedAt?(ms), deleted?(답글이 달린 댓글을 지우면 내용만 지움) }]
//   · 답글은 한 단계만(답글에 다시 답글을 달면 같은 원 댓글 아래로)
//   · 한 글에 댓글 500개까지(문서 크기 한도 보호 — 보안규칙도 500개까지만 허용)
//  권한: 같은 회사 직원은 댓글·좋아요 가능 / 수정은 본인만 / 삭제는 본인·관리자
import React from "react";
import { db } from "./firebase";
import { doc, updateDoc, arrayUnion, arrayRemove, runTransaction } from "firebase/firestore";
import { kpConfirm } from "./kpDialog";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
export const COMMENT_CAP = 500;
const COMMENT_WARN = 450;
const ADMIN_ROLES = ["admin", "totalMaster", "superadmin", "hrManager", "allMgr"];
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const EMOJIS = [
  "😀", "😄", "😂", "🤣", "😊", "😍", "🥰", "😎", "🤗", "🤔",
  "😅", "😮", "😢", "😭", "😡", "🥲", "😴", "🤩", "🙂", "😉",
  "👍", "👏", "🙏", "💪", "🙌", "🤝", "👀", "✌️", "👌", "🫡",
  "❤️", "💙", "🔥", "✨", "🎉", "💯", "✅", "☕", "🍀", "🚚",
];

// 살아 있는 댓글 수(지운 댓글 제외)
export const commentCount = (p) => (Array.isArray(p?.comments) ? p.comments.filter((c) => c && !c.deleted).length : 0);
export const likeCount = (p) => (Array.isArray(p?.likes) ? p.likes.length : 0);

// ── 아이콘(글자 이모지 대신 작은 선 아이콘) ──
export const HeartIcon = ({ size = 14, filled }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
  </svg>
);
export const BubbleIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.6-5A8.5 8.5 0 1 1 21 12z" />
  </svg>
);
const SmileIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="9.5" /><path d="M8 14.5s1.5 2 4 2 4-2 4-2" /><path d="M9 9.5h.01M15 9.5h.01" strokeWidth="3" />
  </svg>
);
const ReplyIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
);

// 목록 줄에 붙는 작은 숫자(💬 N · ♥ N) — 0이면 안 보임
export function PostCounts({ p, className = "" }) {
  const c = commentCount(p); const l = likeCount(p);
  if (!c && !l) return null;
  return (
    <span className={`shrink-0 inline-flex items-center gap-2 text-[11.5px] font-bold text-[#7A879C] tabular-nums ${className}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
      {c > 0 && <span className="inline-flex items-center gap-0.5 text-[#4B6CB7]" title={`댓글 ${c}개`}><BubbleIcon size={12} />{c}</span>}
      {l > 0 && <span className="inline-flex items-center gap-0.5" title={`좋아요 ${l}개`}><HeartIcon size={11} filled />{l}</span>}
    </span>
  );
}

const ago = (ms) => {
  if (!ms) return "";
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  const d = new Date(ms); const p2 = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}.` : ""}${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

// 이모지 고르기 — 버튼 옆 작은 판(외부 라이브러리 없이)
function EmojiPicker({ onPick }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); document.addEventListener("touchstart", h);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="이모지" title="이모지" onClick={() => setOpen((v) => !v)}
        className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${open ? "bg-[#EEF3FC] text-[#2D4C82]" : "text-[#7A879C] hover:bg-[#F3F6FB] hover:text-[#2D4C82]"}`}><SmileIcon /></button>
      {open && (
        <div className="fixed left-4 right-4 bottom-24 sm:absolute sm:left-0 sm:right-auto sm:bottom-11 z-50 sm:z-30 sm:w-[284px] p-2.5 rounded-2xl bg-white border border-[#E3E8F0] shadow-[0_18px_40px_rgba(15,26,48,0.18)]" data-emoji-picker>
          <div className="px-1 pb-1.5 text-[10px] font-extrabold tracking-[0.22em] text-[#9AA9C3]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>EMOJI</div>
          <div className="grid grid-cols-8 gap-0.5">
            {EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => onPick(e)} className="h-8 rounded-lg text-[19px] leading-none hover:bg-[#F3F6FB] active:scale-90 transition">{e}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 댓글 입력칸(새 댓글·답글·수정 공용)
function Composer({ me, initial = "", placeholder = "댓글을 남겨 주세요", submitLabel = "등록", onSubmit, onCancel, autoFocus, compact, disabled }) {
  const [text, setText] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const ta = React.useRef(null);
  React.useEffect(() => { if (autoFocus) { const el = ta.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } } }, [autoFocus]);
  const grow = () => { const el = ta.current; if (el) { el.style.height = "auto"; el.style.height = `${Math.min(160, el.scrollHeight)}px`; } };
  React.useEffect(grow, [text]);
  const insert = (e) => {
    const el = ta.current;
    if (!el) { setText((t) => t + e); return; }
    const a = el.selectionStart ?? text.length; const b = el.selectionEnd ?? text.length;
    const next = text.slice(0, a) + e + text.slice(b);
    setText(next);
    requestAnimationFrame(() => { el.focus(); const pos = a + e.length; el.setSelectionRange(pos, pos); });
  };
  const send = async () => {
    const v = text.trim(); if (!v || busy || disabled) return;
    setBusy(true);
    try { const ok = await onSubmit(v.slice(0, 2000)); if (ok !== false) setText(""); } finally { setBusy(false); }
  };
  return (
    <div className={`rounded-2xl bg-white border border-[#DCE3EE] focus-within:border-[#4B6CB7] focus-within:shadow-[0_0_0_3px_rgba(75,108,183,0.12)] transition ${compact ? "" : "shadow-[0_2px_8px_rgba(15,26,48,0.04)]"}`}>
      <div className="flex gap-2.5 px-3 pt-2.5">
        {!compact && <span className="w-8 h-8 mt-0.5 rounded-xl text-white text-[12px] font-black flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}>{String(me?.name || "?").slice(0, 1)}</span>}
        <textarea ref={ta} value={text} onChange={(e) => setText(e.target.value)} rows={compact ? 1 : 2} maxLength={2000} placeholder={placeholder} disabled={disabled}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } if (e.key === "Escape" && onCancel) onCancel(); }}
          className="flex-1 min-w-0 resize-none bg-transparent outline-none text-[14px] leading-[1.65] text-[#0F1A30] placeholder:text-[#A6B2C6] py-1 disabled:opacity-50" />
      </div>
      <div className="flex items-center gap-1 px-2 pb-2 pt-1">
        <EmojiPicker onPick={insert} />
        <span className="ml-1 hidden sm:inline text-[11px] text-[#A6B2C6]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>CTRL+ENTER</span>
        <span className="ml-auto text-[11px] text-[#A6B2C6] tabular-nums mr-1" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{text.length ? `${text.length}/2000` : ""}</span>
        {onCancel && <button type="button" onClick={onCancel} className="h-8 px-3 rounded-lg text-[12.5px] font-bold text-[#7A879C] hover:bg-[#F3F6FB]">취소</button>}
        <button type="button" onClick={send} disabled={!text.trim() || busy || disabled} className="h-8 px-4 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black disabled:opacity-35 transition">{busy ? "…" : submitLabel}</button>
      </div>
    </div>
  );
}

// 글 좋아요 버튼(본문 아래)
export function PostLikeButton({ col, post, me, disabled }) {
  const likes = Array.isArray(post?.likes) ? post.likes : [];
  const on = !!me?.uid && likes.includes(me.uid);
  const [pending, setPending] = React.useState(null); // 누르자마자 바뀌어 보이게
  React.useEffect(() => setPending(null), [likes.length, on]);
  const shownOn = pending ?? on;
  const n = likes.length + (pending === null ? 0 : pending && !on ? 1 : !pending && on ? -1 : 0);
  const toggle = async () => {
    if (!me?.uid || disabled || !post?.id) return;
    setPending(!on);
    try { await updateDoc(doc(db, col, post.id), { likes: on ? arrayRemove(me.uid) : arrayUnion(me.uid) }); }
    catch (e) { setPending(null); window.alert(`좋아요 실패: ${e.message}`); }
  };
  return (
    <button type="button" onClick={toggle} disabled={disabled} aria-pressed={shownOn} data-post-like
      className={`h-10 pl-3.5 pr-4 rounded-2xl border inline-flex items-center gap-2 text-[13px] font-black transition active:scale-95 disabled:opacity-50 ${shownOn ? "bg-[#0F1A30] border-[#0F1A30] text-white shadow-[0_8px_18px_rgba(15,26,48,0.22)]" : "bg-white border-[#DCE3EE] text-[#1B2B4B] hover:border-[#8FB0F0] hover:bg-[#F5F8FD]"}`}>
      <span className={shownOn ? "text-[#8FB0F0]" : "text-[#4B6CB7]"}><HeartIcon size={16} filled={shownOn} /></span>
      좋아요<span className="tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{n}</span>
    </button>
  );
}

// 댓글 묶음 전체(목록 + 입력)
export default function PostComments({ col, post, me, readOnly = false }) {
  const all = React.useMemo(() => (Array.isArray(post?.comments) ? post.comments.filter(Boolean) : []), [post?.comments]);
  const admin = ADMIN_ROLES.includes(me?.role);
  const [replyTo, setReplyTo] = React.useState(null); // 원 댓글 id
  const [editing, setEditing] = React.useState(null); // 댓글 id
  const ref = doc(db, col, post.id);
  const ids = new Set(all.map((c) => c.id));
  const roots = all.filter((c) => !c.parentId || !ids.has(c.parentId)).sort((a, b) => (a.at || 0) - (b.at || 0));
  const kids = (id) => all.filter((c) => c.parentId === id).sort((a, b) => (a.at || 0) - (b.at || 0));
  const total = commentCount(post);
  const full = all.length >= COMMENT_CAP;

  // 배열 전체를 바꾸는 일(수정·삭제·댓글 좋아요)은 최신 문서를 읽고 바꾼다 — 동시에 단 댓글이 사라지지 않게
  const mutate = async (fn) => {
    try {
      await runTransaction(db, async (tx) => {
        const s = await tx.get(ref);
        const list = Array.isArray(s.data()?.comments) ? s.data().comments.filter(Boolean) : [];
        tx.update(ref, { comments: fn(list) });
      });
      return true;
    } catch (e) { window.alert(`저장 실패: ${e.message}`); return false; }
  };
  const add = async (text, parentId) => {
    if (all.length >= COMMENT_CAP) { window.alert(`이 글은 댓글이 ${COMMENT_CAP}개로 가득 찼습니다. 새 글로 이어서 남겨 주세요.`); return false; }
    const c = { id: newId(), uid: me.uid, name: me.name || "", position: me.position || "", text, at: Date.now(), likes: [], ...(parentId ? { parentId } : {}) };
    try { await updateDoc(ref, { comments: arrayUnion(c) }); } catch (e) { window.alert(`댓글 등록 실패: ${e.message}`); return false; }
    if (parentId) setReplyTo(null);
    return true;
  };
  const edit = async (c, text) => { const ok = await mutate((l) => l.map((x) => (x.id === c.id ? { ...x, text, editedAt: Date.now() } : x))); if (ok) setEditing(null); return ok; };
  const remove = async (c) => {
    if (!await kpConfirm(c.parentId ? "답글을 지울까요?" : "댓글을 지울까요?")) return;
    await mutate((l) => {
      const hasKids = l.some((x) => x.parentId === c.id && !x.deleted);
      if (hasKids) return l.map((x) => (x.id === c.id ? { ...x, text: "", deleted: true, likes: [] } : x));
      // 답글을 지워서 원 댓글(이미 지운 것)만 남으면 같이 정리
      const out = l.filter((x) => x.id !== c.id);
      return out.filter((x) => !(x.deleted && x.id === c.parentId && !out.some((y) => y.parentId === x.id)));
    });
  };
  const toggleLike = (c) => mutate((l) => l.map((x) => {
    if (x.id !== c.id) return x;
    const lk = Array.isArray(x.likes) ? x.likes : [];
    return { ...x, likes: lk.includes(me.uid) ? lk.filter((u) => u !== me.uid) : [...lk, me.uid] };
  }));

  // 함수로 그린다(안쪽 컴포넌트로 두면 글이 바뀔 때마다 새로 만들어져 수정 중 입력이 지워짐)
  const renderItem = (c, reply) => {
    const mine = c.uid === me?.uid;
    const lk = Array.isArray(c.likes) ? c.likes : [];
    const liked = lk.includes(me?.uid);
    if (c.deleted) return <div className={`text-[13px] text-[#A6B2C6] italic ${reply ? "py-1.5" : "py-2"}`}>삭제된 댓글입니다</div>;
    return (
      <div className="flex gap-2.5 group" data-comment={c.id}>
        <span className={`${reply ? "w-7 h-7 rounded-lg text-[11px]" : "w-9 h-9 rounded-xl text-[12.5px]"} shrink-0 text-white font-black flex items-center justify-center`}
          style={{ background: mine ? "linear-gradient(135deg,#2D4C82,#4B6CB7)" : "linear-gradient(135deg,#0F1A30,#1B2B4B)" }}>{String(c.name || "?").slice(0, 1)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-0.5">
            <b className="text-[13.5px] font-black text-[#0F1A30]">{c.name || "-"}</b>
            {c.position && <span className="text-[12px] font-semibold text-[#7A879C]">{c.position}</span>}
            {post.authorUid && c.uid === post.authorUid && <span className="px-1.5 py-px rounded-md bg-[#EEF3FC] text-[#2D4C82] text-[10px] font-black" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>작성자</span>}
            <span className="text-[11.5px] text-[#9AA9C3] tabular-nums">{ago(c.at)}</span>
            {c.editedAt && <span className="text-[11px] text-[#A6B2C6]">(수정됨)</span>}
          </div>
          {editing === c.id ? (
            <div className="mt-1.5"><Composer me={me} compact autoFocus initial={c.text} submitLabel="수정" onSubmit={(t) => edit(c, t)} onCancel={() => setEditing(null)} /></div>
          ) : (
            <div className="mt-0.5 text-[14px] leading-[1.7] text-[#1F2A44] whitespace-pre-wrap break-words">{c.text}</div>
          )}
          {editing !== c.id && (
            <div className="mt-1 flex items-center gap-0.5 -ml-1.5">
              <button type="button" disabled={readOnly} onClick={() => toggleLike(c)} aria-pressed={liked} data-comment-like
                className={`h-7 px-1.5 rounded-lg inline-flex items-center gap-1 text-[12px] font-bold transition disabled:opacity-50 ${liked ? "text-[#2D4C82]" : "text-[#7A879C] hover:bg-[#F3F6FB]"}`}>
                <HeartIcon size={13} filled={liked} />{lk.length > 0 && <span className="tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{lk.length}</span>}
              </button>
              {!readOnly && <button type="button" onClick={() => { setReplyTo(c.parentId && ids.has(c.parentId) ? c.parentId : c.id); setEditing(null); }} className="h-7 px-2 rounded-lg inline-flex items-center gap-1 text-[12px] font-bold text-[#7A879C] hover:bg-[#F3F6FB]"><ReplyIcon />답글</button>}
              {mine && !readOnly && <button type="button" onClick={() => { setEditing(c.id); setReplyTo(null); }} className="h-7 px-2 rounded-lg text-[12px] font-bold text-[#7A879C] hover:bg-[#F3F6FB]">수정</button>}
              {(mine || admin) && !readOnly && <button type="button" onClick={() => remove(c)} className="h-7 px-2 rounded-lg text-[12px] font-bold text-[#9AA9C3] hover:bg-[#F3F6FB] hover:text-[#0F1A30]">삭제</button>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 sm:px-8 py-5 sm:py-6 bg-[#F8FAFD] border-t border-[#EEF1F6]" data-post-comments>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0] px-2 py-1 rounded-lg bg-[#0F1A30]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>COMMENTS</span>
        <span className="text-[15px] font-black text-[#0F1A30]">댓글 <span className="tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{total}</span></span>
        {all.length >= COMMENT_WARN && <span className="ml-auto text-[11.5px] font-bold text-[#B54708]">댓글 {all.length}/{COMMENT_CAP} — {full ? "가득 찼습니다" : "곧 가득 찹니다"}</span>}
      </div>
      {roots.length > 0 && (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] divide-y divide-[#F1F4F9] mb-4">
          {roots.map((c) => {
            const rs = kids(c.id);
            return (
              <div key={c.id} className="px-3.5 sm:px-4 py-3.5">
                {renderItem(c, false)}
                {(rs.length > 0 || replyTo === c.id) && (
                  <div className="mt-2.5 ml-[18px] pl-[26px] sm:ml-5 sm:pl-6 border-l-2 border-[#E6ECF5] space-y-3">
                    {rs.map((r) => <React.Fragment key={r.id}>{renderItem(r, true)}</React.Fragment>)}
                    {replyTo === c.id && (
                      <Composer me={me} compact autoFocus placeholder={`${c.deleted ? "" : `${c.name || ""}님에게 `}답글 남기기`} submitLabel="답글" disabled={full}
                        onSubmit={(t) => add(t, c.id)} onCancel={() => setReplyTo(null)} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!roots.length && <div className="mb-4 py-6 text-center text-[13px] font-bold text-[#A6B2C6]">아직 댓글이 없습니다. 첫 댓글을 남겨 보세요.</div>}
      {!readOnly && <Composer me={me} disabled={full} placeholder={full ? `댓글이 ${COMMENT_CAP}개로 가득 찼습니다` : "댓글을 남겨 주세요"} onSubmit={(t) => add(t)} />}
    </div>
  );
}
