// ======================= src/BoardPosts.jsx =======================
// 🗂 사내 게시판(2026-10-28) — 자유게시판 · 관리자게시판 · 임원게시판
//  boardPosts/{id}: { company, board(free|admin|exec), title, content, images, pinned, authorUid, authorName, authorPosition,
//                     createdAt, updatedAt, readBy:[uid], comments:[{ id, uid, name, text, at }] }
//  - 관리자게시판: 관리자·최고관리자·인사관리자 / 임원게시판: 권한 설정 전까지 최고관리자만 — 보안규칙도 같은 기준
//  - 글쓴이·관리자는 수정·삭제, 관리자는 상단 고정. 댓글, 조회수(읽은 사람 수), 새 글 N 표시.
import React from "react";
import { db } from "./firebase";
import { collection, doc, onSnapshot, query, where, addDoc, updateDoc, deleteDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { ShellIcon } from "./AdminShell";
import { compressImage } from "./InternalMail";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const toMs = (v) => (v?.toMillis ? v.toMillis() : typeof v === "number" ? v : v?.seconds ? v.seconds * 1000 : 0);
const fmt = (ms, full) => {
  if (!ms) return "";
  const d = new Date(ms);
  if (!full && d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString("ko-KR", full ? { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" } : { year: "2-digit", month: "2-digit", day: "2-digit" });
};

export const BOARDS = {
  free: { label: "자유게시판", en: "FREE BOARD", icon: "chat", desc: "업무 팁 · 맛집 · 사는 이야기 — 누구나 자유롭게" },
  admin: { label: "관리자게시판", en: "MANAGERS", icon: "shield", desc: "관리자만 보는 운영 논의 공간" },
  exec: { label: "임원게시판", en: "EXECUTIVE", icon: "key", desc: "임원 전용 — 권한 설정 전까지 최고관리자만 보입니다" },
};
const isAdminRole = (r) => ["admin", "totalMaster", "hrManager"].includes(r);
// ⭐ 2026-10-28: 임원게시판 권한(임원 직책 기준)은 아직 정하지 않아 최고관리자만 보이게 둔다 — 추후 설정
export function canSeeBoard(board, me) {
  if (board === "free") return true;
  if (board === "admin") return isAdminRole(me?.role);
  if (board === "exec") return me?.role === "totalMaster";
  return false;
}

// 게시판별 최신 글 시각(내가 쓴 글 제외) — 사이드바 N 표시용
export function useBoardLatest(company, me) {
  const [latest, setLatest] = React.useState({});
  const boards = Object.keys(BOARDS).filter((b) => canSeeBoard(b, me)).join(",");
  React.useEffect(() => {
    if (!company || !me?.uid) return undefined;
    const unsubs = boards.split(",").filter(Boolean).map((b) => onSnapshot(query(collection(db, "boardPosts"), where("company", "==", company), where("board", "==", b)), (s) => {
      const mx = s.docs.reduce((m, d) => { const x = d.data(); return x.authorUid === me.uid ? m : Math.max(m, toMs(x.createdAt)); }, 0);
      setLatest((p) => ({ ...p, [b]: mx }));
    }, () => {}));
    return () => unsubs.forEach((u) => u());
  }, [company, me?.uid, boards]);
  return latest;
}

const inp = "w-full px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] text-[#0F1A30] outline-none focus:border-[#4B6CB7]";
const PAGE = 15;

export default function BoardPage({ company, me, board }) {
  const B = BOARDS[board];
  const [posts, setPosts] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [openId, setOpenId] = React.useState(null);
  const [form, setForm] = React.useState(null); // { id?, title, content, images, pinned }
  const [busy, setBusy] = React.useState(false);
  const [cmt, setCmt] = React.useState("");
  const fileRef = React.useRef(null);
  const admin = isAdminRole(me.role);

  React.useEffect(() => {
    setOpenId(null); setForm(null); setPage(1); setQ("");
    if (!company || !canSeeBoard(board, me)) { setPosts([]); return undefined; }
    return onSnapshot(query(collection(db, "boardPosts"), where("company", "==", company), where("board", "==", board)),
      (s) => setPosts(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setPosts([]));
  }, [company, board]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = React.useMemo(() => {
    const kw = q.trim();
    return (posts || []).filter((p) => !kw || [p.title, p.content, p.authorName].some((v) => String(v || "").includes(kw)))
      .sort((a, b) => (!!b.pinned - !!a.pinned) || toMs(b.createdAt) - toMs(a.createdAt));
  }, [posts, q]);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const shown = sorted.slice((page - 1) * PAGE, page * PAGE);
  const cur = openId ? (posts || []).find((p) => p.id === openId) : null;

  React.useEffect(() => {
    if (cur && !(cur.readBy || []).includes(me.uid)) updateDoc(doc(db, "boardPosts", cur.id), { readBy: arrayUnion(me.uid) }).catch(() => {});
  }, [cur, me.uid]);

  if (!canSeeBoard(board, me)) return <div className="py-20 text-center text-[14px] text-[#9AA9C3]">이 게시판을 볼 권한이 없습니다.</div>;

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) { window.alert("제목과 내용을 입력해 주세요."); return; }
    setBusy(true);
    try {
      const data = { title: form.title.trim().slice(0, 200), content: form.content.slice(0, 20000), images: form.images || [], pinned: admin ? !!form.pinned : !!form.pinnedOrig, updatedAt: serverTimestamp() };
      if (form.id) await updateDoc(doc(db, "boardPosts", form.id), data);
      else {
        const ref = await addDoc(collection(db, "boardPosts"), { ...data, company, board, authorUid: me.uid, authorName: me.name, authorPosition: me.position || "", createdAt: serverTimestamp(), readBy: [me.uid], comments: [] });
        setOpenId(ref.id);
      }
      setForm(null);
    } catch (e) { window.alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const remove = async (p) => {
    if (!window.confirm("이 글을 삭제할까요?")) return;
    await deleteDoc(doc(db, "boardPosts", p.id)).catch((e) => window.alert(e.message));
    setOpenId(null);
  };
  const addComment = async () => {
    if (!cmt.trim() || !cur) return;
    const c = { id: Math.random().toString(36).slice(2, 10), uid: me.uid, name: me.name, position: me.position || "", text: cmt.trim().slice(0, 2000), at: Date.now() };
    await updateDoc(doc(db, "boardPosts", cur.id), { comments: arrayUnion(c) }).catch((e) => window.alert(e.message));
    setCmt("");
  };
  const delComment = async (c) => {
    if (!window.confirm("댓글을 지울까요?")) return;
    await updateDoc(doc(db, "boardPosts", cur.id), { comments: (cur.comments || []).filter((x) => x.id !== c.id) }).catch((e) => window.alert(e.message));
  };
  const isNew = (p) => Date.now() - toMs(p.createdAt) < 24 * 3600e3;

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[22px] px-7 py-5 text-white flex items-center justify-between gap-4 flex-wrap shadow-[0_14px_32px_rgba(15,26,48,0.25)]"
        style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div>
          <div className="text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>BOARD · {B.en}</div>
          <div className="text-[24px] font-black mt-0.5">{B.label}</div>
          <div className="text-[13px] text-white/60 mt-0.5">{B.desc}</div>
        </div>
        <div className="flex items-center gap-2.5">
          {[["전체 글", (posts || []).length], ["오늘 새 글", (posts || []).filter(isNew).length]].map(([l, v]) => (
            <div key={l} className="min-w-[96px] px-4 py-2.5 rounded-2xl bg-white/[0.07] border border-white/10">
              <div className="text-[11.5px] font-bold text-white/55">{l}</div>
              <div className="text-[20px] font-black tabular-nums" style={{ fontFamily: MONO }}>{v}</div>
            </div>
          ))}
          <button type="button" onClick={() => { setForm({ title: "", content: "", images: [], pinned: false }); setOpenId(null); }} className="h-11 px-5 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black inline-flex items-center gap-2 shadow-[0_8px_18px_rgba(0,0,0,0.25)]"><ShellIcon name="pen" size={15} />글쓰기</button>
        </div>
      </div>

      {form ? (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] p-6 space-y-3.5">
          <div className="text-[17px] font-black text-[#0F1A30]">{form.id ? "글 수정" : `${B.label} 글쓰기`}</div>
          <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="제목" className={`${inp} h-12 text-[15.5px] font-bold`} />
          <textarea value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} rows={12} placeholder="내용을 입력하세요" className={`${inp} py-3 leading-[1.8] resize-y`} />
          <div className="flex flex-wrap items-center gap-2">
            {(form.images || []).map((src, i) => (
              <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-[#E3E8F0]">
                <img src={src} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setForm((p) => ({ ...p, images: p.images.filter((_, k) => k !== i) }))} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-[#0F1A30]/80 text-white text-[12px]">✕</button>
              </div>
            ))}
            {(form.images || []).length < 3 && <button type="button" onClick={() => fileRef.current?.click()} className="w-20 h-20 rounded-xl border-2 border-dashed border-[#C9D2E0] text-[#7A879C] text-[12px] font-bold">+ 사진</button>}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={async (e) => { const fs = [...(e.target.files || [])].slice(0, 3 - (form.images || []).length); e.target.value = ""; const out = await Promise.all(fs.map((f) => compressImage(f, 1200, 0.75))).catch(() => []); setForm((p) => ({ ...p, images: [...(p.images || []), ...out].slice(0, 3) })); }} />
            {admin && <label className="ml-auto flex items-center gap-2 text-[13px] font-bold text-[#0F1A30]"><input type="checkbox" checked={!!form.pinned} onChange={(e) => setForm((p) => ({ ...p, pinned: e.target.checked }))} className="w-4 h-4 accent-[#1B2B4B]" />상단 고정</label>}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className="h-11 px-5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-bold text-[#5B6B85]">취소</button>
            <button type="button" onClick={save} disabled={busy} className="h-11 px-7 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-50">{busy ? "저장 중…" : form.id ? "수정" : "등록"}</button>
          </div>
        </div>
      ) : cur ? (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
          <div className="px-7 py-5 border-b border-[#EEF1F6]">
            <button type="button" onClick={() => setOpenId(null)} className="text-[13px] font-bold text-[#4B6CB7] mb-2">← 목록</button>
            <div className="flex items-start gap-2">
              {cur.pinned && <span className="mt-1 text-[11px] font-black px-2 py-0.5 rounded bg-[#0F1A30] text-white shrink-0">고정</span>}
              <h2 className="flex-1 text-[22px] font-black text-[#0F1A30] leading-snug break-words">{cur.title}</h2>
            </div>
            <div className="mt-3 flex items-center gap-3 text-[13px]">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}>{String(cur.authorName || "?").slice(0, 1)}</span>
              <div><div className="font-black text-[#0F1A30]">{cur.authorName} <span className="font-semibold text-[#7A879C]">{cur.authorPosition}</span></div><div className="text-[12px] text-[#9AA9C3]">{fmt(toMs(cur.createdAt), true)} · 조회 {(cur.readBy || []).length}</div></div>
              {(cur.authorUid === me.uid || admin) && (
                <div className="ml-auto flex gap-1.5">
                  {admin && <button type="button" onClick={() => updateDoc(doc(db, "boardPosts", cur.id), { pinned: !cur.pinned })} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-bold text-[#3A4A66]">{cur.pinned ? "고정 해제" : "상단 고정"}</button>}
                  {cur.authorUid === me.uid && <button type="button" onClick={() => setForm({ id: cur.id, title: cur.title, content: cur.content, images: cur.images || [], pinned: !!cur.pinned, pinnedOrig: !!cur.pinned })} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-bold text-[#3A4A66]">수정</button>}
                  <button type="button" onClick={() => remove(cur)} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-bold text-[#7A879C]">삭제</button>
                </div>
              )}
            </div>
          </div>
          <div className="px-7 py-6 space-y-4">
            <div className="text-[15px] text-[#1F2A44] leading-[1.9] whitespace-pre-wrap break-words">{cur.content}</div>
            {(cur.images || []).map((src, i) => <img key={i} src={src} alt="" className="max-w-full max-h-[560px] rounded-xl border border-[#E3E8F0]" />)}
          </div>
          <div className="px-7 py-5 bg-[#F8FAFD] border-t border-[#EEF1F6]">
            <div className="text-[13.5px] font-black text-[#0F1A30] mb-3">댓글 {(cur.comments || []).length}</div>
            <div className="space-y-2.5 mb-3">
              {(cur.comments || []).map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-black flex items-center justify-center shrink-0">{String(c.name || "?").slice(0, 1)}</span>
                  <div className="flex-1 min-w-0 bg-white rounded-xl border border-[#E3E8F0] px-3.5 py-2">
                    <div className="text-[12.5px]"><b className="text-[#0F1A30]">{c.name}</b> <span className="text-[#7A879C]">{c.position}</span> <span className="text-[11.5px] text-[#9AA9C3] ml-1">{fmt(c.at)}</span>
                      {(c.uid === me.uid || admin) && <button type="button" onClick={() => delComment(c)} className="ml-2 text-[11.5px] text-[#9AA9C3] hover:text-[#0F1A30]">삭제</button>}
                    </div>
                    <div className="text-[13.5px] text-[#1F2A44] whitespace-pre-wrap break-words mt-0.5">{c.text}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <textarea value={cmt} onChange={(e) => setCmt(e.target.value)} rows={2} placeholder="댓글을 남겨 주세요" className={`${inp} py-2 flex-1 resize-none`} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addComment(); }} />
              <button type="button" onClick={addComment} disabled={!cmt.trim()} className="w-20 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black disabled:opacity-40">등록</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#EEF1F6] flex items-center gap-3">
            <div className="relative flex-1 max-w-[360px]">
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="제목·내용·작성자 검색" className={`${inp} h-10 pl-9 bg-[#F8FAFD]`} />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA9C3]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </div>
            <span className="ml-auto text-[12.5px] font-bold text-[#9AA9C3]">{sorted.length}개의 글</span>
          </div>
          <div className="flex px-5 h-10 items-center bg-[#F8FAFD] border-b border-[#EEF1F6] text-[12px] font-black text-[#7A879C]">
            <span className="w-14 text-center">번호</span><span className="flex-1">제목</span><span className="w-32">작성자</span><span className="w-24 text-center">날짜</span><span className="w-14 text-center">조회</span>
          </div>
          {posts === null ? <div className="py-16 text-center text-[13.5px] text-[#9AA9C3]">불러오는 중…</div> : !shown.length ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F5F8FD] flex items-center justify-center text-[#9AA9C3]"><ShellIcon name={B.icon} size={24} /></div>
              <div className="mt-3 text-[13.5px] font-bold text-[#9AA9C3]">{q ? "검색 결과가 없습니다" : "첫 글을 남겨 보세요"}</div>
            </div>
          ) : shown.map((p, i) => {
            const unread = !(p.readBy || []).includes(me.uid);
            return (
              <button key={p.id} type="button" onClick={() => setOpenId(p.id)} className={`w-full flex px-5 h-[52px] items-center border-b border-[#F1F4F9] text-left hover:bg-[#F8FAFD] ${p.pinned ? "bg-[#F5F8FD]" : ""}`}>
                <span className="w-14 text-center text-[12.5px] text-[#9AA9C3] tabular-nums">{p.pinned ? <span className="text-[11px] font-black px-1.5 py-0.5 rounded bg-[#0F1A30] text-white">고정</span> : sorted.length - ((page - 1) * PAGE + i)}</span>
                <span className="flex-1 min-w-0 flex items-center gap-1.5">
                  <span className={`truncate text-[14px] ${unread ? "font-black text-[#0F1A30]" : "font-semibold text-[#3A4A66]"}`}>{p.title}</span>
                  {(p.comments || []).length > 0 && <span className="text-[12px] font-black text-[#4B6CB7]">[{p.comments.length}]</span>}
                  {(p.images || []).length > 0 && <span className="text-[11px] text-[#9AA9C3]">📷</span>}
                  {isNew(p) && <span className="w-[18px] h-[18px] rounded-full bg-[#1B2B4B] text-white text-[10px] font-black flex items-center justify-center">N</span>}
                </span>
                <span className="w-32 truncate text-[13px] font-bold text-[#3A4A66]">{p.authorName} <span className="font-semibold text-[#9AA9C3]">{p.authorPosition}</span></span>
                <span className="w-24 text-center text-[12.5px] text-[#7A879C] tabular-nums">{fmt(toMs(p.createdAt))}</span>
                <span className="w-14 text-center text-[12.5px] text-[#7A879C] tabular-nums">{(p.readBy || []).length}</span>
              </button>
            );
          })}
          {pages > 1 && (
            <div className="flex justify-center gap-1 py-3">
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => <button key={n} type="button" onClick={() => setPage(n)} className={`w-8 h-8 rounded-lg text-[12.5px] font-black ${n === page ? "bg-[#0F1A30] text-white" : "text-[#5B6B85] hover:bg-[#F5F8FD]"}`}>{n}</button>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
