// ======================= pnk-site/src/pages/Board.jsx =======================
// 사내 공지(mode="notice") · 게시판/회의록(mode="board")
//  공지는 대표 · 관리자만 쓴다. 공지는 읽음 확인(readBy)으로 누가 읽었는지 보인다.
import React from "react";
import { useSearchParams } from "react-router-dom";
import { useMeCtx } from "../App";
import { addRow, by, fmtTime, limit, orderBy, patchRow, removeRow, useCol, where } from "../pnkApi";
import { Btn, Card, Chip, Empty, Field, Hero, HeroBtn, Input, Loading, Modal, Tabs, Textarea, cx, fail } from "../ui";
import Icon from "../icons";

export default function Board({ mode }) {
  const me = useMeCtx();
  const uid = me.user.uid;
  const [sp, setSp] = useSearchParams();
  const openId = sp.get("id");
  const [tab, setTab] = React.useState(mode === "notice" ? "notice" : "free");
  React.useEffect(() => setTab(mode === "notice" ? "notice" : "free"), [mode]);
  const board = mode === "notice" ? "notice" : tab;
  const [rows] = useCol("pnkPosts", [where("board", "==", board), orderBy("createdAt", "desc"), limit(200)], [board]);
  const [members] = useCol("pnkMembers", [where("status", "==", "active")], []);
  const [q, setQ] = React.useState("");
  const [edit, setEdit] = React.useState(null); // null | {} (새 글) | post
  const canWrite = board !== "notice" || me.isAdmin;

  const list = (rows || [])
    .filter((p) => !q || `${p.title} ${p.body} ${p.authorName}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const cur = openId ? (rows || []).find((p) => p.id === openId) : null;

  // 읽음 표시
  React.useEffect(() => {
    if (cur && !cur.readBy?.[uid] && cur.authorUid !== uid) patchRow("pnkPosts", cur.id, { [`readBy.${uid}`]: Date.now() }).catch(() => {});
  }, [cur, uid]);

  return (
    <div>
      <Hero en={mode === "notice" ? "NOTICE" : "BOARD"} title={mode === "notice" ? "사내 공지" : "게시판 · 회의록"}
        desc={mode === "notice" ? "회사 전체에 알릴 내용 — 누가 읽었는지 확인할 수 있습니다." : "자유롭게 의견을 나누고, 회의 내용은 회의록에 남겨 주세요."}>
        {canWrite && <HeroBtn icon="pen" onClick={() => setEdit({})}>{mode === "notice" ? "공지 쓰기" : "글쓰기"}</HeroBtn>}
      </Hero>

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-1">
        {mode === "board" ? <Tabs items={[{ key: "free", label: "자유게시판" }, { key: "minutes", label: "회의록" }]} value={tab} onChange={(k) => { setTab(k); setSp({}); }} /> : <div className="flex-1" />}
        <div className="md:ml-auto relative md:w-[300px] mb-4">
          <Icon name="search" size={16} className="absolute left-3 top-3 text-[#7A8AA8]" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목 · 내용 · 작성자 검색" className="pl-9" />
        </div>
      </div>

      <div className={cx("grid gap-4 md:gap-5", cur ? "lg:grid-cols-[minmax(0,420px)_1fr]" : "")}>
        <Card pad={false} className={cur ? "hidden lg:block" : ""}>
          {!rows ? <Loading /> : list.length === 0 ? <Empty icon="megaphone">{q ? "검색 결과가 없습니다." : "아직 글이 없습니다."}</Empty> : (
            <ul className="divide-y divide-[#EEF1F6]">
              {list.map((p) => {
                const isNew = !p.readBy?.[uid] && p.authorUid !== uid;
                const readCnt = Object.keys(p.readBy || {}).length;
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => setSp({ id: p.id })} className={cx("w-full text-left px-5 py-3.5 hover:bg-navy-50 flex gap-3", p.id === openId && "bg-navy-50")}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {p.pinned && <Chip tone="dark">고정</Chip>}
                          {isNew && <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] shrink-0" />}
                          <span className={cx("truncate text-[14.5px]", isNew ? "font-black" : "font-bold text-[#22304D]")}>{p.title}</span>
                        </div>
                        <div className="mt-0.5 text-[12.5px] text-[#7A8AA8] truncate">{String(p.body || "").slice(0, 80)}</div>
                        <div className="mt-1 text-[11.5px] text-[#7A8AA8]">{p.authorName} · {fmtTime(p.createdAt)}{board === "notice" ? ` · 읽음 ${readCnt}` : ""}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {cur && <PostView post={cur} me={me} members={members || []} onClose={() => setSp({})} onEdit={() => setEdit(cur)} />}
      </div>

      {edit && <PostEditor board={board} post={edit.id ? edit : null} me={me} onClose={() => setEdit(null)} onSaved={(id) => { setEdit(null); setSp({ id }); }} />}
    </div>
  );
}

function PostView({ post, me, members, onClose, onEdit }) {
  const uid = me.user.uid;
  const [comments] = useCol(`pnkPosts/${post.id}/comments`, [orderBy("createdAt")], [post.id]);
  const [text, setText] = React.useState("");
  const mine = post.authorUid === uid || me.isAdmin;
  const send = () => {
    if (!text.trim()) return;
    const b = by(me);
    addRow(`pnkPosts/${post.id}/comments`, { body: text.trim(), authorUid: b.uid, authorName: b.name }).then(() => setText("")).catch(fail);
  };
  const del = () => { if (window.confirm("이 글을 지울까요?")) removeRow("pnkPosts", post.id).then(onClose).catch(fail); };
  const readers = members.filter((m) => post.readBy?.[m.uid]);
  const notYet = members.filter((m) => !post.readBy?.[m.uid] && m.uid !== post.authorUid);
  return (
    <Card pad={false}>
      <div className="px-5 md:px-7 pt-5 pb-4 border-b border-[#EEF1F6]">
        <button type="button" onClick={onClose} className="lg:hidden mb-3 text-[13px] font-bold text-navy-500">← 목록</button>
        <div className="flex items-start gap-3">
          <h2 className="flex-1 text-[20px] font-black text-navy-950 leading-snug">{post.title}</h2>
          {mine && <div className="flex gap-1.5 shrink-0">
            {me.isAdmin && <Btn kind="ghost" onClick={() => patchRow("pnkPosts", post.id, { pinned: !post.pinned }).catch(fail)}>{post.pinned ? "고정 해제" : "위에 고정"}</Btn>}
            <Btn kind="ghost" icon="pen" onClick={onEdit}>고치기</Btn>
            <Btn kind="danger" icon="trash" onClick={del} />
          </div>}
        </div>
        <div className="mt-1.5 text-[12.5px] text-[#7A8AA8]">{post.authorName} · {fmtTime(post.createdAt)}{post.updatedAt && post.updatedAt?.seconds !== post.createdAt?.seconds ? " · 수정됨" : ""}</div>
      </div>
      <div className="px-5 md:px-7 py-5 text-[15px] leading-[1.8] whitespace-pre-wrap break-words text-[#1A2740]">{post.body}</div>
      {post.board === "notice" && (
        <div className="mx-5 md:mx-7 mb-5 rounded-2xl bg-navy-50 px-4 py-3">
          <div className="text-[12.5px] font-black text-navy mb-1.5">읽음 확인 {readers.length} / {readers.length + notYet.length}</div>
          <div className="flex flex-wrap gap-1.5">
            {readers.map((m) => <Chip key={m.uid}>{m.name}</Chip>)}
            {notYet.map((m) => <Chip key={m.uid} tone="gray">{m.name} · 안 읽음</Chip>)}
          </div>
        </div>
      )}
      <div className="border-t border-[#EEF1F6] px-5 md:px-7 py-4">
        <div className="text-[13px] font-black mb-3">댓글 {(comments || []).length}</div>
        <ul className="space-y-3 mb-3">
          {(comments || []).map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <div className="w-8 h-8 rounded-full bg-navy-100 text-navy text-[12px] font-black flex items-center justify-center shrink-0">{(c.authorName || "?").slice(0, 1)}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px]"><b>{c.authorName}</b> <span className="text-[#7A8AA8]">{fmtTime(c.createdAt)}</span>
                  {(c.authorUid === uid || me.isAdmin) && <button type="button" onClick={() => removeRow(`pnkPosts/${post.id}/comments`, c.id).catch(fail)} className="ml-2 text-[11.5px] text-[#7A8AA8] hover:text-rose-600">지우기</button>}</div>
                <div className="text-[14px] whitespace-pre-wrap break-words">{c.body}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) send(); }} placeholder="댓글 달기" />
          <Btn onClick={send}>등록</Btn>
        </div>
      </div>
    </Card>
  );
}

function PostEditor({ board, post, me, onClose, onSaved }) {
  const [f, setF] = React.useState({ title: post?.title || "", body: post?.body || "", pinned: !!post?.pinned });
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    if (!f.title.trim()) { window.alert("제목을 입력해 주세요."); return; }
    setBusy(true);
    try {
      if (post) { await patchRow("pnkPosts", post.id, { title: f.title.trim(), body: f.body, pinned: f.pinned }); onSaved(post.id); }
      else {
        const b = by(me);
        const r = await addRow("pnkPosts", { board, title: f.title.trim(), body: f.body, pinned: me.isAdmin && f.pinned, authorUid: b.uid, authorName: b.name, readBy: {} });
        onSaved(r.id);
      }
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <Modal open wide title={post ? "글 고치기" : board === "notice" ? "공지 쓰기" : board === "minutes" ? "회의록 쓰기" : "글쓰기"} onClose={onClose}
      footer={<><Btn kind="ghost" onClick={onClose}>취소</Btn><Btn onClick={save} disabled={busy}>{busy ? "저장 중…" : "올리기"}</Btn></>}>
      <div className="space-y-3">
        <Field label="제목"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></Field>
        <Field label="내용"><Textarea rows={14} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })}
          placeholder={board === "minutes" ? "일시 · 참석자\n\n1. 안건\n2. 결정 사항\n3. 다음 할 일(담당 · 기한)" : ""} /></Field>
        {me.isAdmin && <label className="flex items-center gap-2 text-[13px] font-bold"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> 목록 맨 위에 고정</label>}
      </div>
    </Modal>
  );
}
